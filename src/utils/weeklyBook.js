// src/utils/weeklyBook.js — 「이번 주 가계부」 계산(순수 함수).
// 입력 = mergeLedgerRows 가 준 거래 줄. 출력 = 번 돈·쓴 돈·남긴 비율·쓴 곳 분류·한 줄 조언.
// 분류 기준은 2026-11-11 운영 원장 14일치(3,000줄)의 type·문구를 보고 정했다.
import { toMillis } from "./ledgerDedupe";

const KST = 9 * 3600 * 1000;
const DAY = 86400 * 1000;

/**
 * 한국 시간 기준 이번 주(월요일 0시 ~ 다음 월요일 0시). offsetWeeks=-1 이면 지난주.
 * @return {{start: number, end: number, label: string}} ms
 */
export function weekRangeKST(now = Date.now(), offsetWeeks = 0) {
  const k = new Date(now + KST);
  const dow = (k.getUTCDay() + 6) % 7; // 월=0 … 일=6
  const midnight = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  const start = midnight - dow * DAY + offsetWeeks * 7 * DAY - KST;
  const end = start + 7 * DAY;
  const md = (ms) => {
    const d = new Date(ms + KST);
    return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  };
  return { start, end, label: `${md(start)} ~ ${md(end - DAY)}` };
}

// [분류 id, 이름, 판정] — 위에서부터 먼저 맞는 것. 통장·대출은 번 돈/쓴 돈이 아니라 «옮긴 돈»이다.
const MOVE_RULES = [
  ["saving", "통장·예금", /파킹통장 (입금|출금)|예금 (가입|출금|만기)|적금 (가입|납입|해지|만기)|중도 해지/],
  ["loan", "대출", /대출 (실행|상환)|대출 \(|대출 (일시|분할) 상환/],
];
const INCOME_RULES = [
  ["salary", "주급", /salaryPayment|\[주급\]|주급|월급/],
  ["interest", "이자·배당", /이자|배당/],
  ["reward", "보상", /보상|출석/],
  ["business", "장사", /shop_sale|매출|수익|되팔기|판매/],
  ["event", "경제 이벤트", /경제이벤트|환급/],
  ["gift", "받은 돈", /송금 받|받았습니다|선물받|지급했습니다|지급/],
];
const EXPENSE_RULES = [
  ["shop", "상점", /shop_purchase|가게에서/], // 개인 상점 구매 문구에는 «VAT» 가 들어 있다 — 세금보다 먼저 본다
  ["tax", "세금", /taxPayment|세금|보유세|순자산세|VAT/],
  ["event", "경제 이벤트", /경제이벤트/],
  ["shop", "상점", /shop_purchase|구매|아이템/],
  ["music", "음악 신청", /musicRequest|음악/],
  ["rent", "월세", /realEstateRent|월세|임대료/],
  ["fine", "벌금·회수", /벌금|회수|제거|합의금/],
  ["gift", "보낸 돈", /송금했|선물|기부/],
];

/** 한 줄을 { group: move|income|expense, id, label } 로. */
export function categorize(tx) {
  const amount = Number(tx?.amount) || 0;
  const text = `${tx?.type || ""} ${tx?.description || ""}`;
  for (const [id, label, re] of MOVE_RULES) if (re.test(text)) return { group: "move", id, label };
  const rules = amount >= 0 ? INCOME_RULES : EXPENSE_RULES;
  for (const [id, label, re] of rules) if (re.test(text)) return { group: amount >= 0 ? "income" : "expense", id, label };
  return { group: amount >= 0 ? "income" : "expense", id: "etc", label: "기타" };
}

/**
 * 한 주 요약.
 * @param {Array} rows mergeLedgerRows 결과(다른 주 줄이 섞여 있어도 된다 — 범위로 거른다)
 * @param {{start:number,end:number}} range
 */
export function summarizeWeek(rows, range) {
  const inRange = (rows || []).filter((tx) => {
    const t = toMillis(tx.timestamp);
    return t >= range.start && t < range.end && Number(tx.amount);
  });
  const bucket = () => new Map();
  const income = bucket(), expense = bucket();
  let incomeTotal = 0, expenseTotal = 0, savedIn = 0, savedOut = 0, borrowed = 0, repaid = 0;
  for (const tx of inRange) {
    const amount = Number(tx.amount) || 0;
    const c = categorize(tx);
    if (c.group === "move") {
      // 현금 기준 부호: 통장에 넣으면 −, 빼면 +. 대출은 받으면 +, 갚으면 −.
      if (c.id === "saving") {
        if (amount < 0) savedIn += -amount;
        else savedOut += amount;
      } else if (amount > 0) borrowed += amount;
      else repaid += -amount;
      continue;
    }
    const map = c.group === "income" ? income : expense;
    const prev = map.get(c.id) || { id: c.id, label: c.label, total: 0, count: 0 };
    prev.total += Math.abs(amount);
    prev.count += 1;
    map.set(c.id, prev);
    if (c.group === "income") incomeTotal += amount;
    else expenseTotal += -amount;
  }
  const sorted = (m) => [...m.values()].sort((a, b) => b.total - a.total);
  const left = incomeTotal - expenseTotal;
  return {
    count: inRange.length,
    incomeTotal,
    expenseTotal,
    left,
    // 번 돈 가운데 남긴 비율(0~1). 번 돈이 없으면 null(비율을 말할 수 없다).
    keepRate: incomeTotal > 0 ? Math.max(0, Math.min(1, left / incomeTotal)) : null,
    income: sorted(income),
    expense: sorted(expense),
    savedNet: savedIn - savedOut,
    savedIn,
    savedOut,
    borrowed,
    repaid,
  };
}

/** 요약 → 아이에게 건네는 한두 줄. 숫자는 호출부가 화폐 단위를 붙여 넣는다(fmt). */
export function coachLines(s, fmt = (n) => String(n)) {
  if (!s || s.count === 0) return ["이번 주에는 아직 돈이 움직이지 않았어요. 할 일을 하거나 주급을 받으면 여기에 적혀요."];
  const out = [];
  if (s.incomeTotal === 0 && s.expenseTotal > 0) out.push(`이번 주에는 번 돈 없이 ${fmt(s.expenseTotal)}을 썼어요.`);
  else if (s.left < 0) out.push(`번 돈보다 ${fmt(-s.left)} 더 썼어요.`);
  else if (s.keepRate !== null && s.keepRate >= 0.5) out.push(`번 돈의 ${Math.round(s.keepRate * 100)}%를 남겼어요. 잘 지켰어요!`);
  else if (s.keepRate !== null) out.push(`번 돈의 ${Math.round(s.keepRate * 100)}%를 남겼어요.`);
  const top = s.expense[0];
  if (top && s.expenseTotal > 0) out.push(`가장 많이 쓴 곳은 «${top.label}»(${fmt(top.total)})이에요.`);
  if (s.savedNet > 0) out.push(`통장에 ${fmt(s.savedNet)}을 더 넣었어요. 넣어 둔 돈에는 이자가 붙어요.`);
  else if (s.left > 0 && s.savedIn === 0) out.push("남긴 돈을 통장에 넣어 두면 이자가 붙어요.");
  if (s.borrowed > 0) out.push(`대출을 ${fmt(s.borrowed)} 받았어요. 갚을 계획도 세워 보세요.`);
  return out.slice(0, 3);
}
