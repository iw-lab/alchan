// scripts/ops/deidentify-2026-09-17.mjs
// 학생 실명을 표시용 별명으로 갈아끼우고, 교사 문서의 학교명·학급명을 파기한다.
//
// 왜 (2026-09-17 실측):
//   학생 62명 중 28명(45%)이 닉네임 칸에 자기 실명을 적었고, 그 이름이 16개 컬렉션
//   4,648개 문서에 **복사돼** 있었다(상점 주인·판매자·신고자·결재 대기…).
//   교사 문서의 schoolName·className 은 어느 화면에서도 읽지 않는데 classCode 로 이으면
//   "○○초 5학년 3반 누구"가 된다. 화면에서 감추는 걸로는 아무것도 안 줄어든다 — 지워야 한다.
//
// 🔴 **계획 파일이 이 스크립트의 심장이다**(2026-09-17 교차검증 3계열 만장일치 지적).
//    첫 판은 매 실행마다 별명을 새로 뽑았다. 그러면 중간에 실패하고 재실행할 때
//    ① 학생은 다른 별명을 받고 ② `users.name` 은 이미 별명으로 바뀐 뒤라 **옛 이름→uid 역색인이
//    사라져** 못 고친 문서의 실명이 영구히 남는다. "고쳤다"는 보고와 함께.
//    그래서 쓰기 **전에** uid→(별명, 옛 이름)을 파일로 굳히고, 재실행은 그 파일에서 복원한다.
//
// 용법:
//   node scripts/ops/deidentify-2026-09-17.mjs                 # 드라이런(기본)
//   node scripts/ops/deidentify-2026-09-17.mjs --apply         # 적용(계획 파일 생성·재사용)
//   node scripts/ops/deidentify-2026-09-17.mjs --plan=경로     # 계획 파일 위치 지정
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { firestoreBase, authHeaders, plain } from "./_firestore-rest.mjs";
import { makeAlias, buildDisplayName } from "../../src/utils/alias.js";

const APPLY = process.argv.includes("--apply");
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) || d;
// 🔴 기본 경로를 고정한다. timestamp 가 붙으면 재실행이 이전 계획을 못 찾는다 — 그 순간
//    위에 적은 "역색인 소실"이 그대로 재현된다.
const PLAN_PATH = arg("plan", "scripts/ops/.deidentify-plan.json");

const ORPHAN_LABEL = "이전 학생";
// 계정 ID 꼴(alchan01 등)은 실명이 아니다 — 익명표기로 덮으면 정보만 잃는다.
const ID_LIKE = /^[A-Za-z0-9._@-]+$/;
// 사람 이름꼴. 별명은 "빠른 다람쥐"처럼 띄어쓰기가 있어 여기 안 걸린다.
const PERSON_NAME = /^[가-힣]{2,4}$/;

// 사람 이름 필드 ↔ 그 사람의 uid 필드.
// (itemName·taskName·productName·stockName·propertyName·prizeName 은 물건이라 건드리지 않는다 —
//  2026-09-17 전 컬렉션 *Name 전수조사로 확인.)
const SPEC = {
  activities: [["userName", "userId"], ["buyerName", "buyerId"], ["sellerName", "sellerId"]],
  courtComplaints: [["complainantName", "complainantId"], ["defendantName", "defendantId"]],
  groupPurchases: [["initiatorName", "initiatorId"], ["winnerName", "winnerId"]],
  inventory: [["lastGiftFromName", null], ["receivedFromName", null]],
  jobApplications: [["studentName", "studentId"]],
  marketListings: [["sellerName", "sellerId"], ["buyerName", "buyerId"]],
  marketOffers: [["buyerName", "buyerId"]],
  personalShops: [["ownerName", "ownerId"]],
  policeReports: [["reporterName", "reporterId"], ["processedByName", "processedById"], ["reportedUserName", "reportedUserId"]],
  realEstateOffers: [["ownerName", "ownerId"], ["buyerName", "buyerId"]],
  realEstateProperties: [["ownerName", "ownerId"], ["tenantName", "tenantId"], ["tenant", "tenantId"]],
  pendingApprovals: [["studentName", "studentId"]],
  auctions: [["sellerName", "sellerId"]],
  trialResults: [["judgeName", "judgeId"]],
};
const ROOT_ONLY = new Set(["users", "classes", "personalShops"]);

