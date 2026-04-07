// src/Court.js - Tailwind UI 리팩토링
import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import "./Court.css";
import SubmitComplaint from "./SubmitComplaint";
import ComplaintStatus from "./ComplaintStatus";
import TrialRoom from "./TrialRoom";
import { usePolling } from "../../hooks/usePolling";
import {
 PageContainer,
 PageHeader,
 LoadingState,
} from "../../components/PageWrapper";

import { logger } from "../../utils/logger";
import {
 collection,
 doc,
 runTransaction,
 increment,
 serverTimestamp,
 addDoc,
 updateDoc,
 deleteDoc,
 query,
 orderBy,
 limit,
 getDoc,
 setDoc,
 where,
 getDocs,
} from "firebase/firestore";

// --- Helper Components ---
const EditComplaintModal = ({ complaint, onSave, onCancel, users }) => {
 const [reason, setReason] = useState(complaint.reason);
 const [desiredResolution, setDesiredResolution] = useState(
 complaint.desiredResolution,
 );
 const [defendantId, setDefendantId] = useState(complaint.defendantId);

 const handleSave = () => {
 if (!defendantId || !reason.trim() || !desiredResolution.trim()) {
 alert("모든 필드를 입력해주세요.");
 return;
 }
 onSave({ ...complaint, reason, desiredResolution, defendantId });
 };

 const defendantOptions = users
 .filter((user) => user.id !== complaint.complainantId)
 .map((user) => (
 <option key={user.id} value={user.id}>
 {user.name || user.displayName || user.id}
 </option>
 ));

 // Portal을 사용하여 모달 렌더링
 const modalRoot = document.getElementById("modal-root");
 if (!modalRoot) {
 // modal-root가 없으면 body에 생성
 const newModalRoot = document.createElement("div");
 newModalRoot.id = "modal-root";
 document.body.appendChild(newModalRoot);
 }

 return ReactDOM.createPortal(
 <div className="modal-overlay" onClick={onCancel}>
 <div
 className="edit-modal-container modal-container"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="modal-header">
 <h3>고소장 수정 (ID: {complaint.id.slice(-6)})</h3>
 <button className="close-button" onClick={onCancel}>
 ×
 </button>
 </div>
 <div className="modal-content">
 <div className="form-group">
 <label htmlFor="defendantSelectEdit" className="form-label">
 피고소인
 </label>
 <select
 id="defendantSelectEdit"
 className="form-select"
 value={defendantId}
 onChange={(e) => setDefendantId(e.target.value)}
 >
 <option value="">-- 선택 --</option>
 {defendantOptions}
 </select>
 </div>
 <div className="form-group">
 <label className="form-label">고소 사유</label>
 <textarea
 className="form-textarea"
 value={reason}
 onChange={(e) => setReason(e.target.value)}
 rows={5}
 />
 </div>
 <div className="form-group">
 <label className="form-label">원하는 결과</label>
 <textarea
 className="form-textarea"
 value={desiredResolution}
 onChange={(e) => setDesiredResolution(e.target.value)}
 rows={3}
 />
 </div>
 </div>
 <div className="modal-footer">
 <button onClick={onCancel} className="modal-button cancel">
 취소
 </button>
 <button onClick={handleSave} className="modal-button process">
 저장
 </button>
 </div>
 </div>
 </div>,
 document.getElementById("modal-root") || document.body,
 );
};

const JudgmentModal = ({ complaint, onSave, onCancel }) => {
 const [judgmentText, setJudgmentText] = useState(complaint.judgment || "");

 const handleSaveClick = () => {
 if (!judgmentText.trim()) {
 alert("판결 내용을 입력해주세요.");
 return;
 }
 onSave(complaint.id, judgmentText);
 };

 return ReactDOM.createPortal(
 <div className="modal-overlay" onClick={onCancel}>
 <div className="modal-container" onClick={(e) => e.stopPropagation()}>
 <div className="modal-header">
 <h3>판결문 작성 (ID: {complaint.id.slice(-6)})</h3>
 <button className="close-button" onClick={onCancel}>
 ×
 </button>
 </div>
 <div className="modal-content">
 <div className="form-group">
 <label htmlFor="judgmentText" className="form-label">
 판결 내용
 </label>
 <textarea
 id="judgmentText"
 className="form-textarea judgment-textarea"
 value={judgmentText}
 onChange={(e) => setJudgmentText(e.target.value)}
 rows={10}
 placeholder="판결 내용을 상세히 작성해주세요..."
 />
 </div>
 </div>
 <div className="modal-footer">
 <button onClick={onCancel} className="modal-button cancel">
 취소
 </button>
 <button onClick={handleSaveClick} className="modal-button process">
 판결 저장
 </button>
 </div>
 </div>
 </div>,
 document.getElementById("modal-root") || document.body,
 );
};

