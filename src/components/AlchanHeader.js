// src/components/AlchanHeader.js
// 알찬 UI 헤더 컴포넌트 - 새로운 슬레이트 기반 디자인

import React, { useState, useRef, useEffect, memo, useMemo } from "react";
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
  Gift,
  Settings,
  LayoutDashboard,
  Send,
} from "lucide-react";
import SettingsPanel from "./SettingsPanel";
import Avatar from "./Avatar";
import { getAvatarConfig } from "../utils/avatarSystem";
import { getLevelInfo } from "../utils/levelSystem";
import {
  getUserAchievements,
  getAchievementById,
} from "../utils/achievementSystem";
import { formatKoreanNumber, getCurrencyUnit } from "../utils/numberFormatter";

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
  ({ toggleSidebar, isSidebarCollapsed, onToggleSidebarCollapse }) => {
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

    const isCurrentUserAdmin =
      userDoc?.isAdmin || userDoc?.role === "admin" || userDoc?.isSuperAdmin;
    const displayName =
      userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

    let userRole = "학생";
    if (userDoc?.isSuperAdmin) userRole = "앱 관리자";
    else if (userDoc?.isAdmin) userRole = "교사";

    // 아바타, 레벨, 업적 정보
    const [avatarConfig, setAvatarConfig] = useState(null);

    // 아바타 설정 로드 및 변경 이벤트 구독
    useEffect(() => {
      if (user?.uid) {
        setAvatarConfig(getAvatarConfig(user.uid));
      }

      // 아바타 변경 이벤트 구독
      const handleAvatarChange = (e) => {
        if (e.detail.userId === user?.uid) {
          setAvatarConfig(e.detail.config);
        }
      };

      window.addEventListener("avatarChanged", handleAvatarChange);
      return () =>
        window.removeEventListener("avatarChanged", handleAvatarChange);
    }, [user?.uid]);

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

    const bestAchievement = useMemo(() => {
      if (!user?.uid) return null;
      const achievements = getUserAchievements(user.uid);
      if (achievements.length === 0) return null;

      const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
      const sorted = [...achievements].sort((a, b) => {
        const achA = getAchievementById(a.id);
        const achB = getAchievementById(b.id);
        return (
          (rarityOrder[achA?.rarity] || 99) - (rarityOrder[achB?.rarity] || 99)
        );
      });

      return getAchievementById(sorted[0].id);
    }, [user?.uid]);

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

    const handleLogout = async () => {
      try {
        if (logout) {
          await logout();
          navigate("/login");
        }
      } catch (e) {
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
          alert("닉네임이 변경되었습니다.");
          closeModal();
        } else {
          setNicknameError("변경에 실패했습니다.");
        }
      } catch (error) {
        setNicknameError(`오류: ${error.message}`);
      }
      setIsLoading(false);
    };

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
            alert(`학급 코드가 '${trimmed}'로 변경되었습니다!`);
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

    // 계정 삭제
    const handleDeleteAccount = async () => {
      setShowUserMenu(false);
      const confirmation = window.prompt(
        "정말로 계정을 삭제하시려면 '계정삭제'라고 입력해주세요.",
      );
      if (confirmation === "계정삭제") {
        const password = window.prompt("현재 비밀번호를 입력해주세요.");
        if (password) {
          try {
            await loginWithEmailPassword(user.email, password, true);
            await deleteCurrentUserAccount();
            alert("계정이 삭제되었습니다.");
          } catch (error) {
            alert(`삭제 오류: ${error.message}`);
          }
        }
      }
    };

    return (
      <>
        {/* 모바일 헤더 */}
        <header className="md:hidden sticky top-0 z-30" style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-primary)' }}>
          {/* 상단 헤더 바 */}
          <div className="h-14 px-3 flex items-center justify-between">
            {/* 왼쪽: 메뉴 버튼 + 앱 이름 */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSidebar}
                className="p-2.5 rounded-lg hover:bg-white/5 transition-colors"
              >
                <LayoutDashboard size={22} className="text-slate-800" />
              </button>
              <h2 className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                오늘도 <span style={{ color: 'var(--accent)' }}>알찬</span> 하루!
              </h2>
            </div>

            {/* 오른쪽: 레벨/업적 + 아바타 */}
            <div className="flex items-center gap-2">
              {/* 레벨 & 업적 배지 */}
              <div
                onClick={() => navigate("/my-profile")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer bg-[#a78bfa]/20"
              >
                <span className="text-sm">{levelInfo?.icon || "🌟"}</span>
                <div className="flex flex-col leading-none">
                  <span className="text-[9px] text-slate-500">LEVEL</span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: levelInfo?.color || "#a78bfa" }}
                  >
                    {levelInfo?.level || 1}
                  </span>
                </div>
                {bestAchievement && (
                  <span className="text-sm ml-0.5">{bestAchievement.icon}</span>
                )}
              </div>

              {/* 아바타 - 모바일에서 프로필로 이동 */}
              <div
                onClick={() => navigate("/my-profile")}
                className="cursor-pointer"
              >
                <Avatar config={avatarConfig} size={40} showBorder={true} />
              </div>
            </div>
          </div>

          {/* 모바일 자산 정보 바 */}
          <div className="px-4 pb-3 flex gap-3">
            {/* 현금 */}
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-emerald-900/10 rounded-xl border border-emerald-500/20">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="font-bold text-xs">₩</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider leading-none">
                  {userDoc?.isAdmin ? "현금(국고)" : "현금"}
                </p>
                <p className="text-sm font-bold text-slate-800 truncate">
                  {formatMoney(userDoc?.cash || 0)}
                </p>
              </div>
              {!userDoc?.isAdmin && (
                <button
                  onClick={() => navigate("/my-assets?transfer=true")}
                  className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                  title="송금"
                >
                  <Send size={12} />
                </button>
              )}
            </div>

            {/* 쿠폰 */}
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-rose-900/10 rounded-xl border border-rose-500/20">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-slate-800 flex items-center justify-center shadow-sm flex-shrink-0">
                <Gift size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] text-rose-400 font-bold uppercase tracking-wider leading-none">
                  쿠폰
                </p>
                <p className="text-sm font-bold text-slate-800 truncate">
                  {userDoc?.coupons || 0}개
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* PC 헤더 */}
        <header className="hidden md:flex items-center justify-between shadow-sm z-10 h-16 min-h-16 max-h-16 px-4" style={{ backgroundColor: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-primary)' }}>
          <div className="flex items-center gap-3">
            {/* 사이드바 토글 버튼 */}
            <button
              onClick={onToggleSidebarCollapse}
              className="p-2 rounded-lg cursor-pointer flex items-center justify-center"
              style={{ border: '1px solid var(--border-primary)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
            >
              {isSidebarCollapsed ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                오늘도 <span className="font-jua" style={{ color: 'var(--accent)' }}>알찬</span> 하루! 👋
              </span>
              <span className="text-[13px] text-slate-400 whitespace-nowrap">
                {displayName}님 환영합니다
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 현금 위젯 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-900/10 rounded-lg text-emerald-400">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                ₩
              </div>
              <div>
                <div className="text-[10px] font-semibold opacity-70 leading-tight">
                  {userDoc?.isAdmin ? "현금(국고)" : "현금"}
                </div>
                <div className="text-[13px] font-bold whitespace-nowrap leading-tight">
                  {formatMoney(userDoc?.cash || 0)}
                </div>
              </div>
              {!userDoc?.isAdmin && (
                <button
                  onClick={() => navigate("/my-assets?transfer=true")}
                  className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center hover:bg-emerald-500/30 transition-colors"
                  title="송금"
                >
                  <Send size={13} />
                </button>
              )}
            </div>

            {/* 쿠폰 위젯 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-900/10 rounded-lg text-rose-400">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-slate-800 flex items-center justify-center">
                <Gift size={14} />
              </div>
              <div>
                <div className="text-[10px] font-semibold opacity-70 leading-tight">
                  쿠폰
                </div>
                <div className="text-[13px] font-bold whitespace-nowrap leading-tight">
                  {userDoc?.coupons || 0}개
                </div>
              </div>
            </div>

            {/* 레벨 & 업적 위젯 */}
            <div
              onClick={() => navigate("/my-profile")}
              className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 rounded-lg cursor-pointer transition-all duration-200 hover:bg-violet-500/20"
            >
              <div
                className="flex items-center justify-center w-7 h-7 rounded-md text-sm"
                style={{ background: levelInfo?.color || "#a78bfa" }}
              >
                {levelInfo?.icon || "🌟"}
              </div>
              <div>
                <div
                  className="text-[10px] font-semibold leading-tight"
                  style={{ color: levelInfo?.color || "#a78bfa" }}
                >
                  Lv.{levelInfo?.level || 1}
                </div>
                <div className="text-[11px] font-bold whitespace-nowrap leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {levelInfo?.title || "새싹"}
                </div>
              </div>
              {bestAchievement && (
                <div
                  className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded"
                  style={{
                    background:
                      bestAchievement.rarity === "legendary"
                        ? "rgba(245, 158, 11, 0.2)"
                        : bestAchievement.rarity === "epic"
                          ? "rgba(167, 139, 250, 0.2)"
                          : bestAchievement.rarity === "rare"
                            ? "rgba(59, 130, 246, 0.2)"
                            : "rgba(107, 114, 128, 0.2)",
                  }}
                >
                  <span className="text-xs">{bestAchievement.icon}</span>
                </div>
              )}
            </div>

            {/* 사용자 메뉴 */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pl-3 border-none bg-transparent cursor-pointer"
              >
                <div className="text-right">
                  <div className="text-[13px] font-bold whitespace-nowrap leading-tight" style={{ color: 'var(--text-primary)' }}>
                    {displayName}
                  </div>
                  <div className="text-[11px] text-indigo-400 font-medium whitespace-nowrap leading-tight">
                    {userRole}
                  </div>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/my-profile");
                  }}
                  className="cursor-pointer"
                >
                  <Avatar config={avatarConfig} size={40} showBorder={true} />
                </div>
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

                  {/* 모바일: 자산 정보 */}
                  <div className="md:hidden px-5 py-4" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-400">{userDoc?.isAdmin ? "현금(국고)" : "현금"}</span>
                      <span className="font-bold text-emerald-400">
                        {formatMoney(userDoc?.cash || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-400">쿠폰</span>
                      <span className="font-bold text-rose-400">
                        {userDoc?.coupons || 0}개
                      </span>
                    </div>
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

                    <div className="h-px bg-slate-700 my-2" />

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
                    <button
                      onClick={handleEnterClassCode}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}
                    >
                      <Building2 size={18} className="text-slate-400" />
                      학급 코드 변경
                    </button>
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

                    <div className="h-px bg-slate-600 my-2" />

                    <button
                      onClick={handleDeleteAccount}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={18} />
                      계정 삭제
                    </button>

                    <div className="h-px bg-slate-600 my-2" />

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
              <p className="text-sm text-red-400 bg-red-900/10 p-3 rounded-xl">
                {nicknameError}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 border border-slate-700 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white transition-colors"
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
              <p className="text-sm text-red-400 bg-red-900/10 p-3 rounded-xl">
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-400 bg-green-900/10 p-3 rounded-xl">
                비밀번호가 변경되었습니다!
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 border border-slate-700 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white transition-colors"
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
              <p className="text-sm text-red-400 bg-red-900/10 p-3 rounded-xl">
                {classCodeError}
              </p>
            )}
            {classCodeSuccess && (
              <p className="text-sm text-green-400 bg-green-900/10 p-3 rounded-xl">
                학급 코드가 저장되었습니다!
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 border border-slate-700 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white transition-colors"
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
