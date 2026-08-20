/**
 * 서버 소유 **성취 카탈로그**(P1-7) — 금액을 서버만 안다는 전제를 지킨다.
 *
 * 왜 이게 필요한가 (계획서 §2.4 A1)
 *   초안의 보상 API 는 클라이언트가 `amount` 를 보내고 서버가 캡으로 막는 모양이었다.
 *   그러면 **캡이 방어가 아니라 가격표가 된다** — 공격자는 매일 확정적으로 최대치를 가져간다.
 *   그래서 요청은 `achievementId` 만 담고, 금액·종류·횟수는 이 카탈로그가 정한다.
 *
 * 이 파일이 지키는 불변식
 *   ① 코드의 절대 상한이 Firestore 문서보다 세다 — 문서 값이 넘으면 **거부**한다(조이지 않는다).
 *   ② 모르는 신뢰등급은 가장 낮은 등급으로 떨어진다(오타 하나로 상한이 풀리지 않는다).
 *   ③ 빠진 필드의 기본값이 **관대하지 않다**(maxPerDay 기본 1 — 무제한이 아니다).
 *   ④ 순수 규칙 파일이 Firestore 를 모른다 — 운영 스크립트가 같은 정본으로 사전 검증할 수 있게.
 *   ⑤ 거부 사유가 학생 화면으로 새지 않는다(카탈로그 구조를 알려주는 셈이 된다).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import * as rules from "../../../functions/aap/catalogRules.js";
import { SALARY } from "../../../functions/salaryUtils.js";

const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const { HARD_CEILING, TRUST_LIMITS, DENY_MESSAGE, normalizeAchievement, trustLimitsFor } = rules;

/**
 * 유효한 최소 문서.
 * ⚠️ `active: true` 가 **최소 조건에 들어간다** — "꺼져 있지 않다"가 아니라 "켜져 있다"를
 *    요구하도록 바꿨기 때문이다(2026-08-20 codex CRITICAL). 이 한 줄을 빼면 전부 inactive 다.
 */
const ok = (over = {}) => ({ rewardType: "cash", amount: 1000, active: true, ...over });

describe("절대 상한이 코드에 있다", () => {
  it("⭐ 상한이 주급 상수에서 파생된다 (경제와 따로 놀지 않게)", () => {
    // 리터럴로 박아 두면 주급을 바꾼 뒤 보상만 옛 경제에 남는다.
    expect(HARD_CEILING.CASH_PER_GRANT).toBe(Math.round(SALARY.BASE * 0.01));
    expect(HARD_CEILING.CASH_PER_APP_PER_DAY).toBe(Math.round(SALARY.BASE * 0.03));
    const SRC = codeOnly(read("functions/aap/catalogRules.js"));
    expect(SRC, "상한이 SALARY 에서 오지 않는다").toMatch(/SALARY\.BASE/);
  });

  it("⭐ 1건 상한보다 하루 상한이 크다 (역전되면 하루 1회도 못 준다)", () => {
    expect(HARD_CEILING.CASH_PER_APP_PER_DAY).toBeGreaterThanOrEqual(HARD_CEILING.CASH_PER_GRANT);
    expect(HARD_CEILING.COUPON_PER_APP_PER_DAY).toBeGreaterThanOrEqual(HARD_CEILING.COUPON_PER_GRANT);
  });

  it("⭐ 문서 값이 상한을 넘으면 **거부**한다 (조용히 깎지 않는다)", () => {
    // 조용히 깎으면 오설정이 그대로 굴러가고 "왜 이만큼만 들어오지?"를 아무도 못 찾는다.
    const over = normalizeAchievement(ok({ amount: TRUST_LIMITS.L2.cashPerGrant + 1 }), "L2");
    expect(over.ok).toBe(false);
    expect(over.value, "상한 초과인데 값이 돌아왔다(=깎았다)").toBeUndefined();
  });
});

