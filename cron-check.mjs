import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://console.cron-job.org/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: 'cron-01-login.png' });
  console.log('URL:', page.url());

  const inputs = await page.$$eval('input', els => els.map(e => ({
    type: e.type, name: e.name, id: e.id, placeholder: e.placeholder
  })));
  console.log('입력필드:', JSON.stringify(inputs, null, 2));

  const buttons = await page.$$eval('button', els => els.map(e => ({
    type: e.type, text: e.textContent?.trim().substring(0, 50)
  })));
  console.log('버튼:', JSON.stringify(buttons, null, 2));

  await browser.close();
})();
