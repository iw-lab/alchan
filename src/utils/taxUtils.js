// src/utils/taxUtils.js
import { db } from '../firebase';
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  writeBatch,
  collection
} from 'firebase/firestore';
import { addActivityLog } from '../firebase';

// 기본 세금 설정
const DEFAULT_TAX_SETTINGS = {
  stockTransactionTaxRate: 0.01, // 주식 거래세율 (1%)
  realEstateTransactionTaxRate: 0.03, // 부동산 거래세율 (3%)
  itemStoreVATRate: 0.1, // 아이템 상점 부가가치세율 (10%)
  auctionTransactionTaxRate: 0.03, // 경매장 거래세율 (3%)
  propertyHoldingTaxRate: 0.002, // 부동산 보유세율 (0.2%)
  itemMarketTransactionTaxRate: 0.03, // 아이템 시장 거래세율 (3%)
  incomeTaxRate: 0.15, // 소득세율 (15%)
  transactionTaxRate: 0.005, // 송금/이체 거래세율 (0.5%)
  salaryTaxRate: 0.1, // 급여 소득세율 (10%)
  rewardTaxRate: 0.05, // 보상 소득세율 (5%)
};

// 세금 설정 가져오기
export const getTaxSettings = async (classCode) => {
  try {
    const taxDoc = await getDoc(doc(db, 'taxSettings', classCode));
    if (taxDoc.exists()) {
      return { ...DEFAULT_TAX_SETTINGS, ...taxDoc.data() };
    }
    return DEFAULT_TAX_SETTINGS;
  } catch (error) {
    console.error('세금 설정 가져오기 실패:', error);
    return DEFAULT_TAX_SETTINGS;
  }
};

// 국고에 세금 추가
export const addTaxToTreasury = async (classCode, taxType, amount, description) => {
  try {
    const treasuryRef = doc(db, 'treasury', classCode);
    const batch = writeBatch(db);

    // 🔥 [수정] update 대신 set with merge를 사용 (문서가 없을 때 자동 생성)
    batch.set(treasuryRef, {
      totalAmount: increment(amount),
      [`${taxType}Revenue`]: increment(amount),
      lastUpdated: serverTimestamp()
    }, { merge: true });

    // 세금 납부 기록 추가
    const taxRecordRef = doc(collection(db, 'taxRecords'));
    batch.set(taxRecordRef, {
      classCode,
      type: taxType,
      amount,
      description,
      timestamp: serverTimestamp()
    });

    await batch.commit();
    console.log(`[Tax] ${taxType}: ${amount}원이 국고에 추가되었습니다.`);
    return true;
  } catch (error) {
    console.error('국고 세금 추가 실패:', error);
    return false;
  }
};

// 거래세 계산 및 적용
export const applyTransactionTax = async (classCode, userId, amount, transactionType) => {
  try {
    const taxSettings = await getTaxSettings(classCode);
    const taxRate = taxSettings.transactionTaxRate || 0.005;
    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(classCode, 'transaction', taxAmount,
        `${transactionType} 거래세: ${amount.toLocaleString()}원 거래`);

      // 활동 로그 추가
      if (userId) {
        await addActivityLog(userId, 'TAX_PAYMENT',
          `거래세 ${taxAmount.toLocaleString()}원을 납부했습니다.`, {
            taxType: 'transaction',
            originalAmount: amount,
            taxRate: taxRate,
            taxAmount: taxAmount,
            transactionType
          });
      }
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount
    };
  } catch (error) {
    console.error('거래세 적용 실패:', error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount
    };
  }
};

// 소득세 계산 및 적용
export const applyIncomeTax = async (classCode, userId, income, incomeType) => {
  try {
    const taxSettings = await getTaxSettings(classCode);
    let taxRate;

    switch (incomeType) {
      case 'salary':
        taxRate = taxSettings.salaryTaxRate || 0.1;
        break;
      case 'reward':
        taxRate = taxSettings.rewardTaxRate || 0.05;
        break;
      default:
        taxRate = taxSettings.incomeTaxRate || 0.15;
    }

    const taxAmount = Math.floor(income * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(classCode, 'income', taxAmount,
        `${incomeType} 소득세: ${income.toLocaleString()}원 소득`);

      // 활동 로그 추가
      if (userId) {
        await addActivityLog(userId, 'TAX_PAYMENT',
          `소득세 ${taxAmount.toLocaleString()}원을 납부했습니다.`, {
            taxType: 'income',
            originalIncome: income,
            taxRate: taxRate,
            taxAmount: taxAmount,
            incomeType
          });
      }
    }

    return {
      grossIncome: income,
      taxAmount,
      netIncome: income - taxAmount
    };
  } catch (error) {
    console.error('소득세 적용 실패:', error);
    return {
      grossIncome: income,
      taxAmount: 0,
      netIncome: income
    };
  }
};

