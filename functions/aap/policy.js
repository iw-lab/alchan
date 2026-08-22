// functions/aap/policy.js
// 📜 앱별 **집행 정책** — 표시용 카탈로그와 분리된 쪽.
//
// 왜 `platformApps/_registry` 에 같이 넣지 않는가 (계획서 §3.5 C12/C13)
//   카탈로그(이름·아이콘·URL)는 사이드바를 그리는 데 쓰이고 **브라우저 세션당 1회 캐시**된다.
//   그 문서에 kill switch 를 같이 넣으면, 앱을 끈 뒤에도 **캐시가 살아 있는 학생에게는
//   계속 켜져 있다.** 차단 스위치가 stale 캐시에 묻히는 건 구조적 사고다.
//   그래서 정책은 앱별 문서로 분리하고 **절대 캐시하지 않는다** — 실행/지급 때마다 직접 읽는다.
//   비용도 이 편이 싸다: 표시는 1읽기, 정책은 **실제로 여는 앱 1개만** 읽는다.
const { db, logger } = require("../utils");

/** 앱 id 형식. 카탈로그(`src/config/learningApps.js`)의 ID_RE 와 같은 규칙. */
const APP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 토큰에 실을 수 있는 **선택** 클레임의 전체 목록.
 * 정책 문서가 뭘 요구하든 이 목록 밖은 나가지 않는다 — 화이트리스트가 코드에 있어야
 * Firestore 문서 한 줄로 개인정보 항목이 늘어나는 일이 없다(계획서 §5.3).
 */
const ALLOWED_OPTIONAL_CLAIMS = ["nick", "cls"];

/**
 * 앱 정책을 **캐시 없이** 읽는다.
 *
 * @param {string} appId 앱 id
 * @return {Promise<object|null>} 정책 문서 데이터 또는 null
 */
async function readAppPolicy(appId) {
  if (typeof appId !== "string" || !APP_ID_RE.test(appId)) return null;
  const snap = await db.collection("platformAppPolicies").doc(appId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * 정책이 "지금 이 앱을 열어도 되는 상태"인지 판정한다.
 *
 * 반환을 boolean 이 아니라 사유 문자열로 두는 이유: 거부 사유가 학생에게 보여줄 문구와
 * 로그에 남길 원인으로 각각 필요한데, boolean 이면 호출부가 사유를 다시 추측하게 된다.
 *
 * @param {object|null} policy 정책 문서
 * @return {{ok: boolean, reason?: string}} 판정
 */
function checkPolicyOpen(policy) {
  if (!policy) return { ok: false, reason: "not_registered" };
  // 🔴 kill switch. 이 한 줄이 "문제가 보이면 즉시 끈다"의 전부다(계획서 §3.1 원칙 4).
  if (policy.status !== "active") return { ok: false, reason: "disabled" };
  // 카탈로그에는 있지만 아직 AAP 로 이관되지 않은 앱(= 그냥 링크로만 여는 앱).
  if (policy.aapEnabled !== true) return { ok: false, reason: "not_migrated" };
  const url = validateLaunchUrl(policy.launchUrl);
  if (!url) return { ok: false, reason: "bad_launch_url" };
  return { ok: true };
}

/**
 * 실행 URL 검증 — **요청자가 아니라 서버가 정한다**(계획서 §3.2 C6).
 *
 * 요청자가 URL 을 지정할 수 있으면 fragment 에 담긴 토큰을 공격자 사이트로 보낼 수 있다.
 * 그래서 이 값은 정책 문서(슈퍼관리자만 쓰기)에서만 오고, 읽는 쪽에서 한 번 더 검사한다.
 *
 * ⚠️ 이미 fragment 가 있는 URL 은 거부한다 — 토큰을 `#t=` 로 덧붙이면 앞의 fragment 를
 *    덮어써서 앱이 엉뚱한 화면으로 열리거나, 반대로 토큰이 앞 fragment 에 먹힌다.
 *
 * @param {*} raw 정책 문서의 launchUrl
 * @return {URL|null} 검증된 URL 또는 null
 */
function validateLaunchUrl(raw) {
  if (typeof raw !== "string" || !raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  // ⚠️ `parsed.hash` 만 보면 **트레일링 `#`** 을 놓친다 — `new URL("https://x/#").hash` 는
  //    빈 문자열인데 `href` 에는 `#` 이 남는다(실측). 그대로 두면 아래에서 토큰을 붙일 때
  //    `https://x/##aap=…` 가 되고, 앱이 `hash.slice(1)` 로 파싱하면 키가 `#aap` 이 되어
  //    **토큰을 영영 못 읽는다**(조용한 실패). 원문에 `#` 이 있으면 그냥 거부한다.
  //    (2026-08-22 codex 레인 NIT — ops 쪽 검증에도 같은 구멍이 있었다)
  if (raw.includes("#")) return null;
  // `https://진짜앱.example@evil.test/` 형태를 막는다. 브라우저는 `evil.test` 로 가는데
  // 콘솔에서 값을 훑는 사람 눈에는 앞쪽 호스트로 읽힌다 — 정책 문서를 검토하는 사람을
  // 속이는 모양이라 애초에 받지 않는다(정상적인 학습앱 URL 에 자격증명이 붙을 이유가 없다).
  if (parsed.username || parsed.password) return null;
  return parsed;
}

/**
 * 정책이 허용한 선택 클레임만 골라낸다(코드 화이트리스트 ∩ 정책 목록).
 *
 * @param {object} policy 정책 문서
 * @return {string[]} 실을 클레임 이름들
 */
function resolveOptionalClaims(policy) {
  const requested = Array.isArray(policy?.allowedClaims) ? policy.allowedClaims : [];
  return ALLOWED_OPTIONAL_CLAIMS.filter((c) => requested.includes(c));
}

/**
 * 학급이 이 앱을 껐는지. 교사가 학급별로 끄는 기존 장치(`settings/menuLocks_{classCode}`)를
 * 그대로 쓴다 — 새 스위치를 만들면 사이드바에서는 꺼졌는데 토큰은 나가는 상태가 생긴다.
 *
 * 실패 시 **잠긴 것으로 보지 않는다**(fail-open): 여긴 권한 경계가 아니라 교사 취향이고,
 * 설정 조회 한 번 실패로 학습앱이 통째로 막히는 편이 더 나쁘다. 진짜 차단은 위의
 * kill switch(status)가 담당하고 그쪽은 fail-closed 다.
 *
 * @param {string} classCode 학급코드
 * @param {string} appId 앱 id
 * @return {Promise<boolean>} 잠겼으면 true
 */
async function isAppLockedForClass(classCode, appId) {
  if (!classCode) return false;
  try {
    const snap = await db.collection("settings").doc(`menuLocks_${classCode}`).get();
    if (!snap.exists) return false;
    const ids = snap.data().lockedItemIds;
    return Array.isArray(ids) && ids.includes(appId);
  } catch (e) {
    logger.warn(`[AAP] 학급 잠금 조회 실패(잠기지 않은 것으로 진행): ${e?.message}`);
    return false;
  }
}

module.exports = {
  APP_ID_RE,
  ALLOWED_OPTIONAL_CLAIMS,
  readAppPolicy,
  checkPolicyOpen,
  validateLaunchUrl,
  resolveOptionalClaims,
  isAppLockedForClass,
};
