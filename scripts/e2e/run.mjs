// scripts/e2e/run.mjs — 에뮬레이터 위에서 «교사 가입 → 앱 관리자 승인 → 학생 생성 → 화면 순회 + 기능별 실조작»
// 실행 순서는 scripts/e2e/README.md. 개발 모드(vite dev)는 에뮬레이터에 붙으므로 운영 데이터에 닿지 않는다.
//
//   E2E_BASE=http://127.0.0.1:5199 node scripts/e2e/run.mjs [--visit] [--only=board,wall,...] [--shots]
//
// 판정: 화면마다 console.error · pageerror · 4xx/5xx 응답 · «권한» 오류 문구를 모으고,
//       시나리오마다 Firestore 를 직접 읽어 «화면이 한 일»이 실제로 저장됐는지 대조한다.
//       하나라도 어긋나면 종료코드 1, 전부 맞으면 «E2E PASS» 와 함께 0.
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:5199";
const SHOTS = process.argv.includes("--shots");
const VISIT = process.argv.includes("--visit");
const OUT = process.env.E2E_OUT || "/tmp/alchan-e2e";
mkdirSync(OUT, { recursive: true });

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const rcPath = new URL("../../.firebaserc", import.meta.url);
const PROJECT = existsSync(rcPath) ? JSON.parse(readFileSync(rcPath, "utf8")).projects.default : "inconomysu-class";
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const fdb = admin.firestore();

const SUPER = { email: "super@e2e.test", password: "super1234" };
const RUN = Date.now() % 100000;
const TEACHER = { name: "김교사", email: `teacher${RUN}@e2e.test`, password: "teach1234" };

// ── 수집기 ───────────────────────────────────────────────────────────
const findings = [];
const IGNORE = [
  /recaptcha|appcheck|app-check|AppCheck/i, // 개발 모드 App Check 디버그 토큰 교환(운영 백엔드) — 에뮬레이터는 강제 안 함
  /fonts\.(googleapis|gstatic)/i,
  /Download the React DevTools/i,
  /favicon/i,
  /youtube|ytimg|googlevideo/i,
  /firebasestorage|storage\.googleapis/i, // Storage 는 에뮬레이터 밖(운영) — 판정 제외
];
let currentStep = "boot";
const safePath = (page) => { try { return new URL(page.url()).pathname; } catch { return "?"; } };
function attach(page, who) {
  const push = (type, text, extra = {}) => {
    if (IGNORE.some((re) => re.test(text) || re.test(extra.url || ""))) return;
    findings.push({ who, step: currentStep, path: safePath(page), type, text: String(text).slice(0, 500), ...extra });
  };
  page.on("console", (m) => { if (m.type() === "error") push("console.error", m.text(), { url: m.location()?.url || "" }); });
  page.on("pageerror", (e) => push("pageerror", e.message, { stack: (e.stack || "").split("\n").slice(0, 3).join(" | ") }));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && /127\.0\.0\.1|localhost/.test(u)) push("http", `${r.status()} ${r.request().method()} ${u.replace(/\?.*/, "")}`, { url: u });
  });
  page.on("dialog", (d) => { push("native-dialog", d.message()); d.dismiss().catch(() => {}); });
}
const fail = (msg) => { throw new Error(msg); };
const expect = (cond, msg) => { if (!cond) fail(msg); };

const browser = await chromium.launch({ headless: true, args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const SESSIONS = [];
async function newSession(who) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "ko-KR" });
  await ctx.route(/recaptcha|content-firebaseappcheck|firebaseappcheck\.googleapis/, (r) => r.abort());
  const page = await ctx.newPage();
  attach(page, who);
  const sess = { ctx, page, who };
  SESSIONS.push(sess);
  return sess;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Firestore WebChannel 이 늘 열려 있어 networkidle 은 오지 않는다 — DOM 준비 + 로딩 문구가 사라질 때까지만 본다.
