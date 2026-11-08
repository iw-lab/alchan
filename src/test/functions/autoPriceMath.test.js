/**
 * 자동 물가 — 판정만 떼어 낸 순수 함수(functions/autoPriceMath.js).
 * 불변식: ① 튀는 상하위는 계산에서만 빠진다 ② 한 주 ±10% 를 넘지 않는다
 *         ③ 작은 변화는 쌓였다가 넘을 때 움직인다(기준이 같이 끌려가지 않는다) ④ 못 쓰는 값이면 아무것도 안 한다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { robustCenter, planStep, itemPrice, DEADBAND, MAX_STEP, MIN_STUDENTS } = require("../../../functions/autoPriceMath.js");

describe("대표 자산 — 위·아래를 잘라낸 평균", () => {
  it("부자 한 명이 대표값을 끌고 가지 않는다", () => {
    const base = Array.from({ length: 20 }, () => 1_000_000);
    const withRich = [...base.slice(0, 19), 500_000_000];
    expect(robustCenter(withRich)).toBe(1_000_000);
  });
  it("빚진 학생(음수 순자산)도 끌어내리지 않는다", () => {
    const xs = [...Array.from({ length: 19 }, () => 2_000_000), -90_000_000];
    expect(robustCenter(xs)).toBe(2_000_000);
  });
  it("20명이면 위·아래 4명씩 — 몰아주기 3명으로는 못 움직인다", () => {
    const xs = [...Array.from({ length: 17 }, () => 1_000_000), 9e8, 9e8, 9e8];
    expect(robustCenter(xs)).toBe(1_000_000);
  });
  it("학생이 적어도(5~9명) 위·아래 한 명씩은 뺀다", () => {
    expect(robustCenter([1, 100, 100, 100, 1_000_000])).toBe(100);
  });
  it(`학생이 ${MIN_STUDENTS}명 미만이면 계산하지 않는다`, () => {
    expect(robustCenter([1, 2, 3, 4])).toBeNull();
  });
  it("숫자가 아닌 값은 빼고 센다", () => {
    expect(robustCenter([NaN, "x", 5, 5, 5, 5, 5, Infinity])).toBe(5);
  });
});

describe("이번 주 배율", () => {
  it("변화가 3% 안이면 그대로, 기준도 그대로", () => {
    expect(planStep({ center: 1_020_000, anchor: 1_000_000 })).toMatchObject({ multiplier: 1, anchor: 1_000_000, changed: false });
  });
  it("작은 변화가 쌓여 3% 를 넘으면 그만큼 움직인다", () => {
    let anchor = 1_000_000, center = 1_000_000, moved = [];
    for (let w = 0; w < 4; w++) { center *= 1.02; const p = planStep({ center, anchor }); anchor = p.anchor; moved.push(p.multiplier); }
    expect(moved[0]).toBe(1);
    expect(moved[1]).toBeCloseTo(1.0404, 4);
  });
  it("한 주에 ±10% 를 넘지 않고, 남은 몫은 다음 주로 넘어간다", () => {
    const a = planStep({ center: 2_000_000, anchor: 1_000_000 });
    expect(a.multiplier).toBe(1 + MAX_STEP);
    expect(a.anchor).toBe(1_100_000);
    const b = planStep({ center: 2_000_000, anchor: a.anchor });
    expect(b.multiplier).toBe(1 + MAX_STEP);
    const d = planStep({ center: 100_000, anchor: 1_000_000 });
    expect(d.multiplier).toBe(1 - MAX_STEP);
  });
  it("10주면 실제 변화를 따라잡는다(발산·고착 없음)", () => {
    let anchor = 1_000_000;
    for (let w = 0; w < 10; w++) anchor = planStep({ center: 2_000_000, anchor }).anchor;
    expect(anchor / 2_000_000).toBeGreaterThan(1 - DEADBAND);
    expect(anchor / 2_000_000).toBeLessThan(1 + DEADBAND);
  });
  it("대표 자산이 0 이하이거나 기준이 없으면 아무것도 안 한다", () => {
    for (const c of [{ center: 0, anchor: 1e6 }, { center: -5, anchor: 1e6 }, { center: 1e6, anchor: 0 }, { center: null, anchor: 1e6 }, { center: 1e6, anchor: NaN }]) {
      const p = planStep(c);
      expect(p.multiplier).toBe(1);
      expect(p.changed).toBe(false);
      expect(p.reason).toBeTruthy();
    }
  });
});

describe("아이템 가격 — 수동 버튼과 같은 하한·상한, 한 주 ±10% 안", () => {
  it("반올림으로 10% 를 넘지 않는다", () => {
    for (let c = 100; c < 3000; c++) for (const m of [0.9, 1.1, 1.0537, 0.9312]) {
      const n = itemPrice(c, m);
      expect(n / c).toBeLessThanOrEqual(1.1 + 1e-9);
      expect(n / c).toBeGreaterThanOrEqual(0.9 - 1e-9);
    }
  });
  it("하한 100 아래로 내려가지 않는다", () => { expect(itemPrice(100, 0.9)).toBe(100); expect(itemPrice(105, 0.9)).toBe(100); });
  it("이상한 값은 그대로", () => { expect(itemPrice(0, 1.1)).toBe(0); expect(itemPrice(NaN, 1.1)).toBeNaN(); expect(itemPrice(500, 0)).toBe(500); });
});
