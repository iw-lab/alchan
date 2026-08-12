/**
 * 금융 상품 조회 통합 — "세 훅이 같은 걸 세 번 읽지 않는다"를 잠근다.
 *
 * 종전 구조: useAutoLoanRepay(`type==loan`) · useAutoSavingsDeposit(`type==savings`) ·
 * useAutoDepositMature(`type in [deposit,savings]`) 가 각자 `users/{uid}/products` 를 조회했다.
 *   - savings 는 두 쿼리에 겹쳐 **같은 문서를 두 번** 읽었다.
 *   - Firestore 는 **빈 결과 쿼리에도 읽기 1건**을 과금하므로, 상품이 없는 학생도 3읽기를 썼다.
 *   - 셋 다 `visibilitychange` 마다 재조회했다 — 교실에서 탭 전환은 하루 수십 번이다.
 *
 * 그래서 두 가지를 테스트로 못 박는다.
 *   ① 세 훅은 **스스로 Firestore 를 조회하지 않는다** (구조 검사).
 *      이게 깨지면 누군가 조회를 다시 훅 안으로 들여온 것이다.
 *   ② 날짜 경계 판정이 **KST** 기준이다. UTC 로 새면 자정 직후 진입에서
 *      "다음 날 진입 케이스"를 놓치거나(만기 미처리) 하루 두 번 읽는다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kstDateString } from "../../utils/kstDate";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../hooks",
);

describe("① 자동처리 훅은 스스로 조회하지 않는다", () => {
  it.each([
    "useAutoLoanRepay.js",
    "useAutoSavingsDeposit.js",
    "useAutoDepositMature.js",
  ])("%s 에 getDocs/collection 호출이 없다", (file) => {
    const src = fs.readFileSync(path.join(SRC, file), "utf8");
    // 주석은 제외하고 실제 코드만 본다 (주석엔 옛 쿼리를 설명해 두었다).
    const code = src
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code).not.toMatch(/\bgetDocs\s*\(/);
    expect(code).not.toMatch(/\bcollection\s*\(/);
  });

  it("조회는 useStudentProducts 한 곳에서만 한다", () => {
    const src = fs.readFileSync(path.join(SRC, "useStudentProducts.js"), "utf8");
    expect(src.match(/\bgetDocs\s*\(/g) || []).toHaveLength(1);
    // 필터 없이 전량 읽는다 — 이 서브컬렉션엔 loan/savings/deposit 세 종류만 들어가고,
    // where 를 붙이면 세 훅의 합집합을 만들려다 다시 여러 쿼리로 갈라진다.
    expect(src).not.toMatch(/\bwhere\s*\(/);
  });
});

describe("② 날짜 경계는 KST 기준이다", () => {
  it("KST 자정 직전/직후가 서로 다른 날이 된다", () => {
    // 2026-08-12 14:59:59 UTC = 2026-08-12 23:59:59 KST
    const beforeMidnight = Date.UTC(2026, 7, 12, 14, 59, 59);
    // 2026-08-12 15:00:00 UTC = 2026-08-13 00:00:00 KST
    const afterMidnight = Date.UTC(2026, 7, 12, 15, 0, 0);
    expect(kstDateString(beforeMidnight)).toBe("2026-08-12");
    expect(kstDateString(afterMidnight)).toBe("2026-08-13");
  });

  it("UTC 자정은 KST 로 같은 날 오전 9시라 날짜가 안 바뀐다", () => {
    // UTC 기준으로 짰다면 여기서 날짜가 넘어가 하루 두 번 읽게 된다.
    const utcMidnight = Date.UTC(2026, 7, 13, 0, 0, 0);
    const utcJustBefore = Date.UTC(2026, 7, 12, 23, 59, 59);
    expect(kstDateString(utcMidnight)).toBe("2026-08-13");
    expect(kstDateString(utcJustBefore)).toBe("2026-08-13");
  });
});
