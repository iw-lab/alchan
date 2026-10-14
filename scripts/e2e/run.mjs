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
// 퍼징처럼 «거부가 정답»인 구간 — 그동안의 4xx 응답(과 그 콘솔 줄)은 결함이 아니다. 5xx·페이지 오류는 그대로 잡는다.
let expectRejections = false;
const safePath = (page) => { try { return new URL(page.url()).pathname; } catch { return "?"; } };
function attach(page, who) {
  const push = (type, text, extra = {}) => {
    if (IGNORE.some((re) => re.test(text) || re.test(extra.url || ""))) return;
    if (expectRejections && ((type === "http" && /^4\d\d /.test(text)) || (type === "console.error" && /status of 4\d\d/.test(text)))) return;
    findings.push({ who, step: currentStep, path: safePath(page), type, text: String(text).slice(0, 500), ...extra });
  };
  page.on("console", (m) => { if (m.type() === "error") push("console.error", m.text(), { url: m.location()?.url || "" }); });
  page.on("pageerror", (e) => push("pageerror", e.message, { stack: (e.stack || "").split("\n").slice(0, 3).join(" | ") }));
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && /127\.0\.0\.1|localhost/.test(u)) push("http", `${r.status()} ${r.request().method()} ${u.replace(/\?.*/, "")}`, { url: u });
  });
  page.on("dialog", (d) => { push("native-dialog", d.message()); d.dismiss().catch(() => {}); });
  // 진행 중인 CF 호출 — 화면을 떠나기 전에 응답을 기다린다(사람도 결과를 보고 넘어간다).
  // 안 기다리면 page.goto 가 fetch 를 끊고, SDK 는 그걸 «internal» 로 보고한다(하네스가 만든 가짜 오류).
  page._inflightCalls = new Set();
  const isCall = (r) => /:5001\//.test(r.url()) && r.method() === "POST";
  page.on("request", (r) => { if (isCall(r)) page._inflightCalls.add(r); });
  page.on("requestfinished", (r) => page._inflightCalls.delete(r));
  page.on("requestfailed", (r) => page._inflightCalls.delete(r));
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
async function drainCalls(page, timeout = 15000) {
  const t0 = Date.now();
  while (page._inflightCalls?.size && Date.now() - t0 < timeout) await sleep(100);
}
async function go(s, path) { await drainCalls(s.page); await s.page.goto(`${BASE}${path}`); await settle(s.page); await dismissPopups(s.page); }

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

// 위조 쓰기(rules 거부 확인)는 앱 SDK 가 아니라 **학생 ID 토큰 + Firestore REST** 로 보낸다.
//   앱 페이지에서 SDK 로 거부될 쓰기를 연달아 보내면 에뮬레이터 응답에 버전이 빠져 SDK 가
//   «INTERNAL ASSERTION FAILED (ID: c050)» 로 멈추고 그 페이지가 10분 넘게 굳었다(2026-10-14 전체 실행).
//   rules 판정은 경로와 무관하게 같다 — 시험이 앱 상태를 흔들지 않게 분리한다.
const FS_DB = "projects/inconomysu-class/databases/(default)";
const restVal = (v) => (typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "boolean" ? { booleanValue: v } : v === null ? { nullValue: null } : { stringValue: String(v) });
async function forge(sess, docPath, data, inc = {}) {
  const tk = await sess.page.evaluate(async () => (await import("/src/firebase.js")).auth.currentUser.getIdToken());
  const fields = {};
  const mask = [];
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split(".");
    mask.push(parts.map((p) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(p) ? p : "`" + p + "`")).join("."));
    let cur = fields;
    for (const p of parts.slice(0, -1)) { cur[p] ??= { mapValue: { fields: {} } }; cur = cur[p].mapValue.fields; }
    cur[parts.at(-1)] = restVal(v);
  }
  const write = { update: { name: `${FS_DB}/documents/${docPath}`, fields }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } };
  const incs = Object.entries(inc);
  if (incs.length) write.updateTransforms = incs.map(([k, n]) => ({ fieldPath: k, increment: restVal(n) }));
  const r = await fetch(`http://127.0.0.1:8080/v1/${FS_DB}/documents:commit`, {
    method: "POST", headers: { authorization: `Bearer ${tk}`, "content-type": "application/json" }, body: JSON.stringify({ writes: [write] }),
  });
  if (r.ok) return "ALLOWED";
  const j = await r.json().catch(() => ({}));
  return j.error?.status === "PERMISSION_DENIED" ? "permission-denied" : `http-${r.status}:${j.error?.status || ""}`;
}

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
    const p = `classes/${st.classCode}/learningBoards/${boardId}/posts/${postId}`;
    const r = {};
    for (const [k, v] of [["likes", { likes: 300 }], ["title", { title: "해킹" }], ["adminCouponGiven", { adminCouponGiven: false }]]) r[k] = await forge(S[1], p, v);
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

