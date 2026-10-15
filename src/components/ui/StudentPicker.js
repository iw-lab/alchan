import React from "react";
import StudentNo from "./StudentNo";
import { sortByStudentNumber, plainStudentName } from "../../utils/studentOrder";

// 받는 사람 고르기(학생 송금·쿠폰 선물) — 드롭다운 대신 학번 순 칸.
// 2026-10-15 사용자 「학번 맨앞에 최대한 크게」: <option> 은 글자를 못 키워서 칸으로 바꿨다.
// 받는 사람 검증은 각 처리기(handleTransferMoney·handleGiftCoupon)가 한다 — 여기는 고르기만.
export default function StudentPicker({ members, value, onChange, excludeId, emptyText }) {
  const list = sortByStudentNumber((members || []).filter((m) => m && m.id && m.id !== excludeId));
  if (list.length === 0) {
    return <p className="text-sm text-slate-500 m-0">{emptyText || "고를 수 있는 친구가 없습니다."}</p>;
  }
  return (
    <div
      role="radiogroup"
      aria-label="받는 사람"
      className="grid gap-2 overflow-y-auto pr-1"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", maxHeight: "40vh" }}
    >
      {list.map((m) => {
        const on = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-student-id={m.id}
            onClick={() => onChange(m.id)}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition"
            style={{
              border: on ? "2px solid #6366f1" : "1px solid #e2e8f0",
              background: on ? "#eef2ff" : "#ffffff",
              cursor: "pointer",
            }}
          >
            <StudentNo member={m} size="xl" />
            <span className="text-sm font-semibold text-slate-800 leading-tight" style={{ minWidth: 0, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
              {plainStudentName(m)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
