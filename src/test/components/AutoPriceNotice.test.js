/** 자동 물가 안내 — 선생님에게만 보이고, 닫으면 다시 안 뜬다. 학생·학급 없는 계정엔 안 보인다. */
import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
let auth = {};
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
import AutoPriceNotice from "../../components/AutoPriceNotice";
const show = () => render(<MemoryRouter><AutoPriceNotice /></MemoryRouter>);

describe("자동 물가 안내 띠", () => {
  // 공용 setup 의 localStorage 는 저장하지 않는 가짜라 «닫으면 다시 안 뜬다»를 잴 수 없다 — 여기서만 진짜처럼 저장한다
  beforeEach(() => { const m = new Map(); vi.stubGlobal("localStorage", { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("선생님에게 보인다", () => {
    auth = { user: { uid: "t1" }, userDoc: { classCode: "C1", isAdmin: true } };
    expect(show().queryByTestId("auto-price-notice")).toBeTruthy();
  });
  it("학생에게는 안 보인다", () => {
    auth = { user: { uid: "s1" }, userDoc: { classCode: "C1", isAdmin: false } };
    expect(show().queryByTestId("auto-price-notice")).toBeNull();
  });
  it("학급 없는 계정(슈퍼관리자 등)엔 안 보인다", () => {
    auth = { user: { uid: "x" }, userDoc: { isSuperAdmin: true, isAdmin: true } };
    expect(show().queryByTestId("auto-price-notice")).toBeNull();
  });
  it("닫으면 다시 안 뜬다", () => {
    auth = { user: { uid: "t2" }, userDoc: { classCode: "C1", isTeacher: true } };
    const a = show(); fireEvent.click(a.getByText("알겠어요")); expect(a.queryByTestId("auto-price-notice")).toBeNull(); a.unmount();
    expect(show().queryByTestId("auto-price-notice")).toBeNull();
  });
});
