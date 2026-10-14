// scripts/ops/return-stuck-market-listings-2026-10-14.mjs
// 🧺 옛 아이템 장터(marketListings)에 «판매 중»으로 묶인 아이템을 판매자 인벤토리로 돌려준다.
//
// 왜: 장터 구매 화면(ItemMarket)은 2026-02-27 에 삭제됐고, 2026-10-14 에 남은 백엔드
//   (listUserItemForSale·buyMarketItem·cancelMarketSale)도 호출자 0 으로 걷어냈다.
//   등록 시 판매자 인벤토리에서 빠진 아이템은 매물 문서에만 남아 있어, 살 사람도 취소할 방법도 없다
//   (운영 2026-10-14 실측: CLASS2025 활성 매물 3건, 각 1개).
//
// 하는 일(매물 1건당 원자적 commit 1회):
//   users/{sellerId}/inventory/{itemId}.quantity 를 매물 수량만큼 increment
//   (문서가 없으면 매물의 name·icon·description·type 으로 만든다 — 있으면 메타는 건드리지 않는다)
//   marketListings/{id}.status = "returned", returnedAt = 지금 (status 가 아직 active 일 때만)
//
// 기본은 dry-run. 실제 반영은 --apply.
//   node scripts/ops/return-stuck-market-listings-2026-10-14.mjs [--apply]
//   에뮬레이터 시험: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node … --apply
import { authHeaders, firestoreBase, firestoreProject } from "./_firestore-rest.mjs";

const APPLY = process.argv.includes("--apply");
const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const headers = EMU
  ? { authorization: "Bearer owner", "content-type": "application/json" }
  : await authHeaders();
const base = EMU
  ? `http://${EMU}/v1/projects/${firestoreProject()}/databases/(default)/documents`
  : firestoreBase();
const dbRoot = base.replace(/\/documents$/, "");

const res = await fetch(`${base}:runQuery`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "marketListings" }],
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "active" } } },
    },
  }),
});
if (!res.ok) throw new Error(`조회 실패 HTTP ${res.status}`);
const listings = (await res.json()).filter((r) => r.document).map((r) => r.document);
console.log(`활성 매물 ${listings.length}건`);

for (const doc of listings) {
  const f = doc.fields;
  const sellerId = f.sellerId?.stringValue;
  const itemId = f.itemId?.stringValue;
  const qty = Number(f.quantity?.integerValue ?? f.quantity?.doubleValue);
  const id = doc.name.split("/").pop();
  if (!sellerId || !itemId || !Number.isInteger(qty) || qty <= 0) {
    console.log(`  건너뜀 ${id}: 판매자·아이템·수량이 올바르지 않음`);
    continue;
  }
  const invName = `${doc.name.replace(/\/marketListings\/[^/]+$/, "")}/users/${sellerId}/inventory/${itemId}`;
  const inv = await fetch(`${base}/users/${sellerId}/inventory/${itemId}`, { headers });
  const invExists = inv.ok;
  console.log(`  ${APPLY ? "" : "[dry-run] "}${id}: ${f.name?.stringValue || itemId} ×${qty} → 판매자 인벤토리(${invExists ? "기존 문서에 더함" : "새 문서"})`);
  if (!APPLY) continue;

  const meta = invExists ? {} : {
    itemId: { stringValue: itemId },
    name: f.name || { stringValue: "아이템" },
    icon: f.icon || { stringValue: "🔮" },
    description: f.description || { stringValue: "" },
    type: f.type || { stringValue: "general" },
  };
  const now = new Date().toISOString();
  const body = {
    writes: [
      {
        update: { name: invName, fields: meta },
        updateMask: { fieldPaths: Object.keys(meta) },
        updateTransforms: [{ fieldPath: "quantity", increment: { integerValue: String(qty) } }],
      },
      {
        update: {
          name: doc.name,
          fields: { status: { stringValue: "returned" }, returnedAt: { timestampValue: now } },
        },
        updateMask: { fieldPaths: ["status", "returnedAt"] },
        // 그 사이 상태가 바뀌었으면(누가 처리했으면) 통째로 실패 → 이중 반환 없음
        currentDocument: { updateTime: doc.updateTime },
      },
    ],
  };
  const c = await fetch(`${dbRoot}/documents:commit`, { method: "POST", headers, body: JSON.stringify(body) });
  console.log(`    ${c.ok ? "반환 완료" : `실패 HTTP ${c.status}`}`);
}
if (!APPLY && listings.length) console.log("실제로 돌려주려면 --apply");
