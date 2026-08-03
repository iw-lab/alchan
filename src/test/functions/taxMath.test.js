/**
 * 주간세(순자산세·부동산 보유세) characterization 테스트.
 *
 * 성격: "이게 옳은 세법인가"가 아니라 **"지금 학생들에게 실제로 걷히는 금액"**을 고정한다.
 * 이 공식은 학생 현금을 정기적으로 직접 차감하는 유일한 경로이고(increment(-totalTax),
 * 현금이 부족해도 마이너스 허용) 매주 전교생에게 실행된다. 재작성·리팩토링 때
 * 금액이 1원이라도 달라지면 여기서 빨간불이 켜져야 한다.
 *
 * 세율·면세 기준을 바꾸는 건 교사의 정책 결정이고 UI로 하는 일이다.
 * 이 테스트가 지키는 건 정책이 아니라 **계산기**다.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_WEEKLY_TAX,
  normalizeWeeklyTaxSettings,
  computeWeeklyTax,
} from "../../../functions/taxMath.js";

const DEFAULTS = normalizeWeeklyTaxSettings({});

describe("normalizeWeeklyTaxSettings — 교사 입력 방어", () => {
  it("설정이 없으면 기본값 (순자산세 0.5%, 보유세 0.2%, 면세 0)", () => {
    expect(DEFAULTS).toEqual({
      netAssetTaxRate: 0.005,
      propertyHoldingTaxRate: 0.002,
      netAssetTaxExemption: 0,
    });
    expect(DEFAULT_WEEKLY_TAX.netAssetTaxRate).toBe(0.005);
  });

  it("null·undefined 를 넘겨도 기본값 (조회 실패 경로)", () => {
    expect(normalizeWeeklyTaxSettings(null)).toEqual(DEFAULTS);
    expect(normalizeWeeklyTaxSettings(undefined)).toEqual(DEFAULTS);
  });

  it("교사가 설정한 값을 그대로 쓴다", () => {
    expect(
      normalizeWeeklyTaxSettings({
        netAssetTaxRate: 0.01,
        netAssetTaxExemption: 500000,
        propertyHoldingTaxRate: 0.005,
      }),
    ).toEqual({
      netAssetTaxRate: 0.01,
      netAssetTaxExemption: 500000,
      propertyHoldingTaxRate: 0.005,
    });
  });

  // 🔴 음수 세율은 과세를 '지급'으로 뒤집는다 — 학생이 세금을 낼 때마다 돈이 생긴다.
  it("음수 세율은 0 으로 눌린다 (과세가 지급으로 뒤집히는 것 차단)", () => {
    const s = normalizeWeeklyTaxSettings({
      netAssetTaxRate: -0.5,
      propertyHoldingTaxRate: -1,
    });
    expect(s.netAssetTaxRate).toBe(0);
    expect(s.propertyHoldingTaxRate).toBe(0);

    // 실제 계산까지 확인 — 음수 세액이 나오지 않는다
    const tax = computeWeeklyTax({ netAssets: 1000000, realEstateValue: 500000 }, s);
    expect(tax.totalTax).toBe(0);
  });

  it("100% 초과 세율은 1 로 잘린다 (전액 몰수까지만)", () => {
    const s = normalizeWeeklyTaxSettings({
      netAssetTaxRate: 5,
      propertyHoldingTaxRate: 99,
    });
    expect(s.netAssetTaxRate).toBe(1);
    expect(s.propertyHoldingTaxRate).toBe(1);
  });

  it("숫자가 아닌 값·NaN·Infinity 는 기본값으로 대체된다", () => {
    // "0.01" 문자열이 포함된 이유: 판정이 Number.isFinite 라 타입 강제변환을 하지 않는다.
    // 교사 UI 의 <input type="number"> 가 문자열을 저장하는 회귀가 나면 세율이 조용히
    // 0 이 되는 게 아니라 기본값으로 떨어진다 — 그 동작을 여기서 고정한다.
    for (const bad of [NaN, Infinity, -Infinity, "0.01", null, undefined, {}, []]) {
      const s = normalizeWeeklyTaxSettings({
        netAssetTaxRate: bad,
        propertyHoldingTaxRate: bad,
        netAssetTaxExemption: bad,
      });
      expect(s).toEqual(DEFAULTS);
    }
  });

  it("음수 면세 기준은 0 (= 모두 과세) 으로 정규화된다", () => {
    expect(normalizeWeeklyTaxSettings({ netAssetTaxExemption: -100000 }).netAssetTaxExemption).toBe(0);
  });

  it("면세 기준에는 상한이 없다 (학급 경제 인플레를 따라가야 함)", () => {
    // 고정 상수 상한을 넣으면 인플레한 학급에서 전원 과세로 뒤집힌다
    // (2026-06-12 activity_logs ±1억 상한 사고와 같은 버그 클래스).
    expect(normalizeWeeklyTaxSettings({ netAssetTaxExemption: 1e12 }).netAssetTaxExemption).toBe(1e12);
  });

  it("세율 0 은 유효한 설정이다 (해당 세금 끄기)", () => {
    const s = normalizeWeeklyTaxSettings({ netAssetTaxRate: 0, propertyHoldingTaxRate: 0 });
    expect(s.netAssetTaxRate).toBe(0);
    expect(s.propertyHoldingTaxRate).toBe(0);
  });

  // ⚠️ 현재 동작 고정 — 이건 "옳다"가 아니라 "지금 이렇다"는 기록이다.
  //   교사 UI(NationalTaxService.js)는 입력칸을 비우면 빈 문자열 ""을 그대로 저장한다
  //   (handleSettingChange: value === "" ? "" : parseFloat(value) → saveTaxSettings 가 spread).
  //   서버는 ""를 '미설정'으로 보고 기본값을 쓴다 → **칸을 비워서 세금을 끄려던 교사는
  //   여전히 기본 0.5%로 걷히게 된다**(0을 입력해야 꺼진다).
  //   product 결정 필요: 빈칸 = 기본값 유지 vs 세금 끄기. 바꾸려면 학생 과세액이 바뀌므로
  //   교사에게 먼저 알려야 한다. 그때까지 이 테스트가 현재 동작을 잠근다.
  it("빈 문자열은 '미설정'으로 취급되어 기본값이 된다 (칸을 비워도 세금이 꺼지지 않는다)", () => {
    const s = normalizeWeeklyTaxSettings({
      netAssetTaxRate: "",
      propertyHoldingTaxRate: "",
      netAssetTaxExemption: "",
    });
    expect(s.netAssetTaxRate).toBe(0.005); // 0 이 아니다
    expect(s.propertyHoldingTaxRate).toBe(0.002);
    expect(s.netAssetTaxExemption).toBe(0);
  });
});

describe("computeWeeklyTax — 순자산세", () => {
  it("기본 세율로 순자산 100만원 → 5,000원", () => {
    expect(computeWeeklyTax({ netAssets: 1000000, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(5000);
  });

  // 경계: 면세 기준과 '같으면' 면세다(> 이지 >= 아님). 교사가 기준을 공지하므로 이 경계가 곧 약속이다.
  it("순자산이 면세 기준과 정확히 같으면 면세", () => {
    const s = normalizeWeeklyTaxSettings({ netAssetTaxExemption: 500000 });
    expect(computeWeeklyTax({ netAssets: 500000, realEstateValue: 0 }, s).netAssetTax).toBe(0);
  });

  it("면세 기준을 1원이라도 넘으면 전액에 과세 (초과분이 아니라 전액)", () => {
    const s = normalizeWeeklyTaxSettings({ netAssetTaxExemption: 500000 });
    // 초과분 1원이 아니라 500,001원 전체가 과세표준
    expect(computeWeeklyTax({ netAssets: 500001, realEstateValue: 0 }, s).netAssetTax).toBe(2500);
  });

  it("순자산 0원·마이너스는 과세 0 (빚이 자산보다 많은 학생에게 세금을 물리지 않는다)", () => {
    expect(computeWeeklyTax({ netAssets: 0, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(0);
    expect(computeWeeklyTax({ netAssets: -3000000, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(0);
  });

  it("반올림은 Math.round — 0.5 는 올림", () => {
    // 100 × 0.005 = 0.5 → 1원
    expect(computeWeeklyTax({ netAssets: 100, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(1);
    // 99 × 0.005 = 0.495 → 0원
    expect(computeWeeklyTax({ netAssets: 99, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(0);
  });

  it("순자산이 NaN 이면 과세 0 (계산 실패가 학생에게 청구되지 않는다)", () => {
    expect(computeWeeklyTax({ netAssets: NaN, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(0);
    expect(computeWeeklyTax({ netAssets: undefined, realEstateValue: 0 }, DEFAULTS).netAssetTax).toBe(0);
  });
});

describe("computeWeeklyTax — 부동산 보유세", () => {
  it("기본 세율로 부동산 50만원 → 1,000원", () => {
    expect(computeWeeklyTax({ netAssets: 0, realEstateValue: 500000 }, DEFAULTS).propertyTax).toBe(1000);
  });

  it("부동산이 없으면 0 (면세 기준과 무관)", () => {
    expect(computeWeeklyTax({ netAssets: 9999999, realEstateValue: 0 }, DEFAULTS).propertyTax).toBe(0);
  });

  it("세율이 0 이면 부동산이 있어도 0 (교사가 보유세를 끈 학급)", () => {
    const s = normalizeWeeklyTaxSettings({ propertyHoldingTaxRate: 0 });
    expect(computeWeeklyTax({ netAssets: 0, realEstateValue: 10000000 }, s).propertyTax).toBe(0);
  });

  it("보유세에는 면세 기준이 적용되지 않는다 (순자산세 전용)", () => {
    const s = normalizeWeeklyTaxSettings({ netAssetTaxExemption: 1e9 });
    const tax = computeWeeklyTax({ netAssets: 1000000, realEstateValue: 500000 }, s);
    expect(tax.netAssetTax).toBe(0); // 면세
    expect(tax.propertyTax).toBe(1000); // 그래도 보유세는 걷힌다
  });

  it("부동산 가치가 NaN 이면 0", () => {
    expect(computeWeeklyTax({ netAssets: 0, realEstateValue: NaN }, DEFAULTS).propertyTax).toBe(0);
  });
});

describe("computeWeeklyTax — 합계 정합", () => {
  // 감사 로그(activity_logs)는 순자산세·보유세를 항목별로 따로 기록하고,
  // 학생 현금은 totalTax 한 번으로 차감된다. 둘이 어긋나면 장부가 맞지 않는다.
  it("totalTax 는 항목 합과 정확히 일치한다 (합계를 따로 반올림하지 않는다)", () => {
    const cases = [
      { netAssets: 1234567, realEstateValue: 987654 },
      { netAssets: 1, realEstateValue: 1 },
      { netAssets: 0, realEstateValue: 0 },
      { netAssets: -5000, realEstateValue: 333333 },
      { netAssets: 99999999, realEstateValue: 88888888 },
    ];
    for (const c of cases) {
      const t = computeWeeklyTax(c, DEFAULTS);
      expect(t.totalTax).toBe(t.netAssetTax + t.propertyTax);
    }
  });

  it("세액은 절대 음수가 될 수 없다 (어떤 설정·자산 조합에서도)", () => {
    const settings = [
      {},
      { netAssetTaxRate: -1, propertyHoldingTaxRate: -1 },
      { netAssetTaxRate: 1, propertyHoldingTaxRate: 1 },
      { netAssetTaxExemption: -999 },
    ].map(normalizeWeeklyTaxSettings);
    const assets = [
      { netAssets: -1e9, realEstateValue: -1e9 },
      { netAssets: 0, realEstateValue: 0 },
      { netAssets: 1e9, realEstateValue: 1e9 },
      { netAssets: NaN, realEstateValue: NaN },
    ];
    for (const s of settings) {
      for (const a of assets) {
        const t = computeWeeklyTax(a, s);
        expect(t.netAssetTax).toBeGreaterThanOrEqual(0);
        expect(t.propertyTax).toBeGreaterThanOrEqual(0);
        expect(t.totalTax).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("실사용 시나리오: 순자산 320만·부동산 80만 학생의 주간세", () => {
    const t = computeWeeklyTax({ netAssets: 3200000, realEstateValue: 800000 }, DEFAULTS);
    expect(t).toEqual({ netAssetTax: 16000, propertyTax: 1600, totalTax: 17600 });
  });
});

// 위 describe 들은 전부 normalizeWeeklyTaxSettings 를 거친 설정만 넘긴다.
// 그래서 "정규화하면 안전하다"는 증명하지만 "함수 자체가 안전하다"는 증명하지 못했다.
// codex·code-reviewer 두 계열이 독립적으로 같은 구멍을 지적했고(2026-08-03 FULL 교차검증),
// 실측으로 재현됐다 — 정규화를 잊고 raw taxSettings 를 넘기면 -500,000원이 나왔다.
// computeWeeklyTax 가 내부에서 다시 정규화하도록 고쳤고, 아래가 그 방어를 지킨다.
describe("computeWeeklyTax — 정규화를 건너뛴 호출도 안전한가", () => {
  it("raw 음수 세율을 직접 넘겨도 세액은 0 (과세가 지급으로 뒤집히지 않는다)", () => {
    const t = computeWeeklyTax(
      { netAssets: 1000000, realEstateValue: 500000 },
      { netAssetTaxRate: -0.5, netAssetTaxExemption: 0, propertyHoldingTaxRate: -0.3 },
    );
    expect(t).toEqual({ netAssetTax: 0, propertyTax: 0, totalTax: 0 });
  });

  it("raw 설정과 정규화된 설정의 결과가 같다 (정규화는 멱등)", () => {
    const raws = [
      {},
      { netAssetTaxRate: 5, propertyHoldingTaxRate: 99 },
      { netAssetTaxExemption: -100000 },
      { netAssetTaxRate: "0.01", propertyHoldingTaxRate: NaN },
      { netAssetTaxRate: 0.01, netAssetTaxExemption: 500000, propertyHoldingTaxRate: 0.005 },
    ];
    const student = { netAssets: 1234567, realEstateValue: 987654 };
    for (const raw of raws) {
      expect(computeWeeklyTax(student, raw)).toEqual(
        computeWeeklyTax(student, normalizeWeeklyTaxSettings(raw)),
      );
    }
  });

  it("settings 가 없거나 null 이어도 기본 세율로 계산된다", () => {
    const student = { netAssets: 1000000, realEstateValue: 500000 };
    const expected = { netAssetTax: 5000, propertyTax: 1000, totalTax: 6000 };
    expect(computeWeeklyTax(student, null)).toEqual(expected);
    expect(computeWeeklyTax(student, undefined)).toEqual(expected);
  });
});
