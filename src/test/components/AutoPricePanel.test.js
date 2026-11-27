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
  // 2026-11-27 실측: 아이템 16개가 전부 «가격 변동 제외»인 학급에 두 주 연속 «+10.0%»가 찍혔다(바뀐 아이템 0개).
  it("바뀐 아이템이 없는 주는 «+10%»가 아니라 «그대로»와 제외 개수를 보여준다", async () => {
    state = { enabled: true, anchor: 1_800_000, center: null, counted: 0, history: [
      { weekKey: "2026-W48", at: 1795735800000, multiplier: 1.1, changed: 0, excluded: 16, reason: "자산이 늘었다" },
    ] };
    render(<AutoPricePanel styles={styles} />);
    const row = await screen.findByTestId("auto-price-history-2026-W48");
    expect(row.textContent).not.toMatch(/\+10/);
    expect(row.textContent).toMatch(/그대로/);
    expect(row.textContent).toMatch(/제외 16개/);
    expect(row.textContent).toMatch(/바뀐 아이템이 없/);
  });
  it("일부만 바뀐 주는 % 와 함께 변경·제외 개수를 둘 다 보여준다", async () => {
    state = { enabled: true, anchor: 9_000_000, center: null, counted: 0, history: [
      { weekKey: "2026-W48", at: 1795735800000, multiplier: 1.1, changed: 2, excluded: 9, reason: "자산이 늘었다" },
      { weekKey: "2026-W46", at: 1794526200000, multiplier: 1, changed: 0, reason: "기준을 처음 잡음" },
    ] };
    render(<AutoPricePanel styles={styles} />);
    const row = await screen.findByTestId("auto-price-history-2026-W48");
    expect(row.textContent).toMatch(/\+10\.0%/);
    expect(row.textContent).toMatch(/2개 변경/);
    expect(row.textContent).toMatch(/제외 9개/);
    const first = screen.getByTestId("auto-price-history-2026-W46");
    expect(first.textContent).toMatch(/그대로/);
    expect(first.textContent).not.toMatch(/제외|바뀐 아이템/);
  });
});

// 짝 맞추기 — 서버 자동 물가가 «경제이벤트 가격 변동 제외» 체크를 같이 따르는 동안에는
// 그 체크박스 설명에도 자동 물가가 적혀 있어야 한다(선생님이 모르고 자동 물가를 꺼 버리지 않게).
describe("가격 변동 제외 체크 설명", () => {
  it("자동 물가가 제외 체크를 따르면 설명에도 «자동 물가»가 있다", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const server = readFileSync(resolve(process.cwd(), "functions/scheduler-http.js"), "utf8");
    const body = server.slice(server.indexOf("async function applyAutoPriceForClass"), server.indexOf("async function runAutoPriceAllClasses"));
    expect(body.length).toBeGreaterThan(100);
    if (!body.includes("isStorePriceEventExcluded")) return; // 서버가 더는 제외 체크를 안 따르면 이 짝도 풀린다
    const page = readFileSync(resolve(process.cwd(), "src/pages/admin/AdminItemPage.js"), "utf8");
    const box = page.slice(page.indexOf('name="excludeFromEconomicEvent"'));
    const help = box.slice(0, box.indexOf("</p>"));
    expect(help).toMatch(/자동 물가/);
  });
});
