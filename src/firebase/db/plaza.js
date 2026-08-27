// src/firebase/db/plaza.js — 알찬광장(plazaPosts · plazaApps) 데이터 계층
//
// 화면이 `firebase/firestore` 를 직접 부르지 않도록 여기에 가둔다
// (`npm run debt` 의 "Firestore 를 직접 부르는 화면 파일" 천장 규약).
//
// ⚠️ 쿼리는 **등가 조건 + 단일 필드 orderBy** 만 쓴다. 이 저장소는 CI 가
//    `firestore:indexes` 를 배포하지 않으므로(.github/workflows/deploy.yml 은
//    hosting·functions·storage·rules 만 배포한다) 복합 인덱스가 필요한 쿼리를 쓰면
//    **배포된 뒤에** 실패한다. 단일 필드 orderBy 는 자동 인덱스로 동작한다.
//    상태별 필터는 가져온 뒤 화면에서 한다 — 광장 글은 교사 수만큼이라 작다.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit as fbLimit,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { logger } from "../../utils/logger";

const POSTS = "plazaPosts";
const APPS = "plazaApps";
const POST_LIMIT = 200; // 교사 전용 공간이라 이 정도면 전량이다
const COMMENT_LIMIT = 200;

/** 광장 글 목록 (최신순). 실패는 null — "없다"와 "못 읽었다"를 구분한다. */
export const fetchPlazaPosts = async () => {
  if (!db) return null;
  try {
    const snap = await getDocs(
      query(collection(db, POSTS), orderBy("createdAt", "desc"), fbLimit(POST_LIMIT)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    logger.warn("[plaza] 글 목록 조회 실패:", e);
    return null;
  }
};

export const createPlazaPost = async ({ authorUid, authorName, title, content, category }) =>
  addDoc(collection(db, POSTS), {
    authorUid,
    authorName,
    title,
    content,
    category,
    // 🔒 `status` 는 여기서 'received' 로 고정한다. rules 도 create 시 이 값만 허용한다 —
    //    신청자가 자기 건의를 '반영됨'으로 만들 수 있으면 그 표시가 아무 뜻도 없어진다.
    status: "received",
    likedBy: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

/** 상태 변경(슈퍼관리자 전용 — rules 가 강제한다). */
export const setPlazaPostStatus = (postId, status) =>
  updateDoc(doc(db, POSTS, postId), { status, updatedAt: serverTimestamp() });

export const deletePlazaPost = (postId) => deleteDoc(doc(db, POSTS, postId));

/**
 * 공감 토글.
 * ⚠️ 배열을 통째로 덮어쓰지 않고 arrayUnion/arrayRemove 를 쓴다 — 두 교사가 같은 글에
 *    동시에 공감하면 덮어쓰기는 한쪽을 지운다. rules 도 "바뀐 것이 자기 uid 하나뿐"일 때만
 *    통과시키므로, 통째 덮어쓰기는 어차피 거부된다.
 */
export const togglePlazaLike = (postId, uid, liked) =>
  updateDoc(doc(db, POSTS, postId), {
    likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
  });

/** 한 글의 댓글 (오래된 순 — 대화는 위에서 아래로 읽는다). */
export const fetchPlazaComments = async (postId) => {
  if (!db || !postId) return null;
  try {
    const snap = await getDocs(
      query(
        collection(db, POSTS, postId, "comments"),
        orderBy("createdAt", "asc"),
        fbLimit(COMMENT_LIMIT),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    logger.warn("[plaza] 댓글 조회 실패:", e);
    return null;
  }
};

export const createPlazaComment = async (postId, { authorUid, authorName, content, isSuperAdmin }) =>
  addDoc(collection(db, POSTS, postId, "comments"), {
    authorUid,
    authorName,
    content,
    // 표시용 배지. 권한은 여기서 나오지 않는다 — rules 가 uid 로 판단한다.
    isOfficial: isSuperAdmin === true,
    createdAt: serverTimestamp(),
  });

export const deletePlazaComment = (postId, commentId) =>
  deleteDoc(doc(db, POSTS, postId, "comments", commentId));

/** 선생님이 만든 학습 사이트 신청 목록 (최신순). */
export const fetchPlazaApps = async () => {
  if (!db) return null;
  try {
    const snap = await getDocs(
      query(collection(db, APPS), orderBy("createdAt", "desc"), fbLimit(POST_LIMIT)),
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    logger.warn("[plaza] 사이트 신청 조회 실패:", e);
    return null;
  }
};

export const createPlazaApp = async ({ ownerUid, ownerName, label, url, description, icon }) =>
  addDoc(collection(db, APPS), {
    ownerUid,
    ownerName,
    label,
    url,
    description: description || "",
    icon: icon || "Globe",
    // 등재는 슈퍼관리자 승인(CF publishPlazaApp)에서만 일어난다. rules 도 create 시
    // 'pending' 외의 값을 거부한다.
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

export const deletePlazaApp = (appId) => deleteDoc(doc(db, APPS, appId));
