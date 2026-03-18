// src/pages/market/PersonalShop.js
// 개인 상점 시스템 - 학생들이 자기만의 가게를 만들고 상품/서비스를 판매
// 10% 부가세 자동 적용

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  runTransaction,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import "./PersonalShop.css";
import { logger } from "../../utils/logger";
import { formatKoreanCurrency } from "../../utils/numberFormatter";

// 부가세율 (10%)
const VAT_RATE = 0.1;

// 업종 카테고리
const SHOP_CATEGORIES = [
  { value: "food", label: "음식/간식", icon: "🍔" },
  { value: "craft", label: "수공예/만들기", icon: "🎨" },
  { value: "digital", label: "디지털/IT", icon: "💻" },
  { value: "education", label: "교육/과외", icon: "📚" },
  { value: "entertainment", label: "엔터테인먼트", icon: "🎮" },
  { value: "service", label: "서비스/대행", icon: "🛠️" },
  { value: "other", label: "기타", icon: "📦" },
];

// 상품/서비스 타입
const PRODUCT_TYPES = [
  {
    value: "product",
    label: "상품",
    icon: "📦",
    description: "물건을 판매합니다",
  },
  {
    value: "service",
    label: "서비스",
    icon: "🛠️",
    description: "서비스를 제공합니다",
  },
];

