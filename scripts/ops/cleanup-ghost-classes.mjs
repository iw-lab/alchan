#!/usr/bin/env node
/**
 * 유령 학급·미사용 학급 정리 — **기본은 dry-run**. 실제 삭제는 `--commit` 이 있어야 한다.
 *
 * 배경(2026-08-20 실측):
 *   · `classes` 정본과 실제 사용자가 어긋나 P0-E cutover 를 못 하고 있었다.
 *   · 매시간 도는 경제이벤트가 **사용자 0명인 학급코드**(`미지정`·`6ZVKV3`)에도 쓰기를 날렸다.
 *     라이브에서 `economicEventSettings/미지정` 이 2026-08-20 까지 lastEventAt 을 갱신 중이었다.
 *   · 오타 학급코드가 과거 `governmentSettings`·`goals` 에 화석으로 남아 있었다
 *     (`CLIASS2025`·`Class2025`·`class2025`·`CIASS2025`·`CIQSS2025`·`CLASS2026`·`SUPER`).
 *
 * 삭제 대상은 **아래 상수에 전부 적혀 있다**. 코드가 알아서 판단하지 않는다 —
 * "학생 0명이면 지운다" 같은 규칙은 데이터가 잠깐 이상할 때 살아 있는 학급을 지운다.
 *
 * 안전장치
 *   1. 삭제 전 **전량 JSON 백업**(서브컬렉션 포함)을 남긴다. 백업 실패 시 삭제하지 않는다.
 *   2. 살아 있는 학급(KEEP)에 속한 문서가 삭제 목록에 들어오면 **즉시 중단**한다.
 *   3. dry-run 이 기본. `--commit` 없이는 아무것도 지우지 않는다.
 *
 * 사용:
 *   node scripts/ops/cleanup-ghost-classes.mjs                 # 미리보기
 *   node scripts/ops/cleanup-ghost-classes.mjs --commit        # 실제 삭제
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accessToken } from "./_auth.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const COMMIT = process.argv.includes("--commit");
// ⚠️ 백업은 **저장소 밖**에 쓴다. 이 저장소는 public 이고 덤프에는 학생 실명·이메일이 들어간다.
//    (한 번 커밋되면 이력에서 지우는 데 저장소 재작성이 필요하다 — 실수의 대가가 너무 크다.)
const BACKUP_DIR = process.env.CLEANUP_BACKUP_DIR || join(homedir(), "alchan-backups");

// ── 살아 있는 것. 여기 있는 학급의 문서가 삭제 목록에 섞이면 스크립트가 멈춘다. ──
const KEEP_CLASSES = ["BG6QUC", "9BVPKP"];          // 실사용 2개 학급
const KEEP_TEACHER_ONLY = ["CLASS2025", "XHAWPR"];  // 교사 계정만 있는 학급(계정 보존)

// ── 지울 것 ──────────────────────────────────────────────────────────────────
const DEAD_CLASSES = ["4HQMRS", "ZBEWBZ", "QAZWSX12", "6ZVKV3"];
const DEAD_CODE_FOSSILS = [
  "CLASS2026", "CLIASS2025", "Class2025", "class2025",
  "CIASS2025", "CIQSS2025", "SUPER", "미지정", "2025", "class2026",
];
const ALL_DEAD = [...DEAD_CLASSES, ...DEAD_CODE_FOSSILS];

const DOC_TARGETS = {
  classes: ["4HQMRS", "ZBEWBZ", "6ZVKV3"],
  governmentSettings: [
    "4HQMRS", "ZBEWBZ", "6ZVKV3", "QAZWSX12",
    "CLASS2026", "CLIASS2025", "Class2025", "class2025", "SUPER", "미지정",
  ],
  economicEventSettings: ["4HQMRS", "ZBEWBZ", "6ZVKV3", "QAZWSX12", "미지정"],
  goals: [
    "4HQMRS_goal", "ZBEWBZ_goal", "2025_goal", "CIASS2025_goal", "CIQSS2025_goal",
    "CLASS2026_goal", "CLIASS2025_goal", "Class2025_goal", "SUPER_goal",
    "class2025_goal", "미지정_goal", "current", "mainGoal",
  ],
};
// classCode 필드 값이 ALL_DEAD 인 문서를 지우는 컬렉션.
const FIELD_TARGETS = ["jobs", "storeItems", "commonTasks", "musicRooms"];

// classCode 필드가 **아예 없는** 레거시 문서.
//   ⚠️ 2026-08-20 codex CRITICAL: 종전엔 "classCode 필드가 없으면 지운다"는 규칙으로 돌렸다.
//   그러면 살아 있는 학급의 레거시 문서가 규칙에 걸려도 아래 오염 검사(문자열 매칭)를
//   그냥 통과한다 — `why` 에 학급코드가 안 들어가기 때문이다. 즉 안전장치가 무력하다.
//   그래서 규칙을 없애고 **실측으로 확인한 ID 만** 적는다(이 파일의 다른 목록과 같은 원칙).
//   확인 근거: 전부 createdAt 2025-05-10~27 로, 살아 있는 두 학급(BG6QUC 2026-03-01,
//   9BVPKP 2026-05-12)보다 먼저 만들어졌다 → 이들 소속일 수 없다. 내용도 대부분
//   "ㅇㅇ"·"11"·"121" 같은 초기 테스트 데이터다. 새로 생긴 고아는 이 목록에 없으므로 안 지워진다.
const LEGACY_ORPHANS = {
  jobs: [
    "VokptbjtQdqrbBAymKYy", "aRGKBM6LbHWLBfCge0Ku", "eFIV5jIcxVhuHjCZaYVc",
    "yZGD293TcFAo0yo9TJpQ", "zC0uMSgBWavO4d7vYcmL",
  ],
  storeItems: [
    "D0MpXRggXOmXRuVzyy2x", "ExhXLdf2TY0EAMZd8Bl3", "eAwJJNK31h2lRtLPUKW3",
    "gBMdvDdiuXcThOsU9QeN", "sZLu4qSGltjtGvE1GGy6",
  ],
  commonTasks: [
    "WIMtt44l16HqSSZg8YAo", "sOKn75zDh7GYxjNclGQO",
    "xlcFqoL9YKkTv7wU44Kx", "yjkkYwZNBb7FY6mcXdq9",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
const TOK = await accessToken();
const H = { authorization: `Bearer ${TOK}` };
const JH = { ...H, "content-type": "application/json" };
const id = (d) => d.name.split("/").pop();
const val = (f) => {
  if (!f) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.booleanValue !== undefined) return f.booleanValue;
  return "(complex)";
};

async function listAll(path, mask) {
  const out = []; let pt = "";
  for (let i = 0; i < 300; i++) {
    const u = new URL(`${BASE}/${path}`);
    u.searchParams.set("pageSize", "300");
    if (pt) u.searchParams.set("pageToken", pt);
    if (mask) for (const m of mask) u.searchParams.append("mask.fieldPaths", m);
    const r = await fetch(u, { headers: H });
    if (!r.ok) throw new Error(`list ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    out.push(...(j.documents || []));
    pt = j.nextPageToken || "";
    if (!pt) break;
  }
  return out;
}
async function getDoc(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get ${path}: ${r.status}`);
  return r.json();
}
// ⚠️ 실패를 `[]` 로 삼키면 안 된다(2026-08-20 codex CRITICAL). 조회가 403/500 으로 실패했는데
//    "서브컬렉션 0개"로 읽으면, 백업에 아무것도 안 담긴 채 부모만 지워져 **자식이 백업도 삭제도
//    안 된 고아**로 남는다. "백업 실패 시 삭제 금지"라는 이 스크립트의 약속이 여기서 깨진다.
async function subCollections(docPath) {
  const r = await fetch(`${BASE}/${docPath}:listCollectionIds`, { method: "POST", headers: JH, body: "{}" });
  if (!r.ok) throw new Error(`listCollectionIds ${docPath}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).collectionIds || [];
}
async function deleteDoc(path) {
  const r = await fetch(`${BASE}/${path}`, { method: "DELETE", headers: H });
  if (!r.ok && r.status !== 404) throw new Error(`delete ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/**
 * 문서 하나 + 그 **아래 전부**를 백업용으로 읽어 온다.
 * 종전엔 한 단계만 봤다 — 손자 서브컬렉션이 있으면 백업 없이 지워진다. 재귀로 바꿨다.
 * depth 상한은 폭주 방지용(이 앱의 실제 깊이는 2단계다).
 */
