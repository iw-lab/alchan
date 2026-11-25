// 새 학급 은행 기본 상품 — 화면·서버가 읽는 칸(dailyRate)이 채워져 있어야 한다.
// 2026-11-25: 기본값이 annualRate 만 적어 둬서 새 학급의 예금·적금·대출이 전부 하루 0%(공짜 대출)였다.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

const written = [];
vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig()),
  doc: (...a) => ({ path: a.slice(1).join("/") }),
  getDoc: async () => ({ exists: () => false }),
  setDoc: async (ref, data) => { written.push({ ref, data }); },
  serverTimestamp: () => 0,
}));
vi.mock("../../firebase/firebaseConfig", () => ({ db: {}, auth: {}, functions: {}, storage: {} }));

describe("은행 기본 상품", () => {
  it("예금·적금·대출 전부 하루 이율이 0보다 크다", async () => {
    const { getBankingProducts } = await import("../../firebase/db/settings");
    const p = await getBankingProducts("TEST1", false);
    const all = [...p.deposits, ...p.savings, ...p.loans];
    expect(all.length).toBe(9);
    for (const x of all) expect(Number(x.dailyRate), x.name).toBeGreaterThan(0);
    expect(written).toHaveLength(1);
    // 서버 상한(하루 100%) 안쪽이고, 대출이 예금보다 비싸다
    expect(Math.max(...all.map((x) => x.dailyRate))).toBeLessThan(1);
    expect(Math.min(...p.loans.map((x) => x.dailyRate))).toBeGreaterThan(Math.max(...p.deposits.map((x) => x.dailyRate)));
  });
  it("읽는 쪽도 같은 칸이다 — 화면·서버", () => {
    expect(readFileSync("src/pages/banking/Banking.js", "utf8")).toContain("product.dailyRate");
    expect(readFileSync("functions/index.js", "utf8")).toContain("product.dailyRate");
  });
});
