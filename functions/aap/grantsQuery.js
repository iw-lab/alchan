// functions/aap/grantsQuery.js
// 🔎 지급 원장 조회의 **순수 규칙** — 질의 정규화·집계·이상치 판정. Firestore 를 모른다.
//
// 왜 조회에까지 순수 모듈을 두나 (rewardRules·learningRules 와 같은 이유)
//   이 화면이 틀리면 교사가 **없는 사고를 환수**하거나 **있는 사고를 못 본다.**
//   둘 다 돈이다. 경계값(누구 학급인가·얼마나 받았나)을 에뮬레이터 없이 잠글 수 있어야 한다.
//
// 이 파일이 지키는 것
//   · 학급 스코프는 **서버가 정한다** — 요청이 보낸 classCode 를 그대로 믿지 않는다
//   · 표시 합계는 **서버 카운터와 같은 의미**여야 한다(환수해도 캡은 안 돌아온다)
//   · 잘라낸 것은 잘라냈다고 말한다 — 조용한 상한은 "전부 봤다"는 거짓말이 된다
const { CLASS_CODE_RE, UID_RE, GLOBAL_CEILING } = require("./rewardRules");
const { APP_ID_RE } = require("./policy");
const L = require("./learningRules");

/**
 * 한 번에 **읽을** 지급 건수의 천장. 표시 개수가 아니라 **비용 천장**이다.
 *
 * 조회는 커서로 하루치를 끝까지 훑으므로(`grants.js` scanGrants) 보통은 여기 안 닿는다.
 * 닿았다는 건 그날 그 학급에 이만큼 지급이 났다는 뜻이고, 그건 화면 문제가 아니라 사고다 —
 * 그때는 `truncated` 로 말하고 나머지는 운영 스크립트(`scripts/ops/aap-grants.mjs`)로 본다.
 */
const LIMITS = Object.freeze({ DEFAULT: 300, MAX: 1000 });

/**
 * 🚩 이상치 표시선 — **학생 하루 상한 대비 비율**이다.
 *
 * ⚠️ 차단기(`rewardRules.BREAKER`)와 숫자가 같지만 **같은 상수를 쓰지 않는다.** 저쪽은 앱 총액에
 *    거는 **안전장치**고 이쪽은 학생별 **가시성**이다. 하나로 묶으면 안전장치를 조율한 것이
 *    교사 화면의 의미까지 조용히 바꾼다 — 축이 다른 값은 따로 두는 편이 고칠 때 안전하다.
 */
const ANOMALY = Object.freeze({ WARN_RATIO: 0.5, DANGER_RATIO: 0.8 });

const DENY_MESSAGE = Object.freeze({
  bad_day: "날짜 형식이 올바르지 않습니다.",
  bad_app: "앱 정보가 올바르지 않습니다.",
  bad_class: "학급 코드가 올바르지 않습니다.",
  bad_limit: "조회 개수가 올바르지 않습니다.",
  other_class: "우리 반 기록만 볼 수 있어요.",
  no_class: "학급이 지정되지 않은 계정은 조회할 수 없습니다.",
});

/**
 * 거부 사유 → callable 에러 코드·문구. `clawback.js` 의 CLAWBACK_ERROR 와 같은 모양.
 *
 * ⚠️ `DENY_MESSAGE[reason]` 로 바로 읽지 않는다. `"constructor"`·`"toString"` 이 들어오면
 *    프로토타입 값이 잡혀 폴백이 안 걸리고 **함수 객체가 문구 자리로 나간다**(테스트가 잡음).
 *    이 저장소는 같은 함정을 등급 폴백에서 이미 한 번 밟았다(P1-7).
 */
function queryError(reason) {
  if (!Object.prototype.hasOwnProperty.call(DENY_MESSAGE, reason)) {
    return ["failed-precondition", "지금은 조회할 수 없습니다."];
  }
  const permission = reason === "other_class" || reason === "no_class";
  return [permission ? "permission-denied" : "invalid-argument", DENY_MESSAGE[reason]];
}

