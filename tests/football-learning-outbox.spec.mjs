// #199 Football learning-event outbox through the real production adapter. Every
// page is session-muted by curriculum-fixture (verified after each goto/reload)
// before any input. Enrollment (IndexedDB consent plus the localStorage hint) is a
// synthetic test fixture: production #199 has no installer or writer.
import { randomUUID, createHash } from 'node:crypto';
import {readFile} from 'node:fs/promises';
import { test, expect } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';
import { databaseNames, deleteOutboxDatabase, installConsent, outboxSpyScript, readOutbox, readRecords } from './learning-outbox-fixture.mjs';

const STATS = 'footballMathStats:v1';
const BOOT = '/football/?boot=offense-call';
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ISO_TIMES = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;
// Random IDs, wall-clock and monotonic timings are the only fields allowed to differ.
const TIMED = /"(\w*(?:Ms|At))":(-?\d+(?:\.\d+)?|"[^"]*"|null)/g;
const mask = value => JSON.parse(JSON.stringify(value).replace(UUIDS, '<uuid>').replace(ISO_TIMES, '<time>').replace(TIMED, '"$1":"<timed>"'));

test.beforeAll(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Learning outbox adapter checks run once on the primary target.');
});

const OFFENSE = Object.freeze({
  possession: 'offense', direction: 1, quarter: 2, down: 2, yardsToGo: 8, yardLine: 30, firstDownLine: 38, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 4, drivePlays: 2,
});
const DEFENSE = Object.freeze({
  possession: 'defense', direction: -1, quarter: 3, down: 2, yardsToGo: 10, yardLine: 70, firstDownLine: 60, driveStart: 80,
  scores: { player: 14, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 9, drivePlays: 2,
});
const FOURTH = Object.freeze({
  possession: 'offense', direction: 1, quarter: 1, down: 4, yardsToGo: 2, yardLine: 60, firstDownLine: 62, driveStart: 20,
  scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 }, plays: 0, drivePlays: 0,
});
const SCRIPT = Object.freeze([
  { name: 'offense first try', seed: OFFENSE, call: 0, answers: ['correct'] },
  { name: 'offense retry', seed: { ...OFFENSE, down: 1, yardsToGo: 10, firstDownLine: 40 }, call: 2, answers: ['wrong', 'correct'] },
  { name: 'defense second miss', seed: DEFENSE, call: 1, answers: ['wrong', 'wrong'] },
  { name: 'defense first try', seed: { ...DEFENSE, down: 3, yardsToGo: 4, firstDownLine: 66 }, call: 0, answers: ['correct'] },
  { name: 'field goal retry', seed: FOURTH, decision: 'fieldGoal', answers: ['wrong', 'correct'] },
  { name: 'punt first try', seed: { ...FOURTH, yardLine: 50, yardsToGo: 10, firstDownLine: 60 }, decision: 'punt', answers: ['correct'] },
]);

const enrollmentFor = (overrides = {}) => ({
  generation: randomUUID(), deviceId: randomUUID(), profileIds: [randomUUID()], activeProfileId: null, ...overrides,
});
const enroll = (page, enrollment) => installConsent(page, enrollment);
const contracts = page => page.evaluate(() => window.__footballTest.activeContracts());
const mode = page => page.evaluate(() => JSON.parse(render_game_to_text()).mode);

// Logs every draw of all three independent seeded streams through the existing seam.
async function seedRng(page, seed) {
  await page.evaluate(root => {
    const make = start => {
      let value = start >>> 0;
      return () => {
        value = (value + 0x6d2b79f5) >>> 0;
        let mixed = value;
        mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
      };
    };
    const log = window.__rngLog = { football: [], scheduler: [], presentation: [] };
    const logged = (name, next) => () => { const value = next(); log[name].push(value); return value; };
    window.__footballTest.setRngStreams({
      football: logged('football', make(root + 1)),
      scheduler: logged('scheduler', make(root + 2)),
      presentation: logged('presentation', make(root + 3)),
    });
  }, seed);
}

async function present(page, step) {
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), step.seed);
  if (step.decision) await page.locator(`#decision-grid .decision-btn[data-action="${step.decision}"]`).click();
  else await page.locator('#call-grid .call-btn').nth(step.call).click();
  await expect.poll(() => mode(page)).toMatch(/^(question|feedback)$/);
}

