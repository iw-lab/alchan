/**
 * 메모리 Firestore(Admin SDK 모양) — 서버 함수의 **돈 불변식**을 실제로 돌려 보기 위한 최소 구현.
 * 지원: collection/doc/하위 컬렉션, where(==)·limit·get, batch(set/update/delete/commit),
 *       runTransaction(get/set/update/delete — 쓰기는 끝에 한꺼번에), increment·serverTimestamp, Timestamp.
 * 일부러 안 하는 것: 경합 재시도·인덱스·규칙. (경합은 이 시험의 대상이 아니다.)
 */
import { createRequire } from "node:module";

const INC = Symbol("increment");
const STS = Symbol("serverTimestamp");

class Ts {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  static fromMillis(ms) { return new Ts(ms); }
  static fromDate(d) { return new Ts(d.getTime()); }
  static now() { return new Ts(Date.now()); }
}

export function createFakeFirestore(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));
  const writes = [];

  const applyData = (path, data, { merge = false, isUpdate = false } = {}) => {
    if (isUpdate && !store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
    const base = merge || isUpdate ? { ...(store.get(path) || {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      if (v && v[INC] !== undefined) base[k] = (typeof base[k] === "number" ? base[k] : 0) + v[INC];
      else if (v === STS) base[k] = new Ts(Date.now());
      else base[k] = v;
    }
    store.set(path, base);
    writes.push({ path, data });
  };

  const snapOf = (ref) => ({
    id: ref.id, ref, exists: store.has(ref.path),
    data: () => (store.has(ref.path) ? { ...store.get(ref.path) } : undefined),
  });

  const docRef = (path) => ({
    path, id: path.split("/").pop(),
    collection: (name) => colRef(`${path}/${name}`),
    get: async () => snapOf(docRef(path)),
    set: async (data, opt) => applyData(path, data, opt),
    update: async (data) => applyData(path, data, { isUpdate: true }),
  });

  let autoId = 0;
  const queryOf = (colPath, filters = [], lim = Infinity) => ({
    __query: true,
    where: (f, op, v) => {
      if (op !== "==") throw new Error(`fake: 연산자 ${op} 미지원`);
      return queryOf(colPath, [...filters, [f, v]], lim);
    },
    limit: (n) => queryOf(colPath, filters, n),
    get: async () => {
      const depth = colPath.split("/").length + 1;
      const docs = [...store.keys()]
        .filter((p) => p.startsWith(`${colPath}/`) && p.split("/").length === depth)
        .filter((p) => filters.every(([f, v]) => store.get(p)[f] === v))
        .slice(0, lim)
        .map((p) => snapOf(docRef(p)));
      return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
    },
  });
  const colRef = (colPath) => ({
    ...queryOf(colPath),
    doc: (id) => docRef(`${colPath}/${id || `auto${++autoId}`}`),
  });

  const db = {
    collection: (name) => colRef(name),
    doc: (path) => docRef(path),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opt) => ops.push(() => applyData(ref.path, data, opt)),
        update: (ref, data) => ops.push(() => applyData(ref.path, data, { isUpdate: true })),
        delete: (ref) => ops.push(() => store.delete(ref.path)),
        // 실제 배치처럼 전부 아니면 전무: 먼저 사본에 해 보고 통과하면 반영한다.
        commit: async () => {
          const backup = new Map([...store].map(([k, v]) => [k, { ...v }]));
          try { ops.forEach((op) => op()); } catch (e) { store.clear(); backup.forEach((v, k) => store.set(k, v)); throw e; }
        },
      };
    },
    runTransaction: async (fn) => {
      const ops = [];
      let wrote = false;
      const tx = {
        get: async (refOrQuery) => {
          if (wrote) throw new Error("fake: 트랜잭션에서 쓰기 뒤에 읽었다(Firestore 는 거부한다)");
          return refOrQuery.get();
        },
        set: (ref, data, opt) => { wrote = true; ops.push(() => applyData(ref.path, data, opt)); },
        update: (ref, data) => { wrote = true; ops.push(() => applyData(ref.path, data, { isUpdate: true })); },
        delete: (ref) => { wrote = true; ops.push(() => store.delete(ref.path)); },
      };
      const out = await fn(tx);
      const backup = new Map([...store].map(([k, v]) => [k, { ...v }]));
      try { ops.forEach((op) => op()); } catch (e) { store.clear(); backup.forEach((v, k) => store.set(k, v)); throw e; }
      return out;
    },
  };

  const admin = {
    firestore: Object.assign(() => db, {
      FieldValue: { increment: (n) => ({ [INC]: n }), serverTimestamp: () => STS },
      Timestamp: Ts,
    }),
  };

  return {
    db, admin, store, writes, Ts,
    get: (path) => store.get(path),
    /** 학급 전체 현금 합(학생 + 국고) — 보존 불변식 확인용 */
    totalCash: (classCode) => [...store].filter(([p, v]) => /^users\/[^/]+$/.test(p) && v.classCode === classCode).reduce((t, [, v]) => t + (Number(v.cash) || 0), 0),
    logs: (type) => [...store].filter(([p, v]) => p.startsWith("activity_logs/") && (!type || v.type === type)).map(([, v]) => v),
  };
}

