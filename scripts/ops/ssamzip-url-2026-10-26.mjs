#!/usr/bin/env node
/**
 * 알찬 학습 사이트의 선행쌤 주소를 바꾼다(2026-10-26 사용자 «알찬에도 일단 변경해놔»).
 * 학교 망이 새 도메인 ssamzip.com 을 막아(DNS 127.0.0.1) 교실에서 안 열린다 → 옛 주소 sunhaengssam.web.app.
 * 옛 주소는 ssamzip.com 이 열리는 망에서만 그리로 넘기고, 막힌 망에선 그대로 보여 준다(simteacher 7b1a811).
 * 실행: node scripts/ops/ssamzip-url-2026-10-26.mjs [--dry] [--back]   (--back = ssamzip.com 으로 되돌리기)
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";
const DRY = process.argv.includes("--dry");
const TO = process.argv.includes("--back") ? "https://ssamzip.com/" : "https://sunhaengssam.web.app/";
const BASE = firestoreBase(); const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json(); const values = doc.fields?.apps?.arrayValue?.values ?? [];
const hit = values.find((v) => v.mapValue.fields.id?.stringValue === "siteSsamzip");
if (!hit) throw new Error("siteSsamzip 항목이 없다");
console.log(`선행쌤 주소 ${hit.mapValue.fields.url?.stringValue} → ${TO}`);
hit.mapValue.fields.url = { stringValue: TO };
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }
const w = await fetch(`${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`, {
  method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 바꿨습니다");
