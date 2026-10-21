import { test, expect } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';

// #51 quarters and halves on the real call-tap path, in every project. Setup
// uses only the existing test seam: a seeded drive in the case's quarter, a
// fresh learning session (or one with two supported quarter-half results for
// a guided start) and fixed RNG streams. The ordinary scheduler chooses the
// family from a real call tap; no question is injected. Every later state
// change is a real tap or key press. The curriculum fixture installs the
// session mute and checks its proof after each navigation, before any input.

const STATS_KEY = 'footballMathStats:v1';

function seedFor(possession, quarter) {
  return { possession, direction: possession === 'offense' ? 1 : -1, quarter, down: 2, yardLine: 50,
    firstDownLine: possession === 'offense' ? 60 : 40, yardsToGo: 10, driveStart: 50,
    scores: { player: 7, opponent: 6 }, totalYards: { player: 71, opponent: 71 }, plays: 4, drivePlays: 2 };
}

// Expected copy, answers and pictures written from the four-quarter game and
// the case's quarter. `rows` lists each strip's piece count; `labels` the
// first strip's piece labels; `current` the quarter marked now; `shaded` the
// worked pieces per strip (labels where pieces have them, else a count).
const CASES = [
  { id: 'still-to-come-q1', familyId: 'quarters-still-to-come', possession: 'offense', quarter: 1, answer: 3, choices: 4,
    prompt: "It's the first quarter. How many more quarters come after this one?",
    hint: "Count the quarters after the one we're playing. Don't include the current quarter.",
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: 'Q1', shaded: [['Q2', 'Q3', 'Q4']], split: false, caption: '3 quarters after Q1' },
  { id: 'still-to-come-q4-zero', familyId: 'quarters-still-to-come', possession: 'defense', quarter: 4, answer: 0, choices: 4,
    prompt: "It's the fourth quarter. How many more quarters come after this one?",
    hint: "Count the quarters after the one we're playing. Don't include the current quarter.",
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: 'Q4', shaded: [[]], split: false, caption: '0 quarters after Q4' },
  { id: 'before-halftime-q1', familyId: 'quarters-before-halftime', possession: 'defense', quarter: 1, answer: 1, choices: 4,
    prompt: "It's the first quarter. After this quarter, how many more quarters will be played before halftime?",
    hint: 'Halftime splits the four quarters into two equal halves. Count the quarters after this one that come before halftime.',
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: 'Q1', shaded: [['Q2']], split: true, caption: '1 quarter before halftime' },
  { id: 'finished-q3', familyId: 'quarters-finished', possession: 'offense', quarter: 3, answer: 2, choices: 4,
    prompt: "We're playing the third quarter. How many quarters are completely finished?",
    hint: "Count only the quarters before the one we're playing. The quarter we're playing isn't finished yet.",
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: 'Q3', shaded: [['Q1', 'Q2']], split: false, caption: '2 quarters finished' },
  { id: 'in-half-q2', familyId: 'quarters-in-half', possession: 'defense', quarter: 2, answer: 2, choices: 4,
    prompt: 'How many quarters make the first half of this game?',
    hint: 'The game has four equal quarters. The first half is one of two equal parts of the game.',
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: null, shaded: [['Q1', 'Q2']], split: true, groups: ['1st half', '2nd half'], caption: '2 quarters in the first half' },
  { id: 'second-half-q4', familyId: 'second-half-quarters', possession: 'offense', quarter: 4, answer: '3rd and 4th', choices: 3,
    prompt: 'Which two quarters make the second half of this game?',
    hint: 'The game has four equal quarters. Split them in order into two equal halves. The second half comes after halftime.',
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: null, shaded: [['Q3', 'Q4']], split: true, groups: ['1st half', '2nd half'], caption: 'The 3rd and 4th quarters' },
  { id: 'boundary-halftime-q2', familyId: 'game-part-boundary', possession: 'offense', quarter: 2, answer: 'One half', choices: 4,
    prompt: 'At halftime, what part of this four-quarter game is finished?',
    hint: 'Halftime comes when the second quarter ends. Count the finished quarters, then name that part of the four-quarter game.',
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: 'Q2', shaded: [['Q1', 'Q2']], split: true, groups: ['1st half', '2nd half'], caption: 'One half finished' },
  { id: 'halves-whole-q3', familyId: 'halves-make-whole', possession: 'defense', quarter: 3, answer: 'One whole game', choices: 3,
    prompt: 'The first half and the second half together make what?',
    hint: 'A half is one of two equal parts. Put the first half and the second half together, then see how much of the game they cover.',
    rows: [2], labels: ['1st half', '2nd half'], current: null, shaded: [['1st half', '2nd half']], split: false, caption: 'One whole game' },
  { id: 'compare-half-quarter-q1', familyId: 'game-part-compare', possession: 'offense', quarter: 1, answer: 'One half', choices: 3,
    prompt: 'Compare one half and one quarter of this same game. Which is bigger, or are they the same size?',
    hint: 'Picture this game split into two equal halves and into four equal quarters. Both strips are the same length. Compare how much of the game each part covers.',
    rows: [2, 4], labels: [null, null], current: null, shaded: [1, 1], split: false, caption: 'One half is bigger.' },
  { id: 'compare-same-size-q3', familyId: 'game-part-compare', possession: 'defense', quarter: 3, answer: 'Same size', choices: 3,
    prompt: 'Compare two quarters and one half of this same game. Which is bigger, or are they the same size?',
    hint: 'Picture this game split into two equal halves and into four equal quarters. Both strips are the same length. Compare how much of the game each part covers.',
    rows: [4, 2], labels: [null, null, null, null], current: null, shaded: [2, 1], split: false, caption: 'They are the same size.' },
  { id: 'compare-three-quarters-q4', familyId: 'game-part-compare', possession: 'offense', quarter: 4, answer: 'Three quarters', choices: 3,
    prompt: 'Compare one half and three quarters of this same game. Which is bigger, or are they the same size?',
    hint: 'Picture this game split into two equal halves and into four equal quarters. Both strips are the same length. Compare how much of the game each part covers.',
    rows: [2, 4], labels: [null, null], current: null, shaded: [1, 3], split: false, caption: 'Three quarters is bigger.' },
  { id: 'half-read-q3', familyId: 'half-read', possession: 'offense', quarter: 3, answer: '2nd half', choices: 4,
    prompt: 'The scoreboard shows Q3. What part of the game is it?',
    hint: 'Split the four quarters into two equal groups in order, then place Q3 in its group.',
    rows: [4], labels: ['Q1', 'Q2', 'Q3', 'Q4'], current: 'Q3', shaded: [['Q3', 'Q4']], split: true, groups: ['1st half', '2nd half'], caption: 'Q3 is in the 2nd half' },
];
const byId = id => CASES.find(item => item.id === id);

