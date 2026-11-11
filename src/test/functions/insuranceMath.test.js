/**
 * 재난 보험 계산(functions/insuranceMath.js).
 * 불변식: I1 보험금은 정수·0 ≤ 보험금 ≤ 손실  I2 보험금 ≤ 남은 한도  I3 못 쓰는 입력은 0 원(던지지 않는다)
 *         I4 보험료 ≤ 가진 현금, 한도 = 보험료 × 20.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const m = require("../../../functions/insuranceMath.js");
import * as client from "../../utils/insurance";

describe("보험료", () => {
  it("현금의 1%(올림), 최소 100원, 한도는 20배", () => {
    expect(m.quotePremium(50_000)).toEqual({ ok: true, premium: 500, cap: 10_000 });
    expect(m.quotePremium(12_345)).toEqual({ ok: true, premium: 124, cap: 2_480 });
    expect(m.quotePremium(3_000)).toEqual({ ok: true, premium: 100, cap: 2_000 });
    expect(m.quotePremium(100)).toEqual({ ok: true, premium: 100, cap: 2_000 });
  });
  it("현금이 보험료보다 적으면 가입 불가 · 깨진 값도", () => {
    expect(m.quotePremium(99)).toEqual({ ok: false, reason: "not-enough-cash" });
    expect(m.quotePremium(0).ok).toBe(false);
    expect(m.quotePremium(-500).ok).toBe(false);
    for (const bad of [NaN, Infinity, -Infinity, "1000", null, undefined, 1e300]) expect(m.quotePremium(bad).ok).toBe(false);
  });
  it("보험료는 언제나 현금 이하", () => {
    for (const cash of [100, 101, 9_999, 1_000_001, 9_999_999_999]) {
      const q = m.quotePremium(cash);
      expect(q.ok).toBe(true);
      expect(q.premium).toBeLessThanOrEqual(cash);
      expect(q.cap).toBe(q.premium * 20);
    }
  });
});

describe("보험금", () => {
  it("손실의 절반(내림), 남은 한도까지", () => {
    expect(m.computePayout(1_000, 10_000)).toBe(500);
    expect(m.computePayout(1_001, 10_000)).toBe(500);
    expect(m.computePayout(1_000, 300)).toBe(300);
    expect(m.computePayout(1, 10_000)).toBe(0);
    expect(m.computePayout(0, 10_000)).toBe(0);
  });
  it("0 ≤ 보험금 ≤ min(손실, 한도) — 이상한 입력 포함", () => {
    const vals = [0, 1, 2, 999, 1e6, 1e10, 1e11, -1, 0.5, NaN, Infinity, "5", null];
    for (const loss of vals) for (const cap of vals) for (const rate of [undefined, 0.5, 1, 0, -1, 2, NaN, "0.5"]) {
      const p = m.computePayout(loss, cap, rate);
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      if (typeof loss === "number" && Number.isFinite(loss)) expect(p).toBeLessThanOrEqual(Math.max(0, loss));
      if (typeof cap === "number" && Number.isFinite(cap)) expect(p).toBeLessThanOrEqual(Math.max(0, cap));
    }
  });
});

describe("정책 유효성", () => {
  const now = Date.parse("2026-11-11T03:00:00Z");
  const ok = { classCode: "t1abcd", userId: "u1", capRemaining: 500, expiresAt: now + 1000 };
  it("본인·같은 학급·기한 안·한도 남음만 유효", () => {
    expect(m.isPolicyActive(ok, now, "t1abcd", "u1")).toBe(true);
    expect(m.isPolicyActive({ ...ok, expiresAt: { toMillis: () => now + 5 } }, now, "t1abcd", "u1")).toBe(true);
    expect(m.isPolicyActive({ ...ok, expiresAt: now }, now, "t1abcd", "u1")).toBe(false);
    expect(m.isPolicyActive({ ...ok, capRemaining: 0 }, now, "t1abcd", "u1")).toBe(false);
    expect(m.isPolicyActive({ ...ok, capRemaining: -3 }, now, "t1abcd", "u1")).toBe(false);
    expect(m.isPolicyActive(ok, now, "t2zzzz", "u1")).toBe(false);
    expect(m.isPolicyActive(ok, now, "t1abcd", "u2")).toBe(false);
    for (const bad of [null, undefined, 5, {}, { ...ok, expiresAt: "내일" }]) expect(m.isPolicyActive(bad, now, "t1abcd", "u1")).toBe(false);
  });
});

describe("서버 ↔ 화면 대조", () => {
  it("보험료·보험금·유효 판정이 같다", () => {
    for (const cash of [-5, 0, 50, 99, 100, 101, 12_345, 5e6, 9_999_999_999, 1e12, NaN]) expect(client.quotePremium(cash)).toEqual(m.quotePremium(cash));
    for (const loss of [0, 1, 999, 1e6, -1, 0.5]) for (const cap of [0, 1, 300, 1e7]) expect(client.computePayout(loss, cap)).toBe(m.computePayout(loss, cap));
    for (const k of ["PREMIUM_RATE", "MIN_PREMIUM", "CAP_MULTIPLIER", "COVERAGE_RATE", "TERM_DAYS", "TERM_MS"]) expect(client[k]).toBe(m[k]);
    const now = 1_800_000_000_000;
    for (const pol of [null, { classCode: "t1abcd", userId: "u1", capRemaining: 5, expiresAt: now + 1 }, { classCode: "t1abcd", userId: "u1", capRemaining: 0, expiresAt: now + 1 }, { classCode: "t1abcd", userId: "u1", capRemaining: 5, expiresAt: now - 1 }]) {
      expect(client.isPolicyActive(pol, now, "t1abcd", "u1")).toBe(m.isPolicyActive(pol, now, "t1abcd", "u1"));
    }
  });
  it("화면 상태 — 기한이 남았으면 가입 중(한도를 다 써도), 지났거나 남의 것이면 없음", () => {
    const now = 1_800_000_000_000;
    const pol = { classCode: "t1abcd", userId: "u1", capRemaining: 0, payoutThisTerm: 2000, expiresAt: now + 36 * 3600e3 };
    expect(client.policyView(pol, now, "t1abcd", "u1")).toMatchObject({ state: "active", daysLeft: 2, capRemaining: 0, payoutThisTerm: 2000 });
    expect(client.policyView({ ...pol, expiresAt: now }, now, "t1abcd", "u1").state).toBe("none");
    expect(client.policyView(pol, now, "t1abcd", "u2").state).toBe("none");
    expect(client.policyView(null, now, "t1abcd", "u1").state).toBe("none");
  });
});
