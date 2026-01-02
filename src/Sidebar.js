// src/Sidebar.js 수정본 (역할 표시 오류 해결)
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import "./Sidebar.css";

export default function Sidebar({
  isOpen,
  menuItems,
  onNavigate,
  isFullscreen = false,
  onClose = () => { },
}) {
  const location = useLocation();
  const { userDoc } = useAuth(); // Firestore 사용자 정보를 userDoc으로 받습니다.

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    const initialExpanded = {};
    (menuItems || []).forEach((item) => {
      if (item?.isCategory) {
        initialExpanded[item.id] =
          item.id === "myAssetsCategory" ? true : !isMobile;
      }
    });
    setExpandedCategories(initialExpanded);
  }, [menuItems, isMobile]);

  const toggleCategory = (categoryId) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const isActive = (item) => {
    if (!item?.path) return false;
    return (
      location.pathname === item.path ||
      location.pathname.startsWith(`${item.path}/`)
    );
  };

  const handleItemClick = (item) => {
    if (item?.path && onNavigate) {
      onNavigate(item);
    }
  };

  const renderIcon = (icon, isCategory = false, itemName = "") => {
    const className = isCategory
      ? "sidebar-category-icon larger-icon"
      : "sidebar-menu-item-icon";
    const nameToUse = itemName || (typeof icon === "string" ? icon : "");
    return <span className={className}>{icon || "📁"}</span>;
  };

  const renderMyAssetsHeader = () => {
    const myAssetsItem = menuItems?.find((item) => item?.id === "dashboard");
    if (myAssetsItem) {
      const isItemActive = isActive(myAssetsItem);
      return (
        <div
          className={`sidebar-my-assets ${isItemActive ? "active" : ""}`}
          onClick={() => handleItemClick(myAssetsItem)}
        >
          {renderIcon(myAssetsItem.icon, false, myAssetsItem.name)}
          <span>{myAssetsItem.name}</span>
        </div>
      );
    }
    return null;
  };

  const renderMenuItems = () => {
    if (!menuItems?.length) return null;

    const renderedItems = [];
    menuItems.forEach((item) => {
      if (!item) return;
      if (item.superAdminOnly && !userDoc?.isSuperAdmin) return;
      if (item.adminOnly && !userDoc?.isAdmin && !userDoc?.isSuperAdmin) return;
      if (item.id === "dashboard") return;

      if (item.isCategory) {
        const isCategoryActive = menuItems.some(
          (subItem) =>
            subItem &&
            !subItem.isCategory &&
            subItem.categoryId === item.id &&
            isActive(subItem)
        );
        renderedItems.push(
          <div key={item.id} className="sidebar-category">
            <div
              className={`sidebar-category-header ${isCategoryActive ? "active" : ""
                }`}
              onClick={() => toggleCategory(item.id)}
            >
              {renderIcon(item.icon, true, item.name)}
              <span className="sidebar-category-title">{item.name}</span>
              <span
                className={`sidebar-category-arrow ${expandedCategories[item.id] ? "expanded" : ""
                  }`}
              >
                ▼
              </span>
            </div>
            <div
              className={`sidebar-category-items ${expandedCategories[item.id] ? "expanded" : ""
                }`}
            >
              {menuItems
                .filter(
                  (subItem) =>
                    subItem &&
                    !subItem.isCategory &&
                    subItem.categoryId === item.id
                )
                .map((subItem) => {
                  if (subItem.superAdminOnly && !userDoc?.isSuperAdmin) return null;
                  if (
                    subItem.adminOnly &&
                    !userDoc?.isAdmin &&
                    !userDoc?.isSuperAdmin
                  )
                    return null;
                  const isItemActive = isActive(subItem);
                  return (
                    <div
                      key={subItem.id}
                      className={`sidebar-menu-item ${isItemActive ? "active" : ""
                        }`}
                      onClick={() => handleItemClick(subItem)}
                    >
                      {renderIcon(subItem.icon, false, subItem.name)}
                      <span>{subItem.name}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      } else if (!item.categoryId) {
        const isItemActive = isActive(item);
        renderedItems.push(
          <div
            key={item.id}
            className={`sidebar-menu-item top-level ${isItemActive ? "active" : ""
              }`}
            onClick={() => handleItemClick(item)}
          >
            {renderIcon(item.icon, false, item.name)}
            <span>{item.name}</span>
          </div>
        );
      }
    });
    return renderedItems;
  };

  // --- 💡 수정된 부분 시작 ---
  // 역할(role)을 결정하는 로직
  let userRole = "학생";
  if (userDoc?.isSuperAdmin) {
    userRole = "앱 관리자";
  } else if (userDoc?.isAdmin) {
    userRole = "교사";
  }

  const userName = userDoc?.name || userDoc?.nickname || "사용자";
  // --- 수정된 부분 끝 ---

  return (
    <div
      className={`sidebar ${isOpen ? "open" : "closed"} ${isFullscreen ? "fullscreen" : ""
        }`}
      style={{ backgroundColor: "#0a0a12", borderRight: "1px solid rgba(0, 255, 242, 0.15)" }}
    >
      {isFullscreen && (
        <div className="fullscreen-menu-header">
          <div className="sidebar-title-container">
            <span className="fullscreen-menu-title">메뉴</span>
          </div>
          <button onClick={onClose} className="close-menu-button">
            ✕
          </button>
        </div>
      )}

      {!isFullscreen && renderMyAssetsHeader()}
      <div className="sidebar-menu-list">{renderMenuItems()}</div>

      {/* --- 💡 수정된 부분 시작: userDoc을 사용하여 사용자 정보 표시 --- */}
      {userDoc && (
        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="sidebar-user-name">{userName}</p>
              <p className="sidebar-user-role">{userRole}</p>
            </div>
          </div>
        </div>
      )}
      {/* --- 수정된 부분 끝 --- */}
    </div>
  );
}