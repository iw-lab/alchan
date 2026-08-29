/* eslint no-unused-vars: "warn", require-await: "off", require-atomic-updates: "off" */
//
// ⚠️ 2026-08-20: 이 파일 1행은 원래 통짜 `eslint-disable` 이었다 — 4,096줄 돈 코드가
//    전부 린트 밖이었고, 그래서 `flushIfNeeded is not defined` 를 아무도 못 잡았다.
//    그 한 줄 때문에 2026-08-17 주급이 **전 학급 실패**했다(라이브 로그로 확인).
//    통짜 해제 대신 **필요한 것만** 끈다:
//      · no-unused-vars         → warn. 죽은 스텁 14곳이 남아 있어 error 면 CI 가 멎는다.
//                                 끄지는 않는다 — 잘못 붙은 정의(backfillDrawItems 안의
//                                 flushIfNeeded)를 잡아낸 게 바로 이 규칙이다.
//      · require-await          → off. 의도적 no-op 스텁(updateCentralStockMarketLogic 등).
//      · require-atomic-updates → off. `let batch` 를 await 뒤 재대입하는 분할커밋 패턴을
//                                 경합으로 오판한다(dividendService.js 도 같은 오탐).
//    ✅ no-undef 는 켜 둔다 — 이번 사고를 잡은 규칙이다.
/**
 * GitHub Actions에서 HTTP로 호출 가능한 스케줄러 엔드포인트입니다.
 * 기존 onSchedule 함수의 로직을 HTTP 호출 가능하게 변환
 *
 * 재배포 트리거(2026-06-25): 순자산 계산 통일(쿠폰/대출/부동산/주식) 함수 배포.
 * hosting release 400 버그로 직전 배포가 functions 단계에 도달하지 못해 재배포함.
 */

const {
  onRequest,
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { checkAuthAndGetUserData, findApprovedAdminSnap, db, admin, logger } = require("./utils");
const {
  updateRealStockPrices,
  createRealStocks,
  addSingleRealStock,
  getAvailableSymbols,
  deduplicateStocks,
  updateExchangeRate,
  getCurrentExchangeRate,
  DEFAULT_REAL_STOCKS,
  updateCentralStocksSnapshot,
  getCentralStocksSnapshot,
} = require("./realStockService");

const { payMonthlyDividends } = require("./dividendService");
const { buildJobMap, resolveStudentJobs, hasJobTitle } = require("./jobUtils");
const { normalizeWeeklyTaxSettings, computeWeeklyTax } = require("./taxMath");
// 주기 작업 락 — 판정은 periodLock.js(순수), Firestore 바인딩은 periodLockStore.js(공유 모듈).
// 공유 모듈로 둔 이유: 진입점이 여러 파일에 흩어져 있어 지역 함수로 두면 반드시 하나를 빠뜨린다.
const {
  claimPeriodLock,
  completePeriodLock,
  releasePeriodLock,
} = require("./periodLockStore");
// 금액·가격 가드 단일 진실원(순수) — 같은 구멍에 두 번 뚫려서 모듈로 뽑았다.
const { MAX_STOCK_PRICE, isValidStockPrice } = require("./moneyGuards");
// 급여 계산 단일 진실원(index.js batchPaySalaries와 공유).
const {
  computeSalaryAmounts,
  computeEffectiveBase,
  nextBaseMultiplier,
  computeWeekKey,
  SALARY,
} = require("./salaryUtils");
const {
  DEFAULT_JOBS,
  DEFAULT_STORE_ITEMS,
  DEFAULT_BANKING,
  DEFAULT_SALARIES,
} = require("./classroomDefaults");
// 배치 분할 "언제 커밋하나" 판정 — 세 곳(주급·재산세·배당)이 손으로 복붙하던 것을 모았다.
//   그 복붙이 2026-08-17 주급 전 학급 실패를 만들었다(functions/batchChunk.js 주석 참고).
const { shouldFlush } = require("./batchChunk");
const { classCodesFromStudentSnap, studentCountsFromSnap } = require("./studentScope");
// 직업 개수 상한 클램프 — 네 곳에 복붙돼 있던 것을 단일 정본으로.
const { clampMaxJobs } = require("./jobUtils");

// 보안: 인증 토큰 체크 (GitHub Actions 스케줄러에서 호출)
// Secret Manager 또는 환경변수(.env)에서 읽기 - deploy.yml이 .env 주입
// 🔑 스케줄러 토큰은 헤더 우선, 쿼리는 하위호환 폴백 (2026-08-17).
//    쿼리스트링에 담긴 시크릿은 Cloud Logging 의 요청 URL·프록시 액세스로그·브라우저 히스토리에
//    **그대로 남는다**. 실제로 이 프로젝트의 스케줄러 토큰 3종이 한 번 유출돼 전량 폐기한 전례가 있다.
//    기존 cron 잡을 깨지 않기 위해 쿼리를 막지는 않는다 — 잡을 헤더 방식으로 옮긴 뒤에 닫을 것.
const AUTH_TOKEN = process.env.SCHEDULER_AUTH_TOKEN || null;
if (!AUTH_TOKEN) {
  logger.warn(
    "SCHEDULER_AUTH_TOKEN 환경변수가 설정되지 않았습니다. 스케줄러 엔드포인트가 비활성화됩니다. deploy.yml의 functions/.env 주입을 확인하세요.",
  );
} else {
  logger.info(
    `[scheduler-http] AUTH_TOKEN 로드 완료 (길이: ${AUTH_TOKEN.length})`,
  );
}

// [삭제됨] SECTOR_NEWS_TEMPLATES - 뉴스 기능 제거됨

// 🔥 방학 모드 - 메모리 캐시 + Firestore 폴백
// Settings/scheduler 문서의 vacationMode 필드로 관리
// 🔥 비용 절감: 30분 캐시로 Firestore 읽기 최소화
let vacationModeCache = {
  value: false, // 🔥 기본값: 방학 모드 OFF (정상 운영)
  lastChecked: 0,
};
const VACATION_CACHE_TTL = 30 * 60 * 1000; // 30분 캐시

async function isVacationMode() {
  const now = Date.now();

  // 캐시가 유효하면 Firestore 읽기 없이 반환
  if (now - vacationModeCache.lastChecked < VACATION_CACHE_TTL) {
    return vacationModeCache.value;
  }

  try {
    const settingsDoc = await db.doc("Settings/scheduler").get();
    if (settingsDoc.exists) {
      vacationModeCache.value = settingsDoc.data()?.vacationMode === true;
    } else {
      vacationModeCache.value = false; // 문서 없으면 정상 운영
    }
    vacationModeCache.lastChecked = now;
    return vacationModeCache.value;
  } catch (error) {
    logger.error("[isVacationMode] 설정 조회 오류:", error);
    return true; // 오류 시 방학 모드로 간주 (비용 절감)
  }
}

// [삭제됨] SECTOR_NEWS_TEMPLATES - 뉴스 기능 제거됨

// [제거됨 2026-08-20] verifyAuth — 최초 커밋부터 호출부 0건인 죽은 코드였는데,
//   하필 `Authorization: Bearer` 스킴을 검사했다. 실제 엔드포인트 12곳은 전부
//   `x-scheduler-auth` 헤더(+ token 쿼리)를 쓴다. 아래 requireForceAuth 옆에 나란히 두면
//   다음 사람이 이걸 "기존 패턴"으로 알고 복사한다 — 그러면 그 엔드포인트는 항상 401 이다.
//   이번 사고가 정확히 "잘못된 자리에 있는 코드를 아무도 못 본" 유형이라 같이 치운다.

// 🔐 2차 토큰 — "돈을 한 번 더 움직이는" 조작 전용 (2026-08-20, P0-F).
//
//   종전엔 AUTH_TOKEN **하나**가 전국 주급 지급·회수·임의 주차 재지급을 전부 쥐고 있었다.
//   그 토큰은 하위호환 때문에 쿼리스트링으로도 받는데, 쿼리에 담긴 시크릿은 Cloud Logging
//   요청 URL·프록시 액세스로그·브라우저 히스토리에 그대로 남는다. 실제로 이 프로젝트의
//   스케줄러 토큰 3종이 한 번 유출돼 전량 폐기한 전례가 있다.
//
//   토큰 1회 유출의 최대 피해가 "정기 작업이 한 번 더 도는 것"(멱등 가드가 막는다)과
//   "임의 주차를 전 학급 강제 재지급"(멱등 가드를 **전부 우회한다**)은 크기가 다르다.
//   후자만 떼어 별도 시크릿 뒤에 둔다. 정상 자동 실행(월요일 주급 등)은 force 를 쓰지
//   않으므로 이 게이트를 지나지 않는다 — 즉 기능 손상 0.
//
//   ⚠️ fail-closed: SCHEDULER_ADMIN_TOKEN 이 없으면 force 계열은 **거부**된다.
//      (GitHub Secrets 에 등록하고 deploy.yml 이 functions/.env 로 주입해야 살아난다)
const ADMIN_TOKEN = process.env.SCHEDULER_ADMIN_TOKEN || null;

/**
 * force/백필처럼 멱등 가드를 우회하는 조작을 허용할지 판정한다.
 * 허용되지 않으면 이 함수가 응답까지 끝내고 false 를 준다(호출부는 그대로 return).
 *
 * @param {object} req  요청
 * @param {object} res  응답
 * @param {string} what 감사 로그에 남길 조작 이름
 * @return {boolean} 진행해도 되면 true
 */
function requireForceAuth(req, res, what) {
  // ⚠️ **헤더 전용이다.** 쿼리 폴백을 두지 않는다 — 이 토큰을 만든 이유 자체가
  //    "쿼리스트링에 담긴 시크릿이 로그에 남는다"였다. 폴백을 두면 새 토큰이 옛 토큰과
  //    같은 통로로 새어 분리가 무의미해진다(2026-08-20 codex WARNING).
  //    호출자가 이 워크플로들뿐이라 하위호환 부담도 없다.
  const provided = req.headers["x-scheduler-admin"];
  if (!ADMIN_TOKEN || provided !== ADMIN_TOKEN) {
    logger.error(`[force거부] ${what} — 관리자 토큰 불일치(또는 미설정)`);
    res.status(403).json({
      success: false,
      error:
        "이 조작은 멱등 검사를 우회합니다. 헤더 x-scheduler-admin 에 " +
        "SCHEDULER_ADMIN_TOKEN 을 넣어 보내세요(쿼리스트링으로는 받지 않습니다).",
    });
    return false;
  }
  if (req.query.confirm !== "YES") {
    res.status(400).json({
      success: false,
      error: `${what} — 되돌리기 어려운 조작입니다. confirm=YES 를 함께 보내세요.`,
    });
    return false;
  }
  // 감사 흔적. 누가 언제 무엇을 우회했는지 로그에 반드시 남긴다.
  logger.warn(`[force허용] ${what} — 관리자 토큰 확인됨, 멱등 가드를 우회합니다.`);
  return true;
}

// ===================================================================================
// TODO 주석: 아래 함수들을 실제 index.js의 로직으로 교체해야 합니다.
// 지금은 index.js에서 로직을 import하여 유사하게 하도록 구성합니다.
// ===================================================================================

// Deprecated: 더 이상 사용되지 않는 runScheduler 함수 제거
// 이유: GitHub Actions 사용했었으나 더 이상 사용하지 않음
// 대신 Cloud Scheduler v2(stockPriceSchedulerV2 등)가 돈다.

// 수동 테스트용 엔드포인트 (관리자용)
exports.manualUpdateStockMarket = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    logger.info(">>> [수동 실행] 주식 시장 업데이트 시작");

    try {
      await updateCentralStockMarketLogic();

      return {
        success: true,
        message: "주식 가격 업데이트 완료",
      };
    } catch (error) {
      logger.error(">> [수동 실행] 오류:", error);
      throw new HttpsError("internal", error.message || "업데이트 실패");
    }
  },
);