// ══ 시나리오: 국회 법안 ═════════════════════════════════════════════
if (want("assembly")) {
  let lawId;
  const lawsCol = () => `classes/${st.classCode}/nationalAssemblyLaws`;
  // 새 반엔 국회 설정 문서가 없다(교사가 국회를 한 번 열어야 생긴다) — 학생이 먼저 열면 전엔 학생의 기본값
  //   쓰기가 rules 에 막히고(설정 쓰기는 교사만), 그 실패로 설정이 null 로 남아 **무한 로딩**이었다.
  await step("assembly: 설정 문서 없는 반 — 학생이 먼저 열어도 화면이 뜬다", async () => {
    // --visit 순회에서 교사가 먼저 국회를 열면 문서가 생긴다 — 교사가 한 번도 안 연 반으로 되돌린다
    for (const id of ["admin", "government"]) await fdb.doc(`classes/${st.classCode}/nationalAssemblySettings/${id}`).delete();
    await go(S[1], "/national-assembly");
    await S[1].page.getByRole("heading", { name: "국회 의사당" }).waitFor({ timeout: 10000 });
  });
  // 3명 반으로 둔다 — 과반(절반 초과) = 2표. (학생1·3 찬성, 학생2 반대 흐름)
  await fdb.doc(`classes/${st.classCode}/nationalAssemblySettings/admin`).set({ totalStudents: 3 });
  await step("assembly: 교사 법안 제안(벌금 3,000)", async () => {
    await go(T, "/national-assembly");
    await T.page.getByRole("button", { name: "새 법안 제안하기" }).click();
    await T.page.getByPlaceholder("법안의 제목을 입력하세요").fill("복도에서 뛰지 않기");
    await T.page.getByPlaceholder("법안의 취지를 간략히 설명하세요").fill("안전");
    await T.page.getByPlaceholder("법안에 대한 자세한 설명을 작성하세요").fill("복도에서 뛰면 벌금");
    await T.page.getByPlaceholder(/위반 시 벌금/).fill("3000");
    await T.page.getByRole("button", { name: /^제안하기$/ }).click();
    const d = await waitFor(async () => (await fdb.collection(lawsCol()).get()).docs[0], { msg: "법안 저장" });
    lawId = d.id;
  });
  await step("assembly: 학생1 찬성 투표", async () => {
    await go(S[0], "/national-assembly");
    await S[0].page.locator(".vote-button.approve").first().click();
    await waitFor(async () => { const x = (await fdb.doc(`${lawsCol()}/${lawId}`).get()).data(); return x.approvals === 1 && x.voters?.[st.students[0].uid] === "approvals"; }, { msg: "찬성 1·voters 기록" });
  });
  await step("assembly: 반 친구가 벌금액·남의 표 직접 쓰기 → 거부(rules)", async () => {
    const p = `${lawsCol()}/${lawId}`;
    const r = {};
    for (const [k, v] of [["fine", { fine: "999999" }], ["otherVoter", { [`voters.${st.students[2].uid}`]: "disapprovals" }], ["proposer", { proposerId: "x" }], ["inflate", { approvals: 999 }]]) r[k] = await forge(S[1], p, v);
    note("assembly-forge", r);
    expect(Object.values(r).every((v) => v === "permission-denied"), "직접 쓰기가 허용됐다 " + JSON.stringify(r));
  });
  await step("assembly: 학생2 반대 투표(정상 경로는 그대로)", async () => {
    await go(S[1], "/national-assembly");
    await S[1].page.locator(".vote-button.disapprove, .vote-button.reject").first().click();
    await waitFor(async () => (await fdb.doc(`${lawsCol()}/${lawId}`).get()).data().disapprovals === 1, { msg: "반대 1" });
  });
  const lawNow = async () => (await fdb.doc(`${lawsCol()}/${lawId}`).get()).data();
  await step("assembly: 표수 없이 상태만 바꾸기·중복 표 → 거부(rules)", async () => {
    const p = `${lawsCol()}/${lawId}`;
    const r = {
      skipToGov: await forge(S[0], p, { status: "pending_government_approval" }),
      skipToApproved: await forge(S[0], p, { status: "approved" }),
      doubleVote: await forge(S[0], p, {}, { approvals: 1 }),
      plantFinal: await forge(S[0], p, { finalStatus: "final_approved" }), // 경찰서는 이 값으로 «가결된 법»을 고른다
    };
    note("assembly-forge2", r);
    expect(Object.values(r).every((v) => v === "permission-denied"), "표수 근거 없는 쓰기가 허용됐다 " + JSON.stringify(r));
  });
  await step("assembly: 학생3 찬성 → 정부 이송(3명 반 과반 2표)", async () => {
    await go(S[2], "/national-assembly");
    await S[2].page.locator(".vote-button.approve").first().click();
    await waitFor(async () => (await lawNow()).status === "pending_government_approval", { msg: "정부 이송" });
  });
  await step("assembly: 대통령(학생4) 거부권 행사(UI)", async () => {
    const jobs = await fdb.collection("jobs").where("classCode", "==", st.classCode).get();
    let pres = jobs.docs.find((d) => d.data().title === "대통령");
    if (!pres) pres = await fdb.collection("jobs").add({ title: "대통령", classCode: st.classCode, salary: 0, tasks: [] });
    await fdb.doc(`users/${st.students[3].uid}`).update({ appointedJobIds: [pres.id] });
    // 대통령 아닌 학생이 대통령 직업 id 를 대며 승인 → rules 거부
    const fake = await forge(S[1], `${lawsCol()}/${lawId}`, { status: "approved", presidentJobId: pres.id });
    note("assembly-fake-president", fake);
    expect(fake === "permission-denied", "대통령 아닌 학생의 승인이 허용됐다 " + fake);
    await go(S[3], "/organization-chart");
    await S[3].page.getByText("대통령 권한").first().waitFor({ timeout: 15000 });
    await S[3].page.locator(".law-approval-section .veto-button").first().click();
    const dlg = S[3].page.getByRole("dialog", { name: "입력" });
    await dlg.locator("textarea").fill("벌금이 너무 큽니다");
    await dlg.getByRole("button", { name: "거부권 행사" }).click();
    await waitFor(async () => { const x = await lawNow(); return x.status === "vetoed" && x.approvals === 0 && Object.keys(x.voters || {}).length === 0; }, { msg: "vetoed + 초기화" });
  });
  await step("assembly: 대통령실 재의결 목록에 보임 + 남은 시간 정상", async () => {
    await go(S[3], "/organization-chart");
    const sec = S[3].page.locator(".vetoed-laws-section");
    await sec.getByText("복도에서 뛰지 않기").waitFor({ timeout: 15000 });
    const txt = await sec.innerText();
    expect(!/NaN/.test(txt) && /남음/.test(txt), "남은 시간 표시 이상: " + txt.slice(0, 200));
  });
  await step("assembly: 교사 대통령실 설정 → 재의결 정족수 2", async () => {
    await go(T, "/organization-chart");
    await T.page.locator(".settings-button").click();
    await T.page.locator(".modal-container input[type=number]").fill("2");
    await T.page.getByRole("button", { name: "저장" }).click();
    await waitFor(async () => (await fdb.doc(`classes/${st.classCode}/nationalAssemblySettings/government`).get()).data()?.vetoOverrideRequired === 2, { msg: "국회 판정 문서에 저장" });
  });
  await step("assembly: 1차 찬성자(학생1·3)가 재의결 찬성 → veto_overridden", async () => {
    for (const i of [0, 2]) {
      await go(S[i], "/national-assembly");
      await S[i].page.getByRole("button", { name: "재의결 법안" }).click();
      const btn = S[i].page.getByRole("button", { name: "재의결 찬성" }).first();
      expect(await btn.isEnabled(), `학생${i + 1} 재의결 찬성 버튼이 막혀 있다`);
      await btn.click();
      await waitFor(async () => !!(await lawNow()).voters?.[st.students[i].uid], { msg: `학생${i + 1} 재의결 표` });
    }
    await waitFor(async () => (await lawNow()).status === "veto_overridden", { msg: "재의결 가결" });
  });
  // 교사 «수정»은 고친 칸만 써야 한다 — 전엔 화면 사본을 통째로 써서 날짜가 문자열로, 표·상태가 화면을 연
  //   시점 값으로 되돌아갔다(가결된 법이 심의중으로 돌아갈 수 있었다).
  await step("assembly: 교사가 가결된 법 제목 수정 → 표·상태·날짜 형식 보존", async () => {
    const before = await lawNow();
    await go(T, "/national-assembly");
    await T.page.getByRole("button", { name: "우리반 법" }).click();
    await T.page.getByRole("button", { name: "수정", exact: true }).first().click();
    const title = T.page.locator(".modal-container .form-input").first();
    await title.fill("복도에서 걷기");
    await T.page.getByRole("button", { name: "저장하기" }).click();
    await waitFor(async () => (await lawNow()).title === "복도에서 걷기", { msg: "제목 수정 반영" });
    const raw = (await fdb.doc(`${lawsCol()}/${lawId}`).get()).data();
    expect(raw.status === before.status && raw.finalStatus === "final_approved", `상태가 바뀜 ${raw.status}/${raw.finalStatus}`);
    expect(raw.approvals === before.approvals && JSON.stringify(raw.voters) === JSON.stringify(before.voters), "표가 바뀜");
    for (const k of ["timestamp", "vetoDate", "finalApprovalDate"]) {
      expect(raw[k] && typeof raw[k].toDate === "function", `${k} 가 Timestamp 가 아님(${typeof raw[k]})`);
    }
    expect(!("id" in raw), "문서에 id 필드가 새로 생김");
  });
  // 재의결 기한(거부 시각 + 7일)이 지나면 폐기 — 화면은 즉시 폐기로, rules 는 표 거부, 0시 스케줄러가 상태 확정
  await step("assembly: 재의결 기한 지난 법 → 폐기(화면·rules·스케줄러)", async () => {
    const { expireVetoedLaws } = require("./vetoExpiry.js");
    const eightDaysAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const ref = await fdb.collection(lawsCol()).add({
      title: "급식 남기면 벌금", purpose: "잔반", description: "남기면 벌금", fine: "1000",
      proposerId: st.students[0].uid, proposerName: "학생1", classCode: st.classCode,
      approvals: 0, disapprovals: 0, voters: {}, status: "vetoed", vetoReason: "과하다",
      vetoDate: eightDaysAgo, timestamp: eightDaysAgo,
    });
    await go(S[0], "/national-assembly");
    await S[0].page.getByRole("button", { name: "재의결 법안" }).click();
    const card = S[0].page.locator(".law-card.discarded", { hasText: "급식 남기면 벌금" });
    await card.waitFor({ timeout: 10000 });
    expect(await card.getByText("폐기 (재의결 기한 만료)").isVisible(), "폐기 표시 없음");
    expect((await card.getByRole("button", { name: "재의결 찬성" }).count()) === 0, "폐기된 법에 재의결 찬성 버튼이 있다");
    const forged = await forge(S[0], `${lawsCol()}/${ref.id}`, { [`voters.${st.students[0].uid}`]: "approvals" }, { approvals: 1 });
    expect(forged === "permission-denied", "기한 지난 재의결 표가 허용됐다: " + forged);
    const res = await expireVetoedLaws(fdb); // hourlySchedulerV2 가 0시에 부르는 함수 그대로
    note("veto-expire", res);
    const after = (await ref.get()).data();
    expect(after.status === "veto_expired" && !!after.vetoExpiredAt, "폐기 상태 확정 안 됨: " + after.status);
    await go(S[3], "/organization-chart");
    const sec = S[3].page.locator(".vetoed-laws-section");
    await sec.waitFor({ timeout: 10000 });
    expect(!(await sec.innerText()).includes("급식 남기면 벌금"), "대통령실 «재의결 진행 중»에 폐기된 법이 보인다");
  });
}

