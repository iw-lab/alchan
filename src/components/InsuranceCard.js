// 🛡️ 재난 보험 — 「나의 자산」 카드(2026-11-11). 가입은 서버(buyInsurance CF)가 하고 여기는 보여 주고 부르기만 한다.
//    규칙: 보험료 = 현금의 1%(최소 100원) · 7일 · 경제이벤트 «현금 긴급 차감» 손실의 절반을 보험이 대신 낸다(한도 = 보험료 20배).
import React, { useCallback, useEffect, useState } from "react";
import { fetchInsurancePolicy, fetchFinanceSwitches, buyInsurance } from "../firebase/db/finance";
import { quotePremium, policyView, TERM_DAYS } from "../utils/insurance";
import { formatKoreanCurrency } from "../utils/numberFormatter";
import { toast } from "../utils/toast";
import { logger } from "../utils/logger";

export default function InsuranceCard({ userId, classCode, cash, onBought }) {
  const [policy, setPolicy] = useState(undefined); // undefined = 아직 모름, null = 없음
  const [enabled, setEnabled] = useState(true);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !classCode) return;
    try {
      const [p, sw] = await Promise.all([fetchInsurancePolicy(classCode, userId), fetchFinanceSwitches(classCode)]);
      setPolicy(p);
      setEnabled(sw.insurance);
      setFailed(false);
    } catch (e) {
      logger.warn("[보험] 정보를 못 읽음", e?.code || e?.message);
      setFailed(true);
    }
  }, [userId, classCode]);
  useEffect(() => { load(); }, [load]);

  if (!userId || !classCode) return null;
  const view = policyView(policy, Date.now(), classCode, userId);
  // 반에서 보험을 껐어도 이미 든 보험은 끝날 때까지 보여 준다(약속은 지킨다).
  if (!enabled && view.state !== "active") return null;
  const quote = quotePremium(Number(cash));

  const buy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await buyInsurance();
      toast.success(`보험에 가입했어요. ${TERM_DAYS}일 동안 든든해요! (보험료 ${formatKoreanCurrency(r?.premium || 0)})`);
      setAsking(false);
      await load();
      if (onBought) onBought();
    } catch (e) {
      logger.error("[보험] 가입 실패", e);
      toast.error(e?.message || "보험에 가입하지 못했어요. 잠시 뒤 다시 해 주세요.");
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4" data-testid="insurance-card">
      <h4 className="text-[15px] font-bold text-slate-800">🛡️ 재난 보험</h4>
      {failed || policy === undefined ? (
        <p className="text-xs text-slate-700 mt-1">{failed ? "보험 정보를 불러오지 못했어요." : "불러오는 중…"}</p>
      ) : view.state === "active" ? (
        <>
          <p className="text-sm text-emerald-800 font-semibold mt-1">가입 중 · {view.daysLeft}일 남았어요</p>
          <ul className="mt-1.5 text-xs text-slate-700 space-y-0.5">
            <li>남은 보장 한도 <strong>{formatKoreanCurrency(view.capRemaining)}</strong></li>
            {view.payoutThisTerm > 0 && <li>이번 보험으로 받은 보험금 <strong>{formatKoreanCurrency(view.payoutThisTerm)}</strong></li>}
          </ul>
          <p className="mt-2 text-[11px] text-slate-600">경제 이벤트로 현금이 깎이면 그 절반을 보험이 대신 내 줘요. 세금은 보험이 안 돼요.</p>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-700 mt-1">
            경제 이벤트 «현금 긴급 차감»이 오면 잃는 돈의 <strong>절반</strong>을 보험이 대신 내 줘요. {TERM_DAYS}일 동안만 지켜 주고, 아무 일도 없으면 보험료는 돌아오지 않아요.
          </p>
          {quote.ok ? (
            asking ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-800">보험료 <strong>{formatKoreanCurrency(quote.premium)}</strong>을 낼까요?</span>
                <button type="button" onClick={buy} disabled={busy} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-60">{busy ? "가입 중…" : "네, 가입해요"}</button>
                <button type="button" onClick={() => setAsking(false)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold">아니요</button>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setAsking(true)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold">보험 들기</button>
                <span className="text-xs text-slate-700">보험료 {formatKoreanCurrency(quote.premium)} · 최대 {formatKoreanCurrency(quote.cap)}까지 보장</span>
              </div>
            )
          ) : (
            <p className="mt-2 text-xs text-slate-700">보험료(최소 100원)를 낼 현금이 있어야 가입할 수 있어요.</p>
          )}
        </>
      )}
    </div>
  );
}
