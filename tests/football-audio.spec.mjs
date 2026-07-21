import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(
    testInfo.project.name !== 'ipad-11-landscape',
    'The exhaustive special-play audio matrix runs once on the primary target.',
  );
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function installAudioMock(page) {
  await page.addInitScript(() => {
    window.__audioEvents = [];

    class AudioParamMock {
      value = 0;
      setValueAtTime(value) { this.value = value; }
      exponentialRampToValueAtTime(value) { this.value = value; }
      linearRampToValueAtTime(value) { this.value = value; }
    }

    class AudioNodeMock {
      constructor(kind) {
        this.kind = kind;
        this.type = 'sine';
        this.frequency = new AudioParamMock();
        this.gain = new AudioParamMock();
      }
      connect() { return this; }
      start() { window.__audioEvents.push(`${this.kind}:${this.type}:start`); }
      stop() { window.__audioEvents.push(`${this.kind}:${this.type}:stop`); }
    }

    class AudioContextMock {
      constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { this.state = 'running'; window.__audioEvents.push('resume'); return Promise.resolve(); }
      createOscillator() { return new AudioNodeMock('oscillator'); }
      createGain() { return new AudioNodeMock('gain'); }
    }

    window.AudioContext = AudioContextMock;
  });
}

async function installDeterministicStreams(page, footballRoll = 0) {
  await page.evaluate((roll) => {
    const football = () => roll;
    const scheduler = () => 0.25;
    const presentation = () => 0.5;
    window.__footballTest.setRngStreams({ football, scheduler, presentation });
  }, footballRoll);
}

async function seedOffense(page, { yardLine = 20, firstDownLine = 30 } = {}) {
  await page.evaluate((drive) => window.__footballTest.seedDriveState(drive), {
    possession: 'offense',
    direction: 1,
    quarter: 1,
    down: 1,
    yardsToGo: firstDownLine - yardLine,
    yardLine,
    firstDownLine,
    driveStart: yardLine,
    scores: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
  });
}

async function seedFourthDownDefense(page) {
  await page.evaluate((drive) => window.__footballTest.seedDriveState(drive), {
    possession: 'defense',
    direction: -1,
    quarter: 1,
    down: 4,
    yardsToGo: 2,
    yardLine: 45,
    firstDownLine: 43,
    driveStart: 80,
    scores: { player: 0, opponent: 0 },
    plays: 0,
    drivePlays: 0,
  });
}

async function oscillatorStarts(page) {
  return page.evaluate(() => window.__audioEvents
    .filter(event => event.startsWith('oscillator:') && event.endsWith(':start')));
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

test('mute target and preference survive reloads', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();

  const dimensions = await page.locator('#mute-toggle').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(dimensions.width).toBeGreaterThanOrEqual(44);
  expect(dimensions.height).toBeGreaterThanOrEqual(44);

  await page.locator('#mute-toggle').click();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('footballAudioMuted'))).toBe('true');

  await page.reload();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#ov-start .ov-btn').click();
  await page.locator('#mute-toggle').click();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('footballAudioMuted'))).toBe('false');

  await page.reload();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('storage failures degrade safely', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage read blocked'); };
    Storage.prototype.setItem = () => { throw new Error('storage write blocked'); };
  });

  await page.goto('/football/');
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#ov-start .ov-btn').click();
  await page.locator('#mute-toggle').click();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('negative cues stay silent while positive cues remain wired', async ({ page }) => {
  const errors = trackErrors(page);
  await installAudioMock(page);

  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();
  expect(await page.evaluate(() => window.__audioEvents)).toEqual(['resume']);
  expect(await page.evaluate(() => typeof playWhistle)).toBe('undefined');
  expect(await page.evaluate(() => typeof playWrong)).toBe('undefined');

  await installDeterministicStreams(page);
  await seedOffense(page);
  const negative = await chooseCall(page, 'Short Run');
  const wrongChoiceId = negative.questionInstance.choices
    .find((choice) => choice.id !== negative.questionInstance.correctChoiceId)?.id;
  expect(wrongChoiceId).toEqual(expect.any(String));
  await answerChoice(page, wrongChoiceId);
  expect(await page.evaluate(() => window.__audioEvents.filter(event => event.includes('oscillator')))).toEqual([]);

  await seedOffense(page);
  const ordinary = await chooseCall(page, 'Short Run');
  await answerChoice(page, ordinary.questionInstance.correctChoiceId);

  await seedOffense(page, { yardLine: 28, firstDownLine: 30 });
  const firstDown = await chooseCall(page, 'Short Run');
  expect(firstDown.activeSnap.proposal.resultKind).toBe('firstDown');
  await answerChoice(page, firstDown.questionInstance.correctChoiceId);

  await seedOffense(page, { yardLine: 98, firstDownLine: 100 });
  const touchdown = await chooseCall(page, 'Short Run');
  expect(touchdown.activeSnap.proposal.resultKind).toBe('touchdown');
  await answerChoice(page, touchdown.questionInstance.correctChoiceId);
  await expect.poll(() => page.evaluate(() =>
    window.__audioEvents.filter(event => event.startsWith('oscillator:') && event.endsWith(':start')).length
  ), { timeout: 3000 }).toBe(10);

  const positiveStarts = await page.evaluate(() =>
    window.__audioEvents.filter(event => event.startsWith('oscillator:') && event.endsWith(':start'))
  );
  expect(positiveStarts).toHaveLength(10);
  expect(positiveStarts.slice(0, 2).every(event => event.includes(':sine:'))).toBe(true);
  expect(positiveStarts.slice(2).every(event => event.includes(':triangle:'))).toBe(true);
  expect(errors).toEqual([]);
});

