import { writeFile } from 'node:fs/promises';
import { test, footballMuteTest, expect } from './curriculum-fixture.mjs';
import { expectFootballTestMuted } from './football-test-mute.mjs';

// Issue #51 kickoff/setup: the start overlay's flat navy presentation on every
// target. Quick and ordinary Season states must fit without any scrolling.
// Longer Season notices (damaged, newer-version, unavailable, unsaved) must be
// whole and reachable. The whole card may scroll for them, but nothing may be
// clipped and no inner region may scroll. The design C team options keep
// their computed styles. Real taps and keys drive the choices, the Time Lab
// Back focus and the curriculum Cancel/Continue. Every case is session-muted
// before its first input.

const EPS = 1;
const STORAGE_KEY = 'footballMathSeason:v1';
const SCHEDULE = ['unc', 'nc-state', 'wake-forest'];
const GOLD = 'rgb(255, 211, 55)';
const SUB_COPY = 'Call plays, answer math, and win the rivalry over 4 quarters.';

// The start overlay's IDs in document order; the DOM must be unchanged.
const START_IDS = [
  'ov-start', 'ov-start-title', 'ov-start-sub', 'team-picker', 'team-options', 'team-status',
  'play-mode-picker', 'quick-game-panel', 'rival-picker', 'rival-options', 'rival-preview',
  'rival-preview-matchup', 'rival-preview-style', 'season-panel', 'season-progress', 'season-record',
  'season-rungs', 'season-next', 'season-status', 'start-game-btn', 'tl-open-button',
];

// Design C computed styles per project, from the unchanged base rules.
const PHONE_C = { name: '16px', badge: [28, 22, '12px'], radius: '13px', padding: ['4px', '8px'] };
const PORTRAIT_C = { name: '17px', badge: [30, 24, '13px'], radius: '15px', padding: ['6px', '8px'] };
const WIDE_C = { name: '19px', badge: [30, 24, '13px'], radius: '15px', padding: ['6px', '10px'] };
const TEAM_C = {
  'iphone-15-portrait': PHONE_C,
  'iphone-17-pro-max-portrait': PHONE_C,
  'ipad-11-portrait': PORTRAIT_C,
  'ipad-pro-13-portrait': PORTRAIT_C,
  'ipad-11-landscape': WIDE_C,
  'ipad-pro-13-landscape': WIDE_C,
};

// Safari's default keyboard policy skips buttons on Tab; Option-Tab is its
// all-controls gesture. Applied to Playwright WebKit on macOS only.
function tabKeys(browserName) {
  const option = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : '';
  return { next: `${option}Tab`, previous: `${option}Shift+Tab` };
}

function isPhone(testInfo) {
  return testInfo.project.name.startsWith('iphone');
}

