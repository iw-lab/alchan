// src/hooks/useOptimizedAdminData.js
// Firebase 사용량 최적화를 위한 커스텀 훅

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { logger } from "../utils/logger";
import { optimizedFirebaseService, queryKeys, localBackup } from "../services/optimizedFirebaseService";


// 배치 급여 지급 뮤테이션
export const useBatchPaySalaries = () => {
  const queryClient = useQueryClient();
  const { userDoc } = useAuth();
  const classCode = userDoc?.classCode;

  return useMutation({
    // confirmDuplicate: "이미 이번 주에 줬다"는 서버 경고를 교사가 보고 승인한 경우에만 true.
    //   ⚠️ 여기 인자 목록에서 빠뜨리면 조용히 사라져 서버가 영원히 다시 물어본다
    //      (구조분해라 타입 오류도 안 난다).
    mutationFn: async ({ studentIds, payAll, confirmDuplicate, idempotencyKey }) => {
      return await optimizedFirebaseService.batchPaySalaries({
        studentIds,
        payAll,
        confirmDuplicate,
        idempotencyKey,
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
      logger.error("급여 지급 실패:", error);
    },
  });
};


