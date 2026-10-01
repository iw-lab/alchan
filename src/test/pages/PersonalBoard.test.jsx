// 담벼락 — 실제 컴포넌트를 메모리 Firestore 위에 띄워 사용자 흐름을 누른다.
//  ① 교사: «새 글» 표시 → 판 열기(봤음 기록) → 브라우저 뒤로가기 = 담벼락 첫 화면(앱 밖으로 안 나감)
//  ② 교사: 새로고침으로 ?board= 에 바로 들어와도 «← 목록» 이 담벼락 첫 화면으로
//  ③ 학생: 자기 글에만 «수정» → 본문·수정시각만 보낸다 / 글 올리면 판에 lastPostAt
//  ④ 학생: 쓰던 글이 다시 열어도 남아 있다(임시 저장)
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";

// ── 메모리 Firestore ─────────────────────────
const store = new Map(); // path → data
let tick = 1000;
const SERVER_TS = { __serverTs: true };
const stamp = (data) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === SERVER_TS ? new Date(++tick * 1000) : v]));
const fs = vi.hoisted(() => ({ updates: [] }));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => {
  const join = (segs) => segs.filter((s) => typeof s === "string").join("/");
  const snapOf = (path) => ({ id: path.split("/").pop(), ref: { path }, exists: () => store.has(path), data: () => store.get(path) });
  const childrenOf = (col) =>
    [...store.keys()].filter((p) => p.startsWith(col + "/") && !p.slice(col.length + 1).includes("/"));
  let auto = 0;
  return {
    collection: (_db, ...segs) => ({ path: join(segs) }),
    // doc(컬렉션참조) = 새 자동 id 문서, doc(db, ...경로) = 그 문서
    doc: (a, ...segs) => (a && a.path && segs.length === 0 ? { path: `${a.path}/n${++auto}` } : { path: join(segs) }),
    query: (col, ...cons) => ({ path: col.path, filters: cons.filter((c) => c && c.where) }),
    where: (f, op, v) => ({ where: true, f, op, v }),
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => SERVER_TS,
    getDoc: async (ref) => snapOf(ref.path),
    getDocs: async (q) => {
      let paths = childrenOf(q.path);
      for (const w of q.filters || []) paths = paths.filter((p) => (store.get(p) || {})[w.f] === w.v);
      return { docs: paths.map(snapOf) };
    },
    addDoc: async (col, data) => {
      const path = `${col.path}/n${++auto}`;
      store.set(path, stamp(data));
      return { id: path.split("/").pop() };
    },
    setDoc: async (ref, data) => store.set(ref.path, stamp(data)),
    updateDoc: async (ref, data) => {
      if (!store.has(ref.path)) throw new Error("no doc");
      fs.updates.push({ path: ref.path, keys: Object.keys(data).sort() });
      store.set(ref.path, { ...store.get(ref.path), ...stamp(data) });
    },
    deleteDoc: async (ref) => store.delete(ref.path),
    writeBatch: () => {
      const ops = [];
      return {
        delete: (ref) => ops.push(() => store.delete(ref.path)),
        set: (ref, data) => ops.push(() => store.set(ref.path, stamp(data))),
        update: (ref, data) => ops.push(() => {
          if (!store.has(ref.path)) throw new Error("no doc");
          fs.updates.push({ path: ref.path, keys: Object.keys(data).sort() });
          store.set(ref.path, { ...store.get(ref.path), ...stamp(data) });
        }),
        commit: async () => ops.forEach((f) => f()),
      };
    },
  };
});
vi.mock("../../utils/logger", () => ({ logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn() } }));
vi.mock("../../utils/toast", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("../../utils/confirmDialog", () => ({ confirmDialog: vi.fn(async () => true) }));

let auth;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

import PersonalBoard from "../../pages/personal-board/PersonalBoard";

const B = "classes/C1/personalBoards";
let probe;
const Probe = () => {
  probe = { loc: useLocation(), nav: useNavigate() };
  return null;
};
const mount = (entries) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Probe />
      <Routes>
        <Route path="/" element={<div>홈 화면</div>} />
        <Route path="/personal-board" element={<PersonalBoard />} />
      </Routes>
    </MemoryRouter>,
  );

