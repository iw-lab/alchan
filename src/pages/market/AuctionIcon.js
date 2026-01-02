import React from "react";

// 아주 간단한 아이콘으로 대체 (SVG 사용하지 않음)
const AuctionIcon = () => {
  return (
    <div
      style={{
        width: "24px",
        height: "24px",
        backgroundColor: "#f0e68c",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "12px",
        fontWeight: "bold",
        color: "#8b4513",
      }}
    >
      A
    </div>
  );
};

export default AuctionIcon;
