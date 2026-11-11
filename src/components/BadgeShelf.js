// 🏅 내 배지 — 「나의 자산」 카드. 지금 가진 것으로 계산한다(저장 없음 · 읽기 0).
import React, { useMemo, useState } from "react";
import { evaluateAchievements } from "../utils/achievementSystem";

export default function BadgeShelf({ stats }) {
  const [open, setOpen] = useState(false);
  const { earned, locked } = useMemo(() => evaluateAchievements(stats), [stats]);
  const next = locked.slice(0, open ? locked.length : 3);
  return (
    <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[15px] font-bold text-slate-800">🏅 내 배지 <span className="text-xs font-semibold text-slate-600">{earned.length}개</span></h4>
        {locked.length > 3 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-bold text-amber-800 underline underline-offset-2">
            {open ? "접기" : "다음 배지 모두 보기"}
          </button>
        )}
      </div>
      {earned.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 mb-3">
          {earned.map((a) => (
            <li key={a.id} title={a.description} className="flex items-center gap-1 rounded-full bg-white border border-amber-300 px-2.5 py-1 text-xs font-semibold text-slate-800">
              <span aria-hidden="true">{a.icon}</span>{a.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-700 mb-3">아직 배지가 없어요. 아래에서 하나 골라 도전해 보세요.</p>
      )}
      {next.length > 0 && (
        <ul className="space-y-1">
          {next.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs text-slate-700">
              <span aria-hidden="true" className="grayscale opacity-60">{a.icon}</span>
              <span className="font-semibold">{a.name}</span>
              <span className="text-slate-600">— {a.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
