// src/CouponGoal.js
import React from "react";

// 원형 프로그레스 컴포넌트
const CircularProgress = ({
  percentage,
  size = 140,
  strokeWidth = 12,
  color,
  children,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* 배경 원 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        {/* 프로그레스 원 */}
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
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {/* 중앙 콘텐츠 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        {children}
      </div>
    </div>
  );
};

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

  return (
    <div
      className="class-coupon-goal p-6 rounded-2xl relative overflow-hidden"
      style={{
        backgroundColor: "rgba(20, 20, 35, 0.6)",
        boxShadow: goalAchieved
          ? "0 4px 20px rgba(16, 185, 129, 0.25)"
          : "0 4px 20px rgba(0, 255, 242, 0.15)",
        border: goalAchieved
          ? "2px solid #10b981"
          : "1px solid rgba(0, 255, 242, 0.2)",
        backdropFilter: "blur(10px)",
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
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl">🎯</span>
          <h3
            className="text-xl font-bold m-0"
            style={{
              color: "#e8e8ff",
              textShadow: "0 0 5px rgba(0, 255, 242, 0.5)",
            }}
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
                animation: "pulse 2s infinite",
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

      {/* 메인 프로그레스 영역 */}
      <div className="flex items-center justify-center gap-7 py-5 flex-wrap">
        {/* 학급 목표 원형 프로그레스 */}
        <div className="text-center">
          <CircularProgress
            percentage={goalPercentage}
            size={150}
            strokeWidth={14}
            color={mainColor}
          >
            <div
              className="text-3xl font-extrabold"
              style={{ color: mainColor }}
            >
              {goalPercentage}%
            </div>
            <div className="text-xs font-medium" style={{ color: "#a0a0c0" }}>
              달성률
            </div>
          </CircularProgress>
          <div className="mt-3">
            <div
              className="text-2xl font-extrabold"
              style={{ color: "#e8e8ff" }}
            >
              {(goalProgress || 0).toLocaleString()}
              <span
                className="text-sm font-medium"
                style={{ color: "#a0a0c0" }}
              >
                {" "}
                / {validClassCouponGoal.toLocaleString()}
              </span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              학급 전체 응모량
            </div>
          </div>
        </div>

        {/* 내 기여도 원형 프로그레스 */}
        <div className="text-center">
          <CircularProgress
            percentage={myContributionPercentage}
            size={120}
            strokeWidth={10}
            color="#f59e0b"
          >
            <div
              className="text-2xl font-extrabold"
              style={{ color: "#f59e0b" }}
            >
              {myContributionPercentage}%
            </div>
            <div className="text-xs font-medium" style={{ color: "#a0a0c0" }}>
              내 기여
            </div>
          </CircularProgress>
          <div className="mt-3">
            <div className="text-lg font-bold" style={{ color: "#e8e8ff" }}>
              {(myContribution || 0).toLocaleString()}
              <span
                className="text-xs font-medium"
                style={{ color: "#a0a0c0" }}
              >
                {" "}
                쿠폰
              </span>
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              내가 응모한 쿠폰
            </div>
          </div>
        </div>

        {/* 내 보유량 카드 */}
        <div
          className="rounded-2xl p-5 text-center min-w-[130px]"
          style={{
            background:
              "linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)",
            boxShadow: "0 4px 12px rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(251, 191, 36, 0.3)",
          }}
        >
          <div className="text-3xl mb-2">🎫</div>
          <div
            className="text-3xl font-extrabold"
            style={{
              color: "#fbbf24",
              textShadow: "0 0 10px rgba(251, 191, 36, 0.3)",
            }}
          >
            {(currentCoupons || 0).toLocaleString()}
          </div>
          <div
            className="text-xs font-semibold mt-1"
            style={{ color: "#fcd34d" }}
          >
            보유 쿠폰
          </div>
          <div
            className="text-xs mt-2 px-2 py-1 rounded-lg"
            style={{ color: "#fcd34d", background: "rgba(0,0,0,0.3)" }}
          >
            1쿠폰 ={" "}
            {typeof couponValue === "number"
              ? couponValue.toLocaleString()
              : "0"}
            원
          </div>
        </div>
      </div>

      {/* 액션 버튼들 */}
      <div className="grid grid-cols-4 gap-2 mt-5">
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
            background: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
            border: "1px solid #4b5563",
          }}
        >
          <span className="text-2xl">📋</span>
          <span className="text-sm font-bold" style={{ color: "#4b5563" }}>
            응모 내역
          </span>
        </button>
      </div>

      {/* 쿠폰 목표 글씨 크기 전체 확대 */}
      <style>{`
        .class-coupon-goal { font-size: 1.05rem; }
        .class-coupon-goal h3 { font-size: 1.3rem !important; }
        .class-coupon-goal .text-xs { font-size: 0.85rem !important; }
        .class-coupon-goal .text-sm { font-size: 0.95rem !important; }
        .class-coupon-goal .text-2xl { font-size: 1.6rem !important; }
        .class-coupon-goal .text-3xl { font-size: 2rem !important; }
      `}</style>

      {/* 애니메이션 스타일 */}
      <style>{`
        @keyframes pulse {
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
