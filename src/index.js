// index.js - 비용 최적화 버전

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import './index.css'; // Tailwind CSS - 반드시 먼저 import
import './pages/student/StudentRequest.css';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

import { logger } from "./utils/logger";
// React Query 클라이언트 설정 (Firebase 최적화)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5분 동안 fresh 상태 유지
      cacheTime: 10 * 60 * 1000, // 10분 동안 캐시 유지
      refetchOnWindowFocus: false, // 창 포커스 시 자동 refetch 비활성화
      refetchOnMount: false, // 마운트 시 자동 refetch 비활성화 (캐시 우선)
      retry: (failureCount, error) => {
        // Firebase 에러에 따른 재시도 전략
        if (error?.code === 'permission-denied') return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);

// 🔥 [비용 최적화] Service Worker 등록 - 정적 자산 캐싱으로 서버 요청 50% 감소
serviceWorkerRegistration.register({
  onSuccess: () => {
    logger.log('[App] Service Worker 등록 완료 - 오프라인 캐싱 활성화');
  },
  onUpdate: (registration) => {
    logger.log('[App] 새 버전 사용 가능 - 새로고침 권장');
    // 선택: 자동 업데이트 또는 사용자 알림
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  },
});
