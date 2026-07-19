/* eslint-disable */
/* eslint-disable max-len */
// eslint-disable-next-line no-unused-vars
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  LOG_TYPES,
  logActivity,
  checkAuthAndGetUserData,
  checkIdempotent,
  markIdempotent,
  hasAdminPower,
  hasTeacherPower,
  findApprovedAdminSnap,
  sanitizeInput,
  db,
  admin,
  logger,
} = require("./utils");
const {
  updateCentralStockMarketLogic,
  createCentralMarketNewsLogic,
  autoManageStocksLogic,
  cleanupExpiredCentralNewsLogic,
  resetDailyTasksLogic,
  resetTasksForClass,
} = require("./scheduler-http");
const { initialStocks } = require("./initialStocks");
const {
  isAppointedJob,
  toJobIdArray,
  buildJobMap,
  resolveStudentJobs,
  hasJobTitle,
} = require("./jobUtils");

// HTTP 호출을 위한 스케줄러 로직 (cron-job.org에서 호출 가능)
const scheduler = require("./scheduler-http");
// 🔥 핵심 스케줄러만 유지 (16개 → 5개)
exports.stockPriceScheduler = scheduler.stockPriceScheduler; // 주식 가격 업데이트 스케줄러 (HTTP, GHA/수동 호출용 백업)
exports.stockPriceSchedulerV2 = scheduler.stockPriceSchedulerV2; // 주식 가격 업데이트 스케줄러 (Cloud Scheduler v2, 5분마다 자동)
exports.weeklyEconomySchedulerV2 = scheduler.weeklyEconomySchedulerV2; // 주급(월) + 월세·재산세(금) (Cloud Scheduler v2)
exports.hourlySchedulerV2 = scheduler.hourlySchedulerV2; // 자정리셋 + 경제이벤트 + 환율 통합 (Cloud Scheduler v2)
exports.midnightReset = scheduler.midnightReset; // 자정 리셋용 엔드포인트 (수동 호출 백업)
exports.weeklySalary = scheduler.weeklySalary; // 주급 지급용 엔드포인트 (수동 호출 백업)
exports.weeklyRent = scheduler.weeklyRent; // 월세 징수용 엔드포인트 (수동 호출 백업)
exports.exchangeRateScheduler = scheduler.exchangeRateScheduler; // 환율 업데이트 (수동 호출 백업)
exports.weeklyPropertyTax = scheduler.weeklyPropertyTax; // 부동산 보유세 (수동 호출 백업)
exports.reverseLastWeeklySalary = scheduler.reverseLastWeeklySalary; // 🚨 일회성 회수 endpoint (2026-04-13 중복지급 롤백)
exports.backfillSalaryLogs = scheduler.backfillSalaryLogs; // 🔁 과거 주급 기록 소급 백필 endpoint
exports.backfillDrawItems = scheduler.backfillDrawItems; // 🎰 깨진 랜덤뽑기 인벤토리 보정 endpoint
exports.cleanupStaleOmokGames = scheduler.cleanupStaleOmokGames; // 🧹 유령 오목 방 정리 (heartbeat 기반)

// 🔥 경제 이벤트 시스템
exports.economicEventScheduler = scheduler.economicEventScheduler; // 경제 이벤트 스케줄러 (매시간 실행)
exports.triggerEconomicEventManual = scheduler.triggerEconomicEventManual; // 수동 경제 이벤트 실행
exports.saveEconomicEventSettings = scheduler.saveEconomicEventSettings; // 경제 이벤트 설정 저장
exports.collectWeeklyTaxesManual = scheduler.collectWeeklyTaxesManual; // 주간 세금(순자산세+보유세) 수동 징수

// 🔥 방학 모드 관리 (슈퍼관리자 전용)
exports.toggleVacationMode = scheduler.toggleVacationMode; // 방학 모드 토글
exports.getVacationModeStatus = scheduler.getVacationModeStatus; // 방학 모드 상태 조회

// 🔥 주식 스냅샷 및 관리
exports.getStocksSnapshot = scheduler.getStocksSnapshotFunction; // 주식 스냅샷 조회
exports.updateStocksSnapshot = scheduler.updateStocksSnapshotFunction; // 주식 스냅샷 업데이트
exports.addStockDoc = scheduler.addStockDocFunction; // 단일 주식 추가

// 🔥 실제 주식 관리 (관리자용)
exports.createRealStocks = scheduler.createRealStocksFunction; // 실제 주식 생성
exports.updateRealStocks = scheduler.updateRealStocksFunction; // 실제 주식 가격 업데이트
exports.addSingleRealStock = scheduler.addSingleRealStockFunction; // 개별 실제 주식 추가
exports.deleteSimulationStocks = scheduler.deleteSimulationStocksFunction; // 시뮬레이션 주식 삭제
exports.manualUpdateStockMarket = scheduler.manualUpdateStockMarket; // 주식 시장 수동 업데이트

// 🔥 주식 유틸리티 (관리자용)
exports.deduplicateStocksFunction = scheduler.deduplicateStocksFunction; // 중복 주식 정리
exports.getAvailableSymbolsFunction = scheduler.getAvailableSymbolsFunction; // 사용 가능한 심볼 목록
exports.updateExchangeRateFunction = scheduler.updateExchangeRateFunction; // 환율 수동 업데이트

// 🔥 TTL 만료 문서 정리
exports.cleanupExpiredDocuments = scheduler.cleanupExpiredDocuments; // TTL 만료 문서 자동 삭제

// 💎 주식 배당 시스템 (매월 첫 금요일 09:00 KST)
exports.dividendSchedulerV2 = scheduler.dividendSchedulerV2; // 월간 배당 자동 지급 (Cloud Scheduler v2)
exports.payDividendsManual = scheduler.payDividendsManual;   // 수동 배당 지급 (테스트/긴급용)

// 🔄 마이그레이션 endpoint
exports.recoverTeachersManual = scheduler.recoverTeachersManual; // 잘못 학생화된 선생님 복구
exports.initializeClassroomManual = scheduler.initializeClassroomManual; // 학급 부가 데이터 백필
exports.backfillMusicRoomsManual = scheduler.backfillMusicRoomsManual; // musicRooms classCode 백필
exports.migrateStorePriceDownManual = scheduler.migrateStorePriceDownManual; // 물가 안정 25%로 일괄

// 🛒 함께구매 완료 처리 (서버사이드)
const groupPurchaseService = require("./groupPurchaseService");
exports.completeGroupPurchase = groupPurchaseService.completeGroupPurchase;
exports.joinGroupPurchase = groupPurchaseService.joinGroupPurchase;
exports.deleteGroupPurchase = groupPurchaseService.deleteGroupPurchase;

// 🎭 아바타 상점 구매 + 시드 (서버사이드)
const avatarShopService = require("./avatarShopService");
exports.purchaseAvatarItem = avatarShopService.purchaseAvatarItem;
exports.seedAvatarShop = avatarShopService.seedAvatarShop;
exports.seedAvatarShopHttp = avatarShopService.seedAvatarShopHttp;
exports.updateAvatarShopPrice = avatarShopService.updateAvatarShopPrice;

// 5분마다 주식 가격 업데이트
// exports.updateCentralStockMarket = onSchedule({
//   region: "asia-northeast3",
//   schedule: "every 5 minutes",
//   timeoutSeconds: 540,
// }, updateCentralStockMarketLogic);

// 🔥 뉴스 생성 및 정리는 cron-job.org의 simpleScheduler에서 처리 (비용 절감)
// 3분마다 뉴스 생성
// exports.createCentralMarketNews = onSchedule({
//   region: "asia-northeast3",
//   schedule: "every 3 minutes",
//   timeoutSeconds: 540,
// }, createCentralMarketNewsLogic);

// 10분마다 자동 상장/폐지
// exports.autoManageStocks = onSchedule({
//   region: "asia-northeast3",
//   schedule: "every 10 minutes",
//   timeoutSeconds: 540,
// }, autoManageStocksLogic);

// 3분마다 만료된 뉴스 정리
// exports.cleanupExpiredCentralNews = onSchedule({
//   region: "asia-northeast3",
//   schedule: "every 3 minutes",
//   timeoutSeconds: 540,
// }, cleanupExpiredCentralNewsLogic);

// 매일 자정 작업 리셋
// exports.resetDailyTasks = onSchedule({
//   region: "asia-northeast3",
//   schedule: "0 0 * * *",
//   timezone: "Asia/Seoul",
//   timeoutSeconds: 540,
// }, resetDailyTasksLogic);

// exports.seedStocks = onCall({region: "asia-northeast3"}, async (request) => {
//   await checkAuthAndGetUserData(request, true); // 관리자만 실행 가능
//
//   logger.info("🌱 [데이터 시딩] 초기 주식 데이터 추가 시작");
//
//   try {
//     const stocksCollection = db.collection("CentralStocks");
//     const snapshot = await stocksCollection.limit(1).get();
//
//     // 데이터가 이미 있는 경우 실행 중단
//     if (!snapshot.empty) {
//       const message = "초기 주식 데이터가 이미 존재합니다. 중복 추가를 방지하기 위해 작업을 중단합니다.";
//       logger.warn(`[데이터 시딩] ${message}`);
//       return { success: false, message };
//     }
//
//     const batch = db.batch();
//     let count = 0;
//
//     initialStocks.forEach(stock => {
//       const docRef = stocksCollection.doc(); // 자동 ID 생성
//       const stockData = {
//         ...stock,
//         holderCount: 0,
//         tradingVolume: 1000,
//         buyVolume: 0,
//         sellVolume: 0,
//         recentBuyVolume: 0,
//         recentSellVolume: 0,
//         createdAt: admin.firestore.FieldValue.serverTimestamp(),
//         lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
//       };
//       batch.set(docRef, stockData);
//       count++;
//     });
//
//     await batch.commit();
//     const message = `총 ${count}개의 초기 주식 데이터 추가 완료.`;
//     logger.info(`✅ [데이터 시딩] ${message}`);
//     return { success: true, message };
//
//   } catch (error) {
//     logger.error("❌ [데이터 시딩] 초기 주식 데이터 추가 중 오류:", error);
//     throw new HttpsError("internal", "초기 주식 데이터 추가에 실패했습니다.");
//   }
// });

exports.completeTask = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const {
      taskId,
      jobId = null,
      isJobTask = false,
      cardType = null,
      rewardAmount = null,
    } = request.data;
    if (!taskId) {
      throw new HttpsError("invalid-argument", "할일 ID가 필요합니다.");
    }
    const userRef = db.collection("users").doc(uid);

    // 🔥 보안 가드: 모든 할일은 관리자 승인 필수 - completeTask로 직접 완료 불가
    throw new HttpsError(
      "permission-denied",
      "모든 할일은 관리자 승인이 필요합니다. submitTaskApproval을 사용하세요.",
    );

    try {
      let taskReward = 0;
      let taskName = "";
      let cashReward = 0;
      let couponReward = 0;
      let updatedCash = 0;
      let updatedCoupons = 0;

      if (isJobTask && jobId) {
        const jobRef = db.collection("jobs").doc(jobId);
        await db.runTransaction(async (transaction) => {
          const jobDoc = await transaction.get(jobRef);
          if (!jobDoc.exists) throw new Error("직업을 찾을 수 없습니다.");

          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists)
            throw new Error("사용자 정보를 찾을 수 없습니다.");

          const jobData = jobDoc.data();
          const jobTasks = jobData.tasks || [];
          const taskIndex = jobTasks.findIndex((t) => t.id === taskId);
          if (taskIndex === -1)
            throw new Error("직업 할일을 찾을 수 없습니다.");

          const task = jobTasks[taskIndex];
          taskName = task.name;

          // 🔥 보안: rewardAmount 서버 검증 (카드 선택 랜덤 보상 범위 기준)
          if (rewardAmount !== null && rewardAmount !== undefined) {
            const maxReward = cardType === "cash" ? 50000 : 20; // 랜덤 보상 최대값
            if (
              typeof rewardAmount !== "number" ||
              rewardAmount < 0 ||
              rewardAmount > maxReward
            ) {
              throw new Error(
                `유효하지 않은 보상 금액입니다. (최대: ${maxReward})`,
              );
            }
          }

          // 사용자별 진행 상황 확인 (개인별 클릭 횟수)
          const userData = userDoc.data();
          const completedJobTasks = userData.completedJobTasks || {};
          const jobTaskKey = `${jobId}_${taskId}`;
          const currentClicks = completedJobTasks[jobTaskKey] || 0;

          if (currentClicks >= task.maxClicks) {
            throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
          }

          // 🔥 현재 현금과 쿠폰 값 가져오기
          const currentCash = userData.cash || 0;
          const currentCoupons = userData.coupons || 0;

          // 사용자 문서 업데이트 (개인별 클릭 횟수)
          const updateData = {
            [`completedJobTasks.${jobTaskKey}`]:
              admin.firestore.FieldValue.increment(1),
          };

          // 카드 선택 보상 적용
          if (cardType && rewardAmount) {
            if (cardType === "cash") {
              cashReward = rewardAmount;
              updateData.cash =
                admin.firestore.FieldValue.increment(cashReward);
              updatedCash = currentCash + cashReward; // 🔥 최종 값 계산
              updatedCoupons = currentCoupons; // 쿠폰은 변하지 않음
            } else if (cardType === "coupon") {
              couponReward = rewardAmount;
              updateData.coupons =
                admin.firestore.FieldValue.increment(couponReward);
              updatedCash = currentCash; // 현금은 변하지 않음
              updatedCoupons = currentCoupons + couponReward; // 🔥 최종 값 계산
            }
          } else {
            updatedCash = currentCash;
            updatedCoupons = currentCoupons;
          }

          transaction.update(userRef, updateData);
        });
      } else {
        // 🔥 공통 할일도 랜덤 보상 적용
        const commonTaskRef = db.collection("commonTasks").doc(taskId);
        await db.runTransaction(async (transaction) => {
          const commonTaskDoc = await transaction.get(commonTaskRef);
          if (!commonTaskDoc.exists)
            throw new Error("공통 할일을 찾을 수 없습니다.");
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists)
            throw new Error("사용자 정보를 찾을 수 없습니다.");
          const taskData = commonTaskDoc.data();
          taskName = taskData.name;
          const userData = userDoc.data();
          const completedTasks = userData.completedTasks || {};
          const currentClicks = completedTasks[taskId] || 0;
          if (currentClicks >= taskData.maxClicks) {
            throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
          }

          // 🔥 현재 현금과 쿠폰 값 가져오기
          const currentCash = userData.cash || 0;
          const currentCoupons = userData.coupons || 0;

          const updateData = {
            [`completedTasks.${taskId}`]:
              admin.firestore.FieldValue.increment(1),
          };

          // 🔥 카드 선택 보상 적용 (공통 할일도 동일) + 서버 검증
          if (rewardAmount !== null && rewardAmount !== undefined) {
            const maxRewardCommon = cardType === "cash" ? 50000 : 20;
            if (
              typeof rewardAmount !== "number" ||
              rewardAmount < 0 ||
              rewardAmount > maxRewardCommon
            ) {
              throw new Error(`유효하지 않은 보상 금액입니다.`);
            }
          }
          if (cardType && rewardAmount) {
            if (cardType === "cash") {
              cashReward = rewardAmount;
              updateData.cash =
                admin.firestore.FieldValue.increment(cashReward);
              updatedCash = currentCash + cashReward; // 🔥 최종 값 계산
              updatedCoupons = currentCoupons; // 쿠폰은 변하지 않음
            } else if (cardType === "coupon") {
              couponReward = rewardAmount;
              updateData.coupons =
                admin.firestore.FieldValue.increment(couponReward);
              updatedCash = currentCash; // 현금은 변하지 않음
              updatedCoupons = currentCoupons + couponReward; // 🔥 최종 값 계산
            }
          } else {
            updatedCash = currentCash;
            updatedCoupons = currentCoupons;
          }

          transaction.update(userRef, updateData);
        });
      }
      // 활동 로그 기록
      if (taskReward > 0) {
        try {
          await logActivity(
            null,
            uid,
            LOG_TYPES.COUPON_EARN,
            `'${taskName}' 할일 완료로 쿠폰 ${taskReward}개를 획득했습니다.`,
            {
              taskName,
              reward: taskReward,
              taskId,
              isJobTask,
              jobId: jobId || null,
            },
          );
        } catch (logError) {
          logger.warn(`[completeTask] 활동 로그 기록 실패:`, logError);
        }
      }
      if (cashReward > 0) {
        try {
          await logActivity(
            null,
            uid,
            LOG_TYPES.CASH_INCOME,
            `'${taskName}' 할일 완료로 ${cashReward.toLocaleString()}원을 획득했습니다.`,
            {
              taskName,
              reward: cashReward,
              taskId,
              isJobTask,
              jobId: jobId || null,
            },
          );
        } catch (logError) {
          logger.warn(`[completeTask] 활동 로그 기록 실패:`, logError);
        }
      }
      if (couponReward > 0) {
        try {
          await logActivity(
            null,
            uid,
            LOG_TYPES.COUPON_EARN,
            `'${taskName}' 할일 완료로 쿠폰 ${couponReward}개를 획득했습니다.`,
            {
              taskName,
              reward: couponReward,
              taskId,
              isJobTask,
              jobId: jobId || null,
            },
          );
        } catch (logError) {
          logger.warn(`[completeTask] 활동 로그 기록 실패:`, logError);
        }
      }

      let message = `'${taskName}' 완료!`;
      if (taskReward > 0) message += ` +${taskReward} 쿠폰!`;
      if (cashReward > 0) message += ` +${cashReward.toLocaleString()}원!`;
      if (couponReward > 0) message += ` +${couponReward} 쿠폰!`;

      return {
        success: true,
        message,
        taskName: taskName,
        reward: taskReward + couponReward,
        cashReward,
        couponReward,
        updatedCash: updatedCash, // 🔥 트랜잭션 내에서 계산된 최종 값
        updatedCoupons: updatedCoupons, // 🔥 트랜잭션 내에서 계산된 최종 값
      };
    } catch (error) {
      logger.error(
        `[completeTask] User: ${uid}, Task: ${taskId}, Error:`,
        error,
      );
      throw new HttpsError(
        "aborted",
        error.message || "할일 완료 처리 중 오류가 발생했습니다.",
      );
    }
  },
);

// 🎁 일일 출석 보상 지급 (서버 권위)
//   기존: 클라(DailyReward.js)가 streak/날짜/보상액을 판정하고 별도로 cash를 직접 increment.
//         ① streak 저장과 cash 지급이 분리된 2 write라 비원자적 ② canClaim이 전부 클라 판정이라
//         onClaim 콜백만 반복 호출하면 무한 보상 가능(rules가 본인 cash·meta write 허용).
//   변경: 서버가 KST 날짜로 '오늘 이미 받음'을 판정하고, streak 갱신 + cash 지급을 한 트랜잭션으로.
//         보상표·날짜는 서버 권위(클라가 금액을 넘기지 않음). idempotencyKey로 이중클릭 차단.
//   ⚠️ 병행 배포: 이 단계에서 rules는 바꾸지 않는다(구버전 클라 호환). 방어(rules 잠금)는 P2 배치6.
exports.claimDailyReward = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request);
    const { idempotencyKey = null } = request.data || {};

    // 보상표 — 클라 DailyReward.js의 STREAK_REWARDS와 동일 규칙 (서버가 권위)
    const STREAK_REWARDS = [
      10000, 15000, 20000, 30000, 40000, 50000, 60000, 70000, 85000, 100000,
    ];
    const REWARD_AFTER_10 = 100000; // 10일 이후 유지
    const rewardForDay = (day) =>
      day <= 10 ? STREAK_REWARDS[day - 1] : REWARD_AFTER_10;

    // KST(UTC+9) 날짜 문자열 — 서버는 UTC라 +9h 보정 후 YYYY-MM-DD (기존 economicEvents 패턴)
    //   깨진 ms(NaN)면 null 반환 — meta/dailyStreak.lastLogin은 본인 write 허용이라
    //   학생이 이상한 값으로 덮으면 new Date(garbage).getTime()=NaN→toISOString() RangeError로
    //   CF 전체가 실패(본인 보상 DoS)한다. null이면 streak 리셋으로 안전 처리.
    const kstDateStr = (ms) =>
      Number.isFinite(ms)
        ? new Date(ms + 9 * 60 * 60 * 1000).toISOString().split("T")[0]
        : null;

    const userRef = db.collection("users").doc(uid);
    const streakRef = userRef.collection("meta").doc("dailyStreak");

    let result;
    await db.runTransaction(async (transaction) => {
      // 🚨 idempotency check (read, 첫 줄)
      const keyRef = await checkIdempotent(transaction, idempotencyKey);

      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
      }
      const streakDoc = await transaction.get(streakRef);
      const streakData = streakDoc.exists ? streakDoc.data() : {};

      // 🔒 시간 계산은 트랜잭션 콜백 '안'에서 — 콜백은 충돌 시 재시도되는데 now를 밖에서
      //    한 번 고정하면 자정 경계에서 재시도 시 stale한 today로 판정해 이중지급/streak 역행이
      //    발생한다(23:59 요청이 재시도돼도 today=어제로 남아 '오늘 받음' 거부를 통과). 콜백 내부
      //    재계산으로 재시도 때 최신 시각을 반영한다.
      const now = Date.now();
      const today = kstDateStr(now);
      const yesterday = kstDateStr(now - 86400000);

      // 마지막 수령일을 KST 기준으로 판정 (lastLogin은 ISO 문자열 저장)
      const lastLoginKst = streakData.lastLogin
        ? kstDateStr(new Date(streakData.lastLogin).getTime())
        : null;

      // 오늘 이미 받았으면 거부 (서버 판정 — 클라 우회 차단)
      if (lastLoginKst === today) {
        throw new HttpsError(
          "already-exists",
          "오늘 이미 출석 보상을 받았습니다.",
        );
      }

      // streak/totalClaimed는 오염된 문서 방어를 위해 유한 숫자로 정규화
      const prevStreak = Number.isFinite(Number(streakData.streak))
        ? Number(streakData.streak)
        : 0;
      const prevTotal = Number.isFinite(Number(streakData.totalClaimed))
        ? Number(streakData.totalClaimed)
        : 0;

      const continued = lastLoginKst === yesterday;
      const newStreak = continued ? prevStreak + 1 : 1;
      const reward = rewardForDay(newStreak);
      const newTotal = prevTotal + reward;
      const streakBroken = lastLoginKst !== null && !continued;

      // cash 지급 + streak 갱신 (한 트랜잭션 — 원자적). merge로 미래 필드 유실 방지.
      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(reward),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(
        streakRef,
        {
          streak: newStreak,
          lastLogin: new Date(now).toISOString(),
          totalClaimed: newTotal,
        },
        { merge: true },
      );

      // audit 로그 — 트랜잭션 내 logActivity는 내부에 await get()이 있어 반드시 await해야
      // transaction.set(logRef)가 이 트랜잭션 커밋에 포함된다(await 누락 시 로그 유실 레이스).
      await logActivity(
        transaction,
        uid,
        LOG_TYPES.CASH_INCOME,
        `${newStreak}일차 출석 보상`,
        { amount: reward, streak: newStreak, source: "dailyReward" },
      );

      // ✅ idempotency mark (모든 write 후)
      markIdempotent(transaction, keyRef);

      const icon = newStreak >= 10 ? "🏆" : newStreak >= 7 ? "🎉" : "🎁";
      result = {
        success: true,
        reward,
        newStreak,
        totalClaimed: newTotal,
        icon,
        streakBroken,
        isMilestone: newStreak === 10 || newStreak % 30 === 0,
        message: `${newStreak}일차 출석 보상: ${reward.toLocaleString()}원!`,
      };
    });

    return result;
  },
);

// 🎮 게임 보상 지급 (서버 권위 — 학습게임 타자/체스/오목/필사)
//   기존: 각 게임이 클라에서 cash/coupons를 직접 increment하고, 일일 횟수도 클라가 관리
//         (체스·오목은 localStorage, 타자·필사는 users 문서 클라 write) → 학생이 금액·횟수를
//         조작해 무제한 보상 가능.
//   변경: 서버가 gameType별 '일일 횟수 상한'과 '금액 상한'을 강제한다. 일일 카운터는 서버
//         users.gameRewardDaily[gameType]에 두어(KST 날짜 기준) 클라가 못 지운다.
//   ⚠️ 한계: 서버는 학생이 실제로 게임을 이겼는지 검증할 수 없다(클라 주장). 그래서 무한증식만
//         차단(일일 상한 + 금액 상한). 금액은 클라 제안값을 상한 내에서 수용하되 audit 로그로 기록.
//   ⚠️ 병행 배포: rules 미변경(P2 배치6에서 gameRewardDaily·cash 직접 write 잠금).
// 게임별 보상 상한 (모듈 상수 — 매 호출 재생성 방지).
//   ⚠️ 클라 보상표의 최대치와 반드시 동기화: typing=typingWords.js(10만/20),
//      chess=ChessGame.generateRewardCards(5만/20), omok=OmokGame.generateRewardCards(최대 8999/3).
//      어느 한쪽만 바뀌면 정상 보상이 거부되거나(상한↓) 새 취약점이 생기므로(상한↑) 함께 수정할 것.
//   transcription: TranscriptionMode.claimReward가 이 CF로 배선됨(batch7-b, 도장은 클라·쿠폰은 CF).
//   comment: LearningBoard 댓글 쿠폰이 이 CF로 배선됨(batch7-b, 하루 3개).
const GAME_REWARD_CONFIG = {
  // typing 쿠폰 실제 최대 = round(20 * COUPON_REDUCTION(1/3)) = 7 (typingWords.js:639).
  //   보상표 원값 20이 아니라 감산 후 값이라 상한을 7로 둬야 조작 요청(8~20)을 막는다.
  typing: { maxCash: 100000, maxCoupon: 7, dailyLimit: 5 },
  chess: { maxCash: 50000, maxCoupon: 20, dailyLimit: 3 },
  omok: { maxCash: 9000, maxCoupon: 3, dailyLimit: 5 },
  transcription: { maxCash: 0, maxCoupon: 1, dailyLimit: 10 },
  // 🔒 batch7-b: 학습게시판 댓글 쿠폰(구 LearningBoard 클라 addCouponsToUser 자가지급, 하루 3개).
  //    coupons rules 잠금으로 클라 직접 자가적립을 막고 서버 캡(dailyLimit 3)으로 이관.
  comment: { maxCash: 0, maxCoupon: 1, dailyLimit: 3 },
};

exports.grantGameReward = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request);
    const {
      gameType,
      rewardType,
      amount,
      idempotencyKey = null,
    } = request.data || {};

    const cfg = GAME_REWARD_CONFIG[gameType];
    if (!cfg) {
      throw new HttpsError("invalid-argument", "알 수 없는 게임입니다.");
    }
    if (rewardType !== "cash" && rewardType !== "coupon") {
      throw new HttpsError("invalid-argument", "보상 종류가 올바르지 않습니다.");
    }
    const max = rewardType === "cash" ? cfg.maxCash : cfg.maxCoupon;
    // 금액 검증: 양의 정수, 상한 이하 (max=0이면 그 보상종류 자체가 불가)
    if (!Number.isInteger(amount) || amount <= 0 || amount > max) {
      throw new HttpsError(
        "invalid-argument",
        `유효하지 않은 보상 금액입니다. (${gameType} ${rewardType} 최대 ${max})`,
      );
    }

    const userRef = db.collection("users").doc(uid);
    let result;
    await db.runTransaction(async (transaction) => {
      // 🔒 batch7-b(codex MEDIUM): 멱등키를 호출자 uid로 네임스페이스 — 클라가 보낸 키를 그대로 쓰면
      //   공격자가 피해자의 결정론 키(예: chesspvp_gameId_victimUid)를 선점해 정당한 보상을 24h 차단(griefing)할 수 있다.
      //   uid를 접두하면 키가 호출자별로 격리되어 타인 보상 선점이 불가능해진다.
      const keyRef = await checkIdempotent(
        transaction,
        idempotencyKey ? `${uid}_${idempotencyKey}` : null,
      );

      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
      }
      const data = userDoc.data();

      // KST 오늘 (트랜잭션 콜백 안에서 계산 — 재시도 시 최신 반영)
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      // 서버 일일 카운터 — 오늘 아니면 0부터
      const daily = data.gameRewardDaily || {};
      const g = daily[gameType] || {};
      const count = g.date === today ? Number(g.count) || 0 : 0;
      if (count >= cfg.dailyLimit) {
        throw new HttpsError(
          "resource-exhausted",
          "오늘 이 게임의 보상 한도를 모두 받았습니다.",
        );
      }

      const field = rewardType === "cash" ? "cash" : "coupons";
      transaction.update(userRef, {
        [field]: admin.firestore.FieldValue.increment(amount),
        [`gameRewardDaily.${gameType}`]: { date: today, count: count + 1 },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await logActivity(
        transaction,
        uid,
        rewardType === "cash" ? LOG_TYPES.CASH_INCOME : LOG_TYPES.COUPON_EARN,
        `${gameType} 게임 보상`,
        { amount, gameType, rewardType, source: "gameReward" },
      );

      markIdempotent(transaction, keyRef);
      result = {
        success: true,
        amount,
        rewardType,
        remaining: cfg.dailyLimit - count - 1,
      };
    });

    return result;
  },
);

// 🔥 할일 승인 요청 (학생이 보너스 할일 완료 시 호출)
// 🎲 할일 보상 서버 추첨 — 클라이언트 generateJobTaskReward(src/utils/jobTaskRewards.js)의
//   가중테이블을 서버로 이관. 보상 금액을 서버가 결정해 클라 조작(네트워크 rewardAmount 위조로
//   cap까지 매번 청구)을 근본 차단. 확률·금액은 클라 테이블과 정확히 일치(초대박 cash 500000 유지).
const TASK_REWARD_TABLES = {
  cash: [
    { amount: 500000, weight: 0.5 },
    { amount: 300000, weight: 1 },
    { amount: 100000, weight: 2 },
    { amount: 50000, weight: 4 },
    { amount: 30000, weight: 6 },
    { amount: 20000, weight: 8 },
    { amount: 10000, weight: 13 },
    { amount: 5000, weight: 18 },
    { amount: 3000, weight: 20 },
    { amount: 1000, weight: 27.5 },
  ],
  coupon: [
    { amount: 20, weight: 10 },
    { amount: 10, weight: 20 },
    { amount: 5, weight: 20 },
    { amount: 3, weight: 20 },
    { amount: 1, weight: 30 },
  ],
};

function generateTaskReward(cardType) {
  const items = TASK_REWARD_TABLES[cardType];
  if (!items) {
    throw new HttpsError("invalid-argument", "유효하지 않은 카드 타입입니다.");
  }
  const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * totalWeight;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.amount;
  }
  return items[items.length - 1].amount;
}

exports.submitTaskApproval = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const {
      taskId,
      jobId = null,
      isJobTask = false,
      cardType = null,
    } = request.data;

    if (!taskId) {
      throw new HttpsError("invalid-argument", "할일 ID가 필요합니다.");
    }
    if (cardType !== "cash" && cardType !== "coupon") {
      throw new HttpsError(
        "invalid-argument",
        "유효하지 않은 카드 타입입니다.",
      );
    }

    // 🔒 보상 금액은 서버가 가중랜덤으로 결정 — 클라이언트 rewardAmount 무시(조작 차단).
    //   과거: 클라가 generateJobTaskReward로 굴린 값을 그대로 신뢰 → 네트워크 조작 시
    //   cardType당 cap(과거 50000)까지 매번 청구 가능. 서버 추첨으로 근본 봉인.
    const rewardAmount = generateTaskReward(cardType);

    const userRef = db.collection("users").doc(uid);

    try {
      let taskName = "";

      if (isJobTask && jobId) {
        // 직업 할일 검증
        const jobRef = db.collection("jobs").doc(jobId);
        await db.runTransaction(async (transaction) => {
          const jobDoc = await transaction.get(jobRef);
          if (!jobDoc.exists) throw new Error("직업을 찾을 수 없습니다.");

          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists)
            throw new Error("사용자 정보를 찾을 수 없습니다.");

          const jobData = jobDoc.data();
          const jobTasks = jobData.tasks || [];
          const taskIndex = jobTasks.findIndex((t) => t.id === taskId);
          if (taskIndex === -1)
            throw new Error("직업 할일을 찾을 수 없습니다.");

          const task = jobTasks[taskIndex];
          taskName = task.name;

          // (보상 금액은 상단에서 서버 추첨 = generateTaskReward, 클라 입력 미신뢰)

          // 클릭 횟수 확인
          const uData = userDoc.data();
          const completedJobTasks = uData.completedJobTasks || {};
          const jobTaskKey = `${jobId}_${taskId}`;
          const currentClicks = completedJobTasks[jobTaskKey] || 0;

          if (currentClicks >= task.maxClicks) {
            throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
          }

          // 클릭 카운터만 증가 (보상은 지급하지 않음)
          transaction.update(userRef, {
            [`completedJobTasks.${jobTaskKey}`]:
              admin.firestore.FieldValue.increment(1),
          });
        });
      } else {
        // 공통 할일 검증
        const commonTaskRef = db.collection("commonTasks").doc(taskId);
        await db.runTransaction(async (transaction) => {
          const commonTaskDoc = await transaction.get(commonTaskRef);
          if (!commonTaskDoc.exists)
            throw new Error("공통 할일을 찾을 수 없습니다.");

          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists)
            throw new Error("사용자 정보를 찾을 수 없습니다.");

          const taskData = commonTaskDoc.data();
          taskName = taskData.name;

          // (보상 금액은 상단에서 서버 추첨 = generateTaskReward, 클라 입력 미신뢰)

          // 클릭 횟수 확인
          const uData = userDoc.data();
          const completedTasks = uData.completedTasks || {};
          const currentClicks = completedTasks[taskId] || 0;

          if (currentClicks >= taskData.maxClicks) {
            throw new Error(`${taskName} 할일은 오늘 이미 최대 완료했습니다.`);
          }

          // 클릭 카운터만 증가 (보상은 지급하지 않음)
          transaction.update(userRef, {
            [`completedTasks.${taskId}`]:
              admin.firestore.FieldValue.increment(1),
          });
        });
      }

      // 관리자는 자동 승인 (본인이 승인 권한을 가지므로) — 승인된 관리자만(미승인 교사 차단)
      const isAdminUser = hasAdminPower(userData);

      if (isAdminUser) {
        // 관리자: 즉시 보상 지급 + approved 상태로 저장
        const userRef2 = db.collection("users").doc(uid);
        const updateData = {};
        if (cardType === "cash") {
          updateData.cash = admin.firestore.FieldValue.increment(rewardAmount);
        } else if (cardType === "coupon") {
          updateData.coupons = admin.firestore.FieldValue.increment(rewardAmount);
        }
        await userRef2.update(updateData);

        // TTL: 30일 후 만료
        const approvalExpireAt1 = new Date();
        approvalExpireAt1.setDate(approvalExpireAt1.getDate() + 30);

        const approvalRef = db.collection("pendingApprovals").doc();
        await approvalRef.set({
          classCode,
          studentId: uid,
          studentName: userData.name || "알 수 없음",
          taskId,
          taskName,
          isJobTask: !!isJobTask,
          jobId: jobId || null,
          cardType,
          rewardAmount,
          status: "approved",
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: uid,
          autoApproved: true,
          expireAt: admin.firestore.Timestamp.fromDate(approvalExpireAt1),
        });

        try {
          await logActivity(
            null,
            uid,
            LOG_TYPES.TASK_APPROVAL_REQUEST,
            `'${taskName}' 관리자 자동 승인 (${cardType === "cash" ? `${rewardAmount.toLocaleString()}원` : `${rewardAmount}쿠폰`})`,
            { taskName, taskId, isJobTask, jobId, cardType, rewardAmount, autoApproved: true },
          );
        } catch (logError) {
          logger.warn("[submitTaskApproval] 로그 기록 실패:", logError);
        }

        return {
          success: true,
          message: `'${taskName}' 완료! ${cardType === "cash" ? `${rewardAmount.toLocaleString()}원` : `${rewardAmount}쿠폰`} 지급됨.`,
          taskName,
          rewardAmount,
          cardType,
          autoApproved: true,
        };
      }

      // 학생: pendingApprovals 문서 생성 (승인 대기)
      // TTL: 30일 후 만료
      const approvalExpireAt2 = new Date();
      approvalExpireAt2.setDate(approvalExpireAt2.getDate() + 30);

      const approvalRef = db.collection("pendingApprovals").doc();
      await approvalRef.set({
        classCode,
        studentId: uid,
        studentName: userData.name || "알 수 없음",
        taskId,
        taskName,
        isJobTask: !!isJobTask,
        jobId: jobId || null,
        cardType,
        rewardAmount,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: null,
        processedBy: null,
        expireAt: admin.firestore.Timestamp.fromDate(approvalExpireAt2),
      });

      // 활동 로그
      try {
        await logActivity(
          null,
          uid,
          LOG_TYPES.TASK_APPROVAL_REQUEST,
          `'${taskName}' 할일 승인 요청 (${cardType === "cash" ? `${rewardAmount.toLocaleString()}원` : `${rewardAmount}쿠폰`})`,
          { taskName, taskId, isJobTask, jobId, cardType, rewardAmount },
        );
      } catch (logError) {
        logger.warn("[submitTaskApproval] 로그 기록 실패:", logError);
      }

      return {
        success: true,
        message: `'${taskName}' 승인 요청이 완료되었습니다. 관리자 승인 후 보상이 지급됩니다.`,
        taskName,
        rewardAmount,
        cardType,
      };
    } catch (error) {
      logger.error(
        `[submitTaskApproval] User: ${uid}, Task: ${taskId}, Error:`,
        error,
      );
      throw new HttpsError(
        "aborted",
        error.message || "승인 요청 처리 중 오류가 발생했습니다.",
      );
    }
  },
);

// 🔥 할일 승인/거절 처리 (관리자 전용)
exports.processTaskApproval = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    // 관리자 OR 대통령 OR 위임된 학생 모두 처리 가능
    const {
      uid,
      classCode: adminClassCode,
      isAdmin: isSysAdmin,
      userData,
    } = await checkAuthAndGetUserData(request, false);

    // 권한 체크: 관리자 / 대통령 직업 / delegatedPermissions.taskApproval
    const hasTaskApprovalPermission =
      isSysAdmin ||
      userData?.isSuperAdmin ||
      userData?.delegatedPermissions?.taskApproval === true;

    // 대통령 직업 체크 — 지정 전용 직업은 appointedJobIds(교사 write 전용)에서만 인정.
    // 학생이 selectedJobIds에 대통령 id를 직접 써넣어도 권한이 생기지 않는다(jobUtils 규약).
    let isPresident = false;
    const hasAnyJob =
      toJobIdArray(userData?.selectedJobIds).length > 0 ||
      toJobIdArray(userData?.appointedJobIds).length > 0;
    if (!hasTaskApprovalPermission && hasAnyJob) {
      const jobsSnapshot = await db
        .collection("jobs")
        .where("classCode", "==", adminClassCode)
        .get();
      isPresident = hasJobTitle(userData, buildJobMap(jobsSnapshot), "대통령");
    }

    if (!hasTaskApprovalPermission && !isPresident) {
      throw new HttpsError("permission-denied", "할일 승인 권한이 없습니다.");
    }

    const { approvalId, action } = request.data;

    if (!approvalId) {
      throw new HttpsError("invalid-argument", "승인 요청 ID가 필요합니다.");
    }
    if (!action || !["approve", "reject"].includes(action)) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 액션이 필요합니다. (approve 또는 reject)",
      );
    }

    try {
      const approvalRef = db.collection("pendingApprovals").doc(approvalId);
      let resultMessage = "";

      await db.runTransaction(async (transaction) => {
        const approvalDoc = await transaction.get(approvalRef);
        if (!approvalDoc.exists)
          throw new Error("승인 요청을 찾을 수 없습니다.");

        const approval = approvalDoc.data();

        if (approval.status !== "pending") {
          throw new Error(`이미 처리된 요청입니다. (상태: ${approval.status})`);
        }

        // 같은 학급인지 확인
        if (approval.classCode !== adminClassCode) {
          throw new Error("다른 학급의 승인 요청은 처리할 수 없습니다.");
        }

        if (action === "approve") {
          // 학생에게 보상 지급
          const studentRef = db.collection("users").doc(approval.studentId);
          const studentDoc = await transaction.get(studentRef);
          if (!studentDoc.exists)
            throw new Error("학생 정보를 찾을 수 없습니다.");

          // 🔒 승인 문서의 rewardAmount 상한 재검증 — 과거 클라 위조(pendingApprovals 직접
          //   create로 rewardAmount 무제한 주입)된 문서를 승인 시점에 차단. 서버 추첨
          //   테이블 최대(cash 500000=초대박·coupon 20)와 일치. rules로 신규 create는
          //   봉인했으나 기존 문서 방어(문서는 이제 submitTaskApproval 서버추첨분만 존재).
          const maxReward = approval.cardType === "cash" ? 500000 : 20;
          if (
            typeof approval.rewardAmount !== "number" ||
            !Number.isFinite(approval.rewardAmount) ||
            approval.rewardAmount < 0 ||
            approval.rewardAmount > maxReward
          ) {
            throw new Error("유효하지 않은 보상 금액입니다.");
          }

          const updateData = {};
          if (approval.cardType === "cash") {
            updateData.cash = admin.firestore.FieldValue.increment(
              approval.rewardAmount,
            );
          } else if (approval.cardType === "coupon") {
            updateData.coupons = admin.firestore.FieldValue.increment(
              approval.rewardAmount,
            );
          }
          transaction.update(studentRef, updateData);

          resultMessage = `${approval.studentName}의 '${approval.taskName}' 승인 완료! ${approval.cardType === "cash" ? `${approval.rewardAmount.toLocaleString()}원` : `${approval.rewardAmount}쿠폰`} 지급됨.`;
        } else {
          resultMessage = `${approval.studentName}의 '${approval.taskName}' 요청이 거절되었습니다.`;
        }

        // 승인 상태 업데이트
        transaction.update(approvalRef, {
          status: action === "approve" ? "approved" : "rejected",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: uid,
        });
      });

      // 활동 로그
      const logType =
        action === "approve"
          ? LOG_TYPES.TASK_APPROVAL_APPROVED
          : LOG_TYPES.TASK_APPROVAL_REJECTED;
      try {
        await logActivity(null, uid, logType, resultMessage, {
          approvalId,
          action,
        });
      } catch (logError) {
        logger.warn("[processTaskApproval] 로그 기록 실패:", logError);
      }

      return { success: true, message: resultMessage };
    } catch (error) {
      logger.error(
        `[processTaskApproval] Admin: ${uid}, Approval: ${approvalId}, Error:`,
        error,
      );
      throw new HttpsError(
        "aborted",
        error.message || "승인 처리 중 오류가 발생했습니다.",
      );
    }
  },
);

exports.manualResetClassTasks = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request, true);
    const { classCode } = request.data;
    if (!classCode)
      throw new HttpsError(
        "invalid-argument",
        "유효한 classCode가 필요합니다.",
      );
    logger.info(
      `[수동 리셋] 관리자(UID: ${uid})가 클래스 '${classCode}'의 할일을 수동 리셋합니다.`,
    );
    try {
      const result = await resetTasksForClass(classCode);
      const message = `클래스 '${classCode}'의 ${result.userCount}명 학생 및 ${result.jobCount}개 직업의 할일이 리셋되었습니다.`;
      logger.info(`[수동 리셋] ${message}`);
      return { success: true, message, updatedCount: result.userCount };
    } catch (error) {
      logger.error(`[수동 리셋] 클래스 '${classCode}' 리셋 중 오류:`, error);
      throw new HttpsError("internal", `할일 리셋 실패: ${error.message}`);
    }
  },
);

exports.adminResetUserPassword = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, isAdmin, isSuperAdmin, classCode } =
      await checkAuthAndGetUserData(request, false);

    // 관리자 권한 확인 (학급 관리자 또는 최고 관리자)
    if (!isAdmin && !isSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "관리자만 비밀번호를 초기화할 수 있습니다.",
      );
    }

    const { userId, newPassword } = request.data;

    if (!userId || !newPassword) {
      throw new HttpsError(
        "invalid-argument",
        "사용자 ID와 새 비밀번호가 필요합니다.",
      );
    }

    if (newPassword.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "비밀번호는 6자 이상이어야 합니다.",
      );
    }

    try {
      // 학급 관리자인 경우, 같은 학급 학생인지 확인
      if (isAdmin && !isSuperAdmin) {
        const targetUserRef = db.collection("users").doc(userId);
        const targetUserDoc = await targetUserRef.get();

        if (!targetUserDoc.exists) {
          throw new Error("대상 사용자를 찾을 수 없습니다.");
        }

        const targetUserData = targetUserDoc.data();

        // 같은 학급인지 확인
        if (targetUserData.classCode !== classCode) {
          throw new HttpsError(
            "permission-denied",
            "자신의 학급 학생만 비밀번호를 초기화할 수 있습니다.",
          );
        }
      }

      // Firebase Admin SDK를 사용하여 비밀번호 업데이트
      await admin.auth().updateUser(userId, {
        password: newPassword,
      });

      logger.info(
        `[adminResetUserPassword] 관리자 ${uid}가 사용자 ${userId}의 비밀번호를 초기화했습니다.`,
      );

      return {
        success: true,
        message: "비밀번호가 성공적으로 초기화되었습니다.",
      };
    } catch (error) {
      logger.error(
        `[adminResetUserPassword] Error for admin ${uid}, target user ${userId}:`,
        error,
      );

      // HttpsError는 그대로 throw
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        error.message || "비밀번호 초기화에 실패했습니다.",
      );
    }
  },
);

exports.donateCoupon = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, userData, classCode } = await checkAuthAndGetUserData(request);
    const { amount, message, idempotencyKey = null } = request.data || {};
    if (!classCode) {
      throw new HttpsError(
        "failed-precondition",
        "사용자에게 학급 코드가 할당되지 않았습니다. 프로필을 확인하거나 관리자에게 문의해주세요.",
      );
    }
    // 🔒 [보안] 정수 검증(소수점 쿠폰 방지) + 상한(무한 기부로 관리자 cash 폭증 방지)
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1000000) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 쿠폰 수량을 입력해야 합니다.",
      );
    }
    const userRef = db.collection("users").doc(uid);
    const goalRef = db.collection("goals").doc(`${classCode}_goal`);
    const mainSettingsRef = db.collection("settings").doc("mainSettings");

    // 관리자(선생님) 계정 조회
    let adminRef = null;
    const adminSnap = await findApprovedAdminSnap(classCode);
    if (!adminSnap.empty) {
      adminRef = adminSnap.docs[0].ref;
    }

    try {
      await db.runTransaction(async (transaction) => {
        // 🔒 batch7-b(codex MEDIUM #6): 멱등키(uid 네임스페이스) — 중복클릭/재시도 이중 기부(쿠폰 차감·목표진행·교사cash 이중 반영) 차단.
        const keyRef = await checkIdempotent(
          transaction,
          idempotencyKey ? `${uid}_${idempotencyKey}` : null,
        );
        const refs = [userRef, goalRef, mainSettingsRef];
        if (adminRef) refs.push(adminRef);
        const docs = await transaction.getAll(...refs);
        const [userDoc, goalDoc, settingsDoc] = docs;

        if (!userDoc.exists) {
          throw new Error("사용자 정보가 없습니다.");
        }
        // 🔒 batch7-b(codex HIGH #2): coupons 잔액 엄격 검증 — 과거 위조로 Infinity/문자열/음수가 저장돼 있으면
        //   `< amount` 검사를 통과해 관리자 cash를 무한 지급할 수 있다. sellCoupon과 대칭으로 유한 안전정수만 허용.
        const rawCoupons = userDoc.data().coupons ?? 0;
        if (
          typeof rawCoupons !== "number" ||
          !Number.isFinite(rawCoupons) ||
          rawCoupons < 0
        ) {
          throw new Error("쿠폰 잔액이 올바르지 않습니다. 관리자에게 문의하세요.");
        }
        const currentCoupons = rawCoupons;
        if (currentCoupons < amount) {
          throw new Error("보유한 쿠폰이 부족합니다.");
        }

        // 쿠폰 가치 계산
        const couponValue = settingsDoc.exists ? settingsDoc.data().couponValue : 1000;
        const cashToAdmin = amount * couponValue;

        transaction.set(
          userRef,
          {
            coupons: admin.firestore.FieldValue.increment(-amount),
            myContribution: admin.firestore.FieldValue.increment(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        // 응모한 쿠폰 가치만큼 관리자 계정에 현금 지급 (당첨금 재원)
        if (adminRef) {
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(cashToAdmin),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          logger.info(`[donateCoupon] 관리자에게 ${cashToAdmin}원 지급 (쿠폰 ${amount}개 × ${couponValue}원)`);
        }
        const newDonation = {
          id: db.collection("goals").doc().id,
          userId: uid,
          userName: userData.name || "알 수 없는 사용자",
          amount: amount,
          message: message || "",
          timestamp: admin.firestore.Timestamp.now(),
          classCode: classCode,
        };
        if (goalDoc.exists) {
          transaction.update(goalRef, {
            progress: admin.firestore.FieldValue.increment(amount),
            donations: admin.firestore.FieldValue.arrayUnion(newDonation),
            donationCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(goalRef, {
            progress: amount,
            donations: [newDonation],
            donationCount: 1,
            targetAmount: 1000,
            classCode: classCode,
            title: `${classCode} 학급 목표`,
            description: `${classCode} 학급의 쿠폰 목표입니다.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: uid,
          });
        }
        logActivity(
          transaction,
          uid,
          LOG_TYPES.COUPON_USE,
          `학급 목표에 쿠폰 ${amount}개를 기부했습니다.`,
          { amount, message, type: "donation" },
        );
        logActivity(
          transaction,
          uid,
          LOG_TYPES.COUPON_DONATE,
          `쿠폰 ${amount}개를 기부했습니다. 메시지: ${message || "없음"}`,
          { amount, message },
        );
        markIdempotent(transaction, keyRef);
      });
      return { success: true, message: "쿠폰 기부가 완료되었습니다." };
    } catch (error) {
      logger.error(`[donateCoupon] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "쿠폰 기부에 실패했습니다.",
      );
    }
  },
);

// 🎯 학급 쿠폰 목표 초기화 (교사/관리자) — 서버에서 권한 검증 후 admin SDK로 일괄 리셋.
//    기존엔 클라이언트 writeBatch였는데 firestore.rules의 isAdmin()을 요구해
//    isTeacher-only/legacy 교사 계정(isAdmin 미설정)에서 권한 오류로 초기화가 막혔다.
//    기부/판매/선물과 동일하게 CF로 통일하여 권한 일관성 확보.
exports.resetCouponGoal = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, isAdmin, isSuperAdmin, userData } =
    await checkAuthAndGetUserData(request);
  const isTeacher = hasTeacherPower(userData);
  if (!isAdmin && !isSuperAdmin && !isTeacher) {
    throw new HttpsError(
      "permission-denied",
      "교사/관리자만 쿠폰 목표를 초기화할 수 있습니다.",
    );
  }
  if (!classCode) {
    throw new HttpsError(
      "failed-precondition",
      "학급 코드가 없어 초기화할 수 없습니다.",
    );
  }

  const goalRef = db.collection("goals").doc(`${classCode}_goal`);

  try {
    // 1) 같은 학급 학생들의 myContribution 0으로 리셋 (500 write 한도 대비 청크 분할)
    const usersSnap = await db
      .collection("users")
      .where("classCode", "==", classCode)
      .get();
    const userDocs = usersSnap.docs;
    let resetUserCount = 0;
    const CHUNK = 450;
    for (let i = 0; i < userDocs.length; i += CHUNK) {
      const batch = db.batch();
      userDocs.slice(i, i + CHUNK).forEach((d) => {
        if ((d.data().myContribution || 0) !== 0) {
          batch.update(d.ref, {
            myContribution: 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          resetUserCount++;
        }
      });
      await batch.commit();
    }

    // 2) goal 문서 리셋 (없으면 생성). targetAmount/title 등은 merge로 보존.
    await goalRef.set(
      {
        progress: 0,
        currentAmount: 0,
        donations: [],
        donationCount: 0,
        classCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        resetAt: admin.firestore.FieldValue.serverTimestamp(),
        resetBy: uid,
      },
      { merge: true },
    );

    logger.info(
      `[resetCouponGoal] ${classCode} 초기화 by ${uid} (학생 ${resetUserCount}명 myContribution=0)`,
    );
    return { success: true, resetUserCount };
  } catch (error) {
    logger.error(`[resetCouponGoal] Error for class ${classCode}:`, error);
    throw new HttpsError(
      "aborted",
      error.message || "쿠폰 목표 초기화에 실패했습니다.",
    );
  }
});

exports.sellCoupon = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid } = await checkAuthAndGetUserData(request);
  const { amount } = request.data;
  // 🔒 [보안] 정수 검증(소수점 쿠폰 생성/현금화 방지)
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "유효한 쿠폰 수량(양의 정수)을 입력해야 합니다.",
    );
  }
  const userRef = db.collection("users").doc(uid);
  const mainSettingsRef = db.collection("settings").doc("mainSettings");
  try {
    await db.runTransaction(async (transaction) => {
      const [userDoc, settingsDoc] = await transaction.getAll(
        userRef,
        mainSettingsRef,
      );
      if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
      // 🔒 batch7-b(codex HIGH #2): coupons 잔액 엄격 검증 — 과거 위조로 Infinity/문자열/음수가 남아 있으면
      //   `< amount`를 통과해 무한 현금화된다(rules 잠금은 향후 write만 막고 기존값은 정리 안 함). 유한 안전정수만 허용.
      const rawCoupons = userDoc.data().coupons ?? 0;
      if (
        typeof rawCoupons !== "number" ||
        !Number.isFinite(rawCoupons) ||
        rawCoupons < 0
      ) {
        throw new Error("쿠폰 잔액이 올바르지 않습니다. 관리자에게 문의하세요.");
      }
      const currentCoupons = rawCoupons;
      if (currentCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");
      const couponValue = settingsDoc.exists
        ? settingsDoc.data().couponValue
        : 1000;
      const cashGained = amount * couponValue;
      transaction.update(userRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
        cash: admin.firestore.FieldValue.increment(cashGained),
      });
      logActivity(
        transaction,
        uid,
        LOG_TYPES.COUPON_SELL,
        `쿠폰 ${amount}개를 ${cashGained.toLocaleString()}원에 판매했습니다.`,
        { amount, couponValue, cashGained },
      );
    });
    return { success: true, message: "쿠폰 판매가 완료되었습니다." };
  } catch (error) {
    logger.error(`[sellCoupon] Error for user ${uid}:`, error);
    throw new HttpsError(
      "aborted",
      error.message || "쿠폰 판매에 실패했습니다.",
    );
  }
});

exports.giftCoupon = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, userData } = await checkAuthAndGetUserData(request);
  const { recipientId, amount, message } = request.data;
  // 🔒 [보안] 정수 검증: 소수점 amount 허용 시 쿠폰/현금이 소수로 생성·증발할 수 있음.
  if (!recipientId || !Number.isInteger(amount) || amount <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "받는 사람과 쿠폰 수량(양의 정수)을 정확히 입력해야 합니다.",
    );
  }
  if (uid === recipientId) {
    throw new HttpsError(
      "invalid-argument",
      "자기 자신에게는 쿠폰을 선물할 수 없습니다.",
    );
  }
  const senderRef = db.collection("users").doc(uid);
  const recipientRef = db.collection("users").doc(recipientId);
  try {
    await db.runTransaction(async (transaction) => {
      const [senderDoc, recipientDoc] = await transaction.getAll(
        senderRef,
        recipientRef,
      );
      if (!senderDoc.exists) throw new Error("보내는 사람의 정보가 없습니다.");
      if (!recipientDoc.exists) throw new Error("받는 사람의 정보가 없습니다.");
      // 🔒 court-lock 후속(defense-in-depth): coupons 잔액 엄격 검증 — sellCoupon/donateCoupon과 대칭.
      //   coupons는 batch7-b로 잠겼지만, 과거 위조/레거시 비정상값(Infinity/문자열)이 남아 있으면
      //   `< amount`를 통과해 recipient에게 증식 이전될 수 있어 유한 안전정수만 허용한다.
      const rawSenderCoupons = senderDoc.data().coupons ?? 0;
      if (
        typeof rawSenderCoupons !== "number" ||
        !Number.isFinite(rawSenderCoupons) ||
        rawSenderCoupons < 0
      ) {
        throw new Error("쿠폰 잔액이 올바르지 않습니다. 관리자에게 문의하세요.");
      }
      const senderCoupons = rawSenderCoupons;
      if (senderCoupons < amount) throw new Error("보유한 쿠폰이 부족합니다.");
      transaction.update(senderRef, {
        coupons: admin.firestore.FieldValue.increment(-amount),
      });
      transaction.update(recipientRef, {
        coupons: admin.firestore.FieldValue.increment(amount),
      });
      const recipientData = recipientDoc.data();
      logActivity(
        transaction,
        uid,
        LOG_TYPES.COUPON_TRANSFER_SEND,
        `${recipientData.name}님에게 쿠폰 ${amount}개를 선물했습니다.`,
        { recipientId, recipientName: recipientData.name, amount, message },
      );
      logActivity(
        transaction,
        recipientId,
        LOG_TYPES.COUPON_TRANSFER_RECEIVE,
        `${userData.name}님으로부터 쿠폰 ${amount}개를 선물 받았습니다.`,
        { senderId: uid, senderName: userData.name, amount, message },
      );
    });
    return { success: true, message: "쿠폰 선물이 완료되었습니다." };
  } catch (error) {
    logger.error(`[giftCoupon] Error for user ${uid}:`, error);
    throw new HttpsError(
      "aborted",
      error.message || "쿠폰 선물에 실패했습니다.",
    );
  }
});

// ===================================================================================
// 🔥 학생 간 현금 송금 (2026-07-16 CF 이관 — 기존 MyAssets 클라 2단계 write 대체)
//   - senderId = auth.uid 강제 → 이 CF 경로로는 남의 돈 송금 불가.
//     ⚠️ 단, firestore.rules의 same-class cash 직접-write 허용 분기는 배치6에서 잠근다.
//     그전까지는 devtools/SDK로 규칙을 직접 타는 우회(money glitch)가 여전히 가능하다
//     (재판 합의·경찰 벌금 등 다른 클라 크로스유저 cash write가 아직 그 규칙에 의존).
//   - 단일 트랜잭션 양방향 increment → 원자성(부분 실패로 인한 증발/이중지급 없음)
//   - 같은 학급 수신자만·서버 잔액검증·자기송금/비정수/범위 검증·멱등
//   - 현행 동작 보존: 거래세 없음, lastIncomingTransferAt 기록(대출 상환 쿨다운용),
//     양쪽 users/{uid}/transactions 거래내역 기록(학생 거래내역 UI 소스)
// ===================================================================================
exports.transferCash = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, userData } = await checkAuthAndGetUserData(request);
    const { recipientId, amount, message = "", idempotencyKey } = request.data;

    // 🔒 정수·범위·타입 검증 (소수점/음수/과대값/비문자 recipientId 차단)
    if (
      !recipientId ||
      typeof recipientId !== "string" ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > 10000000000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "받는 사람과 송금액(1 이상의 정수)을 정확히 입력해야 합니다.",
      );
    }
    if (uid === recipientId) {
      throw new HttpsError(
        "invalid-argument",
        "자기 자신에게는 송금할 수 없습니다.",
      );
    }

    const senderRef = db.collection("users").doc(uid);
    const recipientRef = db.collection("users").doc(recipientId);

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 모든 읽기 먼저: 멱등키 → 양쪽 문서
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const [senderDoc, recipientDoc] = await transaction.getAll(
          senderRef,
          recipientRef,
        );
        if (!senderDoc.exists) throw new Error("보내는 사람의 정보가 없습니다.");
        if (!recipientDoc.exists) throw new Error("받는 사람의 정보가 없습니다.");

        const senderData = senderDoc.data();
        const recipientData = recipientDoc.data();

        // 2) 같은 학급만 (학급 밖으로 돈이 새는 것 차단).
        //    학급 대조는 트랜잭션 내부에서 읽은 senderData.classCode 사용(TOCTOU 방지 —
        //    트랜잭션 밖에서 먼저 읽은 값 대신 tx 스냅샷 기준으로 일관성 보장).
        const senderClassCode = senderData.classCode;
        if (
          !senderClassCode ||
          !recipientData.classCode ||
          recipientData.classCode !== senderClassCode
        ) {
          throw new Error("같은 학급의 사용자에게만 송금할 수 있습니다.");
        }

        // 3) 서버 잔액검증
        const senderCash = Number(senderData.cash) || 0;
        if (senderCash < amount) throw new Error("보유 현금이 부족합니다.");

        // 4) 쓰기: 양방향 increment (원자적)
        transaction.update(senderRef, {
          cash: admin.firestore.FieldValue.increment(-amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(recipientRef, {
          cash: admin.firestore.FieldValue.increment(amount),
          lastIncomingTransferAt:
            admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 4-1) 거래내역(users/{uid}/transactions) — 학생 거래내역 UI가 읽는 소스.
        //      구 클라 경로(addTransaction)가 양쪽에 남기던 기록을 원자적으로 보존.
        const senderTxRef = senderRef.collection("transactions").doc();
        transaction.set(senderTxRef, {
          amount: -amount,
          description: `${recipientData.name}님에게 송금`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        const recipientTxRef = recipientRef.collection("transactions").doc();
        transaction.set(recipientTxRef, {
          amount: amount,
          description: `${userData.name}님으로부터 입금`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        markIdempotent(transaction, keyRef);

        // 5) 양쪽 활동 로그 (await 필수 — 내부 non-tx get 후 transaction.set)
        await logActivity(
          transaction,
          uid,
          LOG_TYPES.CASH_TRANSFER_SEND,
          `${recipientData.name}님에게 ${amount.toLocaleString()}원을 송금했습니다.${message ? ` 메시지: "${message}"` : ""}`,
          { recipientId, recipientName: recipientData.name, amount, message },
        );
        await logActivity(
          transaction,
          recipientId,
          LOG_TYPES.CASH_TRANSFER_RECEIVE,
          `${userData.name}님으로부터 ${amount.toLocaleString()}원을 송금 받았습니다.${message ? ` 메시지: "${message}"` : ""}`,
          { senderId: uid, senderName: userData.name, amount, message },
        );
      });
      return { success: true, message: "송금이 완료되었습니다." };
    } catch (error) {
      logger.error(`[transferCash] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "송금에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔥 벌금 부과 (2026-07-16 CF 이관 — 재판정/경찰서의 클라 processFineTransaction 대체)
//   - 권한: 관리자/교사, 또는 context별 역할(trial→'판사', police→'경찰청장'). 같은 학급만.
//     (현재 UI 게이트를 서버에서 강제 — 아무나 남의 cash를 차감하지 못하게)
//   - 피고 cash 차감 + 국고(승인 관리자 cash) 적립 + 통계 + 로그, 단일 트랜잭션·멱등.
//   - 국고 관리자 선정 = findApprovedAdminSnap(미승인 교사 탈취 방지) — 구 .where(isAdmin==true) 취약점 개선.
//   - 현행 동작 보존: 잔액 하한 없음(벌금은 마이너스 허용), 거래세 없음, 피고 transactions 기록.
// ===================================================================================
exports.processFine = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const {
      defendantId,
      amount,
      reason = "",
      context,
      idempotencyKey,
    } = request.data;

    if (
      !defendantId ||
      typeof defendantId !== "string" ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > 10000000000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "피고와 벌금액(1 이상의 정수)을 정확히 입력해야 합니다.",
      );
    }
    if (context !== "trial" && context !== "police") {
      throw new HttpsError("invalid-argument", "유효하지 않은 벌금 맥락입니다.");
    }
    if (defendantId === uid) {
      throw new HttpsError(
        "invalid-argument",
        "자기 자신에게는 벌금을 부과할 수 없습니다.",
      );
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    // 사유 위생·길이 제한(신뢰 경계 밖 입력 — 판사/경찰의 prompt 문자열)
    const safeReason = sanitizeInput(String(reason || "").slice(0, 200)) ||
      "벌금 납부";

    // 🔒 권한 검증: 관리자/교사(레거시 isTeacher 포함) OR context별 역할(재판=판사, 경찰=경찰청장)
    let authorized = hasTeacherPower(userData);
    if (!authorized) {
      const jobsSnap = await db
        .collection("jobs")
        .where("classCode", "==", classCode)
        .get();
      const jobMap = buildJobMap(jobsSnap);
      const requiredTitle = context === "trial" ? "판사" : "경찰청장";
      authorized = hasJobTitle(userData, jobMap, requiredTitle);
    }
    if (!authorized) {
      throw new HttpsError(
        "permission-denied",
        "벌금을 부과할 권한이 없습니다.",
      );
    }

    const defendantRef = db.collection("users").doc(defendantId);
    const treasuryRef = db
      .collection("nationalTreasuries")
      .doc(classCode);
    // 국고 관리자(=세금 수입 계좌)는 트랜잭션 외부에서 사전 조회(blind increment라 read 불필요)
    const adminSnap = await findApprovedAdminSnap(classCode);
    const adminRef = adminSnap.empty ? null : adminSnap.docs[0].ref;
    // 🔒 fail-closed: 국고(승인 관리자)가 없으면 피고 현금이 갈 곳이 없어 소각된다 → 부과 자체를 막는다.
    if (!adminRef) {
      throw new HttpsError(
        "failed-precondition",
        "승인된 관리자(국고)가 없어 벌금을 부과할 수 없습니다.",
      );
    }

    try {
      await db.runTransaction(async (transaction) => {
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const defendantDoc = await transaction.get(defendantRef);
        if (!defendantDoc.exists) {
          throw new Error("피고 정보를 찾을 수 없습니다.");
        }
        const dData = defendantDoc.data();
        if (dData.classCode !== classCode) {
          throw new Error("같은 학급의 사용자에게만 벌금을 부과할 수 있습니다.");
        }

        // 피고 cash 차감 (하한 없음 — 구 processFineTransaction 동작 보존)
        transaction.update(defendantRef, {
          cash: admin.firestore.FieldValue.increment(-amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 피고 거래내역(users/{uid}/transactions)
        const dTxRef = defendantRef.collection("transactions").doc();
        transaction.set(dTxRef, {
          amount: -amount,
          description: safeReason,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 국고(승인 관리자 cash) 적립.
        // ⚠️ 피고가 국고 관리자 본인이면 같은 문서 2회 update로 트랜잭션이 깨진다 → 적립 skip
        //    (관리자를 벌금하면 이미 위에서 차감됐고, 다시 +amount는 상쇄일 뿐).
        if (adminRef.id !== defendantId) {
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        // 통계(국고=관리자 cash이므로 통계만)
        transaction.set(
          treasuryRef,
          {
            otherTaxRevenue: admin.firestore.FieldValue.increment(amount),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        markIdempotent(transaction, keyRef);

        await logActivity(
          transaction,
          defendantId,
          "벌금 납부",
          safeReason,
          { amount, context, issuedBy: uid, issuedByName: userData.name },
        );
      });
      return { success: true, message: "벌금이 부과되었습니다." };
    } catch (error) {
      logger.error(
        `[processFine] Error by ${uid} on ${defendantId}:`,
        error,
      );
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "aborted",
        error.message || "벌금 부과에 실패했습니다.",
      );
    }
  },
);

// ===================================================================================
// 🔥 파킹통장 입금 (2026-07-17 CF 이관 — ParkingAccount 클라 runTransaction 대체)
//   - uid=auth.uid 강제(남의 파킹통장 조작 차단). 같은 사용자의 cash↔parkingAccount.balance.
//   - 단일 트랜잭션: cash 차감 + 파킹 balance 적립. 서버 잔액검증. 멱등.
//   - 기존 클라 동작 보존: 정수 금액, lastInterestDate(신규 생성 시만) 초기화, 활동로그 type="파킹통장 입금".
//   - 배치6 rules 잠금(본인 financials.balance 클라 write 제거)을 위한 방어 이관.
// ===================================================================================
exports.parkingDeposit = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { amount, idempotencyKey } = request.data;

    // 🔒 정수·범위·타입 검증 (소수점/음수/과대값 차단 — cash는 정수 단위)
    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > 10000000000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "입금액은 1 이상의 정수여야 합니다.",
      );
    }

    const userRef = db.collection("users").doc(uid);
    const parkingRef = userRef.collection("financials").doc("parkingAccount");

    try {
      let newBalance = 0;
      await db.runTransaction(async (transaction) => {
        // 1) 읽기 먼저: 멱등키 → 사용자 → 파킹
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const userDoc = await transaction.get(userRef);
        const parkingDoc = await transaction.get(parkingRef);
        if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");

        // 2) 저장값 타입 가드 + 잔액검증.
        //    ⚠️ Firestore increment은 대상 필드가 숫자가 아니면 '더하기'가 아니라 '값으로 교체'가
        //    되고, 숫자 타입은 Infinity/NaN도 허용한다 → 문자열·Infinity·NaN 잔액이면 합계 보존이
        //    깨져 돈 증발/증식이 가능(예: cash=Infinity면 increment 후에도 Infinity, 파킹만 늘어남).
        //    cash는 벌금 등으로 음수가 정상이므로 음수는 허용하되 숫자·유한만 통과시킨다.
        const rawCash = userDoc.data().cash;
        if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) {
          throw new Error("계정 잔액 데이터에 오류가 있습니다. 관리자에게 문의하세요.");
        }
        if (rawCash < amount) throw new Error("보유 현금이 부족합니다.");

        // 3) 쓰기: cash 차감 + 파킹 balance 적립 (원자적)
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(-amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (parkingDoc.exists) {
          // 파킹 잔액은 음수가 될 수 없으므로 음수도 거부(위 사유 + 데이터 무결성).
          const prev = parkingDoc.data().balance;
          if (typeof prev !== "number" || !Number.isFinite(prev) || prev < 0) {
            throw new Error("파킹통장 잔액 데이터에 오류가 있습니다. 관리자에게 문의하세요.");
          }
          newBalance = prev + amount;
          transaction.update(parkingRef, {
            balance: admin.firestore.FieldValue.increment(amount),
          });
        } else {
          // 신규 생성 시에만 lastInterestDate 초기화(기존 클라 동작 보존)
          newBalance = amount;
          transaction.set(parkingRef, {
            balance: amount,
            lastInterestDate: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        markIdempotent(transaction, keyRef);

        // 4) 활동 로그 — MyAssets 거래내역은 activity_logs를 최상위 amount(!=0)로 필터한다.
        //    서버 공통 logActivity는 amount를 metadata에만 넣어 파킹 거래가 내역에서 사라진다(회귀).
        //    구 클라 logActivity 필드 형태(최상위 amount·classCode·userName·couponAmount·90일 TTL)를
        //    그대로 재현해 거래내역 표시를 보존한다.
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 90);
        transaction.set(db.collection("activity_logs").doc(), {
          classCode,
          userId: uid,
          userName: userData.name || "사용자",
          type: "파킹통장 입금",
          description: `파킹통장 입금 ${amount.toLocaleString()}원`,
          amount: -amount,
          couponAmount: 0,
          metadata: { parkingBalance: newBalance },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        });
      });
      return { success: true, balance: newBalance };
    } catch (error) {
      logger.error(`[parkingDeposit] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "입금에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔥 파킹통장 출금 (2026-07-17 CF 이관 — ParkingAccount 클라 runTransaction 대체)
//   - uid=auth.uid 강제. 파킹 balance 차감 + cash 적립. 단일 트랜잭션·서버 잔액검증·멱등.
//   - 기존 클라 동작 보존: 파킹 잔액 부족 시 거부(마이너스 불가), 활동로그 type="파킹통장 출금".
// ===================================================================================
exports.parkingWithdraw = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { amount, idempotencyKey } = request.data;

    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > 10000000000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "출금액은 1 이상의 정수여야 합니다.",
      );
    }

    const userRef = db.collection("users").doc(uid);
    const parkingRef = userRef.collection("financials").doc("parkingAccount");

    try {
      let newBalance = 0;
      await db.runTransaction(async (transaction) => {
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const parkingDoc = await transaction.get(parkingRef);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");

        // 저장값 타입 가드(입금 CF와 동일 사유 — increment 교체/Infinity 방지).
        // 파킹 잔액은 음수 불가 → 음수도 거부. cash는 음수 정상이라 숫자·유한만 검사.
        const rawBalance = parkingDoc.exists ? parkingDoc.data().balance : 0;
        if (
          typeof rawBalance !== "number" ||
          !Number.isFinite(rawBalance) ||
          rawBalance < 0
        ) {
          throw new Error("파킹통장 잔액 데이터에 오류가 있습니다. 관리자에게 문의하세요.");
        }
        const rawCash = userDoc.data().cash;
        if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) {
          throw new Error("계정 잔액 데이터에 오류가 있습니다. 관리자에게 문의하세요.");
        }
        if (rawBalance < amount) {
          throw new Error("파킹통장 잔액이 부족합니다.");
        }
        newBalance = rawBalance - amount;

        // 쓰기: 파킹 balance 차감 + cash 적립 (원자적)
        transaction.update(parkingRef, {
          balance: admin.firestore.FieldValue.increment(-amount),
        });
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        markIdempotent(transaction, keyRef);

        // 활동 로그 — 최상위 amount 기록(입금 CF와 동일 사유: 거래내역 표시 보존).
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 90);
        transaction.set(db.collection("activity_logs").doc(), {
          classCode,
          userId: uid,
          userName: userData.name || "사용자",
          type: "파킹통장 출금",
          description: `파킹통장 출금 ${amount.toLocaleString()}원`,
          amount: amount,
          couponAmount: 0,
          metadata: { parkingBalance: newBalance },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        });
      });
      return { success: true, balance: newBalance };
    } catch (error) {
      logger.error(`[parkingWithdraw] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "출금에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔒 파킹통장 이자 적립 (2026-07-18 batch7-c CF 이관 — ParkingAccount loadAllData 클라 runTransaction 대체)
//   - 구 클라는 financials/parkingAccount.balance를 직접 increment(이자)했는데, financials가 owner-write라
//     학생이 balance를 임의 위조 → parkingWithdraw로 현금화하는 무담보 민팅 통로였다(codex CRITICAL).
//     이자 적립을 서버로 옮겨 balance write를 CF(Admin SDK) 전용으로 만들고 financials rules를 잠근다.
//   - 충실 이관: KST 하루 1회 가드, 복리 0.1%/일(구 calculateCompoundInterest와 동일 식), balance 유한 가드.
//   - '파킹 이율 상품 존재' 게이트는 클라가 유지(depositProducts 있을 때만 호출) — 동작 보존.
// ===================================================================================
exports.accrueParkingInterest = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request);
    const parkingRef = db
      .collection("users")
      .doc(uid)
      .collection("financials")
      .doc("parkingAccount");

    try {
      const result = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(parkingRef);
        if (!snap.exists) {
          transaction.set(parkingRef, {
            balance: 0,
            lastInterestDate: admin.firestore.FieldValue.serverTimestamp(),
          });
          return { accrued: 0, created: true };
        }
        const data = snap.data();
        const nowDate = new Date();
        const todayKst = kstStartOfDayMs(nowDate);
        const lastMs =
          typeof data.lastInterestDate?.toMillis === "function"
            ? data.lastInterestDate.toMillis()
            : null;
        const lastKst = lastMs !== null ? kstStartOfDayMs(new Date(lastMs)) : null;
        // 오늘 이미 적립됨(또는 미래 날짜 위조) → no-op
        if (lastKst !== null && lastKst >= todayKst) {
          return { accrued: 0, alreadyToday: true };
        }
        const daysToApply =
          lastKst !== null
            ? Math.floor((todayKst - lastKst) / (24 * 60 * 60 * 1000))
            : 1;
        if (daysToApply <= 0) return { accrued: 0 };

        // balance 엄격 타입 가드(위조·increment 세탁 방지). parkingWithdraw(typeof==="number")와 대칭.
        //   Number(data.balance) 코어시브 변환은 문자열/배열("9e12" 등)을 유한수로 세탁해
        //   increment가 비숫자 필드를 숫자로 교체 → parkingWithdraw 통과 → 민팅(codex CRITICAL).
        //   따라서 Number()를 쓰지 않고 원시 타입을 그대로 검사, 비숫자는 balance를 절대 건드리지 않는다.
        const bal = data.balance;
        if (typeof bal !== "number" || !Number.isFinite(bal) || bal < 0) {
          transaction.update(parkingRef, {
            lastInterestDate: admin.firestore.FieldValue.serverTimestamp(),
          });
          return { accrued: 0, badBalance: true };
        }
        // 복리 0.1%/일 (구 calculateCompoundInterest: principal*(1+rate/100)^days). 일수 안전상한.
        const cappedDays = Math.min(daysToApply, 3650);
        const total = bal * Math.pow(1 + 0.1 / 100, cappedDays);
        const interest = Math.round(total - bal);
        if (interest > 0 && Number.isFinite(interest) && interest <= 10000000000) {
          transaction.update(parkingRef, {
            balance: admin.firestore.FieldValue.increment(interest),
            lastInterestDate: admin.firestore.FieldValue.serverTimestamp(),
          });
          return { accrued: interest };
        }
        transaction.update(parkingRef, {
          lastInterestDate: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { accrued: 0 };
      });
      return { success: true, ...result };
    } catch (error) {
      logger.error(`[accrueParkingInterest] Error (uid ${uid}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "이자 적립에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔥 예적금/대출 가입 (2026-07-17 CF 이관 — ParkingAccount handleSubscribe 클라 runTransaction 대체)
//   - 상품 정보(rate·term·min/max·name)를 클라 입력이 아닌 서버 카탈로그(bankingSettings/{classCode})에서
//     조회해 위조 차단(0일 만기·과대 한도·임의 이율 방지). 클라는 productType·productId·amount만 신뢰.
//   - 학생↔선생님(승인 관리자=은행) cash 이동. 단일 트랜잭션·멱등·활동로그(최상위 amount로 거래내역 보존).
//   - 서버 강제 규칙: 카탈로그 존재, min/max, (대출) 활성대출 차단·24h 쿨다운·현금 10배 레버리지,
//     (적금) 일납입금 ≤ 현금/기간. 순자산음수 차단은 클라 UX 게이트로 유지 — 무결성 경계가 아닌 anti-abuse
//     이고(활성대출 차단+현금>0+10배 레버리지가 이미 실효 제약), getNetAssets 서버포팅은 divergence 위험이
//     더 크다. 배치6 rules 잠금(본인/교사 cash·products 클라 write 제거) 대비 방어 이관.
// ===================================================================================
exports.subscribeProduct = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { productType, productId, amount, repaymentType, idempotencyKey } =
      request.data;

    // 1) 입력 검증
    if (!["deposits", "savings", "loans"].includes(productType)) {
      throw new HttpsError("invalid-argument", "유효하지 않은 상품 유형입니다.");
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10000000000) {
      throw new HttpsError(
        "invalid-argument",
        "가입 금액은 1 이상의 정수여야 합니다.",
      );
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }
    // 멱등키 필수화 — 신규 CF라 레거시 호출자가 없으므로 fail-open(키 생략 시 멱등 생략)을 막는다.
    // 클라 재시도/연타로 인한 이중 가입·이중 차감을 checkIdempotent가 확실히 차단하도록 강제.
    if (typeof idempotencyKey !== "string" || !idempotencyKey) {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    const isLoan = productType === "loans";
    const isSavings = productType === "savings";
    const safeRepayment =
      repaymentType === "installment" ? "installment" : "lumpSum";

    // 2) 서버 카탈로그 조회 — 클라가 넘긴 rate/term/name/min/max를 신뢰하지 않는다.
    const bankingSnap = await db
      .collection("bankingSettings")
      .doc(classCode)
      .get();
    if (!bankingSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "학급 뱅킹 상품이 설정되지 않았습니다.",
      );
    }
    const catalog = bankingSnap.data()[productType];
    if (!Array.isArray(catalog)) {
      throw new HttpsError("failed-precondition", "상품 목록을 찾을 수 없습니다.");
    }
    const product = catalog.find((p) => Number(p.id) === Number(productId));
    if (!product) {
      throw new HttpsError("not-found", "해당 상품을 찾을 수 없습니다.");
    }
    // 서버 파생값 — 실제 사용 어댑터(src/pages/banking/Banking.js:21 로컬 convertAdminProductsToAccountFormat,
    //   dailyRate 없으면 0)와 동일 규칙. ⚠️ 동명의 src/pages/banking/BankingProductAdapter.js(annualRate/365
    //   폴백)는 BankingProductService 전용이라 이 가입 경로와 무관 — 규칙 동기화 시 반드시 Banking.js 쪽을 볼 것.
    //   parseInt 절삭 후에도 term≥1을 재보장(예: "0.5"→0이면 즉시만기·적금 일한도 cash/0=Infinity 우회 방지).
    const termParsed = parseInt(product.termInDays, 10);
    const termInDays =
      Number.isFinite(termParsed) && termParsed > 0 ? termParsed : 1;
    const dailyRate =
      product.dailyRate !== undefined &&
      Number.isFinite(Number(product.dailyRate))
        ? parseFloat(product.dailyRate)
        : 0;
    const minParsed = parseInt(product.minAmount, 10);
    const minAmount = Number.isFinite(minParsed) && minParsed > 0 ? minParsed : 0;
    const maxParsed = parseInt(product.maxAmount, 10);
    const maxAmount = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : 0;
    const productName =
      sanitizeInput(String(product.name || "상품")).slice(0, 100) || "상품";

    // 3) min/max (클라 UI와 동일)
    if (minAmount && amount < minAmount) {
      throw new HttpsError(
        "invalid-argument",
        `최소 가입 금액은 ${minAmount.toLocaleString()}원입니다.`,
      );
    }
    if (maxAmount && amount > maxAmount) {
      throw new HttpsError(
        "invalid-argument",
        `최대 가입 한도는 ${maxAmount.toLocaleString()}원입니다.`,
      );
    }

    // 4) 선생님(승인 관리자=은행) 계정 — 클라 getTeacherAccount 대체(승인 관리자만 신뢰).
    const adminSnap = await findApprovedAdminSnap(classCode);
    if (adminSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "선생님(은행) 계정을 찾을 수 없습니다. 관리자에게 문의하세요.",
      );
    }
    const teacherId = adminSnap.docs[0].id;
    const teacherName = adminSnap.docs[0].data().name || "선생님";
    const userRef = db.collection("users").doc(uid);
    const teacherRef = db.collection("users").doc(teacherId);

    // ⚠️ 학생==선생님이면 같은 문서 2회 update로 트랜잭션이 깨진다 → 차단(관리자 본인 가입 방어)
    if (teacherId === uid) {
      throw new HttpsError(
        "failed-precondition",
        "관리자(은행) 계정으로는 상품에 가입할 수 없습니다.",
      );
    }

    const maturityDate = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + termInDays * 24 * 60 * 60 * 1000),
    );
    const inc = admin.firestore.FieldValue.increment;

    try {
      await db.runTransaction(async (transaction) => {
        // 읽기 먼저(모든 get은 write 이전). 대출이면 활성대출 확인 쿼리 포함.
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        let activeLoanSnap = null;
        if (isLoan) {
          activeLoanSnap = await transaction.get(
            userRef.collection("products").where("type", "==", "loan"),
          );
        }
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
        const uData = userDoc.data();
        if (uData.classCode !== classCode) {
          throw new Error("학급 정보가 일치하지 않습니다.");
        }
        // 저장값 타입 가드(parking CF와 동일 사유 — increment 교체/Infinity 방지).
        // cash는 벌금 등으로 음수가 정상이므로 음수는 허용하되 숫자·유한만 통과.
        const rawCash = uData.cash;
        if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) {
          throw new Error(
            "계정 잔액 데이터에 오류가 있습니다. 관리자에게 문의하세요.",
          );
        }
        // 교사(은행) 문서도 트랜잭션 내에서 읽어 존재·타입 가드(국고 무결성). 구 클라도
        // teacherSnapshot.exists()를 확인했다. increment가 비정상 cash를 값교체·포화시켜 국고
        // 잔액을 소각/민팅하는 것을 차단(정상 유한수만 통과 — 국고는 음수도 정상이라 음수는 허용).
        const teacherDoc = await transaction.get(teacherRef);
        if (!teacherDoc.exists) {
          throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
        }
        const rawTeacherCash = teacherDoc.data().cash;
        if (
          typeof rawTeacherCash !== "number" ||
          !Number.isFinite(rawTeacherCash)
        ) {
          throw new Error(
            "은행 계정 잔액 데이터에 오류가 있습니다. 관리자에게 문의하세요.",
          );
        }

        if (isLoan) {
          // 활성 대출 차단(돌려막기·다중대출로 국고 고갈 방지 — 서버 강제).
          // 현 스키마는 balance만 쓰지만 netAssets가 참조하는 레거시 remainingPrincipal도 방어적으로 포함.
          const hasActive = activeLoanSnap.docs.some(
            (d) =>
              Number(d.data().balance) > 0 ||
              Number(d.data().remainingPrincipal) > 0,
          );
          if (hasActive) {
            throw new Error(
              "이미 미상환 대출이 있습니다. 기존 대출을 먼저 갚아주세요.",
            );
          }
          // 대출 상환 후 24시간 쿨다운
          const lastRepaid = uData.lastLoanRepaidAt;
          const lastMs = lastRepaid?.toMillis
            ? lastRepaid.toMillis()
            : lastRepaid
              ? new Date(lastRepaid).getTime()
              : null;
          if (lastMs && Number.isFinite(lastMs)) {
            const elapsed = Date.now() - lastMs;
            const COOLDOWN = 24 * 60 * 60 * 1000;
            if (elapsed >= 0 && elapsed < COOLDOWN) {
              const remainingH = Math.ceil(
                (COOLDOWN - elapsed) / (60 * 60 * 1000),
              );
              throw new Error(
                `대출 상환 후 24시간이 지나야 새 대출이 가능합니다. (남은 시간: ${remainingH}시간)`,
              );
            }
          }
          // 현금 1원 이상 + 보유 현금의 10배 레버리지(서버 강제)
          if (rawCash <= 0) {
            throw new Error(
              "대출은 현금을 1원 이상 보유해야 신청할 수 있습니다.",
            );
          }
          if (amount > rawCash * 10) {
            throw new Error(
              "대출 한도 초과: 보유 현금의 10배까지만 가능합니다.",
            );
          }
        } else {
          // 예금/적금: 학생 현금 확인
          if (rawCash < amount) throw new Error("보유 현금이 부족합니다.");
          if (isSavings) {
            // 적금 일 납입금 ≤ 보유 현금 ÷ 기간(매일 납입 가능해야 함)
            const maxDaily = Math.floor(rawCash / termInDays);
            if (amount > maxDaily) {
              throw new Error(
                `적금 일 납입금은 보유 현금 ÷ 기간(${termInDays}일) 이하만 가능합니다.`,
              );
            }
          }
        }

        // 쓰기: 상품 문서 생성(클라 handleSubscribe 저장 필드 정확 보존)
        const newProductRef = userRef.collection("products").doc();
        const newProductData = {
          name: productName,
          termInDays,
          rate: dailyRate,
          balance: amount,
          startDate: admin.firestore.FieldValue.serverTimestamp(),
          maturityDate,
          type: isLoan ? "loan" : isSavings ? "savings" : "deposit",
          teacherId,
          teacherName,
          ...(isSavings && {
            dailyAmount: amount,
            totalDeposited: amount,
            depositsCount: 1,
          }),
          ...(isLoan && {
            repaymentType: safeRepayment,
            originalBalance: amount,
            lastRepaymentDate: null,
            totalInterestPaid: 0,
          }),
        };
        transaction.set(newProductRef, newProductData);

        // cash 이동: 대출=선생님→학생, 예적금=학생→선생님
        if (isLoan) {
          transaction.update(userRef, {
            cash: inc(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          transaction.update(teacherRef, {
            cash: inc(-amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.update(userRef, {
            cash: inc(-amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          transaction.update(teacherRef, {
            cash: inc(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        markIdempotent(transaction, keyRef);

        // 활동 로그 — 최상위 amount로 거래내역 표시 보존(클라 logActivity와 동일 형태).
        const cashChange = isLoan ? amount : -amount;
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 90);
        transaction.set(db.collection("activity_logs").doc(), {
          classCode,
          userId: uid,
          userName: uData.name || "사용자",
          type: isLoan ? "대출 실행" : "예금 가입",
          description: `${productName} ${isLoan ? "대출" : "가입"} (${amount.toLocaleString()}원) - 선생님 계정 연동`,
          amount: cashChange,
          couponAmount: 0,
          metadata: {
            productName,
            productType,
            termInDays,
            dailyRate,
            maturityDate: maturityDate.toDate().toISOString(),
            teacherId,
            teacherName,
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        });
      });
      return { success: true };
    } catch (error) {
      logger.error(`[subscribeProduct] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "aborted",
        error.message || "가입 처리에 실패했습니다.",
      );
    }
  },
);

// ── 뱅킹 이자 계산 헬퍼 (클라 ParkingAccount.js 정의를 서버로 정확히 포팅 — 이자를 서버 권위로 재계산해
//    클라 위조(국고 민팅)를 차단하기 위함. 반올림·복리식·적금 회차 합산까지 클라와 동일해야 표시·정산 일치) ──
function calcCompoundInterest(principal, dailyRate, days) {
  if (principal <= 0 || !dailyRate || days <= 0) {
    return { interest: 0, total: principal };
  }
  const total = principal * Math.pow(1 + dailyRate / 100, days);
  return { interest: Math.round(total - principal), total: Math.round(total) };
}
function calcSavingsInterest(dailyAmount, dailyRate, termInDays, depositsCount) {
  if (!dailyAmount || !dailyRate || termInDays <= 0) {
    return { interest: 0, total: 0, totalDeposited: 0 };
  }
  const r = dailyRate / 100;
  const actualDeposits = depositsCount != null ? depositsCount : termInDays;
  let total = 0;
  for (let i = 0; i < actualDeposits; i++) {
    total += dailyAmount * Math.pow(1 + r, termInDays - i);
  }
  const totalDeposited = dailyAmount * actualDeposits;
  return {
    interest: Math.round(total - totalDeposited),
    total: Math.round(total),
    totalDeposited,
  };
}
// KST(UTC+9) 달력일 헬퍼 — date-fns는 functions 런타임에 미설치라 사용 불가. 서버 런타임은 UTC이므로
//   +9h 시프트한 UTC 날짜 성분으로 'KST 그 날 00:00'의 UTC epoch(ms)을 만든다. 클라 브라우저(KST)의
//   date-fns startOfDay/differenceInCalendarDays와 만기·경과일 판정을 일치시킨다.
function kstStartOfDayMs(date) {
  const s = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return (
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) -
    9 * 60 * 60 * 1000
  );
}
function kstDiffCalendarDays(a, b) {
  return Math.floor(
    (kstStartOfDayMs(a) - kstStartOfDayMs(b)) / (24 * 60 * 60 * 1000),
  );
}
// 대출 경과이자(시작일 또는 마지막 상환일부터 현재까지 복리) — 클라 calculateAccruedLoanInterest(169행) 포팅.
//   startDate/lastRepaymentDate는 Firestore Timestamp. base가 Invalid이면 이자 0(방어).
function calcAccruedLoanInterest(balance, dailyRate, startDate, lastRepaymentDate) {
  const src = lastRepaymentDate || startDate;
  const base = src?.toDate ? src.toDate() : src ? new Date(src) : null;
  if (!base || isNaN(base.getTime())) {
    return { interest: 0, total: balance, elapsedDays: 0 };
  }
  const elapsedDays = Math.max(0, kstDiffCalendarDays(new Date(), base));
  if (elapsedDays <= 0 || balance <= 0 || !dailyRate) {
    return { interest: 0, total: balance, elapsedDays: 0 };
  }
  const total = balance * Math.pow(1 + dailyRate / 100, elapsedDays);
  return {
    interest: Math.round(total - balance),
    total: Math.round(total),
    elapsedDays,
  };
}

// ===================================================================================
// 🔥 예적금 만기 수령 / 중도 해지 (2026-07-17 CF 이관 — ParkingAccount handleMaturity/handleCancelEarly의
//    예금·적금 브랜치 대체. 대출 브랜치는 별도 repayLoan CF(배치5-c2)까지 구 경로 유지).
//    - 이자를 클라 계산이 아닌 서버가 저장된 product(balance·rate·termInDays·dailyAmount·depositsCount)에서
//      재계산 → 이자 위조(국고 민팅) 차단. mode="maturity"는 서버에서 만기도달(startOfDay(now)≥maturityDate)
//      검증 → 가입 즉시 만기 호출로 full-term 이자를 즉시 빼가는 민팅 차단. mode="cancel"=원금만 환불(무이자).
//    - 방향 = 선생님(국고=상품에 저장된 teacherId)→학생. 단일 트랜잭션·멱등·활동로그(최상위 amount).
// ===================================================================================
exports.redeemDepositSavings = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { productId, mode, idempotencyKey } = request.data || {};

    // productId는 문서 ID여야 함 — "/" 포함 시 Admin SDK가 중첩 경로로 해석해 임의 문서를 가리킬 수
    //   있으므로 거부(경로 주입 차단).
    if (!productId || typeof productId !== "string" || productId.includes("/")) {
      throw new HttpsError("invalid-argument", "상품 ID가 올바르지 않습니다.");
    }
    if (mode !== "maturity" && mode !== "cancel") {
      throw new HttpsError("invalid-argument", "유효하지 않은 처리 유형입니다.");
    }
    if (typeof idempotencyKey !== "string" || !idempotencyKey) {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const userRef = db.collection("users").doc(uid);
    const productRef = userRef.collection("products").doc(productId);
    const inc = admin.firestore.FieldValue.increment;

    try {
      let resultInfo = null;
      await db.runTransaction(async (transaction) => {
        // 읽기 먼저 — 멱등키 → 상품(권위값) → 사용자 → 교사
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) throw new Error("상품 정보를 찾을 수 없습니다.");
        const p = productDoc.data();
        const type = p.type;
        if (type !== "deposit" && type !== "savings") {
          throw new Error("예금/적금 상품이 아닙니다.");
        }
        // 상품에 저장된 teacherId로 국고 특정.
        // ⚠️ products 문서는 batch6 rules 잠금 전까지 학생이 직접 write 가능하므로 teacherId도 위조 가능.
        //   "/" 포함 문자열(예: "<myUID>/products/dummy")이면 Admin SDK가 공격자 소유 중첩 문서로 해석해
        //   상쇄 차감을 가짜 문서로 흘려보내는 '소스 없는 민팅'이 가능(codex 실증) → 반드시 단순 문서 ID만 허용.
        // ⚠️ 레거시 상품(teacherId 미기록 — 실측 149/156)은 하드에러 대신 구 클라 getTeacherAccount처럼
        //   findApprovedAdminSnap로 같은 학급 국고를 재조회(폴백). 재조회 결과는 승인 관리자라 반경계 안전.
        let teacherId = p.teacherId;
        if (teacherId) {
          if (typeof teacherId !== "string" || teacherId.includes("/")) {
            throw new Error("상품에 연결된 은행 계정이 올바르지 않습니다.");
          }
        } else {
          const adminSnap = await findApprovedAdminSnap(classCode);
          if (adminSnap.empty) {
            throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
          }
          teacherId = adminSnap.docs[0].id;
        }
        if (teacherId === uid) {
          throw new Error("관리자 계정으로는 처리할 수 없습니다.");
        }
        const teacherRef = db.collection("users").doc(teacherId);

        const userDoc = await transaction.get(userRef);
        const teacherDoc = await transaction.get(teacherRef);
        if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
        if (!teacherDoc.exists) {
          throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
        }
        // 🔒 teacherId 반경계 검증 — products 문서는 batch6 rules 잠금 전까지 학생이 직접 write 가능하므로
        //   teacherId를 위조해 Admin SDK로 임의(타 학급 포함) 계정을 드레인하는 것을 차단(3계열 CRITICAL).
        //   국고는 반드시 같은 학급의 승인 관리자여야 함 → 구 클라 runTransaction 경로(same-class rules)와
        //   동등한 blast radius로 축소(회귀 아님). 잔액 위조는 batch6 products rules 잠금이 최종 봉인.
        const tData = teacherDoc.data();
        if (tData.classCode !== classCode || !hasAdminPower(tData)) {
          throw new Error("유효한 은행(관리자) 계정이 아닙니다.");
        }
        // 저장값 타입 가드(increment 교체·포화 방지 — 학생·국고 모두).
        const rawUserCash = userDoc.data().cash;
        const rawTeacherCash = tData.cash;
        if (typeof rawUserCash !== "number" || !Number.isFinite(rawUserCash)) {
          throw new Error("계정 잔액 데이터에 오류가 있습니다.");
        }
        if (
          typeof rawTeacherCash !== "number" ||
          !Number.isFinite(rawTeacherCash)
        ) {
          throw new Error("은행 계정 잔액 데이터에 오류가 있습니다.");
        }

        const balance = Number(p.balance);
        const rate = Number(p.rate);
        const termInDays = Number(p.termInDays);
        // rate·termInDays 유한수 강제 + rate 음수 거부(위조 rate<0이면 (1+rate/100)^term이 음수/발산 →
        //   total 음수·Infinity·NaN으로 inc가 잘못된 방향 이동/민팅 가능). balance 음수 거부.
        if (!Number.isFinite(balance) || balance < 0) {
          throw new Error("상품 잔액 데이터에 오류가 있습니다.");
        }
        if (
          !Number.isFinite(rate) ||
          rate < 0 ||
          !Number.isFinite(termInDays)
        ) {
          throw new Error("상품 이율/기간 데이터에 오류가 있습니다.");
        }
        const isSavings = type === "savings" && Number(p.dailyAmount) > 0;

        let studentDelta;
        let interest = 0;
        let total = 0;
        let refundAmount = 0;
        let logType;
        let logAmount;
        if (mode === "maturity") {
          // 만기 도달 검증(클라 isMatured와 동일 — KST 달력일 비교) — 조기 만기 민팅 차단.
          //   maturityDate가 위조된 비정상값(문자열 등)이면 Invalid Date라 NaN 비교가 항상 false가 되어
          //   검증이 무력화되므로 isNaN 가드로 명시 거부(HIGH).
          const mts = p.maturityDate;
          const mdate = mts?.toDate
            ? mts.toDate()
            : mts
              ? new Date(mts)
              : null;
          if (!mdate || isNaN(mdate.getTime())) {
            throw new Error("상품 만기일 데이터에 오류가 있습니다.");
          }
          if (kstStartOfDayMs(new Date()) < kstStartOfDayMs(mdate)) {
            throw new Error("아직 만기가 도래하지 않았습니다.");
          }
          if (isSavings) {
            const rr = calcSavingsInterest(
              Number(p.dailyAmount),
              rate,
              termInDays,
              termInDays,
            );
            total = rr.total;
            interest = rr.interest;
            // 미납 회차 일괄 차감(구 동작 보존 — 전체 납입 정산).
            //   depositsCount·dailyAmount는 위조 가능 필드라 clamp: depositsCount는 [0, term]로 제한(음수면
            //   arrears 과다차감, term 초과면 무의미), dailyAmount는 유한·비음수만.
            const depositsCount = Math.min(
              termInDays,
              Math.max(0, Number(p.depositsCount) || 0),
            );
            const safeDaily = Math.max(0, Number(p.dailyAmount) || 0);
            const missing = Math.max(0, termInDays - depositsCount);
            const arrears = missing * safeDaily;
            studentDelta = total - arrears;
          } else {
            const rr = calcCompoundInterest(balance, rate, termInDays);
            total = rr.total;
            interest = rr.interest;
            studentDelta = total;
          }
          logType = "예금 만기";
          logAmount = total;
        } else {
          // cancel: 원금만 환불(무이자). 적금=totalDeposited, 예금=balance.
          refundAmount =
            type === "savings" && Number(p.totalDeposited)
              ? Number(p.totalDeposited)
              : balance;
          if (!Number.isFinite(refundAmount) || refundAmount < 0) {
            throw new Error("환불 금액 계산에 오류가 있습니다.");
          }
          studentDelta = refundAmount;
          total = refundAmount;
          logType = "예금 출금";
          logAmount = refundAmount;
        }

        // 계산된 이동액 유한성 강제(rate/term 극단 위조로 Infinity/NaN이 되면 inc가 잔액을 오염).
        if (!Number.isFinite(studentDelta)) {
          throw new Error("지급액 계산에 오류가 있습니다.");
        }
        // cash 이동: 선생님(국고) → 학생 (studentDelta). 마이너스 국고 허용(구 동작 보존).
        transaction.update(userRef, {
          cash: inc(studentDelta),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(teacherRef, {
          cash: inc(-studentDelta),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.delete(productRef);
        markIdempotent(transaction, keyRef);

        // 활동로그(최상위 amount로 거래내역 표시 보존)
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 90);
        transaction.set(db.collection("activity_logs").doc(), {
          classCode,
          userId: uid,
          userName: userDoc.data().name || userData.name || "사용자",
          type: logType,
          description:
            mode === "maturity"
              ? `${p.name || "상품"} 만기 수령 (원금: ${balance.toLocaleString()}, 이자: ${interest.toLocaleString()}) - 선생님 계정에서`
              : `중도 해지: ${p.name || "상품"} (원금 ${refundAmount.toLocaleString()}원) - 선생님 계정에서`,
          amount: logAmount,
          couponAmount: 0,
          metadata: {
            productName: p.name || "",
            productType: type,
            principal: balance,
            interest,
            total,
            teacherId,
            ...(mode === "cancel" && { isEarlyCancellation: true }),
          },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        });
        resultInfo = { total, interest, studentDelta };
      });
      return { success: true, ...resultInfo };
    } catch (error) {
      logger.error(`[redeemDepositSavings] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "처리에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔥 대출 상환 (2026-07-17 CF 이관 — ParkingAccount handleLoanLumpSumRepay/handleLoanInstallmentRepay +
//    handleMaturity 대출 브랜치 대체). mode: lumpSum(경과이자 전액)·installment(부분)·maturity(만기 full-term 강제).
//    - 이자를 저장 product(balance·rate·startDate·lastRepaymentDate·termInDays)에서 서버 재계산.
//    - 방향=학생→선생님(국고). lumpSum/installment는 현금부족 거부, maturity는 마이너스 허용(강제상환 보존).
//    - installment만 incoming 24h 쿨다운(돌려막기)·완납 시 lastLoanRepaidAt 기록(구 동작 보존 — lumpSum/
//      maturity는 쿨다운 미기록=구 핸들러 그대로). teacherId "/"·반경계 검증(민팅 차단). 단일 tx·멱등·로그.
// ===================================================================================
exports.repayLoan = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { productId, mode, amount, splitMethod, idempotencyKey } =
    request.data || {};

  if (!productId || typeof productId !== "string" || productId.includes("/")) {
    throw new HttpsError("invalid-argument", "상품 ID가 올바르지 않습니다.");
  }
  if (mode !== "lumpSum" && mode !== "installment" && mode !== "maturity") {
    throw new HttpsError("invalid-argument", "유효하지 않은 상환 유형입니다.");
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
  }
  if (!classCode) {
    throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
  }
  let reqAmount = 0;
  if (mode === "installment") {
    reqAmount = Math.round(Number(amount));
    if (
      !Number.isFinite(reqAmount) ||
      reqAmount <= 0 ||
      reqAmount > 10000000000
    ) {
      throw new HttpsError("invalid-argument", "상환 금액이 올바르지 않습니다.");
    }
  }
  const safeSplit = splitMethod === "proportional" ? "proportional" : "interestFirst";

  const userRef = db.collection("users").doc(uid);
  const productRef = userRef.collection("products").doc(productId);
  const inc = admin.firestore.FieldValue.increment;
  const sts = () => admin.firestore.FieldValue.serverTimestamp();

  try {
    let resultInfo = null;
    await db.runTransaction(async (transaction) => {
      // 읽기 먼저 — 멱등키 → 대출(권위값) → 사용자 → 교사
      const keyRef = await checkIdempotent(transaction, idempotencyKey);
      const productDoc = await transaction.get(productRef);
      if (!productDoc.exists) throw new Error("대출 정보를 찾을 수 없습니다.");
      const p = productDoc.data();
      if (p.type !== "loan") throw new Error("대출 상품이 아닙니다.");

      // teacherId "/" 경로주입 차단 + 레거시 미기록(실측 다수) 시 findApprovedAdminSnap 폴백
      //   (구 클라 getTeacherAccount 대응 — 재조회 결과는 같은 학급 승인 관리자라 반경계 안전).
      let teacherId = p.teacherId;
      if (teacherId) {
        if (typeof teacherId !== "string" || teacherId.includes("/")) {
          throw new Error("상품에 연결된 은행 계정이 올바르지 않습니다.");
        }
      } else {
        const adminSnap = await findApprovedAdminSnap(classCode);
        if (adminSnap.empty) {
          throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
        }
        teacherId = adminSnap.docs[0].id;
      }
      if (teacherId === uid) {
        throw new Error("관리자 계정으로는 처리할 수 없습니다.");
      }
      const teacherRef = db.collection("users").doc(teacherId);

      const userDoc = await transaction.get(userRef);
      const teacherDoc = await transaction.get(teacherRef);
      if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
      if (!teacherDoc.exists) {
        throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
      }
      const uData = userDoc.data();
      const tData = teacherDoc.data();
      // 국고 반경계 검증(redeemDepositSavings와 동일 — teacherId 위조/경로주입 민팅 차단)
      if (tData.classCode !== classCode || !hasAdminPower(tData)) {
        throw new Error("유효한 은행(관리자) 계정이 아닙니다.");
      }
      const rawCash = uData.cash;
      if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) {
        throw new Error("계정 잔액 데이터에 오류가 있습니다.");
      }
      if (typeof tData.cash !== "number" || !Number.isFinite(tData.cash)) {
        throw new Error("은행 계정 잔액 데이터에 오류가 있습니다.");
      }

      const balance = Number(p.balance);
      const rate = Number(p.rate);
      const termInDays = Number(p.termInDays);
      if (!Number.isFinite(balance) || balance < 0) {
        throw new Error("대출 잔액 데이터에 오류가 있습니다.");
      }
      // rate 음수 거부 — rate<0이면 (1+rate/100)^term이 음수가 되어 repayAmount 음수 → inc(-음수)로 학생
      //   cash가 증가하는 민팅 벡터(codex 지적). termInDays 유한수 강제.
      if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(termInDays)) {
        throw new Error("대출 이율/기간 데이터에 오류가 있습니다.");
      }

      // installment만 incoming 24h 쿨다운(구 handleLoanInstallmentRepay 동작 — 송금 돌려막기 차단)
      if (mode === "installment") {
        const li = uData.lastIncomingTransferAt;
        const liMs = li?.toMillis
          ? li.toMillis()
          : li
            ? new Date(li).getTime()
            : null;
        if (liMs && Number.isFinite(liMs)) {
          const elapsed = Date.now() - liMs;
          const COOLDOWN = 24 * 60 * 60 * 1000;
          if (elapsed >= 0 && elapsed < COOLDOWN) {
            const remainingH = Math.ceil((COOLDOWN - elapsed) / (60 * 60 * 1000));
            throw new Error(
              `친구로부터 송금받은 후 24시간이 지나야 대출 상환이 가능합니다. (남은 시간: ${remainingH}시간)`,
            );
          }
        }
      }

      let repayAmount;
      let interestPortion = 0;
      let principalPortion = 0;
      let newBalance = 0;
      let isFullyRepaid = true;
      let accruedInterest = 0;
      let elapsedDays = 0;

      if (mode === "maturity") {
        // 만기 강제 상환 = 원금 + full-term 이자(calcCompoundInterest). 마이너스 허용(강제상환은 현금부족도 진행).
        //   조기 강제상환(현금검사 우회·자기 마이너스화 그리핑)을 막기 위해 만기도래(KST) 서버검증 추가
        //   (redeemDepositSavings와 대칭·codex HIGH). 수동 '만기 상환' 버튼은 UI상 만기 후에만 노출되고
        //   자동상환 훅(useAutoLoanRepay)은 이 CF를 쓰지 않으므로 정상경로 무영향.
        const mts = p.maturityDate;
        const mdate = mts?.toDate ? mts.toDate() : mts ? new Date(mts) : null;
        if (!mdate || isNaN(mdate.getTime())) {
          throw new Error("상품 만기일 데이터에 오류가 있습니다.");
        }
        if (kstStartOfDayMs(new Date()) < kstStartOfDayMs(mdate)) {
          throw new Error("아직 만기가 도래하지 않았습니다.");
        }
        const rr = calcCompoundInterest(balance, rate, termInDays);
        repayAmount = rr.total;
        accruedInterest = rr.interest;
      } else {
        // lumpSum/installment = 경과이자 기준
        const acc = calcAccruedLoanInterest(
          balance,
          rate,
          p.startDate,
          p.lastRepaymentDate,
        );
        accruedInterest = acc.interest;
        elapsedDays = acc.elapsedDays;
        const accruedTotal = acc.total;
        if (mode === "lumpSum") {
          repayAmount = accruedTotal;
          if (rawCash < repayAmount) throw new Error("상환금이 부족합니다.");
        } else {
          repayAmount = reqAmount;
          if (repayAmount > accruedTotal) {
            throw new Error("상환 금액이 총 상환금을 초과합니다.");
          }
          if (rawCash < repayAmount) throw new Error("상환금이 부족합니다.");
          if (safeSplit === "proportional" && accruedTotal > 0) {
            const ratio = accruedInterest / accruedTotal;
            interestPortion = Math.round(repayAmount * ratio);
            principalPortion = repayAmount - interestPortion;
            if (principalPortion > balance) {
              principalPortion = balance;
              interestPortion = repayAmount - principalPortion;
            }
          } else {
            interestPortion = Math.min(repayAmount, accruedInterest);
            principalPortion = Math.max(0, repayAmount - interestPortion);
          }
          newBalance = Math.max(0, balance - principalPortion);
          isFullyRepaid = newBalance <= 0 && repayAmount >= accruedTotal;
        }
      }

      // 계산된 상환액 유한·비음수 강제(rate/term/balance 극단 위조로 Infinity/NaN/음수가 되면 inc가
      //   잔액을 오염하거나 학생 cash를 증가시키는 역방향 이동을 유발). repayAmount는 항상 ≥0이어야 함.
      if (!Number.isFinite(repayAmount) || repayAmount < 0) {
        throw new Error("상환액 계산에 오류가 있습니다.");
      }
      // cash 이동: 학생 → 선생님(국고)
      transaction.update(userRef, {
        cash: inc(-repayAmount),
        updatedAt: sts(),
        // installment 완납 시에만 쿨다운 기록(구 동작 보존 — lumpSum/maturity는 미기록)
        ...(mode === "installment" && isFullyRepaid
          ? { lastLoanRepaidAt: sts() }
          : {}),
      });
      transaction.update(teacherRef, { cash: inc(repayAmount), updatedAt: sts() });

      if (mode === "installment" && !isFullyRepaid) {
        transaction.update(productRef, {
          balance: newBalance,
          lastRepaymentDate: sts(),
          totalInterestPaid: inc(interestPortion),
        });
      } else {
        transaction.delete(productRef);
      }
      markIdempotent(transaction, keyRef);

      const desc =
        mode === "maturity"
          ? `대출 만기 상환: ${p.name || "대출"} (원금: ${balance.toLocaleString()}, 이자: ${accruedInterest.toLocaleString()}) - 선생님 계정으로`
          : mode === "lumpSum"
            ? `대출 일시 상환: ${p.name || "대출"} (원금: ${balance.toLocaleString()}, 이자: ${accruedInterest.toLocaleString()}, 경과: ${elapsedDays}일)`
            : `대출 분할 상환: ${p.name || "대출"} (이자: ${interestPortion.toLocaleString()}, 원금: ${principalPortion.toLocaleString()}, 남은 원금: ${newBalance.toLocaleString()})`;
      const expireAt = new Date();
      expireAt.setDate(expireAt.getDate() + 90);
      transaction.set(db.collection("activity_logs").doc(), {
        classCode,
        userId: uid,
        userName: uData.name || userData.name || "사용자",
        type: "대출 상환",
        description: desc,
        amount: -repayAmount,
        couponAmount: 0,
        metadata: {
          productName: p.name || "",
          principal: balance,
          interest: accruedInterest,
          total: repayAmount,
          mode,
          teacherId,
          ...(mode === "installment" && {
            interestPaid: interestPortion,
            principalPaid: principalPortion,
            remainingBalance: newBalance,
            isFullyRepaid,
            splitMethod: safeSplit,
          }),
        },
        timestamp: sts(),
        createdAt: sts(),
        expireAt: admin.firestore.Timestamp.fromDate(expireAt),
      });
      resultInfo = { repayAmount, interest: accruedInterest, newBalance, isFullyRepaid };
    });
    return { success: true, ...resultInfo };
  } catch (error) {
    logger.error(`[repayLoan] Error for user ${uid}:`, error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("aborted", error.message || "대출 상환에 실패했습니다.");
  }
});

// ===================================================================================
// 🔥 적금 일일 자동 납입 (2026-07-17 CF 이관 — useAutoSavingsDeposit 클라 runTransaction 대체).
//    가입일~오늘 경과일만큼 회차(dailyAmount)를 학생→선생님(국고) catch-up 납입, depositsCount/
//    totalDeposited 갱신. ⚠️ 멱등키를 쓰지 않는다: 같은 날 여러 번 발동해 부분납입(현금 한도)→추가납입
//    (현금 충전 후)하는 게 정상이라 고정키로 재실행을 막으면 topup이 깨진다. 대신 트랜잭션 내부에서
//    depositsCount를 재읽어 expected(가입후경과+1, term 상한) 이내로만 납입 → 이중납입/초과납입 원천 차단
//    (동시 발동은 트랜잭션 재시도로 두 번째가 curCount 갱신본을 재읽어 no-op). 학생 잔액 한도 내에서만
//    (마이너스 없음). teacherId "/"·반경계 검증·타입가드는 다른 은행 CF와 동일. batch6 rules 잠금 대비.
// ===================================================================================
exports.autoSavingsDeposit = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { productId } = request.data || {};

    if (!productId || typeof productId !== "string" || productId.includes("/")) {
      throw new HttpsError("invalid-argument", "상품 ID가 올바르지 않습니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const userRef = db.collection("users").doc(uid);
    const productRef = userRef.collection("products").doc(productId);
    const inc = admin.firestore.FieldValue.increment;
    const sts = () => admin.firestore.FieldValue.serverTimestamp();

    try {
      let resultInfo = { added: 0 };
      await db.runTransaction(async (transaction) => {
        // 읽기 먼저 — 상품(권위값). need<=0(오늘치 이미 납입)이면 여기서 종료해 user/teacher 읽기를
        //   생략(no-op 스팸 호출의 read 비용·contention 절감 — codex H-1).
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) throw new Error("적금 정보를 찾을 수 없습니다.");
        const p = productDoc.data();
        if (p.type !== "savings") throw new Error("적금 상품이 아닙니다.");

        // 저장값 정수·양수 강제(위조 소수/음수 방어 — 소수 회차·금액 기록 차단). legit 상품은
        //   subscribeProduct가 정수로 기록하므로 floor는 무해. 손상/미설정은 조용히 no-op(구 훅 continue와 동일).
        const dailyAmount = Math.floor(Number(p.dailyAmount));
        const termInDays = Math.floor(Number(p.termInDays));
        if (!Number.isFinite(dailyAmount) || dailyAmount <= 0) {
          resultInfo = { added: 0 };
          return;
        }
        if (!Number.isFinite(termInDays) || termInDays <= 0) {
          resultInfo = { added: 0 };
          return;
        }
        const startRaw = p.startDate;
        const startDate = startRaw?.toDate
          ? startRaw.toDate()
          : startRaw
            ? new Date(startRaw)
            : null;
        if (!startDate || isNaN(startDate.getTime())) {
          throw new Error("가입일 데이터에 오류가 있습니다.");
        }

        // 가입일부터 오늘까지 경과일(KST) → 납입해야 할 누적 회차(가입 당일=1회차). term 상한.
        const daysSinceStart = kstDiffCalendarDays(new Date(), startDate);
        const expected = Math.min(Math.max(1, daysSinceStart + 1), termInDays);
        const curCount = Math.max(0, Math.floor(Number(p.depositsCount) || 0));
        const need = expected - curCount;
        if (need <= 0) {
          // 오늘치까지 이미 납입됨 — user/teacher 읽기 없이 종료(no-op).
          resultInfo = { added: 0 };
          return;
        }

        // 납입 필요 확정 → 교사(국고) 특정 + user/teacher 읽기.
        // teacherId "/" 경로주입 차단 + 레거시 미기록 폴백(findApprovedAdminSnap)
        let teacherId = p.teacherId;
        if (teacherId) {
          if (typeof teacherId !== "string" || teacherId.includes("/")) {
            throw new Error("상품에 연결된 은행 계정이 올바르지 않습니다.");
          }
        } else {
          const adminSnap = await findApprovedAdminSnap(classCode);
          if (adminSnap.empty) {
            throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
          }
          teacherId = adminSnap.docs[0].id;
        }
        if (teacherId === uid) {
          throw new Error("관리자 계정으로는 처리할 수 없습니다.");
        }
        const teacherRef = db.collection("users").doc(teacherId);

        const userDoc = await transaction.get(userRef);
        const teacherDoc = await transaction.get(teacherRef);
        if (!userDoc.exists) throw new Error("사용자 정보가 없습니다.");
        if (!teacherDoc.exists) {
          throw new Error("선생님(은행) 계정을 찾을 수 없습니다.");
        }
        const uData = userDoc.data();
        const tData = teacherDoc.data();
        if (tData.classCode !== classCode || !hasAdminPower(tData)) {
          throw new Error("유효한 은행(관리자) 계정이 아닙니다.");
        }
        const rawCash = uData.cash;
        if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) {
          throw new Error("계정 잔액 데이터에 오류가 있습니다.");
        }
        if (typeof tData.cash !== "number" || !Number.isFinite(tData.cash)) {
          throw new Error("은행 계정 잔액 데이터에 오류가 있습니다.");
        }

        // 학생 잔액 한도 내에서만 납입(마이너스 없음). affordable·amount는 정수(dailyAmount 정수 보장).
        const affordable = Math.min(need, Math.floor(rawCash / dailyAmount));
        if (affordable <= 0) {
          resultInfo = { added: 0, reason: "insufficient_cash" };
          return;
        }
        const amount = dailyAmount * affordable;

        transaction.update(userRef, {
          cash: inc(-amount),
          updatedAt: sts(),
        });
        transaction.update(teacherRef, { cash: inc(amount), updatedAt: sts() });
        transaction.update(productRef, {
          depositsCount: inc(affordable),
          totalDeposited: inc(amount),
          lastAutoDepositDate: sts(),
        });

        // 활동로그(최상위 amount로 거래내역 표시 보존)
        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 90);
        transaction.set(db.collection("activity_logs").doc(), {
          classCode,
          userId: uid,
          userName: uData.name || userData.name || "사용자",
          type: "예금 가입",
          description: `${p.name || "적금"} 적금 자동 납입 (${affordable}회차 × ${dailyAmount.toLocaleString()} = ${amount.toLocaleString()}) - 선생님 계정으로`,
          amount: -amount,
          couponAmount: 0,
          metadata: {
            productName: p.name || "",
            productType: "savings",
            dailyAmount,
            installmentCount: affordable,
            teacherId,
            depositType: "auto",
          },
          timestamp: sts(),
          createdAt: sts(),
          expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        });
        resultInfo = { added: affordable, amount };
      });
      return { success: true, ...resultInfo };
    } catch (error) {
      logger.error(`[autoSavingsDeposit] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "적금 자동 납입에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔥 관리자 지급/회수 (2026-07-17 CF 이관 — MoneyTransfer의 클라 adminCashAction 대체)
//   - 권한: 서버에서 관리자(hasAdminPower) 또는 위임(delegatedPermissions.moneyTransfer) 강제.
//     클라가 넘기던 adminId/adminClassCode를 신뢰하지 않고 auth·userData에서 파생.
//   - 기존 동작 정확 보존: send=학생 cash 증가(관리자 cash는 DB 미차감=학급경제 민팅 모델),
//     take/toMe=학생 차감+국고(관리자) 적립, take/remove=학생 차감만. 세금은 send에만(학생 수령액 감소).
//     percentage면 baseAmount=floor(cash*pct/100), ≤0이면 해당 학생 skip. 마이너스 cash 허용.
//   - 🔧 절대값 덮어쓰기(cash:newCash) → increment(±)로 교체(레이스 수정, financial-saas 룰#2).
//   - 멱등: 대상별 `${key}_${targetId}` 서브키(대량 처리 중 일부만 재시도돼도 이중적용 차단, 이미
//     처리분은 graceful skip). 같은 학급만. 로그/거래기록(root transactions=거래내역 표시원) 보존.
// ===================================================================================
exports.adminCashAction = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const {
    targetUserIds,
    action,
    takeMode,
    amountType,
    amount,
    taxRate = 0,
    idempotencyKey,
  } = request.data;

  // 1) 권한: 관리자 또는 위임(moneyTransfer) — 서버 강제
  const isAdmin = hasAdminPower(userData);
  const isDelegated =
    !isAdmin && userData.delegatedPermissions?.moneyTransfer === true;
  if (!isAdmin && !isDelegated) {
    throw new HttpsError(
      "permission-denied",
      "관리자 또는 위임된 학생만 사용할 수 있습니다.",
    );
  }

  // 2) 입력 검증
  if (
    !Array.isArray(targetUserIds) ||
    targetUserIds.length === 0 ||
    targetUserIds.length > 200 ||
    targetUserIds.some((id) => typeof id !== "string" || !id)
  ) {
    throw new HttpsError("invalid-argument", "대상 학생 목록이 올바르지 않습니다.");
  }
  if (action !== "send" && action !== "take") {
    throw new HttpsError("invalid-argument", "action이 올바르지 않습니다.");
  }
  if (action === "take" && takeMode !== "toMe" && takeMode !== "remove") {
    throw new HttpsError("invalid-argument", "회수 방식이 올바르지 않습니다.");
  }
  if (amountType !== "fixed" && amountType !== "percentage") {
    throw new HttpsError("invalid-argument", "금액 유형이 올바르지 않습니다.");
  }
  if (amountType === "percentage") {
    if (typeof amount !== "number" || !(amount >= 0 && amount <= 100)) {
      throw new HttpsError("invalid-argument", "퍼센트는 0~100 사이여야 합니다.");
    }
  } else if (
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 10000000000
  ) {
    throw new HttpsError("invalid-argument", "금액은 1 이상의 정수여야 합니다.");
  }
  const safeTaxRate =
    action === "send" &&
    typeof taxRate === "number" &&
    Number.isFinite(taxRate) &&
    taxRate > 0
      ? Math.min(taxRate, 100)
      : 0;

  // 3) 국고(=관리자 cash) 대상: 위임이면 승인 관리자, 아니면 본인
  let effectiveAdminId = uid;
  let effectiveAdminName = userData.name;
  if (isDelegated) {
    const adminSnap = await findApprovedAdminSnap(classCode);
    if (adminSnap.empty) {
      throw new HttpsError("failed-precondition", "학급 관리자(국고)를 찾을 수 없습니다.");
    }
    effectiveAdminId = adminSnap.docs[0].id;
    effectiveAdminName = adminSnap.docs[0].data().name || "관리자";
  }

  const increment = admin.firestore.FieldValue.increment;
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
  const updatedUsers = [];
  const failures = [];
  let totalProcessed = 0;
  let successCount = 0;

  // 4) 대상별 트랜잭션(원자적, 대상별 멱등).
  //    - 자기참조 방지(트랜잭션 전 skip): ① 위임 학생이 자기 자신 대상 = 자기 cash 조작(민팅/회수)
  //      차단(방어심층화) ② take/toMe에서 대상==국고(관리자) 본인 = 자기→자기 회수 net 0 no-op
  //      (구현 버그 방지: 차감만 되고 적립 skip돼 관리자 cash가 파괴되던 케이스).
  //    - 오류 처리: 이미 처리분(already-exists)은 skip, 그 외 per-target 오류는 전체 중단 대신
  //      failures에 수집하고 계속(부분성공 보고 — 한 학생 데이터 문제로 배치 전체가 깨지지 않게).
  for (const targetId of targetUserIds) {
    if (isDelegated && targetId === uid) continue;
    if (action === "take" && takeMode === "toMe" && targetId === effectiveAdminId) {
      continue;
    }
    try {
      const result = await db.runTransaction(async (tx) => {
        const perKey = idempotencyKey ? `${idempotencyKey}_${targetId}` : undefined;
        // 읽기 먼저: 멱등키 → 대상 유저 → (toMe면) 관리자
        const keyRef = await checkIdempotent(tx, perKey);
        const userRef = db.collection("users").doc(targetId);
        const userDoc = await tx.get(userRef);
        // 위 self-target skip으로 toMe는 targetId!==effectiveAdminId 보장.
        const needAdminCredit = action === "take" && takeMode === "toMe";
        const adminRef = needAdminCredit
          ? db.collection("users").doc(effectiveAdminId)
          : null;
        const adminDoc = adminRef ? await tx.get(adminRef) : null;

        if (!userDoc.exists) throw new Error("사용자를 찾을 수 없습니다.");
        const tData = userDoc.data();
        // 같은 학급만(학급 밖 cash 조작 차단)
        if (tData.classCode !== classCode) {
          throw new Error("같은 학급의 학생만 처리할 수 있습니다.");
        }
        const rawCash = tData.cash;
        if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) {
          throw new Error("학생 잔액 데이터에 오류가 있습니다.");
        }
        const currentCash = rawCash;

        // 금액 산정
        const baseAmount =
          amountType === "percentage"
            ? Math.floor((currentCash * amount) / 100)
            : amount;
        if (baseAmount <= 0) {
          // 처리할 금액 없음(예: 음수 cash의 퍼센트) → skip(멱등 마킹도 하지 않음: 재시도 시 재평가)
          return;
        }
        let taxAmount = 0;
        let finalAmount = baseAmount;
        if (action === "send" && safeTaxRate > 0) {
          taxAmount = Math.floor((baseAmount * safeTaxRate) / 100);
          finalAmount = baseAmount - taxAmount;
        }

        let newCash;
        if (action === "send") {
          newCash = currentCash + finalAmount;
          tx.update(userRef, { cash: increment(finalAmount), updatedAt: serverTimestamp() });
        } else {
          // take (toMe/remove 공통): 학생 차감(마이너스 허용)
          newCash = currentCash - baseAmount;
          tx.update(userRef, { cash: increment(-baseAmount), updatedAt: serverTimestamp() });
        }
        // toMe: 국고(관리자) 적립. 대상==관리자 본인은 위에서 skip됨(항상 별도 문서).
        //   ⚠️ 국고 문서가 없으면 학생 차감만 커밋되고 적립이 누락돼 현금이 소각된다(TOCTOU:
        //   사전조회 후 관리자 삭제/승인취소 경합) → fail-closed로 throw해 학생 차감까지 롤백.
        if (needAdminCredit) {
          if (!adminDoc || !adminDoc.exists) {
            throw new Error("국고(관리자) 계정을 찾을 수 없어 회수를 취소합니다.");
          }
          // 사전조회 후 관리자가 전학/변경됐을 수 있으니 tx 내부에서 같은 학급인지 재확인(fail-closed).
          if (adminDoc.data().classCode !== classCode) {
            throw new Error("국고(관리자) 계정이 유효하지 않아 회수를 취소합니다.");
          }
          tx.update(adminRef, { cash: increment(baseAmount), updatedAt: serverTimestamp() });
        }

        // 로그/거래기록(기존 shape 보존). 거래내역 UI는 root transactions(top-level amount)를 읽는다.
        let logType;
        let logDescription;
        if (action === "send") {
          logType = "ADMIN_CASH_SEND";
          logDescription =
            amountType === "percentage"
              ? `관리자(${effectiveAdminName})가 ${tData.name}님에게 ${amount}% (${finalAmount.toLocaleString()}원)을 지급했습니다.`
              : `관리자(${effectiveAdminName})가 ${tData.name}님에게 ${finalAmount.toLocaleString()}원을 지급했습니다.`;
          if (taxAmount > 0) {
            logDescription += ` (원금 ${baseAmount.toLocaleString()}원, 세금 ${taxAmount.toLocaleString()}원 제외)`;
          }
        } else if (takeMode === "remove") {
          logType = "ADMIN_CASH_REMOVE";
          logDescription =
            amountType === "percentage"
              ? `관리자(${effectiveAdminName})가 ${tData.name}님의 ${amount}% (${baseAmount.toLocaleString()}원)을 제거했습니다.`
              : `관리자(${effectiveAdminName})가 ${tData.name}님의 ${baseAmount.toLocaleString()}원을 제거했습니다.`;
        } else {
          logType = "ADMIN_CASH_TAKE";
          logDescription =
            amountType === "percentage"
              ? `관리자(${effectiveAdminName})가 ${tData.name}님으로부터 ${amount}% (${baseAmount.toLocaleString()}원)을 회수했습니다.`
              : `관리자(${effectiveAdminName})가 ${tData.name}님으로부터 ${baseAmount.toLocaleString()}원을 회수했습니다.`;
        }

        const expireAt = new Date();
        expireAt.setDate(expireAt.getDate() + 90);
        // ⚠️ 최상위 amount를 넣지 않는다(원본 shape 보존): 거래내역 표시는 아래 root
        //    transactions가 담당하고, activity_logs까지 top-level amount를 가지면 MyAssets가
        //    두 소스를 모두 읽어 관리자 거래가 2건으로 중복 표시됨(weekKey 없어 dedup 안 됨).
        tx.set(db.collection("activity_logs").doc(), {
          userId: targetId,
          userName: tData.name,
          timestamp: serverTimestamp(),
          type: logType,
          description: sanitizeInput(logDescription),
          classCode,
          metadata: {
            adminName: effectiveAdminName,
            issuedBy: uid,
            action,
            amountType,
            inputValue: amount,
            taxRate: action === "send" ? safeTaxRate : 0,
            baseAmount,
            taxAmount,
            finalAmount,
            previousCash: currentCash,
            newCash,
          },
          expireAt: admin.firestore.Timestamp.fromDate(expireAt),
        });
        tx.set(db.collection("transactions").doc(), {
          userId: targetId,
          amount: action === "send" ? finalAmount : -baseAmount,
          type: action === "send" ? "income" : "expense",
          category: "admin",
          description: action === "send" ? "관리자 지급" : "관리자 회수",
          timestamp: serverTimestamp(),
          metadata: {
            adminName: effectiveAdminName,
            issuedBy: uid,
            amountType,
            taxRate: action === "send" ? safeTaxRate : 0,
          },
        });

        markIdempotent(tx, keyRef);
        // ⚠️ 카운터/배열 집계는 콜백 밖에서. runTransaction 콜백은 경합 시 재실행되므로
        //    여기서 push/증가하면 커밋 1회여도 응답 카운트가 중복 집계된다 → 결과만 반환.
        return { processed: true, newCash, baseAmount };
      });
      // 트랜잭션이 커밋(1회 확정)된 후에만 집계.
      if (result && result.processed) {
        updatedUsers.push({ id: targetId, newCash: result.newCash });
        totalProcessed += result.baseAmount;
        successCount++;
      }
    } catch (error) {
      // 이미 처리된 대상(멱등 재시도)은 조용히 skip. 그 외 per-target 오류는 전체 중단 대신
      // failures에 담고 계속 — 한 학생 데이터 문제가 배치 전체를 롤백/중단시키지 않게(부분성공).
      const code = error instanceof HttpsError ? error.code : "";
      if (code === "already-exists") continue;
      logger.error(`[adminCashAction] ${uid} → ${targetId} 처리 오류:`, error);
      failures.push({ id: targetId, reason: error.message || "처리 실패" });
    }
  }

  return { count: successCount, totalProcessed, updatedUsers, failures };
});

// ===================================================================================
// 🎵 음악 신청 결제 (2026-07-17 배치6-a CF 이관 — StudentRequest 클라 runTransaction 대체)
//   - 구 클라: 학생 cash 차감 + 선생님 cash 적립 + activity_logs 2건 + playlist 곡등록을
//     한 트랜잭션으로. 학생·선생님 cash 직접 write = batch7 cash rules 잠금 대상 → CF 이관.
//   - 보안설계: 가격(pricePerSong)·수취인(teacherId)을 클라 입력이 아닌 서버 room 문서에서 재조회.
//     클라는 화면에 표시했던 값(expectedPricePerSong/expectedTeacherId)만 넘겨 stale 결제 차단(ROOM_CHANGED).
//   - requestCost = 서버계산(우선신청권이면 ceil(price*1.5)). isPriority/paidAmount는 서버가 곡 문서에 기록
//     (클라가 결제 없이 isPriority·paidAmount 위조하던 창을 결제와 원자적으로 묶어 차단).
//   - 무료 방(price<=0)은 cash 이동이 없어 클라 addDoc 유지(이 CF는 유료 결제 전용).
//   - 거래내역 보존: 구 클라와 동일하게 activity_logs 최상위 amount 직접 기록(MyAssets 자산 거래내역 소스).
// ===================================================================================
exports.requestMusicPayment = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, userData } = await checkAuthAndGetUserData(request);
    const {
      roomId,
      videoId,
      videoTitle = "",
      isPriority = false,
      isAnonymous = false,
      story = "",
      requesterName = "",
      expectedPricePerSong,
      expectedTeacherId,
      idempotencyKey,
    } = request.data || {};

    // 🔒 필수 인자·경로주입 방어
    if (!roomId || typeof roomId !== "string" || roomId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 방 정보가 필요합니다.");
    }
    if (
      !videoId ||
      typeof videoId !== "string" ||
      videoId.includes("/") ||
      videoId.length > 128
    ) {
      throw new HttpsError("invalid-argument", "유효한 영상 정보가 필요합니다.");
    }
    // 🔒 boolean 엄격 강제(codex: "0"·"false" 같은 truthy 문자열 위조 차단).
    const priority = isPriority === true;
    const anonymous = isAnonymous === true;
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    if (
      typeof expectedTeacherId !== "string" ||
      !expectedTeacherId ||
      expectedTeacherId.includes("/")
    ) {
      throw new HttpsError("invalid-argument", "수취인 정보가 올바르지 않습니다.");
    }
    if (uid === expectedTeacherId) {
      throw new HttpsError("invalid-argument", "자기 자신에게는 신청할 수 없습니다.");
    }

    const roomRef = db.collection("musicRooms").doc(roomId);
    const studentRef = db.collection("users").doc(uid);
    const teacherRef = db.collection("users").doc(expectedTeacherId);

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 1) 모든 읽기 먼저: 멱등키 → room·학생·선생님
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const [roomSnap, studentSnap, teacherSnap] = await transaction.getAll(
          roomRef,
          studentRef,
          teacherRef,
        );

        if (!roomSnap.exists) throw new Error("방이 삭제되었습니다.");
        const room = roomSnap.data();
        // 서버 권위값 = room 문서. 클라 표시값과 다르면 stale 결제 차단.
        const serverPrice = Number(room.pricePerSong) || 0;
        const serverTeacherId = room.teacherId || "";
        if (serverPrice <= 0) {
          throw new Error("무료 방은 결제가 필요하지 않습니다.");
        }
        // 🔒 정수 강제(transferCash와 일관): 비정수 가격이면 cash에 소수 누적 → 순자산세·주급 등
        //    정수 가정 로직과 불일치. 방 가격은 정수여야 한다.
        if (!Number.isInteger(serverPrice)) {
          throw new Error("방 가격 정보가 올바르지 않습니다.");
        }
        if (
          serverPrice !== Number(expectedPricePerSong) ||
          serverTeacherId !== expectedTeacherId
        ) {
          throw new Error("ROOM_CHANGED");
        }

        // 2) 서버계산 결제액 (우선신청권 = 기본가 + 50%, 올림). 유한·양수 강제.
        const cost = priority ? Math.ceil(serverPrice * 1.5) : serverPrice;
        if (!Number.isFinite(cost) || cost <= 0 || cost > 10000000000) {
          throw new Error("결제 금액이 올바르지 않습니다.");
        }

        if (!studentSnap.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
        if (!teacherSnap.exists) throw new Error("선생님 정보를 찾을 수 없습니다.");
        const studentData = studentSnap.data();
        const teacherData = teacherSnap.data();

        // 3) 반경계: 수취인은 같은 학급의 실제 관리자(선생님)여야 한다(반 밖 유출·학생 수취 차단).
        const studentClassCode = studentData.classCode;
        if (
          !studentClassCode ||
          teacherData.classCode !== studentClassCode ||
          !hasAdminPower(teacherData)
        ) {
          throw new Error("이 방의 수취인 정보가 올바르지 않습니다.");
        }

        // 4) 서버 잔액검증
        const studentCash = Number(studentData.cash) || 0;
        if (studentCash < cost) throw new Error("잔액이 부족합니다.");

        // 5) 양방향 increment (원자적)
        transaction.update(studentRef, {
          cash: admin.firestore.FieldValue.increment(-cost),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(teacherRef, {
          cash: admin.firestore.FieldValue.increment(cost),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 6) 거래내역(activity_logs 최상위 amount) — 구 클라와 동일 형태로 보존.
        const studentName =
          studentData.name || studentData.nickname || "익명";
        const songTitle = (sanitizeInput(String(videoTitle)) || "음악").slice(0, 100);
        const requestLabel = priority ? "음악 우선 신청" : "음악 신청";
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        const studentLogRef = db.collection("activity_logs").doc();
        transaction.set(studentLogRef, {
          userId: uid,
          userName: studentName,
          type: "musicRequest",
          description: `${requestLabel}: "${songTitle}" (-${cost.toLocaleString()}원)`,
          amount: -cost,
          classCode: studentClassCode,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });
        const teacherLogRef = db.collection("activity_logs").doc();
        transaction.set(teacherLogRef, {
          userId: expectedTeacherId,
          userName: "선생님",
          type: "musicRequest",
          description: `${studentName}님의 ${requestLabel} 수익 (+${cost.toLocaleString()}원)`,
          amount: cost,
          classCode: studentClassCode,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });

        // 7) 곡 등록 — 서버가 구성(클라의 isPriority/paidAmount 위조 차단).
        //    결제와 같은 트랜잭션이라 "돈만 빠지고 곡 미등록" 부분실패 없음.
        const trimmedStory = sanitizeInput(String(story)).slice(0, 200);
        const displayName = anonymous
          ? "익명"
          : (sanitizeInput(String(requesterName)).slice(0, 40) || studentName);
        const playlistEntry = {
          videoId,
          title: songTitle,
          requesterName: displayName,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...(anonymous ? { isAnonymous: true } : { requesterId: uid }),
          ...(trimmedStory ? { story: trimmedStory } : {}),
          ...(priority ? { isPriority: true } : {}),
          paidAmount: cost,
        };
        const songRef = roomRef.collection("playlist").doc();
        transaction.set(songRef, playlistEntry);

        markIdempotent(transaction, keyRef);
        return { cost };
      });
      return { success: true, cost: result.cost };
    } catch (error) {
      logger.error(`[requestMusicPayment] Error for user ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      const msg = error.message || "음악 신청에 실패했습니다.";
      // 클라가 분기하는 안정적 코드로 매핑
      if (msg === "ROOM_CHANGED") {
        throw new HttpsError("failed-precondition", "ROOM_CHANGED");
      }
      if (msg === "잔액이 부족합니다.") {
        throw new HttpsError("failed-precondition", msg);
      }
      throw new HttpsError("aborted", msg);
    }
  },
);

// ===================================================================================
// 🏛️ 재판 합의금 지급 (2026-07-17 배치6-b CF 이관 — Court handleSendSettlement 클라 runTransaction 대체)
//   ⚠️ 함수명 = processCourtSettlement (경찰서 합의금 processSettlement(reportId 기반)과 별개 — 개명해 충돌 회피).
//   - 구 클라: sender cash 차감 + recipient cash 적립 + complaint.settlementPaid + activity_logs 2건.
//     sender/recipient는 같은반 임의 유저(cash 직접 write) = batch7 cash rules 잠금 대상 → CF 이관.
//   - 권한: 관리자/교사(hasTeacherPower) OR 판사(jobTitle "판사"). 클라 게이트를 서버에서 강제.
//   - 이중지급 차단 = 서버파생 멱등키(courtsettle_{complaintId}) + settlementPaid 게이트 + complaint OCC.
//     멱등키가 idempotencyKeys 원장(클라 write 불가)이라 settlementPaid를 클라가 되돌려도 재차단.
//   - 자기거래 차단(처리자≠당사자), 판사는 사건 당사자(피고소인→고소인)만·교사는 재량, same-class 강제, 처리자 감사기록.
//   ⚠️ 잔여(batch7 court-lock): courtComplaints의 status/defendantId/complainantId가 아직 클라 위조 가능
//     (rules allow update: isSignedIn && isSameClass) → 가짜 사건 생성 후 settle 드레인은 court-flow
//     서버이관 + courtComplaints rules 잠금으로만 봉인 가능(구 클라도 동일 취약, regression 아님).
// ===================================================================================
exports.processCourtSettlement = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { complaintId, senderId, recipientId, amount } = request.data || {};

    // 🔒 정수·범위·타입·경로주입 검증
    if (
      !complaintId || typeof complaintId !== "string" || complaintId.includes("/") ||
      !senderId || typeof senderId !== "string" || senderId.includes("/") ||
      !recipientId || typeof recipientId !== "string" || recipientId.includes("/") ||
      !Number.isInteger(amount) || amount <= 0 || amount > 10000000000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "합의 정보(당사자·금액 1 이상의 정수)를 정확히 입력해야 합니다.",
      );
    }
    if (senderId === recipientId) {
      throw new HttpsError(
        "invalid-argument",
        "보내는 사람과 받는 사람은 같을 수 없습니다.",
      );
    }
    // 🔒 이해상충 차단(reviewer/Gemini): 처리자(판사/관리자)는 스스로 당사자가 될 수 없다
    //    (판사가 피해자→자기 자신 합의로 자산을 빼돌리는 자기거래 차단).
    if (uid === senderId || uid === recipientId) {
      throw new HttpsError(
        "permission-denied",
        "합의 처리자는 송금자·수금자가 될 수 없습니다.",
      );
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    // 🔒 권한: 관리자/교사(레거시 isTeacher 포함) OR 판사
    const isTeacher = hasTeacherPower(userData);
    let authorized = isTeacher;
    if (!authorized) {
      const jobsSnap = await db
        .collection("jobs")
        .where("classCode", "==", classCode)
        .get();
      authorized = hasJobTitle(userData, buildJobMap(jobsSnap), "판사");
    }
    if (!authorized) {
      throw new HttpsError(
        "permission-denied",
        "합의금 지급 처리 권한은 판사 또는 관리자에게 있습니다.",
      );
    }

    const complaintRef = db
      .collection("classes")
      .doc(classCode)
      .collection("courtComplaints")
      .doc(complaintId);
    const senderRef = db.collection("users").doc(senderId);
    const recipientRef = db.collection("users").doc(recipientId);

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 모든 읽기 먼저: 멱등키 → complaint·sender·recipient
        //    🔒 멱등키 = 서버파생 courtsettle_{complaintId}(클라 UUID 불신). 이중지급 차단이
        //    클라 수정가능 필드(settlementPaid)가 아니라 idempotencyKeys 원장(클라 write 불가)에
        //    의존하게 함 → settlementPaid를 클라가 false로 되돌려 재호출해도 같은 complaint는 재차단.
        const keyRef = await checkIdempotent(
          transaction,
          `courtsettle_${classCode}_${complaintId}`,
        );
        const [complaintDoc, senderDoc, recipientDoc] =
          await transaction.getAll(complaintRef, senderRef, recipientRef);

        if (!complaintDoc.exists) throw new Error("해당 고소 정보를 찾을 수 없습니다.");
        const cData = complaintDoc.data();
        // 상태 게이트(구 handleOpenSettlementModal 조건을 서버에서 강제 — 중복지급 차단)
        if (cData.status !== "resolved") {
          throw new Error("재판이 완료된 사건에 대해서만 합의금을 처리할 수 있습니다.");
        }
        if (cData.settlementPaid === true) {
          throw new Error("이미 합의금 지급이 완료된 사건입니다.");
        }
        // 🔒 판사(비교사)는 실제 사건 당사자(피고소인→고소인)만 처리 가능(reviewer/Gemini HIGH).
        //    임의 제3자 간 이체(피해자→친구·자기 자신)를 사건과 결부시키는 남용을 축소.
        //    교사/관리자는 재량 유지(파산 등 defendantId="system" 예외 사건 처리).
        //    ⚠️ courtComplaints의 status·defendantId·complainantId 자체는 아직 클라 위조 가능
        //    (rules 미잠금) = 가짜 사건 생성 드레인은 batch7 court-lock에서 봉인(문서화됨).
        if (!isTeacher) {
          if (
            senderId !== cData.defendantId ||
            recipientId !== cData.complainantId
          ) {
            throw new Error(
              "판사는 사건의 피고소인→고소인 합의금만 처리할 수 있습니다.",
            );
          }
        }

        if (!senderDoc.exists) throw new Error("보내는 사람의 정보를 찾을 수 없습니다.");
        if (!recipientDoc.exists) throw new Error("받는 사람의 정보를 찾을 수 없습니다.");
        const sData = senderDoc.data();
        const rData = recipientDoc.data();

        // 2) 반경계: 양쪽 모두 판사/관리자와 같은 학급(반 밖으로 돈이 새는 것 차단).
        if (sData.classCode !== classCode || rData.classCode !== classCode) {
          throw new Error("같은 학급의 사용자끼리만 합의금을 주고받을 수 있습니다.");
        }

        // 3) 서버 잔액검증
        const senderCash = Number(sData.cash) || 0;
        if (senderCash < amount) {
          throw new Error(
            `${sData.name || "송금자"}님의 현금이 부족합니다. (보유: ${senderCash.toLocaleString()}원)`,
          );
        }

        // 4) 양방향 increment + complaint 갱신(원자적)
        transaction.update(senderRef, {
          cash: admin.firestore.FieldValue.increment(-amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(recipientRef, {
          cash: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(complaintRef, {
          settlementPaid: true,
          settlementAmount: amount,
          settlementDate: admin.firestore.FieldValue.serverTimestamp(),
          // 🔒 감사(reviewer HIGH): 어느 판사/관리자가 처리했는지 사후 추적 가능하게 기록.
          settlementProcessedBy: uid,
        });

        // 5) 거래내역(activity_logs 최상위 amount) — 구 클라와 동일 형태로 양쪽 기록.
        //    처리자(issuedBy) 식별을 남겨 남용 사후감사 가능(processFine과 일관).
        const senderName = sData.name || sData.nickname || "송금자";
        const recipientName = rData.name || rData.nickname || "수금자";
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        const sLogRef = db.collection("activity_logs").doc();
        transaction.set(sLogRef, {
          userId: senderId,
          userName: senderName,
          type: "legal_settlement",
          description: `${recipientName}님에게 합의금 ${amount.toLocaleString()}원 지급`,
          amount: -amount,
          classCode,
          issuedBy: uid,
          issuedByName: userData.name || "",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });
        const rLogRef = db.collection("activity_logs").doc();
        transaction.set(rLogRef, {
          userId: recipientId,
          userName: recipientName,
          type: "legal_settlement",
          description: `${senderName}님으로부터 합의금 ${amount.toLocaleString()}원 수령`,
          amount: amount,
          classCode,
          issuedBy: uid,
          issuedByName: userData.name || "",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });

        markIdempotent(transaction, keyRef);
      });
      return { success: true, message: "합의금 지급을 완료했습니다." };
    } catch (error) {
      logger.error(
        `[processCourtSettlement] Error by ${uid} (complaint ${complaintId}):`,
        error,
      );
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "aborted",
        error.message || "합의금 지급에 실패했습니다.",
      );
    }
  },
);

// 재판방 합의금 지급 (TrialRoom 판결 합의금 = 피고인→고소인). 벌금(processFine context:trial)과
//   짝을 이루는 경로. 구 클라는 services/database.js transferCash(비원자 2단계 cash write, 트랜잭션도
//   없어 부분실패 시 자금유실)를 썼다. 당사자(sender=피고인·recipient=고소인)를 클라 입력이 아닌
//   trialRooms 문서에서 서버 파생 → 판사가 임의 당사자 이체하는 남용 차단. 멱등키 = trialsettle_{roomId}.
exports.processTrialSettlement = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { roomId, amount, reason } = request.data || {};

    if (!roomId || typeof roomId !== "string" || roomId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 재판방 정보가 필요합니다.");
    }
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10000000000) {
      throw new HttpsError("invalid-argument", "합의금은 1 이상의 정수여야 합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }
    const safeReason = typeof reason === "string" ? sanitizeInput(reason).slice(0, 200) : "";

    const roomRef = db
      .collection("classes")
      .doc(classCode)
      .collection("trialRooms")
      .doc(roomId);

    // 🔒 court-lock(2026-07-18): 권한을 forgeable room.judgeId가 아니라 서버검증 역할로 판정.
    //   구 코드는 트랜잭션 안에서 `uid === room.judgeId`만 확인했는데, trialRooms create가 클라 개방
    //   (isSignedIn && isSameClass)이라 학생이 judgeId=self·complainantId=공범·defendantId=피해자로 방을
    //   위조한 뒤 스스로 "판사"로서 이 CF를 호출→피해자 cash를 갈취할 수 있었다(임명된 판사 불필요).
    //   processCourtSettlement와 동일하게 교사 OR 실제 임명된 판사(hasJobTitle)만 허용 —
    //   selectedJobIds/appointedJobIds는 batch7-a에서 self-write 잠금돼 판사 역할은 서버 신뢰가능.
    const isTeacher = hasTeacherPower(userData);
    if (!isTeacher) {
      const jobsSnap = await db
        .collection("jobs")
        .where("classCode", "==", classCode)
        .get();
      if (!hasJobTitle(userData, buildJobMap(jobsSnap), "판사")) {
        throw new HttpsError(
          "permission-denied",
          "합의금 처리 권한은 임명된 판사 또는 관리자에게 있습니다.",
        );
      }
    }

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 읽기: 멱등키 → 재판방 → (당사자 파생 후) sender·recipient
        const keyRef = await checkIdempotent(
          transaction,
          `trialsettle_${classCode}_${roomId}`,
        );
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists) throw new Error("재판방 정보를 찾을 수 없습니다.");
        const room = roomDoc.data();

        // 🔒 영속 완료 마커(Gemini MEDIUM): 멱등키는 24h TTL이라, 판결 후 재판방 삭제가 실패해 room이
        //    살아남으면 24h 뒤 재호출 시 이중지급 가능. room에 settlementPaid를 영구 기록·게이트해
        //    TTL과 무관하게 같은 방은 1회만 지급되게 함(processCourtSettlement의 settlementPaid와 동일).
        if (room.settlementPaid === true) {
          throw new Error("이미 합의금이 지급된 재판입니다.");
        }

        // 판사(비교사)는 이 재판방에 배정된 판사 본인이어야 함(다른 방을 처리 못 하게).
        //   임명된 판사 여부(hasJobTitle)는 트랜잭션 밖에서 이미 검증됨 — 여기선 담당 판사인지만 확인.
        //   room.judgeId는 위조 가능하나, 위 hasJobTitle 검증으로 "실제 판사만" 통과하므로
        //   비판사가 judgeId=self로 방을 위조해도 이 CF 진입 자체가 차단된다.
        if (!isTeacher && uid !== room.judgeId) {
          throw new HttpsError(
            "permission-denied",
            "이 재판의 담당 판사만 합의금을 처리할 수 있습니다.",
          );
        }

        // 당사자는 재판방 문서에서 서버 파생(판사가 임의 당사자 이체하는 남용 차단).
        const senderId = room.defendantId;
        const recipientId = room.complainantId;
        if (!senderId || !recipientId) {
          throw new Error("재판 당사자(피고인·고소인) 정보가 없습니다.");
        }
        if (senderId === recipientId) {
          throw new Error("피고인과 고소인이 같을 수 없습니다.");
        }
        // 이해상충: 처리자(판사/관리자)는 당사자가 될 수 없다(자기거래 차단).
        if (uid === senderId || uid === recipientId) {
          throw new HttpsError(
            "permission-denied",
            "합의 처리자는 당사자가 될 수 없습니다.",
          );
        }

        const senderRef = db.collection("users").doc(senderId);
        const recipientRef = db.collection("users").doc(recipientId);
        const [senderDoc, recipientDoc] = await transaction.getAll(senderRef, recipientRef);
        if (!senderDoc.exists) throw new Error("피고인 정보를 찾을 수 없습니다.");
        if (!recipientDoc.exists) throw new Error("고소인 정보를 찾을 수 없습니다.");
        const sData = senderDoc.data();
        const rData = recipientDoc.data();

        // 반경계: 양쪽 모두 처리자와 같은 학급.
        if (sData.classCode !== classCode || rData.classCode !== classCode) {
          throw new Error("같은 학급의 사용자끼리만 합의금을 주고받을 수 있습니다.");
        }
        // 🔒 잔액 유한수 검증(codex): cash가 Infinity/문자열 등 비정상이면 increment가 값을 교체·포화해
        //    자금보존이 깨진다(예: sender.cash=Infinity면 차감이 안 돼 recipient에게 무담보 지급).
        if (typeof sData.cash !== "number" || !Number.isFinite(sData.cash)) {
          throw new Error("피고인의 잔액 정보가 올바르지 않습니다.");
        }
        if (typeof rData.cash !== "number" || !Number.isFinite(rData.cash)) {
          throw new Error("고소인의 잔액 정보가 올바르지 않습니다.");
        }
        const senderCash = sData.cash;
        if (senderCash < amount) {
          throw new Error(
            `${sData.name || "피고인"}님의 현금이 부족합니다. (보유: ${senderCash.toLocaleString()}원)`,
          );
        }

        // 2) 양방향 increment + 거래내역(activity_logs 최상위 amount)
        transaction.update(senderRef, {
          cash: admin.firestore.FieldValue.increment(-amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        transaction.update(recipientRef, {
          cash: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // 영속 완료 마커(멱등키 TTL 무관 이중지급 차단).
        transaction.update(roomRef, {
          settlementPaid: true,
          settlementAmount: amount,
          settlementProcessedBy: uid,
          settlementDate: admin.firestore.FieldValue.serverTimestamp(),
        });
        const senderName = sData.name || sData.nickname || "피고인";
        const recipientName = rData.name || rData.nickname || "고소인";
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        const descSuffix = safeReason ? ` (${safeReason})` : "";
        const sLogRef = db.collection("activity_logs").doc();
        transaction.set(sLogRef, {
          userId: senderId,
          userName: senderName,
          type: "legal_settlement",
          description: `재판 합의금 ${amount.toLocaleString()}원 ${recipientName}님에게 지급${descSuffix}`,
          amount: -amount,
          classCode,
          issuedBy: uid,
          issuedByName: userData.name || "",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });
        const rLogRef = db.collection("activity_logs").doc();
        transaction.set(rLogRef, {
          userId: recipientId,
          userName: recipientName,
          type: "legal_settlement",
          description: `재판 합의금 ${amount.toLocaleString()}원 ${senderName}님으로부터 수령${descSuffix}`,
          amount: amount,
          classCode,
          issuedBy: uid,
          issuedByName: userData.name || "",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });

        markIdempotent(transaction, keyRef);
      });
      return { success: true, message: "재판 합의금 지급을 완료했습니다." };
    } catch (error) {
      logger.error(`[processTrialSettlement] Error by ${uid} (room ${roomId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "재판 합의금 지급에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🏪 개인 상점 구매 (2026-07-17 배치6-c CF 이관 — PersonalShop handlePurchase 클라 runTransaction 대체)
//   - 구 클라: 구매자 cash -total, 판매자 cash +sellerAmount, 국고(관리자) cash +VAT, 상점/상품/인벤 갱신.
//     구매자·판매자·관리자 cash 직접 write = batch7 cash rules 잠금 대상 → CF 이관.
//   - 보안: 가격을 클라 입력이 아닌 서버 shopProducts.price에서 재조회 + VAT 서버재계산(10%,
//     판매자가 taxAmount:0 위조해 VAT 탈세하던 창 차단). 판매자=product.ownerId, 국고=findApprovedAdminSnap.
//   - cash는 delta-map으로 합산(구매자/판매자/국고가 같은 문서로 겹쳐도 double-update 없이 순증 정확).
//   - 단일 tx: 재고/상태/잔액/반경계 검증 후 cash increment + 상점/상품/인벤토리 갱신 + 거래내역 + 멱등.
// ===================================================================================
const PERSONAL_SHOP_VAT_RATE = 0.1; // 클라(PersonalShop.js VAT_RATE)와 동일 — 개인상점 고정 10%
exports.purchasePersonalShopItem = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);
    const { productId, shopId, quantity, idempotencyKey } = request.data || {};

    if (
      !productId || typeof productId !== "string" || productId.includes("/") ||
      !shopId || typeof shopId !== "string" || shopId.includes("/") ||
      !Number.isInteger(quantity) || quantity <= 0 || quantity > 100000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "구매 정보(상품·수량 1 이상의 정수)를 정확히 입력해야 합니다.",
      );
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    // 국고(승인 관리자) = VAT 수취. 트랜잭션 밖 사전조회(blind increment라 read 불필요).
    const adminSnap = await findApprovedAdminSnap(classCode);
    const adminRef = adminSnap.empty ? null : adminSnap.docs[0].ref;
    if (!adminRef) {
      throw new HttpsError(
        "failed-precondition",
        "승인된 관리자(국고)가 없어 구매를 처리할 수 없습니다.",
      );
    }

    const productRef = db.collection("shopProducts").doc(productId);
    const shopRef = db.collection("personalShops").doc(shopId);
    const buyerRef = db.collection("users").doc(uid);

    try {
      const inventoryItemId = `ps_${productId}`;
      const inventoryRef = buyerRef.collection("inventory").doc(inventoryItemId);
      const result = await db.runTransaction(async (transaction) => {
        // 1) 모든 읽기 먼저(read-before-write): 멱등키 → product·shop·buyer·인벤토리
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const [productDoc, shopDoc, buyerDoc, invDoc] = await transaction.getAll(
          productRef,
          shopRef,
          buyerRef,
          inventoryRef,
        );

        if (!productDoc.exists) throw new Error("상품이 존재하지 않습니다!");
        if (!shopDoc.exists) throw new Error("상점이 존재하지 않습니다!");
        if (!buyerDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
        const product = productDoc.data();
        const shop = shopDoc.data();
        const buyerData = buyerDoc.data();

        // 2) 서버 권위 검증: 상품=상점 소유자 것, 같은 학급, 본인 상점 아님
        const sellerId = product.ownerId;
        if (!sellerId || shop.ownerId !== sellerId) {
          throw new Error("상품과 상점 정보가 일치하지 않습니다.");
        }
        if (sellerId === uid) throw new Error("본인 상점에서는 구매할 수 없습니다!");
        if (buyerData.classCode !== classCode) {
          throw new Error("학급 정보가 일치하지 않습니다.");
        }
        // 🔒 반경계 fail-closed(Gemini/reviewer MEDIUM): 구 클라 runTransaction은 Firestore read rules
        //    (isSameClassFast)가 cross-class 상품/판매자 read를 암묵 차단했으나, CF는 Admin SDK라 그 방어가
        //    사라진다. product.classCode falsy면 skip하던 fail-open을 닫고, **판매자 현재 classCode를
        //    직접 읽어** 같은 학급인지 강제(돈이 반 밖으로 새는 것 차단). 판매자 read는 write 이전(read단계).
        const sellerRef = db.collection("users").doc(sellerId);
        const sellerDoc = await transaction.get(sellerRef);
        if (!sellerDoc.exists) throw new Error("판매자 정보를 찾을 수 없습니다.");
        if (sellerDoc.data().classCode !== classCode) {
          throw new Error("같은 학급의 상점에서만 구매할 수 있습니다.");
        }
        if (product.classCode && product.classCode !== classCode) {
          throw new Error("같은 학급의 상점에서만 구매할 수 있습니다.");
        }

        // 3) 상태/재고
        //    🔒 status 화이트리스트(codex): soldout/hidden 외 forged "paused"·알수없는 status도 차단.
        //       미설정(레거시)·"available"만 판매 가능.
        if (product.status && product.status !== "available") {
          throw new Error("판매 중인 상품이 아닙니다!");
        }
        //    🔒 type 정규화(codex): "service"만 무한재고. "product"·알수없는 type("productX" 위조 포함)은
        //       전부 재고 강제 → forged type으로 재고 우회(초과판매) 차단.
        const isService = product.type === "service";
        const curStock = Number(product.stock) || 0;
        if (!isService && curStock < quantity) throw new Error("재고가 부족합니다!");

        // 4) 서버 금액 재계산(price=서버 shopProducts, VAT=서버율 재계산=탈세 차단).
        //    구 클라와 동일: 단가 VAT를 반올림 후 수량 곱(perUnitTax*qty).
        //    🔒 정수 number 타입 강제(codex): "100"·false·null 등 강제변환 통과 차단.
        if (
          typeof product.price !== "number" ||
          !Number.isInteger(product.price) ||
          product.price < 0
        ) {
          throw new Error("상품 가격이 올바르지 않습니다.");
        }
        const unitPrice = product.price;
        const unitTax = Math.round(unitPrice * PERSONAL_SHOP_VAT_RATE);
        const sellerAmount = unitPrice * quantity;
        const taxAmount = unitTax * quantity;
        const totalAmount = sellerAmount + taxAmount;
        if (
          !Number.isFinite(totalAmount) ||
          totalAmount < 0 ||
          totalAmount > 10000000000
        ) {
          throw new Error("결제 금액이 올바르지 않습니다.");
        }

        // 5) 구매자 잔액
        if ((Number(buyerData.cash) || 0) < totalAmount) {
          throw new Error("잔액이 부족합니다!");
        }

        // 6) cash delta-map(구매자 -total, 판매자 +sellerAmount, 국고 +VAT).
        //    같은 문서로 겹쳐도(판매자==국고 등) 순증만 반영 → double-update로 인한 손실 방지.
        // Object.create(null): 프로토타입 없는 맵 → id가 "constructor"/"__proto__"/"toString"이어도
        //   상속 프로퍼티 오염 없이 순수 숫자 누적(방어심화 — 실제 id는 auth UID라 악용불가하나 정석 패턴).
        const deltas = Object.create(null);
        const addDelta = (id, amt) => { deltas[id] = (deltas[id] || 0) + amt; };
        addDelta(uid, -totalAmount);
        addDelta(sellerId, sellerAmount);
        addDelta(adminRef.id, taxAmount);
        for (const [id, amt] of Object.entries(deltas)) {
          if (amt === 0) continue;
          transaction.update(db.collection("users").doc(id), {
            cash: admin.firestore.FieldValue.increment(amt),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 7) 국고 통계(vatRevenue) — 관리자 cash와 별개 통계 문서
        const treasuryRef = db.collection("nationalTreasuries").doc(classCode);
        transaction.set(
          treasuryRef,
          {
            vatRevenue: admin.firestore.FieldValue.increment(taxAmount),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        // 8) 상점 매출 통계
        transaction.update(shopRef, {
          totalSales: admin.firestore.FieldValue.increment(sellerAmount),
          totalTaxPaid: admin.firestore.FieldValue.increment(taxAmount),
        });

        // 9) 상품 재고/판매량
        const productUpdates = {
          soldCount: admin.firestore.FieldValue.increment(quantity),
        };
        if (!isService) {
          productUpdates.stock = admin.firestore.FieldValue.increment(-quantity);
          if (curStock - quantity <= 0) productUpdates.status = "soldout";
        }
        transaction.update(productRef, productUpdates);

        // 10) 구매자 인벤토리(ps_{productId}) — 구 클라 구조 재현(read는 read단계 invDoc)
        const shopName = shop.shopName || "개인상점";
        if (invDoc.exists) {
          transaction.update(inventoryRef, {
            quantity: admin.firestore.FieldValue.increment(quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(inventoryRef, {
            itemId: inventoryItemId,
            name: product.name || "상품",
            icon: product.icon || (isService ? "🛠️" : "📦"),
            description: `${shopName}에서 구매한 ${isService ? "서비스" : "상품"}`,
            type: product.type || "product",
            quantity: quantity,
            price: totalAmount / quantity,
            source: "personalShop",
            shopId: shopId,
            shopName: shopName,
            sellerId: sellerId,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 11) 거래내역(activity_logs 최상위 amount) — 구 클라와 동일하게 양쪽 기록.
        const buyerName = buyerData.name || buyerData.nickname || "익명";
        const sellerName = shop.ownerName || "판매자";
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        const buyerLogRef = db.collection("activity_logs").doc();
        transaction.set(buyerLogRef, {
          userId: uid,
          userName: buyerName,
          type: "shop_purchase",
          description: `${shopName}에서 ${product.name || "상품"} ${quantity}개 구매 (-${totalAmount.toLocaleString()}원, VAT ${taxAmount.toLocaleString()}원 포함)`,
          amount: -totalAmount,
          classCode: classCode,
          metadata: { shopId, productId, sellerId, quantity, taxAmount },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });
        const sellerLogRef = db.collection("activity_logs").doc();
        transaction.set(sellerLogRef, {
          userId: sellerId,
          userName: sellerName,
          type: "shop_sale",
          description: `${buyerName}님이 ${product.name || "상품"} ${quantity}개 구매 - 매출 (+${sellerAmount.toLocaleString()}원)`,
          amount: sellerAmount,
          classCode: classCode,
          metadata: { shopId, productId, buyerId: uid, quantity, taxAmount, grossAmount: totalAmount },
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });

        // 12) activities 컬렉션 — 판매/구매 내역 뷰(loadSalesHistory)가 sellerId/buyerId로 읽음.
        //     구 클라 write를 CF에서 복원(누락 시 상점 판매/구매 내역에서 이 거래가 사라짐).
        const activityRef = db.collection("activities").doc();
        transaction.set(activityRef, {
          type: "shop_purchase",
          buyerId: uid,
          buyerName,
          sellerId,
          sellerName,
          shopId,
          shopName,
          productId,
          productName: product.name || "상품",
          productType: product.type || "product",
          quantity,
          unitPrice: totalAmount / quantity,
          totalAmount,
          taxAmount,
          classCode,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        markIdempotent(transaction, keyRef);
        return { totalAmount, sellerAmount, taxAmount };
      });
      return { success: true, ...result };
    } catch (error) {
      logger.error(`[purchasePersonalShopItem] Error for ${uid}:`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "구매에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔨 경매 입찰 (2026-07-17 배치6-d1 CF 이관 — Auction handleBid 클라 runTransaction 대체)
//   - 구 클라: 입찰자 cash -amount(에스크로) + 직전 최고입찰자 환불 +currentBid + 경매 갱신.
//     입찰자·직전입찰자 cash 직접 write = batch7 cash rules 잠금 대상 → CF 이관.
//   - 서버 검증: 경매 ongoing·미종료(endTime>now), amount>현재가·정수, 본인경매 입찰 금지, 잔액.
//   - cash delta-map: 자기 최고입찰 인상 시(입찰자==직전입찰자) -amount+currentBid=차액만 정확 반영.
//   - 이중입찰 차단: 경매 currentBid 자연게이트(재호출 시 amount<=currentBid 거부) + 멱등키.
// ===================================================================================
exports.placeBid = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { auctionId, amount, idempotencyKey } = request.data || {};

    if (
      !auctionId || typeof auctionId !== "string" || auctionId.includes("/") ||
      !Number.isInteger(amount) || amount <= 0 || amount > 10000000000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "경매·입찰액(1 이상의 정수)을 정확히 입력해야 합니다.",
      );
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const auctionRef = db
      .collection("classes")
      .doc(classCode)
      .collection("auctions")
      .doc(auctionId);
    const bidderRef = db.collection("users").doc(uid);

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 모든 읽기 먼저: 멱등키 → 경매 → 입찰자 → (직전 최고입찰자)
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists) throw new Error("경매 정보를 찾을 수 없습니다.");
        const a = auctionDoc.data();

        if (a.status !== "ongoing") throw new Error("경매가 이미 종료되었습니다.");
        // 종료시각 서버검증(클라 조작 불가). Timestamp 없으면 종료로 간주.
        const endMs = a.endTime && typeof a.endTime.toMillis === "function"
          ? a.endTime.toMillis()
          : 0;
        if (!endMs || endMs <= Date.now()) {
          throw new Error("이미 종료되었거나 유효하지 않은 경매입니다.");
        }
        if (a.seller === uid) throw new Error("자신의 경매에는 입찰할 수 없습니다.");

        const curBid = Number(a.currentBid) || 0;
        if (amount <= curBid) {
          throw new Error(`입찰 금액이 현재가(${curBid.toLocaleString()}원)보다 높아야 합니다.`);
        }

        const bidderDoc = await transaction.get(bidderRef);
        if (!bidderDoc.exists) throw new Error("입찰자 정보를 찾을 수 없습니다.");
        const bidderData = bidderDoc.data();
        if (bidderData.classCode !== classCode) {
          throw new Error("같은 학급의 경매에만 입찰할 수 있습니다.");
        }
        if ((Number(bidderData.cash) || 0) < amount) {
          throw new Error("보유 현금이 부족합니다.");
        }

        // 직전 최고입찰자(환불 대상). 🔒 삭제된 계정이면 환불 스킵(Gemini/reviewer): blind update는
        //   대상 문서 없으면 throw→트랜잭션 abort→그 경매 영구 입찰불가(DoS). read로 존재확인 후 스킵.
        const prevBidderId = a.highestBidder || null;
        const hasPrev = prevBidderId && curBid > 0;
        let refundApplies = false;
        if (hasPrev) {
          if (prevBidderId === uid) {
            refundApplies = true; // 자기 재입찰 — 입찰자 문서 이미 읽음(존재·같은학급)
          } else {
            const prevDoc = await transaction.get(
              db.collection("users").doc(prevBidderId),
            );
            // 🔒 존재 + 같은학급만 환불(codex): CF는 Admin SDK라 rules를 우회하므로, forged 타학급
            //   highestBidder로 환불이 반 밖으로 새거나 에스크로가 탈취되던 창을 차단(구 클라 read-rule 방어 복원).
            //   삭제된 계정이면 환불 스킵(입찰은 계속 진행 — blind update abort로 인한 경매 동결 방지).
            refundApplies = prevDoc.exists && prevDoc.data().classCode === classCode;
          }
        }

        // 2) cash delta-map: 입찰자 -amount, (환불대상 존재 시) 직전입찰자 +curBid.
        //    자기 최고입찰 인상(입찰자==직전입찰자)이면 -amount+curBid=차액만 반영.
        const deltas = Object.create(null);
        const addDelta = (id, amt) => { deltas[id] = (deltas[id] || 0) + amt; };
        addDelta(uid, -amount);
        if (refundApplies) addDelta(prevBidderId, curBid);
        for (const [id, amt] of Object.entries(deltas)) {
          if (amt === 0) continue;
          transaction.update(db.collection("users").doc(id), {
            cash: admin.firestore.FieldValue.increment(amt),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 3) 경매 갱신
        const bidderName = userData.name || bidderData.name || "입찰자";
        transaction.update(auctionRef, {
          currentBid: amount,
          bidCount: admin.firestore.FieldValue.increment(1),
          highestBidder: uid,
          highestBidderName: bidderName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 4) 거래내역(activity_logs 최상위 amount)
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        const bidderLogRef = db.collection("activity_logs").doc();
        transaction.set(bidderLogRef, {
          userId: uid,
          userName: bidderName,
          type: "auction_bid",
          description: `경매 입찰: ${a.name || "아이템"} (-${amount.toLocaleString()}원)`,
          amount: -amount,
          classCode: classCode,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expireAt: logExpireAt,
        });
        // 🔒 환불이 실제 적용된 경우 항상 기록(자기 재입찰 포함 — 로그합=실제잔액변화 정합, Gemini HIGH).
        if (refundApplies) {
          const refundLogRef = db.collection("activity_logs").doc();
          transaction.set(refundLogRef, {
            userId: prevBidderId,
            userName: prevBidderId === uid
              ? (userData.name || "입찰자")
              : (a.highestBidderName || "이전 입찰자"),
            type: "auction_bid_refund",
            description: `경매 입찰 환불: ${a.name || "아이템"} (+${curBid.toLocaleString()}원)`,
            amount: curBid,
            classCode: classCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: logExpireAt,
          });
        }

        markIdempotent(transaction, keyRef);
      });
      return { success: true, message: "입찰이 완료되었습니다." };
    } catch (error) {
      logger.error(`[placeBid] Error for ${uid} (auction ${auctionId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "입찰에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔨 경매 정산 (2026-07-17 배치6-d2 CF 이관 — Auction settleAuction 클라 runTransaction 대체)
//   - 낙찰: 판매자 +（낙찰가-거래세), 국고(관리자) +거래세, 낙찰자에게 아이템 지급(낙찰자 cash는
//     이미 placeBid에서 차감됨=재차감 없음). 유찰: 판매자에게 아이템 반환.
//   - 판매자·관리자 cash 직접 write = batch7 cash rules 잠금 대상 → CF 이관. 정산은 종료된 경매를
//     아무 같은학급 뷰어나 트리거(결정론적) — 서버가 endTime 경과·ongoing 재검증 후 처리, status→completed.
//   - ⚠️ 잔여(배치6-d4): auctions 문서가 클라 writable이라 위조 currentBid로 무담보 민팅 가능 →
//     auctions rules CF-only 잠금 필요(이 CF 단독으론 미봉인, 구 클라도 동일 취약).
//   - 개선: 관리자 없으면 거래세 미차감(구 클라는 세금 차감 후 소각 — 소각 방지). delta-map 겹침 안전.
// ===================================================================================
exports.settleAuction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);
    const { auctionId } = request.data || {};
    if (!auctionId || typeof auctionId !== "string" || auctionId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 경매 정보가 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const auctionRef = db
      .collection("classes")
      .doc(classCode)
      .collection("auctions")
      .doc(auctionId);

    // 트랜잭션 밖 사전조회: 거래세율, 국고 관리자.
    let auctionTaxRate = 0.03;
    try {
      const gov = await db.collection("governmentSettings").doc(classCode).get();
      const t = gov.exists ? gov.data().taxSettings : null;
      if (t && typeof t.auctionTransactionTaxRate === "number") {
        auctionTaxRate = t.auctionTransactionTaxRate;
      }
    } catch (e) {
      logger.warn(`[settleAuction] 세율 조회 실패 ${classCode}:`, e);
    }
    // 🔒 세율 클램프(Gemini): 음수 세율이면 taxAmount<0 → proceeds=bid-tax>bid = 무담보 mint.
    //    0~1로 강제(관리자 오조작·버그로 인한 자금보존 붕괴 방지).
    if (!Number.isFinite(auctionTaxRate)) auctionTaxRate = 0.03;
    auctionTaxRate = Math.max(0, Math.min(1, auctionTaxRate));
    const adminSnap = await findApprovedAdminSnap(classCode);
    const adminRef = adminSnap.empty ? null : adminSnap.docs[0].ref;

    // 낙찰자 기존 동일아이템 사전조회(트랜잭션 밖 — 있으면 수량증가, 없으면 신규).
    // auction 문서를 먼저 읽어 highestBidder/originalStoreItemId 파악.
    const preAuction = await auctionRef.get();
    if (!preAuction.exists) {
      return { success: true, message: "이미 정산되었거나 삭제된 경매입니다.", noop: true };
    }
    const pa = preAuction.data();
    if (pa.status !== "ongoing") {
      return { success: true, message: "이미 처리된 경매입니다.", noop: true };
    }

    try {
      await db.runTransaction(async (transaction) => {
        // 1) 읽기: 경매 → (낙찰) 낙찰자 기존아이템 쿼리 / (유찰) 판매자 반환아이템.
        //    ⚠️ 낙찰자 아이템 조회는 반드시 트랜잭션 안에서 fresh highestBidder 기준으로
        //    수행(막판 동시입찰 레이스 시 사전조회 stale → 이전 입찰자에게 오지급 방지).
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists) throw new Error("경매 정보가 없습니다.");
        const a = auctionDoc.data();
        if (a.status !== "ongoing") throw new Error("이미 처리된 경매입니다.");
        // 종료시각 서버검증(미종료면 정산 불가).
        const endMs = a.endTime && typeof a.endTime.toMillis === "function"
          ? a.endTime.toMillis() : 0;
        if (!endMs || endMs > Date.now()) {
          throw new Error("아직 종료되지 않은 경매입니다.");
        }

        const hasWinner = !!a.highestBidder;
        const returnCollection = a.assetSourceCollection || "inventory";

        // fail-closed: 아이템 식별자 누락 시 조용한 유실/불완전 쓰기 대신 명시적 실패.
        if (hasWinner && !a.originalStoreItemId) {
          throw new Error("경매 아이템 식별자(originalStoreItemId)가 없습니다.");
        }
        if (!hasWinner && !a.assetId) {
          throw new Error("반환할 아이템 식별자(assetId)가 없습니다.");
        }

        // 낙찰자 기존 동일아이템 조회(트랜잭션 내부·fresh highestBidder 기준).
        let winnerExistingItemRef = null;
        if (hasWinner) {
          const winnerItemQuery = db
            .collection("users")
            .doc(a.highestBidder)
            .collection("inventory")
            .where("itemId", "==", a.originalStoreItemId)
            .limit(1);
          const wq = await transaction.get(winnerItemQuery);
          if (!wq.empty) winnerExistingItemRef = wq.docs[0].ref;
        }

        // 유찰 반환아이템 조회(트랜잭션 내부).
        let sellerItemDoc = null;
        let sellerItemRef = null;
        if (!hasWinner) {
          sellerItemRef = db
            .collection("users")
            .doc(a.seller)
            .collection(returnCollection)
            .doc(a.assetId);
          sellerItemDoc = await transaction.get(sellerItemRef);
        }

        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );

        if (hasWinner) {
          const bid = Number(a.currentBid) || 0;
          // 개선: 관리자 없으면 거래세 미차감(구 클라 소각 방지).
          const taxAmount = adminRef ? Math.round(bid * auctionTaxRate) : 0;
          const sellerProceeds = bid - taxAmount;

          // cash delta-map: 판매자 +proceeds, 국고 +tax(겹치면 합산).
          const deltas = Object.create(null);
          const addDelta = (id, amt) => { deltas[id] = (deltas[id] || 0) + amt; };
          if (a.seller) addDelta(a.seller, sellerProceeds);
          if (adminRef && taxAmount > 0) addDelta(adminRef.id, taxAmount);
          for (const [id, amt] of Object.entries(deltas)) {
            if (amt === 0) continue;
            transaction.update(db.collection("users").doc(id), {
              cash: admin.firestore.FieldValue.increment(amt),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // 국고 통계
          if (taxAmount > 0) {
            transaction.set(
              db.collection("nationalTreasuries").doc(classCode),
              {
                auctionTaxRevenue: admin.firestore.FieldValue.increment(taxAmount),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          }

          // 낙찰자 아이템 지급
          if (winnerExistingItemRef) {
            transaction.update(winnerExistingItemRef, {
              quantity: admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            const newItemRef = db
              .collection("users")
              .doc(a.highestBidder)
              .collection("inventory")
              .doc();
            transaction.set(newItemRef, {
              itemId: a.originalStoreItemId,
              name: a.name,
              description: a.description,
              icon: a.itemIcon || "📦",
              quantity: 1,
              type: "item",
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // 거래내역(activity_logs 최상위 amount) — 판매자 수익, 낙찰자(입찰 시 이미 차감=amount 0).
          const sLog = db.collection("activity_logs").doc();
          transaction.set(sLog, {
            userId: a.seller,
            userName: a.sellerName || "판매자",
            type: "auction_sold",
            description: `경매 판매: ${a.name || "아이템"} (+${sellerProceeds.toLocaleString()}원${taxAmount > 0 ? `, 세금 ${taxAmount.toLocaleString()}원` : ""})`,
            amount: sellerProceeds,
            classCode: a.classCode || classCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: logExpireAt,
          });
          const wLog = db.collection("activity_logs").doc();
          transaction.set(wLog, {
            userId: a.highestBidder,
            userName: a.highestBidderName || "낙찰자",
            type: "auction_won",
            description: `경매 낙찰: ${a.name || "아이템"} (낙찰가 ${bid.toLocaleString()}원 — 입찰 시 이미 차감됨)`,
            amount: 0,
            classCode: a.classCode || classCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: logExpireAt,
          });
        } else {
          // 유찰: 판매자에게 아이템 반환
          if (sellerItemRef) {
            if (sellerItemDoc && sellerItemDoc.exists) {
              transaction.update(sellerItemRef, {
                quantity: admin.firestore.FieldValue.increment(1),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            } else {
              transaction.set(sellerItemRef, {
                itemId: a.originalStoreItemId,
                name: a.name,
                description: a.description,
                icon: a.itemIcon || "📦",
                quantity: 1,
                type: "item",
                addedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }
          const uLog = db.collection("activity_logs").doc();
          transaction.set(uLog, {
            userId: a.seller,
            userName: a.sellerName || "판매자",
            type: "auction_unsold",
            description: `경매 유찰: ${a.name || "아이템"} 반환됨`,
            amount: 0,
            classCode: a.classCode || classCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: logExpireAt,
          });
        }

        // 경매 완료
        transaction.update(auctionRef, {
          status: "completed",
          settledBy: uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return { success: true, message: "경매가 정산되었습니다." };
    } catch (error) {
      logger.error(`[settleAuction] Error (auction ${auctionId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "경매 정산에 실패했습니다.");
    }
  },
);

// 경매 취소(판매자 등록취소 + 관리자 강제취소 통합).
// - 판매자: 본인 경매 & 입찰 0건일 때만. cash 이동 없음(아이템 반환 + 경매 삭제).
// - 관리자(hasAdminPower): 진행중 경매 강제취소. 최고입찰자 있으면 에스크로(currentBid) 환불 + 아이템 반환.
// auctions 문서 삭제가 클라 write였던 것을 CF로 이관(배치6-d4 auctions rules 잠금 선행).
exports.cancelAuction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin } = await checkAuthAndGetUserData(request);
    const { auctionId } = request.data || {};
    if (!auctionId || typeof auctionId !== "string" || auctionId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 경매 정보가 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const auctionRef = db
      .collection("classes")
      .doc(classCode)
      .collection("auctions")
      .doc(auctionId);

    // 조기 존재/상태 확인(낙관적 — 실제 게이트·권한은 트랜잭션 내부).
    const pre = await auctionRef.get();
    if (!pre.exists) {
      return { success: true, message: "이미 취소되었거나 삭제된 경매입니다.", noop: true };
    }
    if (pre.data().status !== "ongoing") {
      return { success: true, message: "이미 처리된 경매입니다.", noop: true };
    }

    try {
      await db.runTransaction(async (transaction) => {
        // ── 읽기(모든 read를 write보다 먼저) ──
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists) throw new Error("경매 정보가 없습니다.");
        const a = auctionDoc.data();
        if (a.status !== "ongoing") throw new Error("이미 처리된 경매입니다.");

        const isSeller = a.seller === uid;
        const bidCount = Number(a.bidCount) || 0;
        // 권한: 관리자는 강제취소(환불 포함), 판매자는 입찰 0건일 때만.
        // ⚠️ bidCount와 highestBidder를 모두 검사(Gemini): auctions 문서가 아직 클라 writable(d4 전)이라
        //    판매자가 bidCount=0으로 위조해 실제 입찰자 있는 경매를 취소하면 환불 없이 삭제=입찰자 자금 유실.
        //    highestBidder가 존재하면(위조 bidCount와 무관) 판매자 취소를 막아 방어심도 확보.
        if (!isAdmin) {
          if (!isSeller) throw new Error("취소 권한이 없습니다.");
          if (bidCount > 0 || a.highestBidder) {
            throw new Error("입찰이 진행된 경매는 취소할 수 없습니다.");
          }
        }
        // fail-closed: 반환 아이템 식별자 필수(조용한 유실 방지).
        if (!a.assetId) {
          throw new Error("반환할 아이템 식별자(assetId)가 없습니다.");
        }

        // 환불액 상한(폭발반경 축소, code-reviewer L1): auctions 문서가 클라 writable(d4 전)이라
        //    currentBid가 임의로 위조될 수 있으므로 placeBid 캡(100억)과 동일하게 제한.
        const bid = Math.min(Math.max(Number(a.currentBid) || 0, 0), 10000000000);
        // ⚠️ 환불은 관리자 강제취소 경로에서만. 판매자 취소는 bidCount===0(입찰 없음)만 허용되므로
        //    정상적으로 환불 대상이 없다. isAdmin으로 게이트하지 않으면 판매자가 auctions 문서에
        //    highestBidder=본인·currentBid=거액·bidCount=0을 위조해 무담보 민팅 가능(구 판매자 취소는
        //    환불이 전혀 없었음 — 시맨틱 일치). fake-escrow(d4)는 관리자 경로에도 남지만 그건 선재 벡터.
        const hasRefund = isAdmin && !!a.highestBidder && bid > 0;
        // 최고입찰자 존재+반경계 확인(삭제된 입찰자 abort DoS·cross-class 유출 방지, placeBid d1과 동일).
        let prevBidderDoc = null;
        if (hasRefund) {
          prevBidderDoc = await transaction.get(
            db.collection("users").doc(a.highestBidder),
          );
        }
        // 판매자 반환 아이템(트랜잭션 내부 fresh get).
        const returnCollection = a.assetSourceCollection || "inventory";
        const sellerItemRef = db
          .collection("users")
          .doc(a.seller)
          .collection(returnCollection)
          .doc(a.assetId);
        const sellerItemDoc = await transaction.get(sellerItemRef);

        // ── 쓰기 ──
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );

        // 1) 입찰금 환불(에스크로 반환). 관리자 강제취소 경로에서만 발생 가능.
        if (hasRefund) {
          if (!prevBidderDoc || !prevBidderDoc.exists) {
            // 입찰자 계정이 삭제됨 → 반환할 잔액 자체가 없음. 환불 스킵하고 취소 진행
            // (DoS 방지: 삭제된 입찰자 때문에 경매가 영구 취소불가 되는 것 방지, placeBid d1과 동일).
          } else if (prevBidderDoc.data().classCode !== classCode) {
            // 존재하지만 타학급 이동 → 실제 held cash가 남아있어 조용히 삭제하면 에스크로 소각(codex M#2).
            //    반경계 위조 민팅도 차단. 취소를 중단해 관리자 수동 처리를 유도(fail-closed).
            throw new Error("입찰자가 다른 학급으로 이동해 환불할 수 없습니다. 관리자 확인이 필요합니다.");
          } else {
            // 같은 학급 입찰자 → 정상 환불(에스크로 반환).
            transaction.update(db.collection("users").doc(a.highestBidder), {
              cash: admin.firestore.FieldValue.increment(bid),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            const rLog = db.collection("activity_logs").doc();
            transaction.set(rLog, {
              userId: a.highestBidder,
              userName: a.highestBidderName || "입찰자",
              type: "auction_bid_refund",
              description: `경매 취소 환불: ${a.name || "아이템"} (+${bid.toLocaleString()}원)`,
              amount: bid,
              // 로그 classCode는 위조가능한 a.classCode 대신 경로/호출자 classCode 사용(codex M#3).
              classCode: classCode,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              expireAt: logExpireAt,
            });
          }
        }

        // 2) 판매자에게 아이템 반환
        if (sellerItemDoc.exists) {
          transaction.update(sellerItemRef, {
            quantity: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(sellerItemRef, {
            itemId: a.originalStoreItemId,
            name: a.name,
            description: a.description,
            icon: a.itemIcon || "📦",
            quantity: 1,
            type: "item",
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 3) 경매 문서 삭제
        transaction.delete(auctionRef);
      });
      return { success: true, message: "경매가 취소되었습니다." };
    } catch (error) {
      logger.error(`[cancelAuction] Error (auction ${auctionId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "경매 취소에 실패했습니다.");
    }
  },
);

// 경매 등록(아이템 차감 + 경매 문서 생성을 단일 트랜잭션으로 원자화).
// 구조: 구 클라는 updateUserItemQuantity CF(차감) → addDoc(생성) 2단계 비원자였음. 그래서 학생이
//   차감 CF를 건너뛰고 create 규칙만 만족하는 경매를 직접 만든 뒤 cancelAuction으로 아이템을
//   반환받으면 아이템이 복제됐다(codex HIGH). 이 CF로 차감+생성을 원자화하고, auctions create
//   rules를 `if false`로 잠가 경매 생성을 CF 전용으로 만든다.
exports.createAuction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const {
      assetId,
      startPrice,
      durationHours,
      sourceCollection = "inventory",
      idempotencyKey,
      name: clientName,
      description: clientDescription,
    } = request.data || {};

    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    if (!assetId || typeof assetId !== "string" || assetId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 아이템 정보가 필요합니다.");
    }
    // 경로주입 방지: 반환/차감 컬렉션 화이트리스트(updateUserItemQuantity와 동일).
    const ALLOWED_COLLECTIONS = ["inventory"];
    if (!ALLOWED_COLLECTIONS.includes(sourceCollection)) {
      throw new HttpsError("invalid-argument", "유효하지 않은 컬렉션입니다.");
    }
    // strict 숫자 타입(codex): 문자열/불리언 강제변환 거부("24evil"→24, true→1 등 차단).
    if (typeof startPrice !== "number" || !Number.isFinite(startPrice)) {
      throw new HttpsError("invalid-argument", "유효한 시작가를 입력해주세요.");
    }
    const price = Math.floor(startPrice);
    if (price <= 0 || price > 10000000000) {
      throw new HttpsError("invalid-argument", "유효한 시작가를 입력해주세요.");
    }
    if (typeof durationHours !== "number" || !Number.isFinite(durationHours)) {
      throw new HttpsError("invalid-argument", "유효한 경매 기간(1-24시간)을 선택해주세요.");
    }
    const dur = Math.floor(durationHours);
    if (dur < 1 || dur > 24) {
      throw new HttpsError("invalid-argument", "유효한 경매 기간(1-24시간)을 선택해주세요.");
    }

    const itemRef = db
      .collection("users")
      .doc(uid)
      .collection(sourceCollection)
      .doc(assetId);
    const auctionRef = db
      .collection("classes")
      .doc(classCode)
      .collection("auctions")
      .doc();
    const endMs = Date.now() + dur * 60 * 60 * 1000;

    // 표시용 name/description은 클라 편집 허용(구 UX — textarea로 수정 유도). 위조 위험 없음
    //   (아이템 정체성은 originalStoreItemId, 금액은 startPrice). 미제공 시 아이템값 폴백.
    const safeName = typeof clientName === "string" && clientName.trim()
      ? sanitizeInput(clientName).slice(0, 100) : null;
    const safeDescription = typeof clientDescription === "string"
      ? sanitizeInput(clientDescription).slice(0, 500) : null;

    try {
      await db.runTransaction(async (transaction) => {
        // 0) 멱등키(read 먼저) — 네트워크 재시도·다중탭 이중 등록(아이템 이중차감) 차단.
        const keyRef = await checkIdempotent(transaction, idempotencyKey);

        // 1) 아이템 검증 + 차감(원자). 없거나 수량부족이면 경매 생성 안 함.
        const itemDoc = await transaction.get(itemRef);
        if (!itemDoc.exists) {
          throw new Error("경매에 등록할 아이템을 찾을 수 없습니다.");
        }
        const item = itemDoc.data();
        const qty = Number(item.quantity) || 0;
        if (qty < 1) {
          throw new Error("아이템 수량이 부족합니다.");
        }
        // 경매는 실물 아이템만(서비스/쿠폰 등 제외, codex). 레거시(type 미기록)는 허용.
        if (item.type && item.type !== "item") {
          throw new Error("이 아이템은 경매에 등록할 수 없습니다.");
        }
        if (qty - 1 === 0) {
          transaction.delete(itemRef);
        } else {
          transaction.update(itemRef, {
            quantity: qty - 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 2) 경매 생성. 아이템 정체성/금액은 서버 파생(originalStoreItemId·startPrice), 표시용
        //    name/description만 클라 편집 반영(폴백=아이템값). 입찰 필드는 비움(highestBidder=null·
        //    bidCount=0·currentBid=startPrice) — payout은 placeBid CF가 highestBidder 설정 시에만.
        // 표시 필드는 문자열로 강제(codex): 인벤토리가 학생 writable이라 icon/name을 객체로 위조하면
        //   경매 렌더링(React child)이 크래시할 수 있음 → 비문자열이면 안전한 폴백.
        const derivedName = typeof item.name === "string" ? item.name : "아이템";
        const derivedDesc = typeof item.description === "string" ? item.description : "";
        const derivedIcon = typeof item.icon === "string" ? item.icon : "📦";
        const derivedItemId = typeof item.itemId === "string" ? item.itemId : null;
        transaction.set(auctionRef, {
          assetId: assetId,
          assetType: "item",
          assetSourceCollection: sourceCollection,
          originalStoreItemId: derivedItemId,
          name: safeName || derivedName,
          description: safeDescription !== null ? safeDescription : derivedDesc,
          itemIcon: derivedIcon,
          startPrice: price,
          currentBid: price,
          bidCount: 0,
          highestBidder: null,
          seller: uid,
          sellerName: userData.name || "판매자",
          status: "ongoing",
          endTime: admin.firestore.Timestamp.fromMillis(endMs),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          classCode: classCode,
        });

        // 3) 멱등키 마킹(write) — 재시도 시 위 checkIdempotent가 already-exists로 차단.
        markIdempotent(transaction, keyRef);
      });
      return { success: true, auctionId: auctionRef.id, message: "경매가 등록되었습니다." };
    } catch (error) {
      logger.error(`[createAuction] Error (uid ${uid}, asset ${assetId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "경매 등록에 실패했습니다.");
    }
  },
);

// ===================================================================================
// 🔥 주식 거래 함수 구현
// ===================================================================================

const COMMISSION_RATE = 0.003; // 수수료율 0.3%
const TAX_RATE = 0.22; // 양도소득세율 22%
const BOND_TAX_RATE = 0.154; // 채권세율 15.4%
const TRANSACTION_TAX_RATE = 0.01; // 거래세율 1%
const {
  getStockTaxMultiplier,
  isStorePriceEventExcluded,
} = require("./economicEvents");

exports.buyStock = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { stockId, quantity, idempotencyKey } = request.data;

  if (!stockId || !quantity || quantity <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "유효한 주식 ID와 수량을 입력해야 합니다.",
    );
  }

  // 🔥 보안: 정수 및 범위 검증
  if (!Number.isInteger(quantity) || quantity > 10000) {
    throw new HttpsError(
      "invalid-argument",
      "수량은 1~10000 사이의 정수여야 합니다.",
    );
  }

  if (!classCode) {
    throw new HttpsError(
      "failed-precondition",
      "학급 코드가 할당되지 않았습니다.",
    );
  }

  const userRef = db.collection("users").doc(uid);
  const stockRef = db.collection("CentralStocks").doc(stockId);
  const treasuryRef = db.collection("nationalTreasuries").doc(classCode);

  // 관리자 조회 (세금 수입용)
  let adminRef = null;
  const adminSnap = await findApprovedAdminSnap(classCode);
  if (!adminSnap.empty) {
    adminRef = adminSnap.docs[0].ref;
  }

  // 🔥 경제 이벤트 주식세금 멀티플라이어 사전 조회 (트랜잭션 외부)
  const stockTaxMult = await getStockTaxMultiplier(classCode);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🚨 서버측 idempotency check (read만)
      const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

      // 🔥 모든 읽기 작업을 먼저 수행
      const portfolioRef = db
        .collection("users")
        .doc(uid)
        .collection("portfolio")
        .doc(stockId);
      const refsToRead = [userRef, stockRef, portfolioRef];
      if (adminRef) refsToRead.push(adminRef);
      const results = await transaction.getAll(...refsToRead);
      const [userDoc, stockDoc, portfolioDoc] = results;

      if (!userDoc.exists) {
        throw new Error("사용자 정보를 찾을 수 없습니다.");
      }

      if (!stockDoc.exists) {
        throw new Error("주식 정보를 찾을 수 없습니다.");
      }

      const userData = userDoc.data();
      const stockData = stockDoc.data();

      if (!stockData.isListed) {
        throw new Error("상장되지 않은 주식입니다.");
      }

      const stockPrice = stockData.price || 0;
      const cost = stockPrice * quantity;
      const commission = Math.round(cost * COMMISSION_RATE);
      const transactionTax = Math.floor(
        cost * TRANSACTION_TAX_RATE * stockTaxMult,
      );
      const totalCost = cost + commission + transactionTax;

      const currentCash = userData.cash || 0;
      if (currentCash < totalCost) {
        throw new Error(
          `현금이 부족합니다. 필요: ${totalCost.toLocaleString()}원, 보유: ${currentCash.toLocaleString()}원`,
        );
      }

      // 🔥 이제 모든 쓰기 작업 수행

      // 사용자 현금 차감
      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(-totalCost),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 거래 로그
      const stockBuyTxRef = userRef.collection("transactions").doc();
      transaction.set(stockBuyTxRef, {
        type: "stockBuy",
        amount: -totalCost,
        description: `[주식 매수] ${stockData.name} ${quantity}주 × ${stockPrice.toLocaleString()}원 (수수료 ${commission.toLocaleString()}, 거래세 ${transactionTax.toLocaleString()})`,
        stockId,
        stockName: stockData.name,
        quantity,
        price: stockPrice,
        commission,
        transactionTax,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 포트폴리오에 주식 추가 또는 업데이트
      if (portfolioDoc.exists) {
        const portfolioData = portfolioDoc.data();
        const currentQuantity = portfolioData.quantity || 0;
        const currentAvgPrice = portfolioData.averagePrice || 0;
        const newQuantity = currentQuantity + quantity;
        const newAvgPrice =
          (currentAvgPrice * currentQuantity + stockPrice * quantity) /
          newQuantity;

        transaction.update(portfolioRef, {
          quantity: newQuantity,
          averagePrice: newAvgPrice,
          lastBuyTime: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.set(portfolioRef, {
          stockId: stockId,
          stockName: stockData.name,
          quantity: quantity,
          averagePrice: stockPrice,
          classCode: classCode,
          productType: stockData.productType || "stock",
          lastBuyTime: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 주식 거래량 업데이트
      transaction.update(stockRef, {
        buyVolume: admin.firestore.FieldValue.increment(quantity),
        recentBuyVolume: admin.firestore.FieldValue.increment(quantity),
      });

      // 국고 통계만 기록 (totalAmount 제외 - 국고=관리자cash)
      transaction.set(treasuryRef, {
        stockCommissionRevenue:
          admin.firestore.FieldValue.increment(commission),
        stockTaxRevenue: admin.firestore.FieldValue.increment(transactionTax),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 관리자에게 수수료+거래세 입금 (국고 = 관리자 cash)
      const taxRevenue = commission + transactionTax;
      if (adminRef && taxRevenue > 0) {
        const isAdminBuyer = adminRef.path === userRef.path;
        if (isAdminBuyer) {
          // 관리자 본인 매수: 차감액에서 세금 수입 상계
          // 이미 userRef에 -totalCost 했으므로 taxRevenue만큼 되돌림
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(taxRevenue),
          });
        } else {
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(taxRevenue),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // 🔥 [추가] 거래 후 잔액 계산 및 반환
      const newBalance = currentCash - totalCost;

      // ✅ idempotency mark (모든 write 끝난 후)
      markIdempotent(transaction, idemKeyRef);

      return {
        stockName: stockData.name,
        quantity: quantity,
        price: stockPrice,
        cost: cost,
        commission: commission,
        tax: transactionTax,
        totalCost: totalCost,
        newBalance: newBalance, // 거래 후 새 잔액
      };
    });

    logger.info(
      `[buyStock] ${uid}님이 ${result.stockName} ${result.quantity}주 매수 (총 ${result.totalCost}원)`,
    );

    return {
      success: true,
      message: `${result.stockName} ${result.quantity}주 매수 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[buyStock] Error for user ${uid}:`, error);
    throw new HttpsError(
      "aborted",
      error.message || "주식 매수에 실패했습니다.",
    );
  }
});

exports.sellStock = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { holdingId, quantity, idempotencyKey } = request.data;

  // 🧪 테스트 계정(alchan21) 매도 제한 우회용 플래그
  // — userData 어딘가에 'alchan21' 들어있으면 우회 (광범위 매칭으로 학생 doc 필드 변형 대응)
  const isTestAccount = (() => {
    try {
      return JSON.stringify(userData || {})
        .toLowerCase()
        .includes("alchan21");
    } catch {
      return false;
    }
  })();
  logger.info(`[sellStock] uid=${uid} isTestAccount=${isTestAccount}`);

  if (!holdingId || !quantity || quantity <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "유효한 보유 주식 ID와 수량을 입력해야 합니다.",
    );
  }

  // 🔥 보안: 정수 및 범위 검증
  if (!Number.isInteger(quantity) || quantity > 10000) {
    throw new HttpsError(
      "invalid-argument",
      "수량은 1~10000 사이의 정수여야 합니다.",
    );
  }

  if (!classCode) {
    throw new HttpsError(
      "failed-precondition",
      "학급 코드가 할당되지 않았습니다.",
    );
  }

  const userRef = db.collection("users").doc(uid);
  const portfolioRef = db
    .collection("users")
    .doc(uid)
    .collection("portfolio")
    .doc(holdingId);
  const treasuryRef = db.collection("nationalTreasuries").doc(classCode);

  // 관리자 조회 (세금 수입용)
  let sellAdminRef = null;
  const sellAdminSnap = await findApprovedAdminSnap(classCode);
  if (!sellAdminSnap.empty) {
    sellAdminRef = sellAdminSnap.docs[0].ref;
  }

  // 🔥 경제 이벤트 주식세금 멀티플라이어 사전 조회 (트랜잭션 외부)
  const stockTaxMult = await getStockTaxMultiplier(classCode);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🚨 서버측 idempotency check (read만)
      const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

      // 🔥 먼저 portfolioData에서 stockId를 가져오기 위해 포트폴리오를 읽어야 함
      const [userDoc, portfolioDoc] = await transaction.getAll(
        userRef,
        portfolioRef,
      );

      if (!userDoc.exists) {
        throw new Error("사용자 정보를 찾을 수 없습니다.");
      }

      if (!portfolioDoc.exists) {
        throw new Error("보유 주식 정보를 찾을 수 없습니다.");
      }

      const portfolioData = portfolioDoc.data();

      if (portfolioData.delistedAt) {
        throw new Error("상장폐지된 주식은 매도할 수 없습니다.");
      }

      const currentQuantity = portfolioData.quantity || 0;
      if (currentQuantity < quantity) {
        throw new Error(
          `보유 수량이 부족합니다. 보유: ${currentQuantity}주, 요청: ${quantity}주`,
        );
      }

      // 매수 후 1시간 이내 매도 제한 확인 (테스트 계정 alchan21은 우회)
      if (portfolioData.lastBuyTime && !isTestAccount) {
        const lastBuyTime = portfolioData.lastBuyTime.toDate
          ? portfolioData.lastBuyTime.toDate()
          : new Date(portfolioData.lastBuyTime);
        const timeSinceBuy = Date.now() - lastBuyTime.getTime();
        const LOCK_PERIOD = 60 * 60 * 1000; // 1시간 (60분)
        if (timeSinceBuy < LOCK_PERIOD) {
          const remainingMinutes = Math.ceil(
            (LOCK_PERIOD - timeSinceBuy) / 60000,
          );
          throw new Error(
            `매수 후 1시간 동안은 매도할 수 없습니다. 남은 시간: 약 ${remainingMinutes}분`,
          );
        }
      }

      // 🔥 이제 stockId를 알았으니 주식 정보를 읽음
      const stockRef = db
        .collection("CentralStocks")
        .doc(portfolioData.stockId);
      const [stockDoc] = await transaction.getAll(stockRef);

      if (!stockDoc.exists) {
        throw new Error("주식 정보를 찾을 수 없습니다.");
      }

      const stockData = stockDoc.data();

      if (!stockData.isListed) {
        throw new Error("상장되지 않은 주식은 매도할 수 없습니다.");
      }

      const stockPrice = stockData.price || 0;
      const sellPrice = stockPrice * quantity;
      const commission = Math.round(sellPrice * COMMISSION_RATE);

      // 양도소득세 계산
      const profit = (stockPrice - portfolioData.averagePrice) * quantity;
      const productType = stockData.productType || "stock";
      let profitTax = 0;
      if (profit > 0) {
        if (productType === "bond") {
          profitTax = Math.floor(profit * BOND_TAX_RATE * stockTaxMult);
        } else {
          profitTax = Math.floor(profit * TAX_RATE * stockTaxMult);
        }
      }

      // 거래세
      const transactionTax = Math.floor(
        sellPrice * TRANSACTION_TAX_RATE * stockTaxMult,
      );
      const totalTax = profitTax + transactionTax;
      const netRevenue = sellPrice - commission - totalTax;

      // 🔥 이제 모든 쓰기 작업 수행

      // 사용자 현금 증가
      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(netRevenue),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 거래 로그
      const stockSellTxRef = userRef.collection("transactions").doc();
      transaction.set(stockSellTxRef, {
        type: "stockSell",
        amount: netRevenue,
        description: `[주식 매도] ${stockData.name} ${quantity}주 × ${stockPrice.toLocaleString()}원 (수수료 ${commission.toLocaleString()}, 세금 ${totalTax.toLocaleString()}, 손익 ${profit.toLocaleString()})`,
        stockId: portfolioData.stockId,
        holdingId,
        stockName: stockData.name,
        quantity,
        price: stockPrice,
        commission,
        profitTax,
        transactionTax,
        profit,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 포트폴리오 업데이트 또는 삭제
      const remainingQuantity = currentQuantity - quantity;
      if (remainingQuantity > 0) {
        transaction.update(portfolioRef, {
          quantity: remainingQuantity,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(portfolioRef);
      }

      // 주식 거래량 업데이트
      transaction.update(stockRef, {
        sellVolume: admin.firestore.FieldValue.increment(quantity),
        recentSellVolume: admin.firestore.FieldValue.increment(quantity),
      });

      // 국고 통계만 기록 (totalAmount 제외 - 국고=관리자cash)
      transaction.set(treasuryRef, {
        stockCommissionRevenue:
          admin.firestore.FieldValue.increment(commission),
        stockTaxRevenue: admin.firestore.FieldValue.increment(totalTax),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 관리자에게 수수료+세금 입금 (국고 = 관리자 cash)
      const sellTaxRevenue = commission + totalTax;
      if (sellAdminRef && sellTaxRevenue > 0) {
        const isAdminSeller = sellAdminRef.path === userRef.path;
        if (isAdminSeller) {
          // 관리자 본인 매도: 이미 netRevenue로 차감된 세금을 되돌림
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(sellTaxRevenue),
          });
        } else {
          transaction.update(sellAdminRef, {
            cash: admin.firestore.FieldValue.increment(sellTaxRevenue),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // 🔥 [추가] 거래 후 잔액 계산 및 반환
      const userData = userDoc.data();
      const currentCash = userData.cash || 0;
      const newBalance = currentCash + netRevenue;

      // ✅ idempotency mark (모든 write 끝난 후)
      markIdempotent(transaction, idemKeyRef);

      return {
        stockName: stockData.name,
        quantity: quantity,
        sellPrice: sellPrice,
        commission: commission,
        totalTax: totalTax,
        profit: profit,
        netRevenue: netRevenue,
        newBalance: newBalance, // 거래 후 새 잔액
      };
    });

    return {
      success: true,
      message: `${result.stockName} ${result.quantity}주 매도 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[sellStock] Error for user ${uid}:`, error);
    throw new HttpsError(
      "aborted",
      error.message || "주식 매도에 실패했습니다.",
    );
  }
});

// ===================================================================================
// 🔥 아이템 시스템 함수 구현
// ===================================================================================

exports.getItemContextData = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);

    try {
      // 4개 독립 쿼리를 병렬로 실행 (성능 ~3x 개선)
      const [
        storeItemsSnapshot,
        userItemsSnapshot,
        marketListingsSnapshot,
        marketOffersSnapshot,
      ] = await Promise.all([
        db.collection("storeItems").where("classCode", "==", classCode).get(),
        db.collection("users").doc(uid).collection("inventory").get(),
        db
          .collection("marketListings")
          .where("classCode", "==", classCode)
          .where("status", "==", "active")
          .get(),
        db
          .collection("marketOffers")
          .where("sellerId", "==", uid)
          .where("status", "==", "pending")
          .get(),
      ]);

      const storeItems = storeItemsSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) => {
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
          }
          return a.name.localeCompare(b.name);
        });

      const userItems = userItemsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const itemId = data.itemId || doc.id;
        const storeItem = storeItems.find((item) => item.id === itemId);

        return {
          id: doc.id,
          ...data,
          itemId: itemId,
          name: data.name || (storeItem ? storeItem.name : "알 수 없는 아이템"),
          icon: data.icon || (storeItem ? storeItem.icon : "🔮"),
          description:
            data.description || (storeItem ? storeItem.description : ""),
          type: data.type || (storeItem ? storeItem.type : "general"),
          category: data.category || (storeItem ? storeItem.category : ""),
        };
      });

      const marketListings = marketListingsSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) => {
          const aTime = a.listedAt?.toMillis() || 0;
          const bTime = b.listedAt?.toMillis() || 0;
          return bTime - aTime;
        });

      const marketOffers = marketOffersSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) => {
          const aTime = a.offeredAt?.toMillis() || 0;
          const bTime = b.offeredAt?.toMillis() || 0;
          return bTime - aTime;
        });

      return {
        success: true,
        data: {
          storeItems,
          userItems,
          marketListings,
          marketOffers,
        },
      };
    } catch (error) {
      logger.error(`[getItemContextData] Error for user ${uid}:`, error);
      throw new HttpsError(
        "internal",
        error.message || "아이템 데이터 조회에 실패했습니다.",
      );
    }
  },
);

// 🔥 [읽기 절감 2단계] 카탈로그 버전 문서(catalogMeta/{classCode}) 갱신.
// 학생 클라이언트가 이 문서 1개를 onSnapshot 구독 → 버전 변경 시 세션 캐시를 버리고
// 즉시 재조회한다(관리자 가격/상품 변경의 실시간 전파). 실패는 비치명(TTL 27분으로 수렴).
const bumpCatalogVersion = async (classCode) => {
  if (!classCode) return;
  try {
    await db.collection("catalogMeta").doc(classCode).set(
      { version: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    logger.warn(`[bumpCatalogVersion] ${classCode} 갱신 실패(비치명):`, e);
  }
};

exports.updateStoreItem = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request, true); // 관리자 권한 필요
    const { itemId, updatesToApply } = request.data;

    if (
      !itemId ||
      !updatesToApply ||
      Object.keys(updatesToApply).length === 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "아이템 ID 또는 업데이트 데이터가 유효하지 않습니다.",
      );
    }

    const itemRef = db.collection("storeItems").doc(itemId);

    try {
      const itemDoc = await itemRef.get();

      if (!itemDoc.exists) {
        throw new Error("아이템을 찾을 수 없습니다.");
      }

      // updatedAt 타임스탬프 추가
      const updates = {
        ...updatesToApply,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      await itemRef.update(updates);
      await bumpCatalogVersion(itemDoc.data().classCode);

      logger.info(
        `[updateStoreItem] ${uid}님이 아이템 ${itemId} 수정: ${JSON.stringify(updatesToApply)}`,
      );

      return {
        success: true,
        message: "아이템이 성공적으로 수정되었습니다.",
      };
    } catch (error) {
      logger.error(`[updateStoreItem] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "아이템 수정에 실패했습니다.",
      );
    }
  },
);

const cors = require("cors")({
  origin: [
    "https://inconomysu-class.web.app",
    "https://inconomysu-class.firebaseapp.com",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
});
const { onRequest } = require("firebase-functions/v2/https");

// ... (other exports)

exports.addStoreItem = onRequest({ region: "asia-northeast3" }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    // Manually check auth
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(403).send("Unauthorized");
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      const userDocRef = db.collection("users").doc(uid);
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        return res.status(404).send("User not found in database.");
      }

      const userData = userDoc.data();
      const userIsAdmin = hasAdminPower(userData);

      if (!userIsAdmin) {
        return res.status(403).send("Permission denied. Admin role required.");
      }

      const { newItemData } = req.body.data;

      if (
        !newItemData ||
        !newItemData.name ||
        typeof newItemData.price !== "number"
      ) {
        return res
          .status(400)
          .send("Invalid item data. 'name' and 'price' are required.");
      }

      // 🔒 [보안] 가격 무결성 + 학급 고정: classCode를 클라 지정값이 아니라
      // 요청 관리자 본인 학급으로 강제(타 학급 경제 오염 방지). price 음수 차단.
      if (typeof newItemData.price !== "number" || !Number.isFinite(newItemData.price) || newItemData.price < 0) {
        return res.status(400).send("Invalid item data. 'price' must be a non-negative number.");
      }

      const itemData = {
        ...newItemData,
        classCode: userData.classCode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await db.collection("storeItems").add(itemData);
      await bumpCatalogVersion(userData.classCode);

      logger.info(
        `[addStoreItem] ${uid}님이 새 아이템 추가: ${newItemData.name} (ID: ${docRef.id})`,
      );

      res.status(200).send({
        data: {
          success: true,
          message: "아이템이 성공적으로 추가되었습니다.",
          itemId: docRef.id,
        },
      });
    } catch (error) {
      logger.error(`[addStoreItem] Error for token:`, error);
      if (error.code === "auth/id-token-expired") {
        return res.status(401).send("Authentication token has expired.");
      }
      return res.status(500).send("Internal Server Error: " + error.message);
    }
  });
});

exports.deleteStoreItem = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request, true); // 관리자 권한 필요
    const { itemId } = request.data;

    if (!itemId) {
      throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
    }

    const itemRef = db.collection("storeItems").doc(itemId);

    try {
      const itemDoc = await itemRef.get();

      if (!itemDoc.exists) {
        throw new Error("아이템을 찾을 수 없습니다.");
      }

      const itemData = itemDoc.data();
      await itemRef.delete();
      await bumpCatalogVersion(itemData.classCode);

      logger.info(
        `[deleteStoreItem] ${uid}님이 아이템 삭제: ${itemData.name} (ID: ${itemId})`,
      );

      return {
        success: true,
        message: "아이템이 성공적으로 삭제되었습니다.",
      };
    } catch (error) {
      logger.error(`[deleteStoreItem] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "아이템 삭제에 실패했습니다.",
      );
    }
  },
);

exports.purchaseStoreItem = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);
    const { itemId, quantity = 1, idempotencyKey } = request.data;

    if (!itemId || quantity <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 아이템 ID와 수량을 입력해야 합니다.",
      );
    }

    // 🔥 보안: 정수 및 범위 검증
    if (!Number.isInteger(quantity) || quantity > 100) {
      throw new HttpsError(
        "invalid-argument",
        "수량은 1~100 사이의 정수여야 합니다.",
      );
    }

    const userRef = db.collection("users").doc(uid);
    const itemRef = db.collection("storeItems").doc(itemId);
    const userItemRef = userRef.collection("inventory").doc(itemId);
    const treasuryRef = db.collection("nationalTreasuries").doc(classCode);

    // VAT 세율 조회
    let itemStoreVATRate = 0.1; // 기본 10%
    try {
      const govDoc = await db.doc(`governments/${classCode}`).get();
      if (govDoc.exists) {
        const vatRate = govDoc.data()?.taxSettings?.itemStoreVATRate;
        if (vatRate !== undefined) itemStoreVATRate = vatRate;
      }
    } catch (e) {
      logger.warn(
        "[purchaseStoreItem] VAT 세율 조회 실패, 기본값 사용:",
        e.message,
      );
    }

    // 재고 보충 비용을 관리자에게 청구하기 위해 관리자 찾기
    let adminRef = null;
    const adminSnapshot = await findApprovedAdminSnap(classCode);

    if (!adminSnapshot.empty) {
      adminRef = adminSnapshot.docs[0].ref;
    }

    try {
      // 🔥 Transaction으로 변경하여 원자적 처리 및 재고 보충 정보 포함
      const result = await db.runTransaction(async (transaction) => {
        // 🚨 서버측 idempotency check (read만)
        const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

        // 모든 읽기 작업을 먼저 수행
        // [0]=user, [1]=item, [2]=userItem, [3]=admin(optional)
        const readPromises = [
          transaction.get(userRef),
          transaction.get(itemRef),
          transaction.get(userItemRef),
        ];

        // 관리자 문서도 읽기 (재고 보충 시 필요)
        if (adminRef) {
          readPromises.push(transaction.get(adminRef));
        }

        const results = await Promise.all(readPromises);
        const [userDoc, itemDoc, userItemDoc] = results;
        const adminDoc = adminRef ? results[3] : null;

        if (!userDoc.exists) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }

        if (!itemDoc.exists) {
          throw new Error("아이템을 찾을 수 없습니다.");
        }

        const userData = userDoc.data();
        const itemData = itemDoc.data();

        // 🔒 [보안] 학급 격리: 전역 storeItems 컬렉션이라 타 학급 아이템 ID로도
        // 문서를 읽을 수 있다. 호출자 학급과 아이템 학급이 다르면 차단
        // (멀티테넌시 격리 붕괴·타 학급 고가 아이템 악용 방지).
        if (itemData.classCode && itemData.classCode !== classCode) {
          throw new Error("다른 학급의 아이템은 구매할 수 없습니다.");
        }

        // 🔒 [보안] 가격 무결성: price가 음수/비유한이면 totalCost가 음수가 되어
        // 잔액 검사를 무력화하고 구매가 곧 현금 생성이 된다(오염 데이터 방어).
        if (typeof itemData.price !== "number" || !Number.isFinite(itemData.price) || itemData.price < 0) {
          throw new Error("아이템 가격이 올바르지 않습니다.");
        }

        // 품절(stock=0)인데 자동충전 설정이 있으면 먼저 충전
        let preRestocked = false;
        let currentPrice = itemData.price;
        let currentStock =
          itemData.stock !== undefined ? itemData.stock : Infinity;

        if (
          itemData.stock !== undefined &&
          currentStock === 0 &&
          (itemData.initialStock || itemData.initialStock === undefined)
        ) {
          const initialStock = itemData.initialStock || 10;
          const priceIncreasePercentage =
            itemData.priceIncreasePercentage || 10;
          currentStock = initialStock;
          currentPrice = Math.round(
            itemData.price * (1 + priceIncreasePercentage / 100),
          );
          preRestocked = true;
          logger.info(
            `[purchaseStoreItem] ${itemData.name} 품절 상태에서 구매 시도 -> 선충전: 재고 ${initialStock}개, 가격 ${itemData.price}원 -> ${currentPrice}원`,
          );
        }

        const totalCost = currentPrice * quantity;
        const currentCash = userData.cash || 0;

        if (currentCash < totalCost) {
          throw new Error(
            `현금이 부족합니다. 필요: ${totalCost.toLocaleString()}원, 보유: ${currentCash.toLocaleString()}원`,
          );
        }

        // 재고 확인 (stock 필드가 있는 경우에만)
        if (itemData.stock !== undefined && currentStock < quantity) {
          throw new Error(
            `재고가 부족합니다. 요청: ${quantity}개, 재고: ${currentStock}개`,
          );
        }

        const newStock = currentStock - quantity;

        // 품절 시 재고 보충 및 가격 인상 계산
        let restocked = preRestocked;
        let finalStock = newStock;
        let finalPrice = currentPrice;
        let restockCost = 0;

        // 🔥 재고 보충 비용 = 도매 매입가 (정가의 30%)
        //   이전엔 100%였으나 관리자 적자가 누적되던 문제로 정책 변경.
        //   실제 정부 운영처럼 정가-도매 차익(70%)이 관리자 마진으로 확보됨.
        const WHOLESALE_COST_RATIO = 0.3;

        // 선충전 시 관리자 비용 계산
        if (preRestocked) {
          const initialStock = itemData.initialStock || 10;
          restockCost = Math.round(itemData.price * initialStock * WHOLESALE_COST_RATIO);
          if (adminDoc && adminDoc.exists) {
            const adminData = adminDoc.data();
            logger.info(
              `[purchaseStoreItem] 선충전 관리자 비용: ${restockCost.toLocaleString()}원 (도매가 30%, 보유: ${(adminData.cash || 0).toLocaleString()}원)`,
            );
          } else {
            restockCost = 0;
          }
        }

        if (itemData.stock !== undefined && newStock === 0 && !preRestocked) {
          restocked = true;
          const initialStock = itemData.initialStock || 10;
          const priceIncreasePercentage =
            itemData.priceIncreasePercentage || 10;
          finalStock = initialStock;
          finalPrice = Math.round(
            itemData.price * (1 + priceIncreasePercentage / 100),
          );

          // 재고 보충 비용 = 정가 * 보충 수량 * 30% (도매가)
          restockCost = Math.round(itemData.price * initialStock * WHOLESALE_COST_RATIO);

          // 관리자 잔액 확인 (부족해도 마이너스로 충전 진행)
          if (adminDoc && adminDoc.exists) {
            const adminData = adminDoc.data();
            const adminCash = adminData.cash || 0;
            if (adminCash < restockCost) {
              logger.info(
                `[purchaseStoreItem] 재고 보충 - 관리자 잔액 부족하지만 진행 (필요: ${restockCost.toLocaleString()}원, 보유: ${adminCash.toLocaleString()}원, 차감 후: ${(adminCash - restockCost).toLocaleString()}원)`,
              );
            }
          } else {
            // 관리자 없으면 비용 청구 없이 재고만 보충
            logger.info(
              `[purchaseStoreItem] 재고 보충 - 관리자 계정 없음, 비용 없이 보충`,
            );
            restockCost = 0;
          }

          if (restocked) {
            logger.info(
              `[purchaseStoreItem] ${itemData.name} 품절 -> 재고 ${initialStock}개 보충, 가격 ${itemData.price}원 -> ${finalPrice}원 (${priceIncreasePercentage}% 인상), 관리자 비용: ${restockCost.toLocaleString()}원`,
            );
          }
        }

        // 모든 쓰기 작업 수행
        const isAdminBuyer = adminRef && adminRef.path === userRef.path;

        // 🎰 랜덤뽑기 하루 구입 제한 (학생당 하루 3개까지, 관리자 제외)
        let drawDayKey = null;
        let drawNewCount = 0;
        if (itemData.type === "randomDraw" && !isAdminBuyer) {
          const DAILY_DRAW_LIMIT = 3;
          const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
          drawDayKey = `${nowKst.getUTCFullYear()}-${String(
            nowKst.getUTCMonth() + 1,
          ).padStart(2, "0")}-${String(nowKst.getUTCDate()).padStart(2, "0")}`;
          const prevCount =
            userData.dailyDrawDate === drawDayKey
              ? userData.dailyDrawCount || 0
              : 0;
          drawNewCount = prevCount + quantity;
          if (drawNewCount > DAILY_DRAW_LIMIT) {
            throw new Error(
              `랜덤뽑기는 하루 ${DAILY_DRAW_LIMIT}개까지만 구입할 수 있어요. (오늘 ${prevCount}개 구입)`,
            );
          }
        }

        // 🛒 일반 아이템 하루 구매 제한 (아이템마다 하루 5개까지, 뽑기·관리자 제외)
        //    user 문서의 자기-날짜 맵 dailyItemBuy[itemId]={date,count} — 전역 리셋 불필요,
        //    인벤토리 삭제와 무관하게 유지(구매 후 사용해 doc 지워도 카운트 보존).
        let itemBuyDayKey = null;
        let itemBuyNewCount = 0;
        if (itemData.type !== "randomDraw" && !isAdminBuyer) {
          const DAILY_ITEM_BUY_LIMIT = 5;
          const nowKstB = new Date(Date.now() + 9 * 60 * 60 * 1000);
          itemBuyDayKey = `${nowKstB.getUTCFullYear()}-${String(
            nowKstB.getUTCMonth() + 1,
          ).padStart(2, "0")}-${String(nowKstB.getUTCDate()).padStart(2, "0")}`;
          const buyEntry = userData.dailyItemBuy?.[itemId];
          const prevBuy =
            buyEntry?.date === itemBuyDayKey ? buyEntry.count || 0 : 0;
          itemBuyNewCount = prevBuy + quantity;
          if (itemBuyNewCount > DAILY_ITEM_BUY_LIMIT) {
            throw new Error(
              `이 아이템은 하루 ${DAILY_ITEM_BUY_LIMIT}개까지만 살 수 있어요. (오늘 ${prevBuy}개 구입)`,
            );
          }
        }

        // 학생 구매 시 관리자에게 추가 세금 수익 (상점 판매세)
        // 관리자 본인 구매 시에는 세금 없음
        const shopSalesTax = !isAdminBuyer
          ? Math.round(totalCost * itemStoreVATRate)
          : 0;

        // 관리자 cash 변동 계산: +구매금(매출) +판매세 -재고보충비
        const adminCashDelta = totalCost + shopSalesTax - (restocked ? restockCost : 0);

        if (isAdminBuyer) {
          // 관리자 본인 구매: 구매비 차감 + 매출 입금 + 보충비 차감을 합산
          // 순변동 = -totalCost(구매) + totalCost(매출) - restockCost(보충) = -restockCost
          const netDeduction = restocked ? restockCost : 0;
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(-netDeduction),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // 학생 구매: 학생에게서 차감
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(-totalCost),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // 🎰 랜덤뽑기면 하루 구입 카운트 갱신(날짜 바뀌면 자동 리셋)
            ...(drawDayKey
              ? { dailyDrawDate: drawDayKey, dailyDrawCount: drawNewCount }
              : {}),
            // 🛒 일반 아이템 itemId별 하루 구매 카운트 갱신
            ...(itemBuyDayKey
              ? {
                  [`dailyItemBuy.${itemId}`]: {
                    date: itemBuyDayKey,
                    count: itemBuyNewCount,
                  },
                }
              : {}),
          });

          // 거래 로그
          const storeBuyTxRef = userRef.collection("transactions").doc();
          transaction.set(storeBuyTxRef, {
            type: "storePurchase",
            amount: -totalCost,
            description: `[관리자 상점] ${itemData.name} ${quantity}개 (단가 ${(totalCost / quantity).toLocaleString()}원)`,
            itemId,
            itemName: itemData.name,
            quantity,
            unitPrice: itemData.price,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 관리자에게: 구매 매출 + 판매세 입금 - 재고보충비 차감
          if (adminRef) {
            transaction.update(adminRef, {
              cash: admin.firestore.FieldValue.increment(adminCashDelta),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // 재고 업데이트 (stock 필드가 있는 경우에만)
        if (itemData.stock !== undefined) {
          const stockUpdate = {
            stock: finalStock,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          // 재고 보충 시 가격도 업데이트
          if (restocked) {
            stockUpdate.price = finalPrice;
          }

          transaction.update(itemRef, stockUpdate);
        }

        // 사용자 아이템에 추가
        if (userItemDoc.exists) {
          transaction.update(userItemRef, {
            quantity: admin.firestore.FieldValue.increment(quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          const newItemData = {
            itemId: itemId,
            name: itemData.name || "",
            quantity: quantity,
            acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          // optional 필드들만 추가
          if (itemData.category) newItemData.category = itemData.category;
          if (itemData.description)
            newItemData.description = itemData.description;
          if (itemData.effect) newItemData.effect = itemData.effect;
          if (itemData.type) newItemData.type = itemData.type;
          if (itemData.icon) newItemData.icon = itemData.icon;
          // 🎰 랜덤뽑기 메타 복사 (사용 시점에 storeItem 삭제돼도 동작 + MyItems 타입 분기)
          if (itemData.type === "randomDraw") {
            newItemData.drawSource = itemData.drawSource || "food";
            newItemData.loseEnabled = itemData.loseEnabled === true;
            newItemData.losePercent = Number(itemData.losePercent) || 0;
            newItemData.drawCandidates = Array.isArray(itemData.drawCandidates)
              ? itemData.drawCandidates
              : [];
          }

          transaction.set(userItemRef, newItemData);
        }

        // 국고 통계에 부가세(VAT) 기록 (totalAmount 제외 - 국고=관리자cash)
        const vatAmount = Math.round(
          (totalCost * itemStoreVATRate) / (1 + itemStoreVATRate),
        );
        if (vatAmount > 0) {
          transaction.set(treasuryRef, {
            vatRevenue: admin.firestore.FieldValue.increment(vatAmount),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        // ✅ idempotency mark (모든 write 끝난 후)
        markIdempotent(transaction, idemKeyRef);

        // 트랜잭션 결과 반환
        return {
          itemName: itemData.name,
          quantity: quantity,
          totalCost: totalCost,
          vatAmount: vatAmount,
          shopSalesTax: shopSalesTax,
          restocked: restocked,
          newStock: finalStock,
          newPrice: finalPrice,
          restockCost: restockCost,
        };
      });

      // 재입고 = 카탈로그 가격 인상(+10%) → 전 학생 캐시 무효화 신호.
      // 일반 구매(재고 감소만)는 bump하지 않음 — 캐시 절감 효과 보존.
      if (result.restocked) {
        await bumpCatalogVersion(classCode);
      }

      logger.info(
        `[purchaseStoreItem] ${uid}님이 ${result.itemName} ${result.quantity}개 구매 (${result.totalCost.toLocaleString()}원)${result.shopSalesTax > 0 ? ` [판매세 ${result.shopSalesTax.toLocaleString()}원 → 관리자]` : ""}${result.restocked ? ` [재고 자동 보충됨 - 관리자 비용: ${result.restockCost.toLocaleString()}원]` : ""}`,
      );

      return {
        success: true,
        message: `${result.itemName} ${result.quantity}개 구매 완료`,
        ...result,
      };
    } catch (error) {
      logger.error(`[purchaseStoreItem] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "아이템 구매에 실패했습니다.",
      );
    }
  },
);

// 💰 학생이 보유 아이템을 국고(=관리자 cash)에 되팔기.
//    되팔기 단가 = 현재 상점가 × 70% (30% 할인). 시세는 서버가 storeItems에서
//    직접 읽어 결정(클라 가격 신뢰 안 함 — 치팅 방지).
//    - 자격: 상점에 현재 판매중인 아이템만(storeItems 존재 + available!==false).
//      삭제·판매중지된 아이템(선물·뽑기로 받은 것 포함)은 되팔기 불가 → 국고 고갈 통제.
//    - 무한증식 불가: VAT 포함 구매가(110%)보다 항상 싸게(70%) 팔리므로 차익거래 구조상 X.
//    - 안전망: 클라 lock + 서버 idempotency + increment + 거래로그(audit) + 국고 통계.
//    - 상점 재고(stock)는 건드리지 않음(국고 연동 = 현금만; 자동보충 가격로직과 분리).
const TREASURY_BUYBACK_RATIO = 0.7;
exports.sellItemToTreasury = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);
    const { itemId, quantity = 1, idempotencyKey } = request.data;

    if (!itemId || typeof itemId !== "string") {
      throw new HttpsError("invalid-argument", "유효한 아이템 ID가 필요합니다.");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new HttpsError(
        "invalid-argument",
        "수량은 1~100 사이의 정수여야 합니다.",
      );
    }

    const userRef = db.collection("users").doc(uid);
    const itemRef = db.collection("storeItems").doc(itemId);
    let userItemRef = userRef.collection("inventory").doc(itemId);
    const treasuryRef = db.collection("nationalTreasuries").doc(classCode);

    // 국고 지출처(관리자/교사) 찾기 — isAdmin 우선, 없으면 레거시 isTeacher 폴백.
    // (isTeacher만 설정된 교사 계정 학급에서 되팔기가 막히던 문제 방지. resetCouponGoal 선례)
    let adminRef = null;
    const adminSnapshot = await findApprovedAdminSnap(classCode);
    if (!adminSnapshot.empty) {
      adminRef = adminSnapshot.docs[0].ref;
    } else {
      const teacherSnapshot = await db
        .collection("users")
        .where("classCode", "==", classCode)
        .where("isTeacher", "==", true)
        .limit(1)
        .get();
      if (!teacherSnapshot.empty) {
        adminRef = teacherSnapshot.docs[0].ref;
      }
    }

    try {
      const result = await db.runTransaction(async (transaction) => {
        // 🚨 서버측 idempotency check (read만, 첫 줄)
        const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

        // 모든 읽기 먼저 (write 전)
        const [itemDoc, adminDoc] = await Promise.all([
          transaction.get(itemRef),
          adminRef ? transaction.get(adminRef) : Promise.resolve(null),
        ]);
        let userItemDoc = await transaction.get(userItemRef);
        // 🔁 인벤토리 doc id가 itemId와 다른 레거시(정규화 이전) 아이템 폴백:
        //    doc(itemId)로 못 찾으면 itemId 필드로 조회해 실제 보유 문서를 찾는다.
        //    (구매·선물·뽑기당첨·함께구매는 doc id=itemId지만, 정규화 전 아이템은
        //     랜덤 doc id일 수 있어 학생만 "보유 안 함"으로 되팔기 실패하던 케이스)
        if (!userItemDoc.exists) {
          const invQuery = userRef
            .collection("inventory")
            .where("itemId", "==", itemId)
            .limit(1);
          const invQSnap = await transaction.get(invQuery);
          if (!invQSnap.empty) {
            userItemDoc = invQSnap.docs[0];
            userItemRef = invQSnap.docs[0].ref;
          }
        }

        // 보유 수량 검증
        if (!userItemDoc.exists) {
          throw new Error("되팔 아이템을 보유하고 있지 않습니다.");
        }
        const invData = userItemDoc.data();
        const rawQty = Number(invData.quantity);
        const currentQty = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 0;
        if (currentQty < quantity) {
          throw new Error(
            `아이템 수량이 부족합니다. (보유: ${currentQty}개, 요청: ${quantity}개)`,
          );
        }

        // 상점 판매중 여부 검증 (자격: storeItems 존재 + available!==false)
        if (!itemDoc.exists) {
          throw new Error(
            "국고에서 더이상 취급하지 않는 아이템이라 되팔 수 없어요.",
          );
        }
        const storeData = itemDoc.data();
        // 🔒 [보안] 학급 격리: 전역 storeItems라 타 학급 고가 아이템 ID로 되팔면
        // 그 학급 가격의 70%를 본인 학급 국고에서 현금화할 수 있다(멀티테넌시 붕괴).
        if (storeData.classCode && storeData.classCode !== classCode) {
          throw new Error("다른 학급의 아이템은 국고에 되팔 수 없어요.");
        }
        if (storeData.available === false) {
          throw new Error("판매중지된 아이템이라 국고에 되팔 수 없어요.");
        }
        // 🚫 가치 고정 아이템(자유시간 등)은 되팔기 불가
        //    (물가 이벤트 제외와 동일 판별: excludeFromEconomicEvent 플래그 또는 "자유시간" 이름)
        if (isStorePriceEventExcluded(storeData)) {
          throw new Error(
            `'${storeData.name || "이 아이템"}'은(는) 국고에 되팔 수 없는 아이템이에요.`,
          );
        }
        const storePrice = Number(storeData.price);
        if (!Number.isFinite(storePrice) || storePrice <= 0) {
          throw new Error("상점 가격 정보가 올바르지 않아 되팔 수 없어요.");
        }

        // 🚨 국고(관리자) 없으면 지급 불가 — 되팔기는 돈을 '생성'하므로
        //    지출처 없이 학생 cash만 늘리면 통화량 무단 증가(구매와 반대).
        if (!adminRef || !adminDoc || !adminDoc.exists) {
          throw new Error(
            "국고(관리자)를 찾을 수 없어 지금은 되팔 수 없어요. 선생님께 문의하세요.",
          );
        }

        // 되팔기 단가 = 현재 상점가 × 70% (최소 1원)
        const unitPrice = Math.max(
          1,
          Math.round(storePrice * TREASURY_BUYBACK_RATIO),
        );
        const totalGain = unitPrice * quantity;
        const itemName = storeData.name || invData.name || "아이템";
        // 판매자 == 국고 보유자(관리자/교사 본인)면 순변동 0 — 같은 문서에 +/- 이중
        // increment가 last-write-wins로 깨지지 않게 cash 변동 자체를 생략한다.
        const isSelfTreasury = adminRef.path === userRef.path;

        // --- 쓰기 ---
        // 1) 학생 인벤토리 차감 (0이면 문서 삭제)
        const newInvQty = currentQty - quantity;
        if (newInvQty <= 0) {
          transaction.delete(userItemRef);
        } else {
          transaction.update(userItemRef, {
            quantity: admin.firestore.FieldValue.increment(-quantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 2) 학생 cash 증액 + 4) 국고 차감 — 자기판매(seller==국고)면 순변동 0이라 생략
        if (!isSelfTreasury) {
          // 🔒 [보안] 국고 하한: 지급 전 국고 잔액이 지급액 이상인지 검사.
          // 없으면 반복 되팔기로 국고(관리자 cash)가 무한 음수로 내려간다.
          const adminCash = Number(adminDoc.data()?.cash) || 0;
          if (adminCash < totalGain) {
            throw new Error(
              "국고 잔액이 부족해 지금은 되팔 수 없어요. 선생님께 문의하세요.",
            );
          }
          // 학생 cash 증액 (increment 필수)
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(totalGain),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          // 국고(=관리자 cash) 차감 (위에서 존재 보장됨)
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(-totalGain),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 3) 거래 로그(audit) — 자기판매면 순변동 0 기록
        const loggedAmount = isSelfTreasury ? 0 : totalGain;
        const txRef = userRef.collection("transactions").doc();
        transaction.set(txRef, {
          type: "treasurySellback",
          amount: loggedAmount,
          description: isSelfTreasury
            ? `[국고 되팔기] ${itemName} ${quantity}개 (본인 국고, 현금 변동 없음)`
            : `[국고 되팔기] ${itemName} ${quantity}개 (단가 ${unitPrice.toLocaleString()}원)`,
          itemId,
          itemName,
          quantity,
          unitPrice,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 5) 국고 통계 기록 (totalAmount 제외 - 국고=관리자cash 규약)
        if (!isSelfTreasury) {
          transaction.set(
            treasuryRef,
            {
              buybackPayout: admin.firestore.FieldValue.increment(totalGain),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }

        // ✅ idempotency mark (모든 write 끝난 후)
        markIdempotent(transaction, idemKeyRef);

        return {
          itemName,
          quantity,
          unitPrice,
          totalGain: loggedAmount,
          newInvQty,
        };
      });

      logger.info(
        `[sellItemToTreasury] ${uid}님이 ${result.itemName} ${result.quantity}개를 국고에 되팔기 (+${result.totalGain.toLocaleString()}원, 단가 ${result.unitPrice.toLocaleString()}원)`,
      );

      return {
        success: true,
        message: `${result.itemName} ${result.quantity}개를 국고에 ${result.totalGain.toLocaleString()}원에 되팔았어요.`,
        ...result,
      };
    } catch (error) {
      logger.error(`[sellItemToTreasury] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "국고 되팔기에 실패했습니다.",
      );
    }
  },
);

exports.useUserItem = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid } = await checkAuthAndGetUserData(request);
  const { itemId, quantityToUse = 1 } = request.data;

  if (!itemId) {
    throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
  }

  // 🔒 [보안] NaN 방어: quantityToUse가 문자열/객체면 Math.max(1, Math.floor(NaN))=NaN이라
  // (Math.max는 NaN을 1로 보정하지 못함) 이후 cash effect가 increment(NaN)으로 커밋돼
  // 사용자 cash가 영구 NaN 오염된다. 정수 검증으로 원천 차단.
  const qty = Number(quantityToUse);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    throw new HttpsError("invalid-argument", "사용 수량은 1~100 사이의 정수여야 합니다.");
  }
  const useQty = qty;
  const userRef = db.collection("users").doc(uid);
  const userItemRef = userRef.collection("inventory").doc(itemId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 모든 읽기 먼저 (write 전)
      const [userItemDoc, userDoc] = await Promise.all([
        transaction.get(userItemRef),
        transaction.get(userRef),
      ]);

      if (!userItemDoc.exists) {
        throw new Error("아이템을 찾을 수 없습니다.");
      }

      const itemData = userItemDoc.data();
      const currentQuantity = itemData.quantity || 0;

      if (currentQuantity < useQty) {
        throw new Error(`아이템 수량이 부족합니다. (보유: ${currentQuantity}, 요청: ${useQty})`);
      }

      // 🪄 일반 아이템 하루 사용 제한 (아이템마다 하루 5개까지, 관리자·교사 제외)
      //    user 문서의 자기-날짜 맵 dailyItemUse[itemId]={date,count}
      const userData = userDoc.exists ? userDoc.data() : {};
      const isUseExempt = hasTeacherPower(userData);
      let useDayKey = null;
      let useNewCount = 0;
      if (!isUseExempt) {
        const DAILY_ITEM_USE_LIMIT = 5;
        const nowKstU = new Date(Date.now() + 9 * 60 * 60 * 1000);
        useDayKey = `${nowKstU.getUTCFullYear()}-${String(
          nowKstU.getUTCMonth() + 1,
        ).padStart(2, "0")}-${String(nowKstU.getUTCDate()).padStart(2, "0")}`;
        const useEntry = userData.dailyItemUse?.[itemId];
        const prevUse = useEntry?.date === useDayKey ? useEntry.count || 0 : 0;
        useNewCount = prevUse + useQty;
        if (useNewCount > DAILY_ITEM_USE_LIMIT) {
          throw new Error(
            `이 아이템은 하루 ${DAILY_ITEM_USE_LIMIT}개까지만 사용할 수 있어요. (오늘 ${prevUse}개 사용)`,
          );
        }
      }

      // 유저 문서 갱신: 현금 효과(있으면) + itemId별 하루 사용 카운트
      const cashAmount =
        itemData.effect && itemData.effect.type === "cash"
          ? (itemData.effect.value || 0) * useQty
          : 0;
      const userUpdate = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (cashAmount !== 0) {
        userUpdate.cash = admin.firestore.FieldValue.increment(cashAmount);
      }
      if (useDayKey) {
        userUpdate[`dailyItemUse.${itemId}`] = {
          date: useDayKey,
          count: useNewCount,
        };
      }
      transaction.update(userRef, userUpdate);

      // 아이템 수량 감소 (요청한 수량만큼)
      const newQuantity = currentQuantity - useQty;
      if (newQuantity > 0) {
        transaction.update(userItemRef, {
          quantity: newQuantity,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(userItemRef);
      }

      return {
        itemName: itemData.name,
        effect: itemData.effect,
      };
    });

    logger.info(`[useUserItem] ${uid}님이 ${result.itemName} ${useQty}개 사용`);

    return {
      success: true,
      message: `${result.itemName} 사용 완료`,
      ...result,
    };
  } catch (error) {
    logger.error(`[useUserItem] Error for user ${uid}:`, error);
    throw new HttpsError(
      "aborted",
      error.message || "아이템 사용에 실패했습니다.",
    );
  }
});

// 🎁 아이템 선물: 클라이언트가 남의 인벤토리에 직접 쓰던 방식을 서버 원자 처리로 이관.
//    2026-07-10 사건: 무기록 클라 선물로 아이템이 추적 불가하게 이동(피해 학생은 "사라졌다"고 인지).
//    - 같은 학급끼리만, 본인→본인 금지, 서버 idempotency + 클라 lock
//    - 양측 activity_logs + users/{uid}/transactions audit 의무 (financial-saas 4단계 안전망)
//    - 받은 문서에 receivedFrom/설명("OO님에게 선물받음") 명시 → "사지도 않은 게 생겼다" 혼란 차단
//    - 수신 doc id = itemId 규약 유지 + itemId 필드 폴백 조회로 레거시 랜덤 id 문서 덮어쓰기 방지
exports.giftItem = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { recipientUid, itemId, quantity = 1, idempotencyKey } = request.data;

  if (!recipientUid || typeof recipientUid !== "string") {
    throw new HttpsError("invalid-argument", "받는 사람 정보가 필요합니다.");
  }
  if (recipientUid === uid) {
    throw new HttpsError("invalid-argument", "자기 자신에게는 선물할 수 없습니다.");
  }
  if (!itemId || typeof itemId !== "string") {
    throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
  }
  // 형식 가드: Firestore 문서 id로 쓰이므로 길이·경로문자 제한 (정보노출·경로에러 방지)
  if (
    recipientUid.length > 128 || itemId.length > 128 ||
    recipientUid.includes("/") || itemId.includes("/")
  ) {
    throw new HttpsError("invalid-argument", "잘못된 요청 형식입니다.");
  }
  // 🔒 idempotencyKey 필수 — 생략 호출로 중복차단(dedupe)을 우회하지 못하게 한다
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
    throw new HttpsError("invalid-argument", "선물 수량은 1~100 사이의 정수여야 합니다.");
  }

  const senderRef = db.collection("users").doc(uid);
  const recipientRef = db.collection("users").doc(recipientUid);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🚨 idempotency check (read, 첫 줄)
      const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

      // --- 읽기 전부 먼저 ---
      const recipientSnap = await transaction.get(recipientRef);
      if (!recipientSnap.exists) {
        throw new Error("받는 사람을 찾을 수 없습니다.");
      }
      const recipientData = recipientSnap.data();
      if (!classCode || recipientData.classCode !== classCode) {
        throw new Error("같은 학급 친구에게만 선물할 수 있습니다.");
      }

      // 보내는 사람 보유 문서: doc(itemId) 우선 + itemId 필드 폴백(레거시 랜덤 id)
      const senderInvRef = senderRef.collection("inventory");
      const senderDocs = [];
      const primarySnap = await transaction.get(senderInvRef.doc(itemId));
      if (primarySnap.exists) {
        senderDocs.push(primarySnap);
      }
      const fallbackQSnap = await transaction.get(
        senderInvRef.where("itemId", "==", itemId).limit(50),
      );
      fallbackQSnap.docs.forEach((d) => {
        if (!senderDocs.some((s) => s.id === d.id)) senderDocs.push(d);
      });
      const totalOwned = senderDocs.reduce(
        (s, d) => s + (Number(d.data().quantity) || 0),
        0,
      );
      if (senderDocs.length === 0 || totalOwned < 1) {
        throw new Error("보유 중인 아이템을 찾을 수 없습니다.");
      }
      if (totalOwned < qty) {
        throw new Error(
          `아이템 수량이 부족합니다. (보유: ${totalOwned}, 요청: ${qty})`,
        );
      }
      const itemData = senderDocs[0].data();
      const itemKey = itemData.itemId || senderDocs[0].id;

      // 🔒 카탈로그 대조: 인벤토리 문서는 본인이 클라에서 위조 가능하므로(rules상 owner write 허용),
      //    선물 지급 메타(name/icon/type/뽑기메타)는 정식 카탈로그(storeItems 또는 shopProducts)에서만 가져온다.
      //    카탈로그에 없는 itemKey는 선물 불가(fail-closed) — 위조 아이템을 "선물"로 세탁하는 경로 차단.
      let canonical = null;
      const storeItemSnap = await transaction.get(
        db.collection("storeItems").doc(itemKey),
      );
      if (storeItemSnap.exists) {
        const s = storeItemSnap.data();
        // 학급 격리: 타 학급 상점 아이템 키로는 선물 불가
        if (s.classCode && s.classCode !== classCode) {
          throw new Error("우리 학급 아이템만 선물할 수 있어요.");
        }
        canonical = s;
      } else if (itemKey.startsWith("ps_")) {
        const productSnap = await transaction.get(
          db.collection("shopProducts").doc(itemKey.slice(3)),
        );
        if (productSnap.exists) {
          const p = productSnap.data();
          if (p.classCode && p.classCode !== classCode) {
            throw new Error("우리 학급 아이템만 선물할 수 있어요.");
          }
          canonical = p;
        }
      }
      if (!canonical) {
        throw new Error("상점에 등록된 아이템만 선물할 수 있어요.");
      }

      // 받는 사람 기존 문서: doc(itemKey) 우선 + itemId 필드 폴백 → set 덮어쓰기 방지
      const recipientInvRef = recipientRef.collection("inventory");
      let recipientItemSnap = await transaction.get(recipientInvRef.doc(itemKey));
      if (!recipientItemSnap.exists) {
        const rq = await transaction.get(
          recipientInvRef.where("itemId", "==", itemKey).limit(1),
        );
        if (!rq.empty) recipientItemSnap = rq.docs[0];
      }

      // --- 쓰기 ---
      // 1) 보내는 사람 차감 (수량 적은 문서부터, 0이면 삭제)
      let remaining = qty;
      const sorted = [...senderDocs].sort(
        (a, b) => (Number(a.data().quantity) || 0) - (Number(b.data().quantity) || 0),
      );
      for (const snap of sorted) {
        if (remaining <= 0) break;
        // 음수 수량 오염 문서 방어: deduct가 음수가 되어 remaining이 늘어나는 것 차단
        const cur = Math.max(0, Number(snap.data().quantity) || 0);
        const deduct = Math.min(cur, remaining);
        if (deduct <= 0) continue;
        if (cur - deduct <= 0) {
          transaction.delete(snap.ref);
        } else {
          transaction.update(snap.ref, {
            quantity: admin.firestore.FieldValue.increment(-deduct),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        remaining -= deduct;
      }
      // 불변식: 차감 총량 == qty. 미달이면 지급 전에 전체 트랜잭션 중단(아이템 생성 방지)
      if (remaining > 0) {
        throw new Error("아이템 차감에 실패했습니다. 다시 시도해주세요.");
      }

      // 2) 받는 사람 지급 (기존 문서면 increment, 없으면 생성)
      const senderName = userData?.name || "익명";
      const recipientName = recipientData.name || "익명";
      if (recipientItemSnap.exists) {
        transaction.update(recipientItemSnap.ref, {
          quantity: admin.firestore.FieldValue.increment(qty),
          // 기존 문서(구매분 등)의 출처 필드는 보존하고, 최근 선물 출처만 별도 기록
          lastGiftFrom: uid,
          lastGiftFromName: senderName,
          lastGiftAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // 메타는 카탈로그(canonical)에서만 — 보낸 사람 인벤토리 문서의 name/type은 신뢰하지 않는다
        const giftedItem = {
          itemId: itemKey,
          name: canonical.name || "알 수 없는 아이템",
          icon: canonical.icon || "🎁",
          description: `${senderName}님에게 선물받음`,
          type: canonical.type || "general",
          quantity: qty,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          receivedFrom: uid,
          receivedFromName: senderName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // 🎰 랜덤뽑기 메타 복사 (누락 시 추첨이 "뽑을 아이템 없음"으로 실패) — 카탈로그 기준
        if (canonical.type === "randomDraw") {
          giftedItem.drawSource = canonical.drawSource || "food";
          giftedItem.loseEnabled = canonical.loseEnabled === true;
          giftedItem.losePercent = Number(canonical.losePercent) || 0;
          giftedItem.drawCandidates = Array.isArray(canonical.drawCandidates)
            ? canonical.drawCandidates
            : [];
        }
        transaction.set(recipientInvRef.doc(itemKey), giftedItem);
      }

      // 3) audit — users/{uid}/transactions 양측
      const itemName = canonical.name || itemData.name || "아이템";
      transaction.set(senderRef.collection("transactions").doc(), {
        type: "giftSent",
        amount: 0,
        description: `[선물] ${recipientName}님에게 ${itemName} ${qty}개 선물`,
        itemId: itemKey,
        itemName,
        quantity: qty,
        recipientUid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(recipientRef.collection("transactions").doc(), {
        type: "giftReceived",
        amount: 0,
        description: `[선물] ${senderName}님에게 ${itemName} ${qty}개 선물받음`,
        itemId: itemKey,
        itemName,
        quantity: qty,
        senderUid: uid,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 4) activity_logs 양측 (학생 거래내역 화면 노출용, 90일 TTL)
      const logExpireAt = admin.firestore.Timestamp.fromMillis(
        Date.now() + 90 * 24 * 60 * 60 * 1000,
      );
      const commonLog = {
        classCode,
        expireAt: logExpireAt,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: { itemId: itemKey, itemName, quantity: qty },
      };
      transaction.set(db.collection("activity_logs").doc(), {
        ...commonLog,
        userId: uid,
        userName: senderName,
        type: "gift_sent",
        description: `${recipientName}님에게 ${itemName} ${qty}개 선물`,
        amount: 0,
        metadata: { ...commonLog.metadata, recipientUid },
      });
      transaction.set(db.collection("activity_logs").doc(), {
        ...commonLog,
        userId: recipientUid,
        userName: recipientName,
        type: "gift_received",
        description: `${senderName}님에게 ${itemName} ${qty}개 선물받음`,
        amount: 0,
        metadata: { ...commonLog.metadata, senderUid: uid },
      });

      // ✅ idempotency mark (모든 write 끝난 후)
      markIdempotent(transaction, idemKeyRef);

      return { itemName, quantity: qty, recipientName };
    });

    logger.info(
      `[giftItem] ${uid} → ${recipientUid}: ${result.itemName} ${result.quantity}개 선물`,
    );
    return {
      success: true,
      message: `${result.recipientName}님에게 ${result.itemName} ${result.quantity}개를 선물했습니다.`,
      ...result,
    };
  } catch (error) {
    logger.error(`[giftItem] Error for user ${uid}:`, error);
    if (error instanceof HttpsError) {
      throw error; // already-exists(중복요청) 등 원 코드 보존 — 클라 분기 가능
    }
    throw new HttpsError("aborted", error.message || "선물하기에 실패했습니다.");
  }
});

// 🎰 랜덤뽑기 사용: 서버에서 추첨 결정 → (아이템뽑기면) 재고 차감 → 당첨 지급 → audit 로그.
//    storeItems 쓰기는 admin만 가능(rules)하므로 추첨/재고차감/지급을 서버에서 원자 처리한다.
exports.drawRandomItem = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { itemId } = request.data;
  if (!itemId) {
    throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
  }

  const DAILY_SPIN_LIMIT = 3; // 학생당 하루 추첨(사용) 횟수 제한 — 구입 경로 무관
  const userRef = db.collection("users").doc(uid);
  const drawItemRef = userRef.collection("inventory").doc(itemId);

  try {
    // --- 1) 보유 확인 + 뽑기 메타 로드 (inventory 우선, 없으면 storeItem 보강) ---
    const drawSnap = await drawItemRef.get();
    if (!drawSnap.exists) throw new Error("뽑기 아이템을 찾을 수 없습니다.");
    const drawData = drawSnap.data();
    if ((drawData.quantity || 0) < 1) throw new Error("뽑기 아이템 수량이 부족합니다.");

    let meta = {
      drawSource: drawData.drawSource,
      loseEnabled: drawData.loseEnabled === true,
      losePercent: Number(drawData.losePercent) || 0,
      drawCandidates: Array.isArray(drawData.drawCandidates) ? drawData.drawCandidates : [],
    };
    if (meta.drawSource !== "food" && meta.drawSource !== "item") {
      const storeSnap = await db.collection("storeItems").doc(itemId).get();
      if (storeSnap.exists) {
        const s = storeSnap.data();
        meta = {
          drawSource: s.drawSource,
          loseEnabled: s.loseEnabled === true,
          losePercent: Number(s.losePercent) || 0,
          drawCandidates: Array.isArray(s.drawCandidates) ? s.drawCandidates : [],
        };
      }
    }
    if (meta.drawSource !== "food" && meta.drawSource !== "item") {
      throw new Error("랜덤뽑기 아이템이 아닙니다.");
    }

    // --- 2) 후보 풀 구성 (간식·아이템 통일: 관리자가 고른 상점 아이템 중 판매중·재고 있는 것) ---
    const selectedIds = meta.drawCandidates
      .filter((c) => c && c.storeItemId)
      .map((c) => c.storeItemId);
    // storeItemId → 당첨 비중(가중치) 맵
    const weightMap = {};
    meta.drawCandidates.forEach((c) => {
      if (c && c.storeItemId) {
        const w = Number(c.weight);
        weightMap[c.storeItemId] = Number.isFinite(w) && w > 0 ? w : 1;
      }
    });
    let pool = []; // [{ name, icon, storeItemId, weight }]
    if (selectedIds.length > 0) {
      const storeDocs = await Promise.all(
        selectedIds.map((id) => db.collection("storeItems").doc(id).get()),
      );
      pool = storeDocs
        .filter((d) => d.exists)
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          // 🎰 [뽑기 재고 분리] 뽑기 풀은 상점 재고와 무관하게 후보를 항상 포함한다.
          // (재고로 거르면 당첨돼 재고 0이 된 항목이 돌림판에서 사라짐 — 뽑기는 구매와 달리
          //  자동 보충 트리거가 없어 0에 멈춤). available!==false(관리자 판매중지)만 존중.
          // 🔒 [보안] 학급 격리: 전역 storeItems라 후보에 타 학급 고가 아이템 ID를
          //  심으면 그 자산을 뽑아 획득할 수 있다 — 호출자 학급 아이템만 후보 인정.
          (it) =>
            it.type !== "randomDraw" &&
            it.available !== false &&
            (!it.classCode || it.classCode === classCode),
        )
        .map((it) => ({
          name: it.name || "아이템",
          icon: it.icon || "🎁",
          storeItemId: it.id,
          weight: weightMap[it.id] || 1,
        }));
    }
    if (pool.length === 0) {
      throw new Error(
        "뽑을 수 있는 아이템이 없어요. (후보가 없거나 모두 판매중지 상태예요)",
      );
    }

    // --- 3) 돌림판 세그먼트 + 서버 추첨 ---
    // 꽝 확률 상한 50% (사행성 방지) — 기존 데이터도 서버에서 클램프
    const losePercent = meta.loseEnabled
      ? Math.min(50, Math.max(0, meta.losePercent))
      : 0;
    // portion = 실제 당첨 확률(0~1). 학생에게 확률 공개용 (돌림판 칸 크기는 균등 유지)
    const sumW = pool.reduce((s, p) => s + (p.weight > 0 ? p.weight : 1), 0) || 1;
    const winFrac = 1 - losePercent / 100;
    const segments = pool.map((p) => ({
      name: p.name,
      icon: p.icon,
      portion: winFrac * ((p.weight > 0 ? p.weight : 1) / sumW),
    }));
    const loseIndex = meta.loseEnabled
      ? segments.push({ name: "꽝", icon: "💢", portion: losePercent / 100 }) - 1
      : -1;

    let outcome, prize, winningIndex;
    if (meta.loseEnabled && Math.random() * 100 < losePercent) {
      outcome = "lose";
      prize = null;
      winningIndex = loseIndex;
    } else {
      // 비중(weight) 비례 추첨
      const totalW = pool.reduce((s, p) => s + (p.weight > 0 ? p.weight : 1), 0);
      let r = Math.random() * totalW;
      let pick = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].weight > 0 ? pool[i].weight : 1;
        if (r < 0) {
          pick = i;
          break;
        }
      }
      outcome = "win";
      prize = pool[pick];
      winningIndex = pick;
    }

    // --- 4) 트랜잭션: read 먼저 → write (차감/재고/지급/로그) ---
    const finalState = await db.runTransaction(async (transaction) => {
      // READS
      const curDraw = await transaction.get(drawItemRef);
      if (!curDraw.exists || (curDraw.data().quantity || 0) < 1) {
        throw new Error("뽑기 아이템 수량이 부족합니다.");
      }

      // 🎰 하루 추첨 횟수 제한 (학생당 하루 3회 — 선물·개인상점으로 받아도 적용)
      const curUser = await transaction.get(userRef);
      const uData = curUser.exists ? curUser.data() : {};
      const isAdminUser = hasTeacherPower(uData);
      const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const spinDayKey = `${nowKst.getUTCFullYear()}-${String(
        nowKst.getUTCMonth() + 1,
      ).padStart(2, "0")}-${String(nowKst.getUTCDate()).padStart(2, "0")}`;
      const prevSpins =
        uData.dailySpinDate === spinDayKey ? uData.dailySpinCount || 0 : 0;
      if (!isAdminUser && prevSpins + 1 > DAILY_SPIN_LIMIT) {
        throw new Error(
          `랜덤뽑기는 하루 ${DAILY_SPIN_LIMIT}번까지만 돌릴 수 있어요. (오늘 ${prevSpins}번 사용)`,
        );
      }

      // 🎰 [뽑기 재고 분리] 품절 전환을 제거해 추첨 결과를 그대로 사용(재할당 없음)
      const fOutcome = outcome;
      const fPrize = prize;
      const fWinningIndex = winningIndex;
      // 🎰 [뽑기 재고 분리] 뽑기 당첨은 상점 재고를 차감하지 않고 항상 지급한다.
      // 재고 read·품절 전환·재고 write 없음 → 재고 0이어도 돌림판에서 사라지지 않는다.

      // 당첨 지급 대상 doc 결정 + 존재 확인 (read)
      let prizeRef = null;
      let prizeExists = false;
      let prizeDocData = null;
      if (fOutcome === "win" && fPrize?.storeItemId) {
        const prizeDocId = fPrize.storeItemId;
        prizeDocData = { itemId: prizeDocId, name: fPrize.name, icon: fPrize.icon || "🎁", type: "item" };
        prizeRef = userRef.collection("inventory").doc(prizeDocId);
        const pc = await transaction.get(prizeRef);
        prizeExists = pc.exists;
      }

      // WRITES (뽑기는 상점 재고를 건드리지 않음)
      const newQty = (curDraw.data().quantity || 0) - 1;
      if (newQty > 0) {
        transaction.update(drawItemRef, {
          quantity: newQty,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        transaction.delete(drawItemRef);
      }

      // 하루 추첨 카운트 갱신 (학생만, 날짜 바뀌면 자동 리셋)
      if (!isAdminUser) {
        transaction.update(userRef, {
          dailySpinDate: spinDayKey,
          dailySpinCount: prevSpins + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (fOutcome === "win" && prizeRef) {
        if (prizeExists) {
          transaction.update(prizeRef, {
            quantity: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(prizeRef, {
            ...prizeDocData,
            quantity: 1,
            acquiredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // audit 로그
      const txRef = userRef.collection("transactions").doc();
      transaction.set(txRef, {
        type: "randomDraw",
        amount: 0,
        description:
          fOutcome === "win"
            ? `랜덤뽑기 "${drawData.name || "뽑기"}" → ${fPrize.name} 당첨`
            : `랜덤뽑기 "${drawData.name || "뽑기"}" → 꽝`,
        itemId,
        outcome: fOutcome,
        prizeName: fOutcome === "win" ? fPrize.name : null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { fOutcome, fPrize, fWinningIndex };
    });

    logger.info(
      `[drawRandomItem] ${uid} 뽑기 "${drawData.name}" → ${finalState.fOutcome}${finalState.fPrize ? ` (${finalState.fPrize.name})` : ""}`,
    );

    return {
      success: true,
      outcome: finalState.fOutcome,
      prize: finalState.fPrize ? { name: finalState.fPrize.name, icon: finalState.fPrize.icon } : null,
      segments,
      winningIndex: finalState.fWinningIndex,
    };
  } catch (error) {
    logger.error(`[drawRandomItem] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "랜덤뽑기에 실패했습니다.");
  }
});

exports.listUserItemForSale = onCall(
  {
    region: "asia-northeast3",
    cors: true,
  },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { inventoryItemId, quantity, price } = request.data;

    // 🔒 root-cause 차단: quantity/price를 strict 숫자 검증. 과거 `!quantity||quantity<=0`은
    //   문자열("abc")을 통과시켜(NaN 비교) 손상 리스팅(quantity 비숫자) 생성 → 재고상한 우회·
    //   판매자 인벤토리 NaN 오염 유발. 정수 양수/유한 양수만 허용.
    if (
      !inventoryItemId ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 아이템 정보, 수량, 가격을 입력해야 합니다.",
      );
    }

    const userItemRef = db
      .collection("users")
      .doc(uid)
      .collection("inventory")
      .doc(inventoryItemId);
    const marketListingsRef = db.collection("marketListings");

    try {
      await db.runTransaction(async (transaction) => {
        const userItemDoc = await transaction.get(userItemRef);

        if (!userItemDoc.exists) {
          throw new Error("판매할 아이템을 인벤토리에서 찾을 수 없습니다.");
        }

        const itemData = userItemDoc.data();
        const currentQuantity = itemData.quantity || 0;

        if (currentQuantity < quantity) {
          throw new Error(
            `아이템 수량이 부족합니다. (보유: ${currentQuantity}, 판매 요청: ${quantity})`,
          );
        }

        // 인벤토리에서 아이템 수량 차감
        const newQuantity = currentQuantity - quantity;
        if (newQuantity > 0) {
          transaction.update(userItemRef, { quantity: newQuantity });
        } else {
          transaction.delete(userItemRef);
        }

        // 새로운 마켓 리스팅 생성
        const newListingRef = marketListingsRef.doc();
        const listingPayload = {
          sellerId: uid,
          sellerName: userData.name,
          classCode: classCode,
          itemId: itemData.itemId || inventoryItemId,
          name: itemData.name || "알 수 없는 아이템",
          icon: itemData.icon || "🔮",
          description: itemData.description || "",
          type: itemData.type || "general",
          quantity: quantity,
          price: price,
          status: "active",
          listedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // 🎰 랜덤뽑기 메타를 리스팅에 보존(구매/흥정/취소 시 인벤토리로 복원)
        if (itemData.type === "randomDraw") {
          listingPayload.drawSource = itemData.drawSource || "food";
          listingPayload.loseEnabled = itemData.loseEnabled === true;
          listingPayload.losePercent = Number(itemData.losePercent) || 0;
          listingPayload.drawCandidates = Array.isArray(itemData.drawCandidates)
            ? itemData.drawCandidates
            : [];
        }
        transaction.set(newListingRef, listingPayload);
      });

      return { success: true, message: "아이템을 시장에 등록했습니다." };
    } catch (error) {
      logger.error(`[listUserItemForSale] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "아이템 판매 등록에 실패했습니다.",
      );
    }
  },
);

// ===================================================================================
// 관리자 설정 데이터 통합 조회 (최적화)
// 🔥 시스템 모니터링 함수 삭제됨 (getSystemStatus, resolveSystemAlert) - 비용 절감
// ===================================================================================

// 🔥 시스템 모니터링 함수 삭제됨 (getSystemStatus, resolveSystemAlert) - 비용 절감

// ===================================================================================
// 관리자 설정 데이터 통합 조회 (최적화)
// ===================================================================================

exports.getAdminSettingsData = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin, isSuperAdmin } =
      await checkAuthAndGetUserData(request, true);
    const { tab } = request.data;

    try {
      let data = {};

      switch (tab) {
        case "studentManagement":
          // 학생 데이터 조회 (classCode로만 쿼리 후 관리자 필터)
          const studentsSnapshot = await db
            .collection("users")
            .where("classCode", "==", classCode)
            .get();

          data.students = studentsSnapshot.docs
            .filter((doc) => {
              const d = doc.data();
              return !d.isAdmin && !d.isSuperAdmin && !d.isTeacher;
            })
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));
          break;

        case "salarySettings":
          // 급여 설정 조회
          const salaryDoc = await db
            .collection("classSettings")
            .doc(classCode)
            .collection("settings")
            .doc("salary")
            .get();

          data.salarySettings = salaryDoc.exists ? salaryDoc.data() : {};
          break;

        case "generalSettings":
          // 일반 설정 조회
          const settingsDoc = await db
            .collection("classSettings")
            .doc(classCode)
            .get();

          data.generalSettings = settingsDoc.exists ? settingsDoc.data() : {};
          break;

        case "systemManagement":
          if (!isSuperAdmin) {
            throw new HttpsError(
              "permission-denied",
              "최고 관리자 권한이 필요합니다.",
            );
          }

          // 시스템 관리 데이터 조회
          const allClassesSnapshot = await db.collection("classSettings").get();
          data.allClasses = allClassesSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          break;

        default:
          // 기본적으로 일반 설정 반환
          const defaultDoc = await db
            .collection("classSettings")
            .doc(classCode)
            .get();

          data = defaultDoc.exists ? defaultDoc.data() : {};
      }

      logger.info(`[getAdminSettingsData] ${uid}님이 ${tab} 데이터 조회`);

      return {
        success: true,
        data: data,
      };
    } catch (error) {
      logger.error(`[getAdminSettingsData] Error for user ${uid}:`, error);
      throw new HttpsError(
        "internal",
        error.message || "데이터 조회에 실패했습니다.",
      );
    }
  },
);

// ===================================================================================
// 배치 급여 지급
// ===================================================================================

exports.batchPaySalaries = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin, isSuperAdmin } =
      await checkAuthAndGetUserData(request, true);
    const { studentIds, payAll } = request.data;

    try {
      // 급여 설정 가져오기 (세율)
      let salarySettingsDoc = await db
        .collection("settings")
        .doc(`salarySettings_${classCode}`)
        .get();
      if (!salarySettingsDoc.exists) {
        salarySettingsDoc = await db
          .collection("settings")
          .doc("salarySettings")
          .get();
      }
      const taxRate = salarySettingsDoc.exists
        ? salarySettingsDoc.data().taxRate || 0.1
        : 0.1;
      // 직업 개수 상한(관리자 설정) — 미설정 시 기본 5. scheduler-http.js와 동일 규약.
      const rawMaxJobs = salarySettingsDoc.exists
        ? salarySettingsDoc.data().maxJobsPerStudent
        : undefined;
      // 하한1·상한20 클램프(설정 변조 대비 급여 캡 방어). scheduler-http.js와 동일.
      const maxJobsPerStudent =
        Number.isInteger(rawMaxJobs) && rawMaxJobs >= 1 ? Math.min(20, rawMaxJobs) : 5;

      // 지급할 학생 목록 결정
      let targetStudents = [];
      if (payAll) {
        // classCode로만 쿼리 후 서버에서 필터 (isAdmin 필드 없는 학생도 포함)
        const studentsSnapshot = await db
          .collection("users")
          .where("classCode", "==", classCode)
          .get();
        targetStudents = studentsSnapshot.docs
          .filter((d) => {
            const data = d.data();
            return !data.isAdmin && !data.isSuperAdmin && !data.isTeacher;
          })
          .map((d) => ({ id: d.id, ...d.data() }));
      } else if (studentIds && studentIds.length > 0) {
        for (let i = 0; i < studentIds.length; i += 30) {
          const chunk = studentIds.slice(i, i + 30);
          const docs = await Promise.all(
            chunk.map((id) => db.collection("users").doc(id).get()),
          );
          docs
            .filter((d) => d.exists)
            .forEach((d) => targetStudents.push({ id: d.id, ...d.data() }));
        }
      }

      logger.info(
        `[batchPaySalaries] 대상 학생 ${targetStudents.length}명 조회 완료 (payAll: ${payAll})`,
      );

      // 급여 계산: 기본급 200만 + 추가 직업당 50만 + 대통령 보너스
      const BASE_SALARY = 2000000;
      const ADDITIONAL_SALARY = 500000;
      const PRESIDENT_BONUS = 2000000;

      // 직업 정보 로드 (대통령 보너스 적용용)
      const jobsSnap = await db.collection("jobs").where("classCode", "==", classCode).get();
      const jobMap = buildJobMap(jobsSnap);

      const batch = db.batch();
      let totalStudentsPaid = 0;
      let totalGrossPaid = 0;
      let totalTaxDeducted = 0;
      let totalNetPaid = 0;
      const skippedStudents = [];

      // weekKey 계산 (KST 기준) — 내 재산 거래내역 표시용
      const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const weekKey = `${nowKst.getFullYear()}-W${Math.ceil(((nowKst - new Date(nowKst.getFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
      // 거래내역 로그 TTL: 90일
      const logExpireAt = new Date();
      logExpireAt.setDate(logExpireAt.getDate() + 90);
      const logExpireTs = admin.firestore.Timestamp.fromDate(logExpireAt);

      for (const student of targetStudents) {
        // 🔒 저장값을 신뢰하지 않고 재검증: 유령 id 제외 + 중복 제거 + 지정 전용 직업은
        //    appointedJobIds(교사 write 전용)에서만 인정. 상세 규약은 functions/jobUtils.js.
        const { appointed, all: validJobIds } = resolveStudentJobs(
          student,
          jobMap,
          maxJobsPerStudent,
        );
        if (validJobIds.length === 0) {
          skippedStudents.push(student.name || student.nickname || student.id);
          // 이번 회차 미지급 — 이전 지급 기록이 남아있으면 reverseSalaryOnce가
          // (지급 안 한) 이번 회차를 잘못 회수하게 되므로 초기화
          if (student.lastNetSalary) {
            batch.update(db.collection("users").doc(student.id), {
              lastNetSalary: 0,
              lastGrossSalary: 0,
              lastTaxAmount: 0,
            });
          }
          continue;
        }

        const grossSalary =
          BASE_SALARY + Math.max(0, validJobIds.length - 1) * ADDITIONAL_SALARY;
        // 대통령 보너스는 '교사가 지정한' 직업(appointed)에서만, 중복 제거된 id 기준으로 지급.
        // 학생이 selectedJobIds에 대통령 id를 넣거나 같은 id를 여러 번 넣어도 가산되지 않는다.
        // scheduler-http.js와 동일 규약.
        let bonus = 0;
        for (const jobId of appointed) {
          if (jobMap.get(jobId)?.title === "대통령") bonus += PRESIDENT_BONUS;
        }
        const totalGross = grossSalary + bonus;
        const tax = Math.floor(totalGross * taxRate);
        const netSalary = totalGross - tax;

        const studentRef = db.collection("users").doc(student.id);
        batch.update(studentRef, {
          cash: admin.firestore.FieldValue.increment(netSalary),
          lastSalaryDate: admin.firestore.FieldValue.serverTimestamp(),
          lastGrossSalary: totalGross,
          lastTaxAmount: tax,
          lastNetSalary: netSalary,
          totalSalaryReceived: admin.firestore.FieldValue.increment(netSalary),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 내 재산 거래내역 기록 (activity_logs — classCode+userId로 조회됨)
        const studentName = student.name || student.nickname || "학생";
        const salaryLogRef = db.collection("activity_logs").doc();
        batch.set(salaryLogRef, {
          userId: student.id,
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

        // users/{uid}/transactions 서브컬렉션
        const txRef = db.collection("users").doc(student.id).collection("transactions").doc();
        batch.set(txRef, {
          amount: netSalary,
          description: `[주급] ${weekKey} 실수령 ${netSalary.toLocaleString()}원`,
          type: "salaryPayment",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          weekKey,
          grossSalary: totalGross,
          taxAmount: tax,
        });

        totalStudentsPaid++;
        totalGrossPaid += totalGross;
        totalTaxDeducted += tax;
        totalNetPaid += netSalary;
      }

      if (totalStudentsPaid > 0) {
        await batch.commit();
      }

      logger.info(
        `[batchPaySalaries] ${uid}님이 ${totalStudentsPaid}명에게 총 ${totalNetPaid.toLocaleString()}원 지급 (세전 ${totalGrossPaid.toLocaleString()}원, 세금 ${totalTaxDeducted.toLocaleString()}원)${skippedStudents.length > 0 ? ` / 직업없음 스킵: ${skippedStudents.length}명` : ""}`,
      );

      return {
        success: true,
        message: `${totalStudentsPaid}명에게 총 ${totalNetPaid.toLocaleString()}원 지급 완료`,
        summary: {
          totalStudentsPaid,
          totalGrossPaid,
          totalTaxDeducted,
          totalNetPaid,
        },
      };
    } catch (error) {
      logger.error(`[batchPaySalaries] Error for user ${uid}:`, error);
      throw new HttpsError(
        "internal",
        error.message || "급여 지급에 실패했습니다.",
      );
    }
  },
);

// ===================================================================================
// 주급 회수 (1회분) - 임시 함수
// ===================================================================================
exports.reverseSalaryOnce = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin, isSuperAdmin } =
      await checkAuthAndGetUserData(request, true);

    try {
      // 해당 클래스 학생 조회
      const studentsSnapshot = await db
        .collection("users")
        .where("classCode", "==", classCode)
        .get();
      const targetStudents = studentsSnapshot.docs
        .filter((d) => {
          const data = d.data();
          return !data.isAdmin && !data.isSuperAdmin && !data.isTeacher;
        })
        .map((d) => ({ id: d.id, ...d.data() }));

      const batch = db.batch();
      let totalReversed = 0;
      let totalAmount = 0;

      for (const student of targetStudents) {
        // 재계산이 아니라 직전 지급 시 실제로 기록된 금액(lastNetSalary)을 그대로 회수.
        // (직업 개수로 재계산하면, 지급 이후 직업 구성이 바뀌었을 때 회수액이 실제 지급액과 어긋남)
        const netSalary = student.lastNetSalary;
        if (typeof netSalary !== "number" || netSalary <= 0) continue;

        const studentRef = db.collection("users").doc(student.id);
        batch.update(studentRef, {
          cash: admin.firestore.FieldValue.increment(-netSalary),
          totalSalaryReceived: admin.firestore.FieldValue.increment(-netSalary),
          // 회수 완료 표시 — 관리자가 실수로 다시 눌러도 이중 차감되지 않도록 초기화
          lastNetSalary: 0,
          lastGrossSalary: 0,
          lastTaxAmount: 0,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        totalReversed++;
        totalAmount += netSalary;
      }

      if (totalReversed > 0) {
        await batch.commit();
      }

      logger.info(
        `[reverseSalaryOnce] ${uid}님이 ${totalReversed}명에게서 총 ${totalAmount.toLocaleString()}원 회수`,
      );

      return {
        success: true,
        message: `${totalReversed}명에게서 총 ${totalAmount.toLocaleString()}원 회수 완료`,
        summary: { totalReversed, totalAmount },
      };
    } catch (error) {
      logger.error(`[reverseSalaryOnce] Error:`, error);
      throw new HttpsError(
        "internal",
        error.message || "급여 회수에 실패했습니다.",
      );
    }
  },
);

// ===================================================================================
// 아이템 시장 거래 함수
// ===================================================================================

// 🔥 CORS 설정 추가 (Firebase v2 함수)
exports.buyMarketItem = onCall(
  {
    region: "asia-northeast3",
    cors: true, // CORS 활성화
  },
  async (request) => {
    const { uid, userData } = await checkAuthAndGetUserData(request);
    const { listingId, idempotencyKey } = request.data;

    if (!listingId) {
      throw new HttpsError(
        "invalid-argument",
        "구매할 아이템 ID를 입력해야 합니다.",
      );
    }

    const listingRef = db.collection("marketListings").doc(listingId);
    const buyerRef = db.collection("users").doc(uid);

    try {
      // 세금 설정 및 관리자 정보 사전 조회 (트랜잭션 외부)
      const govSettingsDoc = await db
        .collection("governmentSettings")
        .doc(userData.classCode)
        .get();
      const taxSettings = govSettingsDoc.exists
        ? govSettingsDoc.data()?.taxSettings
        : {};
      const itemMarketTaxRate =
        taxSettings?.itemMarketTransactionTaxRate || 0.03;

      const adminQuery = await findApprovedAdminSnap(userData.classCode);
      const adminDocRef = adminQuery.empty ? null : adminQuery.docs[0].ref;

      await db.runTransaction(async (transaction) => {
        // 🚨 서버측 idempotency check (read만)
        const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

        const listingDoc = await transaction.get(listingRef);

        if (!listingDoc.exists) {
          throw new Error("판매 중인 아이템을 찾을 수 없습니다.");
        }

        const listingData = listingDoc.data();

        if (listingData.status !== "active") {
          throw new Error("이미 판매 완료되었거나 취소된 아이템입니다.");
        }

        if (listingData.sellerId === uid) {
          throw new Error("자신이 판매한 아이템은 구매할 수 없습니다.");
        }

        // 🔒 학급 격리 — 다른 학급의 리스팅 구매 불가(학급별 경제 분리). fail-closed.
        if (
          !listingData.classCode ||
          listingData.classCode !== userData.classCode
        ) {
          throw new Error("다른 학급의 판매 아이템은 구매할 수 없습니다.");
        }

        const buyerDoc = await transaction.get(buyerRef);
        if (!buyerDoc.exists) {
          throw new Error("구매자 정보를 찾을 수 없습니다.");
        }

        const buyerData = buyerDoc.data();
        const totalPrice = listingData.price * listingData.quantity;

        if (buyerData.cash < totalPrice) {
          throw new Error(
            `현금이 부족합니다. (필요: ${totalPrice.toLocaleString()}원, 보유: ${buyerData.cash.toLocaleString()}원)`,
          );
        }

        // 세금 계산
        const taxAmount = Math.round(totalPrice * itemMarketTaxRate);
        const sellerProceeds = totalPrice - taxAmount;

        // 구매자 현금 차감 (전체 가격)
        transaction.update(buyerRef, {
          cash: admin.firestore.FieldValue.increment(-totalPrice),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 구매자 거래 로그
        const marketBuyTxRef = buyerRef.collection("transactions").doc();
        transaction.set(marketBuyTxRef, {
          type: "marketBuy",
          amount: -totalPrice,
          description: `[개인 거래 매수] ${listingData.itemName || listingData.name || "아이템"} ${listingData.quantity}개 × ${listingData.price.toLocaleString()}원 (판매자: ${listingData.sellerName || listingData.sellerId})`,
          listingId,
          itemName: listingData.itemName || listingData.name,
          quantity: listingData.quantity,
          unitPrice: listingData.price,
          sellerId: listingData.sellerId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 판매자에게 세금 차감 금액 지급
        const sellerRef = db.collection("users").doc(listingData.sellerId);
        transaction.update(sellerRef, {
          cash: admin.firestore.FieldValue.increment(sellerProceeds),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 판매자 거래 로그
        const marketSellTxRef = sellerRef.collection("transactions").doc();
        transaction.set(marketSellTxRef, {
          type: "marketSell",
          amount: sellerProceeds,
          description: `[개인 거래 매도] ${listingData.itemName || listingData.name || "아이템"} ${listingData.quantity}개 × ${listingData.price.toLocaleString()}원 (세금 ${taxAmount.toLocaleString()}원 차감 후 ${sellerProceeds.toLocaleString()}원 입금, 구매자: ${buyerData.name || uid})`,
          listingId,
          itemName: listingData.itemName || listingData.name,
          quantity: listingData.quantity,
          unitPrice: listingData.price,
          taxAmount,
          buyerId: uid,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 관리자(교사)에게 세금 입금 (국고 = 관리자 cash) + 통계 기록
        if (taxAmount > 0 && adminDocRef) {
          transaction.update(adminDocRef, {
            cash: admin.firestore.FieldValue.increment(taxAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const treasuryRef = db
            .collection("nationalTreasuries")
            .doc(userData.classCode);
          transaction.set(
            treasuryRef,
            {
              itemMarketTaxRevenue:
                admin.firestore.FieldValue.increment(taxAmount),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }

        // 구매자 인벤토리에 아이템 추가
        const buyerInventoryRef = db
          .collection("users")
          .doc(uid)
          .collection("inventory");
        const buyerItemQuery = await buyerInventoryRef
          .where("itemId", "==", listingData.itemId)
          .get();

        if (!buyerItemQuery.empty) {
          const buyerItemDoc = buyerItemQuery.docs[0];
          transaction.update(buyerItemDoc.ref, {
            quantity: admin.firestore.FieldValue.increment(
              listingData.quantity,
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          // doc id = itemId (drawRandomItem/useUserItem이 inventory.doc(itemId) 조회)
          const newItemRef = buyerInventoryRef.doc(listingData.itemId);
          const boughtItem = {
            itemId: listingData.itemId,
            name: listingData.name,
            icon: listingData.icon || "🔮",
            description: listingData.description || "",
            type: listingData.type || "general",
            quantity: listingData.quantity,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (listingData.type === "randomDraw") {
            boughtItem.drawSource = listingData.drawSource || "food";
            boughtItem.loseEnabled = listingData.loseEnabled === true;
            boughtItem.losePercent = Number(listingData.losePercent) || 0;
            boughtItem.drawCandidates = Array.isArray(listingData.drawCandidates)
              ? listingData.drawCandidates
              : [];
          }
          transaction.set(newItemRef, boughtItem);
        }

        // 마켓 리스팅 상태 업데이트
        transaction.update(listingRef, {
          status: "sold",
          buyerId: uid,
          buyerName: userData.name,
          soldAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ✅ idempotency mark (모든 write 끝난 후)
        markIdempotent(transaction, idemKeyRef);
      });

      return { success: true, message: "아이템을 성공적으로 구매했습니다." };
    } catch (error) {
      logger.error(`[buyMarketItem] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "아이템 구매에 실패했습니다.",
      );
    }
  },
);

exports.cancelMarketSale = onCall(
  {
    region: "asia-northeast3",
    cors: true,
  },
  async (request) => {
    const { uid } = await checkAuthAndGetUserData(request);
    const { listingId } = request.data;

    if (!listingId) {
      throw new HttpsError(
        "invalid-argument",
        "취소할 판매 ID를 입력해야 합니다.",
      );
    }

    const listingRef = db.collection("marketListings").doc(listingId);

    try {
      await db.runTransaction(async (transaction) => {
        const listingDoc = await transaction.get(listingRef);

        if (!listingDoc.exists) {
          throw new Error("판매 정보를 찾을 수 없습니다.");
        }

        const listingData = listingDoc.data();

        if (listingData.sellerId !== uid) {
          throw new Error("본인이 등록한 판매만 취소할 수 있습니다.");
        }

        if (listingData.status !== "active") {
          throw new Error("이미 판매 완료되었거나 취소된 아이템입니다.");
        }

        // 판매자 인벤토리에 아이템 복원
        const sellerInventoryRef = db
          .collection("users")
          .doc(uid)
          .collection("inventory");
        const sellerItemQuery = await sellerInventoryRef
          .where("itemId", "==", listingData.itemId)
          .get();

        if (!sellerItemQuery.empty) {
          const sellerItemDoc = sellerItemQuery.docs[0];
          transaction.update(sellerItemDoc.ref, {
            quantity: admin.firestore.FieldValue.increment(
              listingData.quantity,
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          const newItemRef = sellerInventoryRef.doc(listingData.itemId);
          const restoredItem = {
            itemId: listingData.itemId,
            name: listingData.name,
            icon: listingData.icon || "🔮",
            description: listingData.description || "",
            type: listingData.type || "general",
            quantity: listingData.quantity,
            restoredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (listingData.type === "randomDraw") {
            restoredItem.drawSource = listingData.drawSource || "food";
            restoredItem.loseEnabled = listingData.loseEnabled === true;
            restoredItem.losePercent = Number(listingData.losePercent) || 0;
            restoredItem.drawCandidates = Array.isArray(listingData.drawCandidates)
              ? listingData.drawCandidates
              : [];
          }
          transaction.set(newItemRef, restoredItem);
        }

        // 마켓 리스팅 삭제
        transaction.delete(listingRef);
      });

      return { success: true, message: "판매가 취소되었습니다." };
    } catch (error) {
      logger.error(`[cancelMarketSale] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "판매 취소에 실패했습니다.",
      );
    }
  },
);

exports.makeOffer = onCall(
  {
    region: "asia-northeast3",
    cors: true,
  },
  async (request) => {
    const { uid, userData } = await checkAuthAndGetUserData(request);
    const { listingId, offerPrice, quantity = 1 } = request.data;

    // 🔒 offerPrice/quantity 엄격검사 — 문자열/음수/Infinity/NaN/비정수 세탁 차단
    //   (rules로 offer 클라 write를 봉인했지만 서버 money 계산 방어를 이중으로 둠).
    if (!listingId) {
      throw new HttpsError("invalid-argument", "판매 ID를 입력해야 합니다.");
    }
    if (
      typeof offerPrice !== "number" ||
      !Number.isFinite(offerPrice) ||
      offerPrice <= 0 ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 제안 가격/수량을 입력해야 합니다.",
      );
    }

    const listingRef = db.collection("marketListings").doc(listingId);
    const offersRef = db.collection("marketOffers");

    try {
      const listingDoc = await listingRef.get();

      if (!listingDoc.exists) {
        throw new Error("판매 정보를 찾을 수 없습니다.");
      }

      const listingData = listingDoc.data();

      if (listingData.status !== "active") {
        throw new Error("현재 판매 중인 아이템이 아닙니다.");
      }

      if (listingData.sellerId === uid) {
        throw new Error("자신이 판매한 아이템에는 제안할 수 없습니다.");
      }

      // 🔒 학급 격리 — 다른 학급의 리스팅에는 제안 불가(학급별 경제 분리). fail-closed.
      if (
        !listingData.classCode ||
        listingData.classCode !== userData.classCode
      ) {
        throw new Error("다른 학급의 판매 아이템에는 제안할 수 없습니다.");
      }

      // 🔒 제안 수량이 리스팅 재고를 초과할 수 없음 (수락 시 offer.quantity로 인벤토리
      //   increment하므로, 상한 없으면 아이템 mint). fail-closed: quantity가 유효한 숫자가
      //   아니면 스킵이 아니라 즉시 거부(quantity 부재 문서에서 상한 우회 방지).
      if (
        typeof listingData.quantity !== "number" ||
        !Number.isFinite(listingData.quantity) ||
        quantity > listingData.quantity
      ) {
        throw new Error("제안 수량이 판매 수량을 초과할 수 없습니다.");
      }

      // 새 제안 생성
      const newOfferRef = offersRef.doc();
      await newOfferRef.set({
        listingId: listingId,
        buyerId: uid,
        buyerName: userData.name,
        sellerId: listingData.sellerId,
        sellerName: listingData.sellerName,
        itemId: listingData.itemId,
        itemName: listingData.name,
        originalPrice: listingData.price,
        offerPrice: offerPrice,
        quantity: quantity,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: "가격 제안이 전송되었습니다.",
        offerId: newOfferRef.id,
      };
    } catch (error) {
      logger.error(`[makeOffer] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "가격 제안에 실패했습니다.",
      );
    }
  },
);

exports.respondToOffer = onCall(
  {
    region: "asia-northeast3",
    cors: true,
  },
  async (request) => {
    const { uid, userData } = await checkAuthAndGetUserData(request);
    const { offerId, response, idempotencyKey } = request.data;

    if (!offerId || !response || !["accept", "reject"].includes(response)) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 제안 ID와 응답(accept/reject)을 입력해야 합니다.",
      );
    }

    const offerRef = db.collection("marketOffers").doc(offerId);

    try {
      // 세금 설정 및 관리자 정보 사전 조회 (트랜잭션 외부)
      const govSettingsDoc = await db
        .collection("governmentSettings")
        .doc(userData.classCode)
        .get();
      const taxSettings = govSettingsDoc.exists
        ? govSettingsDoc.data()?.taxSettings
        : {};
      const itemMarketTaxRate =
        taxSettings?.itemMarketTransactionTaxRate || 0.03;

      const adminQuery = await findApprovedAdminSnap(userData.classCode);
      const adminDocRef = adminQuery.empty ? null : adminQuery.docs[0].ref;

      await db.runTransaction(async (transaction) => {
        // 🚨 서버측 idempotency check (read만)
        const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

        const offerDoc = await transaction.get(offerRef);

        if (!offerDoc.exists) {
          throw new Error("제안 정보를 찾을 수 없습니다.");
        }

        const offerData = offerDoc.data();

        if (offerData.sellerId !== uid) {
          throw new Error(
            "본인의 판매 아이템에 대한 제안만 응답할 수 있습니다.",
          );
        }

        if (offerData.status !== "pending") {
          throw new Error("이미 처리된 제안입니다.");
        }

        if (response === "accept") {
          // 제안 수락 - buyMarketItem과 유사한 로직
          const listingRef = db
            .collection("marketListings")
            .doc(offerData.listingId);
          const buyerRef = db.collection("users").doc(offerData.buyerId);
          const sellerRef = db.collection("users").doc(offerData.sellerId);

          const listingDoc = await transaction.get(listingRef);
          if (!listingDoc.exists || listingDoc.data().status !== "active") {
            throw new Error(
              "해당 판매 아이템을 찾을 수 없거나 이미 판매되었습니다.",
            );
          }

          const buyerDoc = await transaction.get(buyerRef);
          if (!buyerDoc.exists) {
            throw new Error("구매자 정보를 찾을 수 없습니다.");
          }

          // 🔒 저장된 offer 값 재검증 — 과거 위조 update(음수/Infinity/비정수 offerPrice·quantity)로
          //   남아있을 수 있는 문서를 수락 시점에 차단(음수 totalPrice → 현금 mint 방지).
          const oPrice = offerData.offerPrice;
          const oQty = offerData.quantity;
          if (
            typeof oPrice !== "number" ||
            !Number.isFinite(oPrice) ||
            oPrice <= 0 ||
            typeof oQty !== "number" ||
            !Number.isFinite(oQty) ||
            !Number.isInteger(oQty) ||
            oQty <= 0
          ) {
            throw new Error("유효하지 않은 제안(가격/수량)입니다.");
          }

          // 🔒 offer↔listing 교차검증 — 위조 offer(타 아이템/판매자 불일치·재고 초과·자기거래)로
          //   인벤토리 대량 increment(아이템 mint)되는 것을 차단. rules 봉인의 서버측 이중방어.
          const ld0 = listingDoc.data();
          if (
            ld0.itemId !== offerData.itemId ||
            ld0.sellerId !== offerData.sellerId ||
            offerData.buyerId === offerData.sellerId ||
            typeof ld0.quantity !== "number" ||
            !Number.isFinite(ld0.quantity) ||
            oQty > ld0.quantity
          ) {
            throw new Error("제안과 판매 정보가 일치하지 않습니다.");
          }

          // 🔒 학급 격리 — 리스팅·판매자·구매자가 모두 같은 학급이어야 함(과거 cross-class offer 무력화).
          const buyerClassCode = buyerDoc.data()?.classCode;
          if (
            !ld0.classCode ||
            ld0.classCode !== userData.classCode ||
            buyerClassCode !== ld0.classCode
          ) {
            throw new Error("학급이 일치하지 않는 제안입니다.");
          }

          const totalPrice = oPrice * oQty;
          const buyerCash = buyerDoc.data().cash || 0;

          if (buyerCash < totalPrice) {
            throw new Error(
              `구매자의 현금이 부족합니다. (필요: ${totalPrice.toLocaleString()}원, 보유: ${buyerCash.toLocaleString()}원)`,
            );
          }

          // 세금 계산
          const taxAmount = Math.round(totalPrice * itemMarketTaxRate);
          const sellerProceeds = totalPrice - taxAmount;

          // 구매자 현금 차감 (전체 가격)
          transaction.update(buyerRef, {
            cash: admin.firestore.FieldValue.increment(-totalPrice),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 구매자 거래 로그
          const offerBuyTxRef = buyerRef.collection("transactions").doc();
          transaction.set(offerBuyTxRef, {
            type: "marketOfferBuy",
            amount: -totalPrice,
            description: `[제안 수락 매수] ${offerData.itemName} ${offerData.quantity}개 × ${offerData.offerPrice.toLocaleString()}원 (판매자: ${offerData.sellerName || offerData.sellerId})`,
            offerId,
            itemName: offerData.itemName,
            quantity: offerData.quantity,
            unitPrice: offerData.offerPrice,
            sellerId: offerData.sellerId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 판매자에게 세금 차감 금액 지급
          transaction.update(sellerRef, {
            cash: admin.firestore.FieldValue.increment(sellerProceeds),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 판매자 거래 로그
          const offerSellTxRef = sellerRef.collection("transactions").doc();
          transaction.set(offerSellTxRef, {
            type: "marketOfferSell",
            amount: sellerProceeds,
            description: `[제안 수락 매도] ${offerData.itemName} ${offerData.quantity}개 × ${offerData.offerPrice.toLocaleString()}원 (세금 ${taxAmount.toLocaleString()}원 차감, 구매자: ${offerData.buyerName || offerData.buyerId})`,
            offerId,
            itemName: offerData.itemName,
            quantity: offerData.quantity,
            unitPrice: offerData.offerPrice,
            taxAmount,
            buyerId: offerData.buyerId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 관리자(교사)에게 세금 입금 (국고 = 관리자 cash) + 통계 기록
          if (taxAmount > 0 && adminDocRef) {
            transaction.update(adminDocRef, {
              cash: admin.firestore.FieldValue.increment(taxAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            const treasuryRef = db
              .collection("nationalTreasuries")
              .doc(userData.classCode);
            transaction.set(
              treasuryRef,
              {
                itemMarketTaxRevenue:
                  admin.firestore.FieldValue.increment(taxAmount),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
          }

          // 구매자 인벤토리에 아이템 추가
          const buyerInventoryRef = db
            .collection("users")
            .doc(offerData.buyerId)
            .collection("inventory");
          const buyerItemQuery = await buyerInventoryRef
            .where("itemId", "==", offerData.itemId)
            .get();

          if (!buyerItemQuery.empty) {
            const buyerItemDoc = buyerItemQuery.docs[0];
            transaction.update(buyerItemDoc.ref, {
              quantity: admin.firestore.FieldValue.increment(
                offerData.quantity,
              ),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            const ld = listingDoc.data();
            const newItemRef = buyerInventoryRef.doc(offerData.itemId);
            const boughtItem = {
              itemId: offerData.itemId,
              name: offerData.itemName,
              icon: ld.icon || "🔮",
              description: ld.description || "",
              type: ld.type || "general",
              quantity: offerData.quantity,
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            if (ld.type === "randomDraw") {
              boughtItem.drawSource = ld.drawSource || "food";
              boughtItem.loseEnabled = ld.loseEnabled === true;
              boughtItem.losePercent = Number(ld.losePercent) || 0;
              boughtItem.drawCandidates = Array.isArray(ld.drawCandidates)
                ? ld.drawCandidates
                : [];
            }
            transaction.set(newItemRef, boughtItem);
          }

          // 마켓 리스팅 상태 업데이트
          transaction.update(listingRef, {
            status: "sold",
            buyerId: offerData.buyerId,
            buyerName: offerData.buyerName,
            soldAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 제안 상태 업데이트
          transaction.update(offerRef, {
            status: "accepted",
            respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // ✅ idempotency mark (수락 경로)
          markIdempotent(transaction, idemKeyRef);

          return {
            success: true,
            message: "제안을 수락하여 거래가 완료되었습니다.",
          };
        } else {
          // 제안 거절
          transaction.update(offerRef, {
            status: "rejected",
            respondedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // ✅ idempotency mark (거절 경로)
          markIdempotent(transaction, idemKeyRef);

          return { success: true, message: "제안을 거절했습니다." };
        }
      });

      if (response === "accept") {
        return {
          success: true,
          message: "제안을 수락하여 거래가 완료되었습니다.",
        };
      } else {
        return { success: true, message: "제안을 거절했습니다." };
      }
    } catch (error) {
      logger.error(`[respondToOffer] Error for user ${uid}:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "제안 응답에 실패했습니다.",
      );
    }
  },
);

// ===================================================================================
// 🏠 부동산 구매 함수
// ===================================================================================
exports.purchaseRealEstate = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    try {
      const { uid, classCode, userData } =
        await checkAuthAndGetUserData(request);
      const { propertyId, idempotencyKey } = request.data;

      if (!propertyId) {
        throw new HttpsError("invalid-argument", "부동산 ID가 필요합니다.");
      }

      logger.info(
        `[purchaseRealEstate] User ${uid} attempting to purchase property ${propertyId}`,
      );

      // 트랜잭션으로 처리
      const result = await db.runTransaction(async (transaction) => {
        // 🚨 서버측 idempotency check (read만)
        const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

        // 1. 부동산 정보 조회
        const propertyRef = db
          .collection("classes")
          .doc(classCode)
          .collection("realEstateProperties")
          .doc(propertyId);
        const propertyDoc = await transaction.get(propertyRef);

        if (!propertyDoc.exists) {
          throw new Error("부동산 정보를 찾을 수 없습니다.");
        }

        const propertyData = propertyDoc.data();

        // 🔥 [추가] 부동산 설정 조회 (월세 비율 확인)
        const settingsRef = db
          .collection("classes")
          .doc(classCode)
          .collection("realEstateSettings")
          .doc("settingsDoc");
        const settingsDoc = await transaction.get(settingsRef);
        const settings = settingsDoc.exists
          ? settingsDoc.data()
          : { rentPercentage: 1 }; // 기본값 1%
        const rentPercentage = settings.rentPercentage || 1;

        logger.info(`[purchaseRealEstate] 월세 비율: ${rentPercentage}%`);

        // 2. 구매 가능 여부 확인
        // 정부 소유 부동산은 항상 구매 가능 (forSale 여부 무관)
        // 개인 소유 부동산은 forSale이 true일 때만 구매 가능
        if (propertyData.owner !== "government" && !propertyData.forSale) {
          throw new Error("판매 중인 부동산이 아닙니다.");
        }

        if (propertyData.owner === uid) {
          throw new Error("이미 소유한 부동산입니다.");
        }

        const purchasePrice = propertyData.salePrice || propertyData.price;

        // 🔥 [수정] 월세가 0이거나 없는 경우 설정된 비율로 계산
        const rent =
          propertyData.rent ||
          Math.round(propertyData.price * (rentPercentage / 100));

        // 3. 사용자 현금 확인
        const userRef = db.collection("users").doc(uid);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }

        const currentCash = userDoc.data().cash || 0;

        if (currentCash < purchasePrice) {
          throw new Error(
            `현금이 부족합니다. 필요: ${purchasePrice.toLocaleString()}원, 보유: ${currentCash.toLocaleString()}원`,
          );
        }

        // 🔥 [추가] 4-1. 기존 입주지 확인 및 퇴거 처리
        const allPropertiesSnapshot = await transaction.get(
          db
            .collection("classes")
            .doc(classCode)
            .collection("realEstateProperties"),
        );

        let previousTenantPropertyId = null;
        allPropertiesSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.tenantId === uid) {
            previousTenantPropertyId = doc.id;
            // 기존 입주지에서 퇴거 처리
            transaction.update(doc.ref, {
              tenant: null,
              tenantId: null,
              tenantName: null,
              lastRentPayment: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            logger.info(
              `[purchaseRealEstate] User ${uid} vacated from property ${doc.id}`,
            );
          }
        });

        // 4-2. 부동산 거래세 계산
        const govSettingsRef = db
          .collection("governmentSettings")
          .doc(classCode);
        const govSettingsDoc = await transaction.get(govSettingsRef);
        const govSettings = govSettingsDoc.exists ? govSettingsDoc.data() : {};
        const realEstateTaxRate =
          govSettings?.taxSettings?.realEstateTransactionTaxRate || 0.03;
        const taxAmount = Math.round(purchasePrice * realEstateTaxRate);

        // 4-3. 현금 차감 (구매가 전액)
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(-purchasePrice),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 구매자 거래 로그
        const realEstateBuyTxRef = userRef.collection("transactions").doc();
        transaction.set(realEstateBuyTxRef, {
          type: "realEstatePurchase",
          amount: -purchasePrice,
          description: `[부동산 구매] ${propertyData.name || `매물 #${propertyId}`} ${purchasePrice.toLocaleString()}원 (거래세 ${taxAmount.toLocaleString()}원 별도)`,
          propertyId,
          propertyName: propertyData.name,
          purchasePrice,
          taxAmount,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 4-4. 이전 소유자에게 판매 대금 지급 (정부 소유가 아닌 경우)
        if (propertyData.owner !== "government" && propertyData.owner) {
          const sellerRef = db.collection("users").doc(propertyData.owner);
          const sellerProceeds = purchasePrice - taxAmount;
          transaction.update(sellerRef, {
            cash: admin.firestore.FieldValue.increment(sellerProceeds),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 판매자 거래 로그
          const realEstateSellTxRef = sellerRef.collection("transactions").doc();
          transaction.set(realEstateSellTxRef, {
            type: "realEstateSell",
            amount: sellerProceeds,
            description: `[부동산 매도] ${propertyData.name || `매물 #${propertyId}`} ${purchasePrice.toLocaleString()}원에 판매 (세금 ${taxAmount.toLocaleString()}원 차감 후 ${sellerProceeds.toLocaleString()}원 입금, 구매자: ${userData.name})`,
            propertyId,
            propertyName: propertyData.name,
            purchasePrice,
            taxAmount,
            sellerProceeds,
            buyerId: uid,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 4-5. 관리자(국고)에 세금 입금
        if (taxAmount > 0) {
          // 관리자 현금에 세금 추가
          const usersSnapshot = await findApprovedAdminSnap(classCode);
          if (!usersSnapshot.empty) {
            const adminRef = usersSnapshot.docs[0].ref;
            transaction.update(adminRef, {
              cash: admin.firestore.FieldValue.increment(taxAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // 국고 통계만 기록 (totalAmount 제외 - 국고=관리자cash)
          const treasuryRef = db
            .collection("nationalTreasuries")
            .doc(classCode);
          transaction.set(treasuryRef, {
            realEstateTransactionTaxRevenue:
              admin.firestore.FieldValue.increment(taxAmount),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        // 5. 부동산 소유자 변경 + 자동 입주 처리
        transaction.update(propertyRef, {
          owner: uid,
          ownerName: userData.name,
          forSale: false,
          salePrice: admin.firestore.FieldValue.delete(),
          rent: rent,
          tenant: userData.name,
          tenantId: uid,
          tenantName: userData.name,
          lastRentPayment: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 6. 활동 로그 기록
        const taxInfo =
          taxAmount > 0 ? ` (거래세 ${taxAmount.toLocaleString()}원 납부)` : "";
        logActivity(
          transaction,
          uid,
          "부동산 구매",
          `부동산 #${propertyId}를 ${purchasePrice.toLocaleString()}원에 구매하고 입주했습니다.${taxInfo}`,
          {
            propertyId,
            propertyName: propertyData.name,
            purchasePrice,
            taxAmount,
            taxRate: realEstateTaxRate,
            previousOwner: propertyData.owner,
            previousOwnerName: propertyData.ownerName,
            previousTenantPropertyId,
          },
        );

        // ✅ idempotency mark (모든 write 끝난 후)
        markIdempotent(transaction, idemKeyRef);

        return {
          success: true,
          message: "부동산을 성공적으로 구매하고 입주했습니다.",
          propertyId,
          purchasePrice,
          taxAmount,
          remainingCash: currentCash - purchasePrice,
          movedIn: true,
          vacatedFrom: previousTenantPropertyId,
        };
      });

      logger.info(`[purchaseRealEstate] Success for user ${uid}:`, result);
      return result;
    } catch (error) {
      logger.error(`[purchaseRealEstate] Error:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "부동산 구매에 실패했습니다.",
      );
    }
  },
);

// 🏠 부동산 가격 제시(흥정): 구매 희망자가 개인 소유 부동산에 가격을 제안. 돈은 수락 시에만 이동.
exports.makeRealEstateOffer = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { propertyId, offerPrice } = request.data;
  if (!propertyId || !offerPrice || offerPrice <= 0) {
    throw new HttpsError("invalid-argument", "유효한 부동산과 제안 가격이 필요합니다.");
  }
  const offerPriceInt = Math.floor(offerPrice);
  const pid = String(propertyId);
  const propertyRef = db.collection("classes").doc(classCode).collection("realEstateProperties").doc(pid);
  try {
    const propDoc = await propertyRef.get();
    if (!propDoc.exists) throw new Error("부동산 정보를 찾을 수 없습니다.");
    const prop = propDoc.data();
    if (!prop.owner || prop.owner === "government") {
      throw new Error("정부 소유 부동산은 바로 구매할 수 있어요. 가격 제시는 개인 소유 부동산만 가능합니다.");
    }
    if (prop.owner === uid) throw new Error("내 부동산에는 제안할 수 없습니다.");

    const buyerDoc = await db.collection("users").doc(uid).get();
    const buyerCash = buyerDoc.exists ? (buyerDoc.data().cash || 0) : 0;
    if (buyerCash < offerPriceInt) {
      throw new Error(`현금이 부족합니다. (제안가: ${offerPriceInt.toLocaleString()}원, 보유: ${buyerCash.toLocaleString()}원)`);
    }

    const offersCol = db.collection("classes").doc(classCode).collection("realEstateOffers");
    const dup = await offersCol
      .where("propertyId", "==", pid).where("buyerId", "==", uid).where("status", "==", "pending").limit(1).get();
    if (!dup.empty) {
      await dup.docs[0].ref.update({
        offerPrice: offerPriceInt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true, message: "제안 가격을 갱신했습니다.", offerId: dup.docs[0].id };
    }
    const ref = await offersCol.add({
      propertyId: pid, classCode, buyerId: uid, buyerName: userData.name || "익명",
      ownerId: prop.owner, ownerName: prop.ownerName || "소유주",
      propertyName: prop.name || `매물 #${pid}`,
      originalPrice: prop.salePrice || prop.price || 0,
      offerPrice: offerPriceInt, status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, message: "가격 제안이 전송되었습니다.", offerId: ref.id };
  } catch (error) {
    logger.error(`[makeRealEstateOffer] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "가격 제안에 실패했습니다.");
  }
});

// 🏠 부동산 제안 응답: 소유자가 수락(소유권 이전 트랜잭션) 또는 거절.
exports.respondToRealEstateOffer = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { offerId, response, idempotencyKey } = request.data;
  if (!offerId || !["accept", "reject"].includes(response)) {
    throw new HttpsError("invalid-argument", "유효한 제안 ID와 응답(accept/reject)이 필요합니다.");
  }
  const offerRef = db.collection("classes").doc(classCode).collection("realEstateOffers").doc(offerId);

  try {
    if (response === "reject") {
      await db.runTransaction(async (tx) => {
        const od = await tx.get(offerRef);
        if (!od.exists) throw new Error("제안 정보를 찾을 수 없습니다.");
        const o = od.data();
        if (o.ownerId !== uid) throw new Error("내 부동산에 온 제안만 응답할 수 있습니다.");
        if (o.status !== "pending") throw new Error("이미 처리된 제안입니다.");
        tx.update(offerRef, { status: "rejected", respondedAt: admin.firestore.FieldValue.serverTimestamp() });
      });
      return { success: true, message: "제안을 거절했습니다." };
    }

    // accept: 소유권 이전 (purchaseRealEstate 트랜잭션 패턴 복제)
    const adminQuery = await findApprovedAdminSnap(classCode);
    const adminRef = adminQuery.empty ? null : adminQuery.docs[0].ref;

    const result = await db.runTransaction(async (transaction) => {
      const idemKeyRef = await checkIdempotent(transaction, idempotencyKey);

      // ── READS ──
      const offerDoc = await transaction.get(offerRef);
      if (!offerDoc.exists) throw new Error("제안 정보를 찾을 수 없습니다.");
      const offer = offerDoc.data();
      if (offer.ownerId !== uid) throw new Error("내 부동산에 온 제안만 수락할 수 있습니다.");
      if (offer.status !== "pending") throw new Error("이미 처리된 제안입니다.");

      const propertyRef = db.collection("classes").doc(classCode).collection("realEstateProperties").doc(offer.propertyId);
      const buyerRef = db.collection("users").doc(offer.buyerId);
      const sellerRef = db.collection("users").doc(uid);
      const settingsRef = db.collection("classes").doc(classCode).collection("realEstateSettings").doc("settingsDoc");
      const govSettingsRef = db.collection("governmentSettings").doc(classCode);

      const [propDoc, buyerDoc, settingsDoc, govDoc] = await Promise.all([
        transaction.get(propertyRef),
        transaction.get(buyerRef),
        transaction.get(settingsRef),
        transaction.get(govSettingsRef),
      ]);
      if (!propDoc.exists) throw new Error("부동산 정보를 찾을 수 없습니다.");
      const prop = propDoc.data();
      if (prop.owner !== uid) throw new Error("이미 소유권이 변경된 부동산입니다.");
      if (!buyerDoc.exists) throw new Error("구매자 정보를 찾을 수 없습니다.");

      const price = Math.floor(offer.offerPrice);
      const buyerCash = buyerDoc.data().cash || 0;
      if (buyerCash < price) {
        throw new Error(`구매자의 현금이 부족합니다. (필요: ${price.toLocaleString()}원, 보유: ${buyerCash.toLocaleString()}원)`);
      }

      const rentPct = (settingsDoc.exists ? settingsDoc.data().rentPercentage : 1) || 1;
      const rent = prop.rent || Math.round((prop.price || price) * (rentPct / 100));
      const taxRate = (govDoc.exists ? govDoc.data()?.taxSettings?.realEstateTransactionTaxRate : 0.03) || 0.03;
      const taxAmount = Math.round(price * taxRate);
      const sellerProceeds = price - taxAmount;

      const allProps = await transaction.get(
        db.collection("classes").doc(classCode).collection("realEstateProperties"),
      );
      const otherOffers = await transaction.get(
        db.collection("classes").doc(classCode).collection("realEstateOffers")
          .where("propertyId", "==", offer.propertyId).where("status", "==", "pending"),
      );

      // ── WRITES ──
      let vacatedFrom = null;
      allProps.forEach((d) => {
        if (d.id !== offer.propertyId && d.data().tenantId === offer.buyerId) {
          vacatedFrom = d.id;
          transaction.update(d.ref, {
            tenant: null, tenantId: null, tenantName: null, lastRentPayment: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      transaction.update(buyerRef, {
        cash: admin.firestore.FieldValue.increment(-price),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(buyerRef.collection("transactions").doc(), {
        type: "realEstatePurchase", amount: -price,
        description: `[부동산 흥정 구매] ${offer.propertyName} ${price.toLocaleString()}원 (거래세 ${taxAmount.toLocaleString()}원 별도)`,
        propertyId: offer.propertyId, purchasePrice: price, taxAmount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(sellerRef, {
        cash: admin.firestore.FieldValue.increment(sellerProceeds),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(sellerRef.collection("transactions").doc(), {
        type: "realEstateSell", amount: sellerProceeds,
        description: `[부동산 흥정 매도] ${offer.propertyName} ${price.toLocaleString()}원에 판매 (세금 ${taxAmount.toLocaleString()}원 차감 후 ${sellerProceeds.toLocaleString()}원 입금, 구매자: ${offer.buyerName})`,
        propertyId: offer.propertyId, purchasePrice: price, taxAmount, sellerProceeds, buyerId: offer.buyerId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (taxAmount > 0) {
        if (adminRef) {
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(taxAmount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        transaction.set(db.collection("nationalTreasuries").doc(classCode), {
          realEstateTransactionTaxRevenue: admin.firestore.FieldValue.increment(taxAmount),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      transaction.update(propertyRef, {
        owner: offer.buyerId, ownerName: offer.buyerName, forSale: false,
        salePrice: admin.firestore.FieldValue.delete(), rent,
        tenant: offer.buyerName, tenantId: offer.buyerId, tenantName: offer.buyerName,
        lastRentPayment: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(offerRef, { status: "accepted", respondedAt: admin.firestore.FieldValue.serverTimestamp() });
      otherOffers.forEach((d) => {
        if (d.id !== offerId) {
          transaction.update(d.ref, { status: "rejected", respondedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      });

      logActivity(transaction, offer.buyerId, "부동산 구매",
        `부동산 #${offer.propertyId}를 흥정으로 ${price.toLocaleString()}원에 구매하고 입주했습니다.`,
        { propertyId: offer.propertyId, purchasePrice: price, taxAmount, previousOwner: uid });

      markIdempotent(transaction, idemKeyRef);
      return { propertyId: offer.propertyId, price, taxAmount, vacatedFrom };
    });
    return { success: true, message: "제안을 수락했습니다. 소유권이 이전되었습니다.", ...result };
  } catch (error) {
    logger.error(`[respondToRealEstateOffer] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "제안 응답에 실패했습니다.");
  }
});

// 🏠 부동산 제안 취소: 제안자 본인만.
exports.cancelRealEstateOffer = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { offerId } = request.data;
  if (!offerId) throw new HttpsError("invalid-argument", "제안 ID가 필요합니다.");
  const offerRef = db.collection("classes").doc(classCode).collection("realEstateOffers").doc(offerId);
  try {
    await db.runTransaction(async (tx) => {
      const od = await tx.get(offerRef);
      if (!od.exists) throw new Error("제안 정보를 찾을 수 없습니다.");
      const o = od.data();
      if (o.buyerId !== uid) throw new Error("내가 보낸 제안만 취소할 수 있습니다.");
      if (o.status !== "pending") throw new Error("이미 처리된 제안입니다.");
      tx.update(offerRef, { status: "cancelled", respondedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    return { success: true, message: "제안을 취소했습니다." };
  } catch (error) {
    logger.error(`[cancelRealEstateOffer] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "제안 취소에 실패했습니다.");
  }
});

// 🏠 부동산 판매 등록(소유자가 호가 지정) — realEstateProperties는 rules상 admin만 쓰기 가능하므로 CF로 처리.
exports.setRealEstateForSale = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { propertyId, salePrice } = request.data;
  if (!propertyId || !salePrice || salePrice <= 0) {
    throw new HttpsError("invalid-argument", "유효한 부동산과 판매 가격이 필요합니다.");
  }
  const ref = db.collection("classes").doc(classCode).collection("realEstateProperties").doc(String(propertyId));
  try {
    await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists) throw new Error("부동산 정보를 찾을 수 없습니다.");
      if (d.data().owner !== uid) throw new Error("내 소유 부동산만 판매 등록할 수 있습니다.");
      tx.update(ref, {
        forSale: true,
        salePrice: Math.floor(salePrice),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return { success: true, message: "판매 등록되었습니다." };
  } catch (error) {
    logger.error(`[setRealEstateForSale] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "판매 등록에 실패했습니다.");
  }
});

// 🏠 부동산 판매 취소(소유자)
exports.cancelRealEstateForSale = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { propertyId } = request.data;
  if (!propertyId) throw new HttpsError("invalid-argument", "부동산 ID가 필요합니다.");
  const ref = db.collection("classes").doc(classCode).collection("realEstateProperties").doc(String(propertyId));
  try {
    await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists) throw new Error("부동산 정보를 찾을 수 없습니다.");
      if (d.data().owner !== uid) throw new Error("내 소유 부동산만 판매 취소할 수 있습니다.");
      tx.update(ref, {
        forSale: false,
        salePrice: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return { success: true, message: "판매가 취소되었습니다." };
  } catch (error) {
    logger.error(`[cancelRealEstateForSale] Error for user ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "판매 취소에 실패했습니다.");
  }
});

// 부동산 입주/퇴거 (학생 렌트). 구 클라 handleTenancy runTransaction(본인 cash -rent·집주인 +rent·
//   propertyRef 갱신)을 CF로 이관 — realEstateProperties가 rules상 admin-only write라 학생 클라
//   트랜잭션이 propertyRef 쓰기에서 막혀 사실상 렌트가 불가였음(2026-07-17 사용자 결정으로 활성화).
//   CF(Admin SDK)만 propertyRef를 쓸 수 있으므로 이 CF가 유일 경로.
exports.tenancyAction = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
    const { propertyId, idempotencyKey, action } = request.data || {};

    if (!propertyId || typeof propertyId !== "string" || propertyId.includes("/")) {
      throw new HttpsError("invalid-argument", "유효한 부동산 정보가 필요합니다.");
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
    }
    // 입주/퇴거 의도를 클라가 명시. 서버는 이 의도를 현재 상태와 대조해 불일치 시 거부.
    // (구 토글 설계는 연타 시 "입주 직후 자동 퇴거"로 월세만 날리는 자금손실이 있었다.)
    if (action !== "moveIn" && action !== "vacate") {
      throw new HttpsError("invalid-argument", "유효한 요청 유형(action)이 필요합니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
    }

    const propsColl = db
      .collection("classes")
      .doc(classCode)
      .collection("realEstateProperties");
    const propertyRef = propsColl.doc(propertyId);
    const userRef = db.collection("users").doc(uid);
    const settingsRef = db
      .collection("classes")
      .doc(classCode)
      .collection("realEstateSettings")
      .doc("settingsDoc");

    try {
      const result = await db.runTransaction(async (transaction) => {
        // ── 읽기(모든 read 먼저) ──
        const keyRef = await checkIdempotent(transaction, idempotencyKey);
        const propertyDoc = await transaction.get(propertyRef);
        if (!propertyDoc.exists) throw new Error("부동산 정보를 찾을 수 없습니다.");
        const p = propertyDoc.data();

        // 퇴거: 반드시 현재 세입자가 본인이어야 함(cash 이동 없음).
        // action으로 의도를 명시받아, 연타 시 "입주→자동퇴거" 토글 손실을 차단.
        if (action === "vacate") {
          if (p.tenantId !== uid) {
            throw new Error("이 부동산의 세입자가 아닙니다. 이미 퇴거되었을 수 있습니다.");
          }
          transaction.update(propertyRef, {
            tenant: null,
            tenantId: null,
            tenantName: null,
            lastRentPayment: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          markIdempotent(transaction, keyRef);
          return { action: "vacate" };
        }

        // 입주(action === "moveIn"): 이미 본인이 입주 중이면 연타로 간주해 거부(토글 방지).
        if (p.tenantId === uid) throw new Error("이미 이 부동산에 입주해 있습니다.");
        // 다른 사람이 입주 중이면 불가.
        if (p.tenantId) throw new Error("이미 다른 사람이 입주해 있습니다.");

        // 월세 = property.rent, 없으면 설정 비율로 계산(구 클라·purchaseRealEstate와 동일).
        const settingsDoc = await transaction.get(settingsRef);
        const rentPercentage = settingsDoc.exists
          ? (Number(settingsDoc.data().rentPercentage) || 1) : 1;
        const rent = Number.isFinite(Number(p.rent)) && Number(p.rent) > 0
          ? Math.floor(Number(p.rent))
          : Math.round((Number(p.price) || 0) * (rentPercentage / 100));
        if (!Number.isFinite(rent) || rent < 0 || rent > 10000000000) {
          throw new Error("월세 정보가 올바르지 않습니다.");
        }

        // 자기 소유 매물이면 "자기에게 월세"라 현금 이동이 없어야 한다(net 0).
        // 구 클라 주석("자기 땅 입주 시 cash 변동 없음")의 의도이나 구 코드는 차감만 실행돼
        // rent가 증발하던 잠재 결함이 있었다 — 이관 시 payRent로 바로잡는다.
        const owner = p.owner;
        const selfOwned = owner === uid;
        const payRent = selfOwned ? 0 : rent;

        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) throw new Error("사용자 정보를 찾을 수 없습니다.");
        const uData = userDoc.data();
        if (typeof uData.cash !== "number" || !Number.isFinite(uData.cash)) {
          throw new Error("잔액 정보가 올바르지 않습니다.");
        }
        if (payRent > 0 && uData.cash < payRent) {
          throw new Error("첫 월세를 낼 현금이 부족합니다.");
        }

        // 이미 다른 부동산에 입주 중이면 불가. tenantId==uid 문서만 조회(전체 스캔·500 한도 회피).
        const elsewhere = await transaction.get(propsColl.where("tenantId", "==", uid));
        for (const d of elsewhere.docs) {
          if (d.id !== propertyId) {
            throw new Error("이미 다른 부동산에 입주해 있습니다. 먼저 퇴거해야 합니다.");
          }
        }

        // 집주인 지급 대상(정부/본인 소유면 지급 없음). 집주인 문서 없음·타학급이면
        // 세입자 현금이 증발하지 않도록 입주 자체를 중단(구 클라 fail-closed와 동일, 자금보존).
        let ownerRef = null;
        let payOwner = false;
        if (owner && owner !== "government" && !selfOwned && payRent > 0) {
          ownerRef = db.collection("users").doc(owner);
          const ownerDoc = await transaction.get(ownerRef);
          if (!ownerDoc.exists) {
            throw new Error("집주인 정보를 찾을 수 없어 입주할 수 없습니다.");
          }
          const oData = ownerDoc.data();
          // 반경계: 집주인도 같은 학급이어야 지급(타학급 유출·증발 차단).
          if (oData.classCode !== classCode) {
            throw new Error("집주인이 다른 학급이라 입주할 수 없습니다.");
          }
          if (typeof oData.cash !== "number" || !Number.isFinite(oData.cash)) {
            throw new Error("집주인 잔액 정보가 올바르지 않습니다.");
          }
          payOwner = true;
        }

        // ── 쓰기 ──
        const logExpireAt = admin.firestore.Timestamp.fromMillis(
          Date.now() + 90 * 24 * 60 * 60 * 1000,
        );
        if (payRent > 0) {
          transaction.update(userRef, {
            cash: admin.firestore.FieldValue.increment(-payRent),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        if (payOwner) {
          transaction.update(ownerRef, {
            cash: admin.firestore.FieldValue.increment(payRent),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        transaction.update(propertyRef, {
          tenant: userData.name || "익명",
          tenantId: uid,
          tenantName: userData.name || "익명",
          lastRentPayment: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 거래내역(activity_logs 최상위 amount) — 실제 현금 이동이 있을 때만 기록.
        const addr = p.address || "부동산";
        if (payRent > 0) {
          const tenantLogRef = db.collection("activity_logs").doc();
          transaction.set(tenantLogRef, {
            userId: uid,
            userName: userData.name || "익명",
            type: "realEstateRent",
            description: `${addr} 입주 (월세 -${payRent.toLocaleString()}원)`,
            amount: -payRent,
            classCode,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt: logExpireAt,
          });
          if (payOwner) {
            const ownerLogRef = db.collection("activity_logs").doc();
            transaction.set(ownerLogRef, {
              userId: owner,
              userName: p.ownerName || "건물주",
              type: "realEstateRent",
              description: `${userData.name || "학생"}님 입주 - 월세 수익 (+${payRent.toLocaleString()}원)`,
              amount: payRent,
              classCode,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              expireAt: logExpireAt,
            });
          }
        }

        markIdempotent(transaction, keyRef);
        return { action: "moveIn", rent: payRent };
      });
      return {
        success: true,
        ...result,
        message: result.action === "vacate"
          ? "성공적으로 퇴거했습니다."
          : "성공적으로 입주했습니다. 첫 월세가 지불되었습니다.",
      };
    } catch (error) {
      logger.error(`[tenancyAction] Error (uid ${uid}, property ${propertyId}):`, error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("aborted", error.message || "입주/퇴거 처리에 실패했습니다.");
    }
  },
);

exports.processSettlement = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    try {
      const { uid, classCode, userData } = await checkAuthAndGetUserData(
        request,
        false,
      ); // no admin check yet

      const { reportId, amount, senderId, recipientId } = request.data;

      if (!reportId || !amount || !senderId || !recipientId || !classCode) {
        throw new HttpsError(
          "invalid-argument",
          "필수 파라미터가 누락되었습니다.",
        );
      }

      // 관리자 또는 경찰청장만 합의금 처리 가능 (승인된 관리자만)
      const isAdmin = hasAdminPower(userData);

      // jobName 또는 jobTitle 필드를 확인
      // 또는 selectedJobIds에서 경찰청장 직업이 있는지 확인
      // ⚠️ 레거시 userData.jobName / userData.jobTitle 은 더 이상 신뢰하지 않는다 (2026-07-14).
      //    앱 어디에서도 쓰지 않는 죽은 필드인데 rules에서는 학생이 자유롭게 write 할 수 있어,
      //    updateDoc({jobName:"경찰청장"}) 한 줄로 합의금 처리 권한을 자가 획득할 수 있었다.
      //    권한은 오직 jobs 컬렉션과 대조한 유효 직업(선택 + 교사 지정)으로만 판정한다.
      let isPoliceChief = false;
      if (
        toJobIdArray(userData.selectedJobIds).length > 0 ||
        toJobIdArray(userData.appointedJobIds).length > 0
      ) {
        // 유효 직업(선택 + 교사 지정) 재계산 후 경찰청장 여부 확인 (jobUtils 규약).
        // 유령·중복 id와 selectedJobIds에 섞인 지정 전용 직업은 여기서 전부 걸러진다.
        const jobsSnapshot = await db
          .collection("jobs")
          .where("classCode", "==", classCode)
          .get();

        isPoliceChief = hasJobTitle(
          userData,
          buildJobMap(jobsSnapshot),
          "경찰청장",
        );
      }

      logger.info(
        `[processSettlement] 권한 확인: uid=${uid}, isAdmin=${isAdmin}, isPoliceChief=${isPoliceChief}, jobName=${userData.jobName}, jobTitle=${userData.jobTitle}, selectedJobIds=${JSON.stringify(userData.selectedJobIds)}`,
      );

      if (!isAdmin && !isPoliceChief) {
        throw new HttpsError(
          "permission-denied",
          "관리자 또는 경찰청장만 합의금을 처리할 수 있습니다.",
        );
      }

      const settlementAmount = parseInt(amount, 10);
      if (isNaN(settlementAmount) || settlementAmount <= 0) {
        throw new HttpsError("invalid-argument", "합의금은 0보다 커야 합니다.");
      }

      const reportRef = db
        .collection("classes")
        .doc(classCode)
        .collection("policeReports")
        .doc(reportId);

      await db.runTransaction(async (transaction) => {
        // 1) 먼저 신고 문서를 읽어 실제 당사자를 파생한다. (users 읽기는 그 다음)
        const reportDoc = await transaction.get(reportRef);
        if (!reportDoc.exists) throw new Error("신고 정보를 찾을 수 없습니다.");
        const reportData = reportDoc.data();

        // 멱등성: 이미 합의 처리된 신고는 재처리(중복 지급) 차단
        if (
          reportData.settlementPaid === true ||
          reportData.status === "settled" ||
          reportData.status === "resolved_settlement"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "이미 합의금 지급이 완료된 사건입니다.",
          );
        }

        // 접수 전/이미 종결된 신고는 합의 불가 — 정상 처리 대기 상태(제출·접수)에서만.
        // (반려·벌금 처리 완료된 건이나, 접수 절차를 건너뛴 신고를 바로 지급하는 것을 막는다.
        //  UI도 submitted/accepted 신고에만 합의 버튼을 노출한다.)
        if (
          reportData.status !== "submitted" &&
          reportData.status !== "accepted"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "접수 대기 또는 접수된 신고만 합의 처리할 수 있습니다.",
          );
        }

        // 🔒 2026-07-15 codex 교차검증: 실제 송·수금 당사자는 클라이언트 파라미터가 아니라
        //    신고 문서에서 파생한다(위변조 방지). 가해자(지급자)는 오직 신고의 피고에서 파생하고
        //    클라이언트 senderId는 신뢰하지 않는다 — defendantId를 비운 위조 신고 + 임의 senderId
        //    조합으로 남의 현금을 빼가는 경로 차단.
        const effectiveSenderId =
          reportData.defendantId || reportData.reportedUserId || null;
        if (!effectiveSenderId) {
          throw new HttpsError(
            "failed-precondition",
            "이 신고에 가해자(피고소인) 정보가 없어 합의금을 처리할 수 없습니다.",
          );
        }

        // 수령자(피해자)도 신고 문서의 victimId로 고정. 피해자가 없는 구(舊) 신고만
        // 담당자가 수령인을 직접 고르는데, 이 자유 선택은 경찰청장(학생) 위조 위험이 있으므로
        // 교사(관리자)만 허용한다.
        if (!reportData.victimId && !isAdmin) {
          throw new HttpsError(
            "permission-denied",
            "피해자가 지정되지 않은 신고는 담임 선생님만 합의금을 처리할 수 있습니다.",
          );
        }
        const effectiveRecipientId = reportData.victimId || recipientId;

        if (!effectiveRecipientId) {
          throw new HttpsError(
            "failed-precondition",
            "합의금 받을 피해자를 지정해주세요.",
          );
        }
        if (effectiveSenderId === effectiveRecipientId) {
          throw new HttpsError(
            "invalid-argument",
            "가해자와 피해자가 같아 합의금을 처리할 수 없습니다.",
          );
        }

        const senderRef = db.collection("users").doc(effectiveSenderId);
        const recipientRef = db.collection("users").doc(effectiveRecipientId);
        const [senderDoc, recipientDoc] = await transaction.getAll(
          senderRef,
          recipientRef,
        );
        if (!senderDoc.exists)
          throw new Error("가해자 정보를 찾을 수 없습니다.");
        if (!recipientDoc.exists)
          throw new Error("피해자 정보를 찾을 수 없습니다.");

        const senderData = senderDoc.data();
        const recipientData = recipientDoc.data();

        // 교차 학급 지급 차단 — 당사자 모두 이 학급 소속이어야 한다.
        if (
          senderData.classCode !== classCode ||
          recipientData.classCode !== classCode
        ) {
          throw new HttpsError(
            "failed-precondition",
            "합의 당사자가 이 학급 소속이 아닙니다.",
          );
        }

        const processorName =
          userData.name || userData.displayName || "경찰서";

        transaction.update(senderRef, {
          cash: admin.firestore.FieldValue.increment(-settlementAmount),
        });
        transaction.update(recipientRef, {
          cash: admin.firestore.FieldValue.increment(settlementAmount),
        });
        transaction.update(reportRef, {
          status: "resolved_settlement",
          settlementAmount: settlementAmount,
          amount: settlementAmount,
          settlementPaid: true,
          victimId: effectiveRecipientId,
          resolution: request.data.reason || "상호 합의에 따른 합의금 지급",
          resolutionDate: admin.firestore.FieldValue.serverTimestamp(),
          processedById: uid,
          processedByName: processorName,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ⚠️ logActivity는 내부에서 await 후 transaction.set을 수행하므로
        //    반드시 await 해야 커밋 전에 거래내역이 기록된다(누락 방지).
        await logActivity(
          transaction,
          effectiveSenderId,
          LOG_TYPES.CASH_EXPENSE,
          `경찰서 합의금으로 ${recipientData.name}에게 ${settlementAmount}원 지급`,
          { reportId, victimName: recipientData.name },
        );
        await logActivity(
          transaction,
          effectiveRecipientId,
          LOG_TYPES.CASH_INCOME,
          `경찰서 합의금으로 ${senderData.name}에게서 ${settlementAmount}원 수령`,
          { reportId, offenderName: senderData.name },
        );
      });

      logger.info(
        `Settlement processed successfully for report ${reportId} by admin ${uid}`,
      );
      return { success: true, message: "합의금이 성공적으로 처리되었습니다." };
    } catch (error) {
      logger.error(
        `[processSettlement] Error for user ${request.auth?.uid}:`,
        error,
      );
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        error.message || "합의금 처리 중 내부 오류가 발생했습니다.",
      );
    }
  },
);

// ============================================
// 전체 Firebase Auth 계정 목록 조회 (SuperAdmin 전용)
// ============================================
exports.listAllAuthUsers = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { isSuperAdmin } = await checkAuthAndGetUserData(request, true);
    if (!isSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "슈퍼관리자 권한이 필요합니다.",
      );
    }

    try {
      const listAllUsers = async (nextPageToken) => {
        const result = await admin.auth().listUsers(1000, nextPageToken);
        let users = result.users.map((u) => ({
          uid: u.uid,
          email: u.email || "",
          displayName: u.displayName || "",
          disabled: u.disabled,
          createdAt: u.metadata.creationTime,
          lastSignIn: u.metadata.lastSignInTime,
        }));
        if (result.pageToken) {
          const moreUsers = await listAllUsers(result.pageToken);
          users = users.concat(moreUsers);
        }
        return users;
      };

      const authUsers = await listAllUsers();

      // Firestore users와 매칭
      const usersSnap = await db.collection("users").get();
      const firestoreMap = {};
      usersSnap.docs.forEach((doc) => {
        firestoreMap[doc.id] = { id: doc.id, ...doc.data() };
      });

      const merged = authUsers.map((au) => ({
        ...au,
        firestoreExists: !!firestoreMap[au.uid],
        firestoreData: firestoreMap[au.uid] || null,
      }));

      return { success: true, users: merged, total: merged.length };
    } catch (error) {
      logger.error("[listAllAuthUsers] 오류:", error);
      throw new HttpsError("internal", "계정 목록 조회 실패: " + error.message);
    }
  },
);

// ============================================
// Firebase Auth 계정 삭제 (SuperAdmin 전용)
// ============================================
exports.deleteAuthUser = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid: callerUid, isSuperAdmin } = await checkAuthAndGetUserData(
      request,
      true,
    );
    if (!isSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "슈퍼관리자 권한이 필요합니다.",
      );
    }

    const { targetUid } = request.data;
    if (!targetUid) {
      throw new HttpsError(
        "invalid-argument",
        "삭제할 사용자 UID가 필요합니다.",
      );
    }
    if (targetUid === callerUid) {
      throw new HttpsError(
        "invalid-argument",
        "자기 자신은 삭제할 수 없습니다.",
      );
    }

    try {
      // Firebase Auth에서 삭제 (없으면 무시하고 Firestore만 삭제)
      try {
        await admin.auth().deleteUser(targetUid);
      } catch (authErr) {
        if (authErr.code !== "auth/user-not-found") throw authErr;
        logger.info(
          `[deleteAuthUser] Auth에 없는 사용자 ${targetUid} - Firestore만 삭제`,
        );
      }

      // Firestore에서도 삭제
      const userRef = db.collection("users").doc(targetUid);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.delete();
      }

      logger.info(
        `[deleteAuthUser] 슈퍼관리자 ${callerUid}가 사용자 ${targetUid} 삭제`,
      );
      return { success: true, message: "계정이 삭제되었습니다." };
    } catch (error) {
      logger.error("[deleteAuthUser] 오류:", error);
      throw new HttpsError("internal", "계정 삭제 실패: " + error.message);
    }
  },
);

// ============================================
// 법원 데이터 초기화 + 데모 시드 (SuperAdmin 전용)
// ============================================
exports.seedCourtData = onCall(
  { region: "asia-northeast3", timeoutSeconds: 120 },
  async (request) => {
    const {
      uid: callerUid,
      isSuperAdmin,
      classCode,
    } = await checkAuthAndGetUserData(request, true);
    if (!isSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "슈퍼관리자 권한이 필요합니다.",
      );
    }

    const targetClassCode = request.data?.classCode || classCode;
    logger.info(
      `[seedCourtData] 학급 ${targetClassCode} 법원 데이터 초기화 시작`,
    );

    try {
      // 헬퍼: 컬렉션 내 모든 문서 삭제 (서브컬렉션 포함)
      async function deleteAll(collRef, subNames = []) {
        const snap = await collRef.get();
        let count = 0;
        for (const doc of snap.docs) {
          for (const sub of subNames) {
            const subSnap = await doc.ref.collection(sub).get();
            for (const sd of subSnap.docs) await sd.ref.delete();
          }
          await doc.ref.delete();
          count++;
        }
        return count;
      }

      // 1. 기존 데이터 삭제
      const classRef = db.collection("classes").doc(targetClassCode);
      const cDel = await deleteAll(classRef.collection("courtComplaints"));
      const rDel = await deleteAll(classRef.collection("trialRooms"), [
        "messages",
        "evidence",
        "voting",
      ]);
      const tDel = await deleteAll(classRef.collection("trialResults"));
      logger.info(
        `[seedCourtData] 삭제: complaints=${cDel}, rooms=${rDel}, results=${tDel}`,
      );

      // 2. 학생 목록
      const usersSnap = await db
        .collection("users")
        .where("classCode", "==", targetClassCode)
        .where("isAdmin", "==", false)
        .get();
      const students = [];
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        if (!data.isSuperAdmin && !data.isTeacher) {
          students.push({
            uid: d.id,
            name: data.name,
            num: data.studentNumber || 0,
          });
        }
      });
      students.sort((a, b) => a.num - b.num);

      if (students.length < 3) {
        return {
          success: true,
          message: `기존 데이터 삭제 완료 (학생 ${students.length}명 — 시드 생성 스킵)`,
        };
      }

      // 관리자 정보
      const adminUserDoc = await db.collection("users").doc(callerUid).get();
      const adminName = adminUserDoc.exists
        ? adminUserDoc.data().name
        : "선생님";

      const now = admin.firestore.Timestamp.now();
      const daysAgo = (n) =>
        admin.firestore.Timestamp.fromMillis(now.toMillis() - n * 86400000);

      // 3. 데모 고소장
      const complaintsRef = classRef.collection("courtComplaints");
      const resultsRef = classRef.collection("trialResults");

      // 사건1: 해결됨
      await complaintsRef.add({
        complainantId: students[0].uid,
        complainantName: students[0].name,
        defendantId: students[1].uid,
        defendantName: students[1].name,
        caseType: "general",
        status: "resolved",
        reason: `${students[1].name} 학생이 제 필통을 허락 없이 가져가서 잃어버렸습니다. 새 필통 값 3,000알찬을 배상해주세요.`,
        desiredResolution: "물건 배상 3,000알찬",
        judgment: `피고 ${students[1].name}은 원고의 필통을 분실한 사실이 인정되어, 배상금 3,000알찬을 지급하라.`,
        submissionDate: daysAgo(7),
        indictmentDate: daysAgo(6),
        resolvedAt: daysAgo(4),
        settlementPaid: true,
        settlementAmount: 3000,
        settlementDate: daysAgo(4),
        caseNumber: "CT0001",
        classCode: targetClassCode,
        likedBy: [],
        dislikedBy: [],
      });

      // 사건2: 재판 중
      const case2 = await complaintsRef.add({
        complainantId: students[2].uid,
        complainantName: students[2].name,
        defendantId: students[3 % students.length].uid,
        defendantName: students[3 % students.length].name,
        caseType: "general",
        status: "on_trial",
        reason: `${students[3 % students.length].name} 학생이 다른 친구들 앞에서 저에 대해 거짓말을 퍼뜨렸습니다.`,
        desiredResolution: "공개 사과 및 벌금 2,000알찬",
        submissionDate: daysAgo(3),
        indictmentDate: daysAgo(2),
        caseNumber: "CT0002",
        classCode: targetClassCode,
        likedBy: [],
        dislikedBy: [],
      });

      // 재판방
      const s3 = students[3 % students.length];
      const room2 = await classRef.collection("trialRooms").add({
        caseId: case2.id,
        caseNumber: "CT0002",
        judgeId: callerUid,
        judgeName: adminName,
        complainantId: students[2].uid,
        defendantId: s3.uid,
        prosecutorId: students[0].uid,
        prosecutorName: students[0].name,
        lawyerId: students[1].uid,
        lawyerName: students[1].name,
        juryIds: students.length >= 5 ? [students[4].uid] : [],
        participants: [
          callerUid,
          students[2].uid,
          s3.uid,
          students[0].uid,
          students[1].uid,
        ],
        status: "active",
        createdAt: daysAgo(2),
        lastActivity: now,
        silencedUsers: [],
      });

      // 재판방 메시지
      const msgs = [
        {
          type: "system",
          text: "재판이 시작되었습니다.",
          userName: "시스템",
          userRole: "system",
          timestamp: daysAgo(2),
        },
        {
          type: "chat",
          userId: callerUid,
          userName: adminName,
          userRole: "judge",
          text: "본 재판을 시작하겠습니다. 원고 측 진술을 먼저 듣겠습니다.",
          timestamp: daysAgo(2),
        },
        {
          type: "chat",
          userId: students[2].uid,
          userName: students[2].name,
          userRole: "complainant",
          text: "피고가 다른 친구들에게 제가 시험에서 커닝했다고 말하는 것을 들었습니다. 이것은 사실이 아닙니다.",
          timestamp: daysAgo(2),
        },
        {
          type: "chat",
          userId: students[0].uid,
          userName: students[0].name,
          userRole: "prosecutor",
          text: "원고의 진술을 뒷받침하는 목격자가 있습니다.",
          timestamp: daysAgo(1),
        },
        {
          type: "chat",
          userId: students[1].uid,
          userName: students[1].name,
          userRole: "lawyer",
          text: "피고는 농담으로 한 말이며 악의적 의도가 없었습니다.",
          timestamp: daysAgo(1),
        },
        {
          type: "chat",
          userId: s3.uid,
          userName: s3.name,
          userRole: "defendant",
          text: "정말 죄송합니다. 농담이었는데 상처를 줄 줄 몰랐습니다.",
          timestamp: now,
        },
      ];
      for (const msg of msgs) {
        await room2.collection("messages").add(msg);
      }

      // 사건3: 접수 대기
      if (students.length >= 5) {
        await complaintsRef.add({
          complainantId: students[3].uid,
          complainantName: students[3].name,
          defendantId: students[4].uid,
          defendantName: students[4].name,
          caseType: "general",
          status: "pending",
          reason: `${students[4].name} 학생이 제 자리에 있던 간식을 허락 없이 먹었습니다.`,
          desiredResolution: "간식 값 1,000알찬 배상",
          submissionDate: daysAgo(1),
          caseNumber: "CT0003",
          classCode: targetClassCode,
          likedBy: [],
          dislikedBy: [],
        });
      }

      // 사건4: 기각
      await complaintsRef.add({
        complainantId: students[1].uid,
        complainantName: students[1].name,
        defendantId: students[0].uid,
        defendantName: students[0].name,
        caseType: "general",
        status: "dismissed",
        reason: "쉬는 시간에 제 의자를 밀어서 넘어졌습니다.",
        desiredResolution: "사과 및 벌금 1,500알찬",
        judgment: "증거 불충분으로 기각합니다.",
        submissionDate: daysAgo(10),
        resolvedAt: daysAgo(8),
        caseNumber: "CT0004",
        classCode: targetClassCode,
        likedBy: [],
        dislikedBy: [],
      });

      // 재판 결과
      await resultsRef.add({
        roomId: "demo",
        caseNumber: "CT0001",
        caseTitle: `${students[0].name} vs ${students[1].name} — 물건 분실 배상`,
        judgeId: callerUid,
        judgeName: adminName,
        complainantId: students[0].uid,
        defendantId: students[1].uid,
        verdict: "유죄 — 배상금 3,000알찬 지급",
        verdictReason:
          "피고가 원고의 필통을 분실한 사실이 확인되어 배상을 명합니다.",
        verdictDate: daysAgo(4),
        paymentAmount: 3000,
        paymentType: "settlement",
        participants: [callerUid, students[0].uid, students[1].uid],
      });

      // ==========================================
      // 경찰서 데이터 초기화 + 데모 시드
      // ==========================================
      logger.info("[seedCourtData] 경찰서 데이터 초기화...");
      const policeRef = classRef.collection("policeReports");
      const pDel = await deleteAll(policeRef);
      logger.info(`[seedCourtData] 경찰 신고 ${pDel}건 삭제`);

      // 데모 경찰 신고
      // 신고1: 벌금 처리됨
      await policeRef.add({
        reporterId: students[0].uid,
        complainantId: students[0].uid,
        reporterName: students[0].name,
        reportedUserId: students[2].uid,
        defendantId: students[2].uid,
        reportedUserName: students[2].name,
        reason: "수업 중 장난",
        description:
          "수업 시간에 계속 떠들고 장난을 쳐서 수업에 방해가 되었습니다.",
        details:
          "3교시 수학 시간에 옆 자리 친구와 계속 장난을 치며 수업을 방해했습니다.",
        status: "resolved_fine",
        amount: 1500,
        resolution: "수업 방해 행위로 벌금 1,500알찬 부과",
        isLawReport: false,
        lawId: null,
        classCode: targetClassCode,
        submitDate: daysAgo(6),
        acceptanceDate: daysAgo(5),
        resolutionDate: daysAgo(4),
        processedById: callerUid,
        processedByName: adminName,
        settlementPaid: true,
      });

      // 신고2: 접수됨 (처리 대기)
      await policeRef.add({
        reporterId: students[1].uid,
        complainantId: students[1].uid,
        reporterName: students[1].name,
        reportedUserId: students[4 % students.length].uid,
        defendantId: students[4 % students.length].uid,
        reportedUserName: students[4 % students.length].name,
        reason: "물건 손상",
        description:
          "제 색연필 세트를 빌려갔다가 여러 개를 부러뜨려서 돌려줬습니다.",
        details: "12색 색연필 중 4자루가 부러진 채로 반납되었습니다.",
        status: "accepted",
        amount: 2000,
        isLawReport: false,
        lawId: null,
        classCode: targetClassCode,
        submitDate: daysAgo(2),
        acceptanceDate: daysAgo(1),
        resolutionDate: null,
        processedById: null,
        processedByName: null,
        settlementPaid: false,
      });

      // 신고3: 제출됨 (검토 전)
      await policeRef.add({
        reporterId: students[3 % students.length].uid,
        complainantId: students[3 % students.length].uid,
        reporterName: students[3 % students.length].name,
        reportedUserId: students[0].uid,
        defendantId: students[0].uid,
        reportedUserName: students[0].name,
        reason: "자리 무단 사용",
        description: "제 자리에 앉아서 제 물건을 허락 없이 사용했습니다.",
        status: "submitted",
        amount: 0,
        isLawReport: false,
        lawId: null,
        classCode: targetClassCode,
        submitDate: daysAgo(0),
        acceptanceDate: null,
        resolutionDate: null,
        processedById: null,
        processedByName: null,
        settlementPaid: false,
      });

      // 신고4: 기각됨
      await policeRef.add({
        reporterId: students[2].uid,
        complainantId: students[2].uid,
        reporterName: students[2].name,
        reportedUserId: students[1].uid,
        defendantId: students[1].uid,
        reportedUserName: students[1].name,
        reason: "줄서기 새치기",
        description: "급식 줄에서 새치기를 했습니다.",
        status: "dismissed",
        amount: 0,
        resolution:
          "목격자 확인 결과 새치기가 아닌 자리를 양보받은 것으로 확인되어 기각합니다.",
        isLawReport: false,
        lawId: null,
        classCode: targetClassCode,
        submitDate: daysAgo(8),
        acceptanceDate: daysAgo(7),
        resolutionDate: daysAgo(7),
        processedById: callerUid,
        processedByName: adminName,
        settlementPaid: false,
      });

      // 신고5: 합의 해결
      if (students.length >= 5) {
        await policeRef.add({
          reporterId: students[4].uid,
          complainantId: students[4].uid,
          reporterName: students[4].name,
          reportedUserId: students[2].uid,
          defendantId: students[2].uid,
          reportedUserName: students[2].name,
          reason: "교실 내 뛰기",
          description:
            "쉬는 시간에 교실에서 뛰어다니다가 제 물통을 쳐서 넘어뜨렸습니다.",
          status: "resolved_settlement",
          amount: 1000,
          resolution: "당사자 간 합의로 물통 값 1,000알찬 배상",
          isLawReport: false,
          lawId: null,
          classCode: targetClassCode,
          submitDate: daysAgo(5),
          acceptanceDate: daysAgo(4),
          resolutionDate: daysAgo(3),
          processedById: callerUid,
          processedByName: adminName,
          settlementPaid: true,
        });
      }

      const policeCount = students.length >= 5 ? 5 : 4;

      return {
        success: true,
        message: `데모 시드 완료 — 법원: 사건 4건, 재판방 1개, 메시지 ${msgs.length}건 / 경찰서: 신고 ${policeCount}건`,
      };
    } catch (error) {
      logger.error("[seedCourtData] 오류:", error);
      throw new HttpsError("internal", "데이터 초기화 실패: " + error.message);
    }
  },
);

// ============================================
// 사용자 아이템 수량 업데이트 (경매 등록/취소 시 사용)
// ============================================
exports.updateUserItemQuantity = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, isAdmin, isSuperAdmin } =
      await checkAuthAndGetUserData(request);
    // 🔒 admin 전용 — 이 CF는 호출자 본인 인벤토리 quantity를 상한 없이 증감(quantityChange
    //   임의 양수)하는데, 정상 클라 호출부가 전무(dead-exposed)하고 학생이 직접 호출 시
    //   인벤토리 무제한 mint→국고되팔기/마켓 현금화 벡터. 정상 인벤토리 변경은 구매/사용/
    //   선물/판매 CF가 전담(batch7-e에서 inventory 클라 write는 rules로 봉인됨).
    if (!isAdmin && !isSuperAdmin) {
      throw new HttpsError("permission-denied", "이 기능은 관리자 전용입니다.");
    }
    const {
      itemId,
      quantityChange,
      sourceCollection = "inventory",
    } = request.data;

    if (!itemId) {
      throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
    }

    if (typeof quantityChange !== "number" || quantityChange === 0) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 수량 변경값이 필요합니다.",
      );
    }

    // 🔥 보안: sourceCollection 화이트리스트 검증 (경로 주입 방지)
    const ALLOWED_COLLECTIONS = ["inventory"];
    if (!ALLOWED_COLLECTIONS.includes(sourceCollection)) {
      throw new HttpsError("invalid-argument", "유효하지 않은 컬렉션입니다.");
    }

    try {
      const inventoryRef = db
        .collection("users")
        .doc(uid)
        .collection(sourceCollection)
        .doc(itemId);

      const result = await db.runTransaction(async (transaction) => {
        const inventoryDoc = await transaction.get(inventoryRef);

        if (!inventoryDoc.exists) {
          throw new Error("인벤토리에서 아이템을 찾을 수 없습니다.");
        }

        const currentData = inventoryDoc.data();
        const currentQuantity = currentData.quantity || 0;
        const newQuantity = currentQuantity + quantityChange;

        if (newQuantity < 0) {
          throw new Error(
            `아이템 수량이 부족합니다. (현재: ${currentQuantity}, 필요: ${Math.abs(quantityChange)})`,
          );
        }

        if (newQuantity === 0) {
          // 수량이 0이 되면 문서 삭제
          transaction.delete(inventoryRef);
        } else {
          // 수량 업데이트
          transaction.update(inventoryRef, {
            quantity: newQuantity,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        return {
          previousQuantity: currentQuantity,
          newQuantity: newQuantity,
          itemId: itemId,
        };
      });

      logger.info(
        `[updateUserItemQuantity] 사용자 ${uid}의 아이템 ${itemId} 수량 변경: ${result.previousQuantity} -> ${result.newQuantity}`,
      );

      return {
        success: true,
        message: "아이템 수량이 업데이트되었습니다.",
        data: result,
      };
    } catch (error) {
      logger.error(`[updateUserItemQuantity] 사용자 ${uid} 오류:`, error);
      throw new HttpsError(
        "aborted",
        error.message || "아이템 수량 업데이트에 실패했습니다.",
      );
    }
  },
);

// 🔥 학생 계정 일괄 생성 (Admin SDK - reCAPTCHA 우회)
exports.createStudentAccounts = onCall(
  { region: "asia-northeast3", timeoutSeconds: 300 },
  async (request) => {
    const { uid, classCode, isAdmin, isSuperAdmin } =
      await checkAuthAndGetUserData(request, true);

    const { students } = request.data;
    if (!students || !Array.isArray(students) || students.length === 0) {
      throw new HttpsError("invalid-argument", "학생 목록이 필요합니다.");
    }
    if (students.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        "한 번에 최대 100명까지 생성 가능합니다.",
      );
    }

    // 학급 설정 가져오기
    const classDoc = await db.collection("classes").doc(classCode).get();
    const classSettings = classDoc.exists ? classDoc.data().settings : {};
    const initialCash = classSettings.initialCash || 100000;
    const initialCoupons = classSettings.initialCoupons || 10;

    const results = { success: [], failed: [] };

    for (const student of students) {
      try {
        // 기존 계정이 있으면 삭제 후 재생성
        let userRecord;
        try {
          const existingUser = await admin.auth().getUserByEmail(student.email);
          // 기존 Auth 계정 삭제
          await admin.auth().deleteUser(existingUser.uid);
          // 기존 Firestore 문서도 삭제
          await db.collection("users").doc(existingUser.uid).delete();
        } catch (e) {
          // auth/user-not-found는 정상 (신규 계정)
          if (e.code !== "auth/user-not-found") {
            logger.warn(
              `[createStudentAccounts] 기존 계정 정리 중 오류: ${e.message}`,
            );
          }
        }

        // Admin SDK로 계정 생성 (reCAPTCHA 불필요)
        userRecord = await admin.auth().createUser({
          email: student.email,
          password: student.password,
          displayName: student.name,
        });

        // Firestore 문서 생성
        await db.collection("users").doc(userRecord.uid).set({
          name: student.name,
          nickname: student.name,
          email: student.email,
          classCode: classCode,
          studentNumber: student.number,
          isAdmin: false,
          isSuperAdmin: false,
          isTeacher: false,
          cash: initialCash,
          coupons: initialCoupons,
          selectedJobIds: [],
          myContribution: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: uid,
          parentalConsentConfirmed: true,
          consentDate: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.success.push({
          name: student.name,
          email: student.email,
          password: student.password,
          number: student.number,
          uid: userRecord.uid,
        });
      } catch (error) {
        results.failed.push({
          name: student.name,
          email: student.email,
          password: student.password,
          number: student.number,
          error: error.message,
        });
      }
    }

    // 학급 학생 수 업데이트
    if (results.success.length > 0 && classDoc.exists) {
      await db
        .collection("classes")
        .doc(classCode)
        .update({
          studentCount:
            (classDoc.data().studentCount || 0) + results.success.length,
        });
    }

    logger.info(
      `[createStudentAccounts] ${uid}이 ${classCode} 학급에 학생 생성: 성공 ${results.success.length}, 실패 ${results.failed.length}`,
    );

    return results;
  },
);

// 학생 비밀번호 리셋 (관리자 전용)
exports.resetStudentPassword = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin } = await checkAuthAndGetUserData(
      request,
      true,
    );

    const { email, newPassword } = request.data;
    if (!email || !newPassword) {
      throw new HttpsError(
        "invalid-argument",
        "이메일과 새 비밀번호가 필요합니다.",
      );
    }
    if (newPassword.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "비밀번호는 6자 이상이어야 합니다.",
      );
    }

    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(userRecord.uid, { password: newPassword });
      logger.info(
        `[resetStudentPassword] ${uid}가 ${email}의 비밀번호를 리셋함`,
      );
      return { success: true, message: "비밀번호가 리셋되었습니다." };
    } catch (error) {
      logger.error(`[resetStudentPassword] 오류: ${error.message}`);
      throw new HttpsError("internal", `비밀번호 리셋 실패: ${error.message}`);
    }
  },
);

// 학생 로그인 자동 복구 (Auth 계정 없거나 비밀번호 불일치 시)
// 인증 불필요 - .alchan 학생 이메일만 허용
exports.repairStudentLogin = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { email, password } = request.data;

    if (!email || !password) {
      throw new HttpsError(
        "invalid-argument",
        "이메일과 비밀번호가 필요합니다.",
      );
    }

    // 브루트포스 방지: 동일 이메일 1분 내 5회 초과 시 차단
    const rateLimitKey = `repairLimit_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const rateLimitRef = db.collection("_rateLimits").doc(rateLimitKey);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1분
    const maxAttempts = 5;

    const rlSnap = await rateLimitRef.get();
    if (rlSnap.exists) {
      const rlData = rlSnap.data();
      const attempts = (rlData.attempts || []).filter((t) => now - t < windowMs);
      if (attempts.length >= maxAttempts) {
        logger.warn(`[repairStudentLogin] rate limit 초과: ${email}`);
        throw new HttpsError("resource-exhausted", "잠시 후 다시 시도해주세요.");
      }
      await rateLimitRef.set({ attempts: [...attempts, now] });
    } else {
      await rateLimitRef.set({ attempts: [now] });
    }

    // .alchan 도메인 학생 계정만 허용
    if (!email.endsWith(".alchan")) {
      throw new HttpsError(
        "permission-denied",
        "학생 계정만 복구할 수 있습니다.",
      );
    }

    // 비밀번호는 6자 이상
    if (password.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "비밀번호는 6자 이상이어야 합니다.",
      );
    }

    // 학급코드가 실제로 존재하는지 검증 (잘못된 학급코드로 신규 계정 생성 방지)
    const emailParts = email.split("@");
    const emailClassCode = emailParts[1]
      ? emailParts[1].replace(".alchan", "").toUpperCase()
      : "";
    if (emailClassCode) {
      const classDoc = await db
        .collection("classes")
        .doc(emailClassCode)
        .get();
      if (!classDoc.exists) {
        // 학급코드가 존재하지 않으면, 올바른 이메일을 찾아서 반환
        const sid = emailParts[0].toLowerCase();
        const usersSnap = await db
          .collection("users")
          .where("email", ">=", `${sid}@`)
          .where("email", "<=", `${sid}@\uf8ff`)
          .get();
        const correctDoc = usersSnap.docs.find((d) =>
          d.data().email?.endsWith(".alchan")
        );
        if (correctDoc) {
          throw new HttpsError(
            "failed-precondition",
            `학급코드가 올바르지 않습니다. 올바른 학급코드로 다시 시도해주세요.`
          );
        }
        throw new HttpsError(
          "not-found",
          "존재하지 않는 학급코드입니다. 학급코드를 확인해주세요."
        );
      }
    }

    try {
      let userRecord;
      let action;

      try {
        // Auth 계정이 있는지 확인
        userRecord = await admin.auth().getUserByEmail(email);
        // 있으면 비밀번호 리셋
        await admin.auth().updateUser(userRecord.uid, { password });
        action = "password_reset";
        logger.info(
          `[repairStudentLogin] 비밀번호 리셋: ${email} (uid: ${userRecord.uid})`,
        );
      } catch (e) {
        if (e.code === "auth/user-not-found") {
          // Auth 계정이 없으면 새로 생성
          const displayName = email.split("@")[0];
          userRecord = await admin.auth().createUser({
            email,
            password,
            displayName,
          });
          action = "account_created";
          logger.info(
            `[repairStudentLogin] 계정 생성: ${email} (uid: ${userRecord.uid})`,
          );
        } else {
          throw e;
        }
      }

      // Firestore 문서 확인 및 생성
      const usersSnapshot = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        const existingDoc = usersSnapshot.docs[0];
        const oldUid = existingDoc.id;

        // UID가 다르면 기존 데이터를 새 UID로 이동 (서브컬렉션 포함)
        if (oldUid !== userRecord.uid) {
          const existingData = existingDoc.data();
          await db
            .collection("users")
            .doc(userRecord.uid)
            .set({
              ...existingData,
              email,
            });

          // 서브컬렉션 이동 (inventory, portfolio)
          const subcollections = ["inventory", "portfolio"];
          for (const sub of subcollections) {
            const subSnap = await db
              .collection("users")
              .doc(oldUid)
              .collection(sub)
              .get();
            for (const subDoc of subSnap.docs) {
              await db
                .collection("users")
                .doc(userRecord.uid)
                .collection(sub)
                .doc(subDoc.id)
                .set(subDoc.data());
              await subDoc.ref.delete();
            }
          }

          // 기존 문서 삭제 (중복 방지)
          await db.collection("users").doc(oldUid).delete();
          logger.info(
            `[repairStudentLogin] Firestore 문서 이동: ${oldUid} → ${userRecord.uid} (기존 삭제)`,
          );
        }
      } else {
        // Firestore 문서가 아예 없으면 기본 문서 생성
        const parts = email.split("@");
        const studentId = parts[0];
        const classCode = parts[1].replace(".alchan", "").toUpperCase();

        await db.collection("users").doc(userRecord.uid).set({
          name: studentId,
          nickname: studentId,
          email,
          classCode,
          isAdmin: false,
          isSuperAdmin: false,
          isTeacher: false,
          cash: 0,
          coupons: 0,
          selectedJobIds: [],
          myContribution: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(
          `[repairStudentLogin] Firestore 문서 생성: ${email} (classCode: ${classCode})`,
        );
      }

      return { success: true, uid: userRecord.uid, action };
    } catch (error) {
      logger.error(`[repairStudentLogin] 실패: ${email}`, error);
      throw new HttpsError(
        "internal",
        error.message || "계정 복구에 실패했습니다.",
      );
    }
  },
);

// ========================================================
// 🔧 로그인 시 중복/고아 문서 자동 감지 및 마이그레이션
// - 문서 없음: 이메일/아이디 prefix로 고아 문서 검색 후 마이그레이션
// - 문서 있음: 같은 아이디의 다른 문서(더 높은 cash)가 있으면 병합
// ========================================================
exports.migrateUserDoc = onCall(
  { region: "asia-northeast3", timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    }
    const uid = request.auth.uid;
    const email = request.auth.token.email;
    if (!email) {
      throw new HttpsError("failed-precondition", "이메일 정보가 없습니다.");
    }

    const studentId = email.split("@")[0].toLowerCase();

    // 1. 현재 UID 문서 읽기
    const currentDoc = await db.collection("users").doc(uid).get();
    const currentData = currentDoc.exists ? currentDoc.data() : null;
    const currentCash = currentData?.cash || 0;

    // 2. 같은 studentId prefix로 모든 .alchan 문서 검색
    const snapshot = await db
      .collection("users")
      .where("email", ">=", `${studentId}@`)
      .where("email", "<=", `${studentId}@\uf8ff`)
      .get();

    const candidates = snapshot.docs.filter(
      (d) => d.data().email?.endsWith(".alchan") && d.id !== uid
    );

    // 중복 없고 현재 문서 있으면 → 정상
    if (candidates.length === 0 && currentDoc.exists) {
      return { status: "ok" };
    }

    // 가장 높은 cash를 가진 문서 찾기 (현재 문서 포함)
    let bestDoc = null;
    let bestData = currentData;
    let bestCash = currentCash;
    let bestId = uid;

    for (const doc of candidates) {
      const data = doc.data();
      if ((data.cash || 0) > bestCash) {
        bestDoc = doc;
        bestData = data;
        bestCash = data.cash || 0;
        bestId = doc.id;
      }
    }

    // 현재 문서가 이미 best이고 중복 없으면 → 정상
    if (bestId === uid && candidates.length === 0) {
      return { status: "ok" };
    }

    logger.info(
      `[migrateUserDoc] 중복 감지: ${studentId}, 현재=${uid}(${currentCash}), best=${bestId}(${bestCash}), 중복=${candidates.length}개`
    );

    const subcollections = [
      "inventory", "portfolio", "transactions", "completedTasks",
      "financials", "products", "loans", "settings",
      "badges", "properties", "activityLogs",
    ];

    // best 문서가 현재 UID가 아니면 → 데이터 마이그레이션
    if (bestId !== uid && bestData) {
      await db.collection("users").doc(uid).set({
        ...bestData,
        email, // 현재 Auth 이메일 유지
      });

      // best 문서의 서브컬렉션 이동
      for (const sub of subcollections) {
        const subSnap = await db
          .collection("users").doc(bestId).collection(sub).get();
        for (const subDoc of subSnap.docs) {
          await db.collection("users").doc(uid)
            .collection(sub).doc(subDoc.id).set(subDoc.data());
          await subDoc.ref.delete();
        }
      }
    }

    // 모든 중복 문서 삭제 (현재 UID 제외)
    for (const doc of candidates) {
      // 서브컬렉션 삭제
      for (const sub of subcollections) {
        const subSnap = await db
          .collection("users").doc(doc.id).collection(sub).get();
        for (const subDoc of subSnap.docs) {
          await subDoc.ref.delete();
        }
      }
      await db.collection("users").doc(doc.id).delete();
      logger.info(`[migrateUserDoc] 중복 문서 삭제: ${doc.id}`);
    }

    const finalData = bestId !== uid ? bestData : currentData;
    return { status: "migrated", data: finalData };
  }
);

// 임시: 학생 UID 불일치 진단 및 수복
exports.fixDuplicateUser = onRequest(
  { region: "asia-northeast3", invoker: "public" },
  async (req, res) => {
    const token = req.query.token;
    if (!process.env.SCHEDULER_AUTH_TOKEN || token !== process.env.SCHEDULER_AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const email = req.query.email;
    const searchName = req.query.name;
    const searchClass = req.query.classCode;

    // 이름 또는 학급 전체 검색 모드
    if (searchClass) {
      const snap = await db
        .collection("users")
        .where("classCode", "==", searchClass)
        .get();
      const matches = [];
      snap.forEach((d) => {
        const data = d.data();
        if (!data.isAdmin && !data.isSuperAdmin && !data.isTeacher) {
          if (
            !searchName ||
            (data.name && data.name.includes(searchName)) ||
            (data.nickname && data.nickname.includes(searchName))
          ) {
            matches.push({
              id: d.id,
              name: data.name,
              nickname: data.nickname,
              email: data.email,
              cash: data.cash,
              coupons: data.coupons,
            });
          }
        }
      });
      res.json({ total: matches.length, matches });
      return;
    }

    if (!email) {
      res.status(400).json({ error: "email or name+classCode required" });
      return;
    }

    try {
      // 1. Auth UID 확인
      let authUid = null;
      try {
        const authUser = await admin.auth().getUserByEmail(email);
        authUid = authUser.uid;
      } catch (e) {
        res.json({ error: "Auth 계정 없음", code: e.code });
        return;
      }

      // 2. Firestore에서 이 이메일의 모든 문서 찾기
      const snap = await db
        .collection("users")
        .where("email", "==", email)
        .get();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, data: d.data() }));

      // 3. Auth UID로 직접 문서 확인
      const authDoc = await db.collection("users").doc(authUid).get();

      const fix = req.query.fix === "true";
      const result = {
        authUid,
        authDocExists: authDoc.exists,
        authDocData: authDoc.exists
          ? {
              cash: authDoc.data().cash,
              coupons: authDoc.data().coupons,
              name: authDoc.data().name,
              nickname: authDoc.data().nickname,
            }
          : null,
        firestoreDocs: docs.map((d) => ({
          id: d.id,
          name: d.data.name,
          cash: d.data.cash,
          coupons: d.data.coupons,
          nickname: d.data.nickname,
        })),
        fixed: false,
      };

      // 4. 수복: Auth UID와 다른 문서에 진짜 데이터가 있으면 이동
      if (fix && docs.length > 0) {
        const correctDoc = docs.find(
          (d) => d.id !== authUid && d.data.cash > 0,
        );
        if (correctDoc) {
          // 진짜 데이터를 Auth UID 문서로 덮어쓰기
          await db.collection("users").doc(authUid).set(correctDoc.data);

          // 서브컬렉션 이동
          const subcollections = ["inventory", "portfolio"];
          for (const sub of subcollections) {
            const subSnap = await db
              .collection("users")
              .doc(correctDoc.id)
              .collection(sub)
              .get();
            for (const subDoc of subSnap.docs) {
              await db
                .collection("users")
                .doc(authUid)
                .collection(sub)
                .doc(subDoc.id)
                .set(subDoc.data());
              await subDoc.ref.delete();
            }
            result[`${sub}Moved`] = subSnap.size;
          }

          // 기존 문서 삭제
          await db.collection("users").doc(correctDoc.id).delete();
          result.fixed = true;
          result.movedFrom = correctDoc.id;
          result.movedTo = authUid;
        }
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// 임시: 토큰 인증 기반 비밀번호 리셋 HTTP 엔드포인트
exports.resetPasswordHttp = onRequest(
  { region: "asia-northeast3" },
  async (req, res) => {
    const token = req.query.token || req.body.token;
    if (!process.env.SCHEDULER_AUTH_TOKEN || token !== process.env.SCHEDULER_AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const email = req.query.email || req.body.email;
    const newPassword = req.query.password || req.body.password;
    const action = req.query.action || req.body.action || "reset";
    if (!email || !newPassword) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    try {
      if (action === "recreate") {
        // 계정 삭제 후 재생성 (too-many-requests 차단 해제)
        const userRecord = await admin.auth().getUserByEmail(email);
        const oldUid = userRecord.uid;
        const displayName = userRecord.displayName || "";
        await admin.auth().deleteUser(oldUid);
        const newUser = await admin.auth().createUser({
          uid: oldUid,
          email,
          password: newPassword,
          displayName,
        });
        res.json({
          success: true,
          uid: newUser.uid,
          email,
          action: "recreated",
        });
      } else {
        const userRecord = await admin.auth().getUserByEmail(email);
        await admin
          .auth()
          .updateUser(userRecord.uid, { password: newPassword });
        res.json({
          success: true,
          uid: userRecord.uid,
          email,
          action: "reset",
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ========================================================
// 🔍 학생 이메일 조회 (학급코드 없이 로그인 시)
// 비인증 상태에서 studentId로 .alchan 이메일을 찾아 반환
// 1단계: Firestore users 컬렉션 이메일 범위 검색
// 2단계: 실패 시 모든 학급코드로 Firebase Auth 직접 조회 (폴백)
// ========================================================
exports.resolveStudentEmail = onCall(
  { region: "asia-northeast3", timeoutSeconds: 30 },
  async (request) => {
    const { studentId } = request.data;
    if (!studentId || typeof studentId !== "string") {
      throw new HttpsError("invalid-argument", "studentId가 필요합니다.");
    }
    const sid = studentId.trim().toLowerCase();
    if (!sid || sid.length > 50) {
      throw new HttpsError("invalid-argument", "유효하지 않은 studentId입니다.");
    }
    try {
      // 1단계: Firestore users 컬렉션에서 이메일 검색
      const snapshot = await admin
        .firestore()
        .collection("users")
        .where("email", ">=", `${sid}@`)
        .where("email", "<=", `${sid}@\uf8ff`)
        .get();
      const studentDoc = snapshot.docs.find((d) =>
        d.data().email?.endsWith(".alchan")
      );
      if (studentDoc) {
        return { email: studentDoc.data().email };
      }

      // 2단계: Firestore에서 못 찾으면 모든 학급코드로 Firebase Auth 직접 검색
      const classesSnap = await admin.firestore().collection("classes").get();
      for (const classDoc of classesSnap.docs) {
        const code = classDoc.id.toLowerCase();
        const candidateEmail = `${sid}@${code}.alchan`;
        try {
          await admin.auth().getUserByEmail(candidateEmail);
          return { email: candidateEmail };
        } catch (_) {
          // 해당 학급코드에 없음, 다음 시도
        }
      }

      return { email: null };
    } catch (error) {
      logger.error("[resolveStudentEmail] 실패:", error);
      throw new HttpsError("internal", "학생 계정 조회에 실패했습니다.");
    }
  },
);

// 🔧 일회성 마이그레이션: 기존 쿠폰 응모분 관리자 계정에 현금 소급 지급
exports.migrateDonationCashToAdmin = onRequest(
  { region: "asia-northeast3" },
  async (req, res) => {
    const token = req.query.token || req.body.token;
    if (!process.env.SCHEDULER_AUTH_TOKEN || token !== process.env.SCHEDULER_AUTH_TOKEN) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      // 쿠폰 가치 조회
      const settingsDoc = await db.collection("settings").doc("mainSettings").get();
      const couponValue = settingsDoc.exists ? settingsDoc.data().couponValue : 1000;

      // 모든 goals 문서 조회
      const goalsSnap = await db.collection("goals").get();
      const results = [];

      for (const goalDoc of goalsSnap.docs) {
        const data = goalDoc.data();
        const classCode = data.classCode;
        const totalDonated = data.progress || 0;

        if (!classCode || totalDonated <= 0) continue;

        // 해당 학급의 관리자 찾기
        const adminSnap = await findApprovedAdminSnap(classCode);

        if (adminSnap.empty) {
          results.push({ classCode, status: "관리자 없음", totalDonated });
          continue;
        }

        const adminRef = adminSnap.docs[0].ref;
        const cashToAdd = totalDonated * couponValue;

        await adminRef.update({
          cash: admin.firestore.FieldValue.increment(cashToAdd),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        results.push({
          classCode,
          status: "성공",
          totalDonated,
          cashAdded: cashToAdd,
          adminName: adminSnap.docs[0].data().name,
        });

        logger.info(
          `[migrateDonationCash] ${classCode}: 쿠폰 ${totalDonated}개 × ${couponValue}원 = ${cashToAdd}원 관리자에게 지급`,
        );
      }

      res.json({ success: true, couponValue, results });
    } catch (error) {
      logger.error("[migrateDonationCash] 실패:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * 관리자 본인 transactions 감사 — 큰 차감 거래·type별 누적
 * 클라이언트에서 호출 (관리자 권한 필수). cash 음수 원인 추적용.
 */
exports.auditAdminCash = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, isAdmin, isSuperAdmin } =
      await checkAuthAndGetUserData(request, false);
    if (!isAdmin && !isSuperAdmin) {
      throw new HttpsError("permission-denied", "관리자만 호출 가능합니다.");
    }
    const adminDoc = await db.collection("users").doc(uid).get();
    const currentCash = adminDoc.data()?.cash ?? null;

    const snap = await db
      .collection("users").doc(uid).collection("transactions")
      .orderBy("timestamp", "desc").limit(5000).get();

    const byType = {};
    let totalIn = 0, totalOut = 0, count = 0;
    const negatives = [];
    snap.forEach((d) => {
      const t = d.data();
      const amount = Number(t.amount) || 0;
      const type = String(t.type || "unknown");
      count++;
      if (amount >= 0) totalIn += amount; else totalOut += amount;
      if (!byType[type]) byType[type] = { count: 0, sum: 0 };
      byType[type].count++;
      byType[type].sum += amount;
      if (amount < 0) {
        negatives.push({
          id: d.id,
          amount,
          type,
          description: String(t.description || ""),
          ts: t.timestamp?.toDate?.()?.toISOString?.() || null,
        });
      }
    });
    negatives.sort((a, b) => a.amount - b.amount);
    const topNegatives = negatives.slice(0, 30);
    const sumByType = Object.entries(byType)
      .map(([type, v]) => ({ type, count: v.count, sum: v.sum }))
      .sort((a, b) => a.sum - b.sum);
    return {
      currentCash,
      transactionCount: count,
      totalIn,
      totalOut,
      net: totalIn + totalOut,
      missingNetVsCash: currentCash != null
        ? currentCash - (totalIn + totalOut) : null,
      sumByType,
      topNegatives,
    };
  },
);

// ============================================================
// 🔥 [비용 최적화] Auth 커스텀 클레임 동기화
// firestore.rules의 isSameClass/isAdmin이 요청마다 get(users/self)로
// 읽기 1회씩 과금되는 것을 토큰 클레임 단락평가로 제거하기 위한 함수.
// 서버가 호출자 "본인" users 문서를 읽어 미러링하며 클라이언트 입력은 받지 않음.
// rules는 클레임 우선 + 기존 get() fallback이라 클레임이 없거나 stale이어도 동작 동일.
// ============================================================
exports.syncUserClaims = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const uid = request.auth.uid;
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) {
      return { synced: false, reason: "no-user-doc" };
    }
    const data = userSnap.data();
    const claims = {
      isAdmin: data.isAdmin === true,
      isSuperAdmin: data.isSuperAdmin === true,
      // rules의 isAdminFast()가 승인 여부까지 클레임으로 판정한다(미승인 교사 차단).
      isApproved: data.isApproved === true,
    };
    // classCode가 문자열이 아니면 클레임에서 생략 → rules의 'classCode' in token 가드가 false가 되어
    // 기존 문서 조회 fallback으로만 동작 (null 클레임 비교 edge 차단)
    if (typeof data.classCode === "string") {
      claims.classCode = data.classCode;
    }
    await admin.auth().setCustomUserClaims(uid, claims);
    logger.info(`[syncUserClaims] ${uid} 클레임 갱신`, claims);
    return { synced: true, claims };
  },
);

// ===================================================================================
// 💼 직업 선택 저장 (학생) + 지정 직업 마이그레이션 (관리자)
// ===================================================================================
// 2026-07-13 FULL 교차검증에서 확인된 결함 대응:
//   학생이 users 문서를 직접 write 할 수 있어 selectedJobIds에 대통령(지정 전용) 직업 id를
//   넣으면 주급 보너스·할일 승인 권한을 자가 획득할 수 있었다. 이제 학생의 직업 선택 저장은
//   이 callable이 유일한 경로이며(firestore.rules에서 학생의 직접 write 차단), 지정 전용
//   직업은 교사만 쓸 수 있는 appointedJobIds에만 들어간다.

exports.saveSelectedJobs = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode, isAdmin, isSuperAdmin, userData } =
      await checkAuthAndGetUserData(request, false);
    // 선생님(관리자)은 자기 대시보드에서 지정 전용 직업도 자유롭게 고를 수 있었다(기존 동작).
    // 이미 모든 권한을 가진 계정이라 자가임명 위협모델과 무관 — 학생 규칙만 강제한다.
    const isTeacher = isAdmin || isSuperAdmin;

    const rawJobIds = request.data?.jobIds;
    if (!Array.isArray(rawJobIds)) {
      throw new HttpsError("invalid-argument", "직업 목록이 올바르지 않습니다.");
    }
    if (rawJobIds.length > 50) {
      throw new HttpsError("invalid-argument", "직업을 너무 많이 선택했습니다.");
    }
    if (!classCode) {
      throw new HttpsError("failed-precondition", "학급 정보가 없습니다.");
    }

    // 상한 로드 (급여 계산과 동일 규약: 미설정 5, 1~20 클램프)
    let salarySettingsDoc = await db
      .collection("settings")
      .doc(`salarySettings_${classCode}`)
      .get();
    if (!salarySettingsDoc.exists) {
      salarySettingsDoc = await db
        .collection("settings")
        .doc("salarySettings")
        .get();
    }
    const rawMaxJobs = salarySettingsDoc.exists
      ? salarySettingsDoc.data().maxJobsPerStudent
      : undefined;
    const maxJobsPerStudent =
      Number.isInteger(rawMaxJobs) && rawMaxJobs >= 1
        ? Math.min(20, rawMaxJobs)
        : 5;

    // 같은 학급 직업만 유효
    const jobsSnap = await db
      .collection("jobs")
      .where("classCode", "==", classCode)
      .get();
    const jobMap = buildJobMap(jobsSnap);

    const requested = [...new Set(toJobIdArray(rawJobIds))];
    // 존재하는 직업만 (삭제된 유령 id는 조용히 탈락)
    const existing = requested.filter((id) => jobMap.has(id));
    const appointedRequested = existing.filter((id) =>
      isAppointedJob(jobMap.get(id)),
    );
    const validSelected = existing.filter(
      (id) => !isAppointedJob(jobMap.get(id)),
    );

    // 선생님(관리자): 지정 전용 직업도 자유롭게 고를 수 있고 상한도 없다(기존 동작 보존).
    //   지정/일반을 각 필드로 분리해 저장 — AdminSettingsModal의 교사 배정과 동일 규약.
    if (isTeacher) {
      await db.collection("users").doc(uid).update({
        selectedJobIds: validSelected,
        appointedJobIds: appointedRequested,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info(
        `[saveSelectedJobs] (교사) uid=${uid} 선택 ${validSelected.length}개 · 지정 ${appointedRequested.length}개`,
      );
      return {
        success: true,
        selectedJobIds: validSelected,
        appointedJobIds: appointedRequested,
        droppedCount: requested.length - existing.length,
      };
    }

    // 학생: 지정 전용 직업을 요청에 섞어 보낸 경우는 UI 우회 시도 — 거부하고 기록
    if (appointedRequested.length > 0) {
      logger.warn(
        `[saveSelectedJobs] 지정 전용 직업 선택 시도 차단: uid=${uid}, jobIds=${JSON.stringify(
          appointedRequested,
        )}`,
      );
      throw new HttpsError(
        "permission-denied",
        "선생님이 지정하는 직업은 직접 선택할 수 없어요.",
      );
    }

    // 개수 상한은 '지정 + 선택 합계'에 적용한다(급여 계산 resolveStudentJobs와 동일 규약).
    // 교사가 지정한 직업이 슬롯을 먼저 차지하므로, 학생이 고를 수 있는 몫은 그만큼 줄어든다.
    const appointedCount = toJobIdArray(userData?.appointedJobIds).filter(
      (id) => jobMap.has(id) && isAppointedJob(jobMap.get(id)),
    ).length;
    const allowedSelected = Math.max(0, maxJobsPerStudent - appointedCount);
    if (validSelected.length > allowedSelected) {
      throw new HttpsError(
        "invalid-argument",
        appointedCount > 0
          ? `직업은 최대 ${maxJobsPerStudent}개까지 가질 수 있어요. 선생님이 지정한 직업 ${appointedCount}개를 빼면 ${allowedSelected}개까지 고를 수 있어요.`
          : `직업은 최대 ${maxJobsPerStudent}개까지 선택할 수 있어요.`,
      );
    }

    // appointedJobIds는 교사 전용이라 건드리지 않는다 (부분 갱신).
    await db.collection("users").doc(uid).update({
      selectedJobIds: validSelected,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(
      `[saveSelectedJobs] uid=${uid} 저장 ${validSelected.length}개 (요청 ${requested.length}개)`,
    );

    // appointedJobIds는 교사 전용이라 건드리지 않는다. 클라 표시용으로 현재값만 돌려준다.
    return {
      success: true,
      selectedJobIds: validSelected,
      appointedJobIds: toJobIdArray(userData?.appointedJobIds),
      droppedCount: requested.length - validSelected.length,
    };
  },
);

/**
 * 기존 데이터 이관(관리자 전용, 1회성):
 *   selectedJobIds에 들어있는 지정 전용 직업(대통령 등)을 appointedJobIds로 옮긴다.
 *   이관 전에는 신 급여 로직이 대통령 보너스를 지급하지 않으므로, functions 배포 직후 실행할 것.
 */
exports.migrateAppointedJobs = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { classCode, isSuperAdmin } = await checkAuthAndGetUserData(
      request,
      true,
    );
    const dryRun = request.data?.dryRun === true;

    // 이관 범위:
    //  - 교사(학급 관리자): 본인 학급만. 남의 학급 지정은 거부.
    //  - 슈퍼관리자: 학급을 지정하면 그 학급, 지정하지 않으면 전 학급.
    //    (학급마다 교사가 각자 버튼을 눌러야 하는 문제 해소 — 2026-07-14)
    const requestedClassCode =
      typeof request.data?.classCode === "string"
        ? request.data.classCode.trim()
        : "";
    let targetClassCode = null; // null = 전 학급(슈퍼관리자 전용)
    if (isSuperAdmin) {
      targetClassCode = requestedClassCode || null;
    } else {
      if (requestedClassCode && requestedClassCode !== classCode) {
        throw new HttpsError(
          "permission-denied",
          "다른 학급은 이관할 수 없습니다.",
        );
      }
      if (!classCode) {
        throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
      }
      targetClassCode = classCode;
    }

    const scoped = (ref) =>
      targetClassCode ? ref.where("classCode", "==", targetClassCode) : ref;

    const jobsSnap = await scoped(db.collection("jobs")).get();
    const jobMap = buildJobMap(jobsSnap);

    const usersSnap = await scoped(db.collection("users")).get();

    // Firestore batch는 500건 상한 — 학급이 커도 안전하도록 500건씩 나눠 커밋.
    const BATCH_LIMIT = 500;
    const batches = [db.batch()];
    let opsInBatch = 0;
    const currentBatch = () => batches[batches.length - 1];
    const moved = [];

    usersSnap.forEach((doc) => {
      const data = doc.data();
      const selected = toJobIdArray(data.selectedJobIds);

      const appointedFromSelected = [
        ...new Set(
          selected.filter(
            (id) => jobMap.has(id) && isAppointedJob(jobMap.get(id)),
          ),
        ),
      ];
      if (appointedFromSelected.length === 0) return;

      moved.push({
        userId: doc.id,
        name: data.name || data.nickname || doc.id,
        classCode: data.classCode || "",
        jobTitles: appointedFromSelected.map(
          (id) => jobMap.get(id)?.title || id,
        ),
      });

      if (!dryRun) {
        if (opsInBatch >= BATCH_LIMIT) {
          batches.push(db.batch());
          opsInBatch = 0;
        }
        // ⚠️ 절대값 덮어쓰기 대신 arrayRemove/arrayUnion — 이관 도중 학생이 saveSelectedJobs로
        //    직업을 바꿔도 stale 스냅샷이 그 변경을 덮어써 유실시키지 않는다(lost update 방지).
        currentBatch().update(doc.ref, {
          selectedJobIds:
            admin.firestore.FieldValue.arrayRemove(...appointedFromSelected),
          appointedJobIds:
            admin.firestore.FieldValue.arrayUnion(...appointedFromSelected),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        opsInBatch += 1;
      }
    });

    if (!dryRun && moved.length > 0) {
      for (const b of batches) await b.commit();
    }

    logger.info(
      `[migrateAppointedJobs] classCode=${classCode} dryRun=${dryRun} 이관 대상 ${moved.length}명`,
    );
    return { success: true, dryRun, movedCount: moved.length, moved };
  },
);