// ==================== 상점 생성/수정 모달 ====================
const ShopModal = ({ isOpen, onClose, shop, onSave }) => {
  const [formData, setFormData] = useState({
    shopName: "",
    description: "",
    category: "other",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (shop) {
      setFormData({
        shopName: shop.shopName || "",
        description: shop.description || "",
        category: shop.category || "other",
      });
    } else {
      setFormData({ shopName: "", description: "", category: "other" });
    }
  }, [shop, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.shopName.trim()) {
      alert("상점 이름을 입력해주세요!");
      return;
    }
    setLoading(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      logger.error("상점 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{shop ? "상점 수정" : "새 상점 만들기"}</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-content">
          <div className="form-group">
            <label>상점 이름 *</label>
            <input
              type="text"
              value={formData.shopName}
              onChange={(e) =>
                setFormData({ ...formData, shopName: e.target.value })
              }
              placeholder="예: 민수네 간식가게"
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label>업종</label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            >
              {SHOP_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>상점 소개</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="우리 가게를 소개해주세요!"
              rows={3}
              maxLength={100}
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="modal-button cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="modal-button confirm"
            >
              {loading ? "저장 중..." : shop ? "수정하기" : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==================== 상품/서비스 등록 모달 ====================
const ProductModal = ({ isOpen, onClose, product, shopId, onSave }) => {
  const [formData, setFormData] = useState({
    type: "product",
    name: "",
    description: "",
    price: "",
    stock: "",
  });
  const [loading, setLoading] = useState(false);

  // 부가세 계산
  const taxAmount = useMemo(() => {
    const price = parseInt(formData.price) || 0;
    return Math.round(price * VAT_RATE);
  }, [formData.price]);

  const totalPrice = useMemo(() => {
    const price = parseInt(formData.price) || 0;
    return price + taxAmount;
  }, [formData.price, taxAmount]);

  useEffect(() => {
    if (product) {
      setFormData({
        type: product.type || "product",
        name: product.name || "",
        description: product.description || "",
        price: product.price?.toString() || "",
        stock: product.stock >= 0 ? product.stock.toString() : "",
      });
    } else {
      setFormData({
        type: "product",
        name: "",
        description: "",
        price: "",
        stock: "",
      });
    }
  }, [product, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("상품/서비스 이름을 입력해주세요!");
      return;
    }
    if (!formData.price || parseInt(formData.price) <= 0) {
      alert("올바른 가격을 입력해주세요!");
      return;
    }
    if (
      formData.type === "product" &&
      (!formData.stock || parseInt(formData.stock) <= 0)
    ) {
      alert("상품의 재고 수량을 입력해주세요!");
      return;
    }

    setLoading(true);
    try {
      const productData = {
        type: formData.type,
        name: formData.name.trim(),
        description: formData.description.trim(),
        price: parseInt(formData.price),
        taxAmount: taxAmount,
        totalPrice: totalPrice,
        stock: formData.type === "service" ? -1 : parseInt(formData.stock),
      };
      await onSave(productData);
      onClose();
    } catch (error) {
      logger.error("상품 저장 오류:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{product ? "상품/서비스 수정" : "새 상품/서비스 등록"}</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-content">
          {/* 타입 선택 */}
          <div className="form-group">
            <label>종류 *</label>
            <div className="type-selector">
              {PRODUCT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`type-button ${formData.type === type.value ? "active" : ""}`}
                >
                  <span className="type-icon">{type.icon}</span>
                  <span className="type-label">{type.label}</span>
                  <span className="type-desc">{type.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 이름 */}
          <div className="form-group">
            <label>
              {formData.type === "product" ? "상품명" : "서비스명"} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder={
                formData.type === "product" ? "예: 수제 쿠키" : "예: 수학 과외"
              }
              maxLength={30}
            />
          </div>

          {/* 설명 */}
          <div className="form-group">
            <label>설명</label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="상품/서비스에 대해 설명해주세요"
              rows={2}
              maxLength={100}
            />
          </div>

          {/* 가격 */}
          <div className="form-group">
            <label>가격 (세전) *</label>
            <div className="input-with-suffix">
              <input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                placeholder="0"
                min="1"
              />
              <span className="suffix">원</span>
            </div>
          </div>

          {/* 부가세 안내 */}
          {formData.price && parseInt(formData.price) > 0 && (
            <div className="tax-info-box">
              <div className="tax-row">
                <span>상품 가격</span>
                <span>{formatKoreanCurrency(parseInt(formData.price))}</span>
              </div>
              <div className="tax-row highlight">
                <span>+ 부가세 (10%)</span>
                <span>+{formatKoreanCurrency(taxAmount)}</span>
              </div>
              <div className="tax-row total">
                <span>판매 가격</span>
                <span className="neon-text">
                  {formatKoreanCurrency(totalPrice)}
                </span>
              </div>
              <p className="tax-notice">
                부가세 10%는 국세청에 자동 납부됩니다
              </p>
            </div>
          )}

          {/* 재고 (상품인 경우만) */}
          {formData.type === "product" && (
            <div className="form-group">
              <label>재고 수량 *</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  value={formData.stock}
                  onChange={(e) =>
                    setFormData({ ...formData, stock: e.target.value })
                  }
                  placeholder="0"
                  min="1"
                />
                <span className="suffix">개</span>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="modal-button cancel"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="modal-button confirm"
            >
              {loading ? "저장 중..." : product ? "수정하기" : "등록하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==================== 구매 확인 모달 ====================
const PurchaseModal = ({ isOpen, onClose, product, shop, onConfirm }) => {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalAmount = useMemo(() => {
    return product ? product.totalPrice * quantity : 0;
  }, [product, quantity]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(quantity);
      onClose();
    } catch (error) {
      alert(error.message || "구매 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !product) return null;

  const maxQuantity =
    product.type === "service" ? 10 : Math.min(product.stock, 10);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>구매 확인</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-content">
          <div className="purchase-item-info">
            <div className="item-icon">
              {product.type === "product" ? "📦" : "🛠️"}
            </div>
            <div className="item-details">
              <h4>{product.name}</h4>
              <p className="shop-name">{shop?.shopName}</p>
              <p className="item-price">
                {formatKoreanCurrency(product.totalPrice)} (부가세 포함)
              </p>
            </div>
          </div>

          {/* 수량 선택 */}
          <div className="quantity-selector">
            <label>
              {product.type === "product" ? "구매 수량" : "이용 횟수"}
            </label>
            <div className="quantity-controls">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="quantity-btn"
              >
                -
              </button>
              <span className="quantity-value">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                className="quantity-btn"
              >
                +
              </button>
              {product.type === "product" && (
                <span className="stock-info">(재고: {product.stock}개)</span>
              )}
            </div>
          </div>

          {/* 결제 금액 */}
          <div className="total-amount-box">
            <span>총 결제 금액</span>
            <span className="total-price neon-text">
              {formatKoreanCurrency(totalAmount)}
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-button cancel">
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="modal-button confirm"
          >
            {loading ? "처리 중..." : "구매하기"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 상점 카드 컴포넌트 ====================
const ShopCard = ({ shop, onClick }) => {
  const category = SHOP_CATEGORIES.find((c) => c.value === shop.category);

  return (
    <div onClick={onClick} className="shop-card">
      <div className="shop-card-header">
        <div className="shop-icon">{category?.icon || "🏪"}</div>
        <div className="shop-info">
          <h3 className="shop-name">{shop.shopName}</h3>
          <p className="shop-owner">{shop.ownerName}님의 가게</p>
        </div>
      </div>
      {shop.description && (
        <p className="shop-description">{shop.description}</p>
      )}
      <div className="shop-card-footer">
        <span className="shop-category">{category?.label || "기타"}</span>
        <span className="shop-sales">
          총 매출: {formatKoreanCurrency(shop.totalSales || 0)}
        </span>
      </div>
    </div>
  );
};

// ==================== 상품 카드 컴포넌트 ====================
const ProductCard = ({ product, shop, onBuy, isOwner, onEdit, onDelete }) => {
  return (
    <div className="product-card">
      <div className="product-card-header">
        <div className="product-icon">
          {product.type === "product" ? "📦" : "🛠️"}
        </div>
        <div className="product-info">
          <div className="product-title-row">
            <h4 className="product-name">{product.name}</h4>
            <span className={`product-type-badge ${product.type}`}>
              {product.type === "product" ? "상품" : "서비스"}
            </span>
          </div>
          {product.description && (
            <p className="product-description">{product.description}</p>
          )}
          <div className="product-price-row">
            <span className="product-price neon-text">
              {formatKoreanCurrency(product.totalPrice)}
            </span>
            <span className="vat-included">(VAT 포함)</span>
            {product.type === "product" && (
              <span
                className={`stock-badge ${product.stock > 0 ? "" : "soldout"}`}
              >
                {product.stock > 0 ? `재고 ${product.stock}개` : "품절"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="product-card-actions">
        {isOwner ? (
          <>
            <button onClick={() => onEdit(product)} className="action-btn edit">
              ✏️ 수정
            </button>
            <button
              onClick={() => onDelete(product)}
              className="action-btn delete"
            >
              🗑️ 삭제
            </button>
          </>
        ) : (
          <button
            onClick={() => onBuy(product, shop)}
            disabled={product.type === "product" && product.stock <= 0}
            className="action-btn buy"
          >
            {product.type === "product" && product.stock <= 0
              ? "품절"
              : "🛒 구매하기"}
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== 메인 컴포넌트 ====================
const PersonalShop = () => {
  const {
    user: currentUser,
    userDoc: userProfile,
    refreshUserDocument,
    optimisticUpdate,
  } = useAuth();

  // 탭 상태
  const [activeTab, setActiveTab] = useState("browse"); // browse, myshop, sales

  // 상점 데이터
  const [shops, setShops] = useState([]);
  const [myShop, setMyShop] = useState(null);
  const [myProducts, setMyProducts] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [selectedShopProducts, setSelectedShopProducts] = useState([]);

  // 모달 상태
  const [showShopModal, setShowShopModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [purchaseProduct, setPurchaseProduct] = useState(null);
  const [purchaseShop, setPurchaseShop] = useState(null);

  // 로딩 상태
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // 판매/구매 내역
  const [salesHistory, setSalesHistory] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [salesFilter, setSalesFilter] = useState("all"); // all, sold, bought

  // 필터/검색
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // 상점 목록 로드 (같은 학급만)
  const loadShops = useCallback(async () => {
    try {
      setLoading(true);
      const shopsRef = collection(db, "personalShops");
      const userClassCode = userProfile?.classCode;
      // 같은 학급 상점만 조회 (classCode 없는 기존 문서 제외)
      const q = userClassCode
        ? query(shopsRef, where("status", "==", "active"), where("classCode", "==", userClassCode))
        : query(shopsRef, where("status", "==", "active"));

      const snapshot = await getDocs(q);
      const shopsData = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        // 클라이언트에서 정렬 및 제한
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB - dateA; // 최신순
        })
        .slice(0, 50);

      setShops(shopsData);
    } catch (error) {
      logger.error("상점 목록 로드 오류:", error);
    } finally {
      setLoading(false);
    }
  }, [userProfile]);

  // 내 상점 로드
  const loadMyShop = useCallback(async () => {
    if (!currentUser) return;
    try {
      const shopsRef = collection(db, "personalShops");
      const q = query(
        shopsRef,
        where("ownerId", "==", currentUser.uid),
        limit(1),
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const shopData = {
          id: snapshot.docs[0].id,
          ...snapshot.docs[0].data(),
        };

        // classCode 누락된 상점 자동 패치 (둘러보기 필터에서 보이도록)
        if (!shopData.classCode && userProfile?.classCode) {
          await updateDoc(doc(db, "personalShops", shopData.id), {
            classCode: userProfile.classCode,
            updatedAt: serverTimestamp(),
          });
          shopData.classCode = userProfile.classCode;
          logger.info("상점 classCode 자동 패치:", shopData.id);
        }

        setMyShop(shopData);

        // 내 상품 로드 (복합 인덱스 불필요 - 클라이언트 정렬)
        const productsRef = collection(db, "shopProducts");
        const pq = query(productsRef, where("shopId", "==", shopData.id));
        const pSnapshot = await getDocs(pq);
        const products = pSnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
          });
        setMyProducts(products);
      }
    } catch (error) {
      logger.error("내 상점 로드 오류:", error);
    }
  }, [currentUser, userProfile]);

  // 상점의 상품 로드 (복합 인덱스 불필요 - 클라이언트 필터+정렬)
  const loadShopProducts = useCallback(async (shopId) => {
    try {
      setLoadingProducts(true);
      const productsRef = collection(db, "shopProducts");
      const q = query(productsRef, where("shopId", "==", shopId));
      const snapshot = await getDocs(q);
      const products = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.status === "available")
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB - dateA;
        });
      setSelectedShopProducts(products);
    } catch (error) {
      logger.error("상품 로드 오류:", error);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // 판매/구매 내역 로드 (복합 인덱스 불필요 - 단일 필드 쿼리 + 클라이언트 필터링)
  const loadSalesHistory = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoadingSales(true);
      const activitiesRef = collection(db, "activities");

      // 단일 필드 쿼리로 조회 후 클라이언트에서 type 필터링
      const soldQuery = query(
        activitiesRef,
        where("sellerId", "==", currentUser.uid),
      );
      const boughtQuery = query(
        activitiesRef,
        where("buyerId", "==", currentUser.uid),
      );

      const [soldSnap, boughtSnap] = await Promise.all([
        getDocs(soldQuery),
        getDocs(boughtQuery),
      ]);

      const allHistory = [];

      soldSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.type === "shop_purchase") {
          allHistory.push({ id: d.id, ...data, role: "seller" });
        }
      });

      boughtSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.type === "shop_purchase") {
          allHistory.push({ id: d.id, ...data, role: "buyer" });
        }
      });

      // 최신순 정렬
      allHistory.sort((a, b) => {
        const dateA = a.timestamp?.toDate?.() || new Date(0);
        const dateB = b.timestamp?.toDate?.() || new Date(0);
        return dateB - dateA;
      });

      setSalesHistory(allHistory);

      // 구매 기록 중 인벤토리에 누락된 아이템 자동 동기화
      const buyerRecords = allHistory.filter((h) => h.role === "buyer");
      for (const record of buyerRecords) {
        if (!record.productId) continue;
        const inventoryItemId = `ps_${record.productId}`;
        const invRef = doc(db, "users", currentUser.uid, "inventory", inventoryItemId);
        const invSnap = await getDoc(invRef);
        if (!invSnap.exists()) {
          await setDoc(invRef, {
            itemId: inventoryItemId,
            name: record.productName || "알 수 없는 아이템",
            icon: record.productType === "service" ? "🛠️" : "📦",
            description: `${record.shopName || "개인상점"}에서 구매한 ${record.productType === "service" ? "서비스" : "상품"}`,
            type: record.productType || "product",
            quantity: record.quantity || 1,
            price: record.unitPrice || 0,
            source: "personalShop",
            shopId: record.shopId || "",
            shopName: record.shopName || "",
            sellerId: record.sellerId || "",
            purchasedAt: record.timestamp || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          logger.info(`인벤토리 동기화: ${record.productName}`);
        }
      }
    } catch (error) {
      logger.error("거래 내역 로드 오류:", error);
    } finally {
      setLoadingSales(false);
    }
  }, [currentUser]);

  // 초기 로드
  useEffect(() => {
    loadShops();
    loadMyShop();
  }, [loadShops, loadMyShop]);

  // 판매 내역 탭 진입 시 로드
  useEffect(() => {
    if (activeTab === "sales") {
      loadSalesHistory();
    }
  }, [activeTab, loadSalesHistory]);

  // 상점 선택 시 상품 로드
  useEffect(() => {
    if (selectedShop) {
      loadShopProducts(selectedShop.id);
    }
  }, [selectedShop, loadShopProducts]);

  // 상점 생성/수정
  const handleSaveShop = async (formData) => {
    if (!currentUser) return;

    if (myShop) {
      // 수정
      await updateDoc(doc(db, "personalShops", myShop.id), {
        ...formData,
        updatedAt: serverTimestamp(),
      });
    } else {
      // 생성
      await addDoc(collection(db, "personalShops"), {
        ...formData,
        ownerId: currentUser.uid,
        ownerName: userProfile?.name || "익명",
        classCode: userProfile?.classCode || null,
        status: "active",
        totalSales: 0,
        totalTaxPaid: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await loadMyShop();
    await loadShops();
  };

  // 상품 등록/수정
  const handleSaveProduct = async (productData) => {
    if (!myShop) return;

    if (editingProduct) {
      // 수정
      await updateDoc(doc(db, "shopProducts", editingProduct.id), {
        ...productData,
        updatedAt: serverTimestamp(),
      });
    } else {
      // 등록
      await addDoc(collection(db, "shopProducts"), {
        ...productData,
        shopId: myShop.id,
        ownerId: currentUser.uid,
        classCode: userProfile?.classCode || null,
        status: "available",
        soldCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    setEditingProduct(null);
    await loadMyShop();
  };

  // 상품 삭제
  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`"${product.name}"을(를) 삭제하시겠습니까?`)) return;

    await deleteDoc(doc(db, "shopProducts", product.id));
    await loadMyShop();
  };

  // 구매 처리
  const handlePurchase = async (quantity) => {
    if (!currentUser || !purchaseProduct || !purchaseShop) {
      throw new Error("구매 정보가 올바르지 않습니다.");
    }

    const totalAmount = purchaseProduct.totalPrice * quantity;
    const taxAmount = purchaseProduct.taxAmount * quantity;
    const sellerAmount = purchaseProduct.price * quantity;

    // 잔액 확인
    if ((userProfile?.cash || 0) < totalAmount) {
      throw new Error("잔액이 부족합니다!");
    }

    // 본인 상점 구매 불가
    if (purchaseShop.ownerId === currentUser.uid) {
      throw new Error("본인 상점에서는 구매할 수 없습니다!");
    }

    // 트랜잭션 전에 관리자 UID 조회 (세금 입금용)
    const classCode = userProfile?.classCode;
    let adminUid = null;
    if (classCode) {
      const { getClassAdminUid } = await import("../../firebase/db/core");
      adminUid = await getClassAdminUid(classCode);
    }

    // 🔥 낙관적 업데이트: 즉시 현금 차감 표시
    if (optimisticUpdate) {
      optimisticUpdate({ cash: -totalAmount });
    }

    try {
      await runTransaction(db, async (transaction) => {
        // 🔹 모든 읽기를 먼저 수행 (Firestore 트랜잭션 규칙)
        const inventoryItemId = `ps_${purchaseProduct.id}`;
        const inventoryRef = doc(db, "users", currentUser.uid, "inventory", inventoryItemId);
        const inventorySnap = await transaction.get(inventoryRef);

        // 🔹 이후 쓰기 수행
        // 구매자 잔액 차감
        const buyerRef = doc(db, "users", currentUser.uid);
        transaction.update(buyerRef, {
          cash: increment(-totalAmount),
        });

        // 판매자 잔액 증가 (세전 금액)
        const sellerRef = doc(db, "users", purchaseShop.ownerId);
        transaction.update(sellerRef, {
          cash: increment(sellerAmount),
        });

        // 국세청 세금 기록 (부가세) - nationalTreasuries 컬렉션 사용
        if (classCode) {
          const treasuryRef = doc(db, "nationalTreasuries", classCode);
          transaction.set(
            treasuryRef,
            {
              totalAmount: increment(taxAmount),
              vatRevenue: increment(taxAmount),
              lastUpdated: serverTimestamp(),
            },
            { merge: true },
          );

          // 관리자(선생님) cash에 세금 추가
          if (adminUid) {
            const adminRef = doc(db, "users", adminUid);
            transaction.update(adminRef, {
              cash: increment(taxAmount),
              updatedAt: serverTimestamp(),
            });
          }
        }

        // 상점 매출 업데이트
        const shopRef = doc(db, "personalShops", purchaseShop.id);
        transaction.update(shopRef, {
          totalSales: increment(sellerAmount),
          totalTaxPaid: increment(taxAmount),
        });

        // 상품 재고/판매량 업데이트
        const productRef = doc(db, "shopProducts", purchaseProduct.id);
        const updates = { soldCount: increment(quantity) };
        if (purchaseProduct.type === "product") {
          updates.stock = increment(-quantity);
          if (purchaseProduct.stock - quantity <= 0) {
            updates.status = "soldout";
          }
        }
        transaction.update(productRef, updates);

        // 구매자 인벤토리에 아이템 추가
        const category = SHOP_CATEGORIES.find(c => c.value === purchaseShop.category);
        const productType = PRODUCT_TYPES.find(t => t.value === purchaseProduct.type);

        if (inventorySnap.exists()) {
          transaction.update(inventoryRef, {
            quantity: increment(quantity),
            updatedAt: serverTimestamp(),
          });
        } else {
          transaction.set(inventoryRef, {
            itemId: inventoryItemId,
            name: purchaseProduct.name,
            icon: productType?.icon || category?.icon || "📦",
            description: `${purchaseShop.shopName}에서 구매한 ${purchaseProduct.type === "service" ? "서비스" : "상품"}`,
            type: purchaseProduct.type || "product",
            quantity: quantity,
            price: purchaseProduct.totalPrice,
            source: "personalShop",
            shopId: purchaseShop.id,
            shopName: purchaseShop.shopName,
            sellerId: purchaseShop.ownerId,
            purchasedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // 거래 기록
        const activityRef = collection(db, "activities");
        transaction.set(doc(activityRef), {
          type: "shop_purchase",
          buyerId: currentUser.uid,
          buyerName: userProfile?.name || "익명",
          sellerId: purchaseShop.ownerId,
          sellerName: purchaseShop.ownerName,
          shopId: purchaseShop.id,
          shopName: purchaseShop.shopName,
          productId: purchaseProduct.id,
          productName: purchaseProduct.name,
          productType: purchaseProduct.type,
          quantity: quantity,
          unitPrice: purchaseProduct.totalPrice,
          totalAmount: totalAmount,
          taxAmount: taxAmount,
          classCode: userProfile?.classCode || null,
          timestamp: serverTimestamp(),
        });
      });
    } catch (error) {
      // 트랜잭션 실패 시 낙관적 업데이트 롤백
      if (optimisticUpdate) {
        optimisticUpdate({ cash: totalAmount });
      }
      throw error;
    }

    // 잔액 갱신
    if (refreshUserDocument) {
      await refreshUserDocument();
    }

    // 상품 목록 갱신
    if (selectedShop) {
      await loadShopProducts(selectedShop.id);
    }

    setPurchaseProduct(null);
    setPurchaseShop(null);
    alert("구매가 완료되었습니다!");
  };

  // 필터링된 거래 내역
  const filteredSalesHistory = useMemo(() => {
    if (salesFilter === "all") return salesHistory;
    if (salesFilter === "sold") return salesHistory.filter((h) => h.role === "seller");
    if (salesFilter === "bought") return salesHistory.filter((h) => h.role === "buyer");
    return salesHistory;
  }, [salesHistory, salesFilter]);

  // 판매 통계
  const salesStats = useMemo(() => {
    const sold = salesHistory.filter((h) => h.role === "seller");
    const bought = salesHistory.filter((h) => h.role === "buyer");
    return {
      totalSold: sold.length,
      totalBought: bought.length,
      totalRevenue: sold.reduce((sum, h) => sum + (h.totalAmount - h.taxAmount), 0),
      totalSpent: bought.reduce((sum, h) => sum + h.totalAmount, 0),
      totalTaxPaid: sold.reduce((sum, h) => sum + h.taxAmount, 0),
    };
  }, [salesHistory]);

  // 필터링된 상점 목록
  const filteredShops = useMemo(() => {
    return shops.filter((shop) => {
      if (categoryFilter !== "all" && shop.category !== categoryFilter)
        return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          shop.shopName.toLowerCase().includes(q) ||
          shop.ownerName.toLowerCase().includes(q) ||
          (shop.description && shop.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [shops, categoryFilter, searchQuery]);

  // 탭 콘텐츠 렌더링
  const renderTabContent = () => {
    switch (activeTab) {
      case "browse":
        return (
          <div className="tab-content">
            {/* 상점 상세 보기 */}
            {selectedShop ? (
              <div className="shop-detail-view">
                <button
                  onClick={() => {
                    setSelectedShop(null);
                    setSelectedShopProducts([]);
                  }}
                  className="back-button"
                >
                  ← 상점 목록으로
                </button>

                {/* 상점 정보 */}
                <div className="shop-detail-header">
                  <div className="shop-detail-icon">
                    {SHOP_CATEGORIES.find(
                      (c) => c.value === selectedShop.category,
                    )?.icon || "🏪"}
                  </div>
                  <div className="shop-detail-info">
                    <h2>{selectedShop.shopName}</h2>
                    <p className="owner">{selectedShop.ownerName}님의 가게</p>
                    {selectedShop.description && (
                      <p className="description">{selectedShop.description}</p>
                    )}
                  </div>
                </div>

                {/* 상품 목록 */}
                <div className="products-section">
                  <h3>판매 상품</h3>
                  {loadingProducts ? (
                    <div className="loading-state">상품을 불러오는 중...</div>
                  ) : selectedShopProducts.length === 0 ? (
                    <div className="empty-state">
                      <span className="empty-icon">📭</span>
                      <p>등록된 상품이 없습니다</p>
                    </div>
                  ) : (
                    <div className="products-grid">
                      {selectedShopProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          shop={selectedShop}
                          onBuy={(p, s) => {
                            setPurchaseProduct(p);
                            setPurchaseShop(s);
                          }}
                          isOwner={false}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* 상점 목록 */
              <div className="shop-list-view">
                {/* 필터 & 검색 */}
                <div className="controls-section">
                  <div className="search-box">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="상점 검색..."
                      className="search-input"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="category-filter"
                  >
                    <option value="all">전체 업종</option>
                    {SHOP_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 상점 그리드 */}
                {loading ? (
                  <div className="loading-state">상점을 불러오는 중...</div>
                ) : filteredShops.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">🏪</span>
                    <p>
                      {searchQuery || categoryFilter !== "all"
                        ? "검색 결과가 없습니다"
                        : "아직 등록된 상점이 없습니다"}
                    </p>
                  </div>
                ) : (
                  <div className="shops-grid">
                    {filteredShops.map((shop) => (
                      <ShopCard
                        key={shop.id}
                        shop={shop}
                        onClick={() => setSelectedShop(shop)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case "myshop":
        return (
          <div className="tab-content">
            {myShop ? (
              <div className="my-shop-view">
                {/* 내 상점 정보 */}
                <div className="my-shop-header">
                  <div className="my-shop-info">
                    <div className="my-shop-icon">
                      {SHOP_CATEGORIES.find((c) => c.value === myShop.category)
                        ?.icon || "🏪"}
                    </div>
                    <div className="my-shop-details">
                      <h2>{myShop.shopName}</h2>
                      <p className="category">
                        {
                          SHOP_CATEGORIES.find(
                            (c) => c.value === myShop.category,
                          )?.label
                        }
                      </p>
                      {myShop.description && (
                        <p className="description">{myShop.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setShowShopModal(true)}
                      className="edit-shop-btn"
                    >
                      ✏️ 수정
                    </button>
                  </div>
                  <div className="my-shop-stats">
                    <div className="stat-item">
                      <span className="stat-label">총 매출</span>
                      <span className="stat-value neon-text">
                        {formatKoreanCurrency(myShop.totalSales || 0)}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">납부한 부가세</span>
                      <span className="stat-value">
                        {formatKoreanCurrency(myShop.totalTaxPaid || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 상품 등록 버튼 */}
                <div className="products-header">
                  <h3>내 상품/서비스 ({myProducts.length})</h3>
                  <button
                    onClick={() => {
                      setEditingProduct(null);
                      setShowProductModal(true);
                    }}
                    className="add-product-btn"
                  >
                    ➕ 등록하기
                  </button>
                </div>

                {/* 내 상품 목록 */}
                {myProducts.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📦</span>
                    <p>등록된 상품이 없습니다</p>
                    <span className="empty-hint">
                      상품이나 서비스를 등록해보세요!
                    </span>
                  </div>
                ) : (
                  <div className="products-grid">
                    {myProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        shop={myShop}
                        isOwner={true}
                        onEdit={(p) => {
                          setEditingProduct(p);
                          setShowProductModal(true);
                        }}
                        onDelete={handleDeleteProduct}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* 상점 없음 - 생성 안내 */
              <div className="create-shop-view">
                <div className="create-shop-card">
                  <span className="create-icon">🏪</span>
                  <h2>나만의 상점을 만들어보세요!</h2>
                  <p>상품이나 서비스를 판매하고 수익을 올려보세요</p>
                  <button
                    onClick={() => setShowShopModal(true)}
                    className="create-shop-btn"
                  >
                    🏪 상점 만들기
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case "sales":
        return (
          <div className="tab-content">
            {/* 통계 요약 */}
            <div className="sales-stats">
              <div className="stat-card sold">
                <span className="stat-label">판매 수입</span>
                <span className="stat-value">{formatKoreanCurrency(salesStats.totalRevenue)}</span>
                <span className="stat-sub">{salesStats.totalSold}건 판매 / 세금 {formatKoreanCurrency(salesStats.totalTaxPaid)}</span>
              </div>
              <div className="stat-card bought">
                <span className="stat-label">구매 지출</span>
                <span className="stat-value">{formatKoreanCurrency(salesStats.totalSpent)}</span>
                <span className="stat-sub">{salesStats.totalBought}건 구매</span>
              </div>
            </div>

            {/* 필터 */}
            <div className="sales-filter">
              {[
                { id: "all", label: "전체" },
                { id: "sold", label: "판매" },
                { id: "bought", label: "구매" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSalesFilter(f.id)}
                  className={`filter-chip ${salesFilter === f.id ? "active" : ""}`}
                >
                  {f.label}
                </button>
              ))}
              <button
                onClick={loadSalesHistory}
                className="refresh-btn"
                disabled={loadingSales}
              >
                {loadingSales ? "..." : "새로고침"}
              </button>
            </div>

            {/* 내역 목록 */}
            {loadingSales ? (
              <div className="loading-state">거래 내역 불러오는 중...</div>
            ) : filteredSalesHistory.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📊</span>
                <p>거래 내역이 없습니다</p>
                <span className="empty-hint">상품을 사고팔면 여기에 기록됩니다</span>
              </div>
            ) : (
              <div className="sales-list">
                {filteredSalesHistory.map((record) => {
                  const isSeller = record.role === "seller";
                  const date = record.timestamp?.toDate?.();
                  const dateStr = date
                    ? `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
                    : "";
                  return (
                    <div key={record.id} className={`sales-record ${isSeller ? "record-sold" : "record-bought"}`}>
                      <div className="record-icon">
                        {isSeller ? "💰" : "🛒"}
                      </div>
                      <div className="record-info">
                        <div className="record-title">
                          <span className={`record-badge ${isSeller ? "badge-sold" : "badge-bought"}`}>
                            {isSeller ? "판매" : "구매"}
                          </span>
                          <span className="record-product">{record.productName}</span>
                          {record.quantity > 1 && (
                            <span className="record-qty">x{record.quantity}</span>
                          )}
                        </div>
                        <div className="record-detail">
                          {isSeller
                            ? `구매자: ${record.buyerName}`
                            : `판매자: ${record.sellerName} (${record.shopName})`}
                        </div>
                      </div>
                      <div className="record-amount-area">
                        <span className={`record-amount ${isSeller ? "amount-plus" : "amount-minus"}`}>
                          {isSeller ? "+" : "-"}{formatKoreanCurrency(isSeller ? record.totalAmount - record.taxAmount : record.totalAmount)}
                        </span>
                        {isSeller && record.taxAmount > 0 && (
                          <span className="record-tax">세금 -{formatKoreanCurrency(record.taxAmount)}</span>
                        )}
                        <span className="record-date">{dateStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="personal-shop-container">
      {/* 헤더 */}
      <div className="market-header">
        <h1>개인 상점</h1>
        <p className="header-subtitle">
          나만의 상점을 열고 상품/서비스를 판매해보세요!
        </p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="market-tabs">
        {[
          { id: "browse", label: "상점 둘러보기", icon: "🛍️" },
          { id: "myshop", label: "내 상점", icon: "🏪" },
          { id: "sales", label: "판매 내역", icon: "📊" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedShop(null);
            }}
            className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      {renderTabContent()}

      {/* 모달들 */}
      <ShopModal
        isOpen={showShopModal}
        onClose={() => setShowShopModal(false)}
        shop={myShop}
        onSave={handleSaveShop}
      />

      <ProductModal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        shopId={myShop?.id}
        onSave={handleSaveProduct}
      />

      <PurchaseModal
        isOpen={!!purchaseProduct}
        onClose={() => {
          setPurchaseProduct(null);
          setPurchaseShop(null);
        }}
        product={purchaseProduct}
        shop={purchaseShop}
        onConfirm={handlePurchase}
      />
    </div>
  );
};

export default PersonalShop;