// Safari's default keyboard policy skips buttons on Tab; Option-Tab is its
// all-controls gesture. Applied to Playwright WebKit on macOS only.
function tabKey(browserName) {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

async function openGame(page, possession) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(key => { try { window.localStorage.removeItem(key); } catch (error) {} }, STATS_KEY);
  await page.goto(`/football/?boot=${possession}-call`);
  await expectFootballTestMuted(page);
  await page.evaluate(() => {
    window.__qhPrepare = ({ seed, draw, guidedStart }) => {
      // Seed first: it may initialize a fresh game session and its streams.
      __footballTest.seedDriveState(seed);
      __footballTest.resetLearning();
      if (guidedStart) {
        // Two supported results for the shared quarter-half skill, through the
        // production learning API, make the next quarter-half question guided.
        const family = FOOTBALL_CONTEXTUAL_QUESTIONS.FAMILY_REGISTRY.scrimmage.find(row => row.familyId === 'half-read');
        for (const index of [1, 2]) {
          FOOTBALL_LEARNING.recordResolved(learningSession, {
            ...family, id: 'prior-practice', familyId: 'prior-practice', concept: 'prior-practice',
            contextId: `prior-${index}`, questionInstanceId: 9000 + index,
          }, 'retryCorrect', { support: 'guided' });
        }
      }
      window.__qhDraws = { football: 0, scheduler: 0, presentation: 0 };
      __footballTest.setRngStreams({
        football: () => { window.__qhDraws.football++; return 0.2; },
        scheduler: () => { window.__qhDraws.scheduler++; return draw; },
        presentation: () => { window.__qhDraws.presentation++; return 0.4; },
      });
    };
  });
  return errors;
}

