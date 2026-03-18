// src/database.js
import {
  addActivityLog,
  getUserDocument,
  updateUserCashInFirestore,
  updateUserCouponsInFirestore,
  addTransaction as firebaseAddTransaction,
  db,
  writeBatch,
  doc,
  collection,
  serverTimestamp,
  updateUserDocument, // 추가된 import
  runTransaction,
  getDoc,
  increment
} from '../firebase';
import { applyTransactionTax, applyIncomeTax } from '../utils/taxUtils';
import { validateAmount } from '../utils/validation';

import { logger } from "../utils/logger";
/**
 * 활동 로그 타입 정의
 */
const LOG_TYPES = {
  // 현금 관련
  CASH_INCOME: '현금 입금',
  CASH_EXPENSE: '현금 출금',
  CASH_TRANSFER_SEND: '송금',
  CASH_TRANSFER_RECEIVE: '송금 수신',
  ADMIN_CASH_SEND: '관리자 지급',
  ADMIN_CASH_TAKE: '관리자 회수',

  // 쿠폰 관련
  COUPON_EARN: '쿠폰 획득',
  COUPON_USE: '쿠폰 사용',
  COUPON_GIVE: '쿠폰 지급',
  COUPON_TAKE: '쿠폰 회수',
  COUPON_TRANSFER_SEND: '쿠폰 송금',
  COUPON_TRANSFER_RECEIVE: '쿠폰 수신',

  // 아이템 관련
  ITEM_PURCHASE: '아이템 구매',
  ITEM_USE: '아이템 사용', // 아이템 사용 로그 타입
  ITEM_SELL: '아이템 판매',
  ITEM_MARKET_LIST: '아이템 시장 등록',
  ITEM_MARKET_BUY: '아이템 시장 구매',
  ITEM_OBTAIN: '아이템 획득',
  ITEM_MOVE: '아이템 이동',

  // 과제 관련
  TASK_COMPLETE: '과제 완료',
  TASK_REWARD: '과제 보상',

  // 게임 관련
  GAME_WIN: '게임 승리',
  GAME_LOSE: '게임 패배',
  GAME_REWARD: '게임 보상',
  OMOK_GAME: '오목 게임',
  CHESS_GAME: '체스 게임',

  // 주식 관련
  STOCK_BUY: '주식 매수',
  STOCK_SELL: '주식 매도',

  // 세금 관련
  TAX_PAYMENT: '세금 납부',
  TAX_REFUND: '세금 환급',
  FINE_PAYMENT: '벌금 납부',

  // 급여 관련
  SALARY_PAYMENT: '월급 지급',
  BONUS_PAYMENT: '보너스 지급',

  // 시스템 관련
  SYSTEM: '시스템',
  ADMIN_ACTION: '관리자 조치',
  TREASURY_DEPOSIT: '금고 입금',
  TREASURY_WITHDRAW: '금고 출금',
};

/**
 * 체계적인 활동 로거
 * @param {string} userId - 사용자 ID
 * @param {string} type - 활동 유형 (LOG_TYPES 참조)
 * @param {string} description - 활동 설명
 * @param {object} metadata - 추가 메타데이터
 */
const logActivity = async (userId, type, description, metadata = {}) => {
  if (!userId || userId === 'system') {
    logger.log(`[System Log] ${type}: ${description}`);
    return;
  }

  try {
    // Firebase에 활동 로그 기록 (메타데이터 포함)
    await addActivityLog(userId, type, description, metadata);

    // 메타데이터가 있으면 콘솔에도 기록
    if (Object.keys(metadata).length > 0) {
      logger.log(`[Activity Log] User: ${userId}, Type: ${type}`, metadata);
    }
  } catch (error) {
    logger.error('[Activity Log Error]', error);
  }
};

/**
 * 관리자 현금 지급/회수 (MoneyTransfer.js용) - Firestore 트랜잭션 적용
 * @param {object} params - 함수 파라미터
 * @param {string} params.adminName - 관리자 이름
 * @param {string} params.adminClassCode - 관리자 학급 코드
 * @param {Array<object>} params.targetUsers - 대상 사용자 정보 배열
 * @param {string} params.action - 'send' 또는 'take'
 * @param {string} params.amountType - 'fixed' 또는 'percentage'
 * @param {number} params.amount - 금액 또는 퍼센트
 * @param {number} params.taxRate - 세율
 */
