/**
 * 확인 모달을 그리는 곳. `src/utils/confirmDialog.js` 를 구독한다.
 *
 * App.js 에서 Router 바깥에 둔다(ToastHost 와 같은 이유 — 화면을 옮겨도 살아야 한다).
 *
 * ⚠️ 이 컴포넌트가 지켜야 할 것은 **"애매하면 취소"** 다. 확인 대상이 대부분
 *    삭제·회수처럼 되돌릴 수 없는 작업이라, 잘못 승인되면 학생 데이터가 날아간다.
 *    그래서 닫히는 모든 경로(ESC·바깥 클릭·언마운트)가 false 로 수렴한다.
 *
 * 대기열·StrictMode 순수성·바꿔치기 잠금은 `hooks/useDialogQueue.js` 가 맡는다
 * (입력창 PromptHost 와 같은 것을 쓴다 — 한쪽만 고치는 사고를 막으려고 합쳤다).
 */
import { useEffect, useRef } from "react";
import { subscribeConfirm } from "../utils/confirmDialog";
import { useDialogQueue } from "../hooks/useDialogQueue";
import { useDialogA11y, DIALOG_Z } from "./dialogA11y";

export default function ConfirmHost() {
  const { current, armed, close } = useDialogQueue(subscribeConfirm, false);
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);

  // ESC = 취소 · Tab 은 모달 안에 가둔다 · 열릴 때 포커스를 옮긴다
  useDialogA11y({
    open: Boolean(current),
    dialogRef,
    onEscape: () => close(false),
  });

  // 열릴 때 포커스는 '취소'로 — 엔터를 습관적으로 눌러도 삭제가 실행되지 않게.
  // 이게 이 모달에서 가장 중요한 한 줄이다.
  useEffect(() => {
    if (current) cancelRef.current?.focus();
  }, [current]);

  if (!current) return null;

  const {
    confirmText = "확인",
    cancelText = "취소",
    danger = false,
  } = current.options || {};

  return (
    <div
      className={`fixed inset-0 ${DIALOG_Z} flex items-center justify-center bg-black/40 px-4`}
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
            onClick={() => close(true, true)}
            // 바꿔치기된 직후에는 눌리지 않는다. 취소는 항상 눌린다.
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
