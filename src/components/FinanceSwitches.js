// ⚙️ 교사용 — 재난 보험·신용등급 연동 켜고 끄기(은행 → 금융 상품 관리). 기본은 둘 다 켜짐.
import React, { useEffect, useState } from "react";
import { fetchFinanceSwitches, saveFinanceSwitch, saveQuizRewardAmount } from "../firebase/db/finance";
import { toast } from "../utils/toast";
import { logger } from "../utils/logger";

const ITEMS = [
  ["insurance", "🛡️ 재난 보험", "학생이 보험료(현금의 1%, 최소 100원)를 내면 7일 동안 «현금 긴급 차감» 이벤트 손실의 절반을 덜 냅니다. 보험료는 국고로 들어옵니다. 끄면 새 가입만 막고, 이미 든 보험은 끝날 때까지 보장합니다."],
  ["creditLink", "💳 신용등급 → 대출 조건", "등급에 따라 대출 금리(1등급 20% 할인 ~ 5등급 30% 할증)와 한도(현금의 10배 ~ 3배)가 달라집니다. 끄면 모두 상품 금리 그대로·현금의 10배입니다."],
];

export default function FinanceSwitches({ classCode }) {
  const [sw, setSw] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    if (!classCode) return undefined;
    fetchFinanceSwitches(classCode).then((v) => { if (alive) setSw(v); }).catch((e) => logger.warn("[금융 설정] 못 읽음", e?.code || e?.message));
    return () => { alive = false; };
  }, [classCode]);

  const toggle = async (key) => {
    if (!sw || busy) return;
    const next = !sw[key];
    setBusy(key);
    try {
      await saveFinanceSwitch(classCode, key, next);
      setSw({ ...sw, [key]: next });
      toast.success(next ? "켰어요." : "껐어요.");
    } catch (e) {
      logger.error("[금융 설정] 저장 실패", e);
      toast.error("저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy("");
    }
  };

  const setPrize = async (amount) => {
    if (!sw || busy) return;
    setBusy("quiz");
    try {
      await saveQuizRewardAmount(classCode, amount);
      setSw({ ...sw, quizReward: amount });
      toast.success(amount > 0 ? `퀴즈 상금을 ${amount.toLocaleString()}원으로 정했어요.` : "퀴즈 상금을 껐어요.");
    } catch (e) {
      logger.error("[금융 설정] 퀴즈 상금 저장 실패", e);
      toast.error("저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy("");
    }
  };

  if (!classCode) return null;
  return (
    <div className="admin-section" data-testid="finance-switches">
      <h3>보험 · 신용등급 · 퀴즈 상금</h3>
      {!sw ? <p className="text-sm text-slate-600">불러오는 중…</p> : ITEMS.map(([key, title, desc]) => (
        <div key={key} className="flex items-start gap-3 py-2.5 border-t border-slate-200 first:border-t-0">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-800">{title}</div>
            <p className="text-xs text-slate-700 mt-0.5">{desc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sw[key]}
            aria-label={`${title} ${sw[key] ? "켜짐" : "꺼짐"}`}
            disabled={busy === key}
            onClick={() => toggle(key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border ${sw[key] ? "bg-emerald-600 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-300"}`}
          >
            {sw[key] ? "켜짐" : "꺼짐"}
          </button>
        </div>
      ))}
      {sw && (
        <div className="py-2.5 border-t border-slate-200">
          <div className="text-sm font-bold text-slate-800">🧠 경제 퀴즈 정답 상금</div>
          <p className="text-xs text-slate-700 mt-0.5">하루 한 문제, 첫 답이 맞으면 국고에서 줍니다(틀리면 그날 끝). 정답은 화면에 실려 있어 마음먹으면 늘 맞힐 수 있으니 소소하게 두세요.</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="퀴즈 정답 상금">
            {[0, 5000, 10000, 30000].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={sw.quizReward === v}
                disabled={busy === "quiz"}
                onClick={() => setPrize(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sw.quizReward === v ? "bg-emerald-600 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-300"}`}
              >
                {v === 0 ? "없음" : `${v.toLocaleString()}원`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
