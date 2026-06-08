// src/TypingPracticeGame.js
// 한글 타자연습 미니게임

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, getDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "../../firebase";
import { difficultyConfig, getRandomSentences, generateRandomReward, getArcadeRewardParams } from "../../data/typingWords";
import FallingWordsGame from "./FallingWordsGame";
import TypingRanking from "./TypingRanking";
import TranscriptionMode from "./TranscriptionMode";
import "./TypingPracticeGame.css";
import { logger } from '../../utils/logger';

const TypingPracticeGame = ({ onClose }) => {
  const { user, userDoc, updateUser } = useAuth();

  // 게임 상태
  const [gameState, setGameState] = useState("menu"); // menu, playing, completed, cardSelection, reward
  const [difficulty, setDifficulty] = useState("easy");
  const [sentences, setSentences] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [totalTyped, setTotalTyped] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [dailyPlayCount, setDailyPlayCount] = useState(0);

  // 🎮 게임 모드(떨어지는 단어) 결과
  const [arcadeResult, setArcadeResult] = useState(null);

  // 카드 선택 관련
  const [rewardData, setRewardData] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);
  // 보상 카드 선택 후 "메뉴로" 대신 돌아갈 화면 (연습=completed, 게임=arcadeOver)
  const [rewardReturn, setRewardReturn] = useState("completed");

  // Refs
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // 일일 플레이 횟수 확인
  const checkDailyPlayCount = useCallback(async () => {
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        const today = new Date().toDateString();
        const lastPlayDate = data.typingGameLastPlayDate?.toDate?.().toDateString() || "";

        if (lastPlayDate === today) {
          setDailyPlayCount(data.typingGameDailyCount || 0);
        } else {
          // 날짜가 바뀌면 초기화
          setDailyPlayCount(0);
          await updateDoc(userRef, {
            typingGameDailyCount: 0,
            typingGameLastPlayDate: serverTimestamp()
          });
        }
      }
    } catch (error) {
      logger.error("일일 플레이 횟수 확인 오류:", error);
    }
  }, [user]);

  // 게임 시작 (연습 모드)
  const startGame = useCallback((diff) => {
    setDifficulty(diff);
    const randomSentences = getRandomSentences(diff);
    setSentences(randomSentences);
    setCurrentIndex(0);
    setUserInput("");
    setCorrectCount(0);
    setWrongCount(0);
    setTotalTyped(0);
    // 🐛 fix: 난이도별 제한시간을 실제로 반영 (이전엔 30초 하드코딩 → 전문가/마스터가 설정대로 작동 안 함)
    setTimeLeft(difficultyConfig[diff]?.timeLimit || 30);
    setGameStartTime(Date.now());
    setGameState("playing");
  }, []);

  // 게임 모드 시작 (떨어지는 단어)
  const startArcade = useCallback(() => {
    setArcadeResult(null);
    setGameState("arcade");
  }, []);

  // 타이머
  useEffect(() => {
    if (gameState === "playing" && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (gameState === "playing" && timeLeft === 0) {
      handleGameEnd();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, timeLeft]);

  // 게임 종료
  const handleGameEnd = useCallback(() => {
    setGameState("completed");
  }, []);

  // 답안 확인
  const checkAnswer = useCallback(() => {
    if (!sentences[currentIndex]) return;

    const currentSentence = sentences[currentIndex].text;
    const trimmedInput = userInput.trim();

    // 빈 입력 거부 — Enter 스팸으로 문제를 건너뛰지 못하게 차단
    if (trimmedInput === "") return;

    // 너무 짧은 입력 거부 — 현재 문장의 60% 이상 입력해야 채점 (난이도 상향, 최소 1글자)
    const minLength = Math.max(1, Math.ceil(currentSentence.length * 0.6));
    if (trimmedInput.length < minLength) return;

    const isCorrect = trimmedInput === currentSentence;
    setTotalTyped(prev => prev + userInput.length);

    if (!isCorrect) {
      // 오답: 다음으로 넘기지 않음 — 아무거나 쳐서 문장을 건너뛰는 것 차단.
      // 정확히 일치해야만 다음 문장으로 진행(✗ 카운트만 올라감).
      setWrongCount(prev => prev + 1);
      setUserInput("");
      return;
    }

    // 정답일 때만 다음 문장으로
    setCorrectCount(prev => prev + 1);
    if (currentIndex + 1 < sentences.length) {
      setCurrentIndex(prev => prev + 1);
      setUserInput("");
    } else {
      handleGameEnd();
    }
  }, [sentences, currentIndex, userInput, handleGameEnd]);

  // 입력 처리
  const handleInputChange = useCallback((e) => {
    setUserInput(e.target.value);
  }, []);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      checkAnswer();
    }
  };

  // 카드 선택으로 이동 (연습/게임 모드 공용)
  // 🔒 금융 안전: 새 faucet 없이 기존 가중치 재사용, 하루 5회 카드뽑기 카운터는 두 모드가 공유.
  const proceedToCardSelection = useCallback((diff, correct, returnState) => {
    if (dailyPlayCount >= 5) {
      setGameState("menu");
      return;
    }
    // 보상 자격 없으면 미지급 (UI 우회 방지)
    if (!correct || correct <= 0) {
      return;
    }
    const rewards = generateRandomReward(diff, correct);
    setRewardData(rewards);
    setSelectedCard(null);
    setIsFlipping(false);
    setRewardReturn(returnState || "completed");
    setGameState("cardSelection");
  }, [dailyPlayCount]);

  // 연습 모드 → 보상
  const handleProceedToCardSelection = () => {
    proceedToCardSelection(difficulty, correctCount, "completed");
  };

  // 게임 모드 → 보상 (점수 기반 파라미터로 매핑)
  const handleArcadeReward = () => {
    const { difficulty: diff, correctCount: correct } = getArcadeRewardParams(
      arcadeResult?.score || 0
    );
    proceedToCardSelection(diff, correct, "arcadeOver");
  };

  // 🏆 게임 점수 → 일일 최고점 저장 (랭킹용, 현금 미연동)
  const submitArcadeScore = useCallback(async (score) => {
    if (!user?.uid || !Number.isFinite(score) || score <= 0) return;
    try {
      const today = new Date().toDateString();
      const prevDay = userDoc?.typingArcadeBestDay;
      const prevBest = prevDay === today ? (userDoc?.typingArcadeBestScore || 0) : 0;
      if (score <= prevBest) return; // 갱신 아님

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        typingArcadeBestScore: score,
        typingArcadeBestDay: today,
        typingArcadeUpdatedAt: serverTimestamp(),
        // 학급 증분 동기화(getClassmates)가 점수 변화를 감지하도록 updatedAt 갱신
        updatedAt: serverTimestamp(),
      });
      if (typeof updateUser === "function") {
        await updateUser({ typingArcadeBestScore: score, typingArcadeBestDay: today });
      }
    } catch (e) {
      logger.error("[Typing] 게임 점수 저장 오류:", e);
    }
  }, [user, userDoc, updateUser]);

  // 게임 모드 종료 (생명 0 또는 그만하기) → 점수 기록 + 결과 화면
  const handleArcadeEnd = useCallback((result) => {
    setArcadeResult(result);
    submitArcadeScore(result?.score || 0);
    setGameState("arcadeOver");
  }, [submitArcadeScore]);

  // 게임 모드 도중 그만하기 → 점수는 기록하되 메뉴로
  const handleArcadeQuit = useCallback((result) => {
    if (result) submitArcadeScore(result?.score || 0);
    setGameState("menu");
  }, [submitArcadeScore]);

  // 카드 선택
  const handleCardSelect = async (cardType) => {
    // 🔥 안정성 강화 — 다중 가드:
    //  1) 이미 뒤집는 중/선택됨 → return
    //  2) loading 중 → return (네트워크 지연)
    //  3) rewardData 미준비 → return (state 동기화 race 방지)
    //  4) user.uid 없음 → return (인증 미완료)
    if (isFlipping || selectedCard || loading) return;
    if (!rewardData || typeof rewardData.cash !== "number" || typeof rewardData.coupon !== "number") {
      logger.warn("[Typing] rewardData 미준비 - 클릭 무시", rewardData);
      return;
    }
    if (!user?.uid) {
      logger.warn("[Typing] user.uid 없음 - 클릭 무시");
      return;
    }

    setSelectedCard(cardType);
    setIsFlipping(true);

    // 카드 뒤집기 애니메이션 후 보상 적용
    setTimeout(async () => {
      setLoading(true);
      try {
        const userRef = doc(db, "users", user.uid);
        const rewardAmount = cardType === "cash" ? rewardData.cash : rewardData.coupon;
        if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
          throw new Error(`잘못된 보상 금액: ${rewardAmount}`);
        }

        const updates = {
          typingGameDailyCount: dailyPlayCount + 1,
          typingGameLastPlayDate: serverTimestamp()
        };

        // ⚠️ 절대값(userDoc.cash + reward) 덮어쓰기 금지 — onSnapshot 지연/오프라인 캐시로
        // userDoc.cash가 stale일 때 다른 트랜잭션(친구 송금·자동 적금 납입 등)을 무효화해
        // 학생 자산이 비현실적으로 부풀려지는 race condition이 발생함. increment 사용 필수.
        if (cardType === "cash") {
          updates.cash = increment(rewardAmount);
        } else {
          updates.coupons = increment(rewardAmount);
        }

        await updateDoc(userRef, updates);
        // 로컬 상태에는 델타 형태로 전달 (updateUser는 increment FieldValue를 처리할 수 없음)
        if (typeof updateUser === "function") {
          await updateUser({
            typingGameDailyCount: dailyPlayCount + 1,
            ...(cardType === "cash"
              ? { cash: (userDoc?.cash || 0) + rewardAmount }
              : { coupons: (userDoc?.coupons || 0) + rewardAmount }),
          });
        }

        setDailyPlayCount(prev => prev + 1);

        // 보상 화면으로 이동
        setTimeout(() => {
          setGameState("reward");
          setLoading(false);
        }, 1000);
      } catch (error) {
        logger.error("보상 처리 오류:", error);
        setError("보상 처리 중 오류가 발생했습니다.");
        setLoading(false);
      }
    }, 800);
  };

  // 초기 로드
  useEffect(() => {
    checkDailyPlayCount();
  }, [checkDailyPlayCount]);

  // 입력 포커스
  useEffect(() => {
    if (gameState === "playing" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [gameState, currentIndex]);

  // 모드 선택 허브
  const renderMenu = () => {
    return (
      <div className="typing-game-menu minigame">
        <div className="game-header minigame-header">
          <div>
            <h2>⌨️ 한글 타자연습</h2>
            <p className="subtitle">연습으로 실력을 키우고, 게임으로 경쟁하세요!</p>
          </div>
          {onClose && <button className="back-button" onClick={onClose}>← 뒤로가기</button>}
        </div>

        <div className="mode-select">
          <button className="mode-card practice" onClick={() => setGameState("practice")}>
            <div className="mode-emoji">📝</div>
            <div className="mode-title">연습 모드</div>
            <div className="mode-desc">난이도를 골라 문장을 정확히 입력해요. 보상 카드 획득!</div>
          </button>

          <button className="mode-card arcade" onClick={startArcade}>
            <div className="mode-emoji">🌧️</div>
            <div className="mode-title">게임 모드<span className="mode-badge">NEW</span></div>
            <div className="mode-desc">떨어지는 단어를 빠르게 입력! 콤보·생명·레벨업으로 고득점 도전</div>
          </button>

          <button className="mode-card transcribe" onClick={() => setGameState("transcribe")}>
            <div className="mode-emoji">✍️</div>
            <div className="mode-title">필사 연습<span className="mode-badge">NEW</span></div>
            <div className="mode-desc">속담·시·명언 등 좋은 글을 그대로 따라 써요. 정확도·타수 기록!</div>
          </button>

          <button className="mode-card ranking" onClick={() => setGameState("ranking")}>
            <div className="mode-emoji">🏆</div>
            <div className="mode-title">오늘의 학급 랭킹</div>
            <div className="mode-desc">우리 반 친구들의 오늘 최고 점수를 확인해요</div>
          </button>
        </div>

        <div className="daily-info minigame-info compact">
          <div className="info-badge">
            <span className="badge-label">오늘의 보상</span>
            <span className="badge-value">{dailyPlayCount}/5</span>
          </div>
          <p className="reward-note">연습·게임 모드에서 하루 5번까지 카드 보상을 받을 수 있어요 🎁</p>
        </div>
      </div>
    );
  };

  // 연습 모드 — 난이도 선택
  const renderPractice = () => {
    const canPlayForReward = dailyPlayCount < 5;

    return (
      <div className="typing-game-menu minigame">
        <div className="game-header minigame-header">
          <div>
            <h2>📝 연습 모드</h2>
            <p className="subtitle">빠르고 정확하게 입력하세요!</p>
          </div>
          <button className="back-button" onClick={() => setGameState("menu")}>← 모드선택</button>
        </div>

        <div className="daily-info minigame-info">
          <div className="info-badge">
            <span className="badge-label">오늘의 보상 게임</span>
            <span className="badge-value">{dailyPlayCount}/5</span>
          </div>
          {!canPlayForReward && (
            <div className="warning-box">
              <p>오늘은 더 이상 보상을 받을 수 없습니다</p>
              <p className="sub">연습은 언제든지 가능합니다!</p>
            </div>
          )}
          {canPlayForReward && (
            <div className="reward-preview">
              <p>🎁 카드를 선택하여 랜덤 보상을 받으세요!</p>
              <div className="reward-range">
                <span>💰 100원 ~ 100,000원</span>
                <span>🎫 1개 ~ 20개</span>
              </div>
            </div>
          )}
        </div>

        <div className="difficulty-selection minigame-cards">
          {Object.entries(difficultyConfig).map(([key, config]) => (
            <div key={key} className="difficulty-card minigame-card">
              <div className="card-header">
                <h3>{config.name}</h3>
                <div className="difficulty-badge">{config.name}</div>
              </div>
              <div className="card-content">
                <div className="stat-row">
                  <span className="stat-icon">⏱️</span>
                  <span className="stat-label">시간</span>
                  <span className="stat-value">{config.timeLimit}초</span>
                </div>
                <div className="stat-row">
                  <span className="stat-icon">📝</span>
                  <span className="stat-label">문장 수</span>
                  <span className="stat-value">{config.sentencesPerGame}개</span>
                </div>
              </div>
              <button
                className="start-btn minigame-btn"
                onClick={() => startGame(key)}
                disabled={loading}
              >
                시작하기
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 게임 모드 결과 화면
  const renderArcadeOver = () => {
    const r = arcadeResult || {};
    const today = new Date().toDateString();
    const todayBest =
      userDoc?.typingArcadeBestDay === today ? (userDoc?.typingArcadeBestScore || 0) : 0;
    const isNewBest = (r.score || 0) >= todayBest && (r.score || 0) > 0;
    // 보상 자격 = 일일 한도 미달 + 의미 있는 점수(저득점은 getArcadeRewardParams가 correctCount 0 반환)
    const canGetReward =
      dailyPlayCount < 5 && getArcadeRewardParams(r.score || 0).correctCount > 0;

    return (
      <div className="typing-game-completed minigame-completed">
        <div className="completion-header minigame-header">
          <h2>🎮 게임 종료!</h2>
          {isNewBest && <p className="new-best">🎉 오늘 최고 기록 갱신!</p>}
        </div>

        <div className="results minigame-results">
          <div className="result-grid">
            <div className="result-item highlight">
              <span className="result-label">점수</span>
              <span className="result-value">{(r.score || 0).toLocaleString()}</span>
            </div>
            <div className="result-item">
              <span className="result-label">처리한 단어</span>
              <span className="result-value">{r.wordsCleared || 0}개</span>
            </div>
            <div className="result-item">
              <span className="result-label">최대 콤보</span>
              <span className="result-value">{r.maxCombo || 0}</span>
            </div>
            <div className="result-item">
              <span className="result-label">도달 레벨</span>
              <span className="result-value">LV.{r.level || 1}</span>
            </div>
          </div>
        </div>

        <div className="completion-actions">
          {canGetReward ? (
            <button className="reward-proceed-btn" onClick={handleArcadeReward}>
              🎁 보상 받기
            </button>
          ) : (
            <div className="no-reward-message">
              {dailyPlayCount >= 5 ? (
                <>
                  <p>오늘 보상은 모두 받았어요</p>
                  <p className="sub">점수 기록은 랭킹에 계속 반영됩니다!</p>
                </>
              ) : (
                <p>조금 더 높은 점수를 내야 보상을 받을 수 있어요!</p>
              )}
            </div>
          )}
          <div className="action-buttons">
            <button className="menu-btn" onClick={() => setGameState("ranking")}>
              🏆 랭킹 보기
            </button>
            <button className="retry-btn" onClick={startArcade}>
              다시 도전
            </button>
            <button className="menu-btn" onClick={() => setGameState("menu")}>
              모드선택
            </button>
            {onClose && <button className="exit-btn menu-btn" onClick={onClose}>나가기</button>}
          </div>
        </div>
      </div>
    );
  };

  // 게임 화면
  const renderGame = () => {
    if (!sentences[currentIndex]) {
      return <div className="loading">게임 로딩 중...</div>;
    }

    const currentSentence = sentences[currentIndex].text;
    const progress = ((currentIndex) / sentences.length) * 100;

    return (
      <div className="typing-game-play minigame-play">
        <div className="game-header minigame-header">
          <div className="game-info">
            <span className="info-chip">{difficultyConfig[difficulty].name}</span>
            <span className="info-chip timer">⏱️ {timeLeft}초</span>
            <span className="info-chip">📊 {currentIndex}/{sentences.length}</span>
          </div>
          <div className="game-header-buttons">
            <button className="menu-btn-small" onClick={() => setGameState("menu")}>← 메뉴</button>
            {onClose && <button className="back-button-small" onClick={onClose}>나가기</button>}
          </div>
        </div>

        <div className="progress-bar minigame-progress">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="sentence-display minigame-sentence">
          <div className="sentence-text">{currentSentence}</div>
          <div className="sentence-counter">{currentIndex + 1} / {sentences.length}</div>
        </div>

        <div className="input-section minigame-input">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder="문장을 입력하고 Enter를 누르세요"
            className="sentence-input"
          />
          {(() => {
            const minLen = Math.max(1, Math.ceil(currentSentence.length * 0.6));
            const canSubmit = userInput.trim().length >= minLen;
            return (
              <button
                className="submit-btn"
                onClick={checkAnswer}
                disabled={!canSubmit}
                title={canSubmit ? "" : `최소 ${minLen}글자 이상 입력하세요`}
                style={{
                  opacity: canSubmit ? 1 : 0.4,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                확인
              </button>
            );
          })()}
        </div>

        <div className="score-display minigame-score">
          <div className="score-item correct">
            <span className="score-icon">✓</span>
            <span className="score-count">{correctCount}</span>
          </div>
          <div className="score-item wrong">
            <span className="score-icon">✗</span>
            <span className="score-count">{wrongCount}</span>
          </div>
        </div>
      </div>
    );
  };

  // 완료 화면
  const renderCompleted = () => {
    const totalQuestions = sentences.length;
    const accuracy = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(1) : 0;
    // 🐛 fix: 난이도별 제한시간 기준으로 소요시간·타수 계산 (이전엔 30초 고정 → 전문가/마스터 오계산)
    const totalTime = difficultyConfig[difficulty]?.timeLimit || 30;
    const timeSpent = totalTime - timeLeft;
    const wpm = timeSpent > 0 ? Math.floor((totalTyped / 5) / (timeSpent / 60)) : 0;
    const canGetReward = dailyPlayCount < 5;

    return (
      <div className="typing-game-completed minigame-completed">
        <div className="completion-header minigame-header">
          <h2>🎉 게임 완료!</h2>
          <p className="subtitle">{difficultyConfig[difficulty].name} 난이도</p>
        </div>

        <div className="results minigame-results">
          <div className="result-grid">
            <div className="result-item">
              <span className="result-label">정확도</span>
              <span className="result-value">{accuracy}%</span>
            </div>
            <div className="result-item">
              <span className="result-label">정답</span>
              <span className="result-value">{correctCount}/{totalQuestions}</span>
            </div>
            <div className="result-item">
              <span className="result-label">타수</span>
              <span className="result-value">{wpm} WPM</span>
            </div>
            <div className="result-item">
              <span className="result-label">소요 시간</span>
              <span className="result-value">{timeSpent}초</span>
            </div>
          </div>
        </div>

        <div className="completion-actions">
          {!canGetReward ? (
            <div className="no-reward-message">
              <p>오늘은 더 이상 보상을 받을 수 없습니다</p>
              <p className="sub">내일 다시 도전해보세요!</p>
            </div>
          ) : correctCount === 0 ? (
            <div className="no-reward-message">
              <p>한 문제 이상 정답을 맞춰야 보상을 받을 수 있어요!</p>
              <p className="sub">다시 도전해보세요 💪</p>
            </div>
          ) : (
            <button className="reward-proceed-btn" onClick={handleProceedToCardSelection}>
              🎁 보상 받기
            </button>
          )}
          <div className="action-buttons">
            <button className="menu-btn" onClick={() => setGameState("menu")}>
              메뉴로
            </button>
            <button className="retry-btn" onClick={() => startGame(difficulty)}>
              다시 도전
            </button>
            {onClose && <button className="exit-btn menu-btn" onClick={onClose}>나가기</button>}
          </div>
        </div>
      </div>
    );
  };

  // 카드 선택 화면
  const renderCardSelection = () => {
    // 🔥 rewardData 미준비 시 로딩 표시 (이전엔 undefined가 렌더되어 화면 깨짐)
    if (!rewardData || typeof rewardData.cash !== "number" || typeof rewardData.coupon !== "number") {
      return (
        <div className="card-selection-screen">
          <div className="card-selection-header">
            <h2>🎁 보상 카드 준비 중...</h2>
            <p>잠시만 기다려주세요</p>
          </div>
          <div className="processing-overlay" style={{ position: "relative", padding: "40px 0" }}>
            <div className="loading-spinner" />
          </div>
        </div>
      );
    }

    // 안전한 표시값 (locale 변환 실패 시 원시값 사용)
    const cashDisplay = (() => {
      try { return rewardData.cash.toLocaleString(); } catch { return String(rewardData.cash); }
    })();
    const couponDisplay = String(rewardData.coupon);

    return (
      <div className="card-selection-screen">
        <div className="card-selection-header">
          <h2>🎁 보상 카드를 선택하세요!</h2>
          <p>하나의 카드를 선택하면 랜덤 보상이 공개됩니다</p>
          {onClose && <button className="back-button" onClick={() => setGameState(rewardReturn)}>← 결과로</button>}
        </div>

        <div className="reward-cards">
          <div
            className={`reward-card ${selectedCard === 'cash' ? 'flipped' : ''} ${selectedCard && selectedCard !== 'cash' ? 'disabled' : ''}`}
            onClick={() => handleCardSelect('cash')}
          >
            <div className="card-inner">
              <div className="card-front">
                <div className="card-icon">💰</div>
                <div className="card-title">현금</div>
                <div className="card-hint">100원 ~ 100,000원</div>
              </div>
              <div className="card-back">
                <div className="reward-reveal">
                  <div className="reward-icon">💰</div>
                  <div className="reward-amount">{cashDisplay}원</div>
                  <div className="reward-label">현금 획득!</div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`reward-card ${selectedCard === 'coupon' ? 'flipped' : ''} ${selectedCard && selectedCard !== 'coupon' ? 'disabled' : ''}`}
            onClick={() => handleCardSelect('coupon')}
          >
            <div className="card-inner">
              <div className="card-front">
                <div className="card-icon">🎫</div>
                <div className="card-title">쿠폰</div>
                <div className="card-hint">1개 ~ 20개</div>
              </div>
              <div className="card-back">
                <div className="reward-reveal">
                  <div className="reward-icon">🎫</div>
                  <div className="reward-amount">{couponDisplay}개</div>
                  <div className="reward-label">쿠폰 획득!</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="processing-overlay">
            <div className="loading-spinner"></div>
            <p>보상 처리 중...</p>
          </div>
        )}
      </div>
    );
  };

  // 보상 화면
  const renderReward = () => {
    const rewardType = selectedCard;
    const rewardAmount = rewardType === 'cash' ? rewardData?.cash : rewardData?.coupon;

    return (
      <div className="typing-game-reward minigame-reward">
        <div className="reward-header">
          <h2>🎉 축하합니다!</h2>
          <p className="subtitle">보상을 획득했습니다</p>
        </div>

        <div className="reward-content">
          <div className="reward-display">
            <div className="reward-icon-large">
              {rewardType === 'cash' ? '💰' : '🎫'}
            </div>
            <div className="reward-text">
              {rewardType === 'cash'
                ? `${rewardAmount?.toLocaleString()}원`
                : `${rewardAmount}개`}
            </div>
            <div className="reward-type">
              {rewardType === 'cash' ? '현금' : '쿠폰'}
            </div>
          </div>
          <p className="remaining-count">남은 보상 기회: {5 - dailyPlayCount}/5</p>
        </div>

        <div className="reward-actions">
          <button className="menu-btn" onClick={() => setGameState("menu")}>
            메뉴로 돌아가기
          </button>
          {dailyPlayCount < 5 && (
            <button
              className="retry-btn"
              onClick={() =>
                rewardReturn === "arcadeOver" ? startArcade() : startGame(difficulty)
              }
            >
              다시 도전
            </button>
          )}
          {onClose && <button className="exit-btn menu-btn" onClick={onClose}>나가기</button>}
        </div>
      </div>
    );
  };

  // 로딩 화면
  if (loading && gameState !== "cardSelection") {
    return (
      <div className="typing-game-container">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>처리 중...</p>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error) {
    return (
      <div className="typing-game-container">
        <div className="error-screen">
          <h3>오류 발생</h3>
          <p>{error}</p>
          <button onClick={() => {
            setError("");
            setGameState("menu");
          }}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="typing-game-container minigame-container">
      {gameState === "menu" && renderMenu()}
      {gameState === "practice" && renderPractice()}
      {gameState === "playing" && renderGame()}
      {gameState === "completed" && renderCompleted()}
      {gameState === "cardSelection" && renderCardSelection()}
      {gameState === "reward" && renderReward()}
      {gameState === "arcade" && (
        <FallingWordsGame
          hasBg
          onGameOver={handleArcadeEnd}
          onQuit={handleArcadeQuit}
        />
      )}
      {gameState === "arcadeOver" && renderArcadeOver()}
      {gameState === "ranking" && (
        <TypingRanking onBack={() => setGameState("menu")} />
      )}
      {gameState === "transcribe" && (
        <TranscriptionMode onBack={() => setGameState("menu")} />
      )}
    </div>
  );
};

export default TypingPracticeGame;
