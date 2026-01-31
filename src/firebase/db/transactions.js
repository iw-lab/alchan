// src/firebase/db/transactions.js - 현금/쿠폰/송금/세금 트랜잭션

import {
  doc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { invalidateCache, invalidateCachePattern } from "../firebaseUtils";
import { getUserDocument, addActivityLog, addTransaction } from "./users";
import { getClassAdminUid } from "./core";
import { getGovernmentSettings } from "./settings";
import { addItemToInventory } from "./store";
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
        activityLogMessage = `${senderInfo.name}님으로부터 ${amount}원을 받았습니다.${senderInfo.message ? ` 메시지: "${senderInfo.message}"` : ''}`;
      } else {
        logType = '송금';
        activityLogMessage = `${receiverInfo.name}님에게 ${Math.abs(amount)}원을 송금했습니다.${senderInfo.message ? ` 메시지: "${senderInfo.message}"` : ''}`;
      }
    } else if (senderInfo && amount > 0) {
      logType = '현금 입금';
      if (senderInfo.isAdmin) {
        activityLogMessage = `관리자 ${senderInfo.name}가 ${amount}원을 입금했습니다.${senderInfo.reason ? ` 사유: ${senderInfo.reason}` : ''}`;
      } else {
        activityLogMessage = `${senderInfo.name || '시스템'}에서 ${amount}원을 입금받았습니다.`;
      }
    } else if (receiverInfo && amount < 0) {
      logType = '현금 출금';
      if (receiverInfo.isAdmin) {
        activityLogMessage = `관리자 ${receiverInfo.name}가 ${Math.abs(amount)}원을 출금했습니다.${receiverInfo.reason ? ` 사유: ${receiverInfo.reason}` : ''}`;
      } else {
        activityLogMessage = `${receiverInfo.name || '외부'}로 ${Math.abs(amount)}원을 출금했습니다.`;
      }
    } else if (logMessage) {
      activityLogMessage = logMessage;
    } else {
      activityLogMessage = `${Math.abs(amount)}원 ${amount > 0 ? '입금' : '출금'} 완료.`;
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

// =================================================================
// 송금
// =================================================================
export const transferCash = async (senderId, receiverId, amount, message = '', allowNegative = false) => {
  if (!senderId || !receiverId || amount <= 0) {
    throw new Error('유효하지 않은 송금 정보입니다.');
  }
  const senderRef = doc(db, "users", senderId);
  const receiverRef = doc(db, "users", receiverId);
  try {
    await runTransaction(db, async (transaction) => {
      const [senderSnap, receiverSnap] = await Promise.all([
        transaction.get(senderRef),
        transaction.get(receiverRef)
      ]);
      if (!senderSnap.exists()) throw new Error('송금자를 찾을 수 없습니다.');
      if (!receiverSnap.exists()) throw new Error('수신자를 찾을 수 없습니다.');
      const senderData = senderSnap.data();
      if (!allowNegative && (senderData.cash || 0) < amount) {
        throw new Error('잔액이 부족합니다.');
      }
      transaction.update(senderRef, { cash: increment(-amount), updatedAt: serverTimestamp() });
      transaction.update(receiverRef, { cash: increment(amount), updatedAt: serverTimestamp() });
    });

    const senderDoc = await getUserDocument(senderId, true);
    const receiverDoc = await getUserDocument(receiverId, true);
    const senderName = senderDoc?.name || '알 수 없는 사용자';
    const receiverName = receiverDoc?.name || '알 수 없는 사용자';
    const senderLogMessage = `${receiverName}님에게 ${amount}원을 송금했습니다.${message ? ` 메시지: ''${message}''` : ''}`;
    const receiverLogMessage = `${senderName}님으로부터 ${amount}원을 받았습니다.${message ? ` 메시지: ''${message}''` : ''}`;

    await Promise.all([
      addActivityLog(senderId, '송금', senderLogMessage),
      addTransaction(senderId, -amount, `송금: ${receiverName}에게`),
      addActivityLog(receiverId, '송금 수신', receiverLogMessage),
      addTransaction(receiverId, amount, `송금 수신: ${senderName}으로부터`)
    ]);

    invalidateCache(`user_${senderId}`);
    invalidateCache(`user_${receiverId}`);
    return { success: true, amount };
  } catch (error) {
    logger.error('현금 전송 트랜잭션 실패:', error);
    throw error;
  }
};

// =================================================================
// 벌금/관리자 입출금
// =================================================================
export const processFineTransaction = async (userId, classCode, amount, reason) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId || !classCode || amount <= 0) {
    throw new Error("벌금 처리를 위한 정보가 유효하지 않습니다.");
  }
  const userRef = doc(db, "users", userId);
  const treasuryRef = doc(db, "nationalTreasuries", classCode);
  try {
    await runTransaction(db, async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const treasurySnap = await transaction.get(treasuryRef);
      if (!userSnap.exists()) throw new Error("피신고자 정보 없음");
      transaction.update(userRef, { cash: increment(-amount) });
      if (treasurySnap.exists()) {
        transaction.update(treasuryRef, {
          totalAmount: increment(amount),
          otherTaxRevenue: increment(amount),
          lastUpdated: serverTimestamp()
        });
      } else {
        transaction.set(treasuryRef, {
          totalAmount: amount,
          stockTaxRevenue: 0,
          stockCommissionRevenue: 0,
          realEstateTransactionTaxRevenue: 0,
          realEstateAnnualTaxRevenue: 0,
          incomeTaxRevenue: 0,
          corporateTaxRevenue: 0,
          otherTaxRevenue: amount,
          classCode: classCode,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });
      }
    });
    invalidateCache(`user_${userId}`);
    Promise.all([
      addActivityLog(userId, '벌금 납부', reason),
      addTransaction(userId, -amount, reason)
    ]).catch(err => logger.error('[Police] 로그 기록 실패 (무시됨):', err));
    return { success: true };
  } catch (error) {
    logger.error("[Police] 벌금 처리 트랜잭션 실패:", error);
    throw error;
  }
};

