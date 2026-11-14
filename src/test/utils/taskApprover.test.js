// 할일 승인자 판정 — 서버(functions/jobUtils.js)와 화면(src/utils/jobPermissions.js)이 같은 답을 내야 한다.
// 2026-11-14 사용자 결정 «대통령 할일 승인은 국무총리가». 국무총리 직업이 없는 옛 학급은 대통령이 계속한다.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  isTaskApproverByJob as clientRule,
  taskApproverScope as clientScope,
} from "../../utils/jobPermissions";
import { readFileSync } from "node:fs";
import defaults from "../../../functions/classroomDefaults.json";

const require = createRequire(import.meta.url);
const server = require("../../../functions/jobUtils.js");

const JOBS = [
  { id: "p", title: "대통령" },
  { id: "pm", title: "국무총리" },
  { id: "j", title: "판사" },
  { id: "a", title: "아르바이트" },
];
const OLD_CLASS = JOBS.filter((j) => j.id !== "pm"); // 국무총리 직업이 없는 옛 학급
const mapOf = (jobs) => new Map(jobs.map((j) => [j.id, j]));
const both = (user, jobs) => {
  const c = clientRule(user, jobs);
  const s = server.isTaskApproverByJob(user, mapOf(jobs));
  expect(c, "서버와 화면 판정이 다르다").toBe(s);
  return s;
};

describe("할일 승인자 = 국무총리", () => {
  it("임명된 국무총리는 승인한다", () => {
    expect(both({ appointedJobIds: ["pm"] }, JOBS)).toBe(true);
  });
  it("⭐ 국무총리가 있는 학급의 대통령은 승인하지 못한다", () => {
    expect(both({ appointedJobIds: ["p"] }, JOBS)).toBe(false);
  });
  it("⭐ 국무총리 직업이 없는 옛 학급은 대통령이 계속 승인한다", () => {
    expect(both({ appointedJobIds: ["p"] }, OLD_CLASS)).toBe(true);
  });
  it("⭐ 스스로 고른(selectedJobIds) 국무총리는 인정하지 않는다", () => {
    expect(both({ selectedJobIds: ["pm"] }, JOBS)).toBe(false);
  });
  it("다른 직업은 승인하지 못한다", () => {
    expect(both({ appointedJobIds: ["j"], selectedJobIds: ["a"] }, JOBS)).toBe(false);
  });
});

describe("승인 범위 — 국무총리 할일은 대통령이(2026-11-14 사용자 결정)", () => {
  const scope = (user, jobs) => {
    const c = clientScope(user, jobs);
    const sv = server.taskApproverScope(user, mapOf(jobs));
    expect(c, "서버와 화면 범위가 다르다").toBe(sv);
    return sv;
  };
  it("국무총리는 전부(all)", () => {
    expect(scope({ appointedJobIds: ["pm"] }, JOBS)).toBe("all");
  });
  it("⭐ 국무총리가 있는 학급의 대통령은 국무총리 것만(approverOnly)", () => {
    expect(scope({ appointedJobIds: ["p"] }, JOBS)).toBe("approverOnly");
  });
  it("국무총리 직업이 없는 옛 학급의 대통령은 전부", () => {
    expect(scope({ appointedJobIds: ["p"] }, OLD_CLASS)).toBe("all");
  });
  it("대통령·국무총리를 겸하면 전부", () => {
    expect(scope({ appointedJobIds: ["p", "pm"] }, JOBS)).toBe("all");
  });
  it("⭐ 스스로 고른 대통령·다른 직업은 범위 없음", () => {
    expect(scope({ selectedJobIds: ["p"] }, JOBS)).toBe(null);
    expect(scope({ appointedJobIds: ["j"] }, JOBS)).toBe(null);
  });
  it("⭐ 서버는 대통령 승인 때 신청자가 «지금» 국무총리인지 트랜잭션 안에서 읽는다", () => {
    const src = readFileSync("functions/index.js", "utf8");
    const at = src.indexOf('if (scope === "approverOnly")');
    expect(at).toBeGreaterThan(0);
    const win = src.slice(at, at + 600);
    expect(win).toContain("transaction.get(");
    expect(win).toContain("approval.studentId");
    expect(win).toContain("hasJobTitle(requesterDoc.data(), approverJobMap, TASK_APPROVER_TITLE)");
    // 자기 승인 금지가 그대로 남아 있다(국무총리·대통령 겸직이 자기 것을 승인하는 길 차단)
    expect(src).toContain("if (approval.studentId === uid)");
  });
});

describe("새 학급 기본값(정본 classroomDefaults.json)", () => {
  const titles = defaults.jobs.map((j) => j.title);
  it("⭐ 나라를 굴리는 기본 직업이 들어 있다", () => {
    for (const t of ["대통령", "국무총리", "판사", "국회의원", "경찰청장", "국세청 직원"]) {
      expect(titles, `${t} 가 기본 직업에 없다`).toContain(t);
    }
    expect(new Set(titles).size).toBe(titles.length);
  });
  it("⭐ 권한직은 제목 목록이 아니라 플래그로도 표시돼 있다", () => {
    for (const t of server.APPOINTED_FALLBACK_TITLES) {
      const job = defaults.jobs.find((j) => j.title === t);
      expect(job?.appointedOnly, `${t} 에 appointedOnly 가 없다`).toBe(true);
    }
  });
  it("모든 직업에 안내(하는 일·뽑는 법)와 할일이 있다", () => {
    for (const j of defaults.jobs) {
      expect(j.description?.length, `${j.title} 설명 없음`).toBeGreaterThan(5);
      expect(j.howToSelect, `${j.title} 뽑는 법 없음`).toContain("뽑는 법");
      // 장관·학급회장처럼 할일 없이 자리만 있는 직업도 있다(기준 학급 그대로).
      expect(Array.isArray(j.tasks)).toBe(true);
    }
  });
  it("기본 아이템이 충분히 있다", () => {
    expect(defaults.storeItems.length).toBeGreaterThanOrEqual(10);
  });
});
