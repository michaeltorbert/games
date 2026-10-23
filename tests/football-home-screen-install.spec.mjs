import { test, expect } from './curriculum-fixture.mjs';

const trigger = page => page.getByRole('button', { name: 'Add to Home Screen', exact: true });
const guide = page => page.locator('#home-screen-install dialog');
const primaryOnly = info => test.skip(info.project.name !== 'ipad-11-landscape', 'Signal and lifecycle contracts run once on primary target.');
const keys = browserName => browserName === 'webkit' && process.platform === 'darwin'
  ? { next: 'Alt+Tab', previous: 'Alt+Shift+Tab' } : { next: 'Tab', previous: 'Shift+Tab' };

async function signalFixture(page, { navigatorMode = false, mediaMode = false } = {}) {
  await page.addInitScript(({ navigatorMode, mediaMode }) => {
    window.__installMode = { navigatorMode, mediaMode };
    Object.defineProperty(navigator, 'standalone', { get: () => window.__installMode.navigatorMode });
    const original = window.matchMedia.bind(window);
    const standalone = new EventTarget();
    Object.defineProperty(standalone, 'matches', { get: () => window.__installMode.mediaMode });
    window.__installMedia = standalone;
    window.matchMedia = query => query === '(display-mode: standalone)' ? standalone : original(query);
    localStorage.setItem('installed', 'true'); // Installation memory is irrelevant.
    Object.defineProperty(document, 'referrer', { get: () => 'https://example.test/installed' });
    Object.defineProperty(document, 'fullscreenElement', { get: () => document.documentElement });
  }, { navigatorMode, mediaMode });
}

for (const [label, navigatorMode, mediaMode] of [
  ['ordinary browser despite installation memory/referrer/fullscreen', false, false],
  ['navigator standalone', true, false], ['display-mode standalone', false, true], ['both signals', true, true],
]) {
  test(`current launch mode: ${label}`, async ({ page }, info) => {
    primaryOnly(info);
    await signalFixture(page, { navigatorMode, mediaMode });
    await page.goto('/football/');
    await expect(page.locator('[data-home-screen-install]')).toHaveCount(1);
    if (navigatorMode || mediaMode) await expect(trigger(page)).toBeHidden();
    else await expect(trigger(page)).toBeVisible();
  });
}

test('guide fits each touch target in Quick Game and Season', async ({ page, browserName }, info) => {
  await page.goto('/football/');
  const environment = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height },
    dpr: devicePixelRatio, userAgent: navigator.userAgent, touchPoints: navigator.maxTouchPoints,
  }));
  await info.attach('emulation.json', { body: JSON.stringify({ browserName, ...environment,
    ...info.project.use, limitation: 'Browser engine emulation; not Apple Simulator or physical-device proof.' }), contentType: 'application/json' });
  for (const mode of ['Quick Game', '3-Game Season']) {
    await page.getByRole('radio', { name: new RegExp(mode) }).check();
    await expect(trigger(page)).toBeVisible();
    const box = await trigger(page).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath(`${mode.replaceAll(' ', '-')}-start.png`) });
    await trigger(page).tap();
    await expect(guide(page)).toBeVisible();
    await expect(guide(page)).toContainText('Tap Share');
    await expect(guide(page)).toContainText('Open as Web App');
    await expect(guide(page)).toContainText('Football Math');
    const close = guide(page).getByRole('button', { name: 'Close' });
    const closeBox = await close.boundingBox();
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    const geometry = await guide(page).evaluate(dialog => ({
      rect: dialog.getBoundingClientRect().toJSON(), viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(geometry.overflow).toBe(false);
    expect(geometry.rect.x).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.right).toBeLessThanOrEqual(geometry.viewport.width);
    expect(geometry.rect.bottom).toBeLessThanOrEqual(geometry.viewport.height);
    await info.attach(`${mode}-geometry.json`, { body: JSON.stringify(geometry), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`${mode.replaceAll(' ', '-')}-guide.png`) });
    await close.tap();
    await expect(guide(page)).not.toBeVisible();
    await expect(page.locator('#ov-start')).toHaveClass(/show/);
  }
});

