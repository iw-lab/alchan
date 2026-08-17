// src/config/learningApps.js
// 🧩 학습 사이트(외부 앱) 목록 — 사이드바 하드코딩에서 분리한 데이터 레이어.
//
// 왜 분리했나
//   종전엔 AlchanSidebar.js 의 ALCHAN_MENU_ITEMS 안에 10개 앱이 통째로 박혀 있었다.
//   앱 하나 추가/이름 변경/URL 교체가 전부 **코드 수정 → 빌드 → 배포**였다.
//   이제 Firestore 문서 `platformApps/_registry` 하나를 고치면 된다.
//   ⚠️ 이 파일의 DEFAULT_LEARNING_APPS 는 **폴백**이다 — 레지스트리 문서가 없거나
//      읽기에 실패해도 사이드바가 지금과 똑같이 뜨도록 남겨둔 안전망이지, 죽은 코드가 아니다.
//
// 아이콘을 문자열로 두는 이유
//   Firestore 에는 React 컴포넌트를 넣을 수 없다. 레지스트리는 아이콘 '이름'만 담고
//   여기서 컴포넌트로 매핑한다. 모르는 이름이면 Globe 로 떨어진다(렌더 실패 없음).

import {
  Globe, Palette, Send, Calculator, Grid3x3, Keyboard,
  BookOpen, Gamepad2, Sparkles, Castle, Shield,
} from "lucide-react";

export const LEARNING_APP_ICONS = {
  Globe, Palette, Send, Calculator, Grid3x3, Keyboard,
  BookOpen, Gamepad2, Sparkles, Castle, Shield,
};

export const LEARNING_SITES_CATEGORY_ID = "learningSitesCategory";

/** 레지스트리 문서가 없을 때 쓰는 기본값 = 2026-08-17 시점의 하드코딩 목록 그대로. */
export const DEFAULT_LEARNING_APPS = [
  { id: "siteArtOn",             label: "미술아트온",             icon: "Palette",    url: "https://arton.simssijjang.workers.dev/coloring" },
  { id: "siteNarae",             label: "종이하늘",               icon: "Send",       url: "https://papersky.pages.dev/" },
  { id: "siteSeulgisem",         label: "슬기셈(수학)",           icon: "Calculator", url: "https://word-e329c.web.app" },
  { id: "siteNumeroQuest",       label: "칸채움",                 icon: "Grid3x3",    url: "https://numero-quest.pages.dev" },
  { id: "siteTypingverse",       label: "타이핑버스",             icon: "Keyboard",   url: "https://typingverse.pages.dev" },
  { id: "siteEchoTale",          label: "에코테일(영어)",         icon: "BookOpen",   url: "https://echotale.simssijjang-d79.workers.dev/" },
  { id: "siteVocawormDefense",   label: "보카웜 디펜스(영어단어)", icon: "Gamepad2",   url: "https://vocaworm-defense.vercel.app/" },
  { id: "siteAraharu",           label: "아라하루(아침학습)",      icon: "Sparkles",   url: "https://araharu-ecp.pages.dev/" },
  { id: "siteMathCastle",        label: "수학성 수호자(수학)",     icon: "Castle",     url: "https://mathcastle.pages.dev/" },
  { id: "siteGuguGuardians",     label: "구구성 수호대(구구단)",   icon: "Shield",     url: "https://iw-lab.github.io/gugu-guardians/" },
];

const MAX_APPS = 60;          // 레지스트리 오염 시 사이드바가 무한히 길어지는 것 방지
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 레지스트리 원본(Firestore 배열)을 사이드바 메뉴 아이템으로 정규화한다.
 * 검증에 걸린 항목은 **조용히 버린다** — 한 줄 오타가 사이드바 전체를 날리면 안 된다.
 *
 * ⚠️ URL 은 https 만 허용한다. javascript: / data: 스킴이 들어오면 클릭 한 번이
 *    스크립트 실행이 된다(레지스트리는 슈퍼관리자만 쓰지만, 방어는 읽는 쪽에도 둔다).
 */
export function normalizeLearningApps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const { id, label, url } = a;
    if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id)) continue;
    if (typeof label !== "string" || !label.trim() || label.length > 60) continue;
    if (typeof url !== "string") continue;
    let parsed;
    try { parsed = new URL(url); } catch { continue; }
    if (parsed.protocol !== "https:") continue;
    if (a.enabled === false) continue;
    seen.add(id);
    out.push({
      id,
      label: label.trim(),
      icon: LEARNING_APP_ICONS[a.icon] || Globe,
      externalUrl: parsed.href,
      parentId: LEARNING_SITES_CATEGORY_ID,
    });
    if (out.length >= MAX_APPS) break;
  }
  return out;
}

/** 폴백(기본 목록)을 메뉴 아이템 형태로. 정규화 경로를 그대로 타서 두 경로가 어긋나지 않게 한다. */
export function defaultLearningAppItems() {
  return normalizeLearningApps(DEFAULT_LEARNING_APPS);
}
