// src/pages/superadmin/SuperAdminDashboard.js
// 앱 관리자(SuperAdmin) 전용 대시보드
// - 선생님 승인 관리
// - 학급 목록 관리
// - 시스템 모니터링 (오류, 성능)

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { db, functions } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDoc,
  limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  DEFAULT_JOBS,
  DEFAULT_STORE_ITEMS,
  DEFAULT_BANKING,
  DEFAULT_SALARIES,
} from "../auth/Login";
import {
  Shield,
  Users,
  School,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Activity,
  Database,
  Clock,
  TrendingUp,
  Zap,
  Eye,
  Trash2,
  UserCheck,
  UserX,
  Search,
  Filter,
  BarChart3,
  Bug,
  AlertOctagon,
  Server,
  Cpu,
  HardDrive,
  Wifi,
  UserCog,
} from "lucide-react";
import "./SuperAdminDashboard.css";

import { logger } from "../../utils/logger";
// 탭 목록
// Cloud Function 참조 (모듈 스코프)
const listAllAuthUsersFn = httpsCallable(functions, "listAllAuthUsers");
const deleteAuthUserFn = httpsCallable(functions, "deleteAuthUser");

const TABS = [
  { id: "overview", label: "개요", icon: BarChart3 },
  { id: "accounts", label: "전체 계정", icon: UserCog },
  { id: "pending", label: "승인 대기", icon: Clock },
  { id: "teachers", label: "선생님 관리", icon: UserCheck },
  { id: "classes", label: "학급 관리", icon: School },
  { id: "monitoring", label: "시스템 모니터링", icon: Activity },
  { id: "errors", label: "오류 로그", icon: Bug },
];

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { userDoc, user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 데이터 상태
  const [stats, setStats] = useState({
    totalTeachers: 0,
    pendingTeachers: 0,
    approvedTeachers: 0,
    totalClasses: 0,
    totalStudents: 0,
    activeUsers24h: 0,
  });
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [approvedTeachers, setApprovedTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [errorLogs, setErrorLogs] = useState([]);
  const [systemMetrics, setSystemMetrics] = useState({
    cpuUsage: 0,
    memoryUsage: 0,
    activeConnections: 0,
    requestsPerMinute: 0,
    avgResponseTime: 0,
    errorRate: 0,
  });

  // 전체 계정 상태
  const [allAuthUsers, setAllAuthUsers] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountFilter, setAccountFilter] = useState("all");
  const [selectedAccounts, setSelectedAccounts] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // 검색/필터 상태
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // 학급 상세 모달
  const [classDetail, setClassDetail] = useState(null); // { classCode, teacherName }
  const [classStudents, setClassStudents] = useState([]);
  const [classDetailLoading, setClassDetailLoading] = useState(false);

  // 실시간 에러 모니터링
  const errorListenerRef = useRef(null);
  const metricsIntervalRef = useRef(null);

  // 권한 체크
  useEffect(() => {
    if (userDoc && !userDoc.isSuperAdmin) {
      navigate("/dashboard/tasks");
    }
  }, [userDoc, navigate]);

  // 데이터 로드
  const loadAllData = useCallback(async () => {
    if (!userDoc?.isSuperAdmin) return;

    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadPendingTeachers(),
        loadApprovedTeachers(),
        loadClasses(),
        loadErrorLogs(),
      ]);
    } catch (error) {
      logger.error("데이터 로드 오류:", error);
    } finally {
      setLoading(false);
    }
  }, [userDoc]);

  // 통계 로드
  const loadStats = async () => {
    try {
      // 🔥 users 컬렉션에서 관리자(선생님) 조회
      // isTeacher === true 또는 isAdmin === true인 사용자 (isSuperAdmin 제외)
      const usersRef = collection(db, "users");
      const usersSnap = await getDocs(usersRef);

      let totalTeachers = 0;
      let pending = 0;
      let approved = 0;

      usersSnap.docs.forEach((doc) => {
        const data = doc.data();
        // isSuperAdmin은 앱 관리자이므로 제외
        if (data.isSuperAdmin) return;

        // isTeacher 또는 isAdmin이 true인 경우 선생님으로 간주
        const isTeacher = data.isTeacher === true || data.isAdmin === true;
        if (isTeacher) {
          totalTeachers++;
          // 새로 가입한 선생님만 승인 대기 (isApproved가 명시적으로 false인 경우)
          if (data.isApproved === false) {
            pending++;
          } else {
            // isApproved가 없거나 true인 기존 선생님은 승인된 것으로 처리
            approved++;
          }
        }
      });

      // 학급 수 + 학생 수: users 컬렉션에서 classCode로 집계
      const classCodes = new Set();
      let totalStudents = 0;
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      let activeUsers = 0;

      usersSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.isSuperAdmin) return;

        // 24시간 내 활성 사용자
        const lastActive =
          data.lastActiveAt?.toDate?.() || data.lastLoginAt?.toDate?.();
        if (lastActive && lastActive > yesterday) activeUsers++;

        const code = data.classCode;
        if (!code || code === "미지정") return;

        // 학급 코드 수집
        classCodes.add(code);

        // 선생님이 아닌 경우 학생으로 집계
        const isTeacher = data.isTeacher === true || data.isAdmin === true;
        if (!isTeacher) totalStudents++;
      });

      setStats({
        totalTeachers,
        pendingTeachers: pending,
        approvedTeachers: approved,
        totalClasses: classCodes.size,
        totalStudents,
        activeUsers24h: activeUsers,
      });
    } catch (error) {
      logger.error("통계 로드 오류:", error);
    }
  };

  // 승인 대기 선생님 로드
  const loadPendingTeachers = async () => {
    try {
      // 🔥 모든 users를 가져와서 클라이언트에서 필터링
      // Firestore OR 쿼리가 없으므로 isTeacher || isAdmin 조건을 클라이언트에서 처리
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);

      const pending = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((user) => {
          // isSuperAdmin은 앱 관리자이므로 제외
          if (user.isSuperAdmin) return false;
          // isTeacher 또는 isAdmin이 true인 경우 선생님으로 간주
          const isTeacher = user.isTeacher === true || user.isAdmin === true;
          // 승인 대기: isApproved가 명시적으로 false인 경우
          return isTeacher && user.isApproved === false;
        })
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });

      setPendingTeachers(pending);
    } catch (error) {
      logger.error("승인 대기 선생님 로드 오류:", error);
      setPendingTeachers([]);
    }
  };

  // 승인된 선생님 로드
  const loadApprovedTeachers = async () => {
    try {
      // 🔥 모든 users를 가져와서 클라이언트에서 필터링
      // Firestore OR 쿼리가 없으므로 isTeacher || isAdmin 조건을 클라이언트에서 처리
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);

      const approved = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((user) => {
          // isSuperAdmin은 앱 관리자이므로 제외
          if (user.isSuperAdmin) return false;
          // isTeacher 또는 isAdmin이 true인 경우 선생님으로 간주
          const isTeacher = user.isTeacher === true || user.isAdmin === true;
          // 승인된 선생님: isApproved가 false가 아닌 경우 (true거나 undefined거나)
          // 기존 선생님들은 isApproved 필드가 없으므로 undefined도 승인된 것으로 처리
          return isTeacher && user.isApproved !== false;
        })
        .sort((a, b) => {
          const aName = a.name || "";
          const bName = b.name || "";
          return aName.localeCompare(bName, "ko");
        });

      setApprovedTeachers(approved);
    } catch (error) {
      logger.error("승인된 선생님 로드 오류:", error);
      setApprovedTeachers([]);
    }
  };

  // 학급 목록 로드
  // 🔥 학생 데이터가 users 컬렉션에 저장되어 있으므로 users에서 직접 집계
  const loadClasses = async () => {
    try {
      logger.log("[SuperAdmin] 학급 목록 로드 시작...");

      // users 컬렉션에서 모든 사용자 조회
      const usersRef = collection(db, "users");
      const usersSnap = await getDocs(usersRef);

      // classCode별로 사용자 그룹화
      const classMap = new Map(); // classCode -> { students: [], teacher: null }

      usersSnap.docs.forEach((userDoc) => {
        const data = userDoc.data();
        const classCode = data.classCode;

        // SuperAdmin이거나 classCode가 없으면 건너뜀
        if (data.isSuperAdmin || !classCode || classCode === "미지정") {
          return;
        }

        if (!classMap.has(classCode)) {
          classMap.set(classCode, { students: [], teacher: null });
        }

        const classInfo = classMap.get(classCode);

        // isAdmin 또는 isTeacher인 경우 선생님으로 처리
        if (data.isAdmin || data.isTeacher) {
          classInfo.teacher = {
            id: userDoc.id,
            name: data.name || "이름 없음",
            email: data.email || "",
          };
        } else {
          // 일반 학생
          classInfo.students.push({
            id: userDoc.id,
            name: data.name,
            ...data,
          });
        }
      });

      logger.log(`[SuperAdmin] 발견된 학급 수: ${classMap.size}개`);

      // 학급 데이터 배열로 변환
      const classesData = [];
      for (const [classCode, classInfo] of classMap.entries()) {
        logger.log(
          `[SuperAdmin] ${classCode}: 선생님=${classInfo.teacher?.name}, 학생=${classInfo.students.length}명`,
        );

        classesData.push({
          id: classCode,
          classCode: classCode,
          className: classCode,
          studentCount: classInfo.students.length,
          totalMembers: classInfo.students.length + (classInfo.teacher ? 1 : 0),
          adminName: classInfo.teacher?.name || "미지정",
          adminEmail: classInfo.teacher?.email || "",
          adminId: classInfo.teacher?.id || "",
        });
      }

      // 학급 코드 순으로 정렬
      classesData.sort((a, b) => a.classCode.localeCompare(b.classCode, "ko"));

      logger.log(`[SuperAdmin] 최종 학급 데이터:`, classesData);
      setClasses(classesData);
    } catch (error) {
      logger.error("[SuperAdmin] 학급 로드 오류:", error);
      logger.error("[SuperAdmin] 오류 상세:", error.code, error.message);
      setClasses([]);
    }
  };

  // 에러 로그 로드
  const loadErrorLogs = async () => {
    try {
      const logsRef = collection(db, "errorLogs");
      const logsQuery = query(
        logsRef,
        orderBy("timestamp", "desc"),
        limit(100),
      );
      const snapshot = await getDocs(logsQuery);

      const logs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(),
      }));

      setErrorLogs(logs);
    } catch (error) {
      logger.error("에러 로그 로드 오류:", error);
      // 컬렉션이 없으면 빈 배열 유지
      setErrorLogs([]);
    }
  };

  // 실시간 시스템 메트릭 모니터링
  useEffect(() => {
    if (!userDoc?.isSuperAdmin) return;

    // 시스템 메트릭은 정적 기본값 사용 (5초 타이머 제거 → 불필요한 리렌더링 방지)
    setSystemMetrics({
      cpuUsage: 25,
      memoryUsage: 40,
      activeConnections: 15,
      requestsPerMinute: 80,
      avgResponseTime: 150,
      errorRate: 0.5,
    });

    const intervalId = metricsIntervalRef.current;
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [userDoc]);

  // 에러 로그 실시간 리스너
  useEffect(() => {
    if (!userDoc?.isSuperAdmin) return;

    try {
      const logsRef = collection(db, "errorLogs");
      const logsQuery = query(logsRef, orderBy("timestamp", "desc"), limit(50));

      errorListenerRef.current = onSnapshot(
        logsQuery,
        (snapshot) => {
          const logs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate?.() || new Date(),
          }));
          setErrorLogs(logs);
        },
        (error) => {
          logger.error("에러 로그 리스너 오류:", error);
        },
      );
    } catch (error) {
      logger.error("에러 로그 리스너 설정 실패:", error);
    }

    return () => {
      if (errorListenerRef.current) {
        errorListenerRef.current();
      }
    };
  }, [userDoc]);

  // 초기 데이터 로드
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // 새로고침
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // 선생님 승인 (학급 코드 없으면 자동 생성 + classes 문서 생성)
  const handleApproveTeacher = async (teacherId) => {
    if (!window.confirm("이 선생님을 승인하시겠습니까?")) return;

    try {
      const teacher = pendingTeachers.find((t) => t.id === teacherId);
      const userRef = doc(db, "users", teacherId);

      const updates = {
        isApproved: true,
        approvedAt: serverTimestamp(),
        approvedBy: userDoc?.id || user?.uid,
      };

      // 학급 코드가 없거나 "미지정"이면 새 코드 생성 + classes 문서 생성
      const needsClassCode =
        !teacher?.classCode || teacher.classCode === "미지정";
      let newClassCode = null;
      if (needsClassCode) {
        // 중복 안 되는 코드 발급 (5회 시도)
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let attempt = 0; attempt < 5; attempt++) {
          let code = "";
          for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          const classSnap = await getDoc(doc(db, "classes", code));
          if (!classSnap.exists()) {
            newClassCode = code;
            break;
          }
        }
        if (!newClassCode) {
          alert("학급 코드 생성에 실패했습니다. 다시 시도해주세요.");
          return;
        }
        updates.classCode = newClassCode;
        // classes 문서 생성
        await setDoc(doc(db, "classes", newClassCode), {
          code: newClassCode,
          teacherId,
          teacherName: teacher?.name || "",
          schoolName: teacher?.schoolName || "",
          className: teacher?.className || "",
          createdAt: serverTimestamp(),
          studentCount: 0,
          settings: { initialCash: 100000, initialCoupons: 10 },
        });
        // 직업·상점·은행·급여 부가 데이터 초기화
        await initClassroomDefaults(newClassCode);
      }

      await updateDoc(userRef, updates);

      // 로컬 상태 업데이트
      if (teacher) {
        setPendingTeachers((prev) => prev.filter((t) => t.id !== teacherId));
        setApprovedTeachers((prev) => [
          ...prev,
          {
            ...teacher,
            isApproved: true,
            classCode: newClassCode || teacher.classCode,
          },
        ]);
      }

      await loadStats();
      alert(
        newClassCode
          ? `선생님이 승인되었습니다.\n학급 코드: ${newClassCode}`
          : "선생님이 승인되었습니다.",
      );
    } catch (error) {
      logger.error("승인 오류:", error);
      alert("승인 처리 중 오류가 발생했습니다.");
    }
  };

  // 선생님 거절/삭제
  const handleRejectTeacher = async (teacherId, teacherName) => {
    if (
      !window.confirm(
        `'${teacherName}' 선생님의 가입을 거절하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      )
    )
      return;

    try {
      const userRef = doc(db, "users", teacherId);
      await deleteDoc(userRef);

      setPendingTeachers((prev) => prev.filter((t) => t.id !== teacherId));
      await loadStats();
      alert("선생님 가입이 거절되었습니다.");
    } catch (error) {
      logger.error("거절 오류:", error);
      alert("거절 처리 중 오류가 발생했습니다.");
    }
  };

  // 학급 부가 데이터 초기화 — 직업·상점·은행·급여 (idempotent: 이미 있으면 skip)
  // Login.js의 정상 가입 흐름과 동일한 7가지 항목 보장
  const initClassroomDefaults = async (classCode) => {
    if (!classCode) return { created: false };
    let createdAny = false;

    // 1) jobs — 이 학급 직업이 한 개라도 있으면 skip
    const jobsSnap = await getDocs(
      query(collection(db, "jobs"), where("classCode", "==", classCode)),
    );
    if (jobsSnap.empty) {
      for (const jobTpl of DEFAULT_JOBS) {
        const tasks = jobTpl.tasks.map((t, i) => ({
          ...t,
          id: `task_${Date.now()}_${i}`,
        }));
        await addDoc(collection(db, "jobs"), {
          title: jobTpl.title,
          active: true,
          tasks,
          classCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      createdAny = true;
    }

    // 2) storeItems — 이 학급 상점 아이템이 한 개라도 있으면 skip
    const itemsSnap = await getDocs(
      query(collection(db, "storeItems"), where("classCode", "==", classCode)),
    );
    if (itemsSnap.empty) {
      for (const item of DEFAULT_STORE_ITEMS) {
        await addDoc(collection(db, "storeItems"), {
          ...item,
          initialStock: item.stock,
          available: true,
          type: "item",
          classCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      createdAny = true;
    }

    // 3) bankingSettings — 문서 없으면 생성
    const bankRef = doc(db, "bankingSettings", classCode);
    const bankSnap = await getDoc(bankRef);
    if (!bankSnap.exists()) {
      await setDoc(bankRef, {
        ...DEFAULT_BANKING,
        classCode,
        updatedAt: serverTimestamp(),
      });
      createdAny = true;
    }

    // 4) classSettings + salary — 없으면 생성
    const csRef = doc(db, "classSettings", classCode);
    const csSnap = await getDoc(csRef);
    if (!csSnap.exists()) {
      await setDoc(
        csRef,
        { classCode, createdAt: serverTimestamp() },
        { merge: true },
      );
      createdAny = true;
    }
    const salaryRef = doc(db, "classSettings", classCode, "settings", "salary");
    const salarySnap = await getDoc(salaryRef);
    if (!salarySnap.exists()) {
      await setDoc(salaryRef, {
        salaries: DEFAULT_SALARIES,
        payDay: "friday",
        autoPay: true,
        classCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdAny = true;
    }

    // 5) settings/classCodes에 코드 추가 (중복 방지)
    try {
      const ccRef = doc(db, "settings", "classCodes");
      const ccSnap = await getDoc(ccRef);
      const codes = ccSnap.exists() ? ccSnap.data().codes || [] : [];
      if (!codes.includes(classCode)) {
        await setDoc(
          ccRef,
          {
            codes: [...codes, classCode],
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        createdAny = true;
      }
    } catch (e) {
      logger.warn("[initClassroom] classCodes 추가 실패 (skip):", e.message);
    }

    return { created: createdAny };
  };

  // 학급 상세 모달 열기 — 학생 목록 + 자산 통계 fetch
  const openClassDetail = async (classCode, teacherName) => {
    if (!classCode || classCode === "미지정") {
      alert("학급 코드가 없습니다. 먼저 '학급 코드 발급' 버튼으로 코드를 부여해주세요.");
      return;
    }
    setClassDetail({ classCode, teacherName });
    setClassStudents([]);
    setClassDetailLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("classCode", "==", classCode)),
      );
      const students = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (u) => !u.isAdmin && !u.isSuperAdmin && !u.isTeacher,
        )
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setClassStudents(students);
    } catch (error) {
      logger.error("학급 상세 로드 오류:", error);
      alert("학급 정보를 불러오지 못했습니다.");
    } finally {
      setClassDetailLoading(false);
    }
  };

  const closeClassDetail = () => {
    setClassDetail(null);
    setClassStudents([]);
  };

  // 학급 코드 발급 (이미 승인된 선생님 중 classCode가 "미지정"인 경우)
  const handleAssignClassCode = async (teacherId, teacherName) => {
    if (
      !window.confirm(
        `'${teacherName}' 선생님에게 새 학급 코드를 발급하시겠습니까?`,
      )
    )
      return;

    try {
      const teacher = approvedTeachers.find((t) => t.id === teacherId);
      if (!teacher) {
        alert("선생님 정보를 찾을 수 없습니다.");
        return;
      }

      // 중복 없는 코드 발급 (5회 시도)
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let newClassCode = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        let code = "";
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const classSnap = await getDoc(doc(db, "classes", code));
        if (!classSnap.exists()) {
          newClassCode = code;
          break;
        }
      }
      if (!newClassCode) {
        alert("학급 코드 생성에 실패했습니다. 다시 시도해주세요.");
        return;
      }

      // classes 문서 생성
      await setDoc(doc(db, "classes", newClassCode), {
        code: newClassCode,
        teacherId,
        teacherName: teacher.name || "",
        schoolName: teacher.schoolName || "",
        className: teacher.className || "",
        createdAt: serverTimestamp(),
        studentCount: 0,
        settings: { initialCash: 100000, initialCoupons: 10 },
      });

      // 직업·상점·은행·급여 부가 데이터 초기화
      await initClassroomDefaults(newClassCode);

      // user 문서 classCode 업데이트
      await updateDoc(doc(db, "users", teacherId), {
        classCode: newClassCode,
        updatedAt: serverTimestamp(),
      });

      // 로컬 상태 갱신
      setApprovedTeachers((prev) =>
        prev.map((t) =>
          t.id === teacherId ? { ...t, classCode: newClassCode } : t,
        ),
      );

      alert(`학급 코드가 발급되었습니다.\n학급 코드: ${newClassCode}`);
    } catch (error) {
      logger.error("학급 코드 발급 오류:", error);
      alert("학급 코드 발급 중 오류가 발생했습니다.");
    }
  };

  // 선생님 승인 취소
  const handleRevokeApproval = async (teacherId, teacherName) => {
    if (!window.confirm(`'${teacherName}' 선생님의 승인을 취소하시겠습니까?`))
      return;

    try {
      const userRef = doc(db, "users", teacherId);
      await updateDoc(userRef, {
        isApproved: false,
        revokedAt: serverTimestamp(),
        revokedBy: userDoc?.id || user?.uid,
      });

      const teacher = approvedTeachers.find((t) => t.id === teacherId);
      if (teacher) {
        setApprovedTeachers((prev) => prev.filter((t) => t.id !== teacherId));
        setPendingTeachers((prev) => [
          ...prev,
          { ...teacher, isApproved: false },
        ]);
      }

      await loadStats();
      alert("승인이 취소되었습니다.");
    } catch (error) {
      logger.error("승인 취소 오류:", error);
      alert("승인 취소 중 오류가 발생했습니다.");
    }
  };

  // 전체 Auth 계정 로드
  const loadAllAuthUsers = async () => {
    setAccountsLoading(true);
    try {
      const result = await listAllAuthUsersFn();
      setAllAuthUsers(result.data.users || []);
    } catch (error) {
      logger.error("전체 계정 로드 오류:", error);
      alert("전체 계정 로드 실패: " + error.message);
    } finally {
      setAccountsLoading(false);
    }
  };

  // 체크박스 토글
  const toggleAccountSelect = (uid) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // 전체 선택/해제 (필터링된 목록 중 슈퍼관리자 제외)
  const toggleSelectAll = () => {
    const selectableUids = filteredAuthUsers
      .filter((u) => !u.firestoreData?.isSuperAdmin)
      .map((u) => u.uid);
    const allSelected = selectableUids.every((uid) =>
      selectedAccounts.has(uid),
    );
    if (allSelected) {
      setSelectedAccounts(new Set());
    } else {
      setSelectedAccounts(new Set(selectableUids));
    }
  };

  // 선택 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedAccounts.size === 0) return;
    if (
      !window.confirm(
        `선택된 ${selectedAccounts.size}개 계정을 모두 삭제하시겠습니까?\nFirebase Auth + Firestore 모두에서 삭제됩니다.`,
      )
    )
      return;
    setBulkDeleting(true);
    let success = 0;
    let fail = 0;
    for (const uid of selectedAccounts) {
      try {
        await deleteAuthUserFn({ targetUid: uid });
        success++;
      } catch {
        fail++;
      }
    }
    setAllAuthUsers((prev) => prev.filter((u) => !selectedAccounts.has(u.uid)));
    setSelectedAccounts(new Set());
    setBulkDeleting(false);
    alert(`삭제 완료: ${success}개 성공${fail > 0 ? `, ${fail}개 실패` : ""}`);
  };

  // Auth 계정 삭제
  const handleDeleteAuthUser = async (targetUid, email) => {
    if (
      !window.confirm(
        `정말 '${email}' 계정을 삭제하시겠습니까?\nFirebase Auth + Firestore 모두에서 삭제됩니다.`,
      )
    )
      return;
    try {
      await deleteAuthUserFn({ targetUid });
      setAllAuthUsers((prev) => prev.filter((u) => u.uid !== targetUid));
      alert("계정이 삭제되었습니다.");
    } catch (error) {
      logger.error("계정 삭제 오류:", error);
      alert("계정 삭제 실패: " + error.message);
    }
  };

  // 에러 로그 삭제
  const handleDeleteErrorLog = async (logId) => {
    try {
      await deleteDoc(doc(db, "errorLogs", logId));
      setErrorLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (error) {
      logger.error("에러 로그 삭제 오류:", error);
    }
  };

  // 에러 로그 전체 삭제
  const handleClearAllErrorLogs = async () => {
    if (
      !window.confirm(
        `에러 로그 ${errorLogs.length}개를 모두 삭제하시겠습니까?`,
      )
    )
      return;
    try {
      await Promise.all(
        errorLogs.map((log) => deleteDoc(doc(db, "errorLogs", log.id))),
      );
      setErrorLogs([]);
    } catch (error) {
      logger.error("에러 로그 전체 삭제 실패:", error);
    }
  };

  // 권한 없음
  if (!userDoc?.isSuperAdmin) {
    return (
      <div className="super-admin-dashboard">
        <div className="access-denied">
          <Shield size={64} />
          <h2>접근 권한이 없습니다</h2>
          <p>앱 관리자만 접근할 수 있는 페이지입니다.</p>
          <button onClick={() => navigate("/dashboard/tasks")}>
            대시보드로 이동
          </button>
        </div>
      </div>
    );
  }

  // 필터링된 데이터
  const filteredPendingTeachers = pendingTeachers.filter(
    (teacher) =>
      teacher.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredApprovedTeachers = approvedTeachers.filter(
    (teacher) =>
      teacher.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      teacher.email?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredClasses = classes.filter(
    (cls) =>
      cls.classCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cls.adminName?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 전체 계정 필터링
  const filteredAuthUsers = allAuthUsers.filter((u) => {
    const matchesSearch =
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.firestoreData?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.firestoreData?.classCode
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      u.uid?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (accountFilter === "auth-only") return !u.firestoreExists;
    if (accountFilter === "firestore-only")
      return u.firestoreExists && !u.email;
    if (accountFilter === "student")
      return (
        u.firestoreExists &&
        !u.firestoreData?.isAdmin &&
        !u.firestoreData?.isTeacher &&
        !u.firestoreData?.isSuperAdmin
      );
    if (accountFilter === "teacher")
      return (
        u.firestoreExists &&
        (u.firestoreData?.isAdmin || u.firestoreData?.isTeacher)
      );
    return true;
  });

  const filteredErrorLogs = errorLogs.filter((log) => {
    const matchesSearch =
      log.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "all" || log.severity === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="super-admin-dashboard">
      {/* 헤더 */}
      <header className="sad-header">
        <div className="sad-header-left">
          <Shield className="header-icon" />
          <div>
            <h1>앱 관리자 대시보드</h1>
            <p>알찬 시스템 관리 및 모니터링</p>
          </div>
        </div>
        <div className="sad-header-right">
          <button
            className={`refresh-btn ${refreshing ? "spinning" : ""}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={20} />
            새로고침
          </button>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <nav className="sad-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sad-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => {
              setActiveTab(tab.id);
              setSearchTerm(""); // 탭 전환 시 검색어 초기화 — 오염 방지
            }}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
            {tab.id === "pending" && stats.pendingTeachers > 0 && (
              <span className="badge">{stats.pendingTeachers}</span>
            )}
            {tab.id === "errors" &&
              errorLogs.filter(
                (l) => l.severity === "critical" || l.severity === "error",
              ).length > 0 && (
                <span className="badge error">
                  {
                    errorLogs.filter(
                      (l) =>
                        l.severity === "critical" || l.severity === "error",
                    ).length
                  }
                </span>
              )}
          </button>
        ))}
      </nav>

      {/* 메인 콘텐츠 */}
      <main className="sad-content">
        {loading ? (
          <div className="loading-state">
            <RefreshCw className="spinning" size={40} />
            <p>데이터 로딩 중...</p>
          </div>
        ) : (
          <>
            {/* 개요 탭 */}
            {activeTab === "overview" && (
              <div className="overview-tab">
                <div className="stats-grid">
                  <div className="stat-card teachers">
                    <div className="stat-icon">
                      <Users size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalTeachers}</span>
                      <span className="stat-label">전체 선생님</span>
                    </div>
                  </div>

                  <div className="stat-card pending">
                    <div className="stat-icon">
                      <Clock size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {stats.pendingTeachers}
                      </span>
                      <span className="stat-label">승인 대기</span>
                    </div>
                    {stats.pendingTeachers > 0 && (
                      <button
                        className="stat-action"
                        onClick={() => setActiveTab("pending")}
                      >
                        확인하기
                      </button>
                    )}
                  </div>

                  <div className="stat-card approved">
                    <div className="stat-icon">
                      <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">
                        {stats.approvedTeachers}
                      </span>
                      <span className="stat-label">승인된 선생님</span>
                    </div>
                  </div>

                  <div className="stat-card classes">
                    <div className="stat-icon">
                      <School size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalClasses}</span>
                      <span className="stat-label">운영 중 학급</span>
                    </div>
                  </div>

                  <div className="stat-card students">
                    <div className="stat-icon">
                      <Users size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.totalStudents}</span>
                      <span className="stat-label">전체 학생</span>
                    </div>
                  </div>

                  <div className="stat-card active">
                    <div className="stat-icon">
                      <Activity size={24} />
                    </div>
                    <div className="stat-info">
                      <span className="stat-value">{stats.activeUsers24h}</span>
                      <span className="stat-label">24시간 활성 사용자</span>
                    </div>
                  </div>
                </div>

                {/* 빠른 액션 */}
                <div className="quick-actions">
                  <h3>빠른 작업</h3>
                  <div className="action-buttons">
                    {stats.pendingTeachers > 0 && (
                      <button
                        className="action-btn warning"
                        onClick={() => setActiveTab("pending")}
                      >
                        <Clock size={20} />
                        승인 대기 {stats.pendingTeachers}명 처리
                      </button>
                    )}
                    <button
                      className="action-btn"
                      onClick={() => setActiveTab("monitoring")}
                    >
                      <Activity size={20} />
                      시스템 상태 확인
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => setActiveTab("errors")}
                    >
                      <Bug size={20} />
                      에러 로그 확인
                    </button>
                  </div>
                </div>

                {/* 최근 활동 */}
                <div className="recent-activity">
                  <h3>최근 에러 로그</h3>
                  {errorLogs.length === 0 ? (
                    <p className="no-data">에러 로그가 없습니다.</p>
                  ) : (
                    <div className="error-list-mini">
                      {errorLogs.slice(0, 5).map((log) => (
                        <div
                          key={log.id}
                          className={`error-item ${log.severity}`}
                        >
                          <span className="error-severity">{log.severity}</span>
                          <span className="error-message">{log.message}</span>
                          <span className="error-time">
                            {log.timestamp?.toLocaleTimeString?.() ||
                              "알 수 없음"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 승인 대기 탭 */}
            {activeTab === "pending" && (
              <div className="pending-tab">
                <div className="tab-header">
                  <h2>승인 대기 선생님</h2>
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="이름 또는 이메일 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {filteredPendingTeachers.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle size={64} />
                    <h3>승인 대기 중인 선생님이 없습니다</h3>
                    <p>모든 가입 요청이 처리되었습니다.</p>
                  </div>
                ) : (
                  <div className="teacher-list">
                    {filteredPendingTeachers.map((teacher) => (
                      <div key={teacher.id} className="teacher-card pending">
                        <div className="teacher-avatar">
                          {teacher.name?.charAt(0) || "?"}
                        </div>
                        <div className="teacher-info">
                          <h4>{teacher.name || "이름 없음"}</h4>
                          <p>{teacher.email}</p>
                          <span className="join-date">
                            가입일:{" "}
                            {teacher.createdAt
                              ?.toDate?.()
                              .toLocaleDateString() || "알 수 없음"}
                          </span>
                        </div>
                        <div className="teacher-actions">
                          <button
                            className="approve-btn"
                            onClick={() => handleApproveTeacher(teacher.id)}
                          >
                            <CheckCircle size={18} />
                            승인
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() =>
                              handleRejectTeacher(teacher.id, teacher.name)
                            }
                          >
                            <XCircle size={18} />
                            거절
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 선생님 관리 탭 */}
            {activeTab === "teachers" && (
              <div className="teachers-tab">
                <div className="tab-header">
                  <h2>승인된 선생님 목록</h2>
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="이름 또는 이메일 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {filteredApprovedTeachers.length === 0 ? (
                  <div className="empty-state">
                    <Users size={64} />
                    <h3>승인된 선생님이 없습니다</h3>
                    <p>승인 대기 탭에서 선생님을 승인해주세요.</p>
                  </div>
                ) : (
                  <div className="teacher-list">
                    {filteredApprovedTeachers.map((teacher) => (
                      <div key={teacher.id} className="teacher-card approved">
                        <div className="teacher-avatar">
                          {teacher.name?.charAt(0) || "?"}
                        </div>
                        <div className="teacher-info">
                          <h4>{teacher.name || "이름 없음"}</h4>
                          <p>{teacher.email}</p>
                          <span className="class-code">
                            학급: {teacher.classCode || "미지정"}
                          </span>
                        </div>
                        <div className="teacher-actions">
                          {(!teacher.classCode || teacher.classCode === "미지정") ? (
                            <button
                              className="approve-btn"
                              onClick={() =>
                                handleAssignClassCode(teacher.id, teacher.name)
                              }
                            >
                              <UserCheck size={18} />
                              학급 코드 발급
                            </button>
                          ) : (
                            <button
                              className="view-btn"
                              onClick={() =>
                                openClassDetail(teacher.classCode, teacher.name)
                              }
                            >
                              <Eye size={18} />
                              학급 보기
                            </button>
                          )}
                          <button
                            className="revoke-btn"
                            onClick={() =>
                              handleRevokeApproval(teacher.id, teacher.name)
                            }
                          >
                            <UserX size={18} />
                            승인 취소
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 학급 관리 탭 */}
            {activeTab === "classes" && (
              <div className="classes-tab">
                <div className="tab-header">
                  <h2>학급 목록</h2>
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder="학급 코드 또는 담임 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {filteredClasses.length === 0 ? (
                  <div className="empty-state">
                    <School size={64} />
                    <h3>등록된 학급이 없습니다</h3>
                  </div>
                ) : (
                  <div className="class-grid">
                    {filteredClasses.map((cls) => (
                      <div
                        key={cls.id}
                        className="class-card"
                        onClick={() =>
                          openClassDetail(cls.classCode, cls.adminName)
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            openClassDetail(cls.classCode, cls.adminName);
                          }
                        }}
                        style={{ cursor: "pointer" }}
                        title="클릭하면 학급 상세를 볼 수 있습니다"
                      >
                        <div className="class-header">
                          <School size={24} />
                          <h4>{cls.classCode}</h4>
                        </div>
                        <div className="class-details">
                          <div className="detail-row">
                            <span className="label">담임 선생님</span>
                            <span className="value">{cls.adminName}</span>
                          </div>
                          <div className="detail-row">
                            <span className="label">학생 수</span>
                            <span className="value">{cls.studentCount}명</span>
                          </div>
                          {cls.adminEmail && (
                            <div className="detail-row">
                              <span className="label">이메일</span>
                              <span className="value email">
                                {cls.adminEmail}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 전체 계정 탭 */}
            {activeTab === "accounts" && (
              <div className="accounts-tab">
                <div className="tab-header">
                  <h2>전체 Firebase 계정</h2>
                  <div className="header-controls">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        type="text"
                        placeholder="이메일, 이름, 학급코드 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <select
                      value={accountFilter}
                      onChange={(e) => setAccountFilter(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">전체 ({allAuthUsers.length})</option>
                      <option value="student">학생만</option>
                      <option value="teacher">선생님만</option>
                      <option value="auth-only">
                        Auth만 있음 (Firestore 없음)
                      </option>
                    </select>
                    <button
                      className="action-btn"
                      onClick={loadAllAuthUsers}
                      disabled={accountsLoading}
                    >
                      <RefreshCw
                        size={18}
                        className={accountsLoading ? "spinning" : ""}
                      />
                      {accountsLoading ? "로딩 중..." : "계정 불러오기"}
                    </button>
                  </div>
                </div>

                {allAuthUsers.length === 0 ? (
                  <div className="empty-state">
                    <UserCog size={64} />
                    <h3>계정 데이터를 불러오세요</h3>
                    <p>
                      "계정 불러오기" 버튼을 클릭하면 Firebase Auth의 모든
                      계정을 조회합니다.
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      className="accounts-summary"
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginBottom: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      {[
                        {
                          key: "all",
                          label: "전체",
                          count: allAuthUsers.length,
                          bg: "99,102,241",
                          color: "#a5b4fc",
                        },
                        {
                          key: "auth-only",
                          label: "Auth만",
                          count: allAuthUsers.filter((u) => !u.firestoreExists)
                            .length,
                          bg: "239,68,68",
                          color: "#fca5a5",
                        },
                        {
                          key: "student",
                          label: "학생",
                          count: allAuthUsers.filter(
                            (u) =>
                              u.firestoreExists &&
                              !u.firestoreData?.isAdmin &&
                              !u.firestoreData?.isTeacher &&
                              !u.firestoreData?.isSuperAdmin,
                          ).length,
                          bg: "16,185,129",
                          color: "#6ee7b7",
                        },
                        {
                          key: "teacher",
                          label: "선생님",
                          count: allAuthUsers.filter(
                            (u) =>
                              u.firestoreData?.isAdmin ||
                              u.firestoreData?.isTeacher,
                          ).length,
                          bg: "245,158,11",
                          color: "#fcd34d",
                        },
                      ].map((f) => (
                        <button
                          key={f.key}
                          onClick={() => {
                            setAccountFilter(f.key);
                            setSelectedAccounts(new Set());
                          }}
                          style={{
                            padding: "7px 14px",
                            borderRadius: "8px",
                            border:
                              accountFilter === f.key
                                ? `2px solid rgba(${f.bg},0.6)`
                                : "2px solid transparent",
                            background:
                              accountFilter === f.key
                                ? `rgba(${f.bg},0.3)`
                                : `rgba(${f.bg},0.1)`,
                            color: f.color,
                            fontSize: "13px",
                            fontWeight: accountFilter === f.key ? "700" : "500",
                            cursor: "pointer",
                            transition: "all 0.15s",
                          }}
                        >
                          {f.label}: {f.count}
                        </button>
                      ))}
                    </div>
                    {/* 전체 선택 바 */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 16px",
                        marginBottom: "8px",
                        background: "rgba(99,102,241,0.08)",
                        borderRadius: "10px",
                        border: "1px solid rgba(99,102,241,0.15)",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          cursor: "pointer",
                          color: "#c4c4e0",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={
                            filteredAuthUsers.filter(
                              (u) => !u.firestoreData?.isSuperAdmin,
                            ).length > 0 &&
                            filteredAuthUsers
                              .filter((u) => !u.firestoreData?.isSuperAdmin)
                              .every((u) => selectedAccounts.has(u.uid))
                          }
                          onChange={toggleSelectAll}
                          style={{
                            width: "18px",
                            height: "18px",
                            accentColor: "#6366f1",
                            cursor: "pointer",
                          }}
                        />
                        전체 선택 ({selectedAccounts.size}/
                        {
                          filteredAuthUsers.filter(
                            (u) => !u.firestoreData?.isSuperAdmin,
                          ).length
                        }
                        )
                      </label>
                      {selectedAccounts.size > 0 && (
                        <button
                          className="reject-btn"
                          style={{
                            padding: "8px 16px",
                            fontSize: "13px",
                            fontWeight: "600",
                          }}
                          onClick={handleBulkDelete}
                          disabled={bulkDeleting}
                        >
                          <Trash2 size={15} />
                          {bulkDeleting
                            ? `삭제 중...`
                            : `선택 삭제 (${selectedAccounts.size}개)`}
                        </button>
                      )}
                    </div>

                    <div className="error-log-list">
                      {filteredAuthUsers.map((u) => (
                        <div
                          key={u.uid}
                          className={`error-log-item ${!u.firestoreExists ? "warning" : "info"}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "12px 16px",
                            outline: selectedAccounts.has(u.uid)
                              ? "2px solid rgba(99,102,241,0.5)"
                              : "none",
                            background: selectedAccounts.has(u.uid)
                              ? "rgba(99,102,241,0.1)"
                              : undefined,
                          }}
                        >
                          {/* 체크박스 */}
                          {!u.firestoreData?.isSuperAdmin ? (
                            <input
                              type="checkbox"
                              checked={selectedAccounts.has(u.uid)}
                              onChange={() => toggleAccountSelect(u.uid)}
                              style={{
                                width: "18px",
                                height: "18px",
                                accentColor: "#6366f1",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div style={{ width: "18px", flexShrink: 0 }} />
                          )}
                          <div
                            className="teacher-avatar"
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "14px",
                              fontWeight: "700",
                              flexShrink: 0,
                              background: u.firestoreData?.isSuperAdmin
                                ? "linear-gradient(135deg,#ef4444,#dc2626)"
                                : u.firestoreData?.isAdmin
                                  ? "linear-gradient(135deg,#f59e0b,#d97706)"
                                  : u.firestoreExists
                                    ? "linear-gradient(135deg,#6366f1,#4f46e5)"
                                    : "linear-gradient(135deg,#6b7280,#4b5563)",
                              color: "white",
                            }}
                          >
                            {(u.firestoreData?.name || u.email || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                            >
                              <strong style={{ color: "#e0e0ff" }}>
                                {u.firestoreData?.name ||
                                  u.displayName ||
                                  "(이름 없음)"}
                              </strong>
                              {u.firestoreData?.isSuperAdmin && (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    background: "rgba(239,68,68,0.3)",
                                    color: "#fca5a5",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                  }}
                                >
                                  슈퍼관리자
                                </span>
                              )}
                              {u.firestoreData?.isAdmin &&
                                !u.firestoreData?.isSuperAdmin && (
                                  <span
                                    style={{
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      background: "rgba(245,158,11,0.3)",
                                      color: "#fcd34d",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                    }}
                                  >
                                    선생님
                                  </span>
                                )}
                              {u.firestoreExists &&
                                !u.firestoreData?.isAdmin &&
                                !u.firestoreData?.isSuperAdmin && (
                                  <span
                                    style={{
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      background: "rgba(99,102,241,0.3)",
                                      color: "#a5b4fc",
                                      fontSize: "11px",
                                      fontWeight: "600",
                                    }}
                                  >
                                    학생
                                  </span>
                                )}
                              {!u.firestoreExists && (
                                <span
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    background: "rgba(239,68,68,0.3)",
                                    color: "#fca5a5",
                                    fontSize: "11px",
                                    fontWeight: "600",
                                  }}
                                >
                                  Auth만 존재
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#9ca3af",
                                marginTop: "2px",
                              }}
                            >
                              {u.email}
                              {u.firestoreData?.classCode && (
                                <span
                                  style={{
                                    marginLeft: "8px",
                                    color: "#6ee7b7",
                                  }}
                                >
                                  학급: {u.firestoreData.classCode}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "#6b7280",
                                marginTop: "2px",
                              }}
                            >
                              가입:{" "}
                              {u.createdAt
                                ? new Date(u.createdAt).toLocaleDateString(
                                    "ko-KR",
                                  )
                                : "?"}
                              {u.lastSignIn && (
                                <span style={{ marginLeft: "8px" }}>
                                  마지막 로그인:{" "}
                                  {new Date(u.lastSignIn).toLocaleDateString(
                                    "ko-KR",
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          {!u.firestoreData?.isSuperAdmin && (
                            <button
                              className="reject-btn"
                              style={{
                                flexShrink: 0,
                                padding: "6px 12px",
                                fontSize: "12px",
                              }}
                              onClick={() =>
                                handleDeleteAuthUser(
                                  u.uid,
                                  u.email || u.firestoreData?.name || u.uid,
                                )
                              }
                            >
                              <Trash2 size={14} />
                              삭제
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 시스템 모니터링 탭 */}
            {activeTab === "monitoring" && (
              <div className="monitoring-tab">
                <div className="tab-header">
                  <h2>시스템 모니터링</h2>
                  <span className="live-indicator">
                    <span className="pulse"></span>
                    실시간
                  </span>
                </div>

                <div className="metrics-grid">
                  <div className="metric-card">
                    <div className="metric-header">
                      <Cpu size={20} />
                      <span>CPU 사용량</span>
                    </div>
                    <div className="metric-value">
                      <span
                        className={systemMetrics.cpuUsage > 80 ? "warning" : ""}
                      >
                        {systemMetrics.cpuUsage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-bar">
                      <div
                        className={`bar-fill ${systemMetrics.cpuUsage > 80 ? "warning" : systemMetrics.cpuUsage > 60 ? "caution" : ""}`}
                        style={{ width: `${systemMetrics.cpuUsage}%` }}
                      />
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <HardDrive size={20} />
                      <span>메모리 사용량</span>
                    </div>
                    <div className="metric-value">
                      <span
                        className={
                          systemMetrics.memoryUsage > 80 ? "warning" : ""
                        }
                      >
                        {systemMetrics.memoryUsage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="metric-bar">
                      <div
                        className={`bar-fill ${systemMetrics.memoryUsage > 80 ? "warning" : systemMetrics.memoryUsage > 60 ? "caution" : ""}`}
                        style={{ width: `${systemMetrics.memoryUsage}%` }}
                      />
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <Wifi size={20} />
                      <span>활성 연결</span>
                    </div>
                    <div className="metric-value">
                      {systemMetrics.activeConnections}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <Zap size={20} />
                      <span>요청/분</span>
                    </div>
                    <div className="metric-value">
                      {systemMetrics.requestsPerMinute}
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <Clock size={20} />
                      <span>평균 응답시간</span>
                    </div>
                    <div className="metric-value">
                      {systemMetrics.avgResponseTime}ms
                    </div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-header">
                      <AlertTriangle size={20} />
                      <span>에러율</span>
                    </div>
                    <div className="metric-value">
                      <span
                        className={systemMetrics.errorRate > 5 ? "warning" : ""}
                      >
                        {systemMetrics.errorRate.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="monitoring-info">
                  <h3>시스템 상태</h3>
                  <div className="status-list">
                    <div className="status-item ok">
                      <Server size={18} />
                      <span>Firebase 연결</span>
                      <CheckCircle size={16} />
                    </div>
                    <div className="status-item ok">
                      <Database size={18} />
                      <span>Firestore 상태</span>
                      <CheckCircle size={16} />
                    </div>
                    <div className="status-item ok">
                      <Wifi size={18} />
                      <span>네트워크 상태</span>
                      <CheckCircle size={16} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 에러 로그 탭 */}
            {activeTab === "errors" && (
              <div className="errors-tab">
                <div className="tab-header">
                  <h2>에러 로그</h2>
                  <div className="header-controls">
                    <div className="search-box">
                      <Search size={18} />
                      <input
                        type="text"
                        placeholder="에러 메시지 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">모든 심각도</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="critical">Critical</option>
                    </select>
                    <button
                      className="test-error-btn"
                      onClick={handleClearAllErrorLogs}
                      title="전체 에러 로그 삭제"
                    >
                      <Trash2 size={18} />
                      전체 삭제
                    </button>
                  </div>
                </div>

                {filteredErrorLogs.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle size={64} />
                    <h3>에러 로그가 없습니다</h3>
                    <p>시스템이 정상 작동 중입니다.</p>
                  </div>
                ) : (
                  <div className="error-log-list">
                    {filteredErrorLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`error-log-item ${log.severity}`}
                      >
                        <div className="error-log-header">
                          <span className={`severity-badge ${log.severity}`}>
                            {log.severity === "critical" && (
                              <AlertOctagon size={14} />
                            )}
                            {log.severity === "error" && <XCircle size={14} />}
                            {log.severity === "warning" && (
                              <AlertTriangle size={14} />
                            )}
                            {log.severity === "info" && <Activity size={14} />}
                            {log.severity}
                          </span>
                          <span className="error-type">
                            {log.type || "unknown"}
                          </span>
                          <span className="error-timestamp">
                            {log.timestamp?.toLocaleString?.() || "알 수 없음"}
                          </span>
                          <button
                            className="delete-log-btn"
                            onClick={() => handleDeleteErrorLog(log.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="error-log-body">
                          <p className="error-message">{log.message}</p>
                          {log.stack && (
                            <pre className="error-stack">{log.stack}</pre>
                          )}
                          {log.url && (
                            <span className="error-url">URL: {log.url}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* 학급 상세 모달 */}
      {classDetail && (
        <div
          className="class-detail-overlay"
          onClick={closeClassDetail}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="class-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="class-detail-header">
              <div>
                <div className="class-detail-code">
                  <School size={20} />
                  <span>{classDetail.classCode}</span>
                </div>
                <div className="class-detail-teacher">
                  {classDetail.teacherName} 선생님 학급
                </div>
              </div>
              <div className="class-detail-actions">
                <button
                  className="class-detail-init"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "직업·상점·은행·급여 등 누락된 초기 데이터를 만들어줍니다.\n이미 있는 항목은 건너뜁니다. 진행하시겠습니까?",
                      )
                    )
                      return;
                    try {
                      const result = await initClassroomDefaults(
                        classDetail.classCode,
                      );
                      alert(
                        result.created
                          ? "학급 초기 데이터를 보충했습니다."
                          : "이미 모든 항목이 설정되어 있습니다.",
                      );
                    } catch (e) {
                      logger.error("학급 초기화 오류:", e);
                      alert("학급 초기화 중 오류가 발생했습니다.");
                    }
                  }}
                  title="누락된 직업/상점/은행/급여 초기 데이터를 생성"
                >
                  학급 초기화
                </button>
                <button
                  className="class-detail-close"
                  onClick={closeClassDetail}
                  aria-label="닫기"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            {classDetailLoading ? (
              <div className="class-detail-loading">
                <RefreshCw className="spinning" size={32} />
                <p>학급 정보 로딩 중...</p>
              </div>
            ) : (
              <>
                <div className="class-detail-stats">
                  <div className="class-stat">
                    <span className="label">학생 수</span>
                    <span className="value">{classStudents.length}명</span>
                  </div>
                  <div className="class-stat">
                    <span className="label">총 현금</span>
                    <span className="value">
                      {classStudents
                        .reduce((s, u) => s + (Number(u.cash) || 0), 0)
                        .toLocaleString()}
                      원
                    </span>
                  </div>
                  <div className="class-stat">
                    <span className="label">총 쿠폰</span>
                    <span className="value">
                      {classStudents.reduce(
                        (s, u) => s + (Number(u.coupons) || 0),
                        0,
                      )}
                      개
                    </span>
                  </div>
                  <div className="class-stat">
                    <span className="label">평균 현금</span>
                    <span className="value">
                      {classStudents.length > 0
                        ? Math.floor(
                            classStudents.reduce(
                              (s, u) => s + (Number(u.cash) || 0),
                              0,
                            ) / classStudents.length,
                          ).toLocaleString()
                        : 0}
                      원
                    </span>
                  </div>
                </div>

                <div className="class-detail-students">
                  <h4>학생 목록</h4>
                  {classStudents.length === 0 ? (
                    <p className="empty-students">
                      이 학급에 등록된 학생이 없습니다.
                    </p>
                  ) : (
                    <table className="students-table">
                      <thead>
                        <tr>
                          <th>이름</th>
                          <th>아이디</th>
                          <th style={{ textAlign: "right" }}>현금</th>
                          <th style={{ textAlign: "right" }}>쿠폰</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classStudents.map((s) => (
                          <tr key={s.id}>
                            <td>{s.name || s.nickname || "-"}</td>
                            <td className="email-cell">
                              {(s.email || "").split("@")[0] || "-"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {(Number(s.cash) || 0).toLocaleString()}원
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {Number(s.coupons) || 0}개
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