async function choiceIndex(page, kind) {
  const c = await contracts(page);
  const question = c.questionInstance;
  const index = question.choices.findIndex(choice => kind === 'correct'
    ? choice.id === question.correctChoiceId
    : choice.id !== question.correctChoiceId && !c.questionUi.missedChoiceIds.includes(choice.id));
  if (index < 0) throw new Error(`No ${kind} choice remains for ${question.familyId}`);
  return index;
}

// Real taps on the production answer buttons.
async function answer(page, kind) {
  await page.locator(`#b${await choiceIndex(page, kind)}`).click();
}

async function continueAfterSecondMiss(page) {
  await page.locator('#question-learn-why').click();
  await page.locator('#question-continue').click();
}

async function privateStrings(page) {
  return page.evaluate(() => {
    const q = state.questionInstance, plan = state.activePlay?.context?.privateOpponentSnapshot ?? null;
    const values = [q.prompt.text, q.hint.text, q.workedExplanation.text, q.answer.label, state.match.player.displayName,
      state.match.opponent.displayName, ...q.choices.flatMap(choice => [choice.id, choice.label, choice.ariaLabel])];
    if (plan) values.push(JSON.stringify(plan), ...Object.values(plan).filter(value => typeof value === 'string'));
    return values.filter(value => typeof value === 'string' && value.length >= 4);
  });
}

async function playStep(page, step, secrets) {
  await present(page, step);
  const presented = await contracts(page);
  if ((await mode(page)) === 'question') {
    secrets.push(...await privateStrings(page));
    for (const kind of step.answers) await answer(page, kind);
    if (step.answers.length === 2 && step.answers[1] === 'wrong') {
      expect(await mode(page)).toBe('explanation');
      await continueAfterSecondMiss(page);
    }
  }
  await expect.poll(async () => (await contracts(page)).questionUi.outcomeCommitted).toBe(true);
  const c = await contracts(page);
  return {
    name: step.name,
    family: presented.questionInstance?.familyId ?? null,
    initialSupport: presented.questionUi.support,
    policy: c.pendingResolution?.policy ?? null,
    proposal: c.activePlay.proposal,
    calls: c.activePlay.context?.calls ?? null,
    privatePlan: c.activePlay.context?.privateOpponentSnapshot ?? null,
    score: c.render.score,
    totalYards: c.render.totalYards,
    down: c.render.down,
    ytg: c.render.ytg,
    yard: c.render.absoluteYard,
    pendingNextPossession: c.render.pendingNextPossession,
    completedPlays: c.statsSession.completedPlays.length,
  };
}

async function playScript(page, { enrolled = null, failOutbox = false, offline = false } = {}) {
  const requests = [];
  const errors = [];
  const onRequest = request => requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  const onError = error => errors.push(String(error));
  await page.goto('/football/');
  // Each run starts clean: no hint, no legacy key, no reporting database.
  await page.evaluate(() => localStorage.clear());
  expect(await deleteOutboxDatabase(page)).toBe('deleted');
  page.on('request', onRequest);
  page.on('pageerror', onError);
  // The production updater makes its startup request after 3 seconds. End each
  // run only after observing that same startup boundary: a fast recording-off
  // script otherwise omits it while a slower enrolled script includes it.
  // Keep this real request in the unfiltered privacy comparison below.
  const origin = new URL(page.url()).origin;
  const startupVersionResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === '/version.json' && response.status() === 200;
  });
  await page.goto(BOOT);
  const versionResponse = await startupVersionResponse;
  expect(requests).toContain('GET /version.json');
  const startupVersion = { url: versionResponse.url(), status: versionResponse.status() };

  if (enrolled) await enroll(page, enrolled);
  if (failOutbox) await page.evaluate(() => { window.__failOutbox = true; });
  if (offline) await page.context().setOffline(true);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await seedRng(page, 0x1990c0de);
  const secrets = [];
  const steps = [];
  for (const step of SCRIPT) steps.push(await playStep(page, step, secrets));
  await page.evaluate(async key => {
    await navigator.locks.request(`${key}:central-write`, { mode: 'exclusive' }, () => {});
    await LEARNING_OUTBOX.idle();
  }, STATS);
  const result = await page.evaluate(key => ({
    rng: window.__rngLog,
    stats: localStorage.getItem(key),
    statsSession: window.__footballTest.statsSession(),
    keys: Object.keys(localStorage).sort(),
    idbOpens: window.__idbOpens,
  }), STATS);
  result.databases = await databaseNames(page);
  if (offline) await page.context().setOffline(false);
  page.off('request', onRequest);
  page.off('pageerror', onError);
  return { ...result, steps, secrets, requests, startupVersion, errors, outbox: await readOutbox(page) };
}

