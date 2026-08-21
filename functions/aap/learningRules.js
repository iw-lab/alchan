// functions/aap/learningRules.js
// 📚 학습기록의 **순수 규칙** — 경로·상한·집계 산술. Firestore 를 모른다.
//
// 왜 갈라 놓나 (rewardRules.js·catalogRules.js 와 같은 이유)
//   경계값을 확인하는 데 에뮬레이터가 필요하면 아무도 경계값을 확인하지 않는다.
//   입력만 주면 판정이 나오는 순수 함수여야 변이로 off-by-one 을 잡을 수 있다.
//
// 이 파일이 지키는 것 (계획서 §3.4)
//   · 문서 **경로가 아니라 필드**로 식별한다 — 경로에 값을 묻으면 학급×기간 조회가 불가능하다
//   · 문서 id 를 문자열 이어붙이기로 만들지 않는다 — `a_b`+`c` 와 `a`+`b_c` 가 충돌한다(C14)
//   · **앱별로 분리**한다 — 학생이 여러 앱을 병렬로 켜도 같은 문서에서 경합하지 않는다(C16)
const { KST_OFFSET_MS, UID_RE, CLASS_CODE_RE } = require("./rewardRules");
const { APP_ID_RE } = require("./policy");

/** 하루 경계 키(KST). 지급(`rewardRules.kstDayKey`)과 **같은 규칙**이어야 두 기록이 어긋나지 않는다. */
function kstDayKey(nowMs) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * 기록 가능한 이벤트 종류. **허용 목록**이다.
 *
 * ⚠️ 자유 문자열로 두면 앱이 아무 이름이나 보내고, 나중에 교사 화면이 무엇을 세야 할지
 *    알 수 없게 된다. 종류가 늘면 여기에 추가하는 게 맞다 — 그 순간이 곧 검토 시점이다.
 */
const EVENT_KINDS = Object.freeze(["session", "progress", "clear", "fail"]);

/**
 * 하루 상한. **돈이 아니라 쓰기 비용**을 막는 자리다.
 *
 * 이벤트 1건 = 원시문서 1 + 집계 갱신 1 + 레이트리밋 1 = 약 3W. 앱이 타이머로 30초마다
 * 보내면 학생 1명이 하루 2,880건을 만든다. 그래서 상한은 "의미 있는 경계에서만 보낸다"는
 * 계약을 **숫자로** 못 박는 것이다.
 */
const LIMITS = Object.freeze({
  /** 학생 × 앱 × 하루 이벤트 수 */
  EVENTS_PER_SUBJECT_PER_DAY: 300,
  /** 이벤트 1건이 보고할 수 있는 최대 초 — 하루보다 긴 세션은 버그이지 학습이 아니다 */
  MAX_SEC_PER_EVENT: 4 * 60 * 60,
  /** 하루 누적 초 상한 */
  MAX_SEC_PER_DAY: 12 * 60 * 60,
  /** 점수 상한 — 오버플로·표시 깨짐 방지 */
  MAX_SCORE: 1_000_000_000,
  /** meta 로 받을 수 있는 키 개수(값은 서버가 원시문서에만 보관한다) */
  MAX_META_KEYS: 8,
  /** meta 문자열 값 길이 */
  MAX_META_LEN: 120,
});

/**
 * 새 "세션"으로 치는 공백. 30분 이상 기록이 끊기면 다시 앉은 것으로 본다.
 *
 * ⚠️ **실행 id(jti)로 세지 않는다.** AAP 토큰 수명은 5분(`token.js` TTL_SEC)이라, 20분 놀면
 *    토큰을 네 번 재발급받고 jti 가 네 개가 된다 — jti 로 세면 "한 번 앉아 20분"이
 *    **4세션**이 되어 교사 화면이 거짓말을 한다. 공백 기준은 토큰 수명과 무관하다.
 */
const SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * 집계 문서 경로. 계획서 §3.4 그대로 **계층**으로 만든다.
 *
 * ⚠️ `${classCode}_${uid}_${day}` 같은 이어붙이기 id 를 쓰지 않는다 —
 *    (`a_b`,`c`) 와 (`a`,`b_c`) 가 같은 문서를 가리킨다(C14. AAP 의 pairwise 구분자를
 *    NUL 로 둔 것과 같은 함정).
 *
 * ⚠️ 지금은 `classes/{classCode}` 다. 계획서 §3.6 은 **불변 랜덤 `classId`** 를 쓰라고 하고
 *    코드 재사용 시 통계가 섞인다고 경고하는데(C18), 그 마이그레이션은 아직이다.
 *    그래서 식별값을 **전부 명시 필드로도** 남긴다 — 나중에 경로가 바뀌어도 필드로
 *    재부모화할 수 있다. 남는 노출은 "코드를 재사용하면 섞인다" 하나뿐이다.
 *
 * @param {string} classCode 학급
 * @param {string} uid 학생
 * @param {string} day KST YYYYMMDD
 * @param {string} appId 앱
 * @return {string} Firestore 경로
 */
function statsPath(classCode, uid, day, appId) {
  return `classes/${classCode}/learningStats/${uid}/days/${day}/apps/${appId}`;
}

/**
 * 요청 본문을 검증·정규화한다(순수).
 *
 * @param {*} raw 요청 본문
 * @return {{ok: boolean, reason?: string, value?: object}} 판정
 */
function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "malformed" };

  const kind = raw.kind;
  // `includes` 로 본다 — 객체 조회면 "constructor" 가 통과한다.
  if (typeof kind !== "string" || !EVENT_KINDS.includes(kind)) {
    return { ok: false, reason: "bad_kind" };
  }

  // 초·점수는 **없어도 된다**. 있으면 정수·범위 안이어야 한다.
  // ⚠️ `Number(x) || 0` 로 받지 않는다 — "abc" 가 0 이 되어 조용히 통과한다.
  const sec = raw.sec === undefined || raw.sec === null ? 0 : raw.sec;
  if (!Number.isInteger(sec) || sec < 0 || sec > LIMITS.MAX_SEC_PER_EVENT) {
    return { ok: false, reason: "bad_sec" };
  }
  const hasScore = raw.score !== undefined && raw.score !== null;
  const score = hasScore ? raw.score : 0;
  if (hasScore && (!Number.isInteger(score) || score < 0 || score > LIMITS.MAX_SCORE)) {
    return { ok: false, reason: "bad_score" };
  }

  // meta 는 **원시 문서에만** 들어간다(집계에는 안 들어간다). 앱이 자유롭게 쓰되 크기를 막는다.
  let meta = {};
  if (raw.meta !== undefined && raw.meta !== null) {
    if (typeof raw.meta !== "object" || Array.isArray(raw.meta)) {
      return { ok: false, reason: "bad_meta" };
    }
    // ⚠️ 상속 키를 세지 않는다. `Object.keys` 는 자기 소유만 준다.
    const keys = Object.keys(raw.meta);
    if (keys.length > LIMITS.MAX_META_KEYS) return { ok: false, reason: "bad_meta" };
    for (const k of keys) {
      // 🔴 **키 길이도 잰다.** 개수와 값만 재던 판에서는 2MB 짜리 키 하나가 검증을 통과하고
      //    Firestore 쓰기에서 터졌다 — 그때는 레이트리밋 쓰기와 정책·세션·집계 읽기를 이미
      //    다 태운 뒤라, 앱에는 `retryable:true` 인 503 이 가서 재시도까지 유발했다
      //    (2026-08-21 codex 재현). 통과시킬 수 없는 것은 **읽기 전에** 떨군다.
      if (k.length > LIMITS.MAX_META_LEN) return { ok: false, reason: "bad_meta" };
      const v = raw.meta[k];
      const okType =
        (typeof v === "string" && v.length <= LIMITS.MAX_META_LEN) ||
        (typeof v === "number" && Number.isFinite(v)) ||
        typeof v === "boolean";
      if (!okType) return { ok: false, reason: "bad_meta" };
      meta[k] = v;
    }
  }

  return { ok: true, value: { kind, sec, score, hasScore, meta } };
}

/**
 * 기존 집계 문서를 **오늘 것으로** 읽는다. 날짜가 다르면 새 하루다.
 *
 * ⚠️ 값이 이상하면 0 이 아니라 `null`(판단 불가)이다 — 지급 카운터와 같은 이유로
 *    fail-closed 여야 한다. "얼마나 썼는지"를 모르면 더 받지 못하게 하는 쪽이 안전하다.
 *
 * @param {*} raw 문서 데이터
 * @param {string} day KST YYYYMMDD
 * @return {{events: number, sec: number, sessions: number, best: number}|null} 집계
 */
