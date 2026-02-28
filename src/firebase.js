// src/firebase.js - Re-export Hub
// 모든 firebase 기능을 서브모듈에서 가져와 기존 import 호환성을 유지합니다.
// 실제 구현은 src/firebase/ 디렉토리의 서브모듈에 있습니다.

// Config: app, db, auth, storage, functions, isInitialized, firebaseConfig
export {
  app,
  db,
  auth,
  storage,
  functions,
  isInitialized,
  firebaseConfig,
} from "./firebase/firebaseConfig";

// Utils: DB 로깅, 캐시 시스템
export {
  logDbOperation,
  getDbStats,
  printRecentOperations,
  getTabStats,
  resetDbStats,
  setCache,
  getCache,
  invalidateCache,
  invalidateCachePattern,
  setBatchCache,
  clearCache,
  getCacheStats,
  CACHE_TTL,
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
  getClassAdminUid,
  // CRUD
  addData,
  updateData,
  deleteData,
  fetchCollectionOnce,
  subscribeToCollection,
  // 학급 구성원
  getClassmates,
  // 활동 로그 & 거래
  addActivityLog,
  addTransaction,
  // 사용자 문서
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  deleteUserDocument,
  getAllUsersDocuments,
  // 현금/쿠폰/송금/벌금
  updateUserCashInFirestore,
  updateUserCouponsInFirestore,
  transferCash,
  processFineTransaction,
  adminDepositCash,
  adminWithdrawCash,
  // 주식/세금
  processStockSaleTransaction,
  processGenericSaleTransaction,
  collectPropertyHoldingTaxes,
  // 기부/합의
  addDonationRecord,
  addSettlementRecord,
  getDonationsForClass,
  // 상점
  getStoreItems,
  addStoreItem,
  updateStoreItem,
  deleteStoreItem,
  // 인벤토리
  addItemToInventory,
  purchaseItemTransaction,
  // 마켓
  addMarketListing,
  updateUserInventoryItemQuantity,
  // 학급 코드
  verifyClassCode,
  // 조회
  getUserInventory,
  getMarketItems,
  updateMarketListing,
  getGovernmentSettings,
  updateGovernmentSettings,
  getNationalTreasury,
  getActivityLogs,
  // 뱅킹
  getBankingProducts,
  updateBankingProducts,
  // 마켓 요약
  subscribeToMarketSummary,
  // 배치
  batchGetDocs,
  batchGetUsers,
  // 네트워크
  goOffline,
  goOnline,
  // 캐시 문서
  getCachedDocument,
  // Cloud Functions
  processSettlement,
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
  originalFirebaseAddDoc,
  addDoc,
  firebaseAddDoc,
  updateDoc,
  firebaseUpdateDoc,
  deleteDoc,
  firebaseDeleteDoc,
  query,
  firebaseQuery,
  where,
  firebaseWhere,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  orderBy,
  isFirestoreInitialized,
  httpsCallable,
  // Auth re-exports
  updatePassword,
  deleteUser,
  // Additional Firestore
  arrayUnion,
  arrayRemove,
  Timestamp,
  firebaseLimit,
  limit,
} from "./firebase/firebaseDb";
