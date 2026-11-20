#!/usr/bin/env node
/**
 * platformApps/_registry 에 «싹(초등 AI 글쓰기 첨삭)»을 단독 항목으로 덧붙인다 (2026-11-20 사용자 «알찬 학습사이트에 단독으로 — 테스트해 보고 올리게»).
 * 10-23 정리(선행쌤·킹수학만) 이후 첫 단독 항목 — 사용자 지시. 링크 등재만, launchUrl 은 안 건드린다.
 * add-whileplay 와 같은 덧붙이기 방식(owner 등 정본 필드 보존). 셋째 자리에 넣는다.
 * 실행: node scripts/ops/add-ssak-2026-11-20.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const A = { id: "siteSsak", label: "싹(초등 AI 글쓰기 첨삭)", icon: "Sprout", url: "https://isw-writing.web.app/", owner: "심인수" };

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const values = (await res.json()).fields?.apps?.arrayValue?.values ?? [];
if (values.some((v) => v.mapValue.fields.id?.stringValue === A.id)) { console.log("= 이미 있음", A.id); process.exit(0); }
const entry = { mapValue: { fields: Object.fromEntries(Object.entries(A).map(([k, v]) => [k, { stringValue: v }])) } };
const at = Math.min(2, values.length);
values.splice(at, 0, entry);
console.log(`기존 ${values.length - 1}개 + 싹 = ${values.length}개 (${at + 1}번째)`);
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }
const w = await fetch(`${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`, {
  method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }),
});
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 추가: siteSsak");
