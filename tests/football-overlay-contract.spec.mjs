import { test, expect } from './curriculum-fixture.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Issue #49 characterization: every expectation here is derived from the
// current overlay source and must hold unchanged before and after the slot
// refactor. Contract-only assertions (slots, discovery, ninth modal) belong in
// separately titled tests added after the runtime migration.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CAPTURE_ROOT = '/private/tmp/games-issue49/characterization-images';
const CAPTURE_STAGE = process.env.ISSUE49_CAPTURE_STAGE || '';
if (CAPTURE_STAGE && !['before', 'after'].includes(CAPTURE_STAGE)) {
  throw new Error(`ISSUE49_CAPTURE_STAGE must be "before" or "after", got "${CAPTURE_STAGE}".`);
}
// Visual-only randomness is hidden in captures only; the page keeps rendering it.
const CAPTURE_STYLE = '.confetti-piece, .fw-burst { visibility: hidden !important; }';
const SOURCE_FILES = [
  'football/index.html',
  'football/football.js',
  'football/football.css',
  'football/football-domain.js',
  'football/copy.js',
  'tests/curriculum-fixture.mjs',
  'tests/football-overlay-contract.spec.mjs',
];

const EPS = 1;
const MARKUP_OVERLAY_IDS = ['ov-start', 'ov-time-lab', 'ov-td', 'ov-defense', 'ov-offense', 'ov-quarter', 'ov-halftime', 'ov-end'];
const BREAK_ANIMATIONS = [
  'ov-broadcast-badge:ov-break-rise',
  'ov-scorebug:ov-break-rise',
  'ov-sub:ov-break-rise',
  'ov-sweep:ov-break-sweep',
  'ov-title:ov-break-rise',
];
const SCOREBUG_CLASSES = ['ov-sb-team', 'ov-sb-pts', 'ov-sb-dash', 'ov-sb-pts', 'ov-sb-team', 'ov-sb-next'];
const START_COPY = {
  badge: 'KICKOFF',
  title: 'Football Math!',
  sub: 'Call plays, answer math, and win the rivalry over 4 quarters.',
  buttons: [
    { id: 'start-game-btn', text: 'Start Game', onclick: 'startGame()', disabled: false },
    { id: 'tl-open-button', text: 'Practice Clocks & Calendars A separate 8-question practice lab', onclick: 'openTimeLab()', disabled: false },
  ],
};
const START_FOCUS = 'input[name="rival"]:checked';

const pageErrors = new WeakMap();
const pausedClocks = new WeakSet();
const evidence = new Map();
let sourceDigestsPromise = null;

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function sourceDigests() {
  sourceDigestsPromise ||= Promise.all(SOURCE_FILES.map(async file => (
    [file, sha256(await fs.readFile(path.join(REPO_ROOT, file)))]
  ))).then(Object.fromEntries);
  return sourceDigestsPromise;
}

function evidenceFor(testInfo) {
  if (!evidence.has(testInfo.testId)) evidence.set(testInfo.testId, { captures: [], geometry: {}, notes: {} });
  return evidence.get(testInfo.testId);
}

function engineOf(page) {
  return page.context().browser()?.browserType().name() || 'unknown';
}

// Read-only probes; nothing here replaces a production, audio, or rendering API.
function installIssue49Probes() {
  let remembered = [];
  const counts = {};
  const overlayAnimations = (id) => {
    const overlay = document.getElementById(id);
    if (!overlay || typeof CSSAnimation === 'undefined') return [];
    return document.getAnimations().filter((animation) => {
      const target = animation.effect && animation.effect.target;
      return animation instanceof CSSAnimation && target instanceof Element
        && overlay.contains(target) && !target.closest('.ov-confetti');
    });
  };
  window.__issue49 = {
    animationNames(id) {
      return overlayAnimations(id)
        .map(animation => `${animation.effect.target.classList[0]}:${animation.animationName}`)
        .sort();
    },
    rememberAnimations(id) {
      remembered = overlayAnimations(id);
      return remembered.length;
    },
    compareAnimations(id) {
      const current = overlayAnimations(id);
      return { count: current.length, retained: current.filter(animation => remembered.includes(animation)).length };
    },
    watchDecorations() {
      for (const id of ['ov-td-confetti', 'ov-end-confetti']) {
        counts[id] = { confetti: 0, bursts: 0 };
        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (!(node instanceof Element)) continue;
              if (node.classList.contains('confetti-piece')) counts[id].confetti++;
              if (node.classList.contains('fw-burst')) counts[id].bursts++;
            }
          }
        }).observe(document.getElementById(id), { childList: true });
      }
    },
    resetDecorations() {
      for (const id of Object.keys(counts)) counts[id] = { confetti: 0, bursts: 0 };
    },
    decorations() {
      return Object.fromEntries(Object.entries(counts).map(([id, added]) => {
        const container = document.getElementById(id);
        return [id, {
          ...added,
          confettiPresent: container.querySelectorAll('.confetti-piece').length,
          burstsPresent: container.querySelectorAll('.fw-burst').length,
        }];
      }));
    },
  };
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  pageErrors.set(page, errors);
  await page.addInitScript(installIssue49Probes);
});

test.afterEach(async ({ page }, testInfo) => {
  const record = evidenceFor(testInfo);
  const browser = page.context().browser();
  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight },
    screen: { width: screen.width, height: screen.height },
    devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    gameVersion: typeof GAME_VERSION === 'string' ? GAME_VERSION : null,
  })).catch(error => ({ unavailable: String(error) }));
  const use = testInfo.project.use || {};
  const manifest = {
    issue: 49,
    kind: 'characterization',
    stage: CAPTURE_STAGE || null,
    captureRoot: CAPTURE_STAGE ? CAPTURE_ROOT : null,
    test: testInfo.titlePath,
    status: testInfo.status,
    engine: { name: engineOf(page), version: browser?.version() || null },
    project: {
      name: testInfo.project.name,
      viewport: use.viewport || null,
      deviceScaleFactor: use.deviceScaleFactor ?? null,
      isMobile: use.isMobile ?? null,
      hasTouch: use.hasTouch ?? null,
    },
    environment,
    sources: await sourceDigests(),
    captures: record.captures,
    geometry: record.geometry,
    notes: record.notes,
    limitations: 'Playwright engine emulation only; not Apple Simulator or physical-device evidence.',
  };
  await testInfo.attach('issue49-characterization-manifest.json', {
    body: JSON.stringify(manifest, null, 2),
    contentType: 'application/json',
  });
  evidence.delete(testInfo.testId);
  expect(pageErrors.get(page), 'uncaught browser errors').toEqual([]);
});

async function capture(page, testInfo, label) {
  if (!CAPTURE_STAGE) return;
  const dir = path.join(CAPTURE_ROOT, CAPTURE_STAGE, engineOf(page), testInfo.project.name);
  const file = path.join(dir, `${label}.png`);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', style: CAPTURE_STYLE });
  evidenceFor(testInfo).captures.push({ label, file, sha256: sha256(await fs.readFile(file)) });
}

function note(testInfo, key, value) {
  evidenceFor(testInfo).notes[key] = value;
}

async function pauseClock(page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
  pausedClocks.add(page);
}

// A paused fake clock also holds requestAnimationFrame focus work.
async function settle(page) {
  if (pausedClocks.has(page)) await page.clock.runFor(48);
}

async function renderedState(page) {
  return page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    return {
      ...contracts.render,
      playIsTouchdown: contracts.activeSnap?.proposal?.resultKind === 'touchdown',
    };
  });
}

async function expectRender(page, expected, label) {
  expect(await renderedState(page), `${label}: rendered state`).toMatchObject(expected);
}

async function answer(page, kind, label) {
  const accepted = await page.evaluate(choice => Boolean(window.__footballTest.answerChoice(choice)), kind);
  expect(accepted, `${label}: ${kind} answer accepted`).toBe(true);
}

async function expectQuestionPlayType(page, playType, label) {
  const actual = await page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    return {
      activePlay: contracts.activePlay?.playType || null,
      question: contracts.questionInstance?.playType || null,
      pending: contracts.pendingResolution?.playType || null,
    };
  });
  expect(actual, `${label}: tagged play/question/pending types`).toEqual({
    activePlay: playType,
    question: playType,
    pending: playType,
  });
}

async function seedDrive(page, overrides) {
  await page.evaluate(seed => window.__footballTest.seedDriveState(seed), overrides);
}

// Seeded setup mirrors the release matrix: finishPossession() closes through
// the domain planner and routes through routePossessionPresentation().
async function finishSeededPossession(page, overrides, message) {
  return page.evaluate(({ seed, text }) => {
    window.__footballTest.seedDriveState(seed);
    finishPossession(text);
    const active = document.querySelector('.overlay.show');
    return { id: active?.id || null, animations: active ? window.__issue49.animationNames(active.id) : [] };
  }, { seed: overrides, text: message });
}

async function animationNames(page, id) {
  return page.evaluate(overlayId => window.__issue49.animationNames(overlayId), id);
}

async function decorations(page) {
  return page.evaluate(() => window.__issue49.decorations());
}

async function overlayAudit(page) {
  return page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('.overlay'));
    const wrap = document.getElementById('wrap');
    return {
      ids: overlays.map(overlay => overlay.id),
      shown: overlays.filter(overlay => overlay.classList.contains('show')).map(overlay => overlay.id),
      displayed: overlays.filter(overlay => getComputedStyle(overlay).display !== 'none').map(overlay => overlay.id),
      states: overlays.map(overlay => ({
        id: overlay.id,
        ariaHidden: overlay.getAttribute('aria-hidden'),
        inert: overlay.inert,
      })),
      wrap: { inert: wrap.inert, ariaHidden: wrap.getAttribute('aria-hidden') },
    };
  });
}

async function expectOnlyOverlay(page, id, label) {
  const audit = await overlayAudit(page);
  expect(audit.ids, `${label}: overlay roots in markup order`).toEqual(MARKUP_OVERLAY_IDS);
  expect(audit.shown, `${label}: one shown overlay`).toEqual([id]);
  expect(audit.displayed, `${label}: one displayed overlay`).toEqual([id]);
  expect(audit.states, `${label}: modal and background visibility`).toEqual(MARKUP_OVERLAY_IDS.map(overlayId => ({
    id: overlayId,
    ariaHidden: String(overlayId !== id),
    inert: overlayId !== id,
  })));
  expect(audit.wrap, `${label}: game UI behind the modal`).toEqual({ inert: true, ariaHidden: 'true' });
  await expect(page.getByRole('dialog'), `${label}: one accessible dialog`).toHaveCount(1);
}

async function expectNoOverlay(page, label) {
  const audit = await overlayAudit(page);
  expect(audit.shown, `${label}: no shown overlay`).toEqual([]);
  expect(audit.displayed, `${label}: no displayed overlay`).toEqual([]);
  expect(audit.states, `${label}: hidden overlays stay inert`).toEqual(MARKUP_OVERLAY_IDS.map(overlayId => ({
    id: overlayId,
    ariaHidden: 'true',
    inert: true,
  })));
  expect(audit.wrap, `${label}: game UI restored`).toEqual({ inert: false, ariaHidden: null });
}

