/**
 * 오늘의 경제 퀴즈 정답 상금 — 서버 함수를 메모리 Firestore 위에서 돌린다.
 *   Q1 정답이면 국고 → 학생 R, (학생 현금 + 국고) 합은 그대로   Q2 하루 첫 답 하나만(틀려도 그날 끝, 동시·반복 호출도 1번)
 *   Q3 날짜·문제·고른 답은 서버가 다시 계산한다(화면이 «맞았다»고 보낼 길이 없다)   Q4 상금은 학급 설정, 0~100,000
 *   Q5 서버 문항 = 화면 문항(바이트 같음), 서버 판정 = 화면 판정
 */
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createFakeFirestore, installFakeUtils } from "../helpers/fakeFirestore";
import * as client from "../../utils/econQuiz";

const require = createRequire(import.meta.url);
const F = (f) => resolve(process.cwd(), "functions", f);
const C = "t1abcd";
const BANK = JSON.parse(readFileSync(resolve(process.cwd(), "src/data/econQuiz.json"), "utf8"));
const server = require(F("econQuizMath.js"));

let fake, svc;
beforeAll(() => {
  fake = createFakeFirestore({});
  installFakeUtils(require, fake, F("utils.js"));
  svc = require(F("quizRewardService.js"));
});
const reset = (extra = {}) => {
  fake.store.clear();
  Object.entries({
    "users/teacher": { classCode: C, isAdmin: true, isApproved: true, cash: 1_000_000 },
    "users/s1": { classCode: C, isAdmin: false, cash: 5_000, name: "하나" },
    [`bankingSettings/${C}`]: {},
    ...extra,
  }).forEach(([k, v]) => fake.store.set(k, { ...v }));
};
beforeEach(() => reset());
afterEach(() => vi.useRealTimers());

const today = () => server.dayKeyKST(Date.now());
const q = (uid = "s1") => server.pickQuestion(BANK, uid, today());
const call = (data, uid = "s1") => svc.claimQuizReward.run({ auth: { uid }, data });
const right = () => ({ day: today(), questionId: q().id, choice: q().choices[q().answerIndex] });
const wrong = () => ({ day: today(), questionId: q().id, choice: q().choices[(q().answerIndex + 1) % 4] });

describe("상금", () => {
  it("정답이면 국고에서 1만 원 — 합은 그대로, 거래내역 한 줄, 기록 갱신", async () => {
    const before = fake.totalCash(C);
    const r = await call(right());
    expect(r).toMatchObject({ success: true, correct: true, reward: 10_000 });
    expect(fake.get("users/s1").cash).toBe(15_000);
    expect(fake.get("users/teacher").cash).toBe(990_000);
    expect(fake.totalCash(C)).toBe(before);
    expect(fake.logs("퀴즈 상금")).toHaveLength(1);
    expect(fake.get("users/s1").econQuiz).toMatchObject({ day: today(), total: 1, correct: 1, lastCorrect: true });
  });
  it("틀리면 돈은 없고 그날은 끝", async () => {
    const r = await call(wrong());
    expect(r).toMatchObject({ correct: false, reward: 0 });
    expect(fake.get("users/s1").cash).toBe(5_000);
    await expect(call(right())).rejects.toMatchObject({ code: "already-exists" });
    expect(fake.get("users/s1").cash).toBe(5_000);
    expect(fake.logs("퀴즈 상금")).toHaveLength(0);
  });
  it("⭐ 같은 날 여러 번·동시에 불러도 한 번만", async () => {
    const rs = await Promise.allSettled([call(right()), call(right()), call(right())]);
    expect(rs.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(call(right())).rejects.toMatchObject({ code: "already-exists" });
    expect(fake.get("users/s1").cash).toBe(15_000);
  });
  it("⭐ 날짜·문제를 바꿔 보내도 서버가 다시 계산한다", async () => {
    await expect(call({ ...right(), day: "2030-01-01" })).rejects.toMatchObject({ code: "failed-precondition" });
    const other = BANK.find((b) => b.id !== q().id);
    await expect(call({ ...right(), questionId: other.id })).rejects.toMatchObject({ code: "failed-precondition" });
    for (const choice of [0, null, "", "x".repeat(201)]) await expect(call({ ...right(), choice })).rejects.toMatchObject({ code: "invalid-argument" });
    // 오늘 보기에 없는 글(옛 화면·다른 문제의 보기) → 기록 전에 거절, 하루 기회는 그대로
    await expect(call({ ...right(), choice: "오늘 보기에 없는 답" })).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake.get(`quizRewards/s1_${today()}`)).toBeUndefined();
    await expect(call({ ...right(), correct: true, reward: 9e9 })).resolves.toMatchObject({ reward: 10_000 });
    expect(fake.get("users/s1").cash).toBe(15_000);
  });
  it("다음 날에는 다시 받는다", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T01:00:00Z"));
    await call(right());
    vi.setSystemTime(new Date("2026-11-14T01:00:00Z"));
    await call(right());
    expect(fake.get("users/s1").cash).toBe(25_000);
    expect(fake.get("users/s1").econQuiz).toMatchObject({ total: 2, correct: 2, streak: 2 });
  });
  it("학급 설정 금액 · 0 이면 기록만 · 이상한 값은 잘라 낸다", async () => {
    fake.store.set(`bankingSettings/${C}`, { quizReward: { amount: 3_000 } });
    expect((await call(right())).reward).toBe(3_000);
    reset({ [`bankingSettings/${C}`]: { quizReward: { amount: 0 } } });
    expect(await call(right())).toMatchObject({ correct: true, reward: 0 });
    expect(fake.get("users/s1").cash).toBe(5_000);
    expect(fake.logs("퀴즈 상금")).toHaveLength(0);
    expect(server.quizRewardAmount({ quizReward: { amount: 5e9 } })).toBe(30_000);
    expect(server.quizRewardAmount({ quizReward: { amount: 5000.7 } })).toBe(5_000);
    expect(server.quizRewardAmount({ quizReward: { amount: -5 } })).toBe(0);
    expect(server.quizRewardAmount({ quizReward: { amount: "10000" } })).toBe(0);
    expect(server.quizRewardAmount({ quizReward: { amount: NaN } })).toBe(0);
    expect(server.quizRewardAmount(null)).toBe(10_000);
  });
  it("국고가 마이너스여도 준다(학급 결정) · 교사는 못 받는다 · 승인 안 된 국고면 거절", async () => {
    reset({ "users/teacher": { classCode: C, isAdmin: true, isApproved: true, cash: -500 } });
    expect((await call(right())).reward).toBe(10_000);
    expect(fake.get("users/teacher").cash).toBe(-10_500);
    await expect(call(right(), "teacher")).rejects.toMatchObject({ code: "failed-precondition" });
    reset({ "users/teacher": { classCode: C, isAdmin: true, isApproved: false, cash: 0 } });
    await expect(call(right())).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake.get("users/s1").cash).toBe(5_000);
  });
});

