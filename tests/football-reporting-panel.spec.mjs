// Learning reports inside Football's Options modal (reporting-panel.js).
//
// The real Football page, the real shared/learning-sync.js and learning-outbox.js and
// real browser storage are used throughout. The report service is a loopback-only
// synthetic mock reached through Playwright routing (http://127.0.0.1:8197); the
// configuration script is routed to it, so nothing reaches a live service. Codes,
// tokens and IDs below are synthetic fixtures, never real household values.
// One test replaces LEARNING_SYNC.health with an explicitly labelled test double to
// reach states the real API cannot yet produce; it never mocks enrollment or the queue.
// Football pages are session-muted and verified by curriculum-fixture after every goto,
// before the first input; no audio API is stubbed.
//
// Layout evidence is Playwright engine emulation on the six device projects. It is not
// Apple Simulator, physical Safari, native-keyboard or real iPad receipt evidence.
import { randomUUID } from 'node:crypto';
import { test, expect } from './curriculum-fixture.mjs';
import { databaseNames, deleteOutboxDatabase, installConsent, outboxSpyScript, readOutbox } from './learning-outbox-fixture.mjs';

const PRIMARY = 'ipad-11-landscape';
const SERVICE = 'http://127.0.0.1:8197';
const OTHER_SERVICE = 'http://127.0.0.1:8196';
const BOOT = '/football/?boot=offense-call';
// Synthetic one-time code: normalizes (S.normalizeCode) to 26 valid characters.
const CODE = '0123 4567 89ab cdef ghjk mnpq rs';
// Synthetic device token in the client's accepted format.
const TOKEN = `lr1_${'ab'.repeat(16)}_${'A'.repeat(43)}`;
const COPY = {
  form: 'This game is not connected to learning reports. Nothing is recorded or sent.',
  notConfigured: 'Learning reports are not set up in this version of the game.',
  paused: 'This game’s reporting is paused. Any waiting practice is kept. Ask the grown-up who set up reports.',
  connected: 'Connected. Practice is sent automatically while the game is open. Practice from now on is reported; earlier practice stays on this device.',
  fallback: 'This game could not be connected here. Any waiting practice is kept. Ask the grown-up who set up reports.',
};
const OFFENSE = Object.freeze({
  possession: 'offense', direction: 1, quarter: 2, down: 2, yardsToGo: 8, yardLine: 30, firstDownLine: 38, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 4, drivePlays: 2,
});

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== PRIMARY, 'Reporting panel behavior checks run once on the primary target.');
}

const CORS = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
const newService = (profileIds = [randomUUID()]) => {
  const state = { serviceUrl: SERVICE, enroll: 'success', sync: 'success', requests: [], deviceId: randomUUID(), profileIds, gate: null, release: null };
  state.gate = new Promise(resolve => { state.release = resolve; });
  return state;
};
// enroll: 'success' | 'invalid' | 'network' | 'hold'; sync: 'success' | 'failure'.
async function mockService(context, state) {
  await context.route('**/shared/learning-reporting/config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: `globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '${state.serviceUrl}' });`,
  }));
  await context.route(`${SERVICE}/**`, async route => {
    const request = route.request(), origin = request.headers().origin;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS(origin) });
    const path = new URL(request.url()).pathname, body = request.postDataJSON();
    state.requests.push({ path, events: path === '/v1/sync' ? body.events.map(event => ({ eventId: event.eventId, kind: event.kind,
      profileId: event.profileId, questionInstanceId: event.questionInstanceId, correct: event.correct ?? null })) : null });
    if (path === '/v1/enroll') {
      if (state.enroll === 'hold') await state.gate;
      if (state.enroll === 'network') return route.abort('failed');
      if (state.enroll === 'invalid') return route.fulfill({ status: 400, headers: CORS(origin), contentType: 'application/json', body: '{"error":"invalid-code"}' });
      return route.fulfill({ status: 200, headers: CORS(origin), contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, token: TOKEN, deviceId: state.deviceId, profileIds: state.profileIds }) });
    }
    if (state.sync === 'failure') return route.fulfill({ status: 503, headers: CORS(origin), contentType: 'application/json', body: '{"error":"unavailable"}' });
    return route.fulfill({ status: 200, headers: CORS(origin), contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, results: body.events.map(event => ({ eventId: event.eventId, outcome: 'accepted' })) }) });
  });
}
const enrollRequests = state => state.requests.filter(request => request.path === '/v1/enroll').length;

// Every recorded event: those the service received plus those still queued.
async function allEvents(page, state) {
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  const queued = ((await readOutbox(page))?.envelope.events ?? []).map(event => ({ eventId: event.eventId, kind: event.kind,
    profileId: event.profileId, questionInstanceId: event.questionInstanceId, correct: event.correct ?? null }));
  const sent = state.requests.flatMap(request => request.events ?? []);
  return [...new Map([...sent, ...queued].map(event => [event.eventId, event])).values()];
}

