/**
 * 거래내역이 같은 돈을 두 번 보여주던 문제를 고정한다.
 *
 * 2026-08-30 라이브 실측(학생 1명): 활동로그 197건 중 **76건**이 거래원장과 같은 금액의 짝.
 *   아이템 구매↔storePurchase 50 · 국고 되팔기↔treasurySellback 14 · 주급 5 · 송금 7
 * 학생 화면에는 "급식 우선권 1개 구매 −1,089,000" 과 "[관리자 상점] 급식 우선권 1개 −1,089,000"
 * 이 **나란히** 떠 있었다. 돈은 한 번만 빠졌지만, 학생은 두 번 빠진 줄 안다.
 *
 * 여기서 지키는 것은 두 가지이고 서로 반대 방향이다:
 *   ① 짝이 맞으면 표시용 사본을 뺀다.
 *   ② 그러다 **진짜 두 번 산 것**을 뭉개지 않는다(실측: 같은 금액 3초 간격 연속 구매 존재).
 */
import { describe, it, expect } from "vitest";
import {
  dropDuplicateActivityRows,
  toMillis,
  DUPLICATE_WINDOW_MS,
} from "../../utils/ledgerDedupe";

const at = (iso) => ({ toDate: () => new Date(iso) });
// 실측 문구 그대로: 같은 사건의 두 줄은 문구가 다르지만 **품목 이름을 공유**한다.
const act = (amount, iso, extra = {}) => ({
  source: "activity_logs",
  amount,
  description: "급식 우선권 1개 구매 (1,089,000알찬)",
  timestamp: at(iso),
  ...extra,
});
const led = (amount, iso, extra = {}) => ({
  source: "transactions",
  amount,
  description: "[관리자 상점] 급식 우선권 1개 (단가 1,089,000원)",
  timestamp: at(iso),
  ...extra,
});

