// src/hooks/useOptimizedMemo.js - React 컴포넌트 재렌더링 최적화 Hook

import { useMemo, useCallback, useRef, useEffect, useState } from 'react';

// 깊은 비교를 위한 유틸리티 함수
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (let key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
  }

  return true;
};

// 메모이제이션을 위한 깊은 비교 Hook
export const useDeepMemo = (factory, deps) => {
  const depsRef = useRef();
  const resultRef = useRef();

  if (!deepEqual(depsRef.current, deps)) {
    depsRef.current = deps;
    resultRef.current = factory();
  }

  return resultRef.current;
};

// 안정적인 콜백 함수 생성 (의존성이 변경될 때만 재생성)
export const useStableCallback = (callback, deps) => {
  return useDeepMemo(() => callback, deps);
};

// 객체의 특정 속성만 변경됐을 때만 재계산하는 Hook
export const useSelectiveMemo = (object, selector, deps = []) => {
  const selectedRef = useRef();
  const resultRef = useRef();

  const selected = selector(object);

  if (!deepEqual(selectedRef.current, selected)) {
    selectedRef.current = selected;
    resultRef.current = selected;
  }

  return resultRef.current;
};

// 배열의 내용이 변경됐을 때만 재계산하는 Hook
export const useArrayMemo = (array, compareFn = deepEqual) => {
  const arrayRef = useRef();

  if (!arrayRef.current || !compareFn(arrayRef.current, array)) {
    arrayRef.current = array;
  }

  return arrayRef.current;
};

// 디바운스된 값 (빠른 변경 시 재렌더링 방지)
export const useDebouncedValue = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
};

// 이전 값과 비교해서 변경됐을 때만 업데이트하는 Hook
export const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

// 값이 실제로 변경됐을 때만 업데이트하는 Hook
export const useChangedValue = (value, compareFn = Object.is) => {
  const ref = useRef(value);

  if (!compareFn(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
};

// 렌더링 성능 모니터링 Hook (개발 환경에서만)
export const useRenderCount = (componentName) => {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${componentName}] 렌더링 횟수: ${renderCount.current}`);
    }
  });

  return renderCount.current;
};

// 컴포넌트의 props 변경을 추적하는 Hook (개발 환경에서만)
export const useWhyDidYouUpdate = (name, props) => {
  const previousProps = useRef();

  useEffect(() => {
    if (previousProps.current && process.env.NODE_ENV === 'development') {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps = {};

      allKeys.forEach(key => {
        if (previousProps.current[key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current[key],
            to: props[key]
          };
        }
      });

      if (Object.keys(changedProps).length) {
        console.log('[why-did-you-update]', name, changedProps);
      }
    }

    previousProps.current = props;
  });
};

// 비용이 큰 계산을 최적화하는 Hook
export const useExpensiveCalculation = (calculation, deps, shouldSkip = false) => {
  const result = useMemo(() => {
    if (shouldSkip) return null;

    const startTime = performance.now();
    const result = calculation();
    const endTime = performance.now();

    if (process.env.NODE_ENV === 'development') {
      console.log(`계산 시간: ${endTime - startTime}ms`);
    }

    return result;
  }, deps);

  return result;
};

// 조건부 메모이제이션 Hook
export const useConditionalMemo = (factory, deps, condition = true) => {
  const memoizedValue = useMemo(factory, deps);
  const fallbackRef = useRef();

  if (condition) {
    fallbackRef.current = memoizedValue;
    return memoizedValue;
  }

  return fallbackRef.current;
};