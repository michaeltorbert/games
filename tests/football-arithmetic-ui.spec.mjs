import { test, expect } from '@playwright/test';

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
  await page.screenshot({ path: `tests/artifacts/page113-${possession}-initial-${test.info().project.name}.png` });
  const wrong = initial.question.choices.map((choice, index) => choice.id !== initial.question.correctChoiceId ? index : null).filter(index => index !== null);
  await page.locator(`#b${wrong[0]}`).click();
  await expect(page.locator('#math-overlay')).not.toContainText('= 13');
  await expect(page.locator('#math-overlay')).toHaveAttribute('aria-label', 'Use a double you know, make ten, or count on. 7 + 6; the answer is hidden.');
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).mode)).toBe('question');
  await page.locator(`#b${wrong[1]}`).click();
  await expect(page.locator('#math-overlay')).toContainText('= 13');
  await page.screenshot({ path: `tests/artifacts/page113-${possession}-worked-${test.info().project.name}.png` });
  await page.locator('#question-learn-why').click();
  await page.locator('#question-continue').click();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
  expect(errors).toEqual([]);
});

// These use the ordinary positive-weight selector and call button, never a forced family.
test('Chapter 8 families are ordinarily selected with hidden results and working retry/Continue', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
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
    expect(q.support).toBe(familyId.includes('-ones-') ? 'initial' : 'guided');
    expect(new Set(q.choices.map(c => c.value)).size).toBe(4);
    expect(q.visuals.guided.result).toBeNull();
    await expect(page.locator('#math-overlay')).toContainText('= ?');
    await expect(page.locator('#math-overlay')).not.toContainText(`= ${q.answer.value}`);
    const wrong = q.choices.findIndex(c => c.id !== q.correctChoiceId);
    await page.locator(`#b${wrong}`).click();
    await page.locator(`#b${q.choices.findIndex((c, i) => c.id !== q.correctChoiceId && i !== wrong)}`).click();
    await expect(page.locator('#math-overlay')).toContainText(`= ${q.answer.value}`);
    await page.screenshot({ path: `tests/artifacts/arithmetic-${test.info().project.name}-${familyId}.png` });
    await page.locator('#question-learn-why').click();
    await page.locator('#question-continue').click();
    expect((await page.evaluate(() => JSON.parse(render_game_to_text()))).outcomeCommitted).toBe(true);
  }
});