// Local reporting bytes, read without creating a database.
function rawState(page) {
  return page.evaluate(async () => {
    const O = LEARNING_OUTBOX;
    const local = Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
    if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some(item => item.name === O.DB_NAME)) return { local, db: null };
    const db = await new Promise(resolve => {
      const request = indexedDB.open(O.DB_NAME);
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => { event.preventDefault(); resolve(null); };
    });
    if (!db) return { local, db: null };
    if (!db.objectStoreNames.contains(O.STORE)) { db.close(); return { local, db: { version: db.version, records: null } }; }
    const keys = [O.CONSENT_RECORD, O.OUTBOX_RECORD, O.CREDENTIAL_RECORD, O.SYNC_RECORD, O.BINDING_RECORD];
    const records = await new Promise(resolve => {
      const tx = db.transaction(O.STORE, 'readonly'), store = tx.objectStore(O.STORE);
      const reads = keys.map(key => [key, store.get(key)]);
      tx.oncomplete = () => resolve(Object.fromEntries(reads.map(([key, read]) => [key, read.result ?? null])));
    });
    db.close();
    return { local, db: { version: db.version, records } };
  });
}

// Writes the given #200 records (consent/credential/sync, by name) with no admission hint.
function putRecords(page, records) {
  return page.evaluate(async values => {
    const O = LEARNING_OUTBOX;
    const keys = { consent: O.CONSENT_RECORD, credential: O.CREDENTIAL_RECORD, sync: O.SYNC_RECORD };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(O.DB_NAME, O.DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore(O.STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(O.STORE, 'readwrite');
      for (const [name, value] of Object.entries(values)) tx.objectStore(O.STORE).put(value, keys[name]);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, records);
}
const partialRecords = (origin = SERVICE) => {
  const generation = randomUUID(), deviceId = randomUUID();
  return {
    consent: JSON.stringify({ schemaVersion: 1, generation, deviceId, profileIds: [randomUUID()] }),
    credential: JSON.stringify({ schemaVersion: 1, generation, deviceId, serviceOrigin: origin, token: TOKEN }),
    sync: JSON.stringify({ schemaVersion: 1, generation, suppressed: [], lastSuccessAt: null, notice: null }),
  };
};

const settled = page => expect.poll(() => page.evaluate(() => {
  const s = FOOTBALL_REPORTING_PANEL.snapshot();
  return s.open && s.view !== null;
})).toBe(true);
async function openReport(page) {
  await page.locator('#ov-options-report-entry').click();
  await expect(page.locator('#ov-options')).toHaveAttribute('data-view', 'report');
  await settled(page);
}
async function openStartOptions(page) {
  await page.locator('#start-options-btn').click();
  await expect(page.locator('#ov-options')).toHaveClass(/(^|\s)show(\s|$)/);
}
async function pauseGame(page) {
  await page.locator('#options-toggle').click();
  await expect(page.locator('#ov-options')).toHaveClass(/(^|\s)show(\s|$)/);
  await expect(page.locator('#ov-options-title')).toHaveText('Game Paused');
}
async function resume(page) {
  await page.locator('#ov-options-btn').click();
  await expect(page.locator('#ov-options')).not.toHaveClass(/(^|\s)show(\s|$)/);
}
async function connect(page) {
  await page.locator('#ov-report-code').fill(CODE);
  await page.locator('#ov-report-code').press('Enter');
  await expect(page.locator('#ov-report-health')).toBeVisible();
  await expect(page.locator('#ov-report-status')).toHaveText('Connected. Practice from now on is reported.');
}

// The paused game, as compared before and after reporting actions.
async function countRng(page) {
  await page.evaluate(() => {
    window.__rngCalls = { football: 0, scheduler: 0, presentation: 0 };
    const counted = (name, value) => () => { window.__rngCalls[name]++; return value; };
    window.__footballTest.setRngStreams({ football: counted('football', 0.4), scheduler: counted('scheduler', 0.25), presentation: counted('presentation', 0.5) });
  });
}
function frozen(page, { clock = true } = {}) {
  return page.evaluate(withClock => {
    const c = window.__footballTest.activeContracts();
    return {
      activePlay: c.activePlay, questionInstance: c.questionInstance, questionUi: c.questionUi, pendingResolution: c.pendingResolution,
      mode: c.render.mode, score: c.render.score, rng: { ...window.__rngCalls },
      stats: localStorage.getItem('footballMathStats:v1'), season: localStorage.getItem('footballMathSeason:v1'),
      curriculum: localStorage.getItem('math-curriculum:progress:v1'), results: window.__results.length,
      ...(withClock ? { clock: c.render.gameClock } : {}),
    };
  }, clock);
}
async function bootQuestion(page) {
  await page.goto(BOOT);
  await page.evaluate(() => {
    window.__results = [];
    window.addEventListener('football:result', event => window.__results.push(event.detail?.playId ?? null));
    window.__footballTest.setQuestionFault(null);
  });
  await countRng(page);
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), OFFENSE);
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
}
async function answer(page, kind) {
  const c = await page.evaluate(() => window.__footballTest.activeContracts()), q = c.questionInstance;
  const index = q.choices.findIndex(choice => (kind === 'correct' ? choice.id === q.correctChoiceId
    : choice.id !== q.correctChoiceId && !c.questionUi.missedChoiceIds.includes(choice.id)));
  await page.locator(`#b${index}`).click();
}
const committed = page => expect.poll(() => page.evaluate(() => window.__footballTest.activeContracts().questionUi.outcomeCommitted)).toBe(true);
async function nextQuestion(page) {
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), { ...OFFENSE, down: 1, yardsToGo: 10, firstDownLine: 40 });
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
}

