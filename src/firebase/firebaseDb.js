// src/firebase/firebaseDb.js - 모든 Firebase DB 함수 re-export (하위 호환성)
// 실제 구현은 ./db/ 폴더에 분리됨

// Core functions
export {
  getClassmates,
  verifyClassCode,
} from './db/core';

// 학습앱(AAP) 교사 화면 조회 — 읽기 전용
export {
  fetchPlatformAlerts,
  fetchClassLearningStats,
} from './db/learningApps';

// User functions
export {
  addActivityLog,
  addTransaction,
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  deleteUserDocument,
} from './db/users';

// Transaction functions
export {
  updateUserCashInFirestore,
  updateUserCouponsInFirestore,
} from './db/transactions';

// Store functions
;

// Settings functions
export {
  getGovernmentSettings,
  getBankingProducts,
  updateBankingProducts,
  copyDefaultDataToNewClass,
} from './db/settings';

// Utility functions
export {
  getCachedDocument,
  processSettlement,
  collectWeeklyTaxes,
  collectWeeklyTaxesAsOfficer,
} from './db/utils';

// Re-export Firestore primitives
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc as originalFirebaseAddDoc,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  orderBy,
  Timestamp,
  limit,
} from "firebase/firestore";

const query = originalFirebaseQuery;
const where = originalFirebaseWhere;
const addDoc = originalFirebaseAddDoc;

export {
  collection,
  collection as firebaseCollection,
  doc,
  doc as firebaseDoc,
  getDoc,
  getDoc as firebaseGetSingleDoc,
  setDoc,
  setDoc as firebaseSetDoc,
  getDocs,
  getDocs as firebaseGetDocs,
  addDoc,
  updateDoc,
  updateDoc as firebaseUpdateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  orderBy,
  Timestamp,
  limit,
};

// Firebase Auth re-exports
export { updatePassword, deleteUser } from "firebase/auth";

// Firebase Functions
export { httpsCallable } from "firebase/functions";
