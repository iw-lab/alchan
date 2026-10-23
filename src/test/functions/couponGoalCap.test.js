/**
 * 쿠폰 목표 1인 상한 — 2026-10-23 사용자 «한 사람이 50% 이상 못 응모하게».
 * 서버(functions/couponGoalCap.js)가 막고 클라이언트(src/utils/couponGoalCap.js)는 같은 판정으로 안내한다 — 둘이 갈리면 안 된다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import server from "../../../functions/couponGoalCap.js";
import * as client from "../../utils/couponGoalCap.js";

const read = (p) => readFileSync(resolve(__dirname, "../../..", p), "utf8");
const d = (userId, amount) => ({ userId, amount });

describe.each([["서버", server], ["클라이언트", client]])("%s 판정", (_, m) => {
  it("상한은 목표의 절반(내림) · 목표가 이상하면 기본 1000 · 최소 1", () => {
    expect(m.personalCap(1000)).toBe(500);
    expect(m.personalCap(7)).toBe(3);
    expect(m.personalCap(undefined)).toBe(500);
    expect(m.personalCap("abc")).toBe(500);
    expect(m.personalCap(1)).toBe(1);
  });
  it("내 응모 합계만 센다 — 남의 것·이상한 금액은 빼고", () => {
    const ds = [d("a", 200), d("b", 300), d("a", 100), d("a", -5), d("a", 1.5), null];
    expect(m.contributedBy(ds, "a")).toBe(300);
    expect(m.contributedBy(undefined, "a")).toBe(0);
  });
  it("남은 수 = 상한 − 내 합계, 0 아래로 안 내려간다", () => {
    expect(m.remainingFor(1000, [d("a", 300)], "a")).toBe(200);
    expect(m.remainingFor(1000, [d("a", 300), d("a", 200)], "a")).toBe(0);
    expect(m.remainingFor(1000, [d("a", 700)], "a")).toBe(0);
    expect(m.remainingFor(1000, [d("b", 500)], "a")).toBe(500);
  });
});

describe("donateCoupon 배선", () => {
  const src = read("functions/index.js");
  const body = src.slice(src.indexOf("exports.donateCoupon"), src.indexOf("exports.resetCouponGoal"));
  it("🔴 트랜잭션 안에서 목표 문서로 남은 수를 재고, 넘으면 쓰기 전에 던진다", () => {
    const check = body.indexOf("remainingFor(");
    const write = body.indexOf("transaction.set(\n          userRef");
    expect(check).toBeGreaterThan(body.indexOf("runTransaction"));
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(write);
    expect(body).toMatch(/if \(amount > left\)/);
  });
});
