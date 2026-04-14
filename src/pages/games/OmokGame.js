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
  onSnapshot,
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

// 강화된 패턴 평가 v2.0 - 갭 패턴 감지 + 포크(복합 위협) 추적
const evaluatePattern = (board, row, col, color) => {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let totalScore = 0;
  let openThrees = 0, closedFours = 0, openFours = 0;

  for (const [dr, dc] of directions) {
    // 앞 방향 연속
    let forward = 0;
    for (let i = 1; i <= 4; i++) {
      if (getBoardValue(board, row + i * dr, col + i * dc) === color) forward++;
      else break;
    }
    // 뒤 방향 연속
    let backward = 0;
    for (let i = 1; i <= 4; i++) {
      if (getBoardValue(board, row - i * dr, col - i * dc) === color) backward++;
      else break;
    }

    const consecutive = forward + backward + 1;

    // 양 끝 상태
    const fEnd = getBoardValue(board, row + (forward + 1) * dr, col + (forward + 1) * dc);
    const bEnd = getBoardValue(board, row - (backward + 1) * dr, col - (backward + 1) * dc);
    let openEnds = 0;
    if (fEnd === null) openEnds++;
    if (bEnd === null) openEnds++;

    // 갭 패턴 감지: 빈칸 하나 너머 추가 돌 (예: OO_O, O_OO)
    let fGap = 0, bGap = 0;
    if (fEnd === null) {
      for (let i = forward + 2; i <= 5; i++) {
        if (getBoardValue(board, row + i * dr, col + i * dc) === color) fGap++;
        else break;
      }
    }
    if (bEnd === null) {
      for (let i = backward + 2; i <= 5; i++) {
        if (getBoardValue(board, row - i * dr, col - i * dc) === color) bGap++;
        else break;
      }
    }

    // 5목
    if (consecutive >= 5) { totalScore += 100000000; continue; }

    // 갭으로 5목 가능 (OO_OO 등)
    if (fGap > 0 && consecutive + fGap >= 5) { totalScore += 100000000; continue; }
    if (bGap > 0 && consecutive + bGap >= 5) { totalScore += 100000000; continue; }

    // 갭 4 (XX_X, X_XX) - 한 수로 4목 완성
    if (fGap > 0 && consecutive + fGap === 4) totalScore += 80000;
    if (bGap > 0 && consecutive + bGap === 4) totalScore += 80000;

    // 연속 패턴 (점수 대폭 상향)
    if (consecutive === 4) {
      if (openEnds === 2) { totalScore += 1000000; openFours++; }
      else if (openEnds === 1) { totalScore += 100000; closedFours++; }
    } else if (consecutive === 3) {
      if (openEnds === 2) { totalScore += 50000; openThrees++; }
      else if (openEnds === 1) totalScore += 5000;
    } else if (consecutive === 2) {
      if (openEnds === 2) totalScore += 1000;
      else if (openEnds === 1) totalScore += 100;
    } else if (consecutive === 1) {
      if (openEnds === 2) totalScore += 50;
    }
  }

  // 포크(복합 위협) 보너스 - 동시에 두 개 이상의 위협
  if (openFours >= 1) totalScore += 1000000;
  if (openThrees >= 2) totalScore += 500000;   // 쌍삼 (거의 필승)
  if (openThrees >= 1 && closedFours >= 1) totalScore += 400000; // 삼사
  if (closedFours >= 2) totalScore += 300000;  // 쌍사

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

// 후보수 생성 (기존 돌 주변 빈칸)
const generateCandidateMoves = (board, range) => {
  const moves = [];
  const checked = new Set();
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    if (!board[i]) continue;
    const sr = Math.floor(i / BOARD_SIZE), sc = i % BOARD_SIZE;
    for (let dr = -range; dr <= range; dr++) {
      for (let dc = -range; dc <= range; dc++) {
        const r = sr + dr, c = sc + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
        const key = r * BOARD_SIZE + c;
        if (!board[key] && !checked.has(key)) {
          moves.push({ r, c });
          checked.add(key);
        }
      }
    }
  }
  return moves;
};

