#!/usr/bin/env node
/**
 * platformApps/_registry 에 «또박이» 하나만 덧붙인다 (2026-09-14).
 *
 * 🔴 add-looppark-2026-09-06.mjs 와 같은 «덧붙이기» 방식이다. 통짜 시드(seed-app-registry)를
 *    쓰면 정본에만 있는 owner 필드가 조용히 날아간다.
 * 🔴 링크 등재만 한다. `platformAppPolicies/{id}.launchUrl` 은 건드리지 않는다 — AAP 토큰 연동이
 *    아니라 그냥 학습사이트 링크다.
 *
 * 실행: node scripts/ops/add-ttobagi-2026-09-14.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const OWNER = "iw-lab";
const NEW = [
  { id: "siteTtobagi", label: "또박이(받아쓰기)", icon: "PencilLine", url: "https://ttobagi.pages.dev/" },
];

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];
const have = new Set(values.map((v) => v.mapValue.fields.id?.stringValue));

const added = [];
for (const a of NEW) {
  if (have.has(a.id)) { console.log(`  = 이미 있음 ${a.id}`); continue; }
  values.push({ mapValue: { fields: {
    id: { stringValue: a.id }, label: { stringValue: a.label },
    icon: { stringValue: a.icon }, url: { stringValue: a.url },
    owner: { stringValue: OWNER },
  } } });
  added.push(a.id);
}
console.log(`기존 ${have.size}개 + 추가 ${added.length}개 = ${values.length}개`);
if (!added.length) { console.log("변경 없음"); process.exit(0); }
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다:", added.join(", ")); process.exit(0); }

const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: {
    apps: { arrayValue: { values } },
    updatedAt: { timestampValue: new Date().toISOString() },
  } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 추가:", added.join(", "));
