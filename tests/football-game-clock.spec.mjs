// #222 timed quarters through the live UI. Deterministic cases drive the
// game's manual monotonic clock seam (`useManualClock`/`advanceClock`) with
// real taps; one smoke case lets real elapsed time run the clock. The Football
// session mute is installed and verified by the curriculum fixture.
import { test, expect } from './curriculum-fixture.mjs';

const PRIMARY = 'ipad-11-landscape';
const STATS_KEY = 'footballMathStats:v1';
const QUARTER_KEY = 'footballQuarterMinutes:v1';
const SEASON_KEY = 'footballMathSeason:v1';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== PRIMARY, 'Clock lifecycle checks run once on the primary target.');
}

async function boot(page, { seed = 0x2220001, path = '/football/?boot=offense-call' } = {}) {
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
  });
  await page.goto(path);
  await page.evaluate((rootSeed) => {
    window.__results = [];
    window.addEventListener('football:result', event => window.__results.push(event.detail));
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.setRootSeed(rootSeed);
    window.__footballTest.useManualClock(0);
  }, seed);
}

async function seed(page, overrides) {
  return page.evaluate(value => window.__footballTest.seedDriveState(value), overrides);
}

const render = page => page.evaluate(() => JSON.parse(render_game_to_text()));
const contracts = page => page.evaluate(() => window.__footballTest.activeContracts());
const advance = (page, ms) => page.evaluate(value => window.__footballTest.advanceClock(value), ms);
const answer = (page, choice) => page.evaluate(id => window.__footballTest.answerChoice(id), choice);

async function countRng(page) {
  await page.evaluate(() => {
    window.__rngCalls = { football: 0, scheduler: 0, presentation: 0 };
    const counted = (name, value) => () => { window.__rngCalls[name]++; return value; };
    window.__footballTest.setRngStreams({
      football: counted('football', 0.4),
      scheduler: counted('scheduler', 0.25),
      presentation: counted('presentation', 0.5),
    });
  });
}

async function tapCall(page, index = 0) {
  const button = page.locator('#call-grid .call-btn').nth(index);
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
}

async function tapAnswer(page, kind) {
  const state = await contracts(page);
  const choices = state.questionInstance.choices;
  const id = kind === 'correct'
    ? state.questionInstance.correctChoiceId
    : choices.find(choice => choice.id !== state.questionInstance.correctChoiceId
      && !state.questionUi.missedChoiceIds.includes(choice.id)).id;
  const index = choices.findIndex(choice => choice.id === id);
  await page.locator(`#b${index}`).click();
}

const OFFENSE = Object.freeze({
  possession: 'offense', direction: 1, down: 2, yardsToGo: 7, yardLine: 33, firstDownLine: 40, driveStart: 25,
  scores: { player: 7, opponent: 3 },
});
const DEFENSE = Object.freeze({
  possession: 'defense', direction: -1, down: 2, yardsToGo: 6, yardLine: 64, firstDownLine: 58, driveStart: 75,
  scores: { player: 7, opponent: 3 },
});

test('the clock runs for calls, questions and retries on both sides and stops for results and overlays', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  for (const side of [OFFENSE, DEFENSE]) {
    await seed(page, { ...side, quarter: 1, clockRemainingMs: 300000 });
    await expect(page.locator('#s-clock')).toHaveText('5:00');
    await advance(page, 10000);
    expect((await render(page)).gameClock).toMatchObject({ remainingMs: 290000, running: true, display: '4:50' });
    await expect(page.locator('#s-clock')).toHaveText('4:50');
    await expect(page.locator('#s-clock')).toHaveAttribute('data-clock-state', 'running');
    await tapCall(page);
    await advance(page, 5000);
    await tapAnswer(page, 'wrong');
    expect((await render(page)).mode).toBe('question');
    await advance(page, 4000);
    expect((await render(page)).gameClock.remainingMs).toBe(281000);
    await tapAnswer(page, 'correct');
    expect((await render(page)).mode).toBe('feedback');
    await advance(page, 60000);
    expect((await render(page)).gameClock).toMatchObject({ remainingMs: 281000, running: false });
    await expect(page.locator('#s-clock')).toHaveAttribute('data-clock-state', 'stopped');
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', /call|fourth-down-decision/);
    await advance(page, 1000);
    expect((await render(page)).gameClock).toMatchObject({ remainingMs: 280000, running: true });
  }
});

