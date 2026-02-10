// This script can't use modules, so we use importScripts
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

let app = null;
let messaging = null;

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    if (!app) { // Initialize only once
      console.log('[SW] Firebase config received:', event.data.config);
      app = firebase.initializeApp(event.data.config);
      messaging = firebase.messaging();

      messaging.onBackgroundMessage((payload) => {
        console.log(
          "[firebase-messaging-sw.js] Received background message ",
          payload
        );
        
        const notificationTitle = "새로운 시장 소식";
        const notificationOptions = {
          body: "주식 시장에 새로운 정보가 업데이트되었습니다. 앱을 확인하세요!",
          icon: "/favicon.ico",
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
      });
    }
  }
});
