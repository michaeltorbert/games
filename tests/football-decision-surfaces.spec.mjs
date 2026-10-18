import { writeFile } from 'node:fs/promises';
import { test, expect } from './curriculum-fixture.mjs';

// Issue #51 decision surfaces: the fourth-down (Go / Punt / legal Field Goal)
// and conversion (PAT / Two-Point Try) choices and their one-card retries use
// the approved workspace presentation on every target. Entry states are seeded
// through the existing test seams (seedDriveState, setQuestionFault and the
// production showConversionDecision); they are not played possessions. Every
// choice, retry and resulting transition is a real tap or real key press.
//
// Each state checks the unchanged contract (actions, order, counts, copy,
// casing, ARIA, first focus, the single polite status in the desk) and that
// every card is whole, unclipped, at least 44px, readable and above the fold
// with no page scroll or horizontal overflow. The style checks below pin this
// #51 portion (flat cards, 1px edge, workspace sans labels no larger than the
// question); later #51 call or field work may need to update them deliberately.
// Supplemental screenshots and geometry are written to testInfo.outputPath.

const EPS = 1;
const DECISION = '#decision-grid .decision-btn';
const CALL = '#call-grid .call-btn';
const TOUCH_LANDSCAPE = '(hover: none) and (pointer: coarse) and (min-width: 1024px) and (orientation: landscape)';
const NAVY = { r: 13, g: 31, b: 68 };
const BROWN = { r: 43, g: 26, b: 11 };

// Fourth down at the opponent 40: the legal 57-yard field goal is offered.
const LEGAL_FIELD_GOAL = fourthDown(60);
// Fourth down at midfield: 67 yards is out of range, so Go and Punt only.
const NO_FIELD_GOAL = fourthDown(50);
const PLAYER_TRY = Object.freeze({
  possession: 'offense', direction: 1, quarter: 1, down: 1, yardsToGo: 10,
  yardLine: 20, firstDownLine: 30, driveStart: 20,
});
// Opponent decision table: punt from its own 20, a legal field goal from the
// player's 40, go on fourth and two beyond midfield, and a two-point try when
// it trails by two on its last scheduled Q4 possession.
const OPPONENT_PUNT = opponentFourthDown(80, 10);
const OPPONENT_FIELD_GOAL = opponentFourthDown(40, 2);
const OPPONENT_GO = opponentFourthDown(49, 2);
const OPPONENT_TWO_POINT_TRY = Object.freeze({
  possession: 'defense', direction: -1, quarter: 4, quarterPossessions: 3, down: 1,
  yardsToGo: 10, yardLine: 80, firstDownLine: 70, driveStart: 80,
  scores: { player: 14, opponent: 12 },
});
// Issue #186: only the player's own two-point try uses the three-digit challenge.
const CHALLENGE_FAMILIES = ['two-point-three-digit-add', 'two-point-three-digit-subtract'];
const OLD_CONVERSION_FAMILIES = ['conversion-attempt-value', 'conversion-try-marker'];
const ORDINARY_DEFENSE = Object.freeze({
  possession: 'defense', direction: -1, quarter: 3, down: 2, yardsToGo: 10,
  yardLine: 70, firstDownLine: 60, driveStart: 80,
  scores: { player: 14, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 9, drivePlays: 2,
});

// [eyebrow, label, description] exactly as production renders them.
const CARDS = Object.freeze({
  go: ['Keep the drive alive', 'Go for it', 'Choose from the normal five-play call sheet.'],
  punt: ['Change field position', 'Punt', 'Kick the ball away and pin the opponent back.'],
  fieldGoal: ['57-yard attempt', 'Field Goal', 'Try to score three points.'],
  pat: ['Kick for one', 'PAT', 'A made kick adds one point.'],
  twoPoint: ['Go for two', 'Two-Point Try', 'A successful try adds two points.'],
});

function fourthDown(yardLine) {
  return Object.freeze({
    possession: 'offense', direction: 1, quarter: 1, down: 4, yardsToGo: 10,
    yardLine, firstDownLine: yardLine + 10, driveStart: 20,
  });
}

function opponentFourthDown(yardLine, yardsToGo) {
  return Object.freeze({
    possession: 'defense', direction: -1, quarter: 1, down: 4, yardsToGo,
    yardLine, firstDownLine: yardLine - yardsToGo, driveStart: 80,
  });
}

// Safari's default keyboard policy skips buttons on Tab; Option-Tab is its
// all-controls gesture. Applied to Playwright WebKit on macOS only.
function tabKey(browserName) {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function boot(page) {
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
  });
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.setRootSeed(0x51dec);
  });
}

