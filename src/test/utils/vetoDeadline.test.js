// 재의결 기한 = 거부 시각(vetoDate) + 7일, 지나면 폐기 — 화면·rules·서버 세 곳이 같은 기준인지 못 박는다.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { VETO_OVERRIDE_DAYS, vetoDeadlineOf, isVetoDiscarded } from "../../utils/vetoDeadline";
import * as server from "../../../functions/vetoExpiry.js";

const DAY = 24 * 60 * 60 * 1000;
const ts = (d) => ({ toDate: () => new Date(d) }); // Firestore Timestamp 모양
const VETOED_AT = Date.parse("2026-10-01T03:00:00Z");

describe("재의결 기한 — 화면 헬퍼", () => {
  it("기한 = vetoDate + 7일 (Timestamp·ISO 문자열 모두)", () => {
    expect(vetoDeadlineOf({ vetoDate: ts(VETOED_AT) }).getTime()).toBe(VETOED_AT + 7 * DAY);
    expect(vetoDeadlineOf({ vetoDate: new Date(VETOED_AT).toISOString() }).getTime()).toBe(VETOED_AT + 7 * DAY);
  });
  it("기기 시각으로 적힌 vetoDeadline 은 기준이 아니다 — vetoDate 없으면 기한 없음", () => {
    expect(vetoDeadlineOf({ vetoDeadline: ts(VETOED_AT) })).toBeNull();
    expect(isVetoDiscarded({ status: "vetoed", vetoDeadline: ts(0) }, new Date())).toBe(false);
  });
  it("기한 직전엔 진행 중, 기한 순간부터 폐기", () => {
    const law = { status: "vetoed", vetoDate: ts(VETOED_AT) };
    expect(isVetoDiscarded(law, new Date(VETOED_AT + 7 * DAY - 1))).toBe(false);
    expect(isVetoDiscarded(law, new Date(VETOED_AT + 7 * DAY))).toBe(true);
  });
  it("서버가 확정한 veto_expired 는 언제나 폐기, 다른 상태는 기한과 무관", () => {
    expect(isVetoDiscarded({ status: "veto_expired" })).toBe(true);
    expect(isVetoDiscarded({ status: "veto_overridden", vetoDate: ts(0) })).toBe(false);
  });
});

describe("재의결 기한 — 서버 확정(functions/vetoExpiry)", () => {
  const fakeDb = (docs) => {
    const updates = [];
    const snapDocs = docs.map((d) => ({
      data: () => d.data,
      updateTime: d.updateTime || "t0",
      ref: {
        path: `classes/C1/nationalAssemblyLaws/${d.id}`,
        update: vi.fn(async (data, pre) => {
          if (d.fail) throw d.fail;
          updates.push({ id: d.id, data, pre });
        }),
      },
    }));
    const db = {
      collectionGroup: (name) => {
        expect(name).toBe("nationalAssemblyLaws");
        return { select: () => ({ get: async () => ({ size: snapDocs.length, docs: snapDocs }) }) };
      },
    };
    return { db, updates };
  };

  it("기한 지난 vetoed 만 veto_expired 로, 읽은 시점 조건(lastUpdateTime)을 걸어서", async () => {
    const now = new Date(VETOED_AT + 8 * DAY);
    const { db, updates } = fakeDb([
      { id: "old", data: { status: "vetoed", vetoDate: ts(VETOED_AT) }, updateTime: "u1" },
      { id: "fresh", data: { status: "vetoed", vetoDate: ts(VETOED_AT + 2 * DAY) } },
      { id: "noDate", data: { status: "vetoed" } },
      { id: "passed", data: { status: "veto_overridden", vetoDate: ts(VETOED_AT) } },
    ]);
    const r = await server.expireVetoedLaws(db, now);
    expect(r).toEqual({ scanned: 4, expired: 1, skipped: 0, errors: [] });
    expect(updates).toEqual([{ id: "old", data: { status: "veto_expired", vetoExpiredAt: now, updatedAt: now }, pre: { lastUpdateTime: "u1" } }]);
  });

  it("그 사이 바뀐 문서(FAILED_PRECONDITION)는 건너뛰고, 다른 실패는 errors 로 올린다", async () => {
    const now = new Date(VETOED_AT + 8 * DAY);
    const { db } = fakeDb([
      { id: "raced", data: { status: "vetoed", vetoDate: ts(VETOED_AT) }, fail: Object.assign(new Error("x"), { code: 9 }) },
      { id: "broken", data: { status: "vetoed", vetoDate: ts(VETOED_AT) }, fail: new Error("quota") },
    ]);
    const r = await server.expireVetoedLaws(db, now);
    expect(r.skipped).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/broken: quota/);
  });

  it("세 곳의 기한이 같다 — 화면 7일 · 서버 7일 · rules duration.value(7, 'd')", () => {
    expect(server.VETO_OVERRIDE_DAYS).toBe(VETO_OVERRIDE_DAYS);
    const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
    const fn = rules.slice(rules.indexOf("function naVetoOpen"));
    expect(rules.indexOf("function naVetoOpen")).toBeGreaterThan(-1);
    expect(fn.slice(0, 300)).toContain(`law.vetoDate + duration.value(${VETO_OVERRIDE_DAYS}, 'd')`);
  });
});
