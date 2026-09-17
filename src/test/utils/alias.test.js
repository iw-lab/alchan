// 별칭 생성기 — 실명이 들어올 자리를 없앤 장치라서, "항상 목록 안의 값만 나온다"가 핵심 불변식이다.
import { describe, it, expect } from "vitest";
import {
  ADJECTIVES,
  ANIMALS,
  ALIAS_SPACE,
  makeAlias,
  makeAliasChoices,
  buildDisplayName,
  stripNumberPrefix,
} from "../../utils/alias";

const IN_VOCAB = new RegExp(`^(${ADJECTIVES.join("|")}) (${ANIMALS.join("|")})$`);

describe("별칭 어휘", () => {
  it("형용사·동물에 중복이 없다", () => {
    expect(new Set(ADJECTIVES).size).toBe(ADJECTIVES.length);
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length);
  });

  it("가짓수가 한 반을 덮고도 남는다(720)", () => {
    expect(ALIAS_SPACE).toBe(ADJECTIVES.length * ANIMALS.length);
    expect(ALIAS_SPACE).toBeGreaterThan(100);
  });

  it("어휘에 한글 아닌 문자가 섞여 있지 않다", () => {
    for (const w of [...ADJECTIVES, ...ANIMALS]) {
      expect(w).toMatch(/^[가-힣]+$/);
    }
  });
});

describe("makeAlias", () => {
  it("1000번 뽑아도 전부 어휘 안의 조합이다 — 자유 입력이 새어들 틈이 없다", () => {
    for (let i = 0; i < 1000; i++) {
      expect(makeAlias()).toMatch(IN_VOCAB);
    }
  });

  it("난수가 경계값(1에 수렴)이어도 배열 밖으로 안 나간다", () => {
    const alias = makeAlias(() => 0.999999999);
    expect(alias).toMatch(IN_VOCAB);
  });

  it("난수가 0이면 첫 조합", () => {
    expect(makeAlias(() => 0)).toBe(`${ADJECTIVES[0]} ${ANIMALS[0]}`);
  });
});

describe("makeAliasChoices", () => {
  it("요청한 개수만큼, 서로 다른 값을 준다", () => {
    const got = makeAliasChoices(4);
    expect(got).toHaveLength(4);
    expect(new Set(got).size).toBe(4);
  });

  it("가짓수보다 많이 요구해도 멈춘다(무한루프 금지)", () => {
    const got = makeAliasChoices(ALIAS_SPACE + 50);
    expect(got.length).toBeLessThanOrEqual(ALIAS_SPACE);
  });

  it("난수가 고정돼 한 값만 나와도 끝난다", () => {
    const got = makeAliasChoices(4, () => 0.5);
    expect(got).toHaveLength(1);
  });

  it("0이나 음수를 줘도 최소 1개", () => {
    expect(makeAliasChoices(0)).toHaveLength(1);
    expect(makeAliasChoices(-3)).toHaveLength(1);
  });
});

describe("buildDisplayName", () => {
  it("번호를 앞에 붙인다", () => {
    expect(buildDisplayName(3, "빠른 다람쥐")).toBe("3번 빠른 다람쥐");
  });

  it("번호가 없으면 별칭만 — 번호 미부여 학생도 화면이 깨지지 않는다", () => {
    expect(buildDisplayName(null, "빠른 다람쥐")).toBe("빠른 다람쥐");
    expect(buildDisplayName(undefined, "빠른 다람쥐")).toBe("빠른 다람쥐");
    expect(buildDisplayName(0, "빠른 다람쥐")).toBe("빠른 다람쥐");
    expect(buildDisplayName("", "빠른 다람쥐")).toBe("빠른 다람쥐");
  });

  it("문자열 번호도 받는다(Firestore 정수/문자 혼재 대비)", () => {
    expect(buildDisplayName("7", "멋진 수달")).toBe("7번 멋진 수달");
  });

  it("별칭이 비면 번호만 남는다", () => {
    expect(buildDisplayName(5, "")).toBe("5번");
    expect(buildDisplayName(5, null)).toBe("5번");
  });

  it("번호와 별칭이 둘 다 없으면 빈 문자열", () => {
    expect(buildDisplayName(null, null)).toBe("");
  });
});

describe("stripNumberPrefix", () => {
  it("번호 접두어를 떼어낸다", () => {
    expect(stripNumberPrefix("3번 빠른 다람쥐")).toBe("빠른 다람쥐");
    expect(stripNumberPrefix("12번 멋진 수달")).toBe("멋진 수달");
  });

  it("접두어가 없으면 그대로", () => {
    expect(stripNumberPrefix("빠른 다람쥐")).toBe("빠른 다람쥐");
  });

  it("번호만 있으면 빈 문자열", () => {
    expect(stripNumberPrefix("3번")).toBe("");
  });

  it("빈 값에도 안 터진다", () => {
    expect(stripNumberPrefix(null)).toBe("");
    expect(stripNumberPrefix(undefined)).toBe("");
  });

  it("buildDisplayName 과 왕복한다", () => {
    const alias = "슬기로운 부엉이";
    expect(stripNumberPrefix(buildDisplayName(9, alias))).toBe(alias);
  });
});
