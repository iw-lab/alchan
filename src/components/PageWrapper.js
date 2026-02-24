// src/components/PageWrapper.js
// 페이지 공통 래퍼 - 새로운 슬레이트 기반 디자인 시스템

import React from "react";
import { Loader2, CheckSquare } from "lucide-react";
import { AlchanLoadingScreen } from "./ui/Skeleton";

// ============================================
// 페이지 컨테이너
// ============================================
export const PageContainer = ({ children, className = "" }) => (
  <div className={`min-h-full w-full bg-[#0a0a12] ${className}`}>
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
    className={`bg-[#14142380] backdrop-blur-sm rounded-lg px-3 py-1.5 md:px-4 md:py-2 shadow-lg border border-cyan-900/30 flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-2 mb-2 md:mb-3 ${className}`}
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
          <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
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
// 섹션 제목
// ============================================
export const SectionTitle = ({
  children,
  icon: Icon,
  action,
  className = "",
}) => (
  <div className={`flex items-center justify-between px-1 mb-4 ${className}`}>
    <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
      {Icon && <Icon className="w-5 h-5 text-cyan-400" />}
      {children}
    </h3>
    {action}
  </div>
);

// ============================================
// 로딩 상태 - null (HTML 스플래시만 사용)
// ============================================
export const LoadingState = ({ message = "데이터를 불러오는 중..." }) => null;

// ============================================
// 에러 상태
// ============================================
export const ErrorState = ({
  title = "오류가 발생했습니다",
  message,
  onRetry,
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mb-4">
      <span className="text-3xl text-red-400">!</span>
    </div>
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    {message && <p className="text-slate-400 mb-4 max-w-md">{message}</p>}
    {onRetry && (
      <button
        onClick={onRetry}
        className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl font-bold text-sm transition-all shadow-lg shadow-cyan-500/30"
      >
        다시 시도
      </button>
    )}
  </div>
);

// ============================================
// 빈 상태
// ============================================
export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && (
      <div className="w-16 h-16 rounded-full bg-[#14142380] shadow-lg flex items-center justify-center mb-4 border border-cyan-900/30">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>
    )}
    {title && (
      <h3 className="text-lg font-bold text-slate-300 mb-2">{title}</h3>
    )}
    {description && (
      <p className="text-slate-400 font-medium mb-6 max-w-md">{description}</p>
    )}
    {action}
  </div>
);

// ============================================
// 카드 그리드
// ============================================
export const CardGrid = ({ children, cols = 3, className = "" }) => {
  const colsClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4",
  };

  return (
    <div
      className={`grid ${colsClass[cols] || colsClass[3]} gap-6 ${className}`}
    >
      {children}
    </div>
  );
};

// ============================================
// 통계 카드 - 새로운 디자인
// ============================================
export const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  iconBg = "bg-cyan-900/30",
  iconColor = "text-cyan-400",
  onClick,
}) => (
  <div
    className={`bg-[#14142380] backdrop-blur-sm rounded-2xl p-6 border border-cyan-900/30 shadow-lg hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 ${
      onClick ? "cursor-pointer" : ""
    }`}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${iconBg}`}
      >
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      {trend && (
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
            trend.type === "up"
              ? "bg-emerald-900/30 text-emerald-400"
              : "bg-red-900/30 text-red-400"
          }`}
        >
          {trend.type === "up" ? "+" : "-"}
          {trend.value}%
        </span>
      )}
    </div>
    <div className="mt-4">
      <p className="text-sm text-slate-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-white mt-1 tracking-tight">
        {value}
      </p>
      {subValue && <p className="text-sm text-slate-500 mt-1">{subValue}</p>}
    </div>
  </div>
);

