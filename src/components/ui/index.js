// src/components/ui/index.js
// 알찬 디자인 시스템 - 통합 UI 컴포넌트 라이브러리

import React, { forwardRef, useState, useEffect, createContext, useContext } from 'react';
import { X, ChevronDown, ChevronRight, Loader2, Check, AlertCircle, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ============================================
// 디자인 토큰
// ============================================
export const tokens = {
  colors: {
    primary: {
      50: '#eef2ff',
      100: '#e0e7ff',
      200: '#c7d2fe',
      300: '#a5b4fc',
      400: '#818cf8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
    },
    success: {
      50: '#f0fdf4',
      500: '#22c55e',
      600: '#16a34a',
    },
    warning: {
      50: '#fffbeb',
      500: '#f59e0b',
      600: '#d97706',
    },
    danger: {
      50: '#fef2f2',
      500: '#ef4444',
      600: '#dc2626',
    },
    info: {
      50: '#eff6ff',
      500: '#3b82f6',
      600: '#2563eb',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.5rem',
    full: '9999px',
  },
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },
};

// ============================================
// 버튼 컴포넌트
// ============================================
const buttonVariants = {
  primary: 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-md hover:shadow-lg',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200',
  outline: 'border-2 border-indigo-500 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20',
  ghost: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
  danger: 'bg-red-500 hover:bg-red-600 text-white shadow-md',
  success: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white shadow-md',
};

const buttonSizes = {
  xs: 'px-2.5 py-1.5 text-xs',
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
  xl: 'px-6 py-3.5 text-lg',
};

export const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  ...props
}, ref) => {
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
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {!loading && Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </button>
  );
});

Button.displayName = 'Button';

