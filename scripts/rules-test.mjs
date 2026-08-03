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
};

/** uid 들의 user 문서를 get()/exists() 목으로 만든다. */
const mocks = (...uids) =>
  uids.flatMap((uid) => [
    {
      function: "get",
      args: [{ exactValue: `${DB}/users/${uid}` }],
      result: { value: { data: DOCS[uid] } },
    },
    { function: "exists", args: [{ exactValue: `${DB}/users/${uid}` }], result: { value: true } },
  ]);

const auth = (uid, token = {}) => ({ uid, token });

/**
 * @param expect "ALLOW" | "DENY"
 * @param opts.before 기존 문서 data (update/delete 용) — 최상위 resource
 * @param opts.after  쓰려는 문서 data (create/update 용) — request.resource
 */
function tc(expect, label, { path, method, as, before, after, token, actors = [] }) {
  const request = { auth: auth(as, token), path: `${DB}${path}`, method, time: NOW };
  if (after) request.resource = { __name__: `${DB}${path}`, data: after };
  const c = {
    __label: label,
    expectation: expect,
    request,
    functionMocks: mocks(as, ...actors),
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
