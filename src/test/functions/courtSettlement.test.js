/**
 * 법정 합의금이 **돈을 못 만들고, 두 번 못 나가고, 위조된 사건으로 못 새게** 지킨다.
 *
 * 2026-08-20 실측으로 확인한 두 결함:
 *
 * 1) 위조 사건 드레인 — `processCourtSettlement` 은 고소장의 `defendantId`·`status` 를 믿는데
 *    그 둘은 규칙상 잠겨 있지 않고, 잠글 수도 없다(피고 지정은 고소장의 본질이고, status
 *    전이는 전부 클라가 쓴다). 학생이 부자 학생을 피고로 정상 고소장을 낸 뒤 status 만
 *    resolved 로 밀어넣으면 재판이 열린 적 없는 사건이 '판결 완료'로 보인다.
 *    → 이 경로를 **교사 전용**으로 좁혔다. 판사의 배상 집행은 `processTrialSettlement`
 *      (당사자를 재판방 문서에서만 파생, 그 필드는 규칙상 불변)이 담당한다.
 *
 * 2) 이중지급 — `processTrialSettlement` 은 완료 마커를 **재판방에만** 남기는데 판결 직후
 *    TrialRoom.js 가 방을 통째로 지운다. 그러면 고소장이 `resolved` + `settlementPaid:false`
 *    로 남아 "합의금 지급" 버튼이 다시 뜬다. 멱등키도 서로 다르다
 *    (`trialsettle_{roomId}` vs `courtsettle_{complaintId}`)라 원장 차원에서도 안 막혔다.
 *    → 지급 시 고소장에도 같은 마커를 남긴다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");

const sliceFn = (name) => {
  const start = SRC.indexOf(`exports.${name} = onCall(`);
  expect(start, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
  const next = SRC.indexOf("\nexports.", start + 10);
  return SRC.slice(start, next === -1 ? SRC.length : next);
};
// 주석은 걷어내고 코드만 본다(설명 주석이 스스로 걸리지 않도록).
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const COURT = sliceFn("processCourtSettlement");
const COURT_CODE = codeOnly(COURT);
const TRIAL = sliceFn("processTrialSettlement");
const TRIAL_CODE = codeOnly(TRIAL);

describe("합의금 지급 모달(processCourtSettlement) — 교사 전용", () => {
  it("⭐ 비교사는 진입 자체가 막힌다", () => {
    expect(COURT_CODE).toMatch(/if\s*\(!isTeacher\)\s*\{\s*throw new HttpsError\(\s*"permission-denied"/);
  });

  it("⭐ 판사 직업으로 권한을 얻던 경로가 남아 있지 않다", () => {
    // hasJobTitle(..., "판사") 가 이 함수에 다시 생기면 드레인 경로가 되살아난다.
    expect(COURT_CODE).not.toContain('"판사"');
    expect(COURT_CODE).not.toContain("hasJobTitle");
  });

  it("⭐ 권한 검사가 트랜잭션(=돈 이동)보다 먼저다", () => {
    expect(COURT_CODE.indexOf("if (!isTeacher)")).toBeLessThan(
      COURT_CODE.indexOf("runTransaction"),
    );
  });

  it("⭐ 자기거래 차단은 그대로 남아 있다", () => {
    // 교사 전용이 됐어도 교사가 스스로 당사자가 되는 건 계속 막는다.
    expect(COURT_CODE).toContain("uid === senderId || uid === recipientId");
  });

  it("⭐ 파산 사건은 여전히 합의금 경로에 못 들어온다", () => {
    expect(COURT_CODE).toContain('cData.caseType === "bankruptcy"');
  });
});

describe("재판 합의금(processTrialSettlement) — 이중지급 차단", () => {
  it("⭐ 지급 시 고소장에도 완료 마커를 남긴다", () => {
    expect(TRIAL_CODE).toContain("complaintRef");
    expect(TRIAL_CODE).toMatch(/transaction\.update\(complaintRef,\s*\{\s*settlementPaid: true/);
  });

  it("⭐ 고소장은 방의 caseId 로 찾는다(클라 입력이 아니라)", () => {
    expect(TRIAL_CODE).toContain("room.caseId");
    // 경로 주입 방지 — caseId 에 "/" 가 있으면 안 쓴다.
    expect(TRIAL_CODE).toContain('room.caseId.includes("/")');
  });

  it("⭐ 고소장 읽기가 모든 쓰기보다 먼저다(Firestore 트랜잭션 제약)", () => {
    const read = TRIAL_CODE.indexOf("transaction.getAll(");
    const firstWrite = TRIAL_CODE.indexOf("transaction.update(senderRef");
    expect(read).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(-1);
    expect(read).toBeLessThan(firstWrite);
  });

  it("⭐ 고소장이 없는 재판(caseId 없음)이어도 지급은 계속된다", () => {
    // caseId 가 없다고 배상이 막히면 안 된다 — 마커만 못 남길 뿐이다.
    expect(TRIAL_CODE).toMatch(/if\s*\(complaintRef && complaintDoc && complaintDoc\.exists\)/);
  });

  it("⭐ 고소장 없는 재판방으로는 비교사가 돈을 못 옮긴다", () => {
    // 규칙은 방 생성 시 judgeId==self 만 강제하고 당사자는 무검증이다 —
    // 임명된 판사가 사건 없이 방을 만들어 남의 현금을 옮기던 경로를 막는다.
    expect(TRIAL_CODE).toMatch(/if\s*\(!complaintDoc \|\| !complaintDoc\.exists\)/);
  });

  it("⭐ 당사자를 실제 고소장과 대조한다", () => {
    expect(TRIAL_CODE).toContain("recipientId !== cData.complainantId");
    expect(TRIAL_CODE).toContain("senderId !== cData.defendantId");
  });

  it("⭐ 대조가 돈이 움직이기 전에 일어난다", () => {
    expect(TRIAL_CODE.indexOf("recipientId !== cData.complainantId")).toBeLessThan(
      TRIAL_CODE.indexOf("transaction.update(senderRef"),
    );
  });

  it("⭐ 교사는 대조에서 면제된다 — 대조 블록이 !isTeacher 로 열린다", () => {
    // ⚠️ `lastIndexOf("if (!isTeacher)")` 로 "앞 어딘가에 있나"만 보면, 그 게이트를
    //    `if (false)` 로 바꿔도 함수 내 다른 곳의 같은 문자열이 걸려 통과한다
    //    (실제로 변이 테스트에서 이걸 놓쳤다). 블록이 **붙어 있는지**를 본다.
    expect(TRIAL_CODE).toMatch(
      /if \(!isTeacher\) \{\s*if \(!complaintDoc \|\| !complaintDoc\.exists\)/,
    );
  });

  it("⭐ 방에 남기던 기존 마커도 유지된다", () => {
    // 방이 살아남는 경우(삭제 실패)의 24h TTL 우회를 막던 장치.
    expect(TRIAL_CODE).toMatch(/transaction\.update\(roomRef,\s*\{\s*settlementPaid: true/);
  });
});

describe("클라이언트 — 못 누를 버튼을 남기지 않는다", () => {
  const CLIENT = readFileSync(
    resolve(process.cwd(), "src/pages/government/Court.js"),
    "utf8",
  );
  const CLIENT_CODE = codeOnly(CLIENT);

  it("⭐ 합의금 모달 게이트가 `isAdmin` 을 본다", () => {
    // ⚠️ `hasAdminPrivileges` 는 이름과 달리 `hasJudgePrivileges` 의 별칭이라
    //    그걸 쓰면 판사가 그대로 통과한다(실제로 한 번 그렇게 썼다가 잡았다).
    const start = CLIENT_CODE.indexOf("const handleOpenSettlementModal");
    expect(start).toBeGreaterThan(-1);
    const gate = CLIENT_CODE.slice(start, start + 400);
    expect(gate).toContain("if (!isAdmin)");
    expect(gate).not.toContain("hasAdminPrivileges");
    expect(gate).not.toContain("hasJudgePrivileges");
  });

  it("⭐ 그 별칭이 여전히 별칭임을 확인한다(정의가 바뀌면 이 테스트가 알려준다)", () => {
    expect(CLIENT_CODE).toContain("const hasAdminPrivileges = hasJudgePrivileges;");
  });

  it("⭐ 지급 버튼은 canSettle 일 때만 그린다", () => {
    expect(CLIENT_CODE).toContain("canSettle={isAdmin}");
    expect(CLIENT_CODE).toContain(") : canSettle ? (");
  });
});
