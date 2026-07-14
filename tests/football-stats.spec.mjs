import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Persistent stats checks run once on the primary target.');
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function answer(page, kind, excluded = []) {
  const index = await page.evaluate(({ answerKind, excludedIndexes }) => {
    if (answerKind === 'correct') return state.choices.indexOf(state.correct);
    return state.choices.findIndex((choice, choiceIndex) =>
      choice !== state.correct && !excludedIndexes.includes(choiceIndex)
    );
  }, { answerKind: kind, excludedIndexes: excluded });
  await page.locator(`#b${index}`).click();
  return index;
}

test('completed play rows persist normalized context without prompts or answer content', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    localStorage.removeItem(FOOTBALL_STATS.STORAGE_KEY);
    state.yd = 99;
    state.fdYd = 100;
    state.ytg = 1;
  });
  await page.locator('#call-grid .call-btn').first().click();
  const offeredYards = await page.evaluate(() => state.play.gain);
  await answer(page, 'correct');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem(FOOTBALL_STATS.STORAGE_KEY)));
  expect(stored.schemaVersion).toBe(1);
  expect(stored.recentPlays).toHaveLength(1);
  expect(stored.aggregates.completedPlays).toBe(1);
  expect(stored.aggregates.byPossession.offense).toBe(1);
  expect(stored.aggregates.byOutcome.touchdown).toBe(1);

  const row = stored.recentPlays[0];
  expect(row.preSnap).toMatchObject({ possession: 'offense', down: 1, yardLine: 99, yardsToGo: 1 });
  expect(row.calls).toMatchObject({ offense: 'shortRun', defense: null, opponent: null });
  expect(row.offeredYards).toBe(offeredYards);
  expect(row.question).toEqual(expect.objectContaining({
    id: expect.any(String),
    skill: expect.any(String),
    concept: expect.any(String),
    purpose: expect.any(String),
    grading: expect.stringMatching(/^(gate|noStakes)$/),
    tier: expect.any(String),
  }));
  expect(row.attempts).toEqual([
    expect.objectContaining({ number: 1, correct: true, elapsedMs: expect.any(Number) }),
  ]);
  expect(row.resolution).toBe('firstTryCorrect');
  if (row.question.grading === 'gate') {
    expect(stored.mastery[row.question.concept]).toEqual({
      resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0,
    });
  } else {
    expect(stored.mastery).toEqual({});
  }
  expect(row.actualYards).toBe(offeredYards);
  expect(row.outcome).toBe('touchdown');
  expect(row.postPlay.score.player).toBe(7);
  expect(row.postPlay.plays).toBe(1);
  expect(row).not.toHaveProperty('prompt');
  expect(row).not.toHaveProperty('choices');
  expect(row).not.toHaveProperty('correct');
  expect(JSON.stringify(row)).not.toContain('How many');

  await page.reload();
  expect((await page.evaluate(() => FOOTBALL_STATS.history())).recentPlays).toEqual(stored.recentPlays);
  expect(errors).toEqual([]);
});

