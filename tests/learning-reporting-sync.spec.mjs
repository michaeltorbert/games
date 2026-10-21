// #200 real client transport against a loopback-only mock service. Pages get the service
// origin by routing shared/learning-reporting/config.js; the shipped config stays empty.
// The mock answers at http://127.0.0.1:8199 only, through Playwright routing; nothing
// leaves the machine. Football pages are session-muted and verified by
// curriculum-fixture before any input; Number facts plays no audio.
import { randomUUID, randomBytes } from 'node:crypto';
import { test, expect } from './curriculum-fixture.mjs';
import { deleteOutboxDatabase, installConsent, outboxSpyScript, readOutbox } from './learning-outbox-fixture.mjs';

const SERVICE = 'http://127.0.0.1:8199';
const BOOT = '/football/?boot=offense-call';
const FACTS_KEY = 'place-value-practice:facts:v1';
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ISO_TIMES = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
const TIMED = /"(\w*(?:Ms|At))":(-?\d+(?:\.\d+)?|"[^"]*"|null)/g;
const mask = value => JSON.parse(JSON.stringify(value).replace(UUIDS, '<uuid>').replace(ISO_TIMES, '<time>').replace(TIMED, '"$1":"<timed>"'));

test.beforeAll(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Transport and attribution checks run once on the primary target.');
});

const CORS = origin => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' });
// mode: 'success' | 'failure' | 'hung' | 'revoked' | 'invalid'
// `source` is a state object, or a function returning the current one (several runs).
async function mockService(context, source) {
  const current = typeof source === 'function' ? source : () => source;
  await context.route('**/shared/learning-reporting/config.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: `globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '${SERVICE}' });`,
  }));
  await context.route(`${SERVICE}/**`, async route => {
    const state = current();
    const request = route.request(), origin = request.headers().origin;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS(origin) });
    const path = new URL(request.url()).pathname, body = request.postDataJSON();
    state.requests.push({ path, body, authorization: request.headers().authorization ?? null, cookie: request.headers().cookie ?? null, origin });
    if (path === '/v1/enroll') {
      state.token = `lr1_${'ab'.repeat(16)}_${randomBytes(32).toString('base64url')}`;
      return route.fulfill({ status: 200, headers: CORS(origin), contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, token: state.token, deviceId: state.deviceId, profileIds: state.profileIds }) });
    }
    if (state.mode === 'hung') return new Promise(() => {});
    if (state.mode === 'failure') return route.fulfill({ status: 503, headers: CORS(origin), contentType: 'application/json', body: '{"error":"unavailable"}' });
    if (state.mode === 'revoked') return route.fulfill({ status: 403, headers: CORS(origin), contentType: 'application/json', body: '{"error":"revoked"}' });
    if (state.mode === 'invalid') return route.fulfill({ status: 401, headers: CORS(origin), contentType: 'application/json', body: '{"error":"invalid-credential"}' });
    for (const event of body.events) state.accepted.add(event.eventId);
    return route.fulfill({ status: 200, headers: CORS(origin), contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, results: body.events.map(event => ({ eventId: event.eventId, outcome: 'accepted' })) }) });
  });
}
const newState = (profileIds = [randomUUID()]) => ({ mode: 'success', requests: [], accepted: new Set(), deviceId: randomUUID(), profileIds, token: null });

// Real enrollment through the public device page.
async function enrollThroughPage(page) {
  await page.goto('/shared/learning-reporting/');
  await expect(page.locator('#lr-setup')).toBeVisible();
  await page.locator('#lr-code').fill('0123-4567-89ab-cdef-ghjk-mnpq-rs');
  await page.locator('#lr-connect').click();
  await expect(page.locator('#lr-form-status')).toHaveText('Connected.');
  await expect(page.locator('#lr-health')).toBeVisible();
}

