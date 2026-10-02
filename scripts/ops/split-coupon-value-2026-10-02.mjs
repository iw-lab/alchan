#!/usr/bin/env node
/**
 * 쿠폰 가치를 학급별로 나눈다(2026-10-02). 전역 settings/mainSettings.couponValue 를 3학급이 같이 써서
 * 한 교사가 바꾸면 모든 반의 쿠폰 현금화·기부·순자산이 바뀌었다. 코드는 이제 classSettings/{cc}/settings/coupon 을 읽는다.
 *
 * 이 스크립트는 «배포 직전» 지금의 전역 값을 각 학급 문서로 복사한다 — 배포 순간 어느 반도 쿠폰 가치가 바뀌지 않게.
 *   · 대상 학급 = 승인된 교사(isAdmin) 계정의 classCode 전부
 *   · 이미 학급 문서가 있으면 건드리지 않는다(currentDocument.exists=false 전제조건). 그 값이 전역과 다르면 멈춘다
 *   · 전역 값이 정상 범위(정수 1~1,000,000)가 아니면 멈춘다
 * 실행: node scripts/ops/split-coupon-value-2026-10-02.mjs          (미리보기)
 *       node scripts/ops/split-coupon-value-2026-10-02.mjs --apply  (쓰기)
 */
import { firestoreBase, authHeaders, plain } from "./_firestore-rest.mjs";

const APPLY = process.argv.includes("--apply");
const MAX = 1000000;
const BASE = firestoreBase();
const H = await authHeaders();

const ms = await fetch(`${BASE}/settings/mainSettings`, { headers: H });
if (!ms.ok) throw new Error(`mainSettings 읽기 실패 ${ms.status}`);
const v = Number(plain((await ms.json()).fields).couponValue);
if (!Number.isInteger(v) || v < 1 || v > MAX) throw new Error(`전역 쿠폰 가치가 비정상(${v}) — 손으로 확인할 것`);

const q = await fetch(`${BASE}:runQuery`, { method: "POST", headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "users" }],
    where: { fieldFilter: { field: { fieldPath: "isAdmin" }, op: "EQUAL", value: { booleanValue: true } } },
    select: { fields: [{ fieldPath: "classCode" }] } } }) });
if (!q.ok) throw new Error(`교사 조회 실패 ${q.status}`);
const classes = [...new Set((await q.json()).filter((x) => x.document)
  .map((x) => plain(x.document.fields).classCode).filter((c) => typeof c === "string" && c && c !== "미지정"))].sort();
console.log(`전역 쿠폰 가치 ${v} → 학급 ${classes.length}곳: ${classes.join(", ")}`);

let made = 0, kept = 0;
for (const cc of classes) {
  const path = `classSettings/${cc}/settings/coupon`;
  const cur = await fetch(`${BASE}/${path}`, { headers: H });
  if (cur.status === 200) {
    // 이미 있는 값이 전역과 다르면 배포 순간 그 반의 쿠폰 가치가 바뀐다 — 덮지도 넘기지도 않고 멈춘다(사람이 판단)
    const have = Number(plain((await cur.json()).fields).couponValue);
    if (have !== v) throw new Error(`${path} 가 이미 ${have} (전역 ${v}) — 어느 값이 맞는지 확인할 것`);
    console.log(`  ${cc}: 이미 ${have} — 그대로`); kept++; continue;
  }
  if (cur.status !== 404) throw new Error(`${path} 읽기 실패 ${cur.status}`);
  if (!APPLY) { console.log(`  ${cc}: 만들 예정 couponValue=${v}`); continue; }
  const w = await fetch(`${BASE}/${path}?currentDocument.exists=false`, { method: "PATCH",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ fields: { couponValue: { integerValue: String(v) }, updatedAt: { timestampValue: new Date().toISOString() } } }) });
  if (!w.ok) throw new Error(`${path} 쓰기 실패 ${w.status} ${(await w.text()).slice(0, 200)}`);
  console.log(`  ${cc}: ✅ couponValue=${v}`); made++;
}
console.log(APPLY ? `완료 — 새로 ${made} · 유지 ${kept}` : "미리보기 — --apply 로 쓴다");
