// src/firebase/db/jobApplications.js - 직업 신청(jobApplications) 조회
//
// 화면(패널·대시보드)이 `firebase/firestore` 를 직접 부르지 않도록 여기에 가둔다
// (`npm run debt` 의 "Firestore 를 직접 부르는 화면 파일" 천장 규약).
//
// ⚠️ 이 파일의 쿼리는 **등가 조건만** 쓴다. orderBy 를 넣으면 복합 인덱스가 필요한데,
//    이 저장소는 CI 가 `firestore:indexes` 를 배포하지 않는다
//    (.github/workflows/deploy.yml 은 hosting·functions·storage·rules 만 배포).
//    `pendingApprovals` 는 인덱스가 미리 배포돼 있어 orderBy 를 쓰지만 여긴 없다.
//    정렬은 호출부에서 한다.
import {
  collection,
  query,
  where,
  limit as fbLimit,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { logger } from "../../utils/logger";

const COLLECTION = "jobApplications";
const DEFAULT_LIMIT = 100;

/**
 * 한 학급의 특정 상태 신청을 실시간 구독한다(선생님 승인 화면).
 * @returns 구독 해제 함수
 */
export const subscribeToJobApplications = (
  classCode,
  status,
  callback,
  onError,
) => {
  if (!db || !classCode || !status) return () => {};
  const q = query(
    collection(db, COLLECTION),
    where("classCode", "==", classCode),
    where("status", "==", status),
    fbLimit(DEFAULT_LIMIT),
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => {
      logger.error("[jobApplications] 구독 실패:", error);
      if (onError) onError(error);
      else callback([]);
    },
  );
};

/**
 * 한 학생의 승인 대기 중인 직업 id 목록(학생 화면의 "신청 중" 표시용).
 *
 * 🔴 **`classCode` 를 반드시 건다 — 없으면 학생에게 통째로 거부된다(2026-08-28 라이브 재현).**
 *    읽기 규칙이 `isSameClassFast(resource.data.classCode)` 라서, Firestore 는 쿼리에
 *    학급 조건이 없으면 "학급 밖 문서가 섞일 수 있다"고 보고 **문서가 0건이어도** 쿼리
 *    자체를 PERMISSION_DENIED 로 막는다. 결과가 비었는지는 보지 않는다.
 *    그러면 이 함수가 null 을 돌려주고 → 직업 선택 화면이 아예 안 열려 → 학생은 직업을
 *    **추가도 삭제도** 못 한다. 교사는 이 경로를 안 타서(관리자 단락) 아무도 못 봤다.
 *    ⚠️ 교사용 `subscribeToJobApplications` 는 처음부터 classCode 를 걸고 있었다 —
 *       같은 파일에서 한쪽만 빠져 있었던 자리다.
 *    ⚠️ 등가 조건 3개(classCode·studentId·status)는 인덱스 병합으로 처리된다 —
 *       라이브에서 학생 토큰으로 200 확인(이 저장소는 CI 가 인덱스를 배포하지 않으므로
 *       새 복합 인덱스가 필요한 쿼리를 넣으면 안 된다).
 *
 * ⚠️ **실패를 `[]` 로 뭉개지 않는다 — `null` 을 돌려준다.**
 *    처음엔 fail-open 으로 `[]` 를 돌려줬는데, 그게 조용한 데이터 손실 경로였다:
 *    직업 선택 화면은 "체크 안 된 대기 신청 = 학생이 마음을 접었다"로 읽고 서버가 그 신청을
 *    **취소**한다(functions/index.js `canceledDocs`). 즉 조회가 한 번 실패하면
 *    학생이 저장 버튼을 누르는 순간 대기 중인 신청이 전부 사라진다 — 경고도 에러도 없이.
 *    "없다"와 "모른다"를 같은 값으로 표현하면 안 되는 자리다.
 *
 * @param {string} studentId 학생 uid
 * @param {string} classCode 학생의 학급 코드 (규칙이 요구한다 — 위 주석)
 * @return {Promise<string[]|null>} 대기 중인 직업 id 배열, 조회 실패 시 null
 */
export const fetchPendingJobIds = async (studentId, classCode) => {
  if (!db || !studentId) return [];
  // 학급을 모르면 **안전한 쿼리를 만들 수 없다.** 여기서 `[]` 를 돌려주면 "대기 신청 없음"이
  // 되어 저장 시 실제 신청이 취소된다 — "없다"가 아니라 "모른다"(null)로 답한다.
  if (!classCode) return null;
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTION),
        where("classCode", "==", classCode),
        where("studentId", "==", studentId),
        where("status", "==", "pending"),
      ),
    );
    return snap.docs.map((d) => d.data().jobId).filter(Boolean);
  } catch (e) {
    logger.warn("[jobApplications] 대기 신청 조회 실패:", e);
    return null;
  }
};
