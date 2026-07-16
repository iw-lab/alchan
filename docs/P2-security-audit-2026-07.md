# P2 보안 감사 결과 — 2026-07-16 @ 86c1bbe

firestore.rules 1,320줄 전수 + 클라 write 지점 표본 확인. 전반적으로 과거 7way 감사 흔적이 촘촘해 **깨끗한 편**. XSS·시크릿·권한 상승 경로는 대부분 이미 잠김. 남은 리스크는 하나의 구조적 뿌리로 수렴한다.

## ✅ 이미 잘 막힌 것 (재확인)
- 시크릿 하드코딩 0, `dangerouslySetInnerHTML` 0 (XSS 표면 없음, React 기본 이스케이프)
- 권한 상승: isAdmin에 isApproved 게이트(2026-07-14), selectedJobIds/appointedJobIds/delegatedPermissions 본인 write 차단, 일일한도 카운터 본인 write 차단
- 경찰서 신원 필드 create/update 양쪽 잠금(victimId 자기지정 차단)
- classCode 교차 접근: 대부분 컬렉션이 isSameClass/isSameClassFast로 학급 격리
- catalogMeta·realEstateOffers·_rateLimits·schedulerLocks = CF 전용(write false)
- 기본 차단 `match /{document=**} { allow read,write: if false }` 존재

## 🔴 핵심 리스크 — 클라이언트 직접 write 아키텍처 (money glitch류)

이건 **새 발견이 아니라 메모리에 "아키텍처 한계(CF 이관 필요)"로 기록된 알려진 최대 리스크**를 rules+코드로 재확인한 것.

### R1. 학생 본인 cash 자가 증액 (최고 심각도)
- rules `users` update 본인 분기(182–187): isAdmin/classCode/직업 등 민감필드만 제외, **cash는 `cash is number`만 검증** → 증감 방향·금액 제한 없음
- 코드 실태: 타자게임 등이 `updates.cash = increment(보상액)`으로 **클라에서 직접 지급** (TypingPracticeGame.js:273). 보상액도 클라 계산
- **악용**: 학생이 브라우저 콘솔에서 `updateDoc(내문서, {cash: increment(99999999)})` → rules 통과. 자산 무한 생성
- **왜 못 막나**: 정당한 게임보상·이자·적금이 전부 이 경로를 쓰므로 rules로 cash write를 막으면 정상 기능이 죽음. **CF 이관만이 근본 해결**

### R2. 같은 학급이 타인 cash 설정
- rules `users` update 같은학급 분기(188–190): `hasOnly(['cash','updatedAt','lastIncomingTransferAt'])` — 남의 cash를 임의 값으로. 송금이 클라 트랜잭션으로 상대 cash를 직접 쓰기 때문에 열림
- **악용**: 같은 반 학생 잔액을 0으로 만들거나 부풀리기 가능. R1과 같은 뿌리

### R3. 국고(nationalTreasuries) 클라 조작
- rules 루트(1029–1041): `allow update: if isAdmin() || isSameClass(classCode)` — 같은 학급 학생이 국고 직접 수정
- 코드 실태: 세금 납부·상점 판매세·경매·주식이 클라에서 국고 increment (taxUtils.js, transactions.js, PersonalShop.js, Auction.js, stockExchangeService.js 등 9곳)
- **악용**: 국고 무한 음수/증액. 과거 money glitch 사건의 통로. CF 이관 필요

### R4. 본인 인벤토리 직접 조작
- rules inventory(226–232): `allow write: if isOwner(userId)` — 선물은 giftItem CF로 이관됐으나 **본인 인벤토리 직접 write는 열림**
- **악용**: 아이템 수량·종류 자가 생성. 메모리 "본인 인벤토리 클라 write 잔여"와 일치

## 🟡 저위험 하드닝 후보 (정상기능 무영향, rules만 수정 — 검증 필요)
- **transactions 루트 create**(1051): `if isSignedIn()` — 본인 userId 강제 없음. 위조 거래 로그 생성 가능(단 파생 없어 표시만). `request.resource.data.userId == request.auth.uid` 추가 검토. ⚠️ 관리자 지급이 상대방 userId로 로그를 쓰는지(database.js:283는 본인) 확인 후
- **activities/donations create**: `isSignedIn`만 — 파생 영향 조사 후 소유자 강제 검토
- **transactions update**(1054): `isAdmin` "임시: 이름 교체용" 주석 — 이름교체 완료됐으면 `false`로

## npm audit
- root 24 / functions 20 (각 critical 3) — 대부분 react-scripts·CRA dev 체인. `npm audit fix`(비파괴) 적용 + 잔여 런타임 노출 분류는 P4에서

---

## 판정: R1~R4는 CF 이관 대공사 — scope 결정 필요

- **rules만으로 못 막음**이 확정. 클라 cash/국고/인벤토리 write를 막으면 송금·게임·상점·세금·경매·주식·이자 등 정상 기능이 전부 중단
- 근본 해결 = 각 write를 검증된 Cloud Function으로 이관 (서버가 보상액·세금 계산, 멱등성 보장) → 이후 rules를 CF 전용(write false)으로 잠금
- 규모: cash 지급 경로만 20~30곳. **실서비스 최대 공사이자 최대 리스크** — 병행 기간(신구 경로 공존) 두고 단계 배포 필수
- 계획서 원칙대로 "이관 함수는 기존 경로와 병행, rules 잠금은 마지막에"