// Expected per-question events from the domain-accepted script.
function expectedEvents(step, answers) {
  const events = [];
  if (step.initialSupport === 'guided') events.push(['help', 1, 'guided']);
  answers.forEach((kind, index) => {
    events.push(['attempt', index + 1, kind === 'correct', index === 0 ? step.initialSupport : 'guided']);
    if (kind === 'wrong') events.push(['help', 2, index === 0 ? 'guided' : 'worked']);
  });
  events.push(['resolution', step.policy]);
  return events;
}
const shape = event => event.kind === 'attempt' ? [event.kind, event.number, event.correct, event.support]
  : event.kind === 'help' ? [event.kind, event.number, event.support]
    : event.kind === 'resolution' ? [event.kind, event.resolution] : [event.kind];
function byQuestion(events) {
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.questionInstanceId)) groups.set(event.questionInstanceId, []);
    groups.get(event.questionInstanceId).push(event);
  }
  return [...groups.values()];
}

test('seeded play is identical with recording off, on, offline and failing; recorded events are valid and private', async ({ page }, testInfo) => {
  // Counts indexedDB.open calls; __failOutbox aborts the outbox transaction after its put succeeds.
  await page.addInitScript(outboxSpyScript);
  const off = await playScript(page);
  const on = await playScript(page, { enrolled: enrollmentFor() });
  const offline = await playScript(page, { enrolled: enrollmentFor(), offline: true });
  const failing = await playScript(page, { enrolled: enrollmentFor(), failOutbox: true });
  await testInfo.attach('recording-network-comparison.json', {
    body: JSON.stringify(Object.fromEntries(Object.entries({ off, on, offline, failing }).map(([name, run]) =>
      [name, { startupVersion: run.startupVersion, requests: run.requests }]))),
    contentType: 'application/json',
  });

  // Disabled (the default): no new key, no IndexedDB open or database, no extra request.
  expect(off.keys.filter(key => key.startsWith('learningReporting:'))).toEqual([]);
  expect(off.idbOpens).toBe(0);
  if (off.databases !== null) expect(off.databases).not.toContain('learningReporting');
  expect(off.outbox).toBeNull();
  expect(off.requests.every(request => request.startsWith('GET '))).toBe(true);
  // Recording adds no request of any kind (a cached asset may only be missing).
  expect(on.requests.filter(request => !off.requests.includes(request))).toEqual([]);
  expect(on.requests.every(request => request.startsWith('GET '))).toBe(true);

  // Gameplay invariance: all three RNG logs, opponent plans, proposals, families,
  // commits, score and the persisted stats model (IDs and timings masked).
  for (const run of [on, offline, failing]) {
    expect(run.errors).toEqual([]);
    expect(run.rng).toEqual(off.rng);
    expect(mask(run.steps)).toEqual(mask(off.steps));
    expect(mask(JSON.parse(run.stats))).toEqual(mask(JSON.parse(off.stats)));
    expect(mask(run.statsSession)).toEqual(mask(off.statsSession));
  }
  expect(off.rng.football.length + off.rng.scheduler.length + off.rng.presentation.length).toBeGreaterThan(0);
  expect(off.steps.filter(step => step.family).length).toBeGreaterThanOrEqual(5);
  expect(new Set(off.steps.map(step => step.policy))).toEqual(new Set(['firstTryCorrect', 'retryCorrect', 'secondMiss']));

  // The recorded run: a valid envelope, one question per presented step, exact events.
  for (const run of [on, offline]) {
    expect(run.outbox.valid).toBe(true);
    const events = run.outbox.envelope.events;
    expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1));
    expect(events.every(event => event.game === 'football' && event.gameVersion === '1.34.26')).toBe(true);
    const groups = byQuestion(events);
    const presented = run.steps.map((step, index) => ({ step, answers: SCRIPT[index].answers })).filter(item => item.step.family);
    expect(groups).toHaveLength(presented.length);
    groups.forEach((group, index) => {
      expect(group.map(shape)).toEqual(expectedEvents(presented[index].step, presented[index].answers));
      expect(group.every(event => event.familyId === presented[index].step.family)).toBe(true);
    });
    // Football never carries timing, and nothing private reaches the outbox.
    expect(events.flatMap(Object.keys).filter(key => /ms$|time|elapsed|duration/i.test(key))).toEqual([]);
    for (const secret of new Set(run.secrets)) expect(run.outbox.raw.includes(secret), secret).toBe(false);
    for (const forbidden of ['"prompt"', '"hint"', '"choices"', '"answer"', '"selectedChoiceId"', '"elapsedMs"', '"bindings"',
      '"gameId"', '"playId"', '"calls"', 'privateOpponentSnapshot', '--choice-', '--answer']) {
      expect(run.outbox.raw.includes(forbidden), forbidden).toBe(false);
    }
  }

  // Outbox transaction aborted after its put: play was unchanged above, nothing partial
  // was kept, and the failures are counted once a later transaction completes.
  expect(failing.outbox).toBeNull();
  expect((await page.evaluate(() => LEARNING_OUTBOX.diagnostics())).pendingWriteFailures).toBeGreaterThan(0);
  const pending = (await page.evaluate(() => LEARNING_OUTBOX.diagnostics())).pendingWriteFailures;
  await page.evaluate(() => { window.__failOutbox = false; });
  await playStep(page, SCRIPT[0], []);
  const recovered = await readOutbox(page);
  expect(recovered.valid).toBe(true);
  expect(recovered.envelope.status.writeFailures).toBe(pending);
  expect(recovered.envelope.events.map(event => event.seq)).toEqual(recovered.envelope.events.map((_, index) => index + 1));
  expect(byQuestion(recovered.envelope.events)).toHaveLength(1);
});

