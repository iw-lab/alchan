/* eslint-disable max-len */
// ===================================================================================
// 🎟️ 관리자 쿠폰 지급/회수 (2026-11-17 CF 이관 — CouponTransfer 의 클라 직접 write 대체)
//   왜: 쿠폰(coupons)은 rules 에서 교사(isAdmin)만 직접 쓸 수 있다(batch7-b — 학생 자가 적립→sellCoupon 현금화 봉인).
//       그래서 «쿠폰 보내기/가져오기» 위임을 받은 학생은 화면은 열려도 실제로는 쓰기가 막혀 조용히 실패했다.
//       대통령에게 이 권한을 열면서(사용자 «대통령은 보내기 가져오기 관리자 기능을 열어줘») 서버로 옮긴다.
//   - 권한: 관리자 · 위임(delegatedPermissions.couponTransfer) · 교사가 임명한 대통령 — 서버 강제(transferPower.js).
//   - adminCashAction(돈)과 같은 규약: 같은 학급만 · 대상별 원자 트랜잭션 · 대상별 멱등 서브키 ·
//     위임·대통령은 자기 자신 대상 금지 · 회수는 0개 바닥(마이너스 없음) · 가져온 쿠폰(toMe)은 국고(승인 교사)로.
//   - 기록: activity_logs(type couponAdminAction — 종전 화면이 남기던 것과 같은 type) 1건씩.
// ===================================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  checkAuthAndGetUserData,
  checkIdempotent,
  markIdempotent,
  hasAdminPower,
  findApprovedAdminSnap,
  sanitizeInput,
  db,
  admin,
  logger,
} = require("./utils");
const { transferPowerOf } = require("./transferPower");

const MAX_COUPONS = 1000000;

