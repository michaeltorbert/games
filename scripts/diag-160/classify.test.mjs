// Synthetic classifier checks for issue #160 (node --test). Every log here is
// constructed; none is a browser observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, clockBounds } from './classify.mjs';

const VISIBLE = { vis: true, rect: { x: 0, y: 0, w: 1180, h: 820 }, display: 'flex', visibility: 'visible', opacity: '1' };

// One chain: answer at t0..t0+40, arm at t0+20, expect starts at t0+60.
// fire: ms after t0 that the callback runs (null: never). expectEnd: ms after t0.
function chain(events, overlay, t0, {
  fire = 1420, accepted = true, reason = null, kind, activate = true, show = VISIBLE,
  cancelAt = null, cancelSite = 4859, assertion = 'passed', expectEnd = 1500, extraArm = false, extraRoute = null,
} = {}) {
  const [id, defaultKind] = overlay === '#ov-halftime' ? ['ov-halftime', 'halftime'] : ['ov-defense', 'defenseTransition'];
  const add = (w, e) => events.push({ ...e, w, m: w, seq: events.length });
  const timer = 100 + events.length;
  const srcRef = 50 + events.length;
  add(t0 + 20, { k: 'arm', id: timer, delay: 1400, srcRef, src: { possessionId: 'p' } });
  if (extraArm) add(t0 + 21, { k: 'arm', id: timer + 1, delay: 1400, srcRef: srcRef + 1 });
  if (cancelAt != null) add(t0 + cancelAt, { k: 'clear', site: cancelSite, id: timer });
  if (fire != null) {
    add(t0 + fire, { k: 'route', tid: timer, srcRef, src: { possessionId: 'p' }, live: { possessionId: accepted ? 'p' : 'stale' } });
    add(t0 + fire, { k: 'intent', accepted, kind: accepted ? kind ?? defaultKind : null, reason });
    if (!accepted) add(t0 + fire, { k: 'diagnostic', code: 'stale-possession-transition', reason });
    if (accepted) add(t0 + fire, { k: 'activate-enter', id });
    if (accepted && activate) {
      add(t0 + fire + 1, { k: 'activate', id });
      if (show) add(t0 + fire + 2, { k: 'show', id, ...show });
    }
  }
  if (extraRoute != null) add(t0 + extraRoute.at, { k: 'route', tid: 1, srcRef: extraRoute.srcRef ?? srcRef, live: {} });
  const mark = ms => ({ w: t0 + ms, m: t0 + ms });
  return {
    overlay,
    answerStart: mark(0),
    answerEnd: mark(40),
    expectStart: mark(60),
    expectEnd: mark(expectEnd),
    assertion,
    ...(assertion === 'failed' && { grace: { capMs: 3000, polls: 3, found: fire != null ? 'route' : cancelAt != null ? 'clear' : null, truncated: null } }),
  };
}

function diag({ first = {}, second = {}, control = null } = {}) {
  const events = [{ k: 'observer', overlays: 9, w: 900, m: 900, seq: 0 }];
  const chains = [chain(events, '#ov-defense', 1000, first), chain(events, '#ov-halftime', 5000, second)];
  // Buffer order is page time order; the stable sort keeps same-ms task order.
  events.sort((a, b) => a.w - b.w).forEach((e, i) => { e.seq = i; });
  return {
    schema: 1,
    control,
    routes: [{ result: 'instrumented', insertedLines: [3595, 3747] }],
    // The final read follows every event and mark; wall and monotonic agree.
    probes: [{ pre: 20000, preM: 20000, page: 20000, pageM: 20000, post: 20001 }],
    pageErrors: [],
    nodeCapped: 0,
    chains,
    page: { stats: { dropped: 0 }, events, w: 20000, m: 20000 },
  };
}
const FAILED = { assertion: 'failed', expectEnd: 2570 };
const labels = d => classify(d).chains.map(c => c.label);

test('clock bounds intersect probes and widen by truncation', () => {
  assert.deepEqual(clockBounds([{ pre: 10, page: 10, post: 12 }, { pre: 20, page: 21, post: 22 }]), { lo: -1, hi: 2 });
  assert.equal(clockBounds([]), null);
});

