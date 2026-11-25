// 출석 보상 팝업 — «받기»가 어떻게 끝나도 빈 팝업이 화면을 덮은 채 남으면 안 된다.
// 2026-11-25 e2e 에서 실측: 이미 받은 날(already-exists) 배너만 사라지고 어두운 배경 + ✕ 만 남아 게시판 글쓰기를 막았다.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import React from "react";

const call = vi.fn();
const getDoc = vi.fn();
vi.mock("../../firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => call }));
vi.mock("firebase/firestore", () => ({ doc: () => ({}), getDoc: (...a) => getDoc(...a), setDoc: vi.fn() }));

import { DailyRewardBanner } from "../../components/DailyReward";

const CAN_CLAIM = { streak: 2, lastLogin: null, totalClaimed: 0, isNewDay: true, canClaim: true };
const flush = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const renderBanner = (props) =>
  render(<DailyRewardBanner userId="u1" prefetchedStreakInfo={CAN_CLAIM} {...props} />);

describe("출석 보상 팝업", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const store = new Map(); // 공용 시험 설정의 localStorage 는 값을 기억하지 않는다
    vi.stubGlobal("localStorage", {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
    call.mockReset();
    getDoc.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("이미 받은 날 — 팝업을 닫으라고 알리고, 이 기기에도 «받음»을 적는다", async () => {
    localStorage.setItem("streakCache_u1", JSON.stringify({ streak: 2, lastLogin: "2026-01-01T00:00:00.000Z" })); // 낡은 기록
    call.mockRejectedValue(Object.assign(new Error("already"), { code: "functions/already-exists" }));
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ streak: 3, lastLogin: new Date().toISOString(), totalClaimed: 20000 }) });
    const onHide = vi.fn();
    renderBanner({ onHide });
    fireEvent.click(screen.getByRole("button", { name: /받기/ }));
    await flush();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/출석 보상/)).toBeNull();
    expect(JSON.parse(localStorage.getItem("streakCache_u1")).streak).toBe(3); // 다음에 열어도 또 안 뜬다
  });

  it("서버 실패 — 배너를 남기고 까닭을 보여 주며, 다시 누르면 받는다", async () => {
    call.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "functions/unavailable" }));
    call.mockResolvedValueOnce({ data: { success: true, reward: 20000, newStreak: 3 } });
    const onHide = vi.fn();
    const onClaim = vi.fn();
    renderBanner({ onHide, onClaim });
    fireEvent.click(screen.getByRole("button", { name: /받기/ }));
    await flush();
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/다시 눌러/);
    fireEvent.click(screen.getByRole("button", { name: /받기/ }));
    await flush();
    expect(onClaim).toHaveBeenCalledWith(20000);
    expect(screen.getByText(/3일 연속 출석/)).toBeTruthy();
  });

  it("받는 동안 단추가 잠기고 «받는 중»으로 바뀐다", async () => {
    let done;
    call.mockReturnValue(new Promise((r) => { done = r; }));
    renderBanner({});
    fireEvent.click(screen.getByRole("button", { name: /받기/ }));
    await flush();
    const btn = screen.getByRole("button", { name: /받는 중/ });
    expect(btn).toBeDisabled();
    await act(async () => done({ data: { success: true, reward: 20000, newStreak: 3 } }));
  });

  it("성공했는데 금액이 비어 와도(멱등 재응답) 끝내 닫힌다", async () => {
    call.mockResolvedValue({ data: { success: true, newStreak: 3 } });
    const onHide = vi.fn();
    renderBanner({ onHide });
    fireEvent.click(screen.getByRole("button", { name: /받기/ }));
    await flush();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("레이아웃이 닫기 신호를 실제로 받는다", () => {
    const src = readFileSync("src/components/AlchanLayout.js", "utf8");
    const tag = src.slice(src.indexOf("<DailyRewardBanner"), src.indexOf("/>", src.indexOf("<DailyRewardBanner")));
    expect(tag).toMatch(/onHide=\{\(\) => setShowDailyRewardPopup\(false\)\}/);
  });
});