test('a second miss stops the clock while the worked explanation is read', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...OFFENSE, quarter: 3, clockRemainingMs: 120000 });
  await tapCall(page);
  await tapAnswer(page, 'wrong');
  await advance(page, 2000);
  await tapAnswer(page, 'wrong');
  expect((await render(page)).mode).toBe('explanation');
  await advance(page, 90000);
  expect((await render(page)).gameClock).toMatchObject({ remainingMs: 118000, running: false });
});

test('possession counts never end a timed quarter while time remains', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  for (const quarterPossessions of [3, 4, 5, 6, 7]) {
    await seed(page, {
      possession: 'offense', direction: 1, quarter: 1, quarterPossessions,
      down: 4, yardsToGo: 9, yardLine: 30, firstDownLine: 39, driveStart: 22, clockRemainingMs: 200000,
    });
    await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
    await tapAnswer(page, 'correct');
    await expect(page.locator('#ov-defense')).toHaveClass(/show/);
    const view = await render(page);
    expect(view).toMatchObject({ mode: 'transition', quarter: 1, periodEnd: null, quarterPossessions: quarterPossessions + 1 });
    expect(view.gameClock.remainingMs).toBe(200000);
  }
});

for (const quarter of [1, 2, 3, 4]) {
  for (const side of [OFFENSE, DEFENSE]) {
    test(`0:00 on the Q${quarter} ${side.possession} call screen ends the period without a new play`, async ({ page }, testInfo) => {
      primaryOnly(testInfo);
      await boot(page);
      await countRng(page);
      const before = await seed(page, { ...side, quarter, clockRemainingMs: 1500 });
      const plan = await page.evaluate(() => window.__footballTest.opponentSnapshot());
      const rngBefore = await page.evaluate(() => ({ ...window.__rngCalls }));
      await advance(page, 1499);
      expect((await render(page)).mode).toBe('call');
      await expect(page.locator('#s-clock')).toHaveText('0:01');
      await advance(page, 1);
      const expectedOverlay = quarter === 2 ? '#ov-halftime' : quarter === 4 ? '#ov-end' : '#ov-quarter';
      await expect(page.locator(expectedOverlay)).toHaveClass(/show/);
      await expect(page.locator('#s-clock')).toHaveText('0:00');
      const after = await contracts(page);
      expect(after.activePlay).toBeNull();
      expect(after.statsSession.completedPlays).toHaveLength(0);
      expect(after.learning.presented).toBe(0);
      expect(await page.evaluate(() => window.__results)).toHaveLength(0);
      expect(await page.evaluate(() => ({ ...window.__rngCalls }))).toEqual(rngBefore);
      // Repeated ticks apply the expiry once.
      await advance(page, 5000);
      expect((await render(page)).periodEnd).toBe(after.render.periodEnd);
      expect((await render(page)).quarterPossessions).toBe(after.render.quarterPossessions);
      if (quarter === 4) {
        expect(after.render).toMatchObject({ mode: 'final', pendingNextPossession: null });
        expect(await page.evaluate(() => nextQuarter())).toBe(false);
        return;
      }
      const accepted = await page.evaluate(() => nextQuarter());
      expect(accepted).toBe(true);
      expect(await page.evaluate(() => nextQuarter())).toBe(false);
      const next = await render(page);
      expect(next.gameClock).toMatchObject({ quarter: quarter + 1, remainingMs: 300000 });
      expect(next.quarter).toBe(quarter + 1);
      if (quarter === 2) {
        expect(next).toMatchObject({ mode: 'call', possession: 'defense', absoluteYard: 80, restartReason: 'halftimeKickoff' });
        expect(next.possessionId).not.toBe(before.possessionId);
      } else {
        // The open drive carries unchanged, including the visible opponent plan.
        expect(next).toMatchObject({
          mode: 'call', possession: side.possession, possessionId: before.possessionId,
          down: side.down, ytg: side.yardsToGo, absoluteYard: side.yardLine,
        });
        expect(await page.evaluate(() => window.__footballTest.opponentSnapshot())).toEqual(plan);
        expect(await page.evaluate(() => ({ ...window.__rngCalls }))).toEqual(rngBefore);
        await tapCall(page);
        const play = await contracts(page);
        expect(play.activePlay).toMatchObject({ possessionId: before.possessionId });
        expect(play.activePlay.context.quarter).toBe(quarter + 1);
      }
    });
  }
}