export const adminDepositCash = async (adminId, targetUserId, amount, reason = '') => {
  try {
    const adminDoc = await getUserDocument(adminId);
    const adminName = adminDoc?.name || '관리자';
    await updateUserCashInFirestore(targetUserId, amount, '', { name: adminName, isAdmin: true, reason }, null);
    return { success: true, amount };
  } catch (error) {
    logger.error('관리자 입금 실패:', error);
    throw error;
  }
};

export const adminWithdrawCash = async (adminId, targetUserId, amount, reason = '') => {
  try {
    const adminDoc = await getUserDocument(adminId);
    const adminName = adminDoc?.name || '관리자';
    await updateUserCashInFirestore(targetUserId, -Math.abs(amount), '', null, { name: adminName, isAdmin: true, reason });
    return { success: true, amount: Math.abs(amount) };
  } catch (error) {
    logger.error('관리자 출금 실패:', error);
    throw error;
  }
};

// =================================================================
// 주식/세금 트랜잭션
// =================================================================
export const processStockSaleTransaction = async (userId, classCode, profit, stockName) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (profit <= 0) return { success: true, taxAmount: 0 };
  try {
    const governmentSettings = await getGovernmentSettings(classCode);
    const taxRate = governmentSettings?.taxSettings?.stockTransactionTaxRate || 0;
    const taxAmount = Math.round(profit * taxRate);
    if (taxAmount > 0) {
      const adminUid = await getClassAdminUid(classCode);
      if (adminUid) {
        const adminRef = doc(db, "users", adminUid);
        await updateDoc(adminRef, { cash: increment(taxAmount) });
        invalidateCache(`user_${adminUid}`);
      }
      const logDescription = `${stockName} 주식 판매로 발생한 이익 ${profit}원에 대한 거래세 ${taxAmount}원을 납부했습니다.`;
      await addActivityLog(userId, '세금 납부 (주식)', logDescription);
    }
    return { success: true, taxAmount };
  } catch (error) {
    logger.error(`[firebase.js] 주식 거래세 처리 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

export const processGenericSaleTransaction = async (classCode, buyerId, sellerId, transactionPrice, taxType, inventoryUpdate = null) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  invalidateCache(`user_${buyerId}`);
  invalidateCache(`user_${sellerId}`);
  const adminUid = await getClassAdminUid(classCode);
  if (adminUid) invalidateCache(`user_${adminUid}`);

  const buyerRef = doc(db, "users", buyerId);
  const sellerRef = doc(db, "users", sellerId);
  const adminRef = adminUid ? doc(db, "users", adminUid) : null;

  try {
    let taxAmount = 0;
    let sellerProceeds = 0;
    let buyerName = "알수없음";
    let sellerName = "알수없음";

    await runTransaction(db, async (transaction) => {
      const [governmentSettings, buyerSnap, sellerSnap] = await Promise.all([
        getGovernmentSettings(classCode),
        transaction.get(buyerRef),
        transaction.get(sellerRef)
      ]);
      if (!buyerSnap.exists() || !sellerSnap.exists()) {
        throw new Error("구매자 또는 판매자 정보를 찾을 수 없습니다.");
      }
      buyerName = buyerSnap.data().name || "알수없음";
      sellerName = sellerSnap.data().name || "알수없음";
      const taxSettings = governmentSettings ? governmentSettings.taxSettings : {};
      let taxRate = 0;
      switch (taxType) {
        case "realEstate": taxRate = taxSettings?.realEstateTransactionTaxRate || 0; break;
        case "auction": taxRate = taxSettings?.auctionTransactionTaxRate || 0; break;
        case "itemMarket": taxRate = taxSettings?.itemMarketTransactionTaxRate || 0; break;
        default: throw new Error("유효하지 않은 세금 종류입니다.");
      }
      taxAmount = Math.round(transactionPrice * taxRate);
      sellerProceeds = transactionPrice - taxAmount;
      if ((buyerSnap.data().cash || 0) < transactionPrice) {
        throw new Error("구매자의 현금이 부족합니다.");
      }
      transaction.update(buyerRef, { cash: increment(-transactionPrice) });
      transaction.update(sellerRef, { cash: increment(sellerProceeds) });
      if (taxAmount > 0 && adminRef) {
        transaction.update(adminRef, { cash: increment(taxAmount) });
      }
      if (taxType === "itemMarket" && inventoryUpdate) {
        const sellerInventoryItemRef = doc(db, "users", sellerId, "inventory", inventoryUpdate.inventoryItemId);
        const sellerItemSnap = await transaction.get(sellerInventoryItemRef);
        if (!sellerItemSnap.exists() || sellerItemSnap.data().quantity < inventoryUpdate.quantity) {
          throw new Error("판매자의 아이템 재고가 부족합니다.");
        }
        transaction.update(sellerInventoryItemRef, { quantity: increment(-inventoryUpdate.quantity) });
      }
    });

    if (taxType === "itemMarket" && inventoryUpdate) {
      await addItemToInventory(buyerId, inventoryUpdate.originalStoreItemId, inventoryUpdate.quantity, inventoryUpdate.itemDetails);
    }

    const itemName = inventoryUpdate?.itemDetails?.name || taxType;
    const buyerLog = `[${sellerName}]님으로부터 ${itemName}을(를) ${transactionPrice}원에 구매했습니다.`;
    const sellerLog = `[${buyerName}]님에게 ${itemName}을(를) ${transactionPrice}원에 판매하여 ${sellerProceeds}원을 얻었습니다. (세금 ${taxAmount}원 제외)`;
    await Promise.all([
      addActivityLog(buyerId, '구매', buyerLog),
      addActivityLog(sellerId, '판매', sellerLog)
    ]);

    return { success: true, taxAmount };
  } catch (error) {
    logger.error(`[firebase.js] ${taxType} 거래 트랜잭션 오류:`, error);
    throw error;
  }
};

export const collectPropertyHoldingTaxes = async (classCode) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  const adminUid = await getClassAdminUid(classCode);
  try {
    const governmentSettings = await getGovernmentSettings(classCode);
    const taxRate = governmentSettings?.taxSettings?.propertyHoldingTaxRate || 0;
    if (taxRate === 0) {
      return { success: true, totalCollected: 0, userCount: 0 };
    }
    const usersQuery = originalFirebaseQuery(
      collection(db, "users"),
      originalFirebaseWhere("classCode", "==", classCode)
    );
    const usersSnapshot = await getDocs(usersQuery);
    const batch = writeBatch(db);
    let totalTaxCollected = 0;
    let processedUserCount = 0;
    const logPromises = [];
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userRef = doc(db, "users", userId);
      let userTotalTax = 0;
      let totalPropertyValue = 0;
      const propertiesRef = collection(db, "users", userId, "properties");
      const propertiesSnapshot = await getDocs(propertiesRef);
      if (propertiesSnapshot.empty) continue;
      propertiesSnapshot.forEach((propDoc) => {
        const propertyValue = propDoc.data().value || 0;
        totalPropertyValue += propertyValue;
        userTotalTax += Math.round(propertyValue * taxRate);
      });
      if (userTotalTax > 0) {
        invalidateCache(`user_${userId}`);
        batch.update(userRef, { cash: increment(-userTotalTax) });
        totalTaxCollected += userTotalTax;
        processedUserCount++;
        const logDescription = `소유 부동산 (총 가치 ${totalPropertyValue}원)에 대한 보유세 ${userTotalTax}원이 징수되었습니다.`;
        logPromises.push(addActivityLog(userId, '세금 납부 (보유세)', logDescription));
      }
    }
    if (totalTaxCollected > 0 && adminUid) {
      const adminRef = doc(db, "users", adminUid);
      invalidateCache(`user_${adminUid}`);
      batch.update(adminRef, { cash: increment(totalTaxCollected) });
    }
    await batch.commit();
    await Promise.all(logPromises);
    return { success: true, totalCollected: totalTaxCollected, userCount: processedUserCount };
  } catch (error) {
    logger.error(`[firebase.js] 부동산 보유세 징수 오류 (학급: ${classCode}):`, error);
    throw error;
  }
};

// =================================================================
// 기부/합의 기록
// =================================================================
export const addDonationRecord = async (donationData) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!donationData.userId || !donationData.classCode || !donationData.amount) {
    throw new Error("기부 기록에 필수 필드(userId, classCode, amount)가 누락되었습니다.");
  }
  const { addDoc } = await import("firebase/firestore");
  try {
    const donationWithTimestamp = {
      ...donationData,
      goalId: donationData.goalId || "default_goal",
      createdAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, "donations"), donationWithTimestamp);
    return docRef;
  } catch (error) {
    logger.error("[firebase.js] 기부 기록 추가 중 오류 발생:", error);
    throw error;
  }
};

export const addSettlementRecord = async (settlementData) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!settlementData.classCode || !settlementData.reportId) {
    throw new Error("합의 기록에 필수 필드(classCode, reportId)가 누락되었습니다.");
  }
  const { addDoc } = await import("firebase/firestore");
  try {
    const settlementWithTimestamp = { ...settlementData, createdAt: serverTimestamp() };
    const docRef = await addDoc(collection(db, "settlements"), settlementWithTimestamp);
    return docRef;
  } catch (error) {
    logger.error("[firebase.js] 합의 기록 추가 중 오류 발생:", error);
    throw error;
  }
};

export const getDonationsForClass = async (classCode, goalId = "default_goal", useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const { query, where, orderBy, getDocs: getDocsImport } = await import("firebase/firestore");
  const { getCache: getCacheImport, setCache: setCacheImport } = await import("../firebaseUtils");

  const cacheKey = `donations_${classCode}_${goalId}`;
  if (useCache) {
    const cached = getCacheImport(cacheKey);
    if (cached) {
      return cached;
    }
  }
  try {
    const donationsRef = collection(db, "donations");
    const q = query(
      donationsRef,
      where("classCode", "==", classCode),
      where("goalId", "==", goalId),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocsImport(q);
    const donations = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (useCache) setCacheImport(cacheKey, donations);
    return donations;
  } catch (error) {
    logger.error(`[firebase.js] 학급(${classCode}) 기부 내역 조회 중 오류 발생:`, error);
    throw error;
  }
};
