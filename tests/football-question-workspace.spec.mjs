import { test, expect } from './curriculum-fixture.mjs';

// Issue #51 question workspace: real production questions of every choice
// family (numbers, natural yardage questions with long team names, four text
// labels, long field-position labels, and a defense question) reached by real
// taps. The symbol comparison is retired from live play, so its former
// scenarios now cover the numeric short, exact, past-marker and goal-to-go
// questions that replaced it. These
// check what the new presentation must guarantee on every target: whole,
// unclipped, non-overlapping 44px answers above the fold, a primary question,
// readable contrast, unchanged retry and review semantics, and a Coach Replay
// that flows in the document with clear actions.

const EPS = 1;

const OFFENSE_SEED = Object.freeze({
  possession: 'offense', direction: 1, quarter: 2, down: 2, yardsToGo: 7,
  yardLine: 30, firstDownLine: 37, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 4, drivePlays: 2,
});

const MARKER_SEED = Object.freeze({
  ...OFFENSE_SEED,
  yardsToGo: 1,
  firstDownLine: 31,
});

// The #188 iPhone 15 defense capture whose comparison picture cropped PLAY 5:
// Q2, 2nd & 10 at the 50, where the constant 0.2 football draw proposes 5.
// #51 keeps it as the defense yards-still-needed source.
const DEFENSE_COMPARISON_SEED = Object.freeze({
  possession: 'defense', direction: -1, quarter: 2, down: 2, yardsToGo: 10,
  yardLine: 50, firstDownLine: 40, driveStart: 50,
  scores: { player: 7, opponent: 6 }, totalYards: { player: 71, opponent: 71 },
  plays: 4, drivePlays: 2,
});

// Fourth down at the own 30: Go and Punt only. The constant 0.2 football draw
// gives a 38-yard punt that lands short of the end zone.
const PUNT_SEED = Object.freeze({
  rivalId: 'wake-forest',
  possession: 'offense', direction: 1, quarter: 2, down: 4, yardsToGo: 10,
  yardLine: 30, firstDownLine: 40, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 4, drivePlays: 3,
});

const DEFENSE_SEED = Object.freeze({
  possession: 'defense', direction: -1, quarter: 3, down: 2, yardsToGo: 10,
  yardLine: 70, firstDownLine: 60, driveStart: 80,
  scores: { player: 14, opponent: 7 }, totalYards: { player: 83, opponent: 71 },
  plays: 9, drivePlays: 2,
});

const CALL = '#call-grid .call-btn';
const PUNT = '#decision-grid .decision-btn[data-action="punt"]';

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

async function boot(page) {
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('footballMathStats:v1'); } catch (error) {}
  });
  await page.goto('/football/?boot=offense-call');
  await page.evaluate(() => {
    window.__footballTest.setQuestionFault(null);
    // Seed first: the drive owns the call or decision prompt the trigger taps.
    window.__wsPrepare = ({ seed, draw }) => {
      window.__footballTest.seedDriveState(seed);
      window.__footballTest.resetLearning();
      window.__footballTest.setRngStreams({ football: () => 0.2, scheduler: () => draw, presentation: () => 0.4 });
    };
  });
}

// Finds the ordinary scheduler draw that presents familyId through the given
// trigger, then presents it again through a real tap on that trigger.
async function presentFamily(page, { seed, trigger, familyId }) {
  const draw = await page.evaluate(({ seed, trigger, familyId }) => {
    for (let index = 0; index < 600; index++) {
      const draw = (index + 0.5) / 600;
      window.__wsPrepare({ seed, draw });
      const control = document.querySelector(trigger);
      if (!control) continue;
      control.click();
      if (window.__footballTest.activeContracts().questionInstance?.familyId === familyId) return draw;
    }
    return null;
  }, { seed, trigger, familyId });
  expect(draw, `${familyId} is reachable through the ordinary scheduler`).not.toBeNull();
  await page.evaluate(options => window.__wsPrepare(options), { seed, draw });
  await page.locator(trigger).first().tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const question = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance);
  expect(question.familyId).toBe(familyId);
  return question;
}

// #51: finds the yards to go at which the first call's frozen gain falls
// short of, reaches, or passes (within 10) the marker, reading the gain from
// the real tapped play; the opponent's call can depend on the distance.
async function seedForRelation(page, base, relation) {
  const seed = await page.evaluate(({ base, relation }) => {
    window.__wsPrepare({ seed: base, draw: 0.5 });
    for (let yardsToGo = 1; yardsToGo <= 10; yardsToGo++) {
      const seed = { ...base, yardsToGo, firstDownLine: base.yardLine + base.direction * yardsToGo };
      window.__wsPrepare({ seed, draw: 0.5 });
      document.querySelector('#call-grid .call-btn').click();
      const play = window.__footballTest.activeContracts().activePlay;
      if (!play || play.proposal.resultKind === 'touchdown') continue;
      const gain = play.proposal.appliedGain;
      if (relation === 'short' ? gain < yardsToGo : relation === 'past' ? gain > yardsToGo && gain <= 10 : gain === yardsToGo) return seed;
    }
    return null;
  }, { base, relation });
  expect(seed, `a ${relation} gain is reachable from the first call`).not.toBeNull();
  return seed;
}

