/**
 * 교사가 학생 비밀번호를 초기화할 수 있다 — 그리고 **선생님 계정은 못 바꾼다.**
 *
 * 2026-08-27 이전 상태:
 *   서버(adminResetUserPassword)는 교사에게 열려 있었고 "같은 학급인가"만 검사했다.
 *   화면은 그 버튼을 `isSuperAdmin &&` 로 감싸 교사에겐 아예 안 그렸다. 그래서
 *   ① 교사는 학생 비번을 못 바꿨고(교실에서 실제로 막혔다)
 *   ② 그런데 F12 로 CF 를 직접 부르면 **같은 학급의 다른 교사·슈퍼관리자 비번을
 *      바꿀 수 있었다** — 비번을 바꾼 뒤 그 계정으로 로그인하면 그대로 계정 탈취다.
 *   화면이 안 그렸을 뿐 서버는 열려 있었던, 전형적인 "UI 가 보안 경계인 줄 아는" 자리.
 *
 * 지금:
 *   교사 = 같은 학급 + 대상이 학생일 때만. 슈퍼관리자 = 종전대로 제한 없음.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
const UI = readFileSync(
  resolve(process.cwd(), "src/components/modals/AdminSettingsModal.js"),
  "utf8",
);

const sliceFn = (name) => {
  const start = SRC.indexOf(`exports.${name} = onCall(`);
  expect(start, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
  const next = SRC.indexOf("\nexports.", start + 10);
  return SRC.slice(start, next === -1 ? SRC.length : next);
};
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FN = codeOnly(sliceFn("adminResetUserPassword"));

describe("비밀번호 초기화 — 서버 권한", () => {
  it("⭐ 관리자(교사·슈퍼관리자)만 부를 수 있다", () => {
    expect(FN).toContain("if (!isAdmin && !isSuperAdmin)");
  });

  it("⭐ 교사는 자기 학급만", () => {
    expect(FN).toContain("targetUserData.classCode !== classCode");
  });

  it("⭐ 교사는 **학생만** — 선생님·슈퍼관리자 계정은 거부한다", () => {
    // 이게 없으면 같은 학급 교사끼리 서로 비번을 바꿀 수 있고,
    // 슈퍼관리자가 그 학급 코드를 갖고 있으면 앱 전체가 넘어간다.
    for (const guard of [
      "targetUserData.isAdmin === true",
      "targetUserData.isSuperAdmin === true",
      'targetUserData.role === "admin"',
    ]) {
      expect(FN, `${guard} 검사가 없다`).toContain(guard);
    }
  });

  it("⭐ 대상 검사가 전부 비밀번호 변경보다 먼저다", () => {
    const write = FN.indexOf("admin.auth().updateUser(");
    expect(write, "비밀번호 변경 호출을 찾지 못했다").toBeGreaterThan(-1);
    for (const guard of [
      "targetUserData.classCode !== classCode",
      "targetUserData.isAdmin === true",
      "if (!isAdmin && !isSuperAdmin)",
    ]) {
      // ⚠️ **먼저 존재를 확인한다.** indexOf 가 -1 이면 "앞에 있다"가 자동으로 참이 되어
      //    가드를 통째로 지워도 이 테스트가 초록불로 남는다.
      const at = FN.indexOf(guard);
      expect(at, `${guard} 가 사라졌다`).toBeGreaterThan(-1);
      expect(at, `${guard} 가 비밀번호 변경보다 뒤에 있다`).toBeLessThan(write);
    }
  });

  it("⭐ 슈퍼관리자의 권한은 좁히지 않았다 (앱 관리자는 교사 비번도 재설정해야 한다)", () => {
    // 대상 제한은 `isAdmin && !isSuperAdmin` 분기 **안에만** 있어야 한다.
    const branch = FN.indexOf("if (isAdmin && !isSuperAdmin)");
    expect(branch).toBeGreaterThan(-1);
    expect(FN.indexOf("targetUserData.isAdmin === true")).toBeGreaterThan(branch);
  });
});

describe("형제 함수가 뒤처지지 않는다", () => {
  // 🔴 2026-08-27 Claude 레인 CRITICAL. `resetStudentPassword` 는 같은 일을 하는 형제였는데
  //    검사가 한 칸씩 뒤처졌다: 2026-08-03 학급 경계 검사가 한쪽에만 → 그때 맞췄고,
  //    2026-08-27 "대상이 학생인가" 가 다시 한쪽에만 → **같은 모양으로 또 어긋났다.**
  //    그 사이 이 함수는 같은 학급 교사·슈퍼관리자 비번을 바꿀 수 있었다(호출처 0곳이지만
  //    배포된 onCall 은 devtools 로 부를 수 있다). "앞으로 잘 동기화하자" 는 두 번 실패한
  //    처방이라 하나를 없앴다.
  const RETIRED = codeOnly(sliceFn("resetStudentPassword"));

  it("⭐ resetStudentPassword 는 폐기됐다 (비밀번호를 바꾸지 않는다)", () => {
    expect(RETIRED).toContain("permission-denied");
    expect(RETIRED, "폐기 함수가 아직 비밀번호를 바꾼다").not.toContain(
      "updateUser(",
    );
    // ⚠️ 본문을 남긴 채 throw 만 얹으면 "throw 만 지우면 되살아나는" 함정이 된다
    //    (이 저장소의 completeTask 주석이 같은 말을 한다). 본문이 통째로 없어야 한다.
    expect(RETIRED, "죽은 본문이 남아 있다").not.toContain("getUserByEmail(");
  });

  it("⭐ 비밀번호를 바꾸는 CF 는 이제 하나뿐이다", () => {
    // onCall 로 노출된 것 중 admin.auth().updateUser(...password...) 를 하는 함수를 센다.
    // 늘어나면 이 테스트가 먼저 알려준다 — 형제가 생기는 순간이 어긋나기 시작하는 순간이다.
    const callables = [...SRC.matchAll(/^exports\.(\w+) = onCall\(/gm)].map((m) => m[1]);
    const changers = callables.filter((n) => {
      const body = codeOnly(sliceFn(n));
      return /updateUser\([\s\S]{0,200}password/.test(body);
    });
    expect(changers, `비밀번호를 바꾸는 onCall 이 늘었다: ${changers.join(", ")}`).toEqual([
      "adminResetUserPassword",
    ]);
  });
});

describe("비밀번호 초기화 — 화면", () => {
  it("⭐ 버튼이 더 이상 슈퍼관리자 전용이 아니다", () => {
    // 이 문자열이 살아 있으면 교사에게 버튼이 안 보인다(원래 증상).
    const at = UI.indexOf("handleResetPassword(member.id)");
    expect(at, "비밀번호 초기화 버튼을 찾지 못했다").toBeGreaterThan(-1);
    expect(UI).toContain("const canResetPassword = isSuperAdmin || !targetIsStaff");
  });

  it("⭐ 교사에게는 선생님 계정 카드의 버튼이 숨는다", () => {
    expect(UI).toContain("member.isAdmin === true");
    expect(UI).toContain("member.isSuperAdmin === true");
    // 편의 숨김일 뿐 보안 경계가 아니다 — 서버가 같은 판정을 다시 한다(위 describe).
    expect(FN).toContain("targetUserData.isAdmin === true");
  });

  it("⭐ 관리자 지정/해제는 여전히 슈퍼관리자 전용이다", () => {
    // 버튼 블록을 열면서 이것까지 같이 열리면 교사가 스스로 슈퍼관리자가 될 수 있다.
    const at = UI.indexOf("toggleAdminStatus(member.id, member.isAdmin)");
    expect(at).toBeGreaterThan(-1);
    const before = UI.slice(Math.max(0, at - 300), at);
    expect(before, "관리자 토글이 isSuperAdmin 게이트를 잃었다").toContain(
      "isSuperAdmin && !member.isSuperAdmin",
    );
  });
});
