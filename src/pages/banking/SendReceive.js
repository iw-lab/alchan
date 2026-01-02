// src/SendReceive.js
import { getDoc } from "firebase/firestore";
import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  db,
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  setDoc,
  increment,
} from "../../firebase";
import { logActivity, LOG_TYPES } from "../../database"; // logActivity와 LOG_TYPES 가져오기
import { usePolling } from "../../hooks/usePolling";
import "./SendReceive.css";

const SendReceive = ({ classCode }) => {
  const { user, userDoc, refreshUserDocument, isAdmin } = useAuth();
  const [amount, setAmount] = useState("");
  const [actionType, setActionType] = useState("deposit");
  const [depositSource, setDepositSource] = useState("personal"); // 'personal', 'nationalTreasury', 'mint'
  const [withdrawDestination, setWithdrawDestination] = useState("personal"); // 'personal', 'nationalTreasury'
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [userCash, setUserCash] = useState(userDoc?.cash || 0);

  // --- 자산 정보 계산 로직 ---
  // 보유 주식 수 계산: userDoc.stocks 객체의 모든 값을 합산합니다.
  const userStocks = userDoc?.stocks
    ? Object.values(userDoc.stocks).reduce((sum, count) => sum + count, 0)
    : 0;
    
  // 보유 쿠폰 수 계산: userDoc.coupons 배열의 길이를 확인합니다.
  const userCoupons = userDoc?.coupons?.length || 0;
  
  // 은행 계좌 잔액 계산: userDoc.accounts 객체의 모든 잔액을 합산합니다.
  const bankBalance = userDoc?.accounts 
    ? Object.values(userDoc.accounts).reduce((sum, acc) => sum + (acc.balance || 0), 0) 
    : 0;

  // 총 자산 계산 (현금 + 은행 예금)
  const totalAssets = (userDoc?.cash || 0) + bankBalance;
  // --- 자산 정보 계산 로직 끝 ---


  // 학급 금고와 국세청 모두 nationalTreasuries 컬렉션 사용 (통일)
  const treasuryRef = doc(db, "nationalTreasuries", classCode);
  const nationalTreasuryRef = doc(db, "nationalTreasuries", classCode);

  // 금고 잔액 폴링 (nationalTreasuries 컬렉션의 totalAmount 필드 사용)
  const fetchTreasuryBalance = async () => {
    if (!classCode) return;

    try {
      const docSnap = await getDoc(treasuryRef);
      if (docSnap.exists()) {
        setTreasuryBalance(docSnap.data().totalAmount || 0);
      } else {
        // 국고 문서가 없으면 생성 (NationalTaxService.js의 DEFAULT_TREASURY_DATA와 동일)
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
        setTreasuryBalance(0);
      }
    } catch (error) {
      console.error("금고 잔액 조회 중 오류:", error);
      setFeedback({
        type: "error",
        message: "금고 잔액을 가져오는데 실패했습니다.",
      });
    }
  };

  const { refetch: refetchTreasuryBalance } = usePolling(fetchTreasuryBalance, { interval: 300000, enabled: !!classCode });

  useEffect(() => {
    setUserCash(userDoc?.cash || 0);
  }, [userDoc?.cash]);

  const handleTransaction = async () => {
    if (!user || !userDoc || !classCode) {
      setFeedback({ type: "error", message: "필수 정보(로그인, 학급코드)가 없습니다." });
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: "error", message: "유효한 금액을 입력하세요." });
      return;
    }

    setIsLoading(true);
    setFeedback({ type: "", message: "" });

    const userRef = doc(db, "users", user.uid);

    try {
      let logInfo = {}; // 로그 정보를 담을 변수

      await runTransaction(db, async (transaction) => {
        const latestUserDocSnap = await transaction.get(userRef);
        const latestTreasurySnap = await transaction.get(treasuryRef);
        
        if (!latestUserDocSnap.exists()) {
          throw new Error("사용자 정보를 찾을 수 없습니다.");
        }

        const latestUserCash = latestUserDocSnap.data().cash || 0;
        const currentTreasuryBalance = latestTreasurySnap.exists() ? latestTreasurySnap.data().totalAmount || 0 : 0;
        
        if (actionType === "deposit") {
            let sourceText = '';
            if (depositSource === "personal") {
                if (latestUserCash < numAmount) throw new Error("입금할 금액이 현재 보유 현금보다 많습니다.");
                transaction.update(userRef, { cash: increment(-numAmount) });
                sourceText = '개인 현금';
            } else if (depositSource === "nationalTreasury") {
                if (!isAdmin?.()) throw new Error("국고 이체는 관리자만 가능합니다.");
                const latestNationalTreasurySnap = await transaction.get(nationalTreasuryRef);
                const currentNationalBalance = latestNationalTreasurySnap?.exists() ? latestNationalTreasurySnap.data().totalAmount || 0 : 0;
                if (currentNationalBalance < numAmount) throw new Error("국고 잔액이 부족합니다.");
                transaction.update(nationalTreasuryRef, { totalAmount: increment(-numAmount), lastUpdated: serverTimestamp() });
                sourceText = '국고';
            } else if (depositSource === "mint") {
                if (!isAdmin?.()) throw new Error("신규 발행은 관리자만 가능합니다.");
                sourceText = '신규 발행';
            }
            
            transaction.update(treasuryRef, { totalAmount: increment(numAmount), lastUpdated: serverTimestamp() });
            
            // 로그 정보 저장
            logInfo = {
                type: LOG_TYPES.TREASURY_DEPOSIT,
                description: `${sourceText}에서 학급 금고로 ${numAmount.toLocaleString()}원 입금했습니다.`,
                metadata: { amount: numAmount, source: depositSource, treasuryBalance: currentTreasuryBalance + numAmount },
            };

        } else if (actionType === "withdraw") {
            if (currentTreasuryBalance < numAmount) throw new Error("출금할 금액이 금고 잔액보다 많습니다.");
            if (!isAdmin?.() && !userDoc.canWithdrawTreasury) throw new Error("금고에서 출금할 권한이 없습니다.");

            transaction.update(treasuryRef, { totalAmount: increment(-numAmount), lastUpdated: serverTimestamp() });

            let destinationText = '';
            if (withdrawDestination === "personal") {
                transaction.update(userRef, { cash: increment(numAmount) });
                destinationText = '개인 현금';
            } else if (withdrawDestination === "nationalTreasury") {
                if (!isAdmin?.()) throw new Error("국세청 이체는 관리자만 가능합니다.");
                transaction.update(nationalTreasuryRef, { totalAmount: increment(numAmount), otherTaxRevenue: increment(numAmount), lastUpdated: serverTimestamp() });
                destinationText = '국세청';
            }

            // 로그 정보 저장
            logInfo = {
                type: LOG_TYPES.TREASURY_WITHDRAW,
                description: `학급 금고에서 ${destinationText}(으)로 ${numAmount.toLocaleString()}원 출금했습니다.`,
                metadata: { amount: numAmount, destination: withdrawDestination, treasuryBalance: currentTreasuryBalance - numAmount },
            };
        }
      });
      
      // 트랜잭션 성공 후 통합 로그 기록
      if (logInfo.type) {
        await logActivity(user.uid, logInfo.type, logInfo.description, logInfo.metadata);
      }

      setFeedback({ type: "success", message: "거래가 성공적으로 완료되었습니다." });
      setAmount("");
      if (refreshUserDocument) refreshUserDocument();
      refetchTreasuryBalance();

    } catch (error) {
      console.error("거래 처리 중 오류:", error);
      setFeedback({ type: "error", message: `오류: ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="send-receive-panel">
      <h3>학급 금고 관리 (학급: {classCode})</h3>
      
      {/* --- 수정된 자산 표시 부분 --- */}
      <div className="balance-display asset-summary">
        <div className="asset-row">
            <span className="asset-label">내 현금:</span>
            <span className="asset-value">{userCash.toLocaleString()} 원</span>
        </div>
        <div className="asset-row">
            <span className="asset-label">총 자산 (현금+예금):</span>
            <span className="asset-value">{totalAssets.toLocaleString()} 원</span>
        </div>
        <div className="asset-row">
            <span className="asset-label">보유 주식:</span>
            <span className="asset-value">{userStocks} 주</span>
        </div>
        <div className="asset-row">
            <span className="asset-label">보유 쿠폰:</span>
            <span className="asset-value">{userCoupons} 개</span>
        </div>
        <hr />
        <div className="asset-row treasury">
            <span className="asset-label">학급 금고 잔액:</span>
            <span className="asset-value">{treasuryBalance.toLocaleString()} 원</span>
        </div>
      </div>
      {/* --- 자산 표시 부분 끝 --- */}

      <div className="action-selector">
        <button
          onClick={() => setActionType("deposit")}
          className={actionType === "deposit" ? "active" : ""}
          disabled={isLoading}
        >
          입금 (보내기)
        </button>
        <button
          onClick={() => setActionType("withdraw")}
          className={actionType === "withdraw" ? "active" : ""}
          disabled={isLoading}
        >
          출금 (가져오기)
        </button>
      </div>

      {actionType === 'deposit' && (
        <div className="source-selector">
          <strong>어디에서 보내시겠습니까?</strong>
          <label>
            <input type="radio" name="source" value="personal" checked={depositSource === "personal"} onChange={(e) => setDepositSource(e.target.value)} disabled={isLoading} />
            내 현금
          </label>
          {isAdmin?.() && (
            <>
              <label>
                <input type="radio" name="source" value="nationalTreasury" checked={depositSource === "nationalTreasury"} onChange={(e) => setDepositSource(e.target.value)} disabled={isLoading}/>
                국세청 (국고)
              </label>
              <label>
                <input type="radio" name="source" value="mint" checked={depositSource === "mint"} onChange={(e) => setDepositSource(e.target.value)} disabled={isLoading} />
                신규 발행
              </label>
            </>
          )}
        </div>
      )}

      {actionType === "withdraw" && (
        <div className="destination-selector">
          <strong>어디로 가져오시겠습니까?</strong>
          <label>
            <input type="radio" name="destination" value="personal" checked={withdrawDestination === "personal"} onChange={(e) => setWithdrawDestination(e.target.value)} disabled={isLoading} />
            내 현금으로
          </label>
          {isAdmin?.() && (
            <label>
              <input type="radio" name="destination" value="nationalTreasury" checked={withdrawDestination === "nationalTreasury"} onChange={(e) => setWithdrawDestination(e.target.value)} disabled={isLoading} />
              국세청으로
            </label>
          )}
        </div>
      )}

      <div className="transaction-form">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="금액 입력"
          min="0"
          className="amount-input"
          disabled={isLoading}
        />
        <button
          onClick={handleTransaction}
          disabled={isLoading || !amount}
          className="submit-button"
        >
          {isLoading ? "처리 중..." : "실행하기"}
        </button>
      </div>

      {feedback.message && (
        <p className={`feedback-message ${feedback.type === "error" ? "error" : "success"}`}>
          {feedback.message}
        </p>
      )}
      <div className="info-text">
        <p><strong>입금:</strong> 선택한 자금 출처에서 학급 공용 금고로 돈을 보냅니다.</p>
        <p><strong>출금:</strong> 학급 공용 금고의 돈을 개인 현금 또는 국세청(국고)으로 보냅니다. (국세청 이체는 관리자만 가능)</p>
      </div>
    </div>
  );
};

export default SendReceive;