// src/Login.js
// 상용화 수준의 세련된 로그인 시스템

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import {
  registerWithEmailAndPassword,
  updateUserProfile,
  addUserDocument,
  serverTimestamp,
  db,
} from "./firebase";
import { doc, setDoc, getDoc, collection } from "firebase/firestore";
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
  BookOpen,
  Sparkles,
  ArrowLeft,
} from "lucide-react";

// Firebase 오류 메시지 변환
const getFirebaseErrorMessage = (error) => {
  if (!error?.code) return "알 수 없는 오류가 발생했습니다.";

  const errorMessages = {
    "auth/user-not-found": "등록되지 않은 계정입니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-email": "유효하지 않은 이메일 형식입니다.",
    "auth/too-many-requests": "너무 많은 시도입니다. 잠시 후 다시 시도해주세요.",
    "auth/network-request-failed": "네트워크 오류입니다. 인터넷 연결을 확인해주세요.",
    "auth/email-already-in-use": "이미 사용 중인 이메일입니다.",
  };

  return errorMessages[error.code] || `오류: ${error.message}`;
};

// 학급 코드 생성 함수
const generateClassCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const Login = () => {
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

  // 탭 상태: 'student' | 'teacher' | 'register'
  const [activeTab, setActiveTab] = useState("student");
  const [showPassword, setShowPassword] = useState(false);

  // 로그인 상태
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saveId, setSaveId] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 선생님 가입 상태
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [className, setClassName] = useState("");

  const from = location.state?.from?.pathname || "/dashboard/tasks";

  // 이미 로그인된 경우 리디렉션
  useEffect(() => {
    if (!loading && user && userDoc) {
      navigate(from, { replace: true });
    }
  }, [user, userDoc, loading, navigate, from]);

  // 저장된 아이디 불러오기
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

  // 로그인 처리
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
        if (saveId) {
          localStorage.setItem("savedLoginId", email.trim());
        } else {
          localStorage.removeItem("savedLoginId");
        }
      }
    } catch (error) {
      setError(getFirebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  // 선생님 가입 처리
  const handleTeacherRegister = async (e) => {
    e.preventDefault();
    setError("");

    // 유효성 검사
    if (!registerName.trim() || !registerEmail.trim() || !registerPassword || !registerConfirmPassword) {
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
      setError("서비스가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Firebase Auth로 계정 생성
      const userCredential = await registerWithEmailAndPassword(
        auth,
        registerEmail.trim(),
        registerPassword
      );
      const newUser = userCredential.user;

      // 2. 프로필 업데이트
      await updateUserProfile(newUser, registerName.trim());

      // 3. 학급 코드 생성
      const classCode = generateClassCode();

      // 4. 사용자 문서 생성 (선생님)
      const userData = {
        name: registerName.trim(),
        nickname: registerName.trim(),
        email: registerEmail.trim().toLowerCase(),
        classCode: classCode,
        isAdmin: true, // 선생님은 관리자
        isSuperAdmin: false,
        isTeacher: true, // 선생님 표시
        isApproved: false, // 🔥 앱 관리자 승인 대기 상태
        cash: 0,
        coupons: 0,
        selectedJobIds: [],
        myContribution: 0,
        schoolName: schoolName.trim() || '',
        className: className.trim() || '',
        createdAt: serverTimestamp(),
      };

      await addUserDocument(newUser.uid, userData);

      // 5. 학급 정보 문서 생성
      const classDocRef = doc(db, "classes", classCode);
      await setDoc(classDocRef, {
        code: classCode,
        teacherId: newUser.uid,
        teacherName: registerName.trim(),
        schoolName: schoolName.trim() || '',
        className: className.trim() || '',
        createdAt: serverTimestamp(),
        studentCount: 0,
        settings: {
          initialCash: 100000,
          initialCoupons: 10,
        },
      });

      // 6. settings/classCodes에 학급 코드 등록
      const classCodesRef = doc(db, "settings", "classCodes");
      const classCodesDoc = await getDoc(classCodesRef);
      const existingCodes = classCodesDoc.exists() ? (classCodesDoc.data().codes || []) : [];
      await setDoc(classCodesRef, {
        codes: [...existingCodes, classCode],
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 7. 로그아웃 후 성공 메시지
      if (contextLogout) {
        await contextLogout();
      } else if (auth?.signOut) {
        await auth.signOut();
      }

      setSuccess(`가입 완료! 학급 코드: ${classCode}`);
      setActiveTab("teacher");

      // 폼 초기화
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterConfirmPassword("");
      setSchoolName("");
      setClassName("");

    } catch (error) {
      console.error("Teacher registration error:", error);
      setError(getFirebaseErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  // 로딩 중일 때 통일된 로딩 화면 표시
  if (loading || !firebaseReady) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex flex-col items-center justify-center z-[9998]">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-white/20 rounded-full blur-[40px] scale-150" />
          <div className="relative w-24 h-24 bg-white/10 backdrop-blur-sm rounded-3xl p-4 shadow-2xl border border-white/20 flex items-center justify-center">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
              <defs>
                <linearGradient id="checkGradLogin" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#e0e7ff" />
                </linearGradient>
              </defs>
              <path d="M25 52 L42 69 L75 31" stroke="url(#checkGradLogin)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M78 22 L80 27 L85 27 L81 31 L82 36 L78 33 L74 36 L75 31 L71 27 L76 27 Z" fill="#FCD34D" />
            </svg>
            <div className="absolute -inset-4 border-4 border-white/20 border-t-white/60 rounded-full animate-spin" style={{ animationDuration: '2s' }} />
          </div>
        </div>
        <h1 className="text-[42px] text-white font-normal tracking-tight" style={{ fontFamily: "'Jua', sans-serif", textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>알찬</h1>
        <p className="mt-2 text-xl text-white font-bold tracking-widest" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>경제 교육</p>
        <div className="mt-8 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="ml-3 text-[15px] text-white font-semibold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>로딩 중...</span>
        </div>
        <p className="absolute bottom-8 text-[13px] text-white/70 font-medium">알찬 경제교육 v2.0</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 배경 장식 요소 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 큰 원형 장식 */}
        <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-purple-400/10 rounded-full blur-2xl" />

        {/* 떠다니는 작은 원들 */}
        <div className="absolute top-20 left-10 w-3 h-3 bg-white/20 rounded-full animate-pulse" />
        <div className="absolute top-40 right-20 w-2 h-2 bg-white/30 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-40 left-1/4 w-4 h-4 bg-white/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 right-1/3 w-2 h-2 bg-yellow-300/40 rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          {/* 로고 아이콘 */}
          <div className="relative inline-block mb-4">
            <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl p-3.5 shadow-2xl border border-white/20 mx-auto">
              <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
                <defs>
                  <linearGradient id="iconGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#c7d2fe" />
                  </linearGradient>
                </defs>
                <path
                  d="M25 52 L42 69 L75 31"
                  stroke="url(#iconGradient)"
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
            {/* 반짝이는 효과 */}
            <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-yellow-300 animate-pulse" />
          </div>

          <h1 className="text-4xl font-bold text-white mb-1" style={{ fontFamily: "'Jua', sans-serif" }}>
            알찬
          </h1>
          <p className="text-white/70 font-medium">
            학급 경제 교육
          </p>
        </div>

        {/* 메인 카드 */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/50">
          {/* 탭 버튼 - 등록 화면이 아닐 때만 표시 */}
          {activeTab !== "register" && (
            <div className="flex bg-gray-50/80">
              <button
                onClick={() => handleTabChange("student")}
                className={`flex-1 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === "student"
                    ? "text-violet-700 bg-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <User size={18} />
                  학생
                </div>
              </button>
              <button
                onClick={() => handleTabChange("teacher")}
                className={`flex-1 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === "teacher"
                    ? "text-violet-700 bg-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <GraduationCap size={18} />
                  선생님
                </div>
              </button>
            </div>
          )}

          {/* 에러/성공 메시지 */}
          {error && (
            <div className="mx-5 mt-5 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-shake">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="mx-5 mt-5 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-700">
                <p className="font-bold">{success}</p>
                <p className="mt-1 text-emerald-600">학생들에게 이 코드를 알려주세요!</p>
              </div>
            </div>
          )}

          {/* 학생/선생님 로그인 폼 */}
          {(activeTab === "student" || activeTab === "teacher") && (
            <form onSubmit={handleLogin} className="p-6 space-y-5">
              {/* 이메일 입력 */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  이메일
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center group-focus-within:bg-violet-100 transition-colors">
                    <Mail className="w-5 h-5 text-violet-500" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="이메일을 입력하세요"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium"
                    style={{ paddingLeft: '4rem', paddingRight: '1rem', paddingTop: '1rem', paddingBottom: '1rem' }}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 비밀번호 입력 */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  비밀번호
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center group-focus-within:bg-violet-100 transition-colors">
                    <Lock className="w-5 h-5 text-violet-500" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium"
                    style={{ paddingLeft: '4rem', paddingRight: '3.5rem', paddingTop: '1rem', paddingBottom: '1rem' }}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-violet-500 transition-colors rounded-xl hover:bg-violet-50"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* 아이디 저장 */}
              <div className="flex items-center">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={saveId}
                      onChange={(e) => setSaveId(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 border-2 border-gray-300 rounded-md peer-checked:bg-violet-500 peer-checked:border-violet-500 transition-all flex items-center justify-center">
                      {saveId && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-gray-600 font-medium group-hover:text-gray-800 transition-colors">
                    아이디 저장
                  </span>
                </label>
              </div>

              {/* 로그인 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  <>
                    로그인
                    <ChevronRight size={22} className="mt-0.5" />
                  </>
                )}
              </button>

              {/* 선생님 가입 링크 (선생님 탭에서만) */}
              {activeTab === "teacher" && (
                <div className="text-center pt-4">
                  <p className="text-sm text-gray-500 mb-2">
                    아직 계정이 없으신가요?
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTabChange("register")}
                    className="text-violet-600 font-bold hover:text-violet-700 transition-colors inline-flex items-center gap-1"
                  >
                    선생님 계정 만들기
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {/* 학생 안내 (학생 탭에서만) */}
              {activeTab === "student" && (
                <div className="text-center pt-4">
                  <p className="text-sm text-gray-500">
                    계정이 없나요? <span className="text-violet-600 font-medium">선생님께 문의하세요</span>
                  </p>
                </div>
              )}
            </form>
          )}

          {/* 선생님 가입 폼 */}
          {activeTab === "register" && (
            <form onSubmit={handleTeacherRegister} className="p-6 space-y-4">
              {/* 헤더 */}
              <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => handleTabChange("teacher")}
                  className="p-2.5 hover:bg-violet-50 rounded-xl transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    선생님 계정 만들기
                  </h2>
                  <p className="text-xs text-gray-500">학급 코드가 자동 생성됩니다</p>
                </div>
              </div>

              {/* 이름 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  이름 <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center group-focus-within:bg-violet-100 transition-colors">
                    <User className="w-4 h-4 text-violet-500" />
                  </div>
                  <input
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="선생님 성함"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium text-sm"
                    style={{ paddingLeft: '3.5rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 이메일 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-700">
                  이메일 <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center group-focus-within:bg-violet-100 transition-colors">
                    <Mail className="w-4 h-4 text-violet-500" />
                  </div>
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="이메일 주소"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium text-sm"
                    style={{ paddingLeft: '3.5rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 비밀번호 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    비밀번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="6자 이상"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium text-sm"
                    style={{ padding: '0.75rem 1rem' }}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    비밀번호 확인 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    placeholder="재입력"
                    className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium text-sm"
                    style={{ padding: '0.75rem 1rem' }}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 학교/학급 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    학교명
                  </label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center group-focus-within:bg-violet-100 transition-colors">
                      <School className="w-4 h-4 text-gray-500 group-focus-within:text-violet-500" />
                    </div>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="초등학교"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium text-sm"
                      style={{ paddingLeft: '3.5rem', paddingRight: '0.75rem', paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700">
                    학급
                  </label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center group-focus-within:bg-violet-100 transition-colors">
                      <Users className="w-4 h-4 text-gray-500 group-focus-within:text-violet-500" />
                    </div>
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="6-1반"
                      className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:bg-white transition-all font-medium text-sm"
                      style={{ paddingLeft: '3.5rem', paddingRight: '0.75rem', paddingTop: '0.75rem', paddingBottom: '0.75rem' }}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* 안내 메시지 */}
              <div className="p-4 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                  </div>
                  <p className="text-sm text-violet-700 leading-relaxed">
                    가입하면 <strong className="text-violet-800">학급 코드</strong>가 자동 생성됩니다.
                    이 코드로 학생 계정을 손쉽게 만들 수 있어요!
                  </p>
                </div>
              </div>

              {/* 가입 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-violet-500/30 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    가입 처리 중...
                  </>
                ) : (
                  <>
                    <GraduationCap size={20} />
                    선생님 계정 만들기
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* 하단 정보 */}
        <p className="text-center text-xs text-white/50 mt-6 font-medium">
          © 2025 알찬 경제교육. All rights reserved.
        </p>
      </div>

      {/* 애니메이션 스타일 */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Login;
