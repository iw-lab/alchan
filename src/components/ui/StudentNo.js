import React from "react";
import { studentNumberOf } from "../../utils/studentOrder";

// 학생 목록 맨 앞의 큰 학번 — 2026-10-15 사용자 「학번 맨앞에 최대한 크게」.
// 전역 .user-item 규칙(!important)이 글꼴을 덮어쓰는 화면이 있어 크기는 인라인으로 준다.
const SIZES = { xl: "2.1rem", lg: "1.7rem", md: "1.3rem" };

export default function StudentNo({ member, size = "lg", style }) {
  const n = studentNumberOf(member);
  return (
    <span
      className="student-no"
      aria-label={n === null ? "번호 없음" : `${n}번`}
      style={{
        flex: "0 0 auto",
        minWidth: "1.5em",
        textAlign: "center",
        fontSize: SIZES[size] || SIZES.lg,
        fontWeight: 900,
        lineHeight: 1,
        letterSpacing: "-0.04em",
        fontVariantNumeric: "tabular-nums",
        color: n === null ? "#cbd5e1" : "#3730a3",
        ...style,
      }}
    >
      {n === null ? "–" : n}
    </span>
  );
}