// 주식 가격 업데이트용 스케줄러 (15분마다 실행 - cron-job.org)
// 🔥 최적화 v6.0: 시장 시간 체크를 먼저 해서 불필요한 Firestore 읽기 방지
exports.stockPriceScheduler = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      // 🔥 force 파라미터를 먼저 확인 (모든 체크 우회)
      const forceUpdate = req.query.force === "true";
      if (forceUpdate && !requireForceAuth(req, res, "주식 가격 강제 갱신(장중·요일 체크 우회)")) return;

      // 📈 주식(주가 변동)은 방학 모드와 무관하게 항상 작동한다.
      //    방학 중 중단 대상은 주급·월세·재산세·배당뿐(각 스케줄러가 개별로 isVacationMode() 체크).
      //    아래 시장 시간(평일·장중) 체크는 그대로 적용 — 방학이어도 주중 장중에만 갱신.

      const now = new Date();
      const kstOffset = 9 * 60;
      const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
      const hour = kstTime.getUTCHours();
      const day = kstTime.getUTCDay();

      // 🔥 시장 시간 체크 (방학 모드가 아닐 때만 실행됨)
      // 평일(1-5) 6시~24시 + 0시~1시 KST (한국 장 + 미국 장 커버)
      const isWeekday = day >= 1 && day <= 5;
      const isExtendedHours = hour >= 6 || hour < 1; // 6시~24시 + 0시~1시

      if (!forceUpdate && (!isWeekday || !isExtendedHours)) {
        // 🔥 시장 시간 아니면 Firestore 읽기 없이 즉시 반환
        res.json({
          success: true,
          message: "시장 시간 아님 - Firestore 읽기 없이 건너뜀",
          kstHour: hour,
          day: day,
          firestoreReads: 0,
        });
        return;
      }

      logger.info(
        `[stockPriceScheduler] 호출됨 - KST ${hour}시, 요일: ${day}, force: ${forceUpdate}`,
      );

      // 🔥 미국주식 fetch 시간대 (KST 6~8시)에는 활성 사용자 체크 건너뜀
      // 이유: 새벽이라 학생 접속이 없어 활성 사용자 체크에 막혀 미국주식이 영원히 업데이트 안 되는 버그
      const isUSStockFetchTime = hour >= 6 && hour < 8;

      if (!forceUpdate && !isUSStockFetchTime) {
        // 🔥 Settings 문서에서 마지막 활성 시간 확인 (1회 읽기로 최적화)
        const settingsDoc = await db.doc("Settings/activeStatus").get();
        const lastActiveTime = settingsDoc.exists
          ? settingsDoc.data()?.lastActiveAt?.toDate()
          : null;
        const thirtyMinutesAgo = new Date(Date.now() - 70 * 60 * 1000); // 70분 (1시간 타이머에 여유)

        if (!lastActiveTime || lastActiveTime < thirtyMinutesAgo) {
          logger.info(
            `[stockPriceScheduler] 활성 사용자 없음 - 작업 건너뜀 (읽기 비용 절감)`,
          );
          res.json({
            success: true,
            message: "활성 사용자 없음 - 작업 건너뜀",
            kstHour: hour,
            skippedReason: "no_active_users",
          });
          return;
        }
      } else if (isUSStockFetchTime) {
        logger.info(`[stockPriceScheduler] 미국주식 fetch 시간대 (KST ${hour}시) - 활성 사용자 체크 건너뜀`);
      } else {
        logger.info(`[stockPriceScheduler] force=true - 모든 체크 건너뜀`);
      }

      logger.info(`[stockPriceScheduler] 실제 주식 가격 업데이트 시작`);

      const results = {};

      // 🔥 환율 먼저 갱신 (미국 주식 가격 변환에 필요)
      try {
        const exchangeResult = await updateExchangeRate();
        results.exchangeRate = `${exchangeResult.rate}원 (updated: ${exchangeResult.updated})`;
        logger.info(`[stockPriceScheduler] 환율 갱신: ${exchangeResult.rate}원`);
      } catch (error) {
        logger.warn("[stockPriceScheduler] 환율 갱신 실패, 기존 환율 사용:", error.message);
        results.exchangeRate = `error: ${error.message}`;
      }

      // 🔥 실제 주식 데이터만 업데이트 (Yahoo Finance)
      try {
        const realStockResult = await updateRealStockPrices();
        // 같은 이유 — 종목 일부가 실패해도 정상 반환한다. failed>0 이면 실패로 올린다:
        // 시세가 안 갱신되면 학생이 **옛 가격으로 거래**하므로 조용히 넘어가면 안 된다.
        results.updateRealStocks =
          realStockResult.failed > 0
            ? `error: 종목 ${realStockResult.failed}개 시세 갱신 실패 (성공 ${realStockResult.updated})`
            : `success (updated: ${realStockResult.updated})`;
        logger.info(
          `[stockPriceScheduler] 실제 주식 업데이트 완료:`,
          realStockResult,
        );

        // 업데이트된 가격을 기반으로 스냅샷 문서도 갱신하여 클라이언트 읽기 횟수 절감
        // 🔥 realStockResult를 넘겨 CentralStocks 재조회를 생략(1회 실행 44읽기 → 22읽기)
        const snapshotResult = await updateCentralStocksSnapshot(realStockResult);
        results.updateStocksSnapshot = `success (count: ${snapshotResult.count})`;
        logger.info(
          `[stockPriceScheduler] 중앙 스톡 스냅샷 갱신 완료:`,
          snapshotResult,
        );
      } catch (error) {
        logger.error("[stockPriceScheduler] 가격/스냅샷 업데이트 오류:", error);
        results.updateRealStocks = `error: ${error.message}`;
      }

      logger.info(`[stockPriceScheduler] 작업 완료:`, results);

      res.json({ success: true, results, kstHour: hour });
    } catch (error) {
      logger.error("[stockPriceScheduler] 전체 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// 🔥 [Cloud Scheduler v2] GHA schedule drop 영구 해결용
// 기존 stockPriceScheduler(HTTP)는 백업/수동 트리거용으로 유지.
// 시장 시간 외엔 즉시 return하므로 비용 영향 거의 없음.
// 함수 내부 멱등성(updateExchangeRate, updateRealStockPrices의 캐시/lock)으로 GHA와 동시 실행해도 안전.
//
// 🔥 [읽기 절감 2026-07-26] 5분 → 15분 → 20분.
//   1회 실행 = CentralStocks 44읽기(가격갱신 22 + 스냅샷 22, Monitoring 실측).
//   수업 중 학생이 주식창을 계속 보고 있지 않으므로 20분 granularity면 충분하다(사용자 판단).
//   전수 시뮬레이션(장 시간 창 기준): 실행 29회/일 → 22회/일, 하루 1,276 → 968읽기.
//   ⚠️ 학생에게 보이는 UI 문구(StockExchange.js "N분마다 자동으로 가격이 업데이트됩니다")를
//     반드시 함께 고칠 것 — 과거 5분 cron일 때 문구만 15분으로 남아 실제와 어긋나 있었다.
exports.stockPriceSchedulerV2 = onSchedule(
  {
    region: "asia-northeast3",
    schedule: "*/20 * * * *",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      // 📈 주식(주가 변동)은 방학 모드와 무관하게 항상 작동(주급·세금·배당만 방학 중단).

      const now = new Date();
      const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const hour = kstTime.getUTCHours();
      const minute = kstTime.getUTCMinutes();
      const day = kstTime.getUTCDay();

      const isWeekday = day >= 1 && day <= 5;
      if (!isWeekday) return; // 주말 - Firestore 읽기 0

      // 🔥 [읽기 절감 2026-07-26] 실행 창을 실제 장 시간으로 축소.
      //   종전: 평일 06:00~다음날 01:00 = 19시간. 한국장 마감(15:30) 이후 9시간 반 동안에도
      //   계속 돌면서 같은 종가를 다시 읽었다(1회 44읽기, 쓰기는 diff로 생략되나 읽기는 그대로).
      //   미국주식은 그 시간대에 어차피 skip되므로 실질 갱신 없이 읽기만 쓰던 구간.
      //
      // 🇺🇸 미국장은 KST 05:00 마감 → 08:00 정각 1회만 종가 반영
      //    (cron 주기가 바뀌어도 정각 1회를 보장하도록 minute === 0으로 고정)
      //    ⚠️ realStockService.updateRealStockPrices()도 자체 시간창을 갖고 있으므로
      //       거기 `isUSStockFetchTime`(kstHour<9)과 반드시 함께 유지할 것.
      const isUSStockFetchTime = hour === 8 && minute === 0;

      // 🇰🇷 한국장 09:00~15:30. 종가를 확실히 반영하려고 15:45까지 여유를 둔다
      //    (클라이언트 isKoreaMarketOpen의 09:00~15:30 기준과 동일한 장 시간).
      const kstTotalMinutes = hour * 60 + minute;
      const isKoreaMarketTime =
        kstTotalMinutes >= 9 * 60 && kstTotalMinutes <= 15 * 60 + 45;

      if (!isUSStockFetchTime && !isKoreaMarketTime) {
        // 장 시간 아님 - Firestore 읽기 없이 즉시 종료
        return;
      }

      logger.info(
        `[stockPriceSchedulerV2] 호출됨 - KST ${hour}:${String(minute).padStart(2, "0")}, 요일: ${day}`,
      );

      if (isUSStockFetchTime) {
        // 미국장 종가 반영 1회 — 무인 시간대라 활성 사용자 체크 없이 진행
      } else {
        const settingsDoc = await db.doc("Settings/activeStatus").get();
        const lastActiveTime = settingsDoc.exists
          ? settingsDoc.data()?.lastActiveAt?.toDate()
          : null;
        const thirtyMinutesAgo = new Date(Date.now() - 70 * 60 * 1000);
        if (!lastActiveTime || lastActiveTime < thirtyMinutesAgo) {
          logger.info(
            "[stockPriceSchedulerV2] 활성 사용자 없음 - 작업 건너뜀",
          );
          return;
        }
      }

      logger.info("[stockPriceSchedulerV2] 실제 주식 가격 업데이트 시작");
      const results = {};

      try {
        const exchangeResult = await updateExchangeRate();
        // ⚠️ updateExchangeRate 는 실패해도 **throw 하지 않고** {updated:false} 를 돌려준다
        //    (fail-soft — 폴백 환율로 계속 돌게 하려는 의도). 그래서 호출부가 결과를 봐야
        //    실패가 실패로 보고된다(2026-08-12 codex HIGH). 안 보면 job 이 초록색으로 끝난다.
        results.exchangeRate = exchangeResult.updated
          ? `${exchangeResult.rate}원 (updated: true)`
          : `error: 환율 갱신 실패 — 폴백 ${exchangeResult.rate}원 사용`;
        logger.info(
          `[stockPriceSchedulerV2] 환율 갱신: ${exchangeResult.rate}원 (updated: ${exchangeResult.updated})`,
        );
      } catch (error) {
        logger.warn(
          "[stockPriceSchedulerV2] 환율 갱신 실패:",
          error.message,
        );
        results.exchangeRate = `error: ${error.message}`;
      }

      try {
        const realStockResult = await updateRealStockPrices();
        results.updateRealStocks = `success (updated: ${realStockResult.updated}, failed: ${realStockResult.failed})`;
        logger.info(
          "[stockPriceSchedulerV2] 실제 주식 업데이트 완료:",
          realStockResult,
        );

        // 🔥 realStockResult를 넘겨 CentralStocks 재조회를 생략(1회 실행 44읽기 → 22읽기)
        const snapshotResult = await updateCentralStocksSnapshot(realStockResult);
        results.updateStocksSnapshot = `success (count: ${snapshotResult.count})`;
        logger.info(
          "[stockPriceSchedulerV2] 중앙 스톡 스냅샷 갱신 완료:",
          snapshotResult,
        );
      } catch (error) {
        logger.error(
          "[stockPriceSchedulerV2] 가격/스냅샷 업데이트 오류:",
          error,
        );
        results.updateRealStocks = `error: ${error.message}`;
      }

      logger.info("[stockPriceSchedulerV2] 작업 완료:", results);

      // 🔁 위 두 분기는 부분 실패를 허용하지만(환율이 죽어도 시세는 갱신돼야 한다),
      //    삼키기만 하면 job 이 초록색으로 끝난다. 주가가 안 갱신되면 학생이 **옛 가격으로 거래**하므로
      //    조용히 지나가면 안 된다(3차 검증 HIGH3).
      const failed = Object.entries(results)
        .filter(([, v]) => typeof v === "string" && v.startsWith("error:"))
        .map(([k, v]) => `${k} ${v}`);
      if (failed.length > 0) {
        throw new Error(`stockPriceSchedulerV2 부분 실패 — ${failed.join(" / ")}`);
      }
    } catch (error) {
      logger.error("[stockPriceSchedulerV2] 전체 오류:", error);
      // 🔁 재throw = **가시성**. 실측(2026-08-11): 배포된 4개 job 전부 retryConfig={} (retryCount 0)
      //    이라 자동 재시도는 붙지 않는다. 삼키면 실패가 성공으로 보고돼 아무도 모른다.
      throw error;
    }
  },
);

// 자정 리셋용 간단한 GET 엔드포인트
exports.midnightReset = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      // 🔥 중복 실행 방지 (같은 날 여러 번 호출 시)
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kstNow.toISOString().split("T")[0];
      // 🔒 hourlySchedulerV2 자정 분기와 **같은 락 문서**를 원자적으로 점유한다.
      //    두 경로가 동시에 들어와도 하나만 통과한다(적금은 실제 현금 이체다).
      const resetLockRef = db.collection("systemState").doc("lastMidnightReset");
      const claimed = await claimPeriodLock(resetLockRef, todayStr, {
        label: "midnightReset",
      });
      if (!claimed) {
        res.json({ success: true, message: "이미 오늘 리셋 완료됨", skipped: true, date: todayStr });
        return;
      }

      logger.info(`[midnightReset] 일일 과제 리셋 + 적금 자동 납입 시작 (${todayStr})`);

      let savingsResult = { processed: 0, skipped: 0, failed: 0 };
      try {
        await resetDailyTasksLogic();

        // 🔥 적금 매일 자동 납입 처리
        //   삼키지 않는다 — 삼키면 아래 완료 표시가 그날을 닫아 버려 납입이 사라진다(C9).
        //   상품 단위 마커(lastDepositDate)가 재실행을 안전하게 해 준다.
        savingsResult = await processDailySavingsDeposits();
        logger.info(`[midnightReset] 적금 자동 납입 완료:`, savingsResult);
      } catch (resetError) {
        // 실패했으면 락을 풀어 다음 실행이 재시도할 수 있게 한다(안 풀면 그날은 영영 못 돈다).
        await releasePeriodLock(resetLockRef, todayStr, resetError);
        throw resetError;
      }

      // 🔥 완료 표시는 성공 뒤에
      await completePeriodLock(resetLockRef, todayStr, {
        date: todayStr,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({
        success: true,
        message: "일일 과제 리셋 + 적금 자동 납입 완료",
        date: todayStr,
        savings: savingsResult,
      });
    } catch (error) {
      logger.error("[midnightReset] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// 주급 지급용 GET 엔드포인트 (매주 금요일 또는 원하는 요일에 실행)
exports.weeklySalary = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      logger.info(`[weeklySalary] 주급 지급 시작`);

      const forceRun = req.query.force === "true";
      const weekKeyOverride = req.query.weekKey || null; // 예: "2026-W15" (미지급 주 재지급용)
      // 🔐 둘 다 학급·학생 단위 멱등 마커를 통째로 무시한다 → 전 학급 재지급이 된다.
      //    파라미터 없는 평범한 재호출(이월분 복구)은 마커가 걸러 주므로 게이트를 안 탄다.
      if (
        (forceRun || weekKeyOverride) &&
        !requireForceAuth(req, res, `주급 강제 재지급(force=${forceRun}, weekKey=${weekKeyOverride || "-"})`)
      ) {
        return;
      }
      const result = await payWeeklySalariesLogic(forceRun, weekKeyOverride);

      res.json({ success: true, message: "주급 지급 완료", ...result });
    } catch (error) {
      logger.error("[weeklySalary] 오류:", error, error?.stack);
      res.status(500).json({
        success: false,
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
);

// ===================================================================================
// 🔁 주급 기록 소급 백필 endpoint - 과거 totalSalaryReceived를 내 재산 거래내역에 1건으로 요약 기록
// 파라미터: token, confirm=YES (필수), dryRun (기본 true)
// 각 학생당 activity_logs/salary_backfill_{userId} 문서로 멱등 처리
// ===================================================================================
exports.backfillSalaryLogs = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const confirm = req.query.confirm;
      const dryRun = req.query.dryRun !== "false"; // 기본 true

      if (!dryRun && confirm !== "YES") {
        res.status(400).json({
          success: false,
          error: "실제 실행하려면 confirm=YES가 필요합니다 (dryRun=false일 때)",
        });
        return;
      }
      // 🔐 과거 주급 기록을 소급 생성하는 일회성 마이그레이션. 정기 작업 토큰만으로는 못 돌린다.
      if (!dryRun && !requireForceAuth(req, res, "주급 기록 소급 백필")) return;

      logger.info(`[backfillSalaryLogs] 시작 (dryRun=${dryRun})`);

      // 전체 학생(비관리자) 조회
      const studentsSnap = await db
        .collection("users")
        .where("isAdmin", "==", false)
        .get();

      // 백필 로그 TTL: 1년
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + 365);
      const expireTs = admin.firestore.Timestamp.fromDate(expireAt);

      let processed = 0;
      let skippedNoSalary = 0;
      let skippedNoClass = 0;
      let totalBackfilledAmount = 0;
      const perClassSummary = {};

      // Firestore batch 한도(500) 고려해 청크 단위 커밋
      const CHUNK = 100; // 학생당 2 ops(log + tx) → 200 ops/chunk
      let batch = db.batch();
      let pendingOps = 0;

      for (const studentDoc of studentsSnap.docs) {
        const data = studentDoc.data();
        if (data.isSuperAdmin || data.isTeacher) continue;

        const total = Number(data.totalSalaryReceived) || 0;
        if (total <= 0) {
          skippedNoSalary++;
          continue;
        }
        const classCode = data.classCode;
        if (!classCode) {
          skippedNoClass++;
          continue;
        }

        const studentName = data.name || data.nickname || "학생";
        const summary = `[주급 누적 소급] 과거 주급 합계 ${total.toLocaleString()}원 (개별 내역 없음)`;

        if (!dryRun) {
          // 멱등성: 고정 문서 ID 사용
          const logRef = db.collection("activity_logs").doc(`salary_backfill_${studentDoc.id}`);
          batch.set(logRef, {
            userId: studentDoc.id,
            userName: studentName,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "salaryPaymentBackfill",
            amount: total,
            description: summary,
            classCode,
            totalSalaryReceived: total,
            expireAt: expireTs,
            backfill: true,
          });

          const txRef = db.collection("users")
            .doc(studentDoc.id)
            .collection("transactions")
            .doc(`salary_backfill_${studentDoc.id}`);
          batch.set(txRef, {
            amount: total,
            description: summary,
            type: "salaryPaymentBackfill",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            backfill: true,
          });

          pendingOps += 2;
          if (pendingOps >= CHUNK * 2) {
            await batch.commit();
            batch = db.batch();
            pendingOps = 0;
          }
        }

        processed++;
        totalBackfilledAmount += total;
        if (!perClassSummary[classCode]) {
          perClassSummary[classCode] = { count: 0, total: 0 };
        }
        perClassSummary[classCode].count++;
        perClassSummary[classCode].total += total;
      }

      if (!dryRun && pendingOps > 0) {
        await batch.commit();
      }

      logger.info(
        `[backfillSalaryLogs] 완료: ${processed}명, 총 ${totalBackfilledAmount.toLocaleString()}원 (dryRun=${dryRun})`,
      );

      res.json({
        success: true,
        dryRun,
        processed,
        skippedNoSalary,
        skippedNoClass,
        totalBackfilledAmount,
        perClassSummary,
      });
    } catch (error) {
      logger.error("[backfillSalaryLogs] 오류:", error, error?.stack);
      res.status(500).json({
        success: false,
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
);

// 🎰 깨진 랜덤뽑기 인벤토리 보정 (선물·개인상점 거래로 doc id 랜덤화 + 메타 누락된 것 복구)
// 파라미터: token, dryRun(기본 true), confirm=YES (dryRun=false일 때 필수)
// 동작: 각 유저 inventory의 type==randomDraw doc을 itemId별로 묶어
//   ① doc id=itemId 정본으로 통합(수량 합산) ② storeItems에서 메타(drawCandidates 등) 복원
//   ③ doc id≠itemId인 중복 doc 삭제. 멱등(여러 번 실행해도 안전).
exports.backfillDrawItems = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const confirm = req.query.confirm;
      const dryRun = req.query.dryRun !== "false"; // 기본 true
      if (!dryRun && confirm !== "YES") {
        res.status(400).json({
          success: false,
          error: "실제 실행하려면 confirm=YES가 필요합니다 (dryRun=false일 때)",
        });
        return;
      }
      // 🔐 학생 인벤토리 문서를 병합·삭제하는 일회성 마이그레이션.
      if (!dryRun && !requireForceAuth(req, res, "랜덤뽑기 인벤토리 보정")) return;

      logger.info(`[backfillDrawItems] 시작 (dryRun=${dryRun})`);

      const usersSnap = await db.collection("users").get();
      const storeCache = {}; // itemId -> storeItem data | null
      const hasCands = (m) =>
        m && Array.isArray(m.drawCandidates) && m.drawCandidates.length > 0;

      let scannedUsers = 0;
      let drawDocs = 0;
      let fixedGroups = 0;
      let deletedDupDocs = 0;
      let unresolvable = 0;
      const samples = [];

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const invSnap = await userDoc.ref
          .collection("inventory")
          .where("type", "==", "randomDraw")
          .get();
        if (invSnap.empty) continue;
        scannedUsers++;
        drawDocs += invSnap.size;

        // itemId별 그룹핑
        const groups = {};
        invSnap.forEach((d) => {
          const data = d.data();
          const itemId = data.itemId || d.id;
          (groups[itemId] = groups[itemId] || []).push({ id: d.id, ref: d.ref, data });
        });

        for (const itemId in groups) {
          const docs = groups[itemId];
          // 정상: doc 1개 + doc id==itemId + drawSource 유효 + drawCandidates 있음
          const healthy =
            docs.length === 1 &&
            docs[0].id === itemId &&
            (docs[0].data.drawSource === "food" || docs[0].data.drawSource === "item") &&
            hasCands(docs[0].data);
          if (healthy) continue;

          // 메타 소스: storeItems 우선, 없으면 보유 doc 중 후보 가진 것
          if (storeCache[itemId] === undefined) {
            const ss = await db.collection("storeItems").doc(itemId).get();
            storeCache[itemId] = ss.exists ? ss.data() : null;
          }
          let metaSrc = storeCache[itemId];
          if (!hasCands(metaSrc)) {
            const withMeta = docs.find((x) => hasCands(x.data));
            if (withMeta) metaSrc = withMeta.data;
          }
          if (!hasCands(metaSrc)) {
            unresolvable++;
            if (samples.length < 20)
              samples.push({ uid, itemId, reason: "메타 복원 불가(상점·보유doc 모두 후보 없음)" });
            continue;
          }

          const totalQty = docs.reduce((s, x) => s + (x.data.quantity || 0), 0);
          const sample = docs[0].data;
          const dupIds = docs.filter((x) => x.id !== itemId);
          fixedGroups++;
          if (samples.length < 20)
            samples.push({ uid, itemId, docIds: docs.map((x) => x.id), totalQty });

          if (!dryRun) {
            const batch = db.batch();
            const canonRef = userDoc.ref.collection("inventory").doc(itemId);
            batch.set(
              canonRef,
              {
                itemId,
                name: metaSrc.name || sample.name || "아이템",
                icon: metaSrc.icon || sample.icon || "🎁",
                description: metaSrc.description || sample.description || "",
                type: "randomDraw",
                quantity: totalQty,
                drawSource: metaSrc.drawSource === "item" ? "item" : "food",
                loseEnabled: metaSrc.loseEnabled === true,
                losePercent: Number(metaSrc.losePercent) || 0,
                drawCandidates: metaSrc.drawCandidates,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            dupIds.forEach((x) => batch.delete(x.ref));
            await batch.commit();
          }
          deletedDupDocs += dupIds.length;
        }
      }

      logger.info(
        `[backfillDrawItems] 완료 (dryRun=${dryRun}): 수정그룹 ${fixedGroups}, 중복doc삭제 ${deletedDupDocs}, 복원불가 ${unresolvable}`,
      );

      res.json({
        success: true,
        dryRun,
        scannedUsers,
        drawDocs,
        fixedGroups,
        deletedDupDocs,
        unresolvable,
        samples,
      });
    } catch (error) {
      logger.error("[backfillDrawItems] 오류:", error, error?.stack);
      res.status(500).json({
        success: false,
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }
  },
);

// 월세 징수용 GET 엔드포인트 (매주 금요일 14:40에 실행)
exports.weeklyRent = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      logger.info(`[weeklyRent] 월세 징수 시작`);

      // 🔒 weeklyEconomySchedulerV2 와 **같은 락 문서**를 원자적으로 점유한다.
      //   종전엔 `.get()` 후 징수하고 **끝에** 락을 걸어서, 실행 중에는 점유가 아예 없었다 —
      //   자동(cron)과 수동(이 엔드포인트)이 겹치거나 수동이 두 번 호출되면 **이중 징수**됐다.
      //   이 엔드포인트는 죽은 코드가 아니다: index.js:49 가 export 하고
      //   .github/workflows/scheduler.yml 의 workflow_dispatch 가 지금도 호출한다.
      const forceRun = req.query.force === "true";
      if (forceRun && !requireForceAuth(req, res, "월세 강제 재징수")) return;
      const now = new Date();
      const weekKey = computeWeekKey(now);
      const lockRef = db.collection("systemState").doc("lastWeeklyRent");
      const claimed = await claimPeriodLock(lockRef, weekKey, {
        forceRun,
        label: "weeklyRent(수동)",
      });
      if (!claimed) {
        res.json({ success: true, message: "이번 주 이미 월세 징수 완료", skipped: true, weekKey });
        return;
      }

      try {
        await collectWeeklyRentLogic();
      } catch (jobError) {
        await releasePeriodLock(lockRef, weekKey, jobError);
        throw jobError;
      }

      await completePeriodLock(lockRef, weekKey, {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, message: "월세 징수 완료", weekKey });
    } catch (error) {
      logger.error("[weeklyRent] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// 부동산 보유세 자동 징수용 GET 엔드포인트 (매주 금요일 오전 8시에 실행)
exports.weeklyPropertyTax = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      // 방학 모드 체크
      const vacationMode = await isVacationMode();
      if (vacationMode) {
        logger.info(`[weeklyPropertyTax] 방학 모드 - 작업 건너뜀`);
        res.json({
          success: true,
          message: "방학 모드 - 스케줄러 비활성화됨",
          vacationMode: true,
        });
        return;
      }

      // 🔒 weeklyRent 와 같은 이유로 원자적 점유. (자동 cron 과 락 문서를 공유한다.)
      const forceRun = req.query.force === "true";
      if (forceRun && !requireForceAuth(req, res, "재산세 강제 재징수")) return;
      const now = new Date();
      const weekKey = computeWeekKey(now);
      const lockRef = db.collection("systemState").doc("lastPropertyTax");
      const claimed = await claimPeriodLock(lockRef, weekKey, {
        forceRun,
        label: "weeklyPropertyTax(수동)",
      });
      if (!claimed) {
        res.json({ success: true, message: "이번 주 이미 보유세 징수 완료", skipped: true, weekKey });
        return;
      }

      logger.info(`[weeklyPropertyTax] 재산세 자동 징수 시작 (${weekKey})`);

      try {
        await collectPropertyHoldingTaxesLogic();
      } catch (jobError) {
        await releasePeriodLock(lockRef, weekKey, jobError);
        throw jobError;
      }

      await completePeriodLock(lockRef, weekKey, {
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, message: "재산세 징수 완료 (전체 자산 1%)", weekKey });
    } catch (error) {
      logger.error("[weeklyPropertyTax] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);


// ===================================================================================
// 🚨 일회성 회수 endpoint - 2026-04-13 테스트 중복 지급 롤백용
// weekKey + confirm=YES + dryRun 파라미터 필수
// lastNetSalary 필드 기반으로 학생 cash/totalSalaryReceived 차감, 관리자 cash 환원
// schedulerLocks/lastSalaryReversal_{weekKey} 로 중복 실행 방지
// ===================================================================================
exports.reverseLastWeeklySalary = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 540,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const weekKey = req.query.weekKey;
      const confirm = req.query.confirm;
      const dryRun = req.query.dryRun !== "false"; // 기본 true - 안전
      const targetDateStr = req.query.targetDate; // KST yyyy-MM-dd, 기본 오늘

      if (!weekKey) {
        res.status(400).json({ success: false, error: "weekKey 파라미터 필수" });
        return;
      }

      if (!dryRun && confirm !== "YES") {
        res.status(400).json({
          success: false,
          error: "실제 실행하려면 confirm=YES 파라미터가 필요합니다 (dryRun=false일 때)",
        });
        return;
      }
      // 🔐 학생 현금을 **되가져오는** 조작이다. 지급보다 더 강하게 막는다.
      if (!dryRun && !requireForceAuth(req, res, `주급 회수 ${weekKey}`)) return;

      // 🔒 중복 실행 방지 — 다른 주기작업과 같은 락 규약. 종전엔 `.get()` 으로 보고
      //   회수를 다 한 **뒤에** 락을 걸어서, 두 번 호출되면 **두 번 회수**됐다(돈을 두 번 뺏는다).
      //   dryRun 은 아무것도 안 바꾸므로 점유하지 않는다.
      const reversalLockRef = db.collection("schedulerLocks").doc(`lastSalaryReversal_${weekKey}`);
      let reversalClaimed = false;
      if (!dryRun) {
        reversalClaimed = await claimPeriodLock(reversalLockRef, weekKey, {
          label: `주급 회수 ${weekKey}`,
        });
        if (!reversalClaimed) {
          const existing = await reversalLockRef.get();
          res.status(409).json({
            success: false,
            error: `이미 ${weekKey} 주급 회수가 실행되었거나 진행 중입니다`,
            executedAt: existing.exists ? existing.data().timestamp : null,
          });
          return;
        }
      }

      logger.info(`[reverseSalary] 시작 (weekKey=${weekKey}, dryRun=${dryRun}, targetDate=${targetDateStr || "today"})`);

      // KST 기준 대상 날짜 범위 (lastSalaryDate가 해당 날짜인 학생만 대상)
      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      let todayKst;
      if (targetDateStr) {
        const [y, m, d] = targetDateStr.split("-").map(Number);
        todayKst = new Date(Date.UTC(y, m - 1, d));
      } else {
        todayKst = new Date(Date.UTC(
          kstNow.getUTCFullYear(),
          kstNow.getUTCMonth(),
          kstNow.getUTCDate(),
        ));
      }
      const todayStartUtc = new Date(todayKst.getTime() - 9 * 60 * 60 * 1000);
      const tomorrowStartUtc = new Date(todayStartUtc.getTime() + 24 * 60 * 60 * 1000);

      // 진단: 해당 날짜 KST 범위의 activity_logs에서 salaryPayment 카운트
      // 단일 timestamp 범위 쿼리 (자동 인덱스) → 코드에서 type 필터
      const diagLogsSnap = await db.collection("activity_logs")
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(todayStartUtc))
        .where("timestamp", "<", admin.firestore.Timestamp.fromDate(tomorrowStartUtc))
        .get();
      const logCountByUser = {};
      const logsByClass = {};
      let salaryLogCount = 0;
      diagLogsSnap.forEach((doc) => {
        const d = doc.data();
        if (d.type !== "salaryPayment") return;
        salaryLogCount++;
        logCountByUser[d.userId] = (logCountByUser[d.userId] || 0) + 1;
        logsByClass[d.classCode] = (logsByClass[d.classCode] || 0) + 1;
      });
      const duplicateUsers = Object.entries(logCountByUser)
        .filter(([, count]) => count >= 2)
        .map(([uid, count]) => ({ uid, count }));
      logger.info(`[reverseSalary] 진단: ${todayKst.toISOString().split("T")[0]} 전체 activity_logs ${diagLogsSnap.size}건 중 salaryPayment ${salaryLogCount}건, 학생당 2회 이상=${duplicateUsers.length}명`);

      const classCodes = await getAllActiveClassCodes();
      const reversalPlan = [];
      let totalReversedCount = 0;
      let totalReversedAmount = 0;

      for (const classCode of classCodes) {
        // 학급 학생 조회
        const studentsSnap = await db
          .collection("users")
          .where("classCode", "==", classCode)
          .where("isAdmin", "==", false)
          .get();

        // 학급 관리자
        const adminSnap = await findApprovedAdminSnap(classCode);
        const adminDoc = adminSnap.empty ? null : adminSnap.docs[0];

        let classSum = 0;
        const classTargets = [];

        for (const studentDoc of studentsSnap.docs) {
          const data = studentDoc.data();
          const lastNet = data.lastNetSalary || 0;
          const lastDate = data.lastSalaryDate;
          if (!lastDate || lastNet <= 0) continue;

          // lastSalaryDate가 오늘 범위인 학생만
          const lastDateMs = lastDate.toDate ? lastDate.toDate().getTime() : new Date(lastDate).getTime();
          if (lastDateMs < todayStartUtc.getTime() || lastDateMs >= tomorrowStartUtc.getTime()) continue;

          classTargets.push({
            userId: studentDoc.id,
            name: data.name || data.nickname || "?",
            lastNetSalary: lastNet,
          });
          classSum += lastNet;
        }

        if (classTargets.length === 0) continue;

        reversalPlan.push({
          classCode,
          studentCount: classTargets.length,
          classSum,
          adminFound: !!adminDoc,
        });

        if (!dryRun) {
          const batch = db.batch();
          for (const target of classTargets) {
            const ref = db.collection("users").doc(target.userId);
            batch.update(ref, {
              cash: admin.firestore.FieldValue.increment(-target.lastNetSalary),
              totalSalaryReceived: admin.firestore.FieldValue.increment(-target.lastNetSalary),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          if (adminDoc) {
            batch.update(adminDoc.ref, {
              cash: admin.firestore.FieldValue.increment(classSum),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
          logger.info(`[reverseSalary] ${classCode}: ${classTargets.length}명 ${classSum.toLocaleString()}원 회수`);
        }

        totalReversedCount += classTargets.length;
        totalReversedAmount += classSum;
      }

      if (!dryRun) {
        // 완료 표시는 회수가 **끝난 뒤**. 중간에 죽으면 in-progress 로 남고,
        // 20분 stale 회수 후에만 재시도가 열린다(그 사이 두 번 회수되는 창이 없다).
        await completePeriodLock(reversalLockRef, weekKey, {
          totalReversedCount,
          totalReversedAmount,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      res.json({
        success: true,
        dryRun,
        weekKey,
        targetDate: todayKst.toISOString().split("T")[0],
        diagnosis: {
          totalActivityLogsOnDate: diagLogsSnap.size,
          salaryLogsOnDate: salaryLogCount,
          logsByClass,
          duplicateUserCount: duplicateUsers.length,
          duplicateUsersSample: duplicateUsers.slice(0, 10),
        },
        totalReversedCount,
        totalReversedAmount,
        plan: reversalPlan,
      });
    } catch (error) {
      logger.error("[reverseSalary] 오류:", error, error?.stack);
      // ⚠️ 여기서는 락을 **일부러 풀지 않는다.** 회수는 학생 현금을 되가져오는 작업이라
      //    부분 실패 후 자동 재시도하면 이미 회수된 학생에게서 **두 번** 빼앗는다
      //    (학생 단위 멱등 마커가 없다). 사람이 로그를 보고 판단해야 한다.
      res.status(500).json({
        success: false,
        error: error?.message || String(error),
        lockHeld: true,
        note:
          "회수가 중간에 실패했습니다. 락은 잡힌 채로 둡니다 — 자동 재시도가 이미 회수된 " +
          "학생에게서 두 번 빼앗는 것을 막기 위해서입니다. 로그로 어디까지 처리됐는지 " +
          "확인한 뒤 수동으로 결정하세요.",
        stack: error?.stack,
      });
    }
  },
);

// Deprecated: cleanupOldNews 함수 제거
// 이유: 뉴스 기능 자체가 제거됐다(정리 대상이 없다).

// 🔥 경제 이벤트 스케줄러 (매시간 실행 - cron-job.org)
// 평일 설정된 시간(기본 오후 1시)에 랜덤 경제 이벤트 발생
const {
  runEconomicEventsForAllClasses,
  triggerClassEconomicEvent,
} = require("./economicEvents");

exports.economicEventScheduler = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 300,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      // 📈 경제 이벤트(주가·물가 변동)는 방학 모드와 무관하게 항상 작동.

      logger.info("[economicEventScheduler] 경제 이벤트 스케줄러 실행");

      const result = await runEconomicEventsForAllClasses();

      res.json({ success: true, ...result });
    } catch (error) {
      logger.error("[economicEventScheduler] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// 🔥 경제 이벤트 수동 실행 (관리자용 onCall)
exports.triggerEconomicEventManual = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin } = await checkAuthAndGetUserData(
      request,
      true,
    );

    const { forceEventId } = request.data || {};

    logger.info(
      `[triggerEconomicEvent] 수동 실행 - 관리자: ${uid}, 학급: ${classCode}`,
    );

    try {
      const result = await triggerClassEconomicEvent(
        classCode,
        forceEventId || "FORCE",
      );
      if (!result) {
        throw new HttpsError(
          "failed-precondition",
          "이벤트를 실행할 수 없습니다. 이벤트 설정을 확인하세요.",
        );
      }
      return { success: true, ...result };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("[triggerEconomicEvent] 오류:", error);
      throw new HttpsError("internal", error.message || "이벤트 실행 실패");
    }
  },
);

// 🔥 주간 세금(순자산세 + 부동산 보유세) 수동 징수 (관리자용 onCall)
//   자동 금요일 징수와 100% 동일 로직(collectPropertyHoldingTaxesLogic)을 본인 학급에만 실행.
exports.collectWeeklyTaxesManual = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request, true);
    logger.info(`[수동세금] 관리자 ${uid}, 학급 ${classCode} 주간 세금 징수`);
    try {
      // 교사 수동 버튼은 강제 징수(force) — 같은 주 재징수도 허용(기존 동작 유지).
      //   단 여기서 lastWeeklyTaxWeekKey가 갱신되므로, 이후 금요일 자동 징수는 이 학급을 스킵(이중과세 방지).
      const result = await collectPropertyHoldingTaxesLogic(classCode, {
        force: true,
        source: "manual",
        triggeredBy: uid,
      });
      return {
        success: true,
        totalCollected: result?.totalCollected || 0,
        userCount: result?.totalUsersProcessed || 0,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("[수동세금] 오류:", error);
      throw new HttpsError("internal", error.message || "세금 징수 실패");
    }
  },
);

// 🔥 국세청장(교사 임명 국세청 직원) 학생용 주간 세금 징수 (onCall)
//   - 관리자용 collectWeeklyTaxesManual과 동일한 로직(collectPropertyHoldingTaxesLogic)을 쓰되,
//     ① 호출자가 '교사 임명(appointedJobIds)' 국세청 직원인지 서버가 재검증(자가선택 무효 — jobUtils appointed-only)
//     ② 주 1회 쿨다운: governmentSettings.lastWeeklyTaxWeekKey 를 트랜잭션으로 선점해
//        officer 중복클릭 레이스 + 자동/교사 징수 후 중복 징수를 차단(이중과세 방지).
//   되돌리기 어려운 학생 자산 대량 차감이라 두 게이트를 모두 서버에서 강제한다.
exports.collectWeeklyTaxesByOfficer = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    // 관리자 요구 아님(false) — 학생 국세청장이 호출한다.
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request, false);
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 정보가 없습니다.");
    }

    // ① 권한: 교사가 임명한 국세청 직원만. jobUtils.hasJobTitle은 appointed-only 직업을
    //    appointedJobIds에서만 인정하므로, 학생이 selectedJobIds에 국세청 직원을 넣어도 무효.
    const jobsSnap = await db
      .collection("jobs")
      .where("classCode", "==", classCode)
      .get();
    const jobMap = buildJobMap(jobsSnap);
    if (!hasJobTitle(userData, jobMap, "국세청 직원")) {
      throw new HttpsError(
        "permission-denied",
        "선생님이 허가한 국세청 직원만 세금을 징수할 수 있습니다.",
      );
    }

    // 국고(=승인 관리자) 존재 확인 후 선점 — 관리자 없는 학급은 징수 대상이 없어
    //   로직이 continue로 빠지는데, 그 전에 weekKey를 선점하면 "마킹됐지만 0원 징수"로
    //   그 주 재시도가 막힌다(codex 관찰). 선점 전에 막아 이 상태를 원천 차단한다.
    const officerAdminSnap = await findApprovedAdminSnap(classCode);
    if (officerAdminSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "국고(담당 선생님) 계정이 없어 세금을 징수할 수 없습니다.",
      );
    }

    // 주차 키(KST) — 로직 본체와 동일한 단일 진실원(computeKstWeekKey) 사용.
    const weekKey = computeKstWeekKey();

    // ② 주 1회 쿨다운 선점 — 트랜잭션으로 weekKey를 원자적으로 claim.
    //    이미 이번 주 걷혔으면(자동/교사/이전 officer 포함) skipped 반환.
    const gsRef = db.collection("governmentSettings").doc(classCode);
    try {
      await db.runTransaction(async (tx) => {
        const gsDoc = await tx.get(gsRef);
        if (gsDoc.exists && gsDoc.data().lastWeeklyTaxWeekKey === weekKey) {
          throw new HttpsError("already-exists", "이번 주 세금은 이미 징수되었습니다.");
        }
        tx.set(
          gsRef,
          {
            lastWeeklyTaxWeekKey: weekKey,
            lastWeeklyTaxAt: admin.firestore.FieldValue.serverTimestamp(),
            lastWeeklyTaxBy: uid,
            lastWeeklyTaxSource: "officer",
          },
          { merge: true },
        );
      });
    } catch (error) {
      if (error instanceof HttpsError && error.code === "already-exists") {
        logger.info(`[국세청장세금] ${classCode} ${weekKey} 이미 징수됨 — skip (officer ${uid})`);
        return { success: true, skipped: true, weekKey };
      }
      throw error;
    }

    // weekKey 선점 성공 → 실제 징수 실행.
    //   force=true: 방금 선점한 weekKey 때문에 로직의 멱등 스킵에 걸려 자기 징수가 무효화되는 걸 방지.
    //     중복 클릭·재실행은 위 트랜잭션 선점이 이미 차단했다.
    //   weekKey 전달: 선점 키와 징수 키를 동일하게 고정(주 경계 race 제거).
    logger.info(`[국세청장세금] 국세청 직원 ${uid}, 학급 ${classCode} 주간 세금 징수 (${weekKey})`);
    try {
      const result = await collectPropertyHoldingTaxesLogic(classCode, {
        force: true,
        weekKey,
        source: "officer",
        triggeredBy: uid,
      });
      return {
        success: true,
        skipped: false,
        weekKey,
        totalCollected: result?.totalCollected || 0,
        userCount: result?.totalUsersProcessed || 0,
      };
    } catch (error) {
      // 징수 로직이 실패해도 weekKey는 선점된 상태로 남는다(officer 재시도 차단).
      //   드문 실패 시엔 교사가 관리자용 즉시 징수로 백업 가능 — 학생 자산 이중 차감 위험을
      //   재시도 허용보다 우선한다(over-block > double-tax).
      if (error instanceof HttpsError) throw error;
      logger.error("[국세청장세금] 오류:", error);
      throw new HttpsError("internal", error.message || "세금 징수 실패");
    }
  },
);

// 🔥 경제 이벤트 설정 저장 (관리자용 onCall)
exports.saveEconomicEventSettings = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request, true);

    const { enabled, triggerHour, events } = request.data || {};

    if (triggerHour !== undefined && (triggerHour < 0 || triggerHour > 23)) {
      throw new HttpsError(
        "invalid-argument",
        "트리거 시간은 0~23 사이여야 합니다.",
      );
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: uid,
      classCode,
    };

    if (enabled !== undefined) updateData.enabled = enabled;
    if (triggerHour !== undefined) updateData.triggerHour = triggerHour;
    if (events !== undefined) updateData.events = events;

    await db
      .collection("economicEventSettings")
      .doc(classCode)
      .set(updateData, { merge: true });

    logger.info(`[saveEconomicEventSettings] ${classCode}: 설정 저장 완료`);
    return { success: true };
  },
);

