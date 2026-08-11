/**
 * 금액 가드 — `functions/moneyGuards.js`.
 *
 * 이 파일이 존재하는 이유: **같은 구멍에 두 번 뚫렸다.**
 *
 *   1차 (2026-08-11 전수 리뷰 C3)
 *     `if (!stock.price)` 진위 검사만 있어 `price: -100` 이 통과했다.
 *     cost 가 음수 → 잔액 검사 우회 → `increment(-totalCost)` 가 현금을 **발행**했다.
 *
 *   2차 (같은 날 재검증, codex)
 *     "유한한 양수"로 좁혔더니 그것도 뚫렸다.
 *       · Number.MIN_VALUE — 유한 양수라 통과. cost 가 0 으로 반올림돼 **공짜 매수**.
 *         실물가 갱신이 최소 100원으로 올려 주므로 되팔면 무담보 차익이 된다.
 *       · Number.MAX_VALUE — 유한하지만 × 수량 하면 Infinity → increment(Infinity).
 *
 * 두 번 다 "그럴듯한 검사"였고 두 번 다 뚫렸다. 세 번째는 테스트로 막는다.
 * 아래 케이스는 전부 **실제로 뚫렸던 값**이거나 그 이웃 경계다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { isValidStockPrice, isSafeAmount, MAX_STOCK_PRICE, MAX_MONEY } =
  require_("../../../functions/moneyGuards.js");

describe("isValidStockPrice — 1차·2차로 뚫린 값이 전부 막히는가", () => {
  it("🔴 1차로 뚫린 값: 음수 가격", () => {
    expect(isValidStockPrice(-100)).toBe(false);
    expect(isValidStockPrice(-1)).toBe(false);
  });

  it("🔴 2차로 뚫린 값 ①: Number.MIN_VALUE (유한 양수인데 cost 가 0 이 된다)", () => {
    expect(isValidStockPrice(Number.MIN_VALUE)).toBe(false);
    // 왜 위험한지 여기서 못 박는다 — 통과했다면 10주 사도 0원이었다.
    expect(Math.round(Number.MIN_VALUE * 10)).toBe(0);
  });

  it("🔴 2차로 뚫린 값 ②: Number.MAX_VALUE (× 수량 하면 Infinity)", () => {
    expect(isValidStockPrice(Number.MAX_VALUE)).toBe(false);
    expect(Number.isFinite(Number.MAX_VALUE * 10000)).toBe(false);
  });

  it("소수는 막는다 (0.5원짜리 주식은 반올림 손실을 낳는다)", () => {
    for (const v of [0.5, 1.5, 99.99, 1e-7]) {
      expect(isValidStockPrice(v)).toBe(false);
    }
  });

  it("0 · NaN · Infinity · 비숫자를 막는다", () => {
    for (const v of [0, NaN, Infinity, -Infinity, "1000", null, undefined, {}, []]) {
      expect(isValidStockPrice(v)).toBe(false);
    }
  });

  it("정상 가격은 통과한다 (가드가 기능을 죽이면 안 된다)", () => {
    for (const v of [1, 100, 10000, 1234567, MAX_STOCK_PRICE]) {
      expect(isValidStockPrice(v)).toBe(true);
    }
  });

  it("상한 경계: 딱 상한은 통과, 1 넘으면 차단", () => {
    expect(isValidStockPrice(MAX_STOCK_PRICE)).toBe(true);
    expect(isValidStockPrice(MAX_STOCK_PRICE + 1)).toBe(false);
  });
});

describe("isSafeAmount — increment() 에 들어가기 전 마지막 관문", () => {
  it("Infinity·NaN 을 막는다 (장부에 들어가면 복구가 안 된다)", () => {
    for (const v of [Infinity, -Infinity, NaN]) {
      expect(isSafeAmount(v)).toBe(false);
    }
  });

  it("사업 상한(100억)을 **넘는 중간 계산값은 통과시킨다** — 그건 잔액 검사가 판단한다", () => {
    // 🔬 실측: 라이브 최고가 SK하이닉스 143만원 × 최대수량 10,000주 = 143억.
    //    여기서 100억으로 자르면 "현금이 부족합니다" 대신 엉뚱한 에러가 나가고,
    //    더 비싼 종목이 들어오면 정상 거래가 막힌다. 이 함수는 Infinity·NaN 만 막는다.
    expect(isSafeAmount(1_430_000 * 10_000)).toBe(true);
    expect(isSafeAmount(MAX_MONEY + 1)).toBe(true);
  });

  it("계산 불가 크기는 막는다 (안전 정수 범위 밖)", () => {
    expect(isSafeAmount(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isSafeAmount(Number.MAX_SAFE_INTEGER * 2)).toBe(false);
  });

  it("정상 금액은 통과한다 (0 과 소수 포함 — 수수료·세금은 소수가 될 수 있다)", () => {
    for (const v of [0, 1, -1, 3850.5, 1000000]) {
      expect(isSafeAmount(v)).toBe(true);
    }
  });

  it("호출자가 더 좁은 상한을 줄 수 있다", () => {
    expect(isSafeAmount(1000, 500)).toBe(false);
    expect(isSafeAmount(400, 500)).toBe(true);
  });
});

describe("가드를 통과한 가격은 실제 거래 계산에서 안전한가", () => {
  // buyStock/sellStock 이 하는 계산을 그대로 재현해, 가드 통과값이
  // 최대 수량(10,000주)에서도 유한하고 상한 안인지 확인한다.
  const MAX_QTY = 10000;

  it("상한 가격 × 최대 수량도 안전 정수 범위 안이다 (increment 가능)", () => {
    const cost = MAX_STOCK_PRICE * MAX_QTY; // 10^14
    expect(Number.isFinite(cost)).toBe(true);
    expect(isSafeAmount(cost)).toBe(true);
    expect(cost).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("라이브 가격대(실측 27,195원 ~ 1,430,000원)가 전부 통과한다", () => {
    // 🔬 2026-08-11 CentralStocks 22종목 실측 — 전부 정수, 최저 27,195 · 최고 1,430,000.
    //    가드가 정상 거래를 막으면 안 된다.
    for (const price of [27195, 40850, 70000, 713545, 1430000]) {
      expect(isValidStockPrice(price)).toBe(true);
      const cost = price * MAX_QTY;
      const total = cost + Math.round(cost * 0.005) + Math.floor(cost * 0.003);
      expect(isSafeAmount(total)).toBe(true);
    }
  });
});