// Targets a family introduced after factual completion, which starts guided.
async function presentGuided(page) {
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), { ...OFFENSE, totalYards: { player: 98, opponent: 71 } });
  await page.evaluate(() => {
    const context = FOOTBALL_DOMAIN.normalizeContext({
      contextId: 'outbox-guided-probe', match: state.match, possession: state.possession, direction: state.direction, quarter: state.quarter,
      down: state.down, yardsToGo: state.ytg, yardLine: state.yd, firstDownLine: state.fdYd, driveStart: state.driveStart,
      scores: { player: state.playerScore, opponent: state.opponentScore },
      totalYards: { player: state.playerTotalYards, opponent: state.opponentTotalYards },
      plays: state.plays, drivePlays: state.drivePlays, calls: { offense: 'shortRun', defense: null, matchup: null },
    });
    const snap = FOOTBALL_DOMAIN.createSnap(context, { gain: 2, callKey: 'shortRun', label: 'Short Run' });
    const entries = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(snap, {
      completedThroughPage: FOOTBALL_LEARNING.PROFILE.completedThroughPage,
      includedThroughPage: FOOTBALL_LEARNING.PROFILE.includedThroughPage,
      computationMax: FOOTBALL_LEARNING.PROFILE.computationMax,
      displayMax: FOOTBALL_LEARNING.PROFILE.displayMax,
    }).eligible.map(entry => ({ ...entry, selectionMultiplier: FOOTBALL_CONTEXTUAL_QUESTIONS.selectionFor(snap, entry.familyId).multiplier }));
    const probe = FOOTBALL_LEARNING.createSession();
    let draw = null;
    for (let index = 0; index < 2000 && draw === null; index++) {
      const candidate = (index + 0.5) / 2000;
      if (FOOTBALL_LEARNING.weightedPick(entries, probe, () => candidate).familyId === 'team-yards-past-100') draw = candidate;
    }
    if (draw === null) throw new Error('Could not target team-yards-past-100');
    window.__footballTest.setRngStreams({ football: () => 0, scheduler: () => draw, presentation: () => 0.4 });
  });
  await page.locator('#call-grid .call-btn').filter({ hasText: 'Short Run' }).first().click();
  const c = await contracts(page);
  expect(c.questionInstance.familyId).toBe('team-yards-past-100');
  expect(c.questionUi.support).toBe('guided');
}

test('guided-first, retry and worked help stay distinct; worked help with no later answer stays pending across reload', async ({ page }) => {
  await page.goto(BOOT);
  await enroll(page, enrollmentFor());
  await presentGuided(page);
  await answer(page, 'wrong');
  await answer(page, 'wrong');
  expect(await mode(page)).toBe('explanation');
  let outbox = await readOutbox(page);
  expect(outbox.envelope.events.map(shape)).toEqual([
    ['help', 1, 'guided'], ['attempt', 1, false, 'guided'], ['help', 2, 'guided'], ['attempt', 2, false, 'guided'], ['help', 2, 'worked'],
  ]);
  // The worked explanation is shown but Continue never committed: no resolution.
  await page.reload();
  outbox = await readOutbox(page);
  expect(outbox.envelope.events.map(event => event.kind)).toEqual(['help', 'attempt', 'help', 'attempt', 'help']);
  expect(outbox.envelope.events.some(event => event.kind === 'resolution' || event.kind === 'leftUnfinished')).toBe(false);
  expect(outbox.envelope.events.some(event => Object.prototype.hasOwnProperty.call(event, 'correct') && event.kind !== 'attempt')).toBe(false);
});