// The same scheduler scan as the existing arithmetic and natural-yardage
// specs: each probe reseeds and taps the first call tile in-page.
async function findDraw(page, item, guidedStart = false) {
  return page.evaluate(({ seed, familyId, guidedStart }) => {
    window.__qhPrepare({ seed, draw: 0.5, guidedStart });
    for (let i = 0; i < 1000; i++) {
      const draw = (i + 0.5) / 1000;
      window.__qhPrepare({ seed, draw, guidedStart });
      document.querySelector('#call-grid .call-btn').click();
      if (__footballTest.activeContracts().questionInstance?.familyId === familyId) return draw;
    }
    return null;
  }, { seed: seedFor(item.possession, item.quarter), familyId: item.familyId, guidedStart });
}

async function present(page, item, { guidedStart = false } = {}) {
  const draw = await findDraw(page, item, guidedStart);
  expect(draw, `${item.id}: ${item.familyId} is reachable from a real call`).not.toBeNull();
  await page.evaluate(({ seed, draw, guidedStart }) => window.__qhPrepare({ seed, draw, guidedStart }),
    { seed: seedFor(item.possession, item.quarter), draw, guidedStart });
  await page.locator('#call-grid .call-btn').first().tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const contracts = await page.evaluate(() => __footballTest.activeContracts());
  const question = contracts.questionInstance;
  expect(question.familyId).toBe(item.familyId);
  expect(contracts.activePlay.context.quarter).toBe(item.quarter);
  expect(contracts.activePlay.context.possession).toBe(item.possession);
  expect(question.evidenceClass).toBe('independent');
  expect(question.answer.value).toBe(item.answer);
  expect(question.choices).toHaveLength(item.choices);
  expect(new Set(question.choices.map(choice => choice.value)).size).toBe(item.choices);
  await expect(page.locator('#question')).toHaveText(item.prompt);
  expect(question.hint.text).toBe(item.hint);
  await expect(page.locator('#btn-row .ans-btn:not(.hidden)')).toHaveCount(item.choices);
  return { question, play: contracts.activePlay, serialized: JSON.stringify(question) };
}

async function overlayFacts(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById('math-overlay');
    const rows = [...overlay.querySelectorAll('.math-game-row')].map(row => {
      const pieces = [...row.querySelectorAll('.math-game-piece')];
      const label = piece => piece.querySelector('.math-game-label')?.textContent ?? null;
      return {
        pieces: pieces.length,
        labels: pieces.map(label),
        current: pieces.filter(piece => piece.hasAttribute('data-current')).map(label),
        shaded: pieces.filter(piece => piece.hasAttribute('data-shaded')).map(label),
        width: row.querySelector('.math-game-strip').getBoundingClientRect().width,
        caption: row.querySelector('.math-game-caption')?.textContent ?? null,
      };
    });
    return {
      hidden: overlay.hidden,
      children: overlay.childElementCount,
      type: overlay.dataset.type ?? null,
      support: overlay.dataset.support ?? null,
      ariaLabel: overlay.getAttribute('aria-label'),
      text: overlay.textContent,
      html: overlay.innerHTML,
      rows,
      splits: overlay.querySelectorAll('.math-game-split').length,
      halftime: [...overlay.querySelectorAll('.math-game-halftime')].map(node => node.textContent),
      groups: [...overlay.querySelectorAll('.math-game-group')].map(node => node.textContent).filter(Boolean),
      worked: [...overlay.querySelectorAll('.math-worked')].map(node => node.textContent),
      math: JSON.parse(render_game_to_text()).math,
    };
  });
}

function expectNoPicture(facts, label) {
  expect(facts.hidden, `${label}: no picture on the first try`).toBe(true);
  expect(facts.children, `${label}: overlay cleared`).toBe(0);
  expect(facts.ariaLabel, `${label}: no stale overlay name`).toBe('');
  expect(facts.type, label).toBeNull();
}

