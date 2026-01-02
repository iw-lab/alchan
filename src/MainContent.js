import React from "react";
import UserButton from "./UserButton"; // 올바른 경로

// 자식 컴포넌트들을 렌더링하고 UserButton을 포함하는 레이아웃 컴포넌트
export default function MainContent({ children }) {
  return (
    <div className="main-content">
      {children}
      {/* UserButton 컴포넌트가 없으므로 필요시 구현하거나 제거해야 합니다. */}
      {/* <UserButton /> */}
    </div>
  );
}
