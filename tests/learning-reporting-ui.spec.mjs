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
  // Unfinished questions in a second concept (F-SOL-200-4): help before the first try with no
  // answer, and a retry hint followed by leaving the question.
  const SCORE = { familyId: 'committed-score-total', concept: 'committed-score', purpose: 'coreReview', tier: 'within-10', grading: 'gate', evidenceClass: 'independent' };
  const before = randomUUID(), left = randomUUID(), pending = randomUUID();
  // Pending: help before the first try, then a missed first try; no retry hint is reported.
  events.push({ ...base('help', 'football', pending, 23), ...SCORE, number: 1, support: 'guided' },
    { ...base('attempt', 'football', pending, 23), ...SCORE, number: 1, correct: false, support: 'guided' });
  events.push({ ...base('help', 'football', before, 24), ...SCORE, number: 1, support: 'guided' },
    { ...base('attempt', 'football', left, 25), ...SCORE, number: 1, correct: false, support: 'initial' },
    { ...base('help', 'football', left, 25), ...SCORE, number: 2, support: 'guided' },
    { ...base('leftUnfinished', 'football', left, 25), ...SCORE });
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
      usableViewport: { width: innerWidth, height: innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
      devicePixelRatio,
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      overflow: document.documentElement.scrollWidth - innerWidth,
      small: controls.map(element => ({ tag: target(element).tagName, text: (element.textContent || element.getAttribute('aria-label') || element.value || '').trim().slice(0, 30), box: target(element).getBoundingClientRect().toJSON() }))
        .filter(item => item.box.height < 44 || (item.tag !== 'SUMMARY' && item.tag !== 'INPUT' && item.box.width < 44)),
    };
  });
  const browser = page.context().browser();
  result.emulation = {
    engine: browser?.browserType().name() ?? 'not independently exposed',
    engineVersion: browser?.version() ?? 'not independently exposed',
    project: test.info().project.name,
    isMobile: test.info().project.use.isMobile ?? false,
    hasTouch: test.info().project.use.hasTouch ?? false,
    limitations: 'Browser engine emulation; not physical-device, Apple Simulator, Safari chrome, keyboard or safe-area evidence. Touch flags alone do not prove interaction; the reverse-click mapping case drives transitions by tap.',
  };
  await test.info().attach(`${name}-geometry.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  await test.info().attach(`${name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(result.overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
  expect(result.small, 'every control at least 44 CSS pixels').toEqual([]);
}

// Exactly one view is rendered: the inactive ones carry `hidden`, compute to display:none,
// and none of their content has a box (candidate 3 left them visible under a .view rule).
async function expectOnlyView(page, active) {
  const views = await page.evaluate(() => ['report', 'devices', 'setup'].map(name => {
    const view = document.getElementById(`view-${name}`);
    const boxed = [...view.querySelectorAll('*')].filter(node => { const box = node.getBoundingClientRect(); return box.width > 0 || box.height > 0; }).length;
    return { name, hidden: view.hidden, display: getComputedStyle(view).display, boxed };
  }));
  for (const view of views) {
    if (view.name === active) expect([view.hidden, view.display === 'none'], `${view.name} is shown`).toEqual([false, false]);
    else expect([view.hidden, view.display, view.boxed], `${view.name} is not rendered`).toEqual([true, 'none', 0]);
  }
  for (const name of ['report', 'devices', 'setup']) {
    if (name === active) await expect(page.locator(`#view-${name}`)).toBeVisible();
    else await expect(page.locator(`#view-${name}`)).toBeHidden();
  }
}

test('reverse-clicked profiles keep listed Player slots in the code request and Devices mapping', async ({ page }) => {
  // This dashboard has no audio source. Game-page tests keep their existing mute fixture.
  await serveDashboard(page);
  let selected;
  await page.route(`${DASH}/api/codes`, async route => {
    selected = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'SYNTHETIC', expiresAt: Date.parse('2026-10-26T12:10:00Z') }) });
  });
  await page.route(`${DASH}/api/devices`, route => {
    // The real enrollment SQL uses the profile array index + 1 as the slot (covered
    // separately against local D1); feed that captured request order to the real view.
    const devices = health.devices.map(device => ({ ...device, profiles: selected.profileIds.map((profileId, index) => ({ profileId, slot: index + 1 })) }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...health, devices }) });
  });
  await page.goto(`${DASH}/`);
  await page.getByRole('button', { name: 'Setup', exact: true }).tap();
  const form = page.locator('#view-setup form').filter({ has: page.getByRole('button', { name: 'Create one-time code' }) });
  await form.getByLabel('Device nickname').fill('Reverse tablet');
  await form.getByLabel('Synthetic Wren', { exact: true }).tap();
  await form.getByLabel('Synthetic Lark', { exact: true }).tap();
  await form.getByRole('button', { name: 'Create one-time code' }).tap();
  await expect(page.locator('#view-setup')).toContainText('in the order listed above.');
  expect(selected).toEqual({ deviceName: 'Reverse tablet', profileIds: [P1, P2] });
  await geometry(page, 'dashboard-code-reverse-click');
  await page.getByRole('button', { name: 'Devices', exact: true }).tap();
  await expect(page.locator('#view-devices')).toContainText('Player 1: Synthetic Lark, Player 2: Synthetic Wren');
  await geometry(page, 'dashboard-devices-reverse-click');
});

