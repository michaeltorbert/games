// Issue #161 diagnostic Playwright config. It spreads the unchanged base config
// and sets browserName on every one of the six projects and on global use.
// Never pass --browser: in Playwright 1.56.1 (lib/program.js:301-310) it
// replaces the configured projects with one bare project per browser.
//
// DIAG161_MODE:
//   arm       21 release files (or a subset); server owned by run-arm.mjs
//   selfcheck synthetic harness spec in ./selfcheck; server owned by run-arm.mjs
//   gate      whole-file partition gate; base webServer, but never reused
// Unchanged from base: retries, fullyParallel, deadlines, projects' viewport/
// DPR/mobile/touch, screenshot policy, baseURL and every spec predicate.
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.mjs';
import { DIAG_DIR, REPO } from './lib.mjs';

const mode = process.env.DIAG161_MODE;
const runDir = process.env.DIAG161_RUN_DIR;
const engine = process.env.DIAG161_ENGINE || 'webkit';
// differential: synthetic browser-lifetime contrast in ./differential (run-arm diff-* arms only)
if (!['arm', 'selfcheck', 'gate', 'differential'].includes(mode) || !runDir) {
  throw new Error('Run this config through scripts/diag-161/run-arm.mjs or gate.mjs (DIAG161_MODE/DIAG161_RUN_DIR unset).');
}

const projects = base.projects.map(project => ({ ...project, use: { ...project.use, browserName: engine } }));
const use = { ...base.use, browserName: engine };

const config = mode === 'gate'
  ? {
    ...base,
    testDir: path.join(REPO, 'tests'),
    outputDir: path.join(runDir, 'pw-output'),
    reporter: [['list'], ['json', { outputFile: process.env.DIAG161_JSON }]],
    use,
    // Base command is repo-relative; never reuse a listener we did not start.
    webServer: { ...base.webServer, cwd: REPO, reuseExistingServer: false },
    projects,
  }
  : {
    ...base,
    testDir: mode === 'arm' ? path.join(REPO, 'tests') : path.join(DIAG_DIR, mode),
    outputDir: path.join(runDir, 'pw-output'),
    reporter: [
      ['list'],
      ['json', { outputFile: path.join(runDir, 'report.json') }],
      [path.join(DIAG_DIR, 'stall-reporter.mjs'), { runDir }],
    ],
    use: { ...use, trace: process.env.DIAG161_TRACE || 'on' },
    projects,
  };
// Arms: run-arm.mjs starts the logged server itself, so it owns its PID and logs.
if (mode !== 'gate') delete config.webServer;

export default defineConfig(config);
