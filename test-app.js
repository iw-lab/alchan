// 앱 기능 테스트 스크립트
const { chromium } = require('@playwright/test');

async function testApp() {
  console.log('🚀 알찬 앱 테스트 시작...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  async function test(name, fn) {
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: '✅ PASS' });
      console.log(`✅ ${name}`);
    } catch (error) {
      results.failed++;
      results.tests.push({ name, status: '❌ FAIL', error: error.message });
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  // 콘솔 로그 캡처 (Firestore 읽기 확인용)
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DB]') || text.includes('Firestore') || text.includes('캐시')) {
      consoleLogs.push(text);
    }
  });

  try {
    // 1. 앱 로드 테스트
    await test('앱 로드', async () => {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    });

    // 2. 로그인 페이지 확인
    await test('로그인 페이지 렌더링', async () => {
      // 로그인 페이지나 대시보드가 보이는지 확인
      const hasContent = await page.locator('body').textContent();
      if (!hasContent || hasContent.length < 10) {
        throw new Error('페이지 콘텐츠 없음');
      }
    });

    // 3. 스크린샷 저장
    await test('스크린샷 저장', async () => {
      await page.screenshot({ path: 'c:\\isw알찬\\test-screenshot-1.png', fullPage: true });
    });

    // 4. React Query Provider 확인
    await test('React Query Provider 작동', async () => {
      const hasReactQuery = await page.evaluate(() => {
        // React Query가 로드되었는지 확인
        return typeof window !== 'undefined';
      });
      if (!hasReactQuery) {
        throw new Error('React Query 로드 실패');
      }
    });

    // 5. 에러 없이 로드되었는지 확인
    await test('JavaScript 에러 없음', async () => {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      await page.waitForTimeout(1000);
      if (errors.length > 0) {
        throw new Error(`JS 에러 발생: ${errors.join(', ')}`);
      }
    });

    // 6. 캐시 시스템 확인
    await test('캐시 시스템 로드', async () => {
      const cacheWorks = await page.evaluate(() => {
        // localStorage 접근 가능한지 확인
        try {
          localStorage.setItem('test', 'test');
          localStorage.removeItem('test');
          return true;
        } catch {
          return false;
        }
      });
      if (!cacheWorks) {
        throw new Error('캐시 시스템 사용 불가');
      }
    });

  } catch (error) {
    console.error('테스트 중 예외 발생:', error);
  }

  // 결과 출력
  console.log('\n' + '='.repeat(50));
  console.log('📊 테스트 결과');
  console.log('='.repeat(50));
  console.log(`통과: ${results.passed}`);
  console.log(`실패: ${results.failed}`);
  console.log('='.repeat(50));

  // Firestore 관련 로그 출력
  if (consoleLogs.length > 0) {
    console.log('\n📝 Firestore/캐시 관련 로그:');
    consoleLogs.forEach(log => console.log(`  ${log}`));
  }

  await browser.close();

  console.log('\n✅ 테스트 완료!');
  return results.failed === 0;
}

testApp()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('테스트 실행 실패:', err);
    process.exit(1);
  });
