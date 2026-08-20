/**
 * Firestore 배치 분할 판정 — 단일 진실원.
 *
 * 배경(2026-08-17 주급 전 학급 실패):
 *   "450건 넘으면 커밋하고 새 batch" 로직이 같은 저장소에 **손으로 세 번 복붙**돼 있었다
 *   (주급·재산세·배당). 그중 하나를 옮기다 정의가 엉뚱한 함수 안에 붙었고
 *   (`flushIfNeeded is not defined`), 그 주 주급이 통째로 나가지 않았다.
 *
 *   린트(no-undef)가 이제 그런 실수를 잡지만, 그건 사후 안전망이지 원인 제거가 아니다.
 *   판정을 한 곳으로 모으면 다음 사람이 복붙 대신 import 한다.
 *
 * 왜 "판정"만 떼어내나: 커밋 자체(무엇을 batch 에 얹고 무엇을 함께 커밋하는가)는
 * 호출부마다 다르다 — 주급은 관리자 차감을, 세금은 국고 입금을, 배당은 학급별 세금을
 * 같은 커밋에 실어야 한다. 그 "함께 나가야 하는 자리"를 `reserved` 로 받는다.
 * periodLock.js 와 같은 원칙이다: 판정은 순수 함수로, 부수효과는 호출부에.
 *
 * 이 파일은 firebase-admin 을 import 하지 않는다(vitest 에서 그대로 require 가능).
 */

/** Firestore 배치 한 번의 쓰기 한도는 500. 안전 마진 10%. */
const DEFAULT_SOFT_LIMIT = 450;

/**
 * 지금 batch 에 `extraOps` 개를 더 얹으면 한도를 넘는가?
 *
 * @param {number} currentOps 이 batch 에 이미 얹은 쓰기 수
 * @param {number} extraOps 지금 얹으려는 쓰기 수
 * @param {object} [opts]
 * @param {number} [opts.softLimit=450] 소프트 한도
 * @param {number} [opts.reserved=0] 커밋 직전에 **반드시 함께** 실려야 하는 쓰기 수
 *   (주급의 관리자 차감 1, 재산세의 국고 입금 2, 배당의 학급별 세금 2×학급수 등).
 *   이걸 안 세면 마지막 순간에 자리가 모자라 한도를 넘는다.
 * @return {boolean} 먼저 커밋해야 하면 true
 */
function shouldFlush(currentOps, extraOps, opts = {}) {
  const { softLimit: rawLimit = DEFAULT_SOFT_LIMIT, reserved: rawReserved = 0 } = opts;
  // 방어: 한도가 0 이하로 들어오면 매 쓰기마다 커밋해 성능이 무너지고,
  //   음수 예약은 한도를 넘겨 batch 전체를 실패시킨다. 둘 다 조용히 망가지는 종류라 막는다.
  const softLimit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_SOFT_LIMIT;
  const reserved = Number.isFinite(rawReserved) && rawReserved > 0 ? rawReserved : 0;
  const current = Number.isFinite(currentOps) && currentOps > 0 ? currentOps : 0;
  const extra = Number.isFinite(extraOps) && extraOps > 0 ? extraOps : 0;
  return current + extra + reserved > softLimit;
}

module.exports = { shouldFlush, DEFAULT_SOFT_LIMIT };
