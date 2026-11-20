#!/usr/bin/env node
/**
 * 파산 처리·되돌리기 · 대통령 마이너스 가져오기 — **Firestore 에뮬레이터에서 실제 함수를 돌려** 문서 결과까지 대조한다.
 * 운영 데이터에 닿지 않는다(FIRESTORE_EMULATOR_HOST 없으면 바로 멈춘다).
 *
 *   JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="$JAVA_HOME/bin:$PATH" \
 *     npx firebase-tools emulators:exec --only firestore --project demo-alchan "node scripts/e2e/bankruptcy-emu.cjs"
 */
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("에뮬레이터가 아니다 — 멈춤"); process.exit(2); }
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-alchan";
const path = require("node:path");
const F = path.join(__dirname, "../../functions");
const { db } = require(path.join(F, "utils"));
const svc = require(path.join(F, "bankruptcyService"));
const index = require(path.join(F, "index"));

let fail = 0;
const ok = (cond, label, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : " — " + extra}`); if (!cond) fail++; };
const call = (fn, uid, data) => fn.run({ auth: { uid, token: {} }, data, rawRequest: { headers: {} } });
const denied = async (label, code, p) => {
  try { await p; ok(false, label, "거절되지 않음"); } catch (e) { ok(e.code === code, label, `${e.code}: ${e.message}`); }
};
const get = async (p) => (await db.doc(p).get()).data();
const count = async (p) => (await db.collection(p).get()).size;

(async () => {
  const C = "C1";
  const u = (id, d) => db.doc(`users/${id}`).set({ classCode: C, name: id, cash: 0, coupons: 0, ...d });
  await Promise.all([
    u("T", { isAdmin: true, isApproved: true, cash: 1000 }),
    u("T2", { isAdmin: true, isApproved: true, classCode: "C2" }),
    u("A", { cash: -5000, coupons: 3 }),
    u("B", { cash: 500 }),
    u("R", { cash: -100 }),
    u("P", { cash: 10, appointedJobIds: ["jobPres"] }),
    u("D", { cash: 10, delegatedPermissions: { moneyTransfer: true } }),
    db.doc("jobs/jobPres").set({ classCode: C, title: "대통령" }),
    db.doc("Settings/centralStocksCache").set({ stocks: [{ id: "7", price: 50, isListed: true }] }),
    db.doc("users/A/financials/parkingAccount").set({ balance: 100 }),
    db.doc("users/R/financials/parkingAccount").set({ balance: 10000 }),
    db.doc("users/A/products/dep1").set({ type: "deposit", balance: 1000 }),
    db.doc("users/A/products/loan1").set({ type: "loan", remainingPrincipal: 20000, balance: 20000 }),
    db.doc("users/A/portfolio/7").set({ quantity: 2, averagePrice: 100 }),
    db.doc(`classes/${C}/realEstateProperties/P1`).set({ owner: "A", ownerName: "A", price: 3000, forSale: true, salePrice: 3500 }),
    db.doc(`classes/${C}/realEstateProperties/P2`).set({ owner: "B", ownerId: "A", ownerName: "B", price: 9000 }), // 옛 ownerId 흔적
    db.doc(`classes/${C}/courtComplaints/b1`).set({ complainantId: "A", caseType: "bankruptcy", defendantId: "system", status: "pending", reason: "x" }),
    db.doc(`classes/${C}/courtComplaints/g1`).set({ complainantId: "B", caseType: "general", defendantId: "A", status: "pending", reason: "x" }),
    db.doc(`classes/${C}/courtComplaints/r1`).set({ complainantId: "R", caseType: "bankruptcy", defendantId: "system", status: "pending", reason: "x" }),
  ]);

  console.log("── 파산 처리 권한·대상 ──");
  await denied("학생은 파산 처리를 못 한다", "permission-denied", call(svc.processBankruptcy, "B", { complaintId: "b1" }));
  await denied("대통령도 못 한다", "permission-denied", call(svc.processBankruptcy, "P", { complaintId: "b1" }));
  await denied("신청한 학생 본인도 못 한다", "permission-denied", call(svc.processBankruptcy, "A", { complaintId: "b1" }));
  await denied("다른 학급 교사는 이 사건을 못 찾는다", "not-found", call(svc.processBankruptcy, "T2", { complaintId: "b1" }));
  await denied("일반 고소장은 파산 처리되지 않는다", "failed-precondition", call(svc.processBankruptcy, "T", { complaintId: "g1" }));
  await denied("경로가 섞인 사건 번호는 거절", "invalid-argument", call(svc.processBankruptcy, "T", { complaintId: "a/b" }));
  await denied("순자산이 플러스인 학생(현금만 마이너스)은 거절", "failed-precondition", call(svc.processBankruptcy, "T", { complaintId: "r1" }));
  ok((await get("users/R")).cash === -100 && (await get("users/R/financials/parkingAccount")).balance === 10000, "거절된 학생의 자산은 그대로");
  ok((await get("users/A")).cash === -5000 && (await count("users/A/products")) === 2, "거절들 뒤에도 A 는 그대로");

  console.log("── 파산 처리 ──");
  const r = await call(svc.processBankruptcy, "T", { complaintId: "b1" });
  ok(r.success && r.net < 0, "교사가 처리한다", JSON.stringify(r));
  const a1 = await get("users/A");
  ok(a1.cash === 0, "현금 0", a1.cash);
  ok(a1.coupons === 3, "쿠폰은 그대로", a1.coupons);
  ok((await get("users/A/financials/parkingAccount")).balance === 0, "파킹 0");
  ok((await count("users/A/products")) === 0 && (await count("users/A/portfolio")) === 0, "예적금·대출·주식 삭제");
  const p1 = await get(`classes/${C}/realEstateProperties/P1`);
  ok(p1.owner === "government" && p1.forSale === false && p1.seizedByBankruptcy === "b1", "A 의 집은 정부로", JSON.stringify(p1));
  ok((await get(`classes/${C}/realEstateProperties/P2`)).owner === "B", "⭐ 옛 ownerId 만 남은 B 의 집은 안 건드린다");
  ok((await get("users/T")).cash === 1000, "국고(교사 현금)는 늘지 않는다");
  const c1 = await get(`classes/${C}/courtComplaints/b1`);
  ok(c1.bankruptcyProcessedAt && c1.status === "resolved" && !!c1.judgment, "사건에 처리 표식·재판완료");
  ok((await get(`classes/${C}/bankruptcyRecords/b1`)).before.cash === -5000, "되돌리기용 원본 저장");
  await denied("두 번 누르면 한 번만", "already-exists", call(svc.processBankruptcy, "T", { complaintId: "b1" }));

  console.log("── 되돌리기 ──");
  await db.doc("users/A").update({ cash: 700 });                      // 처리 뒤 번 돈
  await db.doc("users/A/portfolio/7").set({ quantity: 1, averagePrice: 200 }); // 같은 종목 다시 삼
  await denied("학생은 되돌리기를 못 한다", "permission-denied", call(svc.undoBankruptcy, "A", { complaintId: "b1" }));
  const un = await call(svc.undoBankruptcy, "T", { complaintId: "b1" });
  ok(un.success && un.skipped.length === 0, "교사가 되돌린다", JSON.stringify(un));
  ok((await get("users/A")).cash === 700 - 5000, "현금 = 그 뒤 번 돈 + 옛 빚(덮어쓰지 않는다)", (await get("users/A")).cash);
  ok((await get("users/A/financials/parkingAccount")).balance === 100, "파킹 복원");
  ok((await count("users/A/products")) === 2, "예적금·대출 복원");
  const h = await get("users/A/portfolio/7");
  ok(h.quantity === 3 && Math.abs(h.averagePrice - (100 * 2 + 200 * 1) / 3) < 1e-6, "⭐ 다시 산 종목과 합쳐진다(2+1주)", JSON.stringify(h));
  const p1b = await get(`classes/${C}/realEstateProperties/P1`);
  ok(p1b.owner === "A" && p1b.forSale === true && p1b.salePrice === 3500 && p1b.seizedByBankruptcy === undefined, "집 복원", JSON.stringify(p1b));
  const c2 = await get(`classes/${C}/courtComplaints/b1`);
  ok(!c2.bankruptcyProcessedAt && c2.bankruptcyUndoneAt && c2.status === "pending" && !c2.judgment, "사건이 처리 전으로", JSON.stringify(c2));
  await denied("되돌리기도 한 번만", "already-exists", call(svc.undoBankruptcy, "T", { complaintId: "b1" }));

  console.log("── 다시 처리 · 남이 산 집 ──");
  await denied("⭐ 되돌린 사건은 again 없이는 다시 처리되지 않는다(늦게 온 옛 요청)", "failed-precondition", call(svc.processBankruptcy, "T", { complaintId: "b1" }));
  ok((await get("users/A")).cash === -4300, "거절 뒤 자산 그대로");
  ok((await call(svc.processBankruptcy, "T", { complaintId: "b1", again: true })).success, "again 이면 다시 처리");
  ok((await count(`classes/${C}/bankruptcyRecords`)) === 2, "옛 기록은 덮지 않고 보관");
  await db.doc(`classes/${C}/realEstateProperties/P1`).update({ owner: "B", ownerName: "B" }); // B 가 정부에게서 삼
  const un2 = await call(svc.undoBankruptcy, "T", { complaintId: "b1" });
  ok(un2.skipped.length === 1 && (await get(`classes/${C}/realEstateProperties/P1`)).owner === "B", "⭐ 그 뒤 남이 산 집은 뺏지 않고 «복원 못 함»으로 알린다", JSON.stringify(un2.skipped));

  console.log("── 대통령 마이너스 가져오기 ──");
  const take = (uid, extra) => call(index.adminCashAction, uid, { targetUserIds: ["B"], action: "take", takeMode: "toMe", amountType: "fixed", amount: 1000, idempotencyKey: `k-${uid}-${Math.random()}`, ...extra });
  const d1 = await take("D", { allowNegative: true });
  ok(d1.count === 1 && (await get("users/B")).cash === 0 && d1.clampedCount === 1, "위임만 받은 학생은 0원 바닥(가진 500 만)", JSON.stringify(d1));
  const t0 = (await get("users/T")).cash;
  const pr0 = await take("P", { allowNegative: false });
  ok(pr0.count === 0 && pr0.noBalanceCount === 1 && (await get("users/B")).cash === 0, "대통령도 체크 안 하면 0원 바닥");
  const pr1 = await take("P", { allowNegative: true });
  ok(pr1.count === 1 && (await get("users/B")).cash === -1000, "⭐ 대통령이 체크하면 마이너스까지 가져온다", JSON.stringify(pr1));
  ok((await get("users/T")).cash === t0 + 1000 && (await get("users/P")).cash === 10, "가져온 돈은 국고(교사)로 — 대통령 계좌는 그대로");
  const rm = await call(index.adminCashAction, "P", { targetUserIds: ["T"], action: "take", takeMode: "remove", amountType: "fixed", amount: 500, allowNegative: true, idempotencyKey: `k-rm-${Math.random()}` });
  ok(rm.count === 0 && rm.failures.length === 1 && (await get("users/T")).cash === t0 + 1000, "⭐ 대통령은 선생님(국고) 돈을 없애지 못한다", JSON.stringify(rm));
  const self = await call(index.adminCashAction, "P", { targetUserIds: ["P"], action: "send", amountType: "fixed", amount: 99999, idempotencyKey: `k-self-${Math.random()}` });
  ok(self.count === 0 && (await get("users/P")).cash === 10, "대통령은 자기에게 보내지 못한다");

  console.log(fail ? `\nEMU FAIL ${fail}` : "\nEMU PASS");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
