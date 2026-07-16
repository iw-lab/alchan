# cash/국고 CF 이관 마스터 플랜 (P2 실행) — 2026-07-16

목표: 클라이언트가 cash·coupons·국고를 직접 write하는 모든 경로를 검증된 Cloud Function으로 이관 → 최종적으로 rules에서 해당 write를 CF(Admin SDK) 전용으로 잠금. 실서비스이므로 **병행 배포·건별 검증**.

## 전수조사 결과 — 이관 대상 (git @ 86c1bbe)

### ✅ 이미 CF화 (안전, 건드리지 않음)
주식 buyStock/sellStock/useItem, 선물 giftItem, 랜덤뽑기 drawRandomItem, 할일보상 completeTask/processTaskApproval, 함께구매 일부(groupPurchaseService)

### 이관 대상 카테고리

**A. 자기 cash 생성형** (상대방 없이 본인 cash만 increment — R1 실제 공격면, 최우선)
| 경로 | 위치 | 성격 |
|---|---|---|
| 데일리 출석보상 | MyAssets.js:1555, AlchanLayout.js:326 | 서버가 날짜·중복 판정해야 |
| 타자게임 | TypingPracticeGame.js:274 | 클라 보상액 계산 |
| 체스 승리 | ChessGame.js:995,998 | " |
| 필사연습 | TranscriptionMode.js:92 | coupon만 |
| 오목 | OmokGame.js | 확인 필요 |

**B. 양방향 거래형** (트랜잭션, 학생↔학생/국고)
송금(transactions.js:138-139) · 상점구매(store.js:216) · 개인상점(PersonalShop.js:962-987) · 경매(Auction.js:164-172,531-537,767) · 학생요청(StudentRequest.js:277-278) · 법원벌금(Court.js:1063-1066) · 쿠폰환전(MyAssets.js:1098) · 함께구매기여(GroupPurchase.js:329)

**C. 은행** (적금·대출·파킹 — 자동/수동)
useAutoSavingsDeposit(122-123) · useAutoLoanRepay(136-137) · useAutoDepositMature(182-183) · ParkingAccount.js(1182,1308,1566,1716,1931,2031,2098,2232 등 다수)

**D. 부동산** RealEstateRegistry.js: 임대료(806-815,1423-1430)·구매

**E. 세금/국고** taxUtils.js(72,312) · 국고 increment 9곳(transactions.js·PersonalShop·Auction·stockExchangeService·NationalTaxService·store.js)

## 재사용 가능한 서버 헬퍼 (functions/utils.js — 이미 존재)
`checkIdempotent`/`markIdempotent`(멱등성), `logActivity`(거래로그), `checkAuthAndGetUserData`(auth+유저), `findApprovedAdminSnap`(국고=승인관리자 조회), `hasAdminPower`. 새 CF는 이것들 조립 = 검증된 buyStock/useItem과 동일 패턴.

## 핵심 설계 원칙 (반드시 준수)

1. **rules 잠금은 전 카테고리(A~E) CF화 완료 후에만.** 대부분 트랜잭션이 양쪽 cash를 동시에 쓰므로, A만 CF화해도 B(송금)가 클라 트랜잭션인 한 rules의 본인/같은학급 cash write를 못 잠근다. **부분 이관 = audit·검증 개선이지 방어는 아니다.** 방어(공격면 차단)는 rules 잠금 시점에 발생 → 마지막 단계.

2. **게임 보상의 근본 한계 명시**: 서버는 "학생이 실제로 게임을 이겼는지" 검증 불가(클라 주장을 믿을 수밖에). 완전 방어 불가 → **일일 상한·쿨다운·금액 상한**으로 무한증식만 차단(피해 상한). 이 한계를 audit 로그로 탐지 보완.

3. **금액·규칙은 서버 계산**: 클라가 보상액/세율/가격을 넘기는 것 금지. 서버가 설정문서·규칙표로 계산. 클라는 "무엇을 했다"만 전달(gameType, taskId 등).

4. **멱등성 필수**: 모든 CF는 idempotencyKey. 이중클릭·재시도로 이중지급 차단.

5. **병행 기간**: 각 CF 배포 후 클라를 CF 호출로 교체 → 구버전 클라(캐시)가 남을 수 있으므로 rules 잠금 전까지 기존 경로도 살아있음. 전 학급 신버전 수렴 확인 후 rules 잠금.

## 실행 순서 (건별 배포·검증)