describe("신뢰등급이 상한을 정한다", () => {
  it("⭐ L0 가 L2 보다 모든 축에서 낮거나 같다", () => {
    for (const k of ["cashPerGrant", "cashPerAppPerDay", "couponPerGrant", "couponPerAppPerDay"]) {
      expect(TRUST_LIMITS.L0[k], `${k} 가 L0 에서 더 크다`).toBeLessThanOrEqual(TRUST_LIMITS.L2[k]);
    }
  });

  it("⭐ 모르는 등급은 **가장 낮은 등급**으로 떨어진다 (fail-closed)", () => {
    // 오타("l0"·"L1"·undefined) 하나로 상한이 풀리면 안 된다. L1 은 계획서에서 폐기된 등급이다.
    // ⚠️ 프로토타입 키를 반드시 포함할 것. `TRUST_LIMITS[lvl] || L0` 로 쓰면 "constructor"·
    //    "toString"·"__proto__" 가 Object.prototype 에서 **truthy** 를 돌려줘 폴백이 안 걸린다
    //    (2026-08-20 내 diff 에서 실제로 그랬다. 재현으로 확인 후 허용목록으로 수정).
    for (const bad of [
      undefined, null, "", "l0", "L1", "L3", "admin", 2, {},
      "__proto__", "constructor", "toString", "valueOf", "hasOwnProperty",
    ]) {
      expect(trustLimitsFor(bad), `${JSON.stringify(bad)} 가 L0 로 안 떨어진다`).toEqual(
        TRUST_LIMITS.L0,
      );
    }
  });

  it("⭐ 상한 객체가 실행 중에 바뀌지 않는다 (얼려 둠)", () => {
    // 얼마까지 줄 수 있는가를 정하는 모듈 싱글턴이다. 어느 경로에서든 바뀌면 그 순간이 취약점이다.
    expect(Object.isFrozen(HARD_CEILING)).toBe(true);
    expect(Object.isFrozen(TRUST_LIMITS)).toBe(true);
    expect(Object.isFrozen(TRUST_LIMITS.L0)).toBe(true);
    expect(Object.isFrozen(TRUST_LIMITS.L2)).toBe(true);
    // 보상 종류 허용목록·거부 문구도 실행 중에 늘어나면 안 된다(2026-08-20 codex NIT:
    // `REWARD_TYPES.push("gold")` 후 rewardType:"gold" 가 통과했다).
    expect(Object.isFrozen(rules.REWARD_TYPES)).toBe(true);
    expect(Object.isFrozen(DENY_MESSAGE)).toBe(true);
    const before = TRUST_LIMITS.L0.cashPerGrant;
    try {
      TRUST_LIMITS.L0.cashPerGrant = 999999;
    } catch {
      /* strict mode 면 던진다 — 그것도 정상 */
    }
    expect(TRUST_LIMITS.L0.cashPerGrant).toBe(before);
  });

  it("⭐ 같은 문서라도 등급이 낮으면 거부된다", () => {
    const doc = ok({ amount: TRUST_LIMITS.L2.cashPerGrant });
    expect(normalizeAchievement(doc, "L2").ok).toBe(true);
    expect(normalizeAchievement(doc, "L0").ok).toBe(false);
  });
});

