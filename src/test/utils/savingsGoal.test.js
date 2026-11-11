import { describe, it, expect } from "vitest";
import { validateGoal, readGoal, goalProgress, GOAL_AMOUNT_MAX } from "../../utils/savingsGoal";

describe("저축 목표", () => {
  it("이름·금액 검사", () => {
    expect(validateGoal(" 자리 사기 ", "5,000,000")).toEqual({ ok: true, goal: { name: "자리 사기", amount: 5_000_000 } });
    expect(validateGoal("", 100).ok).toBe(false);
    expect(validateGoal("가".repeat(21), 100).ok).toBe(false);
    for (const bad of [0, -5, 1.5, "abc", NaN, Infinity, GOAL_AMOUNT_MAX + 1, null, undefined]) {
      expect(validateGoal("목표", bad).ok).toBe(false);
    }
  });
  it("문서에 이상한 값이 있어도 화면이 깨지지 않는다", () => {
    expect(readGoal(null)).toBeNull();
    expect(readGoal("문자열")).toBeNull();
    expect(readGoal({ name: "x", amount: -1 })).toBeNull();
    expect(readGoal({ name: "목표", amount: { toString: "깨짐" } })).toBeNull(); // String() 이 던지는 값
    expect(readGoal({ name: "목표", amount: [5] })).toBeNull();
    expect(readGoal({ name: { evil: 1 }, amount: 10 })).toBeNull();
    expect(readGoal({ name: "자리", amount: 300, setAt: {} })).toEqual({ name: "자리", amount: 300 });
  });
  it("진행률 — 넘쳐도 100%, 음수 저축은 0", () => {
    const g = { name: "자리", amount: 1000 };
    expect(goalProgress(g, 250)).toMatchObject({ percent: 25, left: 750, done: false });
    expect(goalProgress(g, 999)).toMatchObject({ percent: 99, done: false }); // 반올림으로 100% 가 되지 않는다
    expect(goalProgress(g, 5000)).toMatchObject({ percent: 100, left: 0, done: true });
    expect(goalProgress(g, -100)).toMatchObject({ percent: 0, saved: 0 });
    expect(goalProgress(null, 100)).toBeNull();
  });
});
