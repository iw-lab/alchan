#!/usr/bin/env node
/**
 * platformApps/_registry 에 **새 앱만 덧붙인다** (2026-08-31).
 *
 * 🔴 `seed-app-registry.mjs` 를 쓰지 않은 이유: 그 시드는 문서를 **통째로 덮어쓴다.**
 *    살아 있는 레지스트리에는 항목마다 `owner: "iw-lab"` 가 붙어 있는데 폴백 파일
 *    (src/config/learningApps.js)에는 owner 필드가 없다. 그대로 시드를 돌리면
 *    **owner 13개가 조용히 사라진다.** 정본이 폴백보다 «더 많은 정보»를 갖고 있으므로
 *    폴백에서 정본으로 흐르는 통짜 쓰기는 이 저장소에서 안전하지 않다.
 *
 * 실행: node scripts/ops/add-apps-2026-08-31.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const OWNER = "iw-lab";
const NEW = [
  { id: "sitePickOn",  label: "뽑기ON(교실 추첨)",        icon: "Ticket",   url: "https://iwpick.pages.dev/" },
  { id: "siteNumRush", label: "넘버러시(수 감각)",        icon: "Hash",     url: "https://numrush.vercel.app" },
  { id: "siteSpanLand",label: "한뼘 땅따먹기(측정)",      icon: "LandPlot", url: "https://spanland.vercel.app" },
  { id: "siteYutDash", label: "한달음 윷놀이(자료·확률)", icon: "Dices",    url: "https://yutdash.vercel.app" },
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

// apps 배열과 updatedAt 만 PATCH — note 등 다른 필드는 건드리지 않는다.
const url = `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`;
const w = await fetch(url, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: {
    apps: { arrayValue: { values } },
    updatedAt: { timestampValue: new Date().toISOString() },
  } }) });
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${(await w.text()).slice(0, 300)}`);
console.log("✅ 추가:", added.join(", "));
