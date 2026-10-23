import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// 갤러리는 «목록 출처·잠금·열기» 세 가지를 사이드바와 똑같이 지켜야 한다 — 그 세 가지를 고정한다.
const launch = vi.fn();
const auth = { userDoc: { id: "stu1", isAdmin: false } };
const locks = { lockedItemIds: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../contexts/MenuLocksContext", () => ({ useMenuLocks: () => locks }));
vi.mock("../../services/appLaunch", () => ({ launchLearningApp: (a) => launch(a) }));
vi.mock("../../services/learningAppRegistry", async () => {
  // 갤러리 동작(검색·카테고리·잠금·즐겨찾기)은 앱이 많아야 시험이 된다 — 지금 두 개에 2026-10-23 꺼 둔 옛 앱까지 다 넣어 본다.
  const { normalizeLearningApps, DEFAULT_LEARNING_APPS, RETIRED_LEARNING_APPS } = await import("../../config/learningApps");
  const all = () => normalizeLearningApps([...DEFAULT_LEARNING_APPS, ...RETIRED_LEARNING_APPS]);
  return { getLearningAppItems: all, loadLearningAppItems: () => Promise.resolve(all()), LEARNING_APPS_CHANGED: "learningApps:changed" };
});
import LearningSitesGallery, { filterApps, filterByTags } from "../../pages/learning/LearningSitesGallery";
import { DEFAULT_LEARNING_APPS as NOW, RETIRED_LEARNING_APPS } from "../../config/learningApps";
const DEFAULT_LEARNING_APPS = [...NOW, ...RETIRED_LEARNING_APPS];
import { LEARNING_GALLERY, GALLERY_SUBJECTS, GALLERY_KINDS } from "../../config/learningGallery";

// test/setup.js 가 localStorage 를 «아무것도 저장 안 하는 vi.fn()» 으로 바꿔 둔다 — 즐겨찾기·사용 기록은 진짜 저장소가 있어야 시험할 수 있다.
const mem = new Map();
const fakeStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear() };
beforeEach(() => { Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, configurable: true, writable: true }); mem.clear(); });

beforeEach(() => { launch.mockReset(); sessionStorage.clear?.(); locks.lockedItemIds = []; auth.userDoc = { id: "stu1", isAdmin: false }; });

describe("갤러리 데이터", () => {
  it("모든 등재 앱에 썸네일 정보가 있고 파일이 실제로 있다(깨진 카드 0)", async () => {
    const fs = await import("node:fs");
    for (const a of DEFAULT_LEARNING_APPS) {
      const g = LEARNING_GALLERY[a.id];
      expect(g, `${a.id} 갤러리 항목`).toBeTruthy();
      expect(fs.existsSync(`public${g.image}`), `${a.id} → ${g.image}`).toBe(true);
    }
  });
  it("썸네일 파일이 두 앱에 겹쳐 쓰이지 않는다(다른 앱 그림이 붙는 사고 방지)", () => {
    const imgs = Object.values(LEARNING_GALLERY).map((g) => g.image);
    expect(new Set(imgs).size).toBe(imgs.length);
  });
});

describe("카테고리", () => {
  it("모든 앱이 종류 태그를 하나 이상 갖고, 태그는 정해진 낱말뿐이다(오타 태그 = 아무 칸에도 안 잡히는 앱)", () => {
    const vocab = new Set([...GALLERY_SUBJECTS, ...GALLERY_KINDS]);
    for (const a of DEFAULT_LEARNING_APPS) {
      const tags = LEARNING_GALLERY[a.id]?.tags || [];
      expect(tags.some((t) => GALLERY_KINDS.includes(t)), `${a.id} 종류 태그`).toBe(true);
      for (const t of tags) expect(vocab.has(t), `${a.id} → «${t}»`).toBe(true);
    }
  });
  it("과목·종류를 둘 다 고르면 둘 다 붙은 앱만", () => {
    const apps = [{ id: "siteBeatOn" }, { id: "siteWhirlwood" }, { id: "siteMathCastle" }];
    expect(filterByTags(apps, "음악", "").map((a) => a.id)).toEqual(["siteBeatOn", "siteWhirlwood"]);
    expect(filterByTags(apps, "음악", "학교 대항").map((a) => a.id)).toEqual(["siteWhirlwood"]);
    expect(filterByTags(apps, "", "")).toHaveLength(3);
  });
});

