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
 *   node scripts/ops/aap-switch.mjs rewards-on <appId>   # 💸 보상 지급 켜기(rewardsEnabled=true)
 *   node scripts/ops/aap-switch.mjs rewards-off <appId>  # 💸 보상 지급 끄기
 *   node scripts/ops/aap-switch.mjs cap <appId> <현금> <쿠폰>  # 하루 상한(학생 1명 기준)
 *   node scripts/ops/aap-switch.mjs breaker-reset <appId>  # 🔓 자동 차단기 해제(오늘만)
 *   node scripts/ops/aap-switch.mjs off-all              # 🚨 전부 차단(비상)
 *
 * ⚠️ **이관(migrate)과 보상(rewards-on)은 다른 스위치다.** 이관은 "이 앱이 알찬 신원으로
 *    열린다", 보상은 "이 앱이 돈을 만든다". 순서는 항상 이관 → 관찰 → 보상이고,
 *    보상을 켜도 `cap` 이 0 이면 한 푼도 안 나간다(fail-closed). 그게 기본값이다.
 *
 * ⚠️ off-all 에 짝이 되는 on-all 은 **일부러 만들지 않았다.** 되돌릴 때 한 번에 켜면
 *    비상 전에 개별적으로 꺼 뒀던 앱까지 같이 켜진다 — 그게 두 번째 사고다.
 *    복구는 `on <appId>` 로 하나씩(앱이 11개뿐이다).
 *
 * ⚠️ **자동 차단기가 끊은 앱은 `rewards-on` 으로 안 풀린다.** 일부러 그렇게 만들었다 —
 *    보상만 다시 켜면 다음 지급에서 곧바로 재차단된다(fail-safe). 앱 축 상한은 코드 상수라
 *    "상한을 올려서 해제"라는 길도 없다. 푸는 수단은 `breaker-reset` 하나이고, 그건
 *    `breakerOverrideDay` 에 **오늘 날짜(KST)** 를 박아 자정에 저절로 만료된다.
 *    즉 override 는 "오늘은 통과시킨다"는 **하루짜리 결정**이지 영구 해제가 아니다.
 *
 * ⚠️ off 는 **즉시** 듣는다 — 서버가 정책을 캐시하지 않기 때문이다.
 *    이미 발급된 토큰(최대 5분)은 살아 있지만 새 실행은 그 순간부터 막힌다.
 */
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const BASE = firestoreBase();

const [cmd, appId, ...rest] = process.argv.slice(2);
// ⚠️ 허용 **목록**으로 판정한다. `cmd in COMMANDS` 는 `"constructor"` 같은 프로토타입 키에서
//    참이 되어(Object.prototype) 아래 조회가 엉뚱한 값을 집는다 — 같은 함정을 P1-7 에서 겪었다.
const COMMANDS = ["list", "off", "on", "migrate", "unmigrate", "rewards-on", "rewards-off", "cap", "breaker-reset", "off-all"];
const NEEDS_APP = !["list", "off-all"].includes(cmd);
if (!COMMANDS.includes(cmd) || (NEEDS_APP && !appId)) {
  console.error("사용법: aap-switch.mjs list | off <appId> | on <appId> | migrate <appId> | unmigrate <appId> | rewards-on <appId> | rewards-off <appId> | cap <appId> <현금> <쿠폰> | breaker-reset <appId> | off-all");
  process.exit(2);
}

const H = await authHeaders();

