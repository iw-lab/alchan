#!/usr/bin/env node
/**
 * platformApps/_registry 시드 — src/config/learningApps.js 의 DEFAULT_LEARNING_APPS 를 그대로 올린다.
 *
 * 왜 시드가 필요한가: 사이드바는 문서가 없으면 코드 내 기본값으로 뜬다(회귀 0). 문서를 만들어야
 * 비로소 "코드 배포 없이 앱 추가"가 성립한다. 내용은 현재 화면과 글자 그대로 같다.
 *
 * 실행: node scripts/ops/seed-app-registry.mjs [--dry]
 */
// 🔑 토큰·베이스 URL 은 **공용 헬퍼**를 쓴다. 예전엔 이 파일이 refresh-token 절차 20줄을
//    따로 들고 있었는데, `_firestore-rest.mjs` 머리말이 바로 그 복붙을 왜 뽑았는지 적어 뒀다
//    (이 저장소는 복붙 다섯 줄이 주급 과다지급으로 돌아온 전례가 있다). 남아 있던 사본을
//    2026-08-22 에 마저 걷었다 — 베이스 URL 을 이 파일 안에서 **두 번** 하드코딩하고 있었다.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DRY = process.argv.includes("--dry");

// 앱 목록은 소스 정본에서 읽는다(복붙 금지 — 두 벌이 되면 반드시 어긋난다).
const src = readFileSync(join(ROOT, "src/config/learningApps.js"), "utf8");
const block = src.match(/export const DEFAULT_LEARNING_APPS = \[([\s\S]*?)\n\];/);
if (!block) throw new Error("DEFAULT_LEARNING_APPS 를 찾지 못했습니다");
const APPS = block[1]
  .split("\n")
  .map((l) => l.match(/id:\s*"([^"]+)".*?label:\s*"([^"]+)".*?icon:\s*"([^"]+)".*?url:\s*"([^"]+)"/))
  .filter(Boolean)
  .map(([, id, label, icon, url]) => ({ id, label, icon, url }));
if (APPS.length === 0) throw new Error("파싱된 앱이 0건입니다");

console.log(`파싱된 앱 ${APPS.length}개:`);
APPS.forEach((a) => console.log(`  · ${a.id.padEnd(22)} ${a.label}  →  ${a.url}`));
if (DRY) { console.log("\n--dry 이므로 쓰지 않았습니다."); process.exit(0); }

const BASE = firestoreBase();
const H = await authHeaders();

// 🛑 **씨앗은 부트스트랩이지 동기화가 아니다.**
//
//    이 스크립트는 배열을 통째로 덮어쓴다. 그런데 레지스트리의 존재 이유가 바로
//    "코드 배포 없이 앱 추가"라서, **라이브가 코드보다 앞서 있는 게 정상**이다.
//    2026-08-22 실측: 라이브 11개 · 코드 10개(`siteChromaFall` 이 라이브에만 있었다).
//    그대로 돌렸으면 학생 사이드바에서 멀쩡한 앱 하나가 조용히 사라졌다.
//    → 코드가 모르는 앱이 라이브에 있으면 **멈춘다**. 덮어쓰려면 `--force` 로 명시할 것.
let guardUpdateTime = null;   // 가드가 읽은 시점 — 최종 PATCH 의 전제조건으로 쓴다
{
  const cur = await fetch(`${BASE}/platformApps/_registry`, { headers: H });
  if (cur.ok) {
    const curDoc = await cur.clone().json();
    guardUpdateTime = curDoc.updateTime || null;
    const known = new Set(APPS.map((a) => a.id));
    const orphans = (((await cur.json()).fields?.apps?.arrayValue?.values) || [])
      .map((v) => v.mapValue?.fields?.id?.stringValue)
      .filter((id) => id && !known.has(id));
    if (orphans.length > 0 && !process.argv.includes("--force")) {
      console.error(`\n🛑 라이브 레지스트리에 코드가 모르는 앱이 ${orphans.length}개 있습니다: ${orphans.join(", ")}`);
      console.error("   이대로 쓰면 학생 사이드바에서 사라집니다.");
      console.error("   → src/config/learningApps.js 에 추가해 맞추거나, 정말 지우려면 --force 를 주세요.");
      process.exit(1);
    }
  }
}

