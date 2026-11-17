// 세금정산 화면용 계산 — 합계 규칙의 정본은 functions/taxSettlementMath.js(rowTotals). 둘이 갈리면
// src/test/functions/taxSettlement.test.js 가 빨개진다. 여기에만 있는 것: 판독된 줄 ↔ 우리 반 학생 짝짓기.
import { studentNumberOf, plainStudentName } from "./studentOrder";

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

const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/^\d+번/, "");

/**
 * 판독된 줄마다 우리 반 학생 한 명을 짝짓는다. 이름이 정본이고 번호는 거든다:
 *   ① 번호도 이름도 같은 학생 → 확실(how:"both")
 *   ② 이름이 같은 학생이 딱 한 명 → 그 학생(번호가 달라도 — 표의 번호가 틀렸을 수 있다)(how:"name")
 *   ③ 이름은 못 찾았는데 번호가 같은 학생 → 그 학생, 하지만 «확인 필요»(how:"no")
 *   ④ 없음 → 선생님이 고른다(studentId:null)
 * 한 학생이 두 줄에 짝지어지면 뒤 줄은 비운다(같은 학생에게 두 번 넣지 않게).
 */
export function matchRows(rows, members) {
  const students = (members || []).filter((m) => m && m.id && !m.isAdmin && !m.isSuperAdmin && !m.isTeacher);
  const byName = new Map();
  for (const s of students) { const k = norm(plainStudentName(s)); byName.set(k, [...(byName.get(k) || []), s]); }
  const used = new Set();
  return (rows || []).map((row, i) => {
    const nm = norm(row.name);
    const sameName = byName.get(nm) || [];
    let pick = null; let how = "";
    const both = sameName.find((s) => row.no != null && studentNumberOf(s) === row.no);
    if (both) { pick = both; how = "both"; }
    else if (sameName.length === 1) { pick = sameName[0]; how = "name"; }
    else if (row.no != null) {
      const byNo = students.filter((s) => studentNumberOf(s) === row.no);
      if (byNo.length === 1) { pick = byNo[0]; how = "no"; }
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
