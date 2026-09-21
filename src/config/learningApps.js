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
  BookOpen, Gamepad2, Sparkles, Castle, Shield, Volleyball, KeyRound, SprayCan,
  Ticket, Hash, LandPlot, Dices, Brush, Swords, Music, Vote, Landmark, Fish, Sprout, PencilLine,
  Gem, Target, Zap, Flag, Camera, Wind, MountainSnow, CircleDot,
} from "lucide-react";

export const LEARNING_APP_ICONS = {
  Globe, Palette, Send, Calculator, Grid3x3, Keyboard,
  BookOpen, Gamepad2, Sparkles, Castle, Shield, Volleyball, KeyRound, SprayCan,
  Ticket, Hash, LandPlot, Dices, Brush, Swords, Music, Vote, Landmark, Fish, Sprout, PencilLine,
  Gem, Target, Zap, Flag, Camera, Wind, MountainSnow, CircleDot,
};

export const LEARNING_SITES_CATEGORY_ID = "learningSitesCategory";

/**
 * 🧑‍🏫 제작자 표시 이름이 없는 앱이 들어가는 묶음.
 *
 * 2026-08-27 이전에 등재된 앱들(기본 10여 개)에는 `owner` 필드가 없다. 그 앱들을
 * "선생님 미상" 같은 말로 묶으면 정상 상태가 결함처럼 보인다 — 원래 앱 만든 사람이
 * 만든 것들이고, 그게 사실이다. 슈퍼관리자가 레지스트리에 owner 를 넣으면 그때
 * 그 이름으로 옮겨간다.
 */
