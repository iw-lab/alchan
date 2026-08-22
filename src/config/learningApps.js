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

/**
 * 레지스트리 문서가 없을 때 쓰는 기본값 = 2026-08-17 시점의 하드코딩 목록.
 *
 * ⚠️ 2026-08-22: 구구성 수호대의 URL 을 `iw-lab.github.io` → `gugu-guardians.pages.dev`
 *    로 고쳤다. **교육청 네트워크가 github.io 를 통째로 막는다**(ERR_TIMED_OUT — 누구나
 *    올릴 수 있는 도메인이라 필터가 도메인 단위로 차단한 것으로 보인다). 앱 저장소는
 *    2026-08-21 에 Cloudflare Pages 로 옮겼는데 **알찬 쪽 주소가 그대로였다** — 학교에서
 *    누르면 아무것도 안 열리는 상태였다. 여긴 폴백일 뿐이고 정본은 `platformApps/_registry`
 *    와 `platformAppPolicies/{appId}.launchUrl` 이라 **셋을 같이** 고쳐야 한다.
 */
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
  { id: "siteGuguGuardians",     label: "구구성 수호대(구구단)",   icon: "Shield",     url: "https://gugu-guardians.pages.dev/" },
  // 레지스트리에만 있고 여기 없어서 **폴백이 낡아 있었다**(2026-08-22 씨앗 가드가 잡았다).
  // 레지스트리를 못 읽는 날엔 학생 사이드바에서 이 앱만 사라졌다.
  { id: "siteChromaFall",        label: "크로마폴(색채 퍼즐)",      icon: "Gamepad2",   url: "https://chromafall.pages.dev/" },
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
      // 🚪 AAP 이관 힌트. **권위가 아니다** — "토큰을 물어볼 가치가 있나"만 정한다.
      //    진짜 판정은 서버의 `platformAppPolicies.aapEnabled` 하나뿐이고, 이 값이
      //    틀려도 안전한 쪽으로 떨어진다(켜져 있는데 서버가 거부 → 그냥 링크로).
      //    ⚠️ 그래서 이관 스위치(`aap-switch.mjs migrate`)가 이 플래그를 **같이** 쓴다 —
      //       두 원장을 사람이 맞추게 두면 반드시 어긋난다(이 저장소의 반복 결함).
      aap: a.aap === true,
      parentId: LEARNING_SITES_CATEGORY_ID,
    });
    if (out.length >= MAX_APPS) break;
  }
  return out;
}

/**
 * 폴백(기본 목록)을 메뉴 아이템 형태로. 정규화 경로를 그대로 타서 두 경로가 어긋나지 않게 한다.
 *
 * 🔴 **`aapUnknown` 을 붙인다 — 이 목록은 이관 여부를 알 수가 없다.**
 *
 *    이관 여부의 진실은 Firestore(`platformAppPolicies.aapEnabled` → 레지스트리 `aap`)에
 *    있는데 이건 **코드**다. 여기 `aap: true` 를 박으면 낡은 배포가 거짓말을 하고,
 *    `false` 로 두면 **이관된 앱이 토큰 없이 열린다** — 학생은 문제를 풀고 기록·보상만
 *    조용히 실패한다(이 규약이 막으려던 바로 그 실패다).
 *
 *    폴백이 실제로 쓰이는 창은 좁지 않다(2026-08-22 Gemini 레인 발견 · 직접 확인):
 *      ① `AlchanSidebar.js` 의 **첫 페인트** — `useState(() => getLearningAppItems())` 는
 *         캐시가 없으면 폴백을 준다. 즉 **세션마다** 레지스트리가 도착하기 전 창이 열린다.
 *      ② 레지스트리 조회 실패(학교 와이파이 순단) → 그 세션 내내 폴백.
 *      ③ 문서가 비었을 때 → 폴백 + 빈 값이 12시간 세션 캐시에 남는다.
 *
 *    → 그래서 `false`(= 안 물어본다)가 아니라 **"모른다"** 라고 말한다. 모르면 서버에
 *      물어보고, 서버가 "이관 안 됐다"고 하면 그때 그냥 링크로 연다. 비용은 그 좁은
 *      창에서의 왕복 1회뿐이고, 대신 **조용한 실패가 구조적으로 불가능해진다.**
 */
export function defaultLearningAppItems() {
  return normalizeLearningApps(DEFAULT_LEARNING_APPS).map((item) => ({ ...item, aapUnknown: true }));
}