// 🔥 실제 주식 생성 (관리자용 Cloud Function)
exports.createRealStocksFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    const { stocks } = request.data;

    logger.info("[createRealStocks] 실제 주식 생성 요청 - 관리자 호출");

    try {
      // 사용자가 지정한 주식 목록이 있으면 사용, 없으면 기본 목록 사용
      const stocksToCreate =
        stocks && stocks.length > 0 ? stocks : DEFAULT_REAL_STOCKS;

      const result = await createRealStocks(stocksToCreate);
      const snapshotResult = await updateCentralStocksSnapshot();

      return {
        success: true,
        message: `실제 주식 ${result.created}개 생성 완료 (스냅샷 ${snapshotResult.count}개)`,
        created: result.created,
        snapshot: snapshotResult,
      };
    } catch (error) {
      logger.error("[createRealStocks] 오류:", error);
      throw new HttpsError("internal", error.message || "실제 주식 생성 실패");
    }
  },
);

// 🔥 중복 주식 정리 (관리자용 Cloud Function)
exports.deduplicateStocksFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true);

    logger.info("[deduplicateStocks] 중복 주식 정리 요청 - 관리자 호출");

    try {
      const result = await deduplicateStocks();
      const snapshotResult = await updateCentralStocksSnapshot();

      return {
        success: true,
        message: `중복 주식 ${result.deleted}개 삭제, ${result.kept}개 유지 (스냅샷 ${snapshotResult.count}개)`,
        ...result,
        snapshot: snapshotResult,
      };
    } catch (error) {
      logger.error("[deduplicateStocks] 오류:", error);
      throw new HttpsError("internal", error.message || "중복 주식 정리 실패");
    }
  },
);

// 🔥 실제 주식 가격 수동 업데이트 (관리자용 Cloud Function)
exports.updateRealStocksFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    logger.info(
      "[updateRealStocks] 실제 주식 가격 수동 업데이트 요청 - 관리자 호출",
    );

    try {
      const result = await updateRealStockPrices();
      // 🔥 여기도 재조회 생략 (관리자 수동 갱신 경로)
      const snapshotResult = await updateCentralStocksSnapshot(result);

      // ⚠️ listedDocs/appliedUpdates는 스냅샷 생성용 내부 값이다.
      //   callable 응답에 그대로 펼치면 Map은 {}로 뭉개지고 문서 22개가 통째로
      //   클라이언트에 실려 나간다 — 반드시 제외하고 반환할 것.
      const { listedDocs: _ld, appliedUpdates: _au, ...publicResult } = result;

      return {
        success: true,
        message: `실제 주식 업데이트 완료 - 성공: ${result.updated}, 실패: ${result.failed} (스냅샷 ${snapshotResult.count}개)`,
        ...publicResult,
        snapshot: snapshotResult,
      };
    } catch (error) {
      logger.error("[updateRealStocks] 오류:", error);
      throw new HttpsError(
        "internal",
        error.message || "실제 주식 업데이트 실패",
      );
    }
  },
);

// 🔥 개별 실제 주식/ETF 추가 (관리자용 Cloud Function)
exports.addSingleRealStockFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    const { name, symbol, sector, productType } = request.data;

    if (!name) {
      throw new HttpsError("invalid-argument", "주식 이름이 필요합니다.");
    }

    logger.info(`[addSingleRealStock] 개별 실제 주식 추가 요청: ${name}`);

    try {
      const result = await addSingleRealStock({
        name,
        symbol,
        sector,
        productType,
      });

      if (!result.success) {
        throw new HttpsError("failed-precondition", result.error);
      }

      const snapshotResult = await updateCentralStocksSnapshot();

      return {
        success: true,
        message: `${name} 추가 완료! (스냅샷 ${snapshotResult.count}개)`,
        stock: result.stock,
        snapshot: snapshotResult,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("[addSingleRealStock] 오류:", error);
      throw new HttpsError("internal", error.message || "주식 추가 실패");
    }
  },
);

// 🔥 스냅샷만 별도로 갱신 (관리자용)
exports.updateStocksSnapshotFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능
    logger.info("[updateStocksSnapshot] 스냅샷 갱신 요청 - 관리자 호출");

    try {
      const snapshotResult = await updateCentralStocksSnapshot();

      return {
        success: true,
        message: `스냅샷 갱신 완료 - ${snapshotResult.count}개`,
        ...snapshotResult,
      };
    } catch (error) {
      logger.error("[updateStocksSnapshot] 오류:", error);
      throw new HttpsError("internal", error.message || "스냅샷 갱신 실패");
    }
  },
);

// 🔥 스냅샷 조회 (사용자용) - 없으면 생성 후 반환
exports.getStocksSnapshotFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, false); // 일반 사용자도 가능
    logger.info("[getStocksSnapshot] 스냅샷 조회 요청");

    try {
      const snapshot = await getCentralStocksSnapshot();
      return {
        success: true,
        ...snapshot,
      };
    } catch (error) {
      logger.error("[getStocksSnapshot] 오류:", error);
      throw new HttpsError("internal", error.message || "스냅샷 조회 실패");
    }
  },
);

// 🔥 관리자용 단일 주식 추가 (규칙 우회용)
exports.addStockDocFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    const { stock } = request.data || {};
    if (!stock || !stock.name || !stock.price || !stock.minListingPrice) {
      throw new HttpsError(
        "invalid-argument",
        "stock(name, price, minListingPrice)이 필요합니다.",
      );
    }

    // 🔒 진위(truthy) 검사만으로는 음수를 못 막는다. price: -100 은 truthy 라 통과했고,
    //    buyStock 의 cost = price × quantity 가 음수가 되어 잔액 검사를 우회하고
    //    increment(-totalCost) 가 현금을 **발행**했다(2026-08-11 교차검증). CentralStocks 는
    //    학급 구분이 없는 전역 컬렉션이라 교사 한 명의 오타가 전 학급에 열린다.
    //
    //    ⚠️ "유한한 양수"만으로도 부족하다(2차 교차검증에서 codex 가 뚫었다):
    //      · Number.MIN_VALUE(5e-324)는 유한 양수라 통과 → cost 가 0 으로 반올림돼 **공짜 매수**.
    //        게다가 실물가 갱신이 최소 100원으로 올려 주므로 되팔면 무담보 차익이 된다.
    //      · Number.MAX_VALUE 는 유한하지만 × 수량 하면 **Infinity** → increment(Infinity).
    //    그래서 **1 이상 100억 이하의 정수**로 좁힌다(다른 금액 검증과 같은 상한).
    for (const [key, label] of [
      ["price", "현재가"],
      ["minListingPrice", "최소 상장가"],
    ]) {
      const v = stock[key];
      if (!isValidStockPrice(v)) {
        throw new HttpsError(
          "invalid-argument",
          `${label}는 1 이상 ${MAX_STOCK_PRICE.toLocaleString()} 이하의 정수여야 합니다. (받은 값: ${v})`,
        );
      }
    }
    if (stock.volatility !== undefined) {
      const vol = stock.volatility;
      if (typeof vol !== "number" || !Number.isFinite(vol) || vol < 0 || vol > 1) {
        throw new HttpsError(
          "invalid-argument",
          `변동성은 0~1 사이의 숫자여야 합니다. (받은 값: ${vol})`,
        );
      }
    }

    try {
      const stockRef = db.collection("CentralStocks").doc();
      const stockData = {
        ...stock,
        initialPrice: stock.price,
        priceHistory: [stock.price],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        holderCount: 0,
        tradingVolume: 1000,
        buyVolume: 0,
        sellVolume: 0,
        recentBuyVolume: 0,
        recentSellVolume: 0,
        // `||` 는 0 을 falsy 로 보고 기본값으로 덮는다 — 위에서 volatility:0 을
        // 정식으로 통과시켜 놓고 여기서 0.02 로 바꿔 버리면 "변동 없는 종목"을 만들 수 없다.
        volatility:
          stock.volatility !== undefined
            ? stock.volatility
            : stock.productType === "bond"
              ? 0.005
              : 0.02,
        isListed: stock.isListed !== undefined ? stock.isListed : true,
        isManual: !!stock.isManual,
        sector: stock.sector || "TECH",
        productType: stock.productType || "stock",
      };

      await stockRef.set(stockData);
      const snapshotResult = await updateCentralStocksSnapshot();

      return {
        success: true,
        id: stockRef.id,
        snapshot: snapshotResult,
      };
    } catch (error) {
      logger.error("[addStockDocFunction] 오류:", error);
      throw new HttpsError("internal", error.message || "주식 추가 실패");
    }
  },
);

// 🔥 사용 가능한 실제 주식 심볼 목록 조회
exports.getAvailableSymbolsFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    logger.info("[getAvailableSymbols] 사용 가능한 심볼 목록 조회");

    try {
      const symbols = getAvailableSymbols();
      const currentRate = getCurrentExchangeRate();

      return {
        success: true,
        symbols: symbols,
        exchangeRate: currentRate,
      };
    } catch (error) {
      logger.error("[getAvailableSymbols] 오류:", error);
      throw new HttpsError("internal", error.message || "심볼 목록 조회 실패");
    }
  },
);

// 🔥 환율 수동 업데이트 (관리자용 Cloud Function)
exports.updateExchangeRateFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    logger.info("[updateExchangeRate] 환율 수동 업데이트 요청");

    try {
      const result = await updateExchangeRate();

      return {
        success: true,
        message: `환율 업데이트 완료: 1 USD = ${result.rate} KRW`,
        rate: result.rate,
        updated: result.updated,
      };
    } catch (error) {
      logger.error("[updateExchangeRate] 오류:", error);
      throw new HttpsError("internal", error.message || "환율 업데이트 실패");
    }
  },
);