/**
 * functions/utils.js 를 가짜로 바꿔 끼운다(require.cache). 반환된 restore() 로 되돌린다.
 * @param {NodeRequire} require createRequire 로 만든 require
 */
export function installFakeUtils(require, fake, utilsPath) {
  const resolved = require.resolve(utilsPath);
  const prev = require.cache[resolved];
  // firebase-functions 는 functions/node_modules 에 있다 — 그 폴더 기준으로 찾는다(CI 도 vitest 전에 설치한다).
  const { HttpsError } = createRequire(resolved)("firebase-functions/v2/https");
  const hasAdminPower = (u) => u?.isSuperAdmin === true || (u?.isAdmin === true && u?.isApproved === true);
  const exports = {
    db: fake.db, admin: fake.admin,
    logger: { info() {}, warn() {}, error() {}, log() {} },
    hasAdminPower,
    hasTeacherPower: hasAdminPower,
    bumpCatalogVersion: async () => {},
    bumpInventoryVersion: async () => {},
    LOG_TYPES: new Proxy({}, { get: (_t, k) => String(k) }),
    logActivity: async () => {},
    sanitizeInput: (v) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim() : v),
    sanitizeObject: (o) => o,
    assertIdempotent: async () => null,
    checkAuthAndGetUserData: async (request) => {
      if (!request?.auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
      const snap = await fake.db.collection("users").doc(request.auth.uid).get();
      if (!snap.exists) throw new HttpsError("not-found", "사용자 정보가 없습니다.");
      const userData = snap.data();
      return { uid: request.auth.uid, classCode: userData.classCode, userData };
    },
    findApprovedAdminSnap: async (classCode) => {
      const snap = await fake.db.collection("users").where("classCode", "==", classCode).where("isAdmin", "==", true).get();
      const docs = snap.docs.filter((d) => hasAdminPower(d.data()));
      return { empty: docs.length === 0, docs, size: docs.length };
    },
    checkIdempotent: async (tx, key) => {
      if (!key || typeof key !== "string") return null;
      const ref = fake.db.collection("idempotencyKeys").doc(key);
      const snap = await tx.get(ref);
      if (snap.exists) throw new HttpsError("already-exists", "이미 처리된 요청입니다. (중복 결제 차단)");
      return ref;
    },
    markIdempotent: (tx, ref) => { if (ref) tx.set(ref, { createdAt: Date.now() }); },
  };
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports, children: [], paths: [] };
  return () => { if (prev) require.cache[resolved] = prev; else delete require.cache[resolved]; };
}
