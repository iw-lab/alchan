/**
 * 경제 이벤트 시스템 - 랜덤 경제 이벤트 실행 로직
 * 평일 설정 시간(기본값 오후 1시)에 랜덤으로 경제 이벤트가 발생합니다.
 * 배포 시 SCHEDULER_AUTH_TOKEN 환경변수 필수 (deploy.yml에서 자동 주입)
 */

const { db, admin, logger, findApprovedAdminSnap } = require("./utils");

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
    description: "정부가 국가 재정을 위해 추가 세금을 부과합니다! (순자산의 3%)",
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
    description: "경제 위기 — 순자산의 5%만큼 현금이 차감됩니다 (현금 잔고 한도 내)",
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
    title: "물가 안정!",
    description:
      "정부 물가 안정 정책으로 관리자 상점의 모든 상품 가격이 25% 인하되었습니다!",
    params: { multiplier: 0.75 },
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

// ===================================================================================
// 📒 경제이벤트 감사 로그 — 학생 현금을 바꿨으면 반드시 남긴다
// ===================================================================================
// 2026-08-11 전수 교차검증(C1): 이 파일의 네 함수 중 **셋이 학생 cash 를 increment 하면서
// activity_logs 를 하나도 안 남기고 있었다**(executeTaxExtra 만 남겼다).
// 교사가 "경제 위기"를 실행하면 학급 전원 현금이 줄지만 학생 "내 자산 > 거래내역"엔
// 아무것도 안 떠서, "내 돈 왜 줄었냐"에 서버가 답할 근거가 없었다.
// 같은 파일 안에 정답 패턴이 있는데 셋이 안 따른 것이라, 아예 헬퍼로 만들어 놓는다.

/** 감사 로그 보존 기간(90일) — executeTaxExtra 가 쓰던 값과 같다. */
const LOG_RETENTION_DAYS = 90;

function logExpiryTimestamp() {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  );
}

/**
 * 학생 감사 로그 1건을 배치에 싣는다. **현금 변동과 같은 배치**에 넣을 것 —
 * 따로 쓰면 "돈은 움직였는데 기록은 없다"가 다시 생긴다.
 * @param {FirebaseFirestore.WriteBatch} batch
 * @param {{classCode:string, studentId:string, studentName:string,
 *          type:string, amount:number, description:string}} entry
 * @param {FirebaseFirestore.Timestamp} [expireAt]
 */
function queueStudentLog(batch, entry, expireAt) {
  batch.set(db.collection("activity_logs").doc(), {
    userId: entry.studentId,
    userName: entry.studentName,
    classCode: entry.classCode,
    type: entry.type,
    amount: entry.amount,
    description: entry.description,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: expireAt || logExpiryTimestamp(),
  });
}

