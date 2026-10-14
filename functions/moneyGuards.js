/**
 * 금액 가드 — 단일 진실원 (순수 함수. firebase-admin 을 import 하지 않는다).
 *
 * 이 앱은 **같은 구멍에 두 번 뚫렸다.**
 *   1차(2026-08-11 교차검증 C3): `if (!stock.price)` 진위 검사만 있어 `price: -100` 이 통과.
 *      cost 가 음수 → 잔액 검사 우회 → `increment(-totalCost)` 가 현금을 **발행**했다.
 *   2차(같은 날 재검증, codex): "유한한 양수" 로 좁혔더니 그것도 뚫렸다.
 *      · `Number.MIN_VALUE`(5e-324) — 유한 양수라 통과하는데 cost 가 0 으로 반올림돼 **공짜 매수**.
 *        실물가 갱신이 최소 100원으로 올려 주므로 되팔면 무담보 차익이 된다.
 *      · `Number.MAX_VALUE` — 유한하지만 × 수량 하면 **Infinity** → `increment(Infinity)`.
 *
 * 그래서 두 가지를 함께 강제한다.
 *   ① 입력 가격은 **1 이상 100억 이하의 정수**  ② 파생 금액도 유한·안전범위인지 재확인
 * 산문 주석으로는 또 뚫린다 — `src/test/functions/moneyGuards.test.js` 가 이 파일을 지킨다.
 */

/** 금액 상한. index.js 의 송금·합의금·구매 검증이 쓰는 값과 같다(100억). */
const MAX_MONEY = 10000000000;

/** 주식 1주 가격 상한. 금액 상한과 같은 기준을 쓴다. */
const MAX_STOCK_PRICE = MAX_MONEY;

/**
 * 거래에 쓸 수 있는 가격인가.
 * @param {unknown} v
 * @returns {boolean} 1 이상 MAX_STOCK_PRICE 이하의 정수일 때만 true
 */
function isValidStockPrice(v) {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= 1 &&
    v <= MAX_STOCK_PRICE
  );
}

/**
 * 계산으로 나온 금액이 실제로 장부에 써도 되는 값인가.
 * `increment(Infinity)` · `increment(NaN)` 이 장부에 들어가는 것을 막는 마지막 관문.
 *
 * ⚠️ 기본 상한이 MAX_MONEY 가 **아닌** 이유(실측으로 알게 됨):
 *   사업 상한(100억)은 **입력**(가격·송금액)에 거는 것이지 중간 계산값에 걸면 안 된다.
 *   라이브 최고가는 SK하이닉스 143만원인데, 최대 수량 10,000주면 총액이 **143억**이 된다.
 *   여기서 100억으로 자르면 "현금이 부족합니다" 대신 엉뚱한 에러가 나가고,
 *   나중에 비싼 종목이 들어오면 정상 거래가 막힌다.
 *   이 함수의 일은 **Infinity·NaN·말도 안 되는 크기**를 거르는 것뿐이다.
 *   잔액 부족은 잔액 검사가 판단한다.
 * @param {unknown} v
 * @param {number} [max=Number.MAX_SAFE_INTEGER] 허용 절대값 상한
 */
function isSafeAmount(v, max = Number.MAX_SAFE_INTEGER) {
  return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
}

module.exports = {
  MAX_MONEY,
  MAX_STOCK_PRICE,
  isValidStockPrice,
  isSafeAmount,
};
