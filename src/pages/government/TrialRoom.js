import { processFineTransaction, transferCash } from "../../firebase";
// src/TrialRoom.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  doc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  deleteDoc,
  writeBatch,
  getDocs,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { usePolling, POLLING_INTERVALS } from "../../hooks/usePolling";
import "./TrialRoom.css";

// 개선된 아바타 컴포넌트
const Avatar = ({ role, name, isActive, userId, onAvatarClick, showSpeechBubble, canGrantPermission }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isWalking, setIsWalking] = useState(false);
  
  const avatarStyles = {
    judge: { bg: "#6f42c1", icon: "⚖️", title: "판사" },
    prosecutor: { bg: "#dc3545", icon: "📋", title: "검사" },
    lawyer: { bg: "#0d6efd", icon: "💼", title: "변호사" },
    complainant: { bg: "#198754", icon: "📝", title: "원고" },
    defendant: { bg: "#fd7e14", icon: "🛡️", title: "피고" },
    jury: { bg: "#0dcaf0", icon: "👥", title: "배심원" },
    spectator: { bg: "#6c757d", icon: "👀", title: "방청객" },
  };

  const style = avatarStyles[role] || avatarStyles.spectator;

  // 랜덤 움직임 효과 (선택적)
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        setIsWalking(true);
        setPosition({
          x: Math.random() * 10 - 5,
          y: Math.random() * 10 - 5
        });
        setTimeout(() => setIsWalking(false), 500);
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [isActive]);

  const handleClick = () => {
    if (onAvatarClick) {
      onAvatarClick(userId);
    }
  };

  return (
    <div 
      className={`avatar ${isActive ? 'active' : ''} ${isWalking ? 'walking' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-role={role}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: canGrantPermission ? 'pointer' : 'default'
      }}
    >
      {/* 말풍선 - 호버 또는 특정 상태에서 표시 */}
      {(isHovered || showSpeechBubble) && (
        <div className={`speech-bubble ${showSpeechBubble ? 'show' : ''}`}>
          {showSpeechBubble ? "⚠️ 침묵 중" : canGrantPermission && userId ? "클릭하여 침묵 패널티 관리" : name}
        </div>
      )}
      
      <div className="avatar-circle" style={{ backgroundColor: style.bg }}>
        <span className="avatar-icon">{style.icon}</span>
      </div>
      <div className="avatar-name">{name || "빈 자리"}</div>
      <div className="avatar-role">{style.title}</div>
    </div>
  );
};

const TrialRoom = ({ roomId, classCode, currentUser, users, onClose }) => {
  const [roomData, setRoomData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [userRole, setUserRole] = useState("spectator");
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [isSilenced, setIsSilenced] = useState(false); // 발언권 대신 침묵 패널티 사용
  const [votingData, setVotingData] = useState(null);
  const [myVote, setMyVote] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 메시지 자동 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 재판방 데이터 폴링(onSnapshot → polling)으로 읽기 비용 절감
  const fetchRoomSnapshot = useCallback(async () => {
    if (!roomId || !classCode) return null;
    const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
    const docSnap = await getDoc(roomRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  }, [roomId, classCode]);

  const { data: polledRoom, loading: roomPolling } = usePolling(fetchRoomSnapshot, {
    interval: 10 * 60 * 1000, // 🔥 [최적화] 10분 주기 폴링 (Firestore 읽기 최소화)
    enabled: !!roomId && !!classCode,
    deps: [roomId, classCode],
  });

  useEffect(() => {
    if (roomPolling) return;
    if (!polledRoom) {
      setRoomData(null);
      setVotingData(null);
      setLoading(false);
      return;
    }
    setRoomData(polledRoom);

    const voting = polledRoom.voting || null;
    setVotingData(voting);
    if (!voting || !voting.isActive) {
      setMyVote(null);
    }

    let currentRole = "spectator";
    if (polledRoom.judgeId === currentUser.id) {
      currentRole = "judge";
    } else if (polledRoom.complainantId === currentUser.id) {
      currentRole = "complainant";
    } else if (polledRoom.defendantId === currentUser.id) {
      currentRole = "defendant";
    } else if (polledRoom.prosecutorId === currentUser.id) {
      currentRole = "prosecutor";
    } else if (polledRoom.lawyerId === currentUser.id) {
      currentRole = "lawyer";
    } else if (polledRoom.juryIds?.includes(currentUser.id)) {
      currentRole = "jury";
    }
    setUserRole(currentRole);

    setIsSilenced(Boolean(polledRoom.silencedUsers?.includes(currentUser.id)));
    setLoading(false);
  }, [polledRoom, roomPolling, currentUser.id]);

  useEffect(() => {
    if (!roomId || !classCode) return;
    handleJoinRoom();
    return () => {
      handleLeaveRoom();
    };
  }, [roomId, classCode]);

  // 채팅/증거는 폴링으로 조회 (읽기 비용 절감)
  const fetchMessages = useCallback(async () => {
    if (!roomId || !classCode) return [];
    const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"), limit(100));
    const snapshot = await getDocs(messagesQuery);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }, [roomId, classCode]);

  const fetchEvidence = useCallback(async () => {
    if (!roomId || !classCode) return [];
    const evidenceRef = collection(db, "classes", classCode, "trialRooms", roomId, "evidence");
    const evidenceQuery = query(evidenceRef, orderBy("uploadedAt", "desc"), limit(50));
    const snapshot = await getDocs(evidenceQuery);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  }, [roomId, classCode]);

  const { data: polledMessages } = usePolling(fetchMessages, {
    interval: 10 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 10분
    enabled: !!roomId && !!classCode,
    deps: [roomId, classCode],
  });

  const { data: polledEvidence } = usePolling(fetchEvidence, {
    interval: POLLING_INTERVALS.NORMAL, // 5분 주기
    enabled: !!roomId && !!classCode,
    deps: [roomId, classCode],
  });

  useEffect(() => {
    if (polledMessages) setMessages(polledMessages);
  }, [polledMessages]);

  useEffect(() => {
    if (polledEvidence) setEvidence(polledEvidence);
  }, [polledEvidence]);

  const handleJoinRoom = async () => {
    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      
      // Get the latest room data to check for available roles
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
          console.error("Trial room not found!");
          return;
      }
      const currentRoomData = roomSnap.data();
      let updateData = {
          participants: arrayUnion(currentUser.id),
          lastActivity: serverTimestamp(),
      };
      let assignedRole = '';

      // Automatic role assignment based on job
      if (currentUser.job === '판사' && !currentRoomData.judgeId) {
          updateData.judgeId = currentUser.id;
          updateData.judgeName = currentUser.name || currentUser.displayName;
          assignedRole = '판사';
      } else if (currentUser.job === '검사' && !currentRoomData.prosecutorId) {
          updateData.prosecutorId = currentUser.id;
          updateData.prosecutorName = currentUser.name || currentUser.displayName;
          assignedRole = '검사';
      } else if (currentUser.job === '변호사' && !currentRoomData.lawyerId) {
          updateData.lawyerId = currentUser.id;
          updateData.lawyerName = currentUser.name || currentUser.displayName;
          assignedRole = '변호사';
      }

      await updateDoc(roomRef, updateData);
      
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      const joinMessage = `${currentUser.name || currentUser.displayName}님이 입장했습니다.`;
      const roleMessage = assignedRole ? ` ${assignedRole} 역할을 자동으로 배정받았습니다.` : '';
      
      await addDoc(messagesRef, {
        type: "system",
        text: joinMessage + roleMessage,
        timestamp: serverTimestamp(),
      });

    } catch (error) {
      console.error("Error joining room:", error);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      await updateDoc(roomRef, {
        participants: arrayRemove(currentUser.id),
        lastActivity: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  };

  const handleTakeRole = async (role) => {
    if (!roomData) return;
    
    const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
    let updateData = {};
    let roleTitle = "";
    
    switch (role) {
      case "prosecutor":
        if (roomData.prosecutorId) return alert("이미 검사가 있습니다.");
        updateData.prosecutorId = currentUser.id;
        updateData.prosecutorName = currentUser.name || currentUser.displayName;
        roleTitle = "검사";
        break;
      case "lawyer":
        if (roomData.lawyerId) return alert("이미 변호사가 있습니다.");
        updateData.lawyerId = currentUser.id;
        updateData.lawyerName = currentUser.name || currentUser.displayName;
        roleTitle = "변호사";
        break;
      case "jury":
        if (roomData.juryIds?.includes(currentUser.id)) return alert("이미 배심원입니다.");
        if ((roomData.juryIds?.length || 0) >= 6) return alert("배심원 정원이 찼습니다.");
        updateData.juryIds = arrayUnion(currentUser.id);
        roleTitle = "배심원";
        break;
      default:
        return;
    }
    
    try {
      await updateDoc(roomRef, {
        ...updateData,
        lastActivity: serverTimestamp(),
      });
      
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `${currentUser.name || currentUser.displayName}님이 ${roleTitle} 역할을 맡았습니다.`,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error taking role:", error);
      alert("역할 배정 중 오류가 발생했습니다.");
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !roomData) return;

    // 침묵 패널티가 있으면 발언 불가
    if (isSilenced) {
      alert("침묵 패널티가 적용되어 발언할 수 없습니다.");
      return;
    }

    try {
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "chat",
        userId: currentUser.id,
        userName: currentUser.name || currentUser.displayName,
        userRole: userRole,
        text: inputMessage,
        timestamp: serverTimestamp(),
      });
      setInputMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // 침묵 패널티 적용
  const handleApplySilence = async (userId) => {
    if (userRole !== "judge" || !userId) return;

    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      await updateDoc(roomRef, {
        silencedUsers: arrayUnion(userId),
      });

      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `⚠️ 판사가 ${getUserName(userId)}님에게 침묵 패널티를 적용했습니다.`,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error applying silence:", error);
    }
  };

  // 침묵 패널티 해제
  const handleRemoveSilence = async (userId) => {
    if (userRole !== "judge" || !userId) return;

    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      await updateDoc(roomRef, {
        silencedUsers: arrayRemove(userId),
      });

      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `✅ 판사가 ${getUserName(userId)}님의 침묵 패널티를 해제했습니다.`,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error removing silence:", error);
    }
  };
  
  const handleUploadEvidence = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("파일 크기는 10MB 이하여야 합니다.");
    
    setUploadingEvidence(true);
    
    try {
      const storageRef = ref(storage, `trial-evidence/${classCode}/${roomId}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      const evidenceRef = collection(db, "classes", classCode, "trialRooms", roomId, "evidence");
      await addDoc(evidenceRef, {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        url: downloadURL,
        uploadedBy: currentUser.id,
        uploaderName: currentUser.name || currentUser.displayName,
        uploaderRole: userRole,
        uploadedAt: serverTimestamp(),
      });
      
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `${currentUser.name || currentUser.displayName}님이 증거 자료 "${file.name}"를 제출했습니다.`,
        timestamp: serverTimestamp(),
      });
      
      alert("증거 자료가 제출되었습니다.");
    } catch (error) {
      console.error("Error uploading evidence:", error);
      alert("증거 자료 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingEvidence(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleStartVoting = async (question, isAnonymous = false) => {
    if (userRole !== "judge") return;
    
    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      // Update the main room document with voting data
      await updateDoc(roomRef, {
        voting: {
          question: question,
          isAnonymous: isAnonymous,
          isActive: true,
          startedAt: serverTimestamp(),
          votes: {},
          guilty: 0,
          notGuilty: 0,
        }
      });
      
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `판사가 투표를 시작했습니다: "${question}"`,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error starting vote:", error);
    }
  };

  const handleVote = async (vote) => {
    if (userRole !== "jury" || !votingData?.isActive) return;
    
    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      let updateData = {};
      
      if (votingData.isAnonymous) {
        // For anonymous, we still need to increment a counter
        updateData[`voting.${vote}`] = (roomData.voting[vote] || 0) + 1;
      } else {
        // For public, we set the specific user's vote
        updateData[`voting.votes.${currentUser.id}`] = {
          vote: vote,
          voterName: currentUser.name || currentUser.displayName,
          timestamp: serverTimestamp(),
        };
      }
      
      await updateDoc(roomRef, updateData);
      setMyVote(vote);
      alert(`투표가 완료되었습니다: ${vote === "guilty" ? "유죄" : "무죄"}`);
    } catch (error) {
      console.error("Error voting:", error);
    }
  };

  const handleEndVoting = async () => {
    if (userRole !== "judge" || !votingData?.isActive) return;

    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      // We need to get the latest vote counts before declaring the result
      const roomSnap = await getDoc(roomRef);
      const latestRoomData = roomSnap.data();
      const currentVotes = latestRoomData.voting;

      let resultText = `투표가 종료되었습니다. `;
      if (currentVotes.isAnonymous) {
        resultText += `유죄: ${currentVotes.guilty || 0}표, 무죄: ${currentVotes.notGuilty || 0}표`;
      } else {
        const guiltyVotes = Object.values(currentVotes.votes || {}).filter(v => v.vote === "guilty").length;
        const notGuiltyVotes = Object.values(currentVotes.votes || {}).filter(v => v.vote === "notGuilty").length;
        resultText += `유죄: ${guiltyVotes}표, 무죄: ${notGuiltyVotes}표`;
      }
      
      // Update the voting status within the main room document
      await updateDoc(roomRef, {
        "voting.isActive": false,
        "voting.endedAt": serverTimestamp(),
      });
      
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: resultText,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error ending vote:", error);
    }
  };

  // 아바타 클릭 핸들러 - 침묵 패널티 적용/해제
  const handleAvatarClick = async (clickedUserId) => {
    if (userRole !== "judge" || !clickedUserId || clickedUserId === currentUser.id) return;

    if (roomData?.silencedUsers?.includes(clickedUserId)) {
      if (window.confirm(`${getUserName(clickedUserId)}님의 침묵 패널티를 해제하시겠습니까?`)) {
        await handleRemoveSilence(clickedUserId);
      }
    } else {
      if (window.confirm(`${getUserName(clickedUserId)}님에게 침묵 패널티를 적용하시겠습니까?`)) {
        await handleApplySilence(clickedUserId);
      }
    }
  };

  // 판결하기 기능
  const handleMakeVerdict = async () => {
    if (userRole !== "judge") return;

    const verdict = window.prompt("판결을 입력하세요 (예: 유죄, 무죄, 벌금 10,000원, 합의금 5,000원):");
    if (!verdict || !verdict.trim()) return;

    const reason = window.prompt("판결 이유를 입력하세요:");
    if (!reason || !reason.trim()) return;

    console.log("Making verdict...", { verdict, reason });

    try {
      // 1. Parse payment from verdict string
      let paymentAmount = 0;
      let paymentType = null;
      const fineRegex = /벌금\s*([0-9,]+)/;
      const settlementRegex = /합의금\s*([0-9,]+)/;

      const fineMatch = verdict.match(fineRegex);
      const settlementMatch = verdict.match(settlementRegex);

      if (fineMatch && fineMatch[1]) {
        paymentType = 'fine';
        paymentAmount = parseInt(fineMatch[1].replace(/,/g, ''), 10);
        console.log(`Fine detected: ${paymentAmount}`);
      } else if (settlementMatch && settlementMatch[1]) {
        paymentType = 'settlement';
        paymentAmount = parseInt(settlementMatch[1].replace(/,/g, ''), 10);
        console.log(`Settlement detected: ${paymentAmount}`);
      }

      // 2. Process payment if any
      if (paymentType && paymentAmount > 0) {
        if (paymentType === 'fine') {
          console.log(`Processing fine of ${paymentAmount} from ${roomData.defendantId}`);
          await processFineTransaction(roomData.defendantId, classCode, paymentAmount, `재판 판결 벌금: ${reason}`);
          console.log("Fine processed successfully.");
        } else if (paymentType === 'settlement') {
          console.log(`Processing settlement of ${paymentAmount} from ${roomData.defendantId} to ${roomData.complainantId}`);
          await transferCash(roomData.defendantId, roomData.complainantId, paymentAmount, `재판 합의금: ${reason}`);
          console.log("Settlement processed successfully.");
        }
      }

      // 3. Save trial result
      console.log("Saving trial result...");
      const resultsRef = collection(db, "classes", classCode, "trialResults");
      await addDoc(resultsRef, {
        roomId: roomId,
        caseNumber: roomData.caseNumber,
        caseTitle: roomData.caseTitle || '제목 없음',
        judgeId: roomData.judgeId,
        judgeName: roomData.judgeName,
        complainantId: roomData.complainantId,
        defendantId: roomData.defendantId,
        verdict: verdict,
        verdictReason: reason,
        verdictDate: serverTimestamp(),
        votingResult: votingData || null,
        participants: roomData.participants || [],
        paymentAmount: paymentAmount || 0,
        paymentType: paymentType || null,
      });
      console.log("Trial result saved.");

      // 4. Update trial room status
      console.log("Updating trial room status...");
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      await updateDoc(roomRef, {
        status: "completed",
        verdict: verdict,
        verdictDate: serverTimestamp(),
      });
      console.log("Trial room status updated.");

      // 5. Post system message
      console.log("Posting system message...");
      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `⚖️ 판결이 내려졌습니다: ${verdict}\n사유: ${reason}`,
        timestamp: serverTimestamp(),
      });
      console.log("System message posted.");

      alert("판결이 완료되었습니다. 재판 결과 탭에서 확인할 수 있습니다.");

      // 6. Close the trial room
      if (onClose) onClose();
    } catch (error) {
      console.error("Error making verdict:", error);
      alert(`판결 처리 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || user?.displayName || userId || "알 수 없음";
  };

  const getRoleDisplay = (role) => ({
    judge: "👨‍⚖️ 판사", prosecutor: "👔 검사", lawyer: "💼 변호사",
    complainant: "📝 원고", defendant: "🛡️ 피고", jury: "👥 배심원",
    spectator: "👀 방청객",
  }[role] || "방청객");

  const getRoleColor = (role) => ({
    judge: "#6f42c1", prosecutor: "#dc3545", lawyer: "#0d6efd",
    complainant: "#198754", defendant: "#fd7e14", jury: "#0dcaf0",
    spectator: "#6c757d",
  }[role] || "#6c757d");

  if (loading) return <div className="trial-room-loading">재판방 로딩 중...</div>;
  if (!roomData) return <div className="trial-room-error">재판방을 찾을 수 없습니다.</div>;

  return (
    <div className="trial-room-container">
      <div className="trial-room-header">
        <h2>재판정 - 사건번호 {roomData.caseNumber}</h2>
        <button onClick={onClose} className="close-room-btn">재판방 나가기</button>
      </div>
      
      <div className="trial-room-layout">
        <div className="courtroom-view">
          <div className="judge-bench">
            <Avatar 
              role="judge" 
              name={roomData.judgeName} 
              isActive={roomData.participants?.includes(roomData.judgeId)}
              userId={roomData.judgeId}
              onAvatarClick={handleAvatarClick}
              canGrantPermission={userRole === "judge"}
            />
          </div>
          
          <div className="court-floor">
            <div className="left-side">
              <div className="role-position">
                {roomData.prosecutorId ? (
                  <Avatar
                    role="prosecutor"
                    name={roomData.prosecutorName}
                    isActive={roomData.participants?.includes(roomData.prosecutorId)}
                    userId={roomData.prosecutorId}
                    onAvatarClick={handleAvatarClick}
                    canGrantPermission={userRole === "judge"}
                    showSpeechBubble={roomData.silencedUsers?.includes(roomData.prosecutorId)}
                  />
                ) : (
                  <div className="empty-role">
                    <button onClick={() => handleTakeRole("prosecutor")} className="take-role-btn" disabled={userRole !== "spectator"}>검사 되기</button>
                  </div>
                )}
              </div>
              <div className="role-position">
                <Avatar
                  role="complainant"
                  name={getUserName(roomData.complainantId)}
                  isActive={roomData.participants?.includes(roomData.complainantId)}
                  userId={roomData.complainantId}
                  onAvatarClick={handleAvatarClick}
                  canGrantPermission={userRole === "judge"}
                  showSpeechBubble={roomData.silencedUsers?.includes(roomData.complainantId)}
                />
              </div>
            </div>

            <div className="right-side">
              <div className="role-position">
                {roomData.lawyerId ? (
                  <Avatar
                    role="lawyer"
                    name={roomData.lawyerName}
                    isActive={roomData.participants?.includes(roomData.lawyerId)}
                    userId={roomData.lawyerId}
                    onAvatarClick={handleAvatarClick}
                    canGrantPermission={userRole === "judge"}
                    showSpeechBubble={roomData.silencedUsers?.includes(roomData.lawyerId)}
                  />
                ) : (
                  <div className="empty-role">
                    <button onClick={() => handleTakeRole("lawyer")} className="take-role-btn" disabled={userRole !== "spectator"}>변호사 되기</button>
                  </div>
                )}
              </div>
              <div className="role-position">
                <Avatar
                  role="defendant"
                  name={getUserName(roomData.defendantId)}
                  isActive={roomData.participants?.includes(roomData.defendantId)}
                  userId={roomData.defendantId}
                  onAvatarClick={handleAvatarClick}
                  canGrantPermission={userRole === "judge"}
                  showSpeechBubble={roomData.silencedUsers?.includes(roomData.defendantId)}
                />
              </div>
            </div>
          </div>
          
          <div className="jury-box">
            <div className="jury-label">배심원단</div>
            <div className="jury-seats">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="jury-position">
                  {roomData.juryIds?.[index] ? (
                    <Avatar
                      role="jury"
                      name={getUserName(roomData.juryIds[index])}
                      isActive={roomData.participants?.includes(roomData.juryIds[index])}
                      userId={roomData.juryIds[index]}
                      onAvatarClick={handleAvatarClick}
                      canGrantPermission={userRole === "judge"}
                      showSpeechBubble={roomData.silencedUsers?.includes(roomData.juryIds[index])}
                    />
                  ) : (
                    <button onClick={() => handleTakeRole("jury")} className="take-jury-btn" disabled={userRole !== "spectator"}>배심원 되기</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="trial-sidebar">
          <div className="participant-info">
            <h3>내 정보</h3>
            <div className="my-role" style={{ color: getRoleColor(userRole) }}>{getRoleDisplay(userRole)}</div>
            <div className="my-name">{currentUser.name || currentUser.displayName}</div>
            {isSilenced && (
              <div className="silence-badge" style={{
                marginTop: '10px', background: '#dc3545', color: 'white',
                padding: '6px 12px', borderRadius: '15px', fontSize: '0.85rem'
              }}>
                ⚠️ 침묵 패널티 적용 중
              </div>
            )}
          </div>
          
          <div className="chat-section">
            <h3>재판 진행</h3>
            <div className="messages-container">
              {messages.map((msg) => (
                <div key={msg.id} className={`message ${msg.type}`}>
                  {msg.type === "system" ? (
                    <div className="system-message">{msg.text}</div>
                  ) : (
                    <div className="chat-message">
                      <span className="message-author" style={{ color: getRoleColor(msg.userRole) }}>
                        {msg.userName}:
                      </span>
                      <span className="message-text">{msg.text}</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="message-input-container">
              <input type="text" value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                placeholder={isSilenced ? "침묵 패널티가 적용되었습니다" : "메시지 입력..."}
                disabled={isSilenced} className="message-input" />
              <button onClick={handleSendMessage} className="send-btn" disabled={isSilenced}>전송</button>
            </div>
          </div>
          
          <div className="evidence-section">
            <h3>증거 자료</h3>
            <div className="evidence-list">
              {evidence.map((item) => (
                <div key={item.id} className="evidence-item">
                  <a href={item.url} target="_blank" rel="noopener noreferrer">{item.fileName}</a>
                  <span className="evidence-uploader">- {item.uploaderName}</span>
                </div>
              ))}
            </div>
            {["judge", "prosecutor", "lawyer"].includes(userRole) && (
              <div className="evidence-upload">
                <input type="file" ref={fileInputRef} onChange={handleUploadEvidence}
                  style={{ display: "none" }} accept="image/*,application/pdf,.doc,.docx" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingEvidence} className="upload-btn">
                  {uploadingEvidence ? "업로드 중..." : "증거 제출"}
                </button>
              </div>
            )}
          </div>
          
          {userRole === "judge" && (
            <div className="judge-controls">
              <h3>판사 권한</h3>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '10px' }}>
                아바타 클릭으로 침묵 패널티 적용/해제
              </p>
              <button className="judge-action-btn" onClick={() => {
                const q = window.prompt("투표 질문을 입력하세요:");
                if (q) {
                  const isAnon = window.confirm("익명 투표로 진행하시겠습니까?");
                  handleStartVoting(q, isAnon);
                }
              }}>📊 투표 시작</button>
              {votingData?.isActive && (
                <button className="judge-action-btn" onClick={handleEndVoting}>
                  ✅ 투표 종료
                </button>
              )}
              <button
                className="judge-action-btn"
                onClick={handleMakeVerdict}
                style={{
                  background: '#6f42c1',
                  fontWeight: 'bold',
                  marginTop: '10px'
                }}
              >
                ⚖️ 판결하기
              </button>
            </div>
          )}
          
          {userRole === "jury" && votingData?.isActive && !myVote && (
            <div className="voting-section">
              <h3>배심원 투표</h3>
              <p className="voting-question">{votingData.question}</p>
              <div className="voting-buttons">
                <button onClick={() => handleVote("guilty")} className="vote-btn guilty">유죄</button>
                <button onClick={() => handleVote("notGuilty")} className="vote-btn not-guilty">무죄</button>
              </div>
            </div>
          )}
          
          {votingData && !votingData.isActive && (
            <div className="voting-results">
              <h3>투표 결과</h3>
              <p>{votingData.question}</p>
              {votingData.isAnonymous ? (
                <div>
                  <p>유죄: {votingData.guilty || 0}표</p>
                  <p>무죄: {votingData.notGuilty || 0}표</p>
                </div>
              ) : (
                <div>
                  {Object.entries(votingData.votes || {}).map(([userId, vote]) => (
                    <p key={userId}>{vote.voterName}: {vote.vote === "guilty" ? "유죄" : "무죄"}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrialRoom;
