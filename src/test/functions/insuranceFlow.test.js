/**
 * 재난 보험 — 서버 함수를 메모리 Firestore 위에서 실제로 돌려 돈의 불변식을 본다.
 *   I1 보험료·보험금 어느 경우에도 (학생 현금 합 + 국고) 는 변하지 않는다
 *   I2 한 번 가입으로 받는 보험금 ≤ 보험료 × 20   I3 보험금 ≤ 손실 — 보험으로 돈이 늘지 않는다
 *   I4 같은 요청 두 번·가입 중 재가입은 돈을 한 번만 뺀다   I5 보험 정보를 못 읽으면 아무도 차감하지 않는다
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createFakeFirestore, installFakeUtils } from "../helpers/fakeFirestore";

const require = createRequire(import.meta.url);
const F = (f) => resolve(process.cwd(), "functions", f);
const C = "t1abcd";

let fake, restore, buyInsurance, executeEvent;
const fresh = (seed) => {
  if (restore) restore();
  for (const f of ["insuranceService.js", "economicEvents.js", "classCoupon.js"]) delete require.cache[require.resolve(F(f))];
  fake = createFakeFirestore(seed);
  restore = installFakeUtils(require, fake, F("utils.js"));
  buyInsurance = require(F("insuranceService.js")).buyInsurance;
  executeEvent = require(F("economicEvents.js")).executeEvent;
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

beforeEach(() => fresh(seed()));
afterEach(() => { if (restore) restore(); restore = null; });

describe("보험 가입", () => {
  it("보험료(현금의 1%)가 학생에서 국고로 가고 합은 그대로 — 정책은 한도 20배·7일", async () => {
    const before = fake.totalCash(C);
    const r = await buy("s1");
    expect(r).toMatchObject({ success: true, premium: 500, cap: 10_000 });
    expect(fake.get("users/s1").cash).toBe(49_500);
    expect(fake.get("users/teacher").cash).toBe(1_000_500);
    expect(fake.totalCash(C)).toBe(before);
    const pol = fake.get(`insurancePolicies/${C}_s1`);
    expect(pol).toMatchObject({ classCode: C, userId: "s1", premium: 500, cap: 10_000, capRemaining: 10_000, payoutThisTerm: 0 });
    expect(pol.expiresAt.toMillis() - Date.now()).toBeGreaterThan(6.9 * 86400e3);
    expect(fake.logs("보험료 납부")).toHaveLength(1);
    expect(fake.logs("보험료 납부")[0].amount).toBe(-500);
  });
  it("같은 요청 두 번·가입 중 재가입은 거절되고 돈은 한 번만 나간다", async () => {
    await buy("s1", "same-key");
    await expect(buy("s1", "same-key")).rejects.toMatchObject({ code: "already-exists" });
    await expect(buy("s1")).rejects.toMatchObject({ code: "already-exists" });
    expect(fake.get("users/s1").cash).toBe(49_500);
    expect(fake.get("users/teacher").cash).toBe(1_000_500);
  });
  it("보험이 방금 끝났으면 10분은 못 든다(이벤트 배치와 겹치지 않게) · 그 뒤에는 든다", async () => {
    await buy("s1");
    const path = `insurancePolicies/${C}_s1`;
    fake.store.set(path, { ...fake.get(path), expiresAt: fake.Ts.fromMillis(Date.now() - 60_000), payoutTotal: 700 });
    await expect(buy("s1")).rejects.toMatchObject({ code: "failed-precondition" });
    fake.store.set(path, { ...fake.get(path), expiresAt: fake.Ts.fromMillis(Date.now() - 11 * 60_000) });
    const r = await buy("s1");
    expect(r.premium).toBe(495); // 49,500 의 1%
    expect(fake.get(path)).toMatchObject({ capRemaining: 9_900, payoutThisTerm: 0, payoutTotal: 700, purchaseCount: 2 });
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
    await buy("s1"); // s1 현금 49,500
    const before = fake.totalCash(C);
    const tBefore = fake.get("users/teacher").cash;
    const r = await penalty(0.05);
    // s1: 손실 floor(49,500×5%)=2,475 → 보험금 1,237 → 실제 −1,238 / s2: 손실 2,500 전액
    expect(fake.get("users/s1").cash).toBe(49_500 - 1_238);
    expect(fake.get("users/s2").cash).toBe(50_000 - 2_500);
    expect(fake.get("users/s3").cash).toBe(0);
    expect(fake.get("users/teacher").cash).toBe(tBefore + 1_238 + 2_500);
    expect(fake.totalCash(C)).toBe(before);
    expect(r).toMatchObject({ affectedCount: 2, collectedAmount: 3_738, insurancePayout: 1_237 });
    expect(fake.get(`insurancePolicies/${C}_s1`)).toMatchObject({ capRemaining: 10_000 - 1_237, payoutThisTerm: 1_237, payoutTotal: 1_237 });
    // 거래내역: 손실은 전액으로, 보험금은 따로 — 두 줄을 더하면 실제 변화와 같다
    const loss = fake.logs("재산 손실 (경제이벤트)").find((l) => l.userId === "s1");
    const pay = fake.logs("보험금 지급");
    expect(pay).toHaveLength(1);
    expect(loss.amount + pay[0].amount).toBe(-1_238);
    expect(fake.get(`nationalTreasuries/${C}`).economicEventRevenue).toBe(3_738);
  });
  it("보험금은 남은 한도까지만 — 한도를 다 쓰면 다음 이벤트는 전액", async () => {
    await buy("s1");
    const path = `insurancePolicies/${C}_s1`;
    fake.store.set(path, { ...fake.get(path), capRemaining: 100 });
    const before = fake.totalCash(C);
    await penalty(0.05);
    expect(fake.get("users/s1").cash).toBe(49_500 - (2_475 - 100));
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
    const col = fake.db.collection;
    fake.db.collection = (name) => {
      if (name !== "insurancePolicies") return col(name);
      return { where: () => ({ get: async () => { throw new Error("unavailable"); } }) };
    };
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
});
