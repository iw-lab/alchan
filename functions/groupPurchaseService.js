/* eslint-disable */
/* eslint-disable max-len */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin, logger, logActivity, LOG_TYPES, checkAuthAndGetUserData } = require("./utils");

// 정상 상점과 동일한 정책
const WHOLESALE_COST_RATIO = 0.3; // 재고 보충 도매가 = 정가의 30%

/**
 * 함께구매 완료 처리 (서버사이드)
 *
 * 클라이언트는 기여 트랜잭션으로 cash 차감 + campaign.currentAmount 갱신만 처리.
 * 목표 달성 시 이 함수를 호출하여 다음을 원자적으로 수행:
 *   1. 아이템 지급 (winner 인벤토리)
 *   2. 모금액을 관리자 cash에 입금 (학생들이 낸 돈이 관리자에게)
 *   3. storeItems 재고 차감, 품절 시 자동 보충 + 가격 인상
 *   4. 재고 보충 시 관리자에게 도매가(30%) 차감
 *   5. VAT 처리 (treasury 기록)
 *   6. activity_logs 기록 (winner + admin)
 *
 * 멱등성: campaign.awardedAt 플래그로 중복 실행 차단
 */
exports.completeGroupPurchase = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode: callerClassCode } = await checkAuthAndGetUserData(request);
    const { campaignId } = request.data || {};

    if (!campaignId || typeof campaignId !== "string") {
      throw new HttpsError("invalid-argument", "campaignId가 필요합니다.");
    }

    const campaignRef = db.collection("groupPurchases").doc(campaignId);

    // 관리자 찾기
    let adminRef = null;
    try {
      const adminSnapshot = await db
        .collection("users")
        .where("classCode", "==", callerClassCode)
        .where("isAdmin", "==", true)
        .limit(1)
        .get();
      if (!adminSnapshot.empty) {
        adminRef = adminSnapshot.docs[0].ref;
      }
    } catch (e) {
      logger.warn("[completeGroupPurchase] 관리자 조회 실패:", e.message);
    }

    // VAT 세율
    let itemStoreVATRate = 0.1;
    try {
      const govDoc = await db.doc(`governments/${callerClassCode}`).get();
      if (govDoc.exists) {
        const rate = govDoc.data()?.taxSettings?.itemStoreVATRate;
        if (rate !== undefined) itemStoreVATRate = rate;
      }
    } catch (e) {
      logger.warn("[completeGroupPurchase] VAT 조회 실패, 기본 10%:", e.message);
    }

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1) 캠페인 읽기
        const campaignSnap = await transaction.get(campaignRef);
        if (!campaignSnap.exists) {
          throw new HttpsError("not-found", "캠페인을 찾을 수 없습니다.");
        }
        const cData = campaignSnap.data();

        // 검증: 같은 학급
        if (cData.classCode !== callerClassCode) {
          throw new HttpsError("permission-denied", "다른 학급의 캠페인입니다.");
        }
        // 검증: 완료 상태
        if (cData.status !== "completed") {
          throw new HttpsError("failed-precondition", "캠페인이 아직 완료되지 않았습니다.");
        }
        // 멱등성: 이미 처리되었으면 성공으로 반환
        if (cData.awardedAt) {
          return { alreadyAwarded: true };
        }

        const winnerId = cData.winnerId;
        const winnerName = cData.winnerName;
        const storeItemId = cData.selectedItemId;
        const itemName = cData.itemName;
        const itemIcon = cData.itemIcon || "🎁";
        const totalCost = cData.currentAmount || cData.targetPrice || 0;

        if (!winnerId) {
          throw new HttpsError("failed-precondition", "최다 기여자가 없습니다.");
        }

        // 2) storeItem 읽기 (있는 경우)
        let itemData = null;
        let itemRef = null;
        if (storeItemId) {
          itemRef = db.collection("storeItems").doc(storeItemId);
          const itemSnap = await transaction.get(itemRef);
          if (itemSnap.exists) {
            itemData = itemSnap.data();
          }
        }

        // 3) 관리자 읽기 (있는 경우)
        let adminData = null;
        if (adminRef) {
          const adminSnap = await transaction.get(adminRef);
          if (adminSnap.exists) {
            adminData = adminSnap.data();
          }
        }

        // 3.5) 당첨자(winner) 유저 문서 읽기 — 🎰 randomDraw 하루 "구매" 카운트 반영용
        //   (모든 read는 write 이전에 수행해야 함)
        const winnerUserRef = db.collection("users").doc(winnerId);
        const winnerUserSnap = await transaction.get(winnerUserRef);

        // 4) 재고/가격 계산
        let finalStock = null;
        let finalPrice = itemData?.price ?? null;
        let restocked = false;
        let restockCost = 0;

        if (itemData && itemData.stock !== undefined) {
          const currentStock = itemData.stock || 0;
          const newStock = Math.max(0, currentStock - 1);
          const initialStock = itemData.initialStock || 10;
          const priceIncreasePercentage =
            itemData.priceIncreasePercentage ??
            itemData.outOfStockPriceIncreaseRate ??
            10;

          if (newStock <= 0 && initialStock > 0) {
            restocked = true;
            finalStock = initialStock;
            finalPrice = Math.round(
              (itemData.price || 0) * (1 + priceIncreasePercentage / 100),
            );
            restockCost = Math.round(
              (itemData.price || 0) * initialStock * WHOLESALE_COST_RATIO,
            );
          } else {
            finalStock = newStock;
          }
        }

        // 🎰 randomDraw 메타 (storeItem 기준). 일반 구매(purchaseStoreItem)와 동일하게
        //    inventory에 type + 추첨 메타를 복사해야 MyItems가 돌림판으로 분기하고
        //    drawRandomItem이 inventory 메타로 추첨할 수 있음. (없으면 그냥 "사용중 5분" 일반템 취급)
        const isRandomDraw = itemData?.type === "randomDraw";
        const buildDrawMeta = () => {
          if (!isRandomDraw) return {};
          return {
            drawSource: itemData.drawSource || "food",
            loseEnabled: itemData.loseEnabled === true,
            losePercent: Number(itemData.losePercent) || 0,
            drawCandidates: Array.isArray(itemData.drawCandidates)
              ? itemData.drawCandidates
              : [],
          };
        };

        // 5) 인벤토리에 아이템 추가
        if (storeItemId) {
          const inventoryRef = db
            .collection("users")
            .doc(winnerId)
            .collection("inventory")
            .doc(storeItemId);
          const invSnap = await transaction.get(inventoryRef);
          if (invSnap.exists) {
            transaction.update(inventoryRef, {
              quantity: admin.firestore.FieldValue.increment(1),
              // 과거 버그(type:"item") 또는 메타 누락분 보정: randomDraw면 타입·메타 갱신
              ...(isRandomDraw
                ? { type: "randomDraw", ...buildDrawMeta() }
                : {}),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(inventoryRef, {
              itemId: storeItemId,
              name: itemName,
              icon: itemIcon,
              quantity: 1,
              // 하드코딩 "item" 금지 — storeItem 실제 타입 사용 (randomDraw 보존)
              type: itemData?.type || "item",
              ...buildDrawMeta(),
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // 5.5) 🎰 randomDraw면 당첨자 하루 "구매" 카운트에 +1 (함께구매로 구매 제한 우회 방지)
        //   - 학생만 반영(관리자 제외). 날짜(KST) 바뀌면 자동 리셋.
        //   - 카운트만 올리고 한도 초과로 throw하지 않음(이미 완료된 캠페인 깨지면 안 됨).
        //   - 실제 "돌리기(쓰기)" 카운트(dailySpinCount)는 drawRandomItem 사용 시점에 자동 증가.
        if (isRandomDraw) {
          const winnerData = winnerUserSnap.exists ? winnerUserSnap.data() : {};
          const isWinnerAdmin =
            winnerData.isAdmin === true ||
            winnerData.isSuperAdmin === true ||
            winnerData.isTeacher === true;
          if (!isWinnerAdmin) {
            const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
            const drawDayKey = `${nowKst.getUTCFullYear()}-${String(
              nowKst.getUTCMonth() + 1,
            ).padStart(2, "0")}-${String(nowKst.getUTCDate()).padStart(2, "0")}`;
            const prevCount =
              winnerData.dailyDrawDate === drawDayKey
                ? winnerData.dailyDrawCount || 0
                : 0;
            transaction.update(winnerUserRef, {
              dailyDrawDate: drawDayKey,
              dailyDrawCount: prevCount + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // 6) storeItem 갱신
        if (itemRef && itemData && itemData.stock !== undefined) {
          const stockUpdate = {
            stock: finalStock,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (restocked) {
            stockUpdate.price = finalPrice;
          }
          transaction.update(itemRef, stockUpdate);
        }

        // 7) 관리자 cash 변동: +totalCost(모금액) -restockCost(보충)
        const adminCashDelta = totalCost - (restocked ? restockCost : 0);
        if (adminRef && adminCashDelta !== 0) {
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(adminCashDelta),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 8) VAT 기록 (treasury)
        const vatAmount = Math.round(
          (totalCost * itemStoreVATRate) / (1 + itemStoreVATRate),
        );
        if (vatAmount > 0) {
          const treasuryRef = db
            .collection("nationalTreasuries")
            .doc(callerClassCode);
          transaction.set(
            treasuryRef,
            {
              vatRevenue: admin.firestore.FieldValue.increment(vatAmount),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }

        // 9) 멱등성 플래그 + 처리 메타데이터
        transaction.update(campaignRef, {
          awardedAt: admin.firestore.FieldValue.serverTimestamp(),
          awardedRestockCost: restockCost,
          awardedAdminCashDelta: adminCashDelta,
          awardedVAT: vatAmount,
          awardedFinalStock: finalStock,
          awardedFinalPrice: finalPrice,
          awardedRestocked: restocked,
        });

        // 10) activity_logs (transaction 내)
        // - winner: 아이템 획득
        await logActivity(
          transaction,
          winnerId,
          LOG_TYPES.ITEM_OBTAIN,
          `함께구매 당첨: ${itemName}을(를) 획득했습니다 (모금 ${totalCost.toLocaleString()}원)`,
          { campaignId, itemId: storeItemId, totalCost, restocked },
        );

        // - admin: 모금액 입금 + 보충비 차감 (관리자 ID로 로그 - 한 줄로)
        if (adminRef && adminCashDelta !== 0) {
          const adminId = adminRef.id;
          await logActivity(
            transaction,
            adminId,
            adminCashDelta > 0 ? LOG_TYPES.CASH_INCOME : LOG_TYPES.CASH_EXPENSE,
            restocked
              ? `함께구매 매출 ${totalCost.toLocaleString()}원 - 재고보충 ${restockCost.toLocaleString()}원 = ${adminCashDelta.toLocaleString()}원 (${itemName})`
              : `함께구매 매출 ${totalCost.toLocaleString()}원 (${itemName})`,
            {
              campaignId,
              itemId: storeItemId,
              totalCost,
              restockCost,
              restocked,
              netDelta: adminCashDelta,
            },
          );
        }

        return {
          alreadyAwarded: false,
          winnerId,
          winnerName,
          itemName,
          totalCost,
          restocked,
          restockCost,
          finalStock,
          finalPrice,
          vatAmount,
          adminCashDelta,
        };
      });

      if (result.alreadyAwarded) {
        logger.info(`[completeGroupPurchase] ${campaignId} 이미 처리됨 (idempotent)`);
        return { success: true, alreadyAwarded: true };
      }

      logger.info(
        `[completeGroupPurchase] ${campaignId} 완료: ${result.winnerName}님 ${result.itemName} 획득, 관리자 +${result.adminCashDelta.toLocaleString()}원${result.restocked ? ` (재고보충 ${result.restockCost.toLocaleString()}원)` : ""}`,
      );

      return { success: true, ...result };
    } catch (error) {
      logger.error(`[completeGroupPurchase] Error for campaign ${campaignId}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "함께구매 완료 처리 실패");
    }
  },
);
