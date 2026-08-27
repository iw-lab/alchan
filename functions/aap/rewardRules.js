// functions/aap/rewardRules.js
// 💰 보상 지급의 **순수 규칙** — 날짜·해시·한도·레이트리밋 판정. Firestore 를 모른다.
//
// 왜 파일이 갈라져 있나 (catalogRules.js 와 같은 이유)
//   한도 판정은 이 규약에서 **돈을 정하는 유일한 자리**다. db 를 require 하는 모듈에 섞여 있으면
//   테스트가 firebase-admin 초기화를 통과해야 하고, 그러면 "경계값 하나"를 확인하는 데
//   에뮬레이터가 필요해진다. 상한 코드는 **입력만 주면 판정이 나오는** 순수 함수여야
//   off-by-one 을 변이로 잡을 수 있다(P1-7 에서 경계값 테스트가 하나도 없던 걸 뒤늦게 발견했다).
//
// 이 파일이 지키는 것 (계획서 §3.3 · 설계 2판)
//   · 금액은 **카탈로그만** 정한다 — 요청에는 achievementId 밖에 없다
//   · 캡은 **네 축**이고 현금·쿠폰이 **분리**된다 (쿠폰은 sellCoupon 으로 현금화되는 통로다)
//   · 멱등 해시에는 **재시도 사이에 정당하게 변할 수 있는 값**을 넣지 않는다
const crypto = require("crypto");
const { SALARY } = require("../salaryUtils");
const catalogRules = require("./catalogRules");

/** KST = UTC+9. 이 저장소의 다른 주기작업(주급·세금)과 같은 방식으로 계산한다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 하루 경계 키(KST). `YYYYMMDD`.
 *
 * ⚠️ 서버 타임존에 기대지 않는다. Cloud Functions 의 기본 TZ 는 UTC 라
 *    `new Date().toISOString()` 을 그대로 쓰면 **매일 오전 9시에 날짜가 바뀐다** —
 *    아이들이 등교해서 쓰는 시간대 한복판이다.
 *
 * @param {number} nowMs epoch ms
 * @return {string} YYYYMMDD (KST 기준)
 */
function kstDayKey(nowMs) {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * uid 형식. Firebase Auth uid 는 `[A-Za-z0-9]{28}` 이지만 길이를 고정하지 않는다.
 *
 * ⚠️ **`_` 를 일부러 배제한다.** `appRewardSubjects/{uid}_{appId}` 처럼 이어 붙이는 문서 id 가
 *    있는데, uid 에 `_` 가 허용되면 (`a_b`, `c`) 와 (`a`, `b_c`) 가 **같은 문서**를 가리킨다.
 *    토큰의 pairwise 구분자를 NUL 로 둔 것과 같은 함정이다(계획서 C14).
 *    실제 uid 는 이 규칙을 항상 만족하므로 정상 경로에 영향이 없고, 만족하지 않는 값이
 *    들어오면 그건 uid 가 아니다 → fail-closed.
 */
const UID_RE = /^[A-Za-z0-9]{1,128}$/;

/** 학급코드. 카운터 문서 id 에 들어가므로 `/` 를 포함할 수 없어야 한다. */
const CLASS_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 앱이 만드는 실행 식별자. 같은 값으로 재시도하면 같은 결과가 나온다(멱등). */
const CLIENT_RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 이벤트 nonce. P1-3(`recordLearningEvent`)이 **서버에서** 발급할 값의 자리다.
 * P1-2 에서는 비어 있어도 된다 — 세션이 1회용이라 재생은 그쪽에서 막힌다.
 */
const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 학생×앱 카운터 문서 id.
 *
 * @param {string} uid 학생 uid (UID_RE 통과 전제)
 * @param {string} appId 앱 id
 * @return {string} 문서 id
 */
function subjectKey(uid, appId) {
  return `${uid}_${appId}`;
}

/**
 * 길이 접두 튜플 해시. 원소 경계가 모호해지지 않는다 —
 * `("ab","c")` 와 `("a","bc")` 가 다른 해시가 된다.
 *
 * @param {string[]} parts 원소들
 * @return {string} sha256 hex (64자)
 */
function tupleHash(parts) {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    const b = Buffer.from(String(p), "utf8");
    h.update(`${b.length}:`, "utf8");
    h.update(b);
  }
  return h.digest("hex");
}

