import { test, expect } from './curriculum-fixture.mjs';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Rival engine contracts run once on the primary target.');
}

const PLAYER_TEAMS = ['duke', 'virginia-tech', 'texas', 'georgia-tech'];

// WCAG 2.x relative luminance and contrast ratio for #rrggbb or rgb()/rgba().
function channels(color) {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (hex) return hex.slice(1).map(part => Number.parseInt(part, 16));
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (rgb) return rgb.slice(1).map(Number);
  throw new Error(`Unparsed color ${color}`);
}

function luminance(color) {
  const [r, g, b] = channels(color).map((value) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test('catalog, profiles, and default UNC sampling form one deeply frozen closed contract', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');

  const result = await page.evaluate(() => {
    const deepFrozen = (value, seen = new Set()) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return true;
      seen.add(value);
      return Object.isFrozen(value) && Object.values(value).every(child => deepFrozen(child, seen));
    };
    const base = {
      down: 2, ytg: 6, yd: 60, direction: -1, quarter: 2,
      playerScore: 7, opponentScore: 7, quarterPossessions: 1, possessionsPerQuarter: 4,
    };
    const tendencies = Object.fromEntries(FOOTBALL_OPPONENT.RIVAL_ORDER.map((rivalId) => {
      const rival = FOOTBALL_OPPONENT.RIVALS[rivalId];
      const tendency = FOOTBALL_OPPONENT.getTendency(base, rival.profileKey);
      return [rivalId, {
        run: tendency.weights.shortRun + tendency.weights.longRun,
        pass: tendency.weights.shortPass + tendency.weights.mediumPass + tendency.weights.longPass,
      }];
    }));
    const balanced = FOOTBALL_OPPONENT.getTendency(base, 'balanced');
    const situations = Object.fromEntries(['powerRun', 'quickPass'].map(profileKey => [profileKey, {
      short: FOOTBALL_OPPONENT.getTendency({ ...base, down: 3, ytg: 2 }, profileKey).weights,
      long: FOOTBALL_OPPONENT.getTendency({ ...base, down: 3, ytg: 12 }, profileKey).weights,
    }]));
    let draws = 0;
    const plan = FOOTBALL_OPPONENT.planSnap(base, 'balanced', () => {
      draws++;
      return 0.5;
    }, 'unc');
    let invalidExplicit = null;
    try { FOOTBALL_OPPONENT.createMatch(undefined); } catch (error) { invalidExplicit = error.name; }
    return {
      order: FOOTBALL_OPPONENT.RIVAL_ORDER,
      seasonOrder: FOOTBALL_SEASON.SCHEDULE,
      seasonOrderFrozen: Object.isFrozen(FOOTBALL_SEASON.SCHEDULE),
      rivalKeys: Object.keys(FOOTBALL_OPPONENT.RIVALS),
      profileKeys: Object.keys(FOOTBALL_OPPONENT.PROFILES),
      profileCallKeys: Object.fromEntries(Object.entries(FOOTBALL_OPPONENT.PROFILES)
        .map(([key, profile]) => [key, Object.keys(profile.baseWeights)])),
      profileModifierValues: Object.values(FOOTBALL_OPPONENT.PROFILES).flatMap(profile =>
        Object.values(profile.modifiers).flatMap(modifiers => Object.values(modifiers))),
      coveredLeans: Object.fromEntries(Object.entries(FOOTBALL_OPPONENT.PROFILES).map(([key, profile]) => [
        key,
        [...new Set(Object.values(profile.looks).flatMap(look => look.leanKeys))].sort(),
      ])),
      links: FOOTBALL_OPPONENT.RIVAL_ORDER.map(id => FOOTBALL_OPPONENT.RIVALS[id].profileKey),
      catalogFrozen: deepFrozen(FOOTBALL_OPPONENT.RIVALS),
      profilesFrozen: deepFrozen(FOOTBALL_OPPONENT.PROFILES),
      listFrozen: deepFrozen(FOOTBALL_OPPONENT.listRivals()),
      defaultMatch: FOOTBALL_OPPONENT.createMatch(),
      defaultMatchFrozen: deepFrozen(FOOTBALL_OPPONENT.createMatch()),
      serializedMatches: JSON.stringify(FOOTBALL_OPPONENT.RIVAL_ORDER.map(rivalId => (
        FOOTBALL_OPPONENT.createMatch(rivalId)
      ))),
      wakeSmallTextColors: {
        accent: FOOTBALL_OPPONENT.RIVALS['wake-forest'].presentation.accent,
        accentInk: FOOTBALL_OPPONENT.RIVALS['wake-forest'].presentation.accentInk,
        scorebugTop: FOOTBALL_OPPONENT.RIVALS['wake-forest'].presentation.scorebugTop,
      },
      invalidExplicit,
      tendencies,
      balanced,
      situations,
      draws,
      plan,
    };
  });

  expect(result.order).toEqual(['unc', 'nc-state', 'wake-forest']);
  expect(result.seasonOrder).toEqual(result.order);
  expect(result.seasonOrderFrozen).toBe(true);
  expect(result.rivalKeys).toEqual(result.order);
  expect(result.profileKeys).toEqual(['balanced', 'powerRun', 'quickPass']);
  for (const callKeys of Object.values(result.profileCallKeys)) {
    expect(callKeys).toEqual(['shortRun', 'shortPass', 'longRun', 'mediumPass', 'longPass']);
  }
  expect(result.profileModifierValues.every(value => Number.isFinite(value) && value > 0)).toBe(true);
  for (const coverage of Object.values(result.coveredLeans)) expect(coverage).toEqual(['balanced', 'pass', 'run']);
  expect(result.links).toEqual(['balanced', 'powerRun', 'quickPass']);
  expect(result.catalogFrozen).toBe(true);
  expect(result.profilesFrozen).toBe(true);
  expect(result.listFrozen).toBe(true);
  expect(result.defaultMatch).toEqual({
    schemaVersion: 1,
    player: { id: 'duke', displayName: 'Duke', shortName: 'DUKE', endZoneName: 'DUKE' },
    opponent: { id: 'unc', displayName: 'North Carolina', shortName: 'UNC', endZoneName: 'CAROLINA' },
  });
  expect(result.serializedMatches).not.toMatch(/opponentProfileKey|profileKey/);
  expect(result.defaultMatchFrozen).toBe(true);
  expect(result.wakeSmallTextColors).toEqual({
    accent: '#9e7e38',
    accentInk: '#07152f',
    scorebugTop: '#80652e',
  });
  expect(result.invalidExplicit).toBe('RangeError');
  expect(result.tendencies['nc-state'].run).toBeGreaterThan(result.tendencies.unc.run);
  expect(result.tendencies.unc.run).toBeGreaterThan(result.tendencies['wake-forest'].run);
  expect(result.tendencies['wake-forest'].pass).toBeGreaterThan(result.tendencies.unc.pass);
  expect(result.tendencies.unc.pass).toBeGreaterThan(result.tendencies['nc-state'].pass);
  for (const situation of Object.values(result.situations)) {
    const shortSafe = situation.short.shortRun + situation.short.shortPass;
    const longSafe = situation.long.shortRun + situation.long.shortPass;
    const shortDeep = situation.short.mediumPass + situation.short.longPass;
    const longDeep = situation.long.mediumPass + situation.long.longPass;
    expect(shortSafe).toBeGreaterThan(longSafe);
    expect(longDeep).toBeGreaterThan(shortDeep);
  }
  expect(result.balanced.rawWeights).toEqual({
    shortRun: 1.2737088,
    shortPass: 1.29168,
    longRun: 2.5698816000000004,
    mediumPass: 3.5280000000000005,
    longPass: 3,
  });
  expect(result.balanced.weights).toEqual({
    shortRun: 0.10920683104457561,
    shortPass: 0.11074766816689766,
    longRun: 0.22033970849205384,
    mediumPass: 0.30248805686610847,
    longPass: 0.2572177354303643,
  });
  expect(result.draws).toBe(1);
  expect(result.plan).toMatchObject({ opponentId: 'unc', profileKey: 'balanced', plannedCallKey: 'mediumPass' });
});

