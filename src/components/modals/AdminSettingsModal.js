// src/AdminSettingsModal.js
// ========================================
// 통합 관리자 설정 모달 v2.0
// ========================================
// 권한 체계:
// - isSuperAdmin (최고 관리자): 시스템 전체 관리, 모든 학급 접근, 학급 코드 관리
// - isAdmin (관리자): 자기 학급만 관리, 금융/시장/학생/직업/할일 관리
// ========================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, setDoc, getDocFromServer } from "firebase/firestore";
import {
  db,
  functions,
  firebaseDoc,
  firebaseCollection,
  firebaseGetSingleDoc,
  firebaseUpdateDoc,
  firebaseSetDoc,
  firebaseGetDocs,
  serverTimestamp,
  increment,
  writeBatch,
  query as firebaseQuery,
  where as firebaseWhere,
} from "../../firebase";

// 최적화된 데이터 훅들
import {
  useOptimizedAdminSettings,
  useOptimizedStudents,
  useOptimizedSalarySettings,
  useOptimizedSystemManagement,
  useBatchPaySalaries,
  useAdminDataPreloader,
} from "../../hooks/useOptimizedAdminData";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../services/optimizedFirebaseService";

// 시스템 모니터링 컴포넌트
import SystemMonitoring from "../../pages/admin/SystemMonitoring";

// 데이터베이스 관리 컴포넌트
import AdminDatabase from "../../pages/admin/AdminDatabase";

import { useCurrency } from "../../contexts/CurrencyContext";
import { logger } from "../../utils/logger";
// 주식 초기화를 위한 기본 데이터
const initialStocks = [
  {
    id: "KP",
    name: "코딩 파트너",
    price: 10000,
    history: [{ price: 10000, timestamp: new Date() }],
  },
  {
    id: "SS",
    name: "삼성전자",
    price: 80000,
    history: [{ price: 80000, timestamp: new Date() }],
  },
  {
    id: "LG",
    name: "LG에너지솔루션",
    price: 350000,
    history: [{ price: 350000, timestamp: new Date() }],
  },
  {
    id: "SK",
    name: "SK하이닉스",
    price: 230000,
    history: [{ price: 230000, timestamp: new Date() }],
  },
];

