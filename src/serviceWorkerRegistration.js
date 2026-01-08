// src/serviceWorkerRegistration.js
// [비용 최적화] Service Worker 등록 헬퍼

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
  if ('serviceWorker' in navigator) {
    // 프로덕션 또는 localhost에서만 등록
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      // PUBLIC_URL이 다른 origin이면 서비스 워커가 작동하지 않음
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        // localhost에서는 서비스 워커 확인
        checkValidServiceWorker(swUrl, config);
        console.log('[SW Registration] Running on localhost, service worker will be validated');
      } else {
        // 프로덕션 환경에서 서비스 워커 등록
        registerValidSW(swUrl, config);
      }
    });
  } else {
    console.log('[SW Registration] Service workers are not supported');
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('[SW Registration] Service Worker registered:', registration.scope);

      // 업데이트 확인
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }

        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // 새 콘텐츠 사용 가능
              console.log('[SW Registration] New content available; please refresh');

              // 업데이트 콜백 호출
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // 콘텐츠가 오프라인용으로 캐시됨
              console.log('[SW Registration] Content is cached for offline use');

              // 성공 콜백 호출
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('[SW Registration] Error during registration:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  // 서비스 워커가 유효한지 확인
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // 서비스 워커를 찾을 수 없음 - 아마 다른 앱
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // 서비스 워커가 존재 - 정상 진행
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('[SW Registration] No internet connection. App running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
        console.log('[SW Registration] Service Worker unregistered');
      })
      .catch((error) => {
        console.error('[SW Registration] Unregister error:', error);
      });
  }
}

// 캐시 정리 함수
export function clearCache() {
  return new Promise((resolve, reject) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.success) {
          resolve();
        } else {
          reject(new Error('Cache clear failed'));
        }
      };
      navigator.serviceWorker.controller.postMessage('clearCache', [messageChannel.port2]);
    } else {
      // 서비스 워커 없으면 브라우저 캐시만 정리
      if ('caches' in window) {
        caches.keys().then((names) => {
          Promise.all(names.map((name) => caches.delete(name))).then(() => resolve());
        });
      } else {
        resolve();
      }
    }
  });
}

// 서비스 워커 업데이트 강제
export function skipWaiting() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('skipWaiting');
  }
}