test('the dashboard report, devices and setup views fit every target with touch-size controls and the exact caveat', async ({ page }) => {
  await serveDashboard(page);
  await page.goto(`${DASH}/`);
  await expectOnlyView(page, 'report');
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
  await expect(page.locator('body')).toContainText(`No reported practice in this range: ${concepts - 2} of ${concepts} Football concepts`);
  await expect(page.locator('body')).toContainText('8 completed work-it-out questions: 4 first try without help, 4 needed help or a second try');
  // Help stages on unfinished questions stay visible and are never counted as completed.
  const score = page.locator('#view-report .list > li > details', { hasText: 'Committed score' });
  await expect(score.locator('summary')).toHaveText('Committed score: 0 completed work-it-out questions: 0 first try without help, 0 needed help or a second try; 3 more questions without a result yet · Not enough reported evidence yet');
  await score.locator('summary').tap();
  await expect(score).toContainText('Help shown before the first try, no answer after it yet: 1 question');
  const leftItem = score.locator('.counts > li', { hasText: 'Left unfinished' });
  await expect(leftItem).toContainText('Left unfinished: 1 question');
  await expect(leftItem).toContainText('1 question where a hint had been shown on the retry');
  await expect(leftItem).not.toContainText('help had been shown before the first try');
  // Pending stays pending and keeps its observed help before the first try; no retry hint,
  // answer or result is inferred for it.
  const pendingItem = score.locator('.counts > li', { hasText: 'Started, no result reported yet' });
  await expect(pendingItem).toContainText('Started, no result reported yet: 1 question');
  await expect(pendingItem).toContainText('1 question where help had been shown before the first try');
  await expect(pendingItem).not.toContainText('hint had been shown on the retry');
  await expect(score).not.toContainText(/Hint shown on the retry, no answer|Correct on|Second miss/);
  await geometry(page, 'dashboard-report-unfinished-help');
  const select = await page.locator('select').boundingBox();
  expect(select.height, 'the profile select keeps a 44px touch target').toBeGreaterThanOrEqual(44);
  const football = page.locator('section.panel', { has: page.getByRole('heading', { name: 'Football' }) });
  await expect(football).not.toContainText(/\d+(\.\d+)?\s?s entry|seconds/);
  await geometry(page, 'dashboard-report');
  await page.locator('summary').filter({ hasText: '7 + 6' }).first().tap();
  await geometry(page, 'dashboard-report-expanded');
  await page.getByRole('button', { name: 'Devices' }).tap();
  await expect(page.locator('#view-devices')).toContainText('possibly pending, delayed or lost');
  await expect(page.locator('#view-devices')).toContainText('A fresh log started');
  await expect(page.locator('#view-devices')).toContainText('cannot be detected');
  await expectOnlyView(page, 'devices');
  await geometry(page, 'dashboard-devices');
  await page.getByRole('button', { name: 'Delete device…' }).tap();
  const confirm = page.locator('.confirm');
  await expect(confirm).toContainText('Synthetic Lark, Synthetic Wren');
  await expect(confirm).toContainText('connected again');
  await expect(confirm).toBeFocused();
  await geometry(page, 'dashboard-confirm');
  await page.getByRole('button', { name: 'Setup' }).tap();
  await expect(page.locator('#view-setup')).toContainText('Use a nickname, not a full name.');
  await expectOnlyView(page, 'setup');
  await geometry(page, 'dashboard-setup');
  // Back to Report: the report alone is rendered again, with its own geometry.
  await page.getByRole('button', { name: 'Report' }).tap();
  await expect(page.getByRole('heading', { name: 'Number facts' })).toBeVisible();
  await expectOnlyView(page, 'report');
  await geometry(page, 'dashboard-report-again');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
  expect(focus.outline).not.toBe('none');
  expect(focus.width).toBeGreaterThanOrEqual(2);
});

