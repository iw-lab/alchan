// functions/aap/catalog.js
// 🏅 성취 카탈로그 **조회** — Firestore 에서 읽어 순수 규칙(catalogRules.js)으로 판정한다.
//
// 규칙이 왜 옆 파일에 있는지는 catalogRules.js 헤더 참고(운영 스크립트가 같은 정본을 쓴다).
//
// 저장 위치
//   appAchievements/{appId}/items/{achievementId}
//   쓰기는 **슈퍼관리자만**(firestore.rules). 서버는 Admin SDK 라 규칙을 우회하므로,
//   교사 계정이 털려도 여기 금액을 못 바꾼다(계획서 §2.4 A8).
const { db } = require("../utils");
const rules = require("./catalogRules");

/**
 * 성취를 **캐시 없이** 읽는다.
 *
 * 캐시하지 않는 이유는 kill switch 와 같다(계획서 §3.5 C13): 금액을 고친 뒤에도
 * 캐시가 살아 있는 인스턴스는 옛 금액으로 계속 지급한다. 지급 1회당 1읽기는
 * 이 위험을 없애는 값으로 싸다.
 *
 * @param {string} appId 앱 id
 * @param {string} achievementId 성취 id
 * @return {Promise<object|null>} 문서 데이터 또는 null
 */
async function readAchievement(appId, achievementId) {
  if (typeof appId !== "string" || !rules.ACHIEVEMENT_ID_RE.test(appId)) return null;
  if (typeof achievementId !== "string" || !rules.ACHIEVEMENT_ID_RE.test(achievementId)) {
    return null;
  }
  const snap = await db
    .collection("appAchievements")
    .doc(appId)
    .collection("items")
    .doc(achievementId)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * 읽기 + 검증을 한 번에. 보상 API(P1-2)가 쓰는 진입점.
 *
 * @param {string} appId 검증된 토큰의 aud
 * @param {string} achievementId 요청의 성취 id
 * @param {string} trustLevel 앱 정책의 신뢰등급
 * @return {Promise<{ok: boolean, reason?: string, value?: object}>} 판정
 */
async function resolveAchievement(appId, achievementId, trustLevel) {
  const raw = await readAchievement(appId, achievementId);
  return rules.normalizeAchievement(raw, trustLevel);
}

module.exports = {
  // 순수 규칙은 그대로 다시 내보낸다 — 서버 코드가 두 파일을 다 require 하지 않게.
  ...rules,
  readAchievement,
  resolveAchievement,
};
