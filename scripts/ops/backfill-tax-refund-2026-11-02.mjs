#!/usr/bin/env node
// scripts/ops/backfill-tax-refund-2026-11-02.mjs
// 🔁 BG6QUC 11-02 13시 «세금 환급의 날»이 국고 마이너스라 21명 전원 0원 → 소급 지급(2026-11-03 사용자 결정).
//
// 규칙은 고친 서버와 같다(functions/taxRefundMath.js): 국고 ≤ 0 → 직전 정상 환급 1인당액.
// 학생 +·국고 −·학생 로그·표식 문서를 **한 커밋**에 싣는다 — 표식(currentDocument.exists=false)이
// 이미 있으면 커밋 전체가 거절되므로 두 번 돌려도 한 번만 나간다.
//
//   node scripts/ops/backfill-tax-refund-2026-11-02.mjs          → 미리보기(쓰기 0)
//   node scripts/ops/backfill-tax-refund-2026-11-02.mjs --apply  → 지급
import { createRequire } from "node:module";
import { firestoreBase, firestoreProject, authHeaders, plain, S, I } from "./_firestore-rest.mjs";

const require = createRequire(import.meta.url);
const { refundPerStudentFor } = require("../../functions/taxRefundMath.js");
const { hasAdminPower } = require("../../functions/authUtils.js");

const CC = "BG6QUC";
const EVENT_DAY = "2026-11-02";
const APPLY = process.argv.includes("--apply");
const BASE = firestoreBase();
const DOCS = `projects/${firestoreProject()}/databases/(default)/documents`;
const H = await authHeaders();

// plain() 은 한 겹만 푼다 — 이벤트 기록의 event·result 는 중첩 맵이라 끝까지 푼다.
const deep = (v) =>
  v == null || typeof v !== "object" ? v
  : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, deep(x)]))
  : "integerValue" in v ? Number(v.integerValue)
  : "doubleValue" in v ? v.doubleValue
  : "stringValue" in v ? v.stringValue
  : "booleanValue" in v ? v.booleanValue
  : "timestampValue" in v ? v.timestampValue
  : "nullValue" in v ? null
  : Array.isArray(v) ? v.map(deep)
  : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]));
const query = async (structuredQuery, parent = BASE) =>
  (await (await fetch(`${parent}:runQuery`, { method: "POST", headers: H, body: JSON.stringify({ structuredQuery }) })).json())
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split("/").pop(), name: r.document.name, ...deep(plain(r.document.fields)) }));
const eq = (path, value) => ({ fieldFilter: { field: { fieldPath: path }, op: "EQUAL", value } });
const ms = (t) => Date.parse(t?.timestampValue ?? t);

// 1) 그날 환급이 정말 0원이었는가
const entries = await query(
  { from: [{ collectionId: "entries" }], orderBy: [{ field: { fieldPath: "triggeredAt" }, direction: "DESCENDING" }], limit: 400 },
  `${BASE}/economicEventLogs/${CC}`,
);
const refunds = entries.filter((e) => e.event?.type === "TAX_REFUND");
const missed = refunds.find((e) => new Date(ms(e.triggeredAt) + 9 * 3600e3).toISOString().startsWith(EVENT_DAY));
if (!missed) throw new Error(`${EVENT_DAY} 세금 환급 기록이 없다`);
if (Number(missed.result?.refundedAmount) !== 0) throw new Error(`${EVENT_DAY} 환급은 이미 ${missed.result.refundedAmount}원 나갔다 — 소급 불필요`);
const last = refunds.find((e) => ms(e.triggeredAt) < ms(missed.triggeredAt) && Number(e.result?.perStudent) > 0);

// 2) 국고·학생 — 서버 executeTaxRefund 와 같은 대상
const admins = (await query({ from: [{ collectionId: "users" }], where: { compositeFilter: { op: "AND", filters: [eq("classCode", S(CC)), eq("isAdmin", { booleanValue: true })] } } }))
  .filter((u) => hasAdminPower(u));
if (admins.length !== 1) throw new Error(`승인 관리자가 ${admins.length}명`);
const T = admins[0];
const students = (await query({ from: [{ collectionId: "users" }], where: { compositeFilter: { op: "AND", filters: [eq("classCode", S(CC)), eq("isAdmin", { booleanValue: false })] } } }))
  .filter((u) => !u.isSuperAdmin);

const { perStudent, basis } = refundPerStudentFor({
  treasuryAmount: Number(T.cash) || 0, refundRate: 0.3, studentCount: students.length, lastPerStudent: last?.result?.perStudent ?? null,
});
const total = perStudent * students.length;
console.log(`학급 ${CC} · 놓친 환급 ${missed.triggeredAt?.timestampValue ?? missed.triggeredAt} · 직전 1인당 ${last?.result?.perStudent}`);
console.log(`국고 ${T.name} ${Number(T.cash).toLocaleString()}원 → ${(Number(T.cash) - total).toLocaleString()}원`);
console.log(`학생 ${students.length}명 × ${perStudent.toLocaleString()}원(${basis}) = ${total.toLocaleString()}원`);
if (!APPLY) { console.log("미리보기 — 쓰기 0. 지급하려면 --apply"); process.exit(0); }

// 3) 한 커밋: 표식(없을 때만) + 학생 + + 로그 + 국고 −
const now = new Date().toISOString();
const expire = new Date(Date.now() + 90 * 86400e3).toISOString();
const desc = `[경제이벤트 소급] 11/2 세금 환급이 국고 마이너스로 0원 처리돼 직전 환급과 같은 금액으로 지급 — 1인당 ${perStudent.toLocaleString()}원`;
const inc = (name, n) => ({ transform: { document: name, fieldTransforms: [
  { fieldPath: "cash", increment: I(n) },
  { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
] } });
const writes = [{
  update: { name: `${DOCS}/opsMarkers/backfill-tax-refund-${CC}-${EVENT_DAY}`, fields: {
    classCode: S(CC), perStudent: I(perStudent), count: I(students.length), total: I(total), at: { timestampValue: now },
  } },
  currentDocument: { exists: false },
}];
for (const s of students) {
  writes.push(inc(`${DOCS}/users/${s.id}`, perStudent));
  writes.push({ update: { name: `${DOCS}/activity_logs/${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, fields: {
    userId: S(s.id), userName: S(s.name || s.nickname || "학생"), classCode: S(CC),
    type: S("세금 환급 (경제이벤트)"), amount: I(perStudent), description: S(desc),
    timestamp: { timestampValue: now }, expireAt: { timestampValue: expire },
  } } });
}
writes.push(inc(`${DOCS}/users/${T.id}`, -total));
const res = await fetch(`${BASE}:commit`, { method: "POST", headers: H, body: JSON.stringify({ writes }) });
const body = await res.json();
if (!res.ok) throw new Error(`커밋 거절 ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
console.log(`✅ 지급 완료 — 쓰기 ${writes.length}건 · commitTime ${body.commitTime}`);