test('normal chains pass with descriptive timing', () => {
  const result = classify(diag());
  assert.equal(result.label, 'PASS');
  assert.deepEqual(labels(diag()), ['PASS', 'PASS']);
  assert.equal(result.chains[1].facts.armToRouteMs, 1400);
  assert.equal(result.synthetic, false);
});

test('late callback after the latest deadline is K1', () => {
  const d = diag({ second: { ...FAILED, fire: 4420 } });
  assert.deepEqual(labels(d), ['PASS', 'K1']);
});

test('callback inside the deadline band is U, not K1 or KV', () => {
  assert.deepEqual(labels(diag({ second: { ...FAILED, fire: 2558 } })), ['PASS', 'U']);
  assert.deepEqual(classify(diag({ second: { ...FAILED, fire: 2558 } })).chains[1].reasons, ['boundary-ambiguous']);
});

test('rejected route is K4 with reason and native diagnostic', () => {
  const result = classify(diag({ second: { ...FAILED, accepted: false, reason: 'stale-possession' } }));
  assert.equal(result.chains[1].label, 'K4');
  assert.equal(result.chains[1].facts.reason, 'stale-possession');
  assert.equal(result.chains[1].facts.diagnosticEvent, true);
});

test('cancel of the armed id before any callback is K6 with site', () => {
  const result = classify(diag({ second: { ...FAILED, fire: null, cancelAt: 500, cancelSite: 'control-evaluate' } }));
  assert.equal(result.chains[1].label, 'K6');
  assert.deepEqual(result.chains[1].facts.sites, ['control-evaluate']);
});

test('clear after the callback is not a cancel', () => {
  assert.deepEqual(labels(diag({ first: { cancelAt: 2000 } })), ['PASS', 'PASS']);
});

test('late consumer: visible activation before the deadline with failed assertion is KV', () => {
  const result = classify(diag({ second: FAILED }));
  assert.equal(result.chains[1].label, 'KV');
  assert.ok(result.chains[1].facts.beforeDeadlineMs > 0);
});

test('accepted intent without activation, or with an unrelated exception, is K5', () => {
  assert.deepEqual(labels(diag({ second: { ...FAILED, activate: false } })), ['PASS', 'K5']);
  const d = diag({ second: { ...FAILED, activate: false } });
  d.pageErrors.push({ message: 'boom', stack: 'Error: boom\n    at activateOverlay (http://127.0.0.1:8090/football/football.js:4801:5)' });
  const result = classify(d);
  assert.equal(result.chains[1].label, 'K5');
  assert.equal(result.chains[1].facts.activateEntered, true);
  assert.deepEqual(result.pageErrors, ['boom']);
});

test('activation without visible geometry is K5 on failure and never PASS', () => {
  const hidden = { ...VISIBLE, vis: false, rect: { x: 0, y: 0, w: 0, h: 0 } };
  assert.deepEqual(labels(diag({ second: { ...FAILED, show: hidden } })), ['PASS', 'K5']);
  assert.deepEqual(labels(diag({ second: { show: hidden } })), ['PASS', 'U']);
  assert.deepEqual(labels(diag({ second: { show: null } })), ['PASS', 'U']);
});

test('missing callback without a cancel record is U', () => {
  const result = classify(diag({ second: { ...FAILED, fire: null } }));
  assert.equal(result.chains[1].label, 'U');
  assert.deepEqual(result.chains[1].reasons, ['no-callback-no-cancel', 'grace-expired']);
});

test('multiple arms, linked routes or unlinked routes are U', () => {
  assert.deepEqual(labels(diag({ second: { extraArm: true } })), ['PASS', 'U']);
  assert.deepEqual(labels(diag({ second: { extraRoute: { at: 1430 } } })), ['PASS', 'U']);
  assert.deepEqual(classify(diag({ second: { extraRoute: { at: 1430, srcRef: 999 } } })).chains[1].reasons, ['unlinked-route:1']);
});

