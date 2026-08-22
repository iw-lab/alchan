// src/services/appLaunch.js
// 🚪 AAP 실행 다리 — 학생이 사이드바에서 학습앱을 누르면 **토큰과 함께** 연다.
//
// 왜 이 파일이 생겼나
//   `issueAppToken` 은 2026-08-20 에 배포됐는데 **클라 호출부가 한 곳도 없었다**
//   (`grep -rn "issueAppToken" src/` → 테스트 파일 1건). 서버·JWKS·정책·실행권이
//   전부 살아 있는데 아무도 부르지 않아 **도달 불가능한 코드**였다. 이 저장소의
//   반복 결함이다 — "만들었다"와 "연결됐다"는 다른 문장이다.
//
// ─────────────────────────────────────────────────────────────────────────
// 🔬 왜 "빈 탭을 먼저 열고 나중에 이동"인가 (2026-08-22 Chrome 실측, 추측 아님)
//
//   | 방식                              | 지연    | 탭이 열렸나 | opener   |
//   |----------------------------------|--------|-----------|----------|
//   | `open(url,_blank,noopener)`      | 600ms  | ✅        | 끊김      |
//   | `open(url,_blank,noopener)`      | 6000ms | ❌ **차단** | —        |
//   | 빈탭 → `location.replace`         | 600ms  | ✅        | ⚠️ **연결됨** |
//   | 빈탭 → `opener=null` → `replace`  | 6000ms | ✅        | ✅ 끊김   |
//
//   ① **비동기 뒤의 `window.open` 은 차단된다.** Chrome 의 transient activation 은
//      약 5초라, 600ms 는 통과하고 6초는 막힌다. Firebase callable 은 콜드스타트에서
//      그 선을 넘길 수 있다 — 즉 "될 때도 있고 안 될 때도 있는" 최악의 실패다.
//   ② **`opener=null` 은 미신이 아니다.** 그 줄을 빼면 열린 앱에서 `window.opener` 로
//      알찬 탭이 잡힌다(표 3행이 반례다). 위성앱이 내 앱이어도 규약상 외부다.
//   ③ ⚠️ **반환값으로 차단을 판정하지 말 것.** `noopener` 를 주면 `window.open` 은
//      **명세상 항상 `null`** 을 돌려준다 — 처음 잰 프로브가 "차단됨"이라고 보고했는데
//      탭은 멀쩡히 열려 있었다. 열렸는지는 탭 목록으로 봐야 한다.
//
// ─────────────────────────────────────────────────────────────────────────
// 🔒 실패했을 때 그냥 링크로 열지 **않는다**(단 한 경우만 예외)
//
//   이관된 앱의 실행이 토큰 없이 이뤄지면 학생은 문제를 풀고 **기록·보상만 조용히
//   실패**한다. 서버 주석이 이미 "그게 제일 나쁜 실패"라고 못 박아 뒀다.
//   게다가 거부 사유가 `permission-denied`(선생님이 꺼 둠)인데 링크로 열어 주면
//   **교사의 잠금을 클라가 우회**한다. 그래서 fail-closed 가 기본이다.
//
//   유일한 예외 = `not_migrated`·`not-found`. "이 앱은 아직 AAP 가 아니다"라는 뜻이라
//   지금까지처럼 그냥 링크로 여는 게 맞다(회귀 0).

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase/firebaseConfig";
import { toast } from "../utils/toast";
import logger from "../utils/logger";

/** 빈 탭에 잠깐 보여줄 안내. 5초 넘게 흰 화면이면 학생은 고장으로 읽는다. */
const LOADING_HTML = `<!doctype html><meta charset="utf-8"><title>여는 중…</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;
font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#334155;background:#f8fafc}</style>
<div>학습앱을 여는 중이에요…</div>`;