test('playable teams form a frozen closed catalog that changes only public identity', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');
  const result = await page.evaluate(() => {
    const deepFrozen = (value, seen = new Set()) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return true;
      seen.add(value);
      return Object.isFrozen(value) && Object.values(value).every(child => deepFrozen(child, seen));
    };
    const rejects = (...args) => {
      try { FOOTBALL_OPPONENT.createMatch(...args); return null; } catch (error) { return error.name; }
    };
    const matches = {};
    for (const teamId of FOOTBALL_OPPONENT.PLAYER_TEAM_ORDER) {
      for (const rivalId of FOOTBALL_OPPONENT.RIVAL_ORDER) {
        const match = FOOTBALL_OPPONENT.createMatch(rivalId, teamId);
        matches[`${teamId}:${rivalId}`] = {
          match,
          frozen: deepFrozen(match),
          domainOk: FOOTBALL_DOMAIN.validateContext({
            contextId: `catalog-${teamId}-${rivalId}`, match, possession: 'offense', direction: 1,
            quarter: 1, down: 1, yardsToGo: 10, yardLine: 20, firstDownLine: 30,
            driveStart: 20, scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
            plays: 0, drivePlays: 0, calls: { offense: 'shortRun', defense: null, matchup: null },
            privateOpponentSnapshot: null,
          }).ok,
          rivalryLabel: FOOTBALL_OPPONENT.rivalryLabelFor(match),
        };
      }
    }
    return {
      order: FOOTBALL_OPPONENT.PLAYER_TEAM_ORDER,
      defaultTeam: FOOTBALL_OPPONENT.DEFAULT_PLAYER_TEAM_ID,
      keys: Object.keys(FOOTBALL_OPPONENT.PLAYER_TEAMS),
      catalogFrozen: deepFrozen(FOOTBALL_OPPONENT.PLAYER_TEAMS),
      listFrozen: deepFrozen(FOOTBALL_OPPONENT.listPlayerTeams()),
      identities: FOOTBALL_OPPONENT.listPlayerTeams().map(team => ({
        id: team.id, displayName: team.displayName, shortName: team.shortName, endZoneName: team.endZoneName,
      })),
      presentations: Object.fromEntries(FOOTBALL_OPPONENT.listPlayerTeams().map(team => [team.id, team.presentation])),
      rivalOrder: FOOTBALL_OPPONENT.RIVAL_ORDER,
      seasonPlayers: FOOTBALL_SEASON.PLAYER_IDS,
      defaultMatch: FOOTBALL_OPPONENT.createMatch(),
      oneArgMatch: FOOTBALL_OPPONENT.createMatch('nc-state'),
      explicitDukeMatch: FOOTBALL_OPPONENT.createMatch('nc-state', 'duke'),
      hookDefault: window.__footballTest.createMatch(),
      hookTexas: window.__footballTest.createMatch('wake-forest', 'texas'),
      invalid: {
        undefinedTeam: rejects('unc', undefined),
        nullTeam: rejects('unc', null),
        rivalAsTeam: rejects('unc', 'unc'),
        displayName: rejects('unc', 'Duke'),
        unknown: rejects('unc', 'clemson'),
        badRivalGoodTeam: rejects('clemson', 'texas'),
        resolve: (() => { try { FOOTBALL_OPPONENT.resolvePlayerTeam('texas '); return null; } catch (error) { return error.name; } })(),
      },
      matches,
    };
  });

  expect(result.order).toEqual(PLAYER_TEAMS);
  expect(result.keys).toEqual(PLAYER_TEAMS);
  expect(result.defaultTeam).toBe('duke');
  expect(result.seasonPlayers).toEqual(PLAYER_TEAMS);
  expect(result.order.some(teamId => result.rivalOrder.includes(teamId))).toBe(false);
  expect(result.catalogFrozen).toBe(true);
  expect(result.listFrozen).toBe(true);
  expect(result.identities).toEqual([
    { id: 'duke', displayName: 'Duke', shortName: 'DUKE', endZoneName: 'DUKE' },
    { id: 'virginia-tech', displayName: 'Virginia Tech', shortName: 'VA TECH', endZoneName: 'VA TECH' },
    { id: 'texas', displayName: 'Texas', shortName: 'TEXAS', endZoneName: 'TEXAS' },
    { id: 'georgia-tech', displayName: 'Georgia Tech', shortName: 'GA TECH', endZoneName: 'GA TECH' },
  ]);
  // Duke keeps the exact original literals.
  expect(result.presentations.duke).toEqual({
    token: 'duke', primary: '#003087', pads: '#0a3fa6', dark: '#001f5c', trim: '#ffffff', ink: '#ffffff',
    scorebugTop: '#003087', scorebugBottom: '#001a54', fireworks: ['#ffd337', '#003087', '#7bafd4', '#ffffff'],
  });
  expect(result.presentations['georgia-tech'].primary).toBe('#003057');
  expect(result.presentations['georgia-tech'].trim).toBe('#b3a369');
  expect(result.presentations.texas.primary).toBe('#bf5700');
  expect(result.presentations['virginia-tech'].primary).toBe('#861f41');
  expect(result.presentations['virginia-tech'].trim).toBe('#e5751f');
  // Text drawn on team colors meets WCAG AA for normal-size text.
  for (const [teamId, presentation] of Object.entries(result.presentations)) {
    for (const surface of ['primary', 'scorebugTop', 'scorebugBottom']) {
      expect(contrast(presentation.ink, presentation[surface]), `${teamId} ink on ${surface}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#ffffff', presentation[surface]), `${teamId} white on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  }

  const dukeUnc = {
    schemaVersion: 1,
    player: { id: 'duke', displayName: 'Duke', shortName: 'DUKE', endZoneName: 'DUKE' },
    opponent: { id: 'unc', displayName: 'North Carolina', shortName: 'UNC', endZoneName: 'CAROLINA' },
  };
  expect(result.defaultMatch).toEqual(dukeUnc);
  expect(result.hookDefault).toEqual(dukeUnc);
  expect(result.explicitDukeMatch).toEqual(result.oneArgMatch);
  expect(result.hookTexas.player.id).toBe('texas');
  expect(result.invalid).toEqual({
    undefinedTeam: 'RangeError', nullTeam: 'RangeError', rivalAsTeam: 'RangeError', displayName: 'RangeError',
    unknown: 'RangeError', badRivalGoodTeam: 'RangeError', resolve: 'RangeError',
  });
  for (const teamId of PLAYER_TEAMS) {
    for (const rivalId of result.rivalOrder) {
      const entry = result.matches[`${teamId}:${rivalId}`];
      expect(entry.frozen).toBe(true);
      expect(entry.domainOk, `${teamId} vs ${rivalId} domain context`).toBe(true);
      expect(Object.keys(entry.match)).toEqual(['schemaVersion', 'player', 'opponent']);
      expect(entry.match.player).toEqual(result.identities.find(identity => identity.id === teamId));
      expect(entry.match.opponent).toEqual(result.defaultMatch.opponent.id === rivalId
        ? result.defaultMatch.opponent
        : result.matches[`duke:${rivalId}`].match.opponent);
      expect(entry.rivalryLabel).toBe(teamId === 'duke'
        ? { unc: 'Tobacco Road', 'nc-state': 'Triangle Showdown', 'wake-forest': 'Piedmont Matchup' }[rivalId]
        : 'Game Day');
    }
  }
});