// 🔴 **이름은 이름 필드에만 있지 않다**(2026-09-17 1차 적용 후 검증에서 발견).
//    이름 필드 4,497건을 다 고치고도 학생 실명이 1,024건 남아 있었다 — 거래 설명문,
//    고소 사유, 신고 내용, 상품 설명처럼 **사람이 쓴 문장 속**에 들어 있었기 때문이다.
//    "이름 칼럼을 다 고쳤다"는 것과 "이름이 사라졌다"는 것은 다른 말이다.
const FREETEXT = {
  transactions: ["description"],
  courtComplaints: ["reason", "desiredResolution"],
  inventory: ["description", "name"],
  policeReports: ["details", "reason"],
  personalShops: ["description"],
  activities: ["productName"],
};
const HANGUL = /[가-힣]/;
// 이름 뒤에 붙는 조사·호칭. 2자 이름은 보통 낱말에 섞일 수 있어 경계를 본다.
// 「라고」(인용) 처럼 흔한 조사가 빠지면 그 한 건이 그대로 남는다 — 실측으로 하나씩 메웠다.
const PARTICLE = /^(이|가|은|는|을|를|에|의|와|과|님|씨|도|만|랑|한|께|아|야|네|라|고|보|처)/;

/** 문장 속 실명을 새 표시명으로 바꾼다. 긴 이름부터 — 짧은 이름이 긴 이름을 잘라먹지 않게. */
function scrubText(text, renames) {
  let out = String(text);
  for (const [name, neo] of renames) {
    if (!out.includes(name)) continue;
    if (name.length >= 3) { out = out.split(name).join(neo); continue; }
    // 2자 이름은 보통 낱말에 섞일 수 있어 경계를 본다.
    // 🔴 앞 글자가 한글이라고 무조건 건너뛰면 **성(姓)이 붙은 진짜 이름을 놓친다** —
    //    1차 적용 후 남은 22건이 전부 "김◆◆님에게 송금" 꼴이었다(2026-09-17 실측).
    //    그래서 앞 글자가 한글이고 **그 앞은 한글이 아닐 때**(= 낱말의 시작)는
    //    그 한 글자까지 이름으로 보고 같이 지운다. 성만 남겨두면 지운 의미가 없다.
    let res = "";
    let i = 0;
    while (i < out.length) {
      if (out.startsWith(name, i)) {
        const before = i > 0 ? out[i - 1] : "";
        const before2 = i > 1 ? out[i - 2] : "";
        const after = out.slice(i + name.length);
        const okAfter = after === "" || !HANGUL.test(after[0]) || PARTICLE.test(after);
        if (okAfter) {
          if (!HANGUL.test(before)) { res += neo; i += name.length; continue; }
          if (!HANGUL.test(before2)) { res = res.slice(0, -1) + neo; i += name.length; continue; }
        }
      }
      res += out[i]; i += 1;
    }
    out = res;
  }
  return out;
}

// ── REST ────────────────────────────────────────────────────────────────────
async function queryAll(col, headers, { pageSize = 300 } = {}) {
  const out = [];
  let cursor = null;
  // limit 로 잘린 걸 모르고 "다 봤다"고 하면 마이그레이션이 조용히 일부만 돈다.
  for (let guard = 0; guard < 2000; guard++) {
    const sq = {
      from: [{ collectionId: col, allDescendants: !ROOT_ONLY.has(col) }],
      orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
      limit: pageSize,
    };
    if (cursor) sq.startAt = { values: [{ referenceValue: cursor }], before: false };
    const res = await fetch(`${firestoreBase()}:runQuery`, {
      method: "POST", headers, body: JSON.stringify({ structuredQuery: sq }),
    });
    const j = await res.json();
    if (!Array.isArray(j)) throw new Error(`${col} 조회 실패: ${JSON.stringify(j).slice(0, 300)}`);
    const docs = j.filter((r) => r.document);
    if (!docs.length) break;
    for (const d of docs) out.push({ name: d.document.name, fields: plain(d.document.fields), updateTime: d.document.updateTime });
    if (docs.length < pageSize) break;
    cursor = docs[docs.length - 1].document.name;
  }
  return out;
}

