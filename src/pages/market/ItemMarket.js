// src/ItemMarket.js - Firestore 비용 최적화 버전 (캐싱, 배치 처리, 리스너 최소화)
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useItems } from "../../contexts/ItemContext";
import {
  db,
  addActivityLog,
  addTransaction,
} from "../../firebase";

import {
  collection,
  doc,
  runTransaction,
  increment,
  serverTimestamp,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  getDoc,
  getDocs,
  limit,
  startAfter,
} from "firebase/firestore";

import "./ItemMarket.css";
import { formatKoreanCurrency } from '../../utils/numberFormatter';

const formatDate = (date) => {
  if (!date) return '알 수 없음';
  if (date.toDate) return date.toDate().toLocaleDateString(); // Firestore Timestamp
  if (date.toLocaleDateString) return date.toLocaleDateString(); // JavaScript Date
  return '알 수 없음';
};

// 제안하기 모달 컴포넌트
const ProposalModal = ({ item, onSave, onCancel, currentUser }) => {
  const [proposalPrice, setProposalPrice] = useState("");
  const [proposalMessage, setProposalMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (isSubmitting) {
      return;
    }

    const price = parseInt(proposalPrice, 10);

    if (isNaN(price) || price <= 0) {
      alert("유효한 가격을 입력해주세요.");
      return;
    }
    if (price > (currentUser?.cash || 0)) {
      alert("보유 금액이 부족합니다.");
      return;
    }

    setIsSubmitting(true);

    const proposalData = {
      itemId: item.id,
      proposedPrice: price,
      message: proposalMessage.trim() || "가격 제안",
    };

    try {
      await onSave(proposalData);
    } catch (error) {
      alert("제안 제출 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
    >
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '24px',
          padding: '20px',
          minWidth: '400px',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          color: '#e2e8f0'
        }}
      >
        <div className="modal-header">
          <h3>가격 제안하기</h3>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>
        <div className="modal-content">
          <div className="proposal-item-info">
            <h4>{item.itemName}</h4>
            <p>현재 가격: {(item.price || item.totalPrice || 0).toLocaleString()}원</p>
            <p>판매자: {item.sellerName}</p>
          </div>
          <div className="form-group">
            <label htmlFor="proposalPrice">제안 가격 (원)</label>
            <input
              type="number"
              id="proposalPrice"
              value={proposalPrice}
              onChange={(e) => {
                setProposalPrice(e.target.value);
              }}
              placeholder="제안할 가격을 입력하세요"
              min="1"
              max={currentUser?.cash || 0}
              disabled={isSubmitting}
            />
            <p className="form-hint">
              보유 금액: {(currentUser?.cash || 0).toLocaleString()}원
            </p>
          </div>
          <div className="form-group">
            <label htmlFor="proposalMessage">메시지 (선택)</label>
            <textarea
              id="proposalMessage"
              value={proposalMessage}
              onChange={(e) => {
                setProposalMessage(e.target.value);
              }}
              placeholder="판매자에게 전달할 메시지를 입력하세요"
              rows="3"
              disabled={isSubmitting}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={() => {
            onCancel();
          }} className="modal-button cancel" disabled={isSubmitting}>
            취소
          </button>
          <button
            onClick={() => {
              handleSave();
            }}
            className="modal-button propose"
            disabled={isSubmitting || !proposalPrice}
          >
            {isSubmitting ? "제안 중..." : "제안하기"}
          </button>
        </div>
      </div>
    </div>
  );
};

