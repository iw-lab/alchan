/**
 * 2026-11 업그레이드 화면 — 실제로 그려지고, 눌렀을 때 약속한 일만 하는지.
 *  ① 학급 경제 리포트는 열 때 계산하지 않는다(누를 때만) ② 가계부는 원장을 하나라도 못 읽으면 숫자를 내지 않는다
 *  ③ 로그인 카드에 비밀번호가 안 찍힌다 ④ 퀴즈는 고른 보기만 서버에 한 번 보낸다(판정·상금은 서버) ⑤ 저축 목표는 검사를 통과한 값만 저장한다
 */
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const calls = [];
let ledger = { activity: [], transactions: [], root: [], incomplete: false, truncatedBefore: 0 };
const saved = [];
vi.mock("../../firebase", () => ({
  functions: {},
  httpsCallable: (_f, name) => async (data) => {
    calls.push([name, data]);
    const rows = [
      { uid: "a", name: "가", studentNumber: 1, cash: 900, totalAssets: 900, netAssets: 900, loanTotal: 0, parkingBalance: 100 },
      { uid: "b", name: "나", studentNumber: 2, cash: 100, totalAssets: 100, netAssets: -50, loanTotal: 150 },
    ];
    return { data: { success: true, classCode: "T1", students: rows, report: { count: 2, totalAssets: 1000, loanTotal: 150, netTotal: 850, mean: 425, median: 425, min: -50, max: 900, gini: 0.5, top20Share: 1, bottom50Share: 0, composition: { cash: 1000 }, inDebt: 1, borrowers: 1, savers: 1, investors: 0, landlords: 0 } } };
  },
}));
vi.mock("../../firebase/db/ledger", () => ({
  fetchLedgerSince: async () => ledger,
  saveSavingsGoal: async (uid, goal) => { saved.push(["goal", uid, goal]); },
}));
let quizReply = { success: true, correct: true, reward: 10000 };
vi.mock("../../firebase/db/finance", () => ({
  fetchFinanceSwitches: async () => ({ insurance: true, creditLink: true, quizReward: 10000 }),
  claimQuizReward: async (day, questionId, choice) => {
    saved.push(["quiz", day, questionId, choice]);
    if (quizReply instanceof Error) throw quizReply;
    return quizReply;
  },
}));
vi.mock("../../utils/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: ({ value }) => <svg data-qr={value} /> }));

import ClassEconomyReport from "../../pages/admin/ClassEconomyReport";
import WeeklyBookModal from "../../components/WeeklyBookModal";
import LoginCardsSheet from "../../components/LoginCardsSheet";
import SavingsGoalCard from "../../components/SavingsGoalCard";
import CreditGradeCard from "../../components/CreditGradeCard";
import BadgeShelf from "../../components/BadgeShelf";
import TodayTip from "../../components/TodayTip";
import TeacherStartGuide from "../../components/TeacherStartGuide";
import EconQuizCard from "../../components/EconQuizCard";
import { weekRangeKST } from "../../utils/weeklyBook";
import { dayKeyKST } from "../../utils/econQuiz";

// 공용 setup 의 localStorage 는 아무것도 기억하지 않는 가짜다 — «닫으면 그날은 안 보인다»를 보려면 기억하는 저장소가 필요하다.
const realStorage = global.localStorage;
beforeEach(() => {
  calls.length = 0; saved.length = 0; window.print = vi.fn();
  const mem = new Map();
  global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear() };
});
afterEach(() => { cleanup(); document.body.classList.remove("has-print-sheet"); global.localStorage = realStorage; });

describe("학급 경제 리포트", () => {
  it("열 때는 서버를 부르지 않고, 누르면 숫자와 수업 거리를 보여 준다", async () => {
    render(<ClassEconomyReport />);
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByText("지금 계산하기"));
    await screen.findByText("2명");
    expect(calls).toEqual([["classEconomyReport", {}]]);
    expect(screen.getByText("0.50")).toBeTruthy();
    expect(screen.getByText(/순자산이 마이너스인 학생이 1명/)).toBeTruthy();
    expect(screen.getByText(/1번 가/)).toBeTruthy();
  });
});

