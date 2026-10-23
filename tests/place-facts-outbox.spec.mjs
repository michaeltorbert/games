// #199 Number facts learning-event outbox through the real Fact practice controller.
// Fact practice plays no audio (source-audited). Enrollment (IndexedDB consent plus the
// localStorage hint) is a synthetic fixture; production #199 has no installer.
import { randomUUID } from 'node:crypto';
import { test, expect } from './curriculum-fixture.mjs';
import { databaseNames, deleteOutboxDatabase, installConsent, outboxSpyScript, readOutbox, readRecords } from './learning-outbox-fixture.mjs';

const KEY = 'place-value-practice:facts:v1';
const HINT = 'learningReporting:enrollment:v1';
const LEGACY = 'learningReporting:outbox:v1';
const DB = 'learningReporting';
const PAGE = '/place-value-practice/';

test.beforeAll(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Learning outbox adapter checks run once on the primary target.');
});

// Context-level, so every page this test opens (stale, memory-mode and second tabs)
// gets the same paused clock, mode keys, lock spy, Fact-save failure hook and outbox
// spy (indexedDB.open count; __failOutbox aborts the outbox transaction after its put).
test.beforeEach(async ({ context }) => {
  const now = new Date('2026-09-09T12:00:00Z');
  // Install before the page loads, then pause at the fixture instant from epoch zero.
  // The install command can take real time; pausing at its own start instant races it.
  await context.clock.install({ time: 0 });
  await context.clock.pauseAt(now);
  await context.addInitScript(() => {
    localStorage.setItem('place-value-practice:mode:v1', 'arithmetic');
    localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts');
    window.__lockNames = [];
    if (navigator.locks) {
      const proto = Object.getPrototypeOf(navigator.locks), request = proto.request;
      proto.request = function (name, ...rest) { window.__lockNames.push(name); return request.call(this, name, ...rest); };
    }
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === 'place-value-practice:facts:v1' && window.__failFacts) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return setItem.call(this, name, value);
    };
  });
  await context.addInitScript(outboxSpyScript);
});

const enrollmentFor = (overrides = {}) => ({
  generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()], activeProfileId: null, ...overrides,
});
const enroll = (page, enrollment = enrollmentFor()) => installConsent(page, enrollment);
const writeHint = (page, enrollment) => page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, ...value })), [HINT, enrollment]);
// Replaces only the authoritative consent record (the hint is untouched).
const putConsent = (page, consent) => page.evaluate(async value => {
  const O = LEARNING_OUTBOX;
  const db = await new Promise(resolve => { const request = indexedDB.open(O.DB_NAME, O.DB_VERSION); request.onsuccess = () => resolve(request.result); });
  await new Promise(resolve => {
    const tx = db.transaction(O.STORE, 'readwrite');
    tx.objectStore(O.STORE).put(JSON.stringify({ schemaVersion: 1, ...value }), O.CONSENT_RECORD);
    tx.oncomplete = resolve;
  });
  db.close();
}, consent);
async function open(page) { await page.goto(PAGE); await expect(page.locator('#fact-practice')).toBeVisible(); await settled(page); }
async function settled(page) { await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false'); }
async function snapshot(page) { await settled(page); return page.evaluate(() => __factsTest.snapshot()); }
const answerOf = page => page.evaluate(() => PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
async function enter(page, value) {
  await settled(page);
  await page.locator('.facts-keypad').getByRole('button', { name: 'Clear', exact: true }).click();
  for (const digit of String(value)) await page.locator('.facts-keypad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('#facts-check').click();
  await settled(page);
}
const correct = async page => enter(page, await answerOf(page));
const wrong = async page => enter(page, ((await answerOf(page)) + 1) % 19);
async function next(page) { await page.locator('#facts-next').click(); await settled(page); }
async function help(page) { await page.locator('#facts-show').click(); await settled(page); }
// The report's own outer summary; its nested group summaries are not the control.
async function openReport(page) {
  await page.locator('#facts-report > summary').click();
  await settled(page);
  await expect(page.locator('#facts-report')).toHaveAttribute('open', '');
  const attempt = (await snapshot(page)).attempt;
  expect([attempt.eligible, attempt.rewardSupported, attempt.helped, attempt.complete]).toEqual([false, true, false, false]);
}
async function restart(page) {
  const before = (await snapshot(page)).attempt.id;
  await page.getByRole('button', { name: 'Start new fact session' }).click();
  await expect.poll(async () => (await snapshot(page)).attempt.id).not.toBe(before);
}
function byQuestion(events) {
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.questionInstanceId)) groups.set(event.questionInstanceId, []);
    groups.get(event.questionInstanceId).push(event);
  }
  return [...groups.values()];
}
const shape = event => event.kind === 'attempt' ? ['attempt', event.number, event.correct, event.helped]
  : event.kind === 'help' ? ['help', event.number] : [event.kind];

