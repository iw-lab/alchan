// scripts/ops/migrate-firestore-region.mjs
//
// Firestore 를 미국(nam5)에서 서울(asia-northeast3)로 옮긴다.
// Firestore 는 **위치를 바꿀 수 없다.** 그래서 경로는 하나뿐이다 — 새 DB 를 만들어 옮겨 담는다.
//
// 채택한 경로(2026-08-19 결정): `(default)` 를 **삭제하고 서울에 다시 만든다.**
//   ① (default)[nam5] → alchan-kr[서울] 로 전량 복사   (사본 = 백업)
//   ② 로컬 JSONL 덤프 + 원본 해시 확보                 (구글 밖 두 번째 백업)
//   ③ (default) 삭제 → asia-northeast3 로 재생성 → rules/indexes 배포
//   ④ alchan-kr → (default) 되담기 → **해시 대조**로 무결성 증명
// 이유: 무료 할당량은 프로젝트당 **DB 하나**에만 붙고 지금은 (default) 가 갖고 있다.
//       이름 있는 DB 로 컷오버하면 그 할당량을 잃는다. 이 경로는 그걸 지키면서
//       앱·함수 코드 변경이 **0곳**이다(DB 이름이 그대로라서).
//
//   node scripts/ops/migrate-firestore-region.mjs --dry-run                    # 세기만(원본 읽기만)
//   node scripts/ops/migrate-firestore-region.mjs --commit --dump ./backup     # 복사 + 로컬 백업
//   node scripts/ops/migrate-firestore-region.mjs --commit --src alchan-kr --dst '(default)'  # 되담기
//   node scripts/ops/migrate-firestore-region.mjs --hash-only                  # 내용 해시만 계산
//   node scripts/ops/migrate-firestore-region.mjs --verify                     # 최상위 문서수 대조
//
// 왜 Admin SDK 가 아니라 REST 인가
//   Admin SDK 의 Firestore 는 refresh token 자격증명을 **거부**한다(인증서/ADC 만 허용).
//   서비스계정 키를 새로 만드는 건 장기 자격증명을 하나 더 늘리는 일이라 택하지 않았다.
//   REST 는 값을 Firestore 원시 형식({timestampValue}, {integerValue} …) 그대로 주고받아
//   **타입 변환이 0**이다 — SDK 왕복에서 생길 수 있는 정밀도 손실이 원천적으로 없다.
//
// 안전 성질
//   · 원본은 읽기만 한다. 중간에 죽어도 라이브는 그대로다.
//   · update(=set) 라 **재실행 가능**하다. 중단 지점부터 다시 돌려도 같은 값으로 덮어쓴다.
//   · 유령 부모(문서 본문은 없고 서브컬렉션만 있는 것)는 showMissing=true 로 잡는다.
//   · referenceValue 는 옛 DB 를 가리키므로 **새 DB 경로로 치환**한다(안 하면 조용히 깨진다).
//   · 해시는 DB 이름을 지운 정규형 위에서 계산한다 → 어느 DB 에서 재도 같은 값이 나와야 한다.

