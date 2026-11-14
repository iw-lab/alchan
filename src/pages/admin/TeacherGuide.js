// src/pages/admin/TeacherGuide.js
// 시작 가이드 — 알찬을 처음 쓰는 선생님이 «무엇을 어떤 순서로» 하는지 한 화면에서 본다.
// 읽기 전용 안내(쿼리 0건). 문구의 규칙(누가 무엇을 승인하나)은 서버와 맞춰져 있어야 한다:
//   · 모든 직업 = 학생 신청 → 선생님 허가(processJobApplication, 교사 전용)
//   · 할일 승인 = 선생님 또는 국무총리. 국무총리가 올린 것은 대통령(processTaskApproval)
//   · 법안 승인·거부권 = 대통령(firestore.rules)
//   · 재판 = 교실에서 직접 진행, 결과만 앱에 기록
import React from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Briefcase,
  CheckCircle,
  Landmark,
  Scale,
  ShoppingBag,
  Banknote,
  ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: Users,
    title: "학생을 반에 들이기",
    body: "학생은 가입할 때 우리 반 학급 코드를 입력합니다. 들어온 학생은 «학생 목록»에서 확인하고, 처음 줄 돈도 여기서 보낼 수 있어요.",
    links: [["/admin/students", "학생 목록"]],
  },
  {
    icon: Briefcase,
    title: "직업 정하기 — 신청 → 청문회 → 승인",
    body: "새 반에는 대통령·국무총리·판사·국회의원 등 기본 직업 47개가 준비돼 있습니다. 학생이 하고 싶은 직업을 신청하면, 교실에서 인사청문회(포부 발표 + 친구들 질문)를 하고 선생님이 «직업 승인»에서 허가합니다. 대통령을 포함한 모든 직업이 같은 방식이고, 그만두는 것은 학생이 스스로 할 수 있어요.",
    links: [
      ["/admin/job-approvals", "직업 승인"],
      ["/admin/job-settings", "직업·할일 고치기"],
    ],
  },
  {
    icon: CheckCircle,
    title: "할일 승인 — 국무총리에게 맡기기",
    body: "학생이 직업의 할일을 하고 «완료»를 누르면 승인 대기로 쌓입니다. 선생님이 직접 승인해도 되고, 국무총리를 맡은 학생이 대신 승인합니다. 국무총리가 올린 할일은 대통령이 승인하고, 둘 다 비어 있으면 선생님이 승인합니다. 다른 학생에게 맡기고 싶으면 «권한 위임»을 쓰세요.",
    links: [
      ["/admin/approvals", "할일 승인"],
      ["/admin/permissions", "권한 위임"],
    ],
  },
  {
    icon: Landmark,
    title: "법 만들기 — 국회와 대통령",
    body: "국회의원이 법안을 내고 학생들이 투표합니다. 통과한 법안은 대통령에게 넘어가고, 대통령이 승인하거나 돌려보냅니다(거부권). 선생님은 언제든 대신 처리할 수 있어요.",
    links: [
      ["/national-assembly", "국회"],
      ["/organization-chart", "대통령실"],
    ],
  },
  {
    icon: Scale,
    title: "재판 — 교실에서 직접",
    body: "다툼이 생기면 경찰서에 접수하고, 검찰총장이 재판에 넘길지 정합니다. 재판은 판사·검사·변호사가 교실에 모여 말로 진행하고(오프라인), 판결과 합의금만 앱 «법원»에 기록합니다.",
    links: [
      ["/police", "경찰서"],
      ["/court", "법원"],
    ],
  },
  {
    icon: ShoppingBag,
    title: "상점 채우기",
    body: "새 반에는 자리 바꾸기·음악 신청권 같은 기본 아이템 15개가 들어 있습니다. 우리 반에 맞게 가격과 재고를 고치거나 새 아이템을 추가하세요.",
    links: [["/item-shop", "아이템 상점"]],
  },
  {
    icon: Banknote,
    title: "주급·세금은 자동",
    body: "주급은 매주 자동으로 지급되고(직업이 많을수록 많이), 세금도 자동으로 걷힙니다. 금액과 규칙은 «관리자 설정»에서 바꿉니다.",
    links: [["/admin/app-settings", "관리자 설정"]],
  },
];

const ROLES = [
  ["선생님", "직업 승인 · 할일 승인 · 모든 설정"],
  ["대통령", "통과된 법안 승인 / 거부권 · 국무총리의 할일 승인"],
  ["국무총리", "친구들의 할일 승인(대통령 포함)"],
  ["판사", "재판 진행 · 판결(교실에서)"],
  ["국회의원", "법안 발의 · 투표"],
];

const TeacherGuide = () => (
  <div className="max-w-3xl mx-auto p-4 md:p-6">
    <h1 className="text-xl font-bold text-slate-800">시작 가이드</h1>
    <p className="mt-1 mb-5 text-sm text-slate-500">
      알찬은 교실을 작은 나라처럼 운영하는 학급 경제 앱입니다. 아래 순서대로 하면 됩니다.
    </p>

    <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
        누가 무엇을 하나요
      </div>
      <dl className="m-0 divide-y divide-slate-100">
        {ROLES.map(([who, what]) => (
          <div key={who} className="flex gap-3 px-4 py-2 text-sm">
            <dt className="w-20 shrink-0 font-bold text-slate-800">{who}</dt>
            <dd className="m-0 text-slate-600">{what}</dd>
          </div>
        ))}
      </dl>
    </div>

    <ol className="m-0 list-none space-y-3 p-0">
      {STEPS.map(({ icon: Icon, title, body, links }, i) => (
        <li
          key={title}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-bold text-slate-800">
                <span className="mr-1.5 text-indigo-500">{i + 1}.</span>
                {title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {links.map(([to, label]) => (
                  <Link
                    key={to}
                    to={to}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 no-underline hover:bg-indigo-50"
                  >
                    {label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

export default TeacherGuide;
