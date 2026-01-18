// src/GonuGame.js - 실제 고누 규칙 적용 + AI 모드
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import {
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
    deleteDoc
} from 'firebase/firestore';
import { usePolling } from '../../hooks/usePolling';
import { logActivity, ACTIVITY_TYPES } from '../../utils/firestoreHelpers';
import './GonuGame.css';
import { AlchanLoading } from '../../components/AlchanLayout';

// ═══════════════════════════════════════════════════════════════
// 우물고누 정의 (가장 기본적인 고누)
// 동그라미 안에 X 표시 형태, 각자 2개의 말
// 원 둘레 4개 위치 + 빈 시작 위치 1개 = 총 5개 위치
// 중앙(우물)은 선이 교차하는 곳이지만 이동 불가
// ═══════════════════════════════════════════════════════════════

// 우물고누 노드 배치 (나무위키 기준 5개 위치)
// 말판 (원 + X):
//       1 (상) - 흑1 시작
//      /|\
//     / | \
//    4-(우물)-2 (우) - 흑2 시작
//     \ | /
//      \|/
//       3 (하) - 백3 시작
//       |
//       5 (하단 추가 위치) - 백4 시작?
//
// 나무위키 표기: [1 2 ; 3 4 ;흑] = 1,2에 흑, 3,4에 백
// "2 위치의 흑돌을 5로 옮길 수 없다" = 2→5 이동 제한
//
// 재해석: 원 둘레(1,2,3,4)와 빈 위치(5)
// 실제로는 원 둘레를 따라 시계/반시계 방향으로 한 칸씩 이동
const UMUL_NODES = [
    { id: 1, x: 150, y: 40 },   // 1번 (상)
    { id: 2, x: 260, y: 150 },  // 2번 (우)
    { id: 3, x: 150, y: 260 },  // 3번 (하)
    { id: 4, x: 40, y: 150 },   // 4번 (좌)
    { id: 5, x: 150, y: 150 },  // 5번 (중앙) - 우물 위치, 이동 가능하지만 첫수 제한
];

// 우물고누 연결 (선) - 원 + X
const UMUL_EDGES = [
    // 원 둘레
    [1, 2], [2, 3], [3, 4], [4, 1],
    // X 대각선 (중앙 통과)
    [1, 5], [5, 3],  // 상-중앙-하
    [2, 5], [5, 4],  // 우-중앙-좌
];

// 우물고누에서 이동 가능한 연결
// 원 둘레를 따라 한 칸씩 + 중앙(5)으로/에서 이동
// "각 수마다 각각의 돌이 움직일 수 있는 곳은 하나밖에 없습니다"
// → 이건 특정 상황에서의 설명, 실제로는 여러 방향 가능
const UMUL_VALID_MOVES = {
    1: [2, 4, 5],    // 상: 우(2), 좌(4), 중앙(5)
    2: [1, 3, 5],    // 우: 상(1), 하(3), 중앙(5)
    3: [2, 4, 5],    // 하: 우(2), 좌(4), 중앙(5)
    4: [1, 3, 5],    // 좌: 상(1), 하(3), 중앙(5)
    5: [1, 2, 3, 4], // 중앙: 모든 방향
};

// ═══════════════════════════════════════════════════════════════
// 호박고누 정의
// 출발선 2개 + 가운데 원(우물고누 형태), 각자 3개의 말
// 전진만 가능, 후퇴 불가, 출발선 재진입 불가
// ═══════════════════════════════════════════════════════════════

// 호박고누 노드 배치 (7개의 점)
// 단순화된 말판:
//
//     0 (파랑 출발선) - 파랑 3개 시작
//     |
//     1
//    /|\
//   4-5-2  (5는 중앙)
//    \|/
//     3
//     |
//     6 (빨강 출발선) - 빨강 3개 시작
//
const HOBAK_NODES = [
    { id: 0, x: 150, y: 30, isHome: 'B' },   // 파랑 출발선
    { id: 1, x: 150, y: 90 },                 // 상단
    { id: 2, x: 230, y: 150 },                // 우측
    { id: 3, x: 150, y: 210 },                // 하단
    { id: 4, x: 70, y: 150 },                 // 좌측
    { id: 5, x: 150, y: 150 },                // 중앙
    { id: 6, x: 150, y: 270, isHome: 'R' },  // 빨강 출발선
];

// 호박고누 연결 (선)
const HOBAK_EDGES = [
    [0, 1],                      // 파랑 출발선 → 상단
    [1, 2], [2, 3], [3, 4], [4, 1],  // 원 둘레
    [1, 5], [2, 5], [3, 5], [4, 5],  // 원 둘레 → 중앙
    [3, 6],                      // 하단 → 빨강 출발선
];

// 호박고누에서 이동 가능한 연결 (인접 리스트)
// 출발선에서 나온 말은 출발선으로 못 돌아감 (게임 로직에서 처리)
const HOBAK_ADJACENCY = {
    0: [1],              // 파랑 출발선: 상단으로만
    1: [2, 4, 5],        // 상단: 우, 좌, 중앙 (0으로 못 돌아감 - 게임 로직)
    2: [1, 3, 5],        // 우: 상, 하, 중앙
    3: [2, 4, 5],        // 하: 우, 좌, 중앙 (6으로 못 감 - 상대 출발선)
    4: [1, 3, 5],        // 좌: 상, 하, 중앙
    5: [1, 2, 3, 4],     // 중앙: 상하좌우
    6: [3],              // 빨강 출발선: 하단으로만
};

// ═══════════════════════════════════════════════════════════════
// 밭고누 (네줄고누) 정의
// 4x4 격자, 각자 4개의 말, 3연속 만들면 상대 말 제거
// ═══════════════════════════════════════════════════════════════