// ---- Number facts who-is-practicing before practice, on every target (F-SOL-200-5) ----
footballTest('Number facts shows the who-is-practicing choice before practice on every target, and practice stays usable', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('place-value-practice:mode:v1', 'arithmetic');
    localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts');
  });
  const [first, second] = await enrollTwoProfiles(page, context);
  await page.goto('/place-value-practice/');
  const panel = page.locator('#fact-practice'), picker = page.locator('#facts-player');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('radio')).toHaveCount(2);
  await expect(picker).toContainText('Player 1');
  await expect(picker).toContainText('Player 2');
  await expect(picker).not.toContainText(/Synthetic/);
  await expect(page.locator('#facts-player-status')).toContainText('Choose who is practicing');
  const layout = async name => {
    const result = await page.evaluate(() => {
      const box = element => element.getBoundingClientRect().toJSON();
      const picker = document.getElementById('facts-player'), dock = document.querySelector('.facts-dock'), drive = document.querySelector('.facts-drive');
      return {
        viewport: { width: innerWidth, height: innerHeight, scrollY },
        overflow: document.documentElement.scrollWidth - innerWidth,
        // DOM order: the choice precedes the drive field and the question dock.
        beforeDock: Boolean(picker.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING),
        beforeDrive: Boolean(picker.compareDocumentPosition(drive) & Node.DOCUMENT_POSITION_FOLLOWING),
        picker: box(picker), dock: box(dock), equation: box(document.getElementById('facts-equation')),
        options: [...picker.querySelectorAll('label')].map(box),
      };
    });
    await test.info().attach(`${name}-geometry.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    await test.info().attach(`${name}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    return result;
  };
  // First screen, before any input: the choice is above the practice, fully within the viewport.
  const firstScreen = await layout('facts-player-first-screen');
  expect([firstScreen.beforeDock, firstScreen.beforeDrive]).toEqual([true, true]);
  expect(firstScreen.picker.bottom, 'choice above the question').toBeLessThanOrEqual(firstScreen.dock.top);
  expect(firstScreen.picker.top).toBeGreaterThanOrEqual(0);
  expect(firstScreen.picker.bottom, 'choice visible on the first screen').toBeLessThanOrEqual(firstScreen.viewport.height);
  expect(firstScreen.overflow, 'no horizontal overflow').toBeLessThanOrEqual(0);
  for (const option of firstScreen.options) {
    expect(option.height, 'each choice at least 44 CSS pixels').toBeGreaterThanOrEqual(44);
    expect(option.width, 'each choice at least 44 CSS pixels').toBeGreaterThanOrEqual(44);
  }
  // Tap a player: the choice is stored for this tab and the prompt clears.
  await picker.locator('label', { hasText: 'Player 1' }).tap();
  await expect(picker.getByRole('radio', { name: 'Player 1' })).toBeChecked();
  await expect(page.locator('#facts-player-status')).toHaveText('');
  expect(await page.evaluate(() => LEARNING_SYNC.player())).toBe(first);
  await layout('facts-player-chosen');
  // Practice stays usable by tap: a wrong answer, then a change that waits for the next question.
  const answer = await page.evaluate(() => PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
  const keypad = page.locator('.facts-keypad');
  await keypad.getByRole('button', { name: 'Clear', exact: true }).tap();
  for (const digit of String((answer + 1) % 19)) await keypad.getByRole('button', { name: digit, exact: true }).tap();
  await page.locator('#facts-check').tap();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  expect((await page.evaluate(() => __factsTest.snapshot().attempt)).misses).toBe(1);
  await picker.locator('label', { hasText: 'Player 2' }).tap();
  await expect(picker.getByRole('radio', { name: 'Player 2' })).toBeChecked();
  await expect(page.locator('#facts-player-status')).toContainText('starts with the next question');
  expect(await page.evaluate(() => LEARNING_SYNC.player())).toBe(second);
  const pending = await layout('facts-player-change-pending');
  expect(pending.overflow).toBeLessThanOrEqual(0);
  for (const option of pending.options) expect(Math.min(option.height, option.width)).toBeGreaterThanOrEqual(44);
  await keypad.getByRole('button', { name: 'Clear', exact: true }).tap();
  for (const digit of String(answer)) await keypad.getByRole('button', { name: digit, exact: true }).tap();
  await page.locator('#facts-check').tap();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  expect((await page.evaluate(() => __factsTest.snapshot().attempt)).complete).toBe(true);
  await expect(page.locator('#facts-next')).toBeVisible();
  await layout('facts-player-after-answer');
  // The footer never promises local-only practice on a reporting device, never claims delivery,
  // and limits the claim to Number facts (F6-3).
  const privacy = page.locator('#practice-privacy');
  await expect(privacy).toHaveText('Number facts results on this device are kept here until they are sent to a private grown-up report. Other practice stays on this device.');
  await expect(page.locator('body')).not.toContainText('Practice stays on this device.');
  await privacy.scrollIntoViewIfNeeded();
  await test.info().attach('facts-footer-reporting.png', { body: await page.screenshot(), contentType: 'image/png' });
  // After Stop on the device page, the same footer is local-only again.
  await page.goto('/shared/learning-reporting/');
  await page.locator('#lr-stop-ask').tap();
  await page.locator('#lr-stop-confirm').tap();
  await expect(page.locator('#lr-stop-status')).toHaveText('Reporting stopped on this device.');
  await page.goto('/place-value-practice/');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(privacy).toHaveText('Practice stays on this device.');
  await expect(page.locator('#facts-player')).toHaveCount(0);
});

