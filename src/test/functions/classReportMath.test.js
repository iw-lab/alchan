/**
 * 학급 경제 리포트 — 계산만 떼어 낸 순수 함수(functions/classReportMath.js).
 * 불변식: ① 모두 같으면 지니 0, 한 명이 다 가지면 1 에 가깝다 ② 빚(음수)이 섞여도 0~1 을 벗어나지 않는다
 *         ③ 못 쓰는 값(NaN·없음)은 0 으로 세고 던지지 않는다 ④ 몫의 합은 전체를 넘지 않는다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { median, gini, shareOf, buildClassReport } = require("../../../functions/classReportMath.js");

const row = (netAssets, extra = {}) => ({ cash: Math.max(0, netAssets), totalAssets: Math.max(0, netAssets), netAssets, loanTotal: 0, ...extra });

describe("지니계수", () => {
  it("모두 같으면 0", () => expect(gini([100, 100, 100, 100])).toBe(0));
  it("한 명이 다 가지면 (n-1)/n", () => expect(gini([0, 0, 0, 1000])).toBe(0.75));
  it("빚이 섞여도 0~1 안", () => {
    const g = gini([-5_000_000, 100, 200, 300]);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(1);
  });
  it("한 명·전부 0·빈 배열은 0", () => {
    expect(gini([500])).toBe(0);
    expect(gini([0, 0, 0])).toBe(0);
    expect(gini([])).toBe(0);
  });
  it("못 쓰는 값은 0 으로 센다", () => expect(gini([NaN, undefined, 100, 100])).toBe(0.5));
});

describe("가운데 값·몫", () => {
  it("가운데 값 — 홀수·짝수·빈 배열", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // 2.5 → 반올림
    expect(median([])).toBe(0);
  });
  it("상위 20% 몫 + 하위 50% 몫 ≤ 1", () => {
    const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 1000];
    const top = shareOf(xs, 0.2, true), bottom = shareOf(xs, 0.5, false);
    expect(top).toBeCloseTo(1090 / 1450, 3);
    expect(bottom).toBeCloseTo(150 / 1450, 3);
    expect(top + bottom).toBeLessThanOrEqual(1);
  });
  it("전부 0 이면 몫도 0", () => expect(shareOf([0, 0], 0.2, true)).toBe(0));
});

describe("리포트", () => {
  it("인원·합계·빚진 학생·저축하는 학생을 센다", () => {
    const r = buildClassReport([
      row(1_000_000, { parkingBalance: 400_000 }),
      row(2_000_000, { stockValue: 500_000, depositSavingsTotal: 100_000 }),
      row(-300_000, { loanTotal: 800_000, totalAssets: 500_000, cash: 500_000 }),
      row(0),
    ]);
    expect(r.count).toBe(4);
    expect(r.netTotal).toBe(2_700_000);
    expect(r.inDebt).toBe(1);
    expect(r.borrowers).toBe(1);
    expect(r.savers).toBe(2);
    expect(r.investors).toBe(1);
    expect(r.loanTotal).toBe(800_000);
    expect(r.min).toBe(-300_000);
    expect(r.max).toBe(2_000_000);
    expect(r.composition.parkingBalance).toBe(400_000);
  });
  it("터무니없이 큰 값·많은 인원에도 0~1 을 지키고 던지지 않는다(교차검증 codex 2026-11-11)", () => {
    expect(gini([0, 1e308])).toBe(0.5);
    expect(shareOf([1e308, 1e308, 1e308, 1e308], 0.5, false)).toBe(0.5);
    const big = buildClassReport(Array.from({ length: 200_000 }, () => ({ netAssets: 0 })));
    expect(big.count).toBe(200_000);
    expect(big.min).toBe(0);
    const r = buildClassReport([{ netAssets: 1e308, totalAssets: 1e308 }, { netAssets: -1e308 }]);
    for (const k of ["gini", "top20Share", "bottom50Share"]) {
      expect(Number.isFinite(r[k])).toBe(true);
      expect(r[k]).toBeGreaterThanOrEqual(0);
      expect(r[k]).toBeLessThanOrEqual(1);
    }
    expect(Number.isFinite(r.netTotal)).toBe(true);
  });
  it("빈 학급·깨진 입력에 던지지 않는다", () => {
    expect(buildClassReport([]).count).toBe(0);
    expect(buildClassReport(null).gini).toBe(0);
    expect(buildClassReport([null, undefined, { netAssets: "문자열" }]).count).toBe(1);
  });
});
