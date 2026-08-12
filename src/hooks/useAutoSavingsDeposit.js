// src/hooks/useAutoSavingsDeposit.js
// 적금 일일 자동 납입 hook (글로벌)
// AlchanLayout에서 호출 — 학생이 어떤 페이지에 있든 진입/복귀 시 자동 처리
//
// 가입일 기준으로 경과한 일수만큼 dailyAmount를 학생→선생님으로 이체하고
// depositsCount / totalDeposited 갱신. 만기 도달 후에는 useAutoDepositMature가 처리.
//
// 멱등성: 트랜잭션에서 product의 depositsCount를 읽고 필요한 만큼만 추가 납입.
// 학생 잔액 부족 시 그 회차에 대해 자동 납입 중단 (다음 진입 시 재시도).

import { useEffect, useRef } from "react";
import { functions, httpsCallable } from "../firebase";
import { startOfDay, differenceInCalendarDays } from "date-fns";
import { logger } from "../utils/logger";

const toDate = (v) => {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  return new Date(v);
};

/**
 * @param {Array|null} products `useStudentProducts` 가 읽어 온 상품 전량(형제 훅과 공유).
 *   null 이면 아직 안 읽은 것. 자세한 사정은 useStudentProducts.js 헤더 참조.
 */
export const useAutoSavingsDeposit = (
  userDoc,
  refreshUserDocument,
  products,
) => {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!userDoc?.uid) return;
    if (userDoc.isAdmin || userDoc.isSuperAdmin || userDoc.isTeacher) return;
    if (!products) return;

    let cancelled = false;

    const checkAndDeposit = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const savings = products.filter((p) => p.type === "savings");
        if (cancelled || savings.length === 0) return;

        const today = startOfDay(new Date());

        for (const data of savings) {
          if (cancelled) break;
          const dailyAmount = Number(data.dailyAmount || 0);
          const termInDays = Number(data.termInDays || 0);
          if (dailyAmount <= 0 || termInDays <= 0) continue;

          const startDate = toDate(data.startDate);
          if (!startDate) continue;

          // 가입일부터 오늘까지의 경과일 = 납입해야 할 누적 횟수
          // 가입 당일이 1회차 (가입 시 즉시 1회 납입됨)
          const daysSinceStart = differenceInCalendarDays(today, startOfDay(startDate));
          const expectedDeposits = Math.min(
            Math.max(1, daysSinceStart + 1),
            termInDays,
          );
          const currentDeposits = Number(data.depositsCount || 0);

          // 사전필터: 오늘치까지 이미 납입됐으면 CF 호출 스킵(불필요 호출 절감). 서버 CF가 최종 판정.
          if (expectedDeposits <= currentDeposits) continue;

          // 🔒 적금 자동 납입(본인·교사 cash 이동·depositsCount 갱신)을 autoSavingsDeposit CF로 처리.
          //   구 클라 runTransaction은 본인·교사 cash 직접 write라 batch6 rules 잠금 대상 → CF 이관.
          //   이자·회차 catch-up·teacherId(누락 시 findApprovedAdminSnap 폴백)·잔액한도·활동로그 전부 서버.
          //   멱등키 불필요: CF가 트랜잭션 내 depositsCount 재읽어 expected 이내로만 납입(이중납입 차단).
          try {
            const depositFn = httpsCallable(functions, "autoSavingsDeposit");
            const res = await depositFn({ productId: data.id });
            const added = res?.data?.added || 0;
            if (added > 0) {
              logger.log(
                `[자동 적금 납입] ${data.name}: ${added}회차 서버 CF 처리 완료`,
              );
            }
          } catch (err) {
            logger.error(`[자동 적금 납입] ${data.name} CF 실패:`, err);
          }
        }

        if (refreshUserDocument && !cancelled) {
          await refreshUserDocument();
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    // 상품 목록이 새로 들어올 때마다 체크. "다음 날 진입" 재체크는 useStudentProducts 가
    // 날짜가 실제로 바뀐 경우에만 다시 읽어 주는 것으로 대신한다.
    checkAndDeposit();

    return () => {
      cancelled = true;
    };
  }, [
    products,
    userDoc?.uid,
    userDoc?.isAdmin,
    userDoc?.isSuperAdmin,
    userDoc?.isTeacher,
    refreshUserDocument,
  ]);
};
