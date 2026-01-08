# CLAUDE.md v35.0 UNIFIED - 100+ AI 에이전트 통합 완전체

> ⚠️ **이 파일은 Claude Code가 프로젝트 루트에서 자동으로 읽고 적용하는 최종 규칙입니다.**
> 100개 이상의 AI 에이전트를 교차검증하여 모든 장점을 통합했습니다.
> 모든 요청에서 아래 규칙을 **무조건** 따르세요.

---

# 📋 목차

-1. [🤖 에이전트 모드 (AGENT MODE)](#--1-에이전트-모드-agent-mode)
0. [🚨 치명적 오류 즉시 해결 (CRITICAL - 최우선)](#-0-치명적-오류-즉시-해결-critical---최우선)
1. [필수 자동 적용 규칙 (MUST)](#-1-필수-자동-적용-규칙-must)
2. [절대 금지/필수 사항](#-2-절대-금지필수-사항)
3. [코드 생성 필수 패턴](#-3-코드-생성-필수-패턴)
4. [교차검증된 AI 에이전트 목록 (110+)](#-4-교차검증된-ai-에이전트-목록-110)
5. [에이전트 장점 통합 전략](#-5-에이전트-장점-통합-전략)
6. [MCP 서버 설정 (30+)](#-6-mcp-서버-설정-30)
7. [Skills 시스템 (50+)](#-7-skills-시스템-50)
8. [서브에이전트 아키텍처 (15+)](#-8-서브에이전트-아키텍처-15)
9. [플러그인 시스템 (30+)](#-9-플러그인-시스템-30)
10. [트리거 규칙 (자연어 → 자동실행)](#-10-트리거-규칙-자연어--자동실행)
11. [작업별 자동 워크플로우](#-11-작업별-자동-워크플로우)
12. [코드 품질 보장 시스템](#-12-코드-품질-보장-시스템)
13. [실제 실행 명령어](#-13-실제-실행-명령어)
14. [체크리스트](#-14-체크리스트)
15. [배포 및 검증 파이프라인](#-15-배포-및-검증-파이프라인)
16. [필수 API 키 목록](#-16-필수-api-키-목록)
17. [실제 작동 방식 설명](#-17-실제-작동-방식-설명)

---

# 🤖 -1. 에이전트 모드 (AGENT MODE)

> ⚠️ **이 섹션은 Claude Code를 완전 자율 에이전트로 작동시키기 위한 핵심 설정입니다.**
> 질문 없이 알아서 판단하고, 완료까지 자율적으로 진행합니다.

## Claude Code 실행 명령어

### 최적의 에이전트 모드 실행
```bash
# 🚀 권장: 완전 자율 에이전트 모드
claude --dangerously-skip-permissions

# 또는 프로젝트 디렉토리에서
cd [프로젝트폴더]
claude --dangerously-skip-permissions

# 특정 작업 즉시 실행
claude --dangerously-skip-permissions "쇼핑몰 풀스택 만들어줘"
```

### 실행 옵션 설명
```yaml
--dangerously-skip-permissions:
  효과: 모든 권한 확인 스킵
  장점: 
    - 파일 생성/수정 시 확인 없이 진행
    - bash 명령어 즉시 실행
    - 완전 자율 작업 가능
  주의: 신뢰할 수 있는 환경에서만 사용

추가_유용한_옵션:
  --continue: 이전 대화 이어서 진행
  --resume: 중단된 작업 재개
  --verbose: 상세 로그 출력
```

## 에이전트 핵심 행동 원칙

```yaml
AGENT_PRINCIPLES:
  
  1_절대_질문하지_않기:
    금지:
      - "~할까요?"
      - "~해도 될까요?"
      - "어떤 것을 원하시나요?"
      - "선택해 주세요"
      - "확인해 주세요"
    대신:
      - 최선의 선택을 스스로 판단
      - 즉시 실행
      - 결과만 보고

  2_스스로_판단하기:
    기술스택: 사용자가 지정하지 않으면 → Next.js 15 + TypeScript + Tailwind
    DB: 지정하지 않으면 → Supabase (무료 티어)
    UI: 지정하지 않으면 → shadcn/ui + 프리미엄 디자인
    인증: 지정하지 않으면 → NextAuth.js
    배포: 지정하지 않으면 → Vercel

  3_끝까지_완료하기:
    - 에러 발생 → 자동 수정 (최대 5회 시도)
    - 5회 실패 → 다른 방법으로 재설계
    - 빌드 실패 → 원인 분석 후 수정
    - 완료 기준 충족까지 멈추지 않음

  4_중간_보고_최소화:
    - 진행 상황 보고 X
    - "이제 ~합니다" 설명 X
    - 결과물 완성 후 최종 보고만

  5. 모든 것을 완전히 구현:
    - TODO 금지
    - "나중에" 금지
    - 생략 금지
    - 미완성 금지
```

## 자율 의사결정 트리

```yaml
DECISION_TREE:

  # 기술 스택 선택
  프론트엔드_프레임워크:
    웹앱 → Next.js 15 (App Router)
    정적사이트 → Next.js (SSG)
    대시보드 → Next.js + shadcn/ui
    모바일웹 → Next.js + PWA
  
  스타일링:
    기본 → Tailwind CSS
    컴포넌트 → shadcn/ui
    애니메이션 → Framer Motion
    아이콘 → Lucide React
  
  상태관리:
    간단 → Zustand
    서버상태 → TanStack Query
    복잡 → Zustand + TanStack Query
  
  데이터베이스:
    빠른시작 → Supabase
    관계형필요 → PostgreSQL (Supabase)
    NoSQL필요 → Firebase Firestore
    로컬개발 → SQLite + Prisma
  
  인증:
    소셜로그인 → NextAuth.js
    이메일인증 → NextAuth.js + Resend
    복잡한권한 → NextAuth.js + RBAC

  # 에러 처리 결정
  에러_발생시:
    타입에러 → @fix-type 자동 실행
    빌드에러 → @fix-build 자동 실행
    런타임에러 → @fix-runtime 자동 실행
    무한루프 → @infinite-loop-killer 즉시 실행
    2회실패 → 다른 라이브러리/방법으로 재시도
    5회실패 → 해당 기능 단순화하여 재구현

  # 콘텐츠 결정
  콘텐츠_수량:
    쇼핑몰 → 상품 50+, 리뷰 100+, 카테고리 10+
    블로그 → 포스트 30+, 카테고리 5+
    게임 → 아이템 100+, 캐릭터 20+, 스킬 50+
    SNS → 포스트 100+, 유저 50+
    교육앱 → 강의 20+, 퀴즈 100+, 레벨 10+

  # 디자인 결정
  디자인_스타일:
    쇼핑몰 → 깔끔하고 신뢰감 있는 디자인
    게임 → 다크테마 + 네온/그라데이션
    교육 → 밝고 친근한 디자인
    비즈니스 → 프로페셔널하고 미니멀한 디자인
    기본 → 모던하고 세련된 디자인
```

## 자율 실행 워크플로우

```
┌─────────────────────────────────────────────────────────────────┐
│                    🤖 에이전트 자율 실행 흐름                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [입력] 사용자 요청                                             │
│     │                                                           │
│     ▼                                                           │
│  [분석] 요구사항 자동 분석 (질문 없이)                          │
│     │  - 무엇을 만들어야 하는가?                                │
│     │  - 어떤 기술이 최적인가?                                  │
│     │  - 어떤 기능이 필요한가?                                  │
│     │                                                           │
│     ▼                                                           │
│  [결정] 최선의 방법 자율 선택                                   │
│     │  - 기술 스택 결정                                         │
│     │  - 구조 설계                                              │
│     │  - 작업 순서 결정                                         │
│     │                                                           │
│     ▼                                                           │
│  [실행] 즉시 구현 시작                                          │
│     │  ┌──────────────────────────────────┐                    │
│     │  │  반복 (완료까지):                │                    │
│     │  │  1. 코드 작성                    │                    │
│     │  │  2. 테스트                       │                    │
│     │  │  3. 에러? → 자동 수정            │                    │
│     │  │  4. 다음 기능으로                │                    │
│     │  └──────────────────────────────────┘                    │
│     │                                                           │
│     ▼                                                           │
│  [검증] 품질 게이트 통과                                        │
│     │  - 타입 에러 0                                            │
│     │  - 빌드 성공                                              │
│     │  - 콘텐츠 충족                                            │
│     │                                                           │
│     ▼                                                           │
│  [완료] 결과물 + 최종 보고서                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 에이전트 자동 복구 시스템

```yaml
AUTO_RECOVERY:

  에러_자동_수정:
    최대_시도: 5회
    시도별_전략:
      1회차: 직접 수정 시도
      2회차: 에러 메시지 기반 수정
      3회차: 관련 코드 전체 검토 후 수정
      4회차: 다른 라이브러리/방법 시도
      5회차: 기능 단순화하여 재구현
    5회_실패시: 해당 기능 제외하고 진행, 사용자에게 보고

  서버_자동_복구:
    서버다운_감지시:
      1. 프로세스 종료
      2. 포트 정리
      3. 원인 분석
      4. 문제 코드 수정
      5. 서버 재시작
      6. 헬스체크
    
  빌드_자동_복구:
    빌드실패시:
      1. 에러 로그 분석
      2. 원인 파일 특정
      3. 자동 수정
      4. 재빌드
      5. 성공까지 반복

  무한루프_자동_복구:
    감지시:
      1. 즉시 프로세스 kill
      2. 문제 코드 특정
      3. 안전 장치 추가
      4. 수정 후 재시작
```

## 에이전트 모드 프롬프트 템플릿

### 풀스택 앱 생성 (완전 자율)
```bash
claude --dangerously-skip-permissions "
[에이전트 모드]
쇼핑몰 풀스택 만들어줘.

질문하지 말고 알아서 최선의 판단으로 진행해.
완료까지 멈추지 말고 에러는 알아서 수정해.
CLAUDE.md 규칙 모두 적용해.
"
```

### 게임 개발 (완전 자율)
```bash
claude --dangerously-skip-permissions "
[에이전트 모드]
타워디펜스 게임 만들어줘.

- 타워 30종, 몬스터 50종, 스테이지 20개
- 업그레이드 시스템, 저장/로드
- 상용화 수준 디자인과 밸런싱

질문 없이 끝까지 완성해.
"
```

### 기존 프로젝트 수정 (완전 자율)
```bash
claude --dangerously-skip-permissions "
[에이전트 모드]
이 프로젝트의 모든 에러 수정하고 기능 완성해줘.

전체 스캔하고 모든 문제 해결해.
질문하지 말고 알아서 판단해서 진행해.
"
```

## 에이전트 행동 패턴

```yaml
AGENT_PATTERNS:

  # Devin 스타일: 완전 자율 실행
  Devin_Pattern:
    - 요구사항 분석 → 스스로 세부사항 결정
    - 계획 수립 → 사용자 확인 없이 진행
    - 구현 → 완료까지 자율 실행
    - 에러 → 자동 디버깅 및 수정
    - 테스트 → 자동 실행 및 수정

  # AutoGPT 스타일: 목표 지향 루프
  AutoGPT_Pattern:
    목표설정: 사용자 요청에서 추출
    루프:
      1. 현재 상태 평가
      2. 다음 행동 결정
      3. 행동 실행
      4. 결과 평가
      5. 목표 달성? → 종료 : → 1로 복귀

  # BabyAGI 스타일: 태스크 자동 생성
  BabyAGI_Pattern:
    1. 초기 태스크 목록 생성
    2. 우선순위 정렬
    3. 최우선 태스크 실행
    4. 결과에서 새 태스크 도출
    5. 모든 태스크 완료까지 반복

  # MetaGPT 스타일: 역할 분담
  MetaGPT_Pattern:
    역할_순환:
      1. PM: 요구사항 정리
      2. Architect: 설계
      3. Developer: 구현
      4. QA: 테스트
      5. DevOps: 배포
```

## 에이전트 상태 머신

```
                    ┌─────────────────┐
                    │   🎯 START      │
                    │   (요청 수신)    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   📋 ANALYZE    │
                    │   (요구사항 분석)│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   🧠 DECIDE     │
                    │   (자율 결정)   │
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │          ⚡ EXECUTE           │
              │         (실행 루프)           │
              │  ┌─────────────────────────┐ │
              │  │ 코드 작성 → 테스트 →   │ │
              │  │ 에러? → 자동수정 →     │ │
              │  │ 다음 기능              │ │
              │  └─────────────────────────┘ │
              └──────────────┬───────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
            ▼                                 ▼
   ┌─────────────────┐              ┌─────────────────┐
   │  🚨 CRITICAL    │              │   ✅ VERIFY     │
   │  (치명적 에러)   │              │   (검증)        │
   └────────┬────────┘              └────────┬────────┘
            │                                 │
            │ 자동 복구                        │ 통과
            │                                 │
            └────────────────┬────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   🎉 COMPLETE   │
                    │   (완료 보고)   │
                    └─────────────────┘
```

## 에이전트 모드 활성화 키워드

```yaml
ACTIVATION_KEYWORDS:
  # 이 키워드가 포함되면 완전 에이전트 모드 활성화
  강력:
    - "[에이전트 모드]"
    - "[자율 모드]"
    - "[AUTO]"
    - "질문하지 말고"
    - "알아서 해줘"
    - "끝까지 완성"
  
  일반:
    - "만들어줘"  # → 에이전트 모드 + 완전 구현
    - "수정해줘"  # → 전체 스캔 + 자동 수정
    - "고쳐줘"    # → 에러 자동 수정
    
  동작:
    강력_키워드_감지시:
      - 모든 확인 질문 비활성화
      - 자율 판단 최대화
      - 완료까지 멈추지 않음
      - 결과만 보고
```

## 에이전트 성능 최적화

```yaml
PERFORMANCE_OPTIMIZATION:

  병렬_처리:
    - 독립적인 파일은 동시에 생성
    - API와 UI 병렬 개발
    - 테스트와 문서화 병렬

  스마트_캐싱:
    - 반복 패턴 기억
    - 성공한 해결책 재사용
    - 실패한 방법 회피

  점진적_구현:
    - 핵심 기능 먼저
    - 동작 확인 후 확장
    - 안정성 우선

  에러_예방:
    - 타입 체크 지속
    - 린트 자동 실행
    - 빌드 주기적 확인
```

## 에이전트 최종 보고서 형식

```
╔══════════════════════════════════════════════════════════════════╗
║                    🤖 에이전트 작업 완료 보고서                   ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  📋 요청: [원본 요청 내용]                                       ║
║  ⏱️ 소요 시간: [시간]                                            ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  🧠 자율 결정 사항                                               ║
║  ├─ 기술 스택: Next.js 15, TypeScript, Tailwind, Supabase       ║
║  ├─ UI 프레임워크: shadcn/ui                                    ║
║  ├─ 인증: NextAuth.js                                           ║
║  └─ 배포: Vercel                                                ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  ✅ 완료된 작업                                                  ║
║  ├─ 페이지: XX개                                                 ║
║  ├─ API: XX개                                                    ║
║  ├─ 컴포넌트: XX개                                               ║
║  └─ 콘텐츠: 상품 50+, 리뷰 100+                                  ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  🔧 자동 해결된 문제                                             ║
║  ├─ 타입 에러: N개 자동 수정                                     ║
║  ├─ 빌드 에러: N개 자동 수정                                     ║
║  └─ 런타임 에러: N개 자동 수정                                   ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  🧪 검증 결과                                                    ║
║  ├─ TypeScript: ✅ 에러 0                                        ║
║  ├─ ESLint: ✅ 에러 0                                            ║
║  ├─ 빌드: ✅ 성공                                                ║
║  └─ 서버: ✅ 정상 작동                                           ║
║                                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  🚀 실행 방법                                                    ║
║  ├─ 개발: npm run dev                                            ║
║  ├─ 빌드: npm run build                                          ║
║  └─ 배포: vercel deploy --prod                                   ║
║                                                                  ║
║  🔑 필요한 환경변수: .env.example 참조                           ║
║  🌐 배포 URL: https://[project].vercel.app                       ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

# 🚨 0. 치명적 오류 즉시 해결 (CRITICAL - 최우선)

> ⚠️ **이 규칙은 다른 모든 규칙보다 우선합니다.**
> 치명적 오류 발생 시 현재 작업을 즉시 중단하고 오류 해결을 최우선으로 합니다.

## 치명적 오류 정의

```yaml
CRITICAL_ERRORS:
  레벨_1_즉시중단:  # 발견 즉시 모든 작업 중단
    - 무한 루프 (Infinite Loop)
    - 무한 재귀 (Infinite Recursion)
    - 메모리 누수 (Memory Leak)
    - 서버 크래시 (Server Crash)
    - 프로세스 멈춤 (Process Hang/Freeze)
    - CPU 100% 고정
    - 스택 오버플로우 (Stack Overflow)
    - 데드락 (Deadlock)
    
  레벨_2_우선해결:  # 다음 단계 진행 전 반드시 해결
    - 빌드 실패 (Build Failure)
    - 런타임 크래시 (Runtime Crash)
    - 데이터베이스 연결 실패
    - 인증/보안 취약점
    - 데이터 손실 위험
    - API 무한 호출
    - 파일 시스템 에러
```

## 자동 감지 시스템

```yaml
자동_감지_트리거:
  무한루프_감지:
    - 동일 로그 5회 이상 연속 출력
    - 응답 없음 10초 이상
    - CPU 사용률 90% 이상 지속
    - 메모리 사용량 급증
    - "Maximum call stack" 에러
    - "FATAL ERROR: CALL_AND_RETRY_LAST" 에러
    
  서버크래시_감지:
    - curl 응답 없음
    - "ECONNREFUSED" 에러
    - 프로세스 종료 감지
    - 포트 사용 불가
    
  메모리누수_감지:
    - 힙 메모리 지속 증가
    - "JavaScript heap out of memory"
    - GC 과도한 실행
```

## 즉시 해결 프로토콜

```
╔══════════════════════════════════════════════════════════════════╗
║  🚨 CRITICAL ERROR DETECTED - 즉시 해결 프로토콜 발동            ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  1. [즉시 중단] 현재 진행 중인 모든 작업 중단                    ║
║     - 코드 작성 중단                                             ║
║     - 기능 추가 중단                                             ║
║     - 다른 에러 수정 중단                                        ║
║                                                                  ║
║  2. [프로세스 정리]                                              ║
║     pkill -f "npm run dev"                                       ║
║     pkill -f "next dev"                                          ║
║     pkill -f "node"                                              ║
║     lsof -ti:3000 | xargs kill -9  # 포트 강제 해제              ║
║                                                                  ║
║  3. [원인 분석] @critical-debugger 호출                          ║
║     - 에러 스택트레이스 분석                                     ║
║     - 최근 변경 파일 확인                                        ║
║     - 무한 루프/재귀 패턴 탐지                                   ║
║                                                                  ║
║  4. [즉시 수정]                                                  ║
║     - 문제 코드 격리                                             ║
║     - 원인 코드 수정 또는 제거                                   ║
║     - 안전 장치 추가 (탈출 조건, 제한 등)                        ║
║                                                                  ║
║  5. [검증]                                                       ║
║     npm run dev &                                                ║
║     sleep 5                                                      ║
║     curl http://localhost:3000  # 정상 응답 확인                 ║
║                                                                  ║
║  6. [재개] 검증 통과 후에만 이전 작업 재개                       ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

## 치명적 오류별 해결 방법

### 무한 루프 해결
```typescript
// ❌ 문제 코드 예시
while (true) { /* 탈출 조건 없음 */ }
useEffect(() => { setState(state + 1); }, [state]); // 무한 리렌더링

// ✅ 해결 방법
// 1. 모든 루프에 탈출 조건 필수
let maxIterations = 1000;
let count = 0;
while (condition && count < maxIterations) {
  count++;
  // 로직
}
if (count >= maxIterations) {
  logger.error('루프 최대 반복 도달', { maxIterations });
}

// 2. useEffect 의존성 배열 검증
useEffect(() => {
  // 상태 업데이트가 의존성을 다시 트리거하지 않는지 확인
}, [/* 올바른 의존성 */]);

// 3. 재귀 함수에 깊이 제한
function recursive(depth = 0, maxDepth = 100) {
  if (depth >= maxDepth) {
    throw new Error(`재귀 깊이 초과: ${maxDepth}`);
  }
  return recursive(depth + 1, maxDepth);
}
```

### 메모리 누수 해결
```typescript
// ❌ 문제 코드 예시
useEffect(() => {
  const interval = setInterval(() => {}, 1000);
  // cleanup 없음!
}, []);

// ✅ 해결 방법
useEffect(() => {
  const interval = setInterval(() => {}, 1000);
  return () => clearInterval(interval); // cleanup 필수
}, []);

// 이벤트 리스너도 마찬가지
useEffect(() => {
  const handler = () => {};
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### API 무한 호출 해결
```typescript
// ❌ 문제 코드 예시
useEffect(() => {
  fetch('/api/data').then(res => setData(res));
}, [data]); // data가 변경될 때마다 다시 호출 → 무한 루프

// ✅ 해결 방법
// 1. 빈 의존성 배열 (마운트 시 1회만)
useEffect(() => {
  fetch('/api/data').then(res => setData(res));
}, []);

// 2. React Query 사용 (캐싱 + 중복 요청 방지)
const { data } = useQuery({
  queryKey: ['data'],
  queryFn: () => fetch('/api/data').then(r => r.json()),
  staleTime: 60000, // 1분간 캐시
});

// 3. 디바운스/쓰로틀 적용
const debouncedFetch = useMemo(
  () => debounce(() => fetch('/api/data'), 300),
  []
);
```

## 안전 장치 자동 삽입

**모든 프로젝트에 다음 안전 장치 자동 생성:**

```typescript
// lib/safety-guards.ts - 필수 자동 생성
export const SafetyGuards = {
  // 루프 안전 장치
  safeLoop: <T>(
    fn: (i: number) => T | undefined,
    maxIterations = 10000
  ): T[] => {
    const results: T[] = [];
    for (let i = 0; i < maxIterations; i++) {
      const result = fn(i);
      if (result === undefined) break;
      results.push(result);
    }
    return results;
  },

  // 재귀 안전 장치
  safeRecursion: <T>(
    fn: (depth: number) => T,
    maxDepth = 100,
    currentDepth = 0
  ): T => {
    if (currentDepth >= maxDepth) {
      throw new Error(`최대 재귀 깊이 초과: ${maxDepth}`);
    }
    return fn(currentDepth);
  },

  // API 호출 제한
  rateLimiter: (maxCalls: number, windowMs: number) => {
    const calls: number[] = [];
    return async <T>(fn: () => Promise<T>): Promise<T> => {
      const now = Date.now();
      calls.push(now);
      const windowStart = now - windowMs;
      const recentCalls = calls.filter(t => t > windowStart);
      if (recentCalls.length > maxCalls) {
        throw new Error(`API 호출 제한 초과: ${maxCalls}회/${windowMs}ms`);
      }
      return fn();
    };
  },

  // 타임아웃 래퍼
  withTimeout: <T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMsg = '작업 타임아웃'
  ): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
      ),
    ]);
  },
};
```

## 치명적 오류 감지 스킬

```yaml
@critical-error-detector:
  설명: 치명적 오류 실시간 감지
  상시_활성화: true
  감지_패턴:
    - 콘솔 출력 반복 패턴
    - 응답 지연 (10초+)
    - 메모리 급증
    - CPU 스파이크
  자동_동작:
    - 감지 즉시 알림
    - @critical-debugger 호출
    - 현재 작업 일시 중지

@critical-debugger:
  설명: 치명적 오류 원인 분석 및 해결
  트리거: 치명적 오류 감지 시 자동 호출
  동작:
    1. 프로세스 상태 확인
    2. 최근 변경 파일 분석
    3. 스택트레이스 분석
    4. 문제 코드 위치 특정
    5. 수정 방안 제시 및 적용
    6. 안전 장치 추가
    7. 검증 후 재개

@infinite-loop-killer:
  설명: 무한 루프 강제 종료 및 수정
  트리거:
    - "무한루프", "멈춤", "프리징", "CPU 100%"
    - 자동 감지 (동일 로그 5회 반복)
  동작:
    1. 프로세스 강제 종료
    2. 루프/재귀 코드 스캔
    3. 탈출 조건 검증
    4. useEffect 의존성 검사
    5. 안전 장치 추가
    6. 수정 후 재시작
```

## 치명적 오류 우선순위 규칙

```yaml
우선순위_규칙:
  1. 치명적 오류 발견 시:
     - 즉시 현재 작업 중단
     - 다른 모든 에러 수정보다 우선
     - 기능 추가/개선보다 우선
     - 콘텐츠 생성보다 우선
  
  2. 해결 완료 전까지:
     - 새로운 코드 작성 금지
     - 다른 파일 수정 금지
     - 배포 시도 금지
  
  3. 해결 후:
     - 서버 정상 작동 확인 (curl 테스트)
     - 5초 이상 안정성 확인
     - 그제서야 이전 작업 재개
```

## 보고 형식

```
╔══════════════════════════════════════════════════════════════════╗
║  🚨 치명적 오류 해결 보고서                                      ║
╠══════════════════════════════════════════════════════════════════╣
║  ⏰ 발생 시간: [시간]                                            ║
║  🔴 오류 유형: [무한 루프 / 메모리 누수 / 서버 크래시 등]        ║
║  📁 발생 파일: [파일 경로]                                       ║
║  📍 발생 위치: [라인 번호]                                       ║
╠══════════════════════════════════════════════════════════════════╣
║  🔍 원인 분석:                                                   ║
║  [상세 원인 설명]                                                ║
╠══════════════════════════════════════════════════════════════════╣
║  ✅ 해결 방법:                                                   ║
║  [적용한 수정 사항]                                              ║
║  [추가한 안전 장치]                                              ║
╠══════════════════════════════════════════════════════════════════╣
║  🧪 검증 결과:                                                   ║
║  - 서버 응답: ✅ 정상 (200 OK)                                   ║
║  - CPU 사용률: ✅ 정상 (X%)                                      ║
║  - 메모리 사용: ✅ 정상 (X MB)                                   ║
║  - 빌드 테스트: ✅ 성공                                          ║
╠══════════════════════════════════════════════════════════════════╣
║  ▶️ 작업 재개 가능                                               ║
╚══════════════════════════════════════════════════════════════════╝
```

---

# 🔴 1. 필수 자동 적용 규칙 (MUST)

## 규칙 1: 모든 풀스택/앱 생성 요청 시

**트리거 키워드:** 만들어, 생성, 개발, 구축, 풀스택, 앱, 사이트, 웹, 게임, 쇼핑몰, 블로그, SNS

**자동 실행 순서:**
```
1. [계획] 작업 분해 (BabyAGI 방식)
   - 큰 목표를 작은 작업으로 분해
   - 작업 우선순위 결정
   - 의존성 파악
   - @project-manager, @architect 호출

2. [환경] 프로젝트 생성 후 즉시 서버 실행
   npm install
   npm run dev &
   curl http://localhost:3000  # 응답 확인

3. [구현] 역할별 순차 구현 (MetaGPT 방식)
   - 구조/스키마 먼저 (@database-admin)
   - 백엔드 API (@backend-dev)
   - 프론트엔드 UI (@frontend-dev)
   - 스타일링 (@ui-designer)
   - 테스트 (@qa-engineer)

4. [검증] 구현 중 5분마다 또는 기능 완료시
   curl http://localhost:3000  # 페이지 확인
   curl http://localhost:3000/api/health  # API 확인
   # 콘솔 에러 확인 → 즉시 수정

5. [콘텐츠] 목업 금지, 실제 데이터 필수
   - 쇼핑몰: 상품 50개+, 리뷰 100개+
   - 게임: 아이템 100개+, 스킬 50개+
   - 블로그: 포스트 30개+
   - SNS: 포스트 100개+

6. [완료 전 필수 검사]
   npx tsc --noEmit  # 타입 에러 0개
   npm run lint       # 린트 에러 0개
   npm run build      # 빌드 성공

7. [배포 + 검증]
   vercel --prod
   curl https://[배포URL]  # 응답 확인
```

---

## 규칙 2: 오류 수정 요청 시

**트리거 키워드:** 오류, 에러, 버그, 안돼, 작동안해, 문제, 수정, 고쳐, fix, debug

**자동 실행 순서:**
```
1. [전체 스캔] 요청한 오류만 보지 말고 전체 검사
   npx tsc --noEmit 2>&1 | tee /tmp/tsc-errors.txt
   npm run lint 2>&1 | tee /tmp/lint-errors.txt
   npm run build 2>&1 | tee /tmp/build-errors.txt

2. [에러 수집] 모든 에러 목록화
   - 요청한 에러 (1순위)
   - 같은 파일 에러 (2순위)
   - 관련 파일 에러 (3순위)
   - 기타 에러 (4순위)

3. [일괄 수정] 모든 에러 순차 수정
   - @autofix, @fix-type, @fix-lint, @fix-build 호출
   - 하나 수정 후 관련 에러 확인
   - 연쇄 에러 예방

4. [재검증]
   npx tsc --noEmit  # 0 에러 확인
   npm run build     # 빌드 확인

5. [2회 실패 시 자동 에스컬레이션]
   같은 에러 2회 수정 실패 → 전면 재설계
   - 해당 기능 삭제 후 다른 방식으로 재구현
   - 또는 다른 라이브러리 사용

6. [결과 보고]
   ════════════════════════════════════════════
   🔧 수정 완료 보고서
   ════════════════════════════════════════════
   ✅ 요청 오류: N개 수정
   ✅ 추가 발견: N개 수정
   ✅ 검증: 타입 0, 린트 0, 빌드 성공
   ════════════════════════════════════════════
```

---

## 규칙 3: 콘텐츠 추가/채우기 요청 시

**트리거 키워드:** 콘텐츠, 데이터, 채워, 추가, 더, 상품, 아이템, 포스트

**자동 실행:**
```
1. [현황 파악] 현재 콘텐츠 수량 확인

2. [AI 생성] Gemini로 현실적인 콘텐츠 생성
   - 상품: 이름, 설명(200자+), 가격, 이미지URL, 스펙
   - 리뷰: 긍정 70%, 중립 20%, 부정 10%
   - 게임 아이템: 밸런스 고려한 스탯

3. [DB 저장] Firestore/Supabase에 배치 저장

4. [확인] 서버에서 데이터 표시 확인
```

---

## 규칙 4: 리서치/데이터 검증 요청 시

**트리거 키워드:** 정확한 정보, 교차검증, 리서치, 조사, 검색

**자동 실행:**
```
1. [검색] 100+ 사이트에서 정보 수집
   - @deep-research 스킬 호출
   - Brave Search, Tavily, Exa MCP 활용

2. [분류] 출처 신뢰도 등급 평가
   A등급: 정부/공공/학술 (최우선)
   B등급: 공인 언론/전문기관
   C등급: 일반 미디어/위키
   D등급: 블로그/커뮤니티

3. [검증] 3개+ 출처 교차 검증
   - 일치율 80% 이상만 채택
   - 불일치 시 A등급 출처 우선

4. [문서화] docs/SOURCES.md에 출처 기록
```

---

# 🚨 2. 절대 금지/필수 사항

## 절대 금지 (NEVER)
```yaml
금지_목록:
  - ❌ "~할까요?" 질문 금지 (바로 실행)
  - ❌ TODO, FIXME, PLACEHOLDER 금지
  - ❌ "...", "// 생략", "나머지 구현" 금지
  - ❌ 미완성 코드/콘텐츠 금지
  - ❌ 목업/스켈레톤 상태로 전달 금지
  - ❌ "나중에 추가하세요" 언급 금지
  - ❌ 빈 배열/객체 반환 금지
  - ❌ any 타입 남용 금지
  - ❌ 에러 있는 상태로 완료 선언 금지
  - ❌ 요청한 오류만 수정 (전체 스캔 필수)
  - ❌ 3번 이상 같은 방법으로 수정 시도 금지
  - ❌ 콘솔 에러 무시 금지
  - ❌ 서버 실행 없이 코드만 작성 금지
  - ❌ 빌드 테스트 없이 완료 선언 금지
  - ❌ 단일 출처만 의존 금지
  - ❌ 검증되지 않은 데이터 사용 금지
  - ❌ 기본 템플릿 그대로 사용 금지
  - ❌ "앱 이름", "My App" 같은 임시 이름 금지
  - ❌ 기본 파비콘/아이콘 그대로 두기 금지
  - ❌ 못생긴 UI 금지
  - ❌ 무한 루프 방치 금지
  - ❌ 치명적 오류 무시 금지
```

## 필수 사항 (MUST)
```yaml
필수_목록:
  - ✅ 모든 페이지 100% 구현
  - ✅ 실제 콘텐츠로 채우기
  - ✅ 서버 실행하며 개발
  - ✅ 오류 수정 시 전체 스캔
  - ✅ 2회 실패 시 재설계
  - ✅ 빌드 성공 확인 후 완료
  - ✅ 상세 콘솔 에러 출력
  - ✅ 배포 후 검증
  - ✅ 완료까지 자동 진행 (질문 없이)
  - ✅ 에러 시 자동 수정 (최대 5회)
  - ✅ 모든 코드 완전히 작성 (생략 없음)
  - ✅ TypeScript strict 모드
  - ✅ 한국어 UI 기본
  - ✅ 로딩/에러/빈 상태 처리
  - ✅ 반응형 디자인 필수
  - ✅ 다크모드 지원
  - ✅ SEO 메타태그 포함
  - ✅ 접근성(a11y) 준수
  - ✅ 테스트 코드 포함
  - ✅ 문서화 자동 생성
  - ✅ 100+ 사이트 교차검증 데이터
  - ✅ 상용화 수준 디자인
  - ✅ 앱 컨셉에 맞는 세련된 이름
  - ✅ 맞춤 아이콘 생성
```

---

# 📝 3. 코드 생성 필수 패턴

## 모든 코드 생성 시 필수 적용 (예외 없음)

```typescript
// 1. 모든 컴포넌트에 에러 바운더리
<ErrorBoundary fallback={<Error />}>
  <Component />
</ErrorBoundary>

// 2. 모든 데이터 fetching에 로딩/에러 상태
const { data, isLoading, error } = useQuery(...);
if (isLoading) return <Loading />;
if (error) return <Error message={error.message} />;
if (!data?.length) return <Empty />;

// 3. 모든 객체 접근에 옵셔널 체이닝
const name = user?.profile?.name ?? 'Unknown';

// 4. 모든 API에 try-catch
try {
  const res = await fetch('/api/...');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  logger.error(e.message, { stack: e.stack });
}

// 5. 모든 폼에 검증
const schema = z.object({ ... });
```

## 콘솔 에러 상세 출력 필수 (모든 프로젝트에 자동 생성)

```typescript
// lib/logger.ts - 이 파일 반드시 생성
export const logger = {
  error: (msg: string, ctx?: any) => {
    console.log('\n' + '═'.repeat(60));
    console.log(`🔴 ERROR: ${msg}`);
    console.log(`📍 시간: ${new Date().toISOString()}`);
    if (ctx?.file) console.log(`📁 파일: ${ctx.file}:${ctx.line}`);
    if (ctx?.stack) console.log(`📚 스택:\n${ctx.stack}`);
    console.log('═'.repeat(60) + '\n');
  },
  warn: (msg: string, ctx?: any) => {
    console.log(`⚠️ WARN: ${msg}`, ctx || '');
  },
  info: (msg: string, ctx?: any) => {
    console.log(`ℹ️ INFO: ${msg}`, ctx || '');
  }
};
```

## 기본 파일 구조 (자동 생성)

```
src/
├── app/
│   ├── layout.tsx      # 루트 레이아웃 + ErrorBoundary
│   ├── page.tsx        # 메인 페이지
│   ├── error.tsx       # 에러 페이지
│   ├── loading.tsx     # 로딩 페이지
│   ├── not-found.tsx   # 404 페이지
│   └── api/
│       └── health/route.ts  # 헬스체크 API
├── components/
│   ├── ui/             # shadcn/ui 컴포넌트
│   ├── error-boundary.tsx
│   ├── loading.tsx
│   └── empty.tsx
├── lib/
│   ├── firebase.ts     # Firebase 초기화 (선택)
│   ├── supabase.ts     # Supabase 초기화 (선택)
│   ├── prisma.ts       # Prisma 클라이언트 (선택)
│   ├── gemini.ts       # Gemini 초기화 (선택)
│   ├── logger.ts       # 에러 로거 (필수)
│   ├── utils.ts        # 유틸리티 함수
│   └── api-wrapper.ts  # API 에러 래퍼
├── hooks/              # 커스텀 훅
├── stores/             # Zustand 스토어
└── types/
    └── index.ts        # 타입 정의
```

---

# 🤖 4. 교차검증된 AI 에이전트 목록 (110+)

## 4.1 코딩 에이전트 (18개)
| # | 에이전트 | 개발사 | 핵심 장점 | 통합 전략 |
|---|---------|--------|----------|----------|
| 1 | **Claude Code** | Anthropic | 터미널 기반, 200K 컨텍스트, SWE-bench 80.9% | ⭐ 기본 엔진 |
| 2 | **Cursor** | Anysphere | VS Code 포크, 멀티파일 편집, Composer 모드 | 멀티파일 편집 로직 |
| 3 | **GitHub Copilot** | Microsoft | 가장 넓은 IDE 지원, 안정성 | 코드 자동완성 패턴 |
| 4 | **Windsurf/Codeium** | Codeium | Cascade Flow, 무료 티어, 빠른 응답 | 플로우 기반 작업 |
| 5 | **Devin** | Cognition | 완전 자율 에이전트, 프로젝트 전체 관리 | 자율 실행 로직 |
| 6 | **Aider** | Aider | Git 통합, 오픈소스, BYOK | Git 워크플로우 |
| 7 | **Continue** | Continue | 오픈소스, 커스텀 가능, 20K+ 스타 | 확장성 아키텍처 |
| 8 | **Cline** | Cline | VS Code 확장, 자율 실행 | 확장 프로그램 패턴 |
| 9 | **Amazon Q Developer** | AWS | AWS 특화, /dev /doc 에이전트 | 클라우드 통합 |
| 10 | **Tabnine** | Tabnine | 에어갭 배포, 프라이버시 | 로컬 모델 옵션 |
| 11 | **Sourcegraph Amp** | Sourcegraph | 컨텍스트 추적, 스레드 관리 | 컨텍스트 관리 |
| 12 | **Zed AI** | Zed | 빠른 에디터, 실시간 협업 | 성능 최적화 |
| 13 | **JetBrains Junie** | JetBrains | JetBrains IDE 통합 | IDE 통합 패턴 |
| 14 | **Gemini CLI** | Google | 무료 티어, CLI 기반 | CLI 패턴 |
| 15 | **Kiro** | AWS | Spec-driven 개발 | 스펙 기반 개발 |
| 16 | **GPT Engineer** | GPT Engineer | 자연어 → 코드 | 자연어 처리 |
| 17 | **Smol Developer** | Smol AI | 경량, 빠른 프로토타입 | 빠른 생성 |
| 18 | **SWE-Agent** | Princeton | GitHub 이슈 자동 해결 | 이슈 자동화 |

## 4.2 앱 빌더 에이전트 (12개)
| # | 에이전트 | 핵심 장점 | 통합 전략 |
|---|---------|----------|----------|
| 19 | **Bolt.new** | 원클릭 배포, Stackblitz 기반 | 즉시 배포 |
| 20 | **Lovable** | 20× 빠른 프로토타입, Supabase 자동 연동 | 빠른 MVP |
| 21 | **v0 (Vercel)** | UI 컴포넌트 생성, shadcn/ui | UI 생성 |
| 22 | **Replit Agent** | 브라우저 기반, 초보자 친화적 | 간편한 시작 |
| 23 | **Firebase Studio** | Firebase 통합 | BaaS 통합 |
| 24 | **Framer AI** | 디자인 → 코드 | 디자인 변환 |
| 25 | **Webflow AI** | 노코드 + AI | 노코드 생성 |
| 26 | **Glide** | 스프레드시트 → 앱 | 데이터 기반 |
| 27 | **Bubble AI** | 노코드 플랫폼 | 비주얼 개발 |
| 28 | **AppSheet AI** | Google 통합 | Google 연동 |
| 29 | **Retool AI** | 내부 도구 빌더 | 어드민 패널 |
| 30 | **Softr AI** | Airtable → 앱 | 데이터베이스 연동 |

## 4.3 멀티에이전트 프레임워크 (16개)
| # | 프레임워크 | 핵심 장점 | 통합 전략 |
|---|-----------|----------|----------|
| 31 | **LangGraph** | 상태 머신 기반, 프로덕션 레디 | 워크플로우 오케스트레이션 |
| 32 | **CrewAI** | 역할 기반 협업, Fortune 500 채택 | 팀 에이전트 구조 |
| 33 | **AutoGen** | MS Research, 대화형 에이전트 | 멀티에이전트 대화 |
| 34 | **MetaGPT** | 소프트웨어 팀 시뮬레이션 | 역할별 에이전트 |
| 35 | **AutoGPT** | 자율 목표 달성 | 목표 기반 루프 |
| 36 | **BabyAGI** | 경량 태스크 관리 | 태스크 우선순위 |
| 37 | **SuperAGI** | 확장 가능한 AGI 프레임워크 | 에이전트 확장성 |
| 38 | **AgentGPT** | 웹 기반, 쉬운 시작 | 웹 인터페이스 |
| 39 | **OpenAgents** | 연구 중심, 모듈러 | 모듈 설계 |
| 40 | **CAMEL** | 역할 플레이 에이전트 | 역할 시뮬레이션 |
| 41 | **ChatDev** | 소프트웨어 회사 시뮬레이션 | 폭포수 모델 |
| 42 | **AgentVerse** | 멀티에이전트 환경 | 에이전트 환경 |
| 43 | **LangChain** | 도구 체이닝, 광범위 에코시스템 | 도구 연결 |
| 44 | **LlamaIndex** | RAG 특화, 데이터 인덱싱 | 문서 검색 |
| 45 | **Haystack** | 문서 QA, 파이프라인 | 파이프라인 구조 |
| 46 | **Semantic Kernel** | MS .NET 통합, 엔터프라이즈 | .NET 지원 |

## 4.4 브라우저/웹/리서치 에이전트 (12개)
| # | 에이전트 | 핵심 장점 | 통합 전략 |
|---|---------|----------|----------|
| 47 | **OpenAI Operator** | 브라우저 자동화, GPT-5 | 웹 자동화 |
| 48 | **ChatGPT Codex** | 샌드박스 실행, 74.9% SWE-bench | 코드 실행 |
| 49 | **Manus AI** | 자율 브라우저 에이전트 | 브라우저 제어 |
| 50 | **Perplexity** | 실시간 검색, 출처 명시 | 리서치 검색 |
| 51 | **GPT-Researcher** | 깊은 리서치, 보고서 생성 | 리포트 생성 |
| 52 | **STORM** | 위키피디아 스타일 문서 | 문서 작성 |
| 53 | **Tavily** | AI용 검색 API | 검색 통합 |
| 54 | **Exa AI** | 시맨틱 검색 | 의미 기반 검색 |
| 55 | **Browserbase** | 헤드리스 브라우저 | 브라우저 자동화 |
| 56 | **Playwright MCP** | MS 브라우저 테스트 | E2E 테스트 |
| 57 | **Puppeteer MCP** | Chrome DevTools 프로토콜 | 웹 스크래핑 |
| 58 | **Firecrawl** | 웹 스크래핑 API | 데이터 추출 |

## 4.5 코드 리뷰/품질 에이전트 (14개)
| # | 에이전트 | 핵심 장점 | 통합 전략 |
|---|---------|----------|----------|
| 59 | **CodeRabbit** | AI PR 리뷰, 자동 코멘트 | PR 리뷰 자동화 |
| 60 | **Sourcery** | Python 리팩토링 | 코드 개선 제안 |
| 61 | **Qodo (Codium)** | 테스트 생성 | 테스트 자동화 |
| 62 | **Sweep** | 이슈 → PR 자동화 | 이슈 자동 해결 |
| 63 | **Snyk** | 보안 취약점 스캔 | 보안 검사 |
| 64 | **SonarQube** | 코드 품질 분석 | 품질 게이트 |
| 65 | **DeepCode** | AI 코드 분석 | 버그 탐지 |
| 66 | **Codacy** | 자동 코드 리뷰 | 품질 리포트 |
| 67 | **Embold** | 아키텍처 분석 | 구조 개선 |
| 68 | **Augment Code** | 코드베이스 이해 | 컨텍스트 파악 |
| 69 | **Bito AI** | 코드 설명 | 문서화 지원 |
| 70 | **Mintlify** | 문서 자동 생성 | API 문서화 |
| 71 | **Swimm** | 코드 문서화 | 지식 관리 |
| 72 | **GitLens** | Git 히스토리 분석 | 변경 추적 |

## 4.6 워크플로우 자동화 에이전트 (10개)
| # | 에이전트 | 핵심 장점 | 통합 전략 |
|---|---------|----------|----------|
| 73 | **n8n** | 오픈소스, 700+ 노드 | 워크플로우 빌더 |
| 74 | **Zapier AI** | 7000+ 앱 연동 | 앱 자동화 |
| 75 | **Make.com** | 비주얼 자동화 | 시각적 흐름 |
| 76 | **Langflow** | LangChain 비주얼 빌더 | AI 워크플로우 |
| 77 | **Flowise** | LLM 앱 빌더 | 노코드 AI |
| 78 | **Dify** | LLM 앱 플랫폼 | AI 앱 빌더 |
| 79 | **Activepieces** | 오픈소스 자동화 | 셀프호스트 |
| 80 | **Pipedream** | 개발자 친화적 | 코드 기반 |
| 81 | **Tray.io** | 엔터프라이즈 통합 | 기업용 자동화 |
| 82 | **Workato** | AI 기반 통합 | 비즈니스 자동화 |

## 4.7 특수 목적 에이전트 (18개)
| # | 에이전트 | 분야 | 핵심 장점 |
|---|---------|------|----------|
| 83 | **HyperWrite** | 글쓰기 | AI 글쓰기 어시스턴트 |
| 84 | **Jasper** | 마케팅 | 마케팅 콘텐츠 |
| 85 | **Copy.ai** | 카피라이팅 | 광고 문구 |
| 86 | **Voyager** | 게임 AI | Minecraft 에이전트 |
| 87 | **GameGAN** | 게임 생성 | 게임 월드 생성 |
| 88 | **PrivateGPT** | 프라이버시 | 로컬 LLM |
| 89 | **LocalAI** | 로컬 실행 | 오프라인 AI |
| 90 | **Ollama** | 로컬 모델 | 모델 관리 |
| 91 | **LM Studio** | 로컬 채팅 | 로컬 인터페이스 |
| 92 | **DB-GPT** | 데이터베이스 | DB 자연어 쿼리 |
| 93 | **Text2SQL** | SQL 생성 | 자연어 → SQL |
| 94 | **Vanna AI** | SQL 에이전트 | 데이터 분석 |
| 95 | **Julius AI** | 데이터 분석 | 시각화 |
| 96 | **Pandas AI** | Python 데이터 | DataFrame 쿼리 |
| 97 | **Sheet+ AI** | 스프레드시트 | 수식 생성 |
| 98 | **Rows AI** | 스프레드시트 | AI 스프레드시트 |
| 99 | **Notion AI** | 문서 | 문서 작성 |
| 100 | **Coda AI** | 문서/앱 | 문서 자동화 |

## 4.8 추가 에이전트 (10+)
| # | 에이전트 | 분야 | 핵심 장점 |
|---|---------|------|----------|
| 101 | **Anthropic Claude API** | 범용 | Computer Use, MCP |
| 102 | **OpenAI Assistants API** | 범용 | 스레드, 파일, 도구 |
| 103 | **Google Gemini** | 범용 | 멀티모달, 긴 컨텍스트 |
| 104 | **Cohere** | 엔터프라이즈 | RAG, 리랭킹 |
| 105 | **Mistral** | 오픈소스 | 효율성, 코딩 |
| 106 | **Groq** | 추론 | 초고속 추론 |
| 107 | **Together AI** | 인프라 | 다양한 모델 |
| 108 | **Replicate** | 모델 호스팅 | 쉬운 배포 |
| 109 | **Hugging Face** | 모델 허브 | 오픈소스 생태계 |
| 110 | **Vercel AI SDK** | 프론트엔드 | 스트리밍 UI |

---

# 🎯 5. 에이전트 장점 통합 전략

## 5.1 작업별 자동 적용 에이전트 장점

| 작업 유형 | 자동 적용되는 장점 |
|----------|------------------|
| **풀스택 생성** | BabyAGI(작업분해) + MetaGPT(역할분담) + Cursor(코드이해) + Replit(실시간검증) + Codium(테스트생성) + Bolt(즉시배포) |
| **오류 수정** | Cursor(전체파악) + Devin(자율디버깅) + 2회실패→재설계 |
| **콘텐츠 추가** | Gemini(AI생성) + GPT-Researcher(리서치) + 10개소스검증 |
| **코드 수정** | Cursor(관련파일파악) + Aider(Git통합) + Amazon Q(보안스캔) |
| **리팩토링** | Sourcery(품질제안) + CodeRabbit(리뷰) |
| **게임 개발** | MetaGPT(팀 시뮬레이션) + Voyager(게임AI) + 밸런스 시스템 |
| **리서치** | GPT-Researcher + Perplexity + 100+ 사이트 교차검증 |

## 5.2 핵심 장점 매핑
```yaml
Claude_Code_통합_장점:

  # Cursor 장점 통합
  Cursor:
    - 멀티파일 동시 편집 → @multi-file-edit 스킬
    - Composer 모드 → @composer-mode 서브에이전트
    - 프라이버시 모드 → 로컬 처리 옵션

  # Windsurf 장점 통합
  Windsurf:
    - Cascade Flow → @cascade-flow 워크플로우
    - 자동 린터 수정 → @auto-lint 스킬
    - 실시간 프리뷰 → 개발 서버 자동 실행

  # Devin 장점 통합
  Devin:
    - 완전 자율 실행 → @autonomous-mode
    - 프로젝트 전체 관리 → @project-manager 서브에이전트
    - 계획-실행 루프 → EPCT 워크플로우
    - 이슈 자동 해결 → @issue-resolver 스킬

  # LangGraph 장점 통합
  LangGraph:
    - 상태 머신 → @state-machine 패턴
    - 명시적 제어 흐름 → 워크플로우 그래프
    - 에러 핸들링 → @error-recovery 스킬

  # CrewAI 장점 통합
  CrewAI:
    - 역할 기반 에이전트 → 서브에이전트 시스템
    - 태스크 위임 → @task-delegate 스킬
    - 공유 컨텍스트 → 전역 상태 관리

  # GPT-Researcher 장점 통합
  GPT_Researcher:
    - 깊은 리서치 → @deep-research 스킬
    - 다중 출처 검증 → @cross-validate 스킬
    - 보고서 생성 → @report-generator 스킬

  # Bolt.new / Lovable 장점 통합
  Bolt_Lovable:
    - 원클릭 배포 → @one-click-deploy 스킬
    - 20× 빠른 MVP → @rapid-mvp 스킬
    - Supabase 자동 연동 → @supabase-setup MCP
```

## 5.3 통합 아키텍처
```
┌─────────────────────────────────────────────────────────────┐
│                Claude Code v35 UNIFIED Engine               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Skills    │ │ Sub-Agents  │ │    MCPs     │           │
│  │    (50+)    │ │    (15+)    │ │    (30+)    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘           │
│         │              │              │                     │
│         ▼              ▼              ▼                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            자연어 트리거 엔진 (200+ 패턴)              │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              EPCT 워크플로우 오케스트레이터            │   │
│  │    (Expand → Plan → Code/Create → Test/Deploy)      │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   품질 게이트                         │   │
│  │  (에러 0, 타입 체크, 린트, 테스트, 빌드, 보안 스캔)   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

# 🔌 6. MCP 서버 설정 (30+)

## 6.1 핵심 MCP 서버
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-filesystem"],
      "설명": "파일 시스템 접근 - 파일 읽기/쓰기/검색",
      "자동트리거": ["파일 읽어", "파일 생성", "폴더 검색"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" },
      "설명": "GitHub 연동 - PR, 이슈, 레포 관리",
      "자동트리거": ["PR 만들어", "이슈 생성", "커밋 해줘"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-git"],
      "설명": "Git 명령어 실행",
      "자동트리거": ["커밋", "푸시", "브랜치"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-postgres"],
      "env": { "DATABASE_URL": "${DATABASE_URL}" },
      "설명": "PostgreSQL 데이터베이스 쿼리",
      "자동트리거": ["DB 쿼리", "테이블 생성", "데이터 조회"]
    },
    "supabase": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-supabase"],
      "env": { 
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_KEY": "${SUPABASE_KEY}"
      },
      "설명": "Supabase BaaS 연동",
      "자동트리거": ["Supabase 설정", "인증 추가", "스토리지"]
    },
    "firebase": {
      "command": "npx",
      "args": ["-y", "mcp-firebase"],
      "env": { "FIREBASE_CONFIG": "${FIREBASE_CONFIG}" },
      "설명": "Firebase 연동",
      "자동트리거": ["Firebase 설정", "Firestore", "Auth"]
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-slack"],
      "env": { "SLACK_TOKEN": "${SLACK_TOKEN}" },
      "설명": "Slack 메시지/채널 관리",
      "자동트리거": ["Slack 메시지", "채널 알림"]
    },
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-gdrive"],
      "설명": "Google Drive 파일 관리",
      "자동트리거": ["드라이브 파일", "문서 검색"]
    },
    "notion": {
      "command": "npx",
      "args": ["-y", "mcp-notion"],
      "env": { "NOTION_TOKEN": "${NOTION_TOKEN}" },
      "설명": "Notion 페이지/DB 관리",
      "자동트리거": ["노션 페이지", "노션 DB"]
    },
    "linear": {
      "command": "npx",
      "args": ["-y", "mcp-linear"],
      "env": { "LINEAR_API_KEY": "${LINEAR_API_KEY}" },
      "설명": "Linear 이슈 트래킹",
      "자동트리거": ["Linear 이슈", "태스크 생성"]
    },
    "jira": {
      "command": "npx",
      "args": ["-y", "mcp-jira"],
      "env": { "JIRA_TOKEN": "${JIRA_TOKEN}" },
      "설명": "Jira 이슈 관리",
      "자동트리거": ["Jira 티켓", "스프린트"]
    },
    "puppeteer": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-puppeteer"],
      "설명": "브라우저 자동화, 스크린샷",
      "자동트리거": ["스크린샷", "브라우저 테스트", "웹 스크래핑"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "mcp-playwright"],
      "설명": "E2E 테스트 자동화",
      "자동트리거": ["E2E 테스트", "브라우저 테스트"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-memory"],
      "설명": "대화 컨텍스트 저장",
      "자동트리거": ["기억해", "저장해", "컨텍스트 유지"]
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "mcp-brave-search"],
      "env": { "BRAVE_API_KEY": "${BRAVE_API_KEY}" },
      "설명": "Brave 웹 검색",
      "자동트리거": ["웹 검색", "정보 찾아줘"]
    },
    "tavily": {
      "command": "npx",
      "args": ["-y", "mcp-tavily"],
      "env": { "TAVILY_API_KEY": "${TAVILY_API_KEY}" },
      "설명": "AI 최적화 검색",
      "자동트리거": ["리서치", "검색"]
    },
    "exa": {
      "command": "npx",
      "args": ["-y", "mcp-exa"],
      "env": { "EXA_API_KEY": "${EXA_API_KEY}" },
      "설명": "시맨틱 검색",
      "자동트리거": ["관련 자료", "유사 문서"]
    },
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "mcp-firecrawl"],
      "env": { "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}" },
      "설명": "웹 크롤링/스크래핑",
      "자동트리거": ["크롤링", "데이터 수집"]
    },
    "docker": {
      "command": "npx",
      "args": ["-y", "mcp-docker"],
      "설명": "Docker 컨테이너 관리",
      "자동트리거": ["도커", "컨테이너", "이미지 빌드"]
    },
    "kubernetes": {
      "command": "npx",
      "args": ["-y", "mcp-kubernetes"],
      "설명": "K8s 클러스터 관리",
      "자동트리거": ["쿠버네티스", "k8s", "배포"]
    },
    "vercel": {
      "command": "npx",
      "args": ["-y", "mcp-vercel"],
      "env": { "VERCEL_TOKEN": "${VERCEL_TOKEN}" },
      "설명": "Vercel 배포 관리",
      "자동트리거": ["Vercel 배포", "프리뷰"]
    },
    "netlify": {
      "command": "npx",
      "args": ["-y", "mcp-netlify"],
      "env": { "NETLIFY_TOKEN": "${NETLIFY_TOKEN}" },
      "설명": "Netlify 배포 관리",
      "자동트리거": ["Netlify 배포"]
    },
    "aws": {
      "command": "npx",
      "args": ["-y", "mcp-aws"],
      "설명": "AWS 서비스 관리",
      "자동트리거": ["AWS", "S3", "Lambda"]
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "mcp-stripe"],
      "env": { "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}" },
      "설명": "Stripe 결제 관리",
      "자동트리거": ["결제 연동", "Stripe", "구독"]
    },
    "sendgrid": {
      "command": "npx",
      "args": ["-y", "mcp-sendgrid"],
      "env": { "SENDGRID_API_KEY": "${SENDGRID_API_KEY}" },
      "설명": "이메일 발송",
      "자동트리거": ["이메일 발송", "메일 전송"]
    },
    "openai": {
      "command": "npx",
      "args": ["-y", "mcp-openai"],
      "env": { "OPENAI_API_KEY": "${OPENAI_API_KEY}" },
      "설명": "OpenAI API 호출",
      "자동트리거": ["GPT 호출", "OpenAI"]
    },
    "anthropic": {
      "command": "npx",
      "args": ["-y", "mcp-anthropic"],
      "env": { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" },
      "설명": "Anthropic API 호출",
      "자동트리거": ["Claude API", "Anthropic"]
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "mcp-sentry"],
      "env": { "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}" },
      "설명": "에러 모니터링",
      "자동트리거": ["에러 추적", "Sentry"]
    }
  }
}
```

## 6.2 MCP 설치 명령어
```bash
# 핵심 MCP 일괄 설치
claude mcp add filesystem --scope project
claude mcp add github --scope project
claude mcp add git --scope project
claude mcp add postgres --scope project
claude mcp add supabase --scope project
claude mcp add puppeteer --scope project
claude mcp add memory --scope project
claude mcp add brave-search --scope user
claude mcp add tavily --scope user

# HTTP 기반 MCP 추가
claude mcp add --transport http notion https://mcp.notion.com/mcp
claude mcp add --transport http atlassian https://mcp.atlassian.com/v1
```

---

# ⚡ 7. Skills 시스템 (50+)

## 7.1 자동 수정 스킬
```yaml
@autofix:
  설명: 에러 0개까지 자동 수정
  트리거:
    - "오류 고쳐줘"
    - "에러 수정해줘"
    - "버그 잡아줘"
    - "fix", "debug"
  동작:
    1. npm run build 2>&1 실행
    2. 에러 목록 추출
    3. 각 에러 자동 수정
    4. 수정 후 재빌드
    5. 에러 0까지 반복 (최대 5회)

@fix-type:
  설명: TypeScript 타입 에러 수정
  트리거: ["타입 에러", "TS 에러", "type error"]
  동작:
    1. npx tsc --noEmit 2>&1
    2. 타입 에러 추출
    3. 정확한 타입 추론/수정
    4. 검증

@fix-lint:
  설명: ESLint/Prettier 에러 수정
  트리거: ["린트 에러", "eslint", "prettier"]
  동작:
    1. npm run lint 2>&1
    2. npx eslint --fix .
    3. npx prettier --write .

@fix-build:
  설명: 빌드 에러 수정
  트리거: ["빌드 에러", "build error", "빌드 실패"]
  동작:
    1. npm run build 2>&1
    2. 빌드 로그 분석
    3. 의존성/설정 수정
    4. 재빌드

@fix-runtime:
  설명: 런타임 에러 수정
  트리거: ["런타임 에러", "undefined", "null", "TypeError"]
  동작:
    1. 에러 스택트레이스 분석
    2. 원인 코드 위치 파악
    3. null 체크, 옵셔널 체이닝 추가
    4. 검증

@infinite-loop-detector:
  설명: 무한 루프 탐지 및 해결
  트리거: ["무한루프", "멈춤", "프리징", "CPU 100%"]
  동작:
    1. 루프 구조 스캔
    2. 탈출 조건 검증
    3. useEffect 의존성 검사
    4. 재귀 호출 깊이 체크
    5. 수정 또는 경고
```

## 7.2 최적화 스킬
```yaml
@optimize-all:
  설명: 전체 최적화 실행
  트리거: ["최적화 해줘", "성능 개선", "빠르게"]
  하위스킬:
    - @optimize-perf
    - @optimize-bundle
    - @optimize-db
    - @optimize-api
    - @optimize-cost

@optimize-perf:
  설명: 성능 최적화
  동작:
    - React.memo, useMemo, useCallback 적용
    - 이미지 최적화 (next/image)
    - 코드 스플리팅
    - Lazy loading

@optimize-bundle:
  설명: 번들 크기 최적화
  동작:
    - npx @next/bundle-analyzer
    - 불필요한 의존성 제거
    - Tree shaking 확인
    - Dynamic import 적용

@optimize-db:
  설명: 데이터베이스 최적화
  동작:
    - 인덱스 추가
    - N+1 쿼리 해결
    - 쿼리 캐싱
    - 커넥션 풀링

@optimize-cost:
  설명: 비용 최적화
  동작:
    - API 호출 최소화
    - 캐싱 전략
    - 무료 티어 활용
    - 서버리스 최적화
```

## 7.3 생성 스킬
```yaml
@fullstack:
  설명: 풀스택 앱 자동 생성
  트리거:
    - "앱 만들어줘"
    - "웹앱 생성"
    - "프로젝트 시작"
  동작:
    1. 요구사항 분석
    2. 기술 스택 선택 (Next.js 15, TypeScript, Tailwind)
    3. 프로젝트 구조 생성
    4. DB 스키마 설계
    5. API 라우트 구현
    6. UI 컴포넌트 생성
    7. 인증 시스템 추가
    8. 테스트 작성
    9. 배포 설정

@frontend:
  설명: 프론트엔드 UI 생성
  트리거: ["UI 만들어", "화면 생성", "컴포넌트"]

@backend:
  설명: 백엔드 API 생성
  트리거: ["API 만들어", "백엔드", "서버"]

@database:
  설명: 데이터베이스 설계
  트리거: ["DB 설계", "테이블 만들어", "스키마"]

@auth:
  설명: 인증 시스템 구현
  트리거: ["로그인", "인증", "회원가입"]

@game-dev:
  설명: 게임 개발
  트리거: ["게임 만들어줘", "웹게임", "타워디펜스"]
  동작:
    1. 게임 기획서 생성
    2. 게임 루프 구현
    3. 캐릭터/아이템 시스템 (100+)
    4. 스킬/전투 시스템 (50+)
    5. 밸런스 조정
    6. 사운드 효과
    7. 저장/로드 기능
    8. 리더보드
```

## 7.4 디자인 스킬
```yaml
@premium-design:
  설명: 상용화 수준 디자인
  트리거: ["디자인 해줘", "예쁘게", "이쁘게"]
  동작:
    - 모던 UI 패턴 적용
    - 색상 팔레트 최적화
    - 타이포그래피 설정
    - 그라데이션/그림자 효과
    - 마이크로 인터랙션
    - 일관된 디자인 시스템

@dark-mode:
  설명: 다크모드 구현
  트리거: ["다크모드", "어두운 테마"]

@responsive:
  설명: 반응형 디자인
  트리거: ["반응형", "모바일", "태블릿"]

@animation:
  설명: 애니메이션 추가
  트리거: ["애니메이션", "모션", "움직이게"]

@icon-generator:
  설명: 아이콘 세트 생성
  트리거: ["아이콘 만들어", "파비콘", "로고"]
```

## 7.5 리서치 스킬
```yaml
@deep-research:
  설명: 100+ 사이트 딥 리서치
  트리거: ["정확한 정보", "교차검증", "리서치"]
  동작:
    1. 100+ 사이트 검색 (Brave, Tavily, Exa MCP)
    2. 정보 수집 및 분류
    3. 신뢰도 등급 평가
       A: 정부/공공/학술
       B: 공인 언론/전문기관
       C: 일반 미디어/위키
       D: 블로그/커뮤니티
    4. 3개+ 출처 교차 검증
    5. 검증된 정보만 사용

@cross-validate:
  설명: 교차 검증
  트리거: ["여러 출처", "팩트 체크"]

@source-track:
  설명: 출처 추적
  동작:
    - 모든 데이터에 출처 명시
    - docs/SOURCES.md 자동 생성
    - 라이선스 확인
```

## 7.6 테스트/배포 스킬
```yaml
@test-all:
  설명: 전체 테스트 실행
  트리거: ["테스트 해줘", "테스트 실행"]
  하위스킬:
    - @test-unit (Vitest)
    - @test-integration
    - @test-e2e (Playwright)

@security-scan:
  설명: 보안 스캔
  트리거: ["보안 검토", "취약점"]
  동작:
    - npm audit
    - 의존성 취약점 검사
    - 코드 보안 패턴 검사
    - 환경변수 노출 검사

@deploy:
  설명: 자동 배포
  트리거: ["배포해줘", "deploy", "릴리스"]
  동작:
    1. 빌드 테스트
    2. 환경변수 검증
    3. 배포 플랫폼 선택
    4. 배포 실행
    5. 헬스체크
    6. 롤백 준비

@documentation:
  설명: 자동 문서화
  트리거: ["문서 작성", "README", "문서화"]
```

---

# 🤖 8. 서브에이전트 아키텍처 (15+)

## 8.1 프로젝트 관리 에이전트
```yaml
@project-manager:
  역할: 전체 프로젝트 총괄
  책임:
    - 요구사항 분석
    - 태스크 분해 (BabyAGI 방식)
    - 우선순위 결정
    - 진행 상황 추적
  자동트리거:
    - 프로젝트 시작 시
    - 복잡한 요구사항 시
    - "계획 세워줘"

@architect:
  역할: 시스템 아키텍처 설계
  책임:
    - 기술 스택 선택
    - 시스템 구조 설계
    - 데이터 모델링
    - API 설계
  자동트리거:
    - 새 프로젝트 시작
    - "설계해줘"
```

## 8.2 개발 에이전트
```yaml
@frontend-dev:
  역할: 프론트엔드 개발
  책임:
    - UI 컴포넌트 개발
    - 상태 관리
    - 스타일링
    - 성능 최적화
  자동트리거: ["화면 만들어", "UI 개발", "컴포넌트"]

@backend-dev:
  역할: 백엔드 개발
  책임:
    - API 개발
    - 데이터베이스 로직
    - 인증/인가
    - 비즈니스 로직
  자동트리거: ["API 만들어", "백엔드", "서버 로직"]

@fullstack-dev:
  역할: 풀스택 개발
  책임:
    - 프론트엔드 + 백엔드 통합
    - E2E 기능 구현
  자동트리거: ["앱 만들어", "기능 구현"]

@database-admin:
  역할: 데이터베이스 관리
  책임:
    - 스키마 설계
    - 쿼리 최적화
    - 마이그레이션
  자동트리거: ["DB 설계", "스키마", "쿼리 최적화"]
```

## 8.3 품질 에이전트
```yaml
@qa-engineer:
  역할: 품질 보증
  책임:
    - 테스트 케이스 작성
    - 버그 탐지
    - 회귀 테스트
  자동트리거: ["테스트", "QA", "버그 찾아"]

@code-reviewer:
  역할: 코드 리뷰
  책임:
    - 코드 품질 검사
    - 베스트 프랙티스 적용
    - 보안 취약점 검사
  자동트리거: ["리뷰해줘", "코드 확인"]

@debugger:
  역할: 디버깅 전문가
  책임:
    - 에러 원인 분석
    - 스택트레이스 해석
    - 재현 단계 파악
  자동트리거: ["에러", "버그", "안돼", "문제 해결"]
```

## 8.4 운영 에이전트
```yaml
@devops:
  역할: DevOps 엔지니어
  책임:
    - CI/CD 파이프라인
    - 인프라 관리
    - 배포 자동화
  자동트리거: ["배포", "CI/CD", "파이프라인"]

@security:
  역할: 보안 전문가
  책임:
    - 보안 취약점 스캔
    - 인증/인가 검토
    - 데이터 암호화
  자동트리거: ["보안 검토", "취약점", "security"]

@optimizer:
  역할: 성능/비용 최적화
  책임:
    - 성능 프로파일링
    - 비용 분석
    - 리소스 최적화
  자동트리거: ["최적화", "성능", "비용 절감"]
```

## 8.5 특수 에이전트
```yaml
@researcher:
  역할: 리서치 전문가
  책임:
    - 100+ 사이트 교차검증
    - 정확한 정보 수집
    - 출처 추적
  자동트리거: ["정확한 정보", "교차검증", "리서치"]

@content-creator:
  역할: 콘텐츠 생성
  책임:
    - 상품 설명 작성 (Gemini 활용)
    - 마케팅 문구
    - 다국어 번역
  자동트리거: ["콘텐츠", "상품 설명", "문구 작성"]

@ui-designer:
  역할: UI/UX 디자인
  책임:
    - 디자인 시스템
    - 컬러 팔레트
    - 사용자 경험
  자동트리거: ["디자인", "예쁘게", "UI"]

@game-designer:
  역할: 게임 기획/개발
  책임:
    - 게임 기획
    - 밸런스 설계
    - 레벨 디자인
  자동트리거: ["게임", "밸런스", "레벨"]
```

---

# 🔧 9. 플러그인 시스템 (30+)

## 9.1 프론트엔드 플러그인
```yaml
plugins:
  # UI 프레임워크
  - name: shadcn-ui
    설명: 재사용 가능한 UI 컴포넌트
    자동설치: npx shadcn@latest init -y
    트리거: ["컴포넌트 추가", "shadcn"]

  - name: radix-ui
    설명: 접근성 좋은 프리미티브
    자동설치: npm i @radix-ui/react-*

  - name: framer-motion
    설명: 애니메이션 라이브러리
    자동설치: npm i framer-motion
    트리거: ["애니메이션", "모션"]

  # 상태 관리
  - name: zustand
    설명: 경량 상태 관리
    자동설치: npm i zustand
    트리거: ["상태 관리", "스토어"]

  - name: tanstack-query
    설명: 서버 상태 관리
    자동설치: npm i @tanstack/react-query
    트리거: ["데이터 페칭", "캐싱"]

  # 폼/검증
  - name: react-hook-form
    설명: 폼 관리
    자동설치: npm i react-hook-form

  - name: zod
    설명: 스키마 검증
    자동설치: npm i zod

  # 차트
  - name: recharts
    설명: React 차트
    자동설치: npm i recharts
    트리거: ["차트", "그래프"]
```

## 9.2 백엔드 플러그인
```yaml
plugins:
  # ORM
  - name: prisma
    설명: 타입 안전 ORM
    자동설치: npm i prisma @prisma/client
    트리거: ["DB 연결", "Prisma"]

  - name: drizzle
    설명: 경량 ORM
    자동설치: npm i drizzle-orm

  # 인증
  - name: next-auth
    설명: 인증 라이브러리
    자동설치: npm i next-auth@beta
    트리거: ["로그인", "인증"]

  - name: clerk
    설명: 인증 서비스
    자동설치: npm i @clerk/nextjs

  # 파일/이메일/결제
  - name: uploadthing
    설명: 파일 업로드
    자동설치: npm i uploadthing

  - name: resend
    설명: 이메일 발송
    자동설치: npm i resend

  - name: stripe
    설명: 결제 처리
    자동설치: npm i stripe @stripe/stripe-js
    트리거: ["결제", "Stripe"]
```

## 9.3 개발 도구/AI 플러그인
```yaml
plugins:
  # 테스트
  - name: vitest
    설명: 유닛 테스트
    자동설치: npm i -D vitest

  - name: playwright
    설명: E2E 테스트
    자동설치: npm i -D @playwright/test

  # AI SDK
  - name: ai-sdk
    설명: Vercel AI SDK
    자동설치: npm i ai @ai-sdk/openai @ai-sdk/anthropic
    트리거: ["AI 기능", "챗봇"]

  - name: openai
    설명: OpenAI SDK
    자동설치: npm i openai

  - name: anthropic
    설명: Anthropic SDK
    자동설치: npm i @anthropic-ai/sdk

  - name: google-genai
    설명: Google Gemini SDK
    자동설치: npm i @google/genai
    트리거: ["Gemini"]

  # 모니터링
  - name: sentry
    설명: 에러 추적
    자동설치: npm i @sentry/nextjs
    트리거: ["에러 추적", "Sentry"]
```

---

# 🎯 10. 트리거 규칙 (자연어 → 자동실행)

## 10.1 오류/버그 트리거 (20개)
```yaml
오류_수정_트리거:
  패턴:
    - "오류 고쳐줘", "에러 수정해줘", "버그 잡아줘"
    - "문제 해결해줘", "안 돼", "작동 안 해"
    - "fix", "debug", "빨간 줄 없애줘"
    - "콘솔 에러", "undefined", "TypeError"
    - "import 에러", "빌드 실패", "타입 에러"
    - "린트 에러", "왜 안돼", "고장났어"
  
  자동실행:
    - @autofix, @fix-type, @fix-lint
    - @fix-build, @fix-runtime, @debugger
```

## 10.2 최적화 트리거 (15개)
```yaml
최적화_트리거:
  패턴:
    - "최적화 해줘", "성능 개선", "빠르게 해줘"
    - "느려", "비용 줄여줘", "optimize"
    - "속도 개선", "로딩 빠르게", "번들 줄여"
    - "메모리 줄여", "DB 최적화", "API 최적화"

  자동실행:
    - @optimize-all, @optimize-perf
    - @optimize-bundle, @optimize-db
    - @optimize-api, @optimize-cost
```

## 10.3 생성 트리거 (30개)
```yaml
앱_생성_트리거:
  패턴:
    - "앱 만들어줘", "웹앱 만들어", "프로젝트 시작"
    - "새 프로젝트", "create app", "풀스택"
  자동실행: @project-manager, @architect, @fullstack

프론트엔드_트리거:
  패턴: ["화면 만들어", "UI 만들어", "컴포넌트", "페이지 추가"]
  자동실행: @frontend-dev, @ui-designer

백엔드_트리거:
  패턴: ["API 만들어", "백엔드", "서버 로직", "엔드포인트"]
  자동실행: @backend-dev, @database-admin

게임_트리거:
  패턴: ["게임 만들어", "웹게임", "타워디펜스", "RPG", "퍼즐 게임"]
  자동실행: @game-designer, @fullstack-dev
```

## 10.4 디자인/테스트/배포 트리거
```yaml
디자인_트리거:
  패턴:
    - "디자인 해줘", "예쁘게", "이쁘게", "멋지게"
    - "UI 개선", "스타일링", "다크모드", "반응형"
    - "애니메이션", "모션", "아이콘 만들어"
  자동실행: @premium-design, @ui-designer, @dark-mode, @responsive

테스트_트리거:
  패턴: ["테스트 해줘", "테스트 실행", "test", "QA", "검증"]
  자동실행: @test-all, @qa-engineer

배포_트리거:
  패턴: ["배포해줘", "deploy", "릴리스", "production", "라이브"]
  자동실행: @deploy, @devops

리서치_트리거:
  패턴: ["정확한 정보", "교차검증", "리서치", "조사해줘", "검색해줘"]
  자동실행: @deep-research, @cross-validate, @researcher
```

---

# 🔄 11. 작업별 자동 워크플로우

## 11.1 EPCT 워크플로우 (기본)
```yaml
EPCT_워크플로우:
  설명: 모든 작업의 기본 패턴
  
  E_Expand:
    - 요구사항 분석
    - 숨은 요구사항 발굴
    - 기술적 제약 파악
    - @researcher 호출 (필요시)
  
  P_Plan:
    - 작업 분해 (BabyAGI 방식)
    - 순서 결정
    - 기술 스택 선택
    - @architect 호출
  
  C_Code:
    - 역할별 순차 구현 (MetaGPT 방식)
    - 실제 코드 작성
    - 생략 없이 완성
    - @fullstack-dev 호출
  
  T_Test:
    - 빌드 검증
    - 테스트 실행
    - 품질 검사
    - @qa-engineer 호출
    - 에러 발견 시 → C 단계로 복귀
```

## 11.2 풀스택 앱 워크플로우
```yaml
풀스택_워크플로우:
  트리거: "앱 만들어줘", "웹앱", "프로젝트"
  
  단계:
    1_프로젝트_초기화:
      - npx create-next-app@latest -y --typescript --tailwind --eslint
      - 디렉토리 구조 생성
      - 기본 설정 파일 구성
    
    2_서버실행:
      - npm install
      - npm run dev &
      - curl http://localhost:3000 확인
    
    3_데이터베이스:
      - Prisma 스키마 설계
      - 마이그레이션 실행
      - 시드 데이터 생성
    
    4_인증:
      - NextAuth.js 설정
      - OAuth 프로바이더 연동
    
    5_API:
      - API 라우트 생성
      - 에러 핸들링
      - 타입 정의
    
    6_UI:
      - 레이아웃 구성
      - 페이지 생성
      - 컴포넌트 개발
      - 상용화 수준 스타일링
    
    7_콘텐츠:
      - 실제 데이터 채우기 (상품 50+, 리뷰 100+ 등)
      - Gemini로 현실적 콘텐츠 생성
    
    8_검증:
      - npx tsc --noEmit (타입 에러 0)
      - npm run lint (린트 에러 0)
      - npm run build (빌드 성공)
    
    9_배포:
      - vercel --prod --yes
      - curl https://[배포URL] 확인
```

## 11.3 에러 수정 워크플로우
```yaml
에러수정_워크플로우:
  트리거: "오류 고쳐", "에러", "버그"
  
  단계:
    1_전체_스캔:
      - npx tsc --noEmit 2>&1
      - npm run lint 2>&1
      - npm run build 2>&1
    
    2_에러_수집:
      - 요청한 에러 (1순위)
      - 같은 파일 에러 (2순위)
      - 관련 파일 에러 (3순위)
      - 기타 에러 (4순위)
    
    3_일괄_수정:
      - @fix-type, @fix-lint, @fix-build 호출
      - 하나 수정 후 관련 에러 확인
      - 연쇄 에러 예방
    
    4_재검증:
      - 타입 에러 0 확인
      - 빌드 성공 확인
    
    5_에스컬레이션:
      - 2회 실패 시 전면 재설계
      - 다른 방식으로 재구현
```

## 11.4 게임 개발 워크플로우
```yaml
게임_워크플로우:
  트리거: "게임 만들어", "타워디펜스", "RPG"
  
  단계:
    1_기획:
      - 게임 컨셉 정의
      - 핵심 메카닉 설계
      - 밸런스 초안
    
    2_기반:
      - 게임 루프 구현
      - 렌더링 시스템
      - 입력 처리
    
    3_콘텐츠:
      - 캐릭터 시스템 (100+)
      - 아이템 시스템 (100+)
      - 스킬 시스템 (50+)
      - 맵/레벨 (20+)
    
    4_시스템:
      - 전투 시스템
      - 인벤토리
      - 퀘스트/미션
      - 보상 시스템
    
    5_연출:
      - 사운드 효과
      - BGM
      - 파티클 효과
      - 애니메이션
    
    6_저장:
      - 저장/로드
      - 진행도 관리
      - 리더보드
    
    7_밸런싱:
      - 난이도 조정
      - 수치 밸런스
      - 플레이테스트
```

---

# ✅ 12. 코드 품질 보장 시스템

## 12.1 품질 게이트
```yaml
품질_게이트:
  빌드_검증:
    명령어: npm run build
    조건: 에러 0
    실패시: @autofix 호출
  
  타입_검증:
    명령어: npx tsc --noEmit
    조건: 에러 0
    실패시: @fix-type 호출
  
  린트_검증:
    명령어: npm run lint
    조건: 에러 0
    실패시: @fix-lint 호출
  
  테스트_검증:
    명령어: npm run test
    조건: 모든 테스트 통과
    실패시: 테스트 수정
  
  보안_검증:
    명령어: npm audit
    조건: 심각한 취약점 0
    실패시: 의존성 업데이트
```

## 12.2 완성도 체크리스트
```yaml
완성도_체크:
  코드:
    - [ ] TODO/FIXME 없음
    - [ ] 생략 없음 (... 없음)
    - [ ] any 타입 없음
    - [ ] 타입 에러 0
    - [ ] 린트 에러 0
    - [ ] 빌드 성공
  
  기능:
    - [ ] 모든 기능 구현
    - [ ] 에러 핸들링
    - [ ] 로딩 상태
    - [ ] 빈 상태 처리
    - [ ] 에러 상태 처리
  
  UI/UX:
    - [ ] 반응형 디자인
    - [ ] 다크모드
    - [ ] 접근성 (a11y)
    - [ ] 로딩 스피너
    - [ ] 에러 메시지
  
  콘텐츠:
    - [ ] 실제 데이터 (목업 아님)
    - [ ] 최소 수량 충족
    - [ ] 현실적인 내용
  
  문서:
    - [ ] README.md
    - [ ] 환경변수 설명
    - [ ] 설치 가이드
```

---

# 🔧 13. 실제 실행 명령어

## 풀스택 생성 시 Claude가 실행하는 명령어
```bash
# 1. 프로젝트 생성
npx create-next-app@latest [name] --typescript --tailwind --app --src-dir

# 2. 의존성 설치
cd [name]
npm install firebase @google/generative-ai zustand zod react-hook-form @tanstack/react-query lucide-react
# 또는 Supabase 사용 시
npm install @supabase/supabase-js

# 3. shadcn/ui 초기화
npx shadcn@latest init -y
npx shadcn@latest add button card input form table dialog

# 4. 서버 실행 (백그라운드)
npm run dev &
sleep 3

# 5. 서버 확인
curl -s http://localhost:3000 | head -20

# 6. 구현 중 확인 (기능 완료시마다)
curl -s http://localhost:3000/api/health

# 7. 완료 후 검증
npx tsc --noEmit
npm run lint
npm run build

# 8. 배포
vercel --prod --yes
```

## 오류 수정 시 Claude가 실행하는 명령어
```bash
# 1. 전체 스캔
echo "=== TypeScript 에러 ===" && npx tsc --noEmit 2>&1 | head -50
echo "=== ESLint 에러 ===" && npm run lint 2>&1 | grep "error" | head -20
echo "=== 빌드 테스트 ===" && npm run build 2>&1 | tail -20

# 2. 수정 후 재검증
npx tsc --noEmit && echo "✅ 타입 OK" || echo "❌ 타입 에러"
npm run build && echo "✅ 빌드 OK" || echo "❌ 빌드 에러"

# 3. 서버 테스트
npm run dev &
sleep 3
curl http://localhost:3000 && echo "✅ 서버 OK"
```

---

# 📋 14. 체크리스트

## 풀스택 완료 전 체크리스트
```
□ 모든 페이지 구현 완료?
□ 모든 API 작동?
□ 콘텐츠 최소 수량 충족? (상품50+, 리뷰100+ 등)
□ 로딩/에러/빈상태 UI 있음?
□ 반응형 적용?
□ 다크모드 지원?
□ npx tsc --noEmit → 0 에러?
□ npm run lint → 0 에러?
□ npm run build → 성공?
□ curl localhost:3000 → 200 OK?
```

## 오류 수정 완료 전 체크리스트
```
□ 요청한 오류 수정?
□ 전체 스캔으로 추가 오류 확인?
□ 추가 발견 오류도 모두 수정?
□ npx tsc --noEmit → 0 에러?
□ npm run build → 성공?
□ 2회 실패한 오류 있으면 재설계?
```

---

# 🚀 15. 배포 및 검증 파이프라인

## 15.1 배포 전 체크
```yaml
배포전_검증:
  1_빌드:
    - npm run build
    - 빌드 결과물 확인
    - 번들 크기 확인
  
  2_테스트:
    - npm run test
    - E2E 테스트
  
  3_보안:
    - npm audit
    - 환경변수 확인
    - API 키 노출 검사
  
  4_환경변수:
    - 모든 필수 변수 설정
    - 프로덕션 값 확인
```

## 15.2 배포 플랫폼
```yaml
배포_플랫폼:
  Vercel:
    명령어: vercel deploy --prod
    장점: Next.js 최적화, 자동 HTTPS
    적합: Next.js 프로젝트
  
  Netlify:
    명령어: netlify deploy --prod
    장점: 간편한 설정, 폼 처리
    적합: 정적 사이트
  
  Railway:
    명령어: railway up
    장점: DB 포함, 간편한 배포
    적합: 풀스택 앱
```

## 15.3 배포 후 검증
```yaml
배포후_검증:
  1_헬스체크:
    - curl https://[배포URL]
    - API 엔드포인트 테스트
    - 응답 시간 확인
  
  2_기능검증:
    - 주요 기능 테스트
    - 인증 플로우
  
  3_모니터링:
    - Sentry 에러 확인
    - 로그 확인
```

---

# 🔑 16. 필수 API 키 목록

## 16.1 필수 API 키
```yaml
필수_API_키:

  # AI/LLM
  ANTHROPIC_API_KEY:
    용도: Claude API
    발급: https://console.anthropic.com/
  
  OPENAI_API_KEY:
    용도: GPT API
    발급: https://platform.openai.com/
  
  GEMINI_API_KEY:
    용도: Gemini API (콘텐츠 생성용)
    발급: https://aistudio.google.com/
    가격: 무료 티어 있음

  # 데이터베이스
  DATABASE_URL:
    용도: PostgreSQL 연결
    발급: Supabase, Neon, Railway 등
  
  SUPABASE_URL / SUPABASE_KEY:
    용도: Supabase BaaS
    발급: https://supabase.com/
    가격: 무료 티어 있음

  # Firebase (선택)
  NEXT_PUBLIC_FIREBASE_API_KEY:
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
  NEXT_PUBLIC_FIREBASE_APP_ID:

  # 인증
  NEXTAUTH_SECRET:
    용도: NextAuth 암호화
    발급: openssl rand -base64 32
  
  NEXTAUTH_URL:
    용도: 앱 URL
    예시: http://localhost:3000

  # GitHub
  GITHUB_TOKEN:
    용도: GitHub API
    발급: https://github.com/settings/tokens
    권한: repo, workflow

  # 검색
  BRAVE_API_KEY:
    용도: Brave 검색
    발급: https://brave.com/search/api/
  
  TAVILY_API_KEY:
    용도: AI 검색
    발급: https://tavily.com/

  # 결제 (선택)
  STRIPE_SECRET_KEY:
    용도: 결제 처리
    발급: https://dashboard.stripe.com/

  # 이메일 (선택)
  RESEND_API_KEY:
    용도: 이메일 발송
    발급: https://resend.com/

  # 모니터링 (선택)
  SENTRY_AUTH_TOKEN:
    용도: 에러 추적
    발급: https://sentry.io/

  # 배포
  VERCEL_TOKEN:
    용도: Vercel 배포
    발급: https://vercel.com/account/tokens
```

## 16.2 .env.example 템플릿
```bash
# .env.example
# AI/LLM
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...

# Database (택1)
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJ...

# Firebase (선택)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Search
BRAVE_API_KEY=...
TAVILY_API_KEY=tvly-...

# Payment (선택)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Email (선택)
RESEND_API_KEY=re_...

# Monitoring (선택)
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_DSN=https://...@sentry.io/...

# Deploy
VERCEL_TOKEN=...
```

---

# 📌 17. 실제 작동 방식 설명

## 17.1 CLAUDE.md의 실제 역할

```yaml
CLAUDE.md는:
  ✅ Claude Code가 프로젝트 루트에서 읽는 "지침서"
  ✅ Claude가 작업 시 참조하는 "규칙"
  ✅ 일관된 작업 방식을 유도하는 "가이드"
  ✅ 자연어 트리거로 스킬/서브에이전트 자동 호출

CLAUDE.md는 아님:
  ❌ 자동 실행되는 스크립트
  ❌ 프로그래밍된 자동화 시스템
  ❌ 100% 보장되는 실행 코드
```

## 17.2 실제로 작동하게 하는 방법

### 1. Claude Code에 직접 지시
```bash
# 터미널에서 Claude Code 실행 시
claude "쇼핑몰 만들어줘. CLAUDE.md 규칙 따라서."

# 또는 대화 중
"CLAUDE.md 규칙대로 전체 스캔하고 모든 오류 수정해줘"
```

### 2. 프롬프트에 명시
```
"풀스택으로 만들어줘. 
- 서버 실행하면서 확인하고
- 콘텐츠 50개 이상 채우고
- 빌드 테스트 후 완료해줘"
```

### 3. Claude Code가 이 파일을 읽으면
```
Claude는 이 규칙들을 "따라야 할 지침"으로 인식
→ 풀스택 요청 시 서버 실행하며 개발
→ 오류 수정 시 전체 스캔
→ 2회 실패 시 재설계 시도
→ 콘솔 에러 상세 출력
→ 자연어 트리거로 알맞은 스킬/서브에이전트 호출
```

## 17.3 보장되는 것 vs 노력하는 것

| 항목 | 보장/노력 | 설명 |
|-----|---------|------|
| 서버 실행하며 개발 | ✅ 높음 | bash 명령 실행 가능 |
| 전체 스캔 후 수정 | ✅ 높음 | 명확한 명령어 |
| 콘솔 에러 상세 출력 | ✅ 높음 | 코드 템플릿 제공 |
| 자연어 → 스킬 호출 | ✅ 높음 | 명확한 트리거 패턴 |
| 2회 실패 시 재설계 | ⚠️ 중간 | Claude 판단 필요 |
| 콘텐츠 자동 채움 | ⚠️ 중간 | 컨텍스트 길이 제한 |
| AI 에이전트 장점 적용 | ⚠️ 중간 | 개념적 가이드 |
| MCP 서버 연동 | ⚠️ 중간 | 설정 필요 |

## 17.4 가장 효과적인 프롬프트

```bash
# 풀스택 생성
"CLAUDE.md 규칙대로 쇼핑몰 풀스택 만들어줘.
 npm run dev 실행하면서 확인하고,
 상품 50개, 리뷰 100개 채우고,
 npm run build 성공 확인 후 완료해줘."

# 오류 수정
"CLAUDE.md대로 전체 스캔 (tsc, lint, build) 하고
 요청한 오류 포함 모든 오류 수정해줘.
 2번 실패하면 다른 방법으로 재설계해."

# 콘텐츠 추가
"상품 30개 더 추가해줘.
 실제 데이터처럼 현실적으로,
 Gemini로 설명 생성해서."

# 게임 개발
"CLAUDE.md대로 타워디펜스 게임 만들어줘.
 타워 30종, 몬스터 50종, 스킬 20종,
 밸런스 시스템까지 완전히 구현해줘."

# 리서치
"정확한 정보로 초등 수학 교육 앱 만들어줘.
 100개 이상 사이트 교차검증해서
 정확한 교육 내용으로."
```

---

# 📊 완료 보고서 형식

```
═══════════════════════════════════════════════════════════════
                    🎉 작업 완료 보고서
═══════════════════════════════════════════════════════════════

📋 프로젝트: [프로젝트명]
📅 완료일: [날짜]

✅ 빌드 상태
├─ npm run build: ✅ 성공
├─ TypeScript: ✅ 에러 0
├─ ESLint: ✅ 에러 0
└─ 테스트: ✅ 통과

🔍 품질 검사
├─ TODO/FIXME: 0개
├─ any 타입: 0개
├─ 미완성 코드: 0개
└─ 보안 취약점: 0개

📁 생성된 파일
├─ 컴포넌트: XX개
├─ 페이지: XX개
├─ API 라우트: XX개
└─ 유틸리티: XX개

📊 콘텐츠
├─ 상품: 50개+
├─ 리뷰: 100개+
└─ (또는 해당 앱 콘텐츠)

🎨 디자인
├─ 반응형: ✅
├─ 다크모드: ✅
├─ 접근성: ✅
└─ 애니메이션: ✅

🚀 실행 방법
├─ 개발: npm run dev
├─ 빌드: npm run build
└─ 배포: vercel deploy --prod

🔑 필요한 API 키
├─ GEMINI_API_KEY
├─ DATABASE_URL (또는 SUPABASE_URL)
└─ [기타 필요한 키]

🌐 배포 URL: https://[project].vercel.app

═══════════════════════════════════════════════════════════════
```

---

# 📌 사용 예시

```bash
# 1. 프로젝트 루트에 CLAUDE.md 배치
cp CLAUDE.md ./my-project/CLAUDE.md

# 2. Claude Code 실행
cd my-project
claude

# 3. 명확하게 요청
"CLAUDE.md 규칙대로 쇼핑몰 만들어줘.
 서버 실행하면서 확인하고, 
 상품 50개 이상 채우고,
 빌드 성공 확인 후 알려줘."

# 4. 자연어로 스킬 호출
"오류 고쳐줘"           → @autofix 자동 실행
"최적화 해줘"           → @optimize-all 자동 실행
"디자인 해줘"           → @premium-design 자동 실행
"테스트 해줘"           → @test-all 자동 실행
"배포해줘"              → @deploy 자동 실행
"정확한 정보로"         → @deep-research 자동 실행
```

---

# 📌 버전 정보

```yaml
version: "35.0.0"
created: "2026-01-08"
기반: "v32.1 + v34.0 통합"
agents_integrated: 110+
mcp_servers: 28
skills: 50+
sub_agents: 15
plugins: 30+
trigger_patterns: 200+
workflows: 10+
```

---

> **⚠️ 이 파일을 프로젝트 루트에 `CLAUDE.md`로 저장하세요.**
> Claude Code가 자동으로 읽고 모든 규칙을 적용합니다.
> "CLAUDE.md 규칙대로" 명시적으로 요청하면 더 확실하게 적용됩니다.
