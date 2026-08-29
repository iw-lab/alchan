/**
 * 직업 승인은 **학급 설정이 아니라 규칙**이다 (2026-08-29 사용자 결정).
 *
 * 무엇이 바뀌었나
 *   전에는 `settings/salarySettings_{classCode}.jobApprovalRequired` 토글이 있었고,
 *   꺼진 학급에서는 학생이 고른 직업이 **즉시** 붙었다. 직업 개수가 주급을 정하므로
 *   (세전 = 200만 + (직업수−1)×50만) 그 경로는 곧 **학생이 자기 주급을 올리는 경로**였다.
 *   임명 전용 직업(대통령·판사 등)만 토글과 무관하게 신청→승인이었고, 화면은 그 차이를
 *   「선생님 허가 필요 / 임명됨」 배지로 설명해야 했다.
 *
 *   이제 학생의 **모든** 직업이 신청→승인이다. 그래서
 *     ① 서버는 승인 여부를 학급 설정에서 읽지 않는다(상수).
 *     ② 화면에는 설명할 '차이'가 없으므로 임명 구분 문구도 없다.
 *
 * ⚠️ 이 파일이 못 잡는 것: 렌더링. `Dashboard.js` 를 import 하면
 *   `firebaseConfig.js` 의 `getAuth(app)` 이 실행되며 죽는다(pendingJobRace.test.js 참고).
 *   그래서 소스 텍스트를 본다 — 문구를 되살리려면 이 파일을 **의도적으로** 고쳐야 한다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const DASH = codeOnly(read("src/pages/dashboard/Dashboard.js"));
const ADMIN = codeOnly(read("src/components/modals/AdminSettingsModal.js"));
const FN = codeOnly(read("functions/index.js"));

describe("학생 화면에서 '임명' 구분이 사라졌다", () => {
  it("⭐ 임명/허가 배지 문구가 없다", () => {
    for (const gone of ["임명됨", "선생님 허가 필요"]) {
      expect(DASH, `학생 화면에 '${gone}' 문구가 남아 있다`).not.toContain(gone);
    }
  });

  it("⭐ 안내 문구·버튼이 승인 여부로 갈라지지 않는다", () => {
    // 갈라지는 순간 "나머지는 바로 저장돼요" 같은 거짓 안내가 되살아난다.
    expect(DASH, "approvalRequired 분기가 화면에 남아 있다").not.toContain(
      "approvalRequired",
    );
    // 학생은 언제나 '신청'이다.
    expect(DASH).toContain('{!isAdmin ? "저장 / 신청하기" : "선택 완료"}');
  });

  it("⭐ 잠긴 자리에는 이유가 보인다 (설명 없는 회색 체크박스 금지)", () => {
    // 이미 맡은 권력직은 학생이 스스로 못 벗는다(해임은 교사 판단). 그 사실을
    // 배지로 말하지 않으면 학생은 '눌리지 않는 칸'만 보게 된다.
    expect(DASH).toContain("선생님만 해제");
    expect(DASH).toContain("{alreadyAppointed && (");
  });
});

describe("승인제 토글이 사라졌다", () => {
  it("⭐ 관리자 설정에 켜고 끄는 스위치가 없다", () => {
    expect(ADMIN, "승인제 체크박스가 남아 있다").not.toContain(
      "tempJobApprovalRequired",
    );
    expect(ADMIN).not.toContain("직업 신청을 선생님이 허가하기");
  });

  it("⭐ 그래도 설정 문서에는 true 를 적는다 (낡은 번들 안내용)", () => {
    // 학생이 옛 번들을 띄워 둔 탭은 이 필드로 안내 문구를 고른다. 지우면 그 탭이
    // "나머지는 바로 저장돼요"라고 거짓말한다 — 서버는 이미 승인을 요구하는데도.
    expect(ADMIN).toContain("jobApprovalRequired: true");
  });

  it("⭐ 서버는 그 필드를 **읽지 않는다** (읽으면 다시 규칙이 된다)", () => {
    const start = FN.indexOf("exports.saveSelectedJobs = onCall(");
    expect(start, "saveSelectedJobs 를 찾지 못했다").toBeGreaterThan(-1);
    const save = FN.slice(start, FN.indexOf("\nexports.", start + 10));
    expect(save).toContain("const approvalRequired = true");
    expect(save, "승인 여부를 학급 설정에서 다시 읽고 있다").not.toContain(
      "jobApprovalRequired",
    );
  });
});