// Evidence is written into the run's output directory, not embedded in reports.
async function attachFile(testInfo, name, contentType, body) {
  const file = testInfo.outputPath(name);
  await writeFile(file, body);
  await testInfo.attach(name, { path: file, contentType });
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

function rawResult(gameNumber, playerScore, opponentScore) {
  return {
    gameNumber,
    gameId: `kickoff-game-${gameNumber}`,
    rivalId: SCHEDULE[gameNumber - 1],
    playerScore,
    opponentScore,
    completedAt: `2026-07-${String(18 + gameNumber).padStart(2, '0')}T12:00:00.000Z`,
  };
}

function rawTeamSeason(playerId, results) {
  return JSON.stringify({
    schemaVersion: 2,
    currentSeason: {
      seasonId: 'kickoff-season-fixture',
      formatId: 'three-rival-team-schedule-v2',
      playerId,
      createdAt: '2026-07-19T12:00:00.000Z',
      schedule: SCHEDULE,
      results,
    },
  });
}

async function boot(page, raw = null) {
  await page.goto('/football/');
  await page.evaluate(({ key, value }) => {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: raw });
  await page.reload();
  await expectFootballTestMuted(page);
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
}

async function tapMode(page, mode) {
  const label = page.locator('.play-mode-option', { hasText: mode === 'season' ? '3-Game Season' : 'Quick Game' });
  await label.tap();
  await expect(page.locator(`input[name="play-mode"][value="${mode}"]`)).toBeChecked();
}

// Geometry, type, contrast and clipping facts for the visible start card.
// Runs entirely in the page; returns plain data.
function measureStart(page) {
  return page.evaluate(() => {
    const card = document.querySelector('#ov-start .overlay-card');
    const cardStyle = getComputedStyle(card);
    const cardRect = card.getBoundingClientRect();
    const box = (rect) => ({ top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height });
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
    const lineTops = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => Math.round(rect.top))).size;
    };
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
      .filter(element => !element.closest('#team-options') && visible(element) && ownText(element))
      .map((element) => {
        const style = getComputedStyle(element);
        const color = parse(style.color);
        const bg = background(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === 'string' ? element.className : '',
          text: ownText(element).slice(0, 60),
          fontSize: parseFloat(style.fontSize),
          contrast: color ? contrast(blend(color, bg), bg) : null,
          disabled: Boolean(element.closest('button:disabled')),
          rect: box(rect),
          // Position within the card's scrollable content.
          contentTop: rect.top - cardRect.top + card.scrollTop,
          contentBottom: rect.bottom - cardRect.top + card.scrollTop,
          clippedBy: clippedBy(element),
        };
      });

    const nestedScroll = [...card.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      return ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    }).map(element => element.id || element.className);

    const control = (element) => {
      const style = getComputedStyle(element);
      return {
        text: element.textContent.replace(/\s+/g, ' ').trim(),
        disabled: element.disabled,
        rect: box(element.getBoundingClientRect()),
        contentTop: element.getBoundingClientRect().top - cardRect.top + card.scrollTop,
        contentBottom: element.getBoundingClientRect().bottom - cardRect.top + card.scrollTop,
        fontSize: parseFloat(style.fontSize),
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderRadius: style.borderTopLeftRadius,
      };
    };
    const start = document.getElementById('start-game-btn');
    const timeLab = document.getElementById('tl-open-button');

    const teamOptions = [...document.querySelectorAll('#team-options .team-option')].map((label) => {
      const style = getComputedStyle(label);
      const badge = label.querySelector('.team-badge');
      const badgeStyle = getComputedStyle(badge);
      const name = label.querySelector('.team-option-name');
      const nameStyle = getComputedStyle(name);
      const badgeRect = badge.getBoundingClientRect();
      return {
        id: label.dataset.teamId,
        checked: label.querySelector('input').checked,
        // A locked Season disables the fieldset, not each input's attribute.
        disabled: label.querySelector('input').matches(':disabled'),
        rect: box(label.getBoundingClientRect()),
        fontFamily: style.fontFamily,
        borderWidth: style.borderTopWidth,
        borderColor: style.borderTopColor,
        radius: style.borderTopLeftRadius,
        paddingTop: style.paddingTop,
        paddingLeft: style.paddingLeft,
        boxShadow: style.boxShadow,
        opacity: style.opacity,
        badgeText: badge.textContent,
        badgeHidden: badge.getAttribute('aria-hidden'),
        badgeWidth: Math.round(badgeRect.width),
        badgeHeight: Math.round(badgeRect.height),
        badgeFont: badgeStyle.fontSize,
        badgeColor: badgeStyle.color,
        badgeBackground: badgeStyle.backgroundColor,
        teamPrimary: label.style.getPropertyValue('--team-primary'),
        name: name.textContent,
        nameFont: nameStyle.fontSize,
        nameFamily: nameStyle.fontFamily,
        nameWeight: nameStyle.fontWeight,
        nameColor: nameStyle.color,
        nameLines: lineTops(name),
        nameClippedBy: clippedBy(name),
      };
    });

    return {
      viewport: { width: innerWidth, height: innerHeight },
      scrollY,
      docScrollWidth: document.documentElement.scrollWidth,
      card: {
        rect: box(cardRect),
        scrollTop: card.scrollTop,
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        scrollWidth: card.scrollWidth,
        clientWidth: card.clientWidth,
        overflowY: cardStyle.overflowY,
        clipPath: cardStyle.clipPath,
        borderTopColor: cardStyle.borderTopColor,
        borderTopWidth: cardStyle.borderTopWidth,
        before: getComputedStyle(card, '::before').display,
        after: getComputedStyle(card, '::after').display,
      },
      // Static markup IDs; renderRivalPicker() adds one rival-style-* per rival.
      ids: [document.getElementById('ov-start'), ...document.querySelectorAll('#ov-start [id]:not([id^="rival-style-"])')]
        .map(element => element.id),
      badge: {
        text: document.querySelector('#ov-start .ov-broadcast-badge').textContent,
        backgroundImage: getComputedStyle(document.querySelector('#ov-start .ov-broadcast-badge')).backgroundImage,
        lines: lineTops(document.querySelector('#ov-start .ov-broadcast-badge')),
        rect: box(document.querySelector('#ov-start .ov-broadcast-badge').getBoundingClientRect()),
      },
      title: {
        text: document.getElementById('ov-start-title').textContent,
        fontSize: parseFloat(getComputedStyle(document.getElementById('ov-start-title')).fontSize),
        lines: lineTops(document.getElementById('ov-start-title')),
      },
      sub: {
        text: document.getElementById('ov-start-sub').textContent,
        fontSize: parseFloat(getComputedStyle(document.getElementById('ov-start-sub')).fontSize),
        lines: lineTops(document.getElementById('ov-start-sub')),
      },
      legends: [...document.querySelectorAll('#ov-start legend')].filter(visible).map(legend => legend.textContent),
      teamStatus: document.getElementById('team-status').hidden ? null : document.getElementById('team-status').textContent,
      seasonStatus: document.getElementById('season-status').textContent,
      start: control(start),
      timeLab: {
        ...control(timeLab),
        title: timeLab.querySelector('.tl-entry-title').textContent,
        copy: timeLab.querySelector('.tl-entry-copy').textContent,
        titleSize: parseFloat(getComputedStyle(timeLab.querySelector('.tl-entry-title')).fontSize),
        copySize: parseFloat(getComputedStyle(timeLab.querySelector('.tl-entry-copy')).fontSize),
      },
      texts,
      nestedScroll,
      teamOptions,
    };
  });
}

