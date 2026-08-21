// scripts/ops/firestore-ttl.mjs
// ⏳ Firestore TTL 정책 조회·설정.
//
// 왜 필요한가 (2026-08-21 실측)
//   이 프로젝트는 코드 **99군데**에서 `expireAt` 을 쓰는데 TTL 정책이 **0개**였다.
//   만료 표시만 찍고 지우는 사람이 아무도 없어서, `activity_logs` 37,267건 중
//   **3,164건이 이미 만료 시각을 지난 채로** 남아 있었다.
//
// ⚠️ **TTL 을 켜는 것은 되돌릴 수 없는 삭제다.** 켜는 순간 만료 지난 문서가 삭제 대상이 된다.
//    그래서 조회는 인자 없이 되지만 설정은 `--enable` 을 **명시**해야 하고, 그 컬렉션의
//    현재 문서 수와 만료분 수를 먼저 보여준 뒤 진행한다.
//
// 왜 gcloud 가 아닌가: 이 기계에 gcloud 가 없다. Firestore Admin REST 로 같은 일을 한다
//    (인증은 다른 ops 스크립트와 같은 firebase CLI 로그인).
//
// 용법
//   node scripts/ops/firestore-ttl.mjs                                  # 현재 TTL 정책 목록
//   node scripts/ops/firestore-ttl.mjs --check <컬렉션>                  # 그 컬렉션의 문서/만료 수
//   node scripts/ops/firestore-ttl.mjs --enable <컬렉션> [필드]          # TTL 켜기(기본 필드 expireAt)
import { firestoreProject, firestoreBase, authHeaders } from "./_firestore-rest.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.indexOf(`--${n}`);
const P = firestoreProject();
const BASE = firestoreBase();
const H = await authHeaders();
const ADMIN = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)`;

/** 그 컬렉션의 전체 문서 수와, expireAt 이 이미 지난 문서 수. */
async function counts(collectionId, field = "expireAt") {
  const agg = async (where) => {
    const body = {
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId }], ...(where ? { where } : {}) },
        aggregations: [{ count: {}, alias: "n" }],
      },
    };
    const r = await (
      await fetch(`${BASE}:runAggregationQuery`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    ).json();
    if (r.error) return null;
    const hit = (Array.isArray(r) ? r : [r]).find((x) => x.result);
    return hit ? Number(hit.result.aggregateFields.n.integerValue) : null;
  };
  const total = await agg(null);
  const expired = await agg({
    fieldFilter: {
      field: { fieldPath: field },
      op: "LESS_THAN",
      value: { timestampValue: new Date().toISOString() },
    },
  });
  return { total, expired };
}

if (flag("check") >= 0) {
  const c = argv[flag("check") + 1];
  if (!c) { console.error("사용법: --check <컬렉션>"); process.exit(2); }
  const { total, expired } = await counts(c);
  console.log(`${c}: 전체 ${total ?? "?"}건 · 만료 지난 것 ${expired ?? "?"}건`);
  console.log(expired ? "  ⚠️ TTL 을 켜면 이 만큼이 삭제 대상이 됩니다." : "  삭제될 문서가 없습니다.");
  process.exit(0);
}

if (flag("enable") >= 0) {
  const c = argv[flag("enable") + 1];
  const field = argv[flag("enable") + 2] || "expireAt";
  if (!c) { console.error("사용법: --enable <컬렉션> [필드]"); process.exit(2); }

  const { total, expired } = await counts(c, field);
  console.log(`대상: ${c}.${field}`);
  console.log(`  현재 문서 ${total ?? "?"}건 · 만료 지난 것 ${expired ?? "?"}건`);
  if (expired) console.log(`  ⚠️ 켜는 즉시 ${expired}건이 삭제 대상이 됩니다. 되돌릴 수 없습니다.`);

  const url =
    `${ADMIN}/collectionGroups/${encodeURIComponent(c)}/fields/${encodeURIComponent(field)}` +
    // ⚠️ Firestore Admin 의 fields.patch 는 updateMask 를 **평문 FieldMask** 로 받는다.
    //    Firestore **문서** REST 의 `updateMask.fieldPaths=` 관례를 그대로 쓰면 400 이다(실측).
    "?updateMask=ttlConfig";
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ ttlConfig: {} }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`✗ 실패 ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    process.exit(1);
  }
  // 적용은 비동기다(장기 실행 작업). 상태는 다시 조회해서 확인한다.
  console.log(`⏳ TTL 설정 요청됨 — ${body.name ? "operation 진행 중" : "완료"}`);
  console.log("   상태 확인: node scripts/ops/firestore-ttl.mjs");
  process.exit(0);
}

// 기본: 현재 걸린 TTL 정책 목록
const r = await (
  await fetch(
    `${ADMIN}/collectionGroups/-/fields?filter=${encodeURIComponent("ttlConfig:*")}`,
    { headers: H },
  )
).json();
if (r.error) { console.error(`✗ 조회 실패: ${r.error.message}`); process.exit(1); }
const fields = r.fields || [];
console.log(`프로젝트 ${P} · TTL 정책 ${fields.length}개`);
for (const f of fields) {
  const path = f.name.split("/collectionGroups/")[1];
  console.log(`  · ${path}  ${f.ttlConfig?.state || ""}`);
}
if (fields.length === 0) {
  console.log("  (없음 — expireAt 을 쓰는 문서가 영원히 쌓입니다)");
}