// ══ 시나리오: 쿠폰 응모·판매 ═══════════════════════════════════════
if (want("coupon")) {
  const A = st.students[0];
  let teacherUid;
  await step("coupon: 준비(쿠폰 20)", async () => {
    await fdb.doc(`users/${A.uid}`).update({ coupons: 20 });
    teacherUid = (await fdb.collection("users").where("classCode", "==", st.classCode).where("isAdmin", "==", true).get()).docs[0]?.id;
    expect(!!teacherUid, "교사 문서 없음");
  });
  await step("coupon: 응모 3장(UI) → 쿠폰 −3 · 목표 +3 · 교사 현금 +3×쿠폰가", async () => {
    const goalRef = fdb.doc(`goals/${st.classCode}_goal`);
    const g0 = (await goalRef.get()).data()?.progress || 0;
    const t0 = (await userDoc(teacherUid)).cash || 0;
    await go(S[0], "/coupon-goal");
    await S[0].page.getByRole("button", { name: "쿠폰 응모" }).click();
    await S[0].page.getByPlaceholder("응모할 쿠폰 수량을 입력하세요").fill("3");
    await S[0].page.getByRole("button", { name: "응모하기" }).click();
    await waitFor(async () => (await userDoc(A.uid)).coupons === 17, { msg: "쿠폰 17" });
    await waitFor(async () => ((await goalRef.get()).data()?.progress || 0) === g0 + 3, { msg: "목표 +3" });
    const dt = ((await userDoc(teacherUid)).cash || 0) - t0;
    note("coupon-donate-teacher-cash", dt);
    expect(dt > 0 && dt % 3 === 0, "교사 현금 증가가 3의 배수가 아님 " + dt);
  });
  await step("coupon: 판매 2장(UI) → 쿠폰 −2 · 현금 +", async () => {
    const c0 = (await userDoc(A.uid)).cash || 0;
    await go(S[0], "/coupon-goal");
    await S[0].page.getByRole("button", { name: "쿠폰 판매" }).click();
    await S[0].page.locator("input[type=number]").last().fill("2");
    await S[0].page.getByRole("button", { name: "판매하기" }).click();
    await waitFor(async () => (await userDoc(A.uid)).coupons === 15, { msg: "쿠폰 15" });
    const dc = ((await userDoc(A.uid)).cash || 0) - c0;
    note("coupon-sell-cash", dc);
    expect(dc > 0, "판매 대금 미입금");
  });
}

