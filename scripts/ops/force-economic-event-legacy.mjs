// ⚠️ 운영 스크립트 — 실제 프로덕션 Firestore를 변경한다. 테스트 아니다.
//    2026-08-03 이동: 파일명이 test-* 라 자동 테스트로 오인·실행될 위험이 있었다.
/**
 * 경제 이벤트 강제 테스트 스크립트
 * Firebase Admin SDK를 사용해 방학 모드 임시 비활성화 후 이벤트 실행
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.chdir('./functions');
const admin = require('firebase-admin');
const { runEconomicEventsForAllClasses, triggerClassEconomicEvent } = require('./economicEvents');

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
    console.log(`   학급 목록: ${classCodes.join(', ')}\n`);

    if (classCodes.length === 0) {
      console.log('⚠️  등록된 학급이 없습니다.');
    } else {
      // 3. 각 학급에 경제 이벤트 강제 실행
      for (const classCode of classCodes) {
        console.log(`3. [${classCode}] 경제 이벤트 실행...`);
        try {
          const result = await triggerClassEconomicEvent(classCode, 'FORCE');
          if (result) {
            console.log(`   ✅ 이벤트: "${result.event?.title}"`);
            console.log(`   타입: ${result.event?.type}`);
            console.log(`   결과:`, JSON.stringify(result.result, null, 6));
          } else {
            console.log(`   ⚠️  이벤트 실행 안됨 (활성화된 이벤트 없음?)`);
          }
        } catch (err) {
          console.error(`   ❌ 오류:`, err.message);
        }
        console.log('');
      }
    }

    // 4. 방학 모드 다시 복원 (원래대로)
    console.log('4. 방학 모드 복원 (ON)...');
    await db.doc('Settings/scheduler').set({ vacationMode: true }, { merge: true });
    console.log('   ✅ 방학 모드 ON\n');

    console.log('✅ 테스트 완료! Firestore > activeEconomicEvent 에서 결과 확인 가능');

  } catch (err) {
    console.error('❌ 에러:', err.message);
    // 에러 시에도 방학 모드 복원
    await db.doc('Settings/scheduler').set({ vacationMode: true }, { merge: true }).catch(() => {});
  }

  process.exit(0);
})();
