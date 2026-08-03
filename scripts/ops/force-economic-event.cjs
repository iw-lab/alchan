// ⚠️ 운영 스크립트 — 실제 프로덕션 Firestore를 변경한다. 테스트 아니다.
//    2026-08-03 이동: 파일명이 test-* 라 자동 테스트로 오인·실행될 위험이 있었다.
/**
 * 경제 이벤트 강제 테스트 스크립트 (CommonJS)
 */
const admin = require('firebase-admin');
const { triggerClassEconomicEvent } = require('./economicEvents');

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

(async () => {
  console.log('🔥 경제 이벤트 강제 테스트 시작...\n');

  try {
    // 1. 방학 모드 임시 비활성화
    console.log('1. 방학 모드 임시 비활성화...');
    await db.doc('Settings/scheduler').set({ vacationMode: false }, { merge: true });
    console.log('   ✅ 방학 모드 OFF\n');

    // 2. 모든 학급 조회
    console.log('2. 활성 학급 조회...');
    const classesSnap = await db.collection('classes').get();
    const classCodes = classesSnap.docs.map(d => d.id);
    console.log(`   학급 수: ${classCodes.length}`);
    if (classCodes.length > 0) {
      console.log(`   학급 목록: ${classCodes.join(', ')}\n`);
    }

    if (classCodes.length === 0) {
      console.log('⚠️  등록된 학급이 없습니다.');
    } else {
      // 3. 첫 번째 학급에 경제 이벤트 강제 실행
      const testClassCode = classCodes[0];
      console.log(`3. [${testClassCode}] 경제 이벤트 강제 실행 (lastEventDate 무시)...`);

      // lastEventDate 초기화 (강제 실행용)
      await db.collection('economicEventSettings').doc(testClassCode).set(
        { lastEventDate: null },
        { merge: true }
      );

      const result = await triggerClassEconomicEvent(testClassCode, 'FORCE');
      if (result) {
        console.log(`\n✅ 이벤트 실행 완료!`);
        console.log(`   제목: "${result.event?.title}"`);
        console.log(`   이모지: ${result.event?.emoji || ''}`);
        console.log(`   타입: ${result.event?.type}`);
        console.log(`   설명: ${result.event?.description}`);
        console.log(`   결과:`, JSON.stringify(result.result, null, 4));
      } else {
        console.log(`   ⚠️  이벤트 실행 안됨 (활성화된 이벤트 없음?)`);
      }
    }

  } catch (err) {
    console.error('\n❌ 에러:', err.message);
    console.error(err.stack);
  } finally {
    // 방학 모드 복원
    console.log('\n4. 방학 모드 복원 (ON)...');
    await db.doc('Settings/scheduler').set({ vacationMode: true }, { merge: true }).catch(() => {});
    console.log('   ✅ 방학 모드 ON');
    process.exit(0);
  }
})();
