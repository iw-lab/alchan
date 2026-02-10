// 알찬 PWA 서비스 워커 - 네트워크 우선 (항상 최신 버전)
// 🔥 버전 업데이트: 흰화면 문제 해결
const CACHE_VERSION = 'v1.3.0';
const CACHE_NAME = `alchan-${CACHE_VERSION}`;
const STATIC_CACHE = `alchan-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `alchan-dynamic-${CACHE_VERSION}`;

// 정적 자원 (앱 셸) - 최소화
const STATIC_ASSETS = [
  '/offline.html'
];

// 캐시하지 않을 URL 패턴
const EXCLUDE_FROM_CACHE = [
  /firestore\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /firebase/,
  /hot-update/,
  /__/,
  /\.js$/,  // JS 파일은 항상 네트워크에서
  /\.css$/, // CSS 파일도 항상 네트워크에서
];

// 설치 이벤트 - 즉시 활성화
self.addEventListener('install', (event) => {
  console.log('[SW] 설치 중... 버전:', CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] offline.html만 캐싱');
        return cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] 캐시 실패 (무시):', err);
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[SW] skipWaiting 호출');
        return self.skipWaiting();
      })
  );
});

// 활성화 이벤트 - 모든 이전 캐시 삭제
self.addEventListener('activate', (event) => {
  console.log('[SW] 활성화, 버전:', CACHE_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // 현재 버전이 아닌 모든 캐시 삭제
            return name.startsWith('alchan') &&
                   name !== STATIC_CACHE &&
                   name !== DYNAMIC_CACHE;
          })
          .map((name) => {
            console.log('[SW] 오래된 캐시 삭제:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] clients.claim() 호출');
      return self.clients.claim();
    })
  );
});

// Fetch 이벤트 - 네트워크 우선 (SPA 흰화면 방지)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 다른 도메인 요청은 무시 (Firebase 등)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 캐시 제외 대상 확인
  if (EXCLUDE_FROM_CACHE.some(pattern => pattern.test(request.url))) {
    return;
  }

  // GET 요청만 처리
  if (request.method !== 'GET') {
    return;
  }

  // 네비게이션 요청 (HTML) - 항상 네트워크 우선
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          // 유효한 응답인지 확인
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          return response;
        })
        .catch(() => {
          // 오프라인일 때만 캐시 사용
          console.log('[SW] 네트워크 실패, 오프라인 페이지 표시');
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // 이미지, 폰트만 캐시 (JS/CSS는 캐시 안 함)
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2)$/)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // 기타 요청 - 그냥 네트워크로 전달 (캐시 안 함)
});

// 푸시 알림 수신
self.addEventListener('push', (event) => {
  console.log('[SW] 푸시 알림 수신');

  let data = { title: '알찬', body: '새로운 알림이 있습니다.' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 알림 클릭');
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const rawUrl = event.notification.data?.url || '/';
  const url = rawUrl.startsWith('/') ? rawUrl : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 창이 있으면 포커스
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// 백그라운드 동기화
self.addEventListener('sync', (event) => {
  console.log('[SW] 백그라운드 동기화:', event.tag);

  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  // 오프라인 동안 저장된 데이터 동기화
  console.log('[SW] 데이터 동기화 시작');
}

// 주기적 백그라운드 동기화 (실험적)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    event.waitUntil(updateContent());
  }
});

async function updateContent() {
  console.log('[SW] 콘텐츠 업데이트 확인');
}

// SKIP_WAITING 메시지 수신 시 즉시 활성화
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING 메시지 수신 - 즉시 활성화');
    self.skipWaiting();
  }
});

console.log('[SW] 서비스 워커 로드됨');
