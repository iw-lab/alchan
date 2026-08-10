/**
 * 주급 지급 대상 경계 — `functions/salaryUtils.js` isPayableTarget.
 *
 * 2026-08-10 교차검증에서 나온 결함: batchPaySalaries 가 대상 목록을 두 경로로 만드는데
 * (payAll = classCode 쿼리 / studentIds = UID 직접 조회), **studentIds 쪽에만**
 * 학급 대조도 역할 필터도 없었다. UID만 알면 남의 학급 학생에게 지급할 수 있었고
 * 교사·관리자 계정에도 주급이 나갔다. 지급은 발행이라 호출자 잔액이 줄지 않아
 * 억제력도 없다.
 *
 * 판정을 salaryUtils 한 곳으로 모았으니, 그 한 곳이 무너지지 않는지 여기서 지킨다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { isPayableTarget } = require_("../../../functions/salaryUtils.js");

const TEACHER = { classCode: "9BVPKP", isSuperAdmin: false };
const SUPER = { classCode: "BG6QUC", isSuperAdmin: true };

describe("지급 대상 경계", () => {
  it("교사는 자기 학급 학생에게 지급한다", () => {
    expect(isPayableTarget({ id: "a", classCode: "9BVPKP" }, TEACHER).ok).toBe(
      true,
    );
  });

  it("⭐ 교사는 다른 학급 학생에게 지급할 수 없다 — UID를 직접 넣어도", () => {
    const v = isPayableTarget({ id: "b", classCode: "BG6QUC" }, TEACHER);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("다른 학급");
  });

  it("⭐ 학급이 없는(미지정) 문서도 통과시키지 않는다", () => {
    expect(isPayableTarget({ id: "c" }, TEACHER).ok).toBe(false);
    expect(isPayableTarget({ id: "d", classCode: "" }, TEACHER).ok).toBe(false);
  });

  it("⭐ 교사·관리자 계정에는 주급이 나가지 않는다 — 같은 학급이어도", () => {
    for (const role of ["isAdmin", "isSuperAdmin", "isTeacher"]) {
      const v = isPayableTarget(
        { id: "t", classCode: "9BVPKP", [role]: true },
        TEACHER,
      );
      expect(v.ok, role).toBe(false);
      expect(v.reason, role).toContain("교사·관리자");
    }
  });

  it("슈퍼관리자는 학급 경계 없이 지급한다 — 관리 화면이 전 학급을 보여주는 기존 동작", () => {
    expect(isPayableTarget({ id: "e", classCode: "9BVPKP" }, SUPER).ok).toBe(
      true,
    );
  });

  it("⭐ 슈퍼관리자여도 교사·관리자 계정에는 못 준다", () => {
    expect(
      isPayableTarget({ id: "f", classCode: "9BVPKP", isTeacher: true }, SUPER)
        .ok,
    ).toBe(false);
  });

  it("호출자 정보가 비어 있으면 아무에게도 못 준다 (fail-closed)", () => {
    expect(isPayableTarget({ id: "g", classCode: "9BVPKP" }, null).ok).toBe(
      false,
    );
    expect(isPayableTarget({ id: "h", classCode: "9BVPKP" }, {}).ok).toBe(false);
    expect(isPayableTarget(null, TEACHER).ok).toBe(false);
  });

  it("⭐ isSuperAdmin 은 정확히 true 일 때만 경계를 푼다 — truthy 우회 차단", () => {
    for (const bad of ["true", 1, {}, "yes"]) {
      const v = isPayableTarget(
        { id: "i", classCode: "BG6QUC" },
        { classCode: "9BVPKP", isSuperAdmin: bad },
      );
      expect(v.ok, String(bad)).toBe(false);
    }
  });
});
