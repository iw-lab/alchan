/**
 * 아바타 에셋 배선 — URL 생성·변종 탐색·버전 동기화.
 *
 * 이 앱의 base 아바타 5종은 2026-08-03 WebP 이관에서 **혼자만 PNG 로 남았다.**
 * 이유는 성능 판단이 아니라 한 줄짜리 문자열 치환이었다:
 *
 *     rawBaseUrl.replace(/\.png(\?.*)?$/, "_outfit.png$1")
 *
 * `.png` 가 아니면 `replace` 는 **원본을 그대로 돌려준다.** 그러면 호출부는
 * "옷 변종이 있다"고 오판하고, 없는 파일을 src 로 걸고, clipPath 도 잘못 계산한다.
 * 그래서 확장자를 바꾸는 순간 조용히 깨지는 구조였고 — 700 KB PNG 5개가 그대로 남았다.
 * (모든 학생이 어느 화면에서든 받는 파일이다. 아바타를 하나도 안 산 학생도 받는다.)
 *
 * 여기서 잠그는 것은 셋이다.
 *   ① 변종 탐색이 **확장자를 가리지 않는다** — png·webp 둘 다, 쿼리스트링 유무 무관
 *   ② 확장자를 못 알아보면 **null** 을 준다 (원본을 돌려주면 위의 오판이 재발한다)
 *   ③ 두 파일에 복제된 ASSET_VERSION 이 어긋난 채로 배포되지 않는다
 */
import { describe, it, expect } from "vitest";
import { outfitVariantUrl, ASSET_VERSION } from "../../components/Avatar";
import { ALL_AVATAR_ITEMS, BASE_ITEMS } from "../../data/avatarShopCatalog";

describe("① _outfit 변종 URL 은 확장자를 가리지 않는다", () => {
  it.each([
    ["/avatar-shop/base_male.webp", "/avatar-shop/base_male_outfit.webp"],
    ["/avatar-shop/base_female.webp", "/avatar-shop/base_female_outfit.webp"],
    // 옛 PNG 경로도 계속 동작해야 한다 — 학생 문서에 저장된 낡은 imageUrl 이 있을 수 있다.
    ["/avatar-shop/base_male.png", "/avatar-shop/base_male_outfit.png"],
  ])("%s → %s", (input, expected) => {
    expect(outfitVariantUrl(input)).toBe(expected);
  });

  it("쿼리스트링(캐시버스터)은 변종 URL 뒤에 그대로 붙는다", () => {
    expect(outfitVariantUrl("/avatar-shop/base_male.webp?v=20260812a")).toBe(
      "/avatar-shop/base_male_outfit.webp?v=20260812a",
    );
  });
});

describe("② 확장자를 못 알아보면 원본이 아니라 null 을 준다", () => {
  // 원본을 그대로 돌려주면 호출부가 "변종이 있다"고 오판한다 — 이게 정확히 예전 버그다.
  it.each([
    ["/avatar-shop/base_male", "확장자 없음"],
    ["/avatar-shop/base_male.jpg", "모르는 확장자"],
    ["", "빈 문자열"],
    [null, "null"],
    [undefined, "undefined"],
  ])("%s (%s)", (input) => {
    expect(outfitVariantUrl(input)).toBe(null);
  });

  it("확장자가 중간에만 있는 경로는 변종으로 치지 않는다", () => {
    expect(outfitVariantUrl("/avatar-shop/a.png/b")).toBe(null);
  });
});

describe("② 확장자는 **경로에서만** 읽는다 (쿼리·해시에 속지 않는다)", () => {
  // 정규식을 URL 전체에 걸면 두 방향으로 틀린다. 둘 다 잠근다.
  it("쿼리스트링에 확장자 문자열이 섞여도 속지 않는다", () => {
    // `\\.(png|webp)(\\?.*)?$` 였다면 `/a.jpg?next=_outfit.webp` 를 만들어 냈다.
    expect(outfitVariantUrl("/avatar-shop/a.jpg?next=.webp")).toBe(null);
    expect(outfitVariantUrl("/avatar-shop/a.jpg#frag.webp")).toBe(null);
  });

  it("해시가 붙은 멀쩡한 URL 을 버리지 않는다", () => {
    expect(outfitVariantUrl("/avatar-shop/base_male.webp#x")).toBe(
      "/avatar-shop/base_male_outfit.webp#x",
    );
  });

  it("대문자 확장자도 알아본다 (원본 casing 은 보존)", () => {
    expect(outfitVariantUrl("/avatar-shop/base_male.PNG")).toBe(
      "/avatar-shop/base_male_outfit.PNG",
    );
  });

  it("확장자가 두 번 붙으면 마지막 것만 바꾼다", () => {
    expect(outfitVariantUrl("/avatar-shop/a.png.webp")).toBe(
      "/avatar-shop/a.png_outfit.webp",
    );
  });
});

describe("③ ASSET_VERSION 이 두 파일에서 같다", () => {
  it("Avatar.js 의 상수와 카탈로그가 만든 URL 의 버전이 일치한다", () => {
    const withUrl = ALL_AVATAR_ITEMS.find((i) => i.imageUrl);
    expect(withUrl).toBeDefined();
    // 카탈로그는 상수를 export 하지 않으므로 생성된 URL 에서 되뽑아 비교한다.
    const versionInUrl = withUrl.imageUrl.match(/\?v=([^&]+)$/)?.[1];
    expect(versionInUrl).toBe(ASSET_VERSION);
  });
});

