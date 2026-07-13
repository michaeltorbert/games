import { test, expect } from '@playwright/test';

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('mute target and preference survive reloads', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();

  const dimensions = await page.locator('#mute-toggle').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(dimensions.width).toBeGreaterThanOrEqual(44);
  expect(dimensions.height).toBeGreaterThanOrEqual(44);

  await page.locator('#mute-toggle').click();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('footballAudioMuted'))).toBe('true');

  await page.reload();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#ov-start .ov-btn').click();
  await page.locator('#mute-toggle').click();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('footballAudioMuted'))).toBe('false');

  await page.reload();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('storage failures degrade safely', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('storage read blocked'); };
    Storage.prototype.setItem = () => { throw new Error('storage write blocked'); };
  });

  await page.goto('/football/');
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#ov-start .ov-btn').click();
  await page.locator('#mute-toggle').click();
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('negative cues stay silent while positive cues remain wired', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    window.__audioEvents = [];

    class AudioParamMock {
      value = 0;
      setValueAtTime(value) { this.value = value; }
      exponentialRampToValueAtTime(value) { this.value = value; }
      linearRampToValueAtTime(value) { this.value = value; }
    }

    class AudioNodeMock {
      constructor(kind) {
        this.kind = kind;
        this.type = 'sine';
        this.frequency = new AudioParamMock();
        this.gain = new AudioParamMock();
      }
      connect() { return this; }
      start() { window.__audioEvents.push(`${this.kind}:${this.type}:start`); }
      stop() { window.__audioEvents.push(`${this.kind}:${this.type}:stop`); }
    }

    class AudioContextMock {
      constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
      resume() { this.state = 'running'; window.__audioEvents.push('resume'); return Promise.resolve(); }
      createOscillator() { return new AudioNodeMock('oscillator'); }
      createGain() { return new AudioNodeMock('gain'); }
    }

    window.AudioContext = AudioContextMock;
  });

  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();
  expect(await page.evaluate(() => window.__audioEvents)).toEqual(['resume']);
  expect(await page.evaluate(() => typeof playWhistle)).toBe('undefined');
  expect(await page.evaluate(() => typeof playWrong)).toBe('undefined');

  await page.locator('#call-grid .call-btn').first().click();
  await page.evaluate(() => {
    const wrongIndex = state.choices.findIndex(choice => choice !== state.correct);
    handleAnswer(wrongIndex);
  });
  expect(await page.evaluate(() => window.__audioEvents.filter(event => event.includes('oscillator')))).toEqual([]);

  await page.evaluate(() => {
    playCorrect();
    playFirstDown();
    playTouchdown();
  });
  const positiveStarts = await page.evaluate(() =>
    window.__audioEvents.filter(event => event.startsWith('oscillator:') && event.endsWith(':start'))
  );
  expect(positiveStarts).toHaveLength(10);
  expect(positiveStarts.slice(0, 2).every(event => event.includes(':sine:'))).toBe(true);
  expect(positiveStarts.slice(2).every(event => event.includes(':triangle:'))).toBe(true);
  expect(errors).toEqual([]);
});
