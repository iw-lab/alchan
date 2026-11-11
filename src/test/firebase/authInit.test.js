/**
 * 인증 초기화 — 저장소 순서와 리졸버(2026-11-11).
 * 불변식: ① 저장소 순서가 getAuth() 기본값과 같다(다르면 기존 세션을 못 찾아 전원 로그아웃)
 *         ② 팝업 리졸버를 초기화에 넣지 않는다(휴대폰·태블릿에서 iframe 로딩을 기다리게 된다)
 *         ③ 팝업·리다이렉트 로그인을 쓰는 곳이 없다(쓰게 되면 그 호출에 리졸버를 넘겨야 한다)
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "test") walk(p, out); } else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

describe("인증 초기화", () => {
  const code = read("firebase/firebaseConfig.js").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

  it("① 저장소 순서 = indexedDB → local → session (라이브러리 기본값과 같다)", () => {
    const m = /initializeAuth\(app,\s*\{\s*persistence:\s*\[([^\]]+)\]/.exec(code);
    expect(m).not.toBeNull();
    expect(m[1].split(",").map((x) => x.trim()).filter(Boolean)).toEqual([
      "indexedDBLocalPersistence",
      "browserLocalPersistence",
      "browserSessionPersistence",
    ]);
    // 라이브러리 기본값이 바뀌었는지도 본다 — 판을 올릴 때 여기서 걸리면 순서를 다시 맞춘다.
    const lib = path.resolve(root, "../node_modules/firebase/node_modules/@firebase/auth/dist/esm2017");
    if (fs.existsSync(lib)) {
      const file = fs.readdirSync(lib).map((f) => path.join(lib, f)).find((f) => f.endsWith(".js") && fs.readFileSync(f, "utf8").includes("function getAuth(app = getApp())"));
      if (file) {
        const src = fs.readFileSync(file, "utf8");
        const def = /function getAuth\(app = getApp\(\)\)[\s\S]{0,400}?persistence:\s*\[([^\]]+)\]/.exec(src);
        expect(def[1].split(",").map((x) => x.trim()).filter(Boolean)).toEqual([
          "indexedDBLocalPersistence",
          "browserLocalPersistence",
          "browserSessionPersistence",
        ]);
      }
    }
  });

  it("② getAuth()·팝업 리졸버를 초기화에 쓰지 않는다", () => {
    expect(code).not.toMatch(/\bgetAuth\(/);
    expect(code).not.toMatch(/popupRedirectResolver/);
  });

  it("③ 팝업·리다이렉트 로그인을 쓰는 화면이 없다", () => {
    const codeOf = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const users = walk(root).filter((f) => /signInWithPopup|signInWithRedirect|getRedirectResult|linkWithPopup|reauthenticateWithPopup/.test(codeOf(f)));
    expect(users.map((f) => path.relative(root, f))).toEqual([]);
  });
});