// ============================================
// 자산 카드 - 헤더용
// ============================================
export const AssetCard = ({ icon: Icon, label, value, color, iconColor }) => (
  <div
    className={`hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-xl ${color} bg-opacity-50 border border-transparent`}
  >
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${iconColor}`}
    >
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-[10px] font-bold opacity-70 mb-0 leading-tight">
        {label}
      </p>
      <p className="text-lg font-black tracking-tight leading-tight">{value}</p>
    </div>
  </div>
);

// ============================================
// 탭 컴포넌트
// ============================================
export const TabGroup = ({ tabs, activeTab, onChange, className = "" }) => (
  <div
    className={`flex gap-1 p-1 bg-[#0a0a12] rounded-xl border border-cyan-900/30 ${className}`}
  >
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${
          activeTab === tab.id
            ? "bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/30"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        }`}
      >
        {tab.icon && <tab.icon className="w-4 h-4 mr-2 inline-block" />}
        {tab.label}
        {tab.count !== undefined && (
          <span
            className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
              activeTab === tab.id
                ? "bg-slate-900 text-cyan-400"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {tab.count}
          </span>
        )}
      </button>
    ))}
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
      "bg-cyan-500 text-slate-900 hover:bg-cyan-400 ring-1 ring-cyan-400 shadow-cyan-500/30",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-200",
    outline:
      "bg-transparent text-slate-300 ring-1 ring-slate-600 hover:bg-slate-800 hover:ring-slate-500 shadow-sm",
    "outline-green":
      "bg-transparent text-emerald-400 ring-1 ring-emerald-600 hover:bg-emerald-900/30 hover:ring-emerald-500 shadow-sm",
    "outline-red":
      "bg-transparent text-rose-400 ring-1 ring-rose-600 hover:bg-rose-900/30 hover:ring-rose-500 shadow-sm",
    danger:
      "bg-transparent text-rose-400 ring-1 ring-rose-600 hover:bg-rose-900/30 hover:ring-rose-500 shadow-sm",
    success:
      "bg-transparent text-emerald-400 ring-1 ring-emerald-600 hover:bg-emerald-900/30 hover:ring-emerald-500 shadow-sm",
    ghost: "text-slate-400 hover:bg-slate-800 hover:text-white",
    indigo: "bg-purple-900/30 text-purple-300 hover:bg-purple-900/50",
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

// ============================================
// 정보 배지
// ============================================
export const InfoBadge = ({
  children,
  variant = "default",
  className = "",
}) => {
  const variants = {
    default: "bg-slate-800 text-slate-300",
    primary: "bg-indigo-900/50 text-indigo-300",
    success: "bg-emerald-900/50 text-emerald-300",
    warning: "bg-amber-900/50 text-amber-300",
    danger: "bg-red-900/50 text-red-300",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

// ============================================
// 알림 배너
// ============================================
export const AlertBanner = ({
  children,
  variant = "info",
  icon: Icon,
  onClose,
  className = "",
}) => {
  const variants = {
    info: "bg-blue-900/30 border-blue-500/30 text-blue-300",
    success: "bg-emerald-900/30 border-emerald-500/30 text-emerald-300",
    warning: "bg-amber-900/30 border-amber-500/30 text-amber-300",
    danger: "bg-red-900/30 border-red-500/30 text-red-300",
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${variants[variant]} ${className}`}
    >
      {Icon && <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 text-sm font-medium">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-current opacity-50 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
};

// ============================================
// 리스트 아이템 / 할일 아이템
// ============================================
export const ListItem = ({
  children,
  icon: Icon,
  onClick,
  active,
  className = "",
}) => (
  <div
    className={`flex items-center gap-3 p-4 rounded-xl transition-all ${
      onClick ? "cursor-pointer" : ""
    } ${
      active
        ? "bg-cyan-900/30 border border-cyan-500/50"
        : "bg-[#14142380] border border-cyan-900/20 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/10"
    } ${className}`}
    onClick={onClick}
  >
    {Icon && (
      <div
        className={`p-2 rounded-lg ${active ? "bg-cyan-500" : "bg-slate-800"}`}
      >
        <Icon
          className={`w-5 h-5 ${active ? "text-slate-900" : "text-slate-400"}`}
        />
      </div>
    )}
    <div className="flex-1 min-w-0">{children}</div>
  </div>
);

// ============================================
// 할일 아이템 - 새로운 디자인
// ============================================
export const TaskItem = ({
  task,
  onComplete,
  onEdit,
  onDelete,
  showActions = true,
}) => (
  <div className="group flex items-center justify-between p-3 rounded-xl bg-[#0a0a12] border border-cyan-900/30 hover:border-cyan-500/50 hover:bg-slate-900/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all">
    <div className="flex items-center gap-3 min-w-0">
      <div
        onClick={onComplete}
        className="w-5 h-5 rounded md:rounded-md border-2 border-slate-600 group-hover:border-cyan-500 cursor-pointer transition-colors flex items-center justify-center shrink-0"
      >
        {/* 체크박스 영역 */}
      </div>
      <span className="font-bold text-slate-300 text-base truncate group-hover:text-cyan-400 transition-colors">
        {task.name}
      </span>
    </div>

    <div className="flex items-center gap-2 shrink-0">
      {task.rewardType === "random" && (
        <span className="px-2.5 py-1 rounded-lg bg-amber-900/30 text-amber-400 text-xs font-bold flex items-center gap-1">
          🎁 랜덤
        </span>
      )}
      {showActions && (
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 text-slate-500 hover:text-cyan-400 rounded hover:bg-cyan-900/30"
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 text-slate-500 hover:text-red-400 rounded hover:bg-red-900/30"
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

// ============================================
// 직업 카드 - 새로운 디자인
// ============================================
export const JobCard = ({ job, children, onEdit, onDelete, onAddTask }) => {
  const gradients = {
    indigo: "from-indigo-500 to-purple-600",
    blue: "from-blue-500 to-cyan-500",
    emerald: "from-emerald-500 to-teal-600",
    orange: "from-orange-400 to-red-500",
    pink: "from-pink-500 to-rose-500",
    violet: "from-violet-500 to-purple-600",
  };

  const gradient = job.color || gradients.indigo;

  return (
    <div className="bg-[#14142380] backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 border border-cyan-900/30 overflow-hidden flex flex-col">
      {/* 카드 헤더 */}
      <div
        className={`h-16 px-6 flex items-center justify-between bg-gradient-to-r ${gradient}`}
      >
        <h4 className="text-white font-bold text-lg tracking-wide flex items-center gap-2">
          👑 {job.title}
        </h4>
        {(onEdit || onDelete) && (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                ✏️
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>

      {/* 할일 목록 */}
      <div className="p-6 space-y-4 flex-1">{children}</div>

      {/* 하단 버튼 */}
      {onAddTask && (
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={onAddTask}
            className="w-full py-3 rounded-xl bg-slate-900/50 text-slate-400 text-sm font-bold border border-cyan-900/30 hover:bg-cyan-900/30 hover:text-cyan-400 hover:border-cyan-500/50 transition-colors flex items-center justify-center gap-2"
          >
            ➕ 이 직업에 할일 추가
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// 콘텐츠 섹션 카드
// ============================================
export const ContentSection = ({ children, className = "" }) => (
  <div
    className={`bg-[#14142380] backdrop-blur-sm rounded-2xl shadow-lg border border-cyan-900/30 p-6 ${className}`}
  >
    {children}
  </div>
);

// ============================================
// 금액 표시
// ============================================
export const MoneyDisplay = ({
  amount,
  size = "md",
  showSign = false,
  className = "",
}) => {
  const formatted = Math.abs(amount || 0).toLocaleString("ko-KR");
  const isNegative = amount < 0;
  const isPositive = amount > 0;

  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
    xl: "text-2xl",
  };

  return (
    <span
      className={`font-bold tabular-nums ${sizes[size]} ${
        isNegative
          ? "text-red-400"
          : isPositive && showSign
            ? "text-emerald-400"
            : "text-white"
      } ${className}`}
    >
      {showSign && isPositive && "+"}
      {isNegative && "-"}
      {formatted}원
    </span>
  );
};

// ============================================
// 빈 추가 카드
// ============================================
export const AddCard = ({ onClick, label = "새로 추가하기" }) => (
  <button
    onClick={onClick}
    className="group relative flex flex-col items-center justify-center h-full min-h-[260px] rounded-2xl border-2 border-dashed border-cyan-900/50 bg-slate-900/30 hover:bg-cyan-900/20 hover:border-cyan-500/50 transition-all"
  >
    <div className="w-16 h-16 rounded-full bg-slate-800 shadow-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
      <span className="text-3xl text-slate-500 group-hover:text-cyan-400">
        ➕
      </span>
    </div>
    <span className="text-slate-500 font-bold group-hover:text-cyan-400 text-sm">
      {label}
    </span>
  </button>
);

export default {
  PageContainer,
  PageHeader,
  SectionTitle,
  LoadingState,
  ErrorState,
  EmptyState,
  CardGrid,
  StatCard,
  AssetCard,
  TabGroup,
  ActionButton,
  InfoBadge,
  AlertBanner,
  ListItem,
  TaskItem,
  JobCard,
  ContentSection,
  MoneyDisplay,
  AddCard,
};
