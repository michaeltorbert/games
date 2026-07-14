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

test('defense sees one truthful snap read and the coverage click never rerolls the planned call', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/?boot=defense-call');

  const before = await page.evaluate(() => {
    window.__snapRolls = 0;
    window.__footballTest.setRng(() => {
      window.__snapRolls++;
      return window.__snapRolls === 1 ? 0 : 0.999999;
    });
    showCallPrompt();
    return {
      rolls: window.__snapRolls,
      state: JSON.parse(window.render_game_to_text()),
      expectedWeights: window.__footballTest.getOpponentTendency().weights,
      readHidden: document.getElementById('defense-read').hidden,
    };
  });

  expect(before.rolls).toBe(1);
  expect(before.state.mode).toBe('call');
  expect(before.state.opponentCall).toBeNull();
  expect(before.state.opponentTendency).toBeNull();
  expect(before.state.opponentSnapshot.plannedCallKey).toBe('shortRun');
  expect(before.state.opponentSnapshot.look.key).toBe('spread');
  expect(before.state.opponentSnapshot.look.leanKeys).toContain(before.state.opponentSnapshot.lean.key);
  expect(before.state.opponentSnapshot.weights).toEqual(before.expectedWeights);
  expect(before.readHidden).toBe(false);
  expect(before.state.defenseRead).toContain(before.state.opponentSnapshot.look.label);
  expect(before.state.defenseRead).toContain(before.state.opponentSnapshot.look.alignment);
  expect(before.state.defenseRead).toContain(before.state.opponentSnapshot.lean.label);
  expect(before.state.defenseRead).not.toMatch(/\d|%|short run|long run|short pass|medium pass|long pass/i);
  await expect(page.locator('#defense-read')).toHaveAttribute('aria-live', 'polite');

  await page.locator('#call-grid .call-btn').first().click();
  const afterPick = await page.evaluate(() => ({
    rolls: window.__snapRolls,
    state: JSON.parse(window.render_game_to_text()),
    readHidden: document.getElementById('defense-read').hidden,
  }));
  expect(afterPick.rolls).toBeGreaterThan(1);
  expect(afterPick.state.mode).toBe('question');
  expect(afterPick.state.opponentCall).toBe('shortRun');
  expect(afterPick.state.opponentSnapshot).toBeNull();
  expect(afterPick.state.opponentTendency.weights).toEqual(before.expectedWeights);
  expect(afterPick.state.defenseRead).toBeNull();
  expect(afterPick.readHidden).toBe(true);

  await page.evaluate(() => {
    window.__nextSnapRolls = 0;
    window.__footballTest.setRng(() => {
      window.__nextSnapRolls++;
      return 0.999999;
    });
  });
  const correctIndex = await page.evaluate(() => state.choices.indexOf(state.correct));
  await page.locator(`#b${correctIndex}`).click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 2500 });
  const nextSnap = await page.evaluate(() => ({
    rolls: window.__nextSnapRolls,
    state: JSON.parse(window.render_game_to_text()),
  }));
  // One roll selects the result-copy variant; the second is the next snap's
  // single planned-call sample.
  expect(nextSnap.rolls).toBe(2);
  expect(nextSnap.state.opponentCall).toBeNull();
  expect(nextSnap.state.opponentSnapshot.plannedCallKey).toBe('longPass');
  expect(nextSnap.state.opponentSnapshot.look.key).toBe('spread');
  expect(nextSnap.state.defenseRead).toContain('Spread set');
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
