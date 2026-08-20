/**
 * 배치 분할 판정 — 경계값 고정.
 *
 * 이 테스트가 있는 이유: 2026-08-17 주급이 `flushIfNeeded is not defined` 로 전 학급
 * 실패했다. 같은 판정 로직이 세 곳에 복붙돼 있었고, 옮기다 하나가 엉뚱한 함수에 붙었다.
 * 판정을 순수 함수로 모았으니 경계값도 여기서 고정한다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { shouldFlush, DEFAULT_SOFT_LIMIT } = require("../../../functions/batchChunk.js");

describe("shouldFlush — Firestore 배치 분할 판정", () => {
  it("기본 소프트 한도는 450 (500 한도의 90%)", () => {
    expect(DEFAULT_SOFT_LIMIT).toBe(450);
  });

  it("정확히 한도면 커밋하지 않는다 (경계 포함)", () => {
    expect(shouldFlush(447, 3)).toBe(false); // 450
  });

  it("한도를 1 넘으면 커밋한다", () => {
    expect(shouldFlush(448, 3)).toBe(true); // 451
  });

  it("빈 배치는 커밋하지 않는다", () => {
    expect(shouldFlush(0, 3)).toBe(false);
  });

  it("reserved 를 세지 않으면 마지막 순간에 자리가 모자란다 — 그래서 함께 센다", () => {
    // 주급: 관리자 차감 1자리가 커밋 직전에 반드시 실린다
    expect(shouldFlush(449, 1)).toBe(false);                    // reserved 미고려 시 450 → 통과
    expect(shouldFlush(449, 1, { reserved: 1 })).toBe(true);    // 실제로는 451 이라 먼저 커밋
  });

  it("재산세는 국고 입금 2자리를 예약한다", () => {
    expect(shouldFlush(446, 2, { reserved: 2 })).toBe(false); // 450
    expect(shouldFlush(447, 2, { reserved: 2 })).toBe(true);  // 451
  });

  it("배당은 학급 수에 비례해 예약한다", () => {
    expect(shouldFlush(441, 1, { reserved: 4 * 2 })).toBe(false); // 441+1+8 = 450
    expect(shouldFlush(442, 1, { reserved: 4 * 2 })).toBe(true);  // 442+1+8 = 451
    expect(shouldFlush(400, 1, { reserved: 4 * 2 })).toBe(false);
  });

  it("softLimit 을 낮추면 더 자주 커밋한다", () => {
    expect(shouldFlush(10, 1, { softLimit: 10 })).toBe(true);
    expect(shouldFlush(10, 1, { softLimit: 100 })).toBe(false);
  });

  it("망가진 입력에 조용히 무너지지 않는다", () => {
    // 한도 0 이하 → 매 쓰기마다 커밋(성능 붕괴), 음수 예약 → 한도 초과. 둘 다 기본값으로 막는다.
    expect(shouldFlush(0, 1, { softLimit: 0 })).toBe(false);
    expect(shouldFlush(0, 1, { softLimit: -5 })).toBe(false);
    expect(shouldFlush(449, 1, { reserved: -100 })).toBe(false);
    expect(shouldFlush(NaN, NaN)).toBe(false);
    expect(shouldFlush(undefined, undefined)).toBe(false);
  });
});
