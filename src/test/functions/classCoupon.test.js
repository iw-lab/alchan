/**
 * 쿠폰 가치는 «학급별» — 2026-10-02 실측: 전역 settings/mainSettings.couponValue 를 3학급이 같이 써서
 * 한 교사가 바꾸면 다른 반의 쿠폰 판매(현금화)·기부·순자산 과세가 함께 바뀌었다.
 * 서버(functions/classCoupon.js)와 클라이언트(src/utils/classCoupon.js)는 같은 경로·같은 판정이어야 한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import server from "../../../functions/classCoupon.js";
import * as client from "../../utils/classCoupon.js";

const read = (p) => readFileSync(resolve(__dirname, "../../..", p), "utf8");
const snap = (data) => ({ exists: data !== undefined, data: () => data });

describe("couponValueFrom — 현금 계산에 들어가는 값의 판정", () => {
  it("정상 정수는 그대로", () => {
    expect(server.couponValueFrom(snap({ couponValue: 1500 }))).toBe(1500);
    expect(client.couponValueFrom({ couponValue: 1500 })).toBe(1500);
  });
  it("문서 없음 → 기본값 1000", () => {
    expect(server.couponValueFrom(snap(undefined))).toBe(1000);
    expect(client.couponValueFrom(null)).toBe(1000);
  });
  it.each([["문자열", "1500"], ["0", 0], ["음수", -5], ["소수", 1500.5], ["상한 초과", 1000001], ["무한", Infinity], ["NaN", NaN]])(
    "%s 는 현금 계산에 들이지 않는다(기본값)", (_n, v) => {
      expect(server.couponValueFrom(snap({ couponValue: v }))).toBe(1000);
      expect(client.couponValueFrom({ couponValue: v })).toBe(1000);
    });
  it("서버·클라이언트가 같은 경로·같은 상한·같은 기본값", () => {
    expect(server.classCouponPath("AB12")).toBe(client.classCouponPath("AB12").join("/"));
    expect(server.MAX_COUPON_VALUE).toBe(client.MAX_COUPON_VALUE);
    expect(server.DEFAULT_COUPON_VALUE).toBe(client.DEFAULT_COUPON_VALUE);
  });
  it("규칙의 상한도 같은 값", () => {
    expect(read("firestore.rules")).toMatch(new RegExp(`couponValue <= ${server.MAX_COUPON_VALUE}\\b`));
  });
});

describe("쿠폰 가치를 전역 문서에서 읽는 곳이 남아 있지 않다", () => {
  const strip = (src) => src.replace(/\/\/.*$/gm, "");   // 주석의 경위 설명은 제외
  it.each(["functions/index.js", "functions/economicEvents.js", "functions/scheduler-http.js"])("%s", (f) => {
    const src = strip(read(f));
    expect(src).not.toMatch(/settings\/mainSettings|doc\("mainSettings"\)/);
  });
  it.each(["src/pages/dashboard/Dashboard.js", "src/pages/my-assets/MyAssets.js", "src/pages/coupon/CouponGoalPage.js", "src/contexts/CurrencyContext.js", "src/components/modals/AdminSettingsModal.js"])("%s", (f) => {
    expect(strip(read(f))).not.toMatch(/"settings",\s*"mainSettings"/);
  });
  it("sellCoupon 은 판매하는 학생의 학급 문서를 트랜잭션 안에서 읽는다", () => {
    const src = read("functions/index.js");
    const body = src.slice(src.indexOf("exports.sellCoupon"), src.indexOf("exports.sellCoupon") + 4000);
    expect(body).toMatch(/transaction\.get\(classCouponRef\(db, sellerClass\)\)/);
    expect(body).toMatch(/couponValueFrom\(settingsDoc\)/);
  });
  it("donateCoupon 은 기부하는 학급 문서를 트랜잭션 안에서 읽는다", () => {
    const src = read("functions/index.js");
    expect(src).toMatch(/const couponRef = classCouponRef\(db, classCode\);[\s\S]{0,1500}const refs = \[userRef, goalRef, couponRef\]/);
  });
});
