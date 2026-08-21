// functions/aap/clawback.js
// ↩️ AAP 보상 **환수**(P1-9b) — 잘못 나간 지급을 되돌린다.
//
// 왜 `adminCashAction`(관리자 회수)으로 안 하나
//   회수는 학생에게서 빼서 **국고에 넣는다**. 그런데 학습앱 보상은 국고에서 나온 돈이 아니다 —
//   `grantAppReward` 는 국고를 건드리지 않고 학생 잔액을 `increment` 로 **발행**한다.
//   그걸 회수로 되돌리면 국고에 **없던 돈이 생긴다.** 발행의 반대는 회수가 아니라 **소각**이다.
//   그래서 이 함수는 어디에도 적립하지 않는다.
//
// 왜 원장을 고치지 않고 별도 컬렉션인가
//   `appRewardGrants` 는 append-only 감사 원장이라고 선언돼 있고 rules 가 슈퍼관리자에게도
//   쓰기를 막는다. 원본에 `clawedBack: true` 를 찍으면 그 선언이 거짓이 된다.
//   `appRewardClawbacks/{grantId}` 를 `create()` 로 만들면 **문서 id 가 곧 멱등키**이고
//   동시에 역원장이다(지급 원장이 requestHash 를 id 로 쓰는 것과 같은 수법).
//
// 왜 onCall 을 여기 두지 않나
//   `reward.js` 와 같은 모양이다 — 순수 핸들러는 여기, 진입점(onCall)은 handlers.js.
//   onCall 안에 로직이 있으면 테스트가 firebase-functions 의 내부(`.run()`)에 기대야 하고,
//   `checkAuthAndGetUserData` 가 utils 모듈 내부 바인딩의 db 를 붙잡아 **진짜 Firestore** 가 붙는다.
const { logger, db, admin, LOG_TYPES, sanitizeInput } = require("../utils");
const { clampTakeAmount } = require("../cashFloor");

const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

/** 원장 문서 id 형식(= requestHash, sha256 hex). 경로에 이상한 값이 들어오지 않게 막는다. */
const GRANT_ID_RE = /^[0-9a-f]{64}$/;

/**
 * 잔액이 **계산에 쓸 수 있는 값**인가.
 *
 * ⚠️ `clampTakeAmount` 는 `Number.isFinite` 가 아니면 잔액을 **0 으로 읽는다**(cashFloor.js).
 *    그 뒤 이 함수가 "회수액 0, 환수 완료" 를 확정하면, 손상된 잔액 하나 때문에 그 지급은
 *    **영구히 회수 불가**가 된다(2026-08-21 codex 설계검토 CRITICAL).
 *    모르면 되돌리지 않는다 — 되돌린 척하는 것보다 낫다.
 *
 * @param {*} v 잔액
 * @return {boolean} 정수면 true
 */
const usableBalance = (v) => Number.isInteger(v);
// ⚠️ `Number.isFinite` 가 아니라 **`isInteger`** 다. 이 경제는 소수를 쓰지 않으므로 `5000.5` 는
//    정상값이 아니라 손상이고, isFinite 로 완화하면 그런 잔액에서 `clampTakeAmount` 가
//    소수를 그대로 빼 잔액이 영원히 소수로 남는다.

/**
 * 사유 코드 → [HttpsError 코드, 학생·교사에게 보일 문구].
 *
 * ⚠️ `MAP[reason] || DEFAULT` 로 조회하지 않는다. `"constructor"`·`"toString"` 같은
 *    프로토타입 키는 Object.prototype 에서 **truthy** 한 값을 돌려줘 폴백이 안 걸린다
 *    (이 저장소는 등급 폴백이 정확히 이걸로 샌 적이 있다 — P1-7).
 *    지금은 사유가 코드 안의 고정 집합이라 도달 불가지만, **상수 목록이 우연히 안전한 것**과
 *    조회가 안전한 것은 다르다.
 *
 * @param {string} reason 사유 코드
 * @return {[string, string]} HttpsError 코드와 문구
 */
function clawbackError(reason) {
  return Object.prototype.hasOwnProperty.call(CLAWBACK_ERROR, reason)
    ? CLAWBACK_ERROR[reason]
    : ["failed-precondition", "지금은 환수할 수 없습니다."];
}

