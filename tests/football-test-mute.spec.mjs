import { test, expect } from './curriculum-fixture.mjs';
import { MUTE_PREFERENCE_KEY, expectFootballTestMuted, muteFootballForTests } from './football-test-mute.mjs';

// Mandatory preflight for the session-only mute every non-audio Football case relies on.

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

// Captures the browser's own Web Audio constructor before any page script runs; nothing is replaced.
function captureNativeAudio() {
  window.__nativeAudioCtor = window.AudioContext || window.webkitAudioContext || null;
}

function audioState(page) {
  return page.evaluate(() => {
    const Native = window.__nativeAudioCtor;
    return {
      soundOn,
      stored: storedMutePreference(),
      canPlay: canPlayAudio(),
      pressed: document.getElementById('mute-toggle').getAttribute('aria-pressed'),
      nativeConstructor: !!Native && (window.AudioContext || window.webkitAudioContext) === Native,
      nativeContext: !!Native && audioCtx instanceof Native,
      contextState: audioCtx ? audioCtx.state : null,
    };
  });
}

// A trusted keydown reaches the game's real unlockAudio without pressing any game control.
async function trustedGesture(page) {
  await page.keyboard.press('Shift');
  await expect.poll(() => page.evaluate(() => audioCtx !== null)).toBe(true);
}

// Reads the stored preference from outside the page.
async function storedPreference(context) {
  const { origins } = await context.storageState();
  return origins.flatMap(origin => origin.localStorage).find(entry => entry.name === MUTE_PREFERENCE_KEY)?.value ?? null;
}

test('primary page is muted before input, and a trusted gesture unlocks native Web Audio without unmuting', async ({ page, context }, testInfo) => {
  const errors = trackErrors(page);
  await page.addInitScript(captureNativeAudio);
  // The fixture's goto verifies the mute here, before any input.
  await page.goto('/football/');
  const proof = await expectFootballTestMuted(page);
  expect(proof.proof.prefBefore).toEqual({ ok: true, value: null });
  const before = await audioState(page);
  // With no stored preference the game itself would play sound; only the session mute silences it.
  expect(before).toMatchObject({ soundOn: false, stored: false, canPlay: false, pressed: 'true', nativeConstructor: true, contextState: null });

  await trustedGesture(page);
  const after = await audioState(page);
  expect(after).toMatchObject({ soundOn: false, stored: false, canPlay: false, pressed: 'true', nativeConstructor: true, nativeContext: true });
  expect(await storedPreference(context)).toBeNull();
  await testInfo.attach('primary-audio-state.json', { body: JSON.stringify({ proof, before, after }, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('reload reinstalls the mute in a fresh document without writing a preference', async ({ page, context }) => {
  await page.goto('/football/');
  await page.evaluate(() => { window.__beforeReload = true; });
  await page.reload();
  expect(await page.evaluate(() => window.__beforeReload ?? null)).toBeNull();
  await expectFootballTestMuted(page);
  expect(await storedPreference(context)).toBeNull();
});

test('same-context pages and helper contexts are muted; a plain context keeps the real default', async ({ page, context, browser, baseURL }) => {
  await page.goto('/football/');
  const sibling = await context.newPage();
  await sibling.goto('/football/');
  await expectFootballTestMuted(sibling);

  const helped = await browser.newContext();
  await muteFootballForTests(helped);
  const helpedPage = await helped.newPage();
  await helpedPage.goto(`${baseURL}/football/`);
  await expectFootballTestMuted(helpedPage);
  await helped.close();

  // The mute is installed per context, so it cannot leak into an unrelated one.
  const plain = await browser.newContext();
  const plainPage = await plain.newPage();
  await plainPage.goto(`${baseURL}/football/`);
  expect(await plainPage.evaluate(() => ({ proof: window.__footballTestMute ?? null, soundOn }))).toEqual({ proof: null, soundOn: true });
  await expect(plainPage.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  await plain.close();
});

test('blocked storage still gets the session mute and a working trusted-gesture unlock', async ({ browser, baseURL }) => {
  const blocked = await browser.newContext();
  await muteFootballForTests(blocked);
  const blockedPage = await blocked.newPage();
  const errors = trackErrors(blockedPage);
  await blockedPage.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage read blocked'); };
    Storage.prototype.setItem = () => { throw new Error('storage write blocked'); };
  });
  await blockedPage.goto(`${baseURL}/football/`);
  const state = await expectFootballTestMuted(blockedPage);
  expect(state.proof.prefBefore).toEqual({ ok: false, value: null });
  await trustedGesture(blockedPage);
  expect(await blockedPage.evaluate(() => ({ soundOn, stored: storedMutePreference(), canPlay: canPlayAudio() })))
    .toEqual({ soundOn: false, stored: false, canPlay: false });
  expect(errors).toEqual([]);
  await blocked.close();
});

for (const seeded of [null, 'false', 'true']) {
  test(`stored preference ${JSON.stringify(seeded)} is read by the game but never written by the mute`, async ({ browser, baseURL }) => {
    const seededContext = await browser.newContext();
    await muteFootballForTests(seededContext);
    // Seeds once; a later write by anything else would survive the reload below.
    await seededContext.addInitScript(([key, value]) => {
      if (value !== null && location.pathname.startsWith('/football') && localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }, [MUTE_PREFERENCE_KEY, seeded]);
    const seededPage = await seededContext.newPage();
    const errors = trackErrors(seededPage);
    await seededPage.goto(`${baseURL}/football/`);
    const state = await expectFootballTestMuted(seededPage);
    expect(state.proof.prefBefore).toEqual({ ok: true, value: seeded });
    expect(await seededPage.evaluate(() => storedMutePreference())).toBe(seeded === 'true');
    await trustedGesture(seededPage);
    await seededPage.reload();
    await expectFootballTestMuted(seededPage);
    expect(await storedPreference(seededContext)).toBe(seeded);
    expect(errors).toEqual([]);
    await seededContext.close();
  });
}

test.describe('opted out', () => {
  test.use({ footballMute: false });
  test('footballMute false leaves the game default sound state and installs no mute', async ({ page }) => {
    await page.goto('/football/');
    expect(await page.evaluate(() => ({ proof: window.__footballTestMute ?? null, soundOn }))).toEqual({ proof: null, soundOn: true });
    await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
});
