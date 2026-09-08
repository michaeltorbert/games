import { test, expect } from '@playwright/test';

const PRIMARY_PROJECT = 'ipad-11-landscape';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== PRIMARY_PROJECT, 'Detailed Time Lab behavior runs once on the primary target.');
}

function watchErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

function expectNoErrors(errors) {
  expect(errors.pageErrors).toEqual([]);
  expect(errors.consoleErrors).toEqual([]);
}

async function openLab(page) {
  await page.locator('#tl-open-button').click();
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  await expect(page.locator('#ov-start')).not.toHaveClass(/show/);
  await expect(page.locator('#wrap')).toHaveAttribute('aria-hidden', 'true');
}

async function startSeededMode(page, mode, seed = 1234) {
  const started = await page.evaluate(({ selectedMode, rootSeed }) => (
    window.__footballTest.startPracticeLab(selectedMode, rootSeed)
  ), { selectedMode: mode, rootSeed: seed });
  expect(started).toBe(true);
  await expect(page.locator('#tl-question-view')).toBeVisible();
  const state = await practiceState(page);
  await expect(page.locator('#tl-choices .tl-choice-button')).toHaveCount(state.current.choiceCount);
}

async function practiceState(page) {
  return page.evaluate(() => window.__footballTest.practiceState());
}

async function finishRemainingCorrect(page) {
  while ((await practiceState(page)).status === 'active') {
    const answered = await page.evaluate(() => window.__footballTest.answerPracticeLab('correct'));
    expect(answered).toBe(true);
    const advanced = await page.evaluate(() => window.__footballTest.advancePracticeLab());
    expect(advanced).toBe(true);
  }
}

async function settleScheduledFocus(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function focusCorrectPracticeChoice(page) {
  await settleScheduledFocus(page);
  const buttonId = await page.evaluate(() => {
    const slot = timeLabSession.slots[timeLabSession.index];
    const button = Array.from(document.querySelectorAll('#tl-choices .tl-choice-button'))
      .find(candidate => candidate.dataset.choiceId === slot.question.correctChoiceId);
    return button.id;
  });
  const button = page.locator(`#${buttonId}`);
  await button.focus();
  await expect(button).toBeFocused();
  return button;
}

async function storageBytes(page) {
  return page.evaluate(() => JSON.stringify(
    Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]),
  ));
}

async function liveSemanticSnapshot(page) {
  return page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    const { practice, ...render } = contracts.render;
    return JSON.stringify({
      activePlay: contracts.activePlay,
      activeSnap: contracts.activeSnap,
      questionInstance: contracts.questionInstance,
      pendingResolution: contracts.pendingResolution,
      questionUi: contracts.questionUi,
      statsSession: contracts.statsSession,
      learning: contracts.learning,
      render,
    });
  });
}

test('start entry is separate and every mode opens an eight-question ephemeral session', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = watchErrors(page);
  await page.goto('/football/');

  const entry = page.locator('#tl-open-button');
  await expect(entry).toBeVisible();
  expect(await entry.evaluate(element => element.closest('fieldset') === null)).toBe(true);
  await expect(entry).toContainText('Practice Clocks & Calendars');

  for (const [mode, buttonId] of [
    ['clocks', '#tl-mode-clocks'],
    ['calendar', '#tl-mode-calendar'],
    ['mixed', '#tl-mode-mixed'],
  ]) {
    await openLab(page);
    await page.locator(buttonId).click();
    await expect.poll(() => practiceState(page)).toMatchObject({
      active: true,
      view: 'question',
      mode,
      status: 'active',
      questionNumber: 1,
      total: 8,
    });
    await page.locator('#tl-back-button').click();
    await expect(page.locator('#ov-start')).toHaveClass(/show/);
    await expect(entry).toBeFocused();
    expect((await practiceState(page)).status).toBeNull();
  }

  expectNoErrors(errors);
});

