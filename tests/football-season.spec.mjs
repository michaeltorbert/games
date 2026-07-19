import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'footballMathSeason:v1';
const SCHEDULE = ['unc', 'nc-state', 'wake-forest'];
const UNCONFIRMED_RESULT_COPY = 'This game’s Season result could not be confirmed. This device’s saved Season is unchanged by this game.';

function primaryOnly(testInfo) {
  test.skip(
    testInfo.project.name !== 'ipad-11-landscape',
    'Focused season lifecycle checks run once on the primary target.',
  );
}

function rawResult(gameNumber, playerScore, opponentScore, gameId = `stored-game-${gameNumber}`) {
  return {
    gameNumber,
    gameId,
    rivalId: SCHEDULE[gameNumber - 1],
    playerScore,
    opponentScore,
    completedAt: `2026-07-${String(18 + gameNumber).padStart(2, '0')}T12:00:00.000Z`,
  };
}

function rawSeason(results = [], seasonId = 'season-browser-fixture') {
  return JSON.stringify({
    schemaVersion: 1,
    currentSeason: {
      seasonId,
      formatId: 'three-rival-schedule-v1',
      playerId: 'duke',
      createdAt: '2026-07-19T12:00:00.000Z',
      schedule: SCHEDULE,
      results,
    },
  });
}

async function replaceSeasonStorage(page, raw) {
  await page.evaluate(({ key, value }) => {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: raw });
  await page.reload();
}

async function startSeasonFromEmpty(page) {
  await page.goto('/football/');
  await replaceSeasonStorage(page, null);
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
}

async function storedResults(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw).currentSeason.results : [];
  }, STORAGE_KEY);
}

async function answerCorrect(page) {
  const result = await page.evaluate(() => window.__footballTest.answerChoice('correct'));
  expect(result).not.toBe(false);
}

test('Quick Game preserves exact season bytes while start controls and semantic output stay public', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');
  const original = rawSeason([rawResult(1, 7, 7)]);
  await replaceSeasonStorage(page, original);

  const seasonMode = page.getByRole('radio', { name: /3-Game Season/ });
  await expect(seasonMode).toBeChecked();
  await expect(seasonMode).toBeFocused();
  await expect(page.locator('#season-progress')).toHaveText('Game 2 of 3');
  await expect(page.locator('#season-record')).toHaveText('0 wins · 0 losses · 1 tie');
  await expect(page.locator('#season-next')).toContainText('NC State');
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 2');

  const semantic = await page.evaluate(() => JSON.parse(render_game_to_text()));
  expect(semantic.playMode).toBe('season');
  expect(semantic.season).toEqual({
    mode: 'season',
    gameNumber: 2,
    rungStatuses: ['tie', 'next', 'open'],
    record: { wins: 0, losses: 0, ties: 1 },
    nextRivalId: 'nc-state',
    complete: false,
    saveState: 'saved',
  });
  expect(JSON.stringify(semantic)).not.toContain('season-browser-fixture');
  expect(JSON.stringify(semantic)).not.toContain('stored-game-1');
  expect(JSON.stringify(semantic)).not.toContain('completedAt');

  await page.evaluate(() => {
    window.__seasonPreviewDraws = { football: 0, scheduler: 0, presentation: 0 };
    window.__footballTest.setRngStreams({
      football: () => { window.__seasonPreviewDraws.football++; return 0.2; },
      scheduler: () => { window.__seasonPreviewDraws.scheduler++; return 0.3; },
      presentation: () => { window.__seasonPreviewDraws.presentation++; return 0.4; },
    });
  });
  await page.getByRole('radio', { name: /Quick Game/ }).check();
  await page.locator('input[name="rival"][value="wake-forest"]').check();
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.getByRole('radio', { name: /Quick Game/ }).check();
  expect(await page.evaluate(() => window.__seasonPreviewDraws)).toEqual({
    football: 0, scheduler: 0, presentation: 0,
  });

  await page.locator('#start-game-btn').click();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).match.opponent.id)).toBe('wake-forest');
  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'offense', direction: 1, quarter: 4,
    down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
    scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
  }));
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await answerCorrect(page);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(original);
  await page.locator('#ov-end-btn').click();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(original);
  await expect(page.getByRole('radio', { name: /Quick Game/ })).toBeChecked();
});

