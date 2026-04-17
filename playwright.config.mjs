import { defineConfig } from '@playwright/test';

const PORT = 8090;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  outputDir: 'tests/artifacts',
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/serve-root.mjs`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'iphone-15-portrait',
      use: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: 'iphone-17-pro-max-portrait',
      use: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
    {
      name: 'ipad-11-portrait',
      use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'ipad-pro-13-portrait',
      use: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'ipad-pro-13-landscape',
      use: { viewport: { width: 1376, height: 1032 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'ipad-11-landscape',
      use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
});