test('correct fourth-down defense celebrates while misses and bypasses stay silent', async ({ page }) => {
  const errors = trackErrors(page);
  await installAudioMock(page);
  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();
  await page.evaluate(() => { window.__audioEvents = []; });

  await installDeterministicStreams(page);
  await seedFourthDownDefense(page);
  const correct = await chooseCall(page, 'Run Defense');
  const correctResult = await answerChoice(page, correct.questionInstance.correctChoiceId);
  expect(correctResult.statsSession.completedPlays.at(-1)).toMatchObject({
    resolution: 'firstTryCorrect',
    actualYards: 0,
    outcome: 'turnoverOnDowns',
  });
  const correctStarts = await oscillatorStarts(page);
  expect(correctStarts).toHaveLength(2);
  expect(correctStarts.every(event => event.includes(':sine:'))).toBe(true);

  await page.evaluate(() => { window.__audioEvents = []; });
  await installDeterministicStreams(page);
  await seedFourthDownDefense(page);
  const retried = await chooseCall(page, 'Run Defense');
  const retryWrongId = retried.questionInstance.choices
    .find(choice => choice.id !== retried.questionInstance.correctChoiceId)?.id;
  expect(retryWrongId).toEqual(expect.any(String));
  await answerChoice(page, retryWrongId);
  const retryResult = await answerChoice(page, retried.questionInstance.correctChoiceId);
  expect(retryResult.statsSession.completedPlays.at(-1)).toMatchObject({
    resolution: 'retryCorrect',
    actualYards: 0,
    outcome: 'turnoverOnDowns',
  });
  const retryStarts = await oscillatorStarts(page);
  expect(retryStarts).toHaveLength(2);
  expect(retryStarts.every(event => event.includes(':sine:'))).toBe(true);

  await page.evaluate(() => { window.__audioEvents = []; });
  await installDeterministicStreams(page);
  await seedFourthDownDefense(page);
  const missed = await chooseCall(page, 'Run Defense');
  const wrongIds = missed.questionInstance.choices
    .filter(choice => choice.id !== missed.questionInstance.correctChoiceId)
    .map(choice => choice.id);
  expect(wrongIds.length).toBeGreaterThanOrEqual(2);
  await answerChoice(page, wrongIds[0]);
  await answerChoice(page, wrongIds[1]);
  await page.locator('#question-learn-why').click();
  await page.locator('#question-continue').click();
  const missResult = await page.evaluate(() => window.__footballTest.activeContracts());
  expect(missResult.statsSession.completedPlays.at(-1)).toMatchObject({
    resolution: 'secondMiss',
    outcome: 'turnoverOnDowns',
  });
  expect(await oscillatorStarts(page)).toEqual([]);

  await page.evaluate(() => { window.__audioEvents = []; });
  await installDeterministicStreams(page);
  await seedFourthDownDefense(page);
  await page.evaluate(() => window.__footballTest.setQuestionFault('empty-pool'));
  await page.locator('#call-grid .call-btn').filter({ hasText: 'Run Defense' }).first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await page.evaluate(() => window.__footballTest.setQuestionFault(null));
  const bypassResult = await page.evaluate(() => window.__footballTest.activeContracts());
  expect(bypassResult.statsSession.completedPlays.at(-1)).toMatchObject({
    instructionalStatus: 'bypassed',
    resolution: null,
    outcome: 'turnoverOnDowns',
  });
  expect(await oscillatorStarts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('special-play audio is positive only for first-try or retry instructional success in either possession', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await installAudioMock(page);
  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();
  await installDeterministicStreams(page, 0.5);

  const policies = ['firstTryCorrect', 'retryCorrect', 'secondMiss', 'questionBypass'];
  for (const playType of ['conversion', 'fieldGoal', 'punt']) {
    for (const possession of ['offense', 'defense']) {
      for (const policy of policies) {
        const before = await page.evaluate(({ playType: type, possession: side, policy: resolutionPolicy }) => {
          const direction = side === 'offense' ? 1 : -1;
          const yardLine = type === 'fieldGoal'
            ? side === 'offense' ? 60 : 40
            : type === 'punt'
              ? side === 'offense' ? 50 : 80
              : side === 'offense' ? 20 : 80;
          window.__footballTest.setQuestionFault(resolutionPolicy === 'questionBypass' ? 'empty-pool' : null);
          window.__footballTest.seedDriveState({
            possession: side,
            direction,
            quarter: 1,
            down: 1,
            yardsToGo: 10,
            yardLine,
            firstDownLine: yardLine + (direction * 10),
            driveStart: yardLine,
            scores: { player: 0, opponent: 0 },
            totalYards: { player: 0, opponent: 0 },
            plays: 0,
            drivePlays: 0,
          });
          const activePlay = type === 'conversion'
            ? makeConversionActivePlay('pat')
            : type === 'fieldGoal'
              ? makeFieldGoalActivePlay()
              : makePuntActivePlay({ travelYards: 40 });
          startSpecialPlay(activePlay, 'Special-play audio probe.');
          return window.__footballTest.activeContracts();
        }, { playType, possession, policy });
        await page.evaluate(() => { window.__audioEvents = []; });

        if (policy !== 'questionBypass') {
          const wrongIds = before.questionInstance.choices
            .filter(choice => choice.id !== before.questionInstance.correctChoiceId)
            .map(choice => choice.id);
          if (policy === 'firstTryCorrect') {
            await answerChoice(page, before.questionInstance.correctChoiceId);
          } else if (policy === 'retryCorrect') {
            await answerChoice(page, wrongIds[0]);
            expect(await oscillatorStarts(page)).toEqual([]);
            await answerChoice(page, before.questionInstance.correctChoiceId);
          } else {
            await answerChoice(page, wrongIds[0]);
            await answerChoice(page, wrongIds[1]);
            await page.locator('#question-learn-why').click();
            await page.locator('#question-continue').click();
          }
        }
        await page.evaluate(() => window.__footballTest.setQuestionFault(null));

        const after = await page.evaluate(() => window.__footballTest.activeContracts());
        const row = after.statsSession.completedPlays.at(-1);
        expect(row.playType, `${playType}:${possession}:${policy}`).toBe(playType);
        expect(row.instructionalStatus).toBe(policy === 'questionBypass' ? 'bypassed' : 'presented');
        expect(row.resolution).toBe(policy === 'questionBypass' ? null : policy);
        const starts = await oscillatorStarts(page);
        if (policy === 'firstTryCorrect' || policy === 'retryCorrect') {
          expect(starts, `${playType}:${possession}:${policy}`).toHaveLength(2);
          expect(starts.every(event => event.includes(':sine:'))).toBe(true);
        } else {
          expect(starts, `${playType}:${possession}:${policy}`).toEqual([]);
        }
      }
    }
  }
  expect(errors).toEqual([]);
});
