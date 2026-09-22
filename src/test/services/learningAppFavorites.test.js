// ⭐ 즐겨찾기 + 자주 쓴 것 — 학생마다·기기 안에서
//
// 🔴 여기서 꼭 재는 것: ① 학생이 바뀌면 목록도 바뀐다(공용 태블릿) ② 즐겨찾기와 «자주 쓴 것»이
//    같은 앱을 두 번 보여주지 않는다 ③ localStorage 가 막히거나 망가져도 **사이드바가 살아남는다**.
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFavorites, toggleFavorite, recordUse, topUsed, pinnedSections, FAV_MAX, MIN_USES,
} from "../../services/learningAppFavorites";

const APPS = [
  { id: "a", label: "골든 휘슬" }, { id: "b", label: "래킷 러시" },
  { id: "c", label: "활바람" }, { id: "d", label: "리로드" }, { id: "e", label: "설봉" },
];

// 🔴 전역 setup.js 의 localStorage 는 **아무것도 하지 않는 목**이다(getItem 이 늘 undefined).
//    그걸로는 「저장했다가 다시 읽는다」를 잴 수 없다 — 이 파일 안에서만 진짜처럼 도는 저장소를 깐다.
//    (다른 테스트에 영향이 없도록 매 테스트마다 새로 만든다.)
function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}
beforeEach(() => { global.localStorage = memStore(); });

describe("즐겨찾기", () => {
  it("별을 켜고 끈다", () => {
    expect(loadFavorites("u1")).toEqual([]);
    expect(toggleFavorite("u1", "a")).toEqual(["a"]);
    expect(loadFavorites("u1")).toEqual(["a"]);
    expect(toggleFavorite("u1", "a")).toEqual([]);
  });

  it("학생이 다르면 목록도 다르다 — 공용 태블릿에서 남의 것이 안 보인다", () => {
    toggleFavorite("u1", "a");
    toggleFavorite("u2", "b");
    expect(loadFavorites("u1")).toEqual(["a"]);
    expect(loadFavorites("u2")).toEqual(["b"]);
  });

  it(`${FAV_MAX}개를 넘기지 않는다`, () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) toggleFavorite("u1", id);
    expect(loadFavorites("u1")).toHaveLength(FAV_MAX);
    expect(loadFavorites("u1")).toContain("j");   // 최근 것이 남는다
  });
});

describe("자주 쓴 것", () => {
  it(`${MIN_USES}번 미만은 «자주»가 아니다`, () => {
    recordUse("u1", "a");                       // 1번
    expect(topUsed("u1", APPS.map((x) => x.id))).toEqual([]);
    recordUse("u1", "a");                       // 2번
    expect(topUsed("u1", APPS.map((x) => x.id))).toEqual(["a"]);
  });

  it("많이 누른 순 · 같으면 최근 순", () => {
    for (let i = 0; i < 5; i++) recordUse("u1", "a", 1000 + i);
    for (let i = 0; i < 3; i++) recordUse("u1", "b", 2000 + i);
    for (let i = 0; i < 3; i++) recordUse("u1", "c", 9000 + i);   // b 와 같은 횟수, 더 최근
    expect(topUsed("u1", APPS.map((x) => x.id))).toEqual(["a", "c", "b"]);
  });

  it("즐겨찾기에 있는 앱은 «자주 쓴 것»에서 뺀다(같은 줄이 두 번 뜨지 않는다)", () => {
    for (let i = 0; i < 4; i++) recordUse("u1", "a", 100 + i);
    for (let i = 0; i < 2; i++) recordUse("u1", "b", 200 + i);
    toggleFavorite("u1", "a");
    const s = pinnedSections("u1", APPS);
    expect(s.favorites.map((x) => x.id)).toEqual(["a"]);
    expect(s.frequent.map((x) => x.id)).toEqual(["b"]);
  });

  it("목록에 없는 앱(삭제된 링크)은 안 나온다", () => {
    for (let i = 0; i < 3; i++) recordUse("u1", "지워진앱", i);
    expect(topUsed("u1", APPS.map((x) => x.id))).toEqual([]);
    toggleFavorite("u1", "지워진앱");
    expect(pinnedSections("u1", APPS).favorites).toEqual([]);
  });
});

describe("저장소가 막혀도 사이드바는 산다", () => {
  it("읽기가 던져도 빈 목록으로 돌아간다", () => {
    global.localStorage = { ...memStore(), getItem: () => { throw new Error("blocked"); } };
    expect(loadFavorites("u1")).toEqual([]);
    expect(pinnedSections("u1", APPS)).toEqual({ favorites: [], frequent: [] });
  });

  it("쓰기가 던져도 예외가 위로 안 샌다", () => {
    global.localStorage = { ...memStore(), setItem: () => { throw new Error("quota"); } };
    expect(() => toggleFavorite("u1", "a")).not.toThrow();
    expect(() => recordUse("u1", "a")).not.toThrow();
  });

  it("값이 깨져 있어도(문자열·null) 무시한다", () => {
    localStorage.setItem("alchan:favApps:u1", "이건 JSON 이 아니다");
    expect(loadFavorites("u1")).toEqual([]);
    localStorage.setItem("alchan:appUse:u1", JSON.stringify({ a: "숫자가 아님" }));
    expect(topUsed("u1", ["a"])).toEqual([]);
  });
});
