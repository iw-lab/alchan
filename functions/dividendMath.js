/**
 * 배당 계산 — 단일 진실원 (순수 함수. firebase-admin 을 import 하지 않는다).
 *
 * `dividendService.js` 는 Firestore 를 붙잡고 있어 테스트에서 require 할 수 없다.
 * 그래서 '얼마를 주는가'와 '어느 달 것인가'만 여기로 떼어 낸다.
 * taxMath.js · salaryUtils.js 와 같은 배치다.
 */

const DIVIDEND_TAX_RATE = 0.154; // 배당소득세 15.4%

/**
 * KST 기준 월 키 ("2026-08"). 멱등 마커의 단위.
 * UTC 로 계산하면 매월 1일 KST 00:00~08:59 가 전달로 찍혀 그 달 배당이 두 번 나갈 수 있다.
 */
function computeMonthKey(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 단일 보유(holding)의 배당 지급액.
 * @returns {{grossAmount:number, taxAmount:number, netAmount:number} | null} 지급 대상이 아니면 null
 */
function calculateDividend(stock, holding) {
  const yieldAnnual = stock?.dividendYieldAnnual || 0;
  if (!Number.isFinite(yieldAnnual) || yieldAnnual <= 0) return null;

  const quantity = holding?.quantity || 0;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  // 🔒 음수·NaN 가격 방어. buyStock 이 같은 이유로 뚫렸던 적이 있다(2026-08-11 C3).
  //    여기서 통과시키면 grossAmount 가 음수가 되어 '배당이 현금을 뺏는' 결과가 된다.
  const price = stock?.price || 0;
  if (!Number.isFinite(price) || price <= 0) return null;

  const monthlyRate = yieldAnnual / 100 / 12;
  const grossAmount = Math.floor(quantity * price * monthlyRate);
  if (!Number.isFinite(grossAmount) || grossAmount < 1) return null;

  const taxAmount = Math.floor(grossAmount * DIVIDEND_TAX_RATE);
  const netAmount = grossAmount - taxAmount;

  return { grossAmount, taxAmount, netAmount };
}

/**
 * 수동 백필로 들어오는 monthKey 가 실제로 존재하는 달인가.
 * `/^\d{4}-\d{2}$/` 만으로는 "2026-00" · "2026-99" · "9999-13" 이 전부 통과한다(실측).
 */
function isValidMonthKey(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}$/.test(v)) return false;
  const [y, m] = v.split("-").map(Number);
  return y >= 2020 && y <= 2100 && m >= 1 && m <= 12;
}

module.exports = {
  calculateDividend,
  computeMonthKey,
  isValidMonthKey,
  DIVIDEND_TAX_RATE,
};
