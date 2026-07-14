import { test, expect } from '@playwright/test';

test('coach report uses this game only and keeps the final CTA above the fold', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('footballMathStats:v1', JSON.stringify({
      schemaVersion: 1,
      aggregates: {},
      recentPlays: [],
      mastery: {
        addition: { resolved: 8, firstTryCorrect: 8, retryCorrect: 0, secondMiss: 0 },
      },
    }));
  });
  await page.goto('/football/');

  expect(await page.evaluate(() => window.__footballTest.learningState().historicalMastery.addition))
    .toEqual({ resolved: 8, firstTryCorrect: 8, retryCorrect: 0, secondMiss: 0 });
  expect(await page.evaluate(() => window.__footballTest.coachReport())).toEqual([
    { label: 'Learning today', value: 'Keep playing to build your learning recap' },
  ]);

  await page.evaluate(() => {
    const base = { purpose: 'coreReview', grading: 'gate' };
    FOOTBALL_LEARNING.recordResolved(learningSession, {
      ...base, id: 'today-add', skill: 'addition', concept: 'addition',
    }, 'firstTryCorrect');
    FOOTBALL_LEARNING.recordResolved(learningSession, {
      ...base, id: 'today-difference', skill: 'difference', concept: 'difference',
    }, 'secondMiss');
    state.gradedQuestions = 2;
    state.correctAnswers = 1;
    showGameOver();
  });

  const report = page.locator('#ov-end-stats .ov-coach-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('Strong today');
  await expect(report).toContainText('Adding within 10');
  await expect(report).toContainText('Practice next');
  await expect(report).toContainText('Finding the difference');
  await expect(report).not.toContainText('Tens and ones');

  const cta = page.locator('#ov-end .ov-btn');
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box, `${testInfo.project.name} CTA has a box`).not.toBeNull();
  expect(box.y + box.height, `${testInfo.project.name} CTA stays above fold`).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight)
  );

  const rendered = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(rendered.questionConcept).toBeNull();
  expect(rendered.learning.byConcept).toEqual({
    addition: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
    difference: { resolved: 1, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 1 },
  });
  expect(rendered.coachReport).toEqual([
    { label: 'Strong today', value: 'Adding within 10' },
    { label: 'Practice next', value: 'Finding the difference' },
  ]);
});
