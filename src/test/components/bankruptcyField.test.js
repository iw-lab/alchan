/**
 * 파산 신청이 **무엇으로 자격을 판정하는가**를 지킨다.
 *
 * 2026-08-20 (1차) 실측: 이 화면은 `userDoc.money` 를 읽고 있었는데, 그 필드를 가진 사용자가
 * 전체 45명 중 슈퍼관리자 1명뿐이었다. `undefined < 0` 이 false 라 **신청 버튼이 누구에게도
 * 뜨지 않았고**, 화면엔 늘 "현재 자산: 0원"만 찍혔다. 실제 잔액 필드는 `cash` 다.
 *
 * 2026-08-20 (2차) 판정 기준을 현금 → **순자산**으로 옮겼다. 앱의 다른 곳
 * (FinancialRestrictionBanner)이 이미 순자산으로 이용을 제한하고 있어서, 현금 기준이면
 * "제한은 걸렸는데 파산 신청은 못 하는" 막다른 골목이 생긴다.
 *
 * 이 앱은 "휴면 필드를 나중에 배선하다 사고"를 두 번 기록했다 — 그래서 기준을 테스트로 박는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const COURT = readFileSync(resolve(process.cwd(), "src/pages/government/Court.js"), "utf8");
// 파산 영역만 잘라 본다(파일 전체엔 다른 화면도 들어 있다).
const raw = COURT.slice(
  COURT.indexOf("const handleApplyForBankruptcy"),
  COURT.indexOf("bankruptcy-tab-button"),
);
// ⚠️ 주석은 걷어내고 **코드만** 본다. 안 그러면 "예전엔 userDoc.money 를 읽었다" 같은
//    설명 주석이 스스로 걸려서, 고쳐 놓고도 빨간불이 뜬다(실제로 한 번 걸렸다).
const section = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// 순자산 로딩 effect 는 잘라낸 구간 **앞**에 있으므로 따로 본다.
const COMPONENT = COURT.slice(
  COURT.indexOf("const BankruptcySection"),
  COURT.indexOf("bankruptcy-tab-button"),
);

describe("파산 신청 자격 판정", () => {
  it("⭐ 죽은 `money` 필드를 다시 읽지 않는다", () => {
    // `userDoc["money"]`·구조분해·별칭까지 잡으려면 이름 자체를 금지하는 게 낫다(codex 지적).
    expect(section).not.toMatch(/\bmoney\b/);
  });

  it("⭐ 현금이 아니라 순자산으로 판정한다", () => {
    // 현금 기준으로 되돌아가면(회귀) 여기서 걸린다.
    expect(section).not.toContain("(userDoc?.cash ?? 0) < 0");
    expect(section).toContain("netAssets !== null && netAssets < 0");
  });

  it("⭐ 순자산은 공유 캐시를 쓰는 기성 API 로 구한다", () => {
    // 자체 계산을 새로 짜면 FinancialRestrictionBanner 와 기준이 갈린다(그게 원래 문제였다).
    expect(COURT).toContain('import { getNetAssetsDetail } from "../../utils/netAssets"');
    expect(COMPONENT).toContain("await getNetAssetsDetail(");
  });

  it("⭐ 순자산 로딩을 pending-case 조회와 **합치지 않는다**", () => {
    // 합치면 cash churn 마다 courtComplaints 3중조건 쿼리가 재실행된다(이미 한 번 고친 읽기 폭주).
    // pending-case effect 는 deps 가 [myUid, classCode] 로 좁혀져 있어야 한다.
    expect(COMPONENT).toContain("}, [myUid, classCode]);");
    // 순자산 effect 는 반대로 cash·coupons 에 반응해야 한다.
    expect(COMPONENT).toContain("}, [myUid, classCode, userDoc?.cash, userDoc?.coupons]);");
  });

  it("⭐ 순자산 계산에 실패하면 자격을 열어주지 않는다", () => {
    // null 이면 `netAssets < 0` 이 false → 버튼이 안 뜬다. 기준이 조용히 현금으로
    // 되돌아가는 것보다 안 뜨는 편이 낫다.
    expect(COMPONENT).toContain("setNetAssets(null)");
  });

  it("⭐ 잔액이 없어도 터지지 않는다 — 보호 없는 toLocaleString 금지", () => {
    // 종전 `userDoc.money.toLocaleString()` 은 필드가 없으면 TypeError 였다.
    const unguarded = section.match(/userDoc\.\w+\.toLocaleString\(\)/g) || [];
    expect(unguarded).toEqual([]);
  });

  it("⭐ 신청 사유에도 같은 기준을 쓴다 — 화면과 기록이 어긋나지 않게", () => {
    expect(section).toContain("순자산 ${(netAssets ?? 0).toLocaleString()}");
  });
});
