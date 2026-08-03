// src/test/utils/netAssets.test.js
// 순자산 계산 characterization 테스트 (2026-08-03 신설)
//
// ⚠️ 이 테스트의 목적은 "지금 동작이 옳은가"를 따지는 게 아니라 **현재 동작을 그대로 고정**하는
//    것이다(characterization). 순자산은 금요일 순자산세의 과세표준이고, 과거에 이 계산에서
//    실제 사고가 반복됐다:
//      · 죽은 경로(classes/{cc}/stocks/stockList, financials/loans)를 읽어 주식·대출이 통째 누락
//      · 부동산 owner 를 이름으로 조회해(실제는 UID) 부동산이 0으로 잡힘
//      · portfolio docId 가 숫자형이라 시세 매칭이 타입 불일치로 실패
//    재작성·리팩토링 시 이 값들이 조용히 바뀌면 학생 자산이 틀어지므로 먼저 못을 박는다.
//
// 설계: `netAssets.js`는 localStorage 의 `assetCache_{uid}`(5분 TTL)를 먼저 읽는다.
//       캐시를 시드하면 Firestore 를 전혀 타지 않으므로, 프로덕션 코드를 수정하거나
//       Firestore 를 모킹하지 않고 공개 API 그대로 계산 규칙을 검증할 수 있다.

import { describe, it, expect, beforeEach, vi } from "vitest";

// netAssets.js → `../firebase` 는 모듈 로드 시점에 getAuth()를 호출해 테스트 환경에서
// auth/invalid-api-key 로 죽는다. 캐시 히트 경로는 db 를 전혀 쓰지 않으므로 스텁으로 충분하다.
// (캐시 미스 경로는 getDocs 가 던지고 내부 catch 가 받아 data=null 로 떨어지는 것까지가 검증 대상)
vi.mock("../../firebase", () => ({ db: {}, auth: {}, functions: {}, storage: {} }));

import {
  getNetAssets,
  getNetAssetsDetail,
  isNetAssetsNegative,
  invalidateAssetCaches,
} from "../../utils/netAssets";

const UID = "student-1";

// ⚠️ src/test/setup.js 가 global.localStorage 를 동작하지 않는 vi.fn() 스텁으로 덮어쓴다
//    (getItem 이 항상 undefined). netAssets 는 localStorage 캐시가 핵심 경로라 그 스텁으로는
//    아무것도 검증할 수 없으므로, 이 파일에서만 실제로 동작하는 인메모리 구현으로 교체한다.
function installMemoryLocalStorage() {
  const store = new Map();
  const impl = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), // 미존재 시 null (브라우저 규약)
    setItem: (k, v) => void store.set(String(k), String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  global.localStorage = impl;
  return impl;
}

/** assetCache_{uid} 를 신선한(TTL 내) 상태로 시드한다 */
function seedCache(data) {
  localStorage.setItem(
    `assetCache_${UID}`,
    JSON.stringify({ data, ts: Date.now() }),
  );
}

const user = (over = {}) => ({ id: UID, name: "학생1", classCode: "CLASS1", ...over });

/** 비어 있는 자산 데이터(모든 항목 0) */
const EMPTY = {
  parking: 0,
  deposits: [],
  savings: [],
  loans: [],
  realEstate: [],
  portfolio: { holdings: [] },
  stocks: [],
};

beforeEach(() => {
  installMemoryLocalStorage(); // 매 테스트마다 빈 상태로 새로 설치
});

describe("netAssets — 합산 공식", () => {
  it("현금만 있으면 순자산 = 현금", async () => {
    seedCache(EMPTY);
    await expect(getNetAssets(user({ cash: 50000 }))).resolves.toBe(50000);
  });

  it("쿠폰은 기본 1장=1,000원으로 환산해 더한다", async () => {
    seedCache(EMPTY);
    const u = { ...user(), cash: 0, coupons: 7 };
    await expect(getNetAssets(u)).resolves.toBe(7000);
  });

  it("쿠폰 단가는 인자로 덮어쓸 수 있다", async () => {
    seedCache(EMPTY);
    const u = { ...user(), cash: 0, coupons: 7 };
    await expect(getNetAssets(u, 500)).resolves.toBe(3500);
  });

  it("현금·쿠폰·파킹·예적금·주식·부동산을 더하고 대출을 뺀다", async () => {
    seedCache({
      ...EMPTY,
      parking: 10000,
      deposits: [{ balance: 20000 }],
      savings: [{ balance: 30000 }],
      loans: [{ remainingPrincipal: 15000 }],
      realEstate: [{ price: 40000 }],
      portfolio: { holdings: [{ stockId: "1", quantity: 2 }] },
      stocks: [{ id: "1", isListed: true, price: 5000 }],
    });
    const u = { ...user(), cash: 1000, coupons: 1 }; // 1000 + 1000
    // 1000(현금) + 1000(쿠폰) + 10000(파킹) + 50000(예적금) + 10000(주식) + 40000(부동산) - 15000(대출)
    await expect(getNetAssets(u)).resolves.toBe(97000);
  });
});

