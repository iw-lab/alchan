#!/usr/bin/env node
/**
 * 삭제된 학급의 **Auth 계정**을 정리한다 — 기본 dry-run, `--commit` 필요.
 *
 * 배경: 2026-08-20 유령 학급 정리에서 Firestore 문서만 지웠다. Auth 계정이 남아 있으면
 * 그 계정으로 로그인은 되는데 users 문서가 없어 앱이 빈 상태로 뜬다(AuthContext 가
 * migrateUserDoc 을 부르지만 이메일로 찾을 문서가 없어 아무것도 못 만든다 — 확인함).
 * 남겨도 조용하지만, 쓸 수 없는 계정을 남겨 둘 이유도 없다.
 *
 * 대상은 **백업 JSON 에 기록된 것만**이다. 라이브를 다시 훑어서 판단하지 않는다 —
 * 지울 계정 목록은 이미 그때 확정됐고, 지금 다시 계산하면 그 사이 생긴 계정이 섞인다.
 *
 * 사용:
 *   node scripts/ops/purge-auth-accounts.mjs <백업.json> [--extra-uid <uid>:<이메일> ...]
 *   node scripts/ops/purge-auth-accounts.mjs <백업.json> --commit
 *
 * ⚠️ `--extra-uid` 는 **백업에 없는 계정**을 지운다 = 위 안전검사가 원리적으로 무력하다
 *    (대상이 애초에 Firestore 문서가 없는 고아 계정이라 "문서 살아있나" 검사를 늘 통과한다).
 *    그래서 이메일을 함께 적게 하고, Auth 가 돌려준 실제 이메일과 대조한 뒤에만 지운다.
 *    uid 를 잘못 적으면 이메일이 어긋나 중단된다 — 오타로 남의 계정을 지우는 걸 막는 유일한 벽.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accessToken } from "./_auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const backupPath = argv.find((a) => a.endsWith(".json"));
if (!backupPath) {
  console.error("사용법: node scripts/ops/purge-auth-accounts.mjs <백업.json> [--extra-uid <uid>] [--commit]");
  process.exit(2);
}
// `--extra-uid <uid>:<이메일>` — 이메일 대조는 선택이 아니라 필수다(위 주석 참조).
const extraSpecs = argv.reduce((acc, a, i) => (a === "--extra-uid" && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const extraExpect = new Map();
for (const spec of extraSpecs) {
  const at = spec.indexOf(":");
  if (at < 1 || !spec.slice(at + 1).includes("@")) {
    console.error(`❌ --extra-uid 는 "<uid>:<이메일>" 형식이어야 합니다 — 받은 값: ${spec}`);
    process.exit(2);
  }
  extraExpect.set(spec.slice(0, at), spec.slice(at + 1).trim().toLowerCase());
}
const extraUids = [...extraExpect.keys()];

const TOK = await accessToken();
const H = { authorization: `Bearer ${TOK}`, "content-type": "application/json" };
const IDT = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}`;

const backup = JSON.parse(readFileSync(backupPath, "utf8"));
const fromBackup = backup.docs.filter((d) => d.path.startsWith("users/")).map((d) => d.path.split("/")[1]);
const uids = [...new Set([...fromBackup, ...extraUids])];
console.log(`프로젝트 ${PROJECT} · ${COMMIT ? "🔴 COMMIT" : "🟢 DRY-RUN"}`);
console.log(`백업 ${backupPath}\n  users 문서 ${fromBackup.length}건 + 추가 지정 ${extraUids.length}건 = 대상 ${uids.length}건\n`);

// ── 안전검사: 이 uid 가 아직 Firestore 에 살아 있으면 지우지 않는다 ──
//   (계정만 지우고 문서가 남으면 그 학생은 영영 로그인 못 하는 유령이 된다)
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const stillAlive = [];
for (const uid of uids) {
  const r = await fetch(`${FS}/users/${uid}`, { headers: { authorization: `Bearer ${TOK}` } });
  if (r.ok) stillAlive.push(uid);
  else if (r.status !== 404) throw new Error(`users/${uid} 조회 실패: ${r.status}`);
}
if (stillAlive.length > 0) {
  console.error("❌ 아직 Firestore users 문서가 살아 있는 uid 가 있습니다 — 중단합니다.");
  console.error("   (문서를 먼저 지우거나, 이 계정을 대상에서 빼세요)");
  for (const u of stillAlive) console.error(`   ${u}`);
  process.exit(1);
}

// ── 현재 Auth 상태 조회 ──
const look = await (await fetch(`${IDT}/accounts:lookup`, { method: "POST", headers: H, body: JSON.stringify({ localId: uids }) })).json();
if (look.error) throw new Error(JSON.stringify(look.error).slice(0, 300));
const found = look.users || [];
console.log(`Auth 계정 실재 ${found.length}건 / 이미 없음 ${uids.length - found.length}건`);
const everLoggedIn = found.filter((u) => u.lastLoginAt);
console.log(`  로그인 이력 있음 ${everLoggedIn.length}건:`);
for (const u of everLoggedIn) {
  console.log(`    ${u.localId}  ${u.email || "(이메일 없음)"}  마지막 로그인 ${new Date(Number(u.lastLoginAt)).toISOString()}`);
}
console.log(`  로그인 이력 없음 ${found.length - everLoggedIn.length}건`);

// ── 추가 지정분은 이메일까지 맞아야 지운다 ──
const mismatched = [];
for (const [uid, expected] of extraExpect) {
  const acct = found.find((u) => u.localId === uid);
  if (!acct) {
    console.log(`  · 추가 지정 ${uid} — Auth 에 없음(지울 것 없음)`);
    continue;
  }
  const actual = (acct.email || "").toLowerCase();
  if (actual !== expected) mismatched.push(`${uid}: 적으신 ${expected} ≠ 실제 ${actual || "(이메일 없음)"}`);
  else console.log(`  · 추가 지정 ${uid} — 이메일 일치(${actual})`);
}
if (mismatched.length > 0) {
  console.error("\n❌ 추가 지정한 uid 의 이메일이 어긋납니다 — 아무것도 지우지 않고 중단합니다.");
  for (const m of mismatched) console.error(`   ${m}`);
  process.exit(1);
}

if (!COMMIT) {
  console.log("\n🟢 DRY-RUN — 아무것도 지우지 않았습니다. 실제 삭제는 --commit 을 붙이세요.");
  process.exit(0);
}

// 지우기 전 계정 메타를 남긴다(되돌릴 수는 없지만 "무엇이 있었는지"는 남아야 한다).
// dry-run 에서는 쓰지 않는다 — 지운 게 없는데 백업만 쌓이면 어느 게 진짜 삭제 기록인지 흐려진다.
// ⚠️ 백업의 `at` 은 파일명용 스탬프(`2026-08-20T03-10-27-306Z`)라 Date 로 못 읽는다.
//    파싱하려다 RangeError 로 죽었었다 — 그냥 지금 시각을 쓴다.
const metaPath = join(
  homedir(),
  "alchan-backups",
  `auth-purge-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
writeFileSync(metaPath, JSON.stringify({ project: PROJECT, sourceBackup: backupPath, uids, accounts: found }, null, 1));
console.log(`\n💾 계정 메타 백업: ${metaPath}`);

// ── batchDelete 는 한 번에 최대 1000개 ──
const targets = found.map((u) => u.localId);
if (targets.length === 0) {
  console.log("\n지울 계정이 없습니다.");
  process.exit(0);
}
const del = await (await fetch(`${IDT}/accounts:batchDelete`, {
  method: "POST", headers: H,
  body: JSON.stringify({ localIds: targets, force: true }),
})).json();
if (del.error) throw new Error(JSON.stringify(del.error).slice(0, 400));
const errs = del.errors || [];
console.log(`\n🔴 삭제 요청 ${targets.length}건 · 실패 ${errs.length}건`);
// ⚠️ index 만 찍으면 사고 조사 때 사람이 배열과 손으로 대조해야 한다(그 배열은 출력도 안 된다).
//    이 스크립트의 존재 이유가 "무엇이 지워졌나"를 남기는 것이므로 uid·이메일까지 함께 찍는다.
for (const e of errs) {
  const uid = targets[e.index] || `(index ${e.index})`;
  const email = found[e.index]?.email || "이메일 없음";
  console.error(`   ${uid} (${email}): ${e.message}`);
}

// ── 재검증 ──
const re = await (await fetch(`${IDT}/accounts:lookup`, { method: "POST", headers: H, body: JSON.stringify({ localId: targets }) })).json();
const left = (re.users || []).length;
console.log(left === 0 ? "✅ 재조회 결과 전부 삭제됨" : `❌ ${left}건이 남아 있습니다`);
process.exit(left === 0 && errs.length === 0 ? 0 : 1);
