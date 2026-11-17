/**
 * 세금정산 순수 계산(firebase 의존 0 — 서버·시험·화면이 같이 쓴다).
 *   cleanSheet(raw)            : AI 판독 JSON → 믿을 수 있는 모양으로(모르는 값은 버리고, 숫자는 범위 안으로)
 *   rowTotals(row)             : 한 학생 줄 → { fine, prize, coupon, unsure }
 *   validateSettlementItems(x) : 적용 요청 검사 — 문제 있으면 문구, 없으면 ""
 */
const LIMITS = {
  maxRows: 60,          // 한 장에 학생 줄 상한
  maxCellsPerRow: 20,   // 5요일 × 3칸 + 여유
  maxItemsPerCell: 8,
  maxWon: 100000000,    // 칸 금액 하나 상한 1억
  maxTimes: 20,
  maxCount: 1000,       // 쿠폰 칸 개수 하나 상한
  maxStudentMoney: 10000000000, // 학생 한 명 합계 상한(벌금·상금 각각) — adminCashAction 과 같은 100억
  maxStudentCoupons: 10000,
  maxStudents: 200,
};
const DAYS = ["월", "화", "수", "목", "금"];
const COLS = ["벌금", "상금", "쿠폰"];
const int = (v) => (Number.isInteger(v) ? v : Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : NaN);
const str = (v, n) => String(v == null ? "" : v).replace(/[<>]/g, "").slice(0, n);

function cleanSheet(raw) {
  const rows = Array.isArray(raw?.rows) ? raw.rows.slice(0, LIMITS.maxRows) : [];
  return rows.map((r) => {
    const no = int(r?.no);
    const cells = (Array.isArray(r?.cells) ? r.cells : []).slice(0, LIMITS.maxCellsPerRow)
      .filter((c) => DAYS.includes(c?.day) && COLS.includes(c?.col))
      .map((c) => ({
        day: c.day,
        col: c.col,
        text: str(c.text, 60),
        sure: c.sure === true,
        items: [],
        raw: Array.isArray(c.items) ? c.items : [],
      })).map((c) => {
        // 범위 밖·잘린 숫자가 하나라도 있으면 그 칸은 «확인 필요»로 올린다 — 조용히 고친 값으로 합계를 내지 않는다(8way codex)
        let altered = c.raw.length > LIMITS.maxItemsPerCell;
        for (const it of c.raw.slice(0, LIMITS.maxItemsPerCell)) {
          const won = int(it?.won); const count = int(it?.count); const times = int(it?.times);
          const w = won > 0 && won <= LIMITS.maxWon ? won : 0;
          const n = count > 0 && count <= LIMITS.maxCount ? count : 0;
          const t = times >= 1 && times <= LIMITS.maxTimes ? times : 1;
          if ((it?.won != null && it.won !== 0 && w !== it.won) || (it?.count != null && it.count !== 0 && n !== it.count) || (it?.times != null && t !== it.times)) altered = true;
          if (w > 0 || n > 0) c.items.push({ won: w, count: n, times: t });
        }
        return { day: c.day, col: c.col, text: c.text, items: c.items, sure: c.sure && !altered };
      });
    // 이름은 받지 않는다 — AI 가 실수로 돌려줘도 버린다(개인정보: 번호로만 짝짓는다)
    return { no: no > 0 && no < 1000 ? no : null, cells };
  }).filter((r) => r.no || r.cells.length);
}

/** 한 줄 합계. 쿠폰 칸은 «개수»만 센다 — 금액(won)으로 읽혔으면 개수를 모르는 것이라 unsure 로 올려 선생님이 고치게 한다. */
function rowTotals(row) {
  let fine = 0; let prize = 0; let coupon = 0; let unsure = false;
  for (const c of row?.cells || []) {
    if (!c.sure) unsure = true;
    for (const it of c.items || []) {
      const t = Number.isInteger(it.times) && it.times >= 1 ? it.times : 1;
      const won = Number.isInteger(it.won) && it.won > 0 ? it.won : 0;
      const count = Number.isInteger(it.count) && it.count > 0 ? it.count : 0;
      if (c.col === "벌금" || c.col === "상금") {
        if (!won) unsure = true; // 금액 칸인데 금액이 없다(개수로 읽혔다) — 확인 필요(8way gemini)
        if (c.col === "벌금") fine += won * t; else prize += won * t;
      } else if (count) coupon += count * t;
      else unsure = true;
    }
  }
  return { fine, prize, coupon, unsure };
}

function validateSettlementItems(items) {
  if (!Array.isArray(items) || items.length === 0) return "넣을 학생이 없습니다.";
  if (items.length > LIMITS.maxStudents) return `한 번에 ${LIMITS.maxStudents}명까지 넣을 수 있습니다.`;
  const seen = new Set();
  for (const it of items) {
    if (!it || typeof it.userId !== "string" || !it.userId || it.userId.length > 128 || it.userId.includes("/")) return "학생 정보가 올바르지 않습니다.";
    if (seen.has(it.userId)) return "같은 학생이 두 번 들어 있습니다.";
    seen.add(it.userId);
    for (const k of ["fine", "prize"]) {
      if (!Number.isInteger(it[k]) || it[k] < 0 || it[k] > LIMITS.maxStudentMoney) return "금액은 0 이상의 정수여야 합니다.";
    }
    if (!Number.isInteger(it.coupon) || it.coupon < 0 || it.coupon > LIMITS.maxStudentCoupons) return "쿠폰은 0 이상의 정수여야 합니다.";
    if (it.fine === 0 && it.prize === 0 && it.coupon === 0) return "넣을 것이 없는 학생이 들어 있습니다.";
  }
  return "";
}

module.exports = { LIMITS, DAYS, COLS, cleanSheet, rowTotals, validateSettlementItems };