// 밭고누 노드 배치 (16개의 점, 4x4 격자)
const BAT_NODES = [];
for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
        BAT_NODES.push({
            id: row * 4 + col,
            x: 60 + col * 80,
            y: 60 + row * 80,
            row: row,
            col: col
        });
    }
}

// 밭고누 연결 (가로, 세로, 대각선)
const BAT_EDGES = [];
// 가로 연결
for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
        BAT_EDGES.push([row * 4 + col, row * 4 + col + 1]);
    }
}
// 세로 연결
for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
        BAT_EDGES.push([row * 4 + col, (row + 1) * 4 + col]);
    }
}
// 대각선 연결 (오른쪽 아래)
for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
        BAT_EDGES.push([row * 4 + col, (row + 1) * 4 + col + 1]);
    }
}
// 대각선 연결 (왼쪽 아래)
for (let row = 0; row < 3; row++) {
    for (let col = 1; col < 4; col++) {
        BAT_EDGES.push([row * 4 + col, (row + 1) * 4 + col - 1]);
    }
}

// 밭고누 인접 리스트 생성
const BAT_ADJACENCY = {};
for (let i = 0; i < 16; i++) {
    BAT_ADJACENCY[i] = [];
}
BAT_EDGES.forEach(([a, b]) => {
    BAT_ADJACENCY[a].push(b);
    BAT_ADJACENCY[b].push(a);
});

// ═══════════════════════════════════════════════════════════════
// 게임 타입 설정
// ═══════════════════════════════════════════════════════════════

const GONU_TYPES = {
    umul: {
        name: '우물고누',
        description: '가장 기본적인 고누. 각자 2개의 말로 상대를 봉쇄하면 승리!',
        rules: [
            '각자 2개의 말을 가지고 시작합니다',
            '말은 원 둘레를 따라 한 칸씩만 이동합니다',
            '중앙(우물)으로는 이동할 수 없습니다',
            '상대의 말이 더 이상 움직일 수 없게 만들면 승리!',
            '실수하지 않으면 무승부가 될 수 있습니다',
        ],
        nodes: UMUL_NODES,
        edges: UMUL_EDGES,
        adjacency: UMUL_VALID_MOVES,
        initialPieces: () => ({
            // 나무위키: [1 2 ; 3 4 ;흑] = 1,2에 흑(파랑), 3,4에 백(빨강)
            // 5번(중앙)은 처음에 비어있음
            1: 'B',  // 상 - 파랑1
            2: 'B',  // 우 - 파랑2
            3: 'R',  // 하 - 빨강3
            4: 'R',  // 좌 - 빨강4
            // 5(중앙)는 비어있음 - 첫 수로 여기에 이동 가능 (단, 2→5는 금지)
        }),
        piecesPerPlayer: 2,
        boardWidth: 300,
        boardHeight: 300,
        // 첫 수 제한: 2번 위치에서 5번으로 바로 이동 금지
        firstMoveRestriction: { from: 2, to: 5 },
        checkWin: (pieces, currentPlayer) => {
            // 상대방이 움직일 수 없으면 승리
            const opponent = currentPlayer === 'B' ? 'R' : 'B';
            const opponentPieces = Object.entries(pieces)
                .filter(([, color]) => color === opponent)
                .map(([nodeId]) => parseInt(nodeId));

            for (const nodeId of opponentPieces) {
                const moves = UMUL_VALID_MOVES[nodeId] || [];
                for (const target of moves) {
                    if (!pieces[target]) {
                        return null; // 움직일 수 있는 곳이 있음
                    }
                }
            }
            return currentPlayer; // 상대방이 움직일 수 없음 = 현재 플레이어 승리
        },
        isWell: (nodeId) => nodeId === 5, // 5번이 우물(중앙)
    },
    hobak: {
        name: '호박고누',
        description: '출발선이 있는 고누. 각자 3개의 말로 상대를 봉쇄하면 승리!',
        rules: [
            '각자 3개의 말을 가지고 시작합니다',
            '말은 선을 따라 한 칸씩만 이동합니다',
            '출발선에서 나온 말은 출발선으로 돌아갈 수 없습니다',
            '상대 출발선으로도 들어갈 수 없습니다',
            '상대의 말이 더 이상 움직일 수 없게 만들면 승리!',
        ],
        nodes: HOBAK_NODES,
        edges: HOBAK_EDGES,
        adjacency: HOBAK_ADJACENCY,
        initialPieces: () => ({
            // 파랑: 출발선(0)에 1개, 나머지는 가운데 영역에서 시작
            // 단순화: 파랑 출발선(0), 상단(1), 좌측(4)
            // 빨강: 출발선(6), 하단(3), 우측(2)
            0: 'B',  // 파랑 출발선
            1: 'B',  // 상단
            4: 'B',  // 좌측
            6: 'R',  // 빨강 출발선
            3: 'R',  // 하단
            2: 'R',  // 우측
        }),
        piecesPerPlayer: 3,
        boardWidth: 300,
        boardHeight: 300,
        checkWin: (pieces, currentPlayer) => {
            const opponent = currentPlayer === 'B' ? 'R' : 'B';
            const opponentPieces = Object.entries(pieces)
                .filter(([, color]) => color === opponent)
                .map(([nodeId]) => parseInt(nodeId));

            for (const nodeId of opponentPieces) {
                const moves = HOBAK_ADJACENCY[nodeId] || [];
                for (const target of moves) {
                    if (!pieces[target]) {
                        // 출발선 제한 체크
                        const targetNode = HOBAK_NODES.find(n => n.id === target);
                        if (targetNode?.isHome) {
                            continue;
                        }
                        return null;
                    }
                }
            }
            return currentPlayer;
        },
        getHomeNode: (color) => color === 'B' ? 0 : 6,
    },
    bat: {
        name: '밭고누 (네줄고누)',
        description: '4x4 격자에서 자기 말 3개를 일렬로 만들면 상대 말을 제거!',
        rules: [
            '각자 4개의 말을 가지고 시작합니다',
            '말은 선을 따라 한 칸씩만 이동합니다',
            '자기 말 3개가 가로/세로/대각선 일렬이 되면 상대 말 1개 제거',
            '상대 말을 1개만 남기면 승리!',
        ],
        nodes: BAT_NODES,
        edges: BAT_EDGES,
        adjacency: BAT_ADJACENCY,
        initialPieces: () => ({
            0: 'B', 1: 'B', 2: 'B', 3: 'B',   // 흑 (상단 행)
            12: 'R', 13: 'R', 14: 'R', 15: 'R', // 적 (하단 행)
        }),
        piecesPerPlayer: 4,
        boardWidth: 320,
        boardHeight: 320,
        checkWin: (pieces) => {
            // 상대 말이 1개만 남으면 승리
            const blackCount = Object.values(pieces).filter(c => c === 'B').length;
            const redCount = Object.values(pieces).filter(c => c === 'R').length;
            if (blackCount <= 1) return 'R';
            if (redCount <= 1) return 'B';
            return null;
        },
        checkThreeInRow: (pieces, nodeId, color) => {
            // 해당 노드를 포함해서 3개 일렬인지 확인
            const node = BAT_NODES.find(n => n.id === nodeId);
            if (!node) return false;

            const { row, col } = node;

            // 가로 체크
            for (let startCol = Math.max(0, col - 2); startCol <= Math.min(1, col); startCol++) {
                let count = 0;
                for (let c = startCol; c < startCol + 3 && c < 4; c++) {
                    const id = row * 4 + c;
                    if (pieces[id] === color) count++;
                }
                if (count === 3) return true;
            }

            // 세로 체크
            for (let startRow = Math.max(0, row - 2); startRow <= Math.min(1, row); startRow++) {
                let count = 0;
                for (let r = startRow; r < startRow + 3 && r < 4; r++) {
                    const id = r * 4 + col;
                    if (pieces[id] === color) count++;
                }
                if (count === 3) return true;
            }

            // 대각선 체크 (오른쪽 아래 방향)
            for (let offset = -2; offset <= 0; offset++) {
                let count = 0;
                for (let d = 0; d < 3; d++) {
                    const r = row + offset + d;
                    const c = col + offset + d;
                    if (r >= 0 && r < 4 && c >= 0 && c < 4) {
                        const id = r * 4 + c;
                        if (pieces[id] === color) count++;
                    }
                }
                if (count === 3) return true;
            }

            // 대각선 체크 (왼쪽 아래 방향)
            for (let offset = -2; offset <= 0; offset++) {
                let count = 0;
                for (let d = 0; d < 3; d++) {
                    const r = row + offset + d;
                    const c = col - offset - d;
                    if (r >= 0 && r < 4 && c >= 0 && c < 4) {
                        const id = r * 4 + c;
                        if (pieces[id] === color) count++;
                    }
                }
                if (count === 3) return true;
            }

            return false;
        },
    },
};

