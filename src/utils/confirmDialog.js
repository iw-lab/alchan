/**
 * 확인 모달 — `await confirmDialog()` 의 대체재.
 *
 * confirm 은 alert 보다 걷어내기 훨씬 위험하다. alert 은 알리기만 하지만 confirm 은
 * **되돌릴 수 없는 작업의 마지막 관문**이다. 이 앱에서 실제로 이런 것들을 지킨다:
 *   "정말로 이 법안을 삭제하시겠습니까?"
 *   "주급 1회분을 모든 학생에게서 회수하시겠습니까?"
 *   "게시글을 삭제하시겠습니까?"
 *
 * 그래서 설계 기준이 하나다 — **애매하면 취소.** 잘못 취소되면 사용자가 다시 누르면
 * 되지만, 잘못 승인되면 학생 데이터가 날아가고 되돌릴 방법이 없다.
 *
 * ## confirm 에서 반드시 이어받아야 하는 성질
 *  · **기본값이 '취소'** — 창을 닫든, ESC 를 누르든, 바깥을 클릭하든 false.
 *  · 사용자가 답할 때까지 결과가 확정되지 않는다(Promise 로 대체).
 *  · 한 번의 물음에 한 번의 답 — 같은 질문이 두 번 뜨면 두 번 물어야 한다.
 *
 * ## alert 대체(toast.js)와 다른 점
 * 토스트는 싱글턴 이미터로 충분했다(알리고 끝). 확인은 **답을 돌려받아야** 하므로
 * 호출마다 Promise 를 만들고 그 resolve 를 들고 있어야 한다. 그래서 대기 큐가 있다.
 */

const listeners = new Set();

/**
 * 호스트가 안 붙어 있을 때의 행동.
 * ⚠️ 여기서 `true` 를 주면 **아무도 못 본 사이에 삭제가 실행된다.** 절대 안 된다.
 *    호스트가 없다는 건 화면에 물어볼 방법이 없다는 뜻이고, 못 물었으면 답은 '아니오'다.
 */
const NO_HOST_ANSWER = false;

/** ConfirmHost 전용 구독. */
export function subscribeConfirm(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 테스트 전용. */
export function __resetConfirm() {
  listeners.clear();
}

/**
 * 확인을 묻고 답을 기다린다.
 *
 * @param {string} message 물어볼 내용. `\n` 은 줄바꿈으로 표시된다.
 * @param {{confirmText?: string, cancelText?: string, danger?: boolean}} [options]
 *   danger: 되돌릴 수 없는 작업이면 true — 확인 버튼이 빨간색이 되고 기본 포커스가
 *   '취소'에 간다(엔터를 습관적으로 눌러도 삭제되지 않게).
 * @returns {Promise<boolean>} 확인 true / 취소·닫기·ESC false
 */
export function confirmDialog(message, options = {}) {
  const text = typeof message === "string" ? message : String(message ?? "");
  if (listeners.size === 0) {
    // 개발 중에 배선을 빠뜨리면 "확인을 눌러도 아무 일도 안 일어난다"로 나타난다.
    // 조용히 false 를 주면 원인을 찾기 어려우므로 흔적을 남긴다.
    console.error(
      "[confirmDialog] ConfirmHost 가 마운트되지 않아 '취소'로 처리했습니다:",
      text,
    );
    return Promise.resolve(NO_HOST_ANSWER);
  }
  return new Promise((resolve) => {
    // 한 번만 답한다 — 확인/취소가 겹쳐 눌리거나 호스트가 두 번 부르는 경우 방어.
    let done = false;
    const answer = (result) => {
      if (done) return;
      done = true;
      resolve(result === true); // true 외에는 전부 취소로 본다
    };
    for (const fn of listeners) fn({ message: text, options, answer });
  });
}

export default confirmDialog;