import { readFileSync, createWriteStream, mkdirSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { accessToken, invalidateToken } from "./_auth.mjs";

const PROJECT = "inconomysu-class";
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const SRC_DB = arg("--src", "(default)");
const DST_DB = arg("--dst", "alchan-kr");
const DUMP_DIR = arg("--dump", null);
const DRY = process.argv.includes("--dry-run");
const VERIFY = process.argv.includes("--verify");
const HASH_ONLY = process.argv.includes("--hash-only");
const READ_ONLY = DRY || HASH_ONLY; // 원본만 읽는 모드
// ⚠️ 인자 없이 실행하면 기본값이 `(default)` → `alchan-kr` **실쓰기**다.
//    alchan-kr 은 롤백용 사본이라, 몇 달 뒤 누가 맨몸으로 돌리면 안전망이 조용히 덮어써진다.
//    그래서 쓰기는 `--commit` 을 명시해야만 한다(읽기 모드는 그대로 자유롭게).
if (!READ_ONLY && !VERIFY && !process.argv.includes("--commit")) {
  console.error(`거부: 이 명령은 ${SRC_DB} → ${DST_DB} 로 **실제 쓰기**를 한다.`);
  console.error("  세어만 보려면  --dry-run");
  console.error("  해시만 내려면  --hash-only");
  console.error("  정말 쓰려면    --commit 을 붙여라");
  process.exit(2);
}
// `--snapshot`: 순회 전체를 **한 시점**으로 고정한다(Firestore 의 readTime).
// 안 걸면 17분짜리 순회 중에 들어온 쓰기가 컬렉션마다 다른 시점으로 섞인다.
// ⚠️ 버전 보존 기간(기본 1시간) 안에서만 유효 — 순회가 그보다 길면 실패한다(조용히 넘어가지 않는다).
const SNAPSHOT = process.argv.includes("--snapshot") ? new Date().toISOString() : null;
const COMMIT_MAX = 300; // 500 상한보다 낮게 — 문서가 크면 10MB 요청 한도에 먼저 걸린다
const COL_POOL = 3; // 동시에 훑는 컬렉션 수
const DOC_POOL = 8; // 문서당 서브컬렉션 조회 동시성

const base = (db) => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(db)}/documents`;
const SRC_PREFIX = `projects/${PROJECT}/databases/${SRC_DB}/documents/`;
const DST_PREFIX = `projects/${PROJECT}/databases/${DST_DB}/documents/`;
const ANY_DB_PREFIX = new RegExp(`^projects/${PROJECT}/databases/[^/]+/documents/`);
// 문서 ID 에 ? & = : # 이 들어갈 수 있다(예: youtubeSearchCache 는 URL 을 ID 로 쓴다).
// URL 을 만들 때만 세그먼트별로 인코딩한다 — 요청 **본문**의 name 은 원본 경로 그대로여야 한다.
const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

async function call(url, init = {}, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const t = await accessToken();
    let r;
    try {
      r = await fetch(url, { ...init, headers: { authorization: `Bearer ${t}`, "content-type": "application/json", ...(init.headers || {}) } });
    } catch (e) {
      if (i < tries - 1) { await sleep(500 * 2 ** i); continue; }
      throw e;
    }
    if (r.ok) return r.json();
    const body = await r.text();
    if (r.status === 401) { invalidateToken(); continue; }
    if ((r.status === 429 || r.status >= 500) && i < tries - 1) { await sleep(500 * 2 ** i); continue; }
    throw new Error(`${r.status} ${url.slice(0, 140)}\n${body.slice(0, 400)}`);
  }
  throw new Error("재시도 소진: " + url);
}
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

const stats = { docs: 0, phantom: 0, emptyDocs: 0, collections: 0, refsRewritten: 0, written: 0 };
const collectionIds = new Set(); // 검증에 쓸 컬렉션 ID 목록(서브 포함)
const perCollection = new Map(); // 컬렉션 경로 → 문서 수

// referenceValue 는 절대 경로다 → 새 DB 를 가리키도록 바꾼다(중첩/배열 전부).
function rewriteRefs(v) {
  if (v == null || typeof v !== "object") return v;
  if (typeof v.referenceValue === "string") {
    if (v.referenceValue.startsWith(SRC_PREFIX)) {
      stats.refsRewritten++;
      return { referenceValue: DST_PREFIX + v.referenceValue.slice(SRC_PREFIX.length) };
    }
    return v;
  }
  if (v.mapValue?.fields) return { mapValue: { fields: mapFields(v.mapValue.fields) } };
  if (v.arrayValue?.values) return { arrayValue: { values: v.arrayValue.values.map(rewriteRefs) } };
  return v;
}
const mapFields = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, rewriteRefs(v)]));

// 해시용 정규형: 키 정렬 + referenceValue 의 DB 이름 제거 → 어느 DB 에서 계산해도 같은 값
function canonical(v) {
  if (typeof v === "number" && Object.is(v, -0)) return "-0"; // JSON.stringify(-0) === "0" 이라 구분이 사라진다
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    if (typeof v.referenceValue === "string") {
      // 원본/대상 DB 접두사만 지운다. 엉뚱한 DB 를 가리키는 참조(오염)는 **그대로 둬서 해시가 달라지게** 한다.
      for (const pre of [SRC_PREFIX, DST_PREFIX]) {
        if (v.referenceValue.startsWith(pre)) return { referenceValue: v.referenceValue.slice(pre.length) };
      }
      return { referenceValue: v.referenceValue };
    }
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}
const hashLines = [];
let dumpStream = null;

// ── 쓰기 버퍼(동시성 있어도 안전하게 직렬 flush) ───────────────────────────────
let pending = [];
let flushChain = Promise.resolve();
function enqueueWrite(w) {
  pending.push(w);
  if (pending.length >= COMMIT_MAX) return flush();
  return Promise.resolve();
}
function flush() {
  if (READ_ONLY) { pending = []; return Promise.resolve(); }
  const writes = pending; pending = [];
  if (writes.length === 0) return flushChain;
  flushChain = flushChain.then(async () => {
    await call(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${encodeURIComponent(DST_DB)}/documents:commit`,
      { method: "POST", body: JSON.stringify({ writes }) });
    stats.written += writes.length;
  });
  return flushChain;
}

