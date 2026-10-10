// Issue #160 chain classifier. Pure; input is one diag160.json from fixture.mjs.
// One chain per scenario (defense transition, then halftime). Labels and the
// only claims they allow (README.md has the full table):
//   PASS         complete linked chain with visible geometry; assertion passed
//   K1           callback ran after the latest possible deadline, then accepted,
//                activated and showed visible geometry. Cause of delay not established.
//   K4           callback ran and the route was rejected (reason recorded)
//   K5           accepted intent, then no target activation, or activation
//                without visible geometry. Observed gap; attribution required.
//   K6           the armed id was cleared at a recorded site before any callback
//   KV           visible activation measured before the earliest possible
//                deadline, assertion failed. No cause claimed.
//   U            incomplete, ambiguous, multiple, or inside the clock band
//   TOOL-DEFECT  instrumentation not served as built, or an exception at an
//                inserted line. Stop and checkpoint; not a natural anomaly.
// A diag with `control` set is SYNTHETIC; its labels are never natural causes.
// Any uncaught page exception makes an otherwise all-PASS diag U.

export const DEADLINE_MS = 2500;
const OVERLAYS = {
  '#ov-defense': ['ov-defense', 'defenseTransition'],
  '#ov-halftime': ['ov-halftime', 'halftime'],
};

// Node and page Date.now read the same host clock; each probe bounds the
// offset (node - page) by its Node pre/post bracket, +-1ms for ms truncation.
export function clockBounds(probes = []) {
  let lo = -Infinity;
  let hi = Infinity;
  for (const p of probes) {
    lo = Math.max(lo, p.pre - p.page - 1);
    hi = Math.min(hi, p.post - p.page + 1);
  }
  return Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? { lo, hi } : null;
}

export function toolDefects(diag) {
  const out = [];
  if (diag.fixtureError) out.push(`fixture-error:${diag.fixtureError}`);
  const routes = diag.routes ?? [];
  if (!routes.length) out.push('instrumentation-not-served');
  for (const route of routes) if (route.result !== 'instrumented') out.push(`route-${route.result}`);
  const inserted = new Set(routes.flatMap(route => route.insertedLines ?? []));
  for (const error of diag.pageErrors ?? []) {
    for (const [, line] of String(error.stack ?? '').matchAll(/football\.js(?:\?[^\s:)]*)?:(\d+):\d+/g)) {
      if (inserted.has(Number(line))) out.push(`exception-at-inserted-line:${line}`);
    }
  }
  return [...new Set(out)];
}

function globalGaps(diag) {
  const events = diag.page?.events;
  if (!Array.isArray(events)) return [`collection-failed:${diag.collection ?? 'missing'}`];
  const gaps = [];
  if (diag.page.stats?.dropped) gaps.push('buffer-truncated');
  const observers = events.filter(e => e.k === 'observer');
  if (!observers.length || observers.some(e => !(e.overlays > 0))) gaps.push('observer-missing');
  if (events.some(e => e.k === 'observer-error')) gaps.push('observer-error');
  if (!clockBounds(diag.probes)) gaps.push('no-clock-probe');
  if (diag.nodeCapped) gaps.push('node-records-capped');
  return gaps;
}

// Wall-clock comparisons (page events against Node marks, both Date.now on one
// host clock) are only trusted when each process's wall and monotonic deltas
// agree between two readings: within 2ms (Date.now truncates to whole ms, so a
// difference of two readings can be off by under 1ms, plus performance.now
// coarsening) plus 1000ppm of the interval (covers NTP slewing, at most
// 500ppm). A larger gap means the wall clock stepped; the chain is then U.
// A step common to both processes leaves the probe offsets unchanged, so it is
// detected here, from the monotonic clocks, not from the probes.
export const steady = (a, b) => Math.abs((b.w - a.w) - (b.m - a.m)) <= 2 + Math.abs(b.m - a.m) * 1e-3;
const timed = e => Number.isFinite(e?.w) && Number.isFinite(e?.m);
const ordered = (a, b) => b.m >= a.m && steady(a, b);

