/**
 * 잠근 메뉴는 **주소로도** 못 들어간다.
 *
 * 2026-08-20 실측: 학급별 메뉴 잠금(`settings/menuLocks_{classCode}`)은 이미 있었는데
 * `lockedItemIds` 가 **사이드바에서만** 쓰였다. 라우트 가드가 없어서, 주소를 아는 학생이
 * `/stock-trading` 을 직접 치면 그대로 들어갔다 — 잠금이 "표시"에만 걸려 있었다.
 *
 * 이 가드는 교육적 편의(안 쓰는 기능 감추기)이지 보안 경계가 아니다.
 * 돈·권한은 firestore.rules 와 Cloud Functions 가 막는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const LAYOUT = read("src/components/AlchanLayout.js");
const LAYOUT_CODE = codeOnly(LAYOUT);
const SIDEBAR_CODE = codeOnly(read("src/components/AlchanSidebar.js"));
const CTX_CODE = codeOnly(read("src/contexts/MenuLocksContext.js"));

// ProtectedRoute 본문만 잘라 본다(파일엔 AdminRoute 등 다른 가드도 있다).
const GUARD = (() => {
  const start = LAYOUT_CODE.indexOf("const ProtectedRoute = ({ children }) => {");
  expect(start, "ProtectedRoute 를 찾지 못했다").toBeGreaterThan(-1);
  const end = LAYOUT_CODE.indexOf("const AdminRoute", start);
  return LAYOUT_CODE.slice(start, end === -1 ? start + 3000 : end);
})();

describe("잠근 메뉴 라우트 가드", () => {
  it("⭐ ProtectedRoute 가 잠금 목록을 본다", () => {
    expect(GUARD).toContain("useMenuLocks()");
    expect(GUARD).toContain("lockedItemIds.includes(menuId)");
  });

  it("⭐ 잠긴 경로면 다른 곳으로 돌려보낸다", () => {
    expect(GUARD).toMatch(/<Navigate to="\/dashboard\/tasks" replace \/>/);
  });

  it("⭐ 잠금을 읽기 전에는 튕기지 않는다", () => {
    // ready 없이 판정하면 로드 전 기본값(빈 목록)이 아니라 **판정 자체가 이른** 상태에서
    // 정상 페이지가 깜빡이며 쫓겨난다.
    expect(GUARD).toContain("locksReady");
    const decide = GUARD.indexOf("lockedItemIds.includes(menuId)");
    const gate = GUARD.indexOf("if (locksReady");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(decide);
  });

  it("⭐ 선생님은 면제된다", () => {
    // 관리자 설정의 안내가 "학생에게만 숨겨집니다" 이므로 교사는 계속 볼 수 있어야 한다.
    expect(GUARD).toContain("!isTeacher");
    expect(GUARD).toMatch(/isAdmin === true/);
    expect(GUARD).toMatch(/isSuperAdmin === true/);
  });

  it("⭐ 경로→메뉴id 표를 렌더마다 다시 만들지 않는다", () => {
    // 43개 라우트가 이 가드를 지난다. 매 렌더 재구성하면 낭비다.
    expect(LAYOUT_CODE).toContain("const PATH_TO_MENU_ID = (() => {");
    // 컴포넌트 밖(모듈 수준)에 있어야 한다.
    expect(LAYOUT_CODE.indexOf("const PATH_TO_MENU_ID")).toBeLessThan(
      LAYOUT_CODE.indexOf("const ProtectedRoute"),
    );
  });
});

describe("잠금 값의 출처가 하나다", () => {
  it("⭐ 사이드바가 스스로 다시 읽지 않는다", () => {
    // 두 곳이 따로 읽으면 읽기가 두 배가 되고, 값이 갈려 표시와 접근이 어긋난다.
    expect(SIDEBAR_CODE).toContain("useMenuLocks()");
    expect(SIDEBAR_CODE).not.toContain("menuLocks_");
  });

  it("⭐ 잠금 조회가 데이터 계층에 있다", () => {
    expect(CTX_CODE).toContain("fetchMenuLockedItemIds");
    expect(CTX_CODE).not.toContain("firebase/firestore");
  });

  it("⭐ 교사가 저장하면 즉시 반영된다", () => {
    expect(CTX_CODE).toContain('window.addEventListener("menuLocks:changed"');
  });

  it("⭐ 잠금 조회가 실패해도 화면을 막지 않는다(fail-open)", () => {
    // 잠금은 편의 기능이다 — 못 읽었다고 정상 화면을 막으면 손해가 더 크다.
    const SETTINGS = read("src/firebase/db/settings.js");
    const fn = SETTINGS.slice(SETTINGS.indexOf("export const fetchMenuLockedItemIds"));
    expect(fn).toContain("return [];");
  });
});