// One scripted session: first try (timed), retry, Help me, automatic help after two
// misses, report exposure, a restart that leaves a missed question, then a first try.
const SCRIPT = [
  { name: 'timed first try', run: async page => { await page.context().clock.runFor(1500); await correct(page); }, expect: [['attempt', 1, true, false], ['resolution']] },
  { name: 'retry', run: async page => { await wrong(page); await correct(page); }, expect: [['attempt', 1, false, false], ['attempt', 2, true, false], ['resolution']] },
  { name: 'help me', run: async page => { await help(page); await correct(page); }, expect: [['help', 1], ['attempt', 1, true, true], ['resolution']] },
  { name: 'automatic help', run: async page => { await wrong(page); await wrong(page); await correct(page); },
    expect: [['attempt', 1, false, false], ['attempt', 2, false, false], ['help', 3], ['attempt', 3, true, true], ['resolution']] },
  { name: 'report exposure', run: async page => { await openReport(page); await correct(page); }, expect: [['attempt', 1, true, false], ['resolution']] },
  { name: 'restart leaves', run: async page => { await wrong(page); await restart(page); }, expect: [['attempt', 1, false, false], ['leftUnfinished']], noNext: true },
  { name: 'after restart', run: async page => { await page.context().clock.runFor(1500); await correct(page); }, expect: [['attempt', 1, true, false], ['resolution']] },
];

async function playFacts(page, { enrolled = null, failOutbox = false, offline = false } = {}) {
  await open(page);
  // Each run starts clean: no hint, no legacy key, no reporting database.
  await page.evaluate(() => localStorage.clear());
  expect(await deleteOutboxDatabase(page)).toBe('deleted');
  const requests = [];
  const onRequest = request => requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  page.on('request', onRequest);
  // Every parity scenario receives identical wall time as well as identical actions.
  // Keep complete model/save-byte comparisons, including calendar metadata.
  await page.context().clock.setSystemTime(new Date('2026-09-09T12:00:00Z'));
  await open(page);
  if (enrolled) await enroll(page, enrolled);
  if (failOutbox) await page.evaluate(() => { window.__failOutbox = true; });
  if (offline) await page.context().setOffline(true);
  const steps = [];
  for (const [index, step] of SCRIPT.entries()) {
    await step.run(page);
    steps.push({
      name: step.name,
      model: await snapshot(page),
      diagnostics: await page.evaluate(() => __factsTest.diagnostics()),
      text: await page.evaluate(() => JSON.parse(render_game_to_text())),
    });
    if (!step.noNext && index < SCRIPT.length - 1) await next(page);
  }
  if (offline) await page.context().setOffline(false);
  page.off('request', onRequest);
  return {
    steps, requests,
    bytes: await page.evaluate(key => localStorage.getItem(key), KEY),
    keys: await page.evaluate(() => Object.keys(localStorage).sort()),
    idbOpens: await page.evaluate(() => window.__idbOpens),
    databases: await databaseNames(page),
    outbox: await readOutbox(page),
  };
}

