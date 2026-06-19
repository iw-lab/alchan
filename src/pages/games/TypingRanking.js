// src/pages/games/TypingRanking.js
// 🏆 타자 게임 모드 — 오늘의 학급 랭킹 (명예 only, 현금 미연동)
// 같은 학급 학생들의 "오늘" 최고 점수를 내림차순으로 보여준다.

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { getClassmates } from "../../firebase";
import { logger } from "../../utils/logger";
import "./TypingPracticeGame.css";

const medalFor = (rank) => {
  if (rank === 0) return "🥇";
  if (rank === 1) return "🥈";
  if (rank === 2) return "🥉";
  return null;
};

const TypingRanking = ({ onBack }) => {
  const { user, userDoc } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  // 본인 오늘 기록(서버 값) — 교사/관리자라 랭킹 목록엔 안 보여도 저장 여부를 검증할 수 있게 항상 표시
  const [myBest, setMyBest] = useState(null);
  const [iAmExcluded, setIAmExcluded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const classCode = userDoc?.classCode;
      if (!classCode || classCode === "미지정") {
        setRows([]);
        setMyBest(null);
        setLoading(false);
        return;
      }
      // 🔥 [읽기최적화] forceRefresh=true 제거 → 증분 동기화(updatedAt>lastSync, 변경분만 read).
      //   캐시 우회 전체 25명 재읽기 방지. 새 점수는 증분 쿼리가 그대로 가져옴.
      const members = await getClassmates(classCode, false, "typingRanking");
      const today = new Date().toDateString();

      // 본인 기록(서버 라운드트립 결과)에서 직접 추출 → 그만하기 기록 저장 검증
      const me = members.find((m) => (m.uid || m.id) === user?.uid);
      const myTodayScore =
        me && me.typingArcadeBestDay === today ? me.typingArcadeBestScore || 0 : 0;
      setMyBest(myTodayScore > 0 ? myTodayScore : null);
      setIAmExcluded(!!(me && (me.isTeacher || me.isAdmin)));

      const ranked = members
        .filter(
          (m) =>
            m.typingArcadeBestDay === today &&
            (m.typingArcadeBestScore || 0) > 0 &&
            !m.isTeacher &&
            !m.isAdmin
        )
        .map((m) => ({
          uid: m.uid || m.id,
          name: m.name || m.nickname || "익명",
          score: m.typingArcadeBestScore || 0,
        }))
        .sort((a, b) => b.score - a.score);
      setRows(ranked);
    } catch (e) {
      logger.error("[TypingRanking] 랭킹 로드 오류:", e);
      setError("랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
    // 🔥 [읽기최적화] deps를 primitive로 — userDoc 객체는 cash 변동(onSnapshot)마다
    //   identity가 바뀌어 load 재생성→effect 재실행→전체 재읽기를 유발했음. 실제 사용값만 의존.
  }, [userDoc?.classCode, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const myRank = rows.findIndex((r) => r.uid === user?.uid);
  const todayLabel = (() => {
    try {
      return new Date().toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      });
    } catch {
      return "오늘";
    }
  })();

  return (
    <div className="typing-ranking minigame">
      <div className="game-header minigame-header">
        <div>
          <h2>🏆 오늘의 학급 랭킹</h2>
          <p className="subtitle">{todayLabel} · 떨어지는 단어 최고점</p>
        </div>
        <div className="game-header-buttons">
          <button className="menu-btn-small" onClick={load} disabled={loading}>
            ↻ 새로고침
          </button>
          {onBack && (
            <button className="back-button" onClick={onBack}>
              ← 뒤로
            </button>
          )}
        </div>
      </div>

      {myRank >= 0 ? (
        <div className="my-rank-banner">
          <span>내 등수</span>
          <strong>{myRank + 1}위</strong>
          <span>{rows[myRank].score.toLocaleString()}점</span>
        </div>
      ) : (
        myBest != null && (
          <div className="my-rank-banner">
            <span>내 오늘 최고점</span>
            <strong>{myBest.toLocaleString()}점</strong>
            <span>{iAmExcluded ? "교사·관리자는 경쟁 제외" : "기록 저장됨 ✓"}</span>
          </div>
        )
      )}

      {loading ? (
        <div className="ranking-loading">
          <div className="loading-spinner" />
          <p>랭킹을 불러오는 중...</p>
        </div>
      ) : error ? (
        <div className="ranking-empty">
          <p>{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="ranking-empty">
          <p>아직 오늘 기록이 없어요!</p>
          <p className="sub">게임 모드에 도전해서 첫 번째 기록을 세워보세요 🎮</p>
        </div>
      ) : (
        <div className="ranking-list">
          {rows.map((r, i) => {
            const medal = medalFor(i);
            const isMe = r.uid === user?.uid;
            return (
              <div
                key={r.uid}
                className={`ranking-row ${i < 3 ? "top3" : ""} ${
                  isMe ? "is-me" : ""
                }`}
              >
                <div className="rank-pos">
                  {medal || <span className="rank-num">{i + 1}</span>}
                </div>
                <div className="rank-name">
                  {r.name}
                  {isMe && <span className="me-tag">나</span>}
                </div>
                <div className="rank-score">{r.score.toLocaleString()}점</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TypingRanking;
