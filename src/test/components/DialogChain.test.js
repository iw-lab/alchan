/**
 * **입력창 → 확인창 연쇄**에서 앞 클릭이 뒤 모달을 승인해 버리지 않는지 검증한다.
 *
 * 잠금이 채널마다 따로였을 때 뚫렸던 구멍이다. 같은 채널 안에서 바꿔치기된 질문만
 * 잠기고, 다른 채널에서 새로 뜨는 질문은 "처음 뜨는 것"이라 안 잠겼다.
 * 그런데 이 앱의 실제 흐름이 정확히 그 모양이다 — 입력을 받고 **곧바로** 확인을 묻는다:
 *   · 쿠폰 목표 입력 → "기여 기록을 초기화하시겠습니까?"(danger)
 *   · 새 비밀번호 입력 → "정말 초기화?"(danger)
 * 두 모달의 확인 버튼이 화면상 거의 같은 자리라, 입력을 확정하려고 누른 클릭이 두 번
 * 겹치면 두 번째가 확인창에 그대로 꽂힌다. 실측으로 재현했다 —
 * 확인 버튼이 `disabled=false` 인 채 떠서 초기화가 실행됐다.
 */
import { render, screen, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import ConfirmHost from "../../components/ConfirmHost";
import PromptHost from "../../components/PromptHost";
import { confirmDialog, __resetConfirm } from "../../utils/confirmDialog";
import { promptDialog, __resetPrompt } from "../../utils/promptDialog";

const reset = () => {
  __resetConfirm();
  __resetPrompt();
};
beforeEach(reset);
afterEach(reset);

/** 실제 호출부 모양: 입력을 받고 곧바로 danger 확인을 묻는다. */
function startChain() {
  let resolved = "미결";
  act(() => {
    (async () => {
      const v = await promptDialog("새 목표 수량?", "500");
      if (v === null) {
        resolved = "입력 취소";
        return;
      }
      const ok = await confirmDialog("기여 기록을 초기화하시겠습니까?", {
        danger: true,
      });
      resolved = ok ? "초기화 실행" : "초기화 안 함";
    })();
  });
  return () => resolved;
}

describe("입력창 → 확인창 연쇄", () => {
  it("⭐ 입력 확정 직후 뜬 확인창은 곧바로 승인되지 않는다", async () => {
    // ⚠️ 호스트를 **먼저** 렌더해야 한다. 구독자가 없는 상태에서 물으면
    //    "호스트 없음 → 취소"로 즉시 끝나 버려서 아무것도 검증하지 못한다.
    render(
      <>
        <PromptHost />
        <ConfirmHost />
      </>,
    );
    const result = startChain();
    await screen.findByText("새 목표 수량?");

    // 클릭 ①: 입력 확정
    await act(async () => screen.getByText("확인").click());
    // 확인창이 같은 자리에 떴다
    await screen.findByText("기여 기록을 초기화하시겠습니까?");

    // 클릭 ②: 더블클릭의 두 번째가 여기 꽂힌다 — 잠겨 있어야 한다
    const btn = screen.getByText("확인");
    expect(btn).toBeDisabled();
    await act(async () => btn.click());
    expect(result()).toBe("미결"); // 아무것도 실행되지 않았다
    expect(screen.getByText("기여 기록을 초기화하시겠습니까?")).toBeInTheDocument();
  });

  it("잠금은 잠깐이다 — 잠시 뒤엔 사용자가 정상적으로 승인할 수 있다", async () => {
    // ⚠️ 호스트를 **먼저** 렌더해야 한다. 구독자가 없는 상태에서 물으면
    //    "호스트 없음 → 취소"로 즉시 끝나 버려서 아무것도 검증하지 못한다.
    render(
      <>
        <PromptHost />
        <ConfirmHost />
      </>,
    );
    const result = startChain();
    await screen.findByText("새 목표 수량?");
    await act(async () => screen.getByText("확인").click());
    await screen.findByText("기여 기록을 초기화하시겠습니까?");

    await act(async () => new Promise((r) => setTimeout(r, 450)));
    expect(screen.getByText("확인")).not.toBeDisabled();
    await act(async () => screen.getByText("확인").click());
    await act(async () => {});
    expect(result()).toBe("초기화 실행");
  });

  it("취소는 잠금과 무관하게 언제나 눌린다 — 막는 방향은 항상 '취소'다", async () => {
    // ⚠️ 호스트를 **먼저** 렌더해야 한다. 구독자가 없는 상태에서 물으면
    //    "호스트 없음 → 취소"로 즉시 끝나 버려서 아무것도 검증하지 못한다.
    render(
      <>
        <PromptHost />
        <ConfirmHost />
      </>,
    );
    const result = startChain();
    await screen.findByText("새 목표 수량?");
    await act(async () => screen.getByText("확인").click());
    await screen.findByText("기여 기록을 초기화하시겠습니까?");

    // 확인은 잠겼지만 취소는 즉시 눌려야 한다
    expect(screen.getByText("확인")).toBeDisabled();
    await act(async () => screen.getByText("취소").click());
    await act(async () => {});
    expect(result()).toBe("초기화 안 함");
  });

  it("앞선 확정이 없으면 확인창은 처음부터 눌린다 — 평소엔 느려지지 않는다", async () => {
    render(<ConfirmHost />);
    let answer;
    act(() => {
      answer = confirmDialog("삭제할까요?");
    });
    await screen.findByText("삭제할까요?");
    expect(screen.getByText("확인")).not.toBeDisabled();
    await act(async () => screen.getByText("확인").click());
    await expect(answer).resolves.toBe(true);
  });
});
