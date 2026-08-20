// src/Court.js - Tailwind UI 리팩토링
import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../../contexts/AuthContext";
import { db, functions, httpsCallable } from "../../firebase";
import "./Court.css";
import SubmitComplaint from "./SubmitComplaint";
import ComplaintStatus from "./ComplaintStatus";
import TrialRoom, { cleanupStaleTrialRooms } from "./TrialRoom";
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
 onSnapshot,
} from "firebase/firestore";

import { hasJobTitle } from "../../utils/jobPermissions";
import { getCurrencyUnit } from "../../utils/numberFormatter";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
import { getNetAssetsDetail } from "../../utils/netAssets";
// 실시간 리스너가 변경분을 자동 반영하므로 기존 refetch 호출부는 no-op으로 호환 유지
const noopRefetch = () => {};

// --- Helper Components ---
const EditComplaintModal = ({ complaint, onSave, onCancel, users }) => {
 const [reason, setReason] = useState(complaint.reason);
 const [desiredResolution, setDesiredResolution] = useState(
 complaint.desiredResolution,
 );
 const [defendantId, setDefendantId] = useState(complaint.defendantId);

 const handleSave = () => {
 if (!defendantId || !reason.trim() || !desiredResolution.trim()) {
 toast.error("모든 필드를 입력해주세요.");
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
 toast.error("판결 내용을 입력해주세요.");
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
 toast.error("유효한 금액을 입력해주세요.");
 return;
 }
 if (!senderId || !recipientId) {
 toast.error("보내는 사람과 받는 사람을 모두 선택해주세요.");
 return;
 }
 if (senderId === recipientId) {
 toast.error("보내는 사람과 받는 사람은 같을 수 없습니다.");
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
 toast.error("합의금 처리 중 오류가 발생했습니다.");
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
 합의금 ({getCurrencyUnit()}):
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

const TrialResults = ({ complaints, users, onOpenSettlementModal, canSettle }) => {
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
 ) : canSettle ? (
 <button
 className="settlement-button"
 onClick={() => onOpenSettlementModal(complaint)}
 >
 합의금 지급
 </button>
 ) : (
 // 판사에게는 누를 수 없는 버튼 대신 안내를 보인다(2026-08-20 교사 전용화).
 <span className="settlement-note">
 배상은 선생님이 지급합니다
 </span>
 )}
 </div>
 </div>
 ))}
 </div>
 );
};

