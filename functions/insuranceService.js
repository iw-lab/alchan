/**
 * 재난 보험 — 가입(buyInsurance). 계산 규칙은 insuranceMath.js, 보험금 지급은 economicEvents.js(executeCashPenalty).
 *
 * 돈의 길: 보험료 = 학생 → 국고(승인 교사 cash). 보험금 = «현금 긴급 차감»에서 덜 걷는 것으로 지급
 *   (학생은 손실−보험금만 내고, 국고도 그만큼만 받는다 — 어느 쪽에서도 돈이 생기거나 사라지지 않는다).
 * 정책 문서: insurancePolicies/{classCode}_{uid} — 서버만 쓴다(rules write:false).
 *
 * 2026-11-11 설계 교차검증 반영:
 *   · 유효한 정책이 있으면 재가입 거절(한도 쌓기 금지). 만료 뒤에도 10분은 재가입을 막는다 —
 *     이벤트가 «옛 정책»을 읽고 배치를 쓰는 사이에 새 정책으로 바뀌면 새 한도가 깎이기 때문이다.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  db, admin, logger, checkAuthAndGetUserData, hasAdminPower, findApprovedAdminSnap,
  checkIdempotent, markIdempotent,
} = require("./utils");
const { quotePremium, toMs, TERM_MS, TERM_DAYS, COVERAGE_RATE } = require("./insuranceMath");

const REBUY_GAP_MS = 10 * 60 * 1000;

/** 학급 설정에서 보험이 켜져 있나(없으면 켜짐). */
function insuranceEnabled(bankingData) {
  return !(bankingData && bankingData.insurance && bankingData.insurance.enabled === false);
}

function policyRef(classCode, uid) {
  return db.collection("insurancePolicies").doc(`${classCode}_${uid}`);
}

const buyInsurance = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { idempotencyKey } = request.data || {};
  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    throw new HttpsError("invalid-argument", "idempotencyKey가 필요합니다.");
  }
  if (!classCode || typeof classCode !== "string" || classCode.includes("/")) {
    throw new HttpsError("failed-precondition", "학급 코드가 없습니다.");
  }
  if (hasAdminPower(userData) || userData?.isAdmin === true) {
    throw new HttpsError("failed-precondition", "선생님(국고) 계정은 보험에 가입할 수 없습니다.");
  }
  const adminSnap = await findApprovedAdminSnap(classCode);
  if (adminSnap.empty) {
    throw new HttpsError("failed-precondition", "선생님(국고) 계정을 찾을 수 없습니다.");
  }
  const teacherId = adminSnap.docs[0].id;
  if (teacherId === uid) {
    throw new HttpsError("failed-precondition", "선생님(국고) 계정은 보험에 가입할 수 없습니다.");
  }
  const userRef = db.collection("users").doc(uid);
  const teacherRef = db.collection("users").doc(teacherId);
  const polRef = policyRef(classCode, uid);
  const settingsRef = db.collection("bankingSettings").doc(classCode);
  const inc = admin.firestore.FieldValue.increment;
  const sts = () => admin.firestore.FieldValue.serverTimestamp();

  try {
    let result = null;
    await db.runTransaction(async (tx) => {
      const keyRef = await checkIdempotent(tx, idempotencyKey);
      const [uSnap, tSnap, pSnap, sSnap] = await Promise.all([
        tx.get(userRef), tx.get(teacherRef), tx.get(polRef), tx.get(settingsRef),
      ]);
      if (!uSnap.exists) throw new HttpsError("not-found", "사용자 정보가 없습니다.");
      if (!tSnap.exists) throw new HttpsError("failed-precondition", "선생님(국고) 계정을 찾을 수 없습니다.");
      const u = uSnap.data();
      const t = tSnap.data();
      if (u.classCode !== classCode) throw new HttpsError("failed-precondition", "학급 정보가 일치하지 않습니다.");
      if (t.classCode !== classCode || !hasAdminPower(t)) {
        throw new HttpsError("failed-precondition", "유효한 국고(관리자) 계정이 아닙니다.");
      }
      if (typeof t.cash !== "number" || !Number.isFinite(t.cash)) {
        throw new HttpsError("failed-precondition", "국고 잔액 데이터에 오류가 있습니다.");
      }
      if (!insuranceEnabled(sSnap.exists ? sSnap.data() : null)) {
        throw new HttpsError("failed-precondition", "우리 반은 지금 보험을 운영하지 않아요.");
      }
      const now = Date.now();
      const prev = pSnap.exists ? pSnap.data() : null;
      if (prev) {
        const exp = toMs(prev.expiresAt);
        if (exp > now) throw new HttpsError("already-exists", "이미 보험에 가입되어 있어요. 기간이 끝나면 다시 들 수 있어요.");
        if (exp + REBUY_GAP_MS > now) throw new HttpsError("failed-precondition", "보험이 방금 끝났어요. 10분 뒤에 다시 가입할 수 있어요.");
      }
      const q = quotePremium(u.cash);
      if (!q.ok) {
        throw new HttpsError(
          "failed-precondition",
          q.reason === "not-enough-cash" ? "보험료를 낼 현금이 부족해요." : "계정 잔액 데이터에 오류가 있습니다.",
        );
      }
      const expiresAt = admin.firestore.Timestamp.fromMillis(now + TERM_MS);
      const prevPayout = prev && typeof prev.payoutTotal === "number" && Number.isFinite(prev.payoutTotal) ? prev.payoutTotal : 0;
      const prevPremium = prev && typeof prev.premiumTotal === "number" && Number.isFinite(prev.premiumTotal) ? prev.premiumTotal : 0;
      const prevCount = prev && typeof prev.purchaseCount === "number" && Number.isFinite(prev.purchaseCount) ? prev.purchaseCount : 0;

      tx.update(userRef, { cash: inc(-q.premium), updatedAt: sts() });
      tx.update(teacherRef, { cash: inc(q.premium), updatedAt: sts() });
      tx.set(polRef, {
        classCode,
        userId: uid,
        premium: q.premium,
        cap: q.cap,
        capRemaining: q.cap,
        coverageRate: COVERAGE_RATE,
        startAt: sts(),
        expiresAt,
        payoutThisTerm: 0,
        payoutTotal: prevPayout,
        premiumTotal: prevPremium + q.premium,
        purchaseCount: prevCount + 1,
        updatedAt: sts(),
      });
      const logExpire = new Date(now + 90 * 24 * 60 * 60 * 1000);
      tx.set(db.collection("activity_logs").doc(), {
        classCode,
        userId: uid,
        userName: u.name || "사용자",
        type: "보험료 납부",
        description: `재난 보험 ${TERM_DAYS}일 가입 — 보험료 ${q.premium.toLocaleString()}원, 보장 한도 ${q.cap.toLocaleString()}원`,
        amount: -q.premium,
        couponAmount: 0,
        metadata: { premium: q.premium, cap: q.cap, coverageRate: COVERAGE_RATE, teacherId },
        timestamp: sts(),
        createdAt: sts(),
        expireAt: admin.firestore.Timestamp.fromDate(logExpire),
      });
      markIdempotent(tx, keyRef);
      result = { premium: q.premium, cap: q.cap, expiresAtMs: now + TERM_MS };
    });
    return { success: true, ...result };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error(`[buyInsurance] ${uid}:`, error);
    throw new HttpsError("aborted", error.message || "보험 가입에 실패했습니다.");
  }
});

module.exports = { buyInsurance, insuranceEnabled, policyRef, REBUY_GAP_MS };
