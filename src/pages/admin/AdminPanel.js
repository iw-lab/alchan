// src/AdminPanel.js
import React, { useState, useEffect } from "react";
import "./AdminPanel.css";

const AdminPanel = () => {
  const [depositProducts, setDepositProducts] = useState([]);
  const [savingProducts, setSavingProducts] = useState([]);
  const [loanProducts, setLoanProducts] = useState([]);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [activeTab, setActiveTab] = useState("deposit"); // 'deposit', 'saving', 'loan'
  const [newProductName, setNewProductName] = useState("");
  const [newProductPeriod, setNewProductPeriod] = useState("");
  const [newProductRate, setNewProductRate] = useState("");

  useEffect(() => {
    const loadedDepositProducts =
      JSON.parse(localStorage.getItem("depositProducts")) || [];
    const loadedSavingProducts =
      JSON.parse(localStorage.getItem("savingProducts")) || [];
    const loadedLoanProducts =
      JSON.parse(localStorage.getItem("loanProducts")) || [];
    setDepositProducts(loadedDepositProducts);
    setSavingProducts(loadedSavingProducts);
    setLoanProducts(loadedLoanProducts);
  }, []);

  const getProductTypeText = (type) => {
    switch (type) {
      case "deposit":
        return "예금";
      case "saving":
        return "적금";
      case "loan":
        return "대출";
      default:
        return "금융";
    }
  };

  const handleAddProduct = () => {
    if (
      !newProductName.trim() ||
      !newProductPeriod ||
      !newProductRate ||
      isNaN(newProductPeriod) ||
      isNaN(newProductRate)
    ) {
      setMessage("모든 필드를 올바르게 입력해주세요.");
      setMessageType("error");
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    const newProduct = {
      id: Date.now(),
      name: newProductName,
      period: parseInt(newProductPeriod),
      rate: parseFloat(newProductRate),
    };

    let updatedProducts = [];
    let storageKey = "";

    if (activeTab === "deposit") {
      updatedProducts = [...depositProducts, newProduct];
      setDepositProducts(updatedProducts);
      storageKey = "depositProducts";
    } else if (activeTab === "saving") {
      updatedProducts = [...savingProducts, newProduct];
      setSavingProducts(updatedProducts);
      storageKey = "savingProducts";
    } else if (activeTab === "loan") {
      updatedProducts = [...loanProducts, newProduct];
      setLoanProducts(updatedProducts);
      storageKey = "loanProducts";
    }

    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));
    setMessage(`새 ${getProductTypeText(activeTab)} 상품이 추가되었습니다.`);
    setMessageType("success");
    setNewProductName("");
    setNewProductPeriod("");
    setNewProductRate("");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteProduct = (id, type) => {
    let productList, setProductList, storageKey;

    if (type === "deposit") {
      productList = depositProducts;
      setProductList = setDepositProducts;
      storageKey = "depositProducts";
    } else if (type === "saving") {
      productList = savingProducts;
      setProductList = setSavingProducts;
      storageKey = "savingProducts";
    } else if (type === "loan") {
      productList = loanProducts;
      setProductList = setLoanProducts;
      storageKey = "loanProducts";
    }

    const updatedProducts = productList.filter((product) => product.id !== id);
    setProductList(updatedProducts);
    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));
    setMessage(`${getProductTypeText(type)} 상품이 삭제되었습니다.`);
    setMessageType("success");
    setTimeout(() => setMessage(null), 3000);
  };

  const renderProductTable = (products, type) => {
    if (products.length === 0) {
      return (
        <p className="text-gray-500 text-center py-4">
          등록된 {getProductTypeText(type)} 상품이 없습니다.
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                상품명
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                기간 (일)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                이율 (%)
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                관리
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {product.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {product.period}일
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {product.rate}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleDeleteProduct(product.id, type)}
                    className="text-red-600 hover:text-red-900"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="admin-panel bg-white p-6 rounded-lg shadow-md">
      {message && (
        <div
          className={`message ${
            messageType === "success"
              ? "bg-green-100 border-green-400 text-green-700"
              : "bg-red-100 border-red-400 text-red-700"
          } border px-4 py-3 rounded relative mb-4`}
          role="alert"
        >
          <span className="block sm:inline">{message}</span>
        </div>
      )}

      <h3 className="text-xl font-semibold mb-4">금융 상품 관리</h3>

      <div className="admin-tabs mb-6 border-b">
        <div className="flex flex-wrap">
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "deposit"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setActiveTab("deposit")}
          >
            예금 상품 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "saving"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setActiveTab("saving")}
          >
            적금 상품 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "loan"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setActiveTab("loan")}
          >
            대출 상품 관리
          </button>
        </div>
      </div>

      <div className="add-product-form mb-6 p-4 bg-gray-50 rounded-md">
        <h4 className="font-semibold mb-3">
          {getProductTypeText(activeTab)} 상품 추가
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            placeholder="상품명"
            className="w-full p-2 border rounded-md"
          />
          <input
            type="number"
            value={newProductPeriod}
            onChange={(e) => setNewProductPeriod(e.target.value)}
            placeholder="기간 (일)"
            className="w-full p-2 border rounded-md"
          />
          <input
            type="number"
            step="0.1"
            value={newProductRate}
            onChange={(e) => setNewProductRate(e.target.value)}
            placeholder="이율 (%)"
            className="w-full p-2 border rounded-md"
          />
        </div>
        <button
          onClick={handleAddProduct}
          className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-md"
        >
          상품 추가
        </button>
      </div>

      <div className="product-list">
        <h4 className="font-semibold mb-3">
          {getProductTypeText(activeTab)} 상품 목록
        </h4>
        {activeTab === "deposit" &&
          renderProductTable(depositProducts, "deposit")}
        {activeTab === "saving" &&
          renderProductTable(savingProducts, "saving")}
        {activeTab === "loan" && renderProductTable(loanProducts, "loan")}
      </div>
    </div>
  );
};

export default AdminPanel;