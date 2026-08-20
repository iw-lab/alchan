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
 * ⚠️ **실패를 `[]` 로 뭉개지 않는다 — `null` 을 돌려준다.**
 *    처음엔 fail-open 으로 `[]` 를 돌려줬는데, 그게 조용한 데이터 손실 경로였다:
 *    직업 선택 화면은 "체크 안 된 대기 신청 = 학생이 마음을 접었다"로 읽고 서버가 그 신청을
 *    **취소**한다(functions/index.js `canceledDocs`). 즉 조회가 한 번 실패하면
 *    학생이 저장 버튼을 누르는 순간 대기 중인 신청이 전부 사라진다 — 경고도 에러도 없이.
 *    "없다"와 "모른다"를 같은 값으로 표현하면 안 되는 자리다.
 *
 * @param {string} studentId 학생 uid
 * @return {Promise<string[]|null>} 대기 중인 직업 id 배열, 조회 실패 시 null
 */
export const fetchPendingJobIds = async (studentId) => {
  if (!db || !studentId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTION),
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
