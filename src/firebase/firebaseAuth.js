// src/firebase/firebaseAuth.js - 인증 관련 함수

import {
  onAuthStateChanged,
  signInWithEmailAndPassword as fbSignInInternal,
  signOut as fbSignOutInternal,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPasswordInternal,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebaseConfig";
import { invalidateCache, invalidateCachePattern } from "./firebaseUtils";

import { logger } from "../utils/logger";
export const authStateListener = (callback) => {
  if (!auth) {
    console.error("[firebase.js] Auth 서비스가 초기화되지 않았습니다.");
    setTimeout(() => callback(null), 0);
    return () => {};
  }
  logger.log("[firebase.js] Auth 상태 리스너 등록");
  return onAuthStateChanged(auth, (user) => {
    logger.log(
      "[firebase.js] Auth 상태 변경:",
      user ? `로그인됨 (${user.uid})` : "로그아웃됨"
    );
    callback(user);
  });
};

export const signInWithEmailAndPassword = async (authInstance, email, password) => {
  if (!authInstance) throw new Error("Auth 서비스가 초기화되지 않았습니다.");
  if (typeof email !== "string")
    throw new Error("이메일 형식이 올바르지 않습니다.");
  return fbSignInInternal(authInstance, email, password);
};

export const signOut = async () => {
  if (!auth) throw new Error("Auth 서비스가 초기화되지 않았습니다.");

  invalidateCachePattern('user_');
  invalidateCache('users_all');
  invalidateCachePattern('classmates_');

  return fbSignOutInternal(auth);
};

export const registerWithEmailAndPassword = async (authInstance, email, password) => {
  if (!authInstance) throw new Error("Auth 서비스가 초기화되지 않았습니다.");
  if (typeof email !== "string")
    throw new Error("이메일 형식이 올바르지 않습니다.");
  return fbCreateUserWithEmailAndPasswordInternal(authInstance, email, password);
};

export const updateUserProfile = async (user, displayName) => {
  if (!user) throw new Error("사용자 객체가 없습니다.");
  return updateProfile(user, { displayName });
};
