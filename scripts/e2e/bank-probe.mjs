#!/usr/bin/env node
/**
 * 은행 실측 탐침 (에뮬레이터 전용 — 운영 데이터에 닿지 않는다)
 *
 * 왜: 에뮬레이터 e2e(run.mjs)는 파킹 «입금»과 입력 검증만 봤다. 이자·만기·적금 자동납입·대출 상환은
 *   한 번도 실제로 돌려 본 적이 없었다(2026-10-29 «파킹통장 하루마다 이자 들어가니?» 점검에서 확인).
 *   여기서는 날짜를 과거로 돌려 놓고 CF 를 실제로 불러, 돈이 «공식대로·반대계정까지» 움직였는지 대조한다.
 *
 * 사용(에뮬레이터를 README 대로 띄운 뒤):
 *   node scripts/e2e/bank-probe.mjs        → 전부 맞으면 `BANK PROBE PASS n/n`, 하나라도 어긋나면 종료코드 1
 */
import { createRequire } from "node:module";
import { initializeApp as initClient } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const PROJECT = "inconomysu-class";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const TS = admin.firestore.Timestamp;
const DAY = 24 * 60 * 60 * 1000;

const app = initClient({ apiKey: "fake", projectId: PROJECT });
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const fns = getFunctions(app, "asia-northeast3");
connectFunctionsEmulator(fns, "127.0.0.1", 5001);

const tag = Date.now().toString(36);
const CC = `BANK${tag}`.toUpperCase();
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const call = async (name, data = {}) => (await httpsCallable(fns, name)(data)).data;
const callErr = async (name, data) => {
  try { await call(name, data); return null; } catch (e) { return e.message; }
};
const key = () => crypto.randomUUID();
const cash = async (uid) => (await db.doc(`users/${uid}`).get()).data().cash;
const parking = async (uid) => (await db.doc(`users/${uid}/financials/parkingAccount`).get()).data();
const compound = (p, r, d) => Math.round(p * Math.pow(1 + r / 100, d));

async function makeUser(role) {
  const email = `${role}-${tag}@bank.test`;
  const u = await admin.auth().createUser({ email, password: "probe-pass-1" });
  const isT = role === "teacher";
  await db.doc(`users/${u.uid}`).set({
    name: isT ? "탐침교사" : "탐침학생", classCode: CC, cash: isT ? 10_000_000 : 1_000_000,
    coupons: 0, isAdmin: isT, isTeacher: isT, ...(isT && { isApproved: true }),
  });
  return { uid: u.uid, email };
}

const T = await makeUser("teacher");
const S = await makeUser("student");
await db.doc(`bankingSettings/${CC}`).set({
  classCode: CC,
  deposits: [{ id: 1, name: "탐침예금", dailyRate: 1, termInDays: 7, minAmount: 0, maxAmount: 0 }],
  savings: [{ id: 2, name: "탐침적금", dailyRate: 1, termInDays: 5, minAmount: 0, maxAmount: 0 }],
  loans: [{ id: 3, name: "탐침대출", dailyRate: 1, termInDays: 7, minAmount: 0, maxAmount: 0 }],
});
await signInWithEmailAndPassword(auth, S.email, "probe-pass-1");
const total = async () => (await cash(S.uid)) + (await cash(T.uid));

// ── 1. 파킹통장: 입금 → 3일 묵힘 → 이자 → 같은 날 재호출 ──
await call("parkingDeposit", { amount: 10000, idempotencyKey: key() });
check("파킹 입금", (await cash(S.uid)) === 990_000 && (await parking(S.uid)).balance === 10000);
await db.doc(`users/${S.uid}/financials/parkingAccount`).update({ lastInterestDate: TS.fromMillis(Date.now() - 3 * DAY) });
const a1 = await call("accrueParkingInterest");
const want = compound(10000, 0.1, 3) - 10000;
check("파킹 3일치 복리 이자", a1.accrued === want && (await parking(S.uid)).balance === 10000 + want, `받음 ${a1.accrued} · 공식 ${want}`);
const a2 = await call("accrueParkingInterest");
check("같은 날 두 번째는 0", a2.accrued === 0 && a2.alreadyToday === true);
await db.doc(`users/${S.uid}/financials/parkingAccount`).update({ lastInterestDate: TS.fromMillis(Date.now() - 1 * DAY) });
const a3 = await call("accrueParkingInterest");
check("다음 날 하루치", a3.accrued === compound(10000 + want, 0.1, 1) - (10000 + want), `받음 ${a3.accrued}`);
const pb = (await parking(S.uid)).balance;
await call("parkingWithdraw", { amount: pb, idempotencyKey: key() });
check("파킹 전액 출금", (await parking(S.uid)).balance === 0 && (await cash(S.uid)) === 990_000 + pb);

