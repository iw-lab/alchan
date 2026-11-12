// 🧠 오늘의 경제 퀴즈 — 학생 대시보드. 하루 한 문제, 풀면 바로 해설.
//    2026-11-13 정답 상금(국고에서, 학급 설정 · 기본 1만 원). 판정·상금·기록은 서버(claimQuizReward)가 한다 —
//    화면은 고른 보기만 보낸다. 문항은 눌렀을 때만 받아 온다(대시보드 번들에 안 싣는다).
import React, { useEffect, useState } from "react";
import { claimQuizReward, fetchFinanceSwitches } from "../firebase/db/finance";
import { formatKoreanCurrency } from "../utils/numberFormatter";
import { pickQuestion, nextStats, readStats, dayKeyKST, TOPICS } from "../utils/econQuiz";
import { logger } from "../utils/logger";

export default function EconQuizCard({ userId, rawStats, classCode, onReward }) {
  const today = dayKeyKST();
  const [stats, setStats] = useState(() => readStats(rawStats));
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(null);
  const [picked, setPicked] = useState(null); // 고른 보기 위치
  const [loadFailed, setLoadFailed] = useState(false);
  const [result, setResult] = useState(null); // {state:"saving"|"done"|"failed"|"already", reward}
  const [prize, setPrize] = useState(null); // 학급 상금(원) — 미리 알려 주기용
  useEffect(() => {
    let alive = true;
    if (!classCode) return undefined;
    fetchFinanceSwitches(classCode).then((sw) => { if (alive) setPrize(sw.quizReward); }).catch(() => {});
    return () => { alive = false; };
  }, [classCode]);

  // 날이 바뀌면(화면을 켜 둔 채 다음 날) 어제의 문제·고른 답을 비운다 — 안 그러면 오늘 문제를 못 푼다.
  useEffect(() => { setPicked(null); setQuestion(null); setOpen(false); setLoadFailed(false); setResult(null); }, [today]);

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

  const answer = async (i) => {
    if (picked !== null || !question) return;
    setPicked(i);
    setResult({ state: "saving" });
    try {
      const r = await claimQuizReward(today, question.id, question.choices[i]);
      if (r?.stats) setStats(readStats(r.stats));
      setResult({ state: "done", reward: Number(r?.reward) || 0 });
      if (r?.reward > 0 && onReward) onReward();
    } catch (e) {
      if (e?.code === "functions/already-exists") {
        setStats(nextStats(stats, today, false)); // 다른 기기에서 이미 풀었다
        setResult({ state: "already" });
      } else {
        logger.warn("[퀴즈] 답을 기록하지 못함", e?.code || e?.message);
        setResult({ state: "failed" });
      }
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <span aria-hidden="true">🧠</span>
      <p className="flex-1 text-sm text-slate-800">
        <span className="font-bold">오늘의 경제 퀴즈</span>
        {prize > 0 && !doneToday && <span className="text-xs text-indigo-700"> · 맞히면 {formatKoreanCurrency(prize)}</span>}
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
              <p className="mt-1.5 text-xs font-semibold" data-testid="quiz-result">
                {result?.state === "saving" && "기록하는 중…"}
                {result?.state === "done" && (result.reward > 0 ? `🎉 상금 ${formatKoreanCurrency(result.reward)}이 들어왔어요!` : "오늘 기록을 남겼어요.")}
                {result?.state === "already" && "오늘 퀴즈는 이미 풀었어요. 내일 또 만나요!"}
                {result?.state === "failed" && "기록하지 못했어요. 상금은 안 들어왔어요 — 잠시 뒤 다시 열어 풀 수 있어요."}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
