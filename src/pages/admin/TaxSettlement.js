// 🧾 세금정산 — 교사 화면(2026-11-17 사용자 «관리자탭에 세금정산 · 사진을 찍어 넣으면 학생별로 자동으로»).
//   ① 주간 정산표(번호 + 요일별 벌금·상금·쿠폰) 사진을 올린다 — 휴대폰 안에서 이름 칸을 찾아 검게 칠하고 그 사진만 보낸다
//      (2026-11-17 사용자 «이름은 국외로 넘어가면 안 된다 · 니가 스스로 이름칸 전부 검게 가리고 보내». 못 찾으면 선생님이 칠해야 보낼 수 있다) → 서버 readTaxSheet 가 손글씨를 읽어 «초안»을 돌려준다(돈 0).
//   ② 선생님이 사진과 나란히 보며 학생·금액을 확인·고친다(애매한 칸은 노랗게).
//   ③ «정산하기» → 서버 applyTaxSettlement 가 학생마다 벌금(→국고)·상금(국고→)·쿠폰을 넣는다.
//   손글씨 판독은 틀릴 수 있다 — 그래서 ②를 건너뛰는 길은 없다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ReceiptText, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { functions, httpsCallable } from "../../firebase";
import { PageHeader, Card, Button } from "../../components/ui/index";
import { toast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmDialog";
import { sortByStudentNumber, plainStudentName, studentNumberOf } from "../../utils/studentOrder";
import { matchRows, shortWon } from "../../utils/taxSettlement";
import { maskNamesInPhoto, canvasToBase64 } from "../../utils/maskPhoto";
import useAppointedJobTitle from "../../hooks/useAppointedJobTitle";

const readSheetFn = httpsCallable(functions, "readTaxSheet", { timeout: 250000 }); // 서버 240s 보다 조금 길게
const applyFn = httpsCallable(functions, "applyTaxSettlement", { timeout: 300000 });

/**
 * 이름 칸을 가린 사진 캔버스를 보여 주고, «칠하기»를 켜면 손가락·마우스로 더 검게 칠할 수 있다.
 * 칠하기를 켠 동안만 터치 스크롤을 막는다(꺼져 있으면 사진 위에서도 화면이 그대로 넘어간다).
 */
function PaintCanvas({ canvas, painting, onStroke }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const box = boxRef.current; if (!box || !canvas) return undefined;
    canvas.className = "block w-full rounded-lg border border-slate-200";
    box.replaceChildren(canvas);
    return () => { if (canvas.parentNode === box) box.removeChild(canvas); };
  }, [canvas]);
  useEffect(() => {
    if (!canvas) return undefined;
    canvas.style.touchAction = painting ? "none" : "auto";
    canvas.style.cursor = painting ? "crosshair" : "default";
    if (!painting) return undefined;
    const g = canvas.getContext("2d");
    let last = null;
    const at = (e) => { const b = canvas.getBoundingClientRect(); return [(e.clientX - b.left) * (canvas.width / b.width), (e.clientY - b.top) * (canvas.height / b.height)]; };
    const line = (a, b) => {
      g.save(); g.strokeStyle = "#000"; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = Math.max(18, canvas.width * 0.03);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore();
    };
    const down = (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); last = at(e); line(last, last); };
    const move = (e) => { if (!last) return; const p = at(e); line(last, p); last = p; };
    const up = () => { if (last) onStroke(); last = null; };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
    };
  }, [canvas, painting, onStroke]);
  return <div ref={boxRef} />;
}

