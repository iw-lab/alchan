// 💳 나의 신용등급 — 「나의 자산」 카드. 등급에 따라 대출 금리·한도가 달라진다(판정은 서버 functions/creditMath.js,
//    여기는 같은 규칙으로 미리 보여 줄 뿐이다 — utils/creditGrade.js).
import React, { useMemo } from "react";
import { creditGrade, loanTerms } from "../utils/creditGrade";

const COLOR = { 1: "#059669", 2: "#0284c7", 3: "#7c3aed", 4: "#d97706", 5: "#dc2626" };

const pct = (m) => (m === 1 ? "그대로" : m < 1 ? `${Math.round((1 - m) * 100)}% 깎아 줘요` : `${Math.round((m - 1) * 100)}% 더 내요`);

export default function CreditGradeCard({ stats, linkOn = true }) {
  const r = useMemo(() => creditGrade(stats), [stats]);
  const t = loanTerms(r.grade, 1, 1);
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
          <h4 className="text-[15px] font-bold text-slate-800">💳 나의 신용등급 <span className="text-[11px] font-semibold text-slate-600">1등급이 가장 좋아요</span></h4>
          <p className="text-xs text-slate-700 mt-0.5">👉 {r.next}</p>
        </div>
      </div>
      {(r.good.length > 0 || r.bad.length > 0) && (
        <ul className="mt-2.5 space-y-0.5 text-xs">
          {r.good.map((t) => <li key={t} className="text-emerald-800">＋ {t}</li>)}
          {r.bad.map((t) => <li key={t} className="text-rose-800">－ {t}</li>)}
        </ul>
      )}
      {linkOn ? (
        <p className="mt-2 text-xs text-slate-800 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5" data-testid="credit-loan-terms">
          🏦 지금 대출을 받으면 — 이자는 <strong>{pct(t.rateMult)}</strong>, 빌릴 수 있는 돈은 <strong>가진 현금의 {t.limitMult}배</strong>까지
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-slate-600">
        신용은 «약속대로 갚을 사람인가»를 숫자로 본 거예요. {linkOn ? "등급이 좋을수록 대출 이자가 싸지고 더 많이 빌릴 수 있어요." : "우리 반은 지금 등급과 대출 조건을 연결하지 않아요."}
      </p>
    </div>
  );
}
