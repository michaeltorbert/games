import { test, expect } from '@playwright/test';

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
      if (q?.familyId.endsWith('-ch8')) found[q.familyId] = i / 500;
    }
    return found;
  });
  expect(Object.keys(draws).sort()).toEqual(['goal-remaining-ch8','line-remaining-ch8','score-difference-ch8','score-total-ch8','team-yards-add-ch8']);
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
