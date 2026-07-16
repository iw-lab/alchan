# 코드 인벤토리 (P0) — 2026-07-16 @ 86c1bbe

이후 모든 Phase의 전수 체크 기준 목록. 추출은 grep 기반 — 템플릿 리터럴·동적 경로는 누락 가능하므로 P2/P4에서 정밀 대조.

## 규모
| 영역 | 수치 |
|---|---|
| src JS 파일 | 174개 (~112K줄, css 포함) |
| pages | 65파일 / 19도메인 (admin, auth, banking, coupon, dashboard, games, government, learning, legal, market, music, my-assets, my-items, my-profile, organization, personal-board, real-estate, student, superadmin) |
| 라우트 | AlchanLayout.js 47 + App.js 6 |
| 코드 스플리팅 | `lazyWithRetry` 커스텀 래퍼 **51곳** (AlchanLayout) — 페이지 분할 이미 적용됨. 순정 React.lazy는 3곳 |
| contexts | AuthContext, CurrencyContext, ItemContext, ThemeContext |
| hooks | useFirestoreData, usePolling, useOptimizedAdminData, useAuto{DepositMature,LoanRepay,SavingsDeposit}, useActiveEconomicEvent, useServiceWorker, useDocumentTitle |
| services | database, AdminDatabaseService, optimizedFirebaseService, globalCacheService, indexedDBCache |
| onSnapshot 사용 파일 | 25개 (P5 리스너 감사 대상) |

## Cloud Functions
| 파일 | 줄수 | exports |
|---|---|---|
| index.js | 6,756 | 93 |
| scheduler-http.js | 3,422 | 38 |
| avatarShopService.js | — | 4 |
| initializeSettings.js | — | 3 |
| groupPurchaseService.js | 330 | 1 |
| (유틸: utils, taxUtils, realStockService, jobUtils, initialStocks) | — | 0 |

- 고유 export 이름 104개 vs 클라 `httpsCallable` 참조 59개 → **미참조 48개** (scratchpad `cf-unused-candidates.txt`). 스케줄러/HTTP 트리거·onCall 외 트리거 포함이므로 P4에서 트리거 유형별 분류 후 판정.

## Firestore 컬렉션 (클라 코드 기준 23개)
activities, activity_logs, avatarShopItems, CentralStocks, chessGames, classes, donations, economicEventLogs, errorLogs, groupPurchases, jobs, laws, marketItems, musicRooms, omokGames, personalShops, realEstate, settlements, shopProducts, storeItems, taxRecords, transactions, users
- ⚠️ 서브컬렉션·CF 전용 컬렉션(catalogMeta, settings/menuLocks, personalBoards, realEstateProperties, dailyItemUse 등 메모리에 등장하는 것들)이 이 grep에 안 잡힘 → P2 rules 매트릭스 작성 때 rules 파일 기준으로 완전 목록화.

## 대형 파일 Top 10 (리팩토링 P7 후보)
functions/index.js 6756 · AdminSettingsModal.js 3964 · scheduler-http.js 3422 · StockExchange.js 2710 · Dashboard.js 2568 · RealEstateRegistry.js 2556 · OmokGame.js 2505 · ParkingAccount.js 2470 · SuperAdminDashboard.js 2199 · ChessGame.js 1927