test('an abandoned rung reopens with a new game ID and W-L-T results advance the fixed schedule', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await startSeasonFromEmpty(page);
  const firstBinding = await page.evaluate(() => window.__footballTest.activeSeasonGame());
  expect(firstBinding).toMatchObject({ gameNumber: 1, rivalId: 'unc' });
  expect(await storedResults(page)).toHaveLength(0);

  await page.reload();
  await expect(page.getByRole('radio', { name: /3-Game Season/ })).toBeChecked();
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  await page.locator('#start-game-btn').click();
  const replayBinding = await page.evaluate(() => window.__footballTest.activeSeasonGame());
  expect(replayBinding).toMatchObject({ gameNumber: 1, rivalId: 'unc' });
  expect(replayBinding.gameId).not.toBe(firstBinding.gameId);

  const outcomes = [
    { playerScore: 14, opponentScore: 7 },
    { playerScore: 0, opponentScore: 3 },
    { playerScore: 10, opponentScore: 10 },
  ];
  for (let index = 0; index < outcomes.length; index++) {
    const settled = await page.evaluate(async (scores) => {
      const result = await FOOTBALL_SEASON.settleGame(activeSeasonBinding, scores);
      return result.status;
    }, outcomes[index]);
    expect(settled).toBe('saved');
    await page.evaluate(() => restart('season'));
    if (index < outcomes.length - 1) {
      await expect(page.locator('#start-game-btn')).toHaveText(`Play Game ${index + 2}`);
      await page.locator('#start-game-btn').click();
      const binding = await page.evaluate(() => window.__footballTest.activeSeasonGame());
      expect(binding).toMatchObject({
        gameNumber: index + 2,
        rivalId: SCHEDULE[index + 1],
      });
    }
  }

  await expect(page.locator('#season-progress')).toHaveText('Season complete');
  await expect(page.locator('#season-record')).toHaveText('1 win · 1 loss · 1 tie');
  await expect(page.locator('#start-game-btn')).toHaveText('Start New Season');
  expect(await page.locator('.season-rung').evaluateAll(rows => rows.map(row => row.dataset.status)))
    .toEqual(['win', 'loss', 'tie']);
  const completedId = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).currentSeason.seasonId, STORAGE_KEY);

  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toMatchObject({
    gameNumber: 1,
    rivalId: 'unc',
  });
  const newSeason = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).currentSeason, STORAGE_KEY);
  expect(newSeason.seasonId).not.toBe(completedId);
  expect(newSeason.results).toEqual([]);
});

test('a queued Season start cannot replace a Quick Game started while its real Web Lock is held', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/football/');
  await replaceSeasonStorage(page, null);
  const lockName = await page.evaluate(() => FOOTBALL_SEASON.STORAGE_LOCK_NAME);

  await page.evaluate((name) => {
    let release;
    const held = new Promise(resolve => { release = resolve; });
    window.__releaseSeasonCreateLock = release;
    window.__heldSeasonCreateLock = navigator.locks.request(name, { mode: 'exclusive' }, async () => {
      window.__seasonCreateLockHeld = true;
      await held;
    });
  }, lockName);
  await expect.poll(() => page.evaluate(() => window.__seasonCreateLockHeld === true)).toBe(true);

  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.locator('#start-game-btn').click();
  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBe('create');
  await expect.poll(() => page.evaluate(async (name) => {
    const current = await navigator.locks.query();
    return {
      held: current.held.filter(lock => lock.name === name).length,
      pending: current.pending.filter(lock => lock.name === name).length,
    };
  }, lockName)).toEqual({ held: 1, pending: 1 });
  await expect(page.locator('#season-progress')).toHaveText('Game 1 of 3');

  await page.getByRole('radio', { name: /Quick Game/ }).check();
  await expect(page.locator('#start-game-btn')).toHaveText('Start Game');
  await expect(page.locator('#start-game-btn')).toBeEnabled();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toBeNull();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).playMode)).toBe('quick');
  await expect.poll(() => page.evaluate(async (name) => {
    const current = await navigator.locks.query();
    return current.pending.filter(lock => lock.name === name).length;
  }, lockName)).toBe(1);

  await page.evaluate(() => window.__releaseSeasonCreateLock());
  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBeNull();
  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().status)).toBe('active');
  await page.evaluate(() => window.__heldSeasonCreateLock);
  await page.waitForTimeout(50);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toBeNull();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).playMode)).toBe('quick');

  const createdRaw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const created = JSON.parse(createdRaw).currentSeason;
  expect(created.schedule).toEqual(SCHEDULE);
  expect(created.results).toEqual([]);

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'offense', direction: 1, quarter: 4,
    down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
    scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
  }));
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await answerCorrect(page);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(createdRaw);
  await page.locator('#ov-end-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);

  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await expect(page.locator('#season-progress')).toHaveText('Game 1 of 3');
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'start');
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(createdRaw);
  expect(pageErrors).toEqual([]);
});

