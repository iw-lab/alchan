// src/components/AvatarHeaderWidget.js
// 사이드바 안에 표시되는 인라인 아바타 위젯 (전신)
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Avatar from "./Avatar";
import { buildAvatarOverlays } from "../utils/avatarShop";
import { X, Eye } from "lucide-react";

const STORAGE_KEY = "avatarWidgetHidden";

export default function AvatarHeaderWidget({ size = 140 }) {
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

  // 숨김 상태 → 작은 토글 버튼만
  if (hidden) {
    return (
      <div className="px-3 pt-3 pb-1 flex justify-center">
        <button
          onClick={() => setHidden(false)}
          title="아바타 표시"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-600 text-xs font-bold"
        >
          <Eye className="w-3.5 h-3.5" />
          내 아바타 표시
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-1 flex justify-center relative group">
      <div
        onClick={() => navigate("/avatar-shop")}
        className="rounded-2xl overflow-hidden cursor-pointer transition-transform hover:scale-105 shadow-md border-2 border-purple-300"
        style={{
          background: "linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)",
          width: size,
          height: size,
        }}
        title="내 아바타 - 클릭하여 꾸미기"
      >
        <Avatar shopOverlays={overlays} size={size} showBorder={false} />
      </div>
      <button
        onClick={() => setHidden(true)}
        title="위젯 숨기기"
        className="absolute top-2 right-3 w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-red-500 hover:border-red-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
