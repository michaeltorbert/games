import { test, expect } from '@playwright/test';

function primaryOnly(testInfo) {
  test.skip(testInfo.project.name !== 'ipad-11-landscape', 'Rival engine contracts run once on the primary target.');
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