describe("빠진 필드의 기본값이 관대하지 않다", () => {
  it("⭐ maxPerDay 기본값이 1 이다 (무제한이 아니다)", () => {
    // 기본이 무제한이면 필드 하나 빠뜨린 문서가 그날의 캡을 통째로 태운다.
    expect(normalizeAchievement(ok(), "L0").value.maxPerDay).toBe(1);
  });

  it("⭐ 금액 × 하루횟수가 앱 일일 상한을 넘으면 거부한다", () => {
    // 1건 상한 안에 있는 금액인데도 **횟수를 곱하면** 하루 상한을 넘는 경우.
    // (1건 상한을 넘기면 bad_amount 에서 먼저 걸려 이 경로를 못 본다)
    const lim = TRUST_LIMITS.L0;
    const times = Math.floor(lim.cashPerAppPerDay / lim.cashPerGrant) + 1;
    const v = normalizeAchievement(ok({ amount: lim.cashPerGrant, maxPerDay: times }), "L0");
    expect(lim.cashPerGrant * times).toBeGreaterThan(lim.cashPerAppPerDay);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("day_total_over_ceiling");
  });

  it("⭐ 경계값: **딱 상한이면 통과, 1 넘으면 거부** (off-by-one)", () => {
    // `<=` 를 `<` 로, `>` 를 `>=` 로 바꾸는 변이는 "정상 문서 하나"만 보는 테스트를 통과한다.
    // 상한을 정하는 코드에서 경계 한 칸이 곧 정책이다.
    for (const lvl of ["L0", "L2"]) {
      const lim = TRUST_LIMITS[lvl];

      // 1건 상한: 딱 상한 → 통과 / +1 → 거부
      expect(normalizeAchievement(ok({ amount: lim.cashPerGrant }), lvl).ok, `${lvl} 1건 상한이 막힌다`).toBe(true);
      expect(normalizeAchievement(ok({ amount: lim.cashPerGrant + 1 }), lvl).reason).toBe("bad_amount");

      // 하루 합계: 금액 × 횟수가 딱 상한 → 통과 / +1회 → 거부
      const times = Math.floor(lim.cashPerAppPerDay / lim.cashPerGrant);
      const exact = normalizeAchievement(ok({ amount: lim.cashPerGrant, maxPerDay: times }), lvl);
      expect(lim.cashPerGrant * times).toBe(lim.cashPerAppPerDay);
      expect(exact.ok, `${lvl} 하루 합계가 딱 상한인데 막힌다`).toBe(true);
      expect(
        normalizeAchievement(ok({ amount: lim.cashPerGrant, maxPerDay: times + 1 }), lvl).reason,
      ).toBe("day_total_over_ceiling");

      // 쿠폰 축도 같은 경계를 갖는다.
      expect(normalizeAchievement(ok({ rewardType: "coupon", amount: lim.couponPerGrant }), lvl).ok).toBe(true);
      expect(
        normalizeAchievement(ok({ rewardType: "coupon", amount: lim.couponPerGrant + 1 }), lvl).reason,
      ).toBe("bad_amount");
    }

    // 횟수 상한도 같은 경계.
    expect(normalizeAchievement(ok({ amount: 1, maxPerDay: HARD_CEILING.PER_DAY_COUNT }), "L2").ok).toBe(true);
    expect(
      normalizeAchievement(ok({ amount: 1, maxPerDay: HARD_CEILING.PER_DAY_COUNT + 1 }), "L2").reason,
    ).toBe("bad_max_per_day");
  });

  it("긴 이름은 잘리고, 이름이 없어도 지급은 막지 않는다", () => {
    // label 은 표시용이다. 여기서 거부하면 화면 문구 하나로 돈이 멈춘다.
    expect(normalizeAchievement(ok({ label: "가".repeat(200) }), "L0").value.label).toHaveLength(60);
    expect(normalizeAchievement(ok({ label: 123 }), "L0").value.label).toBe("");
    expect(normalizeAchievement(ok({ label: "  띄어쓰기  " }), "L0").value.label).toBe("띄어쓰기");
  });

  it("revocable 기본값이 true 다 (되돌릴 수 없는 지급을 기본으로 두지 않는다)", () => {
    expect(normalizeAchievement(ok(), "L0").value.revocable).toBe(true);
    expect(normalizeAchievement(ok({ revocable: false }), "L0").value.revocable).toBe(false);
  });
});