const OFFENSE = Object.freeze({
  possession: 'offense', direction: 1, quarter: 2, down: 2, yardsToGo: 8, yardLine: 30, firstDownLine: 38, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 4, drivePlays: 2,
});
const DEFENSE = Object.freeze({
  possession: 'defense', direction: -1, quarter: 3, down: 2, yardsToGo: 10, yardLine: 70, firstDownLine: 60, driveStart: 80,
  scores: { player: 14, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 9, drivePlays: 2,
});
const SCRIPT = Object.freeze([
  { seed: OFFENSE, call: 0, answers: ['correct'] },
  { seed: { ...OFFENSE, down: 1, yardsToGo: 10, firstDownLine: 40 }, call: 2, answers: ['wrong', 'correct'] },
  { seed: DEFENSE, call: 1, answers: ['wrong', 'wrong'] },
]);
const contracts = page => page.evaluate(() => window.__footballTest.activeContracts());
const mode = page => page.evaluate(() => JSON.parse(render_game_to_text()).mode);
async function seedRng(page, seed) {
  await page.evaluate(root => {
    const make = start => { let value = start >>> 0; return () => { value = (value + 0x6d2b79f5) >>> 0; let m = value; m = Math.imul(m ^ (m >>> 15), m | 1); m ^= m + Math.imul(m ^ (m >>> 7), m | 61); return ((m ^ (m >>> 14)) >>> 0) / 0x100000000; }; };
    const log = window.__rngLog = { football: [], scheduler: [], presentation: [] };
    const logged = (name, next) => () => { const value = next(); log[name].push(value); return value; };
    window.__footballTest.setRngStreams({ football: logged('football', make(root + 1)), scheduler: logged('scheduler', make(root + 2)), presentation: logged('presentation', make(root + 3)) });
  }, seed);
}
async function answer(page, kind) {
  const c = await contracts(page), q = c.questionInstance;
  const index = q.choices.findIndex(choice => (kind === 'correct' ? choice.id === q.correctChoiceId : choice.id !== q.correctChoiceId && !c.questionUi.missedChoiceIds.includes(choice.id)));
  await page.locator(`#b${index}`).click();
}
async function playStep(page, step) {
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), step.seed);
  await page.locator('#call-grid .call-btn').nth(step.call).click();
  await expect.poll(() => mode(page)).toMatch(/^(question|feedback)$/);
  const presented = await contracts(page);
  if ((await mode(page)) === 'question') {
    for (const kind of step.answers) await answer(page, kind);
    if (step.answers[1] === 'wrong') { await page.locator('#question-learn-why').click(); await page.locator('#question-continue').click(); }
  }
  await expect.poll(async () => (await contracts(page)).questionUi.outcomeCommitted).toBe(true);
  const c = await contracts(page);
  // A sync starts after every play and is never awaited by play.
  await page.evaluate(() => { if (typeof LEARNING_SYNC !== 'undefined') LEARNING_SYNC.syncNow(); });
  return { family: presented.questionInstance?.familyId ?? null, policy: c.pendingResolution?.policy ?? null, proposal: c.activePlay.proposal, score: c.render.score, yard: c.render.absoluteYard };
}
async function playFootball(page, context, state, { enrolled, offline = false }) {
  await page.goto('/football/');
  await page.evaluate(() => localStorage.clear());
  expect(await deleteOutboxDatabase(page)).toBe('deleted');
  if (enrolled) await enrollThroughPage(page);
  await page.goto(BOOT);
  if (offline) await context.setOffline(true);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await seedRng(page, 0x2000c0de);
  const steps = [];
  for (const step of SCRIPT) steps.push(await playStep(page, step));
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  const result = await page.evaluate(() => ({ rng: window.__rngLog, stats: localStorage.getItem('footballMathStats:v1') }));
  // Observed while still offline: the client's 'online' listener syncs as soon as the
  // network returns, so anything after setOffline(false) belongs to the reconnect phase.
  let duringOffline = null;
  if (offline) {
    duringOffline = { requests: state.requests.map(request => request.path), outbox: await readOutbox(page) };
    await context.setOffline(false);
  }
  return { ...result, steps, state, duringOffline };
}

