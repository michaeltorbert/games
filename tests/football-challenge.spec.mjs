import { test, expect } from '@playwright/test';

test('a real stretch play records once, reports this game, and restores only historical evidence', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  const before = await page.evaluate(() => {
    window.__footballTest.seedDriveState({ possession: 'offense', direction: 1, quarter: 2,
      down: 1, yardsToGo: 10, yardLine: 30, firstDownLine: 40, driveStart: 25,
      scores: { player: 0, opponent: 0 }, plays: 0, drivePlays: 0 });
    const counts = { football: 0, scheduler: 0, presentation: 0 };
    let draw = .5;
    window.__footballTest.setRngStreams({ football: () => { counts.football++; return .2; },
      scheduler: () => { counts.scheduler++; return draw; },
      presentation: () => { counts.presentation++; return .5; } });
    const active = makeActiveScrimmagePlay('shortRun', { calls: { offense: 'shortRun', defense: null, matchup: null } });
    const eligible = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(active, contextualQuestionProfile()).eligible.map(e => ({
      ...e, selectionMultiplier: FOOTBALL_CONTEXTUAL_QUESTIONS.selectionFor(active, e.familyId).multiplier,
    }));
    let found = false;
    for (let i = 0; i < 10000; i++) {
      draw = (i + .5) / 10000;
      if (FOOTBALL_LEARNING.weightedPick(eligible, learningSession, () => draw).familyId === 'line-to-gain-fact-family') {
        found = true; break;
      }
    }
    if (!found) throw Error('No stretch fixture');
    startInstructionForPlay(active);
    window.__challengeDrawCounts = counts;
    return { counts, active: window.__footballTest.activeContracts(), evidence: learningSession.currentChallengeEvidence };
  });
  expect(before.evidence).toEqual([]);
  expect(before.counts.football).toBe(1);
  expect(before.counts.scheduler).toBe(1);
  expect(before.active.questionInstance.challenge.role).toBe('stretch');
  expect(Object.keys(before.active.questionInstance.challengeSelection).sort()).toEqual(
    ['concept', 'fallback', 'policyVersion', 'preferredRole', 'reason', 'selectedRole']);
  await page.evaluate(() => window.__footballTest.answerChoice('wrong'));
  expect(await page.evaluate(() => learningSession.currentChallengeEvidence.length)).toBe(0);
  await page.evaluate(() => window.__footballTest.answerChoice('correct'));
  const after = await page.evaluate(() => {
    window.__footballTest.answerChoice('correct');
    commitPendingResolution();
    return { rows: learningSession.currentChallengeEvidence, report: buildCoachReport(),
      counts: window.__challengeDrawCounts, history: FOOTBALL_STATS.learningSnapshot().challengeEvidence };
  });
  expect(after.rows).toHaveLength(1);
  expect(after.rows[0].resolution).toBe('retryCorrect');
  expect(after.report).toContainEqual({ label: 'Practiced today', value: 'Practiced missing-part equations with support' });
  expect(after.counts).toEqual(before.counts);
  expect(after.history).toHaveLength(1);
  expect(JSON.stringify(after.rows)).not.toMatch(/prompt|answer|elapsed|plannedCall|bindings/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('footballMathStats:v1')).recentPlays.length)).toBe(1);
  await page.reload();
  expect(await page.evaluate(() => learningSession.challengeEvidence.length)).toBe(1);
  expect(await page.evaluate(() => learningSession.currentChallengeEvidence.length)).toBe(0);
  expect(JSON.stringify(await page.evaluate(() => buildCoachReport()))).not.toContain('missing-part equations');
});

test('runtime rejects forged challenge metadata and uncommitted results supply no progression', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  const result = await page.evaluate(() => {
    const active = makeActiveScrimmagePlay('shortRun', { calls: { offense: 'shortRun', defense: null, matchup: null } });
    const question = pickQuestion(active);
    let rejected = false;
    try { validateQuestionInstance(active, { ...question, challenge: { concept: 'invented', role: 'stretch' } }); }
    catch (error) { rejected = error.code === 'malformed-question'; }
    FOOTBALL_LEARNING.recordResolved(learningSession, question, 'firstTryCorrect');
    return { rejected, rows: learningSession.challengeEvidence, current: learningSession.currentChallengeEvidence };
  });
  expect(result).toEqual({ rejected: true, rows: [], current: [] });
});

test('coach stretch summary uses latest completion and retains unrelated practice needs', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  const reports = await page.evaluate(() => {
    const evidence = (playId, completedAt, concept, resolution) => ({
      gameId: 'current-game', playId, completedAt, concept, resolution,
      familyId: concept === 'line-to-gain' ? 'line-to-gain-fact-family' : 'drive-distance-plus-whole-tens',
      attempts: [{ support: resolution === 'firstTryCorrect' ? 'initial' : 'guided' }],
    });
    const early = evidence('play-1', '2026-09-09T10:00:00Z', 'line-to-gain', 'firstTryCorrect');
    const later = evidence('play-2', '2026-09-09T10:01:00Z', 'drive-distance', 'retryCorrect');
    learningSession.byConcept = {
      addition: { independent: { resolved: 3, firstTryCorrect: 3, retryCorrect: 0, secondMiss: 0 } },
      difference: { independent: { resolved: 3, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 3 } },
      'line-to-gain': { independent: { resolved: 1, firstTryCorrect: 1, retryCorrect: 0, secondMiss: 0 } },
      'drive-distance': { independent: { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 } },
    };
    learningSession.currentChallengeEvidence = [early, later];
    const forward = buildCoachReport();
    learningSession.currentChallengeEvidence = [later, early];
    const reverse = buildCoachReport();
    const success = evidence('play-3', '2026-09-09T10:02:00Z', 'drive-distance', 'firstTryCorrect');
    learningSession.currentChallengeEvidence.push(success);
    const recovered = buildCoachReport();
    // Two unrelated support needs leave no safe replacement slot.
    learningSession.byConcept = {
      difference: { independent: { resolved: 2, firstTryCorrect: 0, retryCorrect: 0, secondMiss: 2 } },
      addition: { literacy: { resolved: 2, firstTryCorrect: 0, retryCorrect: 2, secondMiss: 0 } },
      'drive-distance': { independent: { resolved: 1, firstTryCorrect: 0, retryCorrect: 1, secondMiss: 0 } },
    };
    const twoNeeds = buildCoachReport();
    return { forward, reverse, recovered, twoNeeds };
  });
  expect(reports.forward).toEqual([
    { label: 'Practiced today', value: 'Practiced drive totals with support' },
    { label: 'Practice next', value: 'Finding the difference' },
  ]);
  expect(reports.reverse).toEqual(reports.forward);
  expect(reports.recovered).toEqual([
    { label: 'Practiced today', value: 'Tried drive totals' },
    { label: 'Practice next', value: 'Finding the difference' },
  ]);
  expect(reports.twoNeeds).toEqual([
    { label: 'Building today', value: 'Finding the difference' },
    { label: 'Practice next', value: 'Adding within 10' },
  ]);
});
