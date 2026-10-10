// Issue #161 continuation Playwright config, used only by run-arm.mjs. It
// spreads the unchanged base config, sets browserName webkit on global use and
// every base project (never --browser, which in 1.56.1 replaces the projects),
// and points testDir at the synthetic specs. run-arm.mjs owns the server, so
// webServer is removed. Unchanged from base: retries 0, fullyParallel, the
// projects' viewport/DPR/mobile/touch, screenshot policy and baseURL.
// trace is the one declared arm factor: 'on' (Playwright's configured tracing
// bundle: trace events, screenshots/screencast and DOM snapshots) or 'off'.
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../playwright.config.mjs';
import { HERE } from './lib.mjs';

const runDir = process.env.DIAG161C_RUN_DIR;
const trace = process.env.DIAG161C_TRACE;
const workload = process.env.DIAG161C_WORKLOAD;
if (!runDir || !['on', 'off'].includes(trace) || !['nav', 'blank', 'stock-skip'].includes(workload)) {
  throw new Error('Run this config through scripts/diag-161/continuation/run-arm.mjs (DIAG161C_* unset).');
}

const config = {
  ...base,
  // Batch 2's stock-fixture arm lives in its own directory so batch 1 specs are never collected with it.
  testDir: path.join(HERE, workload === 'stock-skip' ? 'specs-stock' : 'specs'),
  outputDir: path.join(runDir, 'pw-output'),
  reporter: [['list'], ['json', { outputFile: path.join(runDir, 'report.json') }]],
  use: { ...base.use, browserName: 'webkit', trace },
  projects: base.projects.map(project => ({ ...project, use: { ...project.use, browserName: 'webkit' } })),
};
delete config.webServer;

export default defineConfig(config);
