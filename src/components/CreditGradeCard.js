// 💳 나의 신용등급(연습용) — 「나의 자산」 카드. 보여 주기만 한다(돈에 영향 없음). 계산 = utils/creditGrade.js.
import React, { useMemo } from "react";
import { creditGrade } from "../utils/creditGrade";

const COLOR = { 1: "#059669", 2: "#0284c7", 3: "#7c3aed", 4: "#d97706", 5: "#dc2626" };

export default function CreditGradeCard({ stats }) {
  const r = useMemo(() => creditGrade(stats), [stats]);
  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-14 h-14 shrink-0 rounded-2xl flex flex-col items-center justify-center text-white"
          style={{ background: COLOR[r.grade] }}
          role="img"
          aria-label={`신용등급 ${r.grade}등급`}
        >
          <span className="text-xl font-extrabold leading-none">{r.grade}</span>
          <span className="text-[10px] font-semibold">등급</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-[15px] font-bold text-slate-800">💳 나의 신용등급 <span className="text-[11px] font-semibold text-slate-600">연습용 · 1등급이 가장 좋아요</span></h4>
          <p className="text-xs text-slate-700 mt-0.5">👉 {r.next}</p>
        </div>
      </div>
      {(r.good.length > 0 || r.bad.length > 0) && (
        <ul className="mt-2.5 space-y-0.5 text-xs">
          {r.good.map((t) => <li key={t} className="text-emerald-800">＋ {t}</li>)}
          {r.bad.map((t) => <li key={t} className="text-rose-800">－ {t}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-600">
        신용은 «약속대로 갚을 사람인가»를 숫자로 본 거예요. 지금은 연습이라 등급이 달라져도 돈이 바뀌지는 않아요.
      </p>
    </div>
  );
}
