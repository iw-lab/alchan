// functions/aap/catalogRules.js
// 🏅 성취 카탈로그의 **순수 규칙** — 상한·검증. Firestore 를 모른다.
//
// 왜 파일이 갈라져 있나: 운영 스크립트(scripts/ops/aap-achievements.mjs)가 문서를 쓰기 **전에**
// 서버와 **똑같은 검증**을 돌려야 한다. 그런데 db 를 require 하는 모듈을 스크립트에서 부르면
// firebase-admin 이 통째로 딸려온다(자격증명 없으면 죽는다). 상한을 스크립트에 복사하는 건
// 논외다 — 그러면 정본이 둘이 되고, 이 저장소는 정확히 그걸로 주급 사고를 냈다.
// 그래서 **규칙은 여기(순수), 조회는 catalog.js(db)** 로 나눈다.
//
// 왜 이게 따로 있나 (계획서 §2.4 A1 · §3.3)
//   초안의 보상 API 는 클라이언트가 `amount` 와 `rewardType` 을 보내고 서버가 캡으로 막는 모양이었다.
//   그러면 **캡이 방어가 아니라 가격표가 된다** — 공격자는 매일 확정적으로 최대치를 가져간다.
//   그래서 요청에는 `achievementId` 만 담고, 금액·종류·횟수·쿨다운은 전부 이 카탈로그가 정한다.
//
// ⚠️ 이름 주의: 저장소에 이미 `src/utils/achievementSystem.js` 가 있는데 그건 **로컬 배지**
//    (localStorage, 돈과 무관, 화면 장식)다. 둘은 아무 관계가 없다. 헷갈리면 돈이 걸린 쪽이
//    장식으로 오해받는다 — 그래서 컬렉션 이름을 `achievements` 가 아니라 **`appAchievements`**
//    로 두었다(계획서 §3.3 의 이름에서 의도적으로 벗어난 유일한 지점).
//
// 저장 위치
//   appAchievements/{appId}/items/{achievementId}
//   쓰기는 **슈퍼관리자만**(firestore.rules). 서버는 Admin SDK 라 규칙을 우회하므로,
//   교사 계정이 털려도 여기 금액을 못 바꾼다(계획서 §2.4 A8).
const { SALARY } = require("../salaryUtils");

/** 성취 id 형식. 앱 id 와 같은 규칙을 쓴다(경로 조작·과도한 길이 차단). */
const ACHIEVEMENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const REWARD_TYPES = Object.freeze(["cash", "coupon"]);

/**
 * 🧱 **코드에 박은 절대 상한.** Firestore 문서 값은 이 이하일 때만 유효하다.
 *
 * 계획서 §2.4 A8 이 요구한 것: "Firestore 문서 = 보안 경계"인데 그 문서를 쓸 수 있는 계정이
 * 털리면 경제 전체가 조작된다. 그래서 **최종 방어선은 코드에 있어야 한다** — 배포 없이는
 * 못 넘는 선이다.
 *
 * 기준점은 주급 기본값(`SALARY.BASE` = 2,000,000/주)이다. 아래 숫자는 그 비율로 잡았다.
 * ⚠️ 주급은 매주 복리로 오르지만(`salaryIncreaseRate`) 이 상한은 **따라 오르지 않는다.**
 *    학기가 길어져 주급이 커지면 보상이 상대적으로 작아진다 — 그게 인플레이션 억제 쪽이라
 *    의도적으로 그대로 둔다. 올릴 일이 생기면 여기 숫자를 바꾸고 배포한다.
 * ⚠️ 이 값들은 **경제 정책**이다. 교사(사용자)가 최종 확인할 대상이지 코드가 정할 일이 아니다 —
 *    지금은 어떤 앱도 지급이 켜져 있지 않아(`aapEnabled:false`·`dailyCashCap:0`) 보수적으로 두었다.
 */
const HARD_CEILING = {
  /** 성취 1건이 줄 수 있는 현금 (주급의 1%) */
  CASH_PER_GRANT: Math.round(SALARY.BASE * 0.01), // 20,000
  /** 한 앱이 한 학생에게 하루에 줄 수 있는 현금 합계 (주급의 3%) */
  CASH_PER_APP_PER_DAY: Math.round(SALARY.BASE * 0.03), // 60,000
  /** 성취 1건이 줄 수 있는 쿠폰 장수 */
  COUPON_PER_GRANT: 3,
  /** 한 앱이 한 학생에게 하루에 줄 수 있는 쿠폰 장수 */
  COUPON_PER_APP_PER_DAY: 5,
  /** 같은 성취를 하루에 몇 번까지 */
  PER_DAY_COUNT: 50,
  /** 같은 성취를 통틀어 몇 번까지 */
  LIFETIME_COUNT: 10000,
  /** 같은 성취 재획득 최소 간격 */
  COOLDOWN_SEC: 86400,
  /** 선행 성취 개수 */
  PREREQUISITES: 10,
};

