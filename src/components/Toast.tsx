// src/components/Toast.tsx
/**
 * Toast 알림 컴포넌트 및 Context
 * 전역에서 사용 가능한 토스트 알림 시스템
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import type { NotificationType } from '../types';

// ==================== Types ====================
interface Toast {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

// ==================== Context ====================
const ToastContext = createContext<ToastContextType | null>(null);

// ==================== Hook ====================
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// ==================== Provider ====================
interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
  defaultDuration?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  maxToasts = 5,
  defaultDuration = 3500,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const duration = toast.duration ?? defaultDuration;

      setToasts((prev) => {
        const newToasts = [...prev, { ...toast, id }];
        // 최대 개수 초과 시 가장 오래된 토스트 제거
        if (newToasts.length > maxToasts) {
          return newToasts.slice(-maxToasts);
        }
        return newToasts;
      });

      // 자동 제거
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [defaultDuration, maxToasts, removeToast]
  );

  // 편의 메서드들
  const success = useCallback(
    (message: string, title?: string) => {
      addToast({ type: 'success', message, title });
    },
    [addToast]
  );

  const error = useCallback(
    (message: string, title?: string) => {
      addToast({ type: 'error', message, title, duration: 5000 }); // 에러는 더 오래 표시
    },
    [addToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => {
      addToast({ type: 'warning', message, title });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, title?: string) => {
      addToast({ type: 'info', message, title });
    },
    [addToast]
  );

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, warning, info }}
    >
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// ==================== Toast Container ====================
interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

// ==================== Toast Item ====================
interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const icons: Record<NotificationType, ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-green-400" />,
    error: <XCircle className="w-5 h-5 text-red-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
  };

  const bgColors: Record<NotificationType, string> = {
    success: 'bg-green-500/10 border-green-500/30',
    error: 'bg-red-500/10 border-red-500/30',
    warning: 'bg-yellow-500/10 border-yellow-500/30',
    info: 'bg-blue-500/10 border-blue-500/30',
  };

  return (
    <div
      className={`
        pointer-events-auto
        flex items-start gap-3 p-4
        rounded-lg border backdrop-blur-sm
        shadow-lg animate-slide-in-right
        ${bgColors[toast.type]}
      `}
      role="alert"
    >
      {/* 아이콘 */}
      <div className="flex-shrink-0">{icons[toast.type]}</div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="text-sm font-semibold text-white mb-1">{toast.title}</p>
        )}
        <p className="text-sm text-gray-300">{toast.message}</p>
      </div>

      {/* 닫기 버튼 */}
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
        aria-label="닫기"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// ==================== CSS Animation (추가 필요) ====================
// tailwind.config.js에 다음 애니메이션 추가:
// animation: {
//   'slide-in-right': 'slideInRight 0.3s ease-out',
// },
// keyframes: {
//   slideInRight: {
//     '0%': { transform: 'translateX(100%)', opacity: '0' },
//     '100%': { transform: 'translateX(0)', opacity: '1' },
//   },
// },

export default ToastProvider;