async function commitBatch(writes, headers) {
  const res = await fetch(`${firestoreBase()}:commit`, { method: "POST", headers, body: JSON.stringify({ writes }) });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

const strUpdate = (name, updateTime, setFields) => ({
  update: { name, fields: Object.fromEntries(Object.entries(setFields).map(([k, v]) => [k, { stringValue: v }])) },
  updateMask: { fieldPaths: Object.keys(setFields) },
  currentDocument: { updateTime },
});

// ── 1) 사용자 + 계획 ─────────────────────────────────────────────────────────
const headers = await authHeaders();
console.log(APPLY ? "🔴 적용 모드" : "🔵 드라이런 (적용하려면 --apply)");

const users = await queryAll("users", headers);
const plan = existsSync(PLAN_PATH) ? JSON.parse(readFileSync(PLAN_PATH, "utf-8")) : { createdAt: new Date().toISOString(), aliases: {} };
const reused = Object.keys(plan.aliases).length;

const newNameByUid = new Map();     // 학생 uid → 새 표시명
const nonStudentUids = new Set();   // 교사·관리자 uid (이름을 건드리지 않는다)
const knownUids = new Set();
const liveNames = new Set();        // 지금 살아있는 모든 이름(교사 실명 보호용)
const students = [];

for (const u of users) {
  const uid = u.name.split("/").pop();
  const f = u.fields;
  knownUids.add(uid);
  for (const k of ["name", "nickname"]) {
    const v = String(f[k] || "").trim();
    if (v) liveNames.add(v);
  }
  if (f.isTeacher || f.isAdmin || f.isSuperAdmin) { nonStudentUids.add(uid); continue; }
  // 계획에 있으면 **그것을 쓴다** — 재실행에서 별명이 바뀌면 안 된다.
  const prior = plan.aliases[uid];
  const alias = prior?.alias || makeAlias();
  const display = prior?.display || buildDisplayName(f.studentNumber, alias);
  // 옛 이름도 계획이 정본이다. 이미 한 번 돌아 users.name 이 별명이면 라이브에는 옛 이름이 없다.
  const oldName = prior?.oldName ?? String(f.name || "").trim();
  // 🔴 옛 **닉네임**도 계획에 남긴다. 1차 적용 때 uid 없는 필드(선물 보낸 사람 등)에 담긴
  //    옛 닉네임은 그 시점엔 아직 `liveNames` 에 있어 건너뛰었고, 적용 직후 stale 이 되면서
  //    "누군지 모르는 이름"으로 보이게 된다. 계획이 기억하면 그 학생의 새 별명으로 이어진다.
  const oldNick = prior?.oldNick ?? String(f.nickname || "").trim();
  plan.aliases[uid] = { alias, display, oldName, oldNick };
  newNameByUid.set(uid, display);
  students.push({ uid, doc: u, fields: f, alias, display });
}

// 별명이 누군가의 실명을 품으면 실명 잔존이다(예: 실명이 어휘와 겹치는 경우).
const allOldNames = Object.values(plan.aliases).map((a) => a.oldName).filter(Boolean);
for (const s of students) {
  let guard = 0;
  while (allOldNames.some((n) => n.length >= 2 && s.display.includes(n)) && guard++ < 50) {
    s.alias = makeAlias();
    s.display = buildDisplayName(s.fields.studentNumber, s.alias);
    plan.aliases[s.uid] = { alias: s.alias, display: s.display, oldName: plan.aliases[s.uid].oldName };
    newNameByUid.set(s.uid, s.display);
  }
}

// 옛 이름 → uid. **f.name 만** 쓴다(닉네임은 "다람쥐" 같은 보통명사일 수 있어 엉뚱한 필드를 물어간다).
// 동명이인은 누구인지 정할 수 없다 — 특정 학생에게 붙이지 말고 익명표기로 보낸다.
const oldNameToUid = new Map();
const ambiguousOldNames = new Set();
for (const [uid, a] of Object.entries(plan.aliases)) {
  for (const k of [a.oldName, a.oldNick]) {
    if (!k) continue;
    if (oldNameToUid.has(k) && oldNameToUid.get(k) !== uid) ambiguousOldNames.add(k);
    else oldNameToUid.set(k, uid);
  }
}
for (const k of ambiguousOldNames) oldNameToUid.delete(k);

if (APPLY) {
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 1), "utf-8");
  console.log(`📌 계획 파일 ${PLAN_PATH} (재사용 ${reused}건 / 총 ${Object.keys(plan.aliases).length}건)`);
}
console.log(`학생 ${students.length}명 · 교사/관리자 ${nonStudentUids.size}명 · 동명이인 ${ambiguousOldNames.size}개(익명표기로 보냄)`);