/**
 * 🔑 멱등 해시 = 지급 원장의 **문서 id**.
 *
 * **넣는 것** = 요청의 *의도*: 누가·어느 앱에서·무슨 성취를·어느 실행/이벤트로.
 * **넣지 않는 것** = 재시도 사이에 **정당하게 변할 수 있는** 값:
 *   토큰 원문·서명·kid·iat·exp·jti, 타임스탬프, KST 날짜, 지금의 classCode·역할,
 *   카탈로그 금액·rewardType, trustLevel·policyVersion.
 *   이것들을 넣으면 **정상 재시도가 새 지급이 된다**(자정을 넘겨 재시도하면 날짜가 바뀐다).
 *   그 값들은 요청 키가 아니라 **결과 원장**에 남긴다.
 *
 * 문서 id 로 문자열 이어붙이기 대신 이 해시를 쓰는 이유: `/` 주입·길이 상한·튜플 경계 모호가
 * 한 번에 사라진다(기존 `checkIdempotent` 는 이 셋을 각각 방어하고 있다).
 *
 * 주체를 uid 가 아니라 **토큰의 `sub`** 로 잡는다(2026-08-21). sub 는 앱별 pairwise 값이라
 * (학생 × 앱) 단위로 uid 와 1:1 이고 — 튜플에 appId 도 들어가므로 구분력이 같다 —
 * **토큰만 보면 알 수 있다.** uid 를 쓰려면 해시를 만들기 위해 세션 문서를 먼저 읽어야 했다.
 * 그 읽기를 없앴다(지급 1회당 -1R). 덤: 요청 키에 uid 가 안 들어간다.
 * ⚠️ 전제: pairwise salt 는 **회전하지 않는다**(token.js 에 명시). 회전하면 sub 가 갈려
 *    회전 직전 요청의 재시도가 새 지급이 된다 — 그래서 salt 는 회전 대상이 아니다.
 *
 * @param {object} p 파라미터
 * @param {string} p.sub 검증된 토큰의 pairwise 주체
 * @param {string} p.appId 앱 id (= 검증된 토큰의 aud)
 * @param {string} p.achievementId 성취 id
 * @param {string} p.clientRunId 앱이 만든 실행 id
 * @param {string} [p.eventId] 서버 발급 이벤트 nonce (P1-3)
 * @return {string} sha256 hex
 */
function requestHash({ sub, appId, achievementId, clientRunId, eventId = "" }) {
  return tupleHash(["aap-grant-v1", sub, appId, achievementId, clientRunId, eventId]);
}

/**
 * 🧱 **네 축의 절대 상한** — 코드에 박는다(Firestore 문서로 못 넘는다).
 *
 * catalogRules.HARD_CEILING 은 "성취 하나가 얼마인가"를 막는다. 그런데 그것만으로는
 * **서로 다른 성취 10개**가 각각 통과한다 — 합계를 막는 축이 따로 필요하다.
 *
 * ⚠️ 이 숫자들은 **경제 정책**이다. 주급 기본값(2,000,000/주)을 기준으로 보수적으로 잡았고,
 *    교사가 최종 확인할 대상이다. 지금은 어떤 앱도 지급이 켜져 있지 않아 실제 영향은 0 이다.
 * ⚠️ 학급·앱 축은 **파일럿(교사 1명·학급 2개) 기준**이다. P3(개방)에서 학급 수가 늘면
 *    앱 축이 먼저 포화한다 — 계획서가 예고한 "학급별 예산 배분"이 그때 필요하다.
 */
// 📉 2026-08-27 하향 (사용자 결정). 앱 보상은 **덤**이고 주급·직업이 본류다.
//
//    왜 낮췄나 — 통이 따로이기 때문이다.
//    AAP 하루 상한은 알찬 내부 보상(출석 `dailyStreak`, 댓글 `gameRewardDaily`, 할일, 주급)과
//    **서로를 보지 않는 별개 카운터**다(4계열 교차검증에서 grep 으로 양방향 0건 확인).
//    즉 여기 적힌 값은 "앱이 주는 몫"이 아니라 **다른 소득 위에 그대로 얹히는 몫**이다.
//    종전 5%(10만)면 출석 최대 10만과 합쳐 하루 20만 — 주급 일할(약 28.6만)에 육박해서,
//    앱만 돌려도 직업·할일보다 벌이가 좋아진다. 그러면 학급경제의 중심이 옮겨간다.
//
//    통을 합치는 안은 버렸다. 이 저장소는 "통을 공유하면 돈이 굶는다"를 이미 겪었다 —
//    학습기록 30건이 바로 뒤의 실제 지급을 막았다. 막는 통과 세는 통은 달라야 한다.
//    대신 **앱 쪽 몫만 줄인다.** 되돌리기는 이 숫자 한 줄 + 배포다.
//
//    ⚠️ 지금 등록된 앱은 전부 L0 이고 `dailyCashCap: 0` 이라 **오늘 실질 영향은 0**이다.
//       이 값이 실제로 작동하는 건 보상을 켜는 날부터다.
//    ⚠️ 학급·앱 축도 같은 비율로 내렸다. 학생 상한만 1/5 로 줄이면 학급 차단기(200만)가
//       예상 총량의 40배가 되어 **영영 안 터지는 차단기**가 된다 — 차단기는 닿을 수 있어야 한다.
const GLOBAL_CEILING = Object.freeze({
  /** 한 학생이 **모든 앱을 합쳐** 하루에 받을 수 있는 현금 (주급의 1% ≈ 하루 소득의 7%) */
  STUDENT_CASH_PER_DAY: Math.round(SALARY.BASE * 0.01), // 20,000
  /** 한 학생이 모든 앱을 합쳐 하루에 받을 수 있는 쿠폰 (댓글 쿠폰 하루 3장과 같은 눈금) */
  STUDENT_COUPON_PER_DAY: 3,
  /** 한 학급 전체가 하루에 받을 수 있는 현금 — 폭주 차단기.
   *  25명이 전원 상한(2만)을 다 받으면 50만이라, 60만은 정상 최대치 바로 위다. */
  CLASS_CASH_PER_DAY: Math.round(SALARY.BASE * 0.3), // 600,000
  /** 한 학급 전체가 하루에 받을 수 있는 쿠폰 (25명 × 3장 = 75) */
  CLASS_COUPON_PER_DAY: 75,
  /** 한 앱이 하루에 발행할 수 있는 현금 총액 — 앱이 털렸을 때의 차단기(학급 차단기의 2배) */
  APP_CASH_PER_DAY: Math.round(SALARY.BASE * 0.6), // 1,200,000
  /** 한 앱이 하루에 발행할 수 있는 쿠폰 총량 */
  APP_COUPON_PER_DAY: 150,
});