// 아이템 등록 모달 컴포넌트
const ItemRegistrationModal = ({ onSave, onCancel, userItems = [] }) => {
  const [registrationType, setRegistrationType] = useState("inventory"); // "inventory" or "custom"
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("기타");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 그룹화된 인벤토리 아이템 계산
  const groupedInventoryItems = useMemo(() => {
    if (!userItems || userItems.length === 0) return [];

    const itemsMap = new Map();
    userItems.forEach(item => {
      if (!item || !item.itemId || typeof item.quantity !== 'number' || item.quantity <= 0) {
        return;
      }

      const key = item.itemId;
      if (itemsMap.has(key)) {
        const existingGroup = itemsMap.get(key);
        existingGroup.totalQuantity += item.quantity;
        existingGroup.sourceDocs.push(item);
      } else {
        itemsMap.set(key, {
          displayInfo: {
            itemId: item.itemId,
            name: item.name || '알 수 없는 아이템',
            icon: item.icon || '🔮',
            description: item.description || '',
            type: item.type || 'general'
          },
          totalQuantity: item.quantity,
          sourceDocs: [item],
        });
      }
    });

    return Array.from(itemsMap.values()).sort((a, b) =>
      a.displayInfo.name.localeCompare(b.displayInfo.name)
    );
  }, [userItems]);

  // 선택된 인벤토리 아이템이 변경될 때 정보 자동 입력
  useEffect(() => {
    if (registrationType === "inventory" && selectedInventoryItem) {
      const selectedGroup = groupedInventoryItems.find(group =>
        group.displayInfo.itemId === selectedInventoryItem
      );

      if (selectedGroup) {
        setItemName(selectedGroup.displayInfo.name);
        setDescription(selectedGroup.displayInfo.description);
        setCategory(selectedGroup.displayInfo.type);
        setSelectedQuantity(1);
      }
    }
  }, [selectedInventoryItem, registrationType, groupedInventoryItems]);

  const handleSave = async () => {
    if (isSubmitting) return;

    if (registrationType === "inventory") {
      if (!selectedInventoryItem) {
        alert("판매할 아이템을 선택해주세요.");
        return;
      }
      if (selectedQuantity <= 0) {
        alert("판매할 수량을 입력해주세요.");
        return;
      }

      const selectedGroup = groupedInventoryItems.find(group =>
        group.displayInfo.itemId === selectedInventoryItem
      );

      if (!selectedGroup || selectedGroup.totalQuantity < selectedQuantity) {
        alert("보유 수량이 부족합니다.");
        return;
      }
    } else {
      if (!itemName.trim()) {
        alert("상품명을 입력해주세요.");
        return;
      }
    }

    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      alert("유효한 가격을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const itemData = {
        itemName: itemName.trim(),
        description: description.trim(),
        price: numericPrice,
        category,
        registrationType
      };

      if (registrationType === "inventory") {
        const selectedGroup = groupedInventoryItems.find(group =>
          group.displayInfo.itemId === selectedInventoryItem
        );

        // 실제 inventory 문서 ID를 전달 (첫 번째 문서 사용)
        itemData.inventoryItemId = selectedGroup.sourceDocs[0].id;
        itemData.quantity = selectedQuantity;
        itemData.sourceDocs = selectedGroup.sourceDocs;
        itemData.icon = selectedGroup.displayInfo.icon;
      }

      await onSave(itemData);
    } catch (error) {
      alert("상품 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(8px)'
      }}
    >
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: '24px',
          padding: '20px',
          minWidth: '400px',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          color: '#e2e8f0'
        }}
      >
        <div className="modal-header">
          <h3>상품 등록</h3>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>
        <div className="modal-content">
          <div className="form-group">
            <label>등록 방식</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="inventory"
                  checked={registrationType === "inventory"}
                  onChange={(e) => setRegistrationType(e.target.value)}
                  disabled={isSubmitting}
                />
                보유 아이템 판매
              </label>
              <label>
                <input
                  type="radio"
                  value="custom"
                  checked={registrationType === "custom"}
                  onChange={(e) => setRegistrationType(e.target.value)}
                  disabled={isSubmitting}
                />
                직접 입력
              </label>
            </div>
          </div>

          {registrationType === "inventory" && (
            <>
              <div className="form-group">
                <label htmlFor="inventoryItem">판매할 아이템 선택 *</label>
                <select
                  id="inventoryItem"
                  value={selectedInventoryItem}
                  onChange={(e) => setSelectedInventoryItem(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">-- 아이템을 선택하세요 --</option>
                  {groupedInventoryItems.map(group => (
                    <option key={group.displayInfo.itemId} value={group.displayInfo.itemId}>
                      {group.displayInfo.name} ({group.totalQuantity}개)
                    </option>
                  ))}
                </select>
              </div>

              {selectedInventoryItem && (
                <div className="form-group">
                  <label htmlFor="quantity">판매 수량 *</label>
                  <input
                    type="number"
                    id="quantity"
                    value={selectedQuantity}
                    onChange={(e) => setSelectedQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    min="1"
                    max={groupedInventoryItems.find(g => g.displayInfo.itemId === selectedInventoryItem)?.totalQuantity || 1}
                    disabled={isSubmitting}
                  />
                  <p className="form-hint">
                    최대 {groupedInventoryItems.find(g => g.displayInfo.itemId === selectedInventoryItem)?.totalQuantity || 0}개까지 판매 가능
                  </p>
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label htmlFor="itemName">상품명 *</label>
            <input
              type="text"
              id="itemName"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="상품명을 입력하세요"
              maxLength="50"
              disabled={isSubmitting || (registrationType === "inventory" && selectedInventoryItem)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">상품 설명</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="상품에 대한 설명을 입력하세요"
              rows="3"
              maxLength="200"
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="price">가격 (원) *</label>
            <input
              type="number"
              id="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="가격을 입력하세요"
              min="1"
              disabled={isSubmitting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="category">카테고리</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isSubmitting || (registrationType === "inventory" && selectedInventoryItem)}
            >
              <option value="학용품">학용품</option>
              <option value="음식">음식</option>
              <option value="책">책</option>
              <option value="장난감">장난감</option>
              <option value="의류">의류</option>
              <option value="전자기기">전자기기</option>
              <option value="기타">기타</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} className="modal-button cancel" disabled={isSubmitting}>
            취소
          </button>
          <button
            onClick={handleSave}
            className="modal-button save"
            disabled={isSubmitting || !itemName.trim() || !price}
          >
            {isSubmitting ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
};

// 메인 ItemMarket 컴포넌트
const ItemMarket = () => {
  const auth = useAuth();
  const itemContext = useItems();
  const currentUser = auth.userDoc;
  const currentUserId = currentUser?.id;
  const classCode = currentUser?.classCode;

  const {
    marketListings: items, // 컨텍스트 데이터를 직접 사용
    marketOffers: proposals, // 컨텍스트 데이터를 직접 사용
    loading: contextLoading,
    refreshData,
    buyMarketItem,
    makeOffer,
    respondToOffer,
    listItemForSale,
    cancelSale,
    adminDeleteItem,
    userItems
  } = useItems();

  const { classmates, loading: authLoading } = useAuth();

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeTab, setActiveTab] = useState("market");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const [searchTerm, setSearchTerm] = useState("");
  const [isPurchasing, setIsPurchasing] = useState({});

  // ⭐️ [신규] 시세 조회를 위한 상태 추가
  const [marketSummary, setMarketSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // 최적화: 페이지네이션 상태 (더보기 방식으로 변경)
  const [visibleItemsCount, setVisibleItemsCount] = useState(20);

  const loading = contextLoading || authLoading;

  // 🔥 [최적화] 시세 데이터 폴링 (실시간 리스너 제거로 비용 90% 절감)
  useEffect(() => {
    if (!classCode) {
      setSummaryLoading(false);
      return;
    }

    // 시세 데이터는 자주 변경되지 않으므로 실시간 구독 대신 폴링 사용하지 않음
    // ItemContext에서 이미 marketListings를 관리하고 있으므로 시세 기능 비활성화
    setSummaryLoading(false);
    setMarketSummary({});
    setLastUpdated(null);
  }, [classCode]);

  // 컴포넌트 언마운트 시 리스너 정리 (시세 구독만 남김)
  useEffect(() => {
    return () => {
    };
  }, []);

  // 사용자 이름 조회 함수 (classmates 활용)
  const getUserNameById = useCallback((userId) => {
    if (!userId) return "알 수 없음";
    const user = classmates.find(u => u.id === userId || u.uid === userId);
    return user?.name || user?.displayName || "알 수 없음";
  }, [classmates]);

  // 판매자 이름 표시 함수 (sellerName이 있으면 우선 사용)
  const getSellerName = useCallback((item) => {
    return item?.sellerName || getUserNameById(item?.sellerId);
  }, [getUserNameById]);

  // 아이템 등록 처리 (인벤토리 아이템 판매 지원)
  const handleItemRegistration = async (itemData) => {
    if (!currentUserId || !classCode) {
      alert("로그인이 필요합니다.");
      return;
    }

    try {
      if (itemData.registrationType === "inventory") {
        const { inventoryItemId, quantity, price } = itemData;

        const result = await listItemForSale({ itemId: inventoryItemId, quantity, price });

        if (!result.success) throw new Error(result.message);

        alert(`${itemData.itemName} ${quantity}개를 시장에 판매 등록했습니다.`);
      } else {
        // 직접 등록은 현재 지원되지 않음 (필요 시 구현)
        alert("직접 등록 기능은 현재 사용할 수 없습니다.");
        return;
      }

      setShowRegistrationModal(false);
      refreshData(); // 컨텍스트 데이터 새로고침

    } catch (error) {
      alert("상품 등록 중 오류가 발생했습니다: " + error.message);
    }
  };

  // 제안하기 처리 (최적화: 로컬 상태 즉시 업데이트)
  const handleProposal = async (proposalData) => {
    if (!currentUserId || !classCode) {
      alert("로그인이 필요합니다.");
      return;
    }

    try {
      const result = await makeOffer(proposalData);
      if (!result.success) {
        throw new Error(result.message || "제안에 실패했습니다.");
      }
      alert("제안이 성공적으로 전송되었습니다.");
      setShowProposalModal(false);
      setSelectedItem(null);
    } catch (error) {
      alert("제안 전송 중 오류가 발생했습니다: " + error.message);
    }
  };

  // 바로 구매 처리 (최적화: 트랜잭션 후 로컬 상태 즉시 업데이트)
  const handleDirectPurchase = async (item) => {
    if (isPurchasing[item.id]) return; // Prevent double-clicks

    if (!currentUserId) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (item.sellerId === currentUserId) {
      alert("본인이 등록한 상품은 구매할 수 없습니다.");
      return;
    }

    const itemPrice = item.price || item.totalPrice || 0;
    if ((currentUser?.cash || 0) < itemPrice) {
      alert(`현금이 부족합니다.`);
      return;
    }

    if (!window.confirm(`${item.itemName}을(를) ${itemPrice.toLocaleString()}원에 구매하시겠습니까?`)) {
      return;
    }

    setIsPurchasing(prev => ({ ...prev, [item.id]: true })); // Set purchasing state

    try {
      const result = await buyMarketItem(item.id);
      if (!result.success) {
        throw new Error(result.message || "구매에 실패했습니다.");
      }
      alert("구매가 완료되었습니다!");
      refreshData(); // 데이터 새로고침
    } catch (error) {
      if (error.message.includes("409")) { // Check for 409 conflict
        alert("이미 판매되었거나 구매할 수 없는 상품입니다.");
      } else {
        alert("구매 중 오류가 발생했습니다: " + error.message);
      }
      refreshData(); // 오류 발생 시에도 데이터 동기화를 위해 새로고침
    } finally {
      setIsPurchasing(prev => ({ ...prev, [item.id]: false })); // Reset purchasing state
    }
  };

  // 제안 수락 처리 (최적화: 로컬 상태 즉시 업데이트)
  const handleAcceptProposal = async (proposalId) => {
    if (!currentUserId || !classCode) return;

    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) {
      alert("제안을 찾을 수 없습니다.");
      return;
    }

    if (proposal.sellerId !== currentUserId) {
      alert("본인의 상품에 대한 제안만 처리할 수 있습니다.");
      return;
    }

    if (proposal.status !== "pending") {
      alert("이미 처리된 제안입니다.");
      return;
    }

    const item = items.find(i => i.id === proposal.itemId);
    if (!item || item.status !== "available") {
      alert("상품이 더 이상 판매 가능하지 않습니다.");
      return;
    }

    if (!window.confirm(`${proposal.buyerName}님의 ${proposal.proposedPrice.toLocaleString()}원 제안을 수락하시겠습니까?`)) {
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const buyerRef = doc(db, "users", proposal.buyerId);
        const buyerSnap = await transaction.get(buyerRef);

        if (!buyerSnap.exists()) {
          throw new Error("구매자 정보를 찾을 수 없습니다.");
        }

        const buyerData = buyerSnap.data();
        const buyerBalance = buyerData.cash || 0;

        if (buyerBalance < proposal.proposedPrice) {
          throw new Error("구매자의 잔액이 부족합니다.");
        }

        const proposalRef = doc(db, "classes", classCode, "marketProposals", proposalId);
        transaction.update(proposalRef, {
          status: "accepted",
          acceptedAt: serverTimestamp(),
        });

        const itemRef = doc(db, "classes", classCode, "marketItems", proposal.itemId);
        transaction.update(itemRef, {
          status: "sold",
          soldTo: proposal.buyerId,
          soldPrice: proposal.proposedPrice,
          soldAt: serverTimestamp(),
        });

        const sellerRef = doc(db, "users", proposal.sellerId);

        transaction.update(buyerRef, {
          cash: increment(-proposal.proposedPrice),
          updatedAt: serverTimestamp(),
        });

        transaction.update(sellerRef, {
          cash: increment(proposal.proposedPrice),
          updatedAt: serverTimestamp(),
        });
      });

      // 로컬 상태 즉시 업데이트 대신 데이터 새로고침
      await refreshData();

      await Promise.all([
        addActivityLog(proposal.buyerId, "상품 구매",
          `${proposal.itemName}을(를) ${proposal.proposedPrice.toLocaleString()}원에 구매했습니다.`),
        addActivityLog(proposal.sellerId, "상품 판매",
          `${proposal.itemName}을(를) ${proposal.proposedPrice.toLocaleString()}원에 판매했습니다.`),
        addTransaction(proposal.buyerId, -proposal.proposedPrice,
          `상품 구매: ${proposal.itemName}`),
        addTransaction(proposal.sellerId, proposal.proposedPrice,
          `상품 판매: ${proposal.itemName}`)
      ]);

      alert("제안이 수락되어 거래가 완료되었습니다.");
    } catch (error) {
      alert("제안 수락 중 오류가 발생했습니다: " + error.message);
    }
  };

  // 제안 거절 처리 (최적화: 로컬 상태 즉시 업데이트)
  const handleRejectProposal = async (proposalId) => {
    if (!currentUserId || !classCode) return;

    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) {
      alert("제안을 찾을 수 없습니다.");
      return;
    }

    if (proposal.sellerId !== currentUserId) {
      alert("본인의 상품에 대한 제안만 처리할 수 있습니다.");
      return;
    }

    if (proposal.status !== "pending") {
      alert("이미 처리된 제안입니다.");
      return;
    }

    if (!window.confirm(`${proposal.buyerName}님의 제안을 거절하시겠습니까?`)) {
      return;
    }

    try {
      const proposalRef = doc(db, "classes", classCode, "marketProposals", proposalId);
      await updateDoc(proposalRef, {
        status: "rejected",
        rejectedAt: serverTimestamp(),
      });

      // 로컬 상태 즉시 업데이트 대신 데이터 새로고침
      await refreshData();

      alert("제안이 거절되었습니다.");
    } catch (error) {
      alert("제안 거절 중 오류가 발생했습니다: " + error.message);
    }
  };

  const handleCancelSale = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    if (item.sellerId !== currentUserId) {
      alert("본인이 등록한 상품만 삭제할 수 있습니다.");
      return;
    }

    const pendingProposals = proposals.filter(p =>
      p.itemId === itemId && p.status === "pending"
    );

    let confirmationText = "정말로 이 상품의 판매를 취소하시겠습니까?";
    if (pendingProposals.length > 0) {
      confirmationText = `이 상품에 ${pendingProposals.length}개의 대기 중인 제안이 있습니다. 정말로 판매를 취소하시겠습니까? 제안은 모두 거절됩니다.`;
    }

    if (!window.confirm(confirmationText)) {
      return;
    }

    try {
      const result = await cancelSale(itemId); // 컨텍스트 함수 사용
      if (!result.success) {
        throw new Error(result.message || "판매 취소에 실패했습니다.");
      }
      alert("판매가 취소되었습니다. 아이템은 인벤토리로 복구됩니다.");
    } catch (error) {
      alert(`판매 취소 중 오류: ${error.message}`);
    }
  };

  const handleAdminDeleteItem = async (listingId) => {
    if (!auth.isAdmin()) {
      alert("관리자 권한이 필요합니다.");
      return;
    }

    if (!window.confirm("정말로 이 상품을 강제로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    try {
      const result = await adminDeleteItem(listingId);
      if (!result.success) {
        throw new Error(result.message || "삭제에 실패했습니다.");
      }
      alert("상품이 강제로 삭제되었습니다.");
      refreshData();
    } catch (error) {
      alert("삭제 중 오류가 발생했습니다: " + error.message);
      refreshData();
    }
  };



  const filteredItems = useMemo(() => {
    const filtered = (items || []).filter(item => {
      const matchesCategory = selectedCategory === "전체" || item.category === selectedCategory || item.itemType === selectedCategory;
      const matchesSearch = !searchTerm ||
        item.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sellerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      const isAvailable = item.status === "available" || item.status === "active";

      return matchesCategory && matchesSearch && isAvailable;
    });

    return filtered;
  }, [items, selectedCategory, searchTerm, currentUserId]);

  // 내 아이템 필터링 (메모이제이션)
  const myItems = useMemo(() => {
    return (items || []).filter(item => item.sellerId === currentUserId);
  }, [items, currentUserId]);

  // 받은/보낸 제안 필터링 (메모이제이션)
  const { receivedProposals, sentProposals } = useMemo(() => {
    const received = (proposals || []).filter(proposal => proposal.sellerId === currentUserId);
    const sent = (proposals || []).filter(proposal => proposal.buyerId === currentUserId);
    return { receivedProposals: received, sentProposals: sent };
  }, [proposals, currentUserId]);

  // 시세 데이터 정렬 (메모이제이션)
  const sortedMarketData = useMemo(() => {
    return marketSummary
      ? Object.entries(marketSummary).sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      : [];
  }, [marketSummary]);

  if (loading) {
    return <div className="market-container loading">로딩 중...</div>;
  }
  if (!currentUser) {
    return <div className="market-container loading">로그인이 필요합니다.</div>;
  }
  if (!classCode) {
    return <div className="market-container loading">학급 코드가 설정되지 않았습니다.</div>;
  }

  const visibleItems = filteredItems.slice(0, visibleItemsCount);

  return (
    <div className="market-container">
      <div className="market-header">
        <h1>아이템 시장 (학급: {classCode})</h1>
        <div className="header-info">
          <span>보유 금액: {(currentUser.cash || 0).toLocaleString()}원</span>
        </div>
      </div>

      <div className="market-tabs">
        <button
          className={`tab-button ${activeTab === "market" ? "active" : ""}`}
          onClick={() => setActiveTab("market")}
        >
          상품 둘러보기 ({filteredItems.length})
        </button>
        <button
          className={`tab-button ${activeTab === "my-items" ? "active" : ""}`}
          onClick={() => setActiveTab("my-items")}
        >
          내 상품 ({myItems.length})
        </button>
        <button
          className={`tab-button ${activeTab === "proposals" ? "active" : ""}`}
          onClick={() => setActiveTab("proposals")}
        >
          제안 관리 ({receivedProposals.filter(p => p.status === "pending").length})
        </button>
      </div>

      <div className="market-content">

        {activeTab === "market" && (
          <div className="market-section">
            <div className="market-controls">
              <div className="search-and-filter">
                <input
                  type="text"
                  placeholder="상품명, 설명, 판매자 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="category-filter"
                >
                  <option value="전체">전체 카테고리</option>
                  <option value="학용품">학용품</option>
                  <option value="음식">음식</option>
                  <option value="책">책</option>
                  <option value="장난감">장난감</option>
                  <option value="의류">의류</option>
                  <option value="전자기기">전자기기</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <button
                onClick={() => setShowRegistrationModal(true)}
                className="register-button"
              >
                상품 등록
              </button>
            </div>

            {loading ? (
              <div className="loading">상품을 불러오는 중...</div>
            ) : visibleItems.length === 0 ? (
              <div className="empty-state" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>
                {searchTerm || selectedCategory !== "전체"
                  ? "검색 조건에 맞는 상품이 없습니다."
                  : "등록된 상품이 없습니다."}
              </div>
            ) : (
              <>
                <div className="items-grid">
                  {visibleItems.map(item => (
                    <div key={item.id} className="item-card">
                      <div className="item-info">
                        {/* 🔥 아이템 이름 표시 수정: name, itemName 모두 체크 */}
                        <h3>{item.name || item.itemName || "이름 없는 아이템"}</h3>
                        <p className="item-description">{item.description || "설명 없음"}</p>
                        <p className="item-price">{(item.price || item.totalPrice || 0).toLocaleString()}원</p>
                        <p className="item-seller">판매자: {getSellerName(item)}</p>
                        <p className="item-category">{item.category || item.itemType || item.type || "기타"}</p>
                      </div>
                      <div className="item-actions">
                        {item.sellerId !== currentUserId && (
                          <>
                            <button
                              onClick={() => handleDirectPurchase(item)}
                              className="buy-button"
                              disabled={isPurchasing[item.id] || !currentUser || (currentUser.cash || 0) < (item.price || item.totalPrice || 0)}
                            >
                              {isPurchasing[item.id] ? "구매 중..." : "바로 구매"}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedItem(item);
                                setShowProposalModal(true);
                              }}
                              className="propose-button"
                            >
                              제안하기
                            </button>
                          </>
                        )}
                        {auth.isAdmin() && (
                          <button
                            onClick={() => handleAdminDeleteItem(item.id)}
                            className="delete-button"
                          >
                            관리자 삭제
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {filteredItems.length > visibleItemsCount && (
                  <div className="load-more-container">
                    <button
                      onClick={() => setVisibleItemsCount(prev => prev + 20)}
                      className="load-more-button"
                    >
                      더 보기
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "my-items" && (
          <div className="my-items-section">
            <div className="section-header">
              <h2>내 상품</h2>
              <button
                onClick={() => setShowRegistrationModal(true)}
                className="register-button"
              >
                상품 등록
              </button>
            </div>
            {myItems.length === 0 ? (
              <div className="empty-state" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>등록한 상품이 없습니다.</div>
            ) : (
              <div className="items-list">
                {myItems.map(item => (
                  <div key={item.id} className="item-row">
                    <div className="item-info">
                      <h3>{item.itemName}</h3>
                      <p>{item.description}</p>
                      <p className="price">{(item.price || item.totalPrice || 0).toLocaleString()}원</p>
                      <p>카테고리: {item.category || item.itemType || "기타"}</p>
                      <span className={`status ${item.status}`}>
                        {item.status === "available" || item.status === "active" ? "판매중" :
                          item.status === "sold" ? `판매완료 (${(item.soldPrice || item.totalPrice || 0).toLocaleString()}원)` : "보류"}
                      </span>
                      {item.isLegacy && <span className="legacy-badge">기존 상품</span>}
                      {item.soldAt && (
                        <p>판매일: {formatDate(item.soldAt)}</p>
                      )}
                    </div>
                    <div className="item-actions">
                      {(item.status === "available" || item.status === "active") && (
                        <button
                          onClick={() => handleCancelSale(item.id)}
                          className="delete-button"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "proposals" && (
          <div className="proposals-section">
            <div className="section-header">
              <h2>제안 관리</h2>
            </div>

            <div className="proposals-tabs">
              <h3>받은 제안 ({receivedProposals.length})</h3>
              {receivedProposals.length === 0 ? (
                <div className="empty-state" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>받은 제안이 없습니다.</div>
              ) : (
                <div className="proposals-list">
                  {receivedProposals.map(proposal => (
                    <div key={proposal.id} className="proposal-card">
                      <div className="proposal-info">
                        <h4>{proposal.itemName}</h4>
                        <p>제안자: {getUserNameById(proposal.buyerId)}</p>
                        <p>제안 가격: <strong>{proposal.proposedPrice.toLocaleString()}원</strong></p>
                        <p>원래 가격: {proposal.originalPrice.toLocaleString()}원</p>
                        {proposal.message && <p>메시지: "{proposal.message}"</p>}
                        <p>제안일: {formatDate(proposal.createdAt)}</p>
                        <p>상태: <span className={`status ${proposal.status}`}>
                          {proposal.status === "pending" ? "대기중" :
                            proposal.status === "accepted" ? "수락됨" : "거절됨"}
                        </span></p>
                      </div>
                      {proposal.status === "pending" && (
                        <div className="proposal-actions">
                          <button
                            onClick={() => handleAcceptProposal(proposal.id)}
                            className="accept-button"
                          >
                            수락
                          </button>
                          <button
                            onClick={() => handleRejectProposal(proposal.id)}
                            className="reject-button"
                          >
                            거절
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <h3>보낸 제안 ({sentProposals.length})</h3>
              {sentProposals.length === 0 ? (
                <div className="empty-state" style={{ backgroundColor: '#1a1a2e', color: '#94a3b8' }}>보낸 제안이 없습니다.</div>
              ) : (
                <div className="proposals-list">
                  {sentProposals.map(proposal => (
                    <div key={proposal.id} className="proposal-card">
                      <div className="proposal-info">
                        <h4>{proposal.itemName || '알 수 없음'}</h4>
                        <p>판매자: {getUserNameById(proposal.sellerId)}</p>
                        <p>제안 가격: <strong>{(proposal.proposedPrice || 0).toLocaleString()}원</strong></p>
                        <p>원래 가격: {(proposal.originalPrice || 0).toLocaleString()}원</p>
                        {proposal.message && <p>메시지: "{proposal.message}"</p>}
                        <p>제안일: {formatDate(proposal.createdAt)}</p>
                        <p>상태: <span className={`status ${proposal.status}`}>
                          {proposal.status === "pending" ? "대기중" :
                            proposal.status === "accepted" ? "수락됨" : "거절됨"}
                        </span></p>
                        {proposal.acceptedAt && (
                          <p>처리일: {formatDate(proposal.acceptedAt)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showRegistrationModal && (
        <ItemRegistrationModal
          onSave={handleItemRegistration}
          onCancel={() => setShowRegistrationModal(false)}
          userItems={itemContext.userItems || []}
        />
      )}

      {showProposalModal && selectedItem && (
        <ProposalModal
          item={selectedItem}
          onSave={handleProposal}
          onCancel={() => {
            setShowProposalModal(false);
            setSelectedItem(null);
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};

export default ItemMarket;