test('closed is lazy; opening on a clean device only reads, creates no database and shows the code form', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  await mockService(context, service);
  await context.addInitScript(outboxSpyScript);
  await page.goto('/football/');
  const before = await rawState(page);
  await openStartOptions(page);
  await expect(page.locator('#ov-options-report-entry')).toBeVisible();
  await expect(page.locator('#ov-report')).toBeHidden();
  expect(await page.evaluate(() => FOOTBALL_REPORTING_PANEL.snapshot())).toEqual({ open: false, view: null, inFlight: null });
  await openReport(page);
  await expect(page.locator('#ov-report-summary')).toHaveText(COPY.form);
  await expect(page.locator('#ov-report-form')).toBeVisible();
  await expect(page.locator('#ov-report-finish')).toBeHidden();
  await expect(page.locator('#ov-report-health')).toBeHidden();
  await expect(page.locator('.quarter-length-picker')).toBeHidden();
  await expect(page.locator('#ov-report-back')).toBeFocused();
  const input = page.locator('#ov-report-code');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await expect(input).toHaveAttribute('autocapitalize', 'characters');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  expect(parseFloat(await input.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  expect(service.requests).toEqual([]);
  expect(await rawState(page)).toEqual(before);
  const names = await databaseNames(page);
  if (names !== null) {
    expect(names).not.toContain('learningReporting');
    expect(await page.evaluate(() => window.__idbOpens)).toBe(0);
  }
  await page.locator('#ov-report-back').click();
  await expect(page.locator('#ov-options')).toHaveAttribute('data-view', 'options');
  await expect(page.locator('.quarter-length-picker')).toBeVisible();
  await expect(page.locator('#ov-options-report-entry')).toBeFocused();
});

test('an unconfigured build is read-only and makes no reporting read or request', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = { ...newService(), serviceUrl: '' };
  await mockService(context, service);
  await context.addInitScript(outboxSpyScript);
  await page.goto('/football/');
  await openStartOptions(page);
  await openReport(page);
  await expect(page.locator('#ov-report-summary')).toHaveText(COPY.notConfigured);
  await expect(page.locator('#ov-report-form')).toBeHidden();
  expect(service.requests).toEqual([]);
  expect(await page.evaluate(() => window.__idbOpens)).toBe(0);
});

test('a code typed from the paused question connects for real, starts sending, and the game stays frozen until Resume; the unbound question records from its first answer', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  await mockService(context, service);
  await bootQuestion(page);
  const presented = await frozen(page);
  expect(presented.questionUi.support, 'precondition: no help was shown before connecting').toBe('initial');
  await pauseGame(page);
  const paused = await frozen(page);
  await openReport(page);
  // Ordinary, non-repeating typing and Enter work inside the modal.
  await page.locator('#ov-report-code').click();
  await page.locator('#ov-report-code').pressSequentially(CODE);
  await page.locator('#ov-report-code').press('Enter');
  await expect(page.locator('#ov-report-status')).toHaveText('Connected. Practice from now on is reported.');
  await expect(page.locator('#ov-report-summary')).toHaveText(COPY.connected);
  await expect(page.locator('#ov-report-code')).toHaveValue('');
  await expect(page.locator('#ov-report-players')).toHaveText('Player 1');
  await expect(page.locator('#ov-report-player-picker')).toHaveCount(0);
  expect(enrollRequests(service)).toBe(1);
  // S.enroll started the existing engine (no timer of its own here). With no
  // observation yet there is no outbox envelope, so its first pass is 'idle'
  // and sends nothing: learning-sync.js syncOnce() posts only once an envelope exists.
  await expect.poll(() => page.evaluate(() => {
    const d = LEARNING_SYNC.diagnostics();
    return d.started && d.trace.some(entry => entry.outcome === 'idle');
  }), { timeout: 10000 }).toBe(true);
  expect(service.requests.filter(request => request.path === '/v1/sync')).toEqual([]);
  expect(await frozen(page)).toEqual(paused);
  await page.locator('#ov-report-back').click();
  await resume(page);
  expect(await frozen(page, { clock: false })).toEqual((({ clock, ...rest }) => rest)(paused));
  await answer(page, 'correct');
  await committed(page);
  const events = await allEvents(page, service);
  expect(events.map(event => event.kind).sort()).toEqual(['attempt', 'resolution']);
  expect(new Set(events.map(event => event.profileId))).toEqual(new Set(service.profileIds));
  expect(new Set(events.map(event => event.questionInstanceId)).size).toBe(1);
  // The resolution nudges the same engine, which delivers exactly these events.
  const sent = () => new Set(service.requests.flatMap(request => request.events ?? []).map(event => event.eventId));
  await expect.poll(() => events.every(event => sent().has(event.eventId)), { timeout: 15000 }).toBe(true);
});