const asTeacher = () => {
  auth = { user: { uid: "tch1" }, userDoc: { id: "tch1", name: "교사", classCode: "C1" }, isAdmin: () => true, loading: false };
};
const asStudent = () => {
  auth = { user: { uid: "stu1" }, userDoc: { id: "stu1", name: "가온", classCode: "C1" }, isAdmin: () => false, loading: false };
};

// setup.js 의 localStorage 는 아무것도 저장하지 않는 목이다 — 임시 저장을 재려면 진짜로 담는 것이 필요하다
const mem = new Map();
const realStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
Object.defineProperty(globalThis, "localStorage", { value: realStorage, configurable: true });
Object.defineProperty(window, "localStorage", { value: realStorage, configurable: true });

beforeEach(() => {
  store.clear();
  fs.updates.length = 0;
  localStorage.clear();
  store.set(`${B}/stu1`, { ownerId: "stu1", ownerName: "가온", visibility: "private", lastPostAt: new Date(5000) });
  store.set(`${B}/stu2`, { ownerId: "stu2", ownerName: "나래", visibility: "private" });
  store.set(`${B}/stu1/posts/p1`, { content: "내가 쓴 글", authorId: "stu1", authorName: "가온", isTeacher: false, createdAt: new Date(4000) });
  store.set(`${B}/stu1/posts/p2`, { content: "선생님 글", authorId: "tch1", authorName: "교사", isTeacher: true, createdAt: new Date(4500) });
});

describe("담벼락 — 교사", () => {
  it("새 글 표시 → 열면 봤음 기록 → 뒤로가기는 담벼락 첫 화면", async () => {
    asTeacher();
    mount(["/", "/personal-board"]);
    expect(await screen.findByText("새 글")).toBeTruthy();
    fireEvent.click(screen.getByText("가온"));
    expect(await screen.findByText("내가 쓴 글")).toBeTruthy();
    expect(probe.loc.search).toBe("?board=stu1");
    await waitFor(() => expect(store.get(`${B}/stu1`).teacherSeenAt).toBeInstanceOf(Date));

    act(() => probe.nav(-1)); // 브라우저·폰 뒤로가기
    expect(await screen.findByText("나래")).toBeTruthy(); // 명단(첫 화면)
    expect(probe.loc.pathname).toBe("/personal-board");
    expect(screen.queryByText("홈 화면")).toBeNull();
    expect(screen.queryByText("새 글")).toBeNull(); // 봤으니 해제
  });

  it("?board= 로 바로 들어와도 «← 목록» 은 앱 밖이 아니라 첫 화면", async () => {
    asTeacher();
    mount(["/", "/personal-board?board=stu1"]);
    expect(await screen.findByText("내가 쓴 글")).toBeTruthy();
    fireEvent.click(screen.getByText("← 목록"));
    expect(await screen.findByText("나래")).toBeTruthy();
    expect(probe.loc.pathname).toBe("/personal-board");
    expect(probe.loc.search).toBe("");
  });

  it("«← 목록» 단추도 뒤로가기와 같은 길(기록 한 칸 소비)", async () => {
    asTeacher();
    mount(["/", "/personal-board"]);
    fireEvent.click(await screen.findByText("가온"));
    await screen.findByText("내가 쓴 글");
    fireEvent.click(screen.getByText("← 목록"));
    expect(await screen.findByText("나래")).toBeTruthy();
    act(() => probe.nav(-1)); // 한 번 더 뒤로 = 담벼락 이전 화면
    expect(await screen.findByText("홈 화면")).toBeTruthy();
  });
});

