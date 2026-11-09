#!/usr/bin/env node
/**
 * platformApps/_registry 의 Vercel 게임 주소를 Cloudflare korea Pages 로 (2026-11-09 사용자 «클라우드플레어로 옮겨»).
 * 표에 있는 항목의 url 만 바꾸고, 지금 값이 예상한 옛 주소가 아니면 그 항목은 건드리지 않고 알린다.
 * 실행: node scripts/ops/move-vercel-to-pages-2026-11-09.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const MAP = {
  siteNarae: ["https://narae-teal.vercel.app/", "https://narae-4fe.pages.dev/"],
  siteVocawormDefense: ["https://vocaworm-defense.vercel.app/", "https://vocaworm-defense.pages.dev/"],
  siteKeywordSchool: ["https://yeolsoemal-school.vercel.app/", "https://yeolsoemal-school.pages.dev/"],
  siteNumRush: ["https://numrush.vercel.app", "https://numrush-2qi.pages.dev"],
  siteSpanLand: ["https://spanland.vercel.app", "https://spanland.pages.dev"],
  siteYutDash: ["https://yutdash.vercel.app", "https://yutdash.pages.dev"],
  siteOreudap: ["https://oreudap.vercel.app", "https://muhan-61w.pages.dev"],
  siteKoreaHis: ["https://koreahis.vercel.app/", "https://koreahis.pages.dev/"],
  siteHopSquad: ["https://hop-squad-mu.vercel.app", "https://hop-squad.pages.dev"],
  siteRacketRush: ["https://racket-rush.vercel.app", "https://racket-rush.pages.dev"],
};

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];
let n = 0;
for (const v of values) {
  const f = v.mapValue.fields, id = f.id?.stringValue, m = MAP[id];
  if (!m) continue;
  const cur = f.url?.stringValue;
  if (cur === m[1]) { console.log(`${id}: 이미 새 주소`); continue; }
  if (cur !== m[0]) { console.log(`⚠️ ${id}: 예상 밖 주소 ${cur} — 건드리지 않음`); continue; }
  f.url = { stringValue: m[1] }; n++;
  console.log(`${id}: ${cur} → ${m[1]}`);
}
console.log(`바꿀 항목 ${n}개 (전체 ${values.length}개, 나머지는 그대로)`);
if (!n || DRY) { console.log(DRY ? "--dry 이므로 쓰지 않았습니다" : "바꿀 것 없음"); process.exit(0); }
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt&currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 주소 변경 완료");