test('an observation refused before connecting keeps that question unrecorded; the next question records', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  await mockService(context, service);
  await bootQuestion(page);
  await answer(page, 'wrong');
  const retry = await frozen(page);
  expect(retry.questionUi.attempt).toBe(2);
  await pauseGame(page);
  await openReport(page);
  await connect(page);
  await resume(page);
  expect(await frozen(page, { clock: false })).toEqual((({ clock, ...rest }) => rest)(retry));
  await answer(page, 'correct');
  await committed(page);
  expect(await allEvents(page, service)).toEqual([]);
  await nextQuestion(page);
  await answer(page, 'correct');
  await committed(page);
  const events = await allEvents(page, service);
  expect(events.map(event => event.kind).sort()).toEqual(['attempt', 'resolution']);
  expect(events.every(event => event.correct !== false)).toBe(true);
});

test('several players: the subview and start pickers refresh together and a question keeps its first player', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const [P1, P2] = [randomUUID(), randomUUID()];
  const service = newService([P1, P2]);
  await mockService(context, service);
  await bootQuestion(page);
  expect((await frozen(page)).questionUi.support, 'precondition: no help was shown before connecting').toBe('initial');
  await pauseGame(page);
  await openReport(page);
  await connect(page);
  await expect(page.locator('#ov-report-players')).toHaveText('Player 1, Player 2');
  const sub = page.locator('#ov-report-player-picker');
  await expect(sub).toBeVisible();
  await expect(sub.locator('input[type="radio"]')).toHaveCount(2);
  await expect(page.locator('#ov-report-player-picker-status')).toHaveText('Choose who is playing so practice is reported for the right player.');
  const checked = () => page.evaluate(() => ({
    sub: document.querySelector('#ov-report-player-picker input:checked')?.value ?? null,
    start: document.querySelector('#player-picker input:checked')?.value ?? null,
    names: [...new Set([...document.querySelectorAll('#ov-report-player-picker input, #player-picker input')].map(input => input.name))].sort(),
  }));
  await sub.locator('label', { hasText: 'Player 1' }).click();
  expect(await checked()).toEqual({ sub: P1, start: P1, names: ['ov-report-player-picker-choice', 'player-picker-choice'] });
  await expect(page.locator('#ov-report-player-picker-status')).toHaveText('New questions are reported for this player.');
  await resume(page);
  await answer(page, 'wrong');
  await pauseGame(page);
  await openReport(page);
  await page.locator('#ov-report-player-picker label', { hasText: 'Player 2' }).click();
  expect((await checked()).start).toBe(P2);
  await resume(page);
  await answer(page, 'correct');
  await committed(page);
  await nextQuestion(page);
  await answer(page, 'correct');
  await committed(page);
  const events = await allEvents(page, service);
  const byQuestion = Map.groupBy ? Map.groupBy(events, event => event.questionInstanceId)
    : events.reduce((map, event) => map.set(event.questionInstanceId, [...(map.get(event.questionInstanceId) || []), event]), new Map());
  expect(byQuestion.size).toBe(2);
  const first = [...byQuestion.values()].find(list => list.some(event => event.correct === false));
  const second = [...byQuestion.values()].find(list => list !== first);
  expect(new Set(first.map(event => event.profileId))).toEqual(new Set([P1]));
  expect(new Set(second.map(event => event.profileId))).toEqual(new Set([P2]));
});

test('curated errors keep the form, spend no code on a bad format, and never recommend Stop', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  await mockService(context, service);
  await page.goto('/football/');
  await openStartOptions(page);
  await openReport(page);
  await page.locator('#ov-report-code').fill('ABC');
  await page.locator('#ov-report-connect').click();
  await expect(page.locator('#ov-report-form-status')).toHaveText('That code is not complete. Codes have 26 letters and numbers.');
  expect(enrollRequests(service)).toBe(0);
  service.enroll = 'invalid';
  await page.locator('#ov-report-code').fill(CODE);
  await page.locator('#ov-report-connect').click();
  await expect(page.locator('#ov-report-form-status')).toHaveText('That code did not work. It may have expired or already been used. Ask for a new code.');
  service.enroll = 'network';
  await page.locator('#ov-report-connect').click();
  await expect(page.locator('#ov-report-form-status')).toHaveText('The report service could not be reached. Check the internet connection and try again.');
  await expect(page.locator('#ov-report-form')).toBeVisible();
  await expect(page.locator('#ov-report-health')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem(LEARNING_OUTBOX.ENROLLMENT_KEY))).toBeNull();
  for (const text of await page.locator('#ov-report').allTextContents()) expect(text).not.toMatch(/stop/i);
});