// #51: the natural question written from the live play's raw facts.
function expectedYardagePrompt(play) {
  const c = play.context;
  const gain = play.proposal.appliedGain;
  const unit = value => `${value} ${value === 1 ? 'yard' : 'yards'}`;
  const offense = c.possession === 'offense';
  const team = c.match.opponent.shortName;
  const subject = offense ? 'you' : team;
  const goalToGo = c.firstDownLine === (c.direction === 1 ? 100 : 0);
  const situation = `${offense ? "It's" : `${team} has`} ${['', '1st', '2nd', '3rd', '4th'][c.down]} and ${goalToGo ? `goal from the ${c.yardsToGo}` : c.yardsToGo}.`;
  const pass = offense && /Pass$/.test(c.calls.offense);
  const article = [8, 11, 18].includes(gain) || (gain >= 80 && gain <= 89) ? 'an' : 'a';
  const conditional = !offense ? `If ${team} gains ${unit(gain)},` : pass ? `If you complete ${article} ${gain}-yard pass,` : `If you gain ${unit(gain)},`;
  const ask = gain > c.yardsToGo ? `how far past the first-down marker would ${subject} get?`
    : goalToGo ? `how many yards would ${subject} be from the end zone?`
      : c.down === 4 ? `how many yards short of a first down would ${subject} be?`
        : `how many more yards would ${subject} need for a first down?`;
  return `${situation} ${conditional} ${ask}`;
}

function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value || '');
  if (!match) return null;
  const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}

function luminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

async function workspaceMetrics(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const fontSize = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const buttons = [0, 1, 2, 3].map((index) => {
      const button = document.getElementById(`b${index}`);
      const style = getComputedStyle(button);
      return {
        id: button.id,
        shown: !button.classList.contains('hidden') && style.display !== 'none',
        hiddenClass: button.classList.contains('hidden'),
        disabled: button.disabled,
        wrong: button.classList.contains('wrong'),
        correct: button.classList.contains('correct'),
        text: button.textContent,
        choiceId: button.dataset.choiceId || null,
        rect: rect(button),
        clientWidth: button.clientWidth,
        clientHeight: button.clientHeight,
        scrollWidth: button.scrollWidth,
        scrollHeight: button.scrollHeight,
        color: style.color,
        background: style.backgroundColor,
        opacity: Number(style.opacity),
      };
    });
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
      scrollWidth: document.documentElement.scrollWidth,
      questionSize: fontSize('#question'),
      labelSize: fontSize('#play-label'),
      contextSize: fontSize('#play-context'),
      questionRect: rect(document.getElementById('question')),
      buttons,
      focusedId: document.activeElement?.id || null,
    };
  });
}

function intersects(a, b) {
  return a.left < b.right - EPS && b.left < a.right - EPS && a.top < b.bottom - EPS && b.top < a.bottom - EPS;
}