test('seeded Fact play is identical with recording off, on, offline and failing; events are exact, timed only by the guarded sample', async ({ page }) => {
  const off = await playFacts(page);
  const on = await playFacts(page, { enrolled: enrollmentFor() });
  const offline = await playFacts(page, { enrolled: enrollmentFor(), offline: true });
  const failing = await playFacts(page, { enrolled: enrollmentFor(), failOutbox: true });

  // Disabled: no new key, no IndexedDB open or database, and recording adds no request.
  expect(off.keys.filter(key => key.startsWith('learningReporting:'))).toEqual([]);
  expect(off.idbOpens).toBe(0);
  if (off.databases !== null) expect(off.databases).not.toContain(DB);
  expect(off.outbox).toBeNull();
  expect(on.requests.filter(request => !off.requests.includes(request))).toEqual([]);
  expect([...off.requests, ...on.requests].every(request => request.startsWith('GET '))).toBe(true);

  // Selections, tickets, awards and the persisted domain model are byte-identical.
  for (const run of [on, offline, failing]) {
    expect(run.steps).toEqual(off.steps);
    expect(run.bytes).toBe(off.bytes);
    expect(run.keys.filter(key => !key.startsWith('learningReporting:'))).toEqual(off.keys);
  }
  expect(failing.outbox).toBeNull();

  for (const run of [on, offline]) {
    expect(run.outbox.valid).toBe(true);
    const events = run.outbox.envelope.events;
    expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1));
    expect(events.every(event => event.game === 'facts' && event.gameVersion === '1.9.3')).toBe(true);
    const groups = byQuestion(events);
    expect(groups.map(group => group.map(shape))).toEqual(SCRIPT.map(step => step.expect));
    groups.forEach((group, index) => {
      const model = run.steps[index].model, factId = group[0].factId;
      expect(group.every(event => event.factId === factId)).toBe(true);
      const resolution = group.find(event => event.kind === 'resolution');
      if (!resolution) return;
      // Resolution carries exactly the stored history row: guarded sample or null.
      const row = model.facts[factId].history.at(-1);
      expect([resolution.outcome, resolution.eligibleCheck, resolution.timingMs, resolution.helped])
        .toEqual([row.outcome, row.eligible, row.ms, model.attempt.helped]);
    });
    const [timed, retry, shown, automatic, reported] = groups.map(group => group.find(event => event.kind === 'resolution'));
    expect(timed.timingMs).not.toBeNull();
    expect([retry.outcome, shown.outcome, automatic.outcome]).toEqual(['retry', 'shown', 'shown']);
    expect([shown.timingMs, automatic.timingMs, reported.timingMs, reported.eligibleCheck]).toEqual([null, null, null, false]);
    // Only resolution may carry timing or eligibility; nothing private reaches the outbox.
    expect(events.filter(event => event.kind !== 'resolution' && ('timingMs' in event || 'eligibleCheck' in event))).toEqual([]);
    for (const step of run.steps) {
      const fact = step.model.attempt.factId;
      const equation = await page.evaluate(id => PLACE_FACTS.equation(PLACE_FACTS.byId[id]), fact);
      const helpText = await page.evaluate(id => PLACE_FACTS.help(PLACE_FACTS.byId[id]), fact);
      expect(run.outbox.raw.includes(equation)).toBe(false);
      expect(run.outbox.raw.includes(helpText)).toBe(false);
    }
    for (const forbidden of ['"value"', '"answer"', '"equation"', '"ms"', '"firstMs"', '"input"', '"prompt"', '"kickResult"', '"drive"']) {
      expect(run.outbox.raw.includes(forbidden), forbidden).toBe(false);
    }
  }
});

