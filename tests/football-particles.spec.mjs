import { test, expect } from '@playwright/test';

async function openGame(page, reducedMotion = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.goto('/football/?boot=offense-call');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
}

async function installDeterministicStreams(page, footballRoll = 0) {
  await page.evaluate((roll) => {
    const football = () => roll;
    const scheduler = () => 0.25;
    const presentation = () => 0.5;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
  }, footballRoll);
}

async function seedDrive(page, {
  possession = 'offense',
  yardLine = possession === 'offense' ? 20 : 70,
  firstDownLine = possession === 'offense' ? 30 : 60,
} = {}) {
  const direction = possession === 'offense' ? 1 : -1;
  await page.evaluate((drive) => window.__footballTest.seedDriveState(drive), {
    possession,
    direction,
    quarter: 1,
    down: 1,
    yardsToGo: Math.abs(firstDownLine - yardLine),
    yardLine,
    firstDownLine,
    driveStart: yardLine,
    scores: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
  });
}

async function chooseCall(page, label) {
  const button = page.locator('#call-grid .call-btn').filter({ hasText: label }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const contracts = await page.evaluate(() => window.__footballTest.activeContracts());
  expect(contracts.activeSnap).not.toBeNull();
  expect(contracts.questionInstance).not.toBeNull();
  return contracts;
}

async function answerChoice(page, choiceId) {
  const contracts = await page.evaluate((id) => window.__footballTest.answerChoice(id), choiceId);
  expect(contracts).not.toBe(false);
  return contracts;
}

async function runOffenseGain(page, {
  call = 'Short Run',
  footballRoll = 0,
  yardLine = 20,
  firstDownLine = 30,
} = {}) {
  await page.locator('.field-particle').evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await installDeterministicStreams(page, footballRoll);
  await seedDrive(page, { yardLine, firstDownLine });
  const before = await chooseCall(page, call);
  const proposal = before.activeSnap.proposal;
  const after = await answerChoice(page, before.questionInstance.correctChoiceId);
  expect(after.render.plays).toBe(1);
  return {
    count: await page.locator('.field-particle').count(),
    gain: proposal.appliedGain,
    gotFirstDown: proposal.resultKind === 'firstDown',
    isTouchdown: proposal.resultKind === 'touchdown',
  };
}

test('particles are limited to explosive offense plays and clean up', async ({ page }) => {
  await openGame(page);

  expect(await runOffenseGain(page)).toEqual({
    count: 0,
    gain: 2,
    gotFirstDown: false,
    isTouchdown: false,
  });

  expect(await runOffenseGain(page, { call: 'Medium Pass' })).toMatchObject({
    count: 5,
    gain: 8,
    gotFirstDown: false,
    isTouchdown: false,
  });
  await page.waitForTimeout(560);
  await expect(page.locator('.field-particle')).toHaveCount(5);
  await page.waitForTimeout(140);
  await expect(page.locator('.field-particle')).toHaveCount(0);

  expect(await runOffenseGain(page, { yardLine: 28, firstDownLine: 30 })).toMatchObject({
    count: 5,
    gain: 2,
    gotFirstDown: true,
    isTouchdown: false,
  });

  expect(await runOffenseGain(page, { yardLine: 98, firstDownLine: 100 })).toMatchObject({
    count: 5,
    gain: 2,
    gotFirstDown: false,
    isTouchdown: true,
  });

  await page.locator('.field-particle').evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await installDeterministicStreams(page);
  await seedDrive(page, { possession: 'defense' });
  const defense = await chooseCall(page, 'Run Defense');
  const stopped = await answerChoice(page, defense.questionInstance.correctChoiceId);
  expect(stopped.statsSession.completedPlays.at(-1)).toMatchObject({ actualYards: 0, outcome: 'stop' });
  await expect(page.locator('.field-particle')).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await runOffenseGain(page, { call: 'Long Pass' })).toMatchObject({ count: 0, gain: 12 });
});

test('a real 0% player position is preserved when spawning', async ({ page }) => {
  await openGame(page);
  const left = await page.evaluate(() => {
    const player = document.getElementById('player');
    player.style.left = '0%';
    startPlayerRun(true);
    clearTimeout(playerRunTimer);
    const particle = document.querySelector('.field-particle');
    const result = particle?.style.left;
    document.querySelectorAll('.field-particle').forEach((node) => node.remove());
    return result;
  });
  expect(left).toBe('0%');
});
