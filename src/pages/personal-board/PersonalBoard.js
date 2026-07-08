// src/pages/personal-board/PersonalBoard.js
// 🧱 담벼락 — 학생 개인 게시판 + 교사 1:1 코멘트
//  - 학생: 본인 담벼락에 글(텍스트) 작성, 교사/친구 댓글 확인·답글. 학급공개된 친구 담벼락 열람·댓글.
//  - 교사: 반 전체 담벼락 목록 열람·댓글, 공개범위(비공개/학급공개) 토글.
//  - 공개범위는 판 문서(visibility)에 저장하며 교사만 변경. 사진 없음(텍스트 전용).
import React, { useState, useEffect, useCallback } from "react";
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

const tsToStr = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d) return "";
    return d.toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

// URL을 클릭 가능한 링크로 (LearningBoard와 동일 정책)
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

const boardsCol = (classCode) => collection(db, "classes", classCode, "personalBoards");
const boardDoc = (classCode, ownerId) => doc(db, "classes", classCode, "personalBoards", ownerId);
const postsCol = (classCode, ownerId) => collection(db, "classes", classCode, "personalBoards", ownerId, "posts");

const PersonalBoard = () => {
  const { user, userDoc, isAdmin: isAdminFn, loading: authLoading } = useAuth();
  const currentUserId = user?.uid || userDoc?.id;
  const currentUserName = userDoc?.name || userDoc?.nickname || "이름없음";
  const classCode = userDoc?.classCode;
  const isTeacher = typeof isAdminFn === "function" ? isAdminFn() : false;

  // 공통 상태
  const [posts, setPosts] = useState([]); // 현재 열람 중인 담벼락의 글(+댓글)
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [newPost, setNewPost] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({}); // { [postId]: text }
  const [submitting, setSubmitting] = useState(false);

  // 학생: 탭(mine=내 담벼락, class=학급 담벼락) / 현재 열람 대상 판
  const [studentTab, setStudentTab] = useState("mine");
  const [viewBoard, setViewBoard] = useState(null); // { ownerId, ownerName, visibility }
  const [classBoards, setClassBoards] = useState([]); // 학급공개된 친구 담벼락 목록

  // 교사: 반 전체 담벼락 목록 / 선택된 판
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  // 한 판의 글 + 각 글의 댓글 로드
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
          return {
            id: d.id,
            ...d.data(),
            comments: csnap.docs.map((c) => ({ id: c.id, ...c.data() })),
          };
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
        await setDoc(ref, {
          ownerId: currentUserId,
          ownerName: currentUserName,
          visibility: "private",
          createdAt: serverTimestamp(),
        });
        return { ownerId: currentUserId, ownerName: currentUserName, visibility: "private" };
      }
      return { ownerId: currentUserId, ...snap.data() };
    } catch (e) {
      logger.error("[담벼락] 내 판 준비 오류:", e);
      return null;
    }
  }, [classCode, currentUserId, currentUserName]);

  // 교사: 반 전체 담벼락 목록 로드
  const loadRoster = useCallback(async () => {
    if (!classCode) return;
    setRosterLoading(true);
    try {
      const snap = await getDocs(boardsCol(classCode));
      setRoster(
        snap.docs
          .map((d) => ({ ownerId: d.id, ...d.data() }))
          .sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || "")),
      );
    } catch (e) {
      logger.error("[담벼락] 명단 로드 오류:", e);
    } finally {
      setRosterLoading(false);
    }
  }, [classCode]);

  // 학생: 학급공개된 친구 담벼락 목록
  const loadClassBoards = useCallback(async () => {
    if (!classCode) return;
    try {
      const snap = await getDocs(query(boardsCol(classCode), where("visibility", "==", "class")));
      setClassBoards(
        snap.docs
          .map((d) => ({ ownerId: d.id, ...d.data() }))
          .filter((b) => b.ownerId !== currentUserId)
          .sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || "")),
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

  // 학생: 준비 완료 시 + 탭 전환 시 로드(단일 소스). authLoading이 풀릴 때도 재실행되도록 deps에 포함.
  useEffect(() => {
    if (isTeacher || authLoading || !classCode || !currentUserId) return;
    if (studentTab === "class") {
      setViewBoard(null);
      loadClassBoards();
    } else if (studentTab === "mine") {
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

  // 글 작성(판 주인만 — 내 담벼락에서만 노출)
  const handleSubmitPost = async () => {
    const content = newPost.trim();
    if (!content || !viewBoard || submitting) return;
    setSubmitting(true);
    try {
      await addDoc(postsCol(classCode, viewBoard.ownerId), {
        content: content.slice(0, 2000),
        authorId: currentUserId,
        authorName: currentUserName,
        isTeacher,
        createdAt: serverTimestamp(),
      });
      setNewPost("");
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 글 작성 오류:", e);
      alert("글을 올리지 못했습니다. 권한 또는 네트워크를 확인해주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  // 댓글 작성
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
      alert("댓글을 올리지 못했습니다.");
    }
  };

  // 글 삭제(작성자 본인 또는 교사) — 댓글까지 batch 삭제
  const handleDeletePost = async (post) => {
    if (!viewBoard) return;
    if (!window.confirm("이 글을 삭제할까요?")) return;
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
      alert("삭제하지 못했습니다.");
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    if (!viewBoard) return;
    try {
      await deleteDoc(doc(db, "classes", classCode, "personalBoards", viewBoard.ownerId, "posts", postId, "comments", commentId));
      await loadBoardPosts(viewBoard.ownerId);
    } catch (e) {
      logger.error("[담벼락] 댓글 삭제 오류:", e);
    }
  };

  // 교사: 공개범위 토글
  const handleToggleVisibility = async (board) => {
    const next = board.visibility === "class" ? "private" : "class";
    try {
      await updateDoc(boardDoc(classCode, board.ownerId), { visibility: next, updatedAt: serverTimestamp() });
      setRoster((prev) => prev.map((b) => (b.ownerId === board.ownerId ? { ...b, visibility: next } : b)));
      setViewBoard((prev) => (prev && prev.ownerId === board.ownerId ? { ...prev, visibility: next } : prev));
    } catch (e) {
      logger.error("[담벼락] 공개범위 변경 오류:", e);
      alert("공개범위를 바꾸지 못했습니다.");
    }
  };

  // 교사가 특정 학생 판 열기 / 학생이 친구 판 열기
  const openBoard = (board) => {
    setViewBoard(board);
    loadBoardPosts(board.ownerId);
  };

  if (authLoading) return <div style={{ padding: 24 }}>불러오는 중…</div>;
  if (!classCode) return <div style={{ padding: 24 }}>학급 코드가 설정되어야 담벼락을 이용할 수 있어요.</div>;

  const isOwnerOfView = viewBoard && viewBoard.ownerId === currentUserId;
  const canWritePost = isOwnerOfView; // 글은 판 주인만
  const canComment =
    !!viewBoard &&
    (isTeacher || isOwnerOfView || viewBoard.visibility === "class"); // 댓글: 교사·주인·학급공개면 누구나

  const VisBadge = ({ v }) => (
    <span
      style={{
        fontSize: "0.72rem",
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 8,
        background: v === "class" ? "#dcfce7" : "#e0e7ff",
        color: v === "class" ? "#15803d" : "#4338ca",
      }}
    >
      {v === "class" ? "🌐 학급공개" : "🔒 비공개"}
    </span>
  );

  // ── 글+댓글 렌더 (공용) ─────────────────────────
  const renderPosts = () => (
    <>
      {canWritePost && (
        <div style={{ marginBottom: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14 }}>
          <textarea
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            placeholder="오늘의 이야기, 배운 점, 하고 싶은 말을 자유롭게 적어보세요 ✍️"
            maxLength={2000}
            rows={3}
            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, fontSize: "0.95rem", resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button
              onClick={handleSubmitPost}
              disabled={submitting || !newPost.trim()}
              style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, cursor: "pointer", opacity: submitting || !newPost.trim() ? 0.5 : 1 }}
            >
              {submitting ? "올리는 중…" : "담벼락에 올리기"}
            </button>
          </div>
        </div>
      )}

      {loadingPosts ? (
        <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>불러오는 중…</div>
      ) : posts.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>아직 글이 없어요.</div>
      ) : (
        posts.map((post) => (
          <div key={post.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: "#334155", fontSize: "0.9rem" }}>
                {post.isTeacher ? "👩‍🏫 " : ""}{post.authorName || "이름없음"}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>{tsToStr(post.createdAt)}</span>
                {(post.authorId === currentUserId || isTeacher) && (
                  <button onClick={() => handleDeletePost(post)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem" }}>삭제</button>
                )}
              </span>
            </div>
            <div style={{ whiteSpace: "pre-wrap", color: "#0f172a", fontSize: "0.95rem", lineHeight: 1.5 }}>{linkify(post.content)}</div>

            {/* 댓글 */}
            <div style={{ marginTop: 10, borderTop: "1px dashed #e2e8f0", paddingTop: 10 }}>
              {(post.comments || []).map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem", color: c.isTeacher ? "#b45309" : "#475569", whiteSpace: "nowrap" }}>
                    {c.isTeacher ? "👩‍🏫 선생님" : c.authorName || "이름없음"}
                  </span>
                  <span style={{ fontSize: "0.88rem", color: "#334155", flex: 1, whiteSpace: "pre-wrap" }}>{linkify(c.content)}</span>
                  <span style={{ color: "#cbd5e1", fontSize: "0.72rem", whiteSpace: "nowrap" }}>{tsToStr(c.createdAt)}</span>
                  {(c.authorId === currentUserId || isTeacher) && (
                    <button onClick={() => handleDeleteComment(post.id, c.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.72rem" }}>×</button>
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
                    style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: "0.85rem" }}
                  />
                  <button onClick={() => handleSubmitComment(post.id)} disabled={!(commentDrafts[post.id] || "").trim()} style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer", opacity: (commentDrafts[post.id] || "").trim() ? 1 : 0.5 }}>등록</button>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </>
  );

  // ── 교사 뷰 ─────────────────────────
  if (isTeacher) {
    return (
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 12px" }}>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>🧱 담벼락</h2>
        {!viewBoard ? (
          <>
            <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 14 }}>학생별 담벼락을 열어 칭찬·피드백을 남기고, 공개범위를 정할 수 있어요.</p>
            {rosterLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>불러오는 중…</div>
            ) : roster.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>아직 담벼락을 시작한 학생이 없어요. 학생이 담벼락에 처음 들어가면 여기에 나타납니다.</div>
            ) : (
              roster.map((b) => (
                <div key={b.ownerId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                  <button onClick={() => openBoard(b)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "#334155", fontSize: "0.95rem" }}>
                    {b.ownerName || "이름없음"}
                  </button>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <VisBadge v={b.visibility === "class" ? "class" : "private"} />
                    <button onClick={() => handleToggleVisibility(b)} style={{ background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 8, padding: "5px 10px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
                      {b.visibility === "class" ? "비공개로" : "학급공개로"}
                    </button>
                  </span>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px" }}>
              <button onClick={() => { setViewBoard(null); loadRoster(); }} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: "0.85rem" }}>← 목록</button>
              <b style={{ color: "#0f172a" }}>{viewBoard.ownerName || "이름없음"} 의 담벼락</b>
              <VisBadge v={viewBoard.visibility === "class" ? "class" : "private"} />
              <button onClick={() => handleToggleVisibility(viewBoard)} style={{ background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", borderRadius: 8, padding: "5px 10px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
                {viewBoard.visibility === "class" ? "비공개로" : "학급공개로"}
              </button>
            </div>
            {renderPosts()}
          </>
        )}
      </div>
    );
  }

  // ── 학생 뷰 ─────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 12px" }}>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>🧱 담벼락</h2>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, borderBottom: "1px solid #e2e8f0" }}>
        {[
          { k: "mine", label: "나의 담벼락" },
          { k: "class", label: "학급 담벼락" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setStudentTab(t.k)}
            style={{
              padding: "8px 14px",
              background: "none",
              border: "none",
              borderBottom: studentTab === t.k ? "2px solid #4f46e5" : "2px solid transparent",
              color: studentTab === t.k ? "#4f46e5" : "#64748b",
              fontWeight: studentTab === t.k ? 700 : 500,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {studentTab === "mine" && viewBoard && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <VisBadge v={viewBoard.visibility === "class" ? "class" : "private"} />
            <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
              {viewBoard.visibility === "class" ? "친구들이 내 담벼락을 볼 수 있어요" : "선생님과 나만 볼 수 있어요"}
            </span>
          </div>
          {renderPosts()}
        </>
      )}

      {studentTab === "class" && (
        <>
          {viewBoard && viewBoard.ownerId !== currentUserId ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <button onClick={() => setViewBoard(null)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: "0.85rem" }}>← 목록</button>
                <b style={{ color: "#0f172a" }}>{viewBoard.ownerName || "이름없음"} 의 담벼락</b>
                <VisBadge v="class" />
              </div>
              {renderPosts()}
            </>
          ) : (
            <>
              <p style={{ color: "#64748b", fontSize: "0.9rem", marginBottom: 12 }}>학급에 공개된 친구들의 담벼락이에요. 응원 댓글을 남겨보세요 🙌</p>
              {classBoards.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>아직 공개된 담벼락이 없어요.</div>
              ) : (
                classBoards.map((b) => (
                  <button
                    key={b.ownerId}
                    onClick={() => openBoard(b)}
                    style={{ display: "block", width: "100%", textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontWeight: 700, color: "#334155" }}
                  >
                    {b.ownerName || "이름없음"} 의 담벼락 →
                  </button>
                ))
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PersonalBoard;
