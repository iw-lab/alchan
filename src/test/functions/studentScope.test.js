/**
 * 학급 목록과 학급별 인원수가 **같은 기준**을 쓰는지 지킨다.
 *
 * 왜 이걸 테스트하나: 2026-08-20 자가치유(logClassRegistryDrift)가 classes 문서를 만들 때
 * studentCount 를 심는다. 이 숫자는 이후 전부 증감으로만 유지되므로
 * (`Math.max(0, cur - N)` / `(cur || 0) + N`) 처음 한 번 틀리면 영구히 틀린다.
 * 목록과 인원수가 다른 판정을 쓰면 "학급은 잡혔는데 인원은 0" 같은 값이 그대로 눌러앉는다.
 */
import { describe, it, expect } from "vitest";
import {
  isStudentDoc,
  classCodesFromStudentSnap,
  studentCountsFromSnap,
} from "../../../functions/studentScope.js";

const snap = (docs) => ({ docs: docs.map((data) => ({ data: () => data })) });

describe("학생 판정 (studentScope)", () => {
  it("classCode 가 없으면 학생이 아니다", () => {
    expect(isStudentDoc({ name: "무학급" })).toBe(false);
    expect(isStudentDoc({ classCode: "", name: "빈문자" })).toBe(false);
  });

  it("교사·슈퍼관리자는 제외한다", () => {
    expect(isStudentDoc({ classCode: "A", isTeacher: true })).toBe(false);
    expect(isStudentDoc({ classCode: "A", isSuperAdmin: true })).toBe(false);
    expect(isStudentDoc({ classCode: "A" })).toBe(true);
  });

  it("빈 값·누락에도 죽지 않는다", () => {
    expect(isStudentDoc(null)).toBe(false);
    expect(isStudentDoc(undefined)).toBe(false);
  });
});

describe("스냅샷 파생", () => {
  const fixture = snap([
    { classCode: "BG6QUC", name: "학생1" },
    { classCode: "BG6QUC", name: "학생2" },
    { classCode: "9BVPKP", name: "학생3" },
    { classCode: "BG6QUC", name: "담임", isTeacher: true },
    { classCode: "9BVPKP", name: "관리자", isSuperAdmin: true },
    { name: "학급없음" },
  ]);

  it("학급 목록은 학생이 실제로 있는 학급만 담는다", () => {
    expect(classCodesFromStudentSnap(fixture).sort()).toEqual(["9BVPKP", "BG6QUC"]);
  });

  it("인원수는 교사·슈퍼관리자를 빼고 센다", () => {
    const counts = studentCountsFromSnap(fixture);
    expect(counts.get("BG6QUC")).toBe(2);
    expect(counts.get("9BVPKP")).toBe(1);
  });

  it("⭐ 목록과 인원수가 같은 판정을 쓴다 — 한쪽만 고치는 실수를 막는다", () => {
    const codes = classCodesFromStudentSnap(fixture);
    const counts = studentCountsFromSnap(fixture);
    expect([...counts.keys()].sort()).toEqual([...codes].sort());
    for (const code of codes) expect(counts.get(code)).toBeGreaterThan(0);
  });

  it("⭐ 자가치유가 심을 인원이 0 이 되는 학급은 없다", () => {
    // logClassRegistryDrift 는 '학생이 있는데 classes 문서가 없는' 학급만 탄다.
    // 그 학급의 studentCount 가 0 이면 그건 언제나 거짓이다.
    for (const code of classCodesFromStudentSnap(fixture)) {
      expect(studentCountsFromSnap(fixture).get(code) || 0).not.toBe(0);
    }
  });

  it("빈 스냅샷은 빈 결과를 준다", () => {
    expect(classCodesFromStudentSnap(snap([]))).toEqual([]);
    expect(studentCountsFromSnap(snap([])).size).toBe(0);
  });
});
