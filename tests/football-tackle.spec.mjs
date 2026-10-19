// Issue #169: an opponent-colored defender makes visible contact with the Duke
// ball carrier when a committed player-offense play ends in a tackle.
// Issue #189: the defender is already lined up at every ordinary player-offense
// call, stays still through the question, a first miss and the worked
// explanation, then runs from that painted spot to the committed endpoint. Any
// other ending sends him away where he stands.
//
// Every case drives the real production path: tapped call, tapped answer (or
// two tapped misses, Learn why and Continue), commitPendingResolution() and the
// public football:result event. Timelines come from a real requestAnimationFrame
// sampler anchored on that event, on the wall clock; page.clock is never
// installed and no animation is finished, seeked or disabled by the test. Each
// sample records the elapsed time, the tackler's state and the bounding boxes of
// individual SVG parts (gloves, forearms, pads, helmet against the carrier's
// jersey, pads, hips and sleeves), not the wrapper divs. A required phase with
// no sample fails as incomplete evidence; nothing is retried.
// Evidence JSON is written before any assertion, into a new run directory under
// tests/artifacts.nosync/tackle/ (never release-matrix/), so failures are kept.
// This is engine emulation, not native Safari, Simulator or device evidence.
//
// #189 semantic replacements (no coverage was deleted):
// - "no tackler before the commit" becomes: an ordinary player-offense call
//   shows the staged defender, still, fully opaque, inside the field and clear of
//   the carrier through every pre-commit frame; every other phase shows none.
// - "tackler only during this play's feedback" becomes: this play's defender only
//   during its feedback, plus the next play's staged defender once its ordinary
//   call is on screen.
// - "approach fades in from a 56 px offset" becomes: the pursuit's first frame is
//   the staged spot (stable body anchor; the legs start swinging at once), it
//   stays fully opaque, and it moves straight and monotonically toward the
//   contact spot no faster than the carrier's own curve allows.
// - "excluded endings never show a defender" becomes: player-offense endings
//   that are not tackles release the staged defender in place (reduced motion:
//   at once) before feedback ends; opponent possessions and special teams still
//   never show one.
import { test, expect } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const PRIMARY = 'ipad-11-landscape';
const RESIZE_PROJECTS = new Set(['ipad-11-landscape', 'ipad-11-portrait', 'iphone-15-portrait']);
const RUN_STAMP = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const SAMPLE_UNTIL_MS = 2300;
const EDGE_EPSILON = 0.5;
const POS_EPSILON = 0.5;
const PURSUIT_MS = 750;
const FRAME_MS = 1000 / 60;
const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  pageErrors.set(page, errors);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'uncaught browser errors').toEqual([]);
});

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== PRIMARY,
    'Tackle eligibility, events, RNG, lifecycle and colors are viewport independent; they run once on the primary iPad 11 landscape target.');
}

