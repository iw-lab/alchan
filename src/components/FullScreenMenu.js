import React from "react";

export default function FullScreenMenu({
  showMenu,
  setShowMenu,
  menuItems,
  onMenuItemClick,
}) {
  if (!showMenu) {
    return null; // 메뉴가 보이지 않을 때는 아무것도 렌더링하지 않음
  }

  return (
    <div
      style={{
        position: "fixed", // 전체 화면을 덮도록 fixed 위치
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.95)", // 반투명 어두운 배경
        color: "white", // 메뉴 텍스트 색상
        zIndex: 2000, // 다른 요소들 위에 표시
        display: "flex",
        flexDirection: "column", // 메뉴 항목 세로 배치
        alignItems: "center", // 가로 중앙 정렬
        justifyContent: "center", // 세로 중앙 정렬 (또는 상단에서 시작)
        padding: "20px",
        overflowY: "auto", // 내용이 많아지면 스크롤 가능
      }}
    >
      <button
        onClick={() => setShowMenu(false)} // 메뉴 닫기 버튼
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          backgroundColor: "transparent",
          border: "1px solid white",
          color: "white",
          borderRadius: "4px",
          padding: "5px 10px",
          cursor: "pointer",
          fontSize: "14px",
        }}
      >
        닫기
      </button>

      <h2 style={{ marginTop: 0, marginBottom: "30px", color: "white" }}>
        메뉴
      </h2>

      <ul style={{ listStyle: "none", padding: 0, textAlign: "center" }}>
        {menuItems.map((item) => (
          <li key={item.id} style={{ marginBottom: "20px" }}>
            <button
              onClick={() => onMenuItemClick(item.id)} // 항목 클릭 시 핸들러 호출
              style={{
                background: "none",
                border: "none",
                color: "white",
                fontSize: "24px", // 메뉴 항목 폰트 크기
                cursor: "pointer",
                padding: "10px",
                transition: "color 0.2s ease",
              }}
              onMouseOver={(e) => (e.target.style.color = "#a0aec0")} // 호버 효과
              onMouseOut={(e) => (e.target.style.color = "white")}
            >
              {item.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
