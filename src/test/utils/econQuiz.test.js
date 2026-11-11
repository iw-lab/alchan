/**
 * 오늘의 경제 퀴즈 — 판정(utils/econQuiz.js)과 문항 은행(data/econQuiz.json).
 * 불변식: ① 은행의 모든 문항이 검사를 통과한다(정답 1개·보기 4개·중복 없음)
 *         ② 같은 학생·같은 날에는 같은 문제·같은 보기 순서, 정답 위치는 섞인 뒤에도 맞다
 *         ③ 하루에 한 번만 센다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateBank, pickQuestion, nextStats, readStats, dayKeyKST, TOPICS } from "../../utils/econQuiz";

const bankPath = path.resolve(__dirname, "../../data/econQuiz.json");
const bank = fs.existsSync(bankPath) ? JSON.parse(fs.readFileSync(bankPath, "utf8")) : null;
const ok = (over = {}) => ({ id: "tax-01", topic: "tax", q: "세금은 주로 어디에 쓰일까요?", choices: ["모두를 위한 일", "한 사람의 용돈", "가게 주인의 이익", "아무 데도 안 쓴다"], answer: 0, explain: "세금은 도로·학교처럼 모두가 함께 쓰는 것에 쓰여요.", ...over });

describe("문항 은행 검사기", () => {
  it("멀쩡한 문항은 통과", () => expect(validateBank([ok()])).toEqual([]));
  it.each([
    ["보기 3개", { choices: ["a", "b", "c"] }],
    ["보기 중복", { choices: ["같다", "같다", "다르다", "또 다르다"] }],
    ["정답 범위", { answer: 4 }],
    ["정답이 소수", { answer: 1.5 }],
    ["모르는 주제", { topic: "crypto" }],
    ["질문 짧음", { q: "뭐?" }],
    ["해설 없음", { explain: "" }],
    ["해설이 번호를 말함", { explain: "정답은 1번이에요. 왜냐하면 그렇기 때문이에요." }],
    ["id 형식", { id: "TAX1" }],
  ])("%s → 걸린다", (_n, over) => expect(validateBank([ok(over)]).length).toBeGreaterThan(0));
  it("질문·id 중복을 잡는다", () => {
    expect(validateBank([ok(), ok()]).join()).toMatch(/id 중복/);
    expect(validateBank([ok(), ok({ id: "tax-02" })]).join()).toMatch(/질문 중복/);
    expect(validateBank("x")).toHaveLength(1);
  });
});

describe("실제 문항 은행", () => {
  it("파일이 있고 검사를 전부 통과한다", () => {
    expect(bank).not.toBeNull();
    expect(validateBank(bank)).toEqual([]);
  });
  it("30문항 이상, 주제마다 2문항 이상, 정답 위치가 한쪽에 몰리지 않는다", () => {
    expect(bank.length).toBeGreaterThanOrEqual(30);
    for (const t of Object.keys(TOPICS)) expect(bank.filter((b) => b.topic === t).length, t).toBeGreaterThanOrEqual(2);
    const byPos = [0, 1, 2, 3].map((p) => bank.filter((b) => b.answer === p).length);
    expect(Math.max(...byPos)).toBeLessThanOrEqual(Math.ceil(bank.length * 0.45));
  });
});

describe("오늘의 문제", () => {
  const b = [ok(), ok({ id: "work-01", topic: "work", q: "직업을 가지면 받는 돈을 뭐라고 할까요?", choices: ["소득", "세금", "이자", "벌금"], answer: 0 }), ok({ id: "price-01", topic: "price", q: "물건값이 전체적으로 오르는 것을 뭐라고 할까요?", choices: ["물가 상승", "저축", "투자", "기부"], answer: 0 })];
  it("같은 학생·같은 날 = 같은 문제·같은 순서, 정답 위치가 맞다", () => {
    const a = pickQuestion(b, "uid1", "2026-11-11"), again = pickQuestion(b, "uid1", "2026-11-11");
    expect(again).toEqual(a);
    const src = b.find((x) => x.id === a.id);
    expect(a.choices[a.answerIndex]).toBe(src.choices[src.answer]);
    expect([...a.choices].sort()).toEqual([...src.choices].sort());
  });
  it("학생·날짜가 달라지면 문제나 순서가 달라진다(전부 같지는 않다)", () => {
    const seen = new Set();
    for (let d = 10; d < 30; d++) for (const u of ["a", "b", "c"]) { const q = pickQuestion(b, u, `2026-11-${d}`); seen.add(`${q.id}|${q.choices.join()}`); }
    expect(seen.size).toBeGreaterThan(6);
  });
  it("금요일에는 세금·직업 주제", () => {
    for (const u of ["a", "b", "c", "d", "e"]) expect(["tax", "work"]).toContain(pickQuestion(b, u, "2026-11-13").topic);
  });
  it("빈 은행·없는 값은 null", () => {
    expect(pickQuestion([], "u", "2026-11-11")).toBeNull();
    expect(pickQuestion(b, "", "2026-11-11")).toBeNull();
    expect(pickQuestion(null, "u", "2026-11-11")).toBeNull();
  });
  it("날짜 키는 한국 시간", () => {
    expect(dayKeyKST(Date.parse("2026-11-10T15:30:00Z"))).toBe("2026-11-11");
    expect(dayKeyKST(Date.parse("2026-11-10T14:59:00Z"))).toBe("2026-11-10");
  });
});

describe("기록", () => {
  it("하루에 한 번만 센다 · 어제 풀었으면 연속 +1 · 건너뛰면 1", () => {
    let s = nextStats(null, "2026-11-10", true);
    expect(s).toEqual({ day: "2026-11-10", lastCorrect: true, total: 1, correct: 1, streak: 1 });
    expect(nextStats(s, "2026-11-10", false)).toEqual(s);
    s = nextStats(s, "2026-11-11", false);
    expect(s).toMatchObject({ total: 2, correct: 1, streak: 2, lastCorrect: false });
    s = nextStats(s, "2026-11-14", true);
    expect(s).toMatchObject({ total: 3, correct: 2, streak: 1 });
  });
  it("문서에 이상한 값이 있어도 깨지지 않는다", () => {
    expect(readStats({ day: 5, total: -3, correct: 99, streak: "x" })).toEqual({ day: null, lastCorrect: false, total: 0, correct: 0, streak: 0 });
    expect(readStats({ day: "2026-11-11", total: 2, correct: 9 }).correct).toBe(2);
    expect(readStats("문자열").total).toBe(0);
  });
});
