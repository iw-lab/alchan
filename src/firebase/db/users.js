// src/firebase/db/users.js - 사용자 문서 CRUD 및 활동 로그

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  serverTimestamp,
  getDocFromCache,
  getDocsFromCache,
} from "firebase/firestore";
import { addDoc as originalFirebaseAddDoc } from "firebase/firestore";
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
// 활동 로그 & 거래 기록
// =================================================================
export const addActivityLog = async (userId, type, description) => {
  if (!db || !userId) {
    logger.error("활동 로그 기록 실패: 필수 정보 부족(db, userId)", { userId, type, description });
    return;
  }
  try {
    const userDoc = await getUserDocument(userId);
    if (!userDoc) {
      logger.error(`활동 로그 기록 실패: 사용자 문서(${userId})를 찾을 수 없습니다.`);
      return;
    }
    if (!userDoc.classCode || userDoc.classCode === '미지정') {
      return;
    }
    const logsCollectionRef = collection(db, "activity_logs");
    await originalFirebaseAddDoc(logsCollectionRef, {
      type: type,
      description: description,
      userId: userId,
      userName: userDoc.name || userDoc.nickname || "N/A",
      classCode: userDoc.classCode,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    logger.error("활동 로그 기록 중 오류 발생:", error);
  }
};

export const addTransaction = async (userId, amount, description) => {
  if (!db || !userId) {
    logger.error("거래 기록 실패: 필수 정보 부족 (db, userId)");
    return false;
  }
  try {
    const txCollectionRef = collection(db, "users", userId, "transactions");
    await originalFirebaseAddDoc(txCollectionRef, {
      amount: amount,
      description: description,
      timestamp: serverTimestamp(),
    });
    return true;
  } catch (error) {
    logger.error(`[Transaction] 사용자(${userId}) 거래 기록 중 오류 발생:`, error);
    return false;
  }
};

// =================================================================
// 사용자 문서 CRUD
// =================================================================
export const getUserDocument = async (userId, forceRefresh = false, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) return null;
  const cacheKey = `user_${userId}`;
  if (!forceRefresh) {
    const cachedUser = getCache(cacheKey, tab);
    if (cachedUser) return cachedUser;
  }
  try {
    const userRef = doc(db, "users", userId);
    let userSnap;
    let source = 'server';
    if (forceRefresh) {
      userSnap = await getDoc(userRef);
      source = 'server(force)';
    } else {
      try {
        userSnap = await getDocFromCache(userRef);
        source = 'firestore-cache';
      } catch {
        userSnap = await getDoc(userRef);
        source = 'server';
      }
    }
    logDbOperation('READ', 'users', userId, { tab, extra: `getUserDocument(${source})` });
    const result = userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
    if (result) {
      setCache(cacheKey, result);
    }
    return result;
  } catch (error) {
    logger.error(`[firebase.js] getUserDocument(${userId}) 오류:`, error);
    throw error;
  }
};

export const addUserDocument = async (userId, userData) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId || !userData)
    throw new Error("사용자 ID 또는 데이터가 유효하지 않습니다.");
  try {
    const cleanedUserData = { ...userData };
    Object.keys(cleanedUserData).forEach(
      (key) => cleanedUserData[key] === undefined && delete cleanedUserData[key]
    );
    const userRef = doc(db, "users", userId);
    await setDoc(userRef, {
      ...cleanedUserData,
      createdAt: cleanedUserData.createdAt || serverTimestamp(),
      updatedAt: cleanedUserData.updatedAt || serverTimestamp(),
    });
    invalidateCache(`user_${userId}`);
    invalidateCache('users_all');
    if (cleanedUserData.classCode) {
      invalidateCache(`classmates_${cleanedUserData.classCode}`);
    }
    await addActivityLog(userId, '시스템', '신규 사용자 계정이 생성되었습니다.');
    return true;
  } catch (error) {
    logger.error(`[firebase.js] 사용자 문서 추가 실패: ${userId}`, error);
    throw error;
  }
};

