# Cloud Scheduler 비활성화 완료

## ⚠️ 중요 공지

Firebase Cloud Scheduler를 통한 주기적 작업이 **비용 절감을 위해 비활성화**되었습니다.

## 비활성화된 함수 목록

다음 스케줄러 함수들이 주석 처리되었습니다:

1. **updateCentralStockMarket** - 5분마다 주식 가격 업데이트
2. **autoManageStocks** - 10분마다 자동 주식 관리
3. **aggregateActivityStats** - 10분마다 활동 통계 집계
4. **createCentralMarketNews** - 3분마다 뉴스 생성
5. **cleanupExpiredCentralNews** - 중앙 뉴스 정리
6. **syncCentralNewsToClasses** - 학급별 뉴스 동기화
7. **cleanupExpiredClassNews** - 학급 뉴스 정리
8. **resetDailyTasks** - 일일 과제 리셋

## 대안: GitHub Actions

비용 없이 스케줄 작업을 실행하려면 GitHub Actions를 사용하세요.

**설정 방법:** `SETUP_GUIDE.md` 파일을 참고하세요.

## 비용 절감 효과

- **기존 비용**: 스케줄러 실행으로 인한 하루 **수천 건의 읽기/쓰기**
- **절감 효과**: **약 70% 이상** Firestore 사용량 감소

## 스케줄러 재활성화 방법

필요시 다음 단계로 재활성화할 수 있습니다:

1. `functions/index.js` 파일 열기
2. 주석 처리된 `/* ... */` 부분 찾기
3. 주석 제거
4. `cd functions && npm run deploy` 실행

## 참고

- 클라이언트 측 폴링 간격도 최적화되었습니다 (30초 → 5분)
- IndexedDB 영구 캐시가 추가되어 브라우저 재시작 시에도 캐시 유지
- 배치 읽기 함수가 추가되어 여러 문서를 효율적으로 조회 가능