test('malformed, future, and failed creation states keep Quick Game available and require explicit recovery', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');

  await replaceSeasonStorage(page, '{"schemaVersion":1,"currentSeason":{"broken":true}}');
  await expect(page.getByRole('radio', { name: /3-Game Season/ })).toBeChecked();
  await expect(page.locator('#season-progress')).toHaveText('Season unavailable');
  await expect(page.locator('#start-game-btn')).toHaveText('Start Fresh Season');
  await expect(page.locator('#season-status')).toContainText('needs a fresh start');
  await page.getByRole('radio', { name: /Quick Game/ }).check();
  await expect(page.locator('#start-game-btn')).toBeEnabled();

  const future = '{\n  "schemaVersion": 77,\n  "doNotTouch": true\n}\n';
  await replaceSeasonStorage(page, future);
  await expect(page.getByRole('radio', { name: /3-Game Season/ })).toBeChecked();
  await expect(page.locator('#season-progress')).toHaveText('Season unavailable');
  await expect(page.locator('#start-game-btn')).toHaveText('Season Unavailable');
  await expect(page.locator('#start-game-btn')).toBeDisabled();
  await expect(page.locator('#season-status')).toContainText('newer game version');
  await page.getByRole('radio', { name: /Quick Game/ }).check();
  await page.locator('#start-game-btn').click();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(future);

  await replaceSeasonStorage(page, null);
  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__allowSeasonWrite = false;
    Storage.prototype.setItem = function(name, value) {
      if (name === key && !window.__allowSeasonWrite) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
  }, STORAGE_KEY);
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#season-progress')).toHaveText('Game 1 of 3');
  await expect(page.locator('#start-game-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#season-status')).toContainText('could not be saved');
  await page.getByRole('radio', { name: /Quick Game/ }).check();
  await expect(page.locator('#start-game-btn')).toHaveText('Start Game');
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.evaluate(() => { window.__allowSeasonWrite = true; });
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
});

test('a storage read failure disables only Season and never attempts a season write', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');
  await replaceSeasonStorage(page, null);
  await page.evaluate((key) => {
    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;
    window.__seasonReadFailureWrites = 0;
    Storage.prototype.getItem = function(name) {
      if (name === key) throw new DOMException('blocked', 'SecurityError');
      return nativeGetItem.call(this, name);
    };
    Storage.prototype.setItem = function(name, value) {
      if (name === key) window.__seasonReadFailureWrites++;
      return nativeSetItem.call(this, name, value);
    };
  }, STORAGE_KEY);

  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await expect(page.locator('#season-progress')).toHaveText('Season unavailable');
  await expect(page.locator('#start-game-btn')).toHaveText('Season Unavailable');
  await expect(page.locator('#start-game-btn')).toBeDisabled();
  await expect(page.locator('#season-status')).toContainText('not available');
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).season.saveState)).toBe('unavailable');
  expect(await page.evaluate(() => window.__seasonReadFailureWrites)).toBe(0);

  await page.getByRole('radio', { name: /Quick Game/ }).check();
  await expect(page.locator('#start-game-btn')).toBeEnabled();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  expect(await page.evaluate(() => window.__seasonReadFailureWrites)).toBe(0);
});

