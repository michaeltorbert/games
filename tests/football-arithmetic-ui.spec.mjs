import { test, expect } from './curriculum-fixture.mjs';

for (const possession of ['offense', 'defense']) test(`completed arithmetic keeps initial, retry and worked support on ${possession}`, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`/football/?boot=${possession}-call`);
  const draw = await page.evaluate((possession) => {
    for (let i = 0; i < 500; i++) {
      __footballTest.resetLearning();
      __footballTest.setRngStreams({ football: () => .2, scheduler: () => i / 500, presentation: () => .4 });
      __footballTest.seedDriveState({ possession, direction: possession === 'offense' ? 1 : -1,
        quarter: 2, down: 2, yardLine: 50, firstDownLine: possession === 'offense' ? 60 : 40,
        yardsToGo: 10, driveStart: 50, scores: { player: 7, opponent: 6 },
        totalYards: { player: 23, opponent: 23 }, plays: 4, drivePlays: 2 });
      document.querySelector('#call-grid .call-btn').click();
      if (__footballTest.activeContracts().questionInstance?.familyId === 'score-total-ch8-within-20') return i / 500;
    }
    return null;
  }, possession);
  expect(draw).not.toBeNull();
  const initial = await page.evaluate(() => ({ question: __footballTest.activeContracts().questionInstance, text: JSON.parse(render_game_to_text()) }));
  expect(initial.question.support).toBe('initial');
  expect(initial.question.answer.value).toBe(13);
  expect(initial.question.visuals.initial.result).toBeNull();
  await expect(page.locator('#math-overlay')).toHaveAttribute('aria-label', '7 + 6 equals an unknown number.');
  await expect(page.locator('#math-overlay')).not.toContainText('= 13');
  await page.screenshot({ path: `tests/artifacts.nosync/page113-${possession}-initial-${test.info().project.name}.png` });
  const wrong = initial.question.choices.map((choice, index) => choice.id !== initial.question.correctChoiceId ? index : null).filter(index => index !== null);
  await page.locator(`#b${wrong[0]}`).click();
  await expect(page.locator('#math-overlay')).not.toContainText('= 13');
  await expect(page.locator('#math-overlay')).toHaveAttribute('data-type', 'arithmetic-model');
  await expect(page.locator('#math-overlay')).toHaveAttribute('aria-label', initial.question.visuals.guided.ariaLabel);
  await expect(page.locator('#feedback')).toHaveText('Good try. Make ten first, then add the rest.');
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).mode)).toBe('question');
  await page.locator(`#b${wrong[1]}`).click();
  await expect(page.locator('#math-overlay')).toContainText('= 13');
  await page.screenshot({ path: `tests/artifacts.nosync/page113-${possession}-worked-${test.info().project.name}.png` });
  await page.locator('#question-learn-why').click();
  await page.locator('#question-continue').click();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
  expect(errors).toEqual([]);
});

