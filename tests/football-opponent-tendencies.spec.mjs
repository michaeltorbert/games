import { test, expect } from '@playwright/test';

const baseState = {
  down: 2,
  ytg: 6,
  yd: 60,
  direction: -1,
  quarter: 2,
  playerScore: 7,
  opponentScore: 7,
  quarterPossessions: 1,
  possessionsPerQuarter: 4,
};

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

async function seedDeterministicDefenseSnap(page) {
  return page.evaluate((drive) => {
    const rolls = [0, 0.999999];
    const football = () => rolls.shift() ?? 0;
    const scheduler = () => 0.375;
    const presentation = () => 0.625;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
    return window.__footballTest.seedDriveState(drive);
  }, defenseDrive);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/football/');
});

test('tendency derivation is pure, inspectable, positive, and normalized', async ({ page }) => {
  const result = await page.evaluate((input) => {
    const frozen = Object.freeze({ ...input });
    const before = JSON.stringify(frozen);
    const tendency = FOOTBALL_OPPONENT.getTendency(frozen, 'balanced');
    const unrelatedLearningState = FOOTBALL_OPPONENT.getTendency({
      ...frozen,
      questionSkill: 'different-skill',
      learningTier: 'different-tier',
      correctAnswers: 99,
    }, 'balanced');
    return {
      before,
      after: JSON.stringify(frozen),
      tendency,
      unrelatedLearningState,
      profileFrozen: Object.isFrozen(FOOTBALL_OPPONENT.PROFILES.balanced),
    };
  }, baseState);

  expect(result.after).toBe(result.before);
  expect(result.profileFrozen).toBe(true);
  expect(result.tendency.profileKey).toBe('balanced');
  expect(result.tendency.context).toMatchObject({
    down: 2,
    distance: 6,
    direction: -1,
    yardsToGoal: 60,
    opponentScoreMargin: 0,
    quarterProgress: 0.25,
    lateGameBoundary: false,
  });
  expect(result.tendency.factors.map(factor => factor.key)).toEqual([
    'down2',
    'mediumDistance',
    'ownTerritory',
    'quarter2',
    'tied',
    'earlyQuarter',
  ]);
  expect(Object.values(result.tendency.weights).every(weight => weight > 0)).toBe(true);
  expect(Object.values(result.tendency.weights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
  expect(result.unrelatedLearningState).toEqual(result.tendency);
});

test('field zone is mirrored through direction-normalized yards to goal', async ({ page }) => {
  const { left, right } = await page.evaluate((input) => ({
    left: FOOTBALL_OPPONENT.getTendency({ ...input, yd: 15, direction: -1 }),
    right: FOOTBALL_OPPONENT.getTendency({ ...input, yd: 85, direction: 1 }),
  }), baseState);

  expect(left.context.yardsToGoal).toBe(15);
  expect(right.context.yardsToGoal).toBe(15);
  expect(left.context.fieldZone).toBe('redZone');
  expect(right.context.fieldZone).toBe('redZone');
  expect(left.weights).toEqual(right.weights);
});

test('short, long, and red-zone situations produce distinct football choices', async ({ page }) => {
  const tendencies = await page.evaluate((input) => ({
    short: FOOTBALL_OPPONENT.getTendency({ ...input, down: 3, ytg: 2 }),
    long: FOOTBALL_OPPONENT.getTendency({ ...input, down: 3, ytg: 12 }),
    midfield: FOOTBALL_OPPONENT.getTendency({ ...input, yd: 50, direction: -1 }),
    redZone: FOOTBALL_OPPONENT.getTendency({ ...input, yd: 15, direction: -1 }),
  }), baseState);

  const shortSafe = tendencies.short.weights.shortRun + tendencies.short.weights.shortPass;
  const longSafe = tendencies.long.weights.shortRun + tendencies.long.weights.shortPass;
  const shortDeep = tendencies.short.weights.mediumPass + tendencies.short.weights.longPass;
  const longDeep = tendencies.long.weights.mediumPass + tendencies.long.weights.longPass;
  expect(shortSafe).toBeGreaterThan(longSafe);
  expect(longDeep).toBeGreaterThan(shortDeep);
  expect(tendencies.redZone.weights.longPass).toBeLessThan(tendencies.midfield.weights.longPass);
  expect(tendencies.redZone.context.fieldZone).toBe('redZone');
});

test('fourth-quarter boundary catches up when behind and protects a lead', async ({ page }) => {
  const tendencies = await page.evaluate((input) => ({
    catchUp: FOOTBALL_OPPONENT.getTendency({
      ...input,
      quarter: 4,
      quarterPossessions: 3,
      playerScore: 21,
      opponentScore: 7,
    }),
    protect: FOOTBALL_OPPONENT.getTendency({
      ...input,
      quarter: 4,
      quarterPossessions: 3,
      playerScore: 7,
      opponentScore: 21,
    }),
  }), baseState);

  expect(tendencies.catchUp.context.lateGameBoundary).toBe(true);
  expect(tendencies.protect.context.lateGameBoundary).toBe(true);
  expect(tendencies.catchUp.factors.at(-1).key).toBe('lateGameCatchUp');
  expect(tendencies.protect.factors.at(-1).key).toBe('lateGameProtectLead');
  const catchUpPass = tendencies.catchUp.weights.mediumPass + tendencies.catchUp.weights.longPass;
  const protectPass = tendencies.protect.weights.mediumPass + tendencies.protect.weights.longPass;
  const catchUpRun = tendencies.catchUp.weights.shortRun + tendencies.catchUp.weights.longRun;
  const protectRun = tendencies.protect.weights.shortRun + tendencies.protect.weights.longRun;
  expect(catchUpPass).toBeGreaterThan(protectPass);
  expect(protectRun).toBeGreaterThan(catchUpRun);
});

test('pickCall handles deterministic RNG interval boundaries', async ({ page }) => {
  const picks = await page.evaluate(() => {
    const weights = Object.fromEntries(FOOTBALL_OPPONENT.CALL_KEYS.map(key => [key, 1]));
    return [0, 0.199999, 0.2, 0.399999, 0.4, 0.999999, 1].map(value =>
      FOOTBALL_OPPONENT.pickCall(weights, () => value)
    );
  });

  expect(picks).toEqual([
    'shortRun',
    'shortRun',
    'shortPass',
    'shortPass',
    'longRun',
    'longPass',
    'longPass',
  ]);
});

test('coverage selection stores its tendency and preserves matchup gain multipliers', async ({ page }) => {
  await page.goto('/football/?boot=defense-call');
  await seedDeterministicDefenseSnap(page);
  await page.locator('#call-grid .call-btn').filter({ hasText: 'Run Defense' }).click();
  const matched = await page.evaluate(() => window.__footballTest.activeContracts());

  expect(matched.render.mode).toBe('question');
  expect(matched.activeSnap.context.calls).toEqual({
    offense: 'shortRun',
    defense: 'run',
    matchup: 'matched',
  });
  expect(matched.activeSnap.proposal.appliedGain).toBe(3);
  expect(matched.render.opponentTendency.context).toMatchObject({
    down: 1,
    distance: 10,
    direction: -1,
    yardsToGoal: 80,
  });
  expect(matched.questionInstance.familyId).toBeTruthy();
  expect(matched.questionInstance.contextId).toBe(matched.activeSnap.contextId);

  await page.goto('/football/?boot=defense-call');
  await seedDeterministicDefenseSnap(page);
  await page.locator('#call-grid .call-btn').filter({ hasText: 'Short Pass D' }).click();
  const mismatch = await page.evaluate(() => window.__footballTest.activeContracts());
  expect(mismatch.activeSnap.context.calls).toEqual({
    offense: 'shortRun',
    defense: 'shortPass',
    matchup: 'mismatch',
  });
  expect(mismatch.activeSnap.proposal.appliedGain).toBe(5);
});
