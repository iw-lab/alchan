import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  runTransaction,
  increment,
} from "firebase/firestore";
import { searchVideos } from "../../utils/youtube-api";
import { useAuth } from "../../contexts/AuthContext";
import { logger } from "../../utils/logger";
import "./StudentRequest.css";

const StudentRequest = () => {
  const { roomId } = useParams();
  const { user, userDoc } = useAuth();
  const [roomName, setRoomName] = useState("");
  const [pricePerSong, setPricePerSong] = useState(0);
  const [teacherId, setTeacherId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [requesterName, setRequesterName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState("");
  const [requestSuccess, setRequestSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRoomInfo = async () => {
      const roomDoc = await getDoc(doc(db, "musicRooms", roomId));
      if (roomDoc.exists()) {
        const data = roomDoc.data();
        setRoomName(data.name);
        setPricePerSong(data.pricePerSong || 0);
        setTeacherId(data.teacherId || "");
      } else {
        setError("존재하지 않는 방입니다.");
      }
    };
    fetchRoomInfo();
  }, [roomId]);

  // 로그인된 사용자의 이름 자동 채우기
  useEffect(() => {
    if (userDoc?.name) {
      setRequesterName(userDoc.name);
    }
  }, [userDoc]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const results = await searchVideos(searchTerm);
      setVideos(results);
      setRequestSuccess(false);
    } catch (err) {
      setError("YouTube 영상을 검색하는 중 오류가 발생했습니다.");
      logger.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequest = async () => {
    if (!selectedVideo) {
      alert("영상을 선택해주세요.");
      return;
    }

    const name = requesterName.trim();
    if (!name) {
      alert("신청자 이름을 입력해주세요.");
      return;
    }

    // 가격이 있으면 로그인 필수
    if (pricePerSong > 0 && !user) {
      alert("유료 음악 신청은 로그인이 필요합니다.");
      return;
    }

    setIsRequesting(true);
    try {
      // 결제 처리
      if (pricePerSong > 0 && user && teacherId) {
        const currentCash = userDoc?.cash || 0;
        if (currentCash < pricePerSong) {
          alert(
            `잔액이 부족합니다. 필요: ${pricePerSong.toLocaleString()}, 보유: ${currentCash.toLocaleString()}`,
          );
          setIsRequesting(false);
          return;
        }

        await runTransaction(db, async (transaction) => {
          const studentRef = doc(db, "users", user.uid);
          const teacherRef = doc(db, "users", teacherId);
          const studentSnap = await transaction.get(studentRef);

          if (!studentSnap.exists())
            throw new Error("사용자 정보를 찾을 수 없습니다.");
          const cash = studentSnap.data().cash || 0;
          if (cash < pricePerSong) throw new Error("잔액이 부족합니다.");

          transaction.update(studentRef, { cash: increment(-pricePerSong) });
          transaction.update(teacherRef, { cash: increment(pricePerSong) });
        });
      }

      // 플레이리스트에 추가
      await addDoc(collection(db, "musicRooms", roomId, "playlist"), {
        videoId: selectedVideo.id.videoId,
        title: selectedVideo.snippet.title,
        requesterName: name,
        requestedAt: serverTimestamp(),
        ...(user ? { requesterId: user.uid } : {}),
        paidAmount: pricePerSong || 0,
      });

      setRequestSuccess(true);
    } catch (err) {
      if (err.message === "잔액이 부족합니다.") {
        alert("잔액이 부족합니다.");
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
  };

  if (error && !videos.length) {
    return (
      <div className="student-request-container error-container">{error}</div>
    );
  }

  return (
    <div className="student-request-container">
      <h2>{roomName || "음악 신청"}</h2>

      {pricePerSong > 0 && (
        <div className="price-info">
          1곡당 {pricePerSong.toLocaleString()} 알찬
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
              {pricePerSong.toLocaleString()} 알찬이 차감되었습니다.
            </p>
          )}
          <div className="success-actions">
            <button
              onClick={resetForNextRequest}
              className="action-btn continue-btn"
            >
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

          {error && (
            <p style={{ color: "#f87171", marginBottom: "1rem" }}>{error}</p>
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
              <button
                onClick={handleRequest}
                className="request-btn"
                disabled={isRequesting}
              >
                {isRequesting
                  ? "신청 중..."
                  : pricePerSong > 0
                    ? `${pricePerSong.toLocaleString()} 알찬으로 신청하기`
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
