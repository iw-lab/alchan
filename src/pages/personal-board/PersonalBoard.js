// src/pages/personal-board/PersonalBoard.js
// 🧱 담벼락 — 학생 개인 게시판 + 교사 1:1 코멘트
//  - 학생: 본인 담벼락에 글(텍스트) 작성, 교사/친구 댓글 확인·답글. 학급공개된 친구 담벼락 열람·댓글.
//  - 교사: 반 전체 담벼락 목록 열람·댓글, 공개범위(비공개/학급공개) 토글.
//  - 공개범위는 판 문서(visibility)에 저장하며 교사만 변경. 사진 없음(텍스트 전용).
//  - 쓰던 글·댓글은 기기(localStorage)에 임시 저장 → 새로고침·탭 전환에도 남는다. 올리면 지운다.
//  - 학생이 글을 올리면 판 문서 lastPostAt, 교사가 판을 열면 teacherSeenAt → «새 글» 표시·사이드바 배지.
//  - 남의 판을 열면 주소에 ?board=<uid> 를 남겨, 브라우저·폰 «뒤로가기»가 담벼락 첫 화면으로 돌아온다.
import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { logger } from "../../utils/logger";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
import { isBoardUnread, WALL_SEEN_EVENT } from "./wallUnread";
import { useBackClose } from "../../hooks/useBackClose";

