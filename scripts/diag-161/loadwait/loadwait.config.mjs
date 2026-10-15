// Issue #161 load-wait Playwright config, used only by run.mjs.
//
// faithful: the unchanged release config (scripts/football-release.config.mjs,
//   engine webkit: all six base projects with the Safari user agent, inherited
//   default workers, fullyParallel, retries 0, trace off, base deadlines,
//   screenshot policy and baseURL). The single deviation is that webServer is
//   removed because run.mjs owns the observed, unchanged serve-root on 8090.
//   The CLI is given exactly one file; no worker/retry/timeout/trace/grep flags.
// control: the same release settings for ipad-11-landscape only, two workers,
//   and the synthetic sensitivity specs in controls/.
//
// In both modes, each worker process installs the passive observer here,
// during config evaluation and before the test file or any fixture loads.
// The CLI main process (no TEST_WORKER_INDEX) never installs it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import release from '../../football-release.config.mjs';
import { installObserver } from './observer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const mode = process.env.LOADWAIT_MODE;
const runDir = process.env.LOADWAIT_RUN_DIR;
const sinkCapBytes = Number(process.env.LOADWAIT_SINK_CAP);
if (!['faithful', 'control'].includes(mode) || !runDir || !path.isAbsolute(runDir) || !(sinkCapBytes > 0) || process.env.FOOTBALL_RELEASE_ENGINE !== 'webkit') {
  throw new Error('Run this config through scripts/diag-161/loadwait/run.mjs.');
}

if (process.env.TEST_WORKER_INDEX !== undefined) installObserver({ runDir, sinkCapBytes });

const config = { ...release };
delete config.webServer;
if (mode === 'control') {
  config.testDir = path.join(HERE, 'controls');
  config.workers = 2;
  config.projects = release.projects.filter(p => p.name === 'ipad-11-landscape');
}

export default defineConfig(config);
