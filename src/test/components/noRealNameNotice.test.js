// 실명 금지 안내가 신고·고소장 입력란에 붙어 있고, 처리방침이 실제 동작과 맞는지.
// 2026-11-14 — 학습지원 소프트웨어 필수기준(최소 수집) 대비. 안내가 빠지면 여기서 빨강.
import { describe, it, expect, vi } from "vitest";
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

describe("신고·고소장 보관 기한", () => {
  it.each(["src/pages/government/PoliceStation.js", "src/pages/government/Court.js"])(
    "⭐ %s 는 새 문서에 expireAt 을 넣는다",
    (file) => {
      expect(read(file)).toMatch(/expireAt: recordExpireAt\(\)/);
    },
  );
  it("⭐ 처리방침의 숫자가 코드의 기한과 같다", async () => {
    const { RECORD_RETENTION_DAYS, recordExpireAt } = await import("../../utils/retention");
    expect(read("src/pages/legal/PrivacyPolicy.js")).toContain(`접수일부터 ${RECORD_RETENTION_DAYS}일`);
    expect(recordExpireAt(0).getTime()).toBe(RECORD_RETENTION_DAYS * 86400000);
  });
});

describe("비밀번호 = 아이디 안내", () => {
  it("⭐ 같을 때만, 그 계정에만 표시한다", async () => {
    // 시험 환경의 localStorage 는 흉내(vi.fn)라 값을 기억하지 않는다 — 진짜처럼 도는 것을 끼운다.
    const mem = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    });
    const w = await import("../../utils/weakPassword");
    w.rememberWeakPassword("u1", "Alchan01", "alchan01");
    expect(w.hasWeakPassword("u1")).toBe(true);
    expect(w.hasWeakPassword("u2")).toBe(false); // 같은 기기의 다른 학생에게는 안 뜬다
    w.rememberWeakPassword("u1", "alchan01", "다른비번");
    expect(w.hasWeakPassword("u1")).toBe(false);
    w.rememberWeakPassword("u1", "alchan01", "alchan01");
    w.clearWeakPassword();
    expect(w.hasWeakPassword("u1")).toBe(false);
    vi.unstubAllGlobals();
  });
  it("⭐ 비밀번호 자체는 저장하지 않는다", () => {
    const src = read("src/utils/weakPassword.js");
    expect(src).not.toMatch(/setItem\([^)]*password/);
  });
  it("로그인 성공 뒤에 표시하고, 바꾸면 지운다", () => {
    expect(read("src/pages/auth/Login.js")).toContain("rememberWeakPassword(firebaseUser.uid, studentId, password)");
    const h = read("src/components/AlchanHeader.js");
    expect(h).toContain("data-weak-password");
    expect(h).toMatch(/changePassword\(newPassword\);\s*clearWeakPassword\(\);/);
  });
});