// ---- Only the latest report request may render (F-SOL-200-1) ----
// Report responses are held and released in a chosen order. Profile B's fixture has only
// the fact 3 + 4; profile A's only 7 + 6, so mixed rendering is detectable.
function reportFor(profileId, label, factId, family) {
  const qid = randomUUID();
  const events = [{ ...base('attempt', 'facts', qid, 12), profileId, factId, family, number: 1, correct: true, helped: false },
    { ...base('resolution', 'facts', qid, 12), profileId, factId, family, outcome: 'first-correct', eligibleCheck: true, timingMs: 3100, helped: false }];
  return buildReport({ profile: { profileId, label }, devices: [{ deviceId: DEVICE, name: 'Kitchen tablet', lastSyncAt: '2026-10-25T18:00:00.000Z', revokedAt: null, shared: true }],
    events, from: '2026-09-27', to: '2026-10-26', truncated: false, catalog: CATALOG, retentionDays: 90, timeZone: 'UTC', now: Date.parse('2026-10-26T12:00:00Z') });
}
const REPORT_A = reportFor(P1, 'Synthetic Lark', 'add:7:6', 'family:6:7:13');
const REPORT_B = reportFor(P2, 'Synthetic Wren', 'add:3:4', 'family:3:4:7');
async function holdReports(page) {
  const held = [];
  // Registered after serveDashboard, so it handles /api/report first.
  await page.route(`${DASH}/api/report**`, route => new Promise(done => {
    held.push({ url: new URL(route.request().url()), respond: async (status, body) => { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); done(); } });
  }));
  return held;
}
const factRows = page => page.locator('#view-report .list > li > details > summary').allTextContents();
async function expectOnlyReportB(page) {
  await expect(page.locator('#view-report h2').first()).toHaveText('Synthetic Wren');
  await expect(page.getByRole('heading', { name: 'Number facts' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Football' })).toHaveCount(1);
  const rows = await factRows(page);
  expect(rows.some(text => text.startsWith('3 + 4:'))).toBe(true);
  expect(rows.some(text => text.startsWith('7 + 6:')), 'nothing from the superseded request').toBe(false);
  await expect(page.locator('#status')).toHaveText('');
  await expect(page.locator('#view-report')).not.toHaveAttribute('aria-busy', 'true');
}

test('a slower earlier report never mixes into a newer profile, range or view, and its failure never replaces the current status', async ({ page }) => {
  await serveDashboard(page);
  const held = await holdReports(page);
  await page.goto(`${DASH}/`);
  // A: the first profile's report is in flight; the page says it is loading.
  await expect.poll(() => held.length).toBe(1);
  expect(held[0].url.searchParams.get('profile')).toBe(P1);
  await expect(page.locator('#status')).toHaveText('Loading report…');
  await expect(page.locator('#view-report')).toHaveAttribute('aria-busy', 'true');
  // Switch to profile B while A is pending; resolve B, then A.
  await page.locator('#view-report select').selectOption(P2);
  await expect.poll(() => held.length).toBe(2);
  expect(held[1].url.searchParams.get('profile')).toBe(P2);
  await held[1].respond(200, REPORT_B);
  await expectOnlyReportB(page);
  await held[0].respond(200, REPORT_A);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50))));
  await expectOnlyReportB(page);
  await geometry(page, 'dashboard-report-after-stale-success');

  // An earlier request for another range fails after the newer range succeeded.
  await page.locator('#view-report input[type="date"]').first().fill('2026-10-01');
  await expect.poll(() => held.length).toBe(3);
  await page.locator('#view-report input[type="date"]').first().fill('2026-10-02');
  await expect.poll(() => held.length).toBe(4);
  expect([held[2].url.searchParams.get('from'), held[3].url.searchParams.get('from')]).toEqual(['2026-10-01', '2026-10-02']);
  await held[3].respond(200, REPORT_B);
  await expectOnlyReportB(page);
  await held[2].respond(500, { error: 'unavailable' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50))));
  await expectOnlyReportB(page);

  // Navigating away: a pending report must not append, change status or stay busy for Devices.
  await page.locator('#view-report input[type="date"]').first().fill('2026-10-03');
  await expect.poll(() => held.length).toBe(5);
  await page.getByRole('button', { name: 'Devices' }).tap();
  await expect(page.locator('#view-devices')).toContainText('possibly pending, delayed or lost');
  await expectOnlyView(page, 'devices');
  await expect(page.locator('#status')).toHaveText('');
  await held[4].respond(500, { error: 'unavailable' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50))));
  await expect(page.locator('#status')).toHaveText('');
  await expect(page.locator('#view-report')).toBeHidden();
  // The hidden report view keeps only the header panel of its last render; no late result panels.
  await expect(page.locator('#view-report .panel')).toHaveCount(1);
  expect(await factRows(page)).toEqual([]);
  await expectOnlyView(page, 'devices');
  // Back to Report: a fresh request renders normally.
  await page.getByRole('button', { name: 'Report' }).tap();
  await expect.poll(() => held.length).toBe(6);
  await held[5].respond(200, REPORT_B);
  await expectOnlyReportB(page);
  await expectOnlyView(page, 'report');
  // Setup while a report is pending, then a late success: Setup's status and view stay intact.
  await page.locator('#view-report input[type="date"]').first().fill('2026-10-04');
  await expect.poll(() => held.length).toBe(7);
  await page.getByRole('button', { name: 'Setup' }).tap();
  await expect(page.locator('#view-setup')).toContainText('Use a nickname, not a full name.');
  await expectOnlyView(page, 'setup');
  await held[6].respond(200, REPORT_A);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50))));
  await expect(page.locator('#status')).toHaveText('');
  expect(await factRows(page)).toEqual([]);
  await expectOnlyView(page, 'setup');
  await geometry(page, 'dashboard-setup-after-stale-report');
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