describe("filterApps", () => {
  const apps = [{ id: "a", label: "물꼬(모래 물길 농장)" }, { id: "b", label: "구구성 수호대" }];
  it("이름에 든 글자로 거른다·빈 검색어는 전부", () => {
    expect(filterApps(apps, "물꼬").map((x) => x.id)).toEqual(["a"]);
    expect(filterApps(apps, "  ")).toHaveLength(2);
    expect(filterApps(apps, "없는말")).toHaveLength(0);
  });
});

describe("LearningSitesGallery", () => {
  it("등재된 앱 전부가 카드로 뜬다(전체 묶음)", () => {
    render(<LearningSitesGallery />);
    const all = screen.getByText("전체").closest("section");
    expect(within(all).getAllByRole("button", { name: /열기$/ })).toHaveLength(DEFAULT_LEARNING_APPS.length);
    expect(screen.getByRole("button", { name: "물꼬(모래 물길 농장) 열기" })).toBeTruthy();
  });

  it("검색하면 걸러지고, 없으면 안내 문구가 나온다", () => {
    render(<LearningSitesGallery />);
    const box = screen.getByLabelText("학습 사이트 검색");
    fireEvent.change(box, { target: { value: "물꼬" } });
    expect(screen.getAllByRole("button", { name: /열기$/ })).toHaveLength(1);
    fireEvent.change(box, { target: { value: "zzzz없음" } });
    expect(screen.getByText(/찾는 사이트가 없어요/)).toBeTruthy();
  });

  it("카테고리 칸을 누르면 그 앱만 남고, 다시 누르면 풀린다", () => {
    render(<LearningSitesGallery />);
    const n = DEFAULT_LEARNING_APPS.filter((a) => LEARNING_GALLERY[a.id].tags.includes("타자")).length;
    const chip = within(screen.getByRole("group", { name: "종류로 고르기" })).getByRole("button", { name: new RegExp(`^타자${n}$`) });
    fireEvent.click(chip);
    expect(screen.getAllByRole("button", { name: /열기$/ })).toHaveLength(n);
    expect(screen.getByRole("button", { name: "타자왕국 키우기(타자 땅따먹기) 열기" })).toBeTruthy();
    fireEvent.click(chip);
    const all = screen.getByText("전체").closest("section");
    expect(within(all).getAllByRole("button", { name: /열기$/ })).toHaveLength(DEFAULT_LEARNING_APPS.length);
  });

  it("교사가 잠근 앱은 학생에게 안 보이고 교사에게는 보인다", () => {
    locks.lockedItemIds = ["siteMulkko"];
    const { unmount } = render(<LearningSitesGallery />);
    expect(screen.queryByRole("button", { name: "물꼬(모래 물길 농장) 열기" })).toBeNull();
    unmount();
    auth.userDoc = { id: "t1", isAdmin: true };
    render(<LearningSitesGallery />);
    expect(screen.getByRole("button", { name: "물꼬(모래 물길 농장) 열기" })).toBeTruthy();
  });

  it("카드를 누르면 사용 기록을 남기고 같은 열기 함수(launchLearningApp)를 부른다", () => {
    render(<LearningSitesGallery />);
    fireEvent.click(screen.getByRole("button", { name: "물꼬(모래 물길 농장) 열기" }));
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0][0].id).toBe("siteMulkko");
    expect(launch.mock.calls[0][0].externalUrl).toBe("https://mulkko-a7z.pages.dev/");
    expect(JSON.parse(localStorage.getItem("alchan:appUse:stu1")).siteMulkko.n).toBe(1);
  });

  it("별을 누르면 «내 즐겨찾기» 가 위에 생기고 카드가 열리지는 않는다", () => {
    render(<LearningSitesGallery />);
    fireEvent.click(screen.getByRole("button", { name: "물꼬(모래 물길 농장) 즐겨찾기" }));
    expect(launch).not.toHaveBeenCalled();
    expect(screen.getByText("★ 내 즐겨찾기")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("alchan:favApps:stu1"))).toEqual(["siteMulkko"]);
  });

  it("썸네일이 깨지면 카드는 아이콘 타일로 바뀌고 앱은 그대로 열린다", () => {
    const { container } = render(<LearningSitesGallery />);
    const img = container.querySelector("img");
    fireEvent.error(img);
    expect(container.querySelectorAll("img").length).toBeLessThan(DEFAULT_LEARNING_APPS.length);
    expect(screen.getAllByRole("button", { name: /열기$/ }).length).toBe(DEFAULT_LEARNING_APPS.length);
  });
});
