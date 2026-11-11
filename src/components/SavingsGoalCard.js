// 🎯 나의 저축 목표 — 「나의 자산」 카드(2026-11-11). 목표를 정하면 통장·예금·적금에 모은 돈으로 진행률을 보여 준다.
//    돈은 움직이지 않는다. 자기 문서의 표시용 필드 하나만 쓴다(firebase/db/ledger.js saveSavingsGoal).
import React, { useEffect, useState } from "react";
import { saveSavingsGoal } from "../firebase/db/ledger";
import { validateGoal, readGoal, goalProgress, GOAL_NAME_MAX } from "../utils/savingsGoal";
import { formatKoreanCurrency } from "../utils/numberFormatter";
import { toast } from "../utils/toast";
import { logger } from "../utils/logger";

export default function SavingsGoalCard({ userId, rawGoal, saved }) {
  const [goal, setGoal] = useState(() => readGoal(rawGoal));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  // 다른 기기에서 바꾼 목표가 문서로 들어오면 따라간다(고치는 중에는 덮지 않는다).
  useEffect(() => { if (!editing) setGoal(readGoal(rawGoal)); }, [rawGoal, editing]);

  const p = goalProgress(goal, saved);

  const startEdit = () => {
    setName(goal?.name || "");
    setAmount(goal ? String(goal.amount) : "");
    setEditing(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = validateGoal(name, amount);
    if (!v.ok) { toast.error(v.error); return; }
    setBusy(true);
    try {
      await saveSavingsGoal(userId, v.goal);
      setGoal(v.goal);
      setEditing(false);
      toast.success("목표를 정했어요. 통장에 모으면 여기가 차올라요!");
    } catch (err) {
      logger.error("[저축 목표] 저장 실패", err);
      toast.error("목표를 저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveSavingsGoal(userId, null);
      setGoal(null);
      setEditing(false);
    } catch (err) {
      logger.error("[저축 목표] 지우기 실패", err);
      toast.error("목표를 지우지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[15px] font-bold text-slate-800">🎯 나의 저축 목표</h4>
        {!editing && (
          <button type="button" onClick={startEdit} className="text-xs font-bold text-indigo-700 underline underline-offset-2">
            {goal ? "바꾸기" : "목표 정하기"}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            무엇을 위해 모을까요?
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={GOAL_NAME_MAX}
              placeholder="예: 자리 사기, 급식 우선권 10장"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            얼마를 모을까요?
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="예: 5000000"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "저장 중…" : "정하기"}
            </button>
            {goal && (
              <button type="button" disabled={busy} onClick={clear} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                목표 지우기
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              닫기
            </button>
          </div>
        </form>
      ) : goal && p ? (
        <div>
          <div className="flex justify-between text-sm font-semibold text-slate-800">
            <span className="truncate mr-2">{goal.name}</span>
            <span className="shrink-0">{p.percent}%</span>
          </div>
          <div
            className="mt-1.5 h-3 rounded-full bg-white border border-indigo-200 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={p.percent}
            aria-label={`${goal.name} 진행률`}
          >
            <div style={{ width: `${p.percent}%`, height: "100%", background: p.done ? "#059669" : "#6366f1", transition: "width .4s" }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-700">
            {p.done
              ? `🎉 목표를 이뤘어요! 통장에 ${formatKoreanCurrency(p.saved)}이 모였어요.`
              : `통장에 ${formatKoreanCurrency(p.saved)} 모았어요 · ${formatKoreanCurrency(p.left)} 남았어요`}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-700">
          갖고 싶은 것을 정하고 통장(파킹통장·예금·적금)에 모아 보세요. 얼마나 모았는지 여기서 보여 줘요.
        </p>
      )}
    </div>
  );
}
