#!/usr/bin/env node
/**
 * platformApps/_registry 의 siteChromaFall 라벨만 바꾼다 (2026-10-08 «크로마폴 → 분수 블록 팡»).
 * 🔴 다른 항목·owner 필드는 그대로 둔다(통짜 시드 금지 — add-kongkong-2026-10-08.mjs 와 같은 이유).
 * 실행: node scripts/ops/relabel-chromafall-2026-10-08.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const ID = "siteChromaFall", LABEL = "분수 블록 팡(낙하 퍼즐)";
const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];
const hit = values.find((v) => v.mapValue.fields.id?.stringValue === ID);
if (!hit) throw new Error(`${ID} 없음`);
const before = hit.mapValue.fields.label?.stringValue;
console.log(`${values.length}개 중 ${ID}: «${before}» → «${LABEL}»`);
if (before === LABEL) { console.log("변경 없음"); process.exit(0); }
hit.mapValue.fields.label = { stringValue: LABEL };
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 바꿈");