// Checks every state shares. `fit` is 'strict' (no scrolling at all) or
// 'reachable' (the whole card may scroll; nothing is clipped or hidden).
async function expectStartPresentation(page, testInfo, label, fit) {
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#ov-start')).toHaveAttribute('aria-hidden', 'false');
  const metrics = await measureStart(page);
  const phone = isPhone(testInfo);
  const scrolls = metrics.card.scrollHeight > metrics.card.clientHeight + EPS;
  await attachFile(testInfo, `${label}-metrics.json`, 'application/json',
    `${JSON.stringify({ label, fit, scrolls, project: testInfo.project.name, ...metrics }, null, 2)}\n`);
  await attachFile(testInfo, `${label}.png`, 'image/png', await page.screenshot());

  // DOM, copy and order are the production markup.
  expect(metrics.ids, `${label}: start IDs and order`).toEqual(START_IDS);
  expect(metrics.badge.text, `${label}: Kickoff label`).toBe('KICKOFF');
  expect(metrics.title.text, `${label}: title copy`).toBe('Football Math!');
  expect(metrics.sub.text, `${label}: support copy`).toBe(SUB_COPY);
  expect(metrics.timeLab.title).toBe('Practice Clocks & Calendars');
  expect(metrics.timeLab.copy).toBe('A separate 8-question practice lab');

  // Flat chrome: no chamfer, rail or gloss; a gold top rule.
  expect(metrics.card.clipPath, `${label}: no chamfer`).toBe('none');
  expect(metrics.card.before, `${label}: no gloss layer`).toBe('none');
  expect(metrics.card.after, `${label}: no gold rail`).toBe('none');
  expect(metrics.card.borderTopColor, `${label}: gold top rule`).toBe(GOLD);
  // The Kickoff chip keeps the existing team-neutral info blue.
  expect(metrics.badge.backgroundImage, `${label}: Kickoff chip info blue`).toContain('rgb(26, 90, 204)');
  expect(metrics.badge.lines, `${label}: Kickoff on one line`).toBe(1);
  expect(metrics.badge.rect.width, `${label}: Kickoff is a compact chip`).toBeLessThan(metrics.card.rect.width / 3);
  expect(metrics.title.lines, `${label}: title on one line`).toBe(1);
  expect(metrics.title.fontSize, `${label}: title stays the largest type`).toBeGreaterThan(metrics.sub.fontSize * 2);

  // Action hierarchy: flat gold Start first, plain secondary Time Lab.
  expect(metrics.start.background, `${label}: Start is flat gold`).toBe(GOLD);
  expect(metrics.start.backgroundImage, `${label}: Start has no gradient`).toBe('none');
  expect(metrics.start.fontSize, `${label}: Start type leads Time Lab`).toBeGreaterThan(metrics.timeLab.titleSize);
  expect(metrics.timeLab.background, `${label}: Time Lab has no fill`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  if (phone) {
    expect(metrics.start.rect.bottom, `${label}: Start stacked above Time Lab`).toBeLessThanOrEqual(metrics.timeLab.rect.top + EPS);
  } else {
    expect(metrics.start.rect.right, `${label}: Start left of Time Lab`).toBeLessThanOrEqual(metrics.timeLab.rect.left + EPS);
  }
  for (const action of [metrics.start, metrics.timeLab]) {
    expect(action.rect.width, `${label}: ${action.text} width`).toBeGreaterThanOrEqual(44);
    expect(action.rect.height, `${label}: ${action.text} height`).toBeGreaterThanOrEqual(44);
  }

  // No horizontal overflow, no nested scrolling, the card inside the viewport.
  expect(metrics.docScrollWidth, `${label}: page horizontal overflow`).toBeLessThanOrEqual(metrics.viewport.width + EPS);
  expect(metrics.card.scrollWidth, `${label}: card horizontal overflow`).toBeLessThanOrEqual(metrics.card.clientWidth + EPS);
  expect(metrics.scrollY, `${label}: page scrolled`).toBe(0);
  expect(metrics.nestedScroll, `${label}: nested scroll regions`).toEqual([]);
  expect(metrics.card.rect.top, `${label}: card top`).toBeGreaterThanOrEqual(-EPS);
  expect(metrics.card.rect.left, `${label}: card left`).toBeGreaterThanOrEqual(-EPS);
  expect(metrics.card.rect.right, `${label}: card right`).toBeLessThanOrEqual(metrics.viewport.width + EPS);
  expect(metrics.card.rect.bottom, `${label}: card bottom`).toBeLessThanOrEqual(metrics.viewport.height + EPS);
  expect(metrics.card.scrollTop, `${label}: card opens at its top`).toBe(0);

  if (fit === 'strict') {
    expect(scrolls, `${label}: card content scrolls`).toBe(false);
    expect(metrics.start.rect.bottom, `${label}: Start above the fold`).toBeLessThanOrEqual(metrics.viewport.height + EPS);
    expect(metrics.timeLab.rect.bottom, `${label}: Time Lab above the fold`).toBeLessThanOrEqual(metrics.viewport.height + EPS);
  } else if (scrolls) {
    expect(metrics.card.overflowY, `${label}: tall content scrolls the whole card`).toMatch(/auto|scroll/);
  }

  // Every non-C text line: whole, unclipped, inside the card's content, a
  // 12px floor, and readable contrast unless its control is disabled.
  for (const text of metrics.texts) {
    const name = `${label}: "${text.text}"`;
    expect(text.clippedBy, `${name} clipped by an ancestor`).toBeNull();
    expect(text.rect.left, `${name} left`).toBeGreaterThanOrEqual(metrics.card.rect.left - EPS);
    expect(text.rect.right, `${name} right`).toBeLessThanOrEqual(metrics.card.rect.right + EPS);
    expect(text.contentTop, `${name} above the card content`).toBeGreaterThanOrEqual(-EPS);
    expect(text.contentBottom, `${name} below the card content`).toBeLessThanOrEqual(metrics.card.scrollHeight + EPS);
    expect(text.fontSize, `${name} type floor`).toBeGreaterThanOrEqual(12);
    if (!text.disabled) expect(text.contrast, `${name} contrast`).toBeGreaterThanOrEqual(4.5);
  }

  // Design C: computed control styles are the unchanged base rules.
  const c = TEAM_C[testInfo.project.name];
  expect(metrics.teamOptions.map(option => option.id)).toEqual(['duke', 'virginia-tech', 'texas', 'georgia-tech']);
  for (const option of metrics.teamOptions) {
    const name = `${label}: team ${option.id}`;
    expect(option.rect.width, `${name} width`).toBeGreaterThanOrEqual(44);
    expect(option.rect.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(option.fontFamily, `${name} font`).toContain('Barlow Condensed');
    expect(option.nameFamily, `${name} name font`).toContain('Barlow Condensed');
    expect(option.nameFont, `${name} name size`).toBe(c.name);
    expect(option.nameWeight, `${name} name weight`).toBe('800');
    expect(option.nameColor, `${name} name color`).toBe('rgb(255, 255, 255)');
    expect(option.nameLines, `${name} name lines`).toBeLessThanOrEqual(2);
    expect(option.nameClippedBy, `${name} name clipped`).toBeNull();
    expect([option.badgeWidth, option.badgeHeight, option.badgeFont], `${name} badge size`).toEqual(c.badge);
    expect(option.badgeHidden, `${name} badge decorative`).toBe('true');
    expect(option.badgeColor, `${name} badge ink`).toBe('rgb(255, 255, 255)');
    expect(option.teamPrimary, `${name} team color`).not.toBe('');
    expect(option.radius, `${name} radius`).toBe(c.radius);
    expect([option.paddingTop, option.paddingLeft], `${name} padding`).toEqual(c.padding);
    expect(option.borderWidth, `${name} border`).toBe('2px');
    if (option.checked) {
      expect(option.borderColor, `${name} selected border`).toBe(GOLD);
      expect(option.boxShadow, `${name} selected bar`).toContain('inset');
    }
    expect(option.opacity, `${name} lock dimming`).toBe(option.disabled && !option.checked ? '0.55' : '1');
  }
  return { ...metrics, scrolls };
}

// Brings an action into view inside a scrolling card, then taps nothing:
// it proves the control can be reached and is whole in the viewport.
async function expectReachable(page, selector, label) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const rect = await page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, height: box.height, viewport: innerHeight, scrollY };
  });
  expect(rect.top, `${label}: ${selector} top`).toBeGreaterThanOrEqual(-EPS);
  expect(rect.bottom, `${label}: ${selector} bottom`).toBeLessThanOrEqual(rect.viewport + EPS);
  expect(rect.scrollY, `${label}: page stays unscrolled`).toBe(0);
  await page.locator('#ov-start .overlay-card').evaluate(card => { card.scrollTop = 0; });
}