describe("서버 ↔ 화면", () => {
  it("문항 파일이 바이트까지 같다", () => {
    expect(readFileSync(F("data/econQuiz.json"), "utf8")).toBe(readFileSync(resolve(process.cwd(), "src/data/econQuiz.json"), "utf8"));
  });
  it("같은 학생·같은 날에 같은 문제·같은 보기 순서·같은 기록", () => {
    for (const uid of ["a", "s1", "x9Yz", "학생"]) for (const d of ["2026-11-13", "2026-11-14", "2027-03-05"]) {
      expect(server.pickQuestion(BANK, uid, d)).toEqual(client.pickQuestion(BANK, uid, d));
    }
    expect(server.dayKeyKST(1_800_000_000_000)).toBe(client.dayKeyKST(1_800_000_000_000));
    const raw = { day: "2026-11-12", total: 3, correct: 2, streak: 3 };
    expect(server.nextStats(raw, "2026-11-13", true)).toEqual(client.nextStats(raw, "2026-11-13", true));
  });
});

describe("LITE 반영", () => {
  it("잔액이 정밀도 밖(1e30)이면 아무것도 안 바꾼다 · 트랜잭션 안에서 관리자면 거절", async () => {
    reset({ "users/teacher": { classCode: C, isAdmin: true, isApproved: true, cash: 1e30 } });
    await expect(call(right())).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fake.get("users/s1").cash).toBe(5_000);
    expect(fake.get(`quizRewards/s1_${today()}`)).toBeUndefined();
    reset();
    const get = fake.db.collection;
    let n = 0;
    // 밖에서 한 번 읽은 뒤(인증) 트랜잭션 안에서 읽을 땐 관리자가 된 문서
    fake.db.collection = (name) => {
      const c = get(name);
      if (name !== "users") return c;
      return { ...c, doc: (id) => { const d = c.doc(id); if (id !== "s1") return d; return { ...d, get: async () => { const snap = await d.get(); n++; return n > 1 ? { ...snap, data: () => ({ ...snap.data(), isAdmin: true, isApproved: true }) } : snap; } }; } };
    };
    try {
      await expect(call(right())).rejects.toMatchObject({ code: "failed-precondition" });
    } finally { fake.db.collection = get; }
    expect(fake.get("users/s1").cash).toBe(5_000);
  });
});
