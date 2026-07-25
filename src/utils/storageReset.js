// src/utils/storageReset.js
// localStorage 전체 삭제 시 "지우면 안 되는 키"를 보존하는 공용 유틸.
//
// 배경(2회 사고): 캐시 초기화가 게시판 작성 중 글과 '사용 중 아이템 5분 표시'를 함께 날려버림.
// App.js(에러 복구)와 쿠폰 목표 페이지(사용자 버튼)가 각자 localStorage.clear()를 호출하고 있어
// 한쪽만 고치면 다른 쪽에서 그대로 재발한다 → 보존 목록을 여기 한 곳에만 둔다.

/** 삭제에서 제외할 키 접두사 */
export const PRESERVED_KEY_PREFIXES = [
  "alchan_lb_draft_", // 학습 게시판 작성 중 글(임시저장)
  "recentlyUsedItems_", // 사용 중 아이템 5분 타이머 표시(기기 로컬 전용 상태)
];

const isPreserved = (key) =>
  typeof key === "string" &&
  PRESERVED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

/**
 * 보존 키를 남기고 localStorage를 비운다.
 * @returns {number} 보존된 키 개수
 */
export const clearLocalStoragePreserving = () => {
  try {
    const preserved = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isPreserved(key)) {
        preserved.push([key, localStorage.getItem(key)]);
      }
    }
    localStorage.clear();
    preserved.forEach(([key, value]) => {
      if (value != null) localStorage.setItem(key, value);
    });
    return preserved.length;
  } catch (_) {
    // 보존 로직이 실패해도 초기화 자체는 수행(복구 경로가 막히면 안 됨)
    try {
      localStorage.clear();
    } catch (__) {
      /* noop */
    }
    return 0;
  }
};

export default clearLocalStoragePreserving;
