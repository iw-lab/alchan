/**
 * 관리자 회수의 0원 바닥 — 돈이 생기거나 사라지지 않는지 지킨다.
 *
 * 실제 사고(2026-07-27, 9BVPKP): −50,000,000 회수가 28분 간격으로 두 번 들어가
 * 한 학생이 **−99,724,000** 이 됐다. 두 번째는 가져갈 게 없는데도 실행됐고,
 * 그만큼이 국고에 **없던 돈으로 적립**됐다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clampTakeAmount } from "../../../functions/cashFloor.js";

describe("회수 금액 상한", () => {
  it("잔액보다 많이 요청하면 잔액만큼만", () => {
    expect(clampTakeAmount(120_000, 500_000)).toEqual({ amount: 120_000, clampedFrom: 500_000 });
  });

  it("잔액보다 적게 요청하면 그대로 — 자르지 않는다", () => {
    expect(clampTakeAmount(500_000, 120_000)).toEqual({ amount: 120_000, clampedFrom: 0 });
  });

  it("딱 맞으면 전액, 잘린 표시 없음", () => {
    expect(clampTakeAmount(300_000, 300_000)).toEqual({ amount: 300_000, clampedFrom: 0 });
  });

  it("⭐ 잔액이 0 이면 아무것도 못 가져간다", () => {
    expect(clampTakeAmount(0, 50_000_000).amount).toBe(0);
  });

  it("⭐ 이미 마이너스면 더 뚫지 않는다 — 사고의 두 번째 회수", () => {
    // 첫 회수로 0 이 된 뒤 같은 −50,000,000 이 한 번 더 들어온 상황.
    const second = clampTakeAmount(-49_724_000, 50_000_000);
    expect(second.amount).toBe(0);
    expect(second.clampedFrom).toBe(50_000_000); // 요청은 있었다는 사실이 남는다
  });

  it("⭐ 사고 재현 — 두 번 연속 회수해도 0 아래로 안 내려간다", () => {
    let cash = 276_000; // 회수 직전 잔액(가정)
    for (const _ of [1, 2]) {
      const { amount } = clampTakeAmount(cash, 50_000_000);
      cash -= amount; // 학생 차감
    }
    expect(cash).toBe(0);
    expect(cash).toBeGreaterThanOrEqual(0);
  });
});

describe("돈 보존", () => {
  it("⭐ 학생에게서 빠진 만큼만 국고에 들어간다", () => {
    // 차감·적립이 같은 값을 쓰는지가 이 함수의 존재 이유다.
    for (const [cash, want] of [[100, 50], [100, 100], [100, 1000], [0, 1000], [-5, 10]]) {
      const { amount } = clampTakeAmount(cash, want);
      const studentAfter = cash - amount;
      const treasuryGain = amount;
      expect(studentAfter + treasuryGain).toBe(cash); // 총량 불변
      expect(studentAfter).toBeGreaterThanOrEqual(Math.min(0, cash)); // 더 나빠지지 않는다
    }
  });

  it("⭐ 반환값은 절대 음수가 아니다 — 음수면 국고에서 돈이 빠진다", () => {
    for (const cash of [-1_000_000, -1, 0, 1, 1_000_000]) {
      expect(clampTakeAmount(cash, 999).amount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("망가진 입력", () => {
  it("NaN·undefined·음수 요청에도 0 을 넘겨주지 않는다", () => {
    expect(clampTakeAmount(NaN, 100).amount).toBe(0);
    expect(clampTakeAmount(100, NaN).amount).toBe(0);
    expect(clampTakeAmount(100, -50).amount).toBe(0);
    expect(clampTakeAmount(undefined, undefined).amount).toBe(0);
  });
});

describe("index.js 배선 — 순수 함수가 맞아도 배선이 틀리면 소용없다", () => {
  const INDEX = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
  // adminCashAction 트랜잭션 본문만 잘라 본다.
  const body = INDEX.slice(
    INDEX.indexOf("const needAdminCredit = action === \"take\""),
    INDEX.indexOf("markIdempotent(tx, keyRef);"),
  );

  it("⭐ 학생 차감과 국고 적립이 **같은 변수**를 쓴다", () => {
    expect(body).toContain("cash: increment(-baseAmount)");
    expect(body).toContain("cash: increment(baseAmount)");
    // 한쪽만 다른 값을 쓰면 돈이 생기거나 사라진다.
    expect(body).not.toMatch(/increment\(-\s*(?!baseAmount)\w+\)[^]{0,80}국고/);
  });

  it("⭐ 자르기가 두 increment 보다 **앞**에 있다", () => {
    const clamp = body.indexOf("clampTakeAmount(");
    const debit = body.indexOf("increment(-baseAmount)");
    const credit = body.indexOf("increment(baseAmount)");
    expect(clamp).toBeGreaterThan(-1);
    expect(clamp).toBeLessThan(debit);
    expect(clamp).toBeLessThan(credit);
  });

  it("⭐ 지급(send)은 자르기를 타지 않는다", () => {
    // 2026-08-28: 여기에 allowNegativeTake 조건이 붙었다(마이너스 회수 복원).
    //   단언이 보는 것은 여전히 **`=== "take"` 로 좁히지 않았다**는 것이다 —
    //   액션이 하나 늘면 `=== "take"` 는 바닥을 조용히 건너뛴다.
    expect(body).toContain('if (action !== "send"');
    expect(body).not.toContain('if (action === "take")');
  });

  it("⭐ 잔액이 없어 건너뛴 학생이 결과에서 사라지지 않는다", () => {
    expect(INDEX).toContain("skippedNoBalance");
    expect(INDEX).toContain("noBalanceCount");
  });

  it("⭐ 돈을 못 옮긴 회수 시도도 흔적을 남긴다", () => {
    // 2026-07-27 사고의 두 번째 −50,000,000 시도가 이 경로로 무흔적 소멸했다.
    expect(body).toContain("logNoMoveAttempt(");
    expect(INDEX).toContain("ADMIN_CASH_TAKE_SKIPPED");
    // 두 조기반환 **모두** 남겨야 한다(퍼센트 경로 · 자르기 후 0 경로).
    //   정의부는 `logNoMoveAttempt = (` 라 이 정규식에 안 걸린다 = 호출 2곳만 세어진다.
    expect((body.match(/logNoMoveAttempt\(/g) || []).length).toBe(2);
  });

  it("⭐ 그 기록이 학생 거래내역을 오염시키지 않는다", () => {
    // MyAssets 는 `amount !== 0` 인 것만 거래로 보여준다. 최상위 amount 를 넣으면
    // 돈이 안 움직였는데 거래 한 줄이 생긴다.
    const helper = INDEX.slice(
      INDEX.indexOf("const logNoMoveAttempt"),
      INDEX.indexOf("const rawCash = tData.cash;"),
    );
    expect(helper).not.toMatch(/^\s*amount:/m);
    expect(helper).toContain("moved: 0");
  });
});

describe("파산 사건은 합의금 경로에 못 들어온다", () => {
  const INDEX = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
  it("⭐ processCourtSettlement 이 caseType 을 검사한다", () => {
    // 헤더 주석이 아니라 **트랜잭션 본문**을 앵커로 잡는다(주석에도 courtsettle_ 이 있다).
    const start = INDEX.indexOf("이미 합의금 지급이 완료된 사건입니다.");
    const settle = INDEX.slice(start, start + 2500);
    expect(start).toBeGreaterThan(-1);
    expect(settle).toContain('cData.caseType === "bankruptcy"');
    // 잔액 이동보다 **앞**에서 막아야 한다.
    expect(settle.indexOf("bankruptcy")).toBeLessThan(settle.indexOf("increment"));
  });
});

/**
 * 🔴 2026-08-28 — 마이너스 회수를 **명시 플래그**로 되살렸다.
 *
 * 배경: 위 사고 때문에 0원 바닥이 생겼는데, 선생님은 벌칙으로 빚을 지우는 회수를 원한다.
 * 그때 남긴 지침이 "블록을 걷어내지 말고 호출부에서 명시 플래그를 받도록 넓힐 것"이었다 —
 * 사고와 의도를 가를 수 있어야 하기 때문이다. 그대로 했다.
 *
 * 지켜야 하는 것 셋:
 *   ① 플래그가 없으면 종전과 완전히 동일하다(회귀 0).
 *   ② 위임받은 학생은 이 플래그를 쓸 수 없다 — 남을 빚지게 하는 건 교사의 판단이다.
 *   ③ 화면 스위치는 한 번 쓰면 꺼진다 — 켠 채로 잊고 두 번 누른 것이 그 사고였다.
 */
