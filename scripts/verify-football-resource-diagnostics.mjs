import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'tests/artifacts.nosync/issue-175-resource-diagnostics');
const CONFIG = path.join(ROOT, 'scripts/issue-175/probes/playwright.config.mjs');
const SPEC = path.join(ROOT, 'scripts/issue-175/probes/resource-diagnostics.spec.mjs');
const CLI = path.join(ROOT, 'node_modules/@playwright/test/cli.js');
const engines = process.argv.slice(2);
if (engines.length !== 2 || engines[0] !== 'chromium' || engines[1] !== 'webkit') {
  console.error('Usage: node scripts/verify-football-resource-diagnostics.mjs chromium webkit');
  process.exit(2);
}

fs.mkdirSync(RUNS, { recursive: true });
const runDir = path.join(RUNS, `${new Date().toISOString().replace(/[-:.]/g, '')}-${crypto.randomBytes(4).toString('hex')}`);
fs.mkdirSync(runDir);
const results = [];

function run(engine, mode) {
  const outputDir = path.join(runDir, `${engine}-${mode}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const args = ['test', '--config', CONFIG, SPEC];
  if (mode === 'positive') args.push('--grep-invert', 'intentional strict failure');
  else args.push('--grep', 'intentional strict failure');
  const child = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, ISSUE175_ENGINE: engine, ISSUE175_OUTPUT_DIR: outputDir },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(outputDir, 'stdout.log'), child.stdout ?? '', { flag: 'wx' });
  fs.writeFileSync(path.join(outputDir, 'stderr.log'), child.stderr ?? '', { flag: 'wx' });
  if (child.error) throw child.error;
  return { engine, mode, outputDir, exitCode: child.status, signal: child.signal };
}

function collectAttachments(root) {
  const found = [];
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === 'football-resource-diagnostics.json') found.push(full);
    }
  };
  walk(root);
  return found.map(file => ({ file, value: JSON.parse(fs.readFileSync(file, 'utf8')) }));
}

function reportAttachments(outputDir) {
  const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'));
  const found = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) for (const item of spec.tests ?? []) {
      for (const result of item.results ?? []) for (const attachment of result.attachments ?? []) {
        if (attachment.name === 'football-resource-diagnostics.json') found.push(attachment);
      }
    }
    for (const nested of suite.suites ?? []) visit(nested);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return found;
}

function checkTiming(events, engine) {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  if (ordered.some((event, index) => event.sequence !== index + 1
    || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0
    || Number.isNaN(Date.parse(event.at)) || !event.at.endsWith('Z')
    || !Number.isInteger(event.context) || !Number.isInteger(event.page))) {
    throw new Error(`${engine} event identity or timing fields are incomplete`);
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].elapsedMs < ordered[index - 1].elapsedMs
      || Date.parse(ordered[index].at) < Date.parse(ordered[index - 1].at)) {
      throw new Error(`${engine} event timing moved backwards`);
    }
  }
}

function assertPositive(engine, runInfo) {
  if (runInfo.exitCode !== 0) throw new Error(`${engine} positive probe exited ${runInfo.exitCode ?? runInfo.signal}`);
  const attachments = collectAttachments(runInfo.outputDir);
  const linked = reportAttachments(runInfo.outputDir);
  if (linked.length !== 3 || linked.some(item => item.contentType !== 'application/json' || !item.path || !fs.existsSync(item.path))) {
    throw new Error(`${engine} reporter did not retain resolvable native JSON attachment paths`);
  }
  const mixed = attachments.find(({ value }) => value.test.titlePath.at(-1)?.includes('mixed Place Football Place'))?.value;
  const navigation = attachments.find(({ value }) => value.test.titlePath.at(-1)?.includes('failed initial Football'))?.value;
  const success = attachments.find(({ value }) => value.test.titlePath.at(-1)?.includes('successful Football'))?.value;
  if (!mixed || !navigation || !success) throw new Error(`${engine} probe attachments are incomplete`);
  for (const { value } of attachments) if (value.engine !== engine) throw new Error(`${engine} attachment omits the native browser engine`);
  checkTiming([...mixed.resourceFailures, ...mixed.consoleErrors], engine);
  if (!mixed.resourceFailures.some(event => event.url.endsWith('/football/football-only-canary.png') && event.code !== '[unavailable]')) {
    throw new Error(`${engine} did not retain the native Football request failure and code`);
  }
  if (!mixed.consoleErrors.some(event => event.source.endsWith('/football/issue-175-console-source.js')
    && Number.isInteger(event.line) && event.line >= 0
    && Number.isInteger(event.column) && event.column >= 0
    && Date.parse(event.at) && event.at.endsWith('Z'))) {
    throw new Error(`${engine} did not retain native console location and timestamp`);
  }
  if (!navigation.resourceFailures.some(event => event.navigation && event.url.endsWith('/football/issue-175-missing-document'))) {
    throw new Error(`${engine} did not retain failed initial Football navigation`);
  }
  if (success.resourceFailures.length || success.consoleErrors.length) throw new Error(`${engine} successful case inherited events`);
  if (mixed.cleanup?.contexts !== 2 || mixed.cleanup?.pages !== 3
    || mixed.cleanup?.detachedContextListeners !== 6 || mixed.cleanup?.detachedPageListeners !== 3) {
    throw new Error(`${engine} listener cleanup counts do not cover both contexts and all pages`);
  }
  for (const { value } of attachments) {
    const serialized = JSON.stringify(value);
    if (/private-canary|place-value-practice|https?:\/\/[^/]+\/football\/[^" ]*[?#]/i.test(serialized)) {
      throw new Error(`${engine} artifact contains an unrelated route or unredacted URL data`);
    }
  }
  return { attachmentCount: attachments.length, nativeFailure: mixed.resourceFailures[0], console: mixed.consoleErrors[0] };
}

for (const engine of engines) {
  const positive = run(engine, 'positive');
  results.push({ ...positive, verification: assertPositive(engine, positive) });
  const negative = run(engine, 'negative');
  if (negative.exitCode === 0) throw new Error(`${engine} intentional strict failure unexpectedly passed`);
  const failed = collectAttachments(negative.outputDir);
  const failedLinks = reportAttachments(negative.outputDir);
  if (failed.length !== 1 || failed[0].value.status !== 'failed'
    || !failed[0].value.resourceFailures.some(event => event.url.endsWith('/football/intentional-negative.png'))
    || failedLinks.length !== 1 || failedLinks[0].contentType !== 'application/json'
    || !failedLinks[0].path || !fs.existsSync(failedLinks[0].path)) {
    throw new Error(`${engine} failed case did not retain its failed status and complete diagnostics attachment`);
  }
  results.push({ ...negative, verification: { failedStatus: failed[0].value.status, attachments: failed.length } });
}

const manifest = {
  createdAt: new Date().toISOString(),
  base: '9135128946cee76f11772ab797a198eb360569ba',
  purpose: 'Native Playwright resource diagnostics probes. The intentional-negative child is expected to exit nonzero and its artifacts are retained.',
  results,
};
fs.writeFileSync(path.join(runDir, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(`Issue 175 browser probes verified. Retained artifacts: ${path.relative(ROOT, runDir)}`);
