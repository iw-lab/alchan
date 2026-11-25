/**
 * 재난 보험 — 서버 함수를 메모리 Firestore 위에서 실제로 돌려 돈의 불변식을 본다.
 *   I1 보험료·보험금 어느 경우에도 (학생 현금 합 + 국고) 는 변하지 않는다
 *   I2 한 번 가입으로 받는 보험금 ≤ 보험료 × 20   I3 보험금 ≤ 손실 — 보험으로 돈이 늘지 않는다
 *   I4 같은 요청 두 번·가입 중 재가입은 돈을 한 번만 뺀다   I5 보험 정보를 못 읽으면 아무도 차감하지 않는다
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createFakeFirestore, installFakeUtils } from "../helpers/fakeFirestore";

const require = createRequire(import.meta.url);
const F = (f) => resolve(process.cwd(), "functions", f);
const C = "t1abcd";

let fake, restore, buyInsurance, executeEvent, triggerClassEconomicEvent;
const fresh = (seed) => {
  if (restore) restore();
  for (const f of ["insuranceService.js", "economicEvents.js", "eventRunLock.js", "classCoupon.js"]) delete require.cache[require.resolve(F(f))];
  fake = createFakeFirestore(seed);
  restore = installFakeUtils(require, fake, F("utils.js"));
  buyInsurance = require(F("insuranceService.js")).buyInsurance;
  ({ executeEvent, triggerClassEconomicEvent } = require(F("economicEvents.js")));
};
const seed = (extra = {}) => ({
  "users/teacher": { classCode: C, isAdmin: true, isApproved: true, cash: 1_000_000, name: "선생님" },
  "users/s1": { classCode: C, isAdmin: false, cash: 50_000, name: "하나" },
  "users/s2": { classCode: C, isAdmin: false, cash: 50_000, name: "두리" },
  "users/s3": { classCode: C, isAdmin: false, cash: 0, name: "세찌" },
  [`bankingSettings/${C}`]: { loans: [] },
  ...extra,
});
const buy = (uid, key = `k-${uid}-${Math.random()}`) => buyInsurance.run({ auth: { uid }, data: { idempotencyKey: key } });
const penalty = (rate = 0.05) => executeEvent(C, { type: "CASH_PENALTY", params: { penaltyRate: rate } });
const tax = (rate = 0.03) => executeEvent(C, { type: "TAX_EXTRA", params: { taxRate: rate } });
/** 한 배치의 쓰기 수를 잰다 — 실제 Firestore 는 한 배치 500 이 상한이다. */
const countBatchOps = () => {
  const sizes = [];
  const make = fake.db.batch;
  fake.db.batch = () => {
    const b = make();
    let n = 0;
    return {
      set: (...a) => { n++; return b.set(...a); }, update: (...a) => { n++; return b.update(...a); },
      delete: (...a) => { n++; return b.delete(...a); }, commit: () => { sizes.push(n); return b.commit(); },
    };
  };
  return sizes;
};
const unreadablePolicies = () => {
  const col = fake.db.collection;
  fake.db.collection = (name) => {
    if (name !== "insurancePolicies") return col(name);
    return { where: () => ({ get: async () => { throw new Error("unavailable"); } }) };
  };
};

beforeEach(() => fresh(seed()));
afterEach(() => { if (restore) restore(); restore = null; });

