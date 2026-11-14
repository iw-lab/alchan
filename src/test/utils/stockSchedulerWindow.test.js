// 주식 시세 스케줄러 — 깨우는 시각(cron)이 코드의 장 시간 판정을 전부 덮는지.
// cron 을 좁혀 빈 실행을 없앴다(2026-11-14). cron 이 판정보다 좁으면 그 시각의 갱신이 조용히 사라진다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("functions/scheduler-http.js", "utf8");
const start = src.indexOf("exports.stockPriceSchedulerV2 = onSchedule(");
const body = src.slice(start, start + 3500);
const cron = body.match(/schedule: "([^"]+)"/)[1];

// "*/20 8-15 * * 1-5" → 그 시각에 깨우는가
const fires = (h, m, day) => {
  const [mm, hh, , , dd] = cron.split(" ");
  const step = Number(mm.replace("*/", ""));
  const [h0, h1] = hh.split("-").map(Number);
  const [d0, d1] = dd.split("-").map(Number);
  return m % step === 0 && h >= h0 && h <= h1 && day >= d0 && day <= d1;
};
// 코드의 판정(아래 문자열이 그대로 있어야 이 시험의 전제가 맞다)
const codeWants = (h, m, day) => {
  if (!(day >= 1 && day <= 5)) return false;
  const t = h * 60 + m;
  return (h === 8 && m === 0) || (t >= 9 * 60 && t <= 15 * 60 + 45);
};

describe("주식 시세 스케줄러의 깨우는 시각", () => {
  it("코드의 장 시간 판정이 시험의 전제와 같다", () => {
    expect(body).toContain("const isUSStockFetchTime = hour === 8 && minute === 0;");
    expect(body).toContain("kstTotalMinutes >= 9 * 60 && kstTotalMinutes <= 15 * 60 + 45");
    expect(body).toContain('timeZone: "Asia/Seoul"');
  });
  it("⭐ 코드가 일하려는 20분 단위 시각은 전부 깨운다(빠지는 갱신 0)", () => {
    const missed = [];
    for (let day = 0; day <= 6; day++)
      for (let h = 0; h < 24; h++)
        for (let m = 0; m < 60; m += 20)
          if (codeWants(h, m, day) && !fires(h, m, day)) missed.push(`${day} ${h}:${m}`);
    expect(missed).toEqual([]);
  });
  it("⭐ 주말·밤에는 깨우지 않는다(빈 실행이 하루 72번 → 평일 24번)", () => {
    expect(fires(10, 0, 0)).toBe(false); // 일요일
    expect(fires(10, 0, 6)).toBe(false); // 토요일
    expect(fires(22, 0, 3)).toBe(false);
    expect(fires(7, 40, 3)).toBe(false);
    let perWeek = 0;
    for (let day = 0; day <= 6; day++) for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 20) if (fires(h, m, day)) perWeek++;
    expect(perWeek).toBe(24 * 5);
  });
});
