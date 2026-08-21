/**
 * 💸 AAP 보상 지급(P1-2) — **돈이 나가는 유일한 경로**.
 *
 * 이 파일이 지키는 불변식
 *   ① 지급·원장·세션소비·카운터가 **한 트랜잭션**이다. 원장 없이 돈만 들어가는 상태가 없다.
 *   ② **멱등 조회가 정책·캡보다 먼저**다. 응답만 유실된 재시도가 "캡이 찼다"로 거부되면
 *      학생 화면은 실패인데 잔액은 이미 늘어 있다.
 *   ③ 금액은 **카탈로그만** 정한다 — 요청에는 achievementId 밖에 없다.
 *   ④ 같은 토큰으로 두 번 받을 수 없다(세션 1회용). 다른 clientRunId 로도 안 된다.
 *   ⑤ 네 축 캡이 **경계에서** 정확하다(<= 를 < 로 바꾸는 변이가 통과하면 안 된다).
 *
 * ⚠️ 이 파일은 **가짜 Firestore** 위에서 진짜 지급 코드를 실행한다. 소스 텍스트 단언만으로는
 *    "무엇이 적혀 있나"만 보이고 **"무엇이 실행되나"** 는 안 보인다 — 이 저장소는 그 차이로
 *    변이 6종을 통과시킨 적이 있다(2026-08-21). 다만 가짜는 **진짜 경합을 재현하지 못한다**:
 *    트랜잭션을 직렬화해 실행하므로 "동시에 두 번"은 순차 재현으로만 확인하고, 진짜 경합은
 *    원장 `create`(이미 있으면 실패)가 막는다는 것을 구조로 확인한다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as R from "../../../functions/aap/rewardRules.js";
import { SALARY } from "../../../functions/salaryUtils.js";

const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** 못 찾으면 `slice(-1)` 이 마지막 1글자를 주므로 **찾았는지 먼저 단언**한다. */
const after = (haystack, needle) => {
  const i = haystack.indexOf(needle);
  expect(i, `구간을 찾지 못했다: ${needle}`).toBeGreaterThan(-1);
  return haystack.slice(i);
};

/** `match` 블록을 중괄호 깊이로 정확히 자른다(고정 길이 창은 이웃 블록을 삼킨다). */
const ruleBlock = (rules, header) => {
  const i = rules.indexOf(header);
  expect(i, `규칙 블록이 없다: ${header}`).toBeGreaterThan(-1);
  let depth = 0;
  for (let j = rules.indexOf("{", i + header.length); j < rules.length; j += 1) {
    if (rules[j] === "{") depth += 1;
    else if (rules[j] === "}") {
      depth -= 1;
      if (depth === 0) return rules.slice(i, j + 1);
    }
  }
  throw new Error(`블록의 닫는 괄호를 찾지 못했다: ${header}`);
};

// ═══════════════════════════════════════════════════════════════
// 가짜 Firestore — `vi.mock` 팩토리가 끌어올려지므로 vi.hoisted 안에서 만든다.
// ═══════════════════════════════════════════════════════════════
const FAKE = vi.hoisted(() => {
  const store = new Map();
  const log = [];
  let autoSeq = 0;
  /** 트랜잭션 안에서 write 뒤에 read 가 오면 진짜 Firestore 는 죽는다 — 여기서도 죽인다. */
  let wroteInTx = false;

  const inc = (n) => ({ __inc: n });
  const isSentinel = (v) => !!v && typeof v === "object" && ("__inc" in v || v.__ts || "__tsms" in v);

  const mergeDeep = (prev, patch) => {
    const out = { ...(prev || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === "object" && "__inc" in v) {
        out[k] = (typeof out[k] === "number" ? out[k] : 0) + v.__inc;
      } else if (
        v && typeof v === "object" && !Array.isArray(v) && !isSentinel(v) &&
        out[k] && typeof out[k] === "object" && !Array.isArray(out[k])
      ) {
        out[k] = mergeDeep(out[k], v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  const resolveFlat = (prev, patch) => {
    const out = { ...(prev || {}) };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v && typeof v === "object" && "__inc" in v
        ? (typeof out[k] === "number" ? out[k] : 0) + v.__inc
        : v;
    }
    return out;
  };

  // 트랜잭션 **밖** 쓰기. 경보(announceBreaker)와 실행권 발급이 여기로 온다 —
  // 트랜잭션 안에서만 쓸 수 있는 가짜였다면, "경보를 밖으로 뺐다"는 사실 자체를 검증할 수 없다.
  const applyOutside = (path, op, data) => {
    const prev = store.get(path);
    if (op === "create" && store.has(path)) {
      const e = new Error(`ALREADY_EXISTS: ${path}`);
      e.code = 6;
      throw e;
    }
    store.set(path, op === "merge" ? mergeDeep(prev, data) : resolveFlat(null, data));
    log.push({ op: `outside:${op}`, path });
  };
  const makeRef = (path) => ({
    path,
    id: path.split("/").pop(),
    collection: (name) => makeCollection(`${path}/${name}`),
    get: async () => snap(path),
    set: async (data, opts) => applyOutside(path, opts && opts.merge ? "merge" : "set", data),
    create: async (data) => applyOutside(path, "create", data),
  });
  const makeCollection = (prefix) => ({
    doc: (id) => makeRef(`${prefix}/${id ?? `auto${(autoSeq += 1)}`}`),
  });
  const snap = (path) => ({
    exists: store.has(path),
    id: path.split("/").pop(),
    data: () => (store.has(path) ? JSON.parse(JSON.stringify(store.get(path))) : undefined),
  });

  const db = {
    collection: (name) => makeCollection(name),
    // 진짜 Firestore 는 `db.doc("a/b/c/d")` 로 깊은 경로를 한 번에 가리킬 수 있다.
    // 학습기록의 집계 경로(classes/…/learningStats/…/days/…/apps/…)가 이걸 쓴다.
    doc: (path) => makeRef(path),
    runTransaction: async (fn) => {
      const writes = [];
      wroteInTx = false;
      const tx = {
        get: async (ref) => {
          if (wroteInTx) throw new Error("트랜잭션에서 write 뒤에 read 를 했다");
          return snap(ref.path);
        },
        set: (ref, data, opts) => {
          wroteInTx = true;
          writes.push({ op: opts && opts.merge ? "merge" : "set", ref, data });
        },
        update: (ref, data) => {
          wroteInTx = true;
          writes.push({ op: "update", ref, data });
        },
        create: (ref, data) => {
          wroteInTx = true;
          writes.push({ op: "create", ref, data });
        },
      };
      const out = await fn(tx);
      for (const w of writes) {
        const prev = store.get(w.ref.path);
        if (w.op === "create" && store.has(w.ref.path)) {
          const e = new Error(`ALREADY_EXISTS: ${w.ref.path}`);
          e.code = 6;
          throw e;
        }
        if (w.op === "merge") store.set(w.ref.path, mergeDeep(prev, w.data));
        else if (w.op === "update") {
          if (!store.has(w.ref.path)) throw new Error(`NOT_FOUND: ${w.ref.path}`);
          store.set(w.ref.path, resolveFlat(prev, w.data));
        } else store.set(w.ref.path, resolveFlat(null, w.data));
        log.push({ op: w.op, path: w.ref.path });
      }
      return out;
    },
  };

  const admin = {
    firestore: {
      FieldValue: { increment: inc, serverTimestamp: () => ({ __ts: true }) },
      Timestamp: { fromMillis: (ms) => ({ __tsms: ms }) },
    },
  };

  return {
    store, log, db, admin,
    reset() { store.clear(); log.length = 0; autoSeq = 0; },
    set: (path, data) => store.set(path, data),
    get: (path) => store.get(path),
  };
});

// ═══════════════════════════════════════════════════════════════
// 가짜를 **어떻게** 끼우나
//   `vi.mock` 은 안 통한다 — vitest 는 `functions/**` 를 CJS 로 externalize 해서 Node 의
//   require 로 싣는다(그래서 `require("../utils")` 가 vitest 의 모듈 그래프를 안 지난다.
//   시도했더니 진짜 Firestore 가 붙어 "Unable to detect a Project Id" 로 죽었다).
//   → **require 캐시에 직접 넣는다.** 지급 코드가 처음 로드되기 **전에** utils 의 export 를
//     갈아끼우면, 그 코드가 로드 시점에 구조분해한 `db`·`admin` 이 가짜를 가리킨다.
//   ⚠️ 그래서 아래 세 줄의 **순서가 곧 계약**이다: utils 교체 → 그 다음에야 reward 를 싣는다.
//
// 서명키·salt 도 같은 이유로 여기서 먼저 세운다 — keys.js 는 **모듈 로드 시점**에 env 를 읽는다.
// ═══════════════════════════════════════════════════════════════
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.AAP_SIGNING_KEY_CURRENT = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }),
).toString("base64");
process.env.AAP_PAIRWISE_SALT = "test-salt-2026";
const SALT = process.env.AAP_PAIRWISE_SALT;

const req = createRequire(import.meta.url);
const utils = req("../../../functions/utils.js");
// ⚠️ **db·admin·logger 만** 갈아끼운다. `LOG_TYPES`·`sanitizeInput` 같은 순수 값을 목으로
//    덮으면, 진짜 값이 바뀌어도 테스트가 옛 값을 계속 통과시켜 드리프트를 못 잡는다.
Object.assign(utils, {
  db: FAKE.db,
  admin: FAKE.admin,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
});
const LOG_TYPES = utils.LOG_TYPES;
const { signAppToken } = req("../../../functions/aap/token.js");
const { grantAppReward, parseRequest } = req("../../../functions/aap/reward.js");

// ── 무대 만들기 ────────────────────────────────────────────────
const UID = "student0000000000000000001";
const APP = "gugu-guard";
const CLASS = "BG6QUC";
const NOW = Date.parse("2026-08-21T02:00:00Z"); // KST 11:00 → day 20260821
const DAY = R.kstDayKey(NOW);

const stage = (over = {}) => {
  FAKE.reset();
  FAKE.set(`users/${UID}`, { name: "테스트학생", classCode: CLASS, cash: 1000, coupons: 0, ...(over.user || {}) });
  FAKE.set(`platformAppPolicies/${APP}`, {
    status: "active",
    aapEnabled: true,
    rewardsEnabled: true,
    trustLevel: "L0",
    launchUrl: "https://apps.example.com/gugu/",
    dailyCashCap: 10000,
    dailyCouponCap: 2,
    ...(over.policy || {}),
  });
  FAKE.set(`appAchievements/${APP}/items/stage_clear`, {
    active: true, rewardType: "cash", amount: 1000, maxPerDay: 3, label: "1단 통과",
    ...(over.achievement || {}),
  });
  const issued = signAppToken({ appId: APP, uid: UID, salt: SALT, nowMs: NOW });
  FAKE.set(`aapRewardSessions/${issued.jti}`, {
    uid: UID, classCode: CLASS, appId: APP, sub: issued.sub, exp: issued.exp,
    ...(over.session || {}),
  });
  return issued;
};

const call = (issued, over = {}) =>
  grantAppReward({
    body: { achievementId: "stage_clear", clientRunId: "run1", ...over },
    headerToken: issued.token,
    nowMs: over.nowMs || NOW,
  });

