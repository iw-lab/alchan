#!/usr/bin/env node
/**
 * platformApps/_registry 에서 **오르답의 url 하나만 바꾼다** (2026-09-06).
 *
 * 왜: 옛 주소 `muhan-pi.vercel.app` 은 디렉터리 이름에서 나온 Vercel 기본 주소였다.
 *     「무한의 계단」을 닮는다는 지적을 받아 `oreudap.vercel.app` 을 프로젝트 도메인으로
 *     추가했고, 등재된 곳들을 새 주소로 옮긴다. 옛 주소도 계속 살아 있으므로
 *     이미 저장해 둔 링크가 깨지지는 않는다.
 *
 * 🔴 `seed-app-registry.mjs`(통짜 덮어쓰기)를 쓰지 않는 이유는 add-oreudap 머리말과 같다 —
 *    정본에는 항목마다 owner 가 붙어 있고 폴백에는 없어서, 통짜 쓰기는 owner 를 조용히 날린다.
 *    그래서 **읽어서 한 항목만 고쳐 되쓴다.**
 *
 * 🔴 없는 항목을 «만들지» 않는다. 이 스크립트는 고치는 일만 한다 —
 *    추가는 add-oreudap-2026-09-05.mjs 의 몫이고, 한 스크립트가 둘 다 하면
 *    「고치려다 못 찾아서 새로 만든 중복 항목」이 조용히 생긴다.
 *
 * 실행: node scripts/ops/update-oreudap-url-2026-09-06.mjs [--dry]
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const DRY = process.argv.includes("--dry");
const TARGET_ID = "siteOreudap";
const OLD = "https://muhan-pi.vercel.app";
const NEW = "https://oreudap.vercel.app";

const BASE = firestoreBase();
const H = await authHeaders();
const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) throw new Error(`레지스트리 읽기 실패 ${res.status}`);
const doc = await res.json();
const values = doc.fields?.apps?.arrayValue?.values ?? [];

const hit = values.find((v) => v.mapValue?.fields?.id?.stringValue === TARGET_ID);
if (!hit) {
  console.error(`✗ ${TARGET_ID} 가 레지스트리에 없다 — 추가는 add-oreudap-2026-09-05.mjs 로.`);
  process.exit(1);
}
const cur = hit.mapValue.fields.url?.stringValue;
console.log(`현재 url: ${cur}`);
if (cur === NEW) { console.log("이미 새 주소다 — 변경 없음"); process.exit(0); }
if (cur !== OLD) {
  // 🔴 «예상한 옛 값»이 아니면 멈춘다. 누가 손으로 바꿔 둔 것을 덮어쓰면 안 된다.
  console.error(`✗ 예상한 옛 주소(${OLD})가 아니다 — 손으로 확인할 것`);
  process.exit(1);
}
hit.mapValue.fields.url = { stringValue: NEW };
console.log(`  → ${NEW}`);
console.log(`전체 ${values.length}개 중 1개만 바뀐다 (나머지는 읽은 그대로 되쓴다)`);
if (DRY) { console.log("--dry 이므로 쓰지 않았습니다"); process.exit(0); }

const body = {
  fields: {
    ...doc.fields,
    apps: { arrayValue: { values } },
    updatedAt: { timestampValue: new Date().toISOString() },
  },
};
const w = await fetch(
  `${BASE}/platformApps/_registry?updateMask.fieldPaths=apps&updateMask.fieldPaths=updatedAt`,
  { method: "PATCH", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(body) },
);
if (!w.ok) throw new Error(`쓰기 실패 ${w.status} ${await w.text()}`);
console.log("✅ 완료 — 앱 목록 캐시(sessionStorage alchan_learning_apps_v1)를 지워야 화면에 반영된다");
