/**
 * `useAuth()` 에서 꺼내 쓰는 이름은 **AuthContext 가 실제로 내보내는 값**이어야 한다.
 *
 * 2026-11-20 실측: 파산 신청 화면이 `const { userDoc, classCode, user } = useAuth()` 로
 * `classCode` 를 꺼냈는데, 컨텍스트는 그런 값을 내보낸 적이 없다(학급코드는 userDoc.classCode).
 * `undefined` 라 신청 저장이 `collection(db, "classes", undefined, …)` 에서 매번 터졌고,
 * 순자산이 마이너스인 학생 5명이 있는데도 파산 사건은 0건이었다. 화면엔 «오류가 발생하여
 * 파산 신청에 실패했습니다»만 떴다. 없는 이름을 꺼내도 JS 는 조용히 undefined 를 준다 — 그래서 시험으로 막는다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = resolve(process.cwd(), "src");
const CTX = readFileSync(join(SRC, "contexts/AuthContext.js"), "utf8");

/** AuthContext 의 `const value = useMemo(() => ({ … }), [` 안에서 내보내는 이름 */
export function providedKeys(ctxSource) {
  const start = ctxSource.indexOf("const value = useMemo(");
  const body = ctxSource.slice(ctxSource.indexOf("({", start) + 2, ctxSource.indexOf("})", start));
  return new Set(
    body
      .replace(/\/\/.*$/gm, "")
      .split(",")
      .map((s) => s.trim().split(":")[0].trim())
      .filter(Boolean),
  );
}

/** 소스에서 `const { a, b: c } = useAuth()` 로 꺼내는 이름(여러 줄 포함) */
export function destructuredKeys(source) {
  const out = [];
  for (const m of source.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*useAuth\(\)/g)) {
    for (const part of m[1].replace(/\/\/.*$/gm, "").split(",")) {
      const name = part.trim().split(":")[0].split("=")[0].trim();
      if (name && !name.startsWith("...")) out.push(name);
    }
  }
  return out;
}

function walk(dir, files = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "test" && f !== "node_modules") walk(p, files);
    } else if (/\.(js|jsx)$/.test(f)) files.push(p);
  }
  return files;
}

describe("useAuth() 구조분해", () => {
  const provided = providedKeys(CTX);

  it("컨텍스트가 내보내는 이름을 읽어 낸다(검사 자체가 비어 있지 않다)", () => {
    expect(provided.has("userDoc")).toBe(true);
    expect(provided.has("user")).toBe(true);
    expect(provided.size).toBeGreaterThan(20);
  });

  it("⭐ 없는 이름을 꺼내는 화면이 없다", () => {
    const bad = [];
    for (const file of walk(SRC)) {
      for (const key of destructuredKeys(readFileSync(file, "utf8"))) {
        if (!provided.has(key)) bad.push(`${file.slice(SRC.length + 1)}: ${key}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("검사기가 2026-11-20 의 그 줄을 잡는다", () => {
    const keys = destructuredKeys("const { userDoc, classCode, user } = useAuth();");
    expect(keys.filter((k) => !provided.has(k))).toEqual(["classCode"]);
    expect(destructuredKeys("const {\n  userDoc: me,\n  nope = 1,\n} = useAuth();")).toEqual(["userDoc", "nope"]);
  });
});
