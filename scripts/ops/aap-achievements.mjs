#!/usr/bin/env node
/**
 * AAP 성취 카탈로그 운영 — "무엇을 얼마에 준다"를 등록·수정·확인한다.
 *
 * 왜 스크립트인가: 이 문서는 규칙상 **슈퍼관리자만** 쓸 수 있는데 아직 화면이 없다.
 * 화면이 생기기 전까지 이게 유일한 조작 수단이다.
 *
 * 실행:
 *   node scripts/ops/aap-achievements.mjs list [appId]
 *   node scripts/ops/aap-achievements.mjs set <appId> <achievementId> \
 *        --type cash|coupon --amount N [--per-day N] [--lifetime N] [--cooldown N] [--label "..."]
 *   node scripts/ops/aap-achievements.mjs off <appId> <achievementId>   # 그 성취만 끔
 *   node scripts/ops/aap-achievements.mjs on  <appId> <achievementId>
 *   node scripts/ops/aap-achievements.mjs rm  <appId> <achievementId>
 *
 * 🔒 `set` 은 **서버와 똑같은 검증**을 먼저 돌린다(functions/aap/catalogRules.js).
 *    상한을 넘는 문서를 애초에 못 쓰게 막기 위해서다 — 안 그러면 등록은 되는데
 *    학생이 눌렀을 때만 거부되는, 진단하기 나쁜 상태가 된다.
 *
 * 🔒 상한은 앱의 **신뢰등급(trustLevel)** 에 따라 달라진다. L0(성취를 알찬이 독립 검증
 *    못 함)는 명목상 소액만 허용된다. 등급은 platformAppPolicies 에서 읽어 온다.
 *
 * ⚠️ `list` 는 등록된 값을 **지금 규칙으로 다시 판정해서** 보여준다. 상한을 낮춘 뒤
 *    옛 문서가 그대로 남아 있으면 여기서 ✗ 로 보인다 — 학생이 부딪히기 전에 보라고.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, authHeaders, S, B, I, A, plain } from "./_firestore-rest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
// 순수 규칙만 불러온다 — catalog.js 를 부르면 firebase-admin 이 딸려온다.
const rules = require(join(ROOT, "functions/aap/catalogRules.js"));

const argv = process.argv.slice(2);
const [cmd, appId, achId] = argv;
const flag = (name, dflt = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 || i + 1 >= argv.length ? dflt : argv[i + 1];
};

const USAGE = `사용법:
  aap-achievements.mjs list [appId]
  aap-achievements.mjs set <appId> <achievementId> --type cash|coupon --amount N
       [--per-day N] [--lifetime N] [--cooldown N] [--label "표시이름"]
  aap-achievements.mjs off|on|rm <appId> <achievementId>`;

if (!["list", "set", "off", "on", "rm"].includes(cmd)) {
  console.error(USAGE);
  process.exit(2);
}
if (cmd !== "list" && (!appId || !achId)) {
  console.error(USAGE);
  process.exit(2);
}

const H = await authHeaders();
const itemsUrl = (app) => `${BASE}/appAchievements/${encodeURIComponent(app)}/items`;
const docUrl = (app, id) => `${itemsUrl(app)}/${encodeURIComponent(id)}`;

/** 앱의 신뢰등급. 정책 문서가 없으면 등록되지 않은 앱이다. */
async function trustLevelOf(app) {
  const res = await fetch(`${BASE}/platformAppPolicies/${encodeURIComponent(app)}`, { headers: H });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`정책 조회 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const doc = await res.json();
  return plain(doc.fields).trustLevel || "L0";
}

// ── list ────────────────────────────────────────────────────────────────
if (cmd === "list") {
  const polRes = await fetch(`${BASE}/platformAppPolicies?pageSize=200`, { headers: H });
  if (!polRes.ok) {
    console.error(`정책 목록 조회 실패 ${polRes.status}`);
    process.exit(1);
  }
  const apps = appId
    ? [appId]
    : ((await polRes.json()).documents || []).map((d) => d.name.split("/").pop()).sort();

  let total = 0;
  for (const app of apps) {
    const level = await trustLevelOf(app);
    const res = await fetch(`${itemsUrl(app)}?pageSize=200`, { headers: H });
    const docs = res.ok ? (await res.json()).documents || [] : [];
    if (docs.length === 0) continue;
    const lim = rules.trustLimitsFor(level);
    console.log(`\n${app}  [${level}]  현금 1건 최대 ${lim.cashPerGrant.toLocaleString()} · 하루 ${lim.cashPerAppPerDay.toLocaleString()}`);
    for (const d of docs.sort((a, b) => a.name.localeCompare(b.name))) {
      const id = d.name.split("/").pop();
      const raw = plain(d.fields);
      const v = rules.normalizeAchievement(raw, level);
      total += 1;
      const mark = v.ok ? "✅" : `✗ ${v.reason}`;
      const amt = raw.amount === undefined ? "?" : Number(raw.amount).toLocaleString();
      console.log(
        `   ${mark.padEnd(26)} ${id.padEnd(24)} ${String(raw.rewardType || "?").padEnd(7)} ${amt.padStart(8)} ×${raw.maxPerDay ?? 1}/일  ${raw.label || ""}`,
      );
    }
  }
  if (total === 0) console.log("등록된 성취가 없습니다.");
  else console.log(`\n총 ${total}개. ✗ 는 **지금 규칙으로는 지급되지 않는** 문서입니다.`);
  process.exit(0);
}

// ── off / on / rm ───────────────────────────────────────────────────────
if (cmd === "rm") {
  const res = await fetch(docUrl(appId, achId), { method: "DELETE", headers: H });
  if (!res.ok) {
    console.error(`✗ 삭제 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`🗑️  ${appId}/${achId} 삭제됨`);
  process.exit(0);
}