test('Quick Game fits every target with real team and rival taps', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await boot(page);
  await expect(page.locator('input[name="play-mode"][value="quick"]')).toBeChecked();
  await expect(page.locator('#start-game-btn')).toHaveText('Start Game');
  await expectStartPresentation(page, testInfo, 'quick-default', 'strict');

  // Each team and rival by tap; the preview follows.
  for (const teamId of ['virginia-tech', 'texas', 'georgia-tech', 'duke']) {
    await page.locator(`.team-option[data-team-id="${teamId}"]`).tap();
    await expect(page.locator(`input[name="player-team"][value="${teamId}"]`)).toBeChecked();
  }
  for (const rivalId of ['nc-state', 'wake-forest', 'unc']) {
    await page.locator(`.rival-option[data-rival-id="${rivalId}"]`).tap();
    await expect(page.locator(`input[name="rival"][value="${rivalId}"]`)).toBeChecked();
    await expect(page.locator(`.rival-option[data-rival-id="${rivalId}"] .rival-selected`)).toBeVisible();
  }

  // The longest team and rival names together.
  await page.locator('.team-option[data-team-id="virginia-tech"]').tap();
  await page.locator('.rival-option[data-rival-id="wake-forest"]').tap();
  await expect(page.locator('#rival-preview-matchup')).toHaveText('VA TECH VS WAKE FOREST');
  await expectStartPresentation(page, testInfo, 'quick-longest', 'strict');
  expect(await page.evaluate(() => ({ phase: state.phase, initialized: sessionInitialized })))
    .toEqual({ phase: 'start', initialized: false });
  expect(errors).toEqual([]);
});