export const DEFAULT_APP_OWNER = "알찬 기본";

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
  { id: "siteKongkongVolley",    label: "콩콩배구",                icon: "Volleyball", url: "https://kongkong-volley.pages.dev/" },
  { id: "siteKeywordSchool",     label: "열쇠말 학교(방탈출)",     icon: "KeyRound",   url: "https://yeolsoemal-school.vercel.app/" },
  // 2026-08-30 추가. 물감 대항전 + 교과 문제(영어·수학·과학·사회) — 맞혀야 물감이 나온다.
  { id: "siteReloadArena",       label: "리로드 아레나(교과 대항전)", icon: "SprayCan",  url: "https://reload-arena.simssijjang-d79.workers.dev/" },
  // 2026-08-31 추가 — 킹수학 등재분 중 알찬에 없던 4개.
  // 넘버러시·한뼘 땅따먹기·한달음 윷놀이는 **전자칠판 핫시트**(한 기기를 4~6명이 교대)라
  // 개인 기기용 앱들과 성격이 다르다. 뽑기ON 은 교사가 쓰는 추첨 도구다.
  { id: "sitePickOn",            label: "뽑기ON(교실 추첨)",        icon: "Ticket",    url: "https://iwpick.pages.dev/" },
  { id: "siteNumRush",           label: "넘버러시(수 감각)",        icon: "Hash",      url: "https://numrush.vercel.app" },
  { id: "siteSpanLand",          label: "한뼘 땅따먹기(측정)",      icon: "LandPlot",  url: "https://spanland.vercel.app" },
  { id: "siteYutDash",           label: "한달음 윷놀이(자료·확률)", icon: "Dices",     url: "https://yutdash.vercel.app" },
  // 2026-09-02 추가 — 급수별 한자를 손으로 쓰며 익히는 앱(획순 채점).
  { id: "sitePilhan",            label: "필한(한자 급수)",          icon: "Brush",     url: "https://pilhan.pages.dev/" },
  { id: "siteBeatOn",            label: "비트:온(리듬 게임)",       icon: "Music",     url: "https://beaton-evo.pages.dev" },
  // 2026-09-02 추가 — 위에서 내려오는 적을 아래에서 막는 웨이브 디펜스.
  // 웨이브 사이·전투 중에 국어·수학·과학·사회 문항이 섞인다(122문항, 3~6학년). 계정·개인정보 없음.
  { id: "siteSkyGuard",          label: "하늘수비대(교과 디펜스)",  icon: "Swords",    url: "https://skyguard-bdk.pages.dev/" },
  // 2026-09-02 추가 — 교실 비밀 투표·개표 도구(한 기기를 돌려가며 찍는다).
  // 후보 투표(1인 1~2표)·찬반 투표, 학급 60명 / 전교 3,000명. 기록은 그 기기에만 남는다.
  { id: "siteClassVoteBox",      label: "우리 반 투표함(교실 투표)", icon: "Vote",     url: "https://class-vote-box.pages.dev/" },
  // 2026-09-06 추가 — 놀이공원을 짓고 굴리는 3D 경영 시뮬. 연구소 문제를 풀어야 시설이 열린다.
  // 학년·학기를 고르면 그 학기 교과 범위로만 출제된다(3-1~6-2, 36단원). 계정·개인정보 없음.
  { id: "siteLoopPark",          label: "루프 파크(놀이공원 경영)",  icon: "Ticket",   url: "https://loop-park.pages.dev/" },
  // 레지스트리에만 있고 폴백에 없어서 **또 어긋나 있었다**(2026-09-07 발견). 레지스트리를
  // 못 읽는 날엔 학생 사이드바에서 이 앱만 사라진다 — 2026-08-22 크로마폴과 같은 결함이다.
  { id: "siteOreudap",           label: "오르답(구구단·영단어)",    icon: "Calculator", url: "https://oreudap.vercel.app" },
  // 2026-09-07 추가 — 국사편찬위원회 «우리역사넷» 한국사 연대기를 분석해 만든 오리지널 문제은행.
  // 5,446문항(심화·기본), 학습·모의고사·게임·오답노트. 계정 없음, 기록은 그 기기에만.
  { id: "siteKoreaHis",          label: "한국사 문제은행(한국사)",  icon: "Landmark", url: "https://koreahis.vercel.app/" },
  // 2026-09-09 추가 — 찌를 기다리는 몇 초에 교과 문항 하나를 푸는 3D 낚시 게임.
  // 맞히면 황금미끼·물때가 올라 큰 물고기가 문다(오답 페널티 0). 3~6학년 5과목 2,491문항,
  // 어종 203종, 일일 랭킹. 계정·개인정보 없음.
  { id: "sitePongdangFishing",   label: "퐁당 낚시터(교과 통합)",   icon: "Fish",     url: "https://pongdang-fishing.pages.dev/" },
  // 2026-09-09 추가 — 점프 플랫포머. 스테이지 곳곳의 «지혜의 돌»에서 국어·수학·영어·과학
  //   4지선다가 나온다(1913문항). 타이틀에서 학년·학기 출제 범위를 고를 수 있고, 문제를
  //   안 풀어도 클리어된다(학습은 상으로만 작동). 계정·개인정보 없음.
  { id: "siteHopSquad",          label: "폴짝 원정대(교과 점프)",   icon: "Sprout",    url: "https://hop-squad-mu.vercel.app" },
  // 2026-09-14 추가 — 받아쓰기. 국어 537급 5,370문항 · 영어 229급 2,290문항이 음원까지
  //   내장이라 급수표를 안 만들어도 바로 된다. 자모/철자 채점, 칠판 모드, 인쇄물 5종.
  //   서버가 없어 아이 기록이 기기 밖으로 나가지 않는다. 계정·개인정보 없음.
  { id: "siteTtobagi",           label: "또박이(받아쓰기)",        icon: "PencilLine", url: "https://ttobagi.pages.dev/" },
  // 2026-09-14 추가 — 매치3 퍼즐. 조각을 맞추다 보면 4지선다가 끼어든다(수학 756 · 영어 413 ·
  //   국어 265 · 한국사 132 = 1,566문항). 첫 실행에 학년·학기를 고르면 그 학기까지 배운 것만
  //   나오고, 한국사는 5-2부터 열린다. 단계는 끝이 없다. 계정·개인정보 없음.
  { id: "sitePrismPop",          label: "프리즘 팝(매치3 학습)",    icon: "Gem",       url: "https://prism-pop.pages.dev/" },
  // 2026-09-17 추가 — 2.5D 야구. 타석·마운드 사이에 4지선다 3개가 끼어들고(판당 3문항),
  //   맞히면 집중 게이지·타구 위력이 오른다(오답 페널티 0). 3~6학년 5과목 2,536문항,
  //   하루 3회 일일 랭킹(역할별). 계정·개인정보 없음.
  { id: "siteBatOn",             label: "배트온(교과 야구)",        icon: "Target",    url: "https://baton-8x7.pages.dev/" },
  // 2026-09-17 추가 — 3D 볼링(핀 100개가 실제 물리로 무너진다). 조준하는 동안 보기 3개짜리
  //   수학 문제가 하나 뜨고, 맞히면 «천둥 볼»이 충전된다(오답 페널티 0 · 학년대는 교사가 고른다:
  //   2~3 / 3~4 / 4~5학년, 끄기 포함). 한 기기 2~4인 핫시트·AI 4단계·일일 랭킹. 계정·개인정보 없음.
  { id: "sitePinThunder",        label: "핀 천둥(수학 볼링)",       icon: "Zap",       url: "https://pin-thunder.pages.dev/" },
  // 2026-09-17 추가 — 3D 골프(섬 코스). 조준하는 동안 보기 4개짜리 교과 문제가 뜨고, 맞히면
  //   «집중 토큰»(샷 판정 창 ×2.6)과 비거리 보너스(정답당 +3 %, 판 상한 +12 %)가 쌓인다
  //   (오답 페널티 0). 오늘의 코스 3홀 일일 랭킹(하루 3회) · 자유 연습 9홀 · 3~6학년 25단원.
  //   계정·개인정보 없음.
  { id: "siteTeeshotIsland",     label: "티샷 아일랜드(교과 골프)", icon: "Flag",      url: "https://teeshot-island.pages.dev/" },
  // 2026-09-17 추가 — 1인칭 3D 방탈출 5편(시즌 1 《미현상》 4편 + 시즌 2 《밤차》 1편).
  //   한 편은 방 3칸·자물쇠 12개·제한 60분(무제한 모드 있음). 막히면 «힌트»를 사는데,
  //   값이 교과 문제다 — 1/2/3단계에 1·2·3문항(4지선다, 132문항 6영역). 오답 페널티 0이고
  //   3단계만 기록이 «힌트 사용»으로 남는다. 계정·로그인 없음 · 외부 요청 0(게이트가 잰다).
  { id: "siteMichyeonsang",      label: "미현상(1인칭 방탈출)",     icon: "Camera",    url: "https://michyeonsang.vercel.app/" },
  // 2026-09-18 추가 — 풀 3D 양궁(70 m). 바람을 읽고 흔들림이 멎는 순간에 놓는 게 전부다:
  //   측풍 1 m/s = 과녁 한 칸, 상승·하강 기류는 짧은 돌풍으로 따로 온다. 한 기기 둘이서
  //   화살 교대 세트제(2/1/0점, 6점 선취) · AI 3단계 · «오늘의 바람» 12발 일일 순위.
  //   교과 문항은 없다(체육·아케이드). 계정 없음 · 이름은 가운데 글자를 지운 뒤에만 저장한다.
  { id: "siteHwalbaram",         label: "활바람(3D 양궁)",          icon: "Wind",      url: "https://hwalbaram.pages.dev/" },
  // 2026-09-18 추가 — 3D 스키 다운힐(한 산을 정상에서 베이스까지). 깃대 사이를 지나며 속도×정확도로
  //   점수가 쌓이고, 빙판에서 조금만 무리하면 날이 걸려 넘어진다. 코스 6 · 스키어 5 · 데일리 랭킹
  //   (세 글자 이니셜은 가운데를 *로 가려 올라간다). 계정·개인정보 없음.
  { id: "siteSeolbongRush",      label: "설봉 러시(3D 스키)",      icon: "MountainSnow", url: "https://seolbong-rush.pages.dev/" },
  { id: "siteRacketRush",        label: "래킷 러시(테니스)",        icon: "CircleDot",  url: "https://racket-rush.vercel.app" },
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
      // 🧑‍🏫 제작자 — 사이드바가 '선생님별'로 묶는 기준(2026-08-27).
      //    값이 없으면 기본 묶음으로 떨어진다. 길이를 자르는 이유는 사이드바가
      //    한 줄짜리 좁은 영역이기 때문이고, 잘려도 링크는 멀쩡히 동작한다.
      owner:
        typeof a.owner === "string" && a.owner.trim()
          ? a.owner.trim().slice(0, 30)
          : DEFAULT_APP_OWNER,
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
