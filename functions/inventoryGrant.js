/**
 * 인벤토리 지급 대상 확정·쓰기 — 아이템 시장(구매·취소복원·제안수락) 공용.
 *
 * 왜 모듈로 뺐나: 같은 20줄이 `buyMarketItem`·`cancelMarketSale`·`respondToOffer` 세 곳에
 * 복붙돼 있었고, 세 사본이 **똑같이** 세 가지를 틀렸다(2026-09-15 교차검증에서 4계열이
 * 독립적으로 같은 지점을 지목).
 *
 *   ① runTransaction 안에서 `transaction.get` 이 아니라 일반 `.get()` 으로 읽었다
 *      → 읽은 문서가 트랜잭션 락에 안 들어간다.
 *   ② 그 읽기가 **현금 차감·세금 입금 쓰기 뒤**에 있었다(읽기-선행 규칙 회피).
 *   ③ 결과가 비면 `set(...)` 으로 통째로 덮어썼다 → 같은 아이템 첫 지급이 동시에 오면
 *      한쪽 수량이 사라진다. 쿼리는 **없는 문서에 락을 걸지 못한다**(팬텀).
 *
 * 처방: 문서 id = itemId 인 **정본 문서를 `transaction.get` 으로 읽어** 부재에도 락이 걸리게
 * 하고(없는 키를 읽어 두면 그 키가 트랜잭션에 포함된다), 레거시(문서 id ≠ itemId) 문서는
 * 쿼리로 같이 읽는다. 쓰기는 항상 `increment` + `merge`.
 */

/**
 * 지급 대상 문서를 **트랜잭션 읽기 단계에서** 확정한다(모든 쓰기보다 앞에서 호출할 것).
 *
 * @param {object} transaction Firestore 트랜잭션
 * @param {object} col users/{uid}/inventory 컬렉션 ref
 * @param {string} itemId
 * @returns {Promise<{ref: object, exists: boolean, duplicates: number}>}
 */
async function readInventoryGrantTarget(transaction, col, itemId) {
  const canonicalRef = col.doc(itemId);
  const [canonicalDoc, legacySnap] = await Promise.all([
    transaction.get(canonicalRef),
    transaction.get(col.where("itemId", "==", itemId)),
  ]);
  // 문서 id 순 정렬 — `docs[0]` 이 호출마다 달라지면 같은 아이템 수량이 여러 문서로 흩어진다.
  const legacyDocs = (legacySnap.docs || [])
    .filter((d) => d.id !== itemId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  if (canonicalDoc.exists) {
    return { ref: canonicalRef, exists: true, duplicates: legacyDocs.length };
  }
  if (legacyDocs.length > 0) {
    return { ref: legacyDocs[0].ref, exists: true, duplicates: legacyDocs.length - 1 };
  }
  return { ref: canonicalRef, exists: false, duplicates: 0 };
}

/**
 * 확정된 대상에 수량을 더한다. 수량은 **항상 increment**, 신규 문서도 merge 로 쓴다
 * (재시도·동시 지급에서 절대값 set 이 앞선 지급을 덮어쓰는 것을 막는다).
 *
 * @param payload quantity 를 제외한 메타(name·icon·type 등)
 * @param deps {increment, serverTimestamp, warn}
 */
function writeInventoryGrant(transaction, target, quantity, payload, tag, deps) {
  const now = deps.serverTimestamp();
  const inc = deps.increment(quantity);
  if (target.exists) {
    transaction.update(target.ref, { quantity: inc, updatedAt: now });
  } else {
    transaction.set(
      target.ref,
      { ...payload, quantity: inc, updatedAt: now },
      { merge: true },
    );
  }
  if (target.duplicates > 0 && deps.warn) {
    // 정규화 이전 데이터가 남아 있다는 신호. 수량이 쪼개져 보이는 원인이라 실측용으로 남긴다.
    deps.warn(
      `[${tag}] 같은 itemId 인벤토리 문서가 여러 개입니다(중복 ${target.duplicates}건)`,
    );
  }
}

module.exports = { readInventoryGrantTarget, writeInventoryGrant };