// ═══════════════════════════════════════════════════════════════
describe("지급이 실제로 일어난다 (가짜 Firestore 위에서 진짜 코드 실행)", () => {
  beforeEach(() => FAKE.reset());

  it("⭐ 현금이 들어가고 원장·카운터·활동로그가 **같이** 생긴다", async () => {
    const issued = stage();
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(out.value).toMatchObject({ rewardType: "cash", amount: 1000, duplicate: false });

    expect(FAKE.get(`users/${UID}`).cash).toBe(2000);
    expect(FAKE.get(`users/${UID}`).appRewardDaily).toEqual({ day: DAY, cash: 1000, coupon: 0 });

    const grant = FAKE.get(`appRewardGrants/${out.value.grantId}`);
    expect(grant, "지급 원장이 없다 — 돈만 들어갔다").toBeTruthy();
    expect(grant).toMatchObject({ uid: UID, appId: APP, amount: 1000, kstDay: DAY, trustLevel: "L0" });

    expect(FAKE.get(`appRewardSubjects/${UID}_${APP}`)).toMatchObject({ day: DAY, cash: 1000 });
    expect(FAKE.get(`appRewardCounters/${DAY}_class_${CLASS}`)).toMatchObject({ cash: 1000, count: 1 });
    expect(FAKE.get(`appRewardCounters/${DAY}_app_${APP}`)).toMatchObject({ cash: 1000, count: 1 });
    expect(FAKE.get(`aapRewardSessions/${issued.jti}`).consumedGrantId).toBe(out.value.grantId);

    const logs = FAKE.log.filter((w) => w.path.startsWith("activity_logs/"));
    expect(logs, "학생 화면용 거래 내역이 안 생겼다").toHaveLength(1);
    const activity = FAKE.get(logs[0].path);
    // MyAssets 는 amount 또는 couponAmount 가 0 이 아닌 문서만 거래로 센다.
    expect(activity.type, "기존 로그 타입을 재사용하지 않았다").toBe(LOG_TYPES.CASH_INCOME);
    expect(activity.amount).toBe(1000);
    expect(activity.couponAmount).toBe(0);
  });

  it("⭐ 쿠폰 보상은 cash 를 건드리지 않는다", async () => {
    const issued = stage({ achievement: { active: true, rewardType: "coupon", amount: 1, maxPerDay: 2 } });
    const out = await call(issued);
    expect(out.ok).toBe(true);
    expect(FAKE.get(`users/${UID}`).cash).toBe(1000);
    expect(FAKE.get(`users/${UID}`).coupons).toBe(1);
    expect(FAKE.get(`users/${UID}`).appRewardDaily).toEqual({ day: DAY, cash: 0, coupon: 1 });
  });

  it("⭐ 요청이 amount 를 보내도 **무시**된다 (캡이 가격표가 되지 않게)", async () => {
    const issued = stage();
    const out = await call(issued, { amount: 999999, rewardType: "cash" });
    expect(out.ok).toBe(true);
    expect(out.value.amount).toBe(1000);
    expect(FAKE.get(`users/${UID}`).cash).toBe(2000);
  });

  it("⭐ 같은 clientRunId 재시도 = **같은 결과**, 두 번 지급되지 않는다", async () => {
    const issued = stage();
    const first = await call(issued);
    const again = await call(issued);
    expect(again.ok).toBe(true);
    expect(again.value.duplicate).toBe(true);
    expect(again.value.grantId).toBe(first.value.grantId);
    expect(FAKE.get(`users/${UID}`).cash).toBe(2000); // 한 번만
  });

  it("⭐ 캡이 찬 뒤에도 **재시도는 성공한 결과를 돌려준다** (멱등이 캡보다 먼저)", async () => {
    // 하루 상한을 1000 으로 낮춰 첫 지급으로 정확히 소진시킨다.
    const issued = stage({ policy: { status: "active", aapEnabled: true, rewardsEnabled: true, trustLevel: "L0", launchUrl: "https://apps.example.com/g/", dailyCashCap: 1000, dailyCouponCap: 0 } });
    const first = await call(issued);
    expect(first.ok).toBe(true);
    const retry = await call(issued);
    expect(retry.ok, "정상 재시도가 캡에 막혔다 — 화면은 실패인데 잔액은 늘어 있다").toBe(true);
    expect(retry.value.duplicate).toBe(true);
    expect(FAKE.get(`users/${UID}`).cash).toBe(2000);
  });

  it("⭐ 같은 토큰 + **다른 clientRunId** = 거부 (재생 방어)", async () => {
    const issued = stage();
    expect((await call(issued)).ok).toBe(true);
    const replay = await call(issued, { clientRunId: "run2" });
    expect(replay).toEqual({ ok: false, reason: "session_consumed" });
    expect(FAKE.get(`users/${UID}`).cash).toBe(2000);
  });

  it("⭐ 남의 세션으로는 못 받는다 (sub 재계산 대조)", async () => {
    const issued = stage();
    // 세션 문서만 다른 학생 것으로 바꾼다 = 토큰의 sub 와 어긋난다.
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      uid: "otherstudent000000000000001", classCode: CLASS, appId: APP, sub: issued.sub, exp: issued.exp,
    });
    expect(await call(issued)).toEqual({ ok: false, reason: "session_mismatch" });
  });

  it("⭐ 세션이 없으면 지급하지 않는다 (uid 를 알 방법이 없다)", async () => {
    const issued = stage();
    FAKE.store.delete(`aapRewardSessions/${issued.jti}`);
    expect(await call(issued)).toEqual({ ok: false, reason: "session_missing" });
  });

  it("⭐ 실행권이 만료되면 토큰이 살아 있어도 거부한다", async () => {
    // 🔴 변이시험 생존 1건(2026-08-21). 지금은 세션 exp 가 토큰 exp 와 **같은 값**이라
    //    이 검사가 우연히 중복이다 — 토큰이 통과하면 세션도 통과한다. 그래서 검사를
    //    통째로 지워도 아무 테스트가 안 깨졌다. 하지만 실행권의 수명은 토큰 수명과
    //    **다르게 잡을 수 있어야 하는 물건**이고(예: 보상 창을 더 짧게), 그 자리를 비워 두면
    //    나중에 수명을 줄여도 아무도 지키지 않는다. 짧은 실행권으로 그 자리를 잠근다.
    const issued = stage();
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      uid: UID, classCode: CLASS, appId: APP, sub: issued.sub,
      exp: Math.floor(NOW / 1000) - 600, // 토큰은 살아 있는데 실행권만 죽었다
    });
    expect(await call(issued)).toEqual({ ok: false, reason: "session_expired" });
    expect(FAKE.get(`users/${UID}`).cash).toBe(1000);
  });

  it("⭐ kill switch 가 지급을 멈춘다", async () => {
    const issued = stage();
    FAKE.set(`platformAppPolicies/${APP}`, { ...FAKE.get(`platformAppPolicies/${APP}`), status: "disabled" });
    expect(await call(issued)).toEqual({ ok: false, reason: "disabled" });
    expect(FAKE.get(`users/${UID}`).cash).toBe(1000);
  });

  it("⭐ 보상 스위치가 꺼져 있으면 실행은 되어도 지급은 안 된다", async () => {
    const issued = stage();
    FAKE.set(`platformAppPolicies/${APP}`, { ...FAKE.get(`platformAppPolicies/${APP}`), rewardsEnabled: false });
    expect(await call(issued)).toEqual({ ok: false, reason: "rewards_off" });
  });

  it("⭐ 정책 캡이 0 이면 한 푼도 안 나간다 (지금 등록된 11개 앱의 상태)", async () => {
    const issued = stage({ policy: { status: "active", aapEnabled: true, rewardsEnabled: true, trustLevel: "L0", launchUrl: "https://a.example.com/", dailyCashCap: 0, dailyCouponCap: 0 } });
    expect(await call(issued)).toEqual({ ok: false, reason: "subject_daily_cap" });
    expect(FAKE.get(`users/${UID}`).cash).toBe(1000);
  });

  it("⭐ 카운터가 손상되면 **지급을 멈춘다** (모르면 주지 않는다)", async () => {
    const issued = stage({ user: { name: "т", classCode: CLASS, cash: 1000, coupons: 0,
      appRewardDaily: { day: DAY, cash: "10000", coupon: 0 } } });
    expect(await call(issued)).toEqual({ ok: false, reason: "counter_corrupt" });
    expect(FAKE.get(`users/${UID}`).cash).toBe(1000);
  });

  it("⭐ 학급 축 카운터가 손상돼도 멈춘다 (축 하나만 보지 않는다)", async () => {
    const issued = stage();
    FAKE.set(`appRewardCounters/${DAY}_class_${CLASS}`, { day: DAY, cash: "2000000", coupon: 0 });
    expect(await call(issued)).toEqual({ ok: false, reason: "counter_corrupt" });
  });

  it("⭐ 교사·관리자 계정은 지급 대상이 아니다", async () => {
    // ⚠️ **미승인 교사**(자가가입 직후)도 포함한다. hasAdminPower 는 승인된 계정만 참이라
    //    그것만 보면 빠져나간다 — 지금은 classCode 가 "미지정" 이라 우연히 막힐 뿐이다.
    for (const who of [
      { isAdmin: true, isApproved: true },
      { isSuperAdmin: true },
      { isAdmin: true, isApproved: false },
      { isTeacher: true, isApproved: false },
    ]) {
      const issued = stage({ user: who });
      expect(await call(issued)).toEqual({ ok: false, reason: "not_student" });
    }
  });

  it("⭐ 학급이 바뀌었으면 다시 열게 한다 (학급 카운터가 모호해진다)", async () => {
    const issued = stage({ user: { classCode: "9BVPKP" } });
    expect(await call(issued)).toEqual({ ok: false, reason: "class_changed" });
  });

  it("⭐ 꺼진 성취·없는 성취는 거부되고 사유가 정책 쪽과 섞이지 않는다", async () => {
    const off = stage({ achievement: { active: false, rewardType: "cash", amount: 1000 } });
    expect(await call(off)).toEqual({ ok: false, reason: "inactive" });

    const none = stage();
    FAKE.store.delete(`appAchievements/${APP}/items/stage_clear`);
    const out = await call(none);
    // 정책의 "not_registered"(앱 미등록)와 **다른 사유**여야 학생 문구가 안 뒤바뀐다.
    expect(out).toEqual({ ok: false, reason: "achievement_not_registered" });
    expect(R.denyMessage("achievement_not_registered")).not.toBe(R.denyMessage("not_registered"));
  });

  it("⭐ 카탈로그 금액이 등급 상한을 넘으면 **거부**한다 (조용히 깎지 않는다)", async () => {
    // L0 의 1건 상한은 5,000.
    const issued = stage({ achievement: { active: true, rewardType: "cash", amount: 5001, maxPerDay: 1 } });
    expect((await call(issued)).ok).toBe(false);
    expect(FAKE.get(`users/${UID}`).cash).toBe(1000);
  });

  it("⭐ 성취 하루 한도가 실제로 막는다 (maxPerDay 경계)", async () => {
    const issued = stage({ achievement: { active: true, rewardType: "cash", amount: 1000, maxPerDay: 2 } });
    // 세션이 1회용이므로 회차마다 새 세션을 만든다(= 앱을 다시 여는 것).
    const runOnce = async (n) => {
      const t = signAppToken({ appId: APP, uid: UID, salt: SALT, nowMs: NOW });
      FAKE.set(`aapRewardSessions/${t.jti}`, { uid: UID, classCode: CLASS, appId: APP, sub: t.sub, exp: t.exp });
      return grantAppReward({ body: { achievementId: "stage_clear", clientRunId: `run${n}` }, headerToken: t.token, nowMs: NOW });
    };
    expect((await call(issued)).ok).toBe(true);
    expect((await runOnce(2)).ok).toBe(true);
    expect(await runOnce(3)).toEqual({ ok: false, reason: "achievement_daily_limit" });
    expect(FAKE.get(`users/${UID}`).cash).toBe(3000);
  });

  it("⭐ 지급이 거부되면 **아무 문서도 바뀌지 않는다** (전부-아니면-전무)", async () => {
    const issued = stage({ achievement: { active: false, rewardType: "cash", amount: 1000 } });
    await call(issued);
    // 레이트리밋 버킷만 남는다 — 그건 트랜잭션 밖이라 남는 게 **의도**다.
    const touched = FAKE.log.map((w) => w.path).filter((p) => !p.startsWith("aapRateLimits/"));
    expect(touched, `거부됐는데 쓰기가 있었다: ${touched.join(", ")}`).toEqual([]);
  });

  it("⭐ 레이트리밋은 **실패한 호출도** 센다 (트랜잭션 밖이라는 뜻)", async () => {
    const issued = stage({ achievement: { active: false, rewardType: "cash", amount: 1 } });
    await call(issued);
    // 키는 uid 가 아니라 토큰의 sub 다 — 읽기 0회로 첫 관문을 세우기 위해서다.
    const bucket = FAKE.get(`aapRateLimits/${issued.sub}`);
    expect(bucket, "실패한 호출이 카운트되지 않았다").toBeTruthy();
    expect(bucket.tokens).toBe(R.RATE_LIMIT.CAPACITY - 1);
  });

  it("⭐ 연타하면 레이트리밋이 실제로 막는다", async () => {
    const issued = stage({ achievement: { active: false, rewardType: "cash", amount: 1 } });
    let last;
    for (let i = 0; i < R.RATE_LIMIT.CAPACITY + 1; i += 1) last = await call(issued);
    expect(last).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("⭐ 레이트리밋이 **세션 조회보다 먼저** 돈다 (읽기만 태우는 길 차단)", async () => {
    // 🔴 2026-08-21 자체 적대 검토에서 찾은 구멍. 레이트리밋 키가 uid 였을 땐 먼저
    //    세션 문서를 읽어야 했고, 그래서 **보상이 꺼진 앱**(세션 문서가 없다)의 유효 토큰
    //    하나로 `session_missing` 경로를 무한히 두드려 읽기 비용만 태울 수 있었다.
    //    키를 토큰의 sub 로 바꿔 읽기 0회로 첫 관문을 세웠다.
    const issued = stage();
    FAKE.store.delete(`aapRewardSessions/${issued.jti}`); // 보상 꺼진 앱과 같은 상태
    let last;
    for (let i = 0; i < R.RATE_LIMIT.CAPACITY + 1; i += 1) last = await call(issued, { clientRunId: `r${i}` });
    expect(last, "세션이 없는 토큰으로 무한히 두드릴 수 있다").toEqual({ ok: false, reason: "rate_limited" });
  });

  it("⭐ 레이트리밋 문서에 uid 를 담지 않는다 (초등학생 데이터)", async () => {
    const issued = stage();
    await call(issued);
    const bucket = FAKE.get(`aapRateLimits/${issued.sub}`);
    expect(bucket).toBeTruthy();
    expect(Object.keys(bucket), "버킷에 uid 가 들어갔다").not.toContain("uid");
    expect(JSON.stringify(bucket)).not.toContain(UID);
  });

  it("⭐ 위조·변조 토큰은 Firestore 를 한 번도 안 읽는다", async () => {
    stage();
    const before = FAKE.log.length;
    for (const bad of ["", "a.b.c", "not-a-token"]) {
      const out = await grantAppReward({ body: { achievementId: "stage_clear", clientRunId: "r" }, headerToken: bad, nowMs: NOW });
      expect(out.ok).toBe(false);
    }
    expect(FAKE.log.length, "잘못된 토큰인데 쓰기가 일어났다").toBe(before);
  });

  it("⭐ 다른 앱용 토큰으로 이 앱의 성취를 받을 수 없다", async () => {
    stage();
    const other = signAppToken({ appId: "other-app", uid: UID, salt: SALT, nowMs: NOW });
    FAKE.set(`aapRewardSessions/${other.jti}`, { uid: UID, classCode: CLASS, appId: APP, sub: other.sub, exp: other.exp });
    // aud 가 other-app 이라 세션(appId=gugu-guard)과 어긋난다.
    const out = await grantAppReward({ body: { achievementId: "stage_clear", clientRunId: "r" }, headerToken: other.token, nowMs: NOW });
    expect(out).toEqual({ ok: false, reason: "session_mismatch" });
  });

  it("⭐ 요청 형식 검증이 트랜잭션 **전에** 끝난다", () => {
    expect(parseRequest({ achievementId: "a/b", clientRunId: "r" }, "t").reason).toBe("malformed");
    expect(parseRequest({ achievementId: "a", clientRunId: "" }, "t").reason).toBe("malformed");
    expect(parseRequest({ achievementId: "a", clientRunId: "r", eventId: 7 }, "t").reason).toBe("malformed");
    expect(parseRequest({ achievementId: "a", clientRunId: "r" }, "").reason).toBe("token_invalid");
    // 헤더가 본문보다 우선 — 본문 토큰으로 헤더를 못 덮는다.
    expect(parseRequest({ achievementId: "a", clientRunId: "r", token: "BODY" }, "HEADER").value.token).toBe("HEADER");
  });
});

