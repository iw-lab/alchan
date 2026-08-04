/**
 * 확인 모달 — `await confirmDialog()` 로 `window.confirm` 을 대체한다.
 *
 * confirm 은 alert 보다 걷어내기 훨씬 위험하다. alert 은 알리기만 하지만 confirm 은
 * **되돌릴 수 없는 작업의 마지막 관문**이다. 이 앱에서 실제로 이런 것들을 지킨다:
 *   "정말로 이 법안을 삭제하시겠습니까?"
 *   "주급 1회분을 모든 학생에게서 회수하시겠습니까?"
 *
 * 그래서 설계 기준이 하나다 — **애매하면 취소.** 잘못 취소되면 사용자가 다시 누르면
 * 되지만, 잘못 승인되면 학생 데이터가 날아가고 되돌릴 방법이 없다.
 * 닫히는 모든 경로(ESC·바깥 클릭·언마운트·호스트 없음)가 false 로 수렴한다.
 *
 * 공통 배선(1회 답·호스트 없음 처리)은 `dialogChannel.js`, 대기열·잠금은
 * `hooks/useDialogQueue.js` 에 있다 — 입력창(promptDialog)과 같은 것을 쓴다.
 */
import { createDialogChannel } from "./dialogChannel";

const channel = createDialogChannel("confirmDialog", false);

/** ConfirmHost 전용 구독. */
export const subscribeConfirm = channel.subscribe;

/** 테스트 전용. */
export const __resetConfirm = channel.reset;

/**
 * 확인을 묻고 답을 기다린다.
 *
 * @param {string} message 물어볼 내용. `\n` 은 줄바꿈으로 표시된다.
 * @param {{confirmText?: string, cancelText?: string, danger?: boolean}} [options]
 *   danger: 되돌릴 수 없는 작업이면 true — 확인 버튼이 빨간색이 된다.
 * @returns {Promise<boolean>} 확인 true / 취소·닫기·ESC false
 */
export function confirmDialog(message, options = {}) {
  const text = typeof message === "string" ? message : String(message ?? "");
  // `true` 외에는 전부 취소로 본다 — 애매한 값이 승인으로 새지 않게.
  return channel.ask({ message: text, options }, (raw) => raw === true);
}

export default confirmDialog;
