// src/ChessGame.js
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  lazy,
} from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  db,
  doc,
  setDoc,
  getDoc,
  runTransaction,
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  onSnapshot,
} from "../../firebase";
import { logActivity, ACTIVITY_TYPES } from "../../utils/firestoreHelpers";
import "./ChessGame.css";
import { AlchanLoading } from "../../components/AlchanLayout";
import { logger } from "../../utils/logger";

// 3D 보드 지연 로딩 (ChunkLoadError 방지)
function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch(() => {
      const reloaded = sessionStorage.getItem("chunk_reload");
      if (reloaded) {
        sessionStorage.removeItem("chunk_reload");
        return importFn();
      }
      sessionStorage.setItem("chunk_reload", "1");
      window.location.reload();
      return new Promise(() => {});
    }),
  );
}
const Chess3DCanvas = lazyWithRetry(() => import("./Chess3DBoard"));

const PIECES = {
  wK: "♔",
  wQ: "♕",
  wR: "♖",
  wB: "♗",
  wN: "♘",
  wP: "♙",
  bK: "♚",
  bQ: "♛",
  bR: "♜",
  bB: "♝",
  bN: "♞",
  bP: "♟",
};

const RANKS = [
  { name: "Unranked", minPoints: 0 },
  { name: "C", minPoints: 800 },
  { name: "B", minPoints: 1000 },
  { name: "A", minPoints: 1200 },
  { name: "S", minPoints: 1400 },
  { name: "SS", minPoints: 1600 },
];

const RATING_CHANGE = { WIN: 15, LOSS: -10, MIN_RATING: 800 };

const getRankInfo = (points = 0) => {
  let currentRank = RANKS[0];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (points >= RANKS[i].minPoints) {
      currentRank = RANKS[i];
      break;
    }
  }
  const nextRankIndex = RANKS.findIndex((r) => r.name === currentRank.name) + 1;
  const nextRank = nextRankIndex < RANKS.length ? RANKS[nextRankIndex] : null;
  const pointsForNextRank = nextRank ? nextRank.minPoints - points : 0;

  return {
    rank: currentRank.name,
    nextRank: nextRank?.name,
    pointsForNextRank: pointsForNextRank,
  };
};

const getInitialBoard = () => {
  return [
    ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
    ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
    ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
  ];
};

const serializeBoard = (board) => {
  const serialized = {};
  board.forEach((row, rIndex) => {
    row.forEach((cell, cIndex) => {
      if (cell) {
        serialized[`${rIndex}-${cIndex}`] = cell;
      }
    });
  });
  return serialized;
};

const deserializeBoard = (serializedBoard) => {
  const board = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));
  for (const key in serializedBoard) {
    const [r, c] = key.split("-").map(Number);
    board[r][c] = serializedBoard[key];
  }
  return board;
};

// ===== 순수 함수 기반 체스 로직 (순환 참조 해결) =====

// 특정 칸이 공격받는지 확인 (checkForCheck 없이 원시 이동만 사용)
const isSquareAttackedPure = (board, row, col, byColor) => {
  // 폰 공격 체크
  const pawnDir = byColor === "w" ? 1 : -1; // 공격하는 색의 폰 방향
  for (const dc of [-1, 1]) {
    const pr = row + pawnDir;
    const pc = col + dc;
    if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
      const p = board[pr][pc];
      if (p && p[0] === byColor && p[1] === "P") return true;
    }
  }

  // 나이트 공격
  const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightMoves) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const p = board[r][c];
      if (p && p[0] === byColor && p[1] === "N") return true;
    }
  }

  // 킹 공격 (인접)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = board[r][c];
        if (p && p[0] === byColor && p[1] === "K") return true;
      }
    }
  }

  // 직선 방향 (룩, 퀸)
  const straightDirs = [[0,1],[0,-1],[1,0],[-1,0]];
  for (const [dr, dc] of straightDirs) {
    for (let i = 1; i < 8; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= 8 || c < 0 || c >= 8) break;
      const p = board[r][c];
      if (p) {
        if (p[0] === byColor && (p[1] === "R" || p[1] === "Q")) return true;
        break;
      }
    }
  }

  // 대각선 방향 (비숍, 퀸)
  const diagDirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [dr, dc] of diagDirs) {
    for (let i = 1; i < 8; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= 8 || c < 0 || c >= 8) break;
      const p = board[r][c];
      if (p) {
        if (p[0] === byColor && (p[1] === "B" || p[1] === "Q")) return true;
        break;
      }
    }
  }

  return false;
};

// 킹이 체크 상태인지 확인
const isInCheckPure = (board, color) => {
  let kingRow = -1, kingCol = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === color + "K") {
        kingRow = r;
        kingCol = c;
        break;
      }
    }
    if (kingRow >= 0) break;
  }
  if (kingRow < 0) return false;
  const opponentColor = color === "w" ? "b" : "w";
  return isSquareAttackedPure(board, kingRow, kingCol, opponentColor);
};