export const updateUserDocument = async (userId, updates, maxRetries = 3, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId || !updates || Object.keys(updates).length === 0) return false;

  const updateKeys = Object.keys(updates);
  const isOnlyTimestamp = updateKeys.every(key =>
    key === 'lastLoginAt' || key === 'lastActiveAt'
  );
  if (!isOnlyTimestamp) {
    invalidateCache(`user_${userId}`);
    invalidateCache('users_all');
    if (updates.classCode) {
      invalidateCachePattern('classmates_');
    }
  }

  let attempt = 0;
  let lastError = null;
  while (attempt < maxRetries) {
    attempt++;
    try {
      const cleanedUpdates = { ...updates };
      Object.keys(cleanedUpdates).forEach(
        (key) => cleanedUpdates[key] === undefined && delete cleanedUpdates[key]
      );
      if (Object.keys(cleanedUpdates).length === 0) return false;

      const userRef = doc(db, "users", userId);
      const finalUpdates = { ...cleanedUpdates, updatedAt: serverTimestamp() };
      logDbOperation('UPDATE', 'users', userId, { tab, extra: Object.keys(cleanedUpdates).join(',') });

      const updatePromise = updateDoc(userRef, finalUpdates);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("업데이트 타임아웃 (10초)")), 10000)
      );
      await Promise.race([updatePromise, timeoutPromise]);

      if (updates.name || updates.nickname) {
        await addActivityLog(userId, '프로필 변경', `프로필 정보가 업데이트되었습니다.`);
      }
      return true;
    } catch (error) {
      lastError = error;
      if (error.code === 'unavailable') {
        throw new Error("서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.");
      } else if (error.code === 'permission-denied') {
        throw new Error("권한이 없습니다. 다시 로그인해주세요.");
      } else if (error.code === 'unauthenticated') {
        throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
      }

      const retryableErrors = ["unavailable", "deadline-exceeded", "aborted", "internal", "resource-exhausted", "업데이트 타임아웃"];
      const isRetryableError = retryableErrors.some(
        (retryableError) => error.code === retryableError || error.message.includes(retryableError)
      );
      if (!isRetryableError) break;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("알 수 없는 오류로 업데이트 실패");
};

export const deleteUserDocument = async (userId) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!userId) return Promise.reject(new Error("사용자 ID가 필요합니다."));
  invalidateCache(`user_${userId}`);
  invalidateCache('users_all');
  invalidateCachePattern('classmates_');
  await addActivityLog(userId, '계정 삭제', '사용자 계정 및 데이터가 삭제되었습니다.');
  const userDocRef = doc(db, "users", userId);
  return deleteDoc(userDocRef);
};

export const getAllUsersDocuments = async (useCache = true) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  const cacheKey = 'users_all';
  if (useCache) {
    const cached = getCache(cacheKey);
    if (cached) {
      return cached;
    }
  }
  try {
    const usersCollectionRef = collection(db, "users");
    let usersSnapshot;
    try {
      usersSnapshot = await getDocsFromCache(usersCollectionRef);
    } catch {
      usersSnapshot = await getDocs(usersCollectionRef);
    }
    const result = usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (useCache) {
      setCache(cacheKey, result);
    }
    return result;
  } catch (error) {
    logger.error("[firebase.js] getAllUsersDocuments 오류:", error);
    throw error;
  }
};

// =================================================================
// 활동 로그 조회
// =================================================================
export const getActivityLogs = async (classCode, limit = 50, useCache = false, tab = 'unknown') => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode) throw new Error("학급 코드가 필요합니다.");

  const { query, where } = await import("firebase/firestore");
  const { globalCacheService } = await import("../firebaseUtils");

  const cacheKey = `activity_logs_${classCode}_${limit}`;
  if (useCache) {
    const cached = getCache(cacheKey, tab);
    if (cached) return cached;
  }
  try {
    const logsRef = collection(db, "activity_logs");
    const q = query(logsRef, where("classCode", "==", classCode));
    const logsSnapshot = await getDocs(q);
    let logs = logsSnapshot.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp };
    });
    logDbOperation('READ', 'activity_logs', null, { tab, extra: `${classCode}: ${logsSnapshot.docs.length}개` });
    logs.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
    if (limit > 0) logs = logs.slice(0, limit);
    if (useCache) {
      globalCacheService.set(`fb_${cacheKey}`, logs, 5 * 60 * 1000);
    }
    return logs;
  } catch (error) {
    logger.error(`[firebase.js] 활동 로그 조회 오류 (학급: ${classCode}):`, error);
    return [];
  }
};
