/**
 * 「기능 켜기 / 끄기」 화면이 **저장 형태를 뒤집지 않는다**.
 *
 * 학생에게 감출 기능은 `settings/menuLocks_{classCode}.lockedItemIds` = **끈 것 목록**으로
 * 저장된다. 화면에서는 "체크 = 켜짐"이 자연스러워서 표시만 뒤집었다.
 * 저장 의미까지 뒤집으면 이미 저장해 둔 학급들의 데이터를 전부 이관해야 한다 —
 * 그 사이 잠근 기능이 통째로 열리거나 멀쩡한 기능이 전부 잠긴다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const MODAL = readFileSync(
  resolve(process.cwd(), "src/components/modals/AdminSettingsModal.js"),
  "utf8",
);
// 이 섹션만 잘라 본다(모달엔 다른 설정도 많다).
const SECTION = MODAL.slice(
  MODAL.indexOf("{/* 메뉴(기능) 잠금 섹션 */}"),
  MODAL.indexOf("💾 기능 설정 저장") + 200,
);

describe("기능 켜기 / 끄기", () => {
  it("⭐ 저장 형태는 여전히 '끈 것 목록'이다", () => {
    // 저장/로드 경로가 lockedItemIds 를 그대로 쓰는지 — 여기가 뒤집히면 데이터 이관이 필요하다.
    expect(MODAL).toContain("lockedItemIds");
    expect(MODAL).toContain("menuLocks_${userClassCode}");
  });

  it("⭐ 표시만 뒤집는다 — 체크가 '켜짐'이다", () => {
    expect(SECTION).toContain("const enabled = !locked;");
    expect(SECTION).toContain("checked={enabled}");
  });

  it("⭐ 토글 동작 자체는 그대로다(끈 목록에 넣고 뺀다)", () => {
    // 표시를 뒤집었다고 핸들러까지 뒤집으면 체크가 반대로 동작한다.
    expect(SECTION).toContain("onChange={() => toggleLockItem(it.id)}");
  });

  it("⭐ 몇 개가 켜져 있는지 요약해 보여준다", () => {
    expect(SECTION).toContain("개를 켜 두셨어요");
  });

  it("⭐ 주소로도 못 들어간다는 걸 알려준다", () => {
    // Phase 2 에서 라우트 가드를 붙였다 — 선생님이 그 효과를 알아야 안심하고 끈다.
    expect(SECTION).toContain("주소로도 들어갈 수 없어요");
  });
});
