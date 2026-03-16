import { chromium } from '@playwright/test';

// 자격증명은 환경변수에서 읽기 (하드코딩 금지)
// 사용법: CRON_EMAIL=... CRON_PASSWORD=... SCHEDULER_AUTH_TOKEN=... node cron-verify.mjs
const EMAIL = process.env.CRON_EMAIL || '';
const PASSWORD = process.env.CRON_PASSWORD || '';
const SCHEDULER_TOKEN = process.env.SCHEDULER_AUTH_TOKEN || '';
const CRON_URL = `https://economiceventscheduler-j7kazbsvxq-du.a.run.app?token=${SCHEDULER_TOKEN}`;
const CRON_TITLE = '알찬 경제이벤트 스케줄러';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 로그인
    console.log('1. 로그인...');
    await page.goto('https://console.cron-job.org/login', { waitUntil: 'networkidle' });
    if (!EMAIL || !PASSWORD) throw new Error('CRON_EMAIL / CRON_PASSWORD 환경변수가 필요합니다.');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });
    console.log('   로그인 성공:', page.url());

    // 2. 잡 목록 확인
    console.log('2. 잡 목록 확인...');
    await page.goto('https://console.cron-job.org/jobs', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'cron-verify-list.png' });

    const pageText = await page.textContent('body');
    console.log('   페이지 텍스트 (일부):', pageText?.substring(0, 500));

    if (pageText?.includes(CRON_TITLE)) {
      console.log('✅ 크론잡 발견! 이미 생성되어 있습니다.');
    } else {
      console.log('❌ 크론잡 없음. 새로 생성합니다...');

      // 3. 새로 생성
      await page.goto('https://console.cron-job.org/jobs/create', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      const allTextInputs = await page.$$('input[type="text"]');
      console.log('   텍스트 입력 수:', allTextInputs.length);

      await allTextInputs[0].click({ clickCount: 3 });
      await allTextInputs[0].fill(CRON_TITLE);

      await allTextInputs[1].click({ clickCount: 3 });
      await allTextInputs[1].fill(CRON_URL);

      await page.click('input[type="radio"][value="custom"]');
      await page.waitForTimeout(500);

      const cronInput = await page.$('input[value="*/15 * * * *"]');
      if (cronInput) {
        await cronInput.click({ clickCount: 3 });
        await cronInput.fill('0 * * * *');
      } else {
        const allInputs = await page.$$('input[type="text"]');
        const lastInput = allInputs[allInputs.length - 1];
        await lastInput.click({ clickCount: 3 });
        await lastInput.fill('0 * * * *');
      }

      await page.screenshot({ path: 'cron-verify-before-save.png' });

      // CREATE 버튼 클릭 후 응답 대기
      const [response] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('api') && resp.status() === 200, { timeout: 10000 }).catch(() => null),
        page.click('button:has-text("CREATE"), button:has-text("SAVE"), button:has-text("Create"), button:has-text("Save")'),
      ]);

      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'cron-verify-after-save.png' });

      // 목록으로 이동해서 확인
      await page.goto('https://console.cron-job.org/jobs', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'cron-verify-final-list.png' });

      const finalText = await page.textContent('body');
      if (finalText?.includes(CRON_TITLE)) {
        console.log('✅ 크론잡 생성 성공!');
      } else {
        console.log('⚠️  생성 실패 또는 확인 불가 - 스크린샷 확인 필요');
      }
    }

  } catch (err) {
    console.error('에러:', err.message);
    await page.screenshot({ path: 'cron-verify-error.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
