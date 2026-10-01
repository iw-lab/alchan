/**
 * 사이드바의 «학습 사이트» 는 펼침 목록이 아니라 갤러리(/learning-sites)로 가는 단일 링크다.
 * 2026-10-01 사용자 지시: 갤러리가 생겼으니 왼쪽에 사이트 수십 개가 쭉 나열되는 건 이제 필요 없다.
 * (즐겨찾기·자주 쓴 것·제작자별 묶음은 갤러리가 맡는다.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const code = readFileSync(resolve(process.cwd(), "src/components/AlchanSidebar.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("사이드바 학습 사이트 = 단일 링크", () => {
  it("학습 사이트 카테고리는 flat 로 그린다(펼침 토글 없음)", () => {
    expect(code).toMatch(/flat=\{item\.id === LEARNING_SITES_CATEGORY_ID\}/);
    expect(code).toMatch(/if \(!flat\) onToggle\(\)/);
  });
  it("학습 사이트 자식 항목(사이트 목록)은 사이드바에 그리지 않는다", () => {
    expect(code).toMatch(/item\.id === LEARNING_SITES_CATEGORY_ID \? null : childItems\.map/);
  });
  it("누르면 갤러리로 간다", () => {
    expect(code).toMatch(/navigate\("\/learning-sites"\)/);
  });
  it("갤러리에 있는 페이지에서는 머리글이 강조된다", () => {
    expect(code).toMatch(/location\.pathname === "\/learning-sites"/);
  });
});