// ── 2) 가게 주인 ─────────────────────────────────────────────────────────────
const shops = await queryAll("personalShops", headers);
const shopOwnerUid = new Map();
for (const s of shops) if (s.fields.ownerId) shopOwnerUid.set(s.name.split("/").pop(), s.fields.ownerId);

// 가게 이름은 자유 입력이라 "민재네 가게"처럼 이름 일부만 들어가기도 한다.
// 🔴 **주인이 확인될 때만 그 주인의 이름으로 판단한다.** 전체 학생 이름과 부분 대조하면
//    "하나문구" 같은 무관한 상호가 엉뚱한 학생 가게로 바뀐다(교차검증 3계열 지적).
const rewriteShopName = (shopName, ownerUid) => {
  const s = String(shopName || "").trim();
  if (!s) return null;
  if (ownerUid && newNameByUid.has(ownerUid)) {
    const own = plan.aliases[ownerUid]?.oldName || "";
    const part = PERSON_NAME.test(own) && own.length >= 3 ? own.slice(1) : "";
    if ((own && s.includes(own)) || (part.length >= 2 && s.includes(part))) return `${newNameByUid.get(ownerUid)}의 가게`;
    return null;
  }
  if (ownerUid && nonStudentUids.has(ownerUid)) return null;
  // 주인을 모르는 가게(계정이 지워진 학생) — 이름꼴이 섞여 있으면 익명으로 덮는다.
  for (const n of allOldNames) {
    if (!n || n.length < 2) continue;
    const part = PERSON_NAME.test(n) && n.length >= 3 ? n.slice(1) : "";
    if (s.includes(n) || (part.length >= 2 && s.includes(part))) return `${ORPHAN_LABEL}의 가게`;
  }
  return null;
};

// ── 3) 쓰기 계획 ─────────────────────────────────────────────────────────────
const backup = { at: new Date().toISOString(), users: [], docs: [] };
const writes = [];
const stat = {};
const bump = (k) => { stat[k] = (stat[k] || 0) + 1; };

for (const s of students) {
  if (s.fields.name === s.display && s.fields.nickname === s.alias && s.fields.hasSetNickname === false) continue; // 이미 끝남
  backup.users.push({ uid: s.uid, name: s.fields.name, nickname: s.fields.nickname, hasSetNickname: s.fields.hasSetNickname });
  writes.push({
    update: { name: s.doc.name, fields: { name: { stringValue: s.display }, nickname: { stringValue: s.alias }, hasSetNickname: { booleanValue: false } } },
    updateMask: { fieldPaths: ["name", "nickname", "hasSetNickname"] },
    currentDocument: { updateTime: s.doc.updateTime },
  });
  bump("users(학생 이름 교체)");
}

for (const u of users) {
  const uid = u.name.split("/").pop();
  if (!nonStudentUids.has(uid)) continue;
  const has = ["schoolName", "className"].filter((k) => u.fields[k] !== undefined);
  if (!has.length) continue;
  backup.users.push({ uid, schoolName: u.fields.schoolName, className: u.fields.className });
  writes.push({ update: { name: u.name, fields: {} }, updateMask: { fieldPaths: has }, currentDocument: { updateTime: u.updateTime } });
  bump("users(교사 학교정보 파기)");
}

const classes = await queryAll("classes", headers);
for (const c of classes) {
  const has = ["schoolName", "className"].filter((k) => c.fields[k] !== undefined);
  if (!has.length) continue;
  backup.docs.push({ path: c.name, before: { schoolName: c.fields.schoolName, className: c.fields.className } });
  writes.push({ update: { name: c.name, fields: {} }, updateMask: { fieldPaths: has }, currentDocument: { updateTime: c.updateTime } });
  bump("classes(학교정보 파기)");
}

