#!/usr/bin/env node
/**
 * platformApps/_registry 의 siteGongbunyang url 만 새 주소로 (2026-10-01 — Cloudflare 계정 이관: naver → daum).
 * 다른 항목·필드는 그대로 둔다. 읽은 뒤 바뀌었으면 쓰지 않는다(updateTime 전제 조건).
 * 실행: node scripts/ops/move-gongbunyang-url-2026-10-01.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const ID = "siteGongbunyang", URL_NEW = "https://gongbunyang-bdd.pages.dev/";
const BASE = firestoreBase(); const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json(); const values = doc.fields?.apps?.arrayValue?.values ?? [];
const hit = values.find((v) => v.mapValue.fields.id?.stringValue === ID);
if (!hit) throw new Error(`${ID} 없음`);
const old = hit.mapValue.fields.url?.stringValue;
console.log(`${ID}: ${old} → ${URL_NEW} (전체 ${values.length}개 유지)`);
if (old === URL_NEW) { console.log("변경 없음"); process.exit(0); }
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }
hit.mapValue.fields.url = { stringValue: URL_NEW };
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 바꿈");