test('a reload resumes the same question link, and a fresh unreadable-save model never adopts it', async ({ page }) => {
  // Only events whose transaction completed are claimed to survive a reload; a reload
  // before oncomplete is the documented undetectable close window, so each reload here
  // waits for this page's outbox transactions first.
  const committed = () => page.evaluate(() => LEARNING_OUTBOX.idle());
  await open(page);
  await enroll(page);
  await wrong(page);
  await committed();
  await page.reload();
  await expect(page.locator('#fact-practice')).toBeVisible();
  await correct(page);
  let groups = byQuestion((await readOutbox(page)).envelope.events);
  expect(groups.map(group => group.map(shape))).toEqual([[['attempt', 1, false, false], ['attempt', 2, true, false], ['resolution']]]);
  // Same nonce/fact/serial after a full origin reset (Fact save, hint and the reporting
  // database; a localStorage-only reset would leave the old envelope, which a new
  // enrollment then correctly pauses as foreign). Link the first question, then make the
  // Fact save unreadable.
  await page.evaluate(() => localStorage.clear());
  expect(await deleteOutboxDatabase(page)).toBe('deleted');
  await page.reload();
  await expect(page.locator('#fact-practice')).toBeVisible();
  await enroll(page);
  await wrong(page);
  await committed();
  const first = (await snapshot(page)).attempt;
  await page.evaluate(key => localStorage.setItem(key, '{bad json'), KEY);
  await page.reload();
  await expect(page.locator('#fact-practice')).toBeVisible();
  const recreated = (await snapshot(page)).attempt;
  expect([recreated.id, recreated.factId, recreated.misses]).toEqual([first.id, first.factId, 0]);
  await wrong(page);
  await committed();
  await page.reload();
  await expect(page.locator('#fact-practice')).toBeVisible();
  await correct(page);
  groups = byQuestion((await readOutbox(page)).envelope.events);
  expect(groups.map(group => group.map(shape))).toEqual([
    [['attempt', 1, false, false]],
    [['attempt', 1, false, false], ['attempt', 2, true, false], ['resolution']],
  ]);
  expect(groups.flat().some(event => event.kind === 'leftUnfinished')).toBe(false);
});

test('a confirmed-page repair is reported once the replacement is saved', async ({ page }) => {
  await open(page);
  await enroll(page);
  await wrong(page);
  const before = await snapshot(page);
  const target = await page.evaluate(id => PLACE_FACTS.byId[id].source.page - 1, before.attempt.factId);
  expect(target).toBeGreaterThanOrEqual(17);
  await page.evaluate(confirmed => PLACE_FACT_UI.activate(true, confirmed), target);
  const repaired = await snapshot(page);
  expect(repaired.attempt.id).not.toBe(before.attempt.id);
  // Not yet saved: no leave is claimed.
  expect((await readOutbox(page)).envelope.events.map(event => event.kind)).toEqual(['attempt']);
  await correct(page);
  const groups = byQuestion((await readOutbox(page)).envelope.events);
  expect(groups.map(group => group.map(shape))).toEqual([[['attempt', 1, false, false], ['leftUnfinished']], [['attempt', 1, true, false], ['resolution']]]);
});

test('accepted wrong answers at the 99-miss cap are still recorded', async ({ page }) => {
  await open(page);
  await page.evaluate(key => {
    const s = PLACE_FACTS.create();
    const fact = PLACE_FACTS.byId[s.attempt.factId];
    for (let index = 0; index < 99; index++) PLACE_FACTS.answer(s, s.attempt.id, (fact.answer + 1) % 19);
    localStorage.setItem(key, JSON.stringify(s));
  }, KEY);
  await page.reload();
  await expect(page.locator('#fact-practice')).toBeVisible();
  await enroll(page);
  expect((await snapshot(page)).attempt.misses).toBe(99);
  await wrong(page);
  expect((await snapshot(page)).attempt.misses).toBe(99);
  await correct(page);
  const events = (await readOutbox(page)).envelope.events;
  expect(events.map(shape)).toEqual([['attempt', 100, false, true], ['attempt', 100, true, true], ['resolution']]);
  expect(events.at(-1).outcome).toBe('shown');
});