function expectGuided(facts, item, question, label) {
  expect(facts.hidden, label).toBe(false);
  expect(facts.type, label).toBe('game-parts');
  expect(facts.support, label).toBe('guided');
  expect(facts.ariaLabel, label).toBe(question.visuals.guided.ariaLabel);
  expect(facts.rows.map(row => row.pieces), label).toEqual(item.rows);
  expect(facts.rows[0].labels, label).toEqual(item.labels);
  expect(facts.rows.flatMap(row => row.current), label).toEqual(item.current ? [item.current] : []);
  // Countable structure only: nothing shaded, no split, half labels or result.
  expect(facts.rows.flatMap(row => row.shaded), `${label}: nothing shaded`).toEqual([]);
  expect(facts.splits, `${label}: no halftime split`).toBe(0);
  expect(facts.halftime, label).toEqual([]);
  expect(facts.groups, label).toEqual([]);
  expect(facts.worked, `${label}: no result caption`).toEqual([]);
  expect(facts.text.toLowerCase(), label).not.toContain(item.caption.toLowerCase());
  expect(facts.math.result, label).toBeNull();
  expect(facts.math.revealsAnswer, label).toBe(false);
  // Same game: every strip in one picture has the same length.
  for (const row of facts.rows) expect(Math.abs(row.width - facts.rows[0].width), `${label}: equal strip length`).toBeLessThanOrEqual(1);
}

function expectWorked(facts, item, question, label) {
  expect(facts.hidden, label).toBe(false);
  expect(facts.type, label).toBe('game-parts');
  expect(facts.support, label).toBe('worked');
  expect(facts.ariaLabel, label).toBe(question.visuals.worked.ariaLabel);
  expect(facts.rows.map(row => row.pieces), label).toEqual(item.rows);
  // Unlabeled comparison pieces are counted; labeled pieces are named.
  const counted = typeof item.shaded[0] === 'number';
  expect(facts.rows.map(row => (counted ? row.shaded.length : row.shaded)), `${label}: solved pieces`).toEqual(item.shaded);
  expect(facts.splits, label).toBe(item.split ? 1 : 0);
  expect(facts.halftime, label).toEqual(item.split ? ['HALFTIME'] : []);
  expect(facts.groups, label).toEqual(item.groups ?? []);
  expect(facts.worked, label).toEqual([item.caption]);
  expect(facts.math.revealsAnswer, label).toBe(true);
  expect(facts.math.result.value, label).toBe(item.answer);
  for (const row of facts.rows) expect(Math.abs(row.width - facts.rows[0].width), `${label}: equal strip length`).toBeLessThanOrEqual(1);
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const field = document.getElementById('field-wrap');
    const fieldBox = field.getBoundingClientRect();
    const inner = {
      left: fieldBox.left + field.clientLeft, top: fieldBox.top + field.clientTop,
      right: fieldBox.left + field.clientLeft + field.clientWidth, bottom: fieldBox.top + field.clientTop + field.clientHeight,
    };
    const overlay = document.getElementById('math-overlay');
    // Text is clipped when its own box overflows, or when its real glyph
    // bounds (a text Range) leave its piece or run into the current
    // quarter's 4px underline.
    const textBox = element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    };
    const clipped = [...overlay.querySelectorAll('.math-game-label, .math-game-caption, .math-game-group, .math-game-halftime, .math-worked, .math-game-now')]
      .filter(element => {
        if (!element.textContent) return false;
        if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) return true;
        const piece = element.closest('.math-game-piece');
        if (!piece) return false;
        const text = textBox(element);
        const box = piece.getBoundingClientRect();
        const floor = box.bottom - (piece.hasAttribute('data-current') ? 4 : 0);
        return text.left < box.left - 0.5 || text.right > box.right + 0.5 || text.top < box.top - 0.5 || text.bottom > floor + 0.5;
      })
      .map(element => element.textContent);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      inner,
      overlay: rect(overlay),
      parts: [...overlay.querySelectorAll('*')].map(rect).filter(box => box.width > 0 || box.height > 0),
      clipped,
      mute: rect(document.getElementById('mute-toggle')),
      answers: [...document.querySelectorAll('#btn-row .ans-btn:not(.hidden)')].map(rect),
    };
  });
}

