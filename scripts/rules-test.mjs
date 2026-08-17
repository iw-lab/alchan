#!/usr/bin/env node
/**
 * firestore.rules 거부 테스트 (Firestore Rules `:test` REST API)
 *
 * 왜 이 방식인가:
 *   표준 방법인 @firebase/rules-unit-testing 은 Firestore 에뮬레이터(=Java 런타임)를 요구하는데
 *   이 개발기에는 Java가 없다. Rules `:test` API 는 Google 서버에서 rules 를 평가하므로
 *   에뮬레이터 없이 동일한 판정을 얻는다(2026-06-12 "함께구매 권한 오류" 원격 진단에서 검증된 경로).
 *
 * ⚠️ 형식 함정 (2026-08-03 실측):
 *   resource 는 Firestore 의 타입付 필드(`{fields:{cash:{integerValue:"0"}}}`)가 아니라
 *   평문 `{__name__: path, data: {...}}` 다. 그리고 **최상위 `resource`(기존 문서)** 와
 *   **`request.resource`(쓰려는 문서)** 는 별개 필드다. 최상위 resource 를 빠뜨리면
 *   `resource.data.*` 가 비어 규칙이 전부 거부로 떨어지고 — DENY 케이스만 있으면
 *   "봉인이 잘 되어 있다"는 착시가 된다. 그래서 이 스위트는 ALLOW 카나리아를 반드시 포함한다.
 *   ALLOW 카나리아가 깨지면 봉인이 아니라 **하네스**를 먼저 의심할 것.
 *
 * 실행: npm run test:rules   (firebase CLI 로그인 필요, 네트워크 필요 → CI 제외)
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")).projects.default;
const DB = "/databases/(default)/documents";
const NOW = "2026-08-03T00:00:00Z";

// ────────────────────────────────────────────────────────────
// 인증 — firebase CLI 의 refresh token 을 access token 으로 교환한다.
// OAuth 클라이언트 상수는 리포에 박지 않고 설치된 firebase-tools 에서 런타임에 읽는다
// (하드코딩하면 공개 상수여도 시크릿 스캐너가 잡는다).
// ────────────────────────────────────────────────────────────
async function accessToken() {
  const require = createRequire(import.meta.url);
  const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  const api = require(join(gRoot, "firebase-tools/lib/api.js"));
  const storePath = join(homedir(), ".config/configstore/firebase-tools.json");
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  if (!store.tokens?.refresh_token) throw new Error("firebase CLI 로그인이 없습니다: firebase login");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: store.tokens.refresh_token,
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`토큰 갱신 실패: ${j.error_description || j.error || "unknown"}`);
  return j.access_token;
}

// ────────────────────────────────────────────────────────────
// 배우 — user 문서는 get()/exists() 목으로 주입한다.
// 학생 토큰의 claims 를 비워두는 건 의도적이다: *Fast 헬퍼의 클레임 단락을 건너뛰고
// 문서 기반 헬퍼(쓰기 규칙이 실제로 쓰는 경로)를 평가하게 만든다.
// ────────────────────────────────────────────────────────────
const DOCS = {
  stu1: { name: "학생1", classCode: "C1", cash: 1000, coupons: 5 },
  stu2: { name: "학생2", classCode: "C1", cash: 500, coupons: 0 },
  farStu: { name: "타학급학생", classCode: "C2", cash: 500, coupons: 0 },
  tch1: { name: "교사1", classCode: "C1", cash: 0, coupons: 0, isAdmin: true, isApproved: true },
  sup1: { name: "슈퍼", classCode: "C1", cash: 0, coupons: 0, isSuperAdmin: true },
  tchNoClass: { name: "학급없는교사", classCode: "", cash: 0, coupons: 0, isAdmin: true, isApproved: true },
};

/** uid 들의 user 문서를 get()/exists() 목으로 만든다. */
// ghost = user 문서가 없는 인증 계정(getUserClassCode() 가 '' 를 돌려주는 경로 재현)
const GHOSTS = new Set(["ghost"]);
const mocks = (...uids) =>
  uids.flatMap((uid) => [
    {
      function: "get",
      args: [{ exactValue: `${DB}/users/${uid}` }],
      result: { value: { data: DOCS[uid] || {} } },
    },
    { function: "exists", args: [{ exactValue: `${DB}/users/${uid}` }], result: { value: !GHOSTS.has(uid) } },
  ]);

const auth = (uid, token = {}) => ({ uid, token });

/**
 * @param expect "ALLOW" | "DENY"
 * @param opts.before 기존 문서 data (update/delete 용) — 최상위 resource
 * @param opts.after  쓰려는 문서 data (create/update 용) — request.resource
 */
function tc(expect, label, { path, method, as, before, after, token, actors = [], gets = [] }) {
  const request = { auth: auth(as, token), path: `${DB}${path}`, method, time: NOW };
  if (after) request.resource = { __name__: `${DB}${path}`, data: after };
  const c = {
    __label: label,
    expectation: expect,
    request,
    functionMocks: [
      ...mocks(as, ...actors),
      // 임의 경로 get()/exists() 목(예: playlist 규칙이 읽는 부모 musicRooms 문서)
      ...gets.flatMap(({ path: p, data }) => [
        { function: "get", args: [{ exactValue: `${DB}${p}` }], result: { value: { data } } },
        { function: "exists", args: [{ exactValue: `${DB}${p}` }], result: { value: true } },
      ]),
    ],
  };
  if (before) c.resource = { __name__: `${DB}${path}`, data: before };
  return c;
}

const S = DOCS.stu1; // 학생1 기존 문서 (update 의 before)

