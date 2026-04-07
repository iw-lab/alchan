/* eslint-disable */
/**
 * 경제 이벤트 시스템 - 랜덤 경제 이벤트 실행 로직
 * 평일 오후 1시(기본값) 에 랜덤으로 경제 이벤트가 발생합니다.
 */

const { db, admin, logger } = require("./utils");

// 기본 이벤트 템플릿 (학급별로 커스터마이즈 가능)
const DEFAULT_EVENT_TEMPLATES = [
  // ── 부동산 ──
  {
    id: "real_estate_up_20",
    type: "REAL_ESTATE_PRICE_CHANGE",
    title: "부동산 호황!",
    description: "경기 회복으로 부동산 전체 가격이 20% 상승했습니다!",
    params: { changePercent: 20 },
    emoji: "🏠📈",
    enabled: true,
  },
  {
    id: "real_estate_down_15",
    type: "REAL_ESTATE_PRICE_CHANGE",
    title: "부동산 불황!",
    description: "경기 침체로 부동산 전체 가격이 15% 하락했습니다!",
    params: { changePercent: -15 },
    emoji: "🏠📉",
    enabled: true,
  },
  // ── 세금 ──
  {
    id: "tax_refund",
    type: "TAX_REFUND",
    title: "세금 환급의 날!",
    description: "정부가 국고 재원으로 모든 시민에게 세금을 환급합니다!",
    params: { refundRate: 0.3 },
    emoji: "💰✨",
    enabled: true,
  },
  {
    id: "tax_extra",
    type: "TAX_EXTRA",
    title: "긴급 세금 추징!",
    description: "정부가 국가 재정을 위해 추가 세금을 부과합니다! (현금의 3%)",
    params: { taxRate: 0.03 },
    emoji: "💸😱",
    enabled: true,
  },
  // ── 현금 지급/차감 ──
  {
    id: "cash_bonus",
    type: "CASH_BONUS",
    title: "정부 지원금 지급!",
    description: "정부가 경제 활성화를 위해 모든 시민에게 지원금을 지급합니다!",
    params: { amount: 50000 },
    emoji: "🎁💵",
    enabled: true,
  },
  {
    id: "cash_penalty",
    type: "CASH_PENALTY",
    title: "경제 위기 긴급 부담금!",
    description: "경제 위기로 인해 모든 시민의 현금이 5% 삭감됩니다!",
    params: { penaltyRate: 0.05 },
    emoji: "📉💔",
    enabled: true,
  },
  // ── 상점 물가 ──
  {
    id: "store_price_up",
    type: "STORE_PRICE_CHANGE",
    title: "물가 폭등!",
    description:
      "인플레이션으로 관리자 상점의 모든 상품 가격이 2배로 올랐습니다!",
    params: { multiplier: 2 },
    emoji: "🛒📈",
    enabled: true,
  },
  {
    id: "store_price_down",
    type: "STORE_PRICE_CHANGE",
    title: "물가 대폭 안정!",
    description:
      "정부 물가 안정 정책으로 관리자 상점의 모든 상품 가격이 절반으로 내렸습니다!",
    params: { multiplier: 0.5 },
    emoji: "🛒📉",
    enabled: true,
  },
  // ── 주식 세금 (24시간) ──
  {
    id: "stock_tax_exempt",
    type: "STOCK_TAX_CHANGE",
    title: "주식 거래세 24시간 면제!",
    description: "오늘 하루 주식 거래세·양도세가 모두 면제됩니다! 지금이 기회!",
    params: { multiplier: 0 },
    emoji: "📊🎉",
    enabled: true,
  },
  {
    id: "stock_tax_double",
    type: "STOCK_TAX_CHANGE",
    title: "주식 거래세 2배 부과!",
    description: "24시간 동안 주식 거래세·양도세가 2배로 인상됩니다!",
    params: { multiplier: 2 },
    emoji: "📊💸",
    enabled: true,
  },
  // ── 개인상점 거래세 (SaaS 특화, 24시간) ──
  {
    id: "market_fee_exempt",
    type: "MARKET_FEE_CHANGE",
    title: "개인상점 거래세 면제!",
    description:
      "오늘 하루 개인상점 거래 수수료가 0%입니다! 활발하게 거래하세요!",
    params: { multiplier: 0 },
    emoji: "🏪✨",
    enabled: true,
  },
  {
    id: "market_fee_double",
    type: "MARKET_FEE_CHANGE",
    title: "개인상점 사치세 부과!",
    description: "24시간 동안 개인상점 거래 수수료가 2배로 인상됩니다!",
    params: { multiplier: 2 },
    emoji: "🏪💸",
    enabled: true,
  },
];