test('team picker previews by tap without RNG, fits every target, and colors only the player side', async ({ page }) => {
  await page.goto('/football/');
  const group = page.getByRole('group', { name: 'Choose your team' });
  const teams = group.getByRole('radio');
  await expect(teams).toHaveCount(4);
  await expect(group.getByRole('radio', { name: 'Duke' })).toBeChecked();
  // Initial focus stays on the existing rival choice.
  await expect(page.getByRole('group', { name: 'Choose the visiting rival' }).getByRole('radio').nth(0)).toBeFocused();
  // Each card shows the full name plus a decorative, hidden letter badge; the
  // radio's accessible name is exactly the full school name.
  const fullNames = ['Duke', 'Virginia Tech', 'Texas', 'Georgia Tech'];
  for (const fullName of fullNames) {
    await expect(group.getByRole('radio', { name: fullName, exact: true })).toHaveCount(1);
  }
  expect(await teams.evaluateAll(inputs => inputs.map((input) => {
    const label = input.closest('label');
    const badge = label.querySelector('.team-badge');
    const name = label.querySelector('.team-option-name');
    const nameStyle = getComputedStyle(name);
    const badgeStyle = getComputedStyle(badge);
    return {
      name: name.textContent,
      badge: badge.textContent,
      badgeHidden: badge.getAttribute('aria-hidden'),
      badgeBackground: badgeStyle.backgroundColor,
      badgeColor: badgeStyle.color,
      badgeBeforeName: Boolean(badge.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING),
      nameWhiteSpace: nameStyle.whiteSpace,
      nameTextOverflow: nameStyle.textOverflow,
    };
  }))).toEqual([
    ['Duke', 'D', 'rgb(0, 48, 135)'],
    ['Virginia Tech', 'VT', 'rgb(134, 31, 65)'],
    ['Texas', 'T', 'rgb(191, 87, 0)'],
    ['Georgia Tech', 'GT', 'rgb(0, 48, 87)'],
  ].map(([name, badge, badgeBackground]) => ({
    name,
    badge,
    badgeHidden: 'true',
    badgeBackground,
    badgeColor: 'rgb(255, 255, 255)',
    badgeBeforeName: true,
    nameWhiteSpace: 'normal',
    nameTextOverflow: 'clip',
  })));

  await page.evaluate(() => {
    window.__teamDraws = { football: 0, scheduler: 0, presentation: 0 };
    window.__footballTest.setRngStreams({
      football: () => { window.__teamDraws.football++; return 0.25; },
      scheduler: () => { window.__teamDraws.scheduler++; return 0.25; },
      presentation: () => { window.__teamDraws.presentation++; return 0.25; },
    });
  });
  const expected = {
    duke: { short: 'DUKE', jersey: 'rgb(0, 48, 135)' },
    'virginia-tech': { short: 'VA TECH', jersey: 'rgb(134, 31, 65)' },
    texas: { short: 'TEXAS', jersey: 'rgb(191, 87, 0)' },
    'georgia-tech': { short: 'GA TECH', jersey: 'rgb(0, 48, 87)' },
  };
  for (const [teamId, team] of Object.entries(expected).reverse()) {
    await page.locator(`.team-option[data-team-id="${teamId}"]`).tap();
    await expect(page.locator(`input[name="player-team"][value="${teamId}"]`)).toBeChecked();
    await expect(page.locator('#rival-preview-matchup')).toHaveText(`${team.short} VS UNC`);
    const presented = await page.evaluate(() => ({
      root: document.documentElement.dataset.player,
      scorebug: document.getElementById('s-player-name').textContent,
      endZone: document.getElementById('player-end-zone').textContent,
      ribbon: document.getElementById('status-ribbon-text').textContent,
      ballOn: document.getElementById('s-yd').textContent,
      jersey: getComputedStyle(document.querySelector('#player .pl-jersey')).fill,
      tacklerJersey: getComputedStyle(document.querySelector('#tackler .pl-jersey')).fill,
      tacklerStripe: getComputedStyle(document.querySelector('#tackler .pl-stripe')).stroke,
      stateMatch: state.match.player.id,
      renderMatch: JSON.parse(render_game_to_text()).match.player.id,
      opponent: document.documentElement.dataset.opponent,
      chromeBadge: getComputedStyle(document.querySelector('#ov-start .ov-broadcast-badge')).backgroundImage,
    }));
    // Background labels follow the provisional choice too (no game starts).
    expect(presented.ballOn).toContain(team.short);
    expect(presented).toMatchObject({
      root: teamId, scorebug: team.short, endZone: team.short, ribbon: `${team.short} BALL - OFFENSE`, jersey: team.jersey,
      tacklerJersey: 'rgb(123, 175, 212)', tacklerStripe: 'rgb(255, 255, 255)',
      stateMatch: teamId, renderMatch: teamId, opponent: 'unc',
    });
    expect(presented.chromeBadge).toContain('rgb(26, 90, 204)');
  }
  expect(await page.evaluate(() => window.__teamDraws)).toEqual({ football: 0, scheduler: 0, presentation: 0 });
  expect(await page.evaluate(() => ({ phase: state.phase, initialized: sessionInitialized })))
    .toEqual({ phase: 'start', initialized: false });

  // The longest team name with the longest rival matchup must fit every target.
  await page.locator('.team-option[data-team-id="virginia-tech"]').tap();
  await page.locator('[data-rival-id="wake-forest"]').tap();
  await expect(page.locator('#rival-preview-matchup')).toHaveText('VA TECH VS WAKE FOREST');
  const metrics = await page.evaluate(() => {
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    const card = document.querySelector('#ov-start .overlay-card');
    return {
      options: [...document.querySelectorAll('.team-option')].map(label => ({
        id: label.dataset.teamId,
        ...box(label),
        nameOverflow: label.querySelector('.team-option-name').scrollWidth - label.querySelector('.team-option-name').clientWidth,
        nameOverflowY: label.querySelector('.team-option-name').scrollHeight - label.querySelector('.team-option-name').clientHeight,
        partsInside: ['.team-badge', '.team-option-name'].every((selector) => {
          const part = label.querySelector(selector).getBoundingClientRect();
          const card = label.getBoundingClientRect();
          return part.left >= card.left && part.right <= card.right && part.top >= card.top && part.bottom <= card.bottom;
        }),
      })),
      start: box(document.getElementById('start-game-btn')),
      card: { ...box(card), scrollHeight: card.scrollHeight, clientHeight: card.clientHeight },
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  for (const option of metrics.options) {
    expect(option.width, `${option.id} width`).toBeGreaterThanOrEqual(44);
    expect(option.height, `${option.id} height`).toBeGreaterThanOrEqual(44);
    expect(option.top, `${option.id} top`).toBeGreaterThanOrEqual(0);
    expect(option.bottom, `${option.id} bottom`).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(option.left, `${option.id} left`).toBeGreaterThanOrEqual(0);
    expect(option.right, `${option.id} right`).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(option.nameOverflow, `${option.id} name clipped`).toBeLessThanOrEqual(0);
    expect(option.nameOverflowY, `${option.id} name clipped vertically`).toBeLessThanOrEqual(1);
    expect(option.partsInside, `${option.id} badge and name inside the card`).toBe(true);
  }
  expect(metrics.start.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.card.top).toBeGreaterThanOrEqual(0);
  expect(metrics.card.bottom).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.card.scrollHeight).toBeLessThanOrEqual(metrics.card.clientHeight + 1);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

  await page.locator('#start-game-btn').tap();
  await expect.poll(() => page.evaluate(() => sessionInitialized)).toBe(true);
  const committed = await page.evaluate(() => ({
    match: state.match,
    rejected: window.__footballTest.selectPlayerTeam('duke'),
    after: state.match,
  }));
  expect(committed.match.player.id).toBe('virginia-tech');
  expect(committed.match.opponent.id).toBe('wake-forest');
  expect(committed.rejected).toBe(false);
  expect(committed.after).toEqual(committed.match);
  const endZone = await page.evaluate(() => {
    const zone = document.getElementById('player-end-zone').getBoundingClientRect();
    const field = document.getElementById('field-wrap').getBoundingClientRect();
    return {
      long: document.getElementById('player-end-zone').classList.contains('ez-long'),
      inside: zone.top >= field.top && zone.bottom <= field.bottom && zone.left >= field.left,
    };
  });
  expect(endZone).toEqual({ long: true, inside: true });

  await page.evaluate(() => showGameOver());
  await page.locator('#ov-end-btn').tap();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(page.locator('input[name="player-team"][value="virginia-tech"]')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).match.player.id)).toBe('virginia-tech');
});

