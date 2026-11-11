/**
 * 신용등급 서버 정본(functions/creditMath.js) + 화면 사본(src/utils/creditGrade.js) 대조.
 * 불변식: ① 점수 0~100·등급 1~5 ② 좋은 행동은 등급을 내리지 않는다 ③ 금리는 유한·0 이상·100 이하, 한도는 0 이상 정수
 *         ④ 서버와 화면이 같은 입력에 같은 답을 낸다(한쪽만 고치면 빨강) ⑤ 못 쓰는 입력에 던지지 않는다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as client from "../../utils/creditGrade";
const require = createRequire(import.meta.url);
const server = require("../../../functions/creditMath.js");

const now = Date.parse("2026-11-11T03:00:00Z");
const DAY = 86400e3;

describe("등급 책정", () => {
  it("처음 온 아이(현금만) = 60점 3등급", () => {
    const r = server.creditGrade({ cash: 1000 }, now);
    expect([r.score, r.grade]).toEqual([60, 3]);
  });
  it("통장에 조금 넣으면 2등급, 예적금까지 들고 1/4 넘게 모으면 1등급", () => {
    expect(server.creditGrade({ cash: 900, savedTotal: 100 }, now).grade).toBe(2);
    expect(server.creditGrade({ cash: 600, savedTotal: 400, savingProducts: 1 }, now).grade).toBe(1);
  });
  it("성실 완납은 1회 +5, 최대 +15", () => {
    const at = (onTime) => server.creditGrade({ cash: 1000, record: { onTime } }, now).score;
    expect([at(0), at(1), at(3), at(99)]).toEqual([60, 65, 75, 75]);
  });
  it("강제 상환에 돈이 모자랐던 기록은 30일 동안만 −20", () => {
    const at = (ago) => server.creditGrade({ cash: 1000, record: { late: 1, lastLateAt: now - ago } }, now).score;
    expect(at(DAY)).toBe(40);
    expect(at(29 * DAY)).toBe(40);
    expect(at(31 * DAY)).toBe(60);
    // 기록이 깨졌으면(횟수만 있고 날짜 없음) 깎지 않는다
    expect(server.creditGrade({ cash: 1000, record: { late: 3 } }, now).score).toBe(60);
  });
  it("기한 지난 대출 −30, 빚이 더 많으면 −25", () => {
    const loan = { balance: 5000, maturityDate: now - DAY };
    const r = server.creditGrade({ cash: 100, loans: [loan] }, now);
    expect(r.score).toBe(0);
    expect(r.grade).toBe(5);
  });
  it("좋은 행동은 점수를 내리지 않는다", () => {
    const base = { cash: 1000, savedTotal: 0, savingProducts: 0, record: { onTime: 0 } };
    const s0 = server.creditGrade(base, now).score;
    for (const better of [{ savedTotal: 10 }, { savedTotal: 500 }, { savedTotal: 500, savingProducts: 2 }, { record: { onTime: 2 } }]) {
      expect(server.creditGrade({ ...base, ...better }, now).score).toBeGreaterThanOrEqual(s0);
    }
  });
  it("깨진 입력에 던지지 않고 0~100·1~5 안", () => {
    for (const bad of [null, undefined, 3, "x", { cash: NaN, savedTotal: Infinity, loans: "no", record: 7 }, { cash: -1e300, loans: [null, {}, { balance: -5 }] }, { record: { onTime: -4, late: NaN, lastLateAt: "어제" } }]) {
      const r = server.creditGrade(bad, now);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect([1, 2, 3, 4, 5]).toContain(r.grade);
    }
  });
});

describe("대출 조건", () => {
  it("등급별 금리·한도", () => {
    expect(server.loanTerms(1, 1, 1000)).toMatchObject({ rate: 0.8, limit: 10000 });
    expect(server.loanTerms(2, 1, 1000)).toMatchObject({ rate: 0.9, limit: 10000 });
    expect(server.loanTerms(3, 1, 1000)).toMatchObject({ rate: 1, limit: 8000 });
    expect(server.loanTerms(4, 1, 1000)).toMatchObject({ rate: 1.15, limit: 5000 });
    expect(server.loanTerms(5, 1, 1000)).toMatchObject({ rate: 1.3, limit: 3000 });
  });
  it("금리는 0~100, 한도는 0 이상 정수 — 이상한 입력도", () => {
    for (const g of [1, 2, 3, 4, 5, 0, 9, "1", null]) {
      for (const base of [0, 0.05, 1, 99, 100, 1e9, -3, NaN, Infinity, "2"]) {
        for (const cash of [0, 1, 333, 1e12, -50, NaN, Infinity]) {
          const t = server.loanTerms(g, base, cash);
          expect(Number.isFinite(t.rate)).toBe(true);
          expect(t.rate).toBeGreaterThanOrEqual(0);
          expect(t.rate).toBeLessThanOrEqual(100);
          expect(Number.isInteger(t.limit)).toBe(true);
          expect(t.limit).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
  it("모르는 등급은 3등급 조건", () => expect(server.loanTerms(7, 1, 100)).toMatchObject({ rate: 1, limit: 800 }));
});

describe("상환 기록", () => {
  const start = now - 3 * DAY;
  const due = now + 4 * DAY;
  it("강제 상환으로 현금이 마이너스가 되면 late", () => {
    expect(server.repaymentOutcome({ mode: "maturity", cashAfter: -1, startMs: start, maturityMs: now - DAY, nowMs: now })).toBe("late");
  });
  it("하루 넘게 쓴 대출을 기한 안에 다 갚으면 onTime (만기일 자동 상환도 돈이 충분했으면)", () => {
    expect(server.repaymentOutcome({ mode: "lumpSum", cashAfter: 10, startMs: start, maturityMs: due, nowMs: now })).toBe("onTime");
    expect(server.repaymentOutcome({ mode: "maturity", cashAfter: 0, startMs: start, maturityMs: now - 3600e3, nowMs: now })).toBe("onTime");
  });
  it("갚을 날을 하루 넘게 넘겨 갚으면 성실 완납이 아니다", () => {
    expect(server.repaymentOutcome({ mode: "lumpSum", cashAfter: 10, startMs: now - 20 * DAY, maturityMs: now - 2 * DAY, nowMs: now })).toBeNull();
    expect(server.repaymentOutcome({ mode: "maturity", cashAfter: 10, startMs: now - 20 * DAY, maturityMs: now - 2 * DAY, nowMs: now })).toBeNull();
  });
  it("빌리자마자 갚으면 기록 없음(점수 파밍 차단) · 날짜를 모르면 기록 없음", () => {
    expect(server.repaymentOutcome({ mode: "lumpSum", cashAfter: 10, startMs: now - 3600e3, maturityMs: due, nowMs: now })).toBeNull();
    expect(server.repaymentOutcome({ mode: "lumpSum", cashAfter: 10, startMs: 0, maturityMs: due, nowMs: now })).toBeNull();
    expect(server.repaymentOutcome({ mode: "lumpSum", cashAfter: 10, startMs: start, nowMs: now })).toBeNull();
    expect(server.repaymentOutcome(null)).toBeNull();
  });
});

describe("서버 ↔ 화면 대조", () => {
  it("같은 입력에 같은 등급·점수·문구", () => {
    const loansSet = [[], [{ balance: 500, maturityDate: now + DAY }], [{ balance: 500, maturityDate: now - DAY }], [{ remainingPrincipal: 9e6, maturityDate: now - 5 * DAY }, { balance: 0 }]];
    const records = [undefined, { onTime: 1 }, { onTime: 5, late: 1, lastLateAt: now - 2 * DAY }, { late: 2, lastLateAt: now - 40 * DAY }];
    let cases = 0;
    for (const cash of [-200, 0, 1, 1000, 123456]) for (const savedTotal of [0, 1, 400, 1e6]) for (const savingProducts of [0, 1]) for (const loans of loansSet) for (const record of records) {
      const input = { cash, savedTotal, savingProducts, loans, record };
      expect(client.creditGrade(input, now)).toEqual(server.creditGrade(input, now));
      cases++;
    }
    expect(cases).toBe(640);
    for (const g of [1, 2, 3, 4, 5, 8]) for (const base of [0, 0.05, 0.3333, 1, 100]) for (const cash of [0, 77, 1000]) {
      expect(client.loanTerms(g, base, cash)).toEqual(server.loanTerms(g, base, cash));
    }
    expect(client.RATE_MULT).toEqual(server.RATE_MULT);
    expect(client.LIMIT_MULT).toEqual(server.LIMIT_MULT);
  });
});
