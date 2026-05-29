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

  if (hidden) {
    return (
      <div className="px-4 py-2">
        <button
          onClick={() => setHidden(false)}
          title="아바타 표시"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-[11px]"
        >
          <Eye className="w-3 h-3" />
          내 아바타
        </button>
      </div>
    );
  }

  // 사이드바와 자연스럽게 어울리는 디자인 (둥근 박스 X, 사이드바 흐름의 일부)
  return (
    <div className="px-4 pt-2 pb-1 relative group">
      <div
        onClick={() => navigate("/avatar-shop")}
        className="flex items-center justify-center cursor-pointer transition-transform hover:scale-[1.02]"
        title="내 아바타 - 클릭하여 꾸미기"
        style={{ minHeight: size }}
      >
        <Avatar shopOverlays={overlays} size={size} showBorder={false} defaultBackground />
      </div>
      <button
        onClick={() => setHidden(true)}
        title="위젯 숨기기"
        className="absolute top-2 right-4 w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
