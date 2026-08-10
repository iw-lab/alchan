/**
 * 자동 주급 지급 시각 — 크론과 화면 문구가 **같은 말을 하는지** 지킨다.
 *
 * 이 프로젝트는 같은 함정을 이미 밟았다: 주식 스케줄러 주기를 15분→20분으로 바꾸고
 * "15분마다 자동으로 갱신됩니다" 문구를 그대로 둬서, 화면이 사실과 다른 말을 했다.
 * 주급은 돈이 실제로 나가는 시각이라 어긋나면 더 나쁘다 — 선생님이 8시 30분에 안 들어온다.
 *
 * ⚠️ 시각을 바꿀 때 고쳐야 할 곳이 둘이다(둘 다 안 고치면 이 테스트가 잡는다):
 *   ① functions/scheduler-http.js  weeklyEconomySchedulerV2 의 schedule/timeZone
 *   ② src/components/modals/AdminSettingsModal.js 의 안내 문구 3곳
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (p) => readFileSync(resolve(process.cwd(), p), "utf8");

const SCHEDULER = read("functions/scheduler-http.js");
const ADMIN_UI = read("src/components/modals/AdminSettingsModal.js");

describe("자동 주급 지급 시각", () => {
  it("⭐ 스케줄이 KST 월·금 08:30 이다", () => {
    expect(SCHEDULER).toContain('schedule: "30 8 * * 1,5"');
    expect(SCHEDULER).toContain('timeZone: "Asia/Seoul"');
  });

  it("⭐ timeZone 을 UTC 로 되돌리면서 요일을 안 당기는 실수를 막는다", () => {
    // UTC 표기로 돌아갔다면 KST 08:30 은 '전날' 23:30 이라 요일이 0,4 여야 한다.
    // 요일이 1,5 인 채 UTC 로 바뀌면 지급이 통째로 하루 밀린다.
    const utcMode = /timeZone:\s*"UTC"/.test(SCHEDULER);
    if (utcMode) {
      expect(SCHEDULER, "UTC 표기라면 요일은 0,4(일·목 23:30)여야 한다").toContain(
        '"30 23 * * 0,4"',
      );
    }
  });

  it("⭐ 화면 안내 문구가 크론과 같은 시각을 말한다", () => {
    // 문구가 3곳이라 한 곳만 고치는 사고가 난다 — 전부 새 시각인지 본다.
    const stale = ADMIN_UI.match(/월요일 오전 9시/g) || [];
    expect(stale, "옛 '월요일 오전 9시' 문구가 남아 있다").toHaveLength(0);

    const fresh = ADMIN_UI.match(/월요일 오전 8시 30분/g) || [];
    expect(fresh.length, "안내 문구 3곳이 모두 갱신돼야 한다").toBe(3);
  });

  it("본문 요일 판정은 실제 시각 기준이라 timeZone 설정과 무관하다", () => {
    // kstNow = now + 9h → getUTCDay() 로 KST 요일을 읽는다.
    // 스케줄러 timeZone 을 바꿔도 이 판정은 그대로 맞아야 한다.
    expect(SCHEDULER).toContain("const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)");
    expect(SCHEDULER).toContain("const day = kstNow.getUTCDay()");

    const at = (utcIso) => {
      const now = new Date(utcIso);
      return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
    };
    // KST 월 08:30 = UTC 일 23:30 → 월(1)로 읽혀야 주급이 나간다
    expect(at("2026-08-16T23:30:00Z")).toBe(1);
    // KST 금 08:30 = UTC 목 23:30 → 금(5)로 읽혀야 재산세·월세가 걷힌다
    expect(at("2026-08-20T23:30:00Z")).toBe(5);
  });
});
