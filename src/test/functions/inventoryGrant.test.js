/**
 * 인벤토리 지급 — `functions/inventoryGrant.js`.
 *
 * 여기서 지키는 불변식 셋. 셋 다 2026-09-15 교차검증에서 4계열이 같은 지점을 지목해 나왔다.
 *   ① 정본 문서(id = itemId)는 **없을 때도** 트랜잭션 읽기에 포함된다 — 없는 문서를 읽어 두지
 *      않으면 동시 첫 지급 둘이 서로를 못 보고 각자 set 해서 한쪽 수량이 사라진다(팬텀).
 *   ② 레거시(문서 id ≠ itemId) 문서가 여럿이면 **문서 id 순으로 결정적으로** 고른다 —
 *      호출마다 대상이 바뀌면 같은 아이템 수량이 여러 문서로 흩어진다.
 *   ③ 수량은 언제나 increment, 신규 문서도 merge — 절대값 set 은 앞선 지급을 덮어쓴다.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { readInventoryGrantTarget, writeInventoryGrant } = require_(
  "../../../functions/inventoryGrant.js",
);

const INC = (n) => ({ __inc: n });
const TS = () => ({ __ts: true });
const deps = { increment: INC, serverTimestamp: TS, warn: vi.fn() };

/** 인벤토리 컬렉션 목. docs = [{id, itemId}] */
function fakeCol(docs) {
  const mk = (id) => ({ id, path: `inventory/${id}` });
  return {
    doc: (id) => mk(id),
    where: (field, op, value) => ({ __q: { field, op, value } }),
    __docs: docs,
  };
}

/** transaction.get 목 — DocumentRef 면 존재 여부, Query 면 매칭 문서들. */
function fakeTx(col, existingIds) {
  return {
    get: async (target) => {
      if (target.__q) {
        const value = target.__q.value;
        const docs = col.__docs
          .filter((d) => d.itemId === value)
          .map((d) => ({ id: d.id, ref: { id: d.id, path: `inventory/${d.id}` } }));
        return { docs };
      }
      return { exists: existingIds.includes(target.id) };
    },
    update: vi.fn(),
    set: vi.fn(),
  };
}

describe("① 정본 문서 우선 + 부재도 읽기에 포함", () => {
  it("정본이 있으면 그 문서를 쓴다", async () => {
    const col = fakeCol([{ id: "ps_x", itemId: "ps_x" }]);
    const tx = fakeTx(col, ["ps_x"]);
    const t = await readInventoryGrantTarget(tx, col, "ps_x");
    expect(t.exists).toBe(true);
    expect(t.ref.id).toBe("ps_x");
  });

  it("아무것도 없으면 정본 ref 를 대상으로 잡고 exists=false", async () => {
    const col = fakeCol([]);
    const tx = fakeTx(col, []);
    const t = await readInventoryGrantTarget(tx, col, "ps_new");
    expect(t).toMatchObject({ exists: false, duplicates: 0 });
    expect(t.ref.id).toBe("ps_new");
  });

  it("정본 ref 를 전달해 읽는다 — 부재 락이 걸리는 자리", async () => {
    const col = fakeCol([]);
    const tx = fakeTx(col, []);
    const spy = vi.spyOn(tx, "get");
    await readInventoryGrantTarget(tx, col, "ps_new");
    const readDocIds = spy.mock.calls.map(([a]) => a.id).filter(Boolean);
    expect(readDocIds).toContain("ps_new");
  });
});

describe("② 레거시 중복은 결정적으로 고른다", () => {
  it("정본이 없고 레거시가 여럿이면 문서 id 오름차순 첫 번째", async () => {
    const col = fakeCol([
      { id: "zzz", itemId: "itemA" },
      { id: "aaa", itemId: "itemA" },
      { id: "mmm", itemId: "itemA" },
    ]);
    const tx = fakeTx(col, []);
    const t = await readInventoryGrantTarget(tx, col, "itemA");
    expect(t.ref.id).toBe("aaa");
    expect(t.exists).toBe(true);
    expect(t.duplicates).toBe(2);
  });

  it("정본이 있으면 레거시는 중복으로만 센다", async () => {
    const col = fakeCol([
      { id: "itemA", itemId: "itemA" },
      { id: "old1", itemId: "itemA" },
    ]);
    const tx = fakeTx(col, ["itemA"]);
    const t = await readInventoryGrantTarget(tx, col, "itemA");
    expect(t.ref.id).toBe("itemA");
    expect(t.duplicates).toBe(1);
  });
});

describe("③ 수량은 increment, 신규도 merge", () => {
  it("기존 문서는 update + increment", () => {
    const tx = fakeTx(fakeCol([]), []);
    writeInventoryGrant(
      tx,
      { ref: { id: "a" }, exists: true, duplicates: 0 },
      3,
      { name: "사탕" },
      "test",
      deps,
    );
    expect(tx.update).toHaveBeenCalledWith({ id: "a" }, { quantity: INC(3), updatedAt: TS() });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("신규 문서도 절대값이 아니라 increment + merge 로 쓴다", () => {
    const tx = fakeTx(fakeCol([]), []);
    writeInventoryGrant(
      tx,
      { ref: { id: "b" }, exists: false, duplicates: 0 },
      2,
      { name: "껌", itemId: "b" },
      "test",
      deps,
    );
    const [, payload, opts] = tx.set.mock.calls[0];
    expect(payload.quantity).toEqual(INC(2));
    expect(opts).toEqual({ merge: true });
  });

  it("중복 문서가 있으면 경고를 남긴다(잔존 건수 실측용)", () => {
    const warn = vi.fn();
    const tx = fakeTx(fakeCol([]), []);
    writeInventoryGrant(
      tx,
      { ref: { id: "c" }, exists: true, duplicates: 2 },
      1,
      {},
      "buyMarketItem",
      { ...deps, warn },
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("중복 2건");
  });
});