// late.node: the last Node probe (wall pre, monotonic preM); late.page: the
// final buffer read's page wall/monotonic time.
function classifyChain(c, index, events, clock, late) {
  const base = { index, overlay: c.overlay ?? null, assertion: c.assertion ?? null };
  const u = (...reasons) => ({ ...base, label: 'U', reasons });
  const [overlayId, expectedKind] = OVERLAYS[c.overlay] ?? [];
  if (!overlayId) return u('unknown-overlay');
  const marks = ['answerStart', 'answerEnd', 'expectStart', 'expectEnd'];
  for (const key of marks) if (!timed(c[key])) return u(`missing-field:${key}`);
  if (!['passed', 'failed'].includes(c.assertion)) return u('missing-field:assertion');
  const failed = c.assertion === 'failed';
  if (failed && !c.grace) return u('missing-field:grace');
  // Node chronology from the first mark through the last probe.
  const nodeTimes = [...marks.map(key => c[key]), late.node];
  if (!timed(late.node)) return u('node-clock-unverified');
  if (nodeTimes.some((t, i) => i && !ordered(nodeTimes[i - 1], t))) return u('node-clock-inconsistent');
  // A failed assertion must have spent its whole timeout; an earlier rejection
  // has no deadline interval to compare against.
  if (failed && c.expectEnd.m - c.expectStart.m < DEADLINE_MS - 1) return u('assertion-interval-short');

  const lo = e => e.w + clock.lo;
  const hi = e => e.w + clock.hi;
  const arms = events.filter(e => e.k === 'arm' && hi(e) >= c.answerStart.w && lo(e) <= c.answerEnd.w);
  if (arms.length !== 1) return u(`arm-count:${arms.length}`);
  const [arm] = arms;
  if (!timed(arm) || arm.srcRef == null) return u('missing-field:arm');
  if (!timed(late.page) || !ordered(arm, late.page)) return u('page-clock-unverified');
  const next = events.find(e => e.k === 'arm' && e.seq > arm.seq);
  const span = events.filter(e => e.seq > arm.seq && (!next || e.seq < next.seq));
  const routes = span.filter(e => e.k === 'route');
  const linked = routes.filter(e => e.srcRef != null && e.srcRef === arm.srcRef);
  if (routes.length > linked.length) return u(`unlinked-route:${routes.length - linked.length}`);
  if (linked.length > 1) return u(`multiple-routes:${linked.length}`);
  const [route] = linked;
  const cancels = span.filter(e => e.k === 'clear' && e.id === arm.id && (!route || e.seq < route.seq));
  const facts = { armId: arm.id, grace: c.grace ?? null, control: c.control ?? null };
  const label = (name, extra = {}) => ({ ...base, label: name, reasons: [], facts: { ...facts, ...extra } });

  if (cancels.length && route) return u('cancel-and-callback');
  if (!failed && cancels.length) return u('pass-with-cancel');
  if (!failed && !route) return u('pass-without-callback');
  if (cancels.length) return label('K6', { sites: cancels.map(e => e.site) });
  if (!route) return u('no-callback-no-cancel', c.grace?.truncated ? `grace:${c.grace.truncated}` : 'grace-expired');
  if (!timed(route) || !ordered(arm, route)) return u('page-clock-inconsistent:route');

  const timing = { armToRouteMs: route.m - arm.m, routeNode: [lo(route), hi(route)], clockBandMs: clock.hi - clock.lo };
  const intent = span.find(e => e.k === 'intent' && e.seq > route.seq);
  if (!intent) return u('intent-missing');
  if (!intent.accepted) {
    if (!failed) return u('pass-with-rejection');
    const diagnosticEvent = span.some(e => e.k === 'diagnostic' && e.seq > route.seq && e.code === 'stale-possession-transition');
    return label('K4', { reason: intent.reason, diagnosticEvent, src: route.src, live: route.live, ...timing });
  }
  if (intent.kind !== expectedKind) return u(`unexpected-kind:${intent.kind}`);
  const activations = span.filter(e => e.k === 'activate' && e.id === overlayId && e.seq > route.seq);
  if (activations.length > 1) return u(`multiple-activations:${activations.length}`);
  if (!activations.length) {
    if (!failed) return u('pass-without-activation');
    const entered = span.some(e => e.k === 'activate-enter' && e.id === overlayId && e.seq > route.seq);
    return label('K5', { gap: 'accepted-no-activation', activateEntered: entered, ...timing });
  }
  const [activation] = activations;
  const show = span.find(e => e.k === 'show' && e.id === overlayId && e.seq > activation.seq);
  if (!show) return u('visibility-unobserved');
  if (!timed(show) || !ordered(route, show)) return u('page-clock-inconsistent:show');
  const geometry = { vis: show.vis, rect: show.rect, display: show.display, visibility: show.visibility, opacity: show.opacity };
  const visible = show.vis === true && show.rect?.w > 0 && show.rect?.h > 0
    && show.display !== 'none' && show.visibility !== 'hidden';
  Object.assign(timing, {
    routeToShowMs: show.m - route.m,
    answerEndToExpectStartMs: c.expectStart.m - c.answerEnd.m,
    showFromExpectStartMs: [lo(show) - c.expectStart.w, hi(show) - c.expectStart.w],
  });
  if (!visible) return failed ? label('K5', { gap: 'activated-not-visible', geometry, ...timing }) : u('pass-without-visible-geometry');
  if (!failed) {
    if (lo(show) > c.expectEnd.w) return u('selfcheck:visible-after-passing-expect');
    return label('PASS', { geometry, ...timing, deadlineMarginMs: c.expectStart.w + DEADLINE_MS - hi(show) });
  }
  // The assertion deadline lies in [expectStart + 2500, expectEnd] on the Node clock.
  const deadlineLo = c.expectStart.w + DEADLINE_MS;
  const deadlineHi = c.expectEnd.w;
  if (hi(show) < deadlineLo) return label('KV', { geometry, ...timing, beforeDeadlineMs: deadlineLo - hi(show) });
  if (lo(route) > deadlineHi) return label('K1', { geometry, ...timing, afterDeadlineMs: lo(route) - deadlineHi });
  return u('boundary-ambiguous');
}

