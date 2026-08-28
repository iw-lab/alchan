// src/pages/dashboard/Dashboard.js - Firestore 최적화 버전 + 일일 할일 리셋 기능 + Tailwind UI
import { normalizeCurrencyText } from "../../utils/numberFormatter";
import React, {
 useState,
 useEffect,
 useCallback,
 useMemo,
 useRef,
 lazy,
 Suspense,
} from "react";
import { useLocation } from "react-router-dom";
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
import { promptDialog } from "../../utils/promptDialog";
// AdminSettingsModal은 3900줄+ 대형 파일이고 관리자만 여는 모달이다. 정적 import면 학생(다수)도
//   Dashboard 청크에서 이 코드를 전부 다운로드했다 → lazy 로드로 분리(2026-07-19 성능).
const AdminSettingsModal = lazy(() =>
 import("../../components/modals/AdminSettingsModal").catch(() => {
 // ChunkLoadError 방지 — 1회 리로드 후 재시도(App.js lazyWithRetry와 동일 정책)
 const reloaded = sessionStorage.getItem("chunk_reload");
 if (reloaded) {
 sessionStorage.removeItem("chunk_reload");
 return import("../../components/modals/AdminSettingsModal");
 }
 sessionStorage.setItem("chunk_reload", "1");
 window.location.reload();
 return new Promise(() => {});
 }),
);
import {
 PageContainer,
 LoadingState,
 EmptyState,
 ActionButton,
} from "../../components/PageWrapper";
import globalCacheService from "../../services/globalCacheService";
import { invalidateCache as invalidateFetchCache } from "../../utils/fetchCache";
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
import { fetchPendingJobIds } from "../../firebase/db/jobApplications";
import { startBackgroundPoll } from "../../utils/backgroundPoll";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
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

// 🔒 [읽기 절감 2026-07-25] 마지막 폴링 시각을 "모듈 레벨"에 보관한다.
// 기존 가드(lastFetchTime)는 useRef라 페이지를 떠났다 오면 초기화되어, 사이드바를 오갈 때마다
// jobs(최대 300) + commonTasks(최대 50)를 매번 다시 읽었다(실측: 오늘의 할일 재진입 = 54문서 고정).
// 캐시가 살아있고 최근에 조회했으면 즉시 폴링을 생략한다 — 교사의 할일 변경은 이 간격 내에 반영된다.
const lastPollAtByClass = new Map();
const POLL_MIN_INTERVAL = 5 * 60 * 1000; // 5분

// 🔥 globalCacheService 래퍼 (기존 dataCache 인터페이스 호환)
const dataCache = {
 get: (key) => globalCacheService.get(key),
 set: (key, data, ttl) =>
 globalCacheService.set(key, data, ttl || CACHE_TTL.TASKS),
 invalidate: (key) => globalCacheService.invalidate(key),
 clear: () => globalCacheService.clearAll(),
};

/**
 * 직업 목록 캐시를 **양쪽 다** 지운다.
 *
 * 이 앱엔 jobs 를 캐싱하는 계층이 둘이고 키 모양이 다르다:
 *   - 이 화면: globalCacheService, 언더스코어 `jobs_{classCode}`
 *   - 정부 계열 6개 페이지(국회·경찰서·법원·국세청·조직도·정부):
 *     utils/fetchCache, 콜론 `jobs:{classCode}`
 * 서로를 모르기 때문에, 교사가 여기서 직업을 만들거나 고치거나 지워도
 * 그 6개 화면은 최대 TTL(폴링 간격의 0.9배 = 27~54분) 동안 **옛 목록을 보여줬다.**
 * 직업 목록은 경찰청장·대통령 같은 역할 판정에도 쓰여서 단순 표시 문제가 아니다.
 *
 * ⚠️ 언더스코어 쪽을 지우는 걸 빼면 안 된다 — 이 화면 자신이 그 캐시를 읽는다(869행).
 *    '교체'가 아니라 '둘 다'다.
 */