export const adminCashAction = async ({
  adminId,
  adminName,
  adminClassCode,
  targetUsers,
  action,
  takeMode, // "toMe" 또는 "remove"
  amountType,
  amount,
  taxRate,
}) => {
  logger.log('[database.js] adminCashAction 시작:', {
    adminName,
    action,
    takeMode,
    amountType,
    amount,
    taxRate,
    targetUsersCount: targetUsers.length
  });

  // 입력 검증
  try {
    if (amountType === 'percentage') {
      if (amount < 0 || amount > 100) {
        throw new Error('퍼센트는 0과 100 사이의 값이어야 합니다.');
      }
    } else {
      validateAmount(amount, { min: 1, fieldName: '금액' });
    }
  } catch (error) {
    throw new Error(`입력 검증 실패: ${error.message}`);
  }

  const updatedUsers = [];
  let totalProcessed = 0;
  let successCount = 0;

  // 각 사용자에 대해 트랜잭션 처리
  for (const user of targetUsers) {
    try {
      await runTransaction(db, async (transaction) => {
        // ===== 1단계: 모든 읽기 먼저 =====
        const userRef = doc(db, "users", user.id);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists()) {
          throw new Error(`사용자 ${user.name}을 찾을 수 없습니다.`);
        }

        // 관리자 문서도 미리 읽기 (toMe 모드)
        let adminSnap = null;
        let adminRef = null;
        if (action === "take" && takeMode === "toMe" && adminId) {
          adminRef = doc(db, "users", adminId);
          adminSnap = await transaction.get(adminRef);
        }

        // ===== 2단계: 계산 =====
        const userData = userDoc.data();
        const currentCash = Number(userData.cash || 0);
        let baseAmount;

        if (amountType === "percentage") {
          baseAmount = Math.floor((currentCash * amount) / 100);
        } else {
          baseAmount = validateAmount(amount, { min: 1, fieldName: '금액' });
        }

        if (baseAmount <= 0) {
          logger.log(`[database.js] ${user.name}: 처리할 금액이 0원이므로 스킵`);
          return;
        }

        let finalAmount = baseAmount;
        let taxAmount = 0;

        if (action === "send" && taxRate > 0) {
          taxAmount = Math.floor((baseAmount * taxRate) / 100);
          finalAmount = baseAmount - taxAmount;
        }

        let newCash;
        if (action === "send") {
          newCash = currentCash + finalAmount;
        } else { // take - 마이너스 허용
          newCash = currentCash - baseAmount;
        }

        // ===== 3단계: 모든 쓰기 =====
        // 학생 잔액 업데이트
        transaction.update(userRef, {
          cash: newCash,
          updatedAt: serverTimestamp()
        });

        // 가져오기(toMe) 모드: 관리자 잔액 업데이트
        if (adminRef && adminSnap && adminSnap.exists()) {
          const adminCurrentCash = Number(adminSnap.data().cash || 0);
          transaction.update(adminRef, {
            cash: adminCurrentCash + baseAmount,
            updatedAt: serverTimestamp()
          });
        }

        // 로그 기록
        const logRef = doc(collection(db, "activity_logs"));
        let logType, logDescription;

        if (action === "send") {
          logType = "ADMIN_CASH_SEND";
          if (amountType === "percentage") {
            logDescription = `관리자(${adminName})가 ${user.name}님에게 ${amount}% (${finalAmount.toLocaleString()}원)을 지급했습니다.`;
            if (taxAmount > 0) {
              logDescription += ` (원금 ${baseAmount.toLocaleString()}원, 세금 ${taxAmount.toLocaleString()}원 제외)`;
            }
          } else {
            logDescription = `관리자(${adminName})가 ${user.name}님에게 ${finalAmount.toLocaleString()}원을 지급했습니다.`;
            if (taxAmount > 0) {
              logDescription += ` (원금 ${baseAmount.toLocaleString()}원, 세금 ${taxAmount.toLocaleString()}원 제외)`;
            }
          }
        } else if (action === "take") {
          if (takeMode === "remove") {
            logType = "ADMIN_CASH_REMOVE";
            if (amountType === "percentage") {
              logDescription = `관리자(${adminName})가 ${user.name}님의 ${amount}% (${baseAmount.toLocaleString()}원)을 제거했습니다.`;
            } else {
              logDescription = `관리자(${adminName})가 ${user.name}님의 ${baseAmount.toLocaleString()}원을 제거했습니다.`;
            }
          } else {
            logType = "ADMIN_CASH_TAKE";
            if (amountType === "percentage") {
              logDescription = `관리자(${adminName})가 ${user.name}님으로부터 ${amount}% (${baseAmount.toLocaleString()}원)을 회수했습니다.`;
            } else {
              logDescription = `관리자(${adminName})가 ${user.name}님으로부터 ${baseAmount.toLocaleString()}원을 회수했습니다.`;
            }
          }
        }

        const logData = {
          userId: user.id,
          userName: user.name,
          timestamp: serverTimestamp(),
          type: logType,
          description: logDescription,
          classCode: adminClassCode,
          metadata: {
            adminName,
            action,
            amountType,
            inputValue: amount,
            taxRate: action === 'send' ? taxRate : 0,
            baseAmount,
            taxAmount,
            finalAmount,
            previousCash: currentCash,
            newCash
          }
        };
        transaction.set(logRef, logData);

        // 거래 기록
        const transactionRef = doc(collection(db, "transactions"));
        const transactionData = {
          userId: user.id,
          amount: action === 'send' ? finalAmount : -baseAmount,
          type: action === 'send' ? 'income' : 'expense',
          category: 'admin',
          description: action === 'send' ? '관리자 지급' : '관리자 회수',
          timestamp: serverTimestamp(),
          metadata: {
            adminName,
            amountType,
            taxRate: action === 'send' ? taxRate : 0
          }
        };
        transaction.set(transactionRef, transactionData);

        // 성공 정보 저장
        updatedUsers.push({ id: user.id, newCash });
        totalProcessed += baseAmount;
        successCount++;

        logger.log(`[database.js] ${user.name} 트랜잭션 처리 완료:`, {
          현재잔액: currentCash,
          기본금액: baseAmount,
          세금: taxAmount,
          최종금액: finalAmount,
          새잔액: newCash
        });
      });
    } catch (userError) {
      logger.error(`[database.js] 사용자 ${user.name} 처리 중 오류:`, userError);
      throw new Error(`${user.name}님 처리 실패: ${userError.message}`);
    }
  }

  logger.log(`[database.js] adminCashAction 완료: ${successCount}명 처리, 총 ${totalProcessed.toLocaleString()}원`);

  return {
    count: successCount,
    totalProcessed,
    updatedUsers,
  };
};


