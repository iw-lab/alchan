#!/usr/bin/env node
/**
 * 학급 자산 스냅샷 · 대조 도구 (읽기 전용)
 *
 * 목적: 재작성 이식 전후로 **학생 1명의 자산도 달라지지 않았음**을 기계가 증명한다.
 *   capture 로 지금 상태를 떠 두고, 이식 배포 후 다시 떠서 diff 한다.
 *   1명이라도 차이나면 즉시 중단하고 원인을 찾는다.
 *
 * ⚠️ 진실원은 **원시 문서**다.
 *   순자산(net)은 사람이 읽기 쉬우라고 같이 계산해 넣지만, 대조의 근거는 아니다.
 *   순자산 공식이 바뀌면 net 은 정당하게 달라질 수 있고, 그건 자산 손실이 아니다.
 *   반대로 원시 필드(cash·coupons·예적금·대출·주식 수량·부동산)가 달라졌다면
 *   공식과 무관하게 진짜 변화다. diff 는 원시값 차이를 CRITICAL 로, net 차이만
 *   있는 경우를 WARN 으로 구분해 보고한다.
 *
 * ⚠️ 스냅샷에는 학생 이름이 들어간다(교사가 누구인지 알아야 조치할 수 있으므로).
 *   기본 출력 위치 `.asset-snapshots/` 는 .gitignore 대상이다 — 커밋하지 말 것.
 *
 * 사용:
 *   node scripts/asset-snapshot.mjs capture <classCode> [--out <path>]
 *   node scripts/asset-snapshot.mjs diff <before.json> <after.json>
 *
 * firebase CLI 로그인 필요(읽기 전용 REST 호출). 네트워크 필요 → CI 제외.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── 인증 (rules-test.mjs 와 동일 경로: OAuth 상수는 설치된 firebase-tools 에서 런타임에 읽는다) ──
async function accessToken() {
  const require = createRequire(import.meta.url);
  const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const api = require(join(gRoot, "firebase-tools/lib/api.js"));
  const store = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
  if (!store.tokens?.refresh_token) throw new Error("firebase CLI 로그인이 없습니다: firebase login");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: store.tokens.refresh_token,
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`토큰 갱신 실패: ${j.error_description || j.error}`);
  return j.access_token;
}

// ── Firestore REST 의 타입付 값 → 평문 ──
function decode(v) {
  if (v == null) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields);
  return null; // referenceValue·bytesValue 등은 자산 계산에 안 쓰인다
}
const decodeFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, decode(v)]));
const docId = (d) => d.name.split("/").pop();

let TOKEN;
let readCount = 0;
async function api(path, init) {
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init?.headers) },
  });
  if (!res.ok) throw new Error(`${res.status} ${path.slice(0, 120)} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** 컬렉션 전체 나열(페이지네이션 포함). 없으면 빈 배열. */