// These use the ordinary positive-weight selector and call button, never a forced family.
test('Chapter 8 families are ordinarily selected with hidden results and working retry/Continue', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(()=>{curriculumSession=Object.freeze({worktext:'Math Mammoth Grade 1-B',edition:2026,completedThroughPage:187});});
  const draws = await page.evaluate(() => {
    const found = {};
    for (let i = 0; i < 500; i++) {
      __footballTest.resetLearning();
      __footballTest.setRngStreams({ football: () => .2, scheduler: () => i / 500, presentation: () => .4 });
      __footballTest.seedDriveState({ possession: 'offense', direction: 1, quarter: 2, down: 2,
        yardLine: 60, firstDownLine: 74, yardsToGo: 14, driveStart: 65,
        scores: { player: 14, opponent: 7 }, totalYards: { player: 34, opponent: 21 }, plays: 4, drivePlays: 2 });
      document.querySelector('#call-grid .call-btn').click();
      const q = __footballTest.activeContracts().questionInstance;
      if (q?.concept.endsWith('-ch8')) found[q.familyId] = i / 500;
    }
    return found;
  });
  expect(Object.keys(draws).sort()).toEqual(['goal-remaining-ch8','line-remaining-ch8-ones-subtract','score-difference-ch8','score-total-ch8','team-yards-add-ch8-ones-add']);
  for (const [familyId, draw] of Object.entries(draws)) {
    const q = await page.evaluate(({ draw }) => {
      __footballTest.resetLearning();
      __footballTest.setRngStreams({ football: () => .2, scheduler: () => draw, presentation: () => .4 });
      __footballTest.seedDriveState({ possession: 'offense', direction: 1, quarter: 2, down: 2,
        yardLine: 60, firstDownLine: 74, yardsToGo: 14, driveStart: 65,
        scores: { player: 14, opponent: 7 }, totalYards: { player: 34, opponent: 21 }, plays: 4, drivePlays: 2 });
      document.querySelector('#call-grid .call-btn').click();
      return __footballTest.activeContracts().questionInstance;
    }, { draw });
    expect(q.familyId).toBe(familyId);
    expect(q.support).toBe('initial');
    expect(new Set(q.choices.map(c => c.value)).size).toBe(4);
    expect(q.visuals.guided.result).toBeNull();
    await expect(page.locator('#math-overlay')).toContainText('= ?');
    await expect(page.locator('#math-overlay')).not.toContainText(`= ${q.answer.value}`);
    const wrong = q.choices.findIndex(c => c.id !== q.correctChoiceId);
    await page.locator(`#b${wrong}`).click();
    const completed = /-(within-20|ones-add|ones-subtract)$/.test(familyId);
    await expect(page.locator('#math-overlay')).toHaveAttribute('data-type', completed ? 'arithmetic-model' : 'arithmetic-equation');
    await expect(page.locator('#math-overlay .math-model')).toHaveCount(completed ? 1 : 0);
    await page.locator(`#b${q.choices.findIndex((c, i) => c.id !== q.correctChoiceId && i !== wrong)}`).click();
    await expect(page.locator('#math-overlay .math-model')).toHaveCount(0);
    await expect(page.locator('#math-overlay')).toContainText(`= ${q.answer.value}`);
    await page.screenshot({ path: `tests/artifacts.nosync/arithmetic-${test.info().project.name}-${familyId}.png` });
    await page.locator('#question-learn-why').click();
    await page.locator('#question-continue').click();
    expect((await page.evaluate(() => JSON.parse(render_game_to_text()))).outcomeCommitted).toBe(true);
  }
});

// Issue #138: guided make-ten and tens-and-ones pictures on the real tap path.
const MODEL_CASES = [
  { model: 'make-ten', familyId: 'score-total-ch8-within-20', scores: { player: 7, opponent: 6 }, equation: '7 + 6', answer: 13,
    caption: '7 + 3 makes 10. Then 3 more.', hint: 'Make ten first, then add the rest.',
    counts: { frames: 2, cells: 20, source: 7, added: 6, removed: 0, rods: 0, rodUnits: 0 } },
  // The score total lists the ones first; the rods still start from 23.
  { model: 'tens-add', familyId: 'score-total-ch8-ones-add', scores: { player: 4, opponent: 23 }, equation: '4 + 23', answer: 27,
    caption: '2 tens stay. 3 ones + 4 ones.', hint: 'Keep the tens. Add the ones.',
    counts: { frames: 0, cells: 0, source: 3, added: 4, removed: 0, rods: 2, rodUnits: 20 } },
  { model: 'tens-subtract', familyId: 'score-difference-ch8-ones-subtract', scores: { player: 36, opponent: 4 }, equation: '36 − 4', answer: 32,
    caption: '3 tens stay. 6 ones take away 4.', hint: 'Keep the tens. Take away the ones.',
    counts: { frames: 0, cells: 0, source: 2, added: 0, removed: 4, rods: 3, rodUnits: 30 } },
];

