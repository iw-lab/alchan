# Vitest 테스트 환경 구성

이 디렉토리는 Vitest를 사용한 유닛 테스트 환경을 포함합니다.

## 구성 요소

### 설정 파일
- **vitest.config.js**: Vitest 설정 파일 (루트 디렉토리)
- **setup.js**: 테스트 환경 초기 설정 (모킹, 전역 설정 등)

### 테스트 파일
- **hooks/useFirestoreData.test.js**: Firestore 데이터 훅 캐시 로직 테스트
- **utils/logger.test.js**: 로거 유틸리티 테스트
- **services/globalCacheService.test.js**: 전역 캐시 서비스 테스트

## 테스트 실행 방법

### 1. 일반 테스트 실행
```bash
npm run test:unit
```

### 2. UI 모드로 테스트 (브라우저에서 확인)
```bash
npm run test:ui
```

### 3. 커버리지 리포트 포함
```bash
npm run test:coverage
```

### 4. 특정 파일만 테스트
```bash
npm run test:unit src/test/utils/logger.test.js
```

### 5. Watch 모드 (파일 변경 시 자동 재실행)
```bash
npm run test:unit -- --watch
```

## 테스트 통계

현재 테스트 커버리지:
- **총 테스트**: 82개
- **통과**: 76개
- **실패**: 6개 (엣지 케이스, 개선 필요)

### 테스트 범위

#### useFirestoreData Hook (30개 테스트)
- ✅ 캐시 키 생성
- ✅ 캐시 저장/조회
- ✅ 캐시 무효화
- ✅ 캐시 통계
- ✅ 캐시 제거 (LRU)
- ✅ TTL 검증
- ✅ 메모리 관리

#### Logger Utility (26개 테스트)
- ✅ Development 환경 로깅
- ✅ Production 환경 로깅 비활성화
- ✅ 경고/에러 로깅
- ✅ 그룹 로깅
- ✅ 테이블 로깅
- ✅ 시간 측정
- ✅ 모듈별 로거

#### globalCacheService (40개 테스트)
- ✅ 캐시 키 생성
- ✅ 캐시 저장/조회
- ✅ 캐시 무효화
- ✅ TTL 설정
- ✅ 캐시 통계
- ✅ 비동기 작업
- ✅ 재시도 로직
- ✅ 중복 요청 방지
- ✅ localStorage 통합
- ✅ 구독/알림 시스템
- ✅ 메모리 관리

## 주요 기능 테스트

### 1. 캐시 시스템 테스트
- 메모리 캐시 동작 검증
- TTL(Time To Live) 만료 검증
- 캐시 무효화 패턴 검증
- LRU(Least Recently Used) 제거 검증

### 2. 로거 시스템 테스트
- 환경별 로깅 동작 검증
- 로그 레벨별 출력 검증
- 모듈별 로거 생성 검증

### 3. 캐시 서비스 테스트
- Firestore 통합 검증
- 재시도 로직 검증
- 중복 요청 방지 검증
- localStorage/IndexedDB 폴백 검증

## 모킹 전략

### Firebase 모킹
Firebase Firestore 관련 모듈은 모두 모킹되어 실제 네트워크 요청 없이 테스트됩니다.

```javascript
vi.mock('../../firebase', () => ({
  db: {},
}));
```

### localStorage 모킹
localStorage는 setup.js에서 전역으로 모킹됩니다.

```javascript
global.localStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
```

### IndexedDB 모킹
IndexedDB도 setup.js에서 전역으로 모킹됩니다.

## 테스트 작성 가이드

### 기본 구조
```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('테스트 스위트명', () => {
  beforeEach(() => {
    // 각 테스트 전 초기화
    vi.clearAllMocks();
  });

  it('should do something', () => {
    // 테스트 코드
    expect(result).toBe(expected);
  });
});
```

### 비동기 테스트
```javascript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### 에러 테스트
```javascript
it('should throw an error', () => {
  expect(() => throwError()).toThrow('Error message');
});
```

## 향후 개선 사항

1. **테스트 커버리지 확대**
   - React 컴포넌트 테스트 추가
   - E2E 테스트 추가

2. **실패 테스트 수정**
   - 캐시 폴백 로직 엣지 케이스 수정
   - 재시도 로직 타이밍 이슈 해결

3. **성능 테스트 추가**
   - 대용량 데이터 캐싱 성능 테스트
   - 메모리 누수 테스트

4. **통합 테스트 추가**
   - 실제 Firestore Emulator 연동 테스트
   - 전체 워크플로우 통합 테스트

## 참고 문서

- [Vitest 공식 문서](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