const findBestMove = (board, aiColor, difficulty) => {
  // 돌 수 세기
  let stoneCount = 0;
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) { if (board[i]) stoneCount++; }

  // 첫 수: 중앙 근처
  if (stoneCount <= 1) {
    const center = Math.floor(BOARD_SIZE / 2);
    const opts = [
      { r: center, c: center }, { r: center + 1, c: center },
      { r: center, c: center + 1 }, { r: center + 1, c: center + 1 },
      { r: center - 1, c: center }, { r: center, c: center - 1 },
    ];
    for (const m of opts) { if (!board[getIndex(m.r, m.c)]) return m; }
  }

  const oppColor = aiColor === "black" ? "white" : "black";
  const searchRange = difficulty === "초급" ? 2 : 3;
  const possibleMoves = generateCandidateMoves(board, searchRange);

  if (possibleMoves.length === 0) {
    const e = board.findIndex((c) => c === null);
    if (e !== -1) return { r: Math.floor(e / BOARD_SIZE), c: e % BOARD_SIZE };
    return null;
  }

  // === 1순위: 즉시 승리 ===
  for (const m of possibleMoves) {
    const tb = [...board]; tb[getIndex(m.r, m.c)] = aiColor;
    if (checkForWin(tb, m.r, m.c, aiColor)) return m;
  }

  // === 2순위: 상대 승리 막기 ===
  for (const m of possibleMoves) {
    const tb = [...board]; tb[getIndex(m.r, m.c)] = oppColor;
    if (checkForWin(tb, m.r, m.c, oppColor)) return m;
  }

  // === 모든 후보수 공격/방어 점수 계산 ===
  const center = Math.floor(BOARD_SIZE / 2);
  const scored = possibleMoves.map((m) => {
    const idx = getIndex(m.r, m.c);
    const tb = [...board];
    tb[idx] = aiColor;
    const attack = evaluatePattern(tb, m.r, m.c, aiColor);
    tb[idx] = oppColor;
    const defense = evaluatePattern(tb, m.r, m.c, oppColor);
    const centerDist = Math.abs(m.r - center) + Math.abs(m.c - center);
    const centerBonus = (BOARD_SIZE * 2 - centerDist) * 10;
    return { ...m, attack, defense, centerBonus };
  });

  // === 3순위: 내 포크/열린 4 만들기 ===
  const myBigAttacks = scored.filter((m) => m.attack >= 300000);
  if (myBigAttacks.length > 0) {
    myBigAttacks.sort((a, b) => b.attack - a.attack);
    return { r: myBigAttacks[0].r, c: myBigAttacks[0].c };
  }

  // === 4순위: 상대 큰 위협 막기 (열린 4, 포크, 닫힌 4) ===
  const oppBigThreats = scored.filter((m) => m.defense >= 100000);
  if (oppBigThreats.length > 0) {
    // 막으면서 동시에 공격하는 수 우선
    oppBigThreats.sort((a, b) => (b.defense + b.attack * 0.3) - (a.defense + a.attack * 0.3));
    return { r: oppBigThreats[0].r, c: oppBigThreats[0].c };
  }

  // === 5순위: 내 열린 3 만들기 ===
  const myOpenThrees = scored.filter((m) => m.attack >= 50000);
  if (myOpenThrees.length > 0 && (difficulty !== "초급" || Math.random() < 0.5)) {
    myOpenThrees.sort((a, b) => b.attack - a.attack);
    return { r: myOpenThrees[0].r, c: myOpenThrees[0].c };
  }

  // === 6순위: 상대 열린 3 막기 ===
  const oppOpenThrees = scored.filter((m) => m.defense >= 50000);
  if (oppOpenThrees.length > 0) {
    const blockRate = difficulty === "상급" ? 1.0 : difficulty === "중급" ? 0.95 : 0.5;
    if (Math.random() < blockRate) {
      oppOpenThrees.sort((a, b) => (b.defense + b.attack * 0.3) - (a.defense + a.attack * 0.3));
      return { r: oppOpenThrees[0].r, c: oppOpenThrees[0].c };
    }
  }

  // === 7순위: 상대 닫힌 위협 막기 ===
  if (difficulty !== "초급") {
    const oppClosedThreats = scored.filter((m) => m.defense >= 5000);
    if (oppClosedThreats.length > 0) {
      const blockRate = difficulty === "상급" ? 0.95 : 0.7;
      if (Math.random() < blockRate) {
        oppClosedThreats.sort((a, b) => (b.defense + b.attack * 0.3) - (a.defense + a.attack * 0.3));
        return { r: oppClosedThreats[0].r, c: oppClosedThreats[0].c };
      }
    }
  }

  // === 8순위: 최적 수 선택 (난이도별 lookahead) ===
  if (difficulty === "상급") {
    // 상급: 2단계 lookahead - 내 수 → 상대 최선응 → 내 후속
    const candidates = scored
      .map((m) => ({ ...m, combined: m.attack * 1.1 + m.defense * 1.05 + m.centerBonus }))
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 12);

    let best = candidates[0], bestNet = -Infinity;
    for (const cand of candidates) {
      const nb = [...board];
      nb[getIndex(cand.r, cand.c)] = aiColor;
      // 상대 최선응 시뮬레이션
      const oppMoves = generateCandidateMoves(nb, 2);
      let worstOppThreat = 0;
      let bestOppMove = null;
      for (const om of oppMoves) {
        const tb2 = [...nb]; tb2[getIndex(om.r, om.c)] = oppColor;
        const s = evaluatePattern(tb2, om.r, om.c, oppColor);
        if (s > worstOppThreat) { worstOppThreat = s; bestOppMove = om; }
      }
      // 상대 최선응 후 내 후속 최고수
      let ourBestFollow = 0;
      if (bestOppMove) {
        const nb2 = [...nb]; nb2[getIndex(bestOppMove.r, bestOppMove.c)] = oppColor;
        const followMoves = generateCandidateMoves(nb2, 2);
        for (const fm of followMoves) {
          const tb3 = [...nb2]; tb3[getIndex(fm.r, fm.c)] = aiColor;
          ourBestFollow = Math.max(ourBestFollow, evaluatePattern(tb3, fm.r, fm.c, aiColor));
        }
      }
      const netScore = cand.attack * 1.1 + cand.defense * 0.5 - worstOppThreat * 0.8 + ourBestFollow * 0.3 + cand.centerBonus;
      if (netScore > bestNet) { bestNet = netScore; best = cand; }
    }
    return { r: best.r, c: best.c };

  } else if (difficulty === "중급") {
    // 중급: 1단계 lookahead - 내 수 → 상대 최선응
    const candidates = scored
      .map((m) => ({ ...m, combined: m.attack + m.defense * 0.95 + m.centerBonus }))
      .sort((a, b) => b.combined - a.combined)
      .slice(0, 8);

    let best = candidates[0], bestNet = -Infinity;
    for (const cand of candidates) {
      const nb = [...board];
      nb[getIndex(cand.r, cand.c)] = aiColor;
      const oppMoves = generateCandidateMoves(nb, 2);
      let worstOppThreat = 0;
      for (const om of oppMoves) {
        const tb2 = [...nb]; tb2[getIndex(om.r, om.c)] = oppColor;
        worstOppThreat = Math.max(worstOppThreat, evaluatePattern(tb2, om.r, om.c, oppColor));
      }
      const netScore = cand.attack + cand.defense * 0.5 - worstOppThreat * 0.6 + cand.centerBonus;
      if (netScore > bestNet) { bestNet = netScore; best = cand; }
    }
    // 5% 실수 확률
    if (Math.random() < 0.05 && candidates.length > 1) best = candidates[1];
    return { r: best.r, c: best.c };

  } else {
    // 초급: 휴리스틱 + 적당한 노이즈 (너무 멍청하지 않게)
    const candidates = scored
      .map((m) => ({
        ...m,
        combined: m.attack * 0.9 + m.defense * 0.7 + m.centerBonus + (Math.random() - 0.5) * 600,
      }))
      .sort((a, b) => b.combined - a.combined);
    // 상위 3개 중 랜덤 선택
    const pick = Math.floor(Math.random() * Math.min(3, candidates.length));
    return { r: candidates[pick].r, c: candidates[pick].c };
  }
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
  const [joinRoomCode, setJoinRoomCode] = useState("");
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

  // 🔥 호스트 heartbeat: 대기 중일 때 30초마다 lastHeartbeat 갱신
  // stale 감지 + 유령 방 자동 정리를 위한 프레즌스 시스템
  useEffect(() => {
    if (!gameId || !user || !game) return;
    if (game.gameStatus !== "waiting") return;
    if (game.host !== user.uid) return;
    if (game.aiMode) return;

    const tick = async () => {
      try {
        await updateDoc(doc(db, "omokGames", gameId), {
          lastHeartbeat: serverTimestamp(),
        });
      } catch (err) {
        logger.warn("[omok heartbeat] 갱신 실패:", err?.message);
      }
    };
    // 즉시 1회 + 30초 주기
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [gameId, user, game]);

  const createEmptyBoard = () => new Array(BOARD_SIZE * BOARD_SIZE).fill(null);

  const fetchAvailableGames = useCallback(async () => {
    if (!user) return;
    try {
      const gamesRef = collection(db, "omokGames");
      const q = query(
        gamesRef,
        where("gameStatus", "==", "waiting"),
        orderBy("createdAt", "desc"),
      );

      const querySnapshot = await getDocs(q);
      const nowMs = Date.now();
      const STALE_MS = 90 * 1000; // 90초 이상 heartbeat 없음 = 유령 방
      const games = querySnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((g) => {
          // heartbeat 기반 (신규 방): lastHeartbeat 90초 이내면 표시
          const hb = g.lastHeartbeat?.toDate?.()?.getTime?.();
          if (hb) return nowMs - hb < STALE_MS;
          // 구 방(heartbeat 필드 없음): createdAt 기반으로 3분 이내만 표시
          const created = g.createdAt?.toDate?.()?.getTime?.();
          if (created) return nowMs - created < 3 * 60 * 1000;
          return false; // 둘 다 없으면 숨김
        });
      setAvailableGames(games);
    } catch (err) {
      logger.error("게임 목록 불러오기 오류:", err);
    }
  }, [user]);

  // 로비 게임 목록: 초기 로드 + 10초 자동갱신 (onSnapshot 대신 폴링으로 DB 비용 절감)
  useEffect(() => {
    if (!user || gameId) return;
    fetchAvailableGames();
    const interval = setInterval(fetchAvailableGames, 10000);
    return () => clearInterval(interval);
  }, [user, gameId, fetchAvailableGames]);

  // [멀티플레이어] 게임 데이터 실시간 리스너 (게임 참가 후 상태 변경 감지)
  useEffect(() => {
    if (!gameId || !user) return;
    // AI 모드에서는 실시간 리스너 불필요
    if (game?.aiMode) return;

    logger.log("[GameListener] 게임 데이터 실시간 리스너 등록:", gameId);
    const gameDocRef = doc(db, "omokGames", gameId);
    const unsubscribe = onSnapshot(gameDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const gameData = docSnap.data();
        logger.log("[GameListener] 게임 데이터 수신:", {
          gameStatus: gameData.gameStatus,
          currentPlayer: gameData.currentPlayer,
          playerCount: Object.keys(gameData.players).length,
        });
        setGame(gameData);

        // 승리 처리
        if (gameData.winner && !gameData.statsUpdated && !gameData.aiMode) {
          const winnerId = gameData.winner;
          const loserId = Object.keys(gameData.players).find(
            (p) => p !== winnerId,
          );

          if (loserId) {
            if (user.uid === winnerId) {
              localOptimisticOmokUpdate("win");
              setGameResult({ outcome: "win", rpChange: RP_ON_WIN });
            } else if (user.uid === loserId) {
              localOptimisticOmokUpdate("loss");
              setGameResult({ outcome: "loss", rpChange: -RP_ON_LOSS });
            }

            // 호스트만 통계 업데이트 실행 (중복 방지)
            if (user.uid === gameData.host) {
              updateUserOmokRecord(winnerId, "win");
              updateUserOmokRecord(loserId, "loss");
              updateDoc(gameDocRef, { statsUpdated: true });
            }
          }
        }

        // 마지막 수 표시
        const history = gameData.history || [];
        if (history.length > 0) {
          setLastMove({
            row: history[history.length - 1].row,
            col: history[history.length - 1].col,
          });
        }

        // 내 차례 여부에 따라 isThinking 설정
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
        // 게임이 삭제됨 (상대방이 방을 나감)
        setGameId(null);
        setGame(null);
        setError("게임이 종료되었거나 찾을 수 없습니다.");
      }
    }, (err) => {
      logger.error("[GameListener] 게임 데이터 리스너 오류:", err);
      setError("게임 연결 중 오류가 발생했습니다.");
    });

    return () => {
      logger.log("[GameListener] 게임 데이터 리스너 해제:", gameId);
      unsubscribe();
    };
  }, [gameId, user, game?.aiMode, localOptimisticOmokUpdate]);

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
        lastHeartbeat: serverTimestamp(), // 호스트 대기 중 heartbeat 기반 stale 감지
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
      });
      // 트랜잭션 성공 후에 gameId 설정 (트랜잭션 내부에서 하면 재시도 시 문제)
      // 참가 후 즉시 게임 데이터를 로드하여 UI 전환
      const updatedDoc = await getDoc(doc(db, "omokGames", id));
      if (updatedDoc.exists()) {
        setGame(updatedDoc.data());
      }
      setGameId(id);
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

  // (로비 폴링은 위의 useEffect에서 처리 - 10초 자동갱신)

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

  // 폴링 비활성화: 멀티플레이어는 onSnapshot 실시간 리스너 사용, AI 모드는 로컬 처리
  // onSnapshot이 모든 실시간 업데이트를 처리하므로 폴링 불필요
  const shouldPoll = false;
  const pollingInterval = 30000;
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
    const winRate = omokStats.wins + omokStats.losses > 0
      ? Math.round((omokStats.wins / (omokStats.wins + omokStats.losses)) * 100)
      : 0;
    return (
      <div className="game-page-container">
        {/* 히어로 헤더: 타이틀 + 랭크 통합 */}
        <div className="omok-hero">
          <div className="omok-hero-left">
            <h2 className="omok-hero-title">🌍 글로벌 오목 게임</h2>
            <p className="omok-hero-sub">두뇌 대결을 펼치고 쿠폰을 획득하세요!</p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: '#0f172a',
              borderRadius: 14,
              padding: '10px 18px',
              border: '2px solid rgba(255, 255, 255, 0.35)',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                backgroundColor: myRankDetails?.currentRank?.color || '#6366f1',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
                flexShrink: 0,
              }}
            >
              {myRankDetails?.currentRank?.icon || '🏅'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 }}>
              <span
                style={{
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '1rem',
                  letterSpacing: '0.5px',
                }}
              >
                {myRankDetails?.currentRank?.title || 'Unranked'}
              </span>
              <span style={{ color: '#ffffff', fontSize: '0.8rem', fontWeight: 700 }}>
                {(myRankDetails?.currentRP || 0).toLocaleString()} RP
              </span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem' }}>
                {omokStats.wins}승 {omokStats.losses}패 ({winRate}%)
              </span>
            </div>
          </div>
        </div>

        <div className="omok-lobby-new">
          {/* 설정 행: 게임모드 + 액션 */}
          <div className="omok-settings-row">
            {/* 게임 모드 */}
            <div className="omok-setting-card">
              <span className="omok-setting-label">게임 모드</span>
              <div className="omok-setting-opts">
                <button
                  className={`omok-opt-btn ${gameMode === "player" ? "active" : ""}`}
                  onClick={() => setGameMode("player")}
                >
                  👥 플레이어
                </button>
                <button
                  className={`omok-opt-btn ${gameMode === "ai" ? "active" : ""}`}
                  onClick={() => setGameMode("ai")}
                >
                  🤖 AI ({dailyPlayCount}/5)
                </button>
              </div>
            </div>

            {/* AI 난이도 (AI일 때만) */}
            {gameMode === "ai" && (
              <div className="omok-setting-card omok-ai-card">
                <span className="omok-setting-label omok-ai-label">AI 난이도</span>
                <div className="omok-setting-opts">
                  {["하급", "중급", "상급"].map((d) => (
                    <button
                      key={d}
                      className={`omok-opt-btn ${aiDifficulty === d ? "active" : ""}`}
                      onClick={() => setAiDifficulty(d)}
                    >
                      {d === "하급" ? "😊" : d === "중급" ? "🤔" : "🔥"} {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 액션 행: 방 만들기 + 코드 참가 */}
          <div className="omok-action-row">
            <button
              onClick={createGame}
              className="omok-create-btn"
              disabled={loading}
            >
              {loading
                ? "생성 중..."
                : gameMode === "ai"
                  ? "🤖 AI 대전 시작"
                  : "🎮 새 게임 만들기"}
            </button>
            {gameMode === "player" && (
              <div className="omok-join-group">
                <input
                  type="text"
                  value={joinRoomCode}
                  onChange={(e) => setJoinRoomCode(e.target.value)}
                  placeholder="방 코드"
                  maxLength="6"
                  className="omok-code-input"
                />
                <button
                  className="omok-join-btn"
                  disabled={loading || !joinRoomCode.trim()}
                  onClick={async () => {
                    const code = joinRoomCode.trim();
                    if (!code) return;
                    let matchId = null;
                    try {
                      const gamesRef = collection(db, "omokGames");
                      const q = query(gamesRef, where("gameStatus", "==", "waiting"));
                      const snap = await getDocs(q);
                      for (const d of snap.docs) {
                        if (d.id === code || d.id.endsWith(code)) {
                          matchId = d.id;
                          break;
                        }
                      }
                    } catch (e) {
                      logger.error("방 코드 검색 오류:", e);
                    }
                    if (matchId) {
                      joinGame(matchId);
                      setJoinRoomCode("");
                    } else {
                      setError("해당 코드의 대기 중인 방을 찾을 수 없습니다.");
                    }
                  }}
                >
                  참가
                </button>
              </div>
            )}
          </div>

          {/* 방 생성 알림 */}
          {createdGameId && !error && gameMode === "player" && (
            <div className="omok-created-notice">
              게임방 생성 완료!{" "}
              <strong
                style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline", letterSpacing: 2 }}
                onClick={() => {
                  navigator.clipboard.writeText(createdGameId);
                  setFeedback({ message: "방 코드가 복사되었습니다!", type: "success" });
                }}
              >
                코드: {createdGameId.slice(-6)}
              </strong>
              {" "}— 상대 대기 중
            </div>
          )}

          {error && <div className="omok-error">{error}</div>}
          {feedback.message && (
            <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
          )}

          {/* 대기방 목록 */}
          {gameMode === "player" && (
            <div className="omok-rooms-section">
              <div className="omok-rooms-header">
                <h3>🌍 공개방 ({availableGames.length})</h3>
                <button
                  onClick={fetchAvailableGames}
                  className="omok-refresh-btn"
                  disabled={loading}
                >
                  {loading ? "..." : "↻ 새로고침"}
                </button>
              </div>
              {availableGames.length > 0 ? (
                <div className="omok-rooms-grid">
                  {availableGames.map((gameRoom) => {
                    const hostRankDetails = getOmokRankDetails({
                      wins: gameRoom.hostRank?.wins || 0,
                      losses: gameRoom.hostRank?.losses || 0,
                      totalRP: gameRoom.hostRank?.currentRP || BASE_RP,
                    });
                    return (
                      <div
                        key={gameRoom.id}
                        className="omok-room-card"
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
                        <div className="omok-room-top">
                          <div className="omok-room-rank-dot" style={{ backgroundColor: hostRankDetails?.currentRank?.color || '#6366f1' }}>
                            {hostRankDetails?.currentRank?.icon || '🏅'}
                          </div>
                          <div className="omok-room-host-info">
                            <span className="omok-room-host-name">{gameRoom.hostName}</span>
                            <span className="omok-room-host-class">{gameRoom.hostClass || "미설정"}</span>
                          </div>
                          <span className="omok-room-code">#{gameRoom.id.slice(-6)}</span>
                        </div>
                        <div className="omok-room-bottom">
                          <span>👥 {Object.keys(gameRoom.players).length}/2</span>
                          <span className="omok-room-status">대기중</span>
                          <span className="omok-room-time">
                            {gameRoom.createdAt?.toDate
                              ? gameRoom.createdAt.toDate().toLocaleTimeString("ko-KR", { hour: '2-digit', minute: '2-digit' })
                              : "방금 전"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="omok-no-games">
                  {loading
                    ? "게임 목록을 불러오는 중..."
                    : "참가 가능한 게임이 없습니다. 새 게임을 만들어보세요!"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 멀티플레이어 대기 화면 (상대방 참가 대기 중)
  if (game.gameStatus === "waiting" && !game.aiMode) {
    return (
      <div className="game-page-container">
        <div className="omok-container">
          <div className="omok-header">
            <h2>상대방 대기 중...</h2>
          </div>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 16, padding: "40px 20px", textAlign: "center",
          }}>
            <div style={{
              width: 48, height: 48, border: "3px solid #60a5fa",
              borderTopColor: "transparent", borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }} />
            <p style={{ color: "#94a3b8", fontSize: 15 }}>
              친구에게 아래 방 코드를 공유해주세요!
            </p>
            <div
              style={{
                fontSize: 28, fontWeight: "bold", color: "var(--accent)",
                cursor: "pointer", letterSpacing: 4, padding: "12px 24px",
                background: "rgba(99, 102, 241, 0.1)", borderRadius: 12,
                border: "1px solid rgba(99, 102, 241, 0.3)",
              }}
              onClick={() => {
                navigator.clipboard.writeText(gameId);
                setFeedback({ message: "방 코드가 복사되었습니다!", type: "success" });
              }}
              title="클릭하여 복사"
            >
              {gameId.slice(-6)}
            </div>
            <p style={{ color: "#64748b", fontSize: 12 }}>
              코드를 클릭하면 복사됩니다
            </p>
            <button
              className="omok-button"
              onClick={leaveGame}
              style={{ marginTop: 16 }}
            >
              나가기
            </button>
            {feedback.message && (
              <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
            )}
          </div>
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