test('retry, miss, defense, and no-stakes paths log realized outcomes exactly once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const errors = trackErrors(page);
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    localStorage.removeItem(FOOTBALL_STATS.STORAGE_KEY);
    window.__footballTest.forceQuestion({
      id: 'offense-miss', skill: 'difference', purpose: 'weakSpot', grading: 'gate', tier: 'within-10',
      q: 'Test question', correct: 3, choices: [1, 2, 3, 4], explain: '3', hint: 'Try again.',
    });
  });
  const firstWrong = await answer(page, 'wrong');
  await answer(page, 'wrong', [firstWrong]);
  await page.locator('#question-continue').click();

  await page.evaluate(() => {
    startDrive('defense');
    state.defenseCallKey = 'shortPass';
    state.opponentCallKey = 'shortRun';
    state.matchup = 'mismatch';
    window.__footballTest.forceQuestion({
      id: 'defense-stop', skill: 'addition', purpose: 'coreReview', grading: 'gate', tier: 'within-10',
      q: 'Test question', correct: 3, choices: [1, 2, 3, 4], explain: '3', hint: 'Try again.',
    }, 'defense');
  });
  await answer(page, 'correct');

  await page.evaluate(() => {
    startDrive('defense');
    state.defenseCallKey = 'shortPass';
    state.opponentCallKey = 'shortRun';
    state.matchup = 'mismatch';
    window.__footballTest.forceQuestion({
      id: 'defense-gain', skill: 'addition', purpose: 'coreReview', grading: 'gate', tier: 'within-10',
      q: 'Test question', correct: 3, choices: [1, 2, 3, 4], explain: '3', hint: 'Try again.',
    }, 'defense');
  });
  const defenseWrong = await answer(page, 'wrong');
  await answer(page, 'wrong', [defenseWrong]);
  await page.locator('#question-continue').click();

  await page.evaluate(() => {
    startDrive('offense');
    window.__footballTest.forceQuestion({
      id: 'preview', skill: 'comparison', purpose: 'currentSupported', grading: 'noStakes', tier: 'supported',
      q: 'Preview question', correct: 3, choices: [1, 2, 3, 4], explain: '3', hint: 'Try again.',
    });
  });
  await answer(page, 'correct');

  const stored = await page.evaluate(() => FOOTBALL_STATS.history());
  expect(stored.recentPlays).toHaveLength(4);
  const [offenseMiss, defenseStop, defenseGain, preview] = stored.recentPlays;
  expect(offenseMiss).toMatchObject({
    offeredYards: 3,
    resolution: 'secondMiss',
    actualYards: 0,
    outcome: 'noGain',
  });
  expect(offenseMiss.attempts).toEqual([
    expect.objectContaining({ number: 1, correct: false, elapsedMs: expect.any(Number) }),
    expect.objectContaining({ number: 2, correct: false, elapsedMs: expect.any(Number) }),
  ]);
  expect(defenseStop).toMatchObject({ resolution: 'firstTryCorrect', actualYards: 0, outcome: 'stop' });
  expect(defenseGain.resolution).toBe('secondMiss');
  expect(defenseGain.actualYards).toBeGreaterThan(0);
  expect(defenseGain.actualYards).toBeLessThanOrEqual(3);
  expect(defenseGain.outcome).toBe('gain');
  expect(preview.question.grading).toBe('noStakes');
  expect(stored.aggregates.learning).toMatchObject({
    gradedPlays: 3,
    noStakesPlays: 1,
    firstTryCorrect: 1,
    secondMiss: 2,
  });
  expect(stored.mastery).toEqual({
    difference: { resolved: 1, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 1 },
    addition: { resolved: 2, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 1 },
  });
  expect(new Set(stored.recentPlays.map(row => row.id)).size).toBe(4);
  expect(errors).toEqual([]);
});

test('history is capped, aggregates are guarded, completion is deduplicated, and IDs do not consume game RNG', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(() => {
    localStorage.setItem('footballMathStats:v1', JSON.stringify({
      schemaVersion: 1,
      aggregates: {
        completedPlays: -4,
        actualYards: 'bad',
        byPossession: { offense: -1, defense: 'bad' },
        byOutcome: { gain: -9 },
        learning: { gradedPlays: -2, firstTryCorrect: 'bad' },
      },
      recentPlays: [],
      mastery: {},
    }));
  });
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const context = sequence => ({
      quarter: 1,
      possession: sequence % 2 ? 'offense' : 'defense',
      down: 1,
      yardsToGo: 10,
      yardLine: 20,
      firstDownLine: 30,
      direction: sequence % 2 ? 1 : -1,
      score: { player: 0, opponent: 0 },
      plays: sequence,
      drivePlays: sequence,
    });
    const session = FOOTBALL_STATS.createSession();
    let firstPending;
    for (let sequence = 1; sequence <= 205; sequence++) {
      const pending = FOOTBALL_STATS.beginPlay(session, {
        preSnap: context(sequence),
        calls: { offense: 'shortRun' },
        offeredYards: 3,
        question: { id: `q-${sequence}`, skill: 'addition', purpose: 'coreReview', grading: 'gate', tier: 'within-10' },
      });
      FOOTBALL_STATS.recordAttempt(pending, { number: 1, correct: true, support: 'none' });
      FOOTBALL_STATS.recordResolution(pending, 'firstTryCorrect');
      FOOTBALL_STATS.completePlay(session, pending, { actualYards: 3, outcome: 'gain', postPlay: context(sequence) });
      if (sequence === 1) firstPending = pending;
    }
    const duplicate = FOOTBALL_STATS.completePlay(session, firstPending, {
      actualYards: 3, outcome: 'gain', postPlay: context(1),
    });

    function makeRng(seedValue) {
      let seed = seedValue >>> 0;
      return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
    }
    const playSequence = () => {
      window.__footballTest.resetLearning();
      window.__footballTest.setRng(makeRng(0x8a7a));
      return Array.from({ length: 12 }, () => window.__footballTest.buildPlayAt({
        possession: 'offense', direction: 1, yd: 30, fdYd: 40, down: 1, ytg: 10, driveStart: 20,
      }, 'shortRun'));
    };
    const beforeIds = playSequence();
    for (let index = 0; index < 20; index++) FOOTBALL_STATS.createSession();
    const afterIds = playSequence();
    return { history: FOOTBALL_STATS.history(), duplicate, beforeIds, afterIds };
  });

  expect(result.history.recentPlays).toHaveLength(200);
  expect(result.history.recentPlays[0].sequence).toBe(6);
  expect(result.history.recentPlays.at(-1).sequence).toBe(205);
  expect(result.history.aggregates.completedPlays).toBe(205);
  expect(result.history.aggregates.actualYards).toBe(615);
  expect(result.history.aggregates.learning.firstTryCorrect).toBe(205);
  expect(result.duplicate).toBe(false);
  expect(result.beforeIds).toEqual(result.afterIds);
});

