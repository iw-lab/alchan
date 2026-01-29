import React, { useState } from "react";

export default function TransactionList({ transactions, addTransaction }) {
  const [activeTab, setActiveTab] = useState("all"); // 기본 탭은 "all"
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: "수입",
    title: "",
    amount: "",
  });

  // 탭 전환 핸들러
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // 새 거래 추가 폼 필드 변경 핸들러
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTransaction({
      ...newTransaction,
      [name]: name === "amount" ? value.replace(/[^0-9]/g, "") : value,
    });
  };

  // 새 거래 추가 제출 핸들러
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!newTransaction.title || !newTransaction.amount) {
      alert("내용과 금액을 모두 입력해주세요.");
      return;
    }

    const amount = parseInt(newTransaction.amount);
    if (isNaN(amount) || amount <= 0) {
      alert("금액은 0보다 큰 숫자여야 합니다.");
      return;
    }

    // 상위 컴포넌트의 addTransaction 함수 호출
    addTransaction({
      type: newTransaction.type,
      title: newTransaction.title,
      amount: newTransaction.type === "수입" ? amount : -amount,
    });

    // 폼 초기화
    setNewTransaction({
      type: "수입",
      title: "",
      amount: "",
    });
    setShowAddForm(false);
  };

  // 거래 필터링
  const filteredTransactions = transactions.filter((transaction) => {
    if (activeTab === "all") return true;
    if (activeTab === "income") return transaction.type === "수입";
    if (activeTab === "expense") return transaction.type === "지출";
    return true;
  });

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        border: "2px solid #3b82f6",
        overflow: "hidden",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        marginTop: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "#3b82f6",
          color: "white",
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontWeight: "600", fontSize: "16px" }}>최근 거래</div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            border: "none",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "12px",
            fontWeight: "500",
            color: "white",
            cursor: "pointer",
          }}
        >
          {showAddForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {/* 거래 추가 폼 */}
      {showAddForm && (
        <div
          style={{
            padding: "15px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", gap: "10px" }}>
                <select
                  name="type"
                  value={newTransaction.type}
                  onChange={handleInputChange}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    flex: "1",
                  }}
                >
                  <option value="수입">수입</option>
                  <option value="지출">지출</option>
                </select>
                <input
                  type="text"
                  name="title"
                  placeholder="내용"
                  value={newTransaction.title}
                  onChange={handleInputChange}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    flex: "2",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  name="amount"
                  placeholder="금액"
                  value={newTransaction.amount}
                  onChange={handleInputChange}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #d1d5db",
                    flex: "1",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "500",
                  }}
                >
                  저장
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 탭 메뉴 */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        <button
          onClick={() => handleTabChange("all")}
          style={{
            flex: "1",
            padding: "10px",
            backgroundColor: activeTab === "all" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom: activeTab === "all" ? "2px solid #3b82f6" : "none",
            color: activeTab === "all" ? "#3b82f6" : "#6b7280",
            fontWeight: activeTab === "all" ? "600" : "400",
            cursor: "pointer",
          }}
        >
          전체
        </button>
        <button
          onClick={() => handleTabChange("income")}
          style={{
            flex: "1",
            padding: "10px",
            backgroundColor: activeTab === "income" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom: activeTab === "income" ? "2px solid #3b82f6" : "none",
            color: activeTab === "income" ? "#3b82f6" : "#6b7280",
            fontWeight: activeTab === "income" ? "600" : "400",
            cursor: "pointer",
          }}
        >
          수입
        </button>
        <button
          onClick={() => handleTabChange("expense")}
          style={{
            flex: "1",
            padding: "10px",
            backgroundColor:
              activeTab === "expense" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom:
              activeTab === "expense" ? "2px solid #3b82f6" : "none",
            color: activeTab === "expense" ? "#3b82f6" : "#6b7280",
            fontWeight: activeTab === "expense" ? "600" : "400",
            cursor: "pointer",
          }}
        >
          지출
        </button>
      </div>

      {/* 거래 목록 */}
      <div
        style={{
          maxHeight: "320px",
          overflowY: "auto",
          padding: "0 10px",
        }}
      >
        {filteredTransactions.length > 0 ? (
          filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 5px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: "500" }}>
                  {transaction.title}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6b7280",
                    marginTop: "2px",
                  }}
                >
                  {transaction.date}
                </div>
              </div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: "600",
                  color: transaction.type === "수입" ? "#10b981" : "#ef4444",
                }}
              >
                {transaction.type === "수입" ? "+" : "-"}
                {Math.abs(transaction.amount).toLocaleString()}원
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              padding: "30px 0",
              textAlign: "center",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            거래 내역이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