// seedDriveState and showConversionDecision both call hideOverlays(), whose
// focusGameplayControl() queues the initial gameplay focus for the next
// animation frame. Each entry state is complete once that queued focus has
// run, so keyboard scenarios begin only from settled entry focus: a frame
// callback registered after it runs after it in the same frame.
async function settleFocus(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
}

// The fault is installed first so an opponent action built during the seed
// fails exactly as in the existing recovery coverage.
async function seedDecision(page, seed, fault = null) {
  await page.evaluate(({ value, mode }) => {
    window.__footballTest.setQuestionFault(mode);
    window.__footballTest.seedDriveState(value);
  }, { value: seed, mode: fault });
  await settleFocus(page);
}

async function openConversion(page, seed, fault = null) {
  await page.evaluate(({ value, mode }) => {
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.seedDriveState(value);
    window.__footballTest.setQuestionFault(mode);
    showConversionDecision();
  }, { value: seed, mode: fault });
  await settleFocus(page);
}

async function setFault(page, fault) {
  await page.evaluate(mode => window.__footballTest.setQuestionFault(mode), fault);
}

function contracts(page) {
  return page.evaluate(() => window.__footballTest.activeContracts());
}

function recoverySpec(page) {
  return page.evaluate(() => (state.specialRecoveryPlay ? FOOTBALL_DOMAIN.clone(state.specialRecoveryPlay) : null));
}

function travelOf(recovery) {
  return recovery?.proposal?.requestedTravelYards ?? recovery?.travelYards;
}

async function environment(page, testInfo, browserName) {
  const runtime = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    screen: { width: screen.width, height: screen.height },
    devicePixelRatio: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  return {
    project: testInfo.project.name,
    browserName,
    browserVersion: page.context().browser()?.version() ?? null,
    isMobile: testInfo.project.use.isMobile ?? null,
    hasTouch: testInfo.project.use.hasTouch ?? null,
    ...runtime,
    limitations: 'Playwright engine emulation; not an Apple Simulator or physical-device result.',
  };
}

async function capture(page, testInfo, browserName, name, metrics) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled', caret: 'hide' });
  const file = testInfo.outputPath(`${name}.json`);
  const body = { state: name, environment: await environment(page, testInfo, browserName), metrics };
  await writeFile(file, JSON.stringify(body, null, 2) + '\n');
  await testInfo.attach(`${name}.json`, { path: file, contentType: 'application/json' });
}

function measureDecision(page) {
  return page.evaluate((touchLandscape) => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const shown = element => getComputedStyle(element).display !== 'none' && element.getClientRects().length > 0;
    const promptText = (id) => {
      const element = document.getElementById(id);
      const style = getComputedStyle(element);
      return {
        text: element.textContent,
        shown: shown(element),
        rect: rect(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        color: style.color,
        fontSize: parseFloat(style.fontSize),
      };
    };
    const part = (button, className) => {
      const element = button.querySelector(`.${className}`);
      const style = getComputedStyle(element);
      return {
        text: element.textContent,
        rect: rect(element),
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
        color: style.color,
        fontSize: parseFloat(style.fontSize),
        fontFamily: style.fontFamily,
        textTransform: style.textTransform,
      };
    };
    const desk = document.getElementById('ui-desk');
    const deskStyle = getComputedStyle(desk);
    const grid = document.getElementById('decision-grid');
    const gridStyle = getComputedStyle(grid);
    const feedback = document.getElementById('feedback');
    const buttons = Array.from(grid.querySelectorAll('.decision-btn'), (button) => {
      const style = getComputedStyle(button);
      return {
        action: button.dataset.action,
        type: button.type,
        disabled: button.disabled,
        rect: rect(button),
        clientWidth: button.clientWidth,
        clientHeight: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        opacity: Number(style.opacity),
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat),
        before: getComputedStyle(button, '::before').content,
        after: getComputedStyle(button, '::after').content,
        eyebrow: part(button, 'decision-eyebrow'),
        label: part(button, 'decision-label'),
        desc: part(button, 'decision-desc'),
      };
    });
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      touchLandscape: window.matchMedia(touchLandscape).matches,
      phase: desk.dataset.phase,
      possession: desk.dataset.possession,
      downLabel: downDistanceLabel(state.down, state.ytg),
      desk: {
        rect: rect(desk),
        borderTopWidth: parseFloat(deskStyle.borderTopWidth),
        borderTopStyle: deskStyle.borderTopStyle,
        stops: deskStyle.backgroundImage.match(/rgba?\([^)]+\)/g) || [],
        headShown: shown(document.getElementById('desk-head')),
      },
      field: rect(document.getElementById('field-wrap')),
      grid: {
        hidden: grid.classList.contains('hidden'),
        count: grid.dataset.count,
        possession: grid.dataset.possession,
        role: grid.getAttribute('role'),
        ariaLabel: grid.getAttribute('aria-label'),
        columns: gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
        rect: rect(grid),
      },
      prompt: {
        context: promptText('play-context'),
        label: promptText('play-label'),
        question: promptText('question'),
        feedback: promptText('feedback'),
      },
      feedbackRole: feedback.getAttribute('role'),
      feedbackLive: feedback.getAttribute('aria-live'),
      deskLiveRegions: Array.from(desk.querySelectorAll('[aria-live="polite"]'))
        .filter(element => !element.hidden && element.textContent.trim() && element.getClientRects().length > 0)
        .map(element => element.id),
      focused: document.activeElement?.closest?.('#decision-grid .decision-btn')?.dataset.action ?? null,
      buttons,
    };
  }, TOUCH_LANDSCAPE);
}

