import { describe, it, expect } from "vitest";
import { hasAdminPower, hasTeacherPower } from "../../../functions/authUtils";

// 2026-07-14 Gemini 교차검증에서 확인된 결함의 회귀 테스트:
//   교사 회원가입이 공개돼 있고 가입자가 isAdmin:true를 스스로 넣을 수 있는데(승인 대기),
//   rules·서버 어디서도 isApproved를 검사하지 않았다. 그래서 누구나 교사로 가입한 뒤
//   classCode를 남의 학급으로 바꾸면(학급 참여는 정상 기능) 그 학급의 관리자가 됐다.

describe("관리자 권한 = 승인된 계정만", () => {
  it("승인된 교사는 관리자 권한을 가진다", () => {
    expect(
      hasAdminPower({ isAdmin: true, isTeacher: true, isApproved: true }),
    ).toBe(true);
  });

  it("미승인 교사는 관리자 권한이 없다 (자가 가입 후 학급 탈취 차단)", () => {
    expect(
      hasAdminPower({ isAdmin: true, isTeacher: true, isApproved: false }),
    ).toBe(false);
    // isApproved 필드를 아예 빼고 가입해도 통과하면 안 된다
    expect(hasAdminPower({ isAdmin: true, isTeacher: true })).toBe(false);
  });

  it("슈퍼관리자는 승인 여부와 무관하게 통과 (운영 계정엔 isApproved가 없다)", () => {
    expect(hasAdminPower({ isSuperAdmin: true })).toBe(true);
  });

  it("일반 학생은 권한이 없다", () => {
    expect(hasAdminPower({ isAdmin: false })).toBe(false);
    expect(hasAdminPower({})).toBe(false);
    expect(hasAdminPower(null)).toBe(false);
  });

  it("교사 특권(한도 면제)도 승인된 계정에만", () => {
    expect(hasTeacherPower({ isTeacher: true, isApproved: true })).toBe(true);
    expect(hasTeacherPower({ isTeacher: true, isApproved: false })).toBe(false);
    expect(hasTeacherPower({ isTeacher: true })).toBe(false);
    expect(hasTeacherPower({ isSuperAdmin: true })).toBe(true);
    expect(hasTeacherPower({})).toBe(false);
  });
});
