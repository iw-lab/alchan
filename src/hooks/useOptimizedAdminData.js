// src/hooks/useOptimizedAdminData.js
// Firebase 사용량 최적화를 위한 커스텀 훅

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../utils/logger";
import {
  optimizedFirebaseService,
  queryKeys,
  localBackup,
  realtimeOptimizer,
} from "../services/optimizedFirebaseService";

// 관리자 설정 데이터 훅 (통합 최적화)
export const useOptimizedAdminSettings = (tab) => {
  const { userDoc, isAdmin } = useAuth();
  const classCode = userDoc?.classCode;

  return useQuery({
    queryKey: queryKeys.adminSettings(classCode, tab),
    queryFn: async () => {
      // 로컬 백업 먼저 확인 (오프라인 대응)
      const backupKey = `admin_${classCode}_${tab}`;
      const backup = localBackup.load(backupKey, 30000); // 30초

      if (backup && !navigator.onLine) {
        return backup;
      }

      const data = await optimizedFirebaseService.getAdminSettingsData({ tab });

      // 로컬 백업 저장
      localBackup.save(backupKey, data);

      return data;
    },
    enabled: !!(isAdmin?.() && classCode && tab),
    staleTime: 5 * 60 * 1000, // 5분
    cacheTime: 10 * 60 * 1000, // 10분
    retry: (failureCount, error) => {
      if (error?.code === 'permission-denied') return false;
      return failureCount < 2;
    },
    // 네트워크 상태에 따른 최적화
    refetchInterval: realtimeOptimizer.shouldUseRealtime() ? 5 * 60 * 1000 : false,
  });
};

// 학생 데이터 훅 (배치 최적화)
export const useOptimizedStudents = () => {
  const { userDoc, isAdmin, isSuperAdmin } = useAuth();
  const classCode = userDoc?.classCode;

  return useQuery({
    queryKey: queryKeys.students(classCode),
    queryFn: async () => {
      const data = await optimizedFirebaseService.getAdminSettingsData({
        tab: "studentManagement"
      });
      return data.data;
    },
    enabled: !!(isAdmin?.() && classCode),
    staleTime: 3 * 60 * 1000, // 3분 (학생 데이터는 더 자주 변경)
    cacheTime: 8 * 60 * 1000,
  });
};

// 급여 설정 훅
export const useOptimizedSalarySettings = () => {
  const { userDoc, isAdmin } = useAuth();
  const classCode = userDoc?.classCode;

  return useQuery({
    queryKey: queryKeys.salarySettings(classCode),
    queryFn: async () => {
      const data = await optimizedFirebaseService.getAdminSettingsData({
        tab: "salarySettings"
      });
      return data.data;
    },
    enabled: !!(isAdmin?.() && classCode),
    staleTime: 10 * 60 * 1000, // 10분 (설정은 덜 자주 변경)
    cacheTime: 15 * 60 * 1000,
  });
};

// 시스템 관리 데이터 훅 (최고 관리자 전용)
export const useOptimizedSystemManagement = () => {
  const { isSuperAdmin } = useAuth();

  return useQuery({
    queryKey: queryKeys.systemManagement(),
    queryFn: async () => {
      const data = await optimizedFirebaseService.getAdminSettingsData({
        tab: "systemManagement"
      });
      return data.data;
    },
    enabled: !!(isSuperAdmin?.()),
    staleTime: 15 * 60 * 1000, // 15분 (시스템 데이터는 가장 덜 자주 변경)
    cacheTime: 20 * 60 * 1000,
  });
};

// 배치 급여 지급 뮤테이션
export const useBatchPaySalaries = () => {
  const queryClient = useQueryClient();
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  return useMutation({
    mutationFn: async ({ studentIds, payAll }) => {
      return await optimizedFirebaseService.batchPaySalaries({
        studentIds,
        payAll,
      });
    },
    onSuccess: () => {
      // 관련 캐시 무효화
      queryClient.invalidateQueries({
        queryKey: queryKeys.students(classCode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salarySettings(classCode),
      });

      // 로컬 백업 클리어
      localBackup.clear(`admin_${classCode}_studentManagement`);
      localBackup.clear(`admin_${classCode}_salarySettings`);
    },
    onError: (error) => {
      console.error("급여 지급 실패:", error);
    },
  });
};

// 설정 저장 뮤테이션 (통합)
export const useOptimizedSettingsSave = () => {
  const queryClient = useQueryClient();
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  return useMutation({
    mutationFn: async ({ type, data }) => {
      // 향후 Firebase Function으로 통합 예정
      logger.log("설정 저장:", type, data);
      return { success: true };
    },
    onSuccess: (data, variables) => {
      const { type } = variables;

      // 타입별 캐시 무효화
      switch (type) {
        case "general":
          queryClient.invalidateQueries({
            queryKey: queryKeys.generalSettings(classCode),
          });
          break;
        case "salary":
          queryClient.invalidateQueries({
            queryKey: queryKeys.salarySettings(classCode),
          });
          break;
        case "student":
          queryClient.invalidateQueries({
            queryKey: queryKeys.students(classCode),
          });
          break;
        default:
          // 전체 관리자 설정 무효화
          queryClient.invalidateQueries({
            queryKey: ["adminSettings", classCode],
          });
      }

      // 관련 로컬 백업 클리어
      localBackup.clear(`admin_${classCode}_${type}`);
    },
  });
};

// 데이터 프리로딩 훅
export const useAdminDataPreloader = () => {
  const queryClient = useQueryClient();
  const { userDoc, isAdmin } = useAuth();
  const classCode = userDoc?.classCode;

  const preloadAdminData = async () => {
    if (!isAdmin?.() || !classCode) return;

    // 가장 자주 사용되는 탭들을 미리 로드
    const commonTabs = ["generalSettings", "studentManagement", "salarySettings"];

    const preloadPromises = commonTabs.map(tab =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.adminSettings(classCode, tab),
        queryFn: async () => {
          const data = await optimizedFirebaseService.getAdminSettingsData({ tab });
          return data;
        },
        staleTime: 5 * 60 * 1000,
      })
    );

    await Promise.allSettled(preloadPromises);
  };

  return { preloadAdminData };
};

// 네트워크 상태 최적화 훅
export const useNetworkOptimization = () => {
  const queryClient = useQueryClient();

  const optimizeForNetwork = () => {
    if (!navigator.onLine) {
      // 오프라인 시 모든 쿼리 비활성화
      queryClient.setDefaultOptions({
        queries: {
          enabled: false,
          retry: false,
        },
      });
    } else {
      // 온라인 복귀 시 설정 복원
      queryClient.setDefaultOptions({
        queries: {
          enabled: true,
          retry: 2,
        },
      });

      // 캐시된 데이터 재검증
      queryClient.refetchQueries({ stale: true });
    }
  };

  return { optimizeForNetwork };
};