#!/usr/bin/env node
/**
 * platformApps/_registry 의 «루프 파크» 주소만 바꾼다 (2026-10-01: Cloudflare naver → daum 계정 이전,
 *   loop-park.pages.dev → loop-park-dyy.pages.dev). 다른 항목·필드(owner 등)는 그대로 둔다.
 * 실행: node scripts/ops/update-looppark-url-2026-10-01.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const ID = "siteLoopPark", OLD = "https://loop-park.pages.dev/", NEW = "https://loop-park-dyy.pages.dev/";

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];
const hit = values.find((v) => v.mapValue.fields.id?.stringValue === ID);
if (!hit) throw new Error(`${ID} 가 레지스트리에 없다`);
const cur = hit.mapValue.fields.url?.stringValue;
console.log(`${ID}: ${cur} → ${NEW} (전체 ${values.length}개, 다른 항목은 그대로)`);
if (cur === NEW) { console.log("이미 새 주소"); process.exit(0); }
if (cur !== OLD) throw new Error(`예상한 옛 주소가 아니다: ${cur} — 손으로 확인할 것`);
hit.mapValue.fields.url = { stringValue: NEW };
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }

// 읽은 뒤 바뀌었으면 쓰지 않는다(updateTime 전제조건)
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: {
    apps: { arrayValue: { values } },
    updatedAt: { timestampValue: new Date().toISOString() },
  } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 주소 변경 완료");