// ══ 시나리오: 경매 (등록 → 입찰 → 상향 입찰 환불 → 정산) ═══════════════
//   돈 보존: 판매자 +(낙찰가−세금), 교사 +세금, 낙찰자 −낙찰가, 밀려난 입찰자 ±0
if (want("auction")) {
  const [A, B, C] = st.students;
  const auctionsCol = () => fdb.collection(`classes/${st.classCode}/auctions`);
  let auctionId, teacherUid, itemId;
  const cash = async (uid) => (await userDoc(uid)).cash || 0;
  await step("auction: 준비(현금 지급 · 판매자 아이템 구매)", async () => {
    for (const u of [A, B, C]) await fdb.doc(`users/${u.uid}`).update({ cash: 100000 });
    teacherUid = (await fdb.collection("users").where("classCode", "==", st.classCode).where("isAdmin", "==", true).get()).docs[0]?.id;
    // 실제 상점 화면으로 산다 — 자기 구매는 화면이 아이템 목록을 직접 갱신한다(CF 직접 호출은 그 갱신을 건너뛴다)
    //   앞 시나리오가 이미 아이템을 넣어 뒀을 수 있다 — «있음»이 아니라 «수량이 늘었음»을 기다린다
    //   (안 그러면 구매가 다음 단계의 측정 구간 안에서 끝나 돈 보존 계산이 어긋난다).
    const invTotal = async () => (await fdb.collection(`users/${A.uid}/inventory`).get()).docs.reduce((n, d) => n + (d.data().quantity || 0), 0);
    const q0 = await invTotal();
    await go(S[0], "/item-shop");
    await S[0].page.locator(".buy-item-button:not([disabled])").first().click();
    await waitFor(async () => (await invTotal()) > q0, { msg: "인벤토리 수량 증가" });
    await settle(S[0].page);
    const inv = await fdb.collection(`users/${A.uid}/inventory`).get();
    itemId = inv.docs.find((d) => (d.data().quantity || 0) > 0)?.data().itemId || inv.docs[0].id;
  });
  const base = {};
  await step("auction: 판매자 경매 등록(UI, 시작가 100)", async () => {
    for (const u of [A, B, C]) base[u.uid] = await cash(u.uid);
    base.teacher = await cash(teacherUid);
    await go(S[0], "/auction");
    await S[0].page.getByRole("button", { name: "경매 등록", exact: true }).first().click();
    const sel = S[0].page.locator("#auctionAssetSelect");
    const val = await sel.locator("option").nth(1).getAttribute("value");
    // 아이템 선택과 시작가 입력을 **한 작업 안에서** 보낸다 — 선택 효과가 돌기 전에 입력이 도착하는 최악의
    //   타이밍을 결정적으로 만든다(전엔 묵은 상태를 펼친 입력이 선택을 지워 간헐적으로 등록이 막혔다).
    await S[0].page.evaluate((v) => {
      const setVal = (el, x) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, x);
      const s = document.querySelector("#auctionAssetSelect");
      setVal(s, v);
      s.dispatchEvent(new Event("change", { bubbles: true }));
      const p = document.querySelector("#startPrice");
      setVal(p, "100");
      p.dispatchEvent(new Event("input", { bubbles: true }));
      const t = document.querySelector("#description");
      setVal(t, "직접 쓴 설명");
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }, val);
    await S[0].page.locator("button.register-button").click();
    const d = await waitFor(async () => (await auctionsCol().where("seller", "==", A.uid).get()).docs[0], { msg: "경매 문서" });
    expect(d.data().description === "직접 쓴 설명", `직접 쓴 설명이 덮였다: «${d.data().description}»`);
    auctionId = d.id;
  });
  await step("auction: 학생2 150 입찰 → 학생3 200 상향 → 학생2 환불", async () => {
    for (const [i, amt] of [[1, 150], [2, 200]]) {
      await go(S[i], "/auction");
      await S[i].page.locator(".bid-input").first().fill(String(amt));
      await S[i].page.locator(".bid-button").first().click();
      await waitFor(async () => (await auctionsCol().doc(auctionId).get()).data().currentBid === amt, { msg: `현재가 ${amt}` });
    }
    await waitFor(async () => (await cash(B.uid)) === base[B.uid], { msg: "밀려난 입찰자 환불" });
    expect((await cash(C.uid)) === base[C.uid] - 200, "최고 입찰자 에스크로 −200 아님");
  });
  await step("auction: 기한 경과 → 두 화면이 동시에 정산(멱등) → 돈 보존", async () => {
    await auctionsCol().doc(auctionId).update({ endTime: new Date(Date.now() - 1000) });
    // 종료된 경매를 여러 학생이 동시에 열면 모두 정산을 부른다 — 409 없이 한 번만 정산돼야 한다
    await Promise.all([go(S[1], "/auction"), go(S[2], "/auction")]);
    await waitFor(async () => (await auctionsCol().doc(auctionId).get()).data().status !== "ongoing", { timeout: 20000, msg: "정산" });
    const dA = (await cash(A.uid)) - base[A.uid], dB = (await cash(B.uid)) - base[B.uid], dC = (await cash(C.uid)) - base[C.uid], dT = (await cash(teacherUid)) - base.teacher;
    note("auction-deltas", { dA, dB, dC, dT });
    expect(dC === -200 && dB === 0 && dA > 0 && dA + dT === 200, `돈 보존 실패 ${JSON.stringify({ dA, dB, dC, dT })}`);
    const inv = await fdb.collection(`users/${C.uid}/inventory`).get();
    expect(inv.docs.some((d) => (d.data().itemId || d.id) === itemId && (d.data().quantity || 0) >= 1), "낙찰자에게 아이템 미지급");
  });
}