// 합의금 지급 모달
const SettlementModal = ({
 complaint,
 users,
 onSave,
 onCancel,
 getUserNameById,
}) => {
 const [amount, setAmount] = useState("");
 const [senderId, setSenderId] = useState(complaint.defendantId || "");
 const [recipientId, setRecipientId] = useState(complaint.complainantId || "");

 const handleSave = async () => {
 if (!amount || isNaN(parseInt(amount)) || parseInt(amount) <= 0) {
 alert("유효한 금액을 입력해주세요.");
 return;
 }
 if (!senderId || !recipientId) {
 alert("보내는 사람과 받는 사람을 모두 선택해주세요.");
 return;
 }
 if (senderId === recipientId) {
 alert("보내는 사람과 받는 사람은 같을 수 없습니다.");
 return;
 }

 try {
 const success = await onSave(
 complaint.id,
 parseInt(amount),
 senderId,
 recipientId,
 );
 if (success) {
 onCancel(); // 성공하면 모달 닫기
 }
 } catch (error) {
 logger.error("Settlement error:", error);
 alert("합의금 처리 중 오류가 발생했습니다.");
 }
 };

 return ReactDOM.createPortal(
 <div className="modal-overlay" onClick={onCancel}>
 <div className="modal-container" onClick={(e) => e.stopPropagation()}>
 <div className="modal-header">
 <h3>
 합의금 지급 처리 (사건번호: {complaint.id?.slice(-6) || "없음"})
 </h3>
 <button className="close-button" onClick={onCancel}>
 ×
 </button>
 </div>
 <div className="modal-content">
 <p>
 <strong>고소인:</strong> {getUserNameById(complaint.complainantId)}
 </p>
 <p>
 <strong>피고소인:</strong> {getUserNameById(complaint.defendantId)}
 </p>
 <div className="form-group">
 <label htmlFor="settlementSender" className="form-label">
 송금자:
 </label>
 <select
 id="settlementSender"
 className="form-select"
 value={senderId}
 onChange={(e) => setSenderId(e.target.value)}
 >
 <option value="">-- 선택 --</option>
 {users
 .filter((u) => u.id !== recipientId)
 .map((user) => (
 <option key={user.id} value={user.id}>
 {getUserNameById(user.id)}
 </option>
 ))}
 </select>
 </div>
 <div className="form-group">
 <label htmlFor="settlementRecipient" className="form-label">
 수금자:
 </label>
 <select
 id="settlementRecipient"
 className="form-select"
 value={recipientId}
 onChange={(e) => setRecipientId(e.target.value)}
 >
 <option value="">-- 선택 --</option>
 {users
 .filter((u) => u.id !== senderId)
 .map((user) => (
 <option key={user.id} value={user.id}>
 {getUserNameById(user.id)}
 </option>
 ))}
 </select>
 </div>
 <div className="form-group">
 <label htmlFor="settlementAmount" className="form-label">
 합의금 (원):
 </label>
 <input
 type="number"
 id="settlementAmount"
 className="form-input"
 value={amount}
 onChange={(e) => setAmount(e.target.value)}
 placeholder="금액 입력"
 min="1"
 />
 </div>
 </div>
 <div className="modal-footer">
 <button onClick={onCancel} className="modal-button cancel">
 취소
 </button>
 <button onClick={handleSave} className="modal-button process">
 지급 처리
 </button>
 </div>
 </div>
 </div>,
 document.getElementById("modal-root") || document.body,
 );
};

const TrialResults = ({ complaints, users, onOpenSettlementModal }) => {
 const getUserNameById = (userId) => {
 const user = users.find((u) => u.id === userId);
 return user?.name || user?.displayName || userId || "알 수 없음";
 };

 const resolvedComplaints = (complaints || []).filter(
 (c) => c.status === "resolved",
 );

 if (resolvedComplaints.length === 0) {
 return <p className="empty-state">완료된 재판이 없습니다.</p>;
 }

 return (
 <div className="trial-results-container">
 {resolvedComplaints.map((complaint) => (
 <div key={complaint.id} className="result-card">
 <div className="result-header">
 <span className="case-id">사건번호: {complaint.id.slice(-6)}</span>
 <span className="parties">
 {getUserNameById(complaint.complainantId)} vs{" "}
 {getUserNameById(complaint.defendantId)}
 </span>
 <span className="case-status status-resolved">재판완료</span>
 </div>
 <div className="result-content">
 <h4>고소 요지</h4>
 <p className="summary">
 {complaint.reason.substring(0, 100)}
 {complaint.reason.length > 100 ? "..." : ""}
 </p>
 <h4>판결문</h4>
 <div className="judgment-display">
 <p>{complaint.judgment || "판결문 내용이 없습니다."}</p>
 </div>
 </div>
 <div className="result-actions">
 {complaint.settlementPaid ? (
 <button className="settlement-button paid" disabled>
 지급 완료
 </button>
 ) : (
 <button
 className="settlement-button"
 onClick={() => onOpenSettlementModal(complaint)}
 >
 합의금 지급
 </button>
 )}
 </div>
 </div>
 ))}
 </div>
 );
};