function seedFor(possession, scores) {
  return { possession, direction: possession === 'offense' ? 1 : -1, quarter: 2, down: 2, yardLine: 50,
    firstDownLine: possession === 'offense' ? 60 : 40, yardsToGo: 10, driveStart: 50, scores,
    totalYards: { player: 71, opponent: 71 }, plays: 4, drivePlays: 2 };
}

// Prepares the live session with counted RNG streams. A guided start records two
// supported results for the family's skill through the production learning API.
async function installPrepare(page) {
  await page.evaluate(() => {
    window.__prepareSnap = ({ seed, draw, familyId, guidedStart }) => {
      // Seed first: it may initialize a fresh game session and its streams.
      __footballTest.seedDriveState(seed);
      __footballTest.resetLearning();
      if (guidedStart) {
        const family = FOOTBALL_CONTEXTUAL_QUESTIONS.FAMILY_REGISTRY.scrimmage.find(row => row.familyId === familyId);
        for (const index of [1, 2]) {
          FOOTBALL_LEARNING.recordResolved(learningSession, {
            id: 'prior-practice', familyId: 'prior-practice', skill: family.skill, concept: 'prior-practice',
            purpose: 'weakSpot', grading: 'gate', evidenceClass: 'independent', weight: 1,
            contextId: `prior-${index}`, questionInstanceId: 9000 + index,
          }, 'retryCorrect', { support: 'guided' });
        }
      }
      window.__rngDraws = { football: 0, scheduler: 0, presentation: 0 };
      __footballTest.setRngStreams({
        football: () => { window.__rngDraws.football++; return .2; },
        scheduler: () => { window.__rngDraws.scheduler++; return draw; },
        presentation: () => { window.__rngDraws.presentation++; return .4; },
      });
    };
  });
}

async function prepareSnap(page, options) {
  await page.evaluate((options) => window.__prepareSnap(options), options);
}

async function findDraw(page, { seed, familyId, guidedStart }) {
  await installPrepare(page);
  return page.evaluate(({ seed, familyId, guidedStart }) => {
    // Warm up so every probe and the later real snap seed from the same stream shape.
    window.__prepareSnap({ seed, draw: 0.5, familyId, guidedStart });
    for (let i = 0; i < 1000; i++) {
      const draw = (i + 0.5) / 1000;
      window.__prepareSnap({ seed, draw, familyId, guidedStart });
      document.querySelector('#call-grid .call-btn').click();
      if (__footballTest.activeContracts().questionInstance?.familyId === familyId) return draw;
    }
    return null;
  }, { seed, familyId, guidedStart });
}

async function modelCounts(page) {
  return page.evaluate(() => {
    const count = selector => document.querySelectorAll(`#math-overlay ${selector}`).length;
    return {
      frames: count('.math-ten-frame'),
      cells: count('.math-ten-cell'),
      source: count('[data-tone="source"]'),
      added: count('[data-tone="added"]'),
      removed: count('[data-tone="removed"]'),
      rods: count('.math-rod'),
      rodUnits: count('.math-rod .math-rod-unit'),
    };
  });
}

async function questionGeometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const field = document.getElementById('field-wrap');
    const fieldBox = field.getBoundingClientRect();
    const inner = {
      left: fieldBox.left + field.clientLeft,
      top: fieldBox.top + field.clientTop,
      right: fieldBox.left + field.clientLeft + field.clientWidth,
      bottom: fieldBox.top + field.clientTop + field.clientHeight,
    };
    const overlay = document.getElementById('math-overlay');
    const parts = [...overlay.querySelectorAll('*')].map(rect).filter(box => box.width > 0 || box.height > 0);
    const row = overlay.querySelector('.math-context-row');
    const model = overlay.querySelector('.math-model');
    return {
      scrollY: window.scrollY,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      inner,
      overlay: rect(overlay),
      parts,
      row: row ? rect(row) : null,
      model: model ? rect(model) : null,
      desk: rect(document.getElementById('ui-desk')),
      mute: rect(document.getElementById('mute-toggle')),
      answers: [...document.querySelectorAll('#btn-row .ans-btn:not(.hidden)')].map(rect),
    };
  });
}

