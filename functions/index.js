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

// 🔥 할일 승인 요청 (학생이 보너스 할일 완료 시 호출)
exports.submitTaskApproval = onCall(
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
    if (!cardType || !rewardAmount) {
      throw new HttpsError(
        "invalid-argument",
        "카드 타입과 보상 금액이 필요합니다.",
      );
    }

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

          // 보상 금액 서버 검증 (카드 선택 랜덤 보상 범위 기준)
          const maxReward = cardType === "cash" ? 50000 : 20;
          if (
            typeof rewardAmount !== "number" ||
            rewardAmount < 0 ||
            rewardAmount > maxReward
          ) {
            throw new Error(
              `유효하지 않은 보상 금액입니다. (최대: ${maxReward})`,
            );
          }

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

          // 보상 금액 서버 검증 (카드 선택 랜덤 보상 범위 기준)
          const maxRewardApproval = cardType === "cash" ? 50000 : 20;
          if (
            typeof rewardAmount !== "number" ||
            rewardAmount < 0 ||
            rewardAmount > maxRewardApproval
          ) {
            throw new Error(`유효하지 않은 보상 금액입니다.`);
          }

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
    const { amount, message } = request.data;
    if (!classCode) {
      throw new HttpsError(
        "failed-precondition",
        "사용자에게 학급 코드가 할당되지 않았습니다. 프로필을 확인하거나 관리자에게 문의해주세요.",
      );
    }
    // 🔒 [보안] 정수 검증(소수점 쿠폰 방지)
    if (!Number.isInteger(amount) || amount <= 0) {
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
        const refs = [userRef, goalRef, mainSettingsRef];
        if (adminRef) refs.push(adminRef);
        const docs = await transaction.getAll(...refs);
        const [userDoc, goalDoc, settingsDoc] = docs;

        if (!userDoc.exists) {
          throw new Error("사용자 정보가 없습니다.");
        }
        const currentCoupons = userDoc.data().coupons || 0;
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
      const currentCoupons = userDoc.data().coupons || 0;
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
      const senderCoupons = senderDoc.data().coupons || 0;
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

    if (
      !inventoryItemId ||
      !quantity ||
      quantity <= 0 ||
      !price ||
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

    if (!listingId || !offerPrice || offerPrice <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 제안 가격을 입력해야 합니다.",
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

          const totalPrice = offerData.offerPrice * offerData.quantity;
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

      if (senderId === recipientId) {
        throw new HttpsError(
          "invalid-argument",
          "송금자와 수금자가 동일하여 합의금을 처리할 수 없습니다.",
        );
      }

      const reportRef = db
        .collection("classes")
        .doc(classCode)
        .collection("policeReports")
        .doc(reportId);
      const senderRef = db.collection("users").doc(senderId);
      const recipientRef = db.collection("users").doc(recipientId);

      await db.runTransaction(async (transaction) => {
        const [reportDoc, senderDoc, recipientDoc] = await transaction.getAll(
          reportRef,
          senderRef,
          recipientRef,
        );

        if (!reportDoc.exists) throw new Error("신고 정보를 찾을 수 없습니다.");
        if (!senderDoc.exists)
          throw new Error("가해자 정보를 찾을 수 없습니다.");
        if (!recipientDoc.exists)
          throw new Error("피해자 정보를 찾을 수 없습니다.");

        // 멱등성: 이미 합의 처리된 신고는 재처리(중복 지급) 차단
        const reportData = reportDoc.data();
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

        const senderData = senderDoc.data();
        const recipientData = recipientDoc.data();
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
          senderId,
          LOG_TYPES.CASH_EXPENSE,
          `경찰서 합의금으로 ${recipientData.name}에게 ${settlementAmount}원 지급`,
          { reportId, victimName: recipientData.name },
        );
        await logActivity(
          transaction,
          recipientId,
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
    const { uid } = await checkAuthAndGetUserData(request);
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
