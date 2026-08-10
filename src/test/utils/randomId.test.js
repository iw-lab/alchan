/**
 * 구형 기기(Safari 15.4 미만)에서도 멱등키가 만들어지는지 검증한다.
 * 여기서 터지면 그걸 감싼 지급·구매 호출이 통째로 실패한다 — 최신 기기에선 티가 안 난다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { randomId } from "../../utils/randomId";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("randomId", () => {
  it("최신 브라우저에서는 crypto.randomUUID 를 그대로 쓴다", () => {
    const spy = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    vi.stubGlobal("crypto", { randomUUID: spy, getRandomValues: () => {} });
    expect(randomId()).toBe("11111111-2222-4333-8444-555555555555");
    expect(spy).toHaveBeenCalled();
  });

  it("⭐ randomUUID 가 없어도(구형 Safari) v4 를 만들어 낸다", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      },
    });
    const id = randomId();
    expect(id).toMatch(V4);
  });

  it("⭐ crypto 자체가 없어도 터지지 않는다", () => {
    vi.stubGlobal("crypto", undefined);
    expect(randomId()).toMatch(V4);
  });

  it("서로 다른 값이 나온다 — 같은 값이면 멱등키 구실을 못 한다", () => {
    const ids = new Set(Array.from({ length: 500 }, () => randomId()));
    expect(ids.size).toBe(500);
  });

  it("구형 경로에서도 서로 다른 값이 나온다", () => {
    vi.stubGlobal("crypto", undefined); // Math.random 폴백
    const ids = new Set(Array.from({ length: 500 }, () => randomId()));
    expect(ids.size).toBe(500);
  });

  it("서버의 idempotencyKey 제약을 만족한다 — '/' 없음, 128자 이하", () => {
    // functions/utils.js checkIdempotent 가 '/' 를 거부하고 128자를 넘으면 던진다.
    for (let i = 0; i < 50; i++) {
      const id = randomId();
      expect(id).not.toContain("/");
      expect(id.length).toBeLessThanOrEqual(128);
    }
  });
});
