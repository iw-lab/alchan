/**
 * 확인창·입력창처럼 **답을 돌려받아야 하는** 모달의 공용 배선.
 *
 * `confirmDialog`(window.confirm 대체)와 `promptDialog`(window.prompt 대체)가
 * 똑같은 안전 성질을 지켜야 하는데, 그 로직을 각자 복사해 두면 한쪽만 고치는 날이 온다.
 * 그래서 여기 한 벌만 둔다.
 *
 * ## 여기서 보장하는 것
 *  · **한 번의 물음에 한 번의 답** — `done` 플래그로 이중 resolve 를 막는다.
 *  · **호스트가 없으면 취소값** — 화면에 물어볼 방법이 없으면 답은 '아니오'다.
 *    조용히 넘어가면 원인을 못 찾으므로 console.error 로 흔적을 남긴다.
 *  · 사용자가 답할 때까지 결과가 확정되지 않는다(Promise).
 *
 * ⚠️ `cancelValue` 가 이 파일의 핵심이다. 확인창은 `false`, 입력창은 `null` 이어야
 *    원래 API 와 같게 동작한다(`window.prompt` 는 취소 시 null 을 준다).
 *    여기서 '성공값'을 기본값으로 주면 **아무도 못 본 사이에 삭제가 실행된다.**
 */

/**
 * @param {string} label 로그에 찍힐 이름
 * @param {*} cancelValue 호스트가 없을 때 돌려줄 값(= 취소와 같은 값)
 */
export function createDialogChannel(label, cancelValue) {
  const listeners = new Set();

  /** 호스트 전용 구독. 반환값을 호출하면 구독 해제. */
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  /** 테스트 전용. */
  const reset = () => listeners.clear();

  /**
   * 물어보고 답을 기다린다.
   * @param {object} payload 호스트가 그릴 때 쓸 값(message·defaultValue·options 등)
   * @param {(raw:*)=>*} normalize 사용자가 준 답을 최종 반환값으로 다듬는다
   */
  const ask = (payload, normalize) => {
    if (listeners.size === 0) {
      // 배선을 빠뜨리면 "눌러도 아무 일도 안 일어난다"로 나타난다. 흔적을 남긴다.
      console.error(
        `[${label}] 호스트가 마운트되지 않아 취소로 처리했습니다:`,
        payload.message,
      );
      return Promise.resolve(cancelValue);
    }
    return new Promise((resolve) => {
      let done = false;
      const answer = (raw) => {
        if (done) return;
        done = true;
        resolve(normalize(raw));
      };
      for (const fn of listeners) fn({ ...payload, answer });
    });
  };

  return { subscribe, reset, ask };
}
