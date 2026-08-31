// 같은 회수를 또 하려 할 때 **알려 주는** 장치를 지킨다.
//
// 배경: 2026-07-27 사고는 같은 −50,000,000 회수를 28분 뒤 한 번 더 누른 것이었다.
// 그때 막아 준 것은 "체크박스가 자동으로 꺼져 있었다"였는데, 2026-08-31 사용자 지시로
// 체크박스가 기본 켜짐이 되면서 그 방어가 사라졌다. 대신 확인창이 직전 회수를 알려 준다.
//
// ⚠️ **막지 않는다.** 정말 두 번 회수해야 할 때가 있다(벌칙 반복 등).
//    보여 주기만 하고 결정은 선생님이 한다 — 사용자 결정.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  takeSignature,
  describeElapsed,
} from "../../utils/takeSignature";

describe("회수 지문 — 같은 회수를 같다고 본다", () => {
  it("금액·방식·대상이 같으면 같은 지문", () => {
    const a = takeSignature("take", "fixed", "50000000", ["u1", "u2", "u3"]);
    const b = takeSignature("take", "fixed", "50000000", ["u1", "u2", "u3"]);
    expect(a).toBe(b);
  });

  it("대상 순서가 달라도 같은 지문 — 선택 순서는 회수의 정체가 아니다", () => {
    const a = takeSignature("take", "fixed", "50000000", ["u3", "u1", "u2"]);
    const b = takeSignature("take", "fixed", "50000000", ["u1", "u2", "u3"]);
    expect(a).toBe(b);
  });

  it("금액이 다르면 다른 지문", () => {
    expect(takeSignature("take", "fixed", "50000000", ["u1"])).not.toBe(
      takeSignature("take", "fixed", "5000000", ["u1"]),
    );
  });

  it("대상이 한 명이라도 다르면 다른 지문", () => {
    expect(takeSignature("take", "fixed", "1000", ["u1", "u2"])).not.toBe(
      takeSignature("take", "fixed", "1000", ["u1", "u3"]),
    );
  });

  it("고정금액과 퍼센트는 숫자가 같아도 다른 회수다", () => {
    expect(takeSignature("take", "fixed", "50", ["u1"])).not.toBe(
      takeSignature("take", "percentage", "50", ["u1"]),
    );
  });

  it("빈 대상·undefined 에도 터지지 않는다", () => {
    expect(() => takeSignature("take", "fixed", "1", undefined)).not.toThrow();
    expect(() => takeSignature("take", "fixed", "1", [])).not.toThrow();
  });
});

describe("경과 시간을 사람 말로", () => {
  it("1분 미만은 '방금'", () => {
    expect(describeElapsed(0)).toBe("방금");
    expect(describeElapsed(59_000)).toBe("방금");
  });
  it("사고 당시 간격(28분)을 분으로 말한다", () => {
    expect(describeElapsed(28 * 60_000)).toBe("28분");
  });
  it("시간·일 단위로 넘어간다", () => {
    expect(describeElapsed(60 * 60_000)).toBe("1시간");
    expect(describeElapsed(25 * 60 * 60_000)).toBe("1일");
  });
  it("음수(시계 역행)에도 안전하다", () => {
    expect(describeElapsed(-5000)).toBe("방금");
  });
});

describe("배선 — 확인창이 실제로 이 기억을 쓴다", () => {
  const SRC = readFileSync(
    resolve(process.cwd(), "src/pages/banking/MoneyTransfer.js"),
    "utf8",
  );

  it("⭐ 확인창이 중복 문구를 끼워 넣는다", () => {
    const gate = SRC.slice(
      SRC.indexOf('if (action === "take" && allowNegative) {'),
      SRC.indexOf("if (submittingRef.current) return;"),
    );
    expect(gate).toContain("lastTakeRef.current");
    expect(gate).toContain("takeSignature(");
    expect(gate).toContain("describeElapsed(");
    // 🔴 변수가 **선언만** 돼 있어도 통과하면 안 된다. 실제로 확인창 본문에
    //    이어 붙는지를 본다 — 처음 쓴 단언(`toMatch(/중복문구/)`)은 문구를 빼도
    //    통과하는 가짜 초록이었다(2026-08-31 변이로 발각).
    const dialog = gate.slice(gate.indexOf("await confirmDialog("));
    expect(dialog).toMatch(/중복문구 \+/);
    // 막지 않는다 — 중복이어도 확인만 받고 진행할 수 있어야 한다.
    expect(gate).not.toMatch(/중복문구[^]{0,120}\breturn;/);
  });

  it("⭐ 성공한 회수만 기억한다(실패분 있으면 기억 안 함)", () => {
    expect(SRC).toMatch(
      /if \(action === "take" && failCount === 0 && count > 0\) \{/,
    );
    expect(SRC).toMatch(/lastTakeRef\.current = \{/);
  });

  it("⭐ 지급(send)은 이 기억에 안 들어간다", () => {
    // 지급까지 세면 "같은 지급 두 번"에도 경고가 떠 의미가 흐려진다.
    const rec = SRC.slice(SRC.indexOf("lastTakeRef.current = {") - 200);
    expect(rec.slice(0, 260)).toContain('action === "take"');
  });
});
