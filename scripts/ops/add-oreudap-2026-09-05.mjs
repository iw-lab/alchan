#!/usr/bin/env node
/**
 * platformApps/_registry 에 **오르답만 덧붙인다** (2026-09-05).
 *
 * 🔴 `seed-app-registry.mjs`(통짜 덮어쓰기)를 쓰지 않는 이유는 add-skyguard 머리말과 같다 —
 *    정본에는 항목마다 owner 가 붙어 있고 폴백에는 없어서, 폴백에서 정본으로 흐르는
 *    통짜 쓰기는 owner 를 조용히 날린다.
 *
 * 실행: node scripts/ops/add-oreudap-2026-09-05.mjs [--dry]
 * 뒤이어: node scripts/ops/seed-app-policies.mjs   (정책 문서가 없으면 토큰 발급이 막힌다)
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const OWNER = "iw-lab";
const NEW = [
  { id: "siteOreudap", label: "오르답(구구단·영단어)", icon: "Calculator", url: "https://muhan-pi.vercel.app" },
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
