/**
 * 신용등급 — 서버 정본(순수 함수). 대출 금리·한도가 이 등급으로 정해진다.
 * 화면 사본 = src/utils/creditGrade.js (같은 규칙. src/test/functions/creditMath.test.js 가 두 파일의
 * 결과가 같은지 표로 대조한다 — 한쪽만 고치면 빨강).
 *
 * 무엇을 보나: «약속대로 갚았나 · 빚보다 가진 게 많은가 · 따로 모아 둔 돈이 있는가».
 *   기본 50
 *   + 빚 없음 10 · 통장에 모아 둔 돈 있음 10 · 예금/적금 가입 중 10 · 모아 둔 돈이 (현금+모은 돈)의 1/4 이상 10
 *   + 대출을 성실히 다 갚은 횟수 ×5 (최대 15)
 *   − 최근 30일 안에 «갚을 돈이 모자라 강제로 갚은» 적 있음 20
 *   − 지금 갚을 날이 지난 대출 있음 30 · 금융 순자산(현금+모은 돈−대출)이 마이너스 25
 *   85↑ 1등급 · 70↑ 2 · 55↑ 3 · 40↑ 4 · 그 아래 5   (1등급이 가장 좋다)
 *
 * 대출 연동: 금리 = 상품 금리 × {1:0.8, 2:0.9, 3:1, 4:1.15, 5:1.3},  한도 = 현금 × {1:10, 2:10, 3:8, 4:5, 5:3}
 */
const CAP = 1e15;
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-CAP, Math.min(CAP, v)) : 0);
const count = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(1000, Math.floor(v)) : 0);
const toMs = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LATE_WINDOW_MS = 30 * DAY_MS;
const MIN_HOLD_MS = DAY_MS;
const RATE_MULT = { 1: 0.8, 2: 0.9, 3: 1, 4: 1.15, 5: 1.3 };
const LIMIT_MULT = { 1: 10, 2: 10, 3: 8, 4: 5, 5: 3 };
const MAX_DAILY_RATE = 100;

/**
 * @param {object} p { cash, savedTotal, savingProducts, loans:[{balance, remainingPrincipal, maturityDate}], record:{onTime, late, lastLateAt} }
 * @param {number} now ms
 * @return {{grade:1|2|3|4|5, score:number, good:string[], bad:string[], next:string}}
 */
function creditGrade(p, now = Date.now()) {
  const s = p && typeof p === "object" ? p : {};
  const loans = (Array.isArray(s.loans) ? s.loans : []).filter((l) => n(l && l.remainingPrincipal) > 0 || n(l && l.balance) > 0);
  const debt = loans.reduce((t, l) => t + (n(l.remainingPrincipal) || n(l.balance)), 0);
  const overdue = loans.filter((l) => { const t = toMs(l.maturityDate); return t > 0 && t < now; }).length;
  const cash = n(s.cash);
  const saved = Math.max(0, n(s.savedTotal));
  const products = count(s.savingProducts);
  const rec = s.record && typeof s.record === "object" ? s.record : {};
  const onTime = count(rec.onTime);
  const lastLate = toMs(rec.lastLateAt);
  const recentLate = count(rec.late) > 0 && lastLate > 0 && now - lastLate < LATE_WINDOW_MS && now - lastLate >= -DAY_MS;
  const base = Math.max(0, cash) + saved;

  let score = 50;
  const good = [], bad = [];
  if (loans.length === 0) { score += 10; good.push("빚이 없어요"); }
  if (saved > 0) { score += 10; good.push("통장에 모아 둔 돈이 있어요"); }
  if (products > 0) { score += 10; good.push("예금·적금에 가입했어요"); }
  if (saved > 0 && saved / base >= 0.25) { score += 10; good.push("가진 돈의 4분의 1 넘게 모아 뒀어요"); }
  if (onTime > 0) { score += Math.min(15, onTime * 5); good.push(`대출을 약속대로 ${onTime}번 다 갚았어요`); }
  if (recentLate) { score -= 20; bad.push("최근에 갚을 돈이 모자라 강제로 갚은 적이 있어요"); }
  if (overdue > 0) { score -= 30; bad.push(`갚을 날이 지난 대출이 ${overdue}건 있어요`); }
  if (cash + saved - debt < 0) { score -= 25; bad.push("가진 것보다 빚이 많아요"); }
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? 1 : score >= 70 ? 2 : score >= 55 ? 3 : score >= 40 ? 4 : 5;

  let next = "지금처럼만 하면 돼요!";
  if (overdue > 0) next = "기한이 지난 대출부터 갚으면 등급이 올라요.";
  else if (cash + saved - debt < 0) next = "빚을 줄여 가진 것이 더 많아지게 해 보세요.";
  else if (saved <= 0) next = "파킹통장에 돈을 넣어 두면 등급이 올라요.";
  else if (products <= 0) next = "예금이나 적금에 가입하면 등급이 올라요.";
  else if (saved / base < 0.25) next = "가진 돈의 4분의 1 넘게 통장에 모으면 등급이 올라요.";
  else if (recentLate) next = "한 달 동안 빚 없이 지내면 등급이 다시 올라요.";
  else if (grade > 1) next = "대출을 약속한 날 안에 다 갚으면 등급이 올라요.";
  return { grade, score, good, bad, next };
}

