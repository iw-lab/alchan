// 화폐 단위는 «학급별»이어야 한다 — 2026-10-02 실측: 다른 반 교사가 화폐 단위를 "복"으로 저장하자
// 전역 문서 settings/mainSettings 를 읽던 모든 학급(심인수 클래스 포함)의 아이들 화면이 "복"으로 바뀌었다.
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// 🔴 src/test/setup.js 의 localStorage 는 아무것도 저장하지 않는 vi.fn() 이다 — 그대로면 기기 캐시 시험이
//    전부 «그냥 통과»한다. 이 파일만 실제로 저장하는 메모리 구현을 깐다.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const store = new Map();
let hold = null;   // 조회 응답을 붙잡아 «늦게 도착하는 옛 응답»을 만든다
let auth = { firebaseReady: true, user: { uid: "u1" }, userDoc: { classCode: "A" } };
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db, ...path) => ({ path: path.join("/") }),
  getDoc: async (ref) => { if (hold) await hold; return { exists: () => store.has(ref.path), data: () => store.get(ref.path) }; },
}));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const { CurrencyProvider, useCurrency } = await import("../../contexts/CurrencyContext");
const globalCacheService = (await import("../../services/globalCacheService")).default;

let api = null;
const Show = () => { const c = useCurrency(); api = c; return <span data-testid="u">{c.currencyUnit}</span>; };
const mount = () => render(<CurrencyProvider><Show /></CurrencyProvider>);

beforeEach(() => {
  store.clear(); localStorage.clear(); globalCacheService.invalidatePattern("classCurrency_"); hold = null;
  store.set("settings/mainSettings", { currencyUnit: "복", couponValue: 1000 });   // 다른 반 교사가 바꾼 전역 값
});

describe("CurrencyContext — 학급별 화폐 단위", () => {
  it("자기 학급 설정을 쓴다(전역 문서의 다른 반 값이 아니라)", async () => {
    store.set("classSettings/A/settings/display", { currencyUnit: "골드" });
    auth = { ...auth, userDoc: { classCode: "A" } };
    mount();
    await waitFor(() => expect(screen.getByTestId("u").textContent).toBe("골드"));
  });

  it("학급 설정이 없으면 기본값 «알찬» — 전역의 «복»을 끌어오지 않는다", async () => {
    auth = { ...auth, userDoc: { classCode: "B" } };
    mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId("u").textContent).toBe("알찬");
  });

  it("다른 학급의 설정은 섞이지 않는다", async () => {
    store.set("classSettings/A/settings/display", { currencyUnit: "골드" });
    store.set("classSettings/C/settings/display", { currencyUnit: "콩" });
    auth = { ...auth, userDoc: { classCode: "C" } };
    mount();
    await waitFor(() => expect(screen.getByTestId("u").textContent).toBe("콩"));
  });

  it("예전 전역 캐시(localStorage «복»)가 남아 있어도 보이지 않는다", async () => {
    localStorage.setItem("alchan_currencyUnit", "복");
    auth = { ...auth, userDoc: { classCode: "B" } };
    mount();
    expect(screen.getByTestId("u").textContent).toBe("알찬");
  });
  it("이 기기에 남은 «다른 학급» 단위는 첫 화면에도 보이지 않는다", async () => {
    localStorage.setItem("alchan_currencyUnit_v2", JSON.stringify({ classCode: "A", unit: "골드" }));
    auth = { ...auth, userDoc: { classCode: "B" } };
    mount();
    expect(screen.getByTestId("u").textContent).toBe("알찬");
  });

  it("같은 학급이면 기기 캐시로 바로 보인다(깜빡임 없음)", async () => {
    localStorage.setItem("alchan_currencyUnit_v2", JSON.stringify({ classCode: "A", unit: "골드" }));
    store.set("classSettings/A/settings/display", { currencyUnit: "골드" });
    let release; hold = new Promise((r) => { release = r; });   // 서버 응답 전
    auth = { ...auth, userDoc: { classCode: "A" } };
    mount();
    expect(screen.getByTestId("u").textContent).toBe("골드");
    release(); hold = null;
  });

  it("로그아웃(학급 없음)이 되면 이전 학급 단위를 지운다", async () => {
    store.set("classSettings/A/settings/display", { currencyUnit: "골드" });
    auth = { ...auth, user: { uid: "u1" }, userDoc: { classCode: "A" } };
    const r = mount();
    await waitFor(() => expect(screen.getByTestId("u").textContent).toBe("골드"));
    auth = { ...auth, user: null, userDoc: null };
    r.rerender(<CurrencyProvider><Show /></CurrencyProvider>);
    await waitFor(() => expect(screen.getByTestId("u").textContent).toBe("알찬"));
    auth = { ...auth, user: { uid: "u1" } };
  });

  it("저장 전에 떠난 늦은 조회가 방금 저장한 단위를 덮지 않는다", async () => {
    store.set("classSettings/A/settings/display", { currencyUnit: "옛단위" });
    let release; hold = new Promise((r) => { release = r; });
    auth = { ...auth, userDoc: { classCode: "A" } };
    mount();
    await new Promise((r) => setTimeout(r, 10));
    const { act } = await import("@testing-library/react");
    act(() => api.setCurrencyUnitLocal("새단위", "A"));       // 교사가 저장 완료
    release(); hold = null;                                   // 옛 응답 도착
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByTestId("u").textContent).toBe("새단위");
    expect(globalCacheService.get("classCurrency_A")?.currencyUnit).toBe("새단위");
  });

  it("다른 학급 대상의 늦은 저장 완료는 지금 화면을 바꾸지 않는다", async () => {
    store.set("classSettings/B/settings/display", { currencyUnit: "콩" });
    auth = { ...auth, userDoc: { classCode: "B" } };
    mount();
    await waitFor(() => expect(screen.getByTestId("u").textContent).toBe("콩"));
    const { act } = await import("@testing-library/react");
    act(() => api.setCurrencyUnitLocal("골드", "A"));
    expect(screen.getByTestId("u").textContent).toBe("콩");
  });
});