/** 학생 문서에서 표시 이름을 뽑는다(로그가 "학생"으로만 남지 않게). */
function studentDisplayName(data) {
  return data?.name || data?.nickname || "학생";
}

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
  const adminSnapshot = await findApprovedAdminSnap(classCode);

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

  const batchSize = 200; // 감사 로그 1건이 붙어 문서당 2쓰기 → 500 한도에 여유
  let affectedCount = 0;
  const expireAt = logExpiryTimestamp();

  const adminRef = db.collection("users").doc(adminDoc.id);
  for (let i = 0; i < studentDocs.length; i += batchSize) {
    const chunk = studentDocs.slice(i, i + batchSize);
    const batch = db.batch();
    let chunkPaid = 0;
    chunk.forEach((d) => {
      batch.update(d.ref, {
        cash: admin.firestore.FieldValue.increment(refundPerStudent),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      chunkPaid += refundPerStudent;
      // 📒 감사 로그 — 지급과 같은 배치라 "돈만 들어오고 기록은 없다"가 불가능하다
      queueStudentLog(
        batch,
        {
          classCode,
          studentId: d.id,
          studentName: studentDisplayName(d.data()),
          type: "세금 환급 (경제이벤트)",
          amount: refundPerStudent,
          description:
            `[경제이벤트] 국고 ${treasuryAmount.toLocaleString()}원의 ` +
            `${(refundRate * 100).toFixed(1)}%를 학급 ${studentCount}명에게 균등 환급 — ` +
            `1인당 ${refundPerStudent.toLocaleString()}원`,
        },
        expireAt,
      );
      affectedCount++;
    });
    // 🔒 관리자 차감을 **같은 배치**에 싣는다(2026-08-11 3차 검증 C11).
    //    종전엔 학생 배치를 전부 커밋한 **뒤** 관리자 cash 를 별도로 갱신했다.
    //    그 쓰기가 실패하면 학생 돈은 이미 늘었는데 국고는 그대로 — 무담보 발행이다.
    //    이제 커밋된 배치는 언제나 "나간 만큼 국고에서 빠졌다"가 성립한다.
    batch.update(adminRef, {
      cash: admin.firestore.FieldValue.increment(-chunkPaid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  // 🔒 실제 지급 합계 = 1인당액 × 인원. 종전엔 관리자에게서 totalRefund(나누기 전 총액)를
  //    빼서 **나머지(총액 − 1인당액×인원)가 아무에게도 안 가고 소각**됐다.
  const actuallyRefunded = refundPerStudent * affectedCount;

  logger.info(
    `[경제이벤트] ${classCode}: 세금 환급 - ${affectedCount}명 × ${refundPerStudent.toLocaleString()}원`,
  );
  return {
    affectedCount,
    refundedAmount: actuallyRefunded,
    perStudent: refundPerStudent,
  };
}

/**
 * 추가 세금 부과 이벤트 - 학생 "순자산"의 일정 비율 징수
 * 순자산 = 현금 + 쿠폰가치 + 파킹잔액 + 주식평가액 + 부동산가치 - 대출잔액
 * 현금 부족 시 가진 현금까지만 징수하고 나머지는 미납 처리 (월세 징수 패턴)
 */
async function executeTaxExtra(classCode, params) {
  const { taxRate = 0.03 } = params;

  const adminSnapshot = await findApprovedAdminSnap(classCode);

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

  // === 학급 공통 데이터 1회 로드 (쿠폰가치, 주식시세, 부동산 전체) ===
  // 🔒 학급 **공통** 입력은 fail-open 하면 안 된다(2026-08-12 codex CRITICAL).
  //    쿠폰가치·주식시세·부동산이 빈 값이면 전원의 과세표준이 통째로 틀어진다.
  //    mainSettings 만 예외 — 없으면 기본 쿠폰가치 1000 을 쓰는 게 정상 동작이다.
  const [mainSettingsSnap, stockListSnap, realEstateSnap] = await Promise.all([
    db.doc("settings/mainSettings").get().catch(() => null),
    // 주식 시세: 정식 소스 CentralStocks의 전역 스냅샷(realStockService 갱신).
    // 과거 classes/{classCode}/stocks/stockList 는 write가 없는 죽은 경로라 항상 비어
    // 주식이 과세 순자산에서 누락되던 버그를 차단한다.
    db.doc("Settings/centralStocksCache").get(), // 실패 시 전파 — 주식가치 0 과세 방지
    db.collection(`classes/${classCode}/realEstateProperties`).get(), // 실패 시 전파
  ]);

  const couponValue =
    (mainSettingsSnap && mainSettingsSnap.exists &&
      Number(mainSettingsSnap.data().couponValue)) || 1000;
  const stocks =
    stockListSnap && stockListSnap.exists && Array.isArray(stockListSnap.data().stocks)
      ? stockListSnap.data().stocks
      : [];

  // 부동산을 owner (userId) 기준으로 합산
  const realEstateByOwner = new Map();
  realEstateSnap.docs.forEach((d) => {
    const data = d.data();
    const owner = data.owner;
    if (!owner) return;
    const price = Number(data.price) || Number(data.value) || 0;
    if (price <= 0) return;
    realEstateByOwner.set(owner, (realEstateByOwner.get(owner) || 0) + price);
  });

  // === 학생별 순자산 계산 (병렬) ===
  const logExpireAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  );

  const perStudent = await Promise.all(
    studentsSnapshot.docs.map(async (sDoc) => {
      const sData = sDoc.data();
      if (sData.isSuperAdmin) return null;

      const cash = Number(sData.cash) || 0;
      const coupons = Number(sData.coupons) || 0;
      const studentId = sDoc.id;

      // 🔒 조회 실패를 0 으로 접으면 **읽지도 못한 값으로 과세**한다(2026-08-12 codex CRITICAL).
      //    특히 products 실패는 대출이 0 으로 잡혀 순자산이 **과대** 계산되고 과세가 과해진다.
      //    이 학생은 이번 회차에서 제외한다(아래 catch 가 null 을 반환해 걸러진다).
      //    `executeCashPenalty` 와 같은 기준이다 — 추정치로 돈을 걷느니 한 번 거른다.
      let parkingSnap, productsSnap, portfolioSnap;
      try {
        [parkingSnap, productsSnap, portfolioSnap] = await Promise.all([
          db.doc(`users/${studentId}/financials/parkingAccount`).get(),
          // 예금/적금/대출 정식 소스 = users/{uid}/products (type=deposit|savings|loan).
          // 과거 financials/loans 는 write 없는 죽은 경로라 대출이 0으로 잡혀 과세 순자산이
          // 과대(부채 미차감) 계산되던 버그를 차단한다.
          db.collection(`users/${studentId}/products`).get(),
          db.collection(`users/${studentId}/portfolio`).get(),
        ]);
      } catch (e) {
        logger.warn(
          `[TaxExtra] ${studentId} 자산 조회 실패 — 이번 회차 과세에서 제외: ${e.message}`,
        );
        return null;
      }

      const parking =
        parkingSnap && parkingSnap.exists
          ? Number(parkingSnap.data().balance) || 0
          : 0;

      let loanBalance = 0;
      let depositSavingsTotal = 0;
      productsSnap.docs.forEach((d) => {
        const p = d.data();
        if (p.type === "loan") {
          loanBalance += Number(p.remainingPrincipal) || Number(p.balance) || 0;
        } else if (p.type === "deposit" || p.type === "savings") {
          depositSavingsTotal += Number(p.balance) || 0;
        }
      });

      const stockValue = portfolioSnap.docs.reduce((sum, d) => {
        const h = d.data();
        const qty = Number(h.quantity) || 0;
        if (qty <= 0) return sum;
        // 문자열 기준 매칭으로 통일(holding 필드 우선, docId 폴백).
        const sid = h.stockId != null ? h.stockId : d.id;
        const info = stocks.find((s) => String(s.id) === String(sid));
        if (info && info.isListed) {
          return sum + (Number(info.price) || 0) * qty;
        }
        return sum;
      }, 0);

      const realEstateValue = realEstateByOwner.get(studentId) || 0;
      const couponTotal = coupons * couponValue;

      const netWorth =
        cash + couponTotal + parking + depositSavingsTotal + stockValue + realEstateValue - loanBalance;

      // 순자산 ≤ 0인 학생만 스킵. 순자산이 플러스면 현금 부족해도(마이너스 가더라도) 징수.
      if (netWorth <= 0) return null;

      const assessedTax = Math.floor(netWorth * taxRate);
      if (assessedTax <= 0) return null;

      // 순자산 기준 전액 징수 — 현금 잔고와 무관 (마이너스 허용)
      const actualDeduct = assessedTax;
      const unpaid = 0;

      return {
        ref: sDoc.ref,
        studentId,
        studentName: sData.name || sData.nickname || "학생",
        cash,
        netWorth,
        assessedTax,
        actualDeduct,
        unpaid,
      };
    }),
  );

  const taxItems = perStudent.filter(Boolean);
  if (taxItems.length === 0) return { affectedCount: 0, collectedAmount: 0 };

  // === 학생 cash 차감 + activity_logs 기록 (배치) ===
  let totalCollected = 0;
  const adminRef = db.collection("users").doc(adminDoc.id);
  const batchSize = 200; // activity_logs 1건 추가되어 문서당 2쓰기 → 한 배치 500 제한 여유
  for (let i = 0; i < taxItems.length; i += batchSize) {
    const batch = db.batch();
    let chunkCollected = 0;
    taxItems.slice(i, i + batchSize).forEach((item) => {
      if (item.actualDeduct > 0) {
        batch.update(item.ref, {
          cash: admin.firestore.FieldValue.increment(-item.actualDeduct),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      // 학생에게 activity_logs 기록 (내 자산에서 확인)
      const logRef = db.collection("activity_logs").doc();
      const baseDesc =
        `[경제이벤트] 순자산 ${item.netWorth.toLocaleString()}원 기준 ` +
        `세금 ${(taxRate * 100).toFixed(1)}% = ${item.assessedTax.toLocaleString()}원 부과. ` +
        `납부 ${item.actualDeduct.toLocaleString()}원` +
        (item.unpaid > 0 ? ` (미납 ${item.unpaid.toLocaleString()}원)` : "");
      batch.set(logRef, {
        userId: item.studentId,
        userName: item.studentName,
        classCode,
        type: "세금 납부 (경제이벤트)",
        amount: -item.actualDeduct,
        description: baseDesc,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        expireAt: logExpireAt,
      });
      totalCollected += item.actualDeduct;
      chunkCollected += item.actualDeduct;
    });
    // 🔒 국고 입금을 **같은 배치**에(2026-08-12, 형제 3함수와 통일).
    //    종전엔 학생 배치를 전부 커밋한 뒤 관리자 cash 를 별도로 갱신했다 —
    //    그 쓰기가 실패하면 **학생 돈만 사라진다**(소각).
    if (chunkCollected > 0) {
      batch.update(adminRef, {
        cash: admin.firestore.FieldValue.increment(chunkCollected),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // 통계 기록
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
    `[경제이벤트] ${classCode}: 순자산세 추징 - ${taxItems.length}명 부과 ${taxItems
      .reduce((s, t) => s + t.assessedTax, 0)
      .toLocaleString()}원 / 실징수 ${totalCollected.toLocaleString()}원`,
  );
  return { affectedCount: taxItems.length, collectedAmount: totalCollected };
}

/**
 * 현금 보너스 지급 이벤트 - 관리자 계정에서 학생들에게 지급
 */
async function executeCashBonus(classCode, params) {
  const { amount = 50000 } = params;

  const adminSnapshot = await findApprovedAdminSnap(classCode);

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

  const batchSize = 200; // 감사 로그 1건이 붙어 문서당 2쓰기 → 500 한도에 여유
  let affectedCount = 0;
  const expireAt = logExpiryTimestamp();

  const adminRef = db.collection("users").doc(adminDoc.id);
  for (let i = 0; i < studentDocs.length; i += batchSize) {
    const batch = db.batch();
    let chunkPaid = 0;
    studentDocs.slice(i, i + batchSize).forEach((d) => {
      batch.update(d.ref, {
        cash: admin.firestore.FieldValue.increment(amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      chunkPaid += amount;
      // 📒 감사 로그 — 지급과 같은 배치
      queueStudentLog(
        batch,
        {
          classCode,
          studentId: d.id,
          studentName: studentDisplayName(d.data()),
          type: "현금 지급 (경제이벤트)",
          amount,
          description: `[경제이벤트] 학급 전원에게 현금 ${amount.toLocaleString()}원 지급`,
        },
        expireAt,
      );
      affectedCount++;
    });
    // 🔒 지급과 국고 차감을 같은 배치에 — 커밋된 배치는 언제나 수지가 맞는다(C11).
    batch.update(adminRef, {
      cash: admin.firestore.FieldValue.increment(-chunkPaid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

  logger.info(
    `[경제이벤트] ${classCode}: 현금 지급 - ${affectedCount}명 × ${amount.toLocaleString()}원`,
  );
  return { affectedCount, totalAmount: amount * affectedCount, perStudent: amount };
}

/**
 * 한 학생의 순자산 계산 — netAssets.js의 computeNetAssets와 동일 공식
 * 순자산 = cash + coupons*1000 + parking + stockValue + realEstateValue - loanBalance
 */
async function calcNetAssetsForUser(userDoc, stocksMap, realEstateByOwner, COUPON_VALUE = 1000) {
  const userId = userDoc.id;
  const userData = userDoc.data();
  const cash = Number(userData.cash) || 0;
  const coupons = Number(userData.coupons) || 0;

  // 예치금 (parkingAccount)
  let parking = 0;
  try {
    const snap = await db.collection("users").doc(userId)
      .collection("financials").doc("parkingAccount").get();
    if (snap.exists) parking = Number(snap.data().balance) || 0;
  } catch (e) {
    // 🔒 삼키면 parking=0 으로 계산이 이어져 **읽지도 못한 값으로 과세**한다(3차 검증 C12).
    //    못 읽었으면 못 읽었다고 말한다 — 호출자가 그 학생을 건너뛴다.
    throw new Error(`순자산 계산 실패(파킹통장, ${userId}): ${e.message}`);
  }

  // 예금/적금/대출 (users/{uid}/products, type=deposit|savings|loan) — 정식 소스.
  // 과거 financials/loans(activeLoans) 는 write 없는 죽은 경로라 대출이 0으로 잡혀
  // 과세 순자산이 과대(부채 미차감) 계산되던 버그를 차단한다.
  let loanBalance = 0;
  let depositSavingsTotal = 0;
  try {
    const snap = await db.collection("users").doc(userId).collection("products").get();
    snap.docs.forEach((d) => {
      const p = d.data();
      if (p.type === "loan") {
        loanBalance += Number(p.remainingPrincipal) || Number(p.balance) || 0;
      } else if (p.type === "deposit" || p.type === "savings") {
        depositSavingsTotal += Number(p.balance) || 0;
      }
    });
  } catch (e) {
    // 대출이 0으로 잡히면 순자산이 **과대** 계산돼 과세가 과해진다 — 더 나쁜 방향이다.
    throw new Error(`순자산 계산 실패(예적금·대출, ${userId}): ${e.message}`);
  }

  // 주식 보유가치
  let stockValue = 0;
  try {
    const snap = await db.collection("users").doc(userId).collection("portfolio").get();
    snap.docs.forEach((d) => {
      const h = d.data();
      const qty = Number(h.quantity) || 0;
      if (qty <= 0) return;
      // stockId는 holding 필드 우선, 없으면 doc.id (string/int 둘 다 시도)
      const sid = h.stockId != null ? h.stockId : d.id;
      const info = stocksMap.get(String(sid)) || stocksMap.get(sid);
      if (info && info.isListed) {
        stockValue += (Number(info.price) || 0) * qty;
      }
    });
  } catch (e) {
    throw new Error(`순자산 계산 실패(주식, ${userId}): ${e.message}`);
  }

  // 부동산 가치 (학급 단위 캐시에서 owner별 조회). owner 필드 = 소유자 UID 이므로
  // userId 로 조회한다(과거 userName 조회는 항상 빈 결과라 부동산이 누락됐다).
  const myRealEstate = realEstateByOwner.get(userId) || [];
  const realEstateValue = myRealEstate.reduce((sum, p) => sum + (Number(p.price) || Number(p.value) || 0), 0);

  return cash + coupons * COUPON_VALUE + parking + depositSavingsTotal + stockValue + realEstateValue - loanBalance;
}

/**
 * 현금 차감 이벤트 - 순자산 ×N% 계산 → cash에서 차감 (cash 부족 시 cap) → 국고 납입
 * 정책 (1번): 순자산 기준 공평 과세, 단 cash 잔고 한도 내에서만 실제 차감
 */
async function executeCashPenalty(classCode, params) {
  const { penaltyRate = 0.05 } = params;

  // 관리자 조회 (국고 = 관리자 cash)
  const adminSnapshot = await findApprovedAdminSnap(classCode);

  if (adminSnapshot.empty) {
    logger.warn(`[경제이벤트] ${classCode}: 관리자 계정 없음 - 건너뜀`);
    return { affectedCount: 0, collectedAmount: 0 };
  }

  const adminDoc = adminSnapshot.docs[0];

  // 순자산 계산용 캐시: CentralStocks 한 번 + 학급 부동산 한 번
  // 🔒 학급 **공통** 입력이 실패하면 전원이 잘못된 과세표준으로 계산된다 —
  //    학생 단위 방어(calcNetAssetsForUser throw)만으론 못 막는다(2026-08-12 codex CRITICAL).
  //    빈 맵으로 진행하면 전원 주식가치 0 / 부동산 0 이 되어 과세가 통째로 어긋난다.
  //    못 읽으면 이 이벤트를 아예 실행하지 않는다.
  const stocksMap = new Map();
  try {
    const stocksSnap = await db.collection("CentralStocks").get();
    stocksSnap.docs.forEach((d) => stocksMap.set(d.id, { id: d.id, ...d.data() }));
  } catch (e) {
    throw new Error(`[CashPenalty] 주식 시세를 못 읽어 과세를 중단합니다: ${e.message}`);
  }

  const realEstateByOwner = new Map();
  try {
    const reSnap = await db
      .collection("classes").doc(classCode)
      .collection("realEstateProperties")
      .get();
    reSnap.docs.forEach((d) => {
      const data = d.data();
      const owner = data.owner;
      if (!owner) return;
      if (!realEstateByOwner.has(owner)) realEstateByOwner.set(owner, []);
      realEstateByOwner.get(owner).push(data);
    });
  } catch (e) {
    throw new Error(`[CashPenalty] 부동산 정보를 못 읽어 과세를 중단합니다: ${e.message}`);
  }

  const studentsSnapshot = await db
    .collection("users")
    .where("classCode", "==", classCode)
    .where("isAdmin", "==", false)
    .get();

  if (studentsSnapshot.empty) return { affectedCount: 0, collectedAmount: 0 };

  let totalPenalty = 0;
  const penaltyItems = [];

  // 순차 처리 (학생당 ~3 read, 학급 100명 = 300 read 정도)
  for (const d of studentsSnapshot.docs) {
    const data = d.data();
    if (data.isSuperAdmin) continue;
    const cash = Number(data.cash) || 0;
    if (cash <= 0) continue;

    // 순자산을 못 읽은 학생은 **과세하지 않는다**. 추정치로 돈을 걷는 것보다 한 번 거르는 게 낫다.
    let netAssets;
    try {
      netAssets = await calcNetAssetsForUser(d, stocksMap, realEstateByOwner);
    } catch (e) {
      logger.warn(`[CashPenalty] ${d.id} 순자산 계산 실패 — 이번 이벤트에서 제외: ${e.message}`);
      continue;
    }
    if (netAssets <= 0) continue; // 순자산 음수/0인 학생 보호

    // 순자산 ×N% → cash 잔고로 cap
    const target = Math.floor(netAssets * penaltyRate);
    const penalty = Math.min(target, cash);
    if (penalty > 0) {
      penaltyItems.push({
        ref: d.ref,
        studentId: d.id,
        studentName: studentDisplayName(data),
        penalty,
        netAssets,
        target,
      });
      totalPenalty += penalty;
    }
  }

  if (penaltyItems.length === 0)
    return { affectedCount: 0, collectedAmount: 0 };

  const batchSize = 200; // 감사 로그 1건이 붙어 문서당 2쓰기 → 500 한도에 여유
  const expireAt = logExpiryTimestamp();
  const adminRef = db.collection("users").doc(adminDoc.id);
  for (let i = 0; i < penaltyItems.length; i += batchSize) {
    const batch = db.batch();
    let chunkCollected = 0;
    penaltyItems.slice(i, i + batchSize).forEach((item) => {
      batch.update(item.ref, {
        cash: admin.firestore.FieldValue.increment(-item.penalty),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      chunkCollected += item.penalty;
      // 📒 감사 로그 — 차감과 같은 배치. 이게 없어서 "경제 위기"로 현금이 줄어도
      //    학생 거래내역엔 아무것도 안 떴다(학급 단위 총계만 남았다).
      queueStudentLog(
        batch,
        {
          classCode,
          studentId: item.studentId,
          studentName: item.studentName,
          type: "재산 손실 (경제이벤트)",
          amount: -item.penalty,
          description:
            `[경제이벤트] 순자산 ${item.netAssets.toLocaleString()}원 기준 ` +
            `${(penaltyRate * 100).toFixed(1)}% = ${item.target.toLocaleString()}원 부과. ` +
            `차감 ${item.penalty.toLocaleString()}원` +
            (item.target > item.penalty
              ? ` (보유 현금까지만 차감, 미징수 ${(item.target - item.penalty).toLocaleString()}원)`
              : ""),
        },
        expireAt,
      );
    });
    // 🔒 차감과 국고 입금을 같은 배치에(C11). 종전엔 학생 배치를 전부 커밋한 뒤
    //    관리자 입금을 별도로 했다 — 그 쓰기가 실패하면 **학생 돈만 사라진다**(소각).
    batch.update(adminRef, {
      cash: admin.firestore.FieldValue.increment(chunkCollected),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
  }

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
 * 제외 조건:
 *   1. excludeFromEconomicEvent === true (관리자가 명시적으로 체크한 아이템)
 *   2. 이름에 "자유 시간" / "자유시간" 포함 (교사가 플래그 설정 전이라도 보호)
 */
const STORE_PRICE_EVENT_EXCLUDED_KEYWORDS = ["자유 시간", "자유시간"];

function isStorePriceEventExcluded(itemData) {
  if (!itemData) return false;
  if (itemData.excludeFromEconomicEvent === true) return true;
  const name = (itemData.name || "").toString();
  return STORE_PRICE_EVENT_EXCLUDED_KEYWORDS.some((kw) => name.includes(kw));
}

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
  let excludedCount = 0;
  const docs = itemsSnapshot.docs;
  const batchSize = 400;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach((doc) => {
      const data = doc.data();
      if (isStorePriceEventExcluded(data)) {
        excludedCount++;
        return;
      }
      const currentPrice = data.price || 0;
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
    `[경제이벤트] ${classCode}: 상점 물가 ${multiplier}배 변경 - ${affectedCount}개 아이템 적용, ${excludedCount}개 제외(자유 시간 등)`,
  );
  return { affectedCount, excludedCount, multiplier };
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
  // ⚠️ 반드시 **여기서 직접 읽는다.** 호출부의 스냅샷을 받아 쓰면 그 사이에 걸린
  //    새 오버라이드를 낡은 값으로 덮어쓴다(호출부 주석 참조).
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
  //   여기 검사는 **빠른 종료용**이다. 실제 판정은 아래 실행 직전의 트랜잭션 점유가 한다.
  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  if (!forceEventId) {
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

  // 🔒 그날을 **실행 전에** 원자적으로 점유한다(2026-08-12 codex CRITICAL).
  //    종전엔 완료 마커(lastEventDate)를 실행이 다 끝난 **뒤** 썼다. 그런데 이 이벤트는
  //    학생 단위 멱등 마커가 없고, hourlySchedulerV2 가 평일 8~17시에 **매시간** 돈다.
  //    지급 도중 실패하면 마커가 없으니 같은 날 최대 9번 재실행되고, 그때마다 이미 받은
  //    학생에게 또 지급된다(환급·보너스=민팅, 패널티=이중 차감).
  //    그래서 claim-before 로 바꾼다 — 실패하면 그날 이벤트는 없던 일이 된다.
  //    랜덤 연출 이벤트라 하루 거르는 쪽이 이중지급보다 훨씬 낫고, 재산세가 쓰는 것과 같은 판단이다.
  if (!forceEventId) {
    const claimedDay = await db.runTransaction(async (tx) => {
      const ref = db.collection("economicEventSettings").doc(classCode);
      const snap = await tx.get(ref);
      if (snap.exists && snap.data().lastEventDate === todayStr) return false;
      tx.set(
        ref,
        {
          lastEventDate: todayStr,
          lastEventAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true },
      );
      return true;
    });
    if (!claimedDay) {
      logger.info(`[경제이벤트] ${classCode}: 오늘(${todayStr}) 이미 점유됨 - 건너뜀`);
      return null;
    }
  }

  const result = await executeEvent(classCode, selectedEvent);

  const nowTs = admin.firestore.Timestamp.now();
  const now = new Date();
  // todayStr 은 함수 상단에서 이미 계산했다(그날 점유 판정에 쓴 값과 같아야 한다).
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

  // (완료 마커는 위 claim 에서 이미 기록했다 — 여기서 다시 쓰지 않는다)

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

  // 1단계: 신규 학급 프로비저닝 — **하루 한 번만** 한다.
  //
  // 종전엔 매 실행(평일 8~17시 = 하루 10회)마다 `users` 컬렉션을 **필터 없이 전량 스캔**해서
  // classCode 집합을 만들고, 학급마다 설정 문서 존재 확인 get() 을 또 돌았다.
  // 학급이 새로 생기는 건 학기당 몇 번인데, 그걸 감지하려고 하루 400~500 읽기를 썼다.
  //
  // 그렇다고 이 스캔을 **없앨 수는 없다** — economicEventSettings 문서를 만드는 경로가
  // 여기 하나뿐이라, 지우면 새 학급은 교사가 설정을 수동 저장하기 전까지 경제이벤트가
  // 영영 안 돈다. 그래서 없애는 대신 **빈도만** 하루 1회로 낮춘다.
  // (근본 해결은 학급 생성 시점(classroomDefaults)에서 설정을 함께 만드는 것이다.
  //  그건 교사 가입·승인 경로를 건드리는 별개 변경이라 여기서 하지 않는다.)
  //
  // 게이트: **그날 아직 스캔을 안 했으면** 한다. 마커 문서 1건을 읽어 판정한다.
  //   ⚠️ `currentHour === 8`(그날 첫 실행) 로 짰다가 고쳤다 — 8시 실행이 실패하면
  //      그날은 스캔이 통째로 없고, 금요일 8시 이후에 생긴 학급은 월요일 8시까지 기다린다.
  //      "몇 시냐"가 아니라 "오늘 했느냐"가 조건이어야 한다. 읽기 1건이면 그게 된다
  //      (없앤 users 전수 스캔은 실행당 40~50건이었다).
  const provisionMarkerRef = db
    .collection("schedulerLocks")
    .doc("economicEventProvision");
  const scanDateStr = kstTime.toISOString().split("T")[0];

  let settingsSnapshot = await db
    .collection("economicEventSettings")
    .where("enabled", "==", true)
    .get();

  const markerSnap = await provisionMarkerRef.get();
  const alreadyScannedToday = markerSnap.exists && markerSnap.data()?.date === scanDateStr;

  if (!alreadyScannedToday || settingsSnapshot.empty) {
    const usersSnapshot = await db.collection("users").get();
    // ⚠️ 2026-08-20: 종전엔 **모든 사용자**의 classCode 를 학급으로 인정했다.
    //   그래서 교사 계정 하나만 남은 학급(XHAWPR·CLASS2025)과, 학생이 다 빠진 뒤
    //   교사 문서만 남은 학급까지 설정이 생겨 **매시간 경제이벤트 쓰기가 나갔다**.
    //   더 나쁜 건 되돌릴 수 없다는 점이다 — 아래 루프는 만들기만 하고 지우지 않아서,
    //   한 번 오타로 들어온 학급코드("미지정" 등)가 영원히 남아 매시간 돈다(라이브 실측:
    //   `economicEventSettings/미지정` 이 2026-08-20 까지도 lastEventAt 을 갱신 중이었다).
    //   학급의 정의를 **학생이 있는 곳**으로 좁힌다(주급의 classCodesFromStudentSnap 과 동일 기준).
    const allClassCodes = new Set();   // 학생이 있는 학급 — **설정을 만들/켤** 대상
    const anyUserCodes = new Set();     // 교사 포함 아무나 있는 학급 — **끄지 않을** 대상
    usersSnapshot.docs.forEach((doc) => {
      const d = doc.data();
      if (!d.classCode) return;
      anyUserCodes.add(d.classCode);
      if (d.isAdmin === true || d.isTeacher === true || d.isSuperAdmin === true) return;
      allClassCodes.add(d.classCode);
    });

    logger.info(
      `[경제이벤트] 학급 프로비저닝 점검(${alreadyScannedToday ? "부트스트랩" : "오늘 첫 스캔"}): ` +
        `학생이 있는 학급 ${allClassCodes.size}개`,
    );

    // 🧹 고아 설정 회수. 이게 없으면 위 필터를 좁혀도 **이미 만들어진** 고아가 계속 돈다.
    //   ⚠️ 기준은 "학생 0명"이 아니라 **"사용자 0명"**이다(2026-08-20 codex WARNING).
    //   학생 기준으로 끄면, 교사가 막 가입해 아직 학생이 없는 신규 학급이 이 스캔에 걸려
    //   꺼진다 — 학생이 들어와도 다음 평일 스캔까지 경제이벤트가 안 돈다(레이스).
    //   교사조차 없는 학급코드는 오타이거나 삭제된 학급이라 되살아날 일이 없다.
    //   삭제가 아니라 비활성화인 이유: 되돌릴 수 있는 쪽을 고른다(아래 루프가 그대로 되살린다).
    for (const doc of settingsSnapshot.docs) {
      if (anyUserCodes.has(doc.id)) continue;
      await doc.ref.update({
        enabled: false,
        disabledReason: "no-users",
        disabledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.warn(`[경제이벤트] ${doc.id}: 사용자 0명 — 설정 비활성화(고아 회수)`);
    }

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

    // 스캔을 **끝낸 뒤** 마커를 찍는다. 중간에 실패하면 마커가 안 남아 다음 실행이 다시 한다.
    await provisionMarkerRef.set(
      { date: scanDateStr, scannedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    // 방금 만들었거나 켠 학급이 이번 실행에 바로 반영되도록 다시 읽는다.
    settingsSnapshot = await db
      .collection("economicEventSettings")
      .where("enabled", "==", true)
      .get();
  }

  if (settingsSnapshot.empty) {
    logger.info("[경제이벤트] 활성화된 학급 없음");
    return { processed: 0, triggered: 0, results: [] };
  }

  // 만료된 오버라이드 복원 (매시간 체크)
  // ⚠️ 여기서 **스냅샷을 재사용하지 않는다.** 중복 조회를 없애려고 위에서 읽은 데이터를
  //    넘기게 고쳤다가 되돌렸다 — 스냅샷을 읽은 뒤 이 루프가 도는 사이에 수동 경제이벤트가
  //    오버라이드를 새로 걸면(만료 시각 연장 포함), 낡은 스냅샷 기준으로 판단한 복원이
  //    **방금 건 오버라이드를 지운다.** 절감은 학급 수 × 하루 10회(≈20 읽기/일)뿐이고
  //    잃는 건 경제이벤트 상태의 정확성이라 교환이 성립하지 않는다.
  //    (제대로 하려면 트랜잭션이나 update-time precondition 이 필요하다 — 별건.)
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

  // 오늘 KST 날짜 문자열 (idempotent 체크용)
  const todayStr = kstTime.toISOString().split("T")[0];
  const classErrors = [];

  for (const settingDoc of settingsSnapshot.docs) {
    const settings = settingDoc.data();
    const classCode = settingDoc.id;
    const triggerHour = settings.triggerHour ?? 13; // 기본 오후 1시

    // 영업시간 종료 (기본 18시) - 이 시간 이후에는 '오늘 건' 발생 중단
    const BUSINESS_END_HOUR = 18;

    // 이미 오늘 발생했으면 skip (triggerClassEconomicEvent 내부에도 있지만 조기 종료로 비용 절감)
    if (settings.lastEventDate === todayStr) {
      logger.info(
        `[경제이벤트] ${classCode}: 오늘(${todayStr}) 이미 발생 - skip`,
      );
      continue;
    }

    // 아직 triggerHour 이전이면 대기 (너무 이른 시간에 발생하지 않도록)
    if (currentHour < triggerHour) {
      logger.info(
        `[경제이벤트] ${classCode}: KST ${currentHour}:${String(currentMinute).padStart(2, "0")} < 트리거 ${triggerHour}:00 - 대기`,
      );
      continue;
    }

    // 영업시간 종료 후면 skip (다음 평일로 넘김)
    if (currentHour >= BUSINESS_END_HOUR) {
      logger.info(
        `[경제이벤트] ${classCode}: KST ${currentHour}시 ≥ ${BUSINESS_END_HOUR}시 - 오늘 기회 종료`,
      );
      continue;
    }

    // triggerHour 이후이고 오늘 아직 미발생 → 즉시 발생 (GH Actions drop에 내성)
    try {
      const result = await triggerClassEconomicEvent(classCode);
      if (result) {
        results.push(result);
        triggered++;
      }
    } catch (error) {
      logger.error(`[경제이벤트] ${classCode}: 오류`, error.message);
      // 학급 하나가 실패해도 다른 학급은 돌린다(부분 실패 허용). 다만 **삼키지는 않는다** —
      // 호출자(hourlySchedulerV2)가 이걸 봐야 job 이 초록색으로 끝나지 않는다(codex HIGH).
      classErrors.push(`${classCode}: ${error?.message || error}`);
    }
  }

  logger.info(
    `[경제이벤트] 완료: ${settingsSnapshot.size}개 학급 확인, ${triggered}개 이벤트 발생` +
      (classErrors.length ? ` (실패 학급 ${classErrors.length})` : ""),
  );
  return {
    processed: settingsSnapshot.size,
    triggered,
    results,
    classErrors: classErrors.length ? classErrors : undefined,
  };
}

module.exports = {
  DEFAULT_EVENT_TEMPLATES,
  getStockTaxMultiplier,
  triggerClassEconomicEvent,
  runEconomicEventsForAllClasses,
  executeEvent,
  // 가치 고정 아이템(자유시간 등) 판별 — 물가 이벤트·국고 되팔기에서 공통 제외
  isStorePriceEventExcluded,
  STORE_PRICE_EVENT_EXCLUDED_KEYWORDS,
};