if (cmd === "list") {
  const r = await (await fetch(`${BASE}/platformAppPolicies?pageSize=200`, { headers: H })).json();
  const docs = r.documents || [];
  if (docs.length === 0) { console.log("등록된 앱 정책이 없습니다. seed-app-policies.mjs 를 먼저 실행하세요."); process.exit(0); }
  console.log(`앱 정책 ${docs.length}개\n`);
  console.log("  상태     이관  보상   등급  appId                   하루상한(현금/쿠폰)  실행URL");
  for (const d of docs.sort((a, b) => a.name.localeCompare(b.name))) {
    const f = d.fields || {};
    const id = d.name.split("/").pop();
    const status = f.status?.stringValue || "?";
    const on = status === "active" ? "🟢 켜짐 " : "🔴 꺼짐 ";
    const mig = f.aapEnabled?.booleanValue === true ? "✅" : "· ";
    const rew = f.rewardsEnabled?.booleanValue === true ? "💸" : "· ";
    // integerValue 는 REST 에서 **문자열**로 온다. Number() 로 세우지 않으면 "0" 이 truthy 다.
    const cashCap = Number(f.dailyCashCap?.integerValue ?? 0);
    const couponCap = Number(f.dailyCouponCap?.integerValue ?? 0);
    const caps = `${cashCap.toLocaleString("ko-KR")}/${couponCap}`.padEnd(19);
    console.log(`  ${on}  ${mig}   ${rew}    ${(f.trustLevel?.stringValue || "?").padEnd(4)}  ${id.padEnd(22)} ${caps} ${f.launchUrl?.stringValue || ""}`);
  }
  console.log("\n  이관 ✅ = AAP 토큰이 나가는 앱. `·` 는 아직 그냥 링크로만 열린다.");
  console.log("  보상 💸 = 지급이 켜진 앱. 상한이 0 이면 켜져 있어도 한 푼도 안 나간다.");
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

if (cmd === "breaker-reset") {
  // 🔓 자동 차단기 해제. **오늘 하루만** 통과시킨다.
  //
  //    왜 rewards-on 과 따로 두나: 둘은 다른 뜻이다.
  //      rewards-on    = "이 앱이 돈을 만들어도 된다"
  //      breaker-reset = "차단기가 끊은 걸 **내가 확인했고** 오늘은 통과시킨다"
  //    한 명령으로 묶으면 평소의 보상 켜기가 사고 해제까지 같이 해 버린다.
  //
  //    ⚠️ 상한을 늘리는 게 아니다. 하드캡(app_total_daily_cap)은 그대로 살아 있다 —
  //       override 는 차단기(80% 선)만 오늘 무시하고, 100% 선에서는 여전히 멈춘다.
  const kstDay = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const url =
    `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}` +
    "?updateMask.fieldPaths=breakerOverrideDay" +
    "&updateMask.fieldPaths=rewardsEnabled" +
    "&updateMask.fieldPaths=rewardsDisabledReason";
  const res = await fetch(url, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({
      fields: {
        breakerOverrideDay: { stringValue: kstDay },
        rewardsEnabled: { booleanValue: true },
        // updateMask 에 넣고 값을 안 주면 **삭제**된다 — 사유가 남아 있으면 상태가 거짓말을 한다.
      },
    }),
  });
  if (!res.ok) {
    console.error(`✗ 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`🔓 ${appId} → 차단기 해제 (오늘 ${kstDay} 한정) · 보상 다시 켜짐`);
  console.log("   자정(KST)에 override 는 저절로 만료된다. 하드캡은 그대로 살아 있다.");
  console.log("   ⚠️ 왜 끊겼는지 확인하지 않았다면 지금 로그를 볼 것: platformAlerts 컬렉션");
  process.exit(0);
}

if (cmd === "cap") {
  // 💰 하루 상한 = **학생 1명이 이 앱에서** 하루에 받을 수 있는 총량.
  //    코드의 절대 상한(functions/aap/rewardRules.js GLOBAL_CEILING)과 신뢰등급 상한 중
  //    **더 작은 값**이 실제로 적용된다 — 여기 큰 수를 써도 그 선을 못 넘는다.
  const [cashRaw, couponRaw] = rest;
  const cash = Number(cashRaw);
  const coupon = Number(couponRaw);
  const bad = (v) => !Number.isInteger(v) || v < 0;
  if (bad(cash) || bad(coupon)) {
    console.error("사용법: aap-switch.mjs cap <appId> <현금(0 이상 정수)> <쿠폰(0 이상 정수)>");
    process.exit(2);
  }
  const capUrl =
    `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}` +
    `?updateMask.fieldPaths=dailyCashCap&updateMask.fieldPaths=dailyCouponCap`;
  const capRes = await fetch(capUrl, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({
      fields: {
        // Firestore REST 는 정수를 **문자열**로 받는다.
        dailyCashCap: { integerValue: String(cash) },
        dailyCouponCap: { integerValue: String(coupon) },
      },
    }),
  });
  if (!capRes.ok) {
    console.error(`✗ 실패 ${capRes.status}: ${(await capRes.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`${appId} → 하루 상한 현금 ${cash.toLocaleString("ko-KR")} · 쿠폰 ${coupon}`);
  console.log("  (실제 적용값 = 이 값 · 신뢰등급 상한 · 코드 절대상한 중 가장 작은 것)");
  process.exit(0);
}

// 한 필드만 바꾼다 — updateMask 를 안 주면 나머지 필드가 통째로 날아간다.
const patch = {
  off: { field: "status", body: { status: { stringValue: "disabled" } }, msg: "🔴 차단됨 — 새 토큰 발급이 즉시 멈춥니다" },
  on: { field: "status", body: { status: { stringValue: "active" } }, msg: "🟢 차단 해제" },
  migrate: { field: "aapEnabled", body: { aapEnabled: { booleanValue: true } }, msg: "✅ AAP 이관 켜짐 — 이제 토큰이 나갑니다" },
  unmigrate: { field: "aapEnabled", body: { aapEnabled: { booleanValue: false } }, msg: "· AAP 이관 꺼짐 — 그냥 링크로만 열립니다" },
  "rewards-on": { field: "rewardsEnabled", body: { rewardsEnabled: { booleanValue: true } }, msg: "💸 보상 켜짐 — 상한이 0 이 아니면 이제 돈이 나갑니다" },
  "rewards-off": { field: "rewardsEnabled", body: { rewardsEnabled: { booleanValue: false } }, msg: "· 보상 꺼짐 — 실행권 문서도 더 이상 만들지 않습니다" },
}[cmd];

const url = `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}?updateMask.fieldPaths=${patch.field}`;
const res = await fetch(url, { method: "PATCH", headers: H, body: JSON.stringify({ fields: patch.body }) });
if (!res.ok) {
  console.error(`✗ 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.error("  (문서가 없으면 seed-app-policies.mjs 를 먼저 실행하세요)");
  process.exit(1);
}
console.log(`${appId} → ${patch.msg}`);
