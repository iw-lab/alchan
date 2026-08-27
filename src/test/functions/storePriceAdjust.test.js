/**
 * 물가 조정이 **돈을 발행하지 않는다**.
 *
 * 국고 되팔기(sellItemToTreasury)는 상점가의 70% 를 학생에게 준다. 그런데 학생이 실제로 낸
 * 돈은 표시가격 **그대로**다 — VAT(itemStoreVATRate)는 관리자 세수를 계산할 때만 쓰이고
 * 학생에게 더 받지 않는다(2026-08-27 purchaseStoreItem 실측: `totalCost = currentPrice × quantity`,
 * 학생 차감은 `increment(-totalCost)`).
 *
 * 그래서 물가가 구매 시점의 **1/0.7 ≈ 1.43배**를 넘으면 그 순간부터 "싸게 사서 국고에 되팔기"가
 * 이익이 된다. 교사가 +10% 를 네 번 누르면(1.1⁴ = 1.4641) 넘는 선이라, 물가 조정 버튼은
 * 그냥 두면 **물가를 관리할 때마다 무담보 차익을 배포하는 장치**가 된다.
 * (물가 폭등 이벤트 ×2 로는 이미 넘어 있었다 — 이건 이 기능이 만든 구멍이 아니라 드러낸 구멍이다.)
 *
 * 방어는 되팔기 쪽에 있다: 기준가 = min(지금 상점가, 그 학생이 마지막에 낸 단가).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
const EVENTS = readFileSync(
  resolve(process.cwd(), "functions/economicEvents.js"),
  "utf8",
);

const sliceFn = (name, src = SRC) => {
  const start = src.indexOf(`exports.${name} = onCall(`);
  expect(start, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexports.", start + 10);
  return src.slice(start, next === -1 ? src.length : next);
};
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ADJUST = codeOnly(sliceFn("adjustStorePrices"));
const SELL = codeOnly(sliceFn("sellItemToTreasury"));
const BUY = codeOnly(sliceFn("purchaseStoreItem"));

describe("되팔기가 낸 돈을 넘지 않는다 (차익거래 봉인)", () => {
  it("⭐ 구매 시 '마지막에 낸 단가'를 인벤토리에 남긴다", () => {
    // 이게 없으면 되팔기가 기댈 근거 자체가 없다.
    expect(BUY).toContain("lastPurchaseUnitPrice: purchaseBasis");
    // 표시가격이 아니라 **실제로 낸 단가**여야 한다 — 품절 선충전 시 currentPrice 가 오른다.
    expect(BUY).toMatch(/purchaseBasis =[\s\S]{0,200}currentPrice/);
  });

  it("⭐ 기준가는 올라가지 않는다 (비싼 1개로 끌어올리기 차단)", () => {
    // 비싼 단가로 1개만 더 사서 기준가를 올린 뒤 예전 재고를 통째로 되파는 우회를 막는다.
    expect(BUY).toContain("Math.min(prevBasisRaw, currentPrice)");
  });

  it("⭐ 되팔기 기준가 = min(지금 상점가, 낸 단가)", () => {
    expect(SELL).toContain("Math.min(storePrice, paidUnitRaw)");
    // 단가 계산이 storePrice 가 아니라 basisPrice 를 곱해야 한다.
    expect(SELL).toContain("Math.round(basisPrice * TREASURY_BUYBACK_RATIO)");
    // ⚠️ 옛 계산식이 남아 있으면 안 된다 — 남아 있으면 어느 쪽이 사는지 알 수 없다.
    expect(
      SELL,
      "옛 계산식(storePrice × 70%)이 그대로 남아 있다",
    ).not.toContain("Math.round(storePrice * TREASURY_BUYBACK_RATIO)");
  });

  it("⭐ 구매 이력이 없는 아이템은 **물가 기준선**으로 떨어진다 (선물·뽑기·경매·마켓)", () => {
    // 🔴 2026-08-27 codex CRITICAL. 폴백이 "지금 상점가"였다: 선물·뽑기로 받은 아이템(학생이
    //    낸 돈 0원)을 물가 인상 뒤 되팔면 인상분이 그대로 국고에서 나가는 현금이 됐다.
    //    획득 경로는 여섯 곳(선물·뽑기·경매·개인상점·마켓·오퍼)이라 거기마다 기준가를 심으면
    //    반드시 한 곳을 빠뜨린다 — 그래서 **물가를 움직이는 레버 쪽**(두 곳뿐)에 기준선을 박았다.
    expect(SELL).toContain("const baselineRaw = Number(storeData.basePrice)");
    expect(SELL).toContain("Math.min(storePrice, baselineRaw)");
    // 🔴 **정의만으로는 부족하다.** 기준가 삼항의 else 가 실제로 fallbackBasis 여야 한다 —
    //    2026-08-27 변이 테스트로 잡았다: `: fallbackBasis` 를 `: storePrice` 로 되돌려도
    //    "fallbackBasis 가 있고 어딘가에 : storePrice 가 있다" 는 느슨한 단언이 통과했다.
    //    선언을 세지 말고 **쓰이는 자리**를 셀 것.
    expect(
      SELL,
      "기준가 폴백이 fallbackBasis 가 아니다 — 정의만 해두고 안 쓰고 있다",
    ).toMatch(/:\s*fallbackBasis;/);
    // 기준선조차 없으면(물가를 한 번도 안 움직인 학급) 종전 동작 — 캐낼 인상분이 없다.
    expect(SELL).toMatch(/fallbackBasis\s*=[\s\S]{0,160}:\s*storePrice;/);
  });

  it("⭐ 물가를 움직이는 **두 경로 다** 기준선을 박는다", () => {
    // 한쪽만 박으면 그쪽을 피해 다른 쪽으로 물가를 올린 뒤 캐낼 수 있다.
    expect(ADJUST, "adjustStorePrices 가 기준선을 안 박는다").toContain("patch.basePrice = current");
    const fn = EVENTS.slice(
      EVENTS.indexOf("async function executeStorePriceChange("),
      EVENTS.indexOf("async function executeStockTaxChange("),
    );
    expect(fn, "물가 이벤트가 기준선을 안 박는다").toContain("patch.basePrice = currentPrice");
  });

  it("⭐ 기준선은 덮어쓰지 않는다 (반복 인상으로 기준선이 따라 오르면 안 된다)", () => {
    for (const [label, src] of [["adjustStorePrices", ADJUST], ["물가이벤트", EVENTS]]) {
      expect(src, `${label} 이 기준선을 조건 없이 덮어쓴다`).toContain(
        "Number(data.basePrice) <= 0",
      );
    }
  });

  it("⭐ 산술로 확인 — 선물 아이템도 인상분을 캐낼 수 없다", () => {
    const RATIO = 0.7;
    const baseline = 1000;          // 물가를 움직이기 직전 가격 = 받았을 때의 값어치
    let store = baseline;
    for (let i = 0; i < 6; i++) store = Math.round(store * 1.1); // 교사가 +10% 를 여섯 번
    const oldPayout = Math.round(store * RATIO);                 // 종전: 지금 상점가 기준
    expect(oldPayout).toBeGreaterThan(baseline);                 // ← 공짜로 받은 것이 돈이 됐다

    const basis = Math.min(store, baseline);
    expect(Math.round(basis * RATIO)).toBeLessThan(baseline);    // ← 언제나 받았을 때보다 적다
  });

  it("⭐ 산술로 확인 — 상한 1.43배를 넘겨도 이익이 나지 않는다", () => {
    const RATIO = 0.7;
    const paid = 1000;
    // 교사가 +10% 를 여섯 번 눌러 물가가 1.77배가 된 상황
    let store = paid;
    for (let i = 0; i < 6; i++) store = Math.round(store * 1.1);
    expect(store / paid).toBeGreaterThan(1 / RATIO); // 옛 규칙이었다면 차익이 났을 구간

    const oldPayout = Math.round(store * RATIO); // 종전: 지금 상점가 기준
    expect(oldPayout).toBeGreaterThan(paid); // ← 돈이 발행됐다

    const basis = Math.min(store, paid);
    const newPayout = Math.round(basis * RATIO); // 지금: 낸 단가 상한
    expect(newPayout).toBeLessThan(paid); // ← 언제나 손해. 무한증식 불가
  });
});

describe("물가 조정 CF 가드", () => {
  it("⭐ 교사 전용이고, 학급은 서버가 정한다", () => {
    expect(ADJUST).toContain("checkAuthAndGetUserData(request, true)");
    // 클라가 보낸 classCode 를 쓰면 남의 학급 물가를 바꿀 수 있다.
    expect(ADJUST).toContain('.where("classCode", "==", classCode)');
    expect(ADJUST).not.toContain("request.data?.classCode");
  });

  it("⭐ 한 스텝 폭을 묶는다 (0 을 하나 더 누르는 사고 방지)", () => {
    expect(ADJUST).toContain("percent < -50 || percent > 50");
    expect(ADJUST).toContain("Number.isInteger(percent)");
  });

  it("⭐ 가격은 하한·상한 안으로 보정된다", () => {
    expect(ADJUST).toContain("Math.min(STORE_PRICE_MAX, Math.max(STORE_PRICE_MIN, raw))");
  });

  it("⭐ 가치 고정 아이템은 판별을 새로 적지 않고 공용 헬퍼를 쓴다", () => {
    // 판별을 두 벌 적으면 두 경로가 반드시 어긋난다(이 저장소의 반복 결함).
    expect(ADJUST).toContain("isStorePriceEventExcluded(data)");
  });

  it("⭐ 바꾼 뒤 카탈로그 캐시를 버린다 ('바꿨는데 그대로다' 방지)", () => {
    expect(ADJUST).toContain("bumpCatalogVersion(classCode)");
  });
});

describe("물가를 바꾸는 **모든** 경로가 캐시를 버린다", () => {
  // 캐시 무효화 결함은 늘 "N곳 중 M곳만" 으로 온다. 가격을 쓰는 경로를 전부 세운다.
  it("⭐ 경제이벤트 물가 변경도 캐시를 버린다", () => {
    const fn = EVENTS.slice(
      EVENTS.indexOf("async function executeStorePriceChange("),
      EVENTS.indexOf("async function executeStockTaxChange("),
    );
    expect(fn, "executeStorePriceChange 를 찾지 못했다").toBeTruthy();
    expect(
      fn,
      "물가 이벤트가 학생 카탈로그 캐시를 버리지 않는다 — 최대 27분간 옛 가격이 보인다",
    ).toContain("bumpCatalogVersion(classCode)");
  });

  it("⭐ 아이템 추가·수정·삭제도 그대로 유지된다", () => {
    for (const name of ["updateStoreItem", "deleteStoreItem"]) {
      expect(codeOnly(sliceFn(name)), `${name} 의 캐시 무효화가 사라졌다`).toContain(
        "bumpCatalogVersion(",
      );
    }
  });

  it("⭐ 캐시 무효화의 정본은 **한 벌뿐이다**", () => {
    // 2026-08-27 교차검증(Gemini·Claude 두 계열이 같이 지적): 같은 5줄이 index.js 와
    // economicEvents.js 에 각각 있었다. 지금은 같아도 한쪽만 고치면 조용히 어긋난다 —
    // 이 저장소가 "정본이 둘" 로 이미 여러 번 데인 패턴이라 utils.js 한 곳으로 모았다.
    const UTILS = readFileSync(resolve(process.cwd(), "functions/utils.js"), "utf8");
    expect(UTILS, "정본이 utils.js 에 없다").toContain(
      "const bumpCatalogVersion = async (classCode)",
    );
    for (const [label, src] of [
      ["functions/index.js", SRC],
      ["functions/economicEvents.js", EVENTS],
    ]) {
      expect(
        src,
        `${label} 에 catalogMeta 직접 쓰기가 되살아났다 — 정본을 부를 것`,
      ).not.toContain('collection("catalogMeta")');
    }
  });
});
