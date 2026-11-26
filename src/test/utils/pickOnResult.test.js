// 뽑기ON → 알찬 결과 받기. 2026-11-26 선생님 신고: «당첨자 1명은 상금이 들어가는데
// 5명으로 하면 안 들어간다» — 받는 쪽이 winners[0] 만 읽어 나머지 4명을 버렸다.
import { describe, it, expect, vi, afterEach } from "vitest";
import { listenForPickOnResult } from "../../utils/pickOn";

const ORIGIN = "https://iwpick.pages.dev";
const entries = ["가윤", "나래", "다솜", "라희", "마루", "바다", "사랑"].map((name, i) => ({
  name,
  weight: 1,
  userId: `u${i}`,
}));
const nameToUserId = new Map(entries.map((e) => [e.name, e.userId]));

function send(data, origin = ORIGIN) {
  const source = { postMessage: vi.fn() };
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
  return source;
}

let stop = null;
afterEach(() => stop?.());

function listen() {
  const onResult = vi.fn();
  stop = listenForPickOnResult({ rid: "r1", entries, nameToUserId, onResult });
  return onResult;
}

describe("뽑기ON 결과 — 당첨자 여럿", () => {
  it("5명이 오면 5명 모두 넘긴다(자리 번호의 학생 id 그대로)", () => {
    const onResult = listen();
    const idx = [4, 0, 6, 2, 3];
    const src = send({ type: "iwpick:result", rid: "r1", winners: idx.map((i) => entries[i].name), indexes: idx });
    expect(onResult).toHaveBeenCalledTimes(1);
    const r = onResult.mock.calls[0][0];
    expect(r.mismatch).toBe(false);
    expect(r.winners.map((w) => w.userId)).toEqual(["u4", "u0", "u6", "u2", "u3"]);
    expect(r.winners.map((w) => w.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(src.postMessage).toHaveBeenCalledWith({ type: "iwpick:ack", rid: "r1" }, ORIGIN);
  });

  it("1명이면 예전처럼 1명", () => {
    const onResult = listen();
    send({ type: "iwpick:result", rid: "r1", winners: ["다솜"], indexes: [2] });
    expect(onResult.mock.calls[0][0].winners).toEqual([{ userId: "u2", name: "다솜", rank: 1 }]);
  });

  it("한 명이라도 자리와 이름이 어긋나면 그 판 전체를 지급하지 않는다", () => {
    const onResult = listen();
    const src = send({ type: "iwpick:result", rid: "r1", winners: ["가윤", "나래", "다솜"], indexes: [0, 2, 2] });
    const r = onResult.mock.calls[0][0];
    expect(r.mismatch).toBe(true);
    expect(r.winners.every((w) => !w.userId)).toBe(true);
    expect(src.postMessage).toHaveBeenCalledWith({ type: "iwpick:ack", rid: "r1", refused: true }, ORIGIN);
  });

  it("같은 학생이 두 번 오면 한 번만, 같은 판은 한 번만, 다른 사이트·다른 추첨은 버린다", () => {
    const onResult = listen();
    send({ type: "iwpick:result", rid: "r1", winners: ["가윤", "가윤"], indexes: [0, 0] });
    send({ type: "iwpick:result", rid: "r1", winners: ["나래"], indexes: [1] });
    send({ type: "iwpick:result", rid: "r1-2", winners: ["나래"], indexes: [1] }, "https://evil.example");
    send({ type: "iwpick:result", rid: "zz", winners: ["나래"], indexes: [1] });
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].winners.map((w) => w.userId)).toEqual(["u0"]);
    send({ type: "iwpick:result", rid: "r1-2", winners: ["나래", "마루"], indexes: [1, 4] });
    expect(onResult).toHaveBeenCalledTimes(2);
    expect(onResult.mock.calls[1][0]).toMatchObject({ round: "r1-2" });
  });
});

describe("쿠폰 목표 화면 — 당첨자 전원에게 지급", () => {
  it("화면이 winners 를 하나씩 돌며 학생마다 다른 멱등키로 지급한다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/pages/coupon/CouponGoalPage.js", "utf8");
    expect(src).toMatch(/onResult:\s*async/);
    expect(src).toMatch(/for \(const w of winners\)/);
    expect(src).toMatch(/pickon_\$\{userId\}_\$\{round \|\| r\.rid\}_\$\{w\.userId\}/);
  });
});