test('future schemas are never overwritten and storage failures never break play', async ({ browser, baseURL }, testInfo) => {
  primaryOnly(testInfo);

  const malformedContext = await browser.newContext();
  const malformedPage = await malformedContext.newPage();
  const malformedErrors = trackErrors(malformedPage);
  await malformedPage.addInitScript(() => {
    if (location.pathname.startsWith('/football')) {
      localStorage.setItem('footballMathStats:v1', '{invalid-json');
    }
  });
  await malformedPage.goto(`${baseURL}/football/?boot=offense-call`);
  await malformedPage.locator('#call-grid .call-btn').first().click();
  await answer(malformedPage, 'correct');
  const repaired = await malformedPage.evaluate(() => JSON.parse(localStorage.getItem('footballMathStats:v1')));
  expect(repaired.schemaVersion).toBe(1);
  expect(repaired.recentPlays).toHaveLength(1);
  expect(malformedErrors).toEqual([]);
  await malformedContext.close();

  const futureContext = await browser.newContext();
  const futurePage = await futureContext.newPage();
  const futureErrors = trackErrors(futurePage);
  await futurePage.addInitScript(() => {
    if (location.pathname.startsWith('/football')) {
      localStorage.setItem('footballMathStats:v1', JSON.stringify({ schemaVersion: 99, future: 'keep-me' }));
    }
  });
  await futurePage.goto(`${baseURL}/football/?boot=offense-call`);
  await futurePage.locator('#call-grid .call-btn').first().click();
  await answer(futurePage, 'correct');
  expect(await futurePage.evaluate(() => localStorage.getItem('footballMathStats:v1')))
    .toBe(JSON.stringify({ schemaVersion: 99, future: 'keep-me' }));
  expect(futureErrors).toEqual([]);
  await futureContext.close();

  const blockedContext = await browser.newContext();
  const blockedPage = await blockedContext.newPage();
  const blockedErrors = trackErrors(blockedPage);
  await blockedPage.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage read blocked'); };
    Storage.prototype.setItem = () => { throw new Error('storage write blocked'); };
  });
  await blockedPage.goto(`${baseURL}/football/?boot=offense-call`);
  await blockedPage.locator('#call-grid .call-btn').first().click();
  await answer(blockedPage, 'correct');
  const stateAfter = JSON.parse(await blockedPage.evaluate(() => window.render_game_to_text()));
  expect(stateAfter.mode).toBe('feedback');
  expect(stateAfter.plays).toBe(1);
  expect((await blockedPage.evaluate(() => window.__footballTest.statsSession())).completedPlays).toHaveLength(1);
  expect(blockedErrors).toEqual([]);
  await blockedContext.close();
});