test('the last-quarter touchdown settles only after its conversion and presentation seams never settle again', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await startSeasonFromEmpty(page);
  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__seasonResultWrites = 0;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) window.__seasonResultWrites++;
      return nativeSetItem.call(this, name, value);
    };
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100, driveStart: 99,
      scores: { player: 14, opponent: 14 }, quarterPossessions: 3,
    });
  }, STORAGE_KEY);

  await page.locator('#call-grid .call-btn').first().click();
  await answerCorrect(page);
  expect(await storedResults(page)).toHaveLength(0);
  expect(await page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBeNull();
  await expect(page.locator('#ov-td')).toHaveClass(/show/);
  expect(await storedResults(page)).toHaveLength(0);

  await page.locator('#ov-td-btn').click();
  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  expect(await storedResults(page)).toHaveLength(0);
  await answerCorrect(page);
  await expect.poll(() => storedResults(page)).toHaveLength(1);
  expect(await page.evaluate(() => window.__seasonResultWrites)).toBe(1);
  expect((await storedResults(page))[0]).toMatchObject({
    gameNumber: 1,
    rivalId: 'unc',
    playerScore: 21,
    opponentScore: 14,
  });

  await page.evaluate(() => {
    showGameOver();
    routePossessionPresentation('Presentation only.');
    finishPossession('Legacy presentation only.');
    showGameOver();
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__seasonResultWrites)).toBe(1);
  expect(await storedResults(page)).toHaveLength(1);
});

test('terminal conversions settle once for player two-point and opponent PAT or two-point choices', async ({ page }, testInfo) => {
  primaryOnly(testInfo);

  await startSeasonFromEmpty(page);
  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__seasonResultWrites = 0;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) window.__seasonResultWrites++;
      return nativeSetItem.call(this, name, value);
    };
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100, driveStart: 99,
      scores: { player: 14, opponent: 14 }, quarterPossessions: 3,
    });
  }, STORAGE_KEY);
  await page.locator('#call-grid .call-btn').first().click();
  await answerCorrect(page);
  await expect(page.locator('#ov-td')).toHaveClass(/show/);
  await page.locator('#ov-td-btn').click();
  await page.locator('#decision-grid .decision-btn[data-action="twoPoint"]').click();
  expect(await storedResults(page)).toHaveLength(0);
  await answerCorrect(page);
  await expect.poll(() => storedResults(page)).toHaveLength(1);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  expect((await storedResults(page))[0]).toMatchObject({
    gameNumber: 1,
    rivalId: 'unc',
    playerScore: 22,
    opponentScore: 14,
  });
  expect(await page.evaluate(() => window.__seasonResultWrites)).toBe(1);

  const opponentScenarios = [
    {
      attemptType: 'pat',
      initialScores: { player: 14, opponent: 14 },
      finalScores: { playerScore: 14, opponentScore: 20 },
    },
    {
      attemptType: 'twoPoint',
      initialScores: { player: 22, opponent: 14 },
      finalScores: { playerScore: 22, opponentScore: 20 },
    },
  ];

  for (const scenario of opponentScenarios) {
    await startSeasonFromEmpty(page);
    await page.evaluate(({ key, initialScores }) => {
      const nativeSetItem = Storage.prototype.setItem;
      window.__seasonResultWrites = 0;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) window.__seasonResultWrites++;
        return nativeSetItem.call(this, name, value);
      };
      window.__footballTest.seedDriveState({
        possession: 'defense', direction: -1, quarter: 4,
        down: 1, yardsToGo: 1, yardLine: 1, firstDownLine: 0, driveStart: 1,
        scores: initialScores, quarterPossessions: 3,
      });
      window.__footballTest.setQuestionFault('empty-pool');
    }, { key: STORAGE_KEY, initialScores: scenario.initialScores });
    await page.locator('#call-grid .call-btn').first().click();
    await expect(page.locator('#ov-td')).toHaveClass(/show/);
    expect(await storedResults(page)).toHaveLength(0);
    await page.evaluate(() => window.__footballTest.setQuestionFault(null));
    await page.locator('#ov-td-btn').click();
    await expect.poll(() => page.evaluate(() => (
      window.__footballTest.activeContracts().activePlay?.context?.attemptType || null
    ))).toBe(scenario.attemptType);
    expect(await storedResults(page)).toHaveLength(0);
    await answerCorrect(page);
    await expect.poll(() => storedResults(page)).toHaveLength(1);
    await expect(page.locator('#ov-end')).toHaveClass(/show/);
    expect((await storedResults(page))[0]).toMatchObject({
      gameNumber: 1,
      rivalId: 'unc',
      ...scenario.finalScores,
    });
    expect(await page.evaluate(() => window.__seasonResultWrites)).toBe(1);
  }
});

