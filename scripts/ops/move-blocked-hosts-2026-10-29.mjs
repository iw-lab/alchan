#!/usr/bin/env node
/**
 * platformApps/_registry 의 게임 4개 주소를 새 이름으로 바꾼다 (2026-10-29).
 * 학교 와이파이가 옛 주소를 DNS 127.0.0.1 로 막았다(학교 망에서 직접 실측) → 같은 게임을 새 Pages 이름에 올렸다.
 * url 만 바꾼다(owner·label·icon 은 그대로).
 *
 * 실행: node scripts/ops/move-blocked-hosts-2026-10-29.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const MOVE = {
  "https://ttak1-rocket.pages.dev/": "https://ttak1.pages.dev/",
  "https://tinhelmet.pages.dev/": "https://cheolmo.pages.dev/",
  "https://kkeutjinhwa.pages.dev/": "https://jinhwa.pages.dev/",
  "https://hobakbul.pages.dev/": "https://hobak-maeul.pages.dev/",
};

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];
const moved = [];
for (const v of values) {
  const f = v.mapValue.fields;
  const to = MOVE[f.url?.stringValue];
  if (to) { moved.push(`${f.id.stringValue}: ${f.url.stringValue} → ${to}`); f.url = { stringValue: to }; }
}
console.log(`전체 ${values.length}개 · 바꿀 것 ${moved.length}개`); moved.forEach((m) => console.log("  " + m));
if (!moved.length || DRY) process.exit(0);
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values } }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 바꿈", moved.length);
