// scripts/ops/verify-live-rules.mjs
//
// 배포 후 확인용 — **라이브에 실제로 게시된 Firestore 규칙**을 받아 로컬 firestore.rules 와 대조한다.
// deploy.yml 은 순차 스텝에 continue-on-error 가 없어서 Functions 배포가 실패하면
// rules 스텝이 통째로 스킵된다("새 프론트 + 옛 규칙" 상태). CI 가 초록이어도
// **게시된 규칙이 내 파일과 같은지는 별개 사실**이라 여기서 직접 확인한다.
//
//   node scripts/ops/verify-live-rules.mjs
//
// 인증은 firebase CLI 의 refresh token 을 쓴다(서비스 계정 불필요). 읽기 전용.
// 절차 전체는 docs/DEPLOY_ROLLBACK_RUNBOOK.md §4 참조.

import { createRequire } from "module";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

async function accessToken() {
  const require = createRequire(import.meta.url);
  const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const api = require(join(gRoot, "firebase-tools/lib/api.js"));
  const store = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: store.tokens.refresh_token,
      client_id: api.clientId(), client_secret: api.clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("토큰 실패: " + JSON.stringify(j));
  return j.access_token;
}

const P = "inconomysu-class";
const t = await accessToken();
const H = { authorization: `Bearer ${t}` };

const rel = await (await fetch(`https://firebaserules.googleapis.com/v1/projects/${P}/releases/cloud.firestore`, { headers: H })).json();
console.log("배포된 ruleset :", rel.rulesetName);
console.log("배포 시각      :", rel.updateTime);

const rs = await (await fetch(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`, { headers: H })).json();
const src = rs.source.files.map((f) => f.content).join("\n");

const local = readFileSync("firestore.rules", "utf8");
console.log("라이브 원문 == 로컬 firestore.rules ? ", src.trim() === local.trim() ? "✅ 완전 일치" : "❌ 불일치");
console.log("");
console.log("핵심 봉인 마커가 라이브 규칙에 살아 있는지:");
for (const [label, needle] of [
  ["읽기 봉인(jobs)", "isSameClassFast(resource.data.classCode)"],
  ["하트비트 검증", "isValidHeartbeat"],
  ["학급 설정문서 스코프", "isOwnClassSettingDocFast"],
  ["goals 문서ID 스코프", "isOwnClassGoal"],
  ["platformApps 신설", "match /platformApps/"],
  ["앱 집행정책 잠금(AAP)", "match /platformAppPolicies/"],
  ["성취 카탈로그 잠금(AAP)", "match /appAchievements/"],
  ["playlist 학급 스코프", "pricePerSong"],
]) console.log(`  ${src.includes(needle) ? "✅" : "❌"}  ${label}`);