for (const quarter of [1, 2, 3, 4]) {
  for (const side of [OFFENSE, DEFENSE]) {
    test(`a Q${quarter} ${side.possession} play that runs out the clock finishes with normal help and counts`, async ({ page }, testInfo) => {
      primaryOnly(testInfo);
      await boot(page);
      const before = await seed(page, { ...side, quarter, clockRemainingMs: 3000 });
      await tapCall(page);
      const question = await contracts(page);
      await advance(page, 10000);
      await expect(page.locator('#s-clock')).toHaveText('0:00');
      expect((await render(page)).mode).toBe('question');
      await tapAnswer(page, 'wrong');
      const retry = await render(page);
      expect(retry).toMatchObject({ mode: 'question', retryAvailable: true });
      await tapAnswer(page, 'correct');
      const committed = await contracts(page);
      expect(committed.render.mode).toBe('feedback');
      expect(committed.statsSession.completedPlays).toHaveLength(1);
      expect(committed.statsSession.completedPlays[0].playId).toBe(question.activePlay.playId);
      const results = await page.evaluate(() => window.__results);
      expect(results).toHaveLength(1);
      expect(results[0].policy).toBe('retryCorrect');
      const expectedOverlay = quarter === 2 ? '#ov-halftime' : quarter === 4 ? '#ov-end' : '#ov-quarter';
      await expect(page.locator(expectedOverlay)).toHaveClass(/show/, { timeout: 5000 });
      if (quarter === 4) return;
      await page.locator(`${expectedOverlay} .ov-btn`).click();
      const next = await render(page);
      expect(next.quarter).toBe(quarter + 1);
      if (quarter === 2) {
        expect(next).toMatchObject({ possession: 'defense', absoluteYard: 80 });
      } else {
        expect(next).toMatchObject({
          possession: side.possession, possessionId: before.possessionId,
          absoluteYard: committed.render.absoluteYard, down: committed.render.down,
        });
      }
    });
  }
}

test('a touchdown at 0:00 and its separate conversion both finish before halftime', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, {
    possession: 'offense', direction: 1, quarter: 2, down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100,
    driveStart: 70, clockRemainingMs: 2000,
  });
  await tapCall(page);
  const touchdown = await contracts(page);
  expect(touchdown.activePlay.proposal.resultKind).toBe('touchdown');
  await advance(page, 5000);
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-td')).toHaveClass(/show/, { timeout: 5000 });
  expect((await render(page))).toMatchObject({ conversionOwed: true, periodEnd: null });
  await page.locator('#ov-td-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'conversion-decision');
  await advance(page, 30000);
  expect((await render(page)).mode).toBe('conversion-decision');
  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  const conversion = await contracts(page);
  expect(conversion.activePlay.playType).toBe('conversion');
  expect(conversion.activePlay.playId).not.toBe(touchdown.activePlay.playId);
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-halftime')).toHaveClass(/show/, { timeout: 5000 });
  const final = await contracts(page);
  expect(final.statsSession.completedPlays.map(row => row.playType)).toEqual(['scrimmage', 'conversion']);
  expect(final.render).toMatchObject({ score: { player: 7, opponent: 0 }, periodEnd: 'halftime', conversionOwed: false });
});

test('an opponent touchdown at 0:00 still runs its conversion before the final', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, {
    possession: 'defense', direction: -1, quarter: 4, down: 1, yardsToGo: 1, yardLine: 1, firstDownLine: 0,
    driveStart: 30, clockRemainingMs: 1000, scores: { player: 14, opponent: 0 },
  });
  await tapCall(page);
  expect((await contracts(page)).activePlay.proposal.resultKind).toBe('touchdown');
  await advance(page, 2000);
  await tapAnswer(page, 'wrong');
  await tapAnswer(page, 'wrong');
  await page.locator('#question-learn-why').click();
  await page.locator('#question-continue').click();
  await expect(page.locator('#ov-td')).toHaveClass(/show/, { timeout: 5000 });
  await page.locator('#ov-td-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  expect((await contracts(page)).activePlay.playType).toBe('conversion');
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-end')).toHaveClass(/show/, { timeout: 5000 });
  expect((await contracts(page)).statsSession.completedPlays.map(row => row.playType)).toEqual(['scrimmage', 'conversion']);
});

