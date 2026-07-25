// src/pages/government/CourtroomScene.js
// 데이터 기반 법정 무대 렌더러.
//  - public/courtroom/*.png 가구/소품을 좌표대로 배치
//  - 학생 본인 아바타를 작게 렌더 + 머리 위 역할 뱃지 + 입장 워크인/idle 움직임
import React, { useMemo, useState, useEffect, useRef } from "react";
import Avatar from "../../components/Avatar";
import { buildAvatarOverlays } from "../../utils/avatarShop";
import {
  COURTROOM_PROPS,
  COURTROOM_SEATS,
  COURTROOM_GALLERY,
  COURTROOM_FRONT_IDS,
  ROLE_BADGES,
  COURTROOM_ASSET_VERSION,
} from "../../data/courtroomLayout";
import "./CourtroomScene.css";

const propUrl = (id) => `/courtroom/${id}.png?v=${COURTROOM_ASSET_VERSION}`;

const BUBBLE_MS = 6000; // 말풍선 표시 시간

// 채팅 메시지 → 화자 캐릭터 위 말풍선 (userId -> text)
function useSpeechBubbles(messages) {
  const [bubbles, setBubbles] = useState({});
  const seen = useRef(null);
  const timers = useRef({});

  useEffect(() => {
    if (!messages) return;
    const chats = messages.filter((m) => m.type === "chat" && m.userId);
    if (seen.current === null) {
      // 첫 로드: 기존 메시지는 말풍선 띄우지 않음
      seen.current = new Set(chats.map((m) => m.id));
      return;
    }
    chats.forEach((m) => {
      if (seen.current.has(m.id)) return;
      seen.current.add(m.id);
      setBubbles((b) => ({ ...b, [m.userId]: m.text }));
      clearTimeout(timers.current[m.userId]);
      timers.current[m.userId] = setTimeout(() => {
        setBubbles((b) => {
          const n = { ...b };
          delete n[m.userId];
          return n;
        });
      }, BUBBLE_MS);
    });
  }, [messages]);

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  return bubbles;
}

// 작은 아바타 1명 (역할 뱃지 + 이름표 + 말풍선)
function SeatAvatar({
  seat,
  user,
  role,
  isActive,
  isSilenced,
  isMe,
  clickable,
  onClick,
  bubble,
  index = 0,
}) {
  const badge = ROLE_BADGES[role] || ROLE_BADGES.spectator;
  const overlays = useMemo(() => (user ? buildAvatarOverlays(user) : null), [user]);
  const name = user?.name || user?.displayName || "빈 자리";

  // stage 폭 대비 아바타 폭 → 픽셀은 CSS aspect로, 여기선 % 기반
  const widthPct = seat.w || 9;

  return (
    <div
      className={`court-seat ${isActive ? "is-active" : "is-empty"} ${isMe ? "is-me" : ""} ${
        isSilenced ? "is-silenced" : ""
      } ${clickable ? "is-clickable" : ""} ${bubble ? "is-speaking" : ""}`}
      style={{
        left: `${seat.x}%`,
        top: `${seat.y}%`,
        width: `${widthPct}%`,
        // 입장 워크인 stagger
        animationDelay: `${(index % 12) * 0.08}s`,
      }}
      onClick={clickable ? onClick : undefined}
      title={clickable ? `${name} — 클릭하여 침묵 패널티` : name}
    >
      {bubble && (
        <div className="court-bubble">
          {bubble}
          <span className="court-bubble-tail" />
        </div>
      )}

      <div
        className="court-seat-badge"
        style={{ background: badge.color }}
      >
        <span className="court-seat-badge-icon">{badge.icon}</span>
        <span className="court-seat-badge-label">{badge.label}</span>
      </div>

      <div
        className="court-seat-avatar"
        style={seat.face === "right" ? { transform: "scaleX(-1)" } : undefined}
      >
        {overlays ? (
          <Avatar shopOverlays={overlays} size={120} showBorder={false} />
        ) : (
          <div className="court-seat-placeholder">{badge.icon}</div>
        )}
        {isSilenced && <div className="court-seat-mute">🤫</div>}
      </div>

      <div className="court-seat-name">{name}</div>
    </div>
  );
}

