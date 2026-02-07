// src/components/DailyReward.js - 일일 접속 보상 컴포넌트 (고급 버전)
import React, { useState, useEffect } from "react";

/**
 * 일일 접속 스트릭 보상 시스템
 * 1일차: 1만원부터 시작
 * 10일차: 10만원
 * 10일 이후: 계속 10만원 유지 (스트릭이 깨지지 않으면)
 */

const STREAK_REWARDS = [
  { day: 1, reward: 10000, icon: "🎁", label: "1일차" },
  { day: 2, reward: 15000, icon: "🎁", label: "2일차" },
  { day: 3, reward: 20000, icon: "🎁", label: "3일차" },
  { day: 4, reward: 30000, icon: "🎁", label: "4일차" },
  { day: 5, reward: 40000, icon: "🎁", label: "5일차" },
  { day: 6, reward: 50000, icon: "🎁", label: "6일차" },
  { day: 7, reward: 60000, icon: "🎉", label: "7일차" },
  { day: 8, reward: 70000, icon: "🎉", label: "8일차" },
  { day: 9, reward: 85000, icon: "🎉", label: "9일차" },
  { day: 10, reward: 100000, icon: "🏆", label: "10일차!" },
];

// 10일 이후 보상
const STREAK_BONUS_AFTER_10 = 100000;

/**
 * 스트릭 정보를 로컬 스토리지에서 가져오거나 업데이트합니다.
 */
export function getStreakInfo(userId) {
  const key = `dailyStreak_${userId}`;
  const today = new Date().toDateString();

  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const data = JSON.parse(saved);
      const lastLogin = new Date(data.lastLogin).toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();

      if (lastLogin === today) {
        // 오늘 이미 접속했음
        return { ...data, isNewDay: false, canClaim: false };
      } else if (lastLogin === yesterday) {
        // 어제 접속해서 스트릭 유지
        return {
          streak: data.streak,
          lastLogin: data.lastLogin,
          totalClaimed: data.totalClaimed || 0,
          isNewDay: true,
          canClaim: true,
        };
      } else {
        // 스트릭 끊김 - 리셋
        return {
          streak: 0,
          lastLogin: null,
          totalClaimed: data.totalClaimed || 0,
          isNewDay: true,
          canClaim: true,
          streakBroken: true
        };
      }
    }
    // 첫 접속
    return { streak: 0, lastLogin: null, totalClaimed: 0, isNewDay: true, canClaim: true };
  } catch {
    return { streak: 0, lastLogin: null, totalClaimed: 0, isNewDay: true, canClaim: true };
  }
}

/**
 * 스트릭 보상 금액 계산
 */
function getRewardForDay(day) {
  if (day <= 10) {
    return STREAK_REWARDS[day - 1]?.reward || 10000;
  }
  // 10일 이후로는 계속 10만원
  return STREAK_BONUS_AFTER_10;
}

/**
 * 스트릭을 업데이트하고 보상을 반환합니다.
 */
export function claimDailyReward(userId) {
  const key = `dailyStreak_${userId}`;
  const today = new Date().toISOString();
  const streakInfo = getStreakInfo(userId);

  if (!streakInfo.canClaim) {
    return { success: false, message: "오늘 이미 보상을 받았습니다." };
  }

  const newStreak = streakInfo.streak + 1;
  const reward = getRewardForDay(newStreak);
  const icon = newStreak >= 10 ? "🏆" : newStreak >= 7 ? "🎉" : "🎁";

  const newData = {
    streak: newStreak,
    lastLogin: today,
    totalClaimed: (streakInfo.totalClaimed || 0) + reward,
  };

  localStorage.setItem(key, JSON.stringify(newData));

  return {
    success: true,
    reward: reward,
    newStreak,
    icon,
    message: `${newStreak}일차 출석 보상: ${reward.toLocaleString()}원!`,
    isMilestone: newStreak === 10 || newStreak % 30 === 0,
  };
}

/**
 * 일일 보상 배너 컴포넌트
 */