// Real engine and queue. Send now is measured only after the engine's own nudge has
// failed and backed off, so the measured click is the only pass in flight.
test('Send now says sent only for queued practice the service acknowledged; a failed service changes nothing', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  service.sync = 'failure';
  await mockService(context, service);
  await bootQuestion(page);
  await pauseGame(page);
  await openReport(page);
  await connect(page);
  await page.locator('#ov-report-back').click();
  await resume(page);
  await answer(page, 'correct');
  await committed(page);
  const queued = (await allEvents(page, service)).map(event => event.eventId);
  expect(queued).toHaveLength(2);
  const backedOff = () => expect.poll(() => page.evaluate(() => {
    const d = LEARNING_SYNC.diagnostics();
    return !d.running && d.backoff > 0 && d.dueAt - Date.now() > 10000;
  }), { timeout: 15000 }).toBe(true);
  await backedOff();
  await pauseGame(page);
  await openReport(page);
  await expect(page.locator('#ov-report-waiting')).toHaveText('2 practice events');
  await expect(page.locator('#ov-report-last')).toHaveText('Not yet');
  await page.locator('#ov-report-send').click();
  await expect(page.locator('#ov-report-send-status')).toHaveText('Nothing new was confirmed. Any waiting practice is kept and will be tried again.');
  await expect(page.locator('#ov-report-last')).toHaveText('Not yet');
  await expect(page.locator('#ov-report-waiting')).toHaveText('2 practice events');
  await backedOff();
  service.sync = 'success';
  await page.locator('#ov-report-send').click();
  await expect(page.locator('#ov-report-send-status')).toHaveText('Sent 2 practice events to the report service. 0 practice events still waiting.');
  await expect(page.locator('#ov-report-last')).not.toHaveText('Not yet');
  await expect(page.locator('#ov-report-waiting')).toHaveText('0 practice events');
  const accepted = new Set(service.requests.flatMap(request => request.events ?? []).map(event => event.eventId));
  expect(queued.every(id => accepted.has(id))).toBe(true);
});

test('a submitted code is never repeated; closing and Resume while it runs change no game state, focus or view, and it still completes', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  service.enroll = 'hold';
  await mockService(context, service);
  await bootQuestion(page);
  await pauseGame(page);
  const paused = await frozen(page);
  await openReport(page);
  await page.locator('#ov-report-code').fill(CODE);
  await page.locator('#ov-report-connect').click();
  await expect(page.locator('#ov-report-connect')).toBeDisabled();
  await expect(page.locator('#ov-report-connect')).toHaveText('Connecting…');
  await page.locator('#ov-report-code').press('Enter');
  await expect.poll(() => enrollRequests(service)).toBe(1);
  await page.locator('#ov-report-back').click();
  await expect(page.locator('#ov-options')).toHaveAttribute('data-view', 'options');
  await openReport(page);
  await expect(page.locator('#ov-report-status')).toHaveText('Still connecting this game…');
  await expect(page.locator('#ov-report-code')).toHaveValue('');
  await expect(page.locator('#ov-report-connect')).toBeDisabled();
  expect(await page.evaluate(() => FOOTBALL_REPORTING_PANEL.snapshot().inFlight)).toBe('connect');
  await resume(page);
  const resumed = await frozen(page, { clock: false });
  service.release();
  await expect.poll(() => page.evaluate(() => localStorage.getItem(LEARNING_OUTBOX.ENROLLMENT_KEY) !== null)).toBe(true);
  await expect.poll(() => page.evaluate(() => FOOTBALL_REPORTING_PANEL.snapshot().inFlight)).toBe(null);
  await expect(page.locator('#ov-options')).not.toHaveClass(/(^|\s)show(\s|$)/);
  await expect(page.locator('#ov-options')).toHaveAttribute('data-view', 'options');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#ov-options')))).toBe(false);
  expect(await frozen(page, { clock: false })).toEqual(resumed);
  expect((({ clock, ...rest }) => rest)(paused)).toEqual(resumed);
  expect(enrollRequests(service)).toBe(1);
  await pauseGame(page);
  await openReport(page);
  await expect(page.locator('#ov-report-summary')).toHaveText(COPY.connected);
});

