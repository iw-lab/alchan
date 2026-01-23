// src/hooks/useServiceWorker.js
// 서비스 워커 등록 및 업데이트 관리 훅

import { useState, useEffect, useCallback } from 'react';

export function useServiceWorker() {
  const [registration, setRegistration] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // 온라인/오프라인 상태 감지
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 서비스 워커 등록
    if ('serviceWorker' in navigator) {
      registerServiceWorker();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 🔥 [최적화] interval ID 저장용 state (cleanup을 위해)
  const [updateIntervalId, setUpdateIntervalId] = useState(null);

  // 🔥 [최적화] cleanup을 위한 effect
  useEffect(() => {
    return () => {
      if (updateIntervalId) {
        clearInterval(updateIntervalId);
      }
    };
  }, [updateIntervalId]);

  const registerServiceWorker = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      setRegistration(reg);
      console.log('[PWA] 서비스 워커 등록 성공:', reg.scope);

      // 업데이트 확인
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 최근에 업데이트했으면 알림 안 띄우기 (5분 이내)
              const lastUpdated = sessionStorage.getItem('alchan_updated');
              if (lastUpdated && Date.now() - parseInt(lastUpdated) < 5 * 60 * 1000) {
                console.log('[PWA] 최근 업데이트됨 - 알림 생략');
                return;
              }
              console.log('[PWA] 새 버전 사용 가능');
              setUpdateAvailable(true);
            }
          });
        }
      });

      // 🔥 [최적화] 주기적 업데이트 확인 (1시간마다) - cleanup 가능하도록 ID 저장
      const intervalId = setInterval(() => {
        reg.update();
      }, 60 * 60 * 1000);
      setUpdateIntervalId(intervalId);

    } catch (error) {
      console.error('[PWA] 서비스 워커 등록 실패:', error);
    }
  };

  const updateServiceWorker = useCallback(() => {
    // 먼저 알림 숨기기
    setUpdateAvailable(false);

    // 세션 스토리지에 업데이트 완료 표시 (새로고침 후 알림 다시 안 뜨게)
    sessionStorage.setItem('alchan_updated', Date.now().toString());

    if (registration && registration.waiting) {
      // 새 서비스 워커가 활성화되면 페이지 새로고침
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] 새 서비스 워커 활성화됨 - 새로고침');
        window.location.reload();
      });

      // 새 서비스 워커에게 활성화 메시지 전송
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // waiting 상태의 서비스 워커가 없으면 그냥 새로고침
      console.log('[PWA] 대기 중인 서비스 워커 없음 - 강제 새로고침');
      window.location.reload();
    }
  }, [registration]);

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.log('[PWA] 이 브라우저는 알림을 지원하지 않습니다.');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }, []);

  const showNotification = useCallback(async (title, options = {}) => {
    const hasPermission = await requestNotificationPermission();

    if (hasPermission && registration) {
      registration.showNotification(title, {
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        ...options
      });
    }
  }, [registration, requestNotificationPermission]);

  return {
    registration,
    updateAvailable,
    updateServiceWorker,
    isOnline,
    requestNotificationPermission,
    showNotification
  };
}

export default useServiceWorker;