/**
 * 질의를 정규화한다(순수). **여기가 학급 경계의 유일한 벽이다.**
 *
 * 🔴 교사가 보낸 `classCode` 를 쓰지 않는다. 조회는 쓰기가 아니라 방심하기 쉬운데,
 *    이 원장에는 학생 uid·금액·성취가 다 들어 있다. 이 저장소는 "쓰기는 학급으로 잠그고
 *    읽기는 클라가 알아서 필터하겠지"로 열어 둔 컬렉션이 7곳 있었던 전례가 있다.
 *
 * @param {*} raw 요청 데이터
 * @param {object} ctx 호출자 맥락
 * @param {*} ctx.callerClass 호출자의 학급
 * @param {boolean} ctx.isSuperAdmin 슈퍼관리자 여부
 * @param {number} ctx.nowMs 현재 시각
 * @return {{ok: boolean, reason?: string, value?: object}} 판정
 */
function normalizeQuery(raw, { callerClass, isSuperAdmin, nowMs }) {
  const q = raw && typeof raw === "object" ? raw : {};

  // 날짜 — 안 주면 오늘(KST). **주었는데 이상하면 오늘로 갈음하지 않고 거부한다.**
  //   조용히 오늘로 바꾸면 교사는 어제를 본다고 믿으면서 오늘을 본다.
  let day;
  if (q.day === undefined || q.day === null || q.day === "") {
    day = L.kstDayKey(nowMs);
  } else if (typeof q.day === "string" && /^\d{8}$/.test(q.day)) {
    day = q.day;
  } else {
    return { ok: false, reason: "bad_day" };
  }

  let appId = null;
  if (q.appId !== undefined && q.appId !== null && q.appId !== "") {
    if (typeof q.appId !== "string" || !APP_ID_RE.test(q.appId)) return { ok: false, reason: "bad_app" };
    appId = q.appId;
  }

  let limit = LIMITS.DEFAULT;
  if (q.limit !== undefined && q.limit !== null) {
    if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > LIMITS.MAX) {
      return { ok: false, reason: "bad_limit" };
    }
    limit = q.limit;
  }

  // ─── 학급 스코프 ───
  if (isSuperAdmin) {
    // 슈퍼관리자만 학급을 **지정**할 수 있다. 안 주면 전 학급(운영 진단용).
    let classCode = null;
    if (q.classCode !== undefined && q.classCode !== null && q.classCode !== "") {
      if (typeof q.classCode !== "string" || !CLASS_CODE_RE.test(q.classCode)) {
        return { ok: false, reason: "bad_class" };
      }
      classCode = q.classCode;
    }
    return { ok: true, value: { classCode, day, appId, limit, scope: "all" } };
  }

  // 교사 — 자기 학급으로 **고정**한다. `미지정` 같은 값은 CLASS_CODE_RE 를 통과하지 못한다.
  if (typeof callerClass !== "string" || !CLASS_CODE_RE.test(callerClass)) {
    return { ok: false, reason: "no_class" };
  }
  // 다른 학급을 명시해 왔으면 조용히 바꾸지 않고 **거부**한다 — 무엇을 보고 있는지가
  // 화면과 어긋나면 그 화면으로 환수를 누른다.
  if (q.classCode !== undefined && q.classCode !== null && q.classCode !== "" && q.classCode !== callerClass) {
    return { ok: false, reason: "other_class" };
  }
  return { ok: true, value: { classCode: callerClass, day, appId, limit, scope: "class" } };
}

/** 정수·0 이상인가. 원장 값이 손상됐을 때 합계에 섞지 않기 위한 판정. */
function sane(v) {
  return Number.isInteger(v) && v >= 0;
}