describe("카탈로그가 만드는 이미지 URL", () => {
  it("활성 아이템은 전부 .webp 다 — PNG 예외는 더 이상 없다", () => {
    const png = ALL_AVATAR_ITEMS.filter(
      (i) => i.imageUrl && !i.imageUrl.includes(".webp?"),
    );
    expect(png.map((i) => i.id)).toEqual([]);
  });

  it("비활성(deprecated) 아이템은 빈 URL 이다", () => {
    for (const item of ALL_AVATAR_ITEMS.filter((i) => i.active === false)) {
      expect(item.imageUrl).toBe("");
    }
  });

  it("모든 활성 base 아이템이 _outfit 변종 URL 을 만들 수 있다", () => {
    const bases = BASE_ITEMS.map((b) =>
      ALL_AVATAR_ITEMS.find((i) => i.id === b.id),
    ).filter((i) => i && i.active !== false);
    expect(bases.length).toBeGreaterThan(0);
    for (const b of bases) {
      expect(outfitVariantUrl(b.imageUrl)).not.toBe(null);
    }
  });
});

// ④ 2026-11-11 운영 실측: /avatar-shop «착용 중» 미리보기에서 이미지 12장이 깨져 있었다.
//    8월 WebP 이관 전에 산 아이템은 학생 문서에 `.png` 주소가 그대로 남아 있는데,
//    상점 화면만 buildAvatarOverlays 를 안 쓰고 저장 주소를 그대로 그리는 사본을 들고 있었다.
//    (머리띠·프로필은 멀쩡 — 본경로만 고친 전형.) 사본을 없애고 미리보기까지 한 함수가 맡는다.
import { buildAvatarOverlays } from "../../utils/avatarShop";
import fs from "node:fs";
import path from "node:path";

describe("④ 저장된 낡은 주소는 어느 화면에서도 그리지 않는다", () => {
  const stale = (id) => ({ id, imageUrl: `/avatar-shop/${id}.png?v=20260521h` });
  const userDoc = {
    ownedAvatarItems: {
      base_male: stale("base_male"),
      bg_sunset_beach: stale("bg_sunset_beach"),
      hair_messy_male: stale("hair_messy_male"),
    },
    equippedAvatarItems: { base: "base_male", background: "bg_sunset_beach", hair: "hair_messy_male" },
  };

  it("장착분은 카탈로그 주소로 해석한다", () => {
    const o = buildAvatarOverlays(userDoc);
    expect(o.baseUrl).toMatch(/base_male\.webp/);
    expect(o.bgUrl).toMatch(/bg_sunset_beach\.webp/);
    expect(o.slots.hair.url).toMatch(/hair_messy_male\.webp/);
  });

  it("미리보기 아이템이 그 슬롯을 덮는다(주소는 역시 카탈로그)", () => {
    const o = buildAvatarOverlays(userDoc, {
      id: "glasses_round_black", slot: "glasses", imageUrl: "/avatar-shop/glasses_round_black.png",
    });
    expect(o.slots.glasses.url).toMatch(/glasses_round_black\.webp/);
    expect(o.slots.hair.url).toMatch(/hair_messy_male\.webp/); // 다른 슬롯은 그대로
    const bg = buildAvatarOverlays(userDoc, { id: "x_custom", slot: "background", imageUrl: "/x.webp" });
    expect(bg.bgUrl).toBe("/x.webp"); // 카탈로그에 없으면 넘겨받은 주소
  });

  it("상점 화면은 저장 주소로 직접 합성하지 않는다", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../pages/market/AvatarShop.js"), "utf8");
    expect(src).toMatch(/buildAvatarOverlays\(/);
    expect(src).not.toMatch(/owned\[itemId\]/);
  });
});

// ⑤ 2026-11-11 배포본 실측: 상점 목록에 깨진 이미지 4장이 남았다 — 카탈로그에서 없앤 옛 아이템
//    (기본 얼굴형·눈·코·미소)이 avatarShopItems 컬렉션에 그대로 남아 «0알찬 · 구매하기»로 뜨고 있었다.
//    시드는 카탈로그에 있는 것만 다시 쓰고, 없어진 것을 끄지 않는다. 화면이 카탈로그를 기준으로 거른다.
import { onlyCatalogItems } from "../../utils/avatarShop";

describe("⑤ 카탈로그에 없는 옛 아이템은 상점에 안 뜬다", () => {
  const live = ALL_AVATAR_ITEMS.find((i) => i.imageUrl);
  it("카탈로그에 있는 것만 남기고, 그림 주소는 카탈로그 것으로 바꾼다", () => {
    const list = onlyCatalogItems([
      { id: live.id, name: "살아 있는 아이템", imageUrl: `/avatar-shop/${live.id}.png?v=old`, price: 100 },
      { id: "face_default", name: "기본 얼굴형", imageUrl: "/avatar-shop/face_default.png?v=20260523d", price: 0 },
    ]);
    expect(list.map((i) => i.id)).toEqual([live.id]);
    expect(list[0].imageUrl).toBe(live.imageUrl);
    expect(list[0].price).toBe(100); // 가격·이름 같은 나머지 값은 DB 것 그대로
  });
  it("빈 입력에 던지지 않는다", () => {
    expect(onlyCatalogItems(null)).toEqual([]);
    expect(onlyCatalogItems([null, undefined, {}])).toEqual([]);
  });
  it("상점 화면이 이 함수로 거른다", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../pages/market/AvatarShop.js"), "utf8");
    expect(src).toMatch(/onlyCatalogItems\(/);
  });
});
