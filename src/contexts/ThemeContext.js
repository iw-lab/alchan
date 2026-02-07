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
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('alchan-dark-mode');
    if (saved !== null) return JSON.parse(saved);
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('alchan-font-size') || 'medium';
  });

  // 다크 모드 적용
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('alchan-dark-mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // 폰트 크기 적용
  useEffect(() => {
    const scale = FONT_SIZES[fontSize]?.scale || 1;
    document.documentElement.style.fontSize = `${scale * 16}px`;
    localStorage.setItem('alchan-font-size', fontSize);
  }, [fontSize]);

  // 시스템 테마 변경 감지
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      const savedPreference = localStorage.getItem('alchan-dark-mode');
      if (savedPreference === null) {
        setIsDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  const changeFontSize = useCallback((size) => {
    if (FONT_SIZES[size]) {
      setFontSize(size);
    }
  }, []);

  const value = useMemo(() => ({
    isDarkMode,
    toggleDarkMode,
    setIsDarkMode,
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
