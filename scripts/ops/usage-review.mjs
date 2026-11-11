// scripts/ops/usage-review.mjs — 실사용 집계(읽기 전용). 최근 N일 activity_logs 를 종류·학급·날짜로 센다.
//   node scripts/ops/usage-review.mjs [--days 30] [--json]
// 쓰기 없음. 필드 마스크로 type·userId·classCode·timestamp 만 받는다(이름·금액은 안 읽는다).
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = Number(arg("--days", 30));
const H = await authHeaders();
const since = new Date(Date.now() - DAYS * 86400e3).toISOString();
const rows = [];
let cursor = null;
for (;;) {
  const q = {
    from: [{ collectionId: "activity_logs" }],
    where: { fieldFilter: { field: { fieldPath: "timestamp" }, op: "GREATER_THAN_OR_EQUAL", value: { timestampValue: since } } },
    orderBy: [{ field: { fieldPath: "timestamp" }, direction: "ASCENDING" }],
    select: { fields: ["type", "userId", "classCode", "timestamp"].map((fieldPath) => ({ fieldPath })) },
    limit: 5000,
    ...(cursor ? { startAt: { values: [{ timestampValue: cursor }], before: false } } : {}),
  };
  const j = await fetch(`${firestoreBase()}:runQuery`, { method: "POST", headers: H, body: JSON.stringify({ structuredQuery: q }) }).then((r) => r.json());
  if (!Array.isArray(j)) throw new Error("질의 실패: " + JSON.stringify(j).slice(0, 200));
  const docs = j.filter((x) => x.document);
  for (const d of docs) {
    const f = d.document.fields || {};
    rows.push({ type: f.type?.stringValue || "?", uid: f.userId?.stringValue || "?", cls: f.classCode?.stringValue || "?", ts: f.timestamp?.timestampValue });
  }
  if (docs.length < 5000) break;
  cursor = rows[rows.length - 1].ts;
}
const kst = (ts) => new Date(new Date(ts).getTime() + 9 * 3600e3);
const by = (fn) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
const uniq = (fn, sel) => { const m = {}; for (const r of rows) (m[fn(r)] ||= new Set()).add(sel(r)); return Object.fromEntries(Object.entries(m).map(([k, s]) => [k, s.size])); };
const types = by((r) => r.type), typeUsers = uniq((r) => r.type, (r) => r.uid);
const days = uniq((r) => kst(r.ts).toISOString().slice(0, 10), (r) => r.uid);
const hours = by((r) => String(kst(r.ts).getUTCHours()).padStart(2, "0"));
const classes = by((r) => r.cls), classUsers = uniq((r) => r.cls, (r) => r.uid);
const out = {
  days: DAYS, events: rows.length, users: new Set(rows.map((r) => r.uid)).size,
  types: Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ type: t, n, users: typeUsers[t] })),
  classes: Object.entries(classes).sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ cls: c, n, users: classUsers[c] })),
  dau: days, hours,
};
// --metrics: 전역 usage-review.py 가 받는 납작한 지표(JSON 한 줄). 새 기능(저축 목표·퀴즈)은 원장에 안 남으므로
//   학생 문서에서 그 두 필드만(이름·잔액 없이) 읽어 센다.
if (process.argv.includes("--metrics")) {
  const n = (t) => types[t] || 0, u = (t) => typeUsers[t] || 0;
  const weekdays = Object.entries(days).filter(([d]) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; }).map(([, v]) => v);
  const uq = { from: [{ collectionId: "users" }], select: { fields: [{ fieldPath: "savingsGoal.amount" }, { fieldPath: "econQuiz.day" }] }, limit: 2000 };
  const uj = await fetch(`${firestoreBase()}:runQuery`, { method: "POST", headers: H, body: JSON.stringify({ structuredQuery: uq }) }).then((r) => r.json());
  const weekAgo = new Date(Date.now() + 9 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10);
  let goalUsers = 0, quizWeekUsers = 0;
  for (const x of Array.isArray(uj) ? uj : []) {
    const f = x.document?.fields || {};
    if (f.savingsGoal?.mapValue?.fields?.amount) goalUsers++;
    const qd = f.econQuiz?.mapValue?.fields?.day?.stringValue;
    if (qd && qd >= weekAgo) quizWeekUsers++;
  }
  console.log(JSON.stringify({
    users: out.users,
    weekday_active_avg: weekdays.length ? Math.round(weekdays.reduce((a, b) => a + b, 0) / weekdays.length) : 0,
    estate_events: n("부동산 구매") + n("realEstateRent"),
    deposit_users: u("예금 가입"),
    loan_users: u("대출 실행"),
    insurance_users: u("보험료 납부"),
    parking_users: u("파킹통장 입금"),
    shop_seller_users: u("shop_sale"),
    approvals: n("할일 승인 완료"),
    goal_users: goalUsers,
    quiz_week_users: quizWeekUsers,
  }));
} else if (process.argv.includes("--json")) console.log(JSON.stringify(out));
else {
  console.log(`최근 ${DAYS}일 · 사건 ${out.events} · 사용자 ${out.users}`);
  console.log("\n[종류별] 건수 / 쓴 사람 수"); for (const t of out.types) console.log(`  ${String(t.n).padStart(6)} ${String(t.users).padStart(4)}명  ${t.type}`);
  console.log("\n[학급별]"); for (const c of out.classes) console.log(`  ${String(c.n).padStart(6)} ${String(c.users).padStart(4)}명  ${c.cls}`);
  console.log("\n[날짜별 활동 인원]"); console.log("  " + Object.entries(days).sort().map(([d, n]) => `${d.slice(5)}:${n}`).join(" "));
  console.log("\n[시간대(KST)]"); console.log("  " + Object.entries(hours).sort().map(([h, n]) => `${h}시:${n}`).join(" "));
}