test('stale, memory-mode and concurrent tabs never share or revive a question link', async ({ page, context }) => {
  await open(page);
  await enroll(page);
  const stale = await context.newPage();
  await open(stale);
  await wrong(page);
  const linked = (await readOutbox(page)).envelope.links.facts;
  // The stale tab's first tap is refused by the existing refresh, and records nothing.
  const before = (await readOutbox(page)).envelope.events.length;
  await wrong(stale);
  await expect(stale.locator('.facts-storage')).toContainText('another tab');
  expect((await readOutbox(stale)).envelope.events).toHaveLength(before);
  // Its next accepted answer resumes the persisted, normalized attempt's link.
  await wrong(stale);
  let events = (await readOutbox(stale)).envelope.events;
  expect(events.slice(-2).map(event => [event.kind, event.questionInstanceId])).toEqual([['attempt', linked.questionInstanceId], ['help', linked.questionInstanceId]]);
  // A memory-mode tab (its save fails) keeps its own link and never touches the durable one.
  const memory = await context.newPage();
  await open(memory);
  expect(await memory.evaluate(() => [typeof window.__lockNames, JSON.parse(render_game_to_text()).drive.saved])).toEqual(['object', true]);
  await memory.evaluate(() => { window.__failFacts = true; });
  const durable = (await readOutbox(memory)).envelope.links;
  const savedBytes = await memory.evaluate(key => localStorage.getItem(key), KEY);
  await wrong(memory);
  // The domain save really failed: this tab is now in memory mode and storage is unchanged.
  expect(await memory.evaluate(key => localStorage.getItem(key), KEY)).toBe(savedBytes);
  expect(JSON.parse(await memory.evaluate(() => render_game_to_text())).drive.saved).toBe(false);
  await expect(memory.locator('.facts-storage')).toContainText('stay in memory');
  expect((await snapshot(memory)).attempt.misses).toBe(3);
  events = (await readOutbox(memory)).envelope.events;
  expect(events.at(-1).questionInstanceId).not.toBe(linked.questionInstanceId);
  expect((await readOutbox(memory)).envelope.links).toEqual(durable);
  // The durable tab still resolves its own question; seq stays unique across all tabs.
  await page.reload();
  await expect(page.locator('#fact-practice')).toBeVisible();
  await correct(page);
  const outbox = await readOutbox(page);
  expect(outbox.valid).toBe(true);
  events = outbox.envelope.events;
  expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1));
  expect(events.at(-1)).toMatchObject({ kind: 'resolution', questionInstanceId: linked.questionInstanceId });
  expect(outbox.envelope.links.facts).toBeNull();
  await Promise.all([stale.close(), memory.close()]);
});

test('rejected, duplicate and disabled-state taps add no events', async ({ page }) => {
  await open(page);
  await enroll(page);
  await page.locator('#facts-check').click();
  await settled(page);
  expect(await readOutbox(page)).toBeNull();
  await help(page);
  await expect(page.locator('#facts-show')).toBeDisabled();
  await page.evaluate(() => document.getElementById('facts-show').click());
  const value = await answerOf(page);
  await page.locator('.facts-keypad').getByRole('button', { name: 'Clear', exact: true }).click();
  for (const digit of String(value)) await page.locator('.facts-keypad').getByRole('button', { name: digit, exact: true }).click();
  await page.locator('#facts-check').dblclick();
  await settled(page);
  await page.locator('#facts-check').click({ force: true }).catch(() => {});
  await settled(page);
  expect((await readOutbox(page)).envelope.events.map(shape)).toEqual([['help', 1], ['attempt', 1, true, true], ['resolution']]);
});

// Approved protocol change: the outbox no longer needs Web Locks, so with consent it records.
// The Fact game's own playability and memory-mode behavior without locks are unchanged.
test('without Web Locks Fact practice stays playable and recording follows IndexedDB', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'locks', { configurable: true, get: () => undefined }));
  await open(page);
  expect(await page.evaluate(() => navigator.locks)).toBeUndefined();
  await enroll(page);
  const before = await snapshot(page);
  await correct(page);
  const after = await snapshot(page);
  expect(after.serial).toBe(before.serial + 1);
  expect(JSON.parse(await page.evaluate(() => render_game_to_text())).drive.saved).toBe(false);
  const outbox = await readOutbox(page);
  expect(outbox.valid).toBe(true);
  expect(outbox.envelope.events.map(shape)).toEqual([['attempt', 1, true, false], ['resolution']]);
});

