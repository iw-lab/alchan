/**
 * StrictMode 이중 마운트에서 알림·확인이 겹치지 않는지 검증한다.
 *
 * 이 앱은 src/index.js 에서 <StrictMode> 를 쓴다. 개발 모드에서 effect 가
 * **두 번 실행**되므로, 구독을 걸어 두는 호스트(ToastHost·ConfirmHost)는 자칫
 * 같은 알림을 두 번 그리거나 같은 약속을 두 번 resolve 할 수 있다.
 *
 * 특히 위험한 건 세 번째 케이스다 — 확인 답이 두 번 resolve 되면 "삭제하시겠습니까"에
 * 한 번 답했는데 삭제가 두 번 실행될 수 있다. 이 앱의 확인 대부분이
 * 되돌릴 수 없는 작업이라 그 결과가 크다.
 */
import { render, screen, act } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, it, expect, vi } from "vitest";
import ConfirmHost from "../../components/ConfirmHost";
import ToastHost from "../../components/ToastHost";
import { confirmDialog, __resetConfirm } from "../../utils/confirmDialog";
import { toast, __resetToast } from "../../utils/toast";

describe("StrictMode 이중 마운트", () => {
  it("확인 모달이 두 번 뜨지 않는다", async () => {
    __resetConfirm();
    render(<StrictMode><ConfirmHost /></StrictMode>);
    let p;
    act(() => { p = confirmDialog("삭제할까요?"); });
    // 두 번 구독되면 같은 질문이 두 개 그려진다
    expect(screen.getAllByText("삭제할까요?")).toHaveLength(1);
    act(() => screen.getByText("취소").click());
    await expect(p).resolves.toBe(false);
  });

  it("토스트가 두 번 뜨지 않는다", () => {
    __resetToast();
    render(<StrictMode><ToastHost /></StrictMode>);
    act(() => toast.error("오류입니다"));
    expect(screen.getAllByText("오류입니다")).toHaveLength(1);
  });

  /**
   * ⭐ 이 테스트가 지키는 것: **setState 업데이터 안에서 큐(ref)를 변이하지 않는다.**
   *
   * React 는 업데이터가 순수하길 요구하고, StrictMode 는 그걸 잡으려고 업데이터를
   * 일부러 두 번 호출한다(React 19 에서 부작용 2회 실행 실측). ConfirmHost 는 원래
   * push 도 shift 도 업데이터 안에서 했는데, **둘 다 두 번씩이라 상쇄되어** 겉보기엔
   * 멀쩡했다. 그래서 한쪽만 "순수하게 고치면" 균형이 깨져 조용히 망가진다 —
   * 실측하니 큐에 있던 질문이 화면에도 안 뜨고 Promise 도 영원히 안 풀렸다
   * (그걸 기다리던 함수가 await 에서 멈춘 채 로딩 상태로 남는다).
   *
   * 이 테스트는 세 개를 쌓아 두고 셋 다 답을 받는지 본다. 어느 한쪽이라도
   * 업데이터 안으로 되돌아가면 중간 질문이 사라지면서 실패한다.
   */
  it("⭐ 대기열에 쌓인 질문이 하나도 사라지지 않는다 — 업데이터 순수성", async () => {
    __resetConfirm();
    render(<StrictMode><ConfirmHost /></StrictMode>);
    const ps = [];
    for (const q of ["첫째 삭제?", "둘째 삭제?", "셋째 삭제?"]) {
      act(() => { ps.push(confirmDialog(q)); });
    }
    // 순서대로 하나씩, 매번 정확히 한 개만 떠 있어야 한다
    for (const q of ["첫째 삭제?", "둘째 삭제?", "셋째 삭제?"]) {
      expect(screen.getAllByText(q)).toHaveLength(1);
      act(() => screen.getByText("취소").click());
    }
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // 하나라도 안 풀리면 여기서 타임아웃 대신 명확히 실패한다
    const settled = await Promise.race([
      Promise.all(ps),
      new Promise((r) => setTimeout(() => r("영원히 안 풀린 질문이 있다"), 1000)),
    ]);
    expect(settled).toEqual([false, false, false]);
  });

  it("확인 답이 한 번만 resolve 된다 (중복 구독 시 answer 가 두 번 불릴 수 있다)", async () => {
    __resetConfirm();
    render(<StrictMode><ConfirmHost /></StrictMode>);
    const spy = vi.fn();
    let p;
    act(() => { p = confirmDialog("확인?").then(spy); });
    act(() => screen.getByText("확인").click());
    await p;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);
  });
});
