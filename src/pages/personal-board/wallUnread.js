// src/pages/personal-board/wallUnread.js
// 🧱 담벼락 «선생님이 아직 안 본 새 글» 판정 — 담벼락 명단과 사이드바 배지가 같은 함수를 쓴다.
//  - 학생이 글을 올리면 판 문서에 lastPostAt(서버 시각), 교사가 그 판을 열면 teacherSeenAt(서버 시각).
//  - lastPostAt 이 teacherSeenAt 보다 뒤면 «새 글». 교사가 한 번도 안 열었으면 글이 있는 판은 전부 새 글.
import { collection, getDocs } from "firebase/firestore";

const toMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  const n = new Date(ts).getTime();
  return Number.isFinite(n) ? n : 0;
};

export const isBoardUnread = (board) => {
  const post = toMs(board?.lastPostAt);
  if (!post) return false;
  return post > toMs(board?.teacherSeenAt);
};

export const countUnreadBoards = (boards) => (boards || []).filter(isBoardUnread).length;

// 사이드바용 — 반 전체 판 문서를 한 번 읽는다(학생 수만큼 읽기). 폴링 주기는 호출하는 쪽이 정한다.
export const fetchUnreadBoardCount = async (db, classCode) => {
  const snap = await getDocs(collection(db, "classes", classCode, "personalBoards"));
  return countUnreadBoards(snap.docs.map((d) => d.data()));
};

// 교사가 판을 열었을 때 사이드바 배지를 바로 갱신시키는 신호
export const WALL_SEEN_EVENT = "alchan:wall-seen";
