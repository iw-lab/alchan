// src/firebase.js - Re-export Hub
// 모든 firebase 기능을 서브모듈에서 가져와 기존 import 호환성을 유지합니다.
// 실제 구현은 src/firebase/ 디렉토리의 서브모듈에 있습니다.

// Config: app, db, auth, storage, functions, isInitialized, firebaseConfig
export {
  db,
  auth,
  storage,
  functions,
  isInitialized,
} from "./firebase/firebaseConfig";

// Utils: DB 로깅, 캐시 시스템
export {
  invalidateCache,
} from "./firebase/firebaseUtils";

// Auth: 인증 함수
export {
  authStateListener,
  signInWithEmailAndPassword,
  signOut,
  registerWithEmailAndPassword,
  updateUserProfile,
} from "./firebase/firebaseAuth";

// DB: Firestore CRUD, 트랜잭션, 모든 비즈니스 로직
export {
  // 학급 관리자
  // CRUD
  // 학급 구성원
  getClassmates,
  // 학습앱(AAP) 교사 화면 조회
  fetchPlatformAlerts,
  fetchClassLearningStats,
  // 활동 로그 & 거래
  addActivityLog,
  addTransaction,
  // 사용자 문서
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  deleteUserDocument,
  // 현금/쿠폰/송금/벌금
  updateUserCashInFirestore,
  updateUserCouponsInFirestore,
  // 주식/세금
  // 기부/합의
  // 상점
  // 인벤토리
  // 마켓
  // 학급 코드
  verifyClassCode,
  // 조회
  getGovernmentSettings,
  // 뱅킹
  getBankingProducts,
  updateBankingProducts,
  // 마켓 요약
  // 배치
  // 네트워크
  // 캐시 문서
  getCachedDocument,
  // Cloud Functions
  processSettlement,
  collectWeeklyTaxes,
  collectWeeklyTaxesAsOfficer,
  // 학급 데이터 복사
  copyDefaultDataToNewClass,
  // Firestore primitives
  collection,
  firebaseCollection,
  doc,
  firebaseDoc,
  getDoc,
  firebaseGetSingleDoc,
  setDoc,
  firebaseSetDoc,
  getDocs,
  firebaseGetDocs,
  addDoc,
  updateDoc,
  firebaseUpdateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  orderBy,
  httpsCallable,
  // Auth re-exports
  updatePassword,
  deleteUser,
  // Additional Firestore
  Timestamp,
  limit,
} from "./firebase/firebaseDb";
