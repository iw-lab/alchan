// usePolling 의 defaultValue·onError — 2026-10-14 전엔 두 옵션을 받기만 하고 무시했다.
//   국회 화면이 defaultValue 를 믿고 `governmentSettings.vetoOverrideRequired` 를 바로 읽다가,
//   정부설정 폴링이 관리설정 로딩 뒤에야 켜지는 사이(null) 투표가 TypeError 로 실패했다(e2e 실측).
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePolling } from "../../hooks/usePolling";

describe("usePolling defaultValue·onError", () => {
  it("꺼져 있는 동안(enabled=false)에도 data 는 defaultValue", () => {
    const { result } = renderHook(() =>
      usePolling(async () => ({ v: 1 }), { enabled: false, defaultValue: { vetoOverrideRequired: 17 } }),
    );
    expect(result.current.data).toEqual({ vetoOverrideRequired: 17 });
    expect(result.current.loading).toBe(false);
  });

  it("조회가 끝나면 결과로 바뀐다", async () => {
    const { result } = renderHook(() => usePolling(async () => ({ v: 2 }), { defaultValue: { v: 0 } }));
    expect(result.current.data).toEqual({ v: 0 });
    await waitFor(() => expect(result.current.data).toEqual({ v: 2 }));
  });

  it("조회 실패 시 onError 를 부르고 data 는 defaultValue 를 유지한다", async () => {
    const onError = vi.fn();
    const boom = new Error("permission-denied");
    const { result } = renderHook(() =>
      usePolling(async () => { throw boom; }, { defaultValue: [], onError }),
    );
    // onError 는 setError 보다 먼저 불린다 — 상태 반영을 기다린다(전엔 onError 만 기다려 간헐 실패)
    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(onError).toHaveBeenCalledWith(boom);
    expect(result.current.data).toEqual([]);
  });

  it("옵션을 안 주면 종전대로 null 에서 시작", () => {
    const { result } = renderHook(() => usePolling(async () => 1, { enabled: false }));
    expect(result.current.data).toBeNull();
  });
});