test('ordinary Season states fit every target without scrolling', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await boot(page);
  await tapMode(page, 'season');
  await expect(page.locator('#season-panel')).toBeVisible();
  await expect(page.locator('#quick-game-panel')).toBeHidden();
  await expect(page.locator('#start-game-btn')).toHaveText('Start Season');
  await expectStartPresentation(page, testInfo, 'season-new', 'strict');

  // An active Season locks the longest team name and shows its notice.
  await boot(page, rawTeamSeason('virginia-tech', [rawResult(1, 7, 0)]));
  await expect(page.locator('input[name="play-mode"][value="season"]')).toBeChecked();
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 2');
  // The lock is the fieldset's native disabled state, which every contained
  // radio inherits. Read both directly rather than through toBeDisabled().
  const lock = await page.evaluate(() => {
    const fieldset = document.getElementById('team-picker');
    return {
      property: fieldset.disabled,
      attribute: fieldset.hasAttribute('disabled'),
      radios: [...fieldset.querySelectorAll('input[name="player-team"]')]
        .map(input => ({ value: input.value, disabled: input.matches(':disabled') })),
    };
  });
  expect(lock.property, 'team fieldset disabled property').toBe(true);
  expect(lock.attribute, 'team fieldset disabled attribute').toBe(true);
  expect(lock.radios.map(radio => radio.value)).toEqual(['duke', 'virginia-tech', 'texas', 'georgia-tech']);
  for (const radio of lock.radios) expect(radio.disabled, `${radio.value} radio disabled`).toBe(true);
  await expect(page.locator('#team-status')).toHaveText('Season team: Virginia Tech. Finish this Season to choose a new team.');
  await expect(page.locator('#season-status')).toHaveText('Season progress is saved on this device.');
  const locked = await expectStartPresentation(page, testInfo, 'season-active-locked', 'strict');
  expect(locked.teamOptions.find(option => option.checked)?.id).toBe('virginia-tech');
  // A locked team cannot be changed by tap.
  await page.locator('.team-option[data-team-id="texas"]').tap({ force: true });
  await expect(page.locator('input[name="player-team"][value="virginia-tech"]')).toBeChecked();

  await boot(page, rawTeamSeason('texas', [rawResult(1, 7, 0), rawResult(2, 0, 7), rawResult(3, 3, 3)]));
  await expect(page.locator('#season-progress')).toHaveText('Season complete');
  await expect(page.locator('#start-game-btn')).toHaveText('Start New Season');
  await expect(page.locator('#season-status')).toHaveText('Season complete and saved on this device.');
  await expectStartPresentation(page, testInfo, 'season-complete', 'strict');

  // Back to Quick by tap restores the rival picker.
  await tapMode(page, 'quick');
  await expect(page.locator('#quick-game-panel')).toBeVisible();
  await expect(page.locator('#start-game-btn')).toHaveText('Start Game');
  expect(errors).toEqual([]);
});

