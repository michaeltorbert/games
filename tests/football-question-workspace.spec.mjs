import { test, expect } from './curriculum-fixture.mjs';

// Issue #51 question workspace: real production questions of every choice
// family (numbers, a three-choice comparison, four text labels, long
// field-position labels, and a defense question) reached by real taps. These
// check what the new presentation must guarantee on every target: whole,
// unclipped, non-overlapping 44px answers above the fold, a primary question,
// readable contrast, unchanged retry and review semantics, and a Coach Replay
// that flows in the document with clear actions.

const EPS = 1;

const OFFENSE_SEED = Object.freeze({
  possession: 'offense', direction: 1, quarter: 2, down: 2, yardsToGo: 7,
  yardLine: 30, firstDownLine: 37, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 4, drivePlays: 2,
});

// Fourth down at the own 30: Go and Punt only. The constant 0.2 football draw
// gives a 38-yard punt that lands short of the end zone.
const PUNT_SEED = Object.freeze({
  rivalId: 'wake-forest',
  possession: 'offense', direction: 1, quarter: 2, down: 4, yardsToGo: 10,
  yardLine: 30, firstDownLine: 40, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 4, drivePlays: 3,
});

const DEFENSE_SEED = Object.freeze({
  possession: 'defense', direction: -1, quarter: 3, down: 2, yardsToGo: 10,
  yardLine: 70, firstDownLine: 60, driveStart: 80,
  scores: { player: 14, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 9, drivePlays: 2,
});

const CALL = '#call-grid .call-btn';
const PUNT = '#decision-grid .decision-btn[data-action="punt"]';

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
    // Seed first: the drive owns the call or decision prompt the trigger taps.
    window.__wsPrepare = ({ seed, draw }) => {
      window.__footballTest.seedDriveState(seed);
      window.__footballTest.resetLearning();
      window.__footballTest.setRngStreams({ football: () => 0.2, scheduler: () => draw, presentation: () => 0.4 });
    };
  });
}

// Finds the ordinary scheduler draw that presents familyId through the given
// trigger, then presents it again through a real tap on that trigger.
async function presentFamily(page, { seed, trigger, familyId }) {
  const draw = await page.evaluate(({ seed, trigger, familyId }) => {
    for (let index = 0; index < 600; index++) {
      const draw = (index + 0.5) / 600;
      window.__wsPrepare({ seed, draw });
      const control = document.querySelector(trigger);
      if (!control) continue;
      control.click();
      if (window.__footballTest.activeContracts().questionInstance?.familyId === familyId) return draw;
    }
    return null;
  }, { seed, trigger, familyId });
  expect(draw, `${familyId} is reachable through the ordinary scheduler`).not.toBeNull();
  await page.evaluate(options => window.__wsPrepare(options), { seed, draw });
  await page.locator(trigger).first().tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const question = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance);
  expect(question.familyId).toBe(familyId);
  return question;
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

async function workspaceMetrics(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const fontSize = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const buttons = [0, 1, 2, 3].map((index) => {
      const button = document.getElementById(`b${index}`);
      const style = getComputedStyle(button);
      return {
        id: button.id,
        shown: !button.classList.contains('hidden') && style.display !== 'none',
        hiddenClass: button.classList.contains('hidden'),
        disabled: button.disabled,
        wrong: button.classList.contains('wrong'),
        correct: button.classList.contains('correct'),
        text: button.textContent,
        choiceId: button.dataset.choiceId || null,
        rect: rect(button),
        clientWidth: button.clientWidth,
        clientHeight: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
        color: style.color,
        background: style.backgroundColor,
        opacity: Number(style.opacity),
      };
    });
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      questionSize: fontSize('#question'),
      labelSize: fontSize('#play-label'),
      contextSize: fontSize('#play-context'),
      questionRect: rect(document.getElementById('question')),
      buttons,
      focusedId: document.activeElement?.id || null,
    };
  });
}

function intersects(a, b) {
  return a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;
}