// 파산 신청 컴포넌트
const BankruptcySection = ({ refetchComplaints }) => {
 const { userDoc, classCode } = useAuth();
 const [hasPendingBankruptcyCase, setHasPendingBankruptcyCase] =
 useState(false);
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
 if (userDoc?.id && classCode) {
 const checkPendingCase = async () => {
 setIsLoading(true);
 try {
 const casesRef = collection(
 db,
 "classes",
 classCode,
 "courtComplaints",
 );
 const q = query(
 casesRef,
 where("complainantId", "==", userDoc.id),
 where("caseType", "==", "bankruptcy"),
 where("status", "==", "pending"),
 limit(10),
 );
 const querySnapshot = await getDocs(q);
 setHasPendingBankruptcyCase(!querySnapshot.empty);
 } catch (error) {
 logger.error("파산 신청 확인 중 오류:", error);
 } finally {
 setIsLoading(false);
 }
 };
 checkPendingCase();
 } else {
 setIsLoading(false);
 }
 }, [userDoc, classCode]);

 const handleApplyForBankruptcy = async () => {
 if (
 window.confirm(
 "정말로 파산을 신청하시겠습니까? 재판 결과에 따라 모든 자산이 초기화될 수 있습니다.",
 )
 ) {
 try {
 const casesRef = collection(
 db,
 "classes",
 classCode,
 "courtComplaints",
 );
 await addDoc(casesRef, {
 complainantId: userDoc.id,
 complainantName: userDoc.name,
 caseType: "bankruptcy",
 defendantId: "system",
 defendantName: "시스템",
 status: "pending",
 reason: `자산 ${userDoc.money.toLocaleString()}원으로 인한 파산 신청`,
 desiredResolution: "모든 부채를 청산하고 자산을 0으로 초기화 요청",
 submissionDate: serverTimestamp(),
 likedBy: [],
 dislikedBy: [],
 });
 refetchComplaints();
 alert(
 "파산 신청이 정상적으로 접수되었습니다. 재판 결과를 기다려주세요.",
 );
 setHasPendingBankruptcyCase(true);
 } catch (error) {
 logger.error("파산 신청 중 오류 발생:", error);
 alert("오류가 발생하여 파산 신청에 실패했습니다.");
 }
 }
 };

 if (isLoading) {
 return <p>파산 신청 정보를 불러오는 중...</p>;
 }

 return (
 <div className="bankruptcy-section">
 <h3>파산 신청</h3>
 <p>현재 자산: {userDoc?.money ? userDoc.money.toLocaleString() : 0}원</p>
 {userDoc?.money < 0 ? (
 <div>
 <p>
 자산이 마이너스 상태입니다. 파산을 신청하여 모든 빚을 청산하고
 새롭게 시작할 수 있습니다. (재판 필요)
 </p>
 {hasPendingBankruptcyCase ? (
 <p>
 <strong>현재 파산 재판이 진행 중입니다.</strong>
 </p>
 ) : (
 <button
 onClick={handleApplyForBankruptcy}
 className="action-button delete"
 >
 파산 신청하기
 </button>
 )}
 </div>
 ) : (
 <p>자산이 마이너스 상태일 때 파산을 신청할 수 있습니다.</p>
 )}
 </div>
 );
};

