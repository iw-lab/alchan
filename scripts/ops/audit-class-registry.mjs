#!/usr/bin/env node
/**
 * 학급 정본(classes) cutover 전 실측 — 읽기 전용.
 *   · classes 컬렉션 vs users 의 classCode 분포 대조
 *   · settings/classCodes(클라이언트 관리 배열) 와의 3자 대조
 *   · 학급별 마지막 활동 흔적(최근 로그인·거래) — "실제로 쓰는 학급"을 추정이 아니라 데이터로
 * 사용: node scripts/ops/audit-class-registry.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accessToken } from "./_auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOK = await accessToken();
const H = { authorization: `Bearer ${TOK}` };

const val = (f) => {
  if (!f) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return f.timestampValue;
  if (f.nullValue !== undefined) return null;
  return "(complex)";
};
const id = (d) => d.name.split("/").pop();

async function listAll(coll, mask) {
  const out = []; let pageToken = "";
  for (let i = 0; i < 200; i++) {
    const u = new URL(`${BASE}/${coll}`);
    u.searchParams.set("pageSize", "300");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    if (mask) for (const m of mask) u.searchParams.append("mask.fieldPaths", m);
    const r = await fetch(u, { headers: H });
    if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 200)}` };
    const j = await r.json();
    out.push(...(j.documents || []));
    pageToken = j.nextPageToken || "";
    if (!pageToken) break;
  }
  return { docs: out };
}

console.log(`프로젝트: ${PROJECT}  (${new Date().toISOString()})\n`);

// ── ① classes 컬렉션 전문
const classes = await listAll("classes");
console.log("① classes 컬렉션");
if (classes.error) console.log("   " + classes.error);
else if (classes.docs.length === 0) console.log("   (문서 0건)");
else for (const d of classes.docs) {
  const f = d.fields || {};
  const keys = Object.keys(f).sort();
  console.log(`   ${id(d).padEnd(12)} createTime=${d.createTime}  fields={${keys.map(k => `${k}:${JSON.stringify(val(f[k]))}`).join(", ")}}`);
}

// ── ② settings/classCodes
// ⚠️ 상태코드를 봐야 한다. 403/404 를 그냥 json() 하면 fields 가 없어서
//    "코드 0개"로 읽히고, 그 오판 위에 대조표를 그린다(2026-08-20 codex WARNING).
const ccRes = await fetch(`${BASE}/settings/classCodes`, { headers: H });
if (!ccRes.ok) throw new Error(`settings/classCodes 조회 실패: ${ccRes.status} ${(await ccRes.text()).slice(0, 200)}`);
const cc = await ccRes.json();
const arr = (k) => (cc.fields?.[k]?.arrayValue?.values || []).map(v => v.stringValue);
console.log("\n② settings/classCodes (클라이언트 SuperAdminDashboard 가 관리)");
console.log(`   codes      = ${JSON.stringify(arr("codes"))}`);
console.log(`   validCodes = ${JSON.stringify(arr("validCodes"))}`);
console.log(`   그 외 필드 = ${JSON.stringify(Object.keys(cc.fields || {}).filter(k => !["codes", "validCodes"].includes(k)))}`);

// ── ③ users 전량 — classCode 별 집계 + 활동 흔적
const users = await listAll("users", [
  "classCode", "isAdmin", "isTeacher", "isSuperAdmin", "isApproved",
  "name", "cash", "createdAt", "lastLogin", "lastLoginAt", "updatedAt", "email", "studentNumber",
]);
console.log(`\n③ users (${users.error || users.docs.length + "명"})`);
const byClass = new Map();
if (!users.error) {
  for (const d of users.docs) {
    const f = d.fields || {};
    const c = val(f.classCode) ?? "(classCode 필드 없음)";
    if (!byClass.has(c)) byClass.set(c, []);
    byClass.get(c).push({
      uid: id(d),
      name: val(f.name),
      admin: val(f.isAdmin) === true,
      teacher: val(f.isTeacher) === true,
      superAdmin: val(f.isSuperAdmin) === true,
      approved: val(f.isApproved),
      cash: val(f.cash),
      createTime: d.createTime,
      updateTime: d.updateTime,
      lastLogin: val(f.lastLogin) ?? val(f.lastLoginAt),
      email: val(f.email),
    });
  }
  const rows = [...byClass.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [code, list] of rows) {
    const students = list.filter((u) => !u.admin && !u.superAdmin && !u.teacher);
    const teachers = list.filter((u) => u.admin || u.teacher);
    const supers = list.filter((u) => u.superAdmin);
    const lastUpdate = list.map((u) => u.updateTime).sort().pop();
    console.log(`   ${String(code).padEnd(24)} 총 ${String(list.length).padStart(3)}명 (학생 ${String(students.length).padStart(2)} · 교사 ${teachers.length} · 슈퍼 ${supers.length})  최근 user 문서 갱신: ${lastUpdate}`);
  }
}

// ── ④ 소규모/의심 학급 상세
console.log("\n④ 인원 5명 이하 학급의 사용자 상세");
for (const [code, list] of byClass) {
  if (list.length > 5) continue;   // 교사 포함 전체 인원 기준(소규모 학급을 눈으로 보려는 것)
  console.log(`   ── ${code}`);
  for (const u of list) {
    console.log(`      uid=${u.uid}`);
    console.log(`         name=${JSON.stringify(u.name)} admin=${u.admin} teacher=${u.teacher} super=${u.superAdmin} approved=${u.approved} cash=${u.cash}`);
    console.log(`         email=${JSON.stringify(u.email)} create=${u.createTime} update=${u.updateTime} lastLogin=${JSON.stringify(u.lastLogin)}`);
  }
}

// ── ⑤ 3자 대조
console.log("\n⑤ 3자 대조 (classes 문서 · settings/classCodes · 실제 users)");
const regSet = new Set(classes.error ? [] : classes.docs.map(id));
const codesSet = new Set([...arr("codes"), ...arr("validCodes")]);
const userStudentCodes = new Set();
const userAnyCodes = new Set();
for (const [code, list] of byClass) {
  if (code === "(classCode 필드 없음)") continue;
  userAnyCodes.add(code);
  if (list.some((u) => !u.admin && !u.superAdmin && !u.teacher)) userStudentCodes.add(code);
}
const all = [...new Set([...regSet, ...codesSet, ...userAnyCodes])].sort();
console.log("   코드            classes  settings  학생수  교사수");
for (const c of all) {
  const list = byClass.get(c) || [];
  const st = list.filter((u) => !u.admin && !u.superAdmin && !u.teacher).length;
  const tc = list.filter((u) => u.admin || u.teacher).length;
  console.log(`   ${c.padEnd(15)} ${regSet.has(c) ? "  ✅  " : "  ❌  "}   ${codesSet.has(c) ? " ✅ " : " ❌ "}     ${String(st).padStart(3)}    ${String(tc).padStart(3)}`);
}
console.log(`\n   ⚠️ classes 없는데 학생 있음: ${JSON.stringify([...userStudentCodes].filter((c) => !regSet.has(c)))}`);
console.log(`   ⚠️ classes 에만 있고 사용자 0: ${JSON.stringify([...regSet].filter((c) => !userAnyCodes.has(c)))}`);
console.log(`   ⚠️ settings 에만 있고 사용자 0: ${JSON.stringify([...codesSet].filter((c) => !userAnyCodes.has(c)))}`);
