// src/firebase/db/learningApps.js
// 🧭 학습앱(AAP) 화면이 쓰는 **읽기 전용** 조회 — 교사 대시보드(P1-5) 전용.
//
// 왜 화면이 아니라 여기 있나
//   이 저장소는 "화면이 Firestore 를 직접 부르는 파일 수"를 부채 지표로 세고 천장을 건다
//   (`scripts/debt-ratchet.mjs`). 이유가 분명하다 — **읽기 방식을 바꾸려면 그 파일들을 전부
//   고쳐야 하므로 변경 비용이 그 수에 비례한다.** 이 앱은 읽기가 곧 청구서라 그 비용을 실제로
//   여러 번 치렀다. 그래서 새 화면의 읽기는 처음부터 데이터 계층에 둔다.
//
// 🚫 여기에 쓰기를 추가하지 말 것. 학습집계·경보는 **서버 전용**이고 rules 가 클라 쓰기를
//    전면 금지한다(firestore.rules 의 learningStats·platformAlerts 블록). 지급 원장 조회는
//    rules 로 아예 닫혀 있어 Cloud Function(`listAppRewards`)을 통한다 — 이 파일이 아니다.
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { logDbOperation } from "../firebaseUtils";

/**
 * 🚨 그날의 보상 차단기 경보. rules 가 교사에게 읽기를 열어 둔 컬렉션이다.
 *
 * 등가 필터 하나뿐이라 새 복합인덱스를 요구하지 않는다(이 저장소 CI 는 인덱스를 배포하지 않는다).
 *
 * @param {string} day KST YYYYMMDD
 * @return {Promise<Array<object>>} 경보 문서들
 */
export const fetchPlatformAlerts = async (day) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  const snap = await getDocs(query(collection(db, "platformAlerts"), where("day", "==", day)));
  logDbOperation("READ", "platformAlerts", null, { tab: "learningApps", extra: `경보 ${day}: ${snap.size}건` });
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/**
 * 📊 학급 학생들의 하루 학습 집계 — **경로 기반 N-fan-out**.
 *
 * ⚠️ `collectionGroup('apps') + where(classCode, date)` 로 한 번에 뽑고 싶지만 그건 **새 복합
 *    인덱스**를 요구한다. 이 저장소 CI 는 `firestore:indexes` 를 배포하지 않으므로 라이브에서
 *    `FAILED_PRECONDITION` 이 된다(2026-08-22 라이브 실측으로 확인). 그래서 명부를 돌며
 *    학생별로 읽는다 — 읽기는 학급 인원 수만큼이고, 인덱스는 필요 없다.
 *
 * ⚠️ 빈 결과도 쿼리 1회는 과금된다. 그래서 이 함수는 **호출자가 부를 때만** 돈다(폴링 금지).
 *
 * @param {string} classCode 학급
 * @param {Array<string>} uids 학생 uid 목록
 * @param {string} day KST YYYYMMDD
 * @return {Promise<Array<object>>} {uid, appId, ...집계} 평면 목록
 */
export const fetchClassLearningStats = async (classCode, uids, day) => {
  if (!db) throw new Error("Firestore가 초기화되지 않았습니다.");
  if (!classCode || !Array.isArray(uids) || uids.length === 0) return [];
  const perStudent = await Promise.all(
    uids.map(async (uid) => {
      const snap = await getDocs(
        collection(db, "classes", classCode, "learningStats", uid, "days", day, "apps"),
      );
      return snap.docs.map((d) => ({ uid, appId: d.id, ...d.data() }));
    }),
  );
  const rows = perStudent.flat();
  logDbOperation("READ", "learningStats", null, {
    tab: "learningApps",
    extra: `학습집계 ${classCode}/${day}: 학생 ${uids.length}명 → ${rows.length}건`,
  });
  return rows;
};
