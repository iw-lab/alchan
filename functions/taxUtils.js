/* eslint-disable */
// functions/taxUtils.js
const admin = require("firebase-admin");
const {logger} = require("firebase-functions/v2");

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
const getTaxSettings = async (db, classCode) => {
  try {
    const taxDoc = await db.collection("taxSettings").doc(classCode).get();
    if (taxDoc.exists) {
      return {...DEFAULT_TAX_SETTINGS, ...taxDoc.data()};
    }
    return DEFAULT_TAX_SETTINGS;
  } catch (error) {
    logger.error("세금 설정 가져오기 실패:", error);
    return DEFAULT_TAX_SETTINGS;
  }
};

// 국고에 세금 추가
const addTaxToTreasury = async (
    db, classCode, taxType, amount, description, transaction,
) => {
  try {
    const treasuryRef = db.collection("treasury").doc(classCode);

    const revenueUpdate = {
      totalAmount: admin.firestore.FieldValue.increment(amount),
      [`${taxType}Revenue`]: admin.firestore.FieldValue.increment(amount),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (transaction) {
      // 트랜잭션 내에서 실행
      transaction.update(treasuryRef, revenueUpdate);
    } else {
      // 독립적으로 실행
      const batch = db.batch();
      batch.update(treasuryRef, revenueUpdate);

      // 세금 납부 기록 추가
      const taxRecordRef = db.collection("taxRecords").doc();
      batch.set(taxRecordRef, {
        classCode,
        type: taxType,
        amount,
        description,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
    }

    logger.info(`[Tax] ${taxType}: ${amount}원이 국고에 추가되었습니다.`);
    return true;
  } catch (error) {
    logger.error("국고 세금 추가 실패:", error);
    return false;
  }
};

// 아이템 거래세 계산 및 적용
const applyItemTax = async (
    db, classCode, userId, amount, isMarketPlace = false, transaction = null,
) => {
  try {
    const taxSettings = await getTaxSettings(db, classCode);
    const taxRate = isMarketPlace ?
      (taxSettings.itemMarketTransactionTaxRate || 0.03) :
      (taxSettings.itemStoreVATRate || 0.1);

    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      const taxType = isMarketPlace ? "itemMarket" : "itemStore";
      await addTaxToTreasury(
          db,
          classCode,
          taxType,
          taxAmount,
          `아이템 ${isMarketPlace ? "마켓플레이스" : "상점"} 거래세: ${amount}원`,
          transaction,
      );

      logger.info(
          `[Tax] 아이템 거래세 ${taxAmount}원 적용 (사용자: ${userId}, 금액: ${amount}원)`,
      );
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount,
    };
  } catch (error) {
    logger.error("아이템 거래세 적용 실패:", error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount,
    };
  }
};

// 주식 거래세 계산 및 적용
const applyStockTax = async (
    db, classCode, userId, amount, transactionType, transaction = null,
) => {
  try {
    const taxSettings = await getTaxSettings(db, classCode);
    const taxRate = taxSettings.stockTransactionTaxRate || 0.01;
    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(
          db,
          classCode,
          "stock",
          taxAmount,
          `주식 ${transactionType} 거래세: ${amount}원`,
          transaction,
      );

      logger.info(
          `[Tax] 주식 거래세 ${taxAmount}원 적용 (사용자: ${userId}, 금액: ${amount}원)`,
      );
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount,
    };
  } catch (error) {
    logger.error("주식 거래세 적용 실패:", error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount,
    };
  }
};

// 거래세 계산 및 적용
const applyTransactionTax = async (
    db, classCode, userId, amount, transactionType, transaction = null,
) => {
  try {
    const taxSettings = await getTaxSettings(db, classCode);
    const taxRate = taxSettings.transactionTaxRate || 0.005;
    const taxAmount = Math.floor(amount * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(
          db,
          classCode,
          "transaction",
          taxAmount,
          `${transactionType} 거래세: ${amount}원 거래`,
          transaction,
      );

      logger.info(
          `[Tax] 거래세 ${taxAmount}원 적용 (사용자: ${userId}, 금액: ${amount}원)`,
      );
    }

    return {
      originalAmount: amount,
      taxAmount,
      netAmount: amount - taxAmount,
    };
  } catch (error) {
    logger.error("거래세 적용 실패:", error);
    return {
      originalAmount: amount,
      taxAmount: 0,
      netAmount: amount,
    };
  }
};

// 소득세 계산 및 적용
const applyIncomeTax = async (
    db, classCode, userId, income, incomeType, transaction = null,
) => {
  try {
    const taxSettings = await getTaxSettings(db, classCode);
    let taxRate;

    switch (incomeType) {
      case "salary":
        taxRate = taxSettings.salaryTaxRate || 0.1;
        break;
      case "reward":
        taxRate = taxSettings.rewardTaxRate || 0.05;
        break;
      default:
        taxRate = taxSettings.incomeTaxRate || 0.15;
    }

    const taxAmount = Math.floor(income * taxRate);

    if (taxAmount > 0) {
      await addTaxToTreasury(
          db,
          classCode,
          "income",
          taxAmount,
          `${incomeType} 소득세: ${income}원 소득`,
          transaction,
      );

      logger.info(
          `[Tax] 소득세 ${taxAmount}원 적용 (사용자: ${userId}, 소득: ${income}원)`,
      );
    }

    return {
      grossIncome: income,
      taxAmount,
      netIncome: income - taxAmount,
    };
  } catch (error) {
    logger.error("소득세 적용 실패:", error);
    return {
      grossIncome: income,
      taxAmount: 0,
      netIncome: income,
    };
  }
};

module.exports = {
  getTaxSettings,
  addTaxToTreasury,
  applyItemTax,
  applyStockTax,
  applyTransactionTax,
  applyIncomeTax,
};
