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

// 🔥 주식 스냅샷 및 관리
exports.getStocksSnapshot = scheduler.getStocksSnapshotFunction; // 주식 스냅샷 조회
exports.updateStocksSnapshot = scheduler.updateStocksSnapshotFunction; // 주식 스냅샷 업데이트
exports.addStockDoc = scheduler.addStockDocFunction; // 단일 주식 추가

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

          if (!task.requiresApproval) {
            throw new Error(
              "이 할일은 승인이 필요하지 않습니다. completeTask를 사용하세요.",
            );
          }

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

          if (!taskData.requiresApproval) {
            throw new Error(
              "이 할일은 승인이 필요하지 않습니다. completeTask를 사용하세요.",
            );
          }

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

      // 관리자는 자동 승인 (본인이 승인 권한을 가지므로)
      const isAdminUser = userData.isAdmin || userData.isSuperAdmin || false;

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

    // 대통령 직업 체크 (selectedJobIds 기반)
    let isPresident = false;
    if (!hasTaskApprovalPermission && userData?.selectedJobIds?.length > 0) {
      const jobsSnapshot = await db
        .collection("jobs")
        .where("classCode", "==", adminClassCode)
        .get();
      const userJobIds = userData.selectedJobIds;
      isPresident = jobsSnapshot.docs.some(
        (doc) => userJobIds.includes(doc.id) && doc.data().title === "대통령",
      );
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
    if (!amount || amount <= 0) {
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
    const adminSnap = await db
      .collection("users")
      .where("classCode", "==", classCode)
      .where("isAdmin", "==", true)
      .limit(1)
      .get();
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
const { getStockTaxMultiplier } = require("./economicEvents");

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

  // 관리자 조회 (세금 수입용)
  let adminRef = null;
  const adminSnap = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", true)
    .limit(1)
    .get();
  if (!adminSnap.empty) {
    adminRef = adminSnap.docs[0].ref;
  }

  // 🔥 경제 이벤트 주식세금 멀티플라이어 사전 조회 (트랜잭션 외부)
  const stockTaxMult = await getStockTaxMultiplier(classCode);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 🔥 모든 읽기 작업을 먼저 수행
      const portfolioRef = db
        .collection("users")
        .doc(uid)
        .collection("portfolio")
        .doc(stockId);
      const refsToRead = [userRef, stockRef, portfolioRef, treasuryRef];
      if (adminRef) refsToRead.push(adminRef);
      const results = await transaction.getAll(...refsToRead);
      const [userDoc, stockDoc, portfolioDoc, treasuryDoc] = results;

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

      // 관리자에게 수수료+거래세 입금
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

  // 관리자 조회 (세금 수입용)
  let sellAdminRef = null;
  const sellAdminSnap = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", true)
    .limit(1)
    .get();
  if (!sellAdminSnap.empty) {
    sellAdminRef = sellAdminSnap.docs[0].ref;
  }

  // 🔥 경제 이벤트 주식세금 멀티플라이어 사전 조회 (트랜잭션 외부)
  const stockTaxMult = await getStockTaxMultiplier(classCode);

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

      // 관리자에게 수수료+세금 입금
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
        // [0]=user, [1]=item, [2]=userItem, [3]=admin(optional), last=treasury
        const readPromises = [
          transaction.get(userRef),
          transaction.get(itemRef),
          transaction.get(userItemRef),
        ];

        // 관리자 문서도 읽기 (재고 보충 시 필요)
        if (adminRef) {
          readPromises.push(transaction.get(adminRef));
        }
        readPromises.push(transaction.get(treasuryRef));

        const results = await Promise.all(readPromises);
        const [userDoc, itemDoc, userItemDoc] = results;
        const adminDoc = adminRef ? results[3] : null;
        const treasuryDoc = results[results.length - 1]; // 마지막이 항상 treasury

        if (!userDoc.exists) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }

        if (!itemDoc.exists) {
          throw new Error("아이템을 찾을 수 없습니다.");
        }

        const userData = userDoc.data();
        const itemData = itemDoc.data();

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

        // 선충전 시 관리자 비용 계산
        if (preRestocked) {
          const initialStock = itemData.initialStock || 10;
          restockCost = itemData.price * initialStock;
          if (adminDoc && adminDoc.exists) {
            const adminData = adminDoc.data();
            logger.info(
              `[purchaseStoreItem] 선충전 관리자 비용: ${restockCost.toLocaleString()}원 (보유: ${(adminData.cash || 0).toLocaleString()}원)`,
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

          // 재고 보충 비용 계산 (현재 가격 * 보충 수량)
          restockCost = itemData.price * initialStock;

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

          transaction.set(userItemRef, newItemData);
        }

        // 국고에 부가세(VAT) 기록 (기존 가격을 VAT 포함가로 간주)
        const vatAmount = Math.round(
          (totalCost * itemStoreVATRate) / (1 + itemStoreVATRate),
        );
        if (vatAmount > 0) {
          if (treasuryDoc.exists) {
            transaction.update(treasuryRef, {
              totalAmount: admin.firestore.FieldValue.increment(vatAmount),
              vatRevenue: admin.firestore.FieldValue.increment(vatAmount),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.set(treasuryRef, {
              totalAmount: vatAmount,
              vatRevenue: vatAmount,
              classCode: classCode,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

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

      // 급여 계산: 기본급 200만 + 추가 직업당 50만 + 대통령/국무총리 보너스
      const BASE_SALARY = 2000000;
      const ADDITIONAL_SALARY = 500000;
      const PRESIDENT_BONUS = 2000000;
      const PM_BONUS = 1000000;

      // 직업 정보 로드 (대통령/국무총리 보너스 적용용)
      const jobsSnap = await db.collection("jobs").where("classCode", "==", classCode).get();
      const jobTitleMap = {};
      jobsSnap.forEach((doc) => { jobTitleMap[doc.id] = doc.data().title; });

      const batch = db.batch();
      let totalStudentsPaid = 0;
      let totalGrossPaid = 0;
      let totalTaxDeducted = 0;
      let totalNetPaid = 0;
      const skippedStudents = [];

      for (const student of targetStudents) {
        const jobIds = student.selectedJobIds || [];
        if (jobIds.length === 0) {
          skippedStudents.push(student.name || student.nickname || student.id);
          continue;
        }

        const grossSalary =
          BASE_SALARY + Math.max(0, jobIds.length - 1) * ADDITIONAL_SALARY;
        let bonus = 0;
        for (const jobId of jobIds) {
          const title = jobTitleMap[jobId];
          if (title === "대통령") bonus += PRESIDENT_BONUS;
          else if (title === "국무총리") bonus += PM_BONUS;
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

      const BASE_SALARY = 2000000;
      const ADDITIONAL_SALARY = 500000;
      const PRESIDENT_BONUS = 2000000;
      const PM_BONUS = 1000000;

      const jobsSnap2 = await db.collection("jobs").where("classCode", "==", classCode).get();
      const jobTitleMap2 = {};
      jobsSnap2.forEach((doc) => { jobTitleMap2[doc.id] = doc.data().title; });

      const batch = db.batch();
      let totalReversed = 0;
      let totalAmount = 0;

      for (const student of targetStudents) {
        const jobIds = student.selectedJobIds || [];
        if (jobIds.length === 0) continue;

        const grossSalary =
          BASE_SALARY + Math.max(0, jobIds.length - 1) * ADDITIONAL_SALARY;
        let bonus = 0;
        for (const jobId of jobIds) {
          const title = jobTitleMap2[jobId];
          if (title === "대통령") bonus += PRESIDENT_BONUS;
          else if (title === "국무총리") bonus += PM_BONUS;
        }
        const totalGross = grossSalary + bonus;
        const tax = Math.floor(totalGross * taxRate);
        const netSalary = totalGross - tax;

        const studentRef = db.collection("users").doc(student.id);
        batch.update(studentRef, {
          cash: admin.firestore.FieldValue.increment(-netSalary),
          totalSalaryReceived: admin.firestore.FieldValue.increment(-netSalary),
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
    if (token !== "my-super-secret-token-2024-isw") {
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
    if (token !== (process.env.SCHEDULER_AUTH_TOKEN || "")) {
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
    if (token !== (process.env.SCHEDULER_AUTH_TOKEN || "")) {
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
        const adminSnap = await db
          .collection("users")
          .where("classCode", "==", classCode)
          .where("isAdmin", "==", true)
          .limit(1)
          .get();

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
