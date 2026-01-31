// src/types/firebase.ts
// Firebase 관련 타입 정의

import {
  User as FirebaseUser,
  Auth,
  UserCredential,
} from 'firebase/auth';
import {
  Firestore,
  CollectionReference,
  DocumentReference,
  Query,
  QuerySnapshot,
  DocumentSnapshot,
  Timestamp,
  FieldValue,
} from 'firebase/firestore';
import {
  Functions,
  HttpsCallable,
  HttpsCallableResult,
} from 'firebase/functions';
import {
  FirebaseStorage,
  StorageReference,
  UploadTask,
} from 'firebase/storage';

// ============================================
// Firebase Auth Types
// ============================================

export type {
  FirebaseUser,
  Auth,
  UserCredential,
};

export interface AuthError {
  code: string;
  message: string;
}

export interface SignInOptions {
  email: string;
  password: string;
}

export interface SignUpOptions extends SignInOptions {
  displayName?: string;
}

// ============================================
// Firestore Types
// ============================================

export type {
  Firestore,
  CollectionReference,
  DocumentReference,
  Query,
  QuerySnapshot,
  DocumentSnapshot,
  Timestamp,
  FieldValue,
};

export interface FirestoreDocument {
  id: string;
  [key: string]: any;
}

export interface QueryOptions {
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  where?: Array<{
    field: string;
    operator: FirestoreOperator;
    value: any;
  }>;
  startAfter?: any;
  endBefore?: any;
}

export type FirestoreOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'array-contains'
  | 'array-contains-any'
  | 'in'
  | 'not-in';

export interface BatchWrite {
  type: 'set' | 'update' | 'delete';
  ref: DocumentReference;
  data?: any;
}

// ============================================
// Cloud Functions Types
// ============================================

export type {
  Functions,
  HttpsCallable,
  HttpsCallableResult,
};

export interface CloudFunctionRequest<T = any> {
  data: T;
}

export interface CloudFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Function names as const
export const CLOUD_FUNCTIONS = {
  // Item functions
  GET_ITEM_CONTEXT_DATA: 'getItemContextData',
  ADD_STORE_ITEM: 'addStoreItem',
  UPDATE_STORE_ITEM: 'updateStoreItem',
  DELETE_STORE_ITEM: 'deleteStoreItem',
  PURCHASE_STORE_ITEM: 'purchaseStoreItem',
  USE_USER_ITEM: 'useUserItem',
  UPDATE_USER_ITEM_QUANTITY: 'updateUserItemQuantity',
  LIST_USER_ITEM_FOR_SALE: 'listUserItemForSale',
  BUY_MARKET_ITEM: 'buyMarketItem',
  CANCEL_MARKET_SALE: 'cancelMarketSale',
  MAKE_OFFER: 'makeOffer',
  RESPOND_TO_OFFER: 'respondToOffer',
  ADMIN_CANCEL_SALE: 'adminCancelSale',
  ADMIN_DELETE_ITEM: 'adminDeleteItem',

  // User functions
  UPDATE_USER_CASH: 'updateUserCash',
  UPDATE_USER_COUPONS: 'updateUserCoupons',
  TRANSFER_CASH: 'transferCash',

  // Job functions
  APPLY_FOR_JOB: 'applyForJob',
  PROCESS_JOB_APPLICATION: 'processJobApplication',
  PAY_SALARY: 'paySalary',

  // Stock functions
  BUY_STOCK: 'buyStock',
  SELL_STOCK: 'sellStock',
  UPDATE_STOCK_PRICES: 'updateStockPrices',

  // Auction functions
  PLACE_BID: 'placeBid',
  END_AUCTION: 'endAuction',

  // Admin functions
  CREATE_CLASS: 'createClass',
  UPDATE_CLASS_SETTINGS: 'updateClassSettings',
  DELETE_CLASS: 'deleteClass',
} as const;

export type CloudFunctionName = typeof CLOUD_FUNCTIONS[keyof typeof CLOUD_FUNCTIONS];

// ============================================
// Storage Types
// ============================================

export type {
  FirebaseStorage,
  StorageReference,
  UploadTask,
};

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
}

export interface UploadResult {
  url: string;
  path: string;
  metadata: any;
}

// ============================================
// Firebase Config
// ============================================

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// ============================================
// Firestore Collections
// ============================================

export const COLLECTIONS = {
  USERS: 'users',
  CLASSES: 'classes',
  ITEMS: 'items',
  INVENTORY: 'inventory',
  MARKET_LISTINGS: 'marketListings',
  MARKET_OFFERS: 'marketOffers',
  JOBS: 'jobs',
  JOB_APPLICATIONS: 'jobApplications',
  TRANSACTIONS: 'transactions',
  STOCKS: 'stocks',
  STOCK_HOLDINGS: 'stockHoldings',
  STOCK_TRANSACTIONS: 'stockTransactions',
  AUCTIONS: 'auctions',
  AUCTION_BIDS: 'auctionBids',
  REAL_ESTATE: 'realEstate',
  ACTIVITY_LOGS: 'activityLogs',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

// ============================================
// Firebase Hooks Return Types
// ============================================

export interface UseFirestoreDocumentResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseFirestoreCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

// ============================================
// Realtime Listener Types
// ============================================

export type UnsubscribeFunction = () => void;

export interface ListenerOptions {
  includeMetadataChanges?: boolean;
  source?: 'default' | 'server' | 'cache';
}

// ============================================
// Cache Types
// ============================================

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  forceRefresh?: boolean;
  cacheKey?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// ============================================
// Error Types
// ============================================

export interface FirebaseError extends Error {
  code: string;
  message: string;
  details?: any;
}

export const FIREBASE_ERROR_CODES = {
  // Auth errors
  EMAIL_ALREADY_IN_USE: 'auth/email-already-in-use',
  INVALID_EMAIL: 'auth/invalid-email',
  WEAK_PASSWORD: 'auth/weak-password',
  USER_NOT_FOUND: 'auth/user-not-found',
  WRONG_PASSWORD: 'auth/wrong-password',
  TOO_MANY_REQUESTS: 'auth/too-many-requests',
  REQUIRES_RECENT_LOGIN: 'auth/requires-recent-login',

  // Firestore errors
  PERMISSION_DENIED: 'permission-denied',
  NOT_FOUND: 'not-found',
  ALREADY_EXISTS: 'already-exists',
  RESOURCE_EXHAUSTED: 'resource-exhausted',
  UNAVAILABLE: 'unavailable',
  DEADLINE_EXCEEDED: 'deadline-exceeded',

  // Functions errors
  UNAUTHENTICATED: 'unauthenticated',
  INVALID_ARGUMENT: 'invalid-argument',
  FAILED_PRECONDITION: 'failed-precondition',
  ABORTED: 'aborted',
  OUT_OF_RANGE: 'out-of-range',
  UNIMPLEMENTED: 'unimplemented',
  INTERNAL: 'internal',
  DATA_LOSS: 'data-loss',
} as const;

export type FirebaseErrorCode = typeof FIREBASE_ERROR_CODES[keyof typeof FIREBASE_ERROR_CODES];
