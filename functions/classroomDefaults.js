/**
 * 새 학급 기본값 — **정본은 `classroomDefaults.json` 하나**다.
 *
 * 전에는 같은 목록이 여기와 클라(src/pages/auth/Login.js)에 손으로 두 벌 있었다.
 * 슈퍼관리자 승인 화면은 클라 사본으로, 수동 초기화 CF 는 여기 사본으로 jobs 를 만들었으니
 * 한쪽만 고치면 학급마다 기본 직업이 달라진다(2026-11-14 교차검증 meta). 이제 둘 다 JSON 을 읽는다.
 *
 * 직업 필드: title · tasks · description(하는 일) · howToSelect(뽑는 법) ·
 *            appointedOnly(권한직 — 합의금·세금·승인 권한이 붙는 자리. jobUtils.isAppointedJob).
 */
const defaults = require("./classroomDefaults.json");

module.exports = {
  DEFAULT_JOBS: defaults.jobs,
  DEFAULT_STORE_ITEMS: defaults.storeItems,
  DEFAULT_BANKING: defaults.banking,
  DEFAULT_SALARIES: defaults.salaries,
};
