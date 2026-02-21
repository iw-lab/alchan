import { chromium } from '@playwright/test';

const EMAIL = '[REDACTED_EMAIL]';
const PASSWORD = '[REDACTED_PASS]';
const CRON_URL = 'https://economiceventscheduler-j7kazbsvxq-du.a.run.app';
const CRON_TITLE = '알찬 경제이벤트 스케줄러';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 로그인
    console.log('1. 로그인...');
    await page.goto('https://console.cron-job.org/login', { waitUntil: 'networkidle' });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });
    console.log('   로그인 성공:', page.url());

    // 2. 크론잡 생성 페이지
    console.log('2. Create cronjob 페이지 이동...');
    await page.goto('https://console.cron-job.org/jobs/create', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 3. 제목 입력 (첫 번째 텍스트 입력)
    const allTextInputs = await page.$$('input[type="text"]');
    console.log('   텍스트 입력 수:', allTextInputs.length);

    // 첫 번째 = 제목
    await allTextInputs[0].click({ clickCount: 3 });
    await allTextInputs[0].fill(CRON_TITLE);
    console.log('   제목 입력:', CRON_TITLE);

    // 두 번째 = URL (기본값 "http://")
    await allTextInputs[1].click({ clickCount: 3 });
    await allTextInputs[1].fill(CRON_URL);
    console.log('   URL 입력:', CRON_URL);

    await page.screenshot({ path: 'cron-04-title-url.png' });

    // 4. 스케줄 - "custom" 라디오 선택 후 "0 * * * *" 입력 (매시간 정각)
    console.log('3. 스케줄 설정 (매 시간 정각)...');
    await page.click('input[type="radio"][value="custom"]');
    await page.waitForTimeout(500);

    // custom cron 입력 필드 (value="*/15 * * * *")
    const cronInput = await page.$('input[value="*/15 * * * *"]');
    if (cronInput) {
      await cronInput.click({ clickCount: 3 });
      await cronInput.fill('0 * * * *');
      console.log('   cron 표현식: 0 * * * * (매 시간 정각)');
    } else {
      // 마지막 텍스트 입력에 cron 표현식
      const lastInput = allTextInputs[allTextInputs.length - 1];
      await lastInput.click({ clickCount: 3 });
      await lastInput.fill('0 * * * *');
      console.log('   cron fallback 입력');
    }

    await page.screenshot({ path: 'cron-05-schedule.png' });

    // 5. 저장 버튼 클릭 (CREATE 또는 SAVE)
    console.log('4. 저장...');
    const saveBtn = await page.$('button:has-text("CREATE"), button:has-text("SAVE"), button:has-text("Create"), button:has-text("Save")');
    if (saveBtn) {
      const btnText = await saveBtn.textContent();
      console.log('   버튼:', btnText?.trim());
      await saveBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 20000 });
    } else {
      // 모든 버튼 확인
      const allBtns = await page.$$eval('button', els => els.map(e => e.textContent?.trim()));
      console.log('   버튼 목록:', allBtns);
    }

    await page.screenshot({ path: 'cron-06-result.png' });
    console.log('최종 URL:', page.url());

    if (!page.url().includes('create')) {
      console.log('✅ 크론잡 생성 성공!');
    } else {
      console.log('⚠️  페이지가 변경되지 않음 - 스크린샷 확인 필요');
    }

  } catch (err) {
    console.error('에러:', err.message);
    await page.screenshot({ path: 'cron-error.png' });
  } finally {
    await browser.close();
  }
})();
