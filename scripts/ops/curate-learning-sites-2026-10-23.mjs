#!/usr/bin/env node
/**
 * 학습 사이트 정리 (2026-10-23 사용자 «첫째 선행쌤, 둘째 킹수학 — 정리»).
 *
 * platformApps/_registry 의 맨 앞에 선행쌤·킹수학 두 개를 두고, 나머지는 **지우지 않고** enabled:false 로 끈다.
 * 🔴 지우지 않는 이유: id 가 정책(platformAppPolicies)·보상 기록·교사 메뉴 잠금에 그대로 쓰인다.
 *    되살릴 땐 그 항목의 enabled 만 빼면 된다(--restore).
 * 🔴 owner 등 정본에만 있는 필드는 그대로 둔다(add-* 스크립트와 같은 «고쳐 쓰기» 방식).
 *
 * 실행: node scripts/ops/curate-learning-sites-2026-10-23.mjs [--dry] [--restore]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const RESTORE = process.argv.includes("--restore");
const OWNER = "심인수";
const KEEP = [
  { id: "siteSsamzip", label: "선행쌤(학습 게임·사이트 모음)", icon: "Star", url: "https://sunhaengssam.web.app/" },
  { id: "siteKingsmath", label: "킹수학(교실 1분 게임)", icon: "Crown", url: "https://kingsmath.com/" },
];
const keepIds = new Set(KEEP.map((a) => a.id));

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];

const rest = values.filter((v) => !keepIds.has(v.mapValue.fields.id?.stringValue));
let changed = 0;
for (const v of rest) {
  const f = v.mapValue.fields;
  if (RESTORE) {
    if (f.enabled?.booleanValue === false) { f.enabled = { booleanValue: true }; changed++; }
  } else if (f.enabled?.booleanValue !== false) {
    f.enabled = { booleanValue: false };
    changed++;
  }
}
const front = RESTORE ? [] : KEEP.map((a) => ({ mapValue: { fields: {
  id: { stringValue: a.id }, label: { stringValue: a.label },
  icon: { stringValue: a.icon }, url: { stringValue: a.url },
  owner: { stringValue: OWNER },
} } }));
const next = [...front, ...rest];

const on = next.filter((v) => v.mapValue.fields.enabled?.booleanValue !== false).map((v) => v.mapValue.fields.label.stringValue);
console.log(`전체 ${next.length}개 · 바뀐 켜기/끄기 ${changed}개 · 화면에 보일 것 ${on.length}개`);
console.log(on.slice(0, 5).map((l, i) => `  ${i + 1}. ${l}`).join("\n") + (on.length > 5 ? `\n  … 외 ${on.length - 5}개` : ""));
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }

const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: {
    apps: { arrayValue: { values: next } },
    updatedAt: { timestampValue: new Date().toISOString() },
  } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log(RESTORE ? "✅ 옛 앱을 다시 켰습니다" : "✅ 학습 사이트 = 선행쌤·킹수학");