/**
 * 등급에 따른 대출 조건.
 * @param {number} grade 1~5 (그 밖은 3 으로 본다)
 * @param {number} baseRate 상품 일 이율(%)
 * @param {number} cash 지금 현금
 * @return {{rate:number, limit:number, rateMult:number, limitMult:number}}
 */
function loanTerms(grade, baseRate, cash) {
  const g = RATE_MULT[grade] ? grade : 3;
  const b = typeof baseRate === "number" && Number.isFinite(baseRate) && baseRate > 0 ? baseRate : 0;
  const rate = Math.min(MAX_DAILY_RATE, Math.max(0, Math.round(b * RATE_MULT[g] * 10000) / 10000));
  const c = typeof cash === "number" && Number.isFinite(cash) && cash > 0 ? Math.min(CAP, cash) : 0;
  return { rate, limit: Math.floor(c * LIMIT_MULT[g]), rateMult: RATE_MULT[g], limitMult: LIMIT_MULT[g] };
}

/**
 * 대출을 다 갚았을 때 신용 기록에 무엇을 남기나.
 * @param {{mode:string, cashAfter:number, startMs:number, maturityMs:number, nowMs:number}} r
 * @return {"late"|"onTime"|null}
 *   late   = 강제 상환에 돈이 모자랐다(현금이 마이너스가 됐다)
 *   onTime = 하루 넘게 쓴 대출을 **갚을 날이 지나기 전에** 다 갚았다
 *   null   = 기록 없음(빌리자마자 갚음 · 갚을 날을 넘겨 갚음 · 날짜를 모름)
 */
function repaymentOutcome(r) {
  const s = r && typeof r === "object" ? r : {};
  if (s.mode === "maturity" && typeof s.cashAfter === "number" && s.cashAfter < 0) return "late";
  const start = n(s.startMs), now = n(s.nowMs), maturity = n(s.maturityMs);
  if (!(start > 0) || !(maturity > 0)) return null;
  // 갚을 날 다음 날 0시(넉넉히 +1일)를 넘겼으면 성실 완납으로 세지 않는다.
  if (now > maturity + DAY_MS) return null;
  if (now - start >= MIN_HOLD_MS) return "onTime";
  return null;
}

module.exports = { creditGrade, loanTerms, repaymentOutcome, RATE_MULT, LIMIT_MULT, LATE_WINDOW_MS, MIN_HOLD_MS, MAX_DAILY_RATE };