/**
 * Initialize the database with default values
 */
export const initializeDatabase = async () => {
  logger.log("Initializing database...");

  if (!localStorage.getItem("dbInitialized")) {
    logger.log("First time initialization...");

    // Initialize items
    const defaultItems = [
      {
        id: 1,
        name: "연필",
        description: "과제 제출 시 사용할 수 있는 기본 아이템",
        icon: "✏️",
        price: 100,
        effect: "과제 제출 시 사용",
        available: true,
      },
      {
        id: 2,
        name: "지우개",
        description: "실수를 지울 수 있는 필수 아이템",
        icon: "🧽",
        price: 50,
        effect: "실수 하나 지우기",
        available: true,
      },
      {
        id: 3,
        name: "노트",
        description: "학습 내용을 기록할 수 있는 아이템",
        icon: "📓",
        price: 200,
        effect: "학습 기록",
        available: true,
      },
      {
        id: 4,
        name: "계산기",
        description: "복잡한 계산을 도와주는 아이템",
        icon: "🧮",
        price: 500,
        effect: "계산 도움",
        available: true,
      },
      {
        id: 5,
        name: "고급 펜",
        description: "과제 제출 시 추가 점수를 얻을 수 있는 아이템",
        icon: "🖋️",
        price: 1000,
        effect: "과제 제출 시 추가 점수",
        available: true,
      },
    ];

    localStorage.setItem("items", JSON.stringify(defaultItems));

    // Initialize tasks
    const defaultTasks = [
      {
        id: 1,
        title: "기본 경제 개념 학습",
        description: "기본적인 경제 용어와 개념을 학습하세요.",
        reward: 100,
        couponReward: 1,
        completed: false,
        deadline: addDays(new Date(), 3),
      },
      {
        id: 2,
        title: "예산 계획 세우기",
        description: "한 달 예산 계획을 세워보세요.",
        reward: 200,
        couponReward: 2,
        completed: false,
        deadline: addDays(new Date(), 5),
      },
      {
        id: 3,
        title: "저축 목표 설정",
        description: "저축 목표와 전략을 수립하세요.",
        reward: 150,
        couponReward: 1,
        completed: false,
        deadline: addDays(new Date(), 7),
      },
    ];

    localStorage.setItem("tasks", JSON.stringify(defaultTasks));

    // Initialize transactions
    const defaultTransactions = [
      {
        id: 1,
        date: new Date().toISOString(),
        type: "income",
        amount: 1000,
        description: "초기 지급금",
        category: "system",
      },
    ];

    localStorage.setItem("transactions", JSON.stringify(defaultTransactions));
    localStorage.setItem("activity_logs", JSON.stringify([]));
    localStorage.setItem("dbInitialized", "true");

    logger.log("Database initialization complete.");
  } else {
    logger.log("Database already initialized.");
  }
};