test('a background pause keeps the report view and typed code; explicit exits and fresh entries reset them', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  await mockService(context, newService());
  await bootQuestion(page);
  await pauseGame(page);
  await openReport(page);
  await page.locator('#ov-report-code').fill('ABCD');
  expect(await page.evaluate(() => window.__footballTest.interrupt('background'))).toBe(true);
  await expect(page.locator('#ov-options-sub')).toContainText('background');
  await expect(page.locator('#ov-options')).toHaveAttribute('data-view', 'report');
  await expect(page.locator('#ov-report-code')).toHaveValue('ABCD');
  await resume(page);
  await pauseGame(page);
  await expect(page.locator('#ov-options')).toHaveAttribute('data-view', 'options');
  await openReport(page);
  await expect(page.locator('#ov-report-code')).toHaveValue('');
  await page.locator('#ov-report-code').fill('WXYZ');
  await page.locator('#ov-report-back').click();
  await openReport(page);
  await expect(page.locator('#ov-report-code')).toHaveValue('');
});

test('worked explanation, pending Continue and a deferred automatic advance stay paused while reports are open and advance once after Resume', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  await mockService(context, newService());
  await bootQuestion(page);
  await answer(page, 'wrong');
  await answer(page, 'wrong');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  const explanation = await frozen(page);
  expect(explanation.questionUi.continueRequired).toBe(true);
  await pauseGame(page);
  await openReport(page);
  await connect(page);
  await page.locator('#ov-report-back').click();
  await resume(page);
  expect(await frozen(page, { clock: false })).toEqual((({ clock, ...rest }) => rest)(explanation));
  await page.locator('#question-learn-why').click();
  await page.locator('#question-continue').click();
  await committed(page);
  expect(await page.evaluate(() => window.__results.length)).toBe(1);

  await nextQuestion(page);
  await answer(page, 'correct');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await pauseGame(page);
  await openReport(page);
  const held = await frozen(page);
  await page.waitForTimeout(2500);
  expect(await frozen(page)).toEqual(held);
  await page.locator('#ov-report-back').click();
  await resume(page);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 10000 });
  expect(await page.evaluate(() => window.__results.length)).toBe(2);
});

test('protected and unrecognized local states stay read-only with bytes unchanged; only a verified partial offers Finish', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  const service = newService();
  await mockService(context, service);
  await page.goto('/football/');
  const reset = async () => {
    await page.evaluate(() => localStorage.clear());
    expect(await deleteOutboxDatabase(page)).toBe('deleted');
  };
  const cases = [
    { name: 'malformed hint', setup: () => page.evaluate(() => localStorage.setItem(LEARNING_OUTBOX.ENROLLMENT_KEY, '{')) },
    { name: 'future hint', setup: () => page.evaluate(() => localStorage.setItem(LEARNING_OUTBOX.ENROLLMENT_KEY,
      JSON.stringify({ schemaVersion: 2, generation: crypto.randomUUID(), deviceId: crypto.randomUUID(), profileIds: [crypto.randomUUID()], activeProfileId: null }))) },
    { name: 'consent without credential', setup: () => installConsent(page, { generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()] }) },
    { name: 'unrecognized records', setup: () => putRecords(page, { consent: 'not json' }) },
    { name: 'partial for another service', setup: () => putRecords(page, partialRecords(OTHER_SERVICE)) },
  ];
  for (const item of cases) {
    await reset();
    await item.setup();
    await openStartOptions(page);
    const before = await rawState(page);
    await openReport(page);
    await expect(page.locator('#ov-report-summary'), item.name).toHaveText(COPY.paused);
    await expect(page.locator('#ov-report-form'), item.name).toBeHidden();
    await expect(page.locator('#ov-report-finish'), item.name).toBeHidden();
    await expect(page.locator('#ov-report-health'), item.name).toBeHidden();
    expect(await rawState(page), item.name).toEqual(before);
    await page.locator('#ov-report-back').click();
    await page.locator('#ov-options-btn').click();
  }
  expect(service.requests).toEqual([]);

  // A legacy local outbox (real API, no double) may first reach the form, because the
  // panel never reads raw records. The authoritative enroll refuses before any request;
  // the resulting view is read-only for the rest of this document.
  await reset();
  await page.evaluate(() => localStorage.setItem(LEARNING_OUTBOX.LEGACY_OUTBOX_KEY, '{"synthetic":"legacy"}'));
  await openStartOptions(page);
  const legacy = await rawState(page);
  await openReport(page);
  await expect(page.locator('#ov-report-form')).toBeVisible();
  await page.locator('#ov-report-code').fill(CODE);
  await page.locator('#ov-report-connect').click();
  await expect(page.locator('#ov-report-status')).toHaveText(COPY.fallback);
  const readOnly = async label => {
    await expect(page.locator('#ov-report-summary'), label).toHaveText(COPY.paused);
    await expect(page.locator('#ov-report-form'), label).toBeHidden();
    await expect(page.locator('#ov-report-finish'), label).toBeHidden();
    await expect(page.locator('#ov-report-health'), label).toBeHidden();
    await expect(page.locator('#ov-report-code'), label).toHaveValue('');
  };
  await readOnly('after the refusal');
  // Back and reopen, a fresh Options entry, and a visibility reread keep it read-only.
  await page.locator('#ov-report-back').click();
  await openReport(page);
  await readOnly('reopened');
  await page.locator('#ov-report-back').click();
  await page.locator('#ov-options-btn').click();
  await openStartOptions(page);
  await openReport(page);
  await readOnly('fresh Options entry');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await settled(page);
  await readOnly('visibility reread');
  expect(enrollRequests(service)).toBe(0);
  expect(service.requests).toEqual([]);
  expect(await rawState(page)).toEqual(legacy);
  await page.locator('#ov-report-back').click();
  await page.locator('#ov-options-btn').click();

  // A verified partial for this service: Finish only, no code spent.
  await reset();
  await putRecords(page, partialRecords(SERVICE));
  await openStartOptions(page);
  await openReport(page);
  await expect(page.locator('#ov-report-finish')).toBeVisible();
  await expect(page.locator('#ov-report-form')).toBeHidden();
  await page.locator('#ov-report-finish-btn').click();
  await expect(page.locator('#ov-report-status')).toHaveText('Connected. Practice from now on is reported.');
  await expect(page.locator('#ov-report-health')).toBeVisible();
  expect(enrollRequests(service)).toBe(0);
});