test('retry, worked practice, recap, and duplicate controls follow exact-once transitions', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = watchErrors(page);
  await page.goto('/football/');
  await openLab(page);
  await startSeededMode(page, 'mixed', 1234);

  await page.evaluate(() => {
    window.__staleTimeLabChoice = document.getElementById('tl-choice-1');
    window.__staleTimeLabChoice.click();
  });
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 1,
    current: { attempt: 2, missedChoiceCount: 1, worked: false },
    tallies: { supported: 0, secondMiss: 0 },
  });
  await expect(page.locator('#tl-feedback')).toContainText('try once more');
  await expect(page.locator('#tl-worked')).toBeHidden();

  const retryState = await practiceState(page);
  await page.evaluate(() => window.__staleTimeLabChoice.click());
  expect(await practiceState(page)).toEqual(retryState);

  await page.locator('#tl-choice-1').click();
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 1,
    current: { worked: true, visualStage: 'worked' },
    tallies: { supported: 1, secondMiss: 1 },
  });
  await expect(page.locator('#tl-worked')).toBeVisible();
  const workedCopy = page.locator('#tl-worked-copy');
  const nextButton = page.locator('#tl-next-button');
  await expect(workedCopy).not.toHaveText('');
  await expect(nextButton).toHaveAttribute('aria-describedby', 'tl-worked-copy');
  await expect(nextButton).toBeFocused();

  await page.evaluate(() => {
    window.__staleTimeLabNext = document.getElementById('tl-next-button');
    window.__staleTimeLabNext.click();
  });
  await expect.poll(() => practiceState(page)).toMatchObject({ questionNumber: 2, status: 'active' });
  await expect(nextButton).not.toHaveAttribute('aria-describedby');
  const secondQuestion = await practiceState(page);
  await page.evaluate(() => window.__staleTimeLabNext.click());
  expect(await practiceState(page)).toEqual(secondQuestion);

  await finishRemainingCorrect(page);
  await expect.poll(() => practiceState(page)).toMatchObject({
    view: 'recap',
    status: 'recap',
    recap: { read: 4, solved: 3, supported: 1 },
    tallies: { firstTryCorrect: 7, retryCorrect: 0, secondMiss: 1 },
  });
  await expect(page.locator('#tl-recap-copy')).toContainText('read 4 facts');
  await expect(page.locator('#tl-recap-copy')).toContainText('solved 3 problems');
  await expect(page.locator('#tl-recap-copy')).toContainText('used extra support on 1 question');
  await expect(page.locator('#tl-done-button')).toBeFocused();

  await page.evaluate(() => {
    window.__staleTimeLabDone = document.getElementById('tl-done-button');
    window.__staleTimeLabDone.click();
  });
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  expect((await practiceState(page)).active).toBe(false);
  await page.evaluate(() => window.__staleTimeLabDone.click());
  expect((await practiceState(page)).active).toBe(false);

  expectNoErrors(errors);
});

