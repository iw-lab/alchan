/**
 * 학급 경제 리포트 — 계산만 떼어 낸 순수 함수. (화면: 관리 → 학급 경제 리포트)
 *
 * 입력은 학생별 자산 내역(computeUserNetAssets 가 주는 모양), 출력은 선생님이 한눈에 볼 숫자다.
 * 돈을 움직이지 않는다 — 읽어서 세기만 한다.
 */

// 한 학생 자산의 절댓값 상한. 학급 화폐가 아무리 불어도 여기까지는 안 가고, 이 안에서는
// 합·가중합이 Infinity 로 넘치지 않는다(1e15 × 수만 명 ≪ 1.8e308 · 정수 정밀도 9e15 안쪽).
const CAP = 1e15;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-CAP, Math.min(CAP, v)) : 0);
const sum = (xs) => xs.reduce((s, v) => s + v, 0);

/** 가운데 값(짝수면 두 가운데 값의 평균). 빈 배열은 0. */
function median(values) {
  const xs = values.filter((v) => typeof v === "number" && Number.isFinite(v)).map(num).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2);
}

/**
 * 지니계수(0 = 모두 같다, 1 = 한 명이 다 가졌다).
 * 빚(음수)은 0 으로 본다 — 음수가 섞이면 지니가 1 을 넘어 뜻을 잃는다.
 * 2명 미만이거나 가진 돈이 전부 0 이면 0.
 */
function gini(values) {
  const xs = values.map((v) => Math.max(0, num(v))).sort((a, b) => a - b);
  const n = xs.length;
  const total = sum(xs);
  if (n < 2 || total <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * xs[i];
  const g = (2 * weighted) / (n * total) - (n + 1) / n;
  return Math.round(Math.max(0, Math.min(1, g)) * 1000) / 1000;
}

/** 위(또는 아래)에서 ratio 만큼의 학생이 가진 몫(0~1). 빚은 0 으로 본다. */
function shareOf(values, ratio, fromTop) {
  const xs = values.map((v) => Math.max(0, num(v))).sort((a, b) => a - b);
  const total = sum(xs);
  if (!xs.length || total <= 0) return 0;
  const k = Math.max(1, Math.round(xs.length * ratio));
  const part = fromTop ? xs.slice(xs.length - k) : xs.slice(0, k);
  return Math.round((sum(part) / total) * 1000) / 1000;
}

const PARTS = ["cash", "couponTotal", "parkingBalance", "depositSavingsTotal", "stockValue", "realEstateValue"];

/**
 * @param {Array<object>} rows 학생별 { cash, couponTotal, parkingBalance, depositSavingsTotal, stockValue, realEstateValue, loanTotal, totalAssets, netAssets }
 * @return {object} 리포트 숫자
 */
function buildClassReport(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === "object");
  const net = list.map((r) => num(r.netAssets));
  const composition = {};
  for (const k of PARTS) composition[k] = Math.round(sum(list.map((r) => num(r[k]))));
  const totalAssets = Math.round(sum(list.map((r) => num(r.totalAssets))));
  const loanTotal = Math.round(sum(list.map((r) => num(r.loanTotal))));
  const saved = (r) => num(r.parkingBalance) + num(r.depositSavingsTotal);
  return {
    count: list.length,
    totalAssets, // 학급에 풀린 자산 전체(빚 빼기 전)
    loanTotal,
    netTotal: Math.round(sum(net)),
    mean: list.length ? Math.round(sum(net) / list.length) : 0,
    median: median(net),
    // 전개(Math.min(...net))를 쓰지 않는다 — 인원이 아주 많으면 인자 개수 한도에 걸려 던진다.
    min: net.reduce((m, v) => (v < m ? v : m), list.length ? net[0] : 0),
    max: net.reduce((m, v) => (v > m ? v : m), list.length ? net[0] : 0),
    gini: gini(net),
    top20Share: shareOf(net, 0.2, true),
    bottom50Share: shareOf(net, 0.5, false),
    composition,
    inDebt: list.filter((r) => num(r.netAssets) < 0).length,
    borrowers: list.filter((r) => num(r.loanTotal) > 0).length,
    savers: list.filter((r) => saved(r) > 0).length,
    investors: list.filter((r) => num(r.stockValue) > 0).length,
    landlords: list.filter((r) => num(r.realEstateValue) > 0).length,
  };
}

module.exports = { median, gini, shareOf, buildClassReport, CAP };
