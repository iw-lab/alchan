# GitHub Actions 스케줄러 설정 가이드

## 1단계: Firebase Service Account 키 생성

1. Firebase Console 접속: https://console.firebase.google.com/
2. 프로젝트 선택
3. 좌측 상단 톱니바퀴 ⚙️ → `프로젝트 설정`
4. `서비스 계정` 탭 클릭
5. `새 비공개 키 생성` 클릭
6. JSON 파일 다운로드 (절대 GitHub에 업로드하지 마세요!)

## 2단계: GitHub에 코드 업로드

```bash
# Git 초기화 (이미 되어있으면 생략)
git init

# 모든 파일 추가
git add .

# 커밋
git commit -m "Initial commit with GitHub Actions scheduler"

# GitHub 저장소 연결 (YOUR_USERNAME과 REPO_NAME을 실제 값으로 변경)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 메인 브랜치로 푸시
git branch -M main
git push -u origin main
```

## 3단계: GitHub Secrets 설정

1. GitHub 저장소 페이지 이동
2. `Settings` → `Secrets and variables` → `Actions` 클릭
3. `New repository secret` 클릭

### 추가할 Secrets:

#### Secret 1: `FIREBASE_SERVICE_ACCOUNT`
- Name: `FIREBASE_SERVICE_ACCOUNT`
- Secret: 1단계에서 다운로드한 JSON 파일의 **전체 내용** 복사/붙여넣기

#### Secret 2: `FIREBASE_PROJECT_ID`
- Name: `FIREBASE_PROJECT_ID`
- Secret: Firebase 프로젝트 ID (예: `my-project-12345`)

## 4단계: GitHub Actions 테스트

1. GitHub 저장소 → `Actions` 탭
2. `Scheduled Tasks` 워크플로우 확인
3. `Run workflow` → `Run workflow` 클릭 (수동 실행)
4. 로그 확인하여 정상 작동 확인

## 5단계: Cloud Scheduler 비활성화

GitHub Actions가 정상 작동하는 것을 확인한 후:

```bash
# functions/index.js에서 onSchedule 함수들 주석처리 또는 삭제
# 그 후 배포
cd functions
npm run deploy
```

## 완료! 🎉

이제 Cloud Scheduler 비용 없이 GitHub Actions로 스케줄 작업이 실행됩니다!

### 스케줄 작업 시간:
- 주식 시장 업데이트: 5분마다 (평일 8-15시)
- 뉴스 생성: 3분마다 (평일 8-15시)
- 통계 집계: 10분마다
- 일일 작업 리셋: 매일 자정
- 급여 지급: 매주 월요일 8:30
- 임대료 징수: 매주 금요일 8:30
- 사회안전망: 매일 8:00
- 시장 개장/폐장: 평일 8:00/15:00

### 비용: $0 (완전 무료!)
