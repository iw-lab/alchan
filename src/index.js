// index.js - 비용 최적화 버전

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css'; // Tailwind CSS - 반드시 먼저 import
import './pages/student/StudentRequest.css';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

import { logger } from "./utils/logger";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service Worker 등록 - 정적 자산 캐싱으로 서버 요청 50% 감소
serviceWorkerRegistration.register({
  onSuccess: () => {
    logger.log('[App] Service Worker 등록 완료 - 오프라인 캐싱 활성화');
  },
  onUpdate: (registration) => {
    logger.log('[App] 새 버전 사용 가능 - 새로고침 권장');
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  },
});