async function seededBoot(page, enrollment = enrollmentFor()) {
  await page.goto(BOOT);
  await enroll(page, enrollment);
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  await seedRng(page, 0x1990c0de);
}
async function presentQuestion(page, step) {
  await present(page, step);
  expect(await mode(page)).toBe('question');
  const support = (await contracts(page)).questionUi.support;
  return { support, opening: support === 'guided' ? [['help', 1, 'guided']] : [] };
}

test('a presented question discarded by recovery is an observed leave, never a wrong answer or resolution', async ({ page }) => {
  await seededBoot(page);
  const { support, opening } = await presentQuestion(page, SCRIPT[0]);
  await answer(page, 'wrong');
  // The live state no longer matches the frozen play, so the accepted commit rejects it.
  await page.evaluate(() => { state.yd += 1; });
  await answer(page, 'correct');
  await expect.poll(() => mode(page)).toBe('call');
  const events = (await readOutbox(page)).envelope.events;
  expect(events.map(shape)).toEqual([...opening, ['attempt', 1, false, support], ['help', 2, 'guided'], ['attempt', 2, true, 'guided'], ['leftUnfinished']]);
  expect(new Set(events.map(event => event.questionInstanceId)).size).toBe(1);
  expect(Object.keys(events.at(-1)).slice(11)).toEqual(['familyId', 'concept', 'purpose', 'tier', 'grading', 'evidenceClass']);
});

test('rejected, duplicate and disabled-state taps add no events', async ({ page }) => {
  await seededBoot(page);
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), OFFENSE);
  await page.evaluate(() => { for (let index = 0; index < 4; index++) handleAnswer(index); });
  const { support, opening } = await presentQuestion(page, SCRIPT[0]);
  const wrong = await choiceIndex(page, 'wrong');
  await page.locator(`#b${wrong}`).click();
  await page.evaluate(index => { handleAnswer(index); handleAnswer(index); }, wrong);
  await expect(page.locator(`#b${wrong}`)).toBeDisabled();
  await page.locator(`#b${await choiceIndex(page, 'correct')}`).dblclick();
  await page.evaluate(() => { for (let index = 0; index < 4; index++) handleAnswer(index); });
  const events = (await readOutbox(page)).envelope.events;
  expect(events.map(shape)).toEqual([...opening, ['attempt', 1, false, support], ['help', 2, 'guided'], ['attempt', 2, true, 'guided'], ['resolution', 'retryCorrect']]);
});