test('seeded Football play is identical with no enrollment and with upload succeeding, failing, offline and hung; only acknowledged events leave the outbox', async ({ page, context }) => {
  let current = newState();
  await mockService(context, () => current);
  const run = async ({ serviceMode = 'success', ...options }) => {
    current = newState();
    current.mode = serviceMode;
    return playFootball(page, context, current, options);
  };
  const off = await run({ enrolled: false });
  const success = await run({ enrolled: true });
  // Drain: a sync already in flight makes syncNow return at once, so poll until the queue empties.
  await expect.poll(async () => { await page.evaluate(() => LEARNING_SYNC.syncNow()); return (await readOutbox(page)).envelope.events.length; }).toBe(0);
  const successOutbox = await readOutbox(page);
  const failure = await run({ enrolled: true, serviceMode: 'failure' });
  await page.evaluate(() => LEARNING_SYNC.syncNow());
  const failureOutbox = await readOutbox(page);
  const offline = await run({ enrolled: true, offline: true });
  const offlineOutbox = offline.duringOffline.outbox;
  // Back online: exactly the events queued offline are uploaded and acknowledged, then removed.
  const queuedOffline = offlineOutbox.envelope.events.map(event => event.eventId);
  await expect.poll(async () => { await page.evaluate(() => LEARNING_SYNC.syncNow()); return (await readOutbox(page)).envelope.events.length; }).toBe(0);
  expect(queuedOffline.every(id => offline.state.accepted.has(id))).toBe(true);
  expect([...offline.state.accepted].every(id => queuedOffline.includes(id))).toBe(true);
  const reconnectSyncs = offline.state.requests.filter(request => request.path === '/v1/sync');
  expect(reconnectSyncs.length).toBeGreaterThan(0);
  expect(reconnectSyncs.every(request => request.authorization === `Bearer ${offline.state.token}` && request.cookie === null)).toBe(true);
  const hung = await run({ enrolled: true, serviceMode: 'hung' });
  const hungOutbox = await readOutbox(page);

  expect(off.state.requests).toEqual([]);
  for (const result of [success, failure, offline, hung]) {
    expect(result.rng).toEqual(off.rng);
    expect(mask(result.steps)).toEqual(mask(off.steps));
    expect(mask(JSON.parse(result.stats))).toEqual(mask(JSON.parse(off.stats)));
  }
  // Success: every stored event was acknowledged and removed; the credential travelled only in the header.
  expect(successOutbox.envelope.events).toEqual([]);
  const syncs = success.state.requests.filter(request => request.path === '/v1/sync');
  expect(syncs.length).toBeGreaterThan(0);
  expect(syncs.every(request => request.authorization === `Bearer ${success.state.token}` && request.cookie === null && request.origin === 'http://127.0.0.1:8090')).toBe(true);
  expect(success.state.accepted.size).toBeGreaterThan(5);
  // Failure, offline and hung: nothing removed.
  for (const outbox of [failureOutbox, offlineOutbox, hungOutbox]) expect(outbox.envelope.events.length).toBeGreaterThan(5);
  expect(failure.state.requests.filter(request => request.path === '/v1/sync').length).toBeGreaterThan(0);
  // While offline: only the enrollment exchange (made before going offline), no upload.
  expect(offline.duringOffline.requests).toEqual(['/v1/enroll']);
});

test('a proven revocation clears the outbox and enrollment; an unrecognized credential keeps everything and says so', async ({ page, context }) => {
  const state = newState();
  await mockService(context, state);
  await enrollThroughPage(page);
  await page.goto(BOOT);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await seedRng(page, 0x3000c0de);
  state.mode = 'invalid';
  await playStep(page, SCRIPT[0]);
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  // A sync may already be in flight (then syncNow returns at once): poll for the persisted notice.
  await expect.poll(async () => { await page.evaluate(() => LEARNING_SYNC.syncNow()); return (await page.evaluate(() => LEARNING_SYNC.health())).notice; })
    .toBe('credential-not-recognized');
  const kept = await readOutbox(page);
  expect(kept.envelope.events.length).toBeGreaterThan(0);
  await page.goto('/shared/learning-reporting/');
  await expect(page.locator('#lr-summary')).toContainText('did not recognize this device');
  state.mode = 'revoked';
  await page.locator('#lr-sync-now').click();
  await expect(page.locator('#lr-setup')).toBeVisible();
  expect(await readOutbox(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem(LEARNING_OUTBOX.ENROLLMENT_KEY))).toBeNull();
});

