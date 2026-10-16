#!/usr/bin/env node
/**
 * platformApps/_registry 의 종이하늘(siteNarae) 주소만 바꾼다 (2026-10-16).
 * 옛 papersky.pages.dev 는 2개월 전 빌드라 학교 순위가 없다 — 실제 배포는 Vercel narae-teal.vercel.app.
 * 실행: node scripts/ops/fix-narae-url-2026-10-16.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";
const DRY = process.argv.includes("--dry");
const ID = "siteNarae", URL_NEW = "https://narae-teal.vercel.app/";
const BASE = firestoreBase(); const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json(); const values = doc.fields?.apps?.arrayValue?.values ?? [];
const row = values.find((v) => v.mapValue.fields.id?.stringValue === ID);
if (!row) throw new Error(`${ID} 없음`);
const old = row.mapValue.fields.url?.stringValue;
console.log(`${ID}: ${old} → ${URL_NEW} (전체 ${values.length}개)`);
if (old === URL_NEW) { console.log("변경 없음"); process.exit(0); }
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }
row.mapValue.fields.url = { stringValue: URL_NEW };
const w = await fetch(`${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 바꿈");