test('a terminal binding mismatch never claims the active Season final was saved', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await startSeasonFromEmpty(page);
  const binding = await page.evaluate(() => window.__footballTest.activeSeasonGame());
  await page.evaluate(() => window.__footballTest.seedDriveState({
    gameId: 'mismatched-live-game',
    possession: 'offense', direction: 1, quarter: 4,
    down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
    scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
  }));

  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await answerCorrect(page);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBeNull();
  expect(await storedResults(page)).toEqual([]);
  expect(await page.evaluate(() => FOOTBALL_SEASON.hasExactSavedResult(activeSeasonBinding, {
    playerScore: state.playerScore,
    opponentScore: state.opponentScore,
  }))).toBe(false);
  await expect(page.locator('#ov-end-season')).toHaveText(UNCONFIRMED_RESULT_COPY);
  await expect(page.locator('#ov-end-season')).not.toContainText('Game 1 saved');
  await expect(page.locator('#ov-end-season')).not.toContainText('Season complete');
  await expect(page.locator('#ov-end-btn')).toHaveText('Continue Season');
  await expect(page.locator('#ov-end-quick-btn')).toBeHidden();

  await page.evaluate(() => {
    showGameOver();
    routePossessionPresentation('Presentation only.');
    finishPossession('Legacy presentation only.');
    showGameOver();
  });
  await page.waitForTimeout(50);
  expect(await storedResults(page)).toEqual([]);
  expect(await page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBeNull();
  await expect(page.locator('#ov-end-season')).toHaveText(UNCONFIRMED_RESULT_COPY);

  await page.locator('#ov-end-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.getByRole('radio', { name: /3-Game Season/ })).toBeChecked();
  await expect(page.locator('#season-progress')).toHaveText('Game 1 of 3');
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  expect(await page.locator('.season-rung').evaluateAll(rows => rows.map(row => row.dataset.status)))
    .toEqual(['next', 'open', 'open']);
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toBeNull();
  expect(await storedResults(page)).toEqual([]);
  expect(binding.gameId).not.toBe('mismatched-live-game');
  expect(pageErrors).toEqual([]);
});

test('a terminal punt keeps one pending result, exposes recovery actions, and retries through the locked write path', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await startSeasonFromEmpty(page);
  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__allowSeasonResultWrite = false;
    window.__seasonResultWriteAttempts = 0;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) {
        window.__seasonResultWriteAttempts++;
        if (!window.__allowSeasonResultWrite) throw new DOMException('blocked', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, name, value);
    };
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
      scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
    });
  }, STORAGE_KEY);

  await expect(page.locator('#decision-grid .decision-btn[data-action="punt"]')).toBeVisible();
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await answerCorrect(page);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  await expect(page.locator('#ov-end-season')).toContainText(
    'Not saved—closing or reloading will lose this game’s season result.',
  );
  await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#ov-end-quick-btn')).toBeVisible();
  await expect(page.locator('#ov-end-btn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#ov-end-quick-btn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#ov-end-btn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#ov-end-quick-btn')).toBeFocused();
  expect(await storedResults(page)).toHaveLength(0);
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).season)).toMatchObject({
    mode: 'season',
    gameNumber: 1,
    rungStatuses: ['pending', 'open', 'open'],
    saveState: 'pending',
  });

  const attemptsBeforeRetry = await page.evaluate(() => window.__seasonResultWriteAttempts);
  await page.evaluate(() => { window.__allowSeasonResultWrite = true; });
  const retryOutcomes = await page.evaluate(() => Promise.all([
    handleEndPrimaryAction(),
    handleEndPrimaryAction(),
  ]));
  expect(retryOutcomes).toEqual([true, false]);
  await expect.poll(() => storedResults(page)).toHaveLength(1);
  expect(await page.evaluate(() => window.__seasonResultWriteAttempts)).toBe(attemptsBeforeRetry + 1);
  await expect(page.locator('#ov-end-btn')).toHaveText('Continue Season');
  await expect(page.locator('#ov-end-quick-btn')).toBeHidden();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 2');
  expect((await storedResults(page))[0]).toMatchObject({
    gameNumber: 1,
    rivalId: 'unc',
    playerScore: 3,
    opponentScore: 7,
  });
});