// --- Main Court Component ---
const Court = () => {
 const auth = useAuth();
 const currentUserDoc = auth?.userDoc;
 const currentUserId = currentUserDoc?.id;
 const classCode = currentUserDoc?.classCode;

 const isAdmin = auth?.isAdmin
 ? auth.isAdmin()
 : currentUserDoc?.isAdmin || currentUserDoc?.id === "admin1";

 const [activeTab, setActiveTab] = useState("submit");
 const [isEditModalOpen, setIsEditModalOpen] = useState(false);
 const [editingComplaint, setEditingComplaint] = useState(null);
 const [isJudgmentModalOpen, setIsJudgmentModalOpen] = useState(false);
 const [judgingComplaint, setJudgingComplaint] = useState(null);
 const [users, setUsers] = useState([]);
 const [usersLoading, setUsersLoading] = useState(true);
 const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
 const [settlementComplaint, setSettlementComplaint] = useState(null);

 const [activeTrialRoom, setActiveTrialRoom] = useState(null);

 // modal-root 엘리먼트 생성
 useEffect(() => {
 if (!document.getElementById("modal-root")) {
 const modalRoot = document.createElement("div");
 modalRoot.id = "modal-root";
 document.body.appendChild(modalRoot);
 }
 }, []);

 // 🔥 [최적화] AuthContext에서 이미 로드한 학급 구성원 사용 (DB 호출 제거)
 useEffect(() => {
 if (!auth.loading && auth.allClassMembers) {
 setUsers(auth.allClassMembers || []);
 setUsersLoading(false);
 }
 }, [auth.loading, auth.allClassMembers]);

 // usePolling for complaints
 const {
 data: complaints = [],
 loading: complaintsLoading,
 refetch: refetchComplaints,
 } = usePolling(
 async () => {
 if (!classCode) return [];
 const complaintsRef = collection(
 db,
 "classes",
 classCode,
 "courtComplaints",
 );
 const q = query(
 complaintsRef,
 orderBy("submissionDate", "desc"),
 limit(100),
 );
 const querySnapshot = await getDocs(q);
 return querySnapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 submissionDate: doc.data().submissionDate?.toDate
 ? doc.data().submissionDate.toDate().toISOString()
 : null,
 indictmentDate: doc.data().indictmentDate?.toDate
 ? doc.data().indictmentDate.toDate().toISOString()
 : null,
 }));
 },
 { interval: 10 * 60 * 1000, enabled: !!classCode, deps: [classCode] }, // 🔥 [비용 최적화] 5분 → 10분
 );

 // usePolling for trial rooms
 const {
 data: trialRooms = [],
 loading: trialRoomsLoading,
 refetch: refetchTrialRooms,
 } = usePolling(
 async () => {
 if (!classCode) return [];
 const trialRoomsRef = collection(db, "classes", classCode, "trialRooms");
 const q = query(trialRoomsRef, limit(50));
 const querySnapshot = await getDocs(q);
 return querySnapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 }));
 },
 { interval: 10 * 60 * 1000, enabled: !!classCode, deps: [classCode] }, // 🔥 [비용 최적화] 5분 → 10분
 );

 // Jobs polling - for prosecutor check
 const jobsQuery = useMemo(() => {
 if (!classCode) return null;
 const jobsRef = collection(db, "jobs");
 return query(jobsRef, where("classCode", "==", classCode));
 }, [classCode]);

 const { data: jobs, loading: jobsLoading } = usePolling(
 async () => {
 if (!jobsQuery) return [];
 const snapshot = await getDocs(jobsQuery);
 return snapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 }));
 },
 {
 interval: 30 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 30분 (직업 목록은 거의 안 바뀜)
 enabled: !!classCode,
 deps: [classCode],
 },
 );

 // Check if user is prosecutor
 const isProsecutor = useMemo(() => {
 if (!currentUserDoc?.selectedJobIds || !jobs) return false;
 const selectedJobs = jobs.filter((job) =>
 currentUserDoc.selectedJobIds.includes(job.id),
 );
 return selectedJobs.some((job) => job.title === "검찰총장");
 }, [currentUserDoc?.selectedJobIds, jobs]);

 // Check if user is judge
 const isJudge = useMemo(() => {
 if (!currentUserDoc?.selectedJobIds || !jobs) return false;
 const selectedJobs = jobs.filter((job) =>
 currentUserDoc.selectedJobIds.includes(job.id),
 );
 return selectedJobs.some((job) => job.title === "판사");
 }, [currentUserDoc?.selectedJobIds, jobs]);

 const hasProsecutorPrivileges = isAdmin || isProsecutor;
 const hasJudgePrivileges = isAdmin || isJudge;
 const hasAdminPrivileges = hasJudgePrivileges;

 const handleAddComplaint = async (newComplaintData) => {
 if (!currentUserId || !classCode) {
 alert("로그인 정보 또는 학급 정보가 유효하지 않습니다.");
 return;
 }
 const currentUserInfo =
 users.find((u) => u.id === currentUserId) || currentUserDoc;

 const complaintToSave = {
 ...newComplaintData,
 caseType: "general",
 status: "pending",
 submissionDate: serverTimestamp(),
 complainantId: currentUserId,
 complainantName:
 currentUserInfo?.name || currentUserInfo?.displayName || "알 수 없음",
 likedBy: [],
 dislikedBy: [],
 judgment: null,
 indictmentDate: null,
 settlementPaid: false,
 classCode: classCode,
 };
 try {
 const complaintsRef = collection(
 db,
 "classes",
 classCode,
 "courtComplaints",
 );
 await addDoc(complaintsRef, complaintToSave);
 refetchComplaints();
 setActiveTab("status");
 alert("고소장이 성공적으로 제출되었습니다.");
 } catch (error) {
 logger.error("Error adding complaint to Firestore:", error);
 alert("고소장 제출 중 오류가 발생했습니다.");
 }
 };

 const handleIndictComplaint = async (id) => {
 if (!(hasProsecutorPrivileges || hasAdminPrivileges) || !classCode)
 return alert("기소 권한이 없습니다.");
 const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
 try {
 await updateDoc(complaintRef, {
 status: "indicted",
 indictmentDate: serverTimestamp(),
 });
 refetchComplaints();
 alert(`사건번호 ${id.slice(-6)}이(가) 기소되었습니다.`);
 } catch (error) {
 logger.error("Error indicting complaint:", error);
 alert("기소 처리 중 오류가 발생했습니다.");
 }
 };

 const handleDeleteComplaint = async (id) => {
 if (
 !(hasProsecutorPrivileges || hasJudgePrivileges || hasAdminPrivileges) ||
 !classCode
 )
 return alert("삭제 권한이 없습니다.");

 if (
 window.confirm(`사건번호 ${id.slice(-6)} 기록을 정말 삭제하시겠습니까?`)
 ) {
 const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
 try {
 await deleteDoc(complaintRef);
 refetchComplaints();
 alert("기록이 삭제되었습니다.");
 } catch (error) {
 logger.error("Error deleting complaint:", error);
 alert("기록 삭제 중 오류가 발생했습니다.");
 }
 }
 };

 const handleDismissComplaint = async (id) => {
 if (
 !(hasProsecutorPrivileges || hasJudgePrivileges || hasAdminPrivileges) ||
 !classCode
 )
 return alert("처리 권한이 없습니다.");
 const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
 try {
 await updateDoc(complaintRef, { status: "dismissed" });
 refetchComplaints();
 alert(`사건번호 ${id.slice(-6)}이(가) 불기소/기각 처리되었습니다.`);
 } catch (error) {
 logger.error("Error dismissing complaint:", error);
 alert("처리 중 오류가 발생했습니다.");
 }
 };

 const handleEditClick = (complaint) => {
 if (!currentUserId) {
 alert("로그인이 필요합니다.");
 return;
 }
 const canModify =
 hasProsecutorPrivileges || hasJudgePrivileges || hasAdminPrivileges;
 const isOwner = complaint.complainantId === currentUserId;

 if (!canModify && !isOwner) {
 return alert(
 "본인이 작성했거나 권한이 있는 고소장만 수정할 수 있습니다.",
 );
 }

 if (!canModify && isOwner && complaint.status !== "pending") {
 return alert("진행 중이거나 완료된 사건은 수정할 수 없습니다.");
 }

 if (["resolved", "dismissed"].includes(complaint.status) && !isAdmin) {
 return alert("완료된 사건은 수정할 수 없습니다.");
 }

 if (complaint.caseType === "bankruptcy") {
 return alert("파산 신청서는 수정할 수 없습니다.");
 }

 setEditingComplaint(complaint);
 setIsEditModalOpen(true);
 };

 const handleSaveEdit = async (updatedComplaintData) => {
 if (!classCode || !editingComplaint?.id) return;

 const complaintRef = doc(
 db,
 "classes",
 classCode,
 "courtComplaints",
 editingComplaint.id,
 );
 const {
 id,
 classCode: prevClassCode,
 ...dataToSave
 } = updatedComplaintData;

 try {
 await updateDoc(complaintRef, {
 ...dataToSave,
 updatedAt: serverTimestamp(),
 });
 refetchComplaints();
 setIsEditModalOpen(false);
 setEditingComplaint(null);
 alert(`사건번호 ${editingComplaint.id.slice(-6)} 정보가 수정되었습니다.`);
 } catch (error) {
 logger.error("Error updating complaint:", error);
 alert("고소장 수정 중 오류가 발생했습니다.");
 }
 };

 const handleCloseEditModal = () => {
 setIsEditModalOpen(false);
 setEditingComplaint(null);
 };

 const handleVote = async (complaintId, voteType) => {
 if (!currentUserId || !classCode) return alert("로그인이 필요합니다.");
 const complaintRef = doc(
 db,
 "classes",
 classCode,
 "courtComplaints",
 complaintId,
 );

 try {
 await runTransaction(db, async (transaction) => {
 const complaintDoc = await transaction.get(complaintRef);
 if (!complaintDoc.exists()) {
 throw "고소장을 찾을 수 없습니다.";
 }
 const complaintData = complaintDoc.data();
 let likedBy = complaintData.likedBy || [];
 let dislikedBy = complaintData.dislikedBy || [];

 const alreadyLiked = likedBy.includes(currentUserId);
 const alreadyDisliked = dislikedBy.includes(currentUserId);

 if (voteType === "like") {
 likedBy = alreadyLiked
 ? likedBy.filter((id) => id !== currentUserId)
 : [...likedBy, currentUserId];
 dislikedBy = dislikedBy.filter((id) => id !== currentUserId);
 } else if (voteType === "dislike") {
 dislikedBy = alreadyDisliked
 ? dislikedBy.filter((id) => id !== currentUserId)
 : [...dislikedBy, currentUserId];
 likedBy = likedBy.filter((id) => id !== currentUserId);
 }
 transaction.update(complaintRef, {
 likedBy,
 dislikedBy,
 updatedAt: serverTimestamp(),
 });
 });
 refetchComplaints();
 } catch (error) {
 logger.error("Error voting on complaint:", error);
 alert("투표 처리 중 오류가 발생했습니다: " + error.message);
 }
 };

 const handleStartTrial = async (complaintId) => {
 if (!hasJudgePrivileges || !classCode)
 return alert("재판 시작 권한이 없습니다.");

 const complaint = (complaints || []).find((c) => c.id === complaintId);
 if (!complaint) return alert("사건을 찾을 수 없습니다.");

 try {
 const trialRoomData = {
 caseId: complaintId,
 caseNumber: complaintId.slice(-6),
 judgeId: currentUserId,
 judgeName:
 currentUserDoc?.name || currentUserDoc?.displayName || "판사",
 complainantId: complaint.complainantId,
 defendantId: complaint.defendantId,
 prosecutorId: null,
 lawyerId: null,
 juryIds: [],
 status: "active",
 createdAt: serverTimestamp(),
 participants: [currentUserId],
 };

 const trialRoomsRef = collection(db, "classes", classCode, "trialRooms");
 const newRoomRef = await addDoc(trialRoomsRef, trialRoomData);

 const complaintRef = doc(
 db,
 "classes",
 classCode,
 "courtComplaints",
 complaintId,
 );
 await updateDoc(complaintRef, {
 status: "on_trial",
 trialRoomId: newRoomRef.id,
 });

 refetchComplaints();
 refetchTrialRooms();

 alert(
 `사건번호 ${complaintId.slice(-6)}의 재판방이 생성되었습니다. 재판을 시작합니다.`,
 );

 setActiveTrialRoom(newRoomRef.id);
 setActiveTab("trial-room");
 } catch (error) {
 logger.error("Error starting trial:", error);
 alert("재판 시작 처리 중 오류가 발생했습니다.");
 }
 };

 const handleOpenJudgmentModal = (complaint) => {
 if (!hasJudgePrivileges) return alert("판결문 작성 권한이 없습니다.");
 if (complaint.status !== "on_trial")
 return alert("재판 진행 중인 사건만 판결할 수 있습니다.");
 setJudgingComplaint(complaint);
 setIsJudgmentModalOpen(true);
 };

 const handleSaveJudgment = async (complaintId, judgmentText) => {
 if (!classCode) return;
 const complaintRef = doc(
 db,
 "classes",
 classCode,
 "courtComplaints",
 complaintId,
 );
 try {
 await updateDoc(complaintRef, {
 judgment: judgmentText,
 status: "resolved",
 resolvedAt: serverTimestamp(),
 });

 const complaint = (complaints || []).find((c) => c.id === complaintId);
 if (complaint?.trialRoomId) {
 const trialRoomRef = doc(
 db,
 "classes",
 classCode,
 "trialRooms",
 complaint.trialRoomId,
 );
 await updateDoc(trialRoomRef, {
 status: "completed",
 completedAt: serverTimestamp(),
 });
 refetchTrialRooms();
 }

 refetchComplaints();

 setIsJudgmentModalOpen(false);
 setJudgingComplaint(null);
 alert(`사건번호 ${complaintId.slice(-6)}의 판결문이 저장되었습니다.`);
 setActiveTab("results");
 } catch (error) {
 logger.error("Error saving judgment:", error);
 alert("판결문 저장 중 오류가 발생했습니다.");
 }
 };

 const handleCloseJudgmentModal = () => {
 setIsJudgmentModalOpen(false);
 setJudgingComplaint(null);
 };

 const handleOpenSettlementModal = (complaint) => {
 if (!hasJudgePrivileges && !hasAdminPrivileges)
 return alert("합의금 지급 처리 권한은 판사 또는 관리자에게 있습니다.");
 if (complaint.status !== "resolved")
 return alert(
 "재판이 완료된 사건에 대해서만 합의금을 처리할 수 있습니다.",
 );
 if (complaint.settlementPaid)
 return alert("이미 합의금 지급이 완료된 사건입니다.");

 setSettlementComplaint(complaint);
 setIsSettlementModalOpen(true);
 };

 const handleCloseSettlementModal = () => {
 setIsSettlementModalOpen(false);
 setSettlementComplaint(null);
 };

 const handleSendSettlement = async (
 complaintId,
 amount,
 senderId,
 recipientId,
 ) => {
 if (!classCode) {
 alert("학급 정보가 없어 합의금 지급을 처리할 수 없습니다.");
 return false;
 }
 const numericAmount = parseInt(amount, 10);
 if (isNaN(numericAmount) || numericAmount <= 0) {
 alert("유효한 금액을 입력해주세요.");
 return false;
 }
 if (!senderId || !recipientId) {
 alert("보내는 사람과 받는 사람을 모두 선택해주세요.");
 return false;
 }
 if (senderId === recipientId) {
 alert("보내는 사람과 받는 사람은 같을 수 없습니다.");
 return false;
 }

 const sender = users.find((u) => u.id === senderId);
 const recipient = users.find((u) => u.id === recipientId);

 if (!sender || !recipient) {
 alert("유효하지 않은 사용자 정보입니다.");
 return false;
 }
 const senderName = sender?.name || sender?.displayName || senderId;
 const recipientName =
 recipient?.name || recipient?.displayName || recipientId;

 try {
 await runTransaction(db, async (transaction) => {
 const senderRef = doc(db, "users", senderId);
 const recipientRef = doc(db, "users", recipientId);
 const complaintDocRef = doc(
 db,
 "classes",
 classCode,
 "courtComplaints",
 complaintId,
 );

 const senderSnap = await transaction.get(senderRef);
 const recipientSnap = await transaction.get(recipientRef);
 const complaintSnap = await transaction.get(complaintDocRef);

 if (!senderSnap.exists())
 throw new Error(`${senderName}님의 사용자 정보를 찾을 수 없습니다.`);
 if (!recipientSnap.exists())
 throw new Error(
 `${recipientName}님의 사용자 정보를 찾을 수 없습니다.`,
 );
 if (!complaintSnap.exists())
 throw new Error("해당 고소 정보를 찾을 수 없습니다.");

 const senderCash = senderSnap.data().cash || 0;

 if (senderCash < numericAmount) {
 throw new Error(
 `${senderName}님의 현금이 부족합니다. (보유: ${senderCash.toLocaleString()}원)`,
 );
 }

 transaction.update(senderRef, {
 cash: increment(-numericAmount),
 });
 transaction.update(recipientRef, {
 cash: increment(numericAmount),
 });
 transaction.update(complaintDocRef, {
 settlementPaid: true,
 settlementAmount: numericAmount,
 settlementDate: serverTimestamp(),
 });
 });

 refetchComplaints();

 alert(
 `${senderName}님이 ${recipientName}님에게 ${numericAmount.toLocaleString()}원 합의금 지급을 완료했습니다.`,
 );
 handleCloseSettlementModal();
 return true;
 } catch (error) {
 logger.error("합의금 지급 트랜잭션 오류:", error);
 alert(`합의금 지급에 실패했습니다: ${error.message}`);
 return false;
 }
 };

 const getUserNameById = (userId) => {
 const user = users.find((u) => u.id === userId);
 return user?.name || user?.displayName || userId || "알 수 없음";
 };

 const formatDate = (dateString) => {
 if (!dateString) return "-";
 try {
 const date = new Date(dateString);
 if (isNaN(date.getTime())) return "날짜 정보 없음";
 return date.toLocaleString("ko-KR", {
 year: "numeric",
 month: "short",
 day: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 });
 } catch (error) {
 logger.error("Date formatting error:", dateString, error);
 return "날짜 변환 오류";
 }
 };

 const renderTabContent = () => {
 if (
 !currentUserId &&
 (activeTab === "submit" || activeTab === "bankruptcy")
 ) {
 return <p className="empty-state">로그인이 필요합니다.</p>;
 }

 switch (activeTab) {
 case "submit":
 return (
 <>
 <SubmitComplaint
 onSubmitComplaint={handleAddComplaint}
 users={users.filter(
 (u) => u.id !== currentUserId && u.classCode === classCode,
 )}
 currentUserId={currentUserId}
 />
 </>
 );
 case "bankruptcy":
 return <BankruptcySection refetchComplaints={refetchComplaints} />;
 case "status":
 return (
 <ComplaintStatus
 complaints={(complaints || []).filter((c) =>
 ["pending", "indicted", "on_trial", "dismissed"].includes(
 c.status,
 ),
 )}
 onEditComplaint={handleEditClick}
 onDeleteComplaint={handleDeleteComplaint}
 onIndictComplaint={handleIndictComplaint}
 onDismissComplaint={handleDismissComplaint}
 onStartTrial={handleStartTrial}
 onOpenJudgment={handleOpenJudgmentModal}
 onVote={handleVote}
 isAdmin={isAdmin}
 hasProsecutorPrivileges={hasProsecutorPrivileges}
 hasJudgePrivileges={hasJudgePrivileges}
 currentUserId={currentUserId}
 users={users}
 formatDate={formatDate}
 getUserNameById={getUserNameById}
 />
 );
 case "results":
 return (
 <TrialResults
 complaints={complaints}
 users={users}
 onOpenSettlementModal={handleOpenSettlementModal}
 />
 );
 case "trial-room":
 return activeTrialRoom ? (
 <TrialRoom
 roomId={activeTrialRoom}
 classCode={classCode}
 currentUser={currentUserDoc}
 users={users}
 onClose={() => {
 setActiveTrialRoom(null);
 setActiveTab("status");
 }}
 />
 ) : (
 <div className="trial-rooms-list">
 <h3>진행 중인 재판방</h3>
 {trialRooms.filter((r) => r.status === "active").length > 0 ? (
 <div className="rooms-grid">
 {trialRooms
 .filter((r) => r.status === "active")
 .map((room) => (
 <div key={room.id} className="room-card">
 <h4>사건번호: {room.caseNumber}</h4>
 <p>판사: {room.judgeName}</p>
 <p>참여자: {room.participants?.length || 0}명</p>
 <button
 className="enter-room-btn"
 onClick={() => {
 setActiveTrialRoom(room.id);
 }}
 >
 재판방 입장
 </button>
 </div>
 ))}
 </div>
 ) : (
 <p className="empty-state">진행 중인 재판이 없습니다.</p>
 )}
 </div>
 );
 default:
 return <p>탭을 선택해주세요.</p>;
 }
 };

 if (auth.loading || usersLoading || jobsLoading) {
 return (
 <div className="court-container">
 <div className="p-8 text-center text-slate-500">
 사용자 정보를 불러오는 중...
 </div>
 </div>
 );
 }
 if (!currentUserDoc) {
 return (
 <div className="court-container">
 <div className="p-8 text-center text-slate-500">
 로그인 정보가 없습니다. 다시 로그인해주세요.
 </div>
 </div>
 );
 }
 if (!classCode) {
 return (
 <div className="court-container">
 <div className="p-8 text-center text-slate-500">
 법원 시스템을 이용하려면 학급 코드가 설정되어야 합니다.
 </div>
 </div>
 );
 }
 if (complaintsLoading) {
 return (
 <div className="court-container">
 <div className="p-8 text-center text-slate-500">
 데이터를 불러오는 중...
 </div>
 </div>
 );
 }

 return (
 <div className="court-container">
 <div className="court-header-container">
 <h1 className="court-header">
 법원 시스템{hasJudgePrivileges && " - 판사 권한"}
 {hasAdminPrivileges && " 🔨"}
 </h1>
 </div>

 <div className="court-tabs">
 <div className="main-tabs">
 <button
 className={`court-tab-button ${activeTab === "submit" ? "active" : ""}`}
 onClick={() => setActiveTab("submit")}
 >
 고소장 제출
 </button>
 <button
 className={`court-tab-button ${activeTab === "status" ? "active" : ""}`}
 onClick={() => setActiveTab("status")}
 >
 사건 현황
 </button>
 <button
 className={`court-tab-button ${activeTab === "results" ? "active" : ""}`}
 onClick={() => setActiveTab("results")}
 >
 재판 결과
 </button>
 <button
 className={`court-tab-button ${activeTab === "trial-room" ? "active" : ""}`}
 onClick={() => setActiveTab("trial-room")}
 >
 재판방 ⚖️
 </button>
 <button
 className={`court-tab-button bankruptcy-tab-button ${activeTab === "bankruptcy" ? "active" : ""}`}
 onClick={() => setActiveTab("bankruptcy")}
 >
 파산 신청
 </button>
 </div>
 </div>

 <div className="court-tab-content">{renderTabContent()}</div>

 {/* 모달들 */}
 {isEditModalOpen && editingComplaint && (
 <EditComplaintModal
 complaint={editingComplaint}
 onSave={handleSaveEdit}
 onCancel={handleCloseEditModal}
 users={users.filter(
 (u) =>
 u.id !== editingComplaint.complainantId &&
 u.classCode === classCode,
 )}
 />
 )}
 {isJudgmentModalOpen && judgingComplaint && (
 <JudgmentModal
 complaint={judgingComplaint}
 onSave={handleSaveJudgment}
 onCancel={handleCloseJudgmentModal}
 />
 )}
 {isSettlementModalOpen && settlementComplaint && (
 <SettlementModal
 complaint={settlementComplaint}
 users={users}
 onSave={handleSendSettlement}
 onCancel={handleCloseSettlementModal}
 getUserNameById={getUserNameById}
 />
 )}
 </div>
 );
};

export default Court;
