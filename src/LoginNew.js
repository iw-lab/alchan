// src/LoginNew.js
// 새로운 로그인 시스템 - 선생님 가입, 학생 로그인

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

const LoginNew = () => {
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

  // 로딩 화면
  if (loading || !firebaseReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <BookOpen className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            알찬
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            학급 경제 시뮬레이션
          </p>
        </div>

        {/* 메인 카드 */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden">
          {/* 탭 버튼 */}
          <div className="flex border-b border-gray-100 dark:border-gray-700">
            <button
              onClick={() => handleTabChange("student")}
              className={`flex-1 py-4 text-sm font-medium transition-colors relative ${
                activeTab === "student"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <User size={18} />
                학생 로그인
              </div>
              {activeTab === "student" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
              )}
            </button>
            <button
              onClick={() => handleTabChange("teacher")}
              className={`flex-1 py-4 text-sm font-medium transition-colors relative ${
                activeTab === "teacher"
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <GraduationCap size={18} />
                선생님 로그인
              </div>
              {activeTab === "teacher" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />
              )}
            </button>
          </div>

          {/* 에러/성공 메시지 */}
          {error && (
            <div className="mx-6 mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="mx-6 mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-600 dark:text-emerald-400">
                <p className="font-semibold">{success}</p>
                <p className="mt-1">학생들에게 이 코드를 알려주세요!</p>
              </div>
            </div>
          )}

          {/* 학생/선생님 로그인 폼 */}
          {(activeTab === "student" || activeTab === "teacher") && (
            <form onSubmit={handleLogin} className="p-6 space-y-5">
              {/* 이메일 입력 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  이메일
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="이메일을 입력하세요"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 비밀번호 입력 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  비밀번호
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {/* 아이디 저장 */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveId}
                    onChange={(e) => setSaveId(e.target.checked)}
                    className="w-4 h-4 text-indigo-500 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    아이디 저장
                  </span>
                </label>
              </div>

              {/* 로그인 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  <>
                    로그인
                    <ChevronRight size={20} />
                  </>
                )}
              </button>

              {/* 선생님 가입 링크 (선생님 탭에서만) */}
              {activeTab === "teacher" && (
                <div className="text-center pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    아직 계정이 없으신가요?
                  </p>
                  <button
                    type="button"
                    onClick={() => handleTabChange("register")}
                    className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                  >
                    선생님 계정 만들기
                  </button>
                </div>
              )}

              {/* 학생 안내 (학생 탭에서만) */}
              {activeTab === "student" && (
                <div className="text-center pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    계정이 없나요? 선생님께 문의하세요.
                  </p>
                </div>
              )}
            </form>
          )}

          {/* 선생님 가입 폼 */}
          {activeTab === "register" && (
            <form onSubmit={handleTeacherRegister} className="p-6 space-y-4">
              <div className="flex items-center gap-2 pb-4 border-b border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => handleTabChange("teacher")}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                </button>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  선생님 계정 만들기
                </h2>
              </div>

              {/* 이름 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  이름 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="선생님 성함"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 이메일 */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  이메일 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="이메일 주소"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 비밀번호 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    비밀번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="6자 이상"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    비밀번호 확인 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={registerConfirmPassword}
                    onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 학교/학급 정보 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    학교명
                  </label>
                  <div className="relative">
                    <School className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="○○초등학교"
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    학급
                  </label>
                  <div className="relative">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      placeholder="6학년 1반"
                      className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* 안내 메시지 */}
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  가입 시 <strong>학급 코드</strong>가 자동 생성됩니다.
                  이 코드로 학생 계정을 일괄 생성할 수 있습니다.
                </p>
              </div>

              {/* 가입 버튼 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
          알찬 - 학급 경제 시뮬레이션 v2.0
        </p>
      </div>
    </div>
  );
};

export default LoginNew;
