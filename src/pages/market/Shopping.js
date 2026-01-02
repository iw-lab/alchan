import React, { useState } from "react";

export default function Shopping() {
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = [
    { id: "all", name: "전체" },
    { id: "electronics", name: "전자기기" },
    { id: "furniture", name: "가구" },
    { id: "clothing", name: "의류" },
    { id: "food", name: "식품" },
  ];

  const products = [
    {
      id: 1,
      name: "노트북",
      category: "electronics",
      price: "1,200,000원",
      image: "💻",
    },
    {
      id: 2,
      name: "스마트폰",
      category: "electronics",
      price: "800,000원",
      image: "📱",
    },
    {
      id: 3,
      name: "책상",
      category: "furniture",
      price: "150,000원",
      image: "🪑",
    },
    {
      id: 4,
      name: "옷장",
      category: "furniture",
      price: "250,000원",
      image: "🗄️",
    },
    {
      id: 5,
      name: "티셔츠",
      category: "clothing",
      price: "30,000원",
      image: "👕",
    },
    {
      id: 6,
      name: "청바지",
      category: "clothing",
      price: "50,000원",
      image: "👖",
    },
    {
      id: 7,
      name: "과일 세트",
      category: "food",
      price: "45,000원",
      image: "🍎",
    },
    {
      id: 8,
      name: "냉동 식품",
      category: "food",
      price: "25,000원",
      image: "🥘",
    },
  ];

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((product) => product.category === activeCategory);

  return (
    <div className="page-container">
      <h2>토마토상점</h2>

      <div className="shopping-balance">
        <span>현재 보유금액: </span>
        <span className="balance-amount">142,500원</span>
      </div>

      <div className="shopping-categories">
        {categories.map((category) => (
          <div
            key={category.id}
            className={`category-tab ${
              activeCategory === category.id ? "active" : ""
            }`}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.name}
          </div>
        ))}
      </div>

      <div className="search-bar">
        <input type="text" placeholder="상품 검색" />
        <button>검색</button>
      </div>

      <div className="products-grid">
        {filteredProducts.map((product) => (
          <div key={product.id} className="product-card">
            <div className="product-image">{product.image}</div>
            <div className="product-info">
              <h3>{product.name}</h3>
              <p className="product-price">{product.price}</p>
            </div>
            <button className="buy-button">구매</button>
          </div>
        ))}
      </div>

      <div className="shopping-cart">
        <h3>장바구니</h3>
        <div className="cart-items">
          <p>장바구니가 비어있습니다.</p>
        </div>
        <button className="checkout-button" disabled>
          결제하기
        </button>
      </div>
    </div>
  );
}
