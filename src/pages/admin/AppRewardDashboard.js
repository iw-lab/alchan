// src/pages/admin/AppRewardDashboard.js
// 🧭 학습앱 현황 (P1-5) — 교사가 **학급의 학습기록**과 **보상 지급**을 보고, 잘못 나간 지급을
//    되돌리는 화면.
//
// 왜 이 화면이 게이트였나
//   `clawbackAppReward` 는 이미 배포돼 있었지만 `grantId` 를 앱 안에서 얻을 방법이 없어
//   **부를 수가 없었다**(운영 스크립트로만 됐다). 환수가 불가능한 상태로 보상을 켜면,
//   사고가 났을 때 교사가 할 수 있는 일이 없다. 그래서 파일럿(P1-4) 전에 이게 먼저다.
//
// 읽기 비용 — **폴링하지 않는다**
//   이 앱은 학생 1명당 하루 약 1,775 읽기가 나온다. 교사 화면이 자동 갱신되면 그게 그대로
//   비용이 된다. 그래서 ① 날짜·탭이 바뀔 때 ② 새로고침을 누를 때만 읽는다.
//   학습현황은 학생 수만큼 쿼리를 던진다(N-fan-out) — `collectionGroup` 은 새 복합인덱스를
//   요구하는데 이 저장소 CI 는 인덱스를 배포하지 않는다(2026-08-22 라이브 실측으로 확인).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  AlertTriangle, RefreshCw, Undo2, Coins, Ticket, Clock, Activity, ChevronLeft, ChevronRight,
} from "lucide-react";
// 🔻 Firestore 를 여기서 직접 부르지 않는다 — 읽기는 데이터 계층(`firebase/db/learningApps.js`).
//    이 저장소는 "화면이 Firestore 를 직접 부르는 파일 수"에 천장을 걸어 둔다(debt-ratchet).
import { functions, fetchPlatformAlerts, fetchClassLearningStats } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { getLearningAppItems } from "../../services/learningAppRegistry";
import { getCurrencyUnit } from "../../utils/numberFormatter";
import { confirmDialog } from "../../utils/confirmDialog";
import { promptDialog } from "../../utils/promptDialog";
import { toast } from "../../utils/toast";
import { logger } from "../../utils/logger";

/** KST 기준 오늘(YYYYMMDD). 서버(`learningRules.kstDayKey`)와 **같은 규칙**이어야 한다. */
function kstDayKey(ms = Date.now()) {
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** YYYYMMDD → 하루 이동. 문자열 산술을 피하려고 UTC 자정 기준으로 돌린다. */
function shiftDay(day, delta) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6));
  const d = Number(day.slice(6, 8));
  const t = Date.UTC(y, m - 1, d) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
}

const prettyDay = (day) => `${day.slice(0, 4)}.${day.slice(4, 6)}.${day.slice(6, 8)}`;
const num = (n) => (Number.isFinite(n) ? n.toLocaleString("ko-KR") : "—");
/** 비율 → 퍼센트. 값이 없거나 이상하면 `NaN%` 를 찍지 않는다(서버 응답이 낡았을 때). */
const pct = (r) => (Number.isFinite(r) ? Math.round(r * 100) : 0);

/**
 * 학생 문서 판정 — 서버 정본은 `functions/studentScope.js` 의 `isStudentDoc` 이다.
 *
 * ⚠️ 클라이언트에서 그 파일을 import 할 수 없어(CJS) 판정식을 옮겨 적었다. 이 저장소는
 *    같은 복붙으로 주급이 멎은 전례가 있으므로, **정본이 바뀌면 여기도 바꾼다**는 사실을
 *    주석으로 남긴다. (기존 화면들은 `!isTeacher && !isAdmin` 등 서로 다른 식을 쓰고 있다 —
 *    통일은 이 변경의 범위 밖이라 건드리지 않았다.)
 */
const isStudentDoc = (u) => !!u?.classCode && !u?.isSuperAdmin && !u?.isTeacher;

const CARD = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};
const LEVEL_STYLE = {
  danger: { backgroundColor: "rgba(239, 68, 68, 0.12)", color: "#b91c1c", label: "높음" },
  warn: { backgroundColor: "rgba(245, 158, 11, 0.18)", color: "#b45309", label: "주의" },
  ok: { backgroundColor: "rgba(100, 116, 139, 0.10)", color: "#475569", label: "보통" },
};

