/* eslint-disable */
/* eslint-disable max-len */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin, logger, logActivity, LOG_TYPES, checkAuthAndGetUserData, findApprovedAdminSnap, hasTeacherPower, checkIdempotent, markIdempotent } = require("./utils");

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
      const adminSnapshot = await findApprovedAdminSnap(callerClassCode);
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
          // 한도 면제는 '승인된' 교사/관리자만 (미승인 자가가입 교사 차단 — drawRandomItem과 동일 정책)
          const isWinnerAdmin = hasTeacherPower(winnerData);
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

// 함께구매 참여(모금 기여) — 구매자 cash 차감 + 캠페인 기여자/진행도 갱신을 CF로 이관.
//   (구 클라 runTransaction의 cash 직접 write 제거. 목표 달성 시 status=completed까지 세팅해
//    별도 completeGroupPurchase CF가 아이템 지급·관리자 입금 처리.)
exports.joinGroupPurchase = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { campaignId, amount, idempotencyKey } = request.data || {};

    if (!campaignId || typeof campaignId !== "string" || campaignId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 캠페인 정보가 필요합니다.");
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    // strict 정수(codex): 실수/문자열/불리언 강제변환 거부.
    if (typeof amount !== "number" || !Number.isInteger(amount) ||
        amount <= 0 || amount > 10000000000) {
      throw new HttpsError("invalid-argument", "유효한 참여 금액이 필요합니다.");
    }
    const reqAmount = amount;
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const campaignRef = db.collection("groupPurchases").doc(campaignId);
    const userRef = db.collection("users").doc(uid);

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 0) 멱등키(read 먼저)
        const keyRef = await checkIdempotent(transaction, idempotencyKey);

        // 1) 읽기: 캠페인, 사용자, (선택아이템 있으면) 상점 현재가
        const campaignSnap = await transaction.get(campaignRef);
        if (!campaignSnap.exists) throw new Error("캠페인을 찾을 수 없습니다.");
        const cData = campaignSnap.data();
        // 반경계: 같은 학급 캠페인만
        if (cData.classCode !== classCode) {
          throw new HttpsError("permission-denied", "다른 학급의 캠페인입니다.");
        }
        if (cData.status !== "active") {
          throw new Error("이미 완료된 캠페인입니다.");
        }

        let storeItemSnap = null;
        if (cData.selectedItemId && typeof cData.selectedItemId === "string" &&
            !cData.selectedItemId.includes("/")) {
          storeItemSnap = await transaction.get(
            db.collection("storeItems").doc(cData.selectedItemId),
          );
        }
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
        const uData = userSnap.data();

        // 2) 상점 현재가로 목표가 동기화(가격 변동 반영), 남은 모금액 한도로 참여액 클램프
        const currentShopPrice = Number(storeItemSnap && storeItemSnap.exists
          ? storeItemSnap.data().price : 0) || 0;
        const effectiveTargetPrice = currentShopPrice > 0
          ? currentShopPrice : (Number(cData.targetPrice) || 0);
        const currentAmount = Number(cData.currentAmount) || 0;
        const currentRemaining = effectiveTargetPrice - currentAmount;
        // 참여액 = 남은 모금액 한도로 클램프(음수 방지). ⚠️ 이미 목표 도달/초과(관리자 가격 인하 등)면
        //   txFinalAmount=0 → 새 차감 없이 완료만 처리(구 클라는 음수 txFinalAmount로 cash 민팅 버그,
        //   단순 throw는 캠페인이 active에 영구 고착되는 데드락 = Gemini CRITICAL). 완료로 흘려보낸다.
        const txFinalAmount = Math.max(0, Math.min(reqAmount, currentRemaining));
        if (txFinalAmount > 0 && (Number(uData.cash) || 0) < txFinalAmount) {
          throw new Error("잔액이 부족합니다.");
        }

        // 3) 기여자 목록 갱신(실제 기여 시에만 본인 항목 누적/신규)
        const nowTs = admin.firestore.Timestamp.fromMillis(Date.now());
        const newContributors = [...(cData.contributors || [])];
        if (txFinalAmount > 0) {
          const idx = newContributors.findIndex((c) => c.userId === uid);
          if (idx >= 0) {
            newContributors[idx] = {
              ...newContributors[idx],
              amount: (Number(newContributors[idx].amount) || 0) + txFinalAmount,
              lastContributedAt: nowTs,
              firstContributedAt: newContributors[idx].firstContributedAt ||
                newContributors[idx].contributedAt || nowTs,
            };
          } else {
            newContributors.push({
              userId: uid,
              userName: userData.name || "알 수 없음",
              amount: txFinalAmount,
              contributedAt: nowTs,
              firstContributedAt: nowTs,
              lastContributedAt: nowTs,
            });
          }
        }

        const newTotal = currentAmount + txFinalAmount;
        const isCompleted = newTotal >= effectiveTargetPrice;
        // 방어: 기여도 0이고 완료도 아니면(도달 안 했는데 참여액 0) 정상적으로 불가능 → 명시적 거부.
        if (txFinalAmount <= 0 && !isCompleted) {
          throw new Error("참여할 수 없는 캠페인입니다.");
        }

        // 4) 완료 시 최다 기여자(동률이면 먼저 참여) = winner
        let winnerId = null;
        let winnerName = null;
        if (isCompleted) {
          const getTime = (c) => {
            const t = c.firstContributedAt || c.contributedAt;
            return (t && t.toMillis && t.toMillis()) ||
              (t && t.getTime && t.getTime()) ||
              (typeof t === "number" ? t : 0);
          };
          const top = [...newContributors].sort((a, b) => {
            if ((Number(b.amount) || 0) !== (Number(a.amount) || 0)) {
              return (Number(b.amount) || 0) - (Number(a.amount) || 0);
            }
            return getTime(a) - getTime(b);
          })[0];
          winnerId = (top && top.userId) || null;
          winnerName = (top && top.userName) || null;
        }

        // 5) 쓰기: 캠페인 갱신, cash 차감(increment), 활동로그
        transaction.update(campaignRef, {
          currentAmount: newTotal,
          contributors: newContributors,
          status: isCompleted ? "completed" : "active",
          completedAt: isCompleted ? nowTs : null,
          winnerId,
          winnerName,
          targetPrice: effectiveTargetPrice,
        });
        // cash 차감·활동로그는 실제 기여(txFinalAmount>0)일 때만. 이미-도달 완료 경로는 미차감.
        if (txFinalAmount > 0) {
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(-txFinalAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const logRef = db.collection("activity_logs").doc();
          const expireAt = admin.firestore.Timestamp.fromMillis(
            Date.now() + 90 * 24 * 60 * 60 * 1000,
          );
          transaction.set(logRef, {
            userId: uid,
            userName: userData.name || "알 수 없음",
            classCode,
            type: "현금 출금",
            description: `함께구매 참여: ${cData.itemName || "아이템"} (-${txFinalAmount.toLocaleString()}원)`,
            amount: -txFinalAmount,
            metadata: { campaignId, itemName: cData.itemName || "", isCompleted },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt,
          });
        }

        markIdempotent(transaction, keyRef);
        return { isCompleted, winnerId, winnerName, itemName: cData.itemName, txFinalAmount };
      });
      return { success: true, ...result };
    } catch (error) {
      logger.error(`[joinGroupPurchase] Error (uid ${uid}, campaign ${campaignId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "함께구매 참여에 실패했습니다.");
    }
  },
);

// 함께구매 삭제 — 관리자 또는 생성자(initiator). 진행중(active) 캠페인이면 기여자에게 환불 후 삭제.
//   ⚠️ 완료(completed) 캠페인은 환불 안 함: 모금액이 이미 completeGroupPurchase로 관리자에게
//   입금됐으므로 환불하면 무담보 민팅(구 클라 handleDelete는 status 미검사 + 절대값 cash 덮어쓰기 레이스 버그).
exports.deleteGroupPurchase = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin } = await checkAuthAndGetUserData(request);
    const { campaignId } = request.data || {};
    if (!campaignId || typeof campaignId !== "string" || campaignId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 캠페인 정보가 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const campaignRef = db.collection("groupPurchases").doc(campaignId);

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 읽기: 캠페인 + (환불 대상이면) 기여자 사용자 문서 전부
        const campaignSnap = await transaction.get(campaignRef);
        if (!campaignSnap.exists) {
          throw new Error("캠페인을 찾을 수 없습니다.");
        }
        const cData = campaignSnap.data();
        if (cData.classCode !== classCode) {
          throw new HttpsError("permission-denied", "다른 학급의 캠페인입니다.");
        }
        // 권한: 관리자 또는 생성자(initiator).
        const isInitiator = cData.initiatorId === uid;
        if (!isAdmin && !isInitiator) {
          throw new HttpsError("permission-denied", "삭제 권한이 없습니다.");
        }

        // 환불 기준 = 모금액이 아직 관리자에게 입금되지 않았을 때(awardedAt 부재).
        //   - active: 미완료 → 환불(구매자들이 낸 돈 반환).
        //   - completed & awardedAt: completeGroupPurchase가 관리자에게 입금 완료 → 환불 금지(민팅 방지).
        //   - completed & !awardedAt: 목표 달성했으나 지급 CF 미완(실패) → 돈이 아직 관리자에게 안 감 →
        //     환불해야 기여자 돈이 유실되지 않음. status==="active"만 보면 이 경우를 놓쳐 유실 발생.
        const notYetSettled = !cData.awardedAt;
        const shouldRefund = notYetSettled &&
          Array.isArray(cData.contributors) &&
          (Number(cData.currentAmount) || 0) > 0;

        const refundList = [];
        if (shouldRefund) {
          // 기여자별 합산(같은 사람 중복 항목 방어) 후 각 문서 read
          const byUser = Object.create(null);
          for (const c of cData.contributors) {
            const amt = Number(c && c.amount) || 0;
            if (c && c.userId && amt > 0) {
              byUser[c.userId] = (byUser[c.userId] || 0) + amt;
            }
          }
          for (const [userId, amt] of Object.entries(byUser)) {
            const uRef = db.collection("users").doc(userId);
            const uSnap = await transaction.get(uRef);
            refundList.push({ uRef, uSnap, userId, amt });
          }
        }

        // 2) 쓰기: 환불(increment) + 활동로그, 캠페인 삭제
        const expireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        for (const r of refundList) {
          if (!r.uSnap.exists) continue; // 삭제된 사용자는 스킵(반환할 잔액 없음)
          transaction.update(r.uRef, {
            cash: admin.firestore.FieldValue.increment(r.amt),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          const logRef = db.collection("activity_logs").doc();
          transaction.set(logRef, {
            userId: r.userId,
            userName: (r.uSnap.data().name) || "사용자",
            classCode,
            type: "현금 입금",
            description: `함께구매 취소 환불: ${cData.itemName || "아이템"} (+${r.amt.toLocaleString()}원)`,
            amount: r.amt,
            metadata: { campaignId, itemName: cData.itemName || "" },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt,
          });
        }
        transaction.delete(campaignRef);
      });
      return { success: true, message: "함께구매가 삭제되었습니다." };
    } catch (error) {
      logger.error(`[deleteGroupPurchase] Error (campaign ${campaignId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "함께구매 삭제에 실패했습니다.");
    }
  },
);