test('without IndexedDB Fact practice stays playable and records nothing', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined }));
  await open(page);
  expect(await page.evaluate(() => typeof indexedDB)).toBe('undefined');
  await writeHint(page, enrollmentFor());
  const before = await snapshot(page);
  await correct(page);
  const after = await snapshot(page);
  expect(after.serial).toBe(before.serial + 1);
  const diagnostics = await page.evaluate(async () => { await LEARNING_OUTBOX.idle(); return LEARNING_OUTBOX.diagnostics(); });
  expect(diagnostics.counts).toMatchObject({ captured: 0, queued: 0, stored: 0 });
  expect(diagnostics.counts.refused).toBeGreaterThan(0);
});

test('stop removes consent, outbox and hint, play continues unrecorded, and re-enrollment starts a new epoch', async ({ page }) => {
  await open(page);
  await enroll(page);
  await correct(page);
  const epoch = (await readOutbox(page)).envelope.status.epochId;
  expect(await page.evaluate(() => LEARNING_OUTBOX.stop())).toEqual({ ok: true });
  const records = await readRecords(page);
  expect([records.consent, records.outbox]).toEqual([null, null]);
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [HINT, LEGACY])).toEqual([null, null]);
  await next(page);
  await correct(page);
  expect(await readOutbox(page)).toBeNull();
  await enroll(page);
  await next(page);
  await correct(page);
  const outbox = await readOutbox(page);
  expect(outbox.envelope.status.epochId).not.toBe(epoch);
  expect(outbox.envelope.events.map(event => event.seq)).toEqual([1, 2]);
});

// ---- Real-browser IndexedDB protocol cases (the agreed #199 transactional correction) ----

test('a hint without consent records nothing and never creates the database or schema', async ({ page }) => {
  await open(page);
  await writeHint(page, enrollmentFor());
  await correct(page);
  const diagnostics = await page.evaluate(async () => { await LEARNING_OUTBOX.idle(); return LEARNING_OUTBOX.diagnostics(); });
  expect(diagnostics.state).toBe('no-consent');
  expect(diagnostics.counts).toMatchObject({ queued: 2, stored: 0 });
  // Evidence first, before any helper touches IndexedDB: the recorder's metadata-only
  // preflight found no database, so it never called open and left no entry.
  const names = await databaseNames(page);
  await test.info().attach('databases-after-missing-db-probe.json', { body: JSON.stringify(names), contentType: 'application/json' });
  expect(names, 'this engine supports indexedDB.databases()').not.toBeNull();
  expect(names).not.toContain(DB);
  expect(await page.evaluate(() => window.__idbOpens), 'the recorder never opened a missing database').toBe(0);
  expect((await readRecords(page)).exists).toBe(false);
});

test('a failed IndexedDB open fails open and is counted once a later transaction completes; without databases() the fallback still records', async ({ page, context }) => {
  await open(page);
  await enroll(page);
  // The recorder has not opened yet in this page, so its first open fails.
  await page.evaluate(() => { window.__failOpen = true; });
  const before = await snapshot(page);
  await correct(page);
  expect((await snapshot(page)).serial, 'play continues').toBe(before.serial + 1);
  expect(await page.evaluate(async () => { await LEARNING_OUTBOX.idle(); return LEARNING_OUTBOX.diagnostics(); }))
    .toMatchObject({ state: 'failed', pendingWriteFailures: 1 });
  await page.evaluate(() => { window.__failOpen = false; });
  expect(await readOutbox(page), 'nothing of the failed batch was kept').toBeNull();
  await next(page);
  await correct(page);
  let outbox = await readOutbox(page);
  expect(outbox.envelope.status.writeFailures).toBe(1);
  expect(outbox.envelope.events.map(shape)).toEqual([['attempt', 1, true, false], ['resolution']]);
  // An engine without indexedDB.databases() uses the aborting-open fallback, and still records.
  const fallback = await context.newPage();
  await fallback.addInitScript(() => Object.defineProperty(IDBFactory.prototype, 'databases', { configurable: true, value: undefined }));
  await open(fallback);
  expect(await fallback.evaluate(() => typeof indexedDB.databases)).toBe('undefined');
  await next(fallback);
  await correct(fallback);
  outbox = await readOutbox(fallback);
  expect(outbox.valid).toBe(true);
  expect(outbox.envelope.events.map(event => event.seq)).toEqual([1, 2, 3, 4]);
  await fallback.close();
});

