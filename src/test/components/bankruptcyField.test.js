/**
 * 파산 신청이 **읽는 필드**를 지킨다.
 *
 * 2026-08-20 실측: 이 화면은 `userDoc.money` 를 읽고 있었는데, 그 필드를 가진 사용자가
 * 전체 45명 중 슈퍼관리자 1명뿐이었다. `undefined < 0` 이 false 라 **신청 버튼이 누구에게도
 * 뜨지 않았고**, 화면엔 늘 "현재 자산: 0원"만 찍혔다. 현금이 음수인 계정이 9건 있는데도
 * 아무도 쓸 수 없는 기능이었다. 실제 잔액 필드는 `cash` 다.
 *
 * 이 앱은 "휴면 필드를 나중에 배선하다 사고" 를 두 번 기록했다 — 그래서 필드 이름을 테스트로 박는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const COURT = readFileSync(resolve(process.cwd(), "src/pages/government/Court.js"), "utf8");
// 파산 영역만 잘라 본다(파일 전체엔 다른 화면도 들어 있다).
const raw = COURT.slice(
  COURT.indexOf("const handleApplyForBankruptcy"),
  COURT.indexOf("bankruptcy-tab-button"),
);
// ⚠️ 주석은 걷어내고 **코드만** 본다. 안 그러면 "예전엔 userDoc.money 를 읽었다" 같은
//    설명 주석이 스스로 걸려서, 고쳐 놓고도 빨간불이 뜬다(실제로 한 번 걸렸다).
const section = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("파산 신청이 읽는 잔액 필드", () => {
  it("⭐ 죽은 `money` 필드를 다시 읽지 않는다", () => {
    // `userDoc["money"]`·구조분해·별칭까지 잡으려면 이름 자체를 금지하는 게 낫다(codex 지적).
    expect(section).not.toMatch(/\bmoney\b/);
  });

  it("⭐ 실제 잔액 필드 `cash` 로 음수를 판정한다", () => {
    expect(section).toContain("(userDoc?.cash ?? 0) < 0");
  });

  it("⭐ 잔액이 없어도 터지지 않는다 — 보호 없는 toLocaleString 금지", () => {
    // 종전 `userDoc.money.toLocaleString()` 은 필드가 없으면 TypeError 였다.
    const unguarded = section.match(/userDoc\.\w+\.toLocaleString\(\)/g) || [];
    expect(unguarded).toEqual([]);
  });

  it("⭐ 신청 사유에도 같은 필드를 쓴다 — 화면과 기록이 어긋나지 않게", () => {
    expect(section).toContain("자산 ${(userDoc?.cash ?? 0).toLocaleString()}");
  });
});