test('native Enter and Space plus held Back and Done retargeting stay exact once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = watchErrors(page);
  await page.goto('/football/');
  await openLab(page);
  await startSeededMode(page, 'mixed', 1234);

  await focusCorrectPracticeChoice(page);
  await page.keyboard.down('Enter');
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 1,
    current: { resolution: 'firstTryCorrect' },
    tallies: { firstTryCorrect: 1 },
  });
  await expect(page.locator('#tl-next-button')).toBeFocused();

  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 1,
    current: { resolution: 'firstTryCorrect' },
    tallies: { firstTryCorrect: 1 },
  });

  await page.keyboard.press('Space');
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 2,
    current: { attempt: 1, resolution: null },
  });

  await focusCorrectPracticeChoice(page);
  await page.keyboard.press('Space');
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 2,
    current: { resolution: 'firstTryCorrect' },
    tallies: { firstTryCorrect: 2 },
  });
  await expect(page.locator('#tl-next-button')).toBeFocused();

  const repeatSpace = await page.locator('#tl-next-button').evaluate(button => {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    return {
      dispatched: button.dispatchEvent(event),
      defaultPrevented: event.defaultPrevented,
    };
  });
  expect(repeatSpace).toEqual({ dispatched: false, defaultPrevented: true });
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 2,
    tallies: { firstTryCorrect: 2 },
  });

  await page.keyboard.press('Enter');
  await expect.poll(() => practiceState(page)).toMatchObject({
    questionNumber: 3,
    current: { attempt: 1, resolution: null },
    tallies: { firstTryCorrect: 2 },
  });

  const staleBack = await page.locator('#tl-back-button').elementHandle();
  expect(staleBack).not.toBeNull();
  await settleScheduledFocus(page);
  await page.locator('#tl-back-button').focus();
  await expect(page.locator('#tl-back-button')).toBeFocused();
  await page.keyboard.down('Enter');
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await expect(page.locator('#ov-time-lab')).not.toHaveClass(/show/);
  expect((await practiceState(page)).active).toBe(false);

  await page.keyboard.down('Enter');
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await expect(page.locator('#ov-time-lab')).not.toHaveClass(/show/);
  expect((await practiceState(page)).active).toBe(false);

  await staleBack.evaluate(button => button.click());
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await expect(page.locator('#ov-time-lab')).not.toHaveClass(/show/);
  expect((await practiceState(page)).active).toBe(false);

  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  await expect(page.locator('#ov-start')).not.toHaveClass(/show/);
  await expect(page.locator('#tl-mode-clocks')).toBeFocused();

  await startSeededMode(page, 'mixed', 5678);
  await finishRemainingCorrect(page);
  await expect(page.locator('#tl-done-button')).toBeFocused();

  await page.keyboard.down('Enter');
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await expect(page.locator('#ov-time-lab')).not.toHaveClass(/show/);
  expect((await practiceState(page)).active).toBe(false);

  await page.keyboard.down('Enter');
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await expect(page.locator('#ov-time-lab')).not.toHaveClass(/show/);
  expect((await practiceState(page)).active).toBe(false);
  await page.keyboard.up('Enter');
  expectNoErrors(errors);
});

test('practice leaves live authority, live RNG streams, and storage byte-identical', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = watchErrors(page);
  await page.goto('/football/');
  const storageBefore = await storageBytes(page);
  const liveBefore = await liveSemanticSnapshot(page);

  await page.evaluate(() => {
    window.__timeLabIsolation = {
      calls: Object.fromEntries([
        'installRngStreams', 'initGameSession', 'createGameState', 'selectRivalPreview',
        'startQuickGame', 'startSeasonGame', 'startDrive', 'showCallPrompt',
        'planOpponentSnap', 'makeActiveScrimmagePlay', 'makePuntActivePlay',
        'makeFieldGoalActivePlay', 'makeConversionActivePlay', 'commitPendingResolution',
      ].map(name => [name, 0])),
      draws: { football: 0, scheduler: 0, presentation: 0, mathRandom: 0 },
    };
    for (const name of Object.keys(window.__timeLabIsolation.calls)) {
      const original = window[name];
      if (typeof original !== 'function') continue;
      window[name] = function(...args) {
        window.__timeLabIsolation.calls[name]++;
        return original.apply(this, args);
      };
    }
    const originalMathRandom = Math.random;
    Math.random = () => {
      window.__timeLabIsolation.draws.mathRandom++;
      return originalMathRandom();
    };
    window.__footballTest.setRngStreams({
      football: () => { window.__timeLabIsolation.draws.football++; return 0.17; },
      scheduler: () => { window.__timeLabIsolation.draws.scheduler++; return 0.31; },
      presentation: () => { window.__timeLabIsolation.draws.presentation++; return 0.73; },
    });
  });

  await openLab(page);
  await page.locator('#tl-mode-clocks').click();
  await finishRemainingCorrect(page);

  expect(await liveSemanticSnapshot(page)).toBe(liveBefore);
  expect(await storageBytes(page)).toBe(storageBefore);
  expect(await page.evaluate(() => window.__timeLabIsolation)).toEqual({
    calls: {
      installRngStreams: 0,
      initGameSession: 0,
      createGameState: 0,
      selectRivalPreview: 0,
      startQuickGame: 0,
      startSeasonGame: 0,
      startDrive: 0,
      showCallPrompt: 0,
      planOpponentSnap: 0,
      makeActiveScrimmagePlay: 0,
      makePuntActivePlay: 0,
      makeFieldGoalActivePlay: 0,
      makeConversionActivePlay: 0,
      commitPendingResolution: 0,
    },
    draws: { football: 0, scheduler: 0, presentation: 0, mathRandom: 0 },
  });

  await page.locator('#tl-done-button').click();
  expect(await liveSemanticSnapshot(page)).toBe(liveBefore);
  expect(await storageBytes(page)).toBe(storageBefore);
  expectNoErrors(errors);
});