describe("netAssets — 주식 평가 (과거 사고 지점)", () => {
  it("portfolio docId 가 숫자여도 문자열 id 시세와 매칭된다", async () => {
    // 과거 타입 불일치로 주식이 통째 누락되던 버그를 고정한다.
    seedCache({
      ...EMPTY,
      portfolio: { holdings: [{ stockId: 12, quantity: 3 }] },
      stocks: [{ id: "12", isListed: true, price: 1000 }],
    });
    await expect(getNetAssets(user({ cash: 0 }))).resolves.toBe(3000);
  });

  it("상장폐지(isListed=false) 종목은 0원으로 친다", async () => {
    seedCache({
      ...EMPTY,
      portfolio: { holdings: [{ stockId: "1", quantity: 10 }] },
      stocks: [{ id: "1", isListed: false, price: 9999 }],
    });
    await expect(getNetAssets(user({ cash: 0 }))).resolves.toBe(0);
  });

  it("시세에 없는 고아 종목은 0원으로 친다", async () => {
    // 실제로 고아 포지션 54건이 있었고 전부 0원 처리되고 있었다.
    seedCache({
      ...EMPTY,
      portfolio: { holdings: [{ stockId: "sold-out", quantity: 100 }] },
      stocks: [{ id: "1", isListed: true, price: 500 }],
    });
    await expect(getNetAssets(user({ cash: 0 }))).resolves.toBe(0);
  });

  it("수량이 0 이하인 보유분은 평가에서 제외한다", async () => {
    seedCache({
      ...EMPTY,
      portfolio: { holdings: [{ stockId: "1", quantity: 0 }] },
      stocks: [{ id: "1", isListed: true, price: 500 }],
    });
    await expect(getNetAssets(user({ cash: 0 }))).resolves.toBe(0);
  });
});

describe("netAssets — 필드 폴백 규칙", () => {
  it("부동산은 price 우선, 없으면 value 를 쓴다", async () => {
    seedCache({ ...EMPTY, realEstate: [{ price: 1000 }, { value: 2000 }] });
    await expect(getNetAssets(user({ cash: 0 }))).resolves.toBe(3000);
  });

  it("대출은 remainingPrincipal 우선, 없으면 balance 를 쓴다", async () => {
    seedCache({
      ...EMPTY,
      loans: [{ remainingPrincipal: 1000 }, { balance: 2000 }],
    });
    await expect(getNetAssets(user({ cash: 0 }))).resolves.toBe(-3000);
  });

  it("대출이 자산보다 크면 순자산은 음수가 된다", async () => {
    seedCache({ ...EMPTY, loans: [{ remainingPrincipal: 100000 }] });
    await expect(getNetAssets(user({ cash: 1000 }))).resolves.toBe(-99000);
  });
});

describe("netAssets — 결측·오염 데이터 내성", () => {
  it("배열이어야 할 항목이 아니어도 던지지 않고 0으로 친다", async () => {
    seedCache({
      parking: null,
      deposits: "nope",
      savings: undefined,
      loans: 42,
      realEstate: null,
      portfolio: null,
      stocks: { not: "array" },
    });
    await expect(getNetAssets(user({ cash: 5000 }))).resolves.toBe(5000);
  });

  it("숫자가 아닌 금액은 0으로 친다(NaN 전파 금지)", async () => {
    seedCache({
      ...EMPTY,
      deposits: [{ balance: "abc" }],
      realEstate: [{ price: undefined }],
    });
    const net = await getNetAssets(user({ cash: 1000 }));
    expect(Number.isNaN(net)).toBe(false);
    expect(net).toBe(1000);
  });

  it("cash·coupons 가 문자열이어도 숫자로 해석한다", async () => {
    seedCache(EMPTY);
    const u = { ...user(), cash: "1500", coupons: "2" };
    await expect(getNetAssets(u)).resolves.toBe(3500);
  });

  it("user 가 없거나 id 가 없으면 0을 반환한다", async () => {
    await expect(getNetAssets(null)).resolves.toBe(0);
    await expect(getNetAssets({ name: "id 없음" })).resolves.toBe(0);
  });
});