test('damaged, newer, and unavailable Season storage stay whole and reachable', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await boot(page, '{"schemaVersion":1,"currentSeason":{"broken":true}}');
  await expect(page.locator('input[name="play-mode"][value="season"]')).toBeChecked();
  await expect(page.locator('#season-progress')).toHaveText('Season unavailable');
  await expect(page.locator('#start-game-btn')).toHaveText('Start Fresh Season');
  await expect(page.locator('#season-status')).toHaveText('Season progress needs a fresh start. Quick Game still works.');
  await expectStartPresentation(page, testInfo, 'season-fresh-corrupt', 'reachable');
  await expectReachable(page, '#start-game-btn', 'season-fresh-corrupt');

  await boot(page, '{\n  "schemaVersion": 77,\n  "doNotTouch": true\n}\n');
  await expect(page.locator('#start-game-btn')).toHaveText('Season Unavailable');
  await expect(page.locator('#start-game-btn')).toBeDisabled();
  await expect(page.locator('#season-status')).toHaveText('This season was made by a newer game version. Quick Game still works.');
  const future = await expectStartPresentation(page, testInfo, 'season-future', 'reachable');
  expect(future.start.disabled).toBe(true);
  await expectReachable(page, '#start-game-btn', 'season-future');

  await boot(page);
  await page.evaluate((key) => {
    const nativeGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function(name) {
      if (name === key) throw new DOMException('blocked', 'SecurityError');
      return nativeGetItem.call(this, name);
    };
  }, STORAGE_KEY);
  await tapMode(page, 'season');
  await expect(page.locator('#start-game-btn')).toHaveText('Season Unavailable');
  await expect(page.locator('#season-next')).toHaveText('Choose Quick Game while season saving is unavailable.');
  await expect(page.locator('#season-status')).toHaveText('Season saving is not available right now. Quick Game still works.');
  await expectStartPresentation(page, testInfo, 'season-unavailable', 'reachable');
  await expectReachable(page, '#tl-open-button', 'season-unavailable');
  expect(errors).toEqual([]);
});

