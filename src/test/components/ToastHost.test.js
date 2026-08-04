/**
 * 토스트가 alert 의 대체재로 **실제로 쓸 만한지** 검증한다.
 *
 * 여기서 확인하는 건 "렌더되는가"가 아니라, alert 을 걷어낼 때 잃으면 안 되는 성질들이다:
 *  · 실패 알림이 저절로 사라지지 않는가 (돈 다루는 앱에서 가장 중요)
 *  · 호스트가 붙기 전 호출이 유실되지 않는가 (앱 초기화 중 오류가 그렇다)
 *  · 재시도 루프가 화면을 덮지 않는가
 */
import { render, screen, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ToastHost from "../../components/ToastHost";
import { toast, __resetToast } from "../../utils/toast";

beforeEach(() => {
  __resetToast();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  __resetToast();
});

describe("ToastHost", () => {
  it("성공 알림을 띄운다", () => {
    render(<ToastHost />);
    act(() => toast.success("저장했습니다"));
    expect(screen.getByText("저장했습니다")).toBeInTheDocument();
  });

  it("성공 알림은 시간이 지나면 사라진다", () => {
    render(<ToastHost />);
    act(() => toast.success("저장했습니다"));
    expect(screen.getByText("저장했습니다")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText("저장했습니다")).not.toBeInTheDocument();
  });

  it("⭐ 실패 알림은 저절로 사라지지 않는다 — 학생이 놓치면 안 되는 정보다", () => {
    render(<ToastHost />);
    act(() => toast.error("잔액이 부족합니다"));

    // alert 은 사용자가 누를 때까지 남아 있었다. 그 성질을 잃으면 안 된다.
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("잔액이 부족합니다")).toBeInTheDocument();
  });

  it("실패 알림은 role=alert 이라 스크린리더가 즉시 읽는다", () => {
    render(<ToastHost />);
    act(() => toast.error("권한이 없습니다"));
    expect(screen.getByRole("alert")).toHaveTextContent("권한이 없습니다");
  });

  it("성공 알림은 role=status 다 (읽던 것을 끊지 않는다)", () => {
    render(<ToastHost />);
    act(() => toast.success("완료되었습니다"));
    expect(screen.getByRole("status")).toHaveTextContent("완료되었습니다");
  });

  it("같은 메시지가 연달아 와도 하나만 쌓인다 — 재시도 루프 방어", () => {
    render(<ToastHost />);
    act(() => {
      toast.error("네트워크 오류");
      toast.error("네트워크 오류");
      toast.error("네트워크 오류");
    });
    expect(screen.getAllByText("네트워크 오류")).toHaveLength(1);
  });

  it("⭐ 호스트가 붙기 전 호출도 유실되지 않는다 — 초기화 중 오류가 그렇다", () => {
    // React 가 그려지기 전에 발생한 상황
    act(() => toast.error("초기화 실패"));
    render(<ToastHost />);
    expect(screen.getByText("초기화 실패")).toBeInTheDocument();
  });

  it("닫기 버튼으로 지울 수 있다", () => {
    render(<ToastHost />);
    act(() => toast.error("확인하세요"));

    act(() => screen.getByLabelText("알림 닫기").click());
    expect(screen.queryByText("확인하세요")).not.toBeInTheDocument();
  });

  it("여러 알림이 동시에 뜬다 — alert 처럼 순서대로 누를 필요가 없다", () => {
    render(<ToastHost />);
    act(() => {
      toast.error("첫 번째");
      toast.success("두 번째");
    });
    expect(screen.getByText("첫 번째")).toBeInTheDocument();
    expect(screen.getByText("두 번째")).toBeInTheDocument();
  });

  it("알림이 없으면 아무것도 그리지 않는다", () => {
    render(<ToastHost />);
    expect(screen.queryByTestId("toast-host")).not.toBeInTheDocument();
  });

  it("문자열이 아닌 값도 죽지 않고 표시한다 — alert 은 뭐든 받아줬다", () => {
    render(<ToastHost />);
    act(() => toast.info(404));
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("빈 메시지는 무시한다 (빈 상자가 뜨지 않게)", () => {
    render(<ToastHost />);
    act(() => {
      toast.info("");
      toast.error(null);
    });
    expect(screen.queryByTestId("toast-host")).not.toBeInTheDocument();
  });
});
