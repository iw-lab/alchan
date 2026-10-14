import React from "react";
import { Loader2 } from "lucide-react";

// ============================================
// 페이지 컨테이너
// ============================================
export const PageContainer = ({ children, className = "" }) => (
  <div className={`min-h-full w-full bg-gray-100 ${className}`}>
    <div className="w-full max-w-none px-2 md:px-3 lg:px-4 py-1 md:py-2">
      {children}
    </div>
  </div>
);

// ============================================
// 페이지 헤더 - 새로운 디자인
// ============================================
export const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  action,
  backButton,
  className = "",
}) => (
  <section
    className={`bg-white backdrop-blur-sm rounded-lg px-3 py-1.5 md:px-4 md:py-2 shadow-lg border border-cyan-900/30 flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-2 mb-2 md:mb-3 ${className}`}
  >
    <div className="flex items-center gap-3">
      {backButton}
      {Icon && (
        <div className="w-9 h-9 md:w-10 md:h-10 bg-cyan-900/30 rounded-lg flex items-center justify-center text-cyan-400 shrink-0 shadow-sm border border-cyan-500/30">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">
            {title}
          </h2>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs md:text-sm text-slate-400 font-medium">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && (
      <div className="flex flex-wrap items-center gap-2 md:gap-3 md:ml-auto">
        {action}
      </div>
    )}
  </section>
);


// ============================================
// 로딩 상태 - 인라인 스피너 (2026-07-19 수정)
//   과거 null 스텁이라, Dashboard 등이 appLoading 토글마다 이 컴포넌트를 렌더할 때
//   중앙정렬 컨테이너 안에 아무것도 없어 '빈 회색 박스만 깜빡'였다. 스피너+메시지로 교체.
//   (앱 최초 로드는 index.html 스플래시가 담당하므로 중복 아님 — 이건 React 마운트 이후용.)
// ============================================
export const LoadingState = ({ message = "데이터를 불러오는 중..." }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-600">
    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    <p className="text-sm font-medium">{message}</p>
  </div>
);


// ============================================
// 빈 상태
// ============================================
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && (
      <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center mb-4 border border-cyan-900/30">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
    )}
    {title && (
      <h3 className="text-lg font-bold text-slate-600 mb-2">{title}</h3>
    )}
    {description && (
      <p className="text-slate-400 font-medium mb-6 max-w-md">{description}</p>
    )}
    {action}
  </div>
);


// ============================================
// 액션 버튼 - 새로운 디자인
// ============================================
export const ActionButton = ({
  children,
  icon: Icon,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  onClick,
  className = "",
  title,
}) => {
  const variants = {
    primary:
      "btn-gradient text-white",
    secondary: "btn-glass",
    outline:
      "bg-white/60 text-slate-700 ring-1 ring-slate-300 hover:bg-white hover:ring-indigo-400",
    "outline-green":
      "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300 hover:bg-emerald-100 hover:ring-emerald-500",
    "outline-red":
      "bg-rose-50 text-rose-700 ring-1 ring-rose-300 hover:bg-rose-100 hover:ring-rose-500",
    danger:
      "bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-500/30",
    success:
      "bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/30",
    ghost: "text-slate-600 hover:bg-white/60 hover:text-indigo-700",
    indigo: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 active:scale-95 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : Icon ? (
        <Icon className="w-4 h-4" />
      ) : null}
      {children}
    </button>
  );
};


