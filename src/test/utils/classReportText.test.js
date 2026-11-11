import { describe, it, expect } from "vitest";
import { giniReading, teachingPrompts } from "../../utils/classReportText";

describe("학급 경제 리포트 — 숫자를 말로", () => {
  it("지니계수 구간", () => {
    expect(giniReading(0.1).tone).toBe("good");
    expect(giniReading(0.3).tone).toBe("ok");
    expect(giniReading(0.5).tone).toBe("warn");
    expect(giniReading(0.8).tone).toBe("bad");
    expect(giniReading(undefined).tone).toBe("none");
    expect(giniReading(NaN).tone).toBe("none");
  });
  it("수업 거리는 조건에 맞는 것만, 최대 4개", () => {
    const calm = { count: 20, gini: 0.2, top20Share: 0.3, inDebt: 0, savers: 15, investors: 10, landlords: 3, totalAssets: 100, composition: { cash: 30 } };
    expect(teachingPrompts(calm)).toEqual([]);
    const rough = { count: 20, gini: 0.6, top20Share: 0.72, inDebt: 2, savers: 3, investors: 1, landlords: 0, totalAssets: 100, composition: { cash: 90 } };
    const out = teachingPrompts(rough);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatch(/72%/);
    expect(out[1]).toMatch(/2명/);
  });
  it("학생이 5명 미만이면 «상위 20%» 이야기는 하지 않는다", () => {
    const tiny = { count: 2, gini: 0.5, top20Share: 1, inDebt: 0, savers: 2, investors: 2, landlords: 1, totalAssets: 100, composition: { cash: 10 } };
    expect(teachingPrompts(tiny).join()).not.toMatch(/상위 20%/);
  });
  it("빈 학급·없는 리포트는 빈 배열", () => {
    expect(teachingPrompts(null)).toEqual([]);
    expect(teachingPrompts({ count: 0 })).toEqual([]);
  });
});
