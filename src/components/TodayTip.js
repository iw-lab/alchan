// 💡 오늘의 제안 — 학생 대시보드 한 줄(2026-11-11). 「나의 자산」이 남긴 캐시만 본다(읽기 0).
//    판정 = utils/todayTip.js suggestNext. 하루에 한 번 닫을 수 있다.
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCachedFirestoreData } from "../utils/firestoreHelpers";
import { suggestNext } from "../utils/todayTip";
import { readGoal } from "../utils/savingsGoal";

const DAY = 86400 * 1000;
const todayKey = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default function TodayTip({ userId, userDoc }) {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem("alchan_tip_hidden") === todayKey(); } catch { return false; }
  });
  const tip = useMemo(() => {
    if (!userId) return null;
    const cached = getCachedFirestoreData("myAssets", userId, 7 * DAY);
    const loans = Array.isArray(cached?.loans) ? cached.loans : [];
    return suggestNext(
      {
        known: !!cached,
        cash: Number(userDoc?.cash) || 0,
        parkingBalance: Number(cached?.parkingBalance) || 0,
        depositCount: (cached?.deposits?.length || 0) + (cached?.savings?.length || 0),
        stockValue: Number(cached?.stockValue) || 0,
        propertyCount: cached?.realEstateAssets?.length || 0,
        loanCount: loans.length,
        goalSet: !!readGoal(userDoc?.savingsGoal),
      },
      Math.floor((Date.now() + 9 * 3600 * 1000) / DAY),
    );
  }, [userId, userDoc?.cash, userDoc?.savingsGoal]);

  if (!tip || hidden) return null;
  const close = () => {
    setHidden(true);
    try { localStorage.setItem("alchan_tip_hidden", todayKey()); } catch { /* 저장소가 막혀도 이번 화면에서는 닫힌다 */ }
  };
  return (
    <div className="glass-card rounded-2xl px-3 py-2.5 mb-2 flex items-center gap-2 border border-amber-200 bg-amber-50/70">
      <span aria-hidden="true">💡</span>
      <p className="flex-1 text-sm text-slate-800"><span className="font-bold">오늘의 제안</span> · {tip.text}</p>
      <Link to={tip.to} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">{tip.label}</Link>
      <button type="button" onClick={close} aria-label="오늘의 제안 닫기" className="shrink-0 px-1.5 text-slate-600 text-lg leading-none">×</button>
    </div>
  );
}
