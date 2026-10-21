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
