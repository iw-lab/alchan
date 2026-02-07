// src/pages/my-profile/MyProfile.js - 내 프로필 페이지
import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { verifyClassCode, db } from "../../firebase";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from "firebase/auth";
import Avatar from "../../components/Avatar";
import AvatarEditor from "../../components/AvatarEditor";
import { getAvatarConfig } from "../../utils/avatarSystem";
import { getLevelInfo, LEVEL_THRESHOLDS } from "../../utils/levelSystem";
import { getUserAchievements, getAchievementById } from "../../utils/achievementSystem";
import { StreakDisplay, StreakRewardInfo } from "../../components/DailyReward";
import { formatKoreanCurrency } from "../../utils/numberFormatter";
import { User, Key, Building2, Trash2, LogOut, Settings, ChevronRight } from "lucide-react";

export default function MyProfile() {
  const { user, userDoc, logout } = useAuth();
  const userId = user?.uid;
  const userName = userDoc?.name || userDoc?.nickname || user?.displayName || "사용자";

  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [avatarConfig, setAvatarConfig] = useState(null);
  const [achievements, setAchievements] = useState([]);

  // 계정 설정 모달 상태
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showClassCodeModal, setShowClassCodeModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // 입력 상태
  const [newNickname, setNewNickname] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 자산 계산
  const cash = Number(userDoc?.cash) || 0;
  const stockValue = Number(userDoc?.stockValue) || 0;
  const realEstateValue = Number(userDoc?.realEstateValue) || 0;
  const itemValue = Number(userDoc?.itemValue) || 0;
  const netAssets = cash + stockValue + realEstateValue + itemValue;

  // 레벨 정보
  const levelInfo = getLevelInfo(netAssets);

  useEffect(() => {
    if (userId) {
      setAvatarConfig(getAvatarConfig(userId));
      setAchievements(getUserAchievements(userId));
    }
  }, [userId]);

  const handleAvatarSave = (newConfig) => {
    setAvatarConfig(newConfig);
  };

  // 모달 초기화
  const resetModals = () => {
    setNewNickname("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewClassCode("");
    setDeleteConfirmText("");
    setError("");
    setIsLoading(false);
  };

  // 닉네임 변경
  const handleChangeNickname = async () => {
    if (!newNickname.trim()) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (newNickname.length < 2 || newNickname.length > 10) {
      setError("닉네임은 2~10자 사이여야 합니다.");
      return;
    }

    setIsLoading(true);
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { nickname: newNickname.trim() });
      alert("닉네임이 변경되었습니다.");
      setShowNicknameModal(false);
      resetModals();
    } catch (err) {
      setError("닉네임 변경에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 비밀번호 변경
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("모든 필드를 입력해주세요.");
      return;
    }
    if (newPassword.length < 6) {
      setError("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    setIsLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      alert("비밀번호가 변경되었습니다.");
      setShowPasswordModal(false);
      resetModals();
    } catch (err) {
      if (err.code === "auth/wrong-password") {
        setError("현재 비밀번호가 올바르지 않습니다.");
      } else {
        setError("비밀번호 변경에 실패했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 학급 코드 변경
  const handleChangeClassCode = async () => {
    if (!newClassCode.trim()) {
      setError("학급 코드를 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const isValid = await verifyClassCode(newClassCode.trim());
      if (!isValid) {
        setError("유효하지 않은 학급 코드입니다.");
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { classCode: newClassCode.trim() });
      alert("학급 코드가 변경되었습니다.");
      setShowClassCodeModal(false);
      resetModals();
    } catch (err) {
      setError("학급 코드 변경에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 계정 삭제
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "계정삭제") {
      setError("'계정삭제'를 정확히 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      // Firestore 사용자 문서 삭제
      const userRef = doc(db, "users", userId);
      await deleteDoc(userRef);

      // Firebase Auth 계정 삭제
      await deleteUser(user);

      alert("계정이 삭제되었습니다.");
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        setError("보안을 위해 다시 로그인 후 시도해주세요.");
      } else {
        setError("계정 삭제에 실패했습니다.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 업적을 레어도 순으로 정렬 (legendary > epic > rare > common)
  const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const sortedAchievements = [...achievements].sort((a, b) => {
    const achA = getAchievementById(a.id);
    const achB = getAchievementById(b.id);
    return (rarityOrder[achA?.rarity] || 99) - (rarityOrder[achB?.rarity] || 99);
  });

  // 최고 업적 (가장 레어한 것)
  const bestAchievement = sortedAchievements.length > 0
    ? getAchievementById(sortedAchievements[0].id)
    : null;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-400">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full bg-cyber-dark">
      <div className="w-full max-w-4xl mx-auto px-4 md:px-6 py-6">
        {/* 페이지 제목 */}
        <h1 className="text-[28px] font-extrabold bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] bg-clip-text text-transparent mb-6">
          내 프로필
        </h1>

        {/* 프로필 카드 */}
        <div className="bg-gradient-to-br from-cyber-light to-[#16213e] rounded-3xl p-8 mb-6 border-2 border-gray-700 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
          <div className="flex flex-col items-center gap-6">
            {/* 아바타 */}
            <div className="relative">
              <Avatar config={avatarConfig} size={180} />
              <button
                onClick={() => setShowAvatarEditor(true)}
                className="absolute bottom-[5px] right-[5px] w-11 h-11 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] border-[3px] border-cyber-light text-lg cursor-pointer flex items-center justify-center shadow-[0_4px_15px_rgba(167,139,250,0.4)]"
                title="아바타 수정"
              >
                ✏️
              </button>
            </div>

            {/* 사용자 정보 */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-cyber-text mb-2">
                {userName}
              </h2>

              {/* 레벨 배지 */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[20px] mb-3"
                style={{
                  background: `linear-gradient(135deg, ${levelInfo.color}20 0%, ${levelInfo.color}10 100%)`,
                  border: `2px solid ${levelInfo.color}`,
                }}
              >
                <span className="text-xl">{levelInfo.icon}</span>
                <span className="font-bold text-sm" style={{ color: levelInfo.color }}>
                  Lv.{levelInfo.level} {levelInfo.title}
                </span>
              </div>

              {/* 최고 업적 */}
              {bestAchievement && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-lg">{bestAchievement.icon}</span>
                  <span
                    className="font-semibold text-[13px]"
                    style={{
                      color: bestAchievement.rarity === "legendary" ? "#f59e0b" :
                             bestAchievement.rarity === "epic" ? "#a78bfa" :
                             bestAchievement.rarity === "rare" ? "#3b82f6" : "#9ca3af",
                    }}
                  >
                    {bestAchievement.name}
                  </span>
                </div>
              )}

              {/* 출석 스트릭 */}
              <div className="mt-3">
                <StreakDisplay userId={userId} />
              </div>
            </div>
          </div>
        </div>

        {/* 레벨 진행도 카드 */}
        <div className="bg-gradient-to-br from-[#1e1e3f] to-[#16213e] rounded-[20px] p-6 mb-6 border-2 border-gray-700">
          <h3 className="text-[#a78bfa] text-lg font-bold mb-4 flex items-center gap-2">
            <span>📊</span> 레벨 진행도
          </h3>

          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-[#9ca3af] text-sm">
                {levelInfo.icon} Lv.{levelInfo.level} {levelInfo.title}
              </span>
              <span className="text-cyber-text text-sm font-semibold">
                {levelInfo.progress.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 bg-gray-700 rounded-md overflow-hidden">
              <div
                className="h-full rounded-md transition-all duration-500"
                style={{
                  width: `${levelInfo.progress}%`,
                  background: `linear-gradient(90deg, ${levelInfo.color} 0%, ${levelInfo.color}99 100%)`,
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>현재: {formatKoreanCurrency(netAssets)}</span>
              {levelInfo.level < LEVEL_THRESHOLDS.length - 1 && (
                <span>다음: {formatKoreanCurrency(LEVEL_THRESHOLDS[levelInfo.level + 1]?.minAssets || 0)}</span>
              )}
            </div>
          </div>
        </div>

        {/* 업적 카드 */}
        <div className="bg-gradient-to-br from-[#1e1e3f] to-[#16213e] rounded-[20px] p-6 mb-6 border-2 border-gray-700">
          <h3 className="text-[#a78bfa] text-lg font-bold mb-4 flex items-center gap-2">
            <span>🏆</span> 획득한 업적 ({achievements.length}개)
          </h3>

          {achievements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              아직 획득한 업적이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {sortedAchievements.map((ach) => {
                const achievement = getAchievementById(ach.id);
                if (!achievement) return null;

                const rarityColors = {
                  legendary: { bg: "#f59e0b20", border: "#f59e0b", text: "#f59e0b" },
                  epic: { bg: "#a78bfa20", border: "#a78bfa", text: "#a78bfa" },
                  rare: { bg: "#3b82f620", border: "#3b82f6", text: "#3b82f6" },
                  common: { bg: "#6b728020", border: "#6b7280", text: "#9ca3af" },
                };
                const colors = rarityColors[achievement.rarity] || rarityColors.common;

                return (
                  <div
                    key={ach.id}
                    className="rounded-xl p-4 text-center transition-all duration-200"
                    style={{
                      background: colors.bg,
                      border: `2px solid ${colors.border}`,
                    }}
                  >
                    <div className="text-[32px] mb-2">
                      {achievement.icon}
                    </div>
                    <div className="text-xs font-semibold mb-1" style={{ color: colors.text }}>
                      {achievement.name}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {new Date(ach.unlockedAt).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 출석 보상 안내 */}
        <StreakRewardInfo />

        {/* 계정 설정 섹션 */}
        <div className="bg-gradient-to-br from-[#1e1e3f] to-[#16213e] rounded-[20px] p-6 mb-6 border-2 border-gray-700">
          <h3 className="text-[#a78bfa] text-lg font-bold mb-4 flex items-center gap-2">
            <Settings size={20} /> 계정 설정
          </h3>

          <div className="flex flex-col gap-2">
            {/* 현재 학급 코드 표시 */}
            <div className="p-4 bg-[#0f0f23] rounded-xl border border-gray-700 mb-2">
              <div className="flex justify-between items-center">
                <span className="text-[#9ca3af] text-sm">현재 학급 코드</span>
                <span className="text-cyber-text text-base font-semibold">
                  {userDoc?.classCode || "없음"}
                </span>
              </div>
            </div>

            {/* 닉네임 변경 */}
            <button
              onClick={() => { setShowNicknameModal(true); setError(""); }}
              className="flex items-center gap-3 p-4 bg-[#0f0f23] rounded-xl border border-gray-700 cursor-pointer transition-all duration-200 hover:border-[#a78bfa]/50"
            >
              <User size={20} className="text-[#a78bfa]" />
              <span className="text-cyber-text text-sm flex-1 text-left">닉네임 변경</span>
              <ChevronRight size={18} className="text-gray-500" />
            </button>

            {/* 비밀번호 변경 */}
            <button
              onClick={() => { setShowPasswordModal(true); setError(""); }}
              className="flex items-center gap-3 p-4 bg-[#0f0f23] rounded-xl border border-gray-700 cursor-pointer transition-all duration-200 hover:border-[#a78bfa]/50"
            >
              <Key size={20} className="text-[#a78bfa]" />
              <span className="text-cyber-text text-sm flex-1 text-left">비밀번호 변경</span>
              <ChevronRight size={18} className="text-gray-500" />
            </button>

            {/* 학급 코드 변경 */}
            <button
              onClick={() => { setShowClassCodeModal(true); setError(""); }}
              className="flex items-center gap-3 p-4 bg-[#0f0f23] rounded-xl border border-gray-700 cursor-pointer transition-all duration-200 hover:border-[#a78bfa]/50"
            >
              <Building2 size={20} className="text-[#a78bfa]" />
              <span className="text-cyber-text text-sm flex-1 text-left">학급 코드 변경</span>
              <ChevronRight size={18} className="text-gray-500" />
            </button>

            {/* 로그아웃 */}
            <button
              onClick={logout}
              className="flex items-center gap-3 p-4 bg-[#0f0f23] rounded-xl border border-gray-700 cursor-pointer transition-all duration-200 hover:border-gray-500 mt-2"
            >
              <LogOut size={20} className="text-[#9ca3af]" />
              <span className="text-cyber-text text-sm flex-1 text-left">로그아웃</span>
              <ChevronRight size={18} className="text-gray-500" />
            </button>

            {/* 계정 삭제 */}
            <button
              onClick={() => { setShowDeleteModal(true); setError(""); }}
              className="flex items-center gap-3 p-4 bg-red-500/10 rounded-xl border border-red-500/30 cursor-pointer transition-all duration-200 hover:border-red-500/60"
            >
              <Trash2 size={20} className="text-red-500" />
              <span className="text-red-500 text-sm flex-1 text-left">계정 삭제</span>
              <ChevronRight size={18} className="text-red-500" />
            </button>
          </div>
        </div>
      </div>

      {/* 아바타 에디터 모달 */}
      <AvatarEditor
        isOpen={showAvatarEditor}
        onClose={() => setShowAvatarEditor(false)}
        userId={userId}
        onSave={handleAvatarSave}
      />

      {/* 닉네임 변경 모달 */}
      {showNicknameModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-5"
          onClick={() => { setShowNicknameModal(false); resetModals(); }}
        >
          <div
            className="bg-gradient-to-br from-cyber-light to-[#0f0f23] rounded-[20px] p-6 max-w-[400px] w-full border-2 border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-cyber-text text-lg font-bold mb-5">
              닉네임 변경
            </h3>
            <input
              type="text"
              value={newNickname}
              onChange={e => setNewNickname(e.target.value)}
              placeholder="새 닉네임 (2~10자)"
              maxLength={10}
              className="w-full p-3.5 bg-[#0f0f23] border-2 border-gray-700 rounded-xl text-cyber-text text-sm mb-3 focus:border-[#a78bfa] focus:outline-none"
            />
            {error && <p className="text-red-500 text-[13px] mb-3">{error}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowNicknameModal(false); resetModals(); }}
                className="flex-1 p-3 bg-gray-700 border-none rounded-[10px] text-cyber-text text-sm cursor-pointer hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={handleChangeNickname}
                disabled={isLoading}
                className="flex-1 p-3 bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] border-none rounded-[10px] text-white text-sm font-semibold cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {showPasswordModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-5"
          onClick={() => { setShowPasswordModal(false); resetModals(); }}
        >
          <div
            className="bg-gradient-to-br from-cyber-light to-[#0f0f23] rounded-[20px] p-6 max-w-[400px] w-full border-2 border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-cyber-text text-lg font-bold mb-5">
              비밀번호 변경
            </h3>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              className="w-full p-3.5 bg-[#0f0f23] border-2 border-gray-700 rounded-xl text-cyber-text text-sm mb-2.5 focus:border-[#a78bfa] focus:outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (6자 이상)"
              className="w-full p-3.5 bg-[#0f0f23] border-2 border-gray-700 rounded-xl text-cyber-text text-sm mb-2.5 focus:border-[#a78bfa] focus:outline-none"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              className="w-full p-3.5 bg-[#0f0f23] border-2 border-gray-700 rounded-xl text-cyber-text text-sm mb-3 focus:border-[#a78bfa] focus:outline-none"
            />
            {error && <p className="text-red-500 text-[13px] mb-3">{error}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowPasswordModal(false); resetModals(); }}
                className="flex-1 p-3 bg-gray-700 border-none rounded-[10px] text-cyber-text text-sm cursor-pointer hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={handleChangePassword}
                disabled={isLoading}
                className="flex-1 p-3 bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] border-none rounded-[10px] text-white text-sm font-semibold cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 학급 코드 변경 모달 */}
      {showClassCodeModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-5"
          onClick={() => { setShowClassCodeModal(false); resetModals(); }}
        >
          <div
            className="bg-gradient-to-br from-cyber-light to-[#0f0f23] rounded-[20px] p-6 max-w-[400px] w-full border-2 border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-cyber-text text-lg font-bold mb-5">
              학급 코드 변경
            </h3>
            <p className="text-[#9ca3af] text-[13px] mb-4">
              현재 학급: <span className="text-[#a78bfa] font-semibold">{userDoc?.classCode || "없음"}</span>
            </p>
            <input
              type="text"
              value={newClassCode}
              onChange={e => setNewClassCode(e.target.value.toUpperCase())}
              placeholder="새 학급 코드"
              className="w-full p-3.5 bg-[#0f0f23] border-2 border-gray-700 rounded-xl text-cyber-text text-sm mb-3 uppercase focus:border-[#a78bfa] focus:outline-none"
            />
            {error && <p className="text-red-500 text-[13px] mb-3">{error}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowClassCodeModal(false); resetModals(); }}
                className="flex-1 p-3 bg-gray-700 border-none rounded-[10px] text-cyber-text text-sm cursor-pointer hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={handleChangeClassCode}
                disabled={isLoading}
                className="flex-1 p-3 bg-gradient-to-br from-[#a78bfa] to-[#8b5cf6] border-none rounded-[10px] text-white text-sm font-semibold cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
              >
                {isLoading ? "변경 중..." : "변경"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 계정 삭제 모달 */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[2000] p-5"
          onClick={() => { setShowDeleteModal(false); resetModals(); }}
        >
          <div
            className="bg-gradient-to-br from-cyber-light to-[#0f0f23] rounded-[20px] p-6 max-w-[400px] w-full border-2 border-red-500"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-red-500 text-lg font-bold mb-4">
              ⚠️ 계정 삭제
            </h3>
            <p className="text-[#9ca3af] text-[13px] mb-4 leading-relaxed">
              계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
              정말 삭제하시려면 아래에 <span className="text-red-500 font-semibold">'계정삭제'</span>를 입력하세요.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="계정삭제"
              className="w-full p-3.5 bg-[#0f0f23] border-2 border-red-500 rounded-xl text-cyber-text text-sm mb-3 focus:outline-none"
            />
            {error && <p className="text-red-500 text-[13px] mb-3">{error}</p>}
            <div className="flex gap-2.5">
              <button
                onClick={() => { setShowDeleteModal(false); resetModals(); }}
                className="flex-1 p-3 bg-gray-700 border-none rounded-[10px] text-cyber-text text-sm cursor-pointer hover:bg-gray-600"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isLoading || deleteConfirmText !== "계정삭제"}
                className={`flex-1 p-3 border-none rounded-[10px] text-white text-sm font-semibold cursor-pointer disabled:cursor-not-allowed ${
                  deleteConfirmText === "계정삭제" ? "bg-red-500 opacity-100" : "bg-gray-700 opacity-50"
                } ${isLoading ? "opacity-50" : ""}`}
              >
                {isLoading ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