/**
 * Helper function to add days to a date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

/**
 * 현금 전송 (송금) - 상세한 로깅 포함
 * @param {string} senderId - 송금자 ID
 * @param {string} receiverId - 수신자 ID
 * @param {number} amount - 송금액
 * @param {string} message - 송금 메시지
 */
export const transferCash = async (senderId, receiverId, amount, message = '') => {
  if (!senderId || !receiverId || amount <= 0) {
    throw new Error('유효하지 않은 송금 정보입니다.');
  }

  try {
    // 송금자 잔액 확인
    const senderDoc = await getUserDocument(senderId);
    if (!senderDoc || (senderDoc.cash || 0) < amount) {
      throw new Error('잔액이 부족합니다.');
    }

    const receiverDoc = await getUserDocument(receiverId);
    if (!receiverDoc) {
      throw new Error('수신자를 찾을 수 없습니다.');
    }

    // 거래세 계산 및 적용
    const classCode = senderDoc.classCode || receiverDoc.classCode;
    const taxResult = await applyTransactionTax(classCode, senderId, amount, '송금');
    const { taxAmount, netAmount } = taxResult;

    // 송금자는 원래 금액 + 세금을 지불해야 함
    const totalDeduction = amount + taxAmount;
    if ((senderDoc.cash || 0) < totalDeduction) {
      throw new Error(`잔액이 부족합니다. (송금액: ${amount}원 + 거래세: ${taxAmount}원 = 총 ${totalDeduction}원 필요)`);
    }

    // 송금 처리
    const transferMessage = message || `${senderDoc.name}님으로부터 송금`;

    // 송금자 차감 (원래 금액 + 거래세)
    await updateUserCashInFirestore(senderId, -totalDeduction,
      `${receiverDoc.name}님에게 ${amount}원 송금 (거래세 ${taxAmount}원 포함) ${message ? `(${message})` : ''}`);

    await logActivity(senderId, LOG_TYPES.CASH_TRANSFER_SEND,
      `${receiverDoc.name}님에게 ${amount}원을 송금했습니다.${taxAmount > 0 ? ` (거래세 ${taxAmount}원 납부)` : ''}${message ? ` 메시지: "${message}"` : ''}`,
      {
        receiverId,
        receiverName: receiverDoc.name,
        amount,
        taxAmount,
        totalDeduction,
        message,
        transactionType: 'transfer_send'
      }
    );

    // 수신자 증가 (세금 제외한 원래 금액)
    await updateUserCashInFirestore(receiverId, amount,
      `${senderDoc.name}님으로부터 ${amount}원 송금 받음 ${message ? `(${message})` : ''}`);

    await logActivity(receiverId, LOG_TYPES.CASH_TRANSFER_RECEIVE,
      `${senderDoc.name}님으로부터 ${amount}원을 받았습니다.${message ? ` 메시지: "${message}"` : ''}`,
      {
        senderId,
        senderName: senderDoc.name,
        amount,
        taxAmount,
        message,
        transactionType: 'transfer_receive'
      }
    );

    return {
      success: true,
      amount,
      taxAmount,
      totalDeduction,
      message: taxAmount > 0 ? `송금 완료. 거래세 ${taxAmount}원이 부과되었습니다.` : '송금 완료.'
    };
  } catch (error) {
    logger.error('현금 전송 실패:', error);
    throw error;
  }
};

/**
 * 쿠폰 전송 - 상세한 로깅 포함
 * @param {string} senderId - 송금자 ID
 * @param {string} receiverId - 수신자 ID
 * @param {number} amount - 쿠폰 수량
 * @param {string} message - 전송 메시지
 */