for (const [col, pairs] of Object.entries(SPEC)) {
  const docs = await queryAll(col, headers);
  for (const d of docs) {
    const set = {};
    const before = {};
    for (const [nameField, idField] of pairs) {
      const cur = d.fields[nameField];
      if (typeof cur !== "string" || !cur.trim()) continue;
      const uid = idField ? d.fields[idField] : null;
      let neo = null;
      if (uid) {
        // 🔴 uid 가 있으면 **uid 만** 믿는다. 맵에 없다고 이름으로 되짚으면
        //    교사·전학생·동명이인이 엉뚱한 학생 별명을 뒤집어쓴다(3계열 공통 지적).
        if (newNameByUid.has(uid)) neo = newNameByUid.get(uid);
        else if (nonStudentUids.has(uid)) neo = null;                 // 교사·관리자는 그대로
        else if (!ID_LIKE.test(cur.trim())) neo = ORPHAN_LABEL;       // 계정이 사라진 사람
      } else {
        const hit = oldNameToUid.get(cur.trim());
        if (hit && newNameByUid.has(hit)) neo = newNameByUid.get(hit);
        else if (liveNames.has(cur.trim())) neo = null;               // 살아있는 누군가(교사 등)
        else if (!ID_LIKE.test(cur.trim())) neo = ORPHAN_LABEL;
      }
      if (neo && neo !== cur) { set[nameField] = neo; before[nameField] = cur; }
    }
    if (typeof d.fields.shopName === "string" && d.fields.shopName.trim()) {
      const ownerUid = d.fields.ownerId || shopOwnerUid.get(d.fields.shopId) || null;
      const neo = rewriteShopName(d.fields.shopName, ownerUid);
      if (neo && neo !== d.fields.shopName) { set.shopName = neo; before.shopName = d.fields.shopName; }
    }
    if (!Object.keys(set).length) continue;
    backup.docs.push({ path: d.name, before });
    writes.push(strUpdate(d.name, d.updateTime, set));
    for (const k of Object.keys(set)) bump(`${col}.${k}`);
  }
}

// 자유 서술 필드: 문장 속 실명 치환
const renames = Object.values(plan.aliases)
  .filter((a) => PERSON_NAME.test(a.oldName || ""))
  .map((a) => [a.oldName, a.display])
  .sort((x, y) => y[0].length - x[0].length);   // 긴 이름 먼저
for (const [col, fields] of Object.entries(FREETEXT)) {
  const docs = await queryAll(col, headers);
  for (const d of docs) {
    const set = {};
    const before = {};
    for (const f of fields) {
      const cur = d.fields[f];
      if (typeof cur !== "string" || !cur.trim()) continue;
      const neo = scrubText(cur, renames);
      if (neo !== cur) { set[f] = neo; before[f] = cur; }
    }
    if (!Object.keys(set).length) continue;
    backup.docs.push({ path: d.name, before });
    writes.push(strUpdate(d.name, d.updateTime, set));
    for (const k of Object.keys(set)) bump(`${col}.${k}(서술문)`);
  }
}

// ── 4) 보고 ─────────────────────────────────────────────────────────────────
console.log("\n── 바꿀 것 ──");
for (const [k, v] of Object.entries(stat).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log(`  합계 쓰기: ${writes.length}건`);

const backupPath = `${PLAN_PATH}.backup-${Date.now()}.json`;
if (APPLY) {
  writeFileSync(backupPath, JSON.stringify(backup, null, 1), "utf-8");
  console.log(`\n💾 백업(원본 값 포함): ${backupPath}`);
  console.log("   ⚠️ 이 파일에는 실명이 들어 있다. 확인이 끝나면 지울 것.");
}

if (!APPLY) { console.log("\n🔵 드라이런이라 아무것도 쓰지 않았다."); process.exit(0); }
if (!writes.length) { console.log("\n✅ 바꿀 것이 없다(이미 끝난 상태)."); process.exit(0); }

// ── 5) 적용 ─────────────────────────────────────────────────────────────────
// 전제조건(updateTime)이 어긋나면 그 배치 전체가 안 써진다. 실패를 세고, 남으면 비정상 종료해
// **재실행을 강제한다** — 조용히 지나가면 실명이 남은 채로 초록불이 뜬다(3계열 지적).
const SIZE = 50;
let done = 0;
const failedChunks = [];
for (let i = 0; i < writes.length; i += SIZE) {
  const chunk = writes.slice(i, i + SIZE);
  try { await commitBatch(chunk, headers); done += chunk.length; }
  catch (e) { failedChunks.push({ i, n: chunk.length, msg: e.message.slice(0, 160) }); }
  if ((i / SIZE) % 10 === 0) console.log(`  ... ${done}/${writes.length}`);
}
console.log(`\n적용 ${done}건 · 실패 ${failedChunks.length}배치`);
for (const f of failedChunks) console.error(`  ⚠️ ${f.i}~${f.i + f.n}: ${f.msg}`);
if (failedChunks.length) {
  console.error("\n❌ 일부가 안 써졌다. 같은 명령을 다시 실행하라 — 계획 파일이 있어 별명은 그대로 이어진다.");
  process.exit(1);
}
console.log("✅ 전부 적용됨.");