async function expectFocusIn(page, id, selector, label) {
  await settle(page);
  await expect.poll(() => page.evaluate(({ overlayId, focusSelector }) => {
    const element = document.activeElement;
    return Boolean(element
      && element.closest('.overlay')?.id === overlayId
      && (!focusSelector || element.matches(focusSelector)));
  }, { overlayId: id, focusSelector: selector || null }), {
    message: `${label}: focus inside #${id}${selector ? ` on ${selector}` : ''}`,
  }).toBe(true);
}

async function expectGameplayFocus(page, selector, label) {
  await settle(page);
  await expect.poll(() => page.evaluate((focusSelector) => {
    const element = document.activeElement;
    return Boolean(element && !element.closest('.overlay') && element.matches(focusSelector));
  }, selector), { message: `${label}: gameplay focus on ${selector}` }).toBe(true);
}

// Exact text, case-insensitive so CSS text-transform cannot affect the match.
function exactly(text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

async function expectAccessibleDialog(page, id, name, description, label) {
  const dialog = page.getByRole('dialog');
  await expect(dialog, `${label}: dialog id`).toHaveAttribute('id', id);
  await expect(dialog, `${label}: dialog name`).toHaveAccessibleName(exactly(name));
  await expect(dialog, `${label}: dialog description`).toHaveAccessibleDescription(exactly(description));
}

async function expectEscapeKeeps(page, id, mode, selector, label) {
  await page.keyboard.press('Escape');
  await settle(page);
  await expect(page.locator(`#${id}`), `${label}: Escape keeps the modal`).toHaveClass(/(^|\s)show(\s|$)/);
  expect((await renderedState(page)).mode, `${label}: Escape keeps the phase`).toBe(mode);
  await expectFocusIn(page, id, selector, `${label} after Escape`);
}

async function overlayCopy(page, id) {
  return page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const text = selector => overlay.querySelector(selector)?.textContent ?? null;
    return {
      badge: text('.ov-broadcast-badge'),
      title: text('.ov-title'),
      sub: text('.ov-sub'),
      buttons: Array.from(overlay.querySelectorAll('button'))
        .filter(button => !button.hidden && button.getClientRects().length > 0)
        .map(button => ({
          id: button.id,
          text: button.textContent.replace(/\s+/g, ' ').trim(),
          onclick: button.getAttribute('onclick'),
          disabled: button.disabled,
        })),
    };
  }, id);
}

function action(id, text, onclick) {
  return { id, text, onclick, disabled: false };
}

async function scorebug(page, id) {
  return page.evaluate((overlayId) => {
    const bug = document.getElementById(`${overlayId}-scorebug`);
    const rect = bug.getBoundingClientRect();
    return {
      ariaHidden: bug.getAttribute('aria-hidden'),
      rendered: rect.width > 0 && rect.height > 0,
      spans: Array.from(bug.children).map(child => ({
        tag: child.localName,
        className: child.className,
        text: child.textContent,
        elements: child.childElementCount,
      })),
    };
  }, id);
}

function expectedScorebug(texts) {
  return {
    ariaHidden: 'true',
    rendered: true,
    spans: SCOREBUG_CLASSES.map((className, index) => ({ tag: 'span', className, text: texts[index], elements: 0 })),
  };
}

async function breakStyles(page, id) {
  return page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const art = overlay.querySelector('.overlay-card').firstElementChild;
    const rect = art.getBoundingClientRect();
    return {
      art: `${art.localName}.${Array.from(art.classList).join('.')}`,
      artRendered: rect.width > 0 && rect.height > 0,
      sweep: getComputedStyle(overlay.querySelector('.ov-sweep')).display,
      sweepAnimation: getComputedStyle(overlay.querySelector('.ov-sweep')).animationName,
      rise: ['.ov-broadcast-badge', '.ov-title', '.ov-scorebug', '.ov-sub']
        .map(selector => getComputedStyle(overlay.querySelector(selector)).animationName),
    };
  }, id);
}

async function finalDetails(page) {
  return page.evaluate(() => {
    const end = document.getElementById('ov-end');
    const score = document.getElementById('ov-end-score');
    const result = document.getElementById('ov-end-result');
    return {
      resultClasses: ['ov-win', 'ov-loss', 'ov-tie'].filter(name => end.classList.contains(name)),
      special: end.hasAttribute('data-special-result'),
      score: score.textContent,
      scoreLabel: score.getAttribute('aria-label'),
      resultHidden: result.hidden,
      resultText: result.textContent,
      seasonHidden: document.getElementById('ov-end-season').hidden,
      quickHidden: document.getElementById('ov-end-quick-btn').hidden,
    };
  });
}

