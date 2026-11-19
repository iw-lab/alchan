// 2026-11-19 — 보험 든 학생이 «긴급 세금 추징»(2천만 원)도 막아질 줄 알았다.
// 가입 전 화면엔 «세금은 안 된다»가 없었고, 카드가 부르는 이름(«현금 긴급 차감»)이 실제 이벤트 이름과 달랐다.
// 카드의 두 화면(가입 전·가입 후)이 모두 «보장되는 이벤트 이름»과 «안 되는 세금 이벤트 이름»을 실제 이벤트 제목 그대로 말해야 한다.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const card = readFileSync("src/components/InsuranceCard.js", "utf8");
const events = readFileSync("functions/economicEvents.js", "utf8");
const titleOf = (type) => {
  const m = events.match(new RegExp(`type: "${type}",\\s*\\n\\s*title: "([^"]+)"`));
  return m && m[1].replace(/!$/, "");
};

describe("보험 카드 문구 = 실제 이벤트 이름", () => {
  const covered = titleOf("CASH_PENALTY");
  const tax = titleOf("TAX_EXTRA");
  it("이벤트 제목을 읽는다", () => { expect(covered).toBeTruthy(); expect(tax).toBeTruthy(); });
  it("가입 전·후 두 화면 모두 보장 이벤트 이름을 그대로 말한다", () => {
    expect(card.split(`«${covered}»`).length - 1).toBeGreaterThanOrEqual(2);
  });
  it("가입 전·후 두 화면 모두 세금 이벤트는 안 된다고 말한다", () => {
    expect(card.split(`«${tax}» 같은 세금은 보험이 안 돼요`).length - 1).toBeGreaterThanOrEqual(2);
  });
});
