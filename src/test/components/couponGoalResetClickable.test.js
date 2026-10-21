/**
 * 쿠폰 목표 카드의 «초기화»·추첨 단추가 **실제로 눌리는가**.
 *
 * 왜 이 테스트가 있나(2026-10-21 선생님 «쿠폰 목표 탭에 초기화 버튼이 안 눌림»)
 *   카드 오른쪽 위 배경 장식 원(absolute)이 위치 없는 헤더보다 위에 그려져
 *   오른쪽 끝 «초기화» 단추를 덮었다. 브라우저 실측: 단추 가운데의 elementFromPoint = 장식 div.
 *   jsdom 은 겹침을 계산하지 못하므로 «겹칠 수 있는 장식은 클릭을 받지 않는다»를 불변식으로 잰다.
 *
 * 불변식
 *   ① 카드 배경 장식(aria-hidden absolute)은 pointer-events: none
 *   ② 단추가 든 헤더는 장식보다 위(position + z-index)
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CouponGoal from "../../components/CouponGoal";

const base = {
  classCouponGoal: 1000, goalProgress: 164, myContribution: 10, currentCoupons: 3, couponValue: 1000,
  setShowDonateModal: () => {}, setShowSellCouponModal: () => {}, setShowDonationHistoryModal: () => {}, setShowGiftCouponModal: () => {},
};

describe("쿠폰 목표 · 초기화 단추가 장식에 가리지 않는다", () => {
  for (const goalAchieved of [false, true]) {
    it(`목표 ${goalAchieved ? "달성 후" : "달성 전"}`, () => {
      const { container } = render(
        <CouponGoal {...base} goalAchieved={goalAchieved} resetGoalButton={() => {}} randomDrawButton={() => {}} setNewGoalButton={goalAchieved ? () => {} : null} />,
      );
      const decos = [...container.querySelectorAll('.absolute[aria-hidden="true"]')];
      expect(decos.length).toBeGreaterThan(0);
      for (const el of decos) expect(el.style.pointerEvents).toBe("none");
      const btn = screen.getByRole("button", { name: "초기화" });
      const header = btn.closest("div.flex.justify-between");
      expect(header.style.position).toBe("relative");
      expect(Number(header.style.zIndex)).toBeGreaterThan(0);
    });
  }
});