async function dumpDeep(docPath, depth = 0) {
  if (depth > 4) throw new Error(`서브컬렉션 깊이 초과: ${docPath}`);
  const doc = await getDoc(docPath);
  if (!doc) return null;
  const node = { path: docPath, createTime: doc.createTime, fields: doc.fields || {}, sub: {} };
  for (const c of await subCollections(docPath)) {
    node.sub[c] = [];
    for (const d of await listAll(`${docPath}/${c}`)) {
      const child = await dumpDeep(`${docPath}/${c}/${id(d)}`, depth + 1);
      if (child) node.sub[c].push(child);
    }
  }
  return node;
}

/** 백업 트리를 잎(가장 깊은 것)부터 삭제한다. 부모를 먼저 지우면 자식이 고아가 된다. */
async function deleteDeep(node) {
  let n = 0;
  for (const children of Object.values(node.sub)) {
    for (const child of children) n += await deleteDeep(child);
  }
  await deleteDoc(node.path);
  return n + 1;
}

// ── 1) 삭제 대상 수집 ────────────────────────────────────────────────────────
console.log(`프로젝트 ${PROJECT} · ${COMMIT ? "🔴 COMMIT" : "🟢 DRY-RUN"} · ${new Date().toISOString()}\n`);

const victims = [];  // { path, why }

