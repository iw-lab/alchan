// 📢 자동 물가 기본 켜짐 안내 — 선생님에게만, 닫을 때까지 한 번(2026-11-08 사용자 «기본으로 켜짐 · 안내는 해드리고»).
//    읽기 0(서버 호출 없음) · 닫으면 이 기기·이 계정에선 다시 안 뜬다.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gauge, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const KEY = (uid) => `alchan_autoprice_notice_v1:${uid}`;
export const isClassTeacher = (d) => !!d && !!d.classCode && (d.isAdmin === true || d.isTeacher === true);

export default function AutoPriceNotice() {
  const { user, userDoc } = useAuth() || {};
  const navigate = useNavigate();
  const uid = user?.uid || userDoc?.id;
  const [closed, setClosed] = useState(() => { try { return !!uid && localStorage.getItem(KEY(uid)) === "1"; } catch { return false; } });
  if (!uid || closed || !isClassTeacher(userDoc)) return null;
  const close = () => { try { localStorage.setItem(KEY(uid), "1"); } catch { /* 저장 못 해도 이번엔 닫는다 */ } setClosed(true); };
  return (
    <div role="status" data-testid="auto-price-notice" style={{ margin: "12px 16px 0", padding: "12px 14px", borderRadius: 12, background: "#eef2ff", border: "1px solid #c7d2fe", color: "#1e1b4b", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Gauge size={20} style={{ flexShrink: 0, marginTop: 2, color: "#4f46e5" }} />
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}>
        <b>새 기능 · 자동 물가가 기본으로 켜졌어요.</b> 매주 금요일 아침, 학생들의 대표 자산(너무 많거나 적은 위·아래 20%는 빼고)이 늘거나 준 만큼 상점 물가를 맞춰요. 한 주에 최대 ±10%만 바뀌고, 첫 금요일에는 기준만 잡아요. 학생 돈은 건드리지 않아요.
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => { close(); navigate("/item-shop"); }} style={{ minHeight: 40, padding: "8px 14px", borderRadius: 10, border: "none", background: "#4f46e5", color: "#fff", fontWeight: 700, cursor: "pointer" }}>설정 보기 (아이템 상점 → 관리자 페이지)</button>
          <button type="button" onClick={close} style={{ minHeight: 40, padding: "8px 14px", borderRadius: 10, border: "1px solid #c7d2fe", background: "#fff", color: "#3730a3", fontWeight: 700, cursor: "pointer" }}>알겠어요</button>
        </div>
      </div>
      <button type="button" aria-label="안내 닫기" onClick={close} style={{ minWidth: 40, minHeight: 40, border: "none", background: "transparent", cursor: "pointer", color: "#6366f1" }}><X size={18} /></button>
    </div>
  );
}
