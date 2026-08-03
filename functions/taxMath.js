/**
 * 주간세(순자산세·부동산 보유세) 계산 — 순수 함수.
 *
 * 왜 분리했나: 이 공식은 scheduler-http.js 의 징수 루프 안에 인라인으로 박혀 있어
 * 테스트가 불가능했다. 학생 현금을 직접 차감하는 유일한 정기 경로인데
 * (increment(-totalTax), 현금 부족 시 마이너스 허용) 회귀를 잡을 그물이 없었다.
 * 이제 징수 루프는 이 함수를 호출하고, 공식은 taxMath.test.js 가 고정한다.
 *
 * ⚠️ 단일 정본: 주간세 공식은 여기 말고 어디에도 두지 않는다.
 *    2026-08-03 정리 전엔 죽은 세금 코드가 둘 있었다 — 둘 다 제거됨:
 *      · functions/taxUtils.js — 주식·아이템·부가세·소득세를 다루던 별개 도메인의 고아
 *        모듈(require 0건). 주간세와 공식이 겹치진 않았고, 하필 나머지 17곳과 다른
 *        컬렉션(treasury vs nationalTreasuries)에 써서 세수가 갈 곳도 없었다.
 *      · src/firebase/db/transactions.js collectPropertyHoldingTaxes — 보유세를 클라에서
 *        걷던 두 번째 경로(호출부 0). 세율은 같았지만 과세표준 경로가 달랐고
 *        weekKey 이중과세 가드가 없었다.
 */

/** 교사가 국세청 UI에서 아무것도 설정하지 않았을 때의 값. */
const DEFAULT_WEEKLY_TAX = {
  netAssetTaxRate: 0.005, // 순자산세율 0.5%
  netAssetTaxExemption: 0, // 면세 기준 — 순자산이 이 값을 '초과'하면 과세. 0 = 모두 과세
  propertyHoldingTaxRate: 0.002, // 부동산 보유세 플랫 세율 0.2%
};

/**
 * governmentSettings/{classCode}.taxSettings 원본을 안전한 세율로 정규화한다.
 *
 * 교사가 UI에서 직접 편집하는 값이라 음수·NaN·1 초과가 들어올 수 있다.
 * 음수 세율은 과세를 '지급'으로 뒤집으므로 반드시 0으로 눌러야 한다.
 *
 * @param {?object} raw taxSettings 객체. null·undefined 도 받는다
 *   (governmentSettings 조회 실패·문서 부재 경로가 그대로 흘러들어온다) → 전부 기본값.
 * @return {{netAssetTaxRate: number, netAssetTaxExemption: number,
 *           propertyHoldingTaxRate: number}} 클램프된 설정
 */
function normalizeWeeklyTaxSettings(raw) {
  const t = raw || {};
  const pick = (key) =>
    Number.isFinite(t[key]) ? t[key] : DEFAULT_WEEKLY_TAX[key];

  const clampRate = (v) => Math.min(Math.max(v, 0), 1);
  const exemption = pick("netAssetTaxExemption");

  return {
    netAssetTaxRate: clampRate(pick("netAssetTaxRate")),
    propertyHoldingTaxRate: clampRate(pick("propertyHoldingTaxRate")),
    // 면세 기준은 상한이 없다(학급 경제가 인플레하면 기준도 커진다).
    // 음수·비정상만 0으로 — 음수 기준은 "모두 과세"와 같으므로 0과 동치.
    netAssetTaxExemption:
      Number.isFinite(exemption) && exemption >= 0 ? exemption : 0,
  };
}

/**
 * 학생 1명의 주간세를 계산한다.
 *
 * - 순자산세: 순자산이 면세 기준을 '초과'할 때만(> 이지 >= 아님) 과세.
 *   과세표준은 현금이 아니라 순자산(현금·예금·주식·부동산 − 대출)이다.
 * - 보유세: 부동산 가치 × 플랫 세율. 누진 배율은 2026-07-21 폐지.
 * - 반올림은 Math.round(항목별). 합계를 반올림하지 않는다 — 감사 로그가
 *   항목별 금액을 그대로 적으므로 항목 합 ≠ 차감액이 되면 안 된다.
 *
 * netAssets/realEstateValue 가 NaN 이면 비교가 false 로 떨어져 0원이 된다
 * (fail-safe: 계산 실패가 학생에게 과세되지 않는다).
 *
 * ⚠️ settings 는 내부에서 다시 정규화한다. 정규화는 멱등이라 이미 정규화된 값을
 *    넘겨도 결과가 같고(호출부 동작 무변화), 정규화를 잊고 raw taxSettings 를 넘긴
 *    호출자가 음수 세율로 **세금을 지급으로 뒤집는** 사고를 못 내게 막는다.
 *    (방어 없이 raw {netAssetTaxRate:-0.5} 를 넘기면 순자산 100만원 학생에게
 *     -500,000원이 나온다 — 2026-08-03 실측.)
 *
 * @param {{netAssets: number, realEstateValue: number}} student 과세표준
 * @param {object} settings taxSettings — 정규화 전/후 아무거나
 * @return {{netAssetTax: number, propertyTax: number, totalTax: number}} 세액
 */
function computeWeeklyTax(student, rawSettings) {
  const settings = normalizeWeeklyTaxSettings(rawSettings);
  const netAssets = student.netAssets;
  const realEstateValue = student.realEstateValue;

  const netAssetTax =
    netAssets > settings.netAssetTaxExemption ?
      Math.round(netAssets * settings.netAssetTaxRate) :
      0;

  const propertyTax =
    realEstateValue > 0 && settings.propertyHoldingTaxRate > 0 ?
      Math.round(realEstateValue * settings.propertyHoldingTaxRate) :
      0;

  return {netAssetTax, propertyTax, totalTax: netAssetTax + propertyTax};
}

module.exports = {
  DEFAULT_WEEKLY_TAX,
  normalizeWeeklyTaxSettings,
  computeWeeklyTax,
};
