import { test, expect } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';

// Issue #51 remaining overlays: touchdowns, possession changes, breaks and the
// Final use the flat navy/brown panel on every target. Each state is opened by
// the production presentation path with the longest supported team labels
// (Virginia Tech vs Wake Forest). Ordinary states must fit with no scrolling;
// all text must be readable and unclipped, and every action at least 44px.
// The longest supported Final (special result, unsaved Season copy, Coach
// Report and two actions) must be wholly reachable by touch and keyboard. The
// whole card may scroll for it; nothing inside may clip. Every case is
// session-muted before its first input.

const EPS = 1;
const SEASON_KEY = 'footballMathSeason:v1';
const CORRUPT_SEASON = '{\n  "schemaVersion": 1,\n  "currentSeason": { "broken": true }\n}\n';

// Safari's default keyboard policy skips buttons on Tab; Option-Tab is its
// all-controls gesture. Applied to Playwright WebKit on macOS only.
function tabKey(browserName) {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

function periodSeed(overrides) {
  const offense = (overrides.possession || 'offense') === 'offense';
  return {
    possession: 'offense',
    direction: offense ? 1 : -1,
    down: 1,
    yardsToGo: 10,
    yardLine: offense ? 20 : 80,
    firstDownLine: offense ? 30 : 70,
    driveStart: offense ? 20 : 80,
    plays: 2,
    drivePlays: 0,
    quarterPossessions: 3,
    ...overrides,
  };
}

// Quick Game with the longest supported player team and rival names.
async function startQuickGame(page) {
  await page.goto('/football/');
  await expectFootballTestMuted(page);
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await page.locator('.team-option:has(input[value="virginia-tech"])').tap();
  await page.locator('.rival-option:has(input[value="wake-forest"])').tap();
  await expect(page.locator('input[name="rival"][value="wake-forest"]')).toBeChecked();
  await page.locator('#start-game-btn').tap();
  await expect.poll(() => page.evaluate(() => sessionInitialized)).toBe(true);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
}

async function finishSeeded(page, seed, message) {
  return page.evaluate(({ value, text }) => {
    window.__footballTest.seedDriveState(value);
    finishPossession(text);
    return document.querySelector('.overlay.show')?.id || null;
  }, { value: seed, text: message });
}

// Break entrances move their rows; measure after they settle.
async function settleEntrances(page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.effect?.target?.closest?.('.ov-break'))
    .map(animation => animation.finished.catch(() => null))));
}

// Geometry, type, contrast and clipping facts for one shown overlay card.
function measureOverlay(page, id) {
  return page.evaluate((overlayId) => {
    const card = document.querySelector(`#${overlayId} > .overlay-card`);
    const cardStyle = getComputedStyle(card);
    const cardRect = card.getBoundingClientRect();
    const parse = (value) => {
      const match = /rgba?\(([^)]+)\)/.exec(value || '');
      if (!match) return null;
      const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const blend = (top, under) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (a, b) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    // Composite backgrounds from the card down; a gradient counts as its first stop.
    const background = (element) => {
      const chain = [];
      for (let node = element; node && node !== card.parentElement; node = node.parentElement) chain.unshift(node);
      let bg = { r: 0, g: 0, b: 0, a: 1 };
      for (const node of chain) {
        const style = getComputedStyle(node);
        const stop = style.backgroundImage !== 'none' ? parse(style.backgroundImage) : null;
        if (stop) bg = blend(stop, bg);
        const fill = parse(style.backgroundColor);
        if (fill && fill.a > 0) bg = blend(fill, bg);
      }
      return bg;
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const ownText = (element) => [...element.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent).join('').trim();
    // Any clipping ancestor inside the card that cuts the element.
    const clippedBy = (element) => {
      const rect = element.getBoundingClientRect();
      for (let node = element.parentElement; node && node !== card; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.overflowX === 'visible' && style.overflowY === 'visible' && style.clipPath === 'none') continue;
        const outer = node.getBoundingClientRect();
        if (rect.left < outer.left - 1 || rect.right > outer.right + 1
          || rect.top < outer.top - 1 || rect.bottom > outer.bottom + 1) return node.id || node.className || node.tagName;
      }
      return null;
    };

    const texts = [...card.querySelectorAll('*')]
      .filter(element => !element.closest('.ov-confetti, svg') && visible(element) && ownText(element))
      .map((element) => {
        const style = getComputedStyle(element);
        const color = parse(style.color);
        const bg = background(element);
        const rect = element.getBoundingClientRect();
        return {
          text: ownText(element).slice(0, 60),
          fontSize: parseFloat(style.fontSize),
          contrast: color ? contrast(blend(color, bg), bg) : null,
          disabled: Boolean(element.closest('button:disabled')),
          left: rect.left,
          right: rect.right,
          clippedBy: clippedBy(element),
        };
      });
    const buttons = [...card.querySelectorAll('button')].filter(visible).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        id: button.id,
        text: button.textContent.trim(),
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentScrollWidth: document.documentElement.scrollWidth,
      card: {
        top: cardRect.top,
        right: cardRect.right,
        bottom: cardRect.bottom,
        left: cardRect.left,
        width: cardRect.width,
        clientHeight: card.clientHeight,
        scrollHeight: card.scrollHeight,
        scrollTop: card.scrollTop,
        clipPath: cardStyle.clipPath,
        rail: getComputedStyle(card, '::after').display,
      },
      badgeWidth: card.querySelector('.ov-broadcast-badge').getBoundingClientRect().width,
      texts,
      buttons,
    };
  }, id);
}

