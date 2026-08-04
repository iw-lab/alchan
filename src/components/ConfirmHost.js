/**
 * 확인 모달을 그리는 곳. `src/utils/confirmDialog.js` 를 구독한다.
 *
 * App.js 에서 Router 바깥에 둔다(ToastHost 와 같은 이유 — 화면을 옮겨도 살아야 한다).
 *
 * ⚠️ 이 컴포넌트가 지켜야 할 것은 **"애매하면 취소"** 다. 확인 대상이 대부분
 *    삭제·회수처럼 되돌릴 수 없는 작업이라, 잘못 승인되면 학생 데이터가 날아간다.
 *    그래서 닫히는 모든 경로(ESC·바깥 클릭·X·언마운트)가 false 로 수렴한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeConfirm } from "../utils/confirmDialog";

export default function ConfirmHost() {
  const [current, setCurrent] = useState(null);
  // 대기열. confirm 은 원래 하나씩 순서대로 물었으므로 그 순서를 지킨다.
  const queue = useRef([]);
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);

  /**
   * 지금 열려 있는 질문. state 와 늘 같은 값이지만 **동기적으로** 갱신된다.
   *
   * ⚠️ 이게 왜 state 대신 필요한가 — 여기 함정이 있었다.
   *    원래는 `setCurrent((cur) => { ... queue.current.push(...) ... })` 처럼
   *    **업데이터 함수 안에서 큐(ref)를 변이**했다. React 는 업데이터가 순수하길 요구하고,
   *    StrictMode 는 그걸 잡으려고 업데이터를 **일부러 두 번 호출**한다(React 19 에서 실측:
   *    부작용이 2회 실행됨). 그래서 push 도 2번, shift 도 2번 일어났다.
   *
   *    그런데도 동작은 멀쩡해 보였다 — **둘 다 두 번씩이라 서로 상쇄됐기 때문**이다.
   *    즉 한쪽만 고치면 균형이 깨져서 조용히 망가진다. 실제로 subscribe 쪽만 순수하게
   *    바꿔 보니 큐에 있던 질문이 **화면에도 안 뜨고 Promise 도 영원히 안 풀렸다**
   *    (그 질문을 기다리던 함수가 await 에서 멈춘 채 로딩 상태로 남는다).
   *    그래서 둘을 **함께** 고친다. StrictMode.test.js 의 "대기열에 쌓인 질문이 하나도
   *    사라지지 않는다" 테스트가 이 균형을 지킨다 — 둘 중 하나라도 업데이터 안으로
   *    되돌리면 실패한다(뮤테이션 2종으로 확인).
   */
  const currentRef = useRef(null);

  /**
   * 대기열에서 올라온 질문은 잠깐 '확인'을 못 누르게 한다.
   *
   * ⚠️ 실측한 버그다. 질문이 둘 쌓인 상태에서 '확인'을 두 번 누르면 — 같은 배치든,
   *    리렌더 뒤 진짜 더블클릭이든 — **두 번째 클릭이 다음 질문을 승인**했다.
   *    확인 버튼이 같은 자리에 다시 그려지기 때문이다. 측정 결과 `B=true, D=true` 로
   *    사용자가 읽은 적도 없는 질문이 승인됐다. 여기 질문들이 법안 삭제·주급 회수라
   *    그 결과가 크다.
   *
   *    `window.confirm` 은 이 문제가 없었다 — 동기라 창이 떠 있는 동안 클릭이 아예
   *    페이지로 안 갔다. 앱 모달로 바꾸면서 생긴 새 구멍이라 여기서 막는다.
   *
   *    **처음 뜨는 질문에는 적용하지 않는다.** 그건 사용자가 방금 다른 버튼을 눌러
   *    연 것이고, 지연을 넣으면 82곳 전부가 느려진다. 위험한 건 '바꿔치기'뿐이다.
   */
  const ARM_DELAY_MS = 400;
  const [armed, setArmed] = useState(true);
  // ⚠️ state 와 ref 를 **둘 다** 둔다. state 는 버튼을 흐리게/못 누르게 그리는 용도고,
  //    ref 는 판정용이다. state 만 쓰면 같은 배치 안에서 연달아 눌렸을 때 아직
  //    리렌더 전이라 `disabled` 가 DOM 에 반영되지 않아 그대로 통과한다(실측).
  //    판정은 항상 동기적인 ref 로 한다.
  const armedRef = useRef(true);
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
      // 큐에서 바꿔치기된 질문만 잠깐 잠근다.
      const lock = Boolean(request) && fromQueue;
      setArmedBoth(!lock);
      if (lock) {
        armTimer.current = setTimeout(() => setArmedBoth(true), ARM_DELAY_MS);
      }
      setCurrent(request); // 값만 넘긴다 — 업데이터 함수를 쓰지 않는다
    },
    [setArmedBoth],
  );

  useEffect(() => () => clearTimeout(armTimer.current), []);

  const close = useCallback(
    (result) => {
      // 아직 잠긴 질문을 '확인'으로 닫으려는 건 앞 클릭의 여파다 — 무시한다.
      // 취소(false)는 언제나 통과시킨다. 막는 방향은 항상 '취소' 쪽이어야 한다.
      if (result === true && !armedRef.current) return;
      // 부작용(답하기·큐에서 꺼내기)은 전부 업데이터 **밖**에서 한다.
      const cur = currentRef.current;
      if (cur) cur.answer(result);
      const next = queue.current.shift() ?? null;
      show(next, next !== null);
    },
    [show],
  );

  useEffect(() => {
    return subscribeConfirm((request) => {
      // ref 는 동기라, 같은 틱에 두 번 물어도 두 번째가 확실히 큐로 간다.
      if (currentRef.current) queue.current.push(request);
      else show(request);
    });
  }, [show]);

  // ESC = 취소. confirm 도 그랬다.
  useEffect(() => {
    if (!current) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, close]);

  // 열릴 때 포커스를 옮긴다. danger 면 '취소'로 — 엔터를 습관적으로 눌러도
  // 삭제가 실행되지 않게. 이게 이 모달에서 가장 중요한 한 줄이다.
  useEffect(() => {
    if (current) cancelRef.current?.focus();
  }, [current]);

  /**
   * 포커스 트랩.
   *
   * `window.confirm` 은 브라우저가 페이지를 통째로 잠갔다. 앱 내부 모달은 그렇지 않아서,
   * Tab 을 누르면 포커스가 **모달 뒤 화면으로 빠져나간다**(실측으로 확인). 그러면
   * "정말 삭제할까요?"를 띄워 둔 채 뒤에 있는 다른 버튼을 눌러 버릴 수 있다.
   * 확인 대상이 대부분 되돌릴 수 없는 작업이라 그 결과가 크다.
   *
   * Tab / Shift+Tab 을 가로채 모달 안의 두 버튼 사이에서만 돌게 한다.
   * 버튼이 둘뿐이라 별도 라이브러리 없이 이걸로 충분하다.
   */
  useEffect(() => {
    if (!current) return;
    const onTab = (e) => {
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll("button");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      // 모달 밖에 있으면 무조건 안으로 되돌린다(마우스로 배경을 클릭한 뒤 Tab 하는 경우).
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTab, true);
    return () => window.removeEventListener("keydown", onTab, true);
  }, [current]);

  // ⚠️ 언마운트될 때 대기 중인 약속을 전부 '취소'로 닫는다. 안 하면 그 Promise 가
  //    영원히 안 풀려서, 호출한 쪽 함수가 `await` 에서 멈춘 채 끝나지 않는다.
  //    (그 함수가 잡고 있던 로딩 상태·트랜잭션도 같이 멈춘 채로 남는다)
  //
  //    처음엔 큐만 비웠는데 **지금 열려 있는 것**을 빠뜨렸다 — 정작 사용자가 보고 있던
  //    바로 그 질문이 안 풀렸다. 테스트가 5초 타임아웃으로 잡아냈다.
  //    위에서 만든 currentRef 를 그대로 쓴다 — 정리 함수가 최신 것을 볼 수 있다
  //    (deps 를 [current] 로 두면 질문이 바뀔 때마다 정리가 돌아 멀쩡한 걸 취소한다).
  useEffect(() => {
    const pending = queue.current;
    return () => {
      currentRef.current?.answer(false);
      for (const r of pending) r.answer(false);
      pending.length = 0;
    };
  }, []);

  if (!current) return null;

  const {
    confirmText = "확인",
    cancelText = "취소",
    danger = false,
  } = current.options || {};

  return (
    <div
      /* ⚠️ z-index 는 앱 최상단(int32 최대값)이다. 숫자 경쟁에서 이기려는 게 아니라
         **경쟁을 끝내려는** 것이다 — scripts/check-zindex.mjs 가 src 안에 이보다 크거나
         같은 값이 생기면 CI 를 세운다.

         왜 이렇게까지: 원래 10001 이었는데 그 위에 그려지는 게 8개 파일이나 있었다.
         특히 Police.css 가 **일반적인 클래스 이름**에 `!important` 로
         `.modal-overlay{999999}` / `.modal-container{1000000}` (모바일은 10000000) 를
         걸어 두는데, 이 클래스는 12개 화면이 공유하고 CSS 는 한 번 로드되면 전역이다.
         결과: 경찰서를 한 번 들르면 그 뒤로 확인창이 **다른 모달 뒤에 숨는다.**
         사용자는 "버튼이 안 눌린다"고 느껴 계속 누르고, 호출부는 await 에서 멈춘다.
         하필 가장 파괴적인 확인들(법안 전체 삭제·신고 기록 전체 삭제·파산 신청)이
         그 높은 z-index 화면 안에 있다. */
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/40 px-4"
      // 바깥을 누르면 취소. 모달 안쪽 클릭이 여기로 올라오지 않게 target 을 확인한다.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
      data-testid="confirm-host"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="확인"
        // 질문 내용을 스크린리더가 모달 진입 시 읽어 준다. 없으면 "확인"이라는
        // 제목만 읽히고 **무엇을 확인하는지**가 안 들린다 — 삭제 확인에선 치명적이다.
        // 한 번에 하나만 뜨므로 고정 id 로 충분하다.
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <p
          id="confirm-message"
          className="whitespace-pre-line break-words text-[15px] leading-relaxed text-slate-800"
        >
          {current.message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => close(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            // 바꿔치기된 직후에는 눌리지 않는다(위 ARM_DELAY_MS 참고).
            // 취소는 항상 눌린다 — 막는 방향은 언제나 '취소' 쪽이어야 한다.
            disabled={!armed}
            aria-disabled={!armed}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity ${
              armed ? "" : "cursor-not-allowed opacity-50"
            } ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
