import { useBackClose } from "../../hooks/useBackClose";
import React, { forwardRef, useEffect } from "react";
import {
  X,
  ChevronDown,
  Loader2,
  AlertCircle,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";


// ============================================
// 버튼 컴포넌트
// ============================================
const buttonVariants = {
  primary:
    "bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm hover:shadow",
  secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200",
  outline: "border border-indigo-300 text-indigo-600 hover:bg-indigo-50 bg-white",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-500 hover:bg-red-600 text-white shadow-sm",
  success: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm",
  warning: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm",
};

const buttonSizes = {
  xs: "px-2.5 py-1.5 text-xs",
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base",
  xl: "px-6 py-3.5 text-lg",
};

export const Button = forwardRef(
  (
    {
      children,
      variant = "primary",
      size = "md",
      disabled = false,
      loading = false,
      icon: Icon,
      iconPosition = "left",
      fullWidth = false,
      className = "",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
        inline-flex items-center justify-center gap-2
        font-medium rounded-xl
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${buttonVariants[variant]}
        ${buttonSizes[size]}
        ${fullWidth ? "w-full" : ""}
        ${className}
      `}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {!loading && Icon && iconPosition === "left" && (
          <Icon className="w-4 h-4" />
        )}
        {children}
        {!loading && Icon && iconPosition === "right" && (
          <Icon className="w-4 h-4" />
        )}
      </button>
    );
  },
);

Button.displayName = "Button";

// ============================================
// 카드 컴포넌트
// ============================================
export const Card = forwardRef(
  (
    { children, className = "", hover = false, padding = "md", ...props },
    ref,
  ) => {
    const paddingClasses = {
      none: "",
      sm: "p-3",
      md: "p-4 sm:p-6",
      lg: "p-6 sm:p-8",
    };

    return (
      <div
        ref={ref}
        className={`
        rounded-2xl
        bg-white
        border border-slate-200
        shadow-sm
        ${hover ? "hover:shadow-md transition-all duration-200" : ""}
        ${paddingClasses[padding]}
        ${className}
      `}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export const CardHeader = ({ children, className = "", ...props }) => (
  <div
    className={`flex items-center justify-between mb-4 ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const CardTitle = ({ children, className = "", ...props }) => (
  <h3
    className={`text-lg font-bold text-slate-800 ${className}`}
    {...props}
  >
    {children}
  </h3>
);

export const CardContent = ({ children, className = "", ...props }) => (
  <div className={`text-slate-700 ${className}`} {...props}>
    {children}
  </div>
);

// ============================================
// 입력 컴포넌트
// ============================================
export const Input = forwardRef(
  (
    {
      label,
      error,
      helper,
      icon: Icon,
      className = "",
      containerClassName = "",
      ...props
    },
    ref,
  ) => {
    return (
      <div className={`space-y-1.5 ${containerClassName}`}>
        {label && (
          <label className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon size={18} />
            </div>
          )}
          <input
            ref={ref}
            className={`
            w-full px-4 py-2.5
            ${Icon ? "pl-10" : ""}
            bg-white text-slate-800
            rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-200
            transition-colors duration-200
            placeholder:text-slate-400
            ${className}
          `}
            style={{
              border: error ? "1px solid #ef4444" : "1px solid #e2e8f0",
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} />
            {error}
          </p>
        )}
        {helper && !error && (
          <p className="text-sm text-slate-500">{helper}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

// ============================================
// 셀렉트 컴포넌트
// ============================================
export const Select = forwardRef(
  (
    {
      label,
      error,
      options = [],
      placeholder = "선택하세요",
      className = "",
      containerClassName = "",
      ...props
    },
    ref,
  ) => {
    return (
      <div className={`space-y-1.5 ${containerClassName}`}>
        {label && (
          <label className="block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
            w-full px-4 py-2.5 pr-10
            bg-white text-slate-800
            rounded-xl
            focus:outline-none focus:ring-2 focus:ring-indigo-200
            transition-colors duration-200
            appearance-none cursor-pointer
            ${className}
          `}
            style={{
              border: error ? "1px solid #ef4444" : "1px solid #e2e8f0",
            }}
            {...props}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none text-slate-400" />
        </div>
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} />
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = "Select";

// ============================================
// 텍스트영역 컴포넌트
// ============================================
const Textarea = forwardRef(
  (
    { label, error, helper, className = "", containerClassName = "", ...props },
    ref,
  ) => {
    return (
      <div className={`space-y-1.5 ${containerClassName}`}>
        {label && (
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
          w-full px-4 py-3
          bg-white
          border rounded-xl
          ${
            error
              ? "border-red-500 focus:ring-red-200"
              : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-200"
          }
          text-slate-800
          placeholder:text-slate-400
          focus:outline-none focus:ring-2 focus:ring-offset-0
          transition-colors duration-200
          resize-none
          ${className}
        `}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <AlertCircle size={14} />
            {error}
          </p>
        )}
        {helper && !error && <p className="text-sm text-slate-400">{helper}</p>}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

// ============================================
// 모달 컴포넌트
// ============================================
export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
  footer,
  className = "",
}) => {
  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    full: "max-w-full mx-4",
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // 뒤로가기 = 모달 닫기(사용처 3곳 — StudentManager 추가/일괄추가/수정 모달)
  useBackClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
        relative w-full ${sizeClasses[size]}
        bg-white border border-slate-200
        rounded-2xl shadow-xl
        max-h-[90vh] overflow-hidden
        animate-fade-in
        ${className}
      `}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
            {title && (
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl transition-colors text-slate-500 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh] text-slate-700">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-slate-200 bg-slate-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// 알림 컴포넌트
// ============================================
const alertVariants = {
  info: {
    container: "bg-blue-50 border-blue-200",
    icon: <Info className="w-5 h-5 text-blue-500" />,
    title: "text-blue-700",
  },
  success: {
    container: "bg-emerald-50 border-emerald-200",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    title: "text-emerald-700",
  },
  warning: {
    container: "bg-amber-50 border-amber-200",
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    title: "text-amber-700",
  },
  danger: {
    container: "bg-red-50 border-red-200",
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    title: "text-red-700",
  },
};

export const Alert = ({
  variant = "info",
  title,
  children,
  className = "",
  onClose,
}) => {
  const styles = alertVariants[variant];

  return (
    <div
      className={`
      flex gap-3 p-4 rounded-xl border
      ${styles.container}
      ${className}
    `}
    >
      {styles.icon}
      <div className="flex-1">
        {title && (
          <h4 className={`font-semibold mb-1 ${styles.title}`}>{title}</h4>
        )}
        <div className="text-sm text-slate-700">{children}</div>
      </div>
      {onClose && (
        <button onClick={onClose} className="self-start">
          <X size={18} className="text-slate-400 hover:text-slate-600" />
        </button>
      )}
    </div>
  );
};

// ============================================
// 뱃지 컴포넌트
// ============================================
const badgeVariants = {
  primary: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  secondary: "bg-slate-100 text-slate-700 border border-slate-200",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
};

export const Badge = ({
  children,
  variant = "primary",
  size = "md",
  className = "",
}) => {
  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-xs",
    lg: "px-3 py-1.5 text-sm",
  };

  return (
    <span
      className={`
      inline-flex items-center font-medium rounded-full
      ${badgeVariants[variant]}
      ${sizeClasses[size]}
      ${className}
    `}
    >
      {children}
    </span>
  );
};

// ============================================
// 스피너 컴포넌트
// ============================================
export const Spinner = ({ size = "md", className = "" }) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  return (
    <Loader2
      className={`animate-spin text-indigo-500 ${sizeClasses[size]} ${className}`}
    />
  );
};


// ============================================
// 빈 상태 컴포넌트
// ============================================
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}) => (
  <div
    className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}
  >
    {Icon && (
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: "rgba(99, 102, 241, 0.1)" }}
      >
        <Icon className="w-8 h-8" style={{ color: "var(--accent)" }} />
      </div>
    )}
    {title && (
      <h3 className="text-lg font-semibold mb-2 text-slate-800">{title}</h3>
    )}
    {description && (
      <p className="mb-6 max-w-sm text-slate-500">{description}</p>
    )}
    {action}
  </div>
);


// ============================================
// 페이지 헤더 컴포넌트
// ============================================
export const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  action,
  className = "",
}) => (
  <div
    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1 ${className}`}
  >
    <div className="flex items-center gap-2">
      {Icon && (
        <Icon className="w-5 h-5 text-indigo-500 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <h1 className="text-lg font-bold text-slate-800 truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs mt-0.5 text-slate-500 truncate">{subtitle}</p>
        )}
      </div>
    </div>
    {action}
  </div>
);

// ============================================
// 테이블 컴포넌트
// ============================================
export const Table = ({ children, className = "" }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className={`w-full ${className}`}>
      {children}
    </table>
  </div>
);

export const TableHeader = ({ children, className = "" }) => (
  <thead className={`bg-slate-50 ${className}`}>{children}</thead>
);

export const TableBody = ({ children, className = "" }) => (
  <tbody className={`border-t border-slate-200 ${className}`}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = "", onClick }) => (
  <tr
    className={`
      border-b border-slate-100 last:border-b-0
      ${onClick ? "cursor-pointer hover:bg-slate-50" : ""}
      ${className}
    `}
    onClick={onClick}
  >
    {children}
  </tr>
);

export const TableHead = ({ children, className = "" }) => (
  <th
    className={`
    px-4 py-3
    text-left text-xs font-semibold uppercase tracking-wider
    text-slate-500
    ${className}
  `}
  >
    {children}
  </th>
);

export const TableCell = ({ children, className = "" }) => (
  <td className={`px-4 py-3 text-sm text-slate-700 ${className}`}>
    {children}
  </td>
);