const invalidateJobsCaches = (classCode) => {
 if (!classCode) return;
 dataCache.invalidate(`jobs_${classCode}`);
 invalidateFetchCache(`jobs:${classCode}`);
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
 pendingJobIds = [],
 approvalRequired = false,
 appointedJobIds = [],
}) {
 // 🧑‍🏫 이미 **임명된** 직업 = 교사만 벗길 수 있다. 학생 화면에선 체크된 채 잠긴다.
 //    (서버도 학생 요청으로는 appointedJobIds 를 절대 지우지 않는다 — 두 쪽이 같은 말을 한다.)
 const appointedSet = useMemo(
 () => new Set(Array.isArray(appointedJobIds) ? appointedJobIds : []),
 [appointedJobIds],
 );
 // 승인 대기 중인 직업도 **체크된 상태로 시작**한다. 안 그러면 학생이 화면을 다시 열 때마다
 // "신청한 게 사라졌다"고 느끼고 다시 체크하게 되는데, 그러면 상한 계산에 대기분이 이중으로 잡힌다.
 const pendingSet = useMemo(
 () => new Set(Array.isArray(pendingJobIds) ? pendingJobIds : []),
 [pendingJobIds],
 );
 const [tempSelection, setTempSelection] = useState(() => {
 const base = Array.isArray(currentSelectedJobIds) ? [...currentSelectedJobIds] : [];
 // 임명된 직업도 체크된 채로 시작한다. 빠뜨리면 상한 표시가 실제보다 넉넉해 보이고,
 // 학생은 "다 찼는데 왜 저장이 안 되지"를 서버 오류로 처음 알게 된다.
 const held = (Array.isArray(appointedJobIds) ? appointedJobIds : []).filter(
 (id) => !base.includes(id),
 );
 const extra = (Array.isArray(pendingJobIds) ? pendingJobIds : []).filter(
 (id) => !base.includes(id) && !held.includes(id),
 );
 return [...base, ...held, ...extra];
 });
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
 // 이미 선택 → 해제
 if (prev.includes(jobId)) {
 // 🔒 이미 임명된 직업은 학생이 못 벗는다 — 해임은 교사의 판단이다.
 //    (서버도 학생 요청으로 appointedJobIds 를 지우지 않으므로, 여기서 풀리게 두면
 //     화면만 거짓말을 하고 저장해도 아무 일이 안 일어난다.)
 if (!isAdmin && appointedSet.has(jobId)) return prev;
 return prev.filter((id) => id !== jobId);
 }
 // 추가 시 학생(비관리자)만 상한 적용. 선생님은 자유.
 //   ⚠️ 2026-08-27: 지정 전용 직업(대통령 등)도 이제 **체크할 수 있다** — 체크는 곧
 //      '신청'이고, 부여는 선생님 승인에서만 일어난다. 예전엔 여기서 조용히 막았다.
 if (!isAdmin && countTowardCap(prev) >= maxJobs) return prev; // 개수 상한(유령 제외)
 return [...prev, jobId];
 });
 },
 [isAdmin, maxJobs, countTowardCap, appointedSet],
 );

 const handleAddNewJob = useCallback(() => {
 const title = newJobTitle.trim();
 if (!title) {
 toast.error("직업 이름을 입력해주세요.");
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
 toast.error("직업 이름을 입력해주세요.");
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

 // 안내 문구용 — '신청해야 붙는' 직업이 이 학급에 실제로 있는가.
 // 승인제가 꺼진 학급에서도 임명 전용 직업은 신청→승인이라, 있을 때만 그 사실을 알린다.
 const hasAppointedCandidate = useMemo(
 () => activeJobs.some((job) => isAppointedOnlyJob(job) && !appointedSet.has(job.id)),
 [activeJobs, appointedSet],
 );

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
 // 임명 전용 직업 = 학생도 **신청**은 할 수 있다(2026-08-27). 잠기는 건
 // 이미 임명받은 자리뿐이고, 그건 선생님만 벗길 수 있다.
 const appointedOnly = isAppointedOnlyJob(job);
 const alreadyAppointed = !isAdmin && appointedSet.has(job.id);
 const capReached =
 !isAdmin && !checked && selectedValidCount >= maxJobs;
 const disabled = alreadyAppointed || capReached;
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
 {appointedOnly && !isAdmin && (
 <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">
 {alreadyAppointed ? "임명됨" : "선생님 허가 필요"}
 </span>
 )}
 {pendingSet.has(job.id) && (
 <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 align-middle">
 신청 중
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

 {!isAdmin && (approvalRequired || hasAppointedCandidate) && (
 <p className="mt-5 text-xs text-slate-500">
 {approvalRequired ? (
 <>
 새로 고른 직업은 <b>선생님이 확인한 뒤</b> 붙어요. 체크를 풀면 바로 그만둘 수 있어요.
 </>
 ) : (
 <>
 <b>선생님 허가 필요</b> 표시가 붙은 직업(대통령 등)은 신청만 되고,{" "}
 <b>선생님이 허가해야</b> 맡게 돼요. 나머지는 바로 저장돼요.
 </>
 )}
 {" "}이미 <b>임명됨</b>인 직업은 선생님만 바꿀 수 있어요.
 </p>
 )}

 <div className="flex justify-end gap-3 mt-6">
 <ActionButton variant="secondary" onClick={onCancel}>
 취소
 </ActionButton>
 <ActionButton
 variant="primary"
 onClick={() => onConfirmSelection(tempSelection)}
 >
 {!isAdmin && (approvalRequired || hasAppointedCandidate)
 ? "저장 / 신청하기"
 : "선택 완료"}
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
 //   🐛 2026-07-20: 복원은 '모달을 열었던 경로'와 현재 경로가 같을 때만. /admin/app-settings는
 //   /dashboard/tasks와 다른 라우트 래퍼(AdminRoute vs ProtectedRoute)라 이동 시 Dashboard가
 //   리마운트되는데, 경로 조건이 없으면 새 인스턴스가 open="1"을 읽어 '오늘의 할일' 위에 관리자
 //   설정이 뜬다(경로변경 close 이펙트는 마운트 시점엔 안 돎). 경로 대조로 이 누수를 차단한다.
 const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(() => {
   try {
     return (
       sessionStorage.getItem("alchan_adminModal_open") === "1" &&
       sessionStorage.getItem("alchan_adminModal_path") === window.location.pathname
     );
   } catch { return false; }
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
       // 모달을 연 시점의 경로를 함께 저장 — 리마운트 후 초기화 시 경로 대조로 누수 차단.
       sessionStorage.setItem("alchan_adminModal_path", window.location.pathname);
     } else {
       sessionStorage.removeItem("alchan_adminModal_open");
       sessionStorage.removeItem("alchan_adminModal_menu");
       sessionStorage.removeItem("alchan_adminModal_path");
     }
   } catch { /* ignore */ }
 }, [showAdminSettingsModal, adminSelectedMenu]);

 const [jobs, setJobs] = useState([]);
 const [commonTasks, setCommonTasks] = useState([]);
 // 직업 개수 상한(관리자 설정, 기본 5) — 학생 직업 선택 UI 제한 기준
 const [maxJobsPerStudent, setMaxJobsPerStudent] = useState(5);
 // 직업 신청 승인제 여부 — 바로 아래 상한 로드가 **같은 문서**를 이미 읽으므로 추가 읽기 0.
 const [jobApprovalRequired, setJobApprovalRequired] = useState(false);
 // 승인 대기 중인 직업 id — 직업 선택 화면을 열 때만 조회한다(대시보드 진입마다 읽지 않는다).
 const [pendingJobIds, setPendingJobIds] = useState([]);
 // 🔒 대기 신청 조회가 **동시에 두 번 돌지 않게** 막는 빗장. 버튼 연타로 두 조회가 겹치면
 //    먼저 끝난 쪽이 화면을 열어 tempSelection(lazy 초기화)을 고정해 버리고, 늦게 온 결과는
 //    뱃지만 갈아끼운다 → "신청 중이라고 떠 있는데 체크는 안 된" 상태로 저장되어 그 신청이
 //    서버에서 취소된다(2026-08-20 codex CRITICAL). state 가 아니라 ref 인 이유는
 //    렌더를 유발하지 않고 **클릭 핸들러가 도는 그 순간** 값이 보여야 하기 때문이다.
 const pendingFetchInFlight = useRef(false);

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

 // 🐛 관리자 설정 화면에서 '알찬 오늘의 할일' 등으로 이동 시 모달이 잔존하던 버그 방어(보조).
 //   ⚠️ 정정(2026-07-20): /admin/app-settings(AdminRoute)와 /dashboard/tasks(ProtectedRoute)는
 //   서로 다른 라우트 래퍼라 전환 시 Dashboard가 '재마운트'된다(과거 주석은 재마운트 안 된다고
 //   잘못 서술했음). 그 리마운트 누수는 위 useState 초기화의 경로 대조가 1차로 막는다.
 //   이 effect는 '같은 인스턴스가 유지된 채' 경로만 바뀌는 경우(예: 재사용된 비관리자 라우트 간
 //   이동)를 위한 보조 방어 — adminTabMode가 아닌 곳으로 이동하면 모달을 닫는다.
 const location = useLocation();
 const prevPathRef = useRef(location.pathname);
 useEffect(() => {
 if (prevPathRef.current !== location.pathname) {
 if (!adminTabMode) {
 setShowAdminSettingsModal(false);
 }
 prevPathRef.current = location.pathname;
 }
 }, [location.pathname, adminTabMode]);

 // 직업 개수 상한 로드 — 급여 설정(settings/salarySettings_{classCode})의 maxJobsPerStudent.
 // 학생 직업 선택 UI 제한 기준. 문서/필드 없으면 기본 5 유지.
 // ⚠️ 캐시를 반드시 거친다. 여긴 기본 랜딩 라우트(/dashboard/tasks)이고, Dashboard 는
 //    관리자 탭까지 **4개의 별도 Route** 로 렌더돼 탭을 오갈 때마다 통째로 remount 된다.
 //    캐시가 없으면 그 왕복마다 문서 1건씩 새로 읽었다. 직업 개수 상한은 교사가 아주 드물게
 //    바꾸는 값이라 SETTINGS TTL(12시간)로 충분하다.
 useEffect(() => {
 const classCode = userDoc?.classCode;
 if (!db || !classCode) return;
 const cacheKey = `salarySettings_${classCode}`;
 const cached = dataCache.get(cacheKey);
 if (cached) {
 const raw = cached.maxJobsPerStudent;
 if (Number.isInteger(raw) && raw >= 1) setMaxJobsPerStudent(raw);
 setJobApprovalRequired(cached.jobApprovalRequired === true);
 return;
 }
 let cancelled = false;
 (async () => {
 try {
 const snap = await getDoc(doc(db, "settings", cacheKey));
 if (cancelled) return;
 const data = snap.exists() ? snap.data() : {};
 dataCache.set(cacheKey, data, CACHE_TTL.SETTINGS);
 const raw = data.maxJobsPerStudent;
 if (Number.isInteger(raw) && raw >= 1) setMaxJobsPerStudent(raw);
 setJobApprovalRequired(data.jobApprovalRequired === true);
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

 // 🔒 카운터 리셋을 CF(resetDailyTasksIfNewDay)로 이관 — 서버 KST 날짜가 실제로 바뀐 경우에만
 //   1회 리셋(같은 날 반복 no-op). users 카운터 필드는 rules로 클라 write 잠금(carousel mint 봉인).
 const resetFn = httpsCallable(functions, "resetDailyTasksIfNewDay");
 resetFn()
 .then((res) => {
 if (res?.data?.reset) {
 setUserDoc((prev) => ({
 ...prev,
 completedTasks: {},
 completedJobTasks: {},
 tasksResetDate: todayStr,
 }));
 logger.log("[Dashboard] 일일 할일 카운터 자동 리셋 완료:", todayStr);
 }
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

 // 직업 선택 모달의 체크 초기값 = '내가 고른' 직업.
 // ⚠️ 2026-08-27: 교사 지정 직업(appointedJobIds)도 학생이 **신청**할 수 있게 됐다.
 //    이미 임명받은 것은 아래 appointedJobIdsFromUserDoc 로 따로 넘겨 '체크+잠금'으로 그린다
 //    (서버는 학생 요청으로 그 필드를 지우지 않는다 — 화면과 서버가 같은 말을 해야 한다).
 const currentSelectedJobIdsFromUserDoc = useMemo(
 () => toJobIdArray(userDoc?.selectedJobIds),
 [userDoc],
 );
 const appointedJobIdsFromUserDoc = useMemo(
 () => toJobIdArray(userDoc?.appointedJobIds),
 [userDoc],
 );

 // 직업 선택 화면이 쓰는 상한 = **전체 상한 그대로**.
 // 2026-08-27 이전엔 여기서 `상한 − 지정직업 수` 를 넘겼다. 그때는 지정 직업이 체크 목록에
 // 아예 없었기 때문이다. 이제는 임명직도 체크된 채로 목록에 들어오므로, 몫을 한 번 더 빼면
 // **같은 직업을 두 번 빼는 셈**이 되어 학생이 고를 수 있는 수가 실제보다 적게 보인다.
 // (서버 판정도 `appointedCount + heldSelected + 대기 + 신규 ≤ maxJobsPerStudent` 로 같다.)
 const selectableJobSlots = maxJobsPerStudent;

 // ⚠️ deps 는 **실제로 읽는 필드의 서명**이어야 한다. `userDoc` 전체를 넣으면
 //    cash·lastActiveAt 같은 무관한 필드가 바뀔 때마다(AuthContext 의 onSnapshot 이
 //    매번 새 객체를 만든다) 이 memo 가 재계산되고, spread 로 만든 job/task 객체가
 //    전부 새 참조가 되어 JobList·TaskItem 의 memo 가 다시 뚫린다.
 //    핸들러를 안정화(위 JobList props)해도 prop 이 새 객체면 소용이 없다 — 둘은 세트다.
 //    같은 패턴이 AlchanSidebar 에도 있다(effectiveJobIdsKey).
 const completedJobTasksSig = JSON.stringify(userDoc?.completedJobTasks || {});
 const completedTasksSig = JSON.stringify(userDoc?.completedTasks || {});
 // 서명에서 되살린 객체를 memo 로 고정한다. 이렇게 하면 아래 두 memo 의 deps 가
 // **정직해진다** — 억제 주석 없이 exhaustive-deps 를 그대로 통과한다.
 const completedJobTasks = useMemo(
 () => JSON.parse(completedJobTasksSig),
 [completedJobTasksSig],
 );
 const completedTasks = useMemo(
 () => JSON.parse(completedTasksSig),
 [completedTasksSig],
 );

 const jobsToShow = useMemo(() => {
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
 }, [jobs, effectiveJobIds, completedJobTasks]);

 const commonTasksWithUserProgress = useMemo(() => {
 // `!userDoc` 가드를 `userDoc?.id` 로 좁혀 유지한다 — 사용자 문서가 아직 없을 때
 // 빈 목록을 주던 기존 동작 그대로다. userDoc 전체를 deps 에 넣지 않는 게 요점이다.
 if (!commonTasks || !userDoc?.id) {
 return [];
 }
 return commonTasks.map((task) => ({
 ...task,
 clicks: completedTasks[task.id] || 0,
 }));
 }, [commonTasks, completedTasks, userDoc?.id]);

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

 // Common Tasks 조회 (인덱스 없이 작동하도록 orderBy 제거)
 const tasksQuery = query(
 firestoreCollection(db, "commonTasks"),
 where("classCode", "==", classCode),
 limit(50),
 );

 // ⚠️ 두 쿼리는 서로의 결과에 의존하지 않는다. 순차 await 였을 땐 왕복 시간이 더해졌다 —
 //    읽기 **수**는 그대로지만 첫 화면이 그만큼 늦게 찼다. 여긴 기본 랜딩 라우트다.
 //    `Promise.all` 이 아니라 `allSettled` 인 이유: all 은 한쪽이 실패하면 **성공한 쪽 결과까지
 //    버린다**. 순차 await 시절엔 적어도 jobs 는 먼저 반영됐는데, all 로 바꾸면 commonTasks
 //    한 번 실패에 직업 목록까지 통째로 안 뜬다 — 병렬화하면서 조용히 나빠지는 지점이다.
 const [jobsResult, tasksResult] = await Promise.allSettled([
 getDocs(jobsQuery),
 getDocs(tasksQuery),
 ]);
 if (jobsResult.status === "rejected") {
 logger.error("Polling 에러(jobs):", jobsResult.reason);
 }
 if (tasksResult.status === "rejected") {
 logger.error("Polling 에러(commonTasks):", tasksResult.reason);
 }
 const jobsSnap = jobsResult.status === "fulfilled" ? jobsResult.value : null;
 const tasksSnap = tasksResult.status === "fulfilled" ? tasksResult.value : null;

 if (jobsSnap) {
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
 }

 if (tasksSnap) {
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
 }

 // 둘 다 성공했을 때만 "이번 주기는 조회했다"로 친다 —
 // 한쪽이 실패했는데 스로틀을 찍으면 그 실패가 5분간 재시도 없이 굳는다.
 if (jobsSnap && tasksSnap) {
 lastPollAtByClass.set(classCode, Date.now());
 }
 } catch (error) {
 logger.error("Polling 에러:", error);
 }
 };

 // 즉시 한 번 실행 — 단, 캐시가 살아있고 5분 내 이미 조회했으면 생략(메뉴 왕복 재조회 차단)
 const lastPolledAt = lastPollAtByClass.get(classCode) || 0;
 const hasFreshCache =
 !!dataCache.get(`jobs_${classCode}`) &&
 !!dataCache.get(`commonTasks_${classCode}`);
 if (!hasFreshCache || Date.now() - lastPolledAt >= POLL_MIN_INTERVAL) {
 await pollData();
 }

 // 🔥 [최적화 v3.0] 2시간마다 실행 (15분→2시간 - Firestore 읽기 극소화)
 // 🔥 [최적화 v3.1] 탭 숨김/무조작(idle) 중엔 tick 건너뜀 + 복귀 시 1회 조회.
 //   가드가 없던 동안 방치된 탭이 밤새 2시간마다 jobs+commonTasks 전량을 다시 읽었다
 //   (2026-07-26 실측: 새벽 무사용 구간에 2시간 주기 ~88읽기 버스트).
 //   화면을 실제로 보는 순간엔 복귀 조회로 갱신되므로 표시 신선도는 종전과 동일.
 const stopPolling = startBackgroundPoll(pollData, 2 * 60 * 60 * 1000);

 // Cleanup 함수 저장
 realtimeManager.current.addListener("polling", stopPolling);
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
 // ⚠️ 등록 키는 아래 setupPolling의 addListener("polling")과 같아야 한다.
 //    ("jobs"로 조회하면 항상 미등록으로 판정되어 같은 마운트에서 interval이 중복 등록될 수 있었음)
 if (!realtimeManager.current.listeners.has("polling")) {
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
 // 🔥 [최적화 v3.1] 탭 숨김/무조작 중엔 건너뜀. 날짜 리셋 감지는 "화면을 볼 때" 필요한
 //   것이므로 복귀 시 1회 조회로 충분하다(방치 탭의 매시간 읽기 제거).
 const stopDateCheck = startBackgroundPoll(
 checkDateAndRefresh,
 60 * 60 * 1000,
 ); // 1시간

 // 클린업
 return stopDateCheck;
 }, [userDoc?.classCode, refreshTasksAfterReset]);

 // Job management handlers
 const handleSaveJob = useCallback(async () => {
 if (!db || !userDoc?.classCode) {
 toast.error("데이터베이스 연결 오류 또는 학급 코드 없음.");
 return;
 }

 const title = adminNewJobTitle.trim();
 if (!title) {
 toast.error("직업 이름을 입력해주세요.");
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
 toast.success(`직업이 수정되었습니다.`);
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
 toast.success(`직업이 추가되었습니다.`);
 }

 // 캐시 무효화
 invalidateJobsCaches(userDoc.classCode);
 } catch (error) {
 logger.error("handleSaveJob 오류:", error);
 toast.error("직업 저장 중 오류 발생");
 } finally {
 setAppLoading(false);
 }
 }, [adminNewJobTitle, adminEditingJobAppointedOnly, editingJob, generateId, userDoc]);

 const handleDeleteJob = useCallback(
 async (jobIdToDelete) => {
 if (!db) {
 toast.error("데이터베이스 연결 오류.");
 return;
 }

 if (
 !(await confirmDialog(
 "정말로 이 직업을 삭제하시겠습니까? 관련된 할일도 모두 삭제됩니다.", { danger: true }))
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
 invalidateJobsCaches(userDoc.classCode);
 } catch (error) {
 logger.error("handleDeleteJob 오류:", error);
 toast.error("직업 삭제 중 오류 발생");
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
 toast.error("해당 직업을 찾을 수 없습니다.");
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
 toast.error("수정할 할일을 찾을 수 없습니다.");
 }
 }, []);

 const handleSaveTask = useCallback(async () => {
 if (!db || !userDoc?.classCode) {
 toast.error("데이터베이스 연결 오류 또는 학급 코드 없음.");
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
 toast.error(
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
 toast.success(`할일이 수정되었습니다.`);
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
 toast.success(`할일이 추가되었습니다.`);
 }

 // 캐시 무효화
 if (isJobTaskForForm) {
 invalidateJobsCaches(userDoc.classCode);
 } else {
 dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
 }
 } catch (error) {
 logger.error("handleSaveTask 오류:", error);
 toast.error("할일 저장 중 오류 발생: " + error.message);
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
 if (jobId) {
 invalidateJobsCaches(userDoc.classCode);
 } else {
 dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
 }
 } catch (error) {
 logger.error("인라인 할일 추가 오류:", error);
 toast.error("할일 추가 중 오류: " + error.message);
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
 if (jobId) {
 invalidateJobsCaches(userDoc.classCode);
 } else {
 dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
 }
 } catch (error) {
 logger.error("인라인 할일 수정 오류:", error);
 toast.error("할일 수정 중 오류: " + error.message);
 }
 }, [userDoc]);

 const handleDeleteTask = useCallback(
 async (taskIdToDelete, jobId = null) => {
 if (!db) {
 toast.error("데이터베이스 연결 오류.");
 return;
 }

 if (!(await confirmDialog("정말로 이 할일을 삭제하시겠습니까?", { danger: true }))) {
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
 invalidateJobsCaches(userDoc.classCode);
 } else {
 dataCache.invalidate(`commonTasks_${userDoc.classCode}`);
 }
 } catch (error) {
 logger.error("handleDeleteTask 오류:", error);
 toast.error("할일 삭제 중 오류 발생: " + error.message);
 } finally {
 setAppLoading(false);
 }
 },
 [editingTask, userDoc],
 );

 // Job selection handlers
 //
 // ⚠️ **대기 신청을 먼저 받아온 뒤에 화면을 연다.** 순서를 반대로 하면 조용히 데이터가 사라진다:
 //    SelectMultipleJobsView 의 tempSelection 은 lazy useState 초기화라 **마운트 순간 딱 한 번**
 //    돈다. setViewMode 를 먼저 부르면 그 순간 pendingJobIds 는 아직 [] 이고, 뒤늦게 값이
 //    도착해도 초기화는 다시 안 돈다 → 대기 중인 직업이 **체크 안 된 채로** 그려진다.
 //    그 상태로 저장하면 서버는 "체크 해제 = 마음을 접음"으로 읽고 그 신청들을 **취소**한다.
 //    뱃지(useMemo)만 늦게 갱신돼서 "신청 중이라고 떠 있는데 체크는 안 된" 모습이 된다.
 //    (2026-08-20 사후 교차검증에서 RTL 로 재현 확인)
 const handleSelectJobClick = useCallback(async () => {
 // **이 화면을 열 때만** 대기 신청을 읽는다.
 //   대시보드 진입마다 읽으면 탭 왕복(이 화면은 4개 Route 로 remount 된다)마다 비용이 붙는다.
 // 쿼리는 데이터 계층(firebase/db/jobApplications)에 있다 — 인덱스 제약도 거기 적혀 있다.
 //
 // 🔴 2026-08-27: 여기 있던 `if (!jobApprovalRequired) return` 지름길을 **없앴다.**
 //    임명 전용 직업(대통령 등)은 승인제 토글과 **무관하게** 항상 신청→승인이라,
 //    토글이 꺼진 학급에도 대기 신청이 존재한다. 그 학급에서 조회를 건너뛰면 화면은
 //    신청을 체크 안 된 상태로 그리고, 저장하는 순간 서버가 "마음을 접었다"고 읽어
 //    **방금 낸 대통령 신청을 스스로 취소한다.** 조회를 아끼려다 데이터를 지우는 자리다.
 //    (교사는 이 화면에서 신청서를 만들지 않으므로 조회할 것도 없다.)
 if (!user?.uid || isAdmin?.()) {
 setPendingJobIds([]);
 setViewMode("selectJob");
 return;
 }
 // 연타로 들어온 두 번째 클릭은 버린다(위 빗장 참고). 첫 조회가 끝나면 화면이 열리고
 // 그때는 이 버튼이 사라지므로, 사용자가 잃는 것은 없다.
 if (pendingFetchInFlight.current) return;
 pendingFetchInFlight.current = true;
 let pending;
 try {
 pending = await fetchPendingJobIds(user.uid, userDoc?.classCode);
 } finally {
 pendingFetchInFlight.current = false;
 }
 // 🔒 조회 실패(null)면 **화면을 열지 않는다.** 대기 신청을 모르는 채로 저장을 허용하면
 //    그 신청들이 통째로 취소된다. 여는 게 아니라 못 여는 쪽이 안전한 자리다.
 if (pending === null) {
 toast.error("신청 현황을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.");
 return;
 }
 setPendingJobIds(pending);
 setViewMode("selectJob");
 }, [user?.uid, isAdmin, userDoc?.classCode]);

 const handleConfirmJobSelection = useCallback(
 async (newlySelectedJobIds) => {
 if (!user?.uid) {
 toast.error("사용자 정보 오류.");
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
 // `includesAppointed` = "이 payload 에는 임명 전용 직업까지 들어 있다"는 **능력 신고**다.
 // 서버는 이 말이 없으면 임명직 대기 신청을 건드리지 않는다 — 낡은 번들을 띄워둔 탭이
 // 저장 한 번으로 방금 낸 임명 신청을 지우는 것을 막기 위해서다(서버 주석 참고).
 const res = await saveSelectedJobsFn({
 jobIds: idsToSave,
 includesAppointed: true,
 });
 const saved = res?.data?.selectedJobIds;
 if (Array.isArray(saved)) {
 setUserDoc((prev) => ({ ...prev, selectedJobIds: saved }));
 }
 // 승인제면 서버가 "지금 붙은 직업"과 "대기 중"을 나눠서 돌려준다.
 const pending = res?.data?.pendingJobIds;
 if (Array.isArray(pending)) setPendingJobIds(pending);
 setViewMode("list");
 // 신청이 생겼는지로 문구를 가른다. `approvalRequired` 로 가르면, 토글이 꺼진 학급에서
 // 임명직만 신청한 경우가 "그냥 저장됨"으로 보인다 — 학생은 대통령이 붙은 줄 안다.
 const applied = res?.data?.appliedCount || 0;
 if (applied > 0) {
 toast.success(
 `직업 ${applied}개를 신청했어요. 선생님이 확인한 뒤 붙습니다.`,
 );
 } else {
 toast.success("선택한 직업이 저장되었습니다.");
 }
 } catch (error) {
 logger.error("handleConfirmJobSelection 오류:", error);
 // 서버가 돌려준 사유(상한 초과·지정 전용 선택 등)를 그대로 보여준다.
 toast.error(error?.message || "선택 직업 저장 중 예상치 못한 오류 발생.");
 } finally {
 setAppLoading(false);
 }
 },
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [user, saveSelectedJobsFn], // setUserDoc 은 상태 setter 라 신원이 고정 — deps 에 넣어도 의미가 없다
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
 toast.error("사용자 정보가 로드되지 않았습니다.");
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

 toast.success(resultData.message);
 } else {
 throw new Error(resultData.message || "알 수 없는 서버 오류");
 }
 } catch (error) {
 logger.error("[Dashboard] 할일 완료 처리 중 심각한 오류:", error);
 toast.error(`할일 완료에 실패했습니다: ${error.message}`);

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
 toast.error("사용자 정보가 로드되지 않았습니다.");
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
 // 🎲 보상 금액은 서버(submitTaskApproval)가 가중랜덤으로 결정 — 클라 rewardAmount 미전송.
 //   서버가 굴린 실제 금액을 result.data.rewardAmount로 돌려받아 표시·낙관적 업데이트에 사용.
 const result = await submitTaskApprovalFunction({
 taskId,
 jobId,
 isJobTask,
 cardType,
 // 🔒 1-2: 서버 멱등키 — 동일 요청 재전송(SDK/네트워크 재시도)만 dedup. 매 클릭 새 uuid라
 // 더블클릭/연타 방어는 클라 lock(isHandlingTask)+서버 카운터 트랜잭션(maxClicks)이 담당.
 idempotencyKey:
 typeof crypto !== "undefined" && crypto.randomUUID
 ? crypto.randomUUID()
 : `task_${taskId}_${Date.now()}`,
 });
 if (result.data.success) {
 const serverReward = result.data.rewardAmount;
 // 관리자 자동승인인 경우 보상도 낙관적 업데이트(서버가 굴린 금액 기준)
 if (result.data.autoApproved && typeof serverReward === "number") {
 setUserDoc((prevDoc) => ({
 ...prevDoc,
 ...(cardType === "cash"
 ? { cash: (prevDoc.cash || 0) + serverReward }
 : { coupons: (prevDoc.coupons || 0) + serverReward }),
 }));
 }
 toast.success(normalizeCurrencyText(result.data.message));
 // 카드 뒷면에 서버가 굴린 실제 금액을 표시하도록 반환
 return typeof serverReward === "number" ? serverReward : null;
 } else {
 throw new Error(result.data.message || "알 수 없는 오류");
 }
 } catch (error) {
 logger.error("[Dashboard] 할일 승인 요청 실패:", error);
 toast.error(`승인 요청에 실패했습니다: ${error.message}`);
 setUserDoc(prevUserDoc);
 return null;
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
 toast.error("데이터베이스 연결 오류.");
 return;
 }

 const newGoal = parseInt(adminGoalAmountInput, 10);
 const newValue = parseInt(adminCouponValueInput, 10);

 if (isNaN(newGoal) || newGoal <= 0 || isNaN(newValue) || newValue <= 0) {
 toast.error("올바른 목표 금액과 쿠폰 가치를 입력하세요 (0보다 큰 숫자).");
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
 toast.success("관리자 설정이 저장되었습니다.");

 // 캐시 무효화
 dataCache.invalidate("mainSettings");
 if (currentGoalId) {
 dataCache.invalidate(`goal_${currentGoalId}`);
 }
 } catch (error) {
 logger.error("관리자 설정 저장 오류:", error);
 toast.error("관리자 설정 저장 중 오류: " + error.message);
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
 toast.error("학급 코드를 입력해주세요.");
 return false;
 }

 if (classCodes.includes(trimmedCode)) {
 toast.error("이미 등록된 학급 코드입니다.");
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
 toast.success(
 `학급 코드 '${trimmedCode}'가 추가되었습니다!\n\n기본 데이터 복사 완료:\n- 직업 ${copyResult.results.jobs.copied}개\n- 상점 아이템 ${copyResult.results.storeItems.copied}개`,
 );
 } else {
 toast.error(
 `학급 코드 '${trimmedCode}'가 추가되었습니다.\n\n⚠️ 기본 데이터 복사 중 오류: ${copyResult.error}\n(나중에 직접 추가해주세요)`,
 );
 }
 } catch (copyError) {
 logger.error("기본 데이터 복사 오류:", copyError);
 toast.error(
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
 toast.error("학급 코드 추가 중 오류 발생");
 return false;
 } finally {
 setAppLoading(false);
 }
 },
 [classCodes],
 );

 const handleRemoveClassCode = useCallback(async (codeToRemove) => {
 if (!db) return false;

 if (!(await confirmDialog(`'${codeToRemove}' 코드를 삭제하시겠습니까?`, { danger: true }))) {
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

 toast.success("학급 코드가 삭제되었습니다.");

 // 낙관적 업데이트
 setClassCodes((prev) => prev.filter((code) => code !== codeToRemove));

 // 캐시 무효화
 dataCache.invalidate("classCodes");

 return true;
 } catch (error) {
 logger.error("학급 코드 삭제 오류:", error);
 toast.error("학급 코드 삭제 중 오류 발생: " + error.message);
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
 toast.error("학급 코드 정보가 없습니다.");
 return;
 }

 // ⚠️ 학급 전원의 기록을 지우는 되돌릴 수 없는 작업인데 '새로고침' 버튼 바로 옆에 있어
 //    오클릭 위험이 있다(2026-07-25 리뷰 C4). 버튼을 시각적으로 분리하고 확인을 2단계로 둔다.
 if (
 !(await confirmDialog(
 `'${userDoc.classCode}' 클래스의 모든 학생들의 '오늘의 할일' 완료 기록을 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`, { danger: true, confirmText: "초기화하기" }))
 ) {
 logger.log("[Dashboard] 사용자가 리셋을 취소했습니다.");
 return;
 }

 const typed = await promptDialog(
 `정말 초기화하려면 학급 코드 "${userDoc.classCode}"를 입력하세요.\n(오늘 학생들이 완료한 할일 기록이 모두 사라집니다)`,
 "",
 { placeholder: userDoc.classCode, confirmText: "초기화하기", danger: true },
 );
 if (!typed || typed.trim().toUpperCase() !== String(userDoc.classCode).toUpperCase()) {
 logger.log("[Dashboard] 학급 코드 확인 실패 - 리셋 취소");
 if (typed !== null) toast.error("학급 코드가 일치하지 않아 초기화를 취소했습니다.");
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

 toast.success(`리셋 성공!\n${normalizeCurrencyText(result.data.message)}`);
 logger.log(`[Dashboard] 리셋 성공: ${result.data.message}`);
 } else {
 throw new Error(result.data.message || "알 수 없는 오류");
 }
 } catch (error) {
 logger.error("[Dashboard] 할일 리셋 실패:", error);
 toast.error(`오류: 할일 리셋에 실패했습니다.\n\n${error.message}`);
 } finally {
 setAppLoading(false);
 logger.log("[Dashboard] 수동 할일 리셋 종료");
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [userDoc?.classCode, setUserDoc]); // manualResetClassTasksFn 은 httpsCallable 결과라 렌더마다 새 신원 — 넣으면 콜백이 매번 재생성된다

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
 {/* 파괴적 작업이라 자주 쓰는 '새로고침'과 붙여두지 않는다 — 구분선으로 떼어놓는다. */}
 <span className="self-stretch w-px bg-slate-200 mx-1" aria-hidden="true" />
 <ActionButton
 variant="danger"
 icon={RotateCcw}
 onClick={handleManualTaskReset}
 size="sm"
 title="이 클래스의 모든 사용자 할일을 리셋합니다 (되돌릴 수 없음)"
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
 // ⚠️ 아래는 전부 **안정된 핸들러 그대로** 넘긴다. 인라인 화살표를 쓰면 렌더마다 새
 //    함수가 되어 JobList·TaskItem 의 React.memo 가 통째로 무력화된다 — userDoc 의 cash 가
 //    1원 바뀌어도 직업 카드와 그 아래 할일 수십 개가 전부 다시 그려졌다. 그 순간은
 //    정확히 할일 카드 뒤집기 애니메이션이 도는 순간과 겹친다.
 //    인자(job / task / jobId)는 자식이 자기 props 로 붙인다.
 onEditJob={handleEditJob}
 onDeleteJob={handleDeleteJob}
 onAddTask={handleAddTaskClick}
 onEarnCoupon={handleTaskEarnCoupon}
 onRequestApproval={handleTaskApprovalRequest}
 onEditTask={handleEditTask}
 onDeleteTask={handleDeleteTask}
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
 // JobList 와 같은 규약 — 안정된 핸들러 그대로. TaskItem 이 (task, jobId=null) 로 부른다.
 onEarnCoupon={handleTaskEarnCoupon}
 onRequestApproval={handleTaskApprovalRequest}
 onEditTask={handleEditTask}
 onDeleteTask={handleDeleteTask}
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
 pendingJobIds={pendingJobIds}
 approvalRequired={jobApprovalRequired}
 appointedJobIds={appointedJobIdsFromUserDoc}
 onAddJob={async (title) => {
 if (!db || !userDoc?.classCode) {
 toast.error("데이터베이스 연결 오류 또는 학급 코드 없음.");
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
 invalidateJobsCaches(userDoc.classCode);
 } catch (error) {
 console.error("직업 추가 오류:", error);
 toast.error("직업 추가 중 오류 발생");
 }
 }}
 onDeleteJob={(jobId) => handleDeleteJob(jobId)}
 onEditJob={async (jobId, newTitle, appointedOnly) => {
 if (!db || !userDoc?.classCode) {
 toast.error("데이터베이스 연결 오류 또는 학급 코드 없음.");
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
 invalidateJobsCaches(userDoc.classCode);
 } catch (error) {
 console.error("직업 수정 오류:", error);
 toast.error("직업 수정 중 오류 발생");
 }
 }}
 />
 )}

 {isAdmin?.() && (
 <Suspense fallback={null}>
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
 </Suspense>
 )}
 </div>
 );
}

export default Dashboard;
