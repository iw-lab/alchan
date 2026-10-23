/**
 * 대출 일부 상환 — 2026-10-23 사용자 «모든 대출 일부 상환 처리하게». 예전엔 분할 상환형만 «분할 상환»이 있었고
 * 일시 상환형은 만기 전에 전액만 갚을 수 있었다. 서버(repayLoan mode:installment)는 원래 상환 방식과 무관하다.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("../../firebase", () => ({ db: {}, functions: {}, httpsCallable: () => vi.fn() }));
vi.mock("../../utils/firestoreHelpers", () => ({ logActivity: vi.fn(), ACTIVITY_TYPES: {} }));
vi.mock("../../contexts/CurrencyContext", () => ({ useCurrency: () => ({ currencyUnit: "알찬" }) }));
import { SubscribedProductItem } from "../../pages/banking/ParkingAccount";

const later = new Date(Date.now() + 5 * 86400000).toISOString();
const loan = (repaymentType, extra = {}) => ({
  id: "L1", type: "loan", name: "학급 대출", balance: 10000, originalBalance: 10000, rate: 1,
  termInDays: 7, startDate: new Date(Date.now() - 2 * 86400000).toISOString(), maturityDate: later, repaymentType, ...extra,
});

describe.each(["lumpSum", "installment", undefined])("상환 방식 %s 대출", (type) => {
  it("만기 전에 «일부 상환»과 «전액 상환»이 둘 다 있고, 일부 상환은 installment 로 부른다", () => {
    const onLoanRepay = vi.fn();
    render(<SubscribedProductItem product={loan(type)} onLoanRepay={onLoanRepay} onMaturity={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "일부 상환" }));
    expect(onLoanRepay).toHaveBeenCalledWith(expect.objectContaining({ id: "L1" }), "installment");
    fireEvent.click(screen.getByRole("button", { name: /^전액 상환/ }));
    expect(onLoanRepay).toHaveBeenLastCalledWith(expect.objectContaining({ id: "L1" }), "lumpSum");
  });
});

it("일부 갚은 일시 상환형 대출도 «남은 원금»이 보인다", () => {
  render(<SubscribedProductItem product={loan("lumpSum", { balance: 4000 })} onLoanRepay={vi.fn()} onMaturity={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByText("남은 원금:")).toBeTruthy();
});
