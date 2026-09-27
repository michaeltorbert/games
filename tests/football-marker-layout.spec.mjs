import { test, expect } from './curriculum-fixture.mjs';

const EPSILON = 1;

function intersects(a, b) {
  return a.left < b.right - EPSILON && a.right > b.left + EPSILON
    && a.top < b.bottom - EPSILON && a.bottom > b.top + EPSILON;
}

async function markerGeometry(page) {
  return page.evaluate(() => {
    const box = (element) => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, height: r.height };
    };
    return {
      marker: box(document.querySelector('.fd-chain-badge')),
      chain: box(document.querySelector('#fd-chain')),
      nearRight: document.querySelector('#fd-chain').classList.contains('near-right-sideline'),
      nearLeft: document.querySelector('#fd-chain').classList.contains('near-left-sideline'),
      connectorWidth: parseFloat(getComputedStyle(document.querySelector('#fd-chain'), '::after').width) || 0,
      line: box(document.querySelector('#fd-line')),
      ball: box(document.querySelector('#ball')),
      player: box(document.querySelector('#player')),
      mute: box(document.querySelector('#mute-toggle')),
      playerVisible: getComputedStyle(document.querySelector('#player')).display !== 'none',
      numbers: [...document.querySelectorAll('.ylabel')].map(box),
      numberLayer: Number(getComputedStyle(document.querySelector('.ylabel')).zIndex),
      lineLayer: Number(getComputedStyle(document.querySelector('#fd-line')).zIndex),
      field: box(document.querySelector('#field-wrap')),
      feedback: box(document.querySelector('#feedback')),
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

test('to-gain badge stays with the target and clears field objects', async ({ page }, testInfo) => {
  await page.goto('/football/?boot=offense-call');
  const cases = [
    { possession: 'offense', direction: 1, yardLine: 20, firstDownLine: 30, yardsToGo: 10 },
    { possession: 'offense', direction: 1, yardLine: 70, firstDownLine: 80, yardsToGo: 10 },
    { possession: 'offense', direction: 1, yardLine: 74, firstDownLine: 84, yardsToGo: 10 },
    { possession: 'offense', direction: 1, yardLine: 90, firstDownLine: 100, yardsToGo: 10 },
    { possession: 'defense', direction: -1, yardLine: 80, firstDownLine: 70, yardsToGo: 10 },
    { possession: 'defense', direction: -1, yardLine: 15, firstDownLine: 5, yardsToGo: 10 },
    { possession: 'defense', direction: -1, yardLine: 12, firstDownLine: 2, yardsToGo: 10 },
    { possession: 'defense', direction: -1, yardLine: 10, firstDownLine: 0, yardsToGo: 10 },
  ];

  for (const [index, setup] of cases.entries()) {
    await page.evaluate((drive) => window.__footballTest.seedDriveState(drive), setup);
    await page.waitForFunction(() => {
      const field = document.querySelector('#field-wrap');
      const line = document.querySelector('#fd-line');
      const ball = document.querySelector('#ball');
      const fieldBox = field.getBoundingClientRect();
      const expected = (element) => fieldBox.left + field.clientLeft
        + field.clientWidth * parseFloat(element.style.left) / 100;
      const ballBox = ball.getBoundingClientRect();
      return Math.abs(line.getBoundingClientRect().left - expected(line)) < 1
        && Math.abs((ballBox.left + ballBox.right) / 2 - expected(ball)) < 1;
    });
    const geometry = await markerGeometry(page);
    if (geometry.nearRight) {
      expect(Math.abs(geometry.marker.right + geometry.connectorWidth - geometry.line.left),
        `case ${index}: badge connector tracks first-down line`).toBeLessThanOrEqual(EPSILON);
    } else {
      const offset = geometry.nearLeft ? 15 : 0;
      expect(Math.abs((geometry.marker.left + geometry.marker.right) / 2 - geometry.line.left - offset),
        `case ${index}: badge tracks first-down line`).toBeLessThanOrEqual(EPSILON);
    }
    expect(geometry.line.height, `case ${index}: first-down line retained`).toBeGreaterThan(0);
    expect(geometry.marker.top, `case ${index}: badge is inside field`).toBeGreaterThanOrEqual(geometry.field.top);
    expect(geometry.marker.bottom, `case ${index}: badge is inside field`).toBeLessThanOrEqual(geometry.field.bottom);
    expect(geometry.marker.left, `case ${index}: badge left edge inside field`).toBeGreaterThanOrEqual(geometry.field.left);
    expect(geometry.marker.right, `case ${index}: badge right edge inside field`).toBeLessThanOrEqual(geometry.field.right);
    expect(intersects(geometry.marker, geometry.ball), `case ${index}: ball clearance`).toBe(false);
    expect(intersects(geometry.marker, geometry.mute), `case ${index}: sound control clearance`).toBe(false);
    if (geometry.playerVisible) {
      expect(intersects(geometry.marker, geometry.player), `case ${index}: sprite clearance`).toBe(false);
    }
    for (const [numberIndex, number] of geometry.numbers.entries()) {
      expect(intersects(geometry.marker, number), `case ${index}: yard number ${numberIndex} clearance`).toBe(false);
    }
    expect(geometry.numberLayer, `case ${index}: yard numbers remain legible over the line`)
      .toBeGreaterThan(geometry.lineLayer);
    expect(intersects(geometry.marker, geometry.feedback), `case ${index}: feedback clearance`).toBe(false);
    expect(geometry.scrollWidth, `case ${index}: horizontal overflow`).toBeLessThanOrEqual(geometry.viewportWidth + EPSILON);
    if (index === 0 || index === 2) {
      await testInfo.attach(`marker-${index === 0 ? 'center' : 'right'}-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });
    }
  }

  await page.evaluate((drive) => window.__footballTest.seedDriveState(drive), cases[0]);
  await page.locator('#call-grid .call-btn').first().tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'question');
  const correctIndex = await page.evaluate(() => {
    const question = window.__footballTest.activeContracts().questionInstance;
    return question.choices.findIndex((choice) => choice.id === question.correctChoiceId);
  });
  expect(correctIndex).toBeGreaterThanOrEqual(0);
  await page.locator(`#b${correctIndex}`).tap();
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'feedback');
  await expect(page.locator('#feedback')).not.toBeEmpty();
  const feedbackGeometry = await markerGeometry(page);
  expect(intersects(feedbackGeometry.marker, feedbackGeometry.feedback),
    'badge clears visible feedback after a tapped answer').toBe(false);
  await expect(page.locator('#ui-desk')).toHaveAttribute('data-phase', 'call', { timeout: 5000 });
  const nextCallGeometry = await markerGeometry(page);
  expect((nextCallGeometry.ball.left + nextCallGeometry.ball.right) / 2,
    'the tapped play advances the ball').toBeGreaterThan((feedbackGeometry.ball.left + feedbackGeometry.ball.right) / 2);
  expect(intersects(nextCallGeometry.marker, nextCallGeometry.ball),
    'marker clears the advanced ball').toBe(false);
  for (const [numberIndex, number] of nextCallGeometry.numbers.entries()) {
    expect(intersects(nextCallGeometry.marker, number),
      `after play: yard number ${numberIndex} clearance`).toBe(false);
  }
});
