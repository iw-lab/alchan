/**
 * 입력 모달을 그리는 곳. `src/utils/promptDialog.js` 를 구독한다.
 *
 * App.js 에서 Router 바깥에 둔다(다른 호스트와 같은 이유 — 화면을 옮겨도 살아야 한다).
 *
 * ⚠️ 지켜야 할 것은 **취소는 반드시 `null`** 이다. 확인창의 "애매하면 취소"와 같은
 *    방향이되, 여기선 `""`(빈칸을 입력하고 확인)와 `null`(답을 안 함)이 서로 다른 뜻이다.
 *    닫히는 모든 경로(ESC·바깥 클릭·언마운트·호스트 없음)가 null 로 수렴한다.
 *
 * 대기열·StrictMode 순수성·바꿔치기 잠금은 `hooks/useDialogQueue.js`,
 * ESC·포커스 트랩은 `dialogA11y.js` — 확인창과 같은 것을 쓴다.
 */
import { useEffect, useRef, useState } from "react";
import { subscribePrompt } from "../utils/promptDialog";
import { useDialogQueue } from "../hooks/useDialogQueue";
import { useDialogA11y, DIALOG_Z } from "./dialogA11y";

export default function PromptHost() {
  const { current, armed, close } = useDialogQueue(subscribePrompt, null);
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  useDialogA11y({
    open: Boolean(current),
    dialogRef,
    onEscape: () => close(null),
  });

  // ⚠️ 기본값 갈아끼우기는 **렌더 중**에 한다(React 의 "props 가 바뀔 때 state 조정" 패턴).
  //    처음엔 아래 effect 안에서 `setValue()` 하고 곧바로 `select()` 했는데, state 갱신이
  //    비동기라 select 시점엔 입력칸이 아직 **빈 값**이었다 — 그래서 기본값이 선택되지
  //    않고 커서만 끝에 갔다(테스트가 selectionEnd=0 으로 잡아냈다).
  //    렌더 중에 맞춰 두면 아래 effect 가 돌 때 DOM 에 이미 값이 있다.
  const [shownFor, setShownFor] = useState(null);
  if (current !== shownFor) {
    setShownFor(current);
    setValue(current?.defaultValue ?? "");
  }

  // 입력칸에 포커스 + 기본값 전체 선택. `window.prompt` 가 그랬다 — 그래야 바로 덮어쓴다.
  useEffect(() => {
    if (!current) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select?.();
  }, [current]);

  if (!current) return null;

  const {
    confirmText = "확인",
    cancelText = "취소",
    danger = false,
    inputMode,
    placeholder,
    multiline = false,
  } = current.options || {};

  const submit = (e) => {
    e?.preventDefault();
    close(value, true); // 확정 — 바꿔치기 직후에는 잠겨서 무시된다
  };

  return (
    <div
      className={`fixed inset-0 ${DIALOG_Z} flex items-center justify-center bg-black/40 px-4`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(null);
      }}
      data-testid="prompt-host"
    >
      {/* form 으로 감싸서 엔터가 자연스럽게 '확인'이 되게 한다(window.prompt 와 같다) */}
      <form
        ref={dialogRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="입력"
        aria-describedby="prompt-message"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <p
          id="prompt-message"
          className="whitespace-pre-line break-words text-[15px] leading-relaxed text-slate-800"
        >
          {current.message}
        </p>

        {multiline ? (
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            // 여러 줄이면서 숫자를 받는 곳은 지금 없지만, 생기면 조용히 빠지는 걸 막는다.
            inputMode={inputMode}
            placeholder={placeholder}
            rows={3}
            className="mt-3 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-indigo-500"
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode={inputMode}
            placeholder={placeholder}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-[15px] text-slate-900 outline-none focus:border-indigo-500"
          />
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            type="submit"
            disabled={!armed}
            aria-disabled={!armed}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity ${
              armed ? "" : "cursor-not-allowed opacity-50"
            } ${danger ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
          >
            {confirmText}
          </button>
        </div>
      </form>
    </div>
  );
}
