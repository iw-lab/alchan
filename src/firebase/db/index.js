// src/firebase/db/index.js - 모든 Firebase DB 모듈 re-export

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
} from './core';

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
} from './users';

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
} from './transactions';

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
} from './store';

// Settings functions
export {
  getGovernmentSettings,
  updateGovernmentSettings,
  getNationalTreasury,
  getBankingProducts,
  updateBankingProducts,
  subscribeToMarketSummary,
  copyDefaultDataToNewClass,
} from './settings';

// Utility functions
export {
  batchGetDocs,
  batchGetUsers,
  goOffline,
  goOnline,
  getCachedDocument,
  processSettlement,
  isFirestoreInitialized,
} from './utils';

// Re-export Firestore primitives for direct use
export {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
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

// Firebase Auth re-exports
export { updatePassword, deleteUser } from "firebase/auth";

// Firebase Functions
export { httpsCallable } from "firebase/functions";

// Aliases for backward compatibility
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  limit,
} from "firebase/firestore";

export {
  collection as firebaseCollection,
  doc as firebaseDoc,
  getDoc as firebaseGetSingleDoc,
  setDoc as firebaseSetDoc,
  getDocs as firebaseGetDocs,
  updateDoc as firebaseUpdateDoc,
  deleteDoc as firebaseDeleteDoc,
  addDoc as firebaseAddDoc,
  query as firebaseQuery,
  where as firebaseWhere,
  limit as firebaseLimit,
};