async function listDocs(path) {
  const out = [];
  let pageToken = "";
  do {
    const q = `?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const j = await api(`${path}${q}`).catch(() => ({}));
    (j.documents || []).forEach((d) => out.push({ id: docId(d), ...decodeFields(d.fields) }));
    readCount += (j.documents || []).length;
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

async function getDocOrNull(path) {
  const j = await api(path).catch(() => null);
  if (!j) return null;
  readCount++;
  return decodeFields(j.fields);
}

/** users where classCode == code */
async function listClassUsers(classCode) {
  const j = await api(":runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "classCode" },
            op: "EQUAL",
            value: { stringValue: classCode },
          },
        },
      },
    }),
  });
  const rows = j.filter((r) => r.document);
  readCount += rows.length;
  return rows.map((r) => ({ id: docId(r.document), ...decodeFields(r.document.fields) }));
}

// ── 순자산 계산 ──
// ⚠️ src/utils/netAssets.js 의 computeNetAssets 를 옮겨 적은 것이다(그쪽이 정본).
//    그 파일은 firebase 를 import 해 Node 에서 그대로 불러올 수 없다.
//    공식이 바뀌면 여기도 같이 고칠 것 — 다만 위 헤더대로 대조의 근거는 원시값이지 net 이 아니다.
function computeNet({ cash, coupons, couponValue = 1000, parking, deposits, savings, loans, realEstate, holdings, stocks }) {
  const depositSavings = [...deposits, ...savings].reduce((s, p) => s + (Number(p.balance) || 0), 0);
  const realEstateValue = realEstate.reduce((s, a) => s + (Number(a.price) || Number(a.value) || 0), 0);
  const stockValue = holdings.reduce((s, h) => {
    const info = stocks.find((x) => String(x.id) === String(h.stockId));
    return info && info.isListed && h.quantity > 0 ? s + (Number(info.price) || 0) * h.quantity : s;
  }, 0);
  const loanBalance = loans.reduce((s, l) => s + (Number(l.remainingPrincipal) || Number(l.balance) || 0), 0);
  return (Number(cash) || 0) + (Number(coupons) || 0) * couponValue + parking + depositSavings + stockValue + realEstateValue - loanBalance;
}

async function capture(classCode, outPath) {
  TOKEN = await accessToken();
  process.stderr.write(`학급 ${classCode} 자산을 읽는 중...\n`);

  const [users, allRealEstate, stocksDoc] = await Promise.all([
    listClassUsers(classCode),
    listDocs(`/classes/${classCode}/realEstateProperties`),
    getDocOrNull("/Settings/centralStocksCache"),
  ]);
  const stocks = Array.isArray(stocksDoc?.stocks) ? stocksDoc.stocks : [];
  const students = users.filter((u) => !u.isAdmin && !u.isSuperAdmin);

  const rows = [];
  for (const u of students) {
    const [parkingDoc, products, portfolio] = await Promise.all([
      getDocOrNull(`/users/${u.id}/financials/parkingAccount`),
      listDocs(`/users/${u.id}/products`),
      listDocs(`/users/${u.id}/portfolio`),
    ]);
    const pick = (t) => products.filter((p) => p.type === t);
    // 원시값만 담는다 — 계산 결과가 아니라 소스를 고정해야 진짜 대조가 된다.
    const raw = {
      cash: Number(u.cash) || 0,
      coupons: Number(u.coupons) || 0,
      parking: Number(parkingDoc?.balance) || 0,
      deposits: pick("deposit").map((p) => ({ id: p.id, balance: Number(p.balance) || 0 })),
      savings: pick("savings").map((p) => ({ id: p.id, balance: Number(p.balance) || 0 })),
      loans: pick("loan").map((p) => ({
        id: p.id,
        remainingPrincipal: Number(p.remainingPrincipal) || 0,
        balance: Number(p.balance) || 0,
      })),
      realEstate: allRealEstate
        .filter((r) => r.owner === u.id)
        .map((r) => ({ id: r.id, price: Number(r.price) || 0, value: Number(r.value) || 0 }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      holdings: portfolio
        .filter((p) => p.quantity > 0)
        .map((p) => ({ stockId: parseInt(p.id) || p.id, quantity: Number(p.quantity) || 0 }))
        .sort((a, b) => String(a.stockId).localeCompare(String(b.stockId))),
    };
    rows.push({
      uid: u.id,
      name: u.name || "",
      raw,
      // 참고용 — 대조 근거 아님(헤더 주석 참조)
      net: computeNet({ ...raw, stocks }),
    });
  }

  rows.sort((a, b) => a.uid.localeCompare(b.uid));
  const snapshot = {
    project: PROJECT,
    classCode,
    // 주가는 학생 자산과 무관하게 매일 움직인다 → net 비교 시 참고하라고 같이 남긴다.
    stockPrices: stocks.map((s) => ({ id: s.id, price: Number(s.price) || 0, isListed: !!s.isListed }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    studentCount: rows.length,
    firestoreReads: readCount,
    students: rows,
  };

  const out = outPath || join(ROOT, ".asset-snapshots", `${classCode}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`\n✓ 학생 ${rows.length}명 · Firestore 읽기 ${readCount}회`);
  console.log(`  총 순자산 ${rows.reduce((s, r) => s + r.net, 0).toLocaleString()}원 (참고값)`);
  console.log(`  저장: ${out}\n`);
  console.log("  ⚠️ 학생 이름이 들어 있습니다 — 커밋하지 마세요(.asset-snapshots/ 는 gitignore 대상).\n");
}

