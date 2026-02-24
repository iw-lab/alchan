// src/OmokGame.js - 랭킹 포인트 시스템 수정 및 UI 개선 (재대결 기능 추가)
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
  deleteDoc,
  query,
  where,
  getDocs,
  orderBy,
  increment,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { usePolling } from "../../hooks/usePolling";
import { logActivity, ACTIVITY_TYPES } from "../../utils/firestoreHelpers";
import "./OmokGame.css";
import "./GamePage.css";

import { logger } from "../../utils/logger";
// [랭크 시스템] 랭크 포인트(RP) 기준 정의
const RANKS = [
  { title: "LEGEND", color: "#ff0066", minRP: 2000, icon: "👑" },
  { title: "MASTER", color: "#ff4500", minRP: 1500, icon: "💎" },
  { title: "DIAMOND", color: "#00bfff", minRP: 1300, icon: "💠" },
  { title: "PLATINUM", color: "#4169e1", minRP: 1150, icon: "⭐" },
  { title: "GOLD", color: "#ffd700", minRP: 1050, icon: "🏆" },
  { title: "SILVER", color: "#c0c0c0", minRP: 950, icon: "🥈" },
  { title: "BRONZE", color: "#cd7f32", minRP: 0, icon: "🥉" },
];

const RP_ON_WIN = 15;
const RP_ON_LOSS = 8;
const BASE_RP = 1000;

const BOARD_SIZE = 15;

// ===== 오목 AI 엔진 =====
const getIndex = (row, col) => row * BOARD_SIZE + col;
const getBoardValue = (board, row, col) => {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE)
    return undefined;
  return board[getIndex(row, col)];
};

// 패턴 평가: 새로운 통합 평가 함수
const evaluatePattern = (board, row, col, color) => {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  let totalScore = 0;

  for (const [dr, dc] of directions) {
    let forward = 0;
    let backward = 0;

    // 앞 방향으로 개수 세기
    for (let i = 1; i < 5; i++) {
      const r = row + i * dr;
      const c = col + i * dc;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
      if (board[getIndex(r, c)] !== color) break;
      forward++;
    }

    // 뒷 방향으로 개수 세기
    for (let i = 1; i < 5; i++) {
      const r = row - i * dr;
      const c = col - i * dc;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
      if (board[getIndex(r, c)] !== color) break;
      backward++;
    }

    const total = forward + backward + 1; // 현재 돌 포함

    // 양 끝 상태 확인
    const forwardR = row + (forward + 1) * dr;
    const forwardC = col + (forward + 1) * dc;
    const backwardR = row - (backward + 1) * dr;
    const backwardC = col - (backward + 1) * dc;

    let openEnds = 0;
    // 앞쪽 끝이 열려있으면
    if (
      forwardR >= 0 &&
      forwardR < BOARD_SIZE &&
      forwardC >= 0 &&
      forwardC < BOARD_SIZE
    ) {
      if (board[getIndex(forwardR, forwardC)] === null) openEnds++;
    }
    // 뒤쪽 끝이 열려있으면
    if (
      backwardR >= 0 &&
      backwardR < BOARD_SIZE &&
      backwardC >= 0 &&
      backwardC < BOARD_SIZE
    ) {
      if (board[getIndex(backwardR, backwardC)] === null) openEnds++;
    }

    // 패턴에 따른 점수 부여
    if (total >= 5) {
      totalScore += 100000000; // 5목
    } else if (total === 4) {
      if (openEnds === 2)
        totalScore += 500000; // 열린 4 (필승)
      else if (openEnds === 1) totalScore += 50000; // 닫힌 4
    } else if (total === 3) {
      if (openEnds === 2)
        totalScore += 10000; // 열린 3
      else if (openEnds === 1) totalScore += 1000; // 닫힌 3
    } else if (total === 2) {
      if (openEnds === 2)
        totalScore += 500; // 열린 2
      else if (openEnds === 1) totalScore += 50; // 닫힌 2
    } else if (total === 1) {
      if (openEnds === 2) totalScore += 10;
    }
  }

  return totalScore;
};

const evaluateLine = (line) => {
  const counts = { black: 0, white: 0 };
  line.forEach((cell) => {
    if (cell) counts[cell]++;
  });

  if (counts.black > 0 && counts.white > 0) return 0; // Mixed line

  const player = counts.black > 0 ? "black" : "white";
  const count = counts[player];

  if (count === 5) return 100000;
  if (count === 4) return 10000;
  if (count === 3) return 100;
  if (count === 2) return 10;
  if (count === 1) return 1;
  return 0;
};

const evaluateBoard = (board) => {
  let score = 0;
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      directions.forEach(([dr, dc]) => {
        if (
          r + dr * 4 < BOARD_SIZE &&
          c + dc * 4 < BOARD_SIZE &&
          c + dc * 4 >= 0
        ) {
          const line = [];
          for (let i = 0; i < 5; i++) {
            line.push(getBoardValue(board, r + i * dr, c + i * dc));
          }
          score += evaluateLine(line);
        }
      });
    }
  }
  return score;
};

// =======================
// 새로운 통합 승리 판정 로직
const checkForWin = (board, row, col, player) => {
  const directions = [
    { y: 0, x: 1 }, // 가로
    { y: 1, x: 0 }, // 세로
    { y: 1, x: 1 }, // 대각선 (\)
    { y: 1, x: -1 }, // 대각선 (/)
  ];

  for (const dir of directions) {
    let count = 1; // 현재 놓은 돌 포함

    // 정방향 탐색
    for (let i = 1; i < 6; i++) {
      const r = row + i * dir.y;
      const c = col + i * dir.x;
      if (getBoardValue(board, r, c) === player) {
        count++;
      } else {
        break;
      }
    }

    // 역방향 탐색
    for (let i = 1; i < 6; i++) {
      const r = row - i * dir.y;
      const c = col - i * dir.x;
      if (getBoardValue(board, r, c) === player) {
        count++;
      } else {
        break;
      }
    }

    // 6목 이상은 승리가 아님
    if (count === 5) {
      return player;
    }
  }

  return null; // 승리하지 않음
};

// 위치 평가: 새로운 패턴 기반 평가 (1차원적 사고)
const evaluatePosition = (
  board,
  row,
  col,
  color,
  opponentColor,
  difficulty,
) => {
  // 해당 위치에 돌을 놓았다고 가정하고 평가
  const tempBoard = [...board];
  const idx = getIndex(row, col);

  tempBoard[idx] = color;
  const myScore = evaluatePattern(tempBoard, row, col, color);

  // 상대방이 이 위치에 놓았을 때의 점수 (방어 가치)
  tempBoard[idx] = opponentColor;
  const opponentScore = evaluatePattern(tempBoard, row, col, opponentColor);

  // 난이도별 가중치 조정
  let attackWeight = 1.0;
  let defenseWeight = 1.0;

  if (difficulty === "초급") {
    attackWeight = 0.8;
    defenseWeight = 0.6; // 방어 약함
  } else if (difficulty === "중급") {
    attackWeight = 1.0;
    defenseWeight = 0.9;
  } else if (difficulty === "상급") {
    attackWeight = 1.2;
    defenseWeight = 1.1; // 방어도 중요하게
  }

  return myScore * attackWeight + opponentScore * defenseWeight;
};

