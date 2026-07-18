import { test, expect } from '@playwright/test';

const overlayIds = ['ov-start', 'ov-td', 'ov-defense', 'ov-offense', 'ov-quarter', 'ov-halftime', 'ov-end'];

function primaryOnly(testInfo) {
  test.skip(
    testInfo.project.name !== 'ipad-11-landscape',
    'Focused state and keyboard checks run once on the primary target.',
  );
}

async function bootCallPhase(page, seed = 0x6a110) {
  await page.goto('/football/?boot=offense-call');
  await page.evaluate((rootSeed) => {
    window.__footballTest.setQuestionFault(null);
    window.__footballTest.setRootSeed(rootSeed);
  }, seed);
}

async function seedOrdinaryDrive(page, possession) {
  const reverse = possession === 'defense';
  await page.evaluate(({ side, direction, yardLine, firstDownLine }) => {
    window.__footballTest.seedDriveState({
      possession: side,
      direction,
      quarter: 2,
      down: 1,
      yardsToGo: 10,
      yardLine,
      firstDownLine,
      driveStart: yardLine,
      scores: { player: 7, opponent: 7 },
      totalYards: { player: 40, opponent: 35 },
      plays: 3,
      drivePlays: 0,
    });
  }, {
    side: possession,
    direction: reverse ? -1 : 1,
    yardLine: reverse ? 70 : 30,
    firstDownLine: reverse ? 60 : 40,
  });
}

test('all overlays expose one modal dialog and contain keyboard focus', async ({ page }) => {
  await page.goto('/football/');

  for (const id of overlayIds) {
    await page.evaluate(overlayId => activateOverlay(overlayId), id);
    const overlay = page.locator(`#${id}`);
    await expect(overlay).toHaveClass(/show/);
    await expect(overlay).toHaveAttribute('role', 'dialog');
    await expect(overlay).toHaveAttribute('aria-modal', 'true');
    await expect(overlay).toHaveAttribute('aria-hidden', 'false');
    expect(await overlay.getAttribute('aria-labelledby')).toBeTruthy();
    expect(await overlay.getAttribute('aria-describedby')).toBeTruthy();
    await expect(page.locator('#wrap')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('#wrap').evaluate(element => element.inert)).toBe(true);

    await expect.poll(() => page.evaluate(overlayId => document.activeElement?.closest('.overlay')?.id === overlayId, id)).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(overlayId => document.activeElement?.closest('.overlay')?.id === overlayId, id)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveClass(/show/);

    for (const hiddenId of overlayIds.filter(otherId => otherId !== id)) {
      const hidden = page.locator(`#${hiddenId}`);
      await expect(hidden).toHaveAttribute('aria-hidden', 'true');
      expect(await hidden.evaluate(element => element.inert)).toBe(true);
    }
  }
});

test('start overlay traps focus around the selected native radio tab stop', async ({ page }) => {
  await page.goto('/football/');
  const wakeForest = page.locator('input[name="rival"][value="wake-forest"]');
  const start = page.locator('#start-game-btn');

  await wakeForest.check();
  await wakeForest.focus();
  await expect(wakeForest).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(start).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(wakeForest).toBeFocused();
});

test('closing an overlay restores the game UI and focuses the next control', async ({ page }) => {
  await page.goto('/football/');
  await page.locator('#ov-start .ov-btn').click();
  await expect(page.locator('.overlay.show')).toHaveCount(0);
  await expect(page.locator('#wrap')).not.toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#wrap').evaluate(element => element.inert)).toBe(false);
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('call-btn'))).toBe(true);
});

