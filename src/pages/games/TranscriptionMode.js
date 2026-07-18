// src/pages/games/TranscriptionMode.js
// 필사(따라쓰기) 연습 모드 — 저작권 없는 좋은 글을 그대로 따라 입력.
// 현금/쿠폰 보상 없음(순수 연습). 정확도·타수·시간 통계만 제공.
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { doc, runTransaction, arrayUnion, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { logger } from "../../utils/logger";
import {
  TRANSCRIPTION_CATEGORIES,
  TRANSCRIPTION_TEXTS,
  getTranscriptionTexts,
} from "../../data/transcriptionTexts";
import "./TranscriptionMode.css";

// 🏅 명예 배지 (누적 도장 수로 달성)
const BADGES = [
  { n: 5, e: "🌱", t: "필사 새싹" },
  { n: 20, e: "🥉", t: "필사 도전자" },
  { n: 50, e: "🥈", t: "필사 달인" },
  { n: 100, e: "🥇", t: "필사 명필" },
  { n: 150, e: "🏆", t: "필사 마스터" },
  { n: TRANSCRIPTION_TEXTS.length, e: "👑", t: "필사 완전정복" },
];
const badgeFor = (count) => {
  let b = null;
  for (const x of BADGES) if (count >= x.n) b = x;
  return b;
};
const nextBadge = (count) => BADGES.find((x) => count < x.n) || null;
// before→after 로 늘면서 새로 달성한 배지 (없으면 null)
const nextBadgeCrossed = (before, after) => {
  const a = badgeFor(before);
  const b = badgeFor(after);
  if (b && (!a || a.n !== b.n)) return b;
  return null;
};

// 💰 쿠폰 보상 정책 (금융 안전: 글당 최초 1회만 + 일일 상한 + 정확도 조건)
const STAMP_MIN_ACC = 85; // 도장 획득 최소 정확도
const COUPON_MIN_ACC = 90; // 쿠폰 지급 최소 정확도
const COUPON_PER = 1; // 글당 쿠폰
// 🔒 batch7-b: 하루 쿠폰 상한(10)은 이제 서버 grantGameReward(transcription dailyLimit)가 강제 — 클라 상수 제거.

const TranscriptionMode = ({ onBack }) => {
  const { user, userDoc, updateUser } = useAuth();
  const [view, setView] = useState("list"); // list | typing | result
  const [category, setCategory] = useState("proverb");
  const [passage, setPassage] = useState(null);
  const [input, setInput] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const tickRef = useRef(null);

  const list = useMemo(() => getTranscriptionTexts(category), [category]);

  // 완료한 글(도장) 집합
  const doneSet = useMemo(
    () => new Set(Array.isArray(userDoc?.transcriptionDone) ? userDoc.transcriptionDone : []),
    [userDoc],
  );
  const stampCount = doneSet.size;
  const myBadge = badgeFor(stampCount);

  // 🔒 글당 최초 1회만 도장+쿠폰 지급 (runTransaction = idempotent, 일일 상한, 거래로그)
  const claimReward = useCallback(
    async (passageId, acc) => {
      const outcome = { stamp: false, coupon: 0, prevCount: stampCount };
      if (!user?.uid || acc < STAMP_MIN_ACC) return outcome;
      const userRef = doc(db, "users", user.uid);
      try {
        // 🔒 batch7-b: 쿠폰은 grantGameReward CF로 이관(coupons rules 잠금). 도장(transcriptionDone)은 클라 유지.
        // ⚠️ 순서=쿠폰 먼저→도장 나중. 멱등키(글+유저)라 재시도해도 이중지급 없고, 일시 오류 시 도장을 안 찍어
        //    재도전이 가능하다(구 도장-먼저 순서는 CF 일시실패 시 도장이 남아 정당한 쿠폰이 영구 손실됐다 — codex/Gemini 지적).
        // 1) 쿠폰 지급(정확도 충족 시). 결과에 따라 도장 여부 결정.
        if (acc >= COUPON_MIN_ACC) {
          try {
            await httpsCallable(functions, "grantGameReward")({
              gameType: "transcription",
              rewardType: "coupon",
              amount: COUPON_PER,
              idempotencyKey: `transcription_${passageId}_${user.uid}`,
            });
            outcome.coupon = COUPON_PER;
          } catch (rewardErr) {
            const code = rewardErr?.code || "";
            if (code === "functions/resource-exhausted") {
              // 오늘 일일한도 도달 — 쿠폰 없이 도장만(정상 흐름).
            } else if (code === "functions/already-exists") {
              // 이 글로 이미 보상받음(도장 실패 후 재시도 등) — 도장으로 진행, 쿠폰 재표시 안 함.
            } else {
              // 일시 오류(네트워크 등) — 도장을 찍지 말고 중단해 재도전 가능하게(멱등키로 이중지급 없음).
              logger.error("[필사] 쿠폰 지급 일시 실패, 도장 보류:", rewardErr);
              return outcome;
            }
          }
        }

        // 2) 도장(transcriptionDone) — 쿠폰 해결 후. 글당 최초 1회(파밍 차단).
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(userRef);
          if (!snap.exists()) throw new Error("user doc 없음");
          const data = snap.data();
          const done = Array.isArray(data.transcriptionDone) ? data.transcriptionDone : [];
          if (done.includes(passageId)) return; // 이미 도장 → no-op

          tx.update(userRef, {
            transcriptionDone: arrayUnion(passageId),
            updatedAt: serverTimestamp(),
          });
          outcome.stamp = true;
        });

        // 로컬 컨텍스트 갱신 (표시용, 도장만 — 쿠폰은 onSnapshot이 서버값 반영).
        if (outcome.stamp && typeof updateUser === "function") {
          const newDone = [...(userDoc?.transcriptionDone || []), passageId];
          await updateUser({ transcriptionDone: newDone });
        }
      } catch (e) {
        logger.error("[필사] 보상 처리 오류:", e);
      }
      return outcome;
    },
    [user, userDoc, updateUser, stampCount],
  );

  // 진행 중 경과 시간 타이머
  useEffect(() => {
    if (view === "typing" && startTime) {
      tickRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    }
    return () => clearInterval(tickRef.current);
  }, [view, startTime]);

  useEffect(() => {
    if (view === "typing" && inputRef.current) inputRef.current.focus();
  }, [view]);

  const target = passage?.text || "";
  const targetChars = useMemo(() => Array.from(target), [target]);
  const inputChars = useMemo(() => Array.from(input), [input]);

  // 글자별 정오 + 정확도
  const { correctCount, progress } = useMemo(() => {
    let correct = 0;
    for (let i = 0; i < inputChars.length; i++) {
      if (inputChars[i] === targetChars[i]) correct++;
    }
    return {
      correctCount: correct,
      progress: targetChars.length ? Math.min(100, Math.round((inputChars.length / targetChars.length) * 100)) : 0,
    };
  }, [inputChars, targetChars]);

  const accuracy = inputChars.length ? Math.round((correctCount / inputChars.length) * 100) : 100;

  const startPassage = (p) => {
    setPassage(p);
    setInput("");
    setElapsed(0);
    setResult(null);
    setStartTime(Date.now());
    setView("typing");
  };

  const finishingRef = useRef(false);
  const finish = useCallback(async () => {
    if (finishingRef.current) return; // 중복 완료 방지
    finishingRef.current = true;
    clearInterval(tickRef.current);
    const secs = Math.max(1, Math.floor((Date.now() - (startTime || Date.now())) / 1000));
    const typed = inputChars.length;
    const acc = typed ? Math.round((correctCount / typed) * 100) : 0;
    const cpm = Math.round((typed / secs) * 60); // 분당 타수

    let reward = { stamp: false, coupon: 0, prevCount: stampCount };
    if (passage && !doneSet.has(passage.id)) {
      reward = await claimReward(passage.id, acc);
    }
    const newBadge =
      reward.stamp && nextBadgeCrossed(reward.prevCount, reward.prevCount + 1);

    setResult({ seconds: secs, typed, accuracy: acc, cpm, total: targetChars.length, reward, newBadge });
    setView("result");
    finishingRef.current = false;
  }, [startTime, inputChars.length, correctCount, targetChars.length, passage, doneSet, claimReward, stampCount]);

  // 입력이 글 길이 이상이고 정확하면 자동 완료
  useEffect(() => {
    if (view === "typing" && inputChars.length >= targetChars.length && targetChars.length > 0) {
      // 완전히 일치하면 자동 마무리
      if (input === target) finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const canFinish = inputChars.length >= Math.ceil(targetChars.length * 0.5);

  // ── 목록 화면 ──────────────────────────────
  if (view === "list") {
    return (
      <div className="trans-wrap">
        <div className="trans-header">
          <button className="trans-back" onClick={onBack}>← 메뉴</button>
          <h2>✍️ 필사 연습</h2>
          <span className="trans-sub">좋은 글을 천천히 따라 써 보세요</span>
          <button className="trans-stampbtn" onClick={() => setView("stamps")}>
            🏅 내 도장 {stampCount}/{TRANSCRIPTION_TEXTS.length}
          </button>
        </div>

        <div className="trans-cats">
          {TRANSCRIPTION_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`trans-cat ${category === c.id ? "active" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              <span>{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>

        <div className="trans-list">
          {list.map((p) => (
            <button
              key={p.id}
              className={`trans-item ${doneSet.has(p.id) ? "done" : ""}`}
              onClick={() => startPassage(p)}
            >
              {doneSet.has(p.id) && <span className="trans-item-stamp">🏅</span>}
              <div className="trans-item-title">
                {p.title}
                {p.author && <span className="trans-item-author">· {p.author}</span>}
              </div>
              <div className="trans-item-preview">{p.text.replace(/\n/g, " ")}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 도장 모으기 화면 ──────────────────────────────
  if (view === "stamps") {
    const nb = nextBadge(stampCount);
    return (
      <div className="trans-wrap">
        <div className="trans-header">
          <button className="trans-back" onClick={() => setView("list")}>← 목록</button>
          <h2>🏅 내 도장</h2>
        </div>

        <div className="trans-badge-banner">
          <div className="trans-badge-now">
            <span className="trans-badge-emoji">{myBadge ? myBadge.e : "✍️"}</span>
            <span className="trans-badge-name">{myBadge ? myBadge.t : "아직 배지 없음"}</span>
          </div>
          <div className="trans-badge-count">{stampCount} / {TRANSCRIPTION_TEXTS.length} 도장</div>
          {nb && (
            <div className="trans-badge-next">
              다음 배지 <b>{nb.e} {nb.t}</b> 까지 {nb.n - stampCount}개!
            </div>
          )}
        </div>

        {TRANSCRIPTION_CATEGORIES.map((c) => {
          const items = getTranscriptionTexts(c.id);
          const got = items.filter((p) => doneSet.has(p.id)).length;
          return (
            <div key={c.id} className="trans-stamp-group">
              <div className="trans-stamp-grouphead">
                {c.emoji} {c.name} <span>{got}/{items.length}</span>
              </div>
              <div className="trans-stamp-grid">
                {items.map((p) => (
                  <button
                    key={p.id}
                    className={`trans-stamp-cell ${doneSet.has(p.id) ? "got" : ""}`}
                    title={`${p.title}${p.author ? " · " + p.author : ""}`}
                    onClick={() => startPassage(p)}
                  >
                    {doneSet.has(p.id) ? "🏅" : "·"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── 결과 화면 ──────────────────────────────
  if (view === "result" && result) {
    const grade =
      result.accuracy >= 99 ? { t: "완벽해요!", e: "🏆" } :
      result.accuracy >= 95 ? { t: "훌륭해요!", e: "🌟" } :
      result.accuracy >= 85 ? { t: "잘했어요!", e: "👍" } :
      { t: "조금만 더!", e: "💪" };
    return (
      <div className="trans-wrap">
        <div className="trans-result">
          <div className="trans-result-emoji">{grade.e}</div>
          <h2>{grade.t}</h2>
          <div className="trans-result-title">「{passage.title}」{passage.author ? ` · ${passage.author}` : ""}</div>
          <div className="trans-stats">
            <div className="trans-stat"><span>정확도</span><b>{result.accuracy}%</b></div>
            <div className="trans-stat"><span>걸린 시간</span><b>{result.seconds}초</b></div>
            <div className="trans-stat"><span>분당 타수</span><b>{result.cpm}타</b></div>
            <div className="trans-stat"><span>입력 글자</span><b>{result.typed}자</b></div>
          </div>

          {/* 보상 피드백 */}
          <div className="trans-rewards">
            {result.reward?.stamp && <div className="trans-reward-line stamp">🏅 새 도장 획득!</div>}
            {result.reward?.coupon > 0 && (
              <div className="trans-reward-line coupon">🎟️ 쿠폰 +{result.reward.coupon}개</div>
            )}
            {result.reward?.stamp && result.reward.coupon === 0 && result.accuracy < COUPON_MIN_ACC && (
              <div className="trans-reward-hint">정확도 {COUPON_MIN_ACC}% 이상이면 쿠폰도 받아요!</div>
            )}
            {result.newBadge && (
              <div className="trans-reward-line badge">🎖️ 새 배지: {result.newBadge.e} {result.newBadge.t}</div>
            )}
            {!result.reward?.stamp && result.accuracy < STAMP_MIN_ACC && (
              <div className="trans-reward-hint">정확도 {STAMP_MIN_ACC}% 이상이면 도장을 받아요. 다시 도전!</div>
            )}
            {!result.reward?.stamp && result.accuracy >= STAMP_MIN_ACC && (
              <div className="trans-reward-hint">이미 도장을 받은 글이에요 🏅</div>
            )}
          </div>

          <div className="trans-result-btns">
            <button className="trans-btn primary" onClick={() => startPassage(passage)}>다시 쓰기</button>
            <button className="trans-btn" onClick={() => setView("list")}>다른 글</button>
            <button className="trans-btn ghost" onClick={onBack}>메뉴로</button>
          </div>
        </div>
      </div>
    );
  }

  // ── 필사 화면 ──────────────────────────────
  return (
    <div className="trans-wrap">
      <div className="trans-typing-header">
        <button className="trans-back" onClick={() => setView("list")}>← 목록</button>
        <div className="trans-typing-title">
          「{passage.title}」{passage.author && <span> · {passage.author}</span>}
        </div>
        <div className="trans-live">
          <span>⏱ {elapsed}초</span>
          <span>✅ {accuracy}%</span>
          <span>📊 {progress}%</span>
        </div>
      </div>

      <div className="trans-progress-bar">
        <div className="trans-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* 글자별 정오 표시 */}
      <div className="trans-target">
        {targetChars.map((ch, i) => {
          let cls = "pending";
          if (i < inputChars.length) cls = inputChars[i] === ch ? "ok" : "bad";
          else if (i === inputChars.length) cls = "cursor";
          if (ch === "\n") return <br key={i} />;
          return (
            <span key={i} className={`trans-ch ${cls}`}>
              {ch === " " && cls === "bad" ? "␣" : ch}
            </span>
          );
        })}
      </div>

      <textarea
        ref={inputRef}
        className="trans-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="여기에 위 글을 그대로 따라 써 보세요..."
        spellCheck={false}
        rows={targetChars.length > 120 ? 9 : 4}
      />

      <div className="trans-typing-btns">
        <button className="trans-btn primary" onClick={finish} disabled={!canFinish}>
          완료하기
        </button>
        <button className="trans-btn ghost" onClick={() => startPassage(passage)}>처음부터</button>
      </div>
    </div>
  );
};

export default TranscriptionMode;