async function expectOverlayGeometry(page, testInfo, label) {
  const metrics = await page.evaluate(() => {
    const overlay = document.querySelector('.overlay.show');
    const card = overlay.querySelector('.overlay-card');
    const rect = card.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      card: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        clientWidth: card.clientWidth,
        scrollWidth: card.scrollWidth,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
      },
      buttons: Array.from(overlay.querySelectorAll('button')).filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      }).map((element) => {
        const box = element.getBoundingClientRect();
        return {
          text: element.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
          top: box.top,
          left: box.left,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      }),
    };
  });
  evidenceFor(testInfo).geometry[label] = metrics;
  expect(metrics.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(metrics.width + EPS);
  expect(metrics.card.top, `${label}: card clipped above viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(metrics.card.left, `${label}: card clipped left of viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(metrics.card.right, `${label}: card clipped right of viewport`).toBeLessThanOrEqual(metrics.width + EPS);
  // Whole-card containment: a visible CTA alone cannot prove every row fits.
  expect(metrics.card.bottom, `${label}: card below viewport`).toBeLessThanOrEqual(metrics.height + EPS);
  expect(metrics.card.scrollHeight, `${label}: card content clipped internally`)
    .toBeLessThanOrEqual(metrics.card.clientHeight + EPS);
  expect(metrics.buttons.length, `${label}: visible overlay actions`).toBeGreaterThan(0);
  for (const button of metrics.buttons) {
    expect(button.width, `${label}: narrow target ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: short target ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.top, `${label}: top-clipped target ${button.text}`).toBeGreaterThanOrEqual(-EPS);
    expect(button.left, `${label}: left-clipped target ${button.text}`).toBeGreaterThanOrEqual(-EPS);
    expect(button.right, `${label}: right-clipped target ${button.text}`).toBeLessThanOrEqual(metrics.width + EPS);
    expect(button.bottom, `${label}: target below fold ${button.text}`).toBeLessThanOrEqual(metrics.height + EPS);
  }
  return metrics;
}

// One shown modal, exact source copy and phase, named dialog, focus entry,
// Escape containment, geometry, and the optional external capture.
async function expectOverlayPresentation(page, testInfo, spec) {
  const { id, label } = spec;
  await expectOnlyOverlay(page, id, label);
  if (spec.copy) expect(await overlayCopy(page, id), `${label}: overlay copy`).toEqual(spec.copy);
  await expectRender(page, spec.render, label);
  await expectAccessibleDialog(
    page,
    id,
    spec.name ?? spec.copy.title,
    spec.description ?? spec.copy.sub,
    label,
  );
  await expectFocusIn(page, id, spec.focus, label);
  await expectEscapeKeeps(page, id, spec.render.mode, spec.focus, label);
  await expectOverlayGeometry(page, testInfo, label);
  await capture(page, testInfo, label);
}

// Tap the real control, then observe the synchronous hide before any timer runs.
async function tapOverlayAction(page, id, selector, label) {
  await page.locator(`#${id} ${selector}`).tap();
  const exit = await page.evaluate((overlayId) => {
    const overlay = document.getElementById(overlayId);
    return {
      show: overlay.classList.contains('show'),
      display: getComputedStyle(overlay).display,
      ariaHidden: overlay.getAttribute('aria-hidden'),
      inert: overlay.inert,
      animations: window.__issue49.animationNames(overlayId),
      decorations: Array.from(overlay.querySelectorAll('.ov-confetti'))
        .reduce((count, container) => count + container.childElementCount, 0),
    };
  }, id);
  expect(exit, `${label}: immediate exit`).toEqual({
    show: false,
    display: 'none',
    ariaHidden: 'true',
    inert: true,
    animations: [],
    decorations: 0,
  });
}

function periodSeed(overrides) {
  const possession = overrides.possession || 'offense';
  const offense = possession === 'offense';
  return {
    possession,
    direction: offense ? 1 : -1,
    down: 1,
    yardsToGo: 10,
    yardLine: offense ? 20 : 80,
    firstDownLine: offense ? 30 : 70,
    driveStart: offense ? 20 : 80,
    plays: 2,
    drivePlays: 0,
    quarterPossessions: 3,
    ...overrides,
  };
}

const Q1_END_SEED = periodSeed({
  possession: 'offense', quarter: 1,
  scores: { player: 7, opponent: 7 }, tds: 1, opponentTds: 1, correctAnswers: 2, gradedQuestions: 4,
});
const Q1_END_COPY = {
  badge: 'BREAK',
  title: 'End of 1st Quarter',
  sub: "Quarter complete. Next possession after the break: UNC's ball. Score: 7 - 7",
  buttons: [action('', 'Next Quarter', 'nextQuarter()')],
};
const WIN_FINAL_SEED = periodSeed({
  possession: 'offense', quarter: 4,
  scores: { player: 21, opponent: 14 }, tds: 3, opponentTds: 2, correctAnswers: 6, gradedQuestions: 8,
});
const LOSS_FINAL_SEED = periodSeed({
  possession: 'offense', quarter: 4,
  scores: { player: 10, opponent: 17 }, tds: 1, opponentTds: 2, correctAnswers: 3, gradedQuestions: 6,
});
const TIE_FINAL_SEED = periodSeed({
  possession: 'offense', quarter: 4,
  scores: { player: 10, opponent: 10 }, tds: 1, opponentTds: 1, correctAnswers: 4, gradedQuestions: 5,
});
const ORDINARY_FINALS = [
  {
    name: 'win',
    label: 'b15-final-win',
    seed: WIN_FINAL_SEED,
    details: { resultClasses: ['ov-win'], score: '21 - 14', scoreLabel: 'Duke 21, North Carolina 14' },
    copy: { badge: 'VICTORY', title: 'You Win!', sub: 'Great game. Duke vs North Carolina. Player TDs: 3.' },
    stats: ['6 / 8', '75%'],
    confetti: 40,
  },
  {
    name: 'loss',
    label: 'b16-final-loss',
    seed: LOSS_FINAL_SEED,
    details: { resultClasses: ['ov-loss'], score: '10 - 17', scoreLabel: 'Duke 10, North Carolina 17' },
    copy: { badge: 'FINAL', title: 'Final Score', sub: 'Good effort. Try another game. Duke vs North Carolina. Player TDs: 1.' },
    stats: ['3 / 6', '50%'],
    confetti: 0,
  },
  {
    name: 'tie',
    label: 'b17-final-tie',
    seed: TIE_FINAL_SEED,
    details: { resultClasses: ['ov-tie'], score: '10 - 10', scoreLabel: 'Duke 10, North Carolina 10' },
    copy: { badge: 'TIE', title: 'Tie Game!', sub: 'Both teams finished even. Duke vs North Carolina. Player TDs: 1.' },
    stats: ['4 / 5', '80%'],
    confetti: 0,
  },
];

test.describe('issue 49 overlay characterization', () => {
  test('characterization: overlay markup keeps roots, ids, ARIA wiring, inline actions, and break art', async ({ page }, testInfo) => {
    await page.goto('/football/');
    const markup = await page.evaluate(() => {
      const describe = element => `${element.localName}${element.id ? `#${element.id}` : ''}`
        + Array.from(element.classList).map(name => `.${name}`).join('');
      const dynamic = '#rival-options, #season-rungs, #tl-prompt, #tl-visual, #tl-choices, #ov-end-stats, .ov-scorebug, .ov-confetti';
      return Array.from(document.querySelectorAll('.overlay')).map(overlay => ({
        id: overlay.id,
        role: overlay.getAttribute('role'),
        modal: overlay.getAttribute('aria-modal'),
        labelledBy: overlay.getAttribute('aria-labelledby'),
        describedBy: overlay.getAttribute('aria-describedby'),
        rootChildren: Array.from(overlay.children).map(describe),
        card: Array.from(overlay.querySelector('.overlay-card').children).map(describe),
        ids: Array.from(overlay.querySelectorAll('[id]'))
          .filter(element => !element.parentElement.closest(dynamic))
          .map(element => element.id),
        actions: Array.from(overlay.querySelectorAll('button[onclick]'))
          .map(button => ({ id: button.id, onclick: button.getAttribute('onclick') })),
      }));
    });

    const breakCard = id => [
      'svg.ov-fieldbg',
      'div.ov-sweep',
      'span.ov-broadcast-badge.ov-badge-info',
      `div#${id}-title.ov-title`,
      `div#${id}-scorebug.ov-scorebug`,
      `div#${id}-sub.ov-sub`,
      'button.ov-btn',
    ];
    expect(markup).toEqual([
      {
        id: 'ov-start', role: 'dialog', modal: 'true', labelledBy: 'ov-start-title', describedBy: 'ov-start-sub',
        rootChildren: ['div.overlay-card'],
        card: [
          'span.ov-broadcast-badge.ov-badge-info', 'div#ov-start-title.ov-title', 'div#ov-start-sub.ov-sub',
          'fieldset#play-mode-picker.play-mode-picker', 'div#quick-game-panel', 'div#season-panel.season-panel',
          'div.start-action-row',
        ],
        ids: [
          'ov-start-title', 'ov-start-sub', 'play-mode-picker', 'quick-game-panel', 'rival-picker', 'rival-options',
          'rival-preview', 'rival-preview-matchup', 'rival-preview-style', 'season-panel', 'season-progress',
          'season-record', 'season-rungs', 'season-next', 'season-status', 'start-game-btn', 'tl-open-button',
        ],
        actions: [
          { id: 'start-game-btn', onclick: 'startGame()' },
          { id: 'tl-open-button', onclick: 'openTimeLab()' },
        ],
      },
      {
        id: 'ov-time-lab', role: 'dialog', modal: 'true', labelledBy: 'tl-title', describedBy: 'tl-subtitle',
        rootChildren: ['div.overlay-card.tl-card'],
        card: [
          'div.tl-topbar', 'h1#tl-title.tl-title', 'p#tl-subtitle.tl-subtitle', 'section#tl-mode-view.tl-mode-view',
          'section#tl-question-view.tl-question-view', 'section#tl-recap-view.tl-recap-view',
        ],
        ids: [
          'tl-back-button', 'tl-title', 'tl-subtitle', 'tl-mode-view', 'tl-mode-heading', 'tl-mode-clocks',
          'tl-mode-calendar', 'tl-mode-mixed', 'tl-question-view', 'tl-active-mode', 'tl-progress',
          'tl-question-heading', 'tl-prompt', 'tl-visual', 'tl-guidance', 'tl-guidance-copy', 'tl-choices',
          'tl-feedback', 'tl-worked', 'tl-worked-heading', 'tl-worked-copy', 'tl-next-button', 'tl-recap-view',
          'tl-recap-heading', 'tl-recap-copy', 'tl-recap-read', 'tl-recap-solved', 'tl-recap-supported',
          'tl-done-button',
        ],
        actions: [
          { id: 'tl-back-button', onclick: 'closeTimeLab()' },
          { id: 'tl-mode-clocks', onclick: "startTimeLab('clocks')" },
          { id: 'tl-mode-calendar', onclick: "startTimeLab('calendar')" },
          { id: 'tl-mode-mixed', onclick: "startTimeLab('mixed')" },
          { id: 'tl-next-button', onclick: 'advanceTimeLabQuestion(this)' },
          { id: 'tl-done-button', onclick: 'finishTimeLab()' },
        ],
      },
      {
        id: 'ov-td', role: 'dialog', modal: 'true', labelledBy: 'ov-td-title', describedBy: 'ov-td-sub',
        rootChildren: ['div.overlay-card'],
        card: [
          'div#ov-td-confetti.ov-confetti', 'span#ov-td-badge.ov-broadcast-badge', 'div#ov-td-title.ov-title',
          'div#ov-td-sub.ov-sub', 'button#ov-td-btn.ov-btn',
        ],
        ids: ['ov-td-confetti', 'ov-td-badge', 'ov-td-title', 'ov-td-sub', 'ov-td-btn'],
        actions: [{ id: 'ov-td-btn', onclick: 'afterTouchdown()' }],
      },
      {
        id: 'ov-defense', role: 'dialog', modal: 'true', labelledBy: 'ov-defense-title', describedBy: 'ov-defense-sub',
        rootChildren: ['div.overlay-card'],
        card: [
          'span.ov-broadcast-badge.ov-badge-defense', 'div#ov-defense-title.ov-title', 'div#ov-defense-sub.ov-sub',
          'button.ov-btn',
        ],
        ids: ['ov-defense-title', 'ov-defense-sub'],
        actions: [{ id: '', onclick: 'startDefense()' }],
      },
      {
        id: 'ov-offense', role: 'dialog', modal: 'true', labelledBy: 'ov-offense-title', describedBy: 'ov-offense-sub',
        rootChildren: ['div.overlay-card'],
        card: [
          'span.ov-broadcast-badge.ov-badge-info', 'div#ov-offense-title.ov-title', 'div#ov-offense-sub.ov-sub',
          'button.ov-btn',
        ],
        ids: ['ov-offense-title', 'ov-offense-sub'],
        actions: [{ id: '', onclick: 'startOffense()' }],
      },
      {
        id: 'ov-quarter', role: 'dialog', modal: 'true', labelledBy: 'ov-quarter-title', describedBy: 'ov-quarter-sub',
        rootChildren: ['div.overlay-card'],
        card: breakCard('ov-quarter'),
        ids: ['ov-quarter-title', 'ov-quarter-scorebug', 'ov-quarter-sub'],
        actions: [{ id: '', onclick: 'nextQuarter()' }],
      },
      {
        id: 'ov-halftime', role: 'dialog', modal: 'true', labelledBy: 'ov-halftime-title', describedBy: 'ov-halftime-sub',
        rootChildren: ['div.overlay-card'],
        card: breakCard('ov-halftime'),
        ids: ['ov-halftime-title', 'ov-halftime-scorebug', 'ov-halftime-sub'],
        actions: [{ id: '', onclick: 'nextQuarter()' }],
      },
      {
        id: 'ov-end', role: 'dialog', modal: 'true', labelledBy: 'ov-end-title', describedBy: 'ov-end-result ov-end-sub',
        rootChildren: ['div.overlay-card'],
        card: [
          'div#ov-end-confetti.ov-confetti', 'span#ov-end-badge.ov-broadcast-badge', 'div#ov-end-title.ov-title',
          'div#ov-end-score.ov-final-score', 'div#ov-end-result.ov-end-result', 'div#ov-end-sub.ov-sub',
          'div#ov-end-season.ov-end-season', 'div#ov-end-stats.ov-stats', 'div.ov-end-actions',
        ],
        ids: [
          'ov-end-confetti', 'ov-end-badge', 'ov-end-title', 'ov-end-score', 'ov-end-result', 'ov-end-sub',
          'ov-end-season', 'ov-end-stats', 'ov-end-btn', 'ov-end-quick-btn',
        ],
        actions: [
          { id: 'ov-end-btn', onclick: 'handleEndPrimaryAction()' },
          { id: 'ov-end-quick-btn', onclick: "restart('quick')" },
        ],
      },
    ]);

    // Static copy the runtime never overwrites.
    const staticCopy = await page.evaluate(() => ({
      defense: [document.querySelector('#ov-defense .ov-broadcast-badge').textContent, document.querySelector('#ov-defense .ov-btn').textContent],
      offense: [document.querySelector('#ov-offense .ov-broadcast-badge').textContent, document.querySelector('#ov-offense .ov-btn').textContent, document.getElementById('ov-offense-title').textContent],
      quarter: [document.querySelector('#ov-quarter .ov-broadcast-badge').textContent, document.querySelector('#ov-quarter .ov-btn').textContent],
      halftime: [document.querySelector('#ov-halftime .ov-broadcast-badge').textContent, document.querySelector('#ov-halftime .ov-btn').textContent, document.getElementById('ov-halftime-title').textContent],
    }));
    expect(staticCopy).toEqual({
      defense: ['DEFENSE', 'Play Defense!'],
      offense: ['OFFENSE', 'Play Offense!', 'Your Ball'],
      quarter: ['BREAK', 'Next Quarter'],
      halftime: ['HALFTIME', '2nd Half', 'Halftime'],
    });

    // Both break cards carry identical decorative field art as their first child.
    const art = await page.evaluate(() => ['ov-quarter', 'ov-halftime'].map((id) => {
      const svg = document.querySelector(`#${id} .overlay-card`).firstElementChild;
      return {
        namespace: svg.namespaceURI,
        attributes: Object.fromEntries(['class', 'aria-hidden', 'viewBox', 'preserveAspectRatio']
          .map(name => [name, svg.getAttribute(name)])),
        descendants: ['g', 'rect', 'line'].map(tag => svg.querySelectorAll(tag).length),
        outerHTML: svg.outerHTML,
      };
    }));
    for (const copy of art) {
      expect(copy.namespace).toBe('http://www.w3.org/2000/svg');
      expect(copy.attributes).toEqual({
        class: 'ov-fieldbg',
        'aria-hidden': 'true',
        viewBox: '0 0 400 260',
        preserveAspectRatio: 'xMidYMax slice',
      });
      expect(copy.descendants).toEqual([3, 13, 8]);
    }
    expect(art[1].outerHTML, 'halftime field art matches quarter art').toBe(art[0].outerHTML);
    note(testInfo, 'fieldArtOuterHTMLSha256', sha256(art[0].outerHTML));
  });

  test('characterization: production start, touchdowns, conversions, and possession changes advance by tap', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    // Same deterministic root seed and clock as the release matrix playthrough.
    await page.addInitScript(() => {
      let seed = 0x36f00d;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
    });
    await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
    await page.goto('/football/');
    await page.evaluate(() => window.__issue49.watchDecorations());

    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-start', label: 'a01-start', focus: START_FOCUS,
      copy: START_COPY,
      render: { mode: 'start', playMode: 'quick' },
    });
    expect(await animationNames(page, 'ov-start')).toEqual([]);

    await page.locator('#start-game-btn').tap();
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
    await expectNoOverlay(page, 'start tap');
    await expectRender(page, {
      mode: 'call', possession: 'offense', quarter: 1, absoluteYard: 20, score: { player: 0, opponent: 0 },
    }, 'start tap');
    await expectGameplayFocus(page, '#call-grid .call-btn', 'start tap');

    // Player touchdown through the production commit path.
    await seedDrive(page, {
      possession: 'offense', direction: 1, quarter: 1, down: 1, yardsToGo: 1, yardLine: 99,
      firstDownLine: 100, driveStart: 99, scores: { player: 0, opponent: 0 }, plays: 0, drivePlays: 0,
      quarterPossessions: 0, tds: 0, opponentTds: 0, correctAnswers: 0, gradedQuestions: 0,
    });
    await page.locator('#call-grid .call-btn').first().tap();
    expect((await renderedState(page)).playIsTouchdown, 'seeded offense play reaches the end zone').toBe(true);
    await pauseClock(page);
    await answer(page, 'correct', 'player touchdown');
    await expectRender(page, { mode: 'feedback', score: { player: 6, opponent: 0 }, playerTouchdowns: 1 }, 'player touchdown');

    await page.clock.runFor(950);
    await expect(page.locator('#ov-td')).toHaveAttribute('data-side', 'offense');
    await expect(page.locator('#ov-td-confetti .confetti-piece')).toHaveCount(40);
    expect(await animationNames(page, 'ov-td')).toEqual([]);
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-td', label: 'a05-player-td', focus: '#ov-td-btn',
      copy: {
        badge: 'TOUCHDOWN',
        title: 'Touchdown!',
        sub: 'Score: 6 - 0. 1 player TD!',
        buttons: [action('ov-td-btn', 'Choose Conversion', 'afterTouchdown()')],
      },
      render: {
        mode: 'touchdown', touchdownSide: 'offense', possession: 'offense', quarter: 1,
        score: { player: 6, opponent: 0 },
      },
    });

    await page.evaluate(() => window.__issue49.resetDecorations());
    await tapOverlayAction(page, 'ov-td', '#ov-td-btn', 'player touchdown continue');
    await expectNoOverlay(page, 'player touchdown continue');
    await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(2);
    expect(await page.evaluate(() => window.__footballTest.decisionActions())).toEqual(['pat', 'twoPoint']);
    await expectRender(page, {
      mode: 'conversion-decision', possession: 'offense', score: { player: 6, opponent: 0 },
    }, 'player touchdown continue');
    await expectGameplayFocus(page, '#decision-grid .decision-btn', 'player touchdown continue');
    await page.clock.runFor(1500);
    const afterPlayerTd = await decorations(page);
    note(testInfo, 'decorationsAfterPlayerTouchdownExit', afterPlayerTd);
    expect(afterPlayerTd['ov-td-confetti'], 'hidden touchdown decorations stay cancelled').toEqual({
      confetti: 0, bursts: 0, confettiPresent: 0, burstsPresent: 0,
    });

    await page.locator('#decision-grid .decision-btn[data-action="pat"]').tap();
    await expectQuestionPlayType(page, 'conversion', 'player conversion');
    await answer(page, 'correct', 'player conversion');
    await expectRender(page, {
      mode: 'feedback', score: { player: 7, opponent: 0 }, quarterPossessions: 1,
    }, 'player conversion');

    await page.clock.runFor(1450);
    expect(await animationNames(page, 'ov-defense')).toEqual([]);
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-defense', label: 'a06-defense-transition', focus: '.ov-btn',
      copy: {
        badge: 'DEFENSE',
        title: "UNC's Ball",
        sub: 'PAT made for 1 point. Score: 7 - 0',
        buttons: [action('', 'Play Defense!', 'startDefense()')],
      },
      render: {
        mode: 'transition', quarter: 1, quarterPossessions: 1, score: { player: 7, opponent: 0 },
        pendingNextPossession: 'defense', pendingNextStartYardLine: 80,
      },
    });

    await tapOverlayAction(page, 'ov-defense', '.ov-btn', 'defense transition');
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
    await expectNoOverlay(page, 'defense transition');
    await expectRender(page, {
      mode: 'call', possession: 'defense', quarter: 1, absoluteYard: 80, pendingNextPossession: null,
    }, 'defense transition');
    await expectGameplayFocus(page, '#call-grid .call-btn', 'defense transition');

    // Opponent touchdown: two misses commit the frozen opponent gain.
    await seedDrive(page, {
      possession: 'defense', direction: -1, quarter: 1, down: 1, yardsToGo: 1, yardLine: 1,
      firstDownLine: 0, driveStart: 1, scores: { player: 7, opponent: 0 }, plays: 1, drivePlays: 0,
      quarterPossessions: 1, tds: 1, opponentTds: 0, correctAnswers: 2, gradedQuestions: 2,
    });
    await page.locator('#call-grid .call-btn').first().tap();
    expect((await renderedState(page)).playIsTouchdown, 'seeded opponent play reaches the end zone').toBe(true);
    await answer(page, 'wrong', 'opponent touchdown first miss');
    await answer(page, 'wrong', 'opponent touchdown second miss');
    await expectRender(page, { mode: 'explanation', continueRequired: true }, 'opponent touchdown');
    await page.locator('#question-learn-why').tap();
    await page.clock.runFor(32);
    await expect(page.locator('#worked-review')).toBeVisible();
    await page.locator('#question-continue').tap();
    await page.evaluate(() => scrollTo(0, 0));
    await expectRender(page, {
      mode: 'feedback', score: { player: 7, opponent: 6 }, opponentTouchdowns: 1,
    }, 'opponent touchdown');

    await page.clock.runFor(950);
    await expect(page.locator('#ov-td')).toHaveAttribute('data-side', 'defense');
    await expect(page.locator('#ov-td-confetti .confetti-piece')).toHaveCount(0);
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-td', label: 'a10-opponent-td', focus: '#ov-td-btn',
      copy: {
        badge: 'UNC TD',
        title: 'UNC Scores',
        sub: 'Score: 7 - 6. UNC has 1 TD — get it back!',
        buttons: [action('ov-td-btn', 'Defend Conversion', 'afterTouchdown()')],
      },
      render: {
        mode: 'touchdown', touchdownSide: 'defense', possession: 'defense', quarter: 1,
        score: { player: 7, opponent: 6 },
      },
    });

    await tapOverlayAction(page, 'ov-td', '#ov-td-btn', 'opponent touchdown continue');
    await expectNoOverlay(page, 'opponent touchdown continue');
    await expectQuestionPlayType(page, 'conversion', 'opponent conversion');
    await expectRender(page, { mode: 'question', possession: 'defense' }, 'opponent touchdown continue');
    await expect(page.locator('#special-action-live')).toContainText('PAT');

    await answer(page, 'wrong', 'opponent conversion first miss');
    await answer(page, 'wrong', 'opponent conversion second miss');
    await expectRender(page, { mode: 'explanation', continueRequired: true }, 'opponent conversion');
    await page.locator('#question-learn-why').tap();
    await page.clock.runFor(32);
    await expect(page.locator('#worked-review')).toBeVisible();
    await page.locator('#question-continue').tap();
    await page.evaluate(() => scrollTo(0, 0));
    await expectRender(page, {
      mode: 'feedback', score: { player: 7, opponent: 7 }, quarterPossessions: 2,
    }, 'opponent conversion');

    await page.clock.runFor(1450);
    expect(await animationNames(page, 'ov-offense')).toEqual([]);
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-offense', label: 'a11-offense-transition', focus: '.ov-btn',
      copy: {
        badge: 'OFFENSE',
        title: 'Your Ball',
        sub: 'PAT made for 1 point. Score: 7 - 7',
        buttons: [action('', 'Play Offense!', 'startOffense()')],
      },
      render: {
        mode: 'transition', quarter: 1, quarterPossessions: 2, score: { player: 7, opponent: 7 },
        pendingNextPossession: 'offense', pendingNextStartYardLine: 20,
      },
    });

    await tapOverlayAction(page, 'ov-offense', '.ov-btn', 'offense transition');
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
    await expectNoOverlay(page, 'offense transition');
    await expectRender(page, {
      mode: 'call', possession: 'offense', quarter: 1, absoluteYard: 20, pendingNextPossession: null,
    }, 'offense transition');
    await expectGameplayFocus(page, '#call-grid .call-btn', 'offense transition');
  });

  test('characterization: quarter, halftime, and Q3 breaks advance by tap', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.goto('/football/?boot=offense-call');

    // Q1 break keeps the committed placement for Q2.
    let shown = await finishSeededPossession(page, Q1_END_SEED, 'Quarter complete.');
    expect(shown).toEqual({ id: 'ov-quarter', animations: BREAK_ANIMATIONS });
    expect(await breakStyles(page, 'ov-quarter')).toEqual({
      art: 'svg.ov-fieldbg', artRendered: true, sweep: 'block', sweepAnimation: 'ov-break-sweep',
      rise: ['ov-break-rise', 'ov-break-rise', 'ov-break-rise', 'ov-break-rise'],
    });
    expect(await scorebug(page, 'ov-quarter')).toEqual(
      expectedScorebug(['DUKE', '7', '–', '7', 'UNC', "Next: UNC's ball"]),
    );
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-quarter', label: 'b12-q1-quarter-end', focus: '.ov-btn',
      copy: Q1_END_COPY,
      render: {
        mode: 'quarter', quarter: 1, quarterPossessions: 4, score: { player: 7, opponent: 7 },
        pendingNextPossession: 'defense', pendingNextStartYardLine: 80, pendingRestartReason: 'legacyScheduledChange',
      },
    });
    await tapOverlayAction(page, 'ov-quarter', '.ov-btn', 'Q1 next quarter');
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
    await expectNoOverlay(page, 'Q1 next quarter');
    await expectRender(page, {
      mode: 'call', quarter: 2, quarterPossessions: 0, possession: 'defense', absoluteYard: 80,
      restartReason: 'legacyScheduledChange', pendingNextPossession: null,
    }, 'Q1 next quarter');
    await expectGameplayFocus(page, '#call-grid .call-btn', 'Q1 next quarter');

    // Halftime replaces the committed placement with the opponent kickoff.
    shown = await finishSeededPossession(page, periodSeed({
      possession: 'defense', quarter: 2,
      scores: { player: 7, opponent: 7 }, tds: 1, opponentTds: 1, correctAnswers: 2, gradedQuestions: 4,
    }), 'First half complete.');
    expect(shown).toEqual({ id: 'ov-halftime', animations: BREAK_ANIMATIONS });
    expect(await scorebug(page, 'ov-halftime')).toEqual(
      expectedScorebug(['DUKE', '7', '–', '7', 'UNC', "Next: UNC's ball"]),
    );
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-halftime', label: 'b13-halftime', focus: '.ov-btn',
      copy: {
        badge: 'HALFTIME',
        title: 'Halftime',
        sub: "First half complete. Halftime swap: UNC's ball starts the 2nd half. Score: 7 - 7",
        buttons: [action('', '2nd Half', 'nextQuarter()')],
      },
      render: {
        mode: 'halftime', quarter: 2, quarterPossessions: 4, score: { player: 7, opponent: 7 },
        pendingNextPossession: 'defense', pendingNextStartYardLine: 80, pendingRestartReason: 'halftimeKickoff',
      },
    });
    await tapOverlayAction(page, 'ov-halftime', '.ov-btn', 'halftime second half');
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
    await expectNoOverlay(page, 'halftime second half');
    await expectRender(page, {
      mode: 'call', quarter: 3, quarterPossessions: 0, possession: 'defense', absoluteYard: 80,
      restartReason: 'halftimeKickoff', pendingNextPossession: null,
    }, 'halftime second half');

    // Q3 break from a defensive possession hands the ball to the player.
    shown = await finishSeededPossession(page, periodSeed({
      possession: 'defense', quarter: 3,
      scores: { player: 14, opponent: 10 }, tds: 2, opponentTds: 1, correctAnswers: 4, gradedQuestions: 6,
    }), 'Quarter complete.');
    expect(shown).toEqual({ id: 'ov-quarter', animations: BREAK_ANIMATIONS });
    expect(await scorebug(page, 'ov-quarter')).toEqual(
      expectedScorebug(['DUKE', '14', '–', '10', 'UNC', 'Next: Your ball']),
    );
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-quarter', label: 'b14-q3-quarter-end', focus: '.ov-btn',
      copy: {
        badge: 'BREAK',
        title: 'End of 3rd Quarter',
        sub: 'Quarter complete. Next possession after the break: Your ball. Score: 14 - 10',
        buttons: [action('', 'Next Quarter', 'nextQuarter()')],
      },
      render: {
        mode: 'quarter', quarter: 3, quarterPossessions: 4, score: { player: 14, opponent: 10 },
        pendingNextPossession: 'offense', pendingNextStartYardLine: 20, pendingRestartReason: 'legacyScheduledChange',
      },
    });
    await tapOverlayAction(page, 'ov-quarter', '.ov-btn', 'Q3 next quarter');
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
    await expectNoOverlay(page, 'Q3 next quarter');
    await expectRender(page, {
      mode: 'call', quarter: 4, quarterPossessions: 0, possession: 'offense', absoluteYard: 20,
      restartReason: 'legacyScheduledChange', pendingNextPossession: null,
    }, 'Q3 next quarter');
    await expectGameplayFocus(page, '#call-grid .call-btn', 'Q3 next quarter');
  });

  // Each ordinary final runs separately so one variant cannot hide another.
  for (const final of ORDINARY_FINALS) {
    test(`characterization: ${final.name} final shows its result copy and restarts by tap`, async ({ page }, testInfo) => {
      await page.goto('/football/?boot=offense-call');
      const shown = await finishSeededPossession(page, final.seed, 'Game complete.');
      expect(shown, `${final.label}: overlay`).toEqual({ id: 'ov-end', animations: [] });
      expect(await finalDetails(page), `${final.label}: final details`).toEqual({
        ...final.details,
        special: false,
        resultHidden: true,
        resultText: '',
        seasonHidden: true,
        quickHidden: true,
      });
      await expect(page.locator('#ov-end-confetti .confetti-piece')).toHaveCount(final.confetti);
      for (const text of final.stats) await expect(page.locator('#ov-end-stats')).toContainText(text);
      await expectOverlayPresentation(page, testInfo, {
        id: 'ov-end', label: final.label, focus: '#ov-end-btn',
        copy: { ...final.copy, buttons: [action('ov-end-btn', 'Play Again!', 'handleEndPrimaryAction()')] },
        render: {
          mode: 'final', quarter: 4, quarterPossessions: 4,
          score: { player: final.seed.scores.player, opponent: final.seed.scores.opponent },
          pendingNextPossession: null, specialResult: null,
        },
      });

      await tapOverlayAction(page, 'ov-end', '#ov-end-btn', `${final.label} play again`);
      await expectOverlayPresentation(page, testInfo, {
        id: 'ov-start', label: `${final.label}-restart-start`, focus: START_FOCUS,
        copy: START_COPY,
        render: { mode: 'start', playMode: 'quick' },
      });
    });
  }

  test('characterization: played Coach Report and saved Season loss final stays contained and continues the Season by tap', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto('/football/');
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
      key: 'footballMathSeason:v1',
      raw: JSON.stringify({
        schemaVersion: 1,
        currentSeason: {
          seasonId: 'issue49-season',
          formatId: 'three-rival-schedule-v1',
          playerId: 'duke',
          createdAt: '2026-07-19T12:00:00.000Z',
          schedule: ['unc', 'nc-state', 'wake-forest'],
          results: [{
            gameNumber: 1, gameId: 'issue49-season-game-1', rivalId: 'unc',
            playerScore: 10, opponentScore: 17, completedAt: '2026-07-19T12:30:00.000Z',
          }],
        },
      }),
    });
    await page.goto('/football/?boot=offense-call');

    // Two real graded plays give the Coach Report played evidence.
    await seedDrive(page, periodSeed({ possession: 'offense', quarter: 1, quarterPossessions: 0, yardLine: 30, firstDownLine: 40, driveStart: 30 }));
    await page.locator('#call-grid .call-btn').first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    await answer(page, 'correct', 'coach offense play');
    await seedDrive(page, periodSeed({ possession: 'defense', quarter: 1, quarterPossessions: 1, yardLine: 70, firstDownLine: 60, driveStart: 70 }));
    await page.locator('#call-grid .call-btn').first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    await answer(page, 'wrong', 'coach defense first miss');
    await answer(page, 'wrong', 'coach defense second miss');
    await page.locator('#question-learn-why').tap();
    await expect(page.locator('#worked-review')).toBeVisible();
    await page.locator('#question-continue').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

    // Same presentation-only Season binding the release matrix uses.
    const shown = await page.evaluate((seed) => {
      activeSeasonBinding = Object.freeze({
        seasonId: 'issue49-season', gameNumber: 1, rivalId: 'unc', gameId: 'issue49-season-game-1',
      });
      window.__footballTest.seedDriveState(seed);
      finishPossession('Game complete.');
      return document.querySelector('.overlay.show')?.id || null;
    }, periodSeed({
      possession: 'offense', quarter: 4,
      scores: { player: 10, opponent: 17 }, tds: 1, opponentTds: 2, correctAnswers: 1, gradedQuestions: 2,
    }));
    expect(shown).toBe('ov-end');
    expect(await finalDetails(page)).toEqual({
      resultClasses: ['ov-loss'], special: false, score: '10 - 17', scoreLabel: 'Duke 10, North Carolina 17',
      resultHidden: true, resultText: '', seasonHidden: false, quickHidden: true,
    });
    await expect(page.locator('#ov-end-season')).toHaveText('Game 1 saved. 0 wins · 1 loss · 0 ties. Next: NC State.');
    const coachValues = await page.locator('#ov-end-stats .ov-coach-value').allTextContents();
    note(testInfo, 'coachReport', coachValues);
    expect(coachValues).toHaveLength(2);
    expect(coachValues).not.toContain('Keep playing to build your learning recap');
    await expect(page.locator('#ov-end-stats')).toContainText('1 / 2');
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-end', label: 'g26-final-loss-season-coach', focus: '#ov-end-btn',
      copy: {
        badge: 'FINAL',
        title: 'Final Score',
        sub: 'Good effort. Try another game. Duke vs North Carolina. Player TDs: 1.',
        buttons: [action('ov-end-btn', 'Continue Season', 'handleEndPrimaryAction()')],
      },
      render: { mode: 'final', playMode: 'season', quarter: 4, score: { player: 10, opponent: 17 } },
    });

    await tapOverlayAction(page, 'ov-end', '#ov-end-btn', 'Season loss continue');
    await expectOnlyOverlay(page, 'ov-start', 'Season loss continue');
    await expectRender(page, { mode: 'start', playMode: 'season' }, 'Season loss continue');
    await expect(page.locator('#start-game-btn')).toHaveText('Play Game 2');
    await expectFocusIn(page, 'ov-start', 'input[name="play-mode"]:checked', 'Season loss continue');
  });

  test('characterization: special-result final from a tapped field goal keeps its result copy', async ({ page }, testInfo) => {
    await page.goto('/football/?boot=offense-call');
    await seedDrive(page, {
      possession: 'offense', direction: 1, quarter: 4, down: 4, yardsToGo: 2, yardLine: 60,
      firstDownLine: 62, driveStart: 20, scores: { player: 14, opponent: 14 }, plays: 10, drivePlays: 3,
      quarterPossessions: 3, tds: 2, opponentTds: 2, correctAnswers: 5, gradedQuestions: 6,
    });
    await expect(page.locator('#decision-grid .decision-btn')).toHaveCount(3);
    await page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]').tap();
    await expectQuestionPlayType(page, 'fieldGoal', 'final field goal');
    await answer(page, 'correct', 'final field goal');
    await expect(page.locator('#feedback')).toHaveText('Field goal made. Three points.');

    await expect(page.locator('#ov-end')).toHaveClass(/(^|\s)show(\s|$)/, { timeout: 5000 });
    expect(await animationNames(page, 'ov-end')).toEqual([]);
    expect(await finalDetails(page)).toEqual({
      resultClasses: ['ov-win'],
      special: true,
      score: '17 - 14',
      scoreLabel: 'Duke 17, North Carolina 14',
      resultHidden: false,
      resultText: 'Field goal made. Three points.',
      seasonHidden: true,
      quickHidden: true,
    });
    await expect(page.locator('#ov-end-confetti .confetti-piece')).toHaveCount(40);
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-end', label: 'c19-final-win-special', focus: '#ov-end-btn',
      copy: {
        badge: 'VICTORY',
        title: 'You Win!',
        sub: 'Great game. Duke vs North Carolina. Player TDs: 2.',
        buttons: [action('ov-end-btn', 'Play Again!', 'handleEndPrimaryAction()')],
      },
      description: 'Field goal made. Three points. Great game. Duke vs North Carolina. Player TDs: 2.',
      render: {
        mode: 'final', quarter: 4, quarterPossessions: 4, score: { player: 17, opponent: 14 },
        pendingNextPossession: null, outcomeMessage: 'Field goal made. Three points.',
        specialResult: { playType: 'fieldGoal', message: 'Field goal made. Three points.' },
      },
    });

    await tapOverlayAction(page, 'ov-end', '#ov-end-btn', 'special final play again');
    await expectOnlyOverlay(page, 'ov-start', 'special final play again');
    await expectRender(page, { mode: 'start', playMode: 'quick' }, 'special final play again');
    await expectFocusIn(page, 'ov-start', START_FOCUS, 'special final play again');
  });

  test('characterization: Time Lab opens, starts practice, and exits through the shared modal controller by tap', async ({ page }, testInfo) => {
    // Same fixed practice seed as the release matrix Time Lab path.
    await page.addInitScript(() => {
      Object.defineProperty(window.crypto, 'getRandomValues', {
        configurable: true,
        value(values) {
          values.fill(0);
          values[0] = 1234;
          return values;
        },
      });
    });
    await page.goto('/football/');
    await expectOnlyOverlay(page, 'ov-start', 'Time Lab entry');

    await tapOverlayAction(page, 'ov-start', '#tl-open-button', 'open Time Lab');
    await expect(page.locator('#ov-time-lab .tl-card')).toHaveAttribute('data-tl-view', 'menu');
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-time-lab', label: 'd20-time-lab-menu', focus: '#tl-mode-clocks',
      copy: {
        badge: 'Practice Lab',
        title: null,
        sub: null,
        buttons: [
          action('tl-back-button', 'Back', 'closeTimeLab()'),
          action('tl-mode-clocks', '◷ Clocks Read times, move ahead, and choose AM or PM', "startTimeLab('clocks')"),
          action('tl-mode-calendar', '▦ Calendar Find weekdays and put months in order', "startTimeLab('calendar')"),
          action('tl-mode-mixed', '↔ Mixed Try every clock and calendar skill once', "startTimeLab('mixed')"),
        ],
      },
      name: 'Clocks & Calendars',
      description: 'Choose one eight-question practice session. It stays separate from your game and season.',
      render: { mode: 'start' },
    });

    await page.locator('#tl-mode-mixed').tap();
    await expect(page.locator('#ov-time-lab .tl-card')).toHaveAttribute('data-tl-view', 'question');
    await expect(page.locator('#tl-progress')).toHaveText('Question 1 of 8');
    await expect(page.locator('#tl-choices .tl-choice-button')).toHaveCount(4);
    await expectOnlyOverlay(page, 'ov-time-lab', 'Time Lab question');
    await expectFocusIn(page, 'ov-time-lab', null, 'Time Lab question');
    await expectOverlayGeometry(page, testInfo, 'd21-time-lab-question');
    await capture(page, testInfo, 'd21-time-lab-question');

    await tapOverlayAction(page, 'ov-time-lab', '#tl-back-button', 'Time Lab back');
    await expectOnlyOverlay(page, 'ov-start', 'Time Lab back');
    await expectFocusIn(page, 'ov-start', '#tl-open-button', 'Time Lab back');
    await expectRender(page, { mode: 'start', practice: { active: false } }, 'Time Lab back');
    expect(await page.evaluate(() => sessionInitialized)).toBe(false);
    await capture(page, testInfo, 'd22-time-lab-returned-start');
  });

  test('characterization: reduced motion keeps break entrances and touchdown or win decorations static', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date('2026-01-03T12:00:00Z') });
    await page.goto('/football/?boot=offense-call');
    await pauseClock(page);
    await page.evaluate(() => window.__issue49.watchDecorations());

    const shown = await finishSeededPossession(page, Q1_END_SEED, 'Quarter complete.');
    expect(shown).toEqual({ id: 'ov-quarter', animations: [] });
    expect(await breakStyles(page, 'ov-quarter')).toEqual({
      art: 'svg.ov-fieldbg', artRendered: true, sweep: 'none', sweepAnimation: 'none',
      rise: ['none', 'none', 'none', 'none'],
    });
    await expectOverlayPresentation(page, testInfo, {
      id: 'ov-quarter', label: 'e23-reduced-q1-quarter-end', focus: '.ov-btn',
      copy: Q1_END_COPY,
      render: { mode: 'quarter', quarter: 1, pendingNextPossession: 'defense' },
    });
    await tapOverlayAction(page, 'ov-quarter', '.ov-btn', 'reduced Q1 next quarter');
    await expectRender(page, { mode: 'call', quarter: 2, possession: 'defense' }, 'reduced Q1 next quarter');

    await seedDrive(page, periodSeed({
      possession: 'offense', quarter: 2, quarterPossessions: 0,
      scores: { player: 7, opponent: 0 }, tds: 1, opponentTds: 0,
    }));
    await page.evaluate(() => {
      window.__issue49.resetDecorations();
      showTD('offense');
    });
    await expectOnlyOverlay(page, 'ov-td', 'reduced player touchdown');
    await page.clock.runFor(1500);
    expect((await decorations(page))['ov-td-confetti'], 'reduced touchdown decorations').toEqual({
      confetti: 0, bursts: 0, confettiPresent: 0, burstsPresent: 0,
    });
    await expectOverlayGeometry(page, testInfo, 'e24-reduced-player-td');
    await capture(page, testInfo, 'e24-reduced-player-td');
    await tapOverlayAction(page, 'ov-td', '#ov-td-btn', 'reduced touchdown continue');
    await expectRender(page, { mode: 'conversion-decision' }, 'reduced touchdown continue');

    await page.evaluate(() => window.__issue49.resetDecorations());
    expect((await finishSeededPossession(page, WIN_FINAL_SEED, 'Game complete.')).id).toBe('ov-end');
    await page.clock.runFor(1500);
    expect((await decorations(page))['ov-end-confetti'], 'reduced win decorations').toEqual({
      confetti: 0, bursts: 0, confettiPresent: 0, burstsPresent: 0,
    });
    expect((await finalDetails(page)).resultClasses).toEqual(['ov-win']);
    await expectOverlayGeometry(page, testInfo, 'e25-reduced-final-win');
    await capture(page, testInfo, 'e25-reduced-final-win');
  });

  test('characterization: overlay re-entry keeps or restarts entrances and cancels stale decorations', async ({ page }, testInfo) => {
    await page.clock.install({ time: new Date('2026-01-04T12:00:00Z') });
    await page.goto('/football/?boot=offense-call');
    await pauseClock(page);
    await page.evaluate(() => window.__issue49.watchDecorations());
    const touchdownSeed = periodSeed({
      possession: 'offense', quarter: 2, quarterPossessions: 0,
      scores: { player: 7, opponent: 0 }, tds: 1, opponentTds: 0,
    });

    // Repeating a touchdown replaces its decorations; only the latest run bursts.
    await seedDrive(page, touchdownSeed);
    const repeated = await page.evaluate(() => {
      window.__issue49.resetDecorations();
      showTD('offense');
      showTD('offense');
      return Array.from(document.querySelectorAll('.overlay.show'), overlay => overlay.id);
    });
    expect(repeated).toEqual(['ov-td']);
    expect((await decorations(page))['ov-td-confetti']).toEqual({
      confetti: 80, bursts: 0, confettiPresent: 40, burstsPresent: 0,
    });
    await page.clock.runFor(1500);
    const afterRepeat = await decorations(page);
    note(testInfo, 'decorationsAfterRepeatedTouchdown', afterRepeat);
    expect(afterRepeat['ov-td-confetti'].bursts, 'only the latest firework run fires').toBe(5);
    expect(afterRepeat['ov-td-confetti'].confettiPresent).toBe(40);

    // An immediate tap exit cancels the pending touchdown bursts.
    const freshTouchdown = await page.evaluate(() => {
      window.__issue49.resetDecorations();
      showTD('offense');
      return document.querySelectorAll('#ov-td-confetti .confetti-piece').length;
    });
    expect(freshTouchdown).toBe(40);
    await tapOverlayAction(page, 'ov-td', '#ov-td-btn', 'immediate touchdown exit');
    await expectRender(page, { mode: 'conversion-decision' }, 'immediate touchdown exit');
    await page.clock.runFor(1500);
    expect((await decorations(page))['ov-td-confetti']).toEqual({
      confetti: 40, bursts: 0, confettiPresent: 0, burstsPresent: 0,
    });

    // Re-activating a shown break keeps its running entrance; showing it again
    // after an observed hide starts a new entrance.
    await seedDrive(page, Q1_END_SEED);
    const sameOverlay = await page.evaluate(() => {
      finishPossession('Quarter complete.');
      const count = window.__issue49.rememberAnimations('ov-quarter');
      activateOverlay('ov-quarter');
      return { count, again: window.__issue49.compareAnimations('ov-quarter') };
    });
    expect(sameOverlay).toEqual({ count: 5, again: { count: 5, retained: 5 } });
    const hidden = await page.evaluate(() => {
      hideOverlays();
      return {
        display: getComputedStyle(document.getElementById('ov-quarter')).display,
        animations: window.__issue49.animationNames('ov-quarter'),
      };
    });
    expect(hidden).toEqual({ display: 'none', animations: [] });
    const reentered = await page.evaluate(() => {
      activateOverlay('ov-quarter');
      return {
        compare: window.__issue49.compareAnimations('ov-quarter'),
        names: window.__issue49.animationNames('ov-quarter'),
      };
    });
    expect(reentered).toEqual({ compare: { count: 5, retained: 0 }, names: BREAK_ANIMATIONS });
    await expectOnlyOverlay(page, 'ov-quarter', 'break re-entry');
    await expectFocusIn(page, 'ov-quarter', '.ov-btn', 'break re-entry');
    await expectRender(page, { mode: 'quarter', quarter: 1 }, 'break re-entry');
    await tapOverlayAction(page, 'ov-quarter', '.ov-btn', 'break re-entry next quarter');
    await expectRender(page, { mode: 'call', quarter: 2, possession: 'defense' }, 'break re-entry next quarter');

    // A different overlay shown in the same task leaves only the latest one.
    await seedDrive(page, touchdownSeed);
    const crossOverlay = await page.evaluate(() => {
      showQuarterEnd('Quarter complete.');
      showHalftime('First half complete.');
      return {
        shown: Array.from(document.querySelectorAll('.overlay.show'), overlay => overlay.id),
        quarter: window.__issue49.animationNames('ov-quarter'),
        halftime: window.__issue49.animationNames('ov-halftime'),
      };
    });
    expect(crossOverlay).toEqual({ shown: ['ov-halftime'], quarter: [], halftime: BREAK_ANIMATIONS });
    await expectOnlyOverlay(page, 'ov-halftime', 'rapid halftime');
    await expectFocusIn(page, 'ov-halftime', '.ov-btn', 'rapid halftime');
    expect((await overlayCopy(page, 'ov-halftime')).sub).toBe(
      "First half complete. Halftime swap: UNC's ball starts the 2nd half. Score: 7 - 0",
    );
    expect(await scorebug(page, 'ov-halftime')).toEqual(
      expectedScorebug(['DUKE', '7', '–', '0', 'UNC', "Next: UNC's ball"]),
    );
    await expectRender(page, { mode: 'halftime', quarter: 2 }, 'rapid halftime');
    await tapOverlayAction(page, 'ov-halftime', '.ov-btn', 'rapid halftime second half');
    await expectRender(page, { mode: 'call', quarter: 3, possession: 'defense', absoluteYard: 80 }, 'rapid halftime second half');

    // Leaving a win final immediately cancels its pending bursts.
    expect((await finishSeededPossession(page, WIN_FINAL_SEED, 'Game complete.')).id).toBe('ov-end');
    await expect(page.locator('#ov-end-confetti .confetti-piece')).toHaveCount(40);
    await page.evaluate(() => window.__issue49.resetDecorations());
    await tapOverlayAction(page, 'ov-end', '#ov-end-btn', 'immediate final exit');
    await expectOnlyOverlay(page, 'ov-start', 'immediate final exit');
    await page.clock.runFor(1500);
    expect((await decorations(page))['ov-end-confetti']).toEqual({
      confetti: 0, bursts: 0, confettiPresent: 0, burstsPresent: 0,
    });
  });
});

