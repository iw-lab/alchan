// src/AdminItemPage.js
import React, { useState, useEffect } from "react";

// 50개 이상의 아이콘 컬렉션
const iconCollection = {
  "음식": ["🍕", "🍔", "🍟", "🌭", "🥐", "🥖", "🧀", "🍖", "🍗", "🥓", "🍳", "🥞"],
  "음료": ["☕", "🍵", "🧃", "🥤", "🧋", "🍺", "🍷", "🥛", "🍹", "🍸", "🍾", "🧉"],
  "과일": ["🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭"],
  "채소": ["🥦", "🥬", "🥒", "🌽", "🥕", "🫑", "🌶️", "🥔", "🍠", "🧄", "🧅", "🍄"],
  "디저트": ["🍰", "🎂", "🧁", "🥧", "🍮", "🍭", "🍬", "🍫", "🍩", "🍪", "🍦", "🧊"],
  "무기": ["⚔️", "🗡️", "🏹", "🛡️", "🪓", "🔫", "💣", "🧨", "🪃", "🥊", "🎯", "🏏"],
  "마법": ["✨", "💫", "⭐", "🌟", "💥", "⚡", "🔥", "❄️", "💧", "🌊", "🌪️", "☄️"],
  "보물": ["💎", "💍", "👑", "🏆", "🎁", "💰", "💵", "🪙", "🔮", "📿", "🗝️", "🎖️"],
  "도구": ["🔨", "🪛", "🔧", "🪚", "⛏️", "🪝", "🧲", "🔩", "⚙️", "🗜️", "⚖️", "🔦"],
  "의료": ["💊", "💉", "🩹", "🩺", "🧪", "🧫", "🩸", "🦠", "🧬", "🔬", "⚗️", "🌡️"],
  "자연": ["🌸", "🌺", "🌻", "🌹", "🌷", "🌱", "🌿", "🍀", "🎋", "🎍", "🌾", "🌴"],
  "특별": ["🎪", "🎨", "🎭", "🎪", "🎯", "🎲", "🎰", "🧩", "🪄", "🔔", "📯", "🥁"],
  "신규": ["🆕", "✅", "❌", "❓", "❗", "💯", "🔶", "🔷", "🔸", "🔹", "♠️", "♣️"]
};

const styles = {
  container: {
    padding: '20px',
    maxWidth: '1000px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
    border: '1px solid #e2e8f0',
    padding: '0',
    marginBottom: '20px',
    overflow: 'hidden'
  },
  header: {
    padding: '12px 20px 8px',
    marginBottom: '0',
    borderBottom: '1px solid #e5e7eb'
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#1e293b',
    margin: 0
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    marginTop: '0'
  },
  tab: {
    flex: 1,
    padding: '14px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    borderBottom: '2px solid transparent'
  },
  activeTab: {
    color: '#4f46e5',
    backgroundColor: '#ffffff',
    borderBottom: '2px solid #6366f1'
  },
  disabledTab: {
    opacity: '0.5',
    cursor: 'not-allowed'
  },
  formSection: {
    backgroundColor: '#ffffff',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
    border: '1px solid #e2e8f0'
  },
  formTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '20px'
  },
  inputGroup: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '6px'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'border-color 0.15s ease',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    color: '#0f172a'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    minHeight: '100px',
    resize: 'vertical',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    color: '#0f172a'
  },
  gridTwo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px'
  },
  iconSelector: {
    backgroundColor: '#f8fafc',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0'
  },
  selectedIcon: {
    fontSize: '36px',
    width: '64px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    border: '1px solid #c7d2fe',
    borderRadius: '12px',
    marginBottom: '12px'
  },
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  primaryButton: {
    background: '#6366f1',
    color: 'white'
  },
  secondaryButton: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0'
  },
  iconGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: '6px',
    marginTop: '12px'
  },
  iconButton: {
    fontSize: '24px',
    padding: '6px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  categoryButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '12px'
  },
  categoryButton: {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#ffffff',
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  activeCategoryButton: {
    backgroundColor: '#eef2ff',
    color: '#4f46e5',
    borderColor: '#c7d2fe'
  },
  priceIncreaseSection: {
    backgroundColor: '#fffbeb',
    border: '1px solid #fde68a',
    padding: '16px',
    borderRadius: '12px',
    marginBottom: '20px'
  },
  helpText: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '6px',
    lineHeight: '1.5'
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
    paddingTop: '16px',
    borderTop: '1px solid #e2e8f0'
  }
};

