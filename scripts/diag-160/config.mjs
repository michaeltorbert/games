// Issue #160 diagnostic Playwright config, used only by scripts/diag-160/run.mjs.
// Spreads the unchanged base config and sets browserName chromium on global use
// and every project, like scripts/football-release.config.mjs. Unchanged:
// retries 0, workers (unset), fullyParallel, deadlines, trace off, screenshot
// policy, baseURL and the six projects. Differences: testDir is the repository
// so generated copies under output/issue-160/runs/*/gen can run beside tests/,
// testMatch admits only those two locations, and output goes to DIAG160_OUT.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.env.DIAG160_OUT;
if (!out) throw new Error('Run this config through scripts/diag-160/run.mjs.');
const escaped = REPO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig({
  ...base,
  testDir: REPO,
  testMatch: new RegExp(`^${escaped}/(tests/[^/]+\\.spec\\.mjs|output/issue-160/runs/[^/]+/gen/[^/]+\\.spec\\.mjs)$`),
  outputDir: path.join(out, 'test-results'),
  reporter: [['list'], ['json', { outputFile: path.join(out, 'report.json') }]],
  use: { ...base.use, browserName: 'chromium' },
  webServer: { ...base.webServer, cwd: REPO, reuseExistingServer: false },
  projects: base.projects.map(project => ({ ...project, use: { ...project.use, browserName: 'chromium' } })),
});
