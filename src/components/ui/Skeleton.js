// src/components/ui/Skeleton.js
// 스켈레톤 로딩 컴포넌트

import React from "react";

// 알찬 통일 로딩 화면 컴포넌트 - null 반환 (HTML 스플래시만 사용)
export function AlchanLoadingScreen({ message = "로딩 중..." }) {
  return null;
}

// 기본 스켈레톤
export function Skeleton({ className = "", width, height, rounded = "md" }) {
  const roundedClass =
    {
      none: "",
      sm: "rounded-sm",
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      "2xl": "rounded-2xl",
      full: "rounded-full",
    }[rounded] || "rounded-md";

  return (
    <div
      className={`animate-pulse bg-gray-700 ${roundedClass} ${className}`}
      style={{ width, height }}
    />
  );
}

// 텍스트 스켈레톤
export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="1rem"
          className={i === lines - 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}

// 아바타 스켈레톤
export function SkeletonAvatar({ size = 40, className = "" }) {
  return (
    <Skeleton width={size} height={size} rounded="full" className={className} />
  );
}

// 카드 스켈레톤
export function SkeletonCard({ className = "" }) {
  return (
    <div className={`bg-gray-800 rounded-2xl p-4 shadow-sm ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <SkeletonAvatar size={48} />
        <div className="flex-1 space-y-2">
          <Skeleton height="1rem" className="w-1/3" />
          <Skeleton height="0.75rem" className="w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
      <div className="flex gap-2 mt-4">
        <Skeleton height="2rem" className="w-20" rounded="lg" />
        <Skeleton height="2rem" className="w-20" rounded="lg" />
      </div>
    </div>
  );
}

// 테이블 행 스켈레톤
export function SkeletonTableRow({ columns = 4, className = "" }) {
  return (
    <div
      className={`flex items-center gap-4 py-3 border-b border-gray-700 ${className}`}
    >
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          height="1rem"
          className={`flex-1 ${i === 0 ? "max-w-[150px]" : ""}`}
        />
      ))}
    </div>
  );
}

// 리스트 아이템 스켈레톤
export function SkeletonListItem({ hasAvatar = true, className = "" }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${className}`}>
      {hasAvatar && <SkeletonAvatar size={40} />}
      <div className="flex-1 space-y-2">
        <Skeleton height="1rem" className="w-2/3" />
        <Skeleton height="0.75rem" className="w-1/3" />
      </div>
      <Skeleton height="1.5rem" className="w-16" rounded="lg" />
    </div>
  );
}

// 대시보드 스켈레톤
export function SkeletonDashboard() {
  return (
    <div className="space-y-6 p-4">
      {/* 상단 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-800 rounded-2xl p-4 shadow-sm">
            <Skeleton height="0.75rem" className="w-1/3 mb-2" />
            <Skeleton height="2rem" className="w-1/2" />
          </div>
        ))}
      </div>

      {/* 메인 콘텐츠 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* 리스트 */}
      <div className="bg-gray-800 rounded-2xl p-4 shadow-sm">
        <Skeleton height="1.25rem" className="w-1/4 mb-4" />
        {[1, 2, 3, 4].map((i) => (
          <SkeletonListItem key={i} />
        ))}
      </div>
    </div>
  );
}

// 페이지 로딩 스켈레톤
export function SkeletonPage() {
  return <AlchanLoadingScreen message="페이지 로딩 중..." />;
}

export default Skeleton;
