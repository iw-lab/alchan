/* eslint require-atomic-updates: "off" */
// ⚠️ 통짜 `eslint-disable` 에서 좁혔다(2026-08-20). require-atomic-updates 만 끈다 —
//    `let batch` 분할커밋 패턴을 ESLint 가 경합으로 오판한다(scheduler-http.js 와 동일).
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

const { db, admin, logger, findApprovedAdminSnap } = require("./utils");

// 계산식·월키는 functions/dividendMath.js(순수 함수) 단일 진실원 — 테스트가 그쪽을 지킨다.
const {
  calculateDividend,
  computeMonthKey,
  DIVIDEND_TAX_RATE,
} = require("./dividendMath");
const {
  claimPeriodLock,
  completePeriodLock,
  releasePeriodLock,
} = require("./periodLockStore");
const BATCH_OP_LIMIT = 450;       // 안전 마진 (500 한도의 90%)

/**
 * 매월 1회 배당 지급 실행
 * @returns {Promise<{paid, skipped, failed, totalNet, totalTax}>}
 */
async function payMonthlyDividends(monthKeyOverride = null) {
  const monthKey = monthKeyOverride || computeMonthKey();
  logger.info(`[Dividend] 월간 배당 지급 시작 (${monthKey})`);

  let paid = 0;
  let skipped = 0;
  let failed = 0;
  let totalNet = 0;
  let totalTax = 0;

  // 🔒 실행 단위 락. **함수 안쪽**에 두는 이유: 진입점이 둘이고(dividendSchedulerV2 cron,
  //    payDividendsManual HTTP) 호출부에 두면 반드시 하나를 빠뜨린다 — 이번 교차검증에서
  //    실제로 수동 weeklyRent/weeklyPropertyTax 를 그렇게 빠뜨렸다.
  //
  //    보유분별 lastDividendMonthKey 마커만으론 **동시 실행**을 못 막는다. 마커는 루프 시작 때
  //    뜬 트랜잭션 밖 스냅샷에서 읽히므로, 두 실행이 겹치면 둘 다 "아직 안 받음"을 보고 이중 지급한다.
  //    (순차 재호출은 마커가 막는다 — 동시성만 이 락이 담당한다.)
  const lockRef = db.collection("schedulerLocks").doc("dividend");
  const claimed = await claimPeriodLock(lockRef, monthKey, {
    label: "월간 배당",
  });
  if (!claimed) {
    logger.info(`[Dividend] ${monthKey} 이미 지급 완료 또는 진행 중 - 건너뜀`);
    return { paid: 0, skipped: 0, failed: 0, totalNet: 0, totalTax: 0, lockSkipped: true };
  }

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
      // 지급한 게 없으니 '완료'로 박지 않는다 — 종목 조회가 일시적으로 비었을 수도 있고,
      // 완료로 두면 그 달은 영영 못 준다. 락만 풀고 다음 실행에 맡긴다.
      await releasePeriodLock(lockRef, monthKey, new Error("no-dividend-stocks"));
      return { paid: 0, skipped: 0, failed: 0, totalNet: 0, totalTax: 0 };
    }

    logger.info(`[Dividend] 배당 대상 종목: ${stocksMap.size}개`);

    // 2) batch 분할 커밋 + 학급별 세금 정산
    //
    // ⚠️ 종전 구조의 결함(2026-08-11 교차검증 H5 + 후속 발견):
    //    ① 멱등 가드가 전혀 없었다 — 부분 실패 후 재실행하면 이미 받은 보유분에 또 지급.
    //    ② 세금은 **끝에 한 번만** 국고·교사에게 반영했다. 중간 batch 가 커밋된 뒤 죽으면
    //       학생 현금은 이미 늘었는데 세금은 아무 데도 안 들어가 — 그만큼이 무에서 생긴다.
    //    이 둘은 같이 고쳐야 한다. 마커만 넣으면 재실행이 건너뛰면서 ②의 유실이 **영구화**된다.
    //    그래서 세금을 batch 단위로 함께 커밋한다 — 커밋된 batch 는 항상 "지급 + 그 세금 + 마커"가 짝이다.
    // 감사 로그 보존 90일 — economicEvents 와 같은 기준.
    const logExpireAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    );

    let batch = db.batch();
    let opsInBatch = 0;
    let pendingTaxByClass = new Map(); // 아직 커밋 안 된 batch 안에서 발생한 세금
    const adminRefCache = new Map();   // classCode → adminRef|null (학급당 1회만 조회)

    // ⚠️ 조회 **실패**와 관리자 **부재**를 구분한다(2026-08-11 2차 검증 C4).
    //    종전엔 예외를 삼키고 null 을 캐시했다. 그러면 일시적 조회 실패 하나로
    //    학생 배당·마커·국고통계는 커밋되는데 **관리자 cash 입금만 빠지고**,
    //    재실행은 마커 때문에 학생분을 건너뛰어 그 세금이 **영구히 사라진다**(= 무담보 발행).
    //    이제 실패는 던진다 → batch 미커밋 → 락 해제 → 재시도가 처음부터 다시 한다.
    //    "관리자가 정말 없는 학급"(snap.empty)만 null 로 캐시하고 경고만 남긴다.
    const getAdminRef = async (classCode) => {
      if (adminRefCache.has(classCode)) return adminRefCache.get(classCode);
      const snap = await findApprovedAdminSnap(classCode); // 실패 시 그대로 전파
      const ref = snap.empty ? null : snap.docs[0].ref;
      adminRefCache.set(classCode, ref);
      return ref;
    };

    /** 대기 중인 세금을 같은 batch 에 실어 커밋한다. */
    const flushBatch = async () => {
      for (const [classCode, taxSum] of pendingTaxByClass.entries()) {
        if (taxSum <= 0) continue;
        // (a) 국고 통계
        batch.set(
          db.collection("nationalTreasuries").doc(classCode),
          {
            dividendTaxRevenue: admin.firestore.FieldValue.increment(taxSum),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        opsInBatch++;
        // (b) 관리자(선생님) cash 로 세금 실제 입금
        //   ⚠️ 과거 버그: 통계만 기록하고 cash 엔 안 들어가 관리자 적자가 누적됐다.
        const adminRef = await getAdminRef(classCode);
        if (adminRef) {
          batch.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(taxSum),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;
          logger.info(`[Dividend] 관리자 cash +${taxSum} (배당세) — class ${classCode}`);
        } else {
          logger.warn(`[Dividend] class ${classCode} 관리자 없음 - 세금 cash 입금 스킵`);
        }
      }
      pendingTaxByClass = new Map();
      if (opsInBatch > 0) await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    };

    const commitIfNeeded = async (extraOps) => {
      // 대기 세금도 이 batch 에 실릴 자리를 미리 잡아 둔다(학급당 국고 1 + 관리자 1).
      const reserved = pendingTaxByClass.size * 2;
      if (opsInBatch + reserved + extraOps > BATCH_OP_LIMIT) {
        await flushBatch();
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

      // 🔒 멱등 원장을 **보유 문서 밖**에 둔다(2026-08-11 3차 검증 C3).
      //    마커를 holding 문서에 두면 학생이 전량매도 → 재매수 할 때 문서가 새로 생기면서
      //    마커가 사라져, 같은 달 재실행에서 또 받는다. 원장은 사용자·월 단위라 그 영향을 안 받는다.
      //    비용: 보유가 있는 사용자당 월 1읽기(실측 88명 규모에서 무시 가능).
      const ledgerRef = db
        .collection("users").doc(userId)
        .collection("dividendLedger").doc(monthKey);
      const ledgerSnap = await ledgerRef.get();
      const paidStocks = (ledgerSnap.exists && ledgerSnap.data().paid) || {};

      for (const holdingDoc of portfolioSnap.docs) {
        const holding = holdingDoc.data();

        // holdingDoc.id가 stockId (일반적 패턴) — 또는 holding.stockId 필드 fallback
        const stockId = holding.stockId || holdingDoc.id;
        const stock = stocksMap.get(stockId);
        if (!stock) {
          skipped++;
          continue;
        }

        // 🔒 이번 달 이 종목에 이미 배당했으면 건너뛴다. 원장 기록은 지급과 **같은 batch** 라
        //    "지급했는데 기록이 없다"가 불가능하다(batch 는 원자적).
        //
        //    마커 위치가 두 번 바뀐 이력이 있다 — 둘 다 교차검증에서 뚫려서다:
        //      ① 스칼라 `lastDividendMonthKey` → 수동 백필이 마커를 과거로 덮어써 그 달 재지급(C2)
        //      ② 보유 문서 위의 월별 맵 → 전량매도 후 재매수 시 문서가 새로 생겨 마커 소실(C3)
        //    이제 **사용자·월 단위 원장**이라 둘 다 해당 없다. 달마다 문서가 갈리고,
        //    보유 문서를 지웠다 만들어도 원장은 그대로다.
        if (paidStocks[stockId] === true) {
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
          await commitIfNeeded(5);

          // (a) 학생 cash 증가 (세후 금액)
          batch.update(userDoc.ref, {
            cash: admin.firestore.FieldValue.increment(netAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          // (a-2) 멱등 원장 — 지급과 **같은 batch** 라 "지급했는데 기록이 없다"가 불가능하다.
          //   문서 단위가 사용자·월이므로 보유 문서를 지웠다 새로 만들어도 살아남는다.
          batch.set(
            ledgerRef,
            {
              monthKey,
              paid: { [stockId]: true },
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
          opsInBatch++;
          paidStocks[stockId] = true; // 같은 실행 안에서 중복 방문 방지

          // 보유 문서엔 사람이 읽는 기록만 남긴다(판정엔 쓰지 않는다)
          batch.update(holdingDoc.ref, {
            lastDividendMonthKey: monthKey,
            lastDividendPaidAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          // (b) 감사 로그 — 학생 "내 자산 > 거래내역"에 뜨는 경로.
          //   ⚠️ 종전엔 `activities` 컬렉션에 썼는데, MyAssets 가 읽는 건
          //   activity_logs · users/{uid}/transactions · transactions 셋뿐이다(실측).
          //   즉 **배당을 받아도 학생 화면엔 아무것도 안 떴다.** 배당은 이 앱에서
          //   대가 없이 현금이 느는 유일한 경로라 기록이 없으면 설명할 방법이 없다.
          //   (financial-saas 1항: cash 변경 함수는 반드시 감사 로그를 남긴다.)
          //   스키마는 activity_logs 규약(type·amount·description)을 따른다 —
          //   화면이 그 세 필드로 줄을 그린다. 세부는 metadata 로 내린다.
          const stockLabel = stock.name || holding.stockName || "보유 종목";
          const activityRef = db.collection("activity_logs").doc();
          batch.set(activityRef, {
            userId: userId,
            userName: userData.name || "익명",
            classCode: classCode || null,
            type: "배당금 수령",
            amount: netAmount, // 실제로 통장에 꽂힌 세후 금액
            description:
              `[배당] ${stockLabel} ${holding.quantity || 0}주 — ` +
              `세전 ${grossAmount.toLocaleString()}원, 세금 ${taxAmount.toLocaleString()}원 ` +
              `(${(DIVIDEND_TAX_RATE * 100).toFixed(1)}%) 공제 후 ${netAmount.toLocaleString()}원`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: logExpireAt,
            metadata: {
              stockId,
              stockName: stockLabel,
              quantity: holding.quantity || 0,
              pricePerShare: stock.price || 0,
              dividendYieldAnnual: stock.dividendYieldAnnual,
              grossAmount,
              taxAmount,
              netAmount,
              monthKey,
            },
          });
          opsInBatch++;

          // (c) 종목별 누적 통계
          batch.update(db.collection("CentralStocks").doc(stockId), {
            totalDividendPaid: admin.firestore.FieldValue.increment(grossAmount),
            lastDividendPaidAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          opsInBatch++;

          // 학급 국고 세금 누적 — 이 batch 가 커밋될 때 **같이** 나간다(위 flushBatch).
          if (classCode) {
            pendingTaxByClass.set(
              classCode,
              (pendingTaxByClass.get(classCode) || 0) + taxAmount
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

    // 5) 마지막 batch — 남은 지급분과 그 세금을 함께 커밋
    await flushBatch();

    logger.info(
      `[Dividend] 완료(${monthKey}) - 지급:${paid}, 건너뜀:${skipped}, 실패:${failed}, ` +
      `총 세후:${totalNet.toLocaleString()}원, 총 세금:${totalTax.toLocaleString()}원`
    );

    // 🔒 완료 표시는 **여기서**. 이 줄에 닿기 전에 죽으면 락은 in-progress 로 남고,
    //    stale 회수 후 재실행하면 보유분별 마커(lastDividendMonthKey)가 이미 받은 건 건너뛴다.
    await completePeriodLock(lockRef, monthKey, { paid, totalNet, totalTax, failed });

    return { paid, skipped, failed, totalNet, totalTax };
  } catch (error) {
    logger.error("[Dividend] 전체 오류:", error);
    // 락을 잡은 채 실패했으면 푼다. 재실행은 마커 덕에 안전하다(이미 받은 보유분은 건너뛴다).
    await releasePeriodLock(lockRef, monthKey, error);
    throw error;
  }
}

module.exports = {
  payMonthlyDividends,
  calculateDividend,
  computeMonthKey,
  DIVIDEND_TAX_RATE,
};