test('a live snap after practice is seed-equivalent to the control path', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const control = page;
  const practice = await page.context().newPage();
  const controlErrors = watchErrors(control);
  const practiceErrors = watchErrors(practice);
  await Promise.all([control.goto('/football/'), practice.goto('/football/')]);

  await Promise.all([control, practice].map(candidate => candidate.evaluate(() => {
    Math.random = () => 0.3141592653;
  })));

  await openLab(practice);
  await startSeededMode(practice, 'mixed', 404);
  await finishRemainingCorrect(practice);
  await practice.locator('#tl-done-button').click();

  await Promise.all([
    control.locator('#start-game-btn').click(),
    practice.locator('#start-game-btn').click(),
  ]);
  await Promise.all([control, practice].map(candidate => expect(candidate.locator('#call-grid')).toBeVisible()));
  await Promise.all([control, practice].map(candidate => (
    candidate.locator('#call-grid .call-btn').filter({ hasText: 'Short Run' }).first().click()
  )));
  await Promise.all([control, practice].map(candidate => expect(candidate.locator('#btn-row')).toBeVisible()));

  const readOutcome = candidate => candidate.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    return {
      opponentSnapshot: contracts.render.opponentSnapshot,
      matchup: contracts.render.matchup,
      familyId: contracts.questionInstance?.familyId,
      concept: contracts.questionInstance?.concept,
      choiceLabels: contracts.questionInstance?.choices.map(choice => choice.label),
      coachReport: contracts.render.coachReport,
      learning: contracts.render.learning,
    };
  });
  expect(await readOutcome(practice)).toEqual(await readOutcome(control));
  expectNoErrors(controlErrors);
  expectNoErrors(practiceErrors);
  await practice.close();
});