/**
 * 지급 목록을 학생별로 접고 이상치를 표시한다(순수).
 *
 * 🔴 **환수된 건도 합계에 센다.** 서버의 하루 카운터는 환수해도 되돌아오지 않는다
 *    (`clawback.js` — 환수→재지급으로 발행 한도를 무한 재사용하는 길을 막으려고 일부러 그렇게 했다).
 *    화면이 회수분을 빼서 보여 주면 교사는 40% 로 읽는데 서버는 100% 라 지급을 막는다 —
 *    **두 숫자가 다른 뜻이 되는 순간 교사는 화면을 못 믿는다.** 회수분은 따로 보여 준다.
 *
 * @param {object} p 파라미터
 * @param {Array<object>} p.grants 지급 원장(경량 투영)
 * @param {Map<string, object>} p.clawbacks grantId → 역원장
 * @return {{rows: Array<object>, students: Array<object>, totals: object}} 집계
 */
function summarize({ grants, clawbacks }) {
  const back = clawbacks instanceof Map ? clawbacks : new Map();
  const totals = {
    count: 0, cash: 0, coupon: 0,
    clawedCount: 0, recoveredCash: 0, recoveredCoupon: 0,
    corrupt: 0,
  };
  const byStudent = new Map();

  const rows = (Array.isArray(grants) ? grants : []).map((g) => {
    const cash = g.rewardType === "cash";
    const amount = g.amount;
    const ok = sane(amount);
    if (!ok) totals.corrupt += 1;
    const add = ok ? amount : 0;

    const cb = back.get(g.id) || null;
    const recovered = cb && sane(cb.recoveredAmount) ? cb.recoveredAmount : 0;

    totals.count += 1;
    if (cash) totals.cash += add; else totals.coupon += add;
    if (cb) {
      totals.clawedCount += 1;
      if (cash) totals.recoveredCash += recovered; else totals.recoveredCoupon += recovered;
    }

    // uid 가 이상한 원장은 학생 집계에 넣지 않는다(행으로는 보여 준다 — 숨기면 조사가 막힌다).
    if (typeof g.uid === "string" && UID_RE.test(g.uid)) {
      const cur = byStudent.get(g.uid) || { uid: g.uid, cash: 0, coupon: 0, count: 0, clawedCount: 0 };
      cur.count += 1;
      if (cash) cur.cash += add; else cur.coupon += add;
      if (cb) cur.clawedCount += 1;
      byStudent.set(g.uid, cur);
    }

    return { ...g, clawback: cb };
  });

  // 최신순. 같은 밀리초면 id 로 갈라 **정렬이 흔들리지 않게** 한다(페이지마다 순서가 바뀌면
  // 교사가 같은 건을 두 번 본 것으로 착각한다).
  rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) || String(a.id).localeCompare(String(b.id)));

  const students = [...byStudent.values()].map((s) => {
    const cashRatio = GLOBAL_CEILING.STUDENT_CASH_PER_DAY > 0
      ? s.cash / GLOBAL_CEILING.STUDENT_CASH_PER_DAY : 0;
    const couponRatio = GLOBAL_CEILING.STUDENT_COUPON_PER_DAY > 0
      ? s.coupon / GLOBAL_CEILING.STUDENT_COUPON_PER_DAY : 0;
    const worst = Math.max(cashRatio, couponRatio);
    const level = worst >= ANOMALY.DANGER_RATIO ? "danger" : worst >= ANOMALY.WARN_RATIO ? "warn" : "ok";
    return { ...s, cashRatio, couponRatio, level };
  });
  // 많이 받은 학생이 위로 — 이상치를 찾으러 오는 화면이다.
  students.sort((a, b) =>
    Math.max(b.cashRatio, b.couponRatio) - Math.max(a.cashRatio, a.couponRatio) ||
    a.uid.localeCompare(b.uid));

  return { rows, students, totals };
}

module.exports = {
  LIMITS,
  ANOMALY,
  DENY_MESSAGE,
  queryError,
  normalizeQuery,
  summarize,
};