/**
 * 🔐 신뢰등급별 상한 (계획서 §3.3 — L1 폐기, L0/L2 재정의)
 *
 * **L0** = 성취를 알찬이 독립 검증할 수 없다. 정적 클라이언트가 "내가 해냈다"고 주장할 뿐이다.
 *          서버를 가졌다고 L2 가 되는 게 아니다 — 클라 주장을 그대로 서명해 넘기면 그것도 L0 다.
 * **L2** = 앱 **서버가 성취를 독립 검증**한다.
 *
 * 등급이 모르는 값이면 **가장 낮은 등급으로 취급**한다(fail-closed). 오타 하나로
 * 상한이 풀리면 안 된다.
 */
/** 알려진 등급의 **허용 목록**. 이 밖은 전부 L0 로 떨어진다(아래 trustLimitsFor 주석 참고). */
const TRUST_LEVELS = ["L0", "L2"];

const TRUST_LIMITS = {
  L0: {
    cashPerGrant: 5000,
    cashPerAppPerDay: 10000,
    couponPerGrant: 1,
    couponPerAppPerDay: 2,
  },
  L2: {
    cashPerGrant: HARD_CEILING.CASH_PER_GRANT,
    cashPerAppPerDay: HARD_CEILING.CASH_PER_APP_PER_DAY,
    couponPerGrant: HARD_CEILING.COUPON_PER_GRANT,
    couponPerAppPerDay: HARD_CEILING.COUPON_PER_APP_PER_DAY,
  },
};

// 🧊 얼려 둔다. 이 두 객체는 **얼마까지 줄 수 있는가**를 정하는 모듈 싱글턴이라,
//    어느 코드 경로에서든 실행 중에 바뀌면 그 순간이 곧 취약점이다.
Object.freeze(HARD_CEILING);
Object.freeze(TRUST_LEVELS);
Object.freeze(TRUST_LIMITS);
Object.freeze(TRUST_LIMITS.L0);
Object.freeze(TRUST_LIMITS.L2);

/**
 * 신뢰등급 → 상한. 모르는 등급은 L0.
 *
 * @param {*} trustLevel 정책 문서의 trustLevel
 * @return {object} 상한 묶음
 */
function trustLimitsFor(trustLevel) {
  // ⚠️ `TRUST_LIMITS[trustLevel] || TRUST_LIMITS.L0` 으로 쓰면 **프로토타입 키에서 새어 나간다**:
  //    `"constructor"`·`"toString"`·`"__proto__"` 는 Object.prototype 에서 **truthy** 한 값을
  //    돌려주므로 `||` 폴백이 안 걸린다(2026-08-20 재현 확인). 그 뒤 `limits.cashPerGrant` 가
  //    undefined 가 되어 결과적으로는 거부되지만, 그건 **우연한 fail-closed** 지 설계가 아니다.
  //    상한 판정이 우연에 기대면 안 된다 — 허용 목록으로 명시한다.
  return TRUST_LEVELS.includes(trustLevel) ? TRUST_LIMITS[trustLevel] : TRUST_LIMITS.L0;
}

const isPosInt = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;
const isNonNegInt = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

/**
 * 카탈로그 문서를 검증하고 **정규화**한다.
 *
 * ⚠️ 상한을 넘는 값은 **조이지 않고 거부한다.** 조용히 깎으면 오설정이 그대로 굴러가고,
 *    "왜 500원만 들어오지?"를 아무도 못 찾는다. 거부하면 지급이 멈추고 로그에 사유가 남는다 —
 *    **덜 주는 것보다 안 주는 것이 되돌리기 쉽다**(이 저장소는 과다지급으로 두 번 데였다).
 *
 * @param {object|null} raw Firestore 문서 데이터
 * @param {string} trustLevel 앱 정책의 신뢰등급
 * @return {{ok: boolean, reason?: string, value?: object}} 판정
 */