async function settle(page, ms = 700) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  for (let i = 0; i < 20; i++) {
    const busy = await page.evaluate(() => /로딩 중|불러오는 중|Loading\.\.\./.test(document.body?.innerText || "")).catch(() => false);
    if (!busy) break;
    await sleep(250);
  }
  await sleep(ms);
}
async function waitFor(fn, { timeout = 10000, every = 300, msg = "조건 시간 초과" } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  fail(`${msg} (${timeout}ms)`);
}
async function confirmModal(page) {
  const host = page.getByTestId("confirm-host");
  await host.waitFor({ timeout: 6000 });
  await sleep(700); // ARM_DELAY — 열리자마자 누르는 클릭은 무시된다
  await host.getByRole("button").filter({ hasNotText: /취소/ }).last().click();
}
// 첫 로그인 팝업(환영·별명·앱 설치·고지서·경제 이벤트)을 사람처럼 닫는다.
async function dismissPopups(page) {
  for (let i = 0; i < 6; i++) {
    const nick = page.getByRole("button", { name: "이걸로 할래요" });
    if (await nick.isVisible().catch(() => false)) {
      const cand = page.locator("div.grid.grid-cols-1.gap-2 > button").first();
      if (!(await cand.isVisible().catch(() => false))) { await sleep(600); continue; }
      await cand.click({ timeout: 4000 }).catch(() => {});
      await nick.click({ timeout: 4000 }).catch(() => {});
      await sleep(800);
      continue;
    }
    // 출석 보상은 «받기»를 눌러 실제 지급(claimDailyReward CF)까지 지나가게 한다 — 그것도 잴 대상이다
    const btn = page.getByRole("button", { name: /^(받기!?.*|오늘은 닫기|나중에|확인했어요 ✓|확인했어요)$/ }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await sleep(900); continue; }
    if (i === 0) { await sleep(900); continue; } // 출석 팝업은 0.5초 늦게 뜬다
    break;
  }
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {}); }
async function go(s, path) { await s.page.goto(`${BASE}${path}`); await settle(s.page); await dismissPopups(s.page); }

async function loginEmail(s, email, password) {
  const page = s.page;
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "선생님" }).first().click();
  await page.getByPlaceholder("이메일을 입력하세요").fill(email);
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(password);
  await page.getByRole("button", { name: /^로그인/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await settle(page);
  await dismissPopups(page);
}
async function loginStudent(s, id, classCode, password) {
  const page = s.page;
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("예: alchan01").fill(id);
  await page.getByPlaceholder("비워도 됩니다").fill(classCode || "");
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(password);
  await page.getByRole("button", { name: /^로그인/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await settle(page);
  await dismissPopups(page);
}

export const ROUTES_COMMON = [
  "/dashboard/tasks", "/my-assets", "/my-profile", "/coupon-goal", "/learning-sites",
  "/item-shop", "/my-items", "/item-market", "/personal-shop", "/group-purchase", "/avatar-shop",
  "/banking", "/stock-trading", "/auction", "/real-estate",
  "/national-tax", "/national-assembly", "/court", "/police", "/organization-chart",
  "/learning-board", "/personal-board", "/learning-board/music-request",
];
export const ROUTES_ADMIN = [
  "/plaza", "/admin/app-settings", "/admin/job-settings", "/admin/class-members", "/admin/coupon-transfer",
  "/admin/money-transfer", "/admin/approvals", "/admin/permissions", "/admin/activity-log",
  "/admin/items", "/admin/learning-apps", "/admin/economic-events", "/admin/students",
];
export const ROUTES_SUPER = ["/super-admin", "/super-admin/avatar-seed"];
const EXPECTED_REDIRECT = { "/admin/items": "/item-shop" };

async function visitAll(s, routes) {
  const rows = [];
  for (const r of routes) {
    currentStep = `visit ${r}`;
    const t0 = Date.now();
    await go(s, r);
    const info = await s.page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(0, 20000), h: document.scrollingElement.scrollHeight, buttons: document.querySelectorAll("button").length }));
    rows.push({ r, ms: Date.now() - t0, landed: info.path, h: info.h, buttons: info.buttons });
    const perm = info.text.match(/.{0,60}(권한이 없|Missing or insufficient permissions|permission-denied).{0,60}/i);
    if (perm) findings.push({ who: s.who, step: currentStep, path: info.path, type: "ui-permission-text", text: perm[0] });
    const err = info.text.match(/.{0,60}(문제가 발생했습니다|Something went wrong|오류가 발생했습니다).{0,80}/);
    if (err) findings.push({ who: s.who, step: currentStep, path: info.path, type: "ui-error-text", text: err[0] });
    if (info.path !== r && EXPECTED_REDIRECT[r] !== info.path) findings.push({ who: s.who, step: currentStep, path: info.path, type: "redirect", text: `${r} → ${info.path}` });
    await shot(s.page, `${s.who}-${r.replace(/\//g, "_")}`);
  }
  return rows;
}

