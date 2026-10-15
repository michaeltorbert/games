// Issue #161 load-wait: prints the effective (resolved) settings of
// loadwait.config.mjs and how they differ from the release config, as JSON on
// stdout. run.mjs runs it in a separate process with the CLI's environment
// before starting the CLI (TEST_WORKER_INDEX is never set, so no observer is
// installed). No browser, no network, no writes.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const { default: release } = await import('../../football-release.config.mjs');
const { default: config } = await import('./loadwait.config.mjs');

const keys = [...new Set([...Object.keys(release), ...Object.keys(config)])].sort();
const differs = keys.filter(k => JSON.stringify(release[k]) !== JSON.stringify(config[k]));
const browsers = [...new Set((config.projects ?? []).map(p => p.use?.browserName))];
console.log(JSON.stringify({
  mode: process.env.LOADWAIT_MODE,
  configWorkers: config.workers ?? null,
  configTimeout: config.timeout ?? null,
  retries: config.retries ?? null,
  fullyParallel: config.fullyParallel ?? null,
  trace: config.use?.trace ?? null,
  screenshot: config.use?.screenshot ?? null,
  webServer: !!config.webServer,
  browserName: browsers.length === 1 ? browsers[0] : browsers,
  testDir: path.relative(REPO, config.testDir ?? ''),
  projects: (config.projects ?? []).map(p => ({ name: p.name, viewport: p.use?.viewport ?? null, deviceScaleFactor: p.use?.deviceScaleFactor ?? null, isMobile: p.use?.isMobile ?? null, hasTouch: p.use?.hasTouch ?? null, uaSha12: p.use?.userAgent ? crypto.createHash('sha256').update(p.use.userAgent).digest('hex').slice(0, 12) : null })),
  onlyDiffFromRelease: differs,
}));
