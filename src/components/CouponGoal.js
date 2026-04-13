// src/CouponGoal.js
import React from "react";

// 원형 프로그레스 컴포넌트 (축소 버전)
const CircularProgress = ({
  percentage,
  size = 100,
  strokeWidth = 8,
  color,
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0, 0, 0, 0.06)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        {children}
      </div>
    </div>
  );
};

// 마일스톤 마커
const milestones = [25, 50, 75];

export default function CouponGoal({
  classCouponGoal,
  goalProgress,
  myContribution,
  currentCoupons,
  couponValue,
  setShowDonateModal,
  setShowSellCouponModal,
  setShowDonationHistoryModal,
  setShowGiftCouponModal,
  goalAchieved,
  resetGoalButton,
  isResettingGoal,
}) {
  const validClassCouponGoal =
    typeof classCouponGoal === "number" && classCouponGoal > 0
      ? classCouponGoal
      : 1;

  const goalPercentage = Math.min(
    Math.round((goalProgress / validClassCouponGoal) * 100),
    100,
  );

  const myContributionPercentage =
    validClassCouponGoal > 0
      ? Math.min(Math.round((myContribution / validClassCouponGoal) * 100), 100)
      : 0;

  const mainColor = goalAchieved ? "#10b981" : "#6366f1";
  const remaining = Math.max(validClassCouponGoal - goalProgress, 0);

  return (
    <div
      className="class-coupon-goal glass-card-strong p-6 rounded-3xl relative overflow-hidden"
      style={{
        boxShadow: goalAchieved
          ? "0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 40px -10px rgba(16, 185, 129, 0.25)"
          : undefined,
        border: goalAchieved ? "2px solid #10b981" : undefined,
      }}
    >
      {/* 배경 장식 */}
      <div
        className="absolute -top-12 -right-12 w-36 h-36 rounded-full"
        style={{
          background: goalAchieved
            ? "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
        }}
      />

      {/* 헤더 */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl">🎯</span>
          <h3
            className="text-xl font-bold m-0"
            style={{ color: "#1e293b" }}
          >
            학급 쿠폰 목표
          </h3>
        </div>

        <div className="flex gap-2 items-center">
          {goalAchieved && (
            <span
              className="text-white px-3.5 py-1.5 rounded-2xl text-sm font-bold"
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                animation: "couponPulse 2s infinite",
              }}
            >
              🎉 목표 달성!
            </span>
          )}
          {resetGoalButton && (
            <button
              onClick={resetGoalButton}
              disabled={isResettingGoal}
              className="text-white border-none rounded-xl px-3 py-1.5 text-xs font-semibold"
              style={{
                backgroundColor: isResettingGoal ? "#9ca3af" : "#ef4444",
                cursor: isResettingGoal ? "not-allowed" : "pointer",
                opacity: isResettingGoal ? 0.7 : 1,
              }}
            >
              {isResettingGoal ? "초기화 중..." : "초기화"}
            </button>
          )}
        </div>
      </div>

      {/* === 메인 프로그레스 영역 === */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(238,242,255,0.55) 100%)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          border: "1px solid rgba(199,210,254,0.5)",
        }}
      >
        {/* 큰 숫자 표시 */}
        <div className="flex items-baseline justify-center gap-1 mb-1">
          <span
            className="font-extrabold"
            style={{ fontSize: 36, color: mainColor, lineHeight: 1 }}
          >
            {(goalProgress || 0).toLocaleString()}
          </span>
          <span style={{ fontSize: 20, color: "#94a3b8", fontWeight: 500 }}>
            /
          </span>
          <span style={{ fontSize: 20, color: "#64748b", fontWeight: 600 }}>
            {validClassCouponGoal.toLocaleString()}
          </span>
          <span style={{ fontSize: 14, color: "#94a3b8", marginLeft: 2 }}>
            쿠폰
          </span>
        </div>

        {/* 남은 수량 */}
        <div className="text-center mb-4">
          <span style={{ fontSize: 13, color: "#64748b" }}>
            {goalAchieved
              ? "목표를 달성했어요!"
              : `목표까지 ${remaining.toLocaleString()}쿠폰 남음`}
          </span>
        </div>

        {/* 수평 프로그레스 바 */}
        <div style={{ position: "relative", marginBottom: 6 }}>
          {/* 바 배경 */}
          <div
            style={{
              width: "100%",
              height: 28,
              borderRadius: 14,
              backgroundColor: "#e2e8f0",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* 전체 진행 바 */}
            <div
              style={{
                height: "100%",
                width: `${goalPercentage}%`,
                background: goalAchieved
                  ? "linear-gradient(90deg, #10b981 0%, #34d399 100%)"
                  : "linear-gradient(90deg, #4338ca 0%, #6366f1 60%, #818cf8 100%)",
                borderRadius: 14,
                transition: "width 0.8s ease",
                position: "relative",
                minWidth: goalPercentage > 0 ? 8 : 0,
              }}
            >
              {/* 내 기여분 표시 (바 안에 amber 영역) */}
              {myContributionPercentage > 0 && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    height: "100%",
                    width: `${Math.min((myContribution / Math.max(goalProgress, 1)) * 100, 100)}%`,
                    background: "rgba(251, 191, 36, 0.5)",
                    borderRadius: "0 14px 14px 0",
                    borderLeft: myContributionPercentage < goalPercentage ? "2px solid rgba(255,255,255,0.5)" : "none",
                  }}
                />
              )}
            </div>

            {/* 마일스톤 점선 */}
            {milestones.map((ms) => (
              <div
                key={ms}
                style={{
                  position: "absolute",
                  left: `${ms}%`,
                  top: 0,
                  height: "100%",
                  width: 2,
                  background:
                    goalPercentage >= ms
                      ? "rgba(255,255,255,0.4)"
                      : "rgba(148,163,184,0.3)",
                  zIndex: 1,
                }}
              />
            ))}

            {/* 퍼센트 텍스트 (바 위) */}
            {goalPercentage >= 15 && (
              <div
                style={{
                  position: "absolute",
                  left: `${Math.min(goalPercentage, 97)}%`,
                  top: "50%",
                  transform: "translate(-100%, -50%)",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  paddingRight: 8,
                  textShadow: "0 1px 2px rgba(0,0,0,0.2)",
                  zIndex: 2,
                }}
              >
                {goalPercentage}%
              </div>
            )}
          </div>

          {/* 바 오른쪽에 퍼센트 (작을 때) */}
          {goalPercentage < 15 && (
            <div
              style={{
                position: "absolute",
                right: -4,
                top: "50%",
                transform: "translateY(-50%)",
                color: mainColor,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
            </div>
          )}
        </div>

        {/* 마일스톤 라벨 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "#94a3b8" }}>0</span>
          {milestones.map((ms) => (
            <span
              key={ms}
              style={{
                fontSize: 11,
                color: goalPercentage >= ms ? mainColor : "#94a3b8",
                fontWeight: goalPercentage >= ms ? 600 : 400,
                position: "relative",
                left: `${ms === 25 ? -2 : ms === 50 ? -8 : -14}%`,
              }}
            >
              {ms}%
            </span>
          ))}
          <span
            style={{
              fontSize: 11,
              color: goalAchieved ? "#10b981" : "#94a3b8",
              fontWeight: goalAchieved ? 700 : 400,
            }}
          >
            100%
          </span>
        </div>
      </div>

      {/* === 통계 카드 3개 === */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {/* 달성률 */}
        <div className="flex flex-col items-center">
          <CircularProgress
            percentage={goalPercentage}
            size={90}
            strokeWidth={8}
            color={mainColor}
          >
            <div
              className="font-extrabold"
              style={{ fontSize: 20, color: mainColor }}
            >
              {goalPercentage}%
            </div>
          </CircularProgress>
          <div
            className="mt-1.5 font-semibold"
            style={{ fontSize: 12, color: "#64748b" }}
          >
            달성률
          </div>
        </div>

        {/* 내 기여 */}
        <div className="flex flex-col items-center">
          <CircularProgress
            percentage={myContributionPercentage}
            size={90}
            strokeWidth={8}
            color="#f59e0b"
          >
            <div
              className="font-extrabold"
              style={{ fontSize: 18, color: "#f59e0b" }}
            >
              {(myContribution || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8" }}>쿠폰</div>
          </CircularProgress>
          <div
            className="mt-1.5 font-semibold"
            style={{ fontSize: 12, color: "#64748b" }}
          >
            내 기여
          </div>
        </div>

        {/* 보유 쿠폰 */}
        <div className="flex flex-col items-center">
          <div
            className="flex flex-col items-center justify-center rounded-full"
            style={{
              width: 90,
              height: 90,
              background:
                "linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.12) 100%)",
              border: "2px solid rgba(251, 191, 36, 0.35)",
            }}
          >
            <div className="text-xl mb-0.5">🎫</div>
            <div
              className="font-extrabold"
              style={{ fontSize: 20, color: "#d97706" }}
            >
              {(currentCoupons || 0).toLocaleString()}
            </div>
          </div>
          <div
            className="mt-1.5 font-semibold"
            style={{ fontSize: 12, color: "#64748b" }}
          >
            보유 쿠폰
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            1쿠폰 ={" "}
            {typeof couponValue === "number"
              ? couponValue.toLocaleString()
              : "0"}
            원
          </div>
        </div>
      </div>

      {/* 액션 버튼들 */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => setShowDonateModal(true)}
          className="border-none rounded-xl py-3.5 px-2 cursor-pointer flex flex-col justify-center items-center gap-1.5 transition-all"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35)",
          }}
        >
          <span className="text-2xl">💰</span>
          <span className="text-white text-sm font-bold">쿠폰 응모</span>
        </button>

        <button
          onClick={() => setShowSellCouponModal(true)}
          className="border-none rounded-xl py-3.5 px-2 cursor-pointer flex flex-col justify-center items-center gap-1.5 transition-all"
          style={{
            background: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.35)",
          }}
        >
          <span className="text-2xl">💵</span>
          <span className="text-white text-sm font-bold">쿠폰 판매</span>
        </button>

        <button
          onClick={() => setShowGiftCouponModal(true)}
          className="border-none rounded-xl py-3.5 px-2 cursor-pointer flex flex-col justify-center items-center gap-1.5 transition-all"
          style={{
            background: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
          }}
        >
          <span className="text-2xl">🎁</span>
          <span className="text-white text-sm font-bold">쿠폰 선물</span>
        </button>

        <button
          onClick={() => setShowDonationHistoryModal(true)}
          className="rounded-xl py-3.5 px-2 cursor-pointer flex flex-col justify-center items-center gap-1.5 transition-all"
          style={{
            background: "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)",
            border: "1px solid #94a3b8",
          }}
        >
          <span className="text-2xl">📋</span>
          <span className="text-sm font-bold" style={{ color: "#475569" }}>
            응모 내역
          </span>
        </button>
      </div>

      {/* 애니메이션 스타일 */}
      <style>{`
        @keyframes couponPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .class-coupon-goal button:hover {
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