export const transferCoupons = async (senderId, receiverId, amount, message = '') => {
  if (!senderId || !receiverId || amount <= 0) {
    throw new Error('유효하지 않은 쿠폰 전송 정보입니다.');
  }

  try {
    // 송금자 쿠폰 확인
    const senderDoc = await getUserDocument(senderId);
    if (!senderDoc || (senderDoc.coupons || 0) < amount) {
      throw new Error('쿠폰이 부족합니다.');
    }

    const receiverDoc = await getUserDocument(receiverId);
    if (!receiverDoc) {
      throw new Error('수신자를 찾을 수 없습니다.');
    }

    // 쿠폰 전송의 경우 현금 기준 가격으로 거래세 계산 (쿠폰 1개 = 100원으로 가정)
    const classCode = senderDoc.classCode || receiverDoc.classCode;
    const couponValue = amount * 100; // 쿠폰 1개당 100원으로 계산
    const taxResult = await applyTransactionTax(classCode, senderId, couponValue, '쿠폰 전송');
    const { taxAmount } = taxResult;

    // 송금자는 거래세를 현금으로 지불해야 함
    if (taxAmount > 0 && (senderDoc.cash || 0) < taxAmount) {
      throw new Error(`거래세 납부를 위한 현금이 부족합니다. (거래세: ${taxAmount}원 필요)`);
    }

    // 쿠폰 전송 처리
    const transferMessage = message || `${senderDoc.name}님으로부터 쿠폰 수신`;

    // 송금자 쿠폰 차감
    await updateUserCouponsInFirestore(senderId, -amount,
      `${receiverDoc.name}님에게 쿠폰 ${amount}개 전송 ${message ? `(${message})` : ''}`
    );

    // 거래세 차감 (현금으로)
    if (taxAmount > 0) {
      await updateUserCashInFirestore(senderId, -taxAmount, `쿠폰 전송 거래세 ${taxAmount}원`);
    }

    await logActivity(senderId, LOG_TYPES.COUPON_TRANSFER_SEND,
      `${receiverDoc.name}님에게 쿠폰 ${amount}개를 전송했습니다.${taxAmount > 0 ? ` (거래세 ${taxAmount}원 납부)` : ''}${message ? ` 메시지: "${message}"` : ''}`,
      {
        receiverId,
        receiverName: receiverDoc.name,
        amount,
        taxAmount,
        couponValue,
        message,
        transactionType: 'coupon_transfer_send'
      }
    );

    // 수신자 증가
    await updateUserCouponsInFirestore(receiverId, amount,
      `${senderDoc.name}님으로부터 쿠폰 ${amount}개 받음 ${message ? `(${message})` : ''}`);

    await logActivity(receiverId, LOG_TYPES.COUPON_TRANSFER_RECEIVE,
      `${senderDoc.name}님으로부터 쿠폰 ${amount}개를 받았습니다.${message ? ` 메시지: "${message}"` : ''}`,
      {
        senderId,
        senderName: senderDoc.name,
        amount,
        taxAmount,
        message,
        transactionType: 'coupon_transfer_receive'
      }
    );

    return {
      success: true,
      amount,
      taxAmount,
      message: taxAmount > 0 ? `쿠폰 전송 완료. 거래세 ${taxAmount}원이 부과되었습니다.` : '쿠폰 전송 완료.'
    };
  } catch (error) {
    logger.error('쿠폰 전송 실패:', error);
    throw error;
  }
};

/**
 * 거래 추가 (개선된 버전) - 상세한 로깅 포함
 */
export const addTransaction = async (transaction, updateFirebase = true) => {
  try {
    // localStorage에 거래 기록
    const transactionsJson = localStorage.getItem("transactions");
    const transactions = transactionsJson ? JSON.parse(transactionsJson) : [];

    const newTransaction = {
      ...transaction,
      id: transactions.length > 0
        ? Math.max(...transactions.map((t) => t.id)) + 1
        : 1,
      date: new Date().toISOString(),
    };

    transactions.push(newTransaction);
    localStorage.setItem("transactions", JSON.stringify(transactions));

    // Firebase 업데이트
    if (updateFirebase && transaction.userId && typeof transaction.amount === 'number') {
      try {
        const logType = transaction.type === 'income' ? LOG_TYPES.CASH_INCOME : LOG_TYPES.CASH_EXPENSE;
        const logMessage = `${transaction.description} (${Math.abs(transaction.amount)}원)`;

        if (transaction.type === 'income') {
          await updateUserCashInFirestore(transaction.userId, transaction.amount, logMessage);
        } else if (transaction.type === 'expense') {
          await updateUserCashInFirestore(transaction.userId, -Math.abs(transaction.amount), logMessage);
        }

        await logActivity(transaction.userId, logType, logMessage, {
          amount: transaction.amount,
          category: transaction.category,
          transactionId: newTransaction.id,
          transactionType: transaction.type
        });

        // Firebase에도 거래 기록 저장
        if (firebaseAddTransaction) {
          await firebaseAddTransaction(transaction.userId, transaction.amount, transaction.description);
        }

        logger.log('[DB] Firebase 동기화 완료:', newTransaction);
      } catch (firebaseError) {
        logger.error('[DB] Firebase 동기화 중 오류:', firebaseError);
      }
    }

    return newTransaction;
  } catch (error) {
    logger.error("Error adding transaction:", error);
    return null;
  }
};

