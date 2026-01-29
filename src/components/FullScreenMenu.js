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
      className="fixed inset-0 text-white z-[2000] flex flex-col items-center justify-center p-5 overflow-y-auto"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.95)" }}
    >
      <button
        onClick={() => setShowMenu(false)} // 메뉴 닫기 버튼
        className="absolute top-5 right-5 bg-transparent text-white rounded px-2.5 py-1 cursor-pointer text-sm"
        style={{ border: "1px solid white" }}
      >
        닫기
      </button>

      <h2 className="mt-0 mb-7 text-white">
        메뉴
      </h2>

      <ul className="list-none p-0 text-center">
        {menuItems.map((item) => (
          <li key={item.id} className="mb-5">
            <button
              onClick={() => onMenuItemClick(item.id)} // 항목 클릭 시 핸들러 호출
              className="bg-none border-none text-white text-2xl cursor-pointer p-2.5 transition-colors"
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
