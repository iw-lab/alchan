/**
 * 고소장 수정이 접수일을 망가뜨리지 않는다 (2026-11-02 «기소를 하면 사라져»).
 *
 * 수정 저장이 화면용으로 바꾼 사건 전체(...complaint)를 덮어써서 접수일이 Timestamp → 글자 → null 로
 * 망가졌다. 목록은 접수일 순 최근 100건만 읽어서, 접수일이 null 인 사건은 목록에서 사라졌다(BG6QUC 9건).
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const SRC = readFileSync("src/pages/government/Court.js", "utf8");
const save = SRC.slice(SRC.indexOf("const handleSaveEdit"), SRC.indexOf("const handleCloseEditModal"));

describe("고소장 수정 저장", () => {
  it("⭐ 고친 칸(사유·원하는 해결·피고소인)만 쓴다", () => {
    expect(save).toContain("const dataToSave = { reason, desiredResolution, defendantId }");
    expect(save, "사건 전체를 펼쳐 덮어쓴다").not.toMatch(/\.\.\.dataToSave\s*\}\s*=\s*updatedComplaintData/);
    expect(save).not.toMatch(/\.\.\.updatedComplaintData/);
  });
  it("⭐ 글자로 저장된 옛 날짜도 화면에서 null 로 바꾸지 않는다", () => {
    expect(SRC).toContain('typeof v === "string" ? v : null');
    expect(SRC).toContain("submissionDate: toIsoDate(doc.data().submissionDate)");
  });
});
