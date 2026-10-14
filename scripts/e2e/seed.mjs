// scripts/e2e/seed.mjs — 에뮬레이터(Auth·Firestore)에 규칙을 올리고 앱 관리자(슈퍼관리자) 1명을 심는다.
// 실행: node scripts/e2e/seed.mjs   (에뮬레이터가 떠 있어야 한다 — scripts/e2e/README 참고)
// ⚠️ 운영 프로젝트에 닿지 않도록 에뮬레이터 호스트가 없으면 즉시 멈춘다.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
if (!/^127\.0\.0\.1|^localhost/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error("에뮬레이터가 아닌 곳으로 시드하지 않는다");

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const PROJECT = JSON.parse(readFileSync(new URL("../../.firebaserc", import.meta.url), "utf8")).projects.default;
admin.initializeApp({ projectId: PROJECT });

// 1) 규칙 — firebase.json 이 다중 DB 배열이라 에뮬레이터가 규칙을 못 찾고 «전부 허용»으로 뜬다.
//    운영과 같은 규칙으로 재야 의미가 있으므로 REST 로 직접 올린다.
const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
  method: "PUT", headers: { "content-type": "application/json" },
  body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }),
});
if (!r.ok) throw new Error(`규칙 업로드 실패 ${r.status} ${await r.text()}`);

// 2) 슈퍼관리자
export const SUPER = { email: "super@e2e.test", password: "super1234", name: "E2E관리자" };
let u;
try { u = await admin.auth().getUserByEmail(SUPER.email); }
catch { u = await admin.auth().createUser({ email: SUPER.email, password: SUPER.password, displayName: SUPER.name }); }
await admin.auth().setCustomUserClaims(u.uid, { isSuperAdmin: true, isAdmin: true, isApproved: true });
await admin.firestore().doc(`users/${u.uid}`).set({
  name: SUPER.name, nickname: SUPER.name, email: SUPER.email, classCode: "SUPER",
  isAdmin: true, isSuperAdmin: true, isApproved: true, isTeacher: false, cash: 0, coupons: 0,
  selectedJobIds: [], createdAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });
console.log(JSON.stringify({ ok: true, superUid: u.uid, rulesBytes: rules.length }));