if (cmd === "off" || cmd === "on") {
  const active = cmd === "on";
  const res = await fetch(`${docUrl(appId, achId)}?updateMask.fieldPaths=active`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ fields: { active: B(active) } }),
  });
  if (!res.ok) {
    console.error(`✗ 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`${appId}/${achId} → ${active ? "🟢 켜짐" : "🔴 꺼짐 (즉시 지급 중단)"}`);
  process.exit(0);
}

// ── set ─────────────────────────────────────────────────────────────────
const level = await trustLevelOf(appId);
if (level === null) {
  console.error(`✗ '${appId}' 의 앱 정책이 없습니다. seed-app-policies.mjs 를 먼저 실행하세요.`);
  process.exit(1);
}
if (!rules.ACHIEVEMENT_ID_RE.test(achId)) {
  console.error(`✗ 성취 id 형식이 올바르지 않습니다: ${achId}`);
  process.exit(1);
}

const candidate = {
  label: flag("label", ""),
  rewardType: flag("type"),
  amount: Number(flag("amount")),
  maxPerDay: flag("per-day") === undefined ? 1 : Number(flag("per-day")),
  maxLifetime: flag("lifetime") === undefined ? 0 : Number(flag("lifetime")),
  cooldownSec: flag("cooldown") === undefined ? 0 : Number(flag("cooldown")),
  prerequisites: [],
  active: true,
};

// 🔒 서버와 **같은 함수**로 먼저 판정한다.
const verdict = rules.normalizeAchievement(candidate, level);
if (!verdict.ok) {
  const lim = rules.trustLimitsFor(level);
  console.error(`✗ 이 값은 서버가 거부합니다 (사유: ${verdict.reason})`);
  console.error(`   앱 신뢰등급 ${level} 의 상한:`);
  console.error(`     현금  1건 ${lim.cashPerGrant.toLocaleString()} · 하루 합계 ${lim.cashPerAppPerDay.toLocaleString()}`);
  console.error(`     쿠폰  1건 ${lim.couponPerGrant} · 하루 합계 ${lim.couponPerAppPerDay}`);
  console.error(`   (하루 합계 = 금액 × --per-day. 등급을 올리려면 정책 문서의 trustLevel 을 바꾸되,`);
  console.error(`    L2 는 "앱 서버가 성취를 독립 검증한다"는 뜻이지 "서버가 있다"가 아니다.)`);
  process.exit(1);
}

// 🔒 이미 있는 문서면 **active 를 그대로 둔다.**
//    아래 PATCH 는 updateMask 없이 = 전체 치환이라, 그냥 두면 `active:true` 가 항상 실린다.
//    그러면 "일부러 꺼 둔 성취의 금액만 손봤을 뿐인데 다시 켜지는" 일이 생긴다 —
//    끄기는 사고 대응 수단이라, 다른 조작의 부수효과로 풀리면 안 된다.
const prevRes = await fetch(docUrl(appId, achId), { headers: H });
const prevActive = prevRes.ok ? plain((await prevRes.json()).fields).active : undefined;
const keepActive = prevActive === undefined ? true : prevActive !== false;

const v = verdict.value;
const body = {
  fields: {
    label: S(v.label),
    rewardType: S(v.rewardType),
    amount: I(v.amount),
    maxPerDay: I(v.maxPerDay),
    maxLifetime: I(v.maxLifetime),
    cooldownSec: I(v.cooldownSec),
    prerequisites: A([]),
    policyVersion: I(v.policyVersion),
    revocable: B(v.revocable),
    active: B(keepActive),
  },
};
// PATCH 는 문서가 없으면 만들고 있으면 갱신한다(updateMask 없이 = 전체 치환).
const res = await fetch(docUrl(appId, achId), { method: "PATCH", headers: H, body: JSON.stringify(body) });
if (!res.ok) {
  console.error(`✗ 저장 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`✅ ${appId}/${achId} 등록`);
console.log(`   ${v.rewardType} ${v.amount.toLocaleString()} × 하루 ${v.maxPerDay}회 (등급 ${level})`);
if (!keepActive) {
  console.log(`   🔴 이 성취는 **꺼진 상태 그대로** 입니다 — 켜려면 \`on ${appId} ${achId}\``);
}
console.log(`   ⚠️ 실제 지급은 앱 정책의 aapEnabled·status 와 보상 API(P1-2)가 켜져야 일어납니다.`);
