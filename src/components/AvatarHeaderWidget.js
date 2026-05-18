// src/components/AvatarHeaderWidget.js
// 헤더 우측 floating 아바타 위젯 (전신 표시 + 토글)
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Avatar from "./Avatar";
import { buildAvatarOverlays } from "../utils/avatarShop";
import { X, Eye } from "lucide-react";

const STORAGE_KEY = "avatarWidgetHidden";

export default function AvatarHeaderWidget() {
  const { userDoc } = useAuth() || {};
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
    } catch {}
  }, [hidden]);

  const overlays = useMemo(() => buildAvatarOverlays(userDoc), [userDoc]);

  // 학생/관리자만 표시 (슈퍼관리자 X), 토글로 숨김
  if (!userDoc) return null;

  // 숨김 상태 → 작은 "표시" 아이콘만
  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        title="아바타 표시"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-600"
      >
        <Eye className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="relative group flex-shrink-0" style={{ zIndex: 50 }}>
      {/* 아바타 본체 - 클릭 시 아바타 상점 */}
      <div
        onClick={() => navigate("/avatar-shop")}
        className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-105 shadow-md border-2 border-purple-300"
        style={{
          background: "linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)",
          width: 120,
          height: 120,
        }}
        title="내 아바타 - 클릭하여 꾸미기"
      >
        <Avatar shopOverlays={overlays} size={120} showBorder={false} />
      </div>
      {/* X 토글 버튼 (hover 시) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setHidden(true);
        }}
        title="위젯 숨기기"
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs shadow-sm"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
