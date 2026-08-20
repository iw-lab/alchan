/**
 * 직업 신청 승인제가 **돈이 새지 않게** 지킨다.
 *
 * 직업 개수가 주급을 정한다(세전 = 200만 + (직업수−1)×50만). 그래서 "직업이 붙는 경로"는
 * 곧 돈이 늘어나는 경로다. 지금까지 학생이 고르면 `saveSelectedJobs` 가 즉시 저장했고
 * 선생님 승인 단계가 없었다.
 *
 * 가장 미끄러운 자리는 **상한 계산**이다. 대기 중인 신청을 빼고 세면
 * "승인 전에 계속 신청" 으로 상한을 무한히 우회할 수 있다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = readFileSync(resolve(process.cwd(), "functions/index.js"), "utf8");
const RULES = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

const sliceFn = (name) => {
  const start = SRC.indexOf(`exports.${name} = onCall(`);
  expect(start, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
  const next = SRC.indexOf("\nexports.", start + 10);
  return SRC.slice(start, next === -1 ? SRC.length : next);
};
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SAVE = codeOnly(sliceFn("saveSelectedJobs"));
const PROCESS = codeOnly(sliceFn("processJobApplication"));

describe("직업 신청 — 저장 경로(saveSelectedJobs)", () => {
  it("⭐ 승인제가 꺼진 학급은 기존 경로를 그대로 탄다", () => {
    // 스위치는 명시적으로 true 일 때만 켜진다(문서·필드 없으면 꺼짐).
    expect(SAVE).toContain("salarySettingsDoc.data().jobApprovalRequired === true");
    // 꺼진 경우의 즉시 저장 경로가 남아 있어야 한다.
    expect(SAVE).toMatch(/selectedJobIds: validSelected/);
  });

  it("⭐ 상한을 '유지 + 대기중 + 신규신청' 합으로 센다", () => {
    // 대기 중인 걸 빼고 세면 승인 전에 계속 신청해 상한을 무한 우회할 수 있다.
    expect(SAVE).toContain(
      "const projected = kept.length + pendingJobIds.size + toApply.length",
    );
    expect(SAVE).toMatch(/if \(projected > allowedSelected\)/);
  });

  it("⭐ 상한 검사가 신청서 생성보다 먼저다", () => {
    expect(SAVE.indexOf("if (projected > allowedSelected)")).toBeLessThan(
      SAVE.indexOf("status: \"pending\""),
    );
  });

  it("⭐ 이미 대기 중인 직업은 다시 신청하지 않는다", () => {
    expect(SAVE).toContain("added.filter((id) => !pendingJobIds.has(id))");
  });

  it("⭐ 그만두기는 승인 없이 즉시 반영된다", () => {
    expect(SAVE).toContain("const removed = current.filter((id) => !requestedSet.has(id))");
  });

  it("⭐ 그만두기가 배열을 통째로 덮어쓰지 않는다(경합 시 승인분 유실 방지)", () => {
    // 학생이 화면을 열어둔 사이 선생님이 승인하면 selectedJobIds 가 이미 바뀌어 있다.
    // 통째 덮어쓰면 방금 승인된 직업이 사라지고 주급이 준다(Gemini CRITICAL, 2026-08-20).
    // cash 를 increment 로만 만지는 것과 같은 이유 — 이건 절대값 덮어쓰기다.
    // ⚠️ `selectedJobIds: kept` 는 **반환값**(화면 표시용)이라 정당하다 — 겨냥할 것은 **쓰기**다.
    //    users 문서로 가는 update 가 arrayRemove 를 쓰는지 본다.
    const write = SAVE.indexOf('batch.update(db.collection("users").doc(uid)');
    expect(write, "users 문서 갱신을 찾지 못했다").toBeGreaterThan(-1);
    const writeBody = SAVE.slice(write, write + 260);
    expect(writeBody).toContain("FieldValue.arrayRemove(...removed)");
    expect(writeBody).not.toContain("selectedJobIds: kept");
  });

  it("⭐ 체크를 푼 직업의 대기 신청은 함께 취소된다", () => {
    // 안 그러면 선생님이 '학생이 이미 마음을 접은 직업'을 승인하게 된다.
    expect(SAVE).toContain('status: "canceled"');
  });

  it("⭐ 승인 경로가 selectedJobIds 에 새 직업을 직접 붙이지 않는다", () => {
    // 신청은 문서만 만들 뿐이어야 한다. validSelected 를 그대로 쓰면 승인제가 무의미해진다.
    // ⚠️ 슬라이스를 파일 끝까지 잡으면 **승인제가 꺼진 경우의 정상 경로**까지 들어와
    //    항상 실패한다. 승인 분기 안(= 모든 쓰기가 끝나는 지점)까지만 본다.
    const start = SAVE.indexOf("if (approvalRequired)");
    const end = SAVE.indexOf("appliedCount");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = SAVE.slice(start, end);
    expect(branch).not.toContain("selectedJobIds: validSelected");
    // 이 분기에서 selectedJobIds 에 하는 유일한 쓰기는 '뺀 것 제거' 뿐이어야 한다.
    expect(branch).toContain("arrayRemove");
  });
});

describe("직업 신청 — 승인 경로(processJobApplication)", () => {
  it("⭐ 교사만 처리할 수 있다", () => {
    // 이 저장소의 교사 전용 관용구 — 진입점에서 검사되므로 다른 로직 아래로 밀릴 수 없다.
    expect(PROCESS).toContain("checkAuthAndGetUserData(request, true)");
    // 할일 승인(processTaskApproval)의 권한 블록을 복붙하면 안 된다 — 그쪽은 위임 학생·
    // 대통령에게도 열려 있어서, 할일 승인만 위임받은 학생이 남의 주급을 올릴 수 있다.
    expect(PROCESS).not.toContain("delegatedPermissions");
    expect(PROCESS).not.toContain('"대통령"');
    expect(PROCESS).not.toContain("isPresident");
  });

  it("⭐ 권한 검사가 트랜잭션보다 먼저다", () => {
    expect(PROCESS.indexOf("checkAuthAndGetUserData(request, true)")).toBeLessThan(
      PROCESS.indexOf("runTransaction"),
    );
  });

  it("⭐ 이미 처리된 신청은 다시 처리되지 않는다(멱등)", () => {
    expect(PROCESS).toMatch(/if \(app\.status !== "pending"\)/);
  });

  it("⭐ 다른 학급 신청은 못 만진다", () => {
    expect(PROCESS).toContain("app.classCode !== classCode");
  });

  it("⭐ 자기 자신의 신청은 처리할 수 없다", () => {
    expect(PROCESS).toContain("app.studentId === uid");
  });

  it("⭐ 승인 시점에 직업 존재를 다시 확인한다", () => {
    // 신청 후 직업이 삭제됐을 수 있다.
    expect(PROCESS).toMatch(/const job = jobMap\.get\(app\.jobId\)[\s\S]{0,120}if \(!job\)/);
  });

  it("⭐ 승인 시점에 '선생님 지정 전용'인지 다시 확인한다", () => {
    // 그 사이 지정 전용으로 바뀌었으면 신청으로 줄 수 없다.
    expect(PROCESS).toContain("isAppointedJob(job)");
  });

  it("⭐ 승인 시점에 상한을 다시 확인한다", () => {
    // 신청 후 교사가 상한을 낮췄을 수 있다.
    expect(PROCESS).toContain("current.length + 1 > allowedSelected");
  });

  it("⭐ 재검증이 전부 직업 부여보다 먼저다", () => {
    const grant = PROCESS.indexOf("selectedJobIds: [...current, app.jobId]");
    expect(grant).toBeGreaterThan(-1);
    for (const guard of [
      "if (!job)",
      "isAppointedJob(job)",
      "current.length + 1 > allowedSelected",
      "app.studentId === uid",
    ]) {
      expect(PROCESS.indexOf(guard), `${guard} 가 부여보다 뒤에 있다`).toBeLessThan(grant);
    }
  });

  it("⭐ 이미 가진 직업은 중복으로 붙이지 않는다", () => {
    expect(PROCESS).toContain("current.includes(app.jobId)");
  });

  it("⭐ 거절은 직업을 건드리지 않는다", () => {
    const rejectIdx = PROCESS.indexOf('status: "rejected"');
    expect(rejectIdx).toBeGreaterThan(-1);
    // 거절 분기는 학생 문서를 읽기도 전에 끝난다.
    expect(rejectIdx).toBeLessThan(PROCESS.indexOf("transaction.get(studentRef)"));
  });
});

describe("직업 신청 — 규칙", () => {
  // match 블록을 **중괄호 짝으로** 잘라낸다. 고정 길이(+1200)로 자르면 블록이 길어질 때
  // 뒤가 잘려 조용히 검사에서 빠진다.
  const jobRulesBlock = (() => {
    const start = RULES.indexOf("match /jobApplications/{applicationId}");
    expect(start, "jobApplications 규칙 블록을 찾지 못했다").toBeGreaterThan(-1);
    // ⚠️ 경로에 `{applicationId}` 가 들어 있어서, 그냥 첫 `{` 부터 세면 그 자리에서
    //    depth 가 0 으로 돌아와 블록이 한 줄로 잘린다(실제로 그렇게 빈 블록이 나왔다).
    //    match 줄의 **마지막** `{` 가 블록을 여는 괄호다.
    const lineEnd = RULES.indexOf("\n", start);
    const open = RULES.lastIndexOf("{", lineEnd);
    let depth = 0;
    for (let i = open; i < RULES.length; i += 1) {
      if (RULES[i] === "{") depth += 1;
      else if (RULES[i] === "}") {
        depth -= 1;
        if (depth === 0) return RULES.slice(start, i + 1);
      }
    }
    throw new Error("규칙 블록의 닫는 괄호를 찾지 못했다");
  })();

  it("⭐ 클라이언트가 신청서를 직접 만들 수 없다", () => {
    // 직접 만들 수 있으면 studentId/jobId 를 무검증으로 심고 교사 승인으로 직업을 얻는다.
    // ⚠️ `if false` 가 "있는지"만 보면 안 된다 — allow 규칙은 **여러 개면 OR** 라서
    //    관대한 create 를 하나 더 붙이면 열린다(변이 테스트로 발견).
    const creates = jobRulesBlock.match(/allow create:[^;]*;/g) || [];
    expect(creates).toEqual(["allow create: if false;"]);
  });

  it("⭐ 승인은 자기 학급 교사만, classCode 는 동결된다", () => {
    const updates = jobRulesBlock.match(/allow update:[\s\S]*?;/g) || [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("isClassAdmin(resource.data.classCode)");
    expect(updates[0]).toContain(
      "request.resource.data.classCode == resource.data.classCode",
    );
  });

  it("⭐ 읽기가 학급 밖으로 열려 있지 않다", () => {
    // 「읽기만 안 잠근 버그클래스」 재발 방지 — 쓰기만 잠그고 read 를 열어두는 실수를 여러 번 했다.
    const reads = jobRulesBlock.match(/allow read:[^;]*;/g) || [];
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("isSameClassFast(resource.data.classCode)");
  });
});