test('the shipped config keeps reporting off: no picker, no timer-driven request, the device page says it is not set up', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  await page.goto('/shared/learning-reporting/');
  await expect(page.locator('#lr-summary')).toHaveText('Reporting is not set up for this site.');
  await expect(page.locator('#lr-connect')).toBeDisabled();
  const enrollment = { generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID(), randomUUID()] };
  await installConsent(page, enrollment);
  await page.goto('/football/');
  await expect(page.locator('#player-picker')).toHaveCount(0);
  expect(await page.evaluate(() => LEARNING_SYNC.diagnostics().started)).toBe(false);
  expect(await page.evaluate(() => LEARNING_SYNC.serviceOrigin())).toBeNull();
  expect(await page.evaluate(key => sessionStorage.getItem(key), 'learningReporting:player:v1')).toBeNull();
  // Give a would-be first sync (2 s after load) time to appear, then classify all traffic.
  await page.waitForTimeout(2500);
  await test.info().attach('default-off-requests.json', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' });
  // Reporting traffic: any non-GET, anything to the service or a /v1/ route, anything not a page asset.
  expect(requests.filter(request => request.method !== 'GET')).toEqual([]);
  expect(requests.filter(request => request.url.startsWith(SERVICE) || new URL(request.url).pathname.startsWith('/v1/'))).toEqual([]);
  // The only other hosts are the existing web-font hosts these pages already declare in markup.
  const declared = await page.evaluate(() => [...document.querySelectorAll('link[href^="https://"]')].map(link => new URL(link.href).host));
  expect(declared).toContain('fonts.googleapis.com');
  const foreign = [...new Set(requests.map(request => new URL(request.url).host).filter(host => host !== '127.0.0.1:8090'))].sort();
  expect(foreign.every(host => host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com'), JSON.stringify(foreign)).toBe(true);
});

async function openFacts(page) {
  await page.goto('/place-value-practice/');
  await expect(page.locator('#fact-practice')).toBeVisible();
  await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
}
async function enter(page, kind) {
  await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
  const value = await page.evaluate(() => PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
  await page.locator('.facts-keypad').getByRole('button', { name: 'Clear', exact: true }).click();
  for (const digit of String(kind === 'correct' ? value : (value + 1) % 19)) await page.locator('.facts-keypad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('#facts-check').click();
  await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
}
const factsEvents = async page => ((await readOutbox(page))?.envelope.events ?? []).filter(event => event.game === 'facts');

for (const locks of [true, false]) {
  test(`Number facts who-is-practicing${locks ? '' : ' without Web Locks'}: no choice records nothing; a mid-question change waits; a reload keeps the question's player`, async ({ page, context }) => {
    if (!locks) await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'locks', { configurable: true, get: () => undefined }));
    await context.addInitScript(() => { localStorage.setItem('place-value-practice:mode:v1', 'arithmetic'); localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts'); });
    const [p1, p2] = [randomUUID(), randomUUID()];
    const state = newState([p1, p2]);
    state.mode = 'hung';
    await mockService(context, state);
    await enrollThroughPage(page);
    await openFacts(page);
    const picker = page.locator('#facts-player');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('radio')).toHaveCount(2);
    await expect(picker).toContainText('Player 1');
    await expect(picker).not.toContainText(/Synthetic|label/i);
    await expect(page.locator('#facts-player-status')).toContainText('Choose who is practicing');
    await enter(page, 'correct');
    await page.evaluate(() => LEARNING_OUTBOX.idle());
    expect(await factsEvents(page), 'no choice: nothing recorded').toEqual([]);
    await page.locator('#facts-next').click();
    await picker.getByRole('radio', { name: 'Player 1' }).check();
    await enter(page, 'wrong');
    await picker.getByRole('radio', { name: 'Player 2' }).check();
    await expect(page.locator('#facts-player-status')).toContainText('starts with the next question');
    await page.evaluate(() => LEARNING_OUTBOX.idle());
    await page.reload();
    await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#facts-player').getByRole('radio', { name: 'Player 2' })).toBeChecked();
    await enter(page, 'correct');
    await page.locator('#facts-next').click();
    await enter(page, 'correct');
    await page.evaluate(() => LEARNING_OUTBOX.idle());
    const groups = new Map();
    for (const event of await factsEvents(page)) groups.set(event.questionInstanceId, [...(groups.get(event.questionInstanceId) ?? []), event.profileId]);
    const owners = [...groups.values()].map(list => [...new Set(list)]);
    if (locks) {
      // Durable tab: the reloaded question resumed its persisted link and binding.
      expect(owners).toEqual([[p1], [p2]]);
    } else {
      // Memory mode: the reload loses the in-memory question; it can never be re-attributed to Player 2.
      expect(owners[0]).toEqual([p1]);
      expect(owners.every(list => list.length === 1)).toBe(true);
      expect(owners.at(-1)).toEqual([p2]);
    }
  });
}

test('a lost outbox commit mid-question, a reload and another player: the started question is not recorded, play is unchanged, the next question is', async ({ page, context }) => {
  await context.addInitScript(outboxSpyScript);
  await context.addInitScript(() => { localStorage.setItem('place-value-practice:mode:v1', 'arithmetic'); localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts'); });
  const [p1, p2] = [randomUUID(), randomUUID()];
  const state = newState([p1, p2]);
  state.mode = 'hung';
  await mockService(context, state);
  await enrollThroughPage(page);
  await openFacts(page);
  await page.locator('#facts-player').getByRole('radio', { name: 'Player 1' }).check();
  // The domain accepts and saves the miss; the outbox transaction aborts after its put.
  await page.evaluate(() => { window.__failOutbox = true; });
  await enter(page, 'wrong');
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  expect(await readOutbox(page)).toBeNull();
  const saved = await page.evaluate(() => __factsTest.snapshot().attempt);
  expect(saved.misses).toBe(1);
  await page.reload();
  await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
  const resumed = await page.evaluate(() => __factsTest.snapshot().attempt);
  expect([resumed.id, resumed.misses]).toEqual([saved.id, 1]);
  await page.locator('#facts-player').getByRole('radio', { name: 'Player 2' }).check();
  await enter(page, 'correct');
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  expect(await factsEvents(page), 'the started question has no known first player').toEqual([]);
  expect((await page.evaluate(() => __factsTest.snapshot().attempt)).complete).toBe(true);
  await page.locator('#facts-next').click();
  await enter(page, 'correct');
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  expect((await factsEvents(page)).map(event => [event.kind, event.profileId])).toEqual([['attempt', p2], ['resolution', p2]]);
});

test('a second tab choosing another player cannot re-attribute a durable question started by the first', async ({ page, context }) => {
  await context.addInitScript(() => { localStorage.setItem('place-value-practice:mode:v1', 'arithmetic'); localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts'); });
  const [p1, p2] = [randomUUID(), randomUUID()];
  const state = newState([p1, p2]);
  state.mode = 'hung';
  await mockService(context, state);
  await enrollThroughPage(page);
  await openFacts(page);
  await page.locator('#facts-player').getByRole('radio', { name: 'Player 1' }).check();
  await enter(page, 'wrong');
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  const other = await context.newPage();
  await openFacts(other);
  await other.locator('#facts-player').getByRole('radio', { name: 'Player 2' }).check();
  await enter(other, 'correct');
  await other.evaluate(() => LEARNING_OUTBOX.idle());
  const attempt = (await page.evaluate(() => __factsTest.snapshot().attempt.id));
  const events = await factsEvents(other);
  expect(new Set(events.map(event => event.questionInstanceId)).size).toBe(1);
  expect([...new Set(events.map(event => event.profileId))]).toEqual([p1]);
  expect(typeof attempt).toBe('number');
  await other.close();
});

test('Football who-is-playing appears only for several profiles, pins the chosen player, and keeps the start screen usable', async ({ page, context }) => {
  const [p1, p2] = [randomUUID(), randomUUID()];
  const state = newState([p1, p2]);
  state.mode = 'hung';
  await mockService(context, state);
  await enrollThroughPage(page);
  await page.goto('/football/');
  const picker = page.locator('#player-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('xpath=following-sibling::*[1]')).toHaveClass(/start-action-row/);
  for (const box of await picker.locator('label').evaluateAll(labels => labels.map(label => label.getBoundingClientRect().toJSON()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await picker.getByText('Player 2').click();
  await page.goto(BOOT);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await seedRng(page, 0x4000c0de);
  await playStep(page, SCRIPT[0]);
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  const events = (await readOutbox(page)).envelope.events;
  expect(events.length).toBeGreaterThan(0);
  expect([...new Set(events.map(event => event.profileId))]).toEqual([p2]);
  await test.info().attach('football-player-picker.png', { body: await page.screenshot(), contentType: 'image/png' });
});

test('a single enrolled profile adds no picker or friction', async ({ page, context }) => {
  const state = newState([randomUUID()]);
  state.mode = 'hung';
  await mockService(context, state);
  await enrollThroughPage(page);
  await page.goto('/football/');
  await expect(page.locator('#player-picker')).toHaveCount(0);
  await page.addInitScript(() => { localStorage.setItem('place-value-practice:mode:v1', 'arithmetic'); localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts'); });
  await openFacts(page);
  await expect(page.locator('#facts-player')).toHaveCount(0);
  await enter(page, 'correct');
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  expect((await factsEvents(page)).map(event => event.profileId)).toEqual(state.profileIds.flatMap(id => [id, id]));
});

// ---- Number facts off/on equivalence with the real uploader (AC19) ----
// The same scripted session as the #199 Facts parity case (tests/place-facts-outbox.spec.mjs),
// under the same paused clock, but here every enrolled run holds a real credential and
// uploads through the real client transport to the loopback mock.
const settledFacts = page => expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
async function factsSnapshot(page) { await settledFacts(page); return page.evaluate(() => __factsTest.snapshot()); }
async function factsHelp(page) { await page.locator('#facts-show').click(); await settledFacts(page); }
async function factsNext(page) { await page.locator('#facts-next').click(); await settledFacts(page); }
async function factsReport(page) {
  await page.locator('#facts-report > summary').click();
  await settledFacts(page);
  await expect(page.locator('#facts-report')).toHaveAttribute('open', '');
  const attempt = (await factsSnapshot(page)).attempt;
  expect([attempt.eligible, attempt.rewardSupported, attempt.helped, attempt.complete]).toEqual([false, true, false, false]);
}
async function factsRestart(page) {
  const before = (await factsSnapshot(page)).attempt.id;
  await page.getByRole('button', { name: 'Start new fact session' }).click();
  await expect.poll(async () => (await factsSnapshot(page)).attempt.id).not.toBe(before);
}
const FACTS_SCRIPT = [
  { name: 'timed first try', run: async (page, context) => { await context.clock.runFor(1500); await enter(page, 'correct'); }, events: 2 },
  { name: 'retry', run: async page => { await enter(page, 'wrong'); await enter(page, 'correct'); }, events: 3 },
  { name: 'help me', run: async page => { await factsHelp(page); await enter(page, 'correct'); }, events: 3 },
  { name: 'automatic help', run: async page => { await enter(page, 'wrong'); await enter(page, 'wrong'); await enter(page, 'correct'); }, events: 5 },
  { name: 'report exposure', run: async page => { await factsReport(page); await enter(page, 'correct'); }, events: 2 },
  { name: 'restart leaves', run: async page => { await enter(page, 'wrong'); await factsRestart(page); }, events: 2, noNext: true },
  { name: 'after restart', run: async (page, context) => { await context.clock.runFor(1500); await enter(page, 'correct'); }, events: 2 },
];
const FACTS_EVENTS = FACTS_SCRIPT.reduce((sum, step) => sum + step.events, 0);

async function playFactsRun(page, context, state, { enrolled, offline = false }) {
  await openFacts(page);
  // Each run starts clean: no Fact save, hint, player choice or reporting database.
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  expect(await deleteOutboxDatabase(page)).toBe('deleted');
  if (enrolled) await enrollThroughPage(page);
  await openFacts(page);
  if (offline) await context.setOffline(true);
  const steps = [];
  for (const [index, step] of FACTS_SCRIPT.entries()) {
    await step.run(page, context);
    // A sync starts after every step and is never awaited by play.
    await page.evaluate(() => { LEARNING_SYNC.syncNow(); });
    steps.push({
      name: step.name,
      model: await factsSnapshot(page),
      diagnostics: await page.evaluate(() => __factsTest.diagnostics()),
      text: await page.evaluate(() => JSON.parse(render_game_to_text())),
    });
    if (!step.noNext && index < FACTS_SCRIPT.length - 1) await factsNext(page);
  }
  await page.evaluate(() => LEARNING_OUTBOX.idle());
  const result = {
    steps,
    bytes: await page.evaluate(key => localStorage.getItem(key), FACTS_KEY),
    keys: await page.evaluate(() => Object.keys(localStorage).filter(key => !key.startsWith('learningReporting:')).sort()),
  };
  let duringOffline = null;
  if (offline) {
    duringOffline = { requests: state.requests.map(request => request.path), outbox: await readOutbox(page) };
    await context.setOffline(false);
  }
  return { ...result, state, duringOffline };
}

test('seeded Number facts play is identical with no enrollment and with upload succeeding, failing, offline and hung; only acknowledged events leave the outbox', async ({ page, context }) => {
  const now = new Date('2026-09-09T12:00:00Z');
  await context.clock.install({ time: now });
  await context.clock.pauseAt(now);
  await context.addInitScript(() => { localStorage.setItem('place-value-practice:mode:v1', 'arithmetic'); localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts'); });
  let current = newState();
  await mockService(context, () => current);
  const run = async ({ serviceMode = 'success', ...options }) => {
    current = newState();
    current.mode = serviceMode;
    return playFactsRun(page, context, current, options);
  };
  const drain = () => expect.poll(async () => { await page.evaluate(() => LEARNING_SYNC.syncNow()); return (await readOutbox(page)).envelope.events.length; }).toBe(0);
  const syncsOf = state => state.requests.filter(request => request.path === '/v1/sync');

  const off = await run({ enrolled: false });
  const success = await run({ enrolled: true });
  await drain();
  const failure = await run({ enrolled: true, serviceMode: 'failure' });
  const failureOutbox = await readOutbox(page);
  const offline = await run({ enrolled: true, offline: true });
  const offlineQueued = offline.duringOffline.outbox.envelope.events.map(event => event.eventId);
  await drain();
  const hung = await run({ enrolled: true, serviceMode: 'hung' });
  const hungOutbox = await readOutbox(page);

  // The production domain is identical: per-step model (attempts, history with eligibility
  // and the guarded timing sample, tickets, drive and awards), selection diagnostics,
  // rendered state, the persisted save bytes and every non-reporting key. Nothing is masked.
  expect(off.state.requests).toEqual([]);
  expect(off.steps.map(step => step.name)).toEqual(FACTS_SCRIPT.map(step => step.name));
  const timed = off.steps[0].model, timedFact = timed.attempt.factId;
  expect(timed.facts[timedFact].history.at(-1).ms, 'the guarded timing sample is present').not.toBeNull();
  for (const result of [success, failure, offline, hung]) {
    expect(result.steps).toEqual(off.steps);
    expect(result.bytes).toBe(off.bytes);
    expect(result.keys).toEqual(off.keys);
  }
  // Success: every recorded event was acknowledged and removed; credential only in the header.
  expect(success.state.accepted.size).toBe(FACTS_EVENTS);
  expect(syncsOf(success.state).length).toBeGreaterThan(0);
  expect(syncsOf(success.state).every(request => request.authorization === `Bearer ${success.state.token}` && request.cookie === null)).toBe(true);
  expect(syncsOf(success.state).flatMap(request => request.body.events).every(event => event.game === 'facts' && event.gameVersion === '1.9.2')).toBe(true);
  // Failure: uploads were attempted and refused; nothing was removed.
  expect(syncsOf(failure.state).length).toBeGreaterThan(0);
  expect(failure.state.accepted.size).toBe(0);
  expect(failureOutbox.envelope.events).toHaveLength(FACTS_EVENTS);
  // Offline: no upload while offline and everything queued; back online, exactly those are acknowledged.
  expect(offline.duringOffline.requests).toEqual(['/v1/enroll']);
  expect(offlineQueued).toHaveLength(FACTS_EVENTS);
  expect([...offline.state.accepted].sort()).toEqual([...offlineQueued].sort());
  // Hung: requests never answered; nothing was removed.
  expect(syncsOf(hung.state).length).toBeGreaterThan(0);
  expect(hungOutbox.envelope.events).toHaveLength(FACTS_EVENTS);
});