// Firestore 직렬화/역직렬화
const serializePieces = (pieces) => pieces;
const deserializePieces = (data) => {
    const result = {};
    for (const key in data) {
        result[parseInt(key)] = data[key];
    }
    return result;
};

// ═══════════════════════════════════════════════════════════════
// AI 로직
// ═══════════════════════════════════════════════════════════════

const getAIMove = (gameType, pieces, aiColor) => {
    const config = GONU_TYPES[gameType];
    const adjacency = config.adjacency;
    const opponentColor = aiColor === 'B' ? 'R' : 'B';

    // AI의 모든 말 찾기
    const aiPieces = Object.entries(pieces)
        .filter(([, color]) => color === aiColor)
        .map(([nodeId]) => parseInt(nodeId));

    // 가능한 모든 이동 찾기
    const possibleMoves = [];

    for (const fromNode of aiPieces) {
        const targets = adjacency[fromNode] || [];
        for (const toNode of targets) {
            if (pieces[toNode]) continue; // 이미 말이 있음

            // 호박고누 출발선 제한 체크
            if (gameType === 'hobak') {
                const targetNodeInfo = HOBAK_NODES.find(n => n.id === toNode);
                if (targetNodeInfo?.isHome) continue;
            }

            // 우물고누 우물 제한 체크
            if (gameType === 'umul' && config.isWell && config.isWell(toNode)) continue;

            possibleMoves.push({ from: fromNode, to: toNode });
        }
    }

    if (possibleMoves.length === 0) return null;

    // 각 이동에 대한 점수 계산
    const scoredMoves = possibleMoves.map(move => {
        let score = 0;

        // 시뮬레이션: 이 이동을 했을 때
        const simulatedPieces = { ...pieces };
        delete simulatedPieces[move.from];
        simulatedPieces[move.to] = aiColor;

        // 1. 승리 가능한 이동은 최우선
        const winner = config.checkWin(simulatedPieces, aiColor);
        if (winner === aiColor) {
            score += 1000;
        }

        // 2. 상대방의 이동 가능 수 줄이기
        const opponentPieces = Object.entries(simulatedPieces)
            .filter(([, color]) => color === opponentColor)
            .map(([nodeId]) => parseInt(nodeId));

        let opponentMoves = 0;
        for (const nodeId of opponentPieces) {
            const moves = adjacency[nodeId] || [];
            for (const target of moves) {
                if (!simulatedPieces[target]) {
                    if (gameType === 'hobak') {
                        const targetNode = HOBAK_NODES.find(n => n.id === target);
                        if (!targetNode?.isHome) opponentMoves++;
                    } else if (gameType === 'umul') {
                        if (!config.isWell || !config.isWell(target)) opponentMoves++;
                    } else {
                        opponentMoves++;
                    }
                }
            }
        }
        score -= opponentMoves * 5; // 상대방 이동 가능 수가 적을수록 좋음

        // 3. 중앙에 가까울수록 좋음 (밭고누)
        if (gameType === 'bat') {
            const toNode = BAT_NODES.find(n => n.id === move.to);
            if (toNode) {
                const centerDist = Math.abs(toNode.row - 1.5) + Math.abs(toNode.col - 1.5);
                score -= centerDist * 2;
            }

            // 3연속 만들 수 있으면 보너스
            if (config.checkThreeInRow(simulatedPieces, move.to, aiColor)) {
                score += 100;
            }
        }

        // 4. 약간의 랜덤성 추가
        score += Math.random() * 3;

        return { ...move, score };
    });

    // 가장 높은 점수의 이동 선택
    scoredMoves.sort((a, b) => b.score - a.score);
    return scoredMoves[0];
};

