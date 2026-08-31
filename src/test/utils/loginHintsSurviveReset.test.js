// 캐시 초기화가 **로그인을 날려버리지 않는지** 지킨다.
//
// 배경(2026-08-31 사용자 보고): "웨일북 껐다 키면 자동로그인이 풀리고 자동 채움도 없다".
// 원인은 둘이었다.
//   ① App.js clearCachesAndReload 가 IndexedDB 를 **전부** 지웠는데 거기에
//      firebaseLocalStorageDb(= Firebase Auth 세션)가 들어 있었다.
//   ② 같은 함수가 localStorage 를 비우면서 savedStudentId·savedClassCode·studentEmail_* 도
//      함께 날려, 다음 로그인에 학급코드까지 다시 타이핑해야 했다.
// 새 배포 뒤 옛 청크가 404 나면 이 경로가 돌기 때문에, 교실에서는 배포마다 전원 로그아웃이었다.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  clearLocalStoragePreserving,
  PRESERVED_KEY_PREFIXES,
} from "../../utils/storageReset";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(String(k), String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

let originalLocalStorage;

beforeEach(() => {
  originalLocalStorage = globalThis.localStorage;
  const store = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    value: store,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  });
});

describe("캐시 초기화 후에도 로그인 힌트는 남는다", () => {
  it("아이디·학급코드·이메일 캐시가 살아남고, 그 밖의 키는 지워진다", () => {
    localStorage.setItem("savedStudentId", "alchan15");
    localStorage.setItem("savedClassCode", "BG6QUC");
    localStorage.setItem("studentEmail_alchan15", "alchan15@bg6quc.alchan");
    localStorage.setItem("savedLoginId", "teacher@example.com");
    localStorage.setItem("alchan_lb_draft_1", "작성 중인 글");
    localStorage.setItem("recentlyUsedItems_u1", "[]");
    // 지워져야 하는 것들
    localStorage.setItem("someCache", "버려도 됨");
    localStorage.setItem("queryCache_v2", "버려도 됨");

    clearLocalStoragePreserving();

    expect(localStorage.getItem("savedStudentId")).toBe("alchan15");
    expect(localStorage.getItem("savedClassCode")).toBe("BG6QUC");
    expect(localStorage.getItem("studentEmail_alchan15")).toBe(
      "alchan15@bg6quc.alchan",
    );
    expect(localStorage.getItem("savedLoginId")).toBe("teacher@example.com");
    // 기존에 지키던 것도 그대로여야 한다(회귀 방지)
    expect(localStorage.getItem("alchan_lb_draft_1")).toBe("작성 중인 글");
    expect(localStorage.getItem("recentlyUsedItems_u1")).toBe("[]");
    // 나머지는 지워진다 — 보존 목록이 "전부 남기기"로 무력화되면 안 된다
    expect(localStorage.getItem("someCache")).toBeNull();
    expect(localStorage.getItem("queryCache_v2")).toBeNull();
  });

  it("보존 목록에 로그인 힌트 4종이 실제로 등록돼 있다", () => {
    for (const key of [
      "savedStudentId",
      "savedClassCode",
      "studentEmail_",
      "savedLoginId",
    ]) {
      expect(PRESERVED_KEY_PREFIXES).toContain(key);
    }
  });
});

describe("App.js 의 초기화 경로가 로그인 세션을 지키는지 (소스 계약)", () => {
  // 이 계약은 소스를 읽어 확인한다. 브라우저 밖에서 ErrorBoundary 를 태울 수 없고,
  // 여기서 지키려는 것은 "동작"이 아니라 **배선이 사라지지 않는 것**이기 때문이다.
  // (배선이 표를 안 따라가서 정본이 죽는 사고를 이 집에서 이미 겪었다.)
  const readApp = async () => {
    const fs = await import("node:fs");
    const nodePath = await import("node:path");
    // vitest 는 jsdom 에서 돌아 import.meta.url 이 file: 이 아닐 수 있다 — cwd 기준으로 읽는다
    const p = nodePath.resolve(process.cwd(), "src/App.js");
    if (!fs.existsSync(p)) throw new Error(`App.js 를 못 찾았다: ${p}`);
    return fs.readFileSync(p, "utf8");
  };

  it("Firebase Auth 의 IndexedDB 이름을 알고 있고, 삭제에서 제외한다", async () => {
    const src = await readApp();
    expect(src).toContain('FIREBASE_AUTH_DB = "firebaseLocalStorageDb"');
    // 이름을 알기만 하고 안 쓰면 소용없다 — 삭제 루프에서 걸러야 한다
    expect(src).toMatch(
      /if\s*\(\s*db\.name\s*===\s*FIREBASE_AUTH_DB\s*&&\s*!repeatedReset\s*\)\s*return;/,
    );
  });

  it("청크 오류(새 배포 뒤 옛 청크 404)는 저장소를 건드리지 않는다", async () => {
    const src = await readApp();
    expect(src).toContain("clearCachesAndReload({ wipeStorage: false })");
  });

  it("초기화가 반복되면 인증까지 지워 되살릴 수 없는 고리를 피한다", async () => {
    const src = await readApp();
    expect(src).toContain("RESET_MARK_KEY");
    expect(src).toMatch(/repeatedReset\s*=\s*prev\s*>\s*0/);
  });
});
