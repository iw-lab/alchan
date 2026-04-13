// UI review script - Playwright 로 주요 페이지 자동 스크린샷
// 사용: node scripts/ui-review.mjs
// 결과: /tmp/alchan-ui-review/*.png

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = '/tmp/alchan-ui-review';

const PAGES = [
  { name: '01-login', path: '/login' },
  { name: '02-privacy', path: '/privacy' },
  { name: '03-consent', path: '/consent-form' },
  { name: '04-dashboard', path: '/' },
  { name: '05-banking', path: '/banking' },
  { name: '06-stock', path: '/stock' },
  { name: '07-real-estate', path: '/real-estate' },
  { name: '08-store', path: '/store' },
  { name: '09-omok', path: '/learning-games/omok' },
  { name: '10-community', path: '/community' },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

for (const { name, path } of PAGES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500); // React 렌더 대기
    const shot = `${OUT}/${name}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`✓ ${name} ${path} → ${shot}${errors.length ? ` (errors: ${errors.length})` : ''}`);
    if (errors.length) {
      console.log('  ' + errors.slice(0, 3).join('\n  '));
    }
  } catch (e) {
    console.log(`✗ ${name} ${path}: ${e.message}`);
  }
  await page.close();
}

await browser.close();
console.log(`\nSaved to ${OUT}`);