test('a future or unrecognized health state from the API stays read-only (labelled test double for health only)', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  await mockService(context, newService());
  // TEST DOUBLE: wraps only health/partialEnrollment of the real frozen LEARNING_SYNC to
  // return states the current API does not produce; enroll/finish/sync calls are counted.
  await context.addInitScript(() => {
    let wrapped;
    window.__double = { health: { state: 'sync-something-new', configured: true }, partial: { state: 'none' }, calls: [] };
    Object.defineProperty(globalThis, 'LEARNING_SYNC', {
      configurable: true,
      get: () => wrapped,
      set: real => {
        wrapped = Object.freeze({ ...real,
          health: async () => ({ ...window.__double.health }),
          partialEnrollment: async () => { window.__double.calls.push('partial'); return { ...window.__double.partial }; },
          enroll: async () => { window.__double.calls.push('enroll'); return { ok: false, reason: 'double' }; },
          finishEnrollment: async () => { window.__double.calls.push('finish'); return { ok: false, reason: 'double' }; },
          syncNow: async () => { window.__double.calls.push('sync'); window.__double.onSync?.(); } });
      },
    });
  });
  await page.goto('/football/');
  await openStartOptions(page);
  for (const [health, partial] of [
    [{ state: 'sync-something-new', configured: true }, { state: 'none' }],
    [{ state: 'credential-future', configured: true }, { state: 'none' }],
    [{ state: 'no-consent', configured: true }, { state: 'none' }],
    [{ state: 'disabled', configured: true }, { state: 'something-new' }],
    [{ state: 'disabled', configured: true }, { state: 'partial', originMatches: false }],
  ]) {
    await page.evaluate(([h, p]) => { window.__double.health = h; window.__double.partial = p; }, [health, partial]);
    await openReport(page);
    await expect(page.locator('#ov-report-summary'), health.state).toHaveText(COPY.paused);
    await expect(page.locator('#ov-report-form')).toBeHidden();
    await expect(page.locator('#ov-report-finish')).toBeHidden();
    await page.locator('#ov-report-back').click();
  }
  expect((await page.evaluate(() => window.__double.calls)).filter(call => call !== 'partial')).toEqual([]);

  // Status-only contact (CF1). learning-sync.js posts `events: []` when only the
  // in-memory status changed, and a success still sets lastSuccessAt. The real engine
  // decides that from memory and its own timers, so the double reproduces the exact
  // health change: a successful contact, nothing waiting before or after.
  const contact = (lastSuccessAt, waiting = 0, held = 0) => ({ state: 'ok', configured: true, profiles: 1, waiting, held,
    lastSuccessAt, notice: null, droppedLocal: 0, writeFailures: 0, originMatches: true });
  await page.evaluate(health => {
    window.__double.health = health;
    window.__double.next = { ...health, lastSuccessAt: '2026-11-23T12:05:00.000Z' };
  }, contact('2026-11-23T12:00:00.000Z'));
  await page.evaluate(() => {
    // TEST DOUBLE (continued): this syncNow only advances the doubled health.
    window.__double.onSync = () => { window.__double.health = window.__double.next; };
  });
  await openReport(page);
  await expect(page.locator('#ov-report-summary')).toHaveText(COPY.connected);
  await page.locator('#ov-report-send').click();
  await expect(page.locator('#ov-report-send-status')).toHaveText('The report service was reached, but no waiting practice was sent. 0 practice events still waiting.');
  await expect(page.locator('#ov-report-send-status')).not.toHaveText(/^Sent/);
  // Practice the service held back is not counted as sent.
  await page.evaluate(([health, next]) => { window.__double.health = health; window.__double.next = next; },
    [contact('2026-11-23T12:05:00.000Z', 2, 0), contact('2026-11-23T12:10:00.000Z', 0, 2)]);
  await page.locator('#ov-report-back').click();
  await openReport(page);
  await page.locator('#ov-report-send').click();
  await expect(page.locator('#ov-report-send-status')).toHaveText('The report service was reached, but no waiting practice was sent. 0 practice events still waiting.');
});