const CASES = [
  // ── A. batch7-a/b — 학생 본인의 자산·권한·카운터 직접 write 봉인 ──
  tc("DENY", "학생이 자기 cash 를 직접 올린다 (money glitch)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, cash: 999999999 },
  }),
  tc("DENY", "학생이 자기 coupons 를 올린다 (sellCoupon 현금화 통로)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, coupons: 990000 },
  }),
  tc("DENY", "학생이 자기 classCode 를 바꾼다 (학급 hop)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, classCode: "C2" },
  }),
  tc("DENY", "학생이 isAdmin:true 를 self-grant", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, isAdmin: true },
  }),
  tc("DENY", "학생이 isSuperAdmin:true 를 self-grant", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, isSuperAdmin: true },
  }),
  tc("DENY", "학생이 지정전용 직업을 selectedJobIds 에 주입 (주급 보너스)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, selectedJobIds: ["president"] },
  }),
  tc("DENY", "학생이 delegatedPermissions 로 할일승인 권한 self-grant", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, delegatedPermissions: { taskApproval: true } },
  }),
  tc("DENY", "학생이 gameRewardDaily 를 지워 일일한도 우회", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, gameRewardDaily: { comment: 3 } }, after: { ...S, gameRewardDaily: {} },
  }),
  tc("DENY", "학생이 dailyItemUse 를 지워 사용한도 우회", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, dailyItemUse: { potion: 5 } }, after: { ...S, dailyItemUse: {} },
  }),
  tc("DENY", "학생이 completedTasks 에 음수를 주입 (maxClicks 무력화)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, completedTasks: { task1: -9e15 } },
  }),
  tc("ALLOW", "🐤 학생이 자기 nickname 을 바꾼다 (정상 기능)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, nickname: "새별명" },
  }),

  // ── B. batch7-a-fix — delete → 재생성 우회 봉인 ──
  tc("DENY", "삭제 후 cash 10억으로 재생성 (update 잠금 통째 우회)", {
    path: "/users/stu1", method: "create", as: "stu1",
    after: { name: "학생1", classCode: "C1", cash: 1000000000, coupons: 0 },
  }),
  tc("DENY", "가입하면서 isSuperAdmin:true", {
    path: "/users/stu1", method: "create", as: "stu1",
    after: { name: "학생1", classCode: "C1", cash: 0, coupons: 0, isSuperAdmin: true },
  }),
  tc("DENY", "가입하면서 completedTasks 음수 주입", {
    path: "/users/stu1", method: "create", as: "stu1",
    after: { name: "학생1", classCode: "C1", cash: 0, coupons: 0, completedTasks: { t: -9e15 } },
  }),
  tc("ALLOW", "🐤 정상 회원가입 (cash:0, coupons:0)", {
    path: "/users/stu1", method: "create", as: "stu1",
    after: { name: "학생1", classCode: "C1", cash: 0, coupons: 0 },
  }),

  // ── C. batch7-f — 학생 self-delete 봉인 (카운터 리셋 마스터키) ──
  tc("DENY", "학생이 자기 user 문서를 삭제 (일일카운터 전부 리셋)", {
    path: "/users/stu1", method: "delete", as: "stu1", before: S,
  }),
  tc("ALLOW", "🐤 같은 학급 교사가 학생 계정을 삭제 (정상 관리도구)", {
    path: "/users/stu1", method: "delete", as: "tch1", before: S, actors: ["stu1"],
  }),

  // ── D. Phase1 — 교사 권한의 경계 (자기 학급 + 권한필드 금지) ──
  tc("DENY", "승인 교사가 자기 문서에 isSuperAdmin:true (self-escalation)", {
    path: "/users/tch1", method: "update", as: "tch1",
    before: DOCS.tch1, after: { ...DOCS.tch1, isSuperAdmin: true },
  }),
  tc("DENY", "교사 A 가 타 학급(C2) 학생의 cash 를 조정 (cross-class)", {
    path: "/users/farStu", method: "update", as: "tch1",
    before: DOCS.farStu, after: { ...DOCS.farStu, cash: 999999 }, actors: ["farStu"],
  }),
  tc("ALLOW", "🐤 교사가 자기 학급 학생의 cash 를 조정 (정상 관리도구)", {
    path: "/users/stu2", method: "update", as: "tch1",
    before: DOCS.stu2, after: { ...DOCS.stu2, cash: 2000 }, actors: ["stu2"],
  }),

  // ── E. batch7-c/d/e — 자산 서브컬렉션은 CF(Admin SDK) 전용 ──
  ...[
    ["financials", { balance: 500000 }, "예적금"],
    ["portfolio", { quantity: 100, avgPrice: 1 }, "주식 보유"],
    ["inventory", { itemId: "x", quantity: 99 }, "인벤토리"],
  ].flatMap(([col, data, ko]) => [
    tc("DENY", `학생이 ${ko}(${col}) 문서를 직접 생성`, {
      path: `/users/stu1/${col}/d1`, method: "create", as: "stu1", after: data,
    }),
    tc("DENY", `학생이 ${ko}(${col}) 문서를 직접 수정`, {
      path: `/users/stu1/${col}/d1`, method: "update", as: "stu1",
      before: { ...data, seed: 1 }, after: data,
    }),
  ]),
  tc("ALLOW", "🐤 학생이 자기 financials 를 읽는다 (정상 조회)", {
    path: "/users/stu1/financials/main", method: "get", as: "stu1", before: { balance: 500000 },
  }),

  // ── F. ClassStock 학생 자산 경로 제거 (2026-08-03 이중경로 정리) ──
  //   구 규칙은 `allow write: if isOwner(userId)` 라 학생이 가짜 부동산·파킹잔액을 써넣어
  //   MyAssets 표시 자산을 부풀릴 수 있었다. 프로덕션 전수 0건 확인 후 규칙째 삭제 →
  //   이제 포괄 규칙(if false)이 막는다. 읽기까지 막히는 게 맞다(코드 참조 0).
  // ko 는 조사(을/를)까지 포함한다 — 받침이 제각각이라 템플릿에서 붙이면 "부동산를"이 된다.
  ...[
    ["students/stu1/realestates/e1", { price: 99999999 }, "가짜 부동산을"],
    ["students/stu1/parkingAccounts/p1", { balance: 99999999 }, "가짜 파킹잔액을"],
    ["portfolio/stu1/holdings/h1", { quantity: 9999 }, "가짜 주식보유를"],
  ].flatMap(([sub, data, ko]) => [
    tc("DENY", `학생이 ClassStock 에 ${ko} 써넣는다`, {
      path: `/ClassStock/C1/${sub}`, method: "create", as: "stu1", after: data,
    }),
    tc("DENY", `학생이 ClassStock 의 ${ko} 읽는다 (경로 자체가 폐기됨)`, {
      path: `/ClassStock/C1/${sub}`, method: "get", as: "stu1", before: data,
    }),
  ]),
  tc("DENY", "교사도 ClassStock 학생 자산 경로에 쓸 수 없다", {
    path: "/ClassStock/C1/students/stu1/realestates/e1", method: "create", as: "tch1",
    after: { price: 100 }, actors: ["stu1"],
  }),
  // 부모 문서 자체와 update/delete/list 도 함께 고정한다(codex 커버리지 지적 2026-08-03).
  //   하위 경로 create/get 만 막혀 있고 부모나 다른 메서드가 열리면 우회가 된다.
  ...[
    ["/ClassStock/C1/students/stu1", "students 부모 문서"],
    ["/ClassStock/C1/portfolio/stu1", "portfolio 부모 문서"],
  ].flatMap(([path, ko]) => [
    tc("DENY", `학생이 ${ko}를 생성`, { path, method: "create", as: "stu1", after: { fake: 1 } }),
    tc("DENY", `학생이 ${ko}를 수정`, {
      path, method: "update", as: "stu1", before: { fake: 1 }, after: { fake: 2 },
    }),
    tc("DENY", `학생이 ${ko}를 삭제`, { path, method: "delete", as: "stu1", before: { fake: 1 } }),
  ]),
  tc("DENY", "학생이 ClassStock 하위 문서를 수정", {
    path: "/ClassStock/C1/students/stu1/realestates/e1", method: "update", as: "stu1",
    before: { price: 1 }, after: { price: 99999999 },
  }),
  tc("DENY", "학생이 ClassStock 하위 문서를 삭제", {
    path: "/ClassStock/C1/students/stu1/realestates/e1", method: "delete", as: "stu1",
    before: { price: 1 },
  }),
  tc("DENY", "학생이 ClassStock 학생 목록을 조회(list)", {
    path: "/ClassStock/C1/students", method: "list", as: "stu1",
  }),

  // ── G. 2026-08-11 전수 교차검증 — 열려 있던 네 곳 ──
  //   전부 "read 는 좁혀 놨는데 write 만 isSignedIn() 으로 열려 있던" 같은 계열이다.

  // C2. 루트 /transactions — 남의 거래내역 위조
  //   현금 잔액은 안 움직이지만 MyAssets 가 이 컬렉션을 병합 표시하므로
  //   "관리자 지급 1억" 같은 허위 항목을 **타인 화면에** 심을 수 있었다.
  tc("DENY", "학생이 남의 거래내역을 위조 생성 (루트 transactions)", {
    path: "/transactions/forged1", method: "create", as: "stu1",
    after: { userId: "stu2", amount: 100000000, description: "관리자 지급", type: "admin" },
  }),
  tc("DENY", "학생이 자기 이름으로도 루트 거래내역을 만들 수 없다 (기록은 CF 전용)", {
    path: "/transactions/mine1", method: "create", as: "stu1",
    after: { userId: "stu1", amount: 5000, description: "용돈", type: "income" },
  }),
  tc("ALLOW", "🐤 학생이 자기 루트 거래내역을 읽는다 (자산 화면 정상 조회)", {
    path: "/transactions/mine1", method: "get", as: "stu1",
    before: { userId: "stu1", amount: 5000, type: "income" },
  }),

  // H1. legislations/{id}/votes — 타 학급 표결 문서 무제한 생성
  tc("DENY", "타 학급 학생이 남의 학급 법안에 표결 문서를 만든다", {
    path: "/legislations/L1/votes/v1", method: "create", as: "farStu",
    after: { choice: "찬성", userId: "farStu" },
  }),
  tc("DENY", "같은 학급 학생도 표결 문서를 직접 만들 수 없다 (미사용 컬렉션 봉인)", {
    path: "/legislations/L1/votes/v1", method: "create", as: "stu1",
    after: { choice: "찬성", userId: "stu1" },
  }),

  // H2. goals — 타 학급 쿠폰 목표 진행률·기부액 조작
  tc("DENY", "타 학급 학생이 남의 학급 쿠폰 목표 진행률을 조작", {
    path: "/goals/C1_goal", method: "update", as: "farStu",
    before: { classCode: "C1", progress: 10, donations: 5, currentAmount: 100 },
    after: { classCode: "C1", progress: 100, donations: 5, currentAmount: 100 },
  }),
  tc("DENY", "학생이 목표의 classCode 를 자기 학급으로 바꿔 가로채기", {
    path: "/goals/C1_goal", method: "update", as: "farStu",
    before: { classCode: "C1", progress: 10, donations: 5, currentAmount: 100 },
    after: { classCode: "C2", progress: 10, donations: 5, currentAmount: 100 },
  }),
  // 2차 검증(codex)에서 더 근본적인 게 나왔다: 학생은 goals update 권한이 **애초에 필요 없다.**
  //   정상 기부는 donateCoupon CF(Admin SDK, rules 우회)가 쿠폰 차감과 함께 한 트랜잭션으로 처리한다.
  //   필드 화이트리스트는 "무엇을" 만 막고 "대가를 치렀는지"는 못 막으므로, 학생 분기를 통째로 없앴다.
  tc("DENY", "학생이 쿠폰 차감 없이 진행률만 올린다 (donateCoupon CF 우회)", {
    path: "/goals/C1_goal", method: "update", as: "stu1",
    before: { classCode: "C1", progress: 10, donations: 5, currentAmount: 100 },
    after: { classCode: "C1", progress: 999999, donations: 5, currentAmount: 100 },
  }),
  tc("DENY", "같은 학급 학생이어도 goals 를 직접 수정할 수 없다", {
    path: "/goals/C1_goal", method: "update", as: "stu1",
    before: { classCode: "C1", progress: 10, donations: 5, currentAmount: 100 },
    after: { classCode: "C1", progress: 20, donations: 6, currentAmount: 200 },
  }),
  tc("DENY", "허용 필드 밖(targetAmount)은 당연히 못 바꾼다", {
    path: "/goals/C1_goal", method: "update", as: "stu1",
    before: { classCode: "C1", progress: 10, donations: 5, currentAmount: 100, targetAmount: 1000 },
    after: { classCode: "C1", progress: 10, donations: 5, currentAmount: 100, targetAmount: 1 },
  }),
  tc("ALLOW", "🐤 교사는 자기 학급 쿠폰 목표를 수정한다 (정상 관리도구)", {
    path: "/goals/C1_goal", method: "update", as: "tch1",
    before: { classCode: "C1", progress: 10, targetAmount: 1000 },
    after: { classCode: "C1", progress: 10, targetAmount: 2000 },
  }),

  // HIGH2 — create 만 막고 update/delete 를 두면 학급 경계 없는 전권이 남는다
  tc("DENY", "교사가 타 학급 학생의 거래기록을 수정한다", {
    path: "/transactions/t1", method: "update", as: "tch1",
    before: { userId: "farStu", amount: 1000, description: "용돈" },
    after: { userId: "farStu", amount: 999999999, description: "관리자 지급" }, actors: ["farStu"],
  }),
  tc("DENY", "교사가 자기 학급 학생의 거래기록이라도 수정할 수 없다 (감사 기록)", {
    path: "/transactions/t1", method: "update", as: "tch1",
    before: { userId: "stu1", amount: 1000, description: "용돈" },
    after: { userId: "stu1", amount: 2000, description: "용돈" }, actors: ["stu1"],
  }),
  tc("DENY", "교사가 타 학급 학생의 거래기록을 삭제한다", {
    path: "/transactions/t1", method: "delete", as: "tch1",
    before: { userId: "farStu", amount: 1000 }, actors: ["farStu"],
  }),
  tc("ALLOW", "🐤 교사가 자기 학급 학생의 거래기록을 정리한다 (계정 삭제 시)", {
    path: "/transactions/t1", method: "delete", as: "tch1",
    before: { userId: "stu1", amount: 1000 }, actors: ["stu1"],
  }),

  // H3. users/{uid}/loans — 형제(financials·products)는 봉인됐는데 여기만 열려 있었다
  tc("DENY", "학생이 자기 대출 문서를 직접 생성 (잔액 위조 통로)", {
    path: "/users/stu1/loans/l1", method: "create", as: "stu1",
    after: { amount: 1000000, balance: 0, rate: 0 },
  }),
  tc("DENY", "학생이 자기 대출 잔액을 0 으로 수정 (상환 위조)", {
    path: "/users/stu1/loans/l1", method: "update", as: "stu1",
    before: { amount: 1000000, balance: 1000000 }, after: { amount: 1000000, balance: 0 },
  }),
  tc("ALLOW", "🐤 학생이 자기 대출을 읽는다 (정상 조회)", {
    path: "/users/stu1/loans/l1", method: "get", as: "stu1",
    before: { amount: 1000000, balance: 1000000 },
  }),
  tc("ALLOW", "🐤 같은 학급 교사가 학생 대출 문서를 정리한다 (관리도구)", {
    path: "/users/stu1/loans/l1", method: "delete", as: "tch1",
    before: { amount: 1000000, balance: 1000000 }, actors: ["stu1"],
  }),

  // 테스트계정 우회 self-grant — 종전엔 문서 아무 필드에나 매직스트링이 있으면 통과였다
  tc("DENY", "학생이 isTestAccount 를 self-grant (매도 1시간 잠금 우회)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, isTestAccount: true },
  }),

  // 🔒 주기작업 멱등 마커 — 학생이 쓸 수 있으면 "이미 처리됨"으로 위장해 스케줄러를 건너뛴다.
  //   특히 세금 마커는 그대로 **세금 회피**가 된다.
  tc("DENY", "학생이 세금 징수 마커를 심어 이번 주 과세를 건너뛴다", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, lastWeeklyTaxWeekKey: "2026-W33" },
  }),
  tc("DENY", "학생이 주급 지급 마커를 조작한다", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: S, after: { ...S, lastSalaryWeekKey: "2026-W33" },
  }),
  tc("DENY", "학생이 주급 실수령액 기록을 위조한다 (회수 로직의 입력값)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, lastNetSalary: 1000 }, after: { ...S, lastNetSalary: 99999999 },
  }),
  // pendingTaxSummary 는 **의도적으로 열어 둔다** — 학생이 주간 세금 팝업을 "확인"으로 닫을 때
  //   본인이 deleteField() 로 지운다(WeeklyTaxSummaryPopup.js). 막으면 팝업이 안 닫힌다.
  //   위조해도 자기 화면 안내 문구가 바뀔 뿐 실제 징수액은 서버가 계산한다.
  tc("ALLOW", "🐤 학생이 세금 안내 팝업을 닫는다 (pendingTaxSummary 정리)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, pendingTaxSummary: { total: 5000 } }, after: S,
  }),

  // 서버가 한도·제한 판정에 쓰는 필드 — 지우거나 위조하면 한도를 우회한다
  tc("DENY", "학생이 추첨 한도 카운터를 지운다 (하루 3회 무한 반복)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, dailySpinCount: 3, dailySpinDate: "2026-08-12" }, after: S,
  }),
  tc("DENY", "학생이 송금수령 시각을 지운다 (24h 대출상환 제한 우회)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, lastIncomingTransferAt: "2026-08-12T00:00:00Z" }, after: S,
  }),
  tc("DENY", "학생이 대출완납 시각을 지운다 (24h 재대출 제한 우회)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, lastLoanRepaidAt: "2026-08-12T00:00:00Z" }, after: S,
  }),
  tc("DENY", "학생이 누적 급여 수령액을 위조한다 (백필 감사로그 오염)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, totalSalaryReceived: 1000 }, after: { ...S, totalSalaryReceived: 999999999 },
  }),

  // 💎 배당 멱등 원장 — 쓰면 지급 스킵(자해), 지우면 재지급(이득). 둘 다 막는다.
  tc("DENY", "학생이 배당 원장을 직접 만든다", {
    path: "/users/stu1/dividendLedger/2026-08", method: "create", as: "stu1",
    after: { monthKey: "2026-08", paid: { stockA: true } },
  }),
  tc("DENY", "학생이 배당 원장을 지워 재지급을 노린다", {
    path: "/users/stu1/dividendLedger/2026-08", method: "delete", as: "stu1",
    before: { monthKey: "2026-08", paid: { stockA: true } },
  }),
  tc("ALLOW", "🐤 학생이 자기 배당 원장을 읽는다 (정상 조회)", {
    path: "/users/stu1/dividendLedger/2026-08", method: "get", as: "stu1",
    before: { monthKey: "2026-08", paid: { stockA: true } },
  }),
  tc("DENY", "학생이 자기 email 을 바꾼다 (구 우회 매칭의 실제 통로였다)", {
    path: "/users/stu1", method: "update", as: "stu1",
    before: { ...S, email: "s1@x.kr" }, after: { ...S, email: "alchan21@x.kr" },
  }),

  // ── H. 2026-08-17 P0-A — "쓰기는 잠그고 읽기는 놔둔" 버그클래스 봉인 ──
  //   2026-07-19 하드닝은 jobs·storeItems·commonTasks 등의 **쓰기**를 resource.data.classCode 로
  //   잠갔지만, 읽기는 `if isSignedIn()` 그대로 두고 주석에 이유를 적어놨다:
  //   "읽기: 로그인한 사용자, classCode 쿼리 허용". 클라이언트 쿼리는 보안 통제가 아니다 —
  //   필터를 빼고 부르면 규칙이 허용하는 전부가 나온다. 아래가 그 회귀를 막는 자물쇠다.
  ...[
    ["jobs", "/jobs/j1", { classCode: "C1", name: "대통령", salary: 5000 }],
    ["storeItems", "/storeItems/i1", { classCode: "C1", name: "간식", price: 100 }],
    ["commonTasks", "/commonTasks/t1", { classCode: "C1", title: "독서" }],
    ["marketListings", "/marketListings/m1", { classCode: "C1", sellerId: "stu1", price: 50 }],
    ["marketOffers", "/marketOffers/o1", { classCode: "C1", buyerId: "stu1", offerPrice: 30 }],
  ].flatMap(([name, path, data]) => [
    tc("DENY", `타 학급 학생이 남의 학급 ${name} 를 읽는다`, {
      path, method: "get", as: "farStu", before: data,
    }),
    tc("ALLOW", `🐤 같은 학급 학생이 ${name} 를 읽는다 (정상 조회)`, {
      path, method: "get", as: "stu1", before: data,
    }),
  ]),
  tc("ALLOW", "🐤 클레임 경로로도 같은 학급 jobs 를 읽는다 (isSameClassFast 단락)", {
    path: "/jobs/j1", method: "get", as: "stu1", token: { classCode: "C1" },
    before: { classCode: "C1", name: "대통령" },
  }),
  tc("DENY", "클레임이 타 학급이면 jobs 읽기가 막힌다", {
    path: "/jobs/j1", method: "get", as: "farStu", token: { classCode: "C2" },
    before: { classCode: "C1", name: "대통령" },
  }),

  // goals 는 **필드가 아니라 문서 ID**(`{classCode}_goal`)로 스코프한다.
  //   필드 기반이면 목표를 아직 안 만든 학급이 getDoc 할 때 resource 가 null 이라
  //   "문서 없음"이 아니라 permission-denied 로 떨어진다.
  // ⚠️ **list(쿼리) 는 이 하네스로 검증할 수 없다.** :test API 에 method:"list" 를 주면
  //   평가할 문서가 없어 `resource.data.*` 가 무조건 오류→거부로 떨어진다. 즉 list DENY 케이스는
  //   전부 "통과"하지만 그건 봉인 때문이 아니라 하네스 때문이다 — 그래서 아예 넣지 않았다
  //   (같은 학급 ALLOW list 카나리아를 넣어보면 똑같이 실패하는 것으로 확인, 2026-08-17).
  //   필터된 쿼리가 실제로 통과한다는 근거는 **프로덕션 선례**다: laws 는 오래전부터
  //   `isSameClassFast(resource.data.classCode)` 규칙이고, OrganizationChart.js:130 이
  //   where("classCode","==",classCode) 로 목록을 정상 조회한다(라이브 기능).
  //   쿼리 단위 검증은 Emulator 기반 테스트로 옮길 때 제대로 붙일 것.
  tc("DENY", "타 학급 학생이 남의 학급 쿠폰 목표를 읽는다", {
    path: "/goals/C1_goal", method: "get", as: "farStu", before: { classCode: "C1", targetAmount: 1000 },
  }),
  tc("ALLOW", "🐤 같은 학급 학생이 자기 학급 쿠폰 목표를 읽는다", {
    path: "/goals/C1_goal", method: "get", as: "stu1", before: { classCode: "C1", targetAmount: 1000 },
  }),
  tc("ALLOW", "🐤 아직 만들지 않은 자기 학급 목표를 읽어도 규칙이 막지 않는다(신규 학급)", {
    path: "/goals/C1_goal", method: "get", as: "stu1",
  }),
  tc("DENY", "classCode 필드만 자기 학급으로 위장한 목표 문서는 못 읽는다(ID 기준)", {
    path: "/goals/C2_goal", method: "get", as: "stu1", before: { classCode: "C1" },
  }),

  tc("ALLOW", "🐤 클레임 경로로도 자기 학급 목표를 읽는다 (token.classCode 단락)", {
    path: "/goals/C1_goal", method: "get", as: "stu1", token: { classCode: "C1" },
    before: { classCode: "C1" },
  }),
  tc("DENY", "클레임이 비었을 때 '_goal' 문서로 우회하지 못한다", {
    path: "/goals/_goal", method: "get", as: "farStu", token: { classCode: "" },
    before: { classCode: "C1" },
  }),
  tc("DENY", "학급코드 없는 계정이 'salarySettings_' 껍데기 문서를 쓴다", {
    path: "/settings/salarySettings_", method: "update", as: "tchNoClass",
    before: { taxRate: 0.1 }, after: { taxRate: 0.9 },
  }),
  tc("DENY", "타 학급 학생이 남의 학급 세율 설정을 읽는다", {
    path: "/taxSettings/C1", method: "get", as: "farStu", before: { netAssetTaxRate: 0.5 },
  }),
  tc("ALLOW", "🐤 같은 학급 학생이 세율 설정을 읽는다", {
    path: "/taxSettings/C1", method: "get", as: "stu1", before: { netAssetTaxRate: 0.5 },
  }),

  // ── I. 2026-08-17 P0-B — 죽은 컬렉션(라이브 문서 0~1건, 코드 참조 0건) 봉인 ──
  //   되살릴 땐 블록을 지우지 말고 스코프를 넣을 것. 지금은 "지뢰"만 제거한 상태다.
  ...[
    ["realEstate", "/realEstate/p1"],
    ["trials", "/trials/tr1"],
    ["learningMaterials", "/learningMaterials/lm1"],
    ["MarketCondition", "/MarketCondition/mc1"],
    ["auctions(top-level)", "/auctions/a1"],
  ].flatMap(([name, path]) => [
    tc("DENY", `학생이 죽은 컬렉션 ${name} 를 읽는다`, {
      path, method: "get", as: "stu1", before: { classCode: "C1" },
    }),
    tc("DENY", `교사도 죽은 컬렉션 ${name} 에 쓸 수 없다`, {
      path, method: "create", as: "tch1", after: { classCode: "C1" },
    }),
  ]),
  tc("DENY", "학생이 죽은 trials 에 문서를 만든다 (구 create: isSignedIn 통로)", {
    path: "/trials/tr2", method: "create", as: "stu1", after: { classCode: "C1" },
  }),

  // ── J. 2026-08-17 P0-C — 전역 설정 쓰기 좁히기 ──
  //   `isAdmin()` 과 3항연산자의 `: true` 분기가 "승인된 교사 = 전국 설정 관리자"를 뜻했다.
  //   전국 개방 시 온보딩 자동화보다 **먼저** 좁혀야 하는 곳.
  tc("DENY", "교사가 전국 스케줄러 방학모드를 끈다 (Settings/scheduler)", {
    path: "/Settings/scheduler", method: "update", as: "tch1",
    before: { vacationMode: true }, after: { vacationMode: false, updatedBy: "tch1" },
  }),
  tc("DENY", "교사가 교사 가입 거부명단을 조작한다 (Settings/rejectedTeachers)", {
    path: "/Settings/rejectedTeachers", method: "update", as: "tch1",
    before: { list: [] }, after: { list: ["x"] },
  }),
  tc("ALLOW", "🐤 슈퍼관리자는 스케줄러 설정을 바꾼다", {
    path: "/Settings/scheduler", method: "update", as: "sup1",
    before: { vacationMode: true }, after: { vacationMode: false },
  }),
  tc("ALLOW", "🐤 학생 접속 하트비트는 그대로 동작한다 (주식 스케줄러 트리거)", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" },
    after: { lastActiveAt: NOW, lastActiveUserId: "stu1" },
  }),
  tc("DENY", "학생이 activeStatus 에 임의 필드를 주입한다", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" },
    after: { lastActiveAt: NOW, lastActiveUserId: "stu1", vacationMode: false },
  }),

  tc("DENY", "교사가 전국 학급코드 목록을 수정한다 (settings/classCodes)", {
    path: "/settings/classCodes", method: "update", as: "tch1",
    before: { validCodes: ["C1"] }, after: { validCodes: ["C1", "C9"] },
  }),
  tc("DENY", "교사가 전국 학급코드 목록을 삭제한다 (전역 DoS)", {
    path: "/settings/classCodes", method: "delete", as: "tch1", before: { validCodes: ["C1"] },
  }),
  tc("ALLOW", "🐤 슈퍼관리자는 학급코드를 추가한다 (UI 도 이미 슈퍼 전용)", {
    path: "/settings/classCodes", method: "update", as: "sup1",
    before: { validCodes: ["C1"] }, after: { validCodes: ["C1", "C9"] },
  }),
  tc("DENY", "교사가 주식거래소 전역 설정을 바꾼다 (settings/stockExchange)", {
    path: "/settings/stockExchange", method: "update", as: "tch1",
    before: { relistPriceMultiplier: 1 }, after: { relistPriceMultiplier: 99 },
  }),
  tc("DENY", "교사가 무접미 salarySettings(전 학급 폴백)를 덮어쓴다", {
    path: "/settings/salarySettings", method: "update", as: "tch1",
    before: { maxJobsPerStudent: 5 }, after: { maxJobsPerStudent: 99 },
  }),
  tc("ALLOW", "🐤 교사가 쿠폰 가치를 저장한다 (settings/mainSettings 정상 기능)", {
    path: "/settings/mainSettings", method: "update", as: "tch1",
    before: { couponValue: 1000 }, after: { couponValue: 2000, updatedAt: NOW },
  }),
  tc("ALLOW", "🐤 교사가 화폐 단위를 저장한다 (settings/mainSettings 정상 기능)", {
    path: "/settings/mainSettings", method: "update", as: "tch1",
    before: { couponValue: 1000 }, after: { couponValue: 1000, currencyUnit: "알", updatedAt: NOW },
  }),
  tc("DENY", "교사가 mainSettings 에 임의 키를 주입한다", {
    path: "/settings/mainSettings", method: "update", as: "tch1",
    before: { couponValue: 1000 }, after: { couponValue: 1000, isSuperAdmin: true },
  }),
  tc("ALLOW", "🐤 교사가 자기 학급 급여설정을 저장한다 (기존 기능 유지)", {
    path: "/settings/salarySettings_C1", method: "update", as: "tch1",
    before: { taxRate: 0.1 }, after: { taxRate: 0.2 },
  }),
  tc("DENY", "교사가 타 학급 급여설정을 저장한다", {
    path: "/settings/salarySettings_C2", method: "update", as: "tch1",
    before: { taxRate: 0.1 }, after: { taxRate: 0.9 },
  }),

  // ── K. 2026-08-17 Gemini 교차검증 반영 ──
  // playlist: 부모 방은 학급 스코프인데 하위 컬렉션만 열려 있었다(서브컬렉션 누락 버그클래스)
  tc("DENY", "타 학급 학생이 남의 학급 음악방 재생목록을 읽는다", {
    path: "/musicRooms/room1/playlist/s1", method: "get", as: "farStu",
    gets: [{ path: "/musicRooms/room1", data: { classCode: "C1", pricePerSong: 0, teacherId: "tch1" } }],
    before: { title: "곡" },
  }),
  tc("DENY", "타 학급 학생이 남의 학급 무료 음악방에 곡을 등록한다 (전국 스팸 통로)", {
    path: "/musicRooms/room1/playlist/s2", method: "create", as: "farStu",
    gets: [{ path: "/musicRooms/room1", data: { classCode: "C1", pricePerSong: 0, teacherId: "tch1" } }],
    after: { videoId: "v", title: "t", paidAmount: 0, requesterId: "farStu" },
  }),
  tc("ALLOW", "🐤 같은 학급 학생이 무료 음악방에 곡을 등록한다 (정상 기능)", {
    path: "/musicRooms/room1/playlist/s3", method: "create", as: "stu1",
    gets: [{ path: "/musicRooms/room1", data: { classCode: "C1", pricePerSong: 0, teacherId: "tch1" } }],
    after: { videoId: "v", title: "t", paidAmount: 0, requesterId: "stu1" },
  }),
  // goals 쓰기 — 읽기는 잠갔는데 create/update/delete 가 학급을 안 봤다
  tc("DENY", "교사가 타 학급 쿠폰 목표를 선점 생성한다", {
    path: "/goals/C2_goal", method: "create", as: "tch1", after: { targetAmount: 1, classCode: "C2" },
  }),
  tc("DENY", "교사가 타 학급 쿠폰 목표를 수정한다", {
    path: "/goals/C2_goal", method: "update", as: "tch1",
    before: { targetAmount: 1000 }, after: { targetAmount: 1 },
  }),
  tc("DENY", "교사가 타 학급 쿠폰 목표를 삭제한다", {
    path: "/goals/C2_goal", method: "delete", as: "tch1", before: { targetAmount: 1000 },
  }),
  tc("ALLOW", "🐤 교사가 자기 학급 쿠폰 목표를 만든다 (정상 기능)", {
    path: "/goals/C1_goal", method: "create", as: "tch1", after: { targetAmount: 1000, classCode: "C1" },
  }),
  // hasOnly 를 update 에선 바뀐 키에만 — 레거시 필드가 있어도 정상 저장돼야 한다
  tc("ALLOW", "🐤 mainSettings 에 레거시 필드가 있어도 쿠폰가치 저장이 된다", {
    path: "/settings/mainSettings", method: "update", as: "tch1",
    before: { couponValue: 1000, legacyField: "옛날필드", createdAt: NOW },
    after: { couponValue: 2000, legacyField: "옛날필드", createdAt: NOW, updatedAt: NOW },
  }),
  tc("DENY", "레거시 필드가 있어도 임의 키 주입은 여전히 막힌다", {
    path: "/settings/mainSettings", method: "update", as: "tch1",
    before: { couponValue: 1000, legacyField: "옛날필드" },
    after: { couponValue: 1000, legacyField: "옛날필드", isSuperAdmin: true },
  }),
  tc("ALLOW", "🐤 activeStatus 에 레거시 필드가 있어도 하트비트가 동작한다", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x", legacyPing: 1 },
    after: { lastActiveAt: NOW, lastActiveUserId: "stu1", legacyPing: 1 },
  }),

  // ── L. 2026-08-17 codex 교차검증 반영 ──
  // hasOnly 는 "이 키들만"이지 "이 키들이 있어야"가 아니다 → 빈 문서 덮어쓰기로 스케줄러 정지
  tc("DENY", "학생이 activeStatus 를 빈 문서로 덮어 주식 시세를 멈춘다", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" }, after: {},
  }),
  tc("DENY", "학생이 activeStatus 의 lastActiveAt 만 지운다", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" }, after: { lastActiveUserId: "stu1" },
  }),
  tc("DENY", "학생이 남의 uid 로 하트비트를 위조한다", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" },
    after: { lastActiveAt: NOW, lastActiveUserId: "stu2" },
  }),
  tc("DENY", "학생이 미래 시각을 박아 스케줄러를 상시 깨운다", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" },
    after: { lastActiveAt: "2099-01-01T00:00:00Z", lastActiveUserId: "stu1" },
  }),
  tc("DENY", "학생이 lastActiveAt 을 문자열로 넣는다 (타입 혼동)", {
    path: "/Settings/activeStatus", method: "update", as: "stu1",
    before: { lastActiveAt: NOW, lastActiveUserId: "x" },
    after: { lastActiveAt: "아무거나", lastActiveUserId: "stu1" },
  }),
  // settings 읽기도 크로스테넌트였다
  tc("DENY", "학생이 타 학급 급여설정(세율·급여상한)을 읽는다", {
    path: "/settings/salarySettings_C2", method: "get", as: "stu1", before: { taxRate: 0.1 },
  }),
  tc("DENY", "학생이 타 학급 메뉴잠금 목록을 읽는다", {
    path: "/settings/menuLocks_C2", method: "get", as: "stu1", before: { lockedItemIds: ["banking"] },
  }),
  tc("ALLOW", "🐤 학생이 자기 학급 메뉴잠금을 읽는다 (사이드바 정상 동작)", {
    path: "/settings/menuLocks_C1", method: "get", as: "stu1", before: { lockedItemIds: [] },
  }),
  tc("ALLOW", "🐤 학생이 화폐단위/쿠폰가치를 읽는다 (전역 공용)", {
    path: "/settings/mainSettings", method: "get", as: "stu1", before: { couponValue: 1000 },
  }),
  tc("ALLOW", "🐤 학생이 학급코드 목록을 읽는다 (가입 시 코드 검증)", {
    path: "/settings/classCodes", method: "get", as: "stu1", before: { validCodes: ["C1"] },
  }),
  // laws 빈 학급코드 스팸
  tc("DENY", "user 문서 없는 계정이 classCode 빈 법안을 만든다 (무스코프 스팸)", {
    path: "/laws/l9", method: "create", as: "ghost", after: { classCode: "", title: "스팸" },
  }),

  // platformApps — 2026-08-17 신설. 전국 사이드바를 좌우하므로 쓰기는 슈퍼관리자만.
  tc("ALLOW", "🐤 학생이 학습앱 레지스트리를 읽는다 (사이드바 목록)", {
    path: "/platformApps/_registry", method: "get", as: "stu1", before: { apps: [] },
  }),
  tc("DENY", "교사가 전국 학습앱 레지스트리를 수정한다", {
    path: "/platformApps/_registry", method: "update", as: "tch1",
    before: { apps: [] }, after: { apps: [{ id: "x", label: "x", url: "https://x/" }] },
  }),
  tc("ALLOW", "🐤 슈퍼관리자가 학습앱 레지스트리를 수정한다", {
    path: "/platformApps/_registry", method: "update", as: "sup1",
    before: { apps: [] }, after: { apps: [{ id: "x", label: "x", url: "https://x/" }] },
  }),

  // menuLocks — 교사 메뉴 잠금. 종전 규칙의 \`: true\` 분기로 **타 학급 것도 쓸 수 있었다**.
  tc("ALLOW", "🐤 교사가 자기 학급 메뉴 잠금을 저장한다 (정상 기능)", {
    path: "/settings/menuLocks_C1", method: "update", as: "tch1",
    before: { lockedItemIds: [] }, after: { lockedItemIds: ["siteArtOn"], classCode: "C1" },
  }),
  tc("ALLOW", "🐤 교사가 자기 학급 메뉴 잠금을 처음 만든다 (문서 부재 → create)", {
    path: "/settings/menuLocks_C1", method: "create", as: "tch1",
    after: { lockedItemIds: ["siteArtOn"], classCode: "C1" },
  }),
  tc("DENY", "교사가 타 학급 메뉴를 임의로 숨긴다 (menuLocks 교차학급)", {
    path: "/settings/menuLocks_C2", method: "update", as: "tch1",
    before: { lockedItemIds: [] }, after: { lockedItemIds: ["banking"], classCode: "C2" },
  }),
  tc("DENY", "교사가 타 학급 메뉴 잠금을 삭제한다", {
    path: "/settings/menuLocks_C2", method: "delete", as: "tch1", before: { lockedItemIds: ["banking"] },
  }),

  // laws — 읽기는 이미 스코프였는데 update/delete 가 학급을 안 봤다(죽은 경로가 아니라 라이브)
  tc("DENY", "교사가 타 학급 법안을 승인한다", {
    path: "/laws/l1", method: "update", as: "tch1",
    before: { classCode: "C2", status: "pending" },
    after: { classCode: "C2", status: "final_approved" },
  }),
  tc("DENY", "교사가 타 학급 법안을 삭제한다", {
    path: "/laws/l1", method: "delete", as: "tch1", before: { classCode: "C2" },
  }),
  tc("DENY", "교사가 자기 학급 법안의 classCode 를 타 학급으로 옮긴다", {
    path: "/laws/l1", method: "update", as: "tch1",
    before: { classCode: "C1", status: "pending" },
    after: { classCode: "C2", status: "pending" },
  }),
  tc("DENY", "교사가 타 학급 이름표로 법안을 만든다", {
    path: "/laws/l2", method: "create", as: "tch1", after: { classCode: "C2", title: "위조법" },
  }),
  tc("ALLOW", "🐤 교사가 자기 학급 법안을 승인한다 (정상 기능)", {
    path: "/laws/l1", method: "update", as: "tch1",
    before: { classCode: "C1", status: "pending" },
    after: { classCode: "C1", status: "final_approved" },
  }),
  tc("ALLOW", "🐤 학생이 자기 학급 법안을 발의한다 (국회 정상 기능)", {
    path: "/laws/l3", method: "create", as: "stu1", after: { classCode: "C1", title: "청소법" },
  }),
];

