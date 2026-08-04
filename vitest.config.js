/**
 * vitest 설정.
 *
 * ⚠️ vite.config.js 와 **별개 파일이라 설정이 자동으로 공유되지 않는다.** 특히
 *    "JSX 가 .js 확장자에 들어 있다"(src 161개 중 100개)는 사실을 여기에도 알려줘야 한다.
 *    안 그러면 컴포넌트를 렌더하는 테스트가 이렇게 죽는다:
 *      Failed to parse source for import analysis ... make sure to name the file with .jsx
 *    즉 **화면 100개는 테스트를 쓸 수조차 없는 상태**였다(2026-08-04 실측으로 발견).
 *    기존 테스트가 전부 순수 로직(세금 계산·캐시·훅)이라 아무도 못 알아챘다.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // vite.config.js 의 같은 설정과 짝이다 — 한쪽만 고치면 빌드는 되는데 테스트가 죽는다.
  plugins: [react({ include: /\.(jsx?|tsx?)$/ })],
  esbuild: { loader: 'jsx', include: /src\/.*\.jsx?$/, exclude: [] },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.config.js',
        '**/build/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