export default function CourtroomScene({
  roomData,
  users,
  currentUser,
  userRole,
  messages, // 채팅 메시지 (말풍선 연동)
  onSeatClick, // (userId) => void  — 판사의 침묵 패널티
}) {
  const userById = useMemo(() => {
    const m = {};
    (users || []).forEach((u) => {
      m[u.id] = u;
    });
    return m;
  }, [users]);

  const bubbles = useSpeechBubbles(messages);

  if (!roomData) return null;

  const participants = roomData.participants || [];
  const silenced = roomData.silencedUsers || [];
  const isActive = (id) => participants.includes(id);
  const judgeCanClick = userRole === "judge";

  // 판사 3석(합의부): [0] 재판장(judgeId), [1][2] 배석(associateJudgeIds)
  const judgeSeats = Array.isArray(COURTROOM_SEATS.judge)
    ? COURTROOM_SEATS.judge
    : [COURTROOM_SEATS.judge];
  const associateJudgeIds = roomData.associateJudgeIds || [];
  const judgeOccupants = [roomData.judgeId, ...associateJudgeIds];
  const judgeRoleSeats = judgeSeats
    .map((seat, i) => ({ role: "judge", id: judgeOccupants[i], seat }))
    .filter((r) => r.seat);

  // 역할 → userId 매핑
  const roleSeats = [
    ...judgeRoleSeats,
    { role: "prosecutor", id: roomData.prosecutorId, seat: COURTROOM_SEATS.prosecutor },
    { role: "complainant", id: roomData.complainantId, seat: COURTROOM_SEATS.complainant },
    { role: "lawyer", id: roomData.lawyerId, seat: COURTROOM_SEATS.lawyer },
    { role: "defendant", id: roomData.defendantId, seat: COURTROOM_SEATS.defendant },
    { role: "witness", id: roomData.witnessId, seat: COURTROOM_SEATS.witness },
  ].filter((r) => r.seat);

  const juryIds = roomData.juryIds || [];

  // 방청객: 참가자 중 어떤 역할도 아닌 사람
  const assignedIds = new Set(
    [
      roomData.judgeId,
      ...associateJudgeIds,
      roomData.prosecutorId,
      roomData.complainantId,
      roomData.lawyerId,
      roomData.defendantId,
      roomData.witnessId,
      ...juryIds,
    ].filter(Boolean),
  );
  const spectatorIds = participants.filter((id) => id && !assignedIds.has(id));

  const gallerySeat = (i) => {
    const { startX, gapX, y, perRow, rowGapY, w } = COURTROOM_GALLERY;
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    return { x: startX + col * gapX, y: y + row * rowGapY, w };
  };

  // props 정렬 + 앞/뒤 분리 (가구는 캐릭터 앞에 = 책상 뒤에 앉은 효과)
  const sortedProps = [...COURTROOM_PROPS].sort((a, b) => (a.z || 0) - (b.z || 0));
  const backProps = sortedProps.filter((p) => !COURTROOM_FRONT_IDS.includes(p.id));
  const frontProps = sortedProps.filter((p) => COURTROOM_FRONT_IDS.includes(p.id));

  const renderProp = (p, baseZ) => (
    <img
      key={p.id}
      src={propUrl(p.id)}
      alt=""
      className={`court-prop court-prop-${p.id}`}
      style={{
        left: `${p.x}%`,
        top: `${p.y}%`,
        width: `${p.w}%`,
        height: p.h ? `${p.h}%` : "auto",
        zIndex: baseZ + (p.z || 0),
      }}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );

  return (
    <div className="courtroom-stage">
      {/* 배경/장식 가구 (캐릭터 뒤) */}
      {backProps.map((p) => renderProp(p, 10))}

      {/* 역할 아바타 */}
      <div className="court-actors">
        {roleSeats.map(({ role, id, seat }, idx) =>
          id ? (
            <SeatAvatar
              key={`${role}-${idx}`}
              role={role}
              seat={seat}
              user={userById[id]}
              isActive={isActive(id)}
              isSilenced={silenced.includes(id)}
              isMe={id === currentUser?.id}
              clickable={judgeCanClick && id !== currentUser?.id}
              onClick={() => onSeatClick && onSeatClick(id)}
              bubble={bubbles[id]}
              index={idx}
            />
          ) : null,
        )}

        {/* 배심원 */}
        {juryIds.map((id, i) => {
          const seat = COURTROOM_SEATS.jury[i] || COURTROOM_SEATS.jury[COURTROOM_SEATS.jury.length - 1];
          return (
            <SeatAvatar
              key={`jury-${id}`}
              role="jury"
              seat={seat}
              user={userById[id]}
              isActive={isActive(id)}
              isSilenced={silenced.includes(id)}
              isMe={id === currentUser?.id}
              clickable={judgeCanClick && id !== currentUser?.id}
              onClick={() => onSeatClick && onSeatClick(id)}
              bubble={bubbles[id]}
              index={6 + i}
            />
          );
        })}

        {/* 방청객 */}
        {spectatorIds.map((id, i) => (
          <SeatAvatar
            key={`spec-${id}`}
            role="spectator"
            seat={gallerySeat(i)}
            user={userById[id]}
            isActive
            isSilenced={silenced.includes(id)}
            isMe={id === currentUser?.id}
            clickable={judgeCanClick && id !== currentUser?.id}
            onClick={() => onSeatClick && onSeatClick(id)}
            bubble={bubbles[id]}
            index={12 + i}
          />
        ))}
      </div>

      {/* 가구 (캐릭터 앞 — 책상/난간이 하반신을 가려 앉은 느낌) */}
      {frontProps.map((p) => renderProp(p, 60))}
    </div>
  );
}