/**
 * 사용자 거래 내역 조회
 */
export const getUserTransactions = (userId, limit = null) => {
  try {
    const transactionsJson = localStorage.getItem("transactions");
    const transactions = transactionsJson ? JSON.parse(transactionsJson) : [];

    let filteredTransactions = transactions;
    if (userId) {
      filteredTransactions = transactions.filter(t => t.userId === userId);
    }

    const sortedTransactions = filteredTransactions.sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    if (limit && limit > 0) {
      return sortedTransactions.slice(0, limit);
    }

    return sortedTransactions;
  } catch (error) {
    logger.error("Error getting transactions:", error);
    return [];
  }
};

/**
 * 사용자 과제 조회
 */
export const getUserTasks = (userId, completed = null) => {
  try {
    const tasksJson = localStorage.getItem("tasks");
    const tasks = tasksJson ? JSON.parse(tasksJson) : [];

    if (completed !== null) {
      return tasks.filter((task) => task.completed === completed);
    }

    return tasks;
  } catch (error) {
    logger.error("Error getting tasks:", error);
    return [];
  }
};

/**
 * 과제 완료 (개선된 버전) - 상세한 로깅 포함
 */
export const completeTask = async (taskId, userId, updateFirebase = true) => {
  try {
    const tasksJson = localStorage.getItem("tasks");
    const tasks = tasksJson ? JSON.parse(tasksJson) : [];

    const taskIndex = tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) {
      logger.warn(`Task with ID ${taskId} not found`);
      return false;
    }

    const completedTask = tasks[taskIndex];
    tasks[taskIndex].completed = true;
    localStorage.setItem("tasks", JSON.stringify(tasks));

    const cashReward = completedTask.reward || 0;
    const couponReward = completedTask.couponReward || 0;

    if (updateFirebase && userId) {
      try {
        // 현금 보상 (소득세 적용)
        if (cashReward > 0) {
          const userDoc = await getUserDocument(userId);
          const classCode = userDoc?.classCode;

          if (classCode) {
            const taxResult = await applyIncomeTax(classCode, userId, cashReward, 'reward');
            const { netIncome, taxAmount } = taxResult;

            await updateUserCashInFirestore(userId, netIncome,
              `'${completedTask.title}' 과제 완료 보상 (세후 ${netIncome}원, 소득세 ${taxAmount}원 납부)`
            );
          } else {
            await updateUserCashInFirestore(userId, cashReward,
              `'${completedTask.title}' 과제 완료 보상`
            );
          }
        }

        // 쿠폰 보상
        if (couponReward > 0) {
          await updateUserCouponsInFirestore(userId, couponReward,
            `'${completedTask.title}' 과제 완료 쿠폰 보상`
          );

          // 쿠폰 획득에 대한 별도 로그 (수정된 부분)
          await logActivity(userId, LOG_TYPES.COUPON_EARN,
            `'과제 완료: ${completedTask.title}' 활동으로 쿠폰 ${couponReward}개를 획득했습니다.`,
            {
              taskId,
              taskTitle: completedTask.title,
              couponAmount: couponReward,
              reason: 'task_completion',
              activity: `과제 완료: ${completedTask.title}`, // 어떤 활동인지 명시
              taskDescription: completedTask.description
            }
          );
        }

        // 과제 완료 활동 로그
        const rewardText = [];
        if (cashReward > 0) rewardText.push(`현금 ${cashReward}원`);
        if (couponReward > 0) rewardText.push(`쿠폰 ${couponReward}개`);

        await logActivity(userId, LOG_TYPES.TASK_COMPLETE,
          `'${completedTask.title}' 과제를 완료했습니다.${rewardText.length > 0 ? ` 보상: ${rewardText.join(', ')}` : ''}`,
          {
            taskId,
            taskTitle: completedTask.title,
            taskDescription: completedTask.description,
            cashReward,
            couponReward,
            deadline: completedTask.deadline
          }
        );

        logger.log(`[DB] 과제 완료 Firebase 동기화 완료: ${completedTask.title}`);
      } catch (firebaseError) {
        logger.error('[DB] Firebase 동기화 중 오류:', firebaseError);
      }
    }

    return true;
  } catch (error) {
    logger.error("Error completing task:", error);
    return false;
  }
};

