// src/firebase/db/utils.js - 유틸리티 및 배치 함수

import {
  doc,
  getDoc,
  collection,
  enableNetwork,
  disableNetwork,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebaseConfig";
import {
  logDbOperation,
  setCache,
  getCache,
  CACHE_TTL,
} from "../firebaseUtils";

// =================================================================
// 배치 조회
// =================================================================
export const batchGetDocs = async (documentRefs, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!documentRefs || documentRefs.length === 0) return [];
  try {
    const chunks = [];
    const chunkSize = 500;
    for (let i = 0; i < documentRefs.length; i += chunkSize) {
      chunks.push(documentRefs.slice(i, i + chunkSize));
    }
    const allDocs = [];
    for (const chunk of chunks) {
      const docPromises = chunk.map(ref => getDoc(ref));
      const docs = await Promise.all(docPromises);
      allDocs.push(...docs);
    }
    logDbOperation('READ', 'batch', null, { tab, extra: `${allDocs.length}개 문서` });
    return allDocs;
  } catch (error) {
    console.error('[firebase.js] 배치 읽기 오류:', error);
    throw error;
  }
};

export const batchGetUsers = async (userIds, useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userIds || userIds.length === 0) return [];
  const cacheKey = `batch_users_${userIds.sort().join('_')}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const userRefs = userIds.map(uid => doc(db, 'users', uid));
    const userDocs = await batchGetDocs(userRefs, tab);
    const users = userDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
    if (useCache) setCache(cacheKey, users);
    return users;
  } catch (error) {
    console.error('[firebase.js] 배치 사용자 조회 오류:', error);
    throw error;
  }
};

// =================================================================
// 네트워크/캐시 유틸리티
// =================================================================
export const goOffline = () => disableNetwork(db);
export const goOnline = () => enableNetwork(db);

export const getCachedDocument = async (collectionName, docId, ttl = CACHE_TTL) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다");
  if (!collectionName || !docId) return null;
  const cacheKey = `doc_${collectionName}_${docId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const ref = doc(db, collectionName, docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = { id: snap.id, ...snap.data() };
  setCache(cacheKey, data);
  return data;
};

// =================================================================
// Cloud Functions
// =================================================================
export const processSettlement = async (settlementData) => {
  if (!functions) throw new Error("Firebase Functions가 초기화되지 않았습니다.");
  const processSettlementFunction = httpsCallable(functions, 'processSettlement');
  try {
    const result = await processSettlementFunction(settlementData);
    return result.data;
  } catch (error) {
    console.error("[firebase.js] processSettlement Cloud Function 호출 오류:", error);
    throw new Error(error.message || "서버 함수 호출에 실패했습니다.");
  }
};

// Firestore 초기화 여부 확인
export const isFirestoreInitialized = () => Boolean(db);
