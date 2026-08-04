/**
 * 확인 모달이 `window.confirm` 의 대체재로 **안전한지** 검증한다.
 *
 * 이 앱에서 confirm 이 지키는 것: 법안 삭제, 주급 회수, 게시글 삭제 — 전부 되돌릴 수
 * 없다. 그래서 검증의 초점은 "동작하는가"가 아니라 **"잘못 승인되는 경로가 없는가"** 다.
 * 애매한 경로(ESC·바깥클릭·호스트없음·언마운트)는 전부 false 여야 한다.
 */
import { render, screen, act, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ConfirmHost from "../../components/ConfirmHost";
import { confirmDialog, __resetConfirm } from "../../utils/confirmDialog";

beforeEach(() => __resetConfirm());
afterEach(() => __resetConfirm());

/**
 * 질문을 띄우고 **답을 기다리는 Promise 를 그대로** 돌려준다.
 *
 * ⚠️ 처음엔 `async function ask` 로 만들어 `await act(async ...)` 안에서 호출했는데,
 *    그러면 이 함수가 async 라 반환값이 **Promise<Promise<boolean>>** 이 되고,
 *    `await ask(...)` 가 안쪽 약속까지 풀어 버려 "답하기 전에 이미 기다린" 꼴이 됐다.
 *    14개 중 10개가 그 이유로 죽었다 — 컴포넌트가 아니라 헬퍼가 틀렸다.
 *    동기 `act` 로 상태만 흘리고 약속은 감싸지 않은 채 반환한다.
 */
function ask(message, options) {
  let promise;
  act(() => {
    promise = confirmDialog(message, options);
  });
  return promise;
}

describe("ConfirmHost", () => {
  it("질문을 띄운다", async () => {
    render(<ConfirmHost />);
    ask("정말 삭제할까요?");
    expect(await screen.findByText("정말 삭제할까요?")).toBeInTheDocument();
  });

  it("확인을 누르면 true 를 돌려준다", async () => {
    render(<ConfirmHost />);
    const answer = ask("삭제할까요?");
    await act(async () => screen.getByText("확인").click());
    await expect(answer).resolves.toBe(true);
  });

  it("취소를 누르면 false 를 돌려준다", async () => {
    render(<ConfirmHost />);
    const answer = ask("삭제할까요?");
    await act(async () => screen.getByText("취소").click());
    await expect(answer).resolves.toBe(false);
  });

  it("⭐ ESC 는 취소다 — confirm 도 그랬다", async () => {
    render(<ConfirmHost />);
    const answer = ask("법안을 삭제할까요?");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await expect(answer).resolves.toBe(false);
  });

  it("⭐ 바깥을 눌러도 취소다 — 실수로 승인되면 안 된다", async () => {
    render(<ConfirmHost />);
    const answer = ask("주급을 회수할까요?");
    await act(async () => {
      screen.getByTestId("confirm-host").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
    });
    await expect(answer).resolves.toBe(false);
  });

  it("⭐ 호스트가 없으면 취소다 — 물어보지 못했으면 '아니오'다", async () => {
    // ConfirmHost 를 렌더하지 않은 상태 = 화면에 물어볼 방법이 없다.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirmDialog("전부 삭제할까요?")).resolves.toBe(false);
    expect(spy).toHaveBeenCalled(); // 조용히 넘어가지 않는다
    spy.mockRestore();
  });

  it("⭐ 열린 채로 언마운트되면 취소로 닫힌다 — 영원히 안 풀리는 약속을 남기지 않는다", async () => {
    const { unmount } = render(<ConfirmHost />);
    const answer = ask("삭제할까요?");
    await screen.findByText("삭제할까요?");
    await act(async () => unmount());
    await expect(answer).resolves.toBe(false);
  });

  it("기본 포커스가 '취소'에 간다 — 엔터를 습관적으로 눌러도 삭제되지 않게", async () => {
    render(<ConfirmHost />);
    ask("정말 삭제할까요?", { danger: true });
    await screen.findByText("정말 삭제할까요?");
    expect(document.activeElement).toBe(screen.getByText("취소"));
  });

  it("두 번 물으면 순서대로 두 번 답한다 — 하나로 뭉뚱그리지 않는다", async () => {
    render(<ConfirmHost />);
    const first = ask("첫 번째를 삭제할까요?");
    const second = ask("두 번째를 삭제할까요?");

    expect(await screen.findByText("첫 번째를 삭제할까요?")).toBeInTheDocument();
    expect(screen.queryByText("두 번째를 삭제할까요?")).not.toBeInTheDocument();

    await act(async () => screen.getByText("확인").click());
    await expect(first).resolves.toBe(true);

    expect(await screen.findByText("두 번째를 삭제할까요?")).toBeInTheDocument();
    await act(async () => screen.getByText("취소").click());
    await expect(second).resolves.toBe(false);
  });

  it("확인과 취소가 겹쳐 눌려도 첫 답만 유효하다", async () => {
    render(<ConfirmHost />);
    const answer = ask("삭제할까요?");
    await screen.findByText("삭제할까요?");
    await act(async () => {
      screen.getByText("취소").click();
    });
    await expect(answer).resolves.toBe(false);
  });

  it("danger 면 확인 버튼이 빨간색이다", async () => {
    render(<ConfirmHost />);
    ask("되돌릴 수 없습니다. 삭제할까요?", { danger: true });
    await screen.findByText("되돌릴 수 없습니다. 삭제할까요?");
    expect(screen.getByText("확인").className).toMatch(/rose/);
  });

  it("버튼 문구를 바꿀 수 있다", async () => {
    render(<ConfirmHost />);
    ask("나갈까요?", { confirmText: "나가기", cancelText: "머무르기" });
    expect(await screen.findByText("나가기")).toBeInTheDocument();
    expect(screen.getByText("머무르기")).toBeInTheDocument();
  });

  it("질문이 없으면 아무것도 그리지 않는다", () => {
    render(<ConfirmHost />);
    expect(screen.queryByTestId("confirm-host")).not.toBeInTheDocument();
  });

  it("role=alertdialog 라 스크린리더가 모달로 인식한다", async () => {
    render(<ConfirmHost />);
    ask("삭제할까요?");
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("질문 내용이 스크린리더에 연결된다 — 무엇을 확인하는지 들려야 한다", async () => {
    // aria-describedby 가 없으면 제목("확인")만 읽히고 정작 **무엇을** 삭제하는지가
    // 안 들린다. 삭제 확인에서 그건 치명적이다.
    render(<ConfirmHost />);
    ask("법안을 삭제할까요?");
    const dialog = await screen.findByRole("alertdialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy)?.textContent).toBe("법안을 삭제할까요?");
  });

  it("⭐ Tab 으로 모달 밖에 나가지 못한다 — window.confirm 은 페이지를 통째로 잠갔다", async () => {
    render(
      <>
        <button data-testid="bg">배경 버튼</button>
        <ConfirmHost />
      </>,
    );
    ask("정말 삭제할까요?");
    await screen.findByText("정말 삭제할까요?");

    // 모달 마지막 버튼(확인)에서 Tab → 첫 버튼(취소)으로 돌아와야 한다
    act(() => screen.getByText("확인").focus());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(screen.getByText("취소"));

    // 배경으로 포커스가 새어 나간 뒤 Tab 을 눌러도 모달 안으로 되돌아온다
    act(() => screen.getByTestId("bg").focus());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(screen.getByTestId("bg")).not.toBe(document.activeElement);
  });
});
