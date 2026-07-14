// src/pages/dashboard/Dashboard.js - Firestore 최적화 버전 + 일일 할일 리셋 기능 + Tailwind UI
import React, {
 useState,
 useEffect,
 useCallback,
 useMemo,
 useRef,
} from "react";
import "./Dashboard.css";
import { useAuth } from "../../contexts/AuthContext";
import { db, functions, copyDefaultDataToNewClass } from "../../firebase";
import {
 doc,
 getDoc,
 setDoc,
 getDocs,
 updateDoc,
 writeBatch,
 serverTimestamp,
 arrayUnion,
 query,
 where,
 collection as firestoreCollection,
 limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
 APPOINTED_FALLBACK_TITLES,
 isAppointedOnlyJob,
 toJobIdArray,
 getEffectiveJobIds,
} from "../../utils/jobPermissions";
import JobList from "../../components/JobList";
import CommonTaskList from "../../components/CommonTaskList";
import AdminSettingsModal from "../../components/modals/AdminSettingsModal";
import {
 PageContainer,
 LoadingState,
 EmptyState,
 ActionButton,
} from "../../components/PageWrapper";
import globalCacheService from "../../services/globalCacheService";
import {
 Briefcase,
 ListTodo,
 Settings,
 RefreshCw,
 RotateCcw,
 Plus,
 ChevronLeft,
 Trash2,
 Pencil,
 Check,
 X,
} from "lucide-react";

import { logger } from "../../utils/logger";
// Cloud Functions 호출 함수 설정 (handleManualTaskReset 내부에서 사용)

// 🔥 [최적화 v3.0] 극단적 최적화 - Firestore 읽기 95% 감소 목표
// TTL 상수 - 캐시 일관성을 위해 globalCacheService와 동일하게 설정
const CACHE_TTL = {
 JOBS: 6 * 60 * 60 * 1000, // 6시간 (직업 데이터)
 TASKS: 6 * 60 * 60 * 1000, // 6시간 (할일 데이터)
 SETTINGS: 12 * 60 * 60 * 1000, // 12시간 (설정)
 GOALS: 6 * 60 * 60 * 1000, // 6시간 (목표)
 CLASS_CODES: 24 * 60 * 60 * 1000, // 24시간 (학급 코드)
};

// 🔥 globalCacheService 래퍼 (기존 dataCache 인터페이스 호환)
const dataCache = {
 get: (key) => globalCacheService.get(key),
 set: (key, data, ttl) =>
 globalCacheService.set(key, data, ttl || CACHE_TTL.TASKS),
 invalidate: (key) => globalCacheService.invalidate(key),
 clear: () => globalCacheService.clearAll(),
};

// 배치 작업 관리 클래스
class BatchManager {
 constructor() {
 this.pendingWrites = [];
 this.batchTimeout = null;
 this.BATCH_DELAY = 2000; // 2초 지연
 this.MAX_BATCH_SIZE = 500; // Firestore 제한
 }

 addWrite(operation) {
 this.pendingWrites.push(operation);

 if (this.pendingWrites.length >= this.MAX_BATCH_SIZE) {
 this.executeBatch();
 } else {
 this.scheduleBatch();
 }
 }

 scheduleBatch() {
 if (this.batchTimeout) {
 clearTimeout(this.batchTimeout);
 }

 this.batchTimeout = setTimeout(() => {
 this.executeBatch();
 }, this.BATCH_DELAY);
 }

 async executeBatch() {
 if (this.pendingWrites.length === 0) return;

 if (this.batchTimeout) {
 clearTimeout(this.batchTimeout);
 this.batchTimeout = null;
 }

 const batch = writeBatch(db);
 const operations = [...this.pendingWrites];
 this.pendingWrites = [];

 try {
 operations.forEach(({ type, ref, data }) => {
 switch (type) {
 case "set":
 batch.set(ref, data);
 break;
 case "setMerge":
 batch.set(ref, data, { merge: true });
 break;
 case "update":
 batch.update(ref, data);
 break;
 case "delete":
 batch.delete(ref);
 break;
 }
 });

 await batch.commit();
 logger.log(`배치 실행 완료: ${operations.length}개 작업`);
 } catch (error) {
 logger.error("배치 실행 실패:", error);
 // 실패한 작업들을 다시 큐에 추가할 수 있음
 }
 }
}

const batchManager = new BatchManager();

// 실시간 리스너 관리 클래스
class RealtimeManager {
 constructor() {
 this.listeners = new Map();
 }

 addListener(key, unsubscribe) {
 if (this.listeners.has(key)) {
 this.listeners.get(key)();
 }
 this.listeners.set(key, unsubscribe);
 }

 removeListener(key) {
 if (this.listeners.has(key)) {
 this.listeners.get(key)();
 this.listeners.delete(key);
 }
 }

 removeAllListeners() {
 this.listeners.forEach((unsubscribe) => unsubscribe());
 this.listeners.clear();
 }
}

// Utility functions - 캐시 및 최적화 적용
const saveSharedData = async (data, classCode) => {
 try {
 // 배치 매니저 사용
 const newDocRef = doc(firestoreCollection(db, "sharedData"));
 batchManager.addWrite({
 type: "set",
 ref: newDocRef,
 data: {
 ...data,
 classCode,
 createdAt: serverTimestamp(),
 },
 });

 // 캐시 무효화
 dataCache.invalidate(`classData_${classCode}`);
 return true;
 } catch (error) {
 logger.error("Error saving shared data:", error);
 return false;
 }
};

// 🔒 지정 전용 역할: 학생이 자가신청할 수 없고 선생님만 배정하는 직업 제목.
// 직업 문서의 appointedOnly 플래그가 우선이며, 이 목록은 플래그 없는 기존 문서용 fallback.
// 판정 로직은 src/utils/jobPermissions.js(서버 functions/jobUtils.js와 동일 규약)로 통일.
const RESTRICTED_JOB_TITLES = APPOINTED_FALLBACK_TITLES;