test('a conversion that starts with time left uses the clock and ends the quarter when it runs out', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100,
    driveStart: 70, clockRemainingMs: 40000,
  });
  await tapCall(page);
  await advance(page, 5000);
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-td')).toHaveClass(/show/, { timeout: 5000 });
  await advance(page, 20000);
  expect((await render(page)).gameClock.remainingMs).toBe(35000);
  await page.locator('#ov-td-btn').click();
  await advance(page, 10000);
  expect((await render(page)).gameClock).toMatchObject({ remainingMs: 25000, running: true });
  await page.locator('#decision-grid .decision-btn[data-action="twoPoint"]').click();
  await advance(page, 30000);
  await expect(page.locator('#s-clock')).toHaveText('0:00');
  expect((await render(page)).mode).toBe('question');
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-quarter')).toHaveClass(/show/, { timeout: 5000 });
  const view = await render(page);
  expect(view).toMatchObject({ score: { player: 8, opponent: 0 }, periodEnd: 'quarterEnd', pendingNextPossession: 'defense' });
  await page.locator('#ov-quarter .ov-btn').click();
  expect(await render(page)).toMatchObject({ quarter: 2, possession: 'defense' });
});

test('an idle conversion choice at 0:00 is still owed and accepted', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, {
    possession: 'offense', direction: 1, quarter: 3, down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100,
    driveStart: 70, clockRemainingMs: 8000,
  });
  await tapCall(page);
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-td')).toHaveClass(/show/, { timeout: 5000 });
  await page.locator('#ov-td-btn').click();
  await advance(page, 60000);
  expect((await render(page))).toMatchObject({ mode: 'conversion-decision', periodEnd: null });
  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-quarter')).toHaveClass(/show/, { timeout: 5000 });
});

test('automatic opponent punts and field goals never start at 0:00', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  // A defensive stop on third down that runs out the clock leaves the
  // opponent at fourth down; its automatic kick waits for the next quarter.
  await seed(page, {
    possession: 'defense', direction: -1, quarter: 1, down: 3, yardsToGo: 12, yardLine: 70, firstDownLine: 58,
    driveStart: 80, clockRemainingMs: 1000,
  });
  await tapCall(page);
  const third = await contracts(page);
  await advance(page, 2000);
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-quarter')).toHaveClass(/show/, { timeout: 5000 });
  const afterThird = await contracts(page);
  expect(afterThird.activePlay).toBeNull();
  expect(afterThird.render).toMatchObject({ publicSpecialAction: null, possession: 'defense' });
  expect(afterThird.statsSession.completedPlays.map(row => row.playId)).toEqual([third.activePlay.playId]);
  // A fourth down reached at 0:00 allocates no punt or field goal and draws
  // no football RNG; the next quarter's opponent decision is a fresh one.
  await countRng(page);
  await seed(page, {
    possession: 'defense', direction: -1, quarter: 3, down: 4, yardsToGo: 8, yardLine: 22, firstDownLine: 14,
    driveStart: 80, clockRemainingMs: 0,
  });
  await expect(page.locator('#ov-quarter')).toHaveClass(/show/);
  const blocked = await contracts(page);
  expect(blocked.activePlay).toBeNull();
  expect(blocked.render.publicSpecialAction).toBeNull();
  expect(await page.evaluate(() => window.__rngCalls.football)).toBe(0);
  await page.locator('#ov-quarter .ov-btn').click();
  const q4 = await contracts(page);
  expect(q4.render.quarter).toBe(4);
  expect(q4.activePlay?.playType).toBe('fieldGoal');
  expect(q4.activePlay.context.quarter).toBe(4);
});

test('choosing Go on fourth down reserves no snap at 0:00', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  const before = await seed(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 4, yardsToGo: 1, yardLine: 45, firstDownLine: 46,
    driveStart: 20, clockRemainingMs: 4000,
  });
  await page.locator('#decision-grid .decision-btn[data-action="go"]').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  await advance(page, 4000);
  await expect(page.locator('#ov-quarter')).toHaveClass(/show/);
  expect((await contracts(page)).activePlay).toBeNull();
  await page.locator('#ov-quarter .ov-btn').click();
  const next = await render(page);
  expect(next).toMatchObject({ quarter: 2, mode: 'call', down: 4, possessionId: before.possessionId });
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
});

