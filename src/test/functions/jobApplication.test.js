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
  it("⭐ 승인은 학급 설정이 아니라 **규칙**이다 (2026-08-29)", () => {
    // 직업 개수가 주급을 정하므로 직업이 붙는 경로 = 돈이 늘어나는 경로다.
    // 토글로 열어 둘 수 있으면 끈 학급에서 학생이 자기 주급을 올린다.
    expect(SAVE).toContain("const approvalRequired = true");
    // 학급 설정 필드를 **다시 읽지 않는다** — 읽는 순간 그 필드가 규칙이 된다.
    expect(
      SAVE,
      "승인 여부를 다시 학급 설정에서 읽고 있다",
    ).not.toContain("jobApprovalRequired");
    // 승인을 건너뛰고 직업을 바로 붙이던 즉시 저장 경로가 남아 있으면 안 된다.
    // ⚠️ **학생 경로만** 본다 — 교사 경로의 `selectedJobIds: validSelected` 는 정당하다
    //    (선생님은 승인을 받을 대상이 아니다). 전부를 보면 이 단언은 늘 실패한다.
    const studentOnly = SAVE.slice(SAVE.indexOf("const currentAppointed ="));
    expect(
      studentOnly,
      "학생 경로에 즉시 저장(승인 우회)이 아직 살아 있다",
    ).not.toContain("selectedJobIds: validSelected");
  });

  it("⭐ 상한을 '이미 가진 것 + 대기중 + 신규신청' 합으로 센다", () => {
    // 대기 중인 걸 빼고 세면 승인 전에 계속 신청해 상한을 무한 우회할 수 있다.
    // ⚠️ 2026-08-27: 임명직도 신청 대상이 되면서 **임명분까지 같은 합에 든다**.
    //    임명분을 빼고 세면 "대통령 + 일반직 상한만큼"으로 상한을 넘길 수 있다.
    expect(SAVE).toContain(
      "appointedCountFresh + heldSelected + pendingJobIds.size + toApply.length",
    );
    expect(SAVE).toMatch(/if \(projected > maxJobsPerStudent\)/);
  });

  it("⭐ 상한 검사가 신청서 생성보다 먼저다", () => {
    const capAt = SAVE.indexOf("if (projected > maxJobsPerStudent)");
    expect(capAt, "상한 검사가 사라졌다").toBeGreaterThan(-1);
    expect(capAt).toBeLessThan(SAVE.indexOf("status: \"pending\""));
  });

  it("⭐ 이미 대기 중인 직업은 다시 신청하지 않는다", () => {
    expect(SAVE).toContain("].filter((id) => !pendingJobIds.has(id))");
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
    // ⚠️ 2026-08-29: 이 쓰기는 `userUpdate` 객체를 먼저 만들고 한 줄로 커밋한다
    //    (그만둘 게 없어도 updatedAt 만 써서 전제조건을 붙이기 위해). 겨냥할 것은
    //    그 객체가 **무엇을 쓰는가** 다.
    const write = SAVE.indexOf("const userUpdate =");
    expect(write, "users 문서 갱신을 찾지 못했다").toBeGreaterThan(-1);
    const writeBody = SAVE.slice(write, write + 400);
    expect(writeBody).toContain("FieldValue.arrayRemove(...removed)");
    expect(writeBody).not.toContain("selectedJobIds: kept");
    expect(SAVE).toContain("batch.update(userRef, userUpdate, userPrecondition)");
  });

  it("⭐ 체크를 푼 직업의 대기 신청은 함께 취소된다", () => {
    // 안 그러면 선생님이 '학생이 이미 마음을 접은 직업'을 승인하게 된다.
    expect(SAVE).toContain('status: "canceled"');
  });

  it("⭐ 승인제 학급에서 selectedJobIds 에 새 직업을 직접 붙이지 않는다", () => {
    // 신청은 문서만 만들 뿐이어야 한다. validSelected 를 그대로 쓰면 승인제가 무의미해진다.
    //    겨냥할 것은 users 문서 쓰기 블록이다 — 신청서 생성(canceledDocs 이후)은
    //    문서를 만들 뿐이라 여기 판정과 무관하다.
    const start = SAVE.indexOf("if (approvalRequired) {");
    expect(start, "승인 쓰기 블록을 찾지 못했다").toBeGreaterThan(-1);
    const end = SAVE.indexOf("for (const d of canceledDocs)", start);
    expect(end, "쓰기 블록의 끝을 찾지 못했다").toBeGreaterThan(start);
    const branch = SAVE.slice(start, end);
    expect(branch).not.toContain("selectedJobIds: validSelected");
    // 이 분기에서 selectedJobIds 에 하는 유일한 쓰기는 '뺀 것 제거' 뿐이어야 한다.
    expect(branch).toContain("arrayRemove");
  });

  it("⭐ 학생 경로는 appointedJobIds 를 **쓰지 않는다** (임명은 승인 CF 전용)", () => {
    // 2026-08-27: 임명직도 학생이 신청할 수 있게 됐다. 신청은 문서만 만들고,
    // 부여는 교사 전용 processJobApplication 에서만 일어난다. 여기서 한 줄이라도
    // appointedJobIds 에 쓰면 2026-07-13 자가임명 결함이 그대로 되살아난다.
    const studentPath = SAVE.slice(SAVE.indexOf("const currentAppointed ="));
    expect(studentPath, "학생 경로를 찾지 못했다").toBeTruthy();
    // 남아도 되는 건 읽기(toJobIdArray(userData?.appointedJobIds))와 반환값뿐이다.
    for (const forbidden of [
      "appointedJobIds: [",
      "appointedJobIds: appointedRequested",
      "arrayUnion",
    ]) {
      expect(studentPath, `학생 경로가 ${forbidden} 로 임명을 쓴다`).not.toContain(
        forbidden,
      );
    }
  });

  it("⭐ 사용자 문서 쓰기에 낙관적 잠금이 걸린다 (상한 우회 레이스 차단)", () => {
    // 🔴 2026-08-27 codex CRITICAL. 진입 시점 스냅샷으로 상한을 세고 조건 없이 쓰면,
    //    그 사이 교사가 임명을 커밋한 경우 상한을 넘긴 채로 커밋된다:
    //      상한 1 · 임명직 A 대기 → 학생이 일반직 B 저장(임명 0개로 읽음)
    //      → 교사가 A 승인 → 학생 쪽 쓰기가 그대로 커밋 → A+B 두 개. 주급 200만 → 250만.
    //    아이러니하게도 이 함수는 **신청서에는** 이미 lastUpdateTime 을 걸고 있었다 —
    //    정작 돈이 걸린 users 문서에만 빠져 있었다.
    // ① 다시 읽는다
    expect(SAVE).toContain("const userSnap = await userRefForRead.get()");
    // ② 그 판일 때만 쓴다
    expect(SAVE).toContain("lastUpdateTime: userSnap.updateTime");
    // ③ 상한 계산이 **다시 읽은 값**을 쓴다(진입 시점 값이 아니라)
    expect(SAVE).toContain("const appointedCountFresh = freshAppointed.length");
    // ④ 2026-08-29: 두 번째 쓰기 경로(즉시저장)는 **지웠다**. 안 도는 경로를 남기면
    //    나중에 규칙을 되돌릴 때 검증되지 않은 옛 코드가 그대로 살아난다.
    for (const gone of ["tailUserRef", "tailSnap", "tailAllowed", "tailAppointedCount"]) {
      expect(SAVE, `죽은 즉시저장 경로의 ${gone} 가 남아 있다`).not.toContain(gone);
    }
    // ⑤ 그 자리는 조용한 undefined 대신 소리 내어 실패한다.
    expect(SAVE).toContain("직업 저장 경로가 잘못되었습니다");
  });

  it("⭐ **신청만 하는 저장**에도 잠금이 걸린다 (전제조건이 아무 데도 안 걸리던 구멍)", () => {
    // 🔴 2026-08-29 codex CRITICAL. 낙관적 잠금은 **쓰기에 붙는다** — 쓸 게 없으면
    //    전제조건도 없다. 전에는 `if (removed.length > 0)` 안에서만 users 문서를 갱신해서,
    //    '그만둘 것 없이 신청만 하는' 흔한 저장에서는 배치에 users 쓰기가 하나도 없었다.
    //    그 사이 다른 탭이 저장하거나 교사가 승인을 커밋해도 신청서가 그대로 커밋된다.
    //    (승인 CF 가 부여 직전에 상한을 다시 보므로 돈은 안 새지만, 교사에게는 승인할 수
    //     없는 신청이 쌓인다 — 그리고 '못 잠근 판'을 남겨두는 습관 자체가 이 파일의 주제다.)
    // 그만두기·신청·취소 — **상태를 바꾸는 저장이면 전부** 같은 판에 잠근다.
    for (const kind of ["removed.length > 0", "toApply.length > 0", "canceledDocs.length > 0"]) {
      expect(SAVE, `${kind} 가 users 쓰기 조건에서 빠졌다`).toContain(kind);
    }
    // 그만둘 게 없을 때도 최소한 updatedAt 은 써야 전제조건이 붙는다.
    const write = SAVE.indexOf("const userUpdate =");
    expect(write, "신청 저장의 users 쓰기를 찾지 못했다").toBeGreaterThan(-1);
    const body = SAVE.slice(write, write + 600);
    expect(body, "이 쓰기에 lastUpdateTime 전제조건이 없다").toContain("userPrecondition");
    // 그만둘 게 없을 때도 updatedAt 은 쓴다 — 그래야 전제조건이 붙을 자리가 생긴다.
    expect(SAVE).toContain(
      ": { updatedAt: admin.firestore.FieldValue.serverTimestamp() }",
    );
  });

  it("⭐ 잠금이 걸리면 아무것도 안 써지고 학생에게 다시 하라고 말한다", () => {
    // 조용히 실패하면 학생은 저장된 줄 안다. code 9/5 를 aborted 로 바꿔 안내한다.
    // (2026-08-29: 쓰기 경로가 하나로 줄어 안내도 하나다 — 전에는 즉시저장 경로가 따로 있었다.)
    const aborted = [...SAVE.matchAll(/"aborted"/g)].length;
    expect(aborted, "aborted 안내가 없다").toBeGreaterThanOrEqual(1);
  });

  it("⭐ 낡은 번들이 임명직 **신청서**를 취소하지 못한다 (능력 플래그)", () => {
    // 2026-08-27 이전 번들은 임명 전용 직업을 payload 에 담지 않는다(서버가 거부했으니까).
    // 그 payload 를 "뺐다"로 읽으면 열려 있던 옛 탭이 저장 한 번으로 방금 낸 임명 신청을
    // 스스로 취소한다. 빠진 것이 '뺐다'인지 '모른다'인지는 payload 로 구분할 수 없으므로,
    // 새 번들이 스스로 신고하게 하고 신고 없으면 임명직 신청은 건드리지 않는다.
    expect(SAVE).toContain("request.data?.includesAppointed === true");
    const guard = SAVE.indexOf(
      "if (!clientKnowsAppointed && isAppointedJob(jobMap.get(jobId))) return false;",
    );
    expect(guard, "임명직 신청 취소 가드가 없다").toBeGreaterThan(-1);
    // 가드는 **취소 목록을 만드는 자리**에 있어야 한다 — 뒤에서 걸러내면 이미 늦다.
    expect(guard).toBeLessThan(SAVE.indexOf('status: "canceled"'));
  });

  it("⭐ 학생이 체크를 풀어도 임명직은 벗겨지지 않는다", () => {
    // 낡은 번들은 임명직을 payload 에 아예 안 넣는다. 그걸 '그만두기'로 읽으면
    // 그 탭의 저장 한 번이 이미 임명된 직업을 조용히 날린다.
    // 그만두기 계산(`removed`)이 **일반직 목록(current)** 에서만 나오는지 본다.
    expect(SAVE).toContain(
      "const removed = current.filter((id) => !requestedSet.has(id))",
    );
    expect(SAVE).toContain(
      "const current = toJobIdArray(freshUser?.selectedJobIds).filter(",
    );
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
    // ⚠️ 2026-08-20: 트랜잭션 **밖** jobMap 스냅샷을 보던 것을 **안에서 다시 읽도록** 바꿨다.
    //    id 로 직접 읽으므로 학급 대조가 함께 있어야 다른 학급 직업이 새어 들어오지 않는다.
    expect(PROCESS).toMatch(
      /const jobDoc = await transaction\.get\(db\.collection\("jobs"\)\.doc\(app\.jobId\)\)[\s\S]{0,240}if \(!job \|\| job\.classCode !== classCode\)/,
    );
  });

  it("⭐ 승인 시점에 '선생님 지정 전용'인지 다시 확인한다", () => {
    // 그 사이 지정 전용으로 바뀌었으면 신청으로 줄 수 없다.
    expect(PROCESS).toContain("isAppointedJob(job)");
  });

  it("⭐ 승인 시점에 상한을 다시 확인한다", () => {
    // 신청 후 교사가 상한을 낮췄을 수 있다.
    expect(PROCESS).toContain("heldCount + 1 > maxJobsPerStudent");
  });

  it("⭐ 재검증이 전부 직업 부여보다 먼저다", () => {
    // 부여 지점은 둘이다(임명/일반). **더 앞선 쪽**을 기준으로 재야 한 쪽만 보호되는 일이 없다.
    const grants = [
      "appointedJobIds: [...currentAppointed, app.jobId]",
      "selectedJobIds: [...currentSelected, app.jobId]",
    ].map((g) => {
      const at = PROCESS.indexOf(g);
      expect(at, `${g} 가 사라졌다`).toBeGreaterThan(-1);
      return at;
    });
    const grant = Math.min(...grants);
    for (const guard of [
      "if (!job || job.classCode !== classCode)",
      "isAppointedJob(job)",
      "heldCount + 1 > maxJobsPerStudent",
      "app.studentId === uid",
    ]) {
      // ⚠️ **먼저 존재를 확인한다.** 없으면 indexOf 가 -1 이라 "부여보다 앞"이 자동으로
      //    참이 되어, 가드를 통째로 지워도 이 테스트가 초록불로 남는다(2026-08-20).
      const at = PROCESS.indexOf(guard);
      expect(at, `${guard} 가 사라졌다`).toBeGreaterThan(-1);
      expect(at, `${guard} 가 부여보다 뒤에 있다`).toBeLessThan(grant);
    }
  });

  it("⭐ 이미 가진 직업은 중복으로 붙이지 않는다", () => {
    // ⚠️ 두 필드를 **모두** 본다. 한쪽만 보면 반대쪽에 이미 있는 직업이 다시 붙어
    //    같은 직업이 두 필드에 동시에 존재하고, 상한 계산이 그만큼 부풀려진다.
    expect(PROCESS).toContain("currentSelected.includes(app.jobId)");
    expect(PROCESS).toContain("currentAppointed.includes(app.jobId)");
  });

  it("⭐ 지정 전용 직업은 appointedJobIds 로만 부여된다", () => {
    // 학생이 자기 문서에 못 쓰는 필드다. 여기서 selectedJobIds 로 부여하면
    // 권한 판정(hasAppointedJobTitle)이 통과하지 않아 조용히 고장나거나,
    // 반대로 self-select 무효화 규약이 깨진다.
    expect(PROCESS).toContain("const grantAsAppointed = isAppointedJob(job)");
    const grantAt = PROCESS.indexOf("grantAsAppointed\n            ? {");
    expect(grantAt, "부여 분기가 grantAsAppointed 로 갈리지 않는다").toBeGreaterThan(-1);
    const branch = PROCESS.slice(grantAt, grantAt + 400);
    // 참 가지 = 임명, 거짓 가지 = 일반. 순서가 뒤집히면 지정 전용이 selectedJobIds 로 간다.
    // ⚠️ **먼저 존재를 확인한다.** indexOf 가 -1 이면 "앞에 있다"가 자동으로 참이 되어
    //    부여 필드를 통째로 바꿔도 이 테스트가 초록불로 남는다(이 파일의 기존 교훈과 같은 함정 —
    //    2026-08-27 변이 테스트로 실제로 걸렸다).
    const appointedAt = branch.indexOf("appointedJobIds: [...currentAppointed");
    const selectedAt = branch.indexOf("selectedJobIds: [...currentSelected");
    expect(appointedAt, "참 가지가 appointedJobIds 로 부여하지 않는다").toBeGreaterThan(-1);
    expect(selectedAt, "거짓 가지가 selectedJobIds 로 부여하지 않는다").toBeGreaterThan(-1);
    expect(appointedAt, "부여 분기가 뒤집혔다").toBeLessThan(selectedAt);
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
