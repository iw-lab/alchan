/**
 * 파산 처리(2026-11-20) — 셈과 안전장치.
 * 규칙: 현금·파킹·예적금·주식·부동산을 모두 거두고 빚을 지워 0에서 다시. 쿠폰은 남긴다. 선생님만.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const { netAssetsOf, bankruptcyEligibility, MAX_DOCS } = require(resolve(process.cwd(), "functions/bankruptcyMath.js"));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const SVC = strip(readFileSync(resolve(process.cwd(), "functions/bankruptcyService.js"), "utf8"));
const INDEX = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
const COURT = strip(readFileSync(resolve(process.cwd(), "src/pages/government/Court.js"), "utf8"));

describe("순자산 셈 — 화면·세금과 같은 식", () => {
  it("운영 실측과 같은 값이 나온다(현금 -13,433,600 · 주식 5,023,335 → -8,410,265)", () => {
    const r = netAssetsOf({ cash: -13433600, coupons: 0, couponValue: 1000, parking: 0, products: [], portfolio: [{ id: "7", quantity: 5 }], properties: [], stockMap: { 7: 1004667 } });
    expect(r.net).toBe(-8410265);
  });
  it("대출은 빼고, 예적금·파킹·부동산·쿠폰은 더한다", () => {
    const r = netAssetsOf({
      cash: -100, coupons: 2, couponValue: 1000, parking: 50,
      products: [{ type: "deposit", balance: 300 }, { type: "savings", balance: 200 }, { type: "loan", remainingPrincipal: 5000, balance: 9999 }, { type: "bonus", balance: 777 }],
      portfolio: [{ id: "1", stockId: 3, quantity: 2 }, { id: "9", quantity: 0 }], properties: [{ price: 1000 }, { value: 400 }], stockMap: { 3: 10 },
    });
    expect(r).toMatchObject({ couponTotal: 2000, depositSavings: 500, loans: 5000, stocks: 20, realEstate: 1400 });
    expect(r.net).toBe(-100 + 2000 + 50 + 500 + 20 + 1400 - 5000);
  });
  it("⭐ 순자산이 0 이상이면 파산 대상이 아니다(현금만 마이너스인 부자는 거절)", () => {
    const rich = netAssetsOf({ cash: -7287671, parking: 359785385, couponValue: 1000 });
    expect(bankruptcyEligibility(-7287671, rich).ok).toBe(false);
    expect(bankruptcyEligibility(0, netAssetsOf({ cash: 0 })).ok).toBe(false);
    expect(bankruptcyEligibility(-1, netAssetsOf({ cash: -1 })).ok).toBe(true);
  });
  it("⭐ 숫자가 아닌 잔액은 손대지 않는다", () => {
    expect(bankruptcyEligibility("-500", netAssetsOf({ cash: "-500" })).ok).toBe(false);
    expect(bankruptcyEligibility(NaN, { net: -1 }).ok).toBe(false);
  });
  it("문서 상한은 한 트랜잭션(500) 아래다", () => expect(MAX_DOCS).toBeLessThan(450));
  it("⭐ 다 갚은 대출(남은 원금 0)은 빚이 아니다 — balance 로 넘어가 순자산을 깎지 않는다(8way grok)", () => {
    expect(netAssetsOf({ cash: 100, products: [{ type: "loan", remainingPrincipal: 0, balance: 5000 }] }).net).toBe(100);
    expect(netAssetsOf({ cash: 100, products: [{ type: "loan", balance: 5000 }] }).net).toBe(-4900);
  });
});

describe("서버 안전장치(배선)", () => {
  const proc = SVC.slice(SVC.indexOf("exports.processBankruptcy"), SVC.indexOf("exports.undoBankruptcy"));
  const undo = SVC.slice(SVC.indexOf("exports.undoBankruptcy"));

  it("index.js 가 두 함수를 내보낸다", () => {
    expect(INDEX).toMatch(/exports\.processBankruptcy = require\("\.\/bankruptcyService"\)\.processBankruptcy/);
    expect(INDEX).toMatch(/exports\.undoBankruptcy = require\("\.\/bankruptcyService"\)\.undoBankruptcy/);
  });
  it("⭐ 둘 다 선생님만 — 권한 검사가 어떤 읽기·쓰기보다 앞이다", () => {
    for (const body of [proc, undo]) {
      const guard = body.indexOf("if (!hasAdminPower(userData)) throw new HttpsError(\"permission-denied\"");
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(body.indexOf("db."));
    }
  });
  it("⭐ 대상은 사건 문서의 complainantId 뿐 — 요청이 학생 id 를 정하지 못한다", () => {
    expect(proc).toMatch(/const studentId = c\.complainantId;/);
    expect(SVC).not.toMatch(/request\.data\.(userId|studentId|targetUserId)/);
  });
  it("⭐ 파산 사건만 · 한 번만 · 같은 학급 학생만 · 교사 계정 제외 · 순자산 재판정", () => {
    expect(proc).toMatch(/c\.caseType !== "bankruptcy"/);
    expect(proc).toMatch(/if \(c\.bankruptcyProcessedAt\) throw new HttpsError\("already-exists"/);
    expect(proc).toMatch(/u\.classCode !== classCode/);
    expect(proc).toMatch(/u\.isAdmin \|\| u\.isSuperAdmin \|\| u\.isTeacher/);
    expect(proc).toMatch(/if \(!eligible\.ok\) throw new HttpsError\("failed-precondition"/);
  });
  it("⭐ 읽기·판정·쓰기가 한 트랜잭션이고, 원본 저장이 지우기보다 먼저다", () => {
    const tx = proc.slice(proc.indexOf("db.runTransaction"));
    expect(tx.indexOf("tx.set(recordRef")).toBeGreaterThan(tx.indexOf("if (!eligible.ok)"));
    expect(tx.indexOf("tx.set(recordRef")).toBeLessThan(tx.indexOf("tx.update(userRef, { cash: 0"));
    expect(tx).toMatch(/tx\.delete\(d\.ref\)/);
    expect(tx).toMatch(/bankruptcyProcessedAt: serverTimestamp\(\)/);
  });
  it("⭐ 부동산은 owner 로만 압류한다 — 옛 ownerId 흔적으로 남의 집을 거두지 않는다(8way codex·grok CRITICAL)", () => {
    expect(SVC).toMatch(/tx\.get\(col\.where\("owner", "==", userId\)\)/);
    expect(SVC).not.toMatch(/where\("ownerId"/);
  });
  it("⭐ 시세·쿠폰 가치를 같은 트랜잭션에서 읽는다(밖에서 읽은 옛 시세로 자산을 지우지 않는다)", () => {
    const tx = proc.slice(proc.indexOf("db.runTransaction"));
    expect(tx).toMatch(/tx\.get\(db\.collection\("Settings"\)\.doc\("centralStocksCache"\)\)/);
    expect(tx).toMatch(/tx\.get\(classCouponRef\(db, classCode\)\)/);
    expect(proc.slice(0, proc.indexOf("db.runTransaction"))).not.toMatch(/centralStocksCache|couponValueFrom/);
  });
  it("⭐ 되돌린 사건은 again 없이는 다시 처리되지 않는다(늦게 온 옛 요청) · 압류 표식이 같을 때만 집을 돌려준다", () => {
    expect(proc).toMatch(/if \(c\.bankruptcyUndoneAt && !again\) throw new HttpsError\("failed-precondition"/);
    expect(proc).toMatch(/seizedByBankruptcy: complaintId/);
    expect(undo).toMatch(/cur\.seizedByBankruptcy !== complaintId/);
    expect(undo).toMatch(/status: cb\.status \|\| "pending"/);
  });
  it("⭐ 쿠폰은 건드리지 않고, 국고(교사 현금)도 늘리지 않는다", () => {
    // 쿠폰은 순자산 «판정»에만 읽는다 — 쓰는 줄(tx.update/tx.set) 어디에도 없어야 한다.
    for (const m of SVC.matchAll(/tx\.(?:update|set)\([\s\S]*?\);\n/g)) expect(m[0]).not.toMatch(/coupons/);
    expect(SVC).not.toMatch(/findApprovedAdminSnap|nationalTreasuries/);
  });
  it("⭐ 되돌리기는 한 번만, 더하기로(그 뒤 번 돈을 덮지 않는다), 남이 산 부동산은 안 뺏는다", () => {
    expect(undo).toMatch(/if \(rec\.undoneAt\) throw new HttpsError\("already-exists"/);
    expect(undo).toMatch(/cash: increment\(cashBack\)/);
    expect(undo).not.toMatch(/cash: cashBack\b/);
    expect(undo).toMatch(/cur\.owner !== "government"/);
    expect(undo).toMatch(/if \(productDocs\[i\]\.exists\) skipped\.push/);
    // 그 뒤 같은 종목을 다시 샀으면 합친다(건너뛰면 거둔 주식이 사라진다)
    expect(undo).toMatch(/quantity: q0 \+ q1, averagePrice:/);
  });
});

describe("화면 — 처리 버튼은 선생님에게만", () => {
  it("파산 탭은 교사면 처리 화면, 학생이면 신청 화면", () => {
    expect(COURT).toMatch(/return isAdmin \? \(\s*<BankruptcyTeacherPanel/);
    const student = COURT.slice(COURT.indexOf("const BankruptcySection"), COURT.indexOf("bankruptcy-tab-button"));
    expect(student.slice(0, student.indexOf("const Court"))).not.toContain("processBankruptcy");
  });
  it("처리·되돌리기 모두 확인창을 거친다", () => {
    const panel = COURT.slice(COURT.indexOf("const BankruptcyTeacherPanel"), COURT.indexOf("const BankruptcySection"));
    expect(panel.indexOf("await confirmDialog(")).toBeLessThan(panel.indexOf('httpsCallable(functions, "processBankruptcy")'));
    expect(panel).toContain('httpsCallable(functions, "undoBankruptcy")');
    expect(panel).toMatch(/if \(!ok \|\| busyId\) return;/);
  });
});
