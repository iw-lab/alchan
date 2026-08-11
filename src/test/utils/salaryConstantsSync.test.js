/**
 * 급여 상수 동기화 — 클라이언트 사본이 서버 진실원과 어긋나면 실패한다.
 *
 * 이 앱은 같은 함정을 두 번 밟았다.
 *   2026-07-01 국무총리 보너스가 한쪽만 수정돼 **과다지급**(bd77e49)
 *   2026-07-27 같은 화면 안에서 "현재 기본급"과 "계산 예시"가 다른 숫자를 보임
 *              — 고친 건 예시 쪽뿐이었고 인라인 복제본은 그대로 남았다(2026-08-11 M4에서 발견)
 *
 * 클라이언트는 별도 빌드라 functions/ 를 import 할 수 없어 값을 복제할 수밖에 없다.
 * 복제 자체는 못 없애지만, **어긋난 채로 배포되는 것**은 여기서 막는다.
 * 한쪽만 바꾸면 이 테스트가 빨간불이 되고, 그때 나머지 한쪽도 같이 바꾸면 된다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  CLIENT_SALARY,
  computeClientEffectiveBase,
} from "../../utils/salaryCalculator";

const require_ = createRequire(import.meta.url);
const { SALARY, computeEffectiveBase } = require_(
  "../../../functions/salaryUtils.js",
);

describe("클라이언트 급여 상수 = 서버 급여 상수", () => {
  it.each([
    ["BASE", "기본 주급"],
    ["ADDITIONAL", "추가 직업당 가산"],
    ["PRESIDENT_BONUS", "대통령 보너스"],
    ["DEFAULT_MAX_JOBS", "직업 개수 상한 기본값"],
    ["MAX_BASE", "실효 기본급 상한"],
  ])("%s (%s) 가 서버와 같다", (key) => {
    expect(CLIENT_SALARY[key]).toBe(SALARY[key]);
  });

  it("클라이언트가 서버에 없는 상수를 갖고 있지 않다", () => {
    for (const key of Object.keys(CLIENT_SALARY)) {
      expect(SALARY).toHaveProperty(key);
    }
  });
});

describe("실효 기본급 계산이 서버와 같은 값을 준다", () => {
  it.each([
    [1, "인상 없음"],
    [1.1576, "라이브 실측값(2026-08)"],
    [2, "2배"],
    [1.05 ** 20, "20주 복리"],
  ])("배수 %s (%s)", (multiplier) => {
    expect(computeClientEffectiveBase(multiplier)).toBe(
      computeEffectiveBase(multiplier),
    );
  });

  it.each([
    [undefined, "미설정"],
    [null, "null"],
    [0, "0"],
    [-1, "음수"],
    [NaN, "NaN"],
  ])("이상값 %s (%s) 도 서버와 같게 폴백한다", (multiplier) => {
    expect(computeClientEffectiveBase(multiplier)).toBe(
      computeEffectiveBase(multiplier),
    );
  });
});
