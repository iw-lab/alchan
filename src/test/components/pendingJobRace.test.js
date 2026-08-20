/**
 * 대기 중인 직업 신청이 **화면을 다시 열기만 해도 조용히 취소되던** 버그를 고정한다.
 *
 * 무슨 일이 있었나 (2026-08-20 사후 교차검증에서 RTL 재현으로 발견)
 *   `handleSelectJobClick` 이 `setViewMode("selectJob")` 을 **먼저** 부르고
 *   `fetchPendingJobIds(...)` 를 나중에 await 했다. `SelectMultipleJobsView` 의
 *   `tempSelection` 은 **lazy useState 초기화**라 마운트 순간 딱 한 번 도는데,
 *   그 시점의 `pendingJobIds` 는 아직 `[]` 였다. 뒤늦게 값이 도착해도 초기화는 다시 안 돈다.
 *   → 대기 중인 직업이 **체크 안 된 채로** 그려지고(뱃지는 useMemo 라 정확히 뜬다),
 *     그 상태로 저장하면 서버는 "체크 해제 = 마음을 접음"으로 읽어 그 신청을 **취소**한다.
 *   에러도 경고도 없다. 학생 입장에선 신청한 적도 없던 게 된다.
 *
 * 그리고 검증자가 놓친 **두 번째 경로**: `fetchPendingJobIds` 가 실패를 `[]` 로 뭉개고 있었다.
 *   조회가 한 번 실패하면 위와 똑같은 취소가 일어난다. "없다"와 "모른다"는 다른 값이어야 한다.
 *
 * ⚠️ **이 파일이 무엇을 못 잡는지 알고 쓸 것.**
 *   여기는 소스의 **순서·구조**를 보는 테스트지 실제로 렌더링하는 테스트가 아니다.
 *   그래서 "코드는 그대로인데 의미만 바뀐" 변경(예: 자식이 lazy init 대신 useEffect 로 동기화하게
 *   바뀌는 경우)은 못 본다. 이 순서 단언이 그때는 과잉 제약이 된다 — 그런 변경을 하는 사람은
 *   이 테스트를 **의도적으로** 고쳐야 한다(그게 이 파일이 하는 일이다).
 *
 *   진짜 렌더링 테스트를 못 붙인 이유는 실측이다: `Dashboard.js` 를 테스트에서 import 하면
 *   `src/firebase/firebaseConfig.js:32` 의 `getAuth(app)` 이 실행되며 죽는다(2026-08-20 확인).
 *   붙이려면 firebase 모듈 체인 모킹 인프라가 먼저 필요하고, 그건 별도 작업이다.
 *   대신 **변이 6종**(순서 되돌리기·실패를 []로·return 제거·try/catch 제거·클램프 하드코딩·
 *   취소가드 되돌리기)으로 이 단언들이 실제로 무는 것은 확인했다.
 *
 * 🔁 **2차 교차검증(codex)이 이 파일의 사각지대에서 두 건을 더 찾았다** (2026-08-20)
 *   ① 연타로 조회가 **겹치면** 먼저 끝난 쪽이 화면을 열어 tempSelection 을 고정하고,
 *      늦게 온 결과는 뱃지만 갈아끼운다 — 위와 똑같은 "조용한 취소"가 순서를 지켜도 난다.
 *   ② `saveSelectedJobs` 의 신청 취소가 **조건 없는 배치**라, 그 사이 선생님이 승인을
 *      커밋해도 그대로 `canceled` 로 덮어쓴다(승인 트랜잭션은 자기만 지킨다).
 *   둘 다 "순서"가 아니라 **동시성**이라 순서 단언으로는 영영 안 잡힌다. 아래 가드 단언들이
 *   그 자리를 지킨다 — 가드가 사라지면 여기서 죽는다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (rel) => readFileSync(resolve(process.cwd(), rel), "utf8");
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const DASH = codeOnly(read("src/pages/dashboard/Dashboard.js"));
const DB = codeOnly(read("src/firebase/db/jobApplications.js"));

// handleSelectJobClick 본문만 잘라 본다.
const HANDLER = (() => {
  const start = DASH.indexOf("const handleSelectJobClick =");
  expect(start, "handleSelectJobClick 를 찾지 못했다").toBeGreaterThan(-1);
  const end = DASH.indexOf("const handleConfirmJobSelection", start);
  return DASH.slice(start, end === -1 ? start + 2000 : end);
})();

describe("대기 신청이 조용히 취소되지 않는다", () => {
  it("⭐ 대기 목록을 **받아온 뒤에** 화면을 연다 (lazy 초기화가 최신값을 보게)", () => {
    const iFetch = HANDLER.indexOf("await fetchPendingJobIds(");
    expect(iFetch, "await fetchPendingJobIds 가 없다").toBeGreaterThan(-1);

    // ⚠️ `indexOf(needle, iFetch)` 로 "뒤에 있나"만 보면 안 된다 — 앞에 하나를 더 끼워 넣어도
    //    뒤쪽 것이 잡혀서 통과한다(실제로 이 단언이 변이를 놓쳤다).
    //    봐야 할 것은 **fetch 앞에 화면을 여는 경로가 있는가** 다.
    const beforeAwait = HANDLER.slice(0, iFetch);
    const opensBefore = beforeAwait.match(/setViewMode\("selectJob"\)/g) || [];
    // 승인제가 꺼진 학급의 조기 리턴 하나만 허용된다.
    expect(opensBefore.length, "fetch 앞에서 화면을 여는 경로가 늘었다").toBe(1);
    expect(beforeAwait.indexOf("setPendingJobIds([])"))
      .toBeLessThan(beforeAwait.indexOf('setViewMode("selectJob")'));

    // 그리고 승인제가 켜진 경로에서는 fetch 뒤에 열어야 한다.
    expect(HANDLER.indexOf('setViewMode("selectJob")', iFetch)).toBeGreaterThan(iFetch);
  });

  it("⭐ fetch 결과를 화면 열기 전에 state 에 넣는다", () => {
    const iSet = HANDLER.indexOf("setPendingJobIds(pending)");
    const iOpen = HANDLER.indexOf('setViewMode("selectJob")', iSet);
    expect(iSet).toBeGreaterThan(-1);
    expect(iOpen).toBeGreaterThan(iSet);
  });

  it("⭐ 조회 실패(null)면 화면을 아예 열지 않는다", () => {
    // 대기 신청을 모르는 채로 저장을 허용하면 그 신청들이 통째로 취소된다.
    expect(HANDLER).toMatch(/if \(pending === null\)/);
    const guard = HANDLER.slice(HANDLER.indexOf("if (pending === null)"));
    const iReturn = guard.indexOf("return");
    const iOpen = guard.indexOf('setViewMode("selectJob")');
    expect(iReturn, "실패 분기에 return 이 없다").toBeGreaterThan(-1);
    // 실패 분기 안에서 화면을 여는 경로가 없어야 한다.
    expect(iOpen === -1 || iOpen > iReturn).toBe(true);
  });

  it("⭐ fetchPendingJobIds 는 실패를 빈 배열로 뭉개지 않는다", () => {
    // fail-open 이 곧 데이터 손실인 자리다. catch 가 [] 를 돌려주면 안 된다.
    // ⚠️ `/return \[\];/` 처럼 **공백까지 고정한** 정규식은 `return[];` 한 글자로 회피된다
    //    (2026-08-20 리뷰가 실제로 이 변이를 통과시켰다). 공백을 유연하게 두고,
    //    "빈 배열을 돌려주는 문장이 하나도 없다"를 본다.
    const catchBlock = DB.slice(DB.indexOf("} catch (e) {"));
    expect(catchBlock).toMatch(/return\s+null\s*;/);
    expect(catchBlock, "실패를 빈 배열로 뭉갠다").not.toMatch(/return\s*\[\s*\]\s*;/);
    // 그리고 그 return null 이 **도달 가능**해야 한다 — 앞에 조건 없이 나와야 한다.
    //    (`if (false) { return null; } return[];` 로 죽은 코드를 만드는 변이 방어)
    const iNull = catchBlock.search(/return\s+null\s*;/);
    const beforeNull = catchBlock.slice(0, iNull);
    expect(beforeNull, "return null 앞에 분기가 생겨 도달 불가일 수 있다").not.toMatch(/\bif\s*\(/);
  });

  it("⭐ 조회가 **동시에 두 번** 돌지 않는다 (연타 가드)", () => {
    // 순서를 지켜도 조회가 겹치면 같은 사고가 난다: 먼저 끝난 스냅샷이 화면을 열어
    // tempSelection(lazy 초기화)을 고정하고, 늦게 온 스냅샷은 뱃지만 바꾼다.
    // 그 상태로 저장하면 체크되지 않은 대기 신청이 서버에서 취소된다.
    const iFetch = HANDLER.indexOf("await fetchPendingJobIds(");
    const before = HANDLER.slice(0, iFetch);
    expect(before, "조회 앞에 재진입 차단이 없다").toMatch(
      /if \(pendingFetchInFlight\.current\) return;/,
    );
    expect(before).toMatch(/pendingFetchInFlight\.current = true;/);
    // 빗장은 **finally** 로 풀려야 한다. 성공 경로에서만 풀면 조회가 한 번 던지는 순간
    // 버튼이 영구히 죽는다(새로고침 전까지 직업 화면을 못 연다).
    const after = HANDLER.slice(iFetch);
    expect(after, "빗장이 finally 로 풀리지 않는다").toMatch(
      /\} finally \{\s*pendingFetchInFlight\.current = false;/,
    );
  });

  it("빗장이 ref 다 (state 면 클릭 핸들러가 옛 값을 본다)", () => {
    // useState 로 두면 같은 렌더 안의 두 번째 클릭이 아직 false 인 값을 읽어 그냥 통과한다.
    expect(DASH).toMatch(/const pendingFetchInFlight = useRef\(false\);/);
  });

  it("승인제가 꺼진 학급은 조회 없이 바로 연다 (읽기 0)", () => {
    expect(HANDLER).toMatch(/if \(!jobApprovalRequired \|\| !user\?\.uid\)/);
    const off = HANDLER.slice(HANDLER.indexOf("if (!jobApprovalRequired"));
    expect(off.slice(0, 300)).toContain('setViewMode("selectJob")');
  });
});

const FN = codeOnly(read("functions/index.js"));
const fnExport = (name) => {
  const start = FN.indexOf(`exports.${name} = onCall(`);
  expect(start, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
  const end = FN.indexOf("\nexports.", start + 10);
  return FN.slice(start, end === -1 ? FN.length : end);
};

describe("교사에게 실패 사유가 도달한다", () => {
  const PROC = fnExport("processJobApplication");
  const TX = PROC.slice(
    PROC.indexOf("await db.runTransaction("),
    PROC.indexOf("} catch (error) {"),
  );

  it("⭐ 트랜잭션을 try/catch 로 감싸 HttpsError 로 바꾼다", () => {
    // onCall 은 HttpsError 가 아닌 예외를 `internal` 로 마스킹한다 —
    // 감싸지 않으면 "그 직업이 삭제되었습니다" 같은 사유가 교사에게 절대 안 뜬다.
    expect(PROC).toMatch(/try \{\s*await db\.runTransaction/);
    expect(PROC).toMatch(/catch \(error\) \{/);
  });

  it("이미 HttpsError 인 예외는 코드를 덮어쓰지 않는다", () => {
    expect(PROC).toMatch(/if \(error instanceof HttpsError\) throw error;/);
    // ⚠️ **존재만 보면 안 된다.** 이 줄을 아래 throw 뒤로 옮기면 도달 불가 코드가 되는데
    //    두 줄 다 파일에 남아 있어서 존재 단언은 통과한다(2026-08-20 리뷰가 통과시킨 변이).
    //    봐야 할 것은 **순서**다: 보존 가드가 재분류 throw 보다 앞이어야 한다.
    const iGuard = PROC.indexOf("if (error instanceof HttpsError) throw error;");
    // ⚠️ `failed-precondition` 은 함수 앞쪽 검증(학급 정보 없음)에도 쓰인다 —
    //    catch 안의 **재분류** throw 를 정확히 집어야 한다(처음엔 앞쪽 것이 잡혔다).
    const iReclass = PROC.indexOf('throw new HttpsError("failed-precondition", error.message);');
    expect(iGuard, "보존 가드가 없다").toBeGreaterThan(-1);
    expect(iReclass, "재분류 throw 를 찾지 못했다").toBeGreaterThan(-1);
    expect(iGuard, "보존 가드가 재분류보다 뒤에 있다(도달 불가)").toBeLessThan(iReclass);
  });

  it("⭐ **판정 사유**와 **운영 장애**를 구분해서 내보낸다", () => {
    // 종전엔 둘을 한 덩어리로 `aborted` + 원문 메시지로 내보냈다. Firestore 의
    // UNAVAILABLE·DEADLINE_EXCEEDED·PERMISSION_DENIED 도 HttpsError 가 아니라
    // 전부 여기로 떨어지는데, 그러면 선생님은 인프라 장애를 "규칙상 안 되는 일"로 읽고
    // 로그에는 진짜 원인이 안 남는다(2026-08-20 codex WARNING).
    expect(PROC, "판정 사유 표식(deny)이 없다").toMatch(
      /const deny = \(message\) => Object\.assign\(new Error\(message\), \{ jobAppDeny: true \}\)/,
    );
    expect(PROC, "표식을 보고 갈라내지 않는다").toMatch(
      /if \(error\?\.jobAppDeny === true\) \{\s*throw new HttpsError\("failed-precondition", error\.message\);/,
    );
    expect(PROC, "운영 장애가 internal 로 안 간다").toMatch(/throw new HttpsError\(\s*"internal",/);
    expect(PROC, "운영 장애 원인이 로그에 안 남는다").toMatch(
      /logger\.error\(\s*`\[processJobApplication\] 처리 실패/,
    );
  });

  it("⭐ 트랜잭션 안에 표식 없는 throw 가 남아 있지 않다", () => {
    // 하나라도 맨 Error 로 남으면 그 사유는 선생님에게 `internal` 로 뭉개져 도달한다.
    expect(TX, "표식 없는 throw new Error 가 남았다").not.toMatch(/throw new Error\(/);
    expect(TX).toMatch(/throw deny\(/);
  });
});

describe("승인 순간에 다시 확인한다", () => {
  const PROC = fnExport("processJobApplication");
  const TX = PROC.slice(
    PROC.indexOf("await db.runTransaction("),
    PROC.indexOf("} catch (error) {"),
  );

  it("⭐ 승인 대상 직업을 **트랜잭션 안에서** 다시 읽는다", () => {
    // 트랜잭션 밖 jobMap 스냅샷만 보면 "읽은 뒤 삭제·지정전용 전환"을 못 본다.
    // 그 직업 한 건만 read set 에 넣으면 그것이 바뀔 때만 재시도가 걸린다.
    expect(TX, "직업을 트랜잭션 안에서 다시 읽지 않는다").toMatch(
      /await transaction\.get\(db\.collection\("jobs"\)\.doc\(app\.jobId\)\)/,
    );
  });

  it("⭐ id 로 직접 읽으므로 학급 대조를 **직접** 한다", () => {
    // 학급 필터 쿼리(jobMap)를 안 거치게 됐으니, 그 쿼리가 해 주던 반경계 검사가 필요하다.
    expect(TX, "다른 학급 직업이 승인될 수 있다").toMatch(/job\.classCode !== classCode/);
  });

  it("⭐ 승인 경로의 모든 읽기가 모든 쓰기보다 앞선다", () => {
    // Firestore 트랜잭션 규약. 어기면 런타임에 죽는다 — 배포 전에 여기서 죽는 편이 낫다.
    const approve = TX.slice(TX.indexOf("const studentRef ="));
    expect(approve.length, "승인 경로를 찾지 못했다").toBeGreaterThan(0);
    const lastGet = approve.lastIndexOf("await transaction.get(");
    const firstUpdate = approve.indexOf("transaction.update(");
    expect(lastGet).toBeGreaterThan(-1);
    expect(firstUpdate, "쓰기 뒤에 읽기가 있다").toBeGreaterThan(lastGet);
  });
});

describe("대기 신청 취소가 승인을 덮어쓰지 않는다", () => {
  const SAVE = fnExport("saveSelectedJobs");

  it("⭐ 취소는 **읽은 그 상태 그대로일 때만** 쓴다", () => {
    // 조건 없는 배치면 이런 겹침이 가능하다: 여기서 pending 을 읽음 → 선생님이 승인 커밋 →
    // 배치가 같은 문서를 `canceled` 로 덮어씀. 학생은 직업을 갖는데 허가 기록은 사라진다.
    expect(SAVE, "취소 배치에 lastUpdateTime 전제조건이 없다").toMatch(
      /\{ lastUpdateTime: d\.updateTime \}/,
    );
  });

  it("⭐ 전제조건이 어긋나면 아무것도 안 쓴 채 다시 하라고 알린다", () => {
    // 배치는 전부-아니면-전무라 이 시점에 써진 것은 하나도 없다.
    expect(SAVE).toMatch(/e\?\.code === 9 \|\| e\?\.code === 5/);
    const guard = SAVE.slice(SAVE.indexOf("e?.code === 9"));
    expect(guard.slice(0, 500)).toMatch(/throw new HttpsError\(\s*"aborted",/);
  });

  it("그만두기는 여전히 arrayRemove 다 (절대값 덮어쓰기 금지)", () => {
    // 배열을 통째로 덮어쓰면 그 사이 승인된 직업이 조용히 사라진다.
    expect(SAVE).toMatch(/selectedJobIds: admin\.firestore\.FieldValue\.arrayRemove\(\.\.\.removed\)/);
  });
});

describe("직업 개수 상한 클램프가 한 곳뿐이다", () => {
  it("⭐ 복붙된 클램프 식이 남아 있지 않다", () => {
    // 같은 다섯 줄이 네 곳(주급 배치·주급 스케줄러·saveSelectedJobs·processJobApplication)에
    // 복붙돼 있었다. 이 저장소는 정확히 이 실패모드로 주급 과다지급 사고를 낸 적이 있다.
    for (const f of ["functions/index.js", "functions/scheduler-http.js"]) {
      expect(codeOnly(read(f)), `${f} 에 복붙 클램프가 남았다`).not.toMatch(
        /Number\.isInteger\(rawMaxJobs\)/,
      );
    }
  });

  it("⭐ 기본값이 급여 상수 정본에서만 온다", () => {
    const JU = codeOnly(read("functions/jobUtils.js"));
    expect(JU).toMatch(/SALARY\.DEFAULT_MAX_JOBS/);
    // jobUtils 안에 5 를 다시 적어두면 그게 세 번째 사본이다.
    expect(JU).not.toMatch(/const DEFAULT_MAX_JOBS = 5/);
    // resolveStudentJobs 의 폴백에도 5 가 남아 있었다(2026-08-20 codex NIT).
    // 지금은 값이 같아서 아무 일도 안 일어나지만, 정본을 바꾸는 날 여기만 안 따라온다.
    const resolveFn = JU.slice(
      JU.indexOf("const resolveStudentJobs ="),
      JU.indexOf("const hasJobTitle ="),
    );
    expect(resolveFn.length).toBeGreaterThan(0);
    expect(resolveFn, "resolveStudentJobs 폴백에 리터럴이 남았다").not.toMatch(/:\s*5;/);
    expect(resolveFn).toMatch(/SALARY\.DEFAULT_MAX_JOBS;/);
  });

  it("상한을 안 주면 급여 상수 기본값으로 자른다 (실동작)", async () => {
    const { resolveStudentJobs } = await import("../../../functions/jobUtils.js");
    const { SALARY } = await import("../../../functions/salaryUtils.js");
    const ids = Array.from({ length: SALARY.DEFAULT_MAX_JOBS + 4 }, (_, i) => `j${i}`);
    const map = new Map(ids.map((id) => [id, { title: id }]));
    const r = resolveStudentJobs({ selectedJobIds: ids }, map, undefined);
    expect(r.selected).toHaveLength(SALARY.DEFAULT_MAX_JOBS);
  });

  it("클램프가 실제로 1~20 으로 조인다", async () => {
    const { clampMaxJobs } = await import("../../../functions/jobUtils.js");
    expect(clampMaxJobs(undefined)).toBe(5);
    expect(clampMaxJobs(0)).toBe(5);
    expect(clampMaxJobs(3.5)).toBe(5);
    expect(clampMaxJobs("5")).toBe(5);
    expect(clampMaxJobs(1)).toBe(1);
    expect(clampMaxJobs(20)).toBe(20);
    expect(clampMaxJobs(21)).toBe(20);
    expect(clampMaxJobs(9999)).toBe(20);
  });
});

describe("메뉴 잠금 취소 가드가 죽어 있지 않다", () => {
  const CTX = codeOnly(read("src/contexts/MenuLocksContext.js"));

  it("⭐ **호출부가** isCancelled 를 실제로 넘긴다", () => {
    // ⚠️ `load` 본문만 보면 안 된다. 시그니처가 `load(isCancelled = () => false)` 라서
    //    호출부를 `await load()` 로 되돌리면 **기본값이 조용히 채워져** 가드가 다시 죽는다
    //    — 본문은 그대로라 본문만 보는 단언은 통과한다(2026-08-20 리뷰가 이 변이를 통과시켰다).
    //    "안 쓰는 인자 제거" 같은 무심한 정리 한 번이면 이 수정 전체가 무효가 된다.
    expect(CTX, "useEffect 가 isCancelled 를 안 넘긴다").toMatch(/await load\(isCancelled\)/);
    expect(CTX, "인자 없는 load\(\) 호출이 남아 있다").not.toMatch(/await load\(\s*\)/);
  });

  it("⭐ 취소 확인이 setState **직전**에 있다", () => {
    // 종전엔 `await load()` 가 끝난 뒤에 확인해서 아무것도 막지 못하는 죽은 코드였다.
    // ⚠️ 파일 전체에서 indexOf 하면 안 된다 — 앞쪽 `!classCode` 분기의 확인이 잡혀서
    //    정작 비동기 분기에서 순서를 뒤집어도 통과한다(이 단언이 실제로 변이를 놓쳤다).
    //    **await 뒤 구간만** 잘라서 본다.
    const iRegion = CTX.indexOf("const ids = await fetchMenuLockedItemIds");
    expect(iRegion, "await 구간을 찾지 못했다").toBeGreaterThan(-1);
    const region = CTX.slice(iRegion);
    const iCheck = region.indexOf("if (isCancelled()) return;");
    const iSet = region.indexOf("setLockedItemIds(ids);");
    expect(iCheck, "await 뒤에 취소 확인이 없다").toBeGreaterThan(-1);
    expect(iSet, "취소 확인이 setState 뒤에 있다(죽은 가드)").toBeGreaterThan(iCheck);
  });
});