test('all mixed visuals stay synchronized with their accessible presentation and honest copy', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = watchErrors(page);
  await page.goto('/football/');
  await openLab(page);
  await startSeededMode(page, 'mixed', 404);
  const visualTypes = new Set();

  while ((await practiceState(page)).status === 'active') {
    const before = await practiceState(page);
    const type = before.current.visualType;
    visualTypes.add(type);
    await expect(page.locator('#tl-visual')).toHaveAttribute('data-visual-type', type);
    await expect(page.locator('#tl-visual')).toHaveAttribute('data-visual-stage', before.current.visualStage);

    if (['analog-clock', 'analog-digital', 'elapsed-clock'].includes(type)) {
      await expect(page.locator('#tl-visual .tl-clock-svg').first()).toBeVisible();
      const aria = await page.locator('#tl-visual').getAttribute('aria-label');
      expect(aria).toContain('practice clock');
      expect(await page.locator('#tl-visual .tl-clock-figure').first().getAttribute('data-time')).toMatch(/^\d{1,2}:(00|30)$/);
    } else if (type === 'calendar-grid') {
      const table = page.locator('#tl-visual table');
      await expect(table).toBeVisible();
      await expect(table.locator('th')).toHaveCount(7);
      await expect(table.locator('td[data-target="true"]')).toHaveCount(1);
      expect(await table.getAttribute('aria-label')).toContain('Practice calendar');
    } else if (type === 'month-ladder') {
      await expect(page.locator('#tl-visual .tl-month-missing')).toHaveText('?');
      expect(await page.locator('#tl-visual').getAttribute('aria-label')).toContain('shown');
    } else if (type === 'day-night') {
      const sourceText = await page.locator('#tl-visual').innerText();
      const sourceAria = await page.locator('#tl-visual').getAttribute('aria-label');
      expect(sourceText).not.toMatch(/\b(?:AM|PM|Morning|Afternoon|Evening|Night)\b/u);
      expect(sourceAria).not.toMatch(/\b(?:AM|PM|Morning|Afternoon|Evening|Night)\b/u);
      expect(sourceText).toContain('__');
      await page.evaluate(() => window.__footballTest.answerPracticeLab('wrong'));
      await page.evaluate(() => window.__footballTest.answerPracticeLab('wrong'));
      await expect(page.locator('#tl-visual')).toHaveAttribute('data-visual-stage', 'worked');
      await expect(page.locator('#tl-visual .tl-digital-time')).toHaveText(/\b(?:AM|PM)$/u);
      await expect(page.locator('#tl-worked')).toBeVisible();
      await page.evaluate(() => window.__footballTest.advancePracticeLab());
      continue;
    }

    await page.evaluate(() => window.__footballTest.answerPracticeLab('correct'));
    await page.evaluate(() => window.__footballTest.advancePracticeLab());
  }

  expect([...visualTypes].sort()).toEqual([
    'analog-clock', 'analog-digital', 'calendar-grid', 'day-night',
    'elapsed-clock', 'month-ladder',
  ]);
  const labCopy = await page.locator('#ov-time-lab').innerText();
  expect(labCopy).toMatch(/Facts read/iu);
  expect(labCopy).toMatch(/Problems solved/iu);
  expect(labCopy).toMatch(/Extra support/iu);
  expect(labCopy).not.toMatch(/Used support|guided or worked support/iu);
  expect(labCopy).not.toMatch(/live snap|coach replay|mastery|grade[- ]level|lifetime|score/iu);
  expectNoErrors(errors);
});

test('Escape retains focus in the lab while Back and Done restore the start entry', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = watchErrors(page);
  await page.goto('/football/');
  await openLab(page);
  await expect(page.locator('#tl-mode-clocks')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  expect(await page.evaluate(() => document.activeElement?.closest('.overlay')?.id)).toBe('ov-time-lab');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('.overlay')?.id)).toBe('ov-time-lab');

  await startSeededMode(page, 'calendar', 2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  await expect.poll(() => (
    page.evaluate(() => document.activeElement?.closest('.overlay')?.id)
  )).toBe('ov-time-lab');
  await page.locator('#tl-back-button').click();
  await expect(page.locator('#tl-open-button')).toBeFocused();

  await openLab(page);
  await startSeededMode(page, 'calendar', 2);
  await finishRemainingCorrect(page);
  await expect(page.locator('#tl-done-button')).toBeFocused();
  await page.locator('#tl-done-button').click();
  await expect(page.locator('#tl-open-button')).toBeFocused();
  expectNoErrors(errors);
});