test('two tabs answering rapidly allocate unique, strictly increasing seq values', async ({ page, context }) => {
  await seededBoot(page);
  const second = await context.newPage();
  await second.goto(BOOT);
  await expect(second.locator('.curriculum-dialog')).toHaveCount(0);
  await expectFootballTestMuted(second);
  await seedRng(second, 0x2000c0de);
  const tabs = [page, second];
  const openings = [];
  for (const tab of tabs) openings.push((await presentQuestion(tab, SCRIPT[1])).opening.length);
  // Per-step trace: each tab's accepted domain state, its own view of the outbox and
  // its commit record (epoch/seq numbers only). Attached after every step.
  const trace = [];
  async function step(name, expected) {
    await Promise.all(tabs.map(tab => tab.evaluate(() => LEARNING_OUTBOX.idle())));
    const views = await Promise.all(tabs.map(async tab => {
      const c = await contracts(tab);
      return {
        accepted: { mode: c.render.mode, attempt: c.questionUi.attempt, missed: c.questionUi.missedChoiceIds.length, committed: c.questionUi.outcomeCommitted },
        diagnostics: await tab.evaluate(() => LEARNING_OUTBOX.diagnostics()),
        // This tab's own readonly-transaction view of the authoritative outbox record.
        events: (JSON.parse((await readRecords(tab)).outbox || '{"events":[]}').events)
          .map(event => [event.seq, event.eventId, event.kind, event.questionInstanceId]),
      };
    }));
    trace.push({ name, views });
    await test.info().attach(`two-tab-trace-${trace.length}-${name}.json`, { body: JSON.stringify(trace, null, 2), contentType: 'application/json' });
    views.forEach(view => expect(view.accepted, `${name}: accepted state`).toMatchObject(expected));
    expect(views[1].events, `${name}: both tabs read the same outbox`).toEqual(views[0].events);
    const slots = views.flatMap(view => view.diagnostics.commits.flatMap(commit =>
      Array.from({ length: commit.lastSeq - commit.firstSeq + 1 }, (_, index) => `${commit.epochId}:${commit.firstSeq + index}`)));
    // Discriminates the earlier intermittent loss: an observation never queued (adapter
    // or capture refusal) versus queued but not stored (lost update/lock overlap).
    views.forEach((view, index) => {
      const own = openings[index] + (name === 'wrong' ? 2 : 4);
      expect(view.diagnostics.counts, `${name}: tab ${index} queued and stored every own observation`)
        .toMatchObject({ refused: 0, rejected: 0, dropped: 0, queued: own, stored: own });
    });
    const windows = views.flatMap(view => view.diagnostics.commits).filter(commit => commit.start !== null)
      .sort((a, b) => a.start - b.start);
    // Each window runs from the transaction's read to its oncomplete. timeOrigin + now()
    // per page shares the wall clock only to about a millisecond, so a handoff within 1 ms
    // is not called an overlap; a real overlap is also caught exactly by the slot and view checks.
    windows.slice(1).forEach((commit, index) => {
      expect(commit.start, `${name}: readwrite transactions never overlap across tabs`).toBeGreaterThanOrEqual(windows[index].end - 1);
    });
    // Every event a tab's commit reported as completed is in the stored union, exactly once.
    const stored = views[0].events.map(event => event[1]);
    const completed = views.flatMap(view => view.diagnostics.commits.flatMap(commit => commit.eventIds));
    expect([...completed].sort(), `${name}: completed transactions equal the stored events`).toEqual([...stored].sort());
    expect(slots.length, `${name}: no seq allocated twice across tabs`).toBe(new Set(slots).size);
    expect(views[0].events.length, `${name}: every accepted observation is stored`)
      .toBe(openings.reduce((sum, count) => sum + count, 0) + (name === 'wrong' ? 4 : 8));
  }
  await Promise.all([answer(page, 'wrong'), answer(second, 'wrong')]);
  await step('wrong', { mode: 'question', attempt: 2, missed: 1, committed: false });
  await Promise.all([answer(page, 'correct'), answer(second, 'correct')]);
  // After the commit the delayed next-call prompt may already have run, so mode is not pinned.
  await step('correct', { attempt: 2, missed: 1, committed: true });
  const outbox = await readOutbox(page);
  expect(outbox.valid).toBe(true);
  const events = outbox.envelope.events;
  expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1));
  expect(new Set(events.map(event => event.eventId)).size).toBe(events.length);
  const groups = byQuestion(events);
  expect(groups).toHaveLength(2);
  for (const group of groups) {
    expect(group.filter(event => !(event.kind === 'help' && event.number === 1)).map(event => event.kind))
      .toEqual(['attempt', 'help', 'attempt', 'resolution']);
  }
  await second.close();
});

