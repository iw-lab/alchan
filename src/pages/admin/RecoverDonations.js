// src/pages/admin/RecoverDonations.js - 기부 내역 복구 유틸리티
import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { logger } from "../../utils/logger";
import {
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
} from "../../firebase";

export default function RecoverDonations() {
  const { user, userDoc } = useAuth();
  const [recovering, setRecovering] = useState(false);
  const [log, setLog] = useState([]);

  const addLog = (message) => {
    logger.log(message);
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const recoverDonationsFromCollection = async () => {
    if (!userDoc?.isAdmin && !userDoc?.isSuperAdmin) {
      alert("관리자만 복구 작업을 수행할 수 있습니다.");
      return;
    }

    const classCode = userDoc?.classCode;
    if (!classCode) {
      alert("학급 코드가 없습니다.");
      return;
    }

    if (!window.confirm(`${classCode} 학급의 기부 내역을 donations 컬렉션에서 복구하시겠습니까?`)) {
      return;
    }

    setRecovering(true);
    setLog([]);
    addLog("복구 작업 시작...");

    try {
      // 1. donations 컬렉션에서 해당 학급의 모든 기부 기록 조회
      addLog(`donations 컬렉션에서 ${classCode} 학급 데이터 조회 중...`);
      const donationsQuery = query(
        collection(db, "donations"),
        where("classCode", "==", classCode)
      );
      const donationsSnapshot = await getDocs(donationsQuery);

      if (donationsSnapshot.empty) {
        addLog("❌ donations 컬렉션에서 복구 가능한 데이터를 찾을 수 없습니다.");
        alert("복구 가능한 데이터가 없습니다.");
        setRecovering(false);
        return;
      }

      addLog(`✅ ${donationsSnapshot.size}개의 기부 기록을 찾았습니다.`);

      // 2. 기부 기록을 배열로 변환
      const donations = [];
      let totalAmount = 0;
      const userContributions = {};

      donationsSnapshot.forEach((donationDoc) => {
        const data = donationDoc.data();
        const donation = {
          userId: data.userId,
          userName: data.userName,
          amount: Number(data.amount) || 0,
          message: data.message || "",
          timestamp: data.timestamp,
          timestampISO: data.timestampISO || (data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString()),
          classCode: data.classCode,
        };

        donations.push(donation);
        totalAmount += donation.amount;

        // 사용자별 기여도 계산
        if (!userContributions[donation.userId]) {
          userContributions[donation.userId] = 0;
        }
        userContributions[donation.userId] += donation.amount;

        addLog(`  - ${donation.userName}: ${donation.amount}쿠폰`);
      });

      addLog(`📊 총 기부액: ${totalAmount}쿠폰`);
      addLog(`👥 기부자 수: ${Object.keys(userContributions).length}명`);

      // 3. goals 문서 업데이트
      const goalId = `${classCode}_goal`;
      const goalRef = doc(db, "goals", goalId);
      const goalDoc = await getDoc(goalRef);

      if (!goalDoc.exists()) {
        addLog("❌ 목표 문서가 존재하지 않습니다. 먼저 목표를 생성해주세요.");
        alert("목표 문서를 찾을 수 없습니다.");
        setRecovering(false);
        return;
      }

      addLog(`🎯 목표 문서 업데이트 중...`);
      const batch = writeBatch(db);

      // goals 문서에 donations 배열과 progress 업데이트
      batch.update(goalRef, {
        donations: donations,
        progress: totalAmount,
        donationCount: donations.length,
        updatedAt: serverTimestamp(),
        recoveredAt: serverTimestamp(),
        recoveredBy: user.uid,
      });

      // 4. 각 사용자의 myContribution 업데이트
      addLog(`👤 사용자 기여도 업데이트 중...`);
      for (const [userId, contribution] of Object.entries(userContributions)) {
        const userRef = doc(db, "users", userId);
        batch.update(userRef, {
          myContribution: contribution,
          updatedAt: serverTimestamp(),
        });
        addLog(`  - ${userId}: ${contribution}쿠폰`);
      }

      // 5. 일괄 커밋
      await batch.commit();
      addLog(`✅ 복구 완료!`);
      addLog(`📝 총 ${donations.length}개의 기부 기록 복구됨`);
      addLog(`💰 총 기부액: ${totalAmount}쿠폰`);

      alert(`기부 내역 복구 완료!\n총 ${donations.length}개 기록, ${totalAmount}쿠폰`);

    } catch (error) {
      console.error("복구 실패:", error);
      addLog(`❌ 오류 발생: ${error.message}`);
      alert(`복구 실패: ${error.message}`);
    } finally {
      setRecovering(false);
    }
  };

  if (!user) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        로그인이 필요합니다.
      </div>
    );
  }

  if (!userDoc?.isAdmin && !userDoc?.isSuperAdmin) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#ef4444" }}>
        관리자만 접근 가능합니다.
      </div>
    );
  }

  return (
    <div style={{
      padding: "20px",
      maxWidth: "800px",
      margin: "0 auto",
      fontFamily: "'Noto Sans KR', sans-serif"
    }}>
      <h2 style={{
        fontSize: "24px",
        fontWeight: "bold",
        color: "#ef4444",
        borderBottom: "2px solid #fecaca",
        paddingBottom: "10px",
        marginBottom: "20px"
      }}>
        🚨 기부 내역 복구 도구
      </h2>

      <div style={{
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: "8px",
        padding: "15px",
        marginBottom: "20px"
      }}>
        <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "10px" }}>
          ⚠️ 주의사항
        </h3>
        <ul style={{ fontSize: "14px", lineHeight: "1.6", paddingLeft: "20px" }}>
          <li>이 도구는 donations 컬렉션에서 기부 내역을 복구합니다.</li>
          <li>현재 goals 문서의 donations 배열이 덮어써집니다.</li>
          <li>복구 전에 반드시 현재 데이터를 백업하세요.</li>
          <li>관리자만 실행 가능합니다.</li>
        </ul>
      </div>

      <button
        onClick={recoverDonationsFromCollection}
        disabled={recovering}
        style={{
          width: "100%",
          padding: "15px",
          backgroundColor: recovering ? "#9ca3af" : "#ef4444",
          color: "white",
          border: "none",
          borderRadius: "8px",
          fontSize: "16px",
          fontWeight: "600",
          cursor: recovering ? "not-allowed" : "pointer",
          marginBottom: "20px"
        }}
      >
        {recovering ? "복구 중..." : "🔄 기부 내역 복구 시작"}
      </button>

      {log.length > 0 && (
        <div style={{
          backgroundColor: "#1f2937",
          color: "#f3f4f6",
          borderRadius: "8px",
          padding: "15px",
          maxHeight: "400px",
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "13px"
        }}>
          <h3 style={{
            fontSize: "14px",
            fontWeight: "600",
            marginBottom: "10px",
            color: "#60a5fa"
          }}>
            📋 작업 로그
          </h3>
          {log.map((entry, index) => (
            <div key={index} style={{ marginBottom: "5px" }}>
              {entry}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
