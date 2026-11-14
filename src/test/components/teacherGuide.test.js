// 시작 가이드 — 처음 쓰는 선생님이 보는 안내가 **실제 규칙과 같은 말**을 하는지 지킨다.
// 안내가 틀리면(예: «대통령이 할일을 승인») 선생님은 안 되는 일을 학생에게 시키게 된다.
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TeacherGuide from "../../pages/admin/TeacherGuide";
import defaults from "../../../functions/classroomDefaults.json";

vi.mock("../../pages/admin/JobApplicationsPanel", () => ({
  default: () => <div data-testid="job-panel" />,
}));

const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("시작 가이드", () => {
  it("⭐ 누가 무엇을 승인하는지 규칙대로 말한다", () => {
    render(<MemoryRouter><TeacherGuide /></MemoryRouter>);
    expect(screen.getByText("친구들의 할일 승인").previousSibling.textContent).toBe("국무총리");
    expect(screen.getByText("통과된 법안 승인 / 거부권").previousSibling.textContent).toBe("대통령");
    expect(screen.getByText(/인사청문회/)).toBeTruthy();
    expect(screen.getByText(/교실에 모여 말로 진행/)).toBeTruthy();
  });

  it("⭐ 안내에 적힌 개수가 실제 기본값과 같다", () => {
    render(<MemoryRouter><TeacherGuide /></MemoryRouter>);
    expect(screen.getByText(new RegExp(`기본 직업 ${defaults.jobs.length}개`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`기본 아이템 ${defaults.storeItems.length}개`))).toBeTruthy();
  });

  it("⭐ 안내의 링크가 전부 실제 라우트다 (죽은 링크 금지)", () => {
    const layout = read("src/components/AlchanLayout.js");
    const { container } = render(<MemoryRouter><TeacherGuide /></MemoryRouter>);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(8);
    for (const h of hrefs) expect(layout, `${h} 라우트가 없다`).toContain(`path="${h}"`);
  });
});

describe("직업 승인은 할일 승인과 다른 화면이다", () => {
  it("⭐ 교사 전용 라우트·사이드바 메뉴가 있다", () => {
    const layout = read("src/components/AlchanLayout.js");
    expect(layout).toMatch(/path="\/admin\/job-approvals"\s+element=\{\s*<AdminRoute>/);
    const side = read("src/components/AlchanSidebar.js");
    expect(side).toMatch(/id: "jobApprovals",[^}]*path: "\/admin\/job-approvals",[^}]*adminOnly: true/);
  });
  it("⭐ 할일 승인 화면에 직업 탭이 남아 있지 않다 (국무총리에게 직업 승인이 보이면 안 된다)", () => {
    const panel = read("src/pages/admin/AdminApprovalPanel.js");
    expect(panel).not.toContain("<JobApplicationsPanel");
    expect(panel).not.toContain('key: "jobs"');
  });
});