test('a Football tab and a Number facts tab answering together share one envelope with every accepted event', async ({ page, context }) => {
  await seededBoot(page);
  const facts = await context.newPage();
  await facts.addInitScript(() => {
    localStorage.setItem('place-value-practice:mode:v1', 'arithmetic');
    localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts');
  });
  await facts.goto('/place-value-practice/');
  await expect(facts.locator('.curriculum-dialog')).toHaveCount(0);
  await expect(facts.locator('#fact-practice')).toBeVisible();
  await expect(facts.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
  const { opening } = await presentQuestion(page, SCRIPT[1]);
  // Real keypad taps on the production Fact practice controls.
  const factsAnswer = async kind => {
    const value = await facts.evaluate(() => PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
    await facts.locator('.facts-keypad').getByRole('button', { name: 'Clear', exact: true }).click();
    for (const digit of String(kind === 'correct' ? value : (value + 1) % 19)) {
      await facts.locator('.facts-keypad').getByRole('button', { name: digit, exact: true }).click();
    }
    await facts.locator('#facts-check').click();
    await expect(facts.locator('#fact-practice')).toHaveAttribute('aria-busy', 'false');
  };
  await Promise.all([answer(page, 'wrong'), factsAnswer('wrong')]);
  await Promise.all([answer(page, 'correct'), factsAnswer('correct')]);
  await facts.evaluate(() => LEARNING_OUTBOX.idle());
  const outbox = await readOutbox(page);
  expect(outbox.valid).toBe(true);
  const events = outbox.envelope.events;
  expect(events.map(event => event.seq)).toEqual(events.map((_, index) => index + 1));
  expect(events).toHaveLength(opening.length + 4 + 3);
  const groups = byQuestion(events);
  const footballGroup = groups.find(group => group[0].game === 'football');
  const factsGroup = groups.find(group => group[0].game === 'facts');
  expect(footballGroup.filter(event => !(event.kind === 'help' && event.number === 1)).map(event => event.kind))
    .toEqual(['attempt', 'help', 'attempt', 'resolution']);
  expect(factsGroup.map(event => [event.kind, event.number ?? null, event.correct ?? null]))
    .toEqual([['attempt', 1, false], ['attempt', 2, true], ['resolution', null, null]]);
  await facts.close();
});

test('queued events keep the profile active at acceptance after a profile switch', async ({ page }) => {
  const [first, other] = [randomUUID(), randomUUID()];
  const base = { generation: randomUUID(), deviceId: randomUUID(), profileIds: [first, other] };
  await seededBoot(page, enrollmentFor({ ...base, activeProfileId: first }));
  await playStep(page, SCRIPT[0], []);
  await enroll(page, enrollmentFor({ ...base, activeProfileId: other }));
  await playStep(page, SCRIPT[1], []);
  await enroll(page, enrollmentFor({ ...base, activeProfileId: null }));
  await playStep(page, SCRIPT[3], []);
  const groups = byQuestion((await readOutbox(page)).envelope.events);
  expect(groups.map(group => [...new Set(group.map(event => event.profileId))])).toEqual([[first], [other]]);
});

test('the outbox script ships with the release version and loads before football.js', async ({ page }) => {
  await page.goto('/football/');
  const order = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[src]')].map(script => new URL(script.src, location.href));
    const index = name => scripts.findIndex(url => url.pathname.endsWith(name));
    const outbox = scripts[index('/shared/learning-outbox.js')];
    return { version: outbox?.searchParams.get('v'), game: GAME_VERSION, outbox: index('/shared/learning-outbox.js'),
      questions: index('/contextual-questions.js'), football: index('/football.js') };
  });
  expect(order.version).toBe(order.game);
  expect(order.game).toBe('1.34.26');
  expect(order.outbox).toBeGreaterThan(order.questions);
  expect(order.outbox).toBeLessThan(order.football);
});


