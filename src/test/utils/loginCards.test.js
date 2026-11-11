import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loginIdOf, buildLoginCards, paginate } from "../../utils/loginCards";

describe("로그인 카드", () => {
  const students = [
    { id: "b", email: "alchan12@t1abcd.alchan", name: "12번 나", studentNumber: 12, password: "x" },
    { id: "a", email: "alchan03@t1abcd.alchan", name: "3번 가", studentNumber: 3 },
    { id: "c", email: "", name: "깨진 문서" },
  ];

  it("아이디는 이메일의 @ 앞부분", () => {
    expect(loginIdOf(students[0])).toBe("alchan12");
    expect(loginIdOf({ email: "no-at" })).toBe("");
    expect(loginIdOf(null)).toBe("");
  });

  it("번호순으로 놓고, 아이디 없는 문서는 뺀다", () => {
    const cards = buildLoginCards(students, { classCode: "t1abcd" });
    expect(cards.map((c) => c.loginId)).toEqual(["alchan03", "alchan12"]);
    expect(cards[0].classCode).toBe("T1ABCD");
    expect(cards[0].number).toBe(3);
  });

  it("🔒 카드에는 비밀번호가 실리지 않는다", () => {
    const cards = buildLoginCards(students, { classCode: "t1abcd" });
    expect(JSON.stringify(cards)).not.toMatch(/password|"x"/);
    const sheet = fs.readFileSync(path.resolve(__dirname, "../../components/LoginCardsSheet.js"), "utf8");
    expect(sheet).not.toMatch(/\.password|initialPassword|tempPassword/);
  });

  it("한 쪽 8장", () => {
    expect(paginate(Array.from({ length: 21 }, (_, i) => i), 8).map((p) => p.length)).toEqual([8, 8, 5]);
    expect(paginate([], 8)).toEqual([]);
  });
});
