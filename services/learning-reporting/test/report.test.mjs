// Pure report rules over synthetic reported events (no storage, no network).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildReport, footballOutcome, suggestions, TIMING_CAVEAT, SPARSE, ABSENT } from '../src/report.js';
import { CATALOG, validateEvent } from '../src/validator.js';

const DEVICE = randomUUID(), EPOCH = randomUUID(), PROFILE = randomUUID();
let seq = 0;
const at = day => `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`;
function base(kind, game, qid, day) {
  return { schemaVersion: 1, eventId: randomUUID(), deviceId: DEVICE, epochId: EPOCH, seq: ++seq, profileId: PROFILE,
    game, gameVersion: game === 'football' ? '1.34.22' : '1.9.2', recordedAt: at(day), kind, questionInstanceId: qid };
}
const META = { familyId: 'line-to-gain-exact', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', grading: 'gate', evidenceClass: 'independent' };
const LIT = { familyId: 'yards-to-go-read', concept: 'line-to-gain', purpose: 'coreReview', tier: 'within-10', grading: 'gate', evidenceClass: 'literacy' };
const QUARTER = { familyId: 'quarter-read', concept: 'quarter-read', purpose: 'coreReview', tier: 'football-context', grading: 'gate', evidenceClass: 'literacy' };
function football(steps, day, meta = META) {
  const qid = randomUUID();
  return steps.map(([kind, fields]) => ({ ...base(kind, 'football', qid, day), ...meta, ...fields }));
}
const firstTry = (day, meta) => football([['attempt', { number: 1, correct: true, support: 'initial' }], ['resolution', { resolution: 'firstTryCorrect' }]], day, meta);
const guidedFirst = day => football([['help', { number: 1, support: 'guided' }], ['attempt', { number: 1, correct: true, support: 'guided' }], ['resolution', { resolution: 'firstTryCorrect' }]], day);
const retry = day => football([['attempt', { number: 1, correct: false, support: 'initial' }], ['help', { number: 2, support: 'guided' }], ['attempt', { number: 2, correct: true, support: 'guided' }], ['resolution', { resolution: 'retryCorrect' }]], day);
const secondMiss = day => football([['attempt', { number: 1, correct: false, support: 'initial' }], ['help', { number: 2, support: 'guided' }], ['attempt', { number: 2, correct: false, support: 'guided' }], ['help', { number: 2, support: 'worked' }], ['resolution', { resolution: 'secondMiss' }]], day);
const workedNoAnswer = day => football([['attempt', { number: 1, correct: false, support: 'initial' }], ['help', { number: 2, support: 'guided' }], ['attempt', { number: 2, correct: false, support: 'guided' }], ['help', { number: 2, support: 'worked' }]], day);
function fact(factId, family, outcome, day, { eligible = false, timingMs = null } = {}) {
  const qid = randomUUID(), helped = outcome === 'shown';
  const events = [];
  if (outcome === 'retry') events.push({ ...base('attempt', 'facts', qid, day), factId, family, number: 1, correct: false, helped: false });
  if (helped) events.push({ ...base('help', 'facts', qid, day), factId, family, number: 1, helped: true });
  events.push({ ...base('attempt', 'facts', qid, day), factId, family, number: outcome === 'retry' ? 2 : 1, correct: true, helped });
  events.push({ ...base('resolution', 'facts', qid, day), factId, family, outcome, eligibleCheck: eligible, timingMs: helped ? null : timingMs, helped });
  return events;
}
const report = (events, to = '2026-10-30') => {
  for (const event of events) assert.equal(validateEvent(event), true, JSON.stringify(event));
  return buildReport({ profile: { profileId: PROFILE, label: 'Synthetic A' }, devices: [{ deviceId: DEVICE, name: 'Tablet A', lastSyncAt: at(29), revokedAt: null, shared: false }],
    events, from: '2026-10-01', to, truncated: false, catalog: CATALOG, retentionDays: 90, timeZone: 'UTC', now: Date.parse(at(30)) });
};

test('the timing caveat is the existing on-device wording, verbatim', async () => {
  const source = await readFile(new URL('../../../place-value-practice/fact-practice.js', import.meta.url), 'utf8');
  assert.ok(source.includes(`'${TIMING_CAVEAT}'`));
});

test('Football outcome classes stay distinct: unsupported first try, guided first, retry kinds, second miss with worked, pending help', () => {
  assert.equal(footballOutcome(firstTry(2)), 'firstTry');
  assert.equal(footballOutcome(guidedFirst(2)), 'guidedFirstTry');
  assert.equal(footballOutcome(retry(2)), 'retryAfterHint');
  assert.equal(footballOutcome(football([['help', { number: 1, support: 'guided' }], ['attempt', { number: 1, correct: false, support: 'guided' }], ['help', { number: 2, support: 'guided' }], ['attempt', { number: 2, correct: true, support: 'guided' }], ['resolution', { resolution: 'retryCorrect' }]], 2)), 'guidedRetry');
  assert.equal(footballOutcome(secondMiss(2)), 'secondMissWorked');
  assert.equal(footballOutcome(workedNoAnswer(2)), 'helpWithoutAnswer');
  assert.equal(footballOutcome(football([['attempt', { number: 1, correct: false, support: 'initial' }]], 2)), 'pending');
  assert.equal(footballOutcome(football([['attempt', { number: 1, correct: false, support: 'initial' }], ['leftUnfinished', {}]], 2)), 'leftUnfinished');
  // A first-try resolution without its own unsupported attempt is partial, never independent or wrong.
  assert.equal(footballOutcome(football([['resolution', { resolution: 'firstTryCorrect' }]], 2)), 'partial');
});

test('literacy-only and sparse concepts show no independent evidence and are labeled; absent concepts are never "not practiced"', () => {
  const r = report([...firstTry(3, LIT), ...firstTry(4, QUARTER), ...firstTry(5), ...firstTry(6)]);
  const quarter = r.football.rows.find(row => row.concept === 'quarter-read');
  assert.equal(quarter.independentResults, 0);
  assert.equal(quarter.onlyLiteracyOrNoStakes, true);
  assert.equal(quarter.counts.literacy.firstTry, 1);
  const line = r.football.rows.find(row => row.concept === 'line-to-gain');
  assert.equal(line.counts.independent.firstTry, 2);
  assert.equal(line.counts.literacy.firstTry, 1, 'literacy never counts as independent');
  assert.equal(line.statusLabel, SPARSE);
  assert.ok(r.football.absent.length > 0);
  const text = JSON.stringify(r);
  for (const banned of ['not practiced', 'never checked', 'Not practiced', 'mastery score', 'quick and accurate on the latest two checks']) assert.equal(text.includes(banned), false, banned);
  assert.equal(r.absentLabel, ABSENT);
  // Football shows no timing anywhere.
  assert.equal(/timing|Ms"|seconds/.test(JSON.stringify(r.football)), false);
});

test('Facts: eligible checks, null timing reads "not timed", another try is from reported checks, absence and no-check lists', () => {
  const r = report([
    ...fact('add:3:4', 'family:3:4:7', 'first-correct', 2, { eligible: true, timingMs: 3400 }),
    ...fact('add:3:4', 'family:3:4:7', 'first-correct', 9, { eligible: true, timingMs: null }),
    ...fact('add:7:6', 'family:6:7:13', 'retry', 20),
    ...fact('sub:13:6', 'family:6:7:13', 'shown', 21),
  ]);
  const row = id => r.facts.rows.find(item => item.factId === id);
  assert.equal(row('add:3:4').eligibleChecks, 2);
  assert.equal(row('add:3:4').latestEligibleTiming, 'not timed');
  assert.equal(row('add:3:4').anotherTry, false);
  assert.equal(row('add:7:6').anotherTry, true);
  assert.equal(row('add:7:6').latestEligibleTiming, null);
  assert.equal(row('sub:13:6').answerShown, 1);
  assert.ok(r.facts.noEligibleCheck.includes('7 + 6'));
  assert.ok(r.facts.absent.includes('0 + 0'));
  assert.equal(r.facts.caveat, TIMING_CAVEAT);
  assert.equal(row('add:3:4').statusLabel, SPARSE, 'two completions are below the documented minimum of three');
});

test('pre-enrollment and unsynced practice are simply absent: no item reads "not practiced" or "never checked"', () => {
  // The device practiced add:2:2 before enrollment and add:5:5 while offline; neither was reported.
  const r = report([...fact('add:1:1', 'family:1:1:2', 'first-correct', 3, { eligible: true, timingMs: 2000 })]);
  assert.ok(r.facts.absent.includes('2 + 2') && r.facts.absent.includes('5 + 5'));
  assert.match(r.coverage.exclusions, /before a device was connected/);
  assert.match(r.coverage.exclusions, /not yet sent/);
  assert.match(r.coverage.exclusions, /retention/);
  assert.equal(/not practiced|never checked/i.test(JSON.stringify(r)), false);
});

test('suggestions are deterministic, name a place, include easy review only when available, and stay within limits', () => {
  const events = [
    ...fact('add:7:6', 'family:6:7:13', 'retry', 25),
    ...fact('sub:13:6', 'family:6:7:13', 'shown', 26),
    ...fact('add:3:4', 'family:3:4:7', 'first-correct', 2, { eligible: true, timingMs: 2100 }),
    ...fact('add:3:4', 'family:3:4:7', 'first-correct', 5, { eligible: true, timingMs: 2000 }),
    ...retry(27), ...firstTry(3), ...firstTry(4),
  ];
  const first = report(events), second = report([...events].reverse());
  assert.deepEqual(first.suggestions, second.suggestions);
  assert.ok(first.suggestions.length <= 6);
  assert.ok(first.suggestions.filter(item => item.kind === 'review').length <= 2);
  assert.ok(first.suggestions.every(item => ['Number facts', 'a Football game'].includes(item.place) && item.reason));
  assert.deepEqual(first.suggestions.filter(item => item.kind === 'review').map(item => item.item), ['3 + 4']);
  assert.equal(first.suggestions[0].item, 'Line to gain');
  assert.match(first.suggestionNote, /not a diagnosis/);
  // No easy review exists without older solid evidence.
  assert.equal(report(retry(27)).suggestions.some(item => item.kind === 'review'), false);
  assert.equal(typeof suggestions, 'function');
});
