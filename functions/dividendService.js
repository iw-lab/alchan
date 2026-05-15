/* eslint-disable */
/**
 * 배당 지급 서비스
 *
 * 매월 첫 금요일 09:00 KST에 자동 실행:
 * 1. 모든 학생의 portfolio 순회
 * 2. 보유 종목별 (현재가 × 보유수량 × 연배당률 / 12) 계산
 * 3. 세금 15.4% 원천징수 → 학급 국고로 입금
 * 4. 학생 cash 증가 + 활동 기록 생성
 *
 * 정책:
 * - dividendYieldAnnual > 0 인 종목만 지급
 * - 1원 미만은 무시 (반올림 버림)
 * - Firestore batch 한도(500) 자동 분할
 */

const { db, admin, logger } = require("./utils");

const DIVIDEND_TAX_RATE = 0.154; // 배당소득세 15.4%
const BATCH_OP_LIMIT = 450;       // 안전 마진 (500 한도의 90%)

/**
 * 단일 보유 holding에서 배당 지급액 계산
 * @returns {{grossAmount, taxAmount, netAmount} | null}
 */
function calculateDividend(stock, holding) {
  const yieldAnnual = stock.dividendYieldAnnual || 0;
  if (yieldAnnual <= 0) return null;

  const quantity = holding.quantity || 0;
  if (quantity <= 0) return null;

  const price = stock.price || 0;
  if (price <= 0) return null;

  const monthlyRate = yieldAnnual / 100 / 12;
  const grossAmount = Math.floor(quantity * price * monthlyRate);
  if (grossAmount < 1) return null;

  const taxAmount = Math.floor(grossAmount * DIVIDEND_TAX_RATE);
  const netAmount = grossAmount - taxAmount;

  return { grossAmount, taxAmount, netAmount };
}

/**
 * 매월 1회 배당 지급 실행
 * @returns {Promise<{paid, skipped, failed, totalNet, totalTax}>}
 */
async function payMonthlyDividends() {
  logger.info("[Dividend] 월간 배당 지급 시작");

  let paid = 0;
  let skipped = 0;
  let failed = 0;
  let totalNet = 0;
  let totalTax = 0;

  try {
    // 1) 배당률 > 0 인 상장 종목 캐싱
    const stocksSnap = await db.collection("CentralStocks")
      .where("isListed", "==", true)
      .get();

    const stocksMap = new Map();
    stocksSnap.docs.forEach(doc => {
      const data = doc.data();
      if ((data.dividendYieldAnnual || 0) > 0) {
        stocksMap.set(doc.id, { id: doc.id, ...data });
      }
    });

    if (stocksMap.size === 0) {
      logger.info("[Dividend] 배당 지급 대상 종목 없음");
      return { paid: 0, skipped: 0, failed: 0, totalNet: 0, totalTax: 0 };
    }

    logger.info(`[Dividend] 배당 대상 종목: ${stocksMap.size}개`);

    // 2) 학급별 국고 누적용 맵
    const treasuryTaxByClass = new Map();

    // 3) batch 분할 커밋 헬퍼
    let batch = db.batch();
    let opsInBatch = 0;
    const commitIfNeeded = async (extraOps = 3) => {
      if (opsInBatch + extraOps > BATCH_OP_LIMIT) {
        await batch.commit();
        batch = db.batch();
        opsInBatch = 0;
      }
    };

    // 4) 모든 user 순회
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const classCode = userData.classCode;

      // portfolio 서브컬렉션 조회
      const portfolioSnap = await db
        .collection("users").doc(userId)
        .collection("portfolio")
        .get();

      if (portfolioSnap.empty) continue;

      for (const holdingDoc of portfolioSnap.docs) {
        const holding = holdingDoc.data();

        // holdingDoc.id가 stockId (일반적 패턴) — 또는 holding.stockId 필드 fallback
        const stockId = holding.stockId || holdingDoc.id;
        const stock = stocksMap.get(stockId);
        if (!stock) {
          skipped++;
          continue;
        }

        const result = calculateDividend(stock, holding);
        if (!result) {
          skipped++;
          continue;
        }

        const { grossAmount, taxAmount, netAmount } = result;

        try {
          await commitIfNeeded(3);

          // (a) 학생 cash 증가 (세후 금액)
          batch.update(userDoc.ref, {
            cash: admin.firestore.FieldValue.increment(netAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          // (b) 활동 기록 (배당)
          const activityRef = db.collection("activities").doc();
          batch.set(activityRef, {
            type: "dividend",
            userId: userId,
            userName: userData.name || "익명",
            stockId: stockId,
            stockName: stock.name || holding.stockName || "",
            quantity: holding.quantity || 0,
            pricePerShare: stock.price || 0,
            dividendYieldAnnual: stock.dividendYieldAnnual,
            grossAmount,
            taxAmount,
            netAmount,
            classCode: classCode || null,
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          // (c) 종목별 누적 통계
          batch.update(db.collection("CentralStocks").doc(stockId), {
            totalDividendPaid: admin.firestore.FieldValue.increment(grossAmount),
            lastDividendPaidAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          // 학급 국고 세금 누적 (메모리)
          if (classCode) {
            treasuryTaxByClass.set(
              classCode,
              (treasuryTaxByClass.get(classCode) || 0) + taxAmount
            );
          }

          paid++;
          totalNet += netAmount;
          totalTax += taxAmount;
        } catch (err) {
          logger.error(`[Dividend] ${userId}/${stockId} 처리 오류:`, err.message);
          failed++;
        }
      }
    }

    // 5) 학급별 국고에 세금 통계 기록 + 관리자 cash 입금
    // ⚠️ 이전 버그: nationalTreasuries 통계만 기록하고 관리자 cash엔 안 들어가
    //  관리자 적자가 누적되던 문제. 이제 통계 + 관리자 cash 둘 다 갱신.
    for (const [classCode, taxSum] of treasuryTaxByClass.entries()) {
      await commitIfNeeded(2);

      // (a) 국고 통계 기록
      const treasuryRef = db.collection("nationalTreasuries").doc(classCode);
      batch.set(
        treasuryRef,
        {
          dividendTaxRevenue: admin.firestore.FieldValue.increment(taxSum),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      opsInBatch++;

      // (b) 관리자(선생님) cash로 세금 실제 입금
      try {
        const adminSnap = await db
          .collection("users")
          .where("classCode", "==", classCode)
          .where("isAdmin", "==", true)
          .limit(1)
          .get();
        if (!adminSnap.empty) {
          const adminRef = adminSnap.docs[0].ref;
          batch.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(taxSum),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;
          logger.info(`[Dividend] 관리자 cash +${taxSum} (배당세) — class ${classCode}`);
        } else {
          logger.warn(`[Dividend] class ${classCode} 관리자 없음 - 세금 cash 입금 스킵`);
        }
      } catch (adminErr) {
        logger.error(`[Dividend] class ${classCode} 관리자 cash 갱신 실패:`, adminErr.message);
      }
    }

    // 6) 마지막 batch commit
    if (opsInBatch > 0) {
      await batch.commit();
    }

    logger.info(
      `[Dividend] 완료 - 지급:${paid}, 건너뜀:${skipped}, 실패:${failed}, ` +
      `총 세후:${totalNet.toLocaleString()}원, 총 세금:${totalTax.toLocaleString()}원`
    );

    return { paid, skipped, failed, totalNet, totalTax };
  } catch (error) {
    logger.error("[Dividend] 전체 오류:", error);
    throw error;
  }
}

module.exports = {
  payMonthlyDividends,
  calculateDividend,
  DIVIDEND_TAX_RATE,
};