describe("거래원장 중복 제거", () => {
  it("⭐ 같은 금액·가까운 시각이면 표시용 활동로그를 뺀다 (라이브 재현)", () => {
    // 실측한 그 쌍: 서버 03:09:31.550 · 클라 03:09:31.767 (217ms 차이)
    const kept = dropDuplicateActivityRows(
      [act(-1089000, "2026-08-28T03:09:31.767Z")],
      [led(-1089000, "2026-08-28T03:09:31.550Z")],
    );
    expect(kept).toHaveLength(0);
  });

  it("⭐ **진짜 두 번 산 것**은 뭉개지 않는다 (1:1 짝짓기)", () => {
    // 실측: 꽈배기 −412,500 을 03:50:37 과 03:50:40 에 연달아 구매(3초 간격).
    // 거래원장 2줄 + 활동로그 2줄 → 화면에는 2줄이 남아야 한다.
    const kept = dropDuplicateActivityRows(
      [
        act(-412500, "2026-08-27T03:50:37.826Z"),
        act(-412500, "2026-08-27T03:50:40.500Z"),
      ],
      [
        led(-412500, "2026-08-27T03:50:37.731Z"),
        led(-412500, "2026-08-27T03:50:40.414Z"),
      ],
    );
    expect(kept).toHaveLength(0); // 둘 다 짝이 있으니 사본 둘 다 빠지고
    // 거래원장 2줄은 호출부가 그대로 붙이므로 화면 합계는 2줄이다.
  });

  it("⭐ 거래는 둘인데 활동로그가 하나면 **거래 두 줄이 다 남는다**", () => {
    // 원장 줄 하나는 활동로그 하나와만 짝이 된다 — 한 줄이 두 줄을 삼키지 않는다.
    const ledger = [
      led(-412500, "2026-08-27T03:50:37.731Z"),
      led(-412500, "2026-08-27T03:50:40.414Z"),
    ];
    const kept = dropDuplicateActivityRows(
      [act(-412500, "2026-08-27T03:50:37.826Z")],
      ledger,
    );
    expect(kept).toHaveLength(0);
    // 호출부는 ledger 를 통째로 붙인다 → 2줄. (여기서 확인할 것은 '삼키지 않았다'는 것)
    expect(ledger).toHaveLength(2);
  });

  it("⭐ 거래원장 한 줄이 활동로그 **두 줄을 삼키지 않는다** (사건이 사라지는 자리)", () => {
    // 🔴 여기가 1:1 짝짓기의 진짜 존재 이유다. 서버 원장이 한 건 빠진 채(장애·구버전)
    //    학생이 같은 금액을 두 번 썼다면, 짝짓기를 안 잠그는 순간 활동로그 두 줄이
    //    **같은 거래원장 한 줄과** 짝이 되어 둘 다 빠진다 → 화면에 사건이 하나만 남는다.
    //    중복을 지우려다 거래를 지우는 쪽이 훨씬 나쁘다.
    const kept = dropDuplicateActivityRows(
      [
        act(-412500, "2026-08-27T03:50:37.826Z"),
        act(-412500, "2026-08-27T03:50:39.100Z"),
      ],
      [led(-412500, "2026-08-27T03:50:37.731Z")],
    );
    expect(kept).toHaveLength(1); // 한 줄만 사본으로 빠지고, 나머지 사건은 살아남는다
  });

  it("⭐ 짝이 없는 활동로그는 남긴다 (파킹통장처럼 원장이 하나뿐인 것)", () => {
    const kept = dropDuplicateActivityRows(
      [act(300000, "2026-08-27T23:43:52.587Z", { type: "파킹통장 출금", description: "파킹통장 출금 300,000원" })],
      [led(-1089000, "2026-08-28T03:09:31.550Z")],
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].type).toBe("파킹통장 출금");
  });

  it("⭐ 금액이 다르면 짝이 아니다", () => {
    const kept = dropDuplicateActivityRows(
      [act(-1000, "2026-08-28T03:09:31.767Z")],
      [led(-2000, "2026-08-28T03:09:31.550Z")],
    );
    expect(kept).toHaveLength(1);
  });

  it("⭐ 창 밖이면 짝이 아니다 (하루 뒤 같은 금액은 다른 거래다)", () => {
    const kept = dropDuplicateActivityRows(
      [act(-1089000, "2026-08-28T03:09:31.767Z")],
      [led(-1089000, "2026-08-27T03:09:31.550Z")],
    );
    expect(kept).toHaveLength(1);
  });

  it("⭐ 쿠폰 수량이 다르면 짝이 아니다 (금액만 보면 안 된다)", () => {
    const kept = dropDuplicateActivityRows(
      [act(0, "2026-08-28T03:09:31.767Z", { couponAmount: -3 })],
      [led(0, "2026-08-28T03:09:31.550Z", { couponAmount: -5 })],
    );
    expect(kept).toHaveLength(1);
  });

  it("⭐ 금액·시각이 겹쳐도 **남남이면 짝이 아니다** (사건이 사라지던 자리)", () => {
    // 🔴 2026-08-30 codex CRITICAL. 원장 사본이 없는 파킹통장 기록이, 우연히 같은 금액인
    //    다른 거래와 4초 안에 겹치면 짝으로 잡혀 화면에서 사라진다.
    //    같은 사건이면 품목·상대 이름을 공유한다(실측 76/76). 안 겹치면 남긴다.
    const kept = dropDuplicateActivityRows(
      [
        act(-1089000, "2026-08-28T03:09:31.767Z", {
          description: "파킹통장 출금 1,089,000원",
        }),
      ],
      [led(-1089000, "2026-08-28T03:09:31.550Z")],
    );
    expect(kept).toHaveLength(1);
  });

  it("⭐ 시각을 모르는 줄은 짝짓지 않고 남긴다", () => {
    // 🔴 codex·Gemini 가 같이 짚은 자리. toMillis 가 0 을 돌려주는 두 줄은 간격이 0 이 되어
    //    "금액만 같으면" 서로 다른 날짜의 거래가 짝이 된다. 모르면 남기는 쪽이 안전하다.
    const kept = dropDuplicateActivityRows(
      [{ source: "activity_logs", amount: -1089000, description: "급식 우선권 1개 구매" }],
      [{ source: "transactions", amount: -1089000, description: "급식 우선권 1개" }],
    );
    expect(kept).toHaveLength(1);
  });

  it("⭐ 돈도 쿠폰도 안 움직인 줄은 짝짓기 대상이 아니다", () => {
    const kept = dropDuplicateActivityRows(
      [act(0, "2026-08-28T03:09:31.767Z", { couponAmount: 0, description: "아이템 사용" })],
      [led(0, "2026-08-28T03:09:31.550Z", { couponAmount: 0, description: "아이템 사용" })],
    );
    expect(kept).toHaveLength(1);
  });

  it("⭐ 창 크기는 실측 최대 간격(3.46초)보다 크다", () => {
    // 이 값을 3초 아래로 줄이면 실측된 짝의 일부가 다시 두 줄로 보인다.
    expect(DUPLICATE_WINDOW_MS).toBeGreaterThan(3464);
  });

  it("⭐ 시각을 못 읽으면 조용히 뭉개지 않는다", () => {
    // toMillis 가 0 을 돌려주는 값끼리는 gap 0 이 되어 잘못 짝지어질 수 있다.
    // 그래서 '모르는 시각'은 활동로그 쪽에만 와도 짝이 되지 않도록 금액까지 봐야 한다.
    expect(toMillis(undefined)).toBe(0);
    expect(toMillis({ seconds: 5 })).toBe(5000);
    expect(toMillis(new Date("2026-08-28T00:00:00Z"))).toBe(
      Date.parse("2026-08-28T00:00:00Z"),
    );
  });

  it("⭐ 빈 입력·잘못된 입력에서 터지지 않는다", () => {
    expect(dropDuplicateActivityRows(null, null)).toEqual([]);
    expect(dropDuplicateActivityRows([], [])).toEqual([]);
    expect(dropDuplicateActivityRows([act(-1, "2026-08-28T00:00:00Z")], null)).toHaveLength(1);
  });
});
