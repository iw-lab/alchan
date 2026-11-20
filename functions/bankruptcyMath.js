/* eslint-disable max-len */
// 파산 처리의 «셈» — Firestore 를 모르는 순수 함수(시험: src/test/functions/bankruptcy.test.js).
//   규칙(2026-11-20 사용자 결정): 파산하면 현금·파킹·예적금·주식·부동산을 모두 거두고 빚을 지워 0에서 다시 시작한다.
//   쿠폰은 남긴다. 실행은 선생님만. 처리 전 상태를 통째로 저장해 되돌릴 수 있다.

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * 순자산 — 화면(src/utils/netAssets.js)·세금(scheduler-http computeUserNetAssets)과 같은 식.
 * @param {object} s { cash, coupons, couponValue, parking, products[], portfolio[], properties[], stockMap }
 *   products[i] = { type, balance, remainingPrincipal } · portfolio[i] = { id, stockId, quantity } · properties[i] = { price, value }
 */
function netAssetsOf(s) {
  const cash = num(s.cash);
  const couponTotal = num(s.coupons) * num(s.couponValue);
  const parking = num(s.parking);
  let depositSavings = 0;
  let loans = 0;
  for (const p of s.products || []) {
    // 남은 원금이 숫자로 적혀 있으면 0 이어도 그 값을 쓴다 — `||` 로 쓰면 다 갚은 대출(0)이 balance 로 넘어가
    //   빚으로 잡히고, 그만큼 순자산이 낮아져 자산을 지우는 문이 열린다(8way grok). 판정은 화면보다 **엄격한 쪽**으로.
    if (p.type === "loan") loans += typeof p.remainingPrincipal === "number" && Number.isFinite(p.remainingPrincipal) ? p.remainingPrincipal : num(p.balance);
    else if (p.type === "deposit" || p.type === "savings") depositSavings += num(p.balance);
  }
  let stocks = 0;
  for (const h of s.portfolio || []) {
    const qty = num(h.quantity);
    if (qty <= 0) continue;
    const sid = h.stockId != null ? h.stockId : h.id;
    stocks += num((s.stockMap || {})[sid] ?? (s.stockMap || {})[String(sid)]) * qty;
  }
  let realEstate = 0;
  for (const a of s.properties || []) realEstate += num(a.price) || num(a.value);
  const net = cash + couponTotal + parking + depositSavings + stocks + realEstate - loans;
  return { cash, couponTotal, parking, depositSavings, stocks, realEstate, loans, net };
}

/** 파산 대상인가 — 신청 화면과 같은 기준(순자산 < 0). 숫자가 아닌 현금은 손대지 않는다. */
function bankruptcyEligibility(rawCash, parts) {
  if (typeof rawCash !== "number" || !Number.isFinite(rawCash)) return { ok: false, reason: "학생 잔액 데이터에 오류가 있습니다." };
  if (!(parts.net < 0)) return { ok: false, reason: `지금은 순자산이 ${Math.round(parts.net).toLocaleString()}원이라 파산 대상이 아닙니다(순자산이 마이너스일 때만).` };
  return { ok: true };
}

// 한 트랜잭션 쓰기 상한(500) 아래로 — 넘으면 일부만 지워지는 대신 통째로 거절한다.
const MAX_DOCS = 200;

module.exports = { netAssetsOf, bankruptcyEligibility, MAX_DOCS };