/**
 * 정책 문서의 캡을 읽는다. **없거나 이상하면 0** — fail-closed.
 *
 * ⚠️ 여기가 "정책상 꺼진 앱이 지급하는" 사고를 막는 자리다. 지금 등록된 앱 11개는 전부
 *    `dailyCashCap: 0` 이라, 정책을 안 보면 카탈로그 상한(L0 = 10,000)까지 그냥 나간다.
 *
 * @param {*} v 정책 문서의 캡 값
 * @param {number} max 코드 절대 상한
 * @return {number} 0 이상 max 이하의 정수
 */
function readCap(v, max) {
  if (!Number.isInteger(v) || v < 0) return 0;
  return Math.min(v, max);
}

/**
 * 이 지급에 적용할 **유효 캡**을 확정한다 = min(신뢰등급 상한, 정책 문서 캡, 코드 절대 상한).
 *
 * @param {object} p 파라미터
 * @param {object} p.policy 앱 정책 문서
 * @param {object} p.trustLimits catalogRules.trustLimitsFor() 결과
 * @param {string} p.rewardType "cash" | "coupon"
 * @return {{perGrant: number, subjectPerDay: number, studentPerDay: number,
 *           classPerDay: number, appPerDay: number}} 축별 상한
 */
function resolveCaps({ policy, trustLimits, rewardType }) {
  const cash = rewardType === "cash";
  const policyCap = cash
    ? readCap(policy?.dailyCashCap, GLOBAL_CEILING.STUDENT_CASH_PER_DAY)
    : readCap(policy?.dailyCouponCap, GLOBAL_CEILING.STUDENT_COUPON_PER_DAY);
  const trustPerGrant = cash ? trustLimits.cashPerGrant : trustLimits.couponPerGrant;
  const trustPerDay = cash ? trustLimits.cashPerAppPerDay : trustLimits.couponPerAppPerDay;

  return {
    // 1건 상한은 카탈로그 검증(normalizeAchievement)이 이미 봤다. 여기서 한 번 더 보는 이유:
    // 그쪽은 **문서를 등록할 때의 등급**으로 판정되고, 등급은 그 뒤에 내려갈 수 있다.
    perGrant: trustPerGrant,
    // 학생×앱×일 — 정책 캡이 여기 걸린다(앱을 켜는 사람이 정하는 값).
    subjectPerDay: Math.min(trustPerDay, policyCap),
    studentPerDay: cash
      ? GLOBAL_CEILING.STUDENT_CASH_PER_DAY
      : GLOBAL_CEILING.STUDENT_COUPON_PER_DAY,
    classPerDay: cash ? GLOBAL_CEILING.CLASS_CASH_PER_DAY : GLOBAL_CEILING.CLASS_COUPON_PER_DAY,
    appPerDay: cash ? GLOBAL_CEILING.APP_CASH_PER_DAY : GLOBAL_CEILING.APP_COUPON_PER_DAY,
  };
}

/**
 * 하루 카운터를 읽는다. **날짜가 다르면 0** — 문서를 지우지 않고 날짜로 리셋한다.
 *
 * ⚠️ **값이 이상하면 0 이 아니라 `null`(=판단 불가)이다.** 처음엔 음수를 0 으로 바닥치고
 *    숫자가 아니면 0 으로 읽었는데, 그게 곧 fail-open 이었다(2026-08-21 codex WARNING):
 *    REST 로 정수를 **문자열**로 써 넣는 실수 하나면(`cash: "2000000"`) `Number.isFinite` 가
 *    거짓이라 **이미 소진된 캡이 통째로 다시 열린다.** 이 저장소는 REST 의 정수-문자열
 *    함정을 이미 다른 곳에서 겪었다(`scripts/ops/aap-switch.mjs` 주석).
 *    "이미 쓴 만큼"을 모르겠으면 지급하지 않는 것이 맞다 — 덜 주는 것보다 안 주는 것이 되돌리기 쉽다.
 *
 * @param {object|undefined} raw 저장된 값 {day, cash, coupon}
 * @param {string} day 오늘(KST)
 * @return {{cash: number, coupon: number}|null} 오늘치 합계, 손상이면 null
 */