const only = (process.argv.find((a) => a.startsWith("--only="))?.slice(7) || "").split(",").filter(Boolean);
const want = (k) => !only.length || only.includes(k);
const report = { base: BASE, startedAt: new Date().toISOString(), steps: [], notes: [] };
const note = (k, v) => report.notes.push({ k, v });
const step = async (name, fn) => {
  currentStep = name;
  const t0 = Date.now();
  try { const v = await fn(); report.steps.push({ name, ok: true, ms: Date.now() - t0 }); return v; }
  catch (e) {
    for (const ss of SESSIONS) await ss.page.screenshot({ path: `${OUT}/FAIL-${name.replace(/[^\w가-힣]+/g, "_")}-${ss.who}.png` }).catch(() => {});
    report.steps.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message || e).slice(0, 600) });
    findings.push({ who: "runner", step: name, type: "step-failed", text: String(e.message || e).slice(0, 500) });
    return null;
  }
};
const userDoc = async (uid) => (await fdb.doc(`users/${uid}`).get()).data() || {};

// ══ 준비: 교사 가입 → 승인 → 학생 4명 ═════════════════════════════════
const st = { classCode: null, students: [] };
const T = await newSession("teacher");
const SA = await newSession("super");

await step("teacher-register(UI)", async () => {
  const p = T.page;
  await p.goto(`${BASE}/login`);
  await p.getByRole("button", { name: "선생님" }).first().click();
  await p.getByRole("button", { name: /선생님 계정 만들기/ }).click();
  await p.getByPlaceholder("예: 김알찬").fill(TEACHER.name);
  await p.getByPlaceholder("예: teacher@school.com").fill(TEACHER.email);
  await p.getByPlaceholder("6자 이상").fill(TEACHER.password);
  await p.getByPlaceholder("재입력").fill(TEACHER.password);
  await p.locator('form button[type="submit"]').click();
  await p.getByText(/가입 완료/).waitFor({ timeout: 15000 });
});
await step("super-approve(UI)", async () => {
  await loginEmail(SA, SUPER.email, SUPER.password);
  const p = SA.page;
  await go(SA, "/super-admin");
  await p.getByRole("button", { name: /^승인 대기/ }).first().click();
  await settle(p);
  const card = p.locator("div").filter({ hasText: TEACHER.email }).filter({ has: p.getByRole("button", { name: /^승인$/ }) }).last();
  await card.waitFor({ timeout: 10000 });
  await card.getByRole("button", { name: /^승인$/ }).click();
  await confirmModal(p);
  const d = await waitFor(async () => {
    const s = await fdb.collection("users").where("email", "==", TEACHER.email).get();
    const x = s.docs[0]?.data();
    return x?.isApproved && x.classCode && x.classCode !== "미지정" ? { ...x, uid: s.docs[0].id } : null;
  }, { timeout: 15000, msg: "승인 후 학급코드 발급" });
  st.classCode = d.classCode; st.teacherUid = d.uid;
  // 승인 화면은 user 문서 → classes 문서 → 기본값(직업·상점…) 순서로 쓴다 — 마지막 것까지 기다린다
  await waitFor(async () => (await fdb.doc(`bankingSettings/${st.classCode}`).get()).exists, { timeout: 20000, msg: "학급 기본값 시딩" });
  const cls = await fdb.doc(`classes/${st.classCode}`).get();
  const jobs = await fdb.collection("jobs").where("classCode", "==", st.classCode).get();
  const items = await fdb.collection("storeItems").where("classCode", "==", st.classCode).get();
  note("seeded", { class: cls.exists, jobs: jobs.size, storeItems: items.size });
  expect(cls.exists, "classes 문서가 시딩되지 않았다");
});
await step("teacher-login", () => loginEmail(T, TEACHER.email, TEACHER.password));
await step("teacher-add-student(UI)", async () => {
  const p = T.page;
  await go(T, "/admin/students");
  await p.getByRole("button", { name: /학생 추가/ }).first().click();
  await p.getByPlaceholder("홍길동").fill("이학생");
  await p.getByPlaceholder("1").first().fill("1");
  await p.getByPlaceholder("자동 생성됨").fill("pass1111");
  await p.getByText(/개인정보 수집·이용 동의를/).click();
  await p.getByRole("button", { name: /^추가$/ }).last().click();
  await waitFor(async () => (await fdb.collection("users").where("classCode", "==", st.classCode).where("isAdmin", "==", false).get()).size > 0, { msg: "UI 학생 생성" });
});
await step("teacher-bulk-students(CF)", async () => {
  const res = await T.page.evaluate(async ({ code }) => {
    const m = await import("/src/firebase.js");
    const { httpsCallable } = await import("/node_modules/.vite/deps/firebase_functions.js");
    const students = [2, 3, 4].map((n) => ({ name: `학생${n}`, email: `${n}@${code.toLowerCase()}.alchan`, password: `pass${n}${n}${n}${n}`, number: n }));
    return (await httpsCallable(m.functions, "createStudentAccounts")({ students })).data;
  }, { code: st.classCode });
  expect(res?.success?.length === 3, "일괄 생성 실패 " + JSON.stringify(res).slice(0, 200));
});
await step("collect-students", async () => {
  const s = await fdb.collection("users").where("classCode", "==", st.classCode).get();
  st.students = s.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => !u.isAdmin).sort((a, b) => a.studentNumber - b.studentNumber);
  st.students.forEach((x) => { x.id = String(x.studentNumber); x.pw = x.studentNumber === 1 ? "pass1111" : `pass${String(x.studentNumber).repeat(4)}`; });
  expect(st.students.length === 4, "학생 4명이 아니다: " + st.students.length);
});
const S = [];
for (let i = 0; i < 4; i++) {
  const s = await newSession(`student${i + 1}`);
  // 학급코드 없는 로그인(studentLogin CF)은 WEB_API_KEY 로 **운영** identitytoolkit 에 비밀번호를 묻는다 —
  // 에뮬레이터 계정은 거기 없으므로 여기선 학급코드 경로만 잰다(그 CF 는 키가 없으면 fail-closed 로 400 이 정상).
  await step(`student${i + 1}-login`, () => loginStudent(s, st.students[i].id, st.classCode, st.students[i].pw));
  S.push(s);
}

