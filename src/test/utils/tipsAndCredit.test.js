import { describe, it, expect } from "vitest";
import { suggestNext, guideSteps, readGuideFlags, markGuideFlag } from "../../utils/todayTip";
import { creditGrade } from "../../utils/creditGrade";

describe("오늘의 제안", () => {
  const base = { known: true, cash: 100, parkingBalance: 50, depositCount: 1, stockValue: 10, propertyCount: 1, loanCount: 0, goalSet: true };
  it("대출이 있으면 늘 갚기를 먼저 권한다", () => {
    for (let seed = 0; seed < 7; seed++) expect(suggestNext({ ...base, loanCount: 1, parkingBalance: 0 }, seed).id).toBe("repay");
  });
  it("통장이 비어 있고 현금이 있으면 통장", () => expect(suggestNext({ ...base, parkingBalance: 0 }, 3).id).toBe("parking"));
  it("다 하고 있으면 제안이 없다", () => expect(suggestNext(base, 1)).toBeNull());
  it("안 해 본 것들을 날마다 돌아가며", () => {
    const st = { ...base, goalSet: false, stockValue: 0, propertyCount: 0 };
    const ids = new Set([0, 1, 2].map((d) => suggestNext(st, d).id));
    expect(ids).toEqual(new Set(["goal", "stock", "estate"]));
  });
  it("자산을 모르면(캐시 없음) 누구에게나 맞는 것만 · 깨진 입력에 던지지 않는다", () => {
    expect(["assets", "book"]).toContain(suggestNext({ known: false }, 0).id);
    expect(suggestNext(null, NaN)?.id).toBeTruthy(); // NaN 씨앗에 undefined 를 돌려주지 않는다
    expect(suggestNext({ known: true, cash: NaN }, -3)?.id).toBeTruthy();
    expect(suggestNext({ known: true }, Infinity)?.id).toBeTruthy();
  });
});

describe("교사 시작 도우미", () => {
  it("한 일은 표시되고, 순서는 고정", () => {
    const steps = guideSteps({ studentCount: 21, jobCount: 0, flags: { cards: true } });
    expect(steps.map((s) => [s.id, s.done])).toEqual([["students", true], ["cards", true], ["jobs", false], ["report", false]]);
    expect(guideSteps(null).every((s) => !s.done)).toBe(true);
  });
  it("표시는 학급별로 따로, 저장소가 깨져도 던지지 않는다", () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    markGuideFlag("t1abcd", "cards", storage);
    expect(readGuideFlags("T1ABCD", storage)).toEqual({ cards: true });
    expect(readGuideFlags("OTHER", storage)).toEqual({});
    mem.set("alchan_guide_BAD", "{깨짐");
    expect(readGuideFlags("bad", storage)).toEqual({});
    expect(markGuideFlag("x", "cards", { getItem() { throw new Error("막힘"); }, setItem() {} })).toEqual({ cards: true });
    expect(markGuideFlag("x", "cards", { getItem: () => null, setItem() { throw new Error("가득 참"); } })).toEqual({});
    expect(readGuideFlags("x", null)).toEqual({});
  });
});

describe("신용등급(연습용)", () => {
  const now = Date.parse("2026-11-11T00:00:00Z");
  it("빚 없고 잘 모으면 1등급", () => {
    const r = creditGrade({ loans: [], netAssets: 1000, totalAssets: 1000, savedTotal: 400, savingProducts: 1 }, now);
    expect(r.grade).toBe(1);
    expect(r.bad).toEqual([]);
  });
  it("아무것도 안 했으면 2등급(빚 없음) — 통장을 권한다", () => {
    const r = creditGrade({ loans: [], netAssets: 500, totalAssets: 500, savedTotal: 0, savingProducts: 0 }, now);
    expect(r.grade).toBe(2);
    expect(r.next).toMatch(/파킹통장/);
  });
  it("기한 지난 대출은 크게 깎는다", () => {
    const overdue = { maturityDate: new Date(now - 86400e3), balance: 100 };
    const r = creditGrade({ loans: [overdue], netAssets: -50, totalAssets: 50, savedTotal: 0 }, now);
    expect(r.grade).toBe(5);
    expect(r.bad.join()).toMatch(/1건/);
    expect(r.next).toMatch(/기한이 지난/);
  });
  it("다 갚은 대출(잔액 0)은 빚으로 세지 않는다 · 점수는 0~100", () => {
    expect(creditGrade({ loans: [{ maturityDate: new Date(now - 1), balance: 0 }], netAssets: 1 }, now).bad).toEqual([]);
    const many = Array.from({ length: 9 }, () => ({ maturityDate: new Date(now - 1), balance: 10 }));
    const r = creditGrade({ loans: many, netAssets: -1 }, now);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(creditGrade(null, now).grade).toBe(2);
  });
});