test('picker previews without RNG, commits only on Start, and rematches the selected rival', async ({ page }) => {
  await page.goto('/football/');
  const group = page.getByRole('group', { name: 'Choose the visiting rival' });
  const radios = group.getByRole('radio');
  await expect(radios).toHaveCount(3);
  await expect(radios.nth(0)).toBeChecked();
  await expect(radios.nth(0)).toBeFocused();

  const initialMetrics = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.rival-option')].map((label) => {
      const rect = label.getBoundingClientRect();
      return { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom };
    });
    const start = document.getElementById('start-game-btn').getBoundingClientRect();
    const card = document.querySelector('#ov-start .overlay-card').getBoundingClientRect();
    return {
      labels,
      startBottom: start.bottom,
      cardTop: card.top,
      cardBottom: card.bottom,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  for (const label of initialMetrics.labels) {
    expect(label.width).toBeGreaterThanOrEqual(44);
    expect(label.height).toBeGreaterThanOrEqual(44);
    expect(label.top).toBeGreaterThanOrEqual(0);
    expect(label.bottom).toBeLessThanOrEqual(initialMetrics.viewportHeight);
  }
  expect(initialMetrics.startBottom).toBeLessThanOrEqual(initialMetrics.viewportHeight);
  expect(initialMetrics.cardTop).toBeGreaterThanOrEqual(0);
  expect(initialMetrics.cardBottom).toBeLessThanOrEqual(initialMetrics.viewportHeight);
  expect(initialMetrics.scrollWidth).toBeLessThanOrEqual(initialMetrics.viewportWidth + 1);

  await page.evaluate(() => {
    window.__rivalDraws = { football: 0, scheduler: 0, presentation: 0 };
    window.__footballTest.setRngStreams({
      football: () => { window.__rivalDraws.football++; return 0.25; },
      scheduler: () => { window.__rivalDraws.scheduler++; return 0.25; },
      presentation: () => { window.__rivalDraws.presentation++; return 0.25; },
    });
  });
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(1)).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-opponent', 'nc-state');
  expect(await radios.nth(1).evaluate(input => getComputedStyle(input.closest('label')).outlineStyle)).toBe('solid');

  await radios.nth(2).check();
  await expect(page.locator('#rival-preview-matchup')).toHaveText('DUKE VS WAKE FOREST');
  await expect(page.locator('#rival-preview-style')).toContainText('Quick spread');
  expect(await page.evaluate(() => window.__rivalDraws)).toEqual({ football: 0, scheduler: 0, presentation: 0 });
  expect(await page.evaluate(() => ({ mode: state.phase, initialized: sessionInitialized })))
    .toEqual({ mode: 'start', initialized: false });

  await page.locator('#start-game-btn').click();
  await expect.poll(()=>page.evaluate(()=>sessionInitialized)).toBe(true);
  const committed = await page.evaluate(() => ({
    render: JSON.parse(render_game_to_text()),
    stateMatch: state.match,
    rejectedSwitch: window.__footballTest.selectRival('unc'),
    stateMatchAfterSwitch: state.match,
  }));
  expect(committed.render.match.opponent.id).toBe('wake-forest');
  expect(committed.stateMatch).toEqual(committed.render.match);
  expect(committed.rejectedSwitch).toBe(false);
  expect(committed.stateMatchAfterSwitch).toEqual(committed.stateMatch);

  await page.evaluate(() => showGameOver());
  await page.locator('#ov-end-btn').click();
  await expect(page.locator('#ov-start')).toHaveClass(/show/);
  await expect(group.getByRole('radio').nth(2)).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(render_game_to_text()).match.opponent.id)).toBe('wake-forest');
});