test('the authoritative consent fences a captured profile it no longer assigns, without re-attributing', async ({ page }) => {
  const [first, other] = [randomUUID(), randomUUID()];
  const enrollment = enrollmentFor({ profileIds: [first, other], activeProfileId: first });
  await open(page);
  await enroll(page, enrollment);
  await correct(page);
  await next(page);
  // #200 removed `first` from the consent; this tab's hint still selects it.
  await putConsent(page, { generation: enrollment.generation, deviceId: enrollment.deviceId, profileIds: [other] });
  await correct(page);
  const outbox = await readOutbox(page);
  expect(outbox.envelope.events.map(event => event.profileId)).toEqual([first, first]);
  expect(outbox.diagnostics.state).toBe('revoked');
  expect(outbox.diagnostics.counts.dropped).toBeGreaterThan(0);
});

test('a legacy localStorage outbox key is preserved and pauses recording; only Stop removes it', async ({ page }) => {
  await open(page);
  await enroll(page);
  await page.evaluate(key => localStorage.setItem(key, '{"schemaVersion":7,"legacy":"bytes"}'), LEGACY);
  await correct(page);
  expect(await readOutbox(page)).toBeNull();
  expect(await page.evaluate(() => LEARNING_OUTBOX.diagnostics().state)).toBe('legacy');
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toBe('{"schemaVersion":7,"legacy":"bytes"}');
  expect(await page.evaluate(() => LEARNING_OUTBOX.stop())).toEqual({ ok: true });
  expect(await page.evaluate(key => localStorage.getItem(key), LEGACY)).toBeNull();
});

test('a readwrite transaction held by another tab makes the recorder wait and then read its commit', async ({ page, context }) => {
  await open(page);
  await enroll(page);
  await correct(page);
  expect((await readOutbox(page)).envelope.status.highestSeq).toBe(2);
  const holder = await context.newPage();
  await open(holder);
  // The holder raises highestSeq by 5 and keeps its transaction alive with chained reads.
  await holder.evaluate(name => new Promise(started => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => {
      const tx = request.result.transaction('records', 'readwrite'), store = tx.objectStore('records');
      window.__holdDone = new Promise(resolve => { tx.oncomplete = () => resolve('complete'); tx.onabort = () => resolve('abort'); });
      store.get('outbox').onsuccess = event => {
        const envelope = JSON.parse(event.target.result);
        envelope.status.highestSeq += 5;
        store.put(JSON.stringify(envelope), 'outbox');
        const spin = () => { if (!window.__releaseHold) store.get('outbox').onsuccess = spin; };
        spin();
        started();
      };
    };
  }), DB);
  await next(page);
  await correct(page);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => LEARNING_OUTBOX.diagnostics().counts.stored), 'the recorder waits behind the held transaction').toBe(2);
  await holder.evaluate(() => { window.__releaseHold = true; return window.__holdDone; });
  const outbox = await readOutbox(page);
  expect(outbox.valid).toBe(true);
  expect(outbox.envelope.events.map(event => event.seq)).toEqual([1, 2, 8, 9]);
  await holder.close();
});