function SelectMultipleJobsView({
 availableJobs,
 currentSelectedJobIds = [],
 onConfirmSelection,
 onCancel,
 isAdmin,
 onAddJob,
 onDeleteJob,
 onEditJob,
 maxJobs = 5,
}) {
 const [tempSelection, setTempSelection] = useState(
 Array.isArray(currentSelectedJobIds) ? [...currentSelectedJobIds] : [],
 );
 const [newJobTitle, setNewJobTitle] = useState("");
 const [showAddForm, setShowAddForm] = useState(false);
 const [editingJobId, setEditingJobId] = useState(null);
 const [editingJobTitle, setEditingJobTitle] = useState("");
 const [editingJobAppointedOnly, setEditingJobAppointedOnly] = useState(false);

 const activeJobs = useMemo(() => {
 return Array.isArray(availableJobs)
 ? availableJobs.filter((job) => job.active !== false)
 : [];
 }, [availableJobs]);

 // 🔧 존재하는(활성+비활성) 직업 id 집합. 삭제된 유령 id를 개수 상한 카운트에서 제외하기 위함.
 // 유령이 selectedJobIds에 남으면 화면엔 안 뜨는데 카운트만 잠식해 "5개 한도인데 4개만 선택" 버그가 났다.
 // 비파괴적: tempSelection에서 유령을 지우지 않고(스테일 캐시로 유효 선택이 파괴되는 것 방지) 카운트에서만 뺀다.
 // 유령은 저장 시(jobs 로드 확인 후) 정리되고, 서버 급여도 유령을 무시한다.
 const existingJobIdSet = useMemo(
 () => new Set((Array.isArray(availableJobs) ? availableJobs : []).map((j) => j.id)),
 [availableJobs],
 );
 // 개수 상한에 세는 "유효 선택 수" = tempSelection 중 실제 존재하는 직업만.
 // (availableJobs 미로드 시엔 전부 유효로 간주해 과도 차단·표시왜곡 방지)
 const countTowardCap = useCallback(
 (ids) =>
 existingJobIdSet.size === 0
 ? ids.length
 : ids.filter((id) => existingJobIdSet.has(id)).length,
 [existingJobIdSet],
 );

 const handleCheckboxChange = useCallback(
 (jobId) => {
 // 순수 업데이터 유지(StrictMode 이중호출·부작용 방지) — UI는 disabled로 막고,
 // 여기 가드는 프로그래매틱 우회 대비 방어(조용히 무시).
 setTempSelection((prev) => {
 // 이미 선택 → 해제(항상 허용)
 if (prev.includes(jobId)) {
 return prev.filter((id) => id !== jobId);
 }
 // 추가 시 학생(비관리자)만 상한·역할 제한 적용. 선생님은 자유.
 if (!isAdmin) {
 const job = activeJobs.find((j) => j.id === jobId);
 if (isAppointedOnlyJob(job)) return prev; // 지정 전용 역할
 if (countTowardCap(prev) >= maxJobs) return prev; // 개수 상한(유령 제외)
 }
 return [...prev, jobId];
 });
 },
 [isAdmin, activeJobs, maxJobs, countTowardCap],
 );

 const handleAddNewJob = useCallback(() => {
 const title = newJobTitle.trim();
 if (!title) {
 alert("직업 이름을 입력해주세요.");
 return;
 }
 if (onAddJob) {
 onAddJob(title);
 }
 setNewJobTitle("");
 setShowAddForm(false);
 }, [newJobTitle, onAddJob]);

 const handleStartEdit = useCallback((job) => {
 setEditingJobId(job.id);
 setEditingJobTitle(job.title);
 setEditingJobAppointedOnly(isAppointedOnlyJob(job));
 }, []);

 const handleSaveEdit = useCallback(() => {
 const title = editingJobTitle.trim();
 if (!title) {
 alert("직업 이름을 입력해주세요.");
 return;
 }
 if (onEditJob) {
 onEditJob(editingJobId, title, editingJobAppointedOnly);
 }
 setEditingJobId(null);
 setEditingJobTitle("");
 setEditingJobAppointedOnly(false);
 }, [editingJobId, editingJobTitle, editingJobAppointedOnly, onEditJob]);

 const handleCancelEdit = useCallback(() => {
 setEditingJobId(null);
 setEditingJobTitle("");
 setEditingJobAppointedOnly(false);
 }, []);

 // 화면 표시·상한 판정용 유효 선택 수(유령 제외)
 const selectedValidCount = countTowardCap(tempSelection);

 return (
 <div className="glass-card rounded-2xl p-6 max-w-3xl mx-auto my-8">
 <h4 className="text-xl font-semibold text-slate-800 text-center mb-2">
 직업 선택 (다중 선택 가능)
 </h4>
 <p className="text-sm text-slate-400 text-center mb-1">
 '나의 할일'에 표시할 직업을 선택하세요.
 </p>
 {!isAdmin && (
 <p className="text-xs text-center mb-4 text-indigo-500 font-medium">
 직업 {selectedValidCount} / {maxJobs}개 선택 (최대 {maxJobs}개)
 </p>
 )}
 {isAdmin && <div className="mb-4" />}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {activeJobs.map((job) => (
 <div
 key={job.id}
 className={`p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
 tempSelection.includes(job.id)
 ? "border-indigo-400 bg-cyan-900/30"
 : "border-slate-200 bg-white hover:border-indigo-300"
 }`}
 >
 {editingJobId === job.id ? (
 <div className="flex flex-col gap-2 flex-1">
 <div className="flex items-center gap-2">
 <input
 type="text"
 value={editingJobTitle}
 onChange={(e) => setEditingJobTitle(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") handleSaveEdit();
 if (e.key === "Escape") handleCancelEdit();
 }}
 className="flex-1 px-2 py-1 bg-gray-100 border border-indigo-400 rounded text-slate-800 text-sm focus:outline-none"
 autoFocus
 />
 <button
 onClick={handleSaveEdit}
 className="p-1 text-green-400 hover:text-green-300 transition-colors shrink-0"
 title="저장"
 >
 <Check className="w-4 h-4" />
 </button>
 <button
 onClick={handleCancelEdit}
 className="p-1 text-slate-400 hover:text-slate-300 transition-colors shrink-0"
 title="취소"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
 <input
 type="checkbox"
 checked={editingJobAppointedOnly}
 onChange={(e) => setEditingJobAppointedOnly(e.target.checked)}
 className="w-3.5 h-3.5 accent-amber-500"
 />
 선생님 지정 전용 (학생 자가신청 불가)
 </label>
 </div>
 ) : (
 <>
 {(() => {
 const checked = tempSelection.includes(job.id);
 const restricted = !isAdmin && isAppointedOnlyJob(job);
 const capReached =
 !isAdmin && !checked && selectedValidCount >= maxJobs;
 const disabled = restricted || capReached;
 return (
 <label
 className={`flex items-center gap-3 flex-1 ${
 disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
 }`}
 >
 <input
 type="checkbox"
 checked={checked}
 disabled={disabled}
 onChange={() => handleCheckboxChange(job.id)}
 className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:cursor-not-allowed cursor-pointer accent-cyan-400"
 />
 <span
 className={`font-medium ${
 checked ? "text-cyan-300" : "text-slate-800"
 }`}
 >
 {job.title}
 {restricted && (
 <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">
 선생님 지정
 </span>
 )}
 </span>
 </label>
 );
 })()}
 {isAdmin && (
 <div className="flex items-center gap-1 shrink-0">
 <button
 onClick={() => handleStartEdit(job)}
 className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
 title="직업 수정"
 >
 <Pencil className="w-4 h-4" />
 </button>
 {onDeleteJob && (
 <button
 onClick={() => onDeleteJob(job.id)}
 className="p-1 text-slate-500 hover:text-red-400 transition-colors"
 title="직업 삭제"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 )}
 </div>
 )}
 </>
 )}
 </div>
 ))}
 {activeJobs.length === 0 && !isAdmin && (
 <EmptyState
 icon={Briefcase}
 title="선택 가능한 직업이 없습니다"
 description="관리자가 직업을 등록하면 여기에 표시됩니다."
 />
 )}
 </div>

 {/* 관리자용 직업 추가 */}
 {isAdmin && (
 <div className="mt-4 border-t border-slate-200 pt-4">
 {showAddForm ? (
 <div className="flex items-center gap-2">
 <input
 type="text"
 value={newJobTitle}
 onChange={(e) => setNewJobTitle(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && handleAddNewJob()}
 placeholder="새 직업 이름 입력"
 className="flex-1 px-3 py-2 bg-gray-100 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400"
 autoFocus
 />
 <ActionButton variant="primary" size="sm" onClick={handleAddNewJob}>
 추가
 </ActionButton>
 <ActionButton variant="secondary" size="sm" onClick={() => { setShowAddForm(false); setNewJobTitle(""); }}>
 취소
 </ActionButton>
 </div>
 ) : (
 <button
 onClick={() => setShowAddForm(true)}
 className="w-full p-3 rounded-xl border-2 border-dashed border-cyan-900/40 text-cyan-400 hover:border-indigo-400 hover:bg-cyan-900/20 transition-all flex items-center justify-center gap-2"
 >
 <Plus className="w-4 h-4" />
 직업 추가
 </button>
 )}
 </div>
 )}

 <div className="flex justify-end gap-3 mt-6">
 <ActionButton variant="secondary" onClick={onCancel}>
 취소
 </ActionButton>
 <ActionButton
 variant="primary"
 onClick={() => onConfirmSelection(tempSelection)}
 >
 선택 완료
 </ActionButton>
 </div>
 </div>
 );
}

function Dashboard({ adminTabMode }) {
 const {
 user,
 userDoc,
 setUserDoc,
 loading: authLoading,
 updateUser,
 refreshUserDocument,
 isAdmin,
 isSuperAdmin,
 optimisticUpdate,
 } = useAuth();

 // Refs for cleanup
 const realtimeManager = useRef(new RealtimeManager());
 const lastFetchTime = useRef(0);
 const fetchPromise = useRef(null);

 // State management
 const [appLoading, setAppLoading] = useState(true);
 const [viewMode, setViewMode] = useState("list");
 // 🔥 새로고침해도 관리자 모달이 열린 상태 유지 (sessionStorage)
 const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(() => {
   try { return sessionStorage.getItem("alchan_adminModal_open") === "1"; }
   catch { return false; }
 });
 const [adminSelectedMenu, setAdminSelectedMenu] = useState(() => {
   try { return sessionStorage.getItem("alchan_adminModal_menu") || "generalSettings"; }
   catch { return "generalSettings"; }
 });

 // 모달 상태 변경 시 sessionStorage 동기화 — 새로고침해도 같은 위치 복원
 useEffect(() => {
   try {
     if (showAdminSettingsModal) {
       sessionStorage.setItem("alchan_adminModal_open", "1");
       sessionStorage.setItem("alchan_adminModal_menu", adminSelectedMenu);
     } else {
       sessionStorage.removeItem("alchan_adminModal_open");
       sessionStorage.removeItem("alchan_adminModal_menu");
     }
   } catch { /* ignore */ }
 }, [showAdminSettingsModal, adminSelectedMenu]);

 const [jobs, setJobs] = useState([]);
 const [commonTasks, setCommonTasks] = useState([]);
 // 직업 개수 상한(관리자 설정, 기본 5) — 학생 직업 선택 UI 제한 기준
 const [maxJobsPerStudent, setMaxJobsPerStudent] = useState(5);

 const [editingJob, setEditingJob] = useState(null);
 const [adminNewJobTitle, setAdminNewJobTitle] = useState("");
 // 관리자 설정 모달의 직업 '이름수정'에서 편집 중인 직업의 지정 전용(선생님만 배정) 토글 상태
 const [adminEditingJobAppointedOnly, setAdminEditingJobAppointedOnly] =
 useState(false);
 const [editingTask, setEditingTask] = useState(null);
 const [currentJobIdForTask, setCurrentJobIdForTask] = useState(null);
 const [isJobTaskForForm, setIsJobTaskForForm] = useState(false);
 const [showAddTaskForm, setShowAddTaskForm] = useState(false);
 const [adminNewTaskName, setAdminNewTaskName] = useState("");
 const [adminNewTaskReward, setAdminNewTaskReward] = useState("0");
 const [adminNewTaskMaxClicks, setAdminNewTaskMaxClicks] = useState("5");
 const [adminNewTaskRequiresApproval, setAdminNewTaskRequiresApproval] =
 useState(true);

 // 🔥 [최적화] httpsCallable 메모이제이션
 const completeTaskFunction = useMemo(
 () => httpsCallable(functions, "completeTask"),
 [],
 );
 const manualResetClassTasksFn = useMemo(
 () => httpsCallable(functions, "manualResetClassTasks"),
 [],
 );
 // 학생의 직업 선택 저장은 서버가 유일한 경로 (rules에서 selectedJobIds 직접 write 차단).
 const saveSelectedJobsFn = useMemo(
 () => httpsCallable(functions, "saveSelectedJobs"),
 [],
 );

 const [isHandlingTask, setIsHandlingTask] = useState(false);

 const [classCouponGoal, setClassCouponGoal] = useState(1000);
 const [couponValue, setCouponValue] = useState(1000);
 const [adminCouponValueInput, setAdminCouponValueInput] = useState(
 String(1000),
 );
 const [adminGoalAmountInput, setAdminGoalAmountInput] = useState(
 String(1000),
 );
 const [classCodes, setClassCodes] = useState([]);

 // adminTabMode가 있으면 모달 열기
 useEffect(() => {
 if (adminTabMode && isAdmin?.()) {
 setAdminSelectedMenu(adminTabMode);
 setShowAdminSettingsModal(true);
 }
 }, [adminTabMode, isAdmin]);

 // 직업 개수 상한 로드 — 급여 설정(settings/salarySettings_{classCode})의 maxJobsPerStudent.
 // 학생 직업 선택 UI 제한 기준. 문서/필드 없으면 기본 5 유지.
 useEffect(() => {
 const classCode = userDoc?.classCode;
 if (!db || !classCode) return;
 let cancelled = false;
 (async () => {
 try {
 const snap = await getDoc(doc(db, "settings", `salarySettings_${classCode}`));
 if (cancelled) return;
 const raw = snap.exists() ? snap.data().maxJobsPerStudent : undefined;
 if (Number.isInteger(raw) && raw >= 1) setMaxJobsPerStudent(raw);
 } catch (e) {
 logger.warn("[Dashboard] 직업 개수 상한 로드 실패(기본 5 사용):", e);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [userDoc?.classCode]);

 // 🔥 일일 할일 카운터 클라이언트 lazy 리셋
 // 배경: 서버 스케줄러(midnightReset)가 외부 크론 기반이라 누락될 수 있음.
 // 그 경우 승인되지 않은 할일도 다음날 다시 누를 수 없게 되므로,
 // 학생이 대시보드를 열 때 KST 기준 날짜가 바뀌었으면 카운터만 자동 리셋한다.
 // pendingApprovals 문서는 건드리지 않으므로 추후 승인 시 보상은 정상 지급된다.
 const dailyResetCheckedRef = useRef(null);
 useEffect(() => {
 if (!userDoc?.id) return;

 const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
 const todayStr = nowKst.toISOString().split("T")[0];

 if (userDoc.tasksResetDate === todayStr) return;

 const guardKey = `${userDoc.id}_${todayStr}`;
 if (dailyResetCheckedRef.current === guardKey) return;
 dailyResetCheckedRef.current = guardKey;

 const userRef = doc(db, "users", userDoc.id);
 updateDoc(userRef, {
 completedTasks: {},
 completedJobTasks: {},
 tasksResetDate: todayStr,
 })
 .then(() => {
 setUserDoc((prev) => ({
 ...prev,
 completedTasks: {},
 completedJobTasks: {},
 tasksResetDate: todayStr,
 }));
 logger.log("[Dashboard] 일일 할일 카운터 자동 리셋 완료:", todayStr);
 })
 .catch((err) => {
 logger.error("[Dashboard] 일일 할일 자동 리셋 실패:", err);
 dailyResetCheckedRef.current = null;
 });
 }, [userDoc?.id, userDoc?.tasksResetDate, setUserDoc]);

 // Memoized values
 const currentGoalId = useMemo(() => {
 return userDoc?.classCode && isAdmin?.()
 ? `${userDoc.classCode}_goal`
 : null;
 }, [userDoc?.classCode, isAdmin]);

 // 화면 표시(내 직업·할일)용 = 교사가 지정한 직업 + 내가 고른 직업.
 const effectiveJobIds = useMemo(() => getEffectiveJobIds(userDoc), [userDoc]);

 // 직업 선택 모달의 체크 초기값 = '내가 고른' 직업만.
 // 교사 지정 직업(appointedJobIds)은 학생이 저장 요청에 담을 수 없다(서버가 거부).
 const currentSelectedJobIdsFromUserDoc = useMemo(
 () => toJobIdArray(userDoc?.selectedJobIds),
 [userDoc],
 );

 // 학생이 고를 수 있는 슬롯 = 상한 − 교사가 지정한 직업 수 (서버 saveSelectedJobs와 동일 규약).
 // 교사 지정 직업도 상한을 함께 쓰기 때문에(기존 경제 유지), 지정 직업이 있으면 선택 몫이 줄어든다.
 const selectableJobSlots = useMemo(() => {
 const appointedCount = toJobIdArray(userDoc?.appointedJobIds).length;
 return Math.max(0, maxJobsPerStudent - appointedCount);
 }, [userDoc, maxJobsPerStudent]);

 const jobsToShow = useMemo(() => {
 const completedJobTasks = userDoc?.completedJobTasks || {};

 return Array.isArray(jobs)
 ? jobs
 .filter(
 (job) => effectiveJobIds.includes(job.id) && job.active !== false,
 )
 .map((job) => ({
 ...job,
 tasks: (job.tasks || []).map((task) => ({
 ...task,
 clicks: completedJobTasks[`${job.id}_${task.id}`] || 0, // 개인별 클릭 횟수
 })),
 }))
 : [];
 }, [jobs, effectiveJobIds, userDoc]);

 const commonTasksWithUserProgress = useMemo(() => {
 if (!commonTasks || !userDoc) {
 return [];
 }
 const userCompletedTasks = userDoc.completedTasks || {};
 return commonTasks.map((task) => ({
 ...task,
 clicks: userCompletedTasks[task.id] || 0,
 }));
 }, [commonTasks, userDoc]);

 // Utility function for generating IDs
 const generateId = useCallback(() => {
 try {
 return doc(firestoreCollection(db, "temp")).id;
 } catch (error) {
 logger.error("Error generating ID:", error);
 return (
 Date.now().toString() + Math.random().toString(36).substring(2, 11)
 );
 }
 }, []);

 // 🔥 [최적화] Polling 방식으로 전환 (30초마다)
 const setupPolling = useCallback(async (classCode) => {
 if (!classCode) return;

 const pollData = async () => {
 try {
 // Jobs 조회 (인덱스 없이 작동하도록 orderBy 제거)
 // ⚠️ limit은 학급 직업 수보다 충분히 커야 함. 초과분이 truncate되면 로컬 jobs에서 누락돼
 //    "존재하는데 유령으로 오판"→저장 시 삭제→조용한 급여 삭감(직업선택 정리 로직 전제 위반).
 //    삭제는 hard delete라 누적 안 되고 실제 운영 직업만 남으므로 300이면 충분한 헤드룸.
 //    읽기량은 실제 문서 수만큼만 발생(limit은 상한일 뿐)이라 정상 학급 비용 불변.
 const jobsQuery = query(
 firestoreCollection(db, "jobs"),
 where("classCode", "==", classCode),
 limit(300),
 );

 const jobsSnap = await getDocs(jobsQuery);
 const loadedJobs = jobsSnap.docs
 .map((d) => ({
 id: d.id,
 ...d.data(),
 tasks: (d.data().tasks || []).map((task) => ({
 ...task,
 reward: task.reward || 0,
 clicks: 0, // 개인별 진행 상황은 useMemo에서 설정
 maxClicks: task.maxClicks || 5,
 })),
 active: d.data().active !== false,
 }))
 // 클라이언트 측에서 정렬 (updatedAt이 있는 경우)
 .sort((a, b) => {
 const timeA = a.updatedAt?.toMillis?.() || 0;
 const timeB = b.updatedAt?.toMillis?.() || 0;
 return timeB - timeA;
 });

 setJobs(loadedJobs);
 dataCache.set(`jobs_${classCode}`, loadedJobs, CACHE_TTL.JOBS);

 // Common Tasks 조회 (인덱스 없이 작동하도록 orderBy 제거)
 const tasksQuery = query(
 firestoreCollection(db, "commonTasks"),
 where("classCode", "==", classCode),
 limit(50),
 );

 const tasksSnap = await getDocs(tasksQuery);
 const loadedCommonTasks = tasksSnap.docs
 .map((d) => ({
 id: d.id,
 ...d.data(),
 reward: d.data().reward || 0,
 clicks: 0, // 개인별 진행률은 commonTasksWithUserProgress에서 설정
 maxClicks: d.data().maxClicks || 5,
 }))
 // 클라이언트 측에서 정렬 (updatedAt이 있는 경우)
 .sort((a, b) => {
 const timeA = a.updatedAt?.toMillis?.() || 0;
 const timeB = b.updatedAt?.toMillis?.() || 0;
 return timeB - timeA;
 });

 setCommonTasks(loadedCommonTasks);
 dataCache.set(
 `commonTasks_${classCode}`,
 loadedCommonTasks,
 CACHE_TTL.TASKS,
 );
 } catch (error) {
 logger.error("Polling 에러:", error);
 }
 };

 // 즉시 한 번 실행
 await pollData();

 // 🔥 [최적화 v3.0] 2시간마다 실행 (15분→2시간 - Firestore 읽기 극소화)
 // 데이터 변경 시 사용자가 수동 새로고침하거나 페이지 재진입 시 갱신됨
 const intervalId = setInterval(pollData, 2 * 60 * 60 * 1000);

 // Cleanup 함수 저장
 realtimeManager.current.addListener("polling", () =>
 clearInterval(intervalId),
 );
 }, []);

 // 캐시된 데이터 로드 함수
 const loadCachedData = useCallback(async (classCode) => {
 const jobsCache = dataCache.get(`jobs_${classCode}`);
 const tasksCache = dataCache.get(`commonTasks_${classCode}`);
 const settingsCache = dataCache.get("mainSettings");

 if (jobsCache) {
 setJobs(jobsCache);
 }
 if (tasksCache) {
 setCommonTasks(tasksCache);
 }
 if (settingsCache) {
 setCouponValue(settingsCache.couponValue || 1000);
 setAdminCouponValueInput(String(settingsCache.couponValue || 1000));
 }

 return {
 hasJobsCache: !!jobsCache,
 hasTasksCache: !!tasksCache,
 hasSettingsCache: !!settingsCache,
 };
 }, []);

 // 최적화된 데이터 로드 함수
 const loadTasksData = useCallback(
 async (forceRefresh = false) => {
 if (!userDoc?.classCode) {
 setAppLoading(false);
 return;
 }

 const now = Date.now();
 const classCode = userDoc.classCode;

 // 중복 요청 방지
 if (fetchPromise.current && !forceRefresh) {
 return fetchPromise.current;
 }

 // 🔥 [최적화 v3.0] 최소 요청 간격 보장 (2시간)
 if (!forceRefresh && now - lastFetchTime.current < 2 * 60 * 60 * 1000) {
 setAppLoading(false);
 return;
 }

 // 초기 로딩 표시
 setAppLoading(true);

 const fetchData = async () => {
 try {
 // 1단계: 캐시된 데이터 먼저 로드하여 즉시 UI 표시
 const cacheStatus = await loadCachedData(classCode);

 // 캐시 데이터가 있으면 즉시 로딩 상태 해제하여 빠른 UI 표시
 if (cacheStatus.hasJobsCache && cacheStatus.hasTasksCache) {
 setAppLoading(false);
 }

 // 2단계: 백그라운드에서 실시간 리스너 설정 (한 번만)
 if (!realtimeManager.current.listeners.has("jobs")) {
 // 리스너 설정을 다음 틱으로 지연하여 초기 렌더링 차단 방지
 setTimeout(() => setupPolling(classCode), 0);
 }

 // 3단계: 캐시되지 않은 정적 데이터만 가져오기
 const promises = [];

 if (!cacheStatus.hasSettingsCache || forceRefresh) {
 promises.push(
 getDoc(doc(db, "settings", "mainSettings")).then((snap) => ({
 type: "settings",
 data: snap.exists() ? snap.data() : null,
 })),
 );
 }

 if (
 currentGoalId &&
 (!dataCache.get(`goal_${currentGoalId}`) || forceRefresh)
 ) {
 promises.push(
 getDoc(doc(db, "goals", currentGoalId)).then((snap) => ({
 type: "goal",
 data: snap.exists() ? snap.data() : null,
 })),
 );
 }

 if (
 isSuperAdmin() &&
 (!dataCache.get("classCodes") || forceRefresh)
 ) {
 promises.push(
 getDoc(doc(db, "settings", "classCodes")).then((snap) => ({
 type: "classCodes",
 data: snap.exists() ? snap.data() : null,
 })),
 );
 }

 // 필요한 데이터만 병렬로 가져오기
 if (promises.length > 0) {
 const results = await Promise.all(promises);

 results.forEach((result) => {
 switch (result.type) {
 case "settings":
 if (result.data) {
 const newCouponValue = result.data.couponValue || 1000;
 setCouponValue(newCouponValue);
 setAdminCouponValueInput(String(newCouponValue));
 dataCache.set(
 "mainSettings",
 result.data,
 CACHE_TTL.SETTINGS,
 );
 }
 break;
 case "goal":
 if (result.data && result.data.classCode === classCode) {
 const targetAmount = result.data.targetAmount || 1000;
 setClassCouponGoal(targetAmount);
 setAdminGoalAmountInput(String(targetAmount));
 dataCache.set(
 `goal_${currentGoalId}`,
 result.data,
 CACHE_TTL.GOALS,
 );
 }
 break;
 case "classCodes":
 if (result.data) {
 setClassCodes(result.data.validCodes || []);
 dataCache.set(
 "classCodes",
 result.data,
 CACHE_TTL.CLASS_CODES,
 );
 }
 break;
 }
 });
 }

 lastFetchTime.current = now;
 } catch (error) {
 logger.warn("[Dashboard] data fetch failed:", error);
 } finally {
 setAppLoading(false);
 fetchPromise.current = null;
 }
 };

 fetchPromise.current = fetchData();
 return fetchPromise.current;
 },
 [
 userDoc?.classCode,
 currentGoalId,
 isSuperAdmin,
 setupPolling,
 loadCachedData,
 ],
 );

 // 🔥 [최적화] 클라이언트 측 할일 상태 새로고침 (중복 실행 방지)
 const refreshInProgressRef = useRef(false);

 const refreshTasksAfterReset = useCallback(async () => {
 // 🔥 이미 새로고침 중이면 중복 실행 방지
 if (refreshInProgressRef.current) {
 logger.log("[Dashboard] 이미 새로고침 진행 중 - 중복 실행 방지");
 return;
 }

 refreshInProgressRef.current = true;
 logger.log("[Dashboard] 서버 리셋 감지 - 클라이언트 상태 새로고침");

 try {
 // 사용자 문서 새로고침 (한 번만)
 if (refreshUserDocument) {
 await refreshUserDocument();
 }

 // 할일 데이터 새로고침
 if (loadTasksData) {
 await loadTasksData(true); // force refresh
 }

 // localStorage에 마지막 체크 날짜 저장
 const today = new Date().toDateString();
 localStorage.setItem("lastTaskResetDate", today);

 logger.log("[Dashboard] 클라이언트 상태 새로고침 완료");
 } catch (error) {
 logger.error("[Dashboard] 상태 새로고침 오류:", error);
 } finally {
 refreshInProgressRef.current = false;
 }
 }, [refreshUserDocument, loadTasksData]);

 // Effect for data loading
 useEffect(() => {
 if (authLoading) {
 setAppLoading(true);
 return;
 }

 if (!user) {
 setAppLoading(false);
 setJobs([]);
 setCommonTasks([]);
 // 리스너 정리
 realtimeManager.current.removeAllListeners();
 return;
 }

 if (userDoc?.id && userDoc?.classCode) {
 loadTasksData();
 } else {
 setAppLoading(false);
 }

 // 컴포넌트 언마운트 시 리스너 정리
 const manager = realtimeManager.current;
 return () => {
 manager.removeAllListeners();
 };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [authLoading, user, userDoc?.id, userDoc?.classCode, loadTasksData]);

 // 🔥 [최적화] 날짜 변경 감지 및 UI 새로고침 (중복 실행 방지)
 const dateCheckExecutedRef = useRef(false);
 const lastCheckedDateRef = useRef(null);

 useEffect(() => {
 if (!userDoc?.classCode || !refreshTasksAfterReset) {
 return;
 }

 // 페이지 로드 시 날짜 변경 확인 (한 번만 실행)
 const checkDateAndRefresh = () => {
 const today = new Date().toDateString();
 const lastResetDate = localStorage.getItem("lastTaskResetDate");

 // 🔥 중복 실행 방지: 같은 날짜로 이미 체크했으면 스킵
 if (lastCheckedDateRef.current === today) {
 return;
 }

 lastCheckedDateRef.current = today;

 if (lastResetDate !== today) {
 // 서버(GitHub Actions)가 자정에 자동으로 리셋했을 것으로 가정
 // 클라이언트는 UI만 새로고침
 refreshTasksAfterReset();
 }
 };

 // 🔥 초기 마운트 시 한 번만 실행 (중복 방지)
 if (!dateCheckExecutedRef.current) {
 dateCheckExecutedRef.current = true;
 checkDateAndRefresh();
 }

 // 🔥 [최적화 v3.0] 1시간마다 날짜 체크 (5분→1시간, Firestore 읽기 최소화)
 // 서버 리셋 후 브라우저가 켜져있을 때 감지
 const dateCheckInterval = setInterval(
 () => {
 checkDateAndRefresh();
 },
 60 * 60 * 1000,
 ); // 1시간

 // 클린업
 return () => {
 if (dateCheckInterval) {
 clearInterval(dateCheckInterval);
 }
 };
 }, [userDoc?.classCode, refreshTasksAfterReset]);

 // Job management handlers
 const handleSaveJob = useCallback(async () => {
 if (!db || !userDoc?.classCode) {
 alert("데이터베이스 연결 오류 또는 학급 코드 없음.");
 return;
 }

 const title = adminNewJobTitle.trim();
 if (!title) {
 alert("직업 이름을 입력해주세요.");
 return;
 }

 setAppLoading(true);
 try {
 if (editingJob) {
 const jobRef = doc(db, "jobs", editingJob.id);
 const appointedOnly = adminEditingJobAppointedOnly === true;
 await updateDoc(jobRef, {
 title,
 appointedOnly,
 updatedAt: serverTimestamp(),
 });
 // 로컬 state 즉시 반영
 setJobs((prev) => prev.map((j) =>
 j.id === editingJob.id ? { ...j, title, appointedOnly } : j
 ));
 setAdminNewJobTitle("");
 setEditingJob(null);
 setAdminEditingJobAppointedOnly(false);
 alert(`직업이 수정되었습니다.`);
 } else {
 const newJobId = generateId();
 const newJobData = {
 title,
 active: true,
 // 대통령·국무총리는 생성 시 기본으로 선생님 지정 전용
 appointedOnly: RESTRICTED_JOB_TITLES.includes(title),
 tasks: [],
 createdAt: serverTimestamp(),
 updatedAt: serverTimestamp(),
 classCode: userDoc.classCode,
 };
 const jobRef = doc(db, "jobs", newJobId);
 await setDoc(jobRef, newJobData);
 // 로컬 state 즉시 반영
 setJobs((prev) => [...prev, { id: newJobId, ...newJobData, tasks: [] }]);
 setAdminNewJobTitle("");
 alert(`직업이 추가되었습니다.`);
 }

 // 캐시 무효화
 dataCache.invalidate(`jobs_${userDoc.classCode}`);
 } catch (error) {
 logger.error("handleSaveJob 오류:", error);
 alert("직업 저장 중 오류 발생");
 } finally {
 setAppLoading(false);
 }
 }, [adminNewJobTitle, adminEditingJobAppointedOnly, editingJob, generateId, userDoc]);

 const handleDeleteJob = useCallback(
 async (jobIdToDelete) => {
 if (!db) {
 alert("데이터베이스 연결 오류.");
 return;
 }

 if (
 !window.confirm(
 "정말로 이 직업을 삭제하시겠습니까? 관련된 할일도 모두 삭제됩니다.",
 )
 ) {
 return;
 }

 setAppLoading(true);
 try {
 const jobRef = doc(db, "jobs", jobIdToDelete);

 // 직업 삭제 + 같은 학급 학생들의 selectedJobIds 정리를 하나의 batch로 원자 처리.
 // (본인 계정만 정리하면 다른 학생 배열엔 죽은 id가 남아 급여 계산이 부풀려짐)
 const cleanupBatch = writeBatch(db);
 cleanupBatch.delete(jobRef);

 let cleanupCount = 0;
 if (userDoc?.classCode) {
 const classUsersQuery = query(
 firestoreCollection(db, "users"),
 where("classCode", "==", userDoc.classCode),
 );
 const classUsersSnap = await getDocs(classUsersQuery);
 classUsersSnap.docs.forEach((d) => {
 if (d.id === user?.uid) return; // 본인은 아래 updateUser로 별도 처리(로컬 state 동기화 포함)
 const data = d.data();
 const ids = toJobIdArray(data.selectedJobIds);
 const appointedIds = toJobIdArray(data.appointedJobIds);
 // 지정 전용 직업이 삭제되면 appointedJobIds에서도 지운다(교사 지정 경로도 유령 청소).
 const hitSelected = ids.includes(jobIdToDelete);
 const hitAppointed = appointedIds.includes(jobIdToDelete);
 if (hitSelected || hitAppointed) {
 const patch = { updatedAt: serverTimestamp() };
 if (hitSelected) {
 patch.selectedJobIds = ids.filter((id) => id !== jobIdToDelete);
 }
 if (hitAppointed) {
 patch.appointedJobIds = appointedIds.filter(
 (id) => id !== jobIdToDelete,
 );
 }
 cleanupBatch.update(d.ref, patch);
 cleanupCount++;
 }
 });
 }

 await cleanupBatch.commit();
 if (cleanupCount > 0) {
 logger.info(
 `[handleDeleteJob] 직업 삭제 시 ${cleanupCount}명의 학생 selectedJobIds에서 정리`,
 );
 }

 // 본인(교사) 계정도 두 필드 모두 청소. 교사는 관리자라 rules상 직접 write가 허용된다.
 if (user) {
 const ownSelected = toJobIdArray(userDoc?.selectedJobIds);
 const ownAppointed = toJobIdArray(userDoc?.appointedJobIds);
 const patch = {};
 if (ownSelected.includes(jobIdToDelete)) {
 patch.selectedJobIds = ownSelected.filter((id) => id !== jobIdToDelete);
 }
 if (ownAppointed.includes(jobIdToDelete)) {
 patch.appointedJobIds = ownAppointed.filter(
 (id) => id !== jobIdToDelete,
 );
 }
 if (Object.keys(patch).length > 0) await updateUser(patch);
 }

 if (editingJob?.id === jobIdToDelete) {
 setAdminNewJobTitle("");
 setEditingJob(null);
 }

 // 로컬 state 즉시 업데이트
 setJobs((prev) => prev.filter((j) => j.id !== jobIdToDelete));

 // 캐시 무효화
 dataCache.invalidate(`jobs_${userDoc.classCode}`);
 } catch (error) {
 logger.error("handleDeleteJob 오류:", error);
 alert("직업 삭제 중 오류 발생");
 } finally {
 setAppLoading(false);
 }
 },
 [user, userDoc, editingJob, updateUser],
 );

 const handleEditJob = useCallback((jobToEdit) => {
 if (jobToEdit) {
 setEditingJob(jobToEdit);
 setAdminNewJobTitle(jobToEdit.title);
 setAdminEditingJobAppointedOnly(isAppointedOnlyJob(jobToEdit));
 setAdminSelectedMenu("jobSettings");
 setShowAdminSettingsModal(true);
 } else {
 alert("해당 직업을 찾을 수 없습니다.");
 }
 }, []);

 // Task management handlers
 const handleAddTaskClick = useCallback((jobId = null, isJobTask = false) => {
 setIsJobTaskForForm(isJobTask);
 setCurrentJobIdForTask(jobId);
 setAdminNewTaskName("");
 setAdminNewTaskReward("0");
 setAdminNewTaskMaxClicks("5");
 setEditingTask(null);
 setAdminSelectedMenu("taskManagement");
 setShowAddTaskForm(true);
 setShowAdminSettingsModal(true);
 }, []);

 const handleEditTask = useCallback((taskToEdit, jobId = null) => {
 if (taskToEdit) {
 setEditingTask(taskToEdit);
 setAdminNewTaskName(taskToEdit.name);
 setAdminNewTaskReward(String(taskToEdit.reward || 0));
 setAdminNewTaskMaxClicks(String(taskToEdit.maxClicks || 5));
 setAdminNewTaskRequiresApproval(true);
 setIsJobTaskForForm(!!jobId);
 setCurrentJobIdForTask(jobId);
 setAdminSelectedMenu("taskManagement");
 setShowAddTaskForm(true);
 setShowAdminSettingsModal(true);
 } else {
 alert("수정할 할일을 찾을 수 없습니다.");
 }
 }, []);

 const handleSaveTask = useCallback(async () => {
 if (!db || !userDoc?.classCode) {
 alert("데이터베이스 연결 오류 또는 학급 코드 없음.");
 return;
 }

 const name = adminNewTaskName.trim();
 const reward = parseInt(adminNewTaskReward, 10);
 const maxClicks = parseInt(adminNewTaskMaxClicks, 10);

 if (
 !name ||
 isNaN(reward) ||
 reward < 0 ||
 isNaN(maxClicks) ||
 maxClicks <= 0
 ) {
 alert(
 "입력값을 확인해주세요. (이름, 보상: 0 이상 숫자, 최대 클릭: 1 이상 숫자)",
 );
 return;
 }

 setAppLoading(true);
 const taskData = {
 name,
 reward,
 maxClicks,
 clicks: editingTask?.clicks || 0,
 requiresApproval: true,
 };

 try {
 if (editingTask) {
 const taskId = editingTask.id;
 if (isJobTaskForForm && currentJobIdForTask) {
 const jobRef = doc(db, "jobs", currentJobIdForTask);
 const jobSnap = await getDoc(jobRef);
 if (
 !jobSnap.exists() ||
 jobSnap.data().classCode !== userDoc.classCode
 ) {
 throw new Error("직업 문서를 찾을 수 없거나 권한이 없습니다.");
 }
 const jobTasks = jobSnap.data().tasks || [];
 const taskIndex = jobTasks.findIndex((t) => t.id === taskId);
 if (taskIndex === -1) {
 throw new Error("직업 내 할일을 찾을 수 없습니다.");
 }
 const updatedTasks = [...jobTasks];
 updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], ...taskData };
 await updateDoc(jobRef, {
 tasks: updatedTasks,
 updatedAt: serverTimestamp(),
 });
 // 로컬 state 즉시 반영
 setJobs((prev) => prev.map((j) =>
 j.id === currentJobIdForTask ? { ...j, tasks: updatedTasks } : j
 ));
 } else {
 const taskRef = doc(db, "commonTasks", taskId);
 await updateDoc(taskRef, {
 ...taskData,
 updatedAt: serverTimestamp(),
 });
 // 로컬 state 즉시 반영
 setCommonTasks((prev) => prev.map((t) =>
 t.id === taskId ? { ...t, ...taskData } : t
 ));
 }
 setShowAddTaskForm(false);
 setEditingTask(null);
 alert(`할일이 수정되었습니다.`);
 } else {
 const newTaskId = generateId();
 const newTaskDataWithId = { ...taskData, id: newTaskId };
 if (isJobTaskForForm && currentJobIdForTask) {
 const jobRef = doc(db, "jobs", currentJobIdForTask);
 await updateDoc(jobRef, {
 tasks: arrayUnion(newTaskDataWithId),
 updatedAt: serverTimestamp(),
 });
 // 로컬 state 즉시 반영
 setJobs((prev) => prev.map((j) =>
 j.id === currentJobIdForTask ? { ...j, tasks: [...(j.tasks || []), newTaskDataWithId] } : j
 ));
 } else {
 const newTaskRef = doc(db, "commonTasks", newTaskId);
 await setDoc(newTaskRef, {
 ...newTaskDataWithId,
 createdAt: serverTimestamp(),
 updatedAt: serverTimestamp(),
 classCode: userDoc.classCode,
 });
 // 로컬 state 즉시 반영
 setCommonTasks((prev) => [...prev, { ...newTaskDataWithId, classCode: userDoc.classCode }]);
 }
 setAdminNewTaskName("");
 setAdminNewTaskReward("0");
 setAdminNewTaskMaxClicks("5");
 setAdminNewTaskRequiresApproval(true);
 setShowAddTaskForm(false);
 alert(`할일이 추가되었습니다.`);
 }

 // 캐시 무효화
 if (isJobTaskForForm) {
 dataCache.invalidate(`jobs_${userDoc.classCode}`);
 } else {
 dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
 }
 } catch (error) {
 logger.error("handleSaveTask 오류:", error);
 alert("할일 저장 중 오류 발생: " + error.message);
 } finally {
 setAppLoading(false);
 }
 }, [
 adminNewTaskName,
 adminNewTaskReward,
 adminNewTaskMaxClicks,
 editingTask,
 isJobTaskForForm,
 currentJobIdForTask,
 generateId,
 userDoc,
 ]);

 // 인라인 할일 추가 (카드 내에서 바로 추가)
 const handleInlineAddTask = useCallback(async (name, maxClicks, jobId) => {
 if (!db || !userDoc?.classCode) return;
 const taskData = { name, reward: 0, maxClicks, clicks: 0, requiresApproval: true };
 const newTaskId = generateId();
 const newTaskDataWithId = { ...taskData, id: newTaskId };

 try {
 if (jobId) {
 const jobRef = doc(db, "jobs", jobId);
 await updateDoc(jobRef, {
 tasks: arrayUnion(newTaskDataWithId),
 updatedAt: serverTimestamp(),
 });
 setJobs((prev) => prev.map((j) =>
 j.id === jobId ? { ...j, tasks: [...(j.tasks || []), newTaskDataWithId] } : j
 ));
 } else {
 const newTaskRef = doc(db, "commonTasks", newTaskId);
 await setDoc(newTaskRef, {
 ...newTaskDataWithId,
 createdAt: serverTimestamp(),
 updatedAt: serverTimestamp(),
 classCode: userDoc.classCode,
 });
 setCommonTasks((prev) => [...prev, { ...newTaskDataWithId, classCode: userDoc.classCode }]);
 }
 dataCache.invalidate(jobId ? `jobs_${userDoc.classCode}` : `commonTasks_${userDoc.classCode}`);
 } catch (error) {
 logger.error("인라인 할일 추가 오류:", error);
 alert("할일 추가 중 오류: " + error.message);
 }
 }, [generateId, userDoc]);

 // 인라인 할일 수정
 const handleInlineEditTask = useCallback(async (taskId, name, maxClicks, jobId) => {
 if (!db || !userDoc?.classCode) return;
 const taskData = { name, maxClicks, reward: 0, requiresApproval: true };
 try {
 if (jobId) {
 const jobRef = doc(db, "jobs", jobId);
 const jobSnap = await getDoc(jobRef);
 if (!jobSnap.exists()) throw new Error("직업을 찾을 수 없습니다.");
 const jobTasks = jobSnap.data().tasks || [];
 const updatedTasks = jobTasks.map((t) =>
 t.id === taskId ? { ...t, ...taskData } : t
 );
 await updateDoc(jobRef, { tasks: updatedTasks, updatedAt: serverTimestamp() });
 setJobs((prev) => prev.map((j) =>
 j.id === jobId ? { ...j, tasks: updatedTasks } : j
 ));
 } else {
 const taskRef = doc(db, "commonTasks", taskId);
 await updateDoc(taskRef, { ...taskData, updatedAt: serverTimestamp() });
 setCommonTasks((prev) => prev.map((t) =>
 t.id === taskId ? { ...t, ...taskData } : t
 ));
 }
 dataCache.invalidate(jobId ? `jobs_${userDoc.classCode}` : `commonTasks_${userDoc.classCode}`);
 } catch (error) {
 logger.error("인라인 할일 수정 오류:", error);
 alert("할일 수정 중 오류: " + error.message);
 }
 }, [userDoc]);

 const handleDeleteTask = useCallback(
 async (taskIdToDelete, jobId = null) => {
 if (!db) {
 alert("데이터베이스 연결 오류.");
 return;
 }

 if (!window.confirm("정말로 이 할일을 삭제하시겠습니까?")) {
 return;
 }

 setAppLoading(true);
 try {
 if (jobId) {
 const jobRef = doc(db, "jobs", jobId);
 const jobSnap = await getDoc(jobRef);
 if (!jobSnap.exists()) {
 throw new Error("직업 문서를 찾을 수 없습니다.");
 }
 const tasks = jobSnap.data().tasks || [];
 const updatedTasks = tasks.filter((t) => t.id !== taskIdToDelete);
 await updateDoc(jobRef, {
 tasks: updatedTasks,
 updatedAt: serverTimestamp(),
 });
 // 로컬 state 즉시 반영
 setJobs((prev) => prev.map((j) =>
 j.id === jobId ? { ...j, tasks: updatedTasks } : j
 ));
 } else {
 const taskRef = doc(db, "commonTasks", taskIdToDelete);
 const { deleteDoc } = await import("firebase/firestore");
 await deleteDoc(taskRef);
 // 로컬 state 즉시 반영
 setCommonTasks((prev) => prev.filter((t) => t.id !== taskIdToDelete));
 }

 if (editingTask?.id === taskIdToDelete) {
 setShowAddTaskForm(false);
 setEditingTask(null);
 }

 // 캐시 무효화
 if (jobId) {
 dataCache.invalidate(`jobs_${userDoc.classCode}`);
 } else {
 dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
 }
 } catch (error) {
 logger.error("handleDeleteTask 오류:", error);
 alert("할일 삭제 중 오류 발생: " + error.message);
 } finally {
 setAppLoading(false);
 }
 },
 [editingTask, userDoc],
 );

 // Job selection handlers
 const handleSelectJobClick = useCallback(() => {
 setViewMode("selectJob");
 }, []);

 const handleConfirmJobSelection = useCallback(
 async (newlySelectedJobIds) => {
 if (!user?.uid) {
 alert("사용자 정보 오류.");
 return;
 }

 const idsToSave = Array.isArray(newlySelectedJobIds)
 ? newlySelectedJobIds
 : [];
 setAppLoading(true);

 try {
 // 저장·검증은 전부 서버(saveSelectedJobs)가 한다: 존재 확인·학급 대조·지정 전용 배제·
 // 중복 제거·개수 상한. 클라이언트 캐시(jobs)가 stale이어도 유효 직업이 유실되지 않고,
 // UI를 우회해도 상한·지정 전용 직업을 뚫을 수 없다 (2026-07-13 FULL 교차검증 대응).
 const res = await saveSelectedJobsFn({ jobIds: idsToSave });
 const saved = res?.data?.selectedJobIds;
 if (Array.isArray(saved)) {
 setUserDoc((prev) => ({ ...prev, selectedJobIds: saved }));
 }
 setViewMode("list");
 alert("선택한 직업이 저장되었습니다.");
 } catch (error) {
 logger.error("handleConfirmJobSelection 오류:", error);
 // 서버가 돌려준 사유(상한 초과·지정 전용 선택 등)를 그대로 보여준다.
 alert(error?.message || "선택 직업 저장 중 예상치 못한 오류 발생.");
 } finally {
 setAppLoading(false);
 }
 },
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [user, saveSelectedJobsFn],
 );

 const handleCancelForm = useCallback(() => {
 setViewMode("list");
 }, []);

 const handleTaskEarnCoupon = useCallback(
 async (
 taskId,
 jobId = null,
 isJobTask = false,
 cardType = null,
 rewardAmount = null,
 ) => {
 if (isHandlingTask) return;
 if (!userDoc?.id) {
 alert("사용자 정보가 로드되지 않았습니다.");
 return;
 }

 // 🔥 낙관적 업데이트: 이미 완료된 할일인지 체크
 if (isJobTask && jobId) {
 const taskKey = `${jobId}_${taskId}`;
 const currentClicks = (userDoc.completedJobTasks || {})[taskKey] || 0;
 const jobTask = jobs
 .find((j) => j.id === jobId)
 ?.tasks?.find((t) => t.id === taskId);

 if (
 jobTask &&
 jobTask.maxClicks > 0 &&
 currentClicks >= jobTask.maxClicks
 ) {
 logger.warn("[Dashboard] 이미 완료된 직업 할일:", {
 taskKey,
 currentClicks,
 maxClicks: jobTask.maxClicks,
 });
 return;
 }
 } else if (!isJobTask) {
 const currentClicks = (userDoc.completedTasks || {})[taskId] || 0;
 const commonTask = commonTasks?.find((t) => t.id === taskId);

 if (
 commonTask &&
 commonTask.maxClicks > 0 &&
 currentClicks >= commonTask.maxClicks
 ) {
 logger.warn("[Dashboard] 이미 완료된 공통 할일:", {
 taskId,
 currentClicks,
 maxClicks: commonTask.maxClicks,
 });
 return;
 }
 }

 setIsHandlingTask(true);
 logger.log("[Dashboard] 할일 완료 처리 시작:", {
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 });

 // 🔥 낙관적 업데이트: 예상 보상 계산
 let expectedCashReward = 0;
 let expectedCouponReward = 0;

 // 🔥 모든 할일이 cardType과 rewardAmount 사용
 if (cardType && rewardAmount) {
 if (cardType === "cash") {
 expectedCashReward = rewardAmount;
 } else if (cardType === "coupon") {
 expectedCouponReward = rewardAmount;
 }
 }

 const prevUserDoc = { ...userDoc };

 // 낙관적 UI 업데이트
 const optimisticCash = userDoc.cash + expectedCashReward;
 const optimisticCoupons = userDoc.coupons + expectedCouponReward;

 if (isJobTask && jobId) {
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 cash: optimisticCash,
 coupons: optimisticCoupons,
 completedJobTasks: {
 ...(prevDoc.completedJobTasks || {}),
 [`${jobId}_${taskId}`]:
 ((prevDoc.completedJobTasks || {})[`${jobId}_${taskId}`] || 0) +
 1,
 },
 }));
 } else {
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 cash: optimisticCash,
 coupons: optimisticCoupons,
 completedTasks: {
 ...(prevDoc.completedTasks || {}),
 [taskId]: (prevDoc.completedTasks?.[taskId] || 0) + 1,
 },
 }));
 }

 try {
 const result = await completeTaskFunction({
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 });

 const resultData = result.data;
 logger.log("✅ [디버그] 서버로부터 받은 결과:", resultData);

 if (resultData.success) {
 // 서버에서 반환한 정확한 값으로 재조정
 const newCash =
 typeof resultData.updatedCash === "number"
 ? resultData.updatedCash
 : optimisticCash;
 const newCoupons =
 typeof resultData.updatedCoupons === "number"
 ? resultData.updatedCoupons
 : optimisticCoupons;

 logger.log(
 `✅ [디버그] 낙관적 업데이트: 현금 ${optimisticCash}원, 쿠폰 ${optimisticCoupons}개 → 서버 확정: 현금 ${newCash}원, 쿠폰 ${newCoupons}개`,
 );

 setUserDoc((prevDoc) => ({
 ...prevDoc,
 cash: newCash,
 coupons: newCoupons,
 }));

 alert(resultData.message);
 } else {
 throw new Error(resultData.message || "알 수 없는 서버 오류");
 }
 } catch (error) {
 logger.error("[Dashboard] 할일 완료 처리 중 심각한 오류:", error);
 alert(`할일 완료에 실패했습니다: ${error.message}`);

 // 롤백: 이전 상태로 복원
 setUserDoc(prevUserDoc);
 } finally {
 setIsHandlingTask(false);
 }
 },
 [
 isHandlingTask,
 userDoc,
 commonTasks,
 jobs,
 setUserDoc,
 completeTaskFunction,
 ],
 );

 // 🔥 승인 필요 할일 요청 핸들러
 const submitTaskApprovalFunction = useMemo(
 () => httpsCallable(functions, "submitTaskApproval"),
 [],
 );

 const handleTaskApprovalRequest = useCallback(
 async (
 taskId,
 jobId = null,
 isJobTask = false,
 cardType = null,
 rewardAmount = null,
 ) => {
 if (isHandlingTask) return;
 if (!userDoc?.id) {
 alert("사용자 정보가 로드되지 않았습니다.");
 return;
 }

 setIsHandlingTask(true);
 logger.log("[Dashboard] 할일 승인 요청:", {
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 });

 // 낙관적 업데이트: 클릭 카운터만 증가 (보상은 미지급)
 const prevUserDoc = { ...userDoc };

 if (isJobTask && jobId) {
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 completedJobTasks: {
 ...(prevDoc.completedJobTasks || {}),
 [`${jobId}_${taskId}`]:
 ((prevDoc.completedJobTasks || {})[`${jobId}_${taskId}`] || 0) +
 1,
 },
 }));
 } else {
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 completedTasks: {
 ...(prevDoc.completedTasks || {}),
 [taskId]: (prevDoc.completedTasks?.[taskId] || 0) + 1,
 },
 }));
 }

 try {
 const result = await submitTaskApprovalFunction({
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 });
 if (result.data.success) {
 // 관리자 자동승인인 경우 보상도 낙관적 업데이트
 if (result.data.autoApproved) {
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 ...(cardType === "cash"
 ? { cash: (prevDoc.cash || 0) + rewardAmount }
 : { coupons: (prevDoc.coupons || 0) + rewardAmount }),
 }));
 }
 alert(result.data.message);
 } else {
 throw new Error(result.data.message || "알 수 없는 오류");
 }
 } catch (error) {
 logger.error("[Dashboard] 할일 승인 요청 실패:", error);
 alert(`승인 요청에 실패했습니다: ${error.message}`);
 setUserDoc(prevUserDoc);
 } finally {
 setIsHandlingTask(false);
 }
 },
 [isHandlingTask, userDoc, setUserDoc, submitTaskApprovalFunction],
 );

 // Admin settings handlers
 const handleOpenAdminSettings = useCallback(
 (tabName = "generalSettings") => {
 setAdminGoalAmountInput(String(classCouponGoal));
 setAdminCouponValueInput(String(couponValue));
 setAdminSelectedMenu(tabName);
 setShowAdminSettingsModal(true);
 },
 [classCouponGoal, couponValue],
 );

 const handleSaveAdminSettings = useCallback(async () => {
 logger.log(
 "--- [DEBUG] EXECUTING handleSaveAdminSettings with LATEST code ---",
 );
 if (!db) {
 alert("데이터베이스 연결 오류.");
 return;
 }

 const newGoal = parseInt(adminGoalAmountInput, 10);
 const newValue = parseInt(adminCouponValueInput, 10);

 if (isNaN(newGoal) || newGoal <= 0 || isNaN(newValue) || newValue <= 0) {
 alert("올바른 목표 금액과 쿠폰 가치를 입력하세요 (0보다 큰 숫자).");
 return;
 }

 setAppLoading(true);
 try {
 const settingsRef = doc(db, "settings", "mainSettings");
 const settingsSnap = await getDoc(settingsRef);

 if (
 !settingsSnap.exists() ||
 settingsSnap.data().couponValue !== newValue
 ) {
 batchManager.addWrite({
 type: "setMerge",
 ref: settingsRef,
 data: { couponValue: newValue, updatedAt: serverTimestamp() },
 });
 }

 if (currentGoalId && isAdmin?.()) {
 try {
 const goalRef = doc(db, "goals", currentGoalId);
 // setDoc with merge: true ensures we don't overwrite existing fields like progress.
 // This safely updates the target amount or creates the document if it doesn't exist.
 await setDoc(
 goalRef,
 {
 targetAmount: newGoal,
 classCode: userDoc.classCode,
 updatedAt: serverTimestamp(),
 },
 { merge: true },
 );
 } catch (goalError) {
 logger.warn(
 "목표 설정 권한이 없어 목표 금액 설정을 건너뜀:",
 goalError.code,
 );
 }
 }

 setCouponValue(newValue);
 if (currentGoalId && isAdmin?.()) {
 setClassCouponGoal(newGoal);
 }
 setShowAdminSettingsModal(false);
 alert("관리자 설정이 저장되었습니다.");

 // 캐시 무효화
 dataCache.invalidate("mainSettings");
 if (currentGoalId) {
 dataCache.invalidate(`goal_${currentGoalId}`);
 }
 } catch (error) {
 logger.error("관리자 설정 저장 오류:", error);
 alert("관리자 설정 저장 중 오류: " + error.message);
 } finally {
 setAppLoading(false);
 }
 }, [
 adminGoalAmountInput,
 adminCouponValueInput,
 currentGoalId,
 userDoc,
 isAdmin,
 ]);

 // Class code management - 캐시 및 배치 처리 적용
 const loadClassCodes = useCallback(async () => {
 if (!db || !isAdmin?.()) return;

 // 캐시 확인
 const cached = dataCache.get("classCodes");
 if (cached) {
 setClassCodes(cached.validCodes || []);
 return;
 }

 try {
 const codeRef = doc(db, "settings", "classCodes");
 const codeDoc = await getDoc(codeRef);

 if (codeDoc.exists()) {
 const codes = Array.isArray(codeDoc.data().validCodes)
 ? codeDoc.data().validCodes
 : [];
 setClassCodes(codes);
 dataCache.set("classCodes", codeDoc.data(), CACHE_TTL.CLASS_CODES);
 } else {
 batchManager.addWrite({
 type: "set",
 ref: codeRef,
 data: {
 validCodes: [],
 createdAt: serverTimestamp(),
 updatedAt: serverTimestamp(),
 },
 });
 setClassCodes([]);
 }
 } catch (error) {
 logger.error("학급 코드 로드 오류:", error);
 setClassCodes([]);
 }
 }, [isAdmin]);

 useEffect(() => {
 if (isAdmin?.()) {
 loadClassCodes();
 }
 }, [isAdmin, loadClassCodes]);

 const handleAddClassCode = useCallback(
 async (codeToAdd) => {
 if (!db) return false;

 const trimmedCode = codeToAdd.trim();
 if (!trimmedCode) {
 alert("학급 코드를 입력해주세요.");
 return false;
 }

 if (classCodes.includes(trimmedCode)) {
 alert("이미 등록된 학급 코드입니다.");
 return false;
 }

 setAppLoading(true);
 try {
 const codeRef = doc(db, "settings", "classCodes");
 const codeSnap = await getDoc(codeRef);
 const currentValidCodes = codeSnap.exists()
 ? codeSnap.data().validCodes || []
 : [];

 batchManager.addWrite({
 type: "update",
 ref: codeRef,
 data: {
 validCodes: [...currentValidCodes, trimmedCode],
 updatedAt: serverTimestamp(),
 },
 });

 // 🔥 새 학급에 기본 데이터 복사 (CLASS2025에서 직업, 아이템 복사)
 try {
 const copyResult = await copyDefaultDataToNewClass(trimmedCode);
 if (copyResult.success) {
 alert(
 `학급 코드 '${trimmedCode}'가 추가되었습니다!\n\n기본 데이터 복사 완료:\n- 직업 ${copyResult.results.jobs.copied}개\n- 상점 아이템 ${copyResult.results.storeItems.copied}개`,
 );
 } else {
 alert(
 `학급 코드 '${trimmedCode}'가 추가되었습니다.\n\n⚠️ 기본 데이터 복사 중 오류: ${copyResult.error}\n(나중에 직접 추가해주세요)`,
 );
 }
 } catch (copyError) {
 logger.error("기본 데이터 복사 오류:", copyError);
 alert(
 `학급 코드 '${trimmedCode}'가 추가되었습니다.\n\n⚠️ 기본 데이터 복사 실패\n(나중에 직접 추가해주세요)`,
 );
 }

 // 낙관적 업데이트
 setClassCodes((prev) => [...prev, trimmedCode]);

 // 캐시 무효화
 dataCache.invalidate("classCodes");

 return true;
 } catch (error) {
 logger.error("학급 코드 추가 오류:", error);
 alert("학급 코드 추가 중 오류 발생");
 return false;
 } finally {
 setAppLoading(false);
 }
 },
 [classCodes],
 );

 const handleRemoveClassCode = useCallback(async (codeToRemove) => {
 if (!db) return false;

 if (!window.confirm(`'${codeToRemove}' 코드를 삭제하시겠습니까?`)) {
 return false;
 }

 setAppLoading(true);
 try {
 const codeRef = doc(db, "settings", "classCodes");
 const codeSnap = await getDoc(codeRef);

 if (!codeSnap.exists()) {
 throw new Error("학급 코드 문서를 찾을 수 없습니다.");
 }

 const currentValidCodes = codeSnap.data().validCodes || [];
 const updatedCodes = currentValidCodes.filter(
 (code) => code !== codeToRemove,
 );

 batchManager.addWrite({
 type: "update",
 ref: codeRef,
 data: {
 validCodes: updatedCodes,
 updatedAt: serverTimestamp(),
 },
 });

 alert("학급 코드가 삭제되었습니다.");

 // 낙관적 업데이트
 setClassCodes((prev) => prev.filter((code) => code !== codeToRemove));

 // 캐시 무효화
 dataCache.invalidate("classCodes");

 return true;
 } catch (error) {
 logger.error("학급 코드 삭제 오류:", error);
 alert("학급 코드 삭제 중 오류 발생: " + error.message);
 return false;
 } finally {
 setAppLoading(false);
 }
 }, []);

 // 강제 새로고침 핸들러
 const handleForceRefresh = useCallback(() => {
 // 캐시 클리어
 dataCache.clear();

 // 리스너 재설정
 realtimeManager.current.removeAllListeners();
 if (userDoc?.classCode) {
 setupPolling(userDoc.classCode);
 }

 // 데이터 강제 로드
 loadTasksData(true);
 }, [loadTasksData, userDoc?.classCode, setupPolling]);

 const handleManualTaskReset = useCallback(async () => {
 logger.log("[Dashboard] 수동 할일 리셋 시작");
 if (!userDoc?.classCode) {
 logger.error("[Dashboard] 학급 코드 정보가 없어 리셋을 중단합니다.");
 alert("학급 코드 정보가 없습니다.");
 return;
 }

 if (
 !window.confirm(
 `'${userDoc.classCode}' 클래스의 모든 학생들의 '오늘의 할일' 완료 기록을 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`,
 )
 ) {
 logger.log("[Dashboard] 사용자가 리셋을 취소했습니다.");
 return;
 }

 logger.log(`[Dashboard] ${userDoc.classCode} 클래스 리셋 실행...`);
 setAppLoading(true);
 try {
 const manualResetClassTasks = manualResetClassTasksFn;
 const result = await manualResetClassTasks({
 classCode: userDoc.classCode,
 });
 logger.log("[Dashboard] 클라우드 함수 결과 수신:", result.data);

 if (result.data.success) {
 // 성공 시, 새로고침 대신 클라이언트 상태를 직접 초기화하여 즉시 UI에 반영

 // 공통 할일 및 직업 할일 상태 초기화
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 completedTasks: {}, // 공통 할일 리셋
 completedJobTasks: {}, // 직업 할일 리셋
 }));

 // localStorage에 마지막 리셋 날짜 저장
 const today = new Date().toDateString();
 localStorage.setItem("lastTaskResetDate", today);

 alert(`리셋 성공!\n${result.data.message}`);
 logger.log(`[Dashboard] 리셋 성공: ${result.data.message}`);
 } else {
 throw new Error(result.data.message || "알 수 없는 오류");
 }
 } catch (error) {
 logger.error("[Dashboard] 할일 리셋 실패:", error);
 alert(`오류: 할일 리셋에 실패했습니다.\n\n${error.message}`);
 } finally {
 setAppLoading(false);
 logger.log("[Dashboard] 수동 할일 리셋 종료");
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [userDoc?.classCode, setUserDoc]);

 // Loading and error states
 if (authLoading || appLoading) {
 return (
 <PageContainer className="flex items-center justify-center">
 <LoadingState message="정보를 불러오는 중..." />
 </PageContainer>
 );
 }

 if (!user) {
 return (
 <PageContainer className="flex items-center justify-center">
 <EmptyState
 icon={ListTodo}
 title="로그인이 필요합니다"
 description="할일을 확인하려면 먼저 로그인해주세요."
 />
 </PageContainer>
 );
 }

 if (!userDoc?.id) {
 return (
 <PageContainer className="flex items-center justify-center">
 <EmptyState
 icon={ListTodo}
 title="사용자 정보 로드 실패"
 description="사용자 정보를 완전히 불러오지 못했습니다. 새로고침하거나 다시 로그인해주세요."
 />
 </PageContainer>
 );
 }

 if (!userDoc.classCode) {
 return (
 <PageContainer className="flex items-center justify-center">
 <EmptyState
 icon={ListTodo}
 title="학급 코드 없음"
 description="학급 코드 정보가 없습니다. 관리자에게 문의하여 학급 코드를 할당받으세요."
 />
 </PageContainer>
 );
 }

 // 닉네임 우선 표시 (닉네임 -> 이름 -> displayName -> "사용자")
 const userNickname =
 userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

 return (
 <div className="min-h-full w-full px-2 pt-1 pb-0">
 {/* 페이지 헤더 - 컴팩트 버전 (관리자 탭 모드가 아닐 때만 표시) */}
 {!adminTabMode && (
 <section className="glass-card rounded-2xl px-3 py-1.5 flex flex-col md:flex-row md:items-center justify-between gap-1.5 mb-2">
 <div className="flex items-center gap-2">
 <div className="w-7 h-7 bg-indigo-100 rounded-md flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-200">
 <ListTodo className="w-4 h-4" />
 </div>
 <div className="leading-tight">
 <h2 className="text-sm md:text-base font-bold text-slate-800">
 오늘의 할일
 </h2>
 <p className="text-[11px] text-slate-400">
 {userNickname}님, 오늘도 화이팅!
 </p>
 </div>
 </div>
 {isAdmin?.() && viewMode === "list" && !showAdminSettingsModal && (
 <div className="flex flex-wrap gap-1.5">
 <ActionButton
 variant="primary"
 icon={Settings}
 onClick={() => handleOpenAdminSettings("generalSettings")}
 size="sm"
 className="!bg-gradient-to-r !from-red-500 !to-orange-500 !text-white !font-bold !shadow-lg !shadow-red-500/30 !border-2 !border-red-400 !text-sm"
 >
 관리자 기능
 </ActionButton>
 <ActionButton
 variant="success"
 icon={RefreshCw}
 onClick={handleForceRefresh}
 size="sm"
 >
 새로고침
 </ActionButton>
 <ActionButton
 variant="danger"
 icon={RotateCcw}
 onClick={handleManualTaskReset}
 size="sm"
 title="이 클래스의 모든 사용자 할일을 리셋합니다"
 >
 할일 리셋
 </ActionButton>
 </div>
 )}
 {viewMode === "selectJob" && (
 <ActionButton
 variant="ghost"
 icon={ChevronLeft}
 onClick={handleCancelForm}
 >
 뒤로가기
 </ActionButton>
 )}
 </section>
 )}

 {viewMode === "list" && !showAdminSettingsModal && !adminTabMode && (
 <>
 {/* 나의 직업 할일 섹션 */}
 <div className="glass-card rounded-2xl overflow-hidden mb-6">
 {/* 나의 직업 할일 헤더 - 색상 배경 */}
 <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Briefcase className="w-5 h-5 text-white" />
 <h3 className="text-base md:text-lg font-bold text-white">
 나의 직업 할일
 </h3>
 </div>
 <ActionButton
 variant="outline"
 icon={Plus}
 onClick={handleSelectJobClick}
 size="sm"
 className="!bg-white/20 !text-white !border-white/30 hover:!bg-white/30"
 >
 직업 추가/선택
 </ActionButton>
 </div>
 <div className="p-4 md:p-6">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {jobsToShow.length > 0 ? (
 jobsToShow.map((job) => (
 <JobList
 key={job.id}
 job={job}
 isAdmin={isAdmin?.()}
 onEditJob={() => handleEditJob(job)}
 onDeleteJob={() => handleDeleteJob(job.id)}
 onAddTask={() => handleAddTaskClick(job.id, true)}
 onEarnCoupon={(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 ) =>
 handleTaskEarnCoupon(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 )
 }
 onRequestApproval={(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 ) =>
 handleTaskApprovalRequest(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 )
 }
 onEditTask={(task) => handleEditTask(task, job.id)}
 onDeleteTask={(taskId) =>
 handleDeleteTask(taskId, job.id)
 }
 isHandlingTask={isHandlingTask}
 />
 ))
 ) : (
 <div className="col-span-full">
 <EmptyState
 icon={Briefcase}
 title="표시할 직업이 없습니다"
 description="'직업 추가/선택' 버튼을 눌러 직업을 선택해주세요."
 action={
 <ActionButton
 variant="primary"
 icon={Plus}
 onClick={handleSelectJobClick}
 >
 직업 선택하기
 </ActionButton>
 }
 />
 </div>
 )}
 </div>

 {/* 공통 할일 섹션 */}
 <div className="mt-6 rounded-xl overflow-hidden border border-emerald-200 bg-white">
 {/* 공통 할일 헤더 - 색상 배경 */}
 <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <ListTodo className="w-5 h-5 text-white" />
 <h3 className="text-base md:text-lg font-bold text-white">
 공통 할일
 </h3>
 </div>
 {isAdmin?.() && (
 <ActionButton
 variant="outline"
 icon={Plus}
 onClick={() => handleAddTaskClick(null, false)}
 size="sm"
 className="!bg-white/20 !text-white !border-white/30 hover:!bg-white/30"
 >
 공통 할일 추가
 </ActionButton>
 )}
 </div>

 <div className="p-4 md:p-6 bg-white">
 <CommonTaskList
 tasks={commonTasksWithUserProgress}
 isAdmin={isAdmin?.()}
 onEarnCoupon={(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 ) =>
 handleTaskEarnCoupon(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 )
 }
 onRequestApproval={(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 ) =>
 handleTaskApprovalRequest(
 taskId,
 jobId,
 isJobTask,
 cardType,
 rewardAmount,
 )
 }
 onEditTask={(taskId) =>
 handleEditTask(
 commonTasks.find((t) => t.id === taskId),
 null,
 )
 }
 onDeleteTask={(taskId) => handleDeleteTask(taskId, null)}
 isHandlingTask={isHandlingTask}
 />
 </div>
 </div>
 </div>
 </div>
 </>
 )}

 {viewMode === "selectJob" && (
 <SelectMultipleJobsView
 availableJobs={jobs}
 currentSelectedJobIds={currentSelectedJobIdsFromUserDoc}
 onConfirmSelection={handleConfirmJobSelection}
 onCancel={handleCancelForm}
 isAdmin={isAdmin?.()}
 maxJobs={selectableJobSlots}
 onAddJob={async (title) => {
 if (!db || !userDoc?.classCode) {
 alert("데이터베이스 연결 오류 또는 학급 코드 없음.");
 return;
 }
 try {
 const newJobId = generateId();
 const jobRef = doc(db, "jobs", newJobId);
 const newJobData = {
 title,
 active: true,
 // 대통령·국무총리는 생성 시 기본으로 선생님 지정 전용
 appointedOnly: RESTRICTED_JOB_TITLES.includes(title),
 tasks: [],
 createdAt: serverTimestamp(),
 updatedAt: serverTimestamp(),
 classCode: userDoc.classCode,
 };
 batchManager.addWrite({
 type: "set",
 ref: jobRef,
 data: newJobData,
 });
 // 로컬 state 즉시 업데이트
 setJobs((prev) => [...prev, { id: newJobId, ...newJobData, tasks: [] }]);
 dataCache.invalidate(`jobs_${userDoc.classCode}`);
 } catch (error) {
 console.error("직업 추가 오류:", error);
 alert("직업 추가 중 오류 발생");
 }
 }}
 onDeleteJob={(jobId) => handleDeleteJob(jobId)}
 onEditJob={async (jobId, newTitle, appointedOnly) => {
 if (!db || !userDoc?.classCode) {
 alert("데이터베이스 연결 오류 또는 학급 코드 없음.");
 return;
 }
 try {
 const jobRef = doc(db, "jobs", jobId);
 batchManager.addWrite({
 type: "update",
 ref: jobRef,
 data: {
 title: newTitle,
 appointedOnly: appointedOnly === true,
 updatedAt: serverTimestamp(),
 },
 });
 setJobs((prev) =>
 prev.map((j) =>
 j.id === jobId
 ? { ...j, title: newTitle, appointedOnly: appointedOnly === true }
 : j
 )
 );
 dataCache.invalidate(`jobs_${userDoc.classCode}`);
 } catch (error) {
 console.error("직업 수정 오류:", error);
 alert("직업 수정 중 오류 발생");
 }
 }}
 />
 )}

 {isAdmin?.() && (
 <AdminSettingsModal
 isAdmin={isAdmin?.()}
 isSuperAdmin={isSuperAdmin?.()}
 userClassCode={userDoc?.classCode}
 showAdminSettingsModal={showAdminSettingsModal}
 setShowAdminSettingsModal={setShowAdminSettingsModal}
 adminSelectedMenu={adminSelectedMenu}
 setAdminSelectedMenu={setAdminSelectedMenu}
 classCodes={classCodes}
 onAddClassCode={handleAddClassCode}
 onRemoveClassCode={handleRemoveClassCode}
 newGoalAmount={adminGoalAmountInput}
 setNewGoalAmount={setAdminGoalAmountInput}
 adminCouponValue={adminCouponValueInput}
 setAdminCouponValue={setAdminCouponValueInput}
 handleSaveAdminSettings={handleSaveAdminSettings}
 jobs={jobs}
 adminNewJobTitle={adminNewJobTitle}
 setAdminNewJobTitle={setAdminNewJobTitle}
 adminEditingJob={editingJob}
 setAdminEditingJob={setEditingJob}
 adminEditingJobAppointedOnly={adminEditingJobAppointedOnly}
 setAdminEditingJobAppointedOnly={setAdminEditingJobAppointedOnly}
 handleSaveJob={handleSaveJob}
 handleDeleteJob={handleDeleteJob}
 handleEditJob={handleEditJob}
 commonTasks={commonTasks}
 showAddTaskForm={showAddTaskForm}
 setShowAddTaskForm={setShowAddTaskForm}
 adminNewTaskName={adminNewTaskName}
 setAdminNewTaskName={setAdminNewTaskName}
 adminNewTaskReward={adminNewTaskReward}
 setAdminNewTaskReward={setAdminNewTaskReward}
 adminNewTaskMaxClicks={adminNewTaskMaxClicks}
 setAdminNewTaskMaxClicks={setAdminNewTaskMaxClicks}
 adminNewTaskRequiresApproval={adminNewTaskRequiresApproval}
 setAdminNewTaskRequiresApproval={setAdminNewTaskRequiresApproval}
 adminEditingTask={editingTask}
 setAdminEditingTask={setEditingTask}
 handleSaveTask={handleSaveTask}
 handleEditTask={handleEditTask}
 handleDeleteTask={handleDeleteTask}
 taskFormJobId={currentJobIdForTask}
 setTaskFormJobId={setCurrentJobIdForTask}
 taskFormIsJobTask={isJobTaskForForm}
 setTaskFormIsJobTask={setIsJobTaskForForm}
 handleAddTaskClick={handleAddTaskClick}
 handleInlineAddTask={handleInlineAddTask}
 handleInlineEditTask={handleInlineEditTask}
 />
 )}
 </div>
 );
}

export default Dashboard;
