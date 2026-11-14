/**
 * 상점 목록 스냅샷(storeCatalog/{classCode}) — getItemContextData 가 품목 전부를 매번 읽지 않게 한다.
 * 쓰는 조건은 이 한 함수로만 판정한다(시험: src/test/utils/storeCatalogSnapshot.test.js).
 */
const STORE_CATALOG_SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const STORE_CATALOG_SNAPSHOT_MAX_ITEMS = 300; // 문서 1MB 한도 여유

/**
 * @param {object|undefined} snap 스냅샷 문서 데이터
 * @param {string} catalogVersion 지금의 catalogMeta 버전(밀리초 글자)
 * @param {number} nowMs 지금 시각
 * @return {boolean} 버전이 같고 10분 안에 만든 스냅샷이면 true
 */
const isStoreCatalogSnapshotUsable = (snap, catalogVersion, nowMs) =>
  !!snap &&
  Array.isArray(snap.items) &&
  typeof catalogVersion === "string" &&
  snap.catalogVersion === catalogVersion &&
  Number.isFinite(snap.builtAtMs) &&
  nowMs - snap.builtAtMs >= 0 &&
  nowMs - snap.builtAtMs < STORE_CATALOG_SNAPSHOT_TTL_MS;

/**
 * 학급 상점 목록을 돌려준다 — fresh 가 아니면 스냅샷 1문서, 못 쓰면 전 품목을 읽고 스냅샷을 다시 만든다.
 * catalogMeta 는 **읽기만** 한다(버전을 올리는 정본은 utils.bumpCatalogVersion 하나).
 *
 * @param {object} p 인자
 * @param {FirebaseFirestore.Firestore} p.db Firestore
 * @param {object} p.logger 로거
 * @param {string} p.classCode 학급 코드
 * @param {boolean} p.wantFresh true 면 스냅샷을 보지 않고 전부 읽는다(읽기·쓰기를 더 얹지 않는다)
 * @return {Promise<Array<object>>} 정렬된 상점 품목
 */
const loadStoreItems = async ({ db, logger, classCode, wantFresh }) => {
  const snapshotRef = db.collection("storeCatalog").doc(classCode);
  let catalogVersion = null;
  if (!wantFresh) {
    const [metaDoc, snapDoc] = await Promise.all([
      db.collection("catalogMeta").doc(classCode).get(),
      snapshotRef.get(),
    ]);
    catalogVersion = String(metaDoc.data()?.version?.toMillis?.() ?? 0);
    if (isStoreCatalogSnapshotUsable(snapDoc.data(), catalogVersion, Date.now())) {
      return snapDoc.data().items;
    }
  }
  const storeItemsSnapshot = await db
    .collection("storeItems")
    .where("classCode", "==", classCode)
    .get();
  const list = storeItemsSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
  // 스냅샷은 «버전을 이미 읽은» 길에서만 쓴다. 실패해도 응답은 그대로 — 다음 호출이 다시 만든다.
  if (catalogVersion !== null && list.length <= STORE_CATALOG_SNAPSHOT_MAX_ITEMS) {
    await snapshotRef
      .set({ items: list, catalogVersion, builtAtMs: Date.now() })
      .catch((e) =>
        logger.warn(`[storeCatalog] 스냅샷 저장 실패(비치명) ${classCode}:`, e?.message),
      );
  }
  return list;
};

module.exports = {
  loadStoreItems,
  STORE_CATALOG_SNAPSHOT_TTL_MS,
  STORE_CATALOG_SNAPSHOT_MAX_ITEMS,
  isStoreCatalogSnapshotUsable,
};