// Six-project layout evidence by tap: start Options and each report view state.
test('Options and learning-report views fit with 44px controls and no horizontal overflow', async ({ page, context }, testInfo) => {
  const service = newService();
  await mockService(context, service);
  await page.goto('/football/');
  const evidence = [];
  const capture = async label => {
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('#ov-options .overlay-card');
      const visible = element => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
      const target = element => (element.matches('input[type="radio"]') && element.closest('label')) || element;
      const controls = [...card.querySelectorAll('button, input')].filter(visible).map(element => {
        const box = target(element).getBoundingClientRect();
        return { id: element.id || element.name || element.tagName, width: box.width, height: box.height, right: box.right,
          fontSize: element.matches('input[type="text"]') ? parseFloat(getComputedStyle(element).fontSize) : null };
      });
      return { viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height },
        devicePixelRatio, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
        documentOverflow: document.documentElement.scrollWidth - innerWidth, cardOverflow: card.scrollWidth - card.clientWidth, controls };
    });
    const path = testInfo.outputPath(`reporting-${label}.png`);
    await page.screenshot({ path });
    await testInfo.attach(`reporting-${label}`, { path, contentType: 'image/png' });
    evidence.push({ label, ...metrics });
    expect(metrics.documentOverflow, label).toBeLessThanOrEqual(0);
    expect(metrics.cardOverflow, label).toBeLessThanOrEqual(1);
    for (const control of metrics.controls) {
      expect(control.height, `${label} ${control.id} height`).toBeGreaterThanOrEqual(44);
      expect(control.width, `${label} ${control.id} width`).toBeGreaterThanOrEqual(44);
      expect(control.right, `${label} ${control.id} right edge`).toBeLessThanOrEqual(metrics.viewport.width);
      if (control.fontSize !== null) expect(control.fontSize, `${label} ${control.id} font`).toBeGreaterThanOrEqual(16);
    }
  };
  // Locally refused connection (synthetic legacy record): read-only for this document,
  // so it is captured first and the page is then reloaded without the record.
  await page.evaluate(() => localStorage.setItem(LEARNING_OUTBOX.LEGACY_OUTBOX_KEY, '{"synthetic":"legacy"}'));
  await page.locator('#start-options-btn').tap();
  await page.locator('#ov-options-report-entry').tap();
  await settled(page);
  await page.locator('#ov-report-code').tap();
  await page.locator('#ov-report-code').fill(CODE);
  await page.locator('#ov-report-connect').tap();
  await expect(page.locator('#ov-report-status')).toHaveText(COPY.fallback);
  await expect(page.locator('#ov-report-form')).toBeHidden();
  await capture('report-refused-locally');
  expect(service.requests).toEqual([]);
  await page.evaluate(() => localStorage.removeItem(LEARNING_OUTBOX.LEGACY_OUTBOX_KEY));
  await page.goto('/football/');
  await page.locator('#start-options-btn').tap();
  await expect(page.locator('#ov-options')).toHaveClass(/(^|\s)show(\s|$)/);
  await capture('options-collapsed');
  await page.locator('#ov-options-report-entry').tap();
  await settled(page);
  await expect(page.locator('#ov-report-form')).toBeVisible();
  await capture('report-unconnected');
  service.enroll = 'invalid';
  await page.locator('#ov-report-code').tap();
  await page.locator('#ov-report-code').fill(CODE);
  await page.locator('#ov-report-connect').tap();
  await expect(page.locator('#ov-report-form-status')).toContainText('did not work');
  await capture('report-error');
  service.enroll = 'success';
  await page.locator('#ov-report-connect').tap();
  await expect(page.locator('#ov-report-health')).toBeVisible();
  await capture('report-connected');
  // A malformed admission hint makes the view read-only (protected).
  await page.locator('#ov-report-back').tap();
  await page.evaluate(() => localStorage.setItem(LEARNING_OUTBOX.ENROLLMENT_KEY, '{'));
  await page.locator('#ov-options-report-entry').tap();
  await settled(page);
  await expect(page.locator('#ov-report-summary')).toHaveText(COPY.paused);
  await capture('report-protected');
  await testInfo.attach('reporting-geometry.json', { body: JSON.stringify({ project: testInfo.project.name, evidence }, null, 2), contentType: 'application/json' });
});