// 1-a. 죽은 학급의 **학생** 문서 (교사·슈퍼관리자 계정은 건드리지 않는다)
const users = await listAll("users", ["classCode", "isAdmin", "isTeacher", "isSuperAdmin", "name"]);
const keptTeachers = [];
for (const d of users) {
  const f = d.fields || {};
  const cc = val(f.classCode);
  if (!DEAD_CLASSES.includes(cc)) continue;
  const isStaff = val(f.isAdmin) === true || val(f.isTeacher) === true || val(f.isSuperAdmin) === true;
  if (isStaff) { keptTeachers.push(`${id(d)} (${val(f.name)}, ${cc})`); continue; }
  victims.push({ path: `users/${id(d)}`, why: `죽은 학급 ${cc} 의 학생 ${val(f.name)}` });
}

// 1-b. 문서 ID 로 지정한 것들
for (const [coll, ids] of Object.entries(DOC_TARGETS)) {
  for (const docId of ids) {
    if (await getDoc(`${coll}/${docId}`)) victims.push({ path: `${coll}/${docId}`, why: `유령 ${coll}` });
  }
}

// 1-c. classCode 값이 죽은 학급인 문서
for (const coll of FIELD_TARGETS) {
  for (const d of await listAll(coll, ["classCode"])) {
    const cc = val(d.fields?.classCode);
    if (cc !== null && ALL_DEAD.includes(cc)) {
      victims.push({ path: `${coll}/${id(d)}`, why: `${coll} — 죽은 학급 ${cc}` });
    }
  }
}

// 1-c'. 명시된 레거시 고아만. **여기서도 classCode 를 다시 확인한다** — 목록을 적은 뒤
//   누군가 그 문서에 살아 있는 학급코드를 붙였다면 지우면 안 된다(목록은 시간이 지나면 낡는다).
for (const [coll, ids] of Object.entries(LEGACY_ORPHANS)) {
  for (const docId of ids) {
    const d = await getDoc(`${coll}/${docId}`);
    if (!d) continue;
    const cc = val(d.fields?.classCode);
    if (cc !== null) {
      console.error(`❌ ${coll}/${docId} 에 classCode="${cc}" 가 생겼습니다 — 목록이 낡았습니다. 중단합니다.`);
      process.exit(1);
    }
    victims.push({ path: `${coll}/${docId}`, why: `${coll} — 2025-05 레거시 고아(classCode 없음)` });
  }
}

// 1-d. settings/salarySettings_{죽은학급}
for (const d of await listAll("settings", ["__name__"])) {
  const n = id(d);
  const m = /^salarySettings_(.+)$/.exec(n);
  if (m && ALL_DEAD.includes(m[1])) victims.push({ path: `settings/${n}`, why: `죽은 학급 급여설정 ${m[1]}` });
}

// ── 2) 안전 검사 — 살아 있는 학급이 섞였는가 ─────────────────────────────────
// ⚠️ 이 검사는 **보조**다. 문자열 매칭은 "why 에 학급코드가 들어 있는 경우"만 잡으므로
//    단독으로는 안전을 보장하지 못한다(2026-08-20 codex CRITICAL). 진짜 안전장치는
//    위쪽의 "판단하지 말고 명시하라" — 모든 대상이 명시 ID 이거나 죽은 classCode 값이다.
const LIVE = [...KEEP_CLASSES, ...KEEP_TEACHER_ONLY];
const contaminated = victims.filter((v) => LIVE.some((k) => v.path.includes(k) || v.why.includes(k)));
if (contaminated.length > 0) {
  console.error("❌ 살아 있는 학급의 문서가 삭제 목록에 있습니다. 중단합니다.");
  for (const c of contaminated) console.error(`   ${c.path}  ← ${c.why}`);
  process.exit(1);
}

