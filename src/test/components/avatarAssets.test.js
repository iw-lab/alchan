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
