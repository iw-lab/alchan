// src/pages/learning/LearningBoard.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./LearningBoard.css";
import { useAuth } from "../../contexts/AuthContext";
import { db } from "../../firebase";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  writeBatch,
  setDoc,
  runTransaction,
} from "firebase/firestore";
import { usePolling } from "../../hooks/usePolling";
import { logger } from "../../utils/logger";

const formatDate = (isoString) => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    return "";
  }
};

const calculateCouponChange = (postData, interactionType, userId) => {
  const { likes = 0, dislikes = 0, likedBy = [], dislikedBy = [] } = postData;
  const userHasLiked = likedBy.includes(userId);
  const userHasDisliked = dislikedBy.includes(userId);
  let oldEffectiveLikes, newEffectiveLikes;

  if (interactionType === 'like') {
    if (userHasLiked) return 0;
    oldEffectiveLikes = likes - dislikes;
    newEffectiveLikes = userHasDisliked ? (likes + 1) - (dislikes - 1) : (likes + 1) - dislikes;
  } else if (interactionType === 'dislike') {
    if (userHasDisliked) return 0;
    oldEffectiveLikes = likes - dislikes;
    newEffectiveLikes = userHasLiked ? (likes - 1) - (dislikes + 1) : likes - (dislikes + 1);
  } else {
    return 0;
  }

  const prevThreshold = Math.max(0, Math.floor(oldEffectiveLikes / 3));
  const currThreshold = Math.max(0, Math.floor(newEffectiveLikes / 3));
  return currThreshold - prevThreshold;
};