test('query-only rival initializes the complete provisional start match', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?rival=wake-forest');

  const start = await page.evaluate(() => ({
    checkedRival: document.querySelector('input[name="rival"]:checked')?.value,
    stateMatch: state.match,
    renderMatch: JSON.parse(render_game_to_text()).match,
    previewMatchup: document.getElementById('rival-preview-matchup')?.textContent,
    previewStyle: document.getElementById('rival-preview-style')?.textContent,
    rootOpponent: document.documentElement.dataset.opponent,
    wrapOpponent: document.getElementById('wrap')?.dataset.opponent,
  }));

  expect(start.checkedRival).toBe('wake-forest');
  expect(start.stateMatch.opponent).toMatchObject({ id: 'wake-forest', displayName: 'Wake Forest' });
  expect(start.renderMatch).toEqual(start.stateMatch);
  expect(start.previewMatchup).toBe('DUKE VS WAKE FOREST');
  expect(start.previewStyle).toBe('Quick spread · fast throws in space');
  expect(start.rootOpponent).toBe('wake-forest');
  expect(start.wrapOpponent).toBe('wake-forest');
});

test('invalid and empty rival queries render the UNC picker and suppress boot modes', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const queries = [
    '?rival=not-a-rival',
    '?rival=',
    '?boot=offense-call&rival=not-a-rival',
    '?boot=defense-call&rival=',
  ];

  for (const query of queries) {
    await page.goto(`/football/${query}`);
    const start = await page.evaluate(() => ({
      mode: state.phase,
      sessionInitialized,
      overlayShown: document.getElementById('ov-start')?.classList.contains('show'),
      rivalOptions: [...document.querySelectorAll('input[name="rival"]')].map(input => input.value),
      checkedRival: document.querySelector('input[name="rival"]:checked')?.value,
      stateMatch: state.match,
      renderMatch: JSON.parse(render_game_to_text()).match,
      previewMatchup: document.getElementById('rival-preview-matchup')?.textContent,
      previewStyle: document.getElementById('rival-preview-style')?.textContent,
      rootOpponent: document.documentElement.dataset.opponent,
    }));

    expect(start.mode).toBe('start');
    expect(start.sessionInitialized).toBe(false);
    expect(start.overlayShown).toBe(true);
    expect(start.rivalOptions).toEqual(['unc', 'nc-state', 'wake-forest']);
    expect(start.checkedRival).toBe('unc');
    expect(start.stateMatch.opponent).toMatchObject({ id: 'unc', displayName: 'North Carolina' });
    expect(start.renderMatch).toEqual(start.stateMatch);
    expect(start.previewMatchup).toBe('DUKE VS UNC');
    expect(start.previewStyle).toBe('Balanced attack · ready for any down');
    expect(start.rootOpponent).toBe('unc');
  }
  expect(pageErrors).toEqual([]);
});

test('non-default match identity survives snaps, recovery, every transition, restart, and boot', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=defense-call&rival=nc-state');
  const initial = await page.evaluate(() => ({
    match: state.match,
    renderMatch: JSON.parse(render_game_to_text()).match,
    snapshot: window.__footballTest.opponentSnapshot(),
  }));
  expect(initial.match).toEqual(initial.renderMatch);
  expect(initial.match.opponent.id).toBe('nc-state');
  expect(initial.snapshot).toMatchObject({ opponentId: 'nc-state', profileKey: 'powerRun' });

  await page.evaluate(() => {
    window.__recoveryDraws = 0;
    window.__footballTest.setRngStreams({
      football: () => { window.__recoveryDraws++; return 0.25; },
      scheduler: () => 0.25,
      presentation: () => 0.25,
    });
    window.__footballTest.seedDriveState({
      rivalId: 'nc-state', possession: 'defense', direction: -1,
      quarter: 2, down: 2, yardsToGo: 8, yardLine: 70, firstDownLine: 62,
      driveStart: 80, scores: { player: 7, opponent: 7 },
      totalYards: { player: 31, opponent: 28 }, plays: 5, drivePlays: 1,
    });
    window.__frozenRecoverySnapshot = window.__footballTest.opponentSnapshot();
    window.__footballTest.setQuestionFault('invalid-context');
  });
  expect(await page.evaluate(() => window.__recoveryDraws)).toBe(1);
  await page.locator('#call-grid .call-btn').first().click();
  const recovered = await page.evaluate(() => ({
    contracts: window.__footballTest.activeContracts(),
    snapshot: window.__footballTest.opponentSnapshot(),
    original: window.__frozenRecoverySnapshot,
    draws: window.__recoveryDraws,
  }));
  expect(recovered.contracts.render.mode).toBe('call');
  expect(recovered.contracts.render.match).toEqual(initial.match);
  expect(recovered.snapshot).toEqual(recovered.original);
  expect(recovered.draws).toBe(2);

  const lifetime = await page.evaluate(() => {
    window.__footballTest.setQuestionFault(null);
    const expected = JSON.stringify(state.match);
    const checks = [];
    const record = label => checks.push({ label, phase: state.phase, match: JSON.stringify(state.match) });
    const sameReference = createGameState(state.match).match === state.match;
    const gameSnapshotMatch = JSON.stringify(gameSnapshot().match);
    const blankOwnsMatch = Object.prototype.hasOwnProperty.call(blankPlayState(), 'match');
    startDrive('offense'); record('drive');
    showTD('offense'); record('touchdown');
    showDefenseTransition('Switch sides.'); record('defense-transition');
    showOffenseTransition('Switch sides.'); record('offense-transition');
    showQuarterEnd('Quarter done.'); record('quarter');
    showHalftime('Half done.'); record('halftime');
    showGameOver(); record('final');
    restart(); record('restart');
    return { expected, checks, sameReference, gameSnapshotMatch, blankOwnsMatch, selectedRivalId };
  });
  expect(lifetime.sameReference).toBe(true);
  expect(lifetime.gameSnapshotMatch).toBe(lifetime.expected);
  expect(lifetime.blankOwnsMatch).toBe(false);
  expect(lifetime.checks.map(check => check.label)).toEqual([
    'drive', 'touchdown', 'defense-transition', 'offense-transition', 'quarter', 'halftime', 'final', 'restart',
  ]);
  expect(lifetime.checks.every(check => check.match === lifetime.expected)).toBe(true);
  expect(lifetime.selectedRivalId).toBe('nc-state');
});

