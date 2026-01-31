// src/Banking.js - Tailwind UI 리팩토링
import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import ParkingAccount from "./ParkingAccount";
import { getBankingProducts, updateBankingProducts, db } from "../../firebase";
import { collection, query, where, getDocs, collectionGroup, doc, deleteDoc } from "firebase/firestore";
import { formatKoreanCurrency } from '../../utils/numberFormatter';
import {
  PageContainer,
  PageHeader,
  SectionTitle,
  LoadingState,
  ActionButton,
} from "../../components/PageWrapper";
import { Landmark, ChevronLeft, Save, Plus, Trash2 } from "lucide-react";
import { AlchanLoading } from "../../components/AlchanLayout";

const convertAdminProductsToAccountFormat = (adminProducts) => {
  if (!Array.isArray(adminProducts)) {
    logger.error(
      "convertAdminProductsToAccountFormat: 입력값이 배열이 아닙니다.",
      adminProducts
    );
    return [];
  }
  return adminProducts.map((product) => ({
    id: product.id,
    name: product.name,
    dailyRate:
      product.dailyRate !== undefined && !isNaN(product.dailyRate) ? parseFloat(product.dailyRate) : 0,
    termInDays:
      product.termInDays !== undefined && !isNaN(product.termInDays) ? parseInt(product.termInDays) : 1,
    minAmount:
      product.minAmount !== undefined && !isNaN(product.minAmount) ? parseInt(product.minAmount) : 0,
    maxAmount:
      product.maxAmount !== undefined && !isNaN(product.maxAmount) ? parseInt(product.maxAmount) : 0,
  }));
};

import "./Banking.css";
import { logger } from "../../utils/logger";

