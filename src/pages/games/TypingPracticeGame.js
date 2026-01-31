// src/TypingPracticeGame.js
// 한글 타자연습 미니게임

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { difficultyConfig, getRandomSentences, generateRandomReward } from "../../data/typingWords";
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

  // 카드 선택 관련
  const [rewardData, setRewardData] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [isFlipping, setIsFlipping] = useState(false);

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

  // 게임 시작
  const startGame = useCallback((diff) => {
    setDifficulty(diff);
    const randomSentences = getRandomSentences(diff);
    setSentences(randomSentences);
    setCurrentIndex(0);
    setUserInput("");
    setCorrectCount(0);
    setWrongCount(0);
    setTotalTyped(0);
    setTimeLeft(30);
    setGameStartTime(Date.now());
    setGameState("playing");
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
    const isCorrect = userInput.trim() === currentSentence;

    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
    } else {
      setWrongCount(prev => prev + 1);
    }

    setTotalTyped(prev => prev + userInput.length);

    // 다음 문장으로
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

  // 카드 선택으로 이동
  const handleProceedToCardSelection = () => {
    if (dailyPlayCount >= 5) {
      setGameState("menu");
      return;
    }

    // 랜덤 보상 생성 (난이도별 차등 + 정답 개수 비례)
    const rewards = generateRandomReward(difficulty, correctCount);
    setRewardData(rewards);
    setSelectedCard(null);
    setIsFlipping(false);
    setGameState("cardSelection");
  };

  // 카드 선택
  const handleCardSelect = async (cardType) => {
    if (isFlipping || selectedCard) return;

    setSelectedCard(cardType);
    setIsFlipping(true);

    // 카드 뒤집기 애니메이션 후 보상 적용
    setTimeout(async () => {
      setLoading(true);
      try {
        const userRef = doc(db, "users", user.uid);
        const rewardAmount = cardType === "cash" ? rewardData.cash : rewardData.coupon;

        const updates = {
          typingGameDailyCount: dailyPlayCount + 1,
          typingGameLastPlayDate: serverTimestamp()
        };

        if (cardType === "cash") {
          updates.cash = (userDoc?.cash || 0) + rewardAmount;
        } else {
          updates.coupons = (userDoc?.coupons || 0) + rewardAmount;
        }

        await updateDoc(userRef, updates);
        await updateUser(updates);

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

  // 메뉴 화면
  const renderMenu = () => {
    const canPlayForReward = dailyPlayCount < 5;

    return (
      <div className="typing-game-menu minigame">
        <div className="game-header minigame-header">
          <div>
            <h2>⌨️ 한글 타자연습</h2>
            <p className="subtitle">빠르고 정확하게 입력하세요!</p>
          </div>
          {onClose && <button className="back-button" onClick={onClose}>← 뒤로가기</button>}
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
                <span>🎫 1개 ~ 50개</span>
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
          <button className="submit-btn" onClick={checkAnswer}>확인</button>
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
    const timeSpent = 30 - timeLeft;
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
          {canGetReward ? (
            <button className="reward-proceed-btn" onClick={handleProceedToCardSelection}>
              🎁 보상 받기
            </button>
          ) : (
            <div className="no-reward-message">
              <p>오늘은 더 이상 보상을 받을 수 없습니다</p>
              <p className="sub">내일 다시 도전해보세요!</p>
            </div>
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
    return (
      <div className="card-selection-screen">
        <div className="card-selection-header">
          <h2>🎁 보상 카드를 선택하세요!</h2>
          <p>하나의 카드를 선택하면 랜덤 보상이 공개됩니다</p>
          {onClose && <button className="back-button" onClick={() => setGameState("completed")}>← 결과로</button>}
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
                  <div className="reward-amount">{rewardData?.cash?.toLocaleString()}원</div>
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
                <div className="card-hint">1개 ~ 50개</div>
              </div>
              <div className="card-back">
                <div className="reward-reveal">
                  <div className="reward-icon">🎫</div>
                  <div className="reward-amount">{rewardData?.coupon}개</div>
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
            <button className="retry-btn" onClick={() => startGame(difficulty)}>
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
      {gameState === "playing" && renderGame()}
      {gameState === "completed" && renderCompleted()}
      {gameState === "cardSelection" && renderCardSelection()}
      {gameState === "reward" && renderReward()}
    </div>
  );
};

export default TypingPracticeGame;