test('after Stop in one tab, a stale hint in another tab records nothing and revives nothing', async ({ page, context }) => {
  const enrollment = enrollmentFor();
  await open(page);
  await enroll(page, enrollment);
  await correct(page);
  expect(await page.evaluate(() => LEARNING_OUTBOX.stop())).toEqual({ ok: true });
  // The other tab still sees the old hint (written back to model a stale view). It loads the
  // current Fact save, so its own accepted answers are real, not refused as stale.
  const other = await context.newPage();
  await open(other);
  await writeHint(other, enrollment);
  await next(other);
  await correct(other);
  const records = await readRecords(other);
  expect([records.consent, records.outbox]).toEqual([null, null]);
  expect(await other.evaluate(() => LEARNING_OUTBOX.diagnostics().state)).toBe('no-consent');
  await other.close();
});

test('a version change from another tab closes the recorder, which then records nothing and recreates nothing', async ({ page, context }) => {
  await open(page);
  await enroll(page);
  await correct(page);
  const other = await context.newPage();
  await open(other);
  expect(await deleteOutboxDatabase(other)).toBe('deleted');
  await next(page);
  await correct(page);
  expect(await page.evaluate(async () => { await LEARNING_OUTBOX.idle(); return LEARNING_OUTBOX.diagnostics().state; })).toBe('no-consent');
  expect((await readRecords(page)).exists).toBe(false);
  await other.close();
});

test('a future database pauses recording and is preserved; Stop deletes it, honestly pending while another tab blocks', async ({ page, context }) => {
  await open(page);
  const enrollment = enrollmentFor();
  await page.evaluate(async ([name, hintKey, hint]) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('records'); request.result.createObjectStore('future'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise(resolve => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put('opaque future outbox', 'outbox');
      tx.oncomplete = resolve;
    });
    db.close();
    localStorage.setItem(hintKey, hint);
  }, [DB, HINT, JSON.stringify({ schemaVersion: 1, ...enrollment })]);
  await correct(page);
  expect(await page.evaluate(async () => { await LEARNING_OUTBOX.idle(); return LEARNING_OUTBOX.diagnostics(); }))
    .toMatchObject({ state: 'future', pendingWriteFailures: 0 });
  expect(await readRecords(page)).toMatchObject({ version: 2, outbox: 'opaque future outbox' });
  // Another tab holds a connection and ignores versionchange, so the deletion is blocked.
  const holder = await context.newPage();
  await open(holder);
  await holder.evaluate(name => new Promise(resolve => {
    const request = indexedDB.open(name);
    request.onsuccess = () => { window.__held = request.result; request.result.onversionchange = () => {}; resolve(); };
  }), DB);
  expect(await page.evaluate(() => LEARNING_OUTBOX.stop())).toEqual({ ok: false, reason: 'blocked', pending: true });
  expect(await page.evaluate(() => LEARNING_OUTBOX.deletionPending())).toBe(true);
  expect(await page.evaluate(() => LEARNING_OUTBOX.snapshot())).toEqual({ state: 'stopping' });
  // Play is never blocked by the pending deletion.
  await next(page);
  await correct(page);
  await holder.evaluate(() => window.__held.close());
  await expect.poll(() => page.evaluate(() => LEARNING_OUTBOX.deletionPending())).toBe(false);
  expect(await page.evaluate(() => LEARNING_OUTBOX.diagnostics().state)).toBe('stopped');
  expect(await page.evaluate(key => localStorage.getItem(key), HINT)).toBeNull();
  const names = await databaseNames(page);
  if (names !== null) expect(names).not.toContain(DB);
  await holder.close();
});

test('the outbox script ships with the release version and loads before fact-practice.js', async ({ page }) => {
  await open(page);
  const order = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[src]')].map(script => new URL(script.src, location.href));
    const index = name => scripts.findIndex(url => url.pathname.endsWith(name));
    return { version: scripts[index('/shared/learning-outbox.js')]?.searchParams.get('v'), game: GAME_VERSION,
      domain: index('/fact-practice-domain.js'), outbox: index('/shared/learning-outbox.js'), controller: index('/fact-practice.js') };
  });
  expect([order.version, order.game]).toEqual(['1.9.3', '1.9.3']);
  expect(order.outbox).toBeGreaterThan(order.domain);
  expect(order.outbox).toBeLessThan(order.controller);
});
