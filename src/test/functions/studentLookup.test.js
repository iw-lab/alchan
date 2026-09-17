/**
 * 학급코드 없는 학생 로그인 — `functions/studentLookup.js`.
 *
 * 여기서 지키는 것은 "편의"가 아니라 **열거 속도**와 **대상 범위**다.
 *   ① 아이디 형식이 이메일 로컬파트로 안전한 것만 통과한다(주입·경계 우회 차단).
 *   ② 아이디 하나당 창(10분)에 정해진 횟수만 — 아이디를 순서대로 넣어 보는 스캔을 늦춘다.
 *   ③ 교사·관리자 계정은 후보가 아니다. 학생(@…alchan) 계정만 돌려준다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const {
  normalizeStudentId,
  decideLookupQuota,
  emailPrefixRange,
  pickStudentCandidates,
  quotaKeyForIp,
} = require_("../../../functions/studentLookup.js");

describe("① 아이디 형식", () => {
  it("정상 아이디는 소문자로 정규화한다", () => {
    expect(normalizeStudentId(" Alchan01 ")).toBe("alchan01");
  });
  it.each([
    ["빈 값", ""],
    ["한 글자", "a"],
    ["공백 포함", "al chan"],
    ["@ 포함(이메일 통째로)", "alchan01@bg6quc.alchan"],
    ["슬래시(경로 주입)", "a/b"],
    ["한글", "학생1"],
    ["숫자 타입", 12345],
    ["너무 김", "a".repeat(31)],
  ])("%s 는 거부한다", (_label, input) => {
    expect(normalizeStudentId(input)).toBeNull();
  });
});

describe("② 조회 한도 — 호출자(IP)당 10분 300회", () => {
  const NOW = 1_700_000_000_000;
  it("문서가 없으면 새 창을 연다", () => {
    const r = decideLookupQuota(null, NOW);
    expect(r.allow).toBe(true);
    expect(r.next).toEqual({ windowStartMs: NOW, count: 1 });
  });
  it("창 안에서는 센다", () => {
    const r = decideLookupQuota({ windowStartMs: NOW - 1000, count: 3 }, NOW);
    expect(r.allow).toBe(true);
    expect(r.next.count).toBe(4);
  });
  it("한도에 닿으면 막고 남은 시간을 알려준다", () => {
    const r = decideLookupQuota({ windowStartMs: NOW - 60_000, count: 300 }, NOW);
    expect(r.allow).toBe(false);
    expect(r.retryAfterSec).toBe(540); // 10분 - 1분
    expect(r.next.count).toBe(300); // 막힌 요청은 세지 않는다(무한 연장 방지)
  });
  // 한 반 전체가 같은 공인 IP 를 쓴다. 아침 로그인이 한 번에 몰려도 막히면 안 된다
  // (학생 62명 + 재시도). 비밀번호를 서버가 확인하므로 한도는 유출 방어가 아니라 비용 방어다.
  it("한 반이 동시에 로그인해도 막히지 않는다", () => {
    expect(decideLookupQuota({ windowStartMs: NOW - 1000, count: 130 }, NOW).allow).toBe(true);
  });
  it("창이 지나면 다시 연다", () => {
    const r = decideLookupQuota({ windowStartMs: NOW - 10 * 60 * 1000, count: 99 }, NOW);
    expect(r.allow).toBe(true);
    expect(r.next).toEqual({ windowStartMs: NOW, count: 1 });
  });
  // 🔒 손상된 카운터는 막는 쪽으로 읽는다. `Number(x)||0` 이던 시절엔 값 하나만
  //    망가뜨리면 소진한 한도가 다시 열렸다(2026-09-17 교차검증 지적).
  it.each([
    ["문자열 시각", { windowStartMs: "어제", count: 3 }],
    ["문자열 카운트", { windowStartMs: NOW, count: "많이" }],
    ["음수 카운트", { windowStartMs: NOW, count: -5 }],
    ["소수 카운트", { windowStartMs: NOW, count: 1.5 }],
    ["null 카운트", { windowStartMs: NOW, count: null }],
  ])("손상된 값(%s)은 거부한다", (_l, doc) => {
    const r = decideLookupQuota(doc, NOW);
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("corrupt");
  });
  it("손상돼도 영구 잠김은 아니다 — 새 창을 깔아 다음 창부터 정상", () => {
    const r = decideLookupQuota({ windowStartMs: "어제" }, NOW);
    expect(r.next.windowStartMs).toBe(NOW);
    const later = decideLookupQuota(r.next, NOW + 10 * 60 * 1000);
    expect(later.allow).toBe(true);
  });
});

describe("②-2 한도 키는 호출자(IP) 기준", () => {
  // 아이디 기준이면 ① 아이디를 바꿔 가며 부르면 한도가 안 걸리고
  // ② 남의 아이디를 두드려 그 학생만 막는 표적 방해가 된다(교차검증 3계열 공통 지적).
  it("IP 를 문서 id 로 안전하게 바꾼다", () => {
    expect(quotaKeyForIp("203.0.113.9")).toBe("ip_203_0_113_9");
    expect(quotaKeyForIp("2001:db8::1")).toBe("ip_2001_db8__1");
  });
  it("빈 값·비문자열은 unknown 으로 묶는다", () => {
    expect(quotaKeyForIp(undefined)).toBe("ip_unknown");
    expect(quotaKeyForIp("   ")).toBe("ip_unknown");
  });
  it("아주 긴 값도 문서 id 길이를 넘기지 않는다", () => {
    expect(quotaKeyForIp("9".repeat(500)).length).toBeLessThanOrEqual(123);
  });
});

describe("③ 후보 선별", () => {
  it("접두어 범위는 아이디@ 로 시작하는 것만 집는다", () => {
    const { start, end } = emailPrefixRange("alchan01");
    expect(start).toBe("alchan01@");
    expect("alchan01@bg6quc.alchan" >= start).toBe(true);
    expect("alchan01@bg6quc.alchan" < end).toBe(true);
    expect("alchan010@bg6quc.alchan" < end).toBe(true); // 같은 접두어는 후보로 들어온다
    expect("alchan02@bg6quc.alchan" < end).toBe(false);
  });
  it("교사·관리자·비학생 이메일은 뺀다", () => {
    const out = pickStudentCandidates([
      { email: "alchan01@bg6quc.alchan" },
      { email: "alchan01@class2025.alchan", isTeacher: true },
      { email: "alchan01@gmail.com" },
      { email: "alchan01@xx.alchan", isSuperAdmin: true },
      { name: "이메일 없음" },
    ]);
    expect(out).toEqual(["alchan01@bg6quc.alchan"]);
  });
  it("여러 학급이면 정렬해 최대 3개까지", () => {
    const out = pickStudentCandidates([
      { email: "a@z.alchan" },
      { email: "a@b.alchan" },
      { email: "a@m.alchan" },
      { email: "a@c.alchan" },
    ]);
    expect(out).toEqual(["a@b.alchan", "a@c.alchan", "a@m.alchan"]);
  });
});
