// src/pages/games/FallingWordsGame.js
// 🎮 떨어지는 단어 게임 모드 ("워드 레인")
// 단어가 위에서 떨어지고 바닥에 닿기 전에 정확히 입력해 터뜨린다.
// 생명 3개, 콤보 배율, 레벨업으로 속도/생성 간격 상승.
// 보상·일일베스트·랭킹은 부모(TypingPracticeGame)가 onGameOver로 처리한다.

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  arcadeConfig,
  pickFallingWord,
  arcadeWordScore,
} from "../../data/typingWords";
import "./TypingPracticeGame.css";

let WORD_SEQ = 0;

const fallDurationForLevel = (level) =>
  Math.max(
    arcadeConfig.minFallDuration,
    arcadeConfig.startFallDuration - (level - 1) * arcadeConfig.fallSpeedupPerLevel
  );

const spawnIntervalForLevel = (level) =>
  Math.max(
    arcadeConfig.minSpawnInterval,
    arcadeConfig.startSpawnInterval - (level - 1) * arcadeConfig.spawnSpeedupPerLevel
  );

const FallingWordsGame = ({ onGameOver, onQuit, hasBg = false }) => {
  const gameRef = useRef(null);
  const rafRef = useRef(null);
  const inputRef = useRef(null);
  const endedRef = useRef(false);
  const [, setTick] = useState(0);
  const [input, setInput] = useState("");
  const [flash, setFlash] = useState(null); // 'hit' | 'miss' | 'levelup'

  // 게임 상태 단일 ref — 인터벌/이벤트 핸들러 stale closure 회피
  if (gameRef.current === null) {
    gameRef.current = {
      words: [],
      score: 0,
      lives: arcadeConfig.lives,
      level: 1,
      wordsCleared: 0,
      combo: 0,
      maxCombo: 0,
      lastSpawn: 0,
    };
  }

  const endGame = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const g = gameRef.current;
    onGameOver?.({
      score: g.score,
      wordsCleared: g.wordsCleared,
      maxCombo: g.maxCombo,
      level: g.level,
    });
  }, [onGameOver]);

  const handleQuit = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const g = gameRef.current;
    onQuit?.({
      score: g.score,
      wordsCleared: g.wordsCleared,
      maxCombo: g.maxCombo,
      level: g.level,
    });
  }, [onQuit]);

  // 메인 게임 루프 (requestAnimationFrame)
  useEffect(() => {
    const g = gameRef.current;
    g.lastSpawn = performance.now() - spawnIntervalForLevel(1); // 즉시 첫 단어 생성

    const loop = (now) => {
      if (endedRef.current) return;
      const lvl = g.level;

      // 바닥에 닿은 단어 처리 → 생명 감소 + 콤보 리셋
      const survivors = [];
      let missed = false;
      for (const w of g.words) {
        const progress = (now - w.bornAt) / w.fallDuration;
        if (progress >= 1) {
          missed = true;
          g.lives -= 1;
          g.combo = 0;
        } else {
          survivors.push(w);
        }
      }
      g.words = survivors;
      if (missed) setFlash("miss");

      if (g.lives <= 0) {
        setTick((t) => t + 1);
        endGame();
        return;
      }

      // 단어 생성
      if (
        now - g.lastSpawn >= spawnIntervalForLevel(lvl) &&
        g.words.length < arcadeConfig.maxConcurrent
      ) {
        g.words.push({
          id: ++WORD_SEQ,
          text: pickFallingWord(lvl),
          x: 6 + Math.random() * 70, // 6% ~ 76% (오른쪽 점수판 회피)
          bornAt: now,
          fallDuration: fallDurationForLevel(lvl) * (0.85 + Math.random() * 0.3),
        });
        g.lastSpawn = now;
      }

      setTick((t) => t + 1);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    inputRef.current?.focus();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 피드백 플래시 자동 해제
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 380);
    return () => clearTimeout(t);
  }, [flash]);

  const handleChange = (e) => {
    const val = e.target.value;
    setInput(val);
    const trimmed = val.trim();
    if (!trimmed || endedRef.current) return;

    const g = gameRef.current;
    const now = performance.now();

    // 정확 일치 단어 중 가장 아래(긴급한) 것 제거
    let target = null;
    let targetProg = -1;
    for (const w of g.words) {
      if (w.text === trimmed) {
        const prog = (now - w.bornAt) / w.fallDuration;
        if (prog > targetProg) {
          target = w;
          targetProg = prog;
        }
      }
    }

    if (target) {
      g.words = g.words.filter((w) => w.id !== target.id);
      g.combo += 1;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.score += arcadeWordScore(target.text, g.combo);
      g.wordsCleared += 1;
      if (g.wordsCleared % arcadeConfig.wordsPerLevel === 0) {
        g.level += 1;
        setFlash("levelup");
      } else {
        setFlash("hit");
      }
      setInput("");
      setTick((t) => t + 1);
    }
  };

  const handleKeyDown = (e) => {
    // Enter는 단어 입력 흐름을 끊지 않도록 무시(자동 매칭이므로 불필요)
    if (e.key === "Enter") e.preventDefault();
  };

  const g = gameRef.current;
  const now = performance.now();
  const prefix = input.trim();
  const livesArr = Array.from({ length: arcadeConfig.lives });

  // 배경 PNG를 그라데이션 위에 얹음 (codex 생성물). 런타임 404 시 CSS 그라데이션 폴백.
  const bgUrl = `${process.env.PUBLIC_URL || ""}/typing-game/bg-arcade.png`;
  const fieldStyle = hasBg
    ? {
        backgroundImage: `url("${bgUrl}"), linear-gradient(180deg, #aee0ff 0%, #d7f0ff 45%, #fef9e7 80%, #c8efb0 100%)`,
        backgroundSize: "cover, cover",
        backgroundPosition: "center top, center",
        backgroundRepeat: "no-repeat, no-repeat",
      }
    : undefined;

  return (
    <div
      className={`falling-game ${hasBg ? "has-bg" : ""} ${
        flash === "miss" ? "flash-miss" : ""
      }`}
    >
      {/* HUD */}
      <div className="falling-hud">
        <div className="hud-left">
          <span className="hud-level">LV.{g.level}</span>
          <span className="hud-lives">
            {livesArr.map((_, i) => (
              <span key={i} className={`life ${i < g.lives ? "on" : "off"}`}>
                {i < g.lives ? "❤️" : "🤍"}
              </span>
            ))}
          </span>
        </div>
        <div className="hud-right">
          {g.combo > 1 && (
            <span className="hud-combo">🔥 {g.combo} COMBO</span>
          )}
          <span className="hud-score">{g.score.toLocaleString()}점</span>
          <button className="falling-quit" onClick={handleQuit}>
            그만하기
          </button>
        </div>
      </div>

      {/* 플레이필드 */}
      <div className="falling-field" style={fieldStyle}>
        {flash === "levelup" && (
          <div className="levelup-banner">LEVEL {g.level}! ⚡</div>
        )}
        {g.words.map((w) => {
          const progress = Math.min((now - w.bornAt) / w.fallDuration, 1);
          const top = progress * 100;
          const danger = progress > 0.75;
          const matched = prefix && w.text.startsWith(prefix);
          return (
            <div
              key={w.id}
              className={`falling-word ${danger ? "danger" : ""} ${
                matched ? "matched" : ""
              }`}
              style={{ left: `${w.x}%`, top: `${top}%` }}
            >
              {matched ? (
                <>
                  <span className="fw-done">{w.text.slice(0, prefix.length)}</span>
                  <span className="fw-rest">{w.text.slice(prefix.length)}</span>
                </>
              ) : (
                w.text
              )}
            </div>
          );
        })}
        <div className="falling-ground" />
      </div>

      {/* 입력 */}
      <div className="falling-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="떨어지는 단어를 입력하세요!"
          className="falling-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default FallingWordsGame;
