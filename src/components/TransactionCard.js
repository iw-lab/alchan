import React, { useState, useEffect } from "react";
import { formatKoreanCurrency } from './utils/numberFormatter';
import { useAuth } from "./contexts/AuthContext"; // 올바른 경로

const TransactionCard = ({ title, amount, color, showFullCard = false }) => {
  // TransactionCard가 두 가지 모드로 작동하도록 설정
  // 1. 간단한 카드 모드 (title, amount, color props 사용)
  // 2. 전체 거래 내역 모드 (showFullCard prop이 true일 때)

  // useAuth 훅을 사용하여 사용자 정보 가져오기. AuthProvider 내에서 사용된다고 가정.
  // AuthProvider가 항상 존재하면 삼항 연산자 대신 useAuth()만 사용해도 됩니다.
  // useAuth()가 undefined를 반환할 경우를 대비하여 기본값 {}을 사용합니다.
  // 하지만 이 오류의 근본 원인은 TransactionCard가 AuthProvider 내에 있지 않기 때문입니다.
  const { user } = useAuth() || {}; // useAuth()가 undefined일 경우 빈 객체를 할당하여 오류 방지

  // 전체 거래 내역 모드에서 사용할 거래 목록 상태
  const [transactions, setTransactions] = useState([]);

  // 간단한 카드 모드의 색상 설정 (인라인 스타일용)
  const colorClasses = {
    green: {
      bg: "#e0f2e0",
      text: "#166534",
      border: "#bbf7d0",
    },
    blue: {
      bg: "#e0f2f7",
      text: "#075985",
      border: "#bae6fd",
    },
    pink: {
      bg: "#fce7f3",
      text: "#831843",
      border: "#fbcfe8",
    },
    purple: {
      bg: "#f3e8ff",
      text: "#581c87",
      border: "#e9d5ff",
    },
    default: {
      // 기본 색상
      bg: "#f3f4f6",
      text: "#1f2937",
      border: "#e5e7eb",
    },
  };

  const colorStyle = colorClasses[color] || colorClasses.default;

  // showFullCard 상태가 변경될 때 또는 처음 마운트될 때 거래 데이터 로드
  useEffect(() => {
    // 전체 거래 내역 모드일 경우에만 데이터 로드
    if (showFullCard) {
      // Mock transactions - 실제 앱에서는 데이터베이스, Context, API 등에서 가져옵니다.
      const mockTransactions = [
        {
          id: 1,
          date: new Date(2025, 3, 22), // April 22, 2025 (월은 0부터 시작)
          type: "income",
          amount: 500,
          description: "일일 과제 완료 보상",
          category: "task",
        },
        {
          id: 2,
          date: new Date(2025, 3, 21), // April 21, 2025
          type: "expense",
          amount: 200,
          description: "아이템 구매 - 연필",
          category: "item",
        },
        {
          id: 3,
          date: new Date(2025, 3, 20), // April 20, 2025
          type: "income",
          amount: 1000,
          description: "퀴즈 참여 보상",
          category: "activity",
        },
        {
          id: 4,
          date: new Date(2025, 3, 19), // April 19, 2025
          type: "expense",
          amount: 350,
          description: "아이템 구매 - 노트",
          category: "item",
        },
        {
          id: 5,
          date: new Date(2025, 3, 18), // April 18, 2025
          type: "income",
          amount: 750,
          description: "발표 참여 보상",
          category: "activity",
        },
      ];

      setTransactions(mockTransactions);
    }
  }, [showFullCard]); // showFullCard prop이 변경될 때마다 Effect 다시 실행

  // 날짜 포맷팅 함수 (YYYY.MM.DD 형식)
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
  };

  // 간단한 카드 모드 렌더링
  if (!showFullCard) {
    return (
      <div
        className="flex flex-col justify-between h-full rounded-lg p-3"
        style={{
          backgroundColor: colorStyle.bg,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
          borderLeft: `4px solid ${colorStyle.border}`,
        }}
      >
        {/* 제목 */}
        <div
          className="font-semibold text-sm mb-2"
          style={{
            color: colorStyle.text,
          }}
        >
          {title}
        </div>
        {/* 금액 (toLocaleString 사용하여 콤마 포함) */}
        <div
          className="font-bold text-lg"
          style={{
            color: colorStyle.text,
          }}
        >
          {/* amount가 숫자로 전달된다고 가정 */}
          {amount?.toLocaleString()} {/* 안전하게 ?. 사용 */}
        </div>
      </div>
    );
  }

  // 전체 거래 내역 모드 렌더링 (Tailwind CSS 클래스 사용)
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          최근 거래 내역
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          최근 5개의 거래 내역입니다.
        </p>
      </div>

      {/* 거래 목록 */}
      <div className="divide-y divide-gray-200">
        {transactions.map((transaction) => (
          <div
            key={transaction.id} // key prop 사용
            className="px-4 py-4 sm:px-6 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div>
                {/* 거래 설명 */}
                <p className="text-sm font-medium text-gray-900">
                  {transaction.description}
                </p>
                {/* 거래 날짜 포맷팅 */}
                <p className="text-sm text-gray-500">
                  {formatDate(transaction.date)}
                </p>
              </div>
              {/* 거래 금액 및 타입에 따른 색상 */}
              <div
                className={`font-medium ${
                  transaction.type === "income"
                    ? "text-green-600" // 수입은 녹색
                    : "text-red-600" // 지출은 빨간색
                }`}
              >
                {transaction.type === "income" ? "+" : "-"}{" "}
                {/* 수입/지출 부호 */}
                {/* 금액 포맷팅 */}
                {transaction.amount?.toLocaleString()} 토마토{" "}
                {/* 안전하게 ?. 사용 */}
              </div>
            </div>
            {/* 카테고리 배지 */}
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                ${
                  transaction.category === "task"
                    ? "bg-blue-100 text-blue-800" // 과제 관련 색상
                    : transaction.category === "item"
                    ? "bg-purple-100 text-purple-800" // 아이템 관련 색상
                    : "bg-yellow-100 text-yellow-800" // 기타 활동 관련 색상
                }`}
              >
                {transaction.category === "task"
                  ? "과제"
                  : transaction.category === "item"
                  ? "아이템"
                  : "활동"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 전체 내역 보기 버튼 */}
      <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
        {/* 실제 전체 내역 페이지로 이동하는 Link 또는 버튼 필요 */}
        <button className="text-sm text-blue-600 hover:text-blue-800">
          전체 내역 보기
        </button>
      </div>
    </div>
  );
};

export default TransactionCard;
