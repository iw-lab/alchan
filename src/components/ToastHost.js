/**
 * 토스트를 실제로 그리는 곳. `src/utils/toast.js` 를 구독한다.
 *
 * App.js 에서 **Router 바깥**에 둔다 — 라우터 안에 두면 "저장했습니다"를 띄우고
 * 화면을 옮기는 순간 알림이 같이 사라진다. 저장 직후 이동은 흔한 흐름이라 그러면
 * 학생은 아무것도 못 본다.
 */
import { useEffect, useRef, useState } from "react";
import { AUTO_DISMISS_MS, subscribeToast } from "../utils/toast";

const STYLE = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-rose-300 bg-rose-50 text-rose-900",
  info: "border-slate-300 bg-white text-slate-800",
};

const ICON = { success: "✅", error: "⚠️", info: "ℹ️" };

export default function ToastHost() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const timers = useRef(new Map());

  const dismiss = (id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  };

  useEffect(() => {
    return subscribeToast(({ kind, message }) => {
      setToasts((list) => {
        // 같은 내용이 이미 떠 있으면 새로 쌓지 않는다(재시도 루프 방어).
        if (list.some((t) => t.kind === kind && t.message === message)) return list;
        return [...list, { id: nextId.current++, kind, message }];
      });
    });
  }, []);

  // 자동 닫기 타이머는 구독 콜백이 아니라 여기서 건다 — 콜백 안에서 걸면
  // StrictMode 의 이중 호출로 타이머가 두 번 생긴다.
  useEffect(() => {
    for (const t of toasts) {
      if (timers.current.has(t.id)) continue;
      const ms = AUTO_DISMISS_MS[t.kind];
      if (ms == null) continue;
      timers.current.set(
        t.id,
        setTimeout(() => dismiss(t.id), ms),
      );
    }
  }, [toasts]);

  // 언마운트 시 남은 타이머 정리 — 안 하면 사라진 컴포넌트에 setState 가 걸린다.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      // z-index 를 스플래시(index.html, 9999)보다 위로 둔다. 같은 값이면 DOM 순서로
      // 우연히 토스트가 이기지만, 그건 마크업 순서가 바뀌면 조용히 뒤집힌다.
      // 초기화 중 뜨는 오류가 스플래시에 가리는 게 가장 나쁜 경우라 명시적으로 올린다.
      className="pointer-events-none fixed inset-x-0 top-4 z-[10000] flex flex-col items-center gap-2 px-4"
      data-testid="toast-host"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          // 실패는 스크린리더가 즉시 읽도록 alert, 나머지는 status.
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${STYLE[t.kind]}`}
        >
          <span aria-hidden="true">{ICON[t.kind]}</span>
          <span className="flex-1 whitespace-pre-line break-words">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="알림 닫기"
            className="shrink-0 rounded px-1 text-base leading-none opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
