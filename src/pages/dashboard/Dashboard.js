// src/pages/dashboard/Dashboard.js - Firestore 최적화 버전 + 일일 할일 리셋 기능 + Tailwind UI
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";
import { useAuth } from "../../contexts/AuthContext";
import { db, functions, copyDefaultDataToNewClass } from "../../firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  increment,
  arrayUnion,
  query,
  where,
  collection as firestoreCollection,
  limit,
  orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { formatKoreanCurrency, formatCouponCount } from '../../utils/numberFormatter';
import JobList from "../../components/JobList";
import CommonTaskList from "../../components/CommonTaskList";
import TransferModal from "../../components/modals/TransferModal";
import DonateCouponModal from "../../components/modals/DonateCouponModal";
import DonationHistoryModal from "../../components/modals/DonationHistoryModal";
import SellCouponModal from "../../components/modals/SellCouponModal";
import AdminSettingsModal from "../../components/modals/AdminSettingsModal";
import GiftCouponModal from "../../components/modals/GiftCouponModal";
import {
  PageContainer,
  PageHeader,
  SectionTitle,
  LoadingState,
  EmptyState,
  ActionButton,
  CardGrid,
} from "../../components/PageWrapper";
import globalCacheService from "../../services/globalCacheService";
import { Briefcase, ListTodo, Settings, RefreshCw, RotateCcw, Plus, ChevronLeft, X } from "lucide-react";

import { logger } from "../../utils/logger";
// Cloud Functions 호출 함수 설정 (handleManualTaskReset 내부에서 사용)

// 🔥 [최적화 v3.0] 극단적 최적화 - Firestore 읽기 95% 감소 목표
// TTL 상수 - 캐시 일관성을 위해 globalCacheService와 동일하게 설정
const CACHE_TTL = {
  JOBS: 6 * 60 * 60 * 1000,        // 6시간 (직업 데이터)
  TASKS: 6 * 60 * 60 * 1000,       // 6시간 (할일 데이터)
  SETTINGS: 12 * 60 * 60 * 1000,   // 12시간 (설정)
  GOALS: 6 * 60 * 60 * 1000,       // 6시간 (목표)
  CLASS_CODES: 24 * 60 * 60 * 1000, // 24시간 (학급 코드)
};

// 🔥 globalCacheService 래퍼 (기존 dataCache 인터페이스 호환)
const dataCache = {
  get: (key) => globalCacheService.get(key),
  set: (key, data, ttl) => globalCacheService.set(key, data, ttl || CACHE_TTL.TASKS),
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
          case 'set':
            batch.set(ref, data);
            break;
          case 'update':
            batch.update(ref, data);
            break;
          case 'delete':
            batch.delete(ref);
            break;
        }
      });

      await batch.commit();
      logger.log(`배치 실행 완료: ${operations.length}개 작업`);
    } catch (error) {
      logger.error('배치 실행 실패:', error);
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
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}

// Utility functions - 캐시 및 최적화 적용
const saveSharedData = async (data, classCode) => {
  try {
    // 배치 매니저 사용
    const newDocRef = doc(firestoreCollection(db, "sharedData"));
    batchManager.addWrite({
      type: 'set',
      ref: newDocRef,
      data: {
        ...data,
        classCode,
        createdAt: serverTimestamp(),
      }
    });

    // 캐시 무효화
    dataCache.invalidate(`classData_${classCode}`);
    return true;
  } catch (error) {
    logger.error("Error saving shared data:", error);
    return false;
  }
};