const CLAWBACK_ERROR = Object.freeze({
  bad_grant_id: ["invalid-argument", "환수할 지급 기록을 찾을 수 없습니다."],
  grant_not_found: ["not-found", "그 지급 기록이 없습니다."],
  student_missing: ["not-found", "학생 정보를 찾을 수 없습니다."],
  other_class: ["permission-denied", "우리 반 학생의 기록만 환수할 수 있어요."],
  not_revocable: ["failed-precondition", "이 보상은 되돌릴 수 없도록 설정돼 있어요."],
  reason_required: ["invalid-argument", "되돌릴 수 없도록 설정된 보상입니다. 사유를 적어야 처리할 수 있습니다."],
  bad_grant_amount: ["failed-precondition", "지급 기록의 금액이 올바르지 않습니다."],
  balance_corrupt: ["failed-precondition", "학생의 잔액이 올바르지 않아 환수를 진행하지 않았습니다. 선생님께 문의해 주세요."],
});

/** 거부 사유를 코드로 던진다. HttpsError 로의 변환은 진입점(handlers.js)이 한다. */
class ClawbackDenied extends Error {
  /** @param {string} reason 사유 코드 */
  constructor(reason) {
    super(reason);
    this.name = "ClawbackDenied";
    this.reason = reason;
  }
}

/**
 * ↩️ 지급 1건을 환수한다.
 *
 * @param {object} p 파라미터
 * @param {string} p.callerUid 호출한 관리자
 * @param {string} p.callerName 표시용 이름
 * @param {string} p.callerClass 호출자의 학급
 * @param {boolean} p.isSuperAdmin 슈퍼관리자 여부
 * @param {*} p.grantId 되돌릴 지급 원장의 문서 id
 * @param {*} p.reason 사유(선택. revocable:false 를 슈퍼관리자가 되돌릴 땐 필수)
 * @param {number} [p.nowMs] 현재 시각
 * @return {Promise<object>} 결과
 */