const LearningBoard = () => {
  const {
    userDoc: currentUser,
    isAdmin,
    addCouponsToUser,
    loading: authLoading,
  } = useAuth();

  const currentUserId = currentUser?.id;
  const classCode = currentUser?.classCode;

  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isWriting, setIsWriting] = useState(false);
  const [newPost, setNewPost] = useState({ title: "", content: "" });
  const [customCouponAmount, setCustomCouponAmount] = useState(0);
  const [newBoardName, setNewBoardName] = useState("");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showHiddenBoardsView, setShowHiddenBoardsView] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editingBoardName, setEditingBoardName] = useState("");

  const boardsCollectionRef = useMemo(() => {
    if (classCode) return collection(db, "classes", classCode, "learningBoards");
    return null;
  }, [classCode]);

  const boardsQueryFn = useCallback(async () => {
    if (!classCode) return [];
    const ref = collection(db, "classes", classCode, "learningBoards");
    const q = query(ref, orderBy("name"), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      isHidden: typeof doc.data().isHidden === "boolean" ? doc.data().isHidden : false,
    }));
  }, [classCode]);

  const { data: rawBoards, loading: boardsLoading, refetch: refetchBoards } = usePolling(boardsQueryFn, {
    interval: 30 * 60 * 1000,
    enabled: !!classCode,
    deps: [classCode],
  });

  // usePolling의 data 초기값이 null이므로 항상 배열로 보장
  const boards = rawBoards || [];

  const postsQueryFn = useCallback(async () => {
    if (!selectedBoard || !classCode) return [];
    const ref = collection(db, "classes", classCode, "learningBoards", selectedBoard.id, "posts");
    const q = query(ref, orderBy("timestamp", "desc"), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      adminCouponGiven: typeof doc.data().adminCouponGiven === "boolean" ? doc.data().adminCouponGiven : false,
      coupons: Number(doc.data().coupons) || 0,
      likes: Number(doc.data().likes) || 0,
      dislikes: Number(doc.data().dislikes) || 0,
      likedBy: Array.isArray(doc.data().likedBy) ? doc.data().likedBy : [],
      dislikedBy: Array.isArray(doc.data().dislikedBy) ? doc.data().dislikedBy : [],
      timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate().toISOString() : new Date().toISOString(),
    }));
  }, [selectedBoard, classCode]);

  const { data: rawPosts, loading: postsLoading, refetch: refetchPosts } = usePolling(postsQueryFn, {
    interval: 10 * 60 * 1000,
    enabled: !!selectedBoard && !!classCode,
    deps: [selectedBoard?.id, classCode],
  });

  // usePolling의 data 초기값이 null이므로 항상 배열로 보장
  const selectedBoardPosts = rawPosts || [];

  const currentUserIsAdmin = useMemo(() => isAdmin && isAdmin(), [isAdmin]);

  // Loading / guard screens
  if (authLoading) return <div className="lb-msg">사용자 정보 로딩 중...</div>;
  if (!currentUser) return <div className="lb-msg">게시판을 이용하려면 로그인이 필요합니다.</div>;
  if (!classCode && !currentUserIsAdmin) return <div className="lb-msg">학급 코드가 설정되어야 합니다.</div>;
  if (classCode && boardsLoading) return <div className="lb-msg">게시판 목록 로딩 중...</div>;
  if (currentUserIsAdmin && !classCode) return <div className="lb-msg">학급 코드를 설정해주세요.</div>;

  // Board selection handler
  const handleBoardSelect = (boardId, fromHiddenView = false) => {
    const board = boards.find((b) => b.id === boardId);
    if (board && (fromHiddenView || !board.isHidden || currentUserIsAdmin)) {
      setSelectedBoard(board);
      setSelectedPost(null);
      setIsWriting(false);
      if (!fromHiddenView) setShowHiddenBoardsView(false);
    } else if (board && board.isHidden && !currentUserIsAdmin && !fromHiddenView) {
      alert("이 게시판은 현재 접근할 수 없습니다.");
    }
  };

  // Post submit
  const handlePostSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBoard || !classCode || !currentUserId) return;
    if (selectedBoard.isHidden && !currentUserIsAdmin) {
      alert("숨겨진 게시판에는 글을 작성할 수 없습니다.");
      return;
    }
    if (!newPost.title.trim() || !newPost.content.trim()) {
      alert("제목과 내용을 모두 입력해주세요.");
      return;
    }
    try {
      const ref = collection(db, "classes", classCode, "learningBoards", selectedBoard.id, "posts");
      await addDoc(ref, {
        title: newPost.title,
        content: newPost.content,
        author: currentUser?.name || currentUser?.nickname || "익명",
        authorId: currentUserId,
        likes: 0, dislikes: 0, likedBy: [], dislikedBy: [],
        coupons: 0,
        timestamp: serverTimestamp(),
        adminCouponGiven: false,
        classCode,
      });
      refetchPosts();
      setNewPost({ title: "", content: "" });
      setIsWriting(false);
      alert("게시글이 등록되었습니다!");
    } catch (error) {
      logger.error("Error submitting post:", error);
      alert(`게시글 제출 오류: ${error.message}`);
    }
  };

  // Post interactions (like, dislike, adminCoupon)
  const updatePostInteraction = async (boardId, postId, updateType, interactionValue = null) => {
    if (!classCode || !currentUserId) return;
    const postRef = doc(db, "classes", classCode, "learningBoards", boardId, "posts", postId);
    try {
      await runTransaction(db, async (transaction) => {
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists()) throw new Error("게시글을 찾을 수 없습니다.");
        const postData = postDoc.data();
        const updates = {};
        let couponChange = 0;
        const userHasLiked = postData.likedBy?.includes(currentUserId);
        const userHasDisliked = postData.dislikedBy?.includes(currentUserId);

        if (updateType === "like") {
          if (userHasLiked) return;
          updates.likedBy = arrayUnion(currentUserId);
          updates.likes = increment(1);
          if (userHasDisliked) { updates.dislikedBy = arrayRemove(currentUserId); updates.dislikes = increment(-1); }
          couponChange = calculateCouponChange(postData, "like", currentUserId);
        } else if (updateType === "dislike") {
          if (userHasDisliked) return;
          updates.dislikedBy = arrayUnion(currentUserId);
          updates.dislikes = increment(1);
          if (userHasLiked) { updates.likedBy = arrayRemove(currentUserId); updates.likes = increment(-1); }
          couponChange = calculateCouponChange(postData, "dislike", currentUserId);
        } else if (updateType === "adminCoupon" && currentUserIsAdmin && typeof interactionValue === "number" && interactionValue > 0) {
          if (postData.adminCouponGiven) { alert("이미 관리자 쿠폰이 지급되었습니다."); return; }
          updates.adminCouponGiven = true;
          couponChange = interactionValue;
        } else { return; }

        if (couponChange !== 0) updates.coupons = increment(couponChange);
        updates.updatedAt = serverTimestamp();
        transaction.update(postRef, updates);

        if (couponChange !== 0 && postData.authorId && postData.authorId !== currentUserId && addCouponsToUser) {
          addCouponsToUser(postData.authorId, couponChange);
        }
      });
      refetchPosts();
      if (updateType === "adminCoupon" && currentUserIsAdmin) {
        alert(`관리자 쿠폰 ${interactionValue}개가 지급되었습니다.`);
        setCustomCouponAmount(0);
      }
    } catch (error) {
      logger.error(`Error updating post ${updateType}:`, error);
      alert(`처리 중 오류: ${error.message}`);
    }
  };

  const handleLike = (boardId, postId) => updatePostInteraction(boardId, postId, "like");
  const handleDislike = (boardId, postId) => updatePostInteraction(boardId, postId, "dislike");
  const handleGiveCoupons = (boardId, postId, amount) => updatePostInteraction(boardId, postId, "adminCoupon", amount);

  // Board CRUD
  const handleAddBoard = async (e) => {
    e.preventDefault();
    if (!currentUserIsAdmin || !classCode || !boardsCollectionRef) return;
    const trimmedName = newBoardName.trim();
    if (!trimmedName) return alert("게시판 이름을 입력해주세요.");
    if (boards.some((b) => b.name === trimmedName)) return alert("이미 존재하는 이름입니다.");
    try {
      await addDoc(boardsCollectionRef, { name: trimmedName, isHidden: false, createdAt: serverTimestamp(), classCode });
      refetchBoards();
      setNewBoardName("");
    } catch (error) {
      logger.error("Error adding board:", error);
      alert("게시판 추가 오류.");
    }
  };

  const handleStartEditBoard = (board) => { setEditingBoardId(board.id); setEditingBoardName(board.name); };
  const handleCancelEditBoard = () => { setEditingBoardId(null); setEditingBoardName(""); };

  const handleSaveEditBoard = async (e) => {
    e.preventDefault();
    if (!editingBoardId || !classCode || !currentUserIsAdmin) return;
    const trimmedName = editingBoardName.trim();
    if (!trimmedName) return alert("이름을 입력해주세요.");
    if (boards.some((b) => b.id !== editingBoardId && b.name === trimmedName)) return alert("이미 존재하는 이름입니다.");
    try {
      await updateDoc(doc(db, "classes", classCode, "learningBoards", editingBoardId), { name: trimmedName, updatedAt: serverTimestamp() });
      refetchBoards();
      handleCancelEditBoard();
    } catch (error) {
      logger.error("Error updating board name:", error);
    }
  };

  const handleHideBoard = async (boardId) => {
    if (!currentUserIsAdmin || !classCode) return;
    try {
      await updateDoc(doc(db, "classes", classCode, "learningBoards", boardId), { isHidden: true, updatedAt: serverTimestamp() });
      refetchBoards();
      if (selectedBoard?.id === boardId) setSelectedBoard(null);
    } catch (error) { logger.error("Error hiding board:", error); }
  };

  const handleRestoreBoard = async (boardId) => {
    if (!currentUserIsAdmin || !classCode) return;
    try {
      await updateDoc(doc(db, "classes", classCode, "learningBoards", boardId), { isHidden: false, updatedAt: serverTimestamp() });
      refetchBoards();
    } catch (error) { logger.error("Error restoring board:", error); }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!currentUserIsAdmin || !classCode) return;
    const boardToDelete = boards.find((b) => b.id === boardId);
    if (!window.confirm(`'${boardToDelete?.name}' 게시판과 모든 게시글을 영구 삭제하시겠습니까?`)) return;
    try {
      const boardRef = doc(db, "classes", classCode, "learningBoards", boardId);
      const postsRef = collection(boardRef, "posts");
      const postsSnapshot = await getDocs(postsRef);
      const batch = writeBatch(db);
      postsSnapshot.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(boardRef);
      await batch.commit();
      refetchBoards();
      if (selectedBoard?.id === boardId) setSelectedBoard(null);
    } catch (error) {
      logger.error("Error deleting board:", error);
      alert("삭제 오류.");
    }
  };

  const visibleBoards = (boards || []).filter((b) => !b.isHidden);
  const hiddenBoards = (boards || []).filter((b) => b.isHidden);

  return (
    <div className="lb">
      {/* Header */}
      <div className="lb-header">
        <h1 className="lb-title">학습 게시판 {classCode && <span className="lb-class-code">({classCode})</span>}</h1>
        {currentUserIsAdmin && (
          <button className="lb-admin-toggle" onClick={() => setShowAdminPanel((p) => !p)}>
            {showAdminPanel ? "관리자 닫기" : "관리자 열기"}
          </button>
        )}
      </div>

      {/* Board Tabs */}
      <div className="lb-tabs">
        {visibleBoards.map((board) => (
          <button
            key={board.id}
            className={`lb-tab ${selectedBoard?.id === board.id && !showHiddenBoardsView ? "active" : ""}`}
            onClick={() => { handleBoardSelect(board.id, false); setShowHiddenBoardsView(false); }}
          >
            {board.name}
          </button>
        ))}
        {currentUserIsAdmin && (
          <button
            className={`lb-tab lb-tab-manage ${showHiddenBoardsView ? "active" : ""}`}
            onClick={() => {
              setShowHiddenBoardsView((p) => !p);
              if (!showHiddenBoardsView) { setSelectedBoard(null); setSelectedPost(null); setIsWriting(false); }
            }}
          >
            숨김 관리 ({hiddenBoards.length})
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="lb-body">
        {/* Empty state */}
        {!selectedBoard && !showHiddenBoardsView && (
          <div className="lb-empty">
            {visibleBoards.length === 0
              ? "게시판이 없습니다. 관리자에게 문의해주세요."
              : "게시판을 선택해주세요."}
          </div>
        )}

        {/* Post List (table) */}
        {selectedBoard && !selectedPost && !isWriting && !showHiddenBoardsView && (
          <>
            <div className="lb-toolbar">
              <h2 className="lb-board-name">{selectedBoard.name}</h2>
              <button
                className="lb-write-btn"
                onClick={() => setIsWriting(true)}
                disabled={selectedBoard.isHidden && !currentUserIsAdmin}
              >
                글쓰기
              </button>
            </div>

            {postsLoading ? (
              <div className="lb-empty">로딩 중...</div>
            ) : selectedBoardPosts.length === 0 ? (
              <div className="lb-empty">아직 작성된 글이 없습니다.</div>
            ) : (
              <div className="lb-table-wrap">
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th className="lb-col-num">번호</th>
                      <th className="lb-col-title">제목</th>
                      <th className="lb-col-author">작성자</th>
                      <th className="lb-col-date">날짜</th>
                      <th className="lb-col-likes">좋아요</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBoardPosts.map((post, idx) => (
                      <tr
                        key={post.id}
                        className="lb-row"
                        onClick={() => setSelectedPost(post)}
                      >
                        <td className="lb-cell-num">{selectedBoardPosts.length - idx}</td>
                        <td className="lb-cell-title">
                          <span className="lb-post-title-text">{post.title}</span>
                          {post.adminCouponGiven && <span className="lb-badge" title="관리자 확인">✨</span>}
                        </td>
                        <td className="lb-cell-author">{post.author || "익명"}</td>
                        <td className="lb-cell-date">{formatDate(post.timestamp)}</td>
                        <td className="lb-cell-likes">
                          <span className="lb-like-num">👍 {post.likes || 0}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Post Detail */}
        {selectedBoard && selectedPost && !isWriting && !showHiddenBoardsView && (
          <div className="lb-detail">
            <button className="lb-back" onClick={() => setSelectedPost(null)}>← 목록으로</button>
            <div className="lb-detail-card">
              <h2 className="lb-detail-title">{selectedPost.title}</h2>
              <div className="lb-detail-meta">
                <span>작성자: {selectedPost.author || "익명"}</span>
                <span>{formatDate(selectedPost.timestamp)}</span>
              </div>
              <div className="lb-detail-content">{selectedPost.content}</div>

              {/* Like / Dislike */}
              <div className="lb-detail-actions">
                <div className="lb-action-row">
                  <button
                    className={`lb-like-btn ${selectedPost.likedBy?.includes(currentUserId) ? "active" : ""}`}
                    onClick={() => handleLike(selectedBoard.id, selectedPost.id)}
                    disabled={
                      selectedPost.likedBy?.includes(currentUserId) ||
                      selectedPost.dislikedBy?.includes(currentUserId) ||
                      selectedPost.authorId === currentUserId
                    }
                  >
                    👍 좋아요 {selectedPost.likes || 0}
                  </button>
                  <button
                    className={`lb-dislike-btn ${selectedPost.dislikedBy?.includes(currentUserId) ? "active" : ""}`}
                    onClick={() => handleDislike(selectedBoard.id, selectedPost.id)}
                    disabled={
                      selectedPost.likedBy?.includes(currentUserId) ||
                      selectedPost.dislikedBy?.includes(currentUserId) ||
                      selectedPost.authorId === currentUserId
                    }
                  >
                    👎 싫어요 {selectedPost.dislikes || 0}
                  </button>
                  <span className="lb-stat">획득 쿠폰: {selectedPost.coupons || 0}개</span>
                  <span className="lb-stat">실효 좋아요: {(selectedPost.likes || 0) - (selectedPost.dislikes || 0)}</span>
                  {selectedPost.adminCouponGiven && !currentUserIsAdmin && (
                    <span className="lb-verified-badge">✨ 관리자 확인</span>
                  )}
                </div>

                {/* Admin coupon controls */}
                {currentUserIsAdmin && (
                  <div className="lb-admin-coupon">
                    <h4>관리자 쿠폰 지급</h4>
                    {selectedPost.adminCouponGiven ? (
                      <p className="lb-coupon-done">이미 지급되었습니다.</p>
                    ) : (
                      <div className="lb-coupon-row">
                        {[1, 3, 5].map((amount) => (
                          <button
                            key={amount}
                            className="lb-coupon-quick"
                            onClick={() => handleGiveCoupons(selectedBoard.id, selectedPost.id, amount)}
                          >
                            +{amount}
                          </button>
                        ))}
                        <input
                          type="number"
                          min="1"
                          value={customCouponAmount === 0 ? "" : customCouponAmount}
                          onChange={(e) => setCustomCouponAmount(parseInt(e.target.value) || 0)}
                          placeholder="직접"
                          className="lb-coupon-input"
                        />
                        <button
                          className="lb-coupon-give"
                          onClick={() => handleGiveCoupons(selectedBoard.id, selectedPost.id, customCouponAmount)}
                          disabled={customCouponAmount <= 0}
                        >
                          지급
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Write Form */}
        {isWriting && selectedBoard && (!selectedBoard.isHidden || currentUserIsAdmin) && !showHiddenBoardsView && (
          <div className="lb-write">
            <button className="lb-back" onClick={() => setIsWriting(false)}>← 목록으로</button>
            <h2 className="lb-write-heading">{selectedBoard.name}에 글쓰기</h2>
            <form onSubmit={handlePostSubmit} className="lb-form">
              <div className="lb-field">
                <label>제목</label>
                <input
                  type="text"
                  value={newPost.title}
                  onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                  placeholder="제목을 입력하세요"
                  required
                />
              </div>
              <div className="lb-field">
                <label>내용</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                  placeholder="내용을 입력하세요"
                  required
                  rows="10"
                />
              </div>
              <button type="submit" className="lb-submit">게시하기</button>
            </form>
          </div>
        )}

        {/* Hidden Board Management */}
        {showHiddenBoardsView && currentUserIsAdmin && (
          <div className="lb-hidden-manage">
            <h2>숨김 게시판 관리</h2>

            {/* All boards for selection */}
            <div className="lb-hidden-tabs">
              {boards.map((board) => (
                <button
                  key={board.id}
                  className={`lb-tab ${selectedBoard?.id === board.id ? "active" : ""} ${board.isHidden ? "lb-tab-hidden" : ""}`}
                  onClick={() => handleBoardSelect(board.id, true)}
                >
                  {board.isHidden ? "🔒" : "📂"} {board.name}
                </button>
              ))}
            </div>

            {/* If a board is selected in hidden view, show write/view */}
            {selectedBoard && (
              <div className="lb-hidden-actions">
                <button className="lb-write-btn" onClick={() => { setIsWriting(true); setShowHiddenBoardsView(false); }}>
                  '{selectedBoard.name}' 글쓰기
                </button>
                <button className="lb-view-btn-sm" onClick={() => { setShowHiddenBoardsView(false); setSelectedPost(null); setIsWriting(false); }}>
                  '{selectedBoard.name}' 글보기
                </button>
              </div>
            )}

            {/* Board management list */}
            <h3>숨김/복구/삭제</h3>
            <div className="lb-manage-list">
              {boards.sort((a, b) => a.name.localeCompare(b.name)).map((board) => (
                <div key={board.id} className={`lb-manage-item ${board.isHidden ? "hidden" : "visible"}`}>
                  <span className="lb-manage-name">
                    {board.name} ({board.isHidden ? "숨김" : "공개"})
                  </span>
                  <div className="lb-manage-btns">
                    {board.isHidden ? (
                      <button className="lb-btn-restore" onClick={() => handleRestoreBoard(board.id)}>공개로</button>
                    ) : (
                      <button className="lb-btn-hide" onClick={() => handleHideBoard(board.id)}>숨기기</button>
                    )}
                    <button className="lb-btn-delete" onClick={() => handleDeleteBoard(board.id)}>삭제</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Admin Side Panel */}
      {currentUserIsAdmin && showAdminPanel && (
        <div className="lb-admin-panel">
          <button className="lb-admin-close" onClick={() => setShowAdminPanel(false)}>×</button>
          <h2>관리자 기능</h2>

          <div className="lb-admin-section">
            <h3>게시판 추가</h3>
            <form onSubmit={handleAddBoard} className="lb-admin-form">
              <input
                type="text"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="새 게시판 이름"
                required
              />
              <button type="submit">추가</button>
            </form>
          </div>

          <div className="lb-admin-section">
            <h3>게시판 이름 변경</h3>
            <ul className="lb-admin-board-list">
              {[...boards].sort((a, b) => a.name.localeCompare(b.name)).map((board) => (
                <li key={board.id} className={board.isHidden ? "hidden" : ""}>
                  {editingBoardId === board.id ? (
                    <form onSubmit={handleSaveEditBoard} className="lb-edit-form">
                      <input type="text" value={editingBoardName} onChange={(e) => setEditingBoardName(e.target.value)} autoFocus />
                      <button type="submit">💾</button>
                      <button type="button" onClick={handleCancelEditBoard}>↩️</button>
                    </form>
                  ) : (
                    <div className="lb-board-row">
                      <span>{board.name} {board.isHidden ? "(숨김)" : ""}</span>
                      <button onClick={() => handleStartEditBoard(board)}>✏️</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="lb-admin-section">
            <h3>통계</h3>
            <ul className="lb-stats-list">
              <li>공개 게시판: {visibleBoards.length}개</li>
              <li>숨김 게시판: {hiddenBoards.length}개</li>
              <li>선택된 게시판 게시글: {selectedBoardPosts?.length || 0}개</li>
              <li>선택된 게시판 총 쿠폰: {(selectedBoardPosts || []).reduce((s, p) => s + (p.coupons || 0), 0)}개</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningBoard;
