/**
 * 입력 모달 — `await promptDialog()` 로 `window.prompt` 를 대체한다.
 *
 * ## 원래 API 와 반드시 같아야 하는 것
 * `window.prompt` 는 **문자열 또는 null** 을 돌려준다:
 *   · 확인 → 입력한 문자열(빈칸이면 `""`)
 *   · 취소 · ESC · 창 닫기 → `null`
 *
 * 이 앱의 호출부 10곳은 전부 `if (!reason || !reason.trim()) return;` 같은 식으로
 * **falsy 검사**를 한다. `null` 과 `""` 가 둘 다 falsy 라 그대로 동작하지만,
 * 취소 시 `""` 를 주면 "빈 문자열을 입력하고 확인을 눌렀다"와 구별이 사라진다.
 * 그래서 취소는 반드시 `null` 이다 — `window.prompt` 와 한 글자도 다르지 않게.
 *
 * ## alert·confirm 대체와 다른 점
 * 확인창은 "애매하면 취소(false)"였다. 여기서도 같은 방향이지만, 취소값이 `null` 이라
 * 호출부가 **답을 안 받은 것**과 **빈 답**을 구분할 수 있다. 이 차이가 중요한 곳이 있다 —
 * 예: 학급 초기화는 학급 코드를 그대로 타이핑해야 진행된다(Dashboard).
 */
import { createDialogChannel } from "./dialogChannel";

const channel = createDialogChannel("promptDialog", null);

/** PromptHost 전용 구독. */
export const subscribePrompt = channel.subscribe;

/** 테스트 전용. */
export const __resetPrompt = channel.reset;

/**
 * 입력을 받는다.
 *
 * @param {string} message 물어볼 내용. `\n` 은 줄바꿈으로 표시된다.
 * @param {string} [defaultValue] 입력칸의 초기값(`window.prompt` 2번째 인자와 같다)
 * @param {{confirmText?: string, cancelText?: string, danger?: boolean,
 *          inputMode?: string, placeholder?: string, multiline?: boolean}} [options]
 *   inputMode: 모바일 키보드 힌트. 숫자를 받는 곳은 "numeric" 을 준다 —
 *   학생들이 태블릿으로 쓰기 때문에 이게 체감 차이가 크다(원래 prompt 는 항상 문자 키보드).
 * @returns {Promise<string|null>} 입력값 / 취소·ESC·바깥클릭·언마운트면 null
 */
export function promptDialog(message, defaultValue = "", options = {}) {
  const text = typeof message === "string" ? message : String(message ?? "");
  const initial = defaultValue == null ? "" : String(defaultValue);
  return channel.ask(
    { message: text, defaultValue: initial, options },
    // 문자열이 아닌 것(취소의 null 등)은 전부 null 로 — 애매한 값이 '입력됨'으로 새지 않게.
    (raw) => (typeof raw === "string" ? raw : null),
  );
}

export default promptDialog;
