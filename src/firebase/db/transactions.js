// src/firebase/db/transactions.js - 현금/쿠폰/송금/세금 트랜잭션

import { getCurrencyUnit } from "../../utils/numberFormatter";
import { doc, serverTimestamp, increment, runTransaction } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { addActivityLog } from "./users";
import { logger } from '../../utils/logger';

// =================================================================
// 현금/쿠폰 트랜잭션
// =================================================================
export const updateUserCashInFirestore = async (userId, amount, logMessage = '', senderInfo = null, receiverInfo = null, allowNegative = false) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("[firebase.js] 사용자 ID가 유효하지 않습니다.");
  if (typeof amount !== "number")
    throw new Error("[firebase.js] 현금 변경액은 숫자여야 합니다.");

  const userRef = doc(db, "users", userId);
  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`[firebase.js] 사용자 문서(ID: ${userId})를 찾을 수 없습니다.`);
      }
      const currentCash = userSnap.data().cash || 0;
      if (!allowNegative && amount < 0 && currentCash + amount < 0) {
        throw new Error(`[firebase.js] 잔액이 부족합니다. (현재: ${currentCash}, 변경 요청: ${amount})`);
      }
      transaction.update(userRef, { cash: increment(amount), updatedAt: serverTimestamp() });
    });

    let activityLogMessage = logMessage;
    let logType = amount > 0 ? '현금 입금' : '현금 출금';
    if (senderInfo && receiverInfo) {
      if (amount > 0) {
        logType = '송금 수신';
        activityLogMessage = `${senderInfo.name}님으로부터 ${amount}${getCurrencyUnit()}을 받았습니다.${senderInfo.message ? ` 메시지: "${senderInfo.message}"` : ''}`;
      } else {
        logType = '송금';
        activityLogMessage = `${receiverInfo.name}님에게 ${Math.abs(amount)}${getCurrencyUnit()}을 송금했습니다.${senderInfo.message ? ` 메시지: "${senderInfo.message}"` : ''}`;
      }
    } else if (senderInfo && amount > 0) {
      logType = '현금 입금';
      if (senderInfo.isAdmin) {
        activityLogMessage = `관리자 ${senderInfo.name}가 ${amount}${getCurrencyUnit()}을 입금했습니다.${senderInfo.reason ? ` 사유: ${senderInfo.reason}` : ''}`;
      } else {
        activityLogMessage = `${senderInfo.name || '시스템'}에서 ${amount}${getCurrencyUnit()}을 입금받았습니다.`;
      }
    } else if (receiverInfo && amount < 0) {
      logType = '현금 출금';
      if (receiverInfo.isAdmin) {
        activityLogMessage = `관리자 ${receiverInfo.name}가 ${Math.abs(amount)}${getCurrencyUnit()}을 출금했습니다.${receiverInfo.reason ? ` 사유: ${receiverInfo.reason}` : ''}`;
      } else {
        activityLogMessage = `${receiverInfo.name || '외부'}로 ${Math.abs(amount)}${getCurrencyUnit()}을 출금했습니다.`;
      }
    } else if (logMessage) {
      activityLogMessage = logMessage;
    } else {
      activityLogMessage = `${Math.abs(amount)}${getCurrencyUnit()} ${amount > 0 ? '입금' : '출금'} 완료.`;
    }

    addActivityLog(userId, logType, activityLogMessage).catch(err =>
      logger.error('[firebase.js] Activity Log 기록 실패 (무시됨):', err)
    );

    return true;
  } catch (error) {
    logger.error(`[firebase.js] 사용자 ${userId} 현금 업데이트 트랜잭션 오류:`, error);
    return false;
  }
};

export const updateUserCouponsInFirestore = async (userId, amount, logMessage) => {
  if (!db) throw new Error("[firebase.js] Firestore가 초기화되지 않았습니다.");
  if (!userId) throw new Error("[firebase.js] 사용자 ID가 유효하지 않습니다.");
  if (typeof amount !== "number") throw new Error("[firebase.js] 쿠폰 변경액은 숫자여야 합니다.");

  const userRef = doc(db, "users", userId);
  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error(`[firebase.js] 사용자 문서(ID: ${userId})를 찾을 수 없습니다.`);
      }
      const currentCoupons = userSnap.data().coupons || 0;
      if (amount < 0 && currentCoupons + amount < 0) {
        throw new Error(`[firebase.js] 쿠폰이 부족합니다. (현재: ${currentCoupons}, 변경 요청: ${amount})`);
      }
      transaction.update(userRef, { coupons: increment(amount), updatedAt: serverTimestamp() });
    });

    const logType = amount > 0 ? '획득' : '사용';
    const defaultMessage = `쿠폰 ${Math.abs(amount)}개 ${logType}.`;
    await addActivityLog(userId, `쿠폰 ${logType}`, logMessage || defaultMessage);

    return true;
  } catch (error) {
    logger.error(`[firebase.js] 사용자 ${userId} 쿠폰 업데이트 트랜잭션 오류:`, error);
    return false;
  }
};