describe("이번 주 가계부", () => {
  const thisWeek = new Date(weekRangeKST(Date.now()).start + 3600e3);
  it("번 돈·쓴 돈을 보여 준다", async () => {
    ledger = { activity: [{ id: "1", type: "salaryPayment", amount: 1000, description: "[주급]", timestamp: thisWeek }, { id: "2", type: "아이템 구매", amount: -400, description: "사탕 1개 구매", timestamp: thisWeek }], transactions: [], root: [], incomplete: false, truncatedBefore: 0 };
    render(<WeeklyBookModal isOpen onClose={() => {}} userId="u" classCode="T1" name="가" />);
    await screen.findByText("어디에 썼나");
    expect(screen.getByText(/60%를 남겼어요/)).toBeTruthy();
  });
  it("원장을 하나라도 못 읽었으면 숫자 대신 «못 읽었다»", async () => {
    ledger = { activity: null, transactions: [], root: [], incomplete: true, truncatedBefore: 0 };
    render(<WeeklyBookModal isOpen onClose={() => {}} userId="u" classCode="T1" />);
    await screen.findByText(/읽지 못했어요/);
    expect(screen.queryByText("번 돈")).toBeNull();
  });
  it("거래가 잘렸으면 그 주 숫자를 내지 않는다", async () => {
    ledger = { activity: [{ id: "1", type: "salaryPayment", amount: 1000, description: "[주급]", timestamp: thisWeek }], transactions: [], root: [], incomplete: false, truncatedBefore: Date.now() };
    render(<WeeklyBookModal isOpen onClose={() => {}} userId="u" classCode="T1" />);
    await screen.findByText(/다 모으지 못했어요/);
    expect(screen.queryByText("번 돈")).toBeNull();
  });
});

describe("로그인 카드", () => {
  it("아이디·학급코드는 찍고 비밀번호 값은 찍지 않는다 · 인쇄 뒤 화면을 돌려놓는다", async () => {
    const done = vi.fn();
    render(<LoginCardsSheet students={[{ id: "a", email: "alchan01@t1.alchan", name: "1번 가", studentNumber: 1, password: "secret-pw" }]} classCode="t1" siteUrl="https://example.test/login" onDone={done} />);
    expect(document.body.textContent).toContain("alchan01");
    expect(document.body.textContent).toContain("T1");
    expect(document.body.textContent).not.toContain("secret-pw");
    expect(document.body.classList.contains("has-print-sheet")).toBe(true);
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("afterprint"));
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains("has-print-sheet")).toBe(false);
  });
});

describe("저축 목표·신용·배지", () => {
  it("목표는 검사를 통과한 값만 저장한다", async () => {
    render(<SavingsGoalCard userId="u" rawGoal={null} saved={0} />);
    fireEvent.click(screen.getByText("목표 정하기"));
    fireEvent.click(screen.getByText("정하기"));
    expect(saved).toEqual([]); // 빈 값은 저장 안 함
    fireEvent.change(screen.getByPlaceholderText(/자리 사기/), { target: { value: "자리 사기" } });
    fireEvent.change(screen.getByPlaceholderText(/5000000/), { target: { value: "3000" } });
    fireEvent.click(screen.getByText("정하기"));
    await waitFor(() => expect(saved).toEqual([["goal", "u", { name: "자리 사기", amount: 3000 }]]));
  });
  it("진행률을 보여 준다 · 깨진 목표 값에도 죽지 않는다", () => {
    render(<SavingsGoalCard userId="u" rawGoal={{ name: "자리", amount: 1000 }} saved={250} />);
    expect(screen.getByText("25%")).toBeTruthy();
    cleanup();
    render(<SavingsGoalCard userId="u" rawGoal={{ name: 5, amount: "x" }} saved={NaN} />);
    expect(screen.getByText("목표 정하기")).toBeTruthy();
  });
  it("신용등급·배지가 그려진다", () => {
    render(<><CreditGradeCard stats={{ loans: [], cash: 50, savedTotal: 50, savingProducts: 1 }} /><BadgeShelf stats={{ totalAssets: 2_000_000, parkingBalance: 10 }} /></>);
    expect(screen.getByLabelText("신용등급 1등급")).toBeTruthy();
    expect(screen.getByText("백만장자")).toBeTruthy();
    expect(screen.getByText("통장 주인")).toBeTruthy();
  });
});