// 유효한 이동 계산 (순수 함수 - castling/enPassant 정보를 인자로 받음)
const getValidMovesPure = (board, row, col, piece, castling, enPassant, checkForCheck = true) => {
  const moves = [];
  const color = piece[0];
  const type = piece[1];

  const addMove = (r, c) => {
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const target = board[r][c];
      if (!target || target[0] !== color) {
        if (checkForCheck) {
          const testBoard = board.map((row) => [...row]);
          testBoard[r][c] = piece;
          testBoard[row][col] = null;
          // 앙파상 캡처
          if (type === "P" && enPassant && r === enPassant[0] && c === enPassant[1]) {
            testBoard[row][c] = null;
          }
          if (!isInCheckPure(testBoard, color)) {
            moves.push([r, c]);
          }
        } else {
          moves.push([r, c]);
        }
      }
    }
  };

  switch (type) {
    case "P": {
      const direction = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;

      if (row + direction >= 0 && row + direction < 8 && !board[row + direction][col]) {
        addMove(row + direction, col);
        if (row === startRow && !board[row + 2 * direction][col]) {
          addMove(row + 2 * direction, col);
        }
      }

      [-1, 1].forEach((dc) => {
        if (row + direction >= 0 && row + direction < 8 && col + dc >= 0 && col + dc < 8) {
          const target = board[row + direction][col + dc];
          if (target && target[0] !== color) {
            addMove(row + direction, col + dc);
          }
        }
      });

      // 앙파상
      if (enPassant) {
        const [epRow, epCol] = enPassant;
        if (row + direction === epRow && Math.abs(col - epCol) === 1) {
          addMove(epRow, epCol);
        }
      }
      break;
    }

    case "N":
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr, dc]) => {
        addMove(row + dr, col + dc);
      });
      break;

    case "B":
    case "R":
    case "Q": {
      const directions = {
        B: [[1,1],[1,-1],[-1,1],[-1,-1]],
        R: [[0,1],[0,-1],[1,0],[-1,0]],
        Q: [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]],
      }[type];

      directions.forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
          const r = row + dr * i;
          const c = col + dc * i;
          if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            if (!board[r][c]) {
              addMove(r, c);
            } else {
              if (board[r][c][0] !== color) addMove(r, c);
              break;
            }
          } else break;
        }
      });
      break;
    }

    case "K":
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr, dc]) => {
        addMove(row + dr, col + dc);
      });

      // 캐슬링
      if (checkForCheck && castling) {
        const kingRow = color === "w" ? 7 : 0;
        const opponentColor = color === "w" ? "b" : "w";
        if (row === kingRow && col === 4) {
          // 킹사이드 캐슬링
          if (
            castling[color + "K"] &&
            !board[kingRow][5] &&
            !board[kingRow][6] &&
            board[kingRow][7] === color + "R"
          ) {
            if (
              !isSquareAttackedPure(board, kingRow, 4, opponentColor) &&
              !isSquareAttackedPure(board, kingRow, 5, opponentColor) &&
              !isSquareAttackedPure(board, kingRow, 6, opponentColor)
            ) {
              moves.push([kingRow, 6]);
            }
          }
          // 퀸사이드 캐슬링
          if (
            castling[color + "Q"] &&
            !board[kingRow][3] &&
            !board[kingRow][2] &&
            !board[kingRow][1] &&
            board[kingRow][0] === color + "R"
          ) {
            if (
              !isSquareAttackedPure(board, kingRow, 4, opponentColor) &&
              !isSquareAttackedPure(board, kingRow, 3, opponentColor) &&
              !isSquareAttackedPure(board, kingRow, 2, opponentColor)
            ) {
              moves.push([kingRow, 2]);
            }
          }
        }
      }
      break;
    default:
      break;
  }

  return moves;
};

// 게임 종료 체크 (순수 함수)
const checkGameEndPure = (board, color, castling, enPassant) => {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece[0] === color) {
        const moves = getValidMovesPure(board, r, c, piece, castling, enPassant, true);
        if (moves.length > 0) return null;
      }
    }
  }
  if (isInCheckPure(board, color)) {
    return "checkmate";
  } else {
    return "stalemate";
  }
};

// ===== AI 엔진 (강화 v2.0) =====
const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

// 모든 기물 위치 테이블 (백 기준, 흑은 뒤집어 사용)
const PAWN_TABLE = [
  [0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],
  [5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],
  [5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]
];
const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],
  [-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],
  [-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],
  [-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]
];
const BISHOP_TABLE = [
  [-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
  [-10,0,10,10,10,10,0,-10],[-10,5,5,10,10,5,5,-10],
  [-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],
  [-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]
];
const ROOK_TABLE = [
  [0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],
  [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
  [-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]
];
const QUEEN_TABLE = [
  [-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],
  [-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],
  [0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],
  [-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]
];
const KING_MG_TABLE = [
  [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],
  [20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]
];
const KING_EG_TABLE = [
  [-50,-40,-30,-20,-20,-30,-40,-50],[-30,-20,-10,0,0,-10,-20,-30],
  [-30,-10,20,30,30,20,-10,-30],[-30,-10,30,40,40,30,-10,-30],
  [-30,-10,30,40,40,30,-10,-30],[-30,-10,20,30,30,20,-10,-30],
  [-30,-30,0,0,0,0,-30,-30],[-50,-30,-30,-30,-30,-30,-30,-50]
];
const PST = { P: PAWN_TABLE, N: KNIGHT_TABLE, B: BISHOP_TABLE, R: ROOK_TABLE, Q: QUEEN_TABLE };

const evaluateBoard = (board, color) => {
  let score = 0;
  let totalMaterial = 0;

  // 엔드게임 판별을 위한 전체 기물 가치 합산
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p[1] !== "K") totalMaterial += PIECE_VALUES[p[1]] || 0;
    }
  }
  const isEndgame = totalMaterial < 2600;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const pc = piece[0], pt = piece[1];
      let value = PIECE_VALUES[pt] || 0;
      // 위치 보너스 (모든 기물)
      const row = pc === "w" ? r : 7 - r;
      if (pt === "K") {
        value += isEndgame ? KING_EG_TABLE[row][c] : KING_MG_TABLE[row][c];
      } else if (PST[pt]) {
        value += PST[pt][row][c];
      }
      score += pc === color ? value : -value;
    }
  }

  return score;
};

// AI용 이동 시뮬레이션 (프로모션 자동 처리)
const simulateMove = (board, from, to, piece, enPassant) => {
  const newBoard = board.map((row) => [...row]);
  const [fromR, fromC] = from;
  const [toR, toC] = to;
  const color = piece[0];
  const type = piece[1];

  newBoard[fromR][fromC] = null;

  // 프로모션: 폰이 마지막 랭크에 도달하면 자동으로 퀸으로 승격
  if (type === "P" && (toR === 0 || toR === 7)) {
    newBoard[toR][toC] = color + "Q";
  } else {
    newBoard[toR][toC] = piece;
  }

  // 캐슬링 룩 이동
  if (type === "K" && Math.abs(fromC - toC) === 2) {
    if (toC === 6) {
      newBoard[fromR][5] = newBoard[fromR][7];
      newBoard[fromR][7] = null;
    } else if (toC === 2) {
      newBoard[fromR][3] = newBoard[fromR][0];
      newBoard[fromR][0] = null;
    }
  }

  // 앙파상 캡처
  if (type === "P" && enPassant && toR === enPassant[0] && toC === enPassant[1]) {
    newBoard[fromR][toC] = null;
  }

  return newBoard;
};

// Move ordering: 캡처/프로모션 우선으로 alpha-beta 효율 극대화
const orderMoves = (board, moves) => {
  return moves.map((move) => {
    let priority = 0;
    const captured = board[move.to[0]][move.to[1]];
    if (captured) {
      // MVV-LVA: 고가치 기물 캡처를 저가치 기물로 → 높은 우선순위
      priority += 10000 + (PIECE_VALUES[captured[1]] || 0) * 10 - (PIECE_VALUES[move.piece[1]] || 0);
    }
    // 폰 프로모션
    if (move.piece[1] === "P" && (move.to[0] === 0 || move.to[0] === 7)) {
      priority += 9000;
    }
    // 중앙 통제
    if (move.to[0] >= 2 && move.to[0] <= 5 && move.to[1] >= 2 && move.to[1] <= 5) {
      priority += 50;
    }
    return { ...move, priority };
  }).sort((a, b) => b.priority - a.priority);
};

