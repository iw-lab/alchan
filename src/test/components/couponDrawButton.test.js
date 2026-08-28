/**
 * 🎰 쿠폰 탭의 랜덤뽑기 버튼이 **언제 보이는가**.
 *
 * 왜 이 테스트가 있나
 *   버튼은 원래 `교사 && 목표달성` 일 때만 렌더됐다. 그런데 학급 목표는 달성까지
 *   몇 달이 걸린다(실측 2026-08-28: 164/1000, 92/5000). 그래서 기능은 라이브에
 *   배포돼 있는데 **한 번도 화면에 뜬 적이 없었고**, 선생님은 "안 붙었다"고 봤다.
 *   조건을 `교사` 로 넓히면서, 조용히 되돌아가지 않도록 여기에 못박는다.
 *
 * 불변식
 *   ① 학생에게는 절대 안 보인다(부모가 null 을 준다 = 여기서 렌더 안 함).
 *   ② 교사에게는 목표 달성 여부와 상관없이 보인다.
 *   ③ 달성 전에는 눈에 덜 띈다(깜빡임 없음) — 달성 축하와 구분돼야 한다.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import CouponGoal from "../../components/CouponGoal";

const base = {
  classCouponGoal: 1000,
  goalProgress: 164,
  myContribution: 10,
  currentCoupons: 3,
  couponValue: 1000,
  setShowDonateModal: () => {},
  setShowSellCouponModal: () => {},
  setShowDonationHistoryModal: () => {},
  setShowGiftCouponModal: () => {},
};

const drawBtn = () => screen.queryByRole("button", { name: /랜덤뽑기/ });

describe("쿠폰 탭 · 랜덤뽑기 버튼 노출", () => {
  it("학생에게는 안 보인다", () => {
    render(<CouponGoal {...base} goalAchieved={false} randomDrawButton={null} />);
    expect(drawBtn()).toBeNull();
  });

  it("목표를 달성해도 학생에게는 안 보인다", () => {
    render(<CouponGoal {...base} goalProgress={1200} goalAchieved randomDrawButton={null} />);
    expect(drawBtn()).toBeNull();
  });

  it("교사에게는 목표 달성 전에도 보인다", () => {
    const fn = vi.fn();
    render(<CouponGoal {...base} goalAchieved={false} randomDrawButton={fn} />);
    expect(drawBtn()).not.toBeNull();
  });

  it("교사가 누르면 추첨이 시작된다", () => {
    const fn = vi.fn();
    render(<CouponGoal {...base} goalAchieved={false} randomDrawButton={fn} />);
    drawBtn().click();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("달성 전에는 깜빡이지 않고, 달성하면 깜빡인다", () => {
    const { unmount } = render(
      <CouponGoal {...base} goalAchieved={false} randomDrawButton={() => {}} />,
    );
    expect(drawBtn().style.animation).toBe("none");
    unmount();
    render(<CouponGoal {...base} goalProgress={1200} goalAchieved randomDrawButton={() => {}} />);
    expect(drawBtn().style.animation).toContain("couponPulse");
  });

  it("달성 전 버튼에는 그 사실이 설명으로 붙는다", () => {
    render(<CouponGoal {...base} goalAchieved={false} randomDrawButton={() => {}} />);
    expect(drawBtn().getAttribute("title")).toContain("목표 달성 전");
  });
});

describe("쿠폰 탭 · 부모가 버튼을 넘기는 조건", () => {
  // 페이지는 firebase 초기화 때문에 import 할 수 없다 — 소스를 읽어 조건을 본다
  // (pendingJobRace.test.js 와 같은 방식).
  const SRC = readFileSync(
    resolve(process.cwd(), "src/pages/coupon/CouponGoalPage.js"),
    "utf8",
  );

  it("교사 여부로만 가른다 — 목표 달성을 다시 걸지 않는다", () => {
    expect(SRC).toContain("randomDrawButton={canManageGoal ? handleRandomDraw : null}");
    expect(SRC).not.toContain("canManageGoal && goalAchieved ? handleRandomDraw");
  });

  it("달성 전에 누르면 확인창이 그 사실을 알린다", () => {
    expect(SRC).toContain("아직 목표를 달성하기 전입니다");
    // 확인창에 실제로 실려야 한다 — 문구만 만들어 놓고 안 쓰면 아무도 못 본다
    expect(SRC).toMatch(/notYet\s*\+/);
  });
});
