// src/pages/admin/JobApprovalsPage.js
// 직업 승인 — 학생이 신청한 직업을 선생님이 허가/거절하는 화면(교사 전용).
// 전에는 «할일 승인» 안의 탭이었다. 성격이 달라(할일 = 보상 지급, 직업 = 주급이 바뀜)
// 2026-11-14 메뉴를 나눴다. 목록·처리 로직은 JobApplicationsPanel 그대로다.
import React from "react";
import { Link } from "react-router-dom";
import JobApplicationsPanel from "./JobApplicationsPanel";

const STEPS = [
  ["1", "학생이 신청", "«오늘의 할일 → 직업 추가/선택»에서 하고 싶은 직업을 고릅니다."],
  ["2", "청문회(교실에서)", "대통령·국무총리·판사 같은 자리는 앞에 나와 포부를 말하고 질문을 받습니다."],
  ["3", "선생님이 허가", "아래 목록에서 허가하면 그 순간 직업이 붙고 다음 주급부터 반영됩니다."],
];

const JobApprovalsPage = () => (
  <div className="max-w-4xl mx-auto p-4 md:p-6">
    <h1 className="text-lg font-bold mb-1 px-1 text-slate-800">직업 승인</h1>
    <p className="mb-4 px-1 text-sm text-slate-500">
      대통령부터 아르바이트까지 <b>모든 직업</b>은 학생이 신청하고 선생님이 허가합니다.
      그만두는 것은 학생이 언제든 스스로 할 수 있어요.
    </p>

    <ol className="mb-5 grid gap-2 md:grid-cols-3 list-none p-0">
      {STEPS.map(([n, title, desc]) => (
        <li key={n} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              {n}
            </span>
            <b className="text-sm text-slate-800">{title}</b>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{desc}</p>
        </li>
      ))}
    </ol>

    <JobApplicationsPanel />

    <p className="mt-6 px-1 text-xs text-slate-400">
      직업 목록·할일·설명을 바꾸려면{" "}
      <Link to="/admin/job-settings" className="font-semibold text-indigo-600">
        관리자 설정 → 직업/할일
      </Link>
      , 전체 흐름은{" "}
      <Link to="/admin/guide" className="font-semibold text-indigo-600">
        시작 가이드
      </Link>
      를 보세요.
    </p>
  </div>
);

export default JobApprovalsPage;
