import { test, expect } from './curriculum-fixture.mjs';

// #51: the wider past-marker families on the real call-tap path. Each case
// fixes the football draw that makes the call's frozen gain, sets the Grade
// 1-B completion only in memory (as the start prompt would, never saved),
// and lets the ordinary scheduler choose the family. The page before each
// operand pair's printed page must not reach it.
const OFFENSE = { possession: 'offense', direction: 1, quarter: 2, yardLine: 30, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 4, drivePlays: 2 };

const CASES = [
  { id: '13 − 8', seed: { ...OFFENSE, down: 3, yardsToGo: 8, firstDownLine: 38 }, call: 'mediumPass', football: 0.6,
    gain: 13, answer: 5, page: 131, familyId: 'line-to-gain-surplus-ch8', secondMiss: -3,
    prompt: "It's 3rd and 8. If you complete a 13-yard pass, how far past the first-down marker would you get?" },
  { id: '18 − 7', seed: { ...OFFENSE, down: 3, yardsToGo: 7, firstDownLine: 37 }, call: 'longPass', football: 0.45,
    gain: 18, answer: 11, page: 110, familyId: 'line-to-gain-surplus-ch8-ones-subtract', secondMiss: 0,
    prompt: "It's 3rd and 7. If you complete an 18-yard pass, how far past the first-down marker would you get?" },
  { id: '24 − 10', seed: { ...OFFENSE, down: 1, yardsToGo: 10, firstDownLine: 40 }, call: 'longPass', football: 0.88,
    gain: 24, answer: 14, page: 137, familyId: 'line-to-gain-surplus-ch8', secondMiss: 0,
    prompt: "It's 1st and 10. If you complete a 24-yard pass, how far past the first-down marker would you get?" },
];

async function installSetup(page) {
  await page.evaluate(() => {
    window.__nyPrepare = ({ seed, football, draw, completedPage }) => {
      curriculumSession = Object.freeze({ worktext: 'Math Mammoth Grade 1-B', edition: 2026, completedThroughPage: completedPage, saved: false });
      const streams = () => ({ football: () => football, scheduler: () => draw, presentation: () => 0.4 });
      __footballTest.setRngStreams(streams());
      __footballTest.seedDriveState(seed);
      __footballTest.resetLearning();
      __footballTest.setRngStreams(streams());
    };
    window.__nyFind = ({ seed, call, football, familyId, completedPage }) => {
      const index = __footballTest.callKeys().offense.indexOf(call);
      for (let i = 0; i < 600; i++) {
        const draw = (i + 0.5) / 600;
        window.__nyPrepare({ seed, football, draw, completedPage });
        document.querySelectorAll('#call-grid .call-btn')[index].click();
        if (__footballTest.activeContracts().questionInstance?.familyId === familyId) return draw;
      }
      return null;
    };
  });
}

for (const item of CASES) {
  test(`${item.id}: the page gate, live question, retry, worked, Replay and committed miss stay coherent`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
    });
    await page.goto('/football/?boot=offense-call');
    const savedPage = await page.evaluate(() => localStorage.getItem('math-curriculum:progress:v1'));
    await installSetup(page);

    // Not reachable one page early; reachable at the pair's printed page.
    expect(await page.evaluate(options => window.__nyFind(options), { ...item, completedPage: item.page - 1 }), `${item.id} before p${item.page}`).toBeNull();
    const draw = await page.evaluate(options => window.__nyFind(options), { ...item, completedPage: item.page });
    expect(draw, `${item.id} at p${item.page}`).not.toBeNull();

    await page.evaluate(options => window.__nyPrepare(options), { ...item, draw, completedPage: item.page });
    const index = await page.evaluate(call => __footballTest.callKeys().offense.indexOf(call), item.call);
    await page.locator('#call-grid .call-btn').nth(index).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    const { activePlay: play, questionInstance: question } = await page.evaluate(() => __footballTest.activeContracts());
    expect(play.proposal.appliedGain).toBe(item.gain);
    expect(play.proposal.resultKind).toBe('firstDown');
    expect(question.familyId).toBe(item.familyId);
    expect(question.challenge).toEqual({ concept: 'line-to-gain', role: 'core' });
    expect(question.support).toBe('initial');
    expect(question.answer.value).toBe(item.answer);
    expect(new Set(question.choices.map(choice => choice.value)).size).toBe(4);
    await expect(page.locator('#question')).toHaveText(item.prompt);
    const overlay = page.locator('#math-overlay');
    await expect(overlay).toHaveAttribute('aria-label', `${item.gain} − ${item.seed.yardsToGo} equals an unknown number.`);
    await expect(overlay).toContainText('= ?');
    await expect(overlay).not.toContainText(`= ${item.answer}`);
    const before = await page.evaluate(() => JSON.parse(render_game_to_text()).totalYards.player);

    const wrong = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
    await page.locator(`[data-choice-id="${wrong[0]}"]`).tap();
    await expect(page.locator('#feedback')).toHaveText(`Good try. ${question.hint.text}`);
    expect(question.hint.text).toMatch(new RegExp(`^The first ${item.seed.yardsToGo} yards get you to the marker\\. Work out how much of the ${item.gain}-yard pass is left\\. `));
    await expect(overlay).toHaveAttribute('aria-label', question.visuals.guided.ariaLabel);
    await expect(overlay).not.toContainText(`= ${item.answer}`);

    await page.locator(`[data-choice-id="${wrong[1]}"]`).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    await expect(overlay).toContainText(`= ${item.answer}`);
    const worked = `${item.gain} − ${item.seed.yardsToGo} = ${item.answer}. A ${item.gain}-yard completion on ${item.prompt.slice(5, item.prompt.indexOf('.'))} would take you ${item.answer} yards past the first-down marker.`
      .replace(/^(\d+ − \d+ = \d+\. )A (18)/, '$1An $2');
    await expect(page.locator('#film-room-summary-copy')).toHaveText(worked);
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(false);

    await page.locator('#question-learn-why').tap();
    await expect(page.locator('#worked-review-heading')).toHaveText('Coach Replay: Count Past the Marker');
    await expect(page.locator('#worked-review-content .worked-review-steps p')).toHaveText([question.hint.text, worked]);
    await expect(page.locator('#worked-review-content .worked-review-meaning p'))
      .toHaveText(`For the question's ${item.gain}-yard pass, ${item.seed.yardsToGo} yards reach the marker and ${item.answer} more go past it.`);
    await page.locator('#worked-review-back').tap();
    await page.locator('#question-continue').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

    // The miss commits the call's own second-miss result, not the question's gain.
    const after = await page.evaluate(() => JSON.parse(render_game_to_text()).totalYards.player);
    expect(after - before).toBe(item.secondMiss);
    expect(after - before).not.toBe(item.gain);
    // The demo page was memory-only.
    expect(await page.evaluate(() => localStorage.getItem('math-curriculum:progress:v1'))).toBe(savedPage);
    expect(errors).toEqual([]);
  });
}

