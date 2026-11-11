// src/components/LoginCardsSheet.js — 학생 로그인 카드(A4 한 쪽 8장). 오려서 나눠 준다.
import React from "react";
import { QRCodeSVG } from "qrcode.react";
import PrintSheet from "./PrintSheet";
import { buildLoginCards, paginate } from "../utils/loginCards";

const cell = {
  border: "1.5px dashed #94a3b8",
  borderRadius: 10,
  padding: "10px 12px",
  display: "flex",
  gap: 10,
  alignItems: "center",
  height: "62mm",
  boxSizing: "border-box",
};
const row = { display: "flex", alignItems: "baseline", gap: 6, fontSize: 13, lineHeight: 1.5 };
const label = { color: "#475569", minWidth: 58, fontSize: 11 };
const value = { fontWeight: 700, fontSize: 17, letterSpacing: 0.5, fontFamily: "ui-monospace, Menlo, Consolas, monospace" };

export default function LoginCardsSheet({ students, classCode, siteUrl, onDone }) {
  const cards = buildLoginCards(students, { classCode });
  const url = siteUrl || `${window.location.origin}/login`;
  return (
    <PrintSheet onDone={onDone}>
      {paginate(cards, 8).map((page, pi) => (
        <div key={pi} className="print-page" style={{ padding: "6mm", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4mm" }}>
          {page.map((c) => (
            <div key={c.key} className="avoid-break" style={cell}>
              <div style={{ flex: "0 0 auto", textAlign: "center" }}>
                <QRCodeSVG value={url} size={84} />
                <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>찍으면 알찬이 열려요</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
                  {c.number != null ? `${c.number}번 ` : ""}{c.name || "이름"}
                </div>
                <div style={row}><span style={label}>아이디</span><span style={value}>{c.loginId}</span></div>
                <div style={row}><span style={label}>비밀번호</span><span style={{ flex: 1, borderBottom: "1px solid #94a3b8", height: 18 }} /></div>
                <div style={row}><span style={label}>학급코드</span><span style={value}>{c.classCode}</span></div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 6, wordBreak: "break-all" }}>{url.replace(/^https?:\/\//, "")}</div>
                <div style={{ fontSize: 9, color: "#475569" }}>비밀번호는 나만 알게 적고, 남에게 보여 주지 않아요.</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </PrintSheet>
  );
}
