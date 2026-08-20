/**
 * 관리자 회수의 **0원 바닥** — 단일 진실원.
 *
 * 배경(2026-07-27 실측): 관리자 회수가 `// 학생 차감(마이너스 허용)` 이라 가진 것보다 많이
 * 가져갈 수 있었다. −50,000,000 회수가 28분 간격으로 두 번 들어가 한 학생이 **−99,724,000**
 * 이 됐다. 두 번째는 가져갈 게 없는데도 실행됐고, 그만큼이 국고에 **없던 돈으로 적립**됐다.
 *
 * 왜 순수 함수로 떼어내나: 회수는 **학생 차감과 국고 적립이 같은 금액**이어야 돈이 보존된다.
 * 자르는 곳이 한 군데여야 그 등식이 저절로 성립한다 — 차감만 자르면 국고에 돈이 생기고,
 * 적립만 자르면 돈이 사라진다. 이 저장소는 같은 종류의 복붙 실수로 주급이 한 주 멎은 적이 있다
 * (functions/batchChunk.js 참고).
 */

/**
 * 회수 가능한 금액을 구한다.
 *
 * @param {number} currentCash 학생의 현재 잔액(음수일 수 있다)
 * @param {number} requested   회수하려는 금액(양수)
 * @returns {{amount: number, clampedFrom: number}}
 *   `amount` = 실제로 옮길 금액(차감·적립 양쪽에 이 값을 쓴다).
 *   `clampedFrom` = 잘렸을 때만 원래 요청액, 안 잘렸으면 0.
 */
function clampTakeAmount(currentCash, requested) {
  const cash = Number.isFinite(currentCash) ? currentCash : 0;
  const want = Number.isFinite(requested) && requested > 0 ? requested : 0;
  const takeable = Math.max(0, cash);
  if (want > takeable) return { amount: takeable, clampedFrom: want };
  return { amount: want, clampedFrom: 0 };
}

module.exports = { clampTakeAmount };
