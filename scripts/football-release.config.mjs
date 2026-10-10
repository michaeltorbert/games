// Football release Playwright config, used only by scripts/run-football-release.mjs
// (`npm run test:football:release`). It spreads the unchanged base config and
// sets browserName on global use and on every base project. Never pass
// --browser: in Playwright 1.56.1 it replaces the configured projects with one
// bare project per browser.
// Unchanged from base: retries, workers, fullyParallel, deadlines, trace,
// screenshot policy, baseURL, the projects' viewport/DPR/mobile/touch and every
// spec predicate.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engine = process.env.FOOTBALL_RELEASE_ENGINE;
const outputDir = process.env.FOOTBALL_RELEASE_OUTPUT_DIR;
const jsonFile = process.env.FOOTBALL_RELEASE_JSON;
if (!['chromium', 'webkit'].includes(engine) || !outputDir || !jsonFile) {
  throw new Error('Run this config through `npm run test:football:release` (scripts/run-football-release.mjs).');
}

export default defineConfig({
  ...base,
  testDir: path.join(REPO, 'tests'),
  outputDir,
  reporter: [['list'], ['json', { outputFile: jsonFile }]],
  use: { ...base.use, browserName: engine },
  // The base server command is repo-relative; never reuse a listener we did not start.
  webServer: { ...base.webServer, cwd: REPO, reuseExistingServer: false },
  projects: base.projects.map(project => ({ ...project, use: { ...project.use, browserName: engine } })),
});
