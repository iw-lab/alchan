#!/usr/bin/env node
// firestore.rules 안에서 '전체 경로가 동일한' match 블록(silent-override 유발)을 검출한다.
// 서브컬렉션(부모 경로가 다른 같은 leaf 이름)은 정상이므로 전체 경로로 판별한다.
// 주의: 경로 와일드카드 {userId}·맵 리터럴 {}의 중괄호는 블록 중괄호가 아니므로 카운트에서 제외한다.
// 사용: node scripts/check-rules-dup-paths.mjs [firestore.rules]  (중복 발견 시 exit 1)
import { readFileSync } from "node:fs";

const file = process.argv[2] || "firestore.rules";
const src = readFileSync(file, "utf8");
const lines = src.split("\n");

const segStack = []; // 현재 열린 match 경로 세그먼트
const openDepth = []; // 각 match가 열린 시점의 블록 depth
const seen = new Map(); // fullPath -> [lineNo...]
let depth = 0;

for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  // 라인 주석 제거 + 경로 와일드카드/맵 리터럴의 중괄호를 블록 카운트에서 제외
  const code = raw.replace(/\/\/.*$/, "");
  const forBraces = code.replace(/\{[A-Za-z0-9_]+\}/g, "W").replace(/\{\}/g, "E");

  const m = code.match(/match\s+(\S+)\s*\{/);
  if (m) {
    segStack.push(m[1]);
    openDepth.push(depth); // 이 match 블록은 depth→depth+1로 진입
    const full = segStack.join("");
    if (!seen.has(full)) seen.set(full, []);
    seen.get(full).push(i + 1);
  }

  for (const ch of forBraces) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      while (openDepth.length && depth === openDepth[openDepth.length - 1]) {
        openDepth.pop();
        segStack.pop();
      }
    }
  }
}

const dups = [...seen.entries()].filter(([, ls]) => ls.length > 1);
if (dups.length) {
  console.error("❌ 전체 경로가 중복된 match 블록 발견(silent-override 위험):");
  for (const [path, ls] of dups) console.error(`  ${path}  @ lines ${ls.join(", ")}`);
  process.exit(1);
}
console.log("✅ 중복 match 경로 없음 (전체 경로 기준).");