test('native modal owns keyboard, restores focus, and closes on overlay and mode changes', async ({ page, browserName }, info) => {
  primaryOnly(info);
  const tab = keys(browserName);
  await signalFixture(page);
  await page.goto('/football/');
  await trigger(page).focus();
  await page.keyboard.press('Enter');
  const close = guide(page).getByRole('button', { name: 'Close' });
  await expect(close).toBeFocused();
  // Queued overlay autofocus must not steal focus from the native dialog.
  await page.evaluate(() => focusActiveOverlay(document.getElementById('ov-start')));
  await expect(close).toBeFocused();
  await page.keyboard.press(tab.next);
  await expect(guide(page).getByRole('region')).toBeFocused();
  await page.keyboard.press(tab.next);
  // Native modal Tab may visit browser chrome, but cannot focus the background.
  expect(await page.locator('#start-game-btn').evaluate(node => node === document.activeElement)).toBe(false);
  await close.focus();
  await page.keyboard.press('Escape');
  await expect(guide(page)).not.toBeVisible();
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await trigger(page).tap();
  await page.evaluate(() => activateOverlay('ov-time-lab'));
  await expect(guide(page)).not.toBeVisible();
  await expect(page.locator('#ov-time-lab')).toHaveClass(/show/);
  await page.evaluate(() => activateOverlay('ov-start'));
  await trigger(page).tap();
  await page.evaluate(() => { window.__installMode.mediaMode = true; window.__installMedia.dispatchEvent(new Event('change')); });
  await expect(guide(page)).not.toBeVisible();
  await expect(trigger(page)).toBeHidden();
  await page.evaluate(() => { window.__installMode.mediaMode = false; window.dispatchEvent(new Event('pageshow')); });
  await expect(trigger(page)).toBeVisible();
  await trigger(page).tap();
  await page.evaluate(() => hideOverlays());
  await expect(guide(page)).not.toBeVisible();
});

test('guide keeps game, saved Season, storage and selections intact; enlarged text scrolls', async ({ page }, info) => {
  primaryOnly(info);
  await page.goto('/football/');
  await page.evaluate(() => localStorage.setItem('footballMathSeason:v1', JSON.stringify({
    schemaVersion: 2, currentSeason: { seasonId: 'install-season', formatId: 'three-rival-team-schedule-v2',
      playerId: 'texas', createdAt: '2026-07-19T12:00:00.000Z', schedule: ['unc', 'nc-state', 'wake-forest'], results: [] },
  })));
  await page.reload();
  const snapshot = () => page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const databases = {};
    for (const { name } of dbs) {
      databases[name] = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, stores = [...db.objectStoreNames], data = {};
          if (!stores.length) { db.close(); resolve(data); return; }
          const transaction = db.transaction(stores, 'readonly');
          for (const store of stores) { const read = transaction.objectStore(store).getAll(); read.onsuccess = () => { data[store] = read.result; }; }
          transaction.oncomplete = () => { db.close(); resolve(data); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }
    return { storage: { ...localStorage }, databases, state: render_game_to_text(), season: FOOTBALL_SEASON.snapshot(),
      selections: [...document.querySelectorAll('#ov-start input:checked')].map(node => [node.name, node.value]) };
  });
  const before = await snapshot();
  await trigger(page).tap();
  await page.evaluate(() => document.documentElement.style.fontSize = '40px');
  const body = guide(page).getByRole('region');
  await body.focus();
  await page.keyboard.press('End');
  expect(await body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(guide(page).getByRole('button', { name: 'Close' })).toBeInViewport();
  await guide(page).getByRole('button', { name: 'Close' }).tap();
  await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
  expect(await snapshot()).toEqual(before);
  await expect(page.locator('#start-game-btn')).toBeEnabled();
});

test('reduced phone usable height keeps the utility reachable in its scroll card', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone-15-portrait', 'Reduced usable viewport is a phone-specific additional check.');
  await page.setViewportSize({ width: 393, height: 650 });
  await page.goto('/football/');
  const card = page.locator('#ov-start .overlay-card');
  const before = await card.evaluate(node => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflow: getComputedStyle(node).overflowY }));
  expect(before.overflow).toBe('auto');
  await trigger(page).scrollIntoViewIfNeeded();
  await expect(trigger(page)).toBeInViewport();
  await trigger(page).tap();
  await expect(guide(page)).toBeVisible();
  await page.screenshot({ path: info.outputPath('reduced-usable-height-guide.png') });
  await info.attach('reduced-height-scroll.json', { body: JSON.stringify(before), contentType: 'application/json' });
});
