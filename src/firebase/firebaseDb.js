// src/firebase/firebaseDb.js - 모든 Firebase DB 함수 re-export (하위 호환성)
// 실제 구현은 ./db/ 폴더에 분리됨

// Core functions
export {
  getClassAdminUid,
  addData,
  updateData,
  deleteData,
  fetchCollectionOnce,
  subscribeToCollection,
  getClassmates,
  verifyClassCode,
} from './db/core';

// User functions
export {
  addActivityLog,
  addTransaction,
  getUserDocument,
  addUserDocument,
  updateUserDocument,
  deleteUserDocument,
  getAllUsersDocuments,
  getActivityLogs,
} from './db/users';

// Transaction functions
export {
  updateUserCashInFirestore,
  updateUserCouponsInFirestore,
  transferCash,
  processFineTransaction,
  adminDepositCash,
  adminWithdrawCash,
  processStockSaleTransaction,
  processGenericSaleTransaction,
  collectPropertyHoldingTaxes,
  addDonationRecord,
  addSettlementRecord,
  getDonationsForClass,
} from './db/transactions';

// Store functions
export {
  getStoreItems,
  addStoreItem,
  updateStoreItem,
  deleteStoreItem,
  addItemToInventory,
  purchaseItemTransaction,
  getUserInventory,
  updateUserInventoryItemQuantity,
  addMarketListing,
  getMarketItems,
  updateMarketListing,
} from './db/store';

// Settings functions
export {
  getGovernmentSettings,
  updateGovernmentSettings,
  getNationalTreasury,
  getBankingProducts,
  updateBankingProducts,
  subscribeToMarketSummary,
  copyDefaultDataToNewClass,
} from './db/settings';

// Utility functions
export {
  batchGetDocs,
  batchGetUsers,
  goOffline,
  goOnline,
  getCachedDocument,
  processSettlement,
  isFirestoreInitialized,
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
  arrayUnion,
  arrayRemove,
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
  originalFirebaseAddDoc,
  addDoc,
  originalFirebaseAddDoc as firebaseAddDoc,
  updateDoc,
  updateDoc as firebaseUpdateDoc,
  deleteDoc,
  deleteDoc as firebaseDeleteDoc,
  query,
  originalFirebaseQuery as firebaseQuery,
  where,
  originalFirebaseWhere as firebaseWhere,
  serverTimestamp,
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  orderBy,
  arrayUnion,
  arrayRemove,
  Timestamp,
  limit as firebaseLimit,
  limit,
};

// Firebase Auth re-exports
export { updatePassword, deleteUser } from "firebase/auth";

// Firebase Functions
export { httpsCallable } from "firebase/functions";