test('Wake Forest presentation and contextual copy cover every public opponent path without private leakage', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call&rival=wake-forest');
  await expect(page.locator('html')).toHaveAttribute('data-opponent', 'wake-forest');
  await expect(page.locator('#s-opponent-name')).toHaveText('WAKE FOREST');
  await expect(page.locator('#opponent-end-zone')).toHaveText('WAKE');
  await expect(page.locator('#stage-rivalry-label')).toHaveText('Piedmont Matchup');
  await expect(page.locator('#status-ribbon-text')).toHaveText('DUKE BALL - OFFENSE');

  await page.evaluate(() => window.__footballTest.seedDriveState({
    rivalId: 'wake-forest', possession: 'defense', direction: -1,
    quarter: 3, down: 2, yardsToGo: 6, yardLine: 70, firstDownLine: 64,
    driveStart: 80, scores: { player: 3, opponent: 4 },
    totalYards: { player: 83, opponent: 99 }, plays: 8, drivePlays: 2,
  }));
  await expect(page.locator('#status-ribbon-text')).toHaveText('WAKE FOREST BALL - DEFENSE');
  await expect(page.locator('#stage-possession')).toHaveText('WAKE FOREST on offense');
  await expect(page.locator('#play-context')).toContainText('WAKE FOREST BALL');
  await expect(page.locator('#defense-read')).toContainText('WAKE FOREST shows');
  const preSnapRender = await page.evaluate(() => render_game_to_text());
  expect(preSnapRender).not.toMatch(/opponentProfileKey|profileKey/);

  await page.locator('#call-grid .call-btn').first().click();
  await expect(page.locator('#play-label')).toContainText('WAKE FOREST is threatening');
  const snapPrivacy = await page.evaluate(() => {
    const contracts = window.__footballTest.activeContracts();
    return {
      match: contracts.activeSnap.context.match,
      privateSnapshot: contracts.activeSnap.context.privateOpponentSnapshot,
      publicRender: contracts.render,
      publicSerialized: JSON.stringify(contracts.render),
      publicText: render_game_to_text(),
    };
  });
  expect(snapPrivacy.match.opponent.id).toBe('wake-forest');
  expect(snapPrivacy.privateSnapshot).toMatchObject({ opponentId: 'wake-forest', profileKey: 'quickPass' });
  expect(snapPrivacy.publicSerialized).not.toContain('plannedCallKey');
  expect(snapPrivacy.publicSerialized).not.toContain('rawWeights');
  expect(snapPrivacy.publicSerialized).not.toContain('modifiers');
  expect(snapPrivacy.publicText).not.toMatch(/opponentProfileKey|profileKey/);
  expect(snapPrivacy.publicRender.opponentTendency).not.toHaveProperty('weights');
  expect(snapPrivacy.publicRender.opponentTendency).not.toHaveProperty('profileKey');

  const contextual = await page.evaluate(() => {
    const offenseContext = {
      contextId: 'wake-copy', match: state.match, possession: 'offense', direction: 1,
      quarter: 3, down: 2, yardsToGo: 6, yardLine: 34, firstDownLine: 40, driveStart: 27,
      scores: { player: 3, opponent: 4 }, totalYards: { player: 83, opponent: 99 },
      plays: 8, drivePlays: 2, calls: { offense: 'shortRun', defense: null, matchup: null },
      privateOpponentSnapshot: null,
    };
    const scoreSnap = FOOTBALL_DOMAIN.createSnap(offenseContext, { gain: 4, callKey: 'shortRun' });
    const total = FOOTBALL_CONTEXTUAL_QUESTIONS.build(scoreSnap, 'committed-score-total');
    const difference = FOOTBALL_CONTEXTUAL_QUESTIONS.build(scoreSnap, 'committed-score-difference');
    const teenSnap = FOOTBALL_DOMAIN.createSnap({
      ...offenseContext,
      contextId: 'wake-teen',
      scores: { player: 7, opponent: 14 },
    }, { gain: 4, callKey: 'shortRun' });
    const teen = FOOTBALL_CONTEXTUAL_QUESTIONS.build(teenSnap, 'committed-score-ones');
    state.activeSnap = scoreSnap;
    state.questionInstance = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
      ...total, contextId: scoreSnap.contextId, questionInstanceId: 'wake-render',
    }));
    state.questionUi = makeQuestionUiState();
    state.phase = 'question';
    syncQuestionMirrors();
    renderMathVisual();
    return {
      total,
      difference,
      teen,
      visualText: document.getElementById('math-overlay').textContent,
      visualAria: document.getElementById('math-overlay').getAttribute('aria-label'),
      opponentTokenTeam: document.querySelector('#math-overlay [data-team="opponent"]')?.dataset.team,
    };
  });
  const contextualSerialized = JSON.stringify(contextual);
  expect(contextualSerialized).toContain('WAKE FOREST');
  expect(contextualSerialized).not.toContain('UNC');
  expect(contextual.total.bindings.map(binding => binding.source.path)).toEqual([
    '/context/scores/player', '/context/scores/opponent',
  ]);
  expect(contextual.difference.bindings.map(binding => binding.source.path)).toEqual([
    '/context/scores/player', '/context/scores/opponent',
  ]);
  expect(contextual.teen.bindings[0].source.path).toBe('/context/scores/opponent');
  expect(contextual.teen.visuals.initial.data.team).toBe('WAKE FOREST');
  expect(contextual.visualText).toContain('WAKE FOREST');
  expect(contextual.visualAria).toContain('WAKE FOREST');
  expect(contextual.opponentTokenTeam).toBe('opponent');

  await page.evaluate(() => showTD('defense'));
  await expect(page.locator('#ov-td-badge')).toHaveText('WAKE FOREST TD');
  await expect(page.locator('#ov-td-title')).toHaveText('WAKE FOREST Scores');
  await expect(page.locator('#ov-td-sub')).toContainText('WAKE FOREST has');
  await page.evaluate(() => showDefenseTransition('Change of possession.'));
  await expect(page.locator('#ov-defense-title')).toHaveText("WAKE FOREST's Ball");
  await page.evaluate(() => showQuarterEnd('Quarter complete.'));
  await expect(page.locator('#ov-quarter-scorebug')).toContainText('WAKE FOREST');
  await page.evaluate(() => showHalftime('Half complete.'));
  await expect(page.locator('#ov-halftime-scorebug')).toContainText('WAKE FOREST');
  await page.evaluate(() => showGameOver());
  await expect(page.locator('#ov-end-score')).toHaveAttribute('aria-label', /Wake Forest/);
  await expect(page.locator('#ov-end-sub')).toContainText('Wake Forest');

  const theme = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    applyMatchPresentation(state.match);
    applyMatchPresentation(state.match);
    return {
      accent: style.getPropertyValue('--opponent-accent').trim(),
      accentInk: style.getPropertyValue('--opponent-accent-ink').trim(),
      scorebugTop: style.getPropertyValue('--opponent-scorebug-top').trim(),
      opponent: document.documentElement.dataset.opponent,
    };
  });
  expect(theme).toEqual({
    accent: '#9e7e38',
    accentInk: '#07152f',
    scorebugTop: '#80652e',
    opponent: 'wake-forest',
  });
});