// Rendered-box ownership on the public device page (F-SOL-200-3): `hidden` must remove a
// region and everything in it from layout, not just set the attribute.
async function deviceRegions(page) {
  return page.evaluate(() => Object.fromEntries(['lr-health', 'lr-sync-actions', 'lr-finish-actions', 'lr-setup', 'lr-stop', 'lr-stop-confirm', 'lr-stop-cancel'].map(id => {
    const element = document.getElementById(id), box = element.getBoundingClientRect();
    const boxed = [element, ...element.querySelectorAll('*')].filter(node => { const b = node.getBoundingClientRect(); return b.width > 0 || b.height > 0; }).length;
    return [id, { hidden: element.hidden, display: getComputedStyle(element).display, rendered: box.width > 0 && box.height > 0, boxed }];
  })));
}
async function expectRegions(page, shown) {
  const regions = await deviceRegions(page);
  for (const [id, region] of Object.entries(regions)) {
    if (shown.includes(id)) expect([region.hidden, region.rendered], `${id} is shown`).toEqual([false, true]);
    else expect([region.hidden, region.display, region.boxed], `${id} is not rendered`).toEqual([true, 'none', 0]);
  }
}

// A refused final-setting write (F6-2): the page shows a partial enrollment after reload,
// finishes it when the browser allows the write, or stops it, never spending another code.
test('a device whose final setting was not saved can finish connecting or stop after a reload, without another code', async ({ page, context }) => {
  const SERVICE_URL = 'http://127.0.0.1:8199';
  const cors = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
  let enrollCalls = 0;
  // Test-only fault: while this tab's sessionStorage flag is set, the hint write is refused.
  await context.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && key === 'learningReporting:enrollment:v1' && sessionStorage.getItem('__failHint') === '1') throw new DOMException('Refused', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await context.route('**/shared/learning-reporting/config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '${SERVICE_URL}' });`,
  }));
  await context.route(`${SERVICE_URL}/**`, route => {
    const request = route.request(), origin = request.headers().origin;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(origin) });
    if (new URL(request.url()).pathname === '/v1/enroll') {
      enrollCalls++;
      return route.fulfill({ status: 200, headers: cors(origin), contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, token: `lr1_${'ab'.repeat(16)}_${randomBytes(32).toString('base64url')}`, deviceId: randomUUID(), profileIds: [randomUUID()] }) });
    }
    return route.fulfill({ status: 503, headers: cors(origin), contentType: 'application/json', body: '{"error":"unavailable"}' });
  });
  const records = () => page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('learningReporting'); r.onupgradeneeded = () => r.transaction.abort(); r.onsuccess = () => resolve(r.result); r.onerror = e => { e.preventDefault(); resolve(null); }; });
    if (!db) return null;
    const values = await new Promise(resolve => { const tx = db.transaction('records', 'readonly'), s = tx.objectStore('records');
      const keys = ['enrollment', 'credential', 'sync', 'outbox', 'binding'], reads = keys.map(k => [k, s.get(k)]);
      tx.oncomplete = () => resolve(Object.fromEntries(reads.map(([k, r]) => [k, r.result ?? null]))); });
    db.close();
    return values;
  });
  const connect = async () => {
    await page.locator('#lr-code').fill('0123-4567-89ab-cdef-ghjk-mnpq-rs');
    await page.locator('#lr-connect').tap();
  };
  const PARTIAL = 'This device is partly connected: the browser did not save the final setting, so practice is not recorded yet. Finish connecting, or stop reporting on this device.';

  await page.goto('/shared/learning-reporting/');
  await page.evaluate(() => sessionStorage.setItem('__failHint', '1'));
  await connect();
  await expect(page.locator('#lr-form-status')).toContainText('did not save the final setting');
  await expect(page.locator('#lr-summary')).toHaveText(PARTIAL);
  await expectRegions(page, ['lr-finish-actions', 'lr-stop']);
  const installed = await records();
  expect(installed.enrollment && installed.credential && installed.sync).toBeTruthy();
  const generation = JSON.parse(installed.enrollment).generation;
  await geometry(page, 'device-page-partial');
  // Reload: still the same partial enrollment, not a blank device asking for a new code.
  await page.reload();
  await expect(page.locator('#lr-summary')).toHaveText(PARTIAL);
  await expectRegions(page, ['lr-finish-actions', 'lr-stop']);
  // Finishing while the write is still refused: truthful message, nothing changed.
  await page.locator('#lr-finish').tap();
  await expect(page.locator('#lr-finish-status')).toContainText('did not save the final setting');
  expect(await records()).toEqual(installed);
  // The browser allows the write again: the same enrollment is finished.
  await page.evaluate(() => sessionStorage.removeItem('__failHint'));
  await page.locator('#lr-finish').tap();
  await expect(page.locator('#lr-summary')).toHaveText('Connected. Practice is sent automatically while a game is open.');
  await expectRegions(page, ['lr-health', 'lr-sync-actions', 'lr-stop']);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('learningReporting:enrollment:v1'))).generation).toBe(generation);
  expect(JSON.parse((await records()).enrollment).generation).toBe(generation);
  expect(enrollCalls).toBe(1);
  await geometry(page, 'device-page-finished');

  // A second partial enrollment, stopped while the hint is still missing.
  await page.locator('#lr-stop-ask').tap();
  await page.locator('#lr-stop-confirm').tap();
  await expect(page.locator('#lr-stop-status')).toHaveText('Reporting stopped on this device.');
  await page.evaluate(() => sessionStorage.setItem('__failHint', '1'));
  await connect();
  await expect(page.locator('#lr-summary')).toHaveText(PARTIAL);
  expect(enrollCalls).toBe(2);
  await page.reload();
  await page.locator('#lr-stop-ask').tap();
  await page.locator('#lr-stop-confirm').tap();
  await expect(page.locator('#lr-stop-status')).toHaveText('Reporting stopped on this device.');
  await expect(page.locator('#lr-summary')).toHaveText('This device is not connected. Nothing is recorded or sent.');
  await expectRegions(page, ['lr-setup']);
  expect(Object.values(await records()).every(value => value === null)).toBe(true);
  expect(enrollCalls).toBe(2);
  await geometry(page, 'device-page-partial-stopped');
});

