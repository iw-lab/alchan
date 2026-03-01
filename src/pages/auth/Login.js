// src/pages/auth/Login.js
// 다크 테마 로그인 - 앱 테마에 맞춘 디자인

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import {
  registerWithEmailAndPassword,
  updateUserProfile,
  addUserDocument,
  serverTimestamp,
  db,
} from "../../firebase";
import { doc, setDoc, getDoc, collection, addDoc } from "firebase/firestore";
import { logger } from "../../utils/logger";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  School,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Users,
  Sparkles,
  ArrowLeft,
} from "lucide-react";

const getFirebaseErrorMessage = (error) => {
  if (!error?.code) return "알 수 없는 오류가 발생했습니다.";
  const errorMessages = {
    "auth/user-not-found": "등록되지 않은 계정입니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-email": "유효하지 않은 이메일 형식입니다.",
    "auth/too-many-requests":
      "너무 많은 시도입니다. 잠시 후 다시 시도해주세요.",
    "auth/network-request-failed":
      "네트워크 오류입니다. 인터넷 연결을 확인해주세요.",
    "auth/email-already-in-use": "이미 사용 중인 이메일입니다.",
  };
  return errorMessages[error.code] || `오류: ${error.message}`;
};

const generateClassCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++)
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

// 새 학급 기본 직업 목록 (초등학교 교실 경제)
const DEFAULT_JOBS = [
  {
    title: "경찰청장",
    tasks: [
      {
        name: "사건 처리",
        reward: 1,
        maxClicks: 10,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "교실 질서 유지하기",
        reward: 2,
        maxClicks: 5,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "환경 미화원",
    tasks: [
      {
        name: "쓰레기통 비우기",
        reward: 50,
        maxClicks: 1,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "아침 쓸기",
        reward: 10,
        maxClicks: 1,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "분리수거 정리하기",
        reward: 20,
        maxClicks: 1,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "글씨 감사인",
    tasks: [
      {
        name: "검사해주기",
        reward: 1,
        maxClicks: 25,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "공책 정리 확인하기",
        reward: 2,
        maxClicks: 10,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "국세청 직원",
    tasks: [
      {
        name: "세금 안내하기",
        reward: 1,
        maxClicks: 25,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "가계부 점검하기",
        reward: 2,
        maxClicks: 5,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "아르바이트",
    tasks: [
      {
        name: "아르바이트",
        reward: 1,
        maxClicks: 10,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "심부름하기",
        reward: 2,
        maxClicks: 5,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "학급 반장",
    tasks: [
      {
        name: "조회/종회 진행하기",
        reward: 3,
        maxClicks: 2,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "출석 확인하기",
        reward: 2,
        maxClicks: 1,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "도서 관리인",
    tasks: [
      {
        name: "도서 정리하기",
        reward: 5,
        maxClicks: 2,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "대출/반납 기록하기",
        reward: 2,
        maxClicks: 10,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
  {
    title: "방송 담당",
    tasks: [
      {
        name: "아침 방송하기",
        reward: 10,
        maxClicks: 1,
        clicks: 0,
        requiresApproval: false,
      },
      {
        name: "공지 전달하기",
        reward: 3,
        maxClicks: 3,
        clicks: 0,
        requiresApproval: false,
      },
    ],
  },
];

// 새 학급 기본 상점 아이템
const DEFAULT_STORE_ITEMS = [
  {
    name: "자유 시간 10분",
    price: 2000,
    stock: 5,
    icon: "⏰",
    description: "10분간 자유 시간을 사용할 수 있습니다",
  },
  {
    name: "자리 바꾸기",
    price: 500,
    stock: 10,
    icon: "💺",
    description: "원하는 자리로 이동할 수 있습니다",
  },
  {
    name: "과자",
    price: 200,
    stock: 30,
    icon: "🍪",
    description: "맛있는 과자 1개",
  },
  {
    name: "사탕",
    price: 200,
    stock: 50,
    icon: "🍬",
    description: "달콤한 사탕 1개",
  },
  {
    name: "음료수",
    price: 200,
    stock: 20,
    icon: "🧃",
    description: "시원한 음료수 1개",
  },
  {
    name: "초콜릿",
    price: 200,
    stock: 20,
    icon: "🍫",
    description: "초콜릿 1개",
  },
  {
    name: "숙제 면제권",
    price: 500,
    stock: 5,
    icon: "📝",
    description: "숙제 1회 면제",
  },
  {
    name: "1일 반장 체험",
    price: 300,
    stock: 3,
    icon: "👑",
    description: "하루 동안 반장 역할 체험",
  },
  {
    name: "선생님 의자 사용권",
    price: 300,
    stock: 3,
    icon: "🪑",
    description: "하루 동안 선생님 의자 사용",
  },
  {
    name: "젤리",
    price: 200,
    stock: 30,
    icon: "🧸",
    description: "말랑말랑 젤리 1개",
  },
];

// 새 학급 기본 은행 설정
const DEFAULT_BANKING = {
  deposits: [
    {
      id: 1,
      name: "일복리예금 90일",
      annualRate: 0.01,
      termInDays: 90,
      minAmount: 500000,
    },
    {
      id: 2,
      name: "일복리예금 180일",
      annualRate: 0.012,
      termInDays: 180,
      minAmount: 1000000,
    },
    {
      id: 3,
      name: "일복리예금 365일",
      annualRate: 0.015,
      termInDays: 365,
      minAmount: 2000000,
    },
  ],
  savings: [
    {
      id: 1,
      name: "일복리적금 180일",
      annualRate: 0.011,
      termInDays: 180,
      minAmount: 100000,
    },
    {
      id: 2,
      name: "일복리적금 365일",
      annualRate: 0.014,
      termInDays: 365,
      minAmount: 100000,
    },
    {
      id: 3,
      name: "일복리적금 730일",
      annualRate: 0.018,
      termInDays: 730,
      minAmount: 50000,
    },
  ],
  loans: [
    {
      id: 1,
      name: "일복리대출 90일",
      annualRate: 0.05,
      termInDays: 90,
      maxAmount: 3000000,
    },
    {
      id: 2,
      name: "일복리대출 365일",
      annualRate: 0.08,
      termInDays: 365,
      maxAmount: 10000000,
    },
    {
      id: 3,
      name: "일복리대출 730일",
      annualRate: 0.1,
      termInDays: 730,
      maxAmount: 50000000,
    },
  ],
};

// 새 학급 기본 급여 설정
const DEFAULT_SALARIES = {
  경찰청장: 4500,
  "환경 미화원": 4000,
  "글씨 감사인": 4000,
  "국세청 직원": 4500,
  아르바이트: 2000,
  "학급 반장": 5000,
  "도서 관리인": 3500,
  "방송 담당": 3500,
  무직: 1000,
};

// 다크 인풋 공통 스타일
const darkInput =
  "w-full bg-[#0d0d1a] border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all text-sm font-medium";

const Login = () => {
  useDocumentTitle("로그인 - 알찬 경제교육");
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    userDoc,
    loading,
    firebaseReady,
    loginWithEmailPassword,
    auth,
    logout: contextLogout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState("student");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saveId, setSaveId] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 선생님 가입
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [className, setClassName] = useState("");

  const from = location.state?.from?.pathname || "/dashboard/tasks";

  useEffect(() => {
    if (!loading && user && userDoc) navigate(from, { replace: true });
  }, [user, userDoc, loading, navigate, from]);

  useEffect(() => {
    const savedId = localStorage.getItem("savedLoginId");
    if (savedId) {
      setEmail(savedId);
      setSaveId(true);
    }
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError("");
    setSuccess("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 모두 입력해주세요.");
      return;
    }
    if (!firebaseReady) {
      setError("서비스가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setIsLoading(true);
    try {
      const firebaseUser = await loginWithEmailPassword(email.trim(), password);
      if (firebaseUser) {
        if (saveId) localStorage.setItem("savedLoginId", email.trim());
        else localStorage.removeItem("savedLoginId");
      }
    } catch (error) {
      setError(getFirebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeacherRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (
      !registerName.trim() ||
      !registerEmail.trim() ||
      !registerPassword ||
      !registerConfirmPassword
    ) {
      setError("모든 필수 항목을 입력해주세요.");
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (registerPassword.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (!firebaseReady || !auth) {
      setError("서비스가 준비되지 않았습니다.");
      return;
    }
    setIsLoading(true);
    try {
      const userCredential = await registerWithEmailAndPassword(
        auth,
        registerEmail.trim(),
        registerPassword,
      );
      const newUser = userCredential.user;
      // Auth 계정 생성 직후 즉시 선생님 문서 생성 (AuthContext race condition 방지)
      const classCode = generateClassCode();
      await addUserDocument(newUser.uid, {
        name: registerName.trim(),
        nickname: registerName.trim(),
        email: registerEmail.trim().toLowerCase(),
        classCode,
        isAdmin: true,
        isSuperAdmin: false,
        isTeacher: true,
        isApproved: false,
        cash: 0,
        coupons: 0,
        selectedJobIds: [],
        myContribution: 0,
        schoolName: schoolName.trim() || "",
        className: className.trim() || "",
        createdAt: serverTimestamp(),
      });
      await updateUserProfile(newUser, registerName.trim());
      const classDocRef = doc(db, "classes", classCode);
      await setDoc(classDocRef, {
        code: classCode,
        teacherId: newUser.uid,
        teacherName: registerName.trim(),
        schoolName: schoolName.trim() || "",
        className: className.trim() || "",
        createdAt: serverTimestamp(),
        studentCount: 0,
        settings: { initialCash: 100000, initialCoupons: 10 },
      });
      const classCodesRef = doc(db, "settings", "classCodes");
      const classCodesDoc = await getDoc(classCodesRef);
      const existingCodes = classCodesDoc.exists()
        ? classCodesDoc.data().codes || []
        : [];
      await setDoc(
        classCodesRef,
        { codes: [...existingCodes, classCode], updatedAt: serverTimestamp() },
        { merge: true },
      );

      // 기본 직업 자동 생성
      const jobsRef = collection(db, "jobs");
      for (const jobTemplate of DEFAULT_JOBS) {
        const tasks = jobTemplate.tasks.map((t, i) => ({
          ...t,
          id: `task_${Date.now()}_${i}`,
        }));
        await addDoc(jobsRef, {
          title: jobTemplate.title,
          active: true,
          tasks,
          classCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 기본 상점 아이템 자동 생성
      const storeItemsRef = collection(db, "storeItems");
      for (const item of DEFAULT_STORE_ITEMS) {
        await addDoc(storeItemsRef, {
          ...item,
          initialStock: item.stock,
          available: true,
          type: "item",
          classCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 기본 은행 설정 자동 생성
      await setDoc(doc(db, "bankingSettings", classCode), {
        ...DEFAULT_BANKING,
        classCode,
        updatedAt: serverTimestamp(),
      });

      // 기본 급여 설정 자동 생성
      const classSettingsRef = doc(db, "classSettings", classCode);
      await setDoc(
        classSettingsRef,
        { classCode, createdAt: serverTimestamp() },
        { merge: true },
      );
      await setDoc(doc(db, "classSettings", classCode, "settings", "salary"), {
        salaries: DEFAULT_SALARIES,
        payDay: "friday",
        autoPay: true,
        classCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (contextLogout) await contextLogout();
      else if (auth?.signOut) await auth.signOut();
      setSuccess(`가입 완료! 학급 코드: ${classCode}`);
      setActiveTab("teacher");
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
      setSchoolName("");
      setClassName("");
    } catch (error) {
      logger.error("Teacher registration error:", error);
      setError(getFirebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  // ── 로딩 화면 ──────────────────────────────────────────────
  if (loading || !firebaseReady) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center z-[9998]"
        style={{
          background:
            "linear-gradient(135deg, #070710 0%, #0d0d1a 50%, #111128 100%)",
        }}
      >
        {/* 배경 글로우 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
            style={{
              background:
                "radial-gradient(circle, #6366f1 0%, transparent 70%)",
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center">
          {/* 로고 */}
          <div className="relative mb-6">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl border border-indigo-500/30"
              style={{
                background: "linear-gradient(135deg, #1e1e3a 0%, #14142a 100%)",
              }}
            >
              <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-14 h-14"
              >
                <defs>
                  <linearGradient
                    id="checkGradLogin"
                    x1="0"
                    y1="0"
                    x2="100"
                    y2="100"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <path
                  d="M25 52 L42 69 L75 31"
                  stroke="url(#checkGradLogin)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M78 22 L80 27 L85 27 L81 31 L82 36 L78 33 L74 36 L75 31 L71 27 L76 27 Z"
                  fill="#FCD34D"
                />
              </svg>
            </div>
            {/* 회전 테두리 */}
            <div className="absolute -inset-2 border-2 border-transparent border-t-indigo-500 rounded-[2rem] animate-spin [animation-duration:2s]" />
          </div>

          <h1 className="text-5xl text-white font-normal tracking-tight font-jua mb-1">
            알찬
          </h1>
          <p className="text-sm text-slate-400 font-medium tracking-widest uppercase mb-8">
            경제 교육
          </p>

          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <div
                  key={delay}
                  className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
            <span className="ml-2 text-sm text-slate-500">로딩 중...</span>
          </div>
        </div>

        <p className="absolute bottom-8 text-xs text-slate-600">
          알찬 경제교육 v2.0
        </p>
      </div>
    );
  }

  // ── 로그인 화면 ────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #070710 0%, #0d0d1a 50%, #111128 100%)",
      }}
    >
      {/* 배경 글로우 효과 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -right-32 w-80 h-80 rounded-full opacity-8"
          style={{
            background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-8"
          style={{
            background: "radial-gradient(circle, #6366f1 0%, transparent 70%)",
          }}
        />
        {/* 미묘한 그리드 패턴 */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* 로고/타이틀 */}
        <div className="text-center mb-6">
          <div className="relative inline-block mb-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border border-indigo-500/30 shadow-lg shadow-indigo-500/10"
              style={{
                background: "linear-gradient(135deg, #1e1e3a 0%, #14142a 100%)",
              }}
            >
              <svg
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-10 h-10"
              >
                <defs>
                  <linearGradient
                    id="iconGrad"
                    x1="0"
                    y1="0"
                    x2="100"
                    y2="100"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#a5b4fc" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <path
                  d="M25 52 L42 69 L75 31"
                  stroke="url(#iconGrad)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M78 22 L80 27 L85 27 L81 31 L82 36 L78 33 L74 36 L75 31 L71 27 L76 27 Z"
                  fill="#FCD34D"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white font-jua">알찬</h1>
          <p className="text-slate-400 text-sm mt-1">학급 경제 교육</p>
        </div>

        {/* 메인 카드 */}
        <div
          className="rounded-2xl overflow-hidden border border-slate-700/60 shadow-2xl"
          style={{
            background: "linear-gradient(180deg, #161628 0%, #111122 100%)",
          }}
        >
          {/* 탭 */}
          {activeTab !== "register" && (
            <div
              className="flex border-b border-slate-700/60"
              style={{ background: "#0d0d1a" }}
            >
              {[
                { id: "student", label: "학생", Icon: User },
                { id: "teacher", label: "선생님", Icon: GraduationCap },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => handleTabChange(id)}
                  className={`flex-1 py-3.5 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                    activeTab === id
                      ? "text-white border-b-2 border-indigo-500 bg-indigo-500/5"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/3"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 에러/성공 */}
          {error && (
            <div className="mx-5 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300 font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="mx-5 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-300">
                <p className="font-bold">{success}</p>
                <p className="mt-0.5 text-emerald-400 text-xs">
                  학생들에게 이 코드를 알려주세요!
                </p>
              </div>
            </div>
          )}

          {/* 로그인 폼 */}
          {(activeTab === "student" || activeTab === "teacher") && (
            <form onSubmit={handleLogin} className="p-5 space-y-4">
              {/* 이메일 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">
                  이메일
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="이메일을 입력하세요"
                    autoComplete="email"
                    className={`${darkInput} pl-10 pr-4 py-3`}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 비밀번호 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">
                  비밀번호
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    autoComplete="current-password"
                    className={`${darkInput} pl-10 pr-11 py-3`}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 아이디 저장 */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative w-4 h-4">
                  <input
                    type="checkbox"
                    checked={saveId}
                    onChange={(e) => setSaveId(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-4 h-4 border border-slate-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all flex items-center justify-center">
                    {saveId && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                  아이디 저장
                </span>
              </label>

              {/* 로그인 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  <>
                    로그인
                    <ChevronRight size={18} />
                  </>
                )}
              </button>

              {activeTab === "teacher" && (
                <div className="text-center pt-1">
                  <p className="text-xs text-slate-500 mb-1.5">
                    아직 계정이 없으신가요?
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTabChange("register")}
                    className="text-sm text-indigo-400 font-semibold hover:text-indigo-300 transition-colors inline-flex items-center gap-1"
                  >
                    선생님 계정 만들기
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              {activeTab === "student" && (
                <p className="text-center text-xs text-slate-500 pt-1">
                  계정이 없나요?{" "}
                  <span className="text-indigo-400 font-medium">
                    선생님께 문의하세요
                  </span>
                </p>
              )}
            </form>
          )}

          {/* 선생님 가입 폼 */}
          {activeTab === "register" && (
            <form onSubmit={handleTeacherRegister} className="p-5 space-y-3.5">
              <div className="flex items-center gap-3 pb-3.5 border-b border-slate-700/60">
                <button
                  type="button"
                  onClick={() => handleTabChange("teacher")}
                  className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-base font-bold text-white">
                    선생님 계정 만들기
                  </h2>
                  <p className="text-xs text-slate-500">
                    학급 코드가 자동 생성됩니다
                  </p>
                </div>
              </div>

              {/* 이름 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">
                  이름 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="예: 김알찬"
                    className={`${darkInput} pl-10 pr-4 py-2.5`}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 이메일 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-300">
                  이메일 <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="예: teacher@school.com"
                    className={`${darkInput} pl-10 pr-4 py-2.5`}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 비밀번호 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    비밀번호 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="6자 이상"
                    autoComplete="new-password"
                    className={`${darkInput} px-3 py-2.5`}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    비밀번호 확인 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    placeholder="재입력"
                    autoComplete="new-password"
                    className={`${darkInput} px-3 py-2.5`}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 학교/학급 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    학교명
                  </label>
                  <div className="relative">
                    <School className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="예: 알찬초등학교"
                      className={`${darkInput} pl-10 pr-3 py-2.5`}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-300">
                    학급
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="예: 6-1반"
                      className={`${darkInput} pl-10 pr-3 py-2.5`}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* 안내 */}
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-indigo-300 leading-relaxed">
                  가입하면{" "}
                  <strong className="text-indigo-200">학급 코드</strong>가 자동
                  생성됩니다. 이 코드로 학생 계정을 손쉽게 만들 수 있어요!
                </p>
              </div>

              {/* 가입 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    가입 처리 중...
                  </>
                ) : (
                  <>
                    <GraduationCap size={18} />
                    선생님 계정 만들기
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* 하단 */}
        <div className="mt-5 text-center space-y-2">
          <Link
            to="/privacy"
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors underline underline-offset-4"
          >
            개인정보처리방침
          </Link>
          <p className="text-xs text-slate-700">
            © 2026 알찬 경제교육. All rights reserved.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out; }
      `}</style>
    </div>
  );
};

export default Login;