async function listCollectionIds(db, docPath = "") {
  const ids = []; let pageToken;
  do {
    const body = { ...(pageToken ? { pageToken } : {}), ...(SNAPSHOT ? { readTime: SNAPSHOT } : {}) };
    const j = await call(`${base(db)}${docPath ? "/" + encPath(docPath) : ""}:listCollectionIds`,
      { method: "POST", body: JSON.stringify(body) });
    (j.collectionIds || []).forEach((c) => ids.push(c));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return ids;
}

// 동시성 제한 map
async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const colQueue = [];
async function scanCollection(colPath) {
  stats.collections++;
  collectionIds.add(colPath.split("/").pop());
  let count = 0, pageToken;
  do {
    const u = new URL(`${base(SRC_DB)}/${encPath(colPath)}`);
    u.searchParams.set("pageSize", "300");
    u.searchParams.set("showMissing", "true"); // 유령 부모까지
    if (SNAPSHOT) u.searchParams.set("readTime", SNAPSHOT);
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const j = await call(u.toString());
    const docs = j.documents || [];

    for (const d of docs) {
      const rel = d.name.slice(SRC_PREFIX.length);
      // ⚠️ 필드가 0개인 **실재 문서**는 응답에 fields 키가 없다 — 유령 부모와 모양이 같다.
      //    가르는 건 createTime 이다(유령 부모엔 없다). fields 유무로만 판정하면 빈 문서를
      //    통째로 흘린다(2026-08-19 실제로 흘렸다: 죽은 최상위 컬렉션 33개의 빈 문서 41건).
      if (d.createTime) {
        const fields = d.fields || {};
        stats.docs++; count++;
        if (!d.fields) stats.emptyDocs++;
        if (DUMP_DIR || HASH_ONLY) {
          const line = JSON.stringify({ path: rel, fields: canonical(fields) });
          hashLines.push(line);
          if (dumpStream) dumpStream.write(line + "\n");
        }
        if (!READ_ONLY) await enqueueWrite({ update: { name: DST_PREFIX + rel, fields: mapFields(fields) } });
      } else {
        stats.phantom++;
      }
    }
    // 문서별 서브컬렉션 조회 — 여기가 전체 시간의 대부분이라 병렬로 돈다
    const subs = await pmap(docs, DOC_POOL, async (d) => {
      const rel = d.name.slice(SRC_PREFIX.length);
      return (await listCollectionIds(SRC_DB, rel)).map((s) => `${rel}/${s}`);
    });
    for (const list of subs) for (const p of list) colQueue.push(p);

    pageToken = j.nextPageToken;
  } while (pageToken);
  perCollection.set(colPath, count);
  return count;
}

async function runQueue() {
  const workers = Array.from({ length: COL_POOL }, async () => {
    while (colQueue.length) {
      const col = colQueue.shift();
      if (col === undefined) break;
      await scanCollection(col);
    }
  });
  await Promise.all(workers);
}

async function countCol(db, col, allDescendants = false) {
  const j = await call(`${base(db)}:runAggregationQuery`, { method: "POST", body: JSON.stringify({
    structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: col, allDescendants }] }, aggregations: [{ alias: "n", count: {} }] },
    ...(SNAPSHOT ? { readTime: SNAPSHOT } : {}) }) });
  // 응답이 여러 프레임일 수 있다(진행상황 프레임에는 result 가 없다) — j[0] 만 보면 0 으로 오독한다.
  const frame = (Array.isArray(j) ? j : [j]).find((f) => f?.result?.aggregateFields?.n);
  if (!frame) throw new Error(`집계 응답에 result 없음: ${db} ${col}`);
  return Number(frame.result.aggregateFields.n.integerValue ?? 0);
}

