import React from "react";
import { Link } from "react-router-dom";

const StockExchangeMenuItem = () => {
  return (
    <div className="stock-exchange-menu-item">
      <Link
        to="/stock-exchange"
        className="flex items-center p-3 hover:bg-blue-50 transition-colors duration-150 rounded-md"
      >
        <div className="mr-3">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-green-600"
          >
            <path
              d="M3 3V21H21"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7 14L11 10L15 14L21 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="font-medium">주식거래소</div>
      </Link>
    </div>
  );
};

export default StockExchangeMenuItem;
