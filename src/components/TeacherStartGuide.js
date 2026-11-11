// 🧭 시작 도우미 — 교사 대시보드 점검표(2026-11-11). 새 학급은 «무엇부터»를, 쓰던 학급은 새 기능을 알려 준다.
//    읽기 0: 학생 수·직업 수는 대시보드가 이미 가진 값, 나머지는 이 기기의 표시(utils/todayTip.js).
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { guideSteps, readGuideFlags, markGuideFlag } from "../utils/todayTip";

export default function TeacherStartGuide({ classCode, studentCount, jobCount }) {
  const [flags, setFlags] = useState(() => readGuideFlags(classCode));
  if (!classCode || flags.closed) return null;
  const steps = guideSteps({ studentCount, jobCount, flags });
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  return (
    <section className="glass-card rounded-2xl p-3 mb-2 border border-indigo-200" aria-label="시작 도우미">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-800">🧭 시작 도우미 <span className="text-xs font-semibold text-slate-600">남은 것 {left}개</span></h3>
        <button type="button" onClick={() => setFlags(markGuideFlag(classCode, "closed"))} className="text-xs font-semibold text-slate-600 underline underline-offset-2">
          그만 보기
        </button>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link
              to={s.to}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${s.done ? "border-emerald-200 bg-emerald-50 text-slate-600" : "border-slate-200 bg-white text-slate-800"}`}
            >
              <span aria-hidden="true" className="w-5 text-center font-bold">{s.done ? "✓" : i + 1}</span>
              <span className="flex-1">
                <span className={`font-semibold ${s.done ? "line-through" : ""}`}>{s.label}</span>
                <span className="block text-xs text-slate-600">{s.hint}</span>
              </span>
              {s.done && <span className="sr-only">완료</span>}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
