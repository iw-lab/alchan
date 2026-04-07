// src/PoliceStation.js - Tailwind UI 리팩토링
import React, { useState, useEffect, useMemo, useCallback } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../../contexts/AuthContext";
import { db, processSettlement, processFineTransaction } from "../../firebase";

import "./Police.css";
import SubmitReport from "./SubmitReport";
import ReportStatus from "./ReportStatus";
import ReportResults from "./ReportResults";
import PoliceAdminSettings from "./PoliceAdminSettings";
import { usePolling } from "../../hooks/usePolling";

import { logger } from "../../utils/logger";
import {
 collection,
 doc,
 getDoc,
 runTransaction,
 increment,
 serverTimestamp,
 setDoc,
 addDoc,
 updateDoc,
 deleteDoc,
 query,
 orderBy,
 where,
 getDocs,
 writeBatch,
 limit,
} from "firebase/firestore";

// --- Helper Components ---

// EditComplaintModal: 고소장 수정 모달
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

 const defendantOptions = users.map((user) => (
 <option key={user.id} value={user.id}>
 {user.name || user.displayName || user.id}
 </option>
 ));

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

// JudgmentModal: 판결문 작성 모달
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

// SettlementModal: 합의금 지급 처리 모달 - 수정된 버전
const SettlementModal = ({
 complaint,
 users,
 onSave,
 onCancel,
 getUserNameById,
}) => {
 const safeComplaint = complaint || {};

 const [amount, setAmount] = useState(safeComplaint.amount?.toString() || "");
 const [reason, setReason] = useState(
 safeComplaint.resolution || "상호 합의에 따른 합의금 지급",
 );
 const [senderId, setSenderId] = useState(
 safeComplaint.defendantId || safeComplaint.reportedUserId || "",
 );
 const [recipientId, setRecipientId] = useState(
 safeComplaint.complainantId || safeComplaint.reporterId || "",
 );
 const auth = useAuth();
 const currentAdminId = auth.userDoc?.id;

 // 모달이 열릴 때 디버깅 로그
 useEffect(() => {
 logger.log("SettlementModal이 렌더링됨", {
 complaintId: safeComplaint.id,
 senderId,
 recipientId,
 });
 }, [safeComplaint.id, senderId, recipientId]);

 const handleSave = async () => {
 logger.log("Settlement Modal - handleSave 호출됨", {
 reportId: safeComplaint.id,
 amount,
 senderId,
 recipientId,
 reason,
 });

 if (!safeComplaint.id) {
 alert("오류: 사건 ID를 찾을 수 없어 처리할 수 없습니다.");
 return;
 }
 if (!amount || isNaN(parseInt(amount)) || parseInt(amount) <= 0) {
 alert("유효한 합의 금액을 입력해주세요.");
 return;
 }
 if (!senderId || !recipientId) {
 alert("송금자와 수금자를 모두 선택해주세요.");
 return;
 }
 if (senderId === recipientId) {
 alert("송금자와 수금자는 같을 수 없습니다.");
 return;
 }

 try {
 const success = await onSave(
 safeComplaint.id,
 parseInt(amount),
 senderId,
 recipientId,
 reason,
 currentAdminId,
 );
 if (success) {
 // 성공하면 모달이 부모 컴포넌트에서 닫힘
 }
 } catch (error) {
 logger.error("Settlement Modal - 저장 중 오류:", error);
 alert(`오류 발생: ${error.message}`);
 }
 };

 const availableSenders = users.filter((u) => u.id !== recipientId);
 const availableRecipients = users.filter((u) => u.id !== senderId);

 // Portal 대신 직접 렌더링으로 변경하여 z-index 문제 해결
 return (
 <div className="settlement-modal-overlay" onClick={onCancel}>
 <div
 className="settlement-modal-safe-container"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="settlement-modal-header">
 <h3>
 합의금 지급 처리 (사건번호: {safeComplaint.id?.slice(-6) || "없음"})
 </h3>
 <button className="close-button" onClick={onCancel}>
 &times;
 </button>
 </div>

 <div className="settlement-modal-content">
 <p className="text-slate-800 mb-2">
 <strong>고소인:</strong> {getUserNameById(recipientId)}
 </p>
 <p className="text-slate-800 mb-4">
 <strong>피고소인:</strong> {getUserNameById(senderId)}
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
 {availableSenders.map((user) => (
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
 {availableRecipients.map((user) => (
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
 <div className="form-group">
 <label htmlFor="settlementReason" className="form-label">
 처리 사유:
 </label>
 <textarea
 id="settlementReason"
 className="form-textarea"
 value={reason}
 onChange={(e) => setReason(e.target.value)}
 rows="3"
 placeholder="예: 상호 원만한 합의"
 />
 </div>
 </div>

 <div className="settlement-modal-footer">
 <button onClick={onCancel} className="modal-button cancel">
 취소
 </button>
 <button onClick={handleSave} className="modal-button process">
 지급 처리
 </button>
 </div>
 </div>
 </div>
 );
};
// --- Helper Components 끝 ---

const defaultReasons = [
 { reason: "급식실 새치기", amount: 30000, isLaw: false },
 { reason: "실내에서 신발신기", amount: 30000, isLaw: false },
 { reason: "운동장에서 실내화 신기", amount: 30000, isLaw: false },
 { reason: "욕설 사용", amount: 50000, isLaw: false },
 { reason: "친구 건들기/때리기", amount: 100000, isLaw: false },
 { reason: "시비 걸기", amount: 70000, isLaw: false },
 { reason: "기타", amount: 0, isLaw: false },
];

// 국세청과 동일한 nationalTreasuries 컬렉션 사용
const getClassTreasuryPath = (classCode) => `nationalTreasuries/${classCode}`;

const PoliceStation = () => {
 const auth = useAuth();
 const currentUser = auth.userDoc;
 const currentUserId = currentUser?.id;
 const classCode = currentUser?.classCode;

 const isSystemAdmin = auth.loading
 ? false
 : auth.isAdmin
 ? auth.isAdmin()
 : currentUser?.isAdmin || false;

 const [activeTab, setActiveTab] = useState("submit");
 const [previousTab, setPreviousTab] = useState("submit");

 const [reportReasons, setReportReasons] = useState([]);

 const [users, setUsers] = useState([]);
 const [usersLoading, setUsersLoading] = useState(true);

 const [isEditModalOpen, setIsEditModalOpen] = useState(false);
 const [editingComplaint, setEditingComplaint] = useState(null);
 const [isJudgmentModalOpen, setIsJudgmentModalOpen] = useState(false);
 const [judgingComplaint, setJudgingComplaint] = useState(null);
 const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
 const [settlementComplaint, setSettlementComplaint] = useState(null);

 // modal-root 엘리먼트 생성
 useEffect(() => {
 if (!document.getElementById("modal-root")) {
 const modalRoot = document.createElement("div");
 modalRoot.id = "modal-root";
 document.body.appendChild(modalRoot);
 }
 }, []);

 const getUserNameById = useCallback(
 (userId) => {
 if (!users || users.length === 0) return userId || "정보 없음";
 const user = users.find((u) => u.id === userId);
 return user?.name || user?.displayName || userId || "알 수 없음";
 },
 [users],
 );

 const formatDate = (dateInput) => {
 if (!dateInput) return "N/A";
 try {
 const date =
 typeof dateInput.toDate === "function"
 ? dateInput.toDate()
 : new Date(dateInput);
 if (isNaN(date.getTime())) return "유효하지 않은 날짜";
 return date.toLocaleString("ko-KR", {
 year: "numeric",
 month: "2-digit",
 day: "2-digit",
 hour: "2-digit",
 minute: "2-digit",
 hour12: false,
 });
 } catch (error) {
 logger.error("Error formatting date:", dateInput, error);
 return "날짜 오류";
 }
 };

 // Users data from AuthContext or fallback to polling
 const usersQuery = useMemo(() => {
 if (!classCode || auth.classmates?.length > 0) return null;
 return query(collection(db, "users"), where("classCode", "==", classCode));
 }, [classCode, auth.classmates]);

 const { data: polledUsers, loading: pollingUsersLoading } = usePolling(
 async () => {
 if (!usersQuery) return null;
 const snapshot = await getDocs(usersQuery);
 return snapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 }));
 },
 {
 interval: 30 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 30분 (사용자 목록은 거의 안 바뀜)
 enabled: !!usersQuery && !auth.loading,
 deps: [classCode, auth.loading, usersQuery],
 },
 );

 // AuthContext의 classmates 데이터 활용 (중복 읽기 방지)
 useEffect(() => {
 if (auth.loading) {
 setUsersLoading(true);
 return;
 }

 // AuthContext의 classmates 데이터 사용
 if (auth.classmates && auth.classmates.length > 0) {
 // 현재 사용자 포함
 const allUsers = auth.classmates;
 if (currentUser && !allUsers.find((u) => u.id === currentUser.id)) {
 allUsers.push({
 id: currentUser.id,
 name: currentUser.name,
 displayName: currentUser.displayName,
 ...currentUser,
 });
 }
 setUsers(allUsers);
 setUsersLoading(false);
 } else if (!classCode) {
 setUsers([]);
 setUsersLoading(false);
 } else if (polledUsers) {
 // usePolling에서 가져온 데이터 사용
 setUsers(polledUsers);
 setUsersLoading(pollingUsersLoading);
 } else {
 setUsersLoading(pollingUsersLoading);
 }
 }, [
 auth.loading,
 auth.classmates,
 classCode,
 currentUser,
 polledUsers,
 pollingUsersLoading,
 ]);

 // Jobs polling - for police chief check
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

 // Check if user is police chief
 const isPoliceChief = useMemo(() => {
 if (!currentUser?.selectedJobIds || !jobs) return false;
 const selectedJobs = jobs.filter((job) =>
 currentUser.selectedJobIds.includes(job.id),
 );
 return selectedJobs.some((job) => job.title === "경찰청장");
 }, [currentUser?.selectedJobIds, jobs]);

 const hasPoliceAdminRights = isSystemAdmin || isPoliceChief;

 // Treasury balance polling
 const treasuryRef = useMemo(() => {
 if (!classCode) return null;
 return doc(db, getClassTreasuryPath(classCode));
 }, [classCode]);

 const { data: treasuryBalance, loading: treasuryLoading } = usePolling(
 async () => {
 if (!classCode) return 0;
 // 국고 = 관리자 cash
 const adminQuery = await getDocs(query(
 collection(db, "users"),
 where("classCode", "==", classCode),
 where("isAdmin", "==", true)
 ));
 if (!adminQuery.empty) {
 return adminQuery.docs[0].data().cash || 0;
 }
 return 0;
 },
 {
 interval: 15 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 15분 (국고 데이터는 자주 안 바뀜)
 enabled: !!classCode && !auth.loading,
 deps: [classCode, auth.loading, hasPoliceAdminRights],
 },
 );

 // Approved laws polling
 const lawsQuery = useMemo(() => {
 if (!classCode) return null;
 const lawsRef = collection(
 db,
 "classes",
 classCode,
 "nationalAssemblyLaws",
 );
 return query(
 lawsRef,
 where("finalStatus", "==", "final_approved"),
 orderBy("timestamp", "desc"),
 limit(50),
 );
 }, [classCode]);

 const { data: approvedLaws, loading: lawsLoading } = usePolling(
 async () => {
 if (!lawsQuery) return [];
 const snapshot = await getDocs(lawsQuery);
 return snapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 }));
 },
 {
 interval: 30 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 30분 (법안은 자주 안 바뀜)
 enabled: !!classCode,
 deps: [classCode],
 },
 );

 // Custom report reasons polling
 const customReasonsDocRef = useMemo(() => {
 if (!classCode) return null;
 return doc(db, "classes", classCode, "policeReportReasons", "custom");
 }, [classCode]);

 const { data: customReportReasons, loading: reasonsLoading } = usePolling(
 async () => {
 if (!customReasonsDocRef)
 return [...defaultReasons.filter((r) => !r.isLaw)];
 const docSnap = await getDoc(customReasonsDocRef);
 let reasons;
 if (docSnap.exists() && docSnap.data().reasons) {
 reasons = docSnap.data().reasons;
 } else {
 reasons = defaultReasons.filter((r) => !r.isLaw);
 if (hasPoliceAdminRights) {
 setDoc(customReasonsDocRef, {
 reasons: reasons,
 updatedAt: serverTimestamp(),
 classCode: classCode,
 }).catch((err) =>
 logger.error("Error creating default custom reasons:", err),
 );
 }
 }
 return reasons;
 },
 {
 interval: 60 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 1시간 (신고 사유는 거의 안 바뀜)
 enabled: !!classCode,
 deps: [classCode, hasPoliceAdminRights],
 },
 );

 useEffect(() => {
 if (lawsLoading || reasonsLoading) return;
 const laws = approvedLaws || [];
 const customReasons = customReportReasons || [];
 const lawReasons = laws.map((law) => {
 const fineMatch = law.fine?.match(/\d+/g);
 const amount = fineMatch ? parseInt(fineMatch.join(""), 10) : 10000;
 return {
 reason: `[법안] ${law.title} 위반`,
 description: law.description || "",
 amount,
 lawId: law.id,
 isLaw: true,
 };
 });
 setReportReasons([...lawReasons, ...customReasons]);
 }, [approvedLaws, customReportReasons, lawsLoading, reasonsLoading]);

 // Police reports polling
 const reportsQuery = useMemo(() => {
 if (!classCode) return null;
 const reportsRef = collection(db, "classes", classCode, "policeReports");
 return query(reportsRef, orderBy("submitDate", "desc"), limit(100));
 }, [classCode]);

 const {
 data: reports,
 loading: reportsLoading,
 refetch: refetchReports,
 } = usePolling(
 async () => {
 if (!reportsQuery) return [];
 const querySnapshot = await getDocs(reportsQuery);
 return querySnapshot.docs.map((doc) => {
 const data = doc.data();
 return {
 id: doc.id,
 ...data,
 submitDate: data.submitDate?.toDate
 ? data.submitDate.toDate().toISOString()
 : null,
 acceptanceDate: data.acceptanceDate?.toDate
 ? data.acceptanceDate.toDate().toISOString()
 : null,
 resolutionDate: data.resolutionDate?.toDate
 ? data.resolutionDate.toDate().toISOString()
 : null,
 };
 });
 },
 {
 interval: 10 * 60 * 1000, // 🔥 [비용 최적화] 5분 → 10분 (신고 목록)
 enabled: !!classCode,
 deps: [classCode],
 },
 );

 const handleTabChange = (newTab) => {
 setPreviousTab(activeTab);
 setActiveTab(newTab);
 };

 const handleBackToPolice = () => {
 setActiveTab(previousTab !== "admin" ? previousTab : "submit");
 };

 const handleAddReport = async (newReportData) => {
 if (!currentUserId || !classCode) {
 alert("로그인이 필요하거나 학급 정보가 없습니다.");
 return;
 }
 if (!newReportData.reportedUserId || !newReportData.reason) {
 alert("신고 대상과 사유를 모두 선택해주세요.");
 return;
 }
 const reasonInfo = reportReasons.find(
 (r) => r.reason === newReportData.reason,
 );
 const reportsRef = collection(db, "classes", classCode, "policeReports");
 const newReport = {
 ...newReportData,
 reporterId: currentUserId,
 complainantId: currentUserId,
 reporterName: currentUser.name || currentUser.displayName || "익명",
 submitDate: serverTimestamp(),
 status: "submitted",
 amount: reasonInfo?.amount || 0,
 isLawReport: reasonInfo?.isLaw || false,
 description: reasonInfo?.description || newReportData.reason,
 lawId: reasonInfo?.lawId || null,
 classCode: classCode,
 acceptanceDate: null,
 resolution: null,
 resolutionDate: null,
 processedById: null,
 processedByName: null,
 settlementPaid: false,
 defendantId: newReportData.reportedUserId,
 };
 try {
 await addDoc(reportsRef, newReport);
 refetchReports(); // 🔥 즉시 새로고침
 handleTabChange("status");
 alert("신고가 성공적으로 제출되었습니다.");
 } catch (error) {
 logger.error("Error adding report:", error);
 alert("신고 제출 오류.");
 }
 };

 const handleAcceptReport = async (id) => {
 logger.log("handleAcceptReport 호출됨:", id);
 if (!hasPoliceAdminRights || !classCode || !currentUserId) {
 alert("권한이 없거나 정보가 부족합니다.");
 return;
 }
 const reportRef = doc(db, "classes", classCode, "policeReports", id);
 try {
 await updateDoc(reportRef, {
 status: "accepted",
 acceptanceDate: serverTimestamp(),
 processedById: currentUserId,
 processedByName:
 currentUser.name || currentUser.displayName || "관리자",
 });
 refetchReports(); // 🔥 즉시 새로고침
 logger.log("신고 접수 성공:", id);
 alert("신고가 접수되었습니다.");
 } catch (error) {
 logger.error("Error accepting report:", error);
 alert("신고 접수 오류.");
 }
 };

 const handleDismissReport = async (id) => {
 logger.log("handleDismissReport 호출됨:", id);
 if (!hasPoliceAdminRights || !classCode || !currentUserId) {
 alert("권한이 없거나 정보가 부족합니다.");
 return;
 }
 const reportRef = doc(db, "classes", classCode, "policeReports", id);
 try {
 await updateDoc(reportRef, {
 status: "dismissed",
 resolution: "신고 반려/기각",
 resolutionDate: serverTimestamp(),
 processedById: currentUserId,
 processedByName:
 currentUser.name || currentUser.displayName || "관리자",
 });
 refetchReports(); // 🔥 즉시 새로고침
 logger.log("신고 반려 성공:", id);
 alert("신고가 반려되었습니다.");
 } catch (error) {
 logger.error("Error dismissing report:", error);
 alert("신고 반려 오류.");
 }
 };

 const handleProcessReport = async (
 id,
 processingAmount,
 processingReason,
 ) => {
 logger.log("handleProcessReport 호출됨:", {
 id,
 processingAmount,
 processingReason,
 });

 if (!hasPoliceAdminRights || !currentUserId || !classCode) {
 alert("권한 또는 정보 부족");
 return;
 }

 const report = reports.find((r) => r.id === id);
 if (!report) {
 alert("신고를 찾을 수 없습니다.");
 return;
 }

 if (report.status !== "accepted") {
 alert("접수된 신고만 처리 가능합니다.");
 return;
 }

 const numericProcessingAmount = parseInt(processingAmount, 10);
 if (isNaN(numericProcessingAmount) || numericProcessingAmount < 0) {
 alert("유효한 금액(0 이상) 입력 필요");
 return;
 }

 let finalResolution = processingReason || "벌금 부과 처리";
 if (report.isLawReport && report.description) {
 finalResolution = `${processingReason || "법안 위반"}: ${
 report.description
 }`;
 }

 const reportRef = doc(db, "classes", classCode, "policeReports", id);

 if (numericProcessingAmount > 0) {
 const reportedUserId = report.reportedUserId || report.defendantId;

 try {
 const reasonForLog = `경찰서 신고 (사건번호: ${id.slice(-6)})에 대한 벌금 ${numericProcessingAmount.toLocaleString()}원 납부`;

 await processFineTransaction(
 reportedUserId,
 classCode,
 numericProcessingAmount,
 reasonForLog,
 );

 await updateDoc(reportRef, {
 status: "resolved_fine",
 resolutionDate: serverTimestamp(),
 resolution: finalResolution,
 amount: numericProcessingAmount,
 processedById: currentUserId,
 processedByName:
 currentUser.name || currentUser.displayName || "관리자",
 });

 refetchReports(); // 🔥 즉시 새로고침
 alert("벌금 처리가 완료되었습니다.");
 } catch (error) {
 logger.error("벌금 처리 트랜잭션 오류:", error);
 alert(`벌금 처리 실패: ${error.message}`);
 return;
 }
 } else {
 try {
 await updateDoc(reportRef, {
 status: "resolved_fine",
 resolutionDate: serverTimestamp(),
 resolution: finalResolution,
 amount: 0,
 processedById: currentUserId,
 processedByName:
 currentUser.name || currentUser.displayName || "관리자",
 });
 refetchReports(); // 🔥 즉시 새로고침
 alert("경고 처리가 완료되었습니다.");
 } catch (error) {
 logger.error("벌금 0원 처리 오류:", error);
 alert("처리 중 오류가 발생했습니다.");
 }
 }
 };

 const handleSendSettlement = async (
 reportId,
 amount,
 senderId,
 recipientId,
 reason,
 adminId,
 ) => {
 logger.log("handleSendSettlement 호출됨 (Cloud Function):", {
 reportId,
 amount,
 senderId,
 recipientId,
 reason,
 adminId,
 });

 if (!hasPoliceAdminRights || !classCode) {
 alert("권한이 없거나 학급 정보가 없습니다.");
 return false;
 }

 try {
 // Call the new cloud function
 const result = await processSettlement({
 reportId,
 amount,
 senderId,
 recipientId,
 reason,
 adminId, // adminId is the uid of the caller
 });

 if (result.success) {
 alert(
 result.message || "합의금 지급 처리가 성공적으로 완료되었습니다.",
 );
 refetchReports(); // Refresh the reports list
 setIsSettlementModalOpen(false);
 setSettlementComplaint(null);
 return true;
 } else {
 throw new Error(result.message || "서버에서 처리를 실패했습니다.");
 }
 } catch (error) {
 logger.error("합의금 처리 실패 (Cloud Function):", error);
 alert(`오류: ${error.message || "합의금 처리 중 오류가 발생했습니다."}`);
 return false;
 }
 };

 const handleSaveEdit = async (updatedComplaint) => {
 if (!hasPoliceAdminRights || !classCode) {
 alert("권한이 없거나 학급 정보가 없습니다.");
 return;
 }
 const reportRef = doc(
 db,
 "classes",
 classCode,
 "policeReports",
 updatedComplaint.id,
 );
 try {
 await updateDoc(reportRef, {
 reason: updatedComplaint.reason,
 desiredResolution: updatedComplaint.desiredResolution,
 defendantId: updatedComplaint.defendantId,
 reportedUserId: updatedComplaint.defendantId,
 });
 refetchReports(); // 🔥 즉시 새로고침
 alert("고소장 정보가 업데이트되었습니다.");
 setIsEditModalOpen(false);
 setEditingComplaint(null);
 } catch (error) {
 logger.error("고소장 업데이트 오류:", error);
 alert("고소장 정보 업데이트에 실패했습니다.");
 }
 };

 const handleSaveJudgment = async (complaintId, judgmentText) => {
 if (!hasPoliceAdminRights || !classCode) {
 alert("권한이 없거나 학급 정보가 없습니다.");
 return;
 }
 const reportRef = doc(
 db,
 "classes",
 classCode,
 "policeReports",
 complaintId,
 );
 try {
 await updateDoc(reportRef, {
 judgment: judgmentText,
 });
 refetchReports(); // 🔥 즉시 새로고침
 alert("판결 내용이 저장되었습니다.");
 setIsJudgmentModalOpen(false);
 setJudgingComplaint(null);
 } catch (error) {
 logger.error("판결 저장 오류:", error);
 alert("판결 내용 저장에 실패했습니다.");
 }
 };

 const handleDeleteAllReports = async () => {
 if (!hasPoliceAdminRights || !classCode) return alert("권한이 없습니다.");
 if (window.confirm("모든 신고 기록 삭제?")) {
 try {
 const reportsRef = collection(
 db,
 "classes",
 classCode,
 "policeReports",
 );
 const snapshot = await getDocs(reportsRef);
 const batch = writeBatch(db);
 snapshot.docs.forEach((doc) => batch.delete(doc.ref));
 await batch.commit();
 alert("모든 신고 기록 삭제 완료.");
 } catch (error) {
 logger.error("Error deleting all reports:", error);
 alert("모든 신고 기록 삭제 오류.");
 }
 }
 };

 const handleDeleteSingleReport = async (idToDelete) => {
 if (!hasPoliceAdminRights || !classCode) return alert("권한이 없습니다.");
 const reportToDelete = reports.find((r) => r.id === idToDelete);
 if (!reportToDelete) return;
 if (window.confirm(`사건번호 ${idToDelete.slice(-6)} 삭제?`)) {
 try {
 const reportRef = doc(
 db,
 "classes",
 classCode,
 "policeReports",
 idToDelete,
 );
 await deleteDoc(reportRef);
 alert("신고 기록 삭제 완료.");
 } catch (error) {
 logger.error("Error deleting report:", error);
 alert("신고 기록 삭제 오류.");
 }
 }
 };

 const handleEditSingleReport = (idToEdit) => {
 if (!hasPoliceAdminRights) return;
 const reportToEdit = reports.find((r) => r.id === idToEdit);
 if (reportToEdit) {
 if (!reportToEdit.defendantId && reportToEdit.reportedUserId) {
 reportToEdit.defendantId = reportToEdit.reportedUserId;
 }
 setEditingComplaint(reportToEdit);
 setIsEditModalOpen(true);
 }
 };

 const handleUpdateReasons = async (updatedCustomReasons) => {
 if (!hasPoliceAdminRights || !classCode) return alert("권한이 없습니다.");
 if (
 !Array.isArray(updatedCustomReasons) ||
 updatedCustomReasons.some(
 (r) =>
 typeof r !== "object" || !r.reason || typeof r.amount !== "number",
 )
 ) {
 alert("신고 사유 데이터 형식 오류.");
 return;
 }
 try {
 const customReasonsDocRef = doc(
 db,
 "classes",
 classCode,
 "policeReportReasons",
 "custom",
 );
 await setDoc(customReasonsDocRef, {
 reasons: updatedCustomReasons,
 updatedAt: serverTimestamp(),
 classCode: classCode,
 });
 alert("사용자 정의 신고 사유 업데이트 완료.");
 } catch (error) {
 logger.error("Error updating reasons:", error);
 alert("신고 사유 업데이트 오류.");
 }
 };

 const handleOpenSettlementModal = (reportToProcess) => {
 logger.log("handleOpenSettlementModal 호출됨:", reportToProcess);

 if (!reportToProcess || !reportToProcess.id) {
 logger.error(
 "합의 처리 오류: 유효한 사건 객체를 전달받지 못했습니다.",
 reportToProcess,
 );
 alert(
 "오류: 사건 정보를 찾지 못했습니다. 페이지를 새로고침 후 다시 시도해 주세요.",
 );
 return;
 }

 const mappedReport = {
 ...reportToProcess,
 complainantId:
 reportToProcess.complainantId || reportToProcess.reporterId,
 defendantId:
 reportToProcess.defendantId || reportToProcess.reportedUserId,
 };

 if (!mappedReport.complainantId || !mappedReport.defendantId) {
 logger.error(
 "합의 처리 오류: 고소인 또는 피고소인 정보가 누락되었습니다.",
 mappedReport,
 );
 alert(
 "오류: 고소인 또는 피고소인 정보가 없는 사건은 처리할 수 없습니다.",
 );
 return;
 }

 logger.log("합의 모달 열기 준비 완료, 상태 업데이트 직전:", mappedReport);
 setSettlementComplaint(mappedReport);
 setIsSettlementModalOpen(true);
 };

 const reportsWithNames = useMemo(() => {
 if (usersLoading || reportsLoading || !reports) return reports || [];
 return reports.map((r) => ({
 ...r,
 reporterName: getUserNameById(r.reporterId),
 reportedUserName: getUserNameById(r.reportedUserId || r.defendantId),
 processedByName: r.processedById
 ? getUserNameById(r.processedById)
 : null,
 }));
 }, [reports, usersLoading, reportsLoading, getUserNameById]); // users는 getUserNameById 내부에서 사용되므로 제거

 const statusReports = useMemo(() => {
 return reportsWithNames.filter(
 (r) => r.status === "submitted" || r.status === "accepted",
 );
 }, [reportsWithNames]);

 const resultReports = useMemo(() => {
 return reportsWithNames
 .filter(
 (r) => r.status.startsWith("resolved_") || r.status === "dismissed",
 )
 .sort((a, b) => {
 const dateA = a.resolutionDate || a.submitDate;
 const dateB = b.resolutionDate || b.submitDate;
 const timeA =
 typeof dateA?.toDate === "function"
 ? dateA.toDate().getTime()
 : new Date(dateA).getTime();
 const timeB =
 typeof dateB?.toDate === "function"
 ? dateB.toDate().getTime()
 : new Date(dateB).getTime();
 return timeB - timeA;
 });
 }, [reportsWithNames]);

 if (auth.loading) {
 return (
 <div className="police-container">
 <div className="p-8 text-center text-slate-500">
 사용자 인증 정보를 확인 중입니다...
 </div>
 </div>
 );
 }

 if (!currentUser) {
 return (
 <div className="police-container">
 <div className="p-8 text-center text-slate-500">
 로그인이 필요합니다. 경찰서 기능을 사용하려면 다시 로그인해주세요.
 </div>
 </div>
 );
 }

 if (!classCode && !hasPoliceAdminRights) {
 return (
 <div className="police-container">
 <div className="p-8 text-center text-slate-500">
 경찰서 기능을 사용하려면 학급 코드가 사용자 정보에 설정되어 있어야
 합니다. 프로필에서 학급 코드를 설정해주세요.
 </div>
 </div>
 );
 }

 if (
 classCode &&
 (usersLoading ||
 treasuryLoading ||
 lawsLoading ||
 jobsLoading ||
 reasonsLoading ||
 reportsLoading)
 ) {
 return (
 <div className="police-container">
 <div className="p-8 text-center text-slate-500">
 데이터를 불러오는 중...
 </div>
 </div>
 );
 }

 if (hasPoliceAdminRights && !classCode && activeTab !== "admin") {
 return (
 <div className="police-container loading">
 관리자님, 현재 학급 코드가 설정되지 않아 이 탭의 내용을 볼 수 없습니다.
 관리자 설정을 확인하거나 프로필에서 학급 코드를 설정해주세요.
 <button onClick={() => setActiveTab("admin")}>
 관리자 설정으로 이동
 </button>
 </div>
 );
 }

 const renderTabContent = () => {
 if (!classCode && !hasPoliceAdminRights && activeTab !== "admin") {
 return (
 <p className="empty-state">
 학급 코드가 설정되어 있지 않아 기능을 사용할 수 없습니다.
 </p>
 );
 }

 switch (activeTab) {
 case "submit":
 if (!classCode)
 return (
 <p className="empty-state">
 신고를 제출할 학급이 설정되지 않았습니다.
 </p>
 );
 return (
 <SubmitReport
 onSubmitReport={handleAddReport}
 reportReasons={reportReasons}
 users={users.filter((u) => u.id !== currentUserId)}
 currentUser={currentUser}
 />
 );
 case "status":
 if (!classCode)
 return (
 <p className="empty-state">
 처리 현황을 볼 학급이 설정되지 않았습니다.
 </p>
 );
 return (
 <ReportStatus
 reports={statusReports}
 onProcessReport={handleProcessReport}
 onSettlement={handleOpenSettlementModal}
 reportReasons={reportReasons}
 formatDate={formatDate}
 onAcceptReport={handleAcceptReport}
 onDismissReport={handleDismissReport}
 currentUser={currentUser}
 isAdminView={hasPoliceAdminRights}
 users={users}
 />
 );
 case "results":
 if (!classCode)
 return (
 <p className="empty-state">
 처리 결과를 볼 학급이 설정되지 않았습니다.
 </p>
 );
 return (
 <ReportResults
 reports={resultReports}
 formatDate={formatDate}
 isAdminView={hasPoliceAdminRights}
 onEditReport={handleEditSingleReport}
 onDeleteReport={handleDeleteSingleReport}
 users={users}
 getUserNameById={getUserNameById}
 isAdmin={hasPoliceAdminRights}
 />
 );
 case "admin":
 return (
 <div className="police-admin-content">
 <div className="admin-nav-buttons">
 <button
 onClick={handleBackToPolice}
 className="back-to-police-button"
 >
 경찰서로 돌아가기
 </button>
 </div>
 <PoliceAdminSettings
 reportReasons={customReportReasons}
 onUpdateReasons={handleUpdateReasons}
 onDeleteAllReports={
 classCode
 ? handleDeleteAllReports
 : () =>
 alert(
 "모든 신고 삭제는 학급 코드가 설정된 후 가능합니다.",
 )
 }
 />
 <div className="law-reasons-info">
 <h3>법안 기반 신고 사유 (자동 업데이트)</h3>
 {classCode ? (
 reportReasons.filter((r) => r.isLaw).length > 0 ? (
 <div className="law-reasons-list">
 {reportReasons
 .filter((r) => r.isLaw)
 .map((reason, index) => (
 <div key={index} className="law-reason-item">
 <div className="reason-name">{reason.reason}</div>
 {reason.description && (
 <div className="reason-description">
 {reason.description}
 </div>
 )}
 <div className="reason-amount">
 벌금: {reason.amount.toLocaleString()}원
 </div>
 </div>
 ))}
 </div>
 ) : (
 <p className="empty-state">
 현재 학급에 가결된 법안이 없거나, 불러오는 중입니다.
 </p>
 )
 ) : (
 <p className="empty-state">
 학급 코드가 설정되지 않아 법안 기반 신고 사유를 볼 수
 없습니다.
 </p>
 )}
 </div>
 </div>
 );
 default:
 return <p>탭을 선택해주세요.</p>;
 }
 };

 return (
 <div className="police-container">
 {(auth.loading ||
 (classCode &&
 (usersLoading ||
 reportsLoading ||
 treasuryLoading ||
 lawsLoading ||
 jobsLoading ||
 reasonsLoading))) && (
 <div className="loading-overlay-transparent">데이터 동기화 중...</div>
 )}
 <div className="police-header-container">
 <h1 className="police-header">
 경찰서
 </h1>
 <div className="header-info">
 {currentUser && (
 <span className="welcome-message">
 환영합니다,{" "}
 {currentUser.name || currentUser.displayName || currentUser.id}님!
 </span>
 )}
 <span className="treasury-balance">
 현재 국고 잔액: {(treasuryBalance || 0).toLocaleString()}원
 </span>
 {hasPoliceAdminRights && (
 <button
 onClick={() => handleTabChange("admin")}
 className={`admin-settings-button ${
 activeTab === "admin" ? "active" : ""
 }`}
 title="관리 설정 열기"
 >
 관리 설정
 </button>
 )}
 </div>
 </div>

 {activeTab !== "admin" ? (
 <>
 {classCode ? (
 <>
 <div className="police-tabs">
 <button
 onClick={() => handleTabChange("submit")}
 className={`police-tab-button ${
 activeTab === "submit" ? "active" : ""
 }`}
 >
 신고하기
 </button>
 <button
 onClick={() => handleTabChange("status")}
 className={`police-tab-button ${
 activeTab === "status" ? "active" : ""
 }`}
 >
 처리 현황 ({statusReports.length})
 </button>
 <button
 onClick={() => handleTabChange("results")}
 className={`police-tab-button ${
 activeTab === "results" ? "active" : ""
 }`}
 >
 처리 결과 ({resultReports.length})
 </button>
 </div>
 <div className="police-tab-content">{renderTabContent()}</div>
 </>
 ) : (
 !hasPoliceAdminRights && (
 <div className="empty-state">
 학급 코드가 설정되어야 경찰서 기능을 이용할 수 있습니다.
 </div>
 )
 )}
 </>
 ) : hasPoliceAdminRights ? (
 renderTabContent()
 ) : (
 <div className="empty-state">관리자만 접근 가능합니다.</div>
 )}

 {/* 모달들 */}
 {isEditModalOpen && editingComplaint && (
 <EditComplaintModal
 complaint={editingComplaint}
 onSave={handleSaveEdit}
 onCancel={() => {
 setIsEditModalOpen(false);
 setEditingComplaint(null);
 }}
 users={users.filter(
 (u) =>
 u.id !==
 (editingComplaint.complainantId ||
 editingComplaint.reporterId) && u.classCode === classCode,
 )}
 />
 )}
 {isJudgmentModalOpen && judgingComplaint && (
 <JudgmentModal
 complaint={judgingComplaint}
 onSave={handleSaveJudgment}
 onCancel={() => {
 setIsJudgmentModalOpen(false);
 setJudgingComplaint(null);
 }}
 />
 )}
 {isSettlementModalOpen && settlementComplaint && (
 <SettlementModal
 complaint={settlementComplaint}
 users={users}
 onSave={handleSendSettlement}
 onCancel={() => {
 setIsSettlementModalOpen(false);
 setSettlementComplaint(null);
 }}
 getUserNameById={getUserNameById}
 />
 )}
 </div>
 );
};

export default PoliceStation;
