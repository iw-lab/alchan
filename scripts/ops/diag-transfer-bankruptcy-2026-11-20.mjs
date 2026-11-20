#!/usr/bin/env node
/** 대통령 보내기·가져오기 / 파산 신청 실측 — 읽기 전용. 이름·학급코드는 터미널에만 찍는다(저장 안 함). */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOCS}`;

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
const H = { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" };

const val = (v) => {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(val);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, val(x)]));
  return undefined;
};
const doc = (d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, val(x)])) });

async function q(coll, filters, { parent = "", limit = 500, order } = {}) {
  const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
  const body = { structuredQuery: { from: [{ collectionId: coll }], where, limit } };
  if (order) body.structuredQuery.orderBy = order;
  const r = await fetch(`${BASE}${parent}:runQuery`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  if (j[0]?.error) throw new Error(JSON.stringify(j[0].error).slice(0, 300));
  return j.filter((x) => x.document).map((x) => doc(x.document));
}
const eq = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: "EQUAL", value: typeof v === "boolean" ? { booleanValue: v } : { stringValue: v } } });

const jobs = await q("jobs", [eq("title", "대통령")]);
console.log("대통령 직업 문서", jobs.length);
for (const job of jobs) {
  const cc = job.classCode;
  const members = await q("users", [eq("classCode", cc)]);
  const students = members.filter((m) => !m.isAdmin && !m.isSuperAdmin);
  if (students.length < 5) continue;
  const pres = members.filter((m) => (Array.isArray(m.appointedJobIds) ? m.appointedJobIds : Object.keys(m.appointedJobIds || {})).includes(job.id));
  console.log(`\n== 학급 ${cc.slice(0, 2)}… 학생 ${students.length} · 대통령 ${pres.length}명 · job.appointedOnly=${job.appointedOnly}`);
  const admins = members.filter((m) => m.isAdmin || m.isSuperAdmin);
  console.log("관리자", admins.map((a) => `${a.name}(승인 ${a.isApproved ?? a.approved ?? "?"}, cash ${a.cash})`).join(" / "));
  const cashes = students.map((s) => s.cash).sort((a, b) => a - b);
  console.log("학생 현금: 0 이하", cashes.filter((c) => !(c > 0)).length, "명 · 숫자 아님", students.filter((s) => typeof s.cash !== "number").length, "· 최소", cashes[0], "· 중앙", cashes[cashes.length >> 1]);
  console.log("현금 음수 학생", students.filter((s) => s.cash < 0).map((s) => `${s.name}:${s.cash}`).join(", ") || "없음");
  for (const p of pres) {
    console.log(`대통령 ${p.name} uid ${p.id.slice(0, 6)} cash ${p.cash} 위임 ${JSON.stringify(p.delegatedPermissions || {})} appointed ${JSON.stringify(p.appointedJobIds)} selected ${JSON.stringify(p.selectedJobIds)}`);
    const logs = await q("activity_logs", [eq("metadata.issuedBy", p.id)], { limit: 300 });
    logs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    const by = {};
    for (const l of logs) by[l.type] = (by[l.type] || 0) + 1;
    console.log("  대통령이 실행한 기록", logs.length, JSON.stringify(by));
    for (const l of logs.slice(0, 25)) console.log("  ", String(l.timestamp).slice(5, 16), l.type, "|", l.description);
  }
  const cases = await q("courtComplaints", [eq("caseType", "bankruptcy")], { parent: `/classes/${cc}` });
  console.log("파산 사건", cases.length, cases.map((c) => `${c.complainantName}:${c.status}:${String(c.submissionDate).slice(0, 10)}`).join(", "));
}

// ── 파산 자격(순자산) 실측: src/utils/netAssets.js computeNetAssets 와 같은 식 ──
async function list(path) {
  const r = await fetch(`${BASE}/${path}?pageSize=300`, { headers: H });
  const j = await r.json();
  return (j.documents || []).map(doc);
}
async function get(path) {
  const r = await fetch(`${BASE}/${path}`, { headers: H });
  return r.ok ? doc(await r.json()) : null;
}
const stocks = (await get("Settings/centralStocksCache"))?.stocks || [];
for (const job of jobs) {
  const cc = job.classCode;
  const members = (await q("users", [eq("classCode", cc)])).filter((m) => !m.isAdmin && !m.isSuperAdmin);
  if (members.length < 5) continue;
  console.log(`\n== 순자산 · 학급 ${cc.slice(0, 2)}…`);
  for (const m of members) {
    const [park, prods, port, re] = await Promise.all([
      get(`users/${m.id}/financials/parkingAccount`), list(`users/${m.id}/products`), list(`users/${m.id}/portfolio`),
      q("realEstateProperties", [eq("owner", m.id)], { parent: `/classes/${cc}` }),
    ]);
    const dep = prods.filter((p) => p.type === "deposit" || p.type === "savings").reduce((s, p) => s + (Number(p.balance) || 0), 0);
    const loan = prods.filter((p) => p.type === "loan").reduce((s, l) => s + (Number(l.remainingPrincipal) || Number(l.balance) || 0), 0);
    const stock = port.reduce((s, h) => { const i = stocks.find((x) => String(x.id) === String(h.id)); return s + (i && i.isListed && h.quantity > 0 ? (Number(i.price) || 0) * h.quantity : 0); }, 0);
    const land = re.reduce((s, a) => s + (Number(a.price) || Number(a.value) || 0), 0);
    const coupon = (Number(m.coupons) || 0) * 1000;
    const net = (Number(m.cash) || 0) + coupon + (park?.balance || 0) + dep + stock + land - loan;
    if (m.cash < 0 || net < 0) console.log(`${net < 0 ? "신청 가능" : "신청 불가"} ${m.name} 순 ${Math.round(net).toLocaleString()} = 현금 ${Math.round(m.cash).toLocaleString()} 쿠폰 ${coupon.toLocaleString()} 파킹 ${Math.round(park?.balance || 0).toLocaleString()} 예적금 ${Math.round(dep).toLocaleString()} 주식 ${Math.round(stock).toLocaleString()} 부동산 ${land.toLocaleString()} 대출 ${Math.round(loan).toLocaleString()}`);
  }
}
