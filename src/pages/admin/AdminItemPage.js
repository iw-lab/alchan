// src/AdminItemPage.js
import React, { useState, useEffect } from "react";
import {
  Store,
  Plus,
  Pencil,
  Lightbulb,
  Gem,
  Check,
  X as XIcon,
  Circle,
} from "lucide-react";

const styles = {
  container: {
    padding: '24px',
    maxWidth: '1000px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
    border: '1px solid #eef2f7',
    padding: '0',
    marginBottom: '24px',
    overflow: 'hidden'
  },
  header: {
    padding: '20px 24px',
    marginBottom: '0',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    borderBottom: '1px solid #eef2f7',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  headerIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
    margin: 0,
    letterSpacing: '-0.01em'
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
    margin: '2px 0 0 0'
  },
  modeBadge: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 600
  },
  formSection: {
    backgroundColor: '#ffffff',
    padding: '24px',
    borderRadius: '16px',
    marginBottom: '20px',
    border: '1px solid #eef2f7'
  },
  formTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: '20px',
    letterSpacing: '-0.01em'
  },
  inputGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#334155',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    transition: 'all 0.15s ease',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    outline: 'none'
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    minHeight: '110px',
    resize: 'vertical',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.6
  },
  gridTwo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px'
  },
  button: {
    padding: '10px 18px',
    borderRadius: '10px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px'
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: 'white',
    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)'
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    color: '#475569',
    border: '1px solid #e2e8f0'
  },
  priceIncreaseSection: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    padding: '18px',
    borderRadius: '14px',
    marginBottom: '20px'
  },
  infoSection: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #bae6fd',
    padding: '18px',
    borderRadius: '14px',
    marginBottom: '20px'
  },
  helpText: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '8px',
    lineHeight: 1.6
  },
  checkboxWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: '#6366f1'
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '24px',
    paddingTop: '20px',
    borderTop: '1px solid #eef2f7'
  }
};

const EMPTY_ITEM = {
  name: "",
  description: "",
  price: "",
  stock: "",
  initialStock: "",
  available: true,
  priceIncreasePercentage: "10",
  excludeFromEconomicEvent: false,
};