// 🚪 이관 힌트(`aap`)는 **정책에서 파생한다** — 이 문서에 손으로 적지 않는다.
//
//    이 스크립트는 배열을 통째로 덮어쓴다. 그래서 힌트를 여기서 안 다시 세우면,
//    이관을 켠 뒤 누군가 씨앗을 한 번 더 돌리는 순간 **힌트만 조용히 꺼진다** —
//    그리고 그게 하필 제일 나쁜 방향이다(학생이 토큰 없이 앱을 열어 기록·보상만 실패).
//    `platformAppPolicies.aapEnabled` 를 읽어 파생하면 이 문서는 **원장이 아니라 사영**이 되고,
//    씨앗을 몇 번 돌리든 스스로 맞는다.
const migrated = new Set();
{
  const pr = await fetch(`${BASE}/platformAppPolicies?pageSize=200`, { headers: H });
  if (!pr.ok) {
    // 🔴 조용히 "전부 이관 안 됨"으로 쓰지 않는다. 그러면 위 사고를 그대로 낸다.
    console.error(`✗ 정책을 읽지 못했습니다(${pr.status}) — 이관 힌트를 파생할 수 없어 중단합니다.`);
    process.exit(1);
  }
  for (const d of (await pr.json()).documents || []) {
    if (d.fields?.aapEnabled?.booleanValue === true) migrated.add(d.name.split("/").pop());
  }
  console.log(`\n이관된 앱 ${migrated.size}개: ${migrated.size ? [...migrated].join(", ") : "(없음)"}`);
}

const S = (v) => ({ stringValue: v });
const doc = {
  fields: {
    apps: {
      arrayValue: {
        values: APPS.map((a) => ({
          mapValue: { fields: {
            id: S(a.id), label: S(a.label), icon: S(a.icon), url: S(a.url),
            enabled: { booleanValue: true },
            aap: { booleanValue: migrated.has(a.id) },
          } },
        })),
      },
    },
    updatedAt: { timestampValue: new Date().toISOString() },
    note: S("사이드바 학습 사이트 목록. 앱 추가/수정은 이 문서만 고치면 된다(코드 배포 불필요). aap 힌트는 platformAppPolicies.aapEnabled 의 사영이라 손으로 고치지 말 것 — aap-switch.mjs migrate 가 쓴다."),
  },
};

// ⚠️ 전제조건을 건다. 이 스크립트는 배열을 통째로 덮어쓰므로, 읽은 뒤 쓰기 전에 누가
//    `aap-switch.mjs migrate` 를 돌렸으면 그 이관 힌트를 **지운다** — 그것도 위험한 방향으로
//    (2026-08-22 codex 레인: 같은 파일의 다른 두 쓰기는 전제조건을 쓰는데 여기만 안 썼다).
//    가드에서 읽은 시각을 그대로 쓴다.
const pre = guardUpdateTime ? `?currentDocument.updateTime=${encodeURIComponent(guardUpdateTime)}` : "";
const res = await fetch(`${BASE}/platformApps/_registry${pre}`, {
  method: "PATCH", headers: H, body: JSON.stringify(doc),
});
if (res.status === 400 || res.status === 409) {
  console.error(`✗ 쓰는 사이에 레지스트리가 바뀌었습니다(${res.status}) — 덮어쓰지 않았습니다. 다시 실행하세요.`);
  process.exit(1);
}
if (!res.ok) { console.error(`✗ ${res.status}`, (await res.text()).slice(0, 300)); process.exit(1); }
console.log(`\n✅ platformApps/_registry 기록 완료 (${APPS.length}개)`);
