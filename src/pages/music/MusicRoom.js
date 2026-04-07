import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import YouTube from "react-youtube";
import { usePolling } from "../../hooks/usePolling";
import "../../MusicRoom.css";
import { AlchanLoading } from "../../components/AlchanLayout";
import { logger } from "../../utils/logger";

const YOUTUBE_ERROR_MESSAGES = {
  2: "영상 주소가 올바르지 않습니다.",
  5: "브라우저가 이 유튜브 영상을 재생하지 못했습니다.",
  100: "삭제되었거나 비공개 영상입니다.",
  101: "유튜브에서 외부 사이트 재생을 허용하지 않은 영상입니다.",
  150: "유튜브에서 외부 사이트 재생을 허용하지 않은 영상입니다.",
};

const normalizeVideoId = (value) => {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("youtu.be")) {
      const idFromPath = url.pathname.replace("/", "").trim();
      return /^[a-zA-Z0-9_-]{11}$/.test(idFromPath) ? idFromPath : null;
    }

    const idFromQuery = url.searchParams.get("v");
    return /^[a-zA-Z0-9_-]{11}$/.test(idFromQuery || "") ? idFromQuery : null;
  } catch {
    return null;
  }
};

const MusicRoom = ({ user }) => {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [playerRef, setPlayerRef] = useState(null);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [playerError, setPlayerError] = useState("");
  const navigate = useNavigate();

  const currentSong = useMemo(() => playlist[0] || null, [playlist]);

  const tryStartPlayback = useCallback(
    (player, videoId) => {
      if (!player || !videoId) return;

      try {
        player.loadVideoById(videoId);
        player.playVideo();
        setNeedsPlay(false);
        setPlayerError("");
      } catch (error) {
        logger.warn("[MusicRoom] playback start failed:", error);
        setNeedsPlay(true);
      }
    },
    [],
  );

  const { refetch: refetchRoom } = usePolling(
    async () => {
      if (!user) return null;

      const roomRef = doc(db, "musicRooms", roomId);
      const docSnap = await getDoc(roomRef);

      if (!docSnap.exists()) {
        alert("존재하지 않는 방입니다.");
        navigate("/learning-board/music-request");
        return null;
      }

      const roomData = docSnap.data();
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const isAdmin =
        userData.isAdmin === true ||
        userData.isSuperAdmin === true ||
        userData.role === "admin";

      if (roomData.teacherId !== user.uid && !isAdmin) {
        alert("접근 권한이 없습니다.");
        navigate("/learning-board/music-request");
        return null;
      }

      const nextRoom = { id: docSnap.id, ...roomData };
      setRoom(nextRoom);
      return nextRoom;
    },
    { interval: 10 * 60 * 1000, enabled: !!user, deps: [user, roomId] },
  );

  const { refetch: refetchPlaylist } = usePolling(
    async () => {
      if (!room) return [];

      const q = query(
        collection(db, "musicRooms", roomId, "playlist"),
        orderBy("requestedAt", "asc"),
      );
      const querySnapshot = await getDocs(q);
      const newPlaylist = querySnapshot.docs.map((playlistDoc) => ({
        id: playlistDoc.id,
        ...playlistDoc.data(),
      }));
      setPlaylist(newPlaylist);
      return newPlaylist;
    },
    { interval: 30 * 1000, enabled: !!room, deps: [room, roomId] },
  );

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!currentSong) {
      setCurrentVideoId(null);
      setNeedsPlay(false);
      setPlayerError("");
      return;
    }

    const nextVideoId = normalizeVideoId(currentSong.videoId);
    setCurrentVideoId(nextVideoId);

    if (!nextVideoId) {
      setNeedsPlay(false);
      setPlayerError("이 곡의 유튜브 영상 주소가 올바르지 않습니다.");
      return;
    }

    setNeedsPlay(false);
    setPlayerError("");
  }, [currentSong]);

  useEffect(() => {
    if (!playerRef || !currentVideoId) return;
    tryStartPlayback(playerRef, currentVideoId);
  }, [playerRef, currentVideoId, tryStartPlayback]);

  const onReady = (event) => {
    setPlayerRef(event.target);
    if (currentVideoId) {
      tryStartPlayback(event.target, currentVideoId);
    }
  };

  const onStateChange = (event) => {
    if (event.data === -1) {
      setNeedsPlay(true);
    } else if (event.data === 1) {
      setNeedsPlay(false);
      setPlayerError("");
    } else if (event.data === 2) {
      setNeedsPlay(true);
    } else if (event.data === 0) {
      playNextSong();
    }
  };

  const onError = (event) => {
    logger.error("[MusicRoom] YouTube error:", event.data);
    setNeedsPlay(false);
    setPlayerError(
      YOUTUBE_ERROR_MESSAGES[event.data] ||
        "유튜브 영상 재생에 실패했습니다. 다음 곡으로 넘겨주세요.",
    );
  };

  const handleManualPlay = () => {
    if (!playerRef || !currentVideoId) return;
    tryStartPlayback(playerRef, currentVideoId);
  };

  const playNextSong = async () => {
    if (playlist.length === 0) return;

    const playedSongId = playlist[0].id;
    await deleteDoc(doc(db, "musicRooms", roomId, "playlist", playedSongId));
    setNeedsPlay(false);
    setPlayerError("");
    refetchPlaylist();
  };

  const deleteRoom = async () => {
    if (
      !window.confirm(
        "정말로 이 방을 삭제하시겠습니까? 모든 신청 목록도 함께 삭제됩니다.",
      )
    ) {
      return;
    }

    try {
      const playlistQuery = query(collection(db, "musicRooms", roomId, "playlist"));
      const playlistSnapshot = await getDocs(playlistQuery);
      const deletePromises = playlistSnapshot.docs.map((docSnapshot) =>
        deleteDoc(docSnapshot.ref),
      );
      await Promise.all(deletePromises);

      await deleteDoc(doc(db, "musicRooms", roomId));
      refetchRoom();
      alert("방이 삭제되었습니다.");
      navigate("/learning-board/music-request");
    } catch (error) {
      logger.error("Error deleting room:", error);
      alert("방을 삭제하는 중 오류가 발생했습니다.");
    }
  };

  const opts = {
    height: "100%",
    width: "100%",
    host: "https://www.youtube.com",
    playerVars: {
      autoplay: 1,
      controls: 1,
      enablejsapi: 1,
      playsinline: 1,
      origin: window.location.origin,
      rel: 0,
      modestbranding: 1,
      iv_load_policy: 3,
    },
  };

  if (!room) return <AlchanLoading />;

  return (
    <div className="music-room-container-grid">
      <div className="main-content">
        <div className="video-player-wrapper">
          {currentVideoId ? (
            <>
              <YouTube
                videoId={currentVideoId}
                opts={opts}
                onReady={onReady}
                onStateChange={onStateChange}
                onError={onError}
                className="youtube-player"
              />
              {playerError && (
                <div
                  style={{
                    position: "absolute",
                    left: "16px",
                    bottom: "16px",
                    zIndex: 11,
                    background: "rgba(0, 0, 0, 0.75)",
                    color: "#fda4af",
                    border: "1px solid rgba(251, 113, 133, 0.5)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    maxWidth: "420px",
                    fontSize: "0.92rem",
                  }}
                >
                  {playerError}
                </div>
              )}
              {needsPlay && (
                <button
                  onClick={handleManualPlay}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 10,
                    background: "rgba(0, 255, 242, 0.2)",
                    border: "2px solid #00fff2",
                    borderRadius: "50%",
                    width: "80px",
                    height: "80px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backdropFilter: "blur(4px)",
                  }}
                  aria-label="재생"
                >
                  <span
                    style={{
                      fontSize: "2rem",
                      color: "var(--accent)",
                      marginLeft: "4px",
                    }}
                  >
                    ▶
                  </span>
                </button>
              )}
            </>
          ) : (
            <div className="no-video-placeholder">
              <p>재생할 곡이 없습니다. 학생이 음악을 신청하면 여기서 재생됩니다.</p>
            </div>
          )}
        </div>
        <div className="room-header">
          <button
            onClick={() => navigate("/")}
            className="control-btn"
            title="알찬 홈으로"
            style={{ fontSize: "1.1rem", padding: "0.4rem 0.8rem" }}
          >
            ← 홈
          </button>
          <h2>{room.name}</h2>
          <div className="room-controls">
            <button
              onClick={playNextSong}
              className="control-btn"
              disabled={playlist.length === 0}
            >
              다음 곡
            </button>
            <button onClick={deleteRoom} className="delete-room-btn">
              방 삭제
            </button>
          </div>
        </div>
      </div>
      <div className="sidebar-content">
        <div className="playlist-panel">
          <h3>재생 목록 ({playlist.length}곡)</h3>
          {playlist.length > 0 ? (
            <ul className="playlist">
              {playlist.map((song, index) => (
                <li key={song.id} className={index === 0 ? "playing" : ""}>
                  <span className="song-title">
                    {index + 1}. {song.title}
                  </span>
                  <span className="requester">신청: {song.requesterName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="no-playlist-message">
              <p>아직 신청된 곡이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MusicRoom;