// ═══════════════════════════════════════════════════════════════
describe("네 축 캡 — 경계에서 정확한가 (<= 를 < 로 바꾸면 죽어야 한다)", () => {
  const caps = { perGrant: 100, subjectPerDay: 500, studentPerDay: 800, classPerDay: 1000, appPerDay: 2000 };
  const zero = { cash: 0, coupon: 0 };
  const used = (over = {}) => ({ subject: zero, student: zero, classroom: zero, app: zero, ...over });

  it("⭐ 1건 상한: 정확히 상한은 통과, 1 넘으면 거부", () => {
    expect(R.checkCaps({ amount: 100, rewardType: "cash", caps, used: used() }).ok).toBe(true);
    expect(R.checkCaps({ amount: 101, rewardType: "cash", caps, used: used() }).reason).toBe("over_grant_cap");
  });

  it("⭐ 축마다 경계가 정확하다", () => {
    const cases = [
      ["subject", 400, "subject_daily_cap"],
      ["student", 700, "student_daily_cap"],
      ["classroom", 900, "class_daily_cap"],
      ["app", 1900, "app_total_daily_cap"],
    ];
    for (const [axis, atLimitMinus100, reason] of cases) {
      const u = used({ [axis]: { cash: atLimitMinus100, coupon: 0 } });
      expect(R.checkCaps({ amount: 100, rewardType: "cash", caps, used: u }).ok, `${axis} 경계에서 거부됐다`).toBe(true);
      const u2 = used({ [axis]: { cash: atLimitMinus100 + 1, coupon: 0 } });
      expect(R.checkCaps({ amount: 100, rewardType: "cash", caps, used: u2 }).reason).toBe(reason);
    }
  });

  it("⭐ 현금과 쿠폰이 **서로의 한도를 안 먹는다**", () => {
    const u = used({ subject: { cash: 500, coupon: 0 } });
    // 현금은 소진됐지만 쿠폰은 그대로여야 한다.
    expect(R.checkCaps({ amount: 1, rewardType: "cash", caps, used: u }).ok).toBe(false);
    expect(R.checkCaps({ amount: 1, rewardType: "coupon", caps: { ...caps, perGrant: 3, subjectPerDay: 2, studentPerDay: 5, classPerDay: 9, appPerDay: 9 }, used: u }).ok).toBe(true);
  });

  it("⭐ 좁은 축부터 판정한다 (학생 한도를 '학급 한도'라고 말하지 않게)", () => {
    const u = used({ subject: { cash: 500, coupon: 0 }, classroom: { cash: 1000, coupon: 0 } });
    expect(R.checkCaps({ amount: 1, rewardType: "cash", caps, used: u }).reason).toBe("subject_daily_cap");
  });
});

