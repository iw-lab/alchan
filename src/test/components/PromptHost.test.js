/**
 * 입력 모달이 `window.prompt` 의 대체재로 **안전한지** 검증한다.
 *
 * 확인 모달과 초점이 다르다. confirm 은 "잘못 승인되는 경로가 없는가"였는데,
 * prompt 는 **취소와 빈 입력이 구별되는가**가 핵심이다.
 * `window.prompt` 는 취소 시 `null`, 빈칸 확인 시 `""` 를 준다. 이 구별이 무너지면
 * 예를 들어 "학급 코드를 그대로 입력해야 초기화"(Dashboard) 같은 안전장치가 샌다.
 */
import { render, screen, act, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import PromptHost from "../../components/PromptHost";
import { promptDialog, __resetPrompt } from "../../utils/promptDialog";

beforeEach(() => __resetPrompt());
afterEach(() => __resetPrompt());

/** 질문을 띄우고 **답을 기다리는 Promise 를 그대로** 돌려준다(감싸면 안 된다). */
function ask(message, defaultValue, options) {
  let promise;
  act(() => {
    promise = promptDialog(message, defaultValue, options);
  });
  return promise;
}

const type = (text) =>
  act(() => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  });

describe("PromptHost", () => {
  it("질문과 기본값을 띄운다", async () => {
    render(<PromptHost />);
    ask("판매 가격을 입력하세요", "1000");
    expect(await screen.findByText("판매 가격을 입력하세요")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("1000");
  });

  it("입력하고 확인하면 그 문자열을 돌려준다", async () => {
    render(<PromptHost />);
    const answer = ask("가격?", "");
    await screen.findByText("가격?");
    type("5000");
    await act(async () => screen.getByText("확인").click());
    await expect(answer).resolves.toBe("5000");
  });

  it("⭐ 취소는 null 이다 — 빈 입력('')과 달라야 한다", async () => {
    render(<PromptHost />);
    const answer = ask("사유를 입력하세요");
    await screen.findByText("사유를 입력하세요");
    await act(async () => screen.getByText("취소").click());
    await expect(answer).resolves.toBeNull();
  });

  it("⭐ 빈칸으로 확인하면 '' 다 — null 이 아니다", async () => {
    render(<PromptHost />);
    const answer = ask("사유를 입력하세요");
    await screen.findByText("사유를 입력하세요");
    await act(async () => screen.getByText("확인").click());
    const v = await answer;
    expect(v).toBe("");
    expect(v).not.toBeNull();
  });

  it("⭐ ESC 는 null 이다", async () => {
    render(<PromptHost />);
    const answer = ask("가격?", "1000");
    await screen.findByText("가격?");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await expect(answer).resolves.toBeNull();
  });

  it("⭐ 바깥을 눌러도 null 이다", async () => {
    render(<PromptHost />);
    const answer = ask("가격?");
    await screen.findByText("가격?");
    await act(async () => {
      screen
        .getByTestId("prompt-host")
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await expect(answer).resolves.toBeNull();
  });

  it("⭐ 호스트가 없으면 null 이다 — 물어보지 못했으면 답이 없는 것이다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(promptDialog("입력?")).resolves.toBeNull();
    expect(spy).toHaveBeenCalled(); // 조용히 넘어가지 않는다
    spy.mockRestore();
  });

  it("⭐ 열린 채로 언마운트되면 null 로 닫힌다 — 안 풀리는 약속을 남기지 않는다", async () => {
    const { unmount } = render(<PromptHost />);
    const answer = ask("입력?");
    await screen.findByText("입력?");
    await act(async () => unmount());
    await expect(answer).resolves.toBeNull();
  });

  it("엔터로도 확인된다 — window.prompt 와 같다", async () => {
    render(<PromptHost />);
    const answer = ask("사유?");
    await screen.findByText("사유?");
    type("지각");
    await act(async () => {
      fireEvent.submit(screen.getByRole("dialog"));
    });
    await expect(answer).resolves.toBe("지각");
  });

  it("열리면 입력칸에 포커스가 간다", async () => {
    render(<PromptHost />);
    ask("사유?", "기본값");
    await screen.findByText("사유?");
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("두 번 물으면 순서대로 두 번 답한다", async () => {
    render(<PromptHost />);
    const first = ask("판결?");
    const second = ask("이유?");

    expect(await screen.findByText("판결?")).toBeInTheDocument();
    expect(screen.queryByText("이유?")).not.toBeInTheDocument();

    type("유죄");
    await act(async () => screen.getByText("확인").click());
    await expect(first).resolves.toBe("유죄");

    expect(await screen.findByText("이유?")).toBeInTheDocument();
    await act(async () => screen.getByText("취소").click());
    await expect(second).resolves.toBeNull();
  });

  it("⭐ 뒤이은 질문이 앞 클릭에 휩쓸려 확정되지 않는다", async () => {
    // 두 질문이 쌓인 상태에서 '확인'을 연달아 누르면, 두 번째 클릭이 아직 읽지도 않은
    // 다음 질문을 **기본값 그대로** 확정해 버릴 수 있다. 판결 뒤 이유를 묻는 흐름에서
    // 빈 이유가 그대로 저장되는 식이다.
    render(<PromptHost />);
    const first = ask("판결?", "유죄");
    const second = ask("이유?", "");
    await screen.findByText("판결?");

    await act(async () => screen.getByText("확인").click());
    await act(async () => screen.getByText("확인").click());

    await expect(first).resolves.toBe("유죄");
    expect(screen.getByText("이유?")).toBeInTheDocument(); // 아직 열려 있다

    let settled = "미결";
    second.then((v) => (settled = v));
    await act(async () => {});
    expect(settled).toBe("미결");
  });

  it("⭐ 같은 배치에서 연타해도 다음 질문이 확정되지 않는다", async () => {
    // ⚠️ 위 테스트와 다른 경로다. 리렌더가 끼면 버튼의 `disabled` 가 DOM 에 반영돼
    //    브라우저가 막아 주지만, **같은 배치**에서 연달아 들어오면 아직 반영 전이라
    //    그냥 통과한다. 그래서 판정은 state 가 아니라 동기 ref 로 해야 한다.
    //    (이 케이스가 없으면 "확정 잠금" 제거 뮤테이션이 안 잡힌다 — 실측)
    render(<PromptHost />);
    const first = ask("판결?", "유죄");
    const second = ask("이유?", "지각");
    await screen.findByText("판결?");

    await act(async () => {
      const btn = screen.getByText("확인");
      btn.click();
      btn.click();
    });

    await expect(first).resolves.toBe("유죄");
    expect(screen.getByText("이유?")).toBeInTheDocument();
    let settled = "미결";
    second.then((v) => (settled = v));
    await act(async () => {});
    expect(settled).toBe("미결");
  });

  it("기본값이 선택된 채로 열린다 — 바로 덮어쓸 수 있게", async () => {
    // window.prompt 가 그랬다. 선택이 안 되면 사용자가 기존 값을 지우고 써야 한다.
    render(<PromptHost />);
    ask("가격?", "1000");
    await screen.findByText("가격?");
    const input = screen.getByRole("textbox");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("1000".length);
  });

  it("잠금은 잠깐이다 — 잠시 뒤엔 확정할 수 있다", async () => {
    render(<PromptHost />);
    const first = ask("판결?", "유죄");
    const second = ask("이유?", "지각");
    await screen.findByText("판결?");
    await act(async () => screen.getByText("확인").click());
    await expect(first).resolves.toBe("유죄");

    await act(async () => new Promise((r) => setTimeout(r, 450)));
    await act(async () => screen.getByText("확인").click());
    await expect(second).resolves.toBe("지각");
  });

  it("숫자 입력칸은 모바일 숫자 키보드를 요청한다", async () => {
    render(<PromptHost />);
    ask("가격?", "100", { inputMode: "numeric" });
    await screen.findByText("가격?");
    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "numeric");
  });

  it("질문이 없으면 아무것도 그리지 않는다", () => {
    render(<PromptHost />);
    expect(screen.queryByTestId("prompt-host")).not.toBeInTheDocument();
  });

  it("입력 내용이 스크린리더에 연결된다", async () => {
    render(<PromptHost />);
    ask("사유를 입력하세요");
    const dialog = await screen.findByRole("dialog");
    const id = dialog.getAttribute("aria-describedby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id)?.textContent).toBe("사유를 입력하세요");
  });

  it("⭐ Tab 으로 모달 밖에 나가지 못한다", async () => {
    render(
      <>
        <button data-testid="bg">배경 버튼</button>
        <PromptHost />
      </>,
    );
    ask("사유?");
    await screen.findByText("사유?");
    act(() => screen.getByTestId("bg").focus());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(screen.getByTestId("bg")).not.toBe(document.activeElement);
  });
});
