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
      className="rounded-lg overflow-hidden mt-5"
      style={{
        backgroundColor: "#ffffff",
        border: "2px solid #3b82f6",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div
        className="flex justify-between items-center"
        style={{
          backgroundColor: "#3b82f6",
          color: "white",
          padding: "10px 12px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div className="font-semibold text-base">최근 거래</div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded cursor-pointer font-medium text-xs"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.3)",
            border: "none",
            padding: "4px 8px",
            color: "white",
          }}
        >
          {showAddForm ? "취소" : "+ 추가"}
        </button>
      </div>

      {/* 거래 추가 폼 */}
      {showAddForm && (
        <div
          className="p-4"
          style={{
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <form onSubmit={handleSubmit}>
            <div
              className="flex flex-col gap-2.5"
            >
              <div className="flex gap-2.5">
                <select
                  name="type"
                  value={newTransaction.type}
                  onChange={handleInputChange}
                  className="flex-1 p-2 rounded"
                  style={{
                    border: "1px solid #d1d5db",
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
                  className="flex-[2] p-2 rounded"
                  style={{
                    border: "1px solid #d1d5db",
                  }}
                />
              </div>
              <div className="flex gap-2.5">
                <input
                  type="text"
                  name="amount"
                  placeholder="금액"
                  value={newTransaction.amount}
                  onChange={handleInputChange}
                  className="flex-1 p-2 rounded"
                  style={{
                    border: "1px solid #d1d5db",
                  }}
                />
                <button
                  type="submit"
                  className="cursor-pointer font-medium rounded"
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
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
        className="flex"
        style={{
          borderBottom: "1px solid #e5e7eb",
          backgroundColor: "#f9fafb",
        }}
      >
        <button
          onClick={() => handleTabChange("all")}
          className="flex-1 p-2.5 cursor-pointer"
          style={{
            backgroundColor: activeTab === "all" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom: activeTab === "all" ? "2px solid #3b82f6" : "none",
            color: activeTab === "all" ? "#3b82f6" : "#6b7280",
            fontWeight: activeTab === "all" ? "600" : "400",
          }}
        >
          전체
        </button>
        <button
          onClick={() => handleTabChange("income")}
          className="flex-1 p-2.5 cursor-pointer"
          style={{
            backgroundColor: activeTab === "income" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom: activeTab === "income" ? "2px solid #3b82f6" : "none",
            color: activeTab === "income" ? "#3b82f6" : "#6b7280",
            fontWeight: activeTab === "income" ? "600" : "400",
          }}
        >
          수입
        </button>
        <button
          onClick={() => handleTabChange("expense")}
          className="flex-1 p-2.5 cursor-pointer"
          style={{
            backgroundColor:
              activeTab === "expense" ? "#ffffff" : "transparent",
            border: "none",
            borderBottom:
              activeTab === "expense" ? "2px solid #3b82f6" : "none",
            color: activeTab === "expense" ? "#3b82f6" : "#6b7280",
            fontWeight: activeTab === "expense" ? "600" : "400",
          }}
        >
          지출
        </button>
      </div>

      {/* 거래 목록 */}
      <div
        className="overflow-y-auto px-2.5"
        style={{
          maxHeight: "320px",
        }}
      >
        {filteredTransactions.length > 0 ? (
          filteredTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex justify-between items-center"
              style={{
                padding: "12px 5px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div>
                <div className="text-sm font-medium">
                  {transaction.title}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{
                    color: "#6b7280",
                  }}
                >
                  {transaction.date}
                </div>
              </div>
              <div
                className="font-semibold"
                style={{
                  fontSize: "15px",
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
            className="text-center text-sm"
            style={{
              padding: "30px 0",
              color: "#6b7280",
            }}
          >
            거래 내역이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