function SelectMultipleJobsView({
  availableJobs,
  currentSelectedJobIds = [],
  onConfirmSelection,
  onCancel,
}) {
  const [tempSelection, setTempSelection] = useState(
    Array.isArray(currentSelectedJobIds) ? [...currentSelectedJobIds] : []
  );

  const activeJobs = useMemo(() => {
    return Array.isArray(availableJobs)
      ? availableJobs.filter((job) => job.active !== false)
      : [];
  }, [availableJobs]);

  const handleCheckboxChange = useCallback((jobId) => {
    setTempSelection((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId]
    );
  }, []);

  return (
    <div className="bg-[#14142380] backdrop-blur-sm rounded-2xl shadow-lg border border-cyan-900/30 p-6 max-w-xl mx-auto my-8">
      <h4 className="text-xl font-semibold text-white text-center mb-2">
        직업 선택 (다중 선택 가능)
      </h4>
      <p className="text-sm text-slate-400 text-center mb-4">
        '나의 할일'에 표시할 직업을 선택하세요.
      </p>
      <div className="flex flex-col gap-3">
        {activeJobs.map((job) => (
          <label
            key={job.id}
            className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${tempSelection.includes(job.id)
              ? 'border-cyan-500 bg-cyan-900/30'
              : 'border-cyan-900/20 bg-[#14142380] hover:border-cyan-500/50'
              }`}
          >
            <input
              type="checkbox"
              checked={tempSelection.includes(job.id)}
              onChange={() => handleCheckboxChange(job.id)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
            <span className={`font-medium ${tempSelection.includes(job.id)
              ? 'text-cyan-400'
              : 'text-slate-300'
              }`}>
              {job.title}
            </span>
          </label>
        ))}
        {activeJobs.length === 0 && (
          <EmptyState
            icon={Briefcase}
            title="선택 가능한 직업이 없습니다"
            description="관리자가 직업을 등록하면 여기에 표시됩니다."
          />
        )}
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <ActionButton variant="secondary" onClick={onCancel}>
          취소
        </ActionButton>
        <ActionButton variant="primary" onClick={() => onConfirmSelection(tempSelection)}>
          선택 완료
        </ActionButton>
      </div>
    </div>
  );
}

function Dashboard({ adminTabMode }) {
  const navigate = useNavigate();
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
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  const [adminSelectedMenu, setAdminSelectedMenu] = useState("generalSettings");

  const [jobs, setJobs] = useState([]);
  const [commonTasks, setCommonTasks] = useState([]);

  const [editingJob, setEditingJob] = useState(null);
  const [adminNewJobTitle, setAdminNewJobTitle] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [currentJobIdForTask, setCurrentJobIdForTask] = useState(null);
  const [isJobTaskForForm, setIsJobTaskForForm] = useState(false);
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [adminNewTaskName, setAdminNewTaskName] = useState("");
  const [adminNewTaskReward, setAdminNewTaskReward] = useState("");
  const [adminNewTaskMaxClicks, setAdminNewTaskMaxClicks] = useState("5");

  // 🔥 [최적화] httpsCallable 메모이제이션
  const completeTaskFunction = useMemo(() => httpsCallable(functions, "completeTask"), []);
  const manualResetClassTasksFn = useMemo(() => httpsCallable(functions, 'manualResetClassTasks'), []);

  const [isHandlingTask, setIsHandlingTask] = useState(false);

  const [classCouponGoal, setClassCouponGoal] = useState(1000);
  const [couponValue, setCouponValue] = useState(1000);
  const [adminCouponValueInput, setAdminCouponValueInput] = useState(
    String(1000)
  );
  const [adminGoalAmountInput, setAdminGoalAmountInput] = useState(
    String(1000)
  );
  const [classCodes, setClassCodes] = useState([]);

  // adminTabMode가 있으면 모달 열기
  useEffect(() => {
    if (adminTabMode && isAdmin?.()) {
      setAdminSelectedMenu(adminTabMode);
      setShowAdminSettingsModal(true);
    }
  }, [adminTabMode, isAdmin]);


  // Memoized values
  const currentGoalId = useMemo(() => {
    return userDoc?.classCode && isAdmin?.()
      ? `${userDoc.classCode}_goal`
      : null;
  }, [userDoc?.classCode, isAdmin]);

  const currentSelectedJobIdsFromUserDoc = useMemo(() => {
    return userDoc && Array.isArray(userDoc.selectedJobIds)
      ? userDoc.selectedJobIds
      : [];
  }, [userDoc]);

  const jobsToShow = useMemo(() => {
    const completedJobTasks = userDoc?.completedJobTasks || {};

    return Array.isArray(jobs)
      ? jobs
        .filter(
          (job) =>
            currentSelectedJobIdsFromUserDoc.includes(job.id) &&
            job.active !== false
        )
        .map((job) => ({
          ...job,
          tasks: (job.tasks || []).map((task) => ({
            ...task,
            clicks: completedJobTasks[`${job.id}_${task.id}`] || 0, // 개인별 클릭 횟수
          })),
        }))
      : [];
  }, [jobs, currentSelectedJobIdsFromUserDoc, userDoc]);

  const commonTasksWithUserProgress = useMemo(() => {
    if (!commonTasks || !userDoc) {
      return [];
    }
    const userCompletedTasks = userDoc.completedTasks || {};
    return commonTasks.map(task => ({
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
      return Date.now().toString() + Math.random().toString(36).substring(2, 11);
    }
  }, []);

  // 🔥 [최적화] Polling 방식으로 전환 (30초마다)
  const setupPolling = useCallback(async (classCode) => {
    if (!classCode) return;

    const pollData = async () => {
      try {
        // Jobs 조회 (인덱스 없이 작동하도록 orderBy 제거)
        const jobsQuery = query(
          firestoreCollection(db, "jobs"),
          where("classCode", "==", classCode),
          limit(50)
        );

        const jobsSnap = await getDocs(jobsQuery);
        const loadedJobs = jobsSnap.docs.map((d) => ({
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
          limit(50)
        );

        const tasksSnap = await getDocs(tasksQuery);
        const loadedCommonTasks = tasksSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          reward: d.data().reward || 0,
          clicks: d.data().clicks || 0,
          maxClicks: d.data().maxClicks || 5,
        }))
          // 클라이언트 측에서 정렬 (updatedAt이 있는 경우)
          .sort((a, b) => {
            const timeA = a.updatedAt?.toMillis?.() || 0;
            const timeB = b.updatedAt?.toMillis?.() || 0;
            return timeB - timeA;
          });

        setCommonTasks(loadedCommonTasks);
        dataCache.set(`commonTasks_${classCode}`, loadedCommonTasks, CACHE_TTL.TASKS);
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
    realtimeManager.current.addListener('polling', () => clearInterval(intervalId));
  }, []);

  // 캐시된 데이터 로드 함수
  const loadCachedData = useCallback(async (classCode) => {
    const jobsCache = dataCache.get(`jobs_${classCode}`);
    const tasksCache = dataCache.get(`commonTasks_${classCode}`);
    const settingsCache = dataCache.get('mainSettings');

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
      hasSettingsCache: !!settingsCache
    };
  }, []);

  // 최적화된 데이터 로드 함수
  const loadTasksData = useCallback(async (forceRefresh = false) => {
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
        if (!realtimeManager.current.listeners.has('jobs')) {
          // 리스너 설정을 다음 틱으로 지연하여 초기 렌더링 차단 방지
          setTimeout(() => setupPolling(classCode), 0);
        }

        // 3단계: 캐시되지 않은 정적 데이터만 가져오기
        const promises = [];

        if (!cacheStatus.hasSettingsCache || forceRefresh) {
          promises.push(
            getDoc(doc(db, "settings", "mainSettings")).then(snap => ({
              type: 'settings',
              data: snap.exists() ? snap.data() : null
            }))
          );
        }

        if (currentGoalId && (!dataCache.get(`goal_${currentGoalId}`) || forceRefresh)) {
          promises.push(
            getDoc(doc(db, "goals", currentGoalId)).then(snap => ({
              type: 'goal',
              data: snap.exists() ? snap.data() : null
            }))
          );
        }

        if (isSuperAdmin() && (!dataCache.get('classCodes') || forceRefresh)) {
          promises.push(
            getDoc(doc(db, "settings", "classCodes")).then(snap => ({
              type: 'classCodes',
              data: snap.exists() ? snap.data() : null
            }))
          );
        }

        // 필요한 데이터만 병렬로 가져오기
        if (promises.length > 0) {
          const results = await Promise.all(promises);

          results.forEach(result => {
            switch (result.type) {
              case 'settings':
                if (result.data) {
                  const newCouponValue = result.data.couponValue || 1000;
                  setCouponValue(newCouponValue);
                  setAdminCouponValueInput(String(newCouponValue));
                  dataCache.set('mainSettings', result.data, CACHE_TTL.SETTINGS);
                }
                break;
              case 'goal':
                if (result.data && result.data.classCode === classCode) {
                  const targetAmount = result.data.targetAmount || 1000;
                  setClassCouponGoal(targetAmount);
                  setAdminGoalAmountInput(String(targetAmount));
                  dataCache.set(`goal_${currentGoalId}`, result.data, CACHE_TTL.GOALS);
                }
                break;
              case 'classCodes':
                if (result.data) {
                  setClassCodes(result.data.validCodes || []);
                  dataCache.set('classCodes', result.data, CACHE_TTL.CLASS_CODES);
                }
                break;
            }
          });
        }

        lastFetchTime.current = now;
      } catch (error) {
        logger.warn('[Dashboard] data fetch failed:', error);
      } finally {
        setAppLoading(false);
        fetchPromise.current = null;
      }
    };

    fetchPromise.current = fetchData();
    return fetchPromise.current;
  }, [userDoc?.classCode, currentGoalId, isSuperAdmin, setupPolling, loadCachedData]);

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
      localStorage.setItem('lastTaskResetDate', today);

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
      const lastResetDate = localStorage.getItem('lastTaskResetDate');

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
    const dateCheckInterval = setInterval(() => {
      checkDateAndRefresh();
    }, 60 * 60 * 1000); // 1시간

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
        // 배치 매니저 사용
        batchManager.addWrite({
          type: 'update',
          ref: jobRef,
          data: { title, updatedAt: serverTimestamp() }
        });

        alert(`직업이 수정되었습니다.`);
        setAdminNewJobTitle("");
        setEditingJob(null);
        setShowAdminSettingsModal(false);
      } else {
        const newJobId = generateId();
        const jobRef = doc(db, "jobs", newJobId);
        batchManager.addWrite({
          type: 'set',
          ref: jobRef,
          data: {
            title,
            active: true,
            tasks: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            classCode: userDoc.classCode,
          }
        });

        alert(`직업이 추가되었습니다.`);
        setAdminNewJobTitle("");
      }

      // 캐시 무효화
      dataCache.invalidate(`jobs_${userDoc.classCode}`);
    } catch (error) {
      logger.error("handleSaveJob 오류:", error);
      alert("직업 저장 중 오류 발생");
    } finally {
      setAppLoading(false);
    }
  }, [adminNewJobTitle, editingJob, generateId, userDoc]);

  const handleDeleteJob = useCallback(
    async (jobIdToDelete) => {
      if (!db) {
        alert("데이터베이스 연결 오류.");
        return;
      }

      if (
        !window.confirm(
          "정말로 이 직업을 삭제하시겠습니까? 관련된 할일도 모두 삭제됩니다."
        )
      ) {
        return;
      }

      setAppLoading(true);
      try {
        // 배치 매니저 사용
        const jobRef = doc(db, "jobs", jobIdToDelete);
        batchManager.addWrite({
          type: 'delete',
          ref: jobRef,
          data: null
        });

        if (user && userDoc?.selectedJobIds?.includes(jobIdToDelete)) {
          const updatedSelectedIds = userDoc.selectedJobIds.filter(
            (id) => id !== jobIdToDelete
          );
          await updateUser({ selectedJobIds: updatedSelectedIds });
        }

        if (editingJob?.id === jobIdToDelete) {
          setAdminNewJobTitle("");
          setEditingJob(null);
        }

        setShowAdminSettingsModal(false);
        alert("직업이 삭제되었습니다.");

        // 캐시 무효화
        dataCache.invalidate(`jobs_${userDoc.classCode}`);
      } catch (error) {
        logger.error("handleDeleteJob 오류:", error);
        alert("직업 삭제 중 오류 발생");
      } finally {
        setAppLoading(false);
      }
    },
    [user, userDoc, editingJob, updateUser]
  );

  const handleEditJob = useCallback((jobToEdit) => {
    if (jobToEdit) {
      setEditingJob(jobToEdit);
      setAdminNewJobTitle(jobToEdit.title);
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
    setAdminNewTaskReward("");
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
        "입력값을 확인해주세요. (이름, 보상: 0 이상 숫자, 최대 클릭: 1 이상 숫자)"
      );
      return;
    }

    setAppLoading(true);
    const taskData = {
      name,
      reward,
      maxClicks,
      clicks: editingTask?.clicks || 0,
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

          // 배치 매니저 사용
          batchManager.addWrite({
            type: 'update',
            ref: jobRef,
            data: {
              tasks: updatedTasks,
              updatedAt: serverTimestamp(),
            }
          });
        } else {
          const taskRef = doc(db, "commonTasks", taskId);
          batchManager.addWrite({
            type: 'update',
            ref: taskRef,
            data: {
              ...taskData,
              updatedAt: serverTimestamp(),
            }
          });
        }
        setShowAddTaskForm(false);
        setEditingTask(null);
        setShowAdminSettingsModal(false);
        alert(`할일이 수정되었습니다.`);
      } else {
        const newTaskId = generateId();
        const newTaskDataWithId = { ...taskData, id: newTaskId, clicks: 0 };
        if (isJobTaskForForm && currentJobIdForTask) {
          const jobRef = doc(db, "jobs", currentJobIdForTask);
          batchManager.addWrite({
            type: 'update',
            ref: jobRef,
            data: {
              tasks: arrayUnion(newTaskDataWithId),
              updatedAt: serverTimestamp(),
            }
          });
        } else {
          const newTaskRef = doc(db, "commonTasks", newTaskId);
          batchManager.addWrite({
            type: 'set',
            ref: newTaskRef,
            data: {
              ...newTaskDataWithId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              classCode: userDoc.classCode,
            }
          });
        }
        setAdminNewTaskName("");
        setAdminNewTaskReward("");
        setAdminNewTaskMaxClicks("5");
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

          // 배치 매니저 사용
          batchManager.addWrite({
            type: 'update',
            ref: jobRef,
            data: {
              tasks: updatedTasks,
              updatedAt: serverTimestamp(),
            }
          });
        } else {
          const taskRef = doc(db, "commonTasks", taskIdToDelete);
          batchManager.addWrite({
            type: 'delete',
            ref: taskRef,
            data: null
          });
        }

        if (editingTask?.id === taskIdToDelete) {
          setShowAddTaskForm(false);
          setEditingTask(null);
        }

        setShowAdminSettingsModal(false);
        alert("할일이 삭제되었습니다.");

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
    [editingTask, userDoc]
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
        const success = await updateUser({ selectedJobIds: idsToSave });
        if (success) {
          setUserDoc(prev => ({ ...prev, selectedJobIds: idsToSave })); // Optimistic update
          setViewMode("list");
          alert("선택한 직업이 저장되었습니다.");
        } else {
          alert("선택한 직업 저장 중 오류 발생.");
        }
      } catch (error) {
        logger.error("handleConfirmJobSelection 오류:", error);
        alert("선택 직업 저장 중 예상치 못한 오류 발생.");
      } finally {
        setAppLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, updateUser]
  );

  const handleCancelForm = useCallback(() => {
    setViewMode("list");
  }, []);

  const handleTaskEarnCoupon = useCallback(
    async (taskId, jobId = null, isJobTask = false, cardType = null, rewardAmount = null) => {
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
          .find(j => j.id === jobId)
          ?.tasks?.find(t => t.id === taskId);

        if (jobTask && jobTask.maxClicks > 0 && currentClicks >= jobTask.maxClicks) {
          logger.warn("[Dashboard] 이미 완료된 직업 할일:", { taskKey, currentClicks, maxClicks: jobTask.maxClicks });
          return;
        }
      } else if (!isJobTask) {
        const currentClicks = (userDoc.completedTasks || {})[taskId] || 0;
        const commonTask = commonTasks?.find(t => t.id === taskId);

        if (commonTask && commonTask.maxClicks > 0 && currentClicks >= commonTask.maxClicks) {
          logger.warn("[Dashboard] 이미 완료된 공통 할일:", { taskId, currentClicks, maxClicks: commonTask.maxClicks });
          return;
        }
      }

      setIsHandlingTask(true);
      logger.log("[Dashboard] 할일 완료 처리 시작:", { taskId, jobId, isJobTask, cardType, rewardAmount });

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
        setUserDoc(prevDoc => ({
          ...prevDoc,
          cash: optimisticCash,
          coupons: optimisticCoupons,
          completedJobTasks: {
            ...(prevDoc.completedJobTasks || {}),
            [`${jobId}_${taskId}`]: ((prevDoc.completedJobTasks || {})[`${jobId}_${taskId}`] || 0) + 1,
          }
        }));
      } else {
        setUserDoc(prevDoc => ({
          ...prevDoc,
          cash: optimisticCash,
          coupons: optimisticCoupons,
          completedTasks: {
            ...(prevDoc.completedTasks || {}),
            [taskId]: (prevDoc.completedTasks?.[taskId] || 0) + 1,
          }
        }));
      }

      try {
        const result = await completeTaskFunction({ taskId, jobId, isJobTask, cardType, rewardAmount });

        const resultData = result.data;
        logger.log("✅ [디버그] 서버로부터 받은 결과:", resultData);

        if (resultData.success) {
          // 서버에서 반환한 정확한 값으로 재조정
          const newCash = typeof resultData.updatedCash === 'number' ? resultData.updatedCash : optimisticCash;
          const newCoupons = typeof resultData.updatedCoupons === 'number' ? resultData.updatedCoupons : optimisticCoupons;

          logger.log(`✅ [디버그] 낙관적 업데이트: 현금 ${optimisticCash}원, 쿠폰 ${optimisticCoupons}개 → 서버 확정: 현금 ${newCash}원, 쿠폰 ${newCoupons}개`);

          setUserDoc(prevDoc => ({ ...prevDoc, cash: newCash, coupons: newCoupons }));

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
    [isHandlingTask, userDoc, commonTasks, jobs, setUserDoc]
  );

  // Admin settings handlers
  const handleOpenAdminSettings = useCallback((tabName = "generalSettings") => {
    setAdminGoalAmountInput(String(classCouponGoal));
    setAdminCouponValueInput(String(couponValue));
    setAdminSelectedMenu(tabName);
    setShowAdminSettingsModal(true);
  }, [classCouponGoal, couponValue]);

  const handleSaveAdminSettings = useCallback(async () => {
    logger.log("--- [DEBUG] EXECUTING handleSaveAdminSettings with LATEST code ---");
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
          type: 'set',
          ref: settingsRef,
          data: { couponValue: newValue, updatedAt: serverTimestamp() }
        });
      }

      if (currentGoalId && isAdmin?.()) {
        try {
          const goalRef = doc(db, "goals", currentGoalId);
          // setDoc with merge: true ensures we don't overwrite existing fields like progress.
          // This safely updates the target amount or creates the document if it doesn't exist.
          await setDoc(goalRef, {
            targetAmount: newGoal,
            classCode: userDoc.classCode,
            updatedAt: serverTimestamp(),
          }, { merge: true });

        } catch (goalError) {
          logger.warn(
            "목표 설정 권한이 없어 목표 금액 설정을 건너뜀:",
            goalError.code
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
      dataCache.invalidate('mainSettings');
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
    const cached = dataCache.get('classCodes');
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
        dataCache.set('classCodes', codeDoc.data(), CACHE_TTL.CLASS_CODES);
      } else {
        batchManager.addWrite({
          type: 'set',
          ref: codeRef,
          data: {
            validCodes: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
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
          type: 'update',
          ref: codeRef,
          data: {
            validCodes: [...currentValidCodes, trimmedCode],
            updatedAt: serverTimestamp(),
          }
        });

        // 🔥 새 학급에 기본 데이터 복사 (CLASS2025에서 직업, 아이템 복사)
        try {
          const copyResult = await copyDefaultDataToNewClass(trimmedCode);
          if (copyResult.success) {
            alert(`학급 코드 '${trimmedCode}'가 추가되었습니다!\n\n기본 데이터 복사 완료:\n- 직업 ${copyResult.results.jobs.copied}개\n- 상점 아이템 ${copyResult.results.storeItems.copied}개`);
          } else {
            alert(`학급 코드 '${trimmedCode}'가 추가되었습니다.\n\n⚠️ 기본 데이터 복사 중 오류: ${copyResult.error}\n(나중에 직접 추가해주세요)`);
          }
        } catch (copyError) {
          logger.error("기본 데이터 복사 오류:", copyError);
          alert(`학급 코드 '${trimmedCode}'가 추가되었습니다.\n\n⚠️ 기본 데이터 복사 실패\n(나중에 직접 추가해주세요)`);
        }

        // 낙관적 업데이트
        setClassCodes(prev => [...prev, trimmedCode]);

        // 캐시 무효화
        dataCache.invalidate('classCodes');

        return true;
      } catch (error) {
        logger.error("학급 코드 추가 오류:", error);
        alert("학급 코드 추가 중 오류 발생");
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    [classCodes]
  );

  const handleRemoveClassCode = useCallback(
    async (codeToRemove) => {
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
          (code) => code !== codeToRemove
        );

        batchManager.addWrite({
          type: 'update',
          ref: codeRef,
          data: {
            validCodes: updatedCodes,
            updatedAt: serverTimestamp(),
          }
        });

        alert("학급 코드가 삭제되었습니다.");

        // 낙관적 업데이트
        setClassCodes(prev => prev.filter(code => code !== codeToRemove));

        // 캐시 무효화
        dataCache.invalidate('classCodes');

        return true;
      } catch (error) {
        logger.error("학급 코드 삭제 오류:", error);
        alert("학급 코드 삭제 중 오류 발생: " + error.message);
        return false;
      } finally {
        setAppLoading(false);
      }
    },
    []
  );

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

    if (!window.confirm(`'${userDoc.classCode}' 클래스의 모든 학생들의 '오늘의 할일' 완료 기록을 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      logger.log("[Dashboard] 사용자가 리셋을 취소했습니다.");
      return;
    }

    logger.log(`[Dashboard] ${userDoc.classCode} 클래스 리셋 실행...`);
    setAppLoading(true);
    try {
      const manualResetClassTasks = manualResetClassTasksFn;
      const result = await manualResetClassTasks({ classCode: userDoc.classCode });
      logger.log("[Dashboard] 클라우드 함수 결과 수신:", result.data);

      if (result.data.success) {
        // 성공 시, 새로고침 대신 클라이언트 상태를 직접 초기화하여 즉시 UI에 반영

        // 공통 할일 및 직업 할일 상태 초기화
        setUserDoc(prevDoc => ({
          ...prevDoc,
          completedTasks: {},      // 공통 할일 리셋
          completedJobTasks: {},   // 직업 할일 리셋
        }));

        // localStorage에 마지막 리셋 날짜 저장
        const today = new Date().toDateString();
        localStorage.setItem('lastTaskResetDate', today);

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

  const userId = user?.uid;
  // 닉네임 우선 표시 (닉네임 -> 이름 -> displayName -> "사용자")
  const userNickname = userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

  return (
    <div className="min-h-full w-full bg-[#0a0a12] px-2 pt-1 pb-0">
      {/* 페이지 헤더 - 컴팩트 버전 (관리자 탭 모드가 아닐 때만 표시) */}
      {!adminTabMode && (
        <section className="bg-[#14142380] backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-lg border border-cyan-900/30 flex flex-col md:flex-row md:items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-cyan-900/30 rounded-md flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-500/30">
              <ListTodo className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <h2 className="text-sm md:text-base font-bold text-white">오늘의 할일</h2>
              <p className="text-[11px] text-slate-400">{userNickname}님, 오늘도 화이팅!</p>
            </div>
          </div>
          {isAdmin?.() && viewMode === "list" && !showAdminSettingsModal && (
            <div className="flex flex-wrap gap-1.5">
              <ActionButton variant="primary" icon={Settings} onClick={() => handleOpenAdminSettings("generalSettings")} size="sm" className="!bg-gradient-to-r !from-red-500 !to-orange-500 !text-white !font-bold !shadow-lg !shadow-red-500/30 !border-2 !border-red-400 !text-sm">⚙️ 관리자 기능</ActionButton>
              <ActionButton variant="success" icon={RefreshCw} onClick={handleForceRefresh} size="sm">새로고침</ActionButton>
              <ActionButton variant="danger" icon={RotateCcw} onClick={handleManualTaskReset} size="sm" title="이 클래스의 모든 사용자 할일을 리셋합니다">할일 리셋</ActionButton>
            </div>
          )}
          {viewMode === "selectJob" && (
            <ActionButton variant="ghost" icon={ChevronLeft} onClick={handleCancelForm}>뒤로가기</ActionButton>
          )}
        </section>
      )}

      {viewMode === "list" && !showAdminSettingsModal && !adminTabMode && (
        <>
          {/* 나의 직업 할일 섹션 */}
          <div className="bg-[#14142380] backdrop-blur-sm rounded-2xl shadow-lg border border-cyan-900/30 overflow-hidden mb-6">
            {/* 나의 직업 할일 헤더 - 색상 배경 */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-white" />
                <h3 className="text-base md:text-lg font-bold text-white">나의 직업 할일</h3>
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
                      onEarnCoupon={(taskId, jobId, isJobTask, cardType, rewardAmount) =>
                        handleTaskEarnCoupon(taskId, jobId, isJobTask, cardType, rewardAmount)
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
              <div className="mt-6 rounded-xl overflow-hidden border border-emerald-900/30 bg-[#14142380] backdrop-blur-sm">
                {/* 공통 할일 헤더 - 색상 배경 */}
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-5 h-5 text-white" />
                    <h3 className="text-base md:text-lg font-bold text-white">공통 할일</h3>
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

                <div className="p-4 md:p-6 bg-[#0a0a12]/50">
                  <CommonTaskList
                    tasks={commonTasksWithUserProgress}
                    isAdmin={isAdmin?.()}
                    onEarnCoupon={(taskId, jobId, isJobTask, cardType, rewardAmount) =>
                      handleTaskEarnCoupon(taskId, jobId, isJobTask, cardType, rewardAmount)
                    }
                    onEditTask={(taskId) => handleEditTask(commonTasks.find(t => t.id === taskId), null)}
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
          adminEditingTask={editingTask}
          setAdminEditingTask={setEditingTask}
          handleSaveTask={handleSaveTask}
          handleEditTask={handleEditTask}
          handleDeleteTask={handleDeleteTask}
          taskFormJobId={currentJobIdForTask}
          taskFormIsJobTask={isJobTaskForForm}
          handleAddTaskClick={handleAddTaskClick}
        />
      )}

    </div>
  );
}

export default Dashboard;