// ══ 화면 순회(선택) ═════════════════════════════════════════════════
if (VISIT) {
  report.superVisits = await step("super-visit", () => visitAll(SA, ROUTES_SUPER));
  report.teacherVisits = await step("teacher-visit", () => visitAll(T, [...ROUTES_COMMON, ...ROUTES_ADMIN]));
  report.studentVisits = await step("student-visit", () => visitAll(S[0], ROUTES_COMMON));
}

// ══ 시나리오: 학습 게시판 ═══════════════════════════════════════════
if (want("board")) {
  const BOARD = "E2E토론";
  let boardId, postId;
  await step("board: 교사 게시판 추가", async () => {
    await go(T, "/learning-board");
    await T.page.getByRole("button", { name: "관리자 열기" }).click();
    await T.page.getByPlaceholder("새 게시판 이름").fill(BOARD);
    await T.page.getByPlaceholder("새 게시판 이름").locator("xpath=ancestor::form[1]").getByRole("button", { name: "추가" }).click();
    const b = await waitFor(async () => (await fdb.collection(`classes/${st.classCode}/learningBoards`).where("name", "==", BOARD).get()).docs[0], { msg: "게시판 생성" });
    boardId = b.id;
  });
  await step("board: 학생1 글쓰기", async () => {
    await go(S[0], `/learning-board?board=${boardId}`);
    await S[0].page.getByRole("button", { name: "글쓰기" }).click();
    await S[0].page.getByPlaceholder("제목을 입력하세요").fill("E2E 첫 글");
    await S[0].page.getByPlaceholder("내용을 입력하세요").fill("에뮬레이터에서 쓴 글입니다.");
    await S[0].page.getByRole("button", { name: "게시하기" }).click();
    const p = await waitFor(async () => (await fdb.collection(`classes/${st.classCode}/learningBoards/${boardId}/posts`).get()).docs[0], { msg: "글 저장" });
    postId = p.id;
    expect(p.data().authorId === st.students[0].uid, "authorId 불일치");
  });
  let c0 = 0;
  await step("board: 작성자 쿠폰 기준값", async () => { c0 = (await userDoc(st.students[0].uid)).coupons; });
  for (const i of [1, 2, 3]) {
    await step(`board: 학생${i + 1} 좋아요`, async () => {
      await go(S[i], `/learning-board?board=${boardId}&post=${postId}`);
      await S[i].page.locator(".lb-like-btn").click();
      await waitFor(async () => ((await fdb.doc(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}`).get()).data().likes || 0) >= i, { msg: "좋아요 저장" });
    });
  }
  await step("board: 좋아요 3개 → 글 쿠폰·작성자 쿠폰 일치", async () => {
    await sleep(1500);
    const post = (await fdb.doc(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}`).get()).data();
    const c1 = (await userDoc(st.students[0].uid)).coupons;
    note("board-like-coupons", { postCoupons: post.coupons, authorBefore: c0, authorAfter: c1 });
    expect(post.likes === 3, `likes=${post.likes}`);
    expect((post.coupons || 0) === c1 - c0, `글에 표시된 쿠폰(${post.coupons})과 작성자가 실제 받은 쿠폰(${c1 - c0})이 다르다`);
  });
  await step("board: 학생2 댓글 → 댓글 쿠폰(CF)", async () => {
    const before = (await userDoc(st.students[1].uid)).coupons;
    await go(S[1], `/learning-board?board=${boardId}&post=${postId}`);
    await S[1].page.getByPlaceholder("댓글을 입력하세요...").fill("좋은 글이에요");
    await S[1].page.getByRole("button", { name: "등록" }).click();
    await waitFor(async () => (await fdb.collection(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}/comments`).get()).size === 1, { msg: "댓글 저장" });
    await waitFor(async () => (await userDoc(st.students[1].uid)).coupons === before + 1, { msg: "댓글 쿠폰 +1" });
    const post = (await fdb.doc(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}`).get()).data();
    expect(post.commentCount === 1, `commentCount=${post.commentCount}`);
  });
  await step("board: 교사 관리자 쿠폰 3개", async () => {
    const before = (await userDoc(st.students[0].uid)).coupons;
    await go(T, `/learning-board?board=${boardId}&post=${postId}`);
    await T.page.getByRole("button", { name: "+3" }).first().click();
    await waitFor(async () => (await userDoc(st.students[0].uid)).coupons === before + 3, { msg: "관리자 쿠폰 +3" });
    const post = (await fdb.doc(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}`).get()).data();
    expect(post.adminCouponGiven === true, "adminCouponGiven 미표시");
  });
  await step("board: 반 친구가 남의 글 likes·제목 직접 쓰기 → 거부(rules)", async () => {
    const r = await S[1].page.evaluate(async ({ code, boardId, postId }) => {
      const m = await import("/src/firebase.js"); // 앱과 같은 SDK 인스턴스(다른 경로로 import 하면 인스턴스가 갈린다)
      const ref = m.doc(m.db, "classes", code, "learningBoards", boardId, "posts", postId);
      const out = {};
      for (const [k, v] of [["likes", { likes: 300 }], ["title", { title: "해킹" }], ["adminCouponGiven", { adminCouponGiven: false }]]) {
        try { await m.updateDoc(ref, v); out[k] = "ALLOWED"; } catch (e) { out[k] = e.code; }
      }
      return out;
    }, { code: st.classCode, boardId, postId });
    note("board-forge", r);
    expect(Object.values(r).every((v) => v === "permission-denied"), "직접 쓰기가 허용됐다 " + JSON.stringify(r));
  });
  await step("board: 학생1 댓글 달린 자기 글 삭제", async () => {
    await go(S[0], `/learning-board?board=${boardId}&post=${postId}`);
    await S[0].page.getByRole("button", { name: "삭제" }).first().click();
    await confirmModal(S[0].page);
    await waitFor(async () => !(await fdb.doc(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}`).get()).exists, { msg: "글 삭제" });
    const left = await fdb.collection(`classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}/comments`).get();
    expect(left.size === 0, `고아 댓글 ${left.size}개`);
  });
}