async function clawbackAppReward({
  callerUid, callerName, callerClass, isSuperAdmin, grantId, reason: rawReason, nowMs = Date.now(),
}) {
  if (typeof grantId !== "string" || !GRANT_ID_RE.test(grantId)) {
    throw new ClawbackDenied("bad_grant_id");
  }
  const reason = typeof rawReason === "string" ? sanitizeInput(rawReason.slice(0, 200)) : "";

  const grantRef = db.collection("appRewardGrants").doc(grantId);
  const clawbackRef = db.collection("appRewardClawbacks").doc(grantId);

  const out = await db.runTransaction(async (tx) => {
    // ─── 읽기 구간 ───

    // ① 멱등이 먼저다. 이미 환수된 건이면 **아무것도 하지 않고** 같은 답을 돌려준다.
    //    두 번 빼면 학생이 받은 적 없는 돈을 잃는다.
    const doneSnap = await tx.get(clawbackRef);
    if (doneSnap.exists) {
      const d = doneSnap.data();
      return {
        duplicate: true,
        grantId,
        requestedAmount: d.requestedAmount,
        recoveredAmount: d.recoveredAmount,
        shortfall: d.shortfall,
      };
    }

    const grantSnap = await tx.get(grantRef);
    if (!grantSnap.exists) throw new ClawbackDenied("grant_not_found");
    const grant = grantSnap.data();

    const studentRef = db.collection("users").doc(grant.uid);
    const studentSnap = await tx.get(studentRef);
    if (!studentSnap.exists) throw new ClawbackDenied("student_missing");
    const student = studentSnap.data();

    // ─── 인가 ───
    //
    // ⚠️ `grantId` 는 **비밀이 아니다.** 지급 활동로그의 metadata 에 들어가고 그 로그는 같은
    //    학급 전체가 읽는다(firestore.rules `activity_logs` = isSameClassFast).
    //    그러니 "id 를 아는 사람"이 아니라 **여기서** 막아야 한다.
    //    그리고 `checkAuthAndGetUserData(request, true)` 는 **승인된 교사인지만** 보고
    //    대상 학급은 보지 않는다(functions/utils.js) — 학급 대조는 이 함수의 몫이다.
    if (!isSuperAdmin) {
      const sameClass =
        typeof callerClass === "string" &&
        callerClass.length > 0 &&
        grant.classCode === callerClass &&
        student.classCode === callerClass;
      if (!sameClass) {
        // 전학 갔거나 남의 학급 원장이다. 교사가 손댈 자리가 아니다.
        throw new ClawbackDenied("other_class");
      }
      // 🔒 카탈로그가 "되돌릴 수 없음"으로 등록한 보상(revocable:false)은 교사가 못 건드린다.
      //    슈퍼관리자는 할 수 있지만 **사유를 남겨야** 한다 — 예외에는 이유가 남아야 예외다.
      if (grant.revocable !== true) {
        throw new ClawbackDenied("not_revocable");
      }
    } else if (grant.revocable !== true && reason.length === 0) {
      throw new ClawbackDenied("reason_required");
    }

    // ─── 금액 확정 ───
    const cash = grant.rewardType === "cash";
    const requested = grant.amount;
    if (!Number.isInteger(requested) || requested <= 0) {
      throw new ClawbackDenied("bad_grant_amount");
    }
    const balance = cash ? student.cash : student.coupons;
    if (!usableBalance(balance)) {
      logger.error(`[AAP] 환수 중단 — 잔액 손상 uid=${grant.uid} type=${grant.rewardType}`);
      throw new ClawbackDenied("balance_corrupt");
    }

    // 0 원 아래로는 내려가지 않는다(이 저장소의 오래된 규약 — functions/cashFloor.js).
    const { amount: recovered } = clampTakeAmount(balance, requested);
    const shortfall = requested - recovered;

    // ─── 쓰기 구간 ───

    // 💥 **소각이다.** 어디에도 적립하지 않는다 — 지급이 국고를 안 건드렸으므로
    //    되돌릴 때 국고에 넣으면 없던 돈이 생긴다.
    if (recovered > 0) {
      tx.update(studentRef, {
        ...(cash
          ? { cash: FieldValue.increment(-recovered) }
          : { coupons: FieldValue.increment(-recovered) }),
      });
    }

    // 🧾 역원장 겸 멱등키. `create` 라 경합에서도 두 번 빠지지 않는다.
    //
    // ⚠️ **하루 카운터·성취 횟수·쿨다운·차단 플래그는 하나도 되돌리지 않는다.**
    //    하루 캡은 잔액 회계가 아니라 **발행 속도 제한**이다. 환수가 캡을 되열어 주면
    //    "환수 → 재지급" 으로 하루 상한을 무한히 우회할 수 있다.
    //    대가는 그날 그 학생·앱이 계속 막히는 가용성 문제뿐이고, 돈 쪽에선 이게 fail-safe 다.
    tx.create(clawbackRef, {
      grantId,
      uid: grant.uid,
      classCode: grant.classCode,
      appId: grant.appId,
      achievementId: grant.achievementId,
      rewardType: grant.rewardType,
      requestedAmount: requested,
      recoveredAmount: recovered,
      // 학생이 이미 써 버려서 못 받아낸 몫. **이 함수는 한 번만 돈다** — 남은 몫은 교사가
      // 일반 회수(관리자 지급/회수)로 처리한다. 여기서 재시도하면 멱등이 깨진다.
      shortfall,
      revocable: grant.revocable === true,
      reason,
      byUid: callerUid,
      byName: callerName || "관리자",
      bySuperAdmin: isSuperAdmin === true,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 👀 학생 화면용 projection. 지급이 activity_logs 에 **양수**로 남으므로 환수는 같은 자리에
    //    **음수**로 남긴다(루트 transactions 는 안 쓴다 — 두 소스를 다 쓰면 MyAssets 가
    //    같은 거래를 두 번 센다. functions/index.js 의 관리자 회수 주석 참고).
    tx.set(db.collection("activity_logs").doc(), {
      userId: grant.uid,
      userName: student.name || "학생",
      classCode: grant.classCode,
      type: cash ? LOG_TYPES.ADMIN_CASH_TAKE : LOG_TYPES.COUPON_TAKE,
      description: sanitizeInput(
        `학습앱 보상 환수 · ${grant.label || grant.achievementId}` +
          (shortfall > 0
            ? ` (요청 ${requested.toLocaleString("ko-KR")} 중 잔액만큼만 — 0 아래로는 내려가지 않습니다)`
            : "") +
          (reason ? ` · 사유: ${reason}` : ""),
      ),
      amount: cash ? -recovered : 0,
      couponAmount: cash ? 0 : -recovered,
      metadata: { source: "aap_clawback", appId: grant.appId, grantId, shortfall },
      timestamp: FieldValue.serverTimestamp(),
      expireAt: Timestamp.fromMillis(nowMs + 90 * 24 * 60 * 60 * 1000),
    });

    return { duplicate: false, grantId, requestedAmount: requested, recoveredAmount: recovered, shortfall };
  });

  if (!out.duplicate) {
    logger.info("[AAP] 환수", {
      event: "aap_reward_clawback",
      grant: grantId,
      requested: out.requestedAmount,
      recovered: out.recoveredAmount,
      shortfall: out.shortfall,
      by: callerUid,
    });
  }
  return { success: true, ...out };
}

module.exports = { clawbackAppReward, ClawbackDenied, clawbackError, GRANT_ID_RE };