function intersects(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// Answer targets: the full choice set, 44px, inside the viewport and above the fold.
function expectAnswers(metrics, label, count) {
  const e = 1;
  expect(metrics.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.viewport.width + e);
  expect(metrics.answers.length, `${label}: visible answers`).toBe(count);
  for (const answer of metrics.answers) {
    expect(answer.width, `${label}: answer width`).toBeGreaterThanOrEqual(44);
    expect(answer.height, `${label}: answer height`).toBeGreaterThanOrEqual(44);
    expect(answer.left, `${label}: answer inside the viewport`).toBeGreaterThanOrEqual(-e);
    expect(answer.right, `${label}: answer inside the viewport`).toBeLessThanOrEqual(metrics.viewport.width + e);
    expect(answer.bottom, `${label}: answer above the fold`).toBeLessThanOrEqual(metrics.viewport.height + e);
  }
}

function expectGeometry(metrics, label, { answers = null } = {}) {
  const e = 1;
  expect(metrics.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.viewport.width + e);
  for (const box of [metrics.overlay, ...metrics.parts]) {
    expect(box.left, `${label}: picture inside the field (left)`).toBeGreaterThanOrEqual(metrics.inner.left - e);
    expect(box.right, `${label}: picture inside the field (right)`).toBeLessThanOrEqual(metrics.inner.right + e);
    expect(box.top, `${label}: picture inside the field (top)`).toBeGreaterThanOrEqual(metrics.inner.top - e);
    expect(box.bottom, `${label}: picture inside the field (bottom)`).toBeLessThanOrEqual(metrics.inner.bottom + e);
    expect(intersects(box, metrics.mute), `${label}: picture clear of the sound toggle`).toBe(false);
  }
  expect(metrics.clipped, `${label}: no clipped picture text`).toEqual([]);
  expect(metrics.mute.width, `${label}: sound toggle width`).toBeGreaterThanOrEqual(44);
  expect(metrics.mute.height, `${label}: sound toggle height`).toBeGreaterThanOrEqual(44);
  if (answers !== null) expectAnswers(metrics, label, answers);
}

// The finalized stats row, its learning projection and its persisted copy.
async function expectEvidence(page, play, familyId, resolution, attempts, resolvedSupport, label) {
  const evidence = await page.evaluate(({ playId }) => {
    const session = __footballTest.activeContracts().statsSession;
    const row = session.completedPlays.find(candidate => candidate.playId === playId) ?? null;
    const projected = FOOTBALL_STATS.learningSnapshot().challengeEvidence.find(candidate => candidate.playId === playId) ?? null;
    const resolved = __footballTest.learningState().events.filter(event => event.type === 'resolved' && event.familyId === row?.links.familyId).at(-1) ?? null;
    return { row, projected, resolved };
  }, { playId: play.playId });
  const plainAttempts = list => list.map(({ number, correct, support }) => ({ number, correct, support }));
  expect(evidence.row, `${label}: finalized stats row`).not.toBeNull();
  expect(evidence.row.links.familyId, label).toBe(familyId);
  expect(evidence.row.question.evidenceClass, label).toBe('independent');
  expect(evidence.row.resolution, label).toBe(resolution);
  expect(plainAttempts(evidence.row.attempts), label).toEqual(attempts);
  expect(evidence.projected.resolution, `${label}: learning projection`).toBe(resolution);
  expect(evidence.projected.attempts, `${label}: learning projection`).toEqual(attempts);
  expect(evidence.resolved.result, `${label}: learning event`).toBe(resolution);
  expect(evidence.resolved.support, `${label}: learning support`).toBe(resolvedSupport);
  // The browser-local store keeps the same attempts and resolution.
  await expect.poll(() => page.evaluate(({ key, playId }) => {
    const row = JSON.parse(localStorage.getItem(key) || 'null')?.recentPlays?.find(candidate => candidate.playId === playId);
    return row ? { resolution: row.resolution, attempts: row.attempts.map(({ number, correct, support }) => ({ number, correct, support })) } : null;
  }, { key: STATS_KEY, playId: play.playId }), { message: `${label}: persisted row` }).toEqual({ resolution, attempts });
}

for (const item of CASES) {
  test(`${item.id}: no first-try picture, unsolved retry pieces, solved worked pieces, Replay and second miss`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const errors = await openGame(page, item.possession);
    const { question, play, serialized } = await present(page, item);
    expect(question.support).toBe('initial');
    const label = `${item.id} ${testInfo.project.name}`;
    expectNoPicture(await overlayFacts(page), `${label} initial`);
    expectAnswers(await geometry(page), `${label} initial`, item.choices);
    await page.screenshot({ path: testInfo.outputPath(`${item.id}-initial.png`) });

    const wrong = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
    await page.locator(`[data-choice-id="${wrong[0]}"]`).tap();
    await expect(page.locator('#feedback')).toHaveText(`Good try. ${item.hint}`);
    await expect(page.locator(`[data-choice-id="${wrong[0]}"]`)).toBeDisabled();
    await expect(page.locator(`[data-choice-id="${wrong[0]}"]`)).toHaveClass(/wrong/);
    await expect(page.locator('#btn-row .ans-btn.correct')).toHaveCount(0);
    expectGuided(await overlayFacts(page), item, question, `${label} guided`);
    expectGeometry(await geometry(page), `${label} guided`, { answers: item.choices });
    await page.screenshot({ path: testInfo.outputPath(`${item.id}-guided.png`) });

    await page.locator(`[data-choice-id="${wrong[1]}"]`).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    const worked = await overlayFacts(page);
    expectWorked(worked, item, question, `${label} worked`);
    expectGeometry(await geometry(page), `${label} worked`);
    await expect(page.locator('#film-room-summary-copy')).toHaveText(question.workedExplanation.text);
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`${item.id}-worked.png`) });

    await page.locator('#question-learn-why').tap();
    await expect(page.locator('#worked-review-heading')).toHaveText(`Coach Replay: ${question.workedReview.title}`);
    await expect(page.locator('#worked-review-content .worked-review-steps p')).toHaveText([item.hint, question.workedExplanation.text]);
    // Replay keeps the same frozen question's solved picture.
    const replay = await overlayFacts(page);
    expectWorked(replay, item, question, `${label} Replay`);
    expect(replay.html, `${label}: Replay picture unchanged`).toBe(worked.html);
    expect(await page.evaluate(() => JSON.stringify(__footballTest.activeContracts().questionInstance))).toBe(serialized);
    await page.screenshot({ path: testInfo.outputPath(`${item.id}-replay.png`) });
    await page.locator('#worked-review-back').tap();
    expectWorked(await overlayFacts(page), item, question, `${label} Replay Back`);
    await page.locator('#question-continue').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    expectNoPicture(await overlayFacts(page), `${label} after Continue`);
    await expectEvidence(page, play, item.familyId, 'secondMiss', [
      { number: 1, correct: false, support: 'initial' },
      { number: 2, correct: false, support: 'guided' },
    ], 'worked', label);
    expect(errors).toEqual([]);
  });
}