// ══ 시나리오: 담벼락 ═══════════════════════════════════════════════
if (want("wall")) {
  const wallOf = (i) => `classes/${st.classCode}/personalBoards/${st.students[i].uid}`;
  await step("wall: 학생1 내 판에 글", async () => {
    await go(S[0], "/personal-board");
    await S[0].page.getByPlaceholder(/오늘의 이야기/).fill("담벼락 첫 글");
    await S[0].page.getByRole("button", { name: "담벼락에 올리기" }).click();
    await waitFor(async () => (await fdb.collection(`${wallOf(0)}/posts`).get()).size === 1, { msg: "담벼락 글 저장" });
    const b = (await fdb.doc(wallOf(0)).get()).data();
    expect(b?.lastPostAt, "lastPostAt(교사 새 글 표시)이 안 찍혔다");
  });
  await step("wall: 교사 명단에 «새 글» 표시 → 학급공개로", async () => {
    await go(T, "/personal-board");
    const name = (await fdb.doc(wallOf(0)).get()).data().ownerName;
    const card = T.page.locator("div").filter({ hasText: name }).filter({ has: T.page.getByRole("button", { name: "학급공개로" }) }).last();
    await card.waitFor({ timeout: 8000 });
    const txt = await card.innerText();
    note("wall-teacher-card", txt.replace(/\s+/g, " ").slice(0, 80));
    await card.getByRole("button", { name: "학급공개로" }).click();
    await waitFor(async () => (await fdb.doc(wallOf(0)).get()).data().visibility === "class", { msg: "학급공개 전환" });
  });
  await step("wall: 학생2 학급 담벼락에서 학생1 판에 댓글", async () => {
    await go(S[1], "/personal-board");
    await S[1].page.getByRole("button", { name: "학급 담벼락" }).click();
    await settle(S[1].page);
    const name = (await fdb.doc(wallOf(0)).get()).data().ownerName;
    await S[1].page.getByRole("button", { name: new RegExp(name) }).first().click();
    await settle(S[1].page);
    await S[1].page.getByPlaceholder("댓글 달기").first().fill("멋진 글!");
    await S[1].page.getByPlaceholder("댓글 달기").first().locator("xpath=following::button[1]").click();
    const posts = await fdb.collection(`${wallOf(0)}/posts`).get();
    await waitFor(async () => (await fdb.collection(`${wallOf(0)}/posts/${posts.docs[0].id}/comments`).get()).size === 1, { msg: "담벼락 댓글 저장" });
  });
  await step("wall: 학생3 비공개 판(학생4) 읽기 → 거부(rules)", async () => {
    // 학생4는 판이 없을 수 있다 → 학생3 이 학생1 의 «비공개 전환 전» 상황을 재현할 수 없으니 학생2 판(비공개)을 본다
    await go(S[1], "/personal-board"); // 학생2 판 생성
    await waitFor(async () => (await fdb.doc(wallOf(1)).get()).exists, { msg: "학생2 판 생성" });
    const r = await S[2].page.evaluate(async ({ code, owner }) => {
      const m = await import("/src/firebase.js");
      try { await m.getDocs(m.collection(m.db, "classes", code, "personalBoards", owner, "posts")); return "ALLOWED"; } catch (e) { return e.code; }
    }, { code: st.classCode, owner: st.students[1].uid });
    expect(r === "permission-denied", "비공개 판 글 목록이 읽혔다: " + r);
  });
}