test('pending finals keep exact incompatible bytes and explain future or damaged recovery honestly', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const incompatibleScenarios = [
    {
      status: 'future',
      raw: '{\n  "schemaVersion": 99,\n  "newer": { "preserve": true }\n}\n',
      cause: 'newer game version',
      recovery: 'Reloading loses this result',
    },
    {
      status: 'corrupt',
      raw: '{\n  "schemaVersion": 1,\n  "currentSeason": { "broken": true }\n}\n',
      cause: 'damaged or changed',
      recovery: 'Start Fresh after reloading only if needed; this result will be lost',
    },
  ];

  for (const scenario of incompatibleScenarios) {
    await startSeasonFromEmpty(page);
    await page.evaluate((key) => {
      const nativeSetItem = Storage.prototype.setItem;
      window.__nativeSeasonSetItem = nativeSetItem;
      window.__seasonResultWriteAttempts = 0;
      Storage.prototype.setItem = function(name, value) {
        if (name === key) {
          window.__seasonResultWriteAttempts++;
          throw new DOMException('blocked', 'QuotaExceededError');
        }
        return nativeSetItem.call(this, name, value);
      };
      window.__footballTest.seedDriveState({
        possession: 'offense', direction: 1, quarter: 4,
        down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
        scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
      });
    }, STORAGE_KEY);
    await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
    await answerCorrect(page);
    await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
    const attemptsBeforeIncompatible = await page.evaluate(() => window.__seasonResultWriteAttempts);

    await page.evaluate(({ key, value }) => {
      window.__nativeSeasonSetItem.call(localStorage, key, value);
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: value,
        storageArea: localStorage,
      }));
    }, { key: STORAGE_KEY, value: scenario.raw });
    await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().status)).toBe(scenario.status);
    await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBe('result');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(scenario.raw);
    expect(await page.evaluate(() => window.__seasonResultWriteAttempts)).toBe(attemptsBeforeIncompatible);
    await expect(page.locator('#ov-end-season')).toContainText(
      'Not saved—closing or reloading will lose this game’s season result.',
    );
    await expect(page.locator('#ov-end-season')).toContainText(scenario.cause);
    await expect(page.locator('#ov-end-season')).toContainText(scenario.recovery);
    await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
    await expect(page.locator('#ov-end-quick-btn')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).season)).toMatchObject({
      mode: 'season',
      gameNumber: 1,
      rungStatuses: ['pending', 'open', 'open'],
      saveState: 'pending',
    });

    await page.locator('#ov-end-btn').click();
    await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(scenario.raw);
    expect(await page.evaluate(() => window.__seasonResultWriteAttempts)).toBe(attemptsBeforeIncompatible);

    await page.locator('#ov-end-quick-btn').click();
    await expect(page.locator('#ov-start')).toHaveClass(/show/);
    expect(await page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBe('result');
    await page.getByRole('radio', { name: /3-Game Season/ }).check();
    await expect(page.locator('#season-progress')).toHaveText('Season unavailable');
    await expect(page.locator('#start-game-btn')).toHaveText('Retry Saving');
    expect(await page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBe('result');
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).season)).toMatchObject({
      mode: 'season',
      gameNumber: null,
      rungStatuses: ['pending', 'open', 'open'],
      saveState: 'pending',
    });
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(scenario.raw);
    expect(await page.evaluate(() => window.__seasonResultWriteAttempts)).toBe(attemptsBeforeIncompatible);
  }
});

