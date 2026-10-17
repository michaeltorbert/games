import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const engine = process.env.ISSUE175_ENGINE;
const outputDir = process.env.ISSUE175_OUTPUT_DIR;
if (!['chromium', 'webkit'].includes(engine) || !outputDir) {
  throw new Error('Use scripts/verify-football-resource-diagnostics.mjs to select an engine and output directory.');
}

export default defineConfig({
  ...base,
  testDir: path.join(ROOT, 'scripts/issue-175/probes'),
  outputDir,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: path.join(outputDir, 'report.json') }]],
  use: { ...base.use, browserName: engine },
  webServer: { ...base.webServer, cwd: ROOT, reuseExistingServer: false },
  projects: [{
    name: `issue-175-${engine}`,
    use: {
      browserName: engine,
      viewport: { width: 1180, height: 820 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  }],
});