function expectReadablePanel(metrics, label, { typeFloor = 12 } = {}) {
  const { viewport, card } = metrics;
  expect(metrics.documentScrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(viewport.width + EPS);
  expect(card.top, `${label}: card above viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(card.left, `${label}: card left of viewport`).toBeGreaterThanOrEqual(-EPS);
  expect(card.right, `${label}: card right of viewport`).toBeLessThanOrEqual(viewport.width + EPS);
  expect(card.bottom, `${label}: card below viewport`).toBeLessThanOrEqual(viewport.height + EPS);
  expect(card.clipPath, `${label}: chamfer removed`).toBe('none');
  expect(card.rail, `${label}: side rail removed`).toBe('none');
  expect(metrics.badgeWidth, `${label}: compact label chip`).toBeLessThanOrEqual(card.width / 2);
  expect(metrics.texts.length, `${label}: visible copy`).toBeGreaterThan(0);
  for (const text of metrics.texts) {
    expect(text.clippedBy, `${label}: "${text.text}" clipped`).toBeNull();
    expect(text.left, `${label}: "${text.text}" cut on the left`).toBeGreaterThanOrEqual(card.left - EPS);
    expect(text.right, `${label}: "${text.text}" cut on the right`).toBeLessThanOrEqual(card.right + EPS);
    if (typeFloor) expect(text.fontSize, `${label}: "${text.text}" type size`).toBeGreaterThanOrEqual(typeFloor);
    if (!text.disabled) expect(text.contrast, `${label}: "${text.text}" contrast`).toBeGreaterThanOrEqual(4.5);
  }
  expect(metrics.buttons.length, `${label}: visible actions`).toBeGreaterThan(0);
  for (const button of metrics.buttons) {
    expect(button.width, `${label}: narrow ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: short ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.left, `${label}: ${button.text} left of card`).toBeGreaterThanOrEqual(card.left - EPS);
    expect(button.right, `${label}: ${button.text} right of card`).toBeLessThanOrEqual(card.right + EPS);
  }
}

// Ordinary states fit whole: no card scroll and every action in view.
function expectOrdinaryFit(metrics, label) {
  expectReadablePanel(metrics, label);
  expect(metrics.card.scrollHeight, `${label}: card scrolls`).toBeLessThanOrEqual(metrics.card.clientHeight + EPS);
  for (const button of metrics.buttons) {
    expect(button.top, `${label}: ${button.text} above viewport`).toBeGreaterThanOrEqual(-EPS);
    expect(button.bottom, `${label}: ${button.text} below viewport`).toBeLessThanOrEqual(metrics.viewport.height + EPS);
  }
}

let errors;
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
});
test.afterEach(async () => {
  expect(errors, 'uncaught browser errors').toEqual([]);
});

const STATES = [
  {
    name: 'player touchdown',
    id: 'ov-td',
    open: page => page.evaluate(() => { showTD('offense'); return document.querySelector('.overlay.show')?.id; }),
    title: 'Touchdown!',
  },
  {
    name: 'opponent touchdown',
    id: 'ov-td',
    open: page => page.evaluate(() => { showTD('defense'); return document.querySelector('.overlay.show')?.id; }),
    title: 'WAKE FOREST Scores',
  },
  {
    name: 'defense transition',
    id: 'ov-defense',
    open: page => finishSeeded(page, periodSeed({
      possession: 'offense', quarter: 1, quarterPossessions: 0, scores: { player: 7, opponent: 0 }, tds: 1,
    }), 'PAT made for 1 point.'),
  },
  {
    name: 'offense transition',
    id: 'ov-offense',
    open: page => finishSeeded(page, periodSeed({
      possession: 'defense', quarter: 1, quarterPossessions: 1, scores: { player: 7, opponent: 7 }, tds: 1, opponentTds: 1,
    }), 'PAT made for 1 point.'),
  },
  {
    name: 'quarter end',
    id: 'ov-quarter',
    open: page => finishSeeded(page, periodSeed({
      possession: 'offense', quarter: 1, scores: { player: 7, opponent: 7 }, tds: 1, opponentTds: 1,
    }), 'Quarter complete.'),
  },
  {
    name: 'halftime',
    id: 'ov-halftime',
    open: page => finishSeeded(page, periodSeed({
      possession: 'defense', quarter: 2, scores: { player: 7, opponent: 7 }, tds: 1, opponentTds: 1,
    }), 'First half complete.'),
  },
  ...[
    ['final win', { player: 21, opponent: 14 }, 'You Win!'],
    ['final loss', { player: 10, opponent: 17 }, 'Final Score'],
    ['final tie', { player: 10, opponent: 10 }, 'Tie Game!'],
  ].map(([name, scores, title]) => ({
    name,
    id: 'ov-end',
    open: page => finishSeeded(page, periodSeed({
      possession: 'offense', quarter: 4, scores, tds: 1, opponentTds: 1, correctAnswers: 3, gradedQuestions: 5,
    }), 'Game complete.'),
    title,
  })),
];