function assertWorkspace(metrics, question, label) {
  const shown = metrics.buttons.filter(button => button.shown);
  expect(shown.map(button => button.choiceId), `${label}: one visible answer per real choice, in order`)
    .toEqual(question.choices.map(choice => choice.id));
  for (const button of metrics.buttons.slice(question.choices.length)) {
    expect(button.hiddenClass && button.disabled, `${label}: unused ${button.id} stays hidden and disabled`).toBe(true);
  }
  expect(metrics.scrollWidth, `${label}: no horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + EPS);
  expect(metrics.scrollY, `${label}: no automatic scroll`).toBe(0);
  expect(metrics.questionRect.height, `${label}: question rendered`).toBeGreaterThan(0);
  expect(metrics.questionRect.right, `${label}: question inside viewport`).toBeLessThanOrEqual(metrics.innerWidth + EPS);
  for (const button of shown) {
    const at = `${label}: ${button.id} "${button.text}"`;
    expect(button.rect.width, `${at} width`).toBeGreaterThanOrEqual(44);
    expect(button.rect.height, `${at} height`).toBeGreaterThanOrEqual(44);
    expect(button.rect.left, `${at} left`).toBeGreaterThanOrEqual(-EPS);
    expect(button.rect.right, `${at} right`).toBeLessThanOrEqual(metrics.innerWidth + EPS);
    expect(button.rect.top, `${at} top`).toBeGreaterThanOrEqual(-EPS);
    expect(button.rect.bottom, `${at} above the fold`).toBeLessThanOrEqual(metrics.innerHeight + EPS);
    expect(button.scrollWidth, `${at} label not clipped horizontally`).toBeLessThanOrEqual(button.clientWidth + 1);
    expect(button.scrollHeight, `${at} label not clipped vertically`).toBeLessThanOrEqual(button.clientHeight + 1);
    expect(button.text.trim(), `${at} shows its real label`).toBe(question.choices[Number(button.id.slice(1))].label);
    if (!button.disabled || button.wrong || button.correct) {
      const fg = parseColor(button.color);
      const bg = parseColor(button.background);
      expect(button.opacity, `${at} opaque`).toBe(1);
      expect(bg?.a, `${at} solid background`).toBe(1);
      expect(contrast(fg, bg), `${at} label contrast`).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      expect(intersects(shown[i].rect, shown[j].rect), `${label}: ${shown[i].id} and ${shown[j].id} do not overlap`).toBe(false);
    }
  }
  expect(metrics.questionSize, `${label}: readable question`).toBeGreaterThanOrEqual(17);
  expect(metrics.questionSize, `${label}: question larger than the play label`).toBeGreaterThan(metrics.labelSize);
  expect(metrics.questionSize, `${label}: question larger than the play facts`).toBeGreaterThan(metrics.contextSize);
}

async function expectStatus(page, text) {
  const feedback = page.locator('#feedback');
  await expect(feedback).toHaveAttribute('role', 'status');
  await expect(feedback).toHaveAttribute('aria-live', 'polite');
  await expect(feedback).toContainText(text);
}

function rectsMatch(before, after, label) {
  before.filter(button => button.shown).forEach((button, index) => {
    const now = after.filter(item => item.shown)[index];
    expect(Math.abs(now.rect.width - button.rect.width), `${label}: ${button.id} width kept`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(now.rect.height - button.rect.height), `${label}: ${button.id} height kept`).toBeLessThanOrEqual(0.5);
  });
}

async function tapChoice(page, choiceId) {
  await page.locator(`#btn-row .ans-btn[data-choice-id="${choiceId}"]`).tap();
}

async function assertPhoneFieldLabelsStayInsideField(page, stage, expectedLabels) {
  const result = await page.evaluate(() => {
    if (window.innerWidth > 480) return { applicable: false };
    const field = document.getElementById('field-wrap');
    const overlay = document.getElementById('math-overlay');
    const fieldBox = field.getBoundingClientRect();
    const left = fieldBox.left + field.clientLeft;
    const top = fieldBox.top + field.clientTop;
    const right = left + field.clientWidth;
    const bottom = top + field.clientHeight;
    const deskBox = document.getElementById('ui-desk').getBoundingClientRect();
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
    };
    const mute = document.getElementById('mute-toggle');
    const muteBox = rect(mute);
    const muteX = muteBox.left + muteBox.width / 2;
    const muteY = muteBox.top + muteBox.height / 2;
    const muteInViewport = muteX >= 0 && muteX <= innerWidth && muteY >= 0 && muteY <= innerHeight;
    const muteHit = muteInViewport ? document.elementFromPoint(muteX, muteY) : null;
    const boxes = [overlay, ...overlay.querySelectorAll('*')].map(element => ({
      name: element === overlay ? 'panel' : element.className || element.tagName,
      ...rect(element),
    })).filter(box => box.width > 0 || box.height > 0);
    const labels = [...overlay.querySelectorAll('.math-context-token, .math-context-link, .math-worked, .math-compare-caption, .math-compare-mark')];
    const measured = labels.map(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()].map(box => ({
        top: box.top, right: box.right, bottom: box.bottom, left: box.left,
      }));
      const style = getComputedStyle(element);
      return {
        text: element.textContent.trim(),
        className: element.className,
        fontSize: parseFloat(style.fontSize),
        lines,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });
    return {
      applicable: true,
      visible: !overlay.hidden,
      field: { left, top, right, bottom },
      desk: { left: deskBox.left, top: deskBox.top, right: deskBox.right, bottom: deskBox.bottom },
      mute: muteBox,
      muteInViewport,
      muteHitIsToggle: Boolean(muteHit && mute.contains(muteHit)),
      boxes,
      labels: measured,
      overlayText: overlay.innerText,
    };
  });
  if (!result.applicable) return;
  // The whole panel and every part stay inside the field and clear of the full
  // 44px sound toggle, as the arithmetic pictures already require.
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  expect(result.mute.width, `${stage}: sound toggle width`).toBeGreaterThanOrEqual(44);
  expect(result.mute.height, `${stage}: sound toggle height`).toBeGreaterThanOrEqual(44);
  if (result.muteInViewport) {
    // The panel ignores pointer events, so this proves tap reachability; the
    // overlap checks below prove the panel does not cover the toggle.
    expect(result.muteHitIsToggle, `${stage}: sound toggle receives a tap at its center`).toBe(true);
  }
  for (const box of result.boxes) {
    expect(box.left, `${stage}: ${box.name} inside field left edge`).toBeGreaterThanOrEqual(result.field.left - EPS);
    expect(box.right, `${stage}: ${box.name} inside field right edge`).toBeLessThanOrEqual(result.field.right + EPS);
    expect(box.top, `${stage}: ${box.name} inside field top edge`).toBeGreaterThanOrEqual(result.field.top - EPS);
    expect(box.bottom, `${stage}: ${box.name} inside field bottom edge`).toBeLessThanOrEqual(result.field.bottom + EPS);
    expect(overlaps(box, result.mute), `${stage}: ${box.name} clear of the sound toggle`).toBe(false);
  }
  expect(result.visible, `${stage}: instructional field picture remains visible`).toBe(true);
  expect(result.labels.length, `${stage}: field carries context labels`).toBeGreaterThan(0);
  for (const label of expectedLabels) {
    expect(result.overlayText, `${stage}: ${label} context is retained`).toMatch(new RegExp(label, 'i'));
  }
  for (const label of result.labels) {
    // #51 comparison captions and the middle symbol are measured too.
    const expectedSize = label.className.includes('math-context-token') ? 30
      : label.className.includes('math-context-link') ? 20
        : label.className.includes('math-compare-caption') ? 14
          : label.className.includes('math-compare-mark') ? 30 : 17;
    expect(label.fontSize, `${stage}: ${label.text} keeps its established font size`).toBe(expectedSize);
    expect(label.scrollWidth, `${stage}: ${label.text} is not horizontally clipped`).toBeLessThanOrEqual(label.clientWidth + 1);
    expect(label.scrollHeight, `${stage}: ${label.text} is not vertically clipped`).toBeLessThanOrEqual(label.clientHeight + 1);
    for (const line of label.lines) {
      expect(line.left, `${stage}: ${label.text} line remains inside field left edge`).toBeGreaterThanOrEqual(result.field.left - EPS);
      expect(line.right, `${stage}: ${label.text} line remains inside field right edge`).toBeLessThanOrEqual(result.field.right + EPS);
      expect(line.top, `${stage}: ${label.text} line remains inside field top edge`).toBeGreaterThanOrEqual(result.field.top - EPS);
      expect(line.bottom, `${stage}: ${label.text} line remains inside field bottom edge`).toBeLessThanOrEqual(result.field.bottom + EPS);
      expect(intersects(line, result.desk), `${stage}: ${label.text} remains visible above the answer desk`).toBe(false);
      expect(overlaps(line, result.mute), `${stage}: ${label.text} line clear of the sound toggle`).toBe(false);
    }
  }
}

// Pictures outside the three label families keep the released phone field.
async function assertReleasedPhoneField(page, stage) {
  const result = await page.evaluate(() => ({
    width: window.innerWidth,
    type: document.getElementById('math-overlay').dataset.type || null,
    height: getComputedStyle(document.getElementById('field-wrap')).height,
  }));
  if (result.width > 480) return;
  expect(result.height, `${stage}: ${result.type} picture keeps the released phone field`)
    .toBe(result.width <= 420 ? '142px' : '150px');
}

