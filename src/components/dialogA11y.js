/**
 * 모달 공용 접근성 배선 — ESC 취소 + 포커스 트랩.
 *
 * ⚠️ 포커스 트랩이 왜 필요한가: `window.confirm`/`window.prompt` 는 브라우저가 페이지를
 *    통째로 잠갔다. 앱 내부 모달은 그렇지 않아서 Tab 을 누르면 포커스가 **모달 뒤 화면으로
 *    빠져나간다**(실측으로 확인). 그러면 "정말 삭제할까요?"를 띄워 둔 채 뒤에 있는 다른
 *    버튼을 눌러 버릴 수 있다. 확인 대상이 대부분 되돌릴 수 없는 작업이라 그 결과가 크다.
 */
import { useEffect } from "react";

/**
 * 확인창·입력창의 z-index.
 *
 * ⚠️ int32 최대값이다. 숫자 경쟁에서 이기려는 게 아니라 **경쟁을 끝내려는** 것이다 —
 *    `scripts/check-zindex.mjs` 가 src 안에 이보다 크거나 같은 값이 생기면 CI 를 세운다.
 *
 *    왜 이렇게까지: 원래 10001 이었는데 그 위에 그려지는 게 8개 파일이나 있었다.
 *    특히 Police.css 가 **일반적인 클래스 이름**에 `!important` 로
 *    `.modal-overlay{999999}` / `.modal-container{1000000}` (모바일은 10000000) 를
 *    걸어 두는데, 이 클래스는 12개 화면이 공유하고 CSS 는 한 번 로드되면 전역이다.
 *    결과: 경찰서를 한 번 들르면 그 뒤로 확인창이 **다른 모달 뒤에 숨는다.**
 *    사용자는 "버튼이 안 눌린다"고 느껴 계속 누르고, 호출부는 await 에서 멈춘다.
 */
export const DIALOG_Z = "z-[2147483647]";

/**
 * @param {object}   p
 * @param {boolean}  p.open            열려 있는가
 * @param {object}   p.dialogRef       모달 컨테이너 ref(트랩 범위)
 * @param {Function} p.onEscape        ESC 를 눌렀을 때(= 취소)
 *
 * 열릴 때 어디에 포커스를 줄지는 호스트마다 달라서(확인창은 '취소', 입력창은 입력칸)
 * 여기서 다루지 않는다 — 각 호스트가 직접 정한다.
 */
export function useDialogA11y({ open, dialogRef, onEscape }) {
  // ESC = 취소. confirm·prompt 둘 다 그랬다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onEscape]);

  // Tab / Shift+Tab 을 가로채 모달 안에서만 돌게 한다.
  useEffect(() => {
    if (!open) return;
    const onTab = (e) => {
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll(
        "button:not([disabled]), input, textarea, select, [href]",
      );
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
  }, [open, dialogRef]);
}