test('a competing final cannot confirm the local result after transient conflict notice clears', async ({ page, context }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');
  const firstTwo = rawSeason([
    rawResult(1, 7, 0, 'completed-game-1'),
    rawResult(2, 0, 7, 'completed-game-2'),
  ]);
  await replaceSeasonStorage(page, firstTwo);
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toMatchObject({
    gameNumber: 3,
    rivalId: 'wake-forest',
  });
  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 4, yardsToGo: 10, yardLine: 20, firstDownLine: 30, driveStart: 20,
      scores: { player: 0, opponent: 0 }, quarterPossessions: 3,
    });
  }, STORAGE_KEY);
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
  await answerCorrect(page);
  await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');

  const other = await context.newPage();
  await other.goto('/football/');
  await other.evaluate(({ key, result }) => {
    const store = JSON.parse(localStorage.getItem(key));
    store.currentSeason.results.push(result);
    localStorage.setItem(key, JSON.stringify(store));
  }, { key: STORAGE_KEY, result: rawResult(3, 2, 0, 'remote-first-writer') });

  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.pendingKind())).toBeNull();
  await expect(page.locator('#ov-end-season')).toContainText('Another tab updated this season');
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).season.saveState)).toBe('conflict');
  expect((await storedResults(page))[2]).toMatchObject({
    gameId: 'remote-first-writer',
    playerScore: 2,
    opponentScore: 0,
  });

  await page.evaluate((key) => window.dispatchEvent(new StorageEvent('storage', {
    key,
    newValue: localStorage.getItem(key),
    storageArea: localStorage,
  })), STORAGE_KEY);
  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().saveState)).toBe('saved');
  await expect(page.locator('#ov-end-season')).toHaveText(UNCONFIRMED_RESULT_COPY);
  await expect(page.locator('#ov-end-season')).not.toContainText('Game 3 saved');
  await expect(page.locator('#ov-end-season')).not.toContainText('Season complete');
  expect(await page.evaluate(() => FOOTBALL_SEASON.hasExactSavedResult(activeSeasonBinding, {
    playerScore: state.playerScore,
    opponentScore: state.opponentScore,
  }))).toBe(false);

  const completedRaw = await other.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const completedSeasonId = JSON.parse(completedRaw).currentSeason.seasonId;
  await other.reload();
  await expect(other.locator('#season-progress')).toHaveText('Season complete');
  await expect(other.locator('#start-game-btn')).toHaveText('Start New Season');
  await other.locator('#start-game-btn').click();
  await expect(other.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  const newRaw = await other.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const newSeason = JSON.parse(newRaw).currentSeason;
  expect(newSeason.seasonId).not.toBe(completedSeasonId);
  expect(newSeason.results).toEqual([]);

  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().gameNumber)).toBe(1);
  await expect(page.locator('#ov-end-season')).toHaveText(UNCONFIRMED_RESULT_COPY);
  await expect(page.locator('#ov-end-season')).not.toContainText('Game 3 saved');
  await expect(page.locator('#ov-end-season')).not.toContainText('Season complete');
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(newRaw);

  await page.locator('#ov-end-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#season-progress')).toHaveText('Game 1 of 3');
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  expect(await page.locator('.season-rung').evaluateAll(rows => rows.map(row => row.dataset.status)))
    .toEqual(['next', 'open', 'open']);
  expect(await page.evaluate(() => window.__footballTest.activeSeasonGame())).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(newRaw);
  expect(await storedResults(page)).toEqual([]);
  expect(JSON.parse(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).currentSeason.seasonId)
    .toBe(newSeason.seasonId);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toBe(completedRaw);
  await other.close();
});