export default function AppRewardDashboard() {
  const { userDoc, classmates, isSuperAdmin } = useAuth();
  const classCode = userDoc?.classCode;
  const superAdmin = typeof isSuperAdmin === "function" ? isSuperAdmin() : !!isSuperAdmin;

  const [tab, setTab] = useState("rewards");
  const [day, setDay] = useState(() => kstDayKey());
  const [rewards, setRewards] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [learning, setLearning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [busyGrant, setBusyGrant] = useState("");

  // 늦게 온 응답이 지금 화면을 덮어쓰지 않게 한다(날짜를 빠르게 넘기면 실제로 일어난다).
  const reqSeq = useRef(0);

  const listAppRewards = useMemo(() => httpsCallable(functions, "listAppRewards"), []);
  const clawback = useMemo(() => httpsCallable(functions, "clawbackAppReward"), []);

  const appLabel = useMemo(() => {
    const map = new Map();
    for (const a of getLearningAppItems()) map.set(a.id, a.label);
    return (id) => map.get(id) || id;
  }, []);

  const students = useMemo(
    () => (Array.isArray(classmates) ? classmates.filter(isStudentDoc) : []),
    [classmates],
  );
  const nameOf = useMemo(() => {
    const map = new Map(students.map((s) => [s.id || s.uid, s.name || s.nickname || "이름 없음"]));
    return (uid) => map.get(uid) || `${String(uid).slice(0, 6)}…`;
  }, [students]);

  // ── 보상 지급 + 경보 ──────────────────────────────────────────
  const loadRewards = useCallback(async () => {
    const seq = (reqSeq.current += 1);
    setLoading(true);
    setErr("");
    try {
      // 원장은 서버 전용이라 CF 로, 경보는 rules 가 교사에게 열어 둔 컬렉션이라 직접 읽는다.
      const [res, alertRows] = await Promise.all([
        listAppRewards({ day }),
        fetchPlatformAlerts(day),
      ]);
      if (seq !== reqSeq.current) return false;
      setRewards(res.data);
      setAlerts(alertRows);
      return true;
    } catch (e) {
      if (seq !== reqSeq.current) return false;
      logger.error("[AAP] 지급 원장 조회 실패", e);
      setErr(e?.message || "조회에 실패했습니다.");
      // 🔴 실패하면 **비운다.** 직전 목록을 남기면, 환수 직후 새로고침이 실패한 경우 방금
      //    되돌린 건이 "아직 지급됨"으로 보인다 — 그 화면으로 한 번 더 누르게 된다.
      //    (서버 멱등이 이중 차감은 막지만, 돈 화면이 틀린 상태를 보여 주는 것 자체가 사고다.)
      setRewards(null);
      setAlerts([]);
      return false;
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [day, listAppRewards]);

  // ── 학습 현황 (학생별 N-fan-out) ──────────────────────────────
  const loadLearning = useCallback(async () => {
    if (!classCode) return;
    const seq = (reqSeq.current += 1);
    setLoading(true);
    setErr("");
    try {
      const rows = await fetchClassLearningStats(
        classCode,
        students.map((s) => s.id || s.uid),
        day,
      );
      if (seq !== reqSeq.current) return;
      setLearning(rows);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      logger.error("[AAP] 학습 현황 조회 실패", e);
      setErr(e?.message || "학습 현황을 불러오지 못했습니다.");
      setLearning(null);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [classCode, day, students]);

  // 탭·날짜가 바뀔 때만 읽는다. **폴링 없음** — 갱신은 아래 새로고침 버튼.
  //
  // ⚠️ 두 로더를 **한 effect 에 묶지 않는다.** 묶으면 `loadLearning` 의 신원이 바뀔 때
  //    (명단이 갱신되면 그렇게 된다) 보상 탭을 보고 있어도 effect 가 다시 돌아
  //    **CF 호출이 한 번 더 나간다.** 읽기 비용이 곧 청구서인 저장소라 이 한 번이 공짜가 아니다.
  useEffect(() => {
    if (tab === "rewards") loadRewards();
  }, [tab, loadRewards]);
  useEffect(() => {
    if (tab === "learning") loadLearning();
  }, [tab, loadLearning]);

  // ── 환수 ──────────────────────────────────────────────────────
  const onClawback = async (row) => {
    const label = row.label || row.achievementId;
    const who = nameOf(row.uid);
    const unit = row.rewardType === "cash" ? getCurrencyUnit() : "장";
    const ok = await confirmDialog(
      `${who} 학생의 「${label}」 보상 ${num(row.amount)}${unit} 을(를) 되돌릴까요?\n\n` +
        "· 학생 잔액에서 차감되고 거래내역에 음수로 남습니다\n" +
        "· 잔액이 부족하면 있는 만큼만 회수됩니다(0 아래로 내려가지 않습니다)\n" +
        "· 하루 지급 한도는 되돌아오지 않습니다",
      // 되돌릴 수 없는 작업의 확인창은 이 저장소에서 전부 `danger` 다(69곳). 빨간 확인 버튼이
      // "이건 취소가 아니라 실행"이라는 유일한 시각 신호라, 돈 화면에서 빠뜨리면 안 된다.
      { danger: true },
    );
    if (!ok) return;

    // `revocable:false` 는 서버가 교사에게는 아예 거부하고, 슈퍼관리자에게만 **사유를 받고** 연다.
    let reason = "";
    if (row.revocable === false) {
      const typed = await promptDialog("되돌릴 수 없도록 설정된 보상입니다. 사유를 적어 주세요.");
      if (!typed || !typed.trim()) return;
      reason = typed.trim();
    }

    setBusyGrant(row.id);
    try {
      const res = await clawback({ grantId: row.id, reason });
      const d = res.data || {};
      if (d.duplicate) toast.info("이미 되돌린 보상입니다.");
      else if (d.shortfall > 0) {
        toast.success(`${num(d.recoveredAmount)}${unit} 회수했습니다. 잔액이 부족해 ${num(d.shortfall)}${unit} 은 회수하지 못했습니다.`);
      } else toast.success(`${num(d.recoveredAmount)}${unit} 회수했습니다.`);
      // 🔴 되돌리기는 이미 끝났다. 여기서 실패하는 건 **목록 재조회**뿐인데, 화면이 비고
      //    빨간 배너만 남으면 교사는 "환수가 실패했나"로 읽는다. 두 사건을 갈라 말한다.
      const reloaded = await loadRewards();
      if (!reloaded) toast.info("되돌리기는 처리됐어요. 목록만 다시 불러오지 못했으니 새로고침해 주세요.");
    } catch (e) {
      logger.error("[AAP] 환수 실패", e);
      toast.error(e?.message || "되돌리지 못했습니다.");
    } finally {
      setBusyGrant("");
    }
  };

  // ── 학습 현황 집계(표시용) ────────────────────────────────────
  const learningByStudent = useMemo(() => {
    if (!learning) return [];
    const map = new Map();
    for (const r of learning) {
      const cur = map.get(r.uid) || { uid: r.uid, sec: 0, events: 0, sessions: 0, apps: [] };
      cur.sec += Number.isFinite(r.sec) ? r.sec : 0;
      cur.events += Number.isFinite(r.events) ? r.events : 0;
      cur.sessions += Number.isFinite(r.sessions) ? r.sessions : 0;
      cur.apps.push({ appId: r.appId, sec: r.sec, events: r.events, best: r.best });
      map.set(r.uid, cur);
    }
    return [...map.values()].sort((a, b) => b.sec - a.sec);
  }, [learning]);

  const t = rewards?.totals;
  const caps = rewards?.caps;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <h1 className="text-lg font-bold mb-1 px-1 text-slate-800">학습앱 현황</h1>
      <p className="text-xs mb-4 px-1" style={{ color: "#64748b" }}>
        {/* 🔴 **두 탭의 범위가 다르다.** 보상 지급은 서버(`grantsQuery.normalizeQuery`)가 정하고
            슈퍼관리자에게는 전 학급을 연다. 학습 현황은 `classmates`(= 로그인 계정 자신의 학급)
            명부를 돌므로 **언제나 자기 학급 하나**다. 라이브의 슈퍼관리자 계정은 실제로
            classCode 를 가지고 있어(CLASS2025, 2026-08-22 조회) 한 문장으로 뭉치면 거짓이 된다. */}
        {tab === "rewards"
          ? superAdmin ? "전체 학급" : `${classCode || "학급 미지정"} 학급`
          : `${classCode || "학급 미지정"} 학급`} ·
        {tab === "rewards" ? " 학습앱 보상 지급을 하루 단위로 봅니다." : " 학급 학습기록을 하루 단위로 봅니다."}
      </p>

      {/* 날짜 이동 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setDay((d) => shiftDay(d, -1))}
          className="p-2 rounded-lg" style={{ ...CARD, cursor: "pointer" }} aria-label="이전 날"
        >
          <ChevronLeft size={16} color="#475569" />
        </button>
        <span className="px-3 py-2 rounded-lg text-sm font-bold" style={{ ...CARD, color: "#0f172a" }}>
          {prettyDay(day)}
        </span>
        <button
          onClick={() => setDay((d) => (d >= kstDayKey() ? d : shiftDay(d, 1)))}
          disabled={day >= kstDayKey()}
          className="p-2 rounded-lg"
          style={{ ...CARD, cursor: day >= kstDayKey() ? "not-allowed" : "pointer", opacity: day >= kstDayKey() ? 0.4 : 1 }}
          aria-label="다음 날"
        >
          <ChevronRight size={16} color="#475569" />
        </button>
        {day !== kstDayKey() && (
          <button onClick={() => setDay(kstDayKey())} className="px-3 py-2 rounded-lg text-xs font-medium"
            style={{ ...CARD, color: "#4f46e5", cursor: "pointer" }}>
            오늘로
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => (tab === "rewards" ? loadRewards() : loadLearning())}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
          style={{ ...CARD, color: "#4f46e5", cursor: loading ? "wait" : "pointer" }}
        >
          <RefreshCw size={14} /> {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[{ key: "rewards", label: "보상 지급" }, { key: "learning", label: "학습 현황" }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              backgroundColor: tab === key ? "#4f46e5" : "#ffffff",
              border: `1px solid ${tab === key ? "#4f46e5" : "#e2e8f0"}`,
              color: tab === key ? "#ffffff" : "#64748b",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div className="p-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
          {err}
        </div>
      )}

      {/* 차단기 경보 — 서버가 남긴 것. 교사가 조치할 대상이다. */}
      {tab === "rewards" && alerts.length > 0 && (
        <div className="p-3 rounded-xl mb-4" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}>
          <div className="flex items-center gap-1.5 text-sm font-bold mb-1" style={{ color: "#b45309" }}>
            <AlertTriangle size={15} /> 보상 차단기 경보 {alerts.length}건
          </div>
          {/* 🔴 **경보는 앱 단위 사건이라 남의 학급 것도 나에게 영향을 준다.** 차단기는
              `platformAppPolicies/{appId}.rewardsEnabled` 를 끄고 카운터도 `{day}_app_{appId}` 라
              학급을 안 가린다 — B반이 한도를 터뜨리면 A반 학생도 그 앱에서 못 받는다.
              그래서 **읽기를 학급으로 좁히면 정작 자기 교실이 멈춘 사건을 못 본다.**

              대신 **남의 학급 것은 숫자와 학급코드를 보여 주지 않는다.** 교사에게 필요한 정보는
              "이 앱이 멈췄다"이지 "저 반이 얼마를 받았다"가 아니다.
              (rules 는 여전히 전 학급 읽기를 허용한다 — 2026-08-21 의 의도된 결정이고 이 화면이
               좁힐 수 있는 것이 아니다. 여러 교사에게 열 때 다시 볼 자리로 진척 대장에 적어 둔다.) */}
          <ul className="text-xs" style={{ color: "#92400e" }}>
            {alerts.map((a) => {
              const mine = superAdmin || a.classCode === classCode;
              return (
                <li key={a.id}>
                  {appLabel(a.appId)} · {a.rewardType === "cash" ? "현금" : "쿠폰"}
                  {mine ? ` ${num(a.observed)} / 상한 ${num(a.cap)}` : " (다른 학급에서 한도에 닿았습니다)"}
                  {a.tripped
                    ? " — 이 앱의 지급이 자동으로 멈췄습니다(우리 반 학생도 못 받습니다. 알찬 관리자에게 알려 주세요)"
                    : " — 경고선을 넘었습니다"}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── 보상 지급 탭 ── */}
      {tab === "rewards" && rewards && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat icon={Activity} label="지급 건수" value={num(t.count)} />
            <Stat icon={Coins} label={`현금 합계(${getCurrencyUnit()})`} value={num(t.cash)} />
            <Stat icon={Ticket} label="쿠폰 합계(장)" value={num(t.coupon)} />
            <Stat icon={Undo2} label="되돌린 건수" value={`${num(t.clawedCount)}건`}
              sub={t.clawedCount > 0 ? `회수 ${num(t.recoveredCash)}${getCurrencyUnit()} / ${num(t.recoveredCoupon)}장` : ""} />
          </div>

          {t.corrupt > 0 && (
            <div className="p-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}>
              금액이 올바르지 않은 기록이 {t.corrupt}건 있습니다. 합계에서 제외했습니다 — 알찬 관리자에게 알려 주세요.
            </div>
          )}
          {rewards.truncated && (
            <div className="p-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
              읽기 상한({rewards.limit}건)에 닿았습니다. 아래 합계는 <b>읽은 {rewards.scanned}건 기준</b>이며 그날 전부가 아닙니다 —
              이만큼 지급이 났다면 화면 문제가 아니라 사고일 수 있으니 알찬 관리자에게 알려 주세요.
            </div>
          )}

          {rewards.students.length > 0 && (
            <div className="rounded-xl mb-4 overflow-hidden" style={CARD}>
              <div className="px-4 py-3 text-sm font-bold" style={{ color: "#0f172a", borderBottom: "1px solid #e2e8f0" }}>
                학생별 합계 · 이상치
                <span className="ml-2 text-xs font-normal" style={{ color: "#64748b" }}>
                  하루 상한 {num(caps.studentCashPerDay)}{getCurrencyUnit()} / {num(caps.studentCouponPerDay)}장 대비
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "#64748b", backgroundColor: "#f8fafc" }}>
                      <Th>학생</Th><Th right>현금</Th><Th right>쿠폰</Th><Th right>건수</Th><Th>수준</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rewards.students.map((s) => {
                      const st = LEVEL_STYLE[s.level] || LEVEL_STYLE.ok;
                      return (
                        <tr key={s.uid} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <Td>{nameOf(s.uid)}</Td>
                          <Td right>{num(s.cash)}</Td>
                          <Td right>{num(s.coupon)}</Td>
                          <Td right>{num(s.count)}{s.clawedCount > 0 ? ` (되돌림 ${s.clawedCount})` : ""}</Td>
                          <Td>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={st}>
                              {st.label} {pct(Math.max(s.cashRatio || 0, s.couponRatio || 0))}%
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={CARD}>
            <div className="px-4 py-3 text-sm font-bold" style={{ color: "#0f172a", borderBottom: "1px solid #e2e8f0" }}>
              지급 내역
            </div>
            {rewards.rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "#94a3b8" }}>
                이 날 지급된 학습앱 보상이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: "#64748b", backgroundColor: "#f8fafc" }}>
                      <Th>시각</Th><Th>학생</Th><Th>앱 · 성취</Th><Th right>금액</Th><Th>상태</Th><Th />
                    </tr>
                  </thead>
                  <tbody>
                    {rewards.rows.map((r) => {
                      const done = !!r.clawback;
                      const unit = r.rewardType === "cash" ? getCurrencyUnit() : "장";
                      return (
                        <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9", opacity: done ? 0.6 : 1 }}>
                          <Td>{r.createdAtMs ? new Date(r.createdAtMs).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "—"}</Td>
                          <Td>{nameOf(r.uid)}</Td>
                          <Td>
                            <div style={{ color: "#0f172a" }}>{r.label || r.achievementId}</div>
                            <div className="text-xs" style={{ color: "#94a3b8" }}>{appLabel(r.appId)}</div>
                          </Td>
                          <Td right>
                            <span style={{ color: r.rewardType === "cash" ? "#047857" : "#7c3aed", fontWeight: 700 }}>
                              {num(r.amount)}{unit}
                            </span>
                          </Td>
                          <Td>
                            {done ? (
                              <span className="text-xs" style={{ color: "#b91c1c" }}>
                                되돌림 {num(r.clawback.recoveredAmount)}{unit}
                                {r.clawback.shortfall > 0 ? ` (부족 ${num(r.clawback.shortfall)})` : ""}
                              </span>
                            ) : r.revocable === false ? (
                              <span className="text-xs" style={{ color: "#94a3b8" }}>되돌릴 수 없음</span>
                            ) : (
                              <span className="text-xs" style={{ color: "#64748b" }}>지급됨</span>
                            )}
                          </Td>
                          <Td>
                            {!done && (
                              <button
                                onClick={() => onClawback(r)}
                                disabled={busyGrant === r.id || (r.revocable === false && !superAdmin)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold"
                                style={{
                                  border: "1px solid #fecaca",
                                  backgroundColor: "#fff",
                                  color: "#b91c1c",
                                  cursor: busyGrant === r.id ? "wait" : (r.revocable === false && !superAdmin) ? "not-allowed" : "pointer",
                                  opacity: (r.revocable === false && !superAdmin) ? 0.4 : 1,
                                }}
                                title={r.revocable === false && !superAdmin ? "되돌릴 수 없도록 설정된 보상입니다" : "이 지급을 되돌립니다"}
                              >
                                <Undo2 size={12} /> {busyGrant === r.id ? "처리 중" : "되돌리기"}
                              </button>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 학습 현황 탭 ── */}
      {tab === "learning" && (
        <div className="rounded-xl overflow-hidden" style={CARD}>
          <div className="px-4 py-3 text-sm font-bold" style={{ color: "#0f172a", borderBottom: "1px solid #e2e8f0" }}>
            학생별 학습 시간
            <span className="ml-2 text-xs font-normal" style={{ color: "#64748b" }}>
              학생 {students.length}명 · 기록이 있는 학생만 표시
            </span>
          </div>
          {!classCode ? (
            // 슈퍼관리자는 지급 원장을 전 학급으로 볼 수 있지만, 학습현황은 **명단이 있어야**
            // 학생별로 돌 수 있다. "기록이 없다"로 뭉개면 없는 것과 못 보는 것이 같아진다.
            <p className="px-4 py-8 text-center text-sm" style={{ color: "#94a3b8" }}>
              학급이 지정되지 않은 계정이라 학습 현황을 불러올 수 없습니다.
            </p>
          ) : learningByStudent.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm" style={{ color: "#94a3b8" }}>
              {loading ? "불러오는 중…" : "이 날 기록된 학습이 없습니다."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#64748b", backgroundColor: "#f8fafc" }}>
                    <Th>학생</Th><Th right>학습 시간</Th><Th right>기록</Th><Th right>앉은 횟수</Th><Th>앱</Th>
                  </tr>
                </thead>
                <tbody>
                  {learningByStudent.map((s) => (
                    <tr key={s.uid} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <Td>{nameOf(s.uid)}</Td>
                      <Td right>
                        <span className="inline-flex items-center gap-1" style={{ color: "#0f172a", fontWeight: 700 }}>
                          <Clock size={12} color="#94a3b8" />{Math.round(s.sec / 60)}분
                        </span>
                      </Td>
                      <Td right>{num(s.events)}</Td>
                      <Td right>{num(s.sessions)}</Td>
                      <Td>
                        <div className="text-xs" style={{ color: "#64748b" }}>
                          {s.apps.map((a) => `${appLabel(a.appId)} ${Math.round((a.sec || 0) / 60)}분`).join(" · ")}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 요약 카드 하나. */
function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="p-3 rounded-xl" style={CARD}>
      <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: "#64748b" }}>
        <Icon size={13} /> {label}
      </div>
      <div className="text-lg font-bold" style={{ color: "#0f172a" }}>{value}</div>
      {sub ? <div className="text-xs mt-0.5" style={{ color: "#94a3b8" }}>{sub}</div> : null}
    </div>
  );
}

const Th = ({ children, right }) => (
  <th className="px-4 py-2 text-xs font-medium" style={{ textAlign: right ? "right" : "left" }}>{children}</th>
);
const Td = ({ children, right }) => (
  <td className="px-4 py-2.5" style={{ textAlign: right ? "right" : "left", color: "#334155" }}>{children}</td>
);
