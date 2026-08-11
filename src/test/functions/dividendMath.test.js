/**
 * 배당 계산 — `functions/dividendMath.js`.
 *
 * 배당은 이 앱에서 **유일하게 아무 대가 없이 학생 현금이 늘어나는** 경로다(주급은 교사 잔액에서
 * 빠지고, 매도는 보유를 내놓는다). 그래서 여기 계산이 틀리면 통화량이 조용히 샌다.
 *
 * 2026-08-11 교차검증에서 이 파일 계열로 두 가지가 나왔다.
 *   H5 — 멱등 가드가 없어 부분 실패 후 재실행하면 이미 받은 보유분에 또 지급됐다.
 *   C3 — 같은 뿌리: 가격을 truthy 로만 검사하면 음수가 통과한다(주식 매수에서 실제로 뚫렸다).
 * 전자는 monthKey 마커로, 후자는 아래 가격 가드로 막는다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { calculateDividend, computeMonthKey, DIVIDEND_TAX_RATE } = require_(
  "../../../functions/dividendMath.js",
);

const 종목 = (over = {}) => ({ price: 10000, dividendYieldAnnual: 3, ...over });
const 보유 = (over = {}) => ({ quantity: 100, ...over });

describe("지급액 — 세전·세금·세후가 어긋나지 않는다", () => {
  it("연 3% · 10,000원 · 100주 = 월 2,500원 세전", () => {
    // 평가액 100주 × 10,000원 = 1,000,000원. 월 배당률 = 3% / 12 = 0.25%.
    // 1,000,000 × 0.0025 = 2,500
    const r = calculateDividend(종목(), 보유());
    expect(r.grossAmount).toBe(2500);
    expect(r.taxAmount).toBe(Math.floor(2500 * DIVIDEND_TAX_RATE)); // 385
    expect(r.netAmount).toBe(2500 - r.taxAmount); // 2,115
  });

  it("세후 + 세금 = 세전 (어느 입력에서도 1원도 새지 않는다)", () => {
    for (const [price, qty, yld] of [
      [10000, 100, 3],
      [1234, 7, 5.5],
      [99999, 1, 0.1],
      [500, 3333, 12],
    ]) {
      const r = calculateDividend(
        종목({ price, dividendYieldAnnual: yld }),
        보유({ quantity: qty }),
      );
      if (!r) continue;
      expect(r.netAmount + r.taxAmount).toBe(r.grossAmount);
      expect(r.netAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it("1원 미만은 지급하지 않는다 (반올림으로 없던 돈이 생기지 않게)", () => {
    expect(
      calculateDividend(
        종목({ price: 100, dividendYieldAnnual: 0.01 }),
        보유({ quantity: 1 }),
      ),
    ).toBe(null);
  });
});

describe("🔒 가격·수량 가드 — C3 와 같은 뿌리", () => {
  it("음수 가격은 지급하지 않는다 (통과시키면 배당이 현금을 뺏는다)", () => {
    expect(calculateDividend(종목({ price: -10000 }), 보유())).toBe(null);
  });

  it("0원·NaN·Infinity 가격 모두 막는다", () => {
    for (const price of [0, NaN, Infinity, -Infinity]) {
      expect(calculateDividend(종목({ price }), 보유())).toBe(null);
    }
  });

  it("음수·NaN 수량을 막는다", () => {
    for (const quantity of [-100, 0, NaN, Infinity]) {
      expect(calculateDividend(종목(), 보유({ quantity }))).toBe(null);
    }
  });

  it("음수·0 배당률은 대상이 아니다", () => {
    for (const dividendYieldAnnual of [-3, 0, NaN]) {
      expect(calculateDividend(종목({ dividendYieldAnnual }), 보유())).toBe(null);
    }
  });

  it("문서가 비어 있어도 던지지 않고 null 을 준다", () => {
    expect(calculateDividend({}, {})).toBe(null);
    expect(calculateDividend(null, null)).toBe(null);
  });
});

describe("monthKey — 멱등 마커의 단위", () => {
  it("KST 기준으로 월을 정한다", () => {
    // 2026-09-01 KST 00:30 = 2026-08-31 UTC 15:30.
    // UTC 로 계산하면 "2026-08" 이 되어 8월 배당이 9월에 한 번 더 나간다.
    expect(computeMonthKey(new Date("2026-08-31T15:30:00Z"))).toBe("2026-09");
  });

  it("KST 로 아직 그 달이면 그 달이다", () => {
    expect(computeMonthKey(new Date("2026-08-31T14:59:00Z"))).toBe("2026-08");
  });

  it("한 자리 월은 0 을 채운다 (문자열 비교라 '2026-9' 는 마커로 못 쓴다)", () => {
    expect(computeMonthKey(new Date("2026-09-15T00:00:00Z"))).toBe("2026-09");
    expect(computeMonthKey(new Date("2026-01-15T00:00:00Z"))).toBe("2026-01");
  });

  it("연말 경계에서 해가 넘어간다", () => {
    expect(computeMonthKey(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01");
  });
});
