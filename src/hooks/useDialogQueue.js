/**
 * 확인창·입력창 호스트의 공용 대기열.
 *
 * `window.confirm`/`window.prompt` 는 하나씩 순서대로 물었다. 그 순서를 지키면서,
 * 아래 세 가지를 **한 곳에서** 보장한다. 세 가지 전부 실측으로 데인 것들이다.
 *
 * ## ① setState 업데이터를 순수하게 유지한다
 * React 는 업데이터가 순수하길 요구하고, StrictMode 는 그걸 잡으려고 업데이터를
 * **일부러 두 번 호출**한다(React 19 에서 부작용 2회 실행 실측). 예전 ConfirmHost 는
 * push 도 shift 도 업데이터 안에서 했는데, **둘 다 두 배라 서로 상쇄되어** 겉보기엔
 * 멀쩡했다. 그래서 한쪽만 "고치면" 균형이 깨져 조용히 망가진다 — 실제로 큐에 있던
 * 질문이 화면에도 안 뜨고 Promise 도 영원히 안 풀렸다(그걸 기다리던 함수가 await 에서
 * 멈춘 채 로딩 상태로 남는다). 그래서 부작용은 전부 업데이터 **밖**, 판정은 동기 ref 로 한다.
 *
 * ## ② 바꿔치기된 질문은 잠깐 확정할 수 없다
 * 질문이 둘 쌓인 상태에서 확인 버튼을 두 번 누르면 — 같은 배치든 사람의 더블클릭이든 —
 * 두 번째 클릭이 **아직 읽지도 않은** 다음 질문을 확정해 버렸다(실측). 버튼이 같은 자리에
 * 다시 그려지기 때문이다. `window.confirm` 은 동기라 없던 구멍이다.
 * 처음 뜨는 질문은 잠그지 않는다 — 그건 사용자가 방금 연 것이고, 잠그면 전부 느려진다.
 *
 * ## ③ 언마운트되면 남은 약속을 전부 취소로 닫는다
 * 안 하면 Promise 가 영원히 안 풀려 호출한 쪽이 `await` 에서 끝나지 않는다.
 * 처음엔 큐만 비우고 **지금 열려 있는 것**을 빠뜨렸다 — 정작 사용자가 보고 있던 바로
 * 그 질문이 안 풀렸다. 테스트가 타임아웃으로 잡아냈다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 바꿔치기 직후 '확정'을 막아 두는 시간. 사람의 더블클릭(보통 500ms 이내)을 넘긴다. */
export const ARM_DELAY_MS = 400;

/**
 * @param {(fn:(request:object)=>void)=>()=>void} subscribe 채널 구독 함수
 * @param {*} cancelValue 취소로 간주할 값(확인=false, 입력=null)
 */
export function useDialogQueue(subscribe, cancelValue) {
  const [current, setCurrent] = useState(null);
  const [armed, setArmed] = useState(true);

  const queue = useRef([]);
  const currentRef = useRef(null); // state 와 같은 값이지만 **동기**로 갱신된다
  const armedRef = useRef(true); // 판정용. state 는 흐리게 그리는 용도일 뿐이다
  const armTimer = useRef(null);

  const setArmedBoth = useCallback((v) => {
    armedRef.current = v;
    setArmed(v);
  }, []);

  const show = useCallback(
    (request, fromQueue = false) => {
      currentRef.current = request;
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = null;
      const lock = Boolean(request) && fromQueue;
      setArmedBoth(!lock);
      if (lock) armTimer.current = setTimeout(() => setArmedBoth(true), ARM_DELAY_MS);
      setCurrent(request); // 값만 넘긴다 — 업데이터 함수를 쓰지 않는다(①)
    },
    [setArmedBoth],
  );

  /**
   * @param {*} result 사용자의 답
   * @param {boolean} isCommit true 면 '확정'(확인/입력완료) — 잠금의 적용 대상
   */
  const close = useCallback(
    (result, isCommit = false) => {
      // 잠긴 동안의 확정은 앞 클릭의 여파다 — 무시한다.
      // 취소는 언제나 통과시킨다. 막는 방향은 항상 '취소' 쪽이어야 한다.
      if (isCommit && !armedRef.current) return;
      const cur = currentRef.current;
      if (cur) cur.answer(result);
      const next = queue.current.shift() ?? null;
      show(next, next !== null);
    },
    [show],
  );

  useEffect(() => {
    return subscribe((request) => {
      // ref 는 동기라, 같은 틱에 두 번 물어도 두 번째가 확실히 큐로 간다.
      if (currentRef.current) queue.current.push(request);
      else show(request);
    });
  }, [subscribe, show]);

  // ③ 언마운트 정리. deps 를 [current] 로 두면 질문이 바뀔 때마다 정리가 돌아
  //    멀쩡한 걸 취소하므로, ref 로 최신 값을 보게 한다.
  useEffect(() => {
    const pending = queue.current;
    const timer = armTimer;
    return () => {
      clearTimeout(timer.current);
      currentRef.current?.answer(cancelValue);
      for (const r of pending) r.answer(cancelValue);
      pending.length = 0;
    };
  }, [cancelValue]);

  return { current, armed, close };
}
