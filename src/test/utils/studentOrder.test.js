// 학생 목록 = 학번 순 · 맨 앞 큰 번호 (2026-10-15 사용자 「돈보내기 가져오기 같은 학생들이 나오는 곳에
// 무조건 학번별로 배열해줘. 학번 맨앞에 최대한 크게」). 정렬 정본은 utils/studentOrder 하나 —
// 화면이 가나다순을 다시 들고 오면 아래 🔒 검사가 빨개진다.
import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  studentNumberOf,
  sortByStudentNumber,
  plainStudentName,
  numberedStudentName,
} from "../../utils/studentOrder";
import StudentPicker from "../../components/ui/StudentPicker";

const teacher = { id: "t", name: "담임선생님", isAdmin: true };
const roster = [
  { id: "a", name: "10번 꼬마곰", studentNumber: 10 },
  { id: "b", name: "가람", studentNumber: 2 },
  teacher,
  { id: "c", name: "1번 하늘다람쥐" }, // 번호 필드 없이 이름 앞 「1번」만
  { id: "d", name: "나래", studentNumber: "3" }, // 문자열 번호
];

describe("학번 정렬", () => {
  it("번호 = studentNumber → 없으면 이름 앞 「N번」 → 없으면 null", () => {
    expect(studentNumberOf({ studentNumber: 7 })).toBe(7);
    expect(studentNumberOf({ studentNumber: "12" })).toBe(12);
    expect(studentNumberOf({ name: "4번 별칭" })).toBe(4);
    expect(studentNumberOf({ studentNumber: 0, name: "이름" })).toBeNull();
    expect(studentNumberOf(teacher)).toBeNull();
  });

  it("학번 칸이 빈 옛 계정은 알찬 아이디 숫자로(꿈꾸는 펭귄 = alchan21) · 알찬 계정이 아니면 안 읽는다", () => {
    expect(studentNumberOf({ name: "꿈꾸는 펭귄", email: "alchan21@bg6quc.alchan" })).toBe(21);
    expect(studentNumberOf({ name: "가람", email: "alchan03@bg6quc.alchan" })).toBe(3);
    expect(studentNumberOf({ name: "학생", email: "7@abc123.alchan" })).toBe(7);
    expect(studentNumberOf({ name: "담임", email: "kim2010@gmail.com" })).toBeNull();
    expect(studentNumberOf({ name: "관리", email: "simfeelgood@bg6quc.alchan" })).toBeNull();
    expect(studentNumberOf({ studentNumber: 5, email: "alchan21@x.alchan" })).toBe(5); // 저장된 학번이 먼저
    const list = sortByStudentNumber([
      { id: "p", name: "꿈꾸는 펭귄", email: "alchan21@bg6quc.alchan" },
      { id: "x", name: "나래", studentNumber: 20 },
      teacher,
    ]);
    expect(list.map((m) => m.id)).toEqual(["x", "p", "t"]);
  });

  it("10번이 2번보다 뒤 · 번호 없는 교사는 맨 뒤 · 원본 배열은 그대로", () => {
    const before = roster.map((m) => m.id);
    expect(sortByStudentNumber(roster).map((m) => m.id)).toEqual(["c", "b", "d", "a", "t"]);
    expect(roster.map((m) => m.id)).toEqual(before);
    expect(sortByStudentNumber(undefined)).toEqual([]);
  });

  it("큰 번호와 겹치지 않게 이름에서 「N번 」을 뗀다 · 드롭다운은 번호를 맨 앞에", () => {
    expect(plainStudentName({ name: "10번 꼬마곰" })).toBe("꼬마곰");
    expect(numberedStudentName({ name: "가람", studentNumber: 2 })).toBe("2번 가람");
    expect(numberedStudentName({ name: "1번 하늘다람쥐" })).toBe("1번 하늘다람쥐");
    expect(numberedStudentName(teacher)).toBe("담임선생님");
  });
});

describe("받는 사람 고르기(학생 송금·쿠폰 선물)", () => {
  it("칸이 학번 순이고 각 칸의 맨 앞이 큰 번호다 · 나는 빠진다", () => {
    let picked = null;
    render(<StudentPicker members={roster} value="" onChange={(id) => (picked = id)} excludeId="b" />);
    const tiles = screen.getAllByRole("radio");
    expect(tiles.map((t) => t.dataset.studentId)).toEqual(["c", "d", "a", "t"]);
    expect(tiles.map((t) => t.firstElementChild.textContent)).toEqual(["1", "3", "10", "–"]);
    expect(tiles[0].firstElementChild.style.fontSize).toBe("2.1rem");
    fireEvent.click(tiles[2]);
    expect(picked).toBe("a");
  });
});

// 🔒 화면이 다시 이름 가나다순으로 학생을 줄 세우면 빨강. 학생이 아닌 목록(게시판·아이템·교사 승인)만 예외.
const SRC = join(__dirname, "../..");
const ALLOW = [
  ["pages/learning/LearningBoard.js", "a.name.localeCompare(b.name)"], // 게시판 이름
  ["pages/my-items/MyItems.js", "a.displayInfo.name.localeCompare(b.displayInfo.name)"], // 아이템 이름
  ["pages/superadmin/SuperAdminDashboard.js", 'aName.localeCompare(bName, "ko")'], // 교사 승인 목록(번호 없음)
  ["utils/studentOrder.js", "plainStudentName(a).localeCompare(plainStudentName(b)"], // 같은 번호끼리 동률 정리
];
const walk = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return f === "test" || f === "__tests__" ? [] : walk(p);
    return /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe("🔒 학생 목록은 학번 순", () => {
  it("이름으로 localeCompare 하는 곳은 허용 목록뿐", () => {
    const hits = [];
    for (const p of walk(SRC)) {
      const rel = relative(SRC, p);
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/localeCompare\(/.test(line) || !/name|nickname/i.test(line)) return;
          if (ALLOW.some(([f, snip]) => rel === f && line.includes(snip))) return;
          hits.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it("돈·쿠폰 보내기/가져오기와 학생 송금·선물 창은 큰 번호를 쓴다", () => {
    const has = (f, s) => readFileSync(join(SRC, f), "utf8").includes(s);
    expect(has("pages/banking/MoneyTransfer.js", '<StudentNo member={user} size="xl" />')).toBe(true);
    expect(has("pages/banking/CouponTransfer.js", '<StudentNo member={user} size="xl" />')).toBe(true);
    expect(has("components/modals/TransferModal.js", "<StudentPicker")).toBe(true);
    expect(has("components/modals/GiftCouponModal.js", "<StudentPicker")).toBe(true);
    expect(has("contexts/AuthContext.js", "sortByStudentNumber(classMembers)")).toBe(true);
  });
});
