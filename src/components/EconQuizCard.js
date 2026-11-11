// 🧠 오늘의 경제 퀴즈 — 학생 대시보드(2026-11-11). 하루 한 문제, 풀면 바로 해설.
//    돈은 걸리지 않는다(배지·연속 기록만). 문항은 눌렀을 때만 받아 온다(대시보드 번들에 안 싣는다).
//    판정 = utils/econQuiz.js · 문항 = data/econQuiz.json(시험이 검사를 강제) · 기록 = users/{uid}.econQuiz
import React, { useEffect, useState } from "react";
import { saveQuizStats } from "../firebase/db/ledger";
import { pickQuestion, nextStats, readStats, dayKeyKST, TOPICS } from "../utils/econQuiz";
import { logger } from "../utils/logger";

export default function EconQuizCard({ userId, rawStats }) {
  const today = dayKeyKST();
  const [stats, setStats] = useState(() => readStats(rawStats));
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(null);
  const [picked, setPicked] = useState(null); // 고른 보기 위치
  const [loadFailed, setLoadFailed] = useState(false);

  // 날이 바뀌면(화면을 켜 둔 채 다음 날) 어제의 문제·고른 답을 비운다 — 안 그러면 오늘 문제를 못 푼다.
  useEffect(() => { setPicked(null); setQuestion(null); setOpen(false); setLoadFailed(false); }, [today]);

  // 다른 기기에서 풀었으면 따라간다(지금 푸는 중에는 덮지 않는다).
  useEffect(() => { if (picked === null) setStats(readStats(rawStats)); }, [rawStats, picked]);

  useEffect(() => {
    if (!open || question || !userId) return undefined;
    let alive = true;
    import("../data/econQuiz.json")
      .then((m) => {
        if (!alive) return;
        const q = pickQuestion(m.default || m, userId, today);
        if (q) setQuestion(q);
        else setLoadFailed(true); // 은행이 비었거나 깨졌다 — «가져오는 중»에 갇히지 않는다
      })
      .catch((e) => { logger.warn("[퀴즈] 문항을 못 받음", e?.message); if (alive) setLoadFailed(true); });
    return () => { alive = false; };
  }, [open, question, userId, today]);

  if (!userId) return null;
  const doneToday = stats.day === today;

  const answer = (i) => {
    if (picked !== null || !question) return;
    setPicked(i);
    const next = nextStats(stats, today, i === question.answerIndex);
    setStats(next);
    // 저장이 안 돼도 화면은 그대로 둔다 — 다음에 열면 한 번 더 풀 수 있을 뿐이다(돈이 걸려 있지 않다).
    saveQuizStats(userId, next).catch((e) => logger.warn("[퀴즈] 기록 저장 실패", e?.code || e?.message));
  };

  const header = (
    <div className="flex items-center gap-2">
      <span aria-hidden="true">🧠</span>
      <p className="flex-1 text-sm text-slate-800">
        <span className="font-bold">오늘의 경제 퀴즈</span>
        {stats.total > 0 && <span className="text-xs text-slate-600"> · 맞힌 문제 {stats.correct}개 · {stats.streak}일째</span>}
      </p>
      {!open && !doneToday && (
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">
          풀어 보기
        </button>
      )}
      {doneToday && picked === null && (
        <span className="shrink-0 text-xs font-semibold text-emerald-800">{stats.lastCorrect ? "오늘 정답! 내일 또 만나요" : "오늘 풀었어요. 내일 또 만나요"}</span>
      )}
    </div>
  );

  return (
    <section className="glass-card rounded-2xl px-3 py-2.5 mb-2 border border-indigo-200" aria-label="오늘의 경제 퀴즈">
      {header}
      {open && loadFailed && <p className="mt-2 text-sm text-rose-700">문제를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
      {open && !loadFailed && !question && <p className="mt-2 text-sm text-slate-600">문제를 가져오고 있어요…</p>}
      {open && question && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-indigo-700">{TOPICS[question.topic]}</p>
          <p className="text-[15px] font-bold text-slate-900 mb-2">{question.q}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {question.choices.map((c, i) => {
              const isAnswer = i === question.answerIndex;
              const tone = picked === null
                ? "border-slate-200 bg-white text-slate-800 hover:bg-indigo-50"
                : isAnswer
                  ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                  : i === picked
                    ? "border-rose-400 bg-rose-50 text-rose-900"
                    : "border-slate-200 bg-white text-slate-600";
              return (
                <button
                  key={c}
                  type="button"
                  disabled={picked !== null}
                  onClick={() => answer(i)}
                  className={`text-left rounded-xl border px-3 py-2.5 text-sm font-semibold ${tone}`}
                >
                  {c}
                  {picked !== null && isAnswer && <span className="ml-1">✓</span>}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900" role="status">
              <span className="font-bold">{picked === question.answerIndex ? "맞았어요! " : "아쉬워요. "}</span>
              {question.explain}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
