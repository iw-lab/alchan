import { transferCash, functions, httpsCallable } from "../../firebase";
// src/TrialRoom.js
import React, { useState, useEffect, useRef } from "react";
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
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import "./TrialRoom.css";

import { logger } from "../../utils/logger";
// 재판방 비주얼 개편(CourtroomScene) 보류 — WIP. 추후 에셋 커밋 후 활성화.
// import CourtroomScene from "./CourtroomScene";

// 재판방 + 서브컬렉션(messages, evidence) 깊은 삭제 — DB 사용량 절감.
// 판결 결과는 trialResults 에 영구 보존되므로 방 자체는 삭제해도 안전.
export async function deleteTrialRoomDeep(classCode, roomId) {
  if (!classCode || !roomId) return;
  for (const sub of ["messages", "evidence"]) {
    try {
      const snap = await getDocs(
        collection(db, "classes", classCode, "trialRooms", roomId, sub),
      );
      let batch = writeBatch(db);
      let n = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        if (++n % 450 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (n % 450 !== 0 || n === 0) await batch.commit();
    } catch (e) {
      logger.error(`cleanup ${sub} failed:`, e);
    }
  }
  try {
    await deleteDoc(doc(db, "classes", classCode, "trialRooms", roomId));
  } catch (e) {
    logger.error("delete trialRoom failed:", e);
  }
}

// 진행되지 않는(완료/유휴/빈) 재판방 일괄 정리.
// - status === "completed" 인 방
// - 참여자 0명(이용 안 하는 빈 방)이 emptyMs 이상 방치된 경우
// - 활동(participants 有)이 있어도 staleMs 이상 유휴인 경우
// lastActivity 가 없으면 createdAt 으로 fallback (둘 다 없는 빈 방은 즉시 정리).
export async function cleanupStaleTrialRooms(
  classCode,
  staleMs = 6 * 60 * 60 * 1000,
  emptyMs = 10 * 60 * 1000,
) {
  if (!classCode) return 0;
  try {
    const snap = await getDocs(collection(db, "classes", classCode, "trialRooms"));
    const now = Date.now();
    const targets = snap.docs.filter((d) => {
      const r = d.data();
      if (r.status === "completed") return true;
      const last = r.lastActivity?.toMillis
        ? r.lastActivity.toMillis()
        : r.createdAt?.toMillis
          ? r.createdAt.toMillis()
          : 0;
      const count = Array.isArray(r.participants) ? r.participants.length : 0;
      // 빈 방(참여자 0명): 짧은 유휴 시간 후 삭제. 타임스탬프 없으면 즉시 삭제.
      if (count === 0) return !last || now - last > emptyMs;
      // 활동 중인 방: 긴 유휴 시간 경과 시에만 삭제.
      if (last && now - last > staleMs) return true;
      return false;
    });
    for (const d of targets) {
      await deleteTrialRoomDeep(classCode, d.id);
    }
    return targets.length;
  } catch (e) {
    logger.error("cleanupStaleTrialRooms failed:", e);
    return 0;
  }
}

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

  // 재판방 문서 실시간 구독 — 방이 열린 동안에만 onSnapshot, 닫으면 unsubscribe.
  // 활성 재판(역할 변경·투표·침묵)엔 폴링보다 onSnapshot이 더 저렴(변경분만 read)하고 즉각적.
  useEffect(() => {
    if (!roomId || !classCode) return undefined;
    const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
    const unsub = onSnapshot(
      roomRef,
      (snap) => {
        if (!snap.exists()) {
          setRoomData(null);
          setVotingData(null);
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setRoomData(data);

        const voting = data.voting || null;
        setVotingData(voting);
        if (!voting || !voting.isActive) setMyVote(null);

        let currentRole = "spectator";
        if (data.judgeId === currentUser.id) currentRole = "judge";
        else if (data.complainantId === currentUser.id) currentRole = "complainant";
        else if (data.defendantId === currentUser.id) currentRole = "defendant";
        else if (data.prosecutorId === currentUser.id) currentRole = "prosecutor";
        else if (data.lawyerId === currentUser.id) currentRole = "lawyer";
        else if (data.witnessId === currentUser.id) currentRole = "witness";
        else if (data.juryIds?.includes(currentUser.id)) currentRole = "jury";
        setUserRole(currentRole);

        setIsSilenced(Boolean(data.silencedUsers?.includes(currentUser.id)));
        setLoading(false);
      },
      (err) => {
        logger.error("room snapshot error:", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [roomId, classCode, currentUser.id]);

  useEffect(() => {
    if (!roomId || !classCode) return;
    handleJoinRoom();
    return () => {
      handleLeaveRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, classCode]);

  // 채팅 메시지 실시간 구독 — 새 메시지 1건당 1 read (폴링보다 저렴 + 실시간 말풍선).
  useEffect(() => {
    if (!roomId || !classCode) return undefined;
    const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
    const messagesQuery = query(messagesRef, orderBy("timestamp", "asc"), limit(100));
    const unsub = onSnapshot(
      messagesQuery,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => logger.error("messages snapshot error:", err),
    );
    return () => unsub();
  }, [roomId, classCode]);

  // 증거 자료 실시간 구독
  useEffect(() => {
    if (!roomId || !classCode) return undefined;
    const evidenceRef = collection(db, "classes", classCode, "trialRooms", roomId, "evidence");
    const evidenceQuery = query(evidenceRef, orderBy("uploadedAt", "desc"), limit(50));
    const unsub = onSnapshot(
      evidenceQuery,
      (snap) => setEvidence(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => logger.error("evidence snapshot error:", err),
    );
    return () => unsub();
  }, [roomId, classCode]);

  const handleJoinRoom = async () => {
    try {
      const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);
      
      // Get the latest room data to check for available roles
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
          logger.error("Trial room not found!");
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
      logger.error("Error joining room:", error);
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
      logger.error("Error leaving room:", error);
    }
  };

  // 판사가 검사/변호사/증인을 직접 지명
  const ROLE_FIELDS = {
    prosecutor: ["prosecutorId", "prosecutorName", "검사"],
    lawyer: ["lawyerId", "lawyerName", "변호사"],
    witness: ["witnessId", "witnessName", "증인"],
  };

  const handleAssignRole = async (role, userId) => {
    if (userRole !== "judge") return;
    const fields = ROLE_FIELDS[role];
    if (!fields) return;
    const [idField, nameField, roleTitle] = fields;
    const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);

    try {
      const target = users.find((u) => u.id === userId);
      const updateData = { lastActivity: serverTimestamp() };
      if (userId) {
        updateData[idField] = userId;
        updateData[nameField] = target?.name || target?.displayName || "";
        updateData.participants = arrayUnion(userId);
      } else {
        // 해제
        updateData[idField] = null;
        updateData[nameField] = null;
      }
      await updateDoc(roomRef, updateData);

      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: userId
          ? `판사가 ${target?.name || target?.displayName || "참가자"}님을 ${roleTitle}(으)로 지명했습니다.`
          : `판사가 ${roleTitle} 지명을 해제했습니다.`,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      logger.error("Error assigning role:", error);
      alert("역할 지명 중 오류가 발생했습니다.");
    }
  };

  // 나머지 인원을 배심원으로 자동 배정
  const JURY_SEATS = 15;
  const handleAutoFillJury = async () => {
    if (userRole !== "judge") return;
    const roomRef = doc(db, "classes", classCode, "trialRooms", roomId);

    const assigned = new Set(
      [
        roomData.judgeId,
        roomData.prosecutorId,
        roomData.lawyerId,
        roomData.complainantId,
        roomData.defendantId,
        roomData.witnessId,
      ].filter(Boolean),
    );

    // 학생만 대상 (교사/관리자 제외), 이미 배정된 사람 제외.
    // 접속 중(participants)인 사람을 우선 배치.
    const participantsSet = new Set(roomData.participants || []);
    const candidates = (users || [])
      .filter((u) => u.id && !assigned.has(u.id))
      .filter((u) => !["teacher", "admin", "superadmin"].includes(u.role))
      .sort((a, b) => {
        const ap = participantsSet.has(a.id) ? 0 : 1;
        const bp = participantsSet.has(b.id) ? 0 : 1;
        return ap - bp;
      })
      .slice(0, JURY_SEATS)
      .map((u) => u.id);

    if (candidates.length === 0) {
      alert("배심원으로 배정할 남은 인원이 없습니다.");
      return;
    }

    try {
      await updateDoc(roomRef, {
        juryIds: candidates,
        participants: arrayUnion(...candidates),
        lastActivity: serverTimestamp(),
      });

      const messagesRef = collection(db, "classes", classCode, "trialRooms", roomId, "messages");
      await addDoc(messagesRef, {
        type: "system",
        text: `판사가 ${candidates.length}명을 배심원으로 배정했습니다.`,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      logger.error("Error auto-filling jury:", error);
      alert("배심원 자동 배정 중 오류가 발생했습니다.");
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
      logger.error("Error sending message:", error);
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
      logger.error("Error applying silence:", error);
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
      logger.error("Error removing silence:", error);
    }
  };
  
  const handleUploadEvidence = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("파일 크기는 10MB 이하여야 합니다.");
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!ALLOWED_TYPES.includes(file.type)) {
      return alert("허용되지 않는 파일 형식입니다. (이미지, PDF, Word만 가능)");
    }
    
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
      logger.error("Error uploading evidence:", error);
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
      logger.error("Error starting vote:", error);
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
      logger.error("Error voting:", error);
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
      logger.error("Error ending vote:", error);
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

    logger.log("Making verdict...", { verdict, reason });

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
        logger.log(`Fine detected: ${paymentAmount}`);
      } else if (settlementMatch && settlementMatch[1]) {
        paymentType = 'settlement';
        paymentAmount = parseInt(settlementMatch[1].replace(/,/g, ''), 10);
        logger.log(`Settlement detected: ${paymentAmount}`);
      }

      // 2. Process payment if any
      if (paymentType && paymentAmount > 0) {
        if (paymentType === 'fine') {
          logger.log(`Processing fine of ${paymentAmount} from ${roomData.defendantId}`);
          // 🔒 서버(CF)에서 권한(판사/관리자)·같은학급 검증 후 원자적 처리
          const processFineFn = httpsCallable(functions, "processFine");
          await processFineFn({
            defendantId: roomData.defendantId,
            amount: paymentAmount,
            reason: `재판 판결 벌금: ${reason}`,
            context: "trial",
            // 안정 멱등키(재판방 1건=벌금 1회): 판결 저장 실패 후 재시도해도 이중부과 방지
            idempotencyKey: `trial_fine_${roomId}`,
          });
          logger.log("Fine processed successfully.");
        } else if (paymentType === 'settlement') {
          logger.log(`Processing settlement of ${paymentAmount} from ${roomData.defendantId} to ${roomData.complainantId}`);
          await transferCash(roomData.defendantId, roomData.complainantId, paymentAmount, `재판 합의금: ${reason}`);
          logger.log("Settlement processed successfully.");
        }
      }

      // 3. Save trial result
      logger.log("Saving trial result...");
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
      logger.log("Trial result saved.");

      // 4. 연결된 고소 사건을 '해결됨'으로 갱신 (방을 지워도 사건 상태 일관)
      if (roomData.caseId) {
        try {
          await updateDoc(
            doc(db, "classes", classCode, "courtComplaints", roomData.caseId),
            {
              status: "resolved",
              verdict: verdict,
              verdictReason: reason,
              verdictDate: serverTimestamp(),
              trialRoomId: null,
            },
          );
        } catch (e) {
          logger.error("complaint resolve update failed:", e);
        }
      }

      // 5. 재판이 끝났으므로 방+서브컬렉션 즉시 정리 (결과는 trialResults에 보존)
      logger.log("Cleaning up finished trial room...");
      await deleteTrialRoomDeep(classCode, roomId);
      logger.log("Trial room deleted.");

      alert("판결이 완료되었습니다. 재판 결과 탭에서 확인할 수 있습니다.");

      // 6. Close the trial room
      if (onClose) onClose();
    } catch (error) {
      logger.error("Error making verdict:", error);
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
  if (!roomData)
    return (
      <div className="trial-room-error">
        <p>⚖️ 재판이 종료되었습니다.</p>
        <p style={{ fontSize: "0.9rem", color: "#888", marginTop: 6 }}>
          판결 결과는 ‘재판 결과’ 탭에서 확인할 수 있어요.
        </p>
        <button onClick={onClose} className="close-room-btn" style={{ marginTop: 14 }}>
          나가기
        </button>
      </div>
    );

  return (
    <div className="trial-room-container">
      <div className="trial-room-header">
        <h2>재판정 - 사건번호 {roomData.caseNumber}</h2>
        <button onClick={onClose} className="close-room-btn">재판방 나가기</button>
      </div>
      
      <div className="trial-room-layout">
        <div className="courtroom-view">
          {/* 재판방 비주얼 개편(CourtroomScene) 보류 — 추후 활성화. 재판 기능은 우측 패널에서 그대로 동작. */}
          <div
            className="courtroom-scene-placeholder"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "300px",
              gap: "8px",
              color: "#8a7fa6",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "2.4rem" }}>⚖️</div>
            <div>재판이 진행 중입니다.</div>
            <div style={{ fontSize: "0.85rem" }}>
              오른쪽 패널에서 역할 · 발언 · 증거를 확인하세요.
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

          {userRole === "judge" && roomData.status !== "completed" && (
            <div className="trial-assign-panel">
              <h3>⚖️ 재판 구성</h3>
              <p className="assign-hint">판사가 검사·변호사·증인을 지명하고, 나머지를 배심원으로 배정합니다.</p>

              <label className="assign-row">
                <span>📋 검사</span>
                <select
                  value={roomData.prosecutorId || ""}
                  onChange={(e) => handleAssignRole("prosecutor", e.target.value)}
                >
                  <option value="">— 지명 안 함 —</option>
                  {(users || [])
                    .filter((u) => u.job === "검사")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.displayName}
                      </option>
                    ))}
                </select>
              </label>

              <label className="assign-row">
                <span>💼 변호사</span>
                <select
                  value={roomData.lawyerId || ""}
                  onChange={(e) => handleAssignRole("lawyer", e.target.value)}
                >
                  <option value="">— 지명 안 함 —</option>
                  {(users || [])
                    .filter((u) => u.job === "변호사")
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.displayName}
                      </option>
                    ))}
                </select>
              </label>

              <label className="assign-row">
                <span>🙋 증인</span>
                <select
                  value={roomData.witnessId || ""}
                  onChange={(e) => handleAssignRole("witness", e.target.value)}
                >
                  <option value="">— 지명 안 함 —</option>
                  {(users || [])
                    .filter(
                      (u) =>
                        !["teacher", "admin", "superadmin"].includes(u.role) &&
                        u.id !== roomData.judgeId,
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.displayName}
                      </option>
                    ))}
                </select>
              </label>

              <button className="assign-jury-btn" onClick={handleAutoFillJury}>
                👥 나머지 모두 배심원으로
              </button>
            </div>
          )}

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
