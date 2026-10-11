#!/usr/bin/env node
/**
 * platformApps/_registry 의 siteChromaFall 을 «딱1 로켓»으로 바꾼다 (2026-10-11: 크로마폴/분수 블록 팡 → 새 게임 딱1 로켓,
 *   chromafall.pages.dev → ttak1-rocket.pages.dev). id 는 그대로 둔다(정책·보상 기록이 id 에 붙어 있다). 다른 항목·owner 그대로.
 * 실행: node scripts/ops/rebrand-ttak1-2026-10-11.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const ID = "siteChromaFall", NEW_URL = "https://ttak1-rocket.pages.dev/", NEW_LABEL = "딱1 로켓(분수 덧셈)";

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];
const hit = values.find((v) => v.mapValue.fields.id?.stringValue === ID);
if (!hit) throw new Error(`${ID} 가 레지스트리에 없다`);
const f = hit.mapValue.fields;
console.log(`${ID}: «${f.label?.stringValue}» ${f.url?.stringValue} → «${NEW_LABEL}» ${NEW_URL} (전체 ${values.length}개, 다른 항목은 그대로)`);
if (f.url?.stringValue === NEW_URL && f.label?.stringValue === NEW_LABEL) { console.log("이미 바뀜"); process.exit(0); }
f.url = { stringValue: NEW_URL };
f.label = { stringValue: NEW_LABEL };
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 바꿈");