test('Options pauses the exact retry question and Resume restores it', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...OFFENSE, quarter: 2, clockRemainingMs: 200000 });
  await tapCall(page);
  await tapAnswer(page, 'wrong');
  const before = await contracts(page);
  const feedback = await page.locator('#feedback').textContent();
  const disabled = await page.locator('#btn-row .ans-btn').evaluateAll(buttons => buttons.map(b => b.disabled));
  await page.locator('#options-toggle').click();
  await expect(page.locator('#ov-options')).toHaveClass(/show/);
  await expect(page.locator('#ov-options-title')).toHaveText('Game Paused');
  await expect(page.locator('#ov-options-btn')).toHaveText('Resume');
  await expect(page.locator('#ov-options-sub')).toContainText('starts over');
  await expect(page.locator('#wrap')).toHaveAttribute('aria-hidden', 'true');
  expect((await render(page)).interrupted).toBe('options');
  await advance(page, 120000);
  expect((await render(page)).gameClock).toMatchObject({ remainingMs: 200000, running: false });
  await page.locator('#ov-options-btn').click();
  await expect(page.locator('#ov-options')).not.toHaveClass(/show/);
  const after = await contracts(page);
  expect(after.questionInstance.questionInstanceId).toBe(before.questionInstance.questionInstanceId);
  expect(after.questionUi).toEqual(before.questionUi);
  expect(await page.locator('#feedback').textContent()).toBe(feedback);
  expect(await page.locator('#btn-row .ans-btn').evaluateAll(buttons => buttons.map(b => b.disabled))).toEqual(disabled);
  // Focus returns to the control that opened the pause.
  await expect.poll(() => page.evaluate(() => document.activeElement.id)).toBe('options-toggle');
  expect(await page.evaluate(() => window.__footballTest.resume())).toBe(false);
  await advance(page, 1000);
  expect((await render(page)).gameClock).toMatchObject({ remainingMs: 199000, running: true });
});

test('a result timer that comes due during a pause waits for Resume and applies once', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...OFFENSE, quarter: 1, clockRemainingMs: 200000 });
  await tapCall(page);
  await tapAnswer(page, 'correct');
  await page.locator('#options-toggle').click();
  await page.waitForTimeout(2200);
  expect((await render(page)).mode).toBe('feedback');
  await page.locator('#ov-options-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', /call|fourth-down-decision/, { timeout: 3000 });
  const state = await contracts(page);
  expect(state.statsSession.completedPlays).toHaveLength(1);
  expect(await page.evaluate(() => window.__results)).toHaveLength(1);
});

test('backgrounding from an overlay requires explicit Resume and restores that overlay', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, {
    possession: 'offense', direction: 1, quarter: 1, down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100,
    driveStart: 70, clockRemainingMs: 100000,
  });
  await tapCall(page);
  await tapAnswer(page, 'correct');
  await expect(page.locator('#ov-td')).toHaveClass(/show/, { timeout: 5000 });
  const tdSub = await page.locator('#ov-td-sub').textContent();
  const setVisibility = value => page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, value);
  await setVisibility('hidden');
  await expect(page.locator('#ov-options')).toHaveClass(/show/);
  await expect(page.locator('#ov-td')).not.toHaveClass(/show/);
  expect((await render(page)).interrupted).toBe('background');
  expect(await page.evaluate(() => window.__footballTest.resume())).toBe(false);
  await setVisibility('visible');
  await expect(page.locator('#ov-options-sub')).toContainText('background');
  expect((await render(page)).interrupted).toBe('background');
  await page.locator('#ov-options-btn').click();
  await expect(page.locator('#ov-td')).toHaveClass(/show/);
  expect(await page.locator('#ov-td-sub').textContent()).toBe(tdSub);
  expect((await render(page))).toMatchObject({ mode: 'touchdown', interrupted: null });
  await page.locator('#ov-td-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'conversion-decision');
});

test('pagehide during an active question pauses the clock; the start and final screens are not paused', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...DEFENSE, quarter: 2, clockRemainingMs: 90000 });
  await tapCall(page);
  await advance(page, 1000);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('#ov-options')).toHaveClass(/show/);
  await advance(page, 50000);
  expect((await render(page)).gameClock.remainingMs).toBe(89000);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  expect((await render(page)).interrupted).toBe('background');
  await page.locator('#ov-options-btn').click();
  expect((await render(page)).mode).toBe('question');

  await seed(page, { ...OFFENSE, quarter: 4, clockRemainingMs: 500 });
  await advance(page, 500);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  expect(await page.evaluate(() => window.__footballTest.interrupt('background'))).toBe(false);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
});

