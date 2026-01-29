// src/hooks/useLazyImage.js
// 이미지 지연 로딩 훅 및 컴포넌트

import React, { useState, useEffect, useRef } from 'react';

// 지연 로딩 훅
export function useLazyImage(src, options = {}) {
  const { threshold = 0.1, rootMargin = '50px' } = options;
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [error, setError] = useState(null);
  const imgRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  useEffect(() => {
    if (!isInView || !src) return;

    const img = new Image();
    img.src = src;

    img.onload = () => {
      setIsLoaded(true);
      setError(null);
    };

    img.onerror = () => {
      setError('이미지를 불러올 수 없습니다.');
      setIsLoaded(false);
    };
  }, [isInView, src]);

  return { imgRef, isLoaded, isInView, error };
}

// 지연 로딩 이미지 컴포넌트
export function LazyImage({
  src,
  alt,
  className = '',
  placeholder = null,
  fallback = null,
  width,
  height,
  objectFit = 'cover',
  ...props
}) {
  const { imgRef, isLoaded, isInView, error } = useLazyImage(src);

  const placeholderElement = placeholder || (
    <div
      className="animate-pulse bg-gray-200 dark:bg-gray-700"
      style={{ width, height }}
    />
  );

  const fallbackElement = fallback || (
    <div
      className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400"
      style={{ width, height }}
    >
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  );

  if (error) {
    return <div ref={imgRef} className={className}>{fallbackElement}</div>;
  }

  return (
    <div ref={imgRef} className={`relative ${className}`} style={{ width, height }}>
      {/* 플레이스홀더 */}
      {!isLoaded && placeholderElement}

      {/* 실제 이미지 */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`transition-opacity duration-300 top-0 left-0 ${isLoaded ? 'opacity-100 relative' : 'opacity-0 absolute'} ${className}`}
          style={{
            width,
            height,
            objectFit
          }}
          {...props}
        />
      )}
    </div>
  );
}

// 배경 이미지 지연 로딩 컴포넌트
export function LazyBackground({
  src,
  className = '',
  children,
  placeholder = 'bg-gray-200 dark:bg-gray-700',
  ...props
}) {
  const { imgRef, isLoaded, isInView } = useLazyImage(src);

  return (
    <div
      ref={imgRef}
      className={`bg-cover bg-center ${className} ${!isLoaded ? placeholder : ''} transition-all duration-300`}
      style={{
        backgroundImage: isInView && isLoaded ? `url(${src})` : 'none'
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export default LazyImage;