/**
 * 아이템 사용 기록 - 상세한 로깅 포함
 */
export const useItem = async (userId, itemName, effect, quantity = 1, context = '') => {
  if (!userId || !itemName) {
    logger.warn('[DB] useItem: userId와 itemName이 필요합니다.');
    return false;
  }

  try {
    const contextText = context ? ` (${context})` : '';
    await logActivity(userId, LOG_TYPES.ITEM_USE,
      `${itemName} ${quantity}개를 사용했습니다.${contextText} 효과: ${effect}`,
      {
        itemName,
        effect,
        quantity,
        context,
        usageTime: new Date().toISOString()
      }
    );
    logger.log(`[DB] 아이템 사용 기록 완료: ${itemName}`);
    return true;
  } catch (error) {
    logger.error('[DB] 아이템 사용 기록 중 오류:', error);
    return false;
  }
};

/**
 * 아이템 획득 기록 - 새로운 함수 추가
 */
export const obtainItem = async (userId, itemName, quantity = 1, source = 'unknown') => {
  if (!userId || !itemName) {
    logger.warn('[DB] obtainItem: userId와 itemName이 필요합니다.');
    return false;
  }

  try {
    const sourceText = source !== 'unknown' ? ` (${source})` : '';
    await logActivity(userId, LOG_TYPES.ITEM_OBTAIN,
      `${itemName} ${quantity}개를 획득했습니다.${sourceText}`,
      {
        itemName,
        quantity,
        source,
        obtainTime: new Date().toISOString()
      }
    );
    logger.log(`[DB] 아이템 획득 기록 완료: ${itemName}`);
    return true;
  } catch (error) {
    logger.error('[DB] 아이템 획득 기록 중 오류:', error);
    return false;
  }
};

/**
 * 게임 결과 기록 - 상세한 로깅 포함
 */
export const recordGameResult = async (userId, gameName, result, reward = null, gameDetails = {}) => {
  if (!userId || !gameName || !result) {
    logger.warn('[DB] recordGameResult: 모든 매개변수가 필요합니다.');
    return false;
  }

  try {
    const logType = result === 'win' ? LOG_TYPES.GAME_WIN :
                   result === 'lose' ? LOG_TYPES.GAME_LOSE :
                   LOG_TYPES.GAME_REWARD;

    let description = `${gameName}에서 ${result === 'win' ? '승리' : result === 'lose' ? '패배' : '게임 완료'}했습니다.`;
    const rewardDetails = [];

    if (reward) {
      if (reward.cash > 0) {
        await updateUserCashInFirestore(userId, reward.cash, `${gameName} 보상`);
        rewardDetails.push(`현금 ${reward.cash}원`);
      }
      if (reward.coupons > 0) {
        await updateUserCouponsInFirestore(userId, reward.coupons, `${gameName} 보상`);
        rewardDetails.push(`쿠폰 ${reward.coupons}개`);

        // 쿠폰 획득에 대한 별도 로그 (수정된 부분)
        await logActivity(userId, LOG_TYPES.COUPON_EARN,
          `'게임 보상: ${gameName}' 활동으로 쿠폰 ${reward.coupons}개를 획득했습니다.`,
          {
            gameName,
            result,
            couponAmount: reward.coupons,
            reason: 'game_reward',
            activity: `게임 보상: ${gameName}`, // 어떤 활동인지 명시
            gameDetails
          }
        );
      }

      if (rewardDetails.length > 0) {
        description += ` 보상: ${rewardDetails.join(', ')}`;
      }
    }

    await logActivity(userId, logType, description, {
      gameName,
      result,
      reward,
      gameDetails,
      duration: gameDetails.duration || null,
      score: gameDetails.score || null
    });

    logger.log(`[DB] 게임 결과 기록 완료: ${gameName} - ${result}`);
    return true;
  } catch (error) {
    logger.error('[DB] 게임 결과 기록 중 오류:', error);
    return false;
  }
};