async function main() {
  const t0 = Date.now();
  console.log(`원본 ${SRC_DB} → 대상 ${DST_DB} · 모드: ${VERIFY ? "verify" : HASH_ONLY ? "hash-only" : DRY ? "dry-run" : "복사"}`);

  if (VERIFY) {
    // ⚠️ 해시 대조만으로는 부족하다. 해시는 "내가 읽은 것"끼리 비교하므로 **읽기가 빠뜨린 문서**는
    //    양쪽에서 똑같이 빠져 통과한다(2026-08-19 빈 문서 41건을 이렇게 놓쳤다).
    //    집계 쿼리는 순회와 완전히 다른 경로(인덱스)로 세므로 그 구멍을 잡는다.
    //    컬렉션그룹(allDescendants) 으로 서브컬렉션까지 센다.
    const srcRoots = (await listCollectionIds(SRC_DB)).sort();
    const dstRoots = (await listCollectionIds(DST_DB)).sort();
    const onlyDst = dstRoots.filter((c) => !srcRoots.includes(c));
    if (onlyDst.length) console.log(`  ⚠️ 대상에만 있는 최상위 컬렉션: ${onlyDst.join(", ")}`);
    const roots = [...new Set([...srcRoots, ...dstRoots])].sort();
    let ids = roots;
    const manifestPath = arg("--manifest", null);
    if (manifestPath) {
      const m = JSON.parse(readFileSync(manifestPath, "utf8"));
      ids = [...new Set([...roots, ...(m.collections || [])])].sort();
    } else {
      console.log("  ⚠️ --manifest 없음 — 최상위에 없는 **서브컬렉션 전용 ID** 는 검사 범위 밖이다.");
    }
    let bad = onlyDst.length, totalSrc = 0, totalDst = 0;
    for (const c of roots) {
      const [a, b] = await Promise.all([countCol(SRC_DB, c), countCol(DST_DB, c)]);
      if (a !== b) { bad++; console.log(`  ❌ 최상위 ${c.padEnd(26)} 원본 ${a} / 대상 ${b}`); }
      else if (process.env.VERBOSE) console.log(`  ✅ 최상위 ${c.padEnd(26)} ${a}`);
    }
    for (const c of ids) {
      const [a, b] = await Promise.all([countCol(SRC_DB, c, true), countCol(DST_DB, c, true)]);
      totalSrc += a; totalDst += b;
      if (a !== b) { bad++; console.log(`  ❌ 그룹   ${c.padEnd(26)} 원본 ${a} / 대상 ${b}`); }
      else if (process.env.VERBOSE) console.log(`  ✅ 그룹   ${c.padEnd(26)} ${a}`);
    }
    console.log(`\n전체 문서 합계(컬렉션그룹 기준): 원본 ${totalSrc.toLocaleString()} / 대상 ${totalDst.toLocaleString()}`);
    console.log(bad === 0 ? "✅ 최상위 + 컬렉션그룹 전부 일치" : `❌ ${bad}개 불일치`);
    process.exit(bad === 0 ? 0 : 1);
  }

  if (DUMP_DIR) {
    mkdirSync(DUMP_DIR, { recursive: true });
    dumpStream = createWriteStream(join(DUMP_DIR, `${SRC_DB.replace(/[()]/g, "")}.jsonl`));
  }

  // ⚠️ 이 스크립트는 upsert 다 — **원본에서 지운 문서를 대상에서 지우지 않는다.**
  //    대상에 옛 문서가 남아 있으면 복사 후에도 그대로 살아남아 "동기화됐다"는 착각을 준다.
  //    그래서 비어 있지 않은 대상에는 명시적 동의를 요구한다.
  if (!READ_ONLY) {
    const dstRoots = await listCollectionIds(DST_DB);
    if (dstRoots.length > 0 && !process.argv.includes("--allow-nonempty")) {
      console.error(`거부: 대상 ${DST_DB} 이 비어 있지 않다(최상위 컬렉션 ${dstRoots.length}개).`);
      console.error("  이 스크립트는 덮어쓰기만 하고 **지우지 않는다** — 대상의 옛 문서가 남는다.");
      console.error("  그래도 진행하려면 --allow-nonempty");
      process.exit(2);
    }
  }

  const roots = (await listCollectionIds(SRC_DB)).sort();
  console.log(`최상위 컬렉션 ${roots.length}개${SNAPSHOT ? ` · 스냅샷 ${SNAPSHOT}` : ""}\n`);
  colQueue.push(...roots);
  await runQueue();
  await flush();
  await flushChain;
  if (dumpStream) await new Promise((r) => dumpStream.end(r));

  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`문서 ${stats.docs.toLocaleString()}건(그중 빈 문서 ${stats.emptyDocs}건) · 컬렉션(서브 포함) ${stats.collections}개 · 유령부모 ${stats.phantom}건`);
  console.log(`쓰기 ${stats.written.toLocaleString()}건 · referenceValue 경로 교정 ${stats.refsRewritten}건 · 소요 ${secs}초`);

  if (DUMP_DIR || HASH_ONLY) {
    hashLines.sort();
    const h = createHash("sha256");
    for (const l of hashLines) h.update(l).update("\n");
    console.log(`\n📌 내용 해시(sha256, 문서 ${hashLines.length}건): ${h.digest("hex")}`);
  }
  if (DUMP_DIR) {
    const manifest = { db: SRC_DB, docs: stats.docs, collections: [...collectionIds].sort(), perCollection: Object.fromEntries(perCollection) };
    createWriteStream(join(DUMP_DIR, "manifest.json")).end(JSON.stringify(manifest, null, 2));
    console.log(`백업: ${DUMP_DIR}/${SRC_DB.replace(/[()]/g, "")}.jsonl · manifest.json`);
  }
}
main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