async function assertCommittedFeedbackHidesInstructionalPicture(page, stage) {
  const result = await page.evaluate(() => {
    const overlay = document.getElementById('math-overlay');
    const feedback = document.getElementById('feedback');
    const box = feedback.getBoundingClientRect();
    return {
      phase: document.getElementById('ui-desk').dataset.phase,
      overlayHidden: overlay.hidden,
      overlayText: overlay.textContent.trim(),
      overlayChildren: overlay.childElementCount,
      feedbackText: feedback.textContent.trim(),
      feedbackVisible: box.width > 0 && box.height > 0 && getComputedStyle(feedback).visibility !== 'hidden',
      feedbackBox: { top: box.top, bottom: box.bottom },
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      scrollY,
      committed: JSON.parse(render_game_to_text()).outcomeCommitted,
      outcomeMessage: JSON.parse(render_game_to_text()).outcomeMessage,
      statusRole: feedback.getAttribute('role'),
      statusLive: feedback.getAttribute('aria-live'),
    };
  });
  expect(result.phase, `${stage}: production feedback phase`).toBe('feedback');
  expect(result.overlayHidden, `${stage}: committed feedback clears the instructional picture`).toBe(true);
  expect(result.overlayText, `${stage}: no question labels remain in feedback`).toBe('');
  expect(result.overlayChildren, `${stage}: no question-label descendants remain in feedback`).toBe(0);
  expect(result.feedbackVisible, `${stage}: committed result feedback remains visible`).toBe(true);
  expect(result.feedbackText, `${stage}: committed result feedback has content`).not.toBe('');
  expect(result.committed, `${stage}: play outcome is committed`).toBe(true);
  expect(result.outcomeMessage, `${stage}: production outcome message remains available`).not.toBeNull();
  expect(result.statusRole, `${stage}: feedback remains a status region`).toBe('status');
  expect(result.statusLive, `${stage}: feedback remains announced politely`).toBe('polite');
  expect(result.feedbackBox.top, `${stage}: result feedback starts in the viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(result.feedbackBox.bottom, `${stage}: result feedback stays above the fold`).toBeLessThanOrEqual(result.viewportHeight + EPS);
  expect(result.documentWidth, `${stage}: no horizontal page overflow`).toBeLessThanOrEqual(result.viewportWidth + EPS);
  expect(result.scrollY, `${stage}: no automatic page scroll`).toBe(0);
}

// #51: the picture's tokens, written from the live play's raw facts. The
// marker strip names the gain, the yards to go and the yards past, each with
// its unit; the part-whole picture keeps its gain + ? = yards-needed equation.
function expectedYardageTokens(play, question, support) {
  const gain = play.proposal.appliedGain;
  const needed = play.context.yardsToGo;
  const shown = support === 'worked' ? String(question.answer.value) : '?';
  const amount = value => `${value} ${Number(value) === 1 ? 'YARD' : 'YARDS'}`;
  if (question.visuals[support].type === 'marker-strip') {
    const kind = /Pass$/.test(play.context.calls.offense) && play.context.possession === 'offense' ? 'PASS'
      : /Run$/.test(play.context.calls.offense) && play.context.possession === 'offense' ? 'RUN' : 'GAIN';
    return [`${gain}-YARD ${kind}`, '−', `${amount(needed)} TO GO`, '=', support === 'worked' ? `${amount(shown)} PAST` : '? YARDS PAST'];
  }
  return [String(gain), '+', shown, '=', String(needed)];
}

// Tokens, stage, accessible name and worked sentence match the question's own
// contract, the result stays hidden until worked, and no NEED / PLAY / PAST
// shorthand remains.
async function assertYardagePicture(page, play, question, support, stage) {
  const picture = await page.evaluate(() => {
    const overlay = document.getElementById('math-overlay');
    return {
      type: overlay.dataset.type,
      support: overlay.dataset.support,
      rowHidden: overlay.querySelector('.math-context-row')?.getAttribute('aria-hidden') ?? null,
      tokens: [...overlay.querySelectorAll('.math-context-row > span')].map(element => element.textContent.trim()),
      worked: [...overlay.querySelectorAll('.math-worked')].map(element => element.textContent.trim()),
      text: overlay.textContent,
      ariaLabel: overlay.getAttribute('aria-label'),
    };
  });
  expect(picture.type, `${stage}: picture type`).toBe(question.visuals[support].type);
  expect(picture.support, `${stage}: support stage`).toBe(support);
  expect(picture.tokens, `${stage}: labeled quantities`).toEqual(expectedYardageTokens(play, question, support));
  expect(picture.rowHidden, `${stage}: the picture row is decorative`).toBe('true');
  expect(picture.ariaLabel, `${stage}: picture name matches its support stage`).toBe(question.visuals[support].ariaLabel);
  expect(picture.worked, `${stage}: worked sentence only in the worked stage`)
    .toEqual(support === 'worked' ? [question.workedExplanation.text] : []);
  expect(picture.text, `${stage}: no shorthand`).not.toMatch(/\bNEED\b|\bPLAY \d|\bPAST \d|\bPAST \?/);
}

// #51: Coach Replay repeats the question's own hint and worked sentence, and
// its football meaning names the question's hypothetical gain.
async function assertYardageReplay(page, play, question, label) {
  await expect(page.locator('#worked-review-heading')).toHaveText(`Coach Replay: ${question.workedReview.title}`);
  await expect(page.locator('#worked-review-content .worked-review-goal p')).toHaveText(question.workedReview.goal.text);
  await expect(page.locator('#worked-review-content .worked-review-steps p'))
    .toHaveText([question.hint.text, question.workedExplanation.text]);
  await expect(page.locator('#worked-review-content .worked-review-meaning p')).toHaveText(question.workedReview.footballMeaning.text);
  expect(question.workedReview.footballMeaning.text, `${label}: Replay names the question's gain`)
    .toMatch(new RegExp(`^For the question's ${play.proposal.appliedGain}-yard (?:run|pass|gain), `));
  expect(question.workedExplanation.text, `${label}: worked stays hypothetical`).toMatch(/\bwould\b/);
}

// One coached retry, then a correct retry that commits and shows feedback.
async function retryThenCorrect(page, question, label) {
  const initial = await workspaceMetrics(page);
  assertWorkspace(initial, question, `${label} question`);
  const wrongId = question.choices.find(choice => choice.id !== question.correctChoiceId).id;
  await tapChoice(page, wrongId);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await expectStatus(page, `Good try. ${question.hint.text}`);
  const retry = await workspaceMetrics(page);
  assertWorkspace(retry, question, `${label} retry`);
  rectsMatch(initial.buttons, retry.buttons, `${label} retry`);
  const missed = retry.buttons.find(button => button.choiceId === wrongId);
  expect(missed.wrong && missed.disabled, `${label}: missed answer marked and locked`).toBe(true);
  const firstEnabled = retry.buttons.find(button => button.shown && !button.disabled);
  expect(retry.focusedId, `${label}: focus moves to the first enabled answer`).toBe(firstEnabled.id);

  await tapChoice(page, question.correctChoiceId);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  // Freeze only the already-committed result for stable layout assertions;
  // this does not measure or replace the production feedback timing.
  await page.evaluate(() => clearTimeout(advTimer));
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
  const feedback = await workspaceMetrics(page);
  assertWorkspace(feedback, question, `${label} feedback`);
  const correct = feedback.buttons.find(button => button.choiceId === question.correctChoiceId);
  expect(correct.correct, `${label}: chosen answer marked correct`).toBe(true);
  await expect(page.locator('#feedback')).toBeVisible();
  await expect(page.locator('#feedback')).not.toBeEmpty();
}

test.describe('football question workspace (#51)', () => {
  test('number choices: retry, correct and feedback fit with readable answers', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: OFFENSE_SEED, trigger: CALL, familyId: 'line-to-gain-missing-part' });
    await assertReleasedPhoneField(page, 'number question');
    expect(question.choices.every(choice => typeof choice.value === 'number')).toBe(true);
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'number');
    await retryThenCorrect(page, question, 'number');
    expect(errors).toEqual([]);
  });

  test('a long opponent name in the natural yardage prompt keeps one coached retry', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const seed = await seedForRelation(page, { ...DEFENSE_COMPARISON_SEED, rivalId: 'wake-forest' }, 'short');
    const question = await presentFamily(page, { seed, trigger: CALL, familyId: 'line-to-gain-missing-part' });
    const play = await page.evaluate(() => window.__footballTest.activeContracts().activePlay);
    expect(play.context.match.opponent.shortName, 'longest public rival label').toBe('WAKE FOREST');
    const prompt = await page.locator('#question').textContent();
    expect(prompt).toBe(expectedYardagePrompt(play));
    expect(prompt).toBe(question.prompt.text);
    // The opponent has the ball and its call stays private.
    expect(prompt).not.toMatch(/\byou\b|\byour\b|\bpass\b|\brun\b/i);
    expect(question.choices).toHaveLength(4);
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'number');
    await assertYardagePicture(page, play, question, 'initial', 'long-name question');
    await retryThenCorrect(page, question, 'long-name yardage');
    expect(errors).toEqual([]);
  });

  test('long field-position labels on a punt stay whole and tappable', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: PUNT_SEED, trigger: PUNT, familyId: 'punt-landing-spot' });
    await assertReleasedPhoneField(page, 'punt landing question');
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'yard');
    await retryThenCorrect(page, question, 'punt landing');
    expect(errors).toEqual([]);
  });

  test('defense question uses the same workspace and commits a stop', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    await page.evaluate((seed) => window.__footballTest.seedDriveState(seed), DEFENSE_SEED);
    await page.locator(CALL).first().tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-possession', 'defense');
    const question = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance);
    assertWorkspace(await workspaceMetrics(page), question, 'defense question');
    await tapChoice(page, question.correctChoiceId);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await page.evaluate(() => clearTimeout(advTimer));
    assertWorkspace(await workspaceMetrics(page), question, 'defense feedback');
    expect(errors).toEqual([]);
  });

  test('four text choices: second miss, worked summary, Coach Replay, Back and gated Continue', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const question = await presentFamily(page, { seed: OFFENSE_SEED, trigger: CALL, familyId: 'next-down' });
    expect(question.choices).toHaveLength(4);
    await expect(page.locator('#btn-row')).toHaveAttribute('data-choice-type', 'text');
    assertWorkspace(await workspaceMetrics(page), question, 'next-down question');
    await assertPhoneFieldLabelsStayInsideField(page, 'next-down question', ['CURRENT', 'PLAY', 'NEXT']);

    const wrongIds = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
    await tapChoice(page, wrongIds[0]);
    await expectStatus(page, 'Good try.');
    await assertPhoneFieldLabelsStayInsideField(page, 'next-down coached retry', ['CURRENT', 'PLAY', 'NEXT']);
    await tapChoice(page, wrongIds[1]);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    await assertPhoneFieldLabelsStayInsideField(page, 'next-down worked explanation', ['CURRENT', 'PLAY', 'NEXT']);

    // Production review state: question and answers hidden, worked text in the
    // focused summary, and the status region kept for assistive technology only.
    await expect(page.locator('#question')).toBeHidden();
    await expect(page.locator('#btn-row')).toBeHidden();
    await expect(page.locator('#film-room-summary')).toBeVisible();
    await expect(page.locator('#film-room-summary')).toBeFocused();
    await expect(page.locator('#film-room-summary-copy')).toHaveText(question.workedExplanation.text);
    await expectStatus(page, question.workedExplanation.text);
    const status = await page.locator('#feedback').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { width: box.width, height: box.height };
    });
    expect(status.width <= 1 && status.height <= 1, 'worked status is visually hidden, not duplicated').toBe(true);
    await expect(page.locator('#question-continue')).toBeHidden();
    const gated = await page.evaluate(() => JSON.parse(render_game_to_text()));
    expect(gated.continueRequired).toBe(true);
    expect(gated.outcomeCommitted).toBe(false);

    const learn = page.locator('#question-learn-why');
    await expect(learn).toBeVisible();
    const learnBox = await learn.boundingBox();
    const viewport = page.viewportSize();
    expect(learnBox.width).toBeGreaterThanOrEqual(44);
    expect(learnBox.height).toBeGreaterThanOrEqual(44);
    expect(learnBox.y + learnBox.height, 'Learn why above the fold').toBeLessThanOrEqual(viewport.height + EPS);

    await learn.tap();
    await expect(page.locator('#worked-review')).toBeVisible();
    await assertPhoneFieldLabelsStayInsideField(page, 'Coach Replay', ['CURRENT', 'PLAY', 'NEXT']);
    await expect(page.locator('#worked-review-heading')).toBeFocused();
    await expect(page.locator('#worked-review-heading')).toHaveText(`Coach Replay: ${question.workedReview.title}`);
    await expect(page.locator('#worked-review-content .worked-review-steps li')).toHaveCount(question.workedReview.steps.length);
    const replay = await page.evaluate(() => {
      const size = selector => Math.min(...Array.from(document.querySelectorAll(selector), element => parseFloat(getComputedStyle(element).fontSize)));
      const overflow = id => getComputedStyle(document.getElementById(id)).overflowY;
      const review = document.getElementById('worked-review');
      const controls = ['worked-review-back', 'question-continue'].map((id) => {
        const element = document.getElementById(id);
        const box = element.getBoundingClientRect();
        return { id, width: box.width, height: box.height, left: box.left, right: box.right, disabled: element.disabled };
      });
      return {
        goal: size('#worked-review-content .worked-review-goal p'),
        steps: size('#worked-review-content .worked-review-steps p'),
        meaning: size('#worked-review-content .worked-review-meaning p'),
        overflow: ['worked-review', 'worked-review-content', 'action-panel', 'prompt-panel'].map(overflow),
        reviewScrollWidth: review.scrollWidth,
        reviewClientWidth: review.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        controls,
      };
    });
    expect(replay.goal, 'Replay goal text').toBeGreaterThanOrEqual(14);
    expect(replay.steps, 'Replay step text').toBeGreaterThanOrEqual(14);
    expect(replay.meaning, 'Replay meaning text').toBeGreaterThanOrEqual(13);
    for (const value of replay.overflow) expect(['auto', 'scroll'], 'no nested scrolling').not.toContain(value);
    expect(replay.reviewScrollWidth).toBeLessThanOrEqual(replay.reviewClientWidth + EPS);
    expect(replay.documentScrollWidth).toBeLessThanOrEqual(replay.innerWidth + EPS);
    for (const control of replay.controls) {
      expect(control.disabled, `${control.id} enabled`).toBe(false);
      expect(control.width, `${control.id} width`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${control.id} height`).toBeGreaterThanOrEqual(44);
      expect(control.left, `${control.id} left`).toBeGreaterThanOrEqual(-EPS);
      expect(control.right, `${control.id} right`).toBeLessThanOrEqual(replay.innerWidth + EPS);
    }

    // Back closes Replay but keeps the satisfied review gate and Continue.
    await page.locator('#worked-review-back').tap();
    await expect(page.locator('#worked-review')).toBeHidden();
    await expect(learn).toBeVisible();
    await expect(page.locator('#question-continue')).toBeVisible();
    expect(await page.evaluate(() => window.__footballTest.activeContracts().questionUi.reviewSatisfied)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(false);

    await page.locator('#question-continue').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    // syncUiState intentionally clears the instructional math picture outside
    // question/explanation; committed feedback presents the play outcome.
    await assertCommittedFeedbackHidesInstructionalPicture(page, 'next-down feedback');
    expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('marker-strip gain, yards to go and yards past stay visible through retry, feedback, worked explanation, and Replay', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const options = { seed: MARKER_SEED, trigger: CALL, familyId: 'line-to-gain-surplus' };
    const question = await presentFamily(page, options);
    const play = await page.evaluate(() => window.__footballTest.activeContracts().activePlay);
    expect(question.visuals.initial.type).toBe('marker-strip');
    await expect(page.locator('#question')).toHaveText(expectedYardagePrompt(play));
    // #51: labeled quantities replace NEED / PLAY / PAST.
    const labels = ['-YARD RUN', 'YARD TO GO', 'PAST'];
    assertWorkspace(await workspaceMetrics(page), question, 'marker-strip question');
    await assertYardagePicture(page, play, question, 'initial', 'marker-strip question');
    await assertPhoneFieldLabelsStayInsideField(page, 'marker-strip question', labels);

    const wrongId = question.choices.find(choice => choice.id !== question.correctChoiceId).id;
    await tapChoice(page, wrongId);
    await expectStatus(page, `Good try. ${question.hint.text}`);
    await assertYardagePicture(page, play, question, 'guided', 'marker-strip coached retry');
    await assertPhoneFieldLabelsStayInsideField(page, 'marker-strip coached retry', labels);
    await tapChoice(page, question.correctChoiceId);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await page.evaluate(() => clearTimeout(advTimer));
    await assertCommittedFeedbackHidesInstructionalPicture(page, 'marker-strip feedback');
    expect(JSON.parse(await page.evaluate(() => render_game_to_text())).outcomeCommitted).toBe(true);

    const workedQuestion = await presentFamily(page, options);
    const wrongIds = workedQuestion.choices.filter(choice => choice.id !== workedQuestion.correctChoiceId).map(choice => choice.id);
    await tapChoice(page, wrongIds[0]);
    await tapChoice(page, wrongIds[1]);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    await assertYardagePicture(page, play, workedQuestion, 'worked', 'marker-strip worked explanation');
    await assertPhoneFieldLabelsStayInsideField(page, 'marker-strip worked explanation', labels);
    await page.locator('#question-learn-why').tap();
    await expect(page.locator('#worked-review')).toBeVisible();
    await assertYardageReplay(page, play, workedQuestion, 'marker-strip');
    await assertPhoneFieldLabelsStayInsideField(page, 'marker-strip Coach Replay', labels);
    expect(errors).toEqual([]);
  });

  test('defense yards still needed stay whole through retry, feedback, worked explanation, Replay, Back and Continue', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    const options = { seed: DEFENSE_COMPARISON_SEED, trigger: CALL, familyId: 'line-to-gain-missing-part' };
    // #51: the user read "PLAY 5 ? NEED 10" and its symbol comparison as
    // nonsense; the same #188 play now asks one numeric football distance.
    const question = await presentFamily(page, options);
    const play = await page.evaluate(() => window.__footballTest.activeContracts().activePlay);
    expect(play.context.possession, '#188 source: defense').toBe('defense');
    expect(play.proposal.appliedGain, '#188 source: proposed 5').toBe(5);
    expect(play.context.yardsToGo, '#188 source: needed 10').toBe(10);
    expect(question.answer.value).toBe(5);
    expect(question.visuals.initial.type).toBe('parts');
    const labels = ['5', '10'];
    // The opponent has the ball, so the prompt names it, never "you", and
    // keeps its private call out of the gain.
    const prompt = await page.locator('#question').textContent();
    expect(prompt).toBe(expectedYardagePrompt(play));
    expect(prompt).toBe(`${play.context.match.opponent.shortName} has 2nd and 10. If ${play.context.match.opponent.shortName} gains 5 yards, how many more yards would ${play.context.match.opponent.shortName} need for a first down?`);
    expect(prompt).not.toMatch(/\byou\b|\byour\b|\bpass\b|\brun\b/i);
    assertWorkspace(await workspaceMetrics(page), question, 'yardage question');
    await assertYardagePicture(page, play, question, 'initial', 'yardage question');
    await assertPhoneFieldLabelsStayInsideField(page, 'yardage question', labels);

    const wrongId = question.choices.find(choice => choice.id !== question.correctChoiceId).id;
    await tapChoice(page, wrongId);
    await expectStatus(page, `Good try. ${question.hint.text}`);
    assertWorkspace(await workspaceMetrics(page), question, 'yardage retry');
    await assertYardagePicture(page, play, question, 'guided', 'yardage coached retry');
    await assertPhoneFieldLabelsStayInsideField(page, 'yardage coached retry', labels);
    await tapChoice(page, question.correctChoiceId);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    // Freeze only the already-committed result for stable layout assertions.
    await page.evaluate(() => clearTimeout(advTimer));
    await assertCommittedFeedbackHidesInstructionalPicture(page, 'yardage feedback');

    const workedQuestion = await presentFamily(page, options);
    const wrongIds = workedQuestion.choices.filter(choice => choice.id !== workedQuestion.correctChoiceId).map(choice => choice.id);
    await tapChoice(page, wrongIds[0]);
    await tapChoice(page, wrongIds[1]);
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
    await assertYardagePicture(page, play, workedQuestion, 'worked', 'yardage worked explanation');
    await assertPhoneFieldLabelsStayInsideField(page, 'yardage worked explanation', labels);
    await expect(page.locator('#film-room-summary-copy')).toHaveText(workedQuestion.workedExplanation.text);

    const learn = page.locator('#question-learn-why');
    await expect(learn).toBeVisible();
    const learnBox = await learn.boundingBox();
    expect(learnBox.width).toBeGreaterThanOrEqual(44);
    expect(learnBox.height).toBeGreaterThanOrEqual(44);
    expect(learnBox.y + learnBox.height, 'Learn why above the fold').toBeLessThanOrEqual(page.viewportSize().height + EPS);
    await learn.tap();
    await expect(page.locator('#worked-review')).toBeVisible();
    await assertYardageReplay(page, play, workedQuestion, 'defense yardage');
    await assertYardagePicture(page, play, workedQuestion, 'worked', 'yardage Coach Replay');
    await assertPhoneFieldLabelsStayInsideField(page, 'yardage Coach Replay', labels);

    await page.locator('#worked-review-back').tap();
    await expect(page.locator('#worked-review')).toBeHidden();
    await expect(page.locator('#question-continue')).toBeVisible();
    await assertYardagePicture(page, play, workedQuestion, 'worked', 'yardage after Replay Back');
    await assertPhoneFieldLabelsStayInsideField(page, 'yardage after Replay Back', labels);
    await page.locator('#question-continue').tap();
    await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
    await assertCommittedFeedbackHidesInstructionalPicture(page, 'yardage worked feedback');
    expect(errors).toEqual([]);
  });

  test('offense short, exact, past-marker and goal-to-go questions keep the hypothetical through worked Replay while the miss commits its own result', async ({ page }) => {
    const errors = watchErrors(page);
    await boot(page);
    // The proposed gain comes from the first call and the constant football
    // draw; read it once, then place the marker to make each relation.
    await presentFamily(page, { seed: OFFENSE_SEED, trigger: CALL, familyId: 'line-to-gain-missing-part' });
    const gain = await page.evaluate(() => window.__footballTest.activeContracts().activePlay.proposal.appliedGain);
    expect(gain >= 2 && gain <= 7, `first-call gain ${gain} leaves room for every relation`).toBe(true);
    const cases = [
      { name: 'short of the first-down marker', familyId: 'line-to-gain-missing-part', answer: 3, endZone: false,
        seed: { ...OFFENSE_SEED, yardsToGo: gain + 3, firstDownLine: 30 + gain + 3 } },
      { name: 'exactly to the first-down marker', familyId: 'line-to-gain-exact', answer: 0, endZone: false,
        seed: { ...OFFENSE_SEED, yardsToGo: gain, firstDownLine: 30 + gain } },
      { name: 'past the first-down marker', familyId: 'line-to-gain-surplus', answer: 1, endZone: false,
        seed: { ...OFFENSE_SEED, yardsToGo: gain - 1, firstDownLine: 30 + gain - 1 } },
      { name: 'goal to go, short of the end zone', familyId: 'line-to-gain-missing-part', answer: 3, endZone: true,
        seed: { ...OFFENSE_SEED, yardLine: 97 - gain, yardsToGo: gain + 3, firstDownLine: 100, driveStart: 60 } },
    ];
    for (const [index, item] of cases.entries()) {
      const label = `offense ${item.name}`;
      // Every case is a line-to-gain ladder family and ends in a committed
      // second miss. resetLearning() rebuilds the session from that committed
      // history, so the ladder downshifts: the first case starts unsupported and
      // every later case starts with the guided picture and hint.
      const startSupport = index === 0 ? 'initial' : 'guided';
      await page.evaluate(() => clearTimeout(advTimer));
      const question = await presentFamily(page, { seed: item.seed, trigger: CALL, familyId: item.familyId });
      expect(question.challenge?.concept, `${label}: ladder family`).toBe('line-to-gain');
      expect(question.support, `${label}: start support after ${index} committed second misses`).toBe(startSupport);
      if (startSupport === 'guided') await expectStatus(page, question.hint.text);
      const play = await page.evaluate(() => window.__footballTest.activeContracts().activePlay);
      expect(play.context.possession, `${label}: offense`).toBe('offense');
      expect(play.proposal.appliedGain, `${label}: same frozen gain`).toBe(gain);
      expect(question.answer.value, `${label}: answer`).toBe(item.answer);
      expect(question.choices).toHaveLength(4);
      const prompt = await page.locator('#question').textContent();
      expect(prompt, `${label}: one natural question`).toBe(expectedYardagePrompt(play));
      // Short and exact ask the same question; nothing cues that none is left.
      expect(prompt, `${label}: no answer cue`).not.toMatch(/exactly|this play/i);
      if (item.endZone) expect(`${prompt} ${question.hint.text} ${question.workedExplanation.text}`, `${label}: no first-down promise`).not.toMatch(/first.down/i);
      assertWorkspace(await workspaceMetrics(page), question, `${label} question`);
      await assertYardagePicture(page, play, question, startSupport, `${label} question`);
      await assertPhoneFieldLabelsStayInsideField(page, `${label} question`, [String(gain)]);

      const wrongIds = question.choices.filter(choice => choice.id !== question.correctChoiceId).map(choice => choice.id);
      await tapChoice(page, wrongIds[0]);
      await expectStatus(page, `Good try. ${question.hint.text}`);
      await assertYardagePicture(page, play, question, 'guided', `${label} coached retry`);
      const before = JSON.parse(await page.evaluate(() => render_game_to_text()));
      await tapChoice(page, wrongIds[1]);
      await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'explanation');
      await assertYardagePicture(page, play, question, 'worked', `${label} worked explanation`);
      await assertPhoneFieldLabelsStayInsideField(page, `${label} worked explanation`, [String(gain)]);
      await expect(page.locator('#film-room-summary-copy')).toHaveText(question.workedExplanation.text);
      expect(question.workedExplanation.text, `${label}: worked target`)
        .toMatch(item.endZone ? /the end zone\.$|touchdown\.$/ : /first-down marker(?: exactly)?\.$/);
      expect(await page.evaluate(() => JSON.parse(render_game_to_text()).outcomeCommitted), `${label}: worked stays uncommitted`).toBe(false);

      const learn = page.locator('#question-learn-why');
      const learnBox = await learn.boundingBox();
      expect(learnBox.width).toBeGreaterThanOrEqual(44);
      expect(learnBox.height).toBeGreaterThanOrEqual(44);
      expect(learnBox.y + learnBox.height, `${label}: Learn why above the fold`).toBeLessThanOrEqual(page.viewportSize().height + EPS);
      await learn.tap();
      await expect(page.locator('#worked-review')).toBeVisible();
      await assertYardageReplay(page, play, question, label);
      await assertYardagePicture(page, play, question, 'worked', `${label} Coach Replay`);
      await assertPhoneFieldLabelsStayInsideField(page, `${label} Coach Replay`, [String(gain)]);

      await page.locator('#worked-review-back').tap();
      await expect(page.locator('#worked-review')).toBeHidden();
      await expect(page.locator('#question-continue')).toBeVisible();
      await page.locator('#question-continue').tap();
      await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
      await assertCommittedFeedbackHidesInstructionalPicture(page, `${label} feedback`);
      // The second short-run miss commits its own stuff, not the question's gain.
      const after = JSON.parse(await page.evaluate(() => render_game_to_text()));
      expect(after.totalYards.player - before.totalYards.player, `${label}: committed second-miss result`).toBe(-1);
      expect(after.totalYards.player - before.totalYards.player, `${label}: actual differs from the question`).not.toBe(gain);
    }
    expect(errors).toEqual([]);
  });
});