function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value || '');
  if (!match) return null;
  const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

function intersects(a, b) {
  return a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;
}

function within(inner, outer) {
  return inner.left >= outer.left - EPS && inner.right <= outer.right + EPS
    && inner.top >= outer.top - EPS && inner.bottom <= outer.bottom + EPS;
}

// expected: { phase, possession, ariaLabel, cards: [[action, eyebrow, label, desc]],
//             playLabel, question, feedback }
function assertDecision(m, expected, label) {
  const actions = expected.cards.map(([action]) => action);
  const phone = m.innerWidth <= 760;

  // Unchanged contract.
  expect(m.phase, `${label}: phase`).toBe(expected.phase);
  expect(m.possession, `${label}: desk possession`).toBe(expected.possession);
  expect(m.grid.hidden, `${label}: decision grid shown`).toBe(false);
  expect(m.grid.role, `${label}: grid role`).toBe('group');
  expect(m.grid.ariaLabel, `${label}: grid name`).toBe(expected.ariaLabel);
  expect(m.grid.count, `${label}: data-count`).toBe(String(actions.length));
  expect(m.grid.possession, `${label}: grid possession`).toBe(expected.possession);
  expect(m.buttons.map(button => button.action), `${label}: actions and order`).toEqual(actions);
  expect(m.focused, `${label}: first choice focused`).toBe(actions[0]);
  expect(m.feedbackRole, `${label}: feedback role`).toBe('status');
  expect(m.feedbackLive, `${label}: feedback live`).toBe('polite');
  expect(m.deskLiveRegions, `${label}: feedback is the desk's only active polite region`).toEqual(['feedback']);

  // Complete existing copy, still shown.
  expect(m.prompt.label.text, `${label}: play label`).toBe(expected.playLabel);
  expect(m.prompt.question.text, `${label}: question`).toBe(expected.question);
  expect(m.prompt.feedback.text, `${label}: feedback`).toBe(expected.feedback);
  expect(m.prompt.context.text.trim().length, `${label}: play facts`).toBeGreaterThan(0);

  // Page fit.
  expect(m.scrollY, `${label}: no automatic scroll`).toBe(0);
  expect(m.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(m.innerWidth + EPS);
  // Touch landscape tablets use the call phase's compact desk placement.
  if (m.touchLandscape) {
    expect(m.desk.headShown, `${label}: duplicate desk header hidden`).toBe(false);
    expect(m.desk.rect.top, `${label}: desk clears the field`).toBeGreaterThanOrEqual(m.field.bottom - EPS);
  }

  // Desk: workspace rule, readable prompt text against every surface stop.
  expect(m.desk.borderTopWidth, `${label}: desk top rule`).toBe(3);
  expect(m.desk.borderTopStyle, `${label}: desk top rule style`).toBe('solid');
  const stops = m.desk.stops.map(parseColor);
  expect(stops.length, `${label}: desk surface colours`).toBeGreaterThan(0);
  for (const [name, item] of Object.entries(m.prompt)) {
    if (!item.shown) continue;
    const at = `${label}: #${name}`;
    expect(item.rect.left, `${at} left`).toBeGreaterThanOrEqual(m.desk.rect.left - EPS);
    expect(item.rect.right, `${at} right`).toBeLessThanOrEqual(m.desk.rect.right + EPS);
    expect(item.rect.bottom, `${at} inside the desk`).toBeLessThanOrEqual(m.desk.rect.bottom + EPS);
    expect(item.rect.bottom, `${at} above the fold`).toBeLessThanOrEqual(m.innerHeight + EPS);
    expect(item.scrollWidth, `${at} not clipped`).toBeLessThanOrEqual(item.clientWidth + 1);
    for (const stop of stops) {
      expect(contrast(parseColor(item.color), stop), `${at} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(m.prompt.question.shown && m.prompt.feedback.shown, `${label}: question and explanation shown`).toBe(true);
  expect(m.prompt.question.fontSize, `${label}: readable question`).toBeGreaterThanOrEqual(17);

  // Arrangement kept: one column per choice on tablets; two on phones with a
  // third choice across the row; one for a retry.
  const columns = actions.length === 1 ? 1 : phone ? 2 : actions.length;
  expect(m.grid.columns, `${label}: grid columns`).toBe(columns);
  if (phone && actions.length === 3) {
    expect(Math.abs(m.buttons[2].rect.width - m.grid.rect.width), `${label}: third choice spans the row`).toBeLessThanOrEqual(EPS);
  }

  const surface = expected.possession === 'defense' ? BROWN : NAVY;
  m.buttons.forEach((button, index) => {
    const [, eyebrow, name, desc] = expected.cards[index];
    const at = `${label}: ${button.action}`;
    expect(button.type, `${at} type`).toBe('button');
    expect(button.disabled, `${at} enabled`).toBe(false);
    expect(button.eyebrow.text, `${at} eyebrow`).toBe(eyebrow);
    expect(button.label.text, `${at} label`).toBe(name);
    expect(button.desc.text, `${at} description`).toBe(desc);
    expect(button.eyebrow.textTransform, `${at} eyebrow casing`).toBe('uppercase');
    expect(button.label.textTransform, `${at} label casing`).toBe('uppercase');
    expect(button.desc.textTransform, `${at} description casing`).toBe('none');

    expect(button.rect.width, `${at} width`).toBeGreaterThanOrEqual(44);
    expect(button.rect.height, `${at} height`).toBeGreaterThanOrEqual(44);
    expect(button.rect.left, `${at} left`).toBeGreaterThanOrEqual(-EPS);
    expect(button.rect.right, `${at} right`).toBeLessThanOrEqual(m.innerWidth + EPS);
    expect(button.rect.top, `${at} top`).toBeGreaterThanOrEqual(-EPS);
    expect(button.rect.bottom, `${at} above the fold`).toBeLessThanOrEqual(m.innerHeight + EPS);
    expect(within(button.rect, m.desk.rect), `${at} inside the desk`).toBe(true);
    expect(button.scrollWidth, `${at} not clipped horizontally`).toBeLessThanOrEqual(button.clientWidth + 1);
    expect(button.scrollHeight, `${at} not clipped vertically`).toBeLessThanOrEqual(button.clientHeight + 1);

    // Flat card with a quiet uniform edge.
    const background = parseColor(button.background);
    expect(background, `${at} card surface`).toEqual({ ...surface, a: 1 });
    expect(button.backgroundImage, `${at} no gradient`).toBe('none');
    expect(button.opacity, `${at} opaque`).toBe(1);
    expect(['none', 'normal'], `${at} no strip`).toContain(button.before);
    expect(['none', 'normal'], `${at} no sheen`).toContain(button.after);
    expect(new Set(button.borders).size, `${at} uniform edge`).toBe(1);
    expect(button.borders[0], `${at} quiet edge`).toBeLessThanOrEqual(1);

    for (const key of ['eyebrow', 'label', 'desc']) {
      const item = button[key];
      expect(item.scrollWidth, `${at} ${key} not clipped horizontally`).toBeLessThanOrEqual(item.clientWidth + 1);
      expect(item.scrollHeight, `${at} ${key} not clipped vertically`).toBeLessThanOrEqual(item.clientHeight + 1);
      expect(within(item.rect, button.rect), `${at} ${key} inside its card`).toBe(true);
      expect(contrast(parseColor(item.color), background), `${at} ${key} contrast`).toBeGreaterThanOrEqual(4.5);
    }
    expect(button.eyebrow.fontSize, `${at} eyebrow size`).toBeGreaterThanOrEqual(12);
    expect(button.desc.fontSize, `${at} description size`).toBeGreaterThanOrEqual(12);
    expect(button.label.fontSize, `${at} label no larger than the question`).toBeLessThanOrEqual(m.prompt.question.fontSize);
    expect(button.label.fontFamily, `${at} workspace label type`).not.toMatch(/bebas/i);
  });
  for (let i = 0; i < m.buttons.length; i++) {
    for (let j = i + 1; j < m.buttons.length; j++) {
      expect(intersects(m.buttons[i].rect, m.buttons[j].rect), `${label}: ${m.buttons[i].action} and ${m.buttons[j].action} do not overlap`).toBe(false);
    }
  }
}

// A tapped or activated special action leaves the decision and presents the
// question built from that same frozen play.
async function expectSpecialQuestion(page, label, { playType, attemptType = null } = {}) {
  await expect(page.locator('#ui-desk'), `${label}: question phase`).toHaveAttribute('data-phase', 'question');
  await expect(page.locator('#decision-grid'), `${label}: decision closed`).toBeHidden();
  const now = await contracts(page);
  expect(now.render.mode, `${label}: mode`).toBe('question');
  expect(now.activePlay?.playType, `${label}: play type`).toBe(playType);
  if (attemptType) expect(now.activePlay.context.attemptType, `${label}: attempt`).toBe(attemptType);
  expect(now.questionInstance, `${label}: question built`).toBeTruthy();
  expect(now.questionInstance.contextId, `${label}: question bound to the play`).toBe(now.activePlay.contextId);
  return now;
}

async function expectCallGrid(page, label, count, possession) {
  await expect(page.locator('#ui-desk'), `${label}: call phase`).toHaveAttribute('data-phase', 'call');
  await expect(page.locator('#ui-desk'), `${label}: possession`).toHaveAttribute('data-possession', possession);
  await expect(page.locator('#decision-grid'), `${label}: decision closed`).toBeHidden();
  await expect(page.locator(CALL), `${label}: call count`).toHaveCount(count);
  await expect(page.locator('#call-grid'), `${label}: call data-count`).toHaveAttribute('data-count', String(count));
  for (let index = 0; index < count; index++) {
    await expect(page.locator(CALL).nth(index), `${label}: call ${index + 1} visible`).toBeVisible();
  }
  expect((await contracts(page)).render.mode, `${label}: mode`).toBe('call');
  expect(await page.evaluate(() => window.__footballTest.decisionActions()), `${label}: no decision cards`).toEqual([]);
}

test.describe('football decision surfaces (#51)', () => {
  test('legal fourth down offers Go, Punt and Field Goal; Go reopens five calls and Field Goal its question', async ({ page, browserName }, testInfo) => {
    const errors = watchErrors(page);
    await boot(page);
    const expected = {
      phase: 'fourth-down-decision',
      possession: 'offense',
      ariaLabel: 'Choose a fourth-down action',
      cards: [['go', ...CARDS.go], ['punt', ...CARDS.punt], ['fieldGoal', ...CARDS.fieldGoal]],
      question: 'Make the fourth-down decision.',
      feedback: 'Choose go, punt, or the legal 57-yard field goal.',
    };

    await seedDecision(page, LEGAL_FIELD_GOAL);
    let metrics = await measureDecision(page);
    assertDecision(metrics, { ...expected, playLabel: metrics.downLabel }, 'legal fourth down');
    await capture(page, testInfo, browserName, 'fourth-down-legal', metrics);

    await page.locator(`${DECISION}[data-action="go"]`).tap();
    await expectCallGrid(page, 'after Go', 5, 'offense');

    await seedDecision(page, LEGAL_FIELD_GOAL);
    metrics = await measureDecision(page);
    assertDecision(metrics, { ...expected, playLabel: metrics.downLabel }, 'legal fourth down again');
    await page.locator(`${DECISION}[data-action="fieldGoal"]`).tap();
    const kick = await expectSpecialQuestion(page, 'after Field Goal', { playType: 'fieldGoal' });
    expect(kick.activePlay.context.attemptDistance).toBe(57);
    expect(errors).toEqual([]);
  });

  test('out-of-range fourth down offers only Go and Punt; Punt opens its question', async ({ page, browserName }, testInfo) => {
    const errors = watchErrors(page);
    await boot(page);
    await seedDecision(page, NO_FIELD_GOAL);
    const metrics = await measureDecision(page);
    assertDecision(metrics, {
      phase: 'fourth-down-decision',
      possession: 'offense',
      ariaLabel: 'Choose a fourth-down action',
      cards: [['go', ...CARDS.go], ['punt', ...CARDS.punt]],
      playLabel: metrics.downLabel,
      question: 'Make the fourth-down decision.',
      feedback: 'Choose go or punt.',
    }, 'go-or-punt fourth down');
    const decisionText = await page.evaluate(() => ['question', 'feedback', 'decision-grid']
      .map(id => document.getElementById(id).textContent).join(' '));
    expect(decisionText, 'no field goal is offered or described').not.toMatch(/field goal/i);
    await capture(page, testInfo, browserName, 'fourth-down-go-punt', metrics);

    await page.locator(`${DECISION}[data-action="punt"]`).tap();
    await expectSpecialQuestion(page, 'after Punt', { playType: 'punt' });
    expect(errors).toEqual([]);
  });

  test('conversion offers PAT and Two-Point Try; each opens its own try', async ({ page, browserName }, testInfo) => {
    const errors = watchErrors(page);
    await boot(page);
    const expected = {
      phase: 'conversion-decision',
      possession: 'offense',
      ariaLabel: 'Choose a conversion attempt',
      cards: [['pat', ...CARDS.pat], ['twoPoint', ...CARDS.twoPoint]],
      playLabel: 'Conversion Try',
      question: 'Choose one point or two points.',
      feedback: 'The touchdown awarded six points. The conversion is a separate play.',
    };
    for (const action of ['twoPoint', 'pat']) {
      await openConversion(page, PLAYER_TRY);
      const metrics = await measureDecision(page);
      assertDecision(metrics, expected, `conversion before ${action}`);
      if (action === 'twoPoint') await capture(page, testInfo, browserName, 'conversion', metrics);
      await page.locator(`${DECISION}[data-action="${action}"]`).tap();
      const opened = await expectSpecialQuestion(page, `after ${action}`, { playType: 'conversion', attemptType: action });
      expect(action === 'twoPoint' ? CHALLENGE_FAMILIES : OLD_CONVERSION_FAMILIES, `${action}: question family`)
        .toContain(opened.questionInstance.familyId);
    }
    expect(errors).toEqual([]);
  });

  test('player retries keep one frozen action and a tap recovers the same action', async ({ page, browserName }, testInfo) => {
    const errors = watchErrors(page);
    await boot(page);

    // Punt: the frozen travel draw is shown and reused.
    await seedDecision(page, NO_FIELD_GOAL);
    await setFault(page, 'invalid-context');
    await page.locator(`${DECISION}[data-action="punt"]`).tap();
    const punt = await recoverySpec(page);
    const travel = travelOf(punt);
    expect(punt).toMatchObject({ playType: 'punt' });
    expect(Number.isInteger(travel)).toBe(true);
    let metrics = await measureDecision(page);
    assertDecision(metrics, {
      phase: 'fourth-down-decision',
      possession: 'offense',
      ariaLabel: 'Retry the same fourth-down action',
      cards: [['punt', 'Same action', 'Retry Punt', `The preserved ${travel}-yard punt draw is waiting.`]],
      playLabel: metrics.downLabel,
      question: `Retry the preserved ${travel}-yard punt.`,
      feedback: `Retry the preserved ${travel}-yard punt.`,
    }, 'punt retry');
    await capture(page, testInfo, browserName, 'retry-player-punt', metrics);
    await setFault(page, null);
    await page.locator(`${DECISION}[data-action="punt"]`).tap();
    const puntPlay = await expectSpecialQuestion(page, 'punt recovered', { playType: 'punt' });
    expect(puntPlay.activePlay.proposal.requestedTravelYards).toBe(travel);

    // Field goal.
    await seedDecision(page, LEGAL_FIELD_GOAL);
    await setFault(page, 'invalid-context');
    await page.locator(`${DECISION}[data-action="fieldGoal"]`).tap();
    expect(await recoverySpec(page)).toMatchObject({ playType: 'fieldGoal' });
    metrics = await measureDecision(page);
    assertDecision(metrics, {
      phase: 'fourth-down-decision',
      possession: 'offense',
      ariaLabel: 'Retry the same fourth-down action',
      cards: [['fieldGoal', 'Same action', 'Retry Field Goal', 'The same field-goal try is waiting.']],
      playLabel: metrics.downLabel,
      question: 'Retry the same field-goal try.',
      feedback: 'Retry the same field-goal try.',
    }, 'field-goal retry');
    await capture(page, testInfo, browserName, 'retry-player-field-goal', metrics);
    await setFault(page, null);
    await page.locator(`${DECISION}[data-action="fieldGoal"]`).tap();
    const kick = await expectSpecialQuestion(page, 'field goal recovered', { playType: 'fieldGoal' });
    expect(kick.activePlay.context.attemptDistance).toBe(57);

    // PAT and two-point try.
    for (const [action, label, name] of [['pat', 'Retry PAT', 'PAT'], ['twoPoint', 'Retry Two-Point Try', 'two-point try']]) {
      await openConversion(page, PLAYER_TRY, 'invalid-context');
      await page.locator(`${DECISION}[data-action="${action}"]`).tap();
      expect(await recoverySpec(page)).toMatchObject({ playType: 'conversion', attemptType: action });
      metrics = await measureDecision(page);
      assertDecision(metrics, {
        phase: 'conversion-decision',
        possession: 'offense',
        ariaLabel: 'Retry the same conversion attempt',
        cards: [[action, 'Same try', label, 'The same conversion choice is waiting.']],
        playLabel: 'Conversion Try',
        question: `Retry the same ${name}.`,
        feedback: 'That try could not be checked. Try the same conversion again.',
      }, `${action} retry`);
      await capture(page, testInfo, browserName, `retry-player-${action}`, metrics);
      await setFault(page, null);
      await page.locator(`${DECISION}[data-action="${action}"]`).tap();
      await expectSpecialQuestion(page, `${action} recovered`, { playType: 'conversion', attemptType: action });
    }
    expect(errors).toEqual([]);
  });

  test('opponent retries keep the announced action and its frozen play', async ({ page, browserName }, testInfo) => {
    const errors = watchErrors(page);
    await boot(page);

    const fourthDownCases = [
      ['punt', OPPONENT_PUNT],
      ['fieldGoal', OPPONENT_FIELD_GOAL],
    ];
    for (const [action, seed] of fourthDownCases) {
      await seedDecision(page, seed, 'invalid-projection');
      const recovery = await recoverySpec(page);
      expect(recovery, `${action}: frozen opponent play`).toMatchObject({ playType: action });
      const travel = travelOf(recovery);
      const copy = action === 'punt'
        ? `Retry the preserved ${travel}-yard punt.`
        : 'Retry the same field-goal try.';
      const metrics = await measureDecision(page);
      assertDecision(metrics, {
        phase: 'fourth-down-decision',
        possession: 'defense',
        ariaLabel: 'Retry the same opponent action',
        cards: [[action, 'Same action', action === 'punt' ? 'Retry Punt' : 'Retry Field Goal', action === 'punt'
          ? `The opponent's preserved ${travel}-yard punt draw is waiting.`
          : "The opponent's same field-goal try is waiting."]],
        playLabel: action === 'punt' ? 'Punt' : 'Field Goal',
        question: copy,
        feedback: `That play could not be checked. ${copy}`,
      }, `opponent ${action} retry`);
      await capture(page, testInfo, browserName, `retry-opponent-${action}`, metrics);
      await setFault(page, null);
      await page.locator(`${DECISION}[data-action="${action}"]`).tap();
      const retried = await expectSpecialQuestion(page, `opponent ${action} recovered`, { playType: action });
      expect(retried.activePlay.playId, `opponent ${action}: same frozen play`).toBe(recovery.playId);
      if (action === 'punt') expect(retried.activePlay.proposal.requestedTravelYards).toBe(travel);
    }

    await openConversion(page, OPPONENT_TWO_POINT_TRY, 'invalid-projection');
    const conversion = await recoverySpec(page);
    expect(conversion).toMatchObject({ playType: 'conversion' });
    expect(conversion.context.attemptType, 'opponent two-point decision').toBe('twoPoint');
    const metrics = await measureDecision(page);
    assertDecision(metrics, {
      phase: 'conversion-decision',
      possession: 'defense',
      ariaLabel: 'Retry the same opponent conversion',
      cards: [['twoPoint', 'Same try', 'Retry Two-Point Try', "The opponent's conversion choice stays the same."]],
      playLabel: 'Conversion Try',
      question: 'Retry the same opponent two-point try.',
      feedback: 'That try could not be checked. The same opponent conversion is waiting.',
    }, 'opponent two-point retry');
    await capture(page, testInfo, browserName, 'retry-opponent-two-point', metrics);
    await setFault(page, null);
    await page.locator(`${DECISION}[data-action="twoPoint"]`).tap();
    const retried = await expectSpecialQuestion(page, 'opponent two-point recovered', { playType: 'conversion', attemptType: 'twoPoint' });
    expect(retried.activePlay.playId).toBe(conversion.playId);
    expect(OLD_CONVERSION_FAMILIES, 'opponent two-point keeps its conversion families').toContain(retried.questionInstance.familyId);
    expect(errors).toEqual([]);
  });

  test('opponent Go and ordinary defense keep exactly four calls', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    await seedDecision(page, OPPONENT_GO);
    await expectCallGrid(page, 'opponent Go', 4, 'defense');

    await seedDecision(page, ORDINARY_DEFENSE);
    await expectCallGrid(page, 'ordinary defense', 4, 'defense');
    await page.locator(CALL).first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    expect((await contracts(page)).activePlay?.playType).toBe('scrimmage');
    expect(errors).toEqual([]);
  });

  test('keyboard: visible focus moves between choices and Enter or Space activates', async ({ page, browserName }, testInfo) => {
    const errors = watchErrors(page);
    await boot(page);
    const focusFacts = selector => page.locator(selector).evaluate(async (button) => {
      await Promise.all(button.getAnimations().map(animation => animation.finished.catch(() => null)));
      const style = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      const desk = document.getElementById('ui-desk').getBoundingClientRect();
      const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      return {
        focusVisible: button.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth),
        transform: style.transform,
        ringInsideDesk: box.left - ring >= desk.left - 1 && box.right + ring <= desk.right + 1
          && box.top - ring >= desk.top - 1 && box.bottom + ring <= desk.bottom + 1,
        ringAboveFold: box.bottom + ring <= window.innerHeight + 1,
      };
    });

    await seedDecision(page, LEGAL_FIELD_GOAL);
    await expect(page.locator(`${DECISION}[data-action="go"]`)).toBeFocused();

    // On a coarse pointer, hovering an unfocused card never lifts it.
    const coarse = await page.evaluate(() => window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    if (coarse) {
      const hoverTarget = `${DECISION}[data-action="fieldGoal"]`;
      await page.locator(hoverTarget).hover();
      expect((await focusFacts(hoverTarget)).transform, 'no hover lift on a coarse pointer').toBe('none');
      await page.mouse.move(0, 0);
    }
    await testInfo.attach('pointer-media.json', {
      body: JSON.stringify({ coarseNoHover: coarse }),
      contentType: 'application/json',
    });

    await page.keyboard.press(tabKey(browserName));
    await expect(page.locator(`${DECISION}[data-action="punt"]`)).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    const fieldGoal = `${DECISION}[data-action="fieldGoal"]`;
    await expect(page.locator(fieldGoal)).toBeFocused();
    const ring = await focusFacts(fieldGoal);
    expect(ring.focusVisible, 'keyboard focus is visible').toBe(true);
    expect(ring.outlineStyle).toBe('solid');
    expect(ring.outlineWidth).toBeGreaterThanOrEqual(3);
    expect(ring.ringInsideDesk, 'focus ring is not clipped by the desk').toBe(true);
    expect(ring.ringAboveFold, 'focus ring above the fold').toBe(true);
    await capture(page, testInfo, browserName, 'keyboard-focus-field-goal', { ring, decision: await measureDecision(page) });
    await page.keyboard.press('Enter');
    await expectSpecialQuestion(page, 'Enter on Field Goal', { playType: 'fieldGoal' });
    await expect(page.locator('#btn-row .ans-btn:not(.hidden):not(:disabled)').first(), 'focus moves to the first answer').toBeFocused();

    await openConversion(page, PLAYER_TRY);
    await expect(page.locator(`${DECISION}[data-action="pat"]`)).toBeFocused();
    await page.keyboard.press(tabKey(browserName));
    await expect(page.locator(`${DECISION}[data-action="twoPoint"]`)).toBeFocused();
    await page.keyboard.press('Space');
    const challenge = await expectSpecialQuestion(page, 'Space on Two-Point Try', { playType: 'conversion', attemptType: 'twoPoint' });
    await expect(page.locator('#btn-row .ans-btn:not(.hidden):not(:disabled)').first()).toBeFocused();
    expect(CHALLENGE_FAMILIES).toContain(challenge.questionInstance.familyId);
    await expect(page.locator('#math-overlay')).toHaveAttribute('data-type', 'column-arithmetic');

    // Reduced motion: keyboard focus stays visible without lifting the card.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedDecision(page, NO_FIELD_GOAL);
    await page.keyboard.press(tabKey(browserName));
    const punt = `${DECISION}[data-action="punt"]`;
    await expect(page.locator(punt)).toBeFocused();
    const still = await focusFacts(punt);
    expect(still.focusVisible).toBe(true);
    expect(still.outlineWidth).toBeGreaterThanOrEqual(3);
    expect(still.transform, 'no focus lift with reduced motion').toBe('none');
    expect(errors).toEqual([]);
  });
});
