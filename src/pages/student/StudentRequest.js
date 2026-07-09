import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
  runTransaction,
  increment,
} from "firebase/firestore";
import { searchVideos, parseVideoId, getQuotaExhausted } from "../../utils/youtube-api";
import { useAuth } from "../../contexts/AuthContext";
import { logger } from "../../utils/logger";
import "./StudentRequest.css";

const StudentRequest = () => {
  const { roomId } = useParams();
  const { user, userDoc } = useAuth();
  const [roomName, setRoomName] = useState("");
  const [pricePerSong, setPricePerSong] = useState(0);
  const [teacherId, setTeacherId] = useState("");

  // 탭: "search" | "url"
  const [activeTab, setActiveTab] = useState("search");

  // 검색 탭
  const [searchTerm, setSearchTerm] = useState("");
  const [videos, setVideos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // URL 탭
  const [urlInput, setUrlInput] = useState("");
  const [urlPreview, setUrlPreview] = useState(null); // { videoId, title, thumbnail }
  const [urlLoading, setUrlLoading] = useState(false);
  const urlDebounceRef = useRef(null);

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [requesterName, setRequesterName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false); // 익명 신청 여부(재생목록에 '익명'으로 표시)
  const [isPriority, setIsPriority] = useState(false); // 우선 신청권: 기본가의 150% 지불, 대기열 맨 앞
  const [story, setStory] = useState(""); // 선택: 사연/메시지 (재생목록에 표시)
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState(false);

  const navigate = useNavigate();

  // 우선 신청권 가격 = 기본가 + 50% (정수 보장 위해 올림)
  const priorityPrice = Math.ceil(pricePerSong * 1.5);
  const requestCost = isPriority ? priorityPrice : pricePerSong;

  useEffect(() => {
    const fetchRoomInfo = async () => {
      const roomDoc = await getDoc(doc(db, "musicRooms", roomId));
      if (roomDoc.exists()) {
        const data = roomDoc.data();
        setRoomName(data.name);
        setPricePerSong(data.pricePerSong || 0);
        setTeacherId(data.teacherId || "");
      } else {
        setRoomError("존재하지 않는 방입니다.");
      }
    };
    fetchRoomInfo();
  }, [roomId]);

  useEffect(() => {
    if (userDoc?.name) setRequesterName(userDoc.name);
  }, [userDoc]);

  // 할당량 초과 시 URL 탭으로 자동 전환
  useEffect(() => {
    if (quotaExceeded) setActiveTab("url");
  }, [quotaExceeded]);

  // 진입 시 학급 공유 quota 상태 확인 — 다른 학생이 이미 한도를 맞췄으면
  // 헛검색 없이 바로 URL 신청으로 유도(읽기 1회, 검색 100units 낭비 방지).
  useEffect(() => {
    let cancelled = false;
    getQuotaExhausted().then((exhausted) => {
      if (!cancelled && exhausted) setQuotaExceeded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // URL 입력 시 자동 미리보기 (디바운스 500ms)
  useEffect(() => {
    if (urlDebounceRef.current) clearTimeout(urlDebounceRef.current);
    setUrlPreview(null);
    setSelectedVideo(null);
    setError("");

    const trimmed = urlInput.trim();
    if (!trimmed) return;

    const videoId = parseVideoId(trimmed);
    if (!videoId) return;

    urlDebounceRef.current = setTimeout(async () => {
      setUrlLoading(true);
      try {
        // oEmbed API - 무료, API 키 불필요
        const res = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (res.ok) {
          const data = await res.json();
          const preview = {
            videoId,
            title: data.title,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          };
          setUrlPreview(preview);
          // 미리보기 확인되면 자동 선택
          setSelectedVideo({
            id: { videoId },
            snippet: {
              title: data.title,
              thumbnails: { default: { url: preview.thumbnail } },
            },
          });
        } else {
          // oEmbed 실패해도 videoId는 유효할 수 있음
          const preview = {
            videoId,
            title: trimmed,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          };
          setUrlPreview(preview);
          setSelectedVideo({
            id: { videoId },
            snippet: {
              title: trimmed,
              thumbnails: { default: { url: preview.thumbnail } },
            },
          });
        }
      } catch {
        // 네트워크 오류 시에도 ID로 선택 가능
        const preview = {
          videoId,
          title: trimmed,
          thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        };
        setUrlPreview(preview);
        setSelectedVideo({
          id: { videoId },
          snippet: {
            title: trimmed,
            thumbnails: { default: { url: preview.thumbnail } },
          },
        });
      } finally {
        setUrlLoading(false);
      }
    }, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlInput]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    setError("");
    setSelectedVideo(null);
    try {
      const results = await searchVideos(searchTerm);
      setVideos(results);
      setRequestSuccess(false);
    } catch (err) {
      if (err.message === "QUOTA_EXCEEDED") {
        setQuotaExceeded(true);
        setError("오늘 검색 한도를 초과했습니다. 'URL로 입력' 탭을 사용해주세요.");
      } else {
        setError(err.message || "YouTube 영상을 검색하는 중 오류가 발생했습니다.");
      }
      logger.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlInput(text);
    } catch {
      setError("클립보드 접근 권한이 없습니다. 직접 붙여넣기(Ctrl+V)해주세요.");
    }
  };

  const handleRequest = async () => {
    if (!selectedVideo) {
      alert("영상을 선택해주세요.");
      return;
    }

    const name = requesterName.trim();
    // 익명 신청이면 이름 없이도 신청 가능(재생목록엔 '익명'으로 표시)
    if (!isAnonymous && !name) {
      alert("신청자 이름을 입력해주세요.");
      return;
    }

    if (pricePerSong > 0 && !user) {
      alert("유료 음악 신청은 로그인이 필요합니다.");
      return;
    }

    // fail-closed: 유료 방인데 수취인(선생님) 정보가 없으면 무료로 통과시키지 않고 차단
    if (pricePerSong > 0 && !teacherId) {
      alert("방 정보에 오류가 있습니다. 선생님께 문의해주세요.");
      return;
    }

    setIsRequesting(true);
    try {
      // 결제 게이팅 단일화 — 트랜잭션 실행·isPriority 기록·paidAmount가 전부 이 조건 하나를 참조
      const isPaidRequest = pricePerSong > 0 && !!user && !!teacherId;

      const trimmedStory = story.trim().slice(0, 200); // 과도한 길이 방지
      // 익명 신청: 재생목록엔 '익명'으로 표시하고 requesterId도 남기지 않음.
      // (유료 신청의 결제/거래로그는 자금 추적을 위해 트랜잭션에서 실명 유지 — 화면 표시만 익명)
      const playlistEntry = {
        videoId: selectedVideo.id.videoId,
        title: selectedVideo.snippet.title,
        requesterName: isAnonymous ? "익명" : name,
        requestedAt: serverTimestamp(),
        ...(user && !isAnonymous ? { requesterId: user.uid } : {}),
        ...(isAnonymous ? { isAnonymous: true } : {}),
        ...(trimmedStory ? { story: trimmedStory } : {}),
        // 우선 신청권: 결제가 실제 실행된 경우에만 표시(무료 방/비결제 우회 방지)
        ...(isPriority && isPaidRequest ? { isPriority: true } : {}),
        paidAmount: isPaidRequest ? requestCost : 0,
      };

      if (isPaidRequest) {
        const currentCash = userDoc?.cash || 0;
        if (currentCash < requestCost) {
          alert(
            `잔액이 부족합니다. 필요: ${requestCost.toLocaleString()}, 보유: ${currentCash.toLocaleString()}`
          );
          setIsRequesting(false);
          return;
        }

        await runTransaction(db, async (transaction) => {
          const roomRef = doc(db, "musicRooms", roomId);
          const studentRef = doc(db, "users", user.uid);
          const teacherRef = doc(db, "users", teacherId);
          const [roomSnap, studentSnap] = await Promise.all([
            transaction.get(roomRef),
            transaction.get(studentRef),
          ]);

          // 방 정보 재검증 — 화면 로드 후 가격·수취인이 바뀐 stale 결제 차단
          if (!roomSnap.exists()) throw new Error("방이 삭제되었습니다.");
          const freshRoom = roomSnap.data();
          if (
            (freshRoom.pricePerSong || 0) !== pricePerSong ||
            freshRoom.teacherId !== teacherId
          ) {
            throw new Error("ROOM_CHANGED");
          }

          if (!studentSnap.exists()) throw new Error("사용자 정보를 찾을 수 없습니다.");
          const cash = studentSnap.data().cash || 0;
          if (cash < requestCost) throw new Error("잔액이 부족합니다.");

          transaction.update(studentRef, { cash: increment(-requestCost) });
          transaction.update(teacherRef, { cash: increment(requestCost) });

          // 🔥 학생 거래 내역 로그 (음악 요청 결제)
          const sd = studentSnap.data();
          const studentClassCode = sd.classCode || null;
          const studentName = sd.name || sd.nickname || name || "익명";
          const logExpireAt = new Date();
          logExpireAt.setDate(logExpireAt.getDate() + 90);

          const songTitle = selectedVideo?.snippet?.title || "음악";
          const requestLabel = isPriority ? "음악 우선 신청" : "음악 신청";
          const studentLogRef = doc(collection(db, "activity_logs"));
          transaction.set(studentLogRef, {
            userId: user.uid,
            userName: studentName,
            type: "musicRequest",
            description: `${requestLabel}: "${songTitle}" (-${requestCost.toLocaleString()}원)`,
            amount: -requestCost,
            classCode: studentClassCode,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
            expireAt: Timestamp.fromDate(logExpireAt),
          });
          const teacherLogRef = doc(collection(db, "activity_logs"));
          transaction.set(teacherLogRef, {
            userId: teacherId,
            userName: "선생님",
            type: "musicRequest",
            description: `${studentName}님의 ${requestLabel} 수익 (+${requestCost.toLocaleString()}원)`,
            amount: requestCost,
            classCode: studentClassCode,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp(),
            expireAt: Timestamp.fromDate(logExpireAt),
          });

          // 결제와 곡 등록을 같은 트랜잭션으로 묶어
          // "돈만 차감되고 곡은 미등록"되는 부분 실패를 차단
          const songRef = doc(collection(db, "musicRooms", roomId, "playlist"));
          transaction.set(songRef, playlistEntry);
        });
      } else {
        await addDoc(collection(db, "musicRooms", roomId, "playlist"), playlistEntry);
      }

      setRequestSuccess(true);
    } catch (err) {
      if (err.message === "잔액이 부족합니다.") {
        alert("잔액이 부족합니다.");
      } else if (err.message === "ROOM_CHANGED") {
        alert(
          "방의 가격 정보가 변경되었습니다. 화면을 새로고침한 뒤 다시 신청해주세요."
        );
      } else if (err.message === "방이 삭제되었습니다.") {
        alert("방이 삭제되어 신청할 수 없습니다.");
      } else {
        setError("음악을 신청하는 중 오류가 발생했습니다.");
        logger.error(err);
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const resetForNextRequest = () => {
    setRequestSuccess(false);
    setSelectedVideo(null);
    setSearchTerm("");
    setVideos([]);
    setUrlInput("");
    setUrlPreview(null);
    setStory("");
    setIsAnonymous(false);
    setIsPriority(false);
    setError("");
  };

  if (roomError) {
    return (
      <div className="student-request-container error-container">
        <p>{roomError}</p>
        <button
          onClick={() => navigate("/learning-board/music-request")}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1.5rem",
            borderRadius: "8px",
            backgroundColor: "rgba(99, 102, 241, 0.3)",
            border: "1px solid rgba(99, 102, 241, 0.5)",
            color: "#818cf8",
            cursor: "pointer",
          }}
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="student-request-container">
      <h2>{roomName || "음악 신청"}</h2>

      {pricePerSong > 0 && (
        <div className="price-info">
          1곡당 {pricePerSong.toLocaleString()} 알찬 · ⚡ 우선 신청{" "}
          {priorityPrice.toLocaleString()} 알찬
          {user && userDoc && (
            <span> (보유: {(userDoc.cash || 0).toLocaleString()})</span>
          )}
        </div>
      )}

      {requestSuccess ? (
        <div className="success-section">
          <h3>"{selectedVideo.snippet.title}"</h3>
          <p>음악 신청이 완료되었습니다!</p>
          {pricePerSong > 0 && (
            <p style={{ color: "#a5b4fc", fontSize: "0.9rem" }}>
              {requestCost.toLocaleString()} 알찬이 차감되었습니다.
              {isPriority && " (⚡ 우선 신청 — 대기열 맨 앞에 배치돼요)"}
            </p>
          )}
          <div className="success-actions">
            <button onClick={resetForNextRequest} className="action-btn continue-btn">
              계속 신청하기
            </button>
            <button
              onClick={() => navigate("/learning-board/music-request")}
              className="action-btn back-btn"
            >
              돌아가기
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 탭 선택 */}
          <div style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            borderBottom: "1px solid rgba(99,102,241,0.3)",
          }}>
            <button
              type="button"
              onClick={() => { setActiveTab("search"); setError(""); }}
              style={{
                padding: "0.6rem 1.2rem",
                background: "none",
                border: "none",
                borderBottom: activeTab === "search" ? "2px solid #818cf8" : "2px solid transparent",
                color: activeTab === "search" ? "#818cf8" : "#6b7280",
                fontWeight: activeTab === "search" ? 700 : 400,
                cursor: "pointer",
                fontSize: "0.95rem",
                transition: "all 0.2s",
              }}
            >
              🔍 제목으로 검색
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("url"); setError(""); }}
              style={{
                padding: "0.6rem 1.2rem",
                background: "none",
                border: "none",
                borderBottom: activeTab === "url" ? "2px solid #818cf8" : "2px solid transparent",
                color: activeTab === "url" ? "#818cf8" : "#6b7280",
                fontWeight: activeTab === "url" ? 700 : 400,
                cursor: "pointer",
                fontSize: "0.95rem",
                transition: "all 0.2s",
              }}
            >
              🔗 URL로 입력
            </button>
          </div>

          {error && (
            <p style={{ color: "#f87171", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</p>
          )}

          {/* 검색 탭 */}
          {activeTab === "search" && (
            <>
              {quotaExceeded ? (
                <div style={{
                  background: "rgba(251,191,36,0.1)",
                  border: "1px solid rgba(251,191,36,0.4)",
                  borderRadius: "10px",
                  padding: "0.8rem 1rem",
                  marginBottom: "1rem",
                  color: "#fbbf24",
                  fontSize: "0.9rem",
                }}>
                  ⚠️ 오늘 검색 한도를 초과했습니다. <strong>'URL로 입력'</strong> 탭을 이용해주세요.
                </div>
              ) : (
                <form onSubmit={handleSearch} className="search-form">
                  <input
                    type="text"
                    className="search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="신청할 노래 제목이나 아티스트를 검색하세요"
                  />
                  <button type="submit" className="search-btn" disabled={isLoading}>
                    {isLoading ? "검색 중..." : "검색"}
                  </button>
                </form>
              )}

              {!quotaExceeded && (
                <div className="search-url-hint">
                  곡이 안 보이거나 검색이 막히면{" "}
                  <button
                    type="button"
                    className="search-url-hint-btn"
                    onClick={() => { setActiveTab("url"); setError(""); }}
                  >
                    🔗 URL로 입력
                  </button>{" "}
                  탭으로 신청할 수 있어요.
                </div>
              )}

              {videos.length > 0 && (
                <div className="search-results">
                  <ul className="video-list">
                    {videos.map((video) => (
                      <li
                        key={video.id.videoId}
                        className={`video-item ${selectedVideo?.id.videoId === video.id.videoId ? "selected" : ""}`}
                        onClick={() => setSelectedVideo(video)}
                      >
                        <img
                          src={video.snippet.thumbnails.default.url}
                          alt={video.snippet.title}
                          loading="lazy"
                          width="120"
                          height="90"
                        />
                        <p>{video.snippet.title}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* URL 직접 입력 탭 */}
          {activeTab === "url" && (
            <div style={{ marginBottom: "1rem" }}>
              {/* 검색 한도 소진 안내 — 학급 전체에 적용(오늘 검색 불가, URL로 신청) */}
              {quotaExceeded && (
                <div className="quota-exhausted-banner">
                  <span className="quota-exhausted-title">
                    ⛔ 오늘은 제목 검색 한도가 모두 소진됐어요
                  </span>
                  <span className="quota-exhausted-desc">
                    유튜브 검색이 내일(오후 4시경 리셋)까지 막혔어요. 그래도 괜찮아요 —
                    아래 안내대로 <strong>유튜브 링크를 복사해서 붙여넣으면</strong> 바로 신청할 수 있어요!
                  </span>
                </div>
              )}
              {/* 3단계 가이드 */}
              <div style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.25)",
                borderRadius: "12px",
                padding: "1rem",
                marginBottom: "1rem",
              }}>
                <p style={{ color: "#4f46e5", fontWeight: 700, marginBottom: "0.7rem", fontSize: "0.95rem" }}>
                  📋 유튜브 링크 붙여넣기 방법
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {[
                    { step: "1", text: "유튜브 앱(또는 브라우저)에서 원하는 영상을 열기" },
                    { step: "2", text: "공유 버튼 → '링크 복사' 클릭" },
                    { step: "3", text: "아래 입력창에 붙여넣기 (길게 누르기 → 붙여넣기)" },
                  ].map(({ step, text }) => (
                    <div key={step} style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                      <span style={{
                        minWidth: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "#6366f1",
                        color: "#fff",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}>{step}</span>
                      <span style={{ color: "#374151", fontSize: "0.88rem", lineHeight: 1.4 }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* URL 입력창 */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <input
                  type="text"
                  className="search-input"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://youtu.be/xxxxx 여기에 붙여넣기"
                  style={{ flex: 1 }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="search-btn"
                  onClick={handlePasteFromClipboard}
                  title="클립보드에서 붙여넣기"
                  style={{ whiteSpace: "nowrap", minWidth: "fit-content" }}
                >
                  📋 붙여넣기
                </button>
              </div>

              {/* 로딩 */}
              {urlLoading && (
                <div style={{ color: "#6b7280", fontSize: "0.9rem", textAlign: "center", padding: "1rem" }}>
                  영상 정보 불러오는 중...
                </div>
              )}

              {/* 미리보기 카드 */}
              {urlPreview && !urlLoading && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.4)",
                  borderRadius: "12px",
                  padding: "0.75rem 1rem",
                }}>
                  <img
                    src={urlPreview.thumbnail}
                    alt={urlPreview.title}
                    style={{ width: 100, height: 75, borderRadius: "8px", objectFit: "cover", flexShrink: 0 }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      color: "#10b981",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      marginBottom: "0.3rem",
                    }}>✅ 영상 확인됨</p>
                    <p style={{
                      color: "#111827",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}>
                      {urlPreview.title}
                    </p>
                  </div>
                </div>
              )}

              {/* 입력했는데 유효하지 않을 때 */}
              {urlInput.trim() && !urlPreview && !urlLoading && (
                <div style={{
                  color: "#f87171",
                  fontSize: "0.88rem",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "8px",
                  padding: "0.6rem 0.8rem",
                }}>
                  ❌ 유효한 YouTube 링크가 아닙니다. 링크를 다시 확인해주세요.
                </div>
              )}
            </div>
          )}

          {/* 신청 섹션 */}
          {selectedVideo && (
            <div className="request-section">
              <h4>신청 정보</h4>
              <p>선택된 곡: {selectedVideo.snippet.title}</p>
              {!user && (
                <input
                  type="text"
                  className="requester-name-input"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="신청자 이름을 입력하세요"
                />
              )}
              <textarea
                className="request-story-input"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                placeholder="사연·하고 싶은 말을 적어주세요 (선택, 재생목록에 표시돼요)"
                maxLength={200}
                rows={2}
              />
              <div className="request-story-count">{story.length}/200</div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  margin: "0.5rem 0 0.75rem",
                  fontSize: "0.9rem",
                  color: "#4f46e5",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                🙈 익명으로 신청하기 (재생목록에 이름 대신 '익명'으로 표시돼요)
              </label>
              {pricePerSong > 0 && user && teacherId && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    margin: "0 0 0.75rem",
                    fontSize: "0.9rem",
                    color: "#d97706",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isPriority}
                    disabled={isRequesting}
                    onChange={(e) => setIsPriority(e.target.checked)}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  ⚡ 우선 신청권 ({priorityPrice.toLocaleString()} 알찬) —
                  지금 나오는 곡이 끝나면 대기 중인 곡보다 먼저 재생돼요
                </label>
              )}
              <button
                onClick={handleRequest}
                className="request-btn"
                disabled={isRequesting}
              >
                {isRequesting
                  ? "신청 중..."
                  : pricePerSong > 0
                    ? `${requestCost.toLocaleString()} 알찬으로 ${isPriority ? "⚡ 우선 " : ""}신청하기`
                    : "이 곡으로 신청하기"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentRequest;
