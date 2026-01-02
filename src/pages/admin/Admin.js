// src/Admin.js - Firestore 비용 최적화 버전
import React, { useState, useEffect, useContext, useCallback, useMemo, useRef } from "react";
import AdminParking from "./AdminParking";
import AdminUserManagement from "./AdminUserManagement";
import CouponTransfer from "../../CouponTransfer";
import { AuthContext } from "../../contexts/AuthContext";
import { db, functions } from "../../firebase";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// 주식 초기화를 위한 기본 데이터
const initialStocks = [
  { id: 'KP', name: '코딩 파트너', price: 10000, history: [{ price: 10000, timestamp: new Date() }] },
  { id: 'SS', name: '삼성전자', price: 80000, history: [{ price: 80000, timestamp: new Date() }] },
  { id: 'LG', name: 'LG에너지솔루션', price: 350000, history: [{ price: 350000, timestamp: new Date() }] },
  { id: 'SK', name: 'SK하이닉스', price: 230000, history: [{ price: 230000, timestamp: new Date() }] },
];

const Admin = ({
  depositProducts,
  setDepositProducts,
  savingProducts,
  setSavingProducts,
  loanProducts,
  setLoanProducts,
  setMessage,
  setMessageType,
}) => {
  const { classCode } = useContext(AuthContext);
  const [adminActiveTab, setAdminActiveTab] = useState("user");
  const [newProductName, setNewProductName] = useState("");
  const [newProductPeriod, setNewProductPeriod] = useState("");
  const [newProductRate, setNewProductRate] = useState("");

  // === Firestore 최적화를 위한 상태 관리 ===
  const [marketStatus, setMarketStatus] = useState({ isOpen: false });
  const [marketMessage, setMarketMessage] = useState('');
  
  // 캐시 및 최적화 관련 상태
  const [isMarketDataLoaded, setIsMarketDataLoaded] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [pendingWrites, setPendingWrites] = useState([]);
  const marketStatusCache = useRef(null);
  const writeTimeoutRef = useRef(null);
  
  // 캐시 유효 시간 (5분)
  const CACHE_DURATION = 5 * 60 * 1000;
  // 쓰기 작업 디바운스 시간 (2초)
  const WRITE_DEBOUNCE_TIME = 2000;

  const toggleMarketManually = httpsCallable(functions, 'toggleMarketManually');

  // === 캐시 유효성 검사 함수 ===
  const isCacheValid = useCallback(() => {
    return lastFetchTime && 
           marketStatusCache.current && 
           (Date.now() - lastFetchTime) < CACHE_DURATION;
  }, [lastFetchTime]);

  // === 시장 상태 가져오기 최적화 함수 ===
  const fetchMarketStatus = useCallback(async (forceRefresh = false) => {
    // 이미 로드되었고 캐시가 유효하며 강제 새로고침이 아닌 경우 캐시 사용
    if (!forceRefresh && isCacheValid()) {
      setMarketStatus(marketStatusCache.current);
      return;
    }

    if (!classCode) return;

    const marketStatusRef = doc(db, `ClassStock/${classCode}/marketStatus/status`);
    try {
      console.log('Firestore 읽기: 시장 상태 조회');
      const docSnap = await getDoc(marketStatusRef);
      let statusData;
      
      if (docSnap.exists()) {
        statusData = docSnap.data();
      } else {
        // 문서가 없는 경우에만 쓰기 작업 수행
        statusData = { isOpen: false };
        console.log('Firestore 쓰기: 시장 상태 초기화');
        await setDoc(marketStatusRef, statusData);
      }
      
      // 캐시 업데이트
      marketStatusCache.current = statusData;
      setMarketStatus(statusData);
      setLastFetchTime(Date.now());
      setIsMarketDataLoaded(true);
      
    } catch (error) {
      console.error("Failed to fetch market status:", error);
      setMarketMessage("시장 상태를 불러오는 데 실패했습니다.");
      
      // 에러 발생 시 캐시된 데이터가 있으면 사용
      if (marketStatusCache.current) {
        setMarketStatus(marketStatusCache.current);
      }
    }
  }, [classCode, isCacheValid]);

  // === 배치 쓰기 최적화 함수 ===
  const debouncedBatchWrite = useCallback((writeOperations) => {
    // 기존 타이머 취소
    if (writeTimeoutRef.current) {
      clearTimeout(writeTimeoutRef.current);
    }

    // 새로운 쓰기 작업을 pending 목록에 추가
    setPendingWrites(prev => [...prev, ...writeOperations]);

    // 디바운스된 쓰기 실행
    writeTimeoutRef.current = setTimeout(async () => {
      if (pendingWrites.length > 0) {
        try {
          const batch = writeBatch(db);
          console.log(`Firestore 배치 쓰기: ${pendingWrites.length}개 작업`);
          
          pendingWrites.forEach(operation => {
            if (operation.type === 'set') {
              batch.set(operation.ref, operation.data);
            } else if (operation.type === 'update') {
              batch.update(operation.ref, operation.data);
            }
          });
          
          await batch.commit();
          setPendingWrites([]);
        } catch (error) {
          console.error("배치 쓰기 실패:", error);
          setMarketMessage(`배치 쓰기 실패: ${error.message}`);
        }
      }
    }, WRITE_DEBOUNCE_TIME);
  }, [pendingWrites]);

  // === 컴포넌트 마운트/언마운트 최적화 ===
  useEffect(() => {
    // 시장 탭이 활성화될 때만 데이터 로드
    if (adminActiveTab === 'market' && !isMarketDataLoaded) {
      fetchMarketStatus();
    }

    // 컴포넌트 언마운트 시 타이머 정리
    return () => {
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
    };
  }, [adminActiveTab, isMarketDataLoaded, fetchMarketStatus]);

  // === 시장 제어 최적화 함수 ===
  const handleMarketControl = useCallback(async (newIsOpenState) => {
    try {
      const actionText = newIsOpenState ? '수동 개장' : '수동 폐장';
      if (!window.confirm(`정말로 시장을 '${actionText}' 상태로 변경하시겠습니까?`)) {
        return;
      }
      
      // 낙관적 업데이트 (UI 즉시 반영)
      const optimisticStatus = { isOpen: newIsOpenState };
      setMarketStatus(optimisticStatus);
      marketStatusCache.current = optimisticStatus;
      
      console.log('Firebase Function 호출: 시장 상태 변경');
      const result = await toggleMarketManually({ 
        classCode: classCode, 
        isOpen: newIsOpenState 
      });

      setMarketMessage(result.data.message);
      
      // 성공 시 캐시 타임스탬프 업데이트
      setLastFetchTime(Date.now());

    } catch (error) {
      console.error("시장 상태 변경 오류:", error);
      setMarketMessage(`오류가 발생했습니다: ${error.message}`);
      
      // 실패 시 원래 상태로 롤백
      if (marketStatusCache.current) {
        setMarketStatus(marketStatusCache.current);
      } else {
        // 캐시가 없으면 서버에서 다시 가져오기
        fetchMarketStatus(true);
      }
    }
    setTimeout(() => setMarketMessage(''), 5000);
  }, [classCode, toggleMarketManually, fetchMarketStatus]);
  
  // === 주식 정보 초기화 최적화 함수 ===
  const handleInitializeStocks = useCallback(async () => {
    if (!window.confirm("모든 주식 정보를 초기화하고 기본값으로 설정하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    try {
      const batch = writeBatch(db);
      
      console.log(`Firestore 배치 쓰기: ${initialStocks.length}개 주식 초기화`);
      initialStocks.forEach((stock) => {
        const stockRef = doc(db, "CentralStocks", stock.id);
        batch.set(stockRef, stock);
      });

      await batch.commit();
      alert("주식 정보가 성공적으로 초기화되었습니다.");
      setMarketMessage("주식 정보가 성공적으로 초기화되었습니다.");
    } catch (error) {
      console.error("주식 정보 초기화 중 오류 발생:", error);
      alert("주식 정보 초기화에 실패했습니다. 콘솔을 확인해주세요.");
      setMarketMessage(`초기화 실패: ${error.message}`);
    }
    setTimeout(() => setMarketMessage(''), 5000);
  }, []);

  // === 제품 타입 텍스트 메모이제이션 ===
  const getProductTypeText = useMemo(() => {
    const typeTextMap = {
      "deposit": "예금",
      "saving": "적금", 
      "loan": "대출",
      "parking": "파킹 통장",
      "user": "사용자",
      "coupon": "쿠폰",
      "market": "주식 시장"
    };
    
    return (type) => typeTextMap[type] || "금융";
  }, []);

  // === 제품 추가 최적화 함수 ===
  const handleAddProduct = useCallback(() => {
    // 유효성 검사
    if (!newProductName || newProductName.trim() === "") {
      setMessage("상품명을 입력해주세요.");
      setMessageType("error");
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!newProductPeriod || isNaN(newProductPeriod) || parseInt(newProductPeriod) <= 0) {
      setMessage("유효한 기간을 입력해주세요.");
      setMessageType("error");
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!newProductRate || isNaN(newProductRate) || parseFloat(newProductRate) < 0) {
      setMessage("유효한 이율을 입력해주세요.");
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

    // 상품 유형에 따라 다른 상태 및 저장소에 추가
    let updatedProducts = [];
    let storageKey = "";

    if (adminActiveTab === "deposit") {
      updatedProducts = [...depositProducts, newProduct];
      setDepositProducts(updatedProducts);
      storageKey = "depositProducts";
    } else if (adminActiveTab === "saving") {
      updatedProducts = [...savingProducts, newProduct];
      setSavingProducts(updatedProducts);
      storageKey = "savingProducts";
    } else if (adminActiveTab === "loan") {
      updatedProducts = [...loanProducts, newProduct];
      setLoanProducts(updatedProducts);
      storageKey = "loanProducts";
    } else {
      return;
    }

    // localStorage 사용 (Firestore 사용하지 않음)
    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));

    setMessage(`새 ${getProductTypeText(adminActiveTab)} 상품이 추가되었습니다.`);
    setMessageType("success");

    // 입력 필드 초기화
    setNewProductName("");
    setNewProductPeriod("");
    setNewProductRate("");

    setTimeout(() => setMessage(null), 3000);
  }, [
    newProductName, 
    newProductPeriod, 
    newProductRate, 
    adminActiveTab, 
    depositProducts, 
    savingProducts, 
    loanProducts,
    setDepositProducts,
    setSavingProducts,
    setLoanProducts,
    setMessage,
    setMessageType,
    getProductTypeText
  ]);

  // === 제품 삭제 최적화 함수 ===
  const handleDeleteProduct = useCallback((id, type) => {
    let updatedProducts = [];
    let productList = [];
    let storageKey = "";

    if (type === "deposit") {
      productList = depositProducts;
      storageKey = "depositProducts";
    } else if (type === "saving") {
      productList = savingProducts;
      storageKey = "savingProducts";
    } else if (type === "loan") {
      productList = loanProducts;
      storageKey = "loanProducts";
    } else {
      return;
    }

    updatedProducts = productList.filter((product) => product.id !== id);

    if (type === "deposit") {
      setDepositProducts(updatedProducts);
    } else if (type === "saving") {
      setSavingProducts(updatedProducts);
    } else if (type === "loan") {
      setLoanProducts(updatedProducts);
    }

    // localStorage 사용 (Firestore 사용하지 않음)
    localStorage.setItem(storageKey, JSON.stringify(updatedProducts));

    setMessage(`${getProductTypeText(type)} 상품이 삭제되었습니다.`);
    setMessageType("success");
    setTimeout(() => setMessage(null), 3000);
  }, [
    depositProducts,
    savingProducts, 
    loanProducts,
    setDepositProducts,
    setSavingProducts,
    setLoanProducts,
    setMessage,
    setMessageType,
    getProductTypeText
  ]);

  // === 제품 테이블 렌더링 메모이제이션 ===
  const renderProductTable = useMemo(() => {
    return (products, type) => {
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
  }, [getProductTypeText, handleDeleteProduct]);

  // === 탭 컨텐츠 렌더링 최적화 ===
  const renderTabContent = useMemo(() => {
    switch (adminActiveTab) {
      case "user":
        return <AdminUserManagement />;
      case "parking":
        return <AdminParking />;
      case "coupon":
        return <CouponTransfer />;
      case "market":
        return (
          <>
            <div className="admin-section p-4 bg-gray-50 rounded-md">
              <h4 className="font-semibold mb-3">주식 시장 제어</h4>
              <div className="flex justify-between items-center mb-4">
                <p>
                  현재 상태:{" "}
                  <span className={`font-bold ${marketStatus.isOpen ? 'text-green-600' : 'text-red-600'}`}>
                    {marketStatus.isOpen ? '개장' : '폐장'}
                  </span>
                </p>
                <button
                  onClick={() => fetchMarketStatus(true)}
                  className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
                  disabled={!classCode}
                >
                  새로고침
                </button>
              </div>
              <div className="market-controls flex gap-4 mb-4">
                <button
                  onClick={() => handleMarketControl(true)}
                  disabled={marketStatus.isOpen}
                  className="control-button open flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400"
                >
                  수동 개장
                </button>
                <button
                  onClick={() => handleMarketControl(false)}
                  disabled={!marketStatus.isOpen}
                  className="control-button close flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400"
                >
                  수동 폐장
                </button>
              </div>
              <p className="description text-sm text-gray-600">
                버튼을 누르면 정해진 시간과 상관없이 시장 상태가 즉시 변경됩니다.<br />
                자동 개장/폐장 시간(월-금, 오전 8시/오후 3시)이 되면 자동으로 상태가 변경됩니다.<br />
                <span className="text-blue-600">
                  캐시 유효시간: {Math.ceil(CACHE_DURATION / 60000)}분 
                  {isCacheValid() && ` (${Math.ceil((CACHE_DURATION - (Date.now() - lastFetchTime)) / 60000)}분 남음)`}
                </span>
              </p>
            </div>

            <div className="admin-section mt-6 p-4 bg-gray-50 rounded-md">
              <h4 className="font-semibold mb-3">주식 정보 초기화</h4>
              <p className="description text-sm text-gray-600 mb-4">
                주의: 이 버튼을 누르면 모든 주식의 가격과 거래 내역이 기본값으로 초기화됩니다. 이 작업은 되돌릴 수 없습니다.
              </p>
              <button
                onClick={handleInitializeStocks}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded"
              >
                모든 주식 정보 초기화
              </button>
            </div>
            {marketMessage && (
              <p className="message-box mt-4 text-center p-2 bg-yellow-100 border border-yellow-400 rounded">
                {marketMessage}
              </p>
            )}
          </>
        );
      default:
        // 예금, 적금, 대출 상품 관리
        return (
          <>
            {/* 상품 추가 폼 */}
            <div className="add-product-form mb-6 p-4 bg-gray-50 rounded-md">
              <h4 className="font-semibold mb-3">
                {getProductTypeText(adminActiveTab)} 상품 추가
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    상품명
                  </label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="상품명 입력"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    기간 (일)
                  </label>
                  <input
                    type="number"
                    value={newProductPeriod}
                    onChange={(e) => setNewProductPeriod(e.target.value)}
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="기간 입력 (일)"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이율 (%)
                  </label>
                  <input
                    type="number"
                    value={newProductRate}
                    onChange={(e) => setNewProductRate(e.target.value)}
                    className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이율 입력 (%)"
                    min="0"
                    step="0.1"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddProduct}
                className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-md focus:outline-none"
              >
                상품 추가하기
              </button>
            </div>

            {/* 상품 목록 테이블 */}
            <div className="product-list">
              <h4 className="font-semibold mb-3">
                {getProductTypeText(adminActiveTab)} 상품 목록
              </h4>

              {/* 예금 상품 목록 */}
              {adminActiveTab === "deposit" && renderProductTable(depositProducts, "deposit")}

              {/* 적금 상품 목록 */}
              {adminActiveTab === "saving" && renderProductTable(savingProducts, "saving")}

              {/* 대출 상품 목록 */}
              {adminActiveTab === "loan" && renderProductTable(loanProducts, "loan")}
            </div>
          </>
        );
    }
  }, [
    adminActiveTab,
    marketStatus,
    marketMessage,
    isCacheValid,
    lastFetchTime,
    CACHE_DURATION,
    newProductName,
    newProductPeriod,
    newProductRate,
    depositProducts,
    savingProducts,
    loanProducts,
    getProductTypeText,
    handleMarketControl,
    handleInitializeStocks,
    fetchMarketStatus,
    handleAddProduct,
    renderProductTable,
    classCode
  ]);

  return (
    <div className="admin-panel bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-4">관리자 기능</h3>

      {/* 관리자 탭 메뉴 */}
      <div className="admin-tabs mb-6 border-b">
        <div className="flex flex-wrap">
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "user"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("user")}
          >
            사용자 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "coupon"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("coupon")}
          >
            쿠폰 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "market"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("market")}
          >
            주식 시장 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "parking"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("parking")}
          >
            파킹 통장 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "deposit"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("deposit")}
          >
            예금 상품 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "saving"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("saving")}
          >
            적금 상품 관리
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              adminActiveTab === "loan"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500"
            }`}
            onClick={() => setAdminActiveTab("loan")}
          >
            대출 상품 관리
          </button>
        </div>
      </div>

      {/* 관리자 탭 내용 */}
      <div className="admin-tab-content">{renderTabContent}</div>
      
      {/* 디버그 정보 (개발환경에서만) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-6 p-3 bg-gray-100 text-xs text-gray-600 rounded">
          <strong>Firestore 최적화 정보:</strong><br />
          - 캐시 상태: {isCacheValid() ? '유효' : '무효'}<br />
          - 마지막 fetch: {lastFetchTime ? new Date(lastFetchTime).toLocaleTimeString() : '없음'}<br />
          - 대기 중인 쓰기 작업: {pendingWrites.length}개
        </div>
      )}
    </div>
  );
};

export default Admin;