const findBestMove = (board, aiColor, difficulty) => {
  // 돌이 놓인 위치 찾기
  const placedStones = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    if (board[i]) {
      placedStones.push({ r: Math.floor(i / BOARD_SIZE), c: i % BOARD_SIZE });
    }
  }

  // 첫 수라면 중앙 근처에 놓기
  if (placedStones.length <= 1) {
    const center = Math.floor(BOARD_SIZE / 2);
    const centerMoves = [
      { r: center, c: center },
      { r: center, c: center + 1 },
      { r: center + 1, c: center },
      { r: center + 1, c: center + 1 },
      { r: center - 1, c: center },
      { r: center, c: center - 1 },
      { r: center + 1, c: center - 1 },
      { r: center - 1, c: center + 1 },
    ];
    for (const move of centerMoves) {
      if (!board[getIndex(move.r, move.c)]) {
        return move;
      }
    }
  }

  const opponentColor = aiColor === "black" ? "white" : "black";

  // 난이도에 따라 탐색 범위 조정
  let searchRange = 2;
  if (difficulty === "초급") searchRange = 1;
  else if (difficulty === "중급") searchRange = 2;
  else if (difficulty === "상급") searchRange = 3;

  // 이미 놓인 돌 주변 범위 이내의 빈 자리만 탐색
  const possibleMoves = [];
  const checkedPositions = new Set();

  for (const stone of placedStones) {
    for (let dr = -searchRange; dr <= searchRange; dr++) {
      for (let dc = -searchRange; dc <= searchRange; dc++) {
        const r = stone.r + dr;
        const c = stone.c + dc;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          const idx = getIndex(r, c);
          const key = `${r},${c}`;
          if (!board[idx] && !checkedPositions.has(key)) {
            possibleMoves.push({ r, c });
            checkedPositions.add(key);
          }
        }
      }
    }
  }

  if (possibleMoves.length === 0) {
    // 만약 탐색된 수가 없다면, 그냥 비어있는 첫번째 칸에 둔다 (예외 처리)
    const firstEmpty = board.findIndex((cell) => cell === null);
    if (firstEmpty !== -1) {
      return {
        r: Math.floor(firstEmpty / BOARD_SIZE),
        c: firstEmpty % BOARD_SIZE,
      };
    }
    return null;
  }

  // 1순위: 즉시 승리 수 찾기
  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = aiColor;
    if (checkForWin(testBoard, move.r, move.c, aiColor)) {
      return move; // 즉시 승리
    }
  }

  // 2순위: 상대방의 승리 막기 (방어)
  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = opponentColor;
    if (checkForWin(testBoard, move.r, move.c, opponentColor)) {
      return move; // 필수 방어
    }
  }

  // 3순위: 내 열린 4 찾기 (거의 필승)
  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = aiColor;
    const patternScore = evaluatePattern(testBoard, move.r, move.c, aiColor);
    if (patternScore >= 500000) {
      // 열린 4
      logger.log("[AI] 내 열린 4 발견:", move);
      return move;
    }
  }

  // 4순위: 상대방 4 막기 (닫힌 4 포함)
  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = opponentColor;
    const patternScore = evaluatePattern(
      testBoard,
      move.r,
      move.c,
      opponentColor,
    );
    if (patternScore >= 50000) {
      // 닫힌 4 이상
      logger.log("[AI] 상대 4목 막기:", move, "score:", patternScore);
      return move;
    }
  }

  // 5순위: 내 열린 3 만들기
  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = aiColor;
    const patternScore = evaluatePattern(testBoard, move.r, move.c, aiColor);
    if (patternScore >= 10000) {
      // 열린 3
      logger.log("[AI] 내 열린 3 발견:", move);
      return move;
    }
  }

  // 6순위: 상대 열린 3 막기 (매우 중요!)
  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = opponentColor;
    const patternScore = evaluatePattern(
      testBoard,
      move.r,
      move.c,
      opponentColor,
    );
    if (patternScore >= 10000) {
      // 열린 3
      logger.log("[AI] 상대 열린 3 막기:", move, "score:", patternScore);
      if (difficulty === "상급") {
        return move; // 상급은 반드시 막음
      } else if (difficulty === "중급" && Math.random() > 0.1) {
        return move; // 중급은 90% 확률로 막음
      }
    }
  }

  // 7순위: 상대 닫힌 3 막기
  if (difficulty !== "초급") {
    for (const move of possibleMoves) {
      const testBoard = [...board];
      testBoard[getIndex(move.r, move.c)] = opponentColor;
      const patternScore = evaluatePattern(
        testBoard,
        move.r,
        move.c,
        opponentColor,
      );
      if (patternScore >= 1000) {
        // 닫힌 3
        logger.log("[AI] 상대 닫힌 3 막기:", move, "score:", patternScore);
        if (difficulty === "상급" && Math.random() > 0.3) {
          return move; // 상급은 70% 확률로 막음
        } else if (difficulty === "중급" && Math.random() > 0.5) {
          return move; // 중급은 50% 확률로 막음
        }
      }
    }
  }

  // 8순위: 가장 높은 점수의 수 선택
  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of possibleMoves) {
    const testBoard = [...board];
    testBoard[getIndex(move.r, move.c)] = aiColor;

    let score = evaluatePosition(
      testBoard,
      move.r,
      move.c,
      aiColor,
      opponentColor,
      difficulty,
    );

    // 중앙 부근에 가중치 (초반에 유리)
    const center = Math.floor(BOARD_SIZE / 2);
    const centerDist = Math.abs(move.r - center) + Math.abs(move.c - center);
    score += (BOARD_SIZE - centerDist) * 5;

    // 난이도에 따른 랜덤성 추가 (초급은 더 많은 실수)
    if (difficulty === "초급") {
      score += (Math.random() - 0.5) * 3000; // 큰 랜덤성
    } else if (difficulty === "중급") {
      score += (Math.random() - 0.5) * 300; // 작은 랜덤성
    }
    // 상급은 랜덤성 없음

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  logger.log("[AI] 최종 선택:", bestMove);
  return bestMove;
};
// =======================

// [랭크 시스템] RP 기반으로 랭크 정보를 계산하는 헬퍼 함수
const getOmokRankDetails = (omokStats) => {
  const wins = omokStats?.wins || 0;
  const losses = omokStats?.losses || 0;
  const totalRP = omokStats?.totalRP;

  const currentRP =
    totalRP !== undefined
      ? totalRP
      : Math.max(0, BASE_RP + wins * RP_ON_WIN - losses * RP_ON_LOSS);

  const currentRank = RANKS.find((rank) => currentRP >= rank.minRP);
  const currentRankIndex = RANKS.findIndex(
    (rank) => rank.title === currentRank.title,
  );

  let nextRank = null;
  let pointsForNextRank = 0;

  if (currentRankIndex > 0) {
    nextRank = RANKS[currentRankIndex - 1];
    pointsForNextRank = nextRank.minRP - currentRP;
  }

  return {
    currentRank,
    nextRank,
    currentRP,
    pointsForNextRank,
    wins,
    losses,
  };
};