test('a Texas game keeps Texas identity on every public player path, palette, and transition', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/?boot=offense-call&rival=nc-state&team=texas');
  await expect(page.locator('html')).toHaveAttribute('data-player', 'texas');
  await expect(page.locator('#s-player-name')).toHaveText('TEXAS');
  await expect(page.locator('#player-end-zone')).toHaveText('TEXAS');
  await expect(page.locator('#status-ribbon-text')).toHaveText('TEXAS BALL - OFFENSE');
  await expect(page.locator('#stage-possession')).toHaveText('Texas on offense');
  await expect(page.locator('#stage-rivalry-label')).toHaveText('Game Day');
  await expect(page.locator('#desk-kicker')).toHaveText('Set the Texas offense.');
  await expect(page.locator('#play-context')).toContainText('TEXAS BALL');
  const colors = await page.evaluate(() => {
    const style = selector => getComputedStyle(document.querySelector(selector));
    return {
      scorebug: style('.sb-duke').backgroundImage,
      field: style('#field-wrap').backgroundImage,
      helmet: style('#player .pl-helmet').fill,
      stripe: style('#player .pl-stripe').stroke,
      tacklerJersey: style('#tackler .pl-jersey').fill,
      offenseFireworks: fireworkPalette('offense'),
      defenseFireworks: fireworkPalette('defense'),
    };
  });
  expect(colors.scorebug).toContain('rgb(191, 87, 0)');
  expect(colors.scorebug).toContain('rgb(138, 63, 0)');
  expect(colors.field).toContain('rgb(191, 87, 0)');
  expect(colors.helmet).toBe('rgb(191, 87, 0)');
  expect(colors.stripe).toBe('rgb(255, 255, 255)');
  expect(colors.tacklerJersey).toBe('rgb(204, 0, 0)');
  expect(colors.offenseFireworks).toEqual(['#bf5700', '#ffffff', '#333f48', '#ffd337']);
  expect(colors.defenseFireworks).toEqual(['#cc0000', '#ffffff', '#7f1010', '#ffd337']);

  await page.evaluate(() => window.__footballTest.seedDriveState({
    possession: 'defense', direction: -1,
    quarter: 3, down: 2, yardsToGo: 6, yardLine: 70, firstDownLine: 64,
    driveStart: 80, scores: { player: 3, opponent: 4 },
    totalYards: { player: 83, opponent: 99 }, plays: 8, drivePlays: 2,
  }));
  expect(await page.evaluate(() => state.match.player.id)).toBe('texas');
  await expect(page.locator('#desk-kicker')).toHaveText('Set the Texas defense.');
  await expect(page.locator('#status-ribbon-text')).toHaveText('NC STATE BALL - DEFENSE');

  const contextual = await page.evaluate(() => {
    const context = {
      contextId: 'texas-copy', match: state.match, possession: 'offense', direction: 1,
      quarter: 3, down: 2, yardsToGo: 6, yardLine: 34, firstDownLine: 40, driveStart: 27,
      scores: { player: 13, opponent: 4 }, totalYards: { player: 83, opponent: 99 },
      plays: 8, drivePlays: 2, calls: { offense: 'shortRun', defense: null, matchup: null },
      privateOpponentSnapshot: null,
    };
    // The two-digit player score supplies the ones-place family; the total
    // family is eligible only when both scores and their sum stay within 10.
    const onesSnap = FOOTBALL_DOMAIN.createSnap(context, { gain: 4, callKey: 'shortRun' });
    const ones = FOOTBALL_CONTEXTUAL_QUESTIONS.build(onesSnap, 'committed-score-ones');
    const snap = FOOTBALL_DOMAIN.createSnap({
      ...context, contextId: 'texas-total', scores: { player: 3, opponent: 4 },
    }, { gain: 4, callKey: 'shortRun' });
    const total = FOOTBALL_CONTEXTUAL_QUESTIONS.build(snap, 'committed-score-total');
    state.activeSnap = snap;
    state.questionInstance = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
      ...total, contextId: snap.contextId, questionInstanceId: 'texas-render',
    }));
    state.questionUi = makeQuestionUiState();
    state.phase = 'question';
    syncQuestionMirrors();
    renderMathVisual();
    const token = document.querySelector('#math-overlay [data-team="player"]');
    return {
      team: ones.visuals.initial.data.team,
      onesPath: ones.bindings[0].source.path,
      totalPaths: total.bindings.map(binding => binding.source.path),
      visualText: document.getElementById('math-overlay').textContent,
      visualAria: document.getElementById('math-overlay').getAttribute('aria-label'),
      tokenBackground: token ? getComputedStyle(token).backgroundColor : null,
      tokenColor: token ? getComputedStyle(token).color : null,
    };
  });
  // Contextual questions label the player by display name.
  expect(contextual.team).toBe('Texas');
  expect(contextual.onesPath).toBe('/context/scores/player');
  expect(contextual.totalPaths).toEqual(['/context/scores/player', '/context/scores/opponent']);
  expect(contextual.visualText).toContain('TEXAS');
  expect(contextual.visualAria).toMatch(/Texas/i);
  expect(contextual.visualAria).not.toMatch(/Duke/i);
  expect(contextual.tokenBackground).toBe('rgb(191, 87, 0)');
  expect(contextual.tokenColor).toBe('rgb(255, 255, 255)');
  expect(contrast(contextual.tokenColor, contextual.tokenBackground)).toBeGreaterThanOrEqual(4.5);

  await page.evaluate(() => showTD('offense'));
  await expect(page.locator('#play-context')).toContainText('TEXAS TOUCHDOWN');
  await page.evaluate(() => showQuarterEnd('Quarter complete.'));
  await expect(page.locator('#ov-quarter-scorebug')).toContainText('TEXAS');
  await page.evaluate(() => showHalftime('Half complete.'));
  await expect(page.locator('#ov-halftime-scorebug')).toContainText('TEXAS');
  await page.evaluate(() => showGameOver());
  await expect(page.locator('#ov-end-score')).toHaveAttribute('aria-label', /^Texas \d+, NC State \d+$/);
  await expect(page.locator('#ov-end-sub')).toContainText('Texas vs NC State');
  const publicText = await page.evaluate(() => [
    render_game_to_text(),
    document.getElementById('scorebug').textContent,
    document.getElementById('field-stage').textContent,
    document.getElementById('ui-desk').textContent,
    document.getElementById('ov-end').textContent,
  ].join('\n'));
  expect(publicText).not.toMatch(/\bDUKE\b|\bDuke\b/);
  await page.evaluate(() => restart());
  await expect(page.locator('input[name="player-team"][value="texas"]')).toBeChecked();
  expect(await page.evaluate(() => state.match.player.id)).toBe('texas');
});

