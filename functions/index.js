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

// HTTP 호출을 위한 스케줄러 로직 (cron-job.org에서 호출 가능)
const scheduler = require("./scheduler-http");
// 🔥 핵심 스케줄러만 유지 (16개 → 5개)
exports.stockPriceScheduler = scheduler.stockPriceScheduler; // 주식 가격 업데이트 스케줄러 (15분마다)
exports.midnightReset = scheduler.midnightReset; // 자정 리셋용 엔드포인트
exports.weeklySalary = scheduler.weeklySalary; // 주급 지급용 엔드포인트
exports.weeklyRent = scheduler.weeklyRent; // 월세 징수용 엔드포인트
exports.exchangeRateScheduler = scheduler.exchangeRateScheduler; // 환율 자동 업데이트 (하루 1회)
exports.weeklyPropertyTax = scheduler.weeklyPropertyTax; // 부동산 보유세 자동 징수 (매주 금요일 8시)

// 🔥 경제 이벤트 시스템
exports.economicEventScheduler = scheduler.economicEventScheduler; // 경제 이벤트 스케줄러 (매시간 실행)
exports.triggerEconomicEventManual = scheduler.triggerEconomicEventManual; // 수동 경제 이벤트 실행
exports.saveEconomicEventSettings = scheduler.saveEconomicEventSettings; // 경제 이벤트 설정 저장