// [랭크 시스템] 사용자 오목 기록 업데이트 함수 (RP 포함)
const updateUserOmokRecord = async (userId, result) => {
  if (!userId || userId === "AI") return;
  try {
    const userDocRef = doc(db, "users", userId);
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userDocRef);
      if (!userDoc.exists()) {
        logger.error(`사용자 ${userId}를 찾을 수 없습니다.`);
        return;
      }

      const userData = userDoc.data();
      const currentOmok = userData.omok || {
        wins: 0,
        losses: 0,
        totalRP: BASE_RP,
      };

      let newWins = currentOmok.wins || 0;
      let newLosses = currentOmok.losses || 0;
      let newTotalRP =
        currentOmok.totalRP !== undefined ? currentOmok.totalRP : BASE_RP;

      if (result === "win") {
        newWins += 1;
        newTotalRP += RP_ON_WIN;
      } else if (result === "loss") {
        newLosses += 1;
        newTotalRP = Math.max(0, newTotalRP - RP_ON_LOSS);
      }

      const updatedOmok = {
        wins: newWins,
        losses: newLosses,
        totalRP: newTotalRP,
      };

      transaction.update(userDocRef, { omok: updatedOmok });
      logger.log(`사용자 ${userId} 오목 기록 업데이트:`, updatedOmok);
    });
  } catch (error) {
    logger.error("사용자 오목 기록 업데이트 중 오류:", error);
  }
};

