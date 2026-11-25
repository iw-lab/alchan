// src/utils/viewport.js
// 화면 크기 분기 한 곳. tailwind 의 lg(1024px) 와 **같은 값**이어야 한다 —
// JS 는 768, CSS 는 lg 를 쓰던 때 768~1023(세로 태블릿)에서 사이드바가 화면 35% 를 차지했다(2026-11-25 실측).
//   1024 미만 = 폰·세로 태블릿 → 서랍 메뉴 + 하단 탭
//   1024 이상 = 가로 태블릿·PC → 왼쪽 사이드바
export const COMPACT_MAX = 1024;

export const isCompactViewport = () =>
  typeof window !== "undefined" && window.innerWidth < COMPACT_MAX;