test('quarter length is a validated next-game preference that never changes the current game', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(key => {
    if (sessionStorage.getItem('qlen-seeded')) return;
    sessionStorage.setItem('qlen-seeded', '1');
    localStorage.setItem(key, '7');
  }, QUARTER_KEY);
  await page.goto('/football/');
  expect(await page.evaluate(key => localStorage.getItem(key), QUARTER_KEY)).toBe('7');
  expect((await render(page)).quarterMinutesPreference).toBe(5);
  await expect(page.locator('#start-options-btn')).toContainText('5-min quarters');
  await page.locator('#start-options-btn').click();
  await expect(page.locator('#ov-options')).toHaveClass(/show/);
  await expect(page.locator('#ov-options-title')).toHaveText('Options');
  await expect(page.locator('#ov-options-note')).toContainText('longer than 20 minutes');
  await page.getByRole('radio', { name: '3 minutes' }).check();
  expect(await page.evaluate(key => localStorage.getItem(key), QUARTER_KEY)).toBe('3');
  await expect(page.locator('#ov-options-note')).toContainText('longer than 12 minutes');
  await page.locator('#ov-options-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#start-options-btn')).toContainText('3-min quarters');
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  expect((await render(page)).gameClock.quarterLengthMs).toBe(180000);
  await expect(page.locator('#s-clock')).toHaveText(/^(3:00|2:5\d)$/);
  await page.locator('#options-toggle').click();
  await expect(page.locator('#quarter-length-status')).toContainText('This game uses 3-minute quarters');
  await page.getByRole('radio', { name: '10 minutes' }).check();
  await expect(page.locator('#quarter-length-status')).toContainText('next game');
  await page.locator('#ov-options-btn').click();
  const view = await render(page);
  expect(view.gameClock.quarterLengthMs).toBe(180000);
  expect(view.quarterMinutesPreference).toBe(10);
  expect(await page.evaluate(key => localStorage.getItem(key), QUARTER_KEY)).toBe('10');
  await page.reload();
  expect((await render(page)).quarterMinutesPreference).toBe(10);
});

test('an unavailable preference store stays honest and still applies to the next game', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.addInitScript(key => {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'SecurityError');
      return nativeSetItem.call(this, name, value);
    };
  }, QUARTER_KEY);
  await page.goto('/football/');
  await page.locator('#start-options-btn').click();
  await page.getByRole('radio', { name: '10 minutes' }).check();
  await expect(page.locator('#quarter-length-status')).toContainText('could not save');
  await page.locator('#ov-options-btn').click();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  expect((await render(page)).gameClock.quarterLengthMs).toBe(600000);
});

test('a rematch starts a fresh clock and stale clock ticks from the old game do nothing', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...OFFENSE, quarter: 4, clockRemainingMs: 1000 });
  await advance(page, 1000);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  const ended = await render(page);
  await page.evaluate(() => restart('quick'));
  expect((await render(page))).toMatchObject({ mode: 'start', gameClock: null });
  await advance(page, 10000);
  expect((await render(page)).mode).toBe('start');
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  const next = await render(page);
  expect(next.gameId).not.toBe(ended.gameId);
  expect(next.gameClock).toMatchObject({ quarter: 1, remainingMs: 300000 });
});

async function startSeason(page) {
  await page.goto('/football/');
  await page.evaluate(key => localStorage.removeItem(key), SEASON_KEY);
  await page.reload();
  await page.getByRole('radio', { name: /3-Game Season/ }).check();
  await page.locator('#start-game-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  await page.evaluate((key) => {
    window.__footballTest.useManualClock(0);
    const nativeSetItem = Storage.prototype.setItem;
    window.__seasonWrites = 0;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) window.__seasonWrites++;
      return nativeSetItem.call(this, name, value);
    };
  }, SEASON_KEY);
}

const seasonResults = page => page.evaluate(key => {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw).currentSeason.results : [];
}, SEASON_KEY);