test('the public device page shows only the regions that apply: not set up, not connected, connected, and paused', async ({ page }) => {
  const DEVICE_SERVICE = 'http://127.0.0.1:8199';
  let serviceUrl = null;
  const profileIds = [randomUUID(), randomUUID()];
  const cors = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
  // 1. The shipped, unconfigured page: summary and a disabled form only; no health, no Send now, no Stop.
  await page.goto('/shared/learning-reporting/');
  await expect(page.locator('#lr-summary')).toHaveText('Reporting is not set up for this site.');
  await expectRegions(page, ['lr-setup']);
  await expect(page.locator('#lr-connect')).toBeDisabled();
  await expect(page.locator('#lr-code')).toBeDisabled();
  await geometry(page, 'device-page-not-set-up');

  // The synthetic service: a routed config origin and a loopback-only mock (no real service).
  await page.route('**/shared/learning-reporting/config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '${serviceUrl ?? ''}' });`,
  }));
  const syncs = [];
  await page.route(`${DEVICE_SERVICE}/**`, route => {
    const request = route.request(), origin = request.headers().origin;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(origin) });
    const body = request.postDataJSON();
    if (new URL(request.url()).pathname === '/v1/enroll') {
      return route.fulfill({ status: 200, headers: cors(origin), contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, token: `lr1_${'ab'.repeat(16)}_${randomBytes(32).toString('base64url')}`, deviceId: randomUUID(), profileIds }) });
    }
    syncs.push(body);
    return route.fulfill({ status: 200, headers: cors(origin), contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, results: body.events.map(event => ({ eventId: event.eventId, outcome: 'accepted' })) }) });
  });

  // 2. Configured but not connected: the code form works; still no health, Send now or Stop.
  serviceUrl = DEVICE_SERVICE;
  await page.reload();
  await expect(page.locator('#lr-summary')).toHaveText('This device is not connected. Nothing is recorded or sent.');
  await expectRegions(page, ['lr-setup']);
  await expect(page.locator('#lr-connect')).toBeEnabled();
  await geometry(page, 'device-page-not-connected');

  // 3. Connected with the matching origin: health and Send now shown; the form is gone; Stop is offered.
  await page.locator('#lr-code').fill('0123-4567-89ab-cdef-ghjk-mnpq-rs');
  await page.locator('#lr-connect').tap();
  await expect(page.locator('#lr-form-status')).toHaveText('Connected.');
  await expect(page.locator('#lr-summary')).toHaveText('Connected. Practice is sent automatically while a game is open.');
  await expectRegions(page, ['lr-health', 'lr-sync-actions', 'lr-stop']);
  await expect(page.locator('#lr-players')).toHaveText('Player 1, Player 2');
  await expect(page.locator('#lr-waiting')).toHaveText('0 practice events');
  await expect(page.locator('body')).not.toContainText(/Synthetic/);
  await geometry(page, 'device-page-connected');
  // Send now and the two-step Stop are usable by tap.
  await page.locator('#lr-sync-now').tap();
  await expect(page.locator('#lr-sync-now')).toBeEnabled();
  await expect(page.locator('#lr-summary')).toHaveText('Connected. Practice is sent automatically while a game is open.');
  await page.locator('#lr-stop-ask').tap();
  await expectRegions(page, ['lr-health', 'lr-sync-actions', 'lr-stop', 'lr-stop-confirm', 'lr-stop-cancel']);
  await expect(page.locator('#lr-stop-confirm')).toBeFocused();
  await geometry(page, 'device-page-stop-confirm');
  await page.locator('#lr-stop-cancel').tap();
  await expectRegions(page, ['lr-health', 'lr-sync-actions', 'lr-stop']);
  await expect(page.locator('#lr-stop-ask')).toBeVisible();

  // 4. Connected, but this site's report origin changed: health shown, Send now hidden, sending paused.
  serviceUrl = 'http://127.0.0.1:8197';
  const serviceRequests = [];
  page.on('request', request => { if (/^http:\/\/127\.0\.0\.1:(8197|8199)\//.test(request.url())) serviceRequests.push(request.url()); });
  await page.reload();
  await expect(page.locator('#lr-summary')).toHaveText('Connected, but sending is paused because this site’s report setting changed. Waiting practice is kept.');
  await expectRegions(page, ['lr-health', 'lr-stop']);
  await geometry(page, 'device-page-paused');
  // Nothing was sent to either origin from the paused page.
  const sent = syncs.length;
  await page.waitForTimeout(2500);
  expect(syncs.length).toBe(sent);
  expect(serviceRequests).toEqual([]);
});
