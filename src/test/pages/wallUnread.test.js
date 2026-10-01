import { describe, it, expect } from "vitest";
import { isBoardUnread, countUnreadBoards } from "../../pages/personal-board/wallUnread";

const ts = (ms) => ({ toMillis: () => ms });

describe("담벼락 새 글 판정", () => {
  it("글이 없으면 새 글 아님", () => {
    expect(isBoardUnread({})).toBe(false);
    expect(isBoardUnread({ teacherSeenAt: ts(5) })).toBe(false);
  });
  it("교사가 한 번도 안 열었는데 글이 있으면 새 글", () => {
    expect(isBoardUnread({ lastPostAt: ts(10) })).toBe(true);
  });
  it("교사가 연 뒤에 올라온 글만 새 글", () => {
    expect(isBoardUnread({ lastPostAt: ts(10), teacherSeenAt: ts(20) })).toBe(false);
    expect(isBoardUnread({ lastPostAt: ts(30), teacherSeenAt: ts(20) })).toBe(true);
  });
  it("Firestore {seconds,nanoseconds} 와 Date 도 읽는다", () => {
    expect(isBoardUnread({ lastPostAt: { seconds: 100, nanoseconds: 0 }, teacherSeenAt: { seconds: 99, nanoseconds: 0 } })).toBe(true);
    expect(isBoardUnread({ lastPostAt: new Date(1000), teacherSeenAt: new Date(2000) })).toBe(false);
  });
  it("반 전체 개수", () => {
    expect(countUnreadBoards([{ lastPostAt: ts(3) }, { lastPostAt: ts(3), teacherSeenAt: ts(4) }, {}])).toBe(1);
  });
});
