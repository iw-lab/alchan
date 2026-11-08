# 자동 물가 조절 (2026-11-08 사용자 «학급 학생 총자산에서 적당히 맞추는 걸 자동으로 · 너무 튀는 상하위는 조절»)

## 결정 (사용자 답)
- 상하위 = **계산에서만 뺀다**(학생 돈은 건드리지 않음).
- 적용 = **매주 자동 + 교사 미리보기**(끄기·이번 주 건너뛰기·기준 다시 잡기).

## 원리
- 대표 자산 = 학급 학생 순자산(cash+쿠폰+파킹+예적금+주식+부동산−대출, 재산세와 같은 `computeUserNetAssets`)을
  정렬해 **위·아래 각 10% 를 뺀 평균**(잘린 평균). 학생 < 5명이면 계산 안 함.
- 켤 때(또는 «기준 다시 잡기») 지금 대표 자산 = **기준(anchor)**.
- 매주 금요일(재산세·월세 뒤, 같은 스케줄러) ratio = 대표/기준.
  - |ratio−1| < 3% → 그대로(기준 유지 — 작은 변화가 쌓이면 다음 주에 넘는다).
  - 그 밖 → 배율 = clamp(ratio, 0.90, 1.10), **기준 ← 기준 × 배율**(못 따라간 나머지는 다음 주로 넘어간다).
  - 대표 ≤ 0 또는 기준 ≤ 0 → 아무것도 안 함(사유 기록).
- 교사 수동 ±% 버튼·경제 이벤트와 독립: 자동은 «부의 변화율»만 따라가므로 교사가 올린 물가를 되돌리지 않는다.

## 가격 적용 — 기존 수동 버튼(adjustStorePrices)과 같은 규칙을 공유 함수로
- 제외 판별 `isStorePriceEventExcluded`(자유시간 등) · 하한 100 · 상한 10억 · 반올림 · 값 같으면 안 씀
- `basePrice` 는 처음 바뀔 때 한 번만(되팔기 차익 방지 기준선, 덮어쓰지 않음)
- `bumpCatalogVersion(classCode)` (학생 화면 캐시)
- 수동 버튼은 동작 그대로(정수 ±50%) — 핵심 루프만 공유.

## 멱등·원자성
- 전역 `systemState/lastAutoPrice` 주간 락(claimPeriodLock 규약).
- 학급별: **한 트랜잭션** 안에서 `autoPriceSettings/{classCode}` 읽기(enabled·lastRunWeekKey·skipWeekKey) + 상점 아이템 쿼리 + 모든 가격 쓰기 + 설정(기준·lastRunWeekKey·기록) 쓰기 → 같은 주 두 번 적용 불가, 가격만 바뀌고 기록이 없는 상태 불가.
  아이템이 480개 넘으면 그 주는 건너뛰고 사유 기록(트랜잭션 500 쓰기 한도).
- 대표 자산 계산(읽기 많음)은 트랜잭션 밖, 결과 숫자만 안으로.

## 저장
- `autoPriceSettings/{classCode}` — 서버만 씀(규칙: 클라 읽기·쓰기 차단, 교사는 callable 로 봄).
  `{enabled, anchor, enabledAt, enabledBy, lastRunWeekKey, skipWeekKey, history:[≤12 {weekKey, center, ratio, multiplier, changed, reason, at}]}`

## 교사 화면(상점 관리 «전체 물가 조정» 옆)
- 켜기/끄기 · 지금 대표 자산·기준·«이번 주 예정 +4%» · 이번 주 건너뛰기 · 기준 다시 잡기 · 최근 기록.
- callable `autoPriceControl({action})`(교사 전용, 연타 잠금) · `autoPricePreview()`(교사 전용, 쓰기 0).

## 불변식(검증 성공조건)
1. 학생 cash·자산은 이 기능으로 한 푼도 바뀌지 않는다(가격만).
2. 같은 학급·같은 주에 두 번 적용되지 않는다(스케줄러 재실행·수동 HTTP·동시 실행).
3. 한 주 변화폭은 ±10% 를 넘지 않고, 제외 아이템·basePrice 규칙은 수동 버튼과 똑같다.