for (const path of ['idle', 'terminal', 'nonterminal', 'conversion']) {
  test(`a Season game settles exactly once when Q4 time expires (${path})`, async ({ page }, testInfo) => {
    primaryOnly(testInfo);
    await startSeason(page);
    const base = { quarter: 4, scores: { player: 10, opponent: 3 }, clockRemainingMs: 1000 };
    if (path === 'idle') {
      await seed(page, { ...OFFENSE, ...base });
      expect(await seasonResults(page)).toHaveLength(0);
      await advance(page, 1000);
    } else if (path === 'terminal') {
      await seed(page, { ...base, possession: 'offense', direction: 1, down: 4, yardsToGo: 9, yardLine: 30, firstDownLine: 39, driveStart: 20 });
      await page.locator('#decision-grid .decision-btn[data-action="punt"]').click();
      await advance(page, 2000);
      expect(await seasonResults(page)).toHaveLength(0);
      await tapAnswer(page, 'correct');
    } else if (path === 'nonterminal') {
      await seed(page, { ...OFFENSE, ...base });
      await tapCall(page);
      await advance(page, 2000);
      await tapAnswer(page, 'correct');
    } else {
      await seed(page, { ...base, possession: 'offense', direction: 1, down: 1, yardsToGo: 1, yardLine: 99, firstDownLine: 100, driveStart: 70 });
      await tapCall(page);
      await advance(page, 2000);
      await tapAnswer(page, 'correct');
      await expect(page.locator('#ov-td')).toHaveClass(/show/, { timeout: 5000 });
      expect(await seasonResults(page)).toHaveLength(0);
      await page.locator('#ov-td-btn').click();
      await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
      expect(await seasonResults(page)).toHaveLength(0);
      await tapAnswer(page, 'correct');
    }
    await expect.poll(() => seasonResults(page)).toHaveLength(1);
    await expect(page.locator('#ov-end')).toHaveClass(/show/, { timeout: 5000 });
    await advance(page, 10000);
    await page.evaluate(() => {
      showGameOver();
      routePossessionPresentation('Presentation only.');
      finishPossession('Legacy presentation only.');
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__seasonWrites)).toBe(1);
    const [result] = await seasonResults(page);
    const view = await render(page);
    expect(result).toMatchObject({ gameNumber: 1, playerScore: view.score.player, opponentScore: view.score.opponent });
  });
}

test('the clock counts down in real elapsed time on the call screen (live smoke)', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call');
  const first = (await render(page)).gameClock;
  expect(first.running).toBe(true);
  await page.waitForTimeout(1600);
  const second = (await render(page)).gameClock;
  expect(first.remainingMs - second.remainingMs).toBeGreaterThanOrEqual(1300);
  expect(first.remainingMs - second.remainingMs).toBeLessThan(5000);
  await expect(page.locator('#s-clock')).toHaveText(/^4:5\d$/);
});

// Geometry: every target keeps the clock and Options visible and tappable,
// and the call grid above the fold, on call and question screens.
test('the clock and Options stay visible and tappable with the call grid above the fold', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  for (const phase of ['call', 'question', 'options']) {
    if (phase === 'question') await tapCall(page);
    if (phase === 'options') {
      await page.locator('#options-toggle').click();
      await expect(page.locator('#ov-options')).toHaveClass(/show/);
    }
    const geometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      const viewport = { width: innerWidth, height: innerHeight };
      const radios = Array.from(document.querySelectorAll('.quarter-length-option')).map(el => el.getBoundingClientRect().toJSON());
      return {
        viewport,
        scrollHeight: document.scrollingElement.scrollHeight,
        scrollWidth: document.scrollingElement.scrollWidth,
        clock: rect('#s-clock'), options: rect('#options-toggle'), grid: rect('#call-grid'), status: rect('#status'),
        resume: rect('#ov-options-btn'), radios,
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewport.width);
    if (phase === 'options') {
      expect(geometry.resume.height).toBeGreaterThanOrEqual(44);
      for (const radio of geometry.radios) {
        expect(radio.height).toBeGreaterThanOrEqual(44);
        expect(radio.right).toBeLessThanOrEqual(geometry.viewport.width);
      }
      continue;
    }
    expect(geometry.clock.width).toBeGreaterThan(0);
    expect(geometry.clock.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    expect(geometry.options.width).toBeGreaterThanOrEqual(44);
    expect(geometry.options.height).toBeGreaterThanOrEqual(44);
    expect(geometry.options.top).toBeGreaterThanOrEqual(0);
    expect(geometry.options.bottom).toBeLessThanOrEqual(geometry.status.top + 0.5);
    if (phase === 'call') {
      expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.viewport.height);
      expect(geometry.grid.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    }
    await testInfoScreenshot(page, phase);
  }
});

async function testInfoScreenshot(page, phase) {
  const info = test.info();
  const path = info.outputPath(`clock-${phase}.png`);
  await page.screenshot({ path });
  await info.attach(`clock-${phase}`, { path, contentType: 'image/png' });
}