// ── 디자인 헬퍼 ─────────────────────────
const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f43f5e", "#14b8a6", "#3b82f6", "#a855f7"];
const colorOf = (name) => {
  let h = 0;
  for (const ch of String(name || "?")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const initialOf = (name) => (String(name || "?").trim()[0] || "?");

const Avatar = ({ name, teacher, size = 34 }) => (
  <span
    style={{
      width: size,
      height: size,
      minWidth: size,
      borderRadius: "50%",
      background: teacher ? "linear-gradient(135deg,#f59e0b,#d97706)" : colorOf(name),
      color: "#fff",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 800,
      fontSize: size * 0.42,
      boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
    }}
  >
    {teacher ? "🧑‍🏫" : initialOf(name)}
  </span>
);

const tsToStr = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d) return "";
    return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const linkify = (text) => {
  if (!text) return null;
  const parts = String(text).split(/(https?:\/\/[^\s<]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#4f46e5", textDecoration: "underline", wordBreak: "break-all" }} onClick={(e) => e.stopPropagation()}>
        {part}
      </a>
    ) : (
      part
    ),
  );
};

// 글쓰기 칸 — 6줄에서 시작해 내용만큼 늘어난다(최대 화면 60%). 3줄은 한두 문장만 써도 스크롤이 생겨 좁았다.
const autoGrow = (el) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight + 2, Math.round(window.innerHeight * 0.6))}px`;
};
const WRITE_BOX = { width: "100%", minHeight: 150, borderRadius: 12, padding: 12, fontSize: "0.95rem", lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

const boardsCol = (classCode) => collection(db, "classes", classCode, "personalBoards");
const boardDoc = (classCode, ownerId) => doc(db, "classes", classCode, "personalBoards", ownerId);
const postsCol = (classCode, ownerId) => collection(db, "classes", classCode, "personalBoards", ownerId, "posts");

// 공통 스타일
const CARD = { background: "#fff", border: "1px solid #eef0f4", borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.05)" };
const BTN_SOFT = { background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 9, padding: "6px 12px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" };

const VisBadge = ({ v }) => (
  <span
    style={{
      fontSize: "0.72rem",
      fontWeight: 800,
      padding: "3px 9px",
      borderRadius: 999,
      background: v === "class" ? "#dcfce7" : "#eef2ff",
      color: v === "class" ? "#15803d" : "#4338ca",
      whiteSpace: "nowrap",
    }}
  >
    {v === "class" ? "🌐 학급공개" : "🔒 비공개"}
  </span>
);

const PersonalBoard = () => {
  const { user, userDoc, isAdmin: isAdminFn, loading: authLoading } = useAuth();
  const currentUserId = user?.uid || userDoc?.id;
  const currentUserName = userDoc?.name || userDoc?.nickname || "이름없음";
  const classCode = userDoc?.classCode;
  const isTeacher = typeof isAdminFn === "function" ? isAdminFn() : false;

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [studentTab, setStudentTab] = useState("mine");
  const [viewBoard, setViewBoard] = useState(null);
  const [classBoards, setClassBoards] = useState([]);

  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const boardParam = searchParams.get("board");
  // 학생 «학급 담벼락» 탭 — 뒤로가기 = «나의 담벼락»(친구 판 열기는 ?board= 가 따로 맡는다)
  useBackClose(!isTeacher && studentTab === "class", () => setStudentTab("mine"));

  // ── 쓰던 글 임시 저장(기기에만) ─────────────────────────
  const draftKey = classCode && currentUserId ? `alchan:wallDraft:${classCode}:${currentUserId}` : null;
  //   키(=학급·사용자)가 바뀌면 화면의 초안을 그 키의 저장분으로 «갈아끼운다»(없으면 비운다) — 계정이
  //   바뀌었는데 앞 사람 초안이 남아 새 키에 저장되던 결함 방지. 저장은 복원이 반영된 렌더부터만.
  const [draftReadyKey, setDraftReadyKey] = useState(null);
  useEffect(() => {
    if (!draftKey || draftReadyKey === draftKey) return;
    let post = "";
    let comments = {};
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
      if (saved && typeof saved === "object") {
        if (typeof saved.post === "string") post = saved.post;
        if (saved.comments && typeof saved.comments === "object") comments = saved.comments;
      }
    } catch {
      /* 저장소를 못 쓰는 브라우저 — 임시 저장 없이 동작 */
    }
    setNewPost(post);
    setCommentDrafts(comments);
    setDraftReadyKey(draftKey);
  }, [draftKey, draftReadyKey]);
  useEffect(() => {
    if (!draftKey || draftReadyKey !== draftKey) return;
    try {
      const comments = Object.fromEntries(Object.entries(commentDrafts).filter(([, v]) => v && v.trim()));
      if (!newPost.trim() && Object.keys(comments).length === 0) localStorage.removeItem(draftKey);
      else localStorage.setItem(draftKey, JSON.stringify({ post: newPost, comments }));
    } catch {
      /* 저장 실패는 조용히 — 글쓰기 자체는 막지 않는다 */
    }
  }, [draftKey, draftReadyKey, newPost, commentDrafts]);

  const loadBoardPosts = useCallback(async (ownerId) => {
    if (!classCode || !ownerId) return;
    setLoadingPosts(true);
    try {
      const snap = await getDocs(query(postsCol(classCode, ownerId), orderBy("createdAt", "desc"), limit(100)));
      const list = await Promise.all(
        snap.docs.map(async (d) => {
          const csnap = await getDocs(
            query(collection(db, "classes", classCode, "personalBoards", ownerId, "posts", d.id, "comments"), orderBy("createdAt", "asc"), limit(100)),
          );
          return { id: d.id, ...d.data(), comments: csnap.docs.map((c) => ({ id: c.id, ...c.data() })) };
        }),
      );
      setPosts(list);
    } catch (e) {
      logger.error("[담벼락] 글 로드 오류:", e);
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }, [classCode]);

  // 내 담벼락 문서 보장(없으면 비공개로 생성) — visibility는 절대 덮어쓰지 않음(교사가 바꾼 값 보호)
  const ensureMyBoard = useCallback(async () => {
    if (!classCode || !currentUserId) return null;
    try {
      const ref = boardDoc(classCode, currentUserId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ownerId: currentUserId, ownerName: currentUserName, visibility: "private", createdAt: serverTimestamp() });
        return { ownerId: currentUserId, ownerName: currentUserName, visibility: "private" };
      }
      return { ownerId: currentUserId, ...snap.data() };
    } catch (e) {
      logger.error("[담벼락] 내 판 준비 오류:", e);
      return null;
    }
  }, [classCode, currentUserId, currentUserName]);

  const loadRoster = useCallback(async () => {
    if (!classCode) return;
    setRosterLoading(true);
    try {
      const snap = await getDocs(boardsCol(classCode));
      setRoster(snap.docs.map((d) => ({ ownerId: d.id, ...d.data() })).sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || "")));
    } catch (e) {
      logger.error("[담벼락] 명단 로드 오류:", e);
    } finally {
      setRosterLoading(false);
    }
  }, [classCode]);

  const loadClassBoards = useCallback(async () => {
    if (!classCode) return;
    try {
      const snap = await getDocs(query(boardsCol(classCode), where("visibility", "==", "class")));
      setClassBoards(
        snap.docs.map((d) => ({ ownerId: d.id, ...d.data() })).filter((b) => b.ownerId !== currentUserId).sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || "")),
      );
    } catch (e) {
      logger.error("[담벼락] 학급 담벼락 로드 오류:", e);
    }
  }, [classCode, currentUserId]);

  // 교사 진입: 명단 로드 (학생 로드는 아래 탭 이펙트가 단일 담당 — 중복/경합 방지)
  useEffect(() => {
    if (authLoading || !classCode || !currentUserId) return;
    if (isTeacher) loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, classCode, currentUserId, isTeacher]);

  // 학생: 준비 완료 시 + 탭 전환 시 로드(단일 소스).
  useEffect(() => {
    if (isTeacher || authLoading || !classCode || !currentUserId) return;
    if (studentTab === "class") {
      setViewBoard(null);
      loadClassBoards();
      if (boardParam) setSearchParams({}, { replace: true });
    } else if (studentTab === "mine") {
      if (boardParam) setSearchParams({}, { replace: true });
      (async () => {
        const b = await ensureMyBoard();
        if (b) {
          setViewBoard(b);
          loadBoardPosts(b.ownerId);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentTab, authLoading, classCode, currentUserId, isTeacher]);

  const handleSubmitPost = async () => {
    const content = newPost.trim();
    if (!content || !viewBoard || submitting) return;
    setSubmitting(true);
    try {
      const post = {
        content: content.slice(0, 2000),
        authorId: currentUserId,
        authorName: currentUserName,
        isTeacher,
        createdAt: serverTimestamp(),
      };
      if (!isTeacher && viewBoard.ownerId === currentUserId) {
        // 학생이 자기 판에 올린 글 → 글과 «새 글 시각»(lastPostAt)을 한 번에 쓴다.
        //   따로 쓰면 시각만 실패했을 때 글은 있는데 교사 배지가 그 글을 놓친다(2026-10-01 교차검증).
        const batch = writeBatch(db);
        batch.set(doc(postsCol(classCode, currentUserId)), post);
        batch.update(boardDoc(classCode, currentUserId), { lastPostAt: serverTimestamp() });
        await batch.commit();
      } else {
        await addDoc(postsCol(classCode, viewBoard.ownerId), post);
      }
      setNewPost("");
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 글 작성 오류:", e);
      toast.error("글을 올리지 못했습니다. 권한 또는 네트워크를 확인해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitComment = async (postId) => {
    const content = (commentDrafts[postId] || "").trim();
    if (!content || !viewBoard) return;
    try {
      await addDoc(collection(db, "classes", classCode, "personalBoards", viewBoard.ownerId, "posts", postId, "comments"), {
        content: content.slice(0, 1000),
        authorId: currentUserId,
        authorName: currentUserName,
        isTeacher,
        createdAt: serverTimestamp(),
      });
      setCommentDrafts((p) => ({ ...p, [postId]: "" }));
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 댓글 작성 오류:", e);
      toast.error("댓글을 올리지 못했습니다.");
    }
  };

  const handleDeletePost = async (post) => {
    if (!viewBoard) return;
    if (!(await confirmDialog("이 글을 삭제할까요?", { danger: true }))) return;
    try {
      const commentsRef = collection(db, "classes", classCode, "personalBoards", viewBoard.ownerId, "posts", post.id, "comments");
      const csnap = await getDocs(commentsRef);
      const batch = writeBatch(db);
      csnap.docs.forEach((c) => batch.delete(c.ref));
      batch.delete(doc(db, "classes", classCode, "personalBoards", viewBoard.ownerId, "posts", post.id));
      await batch.commit();
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 글 삭제 오류:", e);
      toast.error("삭제하지 못했습니다.");
    }
  };

  const startEdit = (post) => {
    setEditingId(post.id);
    setEditDraft(post.content || "");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };
  const handleSaveEdit = async (post) => {
    const content = editDraft.trim();
    if (!content || !viewBoard || savingEdit) return;
    if (content === (post.content || "").trim()) return cancelEdit();
    setSavingEdit(true);
    try {
      await updateDoc(doc(db, "classes", classCode, "personalBoards", viewBoard.ownerId, "posts", post.id), {
        content: content.slice(0, 2000),
        editedAt: serverTimestamp(),
      });
      cancelEdit();
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 글 수정 오류:", e);
      toast.error("글을 고치지 못했습니다.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!viewBoard) return;
    // 되돌릴 수 없는 삭제 — 글 삭제와 동일하게 확인창 + 실패 안내(P6 UX).
    if (!(await confirmDialog("이 댓글을 삭제할까요?", { danger: true }))) return;
    try {
      await deleteDoc(doc(db, "classes", classCode, "personalBoards", viewBoard.ownerId, "posts", postId, "comments", commentId));
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 댓글 삭제 오류:", e);
      toast.error("삭제하지 못했습니다.");
    }
  };

  const handleToggleVisibility = async (board) => {
    const next = board.visibility === "class" ? "private" : "class";
    try {
      await updateDoc(boardDoc(classCode, board.ownerId), { visibility: next, updatedAt: serverTimestamp() });
      setRoster((prev) => prev.map((b) => (b.ownerId === board.ownerId ? { ...b, visibility: next } : b)));
      setViewBoard((prev) => (prev && prev.ownerId === board.ownerId ? { ...prev, visibility: next } : prev));
    } catch (e) {
      logger.error("[담벼락] 공개범위 변경 오류:", e);
      toast.error("공개범위를 바꾸지 못했습니다.");
    }
  };

  // 교사가 판을 열면 «봤다» 시각을 남긴다(새 글 표시·사이드바 배지 해제)
  //   «봤음»을 먼저 기록하고 그다음 글을 읽는다 — 거꾸로면 읽은 뒤·기록 전에 올라온 글이 화면엔 없는데 읽음 처리된다.
  //   사이드바는 반 전체를 다시 읽지 않고 «새 글이던 판 하나 줄이기»만 받는다(판을 넘길 때마다 N건 재조회 방지).
  const markSeen = async (board) => {
    if (!isTeacher) return;
    const wasUnread = isBoardUnread(board);
    try {
      await updateDoc(boardDoc(classCode, board.ownerId), { teacherSeenAt: serverTimestamp() });
      const now = new Date();
      setRoster((prev) => prev.map((b) => (b.ownerId === board.ownerId ? { ...b, teacherSeenAt: now } : b)));
      if (wasUnread) window.dispatchEvent(new CustomEvent(WALL_SEEN_EVENT, { detail: { wasUnread: true } }));
    } catch (e) {
      logger.error("[담벼락] teacherSeenAt 기록 오류:", e);
    }
  };

  // fromHistory: 주소(?board=)에서 복원할 때는 기록을 또 쌓지 않는다
  const openBoard = (board, { fromHistory = false } = {}) => {
    setViewBoard(board);
    cancelEdit();
    markSeen(board).then(() => loadBoardPosts(board.ownerId));
    if (!fromHistory) setSearchParams({ board: board.ownerId }, { state: { wallPushed: true } });
  };

  // «← 목록» 단추 = 브라우저 뒤로가기와 같은 길(기록이 어긋나지 않게)
  //   단, 새로고침·링크로 바로 들어와 우리가 쌓은 기록이 없으면 뒤로 가지 않고(앱 밖으로 나간다) 주소만 지운다.
  const closeBoard = () => {
    if (boardParam && location.state?.wallPushed) navigate(-1);
    else if (boardParam) setSearchParams({}, { replace: true });
    else setViewBoard(null);
  };

  // 뒤로가기로 ?board= 가 빠지면 남의 판을 닫고 첫 화면(명단·학급 담벼락)으로
  const viewingOther = !!viewBoard && (isTeacher || viewBoard.ownerId !== currentUserId);
  useEffect(() => {
    if (boardParam || !viewingOther) return;
    if (!isTeacher && studentTab !== "class") return; // «나의 담벼락» 탭 전환 중엔 탭 이펙트가 맡는다
    setViewBoard(null);
    cancelEdit();
    if (isTeacher) loadRoster();
    else loadClassBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardParam]);

  // 새로고침했는데 주소에 ?board= 가 남아 있으면: 교사는 명단에서 그 판을 다시 열고, 학생은 첫 화면으로
  useEffect(() => {
    if (!boardParam || viewBoard?.ownerId === boardParam) return;
    if (isTeacher) {
      if (rosterLoading || roster.length === 0) return;
      const b = roster.find((r) => r.ownerId === boardParam);
      if (b) openBoard(b, { fromHistory: true });
      else setSearchParams({}, { replace: true });
    } else if (!authLoading && classCode) {
      // 학생: «학급 담벼락» 탭에서 앞으로가기로 친구 판 기록이 돌아오면 그 판을 다시 연다(지우지 않는다)
      if (studentTab === "class") {
        if (classBoards.length === 0) return; // 목록을 아직 못 읽었다 — 읽힌 뒤 다시 본다
        const b = classBoards.find((c) => c.ownerId === boardParam);
        if (b) return openBoard(b, { fromHistory: true });
      }
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardParam, viewBoard, isTeacher, roster, rosterLoading, authLoading, classCode, studentTab, classBoards]);

  if (authLoading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>불러오는 중…</div>;
  if (!classCode) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>학급 코드가 설정되어야 담벼락을 이용할 수 있어요.</div>;

  const isOwnerOfView = viewBoard && viewBoard.ownerId === currentUserId;
  const canWritePost = isOwnerOfView;
  const canComment = !!viewBoard && (isTeacher || isOwnerOfView || viewBoard.visibility === "class");

  // ── 헤더 배너 ─────────────────────────
  const Header = ({ subtitle }) => (
    <div style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)", borderRadius: 18, padding: "18px 22px", color: "#fff", marginBottom: 18, boxShadow: "0 8px 24px -10px rgba(99,102,241,0.6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: "1.6rem" }}>🧱</span>
        <span style={{ fontSize: "1.35rem", fontWeight: 800 }}>담벼락</span>
      </div>
      <div style={{ fontSize: "0.88rem", opacity: 0.92, marginTop: 4 }}>{subtitle}</div>
    </div>
  );

  const EmptyBox = ({ emoji, title, desc }) => (
    <div style={{ ...CARD, borderStyle: "dashed", borderColor: "#dbe0ea", textAlign: "center", padding: "40px 20px", boxShadow: "none" }}>
      <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>{emoji}</div>
      <div style={{ fontWeight: 700, color: "#334155", marginBottom: 4 }}>{title}</div>
      {desc && <div style={{ color: "#94a3b8", fontSize: "0.86rem" }}>{desc}</div>}
    </div>
  );

  // ── 글+댓글 렌더 (공용) ─────────────────────────
  const renderPosts = () => (
    <>
      {canWritePost && (
        <div style={{ ...CARD, padding: 16, marginBottom: 16, background: "linear-gradient(180deg,#fafbff,#ffffff)" }}>
          <textarea
            value={newPost}
            onChange={(e) => { setNewPost(e.target.value); autoGrow(e.target); }}
            ref={(el) => { if (el && newPost) autoGrow(el); }}
            placeholder="오늘의 이야기, 배운 점, 하고 싶은 말을 자유롭게 적어보세요 ✍️"
            maxLength={2000}
            rows={6}
            style={{ ...WRITE_BOX, border: "1px solid #e2e8f0" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: "0.72rem", color: "#cbd5e1" }}>{newPost.length}/2000</span>
            <button
              onClick={handleSubmitPost}
              disabled={submitting || !newPost.trim()}
              style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)", color: "#fff", border: "none", borderRadius: 10, padding: "9px 20px", fontWeight: 700, cursor: "pointer", opacity: submitting || !newPost.trim() ? 0.5 : 1 }}
            >
              {submitting ? "올리는 중…" : "담벼락에 올리기"}
            </button>
          </div>
        </div>
      )}

      {loadingPosts ? (
        <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>불러오는 중…</div>
      ) : posts.length === 0 ? (
        <EmptyBox emoji="🌱" title="아직 글이 없어요" desc={canWritePost ? "첫 글을 남겨보세요!" : ""} />
      ) : (
        posts.map((post) => (
          <div key={post.id} style={{ ...CARD, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Avatar name={post.authorName} teacher={post.isTeacher} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.92rem" }}>
                  {post.isTeacher ? "선생님" : post.authorName || "이름없음"}
                </div>
                <div style={{ color: "#94a3b8", fontSize: "0.74rem" }}>
                  {tsToStr(post.createdAt)}
                  {post.editedAt && <span style={{ marginLeft: 6 }}>(수정됨)</span>}
                </div>
              </div>
              {post.authorId === currentUserId && editingId !== post.id && (
                <button onClick={() => startEdit(post)} style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700 }}>수정</button>
              )}
              {(post.authorId === currentUserId || isTeacher) && editingId !== post.id && (
                <button onClick={() => handleDeletePost(post)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: "0.78rem" }}>삭제</button>
              )}
            </div>
            {editingId === post.id ? (
              <div style={{ paddingLeft: 44 }}>
                <textarea
                  value={editDraft}
                  onChange={(e) => { setEditDraft(e.target.value); autoGrow(e.target); }}
                  ref={(el) => { if (el) autoGrow(el); }}
                  maxLength={2000}
                  rows={6}
                  autoFocus
                  style={{ ...WRITE_BOX, border: "1px solid #c7d2fe" }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                  <button onClick={cancelEdit} disabled={savingEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "7px 14px", cursor: "pointer", fontWeight: 600, color: "#475569" }}>취소</button>
                  <button
                    onClick={() => handleSaveEdit(post)}
                    disabled={savingEdit || !editDraft.trim()}
                    style={{ background: "linear-gradient(135deg,#6366f1,#7c3aed)", color: "#fff", border: "none", borderRadius: 10, padding: "7px 16px", fontWeight: 700, cursor: "pointer", opacity: savingEdit || !editDraft.trim() ? 0.5 : 1 }}
                  >
                    {savingEdit ? "저장 중…" : "수정 완료"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ whiteSpace: "pre-wrap", color: "#1e293b", fontSize: "0.95rem", lineHeight: 1.6, paddingLeft: 44 }}>{linkify(post.content)}</div>
            )}

            {/* 댓글 */}
            <div style={{ marginTop: 12, paddingLeft: 44 }}>
              {(post.comments || []).map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    marginBottom: 8,
                    background: c.isTeacher ? "#fffbeb" : "#f8fafc",
                    border: `1px solid ${c.isTeacher ? "#fde68a" : "#eef0f4"}`,
                    borderRadius: 12,
                    padding: "8px 10px",
                  }}
                >
                  <Avatar name={c.authorName} teacher={c.isTeacher} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.78rem", color: c.isTeacher ? "#b45309" : "#475569" }}>
                      {c.isTeacher ? "선생님" : c.authorName || "이름없음"}
                      <span style={{ color: "#cbd5e1", fontWeight: 400, marginLeft: 6, fontSize: "0.7rem" }}>{tsToStr(c.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: "0.88rem", color: "#334155", whiteSpace: "pre-wrap", marginTop: 1 }}>{linkify(c.content)}</div>
                  </div>
                  {(c.authorId === currentUserId || isTeacher) && (
                    <button onClick={() => handleDeleteComment(post.id, c.id)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: "0.8rem" }}>×</button>
                  )}
                </div>
              ))}
              {canComment && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input
                    value={commentDrafts[post.id] || ""}
                    onChange={(e) => setCommentDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmitComment(post.id); }}
                    placeholder={isTeacher ? "칭찬·피드백을 남겨주세요" : "댓글 달기"}
                    maxLength={1000}
                    style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: "0.85rem", outline: "none", boxSizing: "border-box" }}
                  />
                  <button onClick={() => handleSubmitComment(post.id)} disabled={!(commentDrafts[post.id] || "").trim()} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", opacity: (commentDrafts[post.id] || "").trim() ? 1 : 0.5 }}>등록</button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );

  const BackBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: "7px 13px", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "#475569" }}>← 목록</button>
  );

  // ── 교사 뷰 ─────────────────────────
  if (isTeacher) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 14px" }}>
        <Header subtitle="학생별 담벼락을 열어 칭찬·피드백을 남기고, 공개범위를 정할 수 있어요." />
        {!viewBoard ? (
          rosterLoading ? (
            <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>불러오는 중…</div>
          ) : roster.length === 0 ? (
            <EmptyBox emoji="🧑‍🏫" title="아직 담벼락을 시작한 학생이 없어요" desc="학생이 담벼락에 처음 들어가면 여기에 나타납니다." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
              {[...roster].sort((a, b) => isBoardUnread(b) - isBoardUnread(a)).map((b) => {
                const v = b.visibility === "class" ? "class" : "private";
                const unread = isBoardUnread(b);
                return (
                  <div key={b.ownerId} style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10, ...(unread ? { borderColor: "#fca5a5" } : null) }}>
                    <button onClick={() => openBoard(b)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                      <Avatar name={b.ownerName} size={38} />
                      <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.98rem" }}>{b.ownerName || "이름없음"}</span>
                      {unread && (
                        <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", fontSize: "0.7rem", fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>새 글</span>
                      )}
                    </button>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <VisBadge v={v} />
                      <button onClick={() => handleToggleVisibility(b)} style={BTN_SOFT}>{v === "class" ? "비공개로" : "학급공개로"}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <>
            <div style={{ ...CARD, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <BackBtn onClick={closeBoard} />
              <Avatar name={viewBoard.ownerName} size={30} />
              <b style={{ color: "#0f172a" }}>{viewBoard.ownerName || "이름없음"}</b>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>의 담벼락</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <VisBadge v={viewBoard.visibility === "class" ? "class" : "private"} />
                <button onClick={() => handleToggleVisibility(viewBoard)} style={BTN_SOFT}>{viewBoard.visibility === "class" ? "비공개로" : "학급공개로"}</button>
              </span>
            </div>
            {renderPosts()}
          </>
        )}
      </div>
    );
  }

  // ── 학생 뷰 ─────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 14px" }}>
      <Header subtitle={studentTab === "mine" ? "선생님과 나누는 나만의 공간이에요." : "친구들의 공개 담벼락에 응원을 남겨보세요."} />

      {/* 세그먼트 탭 */}
      <div style={{ display: "inline-flex", background: "#eef2ff", borderRadius: 12, padding: 4, marginBottom: 16 }}>
        {[
          { k: "mine", label: "나의 담벼락" },
          { k: "class", label: "학급 담벼락" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setStudentTab(t.k)}
            style={{
              padding: "7px 18px",
              border: "none",
              borderRadius: 9,
              background: studentTab === t.k ? "#fff" : "transparent",
              color: studentTab === t.k ? "#4338ca" : "#818cf8",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: studentTab === t.k ? "0 1px 3px rgba(67,56,202,0.18)" : "none",
              fontSize: "0.9rem",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {studentTab === "mine" && viewBoard && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <VisBadge v={viewBoard.visibility === "class" ? "class" : "private"} />
            <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
              {viewBoard.visibility === "class" ? "친구들이 내 담벼락을 볼 수 있어요" : "선생님과 나만 볼 수 있어요"}
            </span>
          </div>
          {renderPosts()}
        </>
      )}

      {studentTab === "class" &&
        (viewBoard && viewBoard.ownerId !== currentUserId ? (
          <>
            <div style={{ ...CARD, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <BackBtn onClick={closeBoard} />
              <Avatar name={viewBoard.ownerName} size={30} />
              <b style={{ color: "#0f172a" }}>{viewBoard.ownerName || "이름없음"}</b>
              <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>의 담벼락</span>
              <span style={{ marginLeft: "auto" }}><VisBadge v="class" /></span>
            </div>
            {renderPosts()}
          </>
        ) : classBoards.length === 0 ? (
          <EmptyBox emoji="🙌" title="아직 공개된 담벼락이 없어요" desc="친구가 담벼락을 학급에 공개하면 여기에 나타나요." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
            {classBoards.map((b) => (
              <button key={b.ownerId} onClick={() => openBoard(b)} style={{ ...CARD, padding: 14, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
                <Avatar name={b.ownerName} size={38} />
                <span style={{ fontWeight: 700, color: "#334155" }}>{b.ownerName || "이름없음"}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
};

export default PersonalBoard;
