// index.js - 비용 최적화 버전

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import './index.css'; // Tailwind CSS - 반드시 먼저 import

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
    logger.log('[App] 새 버전 감지 - 자동 업데이트 적용');
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      // 새 서비스 워커가 활성화되면 자동 리로드
      registration.waiting.addEventListener('statechange', (e) => {
        if (e.target.state === 'activated') {
          window.location.reload();
        }
      });
    }
  },
});

// 다른 탭에서 서비스 워커가 업데이트되면 이 탭도 자동 리로드
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