function intersects(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function assertQuestionGeometry(metrics, label, { initialAnswers = null } = {}) {
  const e = 1;
  expect(metrics.scrollY, `${label}: no automatic scroll`).toBe(0);
  expect(metrics.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + e);
  for (const box of [metrics.overlay, ...metrics.parts]) {
    expect(box.left, `${label}: model inside field (left)`).toBeGreaterThanOrEqual(metrics.inner.left - e);
    expect(box.right, `${label}: model inside field (right)`).toBeLessThanOrEqual(metrics.inner.right + e);
    expect(box.top, `${label}: model inside field (top)`).toBeGreaterThanOrEqual(metrics.inner.top - e);
    expect(box.bottom, `${label}: model inside field (bottom)`).toBeLessThanOrEqual(metrics.inner.bottom + e);
  }
  // The sound toggle keeps its whole 44px target clear of the overlay, so it
  // neither hides behind the panel nor covers a counted unit or chip.
  expect(metrics.mute.width, `${label}: sound toggle width`).toBeGreaterThanOrEqual(44);
  expect(metrics.mute.height, `${label}: sound toggle height`).toBeGreaterThanOrEqual(44);
  for (const box of [metrics.overlay, ...metrics.parts]) {
    expect(intersects(box, metrics.mute), `${label}: overlay clear of the sound toggle`).toBe(false);
  }
  expect(metrics.answers.length, `${label}: answer choices`).toBe(4);
  metrics.answers.forEach((answer, index) => {
    expect(answer.width, `${label}: answer target width`).toBeGreaterThanOrEqual(44);
    expect(answer.height, `${label}: answer target height`).toBeGreaterThanOrEqual(44);
    expect(answer.left, `${label}: answer inside viewport`).toBeGreaterThanOrEqual(-e);
    expect(answer.right, `${label}: answer inside viewport`).toBeLessThanOrEqual(metrics.innerWidth + e);
    expect(answer.bottom, `${label}: answer above the fold`).toBeLessThanOrEqual(metrics.innerHeight + e);
    if (initialAnswers) {
      expect(answer.width, `${label}: answer target not reduced`).toBeGreaterThanOrEqual(initialAnswers[index].width - 0.5);
      expect(answer.height, `${label}: answer target not reduced`).toBeGreaterThanOrEqual(initialAnswers[index].height - 0.5);
    }
  });
  // Primary iPad 11 landscape keeps the #101/#128 lower clearance.
  if (metrics.innerWidth === 1180 && metrics.innerHeight === 820) {
    expect(metrics.innerHeight - metrics.desk.bottom, `${label}: space below the answer panel`).toBeGreaterThanOrEqual(16);
    expect(metrics.innerHeight - Math.max(...metrics.answers.map(answer => answer.bottom)), `${label}: space below answers`)
      .toBeGreaterThanOrEqual(16);
  }
  if (metrics.model && metrics.row) {
    if (metrics.innerWidth > 760) {
      // Tablets keep the equation and the model on one line.
      expect(metrics.row.right, `${label}: equation before the model`).toBeLessThanOrEqual(metrics.model.left + e);
      expect(metrics.row.top < metrics.model.bottom && metrics.model.top < metrics.row.bottom, `${label}: equation and model inline`).toBe(true);
    } else {
      expect(metrics.row.bottom, `${label}: phone stacks the model below the equation`).toBeLessThanOrEqual(metrics.model.top + e);
    }
  }
}

async function snapshotState(page) {
  return page.evaluate(() => {
    const contracts = __footballTest.activeContracts();
    return {
      activePlay: JSON.stringify(contracts.activePlay),
      question: JSON.stringify(contracts.questionInstance),
      choiceOrder: [...document.querySelectorAll('#btn-row .ans-btn:not(.hidden)')].map(button => button.dataset.choiceId),
      draws: { ...window.__rngDraws },
    };
  });
}

async function expectGuidedModel(page, testCase, question, label) {
  const overlay = page.locator('#math-overlay');
  await expect(overlay).toHaveAttribute('data-type', 'arithmetic-model');
  await expect(overlay).toHaveAttribute('data-support', 'guided');
  await expect(overlay).toHaveAttribute('data-model', testCase.model);
  await expect(overlay).toHaveAttribute('aria-label', question.visuals.guided.ariaLabel);
  await expect(overlay.locator('.math-model-caption')).toHaveText(testCase.caption);
  await expect(overlay.locator('.math-context-row')).toContainText('?');
  expect(await modelCounts(page), `${label}: drawn counts`).toEqual(testCase.counts);
  const text = await overlay.textContent();
  expect(text.replace(testCase.equation.replace(/ /g, ''), ''), `${label}: no computed result in the picture`)
    .not.toMatch(new RegExp(`(^|[^0-9])${testCase.answer}([^0-9]|$)`));
  expect(question.visuals.guided.ariaLabel.slice(`${testCase.equation}. `.length)).not.toContain(String(testCase.answer));
  const rendered = JSON.parse(await page.evaluate(() => render_game_to_text()));
  expect(rendered.math.type).toBe('arithmetic-model');
  expect(rendered.math.result).toBeNull();
  expect(rendered.math.revealsAnswer).toBe(false);
}

for (const possession of ['offense', 'defense']) for (const testCase of MODEL_CASES) {
  test(`${testCase.model} guided picture follows a real ${possession} miss through worked, Replay and Continue`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/football/?boot=${possession}-call`);
    const seed = seedFor(possession, testCase.scores);
    const draw = await findDraw(page, { seed, familyId: testCase.familyId, guidedStart: false });
    expect(draw, `${testCase.familyId} is reachable`).not.toBeNull();
    await prepareSnap(page, { seed, draw, familyId: testCase.familyId, guidedStart: false });
    await page.locator('#call-grid .call-btn').first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    const before = await snapshotState(page);
    const question = JSON.parse(before.question);
    expect(question.familyId).toBe(testCase.familyId);
    expect(question.support).toBe('initial');
    expect(question.answer.value).toBe(testCase.answer);
    const overlay = page.locator('#math-overlay');
    await expect(overlay).toHaveAttribute('data-type', 'arithmetic-equation');
    await expect(overlay.locator('.math-model')).toHaveCount(0);
    await expect(overlay).toHaveAttribute('aria-label', `${testCase.equation} equals an unknown number.`);
    const initialMetrics = await questionGeometry(page);
    assertQuestionGeometry(initialMetrics, `${possession} ${testCase.model} initial`);
    await page.screenshot({ path: testInfo.outputPath(`${testCase.model}-${possession}-initial.png`) });

    const wrong = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
    await page.locator(`[data-choice-id="${wrong[0]}"]`).tap();
    await expect(page.locator('#feedback')).toHaveText(`Good try. ${testCase.hint}`);
    await expect(page.locator('#feedback')).not.toContainText('Work out');
    await expectGuidedModel(page, testCase, question, `${possession} ${testCase.model} first miss`);
    const guidedMetrics = await questionGeometry(page);
    assertQuestionGeometry(guidedMetrics, `${possession} ${testCase.model} guided`, { initialAnswers: initialMetrics.answers });
    await page.screenshot({ path: testInfo.outputPath(`${testCase.model}-${possession}-guided.png`) });
    await testInfo.attach(`${testCase.model}-${possession}-guided-geometry.json`, {
      body: JSON.stringify({ viewport: page.viewportSize(), overlay: guidedMetrics.overlay, field: guidedMetrics.inner,
        answers: guidedMetrics.answers, desk: guidedMetrics.desk }, null, 2),
      contentType: 'application/json',
    });
    // Real taps reach the visible sound toggle during the guided retry and leave the picture up.
    const mute = page.locator('#mute-toggle');
    const pressed = await mute.getAttribute('aria-pressed');
    const toggled = pressed === 'true' ? 'false' : 'true';
    await mute.tap();
    await expect(mute).toHaveAttribute('aria-pressed', toggled);
    await mute.tap();
    await expect(mute).toHaveAttribute('aria-pressed', pressed);
    await expect(overlay).toHaveAttribute('data-type', 'arithmetic-model');
    expect(await modelCounts(page), `${possession} ${testCase.model} counts after sound taps`).toEqual(testCase.counts);
    const afterMiss = await snapshotState(page);
    // Presentation never changes the play, the question, the choice order, or any RNG stream.
    expect(afterMiss.activePlay).toBe(before.activePlay);
    expect(afterMiss.question).toBe(before.question);
    expect(afterMiss.choiceOrder).toEqual(before.choiceOrder);
    expect(afterMiss.draws).toEqual(before.draws);

    await page.locator(`[data-choice-id="${wrong[1]}"]`).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    await expect(overlay).toHaveAttribute('data-type', 'arithmetic-equation');
    await expect(overlay.locator('.math-model')).toHaveCount(0);
    await expect(overlay).toContainText(`= ${testCase.answer}`);
    await expect(overlay).toHaveAttribute('aria-label', `${testCase.equation} equals ${testCase.answer}.`);
    await page.screenshot({ path: testInfo.outputPath(`${testCase.model}-${possession}-worked.png`) });

    await page.locator('#question-learn-why').tap();
    const steps = page.locator('#worked-review-content .worked-review-steps li p');
    await expect(steps).toHaveText([testCase.hint, `${testCase.equation} = ${testCase.answer}.`]);
    await expect(overlay.locator('.math-model')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`${testCase.model}-${possession}-replay.png`) });
    const beforeContinue = await snapshotState(page);
    expect(beforeContinue.activePlay).toBe(before.activePlay);
    expect(beforeContinue.draws).toEqual(before.draws);

    await page.locator('#question-continue').tap();
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${testCase.model} guided start on ${possession} shows the picture immediately`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/football/?boot=${possession}-call`);
    const seed = seedFor(possession, testCase.scores);
    const draw = await findDraw(page, { seed, familyId: testCase.familyId, guidedStart: true });
    expect(draw, `${testCase.familyId} is reachable`).not.toBeNull();
    await prepareSnap(page, { seed, draw, familyId: testCase.familyId, guidedStart: true });
    await page.locator('#call-grid .call-btn').first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    // First frame of a guided start: the picture is already up, with no miss recorded.
    await page.screenshot({ path: testInfo.outputPath(`${testCase.model}-${possession}-guided-start.png`) });
    const contracts = await page.evaluate(() => __footballTest.activeContracts());
    const question = contracts.questionInstance;
    expect(question.familyId).toBe(testCase.familyId);
    expect(question.support).toBe('guided');
    expect(contracts.questionUi.support).toBe('guided');
    expect(contracts.questionUi.attempt).toBe(1);
    expect(contracts.questionUi.missedChoiceIds).toEqual([]);
    await expect(page.locator('#feedback')).toContainText(testCase.hint);
    await expectGuidedModel(page, testCase, question, `${possession} ${testCase.model} guided start`);
    assertQuestionGeometry(await questionGeometry(page), `${possession} ${testCase.model} guided start`);

    const wrong = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
    await page.locator(`[data-choice-id="${wrong[0]}"]`).tap();
    await expect(page.locator('#feedback')).toHaveText(`Good try. ${testCase.hint}`);
    await expectGuidedModel(page, testCase, question, `${possession} ${testCase.model} guided-start miss`);
    await page.screenshot({ path: testInfo.outputPath(`${testCase.model}-${possession}-guided-start-miss.png`) });
    await page.locator(`[data-choice-id="${question.correctChoiceId}"]`).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
    expect(errors).toEqual([]);
  });
}
