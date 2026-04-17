import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT_ROOT = path.join(process.cwd(), 'tests', 'artifacts', 'football-call-layout');
const SERVER_ENTRY = path.join(process.cwd(), 'scripts', 'serve-root.mjs');

const DEVICES = [
  { key: 'ipad-11-portrait', label: 'iPad 11 portrait', viewport: { width: 820, height: 1180 } },
  { key: 'ipad-pro-13-portrait', label: 'iPad Pro 13 portrait', viewport: { width: 1032, height: 1376 } },
  { key: 'iphone-15-portrait', label: 'iPhone 15 portrait', viewport: { width: 393, height: 852 } },
  { key: 'iphone-17-pro-max-portrait', label: 'iPhone 17 Pro Max portrait', viewport: { width: 440, height: 956 } },
  { key: 'ipad-11-landscape', label: 'iPad 11 landscape', viewport: { width: 1180, height: 820 } },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return server;
}

async function collectCallMetrics(page) {
  return page.evaluate(() => {
    const desk = document.querySelector('#ui-desk');
    const cards = [...document.querySelectorAll('#call-grid .call-btn')];
    const lastCard = cards.at(-1);
    if (!desk || !lastCard) return null;
    const rect = lastCard.getBoundingClientRect();
    return {
      callCount: cards.length,
      innerHeight: window.innerHeight,
      lastCardBottom: Math.ceil(rect.bottom),
      phase: desk.dataset.phase || null,
      scrollY: window.scrollY,
    };
  });
}

function assertMetrics(metrics, label) {
  const failures = [];
  if (!metrics) {
    failures.push(`${label}: call layout metrics missing`);
    return failures;
  }
  if (metrics.callCount <= 0) failures.push(`${label}: expected at least one call card`);
  if (metrics.phase !== 'call') failures.push(`${label}: expected call phase, got ${metrics.phase}`);
  if (metrics.scrollY !== 0) failures.push(`${label}: expected scrollY 0, got ${metrics.scrollY}`);
  if (metrics.lastCardBottom > metrics.innerHeight) {
    failures.push(
      `${label}: last card bottom ${metrics.lastCardBottom} exceeds viewport ${metrics.innerHeight}`
    );
  }
  return failures;
}

async function checkOpeningSnap(page, outputDir) {
  await page.goto(`${BASE_URL}/football/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#ov-start .ov-btn').click();
  await page.waitForSelector('#ui-desk[data-phase="call"]');
  const metrics = await collectCallMetrics(page);
  await page.screenshot({ path: path.join(outputDir, 'opening-snap.png') });
  return metrics;
}

async function checkOffenseReentry(page, outputDir) {
  await page.goto(`${BASE_URL}/football/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#ov-start .ov-btn').click();
  await page.waitForSelector('#ui-desk[data-phase="call"]');
  await page.evaluate(() => {
    showOffenseTransition('Back on offense after the stop.');
    startOffense();
  });
  await page.waitForSelector('#ui-desk[data-phase="call"]');
  const metrics = await collectCallMetrics(page);
  await page.screenshot({ path: path.join(outputDir, 'offense-reentry.png') });
  return metrics;
}

async function runDevice(browser, device) {
  const outputDir = path.join(OUTPUT_ROOT, device.key);
  await mkdir(outputDir, { recursive: true });
  const context = await browser.newContext({ viewport: device.viewport });
  const page = await context.newPage();
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.stack || error.message : String(error));
  });
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  const openingMetrics = await checkOpeningSnap(page, outputDir);
  const reentryMetrics = await checkOffenseReentry(page, outputDir);

  await writeFile(
    path.join(outputDir, 'metrics.json'),
    JSON.stringify(
      {
        device,
        openingMetrics,
        reentryMetrics,
        pageErrors,
      },
      null,
      2
    )
  );

  await context.close();

  return {
    device,
    openingMetrics,
    reentryMetrics,
    pageErrors,
  };
}

async function main() {
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const server = startServer();
  try {
    await waitForServer(`${BASE_URL}/football/`);

    const browser = await chromium.launch();
    try {
      const failures = [];
      for (const device of DEVICES) {
        const result = await runDevice(browser, device);
        console.log(`${device.key}: opening ${JSON.stringify(result.openingMetrics)} reentry ${JSON.stringify(result.reentryMetrics)}`);
        failures.push(...assertMetrics(result.openingMetrics, `${device.key} opening snap`));
        failures.push(...assertMetrics(result.reentryMetrics, `${device.key} offense re-entry`));
        if (result.pageErrors.length) {
          failures.push(
            `${device.key}: console/page errors:\n${result.pageErrors.map((line) => `  - ${line}`).join('\n')}`
          );
        }
      }

      if (failures.length) {
        console.error('\nFootball call layout verification failed:');
        for (const failure of failures) console.error(`- ${failure}`);
        process.exitCode = 1;
        return;
      }

      console.log('\nFootball call layout verification passed.');
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
