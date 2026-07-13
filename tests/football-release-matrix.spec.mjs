import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const EPS = 1;

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function shot(page, project, label) {
  const dir = path.join(process.cwd(), 'tests', 'artifacts', 'release-matrix', project);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${label}.png`), fullPage: false });
}

async function assertViewport(page, label) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollY,
    scrollWidth: document.documentElement.scrollWidth,
    buttons: Array.from(document.querySelectorAll('button')).filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }).map(element => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent.trim().slice(0, 40),
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }),
  }));
  expect(metrics.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(metrics.width + EPS);
  for (const button of metrics.buttons) {
    expect(button.width, `${label}: narrow target ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: short target ${button.text}`).toBeGreaterThanOrEqual(44);
    expect(button.left, `${label}: left-clipped target ${button.text}`).toBeGreaterThanOrEqual(-EPS);
    expect(button.right, `${label}: right-clipped target ${button.text}`).toBeLessThanOrEqual(metrics.width + EPS);
  }
  return metrics;
}

async function assertOverlay(page, id, project, label) {
  const overlay = page.locator(`#${id}`);
  await expect(overlay).toHaveClass(/show/);
  await expect(overlay).toHaveAttribute('aria-hidden', 'false');
  await expect(overlay.locator('.ov-btn')).toBeVisible();
  if (id === 'ov-quarter' || id === 'ov-halftime') {
    await page.waitForTimeout(950);
  }
  const metrics = await assertViewport(page, label);
  const cta = await overlay.locator('.ov-btn').boundingBox();
  expect(cta.y + cta.height, `${label}: CTA below fold`).toBeLessThanOrEqual(metrics.height + EPS);
  await shot(page, project, label);
}

test('full football state matrix', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  const project = testInfo.project.name;
  await page.goto('/football/');
  await assertOverlay(page, 'ov-start', project, '01-start');

  await page.locator('#ov-start .ov-btn').click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call');
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(5);
  let metrics = await assertViewport(page, 'offense call');
  expect(metrics.scrollY).toBe(0);
  expect(Math.max(...metrics.buttons.map(button => button.bottom))).toBeLessThanOrEqual(metrics.height + EPS);
  await shot(page, project, '02-offense-call');

  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await assertViewport(page, 'offense question');
  await page.evaluate(() => document.getElementById(`b${state.choices.indexOf(state.correct)}`).click());
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await assertViewport(page, 'offense feedback');

  await page.evaluate(() => showTD('offense'));
  await assertOverlay(page, 'ov-td', project, '03-player-td');
  await page.evaluate(() => showDefenseTransition('Test transition.'));
  await assertOverlay(page, 'ov-defense', project, '04-defense-transition');
  await page.locator('#ov-defense .ov-btn').click();
  await expect(page.locator('#call-grid .call-btn')).toHaveCount(4);
  await assertViewport(page, 'defense call');
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await assertViewport(page, 'defense question');
  await page.evaluate(() => document.getElementById(`b${state.choices.indexOf(state.correct)}`).click());
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await assertViewport(page, 'defense feedback');

  await page.evaluate(() => showTD('defense'));
  await assertOverlay(page, 'ov-td', project, '05-opponent-td');
  await page.evaluate(() => showOffenseTransition('Test transition.'));
  await assertOverlay(page, 'ov-offense', project, '06-offense-transition');
  await page.evaluate(() => showQuarterEnd('Quarter complete.'));
  await assertOverlay(page, 'ov-quarter', project, '07-quarter-end');
  await page.evaluate(() => showHalftime('First half complete.'));
  await assertOverlay(page, 'ov-halftime', project, '08-halftime');
  await page.evaluate(() => showGameOver());
  await assertOverlay(page, 'ov-end', project, '09-final');
  await expect(page.locator('#ov-end-stats')).toContainText('2 / 2');
  await expect(page.locator('#ov-end-stats')).toContainText('100%');

  expect(errors).toEqual([]);
});

test('post-game accuracy counts wrong offense and defense answers', async ({ page }) => {
  await page.goto('/football/?boot=offense-call');
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await page.evaluate(() => document.getElementById(`b${state.choices.findIndex(choice => choice !== state.correct)}`).click());
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

  await page.evaluate(() => {
    clearTimeout(advTimer);
    startDrive('defense');
  });
  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  await page.evaluate(() => document.getElementById(`b${state.choices.findIndex(choice => choice !== state.correct)}`).click());
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');

  await page.evaluate(() => showGameOver());
  await expect(page.locator('#ov-end-stats')).toContainText('0 / 2');
  await expect(page.locator('#ov-end-stats')).toContainText('0%');
});

test('reduced motion freezes all new effects', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/football/');
  await page.evaluate(() => showQuarterEnd('Quarter complete.'));
  const styles = await page.evaluate(() => ({
    sweep: getComputedStyle(document.querySelector('.ov-sweep')).display,
    breakTitle: getComputedStyle(document.querySelector('.overlay.show .ov-title')).animationName,
    lights: getComputedStyle(document.body, '::before').animationName,
    crowd: getComputedStyle(document.body, '::after').animationName,
    stage: getComputedStyle(document.querySelector('#field-stage'), '::after').animationName,
  }));
  expect(styles.sweep).toBe('none');
  expect(styles.breakTitle).toBe('none');
  expect(styles.lights).toBe('none');
  expect(styles.crowd).toBe('none');
  expect(styles.stage).toBe('none');
  await page.evaluate(() => {
    Math.random = () => 0;
    activateOverlay('ov-td');
    spawnConfetti('ov-td-confetti', 40);
    spawnFireworks('ov-td-confetti', 'offense');
  });
  await page.waitForTimeout(200);
  await expect(page.locator('.confetti-piece')).toHaveCount(0);
  await expect(page.locator('.fw-burst')).toHaveCount(0);
  await shot(page, testInfo.project.name, '10-reduced-motion');
});