// ────────────────────────────────────────────────────────────
const token = await accessToken();
// RULES_FILE 로 다른 rules 파일을 겨눌 수 있다 — 배포 전 후보 rules 검증, 그리고
// "봉인을 일부러 되돌린 사본"으로 이 스위트가 실제로 탐지하는지 확인(뮤테이션 검사)할 때 쓴다.
const source = readFileSync(process.env.RULES_FILE || join(ROOT, "firestore.rules"), "utf8");
const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({
    source: { files: [{ name: "firestore.rules", content: source }] },
    testSuite: { testCases: CASES.map(({ __label, ...c }) => c) },
  }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`✗ :test API ${res.status} — ${JSON.stringify(body).slice(0, 500)}`);
  process.exit(1);
}

let failed = 0;
let canaryFailed = 0;
console.log(`\n🔒 firestore.rules 거부 테스트 — ${PROJECT}\n`);
body.testResults.forEach((r, i) => {
  const c = CASES[i];
  // API 의 SUCCESS = "기대와 실제가 일치". 규칙 자체의 에러(잘못된 목 등)도 FAILURE 로 온다.
  const ok = r.state === "SUCCESS";
  const canary = c.expectation === "ALLOW";
  if (!ok) {
    failed++;
    if (canary) canaryFailed++;
  }
  const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} [${c.expectation.padEnd(5)}] ${c.__label}`);
  if (!ok && r.errorPosition) console.log(`        └ firestore.rules:${r.errorPosition.line}`);
});

const passed = CASES.length - failed;
console.log(`\n  ${passed}/${CASES.length} 통과`);
if (canaryFailed > 0) {
  console.log(
    `\n  ⚠️  ALLOW 카나리아 ${canaryFailed}건 실패 = 하네스 형식 문제일 가능성이 높습니다.` +
      `\n     (최상위 resource / request.resource / functionMocks 경로를 먼저 확인)`,
  );
}
console.log("");
process.exit(failed > 0 ? 1 : 0);