function dayStats(raw, day) {
  // 🔴 **문서가 있는데 날짜가 다르면 "어제 것"이 아니라 손상이다.** 경로가 이미
  //    `.../days/{day}/...` 라, 그 자리에 다른 날짜가 적힌 문서는 존재할 수 없다.
  //    0 으로 리셋하던 판에서는 손상 문서 하나가 **하루 상한을 통째로 다시 열었다**
  //    (2026-08-21 codex — 같은 날짜의 타입 손상은 fail-closed 인데 날짜만 fail-open 이었다).
  //    자가치유 창은 최대 하루다(자정에 경로가 바뀌면 새 문서가 선다).
  //    `date` 가 **아예 없는** 문서도 같은 손상이다(쓰기는 늘 date 를 같이 넣는다).
  //    빈 문서 `{}` 만 예외로 두는데, 그건 값이 아니라 자리이기 때문이다.
  if (raw && typeof raw === "object" && Object.keys(raw).length > 0 && raw.date !== day) {
    return null;
  }
  if (!raw || typeof raw !== "object" || raw.date !== day) {
    // ⚠️ `lastEventAt` 을 **여기서도** 준다. 빼놨더니 첫 이벤트에서 undefined 가 흘러
    //    `nowMs - undefined = NaN` 이 되고, NaN 비교가 false 라 **첫 세션이 0으로 세졌다**
    //    (2026-08-21 테스트가 잡음). 조기 반환은 늘 같은 모양이어야 한다.
    return { events: 0, sec: 0, sessions: 0, best: 0, lastEventAt: 0 };
  }
  const pick = (v) => (v === undefined || v === null ? 0 : v);
  const out = {
    events: pick(raw.events),
    sec: pick(raw.sec),
    sessions: pick(raw.sessions),
    best: pick(raw.best),
  };
  for (const v of Object.values(out)) {
    if (!Number.isInteger(v) || v < 0) return null;
  }
  // 마지막 기록 시각은 **집계가 아니라 판정 재료**라 0 이어도 정상이다(첫 이벤트).
  // 다만 숫자가 아니면 세션 경계를 알 수 없으므로 0 으로 읽어 새 세션으로 친다 —
  // 여기서 null(거부)까지 갈 일은 아니다. 세션 수는 돈이 아니다.
  out.lastEventAt = Number.isFinite(raw.lastEventAt) && raw.lastEventAt > 0 ? raw.lastEventAt : 0;
  return out;
}

/**
 * 이 이벤트를 받아도 되는가(순수). 상한은 **쓰기 비용**의 방어선이다.
 *
 * @param {object} p 파라미터
 * @param {object} p.used 오늘까지의 집계(dayStats 결과)
 * @param {number} p.sec 이번 이벤트의 초
 * @return {{ok: boolean, reason?: string}} 판정
 */
function checkLimits({ used, sec }) {
  if (used.events + 1 > LIMITS.EVENTS_PER_SUBJECT_PER_DAY) {
    return { ok: false, reason: "event_daily_cap" };
  }
  if (used.sec + sec > LIMITS.MAX_SEC_PER_DAY) {
    return { ok: false, reason: "sec_daily_cap" };
  }
  return { ok: true };
}

/**
 * 새 집계값을 계산한다(순수).
 *
 * `sessions` 는 **30분 이상 끊겼을 때만** 는다(SESSION_GAP_MS 주석 참고).
 *
 * @param {object} p 파라미터
 * @param {object} p.used 이전 집계(dayStats 결과 — lastEventAt 포함)
 * @param {number} p.nowMs 지금
 * @param {number} p.sec 이번 초
 * @param {number} p.score 이번 점수
 * @param {boolean} p.hasScore 점수를 보고했는가
 * @return {{events: number, sec: number, sessions: number, best: number, lastEventAt: number}} 새 집계
 */
function nextStats({ used, nowMs, sec, score, hasScore }) {
  // 마지막 시각을 모르면(0·손상) 새로 앉은 것으로 친다 — 세션을 **적게** 세는 쪽이 아니라
  // 정확히 세는 쪽이고, 알 수 없을 때 0으로 세면 교사 화면에서 학생이 통째로 사라진다.
  const last = Number.isFinite(used.lastEventAt) ? used.lastEventAt : 0;
  const isNewSession = last <= 0 || nowMs - last >= SESSION_GAP_MS;
  return {
    events: used.events + 1,
    sec: used.sec + sec,
    sessions: used.sessions + (isNewSession ? 1 : 0),
    best: hasScore ? Math.max(used.best, score) : used.best,
    lastEventAt: nowMs,
  };
}

