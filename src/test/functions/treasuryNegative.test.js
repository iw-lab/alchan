/**
 * 국고(=승인 관리자 cash)는 **모든 기능에서 마이너스 허용** (2026-11-03 사용자 결정).
 *
 * 실측: BG6QUC 11-02 13시 «세금 환급의 날»이 국고 −1.28억이라 21명 전원 0원 — «국고의 30%» 가
 * 0 이하라 통째로 건너뛰었다. 뽑기 상금(transferCash, 보내는 사람 = 교사)도 국고가 마이너스면
 * «보유 현금이 부족합니다»로 학생에게 안 갔다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const { refundPerStudentFor, DEFAULT_REFUND_PER_STUDENT } = require(
  resolve(process.cwd(), "functions/taxRefundMath.js"),
);
const EVENTS = readFileSync(resolve(process.cwd(), "functions/economicEvents.js"), "utf8");
const INDEX = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
const MYASSETS = readFileSync(resolve(process.cwd(), "src/pages/my-assets/MyAssets.js"), "utf8");

const fnBody = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
const REFUND = fnBody(EVENTS, "async function executeTaxRefund", "async function executeTaxExtra");
const TRANSFER = fnBody(INDEX, "exports.transferCash", "exports.processFine");

describe("세금 환급 — 국고가 마이너스여도 나간다", () => {
  it("⭐ 국고 −1.28억이면 직전 환급 1인당액을 그대로 준다", () => {
    const r = refundPerStudentFor({ treasuryAmount: -128477831, refundRate: 0.3, studentCount: 21, lastPerStudent: 7361839 });
    expect(r).toEqual({ perStudent: 7361839, basis: "last" });
  });
  it("국고 0 + 이력 없음 → 기본액", () => {
    const r = refundPerStudentFor({ treasuryAmount: 0, refundRate: 0.3, studentCount: 21, lastPerStudent: null });
    expect(r).toEqual({ perStudent: DEFAULT_REFUND_PER_STUDENT, basis: "default" });
  });
  it("국고가 플러스면 종전대로 국고 × 30% ÷ 인원", () => {
    const r = refundPerStudentFor({ treasuryAmount: 515328730, refundRate: 0.3, studentCount: 21, lastPerStudent: 1 });
    expect(r).toEqual({ perStudent: Math.floor(Math.floor(515328730 * 0.3) / 21), basis: "treasury" });
  });
  it("국고가 아주 조금 플러스라 비례액이 0원이면 직전 환급액 (기본액으로 새지 않는다)", () => {
    const r = refundPerStudentFor({ treasuryAmount: 1, refundRate: 0.3, studentCount: 21, lastPerStudent: 4454614 });
    expect(r).toEqual({ perStudent: 4454614, basis: "last" });
    expect(REFUND).toMatch(/proportional > 0 \? null : await lastRefundPerStudent/);
  });
  it("학생이 없으면 0", () => {
    expect(refundPerStudentFor({ treasuryAmount: -5, refundRate: 0.3, studentCount: 0 }).perStudent).toBe(0);
  });
  it("⭐ executeTaxRefund 에 «국고 ≤ 0 이면 건너뜀» 이 없다", () => {
    expect(REFUND).not.toMatch(/treasuryAmount\s*<=\s*0\s*\)\s*\{/);
    expect(REFUND).not.toContain("환급 불가");
    expect(REFUND).toContain("refundPerStudentFor(");
  });
  it("지급만큼 같은 배치에서 국고가 빠진다 (돈이 새로 생기지 않는다)", () => {
    expect(REFUND).toContain("cash: admin.firestore.FieldValue.increment(-chunkPaid)");
  });
});

describe("국고(교사) 송금 — 잔액이 모자라도 학생에게 간다", () => {
  it("⭐ transferCash: 승인 관리자 보낸이는 잔액 검사를 건너뛴다", () => {
    expect(TRANSFER).toMatch(/senderIsTreasury\s*=\s*\n?\s*senderData\.isAdmin === true && hasAdminPower\(senderData\)/);
    expect(TRANSFER).toMatch(/!senderIsTreasury && senderCash < amount/);
  });
  it("학생 송금은 종전대로 잔액 한도", () => {
    expect(TRANSFER).toContain('throw new Error("보유 현금이 부족합니다.")');
  });
  it("⭐ 내 자산 화면도 국고는 사전 차단하지 않는다", () => {
    expect(MYASSETS).toMatch(/!isTreasury && \(Number\(userDoc\.cash\) \|\| 0\) < amount/);
    // 서버 hasAdminPower 와 같은 기준(승인 또는 슈퍼관리자)
    expect(MYASSETS).toMatch(/userDoc\.isApproved === true \|\| userDoc\.isSuperAdmin === true/);
  });
});
