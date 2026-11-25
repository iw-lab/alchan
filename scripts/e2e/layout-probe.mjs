// scripts/e2e/layout-probe.mjs — 폰·태블릿·PC 6개 화면 크기에서 «보이는 배치» 를 잰다(에뮬레이터 전용).
// 재는 것(모두 사람 눈에 보이는 결함):
//   cut      누르는 것(버튼·입력·탭)이 화면/부모 상자에 잘려 25% 이상 안 보임 (overflow:hidden 에 먹힌 것 포함)
//   vtext    글자가 낱말 중간에서 꺾임 — «입/금», «12만알/찬» (짧은 글 ≤ 14자)
//   covered  누르는 것의 한가운데를 다른 요소(도움말 단추·하단 탭)가 덮음
//   icon     검색 아이콘이 입력 글자와 겹침
//   leak     어떤 화면의 CSS 가 사이드바·헤더 모양을 바꿈 (화면마다 사이드바 폭·줄 높이가 달라짐)
//   share    본문이 화면 폭의 80% 미만(태블릿 세로 이하) / 본문 한 칸이 1480px 초과(큰 모니터)
//   hcut     헤더 안 요소가 헤더 밖으로 나감
//   edge     본문 글자가 화면(본문) 가장자리에 8px 안으로 붙음 — 화면마다 여백이 다르면 여기서 걸린다
//   contrast 글자와 배경 대비가 3:1(굵은·큰 글자 2.5:1) 미만 — 안 읽히는 글자
//   small    손가락으로 누르는 크기 32px 미만(터치 화면)   — 경고
//   tiny     11.5px 미만 글자                                — 경고
// --open   화면마다 단추를 하나씩 눌러 «열리는 것»(창·서랍·바뀐 본문)까지 같은 잣대로 잰다. 창 안에서는 vcut(창이 화면보다 길어 아래 단추에 못 닿음)도 잰다.
// 실행: node scripts/e2e/layout-probe.mjs [--base http://127.0.0.1:5199] [--vp phone,tabP] [--role student|teacher] [--only /banking,/court] [--out DIR] [--strict]
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
const ROOT = new URL("../../", import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const BASE = arg("base", "http://127.0.0.1:5199"), OUT = arg("out", "/tmp/alchan-layout"), STRICT = process.argv.includes("--strict"), FULL = process.argv.includes("--full"), OPEN = process.argv.includes("--open");
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080"; process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
if (!/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("에뮬레이터 앱에서만 잰다(운영 화면에 로그인하지 않는다)");
const require = createRequire(import.meta.url), { chromium } = require("@playwright/test");
const admin = createRequire(ROOT + "functions/package.json")("firebase-admin");
admin.initializeApp({ projectId: "inconomysu-class" });
const T = (await admin.firestore().collection("users").where("isAdmin", "==", true).get()).docs.map((d) => d.data())
  .filter((u) => /^teacher\d+@e2e\.test$/.test(u.email || "") && u.classCode && u.classCode !== "미지정").sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
const code = T.classCode;
const STUDENT = ["/dashboard/tasks", "/my-assets", "/my-profile", "/coupon-goal", "/learning-sites", "/item-shop", "/my-items", "/personal-shop", "/group-purchase", "/avatar-shop", "/banking", "/stock-trading", "/auction", "/real-estate", "/national-tax", "/national-assembly", "/court", "/police", "/organization-chart", "/learning-board", "/personal-board", "/learning-board/music-request", "/plaza"];
const TEACHER = ["/dashboard/tasks", "/my-assets", "/admin/guide", "/admin/app-settings", "/admin/approvals", "/admin/job-approvals", "/admin/permissions", "/admin/students", "/admin/money-transfer", "/admin/coupon-transfer", "/admin/tax-settlement", "/admin/activity-log", "/admin/learning-apps", "/admin/economic-events", "/admin/economy-report", "/item-shop", "/banking", "/stock-trading", "/court"];
const VPS = [{ n: "phone", w: 390, h: 844, t: 1 }, { n: "phoneS", w: 360, h: 640, t: 1 }, { n: "tabP", w: 820, h: 1180, t: 1 }, { n: "tabL", w: 1180, h: 820, t: 1 }, { n: "pc", w: 1440, h: 900, t: 0 }, { n: "pcW", w: 1920, h: 1080, t: 0 }];
const vpf = arg("vp"), rolef = arg("role"), onlyf = arg("only");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 본문(main)이 서고, 불러오는 중 글자가 없고, 글자 수가 두 번 연속 같을 때까지 — 덜 뜬 화면을 재면 결함이 0 으로 보인다
async function settle(p) { await p.waitForLoadState("domcontentloaded").catch(() => {}); let prev = -1, same = 0; for (let i = 0; i < 48; i++) { const n = await p.evaluate(() => { const t = document.body?.innerText || ""; return !document.querySelector("main") || /로딩 중|불러오는 중|Loading\.\.\./.test(t) ? -1 : t.length; }).catch(() => -1); same = n > 0 && n === prev ? same + 1 : 0; prev = n; if (same >= 2) break; await sleep(250); } await sleep(300); }
async function dismiss(p) {
  for (let i = 0; i < 6; i++) {
    const nick = p.getByRole("button", { name: "이걸로 할래요" });
    if (await nick.isVisible().catch(() => false)) { await p.locator("div.grid.grid-cols-1.gap-2 > button").first().click({ timeout: 3000 }).catch(() => {}); await nick.click({ timeout: 3000 }).catch(() => {}); await sleep(700); continue; }
    const btn = p.getByRole("button", { name: /^(받기!?.*|오늘은 닫기|나중에|확인했어요 ✓|확인했어요)$/ }).first();
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await sleep(700); continue; }
    if (i === 0) { await sleep(700); continue; } break;
  }
}
const probe = ({ touch, scoped }) => {
  const W = innerWidth, H = innerHeight, out = { cut: [], vtext: [], covered: [], icon: [], share: [], hcut: [], contrast: [], edge: [], vcut: [], small: [], tiny: [], hscroll: [] };
  const sc = (() => { const m = document.querySelector("main"); for (let p = m; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 4) return p; } return document.scrollingElement; })();
  const vis = (el) => { for (let p = el; p && p !== document.documentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === "hidden" || s.display === "none" || +s.opacity < 0.05) return false; } const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(/\s+/).filter(Boolean).slice(0, 2).join(".")}「${(el.innerText || el.placeholder || el.getAttribute("aria-label") || "").trim().slice(0, 16).replace(/\n/g, "/")}」`;
  // 실제로 보이는 사각형 = 자기 ∩ 화면 폭 ∩ 잘라내는 조상들. 가로로 밀 수 있는 조상 안이면 «밀면 보인다» 라 따로 센다.
  const clipX = (el) => { const r = el.getBoundingClientRect(); let L = r.left, R = r.right, scroller = null; for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX !== "visible") { const q = p.getBoundingClientRect(); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2 && !/^(BODY|MAIN)$/.test(p.tagName)) { scroller ||= p; } L = Math.max(L, q.left); R = Math.min(R, q.right); } if (s.position === "fixed") break; } L = Math.max(L, 0); R = Math.min(R, W); return { w: r.width, v: Math.max(0, R - L), scroller }; };
  // 안쪽 세로 스크롤 상자에서 «굴리면 보이는» 자리인가
  const clippedY = (el, y) => { for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowY !== "visible" && p !== sc) { const q = p.getBoundingClientRect(); if (y < q.top || y > q.bottom) return true; } if (s.position === "fixed") break; } return false; };
  const scope = (scoped && document.querySelector("[data-probe-scope]")) || document.body;
  const ACT = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio]";
  const acts = [...scope.querySelectorAll(ACT)].filter(vis);
  // 닫힌 서랍(화면 밖으로 밀어 둔 fixed 상자) 안은 결함이 아니다 — 열렸을 때 따로 잰다.
  const hid = (el) => { if (el.closest("[aria-hidden=true],[inert]")) return true; for (let p = el; p; p = p.parentElement) if (getComputedStyle(p).position === "fixed") { const q = p.getBoundingClientRect(); return q.right <= 1 || q.left >= W - 1; } return false; };
  for (const el of acts) {
    if (hid(el)) continue;
    const c = clipX(el); if (c.w >= 8 && c.v < c.w * 0.75) { if (c.scroller) { out.hscroll.push(desc(c.scroller)); } else out.cut.push(`${desc(el)} ${Math.round(c.v)}/${Math.round(c.w)}`); }
    if (touch && /^(BUTTON|A|INPUT|SELECT)$/.test(el.tagName)) { const t = /^(checkbox|radio)$/.test(el.type) ? el.closest("label") || el : el; const r = t.getBoundingClientRect(); if (Math.min(r.width, r.height) < 32 && !(el.tagName === "A" && getComputedStyle(el).display === "inline")) out.small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`); }
    if (el.tagName === "INPUT" && !/^(checkbox|radio)$/.test(el.type)) { const pl = parseFloat(getComputedStyle(el).paddingLeft), r = el.getBoundingClientRect(); for (const s of el.parentElement.querySelectorAll("svg")) { if (!vis(s)) continue; const q = s.getBoundingClientRect(); if (q.left >= r.left - 1 && q.right <= r.left + 60 && q.top >= r.top - 2 && q.bottom <= r.bottom + 2 && q.right > r.left + pl - 1) out.icon.push(`${desc(el)} 아이콘끝 ${Math.round(q.right - r.left)} > 글자시작 ${Math.round(pl)}`); } }
  }
  // 창이 화면보다 긴데 굴릴 수 없으면 아래 단추에 영영 못 닿는다
  if (scope !== document.body) for (const el of acts) { const r = el.getBoundingClientRect(), y = r.top + r.height / 2; if (y >= 0 && y <= H) continue; let can = false; for (let q = el.parentElement; q; q = q.parentElement) { const cs = getComputedStyle(q); if (/(auto|scroll)/.test(cs.overflowY) && q.scrollHeight > q.clientHeight + 2) { can = true; break; } if (q === scope) break; } if (!can) out.vcut.push(`${desc(el)} y${Math.round(y)}/${H}`); }
  // 덮임: 맨 위·맨 아래로 굴려 각각
  for (const pos of [0, 1e6]) { sc.scrollTo({ top: pos, behavior: "instant" }); for (const el of acts) { if (hid(el)) continue; const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 1 || x > W - 1 || y < 1 || y > H - 1) continue; if (pos === 0 && sc.scrollHeight > sc.clientHeight + 40 && y > H - 130) continue; /* 위 상태에서 아래쪽 끝은 굴리면 올라온다 */ if (pos > 0 && y < 130) continue; const c = clipX(el); if (c.v < c.w * 0.5) continue; if (clippedY(el, y)) continue; const top = document.elementFromPoint(x, y); if (top && top !== el && !el.contains(top) && !top.contains(el) && !el.closest("label")?.contains(top)) out.covered.push(`${desc(el)} ← ${desc(top)}`); } }
  sc.scrollTo({ top: 0, behavior: "instant" });
  // 글자 꺾임·작은 글자·글자 대비(배경 = 조상들의 단색/그라데이션 평균을 겹쳐 계산. 사진 배경·그라데이션 글자는 건너뛴다)
  const rgba = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const a = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; };
  const over = (f, b2) => { const a = f[3] + b2[3] * (1 - f[3]); if (!a) return [255, 255, 255, 0]; return [0, 1, 2].map((i) => (f[i] * f[3] + b2[i] * b2[3] * (1 - f[3])) / a).concat(a); };
  const lum = (c) => { const f = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  function contrast(el) {
    const cs = getComputedStyle(el); let fg = rgba(cs.webkitTextFillColor) || rgba(cs.color); if (!fg || fg[3] < 0.05) return null; let layers = [], op = 1;
    for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.webkitBackgroundClip === "text" || s.backgroundClip === "text") return null; op *= +s.opacity; if (/url\(/.test(s.backgroundImage)) return null; const g = s.backgroundImage.match(/rgba?\([^)]+\)/g); if (g) { const a = g.map(rgba); layers.push([0, 1, 2, 3].map((i) => a.reduce((x, y) => x + y[i], 0) / a.length)); } const bc = rgba(s.backgroundColor); if (bc && bc[3] > 0.01) layers.push(bc); if ((bc && bc[3] > 0.98) || (g && layers.at(g && bc && bc[3] > 0.01 ? -2 : -1)[3] > 0.98)) break; }
    if (el.closest(":disabled") || op < 0.75) return null;
    let bg = [255, 255, 255, 1]; for (const l of layers.reverse()) bg = over(l, bg); fg = over(fg, bg); const a = lum(fg), z = lum(bg); const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); return { r: (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05), fg: hex(fg), bg: hex(bg) };
  }
  const wrap = document.querySelector("main .app-content-wrap"), wr = wrap ? { left: Math.max(0, wrap.getBoundingClientRect().left), right: Math.min(W, wrap.getBoundingClientRect().right) } : null, edges = [];
  const tw = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode()); ) {
    const raw = n.nodeValue, t = raw.trim(); if (t.length < 2) continue; const el = n.parentElement; if (!el || hid(el) || /^(SCRIPT|STYLE|OPTION|TEXTAREA)$/.test(el.tagName) || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11.5) out.tiny.push(`${fs}px「${t.slice(0, 14)}」`);
    { const cr = contrast(el); if (cr && cr.r < (fs >= 18.5 || (fs >= 14 && +getComputedStyle(el).fontWeight >= 700) ? 2.5 : 3)) out.contrast.push(`${cr.r.toFixed(1)}「${t.slice(0, 14)}」${cr.fg}/${cr.bg} ${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(/\s+/).slice(0, 2).join(".")}`); }
    if (wrap && wrap.contains(el) && !(getComputedStyle(el).position === "fixed")) { const er = document.createRange(); er.selectNodeContents(n); const q0 = er.getBoundingClientRect(), eb = getComputedStyle(el).overflowX === "visible" ? q0 : el.getBoundingClientRect(), q = { left: Math.max(q0.left, eb.left), right: Math.min(q0.right, eb.right), width: q0.width }; if (q.width > 1 && !clipX(el).scroller && q.right > wr.left && q.left < wr.right) { const gl = q.left - wr.left, gr = wr.right - q.right; edges.push([gl, `L${Math.round(gl)}「${t.slice(0, 12)}」`]); if (gr < 8) out.edge.push(`R${Math.round(gr)}「${t.slice(0, 12)}」`); if (gl < 8) out.edge.push(`L${Math.round(gl)}「${t.slice(0, 12)}」`); } }
    if (t.length > 14 || !/[가-힣0-9]/.test(t)) continue;
    const st = raw.indexOf(t), rg = document.createRange(); let prev = null;
    for (let i = 0; i < t.length; i++) { rg.setStart(n, st + i); rg.setEnd(n, st + i + 1); const q = rg.getBoundingClientRect(); if (!q.width) continue; if (prev && q.top > prev.top + fs * 0.6 && !/[\s/·,~)\]-]/.test(t[i - 1]) && !/[\s(\[]/.test(t[i])) { out.vtext.push(`「${t}」→${t.slice(0, i)}/${t.slice(i)} ${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(/\s+/)[0]}`); break; } prev = q; }
  }
  const main = document.querySelector("main"), mr = main?.getBoundingClientRect();
  if (main) { const cs = getComputedStyle(main); if (parseFloat(cs.borderLeftWidth) > 0) out.share.push(`본문에 테두리 ${cs.borderLeftWidth}`); if (W <= 900 && mr.width / W < 0.8) out.share.push(`본문 ${Math.round(mr.width)}/${W}px = ${Math.round((mr.width / W) * 100)}%`);
    if (W >= 1600) { let mx = 0, me = null; for (const el of main.querySelectorAll("div,section,table,ul")) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); const card = s.backgroundColor !== "rgba(0, 0, 0, 0)" && (s.borderTopWidth !== "0px" || s.boxShadow !== "none"); if (card && r.width > mx && r.height > 30) { mx = r.width; me = el; } } if (mx > 1480) out.share.push(`본문 카드 폭 ${Math.round(mx)}px ${desc(me)}`); } }
  for (const h of document.querySelectorAll("header")) { if (!vis(h)) continue; const hr = h.getBoundingClientRect(); for (const el of h.querySelectorAll("*")) { if (!vis(el) || el.tagName === "path") continue; const r = el.getBoundingClientRect(); if (r.right > Math.min(hr.right, W) + 1 || r.left < hr.left - 1) { if (clipX(el).scroller) continue; out.hcut.push(`${desc(el)} R${Math.round(r.right)}>${Math.round(Math.min(hr.right, W))}`); } } }
  const aside = [...document.querySelectorAll("aside")].find((a) => vis(a) && a.getBoundingClientRect().right > 40); const items = aside ? [...aside.querySelectorAll("nav button, nav a")].filter((b) => vis(b) && !b.closest(".ml-4")).slice(0, 4) : [];
  const sig = aside ? [Math.round(aside.getBoundingClientRect().width), ...items.map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}/${getComputedStyle(b).fontSize}`; })].join(",") : "";
  const uniq = (a) => [...new Set(a)]; const n = {}; for (const k of Object.keys(out)) { out[k] = uniq(out[k]); n[k] = out[k].length; out[k] = out[k].slice(0, 40).map((t) => String(t).replace(/[\ud800-\udfff]/g, "")); }
  return { ...out, n, sig, main: mr ? [Math.round(mr.left), Math.round(mr.width)] : null, gutter: edges.length ? Math.round(Math.min(...edges.map((e) => e[0]))) : null, docH: sc.scrollHeight };
};
const b = await chromium.launch({ headless: true }); const rows = [];
const SLOW = 120000;
const logins = {
  student: async (p) => { await p.goto(BASE + "/login"); await p.getByPlaceholder("예: alchan01").fill("2"); await p.getByPlaceholder("비워도 됩니다").fill(code); await p.getByPlaceholder("비밀번호를 입력하세요").fill("pass2222"); await p.getByRole("button", { name: /^로그인/ }).click(); },
  teacher: async (p) => { await p.goto(BASE + "/login"); await p.getByRole("button", { name: "선생님" }).first().click(); await p.getByPlaceholder("이메일을 입력하세요").fill(T.email); await p.getByPlaceholder("비밀번호를 입력하세요").fill("teach1234"); await p.getByRole("button", { name: /^로그인/ }).click(); },
};
// 로그인은 역할마다 한 번 — 화면 크기마다 새로 로그인하면 로그인 시도 제한에 걸린다.
const states = {};
for (const who of ["student", "teacher"]) { if (rolef && rolef !== who) continue; const ctx = await b.newContext({ locale: "ko-KR", viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(SLOW); await logins[who](p); await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: SLOW }); await settle(p); await dismiss(p); states[who] = await ctx.storageState({ indexedDB: true }); await ctx.close(); }
const jobs = []; for (const who of Object.keys(states)) for (const vp of VPS) if (!vpf || vpf.split(",").includes(vp.n)) jobs.push({ who, vp });
// 본문 단추를 하나씩 눌러 열리는 창·바뀌는 본문을 잰다. 돈·삭제처럼 되돌릴 수 없는 이름은 누르지 않는다(씨앗 자료가 흔들린다).
const NO = /삭제|리셋|초기화|로그아웃|탈퇴|승인|거절|실행|구매하기|잔액 부족|입금$|출금$|매수$|매도$|저장|확정|파기|폐쇄|철거|완료|그만 보기|새로고침|갱신|다운로드|받기|인쇄|한글 파일|안내 닫기|알겠어요|지금 계산|되돌리|켜짐|꺼짐/;
async function openAll(p, who, vp, r, errs) {
  const list = await p.evaluate(() => { const seen = new Set(), out = []; const all = [...document.querySelectorAll("main button, main [role=button], main [role=tab], header button, nav button")]; all.forEach((el, i) => { const q = el.getBoundingClientRect(); if (q.width < 2 || q.height < 2 || el.disabled || el.closest("aside")) return; const t = (el.innerText || el.getAttribute("aria-label") || el.title || "").trim().replace(/\s+/g, " "); const k = t.replace(/[\d,.억만+%-]+/g, "#").slice(0, 24); if (!k || seen.has(k)) return; seen.add(k); out.push({ i, t: t.slice(0, 24) }); }); return out; });
  for (const { i, t } of list.filter((x) => !NO.test(x.t)).slice(0, 16)) {
    try {
      await p.goto(BASE + r); await settle(p); await dismiss(p);
      const before = await p.evaluate(() => (document.querySelector("main")?.innerText || "").length);
      const ok = await p.evaluate(({ i, t }) => { const all = [...document.querySelectorAll("main button, main [role=button], main [role=tab], header button, nav button")]; const el = all[i]; const n = (el?.innerText || el?.getAttribute("aria-label") || el?.title || "").trim().replace(/\s+/g, " ").slice(0, 24); if (n !== t) return false; el.click(); return true; }, { i, t });
      if (!ok) continue; await sleep(900); if (new URL(p.url()).pathname !== r) continue;
      const st = await p.evaluate((before) => { document.querySelectorAll("[data-probe-scope]").forEach((e) => e.removeAttribute("data-probe-scope")); const A = innerWidth * innerHeight; let best = null, bz = 0; for (const el of document.querySelectorAll("body *")) { const s = getComputedStyle(el); if (s.position !== "fixed" || s.visibility === "hidden" || s.display === "none" || s.pointerEvents === "none" || +s.opacity < 0.05) continue; const q = el.getBoundingClientRect(); const vw = Math.min(q.right, innerWidth) - Math.max(q.left, 0), vh = Math.min(q.bottom, innerHeight) - Math.max(q.top, 0); if (vw <= 0 || vh <= 0 || vw * vh < A * 0.18 || el.tagName === "ASIDE" && q.right <= 1) continue; if (el.closest("aside") && innerWidth >= 1024) continue; const z = +s.zIndex || 0; if (el.innerText?.trim().length > 4 && z >= bz && z >= 20) { best = el; bz = z; } } if (best) best.setAttribute("data-probe-scope", "1"); const now = (document.querySelector("main")?.innerText || "").length; return { modal: !!best, changed: Math.abs(now - before) > Math.max(30, before * 0.08) }; }, before);
      if (!st.modal && !st.changed) continue;
      const m = await p.evaluate(probe, { touch: !!vp.t, scoped: st.modal }); if (st.modal) m.n.edge = 0, (m.edge = []);
      rows.push({ who, vp: vp.n, r: `${r}#${t}`, open: st.modal ? "창" : "본문", ...m, sig: "", errs: errs.splice(0) });
      mkdirSync(`${OUT}/${vp.n}`, { recursive: true }); await p.screenshot({ path: `${OUT}/${vp.n}/${who}${r.replace(/\//g, "_")}#${t.replace(/[^가-힣A-Za-z0-9]+/g, "-").slice(0, 20)}.png` });
    } catch (e) { rows.push({ who, vp: vp.n, r: `${r}#${t}`, fatal: String(e).slice(0, 120) }); }
  }
}
async function run({ who, vp }) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: !!vp.t, hasTouch: !!vp.t, deviceScaleFactor: 1, locale: "ko-KR", storageState: states[who] });
  await ctx.route(/recaptcha|content-firebaseappcheck|firebaseappcheck\.googleapis/, (r) => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem("alchan_welcome_never_show", "true"); } catch { /* 저장소 막힘 */ } const s = document.createElement("style"); s.textContent = ".firebase-emulator-warning{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
  for (const r of who === "student" ? STUDENT : TEACHER) {
    if (onlyf && !onlyf.split(",").includes(r)) continue;
    try { await p.goto(BASE + r); await settle(p); await dismiss(p); const m = await p.evaluate(probe, { touch: !!vp.t }); rows.push({ who, vp: vp.n, r, landed: new URL(p.url()).pathname, ...m, errs: errs.splice(0) }); mkdirSync(`${OUT}/${vp.n}`, { recursive: true }); if (FULL) { await p.setViewportSize({ width: vp.w, height: Math.min(Math.max(vp.h, m.docH + 160), 3200) }); await sleep(500); } await p.screenshot({ path: `${OUT}/${vp.n}/${who}${r.replace(/\//g, "_")}.png` }); if (FULL) await p.setViewportSize({ width: vp.w, height: vp.h }); }
    catch (e) { rows.push({ who, vp: vp.n, r, fatal: String(e).slice(0, 160) }); }
    if (OPEN) await openAll(p, who, vp, r, errs).catch((e) => rows.push({ who, vp: vp.n, r: r + "#open", fatal: String(e).slice(0, 160) }));
  }
  await ctx.close();
}
const par = +arg("par", 4); let k = 0; await Promise.all(Array.from({ length: par }, async () => { while (k < jobs.length) await run(jobs[k++]); }));
await b.close();
// 사이드바 모양이 같은 화면 크기·역할 안에서 흔들리면 그 화면 CSS 가 샌 것
for (const g of new Set(rows.map((x) => x.who + x.vp))) { const rs = rows.filter((x) => x.who + x.vp === g && x.sig); const cnt = {}; rs.forEach((x) => (cnt[x.sig] = (cnt[x.sig] || 0) + 1)); const base = Object.entries(cnt).sort((a, z) => z[1] - a[1])[0]?.[0]; rs.forEach((x) => { x.leak = x.sig === base ? [] : [`${x.sig} ≠ ${base}`]; x.n.leak = x.leak.length; }); }
writeFileSync(`${OUT}/layout.json`, JSON.stringify(rows, null, 1));
const HARD = ["cut", "vtext", "covered", "icon", "leak", "share", "hcut", "edge", "contrast", "vcut"], SOFT = ["small", "tiny"];
const sum = (k, f = () => true) => rows.filter(f).reduce((a, x) => a + (x.n?.[k] || 0), 0);
console.log("화면", rows.length, "· 실패", rows.filter((x) => x.fatal).length, "· 스크립트 오류", rows.filter((x) => x.errs?.length).length);
console.log("크기".padEnd(8), [...HARD, ...SOFT].map((k) => k.padStart(8)).join(""));
for (const vp of VPS) if (rows.some((x) => x.vp === vp.n)) console.log(vp.n.padEnd(8), [...HARD, ...SOFT].map((k) => String(sum(k, (x) => x.vp === vp.n)).padStart(8)).join(""));
const hard = HARD.reduce((a, k) => a + sum(k), 0); console.log("보이는 결함 합계", hard);
if (STRICT && (hard || rows.some((x) => x.fatal))) { console.log("❌ LAYOUT PROBE FAIL — 자세히:", `${OUT}/layout.json`); process.exit(1); }
process.exit(0);
