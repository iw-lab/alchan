// src/Button.js
import React, { useState } from 'react';

/**
 * 중복 클릭을 방지하는 버튼 컴포넌트입니다.
 * 클릭하면 잠시 비활성화되어 여러 번의 클릭을 막습니다.
 * @param {object} props 컴포넌트 속성
 * @param {function} props.onClick 클릭 시 실행될 함수
 * @param {React.ReactNode} props.children 버튼 내부에 표시될 내용
 * @param {boolean} props.disabled 버튼 비활성화 여부
 */
const Button = ({ onClick, children, disabled, ...props }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleClick = async (event) => {
    // 이미 처리 중이거나 비활성화 상태이면 아무것도 하지 않음
    if (isProcessing || disabled) return;

    setIsProcessing(true);
    try {
      if (onClick) {
        // 부모로부터 전달받은 onClick 함수 실행
        await onClick(event);
      }
    } catch (error) {
      console.error("Button onClick handler error:", error);
    } finally {
      // 1초 후에 버튼을 다시 활성화하여 중복 클릭 방지
      setTimeout(() => setIsProcessing(false), 1000);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing || disabled}
      {...props}
    >
      {isProcessing ? '처리 중...' : children}
    </button>
  );
};

export default Button;