describe("마이너스 회수는 명시 플래그로만", () => {
  const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
  const UI = readFileSync(resolve(process.cwd(), "src/pages/banking/MoneyTransfer.js"), "utf8");

  it("⭐ 서버가 플래그를 **관리자에게만** 인정한다", () => {
    expect(SRC).toMatch(
      /const allowNegativeTake =\s*\n\s*action !== "send" && allowNegative === true && isAdmin === true;/,
    );
  });

  it("⭐ 플래그가 켜졌을 때만 바닥을 건너뛴다", () => {
    expect(SRC).toMatch(/if \(action !== "send" && !allowNegativeTake\) \{/);
    // 바닥 자체는 남아 있어야 한다 — 걷어내면 기본 동작이 사고 시절로 돌아간다.
    expect(SRC).toMatch(/const capped = clampTakeAmount\(currentCash, baseAmount\);/);
  });

  // 🔴 2026-08-31 — 화면 스위치를 **기본 켜짐**으로 바꿨다(사용자 지시).
  //    벌칙·빚 회수가 이 학급의 일상이라 매번 켜는 편이 오히려 실수를 부른다는 판단이다.
  //    그래서 사고를 막는 무게가 전부 **확인창**으로 옮겨갔다 — 아래 단언이 그 자리를 지킨다.
  //    확인창을 지우면 2026-07-27 사고(같은 −50,000,000 회수를 28분 뒤 한 번 더)를
  //    막는 것이 하나도 남지 않는다.
  it("⭐ 화면 스위치는 기본 켜짐이고, 선생님이 끄면 그대로 있는다", () => {
    expect(UI).toMatch(/const \[allowNegative, setAllowNegative\] = useState\(true\);/);
    // 선생님이 끈 것을 화면이 되돌리지 않는다 — finally 에서 다시 켜거나 끄지 않는다.
    expect(UI).not.toMatch(/finally[^]{0,400}setAllowNegative\(/);
    // 체크는 사람이 바꾼다(onChange 는 남아 있어야 한다).
    expect(UI).toMatch(/onChange=\{\(e\) => setAllowNegative\(e\.target\.checked\)\}/);
    // 회수(take)에만 실어 보낸다 — 지급에 실리면 서버가 무시하더라도 의미가 흐려진다.
    expect(UI).toMatch(/allowNegative: action === "take" \? allowNegative === true : undefined,/);
  });

  it("⭐ 마이너스 회수는 **매번** 금액을 보여주고 확인을 받는다", () => {
    // 기본 켜짐이 된 뒤로 이것이 유일한 관문이다. 조건·확인창·조기반환 셋이 다 있어야 한다.
    expect(UI).toMatch(/if \(action === "take" && allowNegative\) \{/);
    const gate = UI.slice(
      UI.indexOf('if (action === "take" && allowNegative) {'),
      UI.indexOf("if (submittingRef.current) return;"),
    );
    expect(gate).toContain("await confirmDialog(");
    expect(gate).toMatch(/마이너스/); // 결과가 빚이라는 걸 글자로 말한다
    // 🔴 "금액을 보여준다"는 단언은 **값이 실제로 끼워지는지**를 봐야 한다(codex 2R 지적).
    //    `percentage` 라는 낱말이 그 구간에 있기만 해도 통과하면 확인창이 빈 문장이어도 초록불이다.
    expect(gate).toMatch(/\$\{Number\(inputValue\)\.toLocaleString\(\)\}/); // 고정 금액
    expect(gate).toMatch(/현재 잔액의 \$\{inputValue\}%/); // 퍼센트
    expect(gate).toMatch(/\$\{대상\}명/); // 몇 명한테서 가져가는지
    expect(gate).toMatch(/if \(!ok\) return;/); // 취소하면 아무 일도 안 일어난다
  });
});

/**
 * 🔴 2026-08-28 — 음수 이율 대출이 **상환을 영구 차단**하던 것을 고쳤다.
 *
 * 라이브: 상품표 오타로 `rate: -0.05` 대출(2천만)이 생겼고, 상환 쪽이 `rate < 0` 을
 * 예외로 던져 학생이 5일간 15회 시도해 전부 막혔다(로그 실측).
 * 막아야 할 것은 "이자가 음수인 것"이지 "상환"이 아니다.
 */
describe("음수 이율이 상환을 막지 않는다", () => {
  const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");

  it("⭐ rate<0 을 던지지 않고 0 으로 본다", () => {
    expect(SRC, "rate<0 을 여전히 던진다").not.toMatch(/rate < 0 \|\| !Number\.isFinite\(termInDays\)/);
    expect(SRC).toMatch(/const safeRate = Math\.max\(0, rate\);/);
  });

  it("⭐ 기간도 같이 바닥을 건다 (국고 수령액 ≥ 원금)", () => {
    // 이율만 자르면 termInDays 음수로 복리계수<1 이 되어 원금보다 적게 받는다.
    expect(SRC).toMatch(/const safeTermInDays = Math\.max\(0, termInDays\);/);
    expect(SRC).toMatch(/calcCompoundInterest\(balance, safeRate, safeTermInDays\)/);
  });

  it("⭐ 만드는 쪽은 **거절**한다 — 조용히 0 으로 자르지 않는다", () => {
    // 자르면 잘못된 상품이 "0% 대출"로 굴러가고 카탈로그의 -0.05 는 그대로 남아
    // 다음 학생도 같은 길을 간다(grok 레인 지적). 만드는 곳은 막고, 갚는 곳은 연다.
    expect(SRC).toMatch(/if \(rawDailyRate < 0 \|\| rawDailyRate > MAX_DAILY_RATE\) \{/);
    expect(SRC).toMatch(/이 상품의 이율 설정이 잘못되었습니다/);
  });
});

/**
 * 🔴 2026-08-28 — 기록이 남아도 **거래내역에서 걸러지던** 문제.
 *
 * 「나의 자산」거래내역은 세 원장을 합치며 `amount !== 0 || couponAmount !== 0` 으로 거른다.
 * 그런데 logActivity 는 금액을 metadata 안에만 넣어 최상위 값이 늘 0 이었다.
 * 게다가 호출부 7곳이 await 를 빠뜨려 트랜잭션 커밋 뒤에 쓰려다 30일간 28건이 통째로 유실됐다
 * ("Cannot modify a WriteBatch that has been committed" — 서버로그 실측).
 */
describe("활동 기록이 거래내역까지 도달한다", () => {
  const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
  const UTIL = readFileSync(resolve(process.cwd(), "functions/utils.js"), "utf8");

  it("⭐ logActivity 호출에 await 가 빠진 곳이 없다", () => {
    const bare = SRC.split("\n").filter(
      (l) => /(^|[^.\w])logActivity\(/.test(l) && !/await logActivity\(/.test(l),
    );
    expect(bare, `await 없는 호출: ${bare.join(" | ")}`).toHaveLength(0);
  });

  it("⭐ 최상위 금액 필드를 쓴다 (없으면 화면이 걸러낸다)", () => {
    expect(UTIL).toMatch(/amount: toNum\(ledger\.amount\)/);
    expect(UTIL).toMatch(/couponAmount: toNum\(ledger\.couponAmount\)/);
  });

  it("⭐ 조회 실패가 기록 자체를 없애지 않는다", () => {
    // 종전엔 이름/학급 조회와 기록 쓰기가 한 try 안이라, 읽기가 실패하면 원장까지 비었다.
    const i = UTIL.indexOf("const logActivity");
    const body = UTIL.slice(i, i + 2000);
    expect(body).toMatch(/let userName = "알 수 없는 사용자";/);
    expect(body).toMatch(/logActivity 조회 실패/);
  });

  it("⭐ 쿠폰 3종이 금액을 실어 보낸다", () => {
    expect(SRC).toMatch(/\{ amount: cashGained, couponAmount: -amount \},/); // 판매
    expect(SRC).toMatch(/\{ couponAmount: amount \},/);                      // 선물 수신
  });
});
