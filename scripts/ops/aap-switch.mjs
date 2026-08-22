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
 *   node scripts/ops/aap-switch.mjs url <appId> <https://...>  # 🔗 실행 주소(정책+사이드바 동시)
 *   node scripts/ops/aap-switch.mjs claims <appId> <none|nick|cls|nick,cls>  # 👤 선택 클레임
 *   node scripts/ops/aap-switch.mjs stats-on <appId>     # 📚 학습기록 켜기(statsEnabled=true)
 *   node scripts/ops/aap-switch.mjs stats-off <appId>    # 📚 학습기록 끄기
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

/**
 * 🔗 사이드바 레지스트리의 이관 힌트를 정책과 **같은 명령으로** 맞춘다.
 *
 * 왜 필요한가: 클라이언트는 앱을 누를 때마다 CF 를 부를 수 없어(10개 앱에 왕복을 물리면
 * 그게 곧 지연이다) "이 앱이 이관됐나"를 레지스트리 힌트로 먼저 거른다. 그런데 그 힌트와
 * 정책의 `aapEnabled` 가 **두 벌의 원장**이 되는 순간, 사람이 한쪽만 고치는 날이 온다.
 * 이 저장소는 그 사고를 이미 겪었다(같은 도메인 값을 두 스토어가 각자 갱신).
 *
 * → 그래서 원장을 하나로 만들지 못한다면(클라가 정책을 못 읽는다) **쓰는 손을 하나로**
 *   만든다. `migrate`/`unmigrate` 가 두 문서를 같이 쓴다.
 *
 * ⚠️ 방향이 중요하다. 힌트가 **꺼져 있는데 정책이 켜진** 경우가 위험하다 —
 *    학생이 토큰 없이 앱을 열어 기록·보상만 조용히 실패한다. 반대(힌트 켜짐·정책 꺼짐)는
 *    서버가 `not_migrated` 로 거부하고 그냥 링크로 떨어져 무해하다.
 *
 * @param {string} id appId
 * @param {boolean} want 원하는 힌트 값
 * @return {Promise<string>} 사람이 읽을 결과 한 줄
 */
async function syncRegistryHint(id, want) {
  const url = `${BASE}/platformApps/_registry`;
  const snap = await fetch(url, { headers: H });
  if (snap.status === 404) return "  ⚠️ 레지스트리 문서가 없습니다 — 사이드바는 코드 폴백으로 뜹니다. seed-app-registry.mjs 를 실행하세요.";
  if (!snap.ok) return `  ⚠️ 레지스트리를 읽지 못했습니다(${snap.status}) — 힌트가 어긋난 채로 남습니다.`;
  const doc = await snap.json();
  const arr = doc.fields?.apps?.arrayValue?.values || [];
  let found = false;
  for (const v of arr) {
    const f = v.mapValue?.fields;
    if (f?.id?.stringValue !== id) continue;
    found = true;
    if ((f.aap?.booleanValue === true) === want) return `  · 레지스트리 힌트는 이미 ${want ? "켜짐" : "꺼짐"}`;
    f.aap = { booleanValue: want };
  }
  if (!found) return `  ⚠️ 레지스트리에 ${id} 가 없습니다 — 사이드바에 안 보이는 앱입니다.`;

  // 읽고-고쳐-쓰기다. 그 사이 남이 고쳤으면 **덮어쓰지 않고 실패**한다.
  const res = await fetch(`${url}?currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}&updateMask.fieldPaths=apps`, {
    method: "PATCH", headers: H,
    body: JSON.stringify({ fields: { apps: { arrayValue: { values: arr } } } }),
  });
  if (!res.ok) return `  ⚠️ 레지스트리 갱신 실패(${res.status}) — 다시 실행하세요. 정책만 바뀐 상태입니다.`;
  return `  🔗 레지스트리 힌트 → ${want ? "켜짐(토큰과 함께 연다)" : "꺼짐(그냥 링크로 연다)"}`;
}

const [cmd, appId, ...rest] = process.argv.slice(2);
// ⚠️ 허용 **목록**으로 판정한다. `cmd in COMMANDS` 는 `"constructor"` 같은 프로토타입 키에서
//    참이 되어(Object.prototype) 아래 조회가 엉뚱한 값을 집는다 — 같은 함정을 P1-7 에서 겪었다.
const COMMANDS = ["list", "off", "on", "migrate", "unmigrate", "rewards-on", "rewards-off", "stats-on", "stats-off", "cap", "url", "claims", "breaker-reset", "off-all"];
const NEEDS_APP = !["list", "off-all"].includes(cmd);
if (!COMMANDS.includes(cmd) || (NEEDS_APP && !appId)) {
  console.error("사용법: aap-switch.mjs list | off <appId> | on <appId> | migrate <appId> | unmigrate <appId> | rewards-on <appId> | rewards-off <appId> | stats-on <appId> | stats-off <appId> | cap <appId> <현금> <쿠폰> | url <appId> <주소> | claims <appId> <none|nick|cls|nick,cls> | breaker-reset <appId> | off-all");
  process.exit(2);
}