// 사람이 읽을 이름을 붙인다(위 미리보기용). 읽기 1회씩이지만 dry-run 은 어차피 백업에서 다시 읽는다.
for (const v of victims) {
  const d = await getDoc(v.path);
  const f = d?.fields || {};
  v.label = val(f.name) ?? val(f.title) ?? val(f.className) ?? val(f.roomName) ?? "";
  if (typeof v.label !== "string") v.label = "";
  if (v.label.length > 18) v.label = v.label.slice(0, 17) + "…";
}

console.log(`삭제 대상 ${victims.length}건`);
const byColl = {};
for (const v of victims) { const c = v.path.split("/")[0]; (byColl[c] ||= []).push(v); }
for (const [c, list] of Object.entries(byColl)) {
  console.log(`\n  [${c}] ${list.length}건`);
  // ⚠️ 이름을 같이 보여준다. path 는 auto-ID 라 사람이 미리보기를 봐도 무엇이 지워지는지
  //    알 수 없다 — "판사"·"급식 우선권" 이 사라지는 걸 눈으로 잡을 단서가 없었다(Gemini).
  for (const v of list.slice(0, 45)) {
    console.log(`    ${v.path.padEnd(46)} ${v.label ? v.label.padEnd(20) : "".padEnd(20)} ${v.why}`);
  }
  if (list.length > 45) console.log(`    … 외 ${list.length - 45}건`);
}
if (keptTeachers.length > 0) {
  console.log(`\n  ⚠️ 보존한 교사 계정 ${keptTeachers.length}건 (죽은 학급 소속이지만 사람의 로그인 계정이라 남깁니다)`);
  for (const t of keptTeachers) console.log(`    ${t}`);
}

// ── 3) 백업 ─────────────────────────────────────────────────────────────────
mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(BACKUP_DIR, `ghost-cleanup-${stamp}.json`);
const dump = [];
for (const v of victims) {
  const node = await dumpDeep(v.path);
  if (node) dump.push({ ...node, why: v.why });
}
writeFileSync(backupPath, JSON.stringify({ project: PROJECT, at: stamp, docs: dump }, null, 1));
const countSub = (n) => Object.values(n.sub).reduce((a, list) => a + list.reduce((b, c) => b + 1 + countSub(c), 0), 0);
const subCount = dump.reduce((s, d) => s + countSub(d), 0);
console.log(`\n💾 백업: ${backupPath}`);
console.log(`   문서 ${dump.length}건 + 서브컬렉션 문서 ${subCount}건`);
// dry-run 도 백업을 **쓴다**. 백업 경로가 실제로 동작하는지 삭제 전에 증명하기 위해서다.
// 다만 "미리보기니까 아무 흔적도 안 남는다"고 오해하면 안 된다 — 이 파일엔 학생 실명·이메일이 있다.
console.log("   ⚠️ 이 파일에는 학생 실명·이메일이 들어 있습니다(저장소 밖에 보관·불필요해지면 삭제).");

if (!COMMIT) {
  console.log("\n🟢 DRY-RUN — 아무것도 지우지 않았습니다. 실제 삭제는 --commit 을 붙이세요.");
  process.exit(0);
}

// ── 4) 삭제 (서브컬렉션 먼저, 그다음 부모) ──────────────────────────────────
// ⚠️ 예외를 잡는다. 종전엔 deleteDoc 이 throw 하면 스크립트가 그 자리에서 죽어
//    **"몇 건이 남았다"는 요약 자체가 안 나왔다**(Gemini WARNING). 실패는 모아서 보고하고
//    재검증까지 반드시 도달한다 — 재실행은 라이브를 다시 스캔하므로 안전하다.
let deleted = 0;
const failures = [];
for (const node of dump) {
  try {
    deleted += await deleteDeep(node);
  } catch (e) {
    failures.push(`${node.path}: ${e.message}`);
  }
}
console.log(`\n🔴 삭제 완료: ${deleted}건`);
if (failures.length > 0) {
  console.error(`⚠️ 삭제 실패 ${failures.length}건 (재실행하면 남은 것만 다시 시도합니다)`);
  for (const f of failures) console.error(`   ${f}`);
}

// ── 5) 재검증 ───────────────────────────────────────────────────────────────
let left = 0;
for (const node of dump) if (await getDoc(node.path)) { console.error(`   남아 있음: ${node.path}`); left++; }
console.log(left === 0 ? "✅ 재조회 결과 전부 삭제됨" : `❌ ${left}건이 남아 있습니다`);
process.exit(left === 0 && failures.length === 0 ? 0 : 1);
