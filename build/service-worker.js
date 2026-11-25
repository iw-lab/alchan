// 이 앱은 서비스워커를 쓰지 않는다(2026-11-25). 옛 기기에 남은 워커가 이 파일로 갱신되면 스스로 사라진다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister()),
  );
});
