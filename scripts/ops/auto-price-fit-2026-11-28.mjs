#!/usr/bin/env node
/**
 * 자동 물가 «맞는 값 따라가기» 운영 스크립트 (2026-11-28 «폭등을 1.33으로 · 가격은 일주일마다 최대 50%씩 맞춰가»)
 *
 *   events                — 모든 학급 설정에서 store_price_up 배율이 **기본값 2 그대로**인 것만 1.33 으로
 *                           (선생님이 바꾼 값은 안 건드린다)
 *   seed <학급> <배율>     — 그 학급 아이템의 맞는 값(fairPrice) = 지금 가격 × 배율(제외 아이템은 뺀다).
 *                           가격은 안 바꾼다 — 금요일 자동 물가가 한 주 최대 ±50%씩 그 값으로 당긴다.
 *
 * 기본은 미리보기. 실제로 쓰려면 --apply. 쓰기는 문서의 updateTime 을 조건으로 건다
 * (그 사이 누가 고쳤으면 실패). 학급 코드는 인자로만 받는다(저장소가 공개라 적지 않는다).
 */
import { authHeaders, firestoreBase } from "./_firestore-rest.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const apply = rest.includes("--apply");
const args = rest.filter((a) => a !== "--apply");
const h = await authHeaders();
const base = firestoreBase();
const num = (v) => (v?.integerValue !== undefined ? Number(v.integerValue) : v?.doubleValue);

const patch = async (name, fields, mask, updateTime) => {
  const q =
    mask.map((m) => `updateMask.fieldPaths=${m}`).join("&") +
    `&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  const r = await fetch(`https://firestore.googleapis.com/v1/${name}?${q}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`${name.split("/").pop()}: ${r.status} ${(await r.text()).slice(0, 200)}`);
};

if (cmd === "events") {
  const j = await (await fetch(`${base}/economicEventSettings?pageSize=300`, { headers: h })).json();
  for (const d of j.documents || []) {
    const id = d.name.split("/").pop();
    const evs = d.fields?.events?.arrayValue?.values || [];
    const ev = evs.find((e) => e.mapValue?.fields?.id?.stringValue === "store_price_up");
    const m = num(ev?.mapValue?.fields?.params?.mapValue?.fields?.multiplier);
    if (!ev || m !== 2) {
      console.log(`${id}: 그대로(${ev ? `배율 ${m}` : "이벤트 없음"})`);
      continue;
    }
    const f = ev.mapValue.fields;
    f.params.mapValue.fields.multiplier = { doubleValue: 1.33 };
    f.title = { stringValue: "물가 상승!" };
    f.description = { stringValue: "인플레이션으로 관리자 상점의 모든 상품 가격이 33% 올랐습니다!" };
    if (apply) await patch(d.name, { events: d.fields.events }, ["events"], d.updateTime);
    console.log(`${id}: 2 → 1.33 ${apply ? "✅ 씀" : "(미리보기)"}`);
  }
} else if (cmd === "seed") {
  const [classCode, factorRaw] = args;
  const factor = Number(factorRaw);
  if (!classCode || !(factor > 0 && factor <= 5)) {
    console.error("사용: seed <학급코드> <배율 0~5> [--apply]");
    process.exit(2);
  }
  const r = await fetch(`${base}:runQuery`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "storeItems" }],
        where: {
          fieldFilter: { field: { fieldPath: "classCode" }, op: "EQUAL", value: { stringValue: classCode } },
        },
        limit: 500,
      },
    }),
  });
  const docs = (await r.json()).filter((x) => x.document).map((x) => x.document);
  for (const d of docs) {
    const f = d.fields || {};
    const name = f.name?.stringValue || "";
    const price = num(f.price);
    if (f.excludeFromEconomicEvent?.booleanValue === true || /자유 ?시간/.test(name) || !(price > 0)) {
      console.log(`  제외  ${name}`);
      continue;
    }
    const fair = Math.max(100, Math.round(price * factor));
    if (apply) await patch(d.name, { fairPrice: { integerValue: String(fair) } }, ["fairPrice"], d.updateTime);
    console.log(
      `  ${name.padEnd(14)} 지금 ${price.toLocaleString()} → 맞는 값 ${fair.toLocaleString()} ${apply ? "✅" : "(미리보기)"}`,
    );
  }
} else {
  console.error("사용: events [--apply] | seed <학급코드> <배율> [--apply]");
  process.exit(2);
}
