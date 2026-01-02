// src/components/ui/VirtualList.js
// 가상화 리스트 컴포넌트 (대량 데이터 렌더링 최적화)

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

export function VirtualList({
  items = [],
  itemHeight = 60,
  containerHeight = 400,
  overscan = 3,
  renderItem,
  className = '',
  emptyMessage = '데이터가 없습니다.',
  loadMore = null,
  hasMore = false,
  isLoading = false
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;

  // 보이는 아이템 범위 계산
  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight) + overscan * 2;
    const end = Math.min(items.length - 1, start + visibleCount);

    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end + 1).map((item, index) => ({
        item,
        index: start + index
      }))
    };
  }, [items, scrollTop, itemHeight, containerHeight, overscan]);

  const handleScroll = useCallback((e) => {
    const newScrollTop = e.target.scrollTop;
    setScrollTop(newScrollTop);

    // 무한 스크롤
    if (loadMore && hasMore && !isLoading) {
      const scrollBottom = newScrollTop + containerHeight;
      if (scrollBottom >= totalHeight - itemHeight * 3) {
        loadMore();
      }
    }
  }, [loadMore, hasMore, isLoading, containerHeight, totalHeight, itemHeight]);

  if (items.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-gray-500 dark:text-gray-400 ${className}`}
        style={{ height: containerHeight }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map(({ item, index }) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: index * itemHeight,
              left: 0,
              right: 0,
              height: itemHeight
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

// 동적 높이 가상화 리스트
export function DynamicVirtualList({
  items = [],
  estimatedItemHeight = 60,
  containerHeight = 400,
  overscan = 3,
  renderItem,
  className = '',
  emptyMessage = '데이터가 없습니다.'
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [itemHeights, setItemHeights] = useState({});

  // 아이템 높이 측정
  const measureItem = useCallback((index, height) => {
    setItemHeights(prev => {
      if (prev[index] === height) return prev;
      return { ...prev, [index]: height };
    });
  }, []);

  // 각 아이템의 오프셋 계산
  const getItemOffset = useCallback((index) => {
    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += itemHeights[i] || estimatedItemHeight;
    }
    return offset;
  }, [itemHeights, estimatedItemHeight]);

  // 전체 높이
  const totalHeight = useMemo(() => {
    return items.reduce((acc, _, index) => {
      return acc + (itemHeights[index] || estimatedItemHeight);
    }, 0);
  }, [items, itemHeights, estimatedItemHeight]);

  // 보이는 아이템 범위
  const visibleRange = useMemo(() => {
    let startIndex = 0;
    let currentOffset = 0;

    // 시작 인덱스 찾기
    for (let i = 0; i < items.length; i++) {
      const height = itemHeights[i] || estimatedItemHeight;
      if (currentOffset + height > scrollTop) {
        startIndex = Math.max(0, i - overscan);
        break;
      }
      currentOffset += height;
    }

    // 끝 인덱스 찾기
    let endIndex = startIndex;
    currentOffset = getItemOffset(startIndex);

    for (let i = startIndex; i < items.length; i++) {
      if (currentOffset > scrollTop + containerHeight) {
        endIndex = Math.min(items.length - 1, i + overscan);
        break;
      }
      currentOffset += itemHeights[i] || estimatedItemHeight;
      endIndex = i;
    }

    return { startIndex, endIndex };
  }, [items, scrollTop, containerHeight, itemHeights, estimatedItemHeight, overscan, getItemOffset]);

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  if (items.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-gray-500 dark:text-gray-400 ${className}`}
        style={{ height: containerHeight }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {items.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((item, i) => {
          const index = visibleRange.startIndex + i;
          return (
            <VirtualItem
              key={index}
              index={index}
              offset={getItemOffset(index)}
              onMeasure={measureItem}
            >
              {renderItem(item, index)}
            </VirtualItem>
          );
        })}
      </div>
    </div>
  );
}

// 가상 아이템 wrapper
function VirtualItem({ index, offset, onMeasure, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      const height = ref.current.getBoundingClientRect().height;
      onMeasure(index, height);
    }
  }, [index, onMeasure, children]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: offset,
        left: 0,
        right: 0
      }}
    >
      {children}
    </div>
  );
}

export default VirtualList;
