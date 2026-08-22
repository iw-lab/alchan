/**
 * 🧾 지급 원장 조회(P1-5) — 교사 화면이 **무엇을 되돌릴지** 고르는 유일한 길.
 *
 * 이 파일이 지키는 불변식
 *   ① 학급 스코프는 **서버가 정한다.** 요청이 보낸 classCode 는 교사에게 아무 힘이 없다.
 *   ② 학급이 없는 계정(`미지정`)은 전 학급을 볼 수 없다 — 조회는 쓰기가 아니라 방심하기 쉽다.
 *   ③ 합계는 **서버 카운터와 같은 뜻**이다. 환수해도 하루 캡은 안 돌아오므로 합계에서도 안 뺀다.
 *   ④ 잘렸으면 잘렸다고 말한다. 조용한 상한은 "그날 전부"라는 거짓말이 된다.
 *   ⑤ 원장의 pairwise `sub`·`jti` 는 화면으로 나가지 않는다.
 *   ⑥ 역원장은 **표시할 건만** 정확히 조회한다 — 상한에 잘려 "환수 안 됨"으로 보이면 안 된다.
 *
 * ⚠️ 순수 규칙(`grantsQuery.js`)과 조회 본체(`grants.js`)를 **둘 다** 돌린다. 순수 함수만
 *    검사하면 "규칙은 맞는데 쿼리가 그 규칙을 안 쓴다"를 못 잡는다(이 저장소의 실측 함정).
 */
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── 가짜 Firestore(쿼리 지원) ──────────────────────────────────
//    aapReward.test.js 의 가짜는 문서 조회 전용이라 `where`/`limit`/`getAll` 이 없다.
//    조회 함수를 검증하려면 **필터가 실제로 걸렸는지**를 봐야 해서 여기에 따로 둔다.
const FAKE = vi.hoisted(() => {
  const store = new Map();        // "col/id" → data
  const calls = { queries: [], getAll: [] };

  // 🔴 진짜 Firestore 와 **같은 암묵 정렬**(문서 id 순)로 돌려준다. 삽입 순서로 주면
  //    "limit 이 최신순으로 잘라 준다"는 틀린 전제를 테스트가 통과시킨다 — 이 저장소가
  //    실제로 그 전제로 버그를 만들었다(2026-08-22 codex WARNING).
  const makeQuery = (col, filters, lim, after) => ({
    where: (field, op, value) => {
      if (op !== "==") throw new Error(`등가 필터만 쓴다(새 복합인덱스 금지): ${op}`);
      return makeQuery(col, [...filters, [field, value]], lim, after);
    },
    limit: (n) => makeQuery(col, filters, n, after),
    startAfter: (snap) => makeQuery(col, filters, lim, snap.id),
    get: async () => {
      calls.queries.push({ col, filters: [...filters], limit: lim, after });
      let docs = [...store.entries()]
        .filter(([path]) => path.startsWith(`${col}/`))
        .map(([path, data]) => ({ id: path.slice(col.length + 1), data: () => data }))
        .filter((d) => filters.every(([f, v]) => d.data()[f] === v))
        .sort((a, b) => a.id.localeCompare(b.id)); // 문서 id 순 = Firestore 암묵 정렬
      if (after) docs = docs.filter((d) => d.id.localeCompare(after) > 0);
      docs = docs.slice(0, lim ?? 1000);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });

  const db = {
    collection: (col) => ({
      ...makeQuery(col, [], undefined, null),
      doc: (id) => ({ id, __path: `${col}/${id}` }),
    }),
    getAll: async (...refs) => {
      calls.getAll.push(refs.map((r) => r.id));
      return refs.map((r) => ({
        id: r.id,
        exists: store.has(r.__path),
        data: () => store.get(r.__path),
      }));
    },
  };

  return {
    db, store, calls,
    reset() { store.clear(); calls.queries.length = 0; calls.getAll.length = 0; },
    set: (path, data) => store.set(path, data),
  };
});

// require 캐시에 가짜를 먼저 꽂는다(aapReward.test.js 와 같은 이유·같은 순서 계약).
const req = createRequire(import.meta.url);
const utils = req("../../../functions/utils.js");
Object.assign(utils, { db: FAKE.db, logger: { info: () => {}, warn: () => {}, error: () => {} } });

const Q = req("../../../functions/aap/grantsQuery.js");
const { listAppRewards, GrantsDenied } = req("../../../functions/aap/grants.js");
const { GLOBAL_CEILING } = req("../../../functions/aap/rewardRules.js");

const CLASS = "BG6QUC";
const OTHER = "9BVPKP";
const UID = "student0000000000000000001";
const UID2 = "student0000000000000000002";
const NOW = Date.parse("2026-08-21T02:00:00Z"); // KST 11:00 → 20260821
const DAY = "20260821";

const ts = (ms) => ({ toMillis: () => ms });

const grant = (id, over = {}) => ({
  requestHash: id, uid: UID, classCode: CLASS, appId: "gugu-guard",
  achievementId: "clear10", label: "10문제 통과", rewardType: "cash", amount: 1000,
  policyVersion: 1, trustLevel: "L0", revocable: true, kstDay: DAY,
  jti: "jti-secret", sub: "sub-secret-pairwise", clientRunId: "run-1", eventId: "ev-1",
  createdAt: ts(NOW), ...over,
});

beforeEach(() => FAKE.reset());

// ═══════════════════════════════════════════════════════════════
describe("normalizeQuery — 학급 경계", () => {
  const ctx = (over = {}) => ({ callerClass: CLASS, isSuperAdmin: false, nowMs: NOW, ...over });

  it("교사는 자기 학급으로 고정된다(요청에 학급이 없어도)", () => {
    const r = Q.normalizeQuery({}, ctx());
    expect(r.ok).toBe(true);
    expect(r.value.classCode).toBe(CLASS);
    expect(r.value.scope).toBe("class");
  });

  it("교사가 남의 학급을 지목하면 **조용히 바꾸지 않고 거부**한다", () => {
    const r = Q.normalizeQuery({ classCode: OTHER }, ctx());
    expect(r).toEqual({ ok: false, reason: "other_class" });
    expect(Q.queryError("other_class")[0]).toBe("permission-denied");
  });

  it("자기 학급을 그대로 보내는 것은 통과한다(화면이 값을 실어 보내도 깨지지 않게)", () => {
    expect(Q.normalizeQuery({ classCode: CLASS }, ctx()).ok).toBe(true);
  });

  it("학급이 없는 계정(`미지정`)은 전 학급 조회로 떨어지지 않는다", () => {
    for (const bad of ["미지정", "", null, undefined, 123, "  "]) {
      const r = Q.normalizeQuery({}, ctx({ callerClass: bad }));
      expect(r, `callerClass=${String(bad)}`).toEqual({ ok: false, reason: "no_class" });
    }
    expect(Q.queryError("no_class")[0]).toBe("permission-denied");
  });

  it("슈퍼관리자만 학급을 지정하거나 전체를 본다", () => {
    const sa = ctx({ isSuperAdmin: true, callerClass: "미지정" });
    expect(Q.normalizeQuery({}, sa).value).toMatchObject({ classCode: null, scope: "all" });
    expect(Q.normalizeQuery({ classCode: OTHER }, sa).value.classCode).toBe(OTHER);
    expect(Q.normalizeQuery({ classCode: "안녕" }, sa)).toEqual({ ok: false, reason: "bad_class" });
  });
});

describe("normalizeQuery — 값 검증", () => {
  const ctx = { callerClass: CLASS, isSuperAdmin: false, nowMs: NOW };

  it("날짜를 안 주면 오늘(KST)", () => {
    expect(Q.normalizeQuery({}, ctx).value.day).toBe(DAY);
  });

  it("🔴 이상한 날짜를 **오늘로 갈음하지 않는다** — 교사가 어제를 본다고 믿으며 오늘을 보게 된다", () => {
    for (const bad of ["2026-08-21", "202608", "abcdefgh", 20260821, {}]) {
      expect(Q.normalizeQuery({ day: bad }, ctx), `day=${String(bad)}`)
        .toEqual({ ok: false, reason: "bad_day" });
    }
  });

  it("appId·limit 경계", () => {
    expect(Q.normalizeQuery({ appId: "a/b" }, ctx)).toEqual({ ok: false, reason: "bad_app" });
    expect(Q.normalizeQuery({ limit: 0 }, ctx)).toEqual({ ok: false, reason: "bad_limit" });
    expect(Q.normalizeQuery({ limit: Q.LIMITS.MAX + 1 }, ctx)).toEqual({ ok: false, reason: "bad_limit" });
    expect(Q.normalizeQuery({ limit: 1.5 }, ctx)).toEqual({ ok: false, reason: "bad_limit" });
    expect(Q.normalizeQuery({ limit: Q.LIMITS.MAX }, ctx).value.limit).toBe(Q.LIMITS.MAX);
    // 기본값은 **읽기 천장**이지 표시 개수가 아니다 — 둘을 헷갈리면 합계가 표본이 된다.
    expect(Q.normalizeQuery({}, ctx).value.limit).toBe(Q.LIMITS.DEFAULT);
    expect(Q.normalizeQuery({ limit: 1 }, ctx).value.limit).toBe(1);
  });

  it("프로토타입 키를 필드로 넣어도 통과하지 않는다", () => {
    expect(Q.normalizeQuery({ appId: "constructor" }, ctx).ok).toBe(true); // 형식은 맞다 — 그냥 못 찾을 뿐
    expect(Q.queryError("constructor")).toEqual(["failed-precondition", "지금은 조회할 수 없습니다."]);
    expect(Q.queryError("toString")[0]).toBe("failed-precondition");
  });
});

describe("summarize — 합계의 뜻", () => {
  it("🔴 환수된 건도 합계에 센다(서버 하루 카운터가 안 돌아오므로)", () => {
    const back = new Map([["g1", { recoveredAmount: 1000, requestedAmount: 1000, shortfall: 0 }]]);
    const out = Q.summarize({
      grants: [
        { id: "g1", uid: UID, rewardType: "cash", amount: 1000, createdAtMs: 2 },
        { id: "g2", uid: UID, rewardType: "cash", amount: 500, createdAtMs: 1 },
      ],
      clawbacks: back,
    });
    expect(out.totals.cash).toBe(1500);          // 환수분을 빼지 않는다
    expect(out.totals.recoveredCash).toBe(1000); // 회수분은 따로 보여 준다
    expect(out.totals.clawedCount).toBe(1);
    expect(out.students[0].cash).toBe(1500);
  });

  it("이상치 등급은 학생 하루 상한 대비 비율로 정해진다", () => {
    const cap = GLOBAL_CEILING.STUDENT_CASH_PER_DAY;
    const mk = (amount) => Q.summarize({
      grants: [{ id: "x", uid: UID, rewardType: "cash", amount, createdAtMs: 1 }],
      clawbacks: new Map(),
    }).students[0].level;
    // 경계 정확도 — `>=` 를 `>` 로 바꾸는 변이가 통과하면 안 된다.
    expect(mk(Math.round(cap * Q.ANOMALY.DANGER_RATIO))).toBe("danger");
    expect(mk(Math.round(cap * Q.ANOMALY.DANGER_RATIO) - 1)).toBe("warn");
    expect(mk(Math.round(cap * Q.ANOMALY.WARN_RATIO))).toBe("warn");
    expect(mk(Math.round(cap * Q.ANOMALY.WARN_RATIO) - 1)).toBe("ok");
  });

  it("쿠폰도 자기 축으로 판정된다(현금 축에 섞이지 않는다)", () => {
    const out = Q.summarize({
      grants: [{ id: "c", uid: UID, rewardType: "coupon", amount: GLOBAL_CEILING.STUDENT_COUPON_PER_DAY, createdAtMs: 1 }],
      clawbacks: new Map(),
    });
    expect(out.totals.coupon).toBe(GLOBAL_CEILING.STUDENT_COUPON_PER_DAY);
    expect(out.totals.cash).toBe(0);
    expect(out.students[0].level).toBe("danger");
  });

  it("손상된 금액은 합계에 섞지 않고 따로 센다", () => {
    const out = Q.summarize({
      grants: [
        { id: "a", uid: UID, rewardType: "cash", amount: "1000", createdAtMs: 1 },
        { id: "b", uid: UID, rewardType: "cash", amount: -5, createdAtMs: 2 },
        { id: "c", uid: UID, rewardType: "cash", amount: 700, createdAtMs: 3 },
      ],
      clawbacks: new Map(),
    });
    expect(out.totals.cash).toBe(700);
    expect(out.totals.corrupt).toBe(2);
    expect(out.rows).toHaveLength(3); // 행에서는 숨기지 않는다 — 숨기면 조사가 막힌다
  });

  it("uid 가 이상한 원장은 학생 집계에서 빠지되 행으로는 남는다", () => {
    const out = Q.summarize({
      grants: [{ id: "a", uid: "", rewardType: "cash", amount: 100, createdAtMs: 1 }],
      clawbacks: new Map(),
    });
    expect(out.students).toHaveLength(0);
    expect(out.rows).toHaveLength(1);
    expect(out.totals.cash).toBe(100);
  });

  it("정렬은 최신순이고 같은 시각이면 id 로 갈라 흔들리지 않는다", () => {
    const out = Q.summarize({
      grants: [
        { id: "b", uid: UID, rewardType: "cash", amount: 1, createdAtMs: 5 },
        { id: "a", uid: UID, rewardType: "cash", amount: 1, createdAtMs: 5 },
        { id: "c", uid: UID, rewardType: "cash", amount: 1, createdAtMs: 9 },
      ],
      clawbacks: new Map(),
    });
    expect(out.rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("listAppRewards — 쿼리가 실제로 규칙을 쓴다", () => {
  const call = (data, over = {}) =>
    listAppRewards({ callerClass: CLASS, isSuperAdmin: false, data, nowMs: NOW, ...over });

  it("교사 호출은 kstDay + 자기 학급으로 필터된다", async () => {
    FAKE.set(`appRewardGrants/g1`, grant("g1"));
    FAKE.set(`appRewardGrants/g2`, grant("g2", { classCode: OTHER, uid: UID2 }));
    const out = await call({});
    expect(out.rows.map((r) => r.id)).toEqual(["g1"]);
    expect(FAKE.calls.queries[0].filters).toEqual([["kstDay", DAY], ["classCode", CLASS]]);
  });

  it("🔴 남의 학급 데이터가 요청 파라미터로 열리지 않는다", async () => {
    FAKE.set(`appRewardGrants/g2`, grant("g2", { classCode: OTHER }));
    await expect(call({ classCode: OTHER })).rejects.toThrow(GrantsDenied);
    expect(FAKE.calls.queries).toHaveLength(0); // 쿼리가 아예 안 나간다
  });

  it("슈퍼관리자는 학급 필터 없이 본다", async () => {
    FAKE.set(`appRewardGrants/g1`, grant("g1"));
    FAKE.set(`appRewardGrants/g2`, grant("g2", { classCode: OTHER }));
    const out = await call({}, { isSuperAdmin: true, callerClass: "미지정" });
    expect(out.rows).toHaveLength(2);
    expect(FAKE.calls.queries[0].filters).toEqual([["kstDay", DAY]]);
  });

  it("appId 필터는 등가 하나로만 붙는다(등가 3개까지가 인덱스 없이 되는 한계)", async () => {
    FAKE.set(`appRewardGrants/g1`, grant("g1"));
    FAKE.set(`appRewardGrants/g3`, grant("g3", { appId: "typing" }));
    const out = await call({ appId: "typing" });
    expect(out.rows.map((r) => r.id)).toEqual(["g3"]);
    expect(FAKE.calls.queries[0].filters).toEqual([["kstDay", DAY], ["classCode", CLASS], ["appId", "typing"]]);
  });

  it("🔴 pairwise sub·jti·clientRunId 는 화면으로 나가지 않는다", async () => {
    FAKE.set(`appRewardGrants/g1`, grant("g1"));
    const out = await call({});
    const row = out.rows[0];
    expect(row.id).toBe("g1");            // 환수에 필요한 값은 나간다
    expect(row.sub).toBeUndefined();
    expect(row.jti).toBeUndefined();
    expect(row.clientRunId).toBeUndefined();
    expect(row.eventId).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("sub-secret-pairwise");
  });

  it("🔴 역원장은 표시할 건만 **정확히** 조회한다(상한에 잘려 거짓말하지 않게)", async () => {
    FAKE.set(`appRewardGrants/g1`, grant("g1"));
    FAKE.set(`appRewardClawbacks/g1`, {
      grantId: "g1", requestedAmount: 1000, recoveredAmount: 400, shortfall: 600,
      reason: "잘못 눌렀어요", byName: "선생님", bySuperAdmin: false, createdAt: ts(NOW),
    });
    const out = await call({});
    expect(FAKE.calls.getAll).toEqual([["g1"]]);
    expect(out.rows[0].clawback).toMatchObject({ recoveredAmount: 400, shortfall: 600, byName: "선생님" });
    expect(out.totals.recoveredCash).toBe(400);
  });

  it("지급이 0건이면 역원장을 아예 안 읽는다(빈 getAll 호출 금지)", async () => {
    const out = await call({});
    expect(out.rows).toHaveLength(0);
    expect(FAKE.calls.getAll).toHaveLength(0);
  });

  it("🔴 상한을 **넘겼을 때만** truncated 다 — 딱 맞게 끝난 날은 거짓 경고를 내지 않는다", async () => {
    for (let i = 0; i < 3; i += 1) FAKE.set(`appRewardGrants/g${i}`, grant(`g${i}`));
    // 정확히 상한만큼 있는 날. 예전 판(`snap.size >= limit`)은 여기서 "그날 전부가 아닙니다"라는
    // 거짓 경고를 냈다 — 경고가 거짓말을 시작하면 아무도 안 읽는다.
    const exact = await call({ limit: 3 });
    expect(exact.truncated).toBe(false);
    expect(exact.scanned).toBe(3);

    const cut = await call({ limit: 2 });
    expect(cut.truncated).toBe(true);
    expect(cut.scanned).toBe(2);
  });

  it("🔴 하루치를 **커서로 끝까지** 훑는다 — 한 장(100건)을 넘겨도 다 보인다", async () => {
    // 문서 id 는 sha256 이라 시간과 무관하다. 그래서 **문서 id 순으로 뒤쪽**에 있는 건이
    // 시간상 가장 최신이 되도록 심는다 — 한 장만 읽고 마는 구현은 이걸 절대 못 본다.
    for (let i = 0; i < 250; i += 1) {
      const id = `g${String(i).padStart(3, "0")}`;
      FAKE.set(`appRewardGrants/${id}`, grant(id, { amount: 10, createdAt: ts(NOW + i) }));
    }
    const out = await call({});
    expect(out.scanned).toBe(250);
    expect(out.truncated).toBe(false);
    expect(out.totals.cash).toBe(2500);          // 합계가 표본이 아니라 전부를 센다
    expect(out.rows[0].id).toBe("g249");          // 문서 id 순 뒤쪽 = 가장 최신이 맨 위
    expect(FAKE.calls.queries.filter((q) => q.col === "appRewardGrants").length)
      .toBeGreaterThan(1);                        // 실제로 여러 장을 받았다
  });

  it("🔴 상한을 넘는 날에도 **읽기가 상한에서 멈춘다**(비용 천장)", async () => {
    for (let i = 0; i < 250; i += 1) {
      const id = `g${String(i).padStart(3, "0")}`;
      FAKE.set(`appRewardGrants/${id}`, grant(id, { amount: 10 }));
    }
    const out = await call({ limit: 120 });
    expect(out.scanned).toBe(120);
    expect(out.truncated).toBe(true);
    expect(out.rows).toHaveLength(120);
  });

  it("🔴 빈 장이 오면 거기서 끝낸다 — 같은 빈 구간을 +1 확인이 **또** 묻지 않는다", async () => {
    // 한 장(100건)의 배수로 딱 끝나는 날. 예전 판은 빈 2번째 장에서 `break` 한 뒤
    // 아래 +1 확인이 **같은 빈 구간을 한 번 더** 물었다 — 빈 쿼리도 1읽기 과금이고,
    // 그 사이 커서 뒤로 새 지급이 커밋되면 상한(200)의 절반만 읽고도 `truncated=true`
    // 라는 거짓 경고가 떴다(2026-08-22 codex 3차 NIT · 재현 확인).
    for (let i = 0; i < 100; i += 1) {
      const id = `g${String(i).padStart(3, "0")}`;
      FAKE.set(`appRewardGrants/${id}`, grant(id, { amount: 10 }));
    }
    const out = await call({ limit: 200 });
    expect(out.scanned).toBe(100);
    expect(out.truncated).toBe(false);

    // 원장 쿼리는 **정확히 2회**(100건 한 장 + 빈 장 하나). 3회면 +1 확인이 또 돈 것이다.
    const ledger = FAKE.calls.queries.filter((q) => q.col === "appRewardGrants");
    expect(ledger).toHaveLength(2);
    expect(ledger.filter((q) => q.limit === 1)).toHaveLength(0);
  });

  it("판정 기준(캡·비율)을 같이 내려보낸다 — 화면이 상수를 따로 들면 어긋난다", async () => {
    const out = await call({});
    expect(out.caps).toEqual({
      studentCashPerDay: GLOBAL_CEILING.STUDENT_CASH_PER_DAY,
      studentCouponPerDay: GLOBAL_CEILING.STUDENT_COUPON_PER_DAY,
      warnRatio: Q.ANOMALY.WARN_RATIO,
      dangerRatio: Q.ANOMALY.DANGER_RATIO,
    });
  });

  it("이 함수는 쓰기를 하나도 하지 않는다", async () => {
    FAKE.set(`appRewardGrants/g1`, grant("g1"));
    await call({});
    // 가짜 db 에는 쓰기 경로가 없다 — 쓰기를 시도했다면 여기까지 오지 못한다.
    expect(Object.keys(FAKE.db)).toEqual(["collection", "getAll"]);
  });
});
