/* eslint-disable */
/**
 * 경제 이벤트 시스템 - 랜덤 경제 이벤트 실행 로직
 * 평일 오후 1시(기본값) 에 랜덤으로 경제 이벤트가 발생합니다.
 */

const { db, admin, logger } = require("./utils");

// 기본 이벤트 템플릿 (학급별로 커스터마이즈 가능)
const DEFAULT_EVENT_TEMPLATES = [
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
    id: "lottery",
    type: "LOTTERY",
    title: "이번 주 복권 당첨!",
    description: "복권 추첨 결과가 발표됩니다! 누가 행운의 주인공일까요?",
    params: { amount: 300000, winnerCount: 1 },
    emoji: "🎰🍀",
    enabled: true,
  },
];

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

  // 국고 잔액 조회
  const treasuryDoc = await db
    .collection("nationalTreasuries")
    .doc(classCode)
    .get();
  const treasuryAmount = treasuryDoc.exists
    ? treasuryDoc.data().totalAmount || 0
    : 0;

  if (treasuryAmount <= 0) {
    logger.info(`[경제이벤트] ${classCode}: 국고가 비어있어 환급 불가`);
    return { affectedCount: 0, refundedAmount: 0 };
  }

  // 학생 목록 조회 (관리자 제외)
  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) {
    return { affectedCount: 0, refundedAmount: 0 };
  }

  // 실제 학생만 필터 (role 무관하게 isAdmin=false인 사람)
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
    const chunk = studentDocs.slice(i, i + batchSize);

    chunk.forEach((d) => {
      batch.update(d.ref, {
        cash: admin.firestore.FieldValue.increment(refundPerStudent),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      affectedCount++;
    });

    await batch.commit();
  }

  // 국고에서 차감
  await db
    .collection("nationalTreasuries")
    .doc(classCode)
    .set(
      {
        totalAmount: admin.firestore.FieldValue.increment(-totalRefund),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  logger.info(
    `[경제이벤트] ${classCode}: 세금 환급 - ${affectedCount}명 × ${refundPerStudent.toLocaleString()}원 = ${totalRefund.toLocaleString()}원`,
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

  // 관리자 계정 조회
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

  // 학생 목록 조회
  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) {
    return { affectedCount: 0, collectedAmount: 0 };
  }

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

  if (taxItems.length === 0) {
    return { affectedCount: 0, collectedAmount: 0 };
  }

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

  // 관리자에게 징수금 추가
  await db
    .collection("users")
    .doc(adminDoc.id)
    .update({
      cash: admin.firestore.FieldValue.increment(totalCollected),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // 국고 업데이트
  await db
    .collection("nationalTreasuries")
    .doc(classCode)
    .set(
      {
        totalAmount: admin.firestore.FieldValue.increment(totalCollected),
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

  if (studentsSnapshot.empty) {
    return { affectedCount: 0 };
  }

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

  // 관리자에서 차감
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
 * 복권 이벤트 - 랜덤 학생에게 상금 지급
 */
async function executeLottery(classCode, params) {
  const { amount = 300000, winnerCount = 1 } = params;

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

  if (studentsSnapshot.empty) {
    return { affectedCount: 0 };
  }

  const studentDocs = studentsSnapshot.docs.filter(
    (d) => !d.data().isSuperAdmin,
  );

  // 랜덤으로 당첨자 선택
  const shuffled = [...studentDocs].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(winnerCount, studentDocs.length));
  const totalPaid = amount * winners.length;

  const batch = db.batch();
  const winnerNames = [];

  winners.forEach((winner) => {
    batch.update(winner.ref, {
      cash: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    winnerNames.push(winner.data().name || "알 수 없음");
  });

  batch.update(adminDoc.ref, {
    cash: admin.firestore.FieldValue.increment(-totalPaid),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  logger.info(
    `[경제이벤트] ${classCode}: 복권 당첨 - ${winnerNames.join(", ")} 각 ${amount.toLocaleString()}원`,
  );
  return {
    affectedCount: winners.length,
    winnerNames,
    totalAmount: totalPaid,
    prizeAmount: amount,
  };
}

/**
 * 메인 이벤트 실행 함수
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
    case "LOTTERY":
      return await executeLottery(classCode, params);
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

  if (!settings.enabled) {
    logger.info(`[경제이벤트] ${classCode}: 이벤트 비활성화됨 - 건너뜀`);
    return null;
  }

  // 오늘 이미 이벤트 발생했는지 확인 (강제 실행 시 무시)
  if (!forceEventId) {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstDate.toISOString().split("T")[0]; // YYYY-MM-DD

    if (settings.lastEventDate === todayStr) {
      logger.info(
        `[경제이벤트] ${classCode}: 오늘(${todayStr}) 이미 이벤트 발생 - 건너뜀`,
      );
      return null;
    }
  }

  // 활성화된 이벤트 목록 (커스텀 이벤트 포함)
  const allEvents =
    settings.events && settings.events.length > 0
      ? settings.events
      : DEFAULT_EVENT_TEMPLATES;

  const enabledEvents = allEvents.filter((e) => e.enabled !== false);

  if (enabledEvents.length === 0) {
    logger.info(`[경제이벤트] ${classCode}: 활성화된 이벤트 없음 - 건너뜀`);
    return null;
  }

  // 특정 이벤트 강제 실행 or 랜덤 선택
  let selectedEvent;
  if (forceEventId) {
    selectedEvent =
      enabledEvents.find((e) => e.id === forceEventId) ||
      enabledEvents[Math.floor(Math.random() * enabledEvents.length)];
  } else {
    selectedEvent =
      enabledEvents[Math.floor(Math.random() * enabledEvents.length)];
  }

  logger.info(
    `[경제이벤트] ${classCode}: 이벤트 시작 - "${selectedEvent.title}"`,
  );

  // 이벤트 실행
  const result = await executeEvent(classCode, selectedEvent);

  // 현재 KST 시간
  const nowTs = admin.firestore.Timestamp.now();
  const now = new Date();
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = kstDate.toISOString().split("T")[0];
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // 활성 이벤트 기록 (24시간 표시용)
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

  // 히스토리 저장
  await db
    .collection("economicEventLogs")
    .doc(classCode)
    .collection("entries")
    .add({
      classCode,
      event: selectedEvent,
      result,
      triggeredAt: nowTs,
    });

  // 마지막 이벤트 날짜 업데이트
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
 * 각 학급의 설정된 시간에 맞춰 실행
 */
async function runEconomicEventsForAllClasses() {
  logger.info("[경제이벤트] 전체 학급 경제 이벤트 처리 시작");

  const now = new Date();
  const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentHour = kstTime.getUTCHours();
  const currentMinute = kstTime.getUTCMinutes();
  const dayOfWeek = kstTime.getUTCDay(); // 0=일, 1=월, ..., 5=금, 6=토

  // 평일 체크 (월~금)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    logger.info(`[경제이벤트] 주말 - 이벤트 없음`);
    return { processed: 0, triggered: 0, results: [] };
  }

  // 이벤트가 활성화된 학급 조회
  const settingsSnapshot = await db
    .collection("economicEventSettings")
    .where("enabled", "==", true)
    .get();

  if (settingsSnapshot.empty) {
    logger.info("[경제이벤트] 활성화된 학급 없음");
    return { processed: 0, triggered: 0, results: [] };
  }

  const results = [];
  let triggered = 0;

  for (const settingDoc of settingsSnapshot.docs) {
    const settings = settingDoc.data();
    const classCode = settingDoc.id;

    const triggerHour = settings.triggerHour ?? 13; // 기본 오후 1시

    // 현재 시간이 트리거 시간 ±29분 이내인지 확인
    const totalCurrentMin = currentHour * 60 + currentMinute;
    const totalTriggerMin = triggerHour * 60;
    const diff = Math.abs(totalCurrentMin - totalTriggerMin);

    if (diff > 29) {
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
  triggerClassEconomicEvent,
  runEconomicEventsForAllClasses,
  executeEvent,
};