function dayTotals(raw, day) {
  if (!raw || typeof raw !== "object" || raw.day !== day) return { cash: 0, coupon: 0 };
  // 필드가 아예 없는 건 정상이다(그 종류를 아직 안 받은 날). 있는데 이상한 것만 손상으로 본다.
  const cash = raw.cash === undefined || raw.cash === null ? 0 : raw.cash;
  const coupon = raw.coupon === undefined || raw.coupon === null ? 0 : raw.coupon;
  const sane = (v) => Number.isInteger(v) && v >= 0;
  if (!sane(cash) || !sane(coupon)) return null;
  return { cash, coupon };
}

/**
 * 성취 **단위** 한도 — 카탈로그의 maxPerDay·maxLifetime·cooldownSec·prerequisites 집행.
 *
 * 이게 없으면 `clientRunId` 만 바꿔 같은 성취를 합계 상한까지 반복할 수 있다(설계 2판 CRITICAL).
 *
 * @param {object} p 파라미터
 * @param {object} p.achievement 정규화된 카탈로그 값
 * @param {object} p.achievements 학생×앱 문서의 성취별 상태 map
 * @param {string} p.achievementId 성취 id
 * @param {string} p.day 오늘(KST)
 * @param {number} p.nowMs 현재 시각
 * @return {{ok: boolean, reason?: string}} 판정
 */
function checkAchievementState({ achievement, achievements, achievementId, day, nowMs }) {
  const map = achievements && typeof achievements === "object" ? achievements : {};
  // ⚠️ `map[achievementId]` 로 바로 읽으면 `"constructor"` 같은 프로토타입 키에서
  //    Object.prototype 의 값이 나온다(P1-7 에서 등급 폴백이 정확히 이걸로 샜다).
  //    id 는 ACHIEVEMENT_ID_RE 를 통과하지만 그 정규식은 `constructor` 를 허용한다.
  const own = Object.prototype.hasOwnProperty.call(map, achievementId)
    ? map[achievementId]
    : null;
  const state = own && typeof own === "object" ? own : {};

  // 같은 이유로 전부 0 으로 바닥친다 — 음수 횟수는 maxPerDay·maxLifetime 을 무력화한다.
  const lifetimeCount = Number.isFinite(state.lifetimeCount) ? Math.max(0, state.lifetimeCount) : 0;
  const dayCount =
    state.day === day && Number.isFinite(state.dayCount) ? Math.max(0, state.dayCount) : 0;
  const lastGrantedAt = Number.isFinite(state.lastGrantedAt) ? Math.max(0, state.lastGrantedAt) : 0;

  // 선행조건 — 먼저 본다. "아직 못 여는 성취"는 한도 이야기보다 앞선 사실이다.
  for (const prereqId of achievement.prerequisites) {
    const prereqOwn = Object.prototype.hasOwnProperty.call(map, prereqId) ? map[prereqId] : null;
    const done = prereqOwn && Number.isFinite(prereqOwn.lifetimeCount) && prereqOwn.lifetimeCount > 0;
    if (!done) return { ok: false, reason: "prerequisites" };
  }

  if (achievement.maxLifetime > 0 && lifetimeCount >= achievement.maxLifetime) {
    return { ok: false, reason: "lifetime_limit" };
  }
  if (dayCount >= achievement.maxPerDay) {
    return { ok: false, reason: "achievement_daily_limit" };
  }
  if (achievement.cooldownSec > 0 && nowMs - lastGrantedAt < achievement.cooldownSec * 1000) {
    return { ok: false, reason: "cooldown" };
  }
  return { ok: true, state: { lifetimeCount, dayCount, lastGrantedAt } };
}

/**
 * 네 축 합계 한도.
 *
 * 순서는 **좁은 축부터** — 학생이 자기 한도를 다 쓴 것과 학급 전체가 폭주하는 것은
 * 다른 사건이고, 후자를 앞에 두면 정상적으로 한도를 채운 학생에게 "학급 한도" 라고 말하게 된다.
 *
 * @param {object} p 파라미터
 * @param {number} p.amount 지급량
 * @param {string} p.rewardType "cash" | "coupon"
 * @param {object} p.caps resolveCaps() 결과
 * @param {object} p.used {subject, student, classroom, app} 각각 {cash, coupon}
 * @return {{ok: boolean, reason?: string}} 판정
 */
