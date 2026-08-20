#!/usr/bin/env node
/**
 * `settings/classCodes` 정리 — **학생 가입 게이트**라서 유령 문서 정리와 별개로 반드시 닫아야 한다.
 *
 * `src/firebase/db/core.js:verifyClassCode` 가 이 문서의 `codes ∪ validCodes` 로 가입을 허용한다.
 * 유령 학급 문서를 지워도 여기에 코드가 남아 있으면 **학생이 그 코드로 다시 가입해** 유령이
 * 되살아난다(그리고 economicEventSettings 가 다시 생긴다). 정리의 마지막 단추다.
 *
 * 기본 dry-run. 실제 반영은 `--commit`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accessToken } from "./_auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const COMMIT = process.argv.includes("--commit");

// 남길 코드. 실사용 2개 + 교사 계정만 남은 2개(그 교사가 학생을 받을 수 있어야 한다).
const KEEP = ["BG6QUC", "9BVPKP", "CLASS2025", "XHAWPR"];

const H = { authorization: `Bearer ${await accessToken()}` };
const JH = { ...H, "content-type": "application/json" };

const snap = await (await fetch(`${BASE}/settings/classCodes`, { headers: H })).json();
if (snap.error) throw new Error(JSON.stringify(snap.error).slice(0, 300));
const fields = snap.fields || {};
const arr = (k) => (fields[k]?.arrayValue?.values || []).map((v) => v.stringValue);

const before = { codes: arr("codes"), validCodes: arr("validCodes") };
const after = {
  codes: before.codes.filter((c) => KEEP.includes(c)),
  validCodes: before.validCodes.filter((c) => KEEP.includes(c)),
};
// 공백이 섞인 필드명("updatedAt ")이 실제로 있다. 오타 필드라 지운다.
const junkFields = Object.keys(fields).filter((k) => k !== k.trim());

console.log(`프로젝트 ${PROJECT} · ${COMMIT ? "🔴 COMMIT" : "🟢 DRY-RUN"}\n`);
console.log("  codes      전:", JSON.stringify(before.codes));
console.log("             후:", JSON.stringify(after.codes));
console.log("  validCodes 전:", JSON.stringify(before.validCodes));
console.log("             후:", JSON.stringify(after.validCodes));
console.log("  제거될 코드   :", JSON.stringify([
  ...new Set([...before.codes, ...before.validCodes].filter((c) => !KEEP.includes(c))),
]));
console.log("  오타 필드     :", JSON.stringify(junkFields));

if (!COMMIT) {
  console.log("\n🟢 DRY-RUN — 아무것도 바꾸지 않았습니다.");
  process.exit(0);
}

const toStr = (list) => ({ arrayValue: { values: list.map((s) => ({ stringValue: s })) } });
const body = {
  fields: {
    codes: toStr(after.codes),
    validCodes: toStr(after.validCodes),
    updatedAt: { timestampValue: new Date().toISOString() },
  },
};
// updateMask 에 오타 필드도 넣되 body 에서 빼면 삭제된다.
const mask = ["codes", "validCodes", "updatedAt", ...junkFields]
  .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
  .join("&");
const r = await fetch(`${BASE}/settings/classCodes?${mask}`, {
  method: "PATCH", headers: JH, body: JSON.stringify(body),
});
if (!r.ok) throw new Error(`PATCH 실패: ${r.status} ${(await r.text()).slice(0, 300)}`);

const verify = await (await fetch(`${BASE}/settings/classCodes`, { headers: H })).json();
const vf = verify.fields || {};
const vArr = (k) => (vf[k]?.arrayValue?.values || []).map((v) => v.stringValue);
console.log("\n✅ 반영 후 재조회");
console.log("  codes      :", JSON.stringify(vArr("codes")));
console.log("  validCodes :", JSON.stringify(vArr("validCodes")));
console.log("  전체 필드   :", JSON.stringify(Object.keys(vf)));
const leftover = [...vArr("codes"), ...vArr("validCodes")].filter((c) => !KEEP.includes(c));
console.log(leftover.length === 0 ? "✅ 죽은 코드 0" : `❌ 남음: ${JSON.stringify(leftover)}`);
process.exit(leftover.length === 0 ? 0 : 1);