for (const state of STATES) {
  test(`${state.name} uses the flat panel, fits, and stays readable`, async ({ page }) => {
    await startQuickGame(page);
    expect(await state.open(page), `${state.name}: shown overlay`).toBe(state.id);
    await expect(page.locator(`#${state.id}`)).toHaveClass(/(^|\s)show(\s|$)/);
    if (state.title) await expect(page.locator(`#${state.id} .ov-title`)).toHaveText(new RegExp(`^${state.title}$`, 'i'));
    await settleEntrances(page);
    expectOrdinaryFit(await measureOverlay(page, state.id), state.name);
  });
}

// The longest supported Final: a punt special result, the unsaved Season copy
// for a damaged store, the Coach Report and both recovery actions.
test('longest supported Final is wholly reachable by touch and keyboard', async ({ page, browserName }, testInfo) => {
  await page.goto('/football/');
  await expectFootballTestMuted(page);
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await page.locator('.play-mode-option', { hasText: '3-Game Season' }).tap();
  await expect(page.locator('input[name="play-mode"][value="season"]')).toBeChecked();
  await page.locator('.team-option:has(input[value="virginia-tech"])').tap();
  await page.locator('#start-game-btn').tap();
  await expect.poll(() => page.evaluate(() => sessionInitialized)).toBe(true);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');

  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__remainingNativeSeasonSetItem = nativeSetItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
      scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
    });
  }, SEASON_KEY);
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').tap();
  const correct = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance?.correctChoiceId);
  expect(correct, 'punt question choice').toEqual(expect.any(String));
  expect(await page.evaluate(id => window.__footballTest.answerChoice(id), correct)).not.toBe(false);
  await expect(page.locator('#ov-end')).toHaveClass(/(^|\s)show(\s|$)/);
  await expect(page.locator('#ov-end')).toHaveAttribute('data-special-result', /.*/);
  await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');

  await page.evaluate(({ key, raw }) => {
    window.__remainingNativeSeasonSetItem.call(localStorage, key, raw);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw, storageArea: localStorage }));
  }, { key: SEASON_KEY, raw: CORRUPT_SEASON });
  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().status)).toBe('corrupt');
  await expect(page.locator('#ov-end-season')).toContainText('Saved progress is damaged or changed.');
  await expect(page.locator('#ov-end-quick-btn')).toHaveText('Play Quick Game');
  await expect(page.locator('#ov-end-btn')).toBeFocused();

  // Special phone tiers keep their tuned 10px labels, so no type floor here.
  const top = await measureOverlay(page, 'ov-end');
  expectReadablePanel(top, 'longest Final', { typeFloor: 0 });
  const scrolls = top.card.scrollHeight > top.card.clientHeight + EPS;
  await testInfo.attach('longest-final.json', {
    body: JSON.stringify({
      scrolls,
      card: top.card,
      minFontSize: Math.min(...top.texts.map(text => text.fontSize)),
      buttons: top.buttons,
    }, null, 2),
    contentType: 'application/json',
  });

  // Keyboard: the next control is focused and brought into the card's view.
  await page.keyboard.press(tabKey(browserName));
  await expect(page.locator('#ov-end-quick-btn')).toBeFocused();
  const focused = await measureOverlay(page, 'ov-end');
  const quick = focused.buttons.find(button => button.id === 'ov-end-quick-btn');
  expect(quick.top, 'focused Quick Game above card view').toBeGreaterThanOrEqual(focused.card.top - EPS);
  expect(quick.bottom, 'focused Quick Game below card view').toBeLessThanOrEqual(focused.card.bottom + EPS);
  expect(quick.bottom, 'focused Quick Game below viewport').toBeLessThanOrEqual(focused.viewport.height + EPS);

  // Touch: at the end of the card both actions are whole and in view.
  if (scrolls) {
    await page.locator('#ov-end > .overlay-card').evaluate((card) => { card.scrollTop = card.scrollHeight; });
  }
  const end = await measureOverlay(page, 'ov-end');
  expect(end.buttons.map(button => button.text)).toEqual(['Retry Saving', 'Play Quick Game']);
  for (const button of end.buttons) {
    expect(button.top, `${button.text} above card view`).toBeGreaterThanOrEqual(end.card.top - EPS);
    expect(button.bottom, `${button.text} below card view`).toBeLessThanOrEqual(end.card.bottom + EPS);
    expect(button.bottom, `${button.text} below viewport`).toBeLessThanOrEqual(end.viewport.height + EPS);
  }
  await page.locator('#ov-end-quick-btn').tap();
  await expect(page.locator('#ov-end')).not.toHaveClass(/(^|\s)show(\s|$)/);
});
