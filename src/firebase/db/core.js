// src/firebase/db/core.js - 기본 CRUD 및 캐시 함수

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
  query as originalFirebaseQuery,
  where as originalFirebaseWhere,
  addDoc as originalFirebaseAddDoc,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { logger } from '../../utils/logger';
import {
  logDbOperation,
  setCache,
  getCache,
  invalidateCache,
  invalidateCachePattern,
} from "../firebaseUtils";

// =================================================================
// 학급 관리자 uid 조회 헬퍼
// =================================================================
export const getClassAdminUid = async (classCode) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const cacheKey = `admin_uid_${classCode}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const usersQuery = originalFirebaseQuery(
      collection(db, "users"),
      originalFirebaseWhere("classCode", "==", classCode),
      originalFirebaseWhere("isAdmin", "==", true)
    );
    const querySnapshot = await getDocs(usersQuery);

    if (querySnapshot.empty) {
      logger.warn(`[firebase.js] 학급(${classCode})에 관리자가 없습니다.`);
      return null;
    }

    const adminUid = querySnapshot.docs[0].id;
    setCache(cacheKey, adminUid);
    return adminUid;
  } catch (error) {
    logger.error(`[firebase.js] 학급 관리자 조회 오류:`, error);
    return null;
  }
};

// =================================================================
// 캐시 우선 CRUD 함수들
// =================================================================
export const addData = (collectionName, data, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  invalidateCachePattern(collectionName);
  logDbOperation('WRITE', collectionName, null, { tab, extra: 'addData' });
  const dataWithTimestamp = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  return originalFirebaseAddDoc(collection(db, collectionName), dataWithTimestamp);
};

export const updateData = (collectionName, docId, updates, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (collectionName === 'users') {
    invalidateCache(`user_${docId}`);
    invalidateCache('users_all');
    invalidateCachePattern(`classmates_`);
  }
  if (collectionName === 'governmentSettings') {
    invalidateCache(`gov_settings_${docId}`);
  }
  invalidateCachePattern(collectionName);
  logDbOperation('UPDATE', collectionName, docId, { tab });
  const docRef = doc(db, collectionName, docId);
  const dataWithTimestamp = { ...updates, updatedAt: serverTimestamp() };
  return updateDoc(docRef, dataWithTimestamp);
};

export const deleteData = (collectionName, docId, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (collectionName === 'users') {
    invalidateCache(`user_${docId}`);
    invalidateCache('users_all');
    invalidateCachePattern(`classmates_`);
  }
  invalidateCachePattern(collectionName);
  logDbOperation('DELETE', collectionName, docId, { tab });
  const docRef = doc(db, collectionName, docId);
  return deleteDoc(docRef);
};

export const fetchCollectionOnce = async (collectionName, useCache = true, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  const cacheKey = `collection_${collectionName}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    const data = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    logDbOperation('READ', collectionName, null, { tab, extra: `${data.length}개 문서` });
    if (useCache) {
      setCache(cacheKey, data);
    }
    return data;
  } catch (error) {
    logger.error(`[firebase.js] ${collectionName} 컬렉션 조회 오류:`, error);
    throw error;
  }
};

export const subscribeToCollection = (collectionName, callback, conditions = [], tab = 'unknown') => {
  if (!db) {
    logger.error("Firestore가 초기화되지 않아 구독할 수 없습니다.");
    return () => {};
  }
  logDbOperation('SUBSCRIBE', collectionName, null, { tab, extra: '실시간 구독 시작' });
  let q = originalFirebaseQuery(collection(db, collectionName));
  conditions.forEach(condition => {
    q = originalFirebaseQuery(q, condition);
  });
  const unsubscribe = onSnapshot(q,
    { source: 'default' },
    (querySnapshot) => {
      const data = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCache(`collection_${collectionName}`, data);
      logDbOperation('READ', collectionName, null, { tab, extra: `onSnapshot: ${data.length}개` });
      callback(data);
    },
    (error) => {
      logger.error(`[firebase.js] ${collectionName} 구독 오류:`, error);
      callback([]);
    }
  );
  return unsubscribe;
};

// =================================================================
// 학급 구성원 조회
// =================================================================
export const getClassmates = async (classCode, forceRefresh = false, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode || classCode === '미지정') {
    logger.warn("[firebase.js] getClassmates: 유효하지 않은 학급 코드");
    return [];
  }
  const cacheKey = `classmates_${classCode}`;
  if (!forceRefresh) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const usersRef = collection(db, "users");
    const q = originalFirebaseQuery(usersRef, originalFirebaseWhere("classCode", "==", classCode));
    const querySnapshot = await getDocs(q);
    const classMembers = querySnapshot.docs.map(d => ({
      id: d.id,
      uid: d.id,
      ...d.data()
    }));
    logDbOperation('READ', 'users', null, { tab, extra: `getClassmates(${classCode}): ${classMembers.length}명` });
    setCache(cacheKey, classMembers);
    return classMembers;
  } catch (error) {
    logger.error(`[firebase.js] 학급 구성원 조회 오류 (${classCode}):`, error);
    throw error;
  }
};

// =================================================================
// 학급 코드 검증
// =================================================================
export const verifyClassCode = async (classCodeToVerify, maxRetries = 2) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCodeToVerify || typeof classCodeToVerify !== "string" || classCodeToVerify.trim() === "") {
    return false;
  }
  const trimmedCode = classCodeToVerify.trim();
  const cacheKey = `class_codes_valid_list`;
  const cachedCodes = getCache(cacheKey);
  if (cachedCodes && Array.isArray(cachedCodes)) {
    return cachedCodes.includes(trimmedCode);
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const classCodesSettingsRef = doc(db, "settings", "classCodes");
      const getDocPromise = getDoc(classCodesSettingsRef);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("문서 조회 타임아웃")), 8000)
      );
      const docSnap = await Promise.race([getDocPromise, timeoutPromise]);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const validCodesArray = data.validCodes;
        if (Array.isArray(validCodesArray)) {
          setCache(cacheKey, validCodesArray);
          return validCodesArray.includes(trimmedCode);
        }
        return false;
      } else {
        if (attempt === 1) {
          const defaultCodes = ["DEMO", "TEST", "CLASS1", "CLASS2", "SCHOOL01"];
          await setDoc(classCodesSettingsRef, { validCodes: defaultCodes, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          setCache(cacheKey, defaultCodes);
        }
      }
    } catch (error) {
      const retryableErrors = ["unavailable", "deadline-exceeded", "internal", "문서 조회 타임아웃"];
      const isRetryableError = retryableErrors.some(
        (retryableError) => error.code === retryableError || error.message.includes(retryableError)
      );
      if (!isRetryableError) break;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  return false;
};