export function DailyRewardBanner({ userId, onClaim, autoPopup = true }) {
  const [streakInfo, setStreakInfo] = useState(null);
  const [claimed, setClaimed] = useState(false);
  const [rewardResult, setRewardResult] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (userId) {
      const info = getStreakInfo(userId);
      setStreakInfo(info);
      setIsVisible(info.canClaim);
      // PC에서 자동 팝업 표시
      if (autoPopup && info.canClaim) {
        setShowPopup(true);
      }
    }
  }, [userId, autoPopup]);

  const handleClaim = () => {
    const result = claimDailyReward(userId);
    setRewardResult(result);
    setClaimed(true);

    if (result.success && onClaim) {
      onClaim(result.reward);
    }

    // 5초 후 배너 숨기기
    setTimeout(() => {
      setIsVisible(false);
    }, 5000);
  };

  if (!isVisible || !streakInfo) return null;

  const nextDay = streakInfo.streak + 1;
  const nextReward = getRewardForDay(nextDay);
  const isBigReward = nextDay >= 10;

  // 팝업 모드 (PC 자동 팝업)
  if (showPopup && !claimed) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPopup(false)}>
        <div className="rounded-3xl p-8 max-w-md w-[90%] relative animate-slide-up" onClick={(e) => e.stopPropagation()}
          style={{
            background: isBigReward
              ? "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)"
              : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            border: "2px solid rgba(255,255,255,0.3)",
          }}
        >
          <button onClick={() => setShowPopup(false)} className="absolute top-3 right-3 text-white/60 hover:text-white text-2xl bg-transparent border-none cursor-pointer">✕</button>
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">{isBigReward ? "🏆" : "🎁"}</div>
            <div className="text-white text-2xl font-bold mb-2">{nextDay}일차 출석 보상</div>
            {streakInfo.streakBroken && (
              <div className="px-4 py-2 rounded-xl mb-3 text-sm" style={{ background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.9)" }}>
                😢 연속 출석이 끊어졌어요. 다시 1일차부터!
              </div>
            )}
            <div className="text-4xl font-extrabold text-white mt-3">+{nextReward.toLocaleString()}원</div>
          </div>
          <button
            onClick={() => { handleClaim(); setShowPopup(false); }}
            className="w-full py-4 rounded-2xl text-xl font-bold cursor-pointer border-none transition-all hover:scale-105"
            style={{ background: "rgba(255,255,255,0.95)", color: isBigReward ? "#ea580c" : "#6366f1", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}
          >
            받기! 🎉
          </button>
          <div className="flex justify-between gap-1 mt-5">
            {STREAK_REWARDS.map((day, idx) => (
              <div key={day.day} className="flex-1">
                <div className="w-full h-2 rounded" style={{ background: idx < streakInfo.streak ? "rgba(255,255,255,0.9)" : idx === streakInfo.streak ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5 mb-5"
      style={{
        background: claimed
          ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
          : isBigReward
            ? "linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)"
            : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
        boxShadow: claimed
          ? "0 4px 20px rgba(16, 185, 129, 0.4)"
          : isBigReward
            ? "0 4px 20px rgba(245, 158, 11, 0.4)"
            : "0 4px 20px rgba(139, 92, 246, 0.4)",
        animation: "slideDown 0.3s ease-out",
        border: "2px solid rgba(255,255,255,0.2)",
      }}
    >
      {!claimed ? (
        <>
          {/* 스트릭 끊김 알림 */}
          {streakInfo.streakBroken && (
            <div
              className="px-3 py-2 rounded-lg mb-3 text-sm"
              style={{
                background: "rgba(0,0,0,0.2)",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              😢 연속 출석이 끊어졌어요. 다시 1일차부터 시작!
            </div>
          )}

          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="text-3xl">
                  {isBigReward ? "🏆" : "🎁"}
                </span>
                <div>
                  <div className="text-white text-lg font-bold">
                    {nextDay}일차 출석 보상
                  </div>
                  {nextDay >= 10 && (
                    <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.8)" }}>
                      🔥 {nextDay}일 연속 출석 중!
                    </div>
                  )}
                </div>
              </div>
              <div className="text-2xl font-extrabold mt-1" style={{ color: "rgba(255,255,255,0.95)" }}>
                +{nextReward.toLocaleString()}원
              </div>
            </div>
            <button
              onClick={handleClaim}
              className="border-none py-3.5 px-7 rounded-xl text-base font-bold cursor-pointer transition-all"
              style={{
                background: "rgba(255,255,255,0.95)",
                color: isBigReward ? "#ea580c" : "#6366f1",
                boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
              }}
            >
              받기! 🎉
            </button>
          </div>

          {/* 스트릭 진행도 */}
          <div className="mt-4">
            <div className="flex justify-between gap-1">
              {STREAK_REWARDS.map((day, idx) => (
                <div key={day.day} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full h-2 rounded mb-1"
                    style={{
                      background:
                        idx < streakInfo.streak
                          ? "rgba(255,255,255,0.9)"
                          : idx === streakInfo.streak
                            ? "rgba(255,255,255,0.5)"
                            : "rgba(255,255,255,0.2)",
                    }}
                  />
                  {(idx === 0 || idx === 4 || idx === 9) && (
                    <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {idx + 1}일
                    </span>
                  )}
                </div>
              ))}
            </div>
            {nextDay > 10 && (
              <div className="text-center mt-2 text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>
                ✨ 10일 이상 연속 출석 시 매일 10만원!
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-2.5">
          <div className="text-5xl mb-3" style={{ animation: "bounce 0.5s ease" }}>
            {rewardResult?.icon || "🎉"}
          </div>
          <div className="text-white text-3xl font-extrabold mb-2">
            +{rewardResult?.reward?.toLocaleString()}원
          </div>
          <div className="text-base font-semibold" style={{ color: "rgba(255,255,255,0.9)" }}>
            🔥 {rewardResult?.newStreak}일 연속 출석!
          </div>
          {rewardResult?.isMilestone && (
            <div
              className="mt-2.5 px-4 py-2 rounded-2xl inline-block text-sm text-white"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              🏆 축하합니다! 마일스톤 달성!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 스트릭 표시 컴포넌트 (컴팩트)
 */
export function StreakDisplay({ userId }) {
  const [streakInfo, setStreakInfo] = useState({ streak: 0 });

  useEffect(() => {
    if (userId) {
      const info = getStreakInfo(userId);
      setStreakInfo(info);
    }
  }, [userId]);

  const currentStreak = streakInfo.streak || 0;

  if (currentStreak === 0) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm font-semibold"
      style={{
        background: currentStreak >= 10
          ? "linear-gradient(135deg, #f59e0b20 0%, #ea580c20 100%)"
          : "linear-gradient(135deg, #8b5cf620 0%, #6366f120 100%)",
        border: `1px solid ${currentStreak >= 10 ? "#f59e0b40" : "#8b5cf640"}`,
        color: currentStreak >= 10 ? "#f59e0b" : "#a78bfa",
      }}
    >
      <span>🔥</span>
      <span>{currentStreak}일 연속</span>
      {currentStreak >= 10 && <span>🏆</span>}
    </div>
  );
}

/**
 * 출석 보상 안내 컴포넌트
 */
export function StreakRewardInfo() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)",
        border: "2px solid #8b5cf640",
      }}
    >
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: "#e8e8ff" }}>
        🎁 일일 출석 보상 안내
      </h4>
      <div className="flex flex-col gap-1.5">
        {STREAK_REWARDS.map((day) => (
          <div
            key={day.day}
            className="flex justify-between items-center px-2.5 py-1.5 rounded-lg"
            style={{
              background: day.day === 10 ? "#f59e0b15" : "transparent",
              border: day.day === 10 ? "1px solid #f59e0b30" : "none",
            }}
          >
            <span
              className="text-sm"
              style={{ color: day.day === 10 ? "#f59e0b" : "#9ca3af" }}
            >
              {day.icon} {day.label}
            </span>
            <span
              style={{
                color: day.day === 10 ? "#f59e0b" : "#e8e8ff",
                fontWeight: day.day === 10 ? "700" : "500",
                fontSize: day.day === 10 ? "15px" : "13px",
              }}
            >
              {day.reward.toLocaleString()}원
            </span>
          </div>
        ))}
        <div
          className="mt-2 p-2.5 rounded-xl text-center"
          style={{
            background: "#f59e0b15",
            border: "1px solid #f59e0b30",
          }}
        >
          <span className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
            🏆 10일 이후: 매일 100,000원!
          </span>
        </div>
      </div>
    </div>
  );
}

export default DailyRewardBanner;
