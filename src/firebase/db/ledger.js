// src/firebase/db/ledger.js — 학생 한 명의 세 원장을 «언제부터»로 읽는다(가계부용, 읽기 전용).
// 합치는 규칙은 utils/ledgerDedupe.js mergeLedgerRows — 여기는 읽기만 한다.
import { collection, getDocs, limit, orderBy, query, where, Timestamp, doc, updateDoc, deleteField, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { logger } from "../../utils/logger";

const FETCH_LIMIT = 300;

/**
 * @return {Promise<{activity, transactions, root, incomplete: boolean, truncatedBefore: number}>}
 *   못 읽은 원장은 null(빈 배열과 구분한다 — «0원»과 «모름»은 다르다).
 */
export async function fetchLedgerSince(userId, classCode, sinceMs) {
  const since = Timestamp.fromMillis(sinceMs);
  // ⚠️ id 는 뒤에 쓴다 — 데이터에 `id` 필드가 있어도 문서 id 가 이긴다(중복 제거 키).
  const rowsOf = (snap) => snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const soft = (p) => p.then(rowsOf).catch((e) => {
    logger.warn("[ledger] 원장 일부를 못 읽음", e?.code || e?.message);
    return null;
  });
  const [activity, transactions, root] = await Promise.all([
    soft(getDocs(query(collection(db, "activity_logs"), where("classCode", "==", classCode), where("userId", "==", userId), where("timestamp", ">=", since), orderBy("timestamp", "desc"), limit(FETCH_LIMIT)))),
    soft(getDocs(query(collection(db, "users", userId, "transactions"), where("timestamp", ">=", since), orderBy("timestamp", "desc"), limit(FETCH_LIMIT)))),
    soft(getDocs(query(collection(db, "transactions"), where("userId", "==", userId), where("timestamp", ">=", since), orderBy("timestamp", "desc"), limit(FETCH_LIMIT)))),
  ]);
  const all = [activity, transactions, root];
  return {
    activity, transactions, root,
    // 하나라도 못 읽었으면 합계를 믿을 수 없다(«0원»과 «모름»은 다르다).
    incomplete: all.some((x) => x === null),
    // 상한에 닿았으면 더 오래된 줄이 잘렸을 수 있다 — 가장 오래 남은 줄의 시각(ms)보다 앞은 모른다.
    truncatedBefore: Math.max(0, ...all.filter((x) => x && x.length >= FETCH_LIMIT).map((x) => {
      const last = x[x.length - 1]?.timestamp;
      return last?.toMillis ? last.toMillis() : 0;
    })),
  };
}

/**
 * 저축 목표 저장/지우기 — 자기 문서의 표시용 필드 하나(`savingsGoal`). 돈은 움직이지 않는다.
 * 서버는 이 값을 어떤 판정에도 쓰지 않는다(쓰게 되면 그때는 CF 로 옮길 것).
 */
export async function saveSavingsGoal(userId, goal) {
  const ref = doc(db, "users", userId);
  if (!goal) return updateDoc(ref, { savingsGoal: deleteField() });
  return updateDoc(ref, { savingsGoal: { name: goal.name, amount: goal.amount, setAt: serverTimestamp() } });
}