// 🔥 환율 자동 업데이트 스케줄러 (하루 1회 - cron-job.org용)
exports.exchangeRateScheduler = onRequest(
  {
    region: "asia-northeast3",
    timeoutSeconds: 60,
    invoker: "public",
  },
  async (req, res) => {
    try {
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      // 📈 환율 변동은 방학 모드와 무관하게 항상 작동(주식 시세의 일부).

      logger.info(`[exchangeRateScheduler] 환율 자동 업데이트 시작`);

      const result = await updateExchangeRate();

      logger.info(
        `[exchangeRateScheduler] 환율 업데이트 완료: ${result.rate}원`,
      );

      res.json({
        success: true,
        message: `환율 업데이트 완료`,
        rate: result.rate,
        updated: result.updated,
      });
    } catch (error) {
      logger.error("[exchangeRateScheduler] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// 🔥 방학 모드 토글 API (슈퍼관리자 전용)
exports.toggleVacationMode = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, isSuperAdmin, userData } = await checkAuthAndGetUserData(
      request,
      true,
    ); // 관리자만 실행 가능

    // 슈퍼관리자 체크 (role이 'super_admin'인 경우만)
    if (!isSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "슈퍼관리자만 방학 모드를 설정할 수 있습니다.",
      );
    }

    const { enabled } = request.data;

    try {
      await db.doc("Settings/scheduler").set(
        {
          vacationMode: enabled === true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: userData?.name || uid,
        },
        { merge: true },
      );

      logger.info(
        `[toggleVacationMode] 방학 모드 ${enabled ? "ON" : "OFF"} by ${userData?.name || uid}`,
      );

      return {
        success: true,
        vacationMode: enabled === true,
        message: enabled
          ? "방학 모드가 활성화되었습니다. 스케줄러가 중지됩니다."
          : "방학 모드가 해제되었습니다. 스케줄러가 다시 작동합니다.",
      };
    } catch (error) {
      logger.error("[toggleVacationMode] 오류:", error);
      throw new HttpsError("internal", error.message);
    }
  },
);

// 🔥 방학 모드 상태 조회 API
exports.getVacationModeStatus = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 조회 가능

    try {
      const settingsDoc = await db.doc("Settings/scheduler").get();
      const data = settingsDoc.exists ? settingsDoc.data() : {};

      return {
        success: true,
        vacationMode: data.vacationMode === true,
        updatedAt: data.updatedAt?.toDate?.() || null,
        updatedBy: data.updatedBy || null,
      };
    } catch (error) {
      logger.error("[getVacationModeStatus] 오류:", error);
      throw new HttpsError("internal", error.message);
    }
  },
);

// 🔥 시뮬레이션 주식 삭제 (관리자용 Cloud Function)
exports.deleteSimulationStocksFunction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능

    logger.info("[deleteSimulationStocks] 시뮬레이션 주식 삭제 요청");

    try {
      // isRealStock이 없거나 false인 주식 가져오기
      const simulationStocksSnapshot = await db
        .collection("CentralStocks")
        .where("isRealStock", "!=", true)
        .get();

      // isRealStock 필드가 없는 주식도 포함
      const allStocksSnapshot = await db.collection("CentralStocks").get();

      const stocksToDelete = [];
      allStocksSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (!data.isRealStock) {
          stocksToDelete.push(doc);
        }
      });

      if (stocksToDelete.length === 0) {
        return {
          success: true,
          message: "삭제할 시뮬레이션 주식이 없습니다.",
          deletedCount: 0,
        };
      }

      // 배치로 삭제 (500개씩)
      let deletedCount = 0;
      const batchSize = 500;

      for (let i = 0; i < stocksToDelete.length; i += batchSize) {
        const batch = db.batch();
        const chunk = stocksToDelete.slice(i, i + batchSize);

        chunk.forEach((doc) => {
          batch.delete(doc.ref);
          deletedCount++;
        });

        await batch.commit();
      }

      logger.info(
        `[deleteSimulationStocks] ${deletedCount}개의 시뮬레이션 주식 삭제 완료`,
      );

      return {
        success: true,
        message: `시뮬레이션 주식 ${deletedCount}개 삭제 완료`,
        deletedCount: deletedCount,
      };
    } catch (error) {
      logger.error("[deleteSimulationStocks] 오류:", error);
      throw new HttpsError(
        "internal",
        error.message || "시뮬레이션 주식 삭제 실패",
      );
    }
  },
);

// ===================================================================================
// 실제 로직 함수들 (대부분 Deprecated - 실제 주식만 사용)
// ===================================================================================

/**
 * FCM 푸시 알림 제거
 * 이유:
 * 1. 사용자에게 알림 스팸 (15분마다 모든 사용자에게 푸시)
 * 2. 트래픽 증가 (푸시 받으면 fetchAllData(true)로 캐시 무시하고 강제 트래픽)
 * 3. 사용자 경험 저하 (앱 꺼져있는데 계속 알림)
 *
 * 대안:
 * - 30초 캐시로 충분한 최신 데이터 제공
 * - 1분마다 자동 폴링 (부드러운 업데이트)
 * - 사용자가 원할 때 새로고침 버튼 사용
 */
// async function sendMarketUpdateNotification() {
//   const topic = 'market_updates';
//   const message = {
//     data: {
//       type: 'MARKET_UPDATE',
//       timestamp: String(Date.now()),
//     },
//     topic: topic,
//   };
//   try {
//     await admin.messaging().send(message);
//     logger.info(`→ FCM 메시지를 '${topic}' 토픽으로 발송했습니다.`);
//   } catch (error) {
//     logger.error(`FCM 메시지 발송 실패:`, error);
//   }
// }

// 🔥 적금 매일 자동 납입 처리
async function processDailySavingsDeposits() {
  logger.info("[적금] 매일 자동 납입 처리 시작");
  let processed = 0, skipped = 0, failed = 0;
  // 🔒 상품 단위 일일 멱등 마커. 이 함수는 호출 경로가 둘(hourlySchedulerV2 자정 분기 ·
  //    midnightReset public HTTP)인데 어느 쪽도 원자적 락이 아니었다. 바깥 락을 원자화해도
  //    "하루 두 번 호출되면 두 번 빠진다"는 성질 자체를 없애는 게 확실하다.
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // 모든 사용자의 적금 상품 조회 (collectionGroup)
  const savingsQuery = await db.collectionGroup("products")
    .where("type", "==", "savings")
    .where("dailyAmount", ">", 0)
    .get();

  if (savingsQuery.empty) {
    logger.info("[적금] 처리할 적금 상품 없음");
    return { processed, skipped, failed };
  }

  for (const productDoc of savingsQuery.docs) {
    const product = productDoc.data();
    const productRef = productDoc.ref;
    // users/{userId}/products/{productId} 에서 userId 추출
    const userId = productRef.parent.parent.id;

    try {
      // 이미 모든 납입 완료된 경우 건너뛰기
      if ((product.depositsCount || 0) >= product.termInDays) {
        skipped++;
        continue;
      }

      const teacherId = product.teacherId;
      if (!teacherId) {
        logger.warn(`[적금] ${userId} - teacherId 없음, 건너뜀`);
        skipped++;
        continue;
      }

      const dailyAmount = product.dailyAmount;
      const userRef = db.collection("users").doc(userId);
      const teacherRef = db.collection("users").doc(teacherId);

      await db.runTransaction(async (transaction) => {
        const [userSnap, productSnap] = await transaction.getAll(
          userRef,
          productRef,
        );
        if (!userSnap.exists) {
          throw new Error("사용자 없음");
        }

        // 🔒 오늘 이미 납입했으면 건너뛴다. 마커를 같은 트랜잭션에서 읽고 쓰므로
        //    동시 실행 두 개가 들어와도 하나만 통과한다.
        //
        //    ⚠️ 상한·마커를 **트랜잭션 안에서 다시** 본다(2026-08-11 2차 검증 C10).
        //    바깥 collectionGroup 스냅샷은 stale 이고, 같은 상품을 건드리는 경로가 하나 더 있다
        //    (`autoSavingsDeposit` CF — 회차 따라잡기 모델이라 이 마커를 쓰지 않는다).
        //    학생이 자정 즈음 수동 납입을 먼저 커밋하면 바깥 스냅샷은 그걸 못 보고,
        //    여기서 재확인하지 않으면 같은 날 한 번 더 빠진다.
        const fresh = productSnap.exists ? productSnap.data() : null;
        if (!fresh) {
          skipped++;
          return;
        }
        if (fresh.lastDepositDate === kstToday) {
          skipped++;
          return;
        }
        if ((fresh.depositsCount || 0) >= fresh.termInDays) {
          skipped++;
          return;
        }

        const userCash = userSnap.data().cash || 0;

        // 현금 부족 시 건너뛰기 (에러 아님)
        if (userCash < dailyAmount) {
          logger.info(`[적금] ${userId} - 현금 부족 (보유: ${userCash}, 필요: ${dailyAmount}), 건너뜀`);
          skipped++;
          return;
        }

        // 학생 → 선생님 이체
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(-dailyAmount),
        });
        transaction.update(teacherRef, {
          cash: admin.firestore.FieldValue.increment(dailyAmount),
        });

        // 적금 상품 업데이트
        transaction.update(productRef, {
          totalDeposited: admin.firestore.FieldValue.increment(dailyAmount),
          depositsCount: admin.firestore.FieldValue.increment(1),
          balance: admin.firestore.FieldValue.increment(dailyAmount),
          lastDepositDate: kstToday,
        });

        processed++;
      });
    } catch (error) {
      logger.error(`[적금] ${userId} 처리 오류:`, error.message);
      failed++;
    }
  }

  logger.info(`[적금] 자동 납입 완료 - 처리: ${processed}, 건너뜀: ${skipped}, 실패: ${failed}`);
  return { processed, skipped, failed };
}

// [삭제됨] 시뮬레이션 로직 - 실제 주식만 사용
// updateMarketConditionLogic, updateCentralStockMarketLogic, autoManageStocksLogic 등 제거됨

// 🏫 classes/{code} 문서의 **필드 세트 정본**.
//   같은 문서를 만드는 곳이 셋이다(슈퍼관리자 승인 화면 · 서버 초기화 · 주급 자가치유).
//   2026-08-20 리뷰에서 셋의 필드가 갈려 있었다 — 자가치유엔 teacherId 가 없고, 서버 둘은
//   settings 가 빈 객체였다. 지금은 무해하다(functions/index.js 가 `settings.initialCash || 100000`
//   으로 폴백하고 그 값이 승인 화면 하드코딩과 우연히 같다). **우연에 기대지 않는다** —
//   교사별 설정 UI 가 생기는 순간 빈 settings 로 만들어진 학급만 조용히 다르게 굴러간다.
//   ⚠️ 기본값을 바꾸려면 여기와 SuperAdminDashboard.js 의 승인 경로를 함께 고쳐야 한다.
function buildClassDoc({ classCode, teacherId, teacherName, className, schoolName, studentCount, createdBy }) {
  return {
    code: classCode,
    className: className || "",
    schoolName: schoolName || "",
    teacherId: teacherId || null,
    teacherName: teacherName || "",
    studentCount: studentCount || 0,
    settings: { initialCash: 100000, initialCoupons: 10 },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy,
  };
}

// ────────────────────────────────────────────────────────
// 공통 헬퍼: 학생 기반으로 모든 활성 classCode 추출
// settings/classCodes에 의존하지 않으므로 신규 학급도 자동 포함
// ────────────────────────────────────────────────────────
// 이미 읽어둔 학생 스냅샷에서 학급코드·인원수를 파생한다(추가 읽기 0).
// 판정식(무엇을 학생으로 보는가)은 functions/studentScope.js 가 정본 — 여기서 다시 적지 않는다.
// 스냅샷을 가진 호출부는 이 함수를 쓰고, 없는 호출부만 아래 getAllActiveClassCodes()를 쓴다.

// 🧭 학급 목록 '정본' 이행 준비 — classes 컬렉션 vs 실제 학생 분포의 드리프트를 기록한다.
//   getAllActiveClassCodes() 의 users 전량 스캔을 없애려면 classes 컬렉션을 정본으로 삼아야 하는데,
//   **오늘 그대로 갈아타면 안 된다.** 2026-08-17 실측 드리프트:
//     · classes 에 없는데 학생이 있는 학급 1건(QAZWSX12) — 갈아탔으면 그 학급 주급이 조용히 끊긴다
//     · classes 에만 있고 학생 0인 학급 3건(6ZVKV3·CLASS2025·XHAWPR)
//   그래서 지금은 **정본을 바꾸지 않는다** — 차이를 남기고, 아래처럼 빠진 쪽만 메운다.
//   주급 로그에 몇 주 연속 "일치"가 찍히면 그때 교체하는 게 안전하다(그 로그가 유일한 근거다).
//   2026-08-20 에 드리프트 4건은 정리됐지만, 그건 손으로 지운 결과지 불변식이 아니다.
//   비용: 주 1회, 문서 ID만 읽는 소형 쿼리.
async function logClassRegistryDrift(activeClassCodes, studentCounts = new Map()) {
  try {
    // 학생이 하나도 안 잡혔으면 드리프트를 논할 수 없다. 조회가 일시적으로 빈 결과를 준 것일 수도
    // 있는데, 그대로 진행하면 **등록된 모든 학급을 "학생 0"으로 기록**한다(2026-08-20 codex).
    // 그 로그가 유일한 cutover 근거라, 거짓 기록은 안 남기는 것보다 나쁘다.
    if (activeClassCodes.length === 0) {
      logger.info("[학급정본] 활성 학급 0 — 드리프트 점검을 건너뛴다(빈 조회일 수 있다)");
      return;
    }
    const snap = await db.collection("classes").select().get();
    const registered = new Set(snap.docs.map((d) => d.id));
    const missing = activeClassCodes.filter((c) => !registered.has(c));
    const empty = [...registered].filter((c) => !activeClassCodes.includes(c));

    // 🔧 관찰에서 **복구**로 (2026-08-20). 종전엔 차이를 로그로만 남겼는데, 그러면
    //   드리프트가 영원히 안 줄어든다 — 아무도 그 로그를 보고 손으로 고치지 않는다.
    //
    //   ⚠️ 정정(2026-08-20 codex): 처음엔 "만드는 코드가 아예 없다"고 적었는데 **사실이 아니다.**
    //   슈퍼관리자 승인 화면이 만든다(SuperAdminDashboard.js:521·789, 규칙 isClassAdmin 에
    //   `|| isSuperAdmin()` 이 있어 허용된다). 진짜 문제는 **그 경로에 구멍이 있다**는 것:
    //   `needsClassCode = !classCode || classCode === "미지정"` 이라, 이미 학급코드를 가진 교사를
    //   승인하면 문서를 만들지 않고 지나간다. QAZWSX12(학생은 있는데 classes 문서 없음)가 그렇게 생겼다.
    //   여기서 메우는 건 그 구멍이지, 없는 경로를 대신하는 게 아니다.
    //
    //   대상은 "학생이 실제로 있는데 classes 에 없는 학급"뿐이다. 반대쪽(classes 에만 있고
    //   학생 0)은 **지우지 않는다** — 교사만 있고 아직 학생을 안 받은 신규 학급이 거기 있다.
    if (missing.length > 0) {
      // batch 를 쓰지 않는다(2026-08-20 codex WARNING 2건):
      //   ① batch 는 500쓰기가 상한이라 501건이 밀리면 **매주 같은 자리에서 실패**해 영원히 안 줄어든다.
      //   ② `set(merge:true)` 는 경합을 못 막는다 — 조회 후 커밋 전에 승인 화면이 같은 문서를
      //      제대로 만들어 두면 여기서 빈 className·새 createdAt 으로 덮어쓴다.
      //   `create()` 는 문서가 이미 있으면 그 한 건만 실패한다(ALREADY_EXISTS=6). 덮어쓸 수가 없고,
      //   한 건 실패가 나머지를 막지도 않는다. 대신 실행당 상한을 둬 주급 시간을 잠식하지 않게 한다.
      const SELF_HEAL_MAX_PER_RUN = 50;
      const targets = missing.slice(0, SELF_HEAL_MAX_PER_RUN);
      const healed = [];
      const skipped = [];
      for (const code of targets) {
        // 교사 정보는 initClassroomDefaultsServerSide 와 같은 방식으로 채운다.
        // missing 은 정상 상태에서 0건이라 학급당 쿼리 1회는 사실상 공짜다.
        let teacherId = null;
        let teacherName = "";
        let className = "";
        let schoolName = "";
        try {
          const t = await db
            .collection("users")
            .where("classCode", "==", code)
            .where("isAdmin", "==", true)
            .limit(1)
            .get();
          if (!t.empty) {
            const td = t.docs[0].data();
            teacherId = t.docs[0].id;
            teacherName = td.name || "";
            className = td.className || "";
            schoolName = td.schoolName || "";
          }
        } catch (e) {
          logger.warn(`[학급정본] ${code} 교사 조회 실패(문서는 그대로 생성): ${e.message}`);
        }
        try {
          await db.collection("classes").doc(code).create(
            buildClassDoc({
              classCode: code,
              teacherId,
              teacherName,
              className,
              schoolName,
              // ⚠️ 0 이 아니라 **실측 인원**이다. 이 경로는 "학생이 있는데 문서가 없는" 학급만
              //    타므로 0 은 언제나 거짓이고, 그 거짓이 증감 연산에 그대로 눌러앉는다.
              studentCount: studentCounts.get(code) || 0,
              createdBy: "logClassRegistryDrift(self-heal)",
            }),
          );
          healed.push(code);
        } catch (e) {
          // 6 = ALREADY_EXISTS. 그 사이 승인 화면이 제대로 만든 것이니 건드리지 않는 게 맞다.
          if (e && e.code === 6) skipped.push(code);
          else logger.error(`[학급정본] ${code} 등록 실패: ${e.message}`);
        }
      }
      logger.warn(
        `[학급정본] classes 미등록(학생 있음) ${missing.length}건 중 ${healed.length}건 자동 등록` +
          `${skipped.length > 0 ? ` · ${skipped.length}건은 그 사이 생겨 건너뜀` : ""}` +
          `${missing.length > targets.length ? ` · ${missing.length - targets.length}건은 다음 실행으로 미룸` : ""}` +
          `: ${JSON.stringify(healed)}`,
      );
    }
    if (empty.length > 0) {
      logger.info(
        `[학급정본] classes 에만 있고 학생 0 (지우지 않음 — 신규 학급일 수 있다): ${JSON.stringify(empty)}`,
      );
    }
    // ⚠️ "빠진 학급 없음"만으로 전제 충족이라고 쓰면 **거짓 양성**이다(2026-08-20 codex).
    //   cutover 는 정본을 users 스캔 → classes 전량으로 바꾸는 일이라, classes 쪽에만 있는
    //   유령 학급(empty)이 남아 있으면 두 목록이 애초에 같지 않다. 양방향이 0일 때만 충족이다.
    if (missing.length === 0 && empty.length === 0) {
      logger.info(
        "[학급정본] 양방향 일치(미등록 0 · 학생0 학급 0) — 정본 교체(P0-E)의 전제 충족",
      );
    } else if (missing.length === 0) {
      logger.info(
        `[학급정본] 미등록은 0 이지만 학생 0 학급 ${empty.length}건 남음 — 아직 전제 미충족`,
      );
    }
  } catch (e) {
    // 점검·복구 실패가 주급을 막아선 안 된다(부가 작업일 뿐).
    logger.warn("[학급정본] 드리프트 점검 실패(주급에는 영향 없음):", e?.message);
  }
}

async function getAllActiveClassCodes() {
  // ⚠️ 이 쿼리는 **전국 학생 전량 스캔**이다. 학급이 늘수록 선형으로 커지고,
  //    주기 작업 5곳(주급·재산세·월세·리셋·배당)이 각자 한 번씩 부른다.
  //    학급 목록의 정본(classes 컬렉션)이 생기면 이 함수를 그쪽으로 갈아끼울 것.
  return classCodesFromStudentSnap(
    await db.collection("users").where("isAdmin", "==", false).get(),
  );
}

// 하위 호환성을 위한 빈 함수 (manualUpdateStockMarket에서 호출)
async function updateCentralStockMarketLogic() {
  logger.info(">>> [스케줄러] 시뮬레이션 로직 비활성화됨 - 실제 주식만 사용");
  // 실제 주식 가격은 stockPriceScheduler에서 Yahoo Finance를 통해 업데이트됨
  return null;
}

async function resetTasksForClass(classCode) {
  if (!classCode) {
    logger.error("resetTasksForClass: 학급 코드가 제공되지 않았습니다.");
    return { userCount: 0, jobCount: 0 };
  }
  try {
    const batch = db.batch();
    let userCount = 0;

    // 🔒 리셋과 함께 tasksResetDate(KST)도 갱신 — 안 하면 스케줄러 리셋 후에도 날짜가 어제로 남아
    //   resetDailyTasksIfNewDay CF가 다시 리셋해 하루 할일 한도가 2번 열린다(2026-07-19 codex WARNING).
    const nowKstReset = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const resetTodayStr = nowKstReset.toISOString().split("T")[0];

    // 사용자별 일일 진행 상황 리셋 (공통 과제 + 직업 과제)
    const usersQuery = db
      .collection("users")
      .where("classCode", "==", classCode);
    const usersSnapshot = await usersQuery.get();
    if (!usersSnapshot.empty) {
      usersSnapshot.forEach((userDoc) => {
        batch.update(userDoc.ref, {
          completedTasks: {}, // 공통 과제 리셋
          completedJobTasks: {}, // 직업 과제 리셋 (개인)
          tasksResetDate: resetTodayStr, // 날짜 갱신(2번 리셋 방지)
        });
        userCount++;
      });
    }

    await batch.commit();
    logger.info(`[${classCode}] 리셋 완료: ${userCount}명 학생.`);
    return { userCount, jobCount: 0 };
  } catch (error) {
    logger.error(`[${classCode}] 과제 리셋 중 심각한 오류:`, error);
    throw error;
  }
}

async function resetDailyTasksLogic() {
  logger.info(">>> [스케줄러] 일일 과제 리셋 시작");
  try {
    const classCodes = await getAllActiveClassCodes();
    if (classCodes.length === 0) {
      logger.info("리셋할 클래스가 없습니다.");
      return;
    }
    const resetPromises = classCodes.map((classCode) =>
      resetTasksForClass(classCode),
    );
    const results = await Promise.all(resetPromises);
    let totalUserCount = 0;
    let totalJobCount = 0;
    results.forEach((result) => {
      totalUserCount += result.userCount;
      totalJobCount += result.jobCount;
    });
    logger.info(
      `→ 일일 과제 리셋 완료: ${classCodes.length}개 클래스, 총 ${totalUserCount}명 학생, ${totalJobCount}개 직업 리셋`,
    );
  } catch (error) {
    logger.error("→ 일일 과제 리셋 중 오류 발생:", error);
    throw error; // re-throw to be caught by the main handler
  }
}