// ============================================
// 카드 컴포넌트
// ============================================
export const Card = forwardRef(({
  children,
  className = '',
  hover = false,
  padding = 'md',
  ...props
}, ref) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  return (
    <div
      ref={ref}
      className={`
        rounded-2xl
        shadow-sm
        ${hover ? 'hover:shadow-md transition-all duration-200' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
      style={{
        background: 'rgba(20, 20, 35, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`flex items-center justify-between mb-4 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '', ...props }) => (
  <h3 className={`text-lg font-bold ${className}`} style={{ color: '#00fff2' }} {...props}>
    {children}
  </h3>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={className} style={{ color: '#e2e8f0' }} {...props}>
    {children}
  </div>
);

// ============================================
// 입력 컴포넌트
// ============================================
export const Input = forwardRef(({
  label,
  error,
  helper,
  icon: Icon,
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label className="block text-sm font-medium" style={{ color: '#00fff2' }}>
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}>
            <Icon size={18} />
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full px-4 py-2.5
            ${Icon ? 'pl-10' : ''}
            rounded-xl
            focus:outline-none focus:ring-2 focus:ring-offset-0
            transition-colors duration-200
            ${className}
          `}
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: error ? '2px solid #ef4444' : '2px solid rgba(255, 255, 255, 0.1)',
            color: '#e2e8f0',
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
        <p className="text-sm" style={{ color: '#94a3b8' }}>{helper}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

// ============================================
// 셀렉트 컴포넌트
// ============================================
export const Select = forwardRef(({
  label,
  error,
  options = [],
  placeholder = '선택하세요',
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label className="block text-sm font-medium" style={{ color: '#00fff2' }}>
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          className={`
            w-full px-4 py-2.5 pr-10
            rounded-xl
            focus:outline-none focus:ring-2 focus:ring-offset-0
            transition-colors duration-200
            appearance-none cursor-pointer
            ${className}
          `}
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            border: error ? '2px solid #ef4444' : '2px solid rgba(255, 255, 255, 0.1)',
            color: '#e2e8f0',
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
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" style={{ color: '#94a3b8' }} />
      </div>
      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertCircle size={14} />
          {error}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

// ============================================
// 텍스트영역 컴포넌트
// ============================================
export const Textarea = forwardRef(({
  label,
  error,
  helper,
  className = '',
  containerClassName = '',
  ...props
}, ref) => {
  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={`
          w-full px-4 py-3
          bg-white dark:bg-gray-800
          border rounded-xl
          ${error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-gray-200 dark:border-gray-600 focus:border-indigo-500 focus:ring-indigo-500'
          }
          text-gray-900 dark:text-white
          placeholder-gray-400 dark:placeholder-gray-500
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
      {helper && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{helper}</p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

// ============================================
// 모달 컴포넌트
// ============================================
export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  footer,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full mx-4',
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`
        relative w-full ${sizeClasses[size]}
        rounded-2xl shadow-xl
        max-h-[90vh] overflow-hidden
        animate-fade-in
        ${className}
      `}
      style={{
        background: 'rgba(20, 20, 35, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-4 sm:p-6" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
            {title && (
              <h2 className="text-lg font-bold" style={{ color: '#00fff2' }}>
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl transition-colors"
                style={{ color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[60vh]" style={{ color: '#e2e8f0' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 sm:p-6" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
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
    container: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    icon: <Info className="w-5 h-5 text-blue-500" />,
    title: 'text-blue-800 dark:text-blue-300',
  },
  success: {
    container: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    title: 'text-emerald-800 dark:text-emerald-300',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    title: 'text-amber-800 dark:text-amber-300',
  },
  danger: {
    container: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    title: 'text-red-800 dark:text-red-300',
  },
};

export const Alert = ({
  variant = 'info',
  title,
  children,
  className = '',
  onClose,
}) => {
  const styles = alertVariants[variant];

  return (
    <div className={`
      flex gap-3 p-4 rounded-xl border
      ${styles.container}
      ${className}
    `}>
      {styles.icon}
      <div className="flex-1">
        {title && (
          <h4 className={`font-semibold mb-1 ${styles.title}`}>
            {title}
          </h4>
        )}
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {children}
        </div>
      </div>
      {onClose && (
        <button onClick={onClose} className="self-start">
          <X size={18} className="text-gray-400 hover:text-gray-600" />
        </button>
      )}
    </div>
  );
};

// ============================================
// 뱃지 컴포넌트
// ============================================
const badgeVariants = {
  primary: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  secondary: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
};

export const Badge = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  return (
    <span className={`
      inline-flex items-center font-medium rounded-full
      ${badgeVariants[variant]}
      ${sizeClasses[size]}
      ${className}
    `}>
      {children}
    </span>
  );
};

// ============================================
// 스피너 컴포넌트
// ============================================
export const Spinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <Loader2 className={`animate-spin text-indigo-500 ${sizeClasses[size]} ${className}`} />
  );
};

// ============================================
// 로딩 오버레이
// ============================================
export const LoadingOverlay = ({ message = '로딩 중...' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-4">
      <Spinner size="xl" />
      <p className="text-gray-600 dark:text-gray-300 font-medium">{message}</p>
    </div>
  </div>
);

// ============================================
// 빈 상태 컴포넌트
// ============================================
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
    {Icon && (
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(0, 255, 242, 0.1)' }}>
        <Icon className="w-8 h-8" style={{ color: '#00fff2' }} />
      </div>
    )}
    {title && (
      <h3 className="text-lg font-semibold mb-2" style={{ color: '#ffffff' }}>
        {title}
      </h3>
    )}
    {description && (
      <p className="mb-6 max-w-sm" style={{ color: '#94a3b8' }}>
        {description}
      </p>
    )}
    {action}
  </div>
);

// ============================================
// 탭 컴포넌트
// ============================================
const TabsContext = createContext(null);

export const Tabs = ({ children, defaultValue, value, onValueChange, className = '' }) => {
  const [activeTab, setActiveTab] = useState(value || defaultValue);

  useEffect(() => {
    if (value !== undefined) {
      setActiveTab(value);
    }
  }, [value]);

  const handleChange = (newValue) => {
    setActiveTab(newValue);
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleChange }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

export const TabsList = ({ children, className = '' }) => (
  <div className={`
    flex gap-1 p-1
    rounded-xl
    ${className}
  `}
  style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
    {children}
  </div>
);

export const TabsTrigger = ({ children, value, className = '' }) => {
  const context = useContext(TabsContext);
  const isActive = context?.activeTab === value;

  return (
    <button
      onClick={() => context?.setActiveTab(value)}
      className={`
        flex-1 px-4 py-2.5
        text-sm font-medium
        rounded-lg
        transition-all duration-200
        ${className}
      `}
      style={{
        background: isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
        color: isActive ? '#ffffff' : '#94a3b8',
        boxShadow: isActive ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none',
      }}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ children, value, className = '' }) => {
  const context = useContext(TabsContext);

  if (context?.activeTab !== value) return null;

  return (
    <div className={`animate-fade-in ${className}`}>
      {children}
    </div>
  );
};

// ============================================
// 아바타 컴포넌트
// ============================================
export const Avatar = ({
  src,
  alt,
  name,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const words = name.split(' ');
    return words.length > 1
      ? words[0][0] + words[1][0]
      : name.substring(0, 2);
  };

  return (
    <div className={`
      ${sizeClasses[size]}
      rounded-full
      flex items-center justify-center
      font-medium
      ${src ? '' : 'bg-gradient-to-br from-indigo-400 to-purple-500 text-white'}
      ${className}
    `}>
      {src ? (
        <img
          src={src}
          alt={alt || name}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
};

// ============================================
// 구분선 컴포넌트
// ============================================
export const Divider = ({ className = '' }) => (
  <hr className={`border-gray-200 dark:border-gray-700 ${className}`} />
);

// ============================================
// 토스트 알림 시스템
// ============================================
const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`
              flex items-center gap-3 px-4 py-3
              rounded-xl shadow-lg
              animate-slide-up
              ${toast.type === 'success' ? 'bg-emerald-500' : ''}
              ${toast.type === 'error' ? 'bg-red-500' : ''}
              ${toast.type === 'warning' ? 'bg-amber-500' : ''}
              ${toast.type === 'info' ? 'bg-indigo-500' : ''}
              text-white
            `}
          >
            {toast.type === 'success' && <CheckCircle2 size={18} />}
            {toast.type === 'error' && <AlertCircle size={18} />}
            {toast.type === 'warning' && <AlertTriangle size={18} />}
            {toast.type === 'info' && <Info size={18} />}
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// ============================================
// 금액 표시 컴포넌트
// ============================================
export const Money = ({ amount, className = '', showSign = false }) => {
  const formatted = Math.abs(amount).toLocaleString('ko-KR');
  const isNegative = amount < 0;
  const isPositive = amount > 0;

  return (
    <span className={`
      font-semibold tabular-nums
      ${isNegative ? 'text-red-500' : ''}
      ${isPositive && showSign ? 'text-emerald-500' : ''}
      ${className}
    `}>
      {showSign && isPositive && '+'}
      {isNegative && '-'}
      {formatted}원
    </span>
  );
};

// ============================================
// 스탯 카드 컴포넌트
// ============================================
export const StatCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  trendValue,
  iconBgColor = 'bg-indigo-100 dark:bg-indigo-900/50',
  iconColor = 'text-indigo-500',
  className = '',
}) => (
  <Card className={`${className}`}>
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-xl ${iconBgColor}`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      {trend && (
        <Badge variant={trend === 'up' ? 'success' : 'danger'} size="sm">
          {trend === 'up' ? '+' : '-'}{trendValue}%
        </Badge>
      )}
    </div>
    <div className="mt-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
        {value}
      </p>
      {subValue && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          {subValue}
        </p>
      )}
    </div>
  </Card>
);

// ============================================
// 페이지 헤더 컴포넌트
// ============================================
export const PageHeader = ({
  title,
  subtitle,
  icon: Icon,
  action,
  className = '',
}) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 ${className}`}>
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="p-2.5 rounded-xl" style={{ background: 'rgba(0, 255, 242, 0.1)' }}>
          <Icon className="w-6 h-6" style={{ color: '#00fff2' }} />
        </div>
      )}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: '#ffffff' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action}
  </div>
);

// ============================================
// 테이블 컴포넌트
// ============================================
export const Table = ({ children, className = '' }) => (
  <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255, 255, 255, 0.1)' }}>
    <table className={`w-full ${className}`} style={{ background: 'rgba(20, 20, 35, 0.8)' }}>
      {children}
    </table>
  </div>
);

export const TableHeader = ({ children, className = '' }) => (
  <thead className={className} style={{ background: 'rgba(0, 0, 0, 0.3)' }}>
    {children}
  </thead>
);

export const TableBody = ({ children, className = '' }) => (
  <tbody className={className} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '', onClick }) => (
  <tr
    className={`
      ${onClick ? 'cursor-pointer' : ''}
      ${className}
    `}
    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
    onClick={onClick}
    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 255, 242, 0.05)'}
    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
  >
    {children}
  </tr>
);

export const TableHead = ({ children, className = '' }) => (
  <th className={`
    px-4 py-3
    text-left text-xs font-semibold uppercase tracking-wider
    ${className}
  `} style={{ color: '#00fff2' }}>
    {children}
  </th>
);

export const TableCell = ({ children, className = '' }) => (
  <td className={`
    px-4 py-3
    text-sm
    ${className}
  `} style={{ color: '#e2e8f0' }}>
    {children}
  </td>
);

export default {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Select,
  Textarea,
  Modal,
  Alert,
  Badge,
  Spinner,
  LoadingOverlay,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Avatar,
  Divider,
  ToastProvider,
  useToast,
  Money,
  StatCard,
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  tokens,
};
