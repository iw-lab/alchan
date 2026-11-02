#!/usr/bin/env node
// 고소장 수정 버그(…complaint 통째 덮어쓰기)로 망가진 접수일·기소일을 되살린다 (2026-11-02).
//   접수일: 글자 → 그 날짜 · null → 문서 생성 시각(createTime) · 기소일: 글자 → 그 날짜
//   node scripts/ops/repair-court-dates-2026-11-02.mjs          (미리보기)
//   node scripts/ops/repair-court-dates-2026-11-02.mjs --apply  (쓰기)
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";
const APPLY = process.argv.includes("--apply");
const H = await authHeaders();
const B = firestoreBase();
const j = await fetch(`${B}:runQuery`, { method: "POST", headers: H, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "courtComplaints", allDescendants: true }] } }) }).then((r) => r.json());
const ts = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : { timestampValue: d.toISOString() }; };
let n = 0, ok = 0;
for (const { document: d } of j.filter((x) => x.document)) {
  const f = d.fields, fix = {};
  if (!f.submissionDate?.timestampValue) fix.submissionDate = (f.submissionDate?.stringValue && ts(f.submissionDate.stringValue)) || { timestampValue: d.createTime };
  if (f.indictmentDate?.stringValue) { const t = ts(f.indictmentDate.stringValue); if (t) fix.indictmentDate = t; }
  if (!Object.keys(fix).length) continue;
  n++;
  const rel = d.name.split("/documents/")[1];
  console.log(rel.split("/").slice(1, 2)[0], rel.slice(-6), f.status?.stringValue, JSON.stringify(fix));
  if (APPLY) {
    const mask = Object.keys(fix).map((k) => `updateMask.fieldPaths=${k}`).join("&");
    const r = await fetch(`${B}/${rel}?${mask}&currentDocument.updateTime=${encodeURIComponent(d.updateTime)}`, { method: "PATCH", headers: H, body: JSON.stringify({ fields: fix }) });
    if (r.ok) ok++; else console.log("  ❌", r.status, (await r.text()).slice(0, 200));
  }
}
console.log(APPLY ? `고침 ${ok}/${n}` : `고칠 문서 ${n} (미리보기)`);
