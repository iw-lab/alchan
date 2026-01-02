// src/AdminParking.js
import React, { useState, useEffect } from "react";

// Admin Parking Account Management Component
const AdminParking = () => {
  const [parkingInterestRate, setParkingInterestRate] = useState(0.1);
  const [newInterestRate, setNewInterestRate] = useState("");
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(""); // 'success' or 'error'

  useEffect(() => {
    // Load current parking interest rate
    const savedRate = localStorage.getItem("parkingInterestRate");
    if (savedRate) {
      setParkingInterestRate(parseFloat(savedRate));
    } else {
      localStorage.setItem(
        "parkingInterestRate",
        parkingInterestRate.toString()
      );
    }
  }, []);

  const handleRateChange = () => {
    if (
      !newInterestRate ||
      isNaN(newInterestRate) ||
      parseFloat(newInterestRate) < 0
    ) {
      setMessage("유효한 이자율을 입력해주세요 (0 이상).");
      setMessageType("error");
      return;
    }

    const rate = parseFloat(newInterestRate);
    setParkingInterestRate(rate);
    localStorage.setItem("parkingInterestRate", rate.toString());

    setMessage(`파킹 통장 일일 이자율이 ${rate}%로 변경되었습니다.`);
    setMessageType("success");
    setNewInterestRate("");

    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="admin-parking bg-white p-6 rounded-lg shadow-md mb-6">
      <h4 className="font-semibold mb-3">파킹 통장 이자율 관리</h4>

      {message && (
        <div
          className={`p-3 mb-4 rounded-md text-sm ${
            messageType === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mb-4">
        <p className="text-md font-medium text-gray-700">
          현재 일일 이자율:{" "}
          <span className="font-semibold">{parkingInterestRate}%</span>
        </p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          새 일일 이자율 (%)
        </label>
        <input
          type="number"
          value={newInterestRate}
          onChange={(e) => setNewInterestRate(e.target.value)}
          className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="새 이자율 입력 (%)"
          min="0"
          step="0.01"
        />
      </div>

      <button
        type="button"
        onClick={handleRateChange}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-md focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed"
        disabled={
          !newInterestRate ||
          isNaN(newInterestRate) ||
          parseFloat(newInterestRate) < 0
        }
      >
        이자율 변경
      </button>
    </div>
  );
};

export default AdminParking;