// 아이템 거래세 계산만 (동기 함수)
export const calculateItemTax = (amount, isMarketPlace = false) => {
  const taxRate = isMarketPlace ? 0.03 : 0.1; // 기본값 사용
  const taxAmount = Math.floor(amount * taxRate);
  return taxAmount;
};

// 아이템 거래세 계산 및 적용 (기존 함수 유지)
export const applyItemTax = async (classCode, userId, amount, isMarketPlace = false) => {
  try {
    const taxSettings = await getTaxSettings(classCode);
    const taxRate = isMarketPlace
      ? (taxSettings.itemMarketTransactionTaxRate || 0.03)
      : (taxSettings.itemStoreVATRate || 0.1);

    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      const taxType = isMarketPlace ? 'itemMarket' : 'itemStore';
      await addTaxToTreasury(classCode, taxType, taxAmount,
        `아이템 ${isMarketPlace ? '마켓플레이스' : '상점'} 거래세: ${amount.toLocaleString()}원`);

      // 활동 로그 추가
      if (userId) {
        await addActivityLog(userId, 'TAX_PAYMENT',
          `아이템 거래세 ${taxAmount.toLocaleString()}원을 납부했습니다.`, {
            taxType: taxType,
            originalAmount: amount,
            taxRate: taxRate,
            taxAmount: taxAmount,
            isMarketPlace
          });
      }
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount
    };
  } catch (error) {
    console.error('아이템 거래세 적용 실패:', error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount
    };
  }
};

// 주식 거래세 계산 및 적용
export const applyStockTax = async (classCode, userId, amount, transactionType) => {
  try {
    const taxSettings = await getTaxSettings(classCode);
    const taxRate = taxSettings.stockTransactionTaxRate || 0.01;
    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(classCode, 'stock', taxAmount,
        `주식 ${transactionType} 거래세: ${amount.toLocaleString()}원`);

      // 활동 로그 추가
      if (userId) {
        await addActivityLog(userId, 'TAX_PAYMENT',
          `주식 거래세 ${taxAmount.toLocaleString()}원을 납부했습니다.`, {
            taxType: 'stock',
            originalAmount: amount,
            taxRate: taxRate,
            taxAmount: taxAmount,
            transactionType
          });
      }
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount
    };
  } catch (error) {
    console.error('주식 거래세 적용 실패:', error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount
    };
  }
};

// 부동산 거래세 계산 및 적용
export const applyRealEstateTax = async (classCode, userId, amount, transactionType) => {
  try {
    const taxSettings = await getTaxSettings(classCode);
    const taxRate = taxSettings.realEstateTransactionTaxRate || 0.03;
    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(classCode, 'realEstateTransaction', taxAmount,
        `부동산 ${transactionType} 거래세: ${amount.toLocaleString()}원`);

      // 활동 로그 추가
      if (userId) {
        await addActivityLog(userId, 'TAX_PAYMENT',
          `부동산 거래세 ${taxAmount.toLocaleString()}원을 납부했습니다.`, {
            taxType: 'realEstate',
            originalAmount: amount,
            taxRate: taxRate,
            taxAmount: taxAmount,
            transactionType
          });
      }
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount
    };
  } catch (error) {
    console.error('부동산 거래세 적용 실패:', error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount
    };
  }
};

// 사용자의 현금에서 세금 차감
export const deductTaxFromUser = async (userId, taxAmount, description) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      cash: increment(-taxAmount),
      updatedAt: serverTimestamp()
    });

    console.log(`[Tax] 사용자 ${userId}에게서 세금 ${taxAmount}원 차감됨`);
    return true;
  } catch (error) {
    console.error('사용자 세금 차감 실패:', error);
    return false;
  }
};

export default {
  getTaxSettings,
  addTaxToTreasury,
  applyTransactionTax,
  applyIncomeTax,
  calculateItemTax,
  applyItemTax,
  applyStockTax,
  applyRealEstateTax,
  deductTaxFromUser
};