describe("오염된 문서를 통과시키지 않는다", () => {
  const cases = [
    ["금액이 0", ok({ amount: 0 }), "bad_amount"],
    ["금액이 음수", ok({ amount: -1000 }), "bad_amount"],
    ["금액이 소수", ok({ amount: 100.5 }), "bad_amount"],
    ["금액이 문자열", ok({ amount: "1000" }), "bad_amount"],
    ["보상 종류가 이상함", ok({ rewardType: "gold" }), "bad_reward_type"],
    ["보상 종류 없음", { amount: 100, active: true }, "bad_reward_type"],
    ["하루횟수가 0", ok({ maxPerDay: 0 }), "bad_max_per_day"],
    ["하루횟수가 상한 초과", ok({ maxPerDay: HARD_CEILING.PER_DAY_COUNT + 1 }), "bad_max_per_day"],
    ["쿨다운이 음수", ok({ cooldownSec: -1 }), "bad_cooldown"],
    ["평생한도가 음수", ok({ maxLifetime: -1 }), "bad_max_lifetime"],
    ["선행조건이 배열이 아님", ok({ prerequisites: "a" }), "bad_prerequisites"],
    ["선행조건에 이상한 id", ok({ prerequisites: ["ok_id", "../escape"] }), "bad_prerequisites"],
    ["문서 없음", null, "not_registered"],
    ["꺼진 성취", ok({ active: false }), "inactive"],
  ];
  for (const [name, doc, reason] of cases) {
    it(`${name} → ${reason}`, () => {
      const v = normalizeAchievement(doc, "L2");
      expect(v.ok).toBe(false);
      expect(v.reason).toBe(reason);
    });
  }

  it("⭐ **켜짐이 명시적**이어야 한다 (active 가 fail-open 이면 안 된다)", () => {
    // `active === false` 만 걸렀더니 null·0·"false"·"off" 는 물론 **필드가 없는 문서까지**
    // 지급 대상이었다(2026-08-20 codex CRITICAL, 재현 확인).
    // "꺼져 있지 않다"와 "켜져 있다"는 다르다 — 돈이 나가는 쪽은 후자를 요구한다.
    for (const a of [undefined, null, 0, 1, "true", "false", "off", {}, []]) {
      const doc = { rewardType: "cash", amount: 1000 };
      if (a !== undefined) doc.active = a;
      const v = normalizeAchievement(doc, "L0");
      expect(v.ok, `active=${JSON.stringify(a)} 인데 지급된다`).toBe(false);
      expect(v.reason).toBe("inactive");
    }
    // 진짜 true 일 때만 통과한다.
    expect(normalizeAchievement({ rewardType: "cash", amount: 1000, active: true }, "L0").ok).toBe(true);
  });

  it("⭐ 오염된 선행조건을 **조용히 걸러내지** 않는다", () => {
    // 걸러내면 선행조건이 사라진 채로 지급된다 — 잠금이 조용히 풀린다.
    const v = normalizeAchievement(ok({ prerequisites: ["good", "bad id!"] }), "L2");
    expect(v.ok).toBe(false);
    expect(v.value).toBeUndefined();
  });
});