function checkCaps({ amount, rewardType, caps, used }) {
  const pick = (t) => (rewardType === "cash" ? t.cash : t.coupon);

  if (amount > caps.perGrant) return { ok: false, reason: "over_grant_cap" };
  if (pick(used.subject) + amount > caps.subjectPerDay) {
    return { ok: false, reason: "subject_daily_cap" };
  }
  if (pick(used.student) + amount > caps.studentPerDay) {
    return { ok: false, reason: "student_daily_cap" };
  }
  if (pick(used.classroom) + amount > caps.classPerDay) {
    return { ok: false, reason: "class_daily_cap" };
  }
  if (pick(used.app) + amount > caps.appPerDay) {
    return { ok: false, reason: "app_total_daily_cap" };
  }
  return { ok: true };
}

/**
 * 🪣 레이트리밋 = token bucket.
 *
 * **지급 트랜잭션 밖**에 있어야 한다(설계 2판 CRITICAL). 안에 두면 실패한 호출이 롤백되어
 * 아무것도 안 남는다 — 잘못된 achievementId 를 초당 100번 보내는 공격이 **카운트되지 않는다**.
 *
 * 용량 30 · 2초당 1개 회복 = 지속 30회/분, 순간 30회. 정상 앱은 실행당 1~2회 부른다.
 */
const RATE_LIMIT = Object.freeze({ CAPACITY: 30, REFILL_MS: 2000 });

/**
 * 🎫 **발급**(`issueAppToken`)용 버킷. 지급보다 훨씬 드문 동작이라 따로 둔다.
 *
 * 용량 20 · 6초당 1개 회복 = 지속 10회/분. 앱을 여는 동작이므로 이걸로 충분하고,
 * 발급 1회가 Firestore 쓰기를 만들기 때문에(실행권) **돈이 아니라 비용을 막는 자리**다.
 */
const TOKEN_RATE_LIMIT = Object.freeze({ CAPACITY: 20, REFILL_MS: 6000 });

/**
 * 📚 **학습기록**(`recordLearningEvent`)용 버킷. 지급과 **절대 같은 통을 쓰지 않는다.**
 *
 * 🔴 2026-08-21 codex — 같은 통을 쓰던 판에서, 학습 이벤트 30건이 통을 비우면 **바로 뒤의
 *    실제 지급이 거부됐다**(학생이 스테이지를 깼는데 돈을 못 받는다). 시끄러운 경로가 돈
 *    경로를 굶긴 것이다. 빈도가 다른 두 동작은 통을 나눈다 — 발급이 이미 그렇게 돼 있었다.
 *
 * 용량 60 · 1초당 1개 회복. 진짜 상한은 하루 300건(`learningRules.LIMITS`)이고
 * 이 통은 **순간 폭주만** 막는다.
 */
const LEARNING_RATE_LIMIT = Object.freeze({ CAPACITY: 60, REFILL_MS: 1000 });

/**
 * 버킷 상태를 갱신한다(순수).
 *
 * @param {object|null} prev 저장된 {tokens, lastRefillMs}
 * @param {number} nowMs 현재 시각
 * @param {{CAPACITY: number, REFILL_MS: number}} [limit] 버킷 설정. 기본은 지급용.
 *   ⚠️ 인자로 받는 이유: 예전엔 함수가 모듈 상수 `RATE_LIMIT` 을 직접 참조해서, 발급용으로
 *      다른 값을 쓰려 해도 **조용히 지급용 설정이 적용됐다**(2026-08-21 codex WARNING).
 * @return {{allowed: boolean, next: {tokens: number, lastRefillMs: number}, changed: boolean}}
 *   판정 · 새 상태 · **저장값과 달라졌는지**(false 면 호출부가 쓰기를 건너뛴다)
 */
function consumeBucket(prev, nowMs, limit = RATE_LIMIT) {
  const stored = prev && typeof prev === "object" ? prev : {};
  // ⚠️ 저장값이 **미래**면 `elapsed` 가 영원히 0 이라 그 버킷은 **영구히 잠긴다**(1년 뒤도 동일).
  //    시계가 뒤로 간 경우만 막고 이쪽을 안 막았다(2026-08-21 codex WARNING).
  //    지금 시각으로 끌어내리면 다음 호출부터 정상 회복한다.
  const lastRefillMs = Math.min(
    nowMs,
    Number.isFinite(stored.lastRefillMs) ? stored.lastRefillMs : nowMs,
  );
  // 저장값이 음수면(손상·수동 편집) 회복에 몇 시간이 걸려 **정상 학생이 잠긴다** → 0..CAPACITY 로 조인다.
  const storedTokens = Number.isFinite(stored.tokens)
    ? Math.min(limit.CAPACITY, Math.max(0, stored.tokens))
    : limit.CAPACITY;

  // ⚠️ 시계가 뒤로 갔거나(서버 교체) 미래 값이 저장돼 있으면 elapsed 가 음수다.
  //    음수를 그대로 더하면 토큰이 줄어들어 **정상 사용자가 영구히 막힌다** → 0 으로 바닥친다.
  const elapsed = Math.max(0, nowMs - lastRefillMs);
  const refilled = Math.min(
    limit.CAPACITY,
    storedTokens + Math.floor(elapsed / limit.REFILL_MS),
  );

  // 저장값과 **똑같은 상태**를 다시 쓰는 것은 순수 낭비다. 거부가 이어지는 동안 next 는
  // 매번 {tokens:0, lastRefillMs} 로 같으므로, 이 플래그가 있으면 호출부가 쓰기를 건너뛴다.
  // ⚠️ 단, 저장값이 미래거나 손상됐을 땐 next 가 달라진다 — 그때는 반드시 써야 **치유**된다
  //    (위 lastRefillMs 클램프는 읽을 때마다 다시 계산되므로, 안 쓰면 영구히 잠긴 채로 남는다).
  const same = (n) => stored.tokens === n.tokens && stored.lastRefillMs === n.lastRefillMs;

  if (refilled < 1) {
    // 거부해도 lastRefillMs 는 **전진시키지 않는다**. 매 요청마다 갱신하면 회복 시계가
    // 계속 리셋되어, 초당 수십 번 두드리는 쪽이 영원히 회복하지 못한다(=자기 DoS).
    const next = { tokens: 0, lastRefillMs };
    return { allowed: false, next, changed: !same(next) };
  }
  const next = { tokens: refilled - 1, lastRefillMs: nowMs };
  return { allowed: true, next, changed: !same(next) };
}