// ══ 시나리오: 개인상점 (상점 개설 → 상품 등록 → 다른 학생 구매) ═══════════
//   돈 보존: 구매자 −(가격+부가세), 판매자 +가격, 교사(학급 금고) +부가세 · 국고 문서엔 vatRevenue 통계만
if (want("shop")) {
  const [A, B] = st.students;
  const cash = async (uid) => (await userDoc(uid)).cash || 0;
  let productId;
  await step("shop: 학생1 상점 개설·상품 등록(UI, 500 × 재고 3)", async () => {
    for (const u of [A, B]) await fdb.doc(`users/${u.uid}`).update({ cash: 100000 });
    await go(S[0], "/personal-shop");
    await S[0].page.getByRole("button", { name: /내 상점/ }).click();
    await S[0].page.getByRole("button", { name: /상점 만들기/ }).click();
    await S[0].page.getByPlaceholder("예: 민수네 간식가게").fill("일번 가게");
    await S[0].page.getByRole("button", { name: "만들기", exact: true }).click();
    await waitFor(async () => (await fdb.collection("personalShops").where("ownerId", "==", A.uid).get()).size === 1, { msg: "상점 문서" });
    await S[0].page.getByRole("button", { name: /등록하기/ }).first().click();
    await S[0].page.getByPlaceholder("예: 수제 쿠키").fill("연필");
    const nums = S[0].page.locator(".modal-content input[type=number], [role=dialog] input[type=number], form input[type=number]");
    await nums.nth(0).fill("500");
    await nums.nth(1).fill("3");
    await S[0].page.getByRole("button", { name: "등록하기", exact: true }).last().click();
    const p = await waitFor(async () => (await fdb.collection("shopProducts").where("ownerId", "==", A.uid).get()).docs[0], { msg: "상품 문서" });
    productId = p.id;
    expect(p.data().classCode === st.classCode && p.data().price === 500, "상품 학급·가격 이상 " + JSON.stringify(p.data()));
  });
  await step("shop: 학생2 구매(UI) → 돈 보존", async () => {
    const teacherUid = (await fdb.collection("users").where("classCode", "==", st.classCode).where("isAdmin", "==", true).get()).docs[0].id;
    const a0 = await cash(A.uid), b0 = await cash(B.uid), t0 = await cash(teacherUid);
    const tRef = fdb.doc(`nationalTreasuries/${st.classCode}`);
    const v0 = (await tRef.get()).data()?.vatRevenue || 0;
    await go(S[1], "/personal-shop");
    await S[1].page.locator(".shop-card", { hasText: "일번 가게" }).first().click();
    await S[1].page.getByRole("button", { name: /구매하기/ }).first().click();
    await S[1].page.getByRole("button", { name: "구매하기", exact: true }).last().click();
    await waitFor(async () => (await cash(A.uid)) !== a0, { msg: "판매자 입금" });
    const dA = (await cash(A.uid)) - a0, dB = (await cash(B.uid)) - b0, dT = (await cash(teacherUid)) - t0;
    const dV = ((await tRef.get()).data()?.vatRevenue || 0) - v0;
    note("shop-deltas", { dA, dB, dT, dV });
    expect(dA === 500 && dB === -(500 + dT) && dT > 0 && dV === dT, "돈 보존 실패 " + JSON.stringify({ dA, dB, dT, dV }));
    expect((await fdb.doc(`shopProducts/${productId}`).get()).data().stock === 2, "재고 3→2 아님");
  });
}