// ============================================================
// 주식 세금 멀티플라이어 조회 (index.js buyStock/sellStock에서 사용)
// ============================================================

/**
 * 현재 유효한 주식 세금 멀티플라이어를 반환합니다.
 * 0 = 면제, 1 = 기본, 2 = 2배
 */
async function getStockTaxMultiplier(classCode) {
  try {
    const settingsDoc = await db
      .collection("economicEventSettings")
      .doc(classCode)
      .get();
    if (!settingsDoc.exists) return 1;
    const data = settingsDoc.data();
    if (
      data.stockTaxMultiplier === undefined ||
      data.stockTaxMultiplier === null
    )
      return 1;
    const expires = data.stockTaxExpiresAt?.toDate?.();
    if (expires && expires < new Date()) return 1; // 만료됨
    return data.stockTaxMultiplier;
  } catch {
    return 1; // 에러 시 기본값 (세금 정상 적용)
  }
}

// ============================================================
// 이벤트 실행 함수들
// ============================================================

/**
 * 부동산 가격 변경 이벤트
 */
async function executeRealEstatePriceChange(classCode, params) {
  const { changePercent } = params;
  const multiplier = 1 + changePercent / 100;

  const propertiesSnapshot = await db
    .collection("classes")
    .doc(classCode)
    .collection("realEstateProperties")
    .get();

  if (propertiesSnapshot.empty) {
    logger.info(`[경제이벤트] ${classCode}: 부동산이 없음 - 건너뜀`);
    return { affectedCount: 0 };
  }

  let affectedCount = 0;
  const docs = propertiesSnapshot.docs;
  const batchSize = 400;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);

    chunk.forEach((propDoc) => {
      const data = propDoc.data();
      const currentPrice = data.price || 0;
      const newPrice = Math.max(1000, Math.round(currentPrice * multiplier));

      const update = {
        price: newPrice,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (data.salePrice) {
        update.salePrice = Math.max(
          1000,
          Math.round(data.salePrice * multiplier),
        );
      }
      if (data.rent) {
        update.rent = Math.max(100, Math.round(data.rent * multiplier));
      }

      batch.update(propDoc.ref, update);
      affectedCount++;
    });

    await batch.commit();
  }

  // 기본 설정 가격도 업데이트
  try {
    const settingsRef = db
      .collection("classes")
      .doc(classCode)
      .collection("realEstateSettings")
      .doc("settingsDoc");

    const settingsDoc = await settingsRef.get();
    if (settingsDoc.exists) {
      const currentBasePrice = settingsDoc.data().basePrice || 50000000;
      await settingsRef.update({
        basePrice: Math.round(currentBasePrice * multiplier),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    logger.warn(
      `[경제이벤트] ${classCode}: 설정 업데이트 실패 (무시)`,
      err.message,
    );
  }

  logger.info(
    `[경제이벤트] ${classCode}: 부동산 ${affectedCount}개 ${changePercent > 0 ? "+" : ""}${changePercent}% 변경 완료`,
  );
  return { affectedCount };
}

/**
 * 세금 환급 이벤트 - 국고의 일부를 학생들에게 균등 분배
 */
async function executeTaxRefund(classCode, params) {
  const { refundRate = 0.3 } = params;

  // 국고 = 관리자 cash
  const adminSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", true)
    .limit(1)
    .get();

  if (adminSnapshot.empty) {
    logger.warn(`[경제이벤트] ${classCode}: 관리자 계정 없음 - 건너뜀`);
    return { affectedCount: 0, refundedAmount: 0 };
  }

  const adminDoc = adminSnapshot.docs[0];
  const treasuryAmount = adminDoc.data().cash || 0;

  if (treasuryAmount <= 0) {
    logger.info(`[경제이벤트] ${classCode}: 국고(관리자 현금)가 비어있어 환급 불가`);
    return { affectedCount: 0, refundedAmount: 0 };
  }

  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) return { affectedCount: 0, refundedAmount: 0 };

  const studentDocs = studentsSnapshot.docs.filter(
    (d) => !d.data().isSuperAdmin,
  );
  const studentCount = studentDocs.length;
  const totalRefund = Math.floor(treasuryAmount * refundRate);
  const refundPerStudent = Math.floor(totalRefund / studentCount);

  if (refundPerStudent <= 0) {
    logger.info(`[경제이벤트] ${classCode}: 1인당 환급액이 너무 적음 - 건너뜀`);
    return { affectedCount: 0, refundedAmount: 0 };
  }

  const batchSize = 400;
  let affectedCount = 0;

  for (let i = 0; i < studentDocs.length; i += batchSize) {
    const batch = db.batch();
    studentDocs.slice(i, i + batchSize).forEach((d) => {
      batch.update(d.ref, {
        cash: admin.firestore.FieldValue.increment(refundPerStudent),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      affectedCount++;
    });
    await batch.commit();
  }

  // 관리자 cash에서 환급액 차감 (국고 = 관리자 cash)
  await db
    .collection("users")
    .doc(adminDoc.id)
    .update({
      cash: admin.firestore.FieldValue.increment(-totalRefund),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  logger.info(
    `[경제이벤트] ${classCode}: 세금 환급 - ${affectedCount}명 × ${refundPerStudent.toLocaleString()}원`,
  );
  return {
    affectedCount,
    refundedAmount: totalRefund,
    perStudent: refundPerStudent,
  };
}

/**
 * 추가 세금 부과 이벤트 - 학생 현금의 일정 비율 징수
 */
async function executeTaxExtra(classCode, params) {
  const { taxRate = 0.03 } = params;

  const adminSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", true)
    .limit(1)
    .get();

  if (adminSnapshot.empty) {
    logger.warn(`[경제이벤트] ${classCode}: 관리자 계정 없음 - 건너뜀`);
    return { affectedCount: 0, collectedAmount: 0 };
  }

  const adminDoc = adminSnapshot.docs[0];

  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) return { affectedCount: 0, collectedAmount: 0 };

  let totalCollected = 0;
  const taxItems = [];

  studentsSnapshot.docs.forEach((d) => {
    if (d.data().isSuperAdmin) return;
    const cash = d.data().cash || 0;
    if (cash > 0) {
      const taxAmount = Math.floor(cash * taxRate);
      if (taxAmount > 0) {
        taxItems.push({ ref: d.ref, taxAmount });
        totalCollected += taxAmount;
      }
    }
  });

  if (taxItems.length === 0) return { affectedCount: 0, collectedAmount: 0 };

  const batchSize = 400;
  for (let i = 0; i < taxItems.length; i += batchSize) {
    const batch = db.batch();
    taxItems.slice(i, i + batchSize).forEach(({ ref, taxAmount }) => {
      batch.update(ref, {
        cash: admin.firestore.FieldValue.increment(-taxAmount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // 관리자 cash에 추가 (국고 = 관리자 cash)
  await db
    .collection("users")
    .doc(adminDoc.id)
    .update({
      cash: admin.firestore.FieldValue.increment(totalCollected),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 통계만 기록 (totalAmount 제외 - 국고=관리자cash이므로)
  await db
    .collection("nationalTreasuries")
    .doc(classCode)
    .set(
      {
        economicEventRevenue:
          admin.firestore.FieldValue.increment(totalCollected),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  logger.info(
    `[경제이벤트] ${classCode}: 세금 추징 - ${taxItems.length}명 총 ${totalCollected.toLocaleString()}원`,
  );
  return { affectedCount: taxItems.length, collectedAmount: totalCollected };
}

/**
 * 현금 보너스 지급 이벤트 - 관리자 계정에서 학생들에게 지급
 */
async function executeCashBonus(classCode, params) {
  const { amount = 50000 } = params;

  const adminSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", true)
    .limit(1)
    .get();

  if (adminSnapshot.empty) {
    logger.warn(`[경제이벤트] ${classCode}: 관리자 계정 없음 - 건너뜀`);
    return { affectedCount: 0 };
  }

  const adminDoc = adminSnapshot.docs[0];

  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) return { affectedCount: 0 };

  const studentDocs = studentsSnapshot.docs.filter(
    (d) => !d.data().isSuperAdmin,
  );
  const totalNeeded = amount * studentDocs.length;

  const batchSize = 400;
  let affectedCount = 0;

  for (let i = 0; i < studentDocs.length; i += batchSize) {
    const batch = db.batch();
    studentDocs.slice(i, i + batchSize).forEach((d) => {
      batch.update(d.ref, {
        cash: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      affectedCount++;
    });
    await batch.commit();
  }

  await db
    .collection("users")
    .doc(adminDoc.id)
    .update({
      cash: admin.firestore.FieldValue.increment(-totalNeeded),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  logger.info(
    `[경제이벤트] ${classCode}: 현금 지급 - ${affectedCount}명 × ${amount.toLocaleString()}원`,
  );
  return { affectedCount, totalAmount: totalNeeded, perStudent: amount };
}

/**
 * 현금 차감 이벤트 - 학생 현금의 일정 비율 차감 → 국고 납입
 */
async function executeCashPenalty(classCode, params) {
  const { penaltyRate = 0.05 } = params;

  // 관리자 조회 (국고 = 관리자 cash)
  const adminSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", true)
    .limit(1)
    .get();

  if (adminSnapshot.empty) {
    logger.warn(`[경제이벤트] ${classCode}: 관리자 계정 없음 - 건너뜀`);
    return { affectedCount: 0, collectedAmount: 0 };
  }

  const adminDoc = adminSnapshot.docs[0];

  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) return { affectedCount: 0, collectedAmount: 0 };

  let totalPenalty = 0;
  const penaltyItems = [];

  studentsSnapshot.docs.forEach((d) => {
    if (d.data().isSuperAdmin) return;
    const cash = d.data().cash || 0;
    if (cash > 0) {
      const penalty = Math.floor(cash * penaltyRate);
      if (penalty > 0) {
        penaltyItems.push({ ref: d.ref, penalty });
        totalPenalty += penalty;
      }
    }
  });

  if (penaltyItems.length === 0)
    return { affectedCount: 0, collectedAmount: 0 };

  const batchSize = 400;
  for (let i = 0; i < penaltyItems.length; i += batchSize) {
    const batch = db.batch();
    penaltyItems.slice(i, i + batchSize).forEach(({ ref, penalty }) => {
      batch.update(ref, {
        cash: admin.firestore.FieldValue.increment(-penalty),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }

  // 관리자 cash에 납입 (국고 = 관리자 cash)
  await db
    .collection("users")
    .doc(adminDoc.id)
    .update({
      cash: admin.firestore.FieldValue.increment(totalPenalty),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 통계만 기록
  await db
    .collection("nationalTreasuries")
    .doc(classCode)
    .set(
      {
        economicEventRevenue:
          admin.firestore.FieldValue.increment(totalPenalty),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  logger.info(
    `[경제이벤트] ${classCode}: 현금 차감 - ${penaltyItems.length}명 총 ${totalPenalty.toLocaleString()}원 → 관리자(국고)`,
  );
  return { affectedCount: penaltyItems.length, collectedAmount: totalPenalty };
}

/**
 * 상점 물가 변경 이벤트 - 관리자 상점 아이템 가격 일괄 변경
 */
async function executeStorePriceChange(classCode, params) {
  const { multiplier = 1 } = params; // 2 = 2배, 0.5 = 절반

  const itemsSnapshot = await db
    .collection("storeItems")
    .where("classCode", "==", classCode)
    .get();

  if (itemsSnapshot.empty) {
    logger.info(`[경제이벤트] ${classCode}: 상점 아이템 없음 - 건너뜀`);
    return { affectedCount: 0 };
  }

  let affectedCount = 0;
  const docs = itemsSnapshot.docs;
  const batchSize = 400;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach((doc) => {
      const currentPrice = doc.data().price || 0;
      if (currentPrice > 0) {
        batch.update(doc.ref, {
          price: Math.max(100, Math.round(currentPrice * multiplier)),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        affectedCount++;
      }
    });
    await batch.commit();
  }

  logger.info(
    `[경제이벤트] ${classCode}: 상점 물가 ${multiplier}배 변경 - ${affectedCount}개 아이템`,
  );
  return { affectedCount, multiplier };
}

/**
 * 주식 세금 변경 이벤트 - 24시간 동안 세금 배율 적용
 * multiplier: 0 = 면제, 1 = 기본, 2 = 2배
 */
async function executeStockTaxChange(classCode, params) {
  const { multiplier = 1 } = params;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db
    .collection("economicEventSettings")
    .doc(classCode)
    .update({
      stockTaxMultiplier: multiplier,
      stockTaxExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      updatedAt: admin.firestore.Timestamp.now(),
    });

  const label = multiplier === 0 ? "면제" : `${multiplier}배`;
  logger.info(`[경제이벤트] ${classCode}: 주식 세금 ${label} (24시간)`);
  return { multiplier, expiresAt: expiresAt.toISOString() };
}

/**
 * 개인상점 거래세 변경 이벤트 - 24시간 동안 수수료 배율 적용
 * multiplier: 0 = 면제, 2 = 2배
 */
async function executeMarketFeeChange(classCode, params) {
  const { multiplier = 1 } = params;
  const BASE_RATE = 0.03;
  const newRate = multiplier === 0 ? 0 : BASE_RATE * multiplier;

  // 기존 값 백업
  const govRef = db.collection("governmentSettings").doc(classCode);
  const govDoc = await govRef.get();
  const originalRate = govDoc.exists
    ? (govDoc.data()?.taxSettings?.itemMarketTransactionTaxRate ?? BASE_RATE)
    : BASE_RATE;

  // 새 값 설정 (buyMarketItem이 매번 이 값을 읽으므로 즉시 적용됨)
  await govRef.set(
    { taxSettings: { itemMarketTransactionTaxRate: newRate } },
    { merge: true },
  );

  // 복원 정보 저장
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db
    .collection("economicEventSettings")
    .doc(classCode)
    .update({
      marketFeeBackup: originalRate,
      marketFeeNewRate: newRate,
      marketFeeExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      updatedAt: admin.firestore.Timestamp.now(),
    });

  const label = multiplier === 0 ? "면제" : `${multiplier}배`;
  logger.info(
    `[경제이벤트] ${classCode}: 개인상점 거래세 ${label} (24시간, ${originalRate * 100}% → ${newRate * 100}%)`,
  );
  return { originalRate, newRate, expiresAt: expiresAt.toISOString() };
}

/**
 * 만료된 시간제한 이벤트 오버라이드 복원 (스케줄러 매 시간 호출)
 */
async function restoreExpiredOverrides(classCode) {
  const settingsDoc = await db
    .collection("economicEventSettings")
    .doc(classCode)
    .get();
  if (!settingsDoc.exists) return;

  const settings = settingsDoc.data();
  const now = new Date();
  const updates = {};

  // 주식 세금 복원
  if (settings.stockTaxMultiplier !== undefined) {
    const expires = settings.stockTaxExpiresAt?.toDate?.();
    if (expires && expires < now) {
      updates.stockTaxMultiplier = admin.firestore.FieldValue.delete();
      updates.stockTaxExpiresAt = admin.firestore.FieldValue.delete();
      logger.info(
        `[경제이벤트] ${classCode}: 주식 세금 오버라이드 만료 → 복원`,
      );
    }
  }

  // 개인상점 거래세 복원
  if (settings.marketFeeBackup !== undefined) {
    const expires = settings.marketFeeExpiresAt?.toDate?.();
    if (expires && expires < now) {
      await db
        .collection("governmentSettings")
        .doc(classCode)
        .set(
          {
            taxSettings: {
              itemMarketTransactionTaxRate: settings.marketFeeBackup,
            },
          },
          { merge: true },
        );
      updates.marketFeeBackup = admin.firestore.FieldValue.delete();
      updates.marketFeeNewRate = admin.firestore.FieldValue.delete();
      updates.marketFeeExpiresAt = admin.firestore.FieldValue.delete();
      logger.info(
        `[경제이벤트] ${classCode}: 개인상점 거래세 만료 → ${settings.marketFeeBackup * 100}% 복원`,
      );
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.collection("economicEventSettings").doc(classCode).update(updates);
  }
}

/**
 * 메인 이벤트 실행 분기
 */
async function executeEvent(classCode, event) {
  const { type, params = {} } = event;

  switch (type) {
    case "REAL_ESTATE_PRICE_CHANGE":
      return await executeRealEstatePriceChange(classCode, params);
    case "TAX_REFUND":
      return await executeTaxRefund(classCode, params);
    case "TAX_EXTRA":
      return await executeTaxExtra(classCode, params);
    case "CASH_BONUS":
      return await executeCashBonus(classCode, params);
    case "CASH_PENALTY":
      return await executeCashPenalty(classCode, params);
    case "STORE_PRICE_CHANGE":
      return await executeStorePriceChange(classCode, params);
    case "STOCK_TAX_CHANGE":
      return await executeStockTaxChange(classCode, params);
    case "MARKET_FEE_CHANGE":
      return await executeMarketFeeChange(classCode, params);
    default:
      logger.warn(`[경제이벤트] 알 수 없는 이벤트 타입: ${type}`);
      return { affectedCount: 0 };
  }
}

/**
 * 특정 학급의 경제 이벤트 트리거 (랜덤 선택 후 실행)
 */
async function triggerClassEconomicEvent(classCode, forceEventId = null) {
  const settingsDoc = await db
    .collection("economicEventSettings")
    .doc(classCode)
    .get();

  if (!settingsDoc.exists) {
    logger.info(`[경제이벤트] ${classCode}: 이벤트 설정 없음 - 건너뜀`);
    return null;
  }

  const settings = settingsDoc.data();

  if (!settings.enabled && !forceEventId) {
    logger.info(`[경제이벤트] ${classCode}: 이벤트 비활성화됨 - 건너뜀`);
    return null;
  }

  // 오늘 이미 이벤트 발생했는지 확인 (강제 실행 시 무시)
  if (!forceEventId) {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstDate.toISOString().split("T")[0];

    if (settings.lastEventDate === todayStr) {
      logger.info(
        `[경제이벤트] ${classCode}: 오늘(${todayStr}) 이미 이벤트 발생 - 건너뜀`,
      );
      return null;
    }
  }

  const allEvents =
    settings.events && settings.events.length > 0
      ? settings.events
      : DEFAULT_EVENT_TEMPLATES;

  const enabledEvents = allEvents.filter((e) => e.enabled !== false);

  if (enabledEvents.length === 0) {
    logger.info(`[경제이벤트] ${classCode}: 활성화된 이벤트 없음 - 건너뜀`);
    return null;
  }

  let selectedEvent;
  if (forceEventId) {
    selectedEvent =
      enabledEvents.find((e) => e.id === forceEventId) ||
      enabledEvents[Math.floor(Math.random() * enabledEvents.length)];
  } else {
    // 최근 3일간 발생한 이벤트 ID를 제외하여 중복 방지
    let recentEventIds = [];
    try {
      const recentLogs = await db
        .collection("economicEventLogs")
        .doc(classCode)
        .collection("entries")
        .orderBy("triggeredAt", "desc")
        .limit(3)
        .get();
      recentEventIds = recentLogs.docs
        .map((d) => d.data().event?.id)
        .filter(Boolean);
    } catch (err) {
      logger.warn(`[경제이벤트] ${classCode}: 최근 이력 조회 실패 (무시)`, err.message);
    }

    const freshEvents = recentEventIds.length > 0
      ? enabledEvents.filter((e) => !recentEventIds.includes(e.id))
      : enabledEvents;

    // 제외 후 남는 이벤트가 없으면 전체에서 선택
    const pool = freshEvents.length > 0 ? freshEvents : enabledEvents;
    selectedEvent = pool[Math.floor(Math.random() * pool.length)];

    logger.info(
      `[경제이벤트] ${classCode}: 최근 제외 ${recentEventIds.length}개(${recentEventIds.join(",")}), 후보 ${pool.length}개 중 선택`,
    );
  }

  logger.info(
    `[경제이벤트] ${classCode}: 이벤트 시작 - "${selectedEvent.title}"`,
  );

  const result = await executeEvent(classCode, selectedEvent);

  const nowTs = admin.firestore.Timestamp.now();
  const now = new Date();
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstDate.toISOString().split("T")[0];
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db
    .collection("activeEconomicEvent")
    .doc(classCode)
    .set({
      classCode,
      event: selectedEvent,
      result,
      triggeredAt: nowTs,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    });

  await db
    .collection("economicEventLogs")
    .doc(classCode)
    .collection("entries")
    .add({ classCode, event: selectedEvent, result, triggeredAt: nowTs });

  if (!forceEventId) {
    await db.collection("economicEventSettings").doc(classCode).update({
      lastEventDate: todayStr,
      lastEventAt: nowTs,
      updatedAt: nowTs,
    });
  }

  logger.info(
    `[경제이벤트] ${classCode}: 완료 - "${selectedEvent.title}"`,
    result,
  );
  return { classCode, event: selectedEvent, result };
}

/**
 * 모든 학급의 경제 이벤트 처리 (스케줄러에서 호출)
 */
async function runEconomicEventsForAllClasses() {
  logger.info("[경제이벤트] 전체 학급 경제 이벤트 처리 시작");

  const now = new Date();
  const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHour = kstTime.getUTCHours();
  const currentMinute = kstTime.getUTCMinutes();
  const dayOfWeek = kstTime.getUTCDay(); // 0=일, 1=월~5=금, 6=토

  // 평일 체크 (월~금)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    logger.info(`[경제이벤트] 주말 - 이벤트 없음`);
    return { processed: 0, triggered: 0, results: [] };
  }

  // 1단계: 모든 활성 학급 코드 수집 (users 컬렉션에서)
  const usersSnapshot = await db.collection("users").get();
  const allClassCodes = new Set();
  usersSnapshot.docs.forEach((doc) => {
    const classCode = doc.data().classCode;
    if (classCode) allClassCodes.add(classCode);
  });

  if (allClassCodes.size === 0) {
    logger.info("[경제이벤트] 활성 학급 없음");
    return { processed: 0, triggered: 0, results: [] };
  }

  logger.info(`[경제이벤트] ${allClassCodes.size}개 학급 발견: ${[...allClassCodes].join(", ")}`);

  // 2단계: 설정 없는 학급에 자동 생성
  for (const classCode of allClassCodes) {
    const settingRef = db.collection("economicEventSettings").doc(classCode);
    const settingDoc = await settingRef.get();

    if (!settingDoc.exists) {
      // 8~15시 사이 랜덤 triggerHour 배정
      const randomHour = 8 + Math.floor(Math.random() * 8);
      await settingRef.set({
        enabled: true,
        triggerHour: randomHour,
        events: DEFAULT_EVENT_TEMPLATES,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        autoCreated: true,
      });
      logger.info(`[경제이벤트] ${classCode}: 기본 설정 자동 생성 (triggerHour: ${randomHour}시)`);
    } else if (!settingDoc.data().enabled) {
      // 비활성화된 설정을 활성화
      await settingRef.update({ enabled: true });
      logger.info(`[경제이벤트] ${classCode}: 비활성화 → 자동 활성화`);
    }
  }

  // 3단계: 활성화된 설정 전체 조회
  const settingsSnapshot = await db
    .collection("economicEventSettings")
    .where("enabled", "==", true)
    .get();

  if (settingsSnapshot.empty) {
    logger.info("[경제이벤트] 활성화된 학급 없음");
    return { processed: 0, triggered: 0, results: [] };
  }

  // 만료된 오버라이드 복원 (매시간 체크)
  for (const settingDoc of settingsSnapshot.docs) {
    try {
      await restoreExpiredOverrides(settingDoc.id);
    } catch (err) {
      logger.warn(
        `[경제이벤트] ${settingDoc.id}: 오버라이드 복원 실패`,
        err.message,
      );
    }
  }

  const results = [];
  let triggered = 0;

  for (const settingDoc of settingsSnapshot.docs) {
    const settings = settingDoc.data();
    const classCode = settingDoc.id;
    const triggerHour = settings.triggerHour ?? 13; // 기본 오후 1시

    // 현재 시간이 트리거 시간 ±59분 이내인지 확인 (GitHub Actions cron 지연 대응)
    const totalCurrentMin = currentHour * 60 + currentMinute;
    const totalTriggerMin = triggerHour * 60;
    const diff = Math.abs(totalCurrentMin - totalTriggerMin);

    if (diff > 59) {
      logger.info(
        `[경제이벤트] ${classCode}: KST ${currentHour}:${String(currentMinute).padStart(2, "0")} ≠ 트리거 ${triggerHour}:00 - 건너뜀`,
      );
      continue;
    }

    try {
      const result = await triggerClassEconomicEvent(classCode);
      if (result) {
        results.push(result);
        triggered++;
      }
    } catch (error) {
      logger.error(`[경제이벤트] ${classCode}: 오류`, error.message);
    }
  }

  logger.info(
    `[경제이벤트] 완료: ${settingsSnapshot.size}개 학급 확인, ${triggered}개 이벤트 발생`,
  );
  return { processed: settingsSnapshot.size, triggered, results };
}

module.exports = {
  DEFAULT_EVENT_TEMPLATES,
  getStockTaxMultiplier,
  triggerClassEconomicEvent,
  runEconomicEventsForAllClasses,
  executeEvent,
};
