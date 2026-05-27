import React, { useState } from "react";
import { functions, httpsCallable } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";

const fmt = (n) => Number(n).toLocaleString();

export default function AuditAdminCash() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const run = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const fn = httpsCallable(functions, "auditAdminCash");
      const res = await fn({});
      setResult(res.data);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const admin = typeof isAdmin === "function" ? isAdmin() : isAdmin;

  return (
    <div style={{ maxWidth: 900, margin: "20px auto", padding: 20, fontFamily: "system-ui" }}>
      <h2>💰 관리자 cash 감사</h2>
      <p>최근 5,000건 transactions를 type별 / 큰 차감 순으로 분석합니다.</p>
      {!admin && <p style={{ color: "#c00" }}>관리자만 사용 가능합니다.</p>}
      <button
        onClick={run}
        disabled={loading || !admin}
        style={{ padding: "10px 20px", fontSize: 16, background: "#7c3aed", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
      >
        {loading ? "분석 중..." : "감사 실행"}
      </button>

      {err && <pre style={{ background: "#fee", padding: 10, marginTop: 16 }}>{err}</pre>}

      {result && (
        <div style={{ marginTop: 24 }}>
          <h3>요약</h3>
          <table cellPadding={8} style={{ borderCollapse: "collapse", border: "1px solid #ddd" }}>
            <tbody>
              <tr><td>현재 cash</td><td><b>{fmt(result.currentCash)}</b></td></tr>
              <tr><td>거래 수 (최근 5000건)</td><td>{result.transactionCount}</td></tr>
              <tr><td>합 (수입)</td><td style={{ color: "green" }}>{fmt(result.totalIn)}</td></tr>
              <tr><td>합 (지출)</td><td style={{ color: "red" }}>{fmt(result.totalOut)}</td></tr>
              <tr><td>net (수입+지출)</td><td>{fmt(result.net)}</td></tr>
              <tr><td>현재 cash − net (누락 금액)</td><td>{fmt(result.missingNetVsCash)}</td></tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>type별 누적</h3>
          <table cellPadding={8} style={{ borderCollapse: "collapse", border: "1px solid #ddd" }}>
            <thead><tr><th>type</th><th>건수</th><th>합계</th></tr></thead>
            <tbody>
              {result.sumByType.map((r) => (
                <tr key={r.type}>
                  <td>{r.type}</td>
                  <td>{r.count}</td>
                  <td style={{ color: r.sum < 0 ? "red" : "green", textAlign: "right" }}>{fmt(r.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>큰 차감 거래 top 30</h3>
          <table cellPadding={6} style={{ borderCollapse: "collapse", border: "1px solid #ddd", fontSize: 13 }}>
            <thead><tr><th>amount</th><th>type</th><th>description</th><th>timestamp</th></tr></thead>
            <tbody>
              {result.topNegatives.map((t) => (
                <tr key={t.id}>
                  <td style={{ color: "red", textAlign: "right" }}>{fmt(t.amount)}</td>
                  <td>{t.type}</td>
                  <td>{t.description}</td>
                  <td>{t.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
