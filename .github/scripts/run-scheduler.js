const admin = require('firebase-admin');

// Firebase Admin 초기화
const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();

// 현재 시간 정보
const now = new Date();
const hour = now.getUTCHours() + 9; // KST (UTC+9)
const minute = now.getUTCMinutes();
const dayOfWeek = now.getDay(); // 0=일요일, 1=월요일, ..., 5=금요일

console.log(`현재 시간: ${hour}시 ${minute}분, 요일: ${dayOfWeek}`);

// 스케줄러 함수들을 여기서 직접 실행
async function runScheduledTasks() {
  const functions = require('../../functions/index');

  try {
    // 매일 자정 - 일일 작업 리셋
    if (hour === 0 && minute < 10) {
      console.log('🔄 일일 작업 리셋 실행...');
      await functions.resetDailyTasksManual();
    }

    // 매주 월요일 8:30 - 급여 지급
    if (dayOfWeek === 1 && hour === 8 && minute >= 30 && minute < 40) {
      console.log('💰 주급 지급 실행...');
      await functions.payWeeklySalariesManual();
    }

    // 매주 금요일 8:30 - 임대료 징수
    if (dayOfWeek === 5 && hour === 8 && minute >= 30 && minute < 40) {
      console.log('🏠 임대료 징수 실행...');
      await functions.collectWeeklyRentManual();
    }

    // 매일 아침 8시 - 사회안전망
    if (hour === 8 && minute < 10) {
      console.log('🛡️ 사회안전망 제공 실행...');
      await functions.provideSocialSafetyNetManual();
    }

    // 시장 개장 - 평일 8시
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 8 && minute < 10) {
      console.log('🔓 시장 개장 실행...');
      await functions.openMarketManual();
    }

    // 시장 폐장 - 평일 15시
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour === 15 && minute < 10) {
      console.log('🔒 시장 폐장 실행...');
      await functions.closeMarketManual();
    }

    // 주식 시장 업데이트 - 5분마다 (평일 8-15시)
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 8 && hour < 15 && minute % 5 === 0) {
      console.log('📈 주식 시장 업데이트 실행...');
      await functions.updateCentralStockMarketManual();
      await functions.autoManageStocksManual();
      await functions.cleanupWorthlessStocksManual();
    }

    // 뉴스 생성 - 3분마다 (평일 8-15시)
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 8 && hour < 15 && minute % 3 === 0) {
      console.log('📰 뉴스 생성 실행...');
      await functions.createCentralMarketNewsManual();
    }

    // 뉴스 정리 - 5분마다
    if (minute % 5 === 0) {
      console.log('🧹 뉴스 정리 실행...');
      await functions.cleanupExpiredCentralNewsManual();
      await functions.syncCentralNewsToClassesManual();
    }

    // 뉴스 정리 (클래스) - 10분마다
    if (minute % 10 === 0) {
      console.log('🧹 클래스 뉴스 정리 실행...');
      await functions.cleanupExpiredClassNewsManual();
    }

    // 통계 집계 - 10분마다
    if (minute % 10 === 0) {
      console.log('📊 통계 집계 실행...');
      await functions.aggregateActivityStatsManual();
      await functions.updateClassStatsManual();
      await functions.updatePortfolioSummaryManual();
      await functions.aggregateActivityLogsManual();
    }

    console.log('✅ 모든 스케줄 작업 완료');
  } catch (error) {
    console.error('❌ 스케줄 작업 실행 중 오류:', error);
    process.exit(1);
  }
}

runScheduledTasks();
