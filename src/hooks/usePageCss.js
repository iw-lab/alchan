// src/hooks/usePageCss.js
// 화면 전용 CSS 를 «그 화면이 떠 있는 동안만» 문서에 붙인다.
//
// 왜: lazy 화면이 import 한 CSS 는 한 번 실리면 **영영 남는다.** 26개 화면 CSS 에 같은 이름의 맨 클래스가
//   95개(.modal-overlay 7곳 · .form-group 9곳 …) 있어서, «주식 → 법원» 순서로 들어가면 법원이 주식 모양을 입었다.
//   주식 화면의 `* { box-sizing: inherit }` 는 앱 전체 상자 계산을 바꿔 사이드바까지 넓혔다(2026-11-25 실측:
//   288→290px, 메뉴 줄 44→66px). 화면을 떠날 때 떼면 «들어온 순서» 가 모양을 바꿀 수 없다.
//
// 쓰는 법:  import css from "./Court.css?inline";   usePageCss(css);
// 관문:     scripts/check-page-css.mjs (CI) — 화면 CSS 를 그냥 import 하거나 맨 요소 선택자를 쓰면 막는다.
import { useInsertionEffect } from "react";

const mounted = new Map(); // css 문자열 → { el, count }

export function acquirePageCss(css) {
  if (!css || typeof document === "undefined") return () => {};
  let entry = mounted.get(css);
  if (!entry) {
    const el = document.createElement("style");
    el.setAttribute("data-page-css", "");
    el.textContent = css;
    document.head.appendChild(el);
    entry = { el, count: 0 };
    mounted.set(css, entry);
  }
  entry.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.count -= 1;
    if (entry.count <= 0) {
      entry.el.remove();
      mounted.delete(css);
    }
  };
}

export function usePageCss(css) {
  // 레이아웃을 재기 전에 붙어야 깜빡임이 없다 → useInsertionEffect
  useInsertionEffect(() => acquirePageCss(css), [css]);
}
