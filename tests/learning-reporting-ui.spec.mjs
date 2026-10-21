// #200 layout checks on all six device projects. The dashboard's real HTML, CSS and
// client script (services/learning-reporting/src/dashboard.js) are served on a routed
// loopback origin, and its API answers come from the real report builder over a
// synthetic fixture. This checks rendering and touch geometry; it is engine emulation,
// not a physical iPad, Safari chrome, keyboard or safe-area result.
import { randomUUID, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
// Football pages use the repository's session-mute fixture (verified after every goto and
// re-asserted below before the first input); no audio API is stubbed.
import { test as footballTest } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';
import { DASHBOARD_CSS, dashboardHtml, dashboardScript } from '../services/learning-reporting/src/dashboard.js';
import { buildReport, TIMING_CAVEAT } from '../services/learning-reporting/src/report.js';
import { CATALOG } from '../services/learning-reporting/src/validator.js';
import { assembleHealth } from '../services/learning-reporting/src/health.js';
import { RULES } from '../services/learning-reporting/src/config.js';

const DASH = 'http://127.0.0.1:8198';
const DEVICE = randomUUID(), EPOCH = randomUUID(), EPOCH2 = randomUUID(), P1 = randomUUID(), P2 = randomUUID();
let seq = 0;
const base = (kind, game, qid, day) => ({ schemaVersion: 1, eventId: randomUUID(), deviceId: DEVICE, epochId: EPOCH, seq: ++seq, profileId: P1, game,
  gameVersion: game === 'football' ? '1.34.22' : '1.9.2', recordedAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`, kind, questionInstanceId: qid });
const META = { familyId: 'line-to-gain-exact', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', grading: 'gate', evidenceClass: 'independent' };
function fixtureEvents() {
  const events = [];
  for (let day = 2; day < 26; day += 3) {
    const q = randomUUID();
    events.push({ ...base('attempt', 'football', q, day), ...META, number: 1, correct: day % 2 === 0, support: 'initial' });
    if (day % 2) events.push({ ...base('help', 'football', q, day), ...META, number: 2, support: 'guided' }, { ...base('attempt', 'football', q, day), ...META, number: 2, correct: true, support: 'guided' });
    events.push({ ...base('resolution', 'football', q, day), ...META, resolution: day % 2 ? 'retryCorrect' : 'firstTryCorrect' });
    const f = randomUUID();
    events.push({ ...base('attempt', 'facts', f, day), factId: 'add:7:6', family: 'family:6:7:13', number: 1, correct: true, helped: false },
      { ...base('resolution', 'facts', f, day), factId: 'add:7:6', family: 'family:6:7:13', outcome: 'first-correct', eligibleCheck: day > 10, timingMs: day > 18 ? null : 4200, helped: false });
  }
  return events;
}
const report = buildReport({ profile: { profileId: P1, label: 'Synthetic Lark' }, devices: [{ deviceId: DEVICE, name: 'Kitchen tablet', lastSyncAt: '2026-10-25T18:00:00.000Z', revokedAt: null, shared: true }],
  events: fixtureEvents(), from: '2026-09-27', to: '2026-10-26', truncated: false, catalog: CATALOG, retentionDays: 90, timeZone: 'UTC', now: Date.parse('2026-10-26T12:00:00Z') });
const health = assembleHealth({
  devices: [{ deviceId: DEVICE, name: 'Kitchen tablet', enrolledAt: 1, revokedAt: null, lastSyncAt: Date.parse('2026-10-25T18:00:00Z'), epochId: EPOCH2, highestSeq: 3, droppedLocal: 0, writeFailures: 1 }],
  epochs: [{ deviceId: DEVICE, epochId: EPOCH, firstSeenAt: 1000, retained: 9, retired: 0, maxSeq: 10 }, { deviceId: DEVICE, epochId: EPOCH2, firstSeenAt: Date.parse('2026-10-20T00:00:00Z'), retained: 3, retired: 0, maxSeq: 3 }],
  gaps: [{ deviceId: DEVICE, epochId: EPOCH, first: 5, last: 5 }], anomalies: [], assignments: [{ deviceId: DEVICE, profileId: P1, slot: 1 }, { deviceId: DEVICE, profileId: P2, slot: 2 }],
});
const overview = { profiles: [{ profileId: P1, label: 'Synthetic Lark', createdAt: 1 }, { profileId: P2, label: 'Synthetic Wren', createdAt: 2 }],
  devices: [{ deviceId: DEVICE, name: 'Kitchen tablet', enrolledAt: 1, revokedAt: null, lastSyncAt: 2, profiles: [{ profileId: P1, slot: 1 }, { profileId: P2, slot: 2 }] }], codes: [] };

async function serveDashboard(page) {
  await page.route(`${DASH}/**`, route => {
    const url = new URL(route.request().url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: dashboardHtml() });
    if (url.pathname === '/app.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: dashboardScript() });
    if (url.pathname === '/app.css') return route.fulfill({ status: 200, contentType: 'text/css', body: DASHBOARD_CSS });
    if (url.pathname === '/api/session') return json({ csrf: 'synthetic', timeZone: 'UTC', retentionDays: 90, reportingEnabled: true, today: '2026-10-26', rules: RULES, limits: { profiles: 8, devices: 16, codeMinutes: 10 } });
    if (url.pathname === '/api/overview') return json(overview);
    if (url.pathname === '/api/report') return json(report);
    if (url.pathname === '/api/devices') return json(health);
    if (url.pathname === '/api/preview') return json({ affected: { profiles: [{ label: 'Synthetic Lark' }, { label: 'Synthetic Wren' }], devices: [{ name: 'Kitchen tablet' }], events: 12, consequence: 'Deletes this device’s reported practice and revokes its connection for every profile listed. The device must be connected again with a new code to report. This cannot be undone.' }, confirmation: 'x.y' });
    return route.fulfill({ status: 404, body: '' });
  });
}
async function geometry(page, name) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('button, select, input, summary, a.action')].filter(element => {
      const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden';
    });
    // A checkbox or radio's touch target is its whole label.
    const target = element => (element.matches('input[type="checkbox"], input[type="radio"]') && element.closest('label')) || element;
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: controls.map(element => ({ tag: target(element).tagName, text: (element.textContent || element.getAttribute('aria-label') || element.value || '').trim().slice(0, 30), box: target(element).getBoundingClientRect().toJSON() }))
        .filter(item => item.box.height < 44 || (item.tag !== 'SUMMARY' && item.tag !== 'INPUT' && item.box.width < 44)),
    };
  });
  await test.info().attach(`${name}-geometry.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(result.overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
  expect(result.small, 'every control at least 44 CSS pixels').toEqual([]);
}

test('the dashboard report, devices and setup views fit every target with touch-size controls and the exact caveat', async ({ page }) => {
  await serveDashboard(page);
  await page.goto(`${DASH}/`);
  await expect(page.getByRole('heading', { name: 'Number facts' })).toBeVisible();
  await expect(page.getByText(TIMING_CAVEAT, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Football' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suggested next practice' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/not practiced|never checked|quick and accurate on the latest two checks|mastery score/i);
  await expect(page.locator('body')).toContainText('No reported practice in this range');
  await expect(page.locator('body')).toContainText('not timed');
  // Counts name their units, and first-try-without-help stays separate from helped answers.
  const facts = Object.keys(CATALOG.facts).length, concepts = new Set(Object.values(CATALOG.football).map(entry => entry.concept)).size;
  await expect(page.locator('body')).toContainText(`No reported practice in this range: ${facts - 1} of ${facts} facts`);
  await expect(page.locator('body')).toContainText(`No reported practice in this range: ${concepts - 1} of ${concepts} Football concepts`);
  await expect(page.locator('body')).toContainText('8 completed work-it-out questions: 4 first try without help, 4 needed help or a second try');
  const select = await page.locator('select').boundingBox();
  expect(select.height, 'the profile select keeps a 44px touch target').toBeGreaterThanOrEqual(44);
  const football = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Football' }) });
  await expect(football).not.toContainText(/\d+(\.\d+)?\s?s entry|seconds/);
  await geometry(page, 'dashboard-report');
  await page.locator('summary').filter({ hasText: '7 + 6' }).first().tap();
  await geometry(page, 'dashboard-report-expanded');
  await page.getByRole('button', { name: 'Devices' }).tap();
  await expect(page.locator('body')).toContainText('possibly pending, delayed or lost');
  await expect(page.locator('body')).toContainText('A fresh log started');
  await expect(page.locator('body')).toContainText('cannot be detected');
  await geometry(page, 'dashboard-devices');
  await page.getByRole('button', { name: 'Delete device…' }).tap();
  const confirm = page.locator('.confirm');
  await expect(confirm).toContainText('Synthetic Lark, Synthetic Wren');
  await expect(confirm).toContainText('connected again');
  await expect(confirm).toBeFocused();
  await geometry(page, 'dashboard-confirm');
  await page.getByRole('button', { name: 'Setup' }).tap();
  await expect(page.locator('body')).toContainText('Use a nickname, not a full name.');
  await geometry(page, 'dashboard-setup');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
  expect(focus.outline).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

// ---- Football who-is-playing picker on every target (a device enrolled for two profiles) ----
const SERVICE = 'http://127.0.0.1:8199';
async function enrollTwoProfiles(page, context) {
  const profileIds = [randomUUID(), randomUUID()];
  const cors = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
  await context.route('**/shared/learning-reporting/config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '${SERVICE}' });`,
  }));
  await context.route(`${SERVICE}/**`, route => {
    const request = route.request(), origin = request.headers().origin;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(origin) });
    if (new URL(request.url()).pathname === '/v1/enroll') {
      return route.fulfill({ status: 200, headers: cors(origin), contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, token: `lr1_${'ab'.repeat(16)}_${randomBytes(32).toString('base64url')}`, deviceId: randomUUID(), profileIds }) });
    }
    // Uploads are answered 'unavailable' here: this case is about the start screen only.
    return route.fulfill({ status: 503, headers: cors(origin), contentType: 'application/json', body: '{"error":"unavailable"}' });
  });
  await page.goto('/shared/learning-reporting/');
  await page.locator('#lr-code').fill('0123-4567-89ab-cdef-ghjk-mnpq-rs');
  await page.locator('#lr-connect').tap();
  await expect(page.locator('#lr-form-status')).toHaveText('Connected.');
  return profileIds;
}

footballTest('the Football start screen offers a tappable who-is-playing choice on every target and still starts a game', async ({ page, context }) => {
  const [, second] = await enrollTwoProfiles(page, context);
  await page.goto('/football/');
  // Session mute verified, and the saved preference unchanged, before any input here.
  await expectFootballTestMuted(page);
  const picker = page.locator('#player-picker');
  await expect(picker).toBeVisible();
  // Placement and the existing start-screen styles (no new palette).
  expect(await picker.evaluate(element => [element.parentElement === document.querySelector('#ov-start .overlay-card'),
    element.nextElementSibling?.classList.contains('start-action-row'), element.classList.contains('play-mode-picker')])).toEqual([true, true, true]);
  await expect(picker.getByRole('radio')).toHaveCount(2);
  await expect(picker).toContainText('Player 1');
  await expect(picker).toContainText('Player 2');
  await expect(page.locator('#player-picker-status')).toContainText('Choose who is playing');
  // The new control's own geometry (existing Start controls stay governed by their own suites).
  const pickerGeometry = async name => {
    await picker.scrollIntoViewIfNeeded();
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      picker: document.getElementById('player-picker').getBoundingClientRect().toJSON(),
      card: document.querySelector('#ov-start .overlay-card').getBoundingClientRect().toJSON(),
      options: [...document.querySelectorAll('#player-picker label')].map(label => label.getBoundingClientRect().toJSON()),
    }));
    await test.info().attach(`${name}-geometry.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    await test.info().attach(`${name}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    expect(result.overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
    expect(result.picker.left).toBeGreaterThanOrEqual(result.card.left);
    expect(result.picker.right).toBeLessThanOrEqual(result.card.right);
    for (const box of result.options) {
      expect(box.height, 'each choice at least 44 CSS pixels').toBeGreaterThanOrEqual(44);
      expect(box.width, 'each choice at least 44 CSS pixels').toBeGreaterThanOrEqual(44);
    }
  };
  await pickerGeometry('football-player-picker');
  await picker.locator('label', { hasText: 'Player 2' }).tap();
  await expect(picker.getByRole('radio', { name: 'Player 2' })).toBeChecked();
  await expect(page.locator('#player-picker-status')).toHaveText('');
  expect(await page.evaluate(() => LEARNING_SYNC.player())).toBe(second);
  await pickerGeometry('football-player-picker-chosen');
  // The existing start flow still works by tap: Start Game is reachable and starts play.
  const start = page.locator('#start-game-btn');
  await start.scrollIntoViewIfNeeded();
  const startBox = await start.boundingBox();
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  await start.tap();
  await expect(page.locator('#ov-start')).not.toHaveClass(/\bshow\b/);
  await expect.poll(() => page.evaluate(() => JSON.parse(render_game_to_text()).mode)).toBe('call');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await test.info().attach('football-after-start.png', { body: await page.screenshot(), contentType: 'image/png' });
});

test('the public device page fits every target and shows no profile labels', async ({ page }) => {
  await page.goto('/shared/learning-reporting/');
  await expect(page.locator('#lr-summary')).toHaveText('Reporting is not set up for this site.');
  await geometry(page, 'device-page');
});
