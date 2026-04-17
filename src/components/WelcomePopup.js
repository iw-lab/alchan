// src/components/WelcomePopup.js
// 첫 접속 시 사용법 안내 팝업

import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { WELCOME_GUIDE } from "../utils/helpContent";

const STORAGE_KEY_NEVER = "alchan_welcome_never_show";
const STORAGE_KEY_TODAY = "alchan_welcome_closed_date";

function shouldShowPopup() {
  try {
    // "다시 열지 않기" 체크
    if (localStorage.getItem(STORAGE_KEY_NEVER) === "true") return false;

    // "오늘은 닫기" 체크
    const closedDate = localStorage.getItem(STORAGE_KEY_TODAY);
    if (closedDate) {
      const today = new Date().toISOString().split("T")[0];
      if (closedDate === today) return false;
    }

    return true;
  } catch {
    return true;
  }
}

// 다른 고z-index 모달(출석보상·경제이벤트·법안·닉네임 설정 등) 여부 감지
function hasOtherFullscreenModal() {
  try {
    const all = document.querySelectorAll('[style*="position: fixed"], .fixed');
    for (const el of all) {
      if (el.dataset?.welcomePopup === "true") continue;
      const cs = window.getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const bg = cs.backgroundColor || "";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) continue;
      const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (alpha < 0.3) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9) {
        return true;
      }
    }
  } catch {}
  return false;
}

export default function WelcomePopup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!shouldShowPopup()) return;
    let cancelled = false;
    let intervalId = null;
    const initialTimer = setTimeout(() => {
      if (cancelled) return;
      if (!hasOtherFullscreenModal()) {
        setIsVisible(true);
        return;
      }
      // 다른 모달이 열려 있으면 닫힐 때까지 대기
      intervalId = setInterval(() => {
        if (cancelled) return;
        if (!hasOtherFullscreenModal()) {
          clearInterval(intervalId);
          setIsVisible(true);
        }
      }, 500);
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  if (!isVisible) return null;

  const handleNeverShow = () => {
    try {
      localStorage.setItem(STORAGE_KEY_NEVER, "true");
    } catch {}
    setIsVisible(false);
  };

  const handleCloseToday = () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      localStorage.setItem(STORAGE_KEY_TODAY, today);
    } catch {}
    setIsVisible(false);
  };

  return (
    <div
      data-welcome-popup="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99998,
        padding: 16,
      }}
      onClick={handleCloseToday}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 16,
          width: "100%",
          maxWidth: 480,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          style={{
            position: "relative",
            padding: "24px 24px 16px",
            borderBottom: "1px solid #e2e8f0",
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleCloseToday}
            style={{
              position: "absolute",
              right: 16,
              top: 16,
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#f1f5f9",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              cursor: "pointer",
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#0f172a",
              margin: 0,
              paddingRight: 32,
            }}
          >
            {WELCOME_GUIDE.title}
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>
            {WELCOME_GUIDE.subtitle}
          </p>
        </div>

        {/* 가이드 섹션 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {WELCOME_GUIDE.sections.map((section, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                background: "#f8fafc",
                borderRadius: 12,
                padding: "14px 16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0, marginTop: 2 }}>
                {section.icon}
              </span>
              <div>
                <h4
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: "0 0 4px",
                  }}
                >
                  {section.title}
                </h4>
                <p
                  style={{
                    fontSize: 13,
                    color: "#475569",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {section.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 하단 버튼 영역 */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleCloseToday}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 12,
              background: "#6366f1",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            오늘은 닫기
          </button>
          <button
            onClick={handleNeverShow}
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 12,
              background: "#f1f5f9",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid #e2e8f0",
              cursor: "pointer",
            }}
          >
            다시 열지 않기
          </button>
        </div>
      </div>
    </div>
  );
}
