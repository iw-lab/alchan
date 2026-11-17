/**
 * 세금정산(2026-11-17) — 사진 판독 초안 → 학생별 합계 → 적용 요청 검사.
 * 실제 사진(사용자가 올린 3반 주간 정산표)을 Gemini 3.8 Flash 가 읽은 결과를 고정본으로 쓴다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import sheet from "../fixtures/taxsheet-2026-11-17.json";
import { rowTotals as clientTotals, matchRows, shortWon } from "../../utils/taxSettlement";
const require = createRequire(import.meta.url);
const { cleanSheet, rowTotals, validateSettlementItems, LIMITS } = require("../../../functions/taxSettlementMath.js");

const rows = cleanSheet(sheet);
const members = rows.map((r, i) => ({ id: `u${i + 1}`, name: `학생${i + 1}`, studentNumber: r.no, cash: 500000 }))
  .concat([{ id: "t1", name: "선생님", isAdmin: true, isApproved: true }]);

describe("cleanSheet — 판독 JSON 을 믿을 수 있는 모양으로", () => {
  it("실제 사진 21줄이 다 남는다", () => { expect(rows).toHaveLength(21); expect(rows.map((x) => x.no)).toEqual([...Array(21)].map((_, i) => i + 1)); });
  it("AI 가 이름을 돌려줘도 버린다(개인정보 — 번호로만)", () => {
    expect(rows.some((x) => "name" in x)).toBe(false);
    expect(cleanSheet({ rows: [{ no: 3, name: "홍길동", cells: [] }] })).toEqual([{ no: 3, cells: [] }]);
  });
  it("모르는 요일·칸·범위 밖 금액은 버린다", () => {
    const r = cleanSheet({ rows: [{ no: 1, name: "가<b>", cells: [
      { day: "토", col: "벌금", text: "x", sure: true, items: [{ won: 10000, times: 1 }] },
      { day: "월", col: "세금", text: "x", sure: true, items: [{ won: 10000, times: 1 }] },
      { day: "월", col: "벌금", text: "x", sure: true, items: [{ won: -5, times: 1 }, { won: 1e12, times: 1 }, { won: 50000, times: 999 }] },
    ] }] });
    expect(r[0].cells).toHaveLength(1);
    expect(r[0].cells[0].items).toEqual([{ won: 50000, count: 0, times: 1 }]);
  });
  it("범위 밖·소수 숫자를 고쳤으면 그 칸은 확인 필요(조용히 고친 값으로 합계 내지 않게)", () => {
    const r = cleanSheet({ rows: [{ no: 1, name: "가", cells: [
      { day: "월", col: "벌금", text: "x", sure: true, items: [{ won: 999999999999 }] },
      { day: "화", col: "상금", text: "x", sure: true, items: [{ won: 10000, times: 2.5 }] },
      { day: "수", col: "쿠폰", text: "1", sure: true, items: [{ count: 1 }] },
    ] }] });
    expect(r[0].cells.map((c) => c.sure)).toEqual([false, false, true]);
    expect(r[0].cells[0]).not.toHaveProperty("raw");
  });
  it("벌금·상금 칸인데 금액 없이 개수로 읽히면 확인 필요", () => {
    const row = { cells: [{ day: "월", col: "벌금", sure: true, items: [{ won: 0, count: 2, times: 1 }] }] };
    expect(rowTotals(row)).toMatchObject({ fine: 0, unsure: true });
    expect(clientTotals(row)).toEqual(rowTotals(row));
  });
  it("rows 가 없거나 이상하면 빈 배열", () => { expect(cleanSheet(null)).toEqual([]); expect(cleanSheet({ rows: "x" })).toEqual([]); });
});

describe("rowTotals — 배수(2X)·여러 금액·쿠폰", () => {
  it("2X 10만 + 5만 = 25만 벌금", () => {
    expect(rowTotals({ cells: [{ col: "벌금", sure: true, items: [{ won: 100000, times: 2 }, { won: 50000, times: 1 }] }] }))
      .toEqual({ fine: 250000, prize: 0, coupon: 0, unsure: false });
  });
  it("쿠폰 칸이 금액으로 읽히면 개수를 모르는 것 — 0개 + 확인 필요", () => {
    expect(rowTotals({ cells: [{ col: "쿠폰", sure: true, items: [{ won: 100000, count: 0, times: 1 }] }] }))
      .toEqual({ fine: 0, prize: 0, coupon: 0, unsure: true });
  });
  it("화면 사본과 서버 정본이 실제 사진 21줄 모두에서 같다", () => {
    for (const r of rows) expect(clientTotals(r)).toEqual(rowTotals(r));
  });
  it("실제 사진: 21번은 빈 줄, 1번은 벌금이 있다", () => {
    expect(rowTotals(rows[20]).fine).toBe(0);
    expect(rowTotals(rows[0]).fine).toBeGreaterThan(0);
  });
});

describe("matchRows — 표의 줄 ↔ 우리 반 학생(번호로만)", () => {
  it("실제 사진 21줄이 번호로 다 짝지어지고, 선생님 계정은 후보가 아니다", () => {
    const m = matchRows(rows, members);
    expect(m.every((x) => x.studentId && x.studentId !== "t1" && x.how === "no")).toBe(true);
    expect(m[0].studentId).toBe("u1");
  });
  it("번호를 못 읽었거나 없는 번호면 비워 두고 선생님이 고른다", () => {
    expect(matchRows([{ no: null, cells: [] }], members)[0]).toMatchObject({ studentId: null, how: "nono" });
    expect(matchRows([{ no: 99, cells: [] }], members)[0]).toMatchObject({ studentId: null, how: "none" });
  });
  it("같은 번호 학생이 둘이면 고르지 않는다", () => {
    const two = [{ id: "a", name: "가", studentNumber: 3 }, { id: "b", name: "나", studentNumber: 3 }];
    expect(matchRows([{ no: 3, cells: [] }], two)[0]).toMatchObject({ studentId: null, how: "many" });
  });
  it("같은 번호가 두 줄이면 뒤 줄은 비운다(두 번 넣지 않게)", () => {
    const m = matchRows([{ no: 1, cells: [] }, { no: 1, cells: [] }], members);
    expect(m[1]).toMatchObject({ studentId: null, how: "dup" });
  });
});

describe("validateSettlementItems — 서버가 받는 요청", () => {
  const ok = { userId: "u1", fine: 100000, prize: 0, coupon: 0 };
  it("정상", () => expect(validateSettlementItems([ok])).toBe(""));
  it("빈 목록·중복 학생·음수·소수·빈 항목·경로 문자 거절", () => {
    expect(validateSettlementItems([])).not.toBe("");
    expect(validateSettlementItems([ok, ok])).toMatch(/두 번/);
    expect(validateSettlementItems([{ ...ok, fine: -1 }])).not.toBe("");
    expect(validateSettlementItems([{ ...ok, fine: 1.5 }])).not.toBe("");
    expect(validateSettlementItems([{ ...ok, fine: 0 }])).toMatch(/넣을 것이 없는/);
    expect(validateSettlementItems([{ ...ok, userId: "a/b" }])).not.toBe("");
    expect(validateSettlementItems([{ ...ok, coupon: LIMITS.maxStudentCoupons + 1 }])).not.toBe("");
    expect(validateSettlementItems(Array.from({ length: LIMITS.maxStudents + 1 }, (_, i) => ({ ...ok, userId: `u${i}` })))).not.toBe("");
  });
  it("shortWon 은 표와 같은 모양", () => { expect(shortWon(1230000)).toBe("123만"); expect(shortWon(12345)).toBe("12,345"); });
});