// R2: Escape belongs to the shown Options modal. It must not collapse the
// expanded Coach Replay paused behind it; with no modal, Escape still does.
test('Escape inside paused Options keeps the expanded worked explanation exactly; without a modal it still collapses', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...OFFENSE, quarter: 2, clockRemainingMs: 200000 });
  await tapCall(page);
  await tapAnswer(page, 'wrong');
  await tapAnswer(page, 'wrong');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  await page.locator('#question-learn-why').click();
  await expect.poll(async () => (await render(page)).reviewExpanded).toBe(true);
  const snapshot = () => page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    const review = document.getElementById('worked-review');
    return {
      reviewExpanded: contracts.render.reviewExpanded,
      reviewSatisfied: contracts.render.reviewSatisfied,
      mode: contracts.render.mode,
      reviewHidden: review.hidden,
      reviewContent: document.getElementById('worked-review-content').innerHTML,
      feedback: document.getElementById('feedback').textContent,
      answers: Array.from(document.querySelectorAll('#btn-row .ans-btn'), b => ({ disabled: b.disabled, cls: b.className })),
      continueHidden: document.getElementById('question-continue').classList.contains('hidden'),
      questionInstance: contracts.questionInstance,
      questionUi: contracts.questionUi,
      pendingResolution: contracts.pendingResolution,
      completedPlays: contracts.statsSession.completedPlays.length,
      clock: contracts.render.gameClock,
    };
  });
  const before = await snapshot();
  expect(before.reviewContent.length).toBeGreaterThan(0);
  expect(before.reviewHidden).toBe(false);
  expect(before.clock.running).toBe(false);

  await page.locator('#options-toggle').click();
  const options = page.locator('#ov-options');
  await expect(options).toHaveClass(/show/);
  await expect(page.locator('#ov-options-btn')).toBeFocused();
  for (let index = 0; index < 2; index++) {
    await page.keyboard.press('Escape');
    await expect(options).toHaveClass(/show/);
    expect(await page.evaluate(() => document.activeElement?.closest('.overlay')?.id)).toBe('ov-options');
    expect((await render(page)).interrupted).toBe('options');
    expect(await snapshot()).toEqual(before);
  }
  await page.locator('#ov-options-btn').click();
  await expect(options).not.toHaveClass(/show/);
  expect(await snapshot()).toEqual(before);

  // Ordinary explanation Escape with no modal still collapses the review.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await render(page)).reviewExpanded).toBe(false);
  expect((await render(page)).mode).toBe('explanation');
  expect((await contracts(page)).pendingResolution).toEqual(before.pendingResolution);
});

// R3 (G222-R2b-F04): WebKit does not focus a tapped button, so <body> can be
// the active element when Options opens. Reproduce that condition in any
// engine: no focused control, then a click event that moves no focus.
test('Resume restores focus to Options, not the page body, when the tap left nothing focused', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await boot(page);
  await seed(page, { ...OFFENSE, quarter: 2, clockRemainingMs: 200000 });
  await tapCall(page);
  await tapAnswer(page, 'wrong');
  const before = await contracts(page);
  const disabled = await page.locator('#btn-row .ans-btn').evaluateAll(buttons => buttons.map(b => b.disabled));
  await page.evaluate(() => document.activeElement?.blur());
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.locator('#options-toggle').dispatchEvent('click');
  await expect(page.locator('#ov-options')).toHaveClass(/show/);
  await expect(page.locator('#ov-options-btn')).toBeFocused();
  await page.locator('#ov-options-btn').press('Enter');
  await expect(page.locator('#ov-options')).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => document.activeElement.id)).toBe('options-toggle');
  const after = await contracts(page);
  expect(after.questionInstance).toEqual(before.questionInstance);
  expect(after.questionUi).toEqual(before.questionUi);
  expect(after.pendingResolution).toEqual(before.pendingResolution);
  expect(await page.locator('#btn-row .ans-btn').evaluateAll(buttons => buttons.map(b => b.disabled))).toEqual(disabled);

  // A background pause with nothing focused resumes onto a usable answer.
  await page.evaluate(() => document.activeElement?.blur());
  expect(await page.evaluate(() => window.__footballTest.interrupt('background'))).toBe(true);
  await page.locator('#ov-options-btn').press('Enter');
  await expect(page.locator('#ov-options')).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => document.activeElement.matches('#btn-row .ans-btn:not(:disabled)'))).toBe(true);
  expect((await contracts(page)).questionUi).toEqual(before.questionUi);
});