// #218: a retried offensive answer credits half the offered gain (#24). The
// result feedback must keep that credited distance and its retry reason
// visible instead of replacing it with the generic outcome. Real call, Go and
// answer taps; no draw search. The scheduler value is the one interior point
// computed for this exact setup from the public FOOTBALL_LEARNING
// selectionWeights interval of line-to-gain-surplus-ch8; the unchanged
// production picker makes the choice. Recalibrated for Football 1.39.0
// (challenge-baseline-v1), which intentionally reweights the fresh ordinary
// slice: the #218 value 0.11569957884885353 lay in the old interval
// (0.08048666, 0.15091249) but now selects team-yards-add-ch8. The recorded
// exact production comparison (selection-comparison-r1, all three cases)
// gives the new interval (0.17313575625227473, 0.32462954297301516); this is
// its midpoint. Only the draw changed; every play/answer assertion below is
// unchanged.
const RETRY_SCHEDULER_DRAW = 0.24888264961264495;
const RETRY_CASES = [
  { id: 'short of the marker', seed: { ...OFFENSE, down: 3, yardsToGo: 8, firstDownLine: 38 }, answer: 5,
    outcome: 'gain', resultKind: 'advance', newDown: 4, newYardsToGo: 2, tone: 'positive' },
  { id: 'still a first down', seed: { ...OFFENSE, down: 3, yardsToGo: 5, firstDownLine: 35 }, answer: 8,
    outcome: 'firstDown', resultKind: 'firstDown', newDown: 1, newYardsToGo: 10, tone: 'positive' },
  { id: 'fourth-down Go, turnover on downs', seed: { ...OFFENSE, down: 4, yardsToGo: 8, firstDownLine: 38 }, go: true, answer: 5,
    outcome: 'turnoverOnDowns', resultKind: 'turnoverOnDowns', newDown: 4, newYardsToGo: 2, tone: 'negative' },
];