describe("거부 사유가 학생에게 새지 않는다", () => {
  it("⭐ 모든 거부 사유에 학생용 문구가 있다", () => {
    // 사유를 새로 만들고 문구를 안 만들면 학생 화면에 undefined 가 뜬다.
    const SRC = codeOnly(read("functions/aap/catalogRules.js"));
    const reasons = [...SRC.matchAll(/reason:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(reasons.length, "사유를 하나도 못 찾았다").toBeGreaterThan(5);
    for (const r of new Set(reasons)) {
      expect(DENY_MESSAGE[r], `사유 '${r}' 에 학생용 문구가 없다`).toBeTruthy();
    }
  });

  it("⭐ 문구가 내부 사유 문자열을 그대로 노출하지 않는다", () => {
    for (const [reason, msg] of Object.entries(DENY_MESSAGE)) {
      expect(msg).not.toContain(reason);
      expect(msg).not.toMatch(/[a-z]+_[a-z]+/); // bad_amount 같은 스네이크 케이스
    }
  });
});

describe("순수 규칙이 Firestore 를 모른다", () => {
  const SRC = codeOnly(read("functions/aap/catalogRules.js"));

  it("⭐ catalogRules 는 db·firebase 를 require 하지 않는다", () => {
    // 운영 스크립트(aap-achievements.mjs)가 **서버와 같은 함수**로 사전 검증하려면
    // 이 파일이 firebase-admin 없이 로드돼야 한다. require 가 하나 붙는 순간 그게 깨진다.
    expect(SRC).not.toMatch(/require\(["']\.\.\/utils["']\)/);
    expect(SRC).not.toMatch(/firebase-admin|firebase-functions/);
    // 허용되는 require 는 순수 상수 모듈뿐이다.
    const reqs = [...SRC.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    expect(reqs).toEqual(["../salaryUtils"]);
  });

  it("⭐ 운영 스크립트가 상한을 **복사하지 않고** 같은 모듈을 쓴다", () => {
    const OPS = codeOnly(read("scripts/ops/aap-achievements.mjs"));
    expect(OPS, "운영 스크립트가 순수 규칙을 안 쓴다").toMatch(/catalogRules\.js/);
    // ⚠️ 파일 전체에서 찾으면 안 된다 — `list` 쪽에도 같은 호출이 있어서, 정작 **쓰기 직전**
    //    검증을 통째로 들어내도 통과한다(2026-08-20 변이 N11 이 실제로 새어 나갔다).
    //    **set 구간만** 잘라서 본다.
    const setRegion = OPS.slice(OPS.indexOf("const candidate = {"));
    expect(setRegion.length, "set 구간을 찾지 못했다").toBeGreaterThan(0);
    expect(setRegion, "쓰기 전에 서버와 같은 판정을 하지 않는다").toMatch(
      /const verdict = rules\.normalizeAchievement\(candidate, level\);/,
    );
    // 판정 결과를 실제로 **막는 데** 써야 한다. 계산만 하고 넘어가면 의미가 없다.
    // ⚠️ "몇 글자 안에 exit 이 있나"로 재지 말 것 — 안내 문구를 한 줄 늘리면 깨진다(실제로
    //    528/600 까지 갔다). 봐야 할 것은 거리가 아니라 **순서**다: 거부 종료가 값 사용보다 앞.
    const afterVerdict = setRegion.slice(setRegion.indexOf("const verdict ="));
    const guard = afterVerdict.slice(afterVerdict.indexOf("if (!verdict.ok)"));
    expect(afterVerdict.indexOf("if (!verdict.ok)"), "거부 분기가 없다").toBeGreaterThan(-1);
    const iExit = guard.indexOf("process.exit(1);");
    const iUse = guard.indexOf("const v = verdict.value;");
    expect(iExit, "거부해도 종료하지 않는다").toBeGreaterThan(-1);
    expect(iUse, "판정값을 쓰는 곳을 찾지 못했다").toBeGreaterThan(-1);
    expect(iExit, "거부 종료가 값 사용보다 뒤에 있다").toBeLessThan(iUse);
    // 숫자를 다시 적어두면 그게 두 번째 정본이다.
    expect(OPS).not.toMatch(/cashPerGrant\s*[:=]\s*\d/);
    expect(OPS).not.toMatch(/CASH_PER_GRANT\s*[:=]\s*\d/);
  });

  it("⭐ `set` 이 **꺼둔 성취를 되살리지 않는다**", () => {
    // PATCH 는 updateMask 없이 전체 치환이라, 그냥 두면 active:true 가 항상 실린다.
    // 끄기는 사고 대응 수단이다 — 금액만 손보다가 부수효과로 다시 켜지면 안 된다.
    // (2026-08-20 라이브 왕복으로 재현·수정: off → set → 여전히 꺼짐)
    const OPS = codeOnly(read("scripts/ops/aap-achievements.mjs"));
    const setRegion = OPS.slice(OPS.indexOf("const candidate = {"));
    expect(setRegion, "기존 active 를 읽지 않는다").toMatch(/const prevActive =/);
    expect(setRegion, "active 를 무조건 true 로 쓴다").not.toMatch(/active: B\(true\)/);
    expect(setRegion).toMatch(/active: B\(keepActive\)/);
  });

  it("⭐ 정수 필드가 서버에서 number 로 읽힌다 (useBigInt 를 켜지 않는다)", () => {
    // 운영 스크립트는 REST 로 쓰고(`integerValue` 는 JSON 에서 **문자열**), 서버는 Admin SDK 로 읽는다.
    // 실측(2026-08-20): 저장 타입은 integer 이고, SDK 의 디코더는
    //   `createInteger = n => _settings.useBigInt ? BigInt(n) : Number(n)`
    // 라서 기본값에서는 JS number 가 나온다 → `Number.isInteger(amount)` 가 참이다.
    // ⚠️ 누군가 useBigInt 를 켜면 amount 가 BigInt 가 되고 `Number.isInteger` 가 거짓이 되어
    //    **모든 성취가 bad_amount 로 거부**된다. 그 설정을 켜지 못하게 여기서 막는다.
    for (const f of ["functions/utils.js", "functions/index.js"]) {
      expect(codeOnly(read(f)), `${f} 에서 useBigInt 를 켰다`).not.toMatch(/useBigInt/);
    }
  });

  it("⭐ 조회 모듈이 **실제로 로드된다** (아직 아무도 안 부르는 코드라 더 필요하다)", async () => {
    // catalog.js 는 P1-2 가 생기기 전까지 어디서도 require 되지 않는다. 그러면 오타·잘못된
    // require 경로가 **배포 후 첫 지급 시도에서야** 터진다. 여기서 한 번 진짜로 불러 둔다.
    const catalog = await import("../../../functions/aap/catalog.js");
    const api = catalog.default ?? catalog;
    expect(typeof api.resolveAchievement).toBe("function");
    expect(typeof api.readAchievement).toBe("function");
    // 순수 규칙 재수출이 이름을 덮지 않는지도 같이 본다.
    // ⚠️ 함수 **동일성**(toBe)으로 비교하지 말 것 — vitest 의 ESM 변환과 catalog.js 안의
    //    CJS require 가 서로 다른 모듈 인스턴스를 만들어서, 같은 코드인데도 다른 객체가 된다
    //    (2026-08-21 실측: "Compared values have no visual difference" 로 실패).
    //    봐야 할 것은 **같은 판정을 하는가** 다.
    expect(api.HARD_CEILING).toEqual(HARD_CEILING);
    for (const doc of [
      { rewardType: "cash", amount: 1000 },
      { rewardType: "cash", amount: 999999 },
      { rewardType: "gold", amount: 1 },
      null,
    ]) {
      expect(api.normalizeAchievement(doc, "L0")).toEqual(normalizeAchievement(doc, "L0"));
    }
  });

  it("⭐ 조회 모듈이 순수 규칙을 다시 구현하지 않는다", () => {
    const CAT = codeOnly(read("functions/aap/catalog.js"));
    expect(CAT).toMatch(/require\("\.\/catalogRules"\)/);
    expect(CAT, "catalog.js 가 검증을 다시 구현했다").not.toMatch(/HARD_CEILING\s*=/);
  });
});

describe("운영 CLI 가 서버와 **같은 판정**을 하려면 타입이 같아야 한다", () => {
  it("⭐ REST 배열 안의 정수가 number 로 나온다 (Admin SDK 와 같게)", async () => {
    // 운영 CLI 는 REST 로 읽은 값을 서버와 같은 검증 함수에 넣어 미리 판정한다.
    // 배열 원소를 `x.stringValue ?? x.integerValue` 로 꺼내면 정수가 **문자열**이 되어,
    // `prerequisites:[123]` 을 CLI 는 ✅ 로 서버는 bad_prerequisites 로 판정했다
    // (2026-08-20 codex WARNING, 재현 확인). Admin SDK 는 int64 를 JS number 로 준다.
    const { plain } = await import("../../../scripts/ops/_firestore-rest.mjs");
    const got = plain({
      prerequisites: { arrayValue: { values: [{ integerValue: "123" }, { stringValue: "ok_id" }] } },
      amount: { integerValue: "500" },
      active: { booleanValue: true },
      note: { nullValue: null },
    });
    expect(got.prerequisites).toEqual([123, "ok_id"]);
    expect(typeof got.prerequisites[0], "배열 정수가 문자열로 나온다").toBe("number");
    expect(got.amount).toBe(500);
    expect(got.active).toBe(true);
    expect(got.note).toBeNull();
  });

  it("⭐ 같은 문서를 CLI 와 서버가 같은 결론으로 본다", async () => {
    const { plain } = await import("../../../scripts/ops/_firestore-rest.mjs");
    // Firestore 에 저장돼 있을 수 있는 모양들. 왼쪽=REST 표현, 오른쪽=Admin SDK 표현.
    const pairs = [
      [{ rewardType: { stringValue: "cash" }, amount: { integerValue: "1000" }, active: { booleanValue: true } },
       { rewardType: "cash", amount: 1000, active: true }],
      [{ rewardType: { stringValue: "cash" }, amount: { integerValue: "1000" }, active: { booleanValue: true },
         prerequisites: { arrayValue: { values: [{ integerValue: "7" }] } } },
       { rewardType: "cash", amount: 1000, active: true, prerequisites: [7] }],
      [{ rewardType: { stringValue: "cash" }, amount: { integerValue: "99999" }, active: { booleanValue: true } },
       { rewardType: "cash", amount: 99999, active: true }],
    ];
    for (const [restDoc, sdkDoc] of pairs) {
      const viaCli = normalizeAchievement(plain(restDoc), "L0");
      const viaServer = normalizeAchievement(sdkDoc, "L0");
      expect(viaCli, `CLI 와 서버 판정이 갈린다: ${JSON.stringify(sdkDoc)}`).toEqual(viaServer);
    }
  });

  it("⭐ 공용 REST 모듈이 **로드 중에 파일을 읽지 않는다**", () => {
    // `.firebaserc` 는 gitignore 대상이라 CI 체크아웃에 없다. 모듈 로드 시점에 읽으면
    // 이 파일을 import 하는 테스트가 **CI 에서만** ENOENT 로 죽는다
    // (2026-08-21 실측: 로컬 694/694 초록불, CI 빨간불. `.firebaserc` 를 잠깐 치워 재현했다).
    // 값 래퍼(S·B·I·A·plain)는 순수 함수라 프로젝트 설정과 상관이 없는데 상수 두 개가 묶고 있었다.
    const SRC = codeOnly(read("scripts/ops/_firestore-rest.mjs"));
    // 최상위(들여쓰기 0)에서 파일을 읽는 줄이 없어야 한다.
    const topLevelIO = SRC.split("\n").filter(
      (l) => /^(export\s+)?(const|let|var)\s.*readFileSync\(/.test(l),
    );
    expect(topLevelIO, `로드 중 파일을 읽는다: ${topLevelIO.join(" / ")}`).toEqual([]);
    // 읽기는 함수 안에서만.
    expect(SRC).toMatch(/export function firestoreProject\(\)/);
  });

  it("⭐ on/off 는 **있는 성취에만** 쓴다 (PATCH 가 없는 문서를 만든다)", () => {
    // 오타 한 번에 `{active:true}` 뿐인 반쪽 문서가 남고 CLI 는 "🟢 켜짐" 이라고 성공을 찍었다.
    // 서버는 그걸 bad_reward_type 으로 거부하니, 운영자는 켰다고 믿는데 학생은 못 받는다.
    const OPS = codeOnly(read("scripts/ops/aap-achievements.mjs"));
    const region = OPS.slice(OPS.indexOf('if (cmd === "off" || cmd === "on")'));
    expect(region.length, "on/off 구간을 찾지 못했다").toBeGreaterThan(0);
    expect(region.slice(0, 800), "존재 전제조건이 없다").toMatch(/currentDocument\.exists=true/);
  });
});

describe("규칙이 카탈로그를 잠근다", () => {
  const RULES = read("firestore.rules");

  it("⭐ appAchievements 는 슈퍼관리자만 읽고 쓴다", () => {
    const i = RULES.indexOf("match /appAchievements/{appId}");
    expect(i, "appAchievements 규칙 블록이 없다").toBeGreaterThan(-1);
    const block = RULES.slice(i, i + 600);
    // 하위 items 까지 같이 잠겨야 한다 — 부모만 잠그면 서브컬렉션은 전국 공개다
    // (이 저장소는 musicRooms/playlist 에서 정확히 그걸 겪었다).
    expect(block).toMatch(/match \/items\/\{achievementId\}/);
    const items = block.slice(block.indexOf("match /items/{achievementId}"));
    expect(items).toMatch(/allow read: if isSuperAdminFast\(\);/);
    expect(items).toMatch(/allow write: if isSuperAdmin\(\);/);
  });

  it("⭐ 학생·교사에게 열린 분기가 없다", () => {
    const i = RULES.indexOf("match /appAchievements/{appId}");
    const block = RULES.slice(i, i + 600);
    expect(block).not.toMatch(/isAuthenticated\(\)|isClassAdmin|request\.auth\.uid ==/);
  });
});