for (const id of ['still-to-come-q4-zero', 'compare-same-size-q3']) {
  test(`${id}: a first-try correct answer commits without any added picture`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const item = byId(id);
    const errors = await openGame(page, item.possession);
    const { question, play } = await present(page, item);
    expectNoPicture(await overlayFacts(page), `${id} initial`);
    await page.locator(`[data-choice-id="${question.correctChoiceId}"]`).tap();
    await expect(page.locator(`[data-choice-id="${question.correctChoiceId}"]`)).toHaveClass(/correct/);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    expectNoPicture(await overlayFacts(page), `${id} feedback`);
    await page.screenshot({ path: testInfo.outputPath(`${id}-first-correct.png`) });
    await expectEvidence(page, play, item.familyId, 'firstTryCorrect', [{ number: 1, correct: true, support: 'initial' }], 'initial', id);
    expect(errors).toEqual([]);
  });
}

for (const id of ['boundary-halftime-q2', 'finished-q3']) {
  test(`${id}: a retry after the unsolved picture commits as retry-correct`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const item = byId(id);
    const errors = await openGame(page, item.possession);
    const { question, play, serialized } = await present(page, item);
    const wrong = question.choices.find(choice => choice.id !== question.correctChoiceId);
    await page.locator(`[data-choice-id="${wrong.id}"]`).tap();
    expectGuided(await overlayFacts(page), item, question, `${id} guided`);
    expect(await page.evaluate(() => JSON.stringify(__footballTest.activeContracts().questionInstance)), `${id}: retry keeps the same frozen question`).toBe(serialized);
    await page.locator(`[data-choice-id="${question.correctChoiceId}"]`).tap();
    // The feedback sentence belongs to the existing commit path (it varies with
    // the football outcome), so the retry is proved by state, not by copy: the
    // same frozen question, the tapped correct choice, the disabled miss, one
    // committed outcome and the exact attempt events.
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await expect(page.locator(`[data-choice-id="${question.correctChoiceId}"]`)).toHaveClass(/correct/);
    await expect(page.locator(`[data-choice-id="${wrong.id}"]`)).toHaveClass(/wrong/);
    await expect(page.locator(`[data-choice-id="${wrong.id}"]`)).toBeDisabled();
    const after = await page.evaluate(({ playId }) => ({
      committed: JSON.parse(render_game_to_text()).outcomeCommitted,
      linkedInstance: __footballTest.activeContracts().statsSession.completedPlays.find(row => row.playId === playId)?.links.questionInstanceId ?? null,
      attempts: __footballTest.learningState().events.filter(event => event.type === 'attempt')
        .map(({ attempt, selectedChoiceId, correct, support }) => ({ attempt, selectedChoiceId, correct, support })),
    }), { playId: play.playId });
    expect(after.committed, `${id}: outcome committed`).toBe(true);
    expect(after.linkedInstance, `${id}: finalized row links the same question`).toBe(question.questionInstanceId);
    expect(after.attempts, `${id}: attempt events`).toEqual([
      { attempt: 1, selectedChoiceId: wrong.id, correct: false, support: 'initial' },
      { attempt: 2, selectedChoiceId: question.correctChoiceId, correct: true, support: 'guided' },
    ]);
    expectNoPicture(await overlayFacts(page), `${id} feedback`);
    await page.screenshot({ path: testInfo.outputPath(`${id}-retry-correct.png`) });
    await expectEvidence(page, play, item.familyId, 'retryCorrect', [
      { number: 1, correct: false, support: 'initial' },
      { number: 2, correct: true, support: 'guided' },
    ], 'guided', id);
    expect(errors).toEqual([]);
  });
}

