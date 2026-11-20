/**
 * 대통령·위임 학생의 «가져오기» 화면은 **서버가 실제로 하는 일**만 말해야 한다.
 *
 * 2026-11-20 실측(운영 기록): 대통령이 가져오기를 4번 눌렀고 4번 모두 서버가 건너뛰었다
 * (대상 학생 잔액이 마이너스 — 0원 바닥). 그런데 화면은
 *   · «나에게 가져오기 — 내 계좌로 가져옵니다» (실제로는 국고=선생님 계좌로 간다)
 *   · «마이너스 허용» 체크 칸 (서버는 진짜 관리자일 때만 받는다 — functions/index.js allowNegativeTake)
 *   · 결과 «0명에게 … 가져오기 완료!» 를 3초
 * 를 보여 줬다. 학생은 된 줄 알았고 선생님은 «가져오기가 잘 안 된다»는 말만 들었다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const MONEY = strip(readFileSync(resolve(process.cwd(), "src/pages/banking/MoneyTransfer.js"), "utf8"));
const COUPON = strip(readFileSync(resolve(process.cwd(), "src/pages/banking/CouponTransfer.js"), "utf8"));
const SERVER = strip(readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8"));

describe("대통령·위임 학생의 가져오기 화면", () => {
  it("전제: 서버는 마이너스 회수를 진짜 관리자에게만 열어 둔다", () => {
    // 이 전제가 바뀌면(대통령에게도 열면) 아래 화면 규칙도 함께 바꿔야 한다.
    expect(SERVER).toMatch(/allowNegativeTake\s*=\s*action !== "send" && allowNegative === true && isAdmin === true/);
  });

  it("⭐ 가져온 돈이 가는 곳을 «내 계좌»라고만 말하지 않는다", () => {
    expect(MONEY).toMatch(/isDelegated \? "💰 국고로 가져오기" : "💰 나에게 가져오기"/);
    expect(MONEY).toContain("내 계좌로는 들어오지 않아요");
    expect(COUPON).toMatch(/isDelegated \? `국고\(/);
  });

  it("⭐ 서버가 무시할 «마이너스 허용»을 대통령에게 보여 주지도 보내지도 않는다", () => {
    expect(MONEY).toMatch(/\{isDelegated \? \([\s\S]{0,400}take-floor-note/);
    expect(MONEY).toContain('action === "take" && allowNegative && !isDelegated');
    expect(MONEY).toContain('allowNegative: action === "take" && !isDelegated ?');
  });

  it("⭐ 한 푼도 못 가져왔으면 «완료!»가 아니라 까닭을 말한다", () => {
    expect(MONEY).toMatch(/movedNothing = action === "take" && !\(count > 0\) && failCount === 0/);
    expect(MONEY).toMatch(/if \(movedNothing\) \{\s*setError\(/);
    expect(MONEY).toContain("가져온 돈이 없습니다");
  });
});