describe("대시보드 카드", () => {
  it("오늘의 제안 — 닫으면 그날은 안 보인다", () => {
    const view = render(<MemoryRouter><TodayTip userId="u" userDoc={{ cash: 10 }} /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("오늘의 제안 닫기"));
    expect(screen.queryByText(/오늘의 제안/)).toBeNull();
    view.unmount();
    render(<MemoryRouter><TodayTip userId="u" userDoc={{ cash: 10 }} /></MemoryRouter>);
    expect(screen.queryByText(/오늘의 제안/)).toBeNull();
  });
  it("시작 도우미 — 남은 것만 세고, 그만 보기를 누르면 사라진다", () => {
    render(<MemoryRouter><TeacherStartGuide classCode="T1" studentCount={20} jobCount={3} /></MemoryRouter>);
    expect(screen.getByText("남은 것 2개")).toBeTruthy();
    fireEvent.click(screen.getByText("그만 보기"));
    expect(screen.queryByText(/시작 도우미/)).toBeNull();
  });
  it("퀴즈 — 상금을 미리 알리고, 고른 보기만 서버에 한 번 보내고, 서버가 준 상금을 보여 준다", async () => {
    quizReply = { success: true, correct: true, reward: 10000, stats: { day: dayKeyKST(), total: 1, correct: 1, streak: 1, lastCorrect: true } };
    const onReward = vi.fn();
    render(<EconQuizCard userId="u1" rawStats={null} classCode="t1abcd" onReward={onReward} />);
    expect(await screen.findByText(/맞히면 1만/)).toBeTruthy();
    fireEvent.click(screen.getByText("풀어 보기"));
    const buttons = await waitFor(() => { const b = screen.getAllByRole("button"); expect(b.length).toBe(4); return b; });
    // 글은 누르기 **전에** 적어 둔다 — 고른 보기가 정답인 날엔 누른 뒤 «✓»가 붙어 날짜에 따라 깨졌다(2026-11-14).
    const pickedText = buttons[2].textContent;
    fireEvent.click(buttons[2]);
    await screen.findByRole("status");
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toBe("quiz");
    expect(saved[0][1]).toBe(dayKeyKST());
    expect(typeof saved[0][2]).toBe("string");
    expect(saved[0][3]).toBe(pickedText); // 위치가 아니라 보기 글을 보낸다
    expect(await screen.findByText(/상금 1만.*들어왔어요/)).toBeTruthy();
    expect(onReward).toHaveBeenCalledTimes(1);
    fireEvent.click(buttons[1]);
    expect(saved).toHaveLength(1);
  });
  it("퀴즈 — 서버가 실패하면 «상금은 안 들어왔다»고 말한다", async () => {
    quizReply = Object.assign(new Error("unavailable"), { code: "functions/unavailable" });
    render(<EconQuizCard userId="u1" rawStats={null} classCode="t1abcd" />);
    fireEvent.click(screen.getByText("풀어 보기"));
    const buttons = await waitFor(() => { const b = screen.getAllByRole("button"); expect(b.length).toBe(4); return b; });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText(/상금은 안 들어왔어요/)).toBeTruthy();
  });
  it("퀴즈 — 오늘 이미 풀었으면 다시 풀 수 없다", () => {
    render(<EconQuizCard userId="u1" rawStats={{ day: dayKeyKST(), total: 3, correct: 2, streak: 3, lastCorrect: true }} />);
    expect(screen.queryByText("풀어 보기")).toBeNull();
    expect(screen.getByText(/오늘 정답/)).toBeTruthy();
  });
});