// Minimax + Alpha-Beta (move ordering 적용)
const minimax = (board, depth, isMaximizing, alpha, beta, color, castling, enPassant) => {
  if (depth === 0) {
    return evaluateBoard(board, color);
  }

  const currentColor = isMaximizing ? color : color === "w" ? "b" : "w";

  const allMoves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece[0] === currentColor) {
        const moves = getValidMovesPure(board, r, c, piece, castling, enPassant, true);
        moves.forEach(([toR, toC]) => {
          allMoves.push({ from: [r, c], to: [toR, toC], piece });
        });
      }
    }
  }

  if (allMoves.length === 0) {
    if (isInCheckPure(board, currentColor)) {
      // 체크메이트: 깊이가 얕을수록(빠른 메이트) 더 높은/낮은 점수
      return isMaximizing ? -999999 + (10 - depth) : 999999 - (10 - depth);
    }
    return 0; // 스테일메이트
  }

  // Move ordering으로 alpha-beta 컷오프 효율 향상
  const ordered = orderMoves(board, allMoves);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of ordered) {
      const newBoard = simulateMove(board, move.from, move.to, move.piece, enPassant);
      const evaluation = minimax(newBoard, depth - 1, false, alpha, beta, color, castling, null);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of ordered) {
      const newBoard = simulateMove(board, move.from, move.to, move.piece, enPassant);
      const evaluation = minimax(newBoard, depth - 1, true, alpha, beta, color, castling, null);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

// AI 최적의 수 찾기 (강화 v2.0)
const findBestMove = (board, color, difficulty, castling, enPassant) => {
  const allMoves = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece[0] === color) {
        const moves = getValidMovesPure(board, r, c, piece, castling, enPassant, true);
        moves.forEach(([toR, toC]) => {
          allMoves.push({ from: [r, c], to: [toR, toC], piece });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  // 난이도별 탐색 깊이 (대폭 상향)
  let depth;
  if (difficulty === "beginner") depth = 2;      // 기존: 랜덤 → 이제 minimax depth 2
  else if (difficulty === "intermediate") depth = 3; // 기존: 2 → 3
  else depth = 4;                                    // 기존: 3 → 4

  // Root에서 move ordering 적용
  const ordered = orderMoves(board, allMoves);

  let bestMove = null;
  let bestValue = -Infinity;

  for (const move of ordered) {
    const newBoard = simulateMove(board, move.from, move.to, move.piece, enPassant);
    const moveValue = minimax(newBoard, depth - 1, false, -Infinity, Infinity, color, castling, null);

    // 초급: 평가에 노이즈 추가 (가끔 실수하지만 완전 랜덤은 아님)
    let adjustedValue = moveValue;
    if (difficulty === "beginner") {
      adjustedValue += (Math.random() - 0.5) * 120;
    }

    if (adjustedValue > bestValue) {
      bestValue = adjustedValue;
      bestMove = move;
    }
  }

  return bestMove;
};

const ChessGame = () => {
  const { user, userDoc, isAdmin } = useAuth();

  const containerStyle = {
    backgroundColor: "#0a0a12",
    minHeight: "100%",
    width: "100%",
  };
  const [gameId, setGameId] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [showCreateRoom, setShowCreateRoom] = useState(true);
  const [newRoomId, setNewRoomId] = useState("");
  const [feedback, setFeedback] = useState({ message: "", type: "" });
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [timeControl, setTimeControl] = useState(600);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [showPromotion, setShowPromotion] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const intervalRef = useRef(null);
  const refetchRef = useRef(null);
  const aiTimeoutRef = useRef(null);

  // AI 모드 관련 state
  const [gameMode, setGameMode] = useState("player");
  const [aiDifficulty, setAiDifficulty] = useState("intermediate");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  // 3D 모드 관련 state
  const [is3DMode, setIs3DMode] = useState(true);

  // 보상 관련 state
  const [showRewardSelection, setShowRewardSelection] = useState(false);
  const [rewardCards, setRewardCards] = useState([]);

  // 일일 플레이 횟수
  const [dailyPlayCount, setDailyPlayCount] = useState(0);

  const myColor =
    gameData &&
    user &&
    (gameData.aiMode
      ? gameData.playerColor
      : gameData.players.white === user.uid
        ? "w"
        : "b");
  const isMyTurn = gameData && gameData.turn === myColor;

  const {
    rank: userRank,
    nextRank,
    pointsForNextRank,
  } = getRankInfo(userDoc?.chessRating);

  const gameIdRef = useRef(gameId);
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);
  const gameDataRef = useRef(gameData);
  useEffect(() => {
    gameDataRef.current = gameData;
  }, [gameData]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const cleanup = () => {
      const currentGameId = gameIdRef.current;
      const currentGameData = gameDataRef.current;
      const currentUser = userRef.current;
      if (
        currentGameId &&
        currentGameData &&
        currentUser &&
        currentGameData.status === "waiting" &&
        currentGameData.players?.white === currentUser.uid
      ) {
        // 대기 중인 방만 삭제 (진행 중인 게임은 보존)
        deleteDoc(doc(db, "chessGames", currentGameId));
      }
    };

    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
    };
  }, []);

  const handleTimeout = useCallback(
    async (loserColor) => {
      if (!gameId) return;
      const gameRef = doc(db, "chessGames", gameId);
      const winnerColor = loserColor === "w" ? "b" : "w";

      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists() || gameDoc.data().status !== "active") {
          return;
        }

        transaction.update(gameRef, {
          status: "finished",
          winner: winnerColor,
          endReason: "timeout",
          ratingChange: {
            [winnerColor === "w" ? "white" : "black"]: RATING_CHANGE.WIN,
            [loserColor === "w" ? "white" : "black"]: RATING_CHANGE.LOSS,
          },
        });
      });
      if (refetchRef.current) await refetchRef.current();
    },
    [gameId],
  );

  // 타이머 값을 ref로 추적 (dependency 순환 방지)
  const whiteTimeRef = useRef(whiteTime);
  const blackTimeRef = useRef(blackTime);
  useEffect(() => { whiteTimeRef.current = whiteTime; }, [whiteTime]);
  useEffect(() => { blackTimeRef.current = blackTime; }, [blackTime]);

  useEffect(() => {
    if (gameData && gameData.status === "active" && isMyTurn) {
      intervalRef.current = setInterval(async () => {
        const currentTurn = gameData.turn;
        if (currentTurn === "w") {
          const newTime = Math.max(0, whiteTimeRef.current - 1);
          setWhiteTime(newTime);
          if (newTime <= 0) {
            clearInterval(intervalRef.current);
            await handleTimeout("w");
          }
        } else {
          const newTime = Math.max(0, blackTimeRef.current - 1);
          setBlackTime(newTime);
          if (newTime <= 0) {
            clearInterval(intervalRef.current);
            await handleTimeout("b");
          }
        }
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [gameData?.status, gameData?.turn, isMyTurn, gameId, handleTimeout]);

  const fetchAvailableRooms = useCallback(async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, "chessGames"),
        where("status", "==", "waiting"),
      );
      const querySnapshot = await getDocs(q);
      const rooms = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.players.white !== user.uid) {
          rooms.push({ id: doc.id, ...data });
        }
      });
      setAvailableRooms(rooms);
    } catch (error) {
      logger.error("Error fetching rooms:", error);
    }
  }, [user]);

  // 로비 대기방 목록: 초기 로드 + 10초 자동갱신 (onSnapshot 대신 폴링으로 DB 비용 절감)
  useEffect(() => {
    if (!showCreateRoom || !user) return;
    fetchAvailableRooms();
    const interval = setInterval(fetchAvailableRooms, 10000);
    return () => clearInterval(interval);
  }, [showCreateRoom, user, fetchAvailableRooms]);

  const fetchGameData = useCallback(async () => {
    if (!gameId) return;

    const gameRef = doc(db, "chessGames", gameId);
    const docSnap = await getDoc(gameRef);

    if (docSnap.exists()) {
      const rawData = docSnap.data();
      const deserializedData = {
        ...rawData,
        board: deserializeBoard(rawData.board),
      };
      setGameData(deserializedData);
      setShowCreateRoom(false);

      if (rawData.whiteTime !== undefined) setWhiteTime(rawData.whiteTime);
      if (rawData.blackTime !== undefined) setBlackTime(rawData.blackTime);
      if (rawData.moveHistory) setMoveHistory(rawData.moveHistory);
    } else {
      setFeedback({ message: "게임을 찾을 수 없습니다.", type: "error" });
      setGameId(null);
      setGameData(null);
      setShowCreateRoom(true);
    }
  }, [gameId]);

  // 실시간 게임 데이터 리스너 (상대방 입장/수 두기 즉시 반영)
  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, "chessGames", gameId);
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const rawData = docSnap.data();
        const deserializedData = {
          ...rawData,
          board: deserializeBoard(rawData.board),
        };
        setGameData(deserializedData);
        setShowCreateRoom(false);
        if (rawData.whiteTime !== undefined) setWhiteTime(rawData.whiteTime);
        if (rawData.blackTime !== undefined) setBlackTime(rawData.blackTime);
        if (rawData.moveHistory) setMoveHistory(rawData.moveHistory);
      } else {
        setFeedback({ message: "게임을 찾을 수 없습니다.", type: "error" });
        setGameId(null);
        setGameData(null);
        setShowCreateRoom(true);
      }
    }, (err) => {
      logger.error("게임 데이터 리스너 오류:", err);
    });
    return () => unsubscribe();
  }, [gameId]);

  const refetch = fetchGameData;

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    const loadDailyPlayCount = () => {
      if (!user) return;
      const today = new Date().toDateString();
      const storageKey = `chessPlayCount_${user.uid}_${today}`;
      const count = parseInt(localStorage.getItem(storageKey) || "0", 10);
      setDailyPlayCount(count);
    };
    loadDailyPlayCount();
  }, [user]);

  useEffect(() => {
    if (feedback.message) {
      const timer = setTimeout(
        () => setFeedback({ message: "", type: "" }),
        3000,
      );
      return () => clearTimeout(timer);
    }
  }, [feedback.message]);

  // useCallback 래퍼 (컴포넌트 내 UI에서 사용)
  const getValidMoves = useCallback(
    (board, row, col, piece, checkForCheck = true) => {
      const castling = gameData?.castling || null;
      const enPassant = gameData?.enPassant || null;
      return getValidMovesPure(board, row, col, piece, castling, enPassant, checkForCheck);
    },
    [gameData?.castling, gameData?.enPassant],
  );

  const isInCheck = useCallback(
    (board, color) => {
      return isInCheckPure(board, color);
    },
    [],
  );

  // 보상 카드 생성
  const generateRewardCards = () => {
    const cashRewards = [
      { amount: 50000, weight: 5 },
      { amount: 30000, weight: 10 },
      { amount: 20000, weight: 15 },
      { amount: 10000, weight: 20 },
      { amount: 5000, weight: 18 },
      { amount: 3000, weight: 12 },
      { amount: 1000, weight: 10 },
      { amount: 500, weight: 7 },
      { amount: 100, weight: 3 },
    ];

    const couponRewards = [
      { amount: 20, weight: 10 },
      { amount: 10, weight: 20 },
      { amount: 5, weight: 20 },
      { amount: 3, weight: 20 },
      { amount: 1, weight: 30 },
    ];

    const weightedRandom = (items) => {
      const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
      let random = Math.random() * totalWeight;
      for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item.amount;
      }
      return items[items.length - 1].amount;
    };

    return [
      { type: "cash", amount: weightedRandom(cashRewards) },
      { type: "coupon", amount: weightedRandom(couponRewards) },
    ];
  };

  // 보상 선택 처리
  const handleRewardSelection = async (selectedCard) => {
    if (!user || !gameId) return;

    try {
      const userRef = doc(db, "users", user.uid);
      const today = new Date().toDateString();
      const storageKey = `chessPlayCount_${user.uid}_${today}`;

      await runTransaction(db, async (transaction) => {
        const userDocSnap = await transaction.get(userRef);
        if (!userDocSnap.exists()) return;

        const updateData = {};
        if (selectedCard.type === "cash") {
          updateData.balance = increment(selectedCard.amount);
        } else if (selectedCard.type === "coupon") {
          updateData.couponBalance = increment(selectedCard.amount);
        }
        transaction.update(userRef, updateData);
      });

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

      logActivity(db, {
        classCode: userDoc?.classCode,
        userId: user.uid,
        userName: userDoc?.name || "사용자",
        type: ACTIVITY_TYPES.GAME_WIN,
        description: `체스 AI(${aiDifficulty}) 승리 - ${selectedCard.type === "cash" ? `현금 ${selectedCard.amount.toLocaleString()}원` : `쿠폰 ${selectedCard.amount}개`} 획득`,
        amount: selectedCard.type === "cash" ? selectedCard.amount : 0,
        couponAmount: selectedCard.type === "coupon" ? selectedCard.amount : 0,
        metadata: {
          gameType: "chess",
          opponent: "AI",
          difficulty: aiDifficulty,
          rewardType: selectedCard.type,
          rewardAmount: selectedCard.amount,
        },
      });

      setTimeout(() => {
        handleLeaveGame();
      }, 2000);
    } catch (error) {
      logger.error("Error applying reward:", error);
      setFeedback({ message: "보상 지급에 실패했습니다.", type: "error" });
    }
  };

  const handleCreateRoom = async () => {
    if (!user) {
      setFeedback({ message: "로그인이 필요합니다.", type: "error" });
      return;
    }

    if (gameMode === "ai") {
      const today = new Date().toDateString();
      const storageKey = `chessPlayCount_${user.uid}_${today}`;
      const currentCount = parseInt(
        localStorage.getItem(storageKey) || "0",
        10,
      );

      if (currentCount >= 3) {
        setFeedback({
          message: "오늘의 AI 대전 횟수를 모두 사용했습니다. (3/3)",
          type: "error",
        });
        return;
      }
    }

    const newGameId = Math.random().toString(36).substring(2, 8);
    const gameRef = doc(db, "chessGames", newGameId);

    const isAiMode = gameMode === "ai";
    const playerColor = Math.random() > 0.5 ? "w" : "b";
    const aiColor = playerColor === "w" ? "b" : "w";

    const initialGameData = {
      board: serializeBoard(getInitialBoard()),
      players: isAiMode
        ? playerColor === "w"
          ? { white: user.uid, black: "AI" }
          : { white: "AI", black: user.uid }
        : { white: user.uid, black: null },
      playerNames: isAiMode
        ? playerColor === "w"
          ? {
              white: userDoc.name,
              black: `AI (${aiDifficulty === "beginner" ? "초급" : aiDifficulty === "intermediate" ? "중급" : "고급"})`,
            }
          : {
              white: `AI (${aiDifficulty === "beginner" ? "초급" : aiDifficulty === "intermediate" ? "중급" : "고급"})`,
              black: userDoc.name,
            }
        : { white: userDoc.name, black: null },
      playerRanks: isAiMode
        ? playerColor === "w"
          ? { white: userRank, black: "AI" }
          : { white: "AI", black: userRank }
        : { white: userRank, black: "Unranked" },
      playerRatings: isAiMode
        ? playerColor === "w"
          ? { white: userDoc.chessRating || 0, black: 0 }
          : { white: 0, black: userDoc.chessRating || 0 }
        : { white: userDoc.chessRating || 0, black: null },
      turn: "w",
      status: isAiMode ? "active" : "waiting",
      winner: null,
      timeControl: timeControl,
      whiteTime: timeControl,
      blackTime: timeControl,
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      moveHistory: [],
      createdAt: serverTimestamp(),
      ratingChange: null,
      aiMode: isAiMode,
      aiDifficulty: isAiMode ? aiDifficulty : null,
      aiColor: isAiMode ? aiColor : null,
      playerColor: isAiMode ? playerColor : null,
    };

    try {
      await setDoc(gameRef, initialGameData);
      setGameId(newGameId);
      setGameData({
        ...initialGameData,
        board: getInitialBoard(),
      });
      setShowCreateRoom(false);
      setFeedback({
        message: isAiMode
          ? `AI 대전 시작!`
          : `체스 방 생성 완료! 코드: ${newGameId}`,
        type: "success",
      });
    } catch (error) {
      logger.error("Error creating room:", error);
      setFeedback({ message: "방 생성에 실패했습니다.", type: "error" });
    }
  };

  const handleJoinRoom = async (roomId = null) => {
    const targetRoomId = roomId || newRoomId.trim();

    if (!targetRoomId) {
      setFeedback({ message: "참가할 방 코드를 입력하세요.", type: "error" });
      return;
    }
    if (!user) {
      setFeedback({ message: "로그인이 필요합니다.", type: "error" });
      return;
    }

    const gameRef = doc(db, "chessGames", targetRoomId);

    try {
      await runTransaction(db, async (transaction) => {
        const gameDoc = await transaction.get(gameRef);
        if (!gameDoc.exists()) throw new Error("방을 찾을 수 없습니다.");

        const data = gameDoc.data();
        if (data.players.black) throw new Error("방이 가득 찼습니다.");
        if (data.players.white === user.uid)
          throw new Error("자신이 만든 방에는 참가할 수 없습니다.");

        transaction.update(gameRef, {
          "players.black": user.uid,
          "playerNames.black": userDoc.name,
          "playerRanks.black": userRank,
          "playerRatings.black": userDoc.chessRating || 0,
          status: "active",
        });
      });
      setGameId(targetRoomId);
      setShowCreateRoom(false);
    } catch (error) {
      logger.error("Error joining room: ", error);
      setFeedback({ message: `참가 실패: ${error.message}`, type: "error" });
    }
  };

  const handleAdminDeleteRoom = async (roomId) => {
    if (!isAdmin?.()) {
      setFeedback({ message: "삭제 권한이 없습니다.", type: "error" });
      return;
    }
    try {
      await deleteDoc(doc(db, "chessGames", roomId));
      setFeedback({
        message: `방 ${roomId}가 삭제되었습니다.`,
        type: "success",
      });
      fetchAvailableRooms();
    } catch (error) {
      logger.error("Error deleting room by admin:", error);
      setFeedback({ message: "방 삭제에 실패했습니다.", type: "error" });
    }
  };

  const handlePieceClick = (row, col) => {
    if (!isMyTurn || gameData.status !== "active" || isMoving) return;

    const piece = gameData.board[row][col];

    if (
      selectedPiece &&
      possibleMoves.some(([r, c]) => r === row && c === col)
    ) {
      handleMove(row, col);
    } else if (piece && piece[0] === myColor) {
      setSelectedPiece({ row, col, piece });
      const moves = getValidMoves(gameData.board, row, col, piece);
      setPossibleMoves(moves);
    } else {
      setSelectedPiece(null);
      setPossibleMoves([]);
    }
  };

  const handleMove = async (toRow, toCol) => {
    if (!selectedPiece || !gameData) return;

    const { row: fromRow, col: fromCol, piece } = selectedPiece;

    if (piece[1] === "P" && (toRow === 0 || toRow === 7)) {
      setShowPromotion({ toRow, toCol, fromRow, fromCol });
      return;
    }

    await executeMove(fromRow, fromCol, toRow, toCol, piece);
  };

  const handlePromotion = async (promoteTo) => {
    if (!showPromotion) return;
    const { fromRow, fromCol, toRow, toCol } = showPromotion;
    const piece = gameData.board[fromRow][fromCol];

    await executeMove(fromRow, fromCol, toRow, toCol, piece, promoteTo);
    setShowPromotion(null);
  };

  const handleLeaveGame = useCallback(async () => {
    if (gameData && gameId) {
      try {
        if (gameData.status === "waiting") {
          // 대기 중인 방은 삭제
          await deleteDoc(doc(db, "chessGames", gameId));
        } else if (gameData.status === "active" && !gameData.aiMode) {
          // 진행 중인 멀티플레이어 게임은 기권 처리
          const gameRef = doc(db, "chessGames", gameId);
          const loserColor = myColor;
          const winnerColor = loserColor === "w" ? "b" : "w";
          await runTransaction(db, async (transaction) => {
            const gameDoc = await transaction.get(gameRef);
            if (!gameDoc.exists() || gameDoc.data().status !== "active") return;
            transaction.update(gameRef, {
              status: "finished",
              winner: winnerColor,
              endReason: "forfeit",
              ratingChange: {
                [winnerColor === "w" ? "white" : "black"]: RATING_CHANGE.WIN,
                [loserColor === "w" ? "white" : "black"]: RATING_CHANGE.LOSS,
              },
            });
          });
        } else if (gameData.aiMode || gameData.status === "finished") {
          // AI 모드 게임이나 끝난 게임은 삭제
          await deleteDoc(doc(db, "chessGames", gameId));
        }
      } catch (error) {
        logger.error("Error leaving game:", error);
      }
    }

    setGameId(null);
    setGameData(null);
    setShowCreateRoom(true);
    setSelectedPiece(null);
    setPossibleMoves([]);
  }, [gameData, gameId, user, myColor]);

  const executeMove = useCallback(
    async (fromRow, fromCol, toRow, toCol, piece, promotionPiece = null) => {
      if (!gameId || isMoving) return;
      setIsMoving(true);
      const gameRef = doc(db, "chessGames", gameId);

      try {
        const result = await runTransaction(db, async (transaction) => {
          const gameDoc = await transaction.get(gameRef);
          if (!gameDoc.exists()) {
            throw new Error("게임을 찾을 수 없습니다.");
          }

          const currentData = gameDoc.data();
          if (currentData.status !== "active") {
            return {
              status: currentData.status,
              winner: currentData.winner,
              aiMode: currentData.aiMode,
              moveMade: false,
            };
          }

          const color = piece[0];
          if (currentData.turn !== color) {
            throw new Error("상대방의 턴입니다.");
          }

          const board = deserializeBoard(currentData.board);

          let newBoard = board.map((r) => [...r]);
          newBoard[fromRow][fromCol] = null;
          newBoard[toRow][toCol] = promotionPiece
            ? color + promotionPiece
            : piece;

          const newCastling = { ...currentData.castling };
          let newEnPassant = null;

          if (piece === "wK") {
            newCastling.wK = false;
            newCastling.wQ = false;
          }
          if (piece === "bK") {
            newCastling.bK = false;
            newCastling.bQ = false;
          }
          if (piece === "wR" && fromRow === 7 && fromCol === 0)
            newCastling.wQ = false;
          if (piece === "wR" && fromRow === 7 && fromCol === 7)
            newCastling.wK = false;
          if (piece === "bR" && fromRow === 0 && fromCol === 0)
            newCastling.bQ = false;
          if (piece === "bR" && fromRow === 0 && fromCol === 7)
            newCastling.bK = false;

          // 캐슬링 룩 이동
          if (piece[1] === "K" && Math.abs(fromCol - toCol) === 2) {
            if (toCol === 6) {
              newBoard[fromRow][5] = newBoard[fromRow][7];
              newBoard[fromRow][7] = null;
            } else {
              newBoard[fromRow][3] = newBoard[fromRow][0];
              newBoard[fromRow][0] = null;
            }
          }

          // 앙파상 캡처
          if (piece[1] === "P" && currentData.enPassant) {
            const [epRow, epCol] = currentData.enPassant;
            if (toRow === epRow && toCol === epCol) {
              newBoard[fromRow][toCol] = null;
            }
          }

          // 앙파상 설정
          if (piece[1] === "P" && Math.abs(fromRow - toRow) === 2) {
            newEnPassant = [(fromRow + toRow) / 2, fromCol];
          }

          const files = "abcdefgh";
          const moveNotation = `${piece[1] !== "P" ? piece[1] : ""}${files[fromCol]}${8 - fromRow} -> ${files[toCol]}${8 - toRow}`;
          const newMoveHistory = [...currentData.moveHistory, moveNotation];

          const nextTurn = color === "w" ? "b" : "w";
          let newStatus = currentData.status;
          let newWinner = null;
          let endReason = null;
          let newRatingChange = null;

          const gameEndState = checkGameEndPure(newBoard, nextTurn, newCastling, newEnPassant);
          if (gameEndState) {
            newStatus = "finished";
            endReason = gameEndState;
            if (gameEndState === "checkmate") {
              newWinner = color;
            } else {
              newWinner = "draw";
            }
          }

          if (newStatus === "finished" && newWinner !== "draw") {
            newRatingChange = {
              [newWinner === "w" ? "white" : "black"]: RATING_CHANGE.WIN,
              [newWinner === "w" ? "black" : "white"]: RATING_CHANGE.LOSS,
            };
          }

          const updateData = {
            board: serializeBoard(newBoard),
            turn: nextTurn,
            castling: newCastling,
            enPassant: newEnPassant,
            moveHistory: newMoveHistory,
            status: newStatus,
            winner: newWinner,
            endReason: endReason,
            ratingChange: newRatingChange,
            whiteTime: color === "w" ? whiteTime : (currentData.whiteTime ?? whiteTime),
            blackTime: color === "b" ? blackTime : (currentData.blackTime ?? blackTime),
            lastMoveAt: serverTimestamp(),
          };

          transaction.update(gameRef, updateData);

          return {
            status: newStatus,
            winner: newWinner,
            aiMode: currentData.aiMode,
            moveMade: true,
          };
        });

        if (result.moveMade && result.status === "finished" && result.aiMode) {
          const playerIsWinner = result.winner === myColor;
          const isDraw = result.winner === "draw";

          if (playerIsWinner || (isDraw && Math.random() < 0.5)) {
            const cards = generateRewardCards();
            setRewardCards(cards);
            setShowRewardSelection(true);
          } else {
            const today = new Date().toDateString();
            const storageKey = `chessPlayCount_${user.uid}_${today}`;
            const newCount = dailyPlayCount + 1;
            localStorage.setItem(storageKey, newCount.toString());
            setDailyPlayCount(newCount);

            if (isDraw) {
              setFeedback({
                message: "무승부! 아쉽지만 보상은 다음 기회에!",
                type: "info",
              });
            }
            setTimeout(() => handleLeaveGame(), 2000);
          }
        }

        setSelectedPiece(null);
        setPossibleMoves([]);
      } catch (error) {
        logger.error("Error making move: ", error);
        setFeedback({
          message: `이동 중 오류 발생: ${error.message}`,
          type: "error",
        });
      } finally {
        setIsMoving(false);
      }
    },
    [
      gameId,
      isMoving,
      myColor,
      dailyPlayCount,
      user,
      whiteTime,
      blackTime,
      setRewardCards,
      setShowRewardSelection,
      setDailyPlayCount,
      setFeedback,
      handleLeaveGame,
      setSelectedPiece,
      setPossibleMoves,
    ],
  );

  // AI 턴 처리
  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const makeAiMove = async () => {
      if (!gameData || !gameId || gameData.status !== "active") return;
      if (!gameData.aiMode) return;
      if (isAiThinking || isMoving) return;

      const aiColor = gameData.aiColor;
      if (gameData.turn !== aiColor) return;

      setIsAiThinking(true);

      const thinkingTime = 500 + Math.random() * 1000;

      aiTimeoutRef.current = setTimeout(async () => {
        try {
          const gameRef = doc(db, "chessGames", gameId);
          const gameSnap = await getDoc(gameRef);

          if (!gameSnap.exists()) {
            setIsAiThinking(false);
            return;
          }

          const currentGameData = gameSnap.data();

          if (
            currentGameData.status !== "active" ||
            currentGameData.turn !== aiColor
          ) {
            setIsAiThinking(false);
            return;
          }

          const currentBoard = deserializeBoard(currentGameData.board);
          const bestMove = findBestMove(
            currentBoard,
            aiColor,
            currentGameData.aiDifficulty || aiDifficulty,
            currentGameData.castling,
            currentGameData.enPassant,
          );

          if (bestMove) {
            const { from, to, piece } = bestMove;
            // AI 프로모션 처리
            let promotionPiece = null;
            if (piece[1] === "P" && (to[0] === 0 || to[0] === 7)) {
              promotionPiece = "Q";
            }
            await executeMove(from[0], from[1], to[0], to[1], piece, promotionPiece);
          }
        } catch (error) {
          logger.error("AI move error:", error);
        }

        setIsAiThinking(false);
        aiTimeoutRef.current = null;
      }, thinkingTime);
    };

    makeAiMove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameData?.turn,
    gameData?.status,
    gameData?.moveHistory?.length,
    gameId,
  ]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (showCreateRoom) {
    const canPlayAi = dailyPlayCount < 3;

    return (
      <div className="chess-container">
        <div className="room-creation">
          <h2>♚ 체스 게임 ♔</h2>
          <p>전략적 사고력을 기르는 최고의 두뇌 게임!</p>

          <div className="user-rank-info">
            <p>
              내 등급: <strong>{userRank}</strong> ({userDoc?.chessRating || 0}
              점)
            </p>
            {nextRank && (
              <p className="next-rank-guide">
                다음 등급 ({nextRank})까지{" "}
                <strong>{pointsForNextRank}점</strong> 남았습니다.
              </p>
            )}
          </div>

          <div className="game-mode-selector">
            <h3>게임 모드 선택</h3>
            <div className="mode-options">
              <button
                className={gameMode === "player" ? "selected" : ""}
                onClick={() => setGameMode("player")}
              >
                👥 플레이어 대전
              </button>
              <button
                className={gameMode === "ai" ? "selected" : ""}
                onClick={() => setGameMode("ai")}
              >
                🤖 AI 대전 ({dailyPlayCount}/3)
              </button>
            </div>
          </div>

          {gameMode === "ai" && (
            <div className="ai-difficulty-selector">
              <h3>AI 난이도</h3>
              <div className="difficulty-options">
                <button
                  className={aiDifficulty === "beginner" ? "selected" : ""}
                  onClick={() => setAiDifficulty("beginner")}
                >
                  😊 초급
                </button>
                <button
                  className={aiDifficulty === "intermediate" ? "selected" : ""}
                  onClick={() => setAiDifficulty("intermediate")}
                >
                  🤔 중급
                </button>
                <button
                  className={aiDifficulty === "advanced" ? "selected" : ""}
                  onClick={() => setAiDifficulty("advanced")}
                >
                  🔥 고급
                </button>
              </div>
            </div>
          )}

          {feedback.message && (
            <div className={`feedback ${feedback.type}`}>
              {feedback.message}
            </div>
          )}

          <div className="time-control-selector">
            <h3>시간 제한 선택</h3>
            <div className="time-options">
              {[180, 300, 600, 900].map((time) => (
                <button
                  key={time}
                  className={timeControl === time ? "selected" : ""}
                  onClick={() => setTimeControl(time)}
                >
                  {time / 60}분
                </button>
              ))}
            </div>
          </div>

          <div className="room-actions">
            <button onClick={handleCreateRoom} className="create-room-btn">
              {gameMode === "ai" ? "🤖 AI 대전 시작" : "새로운 방 만들기"}
            </button>

            {gameMode === "player" && (
              <div className="join-room">
                <input
                  type="text"
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                  placeholder="방 코드 입력"
                  maxLength="6"
                />
                <button onClick={() => handleJoinRoom()}>코드로 참가</button>
              </div>
            )}
          </div>

          {availableRooms.length > 0 && (
            <div className="available-rooms">
              <h3>📋 대기 중인 방 목록</h3>
              <div className="rooms-list">
                {availableRooms.map((room) => (
                  <div key={room.id} className="room-item">
                    <div className="room-info">
                      <span className="room-host">
                        호스트: {room.playerNames.white} (
                        {room.playerRanks?.white || "Unranked"},{" "}
                        {room.playerRatings?.white || 0}점)
                      </span>
                      <span className="room-time">
                        ⏱ {formatTime(room.timeControl)}
                      </span>
                      <span className="room-code">코드: {room.id}</span>
                    </div>
                    <div className="room-item-buttons">
                      <button
                        onClick={() => handleJoinRoom(room.id)}
                        className="join-btn"
                      >
                        참가
                      </button>
                      {isAdmin?.() && (
                        <button
                          onClick={() => handleAdminDeleteRoom(room.id)}
                          className="delete-btn"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="chess-rules">
            <h3>체스 기본 규칙</h3>
            <ul>
              <li>백(White)이 먼저 시작합니다.</li>
              <li>상대방의 킹을 체크메이트하면 승리합니다.</li>
              <li>
                플레이어 대전: 승리 시 <strong>점수(+15)</strong>와 쿠폰 3개,
                패배 시 <strong>점수(-10)</strong>
              </li>
              <li>
                AI 대전: 승리 시 <strong>카드 보상</strong> 선택 (현금 또는
                쿠폰), 하루 3회 제한
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!gameData) {
    return <AlchanLoading />;
  }

  const whitePlayerId = gameData.players.white;
  const blackPlayerId = gameData.players.black;

  return (
    <div className="chess-container" style={containerStyle}>
      <div className="game-info">
        <div
          className={`player black ${gameData.turn === "b" ? "active" : ""} ${user?.uid === blackPlayerId ? "my-player" : "opponent-player"}`}
        >
          <span className="player-name">
            ♛ {gameData.playerNames.black || "대기중..."}
            <span className="player-rank">
              [{gameData.playerRanks?.black || "Unranked"}] (
              {gameData.playerRatings?.black || 0}점)
            </span>
          </span>
          <span className="player-time">{formatTime(blackTime)}</span>
        </div>

        <div className="game-status">
          {gameData.status === "finished" ? (
            gameData.winner === "draw" ? (
              <span>무승부!</span>
            ) : gameData.winner === myColor ? (
              <span className="winner">
                🎉 승리! (
                {gameData.ratingChange?.[myColor === "w" ? "white" : "black"] > 0
                  ? "+"
                  : ""}
                {gameData.ratingChange?.[myColor === "w" ? "white" : "black"]}점)
                쿠폰 3개 획득!
              </span>
            ) : (
              <span className="loser">
                패배! (
                {gameData.ratingChange?.[myColor === "w" ? "white" : "black"]}점)
              </span>
            )
          ) : gameData.status === "waiting" ? (
            <span>상대방을 기다리는 중... (코드: <strong style={{color:"#00fff2",cursor:"pointer",textDecoration:"underline"}} onClick={(e)=>{e.stopPropagation();navigator.clipboard.writeText(gameId);setFeedback({message:"방 코드가 복사되었습니다!",type:"success"})}}>{gameId}</strong>)</span>
          ) : (
            <span>{isMyTurn ? "당신의 차례" : "상대방 차례"}</span>
          )}
        </div>

        <div
          className={`player white ${gameData.turn === "w" ? "active" : ""} ${user?.uid === whitePlayerId ? "my-player" : "opponent-player"}`}
        >
          <span className="player-name">
            ♕ {gameData.playerNames.white}
            <span className="player-rank">
              [{gameData.playerRanks?.white || "Unranked"}] (
              {gameData.playerRatings?.white || 0}점)
            </span>
          </span>
          <span className="player-time">{formatTime(whiteTime)}</span>
        </div>
      </div>

      <div className="board-container">
        <div className="view-toggle">
          <button
            className={`toggle-btn ${!is3DMode ? "active" : ""}`}
            onClick={() => setIs3DMode(false)}
          >
            2D
          </button>
          <button
            className={`toggle-btn ${is3DMode ? "active" : ""}`}
            onClick={() => setIs3DMode(true)}
          >
            3D
          </button>
        </div>

        {is3DMode ? (
          <div className="chess-board-3d">
            <Suspense
              fallback={<div className="loading-3d">3D 보드 로딩 중...</div>}
            >
              <Chess3DCanvas
                board={gameData.board}
                selectedPiece={selectedPiece}
                possibleMoves={possibleMoves}
                onSquareClick={handlePieceClick}
                myColor={myColor}
                isInCheck={isInCheck}
              />
            </Suspense>
          </div>
        ) : (
          <div className={`chess-board ${myColor === "b" ? "flipped" : ""}`}>
            {gameData.board.map((row, rIndex) =>
              row.map((piece, cIndex) => {
                const isSelected =
                  selectedPiece?.row === rIndex &&
                  selectedPiece?.col === cIndex;
                const isPossibleMove = possibleMoves.some(
                  ([r, c]) => r === rIndex && c === cIndex,
                );
                const isLight = (rIndex + cIndex) % 2 === 0;
                const isCheckSquare =
                  piece &&
                  piece[1] === "K" &&
                  isInCheckPure(gameData.board, piece[0]);

                return (
                  <div
                    key={`${rIndex}-${cIndex}`}
                    className={`square ${isLight ? "light" : "dark"}
                                                   ${isSelected ? "selected" : ""}
                                                   ${isPossibleMove ? "possible" : ""}
                                                   ${isCheckSquare ? "check" : ""}`}
                    onClick={() => handlePieceClick(rIndex, cIndex)}
                  >
                    {piece && (
                      <div
                        className={`piece ${piece[0] === "w" ? "white-piece" : "black-piece"}`}
                      >
                        {PIECES[piece]}
                      </div>
                    )}
                    {isPossibleMove && !piece && <div className="move-dot" />}
                    {isPossibleMove && piece && (
                      <div className="capture-hint" />
                    )}
                  </div>
                );
              }),
            )}
          </div>
        )}

        {showPromotion && (
          <div className="promotion-modal">
            <div className="promotion-content">
              <h3>프로모션 선택</h3>
              <div className="promotion-pieces">
                {["Q", "R", "B", "N"].map((type) => (
                  <button
                    key={type}
                    onClick={() => handlePromotion(type)}
                    className="promotion-piece"
                  >
                    {PIECES[myColor + type]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isAiThinking && (
          <div className="ai-thinking">
            <div className="thinking-content">
              <div className="spinner"></div>
              <p>AI가 수를 고민하는 중...</p>
            </div>
          </div>
        )}

        {showRewardSelection && rewardCards.length === 2 && (
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
      </div>

      {feedback.message && (
        <div className={`feedback ${feedback.type}`}>{feedback.message}</div>
      )}

      <div className="game-controls">
        <button onClick={handleLeaveGame} className="leave-button">
          게임 나가기
        </button>
      </div>

      {moveHistory.length > 0 && (
        <div className="move-history">
          <h4>이동 기록</h4>
          <div className="moves-list">
            {moveHistory.map((move, idx) => (
              <span key={idx} className="move">
                {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}. ` : ""}
                {move}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChessGame;