/**
 * 거부 사유 → 학생에게 보여줄 문구.
 *
 * ⚠️ 토큰·세션 계열은 **한 가지 말로** 뭉친다. "세션이 이미 소비됐다" 와 "서명이 틀렸다" 를
 *    구분해 알려주면 공격자에게 어디까지 맞았는지 알려주는 셈이다. 원인은 로그에 남는다.
 */
const AUTH_MESSAGE = "앱 연결이 만료됐어요. 알찬에서 다시 열어 주세요.";

/**
 * 사유 → 학생 문구의 **유일한 정본**.
 *
 * ⚠️ `issueAppToken`(실행)과 `grantAppReward`(지급)는 **같은 근원 함수**(`checkPolicyOpen`)가
 *    만든 같은 사유 코드를 쓴다. 처음엔 두 파일이 각자 문구 표를 들고 있었는데, 그러면
 *    나중에 문구를 다듬을 때 한쪽만 고쳐 **같은 상태인데 화면마다 다른 말**을 하게 된다.
 *    이 저장소는 "정본이 둘"로 주급 과다지급 사고를 낸 적이 있다 — 표는 하나만 둔다.
 *    (정책 문구가 순수 모듈에 있는 이유: `policy.js` 는 db 를 require 해서, 거기 두면
 *     순수 규칙이 firebase-admin 을 끌고 오게 된다.)
 */
const DENY_MESSAGE = Object.freeze({
  malformed: "요청 형식이 올바르지 않아요.",
  token_invalid: AUTH_MESSAGE,
  session_missing: AUTH_MESSAGE,
  session_mismatch: AUTH_MESSAGE,
  session_expired: AUTH_MESSAGE,
  session_consumed: "이미 보상을 받은 연결이에요. 알찬에서 다시 열어 주세요.",
  not_registered: "아직 알찬과 연결되지 않은 앱이에요.",
  // ⚠️ 카탈로그도 같은 이름의 사유("not_registered")를 쓴다. 둘은 다른 사건이다 —
  //    앱이 등록 안 됨 vs **그 성취**가 등록 안 됨. 이름이 겹치면 학생에게 엉뚱한 문구가 간다.
  //    그래서 성취 쪽은 지급 코드에서 접두를 붙여 올린다(reward.js).
  achievement_not_registered: "이 활동은 아직 보상이 준비되지 않았어요.",
  disabled: "이 앱은 지금 잠시 사용할 수 없어요.",
  not_migrated: "이 앱은 아직 준비 중이에요.",
  bad_launch_url: "앱 주소 설정에 문제가 있어요. 선생님께 알려 주세요.",
  rewards_off: "이 앱은 아직 보상이 켜져 있지 않아요.",
  user_missing: AUTH_MESSAGE,
  not_student: "선생님 계정은 보상을 받을 수 없어요.",
  class_changed: "학급 정보가 바뀌었어요. 알찬에서 다시 열어 주세요.",
  prerequisites: "먼저 해야 하는 활동이 남아 있어요.",
  lifetime_limit: "이 활동의 보상은 이미 다 받았어요.",
  achievement_daily_limit: "오늘 이 활동으로 받을 수 있는 보상은 다 받았어요.",
  cooldown: "조금 뒤에 다시 도전할 수 있어요.",
  over_grant_cap: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  subject_daily_cap: "오늘 이 앱에서 받을 수 있는 보상은 다 받았어요.",
  student_daily_cap: "오늘 받을 수 있는 보상을 다 받았어요. 내일 또 만나요!",
  class_daily_cap: "오늘 우리 반 보상이 모두 소진됐어요.",
  app_total_daily_cap: "오늘 이 앱의 보상이 모두 소진됐어요.",
  // 🚨 차단기가 끊었다. 학생 잘못이 아니므로 "다 받았어요"(소진)와 다른 말을 쓴다.
  app_tripped: "이 앱의 보상이 안전을 위해 잠시 멈췄어요. 선생님께 알려 주세요.",
  rate_limited: "너무 빨리 요청했어요. 잠시 뒤에 다시 해 주세요.",
  // 카운터가 손상돼 "오늘 얼마나 받았는지"를 알 수 없는 상태. 모르면 주지 않는다.
  counter_corrupt: "보상 기록에 문제가 있어요. 선생님께 알려 주세요.",
});

