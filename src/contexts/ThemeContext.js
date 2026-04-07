// src/contexts/ThemeContext.js
// 다크 모드 및 테마 설정 Context

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const ThemeContext = createContext();

export const FONT_SIZES = {
  small: { label: '작게', scale: 0.875 },
  medium: { label: '보통', scale: 1 },
  large: { label: '크게', scale: 1.125 },
  xlarge: { label: '매우 크게', scale: 1.25 }
};

export function ThemeProvider({ children }) {
  // 다크 모드 완전 비활성화 - 항상 라이트 모드
  const [isDarkMode] = useState(false);

  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('alchan-font-size') || 'medium';
  });

  // 다크 모드 비활성화 - 항상 dark 클래스 제거
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // 폰트 크기 적용
  useEffect(() => {
    const scale = FONT_SIZES[fontSize]?.scale || 1;
    document.documentElement.style.fontSize = `${scale * 16}px`;
    localStorage.setItem('alchan-font-size', fontSize);
  }, [fontSize]);

  // 시스템 테마 변경 감지 비활성화 (다크 모드 제거됨)

  // 다크 모드 토글 비활성화 (no-op)
  const toggleDarkMode = useCallback(() => {}, []);

  const changeFontSize = useCallback((size) => {
    if (FONT_SIZES[size]) {
      setFontSize(size);
    }
  }, []);

  const value = useMemo(() => ({
    isDarkMode,
    toggleDarkMode,
    fontSize,
    setFontSize: changeFontSize,
    fontSizes: FONT_SIZES
  }), [isDarkMode, toggleDarkMode, fontSize, changeFontSize]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