for (const item of RETRY_CASES) {
  test(`#218 ${item.id}: a reduced retry keeps its credited yards and reason in the result feedback`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
    });
    await page.goto('/football/?boot=offense-call');

    await page.evaluate(({ seed, draw }) => {
      const counts = { football: 0, scheduler: 0, presentation: 0 };
      const streams = counted => ({
        football: () => { if (counted) counts.football++; return 0.6; },
        scheduler: () => { if (counted) counts.scheduler++; return draw; },
        presentation: () => { if (counted) counts.presentation++; return 0.4; },
      });
      curriculumSession = Object.freeze({ worktext: 'Math Mammoth Grade 1-B', edition: 2026, completedThroughPage: 187, saved: false });
      __footballTest.setRngStreams(streams(false));
      __footballTest.seedDriveState(seed);
      __footballTest.resetLearning();
      __footballTest.setRngStreams(streams(true));
      const record = window.__retry218 = { counts, results: [], resultAt: null, painted: null, settled: null };
      const snapshot = () => {
        const feedback = document.getElementById('feedback');
        const field = document.getElementById('field-wrap');
        const ball = document.getElementById('ball').getBoundingClientRect();
        const left = field.getBoundingClientRect().left + field.clientLeft;
        return {
          text: feedback.textContent,
          tone: feedback.dataset.tone ?? null,
          counts: { ...counts },
          ballCenterX: ball.left + ball.width / 2,
          fieldLeft: left,
          fieldWidth: field.clientWidth,
          absoluteYard: JSON.parse(render_game_to_text()).absoluteYard,
        };
      };
      window.addEventListener('football:result', event => {
        record.results.push(event.detail);
        if (record.resultAt !== null) return;
        record.resultAt = performance.now();
        // After the whole tap handler (the committed feedback) and once settled.
        queueMicrotask(() => { record.painted = snapshot(); });
        setTimeout(() => { record.settled = snapshot(); }, 800);
      });
    }, { seed: item.seed, draw: RETRY_SCHEDULER_DRAW });

    if (item.go) {
      await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'fourth-down-decision');
      await page.locator('#decision-grid .decision-btn[data-action="go"]').tap();
      await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
    }
    const index = await page.evaluate(() => __footballTest.callKeys().offense.indexOf('mediumPass'));
    await page.locator('#call-grid .call-btn').nth(index).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');

    // The frozen play offers 13 yards; the gain-bound question asks past the marker.
    const before = await page.evaluate(() => __footballTest.activeContracts());
    const { activePlay: play, questionInstance: question } = before;
    expect(play.proposal.appliedGain).toBe(13);
    expect(play.context.yardLine).toBe(30);
    expect(question.familyId).toBe('line-to-gain-surplus-ch8');
    expect(question.bindings.find(binding => binding.source?.path === '/proposal/appliedGain')?.value).toBe(13);
    expect(question.answer.value).toBe(item.answer);
    expect(question.answer.value).toBe(13 - item.seed.yardsToGo);
    const questionCounts = await page.evaluate(() => ({ ...window.__retry218.counts }));
    expect(questionCounts).toEqual({ football: 1, scheduler: 1, presentation: 3 });

    const wrong = question.choices.find(choice => choice.id !== question.correctChoiceId);
    await page.locator(`[data-choice-id="${wrong.id}"]`).tap();
    await expect(page.locator('#feedback')).toHaveText(`Good try. ${question.hint.text}`);
    const retry = await page.evaluate(() => __footballTest.activeContracts());
    expect(retry.activePlay).toEqual(play);
    expect(retry.questionInstance).toEqual(question);
    expect(retry.render.absoluteYard).toBe(30);

    await page.locator(`[data-choice-id="${question.correctChoiceId}"]`).tap();
    await page.waitForFunction(() => window.__retry218.settled !== null);
    // Wait past every original routing delay for these branches (the longest
    // scheduled advance after a scrimmage result is 1800 ms), on the real
    // clock, so a repeated commit would be visible in the result count.
    await page.waitForFunction(() => performance.now() - window.__retry218.resultAt >= 2200);
    const { results, painted, settled } = await page.evaluate(() => window.__retry218);

    // One committed result for the same frozen play and question.
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result).toMatchObject({
      playId: play.playId, contextId: play.contextId, possessionId: play.possessionId,
      familyId: question.familyId, questionInstanceId: question.questionInstanceId,
      policy: 'retryCorrect', outcome: item.outcome,
    });
    expect(result.assist).toMatchObject({ assisted: true, rawGain: 13, creditedGain: 6, reductionApplied: true });
    expect(result.transition).toMatchObject({
      requestedGain: 6, appliedGain: 6, startYardLine: 30, endYardLine: 36,
      resultKind: item.resultKind, newDown: item.newDown, newYardsToGo: item.newYardsToGo,
    });
    // Resolution draws nothing from any stream.
    expect(painted.counts).toEqual(questionCounts);
    expect(settled.counts).toEqual(questionCounts);
    // The rendered ball rests on the credited 36, from the page's own yard mapping.
    expect(settled.absoluteYard).toBe(36);
    const expectedX = await page.evaluate(({ left, width }) => left + (yardToPct(36) / 100) * width,
      { left: settled.fieldLeft, width: settled.fieldWidth });
    expect(Math.abs(settled.ballCenterX - expectedX)).toBeLessThanOrEqual(1.5);

    // The visible result keeps the credited yards and the retry reason, with
    // this branch's own outcome and tone, both right after the commit and settled.
    for (const shown of [painted, settled]) {
      expect(shown.text).toMatch(/\b6 yards\b/);
      expect(shown.text).not.toMatch(/\b13 yards\b/);
      expect(shown.text).toMatch(/\bretry\b/i);
      expect(shown.tone).toBe(item.tone);
      if (item.outcome === 'firstDown') expect(shown.text).toMatch(/first down/i);
      else expect(shown.text).not.toMatch(/first down/i);
      if (item.outcome === 'turnoverOnDowns') expect(shown.text).toMatch(/turnover on downs/i);
      else expect(shown.text).not.toMatch(/turnover/i);
    }
    expect(errors).toEqual([]);
  });
}
