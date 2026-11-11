/**
 * 2026-11 2차 — 재난 보험 카드·신용등급 카드·교사 스위치.
 *  ① 보험은 «네, 가입해요»를 눌러야만 서버를 부른다(한 번 누른 것으로는 돈이 안 나간다)
 *  ② 화면은 보험료·한도를 서버에 보내지 않는다(서버가 정한다) ③ 가입 중이면 가입 버튼이 없다
 *  ④ 반에서 보험을 끄면 새 가입 카드가 사라지지만, 이미 든 보험은 보인다 ⑤ 스위치는 누른 값만 저장한다.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const state = { policy: null, switches: { insurance: true, creditLink: true }, buys: [], saves: [], failRead: false };
vi.mock("../../firebase/db/finance", () => ({
  fetchInsurancePolicy: async () => { if (state.failRead) throw new Error("permission-denied"); return state.policy; },
  fetchFinanceSwitches: async () => state.switches,
  fetchCreditRecord: async () => null,
  buyInsurance: async (...args) => { state.buys.push(args); return { success: true, premium: 500, cap: 10000 }; },
  saveFinanceSwitch: async (...args) => { state.saves.push(args); },
}));
vi.mock("../../utils/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import InsuranceCard from "../../components/InsuranceCard";
import CreditGradeCard from "../../components/CreditGradeCard";
import FinanceSwitches from "../../components/FinanceSwitches";

beforeEach(() => { state.policy = null; state.switches = { insurance: true, creditLink: true }; state.buys = []; state.saves = []; state.failRead = false; });
afterEach(cleanup);

const card = (props = {}) => render(<InsuranceCard userId="u1" classCode="t1abcd" cash={50000} {...props} />);

describe("재난 보험 카드", () => {
  it("보험료와 한도를 보여 주고, 두 번째 확인을 눌러야 가입한다 — 서버에 금액을 보내지 않는다", async () => {
    card();
    const open = await screen.findByText("보험 들기");
    expect(screen.getByText(/보험료 500원 · 최대 1만원까지 보장|보험료 .*500.* · 최대 .*까지 보장/)).toBeTruthy();
    fireEvent.click(open);
    expect(state.buys).toEqual([]);
    fireEvent.click(screen.getByText("네, 가입해요"));
    await waitFor(() => expect(state.buys.length).toBe(1));
    expect(state.buys[0]).toEqual([]);
  });
  it("«아니요»를 누르면 아무 일도 없다", async () => {
    card();
    fireEvent.click(await screen.findByText("보험 들기"));
    fireEvent.click(screen.getByText("아니요"));
    expect(state.buys).toEqual([]);
    expect(screen.getByText("보험 들기")).toBeTruthy();
  });
  it("가입 중이면 남은 날·한도를 보여 주고 가입 버튼이 없다", async () => {
    state.policy = { classCode: "t1abcd", userId: "u1", capRemaining: 7000, payoutThisTerm: 3000, expiresAt: Date.now() + 3 * 86400e3 - 1000 };
    card();
    expect(await screen.findByText(/가입 중 · 3일 남았어요/)).toBeTruthy();
    expect(screen.queryByText("보험 들기")).toBeNull();
    expect(screen.getByText(/받은 보험금/)).toBeTruthy();
  });
  it("현금이 모자라면 가입 버튼이 없다", async () => {
    card({ cash: 50 });
    expect(await screen.findByText(/현금이 있어야 가입/)).toBeTruthy();
    expect(screen.queryByText("보험 들기")).toBeNull();
  });
  it("반에서 껐으면 카드가 없다 — 단, 이미 든 보험은 보인다", async () => {
    state.switches = { insurance: false, creditLink: true };
    const { container } = card();
    await waitFor(() => expect(container.querySelector('[data-testid="insurance-card"]')).toBeNull());
    cleanup();
    state.policy = { classCode: "t1abcd", userId: "u1", capRemaining: 100, expiresAt: Date.now() + 86400e3 };
    card();
    expect(await screen.findByText(/가입 중/)).toBeTruthy();
  });
  it("남의 정책·기한 지난 정책은 가입 중으로 보지 않는다 · 못 읽으면 가입 버튼을 내지 않는다", async () => {
    state.policy = { classCode: "t1abcd", userId: "u2", capRemaining: 100, expiresAt: Date.now() + 86400e3 };
    card();
    expect(await screen.findByText("보험 들기")).toBeTruthy();
    cleanup();
    state.failRead = true;
    card();
    expect(await screen.findByText(/불러오지 못했어요/)).toBeTruthy();
    expect(screen.queryByText("보험 들기")).toBeNull();
  });
});

describe("신용등급 카드", () => {
  it("등급별 대출 조건을 보여 준다", () => {
    render(<CreditGradeCard stats={{ loans: [], cash: 600, savedTotal: 400, savingProducts: 1 }} />);
    expect(screen.getByLabelText("신용등급 1등급")).toBeTruthy();
    expect(screen.getByTestId("credit-loan-terms").textContent).toMatch(/20% 깎아 줘요.*10배/);
    cleanup();
    render(<CreditGradeCard stats={{ loans: [{ balance: 9000, maturityDate: Date.now() - 86400e3 }], cash: 10 }} />);
    expect(screen.getByLabelText("신용등급 5등급")).toBeTruthy();
    expect(screen.getByTestId("credit-loan-terms").textContent).toMatch(/30% 더 내요.*3배/);
  });
  it("반에서 연동을 껐으면 조건 줄이 없다", () => {
    render(<CreditGradeCard stats={{ cash: 100 }} linkOn={false} />);
    expect(screen.queryByTestId("credit-loan-terms")).toBeNull();
    expect(screen.getByText(/연결하지 않아요/)).toBeTruthy();
  });
});

describe("교사 스위치", () => {
  it("누른 스위치만, 반대 값으로 저장한다", async () => {
    render(<FinanceSwitches classCode="t1abcd" />);
    const sw = await screen.findAllByRole("switch");
    expect(sw.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "true"]);
    fireEvent.click(sw[0]);
    await waitFor(() => expect(state.saves).toEqual([["t1abcd", "insurance", false]]));
    await waitFor(() => expect(screen.getAllByRole("switch")[0].getAttribute("aria-checked")).toBe("false"));
    expect(screen.getAllByRole("switch")[1].getAttribute("aria-checked")).toBe("true");
  });
});
