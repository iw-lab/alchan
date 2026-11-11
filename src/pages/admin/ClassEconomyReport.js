// 📊 학급 경제 리포트 — 교사 화면(2026-11-11). 우리 반 돈이 어디에, 누구에게 있는지 한눈에.
//    서버 = scheduler-http.js classEconomyReport(읽기 전용). 화면을 열 때는 아무것도 읽지 않고,
//    «지금 계산하기»를 눌렀을 때만 학생 자산을 센다(학생당 읽기 5).
import React, { useCallback, useMemo, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { functions, httpsCallable } from "../../firebase";
import { formatKoreanCurrency } from "../../utils/numberFormatter";
import { toast } from "../../utils/toast";
import { PageHeader, Card, Button } from "../../components/ui/index";
import { giniReading, teachingPrompts, COMPOSITION_LABELS } from "../../utils/classReportText";
import { sortByStudentNumber, plainStudentName } from "../../utils/studentOrder";
import { markGuideFlag } from "../../utils/todayTip";

const fetchReport = httpsCallable(functions, "classEconomyReport");
const TONE = { good: "#059669", ok: "#0284c7", warn: "#d97706", bad: "#dc2626", none: "#475569" };

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-semibold text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-600">{hint}</div>}
    </div>
  );
}

function ShareBar({ label, share, color }) {
  const pct = Math.round((share || 0) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold text-slate-700">
        <span>{label}</span><span>{pct}%</span>
      </div>
      <div className="mt-1 h-3 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${label} ${pct}%`}>
        <div style={{ width: `${pct}%`, background: color, height: "100%" }} />
      </div>
    </div>
  );
}

export default function ClassEconomyReport() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState("assets"); // assets | number

  const load = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetchReport({});
      setData(r.data);
      markGuideFlag(r.data?.classCode, "report");
    } catch (e) {
      toast.error(e?.message || "리포트를 계산하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const r = data?.report;
  const reading = giniReading(r?.gini);
  const prompts = useMemo(() => teachingPrompts(r), [r]);
  const students = useMemo(() => {
    const list = data?.students || [];
    return order === "number" ? sortByStudentNumber(list) : [...list].sort((a, b) => b.netAssets - a.netAssets);
  }, [data, order]);
  const maxAbs = useMemo(() => Math.max(1, ...students.map((s) => Math.abs(s.netAssets || 0))), [students]);
  const compTotal = r ? COMPOSITION_LABELS.reduce((s, [k]) => s + Math.max(0, r.composition?.[k] || 0), 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="학급 경제 리포트"
        subtitle="우리 반 돈이 어디에, 누구에게 있는지 — 누를 때만 계산해요"
        icon={BarChart3}
        action={
          <Button size="sm" icon={RefreshCw} onClick={load} loading={busy}>
            {data ? "다시 계산하기" : "지금 계산하기"}
          </Button>
        }
      />

      {!r && (
        <Card>
          <p className="text-sm text-slate-700 leading-relaxed">
            «지금 계산하기»를 누르면 학생 모두의 현금·통장·주식·부동산·쿠폰·빚을 더해 우리 반 경제를 보여 줘요.
            자동 물가가 금요일마다 쓰는 계산과 같은 방식이에요. 학생 돈은 바뀌지 않아요.
          </p>
        </Card>
      )}

      {r && r.count === 0 && (
        <Card><p className="text-sm text-slate-700">아직 학생이 없어요. 학생 목록에서 학생을 먼저 만들어 주세요.</p></Card>
      )}

      {r && r.count > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="학생 수" value={`${r.count}명`} />
            <Stat label="학급 총자산" value={formatKoreanCurrency(r.totalAssets)} hint={r.loanTotal > 0 ? `빚 ${formatKoreanCurrency(r.loanTotal)} 포함 전` : "빚 없음"} />
            <Stat label="가운데 학생의 순자산" value={formatKoreanCurrency(r.median)} hint={`평균 ${formatKoreanCurrency(r.mean)}`} />
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-600">고르게 퍼진 정도(지니계수)</div>
              <div className="mt-1 text-xl font-extrabold" style={{ color: TONE[reading.tone] }}>{r.gini.toFixed(2)}</div>
              <div className="mt-1 text-xs text-slate-600">{reading.text} · 0에 가까울수록 고르다</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-3">누가 얼마나 갖고 있나</h3>
              <div className="space-y-3">
                <ShareBar label="상위 20% 학생이 가진 몫" share={r.top20Share} color="#6366f1" />
                <ShareBar label="하위 50% 학생이 가진 몫" share={r.bottom50Share} color="#10b981" />
              </div>
              <p className="mt-3 text-xs text-slate-600">
                가장 많은 학생 {formatKoreanCurrency(r.max)} · 가장 적은 학생 {formatKoreanCurrency(r.min)}
              </p>
            </Card>
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-3">돈이 어디에 있나</h3>
              <div className="flex h-4 rounded-full overflow-hidden bg-slate-100" role="img" aria-label="자산 구성">
                {compTotal > 0 && COMPOSITION_LABELS.map(([k, , color]) => {
                  const v = Math.max(0, r.composition?.[k] || 0);
                  return v > 0 ? <div key={k} style={{ width: `${(v / compTotal) * 100}%`, background: color }} /> : null;
                })}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
                {COMPOSITION_LABELS.map(([k, label, color]) => {
                  const v = Math.max(0, r.composition?.[k] || 0);
                  return (
                    <li key={k} className="flex items-center gap-1.5">
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
                      <span className="flex-1">{label}</span>
                      <span className="font-semibold">{compTotal > 0 ? Math.round((v / compTotal) * 100) : 0}%</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="통장에 돈 넣은 학생" value={`${r.savers}명`} />
            <Stat label="주식 가진 학생" value={`${r.investors}명`} />
            <Stat label="부동산 가진 학생" value={`${r.landlords}명`} />
            <Stat label="대출 있는 학생" value={`${r.borrowers}명`} />
            <Stat label="순자산 마이너스" value={`${r.inDebt}명`} />
          </div>

          {prompts.length > 0 && (
            <Card>
              <h3 className="text-sm font-bold text-slate-800 mb-2">이번 주 수업 거리</h3>
              <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                {prompts.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800">학생별 순자산</h3>
              <div className="flex gap-1 text-xs">
                {[["assets", "많은 순"], ["number", "번호순"]].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setOrder(k)}
                    aria-pressed={order === k}
                    className={`px-2.5 py-1 rounded-lg font-semibold border ${order === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-1">
              {students.map((s) => {
                const v = s.netAssets || 0;
                return (
                  <li key={s.uid} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 truncate font-semibold text-slate-800">
                      {s.studentNumber != null ? `${s.studentNumber}번 ` : ""}{plainStudentName(s)}
                    </span>
                    <span className="flex-1 h-3 rounded bg-slate-100 overflow-hidden">
                      <span style={{ display: "block", height: "100%", width: `${(Math.abs(v) / maxAbs) * 100}%`, background: v < 0 ? "#dc2626" : "#6366f1" }} />
                    </span>
                    <span className={`w-28 shrink-0 text-right font-semibold ${v < 0 ? "text-rose-700" : "text-slate-800"}`}>
                      {formatKoreanCurrency(v)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-600">이 화면은 선생님에게만 보여요. 학생에게는 자기 자산만 보여요.</p>
          </Card>
        </>
      )}
    </div>
  );
}