// 🔥 방학 모드 관리 (슈퍼관리자 전용)
exports.toggleVacationMode = scheduler.toggleVacationMode; // 방학 모드 토글
exports.getVacationModeStatus = scheduler.getVacationModeStatus; // 방학 모드 상태 조회

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

    // 🔥 보안 가드: requiresApproval 할일은 completeTask로 직접 완료 불가
    try {
      if (isJobTask && jobId) {
        const jobDoc = await db.collection("jobs").doc(jobId).get();
        if (jobDoc.exists) {
          const jobTasks = jobDoc.data().tasks || [];
          const targetTask = jobTasks.find((t) => t.id === taskId);
          if (targetTask && targetTask.requiresApproval) {
            throw new HttpsError(
              "permission-denied",
              "이 할일은 관리자 승인이 필요합니다. submitTaskApproval을 사용하세요.",
            );
          }
        }
      } else {
        const commonTaskDoc = await db
          .collection("commonTasks")
          .doc(taskId)
          .get();
        if (commonTaskDoc.exists && commonTaskDoc.data().requiresApproval) {
          throw new HttpsError(
            "permission-denied",
            "이 할일은 관리자 승인이 필요합니다. submitTaskApproval을 사용하세요.",
          );
        }
      }
    } catch (guardError) {
      if (guardError instanceof HttpsError) throw guardError;
      logger.warn(
        "[completeTask] requiresApproval 가드 체크 중 오류:",
        guardError,
      );
    }

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

          // 🔥 보안: rewardAmount 서버 검증 (클라이언트가 임의 금액 전송 방지)
          const maxReward = task.maxReward || task.reward || 100;
          if (rewardAmount !== null && rewardAmount !== undefined) {
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
          const maxRewardCommon = taskData.maxReward || taskData.reward || 100;
          if (rewardAmount !== null && rewardAmount !== undefined) {
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

          if (!task.requiresApproval) {
            throw new Error(
              "이 할일은 승인이 필요하지 않습니다. completeTask를 사용하세요.",
            );
          }

          // 보상 금액 서버 검증
          const maxReward = task.maxReward || task.reward || 100;
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

          if (!taskData.requiresApproval) {
            throw new Error(
              "이 할일은 승인이 필요하지 않습니다. completeTask를 사용하세요.",
            );
          }

          // 보상 금액 서버 검증
          const maxReward = taskData.maxReward || taskData.reward || 100;
          if (
            typeof rewardAmount !== "number" ||
            rewardAmount < 0 ||
            rewardAmount > maxReward
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

      // pendingApprovals 문서 생성
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
    const { uid, classCode: adminClassCode } = await checkAuthAndGetUserData(
      request,
      true,
    );
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
    if (!amount || amount <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "유효한 쿠폰 수량을 입력해야 합니다.",
      );
    }
    const userRef = db.collection("users").doc(uid);
    const goalRef = db.collection("goals").doc(`${classCode}_goal`);
    try {
      await db.runTransaction(async (transaction) => {
        const [userDoc, goalDoc] = await transaction.getAll(userRef, goalRef);
        if (!userDoc.exists) {
          throw new Error("사용자 정보가 없습니다.");
        }
        const currentCoupons = userDoc.data().coupons || 0;
        if (currentCoupons < amount) {
          throw new Error("보유한 쿠폰이 부족합니다.");
        }
        transaction.set(
          userRef,
          {
            coupons: admin.firestore.FieldValue.increment(-amount),
            myContribution: admin.firestore.FieldValue.increment(amount),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
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

exports.sellCoupon = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid } = await checkAuthAndGetUserData(request);
  const { amount } = request.data;
  if (!amount || amount <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "유효한 쿠폰 수량을 입력해야 합니다.",
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
  if (!recipientId || !amount || amount <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "받는 사람과 쿠폰 수량을 정확히 입력해야 합니다.",
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

exports.buyStock = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { stockId, quantity } = request.data;

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

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🔥 모든 읽기 작업을 먼저 수행
      const portfolioRef = db
        .collection("users")
        .doc(uid)
        .collection("portfolio")
        .doc(stockId);
      const [userDoc, stockDoc, portfolioDoc, treasuryDoc] =
        await transaction.getAll(userRef, stockRef, portfolioRef, treasuryRef);

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
      const transactionTax = Math.floor(cost * TRANSACTION_TAX_RATE);
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

      // 국고에 세금 및 수수료 추가
      if (treasuryDoc.exists) {
        transaction.update(treasuryRef, {
          totalAmount: admin.firestore.FieldValue.increment(
            commission + transactionTax,
          ),
          stockCommissionRevenue:
            admin.firestore.FieldValue.increment(commission),
          stockTaxRevenue: admin.firestore.FieldValue.increment(transactionTax),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // 국고가 없으면 생성
        transaction.set(treasuryRef, {
          totalAmount: commission + transactionTax,
          stockCommissionRevenue: commission,
          stockTaxRevenue: transactionTax,
          realEstateTransactionTaxRevenue: 0,
          realEstateAnnualTaxRevenue: 0,
          incomeTaxRevenue: 0,
          corporateTaxRevenue: 0,
          otherTaxRevenue: 0,
          classCode: classCode,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 🔥 [추가] 거래 후 잔액 계산 및 반환
      const newBalance = currentCash - totalCost;

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
  const { uid, classCode } = await checkAuthAndGetUserData(request);
  const { holdingId, quantity } = request.data;

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

  try {
    const result = await db.runTransaction(async (transaction) => {
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

      // 매수 후 1시간 이내 매도 제한 확인
      if (portfolioData.lastBuyTime) {
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

      // 🔥 이제 stockId를 알았으니 주식 정보와 국고 정보를 읽음
      const stockRef = db
        .collection("CentralStocks")
        .doc(portfolioData.stockId);
      const [stockDoc, treasuryDoc] = await transaction.getAll(
        stockRef,
        treasuryRef,
      );

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
          profitTax = Math.floor(profit * BOND_TAX_RATE);
        } else {
          profitTax = Math.floor(profit * TAX_RATE);
        }
      }

      // 거래세
      const transactionTax = Math.floor(sellPrice * TRANSACTION_TAX_RATE);
      const totalTax = profitTax + transactionTax;
      const netRevenue = sellPrice - commission - totalTax;

      // 🔥 이제 모든 쓰기 작업 수행

      // 사용자 현금 증가
      transaction.update(userRef, {
        cash: admin.firestore.FieldValue.increment(netRevenue),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

      // 국고에 세금 및 수수료 추가
      if (treasuryDoc.exists) {
        transaction.update(treasuryRef, {
          totalAmount: admin.firestore.FieldValue.increment(
            commission + totalTax,
          ),
          stockCommissionRevenue:
            admin.firestore.FieldValue.increment(commission),
          stockTaxRevenue: admin.firestore.FieldValue.increment(totalTax),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // 국고가 없으면 생성
        transaction.set(treasuryRef, {
          totalAmount: commission + totalTax,
          stockCommissionRevenue: commission,
          stockTaxRevenue: totalTax,
          realEstateTransactionTaxRevenue: 0,
          realEstateAnnualTaxRevenue: 0,
          incomeTaxRevenue: 0,
          corporateTaxRevenue: 0,
          otherTaxRevenue: 0,
          classCode: classCode,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 🔥 [추가] 거래 후 잔액 계산 및 반환
      const userData = userDoc.data();
      const currentCash = userData.cash || 0;
      const newBalance = currentCash + netRevenue;

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

    logger.info(
      `[sellStock] ${uid}님이 ${result.stockName} ${result.quantity}주 매도 (순수익 ${result.netRevenue}원)`,
    );

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

// exports.updateStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
//   const {uid} = await checkAuthAndGetUserData(request, true); // 관리자 권한 필요
//   const {itemId, updatesToApply} = request.data;
//
//   if (!itemId || !updatesToApply || Object.keys(updatesToApply).length === 0) {
//     throw new HttpsError("invalid-argument", "아이템 ID 또는 업데이트 데이터가 유효하지 않습니다.");
//   }
//
//   const itemRef = db.collection("storeItems").doc(itemId);
//
//   try {
//     const itemDoc = await itemRef.get();
//
//     if (!itemDoc.exists) {
//       throw new Error("아이템을 찾을 수 없습니다.");
//     }
//
//     // updatedAt 타임스탬프 추가
//     const updates = {
//       ...updatesToApply,
//       updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//     };
//
//     await itemRef.update(updates);
//
//     logger.info(`[updateStoreItem] ${uid}님이 아이템 ${itemId} 수정: ${JSON.stringify(updatesToApply)}`);
//
//     return {
//       success: true,
//       message: "아이템이 성공적으로 수정되었습니다.",
//     };
//   } catch (error) {
//     logger.error(`[updateStoreItem] Error for user ${uid}:`, error);
//     throw new HttpsError("aborted", error.message || "아이템 수정에 실패했습니다.");
//   }
// });

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
      const userIsAdmin =
        userData.isAdmin === true || userData.isSuperAdmin === true;

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

      const itemData = {
        ...newItemData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await db.collection("storeItems").add(itemData);

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

// exports.deleteStoreItem = onCall({region: "asia-northeast3"}, async (request) => {
//   const {uid} = await checkAuthAndGetUserData(request, true); // 관리자 권한 필요
//   const {itemId} = request.data;
//
//   if (!itemId) {
//     throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
//   }
//
//   const itemRef = db.collection("storeItems").doc(itemId);
//
//   try {
//     const itemDoc = await itemRef.get();
//
//     if (!itemDoc.exists) {
//       throw new Error("아이템을 찾을 수 없습니다.");
//     }
//
//     const itemData = itemDoc.data();
//     await itemRef.delete();
//
//     logger.info(`[deleteStoreItem] ${uid}님이 아이템 삭제: ${itemData.name} (ID: ${itemId})`);
//
//     return {
//       success: true,
//       message: "아이템이 성공적으로 삭제되었습니다.",
//     };
//   } catch (error) {
//     logger.error(`[deleteStoreItem] Error for user ${uid}:`, error);
//     throw new HttpsError("aborted", error.message || "아이템 삭제에 실패했습니다.");
//   }
// });

exports.purchaseStoreItem = onCall(
  { region: "asia-northeast3" },
  async (request) => {
    const { uid, classCode } = await checkAuthAndGetUserData(request);
    const { itemId, quantity = 1 } = request.data;

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

    // 재고 보충 비용을 관리자에게 청구하기 위해 관리자 찾기
    let adminRef = null;
    const adminSnapshot = await db
      .collection("users")
      .where("classCode", "==", classCode)
      .where("isAdmin", "==", true)
      .limit(1)
      .get();

    if (!adminSnapshot.empty) {
      adminRef = adminSnapshot.docs[0].ref;
    }

    try {
      // 🔥 Transaction으로 변경하여 원자적 처리 및 재고 보충 정보 포함
      const result = await db.runTransaction(async (transaction) => {
        // 모든 읽기 작업을 먼저 수행
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

        const totalCost = itemData.price * quantity;
        const currentCash = userData.cash || 0;
        const currentStock =
          itemData.stock !== undefined ? itemData.stock : Infinity;

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
        let restocked = false;
        let finalStock = newStock;
        let finalPrice = itemData.price;
        let restockCost = 0;

        if (itemData.stock !== undefined && newStock === 0) {
          restocked = true;
          const initialStock = itemData.initialStock || 10;
          const priceIncreasePercentage =
            itemData.priceIncreasePercentage || 10;
          finalStock = initialStock;
          finalPrice = Math.round(
            itemData.price * (1 + priceIncreasePercentage / 100),
          );

          // 재고 보충 비용 계산 (현재 가격 * 보충 수량)
          restockCost = itemData.price * initialStock;

          // 관리자 잔액 확인
          if (adminDoc && adminDoc.exists) {
            const adminData = adminDoc.data();
            const adminCash = adminData.cash || 0;

            if (adminCash < restockCost) {
              logger.warn(
                `[purchaseStoreItem] 재고 보충 실패 - 관리자 잔액 부족 (필요: ${restockCost.toLocaleString()}원, 보유: ${adminCash.toLocaleString()}원)`,
              );
              // 잔액 부족 시 재고 보충하지 않음
              restocked = false;
              finalStock = 0;
              finalPrice = itemData.price;
              restockCost = 0;
            }
          } else {
            logger.warn(
              `[purchaseStoreItem] 재고 보충 실패 - 관리자 계정 없음`,
            );
            // 관리자 없으면 재고 보충하지 않음
            restocked = false;
            finalStock = 0;
            finalPrice = itemData.price;
            restockCost = 0;
          }

          if (restocked) {
            logger.info(
              `[purchaseStoreItem] ${itemData.name} 품절 -> 재고 ${initialStock}개 보충, 가격 ${itemData.price}원 -> ${finalPrice}원 (${priceIncreasePercentage}% 인상), 관리자 비용: ${restockCost.toLocaleString()}원`,
            );
          }
        }

        // 모든 쓰기 작업 수행
        // 현금 차감
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(-totalCost),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

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

        // 재고 보충 시 관리자 계정에서 비용 차감
        if (restocked && adminRef && restockCost > 0) {
          transaction.update(adminRef, {
            cash: admin.firestore.FieldValue.increment(-restockCost),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
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

          transaction.set(userItemRef, newItemData);
        }

        // 트랜잭션 결과 반환
        return {
          itemName: itemData.name,
          quantity: quantity,
          totalCost: totalCost,
          restocked: restocked,
          newStock: finalStock,
          newPrice: finalPrice,
          restockCost: restockCost,
        };
      });

      logger.info(
        `[purchaseStoreItem] ${uid}님이 ${result.itemName} ${result.quantity}개 구매 (${result.totalCost}원)${result.restocked ? ` [재고 자동 보충됨 - 관리자 비용: ${result.restockCost.toLocaleString()}원]` : ""}`,
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

exports.useUserItem = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid } = await checkAuthAndGetUserData(request);
  const { itemId } = request.data;

  if (!itemId) {
    throw new HttpsError("invalid-argument", "아이템 ID가 필요합니다.");
  }

  const userRef = db.collection("users").doc(uid);
  const userItemRef = userRef.collection("inventory").doc(itemId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const userItemDoc = await transaction.get(userItemRef);

      if (!userItemDoc.exists) {
        throw new Error("아이템을 찾을 수 없습니다.");
      }

      const itemData = userItemDoc.data();
      const currentQuantity = itemData.quantity || 0;

      if (currentQuantity <= 0) {
        throw new Error("아이템 수량이 부족합니다.");
      }

      // 아이템 효과 적용 (예: 현금 증가)
      if (itemData.effect && itemData.effect.type === "cash") {
        const cashAmount = itemData.effect.value || 0;
        transaction.update(userRef, {
          cash: admin.firestore.FieldValue.increment(cashAmount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 아이템 수량 감소
      const newQuantity = currentQuantity - 1;
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

    logger.info(`[useUserItem] ${uid}님이 ${result.itemName} 사용`);

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
        transaction.set(newListingRef, {
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
        });
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
          // 학생 데이터 조회
          const studentsSnapshot = await db
            .collection("users")
            .where("classCode", "==", classCode)
            .where("role", "==", "student")
            .get();

          data.students = studentsSnapshot.docs.map((doc) => ({
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

// exports.batchPaySalaries = onCall({region: "asia-northeast3"}, async (request) => {
//   const {uid, classCode, isAdmin, isSuperAdmin} = await checkAuthAndGetUserData(request, true);
//   const {studentIds, payAll} = request.data;
//
//   try {
//     // 급여 설정 가져오기
//     const salaryDoc = await db.collection("classSettings")
//       .doc(classCode)
//       .collection("settings")
//       .doc("salary")
//       .get();
//
//     const salarySettings = salaryDoc.exists ? salaryDoc.data() : {};
//
//     // 지급할 학생 목록 결정
//     let targetStudents = [];
//     if (payAll) {
//       const studentsSnapshot = await db.collection("users")
//         .where("classCode", "==", classCode)
//         .where("role", "==", "student")
//         .get();
//
//       targetStudents = studentsSnapshot.docs.map(doc => ({
//         id: doc.id,
//         ...doc.data(),
//       }));
//     } else {
//       // 특정 학생들만 조회
//       const studentDocs = await Promise.all(
//         studentIds.map(id => db.collection("users").doc(id).get())
//       );
//
//       targetStudents = studentDocs
//         .filter(doc => doc.exists)
//         .map(doc => ({
//           id: doc.id,
//           ...doc.data(),
//         }));
//     }
//
//     // 배치로 급여 지급
//     const batch = db.batch();
//     let paidCount = 0;
//     let totalAmount = 0;
//
//     for (const student of targetStudents) {
//       const job = student.job || "무직";
//       const salary = salarySettings[job] || 0;
//
//       if (salary > 0) {
//         const studentRef = db.collection("users").doc(student.id);
//         batch.update(studentRef, {
//           cash: admin.firestore.FieldValue.increment(salary),
//           updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//         });
//
//         paidCount++;
//         totalAmount += salary;
//       }
//     }
//
//     await batch.commit();
//
//     logger.info(`[batchPaySalaries] ${uid}님이 ${paidCount}명에게 총 ${totalAmount}원 지급`);
//
//     return {
//       success: true,
//       message: `${paidCount}명에게 총 ${totalAmount.toLocaleString()}원 지급 완료`,
//       paidCount: paidCount,
//       totalAmount: totalAmount,
//     };
//   } catch (error) {
//     logger.error(`[batchPaySalaries] Error for user ${uid}:`, error);
//     throw new HttpsError("internal", error.message || "급여 지급에 실패했습니다.");
//   }
// });

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
    const { listingId } = request.data;

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

      const adminQuery = await db
        .collection("users")
        .where("classCode", "==", userData.classCode)
        .where("isAdmin", "==", true)
        .limit(1)
        .get();
      const adminDocRef = adminQuery.empty ? null : adminQuery.docs[0].ref;

      await db.runTransaction(async (transaction) => {
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

        // 판매자에게 세금 차감 금액 지급
        const sellerRef = db.collection("users").doc(listingData.sellerId);
        transaction.update(sellerRef, {
          cash: admin.firestore.FieldValue.increment(sellerProceeds),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 관리자(교사)에게 세금 입금 및 국고 통계 업데이트
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
              totalAmount: admin.firestore.FieldValue.increment(taxAmount),
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
          const newItemRef = buyerInventoryRef.doc();
          transaction.set(newItemRef, {
            itemId: listingData.itemId,
            name: listingData.name,
            icon: listingData.icon || "🔮",
            description: listingData.description || "",
            type: listingData.type || "general",
            quantity: listingData.quantity,
            purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 마켓 리스팅 상태 업데이트
        transaction.update(listingRef, {
          status: "sold",
          buyerId: uid,
          buyerName: userData.name,
          soldAt: admin.firestore.FieldValue.serverTimestamp(),
        });
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
          const newItemRef = sellerInventoryRef.doc();
          transaction.set(newItemRef, {
            itemId: listingData.itemId,
            name: listingData.name,
            icon: listingData.icon || "🔮",
            description: listingData.description || "",
            type: listingData.type || "general",
            quantity: listingData.quantity,
            restoredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
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
    const { offerId, response } = request.data;

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

      const adminQuery = await db
        .collection("users")
        .where("classCode", "==", userData.classCode)
        .where("isAdmin", "==", true)
        .limit(1)
        .get();
      const adminDocRef = adminQuery.empty ? null : adminQuery.docs[0].ref;

      await db.runTransaction(async (transaction) => {
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

          // 판매자에게 세금 차감 금액 지급
          transaction.update(sellerRef, {
            cash: admin.firestore.FieldValue.increment(sellerProceeds),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 관리자(교사)에게 세금 입금 및 국고 통계 업데이트
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
                totalAmount: admin.firestore.FieldValue.increment(taxAmount),
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
            const newItemRef = buyerInventoryRef.doc();
            transaction.set(newItemRef, {
              itemId: offerData.itemId,
              name: offerData.itemName,
              icon: listingDoc.data().icon || "🔮",
              description: listingDoc.data().description || "",
              type: listingDoc.data().type || "general",
              quantity: offerData.quantity,
              purchasedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
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
      const { propertyId } = request.data;

      if (!propertyId) {
        throw new HttpsError("invalid-argument", "부동산 ID가 필요합니다.");
      }

      logger.info(
        `[purchaseRealEstate] User ${uid} attempting to purchase property ${propertyId}`,
      );

      // 트랜잭션으로 처리
      const result = await db.runTransaction(async (transaction) => {
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

        // 4-4. 이전 소유자에게 판매 대금 지급 (정부 소유가 아닌 경우)
        if (propertyData.owner !== "government" && propertyData.owner) {
          const sellerRef = db.collection("users").doc(propertyData.owner);
          const sellerProceeds = purchasePrice - taxAmount;
          transaction.update(sellerRef, {
            cash: admin.firestore.FieldValue.increment(sellerProceeds),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 4-5. 관리자(국고)에 세금 입금
        if (taxAmount > 0) {
          // 관리자 현금에 세금 추가
          const usersSnapshot = await db
            .collection("users")
            .where("classCode", "==", classCode)
            .where("isAdmin", "==", true)
            .limit(1)
            .get();
          if (!usersSnapshot.empty) {
            const adminRef = usersSnapshot.docs[0].ref;
            transaction.update(adminRef, {
              cash: admin.firestore.FieldValue.increment(taxAmount),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // 국고 통계 업데이트
          const treasuryRef = db
            .collection("nationalTreasuries")
            .doc(classCode);
          const treasuryDoc = await transaction.get(treasuryRef);
          if (treasuryDoc.exists) {
            transaction.update(treasuryRef, {
              totalAmount: admin.firestore.FieldValue.increment(taxAmount),
              realEstateTransactionTaxRevenue:
                admin.firestore.FieldValue.increment(taxAmount),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(treasuryRef, {
              totalAmount: taxAmount,
              stockTaxRevenue: 0,
              stockCommissionRevenue: 0,
              realEstateTransactionTaxRevenue: taxAmount,
              vatRevenue: 0,
              auctionTaxRevenue: 0,
              propertyHoldingTaxRevenue: 0,
              itemMarketTaxRevenue: 0,
              otherTaxRevenue: 0,
              classCode: classCode,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
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

      // 관리자 또는 경찰청장만 합의금 처리 가능
      const isAdmin = userData.isAdmin || userData.isSuperAdmin;

      // jobName 또는 jobTitle 필드를 확인
      // 또는 selectedJobIds에서 경찰청장 직업이 있는지 확인
      let isPoliceChief = false;
      if (userData.jobName === "경찰청장" || userData.jobTitle === "경찰청장") {
        isPoliceChief = true;
      } else if (
        userData.selectedJobIds &&
        Array.isArray(userData.selectedJobIds)
      ) {
        // selectedJobIds에서 경찰청장 직업 확인
        const jobsSnapshot = await db
          .collection("jobs")
          .where("classCode", "==", classCode)
          .where(
            admin.firestore.FieldPath.documentId(),
            "in",
            userData.selectedJobIds.slice(0, 10),
          )
          .get();

        isPoliceChief = jobsSnapshot.docs.some(
          (doc) => doc.data().title === "경찰청장",
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

        const senderData = senderDoc.data();
        if ((senderData.cash || 0) < settlementAmount) {
          throw new Error(
            "가해자의 현금이 부족하여 합의금을 처리할 수 없습니다.",
          );
        }

        transaction.update(senderRef, {
          cash: admin.firestore.FieldValue.increment(-settlementAmount),
        });
        transaction.update(recipientRef, {
          cash: admin.firestore.FieldValue.increment(settlementAmount),
        });
        transaction.update(reportRef, {
          status: "settled",
          settlementAmount: settlementAmount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const recipientData = recipientDoc.data();
        logActivity(
          transaction,
          senderId,
          LOG_TYPES.CASH_EXPENSE,
          `경찰서 합의금으로 ${recipientData.name}에게 ${settlementAmount}원 지급`,
          { reportId, victimName: recipientData.name },
        );
        logActivity(
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