// ══ 시나리오: 돈 — 송금·파킹·상점 ══════════════════════════════════
if (want("money")) {
  await step("money: 학생1 → 학생2 송금 5,000", async () => {
    const a0 = (await userDoc(st.students[0].uid)).cash, b0 = (await userDoc(st.students[1].uid)).cash;
    await go(S[0], "/my-assets");
    await S[0].page.getByRole("button", { name: /송금하기/ }).first().click();
    await S[0].page.locator("select").filter({ has: S[0].page.locator("option", { hasText: "받는 분을 선택하세요" }) }).selectOption(st.students[1].uid);
    await S[0].page.getByPlaceholder("송금할 금액을 입력하세요").fill("5000");
    await S[0].page.getByPlaceholder("송금할 금액을 입력하세요").locator("xpath=ancestor::form[1] | ancestor::div[.//button][1]").last().getByRole("button", { name: /^송금$/ }).click();
    await waitFor(async () => (await userDoc(st.students[1].uid)).cash !== b0, { msg: "받는 쪽 잔액 변화" });
    const a1 = (await userDoc(st.students[0].uid)).cash, b1 = (await userDoc(st.students[1].uid)).cash;
    note("transfer", { sent: a0 - a1, received: b1 - b0 });
    expect(b1 - b0 === 5000, `받은 돈 ${b1 - b0}`);
    expect(a0 - a1 >= 5000, `보낸 돈 ${a0 - a1}`);
    // 거래내역 화면에 같은 송금이 두 줄로 나오지 않는지(원장 이중화)
    await go(S[0], "/my-assets");
    const lines = await S[0].page.evaluate(() => (document.body.innerText.match(/송금/g) || []).length);
    note("transfer-lines-myassets", lines);
  });
  await step("money: 학생1 파킹통장 1,000 입금", async () => {
    const c0 = (await userDoc(st.students[0].uid)).cash;
    await go(S[0], "/banking");
    await S[0].page.getByPlaceholder("금액 입력").first().fill("1000");
    await S[0].page.getByRole("button", { name: /^입금$/ }).first().click();
    await waitFor(async () => (await userDoc(st.students[0].uid)).cash === c0 - 1000, { msg: "파킹 입금 → 현금 −1000" });
  });
  await step("money: 학생1 상점 아이템 1개 구매", async () => {
    const c0 = (await userDoc(st.students[0].uid)).cash;
    await go(S[0], "/item-shop");
    const btn = S[0].page.locator(".buy-item-button:not([disabled])").first();
    await btn.waitFor({ timeout: 8000 });
    await btn.click();
    await settle(S[0].page);
    const inv = await waitFor(async () => { const q = await fdb.collection(`users/${st.students[0].uid}/inventory`).get(); return q.size > 0 ? q : null; }, { msg: "인벤토리 반영" });
    const c1 = (await userDoc(st.students[0].uid)).cash;
    note("shop", { spent: c0 - c1, invDocs: inv.size, item: inv.docs[0].data().name });
    expect(c0 - c1 > 0, "현금이 안 줄었다");
  });
}

