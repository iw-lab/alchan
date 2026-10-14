// src/serviceWorkerRegistration.js
// [비용 최적화] Service Worker 등록 헬퍼

import { logger } from "./utils/logger";



export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
        logger.log('[SW Registration] Service Worker unregistered');
      })
      .catch((error) => {
        logger.error('[SW Registration] Unregister error:', error);
      });
  }
}


