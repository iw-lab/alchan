/**
 * 쿠폰 목표 «초기화» = 새 목표 수를 그 자리에서 받는다.
 *
 * 왜(2026-10-23 선생님 «초기화를 하면 새로운 목표 갯수 바로 입력하게 해줘»):
 *   예전엔 초기화가 확인창 한 번으로 끝나고 목표 수는 그대로였다. 새 목표를 바꾸는 단추는
 *   «목표 달성» 뒤에만 떠서, 초기화한 뒤 목표를 바꿀 길이 없었다.
 *
 * 페이지·CF 는 firebase 초기화 때문에 import 할 수 없다 — 소스를 읽어 흐름을 본다
 * (couponDrawButton.test.js 와 같은 방식).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");
const body = (src, start, end) => {
  const i = src.indexOf(start);
  expect(i, `${start} 없음`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf(end, i + start.length));
};

describe("쿠폰 목표 초기화 · 새 목표 수를 바로 입력", () => {
  const PAGE = body(read("src/pages/coupon/CouponGoalPage.js"), "const resetCouponGoal = async", "const [isSettingNewGoal");
  const CF = body(read("functions/index.js"), "exports.resetCouponGoal", "\n});");

  it("초기화 단추는 확인창이 아니라 숫자 입력창을 띄운다", () => {
    expect(PAGE).toMatch(/await promptDialog\(/);
    expect(PAGE).toContain('inputMode: "numeric"');
    expect(PAGE).not.toMatch(/await confirmDialog\(/);
  });

  it("받은 수를 서버 함수에 넘기고 화면 목표도 바꾼다", () => {
    expect(PAGE).toMatch(/resetFn\(\{\s*targetAmount:\s*newTarget\s*\}\)/);
    expect(PAGE).toContain("setClassCouponGoal(newTarget)");
  });

  it("서버 함수가 새 목표를 검증해 저장한다(없으면 기존 목표 유지)", () => {
    expect(CF).toContain("request.data?.targetAmount");
    expect(CF).toContain("Number.isInteger(targetAmount)");
    expect(CF).toMatch(/targetAmount !== null \? \{ targetAmount \} : \{\}/);
  });
});
