// public/service-worker.js
// [비용 최적화] Service Worker - 정적 자산 캐싱으로 서버 요청 감소

const CACHE_NAME = 'alchan-cache-v1';
const STATIC_CACHE_NAME = 'alchan-static-v1';
const RUNTIME_CACHE_NAME = 'alchan-runtime-v1';

// 캐시할 정적 파일들
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// 캐시 전략: Network First (API), Cache First (정적 자산)
const CACHE_STRATEGIES = {
  cacheFirst: [
    /\.(?:js|css|woff2?|ttf|eot|otf)$/i,
    /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/i,
    /\.(?:json)$/i,
  ],
  networkFirst: [
    /\/api\//,
    /firestore\.googleapis\.com/,
    /firebase/,
    /identitytoolkit/,
  ],
  staleWhileRevalidate: [
    /^https:\/\/fonts\.googleapis\.com/,
    /^https:\/\/fonts\.gstatic\.com/,
  ],
};

// 설치 이벤트
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.warn('[ServiceWorker] Pre-cache failed:', error);
      })
  );
});

// 활성화 이벤트 - 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    Promise.all([
      // 오래된 캐시 삭제
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith('alchan-') &&
                     cacheName !== STATIC_CACHE_NAME &&
                     cacheName !== RUNTIME_CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      }),
      // 즉시 활성화
      self.clients.claim(),
    ])
  );
});

// Fetch 이벤트 - 캐시 전략 적용
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // POST 요청 및 크롬 확장 프로그램은 건너뛰기
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Firebase API 요청은 네트워크로 직접 전달 (캐시하지 않음)
  if (CACHE_STRATEGIES.networkFirst.some(pattern => pattern.test(url.href))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 정적 자산은 Cache First 전략
  if (CACHE_STRATEGIES.cacheFirst.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Google Fonts는 Stale While Revalidate
  if (CACHE_STRATEGIES.staleWhileRevalidate.some(pattern => pattern.test(url.href))) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 기본 전략: Network First with Cache Fallback
  event.respondWith(networkFirst(event.request));
});

// Cache First 전략 - 캐시에 있으면 캐시 사용, 없으면 네트워크
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.warn('[ServiceWorker] Fetch failed:', error);
    // 오프라인 fallback 페이지가 있다면 여기서 반환
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network First 전략 - 네트워크 먼저, 실패시 캐시
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Stale While Revalidate 전략 - 캐시 즉시 반환 + 백그라운드 업데이트
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // 네트워크 실패시 무시 (캐시 사용)
  });

  return cachedResponse || fetchPromise;
}

// 메시지 리스너 - 캐시 제어
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('alchan-'))
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});

console.log('[ServiceWorker] Registered - Cost Optimization Active');
