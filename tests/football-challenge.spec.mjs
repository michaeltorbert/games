import { test, expect } from './curriculum-fixture.mjs';

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
    // Probe the same first ordinary slot as pickQuestion: #208 reserves time
    // families for slots 2,5,8,..., so they cannot shift this stretch draw.
    if (state.instructedScrimmages !== 0) throw Error('Stretch fixture must target the first ordinary slot');
    const clockIds = FOOTBALL_CONTEXTUAL_QUESTIONS.IN_GAME_TIME_FAMILIES;
    const eligible = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(active, contextualQuestionProfile()).eligible
      .filter(entry => !clockIds.includes(entry.familyId)).map(e => ({
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

// challenge-baseline-v1 (Football 1.39.0): an ordinary start and tapped play,
// with no forced family, RNG stream, or draw search. Synthetic completion is
// explicit: a valid learner-reported Grade 1-B record (page 187) is seeded
// before load and confirmed through the normal start prompt. Read-only seams:
// `__footballTest.activeContracts()`, `contextualQuestionProfile()`,
// `FOOTBALL_CONTEXTUAL_QUESTIONS.inspect`, `state.possession`, and the
// `football:result` event. The first ordinary scrimmage question takes a
// retry, the second a worked explanation; others are answered correctly.
const SYNTHETIC_COMPLETION = { schemaVersion: 1, worktext: 'Math Mammoth Grade 1-B', edition: 2026, completedThroughPage: 187,
  revision: 1, updatedAt: '2026-11-23T00:00:00.000Z', provenance: 'learner-reported' };

for (const mode of ['quick', 'season']) {
  test(`baseline floor: normal ${mode} start plays truthful questions on both sides with retry, worked, and one commit`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(record => {
      localStorage.removeItem('footballMathStats:v1');
      localStorage.removeItem('footballMathSeason:v1');
      localStorage.setItem('math-curriculum:progress:v1', JSON.stringify(record));
      window.__baselineResults = [];
      window.addEventListener('football:result', event => window.__baselineResults.push({
        playId: event.detail?.playId ?? null, familyId: event.detail?.familyId ?? null }));
    }, SYNTHETIC_COMPLETION);
    await page.goto('/football/');
    if (mode === 'season') await page.locator('.play-mode-option', { hasText: '3-Game Season' }).tap();
    await page.locator('#start-game-btn').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', /^(call|fourth-down-decision)$/);
    expect(await page.evaluate(() => contextualQuestionProfile().worktexts['Math Mammoth Grade 1-B'].completedThroughPage)).toBe(187);

    const log = [];
    const sides = new Set();
    let scrimmages = 0;
    const shot = async name => {
      const path = testInfo.outputPath(`${mode}-${name}.png`);
      await page.screenshot({ path });
      await testInfo.attach(`${mode}-${name}`, { path, contentType: 'image/png' });
    };
    const commitCount = playId => page.evaluate(id => window.__baselineResults.filter(r => r.playId === id).length, playId);
    for (let step = 0; step < 500; step++) {
      if (sides.has('offense') && sides.has('defense') && scrimmages >= 4) break;
      const view = await page.evaluate(() => ({ phase: document.getElementById('ui-desk').dataset.phase,
        overlay: document.querySelector('.overlay.show')?.dataset.overlay ?? null }));
      if (view.overlay === 'final') break;
      if (view.overlay && view.overlay !== 'start') {
        const action = page.locator('.overlay.show [data-slot="action"]').first();
        if (await action.isVisible() && await action.isEnabled()) { await action.tap(); continue; }
      }
      if (view.phase === 'call') {
        const calls = page.locator('#call-grid .call-btn:not([disabled])');
        if (await calls.count()) { await calls.nth(step % await calls.count()).tap(); continue; }
      }
      if (view.phase === 'fourth-down-decision' || view.phase === 'conversion-decision') {
        const punt = page.locator('#decision-grid .decision-btn[data-action="punt"]:not([disabled])');
        const any = page.locator('#decision-grid .decision-btn:not([disabled])');
        if (await punt.count()) { await punt.first().tap(); continue; }
        if (await any.count()) { await any.first().tap(); continue; }
      }
      if (view.phase === 'question') {
        const q = await page.evaluate(() => {
          const { activePlay, questionInstance: question } = __footballTest.activeContracts();
          const inspected = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(activePlay, contextualQuestionProfile());
          return { playId: activePlay.playId, playType: activePlay.playType, possession: state.possession,
            familyId: question.familyId, questionInstanceId: question.questionInstanceId,
            inPool: inspected.eligible.some(e => e.familyId === question.familyId),
            evidenceClass: question.evidenceClass, magnitude: question.difficulty?.magnitude ?? null,
            support: question.support, correct: question.correctChoiceId, hint: question.hint?.text ?? null,
            wrong: question.choices.filter(c => c.id !== question.correctChoiceId).map(c => c.id),
            prompt: document.getElementById('question').textContent, play: JSON.stringify(activePlay) };
        });
        expect(q.inPool, `${q.familyId} comes from the truthful inspected pool`).toBe(true);
        expect(q.prompt.trim().length).toBeGreaterThan(0);
        sides.add(q.possession);
        const ordinary = q.playType === 'scrimmage';
        const path = ordinary && scrimmages === 0 ? 'retry' : ordinary && scrimmages === 1 ? 'worked' : 'correct';
        if (ordinary) scrimmages++;
        log.push({ possession: q.possession, playType: q.playType, familyId: q.familyId, evidenceClass: q.evidenceClass,
          magnitude: q.magnitude, support: q.support, path, prompt: q.prompt });
        if (log.length === 1 || (q.possession === 'defense' && !log.slice(0, -1).some(e => e.possession === 'defense'))) await shot(`question-${log.length}`);
        if (path === 'retry' || path === 'worked') {
          await page.locator(`[data-choice-id="${q.wrong[0]}"]`).tap();
          if (q.hint) await expect(page.locator('#feedback')).toContainText(q.hint);
          const held = await page.evaluate(() => { const c = __footballTest.activeContracts();
            return { play: JSON.stringify(c.activePlay), id: c.questionInstance.questionInstanceId }; });
          expect(held).toEqual({ play: q.play, id: q.questionInstanceId });
          expect(await commitCount(q.playId)).toBe(0);
          await shot(`${path}-after-first-miss`);
        }
        if (path === 'worked') {
          await page.locator(`[data-choice-id="${q.wrong[1]}"]`).tap();
          await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
          expect(await commitCount(q.playId)).toBe(0);
          await page.locator('#question-learn-why').tap();
          await shot('worked-review');
          await page.locator('#worked-review-back').tap();
          await page.locator('#question-continue').tap();
        } else {
          await page.locator(`[data-choice-id="${q.correct}"]`).tap();
        }
        for (let wait = 0; wait < 40 && await commitCount(q.playId) === 0; wait++) {
          const next = page.locator('#question-continue:not(.hidden)');
          if (await next.isVisible()) await next.tap(); else await page.waitForTimeout(150);
        }
        expect(await commitCount(q.playId), `${q.familyId} commits once`).toBe(1);
        continue;
      }
      await page.waitForTimeout(150);
    }

    await testInfo.attach(`${mode}-questions.json`, { body: JSON.stringify(log, null, 2), contentType: 'application/json' });
    expect([...sides].sort()).toEqual(['defense', 'offense']);
    expect(log.some(e => e.path === 'retry')).toBe(true);
    expect(log.some(e => e.path === 'worked')).toBe(true);
    // Each play commits once, even across repeated taps and routing delays.
    await page.waitForTimeout(2200);
    const results = await page.evaluate(() => window.__baselineResults.filter(r => r.playId));
    expect(new Set(results.map(r => r.playId)).size).toBe(results.length);
    expect(errors).toEqual([]);
  });
}
