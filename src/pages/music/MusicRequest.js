import React, { useState } from "react";
import { db } from "../../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { usePolling } from "../../hooks/usePolling";
import "../../MusicRequest.css";
import { logger } from "../../utils/logger";

const MusicRequest = ({ user }) => {
  const [roomName, setRoomName] = useState("");
  const [pricePerSong, setPricePerSong] = useState(0);
  const [createdRoom, setCreatedRoom] = useState(null); // 새로 생성된 방 정보
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [classCode, setClassCode] = useState(null); // 본인 학급 코드
  const navigate = useNavigate();

  // 관리자 권한 + 학급 코드 확인
  const { data: isAdminData, loading: adminLoading } = usePolling(
    async () => {
      if (!user) return false;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) return false;

      const userData = userDoc.data();
      const isAdminUser =
        userData.role === "admin" ||
        userData.isAdmin === true ||
        userData.isSuperAdmin === true;
      setIsAdmin(isAdminUser);
      setClassCode(userData.classCode || null);
      return isAdminUser;
    },
    { interval: 30 * 60 * 1000, enabled: !!user, deps: [user] },
  );

  // 본인 학급의 방 목록만 폴링으로 가져옵니다 (학급 격리)
  const {
    data: myRooms,
    loading,
    refetch,
  } = usePolling(
    async () => {
      if (!user || !classCode) return [];
      const q = query(
        collection(db, "musicRooms"),
        where("classCode", "==", classCode),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    { interval: 10 * 60 * 1000, enabled: !!user && !!classCode, deps: [user, classCode] },
  );

  // 방이 삭제되었을 경우를 대비하여, 현재 보고 있는 createdRoom이 실제로 존재하는지 확인합니다.
  usePolling(
    async () => {
      if (!createdRoom) return null;
      const docSnap = await getDoc(doc(db, "musicRooms", createdRoom.id));
      if (!docSnap.exists()) {
        setCreatedRoom(null); // 방이 삭제되었다면 상태를 초기화합니다.
      }
      return docSnap.exists();
    },
    { interval: 10 * 60 * 1000, enabled: !!createdRoom, deps: [createdRoom] }, // 🔥 [비용 최적화] 5분 → 10분
  );

  const createRoom = async () => {
    if (!isAdmin) {
      setError("관리자만 방을 만들 수 있습니다.");
      return;
    }
    if (!roomName.trim()) {
      setError("방 이름을 입력해주세요.");
      return;
    }
    if (!classCode) {
      setError("학급 정보가 확인되지 않습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setError("");
    try {
      const q = query(
        collection(db, "musicRooms"),
        where("name", "==", roomName.trim()),
        where("classCode", "==", classCode),
        where("teacherId", "==", user.uid),
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setError("이미 같은 이름의 방이 존재합니다.");
        return;
      }

      const docRef = await addDoc(collection(db, "musicRooms"), {
        name: roomName,
        teacherId: user.uid,
        classCode, // 학급 격리용
        pricePerSong: pricePerSong || 0,
        createdAt: new Date(),
      });
      refetch(); // 방 목록 즉시 갱신
      // 새로 생성된 방의 정보를 상태에 저장합니다.
      setCreatedRoom({ id: docRef.id, name: roomName, pricePerSong });
      setRoomName(""); // 입력 필드 초기화
      setPricePerSong(0);
    } catch (e) {
      logger.error("Error adding document: ", e);
      setError("방을 만드는 중 오류가 발생했습니다.");
    }
  };

  const getRoomUrl = (roomId) => {
    return `${window.location.origin}/student-request/${roomId}`;
  };

  const deleteRoom = async (roomId, roomName) => {
    if (!isAdmin) {
      alert("관리자만 방을 삭제할 수 있습니다.");
      return;
    }

    if (
      !window.confirm(
        `"${roomName}" 방을 정말 삭제하시겠습니까?\n모든 재생목록이 함께 삭제됩니다.`,
      )
    ) {
      return;
    }

    try {
      // 재생목록 서브컬렉션 삭제
      const playlistQuery = query(
        collection(db, "musicRooms", roomId, "playlist"),
      );
      const playlistSnapshot = await getDocs(playlistQuery);
      const deletePromises = playlistSnapshot.docs.map((docSnapshot) =>
        deleteDoc(docSnapshot.ref),
      );
      await Promise.all(deletePromises);

      // 방 삭제
      await deleteDoc(doc(db, "musicRooms", roomId));

      // 방 목록 새로고침
      refetch();

      // 현재 생성된 방이 삭제된 방이면 초기화
      if (createdRoom && createdRoom.id === roomId) {
        setCreatedRoom(null);
      }

      alert("방이 삭제되었습니다.");
    } catch (error) {
      logger.error("Error deleting room: ", error);
      alert("방을 삭제하는 중 오류가 발생했습니다.");
    }
  };

  if (!user) {
    return <div>로그인이 필요합니다.</div>;
  }

  if (adminLoading) {
    return <div>권한 확인 중...</div>;
  }

  return (
    <div className="music-request-container">
      <h2>음악 신청방</h2>

      {/* 관리자만 방 만들기 섹션 표시 */}
      {isAdmin && (
        <>
          <div className="create-room-section">
            <h3>새로운 방 만들기</h3>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="방 이름을 입력하세요"
              className="room-name-input"
            />
            <input
              type="number"
              value={pricePerSong || ""}
              onChange={(e) => setPricePerSong(Number(e.target.value) || 0)}
              placeholder="1곡당 가격 (0=무료)"
              className="room-name-input"
              min="0"
              style={{ maxWidth: "160px" }}
            />
            <button onClick={createRoom} className="create-room-btn">
              방 만들기
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>

          {/* 새로 생성된 방 정보 표시 */}
          {createdRoom && (
            <div className="room-created-section">
              <h3>"{createdRoom.name}" 방이 생성되었습니다!</h3>
              <p>학생들에게 아래 QR코드를 보여주거나 링크를 공유해주세요.</p>
              <div className="qr-code-container">
                <QRCodeSVG value={getRoomUrl(createdRoom.id)} size={256} />
              </div>
              <p className="room-link">{getRoomUrl(createdRoom.id)}</p>
              <Link
                to={`/music-room/${createdRoom.id}`}
                className="enter-room-link"
              >
                음악 재생 목록 보기
              </Link>
            </div>
          )}
        </>
      )}

      {/* 방 목록 */}
      <div className="my-rooms-section">
        <h3>
          {isAdmin ? "모든 음악 신청방 목록" : "음악 신청 가능한 방 목록"}
        </h3>
        {myRooms && myRooms.length > 0 ? (
          <ul className="my-rooms-list">
            {myRooms.map((room) => (
              <li key={room.id} className="my-room-item">
                <Link
                  to={
                    isAdmin
                      ? `/music-room/${room.id}`
                      : `/student-request/${room.id}`
                  }
                >
                  <span>{room.name}</span>
                  {room.pricePerSong > 0 && (
                    <small
                      style={{
                        background: "rgba(99,102,241,0.2)",
                        color: "#a5b4fc",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        marginLeft: "8px",
                      }}
                    >
                      {room.pricePerSong.toLocaleString()}알찬/곡
                    </small>
                  )}
                  <small>
                    ({new Date(room.createdAt.seconds * 1000).toLocaleString()})
                  </small>
                </Link>
                {isAdmin && (
                  <button
                    className="delete-room-btn-small"
                    onClick={(e) => {
                      e.preventDefault();
                      deleteRoom(room.id, room.name);
                    }}
                    title="방 삭제"
                  >
                    🗑️
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {isAdmin
              ? "아직 생성한 방이 없습니다."
              : "현재 이용 가능한 방이 없습니다."}
          </p>
        )}
      </div>
    </div>
  );
};

export default MusicRequest;
