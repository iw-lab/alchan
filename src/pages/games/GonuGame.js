// src/GonuGame.js - UI/UX 개선
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

const BOARD_SIZE = 5;

// 고누 게임 종류와 설정
const GONU_TYPES = {
    hobak: {
        name: '호박고누',
        description: '각 플레이어가 5개의 말을 가지고 시작. 상하좌우로만 이동 가능.',
        rules: [
            '말은 상하좌우 인접한 빈 칸으로만 이동 가능',
            '상대방이 더 이상 움직일 수 없게 만들면 승리',
            '대각선 이동 불가',
            '말을 잡는 기능은 없음'
        ],
        initialBoard: () => {
            const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
            board[0][0] = 'B'; board[0][1] = 'B'; board[0][2] = 'B'; board[0][3] = 'B'; board[0][4] = 'B';
            board[4][0] = 'R'; board[4][1] = 'R'; board[4][2] = 'R'; board[4][3] = 'R'; board[4][4] = 'R';
            return board;
        },
        canCapture: false,
        allowDiagonal: false
    },
    cham: {
        name: '참고누',
        description: '각 플레이어가 4개의 말을 가지고 시작. 상하좌우와 대각선 이동 가능.',
        rules: [
            '말은 상하좌우 및 대각선 인접한 빈 칸으로 이동 가능',
            '상대방 말을 뛰어넘어 잡을 수 있음',
            '상대방 말을 모두 잡으면 승리'
        ],
        initialBoard: () => {
            const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
            board[0][1] = 'B'; board[0][3] = 'B'; board[1][1] = 'B'; board[1][3] = 'B';
            board[3][1] = 'R'; board[3][3] = 'R'; board[4][1] = 'R'; board[4][3] = 'R';
            return board;
        },
        canCapture: true,
        allowDiagonal: true
    },
    gonjil: {
        name: '곤질고누',
        description: '각 플레이어가 6개의 말을 가지고 시작. 포위하여 잡기 가능.',
        rules: [
            '말은 상하좌우로만 이동 가능',
            '상대방 말을 포위하면 잡을 수 있음',
            '상대방 말을 모두 잡거나 움직일 수 없게 만들면 승리'
        ],
        initialBoard: () => {
            const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
            board[0][0] = 'B'; board[0][2] = 'B'; board[0][4] = 'B'; board[1][1] = 'B'; board[1][2] = 'B'; board[1][3] = 'B';
            board[3][1] = 'R'; board[3][2] = 'R'; board[3][3] = 'R'; board[4][0] = 'R'; board[4][2] = 'R'; board[4][4] = 'R';
            return board;
        },
        canCapture: true,
        allowDiagonal: false
    }
};

// Firestore 직렬화/역직렬화 함수
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
    const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    for (const key in serializedBoard) {
        const [r, c] = key.split('-').map(Number);
        board[r][c] = serializedBoard[key];
    }
    return board;
};

