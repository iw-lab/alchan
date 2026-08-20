#!/usr/bin/env node
/**
 * AAP 앱 스위치 — 켜기/끄기/이관 상태 전환.
 *
 * 왜 스크립트인가: kill switch 는 **문제가 보인 순간 즉시** 눌러야 하는 물건이다.
 * 규칙상 이 문서는 슈퍼관리자만 쓸 수 있는데 아직 화면이 없다. 화면이 생기기 전까지
 * 이게 유일한 조작 수단이고, 없으면 "스위치는 있는데 누를 방법이 없는" 상태가 된다.
 *
 * 실행:
 *   node scripts/ops/aap-switch.mjs list                 # 전체 상태 한눈에
 *   node scripts/ops/aap-switch.mjs off  <appId>         # 🔴 즉시 차단(토큰 발급 중단)
 *   node scripts/ops/aap-switch.mjs on   <appId>         # 차단 해제
 *   node scripts/ops/aap-switch.mjs migrate <appId>      # AAP 이관 켜기(aapEnabled=true)
 *   node scripts/ops/aap-switch.mjs unmigrate <appId>    # AAP 이관 끄기
 *   node scripts/ops/aap-switch.mjs off-all              # 🚨 전부 차단(비상)
 *
 * ⚠️ off-all 에 짝이 되는 on-all 은 **일부러 만들지 않았다.** 되돌릴 때 한 번에 켜면
 *    비상 전에 개별적으로 꺼 뒀던 앱까지 같이 켜진다 — 그게 두 번째 사고다.
 *    복구는 `on <appId>` 로 하나씩(앱이 11개뿐이다).
 *
 * ⚠️ off 는 **즉시** 듣는다 — 서버가 정책을 캐시하지 않기 때문이다.
 *    이미 발급된 토큰(최대 5분)은 살아 있지만 새 실행은 그 순간부터 막힌다.
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const BASE = firestoreBase();

const [cmd, appId] = process.argv.slice(2);
const COMMANDS = { list: null, off: null, on: null, migrate: null, unmigrate: null, "off-all": null };
const NEEDS_APP = !["list", "off-all"].includes(cmd);
if (!(cmd in COMMANDS) || (NEEDS_APP && !appId)) {
  console.error("사용법: aap-switch.mjs list | off <appId> | on <appId> | migrate <appId> | unmigrate <appId> | off-all");
  process.exit(2);
}

const H = await authHeaders();

if (cmd === "list") {
  const r = await (await fetch(`${BASE}/platformAppPolicies?pageSize=200`, { headers: H })).json();
  const docs = r.documents || [];
  if (docs.length === 0) { console.log("등록된 앱 정책이 없습니다. seed-app-policies.mjs 를 먼저 실행하세요."); process.exit(0); }
  console.log(`앱 정책 ${docs.length}개\n`);
  console.log("  상태     이관   등급  appId                   실행URL");
  for (const d of docs.sort((a, b) => a.name.localeCompare(b.name))) {
    const f = d.fields || {};
    const id = d.name.split("/").pop();
    const status = f.status?.stringValue || "?";
    const on = status === "active" ? "🟢 켜짐 " : "🔴 꺼짐 ";
    const mig = f.aapEnabled?.booleanValue === true ? "✅" : "· ";
    console.log(`  ${on}  ${mig}    ${(f.trustLevel?.stringValue || "?").padEnd(4)}  ${id.padEnd(22)} ${f.launchUrl?.stringValue || ""}`);
  }
  console.log("\n  이관 ✅ = AAP 토큰이 나가는 앱. `·` 는 아직 그냥 링크로만 열린다.");
  process.exit(0);
}

if (cmd === "off-all") {
  // 🚨 비상 정지. 규약 전체를 내리는 유일한 수단이다.
  //    전역 플래그 문서를 따로 두지 않은 이유: 그러면 **실행마다 읽기가 하나 늘어난다.**
  //    앱이 11개인 지금은 여기서 11번 쓰는 편이 싸고, 앱이 수십 개가 되면 그때 전역 문서를 판단한다.
  const r = await (await fetch(`${BASE}/platformAppPolicies?pageSize=200`, { headers: H })).json();
  const ids = (r.documents || []).map((d) => d.name.split("/").pop());
  if (ids.length === 0) { console.log("정책 문서가 없습니다."); process.exit(0); }
  let done = 0;
  for (const id of ids) {
    const res = await fetch(
      `${BASE}/platformAppPolicies/${encodeURIComponent(id)}?updateMask.fieldPaths=status`,
      { method: "PATCH", headers: H, body: JSON.stringify({ fields: { status: { stringValue: "disabled" } } }) },
    );
    if (res.ok) { done += 1; console.log(`  🔴 ${id}`); }
    else console.error(`  ✗ ${id}: ${res.status}`);
  }
  console.log(`\n🚨 ${done}/${ids.length}개 차단됨. 복구는 \`on <appId>\` 로 하나씩 하세요.`);
  process.exit(done === ids.length ? 0 : 1);
}

// 한 필드만 바꾼다 — updateMask 를 안 주면 나머지 필드가 통째로 날아간다.
const patch = {
  off: { field: "status", body: { status: { stringValue: "disabled" } }, msg: "🔴 차단됨 — 새 토큰 발급이 즉시 멈춥니다" },
  on: { field: "status", body: { status: { stringValue: "active" } }, msg: "🟢 차단 해제" },
  migrate: { field: "aapEnabled", body: { aapEnabled: { booleanValue: true } }, msg: "✅ AAP 이관 켜짐 — 이제 토큰이 나갑니다" },
  unmigrate: { field: "aapEnabled", body: { aapEnabled: { booleanValue: false } }, msg: "· AAP 이관 꺼짐 — 그냥 링크로만 열립니다" },
}[cmd];

const url = `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}?updateMask.fieldPaths=${patch.field}`;
const res = await fetch(url, { method: "PATCH", headers: H, body: JSON.stringify({ fields: patch.body }) });
if (!res.ok) {
  console.error(`✗ 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.error("  (문서가 없으면 seed-app-policies.mjs 를 먼저 실행하세요)");
  process.exit(1);
}
console.log(`${appId} → ${patch.msg}`);