// Contract tests pin the issue #49 slot and discovery seams. Several of them
// intentionally fail on the pre-refactor runtime (fixed ID list, innerHTML
// scorebug, duplicated art).
test.describe('issue 49 overlay contract', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  test('contract: every modal root is marked and a newly marked ninth modal joins the shared controller', async ({ page }) => {
    await page.goto('/football/?boot=offense-call');
    const marking = await page.evaluate(() => ({
      dialogs: Array.from(document.querySelectorAll('.overlay[role="dialog"]'), element => element.id),
      marked: Array.from(document.querySelectorAll('[data-overlay]'), element => ({
        id: element.id,
        name: element.dataset.overlay,
        overlayClass: element.classList.contains('overlay'),
      })),
    }));
    expect(marking.dialogs).toEqual(MARKUP_OVERLAY_IDS);
    expect(marking.marked).toEqual(MARKUP_OVERLAY_IDS.map((id, index) => ({
      id,
      name: ['start', 'time-lab', 'td', 'defense', 'offense', 'quarter', 'halftime', 'end'][index],
      overlayClass: true,
    })));

    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'overlay';
      probe.id = 'ov-probe';
      probe.dataset.overlay = 'probe';
      probe.setAttribute('role', 'dialog');
      probe.setAttribute('aria-modal', 'true');
      probe.setAttribute('aria-labelledby', 'ov-probe-title');
      probe.setAttribute('aria-hidden', 'true');
      probe.inert = true;
      const card = document.createElement('div');
      card.className = 'overlay-card';
      const title = document.createElement('div');
      title.className = 'ov-title';
      title.id = 'ov-probe-title';
      title.textContent = 'Probe Modal';
      const button = document.createElement('button');
      button.className = 'ov-btn';
      button.id = 'ov-probe-btn';
      button.type = 'button';
      button.textContent = 'Probe Action';
      card.append(title, button);
      probe.append(card);
      document.body.append(probe);
    });
    const allIds = [...MARKUP_OVERLAY_IDS, 'ov-probe'];
    const states = shownId => allIds.map(id => ({ id, ariaHidden: String(id !== shownId), inert: id !== shownId }));

    expect(await page.evaluate(() => activateOverlay('ov-probe'))).toBe(true);
    let audit = await overlayAudit(page);
    expect(audit.shown).toEqual(['ov-probe']);
    expect(audit.states).toEqual(states('ov-probe'));
    expect(audit.wrap).toEqual({ inert: true, ariaHidden: 'true' });
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Probe Modal');
    await expectFocusIn(page, 'ov-probe', '#ov-probe-btn', 'ninth modal');
    await page.keyboard.press('Escape');
    await expect(page.locator('#ov-probe')).toHaveClass(/(^|\s)show(\s|$)/);
    await expectFocusIn(page, 'ov-probe', '#ov-probe-btn', 'ninth modal after Escape');

    expect(await page.evaluate(() => activateOverlay('ov-td'))).toBe(true);
    audit = await overlayAudit(page);
    expect(audit.shown).toEqual(['ov-td']);
    expect(audit.states).toEqual(states('ov-td'));

    await page.evaluate(() => hideOverlays());
    audit = await overlayAudit(page);
    expect(audit.shown).toEqual([]);
    expect(audit.states).toEqual(allIds.map(id => ({ id, ariaHidden: 'true', inert: true })));
    expect(audit.wrap).toEqual({ inert: false, ariaHidden: null });
    await expectGameplayFocus(page, '#call-grid .call-btn', 'ninth modal hidden');
  });

  test('contract: unknown or unmarked activation targets change nothing', async ({ page }) => {
    await page.goto('/football/?boot=offense-call');
    await seedDrive(page, periodSeed({
      possession: 'offense', quarter: 2, quarterPossessions: 0, scores: { player: 7, opponent: 0 }, tds: 1,
    }));
    await page.evaluate(() => {
      const unmarked = document.createElement('div');
      unmarked.className = 'overlay';
      unmarked.id = 'ov-unmarked';
      document.body.append(unmarked);
      showTD('offense');
    });
    await expectFocusIn(page, 'ov-td', '#ov-td-btn', 'touchdown before rejection');
    const capture = () => page.evaluate(() => ({
      overlays: Array.from(document.querySelectorAll('.overlay'), overlay => ({
        id: overlay.id,
        show: overlay.classList.contains('show'),
        ariaHidden: overlay.getAttribute('aria-hidden'),
        inert: overlay.inert,
      })),
      wrap: { inert: document.getElementById('wrap').inert, ariaHidden: document.getElementById('wrap').getAttribute('aria-hidden') },
      confetti: document.querySelectorAll('#ov-td-confetti .confetti-piece').length,
      focused: document.activeElement?.id || null,
      render: render_game_to_text(),
    }));
    const before = await capture();
    expect(before.confetti).toBe(40);
    const results = await page.evaluate(() => [
      activateOverlay('ov-missing'),
      activateOverlay('wrap'),
      activateOverlay('ov-unmarked'),
    ]);
    expect(results).toEqual([false, false, false]);
    await page.waitForTimeout(100);
    expect(await capture()).toEqual(before);
  });

  test('contract: slot population writes literal text only and never changes phase, visibility, or focus', async ({ page }) => {
    await page.goto('/football/?boot=offense-call');
    await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
    await expectGameplayFocus(page, '#call-grid .call-btn', 'call phase');
    const result = await page.evaluate(() => {
      const before = render_game_to_text();
      const focused = document.activeElement;
      const quarter = document.getElementById('ov-quarter');
      const returned = populateOverlay(quarter, {
        slots: {
          title: '<b>Bold</b> & <i>tag</i>',
          'scorebug-player': 'A&amp;B <img src="x">',
          'not-a-slot': 'ignored',
        },
        root: {
          classes: { show: true, 'probe-class': true },
          flags: { inert: false, hidden: true, 'data-probe': true },
          dataset: { overlay: 'hijack', probe: 'yes' },
        },
      });
      return {
        returnedSame: returned === quarter,
        title: document.getElementById('ov-quarter-title').textContent,
        player: quarter.querySelector('[data-slot="scorebug-player"]').textContent,
        injectedElements: quarter.querySelectorAll('b, i, img').length,
        textNodes: [document.getElementById('ov-quarter-title'), quarter.querySelector('[data-slot="scorebug-player"]')]
          .map(element => Array.from(element.childNodes, node => node.nodeType)),
        shown: quarter.classList.contains('show'),
        inert: quarter.inert,
        hiddenAttribute: quarter.hasAttribute('hidden'),
        ariaHidden: quarter.getAttribute('aria-hidden'),
        overlayName: quarter.dataset.overlay,
        probeClass: quarter.classList.contains('probe-class'),
        probeFlag: quarter.hasAttribute('data-probe'),
        probeData: quarter.dataset.probe,
        renderUnchanged: render_game_to_text() === before,
        focusUnchanged: document.activeElement === focused,
        shownOverlays: document.querySelectorAll('.overlay.show').length,
        wrapInert: document.getElementById('wrap').inert,
      };
    });
    expect(result).toEqual({
      returnedSame: true,
      title: '<b>Bold</b> & <i>tag</i>',
      player: 'A&amp;B <img src="x">',
      injectedElements: 0,
      textNodes: [[3], [3]],
      shown: false,
      inert: true,
      hiddenAttribute: false,
      ariaHidden: 'true',
      overlayName: 'quarter',
      probeClass: true,
      probeFlag: true,
      probeData: 'yes',
      renderUnchanged: true,
      focusUnchanged: true,
      shownOverlays: 0,
      wrapInert: false,
    });
  });

  test('contract: Final content refresh is separate from activation and never refocuses', async ({ page }) => {
    await page.goto('/football/?boot=offense-call');
    expect((await finishSeededPossession(page, WIN_FINAL_SEED, 'Game complete.')).id).toBe('ov-end');
    await expectFocusIn(page, 'ov-end', '#ov-end-btn', 'final before refresh');
    const audit = await overlayAudit(page);
    await page.evaluate(() => {
      document.activeElement.blur();
      renderEndSeason();
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'footballMathSeason:v1', newValue: null, storageArea: localStorage,
      }));
    });
    await page.waitForTimeout(150);
    expect(await overlayAudit(page)).toEqual(audit);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await expect(page.locator('#ov-end-btn')).toHaveText('Play Again!');
    await expectRender(page, { mode: 'final' }, 'final refresh');
  });

  test('contract: break art has one source and scorebug spans persist across presentations', async ({ page }) => {
    const html = await (await page.request.get('/football/index.html')).text();
    expect(html.match(/class="ov-fieldbg"/g) || []).toHaveLength(1);
    const templateStart = html.indexOf('<template id="ov-fieldbg-template">');
    const templateEnd = html.indexOf('</template>', templateStart);
    const artIndex = html.indexOf('class="ov-fieldbg"');
    expect(templateStart).toBeGreaterThan(-1);
    expect(artIndex > templateStart && artIndex < templateEnd).toBe(true);

    await page.goto('/football/?boot=offense-call');
    expect(await page.evaluate(() => {
      const source = document.getElementById('ov-fieldbg-template').content.firstElementChild;
      const copies = ['ov-quarter', 'ov-halftime']
        .map(id => document.querySelector(`#${id} > .overlay-card`).firstElementChild);
      return {
        distinct: copies[0] !== copies[1],
        sameAsSource: copies.map(copy => copy.outerHTML === source.outerHTML),
        rendered: document.querySelectorAll('svg.ov-fieldbg').length,
        namespaces: copies.map(copy => copy.namespaceURI),
      };
    })).toEqual({ distinct: true, sameAsSource: [true, true], rendered: 2, namespaces: [SVG_NS, SVG_NS] });

    await finishSeededPossession(page, Q1_END_SEED, 'Quarter complete.');
    await page.evaluate(() => {
      window.__issue49Spans = Array.from(document.getElementById('ov-quarter-scorebug').children);
    });
    await tapOverlayAction(page, 'ov-quarter', '.ov-btn', 'Q1 next quarter');
    await finishSeededPossession(page, periodSeed({
      possession: 'defense', quarter: 3, scores: { player: 14, opponent: 10 }, tds: 2, opponentTds: 1,
    }), 'Quarter complete.');
    expect(await page.evaluate(() => {
      const spans = Array.from(document.getElementById('ov-quarter-scorebug').children);
      return {
        persistent: spans.length === window.__issue49Spans.length
          && spans.every((span, index) => span === window.__issue49Spans[index]),
        texts: spans.map(span => span.textContent),
        childNodes: spans.map(span => Array.from(span.childNodes, node => node.nodeType)),
      };
    })).toEqual({
      persistent: true,
      texts: ['DUKE', '14', '–', '10', 'UNC', 'Next: Your ball'],
      childNodes: [[3], [3], [3], [3], [3], [3]],
    });
  });

  test('contract: Start content uses scoped slots through Quick and Season refresh and keeps its structured nodes', async ({ page }) => {
    await page.goto('/football/');
    const inventory = await page.evaluate(() => Array.from(
      document.getElementById('ov-start').querySelectorAll('[data-slot]'),
      element => [element.dataset.slot, element.id],
    ));
    expect(inventory).toEqual([
      ['badge', ''],
      ['title', 'ov-start-title'],
      ['sub', 'ov-start-sub'],
      ['mode-picker', 'play-mode-picker'],
      ['quick-panel', 'quick-game-panel'],
      ['rival-options', 'rival-options'],
      ['rival-matchup', 'rival-preview-matchup'],
      ['rival-style', 'rival-preview-style'],
      ['season-panel', 'season-panel'],
      ['season-progress', 'season-progress'],
      ['season-record', 'season-record'],
      ['season-rungs', 'season-rungs'],
      ['season-next', 'season-next'],
      ['season-status', 'season-status'],
      ['action', 'start-game-btn'],
      ['time-lab-action', 'tl-open-button'],
    ]);

    // Persistent slot and mode-radio nodes; the rival and rung producers
    // rebuild only their own list items inside these containers.
    await page.evaluate(() => {
      window.__issue49StartNodes = Array.from(
        document.getElementById('ov-start').querySelectorAll('[data-slot], input[name="play-mode"]'),
      );
    });
    const startNodesPersist = () => page.evaluate(() => {
      const nodes = Array.from(document.getElementById('ov-start').querySelectorAll('[data-slot], input[name="play-mode"]'));
      return nodes.length === window.__issue49StartNodes.length
        && nodes.every((node, index) => node === window.__issue49StartNodes[index]);
    });
    const startView = () => page.evaluate(() => {
      const start = document.getElementById('ov-start');
      const slot = name => start.querySelector(`[data-slot="${name}"]`);
      return {
        mode: start.querySelector('input[name="play-mode"]:checked')?.value || null,
        quickHidden: slot('quick-panel').hidden,
        seasonHidden: slot('season-panel').hidden,
        action: { text: slot('action').textContent, disabled: slot('action').disabled },
        timeLabDisabled: slot('time-lab-action').disabled,
        matchup: slot('rival-matchup').textContent,
        style: slot('rival-style').textContent,
        progress: slot('season-progress').textContent,
        record: slot('season-record').textContent,
        next: slot('season-next').textContent,
        status: slot('season-status').textContent,
        rivals: Array.from(slot('rival-options').children, label => ({
          rival: label.dataset.rivalId,
          checked: label.querySelector('input[name="rival"]')?.checked ?? null,
          parts: Array.from(label.children, child => child.localName),
        })),
        rungs: Array.from(slot('season-rungs').children, item => ({
          tag: item.localName,
          status: item.dataset.status,
          parts: Array.from(item.children, child => child.className),
        })),
      };
    });
    const rivals = checkedId => ['unc', 'nc-state', 'wake-forest'].map(rival => ({
      rival, checked: rival === checkedId, parts: ['input', 'span'],
    }));
    const rungs = statuses => statuses.map(status => ({
      tag: 'li', status, parts: ['season-rung-number', 'season-rung-copy'],
    }));
    const quickView = {
      mode: 'quick', quickHidden: false, seasonHidden: true,
      action: { text: 'Start Game', disabled: false }, timeLabDisabled: false,
    };

    expect(await startView()).toEqual({
      ...quickView,
      matchup: 'DUKE VS UNC',
      style: 'Balanced attack · ready for any down',
      progress: 'Game 1 of 3',
      record: '0 wins · 0 losses · 0 ties',
      next: 'First up: UNC',
      status: '',
      rivals: rivals('unc'),
      rungs: [],
    });

    // Real taps on the full visible labels. A pointer tap does not promise
    // focus, so focus is established explicitly before the async refresh.
    const modeLabel = value => page.locator('#play-mode-picker label.play-mode-option')
      .filter({ has: page.locator(`input[name="play-mode"][value="${value}"]`) });
    await page.locator('#rival-options label.rival-option[data-rival-id="wake-forest"]').tap();
    await expect(page.getByRole('radio', { name: /WAKE FOREST/i })).toBeChecked();
    expect(await startView()).toMatchObject({
      ...quickView,
      matchup: 'DUKE VS WAKE FOREST',
      style: 'Quick spread · fast throws in space',
      rivals: rivals('wake-forest'),
    });

    await modeLabel('season').tap();
    await expect(page.getByRole('radio', { name: /3-Game Season/ })).toBeChecked();
    expect(await startView()).toMatchObject({
      mode: 'season', quickHidden: true, seasonHidden: false,
      action: { text: 'Start Season', disabled: false }, timeLabDisabled: false,
      progress: 'Game 1 of 3',
      record: '0 wins · 0 losses · 0 ties',
      next: 'Next up: North Carolina',
      status: '',
      rungs: rungs(['next', 'open', 'open']),
    });
    expect(await startNodesPersist()).toBe(true);

    // An async Season update refreshes Start content in place without
    // reopening the modal or moving focus. Focus the persistent checked Season
    // radio first, then capture that exact element.
    const seasonRadio = page.locator('#play-mode-picker input[name="play-mode"][value="season"]');
    await seasonRadio.focus();
    await expect(seasonRadio).toBeFocused();
    const focusedBefore = await page.evaluate(() => {
      window.__issue49StartFocus = document.activeElement;
      return {
        overlay: document.activeElement?.closest('.overlay')?.id || null,
        isSeasonRadio: document.activeElement
          === document.querySelector('#play-mode-picker input[name="play-mode"][value="season"]'),
      };
    });
    expect(focusedBefore).toEqual({ overlay: 'ov-start', isSeasonRadio: true });
    await page.evaluate((key) => {
      const raw = JSON.stringify({
        schemaVersion: 1,
        currentSeason: {
          seasonId: 'issue49-start-season',
          formatId: 'three-rival-schedule-v1',
          playerId: 'duke',
          createdAt: '2026-07-19T12:00:00.000Z',
          schedule: ['unc', 'nc-state', 'wake-forest'],
          results: [{
            gameNumber: 1, gameId: 'issue49-start-game-1', rivalId: 'unc',
            playerScore: 7, opponentScore: 0, completedAt: '2026-07-19T12:30:00.000Z',
          }],
        },
      });
      localStorage.setItem(key, raw);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw, storageArea: localStorage }));
    }, 'footballMathSeason:v1');
    await expect.poll(async () => (await startView()).action.text).toBe('Play Game 2');
    expect(await startView()).toMatchObject({
      mode: 'season', quickHidden: true, seasonHidden: false,
      action: { text: 'Play Game 2', disabled: false },
      progress: 'Game 2 of 3',
      record: '1 win · 0 losses · 0 ties',
      next: 'Next up: NC State',
      status: 'Season progress is saved on this device.',
      rungs: rungs(['win', 'next', 'open']),
    });
    expect(await startNodesPersist()).toBe(true);
    expect(await page.evaluate(() => document.activeElement === window.__issue49StartFocus)).toBe(true);
    await expect(seasonRadio).toBeFocused();
    await expectOnlyOverlay(page, 'ov-start', 'Season refresh');

    await modeLabel('quick').tap();
    await expect(page.getByRole('radio', { name: /Quick Game/ })).toBeChecked();
    expect(await startView()).toMatchObject({
      ...quickView,
      matchup: 'DUKE VS WAKE FOREST',
      style: 'Quick spread · fast throws in space',
      rivals: rivals('wake-forest'),
    });
    expect(await startNodesPersist()).toBe(true);
    await expectRender(page, { mode: 'start', playMode: 'quick' }, 'Start back to Quick');
  });

  test('contract: Final re-renders leave no stale special-result or result-class state', async ({ page }) => {
    await page.goto('/football/?boot=offense-call');
    await seedDrive(page, {
      possession: 'offense', direction: 1, quarter: 4, down: 4, yardsToGo: 2, yardLine: 60,
      firstDownLine: 62, driveStart: 20, scores: { player: 14, opponent: 14 }, plays: 10, drivePlays: 3,
      quarterPossessions: 3, tds: 2, opponentTds: 2, correctAnswers: 5, gradedQuestions: 6,
    });
    await page.locator('#decision-grid .decision-btn[data-action="fieldGoal"]').tap();
    await answer(page, 'correct', 'special final field goal');
    await expect(page.locator('#ov-end')).toHaveClass(/(^|\s)show(\s|$)/, { timeout: 5000 });
    expect((await finalDetails(page)).special).toBe(true);

    for (const [seed, resultClass] of [[LOSS_FINAL_SEED, 'ov-loss'], [WIN_FINAL_SEED, 'ov-win'], [TIE_FINAL_SEED, 'ov-tie']]) {
      expect((await finishSeededPossession(page, seed, 'Game complete.')).id).toBe('ov-end');
      const details = await finalDetails(page);
      expect(details, `${resultClass} re-render`).toMatchObject({
        resultClasses: [resultClass], special: false, resultHidden: true, resultText: '',
      });
      await expect(page.locator('#ov-end')).not.toHaveAttribute('data-special-result');
    }
  });
});
