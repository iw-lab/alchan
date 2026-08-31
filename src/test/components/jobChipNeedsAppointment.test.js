// 급여에 안 세어지는 직업 칩을 **화면에서 구별해 보여주는지** 지킨다.
//
// 배경(2026-08-31 오석모 선생님 신고): "직업 개수가 똑같은데 주급이 다르게 들어왔다".
// 실측: 그 반 학생 9명이 임명 전용 직업(판사 7 · 경찰청장 1 · 대통령 1)을 **자기가 골라**
// selectedJobIds 에 갖고 있었다. 서버는 그런 것을 급여에 세지 않는다 — 교사가
// appointedJobIds 로 임명한 것만 센다(자가임명 = 합의금·세금징수 권한 탈취 통로라 봉인).
// 그런데 화면은 유효한 직업과 **똑같이** 그려서, 칩 3개인데 2개분만 나오는 이유를
// 선생님이 숫자를 세어 보기 전엔 알 수가 없었다.
//
// 데이터는 그때 한 번 정리했지만, 앞으로 교사가 임명을 미루면 같은 상태가 또 생긴다.
// 그래서 "안 세어지는 칩은 눈에 띄게 다르다"를 계약으로 못박는다.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isAppointedOnlyJob } from "../../utils/jobPermissions";

const SRC = readFileSync(
  resolve(process.cwd(), "src/components/modals/AdminSettingsModal.js"),
  "utf8",
);

/** 화면이 하는 판정과 같은 규칙 — 임명 전용인데 임명 목록에 없으면 급여에 안 센다 */
const needsAppointment = (job, appointedIds) =>
  isAppointedOnlyJob(job) && !new Set(appointedIds).has(job.id);

describe("무효 칩 판정 규칙", () => {
  const 판사 = { id: "j1", title: "판사" };
  const 변호사 = { id: "j2", title: "변호사" };
  const 대통령 = { id: "j3", title: "대통령" };
  const 커스텀임명직 = { id: "j4", title: "우리반 반장", appointedOnly: true };

  it("학생이 스스로 고른 판사는 급여에 안 세어진다", () => {
    expect(needsAppointment(판사, [])).toBe(true);
  });

  it("교사가 임명한 판사는 세어진다", () => {
    expect(needsAppointment(판사, ["j1"])).toBe(false);
  });

  it("일반 직업은 임명 없이도 세어진다", () => {
    expect(needsAppointment(변호사, [])).toBe(false);
  });

  it("대통령도 임명 전용이다(보너스 200만이 붙는 자리)", () => {
    expect(needsAppointment(대통령, [])).toBe(true);
    expect(needsAppointment(대통령, ["j3"])).toBe(false);
  });

  it("직함이 아니라 appointedOnly 플래그로 지정한 직업도 잡는다", () => {
    expect(needsAppointment(커스텀임명직, [])).toBe(true);
  });
});

describe("배선 — 학생 카드가 실제로 갈라 그린다", () => {
  it("⭐ 칩마다 '임명 필요'인지 계산한다", () => {
    expect(SRC).toContain("const needsAppointment =");
    expect(SRC).toMatch(
      /isAppointedOnlyJob\(job\) && !appointedSet\.has\(jobId\)/,
    );
    // 임명 목록은 appointedJobIds 에서만 온다 — selectedJobIds 를 섞으면 판정이 무너진다.
    expect(SRC).toMatch(/new Set\(\s*\n?\s*toJobIdArray\(student\.appointedJobIds\),?\s*\n?\s*\)/);
  });

  it("⭐ 무효 칩은 **다르게 보인다**(같은 스타일로 그리면 의미가 없다)", () => {
    const block = SRC.slice(
      SRC.indexOf("jobChips.length > 0"),
      SRC.indexOf("직업 없음"),
    );
    expect(block).toContain("c.needsAppointment");
    expect(block).toContain("임명 필요");
    // 유효/무효가 서로 다른 클래스여야 한다
    expect(block).toMatch(/bg-slate-100[^]{0,80}line-through/);
    expect(block).toMatch(/bg-amber-50/);
  });

  it("⭐ 몇 개가 급여에서 빠지는지 숫자로 알려 준다", () => {
    expect(SRC).toContain("const unpaidCount =");
    expect(SRC).toMatch(/unpaidCount > 0 &&/);
    expect(SRC).toMatch(/급여에 포함되지 않습니다/);
  });
});