| 배치 | 내용 | rules 영향 |
|---|---|---|
| **1. A 자기생성형** | claimDailyReward, grantGameReward CF 신설 + 클라 교체 | 없음(누적) |
| 2. B 거래형 | transferCash 등 CF. 송금·상점·경매·벌금·환전 | 없음 |
| 3. C 은행 | 적금·대출·파킹 CF (자동훅 포함) | 없음 |
| 4. D 부동산 | 임대료·구매 CF | 없음 |
| 5. E 세금/국고 | 세금·국고 CF | 없음 |
| **6. rules 잠금** | users update의 cash 자가/같은학급 허용 제거, 국고 admin-only化, inventory 본인 write 제거 → CF 전용 | **방어 발동** — 전 학급 신버전 수렴 확인 후 FULL 교차검증 + 배포 |

각 배치: CF 구현 → 로컬 에뮬레이터/단위 검증 → FULL 교차검증(중대) → 배포 → 실사용 확인 → 다음. 배치 6 전까지 방어 효과는 0(audit만 개선)임을 인지.

## 배치 1 상세 설계 (착수 대상)

### CF: claimDailyReward(onCall)
- 입력: `{ idempotencyKey }` (보상액 안 받음)
- 서버: auth 확인 → 유저 문서 read → `lastDailyRewardDate`(YYYY-MM-DD, 서버 timezone) 오늘과 같으면 already-claimed 거부 → 보상액은 서버 규칙(연속출석 등, 기존 DailyRewardBanner 로직을 서버로 이전) 계산 → 트랜잭션: idempotent check → `cash: increment(보상)`, `lastDailyRewardDate: 오늘` → logActivity → markIdempotent
- 클라: MyAssets.js:1555, AlchanLayout.js:326의 직접 write를 `httpsCallable('claimDailyReward')` 호출로 교체

### CF: grantGameReward(onCall)
- 입력: `{ gameType, resultToken?, idempotencyKey }`
- 서버: gameType별 보상 규칙표(서버 상수) + **일일 횟수/금액 상한** 적용(users.dailyGameReward 카운터, 본인 write 차단 대상에 추가) → increment → logActivity
- 클라: TypingPracticeGame·ChessGame·TranscriptionMode·OmokGame의 직접 increment를 CF 호출로 교체
- ⚠️ 검증 한계(위 원칙 2) — 상한값은 착수 시 현재 클라 보상 분포 기준으로 결정

**배치 1은 rules를 바꾸지 않으므로 되돌리기 안전**(CF 추가 + 클라 호출 교체뿐, 기존 rules가 계속 허용). 문제 시 클라만 롤백.

---
## 배치2 착수 기록 (2026-07-16, Opus 세션)

**학생 송금 실경로 확정**: MyAssets.js `handleTransferMoney` = `deductCash(-amount)` → `addCashToUserById(recipient,+amount)` 2단계 **비원자** write + 클라 롤백. 각 write는 `updateUserCashInFirestore`(runTransaction+increment)라 개별 원자적이나, 두 write가 함께 원자적이지 않음. `addCashToUserById`는 클라 SDK로 **임의 userId cash에 increment** → money-glitch 벡터. 무세금, `lastIncomingTransferAt` 기록.

**조치**: `transferCash` onCall CF 신규(index.js, giftCoupon 뒤). senderId=auth.uid 강제·같은학급·서버잔액검증·단일 tx 양방향 increment·멱등·양쪽 로그·lastIncomingTransferAt. MyAssets는 httpsCallable("transferCash") 단일호출로 교체(구 2단계/롤백/클라로그/setDoc 제거, deductCash·addCashToUserById destructure 제거). → FULL 3계열 검증 중.

**남은 거래형 클라 cash write 지도(다음 배치 대상)**:
- `ItemContext.js`(7건) — 상점 구매/인벤토리/시장. 가장 큼. 배치3 후보.
- `TrialRoom.js`(2건) — 재판 합의금 transferCash + 벌금. 
- `PoliceStation.js`(1건) — 경찰 벌금(합의금 victimId 로직 이미 CF? 재확인 필요).
- `ParkingAccount.js`(2건) — 파킹통장 입출금. 배치4(은행) 후보.
- `MoneyTransfer.js` — 교사 지급/회수 `adminCashAction`(services/database.js). 교사 권한이나 클라 write라 배치5(관리자) 후보.
- 게임 PvP 잔여(OmokGame 등) = 배치1-c.

**rules 잠금(방어 발동)은 위 전부 이관 후 배치6**.