// ═══════════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════════

const GonuGame = () => {
    const { user, userDoc } = useAuth();
    const [gameId, setGameId] = useState(null);
    const [gameData, setGameData] = useState(null);
    const [showCreateRoom, setShowCreateRoom] = useState(true);
    const [newRoomId, setNewRoomId] = useState('');
    const [feedback, setFeedback] = useState({ message: '', type: '' });
    const [selectedPiece, setSelectedPiece] = useState(null);
    const [selectedGameType, setSelectedGameType] = useState('umul');
    const [availableRooms, setAvailableRooms] = useState([]);
    const [showRules, setShowRules] = useState(false);
    const [loading, setLoading] = useState(false);
    const [gameMode, setGameMode] = useState('pvp'); // 'pvp' or 'ai'
    const [aiThinking, setAiThinking] = useState(false);
    const [validMoves, setValidMoves] = useState([]);
    const [pendingCapture, setPendingCapture] = useState(null); // 밭고누에서 상대 말 제거 대기

    // 로컬 AI 게임 상태
    const [localGame, setLocalGame] = useState(null);

    const isMyTurn = gameData && user && gameData.turn === (gameData.players.B === user.uid ? 'B' : 'R');
    const myColor = gameData && user && (gameData.players.B === user.uid ? 'B' : 'R');

    const gameIdRef = useRef(gameId);
    useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
    const gameDataRef = useRef(gameData);
    useEffect(() => { gameDataRef.current = gameData; }, [gameData]);
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    useEffect(() => {
        const cleanup = () => {
            const currentGameId = gameIdRef.current;
            const currentGameData = gameDataRef.current;
            const currentUser = userRef.current;
            if (
                currentGameId &&
                currentGameData &&
                currentUser &&
                currentGameData.status === 'waiting' &&
                currentGameData.players.B === currentUser.uid
            ) {
                deleteDoc(doc(db, 'gonuGames', currentGameId));
            }
        };

        window.addEventListener('beforeunload', cleanup);

        return () => {
            window.removeEventListener('beforeunload', cleanup);
        };
    }, []);

    // 유효한 이동 위치 계산
    useEffect(() => {
        if (selectedPiece === null || selectedPiece === undefined) {
            setValidMoves([]);
            return;
        }

        const currentPieces = localGame?.pieces || (gameData ? deserializePieces(gameData.pieces) : {});
        const gameType = localGame?.gameType || gameData?.gameType || 'umul';
        const config = GONU_TYPES[gameType];
        const adjacency = config.adjacency;
        const currentColor = localGame ? 'B' : myColor;
        const pieceId = parseInt(selectedPiece);

        if (currentPieces[pieceId] !== currentColor) {
            setValidMoves([]);
            return;
        }

        const moves = [];
        const targets = adjacency[pieceId] || [];
        const moveCount = localGame?.moveCount || 0;

        for (const target of targets) {
            if (currentPieces[target]) continue;

            // 우물고누 첫 수 제한: 2→5 금지 (우물고누 첫수 규칙)
            if (gameType === 'umul' && moveCount === 0 && config.firstMoveRestriction) {
                const { from, to } = config.firstMoveRestriction;
                if (pieceId === from && target === to) continue;
            }

            // 호박고누 출발선 제한
            if (gameType === 'hobak') {
                const targetNode = HOBAK_NODES.find(n => n.id === target);
                if (targetNode?.isHome) continue;
            }

            moves.push(target);
        }

        setValidMoves(moves);
    }, [selectedPiece, localGame, gameData, myColor]);

    const fetchAvailableRooms = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const q = query(
                collection(db, 'gonuGames'),
                where('status', '==', 'waiting')
            );
            const querySnapshot = await getDocs(q);
            const rooms = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.players.B !== user.uid) {
                    rooms.push({ id: doc.id, ...data });
                }
            });
            setAvailableRooms(rooms);
        } catch (error) {
            console.error("Error fetching rooms:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (showCreateRoom && user && gameMode === 'pvp') {
            fetchAvailableRooms();
            const interval = setInterval(fetchAvailableRooms, 60000);
            return () => clearInterval(interval);
        }
    }, [showCreateRoom, user, fetchAvailableRooms, gameMode]);

    const fetchGameData = useCallback(async () => {
        if (!gameId) return;

        const gameDocRef = doc(db, 'gonuGames', gameId);
        try {
            const docSnap = await getDoc(gameDocRef);
            if (docSnap.exists()) {
                const rawData = docSnap.data();
                setGameData(rawData);
                setShowCreateRoom(false);

                if (rawData.status === 'finished') {
                    setTimeout(async () => {
                        try { await deleteDoc(gameDocRef); } catch (error) { console.error("Error deleting finished game:", error); }
                    }, 10000);
                }
            } else {
                setFeedback({ message: '게임을 찾을 수 없습니다.', type: 'error' });
                setGameId(null);
                setGameData(null);
                setShowCreateRoom(true);
            }
        } catch (error) {
            console.error("Error fetching game data:", error);
        }
    }, [gameId]);

    usePolling(fetchGameData, { interval: 3000, enabled: !!gameId });

    useEffect(() => {
        if (feedback.message) {
            const timer = setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedback.message]);

    // AI 턴 처리 - ref 사용하여 cleanup 문제 방지
    const aiTimerRef = useRef(null);
    const localGameRef = useRef(localGame);

    useEffect(() => {
        localGameRef.current = localGame;
    }, [localGame]);

    useEffect(() => {
        if (!localGame || localGame.status !== 'active' || localGame.turn !== 'R' || aiThinking || pendingCapture) {
            return;
        }

        setAiThinking(true);

        // 기존 타이머 정리
        if (aiTimerRef.current) {
            clearTimeout(aiTimerRef.current);
        }

        aiTimerRef.current = setTimeout(() => {
            const currentGame = localGameRef.current;
            if (!currentGame || currentGame.turn !== 'R') {
                setAiThinking(false);
                return;
            }

            try {
                const move = getAIMove(currentGame.gameType, currentGame.pieces, 'R');

                if (move) {
                    const newPieces = { ...currentGame.pieces };
                    delete newPieces[move.from];
                    newPieces[move.to] = 'R';

                    const config = GONU_TYPES[currentGame.gameType];

                    // 밭고누에서 3연속 체크
                    if (currentGame.gameType === 'bat' && config.checkThreeInRow(newPieces, move.to, 'R')) {
                        const playerPieces = Object.entries(newPieces)
                            .filter(([, color]) => color === 'B')
                            .map(([nodeId]) => parseInt(nodeId));

                        if (playerPieces.length > 0) {
                            const targetIdx = Math.floor(Math.random() * playerPieces.length);
                            delete newPieces[playerPieces[targetIdx]];
                        }
                    }

                    const winner = config.checkWin(newPieces, 'R');

                    setLocalGame({
                        ...currentGame,
                        pieces: newPieces,
                        turn: 'B',
                        status: winner ? 'finished' : 'active',
                        winner: winner,
                        moveCount: (currentGame.moveCount || 0) + 1,
                    });
                } else {
                    // AI가 이동할 수 없으면 플레이어 승리
                    setLocalGame({
                        ...currentGame,
                        status: 'finished',
                        winner: 'B',
                    });
                }
            } catch (error) {
                console.error('AI move error:', error);
            } finally {
                setAiThinking(false);
            }
        }, 1200);

        // cleanup에서 타이머 정리하지 않음 (aiThinking이 true인 동안)
    }, [localGame?.turn, localGame?.status, aiThinking, pendingCapture]);

    const handleStartAIGame = () => {
        const config = GONU_TYPES[selectedGameType];
        setLocalGame({
            gameType: selectedGameType,
            pieces: config.initialPieces(),
            turn: 'B',
            status: 'active',
            winner: null,
            moveCount: 0, // 첫 수 제한 체크용
        });
        setShowCreateRoom(false);
    };

    const handleCreateRoom = async () => {
        if (!user) {
            setFeedback({ message: '로그인이 필요합니다.', type: 'error' });
            return;
        }

        setLoading(true);
        const newGameId = Math.random().toString(36).substring(2, 8);
        const gameRef = doc(db, 'gonuGames', newGameId);
        const gameType = GONU_TYPES[selectedGameType];

        const initialGameData = {
            pieces: serializePieces(gameType.initialPieces()),
            players: { B: user.uid, R: null },
            playerNames: { B: userDoc.name, R: null },
            turn: 'B',
            status: 'waiting',
            winner: null,
            gameType: selectedGameType,
            gameName: gameType.name,
            createdAt: serverTimestamp(),
        };

        try {
            await setDoc(gameRef, initialGameData);
            setGameId(newGameId);
            setFeedback({ message: `${gameType.name} 방 생성 완료! 코드: ${newGameId}`, type: 'success' });
            await fetchGameData();
        } catch (error) {
            console.error("Error creating room:", error);
            setFeedback({ message: '방 생성에 실패했습니다.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleJoinRoom = async (roomIdToJoin) => {
        const targetRoomId = roomIdToJoin || newRoomId.trim();
        if (!targetRoomId) {
            setFeedback({ message: '참가할 방 코드를 입력하세요.', type: 'error' });
            return;
        }
        if (!user) {
            setFeedback({ message: '로그인이 필요합니다.', type: 'error' });
            return;
        }

        setLoading(true);
        const gameRef = doc(db, 'gonuGames', targetRoomId);

        try {
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists()) throw new Error("방을 찾을 수 없습니다.");
                const data = gameDoc.data();
                if (data.players.R) throw new Error("방이 가득 찼습니다.");
                if (data.players.B === user.uid) throw new Error("자신이 만든 방에는 참가할 수 없습니다.");

                transaction.update(gameRef, {
                    'players.R': user.uid,
                    'playerNames.R': userDoc.name,
                    status: 'active',
                });
            });
            setGameId(targetRoomId);
            await fetchGameData();
        } catch (error) {
            console.error("Error joining room: ", error);
            setFeedback({ message: `참가 실패: ${error.message}`, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleAdminDeleteRoom = async (roomId) => {
        if (!userDoc?.isAdmin) {
            setFeedback({ message: '삭제 권한이 없습니다.', type: 'error' });
            return;
        }
        try {
            await deleteDoc(doc(db, 'gonuGames', roomId));
            setFeedback({ message: `방 ${roomId}가 삭제되었습니다.`, type: 'success' });
            fetchAvailableRooms();
        } catch (error) {
            console.error("Error deleting room by admin:", error);
            setFeedback({ message: '방 삭제에 실패했습니다.', type: 'error' });
        }
    };

    // 밭고누에서 상대 말 제거
    const handleCaptureClick = (nodeId) => {
        if (!pendingCapture) return;

        const pieces = localGame?.pieces || deserializePieces(gameData.pieces);
        const opponentColor = pendingCapture.capturer === 'B' ? 'R' : 'B';

        if (pieces[nodeId] !== opponentColor) {
            setFeedback({ message: '상대방의 말을 선택하세요.', type: 'error' });
            return;
        }

        const newPieces = { ...pieces };
        delete newPieces[nodeId];

        const config = GONU_TYPES[localGame?.gameType || gameData.gameType];
        const winner = config.checkWin(newPieces, pendingCapture.capturer);

        if (localGame) {
            setLocalGame(prev => ({
                ...prev,
                pieces: newPieces,
                turn: pendingCapture.capturer === 'B' ? 'R' : 'B',
                status: winner ? 'finished' : 'active',
                winner: winner,
            }));
        }

        setPendingCapture(null);
    };

    const handleMove = useCallback(async (targetNode) => {
        if (pendingCapture) {
            handleCaptureClick(targetNode);
            return;
        }

        if (selectedPiece === null) return;

        // 로컬 AI 게임
        if (localGame) {
            if (localGame.status !== 'active' || localGame.turn !== 'B') return;

            const pieces = localGame.pieces;
            if (pieces[selectedPiece] !== 'B') return;
            if (!validMoves.includes(targetNode)) {
                setFeedback({ message: '이동할 수 없는 위치입니다.', type: 'error' });
                return;
            }

            const newPieces = { ...pieces };
            delete newPieces[selectedPiece];
            newPieces[targetNode] = 'B';

            const config = GONU_TYPES[localGame.gameType];

            // 밭고누에서 3연속 체크
            if (localGame.gameType === 'bat' && config.checkThreeInRow(newPieces, targetNode, 'B')) {
                // 상대 말 제거 대기 상태로
                setLocalGame(prev => ({
                    ...prev,
                    pieces: newPieces,
                }));
                setPendingCapture({ capturer: 'B' });
                setSelectedPiece(null);
                setFeedback({ message: '3연속! 제거할 상대 말을 선택하세요.', type: 'success' });
                return;
            }

            const winner = config.checkWin(newPieces, 'B');

            setLocalGame(prev => ({
                ...prev,
                pieces: newPieces,
                turn: 'R',
                status: winner ? 'finished' : 'active',
                winner: winner,
                moveCount: (prev.moveCount || 0) + 1,
            }));
            setSelectedPiece(null);

            if (winner === 'B') {
                setFeedback({ message: '🎉 승리했습니다!', type: 'success' });
            }
            return;
        }

        // 온라인 게임
        if (!isMyTurn || !gameData) return;

        const pieces = deserializePieces(gameData.pieces);
        if (pieces[selectedPiece] !== myColor) return;
        if (!validMoves.includes(targetNode)) {
            setFeedback({ message: '이동할 수 없는 위치입니다.', type: 'error' });
            return;
        }

        const gameRef = doc(db, 'gonuGames', gameId);

        try {
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists()) throw new Error('게임이 존재하지 않습니다.');
                const currentData = gameDoc.data();
                if (currentData.turn !== myColor) throw new Error('상대방의 턴입니다.');

                const newPieces = { ...deserializePieces(currentData.pieces) };
                delete newPieces[selectedPiece];
                newPieces[targetNode] = myColor;

                const config = GONU_TYPES[gameData.gameType];
                const winner = config.checkWin(newPieces, myColor);
                const opponentColor = myColor === 'B' ? 'R' : 'B';

                transaction.update(gameRef, {
                    pieces: serializePieces(newPieces),
                    turn: opponentColor,
                    status: winner ? 'finished' : 'active',
                    winner: winner,
                });

                if (winner) {
                    const userDocRef = doc(db, 'users', user.uid);
                    transaction.update(userDocRef, { coupons: increment(1) });

                    logActivity(db, {
                        classCode: userDoc?.classCode,
                        userId: user.uid,
                        userName: userDoc?.name || '사용자',
                        type: ACTIVITY_TYPES.GAME_WIN,
                        description: `${gameData.gameName || '고누'} 승리 - 쿠폰 1개 획득`,
                        couponAmount: 1,
                        metadata: {
                            gameType: 'gonu',
                            gameVariant: gameData.gameType,
                            gameName: gameData.gameName
                        }
                    });
                }
            });
            setSelectedPiece(null);
        } catch (error) {
            console.error('Move error:', error);
            setFeedback({ message: `이동 실패: ${error.message}`, type: 'error' });
        }
    }, [gameId, gameData, isMyTurn, myColor, selectedPiece, user?.uid, localGame, validMoves, pendingCapture]);

    const handleNodeClick = (nodeId) => {
        if (pendingCapture) {
            handleCaptureClick(nodeId);
            return;
        }

        const pieces = localGame?.pieces || (gameData ? deserializePieces(gameData.pieces) : {});
        const currentTurn = localGame?.turn || gameData?.turn;
        const currentColor = localGame ? 'B' : myColor;
        const status = localGame?.status || gameData?.status;

        if (status !== 'active') return;
        if (localGame && currentTurn !== 'B') return;
        if (!localGame && !isMyTurn) return;

        // 자기 말 선택
        if (pieces[nodeId] === currentColor) {
            setSelectedPiece(nodeId);
            return;
        }

        // 빈 칸으로 이동
        if (selectedPiece !== null && !pieces[nodeId]) {
            handleMove(nodeId);
        }
    };

    const handleLeaveGame = async () => {
        if (localGame) {
            setLocalGame(null);
            setShowCreateRoom(true);
            setSelectedPiece(null);
            setPendingCapture(null);
            return;
        }

        if (gameData && gameData.status === 'waiting' && gameId && gameData.players.B === user.uid) {
            try { await deleteDoc(doc(db, 'gonuGames', gameId)); } catch (error) { console.error("Error deleting room:", error); }
        }

        setGameId(null);
        setGameData(null);
        setShowCreateRoom(true);
        setSelectedPiece(null);
        setPendingCapture(null);
    };

    // 게임 보드 렌더링
    const renderBoard = () => {
        const gameType = localGame?.gameType || gameData?.gameType || 'umul';
        const config = GONU_TYPES[gameType];
        const pieces = localGame?.pieces || (gameData ? deserializePieces(gameData.pieces) : {});
        const currentTurn = localGame?.turn || gameData?.turn;

        return (
            <svg
                className="gonu-svg-board"
                width={config.boardWidth}
                height={config.boardHeight}
                viewBox={`0 0 ${config.boardWidth} ${config.boardHeight}`}
                style={{ width: '100%', maxWidth: config.boardWidth, height: 'auto' }}
            >
                {/* 배경 */}
                <rect x="0" y="0" width={config.boardWidth} height={config.boardHeight} fill="#2a2a3a" rx="10" />

                {/* 우물고누: 원형 둘레 + X 대각선 */}
                {gameType === 'umul' && (
                    <>
                        {/* 원 둘레 */}
                        <circle
                            cx={150}
                            cy={150}
                            r={110}
                            fill="none"
                            stroke="#555"
                            strokeWidth="3"
                        />
                        {/* X 대각선 (상-중앙-하, 좌-중앙-우) */}
                        <line x1={150} y1={40} x2={150} y2={260} stroke="#555" strokeWidth="3" />
                        <line x1={40} y1={150} x2={260} y2={150} stroke="#555" strokeWidth="3" />
                    </>
                )}

                {/* 다른 게임 타입: 일반 연결선 */}
                {gameType !== 'umul' && config.edges.map(([from, to], idx) => {
                    const fromNode = config.nodes.find(n => n.id === from);
                    const toNode = config.nodes.find(n => n.id === to);
                    return (
                        <line
                            key={`edge-${idx}`}
                            x1={fromNode.x}
                            y1={fromNode.y}
                            x2={toNode.x}
                            y2={toNode.y}
                            stroke="#555"
                            strokeWidth="3"
                        />
                    );
                })}

                {/* 노드 및 말 */}
                {config.nodes.map(node => {
                    const piece = pieces[node.id];
                    const isSelected = selectedPiece === node.id;
                    const isValidMove = validMoves.includes(node.id);
                    const isWell = gameType === 'umul' && config.isWell && config.isWell(node.id);
                    const isHome = node.isHome;
                    const isPendingCapture = pendingCapture && piece && piece !== pendingCapture.capturer;

                    return (
                        <g
                            key={`node-${node.id}`}
                            onClick={() => handleNodeClick(node.id)}
                            style={{ cursor: 'pointer' }}
                        >
                            {/* 노드 배경 */}
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r={isWell ? 20 : 22}
                                fill={isWell ? '#333' : isValidMove ? '#4a7' : isHome ? (isHome === 'B' ? '#334' : '#433') : '#444'}
                                stroke={isSelected ? '#0ff' : isValidMove ? '#4f7' : isPendingCapture ? '#f44' : '#666'}
                                strokeWidth={isSelected || isValidMove || isPendingCapture ? 3 : 2}
                            />

                            {/* 우물 표시 */}
                            {isWell && (
                                <text
                                    x={node.x}
                                    y={node.y + 5}
                                    textAnchor="middle"
                                    fill="#666"
                                    fontSize="12"
                                    fontWeight="bold"
                                >
                                    우물
                                </text>
                            )}

                            {/* 출발선 표시 */}
                            {isHome && !piece && (
                                <text
                                    x={node.x}
                                    y={node.y + 5}
                                    textAnchor="middle"
                                    fill={isHome === 'B' ? '#88f' : '#f88'}
                                    fontSize="10"
                                >
                                    출발
                                </text>
                            )}

                            {/* 말 */}
                            {piece && (
                                <>
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={18}
                                        fill={piece === 'B' ? '#1a5fb4' : '#c00'}
                                        stroke={piece === 'B' ? '#62a0ea' : '#f66'}
                                        strokeWidth="3"
                                    />
                                    <circle
                                        cx={node.x - 5}
                                        cy={node.y - 5}
                                        r={6}
                                        fill={piece === 'B' ? '#62a0ea' : '#f44'}
                                        opacity="0.6"
                                    />
                                </>
                            )}

                            {/* 이동 가능 표시 */}
                            {isValidMove && !piece && (
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={8}
                                    fill="#4f7"
                                    opacity="0.6"
                                />
                            )}
                        </g>
                    );
                })}

                {/* 턴 표시 */}
                <text
                    x={config.boardWidth / 2}
                    y={config.boardHeight - 8}
                    textAnchor="middle"
                    fill="#aaa"
                    fontSize="11"
                >
                    {currentTurn === 'B' ? '🔵 파랑 차례' : '🔴 빨강 차례'}
                </text>
            </svg>
        );
    };

    if (showCreateRoom) {
        return (
            <div className="gonu-container">
                <div className="room-creation">
                    <h2>🎯 고누 게임</h2>
                    <p>한국 전통 보드게임을 즐겨보세요!</p>

                    {feedback.message && <div className={`feedback ${feedback.type}`}>{feedback.message}</div>}

                    {/* 게임 모드 선택 */}
                    <div className="game-mode-selector">
                        <h3>🎮 게임 모드</h3>
                        <div className="mode-buttons">
                            <button
                                className={`mode-btn ${gameMode === 'ai' ? 'selected' : ''}`}
                                onClick={() => setGameMode('ai')}
                            >
                                🤖 AI 대전
                            </button>
                            <button
                                className={`mode-btn ${gameMode === 'pvp' ? 'selected' : ''}`}
                                onClick={() => setGameMode('pvp')}
                            >
                                👥 친구 대전
                            </button>
                        </div>
                    </div>

                    <div className="game-type-selector">
                        <h3>게임 종류 선택</h3>
                        <div className="game-types">
                            {Object.entries(GONU_TYPES).map(([key, type]) => (
                                <label key={key} className={`game-type-option ${selectedGameType === key ? 'selected' : ''}`}>
                                    <input type="radio" value={key} checked={selectedGameType === key} onChange={(e) => setSelectedGameType(e.target.value)} />
                                    <div className="game-type-info">
                                        <strong>{type.name}</strong>
                                        <small>{type.description}</small>
                                    </div>
                                </label>
                            ))}
                        </div>
                        <button onClick={() => setShowRules(!showRules)} className="rules-toggle-btn">
                            {showRules ? '규칙 숨기기' : '규칙 보기'}
                        </button>

                        {showRules && (
                            <div className="rules-display">
                                <h4>{GONU_TYPES[selectedGameType].name} 규칙</h4>
                                <ul>
                                    {GONU_TYPES[selectedGameType].rules.map((rule, idx) => <li key={idx}>{rule}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="room-actions">
                        {gameMode === 'ai' ? (
                            <button onClick={handleStartAIGame} className="create-room-btn" disabled={loading}>
                                🤖 AI와 대전 시작
                            </button>
                        ) : (
                            <>
                                <button onClick={handleCreateRoom} className="create-room-btn" disabled={loading}>
                                    {loading ? <span className="loading"></span> : '새로운 방 만들기'}
                                </button>

                                <div className="join-room">
                                    <input type="text" value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)} placeholder="방 코드 입력" maxLength="6" />
                                    <button onClick={() => handleJoinRoom()} disabled={loading}>{loading ? <span className="loading"></span> : '코드로 참가'}</button>
                                </div>
                            </>
                        )}
                    </div>

                    {gameMode === 'pvp' && availableRooms.length > 0 && (
                        <div className="available-rooms">
                            <h3>📋 대기 중인 방 목록</h3>
                            <div className="rooms-list">
                                {availableRooms.map((room) => (
                                    <div key={room.id} className="room-item">
                                        <div className="room-info">
                                            <span className="room-type">{room.gameName}</span>
                                            <span className="room-host">호스트: {room.playerNames.B}</span>
                                            <span className="room-code">코드: {room.id}</span>
                                        </div>
                                        <div className="room-item-buttons">
                                            <button onClick={() => handleJoinRoom(room.id)} className="join-btn" disabled={loading}>참가</button>
                                            {userDoc?.isAdmin && (
                                                <button onClick={() => handleAdminDeleteRoom(room.id)} className="delete-btn">삭제</button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 온라인 게임 로딩
    if (!localGame && !gameData) {
        return <AlchanLoading />;
    }

    const currentGameType = localGame?.gameType || gameData?.gameType || 'umul';
    const currentStatus = localGame?.status || gameData?.status;
    const currentWinner = localGame?.winner || gameData?.winner;
    const currentTurn = localGame?.turn || gameData?.turn;

    return (
        <div className="gonu-container">
            <div className="game-info">
                <h2>
                    {GONU_TYPES[currentGameType].name}
                    {localGame && ' (AI 대전)'}
                    {gameId && ` (방: ${gameId})`}
                </h2>

                {!localGame && (
                    <div className="player-info">
                        <p className={`player-b ${currentTurn === 'B' ? 'active-turn' : ''}`}>
                            🔵 {gameData?.playerNames?.B || '플레이어 1'} {gameData?.players?.B === user?.uid && '(나)'}
                        </p>
                        <p className={`player-r ${currentTurn === 'R' ? 'active-turn' : ''}`}>
                            🔴 {gameData?.playerNames?.R || '대기중...'} {gameData?.players?.R === user?.uid && '(나)'}
                        </p>
                    </div>
                )}

                {localGame && (
                    <div className="player-info">
                        <p className={`player-b ${currentTurn === 'B' ? 'active-turn' : ''}`}>
                            🔵 나 (파랑)
                        </p>
                        <p className={`player-r ${currentTurn === 'R' ? 'active-turn' : ''}`}>
                            🔴 AI (적) {aiThinking && '🤔 생각 중...'}
                        </p>
                    </div>
                )}

                {currentStatus === 'finished' ? (
                    <div className="game-status winner">
                        {localGame ? (
                            currentWinner === 'B' ? '🎉 승리했습니다!' : '😢 AI에게 패배했습니다.'
                        ) : (
                            currentWinner === myColor ? '🎉 승리! 쿠폰 1개를 획득했습니다!' : '😢 패배했습니다.'
                        )}
                    </div>
                ) : currentStatus === 'waiting' ? (
                    <div className="game-status">상대방을 기다리는 중...</div>
                ) : pendingCapture ? (
                    <div className="game-status capture-mode">🎯 제거할 상대 말을 선택하세요!</div>
                ) : (
                    <div className="game-status">
                        {localGame ? (
                            currentTurn === 'B' ? "🎯 당신의 턴입니다." : "⏳ AI가 생각 중..."
                        ) : (
                            isMyTurn ? "🎯 당신의 턴입니다." : "⏳ 상대방의 턴을 기다리는 중..."
                        )}
                    </div>
                )}
            </div>

            <div className="board-area">
                {renderBoard()}
            </div>

            {feedback.message && <div className={`feedback ${feedback.type}`}>{feedback.message}</div>}

            <button onClick={handleLeaveGame} className="leave-button">
                {currentStatus === 'finished' ? '나가기' : '게임 나가기'}
            </button>
        </div>
    );
};

export default GonuGame;