describe("보험 가입", () => {
  it("보험료(현금의 1.5%)가 학생에서 국고로 가고 합은 그대로 — 정책은 한도 20배·7일", async () => {
    const before = fake.totalCash(C);
    const r = await buy("s1");
    expect(r).toMatchObject({ success: true, premium: 750, cap: 15_000 });
    expect(fake.get("users/s1").cash).toBe(49_250);
    expect(fake.get("users/teacher").cash).toBe(1_000_750);
    expect(fake.totalCash(C)).toBe(before);
    const pol = fake.get(`insurancePolicies/${C}_s1`);
    expect(pol).toMatchObject({ classCode: C, userId: "s1", premium: 750, cap: 15_000, capRemaining: 15_000, payoutThisTerm: 0 });
    expect(pol.expiresAt.toMillis() - Date.now()).toBeGreaterThan(6.9 * 86400e3);
    expect(fake.logs("보험료 납부")).toHaveLength(1);
    expect(fake.logs("보험료 납부")[0].amount).toBe(-750);
  });
  it("같은 요청 두 번·가입 중 재가입은 거절되고 돈은 한 번만 나간다", async () => {
    await buy("s1", "same-key");
    await expect(buy("s1", "same-key")).rejects.toMatchObject({ code: "already-exists" });
    await expect(buy("s1")).rejects.toMatchObject({ code: "already-exists" });
    expect(fake.get("users/s1").cash).toBe(49_250);
    expect(fake.get("users/teacher").cash).toBe(1_000_750);
  });
  it("보험이 방금 끝났으면 10분은 못 든다(이벤트 배치와 겹치지 않게) · 그 뒤에는 든다", async () => {
    await buy("s1");
    const path = `insurancePolicies/${C}_s1`;
    fake.store.set(path, { ...fake.get(path), expiresAt: fake.Ts.fromMillis(Date.now() - 60_000), payoutTotal: 700 });
    await expect(buy("s1")).rejects.toMatchObject({ code: "failed-precondition" });
    fake.store.set(path, { ...fake.get(path), expiresAt: fake.Ts.fromMillis(Date.now() - 11 * 60_000) });
    const r = await buy("s1");
    expect(r.premium).toBe(739); // 49,250 의 1.5% = 738.75 → 올림
    expect(fake.get(path)).toMatchObject({ capRemaining: 14_780, payoutThisTerm: 0, payoutTotal: 700, purchaseCount: 2 });
  });
  it("현금이 없으면·교사면·반에서 껐으면 거절하고 돈은 안 움직인다", async () => {
    const before = JSON.stringify([...fake.store]);
    await expect(buy("s3")).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(buy("teacher")).rejects.toMatchObject({ code: "failed-precondition" });
    fake.store.set(`bankingSettings/${C}`, { insurance: { enabled: false } });
    await expect(buy("s1")).rejects.toMatchObject({ code: "failed-precondition" });
    fake.store.set(`bankingSettings/${C}`, { loans: [] });
    expect(JSON.stringify([...fake.store])).toBe(before);
  });
  it("멱등키 없이는 받지 않는다 · 깨진 현금(NaN)도", async () => {
    await expect(buyInsurance.run({ auth: { uid: "s1" }, data: {} })).rejects.toMatchObject({ code: "invalid-argument" });
    fake.store.set("users/s1", { ...fake.get("users/s1"), cash: NaN });
    await expect(buy("s1")).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("남의 학급 교사를 국고로 쓰지 않는다(승인 안 된 관리자만 있으면 거절)", async () => {
    fresh(seed({ "users/teacher": { classCode: C, isAdmin: true, isApproved: false, cash: 0 } }));
    await expect(buy("s1")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake.get("users/s1").cash).toBe(50_000);
  });
});

describe("현금 긴급 차감 + 보험금", () => {
  it("가입자는 손실의 절반만 내고, 국고도 그만큼만 받는다 — 합은 그대로", async () => {
    await buy("s1"); // s1 현금 49,250
    const before = fake.totalCash(C);
    const tBefore = fake.get("users/teacher").cash;
    const r = await penalty(0.05);
    // s1: 손실 floor(49,250×5%)=2,462 → 보험금 1,231 → 실제 −1,231 / s2: 손실 2,500 전액
    expect(fake.get("users/s1").cash).toBe(49_250 - 1_231);
    expect(fake.get("users/s2").cash).toBe(50_000 - 2_500);
    expect(fake.get("users/s3").cash).toBe(0);
    expect(fake.get("users/teacher").cash).toBe(tBefore + 1_231 + 2_500);
    expect(fake.totalCash(C)).toBe(before);
    expect(r).toMatchObject({ affectedCount: 2, collectedAmount: 3_731, insurancePayout: 1_231 });
    expect(fake.get(`insurancePolicies/${C}_s1`)).toMatchObject({ capRemaining: 15_000 - 1_231, payoutThisTerm: 1_231, payoutTotal: 1_231 });
    // 거래내역: 손실은 전액으로, 보험금은 따로 — 두 줄을 더하면 실제 변화와 같다
    const loss = fake.logs("재산 손실 (경제이벤트)").find((l) => l.userId === "s1");
    const pay = fake.logs("보험금 지급");
    expect(pay).toHaveLength(1);
    expect(loss.amount + pay[0].amount).toBe(-1_231);
    expect(fake.get(`nationalTreasuries/${C}`).economicEventRevenue).toBe(3_731);
  });
  it("보험금은 남은 한도까지만 — 한도를 다 쓰면 다음 이벤트는 전액", async () => {
    await buy("s1");
    const path = `insurancePolicies/${C}_s1`;
    fake.store.set(path, { ...fake.get(path), capRemaining: 100 });
    const before = fake.totalCash(C);
    await penalty(0.05);
    expect(fake.get("users/s1").cash).toBe(49_250 - (2_462 - 100));
    expect(fake.get(path).capRemaining).toBe(0);
    const cash1 = fake.get("users/s1").cash;
    await penalty(0.05);
    expect(fake.get("users/s1").cash).toBe(cash1 - Math.floor(cash1 * 0.05));
    expect(fake.get(path).capRemaining).toBe(0);
    expect(fake.totalCash(C)).toBe(before);
  });
  it("여러 번 맞아도 한 번 가입으로 받는 보험금은 보험료의 20배를 넘지 않는다", async () => {
    await buy("s1");
    const before = fake.totalCash(C);
    for (let i = 0; i < 40; i++) await penalty(0.9);
    const pol = fake.get(`insurancePolicies/${C}_s1`);
    expect(pol.payoutThisTerm).toBeLessThanOrEqual(pol.premium * 20);
    expect(pol.capRemaining).toBeGreaterThanOrEqual(0);
    expect(pol.capRemaining + pol.payoutThisTerm).toBe(pol.cap);
    expect(fake.totalCash(C)).toBe(before);
    expect(fake.get("users/s1").cash).toBeGreaterThanOrEqual(0);
  });
  it("기한 지난 정책·남의 학급 정책·id 가 안 맞는 정책은 보상하지 않는다", async () => {
    const exp = fake.Ts.fromMillis(Date.now() + 86400e3);
    fake.store.set(`insurancePolicies/${C}_s1`, { classCode: C, userId: "s1", capRemaining: 9_999, expiresAt: fake.Ts.fromMillis(Date.now() - 1) });
    fake.store.set(`insurancePolicies/zzz_s2`, { classCode: C, userId: "s2", capRemaining: 9_999, expiresAt: exp });
    await penalty(0.05);
    expect(fake.get("users/s1").cash).toBe(47_500);
    expect(fake.get("users/s2").cash).toBe(47_500);
    expect(fake.logs("보험금 지급")).toHaveLength(0);
  });
  it("보험 정보를 못 읽으면 아무도 차감하지 않는다", async () => {
    await buy("s1");
    unreadablePolicies();
    const before = JSON.stringify([...fake.store]);
    await expect(penalty(0.05)).rejects.toThrow(/보험 가입 정보를 못 읽어/);
    expect(JSON.stringify([...fake.store])).toBe(before);
  });
  it("보험 가입자가 없으면 종전과 똑같이 걷는다", async () => {
    const before = fake.totalCash(C);
    const r = await penalty(0.05);
    expect(fake.get("users/s1").cash).toBe(47_500);
    expect(r).toMatchObject({ affectedCount: 2, collectedAmount: 5_000, insurancePayout: 0 });
    expect(fake.totalCash(C)).toBe(before);
  });
  it("순자산의 쿠폰은 반에서 정한 값으로 센다(1,000 고정이 아니다) — «긴급 세금 추징»과 같은 기준", async () => {
    fresh(seed({ "users/s2": { classCode: C, isAdmin: false, cash: 50_000, coupons: 100, name: "두리" }, [`classSettings/${C}/settings/coupon`]: { couponValue: 1500 } }));
    await penalty(0.05); // (50,000 + 100×1,500) × 5% = 10,000
    expect(fake.get("users/s2").cash).toBe(40_000);
  });
  it("쿠폰 값을 못 읽으면 아무도 차감하지 않는다", async () => {
    const before = JSON.stringify([...fake.store]);
    const doc = fake.db.doc;
    fake.db.doc = (p) => (p.startsWith("classSettings/") ? { get: async () => { throw new Error("unavailable"); } } : doc(p));
    await expect(penalty(0.05)).rejects.toThrow(/쿠폰/);
    expect(JSON.stringify([...fake.store])).toBe(before);
  });
});

// 2026-11-25 사용자 «보험이 세금도 막아줘» — «긴급 세금 추징»도 같은 규칙으로 절반을 보상한다.
describe("긴급 세금 추징 + 보험금", () => {
  it("가입자는 세금의 절반만 내고, 국고도 그만큼만 받는다 — 합은 그대로", async () => {
    await buy("s1"); // s1 현금 49,250
    const before = fake.totalCash(C);
    const tBefore = fake.get("users/teacher").cash;
    const r = await tax(0.03);
    // s1: 세금 floor(49,250×3%)=1,477 → 보험금 738 → 실제 −739 / s2: 1,500 전액 / s3: 순자산 0 → 제외
    expect(fake.get("users/s1").cash).toBe(49_250 - 739);
    expect(fake.get("users/s2").cash).toBe(50_000 - 1_500);
    expect(fake.get("users/s3").cash).toBe(0);
    expect(fake.get("users/teacher").cash).toBe(tBefore + 739 + 1_500);
    expect(fake.totalCash(C)).toBe(before);
    expect(r).toMatchObject({ affectedCount: 2, collectedAmount: 2_239, insurancePayout: 738 });
    expect(fake.get(`insurancePolicies/${C}_s1`)).toMatchObject({ capRemaining: 15_000 - 738, payoutThisTerm: 738, payoutTotal: 738 });
    expect(fake.get(`nationalTreasuries/${C}`).economicEventRevenue).toBe(2_239);
    // 거래내역: 세금은 전액으로, 보험금은 따로 — 두 줄을 더하면 실제 변화와 같다
    const paid = fake.logs("세금 납부 (경제이벤트)").find((l) => l.userId === "s1");
    const pay = fake.logs("보험금 지급");
    expect(pay).toHaveLength(1);
    expect(paid.amount).toBe(-1_477);
    expect(paid.amount + pay[0].amount).toBe(-739);
    expect(pay[0].description).toContain("긴급 세금 추징 1,477원 중 738원을 보험이 대신 냈어요");
    expect(fake.logs("세금 납부 (경제이벤트)").find((l) => l.userId === "s2").amount).toBe(-1_500);
  });
  it("현금보다 큰 세금(순자산 기준)도 절반 — 다만 남은 한도까지만, 나머지는 전처럼 마이너스로 걷는다", async () => {
    await buy("s1");
    fake.store.set("users/s1/financials/parkingAccount", { balance: 10_000_000 });
    const before = fake.totalCash(C);
    await tax(0.03); // (49,250 + 10,000,000) × 3% = 301,477 → 절반 150,738 이지만 한도 15,000
    expect(fake.get("users/s1").cash).toBe(49_250 - (301_477 - 15_000));
    expect(fake.get(`insurancePolicies/${C}_s1`)).toMatchObject({ capRemaining: 0, payoutThisTerm: 15_000 });
    expect(fake.totalCash(C)).toBe(before);
    const cash1 = fake.get("users/s1").cash;
    await tax(0.03); // 한도를 다 썼으니 전액
    expect(fake.get("users/s1").cash).toBe(cash1 - Math.floor((cash1 + 10_000_000) * 0.03));
    expect(fake.logs("보험금 지급")).toHaveLength(1);
    expect(fake.totalCash(C)).toBe(before);
  });
  it("세금과 부담금을 번갈아 여러 번 맞아도 한 번 가입으로 받는 보험금은 보험료의 20배까지", async () => {
    await buy("s1");
    fake.store.set("users/s1/financials/parkingAccount", { balance: 500_000 });
    const before = fake.totalCash(C);
    for (let i = 0; i < 20; i++) { await tax(0.1); await penalty(0.1); }
    const pol = fake.get(`insurancePolicies/${C}_s1`);
    expect(pol.payoutThisTerm).toBeLessThanOrEqual(pol.premium * 20);
    expect(pol.capRemaining).toBeGreaterThanOrEqual(0);
    expect(pol.capRemaining + pol.payoutThisTerm).toBe(pol.cap);
    expect(fake.totalCash(C)).toBe(before);
  });
  it("기한 지난 정책·남의 학급 정책은 보상하지 않는다", async () => {
    const exp = fake.Ts.fromMillis(Date.now() + 86400e3);
    fake.store.set(`insurancePolicies/${C}_s1`, { classCode: C, userId: "s1", capRemaining: 9_999, expiresAt: fake.Ts.fromMillis(Date.now() - 1) });
    fake.store.set(`insurancePolicies/zzz_s2`, { classCode: C, userId: "s2", capRemaining: 9_999, expiresAt: exp });
    await tax(0.03);
    expect(fake.get("users/s1").cash).toBe(48_500);
    expect(fake.get("users/s2").cash).toBe(48_500);
    expect(fake.logs("보험금 지급")).toHaveLength(0);
  });
  it("보험 정보를 못 읽으면 아무도 걷지 않는다", async () => {
    await buy("s1");
    unreadablePolicies();
    const before = JSON.stringify([...fake.store]);
    await expect(tax(0.03)).rejects.toThrow(/보험 가입 정보를 못 읽어/);
    expect(JSON.stringify([...fake.store])).toBe(before);
  });
  it("보험 가입자가 없으면 종전과 똑같이 걷는다", async () => {
    const before = fake.totalCash(C);
    const r = await tax(0.03);
    expect(fake.get("users/s1").cash).toBe(48_500);
    expect(r).toMatchObject({ affectedCount: 2, collectedAmount: 3_000, insurancePayout: 0 });
    expect(fake.totalCash(C)).toBe(before);
  });
  it.each([["세금", () => tax(0.03)], ["부담금", () => penalty(0.05)]])("가입자 130명이어도 한 배치 쓰기는 500 이하(%s)", async (_n, run) => {
    const exp = fake.Ts.fromMillis(Date.now() + 86400e3);
    for (let i = 0; i < 130; i++) {
      fake.store.set(`users/m${i}`, { classCode: C, isAdmin: false, cash: 10_000, name: `학생${i}` });
      fake.store.set(`insurancePolicies/${C}_m${i}`, { classCode: C, userId: `m${i}`, cap: 3_000, capRemaining: 3_000, payoutThisTerm: 0, payoutTotal: 0, expiresAt: exp });
    }
    const before = fake.totalCash(C);
    const sizes = countBatchOps();
    await run();
    expect(Math.max(...sizes)).toBeLessThanOrEqual(500);
    expect(fake.logs("보험금 지급")).toHaveLength(130);
    expect(fake.totalCash(C)).toBe(before);
  });
});

describe("같은 학급의 이벤트는 한 번에 하나만 돈다", () => {
  const settings = { enabled: true, events: [{ id: "tax", type: "TAX_EXTRA", title: "긴급 세금", params: { taxRate: 0.4 }, enabled: true }] };
  const LOCK = `schedulerLocks/economicEventRun_${C}`;
  const fire = () => triggerClassEconomicEvent(C, "tax");
  beforeEach(() => fresh(seed({ [`economicEventSettings/${C}`]: settings })));

  it("선생님이 거의 동시에 두 번 눌러도 한 번만 걷고, 보험 한도를 두 번 쓰지 않는다", async () => {
    await buy("s1"); // 보험료 750 → 한도 15,000
    const before = fake.totalCash(C);
    const r = await Promise.allSettled([fire(), fire()]);
    expect(r.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(r.find((x) => x.status === "rejected").reason).toMatchObject({ code: "failed-precondition" });
    const pol = fake.get(`insurancePolicies/${C}_s1`);
    expect(pol.capRemaining).toBeGreaterThanOrEqual(0);
    expect(pol.payoutThisTerm).toBeLessThanOrEqual(pol.cap);
    expect(fake.logs("보험금 지급")).toHaveLength(1);
    expect(fake.totalCash(C)).toBe(before);
  });
  it("끝나면 자물쇠가 풀려 다음 이벤트가 돈다", async () => {
    await fire();
    expect(fake.get(LOCK)).toBeUndefined();
    await expect(fire()).resolves.toMatchObject({ classCode: C });
  });
  it("이벤트가 실패해도 자물쇠는 풀린다", async () => {
    unreadablePolicies();
    await expect(fire()).rejects.toThrow(/보험 가입 정보를 못 읽어/);
    expect(fake.get(LOCK)).toBeUndefined();
  });
  it("돌다가 죽은 이벤트의 자물쇠는 10분 뒤 저절로 풀린다 · 남의 자물쇠는 지우지 않는다", async () => {
    fake.store.set(LOCK, { token: "other", until: fake.Ts.fromMillis(Date.now() + 60_000) });
    await expect(fire()).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake.get(LOCK).token).toBe("other");
    fake.store.set(LOCK, { token: "other", until: fake.Ts.fromMillis(Date.now() - 1) });
    await expect(fire()).resolves.toMatchObject({ classCode: C });
  });
  it("함수 인스턴스 시계가 10분 넘게 앞서 있어도 남의 자물쇠를 만료로 보지 않는다(서버 시각으로 판정)", async () => {
    const real = Date.now();
    fake.store.set(LOCK, { token: "other", until: fake.Ts.fromMillis(real + 60_000) });
    const spy = vi.spyOn(Date, "now").mockImplementation(() => real + 601_000);
    fake.clock.serverOffsetMs = -601_000;
    try { await expect(fire()).rejects.toMatchObject({ code: "failed-precondition" }); } finally { spy.mockRestore(); }
    expect(fake.get(LOCK).token).toBe("other");
  });
  it("이벤트가 도는 동안에는 보험에 가입할 수 없다 — «들었는데 세금을 다 냈다»가 생기지 않게", async () => {
    const before = fake.totalCash(C);
    fake.store.set(LOCK, { token: "other", until: fake.Ts.fromMillis(Date.now() + 60_000) });
    await expect(buy("s1")).rejects.toMatchObject({ code: "failed-precondition", message: expect.stringContaining("경제 이벤트") });
    expect(fake.get(`insurancePolicies/${C}_s1`)).toBeUndefined();
    expect(fake.get("users/s1").cash).toBe(50_000);
    expect(fake.totalCash(C)).toBe(before);
    fake.store.set(LOCK, { token: "other", until: fake.Ts.fromMillis(Date.now() - 1) }); // 죽은 자물쇠는 막지 않는다
    await expect(buy("s1")).resolves.toMatchObject({ success: true });
  });
  it("예약 실행은 선생님이 누른 이벤트와 겹치면 그날을 쓰지 않고 다음 시간에 다시 온다", async () => {
    fake.store.set(LOCK, { token: "other", until: fake.Ts.fromMillis(Date.now() + 60_000) });
    await expect(triggerClassEconomicEvent(C)).resolves.toBeNull();
    expect(fake.get(`economicEventSettings/${C}`).lastEventDate).toBeUndefined();
  });
});