const DENY_MESSAGE = Object.freeze({
  malformed: "요청 형식이 올바르지 않아요.",
  bad_kind: "기록할 수 없는 활동이에요.",
  bad_sec: "학습 시간이 올바르지 않아요.",
  bad_score: "점수가 올바르지 않아요.",
  bad_meta: "추가 정보가 너무 크거나 형식이 달라요.",
  event_daily_cap: "오늘 이 앱의 기록이 충분히 쌓였어요.",
  sec_daily_cap: "오늘 기록할 수 있는 학습 시간을 다 채웠어요.",
  stats_corrupt: "학습 기록에 문제가 있어요. 선생님께 알려 주세요.",
});

// 🔴 지급 경로(`rewardRules.DENY_STATUS`)와 **같은 계약**이어야 한다. 인증·레이트 계열을
//    빠뜨려 전부 기본값 409 로 나가던 판에서는, 만료된 토큰에도 409 가 가서 위성앱이
//    **죽은 토큰으로 무한 재시도**했다(2026-08-21 codex 재현). 409 는 "다시 보내도 같다"가
//    아니라 "충돌"이라, 앱이 재발급을 해야 할 자리에서 재발급을 안 하게 만든다.
const DENY_STATUS = Object.freeze({
  malformed: 400,
  bad_kind: 400,
  bad_sec: 400,
  bad_score: 400,
  bad_meta: 400,
  // 401 = 토큰·세션을 **다시 받아 오라**. 사유는 뭉쳐도 상태코드는 갈라야 앱이 행동을 정한다.
  token_invalid: 401,
  session_missing: 401,
  session_mismatch: 401,
  session_expired: 401,
  // 403 = 다시 받아 와도 소용없다(정책이 닫혔다).
  disabled: 403,
  not_migrated: 403,
  stats_off: 403,
  bad_launch_url: 403,
  not_registered: 404,
  rate_limited: 429,
  event_daily_cap: 429,
  sec_daily_cap: 429,
});

/**
 * 🚨 **경보로 올릴 사유** — 운영자가 실제로 손을 대야 하는 것만이다.
 *
 * 🔴 여기 아무거나 넣으면 안 된다. `token_invalid` 는 레이트리밋 **앞**에서 판정되므로
 *    인증 없는 호출자가 무제한으로 만들 수 있다 — 경보에 넣으면 **메일 폭주 경로**가 열린다.
 *    `rate_limited`·상한·세션만료는 정상 운영 중에도 나는 소리라 경보가 아니라 로그다.
 *
 * 가르는 기준 하나: **"이걸 받고 사람이 할 일이 있는가."** 스위치가 꺼져 있거나 정책이
 * 닫혀 있는데 앱이 계속 보내고 있다면 사람이 켜야 한다. 상한에 걸린 건 설계대로 도는 것이다.
 */
const ALERTABLE_DENY = Object.freeze([
  "stats_off",
  "disabled",
  "not_migrated",
  "not_registered",
  "bad_launch_url",
  "stats_corrupt",
]);

/** @param {string} r 사유 @return {boolean} 경보로 올릴 것인가 */
function isAlertable(r) {
  return ALERTABLE_DENY.includes(r);
}

/** 위 표에 없는 사유는 409. */
const DEFAULT_DENY_STATUS = 409;

/** @param {string} r 사유 @return {string} 문구 */
function denyMessage(r) {
  return Object.prototype.hasOwnProperty.call(DENY_MESSAGE, r)
    ? DENY_MESSAGE[r]
    : "지금은 기록할 수 없어요.";
}
/** @param {string} r 사유 @return {number} HTTP 상태 */
function denyStatus(r) {
  return Object.prototype.hasOwnProperty.call(DENY_STATUS, r) ? DENY_STATUS[r] : DEFAULT_DENY_STATUS;
}

module.exports = {
  kstDayKey,
  EVENT_KINDS,
  LIMITS,
  SESSION_GAP_MS,
  statsPath,
  normalizeEvent,
  dayStats,
  checkLimits,
  nextStats,
  denyMessage,
  denyStatus,
  DENY_MESSAGE,
  DENY_STATUS,
  ALERTABLE_DENY,
  isAlertable,
  DEFAULT_DENY_STATUS,
  UID_RE,
  CLASS_CODE_RE,
  APP_ID_RE,
};