/**
 * 거부 사유 → HTTP 상태. 앱이 **재시도해도 되는지**를 이 숫자로 구분할 수 있어야 한다.
 *
 * 409(한도·쿨다운) = 오늘은 안 된다, 재시도 무의미.
 * 401(토큰·세션)   = 다시 열면 된다.
 * 429(레이트)      = 기다렸다 다시.
 */
const DENY_STATUS = Object.freeze({
  malformed: 400,
  token_invalid: 401,
  session_missing: 401,
  session_mismatch: 401,
  session_expired: 401,
  session_consumed: 409,
  not_registered: 404,
  disabled: 403,
  not_migrated: 403,
  rewards_off: 403,
  user_missing: 401,
  not_student: 403,
  class_changed: 401,
  rate_limited: 429,
  app_tripped: 403,
});
/** 위 표에 없는 사유(한도·쿨다운·카탈로그)는 전부 409. */
const DEFAULT_DENY_STATUS = 409;

/**
 * 🚨 자동 차단기의 임계선. `appPerDay`(앱 하루 총량) 대비 비율.
 *
 * 하드캡(`app_total_daily_cap`)은 **막기만 하고 알리지 않는다** — 상한에 닿았을 때는 이미
 * 하루치가 다 나간 뒤다. 그 전에 두 번 개입한다: 절반에서 알리고, 80%에서 끊는다.
 *
 * ⚠️ **끊긴 것을 되돌리는 길은 하나뿐이다** — `aap-switch.mjs breaker-reset <appId>`.
 *    앱 축 상한(`APP_CASH_PER_DAY`)은 코드 상수라 "상한을 올려 해제"라는 길이 없고,
 *    `rewards-on` 만으로는 안 풀린다(다음 지급에서 곧바로 다시 끊긴다 — 일부러 그렇다).
 *    reset 은 `breakerOverrideDay` 에 **오늘 날짜를 박아** 자정에 저절로 만료된다.
 */
const BREAKER = Object.freeze({ ALERT_RATIO: 0.5, TRIP_RATIO: 0.8 });

/** 경보 문서 id 에 들어가는 종류. **고정 집합**이라 나중에 문자열을 쪼갤 일이 없다. */
const BREAKER_KINDS = Object.freeze(["cash_alert", "cash_trip", "coupon_alert", "coupon_trip"]);

/**
 * 🚨 차단기 판정(순수) — **지급 후 합계** 기준.
 *
 * 왜 지급 전이 아니라 후인가: 지급 전 합계로 보면 임계선을 **넘긴 그 지급**이 무사히 나가고
 * 다음 지급부터 걸린다. 넘긴 건은 넘긴 순간에 표시돼야 원인 추적이 된다.
 *
 * 왜 현금·쿠폰을 나누는가: 단위가 다르다(400만원 vs 400장). 플래그가 하나면 현금이 넘었을 때
 * 쿠폰까지 같이 끊기고, 로그만 봐선 **어느 쪽이 터졌는지 알 수 없다**(2026-08-21 codex WARNING).
 *
 * @param {object} p 파라미터
 * @param {number} p.used 오늘 이 앱이 이미 발행한 양(그 종류)
 * @param {number} p.amount 이번 지급액
 * @param {string} p.rewardType "cash" | "coupon"
 * @param {number} p.appPerDay 앱 하루 총량 상한
 * @param {*} p.prev 카운터 문서 데이터(이전 플래그)
 * @param {string} p.day KST YYYYMMDD
 * @return {{rewardType: string, observed: number, cap: number, alertAt: number, tripAt: number,
 *           alerted: boolean, tripped: boolean, newlyAlerted: boolean, newlyTripped: boolean}}
 */
