/**
 * 관리자 회수의 0원 바닥 — 돈이 생기거나 사라지지 않는지 지킨다.
 *
 * 실제 사고(2026-07-27, 9BVPKP): −50,000,000 회수가 28분 간격으로 두 번 들어가
 * 한 학생이 **−99,724,000** 이 됐다. 두 번째는 가져갈 게 없는데도 실행됐고,
 * 그만큼이 국고에 **없던 돈으로 적립**됐다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clampTakeAmount } from "../../../functions/cashFloor.js";

describe("회수 금액 상한", () => {
  it("잔액보다 많이 요청하면 잔액만큼만", () => {
    expect(clampTakeAmount(120_000, 500_000)).toEqual({ amount: 120_000, clampedFrom: 500_000 });
  });

  it("잔액보다 적게 요청하면 그대로 — 자르지 않는다", () => {
    expect(clampTakeAmount(500_000, 120_000)).toEqual({ amount: 120_000, clampedFrom: 0 });
  });

  it("딱 맞으면 전액, 잘린 표시 없음", () => {
    expect(clampTakeAmount(300_000, 300_000)).toEqual({ amount: 300_000, clampedFrom: 0 });
  });

  it("⭐ 잔액이 0 이면 아무것도 못 가져간다", () => {
    expect(clampTakeAmount(0, 50_000_000).amount).toBe(0);
  });

  it("⭐ 이미 마이너스면 더 뚫지 않는다 — 사고의 두 번째 회수", () => {
    // 첫 회수로 0 이 된 뒤 같은 −50,000,000 이 한 번 더 들어온 상황.
    const second = clampTakeAmount(-49_724_000, 50_000_000);
    expect(second.amount).toBe(0);
    expect(second.clampedFrom).toBe(50_000_000); // 요청은 있었다는 사실이 남는다
  });

  it("⭐ 사고 재현 — 두 번 연속 회수해도 0 아래로 안 내려간다", () => {
    let cash = 276_000; // 회수 직전 잔액(가정)
    for (const _ of [1, 2]) {
      const { amount } = clampTakeAmount(cash, 50_000_000);
      cash -= amount; // 학생 차감
    }
    expect(cash).toBe(0);
    expect(cash).toBeGreaterThanOrEqual(0);
  });
});

describe("돈 보존", () => {
  it("⭐ 학생에게서 빠진 만큼만 국고에 들어간다", () => {
    // 차감·적립이 같은 값을 쓰는지가 이 함수의 존재 이유다.
    for (const [cash, want] of [[100, 50], [100, 100], [100, 1000], [0, 1000], [-5, 10]]) {
      const { amount } = clampTakeAmount(cash, want);
      const studentAfter = cash - amount;
      const treasuryGain = amount;
      expect(studentAfter + treasuryGain).toBe(cash); // 총량 불변
      expect(studentAfter).toBeGreaterThanOrEqual(Math.min(0, cash)); // 더 나빠지지 않는다
    }
  });

  it("⭐ 반환값은 절대 음수가 아니다 — 음수면 국고에서 돈이 빠진다", () => {
    for (const cash of [-1_000_000, -1, 0, 1, 1_000_000]) {
      expect(clampTakeAmount(cash, 999).amount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("망가진 입력", () => {
  it("NaN·undefined·음수 요청에도 0 을 넘겨주지 않는다", () => {
    expect(clampTakeAmount(NaN, 100).amount).toBe(0);
    expect(clampTakeAmount(100, NaN).amount).toBe(0);
    expect(clampTakeAmount(100, -50).amount).toBe(0);
    expect(clampTakeAmount(undefined, undefined).amount).toBe(0);
  });
});

describe("index.js 배선 — 순수 함수가 맞아도 배선이 틀리면 소용없다", () => {
  const INDEX = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
  // adminCashAction 트랜잭션 본문만 잘라 본다.
  const body = INDEX.slice(
    INDEX.indexOf("const needAdminCredit = action === \"take\""),
    INDEX.indexOf("markIdempotent(tx, keyRef);"),
  );

  it("⭐ 학생 차감과 국고 적립이 **같은 변수**를 쓴다", () => {
    expect(body).toContain("cash: increment(-baseAmount)");
    expect(body).toContain("cash: increment(baseAmount)");
    // 한쪽만 다른 값을 쓰면 돈이 생기거나 사라진다.
    expect(body).not.toMatch(/increment\(-\s*(?!baseAmount)\w+\)[^]{0,80}국고/);
  });

  it("⭐ 자르기가 두 increment 보다 **앞**에 있다", () => {
    const clamp = body.indexOf("clampTakeAmount(");
    const debit = body.indexOf("increment(-baseAmount)");
    const credit = body.indexOf("increment(baseAmount)");
    expect(clamp).toBeGreaterThan(-1);
    expect(clamp).toBeLessThan(debit);
    expect(clamp).toBeLessThan(credit);
  });

  it("⭐ 지급(send)은 자르기를 타지 않는다", () => {
    expect(body).toContain('if (action !== "send")');
  });

  it("⭐ 잔액이 없어 건너뛴 학생이 결과에서 사라지지 않는다", () => {
    expect(INDEX).toContain("skippedNoBalance");
    expect(INDEX).toContain("noBalanceCount");
  });
});

describe("파산 사건은 합의금 경로에 못 들어온다", () => {
  const INDEX = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
  it("⭐ processCourtSettlement 이 caseType 을 검사한다", () => {
    // 헤더 주석이 아니라 **트랜잭션 본문**을 앵커로 잡는다(주석에도 courtsettle_ 이 있다).
    const start = INDEX.indexOf("이미 합의금 지급이 완료된 사건입니다.");
    const settle = INDEX.slice(start, start + 2500);
    expect(start).toBeGreaterThan(-1);
    expect(settle).toContain('cData.caseType === "bankruptcy"');
    // 잔액 이동보다 **앞**에서 막아야 한다.
    expect(settle.indexOf("bankruptcy")).toBeLessThan(settle.indexOf("increment"));
  });
});