const AdminItemPage = ({
  classCode,
  editingItemFromStore,
  onAddItem,
  onUpdateItem,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState("addItem");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("마법");
  const [successMsg, setSuccessMsg] = useState("");
  const [item, setItem] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
    initialStock: "",
    icon: "✨",
    available: true,
    priceIncreasePercentage: "10", // [수정] 필드명을 priceIncreasePercentage로 변경
  });

  useEffect(() => {
    if (editingItemFromStore) {
      setItem({ 
        ...editingItemFromStore,
        // [수정] 필드명을 priceIncreasePercentage로 변경하고, 없는 경우 기본값 설정
        priceIncreasePercentage: editingItemFromStore.priceIncreasePercentage || "10"
      });
      setActiveTab("editItem");
    } else {
      setItem({
        name: "",
        description: "",
        price: "",
        stock: "",
        initialStock: "",
        icon: "✨",
        available: true,
        priceIncreasePercentage: "10", // [수정] 필드명을 priceIncreasePercentage로 변경
      });
    }
  }, [editingItemFromStore]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setItem((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleIconSelect = (icon) => {
    setItem(prev => ({ ...prev, icon }));
    setShowIconPicker(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isEditing = !!(item && item.id);

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
      // [수정] 저장하는 데이터의 필드명도 priceIncreasePercentage로 변경하고, 숫자로 변환
      priceIncreasePercentage: parseFloat(item.priceIncreasePercentage) || 0,
      classCode,
    };

    let success = false;
    if (isEditing) {
      success = await onUpdateItem(itemData);
    } else {
      success = await onAddItem(itemData);
    }

    if (success) {
      const msg = isEditing
        ? `✅ "${itemData.name}" 아이템이 수정됐습니다!`
        : `✅ "${itemData.name}" 아이템이 추가됐습니다!`;
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(""), 4000);

      if (!isEditing) {
        setItem({
          name: "",
          description: "",
          price: "",
          stock: "",
          initialStock: "",
          icon: "✨",
          available: true,
          priceIncreasePercentage: "10",
        });
        setActiveTab("addItem");
      }
    }
  };

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
    if (editingItemFromStore) {
      onClose();
    }
    if (tabName === 'addItem') {
      setItem({
        name: "",
        description: "",
        price: "",
        stock: "",
        initialStock: "",
        icon: "✨",
        available: true,
        priceIncreasePercentage: "10", // [수정] 필드명을 priceIncreasePercentage로 변경
      });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>🏪 상점 관리 시스템</h2>
        </div>

        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === "addItem" ? styles.activeTab : {})
            }}
            onClick={() => handleTabClick("addItem")}
          >
            ➕ 아이템 추가
          </button>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === "editItem" ? styles.activeTab : {}),
              ...((!editingItemFromStore) ? styles.disabledTab : {})
            }}
            disabled={!editingItemFromStore}
            onClick={() => setActiveTab("editItem")}
          >
            ✏️ 아이템 수정
          </button>
        </div>

        <div style={{ padding: '30px', backgroundColor: 'rgba(30, 41, 59, 0.9)' }}>
          {successMsg && (
            <div style={{
              margin: '0 0 20px 0',
              padding: '14px 20px',
              background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.15))',
              border: '1px solid rgba(34,197,94,0.5)',
              borderRadius: '12px',
              color: '#4ade80',
              fontWeight: 600,
              fontSize: '15px',
              textAlign: 'center',
              animation: 'fadeIn 0.3s ease',
            }}>
              {successMsg}
            </div>
          )}
          {(activeTab === "addItem" || activeTab === "editItem") && (
            <form onSubmit={handleSubmit}>
              <div style={styles.formSection}>
                <h3 style={styles.formTitle}>
                  {activeTab === "editItem" ? "아이템 정보 수정" : "새 아이템 만들기"}
                </h3>

                {/* 아이콘 선택 */}
                <div style={styles.iconSelector}>
                  <label style={styles.label}>아이템 아이콘</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={styles.selectedIcon}>
                      {item.icon}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      style={{ ...styles.button, ...styles.primaryButton }}
                    >
                      아이콘 선택
                    </button>
                  </div>

                  {showIconPicker && (
                    <div style={{
                      marginTop: '20px',
                      padding: '16px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      borderRadius: '8px',
                      width: '100%',
                      boxSizing: 'border-box',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={styles.categoryButtons}>
                        {Object.keys(iconCollection).map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setSelectedCategory(category)}
                            style={{
                              ...styles.categoryButton,
                              ...(selectedCategory === category ? styles.activeCategoryButton : {})
                            }}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                      <div style={styles.iconGrid}>
                        {iconCollection[selectedCategory].map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => handleIconSelect(icon)}
                            style={styles.iconButton}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
                              e.target.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                              e.target.style.transform = 'scale(1)';
                            }}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 기본 정보 */}
                <div style={styles.gridTwo}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>
                      상품명 <span style={{ color: 'red' }}>*</span>
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
                      기본 가격 (원) <span style={{ color: 'red' }}>*</span>
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
                      현재 재고 <span style={{ color: 'red' }}>*</span>
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
                      name="priceIncreasePercentage" // [수정] input의 name을 변경
                      type="number"
                      value={item.priceIncreasePercentage} // [수정] value를 변경
                      onChange={handleChange}
                      placeholder="10"
                      min="0"
                      max="100"
                      step="0.5"
                      style={{ ...styles.input, width: '120px' }}
                    />
                    <span style={{ fontSize: '16px', color: '#374151' }}>%</span>
                  </div>
                  <p style={styles.helpText}>
                    💡 재고가 0이 되어 자동으로 초기 재고만큼 보충될 때마다 가격이 설정한 비율만큼 상승합니다.<br />
                    예: 10% 설정 시, 1000원 → 1100원 → 1210원 순으로 상승
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
                <div style={styles.checkboxWrapper}>
                  <input
                    type="checkbox"
                    name="available"
                    checked={item.available}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <label style={{ fontSize: '16px', fontWeight: '500', color: '#e8e8ff' }}>
                    {item.available ? "🟢 판매중" : "🔴 판매중지"}
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  {activeTab === "editItem" && (
                    <button
                      type="button"
                      onClick={() => handleTabClick("addItem")}
                      style={{ ...styles.button, ...styles.secondaryButton }}
                    >
                      취소
                    </button>
                  )}
                  <button
                    type="submit"
                    style={{ ...styles.button, ...styles.primaryButton }}
                  >
                    {activeTab === "editItem" ? "✅ 수정 완료" : "➕ 아이템 추가"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminItemPage;