// src/utils/creditGrade.js — 신용등급(연습용, 순수 함수).
// ⚠️ 지금은 **보여 주기만** 한다. 대출 금리·한도 등 돈이 움직이는 어떤 판정에도 쓰지 않는다
//    (쓰게 되면 계산을 서버로 옮기고 FULL 교차검증을 거칠 것 — 화면 계산은 아이가 고칠 수 있다).
// 1등급이 가장 좋다. 점수는 «빚을 제때 갚는가 · 빚보다 가진 게 많은가 · 따로 모아 둔 돈이 있는가»만 본다.

const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ms = (v) => {
  if (!v) return 0;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return typeof v === "number" ? v : 0;
};

/**
 * @param {object} p { loans:[{maturityDate, balance, remainingPrincipal}], netAssets, totalAssets, savedTotal, savingProducts }
 * @param {number} now ms
 * @return {{grade:1|2|3|4|5, score:number, good:string[], bad:string[], next:string}}
 */
export function creditGrade(p, now = Date.now()) {
  const s = p && typeof p === "object" ? p : {};
  const loans = (Array.isArray(s.loans) ? s.loans : []).filter((l) => n(l?.remainingPrincipal) > 0 || n(l?.balance) > 0);
  const overdue = loans.filter((l) => { const t = ms(l.maturityDate); return t > 0 && t < now; }).length;
  let score = 60;
  const good = [], bad = [];
  if (loans.length === 0) { score += 10; good.push("빚이 없어요"); }
  if (overdue > 0) { score -= Math.min(45, overdue * 30); bad.push(`갚을 날이 지난 대출이 ${overdue}건 있어요`); }
  else if (loans.length > 0) good.push("대출을 기한 안에 관리하고 있어요");
  if (n(s.netAssets) < 0) { score -= 25; bad.push("가진 것보다 빚이 많아요"); }
  if (n(s.savedTotal) > 0) { score += 10; good.push("통장에 모아 둔 돈이 있어요"); }
  if (n(s.savingProducts) > 0) { score += 10; good.push("예금·적금에 가입했어요"); }
  if (n(s.totalAssets) > 0 && n(s.savedTotal) / n(s.totalAssets) >= 0.25) { score += 10; good.push("가진 돈의 4분의 1 넘게 모아 뒀어요"); }
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? 1 : score >= 70 ? 2 : score >= 55 ? 3 : score >= 40 ? 4 : 5;
  let next = "지금처럼만 하면 돼요!";
  if (overdue > 0) next = "기한이 지난 대출부터 갚으면 등급이 올라요.";
  else if (n(s.netAssets) < 0) next = "빚을 줄여 가진 것이 더 많아지게 해 보세요.";
  else if (n(s.savedTotal) <= 0) next = "파킹통장에 돈을 넣어 두면 등급이 올라요.";
  else if (n(s.savingProducts) <= 0) next = "예금이나 적금에 가입하면 등급이 올라요.";
  else if (grade > 1) next = "가진 돈의 4분의 1 넘게 통장에 모으면 등급이 올라요.";
  return { grade, score, good, bad, next };
}
