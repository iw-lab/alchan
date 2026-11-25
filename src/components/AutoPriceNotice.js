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
    <div role="status" data-testid="auto-price-notice" className="flex gap-2 items-start rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-950 pl-3 py-2.5 sm:gap-3 sm:pl-3.5">
      <Gauge size={20} className="shrink-0 mt-0.5 text-indigo-600" />
      <div className="flex-1 min-w-0 text-sm leading-relaxed md:flex md:items-center md:gap-4">
        <div className="min-w-0 md:flex-1">
          <b>새 기능 · 자동 물가가 켜졌어요.</b>{" "}
          <span className="hidden sm:inline">매주 금요일 아침, 학생들의 대표 자산(너무 많거나 적은 위·아래 20%는 빼고)이 늘거나 준 만큼 상점 물가를 맞춰요. 한 주에 최대 ±10%만 바뀌고, 첫 금요일에는 기준만 잡아요. </span>
          <span className="sm:hidden">금요일마다 상점 물가를 최대 ±10% 맞춰요. </span>
          학생 돈은 건드리지 않아요.
        </div>
        <div className="mt-2 flex gap-2 md:mt-0 md:shrink-0">
          <button type="button" onClick={() => { close(); navigate("/item-shop"); }} title="아이템 상점 → 관리자 페이지" className="min-h-[40px] px-3.5 rounded-lg bg-indigo-600 text-white font-bold whitespace-nowrap">설정 보기</button>
          <button type="button" onClick={close} className="min-h-[40px] px-3.5 rounded-lg border border-indigo-200 bg-white text-indigo-800 font-bold whitespace-nowrap">알겠어요</button>
        </div>
      </div>
      <button type="button" aria-label="안내 닫기" onClick={close} className="min-w-[40px] min-h-[40px] -mt-1.5 flex items-center justify-center text-indigo-500 shrink-0"><X size={18} /></button>
    </div>
  );
}
