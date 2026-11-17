# 세금정산(사진 → 벌금·상금·쿠폰) 교차검증 기록 — 2026-11-17

- 깊이: 수정 전 FULL(codex·gemini·grokweb + 메인 Claude, 서버·화면 두 묶음) → 수정 후 LITE(메인).
- 대상: functions/taxSettlementService.js · taxSettlementMath.js · src/pages/admin/TaxSettlement.js · src/utils/taxSettlement.js

## 채택(고침)
| 발견 | 계열 | 고친 곳 |
|---|---|---|
| 정산 기록을 학생 트랜잭션 밖에서 써서 돈과 기록이 갈릴 수 있다 | codex·grok | 기록을 학생마다 같은 트랜잭션 안에서 increment |
| 정산 기록 id 가 학급과 무관 — 다른 학급 키와 부딪힘 | codex | `taxSettlements/{classCode}_{key}` + 학급 다르면 거절 |
| createdAt 이 매 학생마다 덮임 | grok | 처음 한 번만 |
| AI 숫자를 범위 안으로 조용히 고친 값으로 합계 | codex | 고친 칸은 sure=false(확인 필요) |
| 벌금·상금 칸에 금액 없이 개수만 → 0원으로 통과 | gemini | unsure |
| 화면 합계 규칙이 서버와 다르다 | grok | 같은 정규화 + 21줄 일치 시험 |
| 다시 읽기가 멱등키를 새로 만들어 일부 성공 후 재시도 때 이중 지급 | codex | 새 사진 고를 때만 새 키 |
| 늦게 온 판독 응답이 새 사진 화면을 덮음 | codex·gemini | 사진 번호 비교 + 판독 중 사진 고르기 막음 |
| «-100»·«1.5» 입력이 100·15 로 들어감 | codex | 숫자·쉼표만 받음 |
| 확인창 대기 중 두 번 눌러 두 번 정산 | gemini | 확인창 전에 잠금 |

## 기각
- 상금 때 국고 잔액 검사: 국고 마이너스는 설계(커밋 8e465027 «국고 마이너스 허용», 퀴즈 보상도 검사 안 함).
- 학생이 화면에 들어올 수 있다: AdminRoute + 서버 hasAdminPower 로 이미 막힘.

## 시험
- src/test/functions/taxSettlement.test.js 17개(실제 사진 판독 결과 21줄, 실명은 가명으로 바꿈). 고친 칸 unsure 시험은 옛 코드로 되돌리면 빨강 확인.