for (const id of ['in-half-q2', 'compare-three-quarters-q4']) {
  test(`${id}: supported history starts guided with the unsolved picture; a correct answer stays guided evidence`, async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const item = byId(id);
    const errors = await openGame(page, item.possession);
    const { question, play } = await present(page, item, { guidedStart: true });
    const contracts = await page.evaluate(() => __footballTest.activeContracts());
    expect(question.support).toBe('guided');
    expect(contracts.questionUi.attempt).toBe(1);
    expect(contracts.questionUi.missedChoiceIds).toEqual([]);
    await expect(page.locator('#feedback')).toContainText(item.hint);
    expectGuided(await overlayFacts(page), item, question, `${id} guided start`);
    expectGeometry(await geometry(page), `${id} guided start`, { answers: item.choices });
    await page.screenshot({ path: testInfo.outputPath(`${id}-guided-start.png`) });
    await page.locator(`[data-choice-id="${question.correctChoiceId}"]`).tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    // Guided-first success is recorded with its guided support, not as unsupported.
    await expectEvidence(page, play, item.familyId, 'firstTryCorrect', [{ number: 1, correct: true, support: 'guided' }], 'guided', id);
    expect(errors).toEqual([]);
  });
}

test('keyboard: the quarter count retry, worked picture, Replay and Continue work without touch', async ({ page, browserName }, testInfo) => {
  test.setTimeout(150_000);
  const item = byId('still-to-come-q1');
  const errors = await openGame(page, item.possession);
  const { question, play } = await present(page, item);
  const key = tabKey(browserName);
  const activate = async (selector, label) => {
    for (let index = 0; index < 80; index++) {
      if (await page.evaluate(target => document.activeElement?.matches(target) ?? false, selector)) {
        await page.keyboard.press('Enter');
        return;
      }
      await page.keyboard.press(key);
    }
    throw new Error(`${label}: ${selector} is not reachable from the keyboard`);
  };
  const wrong = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
  await activate(`[data-choice-id="${wrong[0]}"]`, 'first miss');
  await expect(page.locator('#feedback')).toHaveText(`Good try. ${item.hint}`);
  expectGuided(await overlayFacts(page), item, question, 'keyboard guided');
  // Focus moves to a still-enabled answer, never the disabled miss.
  expect(await page.evaluate(() => document.activeElement?.matches('#btn-row .ans-btn:not(.hidden):not(:disabled)'))).toBe(true);
  await activate(`[data-choice-id="${wrong[1]}"]`, 'second miss');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
  expectWorked(await overlayFacts(page), item, question, 'keyboard worked');
  await activate('#question-learn-why', 'Learn why');
  await expect(page.locator('#worked-review-heading')).toHaveText(`Coach Replay: ${question.workedReview.title}`);
  expectWorked(await overlayFacts(page), item, question, 'keyboard Replay');
  await page.screenshot({ path: testInfo.outputPath('keyboard-replay.png') });
  await activate('#question-continue', 'Continue');
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await expectEvidence(page, play, item.familyId, 'secondMiss', [
    { number: 1, correct: false, support: 'initial' },
    { number: 2, correct: false, support: 'guided' },
  ], 'worked', 'keyboard');
  expect(errors).toEqual([]);
});
