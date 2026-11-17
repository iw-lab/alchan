// 세금정산 화면용 계산 — 합계 규칙의 정본은 functions/taxSettlementMath.js(rowTotals). 둘이 갈리면
// src/test/functions/taxSettlement.test.js 가 빨개진다. 여기에만 있는 것: 판독된 줄 ↔ 우리 반 학생 짝짓기(번호로만).
import { studentNumberOf } from "./studentOrder";

export function rowTotals(row) {
  let fine = 0; let prize = 0; let coupon = 0; let unsure = false;
  for (const c of row?.cells || []) {
    if (!c.sure) unsure = true;
    for (const it of c.items || []) {
      const t = Number.isInteger(it.times) && it.times >= 1 ? it.times : 1;
      const won = Number.isInteger(it.won) && it.won > 0 ? it.won : 0;
      const count = Number.isInteger(it.count) && it.count > 0 ? it.count : 0;
      if (c.col === "벌금" || c.col === "상금") {
        if (!won) unsure = true;
        if (c.col === "벌금") fine += won * t; else prize += won * t;
      } else if (count) coupon += count * t;
      else unsure = true;
    }
  }
  return { fine, prize, coupon, unsure };
}

/**
 * 판독된 줄마다 우리 반 학생 한 명을 «번호로만» 짝짓는다(이름은 개인정보라 사진에서 가리고, AI 도 읽지 않는다).
 *   ① 번호가 같은 학생이 딱 한 명 → 그 학생(how:"no")
 *   ② 번호를 못 읽었다 → 선생님이 고른다(how:"nono")
 *   ③ 그 번호 학생이 없거나 둘 이상 → 선생님이 고른다(how:"none"·"many")
 * 한 학생이 두 줄에 짝지어지면 뒤 줄은 비운다(같은 학생에게 두 번 넣지 않게, how:"dup").
 */
export function matchRows(rows, members) {
  const students = (members || []).filter((m) => m && m.id && !m.isAdmin && !m.isSuperAdmin && !m.isTeacher);
  const used = new Set();
  return (rows || []).map((row, i) => {
    let pick = null; let how = "nono";
    if (row.no != null) {
      const byNo = students.filter((s) => studentNumberOf(s) === row.no);
      if (byNo.length === 1) { pick = byNo[0]; how = "no"; } else how = byNo.length ? "many" : "none";
    }
    if (pick && used.has(pick.id)) { pick = null; how = "dup"; }
    if (pick) used.add(pick.id);
    return { key: `r${i}`, row, studentId: pick ? pick.id : null, how, ...rowTotals(row) };
  });
}

/** 만 단위로 짧게(표에 적힌 모양과 같게) — 1230000 → "123만" */
export function shortWon(n) {
  if (!n) return "0";
  if (n % 10000 === 0) return `${(n / 10000).toLocaleString()}만`;
  return n.toLocaleString();
}