// ══ 시나리오: 음악 신청 ═════════════════════════════════════════════
if (want("music")) {
  let roomId;
  await step("music: 교사 유료 방 만들기(500)", async () => {
    await go(T, "/learning-board/music-request");
    await T.page.getByPlaceholder("방 이름을 입력하세요").fill("E2E음악방");
    await T.page.getByPlaceholder("1곡당 가격 (0=무료)").fill("500");
    await T.page.getByRole("button", { name: "방 만들기" }).click();
    const r = await waitFor(async () => (await fdb.collection("musicRooms").where("classCode", "==", st.classCode).get()).docs[0], { msg: "음악방 생성" });
    roomId = r.id;
    expect(r.data().pricePerSong === 500, `가격 ${r.data().pricePerSong}(${typeof r.data().pricePerSong})`);
  });
  await step("music: 학생2 유료 신청 → 학생 −500·교사 +500", async () => {
    const s0 = (await userDoc(st.students[1].uid)).cash, t0 = (await userDoc(st.teacherUid)).cash;
    await go(S[1], `/student-request/${roomId}`);
    await S[1].page.getByRole("button", { name: /URL로 입력/ }).first().click();
    await S[1].page.getByPlaceholder("https://youtu.be/xxxxx 여기에 붙여넣기").fill("https://youtu.be/dQw4w9WgXcQ");
    await S[1].page.getByText("영상 확인됨").waitFor({ timeout: 15000 });
    const nameBox = S[1].page.getByPlaceholder("신청자 이름을 입력하세요");
    if (await nameBox.isVisible().catch(() => false)) await nameBox.fill("학생2");
    await S[1].page.locator("button.request-btn").click();
    await waitFor(async () => (await fdb.collection(`musicRooms/${roomId}/playlist`).get()).size === 1, { msg: "재생목록 등록" });
    const s1 = (await userDoc(st.students[1].uid)).cash, t1 = (await userDoc(st.teacherUid)).cash;
    note("music-pay", { student: s1 - s0, teacher: t1 - t0 });
    expect(s0 - s1 === 500 && t1 - t0 === 500, `학생 ${s1 - s0} · 교사 ${t1 - t0}`);
  });
}

