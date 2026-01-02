// src/LoginWarning.js
import React from "react";
import "./styles.css";

const LoginWarning = () => {
  return (
    <div className="login-warning">
      <h3>로그인이 필요합니다</h3>
      <p>아이템을 구매하거나 사용하려면 로그인해주세요.</p>
    </div>
  );
};

export default LoginWarning;