function normalizeAchievement(raw, trustLevel) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not_registered" };
  // 🔒 **켜짐은 명시적이어야 한다.** `active === false` 만 걸렀더니 `null`·`0`·`"false"`·`"off"`
  //    는 물론 **필드가 아예 없는 문서까지** 지급 대상이 됐다(2026-08-20 codex CRITICAL, 재현 확인).
  //    "꺼져 있지 않다"와 "켜져 있다"는 다르다 — 돈이 나가는 쪽은 후자를 요구한다.
  //    운영 CLI 는 언제나 진짜 boolean 을 쓰므로 정상 경로에는 영향이 없고,
  //    손으로 만든 반쪽 문서는 여기서 멈춘다.
  if (raw.active !== true) return { ok: false, reason: "inactive" };

  const rewardType = raw.rewardType;
  if (!REWARD_TYPES.includes(rewardType)) {
    return { ok: false, reason: "bad_reward_type" };
  }

  const limits = trustLimitsFor(trustLevel);
  const grantCeiling =
    rewardType === "cash" ? limits.cashPerGrant : limits.couponPerGrant;
  const dayCeiling =
    rewardType === "cash" ? limits.cashPerAppPerDay : limits.couponPerAppPerDay;

  const amount = raw.amount;
  if (!isPosInt(amount, grantCeiling)) {
    // 0·음수·소수·문자열도 여기서 걸린다. 상한 초과와 형식 오류를 굳이 나누지 않는 이유:
    // 어느 쪽이든 지급하면 안 되고, 사유는 로그의 문서 값으로 바로 보인다.
    return { ok: false, reason: "bad_amount" };
  }

  // 성취 단위 하루 한도. 문서가 안 정했으면 "하루 1회"가 기본이다 —
  // 기본값이 무제한이면 필드 하나 빠뜨린 문서가 그날의 캡을 통째로 태운다.
  const maxPerDay = raw.maxPerDay === undefined ? 1 : raw.maxPerDay;
  if (!isPosInt(maxPerDay, HARD_CEILING.PER_DAY_COUNT)) {
    return { ok: false, reason: "bad_max_per_day" };
  }
  // 하루 최대 지급액(= 금액 × 횟수)이 앱 일일 상한을 넘으면 그 문서는 성립하지 않는다.
  if (amount * maxPerDay > dayCeiling) {
    return { ok: false, reason: "day_total_over_ceiling" };
  }

  // 평생 한도는 "없음"이 정상일 수 있다(반복 학습 성취). 0 = 무제한.
  const maxLifetime = raw.maxLifetime === undefined ? 0 : raw.maxLifetime;
  if (!isNonNegInt(maxLifetime, HARD_CEILING.LIFETIME_COUNT)) {
    return { ok: false, reason: "bad_max_lifetime" };
  }

  const cooldownSec = raw.cooldownSec === undefined ? 0 : raw.cooldownSec;
  if (!isNonNegInt(cooldownSec, HARD_CEILING.COOLDOWN_SEC)) {
    return { ok: false, reason: "bad_cooldown" };
  }

  const prereqRaw = raw.prerequisites === undefined ? [] : raw.prerequisites;
  if (!Array.isArray(prereqRaw) || prereqRaw.length > HARD_CEILING.PREREQUISITES) {
    return { ok: false, reason: "bad_prerequisites" };
  }
  const prerequisites = prereqRaw.filter(
    (id) => typeof id === "string" && ACHIEVEMENT_ID_RE.test(id),
  );
  if (prerequisites.length !== prereqRaw.length) {
    // 걸러진 게 있다는 건 문서가 오염됐다는 뜻이다. 조용히 무시하면 선행조건이 사라진다.
    return { ok: false, reason: "bad_prerequisites" };
  }

  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 60) : "";

  return {
    ok: true,
    value: {
      label,
      rewardType,
      amount,
      maxPerDay,
      maxLifetime,
      cooldownSec,
      prerequisites,
      // 지급 로그에 남겨 "그때 어떤 규칙으로 줬는지"를 나중에 재구성할 수 있게 한다.
      // 값이 없으면 0 — 정본이 없다는 뜻이지 오류는 아니다.
      policyVersion: Number.isInteger(raw.policyVersion) ? raw.policyVersion : 0,
      // 환수 가능 여부. 기본을 true 로 두는 이유: 되돌릴 수 없는 지급을 기본값으로 만들지 않는다.
      revocable: raw.revocable !== false,
    },
  };
}

/** 거부 사유 → 학생에게 보여줄 문구. 사유를 그대로 노출하지 않는다(카탈로그 구조가 새어 나간다). */
const DENY_MESSAGE = Object.freeze({
  not_registered: "이 활동은 아직 보상이 준비되지 않았어요.",
  inactive: "이 활동의 보상은 지금 꺼져 있어요.",
  bad_reward_type: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  bad_amount: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  bad_max_per_day: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  day_total_over_ceiling: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  bad_max_lifetime: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  bad_cooldown: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
  bad_prerequisites: "보상 설정에 문제가 있어요. 선생님께 알려 주세요.",
});

module.exports = {
  ACHIEVEMENT_ID_RE,
  REWARD_TYPES,
  TRUST_LEVELS,
  HARD_CEILING,
  TRUST_LIMITS,
  DENY_MESSAGE,
  trustLimitsFor,
  normalizeAchievement,
};
