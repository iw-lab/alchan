// 「다음 지급 예상」 카드가 **학급 설정을 실제로 읽고** 계산하는지 지킨다.
//
// 배경(2026-08-31 오석모 선생님 보고): "화면이랑 실제 지급액이 다르다".
// 실측: 심선생 반 21명 **전원**이 화면에 실지급보다 497,307원 낮게 표시됐다.
//   화면 495만 / 실지급 4,887,912 · 화면 315만 / 실지급 3,537,912 …
// 원인은 계산식이 아니라 **로드 조건**이었다. loadSalarySettings() 는
// `studentMemberSubTab === "salary"` 일 때만 돌았는데, 예상 카드는 **학생 목록**
// 서브탭에 있다. 그래서 그 화면은 언제나 초기값(배수 1·상한 5·세율 10%)으로 계산했고,
// 주간 복리 인상(salaryBaseMultiplier)이 통째로 빠졌다.
//
// 같은 실수가 2024~2026 사이 이 파일에서 두 번 났다 —
// 처음엔 "deps 에만 있고 호출이 없어서", 이번엔 "한 서브탭만 고쳐서".
// 그래서 조건 자체를 단언한다.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "src/components/modals/AdminSettingsModal.js"),
  "utf8",
);

/** loadSalarySettings 를 호출하는 useEffect 본문만 잘라낸다 */
const loaderEffect = () => {
  const call = SRC.indexOf("loadSalarySettings();");
  expect(call).toBeGreaterThan(-1);
  // 그 호출을 감싼 useEffect 의 시작점까지 거슬러 올라간다
  const start = SRC.lastIndexOf("useEffect(", call);
  // deps 배열이 끝나는 `]);` 까지 포함해야 한다 — 고정 길이로 자르면 배열이 잘려
  // "userClassCode 가 없다"는 거짓 실패가 난다(2026-08-31 실제로 한 번 겪음).
  const depsStart = SRC.indexOf("}, [", call);
  const end = SRC.indexOf("]);", depsStart);
  expect(depsStart).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(depsStart);
  return SRC.slice(start, end + 3);
};

describe("급여 예상 카드는 학급 설정을 읽고 그린다", () => {
  it("⭐ 로드가 서브탭에 묶여 있지 않다", () => {
    const eff = loaderEffect();
    // 학생 목록·급여 설정 **둘 다** 같은 설정을 쓴다. 한쪽만 로드하면 다른 쪽이 초기값이 된다.
    expect(eff).not.toMatch(/studentMemberSubTab === "salary"/);
    expect(eff).toContain('adminSelectedMenu === "studentAndMember"');
  });

  it("⭐ 학급 코드가 바뀌면 다시 읽는다", () => {
    const eff = loaderEffect();
    expect(eff).toContain("userClassCode");
  });

  it("⭐ 로더가 학급별 문서를 보고, 인상 배수를 상태에 싣는다", () => {
    expect(SRC).toContain("`salarySettings_${userClassCode}`");
    // 배수를 읽어서 state 로 넣는 경로가 살아 있어야 한다
    expect(SRC).toMatch(/const rawMultiplier = data\.salaryBaseMultiplier;/);
    expect(SRC).toMatch(/salaryBaseMultiplier,?\s*\n?\s*(maxJobsPerStudent|\})/);
  });

  it("⭐ 예상 계산이 인상 배수를 실제로 쓴다", () => {
    // 배수를 읽어 놓고 계산에 안 쓰면 화면은 그대로 틀린다.
    expect(SRC).toMatch(
      /computeClientEffectiveBase\(\s*\n?\s*salarySettings\.salaryBaseMultiplier,?\s*\n?\s*\)/,
    );
    // 상한도 학급 설정을 따라야 한다(오석모 반은 3, 심선생 반은 5).
    expect(SRC).toContain("salarySettings.maxJobsPerStudent");
  });
});