describe("getNetAssetsDetail — 대출 합계 동시 반환", () => {
  it("net 과 loanTotal 을 한 번의 로드로 함께 준다", async () => {
    seedCache({
      ...EMPTY,
      parking: 5000,
      loans: [{ remainingPrincipal: 3000 }, { balance: 1000 }],
    });
    const { net, loanTotal } = await getNetAssetsDetail(user({ cash: 0 }));
    expect(loanTotal).toBe(4000);
    expect(net).toBe(1000); // 5000 - 4000
  });

  it("user 가 없으면 net·loanTotal 모두 0", async () => {
    await expect(getNetAssetsDetail(null)).resolves.toEqual({
      net: 0,
      loanTotal: 0,
    });
  });
});

describe("isNetAssetsNegative — 판정과 fail-open", () => {
  it("음수면 true", async () => {
    seedCache({ ...EMPTY, loans: [{ remainingPrincipal: 10 }] });
    await expect(isNetAssetsNegative(user({ cash: 0 }))).resolves.toBe(true);
  });

  it("0 이면 false (0은 음수가 아니다)", async () => {
    seedCache(EMPTY);
    await expect(isNetAssetsNegative(user({ cash: 0 }))).resolves.toBe(false);
  });

  it("계산이 실패해도 false 를 반환한다(과도한 차단 방지 — 의도된 fail-open)", async () => {
    // 캐시를 깨진 JSON 으로 만들면 readAssetCache 가 null 을 주고 Firestore 로드로 넘어간다.
    // 테스트 환경엔 Firestore 가 없으므로 내부 catch 가 동작해야 하고, 어떤 경우든 throw 금지.
    localStorage.setItem(`assetCache_${UID}`, "{{ broken json");
    await expect(isNetAssetsNegative(user({ cash: 0 }))).resolves.toBe(false);
  });
});

describe("invalidateAssetCaches", () => {
  it("순자산 표시에 관여하는 캐시 3종을 모두 지운다", () => {
    localStorage.setItem(`assetCache_${UID}`, "x");
    localStorage.setItem(`firestore_cache_myAssets_${UID}`, "x");
    localStorage.setItem(`firestore_cache_myAssets_${UID}_${UID}`, "x");
    invalidateAssetCaches(UID);
    expect(localStorage.getItem(`assetCache_${UID}`)).toBeNull();
    expect(localStorage.getItem(`firestore_cache_myAssets_${UID}`)).toBeNull();
    expect(
      localStorage.getItem(`firestore_cache_myAssets_${UID}_${UID}`),
    ).toBeNull();
  });

  it("userId 가 없으면 아무것도 지우지 않는다", () => {
    localStorage.setItem(`assetCache_${UID}`, "keep");
    invalidateAssetCaches(null);
    expect(localStorage.getItem(`assetCache_${UID}`)).toBe("keep");
  });
});

describe("캐시 TTL", () => {
  it("5분이 지난 캐시는 무시한다(Firestore 재로드 경로로 넘어감)", async () => {
    // 만료 캐시 → readAssetCache null → loadAssetDataFromDb 시도 → 테스트 환경에선 실패 →
    // data=null 로 계산되어 현금만 남는다. "만료 캐시를 그대로 쓰지 않는다"가 고정 대상.
    localStorage.setItem(
      `assetCache_${UID}`,
      JSON.stringify({
        data: { ...EMPTY, parking: 999999 },
        ts: Date.now() - 6 * 60 * 1000,
      }),
    );
    const net = await getNetAssets(user({ cash: 100 }));
    expect(net).not.toBe(1000099); // 만료 캐시의 파킹이 반영되면 안 된다
    expect(net).toBe(100);
  });
});
