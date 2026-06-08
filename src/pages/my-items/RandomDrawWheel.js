// 🎰 랜덤뽑기 돌림판 — 순수 CSS 회전. 서버가 정한 winningIndex 칸이 포인터(12시)에 멈춘다.
import React, { useEffect, useRef, useState } from "react";
import "./RandomDrawWheel.css";

const COLORS = [
  "#fca5a5", "#fdba74", "#fde047", "#86efac",
  "#67e8f9", "#a5b4fc", "#f0abfc", "#f9a8d4",
];

export default function RandomDrawWheel({ segments = [], winningIndex = 0, onDone }) {
  const n = segments.length;
  const seg = n > 0 ? 360 / n : 360;
  const [rotation, setRotation] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!n) return;
    doneRef.current = false;
    const spins = 6; // 여러 바퀴 돌고
    const center = winningIndex * seg + seg / 2; // 당첨 칸 중심(12시 기준 시계방향)
    const target = spins * 360 - center; // 그 칸이 12시 포인터에 오도록
    const t = setTimeout(() => setRotation(target), 60);
    // 안전망: transitionend 누락 대비 (transition 4s)
    const fb = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
    }, 4600);
    return () => {
      clearTimeout(t);
      clearTimeout(fb);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, winningIndex, seg]);

  const handleTransitionEnd = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  };

  if (!n) return null;

  const bg = segments
    .map((s, i) => `${COLORS[i % COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`)
    .join(", ");

  return (
    <div className="rdw-wrap">
      <div className="rdw-pointer">▼</div>
      <div
        className="rdw-wheel"
        style={{
          background: `conic-gradient(${bg})`,
          transform: `rotate(${rotation}deg)`,
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {segments.map((s, i) => {
          const angle = i * seg + seg / 2;
          return (
            <div
              key={i}
              className="rdw-label"
              style={{ transform: `rotate(${angle}deg)` }}
            >
              <span
                className="rdw-label-inner"
                style={{ transform: `translateX(-50%) rotate(${-angle}deg)` }}
              >
                <span className="rdw-icon">{s.icon}</span>
                <span className="rdw-name">{s.name}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="rdw-hub" />
    </div>
  );
}
