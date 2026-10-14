// Football release Playwright config, used only by scripts/run-football-release.mjs
// (`npm run test:football:release`). It spreads the unchanged base config and
// sets browserName on global use and on every base project. Never pass
// --browser: in Playwright 1.56.1 it replaces the configured projects with one
// bare project per browser.
// Unchanged from base: retries, workers, fullyParallel, deadlines, trace,
// screenshot policy, baseURL, the projects' viewport/DPR/mobile/touch and every
// spec predicate. WebKit projects additionally get the iOS Safari user agent.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../playwright.config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// WebKit only: the iOS Safari user agent the AGENTS emulation tier requires, the same strings as
// output/issue-51/mockup-v5/capture.mjs. Every other project setting (viewport, DPR, isMobile,
// hasTouch) is the base project's; no product code reads the user agent.
const SAFARI_UA = {
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
const releaseUse = project => {
  if (engine !== 'webkit') return {};
  const kind = project.name.startsWith('ipad') ? 'ipad' : project.name.startsWith('iphone') ? 'iphone' : null;
  if (!kind) throw new Error(`no Safari user agent for WebKit project ${project.name}`);
  return { userAgent: SAFARI_UA[kind] };
};
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
  projects: base.projects.map(project => ({ ...project, use: { ...project.use, ...releaseUse(project), browserName: engine } })),
});