test('invalid team queries render the Duke picker and suppress boot modes', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const query of ['?team=clemson', '?team=', '?boot=offense-call&team=Duke', '?boot=defense-call&rival=wake-forest&team=unc']) {
    await page.goto(`/football/${query}`);
    expect(await page.evaluate(() => ({
      phase: state.phase,
      initialized: sessionInitialized,
      checked: document.querySelector('input[name="player-team"]:checked')?.value,
      selected: window.__footballTest.selectedPlayerTeamId(),
      match: state.match.player.id,
      rival: state.match.opponent.id,
    }))).toEqual({ phase: 'start', initialized: false, checked: 'duke', selected: 'duke', match: 'duke', rival: 'unc' });
  }
  await page.goto('/football/?team=georgia-tech');
  expect(await page.evaluate(() => ({
    checked: document.querySelector('input[name="player-team"]:checked')?.value,
    preview: document.getElementById('rival-preview-matchup').textContent,
  }))).toEqual({ checked: 'georgia-tech', preview: 'GA TECH VS UNC' });
  expect(pageErrors).toEqual([]);
});

test('the same seed plays identical football and questions for every team', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  // Only the team changes between runs; IDs are excluded and only numeric or
  // boolean proposal facts are compared, because team labels may differ.
  const runs = {};
  for (const teamId of PLAYER_TEAMS) {
    await page.goto(`/football/?boot=defense-call&rival=nc-state&team=${teamId}`);
    const planned = await page.evaluate(() => {
      window.__teamDraws = { football: 0, scheduler: 0, presentation: 0 };
      const stream = (name, seed) => {
        let value = seed >>> 0;
        return () => {
          window.__teamDraws[name]++;
          value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
          return value / 0x100000000;
        };
      };
      window.__footballTest.setRngStreams({
        football: stream('football', 0x173a),
        scheduler: stream('scheduler', 0x173b),
        presentation: stream('presentation', 0x173c),
      });
      window.__footballTest.seedDriveState({
        possession: 'defense', direction: -1,
        quarter: 2, down: 2, yardsToGo: 8, yardLine: 70, firstDownLine: 62,
        driveStart: 80, scores: { player: 7, opponent: 7 },
        totalYards: { player: 31, opponent: 28 }, plays: 5, drivePlays: 1,
      });
      return {
        player: state.match.player.id,
        plan: window.__footballTest.opponentSnapshot(),
        drawsAfterPlan: { ...window.__teamDraws },
      };
    });
    await page.locator('#call-grid .call-btn').first().click();
    const snapped = await page.evaluate(() => {
      const contracts = window.__footballTest.activeContracts();
      const proposal = contracts.activeSnap?.proposal || {};
      return {
        phase: contracts.render.mode,
        familyId: contracts.questionInstance?.familyId || null,
        evidenceClass: contracts.questionInstance?.evidenceClass || null,
        choiceCount: contracts.questionInstance?.choices?.length || 0,
        proposalFacts: Object.fromEntries(Object.entries(proposal)
          .filter(([, value]) => value === null || ['number', 'boolean'].includes(typeof value))),
        matchup: contracts.render.matchup,
        defenseCall: contracts.render.defenseCall,
        gain: contracts.render.gain,
        draws: { ...window.__teamDraws },
      };
    });
    runs[teamId] = { ...planned, ...snapped };
  }
  for (const teamId of PLAYER_TEAMS) expect(runs[teamId].player).toBe(teamId);
  const comparable = ({ player, ...facts }) => facts;
  for (const teamId of PLAYER_TEAMS.slice(1)) {
    expect(comparable(runs[teamId]), `${teamId} matches Duke`).toEqual(comparable(runs.duke));
  }
  expect(runs.duke.phase).toBe('question');
  expect(runs.duke.familyId).toEqual(expect.any(String));
  expect(Object.keys(runs.duke.proposalFacts).length).toBeGreaterThan(0);
  expect(runs.duke.drawsAfterPlan.football).toBe(1);
  expect(runs.duke.plan).toMatchObject({ opponentId: 'nc-state', profileKey: 'powerRun' });
});

test('domain rejects cross-rival and cross-profile private snapshots in the browser realm', async ({ page }, testInfo) => {
  primaryOnly(testInfo);
  await page.goto('/football/');
  const result = await page.evaluate(() => {
    const match = FOOTBALL_OPPONENT.createMatch('wake-forest');
    const base = {
      contextId: 'cross-rival-browser', match, possession: 'defense', direction: -1,
      quarter: 1, down: 1, yardsToGo: 10, yardLine: 80, firstDownLine: 70,
      driveStart: 80, scores: { player: 0, opponent: 0 }, totalYards: { player: 0, opponent: 0 },
      plays: 0, drivePlays: 0, calls: { offense: 'shortPass', defense: 'run', matchup: 'mismatch' },
    };
    const snapshot = FOOTBALL_OPPONENT.planSnap(base, 'quickPass', () => 0.25, 'wake-forest');
    const wrongRival = FOOTBALL_DOMAIN.validateContext({
      ...base, privateOpponentSnapshot: { ...snapshot, opponentId: 'private-rival-secret' },
    });
    const wrongProfile = FOOTBALL_DOMAIN.validateContext({
      ...base, privateOpponentSnapshot: { ...snapshot, profileKey: 'powerRun' },
    });
    const wrongCall = FOOTBALL_DOMAIN.validateContext({
      ...base, privateOpponentSnapshot: { ...snapshot, plannedCallKey: 'private-call-secret' },
    });
    return { wrongRival, wrongProfile, wrongCall };
  });
  expect(result.wrongRival.diagnostics.some(item => item.code === 'MISMATCHED_PRIVATE_OPPONENT_ID')).toBe(true);
  expect(result.wrongProfile.ok).toBe(false);
  expect(result.wrongProfile.diagnostics.some(item => item.code === 'MISMATCHED_PRIVATE_OPPONENT_PROFILE')).toBe(true);
  expect(result.wrongCall.diagnostics.some(item => item.code === 'MISMATCHED_PRIVATE_OPPONENT_CALL')).toBe(true);
  const diagnostics = JSON.stringify(result);
  expect(diagnostics).not.toContain('private-rival-secret');
  expect(diagnostics).not.toContain('powerRun');
  expect(diagnostics).not.toContain('private-call-secret');
});