async function payWeeklySalariesLogic(forceRun = false, weekKeyOverride = null) {
  logger.info(">>> [스케줄러] 주급 지급 시작");
  const salaryLockRef = db.collection("schedulerLocks").doc("weeklySalary");
  let lockClaimed = false;
  let weekKeyForLock = null;
  try {
    // 오늘 이미 지급했는지 확인 (중복 방지)
    const now = new Date();
    const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().split("T")[0];

    // 주간 중복 방지 (같은 주에 여러 번 호출되어도 1회만 지급)
    // weekKeyOverride: 특정 주 재지급용 (예: "2026-W15")
    const computedWeekKey = computeWeekKey(now);
    const weekKey = weekKeyOverride || computedWeekKey;
    // 백필 모드 = 과거(또는 임의) 주차를 수동 지정해 재지급하는 경우.
    //   이 모드에선 기본급 복리 인상 원장(salaryBaseMultiplier/salaryLastRaiseWeekKey)을 갱신하지 않는다.
    const isSalaryBackfill = !!weekKeyOverride;
    weekKeyForLock = weekKey;
    if (weekKeyOverride) {
      logger.info(
        `[주급 지급] weekKey 오버라이드 사용: ${weekKey} (계산값: ${computedWeekKey}) ` +
        `— 백필 모드: 기본급 인상 배수는 갱신하지 않음(현재 기본급으로 지급)`,
      );
    }
    // 🔒 점유를 트랜잭션으로. 동시 실행 중 하나만 통과한다(중복지급 차단).
    const claimed = await claimPeriodLock(salaryLockRef, weekKey, {
      forceRun,
      label: "주급 지급",
    });
    if (!claimed) {
      logger.info(`[주급 지급] 이번 주(${weekKey}) 이미 지급 완료 또는 진행 중 - 건너뜀`);
      return { skipped: true, weekKey };
    }
    lockClaimed = true;
    // lastPayDate 는 완료 시점에만 기록한다(completePeriodLock). 아무도 읽지 않는 기록용 필드라
    // 시작 시점에 미리 박아 둘 이유가 없고, 실패한 실행이 "지급한 날"을 남기는 게 더 나쁘다.

    // 🔻 2026-08-17: 종전엔 **같은 함수 안에서 users 전량 스캔을 두 번** 했다 —
    //    getAllActiveClassCodes() 가 한 번(구 2187행), allStudentsSnap 이 또 한 번(구 2199행).
    //    두 쿼리의 조건(`isAdmin == false`)이 글자 그대로 같아서 한 번만 읽고 학급 목록을
    //    파생하면 된다. 학생 N명이면 이 함수의 users 읽기가 2N → N 으로 준다.
    //    부수효과로 학급 목록과 학생 명단이 **같은 스냅샷**에서 나와 정합성도 좋아진다
    //    (종전엔 두 읽기 사이에 학생이 들어오면 학급은 잡히는데 명단엔 없는 창이 있었다).
    const allStudentsSnap = await db.collection("users").where("isAdmin", "==", false).get();
    const classCodes = classCodesFromStudentSnap(allStudentsSnap);
    logger.info(`[주급 지급] 대상 학급: ${JSON.stringify(classCodes)}`);
    await logClassRegistryDrift(classCodes, studentCountsFromSnap(allStudentsSnap));
    if (classCodes.length === 0) {
      logger.warn("[주급 지급] 활성 학급 없음");
      // 지급한 게 없으니 완료로 표시하지 않는다. 조회가 일시적으로 빈 결과를 준 것일 수도 있고,
      // 완료로 박아버리면 그 주는 영영 못 준다. 락만 풀고 다음 실행에 맡긴다(재시도 비용 ≈ 0).
      await releasePeriodLock(salaryLockRef, weekKey, new Error("no-active-classes"));
      lockClaimed = false;
      return { skipped: true, reason: "no-active-classes", weekKey };
    }

    // (학생 데이터는 위에서 이미 한 번만 읽었다 — allStudentsSnap)

    // 급여 상수·공식은 functions/salaryUtils.js(computeSalaryAmounts) 단일 진실원.
    let totalPaidCount = 0;
    let totalAmount = 0;
    const classErrors = [];

    // ⏱️ 시간 예산 가드 (2026-08-17).
    //   이 루프는 학급을 **순차** 처리하는데 함수 타임아웃은 540초 고정이다(3312행 onSchedule).
    //   학급이 늘면 어느 순간 루프 도중에 런타임이 그냥 죽는다. 데이터는 학급 단위 멱등
    //   마커(salaryLastPaidWeekKey)가 지켜주지만, 락이 in-progress 로 남은 채 죽으면
    //   stale 회수까지 나머지 학급의 주급이 **조용히 지연**된다 — 로그도 안 남는다.
    //   예산을 넘기면 스스로 멈추고 남은 학급을 error 로그에 남긴 뒤 락을 푼다
    //   (성공한 학급은 마커로 건너뛰므로 재실행해도 중복지급은 없다).
    //
    //   ⚠️ **자동으로 이어받지 않는다 — 사람이 재실행해야 한다.** 근거 셋:
    //     1) 자동 주급은 **월요일 1회뿐**이다. 이 스케줄러는 월·금(`30 8 * * 1,5`)에 뜨지만
    //        본문 요일 가드가 `day===1`만 주급으로 보내고 금요일은 재산세·월세만 돈다.
    //     2) `computeWeekKey` 는 1/1부터 7일씩 끊어 **요일 정렬이 아니다** — 주중에 넘어간다
    //        (2026-08 실측: 월 W33 → 금 W34). 그래서 다음 주 월요일엔 weekKey 가 이미 달라져
    //        이월된 그 주가 아니라 **새 주를 지급한다 → 이월된 주는 영구 누락된다.**
    //     3) 복구 = `weeklySalary` HTTP 재호출. 단 **파라미터 없이, weekKey 가 넘어가기 전에**
    //        불러야 이미 받은 학급이 마커로 걸러지고 이월분만 지급된다.
    //        ⚠️ `?weekKey=` 를 붙이면 백필 모드(`isSalaryBackfill`)로 들어가 **학급별 스킵
    //        가드가 꺼진다** — 전 학급 재지급이므로 `reverseLastWeeklySalary` 없이 쓰면 안 된다.
    //   ⚠️ 이건 근본 해법이 아니라 **안전 정지**다. 근본 해법은 학급 단위 팬아웃이고,
    //      그건 되돌리기 어려운 변경이라 별도 작업으로 분리했다.
    const SALARY_TIME_BUDGET_MS = 420 * 1000; // 540s 타임아웃 - 마감 처리 여유 120s
    const salaryStartedAt = Date.now();
    const deferredClasses = [];

    for (const classCode of classCodes) {
      if (Date.now() - salaryStartedAt > SALARY_TIME_BUDGET_MS) {
        deferredClasses.push(classCode);
        continue; // break 가 아니라 continue — 남은 학급을 전부 세어 로그에 남긴다
      }
      try {
        // 급여 설정 조회 (세율) - settings/salarySettings_{classCode} 경로 사용
        const perClassSalaryRef = db.collection("settings").doc(`salarySettings_${classCode}`);
        let salarySettingsDoc = await perClassSalaryRef.get();
        // 누적 인상 배수·마지막 인상 주차는 '학급별 상태'라 전역 폴백과 섞으면 안 된다(학급별 문서에서만 읽음).
        const perClassSalaryData = salarySettingsDoc.exists ? salarySettingsDoc.data() : null;

        // 🔒 학급 단위 멱등 가드. 전역 락이 stale 회수돼 재실행되더라도 이미 지급한 학급은
        //    건너뛴다(마커는 지급 배치와 **같은 커밋**에 쓰이므로 지급 없이 마커만 남을 수 없다).
        //    forceRun/백필은 "알고 다시 준다"는 의도적 재지급이라 통과시킨다.
        if (
          !forceRun &&
          !isSalaryBackfill &&
          perClassSalaryData?.salaryLastPaidWeekKey === weekKey
        ) {
          logger.info(`[주급 지급] ${classCode}: 이번 주(${weekKey}) 이미 지급됨 - 건너뜀`);
          continue;
        }

        if (!salarySettingsDoc.exists) {
          salarySettingsDoc = await db.collection("settings").doc("salarySettings").get();
        }
        const rawTaxRate = salarySettingsDoc.exists ? salarySettingsDoc.data().taxRate : 0.1;
        const taxRate = Number.isFinite(rawTaxRate) ? rawTaxRate : 0.1;

        // ── 기본급 주간 복리 인상(2026-07-21) ──
        //   교사 설정 salaryIncreaseRate(기본 5%)만큼 매주 '기본급'이 복리로 오른다.
        //   이번 주 지급은 '현재' 배수로 계산하고, 지급 후 배수를 올린다 → 인상은 다음 주부터 반영.
        //   (직업가산·대통령 보너스는 인상 대상 아님 — 사용자 결정)
        const rawRaiseRate = salarySettingsDoc.exists
          ? salarySettingsDoc.data().salaryIncreaseRate
          : undefined;
        const raiseRate = Number.isFinite(rawRaiseRate)
          ? Math.min(Math.max(rawRaiseRate, 0), SALARY.MAX_RAISE_RATE)
          : SALARY.DEFAULT_RAISE_RATE;
        const rawMultiplier = perClassSalaryData ? perClassSalaryData.salaryBaseMultiplier : undefined;
        const baseMultiplier =
          Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : 1;
        const lastRaiseWeekKey = perClassSalaryData ? perClassSalaryData.salaryLastRaiseWeekKey : null;
        const effectiveBase = computeEffectiveBase(baseMultiplier);
        // 직업 개수 상한(관리자 설정) — 클램프는 jobUtils.clampMaxJobs 가 유일 정본.
        const maxJobsPerStudent = clampMaxJobs(
          salarySettingsDoc.exists ? salarySettingsDoc.data().maxJobsPerStudent : undefined,
        );

        // 직업 정보 로드 (대통령 보너스 적용용)
        const jobsSnap = await db.collection("jobs").where("classCode", "==", classCode).get();
        const jobMap = buildJobMap(jobsSnap);

        // 학급 관리자(선생님) 찾기
        const adminSnapshot = await findApprovedAdminSnap(classCode);

        let adminDoc = null;
        if (!adminSnapshot.empty) {
          adminDoc = adminSnapshot.docs[0];
        }

        // 이미 로드된 데이터에서 해당 학급 학생만 필터링
        const students = allStudentsSnap.docs.filter((d) => {
          const data = d.data();
          return data.classCode === classCode && !data.isSuperAdmin && !data.isTeacher;
        });

        if (students.length === 0) continue;

        // 급여 계산: 기본급 200만 + 추가 직업당 50만 + 대통령 보너스
        // 🔒 배치를 **분할 커밋**한다(2026-08-11 2차 검증 C7).
        //   종전엔 학급 전체를 batch 하나에 담아 한 번에 커밋했다. 지급 학생당 3쓰기 +
        //   관리자·설정 2쓰기라 **167명부터 Firestore 500 한도를 넘어 그 학급 전체가 실패**한다
        //   (지금은 최대 학급이 그보다 훨씬 작지만, 학급이 커지면 조용히 절벽을 만난다).
        //   분할이 안전한 이유는 바로 아래 학생 단위 마커(lastSalaryWeekKey) 덕분이다 —
        //   중간까지 커밋된 뒤 죽어도 재실행이 이미 받은 학생을 건너뛴다.
        //
        //   ⚠️ 2026-08-20: 이 블록은 99265c1 에서 **backfillDrawItems 안에 잘못 붙었다.**
        //   flushIfNeeded 를 부르는 쪽(이 함수)에는 정의가 없어 `ReferenceError` 로
        //   **주급이 학급 전부 실패했다**(2026-08-17 실측, 9BVPKP·BG6QUC 미지급).
        //   호출부와 정의를 같은 스코프에 둔다.
        let batch = db.batch();
        let batchOps = 0;
        // 이번 batch 에 실린 학생 지급액 합계. **커밋 단위로** 관리자에게서 뺀다.
        //   ⚠️ 2026-08-20 codex CRITICAL: 종전 설계는 학생 지급을 여러 batch 로 쪼개면서
        //   관리자 차감(-classTotalNet)만 **마지막 batch 에 한 번** 실었다. 중간 커밋 뒤
        //   함수가 죽으면 그 학생들은 지급·마커가 확정된 채 관리자는 차감되지 않고,
        //   재실행은 그 학생들을 마커로 건너뛰므로 그 금액이 classTotalNet 에 다시는 안 잡힌다
        //   → **아무도 안 낸 돈이 학생에게 남는다(화폐 무상 생성).**
        //   주간세금(collectWeeklyTaxes)은 2026-08-12 Gemini CRITICAL 로 이미 이 규약(chunkTax)을
        //   갖고 있었다. 주급만 빠져 있었던 건 분할 커밋이 **한 번도 실행된 적이 없었기 때문**이다
        //   (flushIfNeeded 가 다른 함수에 붙어 ReferenceError 로 죽었다). 같은 규약으로 맞춘다.
        let chunkNet = 0;
        const commitBatch = async () => {
          if (adminDoc && chunkNet > 0) {
            batch.update(adminDoc.ref, {
              cash: admin.firestore.FieldValue.increment(-chunkNet),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
          batch = db.batch();
          batchOps = 0;
          chunkNet = 0;
        };
        // reserved:1 = 위 관리자 차감. 커밋 직전에 반드시 실리므로 자리를 미리 잡아 둔다.
        const flushIfNeeded = async (extraOps) => {
          if (shouldFlush(batchOps, extraOps, { reserved: 1 })) await commitBatch();
        };
        let classTotalNet = 0;
        let classPaidCount = 0;
        // 재시도로 들어와 "이미 이번 주 받은" 학생 수. 이게 있으면 지급은 0이어도
        // 학급 마감(인상 원장·지급 주차 마커)은 해야 한다 — 아래 continue 조건 참고.
        let alreadyPaidCount = 0;

        // 거래내역 로그 TTL: 90일 후 만료 (재산세 로그와 동일 정책)
        const logExpireAt = new Date();
        logExpireAt.setDate(logExpireAt.getDate() + 90);
        const logExpireTs = admin.firestore.Timestamp.fromDate(logExpireAt);

        for (const studentDoc of students) {
          const student = studentDoc.data();

          // 🔒 학생 단위 멱등 마커. 지급 batch 와 **같은 쓰기**에 실리므로(필드 하나 추가라
          //    쓰기 수 증가 0) "지급했는데 마커가 없다"가 불가능하다. 이게 있어야 위의
          //    분할 커밋이 안전하다 — 중간까지 커밋된 뒤 죽어도 재실행이 여기서 걸러진다.
          if (
            !forceRun &&
            !isSalaryBackfill &&
            student.lastSalaryWeekKey === weekKey
          ) {
            alreadyPaidCount++;
            continue;
          }
          // 🔒 저장값을 신뢰하지 않고 재검증: 유령 id 제외 + 중복 제거 + 상한 적용 +
          //    지정 전용 직업은 appointedJobIds(교사 write 전용)에서만 인정.
          //    타입 오염(배열 아님)도 여기서 정규화. 상세 규약은 functions/jobUtils.js.
          const { appointed, all: validJobIds } = resolveStudentJobs(
            student,
            jobMap,
            maxJobsPerStudent,
          );
          if (validJobIds.length === 0) {
            // 이번 회차 미지급 — 이전 지급 기록이 남아있으면 reverseSalaryOnce가
            // (지급 안 한) 이번 회차를 잘못 회수하게 되므로 초기화
            if (student.lastNetSalary) {
              await flushIfNeeded(1);
              batchOps++;
              batch.update(studentDoc.ref, {
                lastNetSalary: 0,
                lastGrossSalary: 0,
                lastTaxAmount: 0,
              });
            }
            continue;
          }

          // 급여 계산은 단일 진실원(functions/salaryUtils.js) — batchPaySalaries(index.js)와
          // 동일 함수를 공유해 드리프트(과거 국무총리 보너스 과다지급)를 원천 차단.
          const { totalGross, tax, netSalary } = computeSalaryAmounts(
            validJobIds.length,
            appointed,
            jobMap,
            taxRate,
            effectiveBase, // 복리 인상이 반영된 실효 기본급
          );

          // 이 학생이 쓸 3개(현금·활동로그·거래내역) 자리를 미리 확보한다
          await flushIfNeeded(3);
          batchOps += 3;

          batch.update(studentDoc.ref, {
            cash: admin.firestore.FieldValue.increment(netSalary),
            lastSalaryWeekKey: weekKey, // 멱등 마커 — 쓰기 수 증가 0(같은 update 에 필드 하나)
            lastSalaryDate: admin.firestore.FieldValue.serverTimestamp(),
            lastGrossSalary: totalGross,
            lastTaxAmount: tax,
            lastNetSalary: netSalary,
            totalSalaryReceived: admin.firestore.FieldValue.increment(netSalary),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 내 재산 거래내역용 로그 (activity_logs — MyAssets.js가 classCode+userId로 조회)
          const studentName = student.name || student.nickname || "학생";
          const salaryLogRef = db.collection("activity_logs").doc();
          batch.set(salaryLogRef, {
            userId: studentDoc.id,
            userName: studentName,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "salaryPayment",
            amount: netSalary,
            description: `[주급] ${weekKey} 실수령 ${netSalary.toLocaleString()}원 (세전 ${totalGross.toLocaleString()}원 / 세금 ${tax.toLocaleString()}원)`,
            classCode: classCode,
            weekKey,
            grossSalary: totalGross,
            taxAmount: tax,
            netSalary,
            expireAt: logExpireTs,
          });

          // 사용자 서브컬렉션 거래내역 (transactions — MyAssets.js 두 번째 소스)
          const txRef = db.collection("users").doc(studentDoc.id).collection("transactions").doc();
          batch.set(txRef, {
            amount: netSalary,
            description: `[주급] ${weekKey} 실수령 ${netSalary.toLocaleString()}원`,
            type: "salaryPayment",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            weekKey,
            grossSalary: totalGross,
            taxAmount: tax,
          });

          classTotalNet += netSalary;
          chunkNet += netSalary;   // 이 batch 가 커밋될 때 관리자에게서 빠질 몫
          classPaidCount++;
        }

        // 지급 대상이 0명이면 여기서 빠지므로 기본급 인상(raisePatch)도 함께 스킵된다.
        //   의도된 설계: '인상은 지급과 결합' — 지급이 없던 주는 인상도 없고, 다음 실제 지급 주에
        //   정상적으로 1회만 인상된다(이중 인상 없음).
        // 지급도 0이고 기지급도 0이면 이 학급은 애초에 대상이 없다 → 인상도 없다(기존 설계).
        // 단 재시도로 전원이 이미 지급된 경우(alreadyPaidCount>0)는 **마감을 해야 한다** —
        // 안 그러면 그 주 인상 원장과 학급 마커가 영영 안 써진다(분할 커밋 도입의 부작용).
        if (classPaidCount === 0 && alreadyPaidCount === 0) continue;

        // 설정 갱신(1쓰기) 자리 확보. 관리자 차감은 commitBatch() 가 커밋 직전에 얹는다.
        await flushIfNeeded(1);
        batchOps += 1;

        // lastPaidDate 업데이트
        const salarySettingsRef = db.collection("settings").doc(`salarySettings_${classCode}`);
        // 기본급 복리 인상 — 이번 주 지급(현재 배수)이 끝났으니 '다음 주용' 배수를 올린다.
        //   같은 batch에 담아 지급과 원자적으로 커밋(지급만 되고 인상이 유실되거나 그 반대가 없게).
        //   lastRaiseWeekKey 가드로 같은 주 재실행(forceRun 등) 시 중복 인상 방지.
        // 🔒 백필(weekKeyOverride) 시엔 인상 원장을 절대 건드리지 않는다(Gemini CRITICAL):
        //   과거 주차를 뒤늦게 지급하면 lastRaiseWeekKey가 과거로 역전 덮어써지고, 예정에 없던
        //   복리 1회가 배수에 영구 잔존해 이후 모든 주의 기본급이 부풀었다. 백필 = '순수 지급'만.
        //   ⚠️ 백필 지급액은 (주차별 기본급 이력을 보관하지 않으므로) '현재' 실효 기본급 기준이다.
        const raisePatch =
          isSalaryBackfill || lastRaiseWeekKey === weekKey
            ? {}
            : {
                salaryBaseMultiplier: nextBaseMultiplier(baseMultiplier, raiseRate),
                salaryLastRaiseWeekKey: weekKey,
                salaryRaiseUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              };
        batch.set(
          salarySettingsRef,
          {
            lastPaidDate: admin.firestore.FieldValue.serverTimestamp(),
            // 🔒 학급 단위 멱등 마커. 지급과 같은 batch 라 "지급했는데 마커가 없다"가 불가능하다.
            //    백필은 과거 주차를 되짚는 것이라 '현재 주 지급 완료'로 오인되면 안 되므로 제외.
            ...(isSalaryBackfill ? {} : { salaryLastPaidWeekKey: weekKey }),
            ...raisePatch,
          },
          { merge: true },
        );

        await commitBatch();
        totalPaidCount += classPaidCount;
        totalAmount += classTotalNet;
        logger.info(
          `[주급 지급] ${classCode}: ${classPaidCount}명에게 총 ${classTotalNet.toLocaleString()}원 지급 ` +
          `(기본급 ${effectiveBase.toLocaleString()}원 = 배수 ${baseMultiplier.toFixed(4)}, 인상률 ${(raiseRate * 100).toFixed(1)}%/주` +
          `${lastRaiseWeekKey === weekKey ? ", 이번 주 인상 이미 적용됨" : ""})`,
        );
      } catch (classError) {
        // 한 학급 실패가 다른 학급 지급을 막지 않도록
        logger.error(`[주급 지급] ${classCode} 실패:`, classError, classError?.stack);
        classErrors.push({ classCode, error: classError?.message || String(classError) });
      }
    }

    logger.info(
      `→ 주급 지급 완료: 총 ${totalPaidCount}명, ${totalAmount.toLocaleString()}원 (실패 학급: ${classErrors.length})`,
    );
    // 🔒 완료 표시는 **여기서**. 이 줄에 닿기 전에 죽으면 락은 in-progress 로 남고
    //    다음 실행이 회수해 재시도한다(학급 단위 멱등 가드가 중복지급을 막는다).
    //
    //    ⚠️ 한 학급이라도 실패했으면 '완료'로 박지 않는다. 종전 구조에선 학급 하나가 터져도
    //    락이 그 주 키로 남아 **그 학급 학생들은 그 주 주급을 영영 못 받았다**(재시도 경로 없음).
    //    이제 학급 단위 멱등 마커(salaryLastPaidWeekKey)가 있으니 재실행해도 성공한 학급은
    //    건너뛴다 — 즉 재시도가 안전해졌고, 그래서 재시도할 수 있게 열어 두는 게 맞다.
    if (deferredClasses.length > 0) {
      logger.error(
        `[주급 지급] ⏱️ 시간 예산(${SALARY_TIME_BUDGET_MS / 1000}s) 초과로 ${deferredClasses.length}개 학급 이월 — ` +
          `⚠️ 자동 복구 안 됨 — weekKey=${weekKey} 가 넘어가기 전에 weeklySalary 를 ` +
          `**파라미터 없이** 재호출할 것(이미 받은 학급은 마커로 스킵): ${JSON.stringify(deferredClasses)}`,
      );
    }
    // 실패 학급이 있거나 이월 학급이 있으면 '완료'로 박지 않는다 — 둘 다 재실행이 필요하다.
    if (classErrors.length > 0 || deferredClasses.length > 0) {
      if (classErrors.length > 0) {
        logger.error(
          `[주급 지급] ${classErrors.length}개 학급 실패 — 락을 'failed' 로 두어 재실행 시 그 학급만 재시도한다: ` +
            JSON.stringify(classErrors),
        );
      }
      await releasePeriodLock(
        salaryLockRef,
        weekKey,
        new Error(
          `${classErrors.length}개 학급 지급 실패` +
            (deferredClasses.length > 0 ? ` · ${deferredClasses.length}개 학급 시간초과 이월` : ""),
        ),
      );
    } else {
      await completePeriodLock(salaryLockRef, weekKey, {
        lastPayDate: todayStr,
        totalPaidCount,
        totalAmount,
        failedClassCount: 0,
      });
    }
    lockClaimed = false;
    return {
      totalPaidCount,
      totalAmount,
      weekKey,
      classErrors: classErrors.length > 0 ? classErrors : undefined,
      deferredClasses: deferredClasses.length > 0 ? deferredClasses : undefined,
    };
  } catch (error) {
    logger.error("→ 주급 지급 중 오류:", error, error?.stack);
    // 락을 잡은 채로 실패했다면 반드시 푼다. 안 풀면 그 주 주급이 영구 누락된다.
    if (lockClaimed && weekKeyForLock) {
      await releasePeriodLock(salaryLockRef, weekKeyForLock, error);
    }
    throw error;
  }
}

async function collectWeeklyRentLogic() {
  logger.info(">>> [스케줄러] 월세 징수 시작");
  // 🔒 매물 단위 멱등 마커의 키. 전역 락이 실패로 풀린 뒤 재실행되면 이미 걷은 매물을
  //    또 걷는 것을 막는다(2026-08-11 3차 검증 C8). 매물별 트랜잭션 안에서 검사·기록한다.
  const rentWeekKey = computeWeekKey(new Date());
  try {
    const classCodes = await getAllActiveClassCodes();
    let totalCollected = 0;
    let totalTenantsCount = 0;

    for (const classCode of classCodes) {
      logger.info(`[월세 징수] ${classCode} 클래스 처리 시작`);

      // 학급의 모든 부동산 조회
      const propertiesSnapshot = await db
        .collection("classes")
        .doc(classCode)
        .collection("realEstateProperties")
        .get();

      if (propertiesSnapshot.empty) {
        logger.info(`[월세 징수] ${classCode}: 부동산이 없습니다.`);
        continue;
      }

      let classCollected = 0;
      let classTenantsCount = 0;

      // 학급 관리자(선생님) 찾기 - 정부 소유 부동산 월세 수령용
      const adminSnap = await findApprovedAdminSnap(classCode);
      const adminUid = adminSnap.empty ? null : adminSnap.docs[0].id;

      for (const propertyDoc of propertiesSnapshot.docs) {
        const property = propertyDoc.data();

        // 세입자가 있는 경우에만 처리
        if (!property.tenantId || !property.rent) {
          continue;
        }

        // 🏠 자가 거주(소유주 == 거주자) 월세 면제 — 자기 집에 자기가 사는 학생은 월세 안 냄
        //    (정부 소유 owner="government"는 tenantId와 같을 수 없어 임대로 정상 징수됨)
        if (property.owner && property.owner === property.tenantId) {
          logger.info(`[월세 징수] 자가 거주 면제: 부동산 #${property.id} (${property.ownerName || ""})`);
          continue;
        }

        classTenantsCount++;

        try {
          await db.runTransaction(async (transaction) => {
            const now = admin.firestore.Timestamp.now();

            // 🔒 이번 주 이미 걷은 매물인지 **트랜잭션 안에서** 확인한다.
            //    바깥 스냅샷은 stale 이라 동시 실행·재시도를 못 막는다.
            const propertyRef = propertyDoc.ref;
            const freshProperty = await transaction.get(propertyRef);
            if (!freshProperty.exists) return;
            if (freshProperty.data().lastRentWeekKey === rentWeekKey) {
              logger.info(
                `[월세 징수] 부동산 #${property.id} 이번 주(${rentWeekKey}) 이미 징수됨 — 건너뜀`,
              );
              return;
            }

            // ⚠️ 이 아래는 **전부 fresh 를 쓴다**. 바깥 루프의 `property` 는 트랜잭션 시작 전
            //    스냅샷이라, 재시도 사이에 계약이 바뀌면(세입자 교체·임대료 조정·소유권 이전)
            //    옛 세입자에게서 옛 임대료를 걷고 새 계약 문서에 "이번 주 완료" 마커를 심는다
            //    → 새 세입자의 월세가 영구 누락된다(2026-08-12 codex CRITICAL).
            //    마커만 fresh 로 보고 나머지를 stale 로 쓰면 트랜잭션을 쓰는 의미가 없다.
            const fresh = freshProperty.data();

            // 계약 상태가 그 사이 바뀌었으면 이번 회차는 건너뛴다(다음 실행이 새 계약으로 처리).
            if (!fresh.tenantId || !fresh.rent) return;
            if (fresh.owner && fresh.owner === fresh.tenantId) return; // 자가 거주 면제

            // 세입자 정보 조회
            const tenantRef = db.collection("users").doc(fresh.tenantId);
            const tenantDoc = await transaction.get(tenantRef);

            if (!tenantDoc.exists) {
              logger.warn(
                `[월세 징수] 세입자 ${fresh.tenantId} 문서가 없습니다.`,
              );
              return;
            }

            const tenantData = tenantDoc.data();
            const rentAmount = fresh.rent;

            // 집주인 정보 조회 (정부 소유 → 관리자에게 지급)
            let ownerRef = null;
            const actualOwner = fresh.owner === "government" ? adminUid : fresh.owner;
            if (actualOwner && actualOwner !== fresh.tenantId) {
              ownerRef = db.collection("users").doc(actualOwner);
              const ownerDoc = await transaction.get(ownerRef);
              if (!ownerDoc.exists) {
                logger.warn(
                  `[월세 징수] 집주인/관리자 ${actualOwner} 문서가 없습니다.`,
                );
                ownerRef = null;
              }
            }

            // 🔒 받을 사람이 없으면 **걷지 않는다**(2026-08-12 codex CRITICAL).
            //    종전엔 ownerRef 가 null 이어도 세입자 차감과 마커 기록은 그대로 커밋돼,
            //    그 돈이 아무에게도 안 가고 사라졌다(소각). 게다가 마커 때문에 그 주 재처리도 막혔다.
            //    정부 소유인데 승인 관리자가 없거나, 개인 집주인 문서가 삭제된 경우가 여기 걸린다.
            if (!ownerRef) {
              logger.warn(
                `[월세 징수] 부동산 #${fresh.id} 수취인 없음 — 이번 회차 건너뜀(소각 방지)`,
              );
              return;
            }

            // 강제 징수: 돈이 부족해도 마이너스로 차감
            const newTenantCash = tenantData.cash - rentAmount;

            // 세입자 돈 차감 (increment로 안전한 차감 — 절대값 덮어쓰기 금지)
            transaction.update(tenantRef, {
              cash: admin.firestore.FieldValue.increment(-rentAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 🔒 멱등 마커 — 차감과 **같은 트랜잭션**이라 "걷었는데 마커가 없다"가 불가능하다.
            transaction.update(propertyRef, {
              lastRentWeekKey: rentWeekKey,
              lastRentCollectedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 세입자 거래 로그
            const rentTxRef = tenantRef.collection("transactions").doc();
            transaction.set(rentTxRef, {
              type: "rentPayment",
              amount: -rentAmount,
              description: `[월세 자동 납부] ${fresh.name || `매물 #${fresh.id}`} 월세 ${rentAmount.toLocaleString()}원 (집주인: ${fresh.ownerName || "정부"})`,
              propertyId: fresh.id,
              propertyName: fresh.name,
              ownerName: fresh.ownerName || "정부",
              rentAmount,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 집주인/관리자에게 월세 지급
            if (ownerRef) {
              transaction.update(ownerRef, {
                cash: admin.firestore.FieldValue.increment(rentAmount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // 집주인 거래 로그
              const ownerRentTxRef = ownerRef.collection("transactions").doc();
              transaction.set(ownerRentTxRef, {
                type: "rentIncome",
                amount: rentAmount,
                description: `[월세 수령] ${fresh.name || `매물 #${fresh.id}`} 월세 ${rentAmount.toLocaleString()}원 (세입자: ${fresh.tenantName})`,
                propertyId: fresh.id,
                propertyName: fresh.name,
                tenantName: fresh.tenantName,
                rentAmount,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });
            }

            // 부동산 문서 업데이트
            transaction.update(propertyDoc.ref, {
              lastRentPayment: now,
              updatedAt: now,
            });

            classCollected += rentAmount;
            logger.info(
              `[월세 징수] ${fresh.tenantName} → ${fresh.ownerName || "정부"}: ${rentAmount.toLocaleString()}원 ${
                newTenantCash < 0 ? "(마이너스 발생)" : ""
              }`,
            );
          });
        } catch (error) {
          logger.error(
            `[월세 징수] 부동산 ${property.id} 처리 중 오류:`,
            error,
          );
        }
      }

      totalCollected += classCollected;
      totalTenantsCount += classTenantsCount;
      logger.info(
        `[월세 징수] ${classCode} 완료: ${classTenantsCount}명 세입자, 총 ${classCollected.toLocaleString()}원`,
      );
    }

    logger.info(
      `→ 월세 징수 완료: 총 ${totalTenantsCount}명, ${totalCollected.toLocaleString()}원`,
    );
  } catch (error) {
    logger.error("→ 월세 징수 중 오류:", error);
    throw error;
  }
}

// ──────────────────────────────────────────────────────────────────
// 🤖 거시지표 수집 (학급별 평균자산·지니계수·통화량)
//   매주 금요일 부동산세 징수 직전에 실행되어 동적 세율 결정에 사용됨.
//   classMacroStats/{classCode} 문서에 저장 → 학급 거시경제 대시보드 데이터 소스.
// ──────────────────────────────────────────────────────────────────
async function computeUserNetAssets(classCode, userId, userData, stockMap, couponValue = 1000) {
  // 부동산 owner/ownerId 필드는 모두 소유자 UID로 저장된다(서버 거래/등록 로직 기준).
  // 과거 owner==userData.name(이름) 쿼리는 항상 빈 결과라 부동산이 과세 순자산에서
  // 누락됐다. ownerId·owner 둘 다 UID로 조회하고 seen Set으로 중복을 제거한다.
  const [parkingSnap, productsSnap, portfolioSnap, byIdSnap, byOwnerSnap] = await Promise.all([
    db.collection("users").doc(userId).collection("financials").doc("parkingAccount").get().catch(() => null),
    db.collection("users").doc(userId).collection("products").get().catch(() => ({ docs: [] })),
    db.collection("users").doc(userId).collection("portfolio").get().catch(() => ({ docs: [] })),
    db.collection("classes").doc(classCode).collection("realEstateProperties").where("ownerId", "==", userId).get().catch(() => ({ docs: [] })),
    db.collection("classes").doc(classCode).collection("realEstateProperties").where("owner", "==", userId).get().catch(() => ({ docs: [] })),
  ]);

  const cash = Number(userData.cash) || 0;
  const coupons = Number(userData.coupons) || 0;
  const couponTotal = coupons * (Number(couponValue) || 0);
  const parkingBalance = (parkingSnap && parkingSnap.exists) ? (Number(parkingSnap.data().balance) || 0) : 0;

  let depositSavingsTotal = 0;
  let loanTotal = 0;
  productsSnap.docs.forEach((d) => {
    const data = d.data();
    // 대출은 remainingPrincipal 우선(없으면 balance), 예적금만 명시적으로 합산.
    // 미래에 다른 type(보너스/이벤트 등)이 추가돼도 순자산에 섞이지 않도록 한다.
    if (data.type === "loan") {
      loanTotal += Number(data.remainingPrincipal) || Number(data.balance) || 0;
    } else if (data.type === "deposit" || data.type === "savings") {
      depositSavingsTotal += Number(data.balance) || 0;
    }
  });

  let stockValue = 0;
  portfolioSnap.docs.forEach((d) => {
    const data = d.data();
    const qty = Number(data.quantity) || 0;
    if (qty <= 0) return;
    // holding.stockId 우선, 없으면 docId. stockMap 키는 미러의 s.id(문자열·상장종목만).
    const sid = data.stockId != null ? data.stockId : d.id;
    const price = Number(stockMap[sid] ?? stockMap[String(sid)]) || 0;
    stockValue += price * qty;
  });

  const seen = new Set();
  let realEstateValue = 0;
  [...byIdSnap.docs, ...byOwnerSnap.docs].forEach((d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    const data = d.data();
    realEstateValue += Number(data.price) || Number(data.value) || 0;
  });

  // 쿠폰 가치도 순자산에 포함(다른 모든 계산식과 동일). 과거 누락으로 쿠폰 많은 학생이
  // 과소 과세되던 버그를 차단한다.
  const totalAssets = cash + couponTotal + parkingBalance + depositSavingsTotal + stockValue + realEstateValue;
  const netAssets = totalAssets - loanTotal;
  return { cash, couponTotal, parkingBalance, depositSavingsTotal, stockValue, realEstateValue, loanTotal, totalAssets, netAssets };
}

function computeGiniCoefficient(values) {
  // 지니계수 — 0(완전 평등) ~ 1(완전 불평등)
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].map((v) => Math.max(0, Number(v) || 0)).sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  return Math.max(0, Math.min(1, (2 * cum) / (n * sum) - (n + 1) / n));
}

// 학급 평균 순자산 → 부동산세 기본세율
function lookupClassBaseRate(avgNetAssets) {
  if (avgNetAssets <= 500000) return 0.001;       // 0.1% (경기 침체)
  if (avgNetAssets <= 2000000) return 0.002;      // 0.2% (평시)
  if (avgNetAssets <= 5000000) return 0.003;      // 0.3% (호황)
  return 0.005;                                   // 0.5% (과열)
}

// 개인 순자산 → 누진 배율
function lookupProgressiveMultiplier(netAssets) {
  if (netAssets <= 500000) return 0;              // 면세
  if (netAssets <= 1000000) return 0.5;
  if (netAssets <= 3000000) return 1;
  if (netAssets <= 5000000) return 2;
  return 3.5;
}

// KST 주차 키(예: "2026-W30") — 주간 세금 징수/쿨다운의 단일 진실원.
//   Cloud Functions 런타임은 UTC라 아래 로컬 getter가 곧 KST(+9h 보정 후)를 읽는다.
//   ⚠️ 공식이 여러 곳에 복붙되면 동기화 누락으로 버그가 났던 전례(주급 공식) → 반드시 이 헬퍼만 사용.
function computeKstWeekKey(baseDate = new Date()) {
  return computeWeekKey(baseDate);
}

async function collectPropertyHoldingTaxesLogic(targetClassCode = null, options = {}) {
  // 🔥 정책 (2026-05):
  //   주간 세금 = 순자산세(모든 학생, 순자산 기준) + 부동산 보유세(부동산 가치 기준, 누진)
  //   targetClassCode 지정 시 해당 학급만 처리(수동 징수), 없으면 전체 학급(자동 스케줄)
  // 🔒 주-1회 멱등(2026-07-21, Gemini CRITICAL — 이중과세 차단):
  //   force=false(자동 금요일 스케줄러·백업 HTTP)면 학급별로 governmentSettings.lastWeeklyTaxWeekKey를
  //   확인해 이번 주 이미 걷힌 학급은 건너뛴다. 국세청장이 주중에 걷은 학급이 금요일 자동 징수로 또
  //   걷혀 학생이 주 2회 과세되던 문제를 막는다(전역 systemState/lastPropertyTax 락은 학급별이 아님).
  //   force=true(교사 수동 버튼·국세청장 선점 후)는 스킵 없이 실행 — 교사는 강제 재징수 가능, 국세청장은
  //   호출 전 트랜잭션으로 weekKey를 이미 선점했으므로 여기서 스킵되면 자기 징수가 무효화되는 걸 방지.
  const force = options.force === true;
  // 트리거 출처(감사 로그·완료마커용): auto(자동 스케줄러) / manual(교사) / officer(국세청장).
  const triggerSource = options.source || (force ? "manual" : "auto");
  const triggeredBy = options.triggeredBy || null; // 징수 실행자 uid(officer/교사)
  // 감사 로그 라벨 — 학생이 대량 차감을 트리거할 수 있는 기능이라 출처를 로그에 명시(cash_safety 원칙).
  const sourceLabel =
    triggerSource === "officer" ? "[국세청장]" : triggerSource === "manual" ? "[교사]" : "[자동]";
  logger.info(
    targetClassCode
      ? `>>> [수동] 주간 세금 징수 시작 (${targetClassCode}${force ? ", force" : ""}, src=${triggerSource})`
      : ">>> [스케줄러] 주간 세금 징수 시작 (순자산세 + 부동산 보유세)",
  );

  try {
    const classCodes = targetClassCode
      ? [targetClassCode]
      : await getAllActiveClassCodes();
    let totalCollected = 0;
    let totalUsersProcessed = 0;

    // 주차 키 (학생 팝업 식별 + 주-1회 멱등). options.weekKey가 오면 그대로 사용 —
    //   국세청장 경로는 선점 트랜잭션에서 계산한 weekKey를 넘겨 "선점 키 ≠ 징수 키"(주 경계 race)를 없앤다.
    const weekKey = options.weekKey || computeKstWeekKey();

    for (const classCode of classCodes) {
      logger.info(`[부동산세] ${classCode} 클래스 처리 시작`);

      // 관리자(선생님) 찾기 — claim(마킹)보다 먼저 확인. 관리자 없는 학급은 징수 대상(국고)이 없어
      //   과세 없이 건너뛰는데, claim을 먼저 하면 "0원인데 이번 주 징수됨"으로 마킹돼 그 주 재징수가
      //   막힌다(under-tax). admin 부재를 먼저 걸러 이 잔여 케이스를 없앤다.
      const adminSnapshot = await findApprovedAdminSnap(classCode);
      if (adminSnapshot.empty) {
        logger.warn(`[부동산세] ${classCode}: 관리자 계정을 찾을 수 없음 - 건너뜀`);
        continue;
      }
      const adminDoc = adminSnapshot.docs[0];

      // 🔒 주-1회 멱등(트랜잭션 claim): 이번 주 이미 걷힌 학급은 스킵(자동/백업 경로만 — force면 스킵 안 함).
      //   단순 read-then-act(get 후 진행)면 국세청장의 원자적 선점과 시간상 교차 시 둘 다 징수해
      //   이중과세가 났다(code-reviewer/codex HIGH). 그래서 국세청장 경로와 동일하게 weekKey를
      //   트랜잭션으로 선점한다 — 자동/백업 vs 국세청장이 governmentSettings 문서를 두고 상호 배제된다.
      //   claim 성공 후 실제 과세(batch)가 실패하면 그 주엔 미징수(under-tax, 안전 방향) → 교사 force 백업.
      if (!force) {
        try {
          await db.runTransaction(async (tx) => {
            const gsRef = db.collection("governmentSettings").doc(classCode);
            const gsDoc = await tx.get(gsRef);
            if (gsDoc.exists && gsDoc.data().lastWeeklyTaxWeekKey === weekKey) {
              throw new HttpsError("already-exists", "이미 징수됨");
            }
            tx.set(
              gsRef,
              {
                lastWeeklyTaxWeekKey: weekKey,
                lastWeeklyTaxAt: admin.firestore.FieldValue.serverTimestamp(),
                lastWeeklyTaxSource: "auto",
              },
              { merge: true },
            );
          });
        } catch (claimErr) {
          if (claimErr instanceof HttpsError && claimErr.code === "already-exists") {
            logger.info(
              `[주간세금] ${classCode}: 이번 주(${weekKey}) 이미 징수됨 — 스킵(이중과세 방지)`,
            );
            continue;
          }
          throw claimErr;
        }
      }

      // 주식 현재가 (학급당 1회 조회 — 거시지표·자산 계산 공유)
      const stockMap = {};
      try {
        // 주식 시세: 정식 소스 CentralStocks의 전역 스냅샷(realStockService 갱신).
        // 과거 classes/{classCode}/stocks/stockList 는 write가 없는 죽은 경로라 항상 비어
        // 주식이 순자산세·부동산세 과세 순자산에서 누락되던 버그를 차단한다.
        const stockListDoc = await db
          .collection("Settings").doc("centralStocksCache").get();
        if (stockListDoc.exists) {
          // 미러는 realStockService가 isListed==true만 담지만, 미러 로직 변경에 대비해
          // 상장 종목만 가격을 등록한다(상장폐지 주식이 순자산에 산입되지 않도록).
          (stockListDoc.data().stocks || []).forEach((s) => { if (s.isListed !== false) stockMap[s.id] = Number(s.price) || 0; });
        }
      } catch (err) {
        logger.warn(`[부동산세] ${classCode}: 주식 목록 조회 실패`, err.message);
      }

      // 쿠폰 가치(순자산 계산에 필요) — settings/mainSettings 에서 1회 조회
      let couponValue = 1000;
      try {
        const msSnap = await db.doc("settings/mainSettings").get();
        if (msSnap.exists && Number(msSnap.data().couponValue)) {
          couponValue = Number(msSnap.data().couponValue);
        }
      } catch (err) {
        logger.warn(`[부동산세] ${classCode}: 쿠폰가치 조회 실패 - 기본값 1000`, err.message);
      }

      // 학급 학생 조회 (관리자 제외 + isSuperAdmin/isTeacher도 제외)
      const usersSnapshot = await db
        .collection("users")
        .where("classCode", "==", classCode)
        .where("isAdmin", "==", false)
        .get();
      if (usersSnapshot.empty) continue;

      // 전체 자산 계산 — 거시지표 + 누진세율 결정에 필요
      const userAssetResults = await Promise.all(
        usersSnapshot.docs.map(async (userDoc) => {
          const userId = userDoc.id;
          const userData = userDoc.data();
          if (userData.isSuperAdmin || userData.isTeacher) return null;
          const userName = userData.name || userData.nickname || "알 수 없음";
          const assets = await computeUserNetAssets(classCode, userId, userData, stockMap, couponValue);
          return { userDoc, userId, userName, ...assets };
        }),
      );
      const validResults = userAssetResults.filter(Boolean);
      if (validResults.length === 0) continue;

      // ─── 거시지표 계산 ───
      const netAssetsList = validResults.map((r) => r.netAssets);
      const totalCashSum = validResults.reduce((s, r) => s + r.cash, 0);
      const totalNetSum = validResults.reduce((s, r) => s + r.netAssets, 0);
      const avgNet = Math.round(totalNetSum / validResults.length);
      const gini = computeGiniCoefficient(netAssetsList);
      const classBaseRate = lookupClassBaseRate(avgNet);

      logger.info(
        `[거시지표] ${classCode}: 학생 ${validResults.length}명, ` +
        `평균 순자산 ${avgNet.toLocaleString()}원, 지니 ${gini.toFixed(3)}, ` +
        `기본세율 ${(classBaseRate * 100).toFixed(2)}%`,
      );

      // classMacroStats 저장 (학급 거시경제 대시보드 데이터 소스)
      const macroRef = db.collection("classMacroStats").doc(classCode);
      // 🔒 분할 커밋(2026-08-11 3차 검증 C6-b). 학생당 최대 3쓰기(현금·순자산세로그·보유세로그)라
      //   166명 안팎에서 Firestore 500 한도를 넘어 **그 학급 전체 징수가 실패**했다.
      //   분할이 안전한 이유는 아래 학생 단위 마커(lastWeeklyTaxWeekKey) 덕분이다.
      let batch = db.batch();
      let batchOps = 0;
      // 🔒 이 배치가 걷은 세금. **같은 배치**에서 국고(관리자)에 입금해야
      //    커밋된 배치가 항상 수지가 맞는다(2026-08-12 Gemini CRITICAL).
      //    종전엔 학생 차감은 배치별로 나가는데 국고 입금만 **맨 끝 한 번**이라,
      //    중간 배치 커밋 후 죽으면 걷은 돈이 국고에 안 들어가고
      //    재실행은 학생 마커에 막혀 그만큼이 **영구 소각**됐다.
      //    같은 PR 의 economicEvents 3함수가 이미 이 규약인데 여기만 빠져 있었다.
      let chunkTax = 0;
      let chunkNetAssetTax = 0;
      let chunkPropertyTax = 0;
      const treasuryRef = db.collection("nationalTreasuries").doc(classCode);
      const creditTreasury = () => {
        if (chunkTax <= 0) return;
        batch.update(adminDoc.ref, {
          cash: admin.firestore.FieldValue.increment(chunkTax),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 국고 **통계**도 같은 배치에. 현금은 청크별인데 통계만 맨 끝 한 번이면,
        // 마지막 청크가 실패했을 때 앞 청크들의 징수는 살아 있는데 통계만 유실된다
        // (마커 때문에 재실행이 보정하지도 못한다). 대시보드가 조용히 틀려진다.
        batch.set(
          treasuryRef,
          {
            netAssetTaxRevenue: admin.firestore.FieldValue.increment(chunkNetAssetTax),
            propertyHoldingTaxRevenue: admin.firestore.FieldValue.increment(chunkPropertyTax),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        batchOps += 2;
        chunkTax = 0;
        chunkNetAssetTax = 0;
        chunkPropertyTax = 0;
      };
      const flushTaxIfNeeded = async (extraOps) => {
        // reserved:2 = 국고 입금 자리(관리자 cash + 국고 통계) — 걷은 게 있으면 반드시 함께 나간다
        if (shouldFlush(batchOps, extraOps, { reserved: 2 })) {
          creditTreasury();
          await batch.commit();
          batch = db.batch();
          batchOps = 0;
        }
      };
      batchOps++; // 아래 macroRef set
      batch.set(macroRef, {
        weekKey,
        studentCount: validResults.length,
        avgNetAssets: avgNet,
        totalNetAssets: totalNetSum,
        totalCash: totalCashSum,
        giniCoefficient: Number(gini.toFixed(4)),
        classBaseRate,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 주간세 설정 — 교사 국세청 UI(governmentSettings/{classCode}.taxSettings)로 제어(2026-07-21).
      //   netAssetTaxRate: 순자산 세율(기본 0.5%), netAssetTaxExemption: 면세 기준(순자산 이 값 초과면 과세),
      //   propertyHoldingTaxRate: 부동산 보유세율(플랫, 기본 0.2%). 과거 taxSettings 컬렉션(dead)·누진
      //   알고리즘 대신 교사가 편집한 값을 직접 사용(사용자 결정 2026-07-21).
      // 세율 정규화(기본값 적용·클램프)는 taxMath.js 단일 정본 — 공식이 테스트로 고정돼 있다.
      let rawTaxSettings = {};
      try {
        const gsDoc = await db.collection("governmentSettings").doc(classCode).get();
        rawTaxSettings = (gsDoc.exists && gsDoc.data().taxSettings) || {};
      } catch (err) {
        logger.warn(`[주간세] ${classCode}: governmentSettings 조회 실패 - 기본값 사용`, err.message);
      }
      const taxSettings = normalizeWeeklyTaxSettings(rawTaxSettings);
      const netAssetTaxRate = taxSettings.netAssetTaxRate;
      const netAssetExemption = taxSettings.netAssetTaxExemption;
      const propertyHoldingTaxRate = taxSettings.propertyHoldingTaxRate;

      let classTotalTax = 0;
      let classNetAssetTax = 0;
      let classPropertyTax = 0;
      let classUsersProcessed = 0;
      let classTaxedStudents = 0;

      for (const result of validResults) {
        const { userId, userName, netAssets, realEstateValue } = result;

        // 🔒 학생 단위 멱등 마커. 아래 userUpdate 에 필드 하나로 실리므로 **쓰기 증가 0**.
        //   이게 있어야 위 분할 커밋이 안전하다(중간까지 커밋된 뒤 죽어도 재실행이 걸러진다).
        //   force 경로에도 적용한다 — 교사의 재징수는 "못 걷은 학생을 마저 걷는 것"이지
        //   이미 낸 학생에게 두 번 물리는 게 아니다. 덕분에 문서화된 복구 경로(force)가
        //   비로소 안전해진다(종전엔 force 재실행이 전원 재과세였다).
        //   (result 는 userDoc 을 그대로 들고 있다 — 별도 조회 없이 마커를 읽는다.)
        if (result.userDoc?.data()?.lastWeeklyTaxWeekKey === weekKey) {
          classUsersProcessed++;
          continue;
        }

        // ── 세액 계산 — 공식은 taxMath.js 단일 정본(taxMath.test.js 가 고정) ──
        //   1) 순자산세: 순자산이 면세 기준을 초과할 때만. 과세표준은 현금이 아니라 순자산.
        //   2) 부동산 보유세: 부동산 가치 × 교사 UI 플랫 세율(2026-07-21 누진 알고리즘 폐지).
        //      기존 classBaseRate×개인배율(lookupProgressiveMultiplier) 대신 governmentSettings 값을
        //      그대로 적용. classBaseRate/gini는 거시경제 대시보드용으로만 계속 계산.
        const { netAssetTax, propertyTax, totalTax } = computeWeeklyTax(
          { netAssets, realEstateValue },
          taxSettings,
        );
        const multiplier = 1; // 누진 배율 폐지 — 팝업 호환 위해 1로 고정

        // 학생 팝업 데이터 — 두 세금 항목 모두 저장 (면세든 과세든 알려줌)
        const items = [
          {
            type: "netAssetTax",
            label: "순자산세",
            amount: netAssetTax,
            rate: Number(netAssetTaxRate.toFixed(5)),
            basis: netAssets,
            basisLabel: "순자산",
            // 순자산세 항목은 note를 항상 채워 부동산식 계산식이 안 뜨게 함
            //   면세 기준(netAssetExemption)이 설정된 학급에선 "순자산 없음"이 아니라
            //   "기준 이하라 면세"임을 정확히 알려준다(기준 노출 후 오해 방지).
            note: netAssets > netAssetExemption
              ? `순자산의 ${(netAssetTaxRate * 100).toFixed(2)}% (현금·예금·주식·부동산 합계 − 대출)`
              : netAssetExemption > 0
                ? `순자산 ${netAssetExemption.toLocaleString()}원 이하는 면세 (내 순자산 ${netAssets.toLocaleString()}원)`
                : "순자산 없음 → 과세 0원",
          },
          {
            type: "propertyHoldingTax",
            label: "부동산 보유세",
            amount: propertyTax,
            rate: Number(propertyHoldingTaxRate.toFixed(5)),
            // 플랫 세율 — 팝업의 "학급기본 × 배율" 표기가 헷갈리지 않게 기본=최종세율, 배율=1로 통일.
            classBaseRate: Number(propertyHoldingTaxRate.toFixed(5)),
            multiplier,
            basis: realEstateValue,
            basisLabel: "부동산 가치",
            note: realEstateValue <= 0
              ? "보유 부동산 없음 → 과세 0원"
              : `부동산 가치의 ${(propertyHoldingTaxRate * 100).toFixed(2)}%`,
          },
        ];

        const userRef = db.collection("users").doc(userId);
        const userUpdate = {
          pendingTaxSummary: {
            weekKey,
            items,
            total: totalTax,
            avgClassNet: avgNet,
            // 플랫 보유세로 전환 — 팝업의 기본세율=최종세율, 배율=1(누진 배율 폐지).
            classBaseRate: Number(propertyHoldingTaxRate.toFixed(5)),
            personalMultiplier: multiplier,
            personalNetAssets: netAssets,
            generatedAt: admin.firestore.Timestamp.now(),
          },
          lastWeeklyTaxWeekKey: weekKey, // 멱등 마커 — 같은 update 에 필드 하나(쓰기 증가 0)
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // ⚠️ 순자산 기준 전액 징수 — 현금이 부족해도 increment로 차감(마이너스 허용)
        if (totalTax > 0) {
          userUpdate.cash = admin.firestore.FieldValue.increment(-totalTax);
        }
        // 이 학생이 쓸 최대 3개(현금·순자산세로그·보유세로그) 자리를 확보한다
        await flushTaxIfNeeded(3);
        batchOps += 3;
        batch.update(userRef, userUpdate);

        // 감사 로그 — 세금 항목별로 분리 기록 (audit trail)
        const logExpireAt = new Date();
        logExpireAt.setDate(logExpireAt.getDate() + 90);
        if (netAssetTax > 0) {
          batch.set(db.collection("activity_logs").doc(), {
            userId,
            userName,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "taxPayment",
            description:
              `${sourceLabel} 순자산세 ${netAssetTax.toLocaleString()}원 ` +
              `(순자산 ${netAssets.toLocaleString()}원 × ${(netAssetTaxRate * 100).toFixed(2)}%)`,
            source: triggerSource,
            triggeredBy: triggeredBy || null,
            classCode,
            expireAt: admin.firestore.Timestamp.fromDate(logExpireAt),
          });
        }
        if (propertyTax > 0) {
          batch.set(db.collection("activity_logs").doc(), {
            userId,
            userName,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: "taxPayment",
            description:
              `${sourceLabel} 부동산 보유세 ${propertyTax.toLocaleString()}원 ` +
              `(세율 ${(propertyHoldingTaxRate * 100).toFixed(2)}% × 부동산 ${realEstateValue.toLocaleString()}원)`,
            source: triggerSource,
            triggeredBy: triggeredBy || null,
            classCode,
            expireAt: admin.firestore.Timestamp.fromDate(logExpireAt),
          });
        }

        if (totalTax > 0) {
          classTotalTax += totalTax;
          chunkTax += totalTax; // 이 배치 몫 — flush/마감 때 국고로 함께 나간다
          chunkNetAssetTax += netAssetTax;
          chunkPropertyTax += propertyTax;
          classNetAssetTax += netAssetTax;
          classPropertyTax += propertyTax;
          classTaxedStudents++;
        }
        classUsersProcessed++;
      }

      // 학급 마감 쓰기(완료 마커 1개) 자리 확보.
      //   국고 입금·통계는 creditTreasury() 가 자체적으로 batchOps 를 올리고,
      //   flushTaxIfNeeded 가 이미 +2 를 예약해 두므로 여기서 다시 세지 않는다.
      await flushTaxIfNeeded(1);
      batchOps += 1;

      // 남은 배치 몫을 국고에 입금(위 flush 에서 이미 나간 분은 제외돼 있다)
      creditTreasury();

      // (국고 통계는 creditTreasury() 가 청크마다 현금 입금과 함께 기록한다 — 여기서 다시 쓰지 않는다)

      // 🔒 주간 세금 징수 완료 주차 기록을 과세 batch에 포함 — 과세와 완료마커를 원자적으로 커밋.
      //   (별도 write로 분리하면 batch.commit 성공 후 마커 write만 실패 시 재시도가 재과세를 유발 — codex HIGH.)
      //   자동(금)·교사 수동·국세청장 징수가 모두 여기에 weekKey를 남긴다. 학생은 이 값을 읽어 UI 배지를
      //   표시하되 rules상 write 불가 → 위조 불가. 자동경로는 위 트랜잭션 claim으로 이미 선점했고, 여기선
      //   force 경로(교사·국세청장)의 완료마커까지 통일해 기록한다.
      batch.set(
        db.collection("governmentSettings").doc(classCode),
        {
          lastWeeklyTaxWeekKey: weekKey,
          lastWeeklyTaxAt: admin.firestore.FieldValue.serverTimestamp(),
          lastWeeklyTaxSource: triggerSource,
          ...(triggeredBy ? { lastWeeklyTaxBy: triggeredBy } : {}),
        },
        { merge: true },
      );

      await batch.commit();
      totalCollected += classTotalTax;
      totalUsersProcessed += classUsersProcessed;

      logger.info(
        `[주간세금] ${classCode} 완료: ${classUsersProcessed}명 처리, 과세 ${classTaxedStudents}명, ` +
        `총 ${classTotalTax.toLocaleString()}원 (순자산세 ${classNetAssetTax.toLocaleString()} + 부동산세 ${classPropertyTax.toLocaleString()})`,
      );
    }

    logger.info(
      `→ 주간 세금(순자산세 + 부동산 보유세) 징수 완료: 총 ${totalUsersProcessed}명, ${totalCollected.toLocaleString()}원`,
    );
    return { totalCollected, totalUsersProcessed };
  } catch (error) {
    logger.error("→ 주간 세금 징수 중 오류:", error);
    throw error;
  }
}

async function provideSocialSafetyNetLogic() {
  logger.info(">>> [스케줄러] 사회안전망 제공 시작");
  // 추후 복지 시스템과 연동하여 구현 예정
  logger.info("사회안전망 제공 로직은 아직 구현되지 않았습니다.");
}

async function openMarketLogic() {
  logger.info(">>> [스케줄러] 시장 개장 시작");
  // 필요시 시장 상태 플래그 설정 등으로 구현 가능
  logger.info("시장 개장 로직은 아직 구현되지 않았습니다.");
}

async function closeMarketLogic() {
  logger.info(">>> [스케줄러] 시장 폐장 시작");
  // 필요시 시장 상태 플래그 설정 등으로 구현 가능
  logger.info("시장 폐장 로직은 아직 구현되지 않았습니다.");
}

async function aggregateActivityStatsLogic() {
  logger.info(">>> [스케줄러] 활동 통계 집계 시작");
  // 필요시 추후에 구현
}

async function updateClassStatsLogic() {
  logger.info(">>> [스케줄러] 클래스 통계 업데이트 시작");
  // 필요시 추후에 구현
}

async function updatePortfolioSummaryLogic() {
  logger.info(">>> [스케줄러] 포트폴리오 요약 업데이트 시작");
  // 필요시 추후에 구현
}

async function aggregateActivityLogsLogic() {
  logger.info(">>> [스케줄러] 활동 로그 집계 시작");
  // 필요시 추후에 구현
}

// ===================================================================================
// TTL 만료 문서 정리
// ===================================================================================
exports.cleanupExpiredDocuments = onRequest(
  { region: "asia-northeast3", timeoutSeconds: 120 },
  async (req, res) => {
    try {
      // 🔒 2026-08-03: 이 엔드포인트만 형제 17개와 달리 토큰 검사가 없어 인증 없이
      //    호출 가능했다. 만료(expireAt <= now)된 문서만 지우므로 자산 위조 경로는
      //    아니지만, 반복 호출로 컬렉션당 500건씩 읽기·삭제를 유발해 과금을 태울 수
      //    있었다(activity_logs는 감사 로그라 조기 삭제 자체도 바람직하지 않다).
      const token = req.headers["x-scheduler-auth"] || req.query.token;
      if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
        // ⚠️ 이 엔드포인트는 저장소 안에 호출자가 없다(GHA 워크플로에도 없음). 정기 실행이
        //    있다면 GCP Cloud Scheduler에 콘솔로 직접 등록된 것이고, 그 job의 URL에
        //    ?token= 이 없으면 이 인증 추가로 조용히 멈춘다. 그래서 눈에 띄게 남긴다 —
        //    로그에 이 문구가 보이면 해당 job URL에 토큰을 붙일 것.
        logger.warn(
          "[cleanupExpiredDocuments] 401 — 토큰 없는 호출. 정기 실행 job이라면 " +
            "Cloud Scheduler URL에 ?token=<SCHEDULER_AUTH_TOKEN> 추가 필요.",
          { hasToken: Boolean(token), ua: req.get("user-agent") || null }
        );
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const now = admin.firestore.Timestamp.now();
      const collections = [
        { name: "activity_logs", field: "expireAt" },
        { name: "pendingApprovals", field: "expireAt" },
      ];

      let totalDeleted = 0;
      for (const col of collections) {
        const snapshot = await db
          .collection(col.name)
          .where(col.field, "<=", now)
          .limit(500)
          .get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
          totalDeleted += snapshot.size;
          logger.info(
            `[TTL Cleanup] ${col.name}: ${snapshot.size}개 만료 문서 삭제`
          );
        }
      }

      logger.info(`[TTL Cleanup] 총 ${totalDeleted}개 만료 문서 삭제 완료`);
      res.json({ success: true, deleted: totalDeleted });
    } catch (error) {
      logger.error("[TTL Cleanup] 오류:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ===================================================================================
// 🔥 [Cloud Scheduler v2] 주간 경제 스케줄러 — 주급(월), 월세+재산세(금)
// 1개 Cloud Scheduler job으로 주급/월세/재산세 3가지 처리
// ===================================================================================
exports.weeklyEconomySchedulerV2 = onSchedule(
  {
    region: "asia-northeast3",
    // KST 월·금 08:30 — 주급(월) / 재산세+월세(금).
    // ⚠️ timeZone 을 UTC 로 두면 "KST 08:30 = UTC 23:30 **전날**"이라 요일 필드까지
    //    하루 당겨 써야 한다(월 08:30 → 일 23:30). 실제로 예전엔 그렇게 적혀 있었고,
    //    시간만 고치고 요일을 안 당기면 지급이 통째로 하루 밀린다. 그 함정을 없애려고
    //    스케줄 자체를 KST 로 표기한다. 한국은 서머타임이 없어 연중 고정이다.
    //    (아래 본문의 요일 판정 `kstNow.getUTCDay()` 는 실제 시각 기준이라 이 설정과 무관하게 그대로 동작한다.)
    schedule: "30 8 * * 1,5", // KST 월·금 08:30
    timeZone: "Asia/Seoul",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      const vacationMode = await isVacationMode();
      if (vacationMode) {
        logger.info("[weeklyEconomyV2] 방학 모드 - skip");
        return;
      }

      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const day = kstNow.getUTCDay(); // 0=Sun, 1=Mon, 5=Fri

      if (day === 1) {
        // 월요일: 주급 지급
        logger.info("[weeklyEconomyV2] 월요일 — 주급 지급 시작");
        const result = await payWeeklySalariesLogic();
        logger.info("[weeklyEconomyV2] 주급 지급 완료:", result);
      } else if (day === 5) {
        // 금요일: 재산세 + 월세
        logger.info("[weeklyEconomyV2] 금요일 — 재산세 + 월세 징수 시작");

        // 재산세 · 월세 — 주급과 같은 락 규약(점유는 트랜잭션, 완료 표시는 성공 뒤).
        //   종전 패턴은 `.get()` 후 별개 쓰기라 동시 실행 시 둘 다 징수했다.
        const taxWeekKey = computeWeekKey(now);
        const jobs = [
          { doc: "lastPropertyTax", label: "재산세", run: collectPropertyHoldingTaxesLogic },
          { doc: "lastWeeklyRent", label: "월세", run: collectWeeklyRentLogic },
        ];
        // 한 작업이 실패해도 다른 작업은 돌린다. 재산세가 터졌다고 월세까지 안 걷을 이유가 없고,
        // 둘은 서로 독립적인 락을 쓴다. 실패는 모아서 마지막에 던진다(재throw = 실패가 보이게).
        const jobErrors = [];
        for (const job of jobs) {
          const ref = db.collection("systemState").doc(job.doc);
          const claimed = await claimPeriodLock(ref, taxWeekKey, {
            label: `weeklyEconomyV2 ${job.label}`,
          });
          if (!claimed) {
            logger.info(`[weeklyEconomyV2] ${job.label} 이번 주 이미 완료 또는 진행 중 — skip`);
            continue;
          }
          try {
            await job.run();
            await completePeriodLock(ref, taxWeekKey, {
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
            logger.info(`[weeklyEconomyV2] ${job.label} 징수 완료: ${taxWeekKey}`);
          } catch (jobError) {
            logger.error(`[weeklyEconomyV2] ${job.label} 실패:`, jobError);
            await releasePeriodLock(ref, taxWeekKey, jobError);
            jobErrors.push(`${job.label}: ${jobError?.message || jobError}`);
          }
        }
        if (jobErrors.length > 0) {
          throw new Error(`금요일 징수 실패 — ${jobErrors.join(" / ")}`);
        }
      } else {
        logger.info(`[weeklyEconomyV2] 오늘(${day})은 대상 요일 아님 — skip`);
      }
    } catch (error) {
      logger.error("[weeklyEconomyV2] 오류:", error);
      // 🔁 재throw = **가시성**. 실측(2026-08-11): 배포된 4개 job 전부 retryConfig={} (retryCount 0)
      //    이라 자동 재시도는 붙지 않는다. 삼키면 주급이 통째로 실패해도 대시보드는 초록색이다.
      //    락은 위에서 이미 풀렸으므로(status:"failed") 수동/다음 실행이 실제로 지급한다.
      throw error;
    }
  },
);

// ===================================================================================
// 🔄 일회성 마이그레이션: 잘못 학생 문서로 생성된 선생님 복구
// 원인: firestore.rules가 가입 시 isAdmin:true를 차단 → AuthContext가 학생 문서로 대체
// 해결: classes/{*}.teacherId 로 식별 → 해당 user에 isAdmin/isTeacher:true, isApproved:false 설정
// systemState 플래그로 1회만 실행
// ===================================================================================

// ===================================================================================
// 🔄 일회성 마이그레이션: 기존 학급의 CASH_PENALTY description을 정확한 텍스트로 갱신
// 정책 변경(현금 5% → 순자산 5%)에 맞춰 학생 안내문 동기화
// systemState 플래그로 1회만 실행
// ===================================================================================
// ⚠️ 왜 이건 안 지웠나(2026-08-20 code-reviewer 지적에 대한 답): 이번 정리의 기준은
//   "죽은 함수"가 아니라 **"열려 있는 HTTP 엔드포인트"**다(P0-F = 공격면 축소).
//   recoverTeacherAccountsOnce 가 지워진 건 그 자체가 죽어서가 아니라 유일한 호출부였던
//   공개 엔드포인트(recoverTeachersManual)를 없앴기 때문이다. 이 함수엔 엔드포인트가 없어
//   공격면이 0 이라 이번 범위 밖이다. (완료 표식은 systemState/cashPenaltyDescMigrated_v2,
//   migratedAt 2026-05-07 — 지울 근거는 있으니 별건으로 정리할 것.)
async function migrateCashPenaltyDescriptionsOnce() {
  const flagRef = db.collection("systemState").doc("cashPenaltyDescMigrated_v2");
  const flagSnap = await flagRef.get();
  if (flagSnap.exists) return; // 이미 완료

  const NEW_TEXT = "경제 위기 — 순자산의 5%만큼 현금이 차감됩니다 (현금 잔고 한도 내)";
  // 옛 텍스트 패턴: "현금이 N% 삭감", "현금의 N%" 등 폭넓게 매칭
  const OLD_PATTERN = /현금이?\s*\d+\s*%\s*(가\s*)?삭감|모든\s*시민의\s*현금/;

  const settingsSnap = await db.collection("economicEventSettings").get();
  let classesUpdated = 0;
  let eventsUpdated = 0;

  for (const docSnap of settingsSnap.docs) {
    const data = docSnap.data();
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length === 0) continue;

    let changed = false;
    const newEvents = events.map((e) => {
      if (e.type === "CASH_PENALTY") {
        const desc = e.description || "";
        if (desc !== NEW_TEXT && OLD_PATTERN.test(desc)) {
          changed = true;
          eventsUpdated++;
          return { ...e, description: NEW_TEXT };
        }
      }
      return e;
    });

    if (changed) {
      await docSnap.ref.update({ events: newEvents });
      classesUpdated++;
    }
  }

  await flagRef.set({
    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    classesUpdated,
    eventsUpdated,
  });
  logger.info(
    `[Migration] CASH_PENALTY description 마이그레이션 완료: ${classesUpdated}개 학급 / ${eventsUpdated}개 이벤트`,
  );
}

// ===================================================================================
// 🔥 [Cloud Scheduler v2] 매시간 스케줄러 — 자정리셋(0시), 경제이벤트(8~17시), 환율(7시)
// 1개 Cloud Scheduler job으로 자정리셋/경제이벤트/환율/적금납입 통합 처리
// (2026-08-03: 게임 제거로 '오목정리' 단계는 삭제됨)
// ===================================================================================
exports.hourlySchedulerV2 = onSchedule(
  {
    region: "asia-northeast3",
    schedule: "0 * * * *", // 매시 정각
    timeZone: "Asia/Seoul",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      const vacationMode = await isVacationMode();
      if (vacationMode) {
        logger.info("[hourlyV2] 방학 모드 - skip");
        return;
      }

      // 🔄 일회성 마이그레이션은 hourly 호출 제거 (매시간 read 비용 절감)
      //   필요 시 scheduler.yml workflow_dispatch로 수동 실행 (init-classroom 등).
      //   ⚠️ recover-teachers·backfill-musicrooms 는 2026-08-20 제거됐다(완료된 마이그레이션).

      const now = new Date();
      const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const hour = kstNow.getUTCHours();
      const day = kstNow.getUTCDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
      const isWeekday = day >= 1 && day <= 5;

      logger.info(`[hourlyV2] KST ${hour}시, 요일=${day}`);

      // 🔁 분기별 try/catch 는 **부분 실패 허용**이 의도다(환율이 죽어도 경제이벤트는 돌아야 한다).
      //    다만 종전엔 삼키기만 해서 job 이 초록색으로 끝났다 — 실패를 모아 마지막에 던진다(3차 검증 HIGH3).
      const branchErrors = [];

      // 🕛 자정 (KST 0시): 일일 과제 리셋 + 적금 자동 납입
      if (hour === 0) {
        const todayStr = kstNow.toISOString().split("T")[0];
        const resetLockRef = db.collection("systemState").doc("lastMidnightReset");
        // 🔒 이 분기는 적금 자동 납입(학생→교사 현금 이체)을 돌린다. 점유를 원자화한다.
        const claimed = await claimPeriodLock(resetLockRef, todayStr, {
          label: "hourlyV2 자정 리셋",
        });
        if (claimed) {
          logger.info("[hourlyV2] 자정 리셋 시작");
          try {
            await resetDailyTasksLogic();

            // ⚠️ 적금 실패를 삼키면 안 된다(2026-08-11 2차 검증 C9).
            //    삼키면 아래 completePeriodLock 이 그날을 '완료'로 박고, 같은 날 수동
            //    midnightReset 도 같은 락에 막혀 **그날 납입이 통째로 사라진다**.
            //    상품 단위 마커(lastDepositDate)가 있어 재실행이 안전하므로 던져서 재시도를 연다.
            const savingsResult = await processDailySavingsDeposits();
            logger.info("[hourlyV2] 적금 자동 납입 완료:", savingsResult);
          } catch (resetError) {
            await releasePeriodLock(resetLockRef, todayStr, resetError);
            throw resetError;
          }

          await completePeriodLock(resetLockRef, todayStr, {
            date: todayStr,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info("[hourlyV2] 자정 리셋 완료:", todayStr);
        } else {
          logger.info("[hourlyV2] 오늘 자정 리셋 이미 완료 — skip");
        }
      }

      // 🌅 오전 7시: 환율 업데이트
      if (hour === 7 && isWeekday) {
        logger.info("[hourlyV2] 환율 업데이트 시작");
        try {
          const result = await updateExchangeRate();
          logger.info("[hourlyV2] 환율 업데이트 완료:", result.rate);
        } catch (e) {
          logger.error("[hourlyV2] 환율 업데이트 오류:", e);
          branchErrors.push(`환율: ${e?.message || e}`);
        }
      }

      // 📊 평일 8~17시: 경제 이벤트
      if (isWeekday && hour >= 8 && hour <= 17) {
        logger.info("[hourlyV2] 경제 이벤트 스케줄러 실행");
        try {
          const result = await runEconomicEventsForAllClasses();
          logger.info("[hourlyV2] 경제 이벤트 완료:", result);
          // 학급별 실패는 그 안에서 부분 허용되지만, 여기까지 올려야 job 이 실패로 보인다.
          if (result?.classErrors?.length) {
            branchErrors.push(`경제이벤트 학급실패: ${result.classErrors.join(" / ")}`);
          }
        } catch (e) {
          logger.error("[hourlyV2] 경제 이벤트 오류:", e);
          branchErrors.push(`경제이벤트: ${e?.message || e}`);
        }
      }

      // 시간대 밖이면 로그만
      if (hour !== 0 && hour !== 7 && !(isWeekday && hour >= 8 && hour <= 17)) {
        // no-op: 빠른 종료 (Firestore 읽기 0)
        return;
      }

      if (branchErrors.length > 0) {
        throw new Error(`hourlyV2 부분 실패 — ${branchErrors.join(" / ")}`);
      }
    } catch (error) {
      logger.error("[hourlyV2] 전체 오류:", error);
      // 🔁 재throw = **가시성**. 실측(2026-08-11): 배포된 4개 job 전부 retryConfig={} (retryCount 0)
      //    이라 자동 재시도는 붙지 않는다. 삼키면 실패가 성공으로 보고돼 아무도 모른다.
      throw error;
    }
  },
);

// ===================================================================================
// 💎 [Cloud Scheduler v2] 매월 첫 금요일 KST 09:00 — 주식 배당 지급
// cron "0 9 1-7 * 5" = 매월 1~7일 중 금요일 (= 첫 금요일) 09:00
// ===================================================================================
exports.dividendSchedulerV2 = onSchedule(
  {
    region: "asia-northeast3",
    schedule: "0 9 1-7 * 5",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    try {
      const vacationMode = await isVacationMode();
      if (vacationMode) {
        logger.info("[dividendV2] 방학 모드 - skip");
        return;
      }
      logger.info("[dividendV2] 월간 배당 지급 시작");
      const result = await payMonthlyDividends();
      logger.info("[dividendV2] 완료:", result);
    } catch (error) {
      logger.error("[dividendV2] 오류:", error);
      // 🔁 재throw = **가시성**. 실측(2026-08-11): 배포된 4개 job 전부 retryConfig={} (retryCount 0)
      //    이라 자동 재시도는 붙지 않는다. 삼키면 실패가 성공으로 보고돼 아무도 모른다.
      throw error;
    }
  },
);

// ===================================================================================
// 💰 모든 학급의 'store_price_down' 이벤트를 25% 인하(multiplier: 0.75)로 마이그
// ===================================================================================
async function migrateStorePriceDown() {
  let updated = 0, skipped = 0;
  const settingsSnap = await db.collection("economicEventSettings").get();
  for (const docSnap of settingsSnap.docs) {
    const data = docSnap.data();
    const events = Array.isArray(data.events) ? data.events : [];
    if (events.length === 0) { skipped++; continue; }
    let changed = false;
    const newEvents = events.map((e) => {
      if (e.id === "store_price_down" || (e.type === "STORE_PRICE_CHANGE" && (e.params?.multiplier || 0) < 1)) {
        const newMult = 0.75;
        if (e.params?.multiplier !== newMult) {
          changed = true;
          return {
            ...e,
            title: "물가 안정!",
            description: "정부 물가 안정 정책으로 관리자 상점의 모든 상품 가격이 25% 인하되었습니다!",
            params: { ...(e.params || {}), multiplier: newMult },
          };
        }
      }
      return e;
    });
    if (changed) {
      await docSnap.ref.update({ events: newEvents });
      updated++;
    } else {
      skipped++;
    }
  }
  logger.info(`[migrateStorePriceDown] 완료 — updated:${updated}, skipped:${skipped}`);
  return { updated, skipped };
}

exports.migrateStorePriceDownManual = onRequest(
  { region: "asia-northeast3", cors: true },
  async (req, res) => {
    const token = req.headers["x-scheduler-auth"] || req.query.auth;
    if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // 🔐 전 학급 상점가를 일괄 변경하는 일회성 마이그레이션.
    if (!requireForceAuth(req, res, "상점 물가안정 25% 일괄 적용")) return;
    try {
      const result = await migrateStorePriceDown();
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error("[migrateStorePriceDownManual] 오류:", error);
      res.status(500).json({ error: error.message });
    }
  },
);


// ===================================================================================
// 🏫 학급 부가 데이터(직업/상점/은행/급여) 백필 — idempotent
// classes 문서만 있고 나머지 6가지가 빠진 '반쪽 학급' 보충용
// ===================================================================================
async function initClassroomDefaultsServerSide(classCode) {
  if (!classCode) return { created: false, error: "classCode missing" };

  let createdAny = false;
  const created = { jobs: 0, storeItems: 0, banking: false, classSettings: false, salary: false, classCodes: false, classDoc: false };

  // 1) jobs
  const jobsSnap = await db.collection("jobs").where("classCode", "==", classCode).limit(1).get();
  if (jobsSnap.empty) {
    const batch = db.batch();
    for (const jobTpl of DEFAULT_JOBS) {
      const tasks = jobTpl.tasks.map((t, i) => ({ ...t, id: `task_${Date.now()}_${i}` }));
      const ref = db.collection("jobs").doc();
      batch.set(ref, {
        title: jobTpl.title,
        active: true,
        tasks,
        classCode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created.jobs++;
    }
    await batch.commit();
    createdAny = true;
  }

  // 2) storeItems
  const itemsSnap = await db.collection("storeItems").where("classCode", "==", classCode).limit(1).get();
  if (itemsSnap.empty) {
    const batch = db.batch();
    for (const item of DEFAULT_STORE_ITEMS) {
      const ref = db.collection("storeItems").doc();
      batch.set(ref, {
        ...item,
        initialStock: item.stock,
        available: true,
        type: "item",
        classCode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created.storeItems++;
    }
    await batch.commit();
    createdAny = true;
  }

  // 3) bankingSettings
  const bankRef = db.collection("bankingSettings").doc(classCode);
  const bankSnap = await bankRef.get();
  if (!bankSnap.exists) {
    await bankRef.set({
      ...DEFAULT_BANKING,
      classCode,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    created.banking = true;
    createdAny = true;
  }

  // 4) classSettings + salary
  const csRef = db.collection("classSettings").doc(classCode);
  const csSnap = await csRef.get();
  if (!csSnap.exists) {
    await csRef.set(
      { classCode, createdAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    created.classSettings = true;
    createdAny = true;
  }
  const salaryRef = db.collection("classSettings").doc(classCode).collection("settings").doc("salary");
  const salarySnap = await salaryRef.get();
  if (!salarySnap.exists) {
    await salaryRef.set({
      salaries: DEFAULT_SALARIES,
      payDay: "friday",
      autoPay: true,
      classCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    created.salary = true;
    createdAny = true;
  }

  // 5) settings/classCodes에 codes + validCodes 동시 추가
  try {
    const ccRef = db.collection("settings").doc("classCodes");
    const ccSnap = await ccRef.get();
    const codesArr = ccSnap.exists ? ccSnap.data().codes || [] : [];
    const validArr = ccSnap.exists ? ccSnap.data().validCodes || [] : [];
    const needsCodes = !codesArr.includes(classCode);
    const needsValid = !validArr.includes(classCode);
    if (needsCodes || needsValid) {
      await ccRef.set(
        {
          codes: needsCodes ? [...codesArr, classCode] : codesArr,
          validCodes: needsValid ? [...validArr, classCode] : validArr,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      created.classCodes = true;
      createdAny = true;
    }
  } catch (e) {
    logger.warn("[initClassroom] classCodes 추가 실패 (skip):", e.message);
  }

  // 6) classes/{classCode} — **학급 목록의 정본이 될 문서**.
  //
  //   만드는 경로는 원래 있다 — 슈퍼관리자 승인 화면(SuperAdminDashboard.js:521·789).
  //   ⚠️ 다만 그 경로엔 구멍이 있다: `needsClassCode = !classCode || classCode === "미지정"` 이라
  //   **이미 학급코드를 가진 교사**를 승인하면 문서를 만들지 않고 지나간다(QAZWSX12 가 그 산물).
  //   또 초기화 경로(여기·클라 initClassroomDefaults)는 jobs·storeItems·banking·salary 만 만들었다.
  //
  //   이게 왜 중요한가: P0-E(학급 목록 정본을 users 전량 스캔 → classes 조회로 교체)의
  //   전제가 "classes 가 실제 학급과 일치한다"인데, **구멍이 있으면 그 일치는
  //   불변식이 아니라 우연**이다. 구멍으로 빠진 학급은 classes 에 없고,
  //   정본을 갈아탄 뒤라면 그 학급 학생들의 주급·세금이 **조용히** 끊긴다.
  //
  //   ⚠️ 이 블록의 도달 범위를 오해하지 말 것: 여기는 **수동 엔드포인트
  //   `initializeClassroomManual` 에서만** 불린다. 승인 흐름의 구멍은 클라이언트에서 막았고
  //   (SuperAdminDashboard.js `needsClassCode === false` 분기), 그래도 빠지는 건
  //   logClassRegistryDrift 의 주간 자가치유가 메운다. 여기는 그 둘의 뒤를 받치는 3중 안전망이다.
  //   cutover 는 세 경로로 만들어진 학급이 쌓이고
  //   logClassRegistryDrift 가 몇 주 연속 **양방향** 일치를 찍은 뒤에 한다.
  try {
    const classRef = db.collection("classes").doc(classCode);
    const classSnap = await classRef.get();
    if (!classSnap.exists) {
      // 아래는 `create()` 다 — `get() → set()` 사이에 승인 화면이 제대로 만들어 두면
      // 빈 className 과 새 createdAt 으로 그걸 덮어쓴다(2026-08-20 codex WARNING).
      // 교사 문서에서 이름을 끌어온다(없어도 학급 생성은 막지 않는다).
      let teacherId = null;
      let teacherName = "";
      try {
        const t = await db
          .collection("users")
          .where("classCode", "==", classCode)
          .where("isAdmin", "==", true)
          .limit(1)
          .get();
        if (!t.empty) {
          teacherId = t.docs[0].id;
          teacherName = t.docs[0].data().name || "";
        }
      } catch (e) {
        logger.warn("[initClassroom] 교사 조회 실패(학급 문서는 그대로 생성):", e.message);
      }
      try {
        await classRef.create(
          buildClassDoc({
            classCode,
            teacherId,
            teacherName,
            createdBy: "initClassroomDefaultsServerSide",
          }),
        );
        created.classDoc = true;
        createdAny = true;
        logger.info(`[initClassroom] ${classCode}: classes 문서 생성(정본 등록)`);
      } catch (e) {
        if (e && e.code === 6) {
          logger.info(`[initClassroom] ${classCode}: 그 사이 생성됨 — 건드리지 않음`);
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    // 학급 문서 생성 실패가 나머지 초기화를 되돌리게 하지 않는다 — 드리프트 로그가 잡아 준다.
    logger.error("[initClassroom] classes 문서 생성 실패:", e.message);
  }

  return { created: createdAny, detail: created };
}

// ===================================================================================
// 🏫 학급 초기화 수동 실행 endpoint (AUTH_TOKEN 보호)
// 사용: ?classCode=XXXXXX
// ===================================================================================
exports.initializeClassroomManual = onRequest(
  { region: "asia-northeast3", cors: true },
  async (req, res) => {
    const token = req.headers["x-scheduler-auth"] || req.query.auth;
    if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const classCode = (req.query.classCode || "").toString().trim();
    if (!classCode) {
      res.status(400).json({ error: "classCode query parameter required" });
      return;
    }
    // 🔐 학급 기본 데이터를 덮어쓴다. 살아 있는 학급에 잘못 쏘면 설정이 초기화된다.
    if (!requireForceAuth(req, res, `학급 기본값 초기화 ${classCode}`)) return;
    try {
      logger.info(`[initializeClassroomManual] ${classCode} 초기화 시작`);
      const result = await initClassroomDefaultsServerSide(classCode);
      logger.info(`[initializeClassroomManual] ${classCode} 완료:`, result);
      res.json({ success: true, classCode, ...result });
    } catch (error) {
      logger.error("[initializeClassroomManual] 오류:", error);
      res.status(500).json({ error: error.message });
    }
  },
);


// ===================================================================================
// 💎 배당 수동 실행 endpoint (테스트/긴급 지급용, AUTH_TOKEN 보호)
// ===================================================================================
exports.payDividendsManual = onRequest(
  { region: "asia-northeast3", cors: true },
  async (req, res) => {
    const token = req.headers["x-scheduler-auth"] || req.query.auth;
    if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      // 멱등 마커(lastDividendMonthKey)가 생겼으므로 같은 달 재호출은 이제 no-op 이다.
      // 누락된 달을 뒤늦게 지급하려면 ?monthKey=2026-07 처럼 명시한다(그 달 마커가 없는 보유분만 나간다).
      const monthKeyOverride = req.query.monthKey || null;
      if (monthKeyOverride && !/^\d{4}-\d{2}$/.test(monthKeyOverride)) {
        res.status(400).json({ error: "monthKey 형식은 YYYY-MM 입니다." });
        return;
      }
      // 🔐 monthKey 지정 = 과거 달 소급 지급. 파라미터 없는 호출은 멱등 마커가 막으므로 게이트 밖.
      if (monthKeyOverride && !requireForceAuth(req, res, `배당 소급 지급 ${monthKeyOverride}`)) return;
      logger.info(
        `[payDividendsManual] 수동 배당 지급 시작${monthKeyOverride ? ` (monthKey=${monthKeyOverride})` : ""}`,
      );
      const result = await payMonthlyDividends(monthKeyOverride);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error("[payDividendsManual] 오류:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// ===================================================================================
// 외부에서 사용될 수 있도록 로직 함수들 export
// ===================================================================================
module.exports.updateCentralStockMarketLogic = updateCentralStockMarketLogic; // 하위 호환성용 빈 함수
module.exports.resetDailyTasksLogic = resetDailyTasksLogic;
module.exports.resetTasksForClass = resetTasksForClass;