test('missing fields and missing observers are U, never PASS', () => {
  const noEnd = diag();
  delete noEnd.chains[1].expectEnd;
  assert.deepEqual(classify(noEnd).chains[1].reasons, ['missing-field:expectEnd']);
  const noGrace = diag({ second: FAILED });
  delete noGrace.chains[1].grace;
  assert.deepEqual(classify(noGrace).chains[1].reasons, ['missing-field:grace']);
  const noObserver = diag();
  noObserver.page.events.shift();
  assert.equal(classify(noObserver).label, 'U');
  const observerError = diag();
  observerError.page.events.push({ k: 'observer-error', seq: 999, w: 9999, m: 9999 });
  assert.equal(classify(observerError).label, 'U');
  const truncated = diag();
  truncated.page.stats.dropped = 1;
  assert.equal(classify(truncated).label, 'U');
  const noProbe = diag();
  noProbe.probes = [];
  assert.equal(classify(noProbe).label, 'U');
  const uncollected = diag();
  uncollected.page = null;
  uncollected.collection = 'timeout';
  assert.deepEqual(classify(uncollected).chains[0].reasons, ['collection-failed:timeout']);
  const noChains = diag();
  noChains.chains = [];
  assert.equal(classify(noChains).label, 'U');
});

test('instrumentation defects stop as TOOL-DEFECT', () => {
  const inserted = diag();
  inserted.pageErrors.push({ message: 'x', stack: 'TypeError: x\n    at routePossessionPresentation (http://127.0.0.1:8090/football/football.js:3595:30)' });
  assert.equal(classify(inserted).label, 'TOOL-DEFECT');
  const mismatch = diag();
  mismatch.routes = [{ result: 'hash-mismatch' }];
  assert.deepEqual(classify(mismatch).reasons, ['route-hash-mismatch']);
  const unserved = diag();
  unserved.routes = [];
  assert.deepEqual(classify(unserved).reasons, ['instrumentation-not-served']);
});

test('a native page exception beside complete PASS chains is U, not a clean run', () => {
  const d = diag();
  d.pageErrors.push({ message: 'unrelated', stack: 'Error: unrelated\n    at x (http://127.0.0.1:8090/football/football.js:10:1)' });
  const result = classify(d);
  assert.deepEqual(result.chains.map(c => c.label), ['PASS', 'PASS']);
  assert.equal(result.label, 'U');
  assert.deepEqual(result.reasons, ['page-errors-unattributed']);
});

test('an assertion that failed before its timeout gets no timing label', () => {
  // Early rejection: expect ended 1000ms after it started; callback/activation timely.
  const early = classify(diag({ second: { assertion: 'failed', expectEnd: 1060 } }));
  assert.deepEqual(early.chains[1].reasons, ['assertion-interval-short']);
  const earlyLate = classify(diag({ second: { assertion: 'failed', expectEnd: 1060, fire: 4420 } }));
  assert.equal(earlyLate.chains[1].label, 'U');
});

test('wall-clock steps or inverted marks make the chain U', () => {
  // Node wall clock jumps 500ms during the assertion; monotonic does not.
  const nodeStep = diag({ second: FAILED });
  nodeStep.chains[1].expectEnd.w += 500;
  assert.deepEqual(classify(nodeStep).chains[1].reasons, ['node-clock-inconsistent']);
  // A step after the assertion, seen only between expectEnd and the last probe.
  const lateStep = diag();
  lateStep.probes[0].pre += 400;
  lateStep.probes[0].post += 400;
  lateStep.probes[0].page += 400;
  assert.equal(classify(lateStep).chains[0].label, 'U');
  // Page wall clock jumps between arm and callback.
  const pageStep = diag({ second: { ...FAILED, fire: 4420 } });
  pageStep.page.events.find(e => e.k === 'route' && e.w > 9000).w -= 3000;
  assert.equal(classify(pageStep).chains[1].label, 'U');
  // Marks out of order.
  const inverted = diag();
  [inverted.chains[0].answerEnd, inverted.chains[0].expectStart] = [inverted.chains[0].expectStart, inverted.chains[0].answerEnd];
  assert.deepEqual(classify(inverted).chains[0].reasons, ['node-clock-inconsistent']);
  // No monotonic probe after the assertion.
  const noLate = diag();
  delete noLate.probes[0].preM;
  assert.deepEqual(classify(noLate).chains[0].reasons, ['node-clock-unverified']);
});

test('slewing within tolerance keeps the label', () => {
  const slew = diag({ second: { ...FAILED, fire: 4420 } });
  slew.chains[1].expectEnd.w += 2; // 2ms over ~2.5s: within 2ms + 1000ppm
  assert.equal(classify(slew).chains[1].label, 'K1');
});

test('control diags are marked synthetic', () => {
  assert.equal(classify(diag({ control: 'block', second: { ...FAILED, fire: 4420 } })).synthetic, true);
});