const weekLabel = () => {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${Math.ceil(d.getDate() / 7)}주 세금정산`;
};
/** 숫자와 천 단위 쉼표만 받는다 — «-100»·«1.5»를 100·15 로 바꿔 넣지 않는다(8way codex). 아니면 null(입력 무시) */
const toInt = (v) => { const t = String(v).trim(); if (t === "") return 0; if (!/^[\d,]+$/.test(t)) return null; const n = Number(t.replace(/,/g, "")); return Number.isSafeInteger(n) ? n : null; };
const HOW = { no: "", pick: "", nono: "번호를 못 읽었어요 — 학생을 골라 주세요", none: "이 번호 학생이 없어요 — 골라 주세요", many: "같은 번호 학생이 여럿 — 골라 주세요", dup: "같은 번호가 위에 있음 — 골라 주세요" };

function MoneyInput({ value, onChange, label, unit = "원", wide = false }) {
  return (
    <label className="flex min-w-0 items-center gap-1">
      <span className="sr-only">{label}</span>
      <input
        inputMode="numeric"
        className={`${wide ? "w-full min-w-0" : "w-28"} rounded-lg border border-slate-300 px-2 py-1 text-right tabular-nums`}
        value={value ? value.toLocaleString() : ""}
        placeholder="0"
        onChange={(e) => { const n = toInt(e.target.value); if (n !== null) onChange(n); }}
        aria-label={label}
      />
      <span className="text-xs text-slate-500">{unit}</span>
    </label>
  );
}

export default function TaxSettlement() {
  const { userDoc, allClassMembers, refreshAllUsers } = useAuth();
  const isTeacher = !!(userDoc?.isAdmin || userDoc?.isSuperAdmin || userDoc?.role === "admin");
  const isTaxChief = useAppointedJobTitle(userDoc, "국세청 직원");
  const [photo, setPhoto] = useState(null);       // { canvas(이름 가린 것), auto(자동으로 가렸나), snap(가린 직후 모습) }
  const [strokes, setStrokes] = useState(0);      // 손으로 칠한 횟수
  const [painting, setPainting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [reading, setReading] = useState(false);
  const [sheet, setSheet] = useState(null);       // { sheetHash, applied, model }
  const [lines, setLines] = useState([]);
  const [label, setLabel] = useState(weekLabel);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const submittingRef = useRef(false);
  const idemKeyRef = useRef(null);                // 같은 정산을 다시 눌러도 이미 넣은 학생은 건너뛴다 — 성공·새 사진 때만 새로
  const fileRef = useRef(null);
  const photoNoRef = useRef(0);                   // 사진마다 번호 — 늦게 온 판독 응답이 새 사진 화면을 덮지 않게(8way codex·gemini)

  const students = useMemo(
    () => sortByStudentNumber((allClassMembers || []).filter((m) => !m.isAdmin && !m.isSuperAdmin && !m.isTeacher)),
    [allClassMembers],
  );
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // 학생 목록은 화면당 한 번만 새로(MoneyTransfer 와 같은 가드 — 무한 새로고침 방지)
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (refreshedRef.current || typeof refreshAllUsers !== "function") return;
    refreshedRef.current = true;
    refreshAllUsers().catch(() => {});
  }, [refreshAllUsers]);

  const pick = useCallback(async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast.error("사진 파일을 골라 주세요."); return; }
    setPreparing(true);
    try {
      const { canvas, auto } = await maskNamesInPhoto(file);
      const snap = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      photoNoRef.current += 1;
      setPhoto({ canvas, auto, snap }); setStrokes(0); setPainting(!auto);
      setSheet(null); setLines([]); setResult(null); idemKeyRef.current = null;
      if (!auto) toast.error("이름 칸을 자동으로 못 찾았어요. 사진에서 이름 칸을 손가락으로 칠해 주세요.");
    } catch {
      toast.error("사진을 열지 못했어요. 다른 사진으로 해 주세요.");
    } finally {
      setPreparing(false);
    }
  }, []);

  const read = useCallback(async () => {
    if (!photo || reading) return;
    if (!photo.auto && strokes === 0) { toast.error("먼저 이름 칸을 칠해 주세요."); return; }
    setReading(true); setResult(null); setPainting(false);
    const myPhoto = photoNoRef.current;
    try {
      const r = await readSheetFn({ image: canvasToBase64(photo.canvas), mimeType: "image/jpeg" }); // 이름 가린 캔버스만 나간다
      if (myPhoto !== photoNoRef.current) return; // 그새 다른 사진을 골랐다 — 이 응답은 버린다
      setSheet({ sheetHash: r.data.sheetHash, applied: r.data.applied, model: r.data.model });
      setLines(matchRows(r.data.rows, students));
      // 멱등키는 «같은 사진을 다시 읽기»로는 바꾸지 않는다 — 일부만 넣고 다시 읽어 누르면 이미 넣은 학생이 또 들어갔다(8way codex).
      //   새 키는 새 사진을 고를 때만(pick) 만든다.
    } catch (e) {
      toast.error(e?.message || "사진을 읽지 못했어요.");
    } finally {
      setReading(false);
    }
  }, [photo, reading, students, strokes]);

  const onStroke = useCallback(() => setStrokes((n) => n + 1), []);
  const undoPaint = () => { if (!photo) return; photo.canvas.getContext("2d").putImageData(photo.snap, 0, 0); setStrokes(0); };
  const canRead = !!photo && (photo.auto || strokes > 0);

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const usedTwice = useMemo(() => {
    const n = new Map();
    for (const l of lines) if (l.studentId) n.set(l.studentId, (n.get(l.studentId) || 0) + 1);
    return new Set([...n].filter(([, c]) => c > 1).map(([id]) => id));
  }, [lines]);
  const ready = lines.filter((l) => l.studentId && (l.fine || l.prize || l.coupon));
  const unmatched = lines.filter((l) => !l.studentId && (l.fine || l.prize || l.coupon));
  const sum = ready.reduce((a, l) => ({ fine: a.fine + l.fine, prize: a.prize + l.prize, coupon: a.coupon + l.coupon }), { fine: 0, prize: 0, coupon: 0 });
  const goNegative = ready.filter((l) => { const c = Number(byId.get(l.studentId)?.cash); return Number.isFinite(c) && c + l.prize - l.fine < 0; });

  const apply = useCallback(async () => {
    if (submittingRef.current || !ready.length) return;
    if (usedTwice.size) { toast.error("같은 학생이 두 줄에 골라져 있어요. 한 줄은 바꿔 주세요."); return; }
    submittingRef.current = true; // 확인창을 띄우기 전에 잠근다 — 대기 중 두 번 눌러 두 번 들어가지 않게(8way gemini)
    const parts = [
      sum.fine ? `벌금 ${sum.fine.toLocaleString()}원 → 국고` : "",
      sum.prize ? `상금 ${sum.prize.toLocaleString()}원 → 학생` : "",
      sum.coupon ? `쿠폰 ${sum.coupon.toLocaleString()}개 → 학생` : "",
    ].filter(Boolean).join("\n");
    const warn = [
      unmatched.length ? `⚠️ 학생을 못 고른 줄 ${unmatched.length}개는 빠집니다.` : "",
      goNegative.length ? `⚠️ ${goNegative.length}명은 잔액보다 벌금이 많아 마이너스(빚)가 됩니다.` : "",
      sheet?.applied ? "⚠️ 이 사진은 이미 정산한 적이 있어요. 두 번 넣는 것이 아닌지 확인하세요." : "",
    ].filter(Boolean).join("\n");
    const ok = await confirmDialog(`«${label}» — 학생 ${ready.length}명\n\n${parts}${warn ? `\n\n${warn}` : ""}\n\n정산할까요?`, {
      danger: !!(goNegative.length || sheet?.applied), confirmText: "정산하기",
    });
    if (!ok) { submittingRef.current = false; return; }
    setApplying(true);
    try {
      if (!idemKeyRef.current) idemKeyRef.current = crypto.randomUUID();
      const r = await applyFn({
        items: ready.map((l) => ({ userId: l.studentId, fine: l.fine, prize: l.prize, coupon: l.coupon })),
        idempotencyKey: idemKeyRef.current, label, sheetHash: sheet?.sheetHash || "",
      });
      setResult(r.data);
      toast.success(`${r.data.count}명 정산을 마쳤어요.`);
      refreshAllUsers?.().catch(() => {});
    } catch (e) {
      toast.error(e?.message || "정산하지 못했어요. 다시 누르면 이미 넣은 학생은 건너뜁니다.");
    } finally {
      submittingRef.current = false; setApplying(false);
    }
  }, [ready, usedTwice, sum, unmatched.length, goNegative.length, sheet, label, refreshAllUsers]);

  const nameOf = (id) => { const s = byId.get(id); return s ? `${studentNumberOf(s) ?? "–"}번 ${plainStudentName(s)}` : ""; };

  if (!userDoc) return null;
  // 선생님 또는 선생님이 임명한 국세청장(2026-11-17) — 서버 requireSettler 가 다시 판정한다
  if (!isTeacher && !isTaxChief) {
    return (
      <div className="mx-auto max-w-xl p-5">
        <PageHeader title="세금정산" icon={ReceiptText} />
        <Card><p className="text-sm text-slate-700" data-tax-denied>선생님이나 선생님이 임명한 <b>국세청장</b>만 세금정산을 할 수 있어요.</p></Card>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-5">
      <PageHeader title="세금정산" icon={ReceiptText} subtitle="주간 정산표 사진 → 학생별 벌금·상금·쿠폰 자동 입력" />

      <Card className="mb-4">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>정산표를 <b>표 전체가 화면에 꽉 차게</b> 찍어 올려요. <b>이름 칸은 앱이 알아서 검게 가린 뒤</b> 보내요 — 학생은 <b>번호로</b> 찾아요.</li>
          <li>«사진 읽기»를 누르면 30초~1분쯤 뒤 학생별 합계가 나와요. <b>사진과 나란히 보며 꼭 확인</b>하세요 — 애매한 칸은 노랗게 표시돼요.</li>
          <li>«정산하기»를 누르면 벌금은 국고로, 상금은 국고에서 학생에게, 쿠폰은 학생에게 들어가요. 모두 거래내역에 남아요.</li>
          {!isTeacher && <li data-tax-chief-note><b>국세청장 본인 줄</b>은 넣지 않고 건너뛰어요 — 본인 것은 선생님이 넣어요.</li>}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Button icon={Camera} variant="outline" disabled={reading || applying || preparing} loading={preparing} onClick={() => fileRef.current?.click()}>{photo ? "다른 사진 고르기" : "사진 찍기·고르기"}</Button>
          <Button onClick={read} disabled={!canRead} loading={reading}>{reading ? "읽는 중… (30초~1분)" : "사진 읽기"}</Button>
          <span className="text-xs text-slate-500">이름 칸은 휴대폰 안에서 가린 뒤, 가린 사진만 판독(Google Gemini, 국외 서버)으로 보내요. 사진은 저장하지 않아요.</span>
        </div>
      </Card>

      {photo && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* grid-cols-1(=minmax(0,1fr)) — 없으면 휴대폰에서 한 칸이 판독 표 폭(780px)까지 늘어 사진·«정산하기»가 화면 오른쪽 밖으로 밀렸다(2026-11-17 사용자 «모바일 세로 오른쪽이 잘려서 정산이 안 돼»). 표만 옆으로 민다 */}
          <Card className="lg:sticky lg:top-3 self-start">
            <div className={`mb-2 rounded-lg p-2 text-sm ${photo.auto || strokes ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
              {photo.auto
                ? <>이름 칸을 <b>검게 가렸어요.</b> 이 사진만 보내요. 이름이 조금이라도 보이면 «더 칠하기»로 칠해 주세요.</>
                : strokes ? <>칠한 사진만 보내요. 이름이 다 가려졌는지 확인하세요.</>
                  : <><b>이름 칸을 자동으로 못 찾았어요.</b> 사진에서 이름 칸을 손가락으로 칠해 주세요 — 칠해야 보낼 수 있어요.</>}
            </div>
            <PaintCanvas canvas={photo.canvas} painting={painting && !reading} onStroke={onStroke} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant={painting ? "primary" : "outline"} disabled={reading} onClick={() => setPainting((v) => !v)}>{painting ? "칠하기 끝" : "더 칠하기"}</Button>
              {strokes > 0 && <Button size="sm" variant="outline" disabled={reading} onClick={undoPaint}>칠한 것 되돌리기</Button>}
            </div>
          </Card>

          <div className="min-w-0">
            {sheet?.applied && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <span>이 사진은 이미 정산했어요{sheet.applied.label ? ` («${sheet.applied.label}»)` : ""}. 같은 주를 두 번 넣지 않도록 확인하세요.</span>
              </div>
            )}
            {lines.length > 0 && (
              <Card>
                <label className="mb-3 flex items-center gap-2 text-sm">
                  <span className="font-semibold text-slate-700">정산 이름</span>
                  <input className="flex-1 rounded-lg border border-slate-300 px-2 py-1" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
                </label>
                {/* 휴대폰 세로: 줄마다 카드 — 표는 옆으로 밀어야 금액 칸이 보여 «오른쪽이 잘린다»로 보였다(2026-11-17 사용자 2차). 옆 스크롤 0 */}
                <div className="space-y-3 sm:hidden">
                  {lines.map((l) => {
                    const warnRow = !l.studentId || usedTwice.has(l.studentId);
                    return (
                      <div key={l.key} data-tax-card={l.row.no ?? "?"} className={`rounded-xl border p-3 ${l.unsure ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-base font-bold text-slate-800">{l.row.no != null ? `${l.row.no}번` : "번호 ?"}</div>
                          <select
                            className={`min-w-0 max-w-[60%] flex-1 rounded-lg border px-2 py-1.5 ${warnRow ? "border-amber-400 bg-amber-50" : "border-slate-300"}`}
                            value={l.studentId || ""}
                            onChange={(e) => setLine(l.key, { studentId: e.target.value || null, how: e.target.value ? "pick" : "nono" })}
                            aria-label={`${l.row.no ?? "?"}번 줄 학생 고르기`}
                          >
                            <option value="">— 고르기 —</option>
                            {students.map((s) => <option key={s.id} value={s.id}>{nameOf(s.id)}</option>)}
                          </select>
                        </div>
                        {(HOW[l.how] || usedTwice.has(l.studentId)) && <div className="mt-1 text-xs text-amber-700">{usedTwice.has(l.studentId) ? "같은 학생이 두 줄에 있음" : HOW[l.how]}</div>}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {l.row.cells.length === 0 && <span className="text-xs text-slate-400">빈 줄</span>}
                          {l.row.cells.map((c, i) => (
                            <span key={i} className={`rounded px-1.5 py-0.5 text-xs ${c.sure ? "bg-slate-100 text-slate-700" : "bg-amber-200 text-amber-900"}`}>{c.day} {c.col} {c.text}{c.sure ? "" : " ?"}</span>
                          ))}
                        </div>
                        {l.unsure && <p className="mt-1.5 text-xs text-amber-800">노란 칸은 글씨가 애매해요 — 위 사진의 그 칸과 비교해 <b>아래 합계를 고쳐 주세요</b>(고친 숫자 그대로 들어가요).</p>}
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {[["벌금", "fine", "원"], ["상금", "prize", "원"], ["쿠폰", "coupon", "개"]].map(([name, k, unit]) => (
                            <div key={k} className="min-w-0">
                              <div className="mb-0.5 text-[11px] font-semibold text-slate-500">{name}</div>
                              <MoneyInput wide label={`${l.row.no ?? "?"}번 ${name}`} unit={unit} value={l[k]} onChange={(v) => setLine(l.key, { [k]: v })} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                        <th className="py-2 pr-2 min-w-[11rem]">표에서 읽은 줄</th><th className="pr-2">학생</th>
                        <th className="pr-2 text-right">벌금</th><th className="pr-2 text-right">상금</th><th className="text-right">쿠폰</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => {
                        const warnRow = !l.studentId || usedTwice.has(l.studentId);
                        return (
                          <tr key={l.key} className={`border-b border-slate-100 align-top ${l.unsure ? "bg-amber-50" : ""}`}>
                            <td className="py-2 pr-2 min-w-[11rem]">{/* 이름을 뺀 뒤 이 칸이 «1번»만큼 좁아져 칸 글씨가 한 자씩 꺾였다(2026-11-17 배포본 실측) */}
                              <div className="font-semibold text-slate-800">{l.row.no != null ? `${l.row.no}번` : "번호 ?"}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {l.row.cells.length === 0 && <span className="text-xs text-slate-400">빈 줄</span>}
                                {l.row.cells.map((c, i) => (
                                  <span key={i} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${c.sure ? "bg-slate-100 text-slate-700" : "bg-amber-200 text-amber-900"}`} title={c.sure ? "" : "글씨가 애매해요 — 사진과 비교해 주세요"}>
                                    {c.day} {c.col} {c.text}{c.sure ? "" : " ?"}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="pr-2">
                              <select
                                className={`max-w-[9.5rem] rounded-lg border px-1 py-1 ${warnRow ? "border-amber-400 bg-amber-50" : "border-slate-300"}`}
                                value={l.studentId || ""}
                                onChange={(e) => setLine(l.key, { studentId: e.target.value || null, how: e.target.value ? "pick" : "nono" })}
                                aria-label={`${l.row.no ?? "?"}번 줄 학생 고르기`}
                              >
                                <option value="">— 고르기 —</option>
                                {students.map((s) => <option key={s.id} value={s.id}>{nameOf(s.id)}</option>)}
                              </select>
                              {(HOW[l.how] || usedTwice.has(l.studentId)) && (
                                <div className="mt-0.5 text-xs text-amber-700">{usedTwice.has(l.studentId) ? "같은 학생이 두 줄에 있음" : HOW[l.how]}</div>
                              )}
                            </td>
                            <td className="pr-2 text-right"><MoneyInput label={`${l.row.no ?? "?"}번 벌금`} value={l.fine} onChange={(v) => setLine(l.key, { fine: v })} /></td>
                            <td className="pr-2 text-right"><MoneyInput label={`${l.row.no ?? "?"}번 상금`} value={l.prize} onChange={(v) => setLine(l.key, { prize: v })} /></td>
                            <td className="text-right"><MoneyInput label={`${l.row.no ?? "?"}번 쿠폰`} unit="개" value={l.coupon} onChange={(v) => setLine(l.key, { coupon: v })} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="text-sm text-slate-700">
                    학생 <b>{ready.length}</b>명 · 벌금 <b>{shortWon(sum.fine)}</b>원 · 상금 <b>{shortWon(sum.prize)}</b>원 · 쿠폰 <b>{sum.coupon}</b>개
                    {unmatched.length > 0 && <span className="ml-2 text-amber-700">· 학생 미선택 {unmatched.length}줄(빠짐)</span>}
                    {goNegative.length > 0 && <span className="ml-2 text-red-600">· 마이너스 예정 {goNegative.length}명</span>}
                  </div>
                  <Button variant="success" icon={CheckCircle2} onClick={apply} loading={applying} disabled={!ready.length || usedTwice.size > 0 || (result && !result.failures?.length)}>{result && !result.failures?.length ? "정산 완료" : "정산하기"}</Button>
                </div>
              </Card>
            )}
            {result && (
              <Card className="mt-4">
                <p className="font-semibold text-emerald-700">✓ {result.count}명 정산 완료 — 벌금 {result.fineSum.toLocaleString()}원 · 상금 {result.prizeSum.toLocaleString()}원 · 쿠폰 {result.couponSum}개</p>
                {result.skipped?.length > 0 && <p className="mt-1 text-sm text-slate-600">건너뜀 {result.skipped.length}명: {result.skipped.map((s) => `${nameOf(s.userId) || "?"}(${s.reason})`).join(", ")}</p>}
                {result.negative?.length > 0 && <p className="mt-1 text-sm text-red-600">마이너스가 된 학생: {result.negative.map(nameOf).join(", ")}</p>}
                {result.failures?.length > 0 && (
                  <p className="mt-1 text-sm text-red-600">실패 {result.failures.length}명: {result.failures.map((f) => `${nameOf(f.userId) || "?"}(${f.reason})`).join(", ")} — «정산하기»를 다시 누르면 실패한 학생만 다시 넣어요.</p>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