/**
 * ⚠️ 서버 문구를 HTML 에 넣기 전에 **반드시** 거친다.
 *
 * 문구 정본은 우리 서버라 지금은 안전하지만, `internal` 같은 예상 못한 에러는 무엇을
 * 담고 올지 모른다. "우리 서버니까 괜찮다"는 신뢰경계가 아니다.
 *
 * @param {string} v 원문
 * @return {string} 이스케이프된 문자열
 */
function esc(v) {
  return String(v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/**
 * 실패를 **학생이 보고 있는 탭 안에서** 말해 주는 페이지.
 *
 * @param {string} message 학생에게 보여줄 문구(서버 정본)
 * @return {string} HTML
 */
function errorHtml(message) {
  return `<!doctype html><meta charset="utf-8"><title>열지 못했어요</title>
<style>html,body{height:100%;margin:0}body{display:grid;place-items:center;padding:24px;
font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#334155;background:#f8fafc;text-align:center}
.b{max-width:32rem}.t{font-size:20px;font-weight:700;color:#b91c1c;margin-bottom:12px}
.s{color:#64748b;font-size:14px;margin-top:16px}</style>
<div class="b"><div class="t">학습앱을 열지 못했어요</div>
<div>${esc(message)}</div>
<div class="s">이 탭은 닫아도 괜찮아요. 계속 안 되면 선생님께 말씀드려 주세요.</div></div>`;
}

/**
 * 🔴 **서버가 "이 앱은 AAP 가 아니다"라고 말한 것으로 인정하는 문구.**
 *
 * 예전엔 `not-found` **코드**로 판정했는데 그게 틀렸다 — Firebase SDK 는 **모든 HTTP 404 를
 * `functions/not-found` 로 바꾼다**(`@firebase/functions` 의 `case 404: return 'not-found'`).
 * 함수가 지워졌거나·리전을 잘못 적었거나·게이트웨이가 404 를 주면 그것까지 "이관 안 된 앱"으로
 * 읽혀 **이관된 앱이 평문 링크로 열린다**(2026-08-22 codex 레인). 코드는 출처가 둘인데
 * 문구는 우리 서버 한 곳에서만 나온다 — 그래서 **문구로 판정한다.**
 *
 * 정본 = `functions/aap/rewardRules.js` 의 `DENY_MESSAGE`. 문구가 바뀌면 여기도 바꿔야 한다
 * (서버 문구를 클라가 다시 적는 건 위험하지만, 대안인 코드 판정은 **오작동이 확인된 쪽**이다).
 */
const NOT_AAP_MESSAGES = [
  "이 앱은 아직 준비 중이에요.",          // not_migrated
  "아직 알찬과 연결되지 않은 앱이에요.",   // not_registered
];

/**
 * 서버에 **닿지도 못한** 경우의 코드들. 정책 판단이 아니라 인프라 사정이다.
 * 이때만, 그리고 힌트가 "이관 안 된 게 확실"할 때만 예전처럼 링크로 연다.
 */
const UNREACHABLE_CODES = new Set([
  "functions/unavailable", "functions/deadline-exceeded", "functions/internal",
  "unavailable", "deadline-exceeded", "internal",
]);

/**
 * 학습앱을 연다.
 *
 * ⚠️ **클릭 핸들러에서 곧바로 불러야 한다.** 첫 줄의 `window.open` 이 사용자 제스처와
 *    같은 태스크에서 실행돼야 팝업 차단을 통과한다(위 실측표 ①). 이 함수를 `await`
 *    뒤에서 부르면 조용히 차단된다.
 *
 * @param {object} item 사이드바 메뉴 아이템
 * @param {string} item.id appId (`platformAppPolicies` 문서 id 와 같다)
 * @param {string} item.externalUrl 이관 전 그냥 링크
 * @param {boolean} [item.aap] 레지스트리 힌트 — **권위가 아니라 "물어볼지" 여부**다
 * @param {boolean} [item.aapUnknown] 폴백 목록이라 이관 여부를 **모른다**(→ 물어본다)
 * @return {Promise<boolean>} 앱을 열었으면 true
 */
export async function launchLearningApp(item) {
  const plainUrl = item?.externalUrl;

  // 🔴 **언제나 서버에 묻는다.** 클라가 쥔 값으로 서버 확인을 건너뛰지 않는다.
  //
  //    처음엔 레지스트리 힌트(`aap`)가 falsy 면 아예 안 묻게 짰다. 그런데 그 힌트의 출처가
  //    `learningAppRegistry` 인데, 그 모듈의 머리말은 스스로 **"fail-open 표시용이고 권한
  //    경계가 아니다"** 라고 적고 있다. 거기서 나온 값을 "서버에 물을지"의 관문으로 쓰면,
  //    설계상 못 믿기로 한 값에 관문을 맡기는 것이 된다(2026-08-22 codex 레인).
  //    구체적으로 세 입구가 있었다:
  //      ① 사이드바 첫 페인트 — 매 세션 폴백으로 뜬다
  //      ② 레지스트리 조회 실패 — 그 세션 내내 폴백
  //      ③ `sessionStorage`(TTL 12h) — **학생이 devtools 로 직접 쓸 수 있다**
  //    ①②는 `aapUnknown` 으로 닫혔지만 ③은 안 닫혔다. 그리고 ③은 악의가 없어도 터진다 —
  //    교사가 오전에 이관을 켜면, 그 전에 캐시를 받은 학생은 **12시간 동안 조용히**
  //    토큰 없이 연다. 조용한 실패가 이 규약이 막으려던 바로 그것이다.
  //
  //    ⚠️ **대가를 숨기지 않는다.** 이관 안 된 앱도 이제 CF 왕복 1회를 거친다 —
  //       "이관 안 된 앱은 지금까지와 똑같이 열린다"는 불변식이 **"같은 곳으로 열리되
  //       왕복이 하나 는다"** 로 약해졌다. 대신 빈 탭이 즉시 열려 안내를 띄우므로 학생이
  //       느끼는 무반응 구간은 없고, 읽기 증가는 전체의 1% 미만이다(하루 약 200클릭).
  //       그리고 앱이 이관될수록 "묻는 쪽"이 다수가 된다 — 지금 떠나는 중인 상태를
  //       최적화할 이유가 없다.
  if (!plainUrl && !item?.id) return false;

  // 🔴 여기부터가 실측이 정한 순서다. 이 세 줄은 **await 앞에** 있어야 한다.
  const win = window.open("", "_blank");
  if (!win) {
    // 사용자가 팝업을 아예 막아 둔 경우. 이때만 반환값이 진짜 차단을 뜻한다
    // (옵션 문자열을 안 줬으므로 `noopener` 의 always-null 규칙에 걸리지 않는다).
    // ⚠️ "주소창 오른쪽의 팝업 허용" 같은 안내를 쓰지 않는다 — 태블릿 Safari 에는 그 UI 가
    //    없고, 애초에 초등 2~4학년에게 브라우저 설정을 만지라고 하는 건 길이 아니다.
    toast.error("학습앱 창이 열리지 않았어요. 선생님께 말씀드려 주세요.");
    return false;
  }
  try { win.document.write(LOADING_HTML); } catch { /* 안내는 장식이다 — 실패해도 진행 */ }
  // 🔒 opener 격리. 실패해도 실행은 계속하지만 **조용히 넘기지는 않는다** —
  //    이게 안 걸린 채로 도는 브라우저가 있다는 걸 알아야 나중에 판단할 수 있다
  //    (2026-08-22 codex 레인). 학생을 막을 만한 사유는 아니다: 위성앱은 우리 앱이고,
  //    막으면 그 브라우저에서는 학습 자체가 불가능해진다.
  try { win.opener = null; } catch { /* 구형 브라우저 */ }
  if (win.opener) logger.warn(`[AAP] opener 격리 실패 app=${item?.id} — 위성앱이 알찬 탭을 잡을 수 있다`);

  try {
    const res = await httpsCallable(functions, "issueAppToken")({ appId: item.id });
    const launchUrl = res?.data?.launchUrl;
    if (typeof launchUrl !== "string" || !launchUrl) throw new Error("launchUrl 없음");

    // 🔒 **서버가 준 URL 만 연다.** 클라가 토큰을 붙여 조립하지 않는다 — 조립할 수
    //    있으면 fragment 의 토큰을 다른 곳으로 보낼 길이 생긴다(계획서 §3.2 C6).
    if (win.closed) return false;              // 기다리는 동안 학생이 탭을 닫았다
    win.location.replace(launchUrl);
    return true;
  } catch (e) {
    const code = e?.code || "";
    // 🔴 **서버가 쓴 문구만** 학생에게 보여준다.
    //    `e.message` 는 서버 문구일 수도 있고(HttpsError — 항상 `code` 를 달고 온다)
    //    이 파일이 던진 내부 사정일 수도 있다("launchUrl 없음"). 둘을 같은 값으로 다루면
    //    아이 화면에 개발자 메모가 뜬다. `code` 가 있을 때만 서버 문구로 인정한다.
    const serverMsg = code ? (e?.message || "") : "";
    // ① 서버가 직접 "AAP 아니다"라고 말했다.
    const serverSaysNotAap = NOT_AAP_MESSAGES.some((m) => serverMsg.includes(m));
    // ② 서버에 닿지도 못했는데, 힌트가 "이관 안 된 게 확실"하다.
    //    이 경우까지 막으면 **Firebase 장애가 원래 서버와 무관하던 앱 10개를 같이 죽인다.**
    //    힌트를 믿는 게 아니라, 믿어도 잃을 게 없는 자리에서만 쓴다(이관 안 된 앱은
    //    토큰이 있어도 할 게 없다). 힌트가 "모른다"면 여기 안 걸린다.
    const knownNotAap = item?.aap !== true && item?.aapUnknown !== true;
    const notMigrated = serverSaysNotAap || (UNREACHABLE_CODES.has(code) && knownNotAap);

    if (notMigrated && plainUrl) {
      // 아직 AAP 가 아닌 앱 — 지금까지처럼 그냥 링크로. 이미 연 탭을 재활용한다
      // (닫고 새로 열면 그 `open` 은 비동기 뒤라서 차단된다).
      //
      // ⚠️ 탭이 닫혔으면 **열지 못한 것**이다. 예전엔 여기서도 `true` 를 돌려줘,
      //    같은 상황(대기 중 탭 닫힘)에서 성공 경로는 `false`·이 경로는 `true` 로
      //    반환값 계약이 갈렸다(2026-08-22 Claude 레인). 지금은 호출부가 `void` 라
      //    무해하지만, 계약이 어긋난 채로 두면 다음에 값을 보는 사람이 속는다.
      if (win.closed) return false;
      win.location.replace(plainUrl);
      return true;
    }

    // fail-closed. 서버 문구를 그대로 보여준다 — 문구 정본은 서버 한 곳뿐이다.
    //
    // 🔴 **탭을 닫지 않는다.** 학생의 눈은 방금 열린 새 탭에 가 있는데 거기서 탭이 사라지고
    //    안내는 **원래 탭**에 뜨면, 학생이 보는 것은 "눌렀는데 아무 일도 안 일어났다" 뿐이다
    //    (2026-08-22 Gemini 레인 지적). 보고 있는 화면에서 말해 준다. 토스트도 같이 남긴다 —
    //    학생이 원래 탭으로 돌아왔을 때도 이유가 남아 있어야 한다.
    const shown = serverMsg || "학습앱을 열지 못했어요. 잠시 후 다시 시도해 주세요.";
    if (!win.closed) {
      try { win.document.write(errorHtml(shown)); } catch { win.close(); }
    }
    logger.warn(`[AAP] 앱 실행 거부 app=${item.id} code=${code}`);
    toast.error(shown);
    return false;
  }
}