test('unsaved Season creation and unsaved final results keep every warning and action', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await boot(page);
  await page.evaluate((key) => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__kickoffNativeSetItem = nativeSetItem;
    window.__kickoffBlockSeason = true;
    Storage.prototype.setItem = function(name, value) {
      if (name === key && window.__kickoffBlockSeason) throw new DOMException('blocked', 'QuotaExceededError');
      return nativeSetItem.call(this, name, value);
    };
  }, STORAGE_KEY);
  await tapMode(page, 'season');
  await page.locator('#start-game-btn').tap();
  await expect(page.locator('#start-game-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#season-status')).toHaveText('Season could not be saved yet. Retry saving or play a Quick Game.');
  await expectStartPresentation(page, testInfo, 'season-retry-create', 'reachable');
  await expectReachable(page, '#start-game-btn', 'season-retry-create');

  // Let creation save, play to a final, then block the result write.
  await page.evaluate(() => { window.__kickoffBlockSeason = false; });
  await page.locator('#start-game-btn').tap();
  await expect(page.locator('#start-game-btn')).toHaveText('Play Game 1');
  await page.locator('#start-game-btn').tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  await page.evaluate(() => {
    window.__kickoffBlockSeason = true;
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 4,
      down: 4, yardsToGo: 10, yardLine: 28, firstDownLine: 38, driveStart: 20,
      scores: { player: 3, opponent: 7 }, quarterPossessions: 3,
    });
  });
  await page.locator('#decision-grid .decision-btn[data-action="punt"]').tap();
  expect(await page.evaluate(() => window.__footballTest.answerChoice('correct'))).not.toBe(false);
  await expect(page.locator('#ov-end')).toHaveClass(/show/);
  await expect(page.locator('#ov-end-btn')).toHaveText('Retry Saving');
  await page.locator('#ov-end-quick-btn').tap();
  await tapMode(page, 'season');
  await expect(page.locator('#start-game-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#season-status')).toHaveText('Not saved—closing or reloading will lose this game’s season result.');
  await expectStartPresentation(page, testInfo, 'season-pending-result', 'reachable');
  await expectReachable(page, '#start-game-btn', 'season-pending-result');

  // The longest notice: the unsaved result over damaged storage.
  await page.evaluate(({ key, raw }) => {
    window.__kickoffNativeSetItem.call(localStorage, key, raw);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw, storageArea: localStorage }));
  }, { key: STORAGE_KEY, raw: '{\n  "schemaVersion": 1,\n  "currentSeason": { "broken": true }\n}\n' });
  await expect.poll(() => page.evaluate(() => FOOTBALL_SEASON.snapshot().status)).toBe('corrupt');
  await tapMode(page, 'quick');
  await tapMode(page, 'season');
  await expect(page.locator('#start-game-btn')).toHaveText('Retry Saving');
  await expect(page.locator('#season-status')).toHaveText(
    'Not saved—closing or reloading will lose this game’s season result. Saved progress is damaged or changed. Retry Saving or use Quick Game. Start Fresh after reloading only if needed; this result will be lost.',
  );
  await expectStartPresentation(page, testInfo, 'season-pending-result-corrupt', 'reachable');
  await expectReachable(page, '#season-status', 'season-pending-result-corrupt');
  await expectReachable(page, '#tl-open-button', 'season-pending-result-corrupt');
  expect(errors).toEqual([]);
});

