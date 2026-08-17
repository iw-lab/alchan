#!/usr/bin/env node
/** P0 착수 전 라이브 데이터 확인 — 규칙을 조여도 기능이 안 깨지는지 실측. 읽기 전용. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function accessToken() {
  const require = createRequire(import.meta.url);
  const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const api = require(join(gRoot, "firebase-tools/lib/api.js"));
  const store = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: store.tokens.refresh_token, client_id: api.clientId(), client_secret: api.clientSecret(), grant_type: "refresh_token" }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`토큰 실패: ${j.error_description || j.error}`);
  return j.access_token;
}

const TOK = await accessToken();
const H = { authorization: `Bearer ${TOK}` };

async function listAll(coll, mask) {
  const out = []; let pageToken = "";
  for (let i = 0; i < 60; i++) {
    const u = new URL(`${BASE}/${coll}`);
    u.searchParams.set("pageSize", "300");
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    if (mask) for (const m of mask) u.searchParams.append("mask.fieldPaths", m);
    const r = await fetch(u, { headers: H });
    if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 120)}` };
    const j = await r.json();
    out.push(...(j.documents || []));
    pageToken = j.nextPageToken || "";
    if (!pageToken) break;
  }
  return { docs: out };
}
const val = (f) => f && (f.stringValue ?? f.integerValue ?? f.booleanValue ?? null);
const id = (d) => d.name.split("/").pop();

console.log(`프로젝트: ${PROJECT}\n`);

// 1) 학급 코드 목록
const cc = await fetch(`${BASE}/settings/classCodes`, { headers: H }).then(r => r.json());
const arr = (k) => (cc.fields?.[k]?.arrayValue?.values || []).map(v => v.stringValue);
console.log("① settings/classCodes:", JSON.stringify({ codes: arr("codes"), validCodes: arr("validCodes") }));

// 2) users 의 classCode 분포 + CLASS2025 실사용 여부
const users = await listAll("users", ["classCode", "isAdmin", "isSuperAdmin", "isApproved"]);
if (users.error) console.log("② users:", users.error);
else {
  const dist = {};
  let admins = 0, supers = 0, approved = 0;
  for (const d of users.docs) {
    const c = val(d.fields?.classCode) || "(없음)";
    dist[c] = (dist[c] || 0) + 1;
    if (val(d.fields?.isAdmin) === true) admins++;
    if (val(d.fields?.isSuperAdmin) === true) supers++;
    if (val(d.fields?.isApproved) === true) approved++;
  }
  console.log(`② users 총 ${users.docs.length}명 · 교사 ${admins} · 슈퍼 ${supers} · 승인 ${approved}`);
  console.log("   classCode 분포:", JSON.stringify(dist));
}

// 3) 스코프 대상 컬렉션의 classCode 필드 커버리지
for (const coll of ["jobs", "storeItems", "commonTasks", "marketListings", "marketOffers"]) {
  const r = await listAll(coll, ["classCode"]);
  if (r.error) { console.log(`③ ${coll}: ${r.error}`); continue; }
  const missing = r.docs.filter(d => !val(d.fields?.classCode));
  const dist = {};
  for (const d of r.docs) { const c = val(d.fields?.classCode) || "(없음)"; dist[c] = (dist[c] || 0) + 1; }
  console.log(`③ ${coll}: ${r.docs.length}건 · classCode 없음 ${missing.length}건 · ${JSON.stringify(dist)}`);
}

// 4) goals docId 패턴
const goals = await listAll("goals", ["classCode"]);
if (goals.error) console.log("④ goals:", goals.error);
else console.log(`④ goals: ${goals.docs.length}건 · ids=${JSON.stringify(goals.docs.map(id))} · classCode필드=${JSON.stringify(goals.docs.map(d => val(d.fields?.classCode)))}`);

// 5) taxSettings docId
const tax = await listAll("taxSettings", ["__name__"]);
console.log(`⑤ taxSettings: ${tax.error || `${tax.docs.length}건 · ids=${JSON.stringify(tax.docs.map(id))}`}`);

// 6) 죽은 것으로 판정한 컬렉션 실제 문서 수
for (const coll of ["realEstate", "trials", "learningMaterials", "MarketCondition", "auctions"]) {
  const r = await listAll(coll, ["__name__"]);
  console.log(`⑥ ${coll}: ${r.error || `${r.docs.length}건`}`);
}

// 7) 전역 설정 문서 목록
const st = await listAll("settings", ["__name__"]);
console.log(`⑦ settings/*: ${st.error || JSON.stringify(st.docs.map(id))}`);
const ST = await listAll("Settings", ["__name__"]);
console.log(`⑦ Settings/*: ${ST.error || JSON.stringify(ST.docs.map(id))}`);

// 8) laws classCode 분포
const laws = await listAll("laws", ["classCode"]);
if (!laws.error) {
  const dist = {}; for (const d of laws.docs) { const c = val(d.fields?.classCode) || "(없음)"; dist[c] = (dist[c] || 0) + 1; }
  console.log(`⑧ laws: ${laws.docs.length}건 · ${JSON.stringify(dist)}`);
} else console.log("⑧ laws:", laws.error);
