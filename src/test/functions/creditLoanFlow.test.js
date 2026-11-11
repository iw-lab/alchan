/**
 * 신용등급 → 대출 조건 — subscribeProduct·repayLoan 을 메모리 Firestore 위에서 실제로 돌린다.
 *   C1 화면이 보낸 값은 등급·금리·한도에 영향이 없다   C2 저장되는 금리는 유한·0 이상·100 이하
 *   C3 대출·상환 어디서도 (학생 현금 + 국고) 합이 변하지 않는다
 *   C4 신용 기록은 서버가 «다 갚은 순간»에만 쓴다 — 빌리자마자 갚기·무이자 대출·7일 안 되풀이로는 안 쌓인다
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createFakeFirestore, installFakeUtils } from "../helpers/fakeFirestore";

const require = createRequire(import.meta.url);
const F = (f) => resolve(process.cwd(), "functions", f);
const C = "t1abcd";
const DAY = 86400e3;

// index.js 는 무겁다 — 한 번만 올리고, 가짜 DB 의 내용만 시험마다 갈아 끼운다.
let fake, idx;
beforeAll(() => {
  fake = createFakeFirestore({});
  installFakeUtils(require, fake, F("utils.js"));
  idx = require(F("index.js"));
});
const reset = (extra = {}) => {
  fake.store.clear();
  const seed = {
    "users/teacher": { classCode: C, isAdmin: true, isApproved: true, cash: 100_000_000, name: "선생님" },
    "users/s1": { classCode: C, isAdmin: false, cash: 100_000, name: "하나" },
    [`bankingSettings/${C}`]: { loans: [{ id: 1, name: "일주일 대출", dailyRate: 1, termInDays: 7 }, { id: 2, name: "무이자", dailyRate: 0, termInDays: 7 }, { id: 3, name: "고금리", dailyRate: 90, termInDays: 1 }] },
    ...extra,
  };
  Object.entries(seed).forEach(([k, v]) => fake.store.set(k, { ...v }));
};
beforeEach(() => reset());

let n = 0;
const borrow = (amount, extra = {}) => idx.subscribeProduct.run({ auth: { uid: "s1" }, data: { productType: "loans", productId: 1, amount, repaymentType: "lumpSum", idempotencyKey: `b${++n}`, ...extra } });
const loanEntry = () => [...fake.store].find(([p, v]) => p.startsWith("users/s1/products/") && v.type === "loan");
const repay = (mode = "lumpSum", extra = {}) => idx.repayLoan.run({ auth: { uid: "s1" }, data: { productId: loanEntry()[0].split("/").pop(), mode, idempotencyKey: `r${++n}`, ...extra } });
const age = (days, maturityInDays = 7 - days) => {
  const [path, v] = loanEntry();
  fake.store.set(path, { ...v, startDate: fake.Ts.fromMillis(Date.now() - days * DAY), maturityDate: fake.Ts.fromMillis(Date.now() + maturityInDays * DAY) });
};
const rec = () => fake.get("creditRecords/s1");

describe("대출 조건이 등급을 따른다", () => {
  it("처음 온 아이(3등급): 한도 현금의 8배, 금리는 상품 그대로", async () => {
    await expect(borrow(800_001)).rejects.toThrow(/신용 3등급.*8배/);
    const before = fake.totalCash(C);
    const r = await borrow(800_000);
    expect(r).toMatchObject({ success: true, creditGrade: 3, rate: 1, baseRate: 1 });
    expect(loanEntry()[1]).toMatchObject({ rate: 1, baseRate: 1, creditGrade: 3, balance: 800_000 });
    expect(fake.get("users/s1").cash).toBe(900_000);
    expect(fake.totalCash(C)).toBe(before);
  });
  it("통장·예금으로 모아 둔 아이(1등급): 금리 20% 할인, 한도 10배", async () => {
    reset({ "users/s1/financials/parkingAccount": { balance: 50_000 }, "users/s1/products/d1": { type: "deposit", balance: 10_000 } });
    const r = await borrow(1_000_000);
    expect(r).toMatchObject({ creditGrade: 1, rate: 0.8, baseRate: 1 });
    expect(loanEntry()[1].rate).toBe(0.8);
  });
  it("최근에 강제 상환에 돈이 모자랐던 아이(4등급): 금리 15% 할증, 한도 5배", async () => {
    reset({ "creditRecords/s1": { classCode: C, late: 1, lastLateAt: fake.Ts.fromMillis(Date.now() - 3 * DAY) } });
    await expect(borrow(500_001)).rejects.toThrow(/신용 4등급.*5배/);
    const r = await borrow(500_000);
    expect(r).toMatchObject({ creditGrade: 4, rate: 1.15 });
  });
  it("한 달이 지나면 그 기록은 더 깎지 않는다", async () => {
    reset({ "creditRecords/s1": { classCode: C, late: 1, lastLateAt: fake.Ts.fromMillis(Date.now() - 31 * DAY) } });
    expect((await borrow(800_000)).creditGrade).toBe(3);
  });
  it("⭐ 화면이 보낸 등급·금리·한도는 무시된다", async () => {
    await expect(borrow(1_000_000, { creditGrade: 1, rate: 0, baseRate: 0, limit: 9e9, record: { onTime: 99 } })).rejects.toThrow(/신용 3등급/);
    const r = await borrow(100_000, { creditGrade: 1, rate: 0 });
    expect(r).toMatchObject({ creditGrade: 3, rate: 1 });
  });
  it("반에서 연동을 끄면 종전대로 — 상품 금리 그대로·현금의 10배", async () => {
    fake.store.set(`bankingSettings/${C}`, { ...fake.get(`bankingSettings/${C}`), creditLink: { enabled: false } });
    await expect(borrow(1_000_001)).rejects.toThrow(/10배까지만/);
    const r = await borrow(1_000_000);
    expect(r.creditGrade).toBeUndefined();
    expect(loanEntry()[1].rate).toBe(1);
    expect(loanEntry()[1].creditGrade).toBeUndefined();
  });
  it("저장되는 금리는 0~100 — 고금리 상품에 할증이 붙어도", async () => {
    reset({ "creditRecords/s1": { classCode: C, late: 1, lastLateAt: fake.Ts.fromMillis(Date.now() - DAY) } });
    await idx.subscribeProduct.run({ auth: { uid: "s1" }, data: { productType: "loans", productId: 3, amount: 1000, idempotencyKey: `b${++n}` } });
    const rate = loanEntry()[1].rate;
    expect(rate).toBe(100);
    expect(Number.isFinite(rate)).toBe(true);
  });
  it("예금·적금 가입은 신용 기록을 읽지 않는다(기록이 깨져 있어도 가입된다)", async () => {
    reset({ [`bankingSettings/${C}`]: { deposits: [{ id: 1, name: "예금", dailyRate: 0.1, termInDays: 7 }] }, "creditRecords/s1": "깨진 문서" });
    const r = await idx.subscribeProduct.run({ auth: { uid: "s1" }, data: { productType: "deposits", productId: 1, amount: 10_000, idempotencyKey: `b${++n}` } });
    expect(r.success).toBe(true);
    expect(fake.get("users/s1").cash).toBe(90_000);
  });
});

describe("상환이 신용 기록을 만든다", () => {
  it("이틀 쓴 대출을 기한 안에 다 갚으면 성실 완납 1 — 돈의 합은 그대로", async () => {
    await borrow(50_000);
    age(2);
    const before = fake.totalCash(C);
    const r = await repay("lumpSum");
    expect(r.isFullyRepaid).toBe(true);
    expect(r.interest).toBeGreaterThan(0);
    expect(fake.totalCash(C)).toBe(before);
    expect(loanEntry()).toBeUndefined();
    expect(rec()).toMatchObject({ classCode: C, onTime: 1 });
    expect(rec().late).toBeUndefined();
  });
  it("⭐ 빌리자마자 갚으면 기록이 없다(점수 파밍 차단)", async () => {
    await borrow(50_000);
    await repay("lumpSum");
    expect(rec()).toBeUndefined();
  });
  it("⭐ 7일 안에 또 다 갚아도 한 번만 센다", async () => {
    await borrow(50_000); age(2); await repay("lumpSum");
    await borrow(50_000); age(2); await repay("lumpSum");
    expect(rec().onTime).toBe(1);
    fake.store.set("creditRecords/s1", { ...rec(), lastOnTimeAt: fake.Ts.fromMillis(Date.now() - 8 * DAY) });
    await borrow(50_000); age(2); await repay("lumpSum");
    expect(rec().onTime).toBe(2);
  });
  it("⭐ 무이자 대출은 갚아도 성실 완납이 아니다", async () => {
    await idx.subscribeProduct.run({ auth: { uid: "s1" }, data: { productType: "loans", productId: 2, amount: 50_000, idempotencyKey: `b${++n}` } });
    age(3);
    await repay("lumpSum");
    expect(rec()).toBeUndefined();
  });
  it("갚을 날을 이틀 넘겨 갚으면 성실 완납이 아니다", async () => {
    await borrow(50_000);
    age(9, -2);
    await repay("lumpSum");
    expect(rec()).toBeUndefined();
  });
  it("만기 강제 상환에 돈이 모자라면 부실 1 — 현금은 마이너스가 되고 합은 그대로", async () => {
    await borrow(800_000);
    fake.store.set("users/s1", { ...fake.get("users/s1"), cash: 1_000 });
    fake.store.set("users/teacher", { ...fake.get("users/teacher"), cash: fake.get("users/teacher").cash + 899_000 }); // 쓴 돈은 국고로 갔다고 치고 합을 맞춘다
    age(7, 0);
    const before = fake.totalCash(C);
    await repay("maturity");
    expect(fake.get("users/s1").cash).toBeLessThan(0);
    expect(fake.totalCash(C)).toBe(before);
    expect(rec()).toMatchObject({ classCode: C, late: 1 });
    expect(rec().lastLateAt.toMillis()).toBeGreaterThan(Date.now() - 5_000);
    expect(rec().onTime).toBeUndefined();
  });
  it("만기 자동 상환이어도 돈이 충분했으면 성실 완납", async () => {
    await borrow(50_000);
    age(7, 0);
    await repay("maturity");
    expect(rec()).toMatchObject({ onTime: 1 });
  });
  it("나눠 갚는 중(잔액 남음)에는 기록하지 않는다", async () => {
    await borrow(50_000);
    age(2);
    const r = await repay("installment", { amount: 10_000 });
    expect(r.isFullyRepaid).toBe(false);
    expect(rec()).toBeUndefined();
    expect(loanEntry()).toBeTruthy();
  });
  it("성실 완납이 쌓이면 다음 대출 조건이 좋아진다(3 → 2등급)", async () => {
    reset({ "creditRecords/s1": { classCode: C, onTime: 2 } });
    const r = await borrow(1_000_000);
    expect(r).toMatchObject({ creditGrade: 2, rate: 0.9 });
  });
});