test('keyboard choices, visible focus, and Time Lab Back return to the start actions', async ({ page, browserName }, testInfo) => {
  const errors = watchErrors(page);
  const keys = tabKeys(browserName);
  await boot(page);

  await page.locator('input[name="play-mode"][value="quick"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="play-mode"][value="season"]')).toBeChecked();
  await expect(page.locator('#season-panel')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('input[name="play-mode"][value="quick"]')).toBeChecked();

  await page.locator('input[name="player-team"]:checked').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="player-team"][value="virginia-tech"]')).toBeChecked();
  await expect(page.locator('input[name="player-team"][value="virginia-tech"]')).toBeFocused();
  const teamFocus = await page.locator('.team-option[data-team-id="virginia-tech"]').evaluate((label) => {
    const style = getComputedStyle(label);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(teamFocus.style).not.toBe('none');
  expect(teamFocus.width).toBeGreaterThanOrEqual(2);

  await page.locator('input[name="rival"]:checked').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="rival"][value="nc-state"]')).toBeChecked();
  await expect(page.locator('#rival-preview-matchup')).toHaveText(/^VA TECH VS NC STATE$/i);

  await page.keyboard.press(keys.next);
  await expect(page.locator('#start-game-btn')).toBeFocused();
  await page.keyboard.press(keys.next);
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await page.keyboard.press(keys.previous);
  await expect(page.locator('#start-game-btn')).toBeFocused();
  const startFocus = await page.locator('#start-game-btn').evaluate((button) => {
    const style = getComputedStyle(button);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(startFocus.style).not.toBe('none');
  expect(startFocus.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press(keys.next);
  const labFocus = await page.locator('#tl-open-button').evaluate((button) => {
    const style = getComputedStyle(button);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(labFocus.style).not.toBe('none');
  expect(labFocus.width).toBeGreaterThanOrEqual(2);
  await attachFile(testInfo, 'keyboard-time-lab-focus.png', 'image/png', await page.screenshot());

  await page.keyboard.press('Enter');
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  await expect(page.locator('#ov-start')).not.toHaveClass(/show/);
  await page.locator('#tl-back-button').tap();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#tl-open-button')).toBeFocused();

  // The tap path opens and returns the same way.
  await page.locator('#tl-open-button').tap();
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  await page.locator('#tl-back-button').tap();
  await expect(page.locator('#tl-open-button')).toBeFocused();
  await expectStartPresentation(page, testInfo, 'time-lab-return', 'strict');
  expect(errors).toEqual([]);
});

footballMuteTest('Start opens the curriculum check, Cancel keeps setup, and Continue kicks off', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto('/football/');
  await expectFootballTestMuted(page);
  await page.locator('.team-option[data-team-id="texas"]').tap();
  await page.locator('#start-game-btn').tap();
  const dialog = page.locator('.curriculum-dialog');
  await expect(dialog).toBeVisible();
  await page.locator('#curriculum-cancel').tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('#start-game-btn')).toBeEnabled();
  await expect(page.locator('input[name="player-team"][value="texas"]')).toBeChecked();
  expect(await page.evaluate(() => ({ phase: state.phase, initialized: sessionInitialized })))
    .toEqual({ phase: 'start', initialized: false });
  await expectStartPresentation(page, testInfo, 'curriculum-cancelled', 'strict');

  await page.locator('#start-game-btn').tap();
  await expect(dialog).toBeVisible();
  await page.locator('#curriculum-submit').tap();
  // A changed page asks once more; read without waiting, as the dialog may be gone.
  const submitLabel = await page.evaluate(() => document.querySelector('#curriculum-submit')?.textContent ?? null);
  if (submitLabel === 'Confirm page') await page.locator('#curriculum-submit').tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  await expect(page.locator('#ov-start')).not.toHaveClass(/show/);
  expect(await page.evaluate(() => state.match.player.id)).toBe('texas');
  expect(errors).toEqual([]);
});
