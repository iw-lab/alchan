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
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(inventoryRef, {
              itemId: storeItemId,
              name: itemName,
              icon: itemIcon,
              quantity: 1,
              type: "item",
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
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