describe("담벼락 — 학생", () => {
  it("친구 판 → 뒤로 → 앞으로가기 하면 친구 판이 다시 열린다", async () => {
    asStudent();
    store.set(`${B}/stu2`, { ownerId: "stu2", ownerName: "나래", visibility: "class" });
    store.set(`${B}/stu2/posts/q1`, { content: "나래의 공개 글", authorId: "stu2", authorName: "나래", isTeacher: false, createdAt: new Date(4100) });
    mount(["/", "/personal-board"]);
    await screen.findByText("내가 쓴 글");
    fireEvent.click(screen.getByText("학급 담벼락"));
    fireEvent.click(await screen.findByText("나래"));
    expect(await screen.findByText("나래의 공개 글")).toBeTruthy();
    act(() => probe.nav(-1));
    await waitFor(() => expect(screen.queryByText("나래의 공개 글")).toBeNull());
    act(() => probe.nav(1)); // 앞으로가기
    expect(await screen.findByText("나래의 공개 글")).toBeTruthy();
    expect(probe.loc.search).toBe("?board=stu2");
  });

  it("자기 글에만 «수정», 보내는 필드는 본문·수정시각뿐", async () => {
    asStudent();
    mount(["/personal-board"]);
    await screen.findByText("내가 쓴 글");
    expect(screen.getAllByText("수정")).toHaveLength(1); // 선생님 글엔 없음
    fireEvent.click(screen.getByText("수정"));
    const box = screen.getByDisplayValue("내가 쓴 글");
    fireEvent.change(box, { target: { value: "고친 글" } });
    fireEvent.click(screen.getByText("수정 완료"));
    expect(await screen.findByText("고친 글")).toBeTruthy();
    expect(screen.getByText("(수정됨)")).toBeTruthy();
    const u = fs.updates.find((x) => x.path === `${B}/stu1/posts/p1`);
    expect(u.keys).toEqual(["content", "editedAt"]);
  });

  it("글을 올리면 판에 lastPostAt(본인 판, 그 필드만)", async () => {
    asStudent();
    mount(["/personal-board"]);
    await screen.findByText("내가 쓴 글");
    fireEvent.change(screen.getByPlaceholderText(/오늘의 이야기/), { target: { value: "새 이야기" } });
    fireEvent.click(screen.getByText("담벼락에 올리기"));
    expect(await screen.findByText("새 이야기")).toBeTruthy();
    await waitFor(() => expect(fs.updates.some((x) => x.path === `${B}/stu1` && x.keys.join() === "lastPostAt")).toBe(true));
  });

  it("같은 화면에서 계정이 바뀌면 앞 사람 초안이 남지 않는다", async () => {
    asStudent();
    // 매번 새 요소 — 같은 요소 객체를 넘기면 React 가 다시 그리지 않아 계정 전환이 일어나지 않는다
    const tree = () => (
      <MemoryRouter initialEntries={["/personal-board"]}>
        <Routes>
          <Route path="/personal-board" element={<PersonalBoard />} />
        </Routes>
      </MemoryRouter>
    );
    const r = render(tree());
    await screen.findByText("내가 쓴 글");
    fireEvent.change(screen.getByPlaceholderText(/오늘의 이야기/), { target: { value: "가온의 비밀 초안" } });
    auth = { user: { uid: "stu2" }, userDoc: { id: "stu2", name: "나래", classCode: "C1" }, isAdmin: () => false, loading: false };
    r.rerender(tree());
    await waitFor(() => expect(screen.getByPlaceholderText(/오늘의 이야기/).value).toBe(""));
    expect(localStorage.getItem("alchan:wallDraft:C1:stu2")).toBeNull();
    expect(JSON.parse(localStorage.getItem("alchan:wallDraft:C1:stu1")).post).toBe("가온의 비밀 초안");
  });

  it("쓰던 글은 다시 열어도 남고, 올리면 지워진다", async () => {
    asStudent();
    const r = mount(["/personal-board"]);
    await screen.findByText("내가 쓴 글");
    fireEvent.change(screen.getByPlaceholderText(/오늘의 이야기/), { target: { value: "쓰다 만 글" } });
    r.unmount();
    mount(["/personal-board"]);
    expect(await screen.findByDisplayValue("쓰다 만 글")).toBeTruthy();
    fireEvent.click(screen.getByText("담벼락에 올리기"));
    await screen.findByText("쓰다 만 글");
    await waitFor(() => expect(localStorage.getItem("alchan:wallDraft:C1:stu1")).toBeNull());
  });
});
