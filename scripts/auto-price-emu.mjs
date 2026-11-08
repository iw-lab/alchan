#!/usr/bin/env node
/**
 * 자동 물가 — 진짜 Firestore(에뮬레이터)에서 서버 함수를 그대로 돌린다(2026-11-08).
 * 실행: JAVA_HOME=/opt/homebrew/opt/openjdk@21 npx firebase emulators:exec --only firestore --project demo-autoprice "node scripts/auto-price-emu.mjs"
 * 불변식: ① 학생 cash·자산은 안 바뀐다 ② 같은 주 두 번 없음(연속·동시) ③ 한 주 ±10%·제외 아이템·basePrice 규칙
 *         + 읽기 실패면 그대로 · 기준 대기 · 건너뛰기 · 꺼진 학급은 손대지 않음
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("에뮬레이터에서만 돈다(FIRESTORE_EMULATOR_HOST 없음)"); process.exit(2); }
process.env.GCLOUD_PROJECT ||= "demo-autoprice";
const { db, admin } = require("../functions/utils.js");
const S = require("../functions/scheduler-http.js");
let fails = 0;
const ok = (c, name, extra = "") => { console.log(`${c ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); if (!c) fails++; };

async function seedClass(cc, { n = 20, cash = 1_000_000, items, enabled = true, anchor = 1_000_000 } = {}) {
  const b = db.batch();
  for (let i = 0; i < n; i++) b.set(db.collection("users").doc(`${cc}-s${i}`), { classCode: cc, isAdmin: false, name: `학생${i}`, cash, coupons: 0 });
  b.set(db.collection("users").doc(`${cc}-t`), { classCode: cc, isAdmin: true, isTeacher: true, cash: 9e9 });
  for (const [id, data] of Object.entries(items)) b.set(db.collection("storeItems").doc(`${cc}-${id}`), { classCode: cc, available: true, ...data });
  if (enabled !== null) b.set(db.collection("autoPriceSettings").doc(cc), { enabled, anchor });
  await b.commit();
}
const prices = async (cc) => Object.fromEntries((await db.collection("storeItems").where("classCode", "==", cc).get()).docs.map((d) => [d.id.slice(cc.length + 1), d.data()]));
const cashes = async (cc) => (await db.collection("users").where("classCode", "==", cc).get()).docs.map((d) => d.data().cash).sort().join(",");
const setting = async (cc) => (await db.collection("autoPriceSettings").doc(cc).get()).data();
const ITEMS = { pen: { name: "연필", price: 1000 }, odd: { name: "지우개", price: 105 }, floor: { name: "스티커", price: 100 }, free: { name: "자유 시간 10분", price: 5000 } };

// 1. 자산 2배 → +10% 한 번, 학생 돈 그대로, 제외 아이템 그대로, basePrice 한 번만
await seedClass("A", { cash: 2_000_000, items: ITEMS });
const cashA = await cashes("A");
const r1 = await S.applyAutoPriceForClass("A", "2026-W46");
let p = await prices("A");
ok(r1.multiplier === 1.1 && r1.changed === 3, "자산 2배 → 이번 주 +10%(최대)", JSON.stringify({ m: r1.multiplier, c: r1.changed, ex: r1.excluded }));
ok(p.pen.price === 1100 && p.odd.price === 115 && p.floor.price === 110, "아이템마다 +10% 이내(105→115, 반올림해도 안 넘음)", `${p.pen.price}/${p.odd.price}/${p.floor.price}`);
ok(p.free.price === 5000 && p.free.basePrice === undefined, "자유 시간은 빠진다");
ok(p.pen.basePrice === 1000, "basePrice = 처음 가격");
ok((await cashes("A")) === cashA, "학생·선생님 돈은 그대로");
ok((await setting("A")).anchor === 1_100_000, "기준은 1.1배로 따라감(나머지는 다음 주)");

// 2. 같은 주 다시 → 아무것도 안 함
const r2 = await S.applyAutoPriceForClass("A", "2026-W46");
ok(r2.skipped === "이번 주 이미 적용" && (await prices("A")).pen.price === 1100, "같은 주 두 번째는 건너뛴다");
// 3. 다음 주 → 또 +10%, basePrice 는 덮어쓰지 않음
await S.applyAutoPriceForClass("A", "2026-W47");
p = await prices("A");
ok(p.pen.price === 1210 && p.pen.basePrice === 1000, "다음 주 또 +10%, basePrice 그대로", `${p.pen.price}/${p.pen.basePrice}`);
ok((await setting("A")).history.length === 2, "기록 2줄");

// 4. 동시 실행 5개 → 한 번만
await seedClass("B", { cash: 2_000_000, items: { pen: { name: "연필", price: 1000 } } });
// 충돌한 실행은 오류로 끝나도 된다(다음 금요일·재실행이 이어받는다). 지킬 것은 «두 번 오르지 않는다»뿐.
const rs = await Promise.allSettled(Array.from({ length: 5 }, () => S.applyAutoPriceForClass("B", "2026-W46")));
const applied = rs.filter((r) => r.status === "fulfilled" && r.value.multiplier === 1.1).length;
ok((await prices("B")).pen.price === 1100 && applied === 1 && (await setting("B")).history.length === 1, "동시에 5번 → 한 번만 적용",
  rs.map((r) => r.status === "fulfilled" ? (r.value.skipped || r.value.multiplier) : "충돌:" + String(r.reason?.message).slice(0, 30)).join(" | "));

// 5. 변화 3% 안 → 그대로, 기준 유지
await seedClass("C", { cash: 1_020_000, items: { pen: { name: "연필", price: 1000 } } });
const r5 = await S.applyAutoPriceForClass("C", "2026-W46");
ok(r5.multiplier === 1 && (await prices("C")).pen.price === 1000 && (await setting("C")).anchor === 1_000_000, "2% 변화는 그대로");

// 6. 부자 4명·빚쟁이 4명(20명 중) → 대표값 안 움직임
await seedClass("D", { cash: 1_000_000, items: { pen: { name: "연필", price: 1000 } } });
for (let i = 0; i < 4; i++) await db.collection("users").doc(`D-s${i}`).update({ cash: 900_000_000 });
for (let i = 4; i < 8; i++) await db.collection("users").doc(`D-s${i}`).update({ cash: -50_000_000 });
const r6 = await S.applyAutoPriceForClass("D", "2026-W46");
ok(r6.multiplier === 1 && r6.center === 1_000_000, "튀는 상하위(각 4명)는 계산에서 빠진다", `center=${r6.center}`);

// 7. 꺼진 학급·설정 없는 학급 → 손대지 않음
await seedClass("E", { cash: 3_000_000, items: { pen: { name: "연필", price: 1000 } }, enabled: false });
await seedClass("F", { cash: 3_000_000, items: { pen: { name: "연필", price: 1000 } }, enabled: null });
await S.applyAutoPriceForClass("E", "2026-W46"); await S.applyAutoPriceForClass("F", "2026-W46");
ok((await prices("E")).pen.price === 1000 && (await prices("F")).pen.price === 1000, "꺼진 학급·안 켠 학급은 그대로");

// 8. 건너뛰기
await seedClass("G", { cash: 2_000_000, items: { pen: { name: "연필", price: 1000 } } });
await db.collection("autoPriceSettings").doc("G").update({ skipWeekKey: "2026-W46" });
const r8 = await S.applyAutoPriceForClass("G", "2026-W46");
ok((await prices("G")).pen.price === 1000 && /건너/.test(r8.reason) && (await setting("G")).anchor === 1_000_000, "선생님 건너뛰기 → 그대로·기준 유지");

// 9. 기준 대기(켤 때 자산 0) → 처음 양수가 되면 가격 그대로 두고 기준만
await seedClass("H", { cash: 0, items: { pen: { name: "연필", price: 1000 } }, anchor: 0 });
const r9a = await S.applyAutoPriceForClass("H", "2026-W46");
for (let i = 0; i < 20; i++) await db.collection("users").doc(`H-s${i}`).update({ cash: 700_000 });
const r9b = await S.applyAutoPriceForClass("H", "2026-W47");
ok(/대기/.test(r9a.reason) && /처음/.test(r9b.reason) && (await setting("H")).anchor === 700_000 && (await prices("H")).pen.price === 1000, "기준 대기 → 처음 양수에 기준만 잡음", `${r9a.reason} / ${r9b.reason}`);

// 10. 학생 5명 미만 → 그대로
await seedClass("I", { n: 4, cash: 5_000_000, items: { pen: { name: "연필", price: 1000 } } });
const r10 = await S.applyAutoPriceForClass("I", "2026-W46");
ok((await prices("I")).pen.price === 1000 && r10.multiplier === 1, "학생 4명 → 그대로", r10.reason);

// 11. 대출이 있으면 순자산에서 빠진다(strict 경로가 실제로 읽는다)
await seedClass("J", { cash: 1_500_000, items: { pen: { name: "연필", price: 1000 } } });
for (let i = 0; i < 20; i++) await db.collection("users").doc(`J-s${i}`).collection("products").doc("l").set({ type: "loan", remainingPrincipal: 500_000 });
const r11 = await S.applyAutoPriceForClass("J", "2026-W46");
ok(r11.center === 1_000_000 && r11.multiplier === 1, "대출을 뺀 순자산으로 잰다", `center=${r11.center}`);

// 12. 금요일 일괄 — 켠 학급만, 이미 한 학급은 다시 안 함
const before = (await prices("A")).pen.price;
await seedClass("K", { cash: 2_000_000, items: { pen: { name: "연필", price: 1000 } } });
const all = await S.runAutoPriceAllClasses("2026-W47");
ok((await prices("K")).pen.price === 1100, "금요일 일괄 — 켠 학급 K 적용", JSON.stringify(all));
ok((await prices("A")).pen.price === before, "A 는 W47 이미 적용 — 일괄이 다시 올리지 않음");
ok((await prices("E")).pen.price === 1000 && (await prices("F")).pen.price === 1000, "일괄도 꺼진 학급은 그대로");

console.log(fails ? `AUTO-PRICE-EMU FAIL ${fails}` : "AUTO-PRICE-EMU PASS");
process.exit(fails ? 1 : 0);