// ═══════════════════════════════════════════════════════════════
describe("유효 캡 = min(등급, 정책, 코드)", () => {
  const trust = { cashPerGrant: 5000, cashPerAppPerDay: 10000, couponPerGrant: 1, couponPerAppPerDay: 2 };

  it("⭐ 정책이 더 작으면 정책이 이긴다", () => {
    const caps = R.resolveCaps({ policy: { dailyCashCap: 3000 }, trustLimits: trust, rewardType: "cash" });
    expect(caps.subjectPerDay).toBe(3000);
  });

  it("⭐ 정책이 더 크면 등급이 이긴다 (문서로 상한을 못 넘는다)", () => {
    const caps = R.resolveCaps({ policy: { dailyCashCap: 9_999_999 }, trustLimits: trust, rewardType: "cash" });
    expect(caps.subjectPerDay).toBe(10000);
  });

  it("⭐ 캡 필드가 없거나 이상하면 **0** (fail-closed)", () => {
    for (const bad of [undefined, null, "5000", -1, 1.5, NaN, {}]) {
      const caps = R.resolveCaps({ policy: { dailyCashCap: bad }, trustLimits: trust, rewardType: "cash" });
      expect(caps.subjectPerDay, `${String(bad)} 가 캡으로 통과했다`).toBe(0);
    }
  });

  it("⭐ 전역 상한이 주급 상수에서 파생된다", () => {
    expect(R.GLOBAL_CEILING.STUDENT_CASH_PER_DAY).toBe(Math.round(SALARY.BASE * 0.05));
    expect(codeOnly(read("functions/aap/rewardRules.js"))).toMatch(/SALARY\.BASE/);
  });

  it("⭐ 축의 크기 순서가 뒤집히지 않았다 (좁은 축이 더 커지면 넓은 축이 죽은 코드가 된다)", () => {
    const g = R.GLOBAL_CEILING;
    expect(g.STUDENT_CASH_PER_DAY).toBeLessThanOrEqual(g.CLASS_CASH_PER_DAY);
    expect(g.CLASS_CASH_PER_DAY).toBeLessThanOrEqual(g.APP_CASH_PER_DAY);
    expect(g.STUDENT_COUPON_PER_DAY).toBeLessThanOrEqual(g.CLASS_COUPON_PER_DAY);
    expect(g.CLASS_COUPON_PER_DAY).toBeLessThanOrEqual(g.APP_COUPON_PER_DAY);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("성취 단위 한도 — 쿨다운·평생·선행조건", () => {
  const ach = (over = {}) => ({ maxPerDay: 3, maxLifetime: 0, cooldownSec: 0, prerequisites: [], ...over });
  const call2 = (achievement, achievements, nowMs = 1_000_000) =>
    R.checkAchievementState({ achievement, achievements, achievementId: "a", day: "20260821", nowMs });

  it("⭐ 쿨다운 경계: 정확히 지나면 통과, 1ms 모자라면 거부", () => {
    const a = ach({ cooldownSec: 60 });
    expect(call2(a, { a: { lifetimeCount: 1, lastGrantedAt: 1_000_000 - 60_000 } }).ok).toBe(true);
    expect(call2(a, { a: { lifetimeCount: 1, lastGrantedAt: 1_000_000 - 59_999 } }).reason).toBe("cooldown");
  });

  it("⭐ 평생 한도 경계", () => {
    const a = ach({ maxLifetime: 3 });
    expect(call2(a, { a: { lifetimeCount: 2 } }).ok).toBe(true);
    expect(call2(a, { a: { lifetimeCount: 3 } }).reason).toBe("lifetime_limit");
    // 0 = 무제한
    expect(call2(ach({ maxLifetime: 0 }), { a: { lifetimeCount: 99999 } }).ok).toBe(true);
  });

  it("⭐ 어제 카운트는 오늘을 막지 않는다", () => {
    const a = ach({ maxPerDay: 1 });
    expect(call2(a, { a: { day: "20260820", dayCount: 5, lifetimeCount: 5 } }).ok).toBe(true);
    expect(call2(a, { a: { day: "20260821", dayCount: 1, lifetimeCount: 5 } }).reason).toBe("achievement_daily_limit");
  });

  it("⭐ 선행조건이 **한 번이라도 달성**돼야 한다", () => {
    const a = ach({ prerequisites: ["p1", "p2"] });
    expect(call2(a, { p1: { lifetimeCount: 1 } }).reason).toBe("prerequisites");
    expect(call2(a, { p1: { lifetimeCount: 1 }, p2: { lifetimeCount: 0 } }).reason).toBe("prerequisites");
    expect(call2(a, { p1: { lifetimeCount: 1 }, p2: { lifetimeCount: 1 } }).ok).toBe(true);
  });

  it("⭐ **상속된** 상태를 이 학생의 기록으로 읽지 않는다", () => {
    // 🔴 변이시험 생존 1건(2026-08-21). `map[id]` 로 바꿔도 테스트가 통과했다 —
    //    `typeof own === "object"` 와 `Number.isFinite` 가 "constructor"·"toString" 을
    //    우연히 걸러 주기 때문이다. 그건 **우연한 fail-closed** 지 설계가 아니다
    //    (P1-7 의 등급 폴백이 정확히 같은 자리에서 샜다).
    //    프로토타입에 진짜 성취 모양의 값이 있으면 우연은 끝난다 — 그 자리를 잠근다.
    const inherited = Object.create({
      ghost: { day: "20260821", dayCount: 99, lifetimeCount: 99, lastGrantedAt: 0 },
    });

    // (1) 상속된 값이 **선행조건 달성**으로 읽히면 안 된다.
    expect(
      R.checkAchievementState({
        achievement: ach({ prerequisites: ["ghost"] }),
        achievements: inherited, achievementId: "a", day: "20260821", nowMs: 1,
      }).reason,
      "상속된 값이 선행조건을 열었다",
    ).toBe("prerequisites");

    // (2) 상속된 값이 **내 하루 횟수**로 읽히면 안 된다(정상 학생이 막힌다).
    const self = R.checkAchievementState({
      achievement: ach({ maxPerDay: 1 }),
      achievements: inherited, achievementId: "ghost", day: "20260821", nowMs: 1,
    });
    expect(self.ok, "상속된 횟수가 내 기록으로 읽혔다").toBe(true);
    expect(self.state.lifetimeCount).toBe(0);
  });

  it("⭐ 프로토타입 키가 '이미 달성'으로 읽히지 않는다", () => {
    // ACHIEVEMENT_ID_RE 는 "constructor" 를 허용한다. `map[id]` 로 읽으면 Object.prototype 이 나온다.
    const state = R.checkAchievementState({
      achievement: ach({ maxPerDay: 1 }), achievements: {}, achievementId: "constructor",
      day: "20260821", nowMs: 1,
    });
    expect(state.ok).toBe(true);
    expect(state.state.lifetimeCount).toBe(0);
    // 선행조건도 마찬가지 — 없는 선행조건이 프로토타입 덕에 통과하면 안 된다.
    expect(R.checkAchievementState({
      achievement: ach({ prerequisites: ["toString"] }), achievements: {}, achievementId: "a",
      day: "20260821", nowMs: 1,
    }).reason).toBe("prerequisites");
  });
});

// ═══════════════════════════════════════════════════════════════
describe("멱등 해시 — 무엇을 넣고 무엇을 뺐나", () => {
  const base = { sub: "s1", appId: "app", achievementId: "ach", clientRunId: "run" };

  it("⭐ 튜플 경계가 모호하지 않다", () => {
    expect(R.requestHash({ ...base, sub: "ab", appId: "c" }))
      .not.toBe(R.requestHash({ ...base, sub: "a", appId: "bc" }));
  });

  it("⭐ 시간·날짜가 안 들어간다 (자정을 넘긴 재시도가 새 지급이 되면 안 된다)", () => {
    expect(R.requestHash(base)).toBe(R.requestHash(base));
    const SRC = codeOnly(read("functions/aap/rewardRules.js"));
    const fn = after(SRC, "function requestHash(");
    const body = fn.slice(0, fn.indexOf("\n}"));
    for (const forbidden of ["Date.now", "kstDayKey", "uid", "iat", "jti", "policyVersion", "trustLevel"]) {
      expect(body, `멱등 해시에 ${forbidden} 이 들어갔다`).not.toContain(forbidden);
    }
  });

  it("⭐ 다섯 요소 중 하나만 달라도 다른 해시다", () => {
    const seen = new Set([R.requestHash(base)]);
    for (const k of ["sub", "appId", "achievementId", "clientRunId"]) {
      seen.add(R.requestHash({ ...base, [k]: "다름" }));
    }
    seen.add(R.requestHash({ ...base, eventId: "e1" }));
    expect(seen.size).toBe(6);
  });

  it("⭐ 문서 id 로 쓸 수 있는 모양이다 ('/' 주입·길이 문제가 없다)", () => {
    const h = R.requestHash({ ...base, achievementId: "a/../../evil" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("KST 하루 경계 · 레이트리밋", () => {
  it("⭐ 자정이 KST 기준이다 (UTC 로 자르면 오전 9시에 날이 바뀐다)", () => {
    expect(R.kstDayKey(Date.parse("2026-08-20T14:59:59.999Z"))).toBe("20260820");
    expect(R.kstDayKey(Date.parse("2026-08-20T15:00:00.000Z"))).toBe("20260821");
  });

  it("⭐ 버킷이 시간에 따라 회복한다", () => {
    const t0 = 1_000_000_000;
    let s = { tokens: 0, lastRefillMs: t0 };
    expect(R.consumeBucket(s, t0).allowed).toBe(false);
    expect(R.consumeBucket(s, t0 + R.RATE_LIMIT.REFILL_MS - 1).allowed).toBe(false);
    const ok = R.consumeBucket(s, t0 + R.RATE_LIMIT.REFILL_MS);
    expect(ok.allowed).toBe(true);
    expect(ok.next.tokens).toBe(0);
  });

  it("⭐ 거부는 회복 시계를 **앞으로 밀지 않는다** (연타가 자기 회복을 막으면 안 된다)", () => {
    const t0 = 1_000_000_000;
    const denied = R.consumeBucket({ tokens: 0, lastRefillMs: t0 }, t0 + 500);
    expect(denied.allowed).toBe(false);
    expect(denied.next.lastRefillMs).toBe(t0);
  });

  it("⭐ 저장된 **미래** 시각이 버킷을 영구히 잠그지 않는다", () => {
    // 🔴 2026-08-21 codex WARNING. 시계가 뒤로 간 경우(elapsed 음수)는 막았는데,
    //    저장값이 미래면 elapsed 가 **영원히 0** 이라 그 버킷은 1년 뒤에도 거부된다.
    const t0 = 1_000_000_000;
    const stuck = { tokens: 0, lastRefillMs: Number.MAX_SAFE_INTEGER };
    expect(R.consumeBucket(stuck, t0).allowed).toBe(false);
    // 거부하면서 시각을 현재로 끌어내려야 다음 호출부터 회복한다.
    const corrected = R.consumeBucket(stuck, t0).next;
    expect(corrected.lastRefillMs, "미래 시각이 그대로 저장됐다 — 영구 잠금").toBeLessThanOrEqual(t0);
    expect(R.consumeBucket(corrected, t0 + R.RATE_LIMIT.REFILL_MS).allowed).toBe(true);
  });

  it("⭐ 시계가 뒤로 가도 토큰이 줄지 않는다", () => {
    const t0 = 1_000_000_000;
    const out = R.consumeBucket({ tokens: 5, lastRefillMs: t0 + 60_000 }, t0);
    expect(out.allowed).toBe(true);
    expect(out.next.tokens).toBe(4);
  });

  it("⭐ 저장값이 없으면 가득 찬 버킷으로 시작한다", () => {
    expect(R.consumeBucket(null, 1).next.tokens).toBe(R.RATE_LIMIT.CAPACITY - 1);
  });

  // 🔴 2026-08-21 codex CRITICAL — 차단된 요청 1,000건이 **쓰기 1,000회**를 만들었다.
  //    거부가 이어지는 동안 새 상태는 저장값과 똑같은데도 매번 썼기 때문이다.
  //    `changed` 가 "써야 하나"를 말한다. `allowed` 로 갈음하면 치유가 죽는다.
  it("⭐ 거부가 이어지면 상태가 안 바뀐다 (호출부가 쓰기를 건너뛸 근거)", () => {
    const t0 = 1_000_000_000;
    const out = R.consumeBucket({ tokens: 0, lastRefillMs: t0 }, t0 + 500);
    expect(out.allowed).toBe(false);
    expect(out.changed, "같은 상태를 다시 쓰면 차단이 곧 비용이 된다").toBe(false);
  });

  it("⭐ 거부라도 **손상된 저장값은 바뀐다** (건너뛰기가 치유를 죽이면 안 된다)", () => {
    const t0 = 1_000_000_000;
    const stuck = { tokens: 0, lastRefillMs: Number.MAX_SAFE_INTEGER };
    const out = R.consumeBucket(stuck, t0);
    expect(out.allowed).toBe(false);
    expect(out.changed, "미래 시각을 안 쓰면 그 버킷은 영구히 잠긴다").toBe(true);
  });

  it("⭐ 통과하면 언제나 바뀐다 (토큰이 줄거나 시계가 움직인다)", () => {
    const t0 = 1_000_000_000;
    expect(R.consumeBucket(null, t0).changed).toBe(true);
    expect(R.consumeBucket({ tokens: 5, lastRefillMs: t0 }, t0).changed).toBe(true);
  });

  it("⭐ 학습용 통은 지급용과 **다른 설정·다른 키**다", () => {
    expect(R.LEARNING_RATE_LIMIT).not.toBe(R.RATE_LIMIT);
    expect(R.bucketKeyForLearning("abc")).toBe("lrn_abc");
    expect(R.bucketKeyForLearning("abc")).not.toBe("abc");
    // 기록은 지급보다 훨씬 잦다 — 통이 더 커야 정상 플레이가 안 막힌다.
    expect(R.LEARNING_RATE_LIMIT.CAPACITY).toBeGreaterThan(R.RATE_LIMIT.CAPACITY);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("거부 사유가 학생에게 새지 않는다", () => {
  it("⭐ 모든 사유에 문구가 있다", () => {
    const SRC = read("functions/aap/reward.js") + read("functions/aap/rewardRules.js");
    const reasons = new Set([...SRC.matchAll(/RewardDenied\("([a-z_]+)"\)/g)].map((m) => m[1]));
    expect(reasons.size, "사유를 하나도 못 찾았다 — 정규식이 코드와 어긋났다").toBeGreaterThan(5);
    for (const r of reasons) {
      expect(R.denyMessage(r), `${r} 에 문구가 없다`).not.toBe("지금은 보상을 받을 수 없어요.");
    }
  });

  it("⭐ 프로토타입 키로 조회해도 함수가 안 나온다", () => {
    for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(typeof R.denyMessage(k)).toBe("string");
      expect(typeof R.denyStatus(k)).toBe("number");
    }
  });

  it("⭐ 문구가 내부 사유 문자열이나 금액을 그대로 노출하지 않는다", () => {
    for (const [reason, msg] of Object.entries(R.DENY_MESSAGE)) {
      expect(msg, `${reason} 문구에 내부 코드가 보인다`).not.toMatch(/[a-z]+_[a-z]+/);
      expect(msg).not.toMatch(/\d{3,}/);
    }
  });

  it("⭐ 재시도 가능 여부가 상태 코드로 구분된다", () => {
    expect(R.denyStatus("rate_limited")).toBe(429);
    expect(R.denyStatus("session_missing")).toBe(401);
    expect(R.denyStatus("student_daily_cap")).toBe(409); // 오늘은 끝 — 재시도 무의미
    expect(R.denyStatus("session_consumed")).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("배선과 순서 — 소스가 아니라 **실행 순서**를 본다", () => {
  const REWARD = codeOnly(read("functions/aap/reward.js"));
  const HANDLERS = codeOnly(read("functions/aap/handlers.js"));

  it("⭐ 트랜잭션 안에서 read 가 전부 write 보다 앞선다", () => {
    // 가짜 Firestore 가 이미 실행 중에 이걸 강제한다(write 뒤 read 면 throw).
    // 여기서는 **코드 순서**로도 한 번 더 못 박는다 — 새 read 가 아래쪽에 추가되는 걸 막는다.
    const tx = after(REWARD, "await db.runTransaction");
    const firstWrite = Math.min(
      ...["tx.update(", "tx.set(", "tx.create("].map((w) => {
        const i = tx.indexOf(w);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    expect(firstWrite).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(tx.slice(firstWrite), "write 뒤에 tx.get 이 있다").not.toContain("tx.get(");
  });

  it("⭐ 멱등 조회가 세션·정책·카탈로그보다 **먼저**다", () => {
    const tx = after(REWARD, "await db.runTransaction");
    // ⚠️ 컬렉션 이름으로 찾으면 안 된다 — 세션 ref 는 트랜잭션 **밖**에서 만들어지고
    //    안에서는 `tx.get(sessionRef)` 로만 쓰인다. 이름을 찾으면 -1 이 나와 단언이
    //    "먼저다"를 우연히 통과한다. 봐야 할 것은 **읽는 순서**다.
    const iGrant = tx.indexOf("tx.get(grantRef)");
    expect(iGrant, "멱등 조회를 못 찾았다").toBeGreaterThan(-1);
    for (const later of ["tx.get(sessionRef)", "tx.get(policyRef)", "tx.get(achievementRef)"]) {
      const i = tx.indexOf(later);
      expect(i, `${later} 를 못 찾았다`).toBeGreaterThan(-1);
      expect(iGrant, `멱등 조회가 ${later} 보다 뒤에 있다`).toBeLessThan(i);
    }
    // 그리고 멱등 히트면 **거기서 끝난다**(정책·캡을 다시 적용하지 않는다).
    const hit = tx.slice(iGrant, tx.indexOf("tx.get(sessionRef)"));
    expect(hit).toMatch(/duplicate: true/);
    expect(hit).toMatch(/return \{/);
  });

  it("⭐ 정책과 카탈로그를 **트랜잭션 안에서** 읽는다 (kill switch TOCTOU)", () => {
    const tx = after(REWARD, "await db.runTransaction");
    expect(tx).toMatch(/tx\.get\(policyRef\)/);
    expect(tx).toMatch(/tx\.get\(achievementRef\)/);
    // 트랜잭션 밖 읽기 헬퍼를 쓰면 읽은 뒤 꺼도 커밋된다.
    expect(REWARD, "정책을 트랜잭션 밖에서 읽는다").not.toMatch(/await readAppPolicy\(/);
    expect(REWARD, "카탈로그를 트랜잭션 밖에서 읽는다").not.toMatch(/resolveAchievement\(/);
  });

  it("⭐ 레이트리밋은 지급 트랜잭션 **밖**이고, 세션 조회보다 **앞**이다", () => {
    // ⚠️ 파일 전체가 아니라 **`grantAppReward` 본문 안**에서 봐야 한다 — 파일 위쪽의
    //    `passRateLimit` **정의**에도 `tx.get`·`runTransaction` 이 들어 있어서, 파일
    //    기준으로 자르면 헬퍼 정의를 "앞선 읽기"로 오독한다(이 단언을 처음 쓸 때 실제로 그랬다).
    const body = after(REWARD, "async function grantAppReward(");
    const iLimit = body.indexOf("await passRateLimit(");
    expect(iLimit, "레이트리밋 호출을 못 찾았다").toBeGreaterThan(-1);
    expect(iLimit).toBeLessThan(body.indexOf("await db.runTransaction"));
    // Firestore 를 **한 번도 읽기 전**이어야 "읽기만 태우기"가 막힌다.
    expect(body.slice(0, iLimit), "레이트리밋 앞에 Firestore 읽기가 있다")
      .not.toMatch(/\.get\(|runTransaction/);
    const tx = after(REWARD, "await db.runTransaction");
    expect(tx, "레이트리밋이 트랜잭션 안으로 들어갔다 — 실패한 호출이 안 남는다").not.toContain("aapRateLimits");
  });

  it("⭐ 원장·세션소비·활동로그가 **지급과 같은 트랜잭션**이다", () => {
    const tx = after(REWARD, "await db.runTransaction");
    expect(tx).toMatch(/tx\.create\(grantRef/);
    expect(tx).toMatch(/tx\.update\(sessionRef/);
    expect(tx).toMatch(/consumedGrantId/);
    expect(tx).toMatch(/activity_logs/);
  });

  it("⭐ 원장은 set 이 아니라 **create** 다 (경합에서 덮어쓰기 대신 실패해야 한다)", () => {
    expect(REWARD).toMatch(/tx\.create\(grantRef,/);
    expect(REWARD, "원장을 set 으로 쓰면 이중지급이 조용히 덮인다").not.toMatch(/tx\.set\(grantRef/);
  });

  it("⭐ 잔액은 **increment** 로 바꾼다 (절대값 덮어쓰기는 다른 거래를 무효화한다)", () => {
    const tx = after(REWARD, "tx.update(userRef");
    const block = tx.slice(0, tx.indexOf("});"));
    expect(block).toMatch(/cash: FieldValue\.increment\(amount\)/);
    expect(block).toMatch(/coupons: FieldValue\.increment\(amount\)/);
  });

  it("⭐ 지급 원장에 `utils.logActivity` 를 쓰지 않는다", () => {
    // 그쪽은 트랜잭션 밖에서 user 를 다시 읽고 내부 오류를 삼킨다 → 돈만 들어가고 기록이 없을 수 있다.
    expect(REWARD).not.toMatch(/logActivity/);
  });

  it("⭐ 발급이 실행권을 **쓴 뒤에** 토큰을 돌려준다 (fail-closed)", () => {
    const issue = after(HANDLERS, "exports.issueAppToken");
    const iSession = issue.indexOf("aapRewardSessions");
    const iReturn = issue.indexOf("launchUrl,");
    expect(iSession, "실행권 기록이 없다 — 지급 때 uid 를 알 방법이 없다").toBeGreaterThan(-1);
    expect(iSession).toBeLessThan(iReturn);
    // 기록에 실패하면 토큰도 안 준다.
    const block = issue.slice(iSession, iReturn);
    expect(block).toMatch(/catch[\s\S]*throw new HttpsError/);
  });

  it("⭐ 보상·학습기록이 **둘 다** 꺼진 앱에는 실행권을 쓰지 않는다 (실행마다 쓰기 1건은 비용이다)", () => {
    const issue = codeOnly(after(HANDLERS, "exports.issueAppToken"));
    // P1-3 에서 조건이 넓어졌다: 학습기록도 uid 를 찾으려면 같은 문서가 필요하다.
    // 넓어진 것과 **무조건 쓰는 것**은 다르다 — 둘 다 꺼지면 여전히 안 쓴다.
    expect(issue).toMatch(/rewardsEnabled === true \|\| policy\.statsEnabled === true/);
    const guard = issue.slice(issue.indexOf("const needsSession"), issue.indexOf("aapRewardSessions"));
    expect(guard, "실행권을 무조건 쓴다").toMatch(/if \(needsSession && !hasRole\)/);
  });

  it("⭐ 엔드포인트가 **실제로 export** 된다 (만들었다 ≠ 연결됐다)", () => {
    expect(codeOnly(read("functions/index.js"))).toMatch(/exports\.grantAppReward\s*=\s*aap\.grantAppReward/);
    expect(HANDLERS).toMatch(/exports\.grantAppReward = onRequest/);
  });

  it("⭐ 운영 장애를 판정 거부로 뭉개지 않는다", () => {
    const ep = after(HANDLERS, "exports.grantAppReward = onRequest");
    expect(ep).toMatch(/res\.status\(503\)/);
    expect(ep).toMatch(/retryable: true/);
    // 성공 응답이 캐시되면 "받았는데 안 받은" 상태가 생긴다.
    expect(ep).toMatch(/Cache-Control", "no-store/);
    // 쿠키를 쓰지 않으므로 CORS 는 열되 **자격증명은 절대 켜지 않는다**.
    expect(ep, "CORS 자격증명을 켰다").not.toMatch(/Allow-Credentials/);
  });

  it("⭐ 순수 규칙이 Firestore 를 모른다", () => {
    // ⚠️ 주석에 "firebase-admin" 이라는 **말**이 나온다(왜 안 쓰는지 적어 뒀다).
    //    주석을 걷어내고 봐야 "쓰는가"를 본다.
    const SRC = codeOnly(read("functions/aap/rewardRules.js"));
    expect(SRC).not.toMatch(/require\("\.\.\/utils"\)|firebase-admin|firestore/i);
  });
});

// ═══════════════════════════════════════════════════════════════
describe("규칙이 보상 계열을 잠근다", () => {
  const RULES = read("firestore.rules");

  it("⭐ 다섯 컬렉션이 전부 서버 전용이다", () => {
    for (const name of [
      "match /aapRewardSessions/{jti}",
      "match /appRewardGrants/{grantId}",
      "match /appRewardSubjects/{subjectId}",
      "match /appRewardCounters/{counterId}",
      "match /aapRateLimits/{bucketId}",
    ]) {
      const block = ruleBlock(RULES, name);
      expect(block, `${name} 이 클라이언트에 열려 있다`).toMatch(/allow read, write: if false;/);
      expect(block).not.toMatch(/isSignedIn|isOwner|isAdmin|isSameClass/);
    }
  });

  it("⭐ appRewardDaily 를 학생도 **교사도** 못 쓴다 (update·create 전부)", () => {
    const users = ruleBlock(RULES, "match /users/{userId}");
    // 🔴 codex CRITICAL(2026-08-21): 학생 분기만 막혀 있었다. 같은 학급 승인 교사가
    //    이 필드를 0 으로 되돌려 AAP 하루 상한을 무제한 재발급할 수 있었다(ALLOW 카나리아로 재현).
    //    블록리스트가 **둘 다** 있어야 한다 — 하나만 세면 이 결함이 다시 통과한다.
    const lists = [...users.matchAll(/affectedKeys\(\)\.hasAny\(\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(lists.length, "블록리스트 분기를 못 찾았다").toBeGreaterThanOrEqual(2);
    for (const [i, list] of lists.entries()) {
      expect(list, `${i}번째 블록리스트에 appRewardDaily 가 없다`).toContain("'appRewardDaily'");
    }
    // update 만 막으면 음수를 심은 채 문서를 만들어 한도를 **늘릴** 수 있다.
    const create = users.slice(users.indexOf("allow create:"), users.indexOf("allow update:"));
    expect(create, "create 에서 appRewardDaily 를 안 막는다").toContain("!('appRewardDaily' in request.resource.data)");
  });

  it("⭐ 손상된 카운터는 0 이 아니라 **판단 불가**다 (fail-closed)", () => {
    // 🔴 2026-08-21 codex WARNING. 처음엔 음수를 0 으로 바닥치고 숫자가 아니면 0 으로 읽었는데,
    //    그게 곧 fail-open 이었다: REST 로 정수를 **문자열**로 써 넣는 실수 하나면
    //    (`cash: "2000000"`) 이미 소진된 캡이 통째로 다시 열린다.
    for (const bad of ["2000000", -999999, 1.5, NaN, Infinity, true, {}, []]) {
      expect(R.dayTotals({ day: "d", cash: bad, coupon: 0 }, "d"), `${String(bad)} 를 0 으로 읽었다`).toBeNull();
      expect(R.dayTotals({ day: "d", cash: 0, coupon: bad }, "d")).toBeNull();
    }
    // 정상: 필드가 아예 없는 건 손상이 아니다(그 종류를 아직 안 받은 날).
    expect(R.dayTotals({ day: "d" }, "d")).toEqual({ cash: 0, coupon: 0 });
    expect(R.dayTotals({ day: "다른날", cash: "쓰레기" }, "d")).toEqual({ cash: 0, coupon: 0 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 🚨 자동 차단기 (P1-9)
//
//   1판은 경보 문서를 트랜잭션 안에서 `create()` 했다 — 그날 경보가 이미 있으면
//   ALREADY_EXISTS 로 **지급 전체가 롤백**된다. 경보를 만들려다 지급을 끄는 설계였다.
//   그래서 이 describe 의 핵심은 "경보가 남는가"가 아니라 **"경보가 지급을 못 죽이는가"** 다.
// ═══════════════════════════════════════════════════════════════
describe("차단기 — 보호는 원자적으로, 통지는 최선노력으로", () => {
  beforeEach(() => FAKE.reset());

  // ⚠️ 임계선을 **상수에서 계산하지 않는다.** 처음엔 `APP_CAP * R.BREAKER.TRIP_RATIO` 로 썼는데,
  //    그러면 비율을 1.0 으로 바꾸는 변이에서 **테스트도 같이 움직여** 통과해 버렸다(실측).
  //    기대값은 손으로 박아야 방어선이 잠긴다.
  const APP_CAP = 4000000;
  const ALERT_AT = 2000000;
  const TRIP_AT = 3200000;

  it("임계선이 설계 값 그대로다 (여기가 바뀌면 아래 테스트가 전부 거짓말이 된다)", () => {
    expect(R.GLOBAL_CEILING.APP_CASH_PER_DAY).toBe(APP_CAP);
    expect(Math.ceil(APP_CAP * R.BREAKER.ALERT_RATIO)).toBe(ALERT_AT);
    expect(Math.ceil(APP_CAP * R.BREAKER.TRIP_RATIO)).toBe(TRIP_AT);
  });
  const appCounter = () => FAKE.get(`appRewardCounters/${DAY}_app_${APP}`);
  const seedApp = (cash, extra = {}) =>
    FAKE.set(`appRewardCounters/${DAY}_app_${APP}`, { day: DAY, appId: APP, cash, coupon: 0, ...extra });
  const alertDoc = (kind) => FAKE.get(`platformAlerts/${DAY}_${APP}_${kind}`);

  it("경보선(50%)을 넘으면 경보가 남지만 **지급은 계속된다**", async () => {
    const issued = stage();
    seedApp(ALERT_AT - 1000);
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(appCounter().cashAlerted).toBe(true);
    expect(appCounter().cashTripped).toBe(false);
    expect(alertDoc("cash_alert").observed).toBe(ALERT_AT);
    // 경보는 잠그지 않는다 — 정책은 그대로 켜져 있어야 한다.
    expect(FAKE.get(`platformAppPolicies/${APP}`).rewardsEnabled).toBe(true);
  });

  it("⭐ 차단선(80%)을 넘으면 **정책이 꺼진다** — 자정에 안 풀리는 잠금", async () => {
    const issued = stage();
    seedApp(TRIP_AT - 1000);
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);   // 넘긴 그 건은 나간다
    expect(appCounter().cashTripped).toBe(true);
    const policy = FAKE.get(`platformAppPolicies/${APP}`);
    expect(policy.rewardsEnabled).toBe(false);
    expect(policy.rewardsDisabledReason).toBe("auto_breaker_cash");
    expect(alertDoc("cash_trip").tripped).toBe(true);
  });

  it("⭐ 차단된 뒤의 다음 지급은 **app_tripped** 로 거부된다 (교사가 끈 것과 구분된다)", async () => {
    const issued = stage();
    seedApp(TRIP_AT - 1000);
    await call(issued);                       // 여기서 정책이 자동으로 꺼진다
    const disabled = FAKE.get(`platformAppPolicies/${APP}`);
    expect(disabled.rewardsEnabled).toBe(false);
    expect(disabled.rewardsDisabledReason).toBe("auto_breaker_cash");

    // 새 실행권으로 다시 시도. ⚠️ 사유를 배열로 헤징하지 않는다 — 두 검사의 순서가
    //    뒤바뀌는 회귀를 못 잡는다(2026-08-21 Claude 리뷰 WARNING).
    const again = stage({ policy: disabled });
    seedApp(TRIP_AT, { cashTripped: true, cashAlerted: true });
    const out = await call(again, { clientRunId: "run2" });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("app_tripped");
  });

  it("교사가 손으로 끈 앱은 **rewards_off** 다 (사고가 아니다)", async () => {
    const issued = stage({ policy: { rewardsEnabled: false } });
    const out = await call(issued);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("rewards_off");
  });

  it("⭐ 경보 문서가 **이미 있어도** 지급이 성공한다 (1판 결함의 회귀 테스트)", async () => {
    const issued = stage();
    // 그날 경보가 이미 남아 있는 상태. 1판이면 여기서 ALREADY_EXISTS 로 지급이 죽었다.
    FAKE.set(`platformAlerts/${DAY}_${APP}_cash_alert`, { kind: "cash_alert", day: DAY, appId: APP });
    seedApp(ALERT_AT - 1000);
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(FAKE.get(`users/${UID}`).cash).toBe(2000);   // 1000 + 1000
  });

  it("경보 쓰기가 실패해도 지급은 살아남는다 (통지는 최선노력)", async () => {
    const issued = stage();
    seedApp(ALERT_AT - 1000);
    const { announceBreaker } = req("../../../functions/aap/reward.js");
    expect(typeof announceBreaker).toBe("function");
    // 경보 경로를 강제로 깨뜨린다.
    const orig = FAKE.db.collection;
    FAKE.db.collection = (name) =>
      name === "platformAlerts"
        ? { doc: () => ({ set: async () => { throw new Error("경보 저장소 장애"); } }) }
        : orig(name);
    try {
      const out = await call(issued);
      expect(out.ok, JSON.stringify(out)).toBe(true);
      expect(FAKE.get(`users/${UID}`).cash).toBe(2000);
    } finally {
      FAKE.db.collection = orig;
    }
  });

  it("⭐ 보상만 다시 켜면 **곧바로 다시 끊긴다** (방어가 조용히 사라지지 않는다)", async () => {
    // 처음엔 latch 를 전이(newlyTripped)로 걸었다. 그러면 운영자가 rewards-on 을 한 뒤엔
    // 이미 플래그가 서 있어 전이가 안 일어나고 **차단기가 통째로 무력해졌다.**
    // 상태(tripped)로 걸어야 재활성 후 첫 지급에서 다시 끊긴다.
    const issued = stage();                                   // rewardsEnabled: true (=수동 재활성 상태)
    seedApp(TRIP_AT, { cashTripped: true, cashAlerted: true }); // 이미 끊겨 있던 하루
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);           // 이 한 건은 통과한다
    const policy = FAKE.get(`platformAppPolicies/${APP}`);
    expect(policy.rewardsEnabled).toBe(false);                // 그리고 곧바로 다시 꺼진다
    expect(policy.rewardsDisabledReason).toBe("auto_breaker_cash");
  });

  it("⭐ breaker-reset(override)이 있으면 오늘은 통과한다 — 그리고 경보는 남는다", async () => {
    const issued = stage({ policy: { breakerOverrideDay: DAY } });
    seedApp(TRIP_AT, { cashTripped: true, cashAlerted: true });
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    // override 는 차단만 무시한다. 정책은 켜진 채로 남아야 복구가 성립한다.
    expect(FAKE.get(`platformAppPolicies/${APP}`).rewardsEnabled).toBe(true);
    expect(appCounter().cashTripped).toBe(false);
  });

  it("override 는 **어제 날짜면 안 듣는다** (자정에 저절로 만료)", async () => {
    const issued = stage({ policy: { breakerOverrideDay: "20260820" } });
    seedApp(TRIP_AT, { cashTripped: true, cashAlerted: true });
    await call(issued);
    expect(FAKE.get(`platformAppPolicies/${APP}`).rewardsEnabled).toBe(false);
  });

  it("override 라도 하드캡(100%)은 그대로 멈춘다", async () => {
    const issued = stage({ policy: { breakerOverrideDay: DAY } });
    seedApp(APP_CAP);   // 앱 하루 총량을 이미 다 썼다
    const out = await call(issued);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("app_total_daily_cap");
  });

  it("차단된 뒤에는 경보를 다시 쏘지 않는다 (플래그가 전이만 잡는다)", async () => {
    const issued = stage();
    seedApp(TRIP_AT - 1000);
    await call(issued);                     // 여기서 1회 전이
    const first = alertDoc("cash_trip").createdAt;
    expect(first).toBeTruthy();
    // 같은 상태에서 checkBreaker 를 다시 돌리면 전이가 아니어야 한다.
    const again = R.checkBreaker({
      used: TRIP_AT, amount: 1000, rewardType: "cash",
      appPerDay: APP_CAP, prev: { day: DAY, cashTripped: true, cashAlerted: true }, day: DAY,
    });
    expect(again.tripped).toBe(true);
    expect(again.newlyTripped).toBe(false);
    expect(again.newlyAlerted).toBe(false);
  });

  it("어제 플래그가 오늘 카운터·정책으로 새지 않는다", async () => {
    const issued = stage();
    FAKE.set(`appRewardCounters/${DAY}_app_${APP}`, {
      day: "20260820", appId: APP, cash: TRIP_AT, coupon: 0, cashTripped: true, cashAlerted: true,
    });
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    // 어제 플래그를 오늘 것으로 읽으면 여기가 무너진다.
    expect(appCounter().cashTripped).toBe(false);
    expect(appCounter().cashAlerted).toBe(false);
    expect(appCounter().cash).toBe(1000);   // 어제 누적이 오늘로 안 넘어온다
    expect(FAKE.get(`platformAppPolicies/${APP}`).rewardsEnabled).toBe(true);
  });

  it("어제의 차단 플래그는 오늘 지급을 막지 않는다", async () => {
    const issued = stage();
    FAKE.set(`appRewardCounters/${DAY}_app_${APP}`, {
      day: "20260820", appId: APP, cash: TRIP_AT, coupon: 0, cashTripped: true, cashAlerted: true,
    });
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
  });

  it("현금이 끊겨도 쿠폰 플래그는 따로다 (단위가 다르므로)", async () => {
    const issued = stage({
      // L0 는 앱·학생·하루 쿠폰 2장이 상한이라 amount×maxPerDay 가 2 를 넘으면
      // 카탈로그가 문서 자체를 거부한다(day_total_over_ceiling).
      achievement: { active: true, rewardType: "coupon", amount: 1, maxPerDay: 2, label: "쿠폰" },
    });
    seedApp(TRIP_AT, { cashTripped: true, cashAlerted: true });
    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);   // 쿠폰은 아직 안 끊겼다
    expect(appCounter().couponTripped).toBe(false);
    expect(appCounter().cashTripped).toBe(true);      // 현금 플래그는 그대로
  });
});

// ═══════════════════════════════════════════════════════════════
// 🔬 구조 — 코드가 어디에 있는지가 곧 계약인 것들
// ═══════════════════════════════════════════════════════════════
describe("차단기 구조", () => {
  const REWARD = read("functions/aap/reward.js");

  it("경보는 트랜잭션 **밖**에서 불린다", () => {
    const body = after(REWARD, "async function grantAppReward(");
    const txEnd = body.indexOf("await db.runTransaction");
    const callAt = body.indexOf("announceBreaker(");
    expect(txEnd).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    // 트랜잭션 콜백이 닫힌 뒤(= `});` 다음)에 호출돼야 한다.
    const closeAt = body.indexOf("\n    });", txEnd);
    expect(closeAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(closeAt);
  });

  it("트랜잭션 콜백 안에서 logger 를 부르지 않는다 (재실행되면 유령 경보가 남는다)", () => {
    const body = after(REWARD, "async function grantAppReward(");
    const start = body.indexOf("await db.runTransaction");
    const end = body.indexOf("\n    });", start);
    const inside = codeOnly(body.slice(start, end));
    // 카운터 손상 로그 하나는 의도적 예외 — 그건 **거부**라 커밋되지 않고, 남겨야 원인을 안다.
    const hits = inside.match(/logger\.(info|warn|error)\(/g) || [];
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it("정책 latch 는 트랜잭션 **안**에서 걸린다 (보호는 원자적이어야 한다)", () => {
    const body = after(REWARD, "async function grantAppReward(");
    const start = body.indexOf("await db.runTransaction");
    const end = body.indexOf("\n    });", start);
    const inside = body.slice(start, end);
    expect(inside).toMatch(/tx\.update\(policyRef,\s*\{\s*\n?\s*rewardsEnabled: false/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 🎫 발급 레이트리밋의 순수 부분 (P1-9)
// ═══════════════════════════════════════════════════════════════
describe("발급 버킷 — 키와 설정", () => {
  it("uid 를 문서 경로에 그대로 붙이지 않는다", () => {
    // 커스텀 uid 는 임의 문자열이라 `/`·`.`·`__proto__` 가 올 수 있다. 해시가 그걸 다 지운다.
    for (const uid of ["some-uid", "a/b", "..", "__proto__", "가나다", "x".repeat(300)]) {
      const key = R.bucketKeyForUid(uid);
      expect(key).toMatch(/^tok_[0-9a-f]{32}$/);
      expect(key).not.toContain(uid.slice(0, 3));
    }
  });

  it("같은 uid 는 같은 키, 다른 uid 는 다른 키", () => {
    expect(R.bucketKeyForUid("u1")).toBe(R.bucketKeyForUid("u1"));
    expect(R.bucketKeyForUid("u1")).not.toBe(R.bucketKeyForUid("u2"));
  });

  it("발급 키는 지급 키(32자리 hex sub)와 **구조적으로** 겹칠 수 없다", () => {
    // 지급 버킷 키는 sub 자체(접두사 없음). 발급은 항상 tok_ 로 시작한다.
    expect(R.bucketKeyForUid("anything").startsWith("tok_")).toBe(true);
    expect(/^[0-9a-f]{32}$/.test(R.bucketKeyForUid("anything"))).toBe(false);
  });

  it("⭐ consumeBucket 이 넘겨준 설정을 **실제로** 쓴다", () => {
    // 예전엔 모듈 상수를 직접 참조해서, 발급용 설정을 넘겨도 조용히 지급용(30)이 적용됐다.
    const tight = { CAPACITY: 3, REFILL_MS: 1000 };
    expect(R.consumeBucket(null, 0, tight).next.tokens).toBe(2);
    expect(R.consumeBucket(null, 0).next.tokens).toBe(R.RATE_LIMIT.CAPACITY - 1);
    // 용량을 넘겨 저장돼 있어도 넘겨준 설정으로 조인다.
    expect(R.consumeBucket({ tokens: 99, lastRefillMs: 0 }, 0, tight).next.tokens).toBe(2);
    // 3개를 다 쓰면 거부된다(기본 설정이었다면 아직 27개 남았을 것이다).
    let st = { tokens: 3, lastRefillMs: 0 };
    for (let i = 0; i < 3; i += 1) st = R.consumeBucket(st, 0, tight).next;
    expect(R.consumeBucket(st, 0, tight).allowed).toBe(false);
  });

  it("발급 설정은 지급 설정보다 촘촘하다 (앱 여는 동작은 드물다)", () => {
    expect(R.TOKEN_RATE_LIMIT.CAPACITY).toBe(20);
    expect(R.TOKEN_RATE_LIMIT.REFILL_MS).toBe(6000);
    expect(Object.isFrozen(R.TOKEN_RATE_LIMIT)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 🔬 발급 경로의 구조 — onCall 하네스 없이 잠글 수 있는 것들
//    (issueAppToken 은 onCall 이라 이 파일의 가짜로는 못 부른다. 대신 **순서**를 본다 —
//     순서가 곧 방어인 항목들이다.)
// ═══════════════════════════════════════════════════════════════
describe("발급 구조", () => {
  const H = read("functions/aap/handlers.js");
  const B = read("functions/aap/rateBucket.js");
  const ISSUE = codeOnly(after(H, "exports.issueAppToken = onCall("));

  it("⭐ 레이트리밋이 사용자 문서 읽기보다 **앞**이다", () => {
    const limitAt = ISSUE.indexOf("passIssueRateLimit(");
    const readAt = ISSUE.indexOf("checkAuthAndGetUserData(");
    expect(limitAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(-1);
    expect(limitAt).toBeLessThan(readAt);
  });

  it("레이트리밋에 걸리면 발급을 중단한다 (경고만 찍고 지나가지 않는다)", () => {
    expect(ISSUE).toMatch(/if \(!\(await passIssueRateLimit\([\s\S]{0,40}?\)\)\) \{[\s\S]{0,160}?throw new HttpsError/);
  });

  it("⭐ 역할 계정에는 실행권을 만들지 않는다", () => {
    expect(ISSUE).toMatch(/if \(needsSession && !hasRole\)/);
    // 지급 쪽 역할 검사와 같은 세 필드를 본다 — 한쪽만 늘면 다시 어긋난다.
    for (const f of ["isSuperAdmin", "isAdmin", "isTeacher"]) {
      expect(ISSUE).toMatch(new RegExp(`userData\\?\\.${f} === true`));
    }
  });

  // 버킷 구현은 2026-08-21 에 `rateBucket.js` 한 곳으로 모았다(세 벌이 될 참이었다).
  // 그래서 "어느 키·어느 설정" 단언은 그 파일을 본다.
  it("발급 버킷은 해시 키를 쓴다 (uid 원문이 경로에 안 들어간다)", () => {
    expect(B).toMatch(/docId: R\.bucketKeyForUid\(uid\)/);
  });

  it("발급 버킷은 발급용 설정을 넘긴다", () => {
    expect(after(B, "function passIssueBucket(")).toMatch(/limit: R\.TOKEN_RATE_LIMIT/);
  });

  it("handlers 는 버킷을 직접 구현하지 않는다 (구현이 한 벌이어야 한다)", () => {
    expect(H).not.toMatch(/R\.consumeBucket\(/);
    expect(H).toMatch(/passIssueBucket\(uid, Date\.now\(\)\)/);
  });

  it("두 함수 모두 동시 인스턴스 천장이 있다 (레이트리밋은 청구액을 못 막는다)", () => {
    expect(H).toMatch(/const MAX_INSTANCES = \d+;/);
    expect(after(H, "exports.issueAppToken = onCall(")).toMatch(/maxInstances: MAX_INSTANCES/);
    expect(after(H, "exports.grantAppReward = onRequest(")).toMatch(/maxInstances: MAX_INSTANCES/);
  });
});

// ═══════════════════════════════════════════════════════════════
// ↩️ 환수 (P1-9b)
//
//   지급은 국고를 건드리지 않는 **순수 발행**이다. 그러니 환수도 **순수 소각**이어야 한다 —
//   국고에 넣으면 없던 돈이 생긴다. 이 describe 의 첫 번째 불변식이 그것이다.
// ═══════════════════════════════════════════════════════════════
describe("환수 — 발행의 반대는 회수가 아니라 소각이다", () => {
  const { clawbackAppReward, ClawbackDenied, clawbackError } = req("../../../functions/aap/clawback.js");
  const CLAWBACK_SRC = read("functions/aap/clawback.js");
  const GID = "a".repeat(64);
  const TEACHER = "teacher00000000000000000001";
  const TREASURY = "treasury0000000000000000001";

  const seedGrant = (over = {}) => {
    FAKE.reset();
    FAKE.set(`users/${UID}`, { name: "테스트학생", classCode: CLASS, cash: 5000, coupons: 3 });
    FAKE.set(`users/${TEACHER}`, { name: "선생님", classCode: CLASS, isAdmin: true, cash: 999999 });
    FAKE.set(`users/${TREASURY}`, { name: "국고", classCode: CLASS, isAdmin: true, cash: 100000 });
    FAKE.set(`appRewardGrants/${GID}`, {
      requestHash: GID, uid: UID, classCode: CLASS, appId: APP,
      achievementId: "stage_clear", label: "1단 통과",
      rewardType: "cash", amount: 1000, revocable: true, kstDay: DAY, ...over,
    });
  };
  const claw = (over = {}) =>
    clawbackAppReward({
      callerUid: TEACHER, callerName: "선생님", callerClass: CLASS,
      isSuperAdmin: false, grantId: GID, nowMs: NOW, ...over,
    });
  const denied = async (fn) => {
    try { await fn(); return null; } catch (e) {
      if (e instanceof ClawbackDenied) return e.reason;
      throw e;
    }
  };

  it("⭐ 학생 잔액만 줄고 **어디에도 적립되지 않는다** (소각)", async () => {
    seedGrant();
    const before = FAKE.get(`users/${TREASURY}`).cash;
    const out = await claw();
    expect(out.success).toBe(true);
    expect(out.recoveredAmount).toBe(1000);
    expect(FAKE.get(`users/${UID}`).cash).toBe(4000);
    // 국고·교사 어느 쪽에도 들어가면 안 된다 — 지급이 거기서 나온 돈이 아니다.
    expect(FAKE.get(`users/${TREASURY}`).cash).toBe(before);
    expect(FAKE.get(`users/${TEACHER}`).cash).toBe(999999);
  });

  it("역원장이 생기고 지급 원장은 **그대로**다 (append-only)", async () => {
    seedGrant();
    await claw();
    const back = FAKE.get(`appRewardClawbacks/${GID}`);
    expect(back.recoveredAmount).toBe(1000);
    expect(back.shortfall).toBe(0);
    expect(back.byUid).toBe(TEACHER);
    // 원장은 손대지 않는다.
    expect(FAKE.get(`appRewardGrants/${GID}`)).toEqual(
      expect.objectContaining({ amount: 1000, revocable: true }),
    );
    expect(FAKE.get(`appRewardGrants/${GID}`).clawedBack).toBeUndefined();
  });

  it("⭐ 두 번 환수해도 두 번 빠지지 않는다 (문서 id 가 멱등키)", async () => {
    seedGrant();
    await claw();
    const out2 = await claw();
    expect(out2.duplicate).toBe(true);
    expect(FAKE.get(`users/${UID}`).cash).toBe(4000);   // 3000 이 아니다
  });

  it("잔액이 모자라면 있는 만큼만 — 0 아래로 안 내려간다", async () => {
    seedGrant({ amount: 8000 });
    const out = await claw();
    expect(out.recoveredAmount).toBe(5000);
    expect(out.shortfall).toBe(3000);
    expect(FAKE.get(`users/${UID}`).cash).toBe(0);
    expect(FAKE.get(`appRewardClawbacks/${GID}`).shortfall).toBe(3000);
  });

  it("⭐ 잔액이 손상돼 있으면 **아무것도 하지 않는다** (0원 환수 완료로 확정하지 않는다)", async () => {
    seedGrant();
    FAKE.set(`users/${UID}`, { ...FAKE.get(`users/${UID}`), cash: "5000" });   // 문자열
    expect(await denied(() => claw())).toBe("balance_corrupt");
    // 기록이 남으면 나머지가 영구 회수 불가가 된다.
    expect(FAKE.get(`appRewardClawbacks/${GID}`)).toBeUndefined();
  });

  it("쿠폰도 같은 규칙으로 소각된다", async () => {
    seedGrant({ rewardType: "coupon", amount: 2 });
    const out = await claw();
    expect(out.recoveredAmount).toBe(2);
    expect(FAKE.get(`users/${UID}`).coupons).toBe(1);
    expect(FAKE.get(`users/${UID}`).cash).toBe(5000);   // 현금은 안 건드린다
  });

  it("⭐ 하루 카운터·성취 횟수는 하나도 되돌리지 않는다 (환수→재지급 무한 우회 차단)", async () => {
    seedGrant();
    FAKE.set(`users/${UID}`, { ...FAKE.get(`users/${UID}`), appRewardDaily: { day: DAY, cash: 1000, coupon: 0 } });
    FAKE.set(`appRewardSubjects/${UID}_${APP}`, { day: DAY, cash: 1000, coupon: 0 });
    FAKE.set(`appRewardCounters/${DAY}_app_${APP}`, { day: DAY, cash: 1000, coupon: 0, cashTripped: true });
    await claw();
    expect(FAKE.get(`users/${UID}`).appRewardDaily).toEqual({ day: DAY, cash: 1000, coupon: 0 });
    expect(FAKE.get(`appRewardSubjects/${UID}_${APP}`).cash).toBe(1000);
    expect(FAKE.get(`appRewardCounters/${DAY}_app_${APP}`).cash).toBe(1000);
    expect(FAKE.get(`appRewardCounters/${DAY}_app_${APP}`).cashTripped).toBe(true);
  });

  // ── 인가 ──
  it("⭐ 다른 학급 교사는 못 건드린다 (grantId 는 비밀이 아니다)", async () => {
    seedGrant();
    expect(await denied(() => claw({ callerClass: "OTHER1" }))).toBe("other_class");
    expect(FAKE.get(`users/${UID}`).cash).toBe(5000);
  });

  it("전학 간 학생은 교사가 못 되돌린다 (원장 학급은 맞아도 지금 학급이 다르다)", async () => {
    seedGrant();
    FAKE.set(`users/${UID}`, { ...FAKE.get(`users/${UID}`), classCode: "OTHER1" });
    expect(await denied(() => claw())).toBe("other_class");
  });

  it("전학 간 학생도 슈퍼관리자는 되돌릴 수 있다", async () => {
    seedGrant();
    FAKE.set(`users/${UID}`, { ...FAKE.get(`users/${UID}`), classCode: "OTHER1" });
    const out = await claw({ isSuperAdmin: true, callerClass: "" });
    expect(out.recoveredAmount).toBe(1000);
  });

  it("⭐ revocable:false 는 교사가 못 되돌린다", async () => {
    seedGrant({ revocable: false });
    expect(await denied(() => claw())).toBe("not_revocable");
  });

  it("revocable:false 를 슈퍼관리자가 되돌리려면 **사유가 있어야** 한다", async () => {
    seedGrant({ revocable: false });
    expect(await denied(() => claw({ isSuperAdmin: true }))).toBe("reason_required");
    const out = await claw({ isSuperAdmin: true, reason: "카탈로그 오설정으로 잘못 지급" });
    expect(out.recoveredAmount).toBe(1000);
    expect(FAKE.get(`appRewardClawbacks/${GID}`).reason).toContain("오설정");
  });

  it("학급코드가 빈 호출자는 통과하지 못한다 (빈 문자열끼리 맞아떨어지지 않게)", async () => {
    seedGrant({ classCode: "" });
    FAKE.set(`users/${UID}`, { ...FAKE.get(`users/${UID}`), classCode: "" });
    expect(await denied(() => claw({ callerClass: "" }))).toBe("other_class");
  });

  // ── 입력 ──
  it("grantId 형식이 아니면 읽기도 하지 않는다", async () => {
    seedGrant();
    for (const bad of ["", "../users/x", "A".repeat(64), "a".repeat(63), "__proto__", null]) {
      expect(await denied(() => claw({ grantId: bad }))).toBe("bad_grant_id");
    }
  });

  it("없는 지급은 not_found (환수 기록도 안 남는다)", async () => {
    seedGrant();
    expect(await denied(() => claw({ grantId: "b".repeat(64) }))).toBe("grant_not_found");
  });

  it("원장 금액이 이상하면 되돌리지 않는다", async () => {
    for (const bad of [0, -100, 1.5, "1000", null]) {
      seedGrant({ amount: bad });
      expect(await denied(() => claw())).toBe("bad_grant_amount");
    }
  });

  it("⭐ 소수 잔액도 손상으로 본다 (이 경제는 소수를 쓰지 않는다)", async () => {
    // isFinite 로 완화하면 5000.5 가 통과해 잔액이 영원히 소수로 남는다.
    for (const bad of [5000.5, NaN, Infinity, null, undefined, "5000"]) {
      seedGrant();
      FAKE.set(`users/${UID}`, { ...FAKE.get(`users/${UID}`), cash: bad });
      expect(await denied(() => claw()), String(bad)).toBe("balance_corrupt");
      expect(FAKE.get(`appRewardClawbacks/${GID}`)).toBeUndefined();
    }
  });

  it("사유 코드 조회가 프로토타입 키에서 새지 않는다", () => {
    for (const k of ["constructor", "toString", "__proto__", "hasOwnProperty", "nope"]) {
      expect(clawbackError(k)).toEqual(["failed-precondition", "지금은 환수할 수 없습니다."]);
    }
    expect(clawbackError("other_class")[0]).toBe("permission-denied");
  });

  it("역원장은 **create** 로 쓴다 (가짜 Firestore 가 재현 못 하는 경합 방어)", () => {
    // 멱등 조회가 무력화되는 경합에서도 `create` 면 이중 환수가 아니라 **실패**가 된다.
    // set 이면 조용히 덮어써서 두 번 빠진다 — 순차 실행만 하는 가짜로는 못 잡는다.
    expect(codeOnly(CLAWBACK_SRC)).toMatch(/tx\.create\(clawbackRef,/);
    expect(codeOnly(CLAWBACK_SRC)).not.toMatch(/tx\.set\(clawbackRef,/);
  });

  it("학생 거래내역에 **음수**로 남는다 (지급이 양수로 남는 자리와 같은 곳)", async () => {
    seedGrant();
    await claw();
    const logs = [...FAKE.store.entries()].filter(([k]) => k.startsWith("activity_logs/"));
    expect(logs).toHaveLength(1);
    const [, log] = logs[0];
    expect(log.userId).toBe(UID);
    expect(log.amount).toBe(-1000);
    expect(log.metadata.source).toBe("aap_clawback");
    expect(log.metadata.grantId).toBe(GID);
  });
});

// ═══════════════════════════════════════════════════════════════
// 🔬 환수 진입점(onCall)의 구조 — 순수 로직 밑의 **배선 계층**
//    형제 함수(grantAppReward)는 이 계층을 구조 테스트로 덮는데 환수만 비어 있었다
//    (2026-08-21 Claude 리뷰 WARNING).
// ═══════════════════════════════════════════════════════════════
describe("환수 진입점 구조", () => {
  const H = read("functions/aap/handlers.js");
  const ENTRY = after(H, "exports.clawbackAppReward = onCall(");

  it("관리자 권한을 요구한다 (checkAdmin=true)", () => {
    expect(codeOnly(ENTRY)).toMatch(/checkAuthAndGetUserData\(request,\s*true\)/);
  });

  it("호출자 신원을 **서버에서** 만든다 (요청 본문에서 받지 않는다)", () => {
    const body = codeOnly(ENTRY);
    for (const f of ["callerUid: uid", "callerClass: classCode", "isSuperAdmin,"]) {
      expect(body).toContain(f);
    }
    // 학급·슈퍼관리자 여부를 request.data 에서 읽으면 교사가 스스로 승격한다.
    expect(body).not.toMatch(/callerClass:\s*request\.data/);
    expect(body).not.toMatch(/isSuperAdmin:\s*request\.data/);
  });

  it("사유 코드를 HttpsError 로 옮기되 **순수 매퍼**를 쓴다", () => {
    expect(codeOnly(ENTRY)).toMatch(/clawbackError\(e\.reason\)/);
    expect(codeOnly(ENTRY)).toMatch(/e instanceof ClawbackDenied/);
  });

  it("판정 거부가 아닌 오류는 삼키지 않고 그대로 올린다", () => {
    // 운영 장애(Firestore UNAVAILABLE 등)를 "환수할 수 없습니다"로 뭉개면 원인이 안 남는다.
    expect(codeOnly(ENTRY)).toMatch(/\}\s*\n\s*throw e;\s*\n\s*\}/);
  });

  it("동시 인스턴스 천장이 있다", () => {
    expect(ENTRY.slice(0, 200)).toMatch(/maxInstances: MAX_INSTANCES/);
  });
});

// ═══════════════════════════════════════════════════════════════
// 📚 학습기록 (P1-3)
//
//   돈이 아니다. 그래서 지급의 방어선(세션 1회용 소비·멱등 원장·네 축 캡)을 그대로
//   지고 오지 않는다 — 대신 **쓰기 비용**을 막는다(레이트리밋·하루 이벤트·하루 초).
//   이 describe 가 지키는 것:
//     ① 세션을 읽되 **소비하지 않는다**(한 실행에서 여러 번 기록하는 게 정상)
//     ② 집계는 경로가 아니라 **필드**로도 식별된다(계획서 C15)
//     ③ 세션 수는 토큰 수명이 아니라 **시간 공백**으로 센다
// ═══════════════════════════════════════════════════════════════
describe("학습기록 — 돈이 아닌 기록", () => {
  const L = req("../../../functions/aap/learningRules.js");
  const { recordLearningEvent, LearningDenied } = req("../../../functions/aap/learning.js");

  const stageStats = (over = {}) => {
    FAKE.reset();
    FAKE.set(`users/${UID}`, { name: "테스트학생", classCode: CLASS, cash: 1000, coupons: 0 });
    FAKE.set(`platformAppPolicies/${APP}`, {
      status: "active", aapEnabled: true, statsEnabled: true, rewardsEnabled: false,
      trustLevel: "L0", launchUrl: "https://apps.example.com/gugu/",
      dailyCashCap: 0, dailyCouponCap: 0, ...(over.policy || {}),
    });
    const issued = signAppToken({ appId: APP, uid: UID, salt: SALT, nowMs: NOW });
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      uid: UID, classCode: CLASS, appId: APP, sub: issued.sub, exp: issued.exp,
      ...(over.session || {}),
    });
    return issued;
  };
  const rec = (issued, body = {}, nowMs = NOW) =>
    recordLearningEvent({
      body: { kind: "clear", sec: 45, score: 120, ...body },
      headerToken: issued.token,
      nowMs,
    });
  const statsDoc = () => FAKE.get(L.statsPath(CLASS, UID, DAY, APP));
  const rawEvents = () => [...FAKE.store.entries()].filter(([k]) => k.startsWith("appLearningEvents/"));
  const deniedL = async (fn) => {
    const out = await fn().catch((e) => {
      if (e instanceof LearningDenied) return { ok: false, reason: e.reason };
      throw e;
    });
    return out.ok === false ? out.reason : null;
  };

  it("⭐ 집계와 원시 이벤트가 **같이** 생긴다", async () => {
    const issued = stageStats();
    const out = await rec(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const s = statsDoc();
    expect(s.events).toBe(1);
    expect(s.sec).toBe(45);
    expect(s.best).toBe(120);
    expect(s.sessions).toBe(1);
    expect(rawEvents()).toHaveLength(1);
  });

  it("⭐ 경로가 **계층**이다 (이어붙이기 id 는 문서를 충돌시킨다 — 계획서 C14)", async () => {
    // ⚠️ 기대 경로를 `L.statsPath()` 로 만들지 않는다 — 그러면 경로를 바꾸는 변이에서
    //    테스트도 같이 움직여 통과한다(이 저장소에서 이미 두 번 당했다).
    const issued = stageStats();
    await rec(issued);
    const key = `classes/${CLASS}/learningStats/${UID}/days/${DAY}/apps/${APP}`;
    expect(FAKE.get(key), "집계가 계층 경로에 없다").toBeTruthy();
    // `${classCode}_${uid}_${day}` 류의 이어붙이기는 (a_b,c) 와 (a,b_c) 가 충돌한다.
    expect([...FAKE.store.keys()].some((k) => k.includes(`${CLASS}_${UID}`))).toBe(false);
  });

  it("⭐ 다른 앱의 실행권으로는 기록하지 못한다", async () => {
    // sub 재계산만으로는 못 막는다: 같은 학생이면 pairwise(appId, uid) 가 토큰 sub 와 맞아
    // **남의 앱 실행권이 통과**한다. appId·sub 대조가 그 자리를 막는다.
    const issued = stageStats();
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      ...FAKE.get(`aapRewardSessions/${issued.jti}`), appId: "other-app",
    });
    expect(await deniedL(() => rec(issued))).toBe("session_mismatch");
  });

  it("실행권의 sub 가 토큰과 다르면 거부한다", async () => {
    const issued = stageStats();
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      ...FAKE.get(`aapRewardSessions/${issued.jti}`), sub: "f".repeat(32),
    });
    expect(await deniedL(() => rec(issued))).toBe("session_mismatch");
  });

  it("⭐ 식별값이 경로에만 있지 않다 (경로 안의 값은 쿼리할 수 없다 — 계획서 C15)", async () => {
    const issued = stageStats();
    await rec(issued);
    const s = statsDoc();
    expect(s.classCode).toBe(CLASS);
    expect(s.uid).toBe(UID);
    expect(s.date).toBe(DAY);
    expect(s.appId).toBe(APP);
  });

  it("⭐ 세션을 **소비하지 않는다** (한 실행에서 여러 번 기록하는 게 정상)", async () => {
    const issued = stageStats();
    await rec(issued);
    await rec(issued, { sec: 30, score: 200 });
    await rec(issued, { sec: 10 });
    expect(FAKE.get(`aapRewardSessions/${issued.jti}`).consumedGrantId).toBeUndefined();
    const s = statsDoc();
    expect(s.events).toBe(3);
    expect(s.sec).toBe(85);
    expect(s.best).toBe(200);
    expect(s.sessions).toBe(1);   // 같은 시각대라 한 세션
  });

  it("지급으로 이미 소비된 세션도 기록은 받는다", async () => {
    const issued = stageStats({ session: { consumedGrantId: "g1" } });
    const out = await rec(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
  });

  it("⭐ 세션 수는 **시간 공백**으로 센다 (토큰이 5분마다 갈려도 1세션)", async () => {
    // ⚠️ 토큰 수명이 5분이라 뒤의 이벤트는 **새 토큰**이어야 한다. 그게 바로 이 테스트가
    //    지키려는 것이다 — 토큰이 갈려도(=jti 가 바뀌어도) 세션은 안 는다.
    const mint = (atMs) => {
      const t = signAppToken({ appId: APP, uid: UID, salt: SALT, nowMs: atMs });
      FAKE.set(`aapRewardSessions/${t.jti}`, {
        uid: UID, classCode: CLASS, appId: APP, sub: t.sub, exp: t.exp,
      });
      return t;
    };
    stageStats();
    await rec(mint(NOW), {}, NOW);
    await rec(mint(NOW + 6 * 60 * 1000), {}, NOW + 6 * 60 * 1000);   // 새 토큰·새 jti
    expect(statsDoc().sessions, "토큰이 갈렸다고 세션이 늘면 안 된다").toBe(1);
    await rec(mint(NOW + 40 * 60 * 1000), {}, NOW + 40 * 60 * 1000); // 30분 이상 공백
    expect(statsDoc().sessions, "30분 넘게 끊기면 새 세션이다").toBe(2);
  });

  it("statsEnabled 가 꺼져 있으면 기록하지 않는다", async () => {
    const issued = stageStats({ policy: { statsEnabled: false } });
    const out = await rec(issued);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("stats_off");
    expect(rawEvents()).toHaveLength(0);
  });

  it("세션이 없으면 uid 를 모르므로 기록하지 않는다", async () => {
    const issued = stageStats();
    FAKE.store.delete(`aapRewardSessions/${issued.jti}`);
    expect(await deniedL(() => rec(issued))).toBe("session_missing");
  });

  it("남의 세션으로는 기록하지 못한다 (sub 재계산 대조)", async () => {
    const issued = stageStats();
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      ...FAKE.get(`aapRewardSessions/${issued.jti}`), uid: "otherstudent000000000000001",
    });
    expect(await deniedL(() => rec(issued))).toBe("session_mismatch");
  });

  it("만료된 세션은 거부한다", async () => {
    const issued = stageStats();
    FAKE.set(`aapRewardSessions/${issued.jti}`, {
      ...FAKE.get(`aapRewardSessions/${issued.jti}`), exp: Math.floor(NOW / 1000) - 1,
    });
    expect(await deniedL(() => rec(issued))).toBe("session_expired");
  });

  it("위조 토큰은 읽기 전에 막힌다", async () => {
    stageStats();
    const out = await recordLearningEvent({ body: { kind: "clear" }, headerToken: "a.b.c", nowMs: NOW });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("token_invalid");
  });

  // ── 입력 ──
  it("종류는 허용 목록이다 (프로토타입 키 포함)", async () => {
    const issued = stageStats();
    for (const kind of ["constructor", "toString", "__proto__", "hack", "", 1, null]) {
      const out = await rec(issued, { kind });
      expect(out.ok, String(kind)).toBe(false);
      expect(out.reason).toBe("bad_kind");
    }
  });

  it("초·점수는 정수여야 한다 (\"45\" 가 45 로 통과하지 않는다)", async () => {
    const issued = stageStats();
    for (const sec of ["45", 45.5, -1, NaN, L.LIMITS.MAX_SEC_PER_EVENT + 1]) {
      expect((await rec(issued, { sec })).reason, String(sec)).toBe("bad_sec");
    }
    for (const score of ["1", 1.5, -1, L.LIMITS.MAX_SCORE + 1]) {
      expect((await rec(issued, { score })).reason, String(score)).toBe("bad_score");
    }
  });

  it("점수를 안 보내도 기록된다 (best 는 그대로)", async () => {
    const issued = stageStats();
    await rec(issued, { score: 500 });
    await rec(issued, { score: undefined });
    expect(statsDoc().best).toBe(500);
    expect(statsDoc().events).toBe(2);
  });

  it("meta 는 크기와 형식을 제한한다", async () => {
    const issued = stageStats();
    expect((await rec(issued, { meta: [] })).reason).toBe("bad_meta");
    expect((await rec(issued, { meta: { a: "x".repeat(200) } })).reason).toBe("bad_meta");
    expect((await rec(issued, { meta: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 1])) })).reason).toBe("bad_meta");
    // 🔴 2026-08-21 codex — **키 길이**는 안 재고 있었다. 2MB 짜리 키 하나가 검증을 통과해
    //    Firestore 쓰기에서 터지면, 읽기·레이트리밋 쓰기를 다 태운 뒤 retryable 503 이 나가
    //    재시도까지 부른다. 통과시킬 수 없는 것은 읽기 **전에** 떨군다.
    expect((await rec(issued, { meta: { ["k".repeat(200)]: true } })).reason).toBe("bad_meta");
    expect((await rec(issued, { meta: { ok: "짧음", n: 3, b: true } })).ok).toBe(true);
  });

  // 🔴 2026-08-21 codex — 인증·레이트 계열이 상태표에 없어 전부 기본값 409 로 나갔다.
  //    409 를 받은 위성앱은 재발급을 안 하고 **죽은 토큰으로 무한 재시도**한다.
  it("⭐ 거부 상태코드가 지급 경로와 **같은 계약**이다", () => {
    expect(L.denyStatus("token_invalid")).toBe(401);
    expect(L.denyStatus("session_missing")).toBe(401);
    expect(L.denyStatus("session_mismatch")).toBe(401);
    expect(L.denyStatus("session_expired")).toBe(401);
    expect(L.denyStatus("stats_off")).toBe(403);
    expect(L.denyStatus("disabled")).toBe(403);
    expect(L.denyStatus("not_migrated")).toBe(403);
    expect(L.denyStatus("not_registered")).toBe(404);
    expect(L.denyStatus("rate_limited")).toBe(429);
    expect(L.denyStatus("event_daily_cap")).toBe(429);
    expect(L.denyStatus("malformed")).toBe(400);
    expect(L.denyStatus("알 수 없는 사유"), "모르는 사유만 409").toBe(409);
  });

  it("⭐ 인증 계열은 하나도 409 로 새지 않는다", () => {
    for (const r of ["token_invalid", "session_missing", "session_mismatch", "session_expired"]) {
      expect(L.denyStatus(r), `${r} 가 409 로 샜다`).not.toBe(409);
    }
  });

  // ── 상한 (돈이 아니라 **쓰기 비용**의 방어선) ──
  it("⭐ 하루 이벤트 상한을 넘으면 거부한다", async () => {
    const issued = stageStats();
    FAKE.set(L.statsPath(CLASS, UID, DAY, APP), {
      classCode: CLASS, uid: UID, date: DAY, appId: APP,
      events: L.LIMITS.EVENTS_PER_SUBJECT_PER_DAY, sec: 0, sessions: 1, best: 0, lastEventAt: NOW,
    });
    expect(await deniedL(() => rec(issued, { sec: 0 }))).toBe("event_daily_cap");
  });

  it("하루 누적 초 상한을 넘으면 거부한다", async () => {
    const issued = stageStats();
    FAKE.set(L.statsPath(CLASS, UID, DAY, APP), {
      classCode: CLASS, uid: UID, date: DAY, appId: APP,
      events: 1, sec: L.LIMITS.MAX_SEC_PER_DAY, sessions: 1, best: 0, lastEventAt: NOW,
    });
    expect(await deniedL(() => rec(issued, { sec: 1 }))).toBe("sec_daily_cap");
  });

  it("어제 집계는 오늘로 넘어오지 않는다 (경로가 날짜를 가른다)", async () => {
    const issued = stageStats();
    // 어제 것은 **어제 경로**에 있다. 오늘 경로는 아예 다른 문서다.
    FAKE.set(L.statsPath(CLASS, UID, "20260820", APP), {
      classCode: CLASS, uid: UID, date: "20260820", appId: APP,
      events: 999, sec: 40000, sessions: 9, best: 777, lastEventAt: NOW - 86400000,
    });
    const out = await rec(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(statsDoc().events).toBe(1);
    expect(statsDoc().best).toBe(120);   // 어제 최고점이 안 넘어온다
    // 어제 문서는 건드리지 않는다.
    expect(FAKE.get(L.statsPath(CLASS, UID, "20260820", APP)).events).toBe(999);
  });

  // 🔴 2026-08-21 codex — 날짜 손상은 fail-**open** 이었다. 같은 날짜의 타입 손상은 막으면서
  //    날짜 필드만 어긋난 문서는 0 으로 리셋해 **하루 상한을 통째로 다시 열었다.**
  //    경로가 이미 days/{day} 라, 그 자리의 날짜 불일치는 "어제 것"이 아니라 손상이다.
  it("오늘 경로에 다른 날짜가 적혀 있으면 손상이다 (상한이 다시 열리지 않는다)", async () => {
    const issued = stageStats();
    FAKE.set(L.statsPath(CLASS, UID, DAY, APP), {
      classCode: CLASS, uid: UID, date: "20260820", appId: APP,
      events: L.LIMITS.EVENTS_PER_SUBJECT_PER_DAY, sec: 1, sessions: 1, best: 0,
    });
    expect(await deniedL(() => rec(issued))).toBe("stats_corrupt");
  });

  // 반대쪽 과잉차단도 막는다: **필드 0개의 실재 문서**는 Firestore 에서 실제로 존재할 수 있고
  // (이 저장소가 마이그레이션에서 한 번 겪었다), 그건 손상이 아니라 **자리**다.
  // 손상 취급하면 그 학생은 자정까지 아무것도 기록하지 못한다.
  it("빈 문서 `{}` 는 손상이 아니라 새 하루다 (과잉 차단 금지)", async () => {
    const issued = stageStats();
    FAKE.set(L.statsPath(CLASS, UID, DAY, APP), {});
    const out = await rec(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(statsDoc().events).toBe(1);
  });

  it("date 필드가 아예 없는 문서도 손상이다", async () => {
    const issued = stageStats();
    FAKE.set(L.statsPath(CLASS, UID, DAY, APP), {
      events: L.LIMITS.EVENTS_PER_SUBJECT_PER_DAY, sec: 1, sessions: 1, best: 0,
    });
    expect(await deniedL(() => rec(issued))).toBe("stats_corrupt");
  });

  it("집계가 손상돼 있으면 기록하지 않는다 (fail-closed)", async () => {
    const issued = stageStats();
    FAKE.set(L.statsPath(CLASS, UID, DAY, APP), {
      classCode: CLASS, uid: UID, date: DAY, appId: APP, events: "3", sec: 0, sessions: 1, best: 0,
    });
    expect(await deniedL(() => rec(issued))).toBe("stats_corrupt");
  });

  it("원시 이벤트에 보존기한이 붙는다 (영원히 쌓이지 않는다)", async () => {
    const issued = stageStats();
    await rec(issued);
    const [, ev] = rawEvents()[0];
    expect(ev.expireAt.__tsms).toBeGreaterThan(NOW);
    expect(ev.uid).toBe(UID);
    expect(ev.kind).toBe("clear");
  });

  // 🔴 2026-08-21 codex — 여기 있던 테스트는 **버그를 사양으로 박아두고 있었다**
  //    ("지급과 같은 버킷을 나눠 쓴다"). 같은 통이면 시끄러운 쪽이 조용한 쪽을 굶는다.
  it("⭐ 레이트리밋 통이 지급과 **다르다** (기록이 돈을 굶기지 않는다)", async () => {
    const issued = stageStats();
    await rec(issued);
    expect(FAKE.get(`aapRateLimits/lrn_${issued.sub}`), "학습 전용 통이 있어야 한다").toBeTruthy();
    expect(FAKE.get(`aapRateLimits/${issued.sub}`), "지급 통은 손대지 않는다").toBeFalsy();
  });

  // 🔴 codex 가 실행으로 재현한 사고 그대로다: 학습 30건 → 그 뒤 진짜 지급이 rate_limited.
  //    학생은 스테이지를 깼는데 돈을 못 받았다. 통을 나눈 지금은 지급이 성공해야 한다.
  it("⭐ 학습을 잔뜩 보낸 뒤에도 **진짜 지급이 나간다** (codex 재현의 회귀 가드)", async () => {
    const R = req("../../../functions/aap/rewardRules.js");
    // 보상까지 켜진 정책 + 카탈로그를 세우고, 같은 토큰으로 두 경로를 다 부른다.
    const issued = stage({ policy: { statsEnabled: true } });
    for (let i = 0; i < R.LEARNING_RATE_LIMIT.CAPACITY; i += 1) {
      await recordLearningEvent({
        body: { kind: "progress" }, headerToken: issued.token, nowMs: NOW,
      }).catch(() => {});
    }
    expect(FAKE.get(`aapRateLimits/lrn_${issued.sub}`).tokens).toBe(0);

    const out = await call(issued);
    expect(out.ok, JSON.stringify(out)).toBe(true);
    expect(FAKE.get(`users/${UID}`).cash).toBe(2000);
  });

  // ── 버킷 **호출부**가 지키는 것 (순수 함수 테스트가 못 보는 자리) ──
  //    관측 방법: 쓰기가 일어나면 `expireAt` 이 붙는다. 미리 없이 심어 두고 붙는지 본다.
  it("⭐ 차단이 이어지는 동안 **쓰기를 안 한다** (차단이 곧 비용이면 안 된다)", async () => {
    const issued = stageStats();
    FAKE.set(`aapRateLimits/lrn_${issued.sub}`, { tokens: 0, lastRefillMs: NOW });
    expect(await deniedL(() => rec(issued))).toBe("rate_limited");
    expect(
      FAKE.get(`aapRateLimits/lrn_${issued.sub}`).expireAt,
      "같은 상태를 다시 썼다 — 차단 1,000건이 쓰기 1,000회가 된다",
    ).toBeUndefined();
  });

  it("⭐ 차단이라도 **손상된 값은 고쳐 쓴다** (건너뛰기가 치유를 죽이면 안 된다)", async () => {
    const issued = stageStats();
    FAKE.set(`aapRateLimits/lrn_${issued.sub}`, { tokens: 0, lastRefillMs: Number.MAX_SAFE_INTEGER });
    expect(await deniedL(() => rec(issued))).toBe("rate_limited");
    const doc = FAKE.get(`aapRateLimits/lrn_${issued.sub}`);
    expect(doc.expireAt, "미래 시각을 안 고치면 그 버킷은 영구히 잠긴다").toBeDefined();
    expect(doc.lastRefillMs).toBeLessThanOrEqual(NOW);
  });

  it("⭐ 학습 이벤트를 통이 빌 때까지 보내도 **지급 통은 가득 차 있다**", async () => {
    const issued = stageStats();
    const R = req("../../../functions/aap/rewardRules.js");
    let ok = 0;
    for (let i = 0; i < R.LEARNING_RATE_LIMIT.CAPACITY + 5; i += 1) {
      const out = await rec(issued).catch((e) => ({ ok: false, reason: e.reason }));
      if (out.ok) ok += 1;
    }
    // 학습 통은 비었다 …
    expect(ok).toBe(R.LEARNING_RATE_LIMIT.CAPACITY);
    expect(FAKE.get(`aapRateLimits/lrn_${issued.sub}`).tokens).toBe(0);
    // … 그런데 지급 통은 아직 만들어지지도 않았다. 학생은 돈을 받을 수 있다.
    expect(FAKE.get(`aapRateLimits/${issued.sub}`)).toBeFalsy();
  });
});
