// src/services/optimizedFirebaseService.js
// Firebase 사용량 최적화를 위한 서비스

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

// Firebase Functions 래퍼
const createOptimizedFunction = (functionName) => {
  const fn = httpsCallable(functions, functionName);

  return async (data) => {
    try {
      const result = await fn(data);
      if (result.data.success) {
        return result.data;
      } else {
        throw new Error(result.data.message || "함수 실행 실패");
      }
    } catch (error) {
      console.error(`${functionName} 오류:`, error);
      throw error;
    }
  };
};

// 최적화된 Firebase Functions
export const optimizedFirebaseService = {
  // 관리자 설정 데이터 통합 조회 (캐시 포함)
  getAdminSettingsData: createOptimizedFunction("getAdminSettingsData"),

  // 배치 급여 지급
  batchPaySalaries: createOptimizedFunction("batchPaySalaries"),

  // 기존 ItemContext 데이터 (이미 최적화됨)
  getItemContextData: createOptimizedFunction("getItemContextData"),
};

// React Query 키 팩토리
export const queryKeys = {
  // 관리자 설정 관련
  adminSettings: (classCode, tab) => ["adminSettings", classCode, tab],

  // 학생 관리 관련
  students: (classCode) => ["students", classCode],

  // 급여 설정 관련
  salarySettings: (classCode) => ["salarySettings", classCode],

  // 시스템 관리 관련 (최고 관리자)
  systemManagement: () => ["systemManagement"],

  // 일반 설정 관련
  generalSettings: (classCode) => ["generalSettings", classCode],
};

// 배치 연산 헬퍼
export const batchOperations = {
  // 여러 학생의 직업을 한 번에 업데이트
  updateMultipleStudentJobs: async (updates) => {
    // 실제 구현 시 Firebase Function으로 배치 처리
    console.log("배치 직업 업데이트:", updates);
  },

  // 여러 설정을 한 번에 저장
  saveMultipleSettings: async (settings) => {
    // 실제 구현 시 Firebase Function으로 배치 처리
    console.log("배치 설정 저장:", settings);
  },
};

// 실시간 최적화 헬퍼
export const realtimeOptimizer = {
  // 연결 상태에 따른 전략 조정
  shouldUseRealtime: () => {
    return navigator.onLine && !document.hidden;
  },

  // 데이터 크기에 따른 전략 조정
  getOptimalCacheTime: (dataSize) => {
    if (dataSize < 1000) return 10 * 60 * 1000; // 10분
    if (dataSize < 5000) return 5 * 60 * 1000;  // 5분
    return 2 * 60 * 1000; // 2분
  },
};

// 로컬 스토리지 백업 (오프라인 대응)
export const localBackup = {
  save: (key, data) => {
    try {
      localStorage.setItem(`backup_${key}`, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.warn("로컬 백업 저장 실패:", error);
    }
  },

  load: (key, maxAge = 60000) => { // 기본 1분
    try {
      const backup = localStorage.getItem(`backup_${key}`);
      if (backup) {
        const parsed = JSON.parse(backup);
        if (Date.now() - parsed.timestamp < maxAge) {
          return parsed.data;
        }
      }
    } catch (error) {
      console.warn("로컬 백업 로드 실패:", error);
    }
    return null;
  },

  clear: (key) => {
    try {
      localStorage.removeItem(`backup_${key}`);
    } catch (error) {
      console.warn("로컬 백업 삭제 실패:", error);
    }
  },
};