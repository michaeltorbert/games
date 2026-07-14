import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Pre-snap engine checks run once on the primary target.');
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

const defenseDrive = {
  possession: 'defense',
  direction: -1,
  quarter: 1,
  down: 1,
  yardsToGo: 10,
  yardLine: 80,
  firstDownLine: 70,
  driveStart: 80,
  scores: { player: 0, opponent: 0 },
  plays: 0,
  drivePlays: 0,
};

test('defense sees one truthful snap read and the coverage click never rerolls the planned call', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/?boot=defense-call');

  const before = await page.evaluate((drive) => {
    window.__footballDraws = 0;
    const football = () => {
      window.__footballDraws++;
      return window.__footballDraws === 1 ? 0 : 0.999999;
    };
    const scheduler = () => 0.375;
    const presentation = () => 0.625;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
    window.__footballTest.seedDriveState(drive);
    return {
      footballDraws: window.__footballDraws,
      contracts: window.__footballTest.activeContracts(),
      internalSnapshot: window.__footballTest.opponentSnapshot(),
      expectedWeights: window.__footballTest.getOpponentTendency().weights,
      readHidden: document.getElementById('defense-read').hidden,
    };
  }, defenseDrive);

  expect(before.footballDraws).toBe(1);
  expect(before.contracts.render.mode).toBe('call');
  expect(before.contracts.render.opponentCall).toBeNull();
  expect(before.contracts.render.opponentTendency).toBeNull();
  expect(before.contracts.activeSnap).toBeNull();
  expect(before.contracts.questionInstance).toBeNull();
  expect(before.internalSnapshot.plannedCallKey).toBe('shortRun');
  expect(before.contracts.render.opponentSnapshot.look.key).toBe('spread');
  expect(before.internalSnapshot.look.leanKeys).toContain(before.contracts.render.opponentSnapshot.lean.key);
  expect(before.internalSnapshot.weights).toEqual(before.expectedWeights);
  expect(before.contracts.render.opponentSnapshot).not.toHaveProperty('plannedCallKey');
  expect(before.contracts.render.opponentSnapshot).not.toHaveProperty('weights');
  expect(before.readHidden).toBe(false);
  expect(before.contracts.render.defenseRead).toContain(before.contracts.render.opponentSnapshot.look.label);
  expect(before.contracts.render.defenseRead).toContain(before.contracts.render.opponentSnapshot.look.alignment);
  expect(before.contracts.render.defenseRead).toContain(before.contracts.render.opponentSnapshot.lean.label);
  expect(before.contracts.render.defenseRead).not.toMatch(/\d|%|short run|long run|short pass|medium pass|long pass/i);
  await expect(page.locator('#defense-read')).toHaveAttribute('aria-live', 'polite');

  await page.locator('#call-grid .call-btn').filter({ hasText: 'Run Defense' }).click();
  const afterPick = await page.evaluate(() => ({
    footballDraws: window.__footballDraws,
    contracts: window.__footballTest.activeContracts(),
    readHidden: document.getElementById('defense-read').hidden,
  }));
  expect(afterPick.footballDraws).toBe(2);
  expect(afterPick.contracts.render.mode).toBe('question');
  expect(afterPick.contracts.activeSnap.context.calls).toEqual({
    offense: 'shortRun',
    defense: 'run',
    matchup: 'matched',
  });
  expect(afterPick.contracts.render.opponentSnapshot).toBeNull();
  expect(afterPick.contracts.render.opponentTendency.weights).toEqual(before.expectedWeights);
  expect(afterPick.contracts.render.defenseRead).toBeNull();
  expect(afterPick.readHidden).toBe(true);

  await page.evaluate(() => {
    window.__nextSnapFootballDraws = 0;
    window.__resultPresentationDraws = 0;
    const football = () => {
      window.__nextSnapFootballDraws++;
      return 0.999999;
    };
    const scheduler = () => 0.375;
    const presentation = () => {
      window.__resultPresentationDraws++;
      return 0.625;
    };
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
  });
  const answerResult = await page.evaluate((choiceId) => (
    window.__footballTest.answerChoice(choiceId)
  ), afterPick.contracts.questionInstance.correctChoiceId);
  expect(answerResult).not.toBe(false);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 2500 });
  const nextSnap = await page.evaluate(() => ({
    footballDraws: window.__nextSnapFootballDraws,
    presentationDraws: window.__resultPresentationDraws,
    contracts: window.__footballTest.activeContracts(),
    internalSnapshot: window.__footballTest.opponentSnapshot(),
  }));
  // Result copy belongs to the presentation stream. The football stream draws
  // exactly once for the next snap's planned call.
  expect(nextSnap.presentationDraws).toBeGreaterThan(0);
  expect(nextSnap.footballDraws).toBe(1);
  expect(nextSnap.contracts.render.opponentCall).toBeNull();
  expect(nextSnap.contracts.activeSnap).toBeNull();
  expect(nextSnap.contracts.questionInstance).toBeNull();
  expect(nextSnap.internalSnapshot.plannedCallKey).toBe('longPass');
  expect(nextSnap.contracts.render.opponentSnapshot.look.key).toBe('spread');
  expect(nextSnap.contracts.render.opponentSnapshot).not.toHaveProperty('plannedCallKey');
  expect(nextSnap.contracts.render.defenseRead).toContain('Spread set');
  expect(errors).toEqual([]);
});

test('profile-owned looks cover every qualitative lean and the lean matches final weights', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const profile = FOOTBALL_OPPONENT.PROFILES.balanced;
    const profileLeanKeys = Object.values(profile.looks).flatMap(look => look.leanKeys);
    const customProfile = baseWeights => ({
      ...profile,
      key: 'test-profile',
      baseWeights,
      modifiers: {},
    });
    const snapshots = [
      customProfile({ shortRun: 10, shortPass: 1, longRun: 10, mediumPass: 1, longPass: 1 }),
      customProfile({ shortRun: 1.5, shortPass: 1, longRun: 1.5, mediumPass: 1, longPass: 1 }),
      customProfile({ shortRun: 1, shortPass: 2, longRun: 1, mediumPass: 6, longPass: 6 }),
    ].map(candidate => window.__footballTest.planOpponentSnap({}, candidate, () => 0.5));
    return { profileLeanKeys, snapshots };
  });

  expect([...result.profileLeanKeys].sort()).toEqual(['balanced', 'pass', 'run']);
  for (const snapshot of result.snapshots) {
    expect(snapshot.look.leanKeys).toContain(snapshot.lean.key);
    expect(Object.values(snapshot.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    const difference = snapshot.lean.passWeight - snapshot.lean.runWeight;
    const expectedKey = difference > 0.12 ? 'pass' : difference < -0.12 ? 'run' : 'balanced';
    expect(snapshot.lean.key).toBe(expectedKey);
  }
  expect(result.snapshots.map(snapshot => snapshot.look.key)).toEqual(['tight', 'balanced', 'spread']);
});