function assertWorkspace(metrics, question, label) {
  const shown = metrics.buttons.filter(button => button.shown);
  expect(shown.map(button => button.choiceId), `${label}: one visible answer per real choice, in order`)
    .toEqual(question.choices.map(choice => choice.id));
  for (const button of metrics.buttons.slice(question.choices.length)) {
    expect(button.hiddenClass && button.disabled, `${label}: unused ${button.id} stays hidden and disabled`).toBe(true);
  }
  expect(metrics.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + EPS);
  expect(metrics.scrollY, `${label}: no automatic scroll`).toBe(0);
  expect(metrics.questionRect.height, `${label}: question rendered`).toBeGreaterThan(0);
  expect(metrics.questionRect.right, `${label}: question inside viewport`).toBeLessThanOrEqual(metrics.innerWidth + EPS);
  for (const button of shown) {
    const at = `${label}: ${button.id} "${button.text}"`;
    expect(button.rect.width, `${at} width`).toBeGreaterThanOrEqual(44);
    expect(button.rect.height, `${at} height`).toBeGreaterThanOrEqual(44);
    expect(button.rect.left, `${at} left`).toBeGreaterThanOrEqual(-EPS);
    expect(button.rect.right, `${at} right`).toBeLessThanOrEqual(metrics.innerWidth + EPS);
    expect(button.rect.top, `${at} top`).toBeGreaterThanOrEqual(-EPS);
    expect(button.rect.bottom, `${at} above the fold`).toBeLessThanOrEqual(metrics.innerHeight + EPS);
    expect(button.scrollWidth, `${at} label not clipped horizontally`).toBeLessThanOrEqual(button.clientWidth + 1);
    expect(button.scrollHeight, `${at} label not clipped vertically`).toBeLessThanOrEqual(button.clientHeight + 1);
    expect(button.text.trim(), `${at} shows its real label`).toBe(question.choices[Number(button.id.slice(1))].label);
    if (!button.disabled || button.wrong || button.correct) {
      const fg = parseColor(button.color);
      const bg = parseColor(button.background);
      expect(button.opacity, `${at} opaque`).toBe(1);
      expect(bg?.a, `${at} solid background`).toBe(1);
      expect(contrast(fg, bg), `${at} label contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      expect(intersects(shown[i].rect, shown[j].rect), `${label}: ${shown[i].id} and ${shown[j].id} do not overlap`).toBe(false);
    }
  }
  expect(metrics.questionSize, `${label}: readable question`).toBeGreaterThanOrEqual(17);
  expect(metrics.questionSize, `${label}: question larger than the play label`).toBeGreaterThan(metrics.labelSize);
  expect(metrics.questionSize, `${label}: question larger than the play facts`).toBeGreaterThan(metrics.contextSize);
}

async function expectStatus(page, text) {
  const feedback = page.locator('#feedback');
  await expect(feedback).toHaveAttribute('role', 'status');
  await expect(feedback).toHaveAttribute('aria-live', 'polite');
  await expect(feedback).toContainText(text);
}

function rectsMatch(before, after, label) {
  before.filter(button => button.shown).forEach((button, index) => {
    const now = after.filter(item => item.shown)[index];
    expect(Math.abs(now.rect.width - button.rect.width), `${label}: ${button.id} width kept`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(now.rect.height - button.rect.height), `${label}: ${button.id} height kept`).toBeLessThanOrEqual(0.5);
  });
}

async function tapChoice(page, choiceId) {
  await page.locator(`#btn-row .ans-btn[data-choice-id="${choiceId}"]`).tap();
}

// One coached retry, then a correct retry that commits and shows feedback.
async function retryThenCorrect(page, question, label) {
  const initial = await workspaceMetrics(page);
  assertWorkspace(initial, question, `${label} question`);
  const wrongId = question.choices.find(choice => choice.id !== question.correctChoiceId).id;
  await tapChoice(page, wrongId);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await expectStatus(page, `Good try. ${question.hint.text}`);
  const retry = await workspaceMetrics(page);
  assertWorkspace(retry, question, `${label} retry`);
  rectsMatch(initial.buttons, retry.buttons, `${label} retry`);
  const missed = retry.buttons.find(button => button.choiceId === wrongId);
  expect(missed.wrong && missed.disabled, `${label}: missed answer marked and locked`).toBe(true);
  const firstEnabled = retry.buttons.find(button => button.shown && !button.disabled);
  expect(retry.focusedId, `${label}: focus moves to the first enabled answer`).toBe(firstEnabled.id);

  await tapChoice(page, question.correctChoiceId);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await page.evaluate(() => clearTimeout(advTimer));
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
  const feedback = await workspaceMetrics(page);
  assertWorkspace(feedback, question, `${label} feedback`);
  const correct = feedback.buttons.find(button => button.choiceId === question.correctChoiceId);
  expect(correct.correct, `${label}: chosen answer marked correct`).toBe(true);
  await expect(page.locator('#feedback')).toBeVisible();
  await expect(page.locator('#feedback')).not.toBeEmpty();
}

test.describe('football question workspace (#51)', () => {
  test('number choices: retry, correct and feedback fit with readable answers', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: OFFENSE_SEED, trigger: CALL, familyId: 'line-to-gain-missing-part' });
    expect(question.choices.every(choice => typeof choice.value === 'number')).toBe(true);
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'number');
    await retryThenCorrect(page, question, 'number');
    expect(errors).toEqual([]);
  });

  test('three-choice comparison with a long prompt keeps one coached retry', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: OFFENSE_SEED, trigger: CALL, familyId: 'gain-vs-needed-comparison' });
    expect(question.choices).toHaveLength(3);
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'text');
    await retryThenCorrect(page, question, 'comparison');
    expect(errors).toEqual([]);
  });

  test('long field-position labels on a punt stay whole and tappable', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: PUNT_SEED, trigger: PUNT, familyId: 'punt-landing-spot' });
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'yard');
    await retryThenCorrect(page, question, 'punt landing');
    expect(errors).toEqual([]);
  });

  test('defense question uses the same workspace and commits a stop', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    await page.evaluate((seed) => window.__footballTest.seedDriveState(seed), DEFENSE_SEED);
    await page.locator(CALL).first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-possession', 'defense');
    const question = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance);
    assertWorkspace(await workspaceMetrics(page), question, 'defense question');
    await tapChoice(page, question.correctChoiceId);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await page.evaluate(() => clearTimeout(advTimer));
    assertWorkspace(await workspaceMetrics(page), question, 'defense feedback');
    expect(errors).toEqual([]);
  });

  test('four text choices: second miss, worked summary, Coach Replay, Back and gated Continue', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: OFFENSE_SEED, trigger: CALL, familyId: 'next-down' });
    expect(question.choices).toHaveLength(4);
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'text');
    assertWorkspace(await workspaceMetrics(page), question, 'next-down question');

    const wrongIds = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
    await tapChoice(page, wrongIds[0]);
    await expectStatus(page, 'Good try.');
    await tapChoice(page, wrongIds[1]);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');

    // Production review state: question and answers hidden, worked text in the
    // focused summary, and the status region kept for assistive technology only.
    await expect(page.locator('#question')).toBeHidden();
    await expect(page.locator('#btn-row')).toBeHidden();
    await expect(page.locator('#film-room-summary')).toBeVisible();
    await expect(page.locator('#film-room-summary')).toBeFocused();
    await expect(page.locator('#film-room-summary-copy')).toHaveText(question.workedExplanation.text);
    await expectStatus(page, question.workedExplanation.text);
    const status = await page.locator('#feedback').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    expect(status.width <= 1 && status.height <= 1, 'worked status is visually hidden, not duplicated').toBe(true);
    await expect(page.locator('#question-continue')).toBeHidden();
    const gated = await page.evaluate(() => JSON.parse(render_game_to_text()));
    expect(gated.continueRequired).toBe(true);
    expect(gated.outcomeCommitted).toBe(false);

    const learn = page.locator('#question-learn-why');
    await expect(learn).toBeVisible();
    const learnBox = await learn.boundingBox();
    const viewport = page.viewportSize();
    expect(learnBox.width).toBeGreaterThanOrEqual(44);
    expect(learnBox.height).toBeGreaterThanOrEqual(44);
    expect(learnBox.y + learnBox.height, 'Learn why above the fold').toBeLessThanOrEqual(viewport.height + EPS);

    await learn.tap();
    await expect(page.locator('#worked-review')).toBeVisible();
    await expect(page.locator('#worked-review-heading')).toBeFocused();
    await expect(page.locator('#worked-review-heading')).toHaveText(`Coach Replay: ${question.workedReview.title}`);
    await expect(page.locator('#worked-review-content .worked-review-steps li')).toHaveCount(question.workedReview.steps.length);
    const replay = await page.evaluate(() => {
      const size = selector => Math.min(...Array.from(document.querySelectorAll(selector), element => parseFloat(getComputedStyle(element).fontSize)));
      const overflow = id => getComputedStyle(document.getElementById(id)).overflowY;
      const review = document.getElementById('worked-review');
      const controls = ['worked-review-back', 'question-continue'].map((id) => {
        const element = document.getElementById(id);
        const box = element.getBoundingClientRect();
        return { id, width: box.width, height: box.height, left: box.left, right: box.right, disabled: element.disabled };
      });
      return {
        goal: size('#worked-review-content .worked-review-goal p'),
        steps: size('#worked-review-content .worked-review-steps p'),
        meaning: size('#worked-review-content .worked-review-meaning p'),
        overflow: ['worked-review', 'worked-review-content', 'action-panel', 'prompt-panel'].map(overflow),
        reviewScrollWidth: review.scrollWidth,
        reviewClientWidth: review.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        controls,
      };
    });
    expect(replay.goal, 'Replay goal text').toBeGreaterThanOrEqual(14);
    expect(replay.steps, 'Replay step text').toBeGreaterThanOrEqual(14);
    expect(replay.meaning, 'Replay meaning text').toBeGreaterThanOrEqual(13);
    for (const value of replay.overflow) expect(['auto', 'scroll'], 'no nested scrolling').not.toContain(value);
    expect(replay.reviewScrollWidth).toBeLessThanOrEqual(replay.reviewClientWidth + EPS);
    expect(replay.documentScrollWidth).toBeLessThanOrEqual(replay.innerWidth + EPS);
    for (const control of replay.controls) {
      expect(control.disabled, `${control.id} enabled`).toBe(false);
      expect(control.width, `${control.id} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.id} height`).toBeGreaterThanOrEqual(44);
      expect(control.left, `${control.id} left`).toBeGreaterThanOrEqual(-EPS);
      expect(control.right, `${control.id} right`).toBeLessThanOrEqual(replay.innerWidth + EPS);
    }

    // Back closes Replay but keeps the satisfied review gate and Continue.
    await page.locator('#worked-review-back').tap();
    await expect(page.locator('#worked-review')).toBeHidden();
    await expect(learn).toBeVisible();
    await expect(page.locator('#question-continue')).toBeVisible();
    expect(await page.evaluate(() => window.__footballTest.activeContracts().questionUi.reviewSatisfied)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(false);

    await page.locator('#question-continue').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
    expect(errors).toEqual([]);
  });
});
