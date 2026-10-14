// Issue #169: an opponent-colored defender makes visible contact with the Duke
// ball carrier when a committed player-offense play ends in a tackle.
//
// Every case drives the real production path: tapped call, tapped answer (or
// two tapped misses, Learn why and Continue), commitPendingResolution() and the
// public football:result event. Timelines come from a real requestAnimationFrame
// sampler anchored on that event, on the wall clock; page.clock is never
// installed. Each sample records the elapsed time, the tackler's state and the
// bounding boxes of individual SVG parts (gloves, forearms, pads, helmet against
// the carrier's jersey, pads, hips and sleeves), not the wrapper divs. A required
// phase with no sample fails as incomplete evidence; nothing is retried.
// Evidence JSON is written before any assertion, into a new run directory under
// tests/artifacts.nosync/tackle/ (never release-matrix/), so failures are kept.
// This is engine emulation, not native Safari, Simulator or device evidence.
import { test, expect } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const PRIMARY = 'ipad-11-landscape';
const RESIZE_PROJECTS = new Set(['ipad-11-landscape', 'ipad-11-portrait', 'iphone-15-portrait']);
const RUN_STAMP = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const SAMPLE_UNTIL_MS = 2300;
const EDGE_EPSILON = 0.5;
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

async function openGame(page, { reducedMotion = 'no-preference', url = '/football/?boot=offense-call' } = {}) {
  await page.emulateMedia({ reducedMotion });
  await page.goto(url);
  // The fixture already proved this after navigation; repeat it before the first input.
  await expectFootballTestMuted(page);
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

// The tap that commits: a correct answer, or two misses then Learn why and Continue.
async function commitByTaps(page, answer) {
  const { correct, wrong } = await choiceIndexes(page);
  expect(correct).toBeGreaterThanOrEqual(0);
  if (answer === 'correct') {
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

// Installed before the committing tap. T0 is the synchronous football:result
// dispatch; frames follow on requestAnimationFrame with performance.now().
async function armSampler(page, { until = SAMPLE_UNTIL_MS } = {}) {
  await page.evaluate((until) => {
    const player = document.getElementById('player');
    const field = document.getElementById('field-wrap');
    const rec = {
      until, t0: null, timeOrigin: performance.timeOrigin, resultCount: 0, result: null,
      drawsAtResult: null, arrivals: [], resizes: [], samples: [], before: null, done: false,
    };
    window.__tk = rec;
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const measure = (elapsed) => {
      const tackler = document.getElementById('tackler');
      const fieldBox = field.getBoundingClientRect();
      const inner = {
        left: fieldBox.left + field.clientLeft,
        right: fieldBox.left + field.clientLeft + field.clientWidth,
        top: fieldBox.top + field.clientTop,
        bottom: fieldBox.top + field.clientTop + field.clientHeight,
      };
      const tacklerStyle = tackler ? getComputedStyle(tackler) : null;
      const shown = Boolean(tackler) && !tackler.classList.contains('tackler-hidden') && tacklerStyle.display !== 'none';
      let bounds = null;
      let partCount = 0;
      const contactPairs = [];
      if (shown) {
        const parts = [...tackler.querySelectorAll('svg *')].map(node => node.getBoundingClientRect())
          .filter(rect => rect.width > 0 || rect.height > 0);
        partCount = parts.length;
        if (parts.length) {
          bounds = {
            left: Math.min(...parts.map(r => r.left)), right: Math.max(...parts.map(r => r.right)),
            top: Math.min(...parts.map(r => r.top)), bottom: Math.max(...parts.map(r => r.bottom)),
          };
        }
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
      return {
        elapsed,
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
        inner,
        runningTacklerAnimations: tackler
          ? tackler.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length : 0,
        carrierLeftRunning: player.getAnimations().some(a => a.transitionProperty === 'left' && a.playState === 'running'),
        carrierHidden: player.classList.contains('player-hidden'),
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
    rec.before = measure(null);
    const onCarrierEnd = (event) => {
      if (event.target !== player || event.propertyName !== 'left' || rec.t0 === null) return;
      rec.arrivals.push({ type: event.type, elapsed: performance.now() - rec.t0 });
    };
    player.addEventListener('transitionend', onCarrierEnd);
    player.addEventListener('transitioncancel', onCarrierEnd);
    addEventListener('resize', () => {
      if (rec.t0 !== null) rec.resizes.push(performance.now() - rec.t0);
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
      rec.samples.push(measure(0));
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

function summarize(rec) {
  const samples = rec.samples.filter(sample => sample.elapsed !== null);
  const gaps = samples.slice(1).map((sample, index) => sample.elapsed - samples[index].elapsed);
  const contactStates = ['contact', 'settled'];
  const approach = samples.filter(s => s.shown && s.tacklePhase === 'approach');
  const contact = samples.filter(s => s.shown && contactStates.includes(s.tacklePhase) && s.contact);
  const leftFeedback = samples.find(s => s.elapsed > 0 && (s.phase !== 'feedback' || s.overlay !== null));
  const lastContact = contact.at(-1) ?? null;
  const cleared = lastContact ? samples.find(s => s.elapsed > lastContact.elapsed && !s.shown) ?? null : null;
  const arrival = rec.arrivals[0] ?? null;
  return {
    resultCount: rec.resultCount,
    result: rec.result,
    sampleCount: samples.length,
    maxGapMs: gaps.length ? Math.max(...gaps) : null,
    gapsOver50Ms: gaps.filter(gap => gap > 50).length,
    arrival,
    resizes: rec.resizes,
    phases: {
      before: rec.before ? { shown: rec.before.shown } : null,
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
      cleared: cleared ? { at: cleared.elapsed, phase: cleared.phase, overlay: cleared.overlay } : null,
    },
    leftFeedbackAt: leftFeedback ? { elapsed: leftFeedback.elapsed, phase: leftFeedback.phase, overlay: leftFeedback.overlay } : null,
    firstCelebrating: samples.find(s => s.celebrating)?.elapsed ?? null,
  };
}

const ballPct = (yard) => 5 + (yard / 100) * 90;

function assertCommon(rec, summary, label) {
  expect(summary.resultCount, `${label}: exactly one football:result`).toBe(1);
  expect(rec.before?.shown, `${label}: no tackler before the commit`).toBe(false);
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
  // Nothing shown is ever clipped by the field, and the next phase is clean.
  for (const sample of samples.filter(s => s.shown)) {
    const at = `${label} at ${sample.elapsed.toFixed(0)}ms`;
    expect(sample.partCount, `${at}: tackler has drawn parts`).toBeGreaterThan(0);
    expect(sample.bounds.left, `${at}: tackler left edge inside the field`).toBeGreaterThanOrEqual(sample.inner.left - EDGE_EPSILON);
    expect(sample.bounds.right, `${at}: tackler right edge inside the field`).toBeLessThanOrEqual(sample.inner.right + EDGE_EPSILON);
    expect(sample.bounds.top, `${at}: tackler top inside the field`).toBeGreaterThanOrEqual(sample.inner.top - EDGE_EPSILON);
    expect(sample.bounds.bottom, `${at}: tackler bottom inside the field`).toBeLessThanOrEqual(sample.inner.bottom + EDGE_EPSILON);
    expect(sample.phase === 'feedback' && sample.overlay === null, `${at}: tackler only during this play's feedback`).toBe(true);
  }
}

function assertTackled(rec, summary, label, { reducedMotion = false, firstDown = false } = {}) {
  assertCommon(rec, summary, label);
  const samples = rec.samples.filter(s => s.elapsed !== null);
  const arrivalAt = summary.arrival?.elapsed ?? null;
  if (reducedMotion) {
    expect(summary.phases.approach, `${label}: reduced motion has no moving approach`).toBeNull();
    for (const sample of samples.filter(s => s.shown)) {
      expect(sample.runningTacklerAnimations, `${label} at ${sample.elapsed.toFixed(0)}ms: no tackler animation`).toBe(0);
    }
  } else {
    expect(summary.phases.approach, `${label}: incomplete evidence, no approach sample`).not.toBeNull();
  }
  expect(summary.phases.contact, `${label}: incomplete evidence, no contact sample`).not.toBeNull();
  // Contact begins only after the carrier's left transition actually ended.
  const contactStart = summary.phases.contact.from;
  if (arrivalAt !== null) {
    expect(contactStart, `${label}: contact after measured carrier arrival (${arrivalAt.toFixed(0)}ms)`).toBeGreaterThanOrEqual(arrivalAt);
    for (const sample of samples.filter(s => s.shown && ['contact', 'settled'].includes(s.tacklePhase))) {
      expect(sample.elapsed, `${label}: no contact pose before the carrier arrives`).toBeGreaterThanOrEqual(arrivalAt);
    }
  } else if (!reducedMotion) {
    // No carrier movement (for example the clipped zero-yard stuff): contact follows the 750 ms approach.
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

function assertNoTackle(rec, summary, label) {
  assertCommon(rec, summary, label);
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
    const tackled = [
      ['positive-advance', { drive: OWN_20, call: 'shortRun' }, { outcome: 'gain', resultKind: 'advance' }, {}],
      ['positive-first-down', { drive: FIRST_DOWN, call: 'shortRun' }, { outcome: 'firstDown', resultKind: 'firstDown' }, { firstDown: true }],
      ['second-miss-stuff', { drive: OWN_20, call: 'shortRun', answer: 'secondMiss' }, { resultReason: 'stuff', appliedGain: -1 }, {}],
      ['second-miss-sack', { drive: OWN_20, call: 'mediumPass', answer: 'secondMiss' }, { resultReason: 'sack', appliedGain: -3 }, {}],
      ['fourth-down-go-short', { drive: { yardLine: 40, firstDownLine: 50, down: 4 }, decision: 'go', call: 'shortRun' },
        { outcome: 'turnoverOnDowns', resultKind: 'turnoverOnDowns' }, {}],
    ];
    for (const [label, play, expected, options] of tackled) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      expect(rec.result, label).toMatchObject({ playType: 'scrimmage', possession: 'offense', ...expected });
      assertTackled(rec, summary, label, options);
    }
    // The terminal fourth-down route leaves feedback for the defense overlay with the tackle cleared.
    await expect(page.locator('#tackler')).toHaveClass(/tackler-hidden/);

    const excluded = [
      ['touchdown', { drive: { yardLine: 98, firstDownLine: 100 }, call: 'shortRun' }, { resultKind: 'touchdown' }],
      ['second-miss-incompletion', { drive: OWN_20, call: 'shortPass', answer: 'secondMiss' }, { resultReason: 'incompletion' }],
      ['second-miss-fumble', { drive: OWN_20, call: 'longRun', answer: 'secondMiss' }, { resultReason: 'fumble' }],
      ['second-miss-interception', { drive: OWN_20, call: 'longPass', answer: 'secondMiss' }, { resultReason: 'interception' }],
      ['opponent-offense', { drive: { possession: 'defense', yardLine: 70, firstDownLine: 60 }, side: 'defense', call: null },
        { possession: 'defense' }],
      ['player-punt', { drive: { yardLine: 30, firstDownLine: 40, down: 4 }, decision: 'punt' }, { playType: 'punt' }],
    ];
    for (const [label, play, expected] of excluded) {
      const { rec, summary } = await runPlay(page, testInfo, label, play);
      expect(rec.result, label).toMatchObject(expected);
      assertNoTackle(rec, summary, label);
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
    const probe = await page.evaluate(() => {
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
    await writeEvidence(page, testInfo, 'duplicate-and-stale-route', { probe, summary, rec });
    expect(probe.duplicate, 'a repeated commit is rejected').toBe(false);
    expect(probe.phaseAfterStaleRoute, 'a stale route changes no phase').toBe('feedback');
    expect(probe.tacklerShown, 'a rejected route leaves the tackle').toBe(true);
    expect(probe.tacklePhase).toBe('settled');
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
      observed.push({ id: rival.id, jersey: shown.jerseyFill, helmet: shown.helmetFill });
      expect(shown.jerseyFill, `${rival.id} jersey`).toBe(rgb(rival.accent));
      expect(shown.helmetFill, `${rival.id} helmet`).toBe(rgb(rival.accentDark));
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
    if (seasonRec.result.resultKind !== 'touchdown') {
      assertTackled(seasonRec, seasonSummary, 'season start', { firstDown: seasonRec.result.resultKind === 'firstDown' });
      expect(seasonRec.samples.find(s => s.shown).jerseyFill).toBe(rgb(rivals[0].accent));
    }
  });

  // Geometry and timing on every project.
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
      await page.setViewportSize(size);
      await openGame(page);
      await installCountingStreams(page);
      await seedDrive(page, drive);
      await tapCall(page, 'offense', 'shortRun');
      await armSampler(page);
      await commitByTaps(page, label === 'resize-hold-own-1' ? 'secondMiss' : 'correct');
      if (when === 'approach') {
        await page.waitForFunction(() => window.__tk.samples.some(s => s.shown && s.tacklePhase === 'approach'), null, { timeout: 5000 });
      } else {
        await page.waitForFunction(() => window.__tk.samples.some(s => s.shown && s.tacklePhase === 'settled'), null, { timeout: 5000 });
      }
      await page.setViewportSize(rotated);
      const rec = await collect(page);
      const summary = summarize(rec);
      await writeEvidence(page, testInfo, label, { from: size, to: rotated, summary, rec });
      expect(rec.resizes.length, `${label}: incomplete evidence, resize not observed`).toBeGreaterThan(0);
      const resizedAt = rec.resizes[0];
      const leftAt = summary.leftFeedbackAt?.elapsed ?? Infinity;
      expect(resizedAt, `${label}: incomplete evidence, resize landed after feedback`).toBeLessThan(leftAt);
      expect(rec.samples.some(s => s.elapsed !== null && s.elapsed > resizedAt && s.shown),
        `${label}: incomplete evidence, no tackler sample after the resize`).toBe(true);
      assertTackled(rec, summary, label);
    }
    await page.setViewportSize(size);
  });
});