// 파산 신청 컴포넌트
const BankruptcySection = ({ refetchComplaints }) => {
 // ⚠️ `user.uid` 를 함께 받는다. 규칙이 비교하는 값은 `request.auth.uid` 인데,
 //   AuthContext 가 `{ id: snap.id, uid: snap.id, ...snap.data() }` 순서로 합쳐서
 //   users 문서에 `id` 필드가 생기면 그게 문서ID를 **가린다**(규칙은 `id` 를 막지 않는다).
 //   지금은 45명 중 0명이라 안 깨졌지만, 그때 가서 파산 신청이 조용히 다시 고장난다.
 const { userDoc, classCode, user } = useAuth();
 const myUid = user?.uid || userDoc?.id;
 const [hasPendingBankruptcyCase, setHasPendingBankruptcyCase] =
 useState(false);
 const [isLoading, setIsLoading] = useState(true);
 const [netAssets, setNetAssets] = useState(null);
 const [isNetLoading, setIsNetLoading] = useState(true);
 // deps 를 스칼라로 뽑는다 — userDoc 객체를 dep 에 넣으면 매 렌더 새 참조라 계속 재실행되고,
 // 억제 주석으로 덮으면 진짜 누락을 나중에 못 잡는다.
 const myCash = userDoc?.cash;
 const myCoupons = userDoc?.coupons;
 const myName = userDoc?.name;

 useEffect(() => {
 if (myUid && classCode) {
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
 where("complainantId", "==", myUid),
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
 // ⚡ 본문은 myUid만 사용 — userDoc 전체 dep이면 cash 등 churn마다 courtComplaints
 //   3중조건 getDocs 재실행. uid 스칼라로 좁혀 로그인/전환 시에만 1회.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [myUid, classCode]);

 // 💰 파산 자격은 **순자산**으로 판정한다(2026-08-20). 현금만 보면 대출 때문에 순자산이
 //   음수인 학생이 신청조차 못 하고, 반대로 주식·부동산이 멀쩡한데 현금만 잠깐 음수인
 //   학생에게 신청 버튼이 뜬다. 앱의 다른 판정(FinancialRestrictionBanner)이 이미 순자산이라
 //   기준이 갈리던 것을 여기서 맞춘다.
 //
 //   ⚠️ 위 pending-case effect 와 **합치지 않는다**. 저쪽은 deps 를 [myUid, classCode] 로
 //   일부러 좁혀, cash churn 마다 courtComplaints 3중조건 쿼리가 재실행되던 걸 고친 자리다.
 //   순자산은 반대로 cash·coupons 변화에 반응해야 정확하므로(대출 상환 직후 등) 따로 둔다.
 //   합치면 이미 한 번 고친 읽기 폭주가 되살아난다.
 useEffect(() => {
 if (!myUid) {
 setIsNetLoading(false);
 return undefined;
 }
 let cancelled = false;
 (async () => {
 try {
 // FinancialRestrictionBanner 와 같은 호출 형태(명시적 객체)라 같은
 // assetCache_{uid} 5분 캐시를 공유한다 → 보통은 추가 읽기 0.
 // (캐시가 비어 있을 때만 파킹·상품·부동산·포트폴리오·시세 5문서를 읽는다.)
 const { net } = await getNetAssetsDetail({
 id: myUid,
 cash: myCash,
 coupons: myCoupons,
 name: myName,
 classCode,
 });
 if (!cancelled) setNetAssets(net);
 } catch (error) {
 logger.error("파산 자격 순자산 계산 실패:", error);
 // 실패하면 자격을 열어주지 않는다. 신청은 문서 1건이라 되돌리기 쉽지만,
 // 기준이 조용히 현금으로 되돌아가는 것보다 버튼이 안 뜨는 편이 낫다.
 if (!cancelled) setNetAssets(null);
 } finally {
 if (!cancelled) setIsNetLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [myUid, classCode, myCash, myCoupons, myName]);

 const handleApplyForBankruptcy = async () => {
 if (
 await confirmDialog(
 "정말로 파산을 신청하시겠습니까? 재판 결과에 따라 모든 자산이 초기화될 수 있습니다.", { danger: true, confirmText: "파산 신청하기" })
 ) {
 try {
 const casesRef = collection(
 db,
 "classes",
 classCode,
 "courtComplaints",
 );
 await addDoc(casesRef, {
 complainantId: myUid,
 complainantName: userDoc.name,
 caseType: "bankruptcy",
 defendantId: "system",
 defendantName: "시스템",
 status: "pending",
 reason: `순자산 ${(netAssets ?? 0).toLocaleString()}${getCurrencyUnit()}으로 인한 파산 신청`,
 desiredResolution: "모든 부채를 청산하고 자산을 0으로 초기화 요청",
 submissionDate: serverTimestamp(),
 likedBy: [],
 dislikedBy: [],
 });
 refetchComplaints();
 // 성공인데 error 토스트였다(2026-08-20 codex). 학생이 실패로 읽고 다시 누른다.
 toast.success(
 "파산 신청이 정상적으로 접수되었습니다. 재판 결과를 기다려주세요.",
 );
 setHasPendingBankruptcyCase(true);
 } catch (error) {
 logger.error("파산 신청 중 오류 발생:", error);
 toast.error("오류가 발생하여 파산 신청에 실패했습니다.");
 }
 }
 };

 if (isLoading || isNetLoading) {
 return <p>파산 신청 정보를 불러오는 중...</p>;
 }

 return (
 <div className="bankruptcy-section">
 {/* ⚠️ 2026-08-20: 여기는 원래 `userDoc.money` 를 읽었다. 그런 필드를 가진 사용자가
     전체 45명 중 슈퍼관리자 1명뿐이라, `undefined < 0` 이 false 가 되어 **신청 버튼이
     누구에게도 뜨지 않았다** — 화면엔 늘 "현재 자산: 0원"만 찍혔다. 실제 필드는 `cash` 다.
     (`money` 를 우선하던 유일한 다른 코드는 존재하지 않는 `Class` 컬렉션을 읽는 죽은 경로였다.)
     판결이 자산을 자동으로 건드리는 경로는 없다 — 신청은 법정 문서 1건을 만들 뿐이고
     실제 초기화는 선생님이 관리자 도구로 한다. 그래서 이 복구로 돈이 저절로 움직이지는 않는다.

     ⚠️ 판정 기준은 **순자산**이다(2026-08-20 변경, 그 전엔 현금이었다).
     FinancialRestrictionBanner 가 이미 순자산으로 이용을 제한하고 있어서, 현금 기준이면
     "제한은 걸렸는데 파산 신청은 못 하는" 막다른 골목이 생겼다. 실측(라이브 45명): 이 변경으로
     자격을 잃는 학생 7명(현금 -15,000~-111,000 인데 주식·부동산 770만~2,150만 보유 — 팔면 갚는다),
     새로 얻는 학생 0명. 즉 지금은 자격을 좁히는 방향이고, 대출로 순자산만 음수인 학생이
     생기면 그때 자동으로 열린다. */}
 <h3>파산 신청</h3>
 <p>
 현재 순자산:{" "}
 {netAssets === null ? "계산할 수 없음" : `${netAssets.toLocaleString()}${getCurrencyUnit()}`}
 </p>
 {netAssets !== null && netAssets < 0 ? (
 <div>
 <p>
 순자산(현금·예금·주식·부동산에서 빚을 뺀 값)이 마이너스 상태입니다.
 파산을 신청하여 모든 빚을 청산하고 새롭게 시작할 수 있습니다. (재판 필요)
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
 <p>순자산이 마이너스 상태일 때 파산을 신청할 수 있습니다.</p>
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

 // 🔥 [비용 최적화] 10분 폴링(폴마다 limit(100) 전체 재과금) → 체류 중 실시간 리스너 (변경분만 과금)
 const [complaints, setComplaints] = useState([]);
 const [complaintsLoading, setComplaintsLoading] = useState(true);
 const refetchComplaints = noopRefetch;
 useEffect(() => {
 if (!classCode) {
 setComplaints([]);
 setComplaintsLoading(false);
 return;
 }
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
 const unsubscribe = onSnapshot(
 q,
 (querySnapshot) => {
 setComplaints(
 querySnapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 submissionDate: doc.data().submissionDate?.toDate
 ? doc.data().submissionDate.toDate().toISOString()
 : null,
 indictmentDate: doc.data().indictmentDate?.toDate
 ? doc.data().indictmentDate.toDate().toISOString()
 : null,
 })),
 );
 setComplaintsLoading(false);
 },
 (error) => {
 logger.error("[Court] complaints listener error:", error);
 setComplaintsLoading(false);
 },
 );
 return unsubscribe;
 }, [classCode]);

 // 🔥 [비용 최적화] 10분 폴링(폴마다 limit(50) 전체 재과금) → 체류 중 실시간 리스너 (변경분만 과금)
 const [trialRooms, setTrialRooms] = useState([]);
 const [trialRoomsLoading, setTrialRoomsLoading] = useState(true);
 const refetchTrialRooms = noopRefetch;
 useEffect(() => {
 if (!classCode) {
 setTrialRooms([]);
 setTrialRoomsLoading(false);
 return;
 }
 const trialRoomsRef = collection(db, "classes", classCode, "trialRooms");
 const q = query(trialRoomsRef, limit(50));
 const unsubscribe = onSnapshot(
 q,
 (querySnapshot) => {
 setTrialRooms(
 querySnapshot.docs.map((doc) => ({
 id: doc.id,
 ...doc.data(),
 })),
 );
 setTrialRoomsLoading(false);
 },
 (error) => {
 logger.error("[Court] trialRooms listener error:", error);
 setTrialRoomsLoading(false);
 },
 );
 return unsubscribe;
 }, [classCode]);

 // 진입 시 진행되지 않는(완료/유휴) 재판방 자동 정리 → DB 사용량 절감
 useEffect(() => {
 if (!classCode) return;
 cleanupStaleTrialRooms(classCode)
 .then((n) => {
 if (n > 0) {
 logger.log(`정리된 재판방: ${n}개`);
 refetchTrialRooms();
 }
 })
 .catch(() => {});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [classCode]);

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
 // 🔥 [읽기 절감 1단계] 정부 계열 5개 페이지가 같은 jobs 쿼리 공유 → 세션 캐시
 cacheKey: classCode ? `jobs:${classCode}` : null,
 },
 );

 // Check if user is prosecutor
 const isProsecutor = useMemo(
 () => hasJobTitle(currentUserDoc, jobs, "검찰총장"),
 [currentUserDoc, jobs],
 );

 // Check if user is judge
 const isJudge = useMemo(
 () => hasJobTitle(currentUserDoc, jobs, "판사"),
 [currentUserDoc, jobs],
 );

 const hasProsecutorPrivileges = isAdmin || isProsecutor;
 const hasJudgePrivileges = isAdmin || isJudge;
 const hasAdminPrivileges = hasJudgePrivileges;

 const handleAddComplaint = async (newComplaintData) => {
 if (!currentUserId || !classCode) {
 toast.error("로그인 정보 또는 학급 정보가 유효하지 않습니다.");
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
 toast.success("고소장이 성공적으로 제출되었습니다.");
 } catch (error) {
 logger.error("Error adding complaint to Firestore:", error);
 toast.error("고소장 제출 중 오류가 발생했습니다.");
 }
 };

 const handleIndictComplaint = async (id) => {
 if (!(hasProsecutorPrivileges || hasAdminPrivileges) || !classCode)
 return toast.error("기소 권한이 없습니다.");
 const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
 try {
 await updateDoc(complaintRef, {
 status: "indicted",
 indictmentDate: serverTimestamp(),
 });
 refetchComplaints();
 toast.success(`사건번호 ${id.slice(-6)}이(가) 기소되었습니다.`);
 } catch (error) {
 logger.error("Error indicting complaint:", error);
 toast.error("기소 처리 중 오류가 발생했습니다.");
 }
 };

 const handleDeleteComplaint = async (id) => {
 if (
 !(hasProsecutorPrivileges || hasJudgePrivileges || hasAdminPrivileges) ||
 !classCode
 )
 return toast.error("삭제 권한이 없습니다.");

 if (
 await confirmDialog(`사건번호 ${id.slice(-6)} 기록을 정말 삭제하시겠습니까?`, { danger: true })
 ) {
 const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
 try {
 await deleteDoc(complaintRef);
 refetchComplaints();
 toast.success("기록이 삭제되었습니다.");
 } catch (error) {
 logger.error("Error deleting complaint:", error);
 toast.error("기록 삭제 중 오류가 발생했습니다.");
 }
 }
 };

 const handleDismissComplaint = async (id) => {
 if (
 !(hasProsecutorPrivileges || hasJudgePrivileges || hasAdminPrivileges) ||
 !classCode
 )
 return toast.error("처리 권한이 없습니다.");
 const complaintRef = doc(db, "classes", classCode, "courtComplaints", id);
 try {
 await updateDoc(complaintRef, { status: "dismissed" });
 refetchComplaints();
 toast.success(`사건번호 ${id.slice(-6)}이(가) 불기소/기각 처리되었습니다.`);
 } catch (error) {
 logger.error("Error dismissing complaint:", error);
 toast.error("처리 중 오류가 발생했습니다.");
 }
 };

 const handleEditClick = (complaint) => {
 if (!currentUserId) {
 toast.error("로그인이 필요합니다.");
 return;
 }
 const canModify =
 hasProsecutorPrivileges || hasJudgePrivileges || hasAdminPrivileges;
 const isOwner = complaint.complainantId === currentUserId;

 if (!canModify && !isOwner) {
 return toast.error(
 "본인이 작성했거나 권한이 있는 고소장만 수정할 수 있습니다.",
 );
 }

 if (!canModify && isOwner && complaint.status !== "pending") {
 return toast.error("진행 중이거나 완료된 사건은 수정할 수 없습니다.");
 }

 if (["resolved", "dismissed"].includes(complaint.status) && !isAdmin) {
 return toast.error("완료된 사건은 수정할 수 없습니다.");
 }

 if (complaint.caseType === "bankruptcy") {
 return toast.error("파산 신청서는 수정할 수 없습니다.");
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
 toast.success(`사건번호 ${editingComplaint.id.slice(-6)} 정보가 수정되었습니다.`);
 } catch (error) {
 logger.error("Error updating complaint:", error);
 toast.error("고소장 수정 중 오류가 발생했습니다.");
 }
 };

 const handleCloseEditModal = () => {
 setIsEditModalOpen(false);
 setEditingComplaint(null);
 };

 const handleVote = async (complaintId, voteType) => {
 if (!currentUserId || !classCode) return toast.error("로그인이 필요합니다.");
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
 toast.error("투표 처리 중 오류가 발생했습니다: " + error.message);
 }
 };

 const handleStartTrial = async (complaintId) => {
 if (!hasJudgePrivileges || !classCode)
 return toast.error("재판 시작 권한이 없습니다.");

 const complaint = (complaints || []).find((c) => c.id === complaintId);
 if (!complaint) return toast.error("사건을 찾을 수 없습니다.");

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
 lastActivity: serverTimestamp(),
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

 toast.success(
 `사건번호 ${complaintId.slice(-6)}의 재판방이 생성되었습니다. 재판을 시작합니다.`,
 );

 setActiveTrialRoom(newRoomRef.id);
 setActiveTab("trial-room");
 } catch (error) {
 logger.error("Error starting trial:", error);
 toast.error("재판 시작 처리 중 오류가 발생했습니다.");
 }
 };

 const handleOpenJudgmentModal = (complaint) => {
 if (!hasJudgePrivileges) return toast.error("판결문 작성 권한이 없습니다.");
 if (complaint.status !== "on_trial")
 return toast.error("재판 진행 중인 사건만 판결할 수 있습니다.");
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
 toast.success(`사건번호 ${complaintId.slice(-6)}의 판결문이 저장되었습니다.`);
 setActiveTab("results");
 } catch (error) {
 logger.error("Error saving judgment:", error);
 toast.error("판결문 저장 중 오류가 발생했습니다.");
 }
 };

 const handleCloseJudgmentModal = () => {
 setIsJudgmentModalOpen(false);
 setJudgingComplaint(null);
 };

 const handleOpenSettlementModal = (complaint) => {
 // 🔒 2026-08-20: 이 모달은 **선생님 전용**이 됐다. 서버(processCourtSettlement)가
 //   비교사를 거부하므로, 판사에게 버튼을 띄워두면 눌렀다가 실패 토스트만 보게 된다.
 //   판사의 배상 집행 경로는 재판방(processTrialSettlement)이다 — 그쪽은 당사자를
 //   재판방 문서에서만 파생해 위조가 안 된다.
 // ⚠️ `hasAdminPrivileges` 를 쓰면 안 된다 — 이름과 달리 722행에서
 //   `hasJudgePrivileges`(= isAdmin || isJudge)의 **별칭**이라 판사가 그대로 통과한다.
 //   서버 게이트와 같은 기준인 `isAdmin` 을 직접 본다.
 if (!isAdmin)
 return toast.error(
 "합의금 지급은 선생님이 처리합니다. 판사는 재판방에서 배상을 집행해 주세요.",
 );
 if (complaint.status !== "resolved")
 return toast.error(
 "재판이 완료된 사건에 대해서만 합의금을 처리할 수 있습니다.",
 );
 if (complaint.settlementPaid)
 return toast.error("이미 합의금 지급이 완료된 사건입니다.");

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
 toast.error("학급 정보가 없어 합의금 지급을 처리할 수 없습니다.");
 return false;
 }
 const numericAmount = parseInt(amount, 10);
 if (isNaN(numericAmount) || numericAmount <= 0) {
 toast.error("유효한 금액을 입력해주세요.");
 return false;
 }
 if (!senderId || !recipientId) {
 toast.error("보내는 사람과 받는 사람을 모두 선택해주세요.");
 return false;
 }
 if (senderId === recipientId) {
 toast.error("보내는 사람과 받는 사람은 같을 수 없습니다.");
 return false;
 }

 const sender = users.find((u) => u.id === senderId);
 const recipient = users.find((u) => u.id === recipientId);

 if (!sender || !recipient) {
 toast.error("유효하지 않은 사용자 정보입니다.");
 return false;
 }
 const senderName = sender?.name || sender?.displayName || senderId;
 const recipientName =
 recipient?.name || recipient?.displayName || recipientId;

 try {
 // 🔒 합의금(sender·recipient cash 직접 write)을 processSettlement CF로 처리(2026-07-17 배치6-b).
 //   구 클라 runTransaction은 같은반 임의 유저 cash 직접 write라 batch7 rules 잠금 대상 → CF 이관.
 //   권한(판사/관리자)·complaint 상태게이트(resolved & !settlementPaid)·반경계·잔액·거래내역 전부 서버.
 //   서버 settlementPaid 게이트 + 멱등키가 이중지급을 차단(complaint OCC).
 const settlementFn = httpsCallable(functions, "processCourtSettlement");
 await settlementFn({
 complaintId,
 senderId,
 recipientId,
 amount: numericAmount,
 });

 refetchComplaints();

 toast.success(
 `${senderName}님이 ${recipientName}님에게 ${numericAmount.toLocaleString()}${getCurrencyUnit()} 합의금 지급을 완료했습니다.`,
 );
 handleCloseSettlementModal();
 return true;
 } catch (error) {
 logger.error("합의금 지급 트랜잭션 오류:", error);
 toast.error(`합의금 지급에 실패했습니다: ${error.message}`);
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
 canSettle={isAdmin}
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
