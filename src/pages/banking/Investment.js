// src/Investment.js
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext"; // AuthContext에서 user 정보 가져오기
import { formatKoreanCurrency } from '../../utils/numberFormatter';
import { usePolling } from '../../hooks/usePolling';

import { logger } from "../../utils/logger";
// Firestore 관련 함수 임포트
import {
  db,
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  // addDoc, // 더 이상 직접 사용하지 않음 (transaction.set 사용)
  getDoc,
  getDocs,
  setDoc,
  increment,
  // query, orderBy, limit 등은 firebase/firestore에서 직접 가져옴
} from "../../firebase"; // firebase.js 경로 확인

// ⭐️ query, orderBy, limit, Timestamp를 firebase/firestore에서 직접 가져옵니다.
import {
  query,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";

// Investment 컴포넌트
const Investment = ({ classCode }) => {
  // classCode를 prop으로 받음
  const { user, userDoc, isAdmin, refreshUserDocument } = useAuth(); // 현재 사용자 정보 및 isAdmin 함수 사용

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [adminCash, setAdminCash] = useState(userDoc?.cash || 0); // 관리자(현재 사용자)의 현금
  const [transferAmount, setTransferAmount] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [lastTransactions, setLastTransactions] = useState([]);

  // Firestore 경로 참조 (classCode가 있을 때만 정의)
  // NationalTaxService.js와 동일한 컬렉션 사용: nationalTreasuries
  let treasuryRef = null;
  let treasuryTransactionsColRef = null;
  if (classCode) {
    treasuryRef = doc(db, "nationalTreasuries", classCode);
    treasuryTransactionsColRef = collection(
      db,
      "classes",
      classCode,
      "treasuryTransactions"
    );
  }

  // 사용자(관리자) 현금 상태 업데이트 (userDoc 변경 감지)
  useEffect(() => {
    setAdminCash(userDoc?.cash || 0);
  }, [userDoc?.cash]);

  // 국고 잔액 폴링
  const { data: treasuryData } = usePolling(
    async () => {
      if (!classCode || !treasuryRef) return null;

      const docSnap = await getDoc(treasuryRef);
      if (docSnap.exists()) {
        // NationalTaxService.js와 동일하게 totalAmount 필드 사용
        return docSnap.data().totalAmount || 0;
      } else {
        try {
          // NationalTaxService.js의 DEFAULT_TREASURY_DATA와 동일한 구조로 생성
          await setDoc(treasuryRef, {
            totalAmount: 0,
            stockTaxRevenue: 0,
            stockCommissionRevenue: 0,
            realEstateTransactionTaxRevenue: 0,
            realEstateAnnualTaxRevenue: 0,
            incomeTaxRevenue: 0,
            corporateTaxRevenue: 0,
            otherTaxRevenue: 0,
            classCode: classCode,
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
          });
          logger.log(`학급 [${classCode}]의 국고가 없어 새로 생성했습니다.`);
          return 0;
        } catch (error) {
          console.error("국고 생성 중 오류:", error);
          setMessage({
            type: "error",
            text: "국고 정보를 초기화하는 데 실패했습니다.",
          });
          return 0;
        }
      }
    },
    { interval: 15 * 60 * 1000, enabled: !!classCode && !!treasuryRef, deps: [classCode] } // 🔥 [비용 최적화] 5분 → 15분
  );

  // 최근 거래 내역 폴링
  const { data: transactionsData } = usePolling(
    async () => {
      if (!classCode || !treasuryTransactionsColRef) return [];

      const q = query(
        treasuryTransactionsColRef,
        orderBy("timestamp", "desc"),
        limit(5)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    },
    { interval: 15 * 60 * 1000, enabled: !!classCode && !!treasuryTransactionsColRef, deps: [classCode] } // 🔥 [비용 최적화] 5분 → 15분
  );

  // treasuryData와 transactionsData를 state에 반영
  useEffect(() => {
    if (treasuryData !== undefined && treasuryData !== null) {
      setTreasuryBalance(treasuryData);
    } else if (!classCode || !treasuryRef) {
      setTreasuryBalance(0);
    }
  }, [treasuryData, classCode, treasuryRef]);

  useEffect(() => {
    if (transactionsData !== undefined && transactionsData !== null) {
      setLastTransactions(Array.isArray(transactionsData) ? transactionsData : []);
      setIsLoading(false);
    } else if (!classCode || !treasuryTransactionsColRef) {
      setLastTransactions([]);
      setIsLoading(false);
    }
  }, [transactionsData, classCode, treasuryTransactionsColRef]);

  // 국고 ↔ 관리자 현금 이체 함수
  const handleTreasuryTransfer = async (e, operationType) => {
    e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!isAdmin()) {
      setMessage({
        text: "이 작업은 관리자만 수행할 수 있습니다.",
        type: "error",
      });
      return;
    }

    if (
      !user ||
      !userDoc ||
      !classCode ||
      !treasuryRef ||
      !treasuryTransactionsColRef
    ) {
      setMessage({
        text: "사용자 또는 학급 정보가 유효하지 않습니다.",
        type: "error",
      });
      return;
    }

    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      setMessage({ text: "유효한 금액을 입력해주세요.", type: "error" });
      return;
    }

    setIsLoading(true);
    const adminUserRef = doc(db, "users", user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const latestTreasurySnap = await transaction.get(treasuryRef);
        const latestAdminSnap = await transaction.get(adminUserRef);

        if (!latestAdminSnap.exists())
          throw new Error("관리자(사용자) 정보를 찾을 수 없습니다.");

        const currentTreasuryBalance = latestTreasurySnap.exists()
          ? latestTreasurySnap.data().totalAmount || 0
          : 0;
        const currentAdminCash = latestAdminSnap.data().cash || 0;

        let reason = "";
        let newTreasuryBalance, newAdminCash;

        if (operationType === "withdraw_to_admin") {
          // 국고 -> 관리자 현금
          reason = "투자 자금 인출 (관리자)";
          if (currentTreasuryBalance < amount)
            throw new Error("국고 잔액이 부족합니다.");
          newTreasuryBalance = currentTreasuryBalance - amount;
          newAdminCash = currentAdminCash + amount;
          transaction.update(treasuryRef, {
            totalAmount: increment(-amount),
            lastUpdated: serverTimestamp(),
          });
          transaction.update(adminUserRef, {
            cash: increment(amount),
            updatedAt: serverTimestamp(),
          });
        } else if (operationType === "deposit_from_admin") {
          // 관리자 현금 -> 국고
          reason = "투자 수익 입금 (관리자)";
          if (currentAdminCash < amount)
            throw new Error("관리자 현금이 부족합니다.");
          newTreasuryBalance = currentTreasuryBalance + amount;
          newAdminCash = currentAdminCash - amount;
          transaction.update(adminUserRef, {
            cash: increment(-amount),
            updatedAt: serverTimestamp(),
          });
          transaction.update(treasuryRef, {
            totalAmount: increment(amount),
            lastUpdated: serverTimestamp(),
          });
        } else {
          throw new Error("잘못된 작업 유형입니다.");
        }

        // 거래 기록 추가 (새 문서 ID 자동 생성)
        const newTransactionRef = doc(treasuryTransactionsColRef);
        transaction.set(newTransactionRef, {
          type: operationType,
          actorId: user.uid,
          actorDisplayName: userDoc.name || userDoc.nickname || user.email,
          amount: amount,
          reason: reason,
          classCode: classCode,
          timestamp: serverTimestamp(),
          treasuryBalanceBefore: currentTreasuryBalance,
          treasuryBalanceAfter: newTreasuryBalance,
          adminCashBefore: currentAdminCash,
          adminCashAfter: newAdminCash,
        });
      });

      setMessage({
        text: `${operationType === "withdraw_to_admin" ? "인출" : "입금"
          } 성공! (${amount.toLocaleString()}원)`,
        type: "success",
      });
      setTransferAmount("");
      if (refreshUserDocument) refreshUserDocument();
    } catch (error) {
      console.error("자금 이체 오류:", error);
      setMessage({ text: `오류: ${error.message}`, type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!classCode) {
    return (
      <div className="investment-container" style={styles.container}>
        <p>학급 정보를 불러오는 중이거나, 학급 코드가 할당되지 않았습니다.</p>
      </div>
    );
  }

  if (
    isLoading &&
    treasuryBalance === 0 &&
    lastTransactions.length === 0 &&
    !message.text
  ) {
    return (
      <div className="investment-container" style={styles.container}>
        데이터를 불러오는 중입니다...
      </div>
    );
  }

  if (!isAdmin()) {
    return (
      <div className="investment-container" style={styles.container}>
        <p>이 기능은 관리자만 사용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="investment-container" style={styles.container}>
      <h2>투자 관리 (국고 ↔ 관리자 현금)</h2>
      <p style={styles.classCodeDisplay}>학급 코드: {classCode}</p>

      {message.text && (
        <div
          style={{
            ...styles.messageBox,
            borderColor: message.type === "success" ? "#c3e6cb" : "#f5c6cb",
            backgroundColor: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={styles.balanceDisplay}>
        <p>
          현재 국고 잔액:{" "}
          <span style={styles.balanceValue}>
            {treasuryBalance.toLocaleString()}원
          </span>
        </p>
        <p>
          관리자 (내) 현금:{" "}
          <span style={styles.balanceValue}>
            {adminCash.toLocaleString()}원
          </span>
        </p>
      </div>

      <form
        onSubmit={(e) => handleTreasuryTransfer(e, "withdraw_to_admin")}
        style={styles.form}
      >
        <h3>국고에서 투자 자금 인출 (→ 내 현금으로)</h3>
        <div style={styles.formGroup}>
          <label htmlFor="withdrawAmount" style={styles.label}>
            인출 금액:
          </label>
          <input
            type="number"
            id="withdrawAmount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            required
            min="1"
            placeholder="인출할 금액"
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          style={{ ...styles.actionButton, backgroundColor: "#007bff" }}
          disabled={isLoading}
        >
          {isLoading ? "처리중..." : "자금 인출 실행"}
        </button>
      </form>

      <hr style={styles.divider} />

      <form
        onSubmit={(e) => handleTreasuryTransfer(e, "deposit_from_admin")}
        style={styles.form}
      >
        <h3>투자 수익 국고 입금 (내 현금에서 →)</h3>
        <div style={styles.formGroup}>
          <label htmlFor="depositAmount" style={styles.label}>
            입금 금액:
          </label>
          <input
            type="number"
            id="depositAmount"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            required
            min="1"
            placeholder="국고로 입금할 금액"
            style={styles.input}
            disabled={isLoading}
          />
        </div>
        <button type="submit" style={styles.actionButton} disabled={isLoading}>
          {isLoading ? "처리중..." : "국고 입금 실행"}
        </button>
      </form>

      <hr style={styles.divider} />
      <div>
        <h3>최근 국고 거래 내역 (관리자 관련)</h3>
        {lastTransactions.length === 0 && !isLoading ? (
          <p>최근 거래 내역이 없습니다.</p>
        ) : (
          <ul style={styles.transactionList}>
            {lastTransactions.map((tx) => (
              <li key={tx.id} style={styles.transactionItem}>
                <span style={styles.transactionItem_span}>
                  {tx.timestamp && tx.timestamp.toDate
                    ? new Date(tx.timestamp.toDate()).toLocaleString()
                    : "날짜 정보 없음"}
                </span>
                <span style={styles.transactionItem_span}>
                  {" "}
                  [
                  {tx.type === "withdraw_to_admin"
                    ? "인출(관리자)"
                    : tx.type === "deposit_from_admin"
                      ? "입금(관리자)"
                      : tx.type || "알 수 없음"}
                  ]
                </span>
                <span style={styles.transactionItem_span}>
                  {" "}
                  {tx.actorDisplayName || "정보 없음"}
                </span>
                <span style={styles.transactionItem_span}>
                  : {tx.amount?.toLocaleString()}원
                </span>
                {tx.reason && (
                  <span style={styles.transactionItem_span}>
                    {" "}
                    ({tx.reason})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <hr style={styles.divider} />

      <div>
        <h3>실제 투자 집행</h3>
        <p>위에서 인출한 자금으로 아래 링크를 통해 실제 투자를 진행하세요.</p>
        <div style={styles.linkContainer}>
          <Link to="/stock-trading" style={styles.linkButton}>
            주식 거래소 가기
          </Link>
          <Link to="/banking" style={styles.linkButton}>
            한국 은행 가기
          </Link>
        </div>
      </div>
    </div>
  );
};

// 간단한 인라인 스타일
const styles = {
  container: {
    maxWidth: "800px",
    margin: "20px auto",
    padding: "20px",
    border: "1px solid rgba(0, 255, 242, 0.2)",
    borderRadius: "20px",
    backgroundColor: "#1a1a2e",
    fontFamily: "'Noto Sans KR', sans-serif",
    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
    color: "#e8e8ff",
  },
  classCodeDisplay: {
    textAlign: "center",
    marginBottom: "15px",
    fontSize: "0.9em",
    color: "#00fff2",
    backgroundColor: "rgba(0, 255, 242, 0.1)",
    padding: "5px",
    borderRadius: "4px",
    border: "1px solid rgba(0, 255, 242, 0.2)",
  },
  balanceDisplay: {
    marginBottom: "20px",
    padding: "20px",
    backgroundColor: "#13131f",
    borderRadius: "16px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    boxShadow: "inset 0 2px 10px rgba(0, 0, 0, 0.3)",
  },
  balanceValue: { fontWeight: "bold", color: "#00fff2", textShadow: "0 0 10px rgba(0, 255, 242, 0.3)" },
  form: {
    marginBottom: "20px",
    padding: "20px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "16px",
    backgroundColor: "#13131f",
  },
  formGroup: { marginBottom: "15px" },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "500",
    color: "#94a3b8",
  },
  input: {
    width: "calc(100% - 22px)", // 패딩 고려
    padding: "10px",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    fontSize: "1rem",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    color: "white",
  },
  actionButton: {
    padding: "10px 20px",
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    color: "#34d399",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: "bold",
    transition: "background-color 0.2s ease, opacity 0.2s ease, transform 0.2s ease",
    boxShadow: "0 0 10px rgba(16, 185, 129, 0.1)",
  },
  divider: { margin: "30px 0", border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.1)" },
  messageBox: {
    padding: "15px",
    marginBottom: "20px",
    borderRadius: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    fontSize: "1rem",
  },
  linkContainer: {
    marginTop: "15px",
    display: "flex",
    gap: "15px",
  },
  linkButton: {
    display: "inline-block",
    padding: "10px 15px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "white",
    textDecoration: "none",
    borderRadius: "8px",
    textAlign: "center",
    transition: "background-color 0.2s ease",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
  transactionList: {
    listStyleType: "none",
    paddingLeft: 0,
    maxHeight: "200px",
    overflowY: "auto",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "8px",
    padding: "10px",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  transactionItem: {
    padding: "8px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    fontSize: "0.9em",
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
    color: "#a0a0c0",
  },
  transactionItem_span: {
    // 최근 거래 내역의 각 span 태그에 오른쪽 여백을 주기 위한 스타일
    marginRight: "5px",
  },
};

export default Investment;