exports.adminCouponAction = onCall({ region: "asia-northeast3" }, async (request) => {
  const { uid, classCode, userData } = await checkAuthAndGetUserData(request);
  const { targetUserIds, action, takeMode, amountType, amount, idempotencyKey } = request.data || {};

  // 1) 권한 — 서버가 다시 판정한다(화면 표시는 믿지 않는다)
  const power = await transferPowerOf(userData, classCode, "couponTransfer", hasAdminPower(userData));
  if (!power.allowed) {
    throw new HttpsError("permission-denied", "관리자, 위임받은 학생, 임명된 대통령만 사용할 수 있습니다.");
  }
  const isDelegated = !power.isAdmin;

  // 2) 입력
  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0 || targetUserIds.length > 200 ||
      targetUserIds.some((id) => typeof id !== "string" || !id)) {
    throw new HttpsError("invalid-argument", "대상 학생 목록이 올바르지 않습니다.");
  }
  if (action !== "send" && action !== "take") throw new HttpsError("invalid-argument", "action이 올바르지 않습니다.");
  if (action === "take" && takeMode !== "toMe" && takeMode !== "remove") {
    throw new HttpsError("invalid-argument", "회수 방식이 올바르지 않습니다.");
  }
  if (amountType !== "fixed" && amountType !== "percentage") throw new HttpsError("invalid-argument", "개수 유형이 올바르지 않습니다.");
  if (amountType === "percentage") {
    if (typeof amount !== "number" || !(amount > 0 && amount <= 100)) throw new HttpsError("invalid-argument", "퍼센트는 0보다 크고 100 이하여야 합니다.");
  } else if (!Number.isInteger(amount) || amount < 1 || amount > MAX_COUPONS) {
    throw new HttpsError("invalid-argument", "개수는 1 이상의 정수여야 합니다.");
  }
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 64) { // 대상별 키(+«_c_»+uid)가 checkIdempotent 128자 안에 들게(8way codex·gemini)
    throw new HttpsError("invalid-argument", "요청 번호가 올바르지 않습니다. 화면을 새로고침해 주세요.");
  }

  // 3) 국고(가져온 쿠폰이 가는 곳): 위임·대통령이면 승인된 교사, 교사면 본인
  let treasuryId = uid;
  let treasuryName = userData.name || "관리자";
  if (isDelegated) {
    const adminSnap = await findApprovedAdminSnap(classCode);
    if (adminSnap.empty) throw new HttpsError("failed-precondition", "학급 관리자(국고)를 찾을 수 없습니다.");
    treasuryId = adminSnap.docs[0].id;
    treasuryName = adminSnap.docs[0].data().name || "관리자";
  }
  const actorLabel = isDelegated ? `${userData.name || "학생"}(${power.byJob ? "대통령" : "위임"})` : `관리자(${treasuryName})`;

  const increment = admin.firestore.FieldValue.increment;
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
  const updatedUsers = [];
  const failures = [];
  let successCount = 0;
  let totalProcessed = 0;
  let clampedCount = 0;
  let noBalanceCount = 0;
  let alreadyCount = 0;   // 같은 요청 번호로 이미 처리된 학생(다시 눌렀을 때) — 화면이 «0명 완료»로 오해하지 않게(8way codex·grok)
  let treasuryCoupons = null;

  for (const targetId of [...new Set(targetUserIds)]) {
    if (isDelegated && targetId === uid) { failures.push({ id: targetId, reason: "자기 자신은 처리할 수 없습니다." }); continue; } // 자기 쿠폰을 스스로 늘리거나 줄이지 못한다
    if (action === "take" && takeMode === "toMe" && targetId === treasuryId) continue; // 국고→국고 회수는 의미 없음
    try {
      const result = await db.runTransaction(async (tx) => {
        const keyRef = await checkIdempotent(tx, `${idempotencyKey}_c_${targetId}`);
        const userRef = db.collection("users").doc(targetId);
        const userDoc = await tx.get(userRef);
        const needTreasury = action === "take" && takeMode === "toMe";
        const treasuryRef = needTreasury ? db.collection("users").doc(treasuryId) : null;
        const treasuryDoc = treasuryRef ? await tx.get(treasuryRef) : null;

        if (!userDoc.exists) throw new Error("사용자를 찾을 수 없습니다.");
        const t = userDoc.data();
        if (t.classCode !== classCode) throw new Error("같은 학급의 학생만 처리할 수 있습니다.");
        // 위임·대통령은 교사(관리자) 계정의 쿠폰은 건드리지 못한다
        if (isDelegated && (t.isAdmin || t.isSuperAdmin || t.isTeacher)) throw new Error("선생님 계정은 처리할 수 없습니다.");
        // 잔액이 숫자가 아니면(문자열 "10" 등) 손대지 않는다 — increment 는 숫자가 아닌 칸을 -n 으로 덮어 학생이 음수가 되고 국고엔 n 이 생긴다(8way codex). 없으면 0
        if (t.coupons !== undefined && t.coupons !== null && (typeof t.coupons !== "number" || !Number.isFinite(t.coupons))) throw new Error("학생 쿠폰 데이터에 오류가 있습니다.");
        const current = Math.max(0, Math.floor(Number(t.coupons) || 0));

        let n = amountType === "percentage" ? Math.floor((current * amount) / 100) : amount;
        let clampedFrom = 0;
        if (action === "take" && n > current) { clampedFrom = n; n = current; } // 0개 바닥
        if (n <= 0) { markIdempotent(tx, keyRef); return { processed: false, noBalance: true }; } // 건너뜀도 이 요청 번호로 끝난 것 — 나중에 같은 번호로 다시 불러 새 잔액을 가져가지 않게(8way codex)

        if (action === "send") {
          tx.update(userRef, { coupons: increment(n), updatedAt: serverTimestamp() });
        } else {
          tx.update(userRef, { coupons: increment(-n), updatedAt: serverTimestamp() });
          if (needTreasury) {
            if (!treasuryDoc || !treasuryDoc.exists || treasuryDoc.data().classCode !== classCode) {
              throw new Error("국고(관리자) 계정을 찾을 수 없어 회수를 취소합니다.");
            }
            if (treasuryDoc.data().coupons !== undefined && typeof treasuryDoc.data().coupons !== "number") throw new Error("국고 쿠폰 데이터에 오류가 있습니다.");
            tx.update(treasuryRef, { coupons: increment(n), updatedAt: serverTimestamp() });
          }
        }
        const what = action === "send" ? "지급" : takeMode === "toMe" ? "회수(국고로)" : "삭제";
        let desc = `${actorLabel}가 ${t.name || "학생"}님${action === "send" ? "에게" : "의"} 쿠폰 ${n.toLocaleString()}개를 ${what}했습니다. (${amountType === "percentage" ? `${amount}% 적용` : "고정 개수"})`;
        if (clampedFrom) desc += ` (요청 ${clampedFrom.toLocaleString()}개 중 가진 만큼만 — 0개 아래로는 내려가지 않습니다)`;
        const expire = new Date(); expire.setDate(expire.getDate() + 90);
        tx.set(db.collection("activity_logs").doc(), {
          userId: targetId,
          userName: t.name || "",
          timestamp: serverTimestamp(),
          type: "couponAdminAction",
          description: sanitizeInput(desc),
          classCode,
          adminId: treasuryId,
          adminName: treasuryName,
          metadata: { issuedBy: uid, byJob: !!power.byJob, delegated: isDelegated, action, takeMode: takeMode || null, amountType, inputValue: amount, moved: n, previousCoupons: current },
          expireAt: admin.firestore.Timestamp.fromDate(expire),
        });
        markIdempotent(tx, keyRef);
        return { processed: true, n, clampedFrom, newCoupons: action === "send" ? current + n : current - n, treasuryNew: needTreasury ? (Number(treasuryDoc.data().coupons) || 0) + n : null };
      });
      if (result && result.processed) {
        successCount++; totalProcessed += result.n; updatedUsers.push({ id: targetId, newCoupons: result.newCoupons });
        if (result.clampedFrom) clampedCount++;
        if (result.treasuryNew !== null) treasuryCoupons = result.treasuryNew;
      } else if (result && result.noBalance) noBalanceCount++;
    } catch (error) {
      const code = error instanceof HttpsError ? error.code : "";
      if (code === "already-exists") { alreadyCount++; continue; }
      logger.error(`[adminCouponAction] ${uid} → ${targetId} 처리 오류:`, error);
      failures.push({ id: targetId, reason: error.message || "처리 실패" });
    }
  }
  if (treasuryCoupons !== null) updatedUsers.push({ id: treasuryId, newCoupons: treasuryCoupons }); // 화면의 국고 잔액도 바로(8way grok)
  return { count: successCount, totalProcessed, updatedUsers, failures, clampedCount, noBalanceCount, alreadyCount };
});