const AdminItemPage = ({
  classCode,
  editingItemFromStore,
  onAddItem,
  onUpdateItem,
  onClose,
}) => {
  const isEditing = !!(editingItemFromStore && editingItemFromStore.id);
  const [successMsg, setSuccessMsg] = useState("");
  const [item, setItem] = useState(EMPTY_ITEM);

  useEffect(() => {
    if (editingItemFromStore) {
      setItem({
        ...EMPTY_ITEM,
        ...editingItemFromStore,
        priceIncreasePercentage: editingItemFromStore.priceIncreasePercentage || "10",
        excludeFromEconomicEvent: editingItemFromStore.excludeFromEconomicEvent === true,
      });
    } else {
      setItem(EMPTY_ITEM);
    }
  }, [editingItemFromStore]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setItem((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !item.name ||
      !item.price ||
      !item.stock ||
      isNaN(item.price) ||
      isNaN(item.stock) ||
      parseInt(item.price, 10) < 0 ||
      parseInt(item.stock, 10) < 0
    ) {
      alert("상품명, 가격, 재고를 올바르게 (0 이상 숫자) 입력해주세요.");
      return;
    }

    const itemData = {
      ...item,
      price: parseInt(item.price, 10),
      stock: parseInt(item.stock, 10),
      initialStock: item.initialStock
        ? parseInt(item.initialStock, 10)
        : parseInt(item.stock, 10),
      priceIncreasePercentage: parseFloat(item.priceIncreasePercentage) || 0,
      excludeFromEconomicEvent: item.excludeFromEconomicEvent === true,
      classCode,
    };

    const success = isEditing
      ? await onUpdateItem(itemData)
      : await onAddItem(itemData);

    if (success) {
      const msg = isEditing
        ? `"${itemData.name}" 아이템이 수정됐습니다!`
        : `"${itemData.name}" 아이템이 추가됐습니다!`;
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(""), 4000);

      if (!isEditing) {
        setItem(EMPTY_ITEM);
      }
    }
  };

  const handleCancel = () => {
    if (onClose) onClose();
    setItem(EMPTY_ITEM);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerIcon}>
            <Store size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h2 style={styles.title}>상점 관리 시스템</h2>
            <p style={styles.subtitle}>
              {isEditing
                ? "선택한 아이템의 정보를 수정해보세요"
                : "새로운 아이템을 상점에 추가해보세요"}
            </p>
          </div>
          <span
            style={{
              ...styles.modeBadge,
              backgroundColor: isEditing ? '#fef3c7' : '#eef2ff',
              color: isEditing ? '#b45309' : '#4f46e5',
              border: `1px solid ${isEditing ? '#fde68a' : '#c7d2fe'}`,
            }}
          >
            {isEditing ? (
              <>
                <Pencil size={12} strokeWidth={2.4} />
                수정 모드
              </>
            ) : (
              <>
                <Plus size={12} strokeWidth={2.8} />
                추가 모드
              </>
            )}
          </span>
        </div>

        <div style={{ padding: '28px', backgroundColor: '#fafbfc' }}>
          {successMsg && (
            <div style={{
              margin: '0 0 20px 0',
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              border: '1px solid #86efac',
              borderRadius: '12px',
              color: '#047857',
              fontWeight: 600,
              fontSize: '15px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}>
              <Check size={16} strokeWidth={2.5} />
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={styles.formSection}>
              <h3 style={styles.formTitle}>
                {isEditing ? "아이템 정보 수정" : "새 아이템 만들기"}
              </h3>

              {/* 기본 정보 */}
              <div style={styles.gridTwo}>
                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    상품명 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="name"
                    value={item.name}
                    onChange={handleChange}
                    placeholder="예: 마법의 물약"
                    required
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    기본 가격 (원) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="price"
                    type="number"
                    value={item.price}
                    onChange={handleChange}
                    placeholder="예: 1000"
                    required
                    min="0"
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    현재 재고 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="stock"
                    type="number"
                    value={item.stock}
                    onChange={handleChange}
                    placeholder="예: 10"
                    required
                    min="0"
                    style={styles.input}
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.label}>
                    초기 재고 (자동 보충 기준)
                  </label>
                  <input
                    name="initialStock"
                    type="number"
                    value={item.initialStock}
                    onChange={handleChange}
                    placeholder="미입력시 현재 재고와 동일"
                    min="0"
                    style={styles.input}
                  />
                </div>
              </div>

              {/* 가격 상승률 */}
              <div style={styles.priceIncreaseSection}>
                <label style={styles.label}>
                  자동 재고 보충 시 가격 상승률 (%)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    name="priceIncreasePercentage"
                    type="number"
                    value={item.priceIncreasePercentage}
                    onChange={handleChange}
                    placeholder="10"
                    min="0"
                    max="100"
                    step="0.5"
                    style={{ ...styles.input, width: '120px' }}
                  />
                  <span style={{ fontSize: '16px', color: '#374151', fontWeight: 600 }}>%</span>
                </div>
                <p style={{ ...styles.helpText, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <Lightbulb size={14} strokeWidth={2} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    재고가 0이 되어 자동으로 초기 재고만큼 보충될 때마다 가격이 설정한 비율만큼 상승합니다.<br />
                    예: 10% 설정 시, 1000원 → 1100원 → 1210원 순으로 상승
                  </span>
                </p>
              </div>

              {/* 경제이벤트 가격 변동 제외 */}
              <div style={styles.infoSection}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    cursor: "pointer",
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  <input
                    type="checkbox"
                    name="excludeFromEconomicEvent"
                    checked={!!item.excludeFromEconomicEvent}
                    onChange={handleChange}
                    style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: '#6366f1' }}
                  />
                  <Gem size={16} strokeWidth={2} style={{ color: '#0284c7' }} />
                  경제이벤트 가격 변동 제외
                </label>
                <p style={styles.helpText}>
                  체크하면 "물가 폭등/안정" 같은 경제이벤트로 이 아이템의 가격이 바뀌지 않습니다.<br />
                  예: 자유시간처럼 가치가 변하지 않아야 하는 아이템에 사용.
                </p>
              </div>

              {/* 상품 설명 */}
              <div style={styles.inputGroup}>
                <label style={styles.label}>상품 설명</label>
                <textarea
                  name="description"
                  value={item.description}
                  onChange={handleChange}
                  placeholder="아이템에 대한 자세한 설명을 입력해주세요."
                  style={styles.textarea}
                />
              </div>
            </div>

            {/* 하단 버튼 영역 */}
            <div style={styles.buttonGroup}>
              <label style={{ ...styles.checkboxWrapper, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="available"
                  checked={item.available}
                  onChange={handleChange}
                  style={styles.checkbox}
                />
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: item.available ? '#059669' : '#dc2626',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  backgroundColor: item.available ? '#ecfdf5' : '#fef2f2',
                  border: `1px solid ${item.available ? '#a7f3d0' : '#fecaca'}`
                }}>
                  <Circle
                    size={8}
                    fill={item.available ? '#10b981' : '#ef4444'}
                    strokeWidth={0}
                  />
                  {item.available ? "판매중" : "판매중지"}
                </span>
              </label>

              <div style={{ display: 'flex', gap: '12px' }}>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    style={{ ...styles.button, ...styles.secondaryButton }}
                  >
                    <XIcon size={15} strokeWidth={2.2} />
                    취소
                  </button>
                )}
                <button
                  type="submit"
                  style={{ ...styles.button, ...styles.primaryButton }}
                >
                  {isEditing ? (
                    <>
                      <Check size={16} strokeWidth={2.5} />
                      수정 완료
                    </>
                  ) : (
                    <>
                      <Plus size={16} strokeWidth={2.5} />
                      아이템 추가
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminItemPage;