// The carrier's and the pursuit's shared timing curve, cubic-bezier(.25,.46,.45,.94).
function cubicBezier(x1, y1, x2, y2) {
  const at = (a1, a2, t) => 3 * a1 * t * (1 - t) ** 2 + 3 * a2 * t * t * (1 - t) + t ** 3;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid; else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
const CARRIER_EASE = cubicBezier(0.25, 0.46, 0.45, 0.94);

async function writeEvidence(page, testInfo, label, data) {
  const engine = page.context().browser()?.browserType().name() ?? 'browser';
  const dir = path.join(process.cwd(), 'tests', 'artifacts.nosync', 'tackle', RUN_STAMP,
    `${engine}-${testInfo.project.name}`);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${label}.json`);
  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    innerWidth,
    innerHeight,
    devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  })).catch(error => ({ unavailable: String(error) }));
  await fs.writeFile(file, JSON.stringify({
    label,
    engine,
    engineVersion: page.context().browser()?.version() ?? null,
    project: testInfo.project.name,
    projectUse: {
      viewport: testInfo.project.use.viewport,
      deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
      isMobile: testInfo.project.use.isMobile,
      hasTouch: testInfo.project.use.hasTouch,
    },
    environment,
    tier: 'Playwright engine emulation; not native Safari, Simulator or device evidence',
    ...data,
  }, null, 2));
  await testInfo.attach(`${label}.json`, { path: file, contentType: 'application/json' });
}

// One page-side measurement shared by the sampler and the staging probes. It reads
// only public geometry: drawn SVG parts, wrapper boxes and computed styles.
async function installProbe(page) {
  await page.evaluate(() => {
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const drawn = (sprite) => {
      const parts = [...sprite.querySelectorAll('svg *')].map(node => node.getBoundingClientRect())
        .filter(rect => rect.width > 0 || rect.height > 0);
      if (!parts.length) return { count: 0, bounds: null };
      return {
        count: parts.length,
        bounds: {
          left: Math.min(...parts.map(r => r.left)), right: Math.max(...parts.map(r => r.right)),
          top: Math.min(...parts.map(r => r.top)), bottom: Math.max(...parts.map(r => r.bottom)),
        },
      };
    };
    window.__tkMeasure = (elapsed) => {
      const player = document.getElementById('player');
      const field = document.getElementById('field-wrap');
      const tackler = document.getElementById('tackler');
      const ball = document.getElementById('ball');
      const badge = document.querySelector('.fd-chain-badge');
      const fieldBox = field.getBoundingClientRect();
      const inner = {
        left: fieldBox.left + field.clientLeft,
        right: fieldBox.left + field.clientLeft + field.clientWidth,
        top: fieldBox.top + field.clientTop,
        bottom: fieldBox.top + field.clientTop + field.clientHeight,
      };
      const tacklerStyle = tackler ? getComputedStyle(tackler) : null;
      const shown = Boolean(tackler) && !tackler.classList.contains('tackler-hidden') && tacklerStyle.display !== 'none';
      const carrierShown = !player.classList.contains('player-hidden');
      let bounds = null;
      let partCount = 0;
      let body = null;
      let pos = null;
      const contactPairs = [];
      if (shown) {
        ({ count: partCount, bounds } = drawn(tackler));
        body = box(tackler);
        // The body anchor: the wrapper's center, relative to the field's left
        // edge and to the defender's own CSS row (top: 54%), so a field that
        // changes height between phases does not read as movement.
        pos = {
          x: (body.left + body.right) / 2 - inner.left,
          y: (body.top + body.bottom) / 2 - (inner.top + parseFloat(tacklerStyle.top)),
        };
        const defender = {
          glove: [...tackler.querySelectorAll('.pl-glove')],
          forearm: [...tackler.querySelectorAll('.pl-forearm')],
          pads: [...tackler.querySelectorAll('.pl-pads')],
          helmet: [...tackler.querySelectorAll('.pl-helmet')],
        };
        const carrier = {
          jersey: [...player.querySelectorAll('.pl-jersey')],
          pads: [...player.querySelectorAll('.pl-pads')],
          hips: [...player.querySelectorAll('.pl-hips')],
          sleeve: [...player.querySelectorAll('.pl-sleeve')],
        };
        for (const [defenderPart, defenderNodes] of Object.entries(defender)) {
          for (const [carrierPart, carrierNodes] of Object.entries(carrier)) {
            const touching = defenderNodes.some(a => carrierNodes.some(b => overlaps(box(a), box(b))));
            if (touching) contactPairs.push(`${defenderPart}->${carrierPart}`);
          }
        }
      }
      const carrierBounds = carrierShown ? drawn(player).bounds : null;
      const ballBox = ball ? box(ball) : null;
      const badgeBox = badge ? box(badge) : null;
      return {
        elapsed,
        at: performance.now(),
        phase: document.getElementById('ui-desk')?.dataset.phase ?? null,
        overlay: document.querySelector('.overlay.show')?.dataset.overlay ?? null,
        tacklerPresent: Boolean(tackler),
        shown,
        opacity: shown ? Number(tacklerStyle.opacity) : 0,
        tacklePhase: tackler?.dataset.tacklePhase ?? null,
        contact: contactPairs.length > 0,
        contactPairs,
        partCount,
        bounds,
        body,
        pos,
        carrierBounds,
        separated: bounds && carrierBounds ? !overlaps(bounds, carrierBounds) : null,
        badgeOverlap: bounds && badgeBox ? overlaps(bounds, badgeBox) : null,
        ballOverlap: bounds && ballBox ? overlaps(bounds, ballBox) : null,
        ballAbove: ball && tackler ? Number(getComputedStyle(ball).zIndex) > Number(tacklerStyle.zIndex) : null,
        inner,
        runningTacklerAnimations: tackler
          ? tackler.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length : 0,
        carrierLeftRunning: player.getAnimations().some(a => a.transitionProperty === 'left' && a.playState === 'running'),
        carrierHidden: !carrierShown,
        carrierInlinePct: parseFloat(player.style.left),
        ballInlinePct: parseFloat(document.getElementById('ball').style.left),
        celebrating: player.classList.contains('player-celebrating'),
        celebrateQuick: player.classList.contains('player-celebrate-quick'),
        jerseyFill: shown ? getComputedStyle(tackler.querySelector('.pl-jersey')).fill : null,
        helmetFill: shown ? getComputedStyle(tackler.querySelector('.pl-helmet')).fill : null,
        draws: window.__tkDraws ? { ...window.__tkDraws } : null,
        innerWidth,
      };
    };
  });
}

async function openGame(page, { reducedMotion = 'no-preference', url = '/football/?boot=offense-call' } = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.goto(url);
  // The fixture already proved this after navigation; repeat it before the first input.
  await expectFootballTestMuted(page);
  await installProbe(page);
}

function probe(page) {
  return page.evaluate(() => window.__tkMeasure(null));
}

// Constant streams keep gains known (Short Run 2, Medium Pass 8, Long Pass 12)
// and count every draw from each logical stream.
async function installCountingStreams(page) {
  await page.evaluate(() => {
    window.__tkDraws = { football: 0, scheduler: 0, presentation: 0 };
    const make = (name, value) => () => { window.__tkDraws[name] += 1; return value; };
    window.__footballTest.setRngStreams({
      football: make('football', 0),
      scheduler: make('scheduler', 0.25),
      presentation: make('presentation', 0.5),
    });
  });
}

function markersAtRest(page) {
  return page.waitForFunction(() => ['ball', 'player'].every((id) => {
    const element = document.getElementById(id);
    return element.style.transition === ''
      && !element.getAnimations().some(animation => animation.transitionProperty === 'left');
  }), null, { timeout: 5000 });
}

async function seedDrive(page, drive) {
  const possession = drive.possession || 'offense';
  const direction = possession === 'offense' ? 1 : -1;
  const yardLine = drive.yardLine;
  const firstDownLine = drive.firstDownLine;
  await page.evaluate((seed) => window.__footballTest.seedDriveState(seed), {
    possession,
    direction,
    quarter: 1,
    down: drive.down || 1,
    yardsToGo: Math.abs(firstDownLine - yardLine),
    yardLine,
    firstDownLine,
    driveStart: yardLine,
    scores: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
    ...(drive.rivalId ? { rivalId: drive.rivalId } : {}),
  });
  await markersAtRest(page);
}

async function tapCall(page, side, key) {
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 6000 });
  const index = await page.evaluate(({ side, key }) => {
    const keys = window.__footballTest.callKeys()[side];
    return key === null ? 0 : keys.indexOf(key);
  }, { side, key });
  expect(index, `${key} is a ${side} call`).toBeGreaterThanOrEqual(0);
  await page.locator('#call-grid .call-btn').nth(index).tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
}

async function tapDecision(page, action) {
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'fourth-down-decision', { timeout: 6000 });
  await page.locator(`#decision-grid .decision-btn[data-action="${action}"]`).tap();
}

async function choiceIndexes(page) {
  return page.evaluate(() => {
    const question = window.__footballTest.activeContracts().questionInstance;
    const correct = question.choices.findIndex(choice => choice.id === question.correctChoiceId);
    const wrong = question.choices.map((choice, index) => index).filter(index => index !== correct);
    return { correct, wrong };
  });
}

// The tap that commits: a correct answer, a miss then the correct retry, or two
// misses then Learn why and Continue.
async function commitByTaps(page, answer) {
  const { correct, wrong } = await choiceIndexes(page);
  expect(correct).toBeGreaterThanOrEqual(0);
  if (answer === 'correct') {
    await page.locator(`#b${correct}`).tap();
    return;
  }
  if (answer === 'retryCorrect') {
    expect(wrong.length).toBeGreaterThanOrEqual(1);
    await page.locator(`#b${wrong[0]}`).tap();
    await expect(page.locator(`#b${correct}`)).toBeEnabled();
    await page.locator(`#b${correct}`).tap();
    return;
  }
  expect(wrong.length).toBeGreaterThanOrEqual(2);
  await page.locator(`#b${wrong[0]}`).tap();
  await expect(page.locator(`#b${wrong[1]}`)).toBeEnabled();
  await page.locator(`#b${wrong[1]}`).tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  await page.locator('#question-learn-why').tap();
  await expect(page.locator('#question-continue')).toBeVisible();
  await page.locator('#question-continue').tap();
}

// Installed before the committing tap. Pre-commit frames are sampled too. T0 is
// the synchronous football:result dispatch; the defender is measured there
// (before any re-anchoring), again in a microtask once the commit task has
// finished but before anything is painted (time zero), and then on
// requestAnimationFrame with performance.now().
async function armSampler(page, { until = SAMPLE_UNTIL_MS } = {}) {
  await page.evaluate((until) => {
    const player = document.getElementById('player');
    const measure = window.__tkMeasure;
    const rec = {
      until, t0: null, timeOrigin: performance.timeOrigin, resultCount: 0, result: null,
      drawsAtResult: null, arrivals: [], resizes: [], preResizes: [], samples: [], pre: [],
      before: null, atDispatch: null, timeZero: null, done: false,
    };
    window.__tk = rec;
    rec.before = measure(null);
    const preTick = () => {
      if (rec.t0 !== null) return;
      if (rec.pre.length < 600) rec.pre.push(measure(null));
      requestAnimationFrame(preTick);
    };
    requestAnimationFrame(preTick);
    const onCarrierEnd = (event) => {
      if (event.target !== player || event.propertyName !== 'left' || rec.t0 === null) return;
      rec.arrivals.push({ type: event.type, elapsed: performance.now() - rec.t0 });
    };
    player.addEventListener('transitionend', onCarrierEnd);
    player.addEventListener('transitioncancel', onCarrierEnd);
    addEventListener('resize', () => {
      if (rec.t0 !== null) rec.resizes.push(performance.now() - rec.t0);
      else rec.preResizes.push(performance.now());
    });
    addEventListener('football:result', ({ detail }) => {
      rec.resultCount += 1;
      if (rec.t0 !== null) return;
      rec.t0 = performance.now();
      const transition = detail.transition || {};
      rec.result = {
        playType: detail.playType,
        possession: detail.possession,
        policy: detail.policy,
        outcome: detail.outcome,
        appliedGain: transition.appliedGain ?? null,
        resultKind: transition.resultKind ?? null,
        resultReason: transition.resultReason ?? null,
        endYardLine: transition.endYardLine ?? null,
      };
      rec.drawsAtResult = window.__tkDraws ? { ...window.__tkDraws } : null;
      rec.atDispatch = measure(0);
      queueMicrotask(() => {
        rec.timeZero = measure(performance.now() - rec.t0);
        rec.samples.push(rec.timeZero);
      });
      const tick = () => {
        const elapsed = performance.now() - rec.t0;
        rec.samples.push(measure(elapsed));
        if (elapsed < rec.until) requestAnimationFrame(tick);
        else rec.done = true;
      };
      requestAnimationFrame(tick);
    });
  }, until);
}

async function collect(page) {
  await page.waitForFunction(() => window.__tk?.done === true, null, { timeout: 15000 });
  return page.evaluate(() => window.__tk);
}

// This play's defender, as opposed to the next play's staged one.
const ownPlay = s => s.shown && s.tacklePhase !== 'staged';

function summarize(rec) {
  const samples = rec.samples.filter(sample => sample.elapsed !== null);
  const gaps = samples.slice(1).map((sample, index) => sample.elapsed - samples[index].elapsed);
  const contactStates = ['contact', 'settled'];
  const approach = samples.filter(s => s.shown && s.tacklePhase === 'approach');
  const contact = samples.filter(s => s.shown && contactStates.includes(s.tacklePhase) && s.contact);
  const release = samples.filter(s => s.shown && s.tacklePhase === 'release');
  const leftFeedback = samples.find(s => s.elapsed > 0 && (s.phase !== 'feedback' || s.overlay !== null));
  const lastContact = contact.at(-1) ?? null;
  const cleared = lastContact ? samples.find(s => s.elapsed > lastContact.elapsed && !ownPlay(s)) ?? null : null;
  const released = release.length ? samples.find(s => s.elapsed > release.at(-1).elapsed && !ownPlay(s)) ?? null : null;
  const nextStage = samples.find(s => s.shown && s.tacklePhase === 'staged') ?? null;
  const arrival = rec.arrivals[0] ?? null;
  return {
    resultCount: rec.resultCount,
    result: rec.result,
    sampleCount: samples.length,
    preSampleCount: rec.pre.length,
    maxGapMs: gaps.length ? Math.max(...gaps) : null,
    gapsOver50Ms: gaps.filter(gap => gap > 50).length,
    arrival,
    resizes: rec.resizes,
    phases: {
      before: rec.before ? { shown: rec.before.shown, tacklePhase: rec.before.tacklePhase } : null,
      atDispatch: rec.atDispatch ? { shown: rec.atDispatch.shown, tacklePhase: rec.atDispatch.tacklePhase, pos: rec.atDispatch.pos } : null,
      timeZero: rec.timeZero ? {
        elapsed: rec.timeZero.elapsed, shown: rec.timeZero.shown, tacklePhase: rec.timeZero.tacklePhase, pos: rec.timeZero.pos,
      } : null,
      approach: approach.length ? { count: approach.length, from: approach[0].elapsed, to: approach.at(-1).elapsed } : null,
      contact: contact.length ? {
        count: contact.length, from: contact[0].elapsed, to: lastContact.elapsed,
        spanMs: lastContact.elapsed - contact[0].elapsed,
        pairs: [...new Set(contact.flatMap(s => s.contactPairs))],
      } : null,
      settled: (() => {
        const settled = samples.filter(s => s.shown && s.tacklePhase === 'settled');
        return settled.length ? { count: settled.length, from: settled[0].elapsed, to: settled.at(-1).elapsed } : null;
      })(),
      cleared: cleared ? { at: cleared.elapsed, phase: cleared.phase, overlay: cleared.overlay, nextStage: cleared.shown } : null,
      release: release.length ? { count: release.length, from: release[0].elapsed, to: release.at(-1).elapsed } : null,
      released: released ? { at: released.elapsed, phase: released.phase, overlay: released.overlay } : null,
      nextStage: nextStage ? { at: nextStage.elapsed, phase: nextStage.phase } : null,
    },
    leftFeedbackAt: leftFeedback ? { elapsed: leftFeedback.elapsed, phase: leftFeedback.phase, overlay: leftFeedback.overlay } : null,
    firstCelebrating: samples.find(s => s.celebrating)?.elapsed ?? null,
  };
}

const ballPct = (yard) => 5 + (yard / 100) * 90;

function assertInsideField(sample, at) {
  expect(sample.partCount, `${at}: tackler has drawn parts`).toBeGreaterThan(0);
  expect(sample.bounds.left, `${at}: tackler left edge inside the field`).toBeGreaterThanOrEqual(sample.inner.left - EDGE_EPSILON);
  expect(sample.bounds.right, `${at}: tackler right edge inside the field`).toBeLessThanOrEqual(sample.inner.right + EDGE_EPSILON);
  expect(sample.bounds.top, `${at}: tackler top inside the field`).toBeGreaterThanOrEqual(sample.inner.top - EDGE_EPSILON);
  expect(sample.bounds.bottom, `${at}: tackler bottom inside the field`).toBeLessThanOrEqual(sample.inner.bottom + EDGE_EPSILON);
}

function expectSamePos(actual, expected, at) {
  expect(Math.abs(actual.x - expected.x), `${at}: same spot (x ${actual.x.toFixed(2)} vs ${expected.x.toFixed(2)})`).toBeLessThanOrEqual(POS_EPSILON);
  expect(Math.abs(actual.y - expected.y), `${at}: same spot (y ${actual.y.toFixed(2)} vs ${expected.y.toFixed(2)})`).toBeLessThanOrEqual(POS_EPSILON);
}

// One staged frame: visible, still, fully opaque, inside the field, clear of the
// carrier's whole drawn extent and of the first-down badge, and under the ball.
function assertStagedSample(sample, at) {
  expect(sample.shown, `${at}: staged defender shown`).toBe(true);
  expect(sample.tacklePhase, `${at}: staged phase`).toBe('staged');
  expect(sample.opacity, `${at}: fully opaque`).toBe(1);
  expect(sample.runningTacklerAnimations, `${at}: standing still`).toBe(0);
  expect(sample.contact, `${at}: no contact before the commit`).toBe(false);
  expect(sample.separated, `${at}: drawn extents of defender and carrier do not touch`).toBe(true);
  expect(sample.badgeOverlap, `${at}: first-down badge not covered`).toBe(false);
  if (sample.ballOverlap) expect(sample.ballAbove, `${at}: the ball stays drawn above the defender`).toBe(true);
  assertInsideField(sample, at);
}

// Every frame from the armed question through the commit's dispatch shows the
// same staged defender; after a pre-commit resize, frames at the new width share
// their own spot (placed again, never sliding).
function assertStagedBeforeCommit(rec, label) {
  expect(rec.before, `${label}: incomplete evidence, no pre-commit measurement`).not.toBeNull();
  expect(rec.atDispatch, `${label}: incomplete evidence, no dispatch measurement`).not.toBeNull();
  expect(rec.pre.length, `${label}: incomplete evidence, no pre-commit frame`).toBeGreaterThan(0);
  const frames = [rec.before, ...rec.pre, rec.atDispatch];
  frames.forEach((sample, index) => assertStagedSample(sample, `${label} pre-commit frame ${index} (${sample.phase})`));
  // Spots are compared within one width: frames at the original width before the
  // first resize event, and frames after the last one.
  const settled = rec.preResizes.length
    ? frames.filter(s => s.at > rec.preResizes.at(-1) || (s.at <= rec.preResizes[0] && s.innerWidth === rec.before.innerWidth))
    : frames;
  const reference = new Map();
  for (const sample of settled.slice().reverse()) {
    if (!reference.has(sample.innerWidth)) reference.set(sample.innerWidth, sample.pos);
    expectSamePos(sample.pos, reference.get(sample.innerWidth), `${label} pre-commit (${sample.phase}, width ${sample.innerWidth})`);
  }
}

function assertCommon(rec, summary, label, { staged = true } = {}) {
  expect(summary.resultCount, `${label}: exactly one football:result`).toBe(1);
  if (staged) assertStagedBeforeCommit(rec, label);
  else {
    expect(rec.before?.shown, `${label}: no defender before this commit`).toBe(false);
    for (const sample of rec.pre) expect(sample.shown, `${label} (${sample.phase}): no defender before this commit`).toBe(false);
  }
  const samples = rec.samples.filter(s => s.elapsed !== null);
  expect(samples.length, `${label}: sampled frames`).toBeGreaterThan(10);
  expect(samples.at(-1).elapsed, `${label}: sampled through the feedback window`).toBeGreaterThanOrEqual(SAMPLE_UNTIL_MS);
  const leftAt = summary.leftFeedbackAt?.elapsed ?? Infinity;
  // Presentation draws nothing from any logical RNG stream during feedback.
  if (rec.drawsAtResult) {
    for (const sample of samples.filter(s => s.elapsed < leftAt)) {
      expect(sample.draws, `${label} at ${sample.elapsed.toFixed(0)}ms: no RNG draws during feedback`).toEqual(rec.drawsAtResult);
    }
  }
  // The ball keeps its exact committed yard position.
  if (Number.isFinite(rec.result?.endYardLine)) {
    for (const sample of samples.filter(s => s.elapsed > 0 && s.elapsed < leftAt)) {
      expect(sample.ballInlinePct, `${label}: ball stays on its committed yard`).toBeCloseTo(ballPct(rec.result.endYardLine), 5);
    }
  }
  // Nothing shown is ever clipped by the field. This play's defender appears only
  // during its feedback; afterwards only the next ordinary call's staged one.
  for (const sample of samples.filter(s => s.shown)) {
    const at = `${label} at ${sample.elapsed.toFixed(0)}ms`;
    assertInsideField(sample, at);
    if (sample.tacklePhase === 'staged') {
      expect(sample.elapsed, `${at}: a staged defender only after this play's feedback`).toBeGreaterThanOrEqual(leftAt);
      expect(sample.phase === 'call' && sample.overlay === null, `${at}: staged only at an ordinary call`).toBe(true);
    } else {
      expect(sample.phase === 'feedback' && sample.overlay === null, `${at}: tackler only during this play's feedback`).toBe(true);
    }
  }
  // The next ordinary player-offense call stages him again.
  for (const sample of samples.filter(s => s.phase === 'call' && s.overlay === null && rec.result?.possession === 'offense')) {
    expect(sample.shown && sample.tacklePhase === 'staged', `${label} at ${sample.elapsed.toFixed(0)}ms: next call is staged`).toBe(true);
  }
}

// The pursuit oracle. The first frame is the staged spot; every observed frame
// lies on the straight path to the contact spot, never moves back, and is never
// further along than the carrier's curve allows at that wall-clock time (the
// animation cannot start before T0; one frame of slack covers a frame clock
// that began just before it). A defender placed at the endpoint, or moving
// ahead of the curve, fails; real multi-pixel frame steps do not.
function assertPursuit(rec, summary, label) {
  const samples = rec.samples.filter(s => s.elapsed !== null);
  const start = rec.atDispatch.pos;
  const firstContact = samples.find(s => s.shown && ['contact', 'settled'].includes(s.tacklePhase));
  expect(firstContact, `${label}: incomplete evidence, no contact frame`).toBeTruthy();
  if (rec.resizes.some(at => at <= firstContact.elapsed)) return;
  const end = firstContact.pos;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const total = Math.hypot(dx, dy);
  const approach = samples.filter(s => s.shown && s.tacklePhase === 'approach');
  expect(approach.length, `${label}: incomplete evidence, no pursuit frame`).toBeGreaterThan(0);
  let previous = -Infinity;
  let previousAt = 0;
  let intermediate = 0;
  for (const sample of approach) {
    const at = `${label} pursuit at ${sample.elapsed.toFixed(1)}ms`;
    expect(sample.opacity, `${at}: fully opaque`).toBe(1);
    if (total < 1) {
      expectSamePos(sample.pos, end, at);
      continue;
    }
    const rx = sample.pos.x - start.x;
    const ry = sample.pos.y - start.y;
    const along = (rx * dx + ry * dy) / total;
    const off = Math.abs(rx * dy - ry * dx) / total;
    const slack = Math.max(FRAME_MS, sample.elapsed - previousAt);
    const allowed = total * CARRIER_EASE(Math.min(1, (sample.elapsed + slack) / PURSUIT_MS)) + POS_EPSILON;
    expect(off, `${at}: on the straight path (${off.toFixed(2)}px off)`).toBeLessThanOrEqual(POS_EPSILON * 2);
    expect(along, `${at}: not behind the staged spot`).toBeGreaterThanOrEqual(-POS_EPSILON);
    expect(along, `${at}: not past the contact spot`).toBeLessThanOrEqual(total + POS_EPSILON);
    expect(along, `${at}: never moves back (${along.toFixed(2)} after ${previous.toFixed(2)})`).toBeGreaterThanOrEqual(previous - POS_EPSILON);
    expect(along, `${at}: not ahead of the carrier's curve (${along.toFixed(2)} of ${total.toFixed(2)}px, allowed ${allowed.toFixed(2)})`).toBeLessThanOrEqual(allowed);
    if (along > total * 0.1 && along < total * 0.9) intermediate += 1;
    previous = along;
    previousAt = sample.elapsed;
  }
  if (total >= 8) expect(intermediate, `${label}: incomplete evidence, no intermediate pursuit frame`).toBeGreaterThan(0);
}

function assertTackled(rec, summary, label, { reducedMotion = false, firstDown = false } = {}) {
  assertCommon(rec, summary, label);
  const samples = rec.samples.filter(s => s.elapsed !== null);
  const arrivalAt = summary.arrival?.elapsed ?? null;
  const zero = rec.timeZero;
  expect(zero, `${label}: incomplete evidence, no time-zero measurement`).not.toBeNull();
  expect(zero.shown, `${label}: still shown when the play resolves`).toBe(true);
  expect(zero.opacity, `${label}: fully opaque when the play resolves`).toBe(1);
  if (reducedMotion) {
    // Reduced motion: no pursuit. He stands still at the endpoint until the carrier settles.
    expect(zero.tacklePhase, `${label}: reduced motion waits at the endpoint`).toBe('waiting');
    expect(summary.phases.approach, `${label}: reduced motion has no moving approach`).toBeNull();
    for (const sample of samples.filter(s => s.shown)) {
      expect(sample.runningTacklerAnimations, `${label} at ${sample.elapsed.toFixed(0)}ms: no tackler animation`).toBe(0);
    }
  } else {
    expect(zero.tacklePhase, `${label}: the pursuit has begun`).toBe('approach');
    // Time zero reconstructs the staged spot: re-anchoring on the endpoint did not move him.
    expectSamePos(zero.pos, rec.atDispatch.pos, `${label} time zero`);
    expect(summary.phases.approach, `${label}: incomplete evidence, no approach sample`).not.toBeNull();
    assertPursuit(rec, summary, label);
  }
  expect(summary.phases.contact, `${label}: incomplete evidence, no contact sample`).not.toBeNull();
  const contactStart = summary.phases.contact.from;
  // Never a hidden frame between the staged spot and contact: he cannot pop in.
  for (const sample of samples.filter(s => s.elapsed < contactStart)) {
    expect(sample.shown, `${label} at ${sample.elapsed.toFixed(0)}ms: visible from the stage to contact`).toBe(true);
    expect(sample.opacity, `${label} at ${sample.elapsed.toFixed(0)}ms: fully opaque`).toBe(1);
  }
  // Contact begins only after the carrier's left transition actually ended.
  if (arrivalAt !== null) {
    expect(contactStart, `${label}: contact after measured carrier arrival (${arrivalAt.toFixed(0)}ms)`).toBeGreaterThanOrEqual(arrivalAt);
    for (const sample of samples.filter(s => s.shown && ['contact', 'settled'].includes(s.tacklePhase))) {
      expect(sample.elapsed, `${label}: no contact pose before the carrier arrives`).toBeGreaterThanOrEqual(arrivalAt);
    }
  } else if (!reducedMotion) {
    // No carrier movement (for example the clipped zero-yard stuff): contact follows the 750 ms pursuit.
    expect(contactStart, `${label}: contact after the approach`).toBeGreaterThanOrEqual(700);
  }
  expect(summary.phases.cleared, `${label}: incomplete evidence, tackler never seen cleared`).not.toBeNull();
  const leftAt = summary.leftFeedbackAt?.elapsed ?? null;
  expect(leftAt, `${label}: incomplete evidence, the play never left feedback`).not.toBeNull();
  expect(contactStart, `${label}: contact shown before feedback ends`).toBeLessThan(leftAt);
  if (firstDown && !reducedMotion) {
    expect(contactStart, `${label}: contact before the tackled celebration`).toBeLessThan(1000);
    expect(summary.firstCelebrating, `${label}: incomplete evidence, no celebration sample`).not.toBeNull();
    expect(summary.firstCelebrating, `${label}: tackled celebration starts at 1000ms`).toBeGreaterThanOrEqual(995);
    for (const sample of samples.filter(s => s.celebrating)) {
      const at = `${label} at ${sample.elapsed.toFixed(0)}ms`;
      expect(sample.shown, `${at}: tackler removed before the celebration`).toBe(false);
      expect(sample.celebrateQuick, `${at}: 350ms tackled celebration`).toBe(true);
      expect(sample.phase, `${at}: celebration ends before the next prompt`).toBe('feedback');
    }
  } else {
    // The settled contact holds until this play's feedback ends.
    for (const sample of samples.filter(s => s.elapsed >= contactStart && s.elapsed < leftAt)) {
      expect(sample.shown, `${label} at ${sample.elapsed.toFixed(0)}ms: contact holds through feedback`).toBe(true);
    }
  }
}

// A player-offense ending that is not a tackle: the staged defender leaves where
// he stands, with no pursuit or contact, before feedback ends.
function assertReleased(rec, summary, label, { reducedMotion = false } = {}) {
  assertCommon(rec, summary, label);
  const samples = rec.samples.filter(s => s.elapsed !== null);
  const leftAt = summary.leftFeedbackAt?.elapsed ?? Infinity;
  for (const sample of samples.filter(ownPlay)) {
    expect(sample.tacklePhase, `${label} at ${sample.elapsed.toFixed(0)}ms: only a release, never a pursuit or contact`).toBe('release');
  }
  if (reducedMotion) {
    expect(rec.timeZero?.shown, `${label}: reduced motion removes him at once`).toBe(false);
    expect(summary.phases.release, `${label}: reduced motion has no fade`).toBeNull();
    return;
  }
  expect(rec.timeZero?.tacklePhase, `${label}: the release begins at the commit`).toBe('release');
  expect(summary.phases.released, `${label}: incomplete evidence, never seen gone`).not.toBeNull();
  expect(summary.phases.released.at, `${label}: gone before feedback ends`).toBeLessThan(leftAt);
  expect(summary.phases.released.overlay, `${label}: gone before any overlay`).toBeNull();
  let previous = 1;
  for (const sample of samples.filter(s => s.shown && s.tacklePhase === 'release')) {
    const at = `${label} release at ${sample.elapsed.toFixed(0)}ms`;
    expectSamePos(sample.pos, rec.atDispatch.pos, at);
    expect(sample.opacity, `${at}: fading, never brightening`).toBeLessThanOrEqual(previous + 1e-6);
    previous = sample.opacity;
  }
}

// Opponent possessions and special teams: no defender at any time.
function assertNoTackle(rec, summary, label) {
  assertCommon(rec, summary, label, { staged: false });
  for (const sample of rec.samples) {
    expect(sample.shown, `${label} at ${sample.elapsed ?? 'before'}: no tackler`).toBe(false);
  }
}

// One committed play: seed, tap the call (and decision), arm, commit by taps, sample.
async function runPlay(page, testInfo, label, { drive, side = 'offense', call, answer = 'correct', decision = null }) {
  await installCountingStreams(page);
  await seedDrive(page, drive);
  if (decision) await tapDecision(page, decision);
  if (call !== undefined) await tapCall(page, side, call);
  else await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await armSampler(page);
  await commitByTaps(page, answer);
  const rec = await collect(page);
  const summary = summarize(rec);
  await writeEvidence(page, testInfo, label, { summary, rec });
  return { rec, summary };
}

const OWN_20 = { yardLine: 20, firstDownLine: 30 };
const FIRST_DOWN = { yardLine: 28, firstDownLine: 30 };
const OWN_1 = { yardLine: 1, firstDownLine: 11 };
const OPPONENT_99 = { yardLine: 97, firstDownLine: 100 };

test.describe('football tackle presentation', () => {
  test('eligibility truth table over committed public facts', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    await openGame(page);
    const rows = [
      ['scrimmage', 'offense', 'advance', null, 2, true],
      ['scrimmage', 'offense', 'firstDown', null, 5, true],
      ['scrimmage', 'offense', 'turnoverOnDowns', null, 1, true],
      ['scrimmage', 'offense', 'turnoverOnDowns', 'stuff', -1, true],
      ['scrimmage', 'offense', 'advance', 'stuff', -1, true],
      ['scrimmage', 'offense', 'advance', 'stuff', 0, true],
      ['scrimmage', 'offense', 'advance', 'sack', -3, true],
      ['scrimmage', 'offense', 'turnoverOnDowns', 'sack', -3, true],
      ['scrimmage', 'offense', 'advance', 'incompletion', 0, false],
      ['scrimmage', 'offense', 'turnoverOnDowns', 'incompletion', 0, false],
      ['scrimmage', 'offense', 'turnover', 'fumble', -2, false],
      ['scrimmage', 'offense', 'turnover', 'interception', 0, false],
      ['scrimmage', 'offense', 'touchdown', null, 5, false],
      ['scrimmage', 'offense', 'advance', null, 0, false],
      ['scrimmage', 'offense', 'advance', null, -1, false],
      ['scrimmage', 'offense', 'advance', null, Number.NaN, false],
      ['scrimmage', 'defense', 'advance', null, 4, false],
      ['scrimmage', 'defense', 'advance', 'stuff', -1, false],
      ['scrimmage', 'defense', 'firstDown', null, 10, false],
      ['punt', 'offense', 'punt', null, 40, false],
      ['fieldGoal', 'offense', 'fieldGoalMade', null, 0, false],
      ['conversion', 'offense', 'conversionMade', null, 2, false],
    ];
    const results = await page.evaluate((rows) => rows.map(([playType, possession, resultKind, resultReason, appliedGain]) =>
      tackleEligible(
        { playType, context: { possession: POSSESSIONS[possession] } },
        { resultKind, resultReason, appliedGain },
      )), rows);
    const nullTransition = await page.evaluate(() => tackleEligible({ playType: 'scrimmage', context: { possession: POSSESSIONS.offense } }, null));
    await writeEvidence(page, testInfo, 'eligibility-table', { rows, results, nullTransition });
    rows.forEach((row, index) => expect(results[index], `row ${JSON.stringify(row)}`).toBe(row[5]));
    expect(nullTransition).toBe(false);
  });

  test('real tapped plays: tackled endings, exclusions, events and RNG budget', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    test.setTimeout(240_000);
    await openGame(page);
    const outcomes = [];
    const record = (label, rec) => outcomes.push({ label, result: rec.result, drawsAtResult: rec.drawsAtResult });
    const tackled = [
      ['positive-advance', { drive: OWN_20, call: 'shortRun' }, { outcome: 'gain', resultKind: 'advance', appliedGain: 2, endYardLine: 22 }, {}],
      ['positive-first-down', { drive: FIRST_DOWN, call: 'shortRun' }, { outcome: 'firstDown', resultKind: 'firstDown', appliedGain: 2 }, { firstDown: true }],
      ['second-miss-stuff', { drive: OWN_20, call: 'shortRun', answer: 'secondMiss' }, { resultReason: 'stuff', appliedGain: -1, endYardLine: 19 }, {}],
      ['second-miss-sack', { drive: OWN_20, call: 'mediumPass', answer: 'secondMiss' }, { resultReason: 'sack', appliedGain: -3, endYardLine: 17 }, {}],
      ['fourth-down-go-short', { drive: { yardLine: 40, firstDownLine: 50, down: 4 }, decision: 'go', call: 'shortRun' },
        { outcome: 'turnoverOnDowns', resultKind: 'turnoverOnDowns' }, {}],
    ];
    for (const [label, play, expected, options] of tackled) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      record(label, rec);
      expect(rec.result, label).toMatchObject({ playType: 'scrimmage', possession: 'offense', ...expected });
      assertTackled(rec, summary, label, options);
    }
    // The terminal fourth-down route leaves feedback for the defense overlay with the tackle cleared.
    await expect(page.locator('#tackler')).toHaveClass(/tackler-hidden/);

    const released = [
      ['touchdown', { drive: { yardLine: 98, firstDownLine: 100 }, call: 'shortRun' }, { resultKind: 'touchdown' }],
      ['second-miss-incompletion', { drive: OWN_20, call: 'shortPass', answer: 'secondMiss' }, { resultReason: 'incompletion', appliedGain: 0 }],
      ['second-miss-fumble', { drive: OWN_20, call: 'longRun', answer: 'secondMiss' }, { resultReason: 'fumble' }],
      ['second-miss-interception', { drive: OWN_20, call: 'longPass', answer: 'secondMiss' }, { resultReason: 'interception' }],
    ];
    for (const [label, play, expected] of released) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      record(label, rec);
      expect(rec.result, label).toMatchObject({ possession: 'offense', ...expected });
      assertReleased(rec, summary, label);
    }

    const excluded = [
      ['opponent-offense', { drive: { possession: 'defense', yardLine: 70, firstDownLine: 60 }, side: 'defense', call: null },
        { possession: 'defense' }],
      ['player-punt', { drive: { yardLine: 30, firstDownLine: 40, down: 4 }, decision: 'punt' }, { playType: 'punt' }],
    ];
    for (const [label, play, expected] of excluded) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      record(label, rec);
      expect(rec.result, label).toMatchObject(expected);
      assertNoTackle(rec, summary, label);
    }
    // The committed facts per case, for the coordinator's base/candidate parity table.
    await writeEvidence(page, testInfo, 'outcome-table', { outcomes });
  });

  // New #189 case, split out so the existing case keeps its 240 s ceiling: one
  // sampled play (about 2.3 s of sampling plus setup and three taps).
  test('retry-correct assisted gain is pursued to its committed spot', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    test.setTimeout(60_000);
    await openGame(page);
    const { rec, summary } = await runPlay(page, testInfo, 'retry-correct-gain',
      { drive: OWN_20, call: 'mediumPass', answer: 'retryCorrect' });
    await writeEvidence(page, testInfo, 'outcome-table-retry', { outcomes: [{ label: 'retry-correct-gain', result: rec.result, drawsAtResult: rec.drawsAtResult }] });
    expect(rec.result).toMatchObject({ playType: 'scrimmage', possession: 'offense', policy: 'retryCorrect' });
    expect(rec.result.appliedGain, 'an assisted gain is still a gain').toBeGreaterThan(0);
    assertTackled(rec, summary, 'retry-correct-gain', { firstDown: rec.result.resultKind === 'firstDown' });
  });

  // New #189 case: five seeded drives and about ten taps, with no 2.3 s sampling window.
  test('staging lifecycle: call, question, first miss and explanation, independent of the call', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    test.setTimeout(60_000);
    await openGame(page);
    const steps = {};
    await installCountingStreams(page);
    await seedDrive(page, OWN_20);
    steps.call = await probe(page);
    await tapCall(page, 'offense', 'shortRun');
    steps.question = await probe(page);
    const { wrong } = await choiceIndexes(page);
    await page.locator(`#b${wrong[0]}`).tap();
    await expect(page.locator(`#b${wrong[1]}`)).toBeEnabled();
    steps.firstMiss = await probe(page);
    await page.locator(`#b${wrong[1]}`).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    steps.explanation = await probe(page);
    await page.locator('#question-learn-why').tap();
    await expect(page.locator('#question-continue')).toBeVisible();
    steps.learnWhy = await probe(page);

    // The same line with a different call: the staged spot does not depend on the call.
    await seedDrive(page, OWN_20);
    await tapCall(page, 'offense', 'longPass');
    const otherCall = await probe(page);

    // Fourth down: no defender at the decision; "go" stages him at the ordinary call.
    await seedDrive(page, { yardLine: 40, firstDownLine: 50, down: 4 });
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'fourth-down-decision', { timeout: 6000 });
    const decision = await probe(page);
    await tapDecision(page, 'go');
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
    const afterGo = await probe(page);

    // The opponent's ordinary call: no defender.
    await seedDrive(page, { possession: 'defense', yardLine: 70, firstDownLine: 60 });
    const defenseCall = await probe(page);

    // Start removes a staged defender.
    await seedDrive(page, OWN_20);
    const stagedBeforeStart = await probe(page);
    await page.evaluate(() => showStart());
    const afterStart = await probe(page);

    // Staging lives outside the game's public text state: no key names it.
    const tackleKeys = await page.evaluate(() => {
      const keys = [];
      const walk = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) { keys.push(key); walk(child); }
      };
      walk(JSON.parse(render_game_to_text()));
      return keys.filter(key => /tackl/i.test(key));
    });
    const drawsCheck = await page.evaluate(() => {
      window.__footballTest.seedDriveState({
        possession: 'offense', direction: 1, quarter: 1, down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30,
        driveStart: 20, scores: { player: 0, opponent: 0 }, plays: 0, drivePlays: 0,
      });
      const before = { ...window.__tkDraws };
      stageTackler();
      const first = window.__tkMeasure(null);
      stageTackler();
      const second = window.__tkMeasure(null);
      return { before, after: { ...window.__tkDraws }, first: first.pos, second: second.pos };
    });

    await writeEvidence(page, testInfo, 'staging-lifecycle', {
      steps, otherCall, decision, afterGo, defenseCall, stagedBeforeStart, afterStart, drawsCheck,
      tackleKeys,
    });
    for (const [name, sample] of Object.entries(steps)) assertStagedSample(sample, `staging ${name}`);
    for (const name of ['question', 'firstMiss', 'explanation', 'learnWhy']) {
      expectSamePos(steps[name].pos, steps.call.pos, `staging ${name} matches the call`);
    }
    assertStagedSample(otherCall, 'another call');
    expectSamePos(otherCall.pos, steps.call.pos, 'staging is independent of the call');
    expect(decision.shown, 'no defender at the fourth-down decision').toBe(false);
    assertStagedSample(afterGo, 'after go');
    expect(defenseCall.shown, 'no defender at the opponent call').toBe(false);
    assertStagedSample(stagedBeforeStart, 'before Start');
    expect(afterStart.shown, 'Start removes the staged defender').toBe(false);
    expect(tackleKeys, 'render_game_to_text carries no tackle presentation state').toEqual([]);
    expect(drawsCheck.after, 'staging draws no RNG').toEqual(drawsCheck.before);
    expectSamePos(drawsCheck.second, drawsCheck.first, 'staging is deterministic');
  });

  // New #189 case: two sampled plays.
  test('a commit without this play\'s staging shows no defender at all', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    test.setTimeout(60_000);
    await openGame(page);
    const results = {};
    for (const [label, breakStage] of [
      ['reset-during-question', () => resetTackle()],
      ['stale-stage-record', () => { tackleStage = { ...tackleStage, yardLine: -1 }; }],
    ]) {
      await installCountingStreams(page);
      await seedDrive(page, OWN_20);
      await tapCall(page, 'offense', 'shortRun');
      await page.evaluate(breakStage);
      await armSampler(page);
      await commitByTaps(page, 'correct');
      const rec = await collect(page);
      const summary = summarize(rec);
      await writeEvidence(page, testInfo, `unstaged-${label}`, { summary, rec });
      results[label] = { rec, summary };
    }
    {
      const { rec, summary } = results['reset-during-question'];
      expect(rec.result, 'outcome unchanged').toMatchObject({ outcome: 'gain', appliedGain: 2, endYardLine: 22 });
      assertCommon(rec, summary, 'reset-during-question', { staged: false });
      for (const sample of rec.samples.filter(s => s.elapsed !== null)) {
        expect(ownPlay(sample), `reset-during-question at ${sample.elapsed.toFixed(0)}ms: no defender pops in`).toBe(false);
      }
    }
    {
      const { rec, summary } = results['stale-stage-record'];
      expect(rec.result, 'outcome unchanged').toMatchObject({ outcome: 'gain', appliedGain: 2, endYardLine: 22 });
      assertStagedBeforeCommit(rec, 'stale-stage-record');
      for (const sample of rec.samples.filter(s => s.elapsed !== null)) {
        expect(ownPlay(sample), `stale-stage-record at ${sample.elapsed.toFixed(0)}ms: no defender pops in`).toBe(false);
      }
    }
  });

  test('duplicate commits and stale routes leave the live tackle alone', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    await openGame(page);
    await installCountingStreams(page);
    await seedDrive(page, OWN_20);
    await tapCall(page, 'offense', 'shortRun');
    await armSampler(page);
    await commitByTaps(page, 'correct');
    await page.waitForFunction(() => window.__tk.samples.some(s => s.shown && s.tacklePhase === 'settled'), null, { timeout: 5000 });
    const probeResult = await page.evaluate(() => {
      const duplicate = commitPendingResolution();
      const render = window.__footballTest.routePossessionPresentation('Stale route.', {
        gameId: 'stale-game', possessionId: 'stale-possession', quarter: 1,
      });
      const tackler = document.getElementById('tackler');
      return {
        duplicate,
        phaseAfterStaleRoute: render.mode,
        tacklerShown: !tackler.classList.contains('tackler-hidden'),
        tacklePhase: tackler.dataset.tacklePhase ?? null,
      };
    });
    const rec = await collect(page);
    const summary = summarize(rec);
    await writeEvidence(page, testInfo, 'duplicate-and-stale-route', { probe: probeResult, summary, rec });
    expect(probeResult.duplicate, 'a repeated commit is rejected').toBe(false);
    expect(probeResult.phaseAfterStaleRoute, 'a stale route changes no phase').toBe('feedback');
    expect(probeResult.tacklerShown, 'a rejected route leaves the tackle').toBe(true);
    expect(probeResult.tacklePhase).toBe('settled');
    assertTackled(rec, summary, 'duplicate-and-stale-route');
  });

  test('restart and Start cancel the tackle, and stale callbacks never revive it', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    await openGame(page);
    // Start during the approach, before the contact callback can run.
    await installCountingStreams(page);
    await seedDrive(page, OWN_20);
    await tapCall(page, 'offense', 'shortRun');
    await armSampler(page);
    await page.evaluate(() => addEventListener('football:result', () => setTimeout(() => {
      window.__tk.cancelledAt = performance.now() - window.__tk.t0;
      showStart();
    }, 150), { once: true }));
    await commitByTaps(page, 'correct');
    const approachCancel = await collect(page);
    await writeEvidence(page, testInfo, 'cancel-during-approach', { rec: approachCancel });
    const cancelledAt = approachCancel.cancelledAt;
    expect(cancelledAt, 'Start ran during the approach').toBeLessThan(700);
    expect(approachCancel.samples.some(s => s.elapsed !== null && s.elapsed < cancelledAt && s.shown), 'approach was visible').toBe(true);
    for (const sample of approachCancel.samples.filter(s => s.elapsed !== null && s.elapsed > cancelledAt)) {
      expect(sample.shown, `after Start at ${sample.elapsed.toFixed(0)}ms: no tackler`).toBe(false);
    }

    // Restart during the settled hold.
    await openGame(page);
    await installCountingStreams(page);
    await seedDrive(page, OWN_20);
    await tapCall(page, 'offense', 'shortRun');
    await armSampler(page);
    await commitByTaps(page, 'correct');
    await page.waitForFunction(() => window.__tk.samples.some(s => s.shown && s.tacklePhase === 'settled'), null, { timeout: 5000 });
    await page.evaluate(() => {
      window.__tk.cancelledAt = performance.now() - window.__tk.t0;
      restart('quick');
    });
    const holdCancel = await collect(page);
    await writeEvidence(page, testInfo, 'cancel-during-hold', { rec: holdCancel });
    for (const sample of holdCancel.samples.filter(s => s.elapsed !== null && s.elapsed > holdCancel.cancelledAt)) {
      expect(sample.shown, `after restart at ${sample.elapsed.toFixed(0)}ms: no tackler`).toBe(false);
    }
    await expect(page.locator('#tackler')).toHaveClass(/tackler-hidden/);
  });

  test('defender wears the live public rival colors in Quick Game and Season', async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    test.setTimeout(180_000);
    const rgb = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    await openGame(page);
    const rivals = await page.evaluate(() => window.__footballTest.rivalOrder().map(id => {
      const rival = window.__footballTest.rivals()[id];
      return { id, accent: rival.presentation.accent, accentDark: rival.presentation.accentDark };
    }));
    expect(rivals.map(r => r.id)).toEqual(['unc', 'nc-state', 'wake-forest']);
    const observed = [];
    for (const rival of rivals) {
      const { rec, summary } = await runPlay(page, testInfo, `colors-${rival.id}`, {
        drive: { ...OWN_20, rivalId: rival.id }, call: 'shortRun',
      });
      assertTackled(rec, summary, `colors-${rival.id}`);
      const shown = rec.samples.find(s => s.shown);
      observed.push({ id: rival.id, jersey: shown.jerseyFill, helmet: shown.helmetFill, staged: rec.before.jerseyFill });
      expect(shown.jerseyFill, `${rival.id} jersey`).toBe(rgb(rival.accent));
      expect(shown.helmetFill, `${rival.id} helmet`).toBe(rgb(rival.accentDark));
      expect(rec.before.jerseyFill, `${rival.id} staged jersey`).toBe(rgb(rival.accent));
    }

    // Real Quick Game picker: tap Wake Forest, then Start Game.
    await openGame(page, { url: '/football/' });
    await page.locator('label.rival-option[data-rival-id="wake-forest"]').tap();
    await page.locator('#start-game-btn').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 10000 });
    await tapCall(page, 'offense', 'shortRun');
    await armSampler(page);
    await commitByTaps(page, 'correct');
    const quick = await collect(page);
    const quickSummary = summarize(quick);
    await writeEvidence(page, testInfo, 'colors-quick-picker-wake-forest', { summary: quickSummary, rec: quick });
    expect(quick.result.possession).toBe('offense');
    expect(quick.before.jerseyFill, 'quick picker staged jersey').toBe(rgb(rivals[2].accent));
    if (quick.result.resultKind !== 'touchdown') {
      assertTackled(quick, quickSummary, 'quick picker', { firstDown: quick.result.resultKind === 'firstDown' });
      expect(quick.samples.find(s => s.shown).jerseyFill).toBe(rgb(rivals[2].accent));
    }

    // Real Season start: the first scheduled rival is UNC.
    await openGame(page, { url: '/football/' });
    await page.locator('label.play-mode-option:has(input[value="season"])').tap();
    await page.locator('#start-game-btn').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 10000 });
    const season = await page.evaluate(() => ({
      mode: JSON.parse(render_game_to_text()).playMode,
      game: window.__footballTest.activeSeasonGame(),
    }));
    expect(season.mode).toBe('season');
    expect(season.game?.rivalId).toBe('unc');
    await tapCall(page, 'offense', 'shortRun');
    await armSampler(page);
    await commitByTaps(page, 'correct');
    const seasonRec = await collect(page);
    const seasonSummary = summarize(seasonRec);
    await writeEvidence(page, testInfo, 'colors-season-start-unc', { season, observed, summary: seasonSummary, rec: seasonRec });
    expect(seasonRec.before.jerseyFill, 'season staged jersey').toBe(rgb(rivals[0].accent));
    if (seasonRec.result.resultKind !== 'touchdown') {
      assertTackled(seasonRec, seasonSummary, 'season start', { firstDown: seasonRec.result.resultKind === 'firstDown' });
      expect(seasonRec.samples.find(s => s.shown).jerseyFill).toBe(rgb(rivals[0].accent));
    }
  });

  // Geometry and timing on every project.
  // New #189 cases, one per line of scrimmage: one seed, one tap and two probes
  // each, well inside the default test timeout.
  for (const [label, drive] of [
    ['own 20', OWN_20],
    ['own 1', OWN_1],
    ['opponent 97', { yardLine: 97, firstDownLine: 100 }],
    ['opponent 99', { yardLine: 99, firstDownLine: 100 }],
  ]) {
    test(`staged defender stays inside the field and clear of the carrier at ${label}`, async ({ page }, testInfo) => {
      await openGame(page);
      await installCountingStreams(page);
      await seedDrive(page, drive);
      await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
      const call = await probe(page);
      await tapCall(page, 'offense', 'shortRun');
      const question = await probe(page);
      await writeEvidence(page, testInfo, `staged-geometry-${label.replace(/ /g, '-')}`, { call, question });
      assertStagedSample(call, `${label} call`);
      assertStagedSample(question, `${label} question`);
      expectSamePos(question.pos, call.pos, `${label}: the question keeps the staged spot`);
    });
  }

  test('normal-motion approach, contact, settle and clear, including own 1 and opponent 99', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openGame(page);
    const cases = [
      ['timeline-advance', { drive: OWN_20, call: 'shortRun' }, {}],
      ['timeline-first-down', { drive: FIRST_DOWN, call: 'shortRun' }, { firstDown: true }],
      ['timeline-own-1-stuff', { drive: OWN_1, call: 'shortRun', answer: 'secondMiss' }, {}],
      ['timeline-opponent-99', { drive: OPPONENT_99, call: 'shortRun' }, {}],
    ];
    for (const [label, play, options] of cases) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      if (label === 'timeline-own-1-stuff') expect(rec.result).toMatchObject({ resultReason: 'stuff', appliedGain: 0, endYardLine: 1 });
      if (label === 'timeline-opponent-99') expect(rec.result).toMatchObject({ resultKind: 'advance', endYardLine: 99 });
      assertTackled(rec, summary, label, options);
    }
  });

  // New #189 case, split out so the existing timeline keeps its 120 s ceiling:
  // one sampled second-miss play (two misses, Learn why, Continue, 2.3 s sampling).
  test('normal-motion pursuit into a sack loss', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await openGame(page);
    const { rec, summary } = await runPlay(page, testInfo, 'timeline-sack',
      { drive: OWN_20, call: 'mediumPass', answer: 'secondMiss' });
    expect(rec.result).toMatchObject({ resultReason: 'sack', appliedGain: -3, endYardLine: 17 });
    assertTackled(rec, summary, 'timeline-sack');
  });

  test('reduced motion shows static contact only at the settled endpoint', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openGame(page, { reducedMotion: 'reduce' });
    const cases = [
      ['reduced-advance', { drive: OWN_20, call: 'shortRun' }, {}],
      ['reduced-first-down', { drive: FIRST_DOWN, call: 'shortRun' }, { firstDown: true }],
      ['reduced-own-1-stuff', { drive: OWN_1, call: 'shortRun', answer: 'secondMiss' }, {}],
    ];
    for (const [label, play, options] of cases) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      assertTackled(rec, summary, label, { ...options, reducedMotion: true });
    }
  });

  // New #189 case, split out so the existing reduced-motion case keeps its 120 s
  // ceiling: one sampled second-miss play.
  test('reduced motion removes a released defender at once', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await openGame(page, { reducedMotion: 'reduce' });
    const { rec, summary } = await runPlay(page, testInfo, 'reduced-second-miss-incompletion',
      { drive: OWN_20, call: 'shortPass', answer: 'secondMiss' });
    expect(rec.result).toMatchObject({ resultReason: 'incompletion' });
    assertReleased(rec, summary, 'reduced-second-miss-incompletion', { reducedMotion: true });
  });

  async function resizeCase(page, testInfo, label, drive, when, size, rotated) {
    await page.setViewportSize(size);
    await openGame(page);
    await installCountingStreams(page);
    await seedDrive(page, drive);
    await tapCall(page, 'offense', 'shortRun');
    await armSampler(page);
    if (when === 'staged') {
      await page.waitForFunction(() => window.__tk.pre.length > 0, null, { timeout: 5000 });
      await page.setViewportSize(rotated);
      await page.waitForFunction((width) => window.__tk.pre.filter(s => s.innerWidth === width).length >= 3,
        rotated.width, { timeout: 5000 });
    }
    await commitByTaps(page, label === 'resize-hold-own-1' ? 'secondMiss' : 'correct');
    if (when === 'approach') {
      await page.waitForFunction(() => window.__tk.samples.some(s => s.shown && s.tacklePhase === 'approach'), null, { timeout: 5000 });
    } else if (when === 'hold') {
      await page.waitForFunction(() => window.__tk.samples.some(s => s.shown && s.tacklePhase === 'settled'), null, { timeout: 5000 });
    }
    if (when !== 'staged') await page.setViewportSize(rotated);
    const rec = await collect(page);
    const summary = summarize(rec);
    await writeEvidence(page, testInfo, label, { from: size, to: rotated, summary, rec });
    if (when === 'staged') {
      expect(rec.preResizes.length, `${label}: incomplete evidence, resize not observed`).toBeGreaterThan(0);
      const widths = new Set(rec.pre.map(s => s.innerWidth));
      expect(widths.has(size.width) && widths.has(rotated.width), `${label}: staged frames at both widths`).toBe(true);
    } else {
      expect(rec.resizes.length, `${label}: incomplete evidence, resize not observed`).toBeGreaterThan(0);
      const resizedAt = rec.resizes[0];
      const leftAt = summary.leftFeedbackAt?.elapsed ?? Infinity;
      expect(resizedAt, `${label}: incomplete evidence, resize landed after feedback`).toBeLessThan(leftAt);
      expect(rec.samples.some(s => s.elapsed !== null && s.elapsed > resizedAt && s.shown),
        `${label}: incomplete evidence, no tackler sample after the resize`).toBe(true);
    }
    assertTackled(rec, summary, label);
  }

  test('resize during the approach and the hold keeps the tackle edge-safe', async ({ page }, testInfo) => {
    test.skip(!RESIZE_PROJECTS.has(testInfo.project.name),
      'Resize correction is sampled on the primary iPad 11 landscape, iPad 11 portrait and iPhone 15 targets.');
    test.setTimeout(120_000);
    const size = page.viewportSize();
    const rotated = { width: size.height, height: size.width };
    for (const [label, drive, when] of [
      ['resize-approach-own-20', OWN_20, 'approach'],
      ['resize-hold-opponent-99', OPPONENT_99, 'hold'],
      ['resize-hold-own-1', OWN_1, 'hold'],
    ]) {
      await resizeCase(page, testInfo, label, drive, when, size, rotated);
    }
    await page.setViewportSize(size);
  });

  // New #189 case, split out so the existing resize case keeps its 120 s ceiling:
  // one sampled play with one rotation before the commit.
  test('resize while staged re-places the defender without sliding', async ({ page }, testInfo) => {
    test.skip(!RESIZE_PROJECTS.has(testInfo.project.name),
      'Resize correction is sampled on the primary iPad 11 landscape, iPad 11 portrait and iPhone 15 targets.');
    test.setTimeout(60_000);
    const size = page.viewportSize();
    const rotated = { width: size.height, height: size.width };
    await resizeCase(page, testInfo, 'resize-staged-opponent-97', OPPONENT_99, 'staged', size, rotated);
    await page.setViewportSize(size);
  });
});