// 학급 데이터 삭제 컴포넌트
const ClassDataDeletionSection = ({ userClassCode, isAdmin, isSuperAdmin }) => {
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleDeleteClassData = async () => {
    if (!userClassCode) {
      alert("학급 코드가 없습니다.");
      return;
    }

    if (deleteConfirmText !== "삭제") {
      alert("'삭제'를 정확히 입력해주세요.");
      return;
    }

    // 이중 확인
    const finalConfirm = window.confirm(
      `정말로 '${userClassCode}' 학급의 모든 학생 데이터를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며 다음 데이터가 영구 삭제됩니다:\n- 학생 계정 (role: 'student')\n- 활동 로그\n- 거래 내역\n\n선생님(admin) 계정은 유지됩니다.`,
    );

    if (!finalConfirm) {
      return;
    }

    setIsDeleting(true);

    try {
      logger.log(`[ClassDataDeletion] ${userClassCode} 학급 데이터 삭제 시작`);

      // 1. 학생 계정 조회 (role === 'student' AND classCode === userClassCode)
      const usersRef = firestoreCollection(db, "users");
      const studentsQuery = firebaseQuery(
        usersRef,
        firebaseWhere("classCode", "==", userClassCode),
        firebaseWhere("role", "==", "student"),
      );
      const studentsSnapshot = await firebaseGetDocs(studentsQuery);

      logger.log(
        `[ClassDataDeletion] 삭제할 학생 수: ${studentsSnapshot.size}명`,
      );

      // 2. 활동 로그 조회
      const activityLogsRef = firestoreCollection(db, "activity_logs");
      const activityLogsQuery = firebaseQuery(
        activityLogsRef,
        firebaseWhere("classCode", "==", userClassCode),
      );
      const activityLogsSnapshot = await firebaseGetDocs(activityLogsQuery);

      logger.log(
        `[ClassDataDeletion] 삭제할 활동 로그: ${activityLogsSnapshot.size}개`,
      );

      // 3. 거래 내역 조회 (학생들의 userId로 조회)
      const studentIds = studentsSnapshot.docs.map((doc) => doc.id);
      let transactionsToDelete = [];

      if (studentIds.length > 0) {
        // Firestore 'in' 쿼리는 최대 10개까지만 지원하므로 배치 처리
        const batches = [];
        for (let i = 0; i < studentIds.length; i += 10) {
          batches.push(studentIds.slice(i, i + 10));
        }

        for (const batch of batches) {
          const transactionsRef = firestoreCollection(db, "transactions");
          const transactionsQuery = firebaseQuery(
            transactionsRef,
            firebaseWhere("userId", "in", batch),
          );
          const transactionsSnapshot = await firebaseGetDocs(transactionsQuery);
          transactionsToDelete.push(...transactionsSnapshot.docs);
        }
      }

      logger.log(
        `[ClassDataDeletion] 삭제할 거래 내역: ${transactionsToDelete.length}개`,
      );

      // 4. 배치 삭제 실행 (Firestore 배치는 최대 500개 제한)
      const allDocsToDelete = [
        ...studentsSnapshot.docs,
        ...activityLogsSnapshot.docs,
        ...transactionsToDelete,
      ];

      logger.log(
        `[ClassDataDeletion] 총 삭제할 문서: ${allDocsToDelete.length}개`,
      );

      // 배치 단위로 삭제
      const BATCH_SIZE = 500;
      for (let i = 0; i < allDocsToDelete.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const batchDocs = allDocsToDelete.slice(i, i + BATCH_SIZE);

        batchDocs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });

        await batch.commit();
        logger.log(
          `[ClassDataDeletion] 배치 ${Math.floor(i / BATCH_SIZE) + 1} 삭제 완료`,
        );
      }

      alert(
        `학급 데이터 삭제 완료!\n\n삭제된 데이터:\n- 학생 계정: ${studentsSnapshot.size}명\n- 활동 로그: ${activityLogsSnapshot.size}개\n- 거래 내역: ${transactionsToDelete.length}개`,
      );

      logger.log(`[ClassDataDeletion] ${userClassCode} 학급 데이터 삭제 완료`);

      // 초기화
      setDeleteConfirmText("");
      setShowConfirmation(false);
    } catch (error) {
      logger.error("[ClassDataDeletion] 삭제 중 오류:", error);
      alert(
        `오류 발생: ${error.message}\n\n일부 데이터만 삭제되었을 수 있습니다. 다시 시도해주세요.`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin && !isSuperAdmin) {
    return null;
  }

  return (
    <div className="section-card mt-6 border-2 border-red-500/50 bg-red-900/10">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">⚠️</span>
        <h3 className="text-xl font-bold text-red-400">
          위험 구역: 학급 데이터 삭제
        </h3>
      </div>

      <div className="bg-red-900/20 rounded-lg p-4 mb-4 border border-red-500/30">
        <p className="text-sm text-red-200 mb-2">
          <strong>이 작업은 되돌릴 수 없습니다!</strong>
        </p>
        <p className="text-sm text-red-200 mb-2">
          개인정보 파기 의무를 위해 학년 말에 사용하세요.
        </p>
        <p className="text-sm text-slate-600 dark:text-gray-300 mb-2">삭제 대상:</p>
        <ul className="text-sm text-slate-600 dark:text-gray-300 list-disc list-inside ml-2 space-y-1">
          <li>학생 계정 (role: 'student')</li>
          <li>활동 로그 (activity_logs)</li>
          <li>거래 내역 (transactions)</li>
        </ul>
        <p className="text-sm text-green-300 mt-2">
          ✓ 선생님(admin) 계정은 유지됩니다.
        </p>
        <p className="text-sm text-green-300">
          ✓ 직업, 할일, 상점 아이템 설정은 유지됩니다.
        </p>
      </div>

      {!showConfirmation ? (
        <button
          onClick={() => setShowConfirmation(true)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-slate-800 dark:text-white rounded-lg font-medium transition-colors"
        >
          학급 데이터 삭제 시작
        </button>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-2">
              확인을 위해 "<strong className="text-red-400">삭제</strong>"를
              정확히 입력하세요:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="삭제"
              disabled={isDeleting}
              className="w-full px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDeleteClassData}
              disabled={isDeleting || deleteConfirmText !== "삭제"}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                deleteConfirmText === "삭제" && !isDeleting
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {isDeleting ? "삭제 중..." : "최종 삭제 실행"}
            </button>
            <button
              onClick={() => {
                setShowConfirmation(false);
                setDeleteConfirmText("");
              }}
              disabled={isDeleting}
              className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminSettingsModal = ({
  isAdmin,
  isSuperAdmin,
  userClassCode,
  showAdminSettingsModal,
  setShowAdminSettingsModal,
  adminSelectedMenu,
  setAdminSelectedMenu,

  // 목표 설정 관련 props
  newGoalAmount,
  setNewGoalAmount,
  adminCouponValue,
  setAdminCouponValue,
  handleSaveAdminSettings,

  // 직업 관리 관련 props
  jobs,
  adminNewJobTitle,
  setAdminNewJobTitle,
  adminEditingJob,
  setAdminEditingJob,
  handleSaveJob,
  handleDeleteJob,
  handleEditJob,

  // 할일 관리 관련 props
  commonTasks,
  showAddTaskForm,
  setShowAddTaskForm,
  adminNewTaskName,
  setAdminNewTaskName,
  adminNewTaskReward,
  setAdminNewTaskReward,
  adminNewTaskMaxClicks,
  setAdminNewTaskMaxClicks,
  adminNewTaskRequiresApproval,
  setAdminNewTaskRequiresApproval,
  adminEditingTask,
  setAdminEditingTask,
  handleSaveTask,
  handleEditTask,
  handleDeleteTask,
  taskFormJobId,
  setTaskFormJobId,
  taskFormIsJobTask,
  setTaskFormIsJobTask,
  handleAddTaskClick,
  handleInlineAddTask,
  handleInlineEditTask,

  // 학급 코드 관리 관련 props
  classCodes = [],
  onAddClassCode,
  onRemoveClassCode,
}) => {
  const [newClassCode, setNewClassCode] = useState("");
  const [classCodeOperationLoading, setClassCodeOperationLoading] =
    useState(false);
  const [classMembers, setClassMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showEditStudentJobsModal, setShowEditStudentJobsModal] =
    useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [tempSelectedJobIds, setTempSelectedJobIds] = useState([]);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const [isPayingSalary, setIsPayingSalary] = useState(false);
  const [lastSalaryPaidDate, setLastSalaryPaidDate] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectAllStudents, setSelectAllStudents] = useState(false);
  const [error, setError] = useState("");

  // ========================================
  // 금융 상품 관리 상태
  // ========================================
  const [depositProducts, setDepositProducts] = useState([]);
  const [savingProducts, setSavingProducts] = useState([]);
  const [loanProducts, setLoanProducts] = useState([]);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPeriod, setNewProductPeriod] = useState("");
  const [newProductRate, setNewProductRate] = useState("");
  const [financialSubTab, setFinancialSubTab] = useState("deposit");
  const [financialMessage, setFinancialMessage] = useState(null);

  // 인라인 할일 추가 상태 (jobId or "common")
  const [inlineAddingFor, setInlineAddingFor] = useState(null);
  const [inlineTaskName, setInlineTaskName] = useState("");
  const [inlineTaskMaxClicks, setInlineTaskMaxClicks] = useState("5");

  // 인라인 할일 수정 상태
  const [inlineEditingTaskId, setInlineEditingTaskId] = useState(null);
  const [inlineEditName, setInlineEditName] = useState("");
  const [inlineEditMaxClicks, setInlineEditMaxClicks] = useState("5");

  // 통합 탭 서브탭 상태 (sessionStorage로 새로고침 복원)
  const [jobTaskSubTab, setJobTaskSubTab] = useState(() => {
    try { return sessionStorage.getItem("alchan_adminModal_subtab_job") || "job"; } catch { return "job"; }
  });
  const [studentMemberSubTab, setStudentMemberSubTab] = useState(() => {
    try { return sessionStorage.getItem("alchan_adminModal_subtab_student") || "student"; } catch { return "student"; }
  });
  const [financeMarketSubTab, setFinanceMarketSubTab] = useState(() => {
    try { return sessionStorage.getItem("alchan_adminModal_subtab_finance") || "financial"; } catch { return "financial"; }
  });
  const [systemSubTab, setSystemSubTab] = useState(() => {
    try { return sessionStorage.getItem("alchan_adminModal_subtab_system") || "database"; } catch { return "database"; }
  });

  // 서브탭 변경 시 sessionStorage 동기화
  useEffect(() => {
    try { sessionStorage.setItem("alchan_adminModal_subtab_job", jobTaskSubTab); } catch { /* ignore */ }
  }, [jobTaskSubTab]);
  useEffect(() => {
    try { sessionStorage.setItem("alchan_adminModal_subtab_student", studentMemberSubTab); } catch { /* ignore */ }
  }, [studentMemberSubTab]);
  useEffect(() => {
    try { sessionStorage.setItem("alchan_adminModal_subtab_finance", financeMarketSubTab); } catch { /* ignore */ }
  }, [financeMarketSubTab]);
  useEffect(() => {
    try { sessionStorage.setItem("alchan_adminModal_subtab_system", systemSubTab); } catch { /* ignore */ }
  }, [systemSubTab]);

  // ========================================
  // 시장 제어 상태
  // ========================================
  const [marketStatus, setMarketStatus] = useState({ isOpen: false });
  const [marketMessage, setMarketMessage] = useState("");
  const [isMarketDataLoaded, setIsMarketDataLoaded] = useState(false);
  const marketStatusCache = useRef(null);
  const CACHE_DURATION = 5 * 60 * 1000; // 5분

  // ========================================
  // 파킹 통장 상태
  // ========================================
  const [parkingInterestRate, setParkingInterestRate] = useState(0.1);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [parkingMessage, setParkingMessage] = useState(null);

  // Firebase Functions
  const toggleMarketManually = httpsCallable(functions, "toggleMarketManually");

  // 급여 설정 상태
  const [salarySettings, setSalarySettings] = useState({
    taxRate: 0.1, // 10% 세율
    salaryIncreaseRate: 0.03, // 3% 주급 인상률
  });
  const [tempTaxRate, setTempTaxRate] = useState("10");
  const [tempSalaryIncreaseRate, setTempSalaryIncreaseRate] = useState("3");
  const [salarySettingsLoading, setSalarySettingsLoading] = useState(false);

  // 화폐 단위 설정
  const { currencyUnit, setCurrencyUnitLocal } = useCurrency();
  const [tempCurrencyUnit, setTempCurrencyUnit] = useState(currencyUnit);
  const [currencyUnitSaving, setCurrencyUnitSaving] = useState(false);

  // currencyUnit이 외부에서 변경되면 tempCurrencyUnit도 동기화
  useEffect(() => {
    setTempCurrencyUnit(currencyUnit);
  }, [currencyUnit]);

  const handleSaveCurrencyUnit = useCallback(async () => {
    if (!db || !tempCurrencyUnit.trim()) {
      alert("화폐 단위를 입력해주세요.");
      return;
    }

    setCurrencyUnitSaving(true);
    try {
      const settingsRef = firebaseDoc(db, "settings", "mainSettings");
      await firebaseUpdateDoc(settingsRef, {
        currencyUnit: tempCurrencyUnit.trim(),
        updatedAt: serverTimestamp(),
      }).catch(async () => {
        // 문서가 없으면 setDoc으로 생성
        await firebaseSetDoc(
          settingsRef,
          {
            currencyUnit: tempCurrencyUnit.trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      });

      setCurrencyUnitLocal(tempCurrencyUnit.trim());
      alert("화폐 단위가 저장되었습니다.");
    } catch (error) {
      logger.error("화폐 단위 저장 오류:", error);
      alert("화폐 단위 저장 중 오류가 발생했습니다: " + error.message);
    } finally {
      setCurrencyUnitSaving(false);
    }
  }, [tempCurrencyUnit, setCurrencyUnitLocal]);

  // 최적화된 데이터 훅들
  const queryClient = useQueryClient();
  const studentsQuery = useOptimizedStudents();
  const salarySettingsQuery = useOptimizedSalarySettings();
  const systemManagementQuery = useOptimizedSystemManagement();
  const generalSettingsQuery = useOptimizedAdminSettings("generalSettings");
  const batchPaySalariesMutation = useBatchPaySalaries();
  const { preloadAdminData } = useAdminDataPreloader();

  // 급여 설정 로드
  const loadSalarySettings = useCallback(async () => {
    if (!db) return;

    try {
      // 학급별 급여 설정을 사용하거나, 없으면 전역 설정 사용
      const classSettingsRef = userClassCode
        ? firebaseDoc(db, "settings", `salarySettings_${userClassCode}`)
        : firebaseDoc(db, "settings", "salarySettings");
      const settingsSnap = await firebaseGetSingleDoc(classSettingsRef);

      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        // ⚠️ || 0.1 fallback 제거 — 사용자가 명시적으로 0%로 저장한 경우도 보존
        // taxRate가 undefined/null인 경우만 기본값 사용 (Number()는 null→0 변환 방지 위해 ??)
        const taxRate = data.taxRate ?? 0.1;
        const salaryIncreaseRate = data.salaryIncreaseRate ?? 0.03;
        const settings = { taxRate, salaryIncreaseRate };
        setSalarySettings(settings);
        setTempTaxRate(String((taxRate * 100).toFixed(1)));
        setTempSalaryIncreaseRate(String((salaryIncreaseRate * 100).toFixed(1)));

        if (data.lastPaidDate) {
          setLastSalaryPaidDate(data.lastPaidDate.toDate());
        }
      }
      // ⚠️ 문서가 없어도 자동으로 setDoc(기본값) 하지 않음
      // 사유: 다른 탭/race로 잘못 호출되면 사용자가 저장한 값이 0.1로 덮어써질 수 있음.
      // 문서가 없으면 state는 초기값(taxRate:0.1) 그대로 두고, 사용자가 명시적으로
      // 저장 버튼을 눌렀을 때만 DB에 기록한다.
    } catch (error) {
      logger.error("급여 설정 로드 오류:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userClassCode]); // db는 외부 스코프 값으로 의존성에서 제외

  // 급여 설정 저장
  const handleSaveSalarySettings = useCallback(async () => {
    if (!db) {
      alert("데이터베이스 연결 오류.");
      return;
    }

    const taxRateNum = parseFloat(tempTaxRate);
    const increaseRateNum = parseFloat(tempSalaryIncreaseRate);

    if (isNaN(taxRateNum) || taxRateNum < 0 || taxRateNum > 100) {
      alert("세율은 0~100 사이의 숫자여야 합니다.");
      return;
    }

    if (
      isNaN(increaseRateNum) ||
      increaseRateNum < 0 ||
      increaseRateNum > 100
    ) {
      alert("주급 인상률은 0~100 사이의 숫자여야 합니다.");
      return;
    }

    setSalarySettingsLoading(true);

    try {
      const classSettingsRef = userClassCode
        ? firebaseDoc(db, "settings", `salarySettings_${userClassCode}`)
        : firebaseDoc(db, "settings", "salarySettings");
      const newSettings = {
        taxRate: taxRateNum / 100,
        salaryIncreaseRate: increaseRateNum / 100,
        classCode: userClassCode || null,
        updatedAt: serverTimestamp(),
      };

      // setDoc + merge:true 로 문서가 없을 때도 자동 생성 (updateDoc은 문서 부재 시 실패)
      await firebaseSetDoc(classSettingsRef, newSettings, { merge: true });

      // ⚠️ Firestore offline persistence는 setDoc을 local cache에만 즉시 반영하고
      // 서버 commit은 background로 진행. rules 위반 등으로 서버 reject되면 silent fail.
      // → 서버에서 직접 read-back 하여 실제 저장 여부 검증.
      let serverVerified = false;
      try {
        const verifySnap = await getDocFromServer(classSettingsRef);
        if (verifySnap.exists()) {
          const v = verifySnap.data();
          const dt = Math.abs((v.taxRate ?? -1) - newSettings.taxRate);
          const ds = Math.abs((v.salaryIncreaseRate ?? -1) - newSettings.salaryIncreaseRate);
          serverVerified = dt < 0.0001 && ds < 0.0001;
        }
      } catch (verifyErr) {
        logger.warn("급여 설정 서버 검증 read 실패:", verifyErr);
      }

      if (!serverVerified) {
        alert(
          "급여 설정이 서버에 반영되지 않았습니다. 네트워크/권한을 확인하고 다시 시도해주세요.",
        );
        return;
      }

      // 1) 표시용 state 갱신
      setSalarySettings({
        taxRate: newSettings.taxRate,
        salaryIncreaseRate: newSettings.salaryIncreaseRate,
      });

      // 2) 입력 박스도 정규화된 값(소수점 한 자리)으로 동기화
      setTempTaxRate(String((newSettings.taxRate * 100).toFixed(1)));
      setTempSalaryIncreaseRate(
        String((newSettings.salaryIncreaseRate * 100).toFixed(1)),
      );

      // 3) react-query 캐시 무효화 — 다른 화면(주급 지급 등)이 stale 옛 값 사용 방지
      try {
        queryClient.invalidateQueries({
          queryKey: queryKeys.salarySettings(userClassCode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.adminSettings(userClassCode, "salarySettings"),
        });
      } catch (qErr) {
        logger.warn("queryClient invalidate 실패(무시):", qErr);
      }

      alert("급여 설정이 저장되었습니다.");
    } catch (error) {
      logger.error("급여 설정 저장 오류:", error);
      alert("급여 설정 저장 중 오류가 발생했습니다: " + error.message);
    } finally {
      setSalarySettingsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userClassCode, tempTaxRate, tempSalaryIncreaseRate, queryClient]); // db와 salarySettings.x는 외부 스코프 값으로 의존성에서 제외

  // 월급 계산 함수 (세금 공제 포함, 대통령/국무총리 보너스 반영)
  const calculateSalary = useCallback(
    (selectedJobIds, includesTax = false) => {
      if (!Array.isArray(selectedJobIds) || selectedJobIds.length === 0) {
        return { gross: 0, tax: 0, net: 0 };
      }

      const baseSalary = 2000000;
      const additionalSalary = 500000;
      const PRESIDENT_BONUS = 2000000;
      const PM_BONUS = 1000000;

      const grossSalary =
        baseSalary + Math.max(0, selectedJobIds.length - 1) * additionalSalary;

      let bonus = 0;
      if (Array.isArray(jobs)) {
        for (const jobId of selectedJobIds) {
          const job = jobs.find((j) => j.id === jobId);
          if (job?.title === "대통령") bonus += PRESIDENT_BONUS;
          else if (job?.title === "국무총리") bonus += PM_BONUS;
        }
      }
      const totalGross = grossSalary + bonus;

      if (!includesTax) {
        return totalGross;
      }

      const tax = Math.floor(totalGross * salarySettings.taxRate);
      const netSalary = totalGross - tax;

      return { gross: totalGross, tax, net: netSalary };
    },
    [salarySettings.taxRate, jobs],
  );

  // 직업 편집 핸들러
  const handleJobEdit = useCallback(
    (job) => {
      logger.log("[AdminSettingsModal] 직업 편집 클릭:", job);
      if (handleEditJob && typeof handleEditJob === "function") {
        handleEditJob(job);
      } else {
        logger.error(
          "[AdminSettingsModal] handleEditJob 함수가 정의되지 않았습니다.",
        );
        alert("직업 편집 기능을 사용할 수 없습니다.");
      }
    },
    [handleEditJob],
  );

  // 직업 삭제 핸들러
  const handleJobDelete = useCallback(
    (jobId) => {
      logger.log("[AdminSettingsModal] 직업 삭제 클릭:", jobId);
      if (handleDeleteJob && typeof handleDeleteJob === "function") {
        handleDeleteJob(jobId);
      } else {
        logger.error(
          "[AdminSettingsModal] handleDeleteJob 함수가 정의되지 않았습니다.",
        );
        alert("직업 삭제 기능을 사용할 수 없습니다.");
      }
    },
    [handleDeleteJob],
  );

  // 할일 편집 핸들러
  const handleTaskEdit = useCallback(
    (task, jobId = null) => {
      logger.log("[AdminSettingsModal] 할일 편집 클릭:", task, "jobId:", jobId);
      if (handleEditTask && typeof handleEditTask === "function") {
        handleEditTask(task, jobId);
      } else {
        logger.error(
          "[AdminSettingsModal] handleEditTask 함수가 정의되지 않았습니다.",
        );
        alert("할일 편집 기능을 사용할 수 없습니다.");
      }
    },
    [handleEditTask],
  );

  // 할일 삭제 핸들러
  const handleTaskDelete = useCallback(
    (taskId, jobId = null) => {
      logger.log(
        "[AdminSettingsModal] 할일 삭제 클릭:",
        taskId,
        "jobId:",
        jobId,
      );
      if (handleDeleteTask && typeof handleDeleteTask === "function") {
        handleDeleteTask(taskId, jobId);
      } else {
        logger.error(
          "[AdminSettingsModal] handleDeleteTask 함수가 정의되지 않았습니다.",
        );
        alert("할일 삭제 기능을 사용할 수 없습니다.");
      }
    },
    [handleDeleteTask],
  );

  // 할일 추가 핸들러 (관리자 설정 모달 폼 열기 — 수정 시 사용)
  const handleTaskAdd = useCallback(
    (jobId = null, isJobTask = false) => {
      if (handleAddTaskClick && typeof handleAddTaskClick === "function") {
        handleAddTaskClick(jobId, isJobTask);
      }
    },
    [handleAddTaskClick],
  );

  // 인라인 할일 추가 저장
  const handleInlineTaskSave = useCallback(async (targetId) => {
    const name = inlineTaskName.trim();
    const maxClicks = parseInt(inlineTaskMaxClicks, 10);
    if (!name) { alert("할일 이름을 입력하세요."); return; }
    if (isNaN(maxClicks) || maxClicks <= 0) { alert("최대 횟수는 1 이상이어야 합니다."); return; }
    if (handleInlineAddTask) {
      await handleInlineAddTask(name, maxClicks, targetId === "common" ? null : targetId);
    }
    setInlineAddingFor(null);
    setInlineTaskName("");
    setInlineTaskMaxClicks("5");
  }, [inlineTaskName, inlineTaskMaxClicks, handleInlineAddTask]);

  // 인라인 할일 수정 저장
  const handleInlineEditSave = useCallback(async (taskId, jobId) => {
    const name = inlineEditName.trim();
    const maxClicks = parseInt(inlineEditMaxClicks, 10);
    if (!name) { alert("할일 이름을 입력하세요."); return; }
    if (isNaN(maxClicks) || maxClicks <= 0) { alert("최대 횟수는 1 이상이어야 합니다."); return; }
    if (handleInlineEditTask) {
      await handleInlineEditTask(taskId, name, maxClicks, jobId || null);
    }
    setInlineEditingTaskId(null);
    setInlineEditName("");
    setInlineEditMaxClicks("5");
  }, [inlineEditName, inlineEditMaxClicks, handleInlineEditTask]);

  // 학생 목록 로드 함수 (Class/students 구조와 users 구조 모두 지원)
  const loadStudents = useCallback(async () => {
    if (!db) {
      logger.error("loadStudents: Firestore 데이터베이스 연결이 없습니다.");
      setError("데이터베이스 연결 오류로 학생 정보를 가져올 수 없습니다.");
      setStudents([]);
      setStudentsLoading(false);
      return;
    }

    setStudentsLoading(true);
    setError("");

    try {
      let studentsList = [];

      if (!isSuperAdmin && !userClassCode) {
        setError("학급 코드가 설정되지 않아 학생 정보를 가져올 수 없습니다.");
        setStudents([]);
        setStudentsLoading(false);
        return;
      }

      // 1. Class/{classCode}/students 구조에서 시도
      if (!isSuperAdmin && userClassCode) {
        try {
          const classStudentsRef = firebaseCollection(
            db,
            "Class",
            userClassCode,
            "students",
          );
          const classStudentsSnapshot = await firebaseGetDocs(classStudentsRef);

          classStudentsSnapshot.forEach((doc) => {
            const userData = doc.data();
            studentsList.push({
              id: doc.id,
              nickname: userData.nickname || userData.name || "이름 없음",
              name: userData.name || "",
              email: userData.email || "",
              classCode: userClassCode,
              selectedJobIds: userData.selectedJobIds || [],
              cash: userData.money || userData.cash || 0, // money 필드도 확인
              lastSalaryDate: userData.lastSalaryDate
                ? userData.lastSalaryDate.toDate()
                : null,
              lastGrossSalary: userData.lastGrossSalary || 0,
              lastTaxAmount: userData.lastTaxAmount || 0,
              lastNetSalary: userData.lastNetSalary || 0,
              totalSalaryReceived: userData.totalSalaryReceived || 0,
            });
          });
        } catch (classError) {
          // Class 구조에서 로드 실패 시 users 구조에서 재시도
        }
      }

      // 2. users 컬렉션에서 시도 (Class 구조에서 못 찾았거나 최고 관리자인 경우)
      if (studentsList.length === 0) {
        const usersRef = firebaseCollection(db, "users");
        let queryRef;

        if (!isSuperAdmin && userClassCode) {
          queryRef = firebaseQuery(
            usersRef,
            firebaseWhere("classCode", "==", userClassCode),
          );
        } else if (isSuperAdmin) {
          queryRef = usersRef;
        }

        const querySnapshot = await firebaseGetDocs(queryRef);

        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          if (!userData.isAdmin && !userData.isSuperAdmin) {
            studentsList.push({
              id: doc.id,
              nickname: userData.nickname || userData.name || "이름 없음",
              name: userData.name || "",
              email: userData.email || "",
              classCode: userData.classCode || "미지정",
              selectedJobIds: userData.selectedJobIds || [],
              cash: userData.cash || 0,
              lastSalaryDate: userData.lastSalaryDate
                ? userData.lastSalaryDate.toDate()
                : null,
              lastGrossSalary: userData.lastGrossSalary || 0,
              lastTaxAmount: userData.lastTaxAmount || 0,
              lastNetSalary: userData.lastNetSalary || 0,
              totalSalaryReceived: userData.totalSalaryReceived || 0,
            });
          }
        });
      }

      setStudents(studentsList);

      try {
        const classSettingsRef = userClassCode
          ? firebaseDoc(db, "settings", `salarySettings_${userClassCode}`)
          : firebaseDoc(db, "settings", "salarySettings");
        const settingsDoc = await firebaseGetSingleDoc(classSettingsRef);
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setLastSalaryPaidDate(
            data.lastPaidDate ? data.lastPaidDate.toDate() : null,
          );
          setSalarySettings({
            taxRate: data.taxRate || 0.1,
            salaryIncreaseRate: data.salaryIncreaseRate || 0.03,
          });
        } else {
          setLastSalaryPaidDate(null);
        }
      } catch (settingsError) {
        logger.error("급여 설정 로드 오류:", settingsError);
        setLastSalaryPaidDate(null);
      }

      setSelectedStudentIds([]);
      setSelectAllStudents(false);
    } catch (error) {
      logger.error("loadStudents: 학생 목록 로드 오류:", error);
      setError("학생 목록을 불러오는 중 오류가 발생했습니다: " + error.message);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userClassCode]); // db는 외부 스코프 값으로 의존성에서 제외

  // 최적화된 선택 학생 급여 지급
  const handlePaySalariesToSelected = async () => {
    if (selectedStudentIds.length === 0) {
      alert("선택된 학생이 없습니다.");
      return;
    }

    const currentSalarySettings =
      salarySettingsQuery.data?.settings || salarySettings;

    if (
      !window.confirm(
        `선택된 ${selectedStudentIds.length}명의 학생에게 주급을 지급하시겠습니까?\n(세금 ${(currentSalarySettings.taxRate * 100).toFixed(1)}% 공제 후 지급)`,
      )
    ) {
      return;
    }

    setIsPayingSalary(true);

    try {
      const result = await batchPaySalariesMutation.mutateAsync({
        studentIds: selectedStudentIds,
        payAll: false,
      });

      if (result.success) {
        const { summary } = result;
        alert(
          `주급 지급 완료!\n${summary.totalStudentsPaid}명의 학생에게 지급\n총 급여: ${(
            summary.totalGrossPaid / 10000
          ).toFixed(0)}만원\n세금 공제: ${(
            summary.totalTaxDeducted / 10000
          ).toFixed(0)}만원\n실제 지급: ${(
            summary.totalNetPaid / 10000
          ).toFixed(0)}만원`,
        );

        // 선택 상태 초기화 + 학생 목록 새로고침
        setSelectedStudentIds([]);
        setSelectAllStudents(false);
        loadStudents(); // 잔액 갱신
      } else {
        alert(result.message || "주급 지급에 실패했습니다.");
      }
    } catch (error) {
      logger.error("[AdminSettingsModal] 선택된 학생 주급 지급 오류:", error);
      alert("주급 지급 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsPayingSalary(false);
    }
  };

  // 최적화된 전체 학생 급여 지급
  const handlePaySalariesToAll = async () => {
    const currentSalarySettings =
      salarySettingsQuery.data?.settings || salarySettings;

    if (
      !window.confirm(
        `모든 학생들에게 직업별 주급을 지급하시겠습니까?\n(직업이 있는 학생만 해당, 세금 ${(currentSalarySettings.taxRate * 100).toFixed(1)}% 공제)`,
      )
    ) {
      return;
    }

    setIsPayingSalary(true);

    try {
      const result = await batchPaySalariesMutation.mutateAsync({
        studentIds: [], // 빈 배열은 전체 지급을 의미
        payAll: true,
      });

      if (result.success) {
        const { summary } = result;
        alert(
          `주급 지급 완료!\n${summary.totalStudentsPaid}명의 학생에게 지급\n총 급여: ${(
            summary.totalGrossPaid / 10000
          ).toFixed(0)}만원\n세금 공제: ${(
            summary.totalTaxDeducted / 10000
          ).toFixed(0)}만원\n실제 지급: ${(
            summary.totalNetPaid / 10000
          ).toFixed(0)}만원`,
        );
        loadStudents(); // 잔액 갱신
      } else {
        alert(result.message || "주급 지급에 실패했습니다.");
      }
    } catch (error) {
      logger.error("[AdminSettingsModal] 전체 학생 주급 지급 오류:", error);
      alert("주급 지급 중 오류가 발생했습니다: " + error.message);
    } finally {
      setIsPayingSalary(false);
    }
  };

  // 주급 1회분 회수 (임시)
  const handleReverseSalary = async () => {
    if (!window.confirm("주급 1회분을 모든 학생에게서 회수하시겠습니까?")) return;
    try {
      const reverseFn = httpsCallable(functions, "reverseSalaryOnce");
      const result = await reverseFn({});
      if (result.data.success) {
        alert(`회수 완료: ${result.data.summary.totalReversed}명에게서 ${(result.data.summary.totalAmount / 10000).toFixed(0)}만원 회수`);
        loadStudents();
      }
    } catch (error) {
      alert("회수 오류: " + error.message);
    }
  };

  // 학급 구성원 로드
  const loadClassMembers = useCallback(async () => {
    if (!db) {
      logger.error("loadClassMembers: Firestore 데이터베이스 연결이 없습니다.");
      setError(
        "데이터베이스 연결 오류로 학급 구성원 정보를 가져올 수 없습니다.",
      );
      setClassMembers([]);
      setMembersLoading(false);
      return;
    }

    setMembersLoading(true);
    setError("");

    try {
      const usersRef = firebaseCollection(db, "users");
      let queryRef;

      if (!isSuperAdmin && userClassCode) {
        queryRef = firebaseQuery(
          usersRef,
          firebaseWhere("classCode", "==", userClassCode),
        );
      } else if (isSuperAdmin) {
        queryRef = usersRef;
      } else {
        logger.warn("관리자의 학급 코드가 설정되지 않았습니다.");
        setError("학급 코드가 설정되지 않아 구성원 정보를 가져올 수 없습니다.");
        setClassMembers([]);
        setMembersLoading(false);
        return;
      }

      const querySnapshot = await firebaseGetDocs(queryRef);
      const usersList = [];

      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        usersList.push({
          id: doc.id,
          name: userData.name || userData.nickname || "이름 없음",
          email: userData.email,
          classCode: userData.classCode || "코드 없음",
          isAdmin: userData.isAdmin || false,
          isSuperAdmin: userData.isSuperAdmin || false,
        });
      });

      setClassMembers(usersList);
      logger.log(
        `[AdminSettingsModal] ${usersList.length}명의 구성원 로드 완료`,
      );
    } catch (error) {
      logger.error("loadClassMembers: 학급 구성원 로드 오류:", error);
      setError(
        "학급 구성원을 불러오는 중 오류가 발생했습니다: " + error.message,
      );
      setClassMembers([]);
    } finally {
      setMembersLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userClassCode]); // db는 외부 스코프 값으로 의존성에서 제외

  // 학생 직업 편집 모달 열기
  const handleEditStudentJobs = (student) => {
    setSelectedStudent(student);
    setTempSelectedJobIds(
      Array.isArray(student.selectedJobIds) ? [...student.selectedJobIds] : [],
    );
    setShowEditStudentJobsModal(true);
  };

  // 직업 선택 토글
  const handleToggleJobSelection = (jobId) => {
    setTempSelectedJobIds((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId);
      } else {
        return [...prev, jobId];
      }
    });
  };

  // 학생 선택 토글
  const handleToggleStudentSelection = (studentId) => {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      } else {
        return [...prev, studentId];
      }
    });
  };

  // 전체 선택 토글
  const handleToggleSelectAll = () => {
    if (selectAllStudents) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(
        students.map((student) => student.id).filter((id) => id != null),
      );
    }
    setSelectAllStudents(!selectAllStudents);
  };

  // 학생 직업 저장
  const handleSaveStudentJobs = async () => {
    if (!selectedStudent || !db) {
      alert("학생 정보 또는 데이터베이스 연결 오류");
      return;
    }

    setAppLoading(true);

    try {
      const userRef = firebaseDoc(db, "users", selectedStudent.id);
      await firebaseUpdateDoc(userRef, {
        selectedJobIds: tempSelectedJobIds,
        updatedAt: serverTimestamp(),
      });

      setStudents((prevStudents) =>
        prevStudents.map((student) =>
          student.id === selectedStudent.id
            ? { ...student, selectedJobIds: tempSelectedJobIds }
            : student,
        ),
      );

      alert("학생 직업이 성공적으로 업데이트되었습니다.");
      setShowEditStudentJobsModal(false);
    } catch (error) {
      logger.error("학생 직업 업데이트 오류:", error);
      alert("학생 직업 업데이트 중 오류가 발생했습니다: " + error.message);
    } finally {
      setAppLoading(false);
    }
  };

  const adminResetUserPassword = httpsCallable(
    functions,
    "adminResetUserPassword",
  );

  const handleResetPassword = useCallback(
    async (userId) => {
      if (!isAdmin && !isSuperAdmin) {
        alert("관리자만 비밀번호를 초기화할 수 있습니다.");
        return;
      }

      const newPassword = prompt(
        "새로운 비밀번호를 입력하세요. 6자 이상이어야 합니다.",
      );

      if (!newPassword || newPassword.length < 6) {
        alert("비밀번호는 6자 이상이어야 합니다.");
        return;
      }

      if (
        window.confirm(
          `사용자(ID: ${userId})의 비밀번호를 정말로 초기화하시겠습니까?`,
        )
      ) {
        try {
          setMembersLoading(true);
          const result = await adminResetUserPassword({ userId, newPassword });
          if (result.data.success) {
            alert(result.data.message);
          } else {
            throw new Error(result.data.message || "알 수 없는 오류");
          }
        } catch (error) {
          logger.error("비밀번호 초기화 오류:", error);
          alert(`비밀번호 초기화 중 오류가 발생했습니다: ${error.message}`);
        } finally {
          setMembersLoading(false);
        }
      }
    },
    [isAdmin, isSuperAdmin, adminResetUserPassword],
  );

  // 관리자 권한 토글
  const toggleAdminStatus = useCallback(
    async (userId, currentStatus) => {
      if (!db) {
        alert("데이터베이스 연결 오류.");
        return;
      }

      if (!isSuperAdmin) {
        alert("최고 관리자만 관리자 권한을 부여/해제할 수 있습니다.");
        return;
      }

      if (
        window.confirm(
          `이 사용자의 관리자 권한을 ${
            currentStatus ? "제거" : "부여"
          }하시겠습니까?`,
        )
      ) {
        setMembersLoading(true);

        try {
          const userRef = firebaseDoc(db, "users", userId);
          await firebaseUpdateDoc(userRef, { isAdmin: !currentStatus });

          setClassMembers((prevMembers) =>
            prevMembers.map((member) =>
              member.id === userId
                ? { ...member, isAdmin: !currentStatus }
                : member,
            ),
          );

          alert(`관리자 권한이 ${!currentStatus ? "부여" : "제거"}되었습니다.`);
        } catch (error) {
          logger.error("관리자 권한 변경 오류:", error);
          alert("관리자 권한 변경 중 오류가 발생했습니다.");
        } finally {
          setMembersLoading(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isSuperAdmin], // db는 외부 스코프 값으로 의존성에서 제외
  );

  // ========================================
  // 금융 상품 관리 함수들
  // ========================================

  // 금융 상품 로드
  const loadFinancialProducts = useCallback(() => {
    try {
      const savedDeposit = localStorage.getItem("depositProducts");
      const savedSaving = localStorage.getItem("savingProducts");
      const savedLoan = localStorage.getItem("loanProducts");

      if (savedDeposit) setDepositProducts(JSON.parse(savedDeposit));
      if (savedSaving) setSavingProducts(JSON.parse(savedSaving));
      if (savedLoan) setLoanProducts(JSON.parse(savedLoan));
    } catch (error) {
      logger.error("금융 상품 로드 오류:", error);
    }
  }, []);

  // 금융 상품 추가
  const handleAddProduct = useCallback(() => {
    if (!newProductName || newProductName.trim() === "") {
      setFinancialMessage({ type: "error", text: "상품명을 입력해주세요." });
      return;
    }
    if (
      !newProductPeriod ||
      isNaN(newProductPeriod) ||
      parseInt(newProductPeriod) <= 0
    ) {
      setFinancialMessage({
        type: "error",
        text: "유효한 기간을 입력해주세요.",
      });
      return;
    }
    if (
      !newProductRate ||
      isNaN(newProductRate) ||
      parseFloat(newProductRate) < 0
    ) {
      setFinancialMessage({
        type: "error",
        text: "유효한 이율을 입력해주세요.",
      });
      return;
    }

    const newProduct = {
      id: Date.now(),
      name: newProductName.trim(),
      period: parseInt(newProductPeriod),
      rate: parseFloat(newProductRate),
    };

    const typeText =
      financialSubTab === "deposit"
        ? "예금"
        : financialSubTab === "saving"
          ? "적금"
          : "대출";
    let updatedProducts = [];
    let storageKey = "";

    if (financialSubTab === "deposit") {
      updatedProducts = [...depositProducts, newProduct];
      setDepositProducts(updatedProducts);
      storageKey = "depositProducts";
    } else if (financialSubTab === "saving") {
      updatedProducts = [...savingProducts, newProduct];
      setSavingProducts(updatedProducts);
      storageKey = "savingProducts";
    } else if (financialSubTab === "loan") {
      updatedProducts = [...loanProducts, newProduct];
      setLoanProducts(updatedProducts);
      storageKey = "loanProducts";
    }

    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));
    setFinancialMessage({
      type: "success",
      text: `${typeText} 상품이 추가되었습니다.`,
    });
    setNewProductName("");
    setNewProductPeriod("");
    setNewProductRate("");
    setTimeout(() => setFinancialMessage(null), 3000);
  }, [
    newProductName,
    newProductPeriod,
    newProductRate,
    financialSubTab,
    depositProducts,
    savingProducts,
    loanProducts,
  ]);

  // 금융 상품 삭제
  const handleDeleteProduct = useCallback(
    (id, type) => {
      const typeText =
        type === "deposit" ? "예금" : type === "saving" ? "적금" : "대출";

      if (!window.confirm(`이 ${typeText} 상품을 삭제하시겠습니까?`)) return;

      let updatedProducts = [];
      let storageKey = "";

      if (type === "deposit") {
        updatedProducts = depositProducts.filter((p) => p.id !== id);
        setDepositProducts(updatedProducts);
        storageKey = "depositProducts";
      } else if (type === "saving") {
        updatedProducts = savingProducts.filter((p) => p.id !== id);
        setSavingProducts(updatedProducts);
        storageKey = "savingProducts";
      } else if (type === "loan") {
        updatedProducts = loanProducts.filter((p) => p.id !== id);
        setLoanProducts(updatedProducts);
        storageKey = "loanProducts";
      }

      localStorage.setItem(storageKey, JSON.stringify(updatedProducts));
      setFinancialMessage({
        type: "success",
        text: `${typeText} 상품이 삭제되었습니다.`,
      });
      setTimeout(() => setFinancialMessage(null), 3000);
    },
    [depositProducts, savingProducts, loanProducts],
  );

  // ========================================
  // 시장 제어 함수들
  // ========================================

  // 시장 상태 가져오기
  const fetchMarketStatus = useCallback(
    async (forceRefresh = false) => {
      if (!userClassCode) return;

      // 캐시 확인
      if (!forceRefresh && marketStatusCache.current && isMarketDataLoaded) {
        setMarketStatus(marketStatusCache.current);
        return;
      }

      try {
        const marketStatusRef = doc(
          db,
          `ClassStock/${userClassCode}/marketStatus/status`,
        );
        const docSnap = await getDoc(marketStatusRef);

        let statusData;
        if (docSnap.exists()) {
          statusData = docSnap.data();
        } else {
          statusData = { isOpen: false };
          await setDoc(marketStatusRef, statusData);
        }

        marketStatusCache.current = statusData;
        setMarketStatus(statusData);
        setIsMarketDataLoaded(true);
      } catch (error) {
        logger.error("시장 상태 조회 실패:", error);
        setMarketMessage("시장 상태를 불러오는 데 실패했습니다.");
      }
    },
    [userClassCode, isMarketDataLoaded],
  );

  // 시장 개장/폐장 제어
  const handleMarketControl = useCallback(
    async (newIsOpenState) => {
      const actionText = newIsOpenState ? "수동 개장" : "수동 폐장";
      if (
        !window.confirm(
          `정말로 시장을 '${actionText}' 상태로 변경하시겠습니까?`,
        )
      )
        return;

      try {
        // 낙관적 업데이트
        const optimisticStatus = { isOpen: newIsOpenState };
        setMarketStatus(optimisticStatus);
        marketStatusCache.current = optimisticStatus;

        const result = await toggleMarketManually({
          classCode: userClassCode,
          isOpen: newIsOpenState,
        });

        setMarketMessage(result.data.message);
      } catch (error) {
        logger.error("시장 상태 변경 오류:", error);
        setMarketMessage(`오류가 발생했습니다: ${error.message}`);

        // 롤백
        if (marketStatusCache.current) {
          setMarketStatus(marketStatusCache.current);
        } else {
          fetchMarketStatus(true);
        }
      }
      setTimeout(() => setMarketMessage(""), 5000);
    },
    [userClassCode, toggleMarketManually, fetchMarketStatus],
  );

  // 주식 정보 초기화
  const handleInitializeStocks = useCallback(async () => {
    if (
      !window.confirm(
        "모든 주식 정보를 초기화하고 기본값으로 설정하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      )
    )
      return;

    try {
      const batch = writeBatch(db);

      initialStocks.forEach((stock) => {
        const stockRef = doc(db, "CentralStocks", stock.id);
        batch.set(stockRef, stock);
      });

      await batch.commit();
      alert("주식 정보가 성공적으로 초기화되었습니다.");
      setMarketMessage("주식 정보가 성공적으로 초기화되었습니다.");
    } catch (error) {
      logger.error("주식 정보 초기화 중 오류 발생:", error);
      setMarketMessage(`초기화 실패: ${error.message}`);
    }
    setTimeout(() => setMarketMessage(""), 5000);
  }, []);

  // ========================================
  // 파킹 통장 함수들
  // ========================================

  // 파킹 이자율 로드
  const loadParkingRate = useCallback(() => {
    const savedRate = localStorage.getItem("parkingInterestRate");
    if (savedRate) {
      setParkingInterestRate(parseFloat(savedRate));
    }
  }, []);

  // 파킹 이자율 변경
  const handleParkingRateChange = useCallback(() => {
    if (
      !newInterestRate ||
      isNaN(newInterestRate) ||
      parseFloat(newInterestRate) < 0
    ) {
      setParkingMessage({
        type: "error",
        text: "유효한 이자율을 입력해주세요 (0 이상).",
      });
      return;
    }

    const rate = parseFloat(newInterestRate);
    setParkingInterestRate(rate);
    localStorage.setItem("parkingInterestRate", rate.toString());

    setParkingMessage({
      type: "success",
      text: `파킹 통장 일일 이자율이 ${rate}%로 변경되었습니다.`,
    });
    setNewInterestRate("");
    setTimeout(() => setParkingMessage(null), 3000);
  }, [newInterestRate]);

  // 학급 코드 추가
  const handleAddClassCode = useCallback(async () => {
    if (!onAddClassCode || typeof onAddClassCode !== "function") {
      alert("학급 코드 추가 기능을 사용할 수 없습니다.");
      return;
    }

    const codeToAdd = newClassCode.trim();
    if (!codeToAdd) {
      alert("학급 코드를 입력해주세요.");
      return;
    }

    setClassCodeOperationLoading(true);

    try {
      const success = await onAddClassCode(codeToAdd);
      if (success) {
        setNewClassCode("");
      }
    } catch (error) {
      logger.error("AdminSettingsModal: 학급 코드 추가 중 오류:", error);
    } finally {
      setClassCodeOperationLoading(false);
    }
  }, [newClassCode, onAddClassCode]);

  // 학급 코드 삭제
  const handleRemoveClassCode = useCallback(
    async (codeToRemove) => {
      if (!onRemoveClassCode || typeof onRemoveClassCode !== "function") {
        alert("학급 코드 삭제 기능을 사용할 수 없습니다.");
        return;
      }

      setClassCodeOperationLoading(true);

      try {
        await onRemoveClassCode(codeToRemove);
      } catch (error) {
        logger.error("AdminSettingsModal: 학급 코드 삭제 중 오류:", error);
      } finally {
        setClassCodeOperationLoading(false);
      }
    },
    [onRemoveClassCode],
  );

  // 최적화된 데이터 동기화
  useEffect(() => {
    if (showAdminSettingsModal) {
      // 데이터 프리로딩 (필요한 탭들 미리 로드)
      preloadAdminData();
      setError("");

      // 금융 상품 및 파킹 이자율 로드
      loadFinancialProducts();
      loadParkingRate();
    }

    if (!showAdminSettingsModal) {
      setNewClassCode("");
      setClassMembers([]);
      setStudents([]);
      setSelectedStudent(null);
      setTempSelectedJobIds([]);
      setShowEditStudentJobsModal(false);
      setLastSalaryPaidDate(null);
      setSelectedStudentIds([]);
      setSelectAllStudents(false);
      setClassCodeOperationLoading(false);
      setMembersLoading(false);
      setStudentsLoading(false);
      setAppLoading(false);
      setError("");
      // 금융/시장/파킹 상태 초기화
      setFinancialMessage(null);
      setMarketMessage("");
      setParkingMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showAdminSettingsModal,
    adminSelectedMenu,
    loadClassMembers,
    loadStudents,
    loadSalarySettings,
    loadFinancialProducts,
    loadParkingRate,
  ]); // preloadAdminData는 내부적으로 adminSelectedMenu에 따라 loadClassMembers, loadStudents, loadSalarySettings를 호출하므로 추가하면 무한루프 발생

  // 이전 탭 ID → 통합 탭 매핑 (하위 호환)
  useEffect(() => {
    const mapping = {
      taskManagement: ["jobAndTask", () => {}],
      jobSettings: ["jobAndTask", () => {}],
      studentManagement: [
        "studentAndMember",
        () => setStudentMemberSubTab("student"),
      ],
      salarySettings: [
        "studentAndMember",
        () => setStudentMemberSubTab("salary"),
      ],
      memberManagement: [
        "studentAndMember",
        () => setStudentMemberSubTab("member"),
      ],
      financialProducts: [
        "financeAndMarket",
        () => setFinanceMarketSubTab("financial"),
      ],
      parkingAccount: [
        "financeAndMarket",
        () => setFinanceMarketSubTab("parking"),
      ],
      marketControl: [
        "financeAndMarket",
        () => setFinanceMarketSubTab("market"),
      ],
      databaseManagement: ["system", () => setSystemSubTab("database")],
      systemManagement: ["system", () => setSystemSubTab("system")],
    };
    const mapped = mapping[adminSelectedMenu];
    if (mapped) {
      setAdminSelectedMenu(mapped[0]);
      mapped[1]();
    }
  }, [adminSelectedMenu, setAdminSelectedMenu]);

  // 학생 서브탭 선택 시 학생 데이터 로드
  useEffect(() => {
    if (
      showAdminSettingsModal &&
      adminSelectedMenu === "studentAndMember" &&
      studentMemberSubTab === "student"
    ) {
      loadStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdminSettingsModal, adminSelectedMenu, studentMemberSubTab]);

  // 구성원 서브탭 선택 시 구성원 데이터 로드
  useEffect(() => {
    if (
      showAdminSettingsModal &&
      adminSelectedMenu === "studentAndMember" &&
      studentMemberSubTab === "member"
    ) {
      loadClassMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdminSettingsModal, adminSelectedMenu, studentMemberSubTab]);

  // 🔥 fix: 급여 설정 서브탭 진입 시 DB에서 실제 값 로드
  // (이전엔 loadSalarySettings가 deps에만 있고 호출이 안 되어, 화면이 항상 초기값
  //  "10%, 3%"만 보여주는 버그였음. DB에 저장된 새 값이 화면에 반영되지 않음.)
  useEffect(() => {
    if (
      showAdminSettingsModal &&
      adminSelectedMenu === "studentAndMember" &&
      studentMemberSubTab === "salary"
    ) {
      loadSalarySettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdminSettingsModal, adminSelectedMenu, studentMemberSubTab, userClassCode]);

  // 시장 서브탭 선택 시 시장 상태 로드
  useEffect(() => {
    if (
      showAdminSettingsModal &&
      adminSelectedMenu === "financeAndMarket" &&
      financeMarketSubTab === "market"
    ) {
      fetchMarketStatus();
    }
  }, [
    showAdminSettingsModal,
    adminSelectedMenu,
    financeMarketSubTab,
    fetchMarketStatus,
  ]);

  // 마지막 월급 지급일 포맷
  const formatLastSalaryDate = () => {
    if (!lastSalaryPaidDate) return "아직 지급 기록 없음";

    try {
      const date = lastSalaryPaidDate;
      return `${date.getFullYear()}년 ${String(date.getMonth() + 1).padStart(
        2,
        "0",
      )}월 ${String(date.getDate()).padStart(2, "0")}일 ${String(
        date.getHours(),
      ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    } catch (e) {
      logger.error("formatLastSalaryDate 오류:", e);
      return "날짜 형식 오류";
    }
  };

  if (!showAdminSettingsModal) return null;

  if (!isAdmin && !isSuperAdmin) {
    return (
      <div className="admin-settings-modal show">
        <div className="admin-settings-content">
          <h2>관리자 설정</h2>
          <p>관리자만 접근할 수 있습니다.</p>
          <button
            onClick={() => setShowAdminSettingsModal(false)}
            style={cancelBtnStyle}
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  // 버튼 인라인 스타일 (라이트 테마)
  const saveBtnStyle = {
    background: "linear-gradient(135deg, #6366f1, #4f46e5)",
    color: "#ffffff",
    padding: "10px 24px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "0.95rem",
    border: "none",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)",
  };
  const closeBtnStyle = {
    background: "#f1f5f9",
    color: "#475569",
    padding: "10px 24px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "0.95rem",
    border: "1px solid #e2e8f0",
    cursor: "pointer",
  };
  const labelStyle = { color: "#334155", fontWeight: 600 };
  const inputStyle = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    color: "#0f172a",
    padding: "10px 12px",
    width: "100%",
    fontSize: "0.95rem",
  };
  const actionBtnStyle = {
    background: "rgba(99, 102, 241, 0.1)",
    color: "#4f46e5",
    padding: "10px 20px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "0.9rem",
    border: "1px solid rgba(99, 102, 241, 0.3)",
    cursor: "pointer",
  };
  const cancelBtnStyle = {
    background: "#f1f5f9",
    color: "#64748b",
    padding: "10px 20px",
    borderRadius: "8px",
    fontWeight: 500,
    fontSize: "0.9rem",
    border: "1px solid #e2e8f0",
    cursor: "pointer",
  };
  const selectStyle = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    color: "#0f172a",
    padding: "10px 12px",
    fontSize: "0.9rem",
    cursor: "pointer",
  };

  return (
    <div
      className={`admin-settings-modal ${showAdminSettingsModal ? "show" : ""}`}
    >
      <div className="admin-settings-content" style={{ color: "var(--text-primary)" }}>
        <h2>
          관리자 설정{" "}
          {isSuperAdmin && (
            <span className="super-admin-badge">(최고 관리자)</span>
          )}
        </h2>
        {!isSuperAdmin && userClassCode && (
          <p className="admin-class-info">관리 학급: {userClassCode}</p>
        )}

        {/* ========================================
            관리자 탭 메뉴 v2.0
            - 최고관리자(isSuperAdmin): 모든 탭 접근 가능
            - 관리자(isAdmin): 시스템 관리 제외 모든 탭 접근 가능
            ======================================== */}
        <div className="admin-menu-tabs flex flex-wrap gap-2.5 p-3 rounded-2xl">
          <button
            className={`px-4 py-2.5 rounded-2xl text-[13px] whitespace-nowrap ${adminSelectedMenu === "generalSettings" ? "active" : ""}`}
            onClick={() => setAdminSelectedMenu("generalSettings")}
          >
            ⚙️ 일반 설정
          </button>
          <button
            className={`px-4 py-2.5 rounded-2xl text-[13px] whitespace-nowrap ${adminSelectedMenu === "jobAndTask" ? "active" : ""}`}
            onClick={() => setAdminSelectedMenu("jobAndTask")}
          >
            💼 직업/할일
          </button>
          <button
            className={`px-4 py-2.5 rounded-2xl text-[13px] whitespace-nowrap ${adminSelectedMenu === "studentAndMember" ? "active" : ""}`}
            onClick={() => setAdminSelectedMenu("studentAndMember")}
          >
            👥 학생/구성원
          </button>
          <button
            className={`px-4 py-2.5 rounded-2xl text-[13px] whitespace-nowrap ${adminSelectedMenu === "financeAndMarket" ? "active" : ""}`}
            onClick={() => setAdminSelectedMenu("financeAndMarket")}
          >
            🏦 금융/시장
          </button>
          <button
            className={`px-4 py-2.5 rounded-2xl text-[13px] whitespace-nowrap ${adminSelectedMenu === "system" ? "active" : ""}`}
            onClick={() => setAdminSelectedMenu("system")}
          >
            🔧 시스템
          </button>
        </div>

        {/* 일반 설정 탭 */}
        {adminSelectedMenu === "generalSettings" && (
          <div className="general-settings-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">
                  🏫 현재 관리 학급: <strong>{userClassCode}</strong>
                </p>
              </div>
            )}
            {/* 목표 설정 섹션 */}
            <div className="admin-goal-settings section-card">
              <h3>목표 및 쿠폰 가치 설정</h3>
              <div className="form-group">
                <label style={labelStyle}>클래스 목표 쿠폰 수:</label>
                <input
                  type="number"
                  min="1"
                  value={newGoalAmount || ""}
                  onChange={(e) =>
                    setNewGoalAmount && setNewGoalAmount(e.target.value)
                  }
                  style={inputStyle}
                />
              </div>
              <div className="form-group">
                <label style={labelStyle}>쿠폰 가치 ({currencyUnit}):</label>
                <input
                  type="number"
                  min="1"
                  value={adminCouponValue || ""}
                  onChange={(e) =>
                    setAdminCouponValue && setAdminCouponValue(e.target.value)
                  }
                  style={inputStyle}
                />
              </div>
              <button onClick={handleSaveAdminSettings} style={saveBtnStyle}>
                저장
              </button>
            </div>

            {/* 화폐 단위 설정 섹션 */}
            <div
              className="admin-goal-settings section-card"
              style={{ marginTop: "16px" }}
            >
              <h3>화폐 단위 설정</h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "12px",
                }}
              >
                앱에서 사용하는 화폐 단위를 변경합니다. (기본: 알찬)
              </p>
              <div className="form-group">
                <label style={labelStyle}>화폐 단위:</label>
                <input
                  type="text"
                  maxLength={10}
                  value={tempCurrencyUnit}
                  onChange={(e) => setTempCurrencyUnit(e.target.value)}
                  placeholder="예: 알찬, 원, 골드"
                  style={inputStyle}
                />
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  marginBottom: "8px",
                }}
              >
                미리보기: 1000{tempCurrencyUnit}, 1억 2000만 {tempCurrencyUnit}
              </div>
              <button
                onClick={handleSaveCurrencyUnit}
                style={
                  currencyUnitSaving || !tempCurrencyUnit.trim()
                    ? {
                        ...saveBtnStyle,
                        background: "rgba(75,85,99,0.5)",
                        color: "#6b7280",
                        boxShadow: "none",
                        cursor: "not-allowed",
                      }
                    : saveBtnStyle
                }
                disabled={currencyUnitSaving || !tempCurrencyUnit.trim()}
              >
                {currencyUnitSaving ? "저장 중..." : "화폐 단위 저장"}
              </button>
            </div>
          </div>
        )}

        {/* ===== 직업/할일 통합 관리 ===== */}
        {adminSelectedMenu === "jobAndTask" && (
          <div className="task-management-tab">
            {!isSuperAdmin && userClassCode && (
              <div style={{ marginBottom: '16px', padding: '10px 16px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <span style={{ color: '#4f46e5', fontWeight: 600, fontSize: '14px' }}>🏫 현재 관리 학급: <strong>{userClassCode}</strong></span>
              </div>
            )}

            <div className="admin-tasks-settings section-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ margin: 0 }}>직업 & 할일 관리</h3>
                <span style={{ fontSize: '12px', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.2)' }}>모든 할일 관리자 승인 필수</span>
              </div>

              {/* 할일 추가/수정 폼 */}
              {showAddTaskForm && (
                <div style={{ background: '#ffffff', borderRadius: '14px', padding: '24px', border: '1px solid rgba(99, 102, 241, 0.25)', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <span style={{ fontSize: '24px' }}>{adminEditingTask ? "✏️" : "➕"}</span>
                    <div>
                      <h4 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>{adminEditingTask ? "할일 수정" : "새 할일 추가"}</h4>
                      <div style={{ marginTop: '6px' }}>
                        <select
                          value={taskFormIsJobTask && taskFormJobId ? taskFormJobId : ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "") {
                              setTaskFormIsJobTask(false);
                              setTaskFormJobId(null);
                            } else {
                              setTaskFormIsJobTask(true);
                              setTaskFormJobId(val);
                            }
                          }}
                          style={{ ...selectStyle, borderRadius: '8px', padding: '6px 10px', fontSize: '13px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a' }}
                        >
                          <option value="">공통 할일</option>
                          {Array.isArray(jobs) && jobs.map((job) => (
                            <option key={job.id} value={job.id}>{job.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#ccccee', marginBottom: '6px' }}>할일 이름</label>
                      <input
                        type="text"
                        value={adminNewTaskName}
                        onChange={(e) => setAdminNewTaskName(e.target.value)}
                        placeholder="할일 이름 입력"
                        style={{ ...inputStyle, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', borderRadius: '10px', padding: '12px 14px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#ccccee', marginBottom: '6px' }}>하루 최대 횟수</label>
                      <input
                        type="number"
                        min="1"
                        value={adminNewTaskMaxClicks}
                        onChange={(e) => setAdminNewTaskMaxClicks(e.target.value)}
                        placeholder="5"
                        style={{ ...inputStyle, background: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', borderRadius: '10px', padding: '12px 14px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setShowAddTaskForm(false); setAdminEditingTask(null); }}
                      style={{ ...cancelBtnStyle, borderRadius: '10px', padding: '10px 20px' }}
                    >
                      취소
                    </button>
                    <button
                      onClick={() => {
                        logger.log("[AdminSettingsModal] 할일 저장 버튼 클릭");
                        if (handleSaveTask && typeof handleSaveTask === "function") {
                          handleSaveTask();
                        } else {
                          logger.error("[AdminSettingsModal] handleSaveTask 함수가 정의되지 않았습니다.");
                          alert("할일 저장 기능을 사용할 수 없습니다.");
                        }
                      }}
                      style={{ ...saveBtnStyle, borderRadius: '10px', padding: '10px 24px' }}
                    >
                      {adminEditingTask ? "수정" : "추가"}
                    </button>
                  </div>
                </div>
              )}

              {/* 공통 할일 섹션 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h4 style={{ color: '#4f46e5', fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '4px', height: '16px', background: '#4f46e5', borderRadius: '2px', display: 'inline-block' }}></span>
                    공통 할일
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>({Array.isArray(commonTasks) ? commonTasks.length : 0}개)</span>
                  </h4>
                  <button
                    onClick={() => { setInlineAddingFor("common"); setInlineTaskName(""); setInlineTaskMaxClicks("5"); }}
                    style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#4f46e5', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + 추가
                  </button>
                </div>
                {/* 공통 할일 인라인 추가 폼 */}
                {inlineAddingFor === "common" && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', padding: '8px 12px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                    <input
                      type="text"
                      value={inlineTaskName}
                      onChange={(e) => setInlineTaskName(e.target.value)}
                      placeholder="할일 이름"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleInlineTaskSave("common"); if (e.key === 'Escape') { setInlineAddingFor(null); setInlineTaskName(""); setInlineTaskMaxClicks("5"); } }}
                      style={{ flex: 1, padding: '6px 10px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', outline: 'none' }}
                    />
                    <input
                      type="number"
                      min="1"
                      value={inlineTaskMaxClicks}
                      onChange={(e) => setInlineTaskMaxClicks(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleInlineTaskSave("common"); }}
                      style={{ width: '50px', padding: '6px 6px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', textAlign: 'center', outline: 'none' }}
                    />
                    <span style={{ fontSize: '11px', color: '#64748b' }}>회</span>
                    <button onClick={() => handleInlineTaskSave("common")} style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>추가</button>
                    <button onClick={() => { setInlineAddingFor(null); setInlineTaskName(""); setInlineTaskMaxClicks("5"); }} style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>취소</button>
                  </div>
                )}
                {Array.isArray(commonTasks) && commonTasks.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '8px' }}>
                    {commonTasks.map((task) => (
                      <div key={task.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        {inlineEditingTaskId === task.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input type="text" value={inlineEditName} onChange={(e) => setInlineEditName(e.target.value)} autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEditSave(task.id, null); if (e.key === 'Escape') setInlineEditingTaskId(null); }}
                              style={{ flex: 1, padding: '5px 8px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', outline: 'none' }} />
                            <input type="number" min="1" value={inlineEditMaxClicks} onChange={(e) => setInlineEditMaxClicks(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEditSave(task.id, null); }}
                              style={{ width: '50px', padding: '5px 4px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', textAlign: 'center', outline: 'none' }} />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>회</span>
                            <button onClick={() => handleInlineEditSave(task.id, null)} style={{ padding: '4px 8px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>저장</button>
                            <button onClick={() => setInlineEditingTaskId(null)} style={{ padding: '4px 6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>취소</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <span style={{ color: '#0f172a', fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                              <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{task.maxClicks || 5}회</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                              <button onClick={() => { setInlineEditingTaskId(task.id); setInlineEditName(task.name); setInlineEditMaxClicks(String(task.maxClicks || 5)); }}
                                style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#4f46e5', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>수정</button>
                              <button onClick={() => { handleTaskDelete(task.id); }}
                                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>삭제</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                    공통 할일이 없습니다.
                  </p>
                )}
              </div>

              {/* 직업 추가 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h4 style={{ color: '#4f46e5', fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '4px', height: '16px', background: '#818cf8', borderRadius: '2px', display: 'inline-block' }}></span>
                  직업별 할일
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>({Array.isArray(jobs) ? jobs.length : 0}개 직업)</span>
                </h4>
              </div>

              {/* 직업 추가 인라인 폼 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={adminNewJobTitle}
                  onChange={(e) => setAdminNewJobTitle(e.target.value)}
                  placeholder={adminEditingJob ? "직업명 수정" : "새 직업명 입력"}
                  style={{ ...inputStyle, flex: 1, background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#0f172a', borderRadius: '10px', padding: '10px 14px', fontSize: '14px' }}
                />
                <button
                  onClick={() => {
                    if (handleSaveJob && typeof handleSaveJob === "function") {
                      handleSaveJob();
                    } else {
                      alert("직업 저장 기능을 사용할 수 없습니다.");
                    }
                  }}
                  style={{ ...saveBtnStyle, borderRadius: '10px', padding: '10px 18px', fontSize: '14px', whiteSpace: 'nowrap' }}
                >
                  {adminEditingJob ? "직업 수정" : "+ 직업 추가"}
                </button>
                {adminEditingJob && (
                  <button
                    onClick={() => { setAdminEditingJob(null); setAdminNewJobTitle(""); }}
                    style={{ ...cancelBtnStyle, borderRadius: '10px', padding: '10px 14px', fontSize: '14px' }}
                  >
                    취소
                  </button>
                )}
              </div>

              {/* 직업별 카드 목록 */}
              {Array.isArray(jobs) && jobs.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '12px' }}>
                  {jobs.map((job) => (
                    <div key={job.id} style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.2)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)', overflow: 'hidden' }}>
                      {/* 직업 헤더 */}
                      <div style={{ padding: '10px 16px', background: 'rgba(99, 102, 241, 0.06)', borderBottom: '1px solid rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4f46e5', fontWeight: 700, fontSize: '14px' }}>💼 {job.title}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>할일 {Array.isArray(job.tasks) ? job.tasks.length : 0}개</span>
                          <button
                            onClick={() => { handleJobEdit(job); }}
                            style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#4f46e5', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                          >
                            이름수정
                          </button>
                          <button
                            onClick={() => { handleJobDelete(job.id); }}
                            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      {/* 직업 내 할일 목록 */}
                      {Array.isArray(job.tasks) && job.tasks.length > 0 ? (
                        <div style={{ padding: '6px 8px' }}>
                          {job.tasks.map((task, idx) => (
                            <div key={task.id} style={{ padding: '6px 10px', borderRadius: '8px', background: idx % 2 === 0 ? 'transparent' : '#f8fafc' }}>
                              {inlineEditingTaskId === task.id ? (
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <input type="text" value={inlineEditName} onChange={(e) => setInlineEditName(e.target.value)} autoFocus
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEditSave(task.id, job.id); if (e.key === 'Escape') setInlineEditingTaskId(null); }}
                                    style={{ flex: 1, padding: '5px 8px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.35)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', outline: 'none' }} />
                                  <input type="number" min="1" value={inlineEditMaxClicks} onChange={(e) => setInlineEditMaxClicks(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleInlineEditSave(task.id, job.id); }}
                                    style={{ width: '50px', padding: '5px 4px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.35)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', textAlign: 'center', outline: 'none' }} />
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>회</span>
                                  <button onClick={() => handleInlineEditSave(task.id, job.id)} style={{ padding: '4px 8px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>저장</button>
                                  <button onClick={() => setInlineEditingTaskId(null)} style={{ padding: '4px 6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>취소</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                    <span style={{ color: '#0f172a', fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                                    <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{task.maxClicks || 5}회</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                                    <button onClick={() => { setInlineEditingTaskId(task.id); setInlineEditName(task.name); setInlineEditMaxClicks(String(task.maxClicks || 5)); }}
                                      style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#4f46e5', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>수정</button>
                                    <button onClick={() => { handleTaskDelete(task.id, job.id); }}
                                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>삭제</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '12px', margin: 0 }}>
                          할일 없음
                        </p>
                      )}
                      {/* 직업 카드 내 인라인 할일 추가 */}
                      <div style={{ padding: '6px 8px', borderTop: '1px solid rgba(99, 102, 241, 0.15)' }}>
                        {inlineAddingFor === job.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={inlineTaskName}
                              onChange={(e) => setInlineTaskName(e.target.value)}
                              placeholder="할일 이름"
                              autoFocus
                              onKeyDown={(e) => { if (e.key === 'Enter') handleInlineTaskSave(job.id); if (e.key === 'Escape') { setInlineAddingFor(null); setInlineTaskName(""); setInlineTaskMaxClicks("5"); } }}
                              style={{ flex: 1, padding: '6px 10px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.35)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', outline: 'none' }}
                            />
                            <input
                              type="number"
                              min="1"
                              value={inlineTaskMaxClicks}
                              onChange={(e) => setInlineTaskMaxClicks(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleInlineTaskSave(job.id); }}
                              style={{ width: '50px', padding: '6px 6px', background: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.35)', borderRadius: '6px', color: '#0f172a', fontSize: '13px', textAlign: 'center', outline: 'none' }}
                            />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>회</span>
                            <button onClick={() => handleInlineTaskSave(job.id)} style={{ padding: '5px 10px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>추가</button>
                            <button onClick={() => { setInlineAddingFor(null); setInlineTaskName(""); setInlineTaskMaxClicks("5"); }} style={{ padding: '5px 8px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>취소</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setInlineAddingFor(job.id); setInlineTaskName(""); setInlineTaskMaxClicks("5"); }}
                            style={{ width: '100%', padding: '7px', background: 'rgba(99, 102, 241, 0.06)', border: '1px dashed rgba(99, 102, 241, 0.35)', borderRadius: '8px', color: '#4f46e5', fontSize: '13px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.target.style.background = 'rgba(99, 102, 241, 0.12)'; }}
                            onMouseLeave={(e) => { e.target.style.background = 'rgba(99, 102, 241, 0.06)'; }}
                          >
                            + 할일 추가
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                  등록된 직업이 없습니다. 위에서 직업을 추가하세요.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===== 학생/구성원 통합 탭 ===== */}
        {adminSelectedMenu === "studentAndMember" && (
          <div className="flex gap-2 mb-4 p-2 rounded-xl bg-white border border-slate-200 shadow-sm">
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${studentMemberSubTab === "student" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setStudentMemberSubTab("student")}
            >
              학생/급여 관리
            </button>
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${studentMemberSubTab === "salary" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setStudentMemberSubTab("salary")}
            >
              급여 설정
            </button>
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${studentMemberSubTab === "member" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setStudentMemberSubTab("member")}
            >
              구성원 관리
            </button>
          </div>
        )}

        {/* 학생 관리 서브탭 */}
        {adminSelectedMenu === "studentAndMember" &&
          studentMemberSubTab === "student" && (
            <div className="student-management-tab">
              {!isSuperAdmin && userClassCode && (
                <div className="class-info-header">
                  <p className="current-class-info">
                    🏫 현재 관리 학급: <strong>{userClassCode}</strong>
                  </p>
                </div>
              )}
              {/* 학생직업 관리 섹션 */}
              <div className="student-jobs-settings section-card">
                <h3>학생직업 관리</h3>
                {error && <p className="error-message">{error}</p>}
                <p className="admin-section-desc">
                  학생들에게 직업을 배정하거나 관리합니다. 주급은 직업 수에 따라
                  차등 지급됩니다.
                </p>

                <div className="salary-management">
                  <div className="salary-info">
                    <h4>주급 지급 관리</h4>
                    <p>기본 주급: 200만원, 추가 직업당: 50만원</p>
                    <p>세율: {(salarySettings.taxRate * 100).toFixed(1)}%</p>
                    <p>
                      주급 인상률:{" "}
                      {(salarySettings.salaryIncreaseRate * 100).toFixed(1)}%
                      (매주)
                    </p>
                    <p>마지막 주급 지급일: {formatLastSalaryDate()}</p>
                    <p className="auto-payment-info">
                      ⏰ 자동 주급 지급: 매주 월요일 오전 8시 (서버 자동 실행)
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handlePaySalariesToAll}
                      disabled={isPayingSalary || studentsLoading}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: '1px solid rgba(16,185,129,0.4)',
                        background: 'rgba(16,185,129,0.15)',
                        color: '#10b981',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: isPayingSalary ? 'not-allowed' : 'pointer',
                        opacity: isPayingSalary ? 0.6 : 1,
                      }}
                    >
                      {isPayingSalary
                        ? "지급 중..."
                        : "💰 전체 학생 주급 지급"}
                    </button>
                    <button
                      onClick={handlePaySalariesToSelected}
                      disabled={
                        isPayingSalary ||
                        studentsLoading ||
                        selectedStudentIds.length === 0
                      }
                      style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: '1px solid rgba(99,102,241,0.4)',
                        background: 'rgba(99,102,241,0.15)',
                        color: '#4f46e5',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: (isPayingSalary || selectedStudentIds.length === 0) ? 'not-allowed' : 'pointer',
                        opacity: (isPayingSalary || selectedStudentIds.length === 0) ? 0.5 : 1,
                      }}
                    >
                      {isPayingSalary
                        ? "지급 중..."
                        : `💰 선택 학생(${selectedStudentIds.length}) 주급 지급`}
                    </button>
                    <button
                      onClick={handleReverseSalary}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        border: '1px solid rgba(239,68,68,0.4)',
                        background: 'rgba(239,68,68,0.15)',
                        color: '#ef4444',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🔄 주급 1회분 회수
                    </button>
                  </div>
                </div>

                <div className="student-jobs-container">
                  <div className="student-list-header">
                    <h4>
                      학생 목록{" "}
                      {!isSuperAdmin &&
                        userClassCode &&
                        `(${userClassCode} 학급)`}
                    </h4>
                    <button
                      onClick={loadStudents}
                      style={actionBtnStyle}
                      disabled={studentsLoading}
                    >
                      {studentsLoading ? "로딩 중..." : "학생 목록 새로고침"}
                    </button>
                  </div>
                  {studentsLoading ? (
                    <p className="text-slate-500 py-6 text-center">학생 정보 로딩 중...</p>
                  ) : students.length > 0 ? (
                    <>
                      {/* 전체 선택 */}
                      <div className="flex items-center gap-2 mb-3 px-1">
                        <input
                          type="checkbox"
                          id="select-all-students"
                          checked={selectAllStudents}
                          onChange={handleToggleSelectAll}
                          disabled={students.length === 0}
                          className="w-4 h-4 accent-indigo-600"
                        />
                        <label htmlFor="select-all-students" className="text-xs font-medium text-slate-600 cursor-pointer">
                          전체 선택 ({selectedStudentIds.length}/{students.length})
                        </label>
                      </div>

                      {/* 학생 카드 그리드 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {students.map((student) => {
                          const salaryCalc = calculateSalary(
                            student.selectedJobIds,
                            true,
                          );
                          const isSelected = selectedStudentIds.includes(student.id);
                          const jobTitles = Array.isArray(student.selectedJobIds) && student.selectedJobIds.length > 0
                            ? student.selectedJobIds
                                .map((jobId) => {
                                  const job = Array.isArray(jobs) ? jobs.find((j) => j.id === jobId) : null;
                                  return job ? job.title : null;
                                })
                                .filter(Boolean)
                            : [];
                          return (
                            <div
                              key={student.id}
                              className={`rounded-xl bg-white p-3 transition-all ${
                                isSelected
                                  ? "border-2 border-indigo-400 shadow-[0_0_0_3px_rgba(99,102,241,0.1)]"
                                  : "border border-slate-200 shadow-sm hover:border-indigo-200"
                              }`}
                            >
                              {/* 헤더: 체크박스 + 이름 + 직업설정 */}
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleStudentSelection(student.id)}
                                  className="w-4 h-4 accent-indigo-600 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-slate-800 text-sm truncate">
                                    {student.nickname || student.name || "이름 없음"}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {student.email || "-"} · {student.classCode || "미지정"}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleEditStudentJobs(student)}
                                  className="text-xs font-medium px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors flex-shrink-0"
                                >
                                  직업 설정
                                </button>
                              </div>

                              {/* 직업 태그 */}
                              <div className="mb-2 flex flex-wrap gap-1">
                                {jobTitles.length > 0 ? (
                                  jobTitles.map((t, i) => (
                                    <span
                                      key={i}
                                      className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                                    >
                                      {t}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-slate-400">직업 없음</span>
                                )}
                              </div>

                              {/* 급여/현금 그리드 */}
                              <div className="grid grid-cols-3 gap-1.5 mb-2">
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5 text-center">
                                  <div className="text-[10px] text-slate-500">총급여</div>
                                  <div className="text-xs font-bold text-slate-700">
                                    {(salaryCalc.gross / 10000).toFixed(0)}만
                                  </div>
                                </div>
                                <div className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1.5 text-center">
                                  <div className="text-[10px] text-rose-500">세금</div>
                                  <div className="text-xs font-bold text-rose-700">
                                    -{(salaryCalc.tax / 10000).toFixed(0)}만
                                  </div>
                                </div>
                                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-center">
                                  <div className="text-[10px] text-emerald-500">실급여</div>
                                  <div className="text-xs font-bold text-emerald-700">
                                    {(salaryCalc.net / 10000).toFixed(0)}만
                                  </div>
                                </div>
                              </div>

                              {/* 보유 현금 + 최근 주급일 */}
                              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                                <span>
                                  보유 <span className="font-semibold text-slate-700">{(student.cash || 0).toLocaleString()}원</span>
                                </span>
                                <span>
                                  {student.lastSalaryDate
                                    ? student.lastSalaryDate.toLocaleDateString()
                                    : "지급 없음"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="no-items-message">
                      {!isSuperAdmin && !userClassCode
                        ? "학급 코드가 설정되지 않았습니다."
                        : "학생 정보가 없습니다."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* ===== 금융/시장 통합 탭 ===== */}
        {adminSelectedMenu === "financeAndMarket" && (
          <div className="flex gap-2 mb-4 p-2 rounded-xl bg-white border border-slate-200 shadow-sm">
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${financeMarketSubTab === "financial" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setFinanceMarketSubTab("financial")}
            >
              금융 상품
            </button>
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${financeMarketSubTab === "parking" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setFinanceMarketSubTab("parking")}
            >
              파킹 통장
            </button>
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${financeMarketSubTab === "market" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setFinanceMarketSubTab("market")}
            >
              시장 제어
            </button>
          </div>
        )}

        {/* 금융 상품 서브탭 */}
        {adminSelectedMenu === "financeAndMarket" &&
          financeMarketSubTab === "financial" && (
            <div className="financial-products-tab">
              {!isSuperAdmin && userClassCode && (
                <div className="class-info-header">
                  <p className="current-class-info">
                    🏫 현재 관리 학급: <strong>{userClassCode}</strong>
                  </p>
                </div>
              )}
              <div className="financial-products-settings section-card">
                <h3>금융 상품 관리</h3>
                <p className="admin-section-desc">
                  예금, 적금, 대출 상품을 추가하거나 삭제합니다.
                </p>

                {/* 금융 상품 서브 탭 */}
                <div className="financial-sub-tabs flex gap-2 mb-4">
                  <button
                    className={`sub-tab-button px-4 py-2 rounded-lg cursor-pointer font-semibold ${financialSubTab === "deposit" ? "active" : ""}`}
                    onClick={() => setFinancialSubTab("deposit")}
                    style={{
                      border:
                        financialSubTab === "deposit"
                          ? "2px solid #4f46e5"
                          : "1px solid #e2e8f0",
                      background:
                        financialSubTab === "deposit"
                          ? "#4f46e5"
                          : "transparent",
                      color:
                        financialSubTab === "deposit" ? "white" : "#64748b",
                    }}
                  >
                    예금 상품
                  </button>
                  <button
                    className={`sub-tab-button px-4 py-2 rounded-lg cursor-pointer font-semibold ${financialSubTab === "saving" ? "active" : ""}`}
                    onClick={() => setFinancialSubTab("saving")}
                    style={{
                      border:
                        financialSubTab === "saving"
                          ? "2px solid #4f46e5"
                          : "1px solid #e2e8f0",
                      background:
                        financialSubTab === "saving"
                          ? "#4f46e5"
                          : "transparent",
                      color: financialSubTab === "saving" ? "white" : "#64748b",
                    }}
                  >
                    적금 상품
                  </button>
                  <button
                    className={`sub-tab-button px-4 py-2 rounded-lg cursor-pointer font-semibold ${financialSubTab === "loan" ? "active" : ""}`}
                    onClick={() => setFinancialSubTab("loan")}
                    style={{
                      border:
                        financialSubTab === "loan"
                          ? "2px solid #4f46e5"
                          : "1px solid #e2e8f0",
                      background:
                        financialSubTab === "loan" ? "#4f46e5" : "transparent",
                      color: financialSubTab === "loan" ? "white" : "#64748b",
                    }}
                  >
                    대출 상품
                  </button>
                </div>

                {/* 메시지 */}
                {financialMessage && (
                  <div
                    className={`message-box ${financialMessage.type} p-3 mb-4 rounded-lg text-slate-800 dark:text-white`}
                    style={{
                      background:
                        financialMessage.type === "success"
                          ? "#065f46"
                          : "#991b1b",
                    }}
                  >
                    {financialMessage.text}
                  </div>
                )}

                {/* 상품 추가 폼 */}
                <div className="add-product-form p-4 rounded-xl mb-4 bg-slate-50 border border-slate-200">
                  <h4 className="mb-3 text-slate-800 font-bold">
                    {financialSubTab === "deposit"
                      ? "예금"
                      : financialSubTab === "saving"
                        ? "적금"
                        : "대출"}{" "}
                    상품 추가
                  </h4>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block mb-1 text-slate-500 dark:text-gray-400 text-xs">
                        상품명
                      </label>
                      <input
                        type="text"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder="상품명 입력"
                        className="w-full"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-slate-500 dark:text-gray-400 text-xs">
                        기간 (일)
                      </label>
                      <input
                        type="number"
                        value={newProductPeriod}
                        onChange={(e) => setNewProductPeriod(e.target.value)}
                        placeholder="기간 (일)"
                        min="1"
                        className="w-full"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-slate-500 dark:text-gray-400 text-xs">
                        이율 (%)
                      </label>
                      <input
                        type="number"
                        value={newProductRate}
                        onChange={(e) => setNewProductRate(e.target.value)}
                        placeholder="이율 (%)"
                        min="0"
                        step="0.1"
                        className="w-full"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddProduct}
                    className="w-full"
                    style={saveBtnStyle}
                  >
                    상품 추가하기
                  </button>
                </div>

                {/* 상품 목록 */}
                <div className="product-list">
                  <h4 className="mb-3 text-slate-800 dark:text-white">
                    {financialSubTab === "deposit"
                      ? "예금"
                      : financialSubTab === "saving"
                        ? "적금"
                        : "대출"}{" "}
                    상품 목록
                  </h4>
                  {(() => {
                    const products =
                      financialSubTab === "deposit"
                        ? depositProducts
                        : financialSubTab === "saving"
                          ? savingProducts
                          : loanProducts;
                    if (products.length === 0) {
                      return (
                        <p className="no-items-message">
                          등록된 상품이 없습니다.
                        </p>
                      );
                    }
                    return (
                      <div className="members-table-container">
                        <table className="members-table">
                          <thead>
                            <tr>
                              <th>상품명</th>
                              <th>기간 (일)</th>
                              <th>이율 (%)</th>
                              <th>관리</th>
                            </tr>
                          </thead>
                          <tbody>
                            {products.map((product) => (
                              <tr key={product.id}>
                                <td>{product.name}</td>
                                <td>{product.period}일</td>
                                <td>{product.rate}%</td>
                                <td>
                                  <button
                                    onClick={() =>
                                      handleDeleteProduct(
                                        product.id,
                                        financialSubTab,
                                      )
                                    }
                                    className="delete-button"
                                  >
                                    삭제
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

        {/* 시장 제어 서브탭 */}
        {adminSelectedMenu === "financeAndMarket" &&
          financeMarketSubTab === "market" && (
            <div className="market-control-tab">
              {!isSuperAdmin && userClassCode && (
                <div className="class-info-header">
                  <p className="current-class-info">
                    🏫 현재 관리 학급: <strong>{userClassCode}</strong>
                  </p>
                </div>
              )}
              <div className="market-control-settings section-card">
                <h3>주식 시장 제어</h3>
                <p className="admin-section-desc">
                  주식 시장의 개장/폐장 상태를 수동으로 제어합니다.
                </p>

                {/* 시장 상태 */}
                <div className="p-4 rounded-xl mb-4 bg-slate-50 border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-slate-800 dark:text-white">
                      현재 상태:{" "}
                      <span
                        className="font-bold px-3 py-1 rounded-2xl"
                        style={{
                          color: marketStatus.isOpen ? "#22c55e" : "#ef4444",
                          background: marketStatus.isOpen
                            ? "rgba(34, 197, 94, 0.2)"
                            : "rgba(239, 68, 68, 0.2)",
                        }}
                      >
                        {marketStatus.isOpen ? "🟢 개장" : "🔴 폐장"}
                      </span>
                    </p>
                    <button
                      onClick={() => fetchMarketStatus(true)}
                      style={actionBtnStyle}
                      disabled={!userClassCode}
                    >
                      새로고침
                    </button>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => handleMarketControl(true)}
                      disabled={marketStatus.isOpen}
                      className="flex-1"
                      style={{
                        ...saveBtnStyle,
                        background: marketStatus.isOpen ? "#374151" : "#22c55e",
                        cursor: marketStatus.isOpen ? "not-allowed" : "pointer",
                      }}
                    >
                      수동 개장
                    </button>
                    <button
                      onClick={() => handleMarketControl(false)}
                      disabled={!marketStatus.isOpen}
                      className="admin-cancel-button flex-1"
                      style={{
                        background: !marketStatus.isOpen
                          ? "#374151"
                          : "#ef4444",
                        cursor: !marketStatus.isOpen
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      수동 폐장
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    버튼을 누르면 정해진 시간과 상관없이 시장 상태가 즉시
                    변경됩니다.
                    <br />
                    자동 개장/폐장 시간(월-금, 오전 8시/오후 3시)이 되면
                    자동으로 상태가 변경됩니다.
                  </p>
                </div>

                {/* 메시지 */}
                {marketMessage && (
                  <div className="p-3 mb-4 rounded-lg bg-amber-600 text-slate-800 dark:text-white text-center">
                    {marketMessage}
                  </div>
                )}

                {/* 주식 초기화 */}
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                  <h4 className="mb-3 text-red-500">⚠️ 주식 정보 초기화</h4>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mb-3">
                    주의: 이 버튼을 누르면 모든 주식의 가격과 거래 내역이
                    기본값으로 초기화됩니다. 이 작업은 되돌릴 수 없습니다.
                  </p>
                  <button
                    onClick={handleInitializeStocks}
                    className="w-full p-3 rounded-lg bg-orange-600 text-slate-800 dark:text-white border-0 cursor-pointer font-semibold"
                  >
                    모든 주식 정보 초기화
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* 파킹 통장 서브탭 */}
        {adminSelectedMenu === "financeAndMarket" &&
          financeMarketSubTab === "parking" && (
            <div className="parking-account-tab">
              {!isSuperAdmin && userClassCode && (
                <div className="class-info-header">
                  <p className="current-class-info">
                    🏫 현재 관리 학급: <strong>{userClassCode}</strong>
                  </p>
                </div>
              )}
              <div className="parking-account-settings section-card">
                <h3>파킹 통장 이자율 관리</h3>
                <p className="admin-section-desc">
                  파킹 통장의 일일 이자율을 설정합니다.
                </p>

                {/* 메시지 */}
                {parkingMessage && (
                  <div
                    className="p-3 mb-4 rounded-lg text-slate-800 dark:text-white"
                    style={{
                      background:
                        parkingMessage.type === "success"
                          ? "#065f46"
                          : "#991b1b",
                    }}
                  >
                    {parkingMessage.text}
                  </div>
                )}

                {/* 현재 이자율 */}
                <div className="p-4 rounded-xl mb-4 bg-slate-50 border border-slate-200">
                  <div className="mb-4">
                    <p className="text-slate-500 dark:text-gray-400 text-sm">현재 일일 이자율</p>
                    <p className="text-green-500 text-[32px] font-bold">
                      {parkingInterestRate}%
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="block mb-2 text-slate-500 dark:text-gray-400">
                      새 일일 이자율 (%)
                    </label>
                    <input
                      type="number"
                      value={newInterestRate}
                      onChange={(e) => setNewInterestRate(e.target.value)}
                      placeholder="새 이자율 입력 (%)"
                      min="0"
                      step="0.01"
                      className="mb-3"
                      style={inputStyle}
                    />
                    <button
                      onClick={handleParkingRateChange}
                      className="w-full"
                      style={saveBtnStyle}
                      disabled={
                        !newInterestRate ||
                        isNaN(newInterestRate) ||
                        parseFloat(newInterestRate) < 0
                      }
                    >
                      이자율 변경
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-3">
                    파킹 통장에 예치된 금액은 매일 설정된 이자율만큼 이자가
                    발생합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* 구성원 관리 서브탭 */}
        {adminSelectedMenu === "studentAndMember" &&
          studentMemberSubTab === "member" && (
            <div className="space-y-5">
              {!isSuperAdmin && userClassCode && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border"
                  style={{ background: "#eef2ff", borderColor: "#c7d2fe" }}
                >
                  <span className="text-base">🏫</span>
                  <span className="text-sm font-medium" style={{ color: "#334155" }}>현재 관리 학급:</span>
                  <span className="text-sm font-bold tracking-wide" style={{ color: "#4338ca" }}>{userClassCode}</span>
                </div>
              )}

              {/* 헤더 + 통계 */}
              <div
                className="rounded-2xl border shadow-sm overflow-hidden"
                style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div className="px-6 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "#0f172a" }}>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm" style={{ background: "#e0e7ff", color: "#4f46e5" }}>👥</span>
                    학급 구성원 관리
                  </h3>
                  <p className="text-xs mt-1.5 ml-9" style={{ color: "#475569" }}>
                    학급 구성원의 정보를 확인하고 관리합니다.
                    {isSuperAdmin && " 최고 관리자는 모든 학급의 구성원을 확인할 수 있습니다."}
                  </p>
                </div>
                {error && (
                  <div className="mx-6 mt-4 px-4 py-2.5 rounded-lg text-sm" style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                    {error}
                  </div>
                )}
                {/* 통계 */}
                {!membersLoading && classMembers.length > 0 && (
                  <div className="grid grid-cols-3 divide-x" style={{ borderColor: "#f1f5f9" }}>
                    {(() => {
                      const total = classMembers.length;
                      const students = classMembers.filter(m => !m.isAdmin && !m.isSuperAdmin).length;
                      const admins = classMembers.filter(m => m.isAdmin && !m.isSuperAdmin).length;
                      return (
                        <>
                          <div className="px-4 py-3 text-center" style={{ borderColor: "#f1f5f9" }}>
                            <p className="text-[11px]" style={{ color: "#64748b" }}>전체</p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: "#0f172a" }}>{total}<span className="text-xs ml-0.5" style={{ color: "#94a3b8" }}>명</span></p>
                          </div>
                          <div className="px-4 py-3 text-center" style={{ borderColor: "#f1f5f9" }}>
                            <p className="text-[11px]" style={{ color: "#64748b" }}>학생</p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: "#0284c7" }}>{students}<span className="text-xs ml-0.5" style={{ color: "#94a3b8" }}>명</span></p>
                          </div>
                          <div className="px-4 py-3 text-center">
                            <p className="text-[11px]" style={{ color: "#64748b" }}>관리자</p>
                            <p className="text-lg font-bold tabular-nums" style={{ color: "#d97706" }}>{admins}<span className="text-xs ml-0.5" style={{ color: "#94a3b8" }}>명</span></p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* 구성원 카드 그리드 */}
              {membersLoading ? (
                <div className="flex items-center justify-center py-12 rounded-2xl" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <p className="text-sm" style={{ color: "#64748b" }}>구성원 정보 로딩 중...</p>
                </div>
              ) : classMembers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {classMembers.map((member) => {
                    const role = member.isSuperAdmin ? "super" : member.isAdmin ? "admin" : "student";
                    const roleConfig = {
                      super:   { label: "최고 관리자", bg: "#fce7f3", color: "#9d174d", icon: "👑" },
                      admin:   { label: "관리자",     bg: "#fef3c7", color: "#92400e", icon: "🛡️" },
                      student: { label: "학생",       bg: "#dbeafe", color: "#1e40af", icon: "🎓" },
                    }[role];
                    return (
                      <div
                        key={member.id}
                        className="rounded-2xl border shadow-sm overflow-hidden flex flex-col"
                        style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
                      >
                        <div className="px-4 py-3 border-b flex items-start justify-between gap-2" style={{ borderColor: "#f1f5f9" }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate" style={{ color: "#0f172a" }}>{member.name || "(이름없음)"}</p>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: "#64748b" }}>{member.email}</p>
                          </div>
                          <span
                            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                            style={{ background: roleConfig.bg, color: roleConfig.color }}
                          >
                            <span>{roleConfig.icon}</span>
                            {roleConfig.label}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex items-center gap-2 text-xs" style={{ color: "#64748b" }}>
                          <span className="font-semibold" style={{ color: "#475569" }}>학급</span>
                          <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold" style={{ background: "#f1f5f9", color: "#1e293b" }}>{member.classCode || "—"}</span>
                        </div>
                        {isSuperAdmin && (
                          <div className="px-4 py-3 border-t flex flex-wrap gap-2 mt-auto" style={{ borderColor: "#f1f5f9", background: "#fafbfc" }}>
                            {!member.isSuperAdmin && (
                              <button
                                onClick={() => toggleAdminStatus(member.id, member.isAdmin)}
                                disabled={membersLoading}
                                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                                style={member.isAdmin
                                  ? { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
                                  : { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}
                              >
                                {member.isAdmin ? "관리자 해제" : "관리자 지정"}
                              </button>
                            )}
                            <button
                              onClick={() => handleResetPassword(member.id)}
                              disabled={membersLoading}
                              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                              style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0" }}
                            >
                              비밀번호 초기화
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl gap-2" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <span className="text-3xl">👥</span>
                  <p className="text-sm" style={{ color: "#64748b" }}>
                    {!isSuperAdmin && !userClassCode
                      ? "학급 코드가 설정되지 않았습니다."
                      : "등록된 학급 구성원이 없습니다."}
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={loadClassMembers}
                  disabled={membersLoading}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 inline-flex items-center gap-1.5"
                  style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0" }}
                >
                  <span>🔄</span>
                  {membersLoading ? "로딩 중..." : "구성원 목록 새로고침"}
                </button>
              </div>
            </div>
          )}

        {/* 급여 설정 서브탭 */}
        {adminSelectedMenu === "studentAndMember" &&
          studentMemberSubTab === "salary" && (
            <div className="space-y-5">
              {!isSuperAdmin && userClassCode && (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border"
                  style={{ background: "#eef2ff", borderColor: "#c7d2fe" }}
                >
                  <span className="text-base">🏫</span>
                  <span className="text-sm font-medium" style={{ color: "#334155" }}>현재 관리 학급:</span>
                  <span className="text-sm font-bold tracking-wide" style={{ color: "#4338ca" }}>{userClassCode}</span>
                </div>
              )}

              {/* 설정 입력 카드 */}
              <div
                className="rounded-2xl border shadow-sm overflow-hidden"
                style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
              >
                <div
                  className="px-6 py-4 border-b"
                  style={{ background: "#ffffff", borderColor: "#f1f5f9" }}
                >
                  <h3 className="text-base font-bold flex items-center gap-2" style={{ color: "#0f172a" }}>
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm" style={{ background: "#e0e7ff", color: "#4f46e5" }}>💰</span>
                    급여 설정
                  </h3>
                  <p className="text-xs mt-1.5 ml-9" style={{ color: "#475569" }}>
                    세율과 주급 인상률을 설정합니다. 자동 주급 지급은 매주 <strong style={{ color: "#4338ca" }}>금요일 오전 8시</strong>에 실행됩니다.
                  </p>
                </div>

                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-700">세율</span>
                      <span className="text-[11px] text-slate-400">단위 %</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={tempTaxRate}
                        onChange={(e) => setTempTaxRate(e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition text-slate-800 text-sm"
                        placeholder="예: 10"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 ml-1">학생 주급에서 공제되는 세율</p>
                  </div>

                  <div>
                    <label className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-slate-700">주급 인상률</span>
                      <span className="text-[11px] text-slate-400">단위 %</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={tempSalaryIncreaseRate}
                        onChange={(e) => setTempSalaryIncreaseRate(e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition text-slate-800 text-sm"
                        placeholder="예: 3"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 ml-1">매주 자동 적용될 인상률</p>
                  </div>

                  <button
                    onClick={handleSaveSalarySettings}
                    disabled={salarySettingsLoading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-sm hover:shadow transition-all"
                  >
                    {salarySettingsLoading ? "저장 중..." : "💾 급여 설정 저장"}
                  </button>
                </div>
              </div>

              {/* 현재 설정 요약 */}
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-600 text-xs">📊</span>
                    현재 급여 설정
                  </h4>
                </div>
                <div className="grid grid-cols-3 divide-x divide-slate-100">
                  <div className="px-4 py-4 text-center">
                    <p className="text-[11px] text-slate-500 mb-1">세율</p>
                    <p className="text-lg font-bold text-slate-800 tabular-nums">
                      {(salarySettings.taxRate * 100).toFixed(1)}
                      <span className="text-sm text-slate-500 ml-0.5">%</span>
                    </p>
                  </div>
                  <div className="px-4 py-4 text-center">
                    <p className="text-[11px] text-slate-500 mb-1">주급 인상률</p>
                    <p className="text-lg font-bold text-emerald-600 tabular-nums">
                      {(salarySettings.salaryIncreaseRate * 100).toFixed(1)}
                      <span className="text-sm text-slate-500 ml-0.5">%</span>
                    </p>
                  </div>
                  <div className="px-4 py-4 text-center">
                    <p className="text-[11px] text-slate-500 mb-1">마지막 자동 지급</p>
                    <p className="text-xs font-semibold text-slate-700 mt-1.5 break-keep">
                      {formatLastSalaryDate()}
                    </p>
                  </div>
                </div>
              </div>

              {/* 계산 예시 */}
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-600 text-xs">🧮</span>
                    주급 계산 예시
                  </h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3].map((n) => {
                    const gross = 2000000 + (n - 1) * 500000;
                    const tax = gross * salarySettings.taxRate;
                    const net = gross - tax;
                    return (
                      <div key={n} className="px-6 py-3 flex items-center gap-3 text-sm flex-wrap">
                        <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">{n}</span>
                        <span className="text-slate-500 text-xs shrink-0">직업 {n}개</span>
                        <span className="text-slate-700 tabular-nums">{(gross / 10000).toFixed(0)}만</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-rose-500 text-xs tabular-nums">세금 {(tax / 10000).toFixed(0)}만</span>
                        <span className="text-slate-300">→</span>
                        <span className="font-bold text-emerald-600 tabular-nums">{(net / 10000).toFixed(0)}만</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 자동 지급 안내 */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 border border-indigo-100 px-6 py-5">
                <h4 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                  <span>⚡</span>
                  자동 주급 지급 시스템
                </h4>
                <ul className="space-y-2 text-xs text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">🤖</span>
                    <span>매주 <strong className="text-indigo-700">금요일 오전 8시</strong>에 서버에서 자동으로 주급이 지급됩니다</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">📈</span>
                    <span>매주 주급 인상률만큼 급여가 자동으로 인상됩니다</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">💰</span>
                    <span>세금이 자동으로 공제되어 실급여가 지급됩니다</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚙️</span>
                    <span>관리자가 로그인하지 않아도 자동으로 실행됩니다</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

        {/* ===== 시스템 통합 탭 ===== */}
        {adminSelectedMenu === "system" && (
          <div className="flex gap-2 mb-4 p-2 rounded-xl bg-white border border-slate-200 shadow-sm">
            <button
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${systemSubTab === "database" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
              onClick={() => setSystemSubTab("database")}
            >
              데이터베이스
            </button>
            {isSuperAdmin && (
              <button
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${systemSubTab === "system" ? "bg-indigo-50 text-indigo-700 border border-indigo-300" : "text-slate-600 border border-transparent hover:text-indigo-600 hover:bg-indigo-50/60"}`}
                onClick={() => setSystemSubTab("system")}
              >
                시스템 관리
              </button>
            )}
          </div>
        )}

        {/* 데이터베이스 서브탭 */}
        {adminSelectedMenu === "system" && systemSubTab === "database" && (
          <div className="database-management-tab">
            {!isSuperAdmin && userClassCode && (
              <div className="class-info-header">
                <p className="current-class-info">
                  🏫 현재 관리 학급: <strong>{userClassCode}</strong>
                </p>
              </div>
            )}
            <div className="database-management-container section-card min-h-[500px] max-h-[70vh] overflow-auto">
              <AdminDatabase />
            </div>

            {/* 개인정보 관련 문서 */}
            <div className="section-card mt-6 p-6 rounded-2xl bg-violet-500/5 border border-violet-500/30">
              <h3 className="text-lg font-bold text-violet-300 mb-3">
                개인정보 보호 문서
              </h3>
              <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
                학부모 동의서 양식과 개인정보처리방침을 확인하세요.
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="/consent-form"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-slate-800 dark:text-white rounded-lg transition-colors text-sm font-medium"
                >
                  📄 가정통신문 (동의서 양식)
                </a>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-800 dark:text-white rounded-lg transition-colors text-sm font-medium"
                >
                  🔒 개인정보처리방침
                </a>
              </div>
            </div>

            {/* 위험 구역: 학급 데이터 삭제 */}
            <ClassDataDeletionSection
              userClassCode={userClassCode}
              isAdmin={isAdmin}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        )}

        {/* 시스템 관리 서브탭 */}
        {adminSelectedMenu === "system" && systemSubTab === "system" && (
          <div className="system-management-tab">
            {isSuperAdmin && (
              <div className="class-info-header">
                <p className="current-class-info">
                  🌐 시스템 전체 관리 (최고 관리자)
                </p>
              </div>
            )}
            {/* 학급 코드 관리 섹션 */}
            {isSuperAdmin && (
              <div className="admin-class-codes-container section-card">
                <h3>학급 코드 관리</h3>
                {error && <p className="error-message">{error}</p>}
                <div className="add-class-code-form">
                  <input
                    type="text"
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value)}
                    placeholder="새 학급 코드 입력"
                    disabled={classCodeOperationLoading}
                    style={inputStyle}
                  />
                  <button
                    onClick={handleAddClassCode}
                    disabled={classCodeOperationLoading || !newClassCode.trim()}
                    style={actionBtnStyle}
                  >
                    {classCodeOperationLoading ? "추가 중..." : "코드 추가"}
                  </button>
                </div>
                <div className="class-codes-list">
                  <h4>
                    등록된 학급 코드 목록 (
                    {Array.isArray(classCodes) ? classCodes.length : 0}개)
                  </h4>
                  {Array.isArray(classCodes) && classCodes.length > 0 ? (
                    <ul className="codes-list">
                      {classCodes.map((code) => (
                        <li key={code} className="code-item">
                          <span className="code-text">{code}</span>
                          <button
                            onClick={() => handleRemoveClassCode(code)}
                            className="remove-code-button"
                            disabled={classCodeOperationLoading}
                          >
                            삭제
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-codes-message">
                      등록된 학급 코드가 없습니다.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 서버 상태 모니터링 섹션 */}
            <SystemMonitoring isSuperAdmin={isSuperAdmin} />
          </div>
        )}

        <div className="admin-settings-footer">
          <button
            onClick={() => setShowAdminSettingsModal(false)}
            style={closeBtnStyle}
          >
            닫기
          </button>
        </div>
      </div>

      {/* 학생 직업 수정 모달 */}
      {showEditStudentJobsModal && selectedStudent && (
        <div className="modal-overlay show">
          <div className="edit-student-jobs-modal">
            <div className="modal-header">
              <h3>
                학생 직업 설정:{" "}
                {selectedStudent.nickname || selectedStudent.name}
              </h3>
              <button
                className="close-modal-btn"
                onClick={() => setShowEditStudentJobsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                <strong>
                  {selectedStudent.nickname || selectedStudent.name}
                </strong>
                님의 직업을 설정합니다.
              </p>
              <div className="salary-info">
                <p>
                  현재 보유 현금: {(selectedStudent.cash || 0).toLocaleString()}
                  원
                </p>
                {(() => {
                  const salaryCalc = calculateSalary(tempSelectedJobIds, true);
                  return (
                    <>
                      <p>
                        예상 총급여:{" "}
                        {`${(salaryCalc.gross / 10000).toFixed(0)}만원`}
                      </p>
                      <p>
                        세금 공제:{" "}
                        {`${(salaryCalc.tax / 10000).toFixed(0)}만원`} (
                        {(salarySettings.taxRate * 100).toFixed(1)}%)
                      </p>
                      <p>
                        실급여: {`${(salaryCalc.net / 10000).toFixed(0)}만원`}
                      </p>
                    </>
                  );
                })()}
                <p className="salary-explanation">
                  (기본 200만원 + 추가 직업당 50만원, 세금{" "}
                  {(salarySettings.taxRate * 100).toFixed(1)}% 공제)
                </p>
              </div>
              <div className="job-selection-list">
                {Array.isArray(jobs) &&
                jobs.filter((job) => job.active !== false).length > 0 ? (
                  jobs
                    .filter((job) => job.active !== false)
                    .map((job) => (
                      <div key={job.id} className="job-selection-item">
                        <input
                          type="checkbox"
                          id={`job-modal-${job.id}`}
                          checked={tempSelectedJobIds.includes(job.id)}
                          onChange={() => handleToggleJobSelection(job.id)}
                        />
                        <label htmlFor={`job-modal-${job.id}`}>
                          {job.title}
                        </label>
                      </div>
                    ))
                ) : (
                  <p className="no-items-message">
                    설정 가능한 직업이 없습니다.
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                style={cancelBtnStyle}
                onClick={() => setShowEditStudentJobsModal(false)}
              >
                취소
              </button>
              <button
                style={saveBtnStyle}
                onClick={handleSaveStudentJobs}
                disabled={appLoading}
              >
                {appLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettingsModal;
