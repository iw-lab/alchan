// src/components/AvatarHeaderWidget.js
// 페이지 우상단 fixed 아바타 위젯 (전신, 항상 떠 있음)
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Avatar from "./Avatar";
import { buildAvatarOverlays } from "../utils/avatarShop";
import { X, Eye } from "lucide-react";

const STORAGE_KEY = "avatarWidgetHidden";
const SIZE = 120;

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

  if (!userDoc) return null;

  // 숨김 상태 → 작은 "표시" 아이콘
  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        title="아바타 표시"
        className="fixed flex items-center justify-center w-9 h-9 rounded-full bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-600 shadow"
        style={{ top: 76, right: 16, zIndex: 60 }}
      >
        <Eye className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div
      className="fixed group hidden md:block"
      style={{ top: 76, right: 16, zIndex: 60 }}
    >
      <div
        onClick={() => navigate("/avatar-shop")}
        className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-105 shadow-lg border-2 border-purple-300"
        style={{
          background: "linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)",
          width: SIZE,
          height: SIZE,
        }}
        title="내 아바타 - 클릭하여 꾸미기"
      >
        <Avatar shopOverlays={overlays} size={SIZE} showBorder={false} />
      </div>
      <button
        onClick={() => setHidden(true)}
        title="위젯 숨기기"
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