const GonuGame = () => {
    const { user, userDoc } = useAuth();
    const [gameId, setGameId] = useState(null);
    const [gameData, setGameData] = useState(null);
    const [showCreateRoom, setShowCreateRoom] = useState(true);
    const [newRoomId, setNewRoomId] = useState('');
    const [feedback, setFeedback] = useState({ message: '', type: '' });
    const [selectedPiece, setSelectedPiece] = useState(null);
    const [selectedGameType, setSelectedGameType] = useState('hobak');
    const [availableRooms, setAvailableRooms] = useState([]);
    const [showRules, setShowRules] = useState(false);
    const [loading, setLoading] = useState(false);

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
        if (showCreateRoom && user) {
            fetchAvailableRooms();
            // 🔥 [최적화] 5초 → 60초로 변경 (읽기 비용 절감)
            const interval = setInterval(fetchAvailableRooms, 60000);
            return () => clearInterval(interval);
        }
    }, [showCreateRoom, user, fetchAvailableRooms]);

    const fetchGameData = useCallback(async () => {
        if (!gameId) return;

        const gameDocRef = doc(db, 'gonuGames', gameId);
        try {
            const docSnap = await getDoc(gameDocRef);
            if (docSnap.exists()) {
                const rawData = docSnap.data();
                const deserializedData = { ...rawData, board: deserializeBoard(rawData.board) };
                setGameData(deserializedData);
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

    // 🔥 [최적화] 60초 → 3분으로 변경 (읽기 비용 절감)
    usePolling(fetchGameData, { interval: 180000, enabled: !!gameId });

    useEffect(() => {
        if (feedback.message) {
            const timer = setTimeout(() => setFeedback({ message: '', type: '' }), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedback.message]);

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
            board: serializeBoard(gameType.initialBoard()),
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

    const handleMove = useCallback(async (targetRow, targetCol) => {
        if (!isMyTurn || !selectedPiece || !gameData) return;

        const { row: fromRow, col: fromCol } = selectedPiece;
        const currentBoard = gameData.board;
        const piece = currentBoard[fromRow][fromCol];
        const gameType = GONU_TYPES[gameData.gameType || 'hobak'];

        if (piece !== myColor) return;

        const opponentColor = myColor === 'B' ? 'R' : 'B';

        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        if (gameType.allowDiagonal) {
            directions.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        }

        let newRow = targetRow, newCol = targetCol, captured = [], isValidMove = false;

        if (targetRow < 0 || targetRow >= BOARD_SIZE || targetCol < 0 || targetCol >= BOARD_SIZE) return;

        if (gameType.name === '참고누' && gameType.canCapture) {
            const clickedPiece = currentBoard[targetRow][targetCol];
            if (Math.abs(targetRow - fromRow) <= 1 && Math.abs(targetCol - fromCol) <= 1 && clickedPiece === opponentColor) {
                const jumpRow = targetRow + (targetRow - fromRow), jumpCol = targetCol + (targetCol - fromCol);
                if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE && currentBoard[jumpRow][jumpCol] === null) {
                    newRow = jumpRow; newCol = jumpCol; captured.push([targetRow, targetCol]); isValidMove = true;
                }
            } else if (currentBoard[targetRow][targetCol] === null) {
                isValidMove = directions.some(([dr, dc]) => fromRow + dr === targetRow && fromCol + dc === targetCol);
            }
        } else {
            if (currentBoard[targetRow][targetCol] === null) {
                isValidMove = directions.some(([dr, dc]) => fromRow + dr === targetRow && fromCol + dc === targetCol);
            }
        }

        if (!isValidMove) {
            setFeedback({ message: '유효하지 않은 이동입니다.', type: 'error' });
            return;
        }

        const gameRef = doc(db, 'gonuGames', gameId);
        try {
            await runTransaction(db, async (transaction) => {
                const gameDoc = await transaction.get(gameRef);
                if (!gameDoc.exists()) throw new Error('게임이 존재하지 않습니다.');
                const currentData = gameDoc.data();
                if (currentData.turn !== myColor) throw new Error('상대방의 턴입니다.');

                let board = deserializeBoard(currentData.board);
                board[fromRow][fromCol] = null;
                captured.forEach(([r, c]) => { board[r][c] = null; });
                board[newRow][newCol] = myColor;

                let winner = null;
                // 승리 조건 검사 로직 (생략)

                transaction.update(gameRef, {
                    board: serializeBoard(board),
                    turn: opponentColor,
                    status: winner ? 'finished' : 'active',
                    winner: winner,
                });
                if (winner) {
                    const userDocRef = doc(db, 'users', user.uid);
                    transaction.update(userDocRef, { coupons: increment(1) });

                    // 🔥 활동 로그 기록 (고누 승리)
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
    }, [gameId, gameData, isMyTurn, myColor, selectedPiece, user?.uid]);

    const handlePieceClick = (row, col) => {
        if (!isMyTurn || gameData.status !== 'active') return;
        const piece = gameData.board[row][col];
        if (piece === myColor) {
            setSelectedPiece({ row, col });
        } else if (selectedPiece) {
            handleMove(row, col);
        }
    };

    const handleLeaveGame = async () => {
        if (gameData && gameData.status === 'waiting' && gameId && gameData.players.B === user.uid) {
            try { await deleteDoc(doc(db, 'gonuGames', gameId)); } catch (error) { console.error("Error deleting room:", error); }
        }

        setGameId(null);
        setGameData(null);
        setShowCreateRoom(true);
        setSelectedPiece(null);
    };

    if (showCreateRoom) {
        return (
            <div className="gonu-container">
                <div className="room-creation">
                    <h2>🎯 고누 게임</h2>
                    <p>전통 한국 보드게임을 온라인으로 즐겨보세요!</p>

                    {feedback.message && <div className={`feedback ${feedback.type}`}>{feedback.message}</div>}

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
                        <button onClick={handleCreateRoom} className="create-room-btn" disabled={loading}>
                            {loading ? <span className="loading"></span> : '새로운 방 만들기'}
                        </button>

                        <div className="join-room">
                            <input type="text" value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)} placeholder="방 코드 입력" maxLength="6" />
                            <button onClick={() => handleJoinRoom()} disabled={loading}>{loading ? <span className="loading"></span> : '코드로 참가'}</button>
                        </div>
                    </div>

                    {availableRooms.length > 0 && (
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

    if (!gameData) {
        return <AlchanLoading />;
    }

    // Force strict dark mode background via inline style
    const containerStyle = {
        backgroundColor: '#0a0a12',
        minHeight: '100%',
        width: '100%'
    };

    return (
        <div className="gonu-container" style={containerStyle}>
            <div className="game-info">
                <h2>{gameData.gameName || '고누 게임'} (방: {gameId})</h2>
                <div className="player-info">
                    <p className={`player-b ${gameData.turn === 'B' ? 'active-turn' : ''}`}>
                        ⚫ {gameData.playerNames.B || '플레이어 1'} {gameData.players.B === user?.uid && '(나)'}
                    </p>
                    <p className={`player-r ${gameData.turn === 'R' ? 'active-turn' : ''}`}>
                        🔴 {gameData.playerNames.R || '대기중...'} {gameData.players.R === user?.uid && '(나)'}
                    </p>
                </div>

                {gameData.status === 'finished' ? (
                    <div className="game-status winner">
                        {gameData.winner === myColor ? '🎉 승리! 쿠폰 1개를 획득했습니다!' : '😢 패배했습니다.'}
                    </div>
                ) : gameData.status === 'waiting' ? (
                    <div className="game-status">상대방을 기다리는 중...</div>
                ) : (
                    <div className="game-status">{isMyTurn ? "🎯 당신의 턴입니다." : "⏳ 상대방의 턴을 기다리는 중..."}</div>
                )}
            </div>

            <div className="board-area">
                <div className="gonu-board">
                    {gameData.board.map((row, rIndex) => (
                        row.map((cell, cIndex) => (
                            <div
                                key={`${rIndex}-${cIndex}`}
                                className={`cell ${selectedPiece && selectedPiece.row === rIndex && selectedPiece.col === cIndex ? 'selected' : ''}`}
                                onClick={() => handlePieceClick(rIndex, cIndex)}
                            >
                                {cell === 'B' && <div className="piece black"></div>}
                                {cell === 'R' && <div className="piece red"></div>}
                            </div>
                        ))
                    ))}
                </div>
            </div>

            {feedback.message && <div className={`feedback ${feedback.type}`}>{feedback.message}</div>}

            <button onClick={handleLeaveGame} className="leave-button">
                {gameData.status === 'finished' ? '나가기' : '게임 나가기'}
            </button>
        </div>
    );
};

export default GonuGame;