// Both tabs execute actual production readers; all IndexedDB operations here
// are real browser transactions. The immutable old code is served only to this
// test tab. No production service is contacted.
test('#215 actual released and current tabs preserve mixed coin queues in real IndexedDB',async({page,context},testInfo)=>{
 const oldSource=await readFile(new URL('./fixtures/issue215-learning-outbox-base.js',import.meta.url),'utf8');
 expect(createHash('sha256').update(oldSource).digest('hex')).toBe('6f879318b190bd375f88da6462f11a09b8a07a51bf07252557aeb3bfaf94ed7d');
 await page.route('**/shared/learning-reporting/config.js*',route=>route.fulfill({contentType:'text/javascript',body:"globalThis.LEARNING_REPORTING_CONFIG=Object.freeze({serviceUrl:''});"}));
 await page.goto('/football/');const enrollment=enrollmentFor();await installConsent(page,enrollment);
 const seeded=await page.evaluate(async e=>{
  const token=`lr1_${'ab'.repeat(16)}_${'A'.repeat(43)}`;
  const values={credential:{schemaVersion:1,generation:e.generation,deviceId:e.deviceId,serviceOrigin:'http://127.0.0.1:8199',token},sync:{schemaVersion:1,generation:e.generation,suppressed:[],lastSuccessAt:null,notice:null},binding:{schemaVersion:1,generation:e.generation,facts:null}};
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('learningReporting',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');for(const [key,value]of Object.entries(values))store.put(JSON.stringify(value),key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();return{generation:e.generation,deviceId:e.deviceId,token};
 },enrollment);
 async function bytes(){return page.evaluate(async()=>{await LEARNING_OUTBOX.idle();const db=await new Promise(resolve=>{const r=indexedDB.open('learningReporting',1);r.onsuccess=()=>resolve(r.result);});const result=await new Promise(resolve=>{const tx=db.transaction('records','readonly'),store=tx.objectStore('records'),requests=Object.fromEntries(['enrollment','outbox','credential','sync','binding'].map(k=>[k,store.get(k)]));tx.oncomplete=()=>resolve(Object.fromEntries(Object.entries(requests).map(([k,r])=>[k,r.result??null])));});db.close();return result;});}
 const old=await context.newPage();let uploads=0;
 await old.clock.install();
 await old.route('**/shared/learning-outbox.js*',route=>route.fulfill({contentType:'text/javascript',body:oldSource}));
 await old.route('**/shared/learning-reporting/config.js*',route=>route.fulfill({contentType:'text/javascript',body:"globalThis.LEARNING_REPORTING_CONFIG=Object.freeze({serviceUrl:'http://127.0.0.1:8199'});"}));
 await old.route('http://127.0.0.1:8199/**',route=>{uploads++;return route.fulfill({status:500,body:'test transport must remain unused'});});
 await old.goto('/football/');await expectFootballTestMuted(old);
 await old.evaluate(async()=>{const O=LEARNING_OUTBOX;O.record(O.capture(),{game:'football',gameVersion:'1.34.26',kind:'attempt',questionInstanceId:crypto.randomUUID(),familyId:'line-to-gain-exact',...O.CATALOG.football['line-to-gain-exact'],number:1,correct:true,support:'initial'});await O.idle();window.__preCoinReceipt=await O.syncView();});
 const oldBytes=await bytes();const original=JSON.parse(oldBytes.outbox).events;expect(original).toHaveLength(1);
 await page.evaluate(async()=>{await LEARNING_OUTBOX.snapshot();});expect(await bytes()).toEqual(oldBytes);
 await page.evaluate(async()=>{const O=LEARNING_OUTBOX;O.record(O.capture(),{game:'football',gameVersion:'1.34.26',kind:'attempt',questionInstanceId:crypto.randomUUID(),familyId:'coin-count-dimes-pennies',...O.CATALOG.football['coin-count-dimes-pennies'],number:1,correct:false,support:'initial'});await O.idle();});
 const mixed=await bytes(),mixedEvents=JSON.parse(mixed.outbox).events;expect(mixedEvents.slice(0,1)).toEqual(original);expect(mixedEvents).toHaveLength(2);
 const refused=await old.evaluate(async expected=>{
  const O=LEARNING_OUTBOX,ids=window.__preCoinReceipt.envelope.events.map(e=>e.eventId);
  const snapshot=await O.snapshot(),sync=await O.syncView();
  O.record(O.capture(),{game:'football',gameVersion:'1.34.26',kind:'attempt',questionInstanceId:crypto.randomUUID(),familyId:'line-to-gain-exact',...O.CATALOG.football['line-to-gain-exact'],number:1,correct:true,support:'initial'});await O.idle();
  const ack=await O.acknowledge(ids),rotate=await O.startNewEpoch('seq-conflict');
  const delayed=await O.applySync(expected,{submitted:ids,remove:ids,suppress:[],rotateEpoch:null,syncedAt:null,notice:null});
  await LEARNING_SYNC.syncNow();return{snapshot:snapshot.state,sync:sync.state,ack,rotate,delayed};
 },seeded);
 expect(refused.snapshot).toBe('malformed');expect(refused.sync).toBe('malformed');for(const result of [refused.ack,refused.rotate,refused.delayed])expect(result).toEqual({ok:false,reason:'malformed'});
 expect(uploads).toBe(0);expect(await bytes()).toEqual(mixed);
 const resumed=await page.evaluate(async()=>{const O=LEARNING_OUTBOX,v=await O.syncView();const result=await O.acknowledge(v.envelope.events.map(e=>e.eventId));return{state:v.state,result};});
 expect(resumed).toEqual({state:'ok',result:{ok:true,removed:2}});expect(JSON.parse((await bytes()).outbox).events).toEqual([]);
 await testInfo.attach('mixed-version-real-indexeddb',{body:JSON.stringify({oldCatalogHash:'6f879318b190bd375f88da6462f11a09b8a07a51bf07252557aeb3bfaf94ed7d',refused,resumed,uploads,oldEventIds:original.map(e=>e.eventId),mixedEventIds:mixedEvents.map(e=>e.eventId)},null,2),contentType:'application/json'});
 await old.close();
});
