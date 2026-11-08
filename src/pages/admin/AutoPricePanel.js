// 🏷️ 자동 물가 — 교사 화면(2026-11-08). 매주 금요일 아침 학생 대표 자산(위·아래 20% 빼고 평균)이
//    늘거나 준 만큼 상점 물가를 따라 움직인다(한 주 최대 ±10%). 서버 = scheduler-http.js autoPrice*.
//    화면을 열 때는 설정·기록만 읽는다(읽기 1). 학생 자산 계산은 «지금 계산해 보기»를 눌렀을 때만.
import React, { useCallback, useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { functions, httpsCallable } from "../../firebase";
import { getCurrencyUnit } from "../../utils/numberFormatter";
import { confirmDialog } from "../../utils/confirmDialog";
import { toast } from "../../utils/toast";

const preview = httpsCallable(functions, "autoPricePreview");
const control = httpsCallable(functions, "autoPriceControl");

const won = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString()}${getCurrencyUnit()}` : "—");
const pct = (m) => (m && m !== 1 ? `${m > 1 ? "+" : ""}${(Math.round((m - 1) * 1000) / 10).toFixed(1)}%` : "그대로");

export default function AutoPricePanel({ styles }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (measure = false) => {
    setBusy(measure ? "measure" : "load");
    try {
      const r = await preview({ measure });
      setInfo(r.data);
      if (measure && r.data?.error) toast.error(r.data.error);
    } catch (e) {
      toast.error(e?.message || "자동 물가 정보를 불러오지 못했어요.");
    } finally {
      setBusy(null);
    }
  }, []);
  useEffect(() => { load(false); }, [load]);

  const act = async (action, ask) => {
    if (busy) return; // 연타 잠금
    if (ask && !(await confirmDialog(ask.text, { confirmText: ask.ok }))) return;
    setBusy(action);
    try {
      const r = await control({ action });
      if (r.data?.success) {
        toast.success({ enable: "자동 물가를 켰어요", disable: "자동 물가를 껐어요", skipNext: "이번 금요일은 건너뛰어요", unskip: "이번 금요일도 조정해요", rebase: "지금 자산으로 기준을 다시 잡았어요" }[action]);
        await load(action === "enable" || action === "rebase");
      }
    } catch (e) {
      toast.error(e?.message || "처리하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const on = info?.enabled === true;
  const btn = (primary) => ({
    padding: "10px 16px", minHeight: 44, borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer",
    border: primary ? "none" : "1px solid #d1d5db", background: primary ? "#4f46e5" : "#fff", color: primary ? "#fff" : "#374151", opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ ...styles.card, marginBottom: "20px" }} data-testid="auto-price">
      <div style={styles.header}>
        <div style={{ ...styles.headerIcon, background: "linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%)" }}>
          <Gauge size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h2 style={styles.title}>자동 물가 {info && <span style={{ fontSize: 13, fontWeight: 700, color: on ? "#059669" : "#6b7280" }}>· {on ? "켜짐" : "꺼짐"}</span>}</h2>
          <p style={styles.subtitle}>
            매주 금요일 아침, 학생들의 대표 자산이 늘거나 준 만큼 물가를 따라 움직여요. 너무 많거나 적은 위·아래 20%는 계산에서 빼고, 한 주에 최대 ±10%까지만 바뀌어요. 학생 돈은 건드리지 않아요.
          </p>
        </div>
      </div>
      <div style={{ padding: "16px 24px", backgroundColor: "#fafbfc", display: "grid", gap: 12 }}>
        {info && on && (
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
            기준 자산 <b>{info.anchor > 0 ? won(info.anchor) : "기다리는 중(학생 자산이 생기면 잡아요)"}</b>
            {info.center != null && <> · 지금 대표 자산 <b>{won(info.center)}</b> ({info.counted}명)</>}
            {info.center != null && <> · 이번 금요일 예정 <b>{info.skipNext ? "건너뜀" : info.plannedPercent ? `${info.plannedPercent > 0 ? "+" : ""}${info.plannedPercent}%` : "그대로"}</b></>}
            {info.center == null && info.skipNext && <> · 이번 금요일 <b>건너뜀</b></>}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!on && (
            <button type="button" style={btn(true)} disabled={!!busy || !info} onClick={() => act("enable", { text: "지금 학생들의 대표 자산을 기준으로 잡고, 매주 금요일 아침 물가를 자동으로 맞춰요.\n지금 물가가 적당할 때 켜 주세요.", ok: "켜기" })}>
              {busy === "enable" ? "켜는 중…" : "자동 물가 켜기"}
            </button>
          )}
          {on && (
            <>
              <button type="button" style={btn(true)} disabled={!!busy} onClick={() => load(true)}>{busy === "measure" ? "계산 중…" : "지금 계산해 보기"}</button>
              <button type="button" style={btn(false)} disabled={!!busy} onClick={() => act(info.skipNext ? "unskip" : "skipNext")}>{info.skipNext ? "건너뛰기 취소" : "이번 금요일 건너뛰기"}</button>
              <button type="button" style={btn(false)} disabled={!!busy} onClick={() => act("rebase", { text: "지금 물가가 적당하다고 보고, 지금 대표 자산을 새 기준으로 잡아요.\n가격은 지금 바뀌지 않아요.", ok: "기준 다시 잡기" })}>기준 다시 잡기</button>
              <button type="button" style={btn(false)} disabled={!!busy} onClick={() => act("disable", { text: "자동 물가를 꺼요. 지금 가격은 그대로 남아요.", ok: "끄기" })}>끄기</button>
            </>
          )}
        </div>
        {info?.history?.length > 0 && (
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>최근 기록</div>
            {info.history.slice(0, 6).map((h) => (
              <div key={`${h.weekKey}-${h.at}`} style={{ display: "flex", gap: 10, padding: "4px 0", borderTop: "1px solid #eef0f3" }}>
                <span style={{ minWidth: 92 }}>{h.at ? new Date(h.at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }) : h.weekKey}</span>
                <b style={{ minWidth: 56, color: h.multiplier > 1 ? "#dc2626" : h.multiplier < 1 ? "#2563eb" : "#6b7280" }}>{pct(h.multiplier)}</b>
                <span>{h.reason}{h.changed ? ` · ${h.changed}개 변경` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
