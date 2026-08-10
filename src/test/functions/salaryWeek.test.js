/**
 * 주급 중복 지급 판정(functions/salaryUtils.js)의 검증.
 *
 * 이 판정 하나로 "이미 이번 주에 지급했습니다 — 중복 지급하시겠습니까?" 를 띄울지가
 * 갈린다. 틀리면 둘 중 하나가 된다:
 *   · 너무 느슨하면 → 월요일 자동 지급 뒤 수동 지급이 **아무 말 없이** 두 번 나간다(예전 동작)
 *   · 너무 빡빡하면 → 회수 직후 재지급처럼 정상적인 흐름에서 헛경고가 뜬다
 *
 * ⚠️ functions/ 는 별도 패키지(CommonJS)라 여기서 직접 require 한다.
 *    src 테스트에 얹는 이유는 functions/ 에 테스트 러너가 없기 때문 — 러너가 생기면 옮길 것.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeWeekKey, startOfPayWeek, payWeekId, wasPaidInWeek } = require(
  "../../../functions/salaryUtils",
);

const at = (iso) => new Date(iso);
/** 그날 정오 KST. */
const noonKst = (iso) => new Date(`${iso}T03:00:00Z`);

describe("computeWeekKey — 거래내역 라벨용", () => {
  it("⭐ 운영(UTC)에서 예전 공식과 한 글자도 다르지 않다", () => {
    // 이 값으로 activity_logs 수천 건과 schedulerLocks 가 이미 적혀 있다.
    // 바뀌면 과거 기록과 대조가 안 된다 — 6년치를 **한 시간** 단위로 훑는다.
    // (하루 단위로 샘플링했더니 9h→8h 로 망가뜨려도 전부 통과했다 — 실측.)
    const legacy = (ms) => {
      const k = new Date(ms + 9 * 60 * 60 * 1000);
      return `${k.getUTCFullYear()}-W${Math.ceil(((k.getTime() - Date.UTC(k.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)}`;
    };
    const bad = [];
    let checked = 0;
    for (let ms = Date.UTC(2023, 0, 1); ms < Date.UTC(2029, 0, 1); ms += 3600000) {
      if (computeWeekKey(new Date(ms)) !== legacy(ms)) bad.push(new Date(ms).toISOString());
      checked++;
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(52000);
  });

  it("⭐ 서버 타임존을 타지 않는다", () => {
    // 예전 공식은 `new Date(y,0,1)`(로컬)을 써서 같은 순간이 환경마다 다른 주차가 됐다.
    // 실측: 2026-08-11T06:00:00.001Z → TZ=UTC 는 W32, TZ=Asia/Seoul 은 W33.
    // 이 테스트는 한 프로세스에서만 도니 값 자체를 고정해 회귀를 잡는다.
    expect(computeWeekKey(at("2026-08-11T06:00:00.001Z"))).toBe("2026-W32");
    expect(computeWeekKey(at("2026-01-01T00:00:00Z"))).toBe("2026-W1");
    expect(computeWeekKey(at("2026-12-31T23:59:59Z"))).toBe("2027-W1");
  });

  it("⭐ 스케줄러에 공식 복사본이 되살아나지 않았다", () => {
    // 여기가 이 파일이 존재하는 이유다. scheduler-http.js 는 자기 주석에
    // "복붙되면 동기화 누락으로 버그가 났던 전례(주급 공식)"라고 적어두고도
    // 정작 같은 공식을 5곳에 인라인으로 갖고 있었다(2026-08-06 제거).
    // 테스트가 공식을 **복사해** 비교하면 진짜 소스가 망가져도 통과한다 — 실측으로 확인.
    // 그래서 "복사본이 없다"를 직접 본다.
    const src = readFileSync(resolve(process.cwd(), "functions/scheduler-http.js"), "utf8");
    expect(src).toContain('require("./salaryUtils")');
    expect(src).toContain("computeWeekKey");
    const inline = src.match(/-W\$\{Math\.ceil/g) || [];
    expect(inline).toEqual([]);
  });
});

describe("startOfPayWeek — 중복 판정용 '이번 주'", () => {
  it("⭐ 월요일에 시작한다 (자동 지급이 월요일 09:00 KST 이기 때문)", () => {
    // 2026-08-10 이 월요일. 그 주 월~일이 전부 같은 주로 묶여야 한다.
    const monday = startOfPayWeek(noonKst("2026-08-10"));
    for (const d of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"]) {
      expect(startOfPayWeek(noonKst(d))).toBe(monday);
    }
    // 앞뒤 주는 달라야 한다
    expect(startOfPayWeek(noonKst("2026-08-09"))).toBeLessThan(monday); // 전주 일요일
    expect(startOfPayWeek(noonKst("2026-08-17"))).toBeGreaterThan(monday); // 다음 월요일
  });

  it("⭐ 예전 주차(computeWeekKey)와 다르다 — 이게 바꾼 이유다", () => {
    // 예전 주차는 수요일에 넘어간다. 월요일에 자동 지급한 뒤 수·목·금에
    // 수동 지급하면 "이미 줬다"를 못 잡았다.
    expect(computeWeekKey(noonKst("2026-08-10"))).toBe("2026-W32"); // 월(자동 지급일)
    expect(computeWeekKey(noonKst("2026-08-13"))).toBe("2026-W33"); // 목 — 주차가 이미 바뀜
    // 새 기준으로는 같은 주다
    expect(startOfPayWeek(noonKst("2026-08-13"))).toBe(startOfPayWeek(noonKst("2026-08-10")));
  });

  it("KST 자정 경계에서 넘어간다", () => {
    // 2026-08-09(일) 23:59 KST = 14:59Z / 2026-08-10(월) 00:01 KST = 15:01Z
    expect(startOfPayWeek(at("2026-08-09T14:59:00Z"))).not.toBe(
      startOfPayWeek(at("2026-08-09T15:01:00Z")),
    );
    expect(payWeekId(at("2026-08-09T15:01:00Z"))).toBe("2026-08-10");
  });

  it("payWeekId 는 그 주 월요일 날짜다", () => {
    expect(payWeekId(noonKst("2026-08-13"))).toBe("2026-08-10");
    expect(payWeekId(noonKst("2026-08-10"))).toBe("2026-08-10");
    expect(payWeekId(noonKst("2026-08-16"))).toBe("2026-08-10"); // 일요일
    expect(payWeekId(noonKst("2026-08-17"))).toBe("2026-08-17");
  });

  it("월·연 경계를 넘어도 월요일을 찾는다", () => {
    expect(payWeekId(noonKst("2026-01-01"))).toBe("2025-12-29"); // 목 → 그 주 월
    expect(payWeekId(noonKst("2026-03-01"))).toBe("2026-02-23"); // 일 → 그 주 월
  });
});

describe("wasPaidInWeek — 이번 주에 받았고 아직 회수되지 않았는가", () => {
  const WEEK = startOfPayWeek(noonKst("2026-08-13")); // 2026-08-10(월) 시작
  const paidThisWeek = noonKst("2026-08-10");
  const paidLastWeek = noonKst("2026-08-07");
  const asTimestamp = (d) => ({ toDate: () => d }); // Firestore Timestamp 흉내

  it("이번 주에 받았으면 true", () => {
    expect(wasPaidInWeek({ lastNetSalary: 1800000, lastSalaryDate: asTimestamp(paidThisWeek) }, WEEK)).toBe(true);
  });

  it("⭐ 월요일 지급 → 목요일 재지급도 같은 주로 잡는다", () => {
    // 예전 주차 기준이었다면 여기서 놓쳤다(월=W32, 목=W33).
    expect(wasPaidInWeek({ lastNetSalary: 1, lastSalaryDate: asTimestamp(noonKst("2026-08-10")) }, startOfPayWeek(noonKst("2026-08-13")))).toBe(true);
  });

  it("지난주에 받았으면 false — 이번 주 지급은 정상이다", () => {
    expect(wasPaidInWeek({ lastNetSalary: 1800000, lastSalaryDate: asTimestamp(paidLastWeek) }, WEEK)).toBe(false);
  });

  it("⭐ 회수된 주급은 false — reverseSalaryOnce 가 lastSalaryDate 를 안 지우기 때문", () => {
    expect(wasPaidInWeek({ lastNetSalary: 0, lastSalaryDate: asTimestamp(paidThisWeek) }, WEEK)).toBe(false);
  });

  it("한 번도 못 받은 학생은 false", () => {
    expect(wasPaidInWeek({}, WEEK)).toBe(false);
    expect(wasPaidInWeek({ lastNetSalary: 1800000 }, WEEK)).toBe(false);
    expect(wasPaidInWeek({ lastSalaryDate: asTimestamp(paidThisWeek) }, WEEK)).toBe(false);
  });

  it("망가진 값에도 안 터지고 false — 판정 불가는 '안 받은 것'으로 본다", () => {
    // ⚠️ 여기서 예외가 나면 주급 지급 전체가 internal 오류로 죽는다.
    expect(wasPaidInWeek({ lastNetSalary: 100, lastSalaryDate: "그런날짜없음" }, WEEK)).toBe(false);
    expect(wasPaidInWeek({ lastNetSalary: "1800000", lastSalaryDate: asTimestamp(paidThisWeek) }, WEEK)).toBe(true);
    expect(wasPaidInWeek({ lastNetSalary: -500, lastSalaryDate: asTimestamp(paidThisWeek) }, WEEK)).toBe(false);
    expect(wasPaidInWeek(null, WEEK)).toBe(false);
    expect(wasPaidInWeek({ lastNetSalary: 1, lastSalaryDate: asTimestamp(paidThisWeek) }, null)).toBe(false);
    expect(wasPaidInWeek({ lastNetSalary: 1, lastSalaryDate: asTimestamp(paidThisWeek) }, NaN)).toBe(false);
  });

  it("Date·ISO 문자열로 저장돼 있어도 읽는다", () => {
    expect(wasPaidInWeek({ lastNetSalary: 1, lastSalaryDate: paidThisWeek }, WEEK)).toBe(true);
    expect(wasPaidInWeek({ lastNetSalary: 1, lastSalaryDate: paidThisWeek.toISOString() }, WEEK)).toBe(true);
  });
});
