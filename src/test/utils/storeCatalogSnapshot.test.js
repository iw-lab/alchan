// 상점 목록 스냅샷 — «학급이 늘어도 읽기가 덜 늘게» (2026-11-14).
// 실측(14일·3학급): getItemContextData 가 전체 호출의 30%, 상점 품목 읽기가 전체 읽기의 ~26%.
// 스냅샷을 잘못 쓰면 «바꿨는데 그대로»가 되므로, 쓰는 조건을 여기서 못 박는다.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { isStoreCatalogSnapshotUsable: ok, STORE_CATALOG_SNAPSHOT_TTL_MS: TTL } = require("../../../functions/storeCatalogSnapshot.js");
const NOW = 1_800_000_000_000;
const snap = (over = {}) => ({ items: [{ id: "a" }], catalogVersion: "5", builtAtMs: NOW - 1000, ...over });

describe("스냅샷을 써도 되는 조건", () => {
  it("버전이 같고 방금 만든 것은 쓴다", () => {
    expect(ok(snap(), "5", NOW)).toBe(true);
  });
  it("⭐ 가격·목록이 바뀌어 버전이 오르면 안 쓴다", () => {
    expect(ok(snap(), "6", NOW)).toBe(false);
  });
  it("⭐ 10분이 지나면 안 쓴다(재고가 그보다 오래 묵지 않게)", () => {
    expect(ok(snap({ builtAtMs: NOW - TTL }), "5", NOW)).toBe(false);
    expect(ok(snap({ builtAtMs: NOW - TTL + 1 }), "5", NOW)).toBe(true);
    expect(TTL).toBeLessThanOrEqual(10 * 60 * 1000);
  });
  it("없는 문서·깨진 문서·미래 시각은 안 쓴다", () => {
    expect(ok(undefined, "5", NOW)).toBe(false);
    expect(ok(snap({ items: null }), "5", NOW)).toBe(false);
    expect(ok(snap({ builtAtMs: "x" }), "5", NOW)).toBe(false);
    expect(ok(snap({ builtAtMs: NOW + 5000 }), "5", NOW)).toBe(false);
    expect(ok(snap({ catalogVersion: undefined }), undefined, NOW)).toBe(false);
  });
});

describe("배선", () => {
  const fn = readFileSync("functions/index.js", "utf8");
  const start = fn.indexOf("exports.getItemContextData = onCall(");
  const body = fn.slice(start, fn.indexOf("\nexports.", start + 10));
  const mod = readFileSync("functions/storeCatalogSnapshot.js", "utf8");
  it("⭐ 내가 방금 바꾼 뒤(fresh)와 옛 화면(값 없음)은 전처럼 전부 읽는다", () => {
    expect(body).toContain("const wantFresh = request.data?.fresh !== false;");
    expect(body).toContain("loadStoreItems({ db, logger, classCode, wantFresh })");
    expect(mod).toMatch(/if \(!wantFresh\) \{[\s\S]*?isStoreCatalogSnapshotUsable\(/);
  });
  it("스냅샷은 버전을 읽은 길에서만 쓰고, catalogMeta 는 읽기만 한다", () => {
    expect(mod).toMatch(/catalogVersion !== null && list\.length <= STORE_CATALOG_SNAPSHOT_MAX_ITEMS/);
    expect(mod).not.toMatch(/collection\("catalogMeta"\)\.doc\(classCode\)\.(set|update)/);
  });
  it("⭐ 화면은 쓰기 뒤 갱신(force)일 때만 fresh 를 보낸다", () => {
    expect(readFileSync("src/contexts/ItemContext.js", "utf8")).toContain("getItemContextData({ fresh: force })");
  });
  it("스냅샷 문서는 화면에서 직접 못 읽는다(규칙에 길이 없다 → 기본 거부)", () => {
    expect(readFileSync("firestore.rules", "utf8")).not.toContain("match /storeCatalog/");
  });
  it("⭐ 파킹 이자는 오늘 이미 성공한 기기에서 다시 부르지 않는다", () => {
    const src = readFileSync("src/pages/banking/ParkingAccount.js", "utf8");
    expect(src).toMatch(/if \(!accruedToday\) \{\s*try \{\s*await httpsCallable\(functions, "accrueParkingInterest"\)\(\);/);
    expect(src).toContain("localStorage.setItem(accruedKey, today)");
  });
});
