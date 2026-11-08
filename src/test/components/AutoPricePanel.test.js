/**
 * 자동 물가 교사 화면 — ① 열 때는 학생 자산을 계산하지 않는다(읽기 1) ② 켜기는 확인을 받는다
 * ③ 켜진 학급은 «지금 계산해 보기»를 눌러야 계산하고, 예정 %·기록을 보여준다.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const calls = [];
let state = { enabled: false, anchor: 0, center: null, counted: 0, history: [] };
vi.mock("../../firebase", () => ({
  functions: {},
  httpsCallable: (_f, name) => async (data) => {
    calls.push([name, data]);
    if (name === "autoPricePreview") return { data: data?.measure ? { ...state, center: 1_200_000, counted: 20, plannedPercent: 10 } : state };
    if (name === "autoPriceControl") { if (data.action === "enable") state = { ...state, enabled: true, anchor: 1_000_000 }; return { data: { success: true } }; }
    return { data: {} };
  },
}));
const confirmMock = vi.fn(async () => true);
vi.mock("../../utils/confirmDialog", () => ({ confirmDialog: (...a) => confirmMock(...a) }));
vi.mock("../../utils/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../utils/numberFormatter", () => ({ getCurrencyUnit: () => "원" }));

import AutoPricePanel from "../../pages/admin/AutoPricePanel";
const styles = { card: {}, header: {}, headerIcon: {}, title: {}, subtitle: {} };

describe("자동 물가 교사 화면", () => {
  beforeEach(() => { calls.length = 0; state = { enabled: false, anchor: 0, center: null, counted: 0, history: [] }; confirmMock.mockClear(); });
  it("열 때는 계산하지 않고(measure 없음) 꺼짐을 보여준다", async () => {
    render(<AutoPricePanel styles={styles} />);
    await screen.findByText("자동 물가 켜기");
    expect(calls).toEqual([["autoPricePreview", { measure: false }]]);
    expect(screen.getByText(/꺼짐/)).toBeTruthy();
  });
  it("켜기는 확인 뒤에만, 켜지면 예정 %를 보여준다", async () => {
    render(<AutoPricePanel styles={styles} />);
    fireEvent.click(await screen.findByText("자동 물가 켜기"));
    await waitFor(() => expect(calls.some(([n, d]) => n === "autoPriceControl" && d.action === "enable")).toBe(true));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    await screen.findByText("+10%");
    expect(screen.getByText(/1,200,000원/)).toBeTruthy();
  });
  it("확인을 취소하면 켜지 않는다", async () => {
    confirmMock.mockResolvedValueOnce(false);
    render(<AutoPricePanel styles={styles} />);
    fireEvent.click(await screen.findByText("자동 물가 켜기"));
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some(([n]) => n === "autoPriceControl")).toBe(false);
  });
});
