/**
 * 배지 — 저장 없이 지금 상태로 계산(utils/achievementSystem.js evaluateAchievements).
 * 2026-11-11 전수 점검: 예전 구현은 localStorage 를 읽기만 하고 쓰는 코드가 없어 배지가 한 번도 뜨지 않았다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { evaluateAchievements } from "../../utils/achievementSystem";

describe("배지 계산", () => {
  it("가진 것에 맞는 배지를 귀한 순으로 준다", () => {
    const r = evaluateAchievements({ totalAssets: 12_000_000, coupons: 12, parkingBalance: 5000, stockValue: 0, goalSet: true, goalDone: false });
    const ids = r.earned.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["multi_millionaire", "millionaire", "coupon_collector", "first_parking", "goal_setter"]));
    expect(ids).not.toContain("first_stock");
    expect(ids).not.toContain("goal_achiever");
    expect(r.best.id).toBe("multi_millionaire");
    expect(r.points).toBeGreaterThan(0);
  });
  it("모르는 값(undefined)으로는 아무 배지도 못 딴다 — 빈 입력에 던지지 않는다", () => {
    for (const st of [undefined, null, {}, "x"]) {
      const r = evaluateAchievements(st);
      expect(r.earned).toEqual([]);
      expect(r.best).toBeNull();
    }
  });
  it("수동 배지는 «다음 목표»에 안 나온다", () => {
    expect(evaluateAchievements({}).locked.map((a) => a.id)).not.toContain("early_bird");
  });
  it("🔒 읽기만 하고 쓰지 않는 저장소로 돌아가지 않는다", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../utils/achievementSystem.js"), "utf8");
    expect(src).not.toMatch(/localStorage\./);
    const profile = fs.readFileSync(path.resolve(__dirname, "../../pages/my-profile/MyProfile.js"), "utf8");
    expect(profile).not.toMatch(/getUserAchievements/);
    const header = fs.readFileSync(path.resolve(__dirname, "../../components/AlchanHeader.js"), "utf8");
    expect(header).not.toMatch(/getUserAchievements/);
  });
});