function diff(beforePath, afterPath) {
  const A = JSON.parse(readFileSync(beforePath, "utf8"));
  const B = JSON.parse(readFileSync(afterPath, "utf8"));
  if (A.classCode !== B.classCode) {
    console.error(`✗ 다른 학급끼리 비교하고 있습니다: ${A.classCode} vs ${B.classCode}`);
    process.exit(1);
  }

  const byUid = (s) => Object.fromEntries(s.students.map((r) => [r.uid, r]));
  const a = byUid(A);
  const b = byUid(B);
  const uids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

  const critical = [];
  const warn = [];
  for (const uid of uids) {
    const label = `${(a[uid] || b[uid]).name || "(이름없음)"} [${uid.slice(0, 8)}]`;
    if (!a[uid]) { critical.push(`+ ${label} — after 에만 있음(신규 학생)`); continue; }
    if (!b[uid]) { critical.push(`- ${label} — before 에만 있음(사라짐)`); continue; }
    const ra = JSON.stringify(a[uid].raw);
    const rb = JSON.stringify(b[uid].raw);
    if (ra !== rb) {
      // 어떤 필드가 달라졌는지까지 집어준다
      const changed = Object.keys(a[uid].raw).filter(
        (k) => JSON.stringify(a[uid].raw[k]) !== JSON.stringify(b[uid].raw[k]),
      );
      critical.push(`! ${label} — 원시 자산 변화: ${changed.join(", ")}`);
    } else if (a[uid].net !== b[uid].net) {
      warn.push(`~ ${label} — 원시값은 같은데 net 만 다름 ${a[uid].net.toLocaleString()} → ${b[uid].net.toLocaleString()}`);
    }
  }

  console.log(`\n학급 ${A.classCode} — ${A.studentCount}명 vs ${B.studentCount}명\n`);
  if (critical.length) {
    console.log("🔴 원시 자산 변화 (진짜 차이 — 이식 검증이면 여기서 중단):");
    critical.forEach((l) => console.log(`   ${l}`));
    console.log("");
  }
  if (warn.length) {
    console.log("🟡 net 만 다름 (주가 변동이나 순자산 공식 변경일 수 있음 — 원시값은 동일):");
    warn.forEach((l) => console.log(`   ${l}`));
    const pa = JSON.stringify(A.stockPrices);
    const pb = JSON.stringify(B.stockPrices);
    console.log(`   → 두 스냅샷의 주가: ${pa === pb ? "동일 (공식 변경을 의심)" : "다름 (주가 변동으로 설명될 수 있음)"}\n`);
  }
  if (!critical.length && !warn.length) console.log("✓ 전원 자산 동일 — 원시값·순자산 모두 차이 없음\n");

  process.exit(critical.length ? 1 : 0);
}

// ── 진입점 ──
const [cmd, ...rest] = process.argv.slice(2);
const outFlag = rest.indexOf("--out");
if (cmd === "capture" && rest[0]) {
  await capture(rest[0], outFlag >= 0 ? rest[outFlag + 1] : null);
} else if (cmd === "diff" && rest[1]) {
  diff(rest[0], rest[1]);
} else {
  console.error(`사용법:
  node scripts/asset-snapshot.mjs capture <classCode> [--out <path>]
  node scripts/asset-snapshot.mjs diff <before.json> <after.json>`);
  process.exit(2);
}