// ══ 시나리오: 돈 CF 악성 입력 퍼징 ═════════════════════════════════
//   불변식 ① 거부된 호출은 아무것도 바꾸지 않는다(학급 전원 숫자 필드·국고·인벤토리 스냅샷 동일)
//          ② 양의 정수가 아닌 금액·수량으로 성공하면 결함
if (want("fuzz")) {
  const A = st.students[0], B = st.students[1];
  const callAs = (i, name, data) => S[i].page.evaluate(async ({ name, data }) => {
    const m = await import("/src/firebase.js");
    try { const r = await m.httpsCallable(m.functions, name)(data); return { ok: true, data: r.data }; }
    catch (e) { return { ok: false, code: e.code, msg: String(e.message).slice(0, 120) }; }
  }, { name, data });
  const nums = (x) => Object.fromEntries(Object.entries(x || {}).filter(([, v]) => typeof v === "number").sort());
  const snap = async () => {
    const o = {};
    for (const d of (await fdb.collection("users").where("classCode", "==", st.classCode).get()).docs) o[d.id] = nums(d.data());
    const t = await fdb.doc(`nationalTreasuries/${st.classCode}`).get();
    o.treasury = t.exists ? nums(t.data()) : null;
    for (const u of [A.uid, B.uid]) {
      o["inv:" + u] = (await fdb.collection(`users/${u}/inventory`).get()).docs.map((d) => `${d.id}:${d.data().quantity}`).sort().join(",");
    }
    return JSON.stringify(o);
  };
  const ctx = {};
  await step("fuzz: 준비(현금·쿠폰 지급, 아이템 구매)", async () => {
    for (const u of [A, B]) await fdb.doc(`users/${u.uid}`).update({ cash: 100000, coupons: 50 });
    const item = (await fdb.collection("storeItems").where("classCode", "==", st.classCode).get()).docs.find((d) => (d.data().price || 0) > 0 && (d.data().stock ?? 99) > 2);
    expect(!!item, "상점 아이템 없음");
    ctx.itemId = item.id;
    const r1 = await callAs(0, "purchaseStoreItem", { itemId: item.id, quantity: 3, idempotencyKey: "fz-buy-" + Date.now() });
    expect(r1.ok, "정상 구매 실패 " + JSON.stringify(r1));
    note("fuzz-ctx", ctx);
  });
  const BAD = [-1000, -1, 0, 0.5, 1e-7, "100", "abc", 1e21, 9007199254740993, null, true, [100], { n: 1 }];
  const isValid = (v) => Number.isInteger(v) && v > 0 && v < 1e12;
  const MATRIX = [
    [0, "transferCash", () => ({ recipientId: B.uid, message: "fz" }), ["amount"]],
    [0, "giftCoupon", () => ({ recipientId: B.uid, message: "fz" }), ["amount"]],
    [0, "sellCoupon", () => ({}), ["amount"]],
    [0, "donateCoupon", () => ({ message: "fz" }), ["amount"]],
    [0, "parkingDeposit", () => ({}), ["amount"]],
    [0, "parkingWithdraw", () => ({}), ["amount"]],
    [0, "processFine", () => ({ defendantId: B.uid, reason: "fz", context: "police" }), ["amount"]],
    [0, "purchaseStoreItem", () => ({ itemId: ctx.itemId }), ["quantity"]],
    [0, "sellItemToTreasury", () => ({ itemId: ctx.itemId }), ["quantity"]],
    [0, "useUserItem", () => ({ itemId: ctx.itemId }), ["quantityToUse"]],
    [0, "giftItem", () => ({ recipientUid: B.uid, itemId: ctx.itemId }), ["quantity"]],
    [0, "createAuction", () => ({ assetId: ctx.itemId, startPrice: 100, durationHours: 1, sourceCollection: "inventory", name: "fz", description: "fz" }), ["startPrice", "durationHours"]],
    [0, "buyStock", () => ({ stockId: "nope" }), ["quantity"]],
    [0, "subscribeProduct", () => ({ productType: "deposit", productId: "nope" }), ["amount"]],
    [0, "repayLoan", () => ({ productId: "nope", mode: "partial" }), ["amount"]],
    [0, "makeRealEstateOffer", () => ({ propertyId: "nope" }), ["offerPrice"]],
    [0, "setRealEstateForSale", () => ({ propertyId: "nope" }), ["salePrice"]],
  ];
  const bad = [];
  const counts = { calls: 0, ok: 0, denied: 0 };
  expectRejections = true;
  await step("fuzz: 돈 CF × 악성 값 행렬", async () => {
    let before = await snap();
    for (const [who, name, base, fields] of MATRIX) {
      for (const field of fields) {
        for (const v of BAD) {
          const payload = { ...base(), [field]: v, idempotencyKey: `fz-${name}-${field}-${counts.calls}-${Date.now()}` };
          const r = await callAs(who, name, payload);
          counts.calls++;
          const after = await snap();
          if (r.ok) {
            counts.ok++;
            if (!isValid(v)) bad.push({ name, field, v, kind: "invalid-accepted", res: JSON.stringify(r.data).slice(0, 160) });
          } else {
            counts.denied++;
            if (after !== before) bad.push({ name, field, v, kind: "denied-but-changed", code: r.code });
            if (r.code === "internal") bad.push({ name, field, v, kind: "internal-error", msg: r.msg });
          }
          before = after;
        }
      }
    }
    note("fuzz-counts", counts);
    note("fuzz-bad", bad);
    expect(bad.length === 0, `퍼징 결함 ${bad.length}건 — notes.fuzz-bad`);
  });
  // 권한 스윕 — 학생이 교사·관리자 전용 CF 를 그럴듯한 값으로 직접 부른다. 전부 거부·무변화여야 한다.
  await step("fuzz: 학생 → 교사·관리자 전용 CF 권한 스윕", async () => {
    const shopSnap = async () => (await fdb.collection("storeItems").where("classCode", "==", st.classCode).get()).docs.map((d) => `${d.id}:${d.data().price}:${d.data().stock}`).sort().join(",");
    const k = () => `az-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const PRIV = [
      ["adminCashAction", { targetUserIds: [A.uid, B.uid], action: "give", amountType: "fixed", amount: 100000, idempotencyKey: k() }],
      ["adminCashAction", { targetUserIds: [B.uid], action: "take", takeMode: "toTreasury", amountType: "fixed", amount: 100000, allowNegative: true, idempotencyKey: k() }],
      ["processTaskApproval", { approvalId: "x", action: "approve" }],
      ["manualResetClassTasks", { classCode: st.classCode }],
      ["processCourtSettlement", { complaintId: "x", senderId: B.uid, recipientId: A.uid, amount: 5000 }],
      ["processTrialSettlement", { roomId: "x", amount: 5000, reason: "r" }],
      ["processSettlement", { reportId: "x", amount: 5000, senderId: B.uid, recipientId: A.uid, reason: "r" }],
      ["updateStoreItem", { itemId: ctx.itemId, updatesToApply: { price: 1, stock: 9999 } }],
      ["addStoreItem", { name: "해킹", price: 1, stock: 999, classCode: st.classCode, icon: "x", description: "x" }],
      ["deleteStoreItem", { itemId: ctx.itemId }],
      ["adjustStorePrices", { classCode: st.classCode, percent: -99 }],
      ["reverseSalaryOnce", { idempotencyKey: k() }],
      ["deleteAuthUser", { targetUid: B.uid }],
      ["listAllAuthUsers", {}],
      ["createStudentAccounts", { students: [{ name: "가짜", number: 99 }] }],
      ["processJobApplication", { applicationId: "x", action: "approve" }],
      ["migrateAppointedJobs", { classCode: st.classCode }],
      ["publishPlazaApp", { appId: "x", action: "publish" }],
      ["triggerEconomicEventManual", { forceEventId: "x" }],
      ["toggleVacationMode", { enabled: true }],
      ["seedAvatarShop", {}],
      ["updateAvatarShopPrice", { itemId: "x", price: 1 }],
      ["completeGroupPurchase", { groupPurchaseId: "x" }],
      ["deleteGroupPurchase", { groupPurchaseId: "x" }],
      ["clawbackAppReward", { uid: B.uid, amount: 1000 }],
      ["updateStocksSnapshot", {}],
      ["addStockDoc", { name: "해킹주", price: 1 }],
      ["createRealStocks", {}],
      ["updateRealStocks", {}],
      ["addSingleRealStock", { symbol: "005930" }],
      ["resetCouponGoal", {}],
    ];
    const before = (await snap()) + (await shopSnap());
    const leaks = [];
    for (const [name, data] of PRIV) {
      const r = await callAs(0, name, data);
      if (r.ok) leaks.push(`${name}: 성공 ${JSON.stringify(r.data).slice(0, 120)}`);
      else if (r.code === "internal") leaks.push(`${name}: internal ${r.msg}`);
    }
    const after = (await snap()) + (await shopSnap());
    note("authz-leaks", leaks);
    expect(leaks.length === 0 && after === before, `권한 스윕 결함 ${leaks.length}건${after !== before ? " + 상태 변화" : ""} — notes.authz-leaks`);
  });
  expectRejections = false;
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