// ══ 시나리오: 할일 → 승인 → 보상·학생 거래내역 ═════════════════════════
if (want("tasks")) {
  let jobId;
  await step("tasks: (교사 배정 대신) 학생3 에게 직업 1개 배정", async () => {
    const jobs = await fdb.collection("jobs").where("classCode", "==", st.classCode).get();
    const j = jobs.docs.find((d) => (d.data().tasks || []).some((t) => t.requiresApproval));
    jobId = j.id;
    await fdb.doc(`users/${st.students[2].uid}`).update({ selectedJobIds: [jobId] });
    note("job", j.data().title);
  });
  await step("tasks: 학생3 할일 → 현금 카드 → 승인 대기", async () => {
    await go(S[2], "/dashboard/tasks");
    await S[2].page.reload(); await settle(S[2].page); await dismissPopups(S[2].page);
    const jt = (await fdb.doc(`jobs/${jobId}`).get()).data().tasks.find((t) => t.requiresApproval);
    await S[2].page.getByTitle(jt.name).first().click();
    await S[2].page.locator("div.fixed").filter({ hasText: "보상 선택" }).getByText("현금", { exact: true }).click();
    await waitFor(async () => (await fdb.collection("pendingApprovals").where("studentId", "==", st.students[2].uid).get()).size === 1, { msg: "승인 대기 생성" });
  });
  await step("tasks: 교사 승인 → 학생 현금 증가 + 학생 거래내역 한 줄", async () => {
    const c0 = (await userDoc(st.students[2].uid)).cash;
    const ap = (await fdb.collection("pendingApprovals").where("studentId", "==", st.students[2].uid).get()).docs[0];
    await go(T, "/admin/approvals");
    await T.page.getByRole("button", { name: /^승인$/ }).first().click();
    await waitFor(async () => (await fdb.doc(`pendingApprovals/${ap.id}`).get()).data().status === "approved", { msg: "승인 처리" });
    const c1 = (await userDoc(st.students[2].uid)).cash;
    const logs = await fdb.collection("activity_logs").where("userId", "==", st.students[2].uid).get();
    const reward = logs.docs.map((d) => d.data()).find((l) => l.metadata?.source === "taskApproval");
    note("task-reward", { cashDelta: c1 - c0, ledger: reward && { amount: reward.amount, desc: reward.description } });
    expect(c1 - c0 === ap.data().rewardAmount, `현금 증가 ${c1 - c0} ≠ 보상 ${ap.data().rewardAmount}`);
    expect(reward && reward.amount === ap.data().rewardAmount, "학생 쪽 거래내역 줄이 없거나 금액이 다르다");
  });
}

report.state = { classCode: st.classCode, students: st.students.map((s) => `${s.id}:${s.uid}`) };
report.findings = findings;
report.finishedAt = new Date().toISOString();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
await browser.close();

console.log(report.steps.map((s) => `${s.ok ? "✅" : "❌"} ${s.name} ${s.ms}ms${s.error ? " — " + s.error.split("\n")[0] : ""}`).join("\n"));
const groups = new Map();
for (const f of findings) { const k = `${f.who} ${f.type} | ${f.text.slice(0, 160)}`; groups.set(k, (groups.get(k) || []).concat(f.path)); }
for (const [k, v] of groups) console.log(`  ${v.length}× ${k} @ ${[...new Set(v)].slice(0, 4).join(",")}`);
console.log(JSON.stringify(report.notes));
console.log(findings.length ? `E2E FAIL findings=${findings.length} (상세 ${OUT}/report.json)` : `E2E PASS console_errors=0 base=${BASE}`);
process.exit(findings.length ? 1 : 0);