function checkBreaker({ used, amount, rewardType, appPerDay, prev, day, overridden = false }) {
  const key = rewardType === "cash" ? "cash" : "coupon";
  const fresh = prev && typeof prev === "object" && prev.day === day ? prev : {};
  const wasAlerted = fresh[`${key}Alerted`] === true;
  const wasTripped = fresh[`${key}Tripped`] === true;

  // 상한이 정수 양수가 아니면 판정하지 않는다. 여기까지 오려면 `checkCaps` 를 통과했어야 하고,
  // 그쪽이 `used + amount > appPerDay` 로 이미 막으므로 도달 불가다 — 그래도 0 으로 나눈 값이나
  // NaN 비교가 **조용히 false** 가 되는 길은 남기지 않는다.
  const cap = Number.isInteger(appPerDay) && appPerDay > 0 ? appPerDay : 0;
  const alertAt = Math.ceil(cap * BREAKER.ALERT_RATIO);
  const tripAt = Math.ceil(cap * BREAKER.TRIP_RATIO);
  const observed = used + amount;

  const alerted = wasAlerted || (cap > 0 && observed >= alertAt);
  // 🔓 **오늘만 무시**(운영자가 확인하고 통과시킨 상태). 경보는 그대로 남긴다 —
  //    override 가 조용해지는 스위치면, 켠 사람도 무슨 일이 벌어지는지 못 본다.
  const tripped = overridden ? false : wasTripped || (cap > 0 && observed >= tripAt);
  return {
    overridden,
    rewardType: key,
    observed,
    cap,
    alertAt,
    tripAt,
    alerted,
    tripped,
    newlyAlerted: alerted && !wasAlerted,
    newlyTripped: tripped && !wasTripped,
  };
}

/**
 * 🎫 발급 레이트리밋 버킷의 문서 id.
 *
 * ⚠️ **uid 를 경로에 그대로 붙이지 않는다.** "Firebase uid 는 영숫자"는 이 저장소의 관찰이지
 *    Firebase 의 계약이 아니다 — 커스텀 uid 는 1~128자 임의 문자열이고 공식 예시가 `some-uid`
 *    처럼 하이픈을 쓴다(2026-08-21 codex WARNING). 해시로 고정 길이를 만들면 그 전제가 통째로
 *    사라지고, 문서 id 에 `/` 가 섞일 걱정도 없다.
 *
 * 지급 버킷의 키는 토큰의 `sub`(32자리 소문자 hex)라 `tok_` 접두사와 **겹칠 수 없다.**
 *
 * @param {string} uid Firebase uid
 * @return {string} 문서 id
 */
function bucketKeyForUid(uid) {
  return `tok_${crypto.createHash("sha256").update(String(uid), "utf8").digest("hex").slice(0, 32)}`;
}

/**
 * 학습기록 버킷 키. `sub` 는 이미 앱별 pairwise 라 해시할 게 없다 — 접두사만 붙여
 * 지급용 버킷(`aapRateLimits/{sub}`)과 **다른 문서**가 되게 한다.
 *
 * @param {string} sub 검증된 토큰의 pairwise 식별자
 * @return {string} 버킷 문서 id
 */
function bucketKeyForLearning(sub) {
  return `lrn_${String(sub)}`;
}

/**
 * 사유 → 학생 문구. **`hasOwnProperty` 로 찾는다.**
 *
 * ⚠️ `MAP[reason] || DEFAULT` 로 쓰면 `"constructor"`·`"toString"` 같은 프로토타입 키에서
 *    Object.prototype 의 값(함수)이 나와 폴백이 안 걸린다 — P1-7 에서 등급 폴백이 정확히
 *    이걸로 샜다. 지금은 사유가 코드 안의 고정 집합이라 도달 불가지만, **상수 목록이 우연히
 *    안전한 것**과 조회가 안전한 것은 다르다.
 *
 * @param {string} reason 사유 코드
 * @return {string} 학생에게 보여줄 문구
 */
function denyMessage(reason) {
  if (Object.prototype.hasOwnProperty.call(DENY_MESSAGE, reason)) return DENY_MESSAGE[reason];
  // 카탈로그 사유(inactive·bad_amount…)는 그쪽 표가 정본이다. 설정 오류는 한 가지 말로 뭉친다.
  if (Object.prototype.hasOwnProperty.call(catalogRules.DENY_MESSAGE, reason)) {
    return catalogRules.DENY_MESSAGE[reason];
  }
  return "지금은 보상을 받을 수 없어요.";
}

/**
 * 사유 → HTTP 상태.
 *
 * @param {string} reason 사유 코드
 * @return {number} HTTP 상태 코드
 */
function denyStatus(reason) {
  return Object.prototype.hasOwnProperty.call(DENY_STATUS, reason)
    ? DENY_STATUS[reason]
    : DEFAULT_DENY_STATUS;
}

module.exports = {
  KST_OFFSET_MS,
  UID_RE,
  CLASS_CODE_RE,
  CLIENT_RUN_ID_RE,
  EVENT_ID_RE,
  GLOBAL_CEILING,
  RATE_LIMIT,
  DENY_MESSAGE,
  DENY_STATUS,
  DEFAULT_DENY_STATUS,
  denyMessage,
  denyStatus,
  kstDayKey,
  subjectKey,
  tupleHash,
  requestHash,
  readCap,
  resolveCaps,
  dayTotals,
  checkAchievementState,
  checkCaps,
  consumeBucket,
  TOKEN_RATE_LIMIT,
  LEARNING_RATE_LIMIT,
  BREAKER,
  BREAKER_KINDS,
  checkBreaker,
  bucketKeyForUid,
  bucketKeyForLearning,
};
