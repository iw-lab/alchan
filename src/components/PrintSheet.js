// src/components/PrintSheet.js
// 인쇄 전용 틀 — 화면에는 안 보이고, 인쇄할 때만 앱(#root) 대신 이 안의 내용이 나온다.
// 새 창을 띄우지 않으므로 팝업 차단에 걸리지 않고, 앱의 글꼴·QR 컴포넌트를 그대로 쓴다.
// 쓰는 법: {printing && <PrintSheet onDone={() => setPrinting(false)}>…</PrintSheet>}
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// 인쇄 창이 열려 있는 동안 타이머가 도는 브라우저가 있다 — 고르는 시간을 넉넉히 준다.
const PRINT_FALLBACK_MS = 5 * 60_000;

export default function PrintSheet({ children, onDone }) {
  // onDone 은 부모가 매번 새 함수로 넘긴다 — ref 로 받아 인쇄 창이 두 번 열리지 않게 한다.
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    document.body.classList.add("has-print-sheet");
    let finished = false;
    let fallback = null;
    const done = () => {
      if (finished) return;
      finished = true;
      // 부모가 틀을 안 걷어도(onDone 을 안 줬어도) 화면은 여기서 원래대로 돌려놓는다.
      document.body.classList.remove("has-print-sheet");
      onDoneRef.current?.();
    };
    window.addEventListener("afterprint", done);
    // 그림(QR)이 그려진 다음 틱에 인쇄 창을 연다.
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        done();
        return;
      }
      // afterprint 를 안 쏘는 브라우저가 있다 — 그러면 «인쇄 중» 상태에 갇혀 다시 못 누른다.
      fallback = setTimeout(done, PRINT_FALLBACK_MS);
    }, 150);
    return () => {
      clearTimeout(t);
      clearTimeout(fallback);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("has-print-sheet");
    };
  }, []);

  return createPortal(<div className="print-sheet">{children}</div>, document.body);
}
