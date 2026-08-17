#!/usr/bin/env node
/**
 * platformApps/_registry 시드 — src/config/learningApps.js 의 DEFAULT_LEARNING_APPS 를 그대로 올린다.
 *
 * 왜 시드가 필요한가: 사이드바는 문서가 없으면 코드 내 기본값으로 뜬다(회귀 0). 문서를 만들어야
 * 비로소 "코드 배포 없이 앱 추가"가 성립한다. 내용은 현재 화면과 글자 그대로 같다.
 *
 * 실행: node scripts/ops/seed-app-registry.mjs [--dry]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
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

const require = createRequire(import.meta.url);
const api = require(join(execSync("npm root -g", { encoding: "utf8" }).trim(), "firebase-tools/lib/api.js"));
const store = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
const tk = await (await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    refresh_token: store.tokens.refresh_token,
    client_id: api.clientId(), client_secret: api.clientSecret(), grant_type: "refresh_token",
  }),
})).json();
if (!tk.access_token) throw new Error("토큰 갱신 실패");

const S = (v) => ({ stringValue: v });
const doc = {
  fields: {
    apps: {
      arrayValue: {
        values: APPS.map((a) => ({
          mapValue: { fields: { id: S(a.id), label: S(a.label), icon: S(a.icon), url: S(a.url), enabled: { booleanValue: true } } },
        })),
      },
    },
    updatedAt: { timestampValue: new Date().toISOString() },
    note: S("사이드바 학습 사이트 목록. 앱 추가/수정은 이 문서만 고치면 된다(코드 배포 불필요)."),
  },
};

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/platformApps/_registry`;
const res = await fetch(url, {
  method: "PATCH",
  headers: { authorization: `Bearer ${tk.access_token}`, "content-type": "application/json" },
  body: JSON.stringify(doc),
});
if (!res.ok) { console.error(`✗ ${res.status}`, (await res.text()).slice(0, 300)); process.exit(1); }
console.log(`\n✅ platformApps/_registry 기록 완료 (${APPS.length}개)`);