const H = await authHeaders();

if (cmd === "list") {
  const r = await (await fetch(`${BASE}/platformAppPolicies?pageSize=200`, { headers: H })).json();
  const docs = r.documents || [];
  if (docs.length === 0) { console.log("등록된 앱 정책이 없습니다. seed-app-policies.mjs 를 먼저 실행하세요."); process.exit(0); }
  console.log(`앱 정책 ${docs.length}개\n`);
  console.log("  상태     이관  보상  기록  클레임    등급  appId                   하루상한(현금/쿠폰)  실행URL");
  for (const d of docs.sort((a, b) => a.name.localeCompare(b.name))) {
    const f = d.fields || {};
    const id = d.name.split("/").pop();
    const status = f.status?.stringValue || "?";
    const on = status === "active" ? "🟢 켜짐 " : "🔴 꺼짐 ";
    const mig = f.aapEnabled?.booleanValue === true ? "✅" : "· ";
    const rew = f.rewardsEnabled?.booleanValue === true ? "💸" : "· ";
    // 학습기록도 실행권 문서를 만든다 — 목록에 없으면 "왜 실행권이 생기지?" 를 못 푼다.
    const sta = f.statsEnabled?.booleanValue === true ? "📚" : "· ";
    // 👤 선택 클레임은 **학생 데이터가 나가는 유일한 스위치**다. 목록에 안 보이면
    //    켜 놓고 잊는다 — 잊히면 안 되는 종류라 등급 옆에 같이 찍는다.
    const claims = (f.allowedClaims?.arrayValue?.values || []).map((v) => v.stringValue).join("+") || "·";
    // integerValue 는 REST 에서 **문자열**로 온다. Number() 로 세우지 않으면 "0" 이 truthy 다.
    const cashCap = Number(f.dailyCashCap?.integerValue ?? 0);
    const couponCap = Number(f.dailyCouponCap?.integerValue ?? 0);
    const caps = `${cashCap.toLocaleString("ko-KR")}/${couponCap}`.padEnd(19);
    console.log(`  ${on}  ${mig}   ${rew}   ${sta}  ${claims.padEnd(8)} ${(f.trustLevel?.stringValue || "?").padEnd(4)}  ${id.padEnd(22)} ${caps} ${f.launchUrl?.stringValue || ""}`);
  }
  // 🔎 드리프트 탐지 — 정책과 사이드바 힌트가 어긋나면 그 자리에서 말한다.
  //    "맞추라"고 산문으로 적어 두는 것보다 **어긋난 걸 보여 주는 쪽**이 값이 크다.
  const reg = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
  // ⚠️ **"검사를 못 했다"와 "어긋난 게 없다"를 같은 화면으로 두지 않는다.** 조용히 넘어가면
  //    운영자는 초록불로 읽는다(2026-08-22 Claude 레인).
  if (!reg.ok) {
    console.log(`\n  ⚠️ 레지스트리를 못 읽어(${reg.status}) 정책↔사이드바 대조를 **건너뛰었습니다** — 어긋난 게 없다는 뜻이 아닙니다.`);
  } else {
    const hint = new Map();
    for (const v of ((await reg.json()).fields?.apps?.arrayValue?.values) || []) {
      const f = v.mapValue?.fields;
      if (f?.id?.stringValue) hint.set(f.id.stringValue, f.aap?.booleanValue === true);
    }
    const drift = docs
      .map((d) => [d.name.split("/").pop(), d.fields?.aapEnabled?.booleanValue === true])
      .filter(([id, pol]) => hint.has(id) && hint.get(id) !== pol);
    if (drift.length > 0) {
      console.log("\n  🔴 정책 ↔ 사이드바 힌트가 어긋난 앱:");
      for (const [id, pol] of drift) {
        const bad = pol && !hint.get(id);
        console.log(`     ${bad ? "🔴" : "🟡"} ${id}: 정책 ${pol ? "이관됨" : "이관 안 됨"} / 힌트 ${hint.get(id) ? "켜짐" : "꺼짐"}` +
          (bad ? "  ← 위험: 학생이 토큰 없이 열어 기록·보상이 조용히 실패합니다" : "  ← 무해: 서버가 거부하고 그냥 링크로 떨어집니다"));
      }
      console.log(`     고치기: node scripts/ops/aap-switch.mjs ${drift[0][1] ? "migrate" : "unmigrate"} ${drift[0][0]}`);
    }
  }

  console.log("\n  이관 ✅ = AAP 토큰이 나가는 앱. `·` 는 아직 그냥 링크로만 열린다.");
  console.log("  보상 💸 = 지급이 켜진 앱. 상한이 0 이면 켜져 있어도 한 푼도 안 나간다.");
  console.log("  기록 📚 = 학습기록이 켜진 앱. 보상이 꺼져 있어도 이게 켜져 있으면 실행권이 생긴다.");
  console.log("  클레임 = 토큰에 실리는 **학생 데이터**. `·` 는 아무것도 안 나간다(기본).");
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

if (cmd === "claims") {
  // 👤 **학생 데이터를 앱에 더 주는 스위치다.** 기본은 아무것도 안 준다(§3.2 C21).
  //
  //    · `nick` = 학생이 **스스로 정한** 닉네임. 실명이 아니다 — 서버가 `hasSetNickname`
  //      으로 가른다(교사가 실명을 넣을 수 있는 `name` 필드는 절대 안 나간다).
  //    · `cls`  = 학급의 **앱별 pairwise 값**. 학급코드 원문이 아니라 "같은 반끼리 묶기"만 된다.
  //
  //    🔴 코드의 화이트리스트(`functions/aap/policy.js` ALLOWED_OPTIONAL_CLAIMS)와 교집합만
  //       실린다. 여기 이상한 값을 써도 서버가 안 싣지만, **여기서도 막는다** — 문서에
  //       쓰레기가 남으면 다음 사람이 "이건 왜 안 나가지"로 시간을 쓴다.
  const KNOWN = ["nick", "cls"];
  const raw = (rest[0] || "").trim();
  const list = raw === "none" ? [] : raw.split(",").map((x) => x.trim()).filter(Boolean);
  const bad = list.filter((c) => !KNOWN.includes(c));
  if (!raw || bad.length > 0 || new Set(list).size !== list.length) {
    console.error("사용법: aap-switch.mjs claims <appId> <none|nick|cls|nick,cls>");
    if (bad.length) console.error(`  · 모르는 클레임: ${bad.join(", ")} (가능: ${KNOWN.join(", ")})`);
    process.exit(2);
  }
  const url =
    `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}?updateMask.fieldPaths=allowedClaims`;
  const res = await fetch(url, {
    method: "PATCH", headers: H,
    body: JSON.stringify({
      fields: { allowedClaims: { arrayValue: { values: list.map((c) => ({ stringValue: c })) } } },
    }),
  });
  if (!res.ok) {
    console.error(`✗ 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`${appId} → 선택 클레임 ${list.length ? list.join(", ") : "(없음)"}`);
  if (list.includes("nick")) console.log("  👤 학생이 스스로 정한 닉네임이 나갑니다 — 실명은 나가지 않습니다");
  if (list.includes("cls")) console.log("  👥 학급 pairwise 값이 나갑니다 — 학급코드 원문은 아닙니다");
  if (!list.length) console.log("  · 이제 아무 선택 클레임도 싣지 않습니다");
  console.log("  ⚠️ 이미 발급된 토큰(최대 5분)에는 옛 설정이 그대로 들어 있습니다");
  process.exit(0);
}

if (cmd === "url") {
  // 🔗 실행 주소는 **두 곳**에 있다. 정책의 `launchUrl`(토큰이 향하는 곳, 서버가 정한다)과
  //    레지스트리의 `url`(이관 전 그냥 링크). 둘이 어긋나면 같은 앱이 이관 여부에 따라
  //    **다른 주소로 열린다.** 그래서 한 명령이 둘 다 쓴다.
  //
  // 🔴 실제로 어긋나 있었다(2026-08-22): 앱은 학교망이 `github.io` 를 막아 Cloudflare 로
  //    옮겼는데 알찬 쪽 주소가 그대로였다 — 교실에서 누르면 아무것도 안 열렸다.
  //    "앱을 옮겼다"와 "알찬이 그걸 안다"는 다른 문장이다.
  const raw = rest[0];
  let parsed;
  try { parsed = new URL(raw); } catch { parsed = null; }
  // ⚠️ `parsed.hash` 가 아니라 **원문의 `#`** 을 본다 — 트레일링 `#` 은 hash 가 빈 문자열인데
  //    href 에는 남아, 서버가 토큰을 붙이면 `##aap=` 이 되어 앱이 토큰을 못 읽는다.
  if (!parsed || parsed.protocol !== "https:" || raw.includes("#")) {
    console.error("사용법: aap-switch.mjs url <appId> <https 주소>");
    console.error("  · https 만 허용 · fragment(#) 가 있으면 거부 — 토큰 fragment 와 충돌한다");
    process.exit(2);
  }
  const href = parsed.href;

  const pRes = await fetch(
    `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}?updateMask.fieldPaths=launchUrl`,
    { method: "PATCH", headers: H, body: JSON.stringify({ fields: { launchUrl: { stringValue: href } } }) },
  );
  if (!pRes.ok) {
    console.error(`✗ 정책 갱신 실패 ${pRes.status}: ${(await pRes.text()).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`${appId} → 실행 주소 ${href}`);
  console.log("  🔒 정책(launchUrl) 갱신됨 — 토큰은 이제 이 주소로 나갑니다");

  // 사이드바 쪽도 같이. 읽고-고쳐-쓰기라 그 사이 남이 고쳤으면 덮어쓰지 않고 실패한다.
  const regUrl = `${BASE}/platformApps/_registry`;
  const snap = await fetch(regUrl, { headers: H });
  if (!snap.ok) { console.log(`  ⚠️ 레지스트리를 읽지 못했습니다(${snap.status}) — 사이드바 주소는 옛것 그대로입니다.`); process.exit(1); }
  const doc = await snap.json();
  const arr = doc.fields?.apps?.arrayValue?.values || [];
  const hit = arr.find((v) => v.mapValue?.fields?.id?.stringValue === appId);
  if (!hit) { console.log(`  ⚠️ 레지스트리에 ${appId} 가 없습니다 — 사이드바에 안 보이는 앱입니다.`); process.exit(0); }
  if (hit.mapValue.fields.url?.stringValue === href) { console.log("  · 사이드바 주소는 이미 같습니다"); process.exit(0); }
  hit.mapValue.fields.url = { stringValue: href };
  const rRes = await fetch(`${regUrl}?currentDocument.updateTime=${encodeURIComponent(doc.updateTime)}&updateMask.fieldPaths=apps`, {
    method: "PATCH", headers: H, body: JSON.stringify({ fields: { apps: { arrayValue: { values: arr } } } }),
  });
  if (!rRes.ok) { console.error(`  ⚠️ 사이드바 갱신 실패(${rRes.status}) — 정책만 바뀐 상태입니다. 다시 실행하세요.`); process.exit(1); }
  console.log("  🔗 사이드바(레지스트리) 주소도 같이 갱신됨");
  console.log("  ⚠️ src/config/learningApps.js 의 폴백은 코드다 — 배포해야 반영됩니다.");
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
  "rewards-off": { field: "rewardsEnabled", body: { rewardsEnabled: { booleanValue: false } }, msg: "· 보상 꺼짐 — 학습기록도 꺼져 있으면 실행권 문서를 더 이상 만들지 않습니다" },
  // 📚 학습기록은 **돈이 아니다.** 그래서 보상과 별개 스위치이고, 상한도 따로 없다
  //    (대신 학생×앱×하루 이벤트 300건 · 누적 12시간이 코드 상수로 박혀 있다).
  //    ⚠️ 켜면 실행마다 실행권 문서 1건이 생긴다 — 학습기록이 uid 를 찾는 유일한 다리다.
  "stats-on": { field: "statsEnabled", body: { statsEnabled: { booleanValue: true } }, msg: "📚 학습기록 켜짐 — 이제 실행마다 실행권이 생기고 학습 이벤트를 받습니다" },
  "stats-off": { field: "statsEnabled", body: { statsEnabled: { booleanValue: false } }, msg: "· 학습기록 꺼짐" },
}[cmd];

const url = `${BASE}/platformAppPolicies/${encodeURIComponent(appId)}?updateMask.fieldPaths=${patch.field}`;
const res = await fetch(url, { method: "PATCH", headers: H, body: JSON.stringify({ fields: patch.body }) });
if (!res.ok) {
  console.error(`✗ 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  console.error("  (문서가 없으면 seed-app-policies.mjs 를 먼저 실행하세요)");
  process.exit(1);
}
console.log(`${appId} → ${patch.msg}`);

// 🔗 이관 스위치는 사이드바 힌트까지 **같이** 옮긴다(위 syncRegistryHint 주석 참조).
//
// ⚠️ 실패하면 **0 으로 끝내지 않는다.** 이 명령을 `&&` 로 엮어 쓰는 사람에게 "정책만
//    바뀌고 사이드바는 안 바뀐 상태"가 성공으로 보이면, 그게 바로 위험한 방향의
//    드리프트다(학생이 토큰 없이 앱을 연다). 같은 파일의 `url` 명령과 관례를 맞춘다
//    (2026-08-22 Claude 레인 — 한 파일 안에서 종료코드 관례가 갈려 있었다).
if (cmd === "migrate" || cmd === "unmigrate") {
  const line = await syncRegistryHint(appId, cmd === "migrate");
  console.log(line);
  if (line.includes("⚠️")) {
    console.error("  ↑ 사이드바 힌트가 정책과 어긋난 채 남았습니다. 다시 실행하세요.");
    process.exit(1);
  }
}