// ── 2. 예금: 가입 → 만기 전 수령 거절 → 만기로 돌림 → 수령 ──
let sum0 = await total();
await call("subscribeProduct", { productType: "deposits", productId: 1, amount: 100000, idempotencyKey: key() });
check("예금 가입: 학생→국고, 합계 보존", (await total()) === sum0);
const dep = (await db.collection(`users/${S.uid}/products`).where("type", "==", "deposit").get()).docs[0];
const early = await callErr("redeemDepositSavings", { productId: dep.id, mode: "maturity", idempotencyKey: key() });
check("만기 전 수령은 거절", !!early && early.includes("만기"), early || "통과됨(민팅 위험)");
await dep.ref.update({ startDate: TS.fromMillis(Date.now() - 8 * DAY), maturityDate: TS.fromMillis(Date.now() - DAY) });
const c0 = await cash(S.uid);
sum0 = await total();
await call("redeemDepositSavings", { productId: dep.id, mode: "maturity", idempotencyKey: key() });
const got = (await cash(S.uid)) - c0;
check("예금 만기 원리금 = 복리 7일", got === compound(100000, 1, 7), `받음 ${got} · 공식 ${compound(100000, 1, 7)}`);
check("예금 만기: 국고가 이자를 냄(합계 보존)", (await total()) === sum0);
check("예금 상품 문서 정리", !(await dep.ref.get()).exists);

// ── 3. 예금 중도해지 = 원금만 ──
await call("subscribeProduct", { productType: "deposits", productId: 1, amount: 50000, idempotencyKey: key() });
const dep2 = (await db.collection(`users/${S.uid}/products`).where("type", "==", "deposit").get()).docs[0];
const c1 = await cash(S.uid);
await call("redeemDepositSavings", { productId: dep2.id, mode: "cancel", idempotencyKey: key() });
check("중도해지 = 원금만", (await cash(S.uid)) - c1 === 50000);

// ── 4. 적금: 가입(1회차) → 2일 지남 → 자동납입 2회차 → 같은 날 재호출 0 ──
await call("subscribeProduct", { productType: "savings", productId: 2, amount: 1000, idempotencyKey: key() });
const sav = (await db.collection(`users/${S.uid}/products`).where("type", "==", "savings").get()).docs[0];
await sav.ref.update({ startDate: TS.fromMillis(Date.now() - 2 * DAY) });
const c2 = await cash(S.uid);
sum0 = await total();
await call("autoSavingsDeposit", { productId: sav.id });
const sd = (await sav.ref.get()).data();
check("적금 자동납입: 밀린 2회 납입", c2 - (await cash(S.uid)) === 2000 && sd.depositsCount === 3, `회차 ${sd.depositsCount}`);
check("적금 납입: 합계 보존", (await total()) === sum0);
await call("autoSavingsDeposit", { productId: sav.id });
check("적금 같은 날 재호출 = 이중납입 없음", (await sav.ref.get()).data().depositsCount === 3);
// 만기로 돌려 수령: 5회차 중 3회 납입 → 미납 2회는 차감
await sav.ref.update({ maturityDate: TS.fromMillis(Date.now() - DAY) });
const c3 = await cash(S.uid);
await call("redeemDepositSavings", { productId: sav.id, mode: "maturity", idempotencyKey: key() });
let full = 0; for (let i = 0; i < 5; i++) full += 1000 * Math.pow(1.01, 5 - i);
check("적금 만기 = 전체 원리금 − 미납", (await cash(S.uid)) - c3 === Math.round(full) - 2000, `받음 ${(await cash(S.uid)) - c3}`);

// ── 5. 대출: 가입 → 2일 지남 → 일시상환 = 원금×(1.01)^2 ──
sum0 = await total();
await call("subscribeProduct", { productType: "loans", productId: 3, amount: 50000, idempotencyKey: key() });
check("대출 실행: 국고→학생, 합계 보존", (await total()) === sum0);
const loan = (await db.collection(`users/${S.uid}/products`).where("type", "==", "loan").get()).docs[0];
await loan.ref.update({ startDate: TS.fromMillis(Date.now() - 2 * DAY) });
const c4 = await cash(S.uid);
await call("repayLoan", { productId: loan.id, mode: "lumpSum", idempotencyKey: key() });
check("대출 일시상환 = 2일 복리", c4 - (await cash(S.uid)) === compound(50000, 1, 2), `냄 ${c4 - (await cash(S.uid))} · 공식 ${compound(50000, 1, 2)}`);
check("대출 상환: 합계 보존", (await total()) === sum0);

// ── 6. 이중 클릭: 같은 멱등키 두 번 → 한 번만 ──
const k = key();
const c5 = await cash(S.uid);
await call("parkingDeposit", { amount: 3000, idempotencyKey: k });
await callErr("parkingDeposit", { amount: 3000, idempotencyKey: k });
check("같은 멱등키 재호출 = 한 번만 빠짐", c5 - (await cash(S.uid)) === 3000);

// ── 7. 거래내역: 은행 CF 가 activity_logs 에 남기는가 ──
const logs = (await db.collection("activity_logs").where("userId", "==", S.uid).get()).docs.map((d) => d.data());
console.log(`   활동로그 종류: ${[...new Set(logs.map((l) => l.type))].join(" · ")}`);
const interestLogged = logs.filter((l) => l.type === "파킹통장 이자").reduce((a, l) => a + l.amount, 0);
check("파킹 이자도 거래내역에 남는다(금액 일치)", interestLogged === a1.accrued + a3.accrued, `기록 ${interestLogged} · 실제 ${a1.accrued + a3.accrued}`);

const pass = results.filter(Boolean).length;
console.log(pass === results.length ? `BANK PROBE PASS ${pass}/${results.length}` : `BANK PROBE FAIL ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
