// 📒 이번 주 가계부 — 학생이 자기 돈을 돌아보는 화면(2026-11-11).
//    열 때만 읽는다: 지난주 월요일부터의 세 원장(최대 300줄씩, firebase/db/ledger.js). 합치기 = mergeLedgerRows, 계산 = utils/weeklyBook.
//    인쇄하면 집에 가져갈 한 장이 된다(이름·기간·번 돈·쓴 돈·쓴 곳). 다른 학생 정보는 없다.
import React, { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { fetchLedgerSince } from "../firebase/db/ledger";
import { Modal, Button } from "./ui/index";
import PrintSheet from "./PrintSheet";
import { mergeLedgerRows } from "../utils/ledgerDedupe";
import { weekRangeKST, summarizeWeek, coachLines } from "../utils/weeklyBook";
import { formatKoreanCurrency } from "../utils/numberFormatter";


function Bars({ title, items, total, color }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-bold text-slate-800 mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.id} className="text-xs">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>{it.label} <span className="font-normal text-slate-600">· {it.count}번</span></span>
              <span>{formatKoreanCurrency(it.total)}</span>
            </div>
            <div className="mt-0.5 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div style={{ width: `${total > 0 ? Math.max(3, (it.total / total) * 100) : 0}%`, height: "100%", background: color }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookBody({ summary, lines, range, name }) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-slate-600">{name ? `${name} · ` : ""}{range.label}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
          <div className="text-[11px] font-semibold text-emerald-800">번 돈</div>
          <div className="text-sm font-extrabold text-emerald-800">{formatKoreanCurrency(summary.incomeTotal)}</div>
        </div>
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
          <div className="text-[11px] font-semibold text-rose-800">쓴 돈</div>
          <div className="text-sm font-extrabold text-rose-800">{formatKoreanCurrency(summary.expenseTotal)}</div>
        </div>
        <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3">
          <div className="text-[11px] font-semibold text-indigo-800">남긴 돈</div>
          <div className="text-sm font-extrabold text-indigo-800">{formatKoreanCurrency(summary.left)}</div>
        </div>
      </div>
      <ul className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 space-y-1">
        {lines.map((l) => <li key={l}>💡 {l}</li>)}
      </ul>
      <Bars title="어디서 벌었나" items={summary.income} total={summary.incomeTotal} color="#059669" />
      <Bars title="어디에 썼나" items={summary.expense} total={summary.expenseTotal} color="#e11d48" />
      {(summary.savedIn > 0 || summary.savedOut > 0 || summary.borrowed > 0 || summary.repaid > 0) && (
        <div className="text-xs text-slate-700 rounded-xl border border-slate-200 p-3 space-y-0.5">
          <div className="font-bold text-slate-800 mb-1">옮긴 돈 (번 돈·쓴 돈에는 안 들어가요)</div>
          {summary.savedIn > 0 && <div>통장·예금에 넣음 {formatKoreanCurrency(summary.savedIn)}</div>}
          {summary.savedOut > 0 && <div>통장·예금에서 뺌 {formatKoreanCurrency(summary.savedOut)}</div>}
          {summary.borrowed > 0 && <div>대출 받음 {formatKoreanCurrency(summary.borrowed)}</div>}
          {summary.repaid > 0 && <div>대출 갚음 {formatKoreanCurrency(summary.repaid)}</div>}
        </div>
      )}
    </div>
  );
}

export default function WeeklyBookModal({ isOpen, onClose, userId, classCode, name }) {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [truncatedBefore, setTruncatedBefore] = useState(0); // 이 시각보다 앞의 거래는 다 못 읽었다
  const [offset, setOffset] = useState(0); // 0 = 이번 주, -1 = 지난주
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isOpen || !userId || !classCode) return undefined;
    let alive = true;
    setRows(null);
    setFailed(false);
    setTruncatedBefore(0);
    fetchLedgerSince(userId, classCode, weekRangeKST(Date.now(), -1).start).then((r) => {
      if (!alive) return;
      // 하나라도 못 읽었으면 숫자를 내지 않는다 — 빠진 원장에 거래가 있었다면 틀린 합계가 된다.
      if (r.incomplete) { setFailed(true); return; }
      setTruncatedBefore(r.truncatedBefore || 0);
      setRows(mergeLedgerRows(r.activity, r.transactions, r.root));
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [isOpen, userId, classCode]);

  const range = useMemo(() => weekRangeKST(Date.now(), offset), [offset]);
  const summary = useMemo(() => (rows ? summarizeWeek(rows, range) : null), [rows, range]);
  // 이 주의 시작이 «잘린 시각»보다 앞이면 그 주 합계는 믿을 수 없다 — 숫자를 내지 않는다.
  const cut = truncatedBefore > 0 && range.start < truncatedBefore;
  const lines = useMemo(() => (summary ? coachLines(summary, (n) => formatKoreanCurrency(n)) : []), [summary]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📒 가계부">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 text-xs">
          {[[0, "이번 주"], [-1, "지난주"]].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setOffset(k)}
              aria-pressed={offset === k}
              className={`px-3 py-1.5 rounded-lg font-semibold border ${offset === k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" icon={Printer} disabled={!summary || cut} onClick={() => setPrinting(true)}>
          인쇄
        </Button>
      </div>
      {failed && <p className="text-sm text-rose-700">거래 기록을 읽지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
      {!failed && !summary && <p className="text-sm text-slate-600">거래 기록을 모으고 있어요…</p>}
      {summary && cut && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          거래가 아주 많아서 이 주의 기록을 다 모으지 못했어요. 이번 주 것만 볼 수 있어요.
        </p>
      )}
      {summary && !cut && <BookBody summary={summary} lines={lines} range={range} name={name} />}
      {printing && summary && !cut && (
        <PrintSheet onDone={() => setPrinting(false)}>
          <div style={{ padding: "12mm", maxWidth: "170mm", margin: "0 auto", fontFamily: "sans-serif" }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>알찬 가계부</h1>
            <BookBody summary={summary} lines={lines} range={range} name={name} />
            <p style={{ fontSize: 10, color: "#475569", marginTop: 16 }}>
              알찬은 교실에서 쓰는 학급 화폐예요(진짜 돈이 아니에요). 집에서 «이번 주에 어디에 가장 많이 썼니?»를 물어봐 주세요.
            </p>
          </div>
        </PrintSheet>
      )}
    </Modal>
  );
}