/**
 * 관리자 액션 기록
 */
export const recordAdminAction = async (adminId, action, targetUserId, details) => {
  if (!adminId || !action || !targetUserId) {
    logger.warn('[DB] recordAdminAction: 필수 매개변수가 누락되었습니다.');
    return false;
  }

  try {
    await logActivity(adminId, LOG_TYPES.ADMIN_ACTION,
      `관리자가 ${action} 작업을 수행했습니다. 대상: ${targetUserId}`,
      { action, targetUserId, details }
    );
    logger.log(`[DB] 관리자 액션 기록 완료: ${action}`);
    return true;
  } catch (error) {
    logger.error('[DB] 관리자 액션 기록 중 오류:', error);
    return false;
  }
};

/**
 * 급여 지급 기록
 */
export const recordSalaryPayment = async (userId, amount, period, details = {}) => {
  if (!userId || !amount || amount <= 0) {
    logger.warn('[DB] recordSalaryPayment: 필수 매개변수가 누락되었습니다.');
    return false;
  }

  try {
    const userDoc = await getUserDocument(userId);
    const classCode = userDoc?.classCode;

    if (classCode) {
      // 급여에 소득세 적용
      const taxResult = await applyIncomeTax(classCode, userId, amount, 'salary');
      const { netIncome, taxAmount } = taxResult;

      await updateUserCashInFirestore(userId, netIncome,
        `${period} 급여 지급 (세후 ${netIncome}원, 소득세 ${taxAmount}원 납부)`
      );

      await logActivity(userId, LOG_TYPES.SALARY_PAYMENT,
        `${period} 급여가 지급되었습니다. (총 ${amount}원, 세후 ${netIncome}원, 소득세 ${taxAmount}원)`,
        {
          grossAmount: amount,
          netAmount: netIncome,
          taxAmount,
          period,
          details,
          paymentDate: new Date().toISOString()
        }
      );

      logger.log(`[DB] 급여 지급 기록 완료: ${userId} - 총 ${amount}원 (세후 ${netIncome}원)`);
    } else {
      // 클래스 코드가 없는 경우 기존 방식
      await updateUserCashInFirestore(userId, amount, `${period} 급여 지급`);
      await logActivity(userId, LOG_TYPES.SALARY_PAYMENT,
        `${period} 급여 ${amount}원이 지급되었습니다.`,
        {
          amount,
          period,
          details,
          paymentDate: new Date().toISOString()
        }
      );
      logger.log(`[DB] 급여 지급 기록 완료: ${userId} - ${amount}원`);
    }

    return true;
  } catch (error) {
    logger.error('[DB] 급여 지급 기록 중 오류:', error);
    return false;
  }
};

/**
 * 쿠폰 관련 관리자 액션
 */
export const adminCouponAction = async (adminId, targetUserId, action, amount, reason) => {
  if (!adminId || !targetUserId || !action || !amount) {
    logger.warn('[DB] adminCouponAction: 필수 매개변수가 누락되었습니다.');
    return false;
  }

  try {
    const isGive = action === 'give';
    const logType = isGive ? LOG_TYPES.COUPON_GIVE : LOG_TYPES.COUPON_TAKE;
    const actionAmount = isGive ? amount : -Math.abs(amount);

    await updateUserCouponsInFirestore(targetUserId, actionAmount,
      `관리자 ${isGive ? '지급' : '회수'}: ${reason || '관리자 조치'}`
    );

    const targetDoc = await getUserDocument(targetUserId);
    const targetName = targetDoc?.name || '사용자';

    await logActivity(targetUserId, logType,
      `관리자가 쿠폰 ${Math.abs(amount)}개를 ${isGive ? '지급' : '회수'}했습니다.${reason ? ` 사유: ${reason}` : ''}`,
      {
        adminId,
        action,
        amount: Math.abs(amount),
        reason,
        targetUserId,
        targetName
      }
    );

    // 관리자 액션도 별도 기록
    await recordAdminAction(adminId, `쿠폰 ${isGive ? '지급' : '회수'}`, targetUserId, {
      amount: Math.abs(amount),
      reason
    });

    logger.log(`[DB] 관리자 쿠폰 액션 완료: ${action} - ${amount}개`);
    return true;
  } catch (error) {
    logger.error('[DB] 관리자 쿠폰 액션 중 오류:', error);
    return false;
  }
};

// Export log types for external use
export { LOG_TYPES, logActivity };