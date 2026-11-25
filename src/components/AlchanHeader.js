// src/components/AlchanHeader.js
// 알찬 UI 헤더 컴포넌트 - 새로운 슬레이트 기반 디자인

import React, { useState, useRef, useEffect, memo, useMemo } from "react";
import { hasWeakPassword, clearWeakPassword } from "../utils/weakPassword";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { verifyClassCode } from "../firebase";
import {
  X,
  LogOut,
  User,
  Key,
  Building2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Gift,
  Settings,
  LayoutDashboard,
  Send,
} from "lucide-react";
import SettingsPanel from "./SettingsPanel";
import { useBackClose } from "../hooks/useBackClose";
import Avatar from "./Avatar";
import { buildAvatarOverlays } from "../utils/avatarShop";
import { getLevelInfo } from "../utils/levelSystem";
import {
  evaluateAchievements,
} from "../utils/achievementSystem";
import { formatKoreanNumber, getCurrencyUnit } from "../utils/numberFormatter";
import { toast } from "../utils/toast";

const HEADER_GLASS = { background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(199,210,254,0.6)' };

// 금액 포맷 - numberFormatter.js 사용 (화폐 단위 포함)
const formatMoney = (amount) => formatKoreanNumber(amount, getCurrencyUnit());

// 모달 컴포넌트
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)', background: 'var(--accent-bg)' }}>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const AlchanHeader = memo(
  ({ toggleSidebar, isSidebarCollapsed, onToggleSidebarCollapse, helpButton = null }) => {
    const navigate = useNavigate();
    const {
      user,
      userDoc,
      logout,
      updateUser,
      changePassword,
      deleteCurrentUserAccount,
      loginWithEmailPassword,
    } = useAuth();

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const userMenuRef = useRef(null);

    const [activeModal, setActiveModal] = useState(null);
    const [showSettings, setShowSettings] = useState(false);

    // 닉네임
    const [newNickname, setNewNickname] = useState("");
    const [nicknameError, setNicknameError] = useState("");

    // 비밀번호
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    // 학급 코드
    const [newClassCodeInput, setNewClassCodeInput] = useState("");
    const [classCodeError, setClassCodeError] = useState("");
    const [classCodeSuccess, setClassCodeSuccess] = useState(false);

    // 계정 삭제
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState("");

    const isCurrentUserAdmin =
      userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin;
    const displayName =
      userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

    let userRole = "학생";
    if (userDoc?.isSuperAdmin) userRole = "앱 관리자";
    else if (userDoc?.isAdmin) userRole = "교사";

    // 아바타 overlays (userDoc 기반 - 베이스 PNG + 슬롯)
    const avatarOverlays = useMemo(() => buildAvatarOverlays(userDoc), [userDoc]);

    const levelInfo = useMemo(() => {
      const cash = Number(userDoc?.cash) || 0;
      const stockValue = Number(userDoc?.stockValue) || 0;
      const realEstateValue = Number(userDoc?.realEstateValue) || 0;
      const itemValue = Number(userDoc?.itemValue) || 0;
      const netAssets = cash + stockValue + realEstateValue + itemValue;
      return getLevelInfo(netAssets);
    }, [
      userDoc?.cash,
      userDoc?.stockValue,
      userDoc?.realEstateValue,
      userDoc?.itemValue,
    ]);

    // 최고 배지 — 저장 없이 지금 상태로 계산(여기서 아는 값: 순자산·쿠폰). 근거는 achievementSystem.js.
    const bestAchievement = useMemo(() => {
      if (!user?.uid) return null;
      const netAssets =
        (Number(userDoc?.cash) || 0) + (Number(userDoc?.stockValue) || 0) +
        (Number(userDoc?.realEstateValue) || 0) + (Number(userDoc?.itemValue) || 0);
      return evaluateAchievements({ totalAssets: netAssets, coupons: Number(userDoc?.coupons) || 0 }).best;
    }, [user?.uid, userDoc?.cash, userDoc?.stockValue, userDoc?.realEstateValue, userDoc?.itemValue, userDoc?.coupons]);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (
          userMenuRef.current &&
          !userMenuRef.current.contains(event.target)
        ) {
          setShowUserMenu(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const closeModal = () => {
      setActiveModal(null);
      setNicknameError("");
      setPasswordError("");
      setPasswordSuccess(false);
      setClassCodeError("");
      setClassCodeSuccess(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    };

    // 뒤로가기 = 지역 모달 4개(닉네임/비밀번호/학급코드/계정삭제) 닫기
    useBackClose(activeModal !== null, closeModal);

    const handleLogout = async () => {
      try {
        if (logout) {
          await logout();
          navigate("/login");
        }
      } catch {
        navigate("/login");
      }
      setShowUserMenu(false);
    };

    // 닉네임 변경
    const handleChangeNickname = () => {
      setNewNickname(userDoc?.name || userDoc?.nickname || "");
      setActiveModal("nickname");
      setShowUserMenu(false);
    };

    const saveNickname = async () => {
      const trimmed = newNickname.trim();
      if (!trimmed) return setNicknameError("닉네임을 입력해주세요.");
      if (trimmed.length < 2)
        return setNicknameError("닉네임은 최소 2자 이상이어야 합니다.");
      if (trimmed.length > 12)
        return setNicknameError("닉네임은 최대 12자까지 가능합니다.");

      setIsLoading(true);
      try {
        const success = await updateUser({ name: trimmed });
        if (success) {
          toast.success("닉네임이 변경되었습니다.");
          closeModal();
        } else {
          setNicknameError("변경에 실패했습니다.");
        }
      } catch (error) {
        setNicknameError(`오류: ${error.message}`);
      }
      setIsLoading(false);
    };

    // 🔑 비밀번호가 아이디와 같은 학생에게 한 줄 안내(로그인 때 이 기기에 남긴 표시 — utils/weakPassword).
    const [weakPw, setWeakPw] = useState(false);
    useEffect(() => {
      setWeakPw(!userDoc?.isAdmin && hasWeakPassword(user?.uid));
    }, [user?.uid, userDoc?.isAdmin]);
    const weakPwBar = weakPw ? (
      <button
        type="button"
        data-weak-password
        onClick={() => setActiveModal("password")}
        className="block w-full border-0 bg-amber-100 px-3 py-2 text-center text-xs font-semibold text-amber-900 cursor-pointer"
      >
        🔑 비밀번호가 아이디와 같아요. 친구가 들어올 수 있으니 여기를 눌러 바꿔 주세요.
      </button>
    ) : null;

    // 비밀번호 변경
    const handleChangePassword = () => {
      setActiveModal("password");
      setShowUserMenu(false);
    };

    const savePassword = async () => {
      if (!currentPassword || !newPassword || !confirmPassword)
        return setPasswordError("모든 필드를 입력해주세요.");
      if (newPassword.length < 6)
        return setPasswordError("새 비밀번호는 6자 이상이어야 합니다.");
      if (newPassword !== confirmPassword)
        return setPasswordError("비밀번호가 일치하지 않습니다.");

      setIsLoading(true);
      try {
        await loginWithEmailPassword(user.email, currentPassword, true);
        await changePassword(newPassword);
        clearWeakPassword();
        setWeakPw(false);
        setPasswordSuccess(true);
        setTimeout(closeModal, 2000);
      } catch (error) {
        if (
          error.code === "auth/wrong-password" ||
          error.code === "auth/invalid-credential"
        ) {
          setPasswordError("현재 비밀번호가 올바르지 않습니다.");
        } else {
          setPasswordError(`오류: ${error.message}`);
        }
      }
      setIsLoading(false);
    };

    // 학급 코드
    const handleEnterClassCode = () => {
      setNewClassCodeInput(userDoc?.classCode || "");
      setActiveModal("classCode");
      setShowUserMenu(false);
    };

    const saveClassCode = async () => {
      const trimmed = newClassCodeInput.trim().toUpperCase();
      if (!trimmed) return setClassCodeError("학급 코드를 입력해주세요.");

      setIsLoading(true);
      try {
        const isValid = await verifyClassCode(trimmed);
        if (!isValid) {
          setClassCodeError(`'${trimmed}'는 유효하지 않은 학급 코드입니다.`);
          setIsLoading(false);
          return;
        }

        const success = await updateUser({ classCode: trimmed });
        if (success) {
          setClassCodeSuccess(true);
          setTimeout(() => {
            toast.success(`학급 코드가 '${trimmed}'로 변경되었습니다!`);
            closeModal();
          }, 1000);
        } else {
          setClassCodeError("저장에 실패했습니다.");
        }
      } catch (error) {
        setClassCodeError(`오류: ${error.message}`);
      }
      setIsLoading(false);
    };

    // 계정 삭제 - 모달 열기
    const handleDeleteAccount = () => {
      setShowUserMenu(false);
      setDeleteConfirmText("");
      setDeletePassword("");
      setDeleteError("");
      setActiveModal("deleteAccount");
    };

    // 계정 삭제 확정 - 모달에서 확인 버튼 클릭 시
    const confirmDeleteAccount = async () => {
      setDeleteError("");
      if (deleteConfirmText !== "계정삭제") {
        setDeleteError("확인 문구가 일치하지 않습니다. '계정삭제'를 정확히 입력해주세요.");
        return;
      }
      if (!deletePassword) {
        setDeleteError("비밀번호를 입력해주세요.");
        return;
      }
      setIsLoading(true);
      try {
        await loginWithEmailPassword(user.email, deletePassword, true);
        await deleteCurrentUserAccount();
        setActiveModal(null);
        setDeleteConfirmText("");
        setDeletePassword("");
        toast.success("계정이 삭제되었습니다.");
      } catch (error) {
        setDeleteError(`삭제 오류: ${error.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    // 현금·쿠폰 — 두 헤더가 같은 알약을 쓴다(금액은 줄바꿈 없이, 좁으면 말줄임)
    const cashPill = (extra) => (
      <div className={`flex items-center gap-2 pl-3 pr-1 h-11 rounded-xl border border-emerald-200 bg-emerald-50 min-w-0 ${extra}`}>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-xs font-semibold text-emerald-800 whitespace-nowrap">
            {userDoc?.isAdmin ? "현금(국고)" : "현금"}
          </span>
          <span className="block text-sm font-bold text-slate-900 truncate tabular-nums" title={formatMoney(userDoc?.cash || 0)}>
            {formatMoney(userDoc?.cash || 0)}
          </span>
        </span>
        {!userDoc?.isAdmin ? (
          <button
            onClick={() => navigate("/my-assets?transfer=true")}
            className="w-9 h-9 !min-w-0 !min-h-0 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0"
            title="송금"
            aria-label="송금하기"
          >
            <Send size={15} />
          </button>
        ) : <span className="w-2 shrink-0" />}
      </div>
    );
    const couponPill = (extra) => (
      <div className={`flex items-center px-3 h-11 rounded-xl border border-rose-200 bg-rose-50 shrink-0 ${extra}`}>
        <span className="leading-tight whitespace-nowrap">
          <span className="flex items-center gap-1 text-xs font-semibold text-rose-800"><Gift size={12} />쿠폰</span>
          <span className="block text-sm font-bold text-slate-900 tabular-nums">{userDoc?.coupons || 0}개</span>
        </span>
      </div>
    );

    return (
      <>
        {/* 폰·세로 태블릿 헤더 (1024px 미만)
            · 폰: 1줄(메뉴·이름·레벨·도움말·아바타) + 2줄(현금·쿠폰)
            · 세로 태블릿(768~1023): 현금·쿠폰까지 한 줄 */}
        <header className="lg:hidden sticky top-0 z-30" style={HEADER_GLASS}>
          <div className="h-14 px-3 flex items-center gap-1.5 min-w-0">
            <button
              onClick={toggleSidebar}
              aria-label="메뉴 열기"
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 hover:bg-slate-100"
            >
              <LayoutDashboard size={22} className="text-slate-800" />
            </button>
            <h2 className="flex-1 min-w-0 truncate text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
              오늘도 <span style={{ color: 'var(--accent)' }}>알찬</span> 하루!
            </h2>

            <div className="hidden md:flex items-center gap-2 shrink-0">
              {cashPill("")}
              {couponPill("")}
            </div>

            <button
              onClick={() => navigate("/my-profile")}
              aria-label={`내 레벨 ${levelInfo?.level || 1}`}
              className="h-11 px-2 rounded-xl flex items-center gap-1 shrink-0 text-sm font-bold bg-violet-100 text-violet-800"
            >
              <span aria-hidden="true">{levelInfo?.icon || "🌟"}</span>
              Lv.{levelInfo?.level || 1}
              {bestAchievement && <span aria-hidden="true">{bestAchievement.icon}</span>}
            </button>
            {helpButton}
            <button
              onClick={() => navigate("/my-profile")}
              aria-label="내 프로필"
              className="w-11 h-11 shrink-0 flex items-center justify-center"
            >
              <Avatar shopOverlays={avatarOverlays} size={40} showBorder={true} />
            </button>
          </div>

          <div className="md:hidden px-3 pb-2 flex gap-2 min-w-0">
            {cashPill("flex-1")}
            {couponPill("")}
          </div>
        </header>
        {weakPwBar}

        {/* 가로 태블릿·PC 헤더 (1024px 이상) — 1024~1279 에서는 인사말·아이콘 상자를 접는다 */}
        <header className="hidden lg:flex items-center justify-between gap-3 z-10 h-16 min-h-16 max-h-16 px-4 sticky top-0 min-w-0" style={HEADER_GLASS}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onToggleSidebarCollapse}
              aria-label={isSidebarCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
              className="w-11 h-11 rounded-lg cursor-pointer flex items-center justify-center shrink-0"
              style={{ border: '1px solid var(--border-primary)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
            >
              {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <span className="hidden xl:inline text-[15px] font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
              오늘도 <span className="font-jua" style={{ color: 'var(--accent)' }}>알찬</span> 하루! 👋
            </span>
            <span className="hidden 2xl:inline text-[13px] text-slate-500 whitespace-nowrap">
              {displayName}님 환영합니다
            </span>
          </div>

          <div className="flex items-center gap-2 xl:gap-3 min-w-0">
            {cashPill("")}
            {couponPill("")}

            {/* 레벨 & 업적 */}
            <button
              onClick={() => navigate("/my-profile")}
              aria-label={`내 레벨 ${levelInfo?.level || 1} ${levelInfo?.title || ""}`}
              className="flex items-center gap-2 px-3 h-11 rounded-xl cursor-pointer bg-violet-100 hover:bg-violet-200 shrink-0"
            >
              <span aria-hidden="true" className="text-base">{levelInfo?.icon || "🌟"}</span>
              <span className="text-left leading-tight whitespace-nowrap">
                <span className="block text-[13px] font-bold text-violet-800">Lv.{levelInfo?.level || 1}</span>
                <span className="hidden xl:block text-xs font-semibold text-slate-700">{levelInfo?.title || "새싹"}</span>
              </span>
              {bestAchievement && <span aria-hidden="true">{bestAchievement.icon}</span>}
            </button>

            {helpButton}

            {/* 사용자 메뉴 */}
            <div className="relative min-w-0" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 pl-1 h-11 border-none bg-transparent cursor-pointer max-w-[190px]"
              >
                <span className="text-right min-w-0">
                  <span className="block text-sm font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {displayName}
                  </span>
                  <span className="block text-xs text-indigo-600 font-medium whitespace-nowrap leading-tight">
                    {userRole}
                  </span>
                </span>
                <ChevronDown size={16} className="text-slate-500 shrink-0" />
              </button>

              {/* 드롭다운 메뉴 */}
              {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-72 rounded-2xl shadow-2xl overflow-hidden z-50" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-primary)' }}>
                  <div className="px-5 py-4" style={{ background: 'var(--accent-bg)', borderBottom: '1px solid var(--border-primary)' }}>
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
                    <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                      {isCurrentUserAdmin && (
                        <span className="text-indigo-400 font-semibold">
                          관리자
                        </span>
                      )}
                      {userDoc?.classCode && (
                        <span>학급: {userDoc.classCode}</span>
                      )}
                    </p>
                  </div>

                  <div className="p-2">
                    {/* 내 프로필 - 첫 번째로 배치 */}
                    <button
                      onClick={() => {
                        navigate("/my-profile");
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-800 hover:bg-indigo-600/20 transition-colors bg-indigo-500/10 border border-indigo-500/30 mb-2"
                    >
                      <User size={18} className="text-indigo-400" />내 프로필
                      <span className="ml-auto text-xs text-indigo-400">
                        Lv.{levelInfo?.level || 0}
                      </span>
                    </button>

                    <div className="h-px bg-slate-200 my-2" />

                    <button
                      onClick={handleChangeNickname}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}
                    >
                      <User size={18} className="text-slate-400" />
                      닉네임 변경
                    </button>
                    <button
                      onClick={handleChangePassword}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}
                    >
                      <Key size={18} className="text-slate-400" />
                      비밀번호 변경
                    </button>
                    {/* 🏫 Phase1(2026-07-19): 학급 코드 변경은 슈퍼관리자 전용(교사 자기-classCode 변경=cross-class hop 봉인).
                        rules에서도 classCode write는 슈퍼관리자만 허용 — UI/규칙 일치. */}
                    {userDoc?.isSuperAdmin && (
                      <button
                        onClick={handleEnterClassCode}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}
                      >
                        <Building2 size={18} className="text-slate-400" />
                        학급 코드 변경
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowSettings(true);
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}
                    >
                      <Settings size={18} className="text-slate-400" />
                      설정
                    </button>

                    {/* 🔒 batch7-f: 계정 삭제는 관리자 전용(학생 self-delete=재생성-리셋 마스터키 차단, 사용자 결정).
                        MyProfile.js와 동일 게이트. 학생 계정삭제는 교사가 StudentManager로 처리. rules users delete도 isAdmin() 잠금.
                        (code-reviewer: 전역 헤더의 이 버튼이 MyProfile과 별개 삭제경로였고 admin-gate 누락돼 있었음.) */}
                    {(userDoc?.isAdmin || userDoc?.isTeacher || userDoc?.isSuperAdmin) && (
                      <>
                        <div className="h-px bg-slate-200 my-2" />
                        <button
                          onClick={handleDeleteAccount}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={18} />
                          계정 삭제
                        </button>
                      </>
                    )}

                    <div className="h-px bg-slate-200 my-2" />

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}
                    >
                      <LogOut size={18} className="text-slate-400" />
                      로그아웃
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 모달들 */}
        <Modal
          isOpen={activeModal === "nickname"}
          onClose={closeModal}
          title="닉네임 변경"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                새 닉네임
              </label>
              <input
                type="text"
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder="2-12자"
                maxLength={12}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                autoFocus
              />
            </div>
            {nicknameError && (
              <p className="text-sm text-red-700 bg-red-50 p-3 rounded-xl">
                {nicknameError}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={saveNickname}
                disabled={isLoading}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50"
              >
                {isLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={activeModal === "password"}
          onClose={closeModal}
          title="비밀번호 변경"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                현재 비밀번호
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                새 비밀번호
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                비밀번호 확인
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
              />
            </div>
            {passwordError && (
              <p className="text-sm text-red-700 bg-red-50 p-3 rounded-xl">
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-800 bg-green-50 p-3 rounded-xl">
                비밀번호가 변경되었습니다!
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={savePassword}
                disabled={isLoading || passwordSuccess}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50"
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={activeModal === "classCode"}
          onClose={closeModal}
          title="학급 코드 변경"
        >
          <div className="space-y-4">
            {userDoc?.classCode && (
              <p className="text-sm text-slate-400 bg-white p-3 rounded-xl">
                현재 학급 코드:{" "}
                <strong className="text-slate-800">{userDoc.classCode}</strong>
              </p>
            )}
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-2">
                새 학급 코드
              </label>
              <input
                type="text"
                value={newClassCodeInput}
                onChange={(e) =>
                  setNewClassCodeInput(
                    e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
                  )
                }
                placeholder="영문자와 숫자만"
                maxLength={20}
                className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)' }}
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-2">
                영문자와 숫자만 입력 가능합니다.
              </p>
            </div>
            {classCodeError && (
              <p className="text-sm text-red-700 bg-red-50 p-3 rounded-xl">
                {classCodeError}
              </p>
            )}
            {classCodeSuccess && (
              <p className="text-sm text-green-800 bg-green-50 p-3 rounded-xl">
                학급 코드가 저장되었습니다!
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={saveClassCode}
                disabled={isLoading}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700 transition-all disabled:opacity-50"
              >
                {isLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </Modal>

        {/* 계정 삭제 모달 */}
        <Modal
          isOpen={activeModal === "deleteAccount"}
          onClose={() => {
            setActiveModal(null);
            setDeleteConfirmText("");
            setDeletePassword("");
            setDeleteError("");
          }}
          title="계정 삭제"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.25)' }}>
              ⚠️ 계정을 삭제하면 모든 데이터가 영구적으로 제거되며 복구할 수 없습니다.
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                확인 문구
              </label>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                삭제를 진행하려면 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>'계정삭제'</span>를 그대로 입력해주세요.
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="계정삭제"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                현재 비밀번호
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
              />
            </div>
            {deleteError && (
              <div className="text-xs" style={{ color: '#dc2626' }}>
                {deleteError}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setActiveModal(null);
                  setDeleteConfirmText("");
                  setDeletePassword("");
                  setDeleteError("");
                }}
                disabled={isLoading}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
              >
                취소
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={isLoading}
                className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-500/30 hover:from-rose-700 hover:to-red-700 transition-all disabled:opacity-50"
              >
                {isLoading ? "삭제 중..." : "계정 삭제"}
              </button>
            </div>
          </div>
        </Modal>

        {/* 설정 패널 */}
        <SettingsPanel
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </>
    );
  },
);

export default AlchanHeader;