test('render_game_to_text reports conversion facts instead of stale down-distance facts in both directions', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await bootCallPhase(page, 0x6a210);

  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'offense', direction: 1, quarter: 2,
      down: 4, yardsToGo: 7, yardLine: 91, firstDownLine: 98, driveStart: 80,
      scores: { player: 13, opponent: 14 },
    });
    showConversionDecision();
  });
  let rendered = await page.evaluate(() => JSON.parse(render_game_to_text()));
  expect(rendered).toMatchObject({
    mode: 'conversion-decision', possession: 'offense',
    down: null, ytg: null, firstDownLine: null,
    yardLine: 'opponent 2', absoluteYard: 98,
    conversion: {
      status: 'decision', attemptType: null, attemptValue: null,
      tryYardLine: 98, trySpot: 'opponent 2',
    },
  });

  await page.locator('#decision-grid .decision-btn[data-action="twoPoint"]').click();
  rendered = await page.evaluate(() => JSON.parse(render_game_to_text()));
  expect(rendered).toMatchObject({
    mode: 'question', possession: 'offense', playType: 'conversion',
    down: null, ytg: null, firstDownLine: null,
    yardLine: 'opponent 2', absoluteYard: 98,
    conversion: {
      status: 'active', attemptType: 'twoPoint', attemptValue: 2,
      tryYardLine: 98, trySpot: 'opponent 2',
    },
  });

  await page.evaluate(() => {
    window.__footballTest.seedDriveState({
      possession: 'defense', direction: -1, quarter: 3,
      down: 3, yardsToGo: 6, yardLine: 9, firstDownLine: 3, driveStart: 20,
      scores: { player: 14, opponent: 13 },
    });
    showConversionDecision(FOOTBALL_DOMAIN.deepFreeze({
      playType: 'conversion', attemptType: 'pat',
    }));
  });
  rendered = await page.evaluate(() => JSON.parse(render_game_to_text()));
  expect(rendered).toMatchObject({
    mode: 'conversion-decision', possession: 'defense',
    down: null, ytg: null, firstDownLine: null,
    yardLine: 'own 2', absoluteYard: 2,
    conversion: {
      status: 'decision', attemptType: 'pat', attemptValue: 1,
      tryYardLine: 2, trySpot: 'own 2',
    },
  });

  await page.locator('#decision-grid .decision-btn[data-action="pat"]').click();
  rendered = await page.evaluate(() => JSON.parse(render_game_to_text()));
  expect(rendered).toMatchObject({
    mode: 'question', possession: 'defense', playType: 'conversion',
    down: null, ytg: null, firstDownLine: null,
    yardLine: 'own 2', absoluteYard: 2,
    conversion: {
      status: 'active', attemptType: 'pat', attemptValue: 1,
      tryYardLine: 2, trySpot: 'own 2',
    },
  });
});

test('keyboard activation moves focus from an ordinary call card to the first answer', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await bootCallPhase(page, 0x6a310);

  for (const possession of ['offense', 'defense']) {
    await seedOrdinaryDrive(page, possession);
    const call = page.locator('#call-grid .call-btn').first();
    await call.focus();
    await expect(call).toBeFocused();
    await call.press('Enter');
    await expect(page.locator('#btn-row .ans-btn:not(.hidden):not(:disabled)').first()).toBeFocused();
  }
});

test('keyboard Continue returns focus to the next nonterminal call grid', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await bootCallPhase(page, 0x6a410);

  for (const possession of ['offense', 'defense']) {
    await seedOrdinaryDrive(page, possession);
    await page.locator('#call-grid .call-btn').first().press('Enter');
    const question = await page.evaluate(() => window.__footballTest.activeContracts().questionInstance);
    const wrongChoiceIds = question.choices
      .map(choice => choice.id)
      .filter(choiceId => choiceId !== question.correctChoiceId);
    expect(wrongChoiceIds.length).toBeGreaterThanOrEqual(2);
    await page.evaluate((choiceId) => window.__footballTest.answerChoice(choiceId), wrongChoiceIds[0]);
    await page.evaluate((choiceId) => window.__footballTest.answerChoice(choiceId), wrongChoiceIds[1]);

    const continueButton = page.locator('#question-continue');
    await expect(continueButton).toBeFocused();
    await continueButton.press('Enter');
    await expect(page.locator('#call-grid .call-btn').first()).toBeFocused({ timeout: 4000 });
  }
});
