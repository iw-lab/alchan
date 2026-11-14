// 실명 금지 안내가 신고·고소장 입력란에 붙어 있고, 처리방침이 실제 동작과 맞는지.
// 2026-11-14 — 학습지원 소프트웨어 필수기준(최소 수집) 대비. 안내가 빠지면 여기서 빨강.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

describe("자유 입력란의 실명 금지 안내", () => {
  it.each([
    ["src/pages/government/SubmitReport.js", 1],
    ["src/pages/government/SubmitComplaint.js", 2],
    ["src/pages/government/Court.js", 1],
  ])("⭐ %s 에 안내가 %i 곳 있다", (file, n) => {
    const src = read(file);
    expect(src).toContain('import NoRealNameNotice from "../../components/NoRealNameNotice"');
    expect(src.split("<NoRealNameNotice").length - 1).toBe(n);
  });
  it("안내 문구가 실제 이름·전화번호를 말한다", () => {
    expect(read("src/components/NoRealNameNotice.js")).toMatch(/실제 이름·전화번호/);
  });
});

describe("개인정보처리방침이 실제와 맞다", () => {
  const policy = read("src/pages/legal/PrivacyPolicy.js");
  it("⭐ «학생 간 타인 정보 열람 불가»라고 쓰지 않는다(같은 반은 신고·고소장을 본다)", () => {
    expect(policy).not.toContain("학생 간 타인 정보 열람 불가");
  });
  it("⭐ 학생이 직접 쓴 글을 수집 항목으로 적는다", () => {
    expect(policy).toContain("학생이 직접 쓴 글");
  });
  it("«해당 학급 학생에게만» 한 학급 전용이라고 쓰지 않는다", () => {
    expect(policy).not.toContain("담임교사가 직접 개발·운영하며, 해당 학급 학생에게만");
  });
});