export function classify(diag) {
  const synthetic = Boolean(diag.control);
  const pageErrors = (diag.pageErrors ?? []).map(e => e.message);
  const defects = toolDefects(diag);
  if (defects.length) return { label: 'TOOL-DEFECT', synthetic, reasons: defects, pageErrors, chains: [] };
  const gaps = globalGaps(diag);
  const clock = clockBounds(diag.probes);
  const lastProbe = (diag.probes ?? []).filter(p => Number.isFinite(p.preM)).sort((a, b) => a.preM - b.preM).at(-1);
  const late = { node: lastProbe && { w: lastProbe.pre, m: lastProbe.preM }, page: diag.page && { w: diag.page.w, m: diag.page.m } };
  const chains = (diag.chains ?? []).map((c, i) => (gaps.length
    ? { index: i, overlay: c.overlay ?? null, assertion: c.assertion ?? null, label: 'U', reasons: gaps }
    : classifyChain(c, i, diag.page.events, clock, late)));
  const odd = chains.find(c => c.label !== 'PASS');
  // An uncaught page exception is never part of a clean run, even beside
  // complete PASS chains; it is retained unattributed, not called a production defect.
  const unattributed = !odd && chains.length && pageErrors.length;
  return {
    label: !chains.length || unattributed ? 'U' : odd ? odd.label : 'PASS',
    synthetic,
    reasons: [...(chains.length ? [] : ['no-chains']), ...(unattributed ? ['page-errors-unattributed'] : [])],
    clock,
    pageErrors,
    chains,
  };
}
