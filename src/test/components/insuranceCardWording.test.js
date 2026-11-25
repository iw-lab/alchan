// 2026-11-19 — 보험 든 학생이 «긴급 세금 추징»(2천만 원)도 막아질 줄 알았다. 카드가 부르는 이름이 실제 이벤트 이름과 달랐다.
// 2026-11-25 — 사용자 «보험이 세금도 막아줘»: 이제 «긴급 세금 추징»도 보장한다.
// 카드의 두 화면(가입 전·가입 후)이 모두 보장되는 이벤트 이름을 실제 제목 그대로 말하고, «세금은 안 된다»는 옛 말이 남아 있으면 안 된다.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const read = (f) => readFileSync(f, "utf8");
const card = read("src/components/InsuranceCard.js");
const switches = read("src/components/FinanceSwitches.js");
const events = read("functions/economicEvents.js");
const math = read("functions/insuranceMath.js");
const titleOf = (type) => {
  const m = events.match(new RegExp(`type: "${type}",\\s*\\n\\s*title: "([^"]+)"`));
  return m && m[1].replace(/!$/, "");
};
const fnBody = (name) => {
  const from = events.indexOf(`async function ${name}(`);
  const next = events.indexOf("\nasync function ", from + 10);
  return events.slice(from, next === -1 ? undefined : next);
};

describe("보험 카드 문구 = 실제 이벤트 이름", () => {
  const covered = ["CASH_PENALTY", "TAX_EXTRA"].map(titleOf);
  it("이벤트 제목을 읽는다", () => { covered.forEach((t) => expect(t).toBeTruthy()); });
  it("가입 전·후 두 화면 모두 보장 이벤트 이름을 그대로 말한다", () => {
    for (const t of covered) expect(card.split(`«${t}»`).length - 1, t).toBeGreaterThanOrEqual(2);
  });
  it("선생님 스위치 설명도 같은 이벤트 이름을 말한다", () => {
    for (const t of covered) expect(switches, t).toContain(`«${t}»`);
  });
  it("«세금은 보험이 안 된다»는 옛 말이 어디에도 없다", () => {
    for (const s of [card, switches, math]) expect(s).not.toMatch(/세금[^\n]{0,20}보험(이 안|\s?대상이 아니)/);
  });
  it("말한 이벤트는 서버가 실제로 보상한다 — 두 실행 함수 모두 정책을 읽고 보험금을 계산한다", () => {
    for (const fn of ["executeTaxExtra", "executeCashPenalty"]) {
      expect(fnBody(fn), fn).toContain("loadActivePolicies(");
      expect(fnBody(fn), fn).toContain("computePayout(");
    }
  });
  it("화면·설명의 보험료율 = 계산 정본", () => {
    const pct = `${Number(math.match(/PREMIUM_PERMILLE = (\d+)/)[1]) / 10}%`;
    for (const s of [switches, math]) expect(s).toContain(`현금의 ${pct}`);
  });
});
