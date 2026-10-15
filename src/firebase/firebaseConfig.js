// src/firebase/firebaseConfig.js - Firebase 초기화 및 서비스 인스턴스

import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { logger } from "../utils/logger";
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

logger.log("[firebase.js] Firebase 앱 초기화 시작...");
const app = initializeApp(firebaseConfig);

// 🚨 firestore SDK 11.10.0의 watch_change race(ID:ca9) 회피 — memoryLocalCache 사용.
// IndexedDB persistentLocalCache + multi-tab manager는 페이지 전환 + WebChannel
// 재연결 시 target ID 음수 unexpected state 발생 빈도 높음. 알찬은 실시간 자산
// 데이터 위주라 오프라인 cache 의존도 낮음 → memory cache로 안정성 우선.
const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
logger.log("[firebase.js] Firestore 초기화 완료 (memory cache)");

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, "asia-northeast3");
logger.log("[firebase.js] Firebase 앱 초기화 완료");

if (process.env.NODE_ENV === "development") {
  logger.log("[firebase.js] 로컬 개발 환경: 에뮬레이터에 연결합니다...");
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    logger.log("[firebase.js] 로컬 에뮬레이터 연결 성공.");
  } catch (error) {
    logger.error("[firebase.js] 에뮬레이터 연결 오류:", error);
  }
}

// Firebase App Check - reCAPTCHA v3 기반. 강제 적용은 전부 꺼져 있다(모니터링 모드 — 메모리 appcheck_enforce_decision).
//
// ⏱ 첫 화면이 뜬 «뒤에» 켠다(2026-10-15 사용자 「첫 로딩시간이 너무 길어」).
//   App Check 가 등록돼 있으면 Firestore·Auth·Functions 는 요청마다 토큰을 **기다린다**(제한시간 없음 —
//   firestore FirebaseAppCheckTokenProvider.getToken). 그날 첫 접속이면 토큰이 없어 reCAPTCHA 스크립트
//   2벌(약 700KB) 내려받기 → 실행 → 교환까지 끝나야 첫 읽기가 나간다. 운영 실측 2.5~3.4초(데스크톱).
//   에뮬레이터에서 토큰을 3초 늦추자 로그인 유지 상태 첫 화면이 0.42초 → 3.44초가 됐다.
//   늦게 켜도 SDK 가 알아서 붙는다(Firestore onInit 등록 · Auth/Functions 는 호출 때마다 조회).
// ⚠️ 대가: 켜기 전 몇 초 동안의 CF 호출은 토큰이 없어 서버 «App Check token missing» 경고가 남는다.
//   강제 적용(enforceAppCheck)을 다시 검토한다면 이 지연부터 걷어내야 한다 — 그때는 첫 화면이 다시 기다린다.
let appCheckStarted = false;
export function startAppCheck() {
  if (appCheckStarted || typeof window === "undefined" || !process.env.REACT_APP_RECAPTCHA_SITE_KEY) return false;
  appCheckStarted = true;
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-restricted-globals
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(process.env.REACT_APP_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    logger.log("[firebase.js] App Check (reCAPTCHA v3) 초기화 완료");
  } catch (e) {
    logger.warn("[firebase.js] App Check 초기화 실패:", e);
  }
  return true;
}

// 첫 화면의 읽기(대시보드 위젯 포함)가 나간 뒤 — delayMs 뒤 브라우저가 한가할 때 켠다. 반환값 = 취소 함수.
export const APP_CHECK_DELAY_MS = 3000;
export function startAppCheckSoon(delayMs = APP_CHECK_DELAY_MS) {
  if (appCheckStarted || typeof window === "undefined") return () => {};
  let idleId = null;
  const timer = setTimeout(() => {
    if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(startAppCheck, { timeout: 2000 });
    else startAppCheck();
  }, delayMs);
  return () => {
    clearTimeout(timer);
    if (idleId !== null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
  };
}

const isInitialized = () => {
  const initialized = Boolean(app && db && auth);
  if (!initialized) {
    logger.warn("[firebase.js] Firebase 서비스가 아직 초기화되지 않았습니다.", {
      app: !!app,
      db: !!db,
      auth: !!auth,
    });
  }
  return initialized;
};

export {  db, auth, storage, functions, isInitialized,  };