test('Time Lab controls remain 44pt and representative views stay above the fold', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/football/');
  const startMetrics = await page.evaluate(() => {
    const card = document.querySelector('#ov-start .overlay-card');
    const entry = document.getElementById('tl-open-button');
    const cardBox = card.getBoundingClientRect();
    const entryBox = entry.getBoundingClientRect();
    return {
      viewportHeight: innerHeight,
      pageScrollY: scrollY,
      cardBottom: cardBox.bottom,
      cardClientHeight: card.clientHeight,
      cardScrollHeight: card.scrollHeight,
      entryWidth: entryBox.width,
      entryHeight: entryBox.height,
      entryBottom: entryBox.bottom,
    };
  });
  expect(startMetrics.pageScrollY).toBe(0);
  expect(startMetrics.cardBottom).toBeLessThanOrEqual(startMetrics.viewportHeight + 1);
  expect(startMetrics.cardScrollHeight).toBeLessThanOrEqual(startMetrics.cardClientHeight + 1);
  expect(startMetrics.entryBottom).toBeLessThanOrEqual(startMetrics.viewportHeight + 1);
  expect(startMetrics.entryWidth).toBeGreaterThanOrEqual(44);
  expect(startMetrics.entryHeight).toBeGreaterThanOrEqual(44);
  const scenarios = [
    ['clocks', 1],
    ['calendar', 1],
    ['calendar', 15, 'six-row-calendar'],
    ['mixed', 26],
  ];
  const measureLayout = () => page.evaluate(() => {
    const overlay = document.getElementById('ov-time-lab');
    const card = overlay.querySelector('.tl-card');
    const rect = card.getBoundingClientRect();
    const controls = Array.from(overlay.querySelectorAll('button')).filter(button => (
      !button.hidden && !button.disabled && button.getClientRects().length > 0
    )).map(button => {
      const box = button.getBoundingClientRect();
      return { id: button.id, width: box.width, height: box.height };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageScroll: { x: scrollX, y: scrollY },
      card: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
      },
      controls,
    };
  });
  const expectLayoutToFit = (metrics, label) => {
    expect(metrics.pageScroll, `${label} page scroll`).toEqual({ x: 0, y: 0 });
    expect(metrics.card.top, `${label} card top`).toBeGreaterThanOrEqual(0);
    expect(metrics.card.left, `${label} card left`).toBeGreaterThanOrEqual(0);
    expect(metrics.card.right, `${label} card right`).toBeLessThanOrEqual(metrics.viewport.width + 1);
    expect(metrics.card.bottom, `${label} card bottom`).toBeLessThanOrEqual(metrics.viewport.height + 1);
    expect(metrics.card.scrollHeight, `${label} card overflow`).toBeLessThanOrEqual(metrics.card.clientHeight + 1);
    for (const control of metrics.controls) {
      expect(control.width, `${label} ${control.id} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${label} ${control.id} height`).toBeGreaterThanOrEqual(44);
    }
  };
  for (const [mode, seed, fixtureKind] of scenarios) {
    await openLab(page);
    await startSeededMode(page, mode, seed);
    if (fixtureKind === 'six-row-calendar') {
      const fixture = await page.evaluate(() => {
        const slot = timeLabSession.slots[timeLabSession.index];
        const data = slot.question.visuals.initial.data;
        return {
          id: data.calendar.id,
          year: data.calendar.year,
          monthIndex: data.calendar.monthIndex,
          monthLength: data.calendar.monthLength,
          firstWeekday: data.calendar.firstWeekday,
          cellCount: data.grid.length,
        };
      });
      expect(fixture).toEqual({
        id: 'practice-march-2024',
        year: 2024,
        monthIndex: 2,
        monthLength: 31,
        firstWeekday: 5,
        cellCount: 42,
      });
      await expect(page.locator('#tl-visual tbody tr')).toHaveCount(6);
    }
    expectLayoutToFit(await measureLayout(), `${mode} seed ${seed} initial`);
    if (fixtureKind === 'six-row-calendar') {
      expect(await page.evaluate(() => window.__footballTest.answerPracticeLab('wrong'))).toBe(true);
      await expect(page.locator('#tl-visual')).toHaveAttribute('data-visual-stage', 'guided');
      expectLayoutToFit(await measureLayout(), `${mode} seed ${seed} guided`);
      expect(await page.evaluate(() => window.__footballTest.answerPracticeLab('wrong'))).toBe(true);
      await expect(page.locator('#tl-visual')).toHaveAttribute('data-visual-stage', 'worked');
      await expect(page.locator('#tl-worked')).toBeVisible();
      expectLayoutToFit(await measureLayout(), `${mode} seed ${seed} worked`);
    }
    await page.locator('#tl-back-button').click();
  }
  expectNoErrors(errors);
});

test('reduced-motion preference removes Time Lab control transitions', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/football/');
  await openLab(page);
  expect(await page.locator('#tl-mode-clocks').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
});
