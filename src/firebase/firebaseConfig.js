// src/firebase/firebaseConfig.js - Firebase 초기화 및 서비스 인스턴스

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getAuth,
  connectAuthEmulator,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

import { logger } from "../utils/logger";
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

logger.log("[firebase.js] Firebase 앱 초기화 시작...");
const app = initializeApp(firebaseConfig);

let db;
try {
  db = getFirestore(app);
  logger.log("[firebase.js] Firestore 초기화 완료 (기본 모드)");
} catch (error) {
  logger.error("[firebase.js] Firestore 초기화 실패:", error);
  db = getFirestore(app);
}

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'asia-northeast3');
logger.log("[firebase.js] Firebase 앱 초기화 완료");

if (process.env.NODE_ENV === 'development') {
  logger.log('[firebase.js] 로컬 개발 환경: 에뮬레이터에 연결합니다...');
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    logger.log('[firebase.js] 로컬 에뮬레이터 연결 성공.');
  } catch (error) {
    logger.error('[firebase.js] 에뮬레이터 연결 오류:', error);
  }
}

const isInitialized = () => {
  const initialized = Boolean(app && db && auth);
  if (!initialized) {
    logger.warn(
      "[firebase.js] Firebase 서비스가 아직 초기화되지 않았습니다.",
      { app: !!app, db: !!db, auth: !!auth }
    );
  }
  return initialized;
};

export { app, db, auth, storage, functions, isInitialized };