// [UI 컴포넌트] 랭크 표시 컴포넌트
const RankDisplay = ({
  rankDetails,
  showProgress = false,
  size = "normal",
}) => {
  if (!rankDetails) return null;

  const { currentRank, currentRP, nextRank, pointsForNextRank, wins, losses } =
    rankDetails;
  const winRate =
    wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  const sizeClass = size === "small" ? "rank-display-small" : "rank-display";

  return (
    <div className={sizeClass}>
      <div
        className="rank-badge"
        style={{ backgroundColor: currentRank.color }}
      >
        <span className="rank-icon">{currentRank.icon}</span>
        <span className="rank-title">{currentRank.title}</span>
      </div>
      <div className="rp-info">
        <span className="rp-value">{currentRP} RP</span>
        {showProgress && (
          <div className="rank-stats">
            <span className="win-loss">
              {wins}승 {losses}패 ({winRate}%)
            </span>
            {nextRank && (
              <div className="next-rank-progress">
                <span className="next-rank-text">
                  {nextRank.icon} {nextRank.title}까지 {pointsForNextRank} RP
                </span>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.max(10, ((currentRP - currentRank.minRP) / (nextRank.minRP - currentRank.minRP)) * 100)}%`,
                      backgroundColor: nextRank.color,
                    }}
                  ></div>
                </div>
              </div>
            )}
            {!nextRank && <div className="max-rank">🏆 최고 랭크!</div>}
          </div>
        )}
      </div>
    </div>
  );
};

const OmokGame = () => {
  const { user, userDoc, addCouponsToUserById, isAdmin, addCash } = useAuth();
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [createdGameId, setCreatedGameId] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [availableGames, setAvailableGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const refetchGameDataRef = useRef(null);
  const [feedback, setFeedback] = useState({ message: "", type: "" });
  const [gameMode, setGameMode] = useState("player"); // 'player' or 'ai'
  const [aiDifficulty, setAiDifficulty] = useState("중급"); // '하급', '중급', '상급'
  const [dailyPlayCount, setDailyPlayCount] = useState(0);
  const [omokStats, setOmokStats] = useState(userDoc?.omok);

  useEffect(() => {
    setOmokStats(userDoc?.omok);
  }, [userDoc?.omok]);

  // 로컬 상태를 이용한 낙관적 전적 업데이트
  const localOptimisticOmokUpdate = useCallback((result) => {
    setOmokStats((prevStats) => {
      if (!prevStats) return null;

      const currentWins = prevStats.wins || 0;
      const currentLosses = prevStats.losses || 0;
      const currentRP =
        prevStats.totalRP !== undefined ? prevStats.totalRP : BASE_RP;

      let newWins = currentWins;
      let newLosses = currentLosses;
      let newRP = currentRP;

      if (result === "win") {
        newWins += 1;
        newRP += RP_ON_WIN;
      } else if (result === "loss") {
        newLosses += 1;
        newRP = Math.max(0, newRP - RP_ON_LOSS);
      }

      const newStats = {
        wins: newWins,
        losses: newLosses,
        totalRP: newRP,
      };
      logger.log("[LocalOptimistic] 전적 로컬 업데이트:", newStats);
      return newStats;
    });
  }, []);

  const [showRewardSelection, setShowRewardSelection] = useState(false);
  const [rewardCards, setRewardCards] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const gameIdRef = useRef(gameId);
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);
  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const cleanup = () => {
      const currentGameId = gameIdRef.current;
      const currentGame = gameRef.current;
      const currentUser = userRef.current;
      // 호스트가 나가면 항상 방 삭제 (상태 무관)
      if (
        currentGameId &&
        currentGame &&
        currentUser &&
        currentGame.host === currentUser.uid
      ) {
        deleteDoc(doc(db, "omokGames", currentGameId));
      }
    };
    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
    };
  }, []);

  const createEmptyBoard = () => new Array(BOARD_SIZE * BOARD_SIZE).fill(null);

  const fetchAvailableGames = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const gamesRef = collection(db, "omokGames");
      const q = query(
        gamesRef,
        where("gameStatus", "==", "waiting"),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const games = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAvailableGames(games);
    } catch (err) {
      logger.error("게임 목록 불러오기 오류:", err);
      setError("게임 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // user 의존성 제거 - 필요 시 user는 클로저로 접근

  const deleteGameRoom = async (roomId, e) => {
    e.stopPropagation();
    if (!isAdmin()) {
      logger.error("관리자 권한이 필요합니다.");
      return;
    }
    if (!window.confirm("이 게임방을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, "omokGames", roomId));
      logger.log(`[관리자] 게임방 ${roomId} 삭제 완료`);
      fetchAvailableGames();
    } catch (err) {
      logger.error("게임방 삭제 오류:", err);
      setError("게임방 삭제 중 오류가 발생했습니다.");
    }
  };

  const createGame = async () => {
    if (!user || !userDoc) {
      setError("사용자 정보가 로딩 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    if (gameMode === "ai") {
      if (dailyPlayCount >= 5) {
        setError("하루에 5번만 AI 대전을 할 수 있습니다.");
        return;
      }
    }

    setLoading(true);
    const myName =
      userDoc.name || userDoc.nickname || user.displayName || "익명";
    const myClass = userDoc.classCode || "미설정";
    const myRankDetails = getOmokRankDetails(omokStats);

    const isAiMode = gameMode === "ai";
    const playerColor = "black";
    const aiColor = "white";

    try {
      const newGame = {
        board: createEmptyBoard(),
        players: isAiMode
          ? { [user.uid]: playerColor, AI: aiColor }
          : { [user.uid]: "black" },
        playerNames: isAiMode
          ? { [user.uid]: myName, AI: `AI (${aiDifficulty})` }
          : { [user.uid]: myName },
        playerClasses: { [user.uid]: myClass },
        playerRanks: { [user.uid]: myRankDetails },
        currentPlayer: user.uid,
        winner: null,
        createdAt: serverTimestamp(),
        host: user.uid,
        hostName: myName,
        hostClass: myClass,
        hostRank: myRankDetails.currentRank,
        turnStartTime: serverTimestamp(),
        history: [],
        gameStatus: isAiMode ? "playing" : "waiting",
        statsUpdated: false,
        rematch: {},
        aiMode: isAiMode,
        aiDifficulty: isAiMode ? aiDifficulty : null,
      };

      const gameDocRef = await addDoc(collection(db, "omokGames"), newGame);
      setGameId(gameDocRef.id);

      // 낙관적 업데이트: 게임 객체를 즉시 설정하여 UI가 바로 전환되도록 함
      setGame({
        ...newGame,
        id: gameDocRef.id,
        createdAt: new Date(), // serverTimestamp 대신 임시로 현재 시간
        turnStartTime: new Date(),
      });

      // AI 모드에서는 플레이어가 선공이므로 즉시 isThinking을 true로 설정
      if (isAiMode) {
        setIsThinking(true);
      }

      if (!isAiMode) {
        setCreatedGameId(gameDocRef.id);
      }
      setError("");
      if (refetchGameDataRef.current) refetchGameDataRef.current();
    } catch (err) {
      logger.error("게임 생성 오류:", err);
      setError("게임 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const joinGame = async (id) => {
    if (!user || !userDoc || !id) return;
    setLoading(true);
    setError("");
    const myName =
      userDoc.name || userDoc.nickname || user.displayName || "익명";
    const myClass = userDoc.classCode || "미설정";
    const myRankDetails = getOmokRankDetails(omokStats);

    try {
      const gameDocRef = doc(db, "omokGames", id);
      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameDocRef);
        if (!gameDoc.exists()) throw new Error("존재하지 않는 게임입니다.");
        const gameData = gameDoc.data();
        if (
          Object.keys(gameData.players).length >= 2 &&
          !gameData.players[user.uid]
        )
          throw new Error("이미 가득 찬 방입니다.");
        if (!gameData.players[user.uid]) {
          transaction.update(gameDocRef, {
            players: { ...gameData.players, [user.uid]: "white" },
            playerNames: { ...gameData.playerNames, [user.uid]: myName },
            playerClasses: { ...gameData.playerClasses, [user.uid]: myClass },
            playerRanks: { ...gameData.playerRanks, [user.uid]: myRankDetails },
            gameStatus: "playing",
            turnStartTime: serverTimestamp(),
          });
        }
        setGameId(id);
      });
    } catch (err) {
      logger.error("게임 참가 오류:", err);
      setError(err.message);
      fetchAvailableGames();
    } finally {
      setLoading(false);
    }
  };

  const leaveGame = useCallback(async () => {
    if (!gameId || !game || !user) return;

    const gameDocRef = doc(db, "omokGames", gameId);
    try {
      // 호스트가 떠나는 경우 항상 방 삭제
      if (game.host === user.uid) {
        logger.log("[LeaveGame] 호스트가 방을 떠남 - 방 삭제");

        // 게임 진행 중이고 상대방이 있으면 전적 처리
        if (game.gameStatus === "playing" && !game.winner) {
          const opponentId = Object.keys(game.players).find(
            (p) => p !== user.uid,
          );
          if (opponentId && !game.aiMode) {
            // 호스트 패배, 상대방 승리 처리
            localOptimisticOmokUpdate("loss"); // 로컬 낙관적 업데이트
            await updateUserOmokRecord(user.uid, "loss");
            await updateUserOmokRecord(opponentId, "win");

            const gameStartTime = game.createdAt?.toDate().getTime();
            const shouldAwardCoupon =
              gameStartTime && Date.now() - gameStartTime > 15000;
            if (shouldAwardCoupon && addCouponsToUserById) {
              await addCouponsToUserById(opponentId, 1);
            }
          } else if (game.aiMode) {
            // AI 모드에서는 호스트 패배만 처리
            localOptimisticOmokUpdate("loss"); // 로컬 낙관적 업데이트
            await updateUserOmokRecord(user.uid, "loss");
          }
        }

        // 방 삭제
        await deleteDoc(gameDocRef);
      } else if (
        game.gameStatus === "playing" &&
        game.players[user.uid] &&
        !game.winner
      ) {
        // 호스트가 아닌 플레이어가 게임 중 떠나는 경우
        const opponentId = Object.keys(game.players).find(
          (p) => p !== user.uid,
        );
        if (opponentId) {
          const gameStartTime = game.createdAt?.toDate().getTime();
          const shouldAwardCoupon =
            gameStartTime && Date.now() - gameStartTime > 15000;

          const finalUpdate = {
            winner: opponentId,
            gameStatus: "finished",
            statsUpdated: true,
          };
          if (shouldAwardCoupon) finalUpdate.couponAwardedTo = opponentId;
          await updateDoc(gameDocRef, finalUpdate);

          localOptimisticOmokUpdate("loss"); // 로컬 낙관적 업데이트
          await updateUserOmokRecord(user.uid, "loss");
          await updateUserOmokRecord(opponentId, "win");

          if (shouldAwardCoupon && addCouponsToUserById)
            await addCouponsToUserById(opponentId, 1);
        }
      }
    } catch (error) {
      logger.error("게임 나가기 처리 중 오류 발생:", error);
    } finally {
      setGameId(null);
      setGame(null);
      setError("");
      setCreatedGameId(null);
      setShowWinAnimation(false);
      setSelectedCell(null);
      setGameResult(null);
      setShowRewardSelection(false);
      fetchAvailableGames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, gameId, user, fetchAvailableGames, addCouponsToUserById]);

  const checkForbiddenMove = (board, row, col, player) => false;

  const placeStone = async (row, col) => {
    logger.log("[Player] placeStone 함수 시작:", {
      row,
      col,
      gameId,
      userId: user.uid,
    });

    const boardWithNewStone = [...game.board];
    const myColor = game.players[user.uid];
    boardWithNewStone[getIndex(row, col)] = myColor;

    logger.log("[Player] 내 색:", myColor, "위치:", getIndex(row, col));

    if (myColor === "black") {
      const forbiddenMove = checkForbiddenMove(
        boardWithNewStone,
        row,
        col,
        "black",
      );
      if (forbiddenMove) {
        setError(`금수입니다: ${forbiddenMove}. 다른 곳에 두세요.`);
        setSelectedCell(null);
        logger.log("[Player] 금수로 인해 중단");
        return;
      }
    }

    const winner = checkForWin(boardWithNewStone, row, col, myColor);
    const nextPlayer = Object.keys(game.players).find((p) => p !== user.uid);
    const moveData = { row, col, player: myColor, timestamp: new Date() };
    const newHistory = [...(game.history || []), moveData];

    logger.log("[Player] 승자 체크:", winner, "다음 플레이어:", nextPlayer);

    try {
      const gameDocRef = doc(db, "omokGames", gameId);
      const updateData = {
        board: boardWithNewStone,
        currentPlayer: winner ? null : nextPlayer,
        winner: winner ? user.uid : null,
        history: newHistory,
        turnStartTime: serverTimestamp(),
        gameStatus: winner ? "finished" : "playing",
      };

      if (winner && !game.aiMode) {
        const gameStartTime = game.createdAt?.toDate().getTime();
        const shouldAwardCoupon =
          gameStartTime && Date.now() - gameStartTime > 15000;
        if (shouldAwardCoupon) updateData.couponAwardedTo = user.uid;
      }

      logger.log("[Player] Firestore 업데이트 시작...", updateData);

      // 낙관적 업데이트: Firestore 업데이트 전에 즉시 UI 업데이트
      setGame({
        ...game,
        board: boardWithNewStone,
        currentPlayer: winner ? null : nextPlayer,
        winner: winner ? user.uid : null,
        history: newHistory,
        gameStatus: winner ? "finished" : "playing",
      });
      setLastMove({ row, col });
      setIsThinking(false);
      setSelectedCell(null);

      await updateDoc(gameDocRef, updateData);
      logger.log("[Player] Firestore 업데이트 완료!");

      setError("");

      logger.log("[Player] 플레이어 돌 배치 완료. 다음 차례:", nextPlayer);

      if (winner) {
        if (game.aiMode) {
          // AI 모드에서 승리 시 통계 업데이트 및 보상 카드 표시
          localOptimisticOmokUpdate("win"); // 로컬 낙관적 업데이트
          await updateUserOmokRecord(user.uid, "win");
          await updateDoc(gameDocRef, { statsUpdated: true });
          setGameResult({ outcome: "win", rpChange: RP_ON_WIN });

          const cards = generateRewardCards(game.aiDifficulty);
          setRewardCards(cards);
          setShowRewardSelection(true);
        } else {
          setShowWinAnimation(true);
          if (updateData.couponAwardedTo && addCouponsToUserById) {
            await addCouponsToUserById(user.uid, 1);
          }
        }
      }
    } catch (err) {
      logger.error("움직임 처리 오류:", err);
      setError("움직임을 처리하는 중 오류가 발생했습니다.");
      // 에러 시 다시 내 차례로 설정
      setIsThinking(true);
    }
  };

  const handleCellClick = async (row, col) => {
    logger.log("[Click] 셀 클릭:", { row, col });
    logger.log("[Click] 상태 체크:", {
      hasGame: !!game,
      winner: game?.winner,
      cellValue: getBoardValue(game?.board, row, col),
      currentPlayer: game?.currentPlayer,
      userId: user?.uid,
      isMyTurn: game?.currentPlayer === user?.uid,
      isThinking,
      selectedCell,
    });

    if (
      !game ||
      game.winner ||
      getBoardValue(game.board, row, col) ||
      game.currentPlayer !== user.uid ||
      !isThinking
    ) {
      logger.log("[Click] 클릭 무시됨");
      return;
    }

    // AI 모드가 아닐 때만 2명 체크
    if (!game.aiMode && Object.keys(game.players).length < 2) {
      logger.log("[Click] 플레이어 2명 미만");
      return;
    }

    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
      logger.log("[Click] 두 번째 클릭 - 돌 배치 시작");
      await placeStone(row, col);
      setSelectedCell(null);
    } else {
      logger.log("[Click] 첫 번째 클릭 - 미리보기");
      setSelectedCell({ row, col });
    }
  };

  // 로비 화면 진입 시 1회만 게임 목록 로드 (자동 폴링 제거)
  // 🔥 [최적화] sessionStorage 사용으로 중복 호출 완전 방지
  const hasFetchedGamesRef = useRef(false);
  const lastGameIdRef = useRef(null);

  useEffect(() => {
    // 게임에서 나왔을 때만 플래그 리셋 (gameId가 있었다가 없어진 경우)
    if (lastGameIdRef.current && !gameId) {
      hasFetchedGamesRef.current = false;
    }
    lastGameIdRef.current = gameId;

    // 로비 화면에서만 게임 목록 로드 (한 번만)
    if (user && !gameId && !hasFetchedGamesRef.current) {
      logger.log("[Lobby] 게임 목록 최초 로드");
      fetchAvailableGames();
      hasFetchedGamesRef.current = true;
    }
  }, [user, gameId, fetchAvailableGames]);

  const fetchGameData = useCallback(async () => {
    if (!gameId) return;

    try {
      const gameDocRef = doc(db, "omokGames", gameId);
      const docSnap = await getDoc(gameDocRef);

      if (docSnap.exists()) {
        const gameData = docSnap.data();
        setGame(gameData);

        if (gameData.winner && !gameData.statsUpdated && !gameData.aiMode) {
          // 플레이어 대전 모드에서만 여기서 통계 업데이트
          const winnerId = gameData.winner;
          const loserId = Object.keys(gameData.players).find(
            (p) => p !== winnerId,
          );

          if (loserId) {
            // 로컬 낙관적 업데이트
            if (user.uid === winnerId) {
              localOptimisticOmokUpdate("win");
            } else if (user.uid === loserId) {
              localOptimisticOmokUpdate("loss");
            }

            await updateUserOmokRecord(winnerId, "win");
            await updateUserOmokRecord(loserId, "loss");
            await updateDoc(gameDocRef, { statsUpdated: true });

            if (user.uid === winnerId)
              setGameResult({ outcome: "win", rpChange: RP_ON_WIN });
            else if (user.uid === loserId)
              setGameResult({ outcome: "loss", rpChange: -RP_ON_LOSS });
          }
        }

        const history = gameData.history || [];
        if (history.length > 0)
          setLastMove({
            row: history[history.length - 1].row,
            col: history[history.length - 1].col,
          });

        if (
          gameData.currentPlayer === user.uid &&
          gameData.gameStatus === "playing"
        ) {
          setIsThinking(true);
        } else {
          setIsThinking(false);
          setSelectedCell(null);
        }
      } else {
        setGameId(null);
        setGame(null);
        setError("게임이 종료되었거나 찾을 수 없습니다.");
      }
    } catch (error) {
      logger.error("게임 데이터 로드 오류:", error);
      setError("게임 연결 중 오류가 발생했습니다.");
    }
  }, [gameId, user, localOptimisticOmokUpdate]);

  // 폴링 활성화 조건: 게임 ID가 있고, 게임이 진행 중이며, AI 모드가 아닐 때만
  // AI 모드에서는 로컬에서 즉시 처리하므로 폴링 불필요
  const shouldPoll =
    !!gameId && game?.gameStatus === "playing" && !game?.aiMode;
  const pollingInterval = 30000; // 🔥 [최적화] 10초 → 30초 (읽기 비용 절감)
  const { refetch: refetchGameData } = usePolling(fetchGameData, {
    interval: pollingInterval,
    enabled: shouldPoll,
    deps: [gameId, game?.gameStatus, game?.aiMode],
  });
  useEffect(() => {
    refetchGameDataRef.current = refetchGameData;
  }, [refetchGameData]);

  useEffect(() => {
    if (showWinAnimation) {
      const timer = setTimeout(() => setShowWinAnimation(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showWinAnimation]);

  const handleRematchRequest = async () => {
    if (!gameId || !user) return;
    try {
      await updateDoc(doc(db, "omokGames", gameId), {
        [`rematch.${user.uid}`]: true,
      });
    } catch (err) {
      logger.error("재대결 요청 오류:", err);
      setError("재대결을 요청하는 중 오류가 발생했습니다.");
    }
  };

  const resetGameForRematch = useCallback(async () => {
    if (!game || !game.winner || !gameId) return;

    const playerIds = Object.keys(game.players);
    if (playerIds.length < 2) return;

    const winnerId = game.winner,
      loserId = playerIds.find((p) => p !== winnerId);
    if (!loserId) {
      logger.error("재대결을 위한 패자를 결정할 수 없습니다.");
      return;
    }

    const newPlayers = { [loserId]: "black", [winnerId]: "white" };
    const newCurrentPlayer = loserId;

    try {
      await updateDoc(doc(db, "omokGames", gameId), {
        board: createEmptyBoard(),
        currentPlayer: newCurrentPlayer,
        players: newPlayers,
        winner: null,
        history: [],
        gameStatus: "playing",
        statsUpdated: false,
        turnStartTime: serverTimestamp(),
        couponAwardedTo: null,
        rematch: {},
      });

      setGameResult(null);
      setShowWinAnimation(false);
      setLastMove(null);
      setSelectedCell(null);
      setError("");
    } catch (error) {
      logger.error("재대결 리셋 오류:", error);
      setError("재대결 시작에 실패했습니다.");
    }
  }, [game, gameId]);

  useEffect(() => {
    if (
      game &&
      game.gameStatus === "finished" &&
      game.rematch &&
      user?.uid === game.host &&
      !game.aiMode
    ) {
      const playerIds = Object.keys(game.players);
      if (
        playerIds.length === 2 &&
        game.rematch[playerIds[0]] &&
        game.rematch[playerIds[1]]
      ) {
        resetGameForRematch();
      }
    }
  }, [game, user, resetGameForRematch]);

  // AI 턴 처리 - useRef로 최신 game 참조하여 불필요한 재실행 방지
  const aiTurnProcessedRef = useRef(false);

  useEffect(() => {
    // AI 모드가 아니거나 게임이 없으면 실행하지 않음
    if (!game || !game.aiMode || game.winner || !gameId) {
      aiTurnProcessedRef.current = false;
      return;
    }

    // AI 차례가 아니면 실행하지 않음
    if (game.currentPlayer !== "AI") {
      logger.log("[AI] 현재 차례:", game.currentPlayer, "(AI 아님)");
      setIsAiThinking(false);
      aiTurnProcessedRef.current = false;
      return;
    }

    // 이미 처리 중이면 중복 실행 방지
    if (aiTurnProcessedRef.current) {
      logger.log("[AI] 이미 처리 중 - 중복 실행 방지");
      return;
    }

    logger.log("[AI] AI 차례 시작");
    aiTurnProcessedRef.current = true;
    setIsAiThinking(true);
    const thinkingTime = 500 + Math.random() * 1000;

    const timer = setTimeout(async () => {
      try {
        const aiColor = game.players["AI"];
        logger.log("[AI] AI 색상:", aiColor);

        const bestMove = findBestMove(game.board, aiColor, game.aiDifficulty);
        logger.log("[AI] 최적의 수:", bestMove);

        if (!bestMove) {
          logger.error("[AI] 유효한 수를 찾을 수 없음");
          setIsAiThinking(false);
          aiTurnProcessedRef.current = false;
          return;
        }

        const { r, c } = bestMove;
        const boardWithNewStone = [...game.board];
        boardWithNewStone[getIndex(r, c)] = aiColor;

        const winner = checkForWin(boardWithNewStone, r, c, aiColor);
        const nextPlayer = Object.keys(game.players).find((p) => p !== "AI");
        const moveData = {
          row: r,
          col: c,
          player: aiColor,
          timestamp: new Date(),
        };
        const newHistory = [...(game.history || []), moveData];

        const gameDocRef = doc(db, "omokGames", gameId);
        const updateData = {
          board: boardWithNewStone,
          currentPlayer: winner ? null : nextPlayer,
          winner: winner ? "AI" : null,
          history: newHistory,
          turnStartTime: serverTimestamp(),
          gameStatus: winner ? "finished" : "playing",
        };

        // AI가 이기면 사용자의 패배 기록 업데이트 예약
        if (winner) {
          updateData.statsUpdated = false;
        }

        logger.log("[AI] Firestore 업데이트 시작");

        // 낙관적 업데이트: Firestore 업데이트 전에 즉시 UI 업데이트
        logger.log(
          "[AI] setGame 호출 전 - board[",
          getIndex(r, c),
          "]:",
          boardWithNewStone[getIndex(r, c)],
        );
        setGame((prevGame) => {
          const newGame = {
            ...prevGame,
            board: boardWithNewStone,
            currentPlayer: winner ? null : nextPlayer,
            winner: winner ? "AI" : null,
            history: newHistory,
            gameStatus: winner ? "finished" : "playing",
          };
          logger.log(
            "[AI] setGame 호출 - 새로운 currentPlayer:",
            newGame.currentPlayer,
          );
          logger.log(
            "[AI] setGame 호출 - board[",
            getIndex(r, c),
            "]:",
            newGame.board[getIndex(r, c)],
          );
          return newGame;
        });
        setLastMove({ row: r, col: c });
        setIsAiThinking(false);

        // AI가 돌을 놓고 플레이어 차례가 되면 isThinking을 true로 설정
        if (!winner && nextPlayer === user?.uid) {
          logger.log("[AI] 플레이어 차례로 변경 - isThinking을 true로 설정");
          setIsThinking(true);
        }

        await updateDoc(gameDocRef, updateData);
        logger.log("[AI] 돌 배치 완료:", r, c);

        // AI 승리 시 즉시 사용자 패배 기록 업데이트
        if (winner && user?.uid) {
          localOptimisticOmokUpdate("loss"); // 로컬 낙관적 업데이트
          await updateUserOmokRecord(user.uid, "loss");
          await updateDoc(gameDocRef, { statsUpdated: true });
          setGameResult({ outcome: "loss", rpChange: -RP_ON_LOSS });
          logger.log("[AI] AI 승리 처리 완료");
        }

        setIsAiThinking(false);
        aiTurnProcessedRef.current = false;
      } catch (err) {
        logger.error("[AI] 움직임 처리 오류:", err);
        setIsAiThinking(false);
        aiTurnProcessedRef.current = false;
      }
    }, thinkingTime);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.currentPlayer, game?.aiMode, game?.winner, gameId, user]);

  // 보상 카드 생성
  const generateRewardCards = (difficulty) => {
    const baseCash = { 하급: 1000, 중급: 3000, 상급: 5000 };
    const cashDifficultyBonus = { 하급: 1000, 중급: 2000, 상급: 4000 };
    const couponDifficultyBonus = { 하급: 1, 중급: 2, 상급: 3 };

    const cashAmount =
      baseCash[difficulty] +
      Math.floor(Math.random() * cashDifficultyBonus[difficulty]);
    const couponAmount =
      1 + Math.floor(Math.random() * couponDifficultyBonus[difficulty]);

    return [
      { type: "cash", amount: cashAmount },
      { type: "coupon", amount: couponAmount },
    ].sort(() => Math.random() - 0.5); // 카드를 랜덤으로 섞음
  };

  // 보상 선택 처리
  const handleRewardSelection = async (selectedCard) => {
    if (!user || !gameId) {
      logger.log("[Reward] user 또는 gameId 없음");
      return;
    }

    logger.log("[Reward] 보상 선택:", selectedCard);

    // 낙관적 업데이트: 즉시 UI에 반영
    const today = new Date().toDateString();
    const storageKey = `omokPlayCount_${user.uid}_${today}`;
    const newCount = dailyPlayCount + 1;

    localStorage.setItem(storageKey, newCount.toString());
    setDailyPlayCount(newCount);
    setShowRewardSelection(false);

    setFeedback({
      message:
        selectedCard.type === "cash"
          ? `현금 ${selectedCard.amount.toLocaleString()}원을 획득했습니다!`
          : `쿠폰 ${selectedCard.amount}개를 획득했습니다!`,
      type: "success",
    });

    try {
      // 낙관적 업데이트: 헤더에 즉시 반영
      if (selectedCard.type === "cash") {
        // optimisticUpdate({ cash: selectedCard.amount });
        logger.log("[Reward] 현금 낙관적 업데이트:", selectedCard.amount);
      } else if (selectedCard.type === "coupon") {
        // optimisticUpdate({ coupons: selectedCard.amount });
        logger.log("[Reward] 쿠폰 낙관적 업데이트:", selectedCard.amount);
      }

      // Firestore 업데이트
      if (selectedCard.type === "cash") {
        logger.log("[Reward] 현금 지급:", selectedCard.amount);
        await addCash(selectedCard.amount, "AI 오목 승리 보상");
      } else if (selectedCard.type === "coupon") {
        logger.log("[Reward] 쿠폰 지급:", selectedCard.amount);
        await addCouponsToUserById(user.uid, selectedCard.amount);
      }

      // 🔥 활동 로그 기록 (AI 오목 승리 보상)
      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: user.uid,
        userName: userDoc?.name || "사용자",
        type: ACTIVITY_TYPES.GAME_WIN,
        description: `오목 AI(${game?.aiDifficulty || "중급"}) 승리 - ${selectedCard.type === "cash" ? `현금 ${selectedCard.amount.toLocaleString()}원` : `쿠폰 ${selectedCard.amount}개`} 획득`,
        amount: selectedCard.type === "cash" ? selectedCard.amount : 0,
        couponAmount: selectedCard.type === "coupon" ? selectedCard.amount : 0,
        metadata: {
          gameType: "omok",
          opponent: "AI",
          difficulty: game?.aiDifficulty || "중급",
          rewardType: selectedCard.type,
          rewardAmount: selectedCard.amount,
        },
      });

      logger.log("[Reward] 보상 지급 완료");
      setTimeout(() => leaveGame(), 2000);
    } catch (error) {
      logger.error("[Reward] Error applying reward:", error);
      setFeedback({
        message: "보상 지급에 실패했습니다. 다시 시도해주세요.",
        type: "error",
      });

      // 에러 발생 시 롤백 (플레이 카운트만)
      const rollbackCount = dailyPlayCount;
      localStorage.setItem(storageKey, rollbackCount.toString());
      setDailyPlayCount(rollbackCount);
    }
  };

  const renderBoard = () => {
    const cells = [];
    const starPointCoords = [3, 7, 11];

    // 가로선 그리기 (각 셀의 중심을 지나도록)
    const horizontalLines = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      horizontalLines.push(
        <div
          key={`h-line-${i}`}
          className="grid-line horizontal"
          style={{
            top: `calc((${i} + 0.5) * var(--cell-size))`,
          }}
        />,
      );
    }

    // 세로선 그리기 (각 셀의 중심을 지나도록)
    const verticalLines = [];
    for (let j = 0; j < BOARD_SIZE; j++) {
      verticalLines.push(
        <div
          key={`v-line-${j}`}
          className="grid-line vertical"
          style={{
            left: `calc((${j} + 0.5) * var(--cell-size))`,
          }}
        />,
      );
    }

    for (let i = 0; i < BOARD_SIZE; i++) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        const cellValue = getBoardValue(game.board, i, j);
        const isSelected =
          selectedCell && selectedCell.row === i && selectedCell.col === j;
        const isLastMove = lastMove && lastMove.row === i && lastMove.col === j;
        const isStarPoint =
          starPointCoords.includes(i) && starPointCoords.includes(j);

        cells.push(
          <div
            key={`${i}-${j}`}
            className={`omok-cell ${game.currentPlayer === user.uid && !cellValue ? "clickable" : ""} ${isSelected ? "preview" : ""}`}
            onClick={() => handleCellClick(i, j)}
            style={{
              gridRow: i + 1,
              gridColumn: j + 1,
            }}
          >
            {isStarPoint && <div className="star-point"></div>}
            {cellValue && (
              <div className={`omok-stone ${cellValue}`}>
                {isLastMove && <div className="last-move-indicator"></div>}
              </div>
            )}
          </div>,
        );
      }
    }
    return (
      <div className="omok-board" style={{ "--board-size": BOARD_SIZE }}>
        <div className="grid-lines-container">
          {horizontalLines}
          {verticalLines}
        </div>
        {cells}
      </div>
    );
  };

  useEffect(() => {
    const loadDailyPlayCount = () => {
      if (!user) return;

      const today = new Date().toDateString();
      const storageKey = `omokPlayCount_${user.uid}_${today}`;
      const count = parseInt(localStorage.getItem(storageKey) || "0", 10);
      setDailyPlayCount(count);
    };

    loadDailyPlayCount();
  }, [user]);

  if (!gameId || !game) {
    const myRankDetails = getOmokRankDetails(omokStats);
    return (
      <div className="game-page-container">
        <div className="omok-header">
          <h2>글로벌 오목 게임</h2>
          <p>
            전 세계 모든 플레이어와 함께 두뇌 대결을 펼치고 쿠폰을 획득하세요!
          </p>
          <div className="my-profile">
            <RankDisplay rankDetails={myRankDetails} showProgress={true} />
            <div className="player-info">
              <strong>{userDoc?.name || userDoc?.nickname || "익명"}</strong>
              {userDoc?.classCode && ` (${userDoc.classCode})`}
              {isAdmin() && <span className="admin-badge">[관리자]</span>}
            </div>
          </div>
        </div>

        <div className="omok-lobby">
          <div className="game-mode-selector">
            <h3>게임 모드 선택</h3>
            <div className="mode-options">
              <button
                className={`omok-button ${gameMode === "player" ? "primary" : ""}`}
                onClick={() => setGameMode("player")}
              >
                👥 플레이어 대전
              </button>
              <button
                className={`omok-button ${gameMode === "ai" ? "primary" : ""}`}
                onClick={() => setGameMode("ai")}
              >
                🤖 AI 대전 ({dailyPlayCount}/5)
              </button>
            </div>
          </div>

          {gameMode === "ai" && (
            <div className="ai-difficulty-selector">
              <h3>AI 난이도</h3>
              <div className="difficulty-options">
                <button
                  className={aiDifficulty === "하급" ? "selected" : ""}
                  onClick={() => setAiDifficulty("하급")}
                >
                  😊 하급
                </button>
                <button
                  className={aiDifficulty === "중급" ? "selected" : ""}
                  onClick={() => setAiDifficulty("중급")}
                >
                  🤔 중급
                </button>
                <button
                  className={aiDifficulty === "상급" ? "selected" : ""}
                  onClick={() => setAiDifficulty("상급")}
                >
                  🔥 상급
                </button>
              </div>
            </div>
          )}

          <div className="lobby-section">
            <h3>게임 참여하기</h3>
            <div className="lobby-actions">
              <button
                onClick={createGame}
                className="omok-button primary"
                disabled={loading}
              >
                {loading
                  ? "생성 중..."
                  : gameMode === "ai"
                    ? "AI 대전 시작"
                    : "새 게임 만들기"}
              </button>
              {createdGameId && !error && gameMode === "player" && (
                <div className="omok-success">
                  게임방이 생성되었습니다!{" "}
                  <strong>게임 ID: {createdGameId.slice(-6)}</strong>
                  <br />
                  다른 플레이어가 참가하기를 기다리고 있습니다.
                </div>
              )}
            </div>
          </div>

          {gameMode === "player" && (
            <div className="lobby-section">
              <div className="section-header">
                <h3>🌍 전체 공개방({availableGames.length})</h3>
                <button
                  onClick={fetchAvailableGames}
                  className="omok-button small"
                  disabled={loading}
                >
                  {loading ? "..." : "새로고침"}
                </button>
              </div>
              {availableGames.length > 0 ? (
                <div className="game-rooms">
                  {availableGames.map((gameRoom) => {
                    const hostRankDetails = getOmokRankDetails({
                      wins: gameRoom.hostRank?.wins || 0,
                      losses: gameRoom.hostRank?.losses || 0,
                      totalRP: gameRoom.hostRank?.currentRP || BASE_RP,
                    });
                    return (
                      <div
                        key={gameRoom.id}
                        className="game-room-card"
                        onClick={() => joinGame(gameRoom.id)}
                      >
                        {isAdmin() && (
                          <button
                            className="admin-delete-btn"
                            onClick={(e) => deleteGameRoom(gameRoom.id, e)}
                            title="게임방 삭제"
                          >
                            ✕
                          </button>
                        )}
                        <div className="room-header">
                          <div className="room-host">
                            <RankDisplay
                              rankDetails={hostRankDetails}
                              size="small"
                            />
                            <span className="host-name">
                              {gameRoom.hostName}님의 방
                            </span>
                            <span className="host-class">
                              ({gameRoom.hostClass || "미설정"})
                            </span>
                          </div>
                          <div className="room-id">
                            #{gameRoom.id.slice(-6)}
                          </div>
                        </div>
                        <div className="room-info">
                          <span className="player-count">
                            👥{Object.keys(gameRoom.players).length}/2
                          </span>
                          <span className="room-status global-status">
                            대기중
                          </span>
                        </div>
                        <div className="room-time">
                          {gameRoom.createdAt?.toDate
                            ? gameRoom.createdAt
                                .toDate()
                                .toLocaleTimeString("ko-KR")
                            : "방금 전"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="no-games">
                  {loading
                    ? "게임 목록을 불러오는 중..."
                    : "현재 참가 가능한 게임이 없습니다. 새 게임을 만들어보세요!"}
                </div>
              )}
            </div>
          )}
          {error && <div className="omok-error">{error}</div>}
          {feedback.message && (
            <div className={`feedback ${feedback.type}`}>
              {feedback.message}
            </div>
          )}
        </div>
      </div>
    );
  }
  const myColor = game.players[user.uid];
  const opponentId = Object.keys(game.players).find((p) => p !== user.uid);
  const opponentColor = opponentId ? game.players[opponentId] : null;
  const opponentName = opponentId
    ? game.playerNames?.[opponentId] || "상대"
    : "대기 중...";
  const myRankDetails = game.playerRanks?.[user.uid];
  const opponentRankDetails =
    opponentId === "AI"
      ? null
      : opponentId
        ? game.playerRanks?.[opponentId]
        : null;
  const isMyTurn = game.currentPlayer === user.uid;
  const iRequestedRematch = game.rematch && game.rematch[user.uid];
  const opponentRequestedRematch =
    opponentId && game.rematch && game.rematch[opponentId];

  return (
    <div className="omok-container">
      {showWinAnimation && <div className="win-animation">승리!</div>}

      {showRewardSelection && (
        <div className="reward-modal">
          <div className="reward-content">
            <h3>🎉 승리 보상!</h3>
            <p>하나의 카드를 선택하세요</p>
            <div className="reward-cards">
              {rewardCards.map((card, index) => (
                <div
                  key={index}
                  className="reward-card"
                  onClick={() => handleRewardSelection(card)}
                >
                  <div className="card-icon">
                    {card.type === "cash" ? "💵" : "🎫"}
                  </div>
                  <div className="card-title">
                    {card.type === "cash" ? "현금" : "쿠폰"}
                  </div>
                  <div className="card-amount">
                    {card.type === "cash"
                      ? `${card.amount.toLocaleString()}원`
                      : `${card.amount}개`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="omok-header">
        <h2>{game.aiMode ? "🤖 AI 대전" : "🌍 글로벌 오목 게임"}</h2>
        <div className="game-info">
          <span className="game-id">ID: {gameId.slice(-6)}</span>
          <span className="game-rules">규칙: 렌주룰</span>
          {game.aiMode ? (
            <span className="global-match">난이도: {game.aiDifficulty}</span>
          ) : (
            <span className="global-match">전세계 매칭</span>
          )}
        </div>
      </div>

      <div className="player-status">
        <div
          className={`player-card ${myColor} ${isMyTurn && !game.winner ? "active" : ""}`}
        >
          <div className="player-info">
            <RankDisplay rankDetails={myRankDetails} size="small" />
            <span className="player-name">
              {game.playerNames?.[user.uid] || "나"}
            </span>
            <div className={`stone-indicator ${myColor}`}></div>
          </div>
          {isMyTurn && isThinking && !game.winner && (
            <div className="opponent-thinking">당신 차례</div>
          )}
        </div>

        <div
          className={`player-card ${opponentColor || ""} ${!isMyTurn && !game.winner && opponentId ? "active" : ""}`}
        >
          <div className="player-info">
            {opponentRankDetails && (
              <RankDisplay rankDetails={opponentRankDetails} size="small" />
            )}
            <span className="player-name">{opponentName}</span>
            {opponentColor && (
              <div className={`stone-indicator ${opponentColor}`}></div>
            )}
          </div>
          {((!isMyTurn && opponentId) || isAiThinking) && !game.winner && (
            <div className="opponent-thinking">생각 중...</div>
          )}
        </div>
      </div>

      <div className="omok-board-container">{renderBoard()}</div>

      <div className="omok-status">
        {game.winner ? (
          <div className="winner-announcement">
            {game.winner === "AI"
              ? "AI의 승리!"
              : (game.playerNames?.[game.winner] || "승자") + " 님의 승리!"}
            {gameResult && (
              <span className={`rp-change ${gameResult.outcome}`}>
                ({gameResult.rpChange > 0 ? "+" : ""}
                {gameResult.rpChange} RP)
              </span>
            )}
            <br />
            {!game.aiMode &&
              game.winner === user.uid &&
              game.couponAwardedTo === user.uid &&
              "🎉 쿠폰 1개를 획득했습니다!"}
            {!game.aiMode &&
              game.winner === user.uid &&
              game.couponAwardedTo !== user.uid &&
              "(게임 시간이 15초 미만이라 쿠폰이 지급되지 않았습니다.)"}
          </div>
        ) : (
          <div className="turn-info">
            현재 차례:{" "}
            {isMyTurn
              ? "당신"
              : game.currentPlayer === "AI"
                ? "AI"
                : game.playerNames?.[game.currentPlayer] || "상대"}
            {Object.keys(game.players).length < 2 && !game.aiMode && (
              <div className="waiting-player">
                상대방을 기다리고 있습니다...
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="omok-error">{error}</div>}
      {feedback.message && (
        <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
      )}

      <div className="game-controls">
        {game.gameStatus === "finished" ? (
          <>
            {!game.aiMode && !iRequestedRematch && (
              <button
                onClick={handleRematchRequest}
                className="omok-button primary"
              >
                다시 하기
              </button>
            )}
            <button onClick={leaveGame} className="omok-button secondary">
              로비로 돌아가기
            </button>
          </>
        ) : (
          <button onClick={leaveGame} className="omok-button secondary">
            기권하고 나가기
          </button>
        )}
      </div>

      {!game.aiMode && game.gameStatus === "finished" && (
        <div
          className="rematch-info"
          style={{
            textAlign: "center",
            marginTop: "1rem",
            color: "white",
            fontWeight: 600,
          }}
        >
          {iRequestedRematch && !opponentRequestedRematch && (
            <p>재대결을 요청했습니다. 상대방을 기다립니다...</p>
          )}
          {opponentRequestedRematch && !iRequestedRematch && (
            <p>상대방이 재대결을 원합니다!</p>
          )}
          {iRequestedRematch && opponentRequestedRematch && (
            <p>양쪽 모두 재대결을 원합니다. 잠시 후 게임이 다시 시작됩니다!</p>
          )}
        </div>
      )}
    </div>
  );
};

export default OmokGame;
