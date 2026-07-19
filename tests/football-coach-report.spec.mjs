import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(
    testInfo.project.name !== 'ipad-11-landscape',
    'Focused Coach Report contracts run once on the primary target.',
  );
}

test('coach report never assigns the same concept to strength and practice', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');

  const reports = await page.evaluate(() => {
    learningSession.byConcept = {
      addition: { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
    };
    const oneSupportedConcept = buildCoachReport();

    learningSession.byConcept = {
      addition: { resolved: 2, firstTryCorrect: 1, retryCorrect: 1, secondMiss: 0 },
      difference: { resolved: 4, firstTryCorrect: 3, retryCorrect: 0, secondMiss: 1 },
    };
    const distinctPracticeConcept = buildCoachReport();

    return { oneSupportedConcept, distinctPracticeConcept };
  });

  expect(reports.oneSupportedConcept).toEqual([
    { label: 'Building today', value: 'Adding within 10' },
    { label: 'Coach says', value: 'Great job using support and trying again' },
  ]);
  expect(reports.distinctPracticeConcept).toEqual([
    { label: 'Strong today', value: 'Adding within 10' },
    { label: 'Practice next', value: 'Finding the difference' },
  ]);
});

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
  await page.goto('/football/?boot=offense-call');

  expect(await page.evaluate(() => window.__footballTest.learningState().historicalMastery.addition))
    .toEqual({ resolved: 8, firstTryCorrect: 8, retryCorrect: 0, secondMiss: 0 });
  expect(await page.evaluate(() => window.__footballTest.coachReport())).toEqual([
    { label: 'Learning today', value: 'Keep playing to build your learning recap' },
  ]);

  const extensionLabels = await page.evaluate(() => {
    const result = {};
    for (const concept of ['line-to-gain-comparison', 'team-total-yards', 'drive-play-order']) {
      learningSession.byConcept = {
        [concept]: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 },
      };
      result[concept] = buildCoachReport()[0].value;
    }
    learningSession.byConcept = {};
    return result;
  });
  expect(extensionLabels).toEqual({
    'line-to-gain-comparison': 'Comparing the play to the marker',
    'team-total-yards': 'Team yards through 120',
    'drive-play-order': 'Play order in the drive',
  });

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

  const cta = page.locator('#ov-end-btn');
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

test('compact final-overlay compatibility rule stays usable at 1180x740', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.setViewportSize({ width: 1180, height: 740 });
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    learningSession.byConcept = {
      addition: { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 },
    };
    state.playerScore = 21;
    state.opponentScore = 14;
    state.gradedQuestions = 2;
    state.correctAnswers = 1;
    state.tds = 3;
    state.defenseStops = 2;
    state.firstDowns = 4;
    showGameOver();
  });

  expect(await page.evaluate(() => matchMedia('(max-height: 760px) and (min-width: 700px)').matches)).toBe(true);
  const card = page.locator('#ov-end .overlay-card');
  const cta = page.locator('#ov-end-btn');
  await expect(card).toBeVisible();
  await expect(cta).toBeVisible();
  const geometry = await page.evaluate(() => {
    const cardBox = document.querySelector('#ov-end .overlay-card').getBoundingClientRect();
    const ctaBox = document.getElementById('ov-end-btn').getBoundingClientRect();
    return {
      cardTop: cardBox.top,
      cardBottom: cardBox.bottom,
      ctaBottom: ctaBox.bottom,
      ctaWidth: ctaBox.width,
      ctaHeight: ctaBox.height,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.cardTop).toBeGreaterThanOrEqual(0);
  expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.ctaBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.ctaWidth).toBeGreaterThanOrEqual(44);
  expect(geometry.ctaHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);

  const screenshot = testInfo.outputPath('compact-final-overlay.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await testInfo.attach('compact-final-overlay', { path: screenshot, contentType: 'image/png' });
});
