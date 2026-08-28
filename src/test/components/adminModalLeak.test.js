/**
 * 🔴 2026-08-28 라이브 장애 — 학생 화면이 **인사말만 남고 통째로 비었다.**
 *
 * 무슨 일이 있었나
 *   관리자 설정 모달의 열림 상태는 새로고침을 견디라고 `sessionStorage` 에 저장된다
 *   (`alchan_adminModal_open` + 그때의 경로). 그런데 그 값은 **탭에 남는다.**
 *   교사가 `/dashboard/tasks` 에서 관리자 설정을 열어 둔 탭에 학생이 로그인하면
 *   초기화 함수가 그 값을 그대로 복원해 `showAdminSettingsModal === true` 가 되고,
 *   본문(나의 직업 할일·공통 할일)이 통째로 숨는다. 정작 모달은 `isAdmin` 이 아니라
 *   렌더되지 않는다 → **아무것도 없는 화면.**
 *
 *   강력 새로고침은 sessionStorage 를 지우지 않는다. 그래서 그 탭에서는 영영 안 고쳐지고,
 *   새 탭에서는 멀쩡해서 "내 맥북에서만 그렇다"로 보였다(라이브에서 그 값 하나만 심어
 *   글자까지 똑같이 재현 확인).
 *
 * 고정하는 불변식: **본문을 가리는 판정은 "열려 있다"가 아니라 "실제로 보인다"여야 한다.**
 *
 * ⚠️ 이 파일은 소스의 구조를 보는 테스트다(Dashboard.js 는 firebase 초기화 때문에
 *    테스트에서 import 하면 죽는다 — pendingJobRace.test.js 머리말 참고).
 *    아래 단언들은 변이 2종(gate 를 showAdminSettingsModal 로 되돌리기·정리 이펙트 제거)으로
 *    실제로 무는 것을 확인했다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const DASH = codeOnly(readFileSync(resolve(process.cwd(), "src/pages/dashboard/Dashboard.js"), "utf8"));

describe("관리자 모달 플래그가 학생 화면을 가리지 않는다", () => {
  it("⭐ '보이는가'를 계산한다 — 열림 플래그 × 관리자 여부", () => {
    expect(DASH, "adminModalOpen 파생값이 없다").toMatch(
      /const adminModalOpen = showAdminSettingsModal && isAdmin\?\.\(\) === true;/,
    );
  });

  it("⭐ 본문 게이트가 **파생값**을 쓴다 (원시 플래그를 쓰면 학생 화면이 빈다)", () => {
    // 본문 = '나의 직업 할일 + 공통 할일' 블록.
    expect(DASH, "본문 게이트가 원시 플래그를 쓴다").toMatch(
      /viewMode === "list" && !adminModalOpen && !adminTabMode/,
    );
    // 원시 플래그가 렌더 게이트에 다시 등장하면 회귀다. 선언·동기화·모달 prop 세 곳만 허용.
    const gateUses = DASH.match(/&&\s*!showAdminSettingsModal/g) || [];
    expect(gateUses, "!showAdminSettingsModal 로 화면을 가리는 곳이 남아 있다").toHaveLength(0);
  });

  it("⭐ 관리자가 아니면 남은 플래그를 지운다 (sessionStorage 까지 정리된다)", () => {
    expect(DASH, "정리 이펙트가 없다").toMatch(
      /if \(showAdminSettingsModal && !isAdmin\?\.\(\)\) setShowAdminSettingsModal\(false\);/,
    );
  });

  it("⭐ 인증 로딩 중에는 지우지 않는다 (교사의 '새로고침 유지'를 부수지 않기)", () => {
    // isAdmin() 은 userDoc 이 오기 전엔 false 다. 가드가 없으면 교사가 새로고침할 때마다
    // 모달이 닫혀 버린다 — 고치려던 것과 다른 것을 부수는 자리.
    expect(DASH).toMatch(/if \(authLoading \|\| !userDoc\?\.id\) return;/);
  });
});