const Banking = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("");
  const [activeView, setActiveView] = useState("parking");
  const [isLoading, setIsLoading] = useState(false);

  const [parkingDepositProducts, setParkingDepositProducts] = useState([]);
  const [parkingInstallmentProducts, setParkingInstallmentProducts] = useState(
    []
  );
  const [parkingLoanProducts, setParkingLoanProducts] = useState([]);

  // 유저별 가입 상품 관리
  const [allUserProducts, setAllUserProducts] = useState([]);

  // 모든 유저의 가입 상품 로드
  const loadAllUserProducts = async () => {
    if (!auth?.userDoc?.classCode || !(auth.userDoc?.isAdmin || auth.userDoc?.role === "admin")) {
      return;
    }

    setIsLoading(true);
    try {
      // 먼저 해당 클래스의 모든 유저 조회
      const usersQuery = query(
        collection(db, "users"),
        where("classCode", "==", auth.userDoc.classCode)
      );
      const usersSnapshot = await getDocs(usersQuery);

      const userMap = {};
      usersSnapshot.forEach((doc) => {
        userMap[doc.id] = {
          id: doc.id,
          name: doc.data().name || doc.data().nickname || "알 수 없음",
          ...doc.data()
        };
      });

      // 🔥 [최적화] 각 유저의 상품 조회 - 병렬 처리로 N+1 문제 해결
      const allProducts = [];
      const userIds = Object.keys(userMap);

      // 모든 유저의 products를 병렬로 조회 (순차 대신 Promise.all 사용)
      const productPromises = userIds.map(async (userId) => {
        const productsQuery = collection(db, "users", userId, "products");
        const productsSnapshot = await getDocs(productsQuery);

        return productsSnapshot.docs.map((productDoc) => {
          const productData = productDoc.data();
          return {
            firestoreId: productDoc.id, // 실제 Firestore 문서 ID
            userId: userId,
            userName: userMap[userId].name,
            ...productData,
            maturityDate: productData.maturityDate?.toDate ? productData.maturityDate.toDate() : productData.maturityDate
          };
        });
      });

      // 모든 Promise가 완료될 때까지 대기
      const productsArrays = await Promise.all(productPromises);

      // 2D 배열을 1D 배열로 평탄화
      productsArrays.forEach(productsArray => {
        allProducts.push(...productsArray);
      });

      setAllUserProducts(allProducts);
      logger.log("유저 상품 로드 완료:", allProducts);
    } catch (error) {
      logger.error("유저 상품 로드 중 오류:", error);
      setMessage("유저 상품 로드 중 오류가 발생했습니다.");
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  // 관리자가 유저 상품 강제 삭제
  const handleAdminDeleteUserProduct = async (product) => {
    logger.log("삭제 시도:", product);

    if (!(auth.userDoc?.isAdmin || auth.userDoc?.role === "admin")) {
      logger.log("관리자 권한 없음");
      alert("관리자 권한이 필요합니다.");
      return;
    }

    if (!window.confirm(`'${product.userName}'님의 '${product.name}' 상품을 강제로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      logger.log("사용자가 삭제 취소");
      return;
    }

    setIsLoading(true);
    try {
      // firestoreId를 사용 (실제 Firestore 문서 ID)
      const productId = product.firestoreId || String(product.id);
      logger.log("삭제 경로:", `users/${product.userId}/products/${productId}`);
      logger.log("사용할 문서 ID:", productId);

      const productRef = doc(db, "users", product.userId, "products", productId);
      logger.log("삭제 시작...");
      await deleteDoc(productRef);
      logger.log("삭제 완료");

      setMessage("상품이 삭제되었습니다.");
      setMessageType("success");

      // 목록 새로고침
      logger.log("목록 새로고침 시작...");
      await loadAllUserProducts();
      logger.log("목록 새로고침 완료");

      setTimeout(() => {
        setMessage(null);
        setMessageType("");
      }, 3000);
    } catch (error) {
      logger.error("상품 삭제 중 오류:", error);
      setMessage(`삭제 중 오류가 발생했습니다: ${error.message}`);
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const [formattedDepositProducts, setFormattedDepositProducts] = useState([]);
  const [formattedInstallmentProducts, setFormattedInstallmentProducts] =
    useState([]);
  const [formattedLoanProducts, setFormattedLoanProducts] = useState([]);

  // Firestore에서 데이터 로드
  const loadAllData = async () => {
    const classCode = auth?.userDoc?.classCode;
    if (!classCode || classCode === '미지정') {
      logger.warn("[Banking] 유효한 학급 코드가 없어 뱅킹 상품을 로드하지 않습니다.");
      return;
    }

    setIsLoading(true);
    try {
      const bankingData = await getBankingProducts(classCode, true, 'Banking');

      // deposits를 savings로 매핑 (예금 상품)
      if (bankingData.deposits) {
        setParkingDepositProducts(bankingData.deposits);
      } else {
        setParkingDepositProducts([]);
      }

      // savings를 installments로 매핑 (적금 상품)
      if (bankingData.savings) {
        setParkingInstallmentProducts(bankingData.savings);
      } else {
        setParkingInstallmentProducts([]);
      }

      // loans는 그대로 매핑 (대출 상품)
      if (bankingData.loans) {
        setParkingLoanProducts(bankingData.loans);
      } else {
        setParkingLoanProducts([]);
      }

    } catch (error) {
      logger.error("뱅킹 상품 로드 중 오류:", error);
      setMessage("데이터 로딩 중 오류가 발생했습니다.");
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (auth && !auth.loading && auth.user && auth.userDoc?.classCode) {
      loadAllData();
    } else if (auth && !auth.loading && !auth.user) {
      setParkingSavingsProducts([]);
      setParkingInstallmentProducts([]);
      setParkingLoanProducts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.user, auth?.loading, auth?.userDoc?.classCode]); // loadAllData 추가하면 무한루프, auth 객체 전체 추가도 불필요한 리렌더링 발생

  useEffect(() => {
    setFormattedDepositProducts(
      convertAdminProductsToAccountFormat(parkingDepositProducts)
    );
    setFormattedInstallmentProducts(
      convertAdminProductsToAccountFormat(parkingInstallmentProducts)
    );
    setFormattedLoanProducts(
      convertAdminProductsToAccountFormat(parkingLoanProducts)
    );
  }, [parkingDepositProducts, parkingInstallmentProducts, parkingLoanProducts]);

  const handleParkingProductChange = (type, index, field, value) => {
    let productsState, setProductsState;
    switch (type) {
      case "deposits":
        productsState = parkingDepositProducts;
        setProductsState = setParkingDepositProducts;
        break;
      case "installments":
        productsState = parkingInstallmentProducts;
        setProductsState = setParkingInstallmentProducts;
        break;
      case "loans":
        productsState = parkingLoanProducts;
        setProductsState = setParkingLoanProducts;
        break;
      default:
        return;
    }

    const updatedProducts = productsState.map((product, i) => {
      if (i === index) {
        const updatedProduct = { ...product };
        if (
          field === "termInDays" ||
          field === "minAmount" ||
          field === "maxAmount"
        ) {
          const numValue = parseInt(value);
          updatedProduct[field] =
            isNaN(numValue) || numValue < (field === "termInDays" ? 1 : 0)
              ? field === "termInDays"
                ? 1
                : 0
              : numValue;
        } else if (field === "dailyRate") {
          const dailyRateValue = parseFloat(value);
          updatedProduct.dailyRate =
            isNaN(dailyRateValue) || dailyRateValue < 0 ? 0 : dailyRateValue;
        } else if (field === "name") {
          updatedProduct[field] = value;
        }
        return updatedProduct;
      }
      return product;
    });
    setProductsState(updatedProducts);
  };

  const saveParkingProducts = async (type) => {
    if (!auth?.userDoc?.classCode) {
      setMessage("학급 코드가 없어 저장할 수 없습니다.");
      setMessageType("error");
      return;
    }

    setIsLoading(true);
    try {
      let products, firestoreType;

      switch (type) {
        case "deposits":
          products = parkingDepositProducts;
          firestoreType = "deposits"; // Firebase에서는 deposits로 저장
          break;
        case "installments":
          products = parkingInstallmentProducts;
          firestoreType = "savings"; // Firebase에서는 savings로 저장
          break;
        case "loans":
          products = parkingLoanProducts;
          firestoreType = "loans";
          break;
        default:
          return;
      }

      await updateBankingProducts(
        auth.userDoc.classCode,
        firestoreType,
        products
      );

      setMessage(
        `${type === "deposits"
          ? "예금"
          : type === "installments"
            ? "적금"
            : "대출"
        } 상품이 성공적으로 저장되었습니다.`
      );
      setMessageType("success");

      setTimeout(() => {
        setMessage(null);
        setMessageType("");
      }, 3000);
    } catch (error) {
      logger.error(`${type} 상품 저장 중 오류:`, error);
      setMessage("저장 중 오류가 발생했습니다.");
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const addParkingProduct = (type) => {
    const newProduct = {
      id: Date.now(),
      name: `새 ${type === "deposits"
        ? "예금"
        : type === "installments"
          ? "적금"
          : "대출"
        } 상품`,
      dailyRate: 0.01,
      termInDays: 365,
      minAmount: type === "loans" ? 0 : 100000,
      maxAmount: type === "loans" ? 1000000 : 0,
    };

    switch (type) {
      case "deposits":
        setParkingDepositProducts([...parkingDepositProducts, newProduct]);
        break;
      case "installments":
        setParkingInstallmentProducts([
          ...parkingInstallmentProducts,
          newProduct,
        ]);
        break;
      case "loans":
        setParkingLoanProducts([...parkingLoanProducts, newProduct]);
        break;
      default:
        break;
    }
  };

  const deleteParkingProduct = async (type, indexToDelete) => {
    if (isLoading) return; // 중복 클릭 방지

    let productsState, setProductsState;
    switch (type) {
      case "deposits":
        productsState = parkingDepositProducts;
        setProductsState = setParkingDepositProducts;
        break;
      case "installments":
        productsState = parkingInstallmentProducts;
        setProductsState = setParkingInstallmentProducts;
        break;
      case "loans":
        productsState = parkingLoanProducts;
        setProductsState = setParkingLoanProducts;
        break;
      default:
        return;
    }

    const updatedProducts = productsState.filter(
      (_, index) => index !== indexToDelete
    );
    setProductsState(updatedProducts);

    // 삭제 후 자동 저장
    if (auth?.userDoc?.classCode) {
      setIsLoading(true);
      try {
        const firestoreType =
          type === "deposits"
            ? "deposits"
            : type === "installments"
              ? "savings"
              : "loans";
        await updateBankingProducts(
          auth.userDoc.classCode,
          firestoreType,
          updatedProducts
        );
        setMessage("상품이 삭제되었습니다.");
        setMessageType("info");
        setTimeout(() => {
          setMessage(null);
          setMessageType("");
        }, 2000);
      } catch (error) {
        logger.error("상품 삭제 중 오류:", error);
        setMessage("삭제 중 오류가 발생했습니다.");
        setMessageType("error");
        // 삭제 실패 시 원래 상태로 되돌릴 수 있습니다 (선택적)
        setProductsState(productsState);
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (auth.loading) {
    return <AlchanLoading />;
  }

  return (
    <PageContainer>
      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <AlchanLoading />
        </div>
      )}

      <div className="px-4 py-6 sm:px-6">
        {/* 페이지 헤더 */}
        <PageHeader
          title="통합 금융 관리"
          subtitle="예금, 적금, 대출 상품을 관리하세요"
          icon={Landmark}
          backButton={
            <ActionButton
              variant="ghost"
              icon={ChevronLeft}
              onClick={() => navigate(-1)}
            >
              뒤로가기
            </ActionButton>
          }
        />

        {/* 메시지 표시 */}
        {message && (
          <div className={`mb-4 p-4 rounded-xl ${messageType === 'error'
            ? 'bg-red-900/40 text-red-200 border border-red-800/50'
            : messageType === 'success'
              ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-800/50'
              : 'bg-blue-900/40 text-blue-200 border border-blue-800/50'
            }`}>
            {message}
          </div>
        )}

        <div className={activeView === "admin" ? "content-box" : ""}>
          {(activeView === "parking" || activeView === "userProducts") && (
            <ParkingAccount
              auth={auth}
              depositProducts={formattedDepositProducts}
              installmentProducts={formattedInstallmentProducts}
              loanProducts={formattedLoanProducts}
              activeView={activeView}
              onViewChange={setActiveView}
              onLoadUserProducts={loadAllUserProducts}
              allUserProducts={allUserProducts}
              onDeleteUserProduct={handleAdminDeleteUserProduct}
              isLoading={isLoading}
            />
          )}
          {activeView === "admin" &&
            auth.user &&
            (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin") && (
              <div>
                <h2 className="admin-header">
                  관리자 - 금융 상품 관리 (일 복리 기준)
                </h2>
                {/* Savings Products */}
                <div className="admin-section">
                  <h3>파킹 예금 상품</h3>
                  <p className="admin-info-text">
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: "25%" }}>
                          상품명
                        </th>
                        <th style={{ width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{ width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{ width: "18%" }}>
                          최소금액(원)
                        </th>
                        <th style={{ width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingDepositProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td className="admin-td">
                            <input
                              type="text"
                              value={p.name || ''}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "deposits",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "deposits",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.dailyRate || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "deposits",
                                  index,
                                  "dailyRate",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              placeholder="예: 0.01"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="0"
                              value={p.minAmount || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "deposits",
                                  index,
                                  "minAmount",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <button
                              onClick={() =>
                                deleteParkingProduct("deposits", index)
                              }
                              className={`admin-button-small delete-button ${isLoading ? "disabled-button" : ""}`}
                              disabled={isLoading}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-action-buttons">
                    <button
                      onClick={() => addParkingProduct("deposits")}
                      className={`admin-button-small add-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("deposits")}
                      className={`admin-button-small save-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      예금 상품 저장
                    </button>
                  </div>
                </div>

                {/* Installment Products */}
                <div className="admin-section">
                  <h3>파킹 적금 상품</h3>
                  <p className="admin-info-text">
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: "25%" }}>
                          상품명
                        </th>
                        <th style={{ width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{ width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{ width: "18%" }}>
                          최소 월납입(원)
                        </th>
                        <th style={{ width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingInstallmentProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td className="admin-td">
                            <input
                              type="text"
                              value={p.name || ''}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.dailyRate || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "dailyRate",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              placeholder="예: 0.011"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="0"
                              value={p.minAmount || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "installments",
                                  index,
                                  "minAmount",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <button
                              onClick={() =>
                                deleteParkingProduct("installments", index)
                              }
                              className={`admin-button-small delete-button ${isLoading ? "disabled-button" : ""}`}
                              disabled={isLoading}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-action-buttons">
                    <button
                      onClick={() => addParkingProduct("installments")}
                      className={`admin-button-small add-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("installments")}
                      className={`admin-button-small save-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      적금 상품 저장
                    </button>
                  </div>
                </div>

                {/* Loan Products */}
                <div className="admin-section" style={{ borderBottom: "none" }}>
                  <h3>파킹 대출 상품</h3>
                  <p className="admin-info-text">
                    일 이율(%)과 기간(일)을 입력합니다. 변경 후 '저장' 버튼을
                    클릭하세요.
                  </p>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th style={{ width: "25%" }}>
                          상품명
                        </th>
                        <th style={{ width: "15%" }}>
                          기간(일)
                        </th>
                        <th style={{ width: "18%" }}>
                          일 이율(%)
                        </th>
                        <th style={{ width: "18%" }}>
                          최대 대출액(원)
                        </th>
                        <th style={{ width: "12%" }}>
                          관리
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parkingLoanProducts.map((p, index) => (
                        <tr key={p.id}>
                          <td className="admin-td">
                            <input
                              type="text"
                              value={p.name || ''}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "name",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="1"
                              value={p.termInDays || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "termInDays",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={p.dailyRate || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "dailyRate",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              placeholder="예: 0.05"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <input
                              type="number"
                              min="0"
                              value={p.maxAmount || 0}
                              onChange={(e) =>
                                handleParkingProductChange(
                                  "loans",
                                  index,
                                  "maxAmount",
                                  e.target.value
                                )
                              }
                              className="admin-input"
                              disabled={isLoading}
                              style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                          </td>
                          <td className="admin-td">
                            <button
                              onClick={() =>
                                deleteParkingProduct("loans", index)
                              }
                              className={`admin-button-small delete-button ${isLoading ? "disabled-button" : ""}`}
                              disabled={isLoading}>
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="admin-action-buttons">
                    <button
                      onClick={() => addParkingProduct("loans")}
                      className={`admin-button-small add-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      추가
                    </button>
                    <button
                      onClick={() => saveParkingProducts("loans")}
                      className={`admin-button-small save-button ${isLoading ? "disabled-button" : ""}`}
                      disabled={isLoading}>
                      대출 상품 저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          {activeView === "admin" &&
            !(
              auth.user &&
              (auth.userDoc?.isAdmin || auth.userDoc?.role === "admin")
            ) && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800">
                관리자 권한이 필요합니다.
              </div>
            )}
        </div>
      </div>
    </PageContainer>
  );
};

export default Banking;