#!/usr/bin/env node
/**
 * platformApps/_registry 의 앱에 **제작자 이름(owner)** 을 붙인다.
 *
 * 왜 필요한가
 *   2026-08-27 부터 사이드바의 '학습 사이트'는 제작자별로 묶여 보인다(AlchanSidebar).
 *   그런데 그 전에 등재된 앱들에는 `owner` 필드가 아예 없어서 전부 기본 묶음
 *   ("알찬 기본")으로 떨어진다. 묶음이 하나뿐이면 사이드바는 **묶지 않는다** —
 *   즉 이 스크립트를 돌리기 전까지 화면은 오늘과 똑같다(회귀 0). 돌리면 이름이 갈린다.
 *
 *   선생님이 알찬광장에 올려 승인된 앱은 CF(publishPlazaApp)가 owner 를 직접 넣으므로
 *   이 스크립트와 무관하다. 여긴 **기존 앱 소급 표기** 전용이다.
 *
 * 실행:
 *   node scripts/ops/set-app-owner.mjs --owner "심수인" --all [--dry]
 *   node scripts/ops/set-app-owner.mjs --owner "심수인" --ids siteArtOn,siteNarae [--dry]
 *
 * 🛑 이 스크립트는 **owner 만** 만진다. 배열을 통째로 다시 쓰지 않고, 읽은 항목을
 *    그대로 옮겨 담으면서 owner 만 얹는다 — 씨앗 스크립트(seed-app-registry)가 라이브에만
 *    있는 앱을 지워 사고를 낼 뻔했던 것과 같은 함정을 피하기 위해서다.
 *    그리고 읽은 시점의 updateTime 을 전제조건으로 걸어, 그 사이 누가 먼저 고쳤으면 멈춘다.
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};
const DRY = argv.includes("--dry");
const OWNER = (arg("--owner") || "").trim();
const ALL = argv.includes("--all");
const IDS = (arg("--ids") || "").split(",").map((s) => s.trim()).filter(Boolean);

if (!OWNER) {
  console.error('사용법: node scripts/ops/set-app-owner.mjs --owner "이름" (--all | --ids a,b) [--dry]');
  process.exit(1);
}
if (OWNER.length > 30) {
  // config/learningApps.js 가 30자에서 자른다. 여기서 막아 두 곳이 다른 말을 하지 않게 한다.
  console.error("제작자 이름은 30자까지입니다(사이드바가 그 이상을 자릅니다).");
  process.exit(1);
}
if (!ALL && IDS.length === 0) {
  console.error("--all 또는 --ids 중 하나가 필요합니다.");
  process.exit(1);
}

const BASE = firestoreBase();
const H = await authHeaders();

const res = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
if (!res.ok) {
  console.error(`✗ 레지스트리를 읽지 못했습니다 (${res.status})`);
  process.exit(1);
}
const cur = await res.json();
const updateTime = cur.updateTime;
const values = cur.fields?.apps?.arrayValue?.values || [];
if (values.length === 0) {
  console.error("✗ 레지스트리가 비어 있습니다. 먼저 seed-app-registry 를 돌리세요.");
  process.exit(1);
}

let touched = 0;
const nextValues = values.map((v) => {
  const fields = { ...(v.mapValue?.fields || {}) };
  const id = fields.id?.stringValue;
  if (!id) return v;
  if (!ALL && !IDS.includes(id)) return v;
  const before = fields.owner?.stringValue || "(없음)";
  if (before === OWNER) return v;
  fields.owner = { stringValue: OWNER };
  touched++;
  console.log(`  · ${id.padEnd(22)} owner: ${before} → ${OWNER}`);
  return { mapValue: { fields } };
});

if (touched === 0) {
  console.log("바꿀 것이 없습니다.");
  process.exit(0);
}
console.log(`\n${touched}개 항목에 제작자를 붙입니다.`);
if (DRY) {
  console.log("--dry 이므로 쓰지 않았습니다.");
  process.exit(0);
}

// 🔒 읽은 그 상태 그대로일 때만 쓴다. 그 사이 누가 앱을 추가했으면 여기서 멈춘다 —
//    조건 없이 쓰면 그 추가분이 이 배열에 없어서 조용히 사라진다.
const url = new URL(`${BASE}/platformApps/_registry`);
url.searchParams.set("updateMask.fieldPaths", "apps");
url.searchParams.set("currentDocument.updateTime", updateTime);
const put = await fetch(url, {
  method: "PATCH",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ fields: { apps: { arrayValue: { values: nextValues } } } }),
});
if (!put.ok) {
  console.error(`✗ 쓰기 실패 (${put.status}) ${await put.text()}`);
  console.error("   409/412 라면 그 사이 레지스트리가 바뀐 것입니다 — 다시 실행하세요.");
  process.exit(1);
}
console.log("✓ 완료. 학생 브라우저는 세션 캐시(최대 12시간) 때문에 바로 안 바뀔 수 있습니다.");
