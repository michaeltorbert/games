import { test, expect } from '@playwright/test';

test('copy tables cover their exact runtime key domains', async ({ page }) => {
  await page.goto('/football/');
  const contract = await page.evaluate(() => {
    const sorted = values => [...values].sort();
    const offenseKeys = sorted(Object.keys(OFFENSE_CALLS));
    const opponentKeys = sorted(FOOTBALL_OPPONENT.CALL_KEYS);
    const tableKeys = table => sorted(Object.keys(table));
    const validMessageTable = table => Object.values(table).every(messages =>
      Array.isArray(messages) && messages.length > 0 && messages.every(message => typeof message === 'string' && message.length > 0)
    );
    return {
      offenseKeys,
      opponentKeys,
      offenseMissKeys: tableKeys(PLAY_OUTCOME_COPY.offenseMiss),
      secondMissOutcomeKeys: tableKeys(SECOND_MISS_OUTCOMES),
      secondMissReasonKeys: sorted(new Set(Object.values(SECOND_MISS_OUTCOMES)
        .map(outcome => outcome.resultReason))),
      secondMissCopyKeys: tableKeys(PLAY_OUTCOME_COPY.secondMiss),
      defenseStopKeys: tableKeys(PLAY_OUTCOME_COPY.defenseStop),
      defenseGainKeys: tableKeys(PLAY_OUTCOME_COPY.defenseGain),
      validOffenseMiss: validMessageTable(PLAY_OUTCOME_COPY.offenseMiss),
      validDefenseStop: validMessageTable(PLAY_OUTCOME_COPY.defenseStop),
      validDefenseGain: validMessageTable(PLAY_OUTCOME_COPY.defenseGain),
      validPossessionCopy: ['offense', 'defense'].every(key =>
        typeof POSSESSION_COPY.ribbon[key] === 'string' && typeof POSSESSION_COPY.stage[key] === 'string'
      ),
      possessionCopy: JSON.parse(JSON.stringify(POSSESSION_COPY)),
      validDeskHeaders: Object.values(DESK_HEADER_COPY).every(entry =>
        ['chip', 'kicker', 'action'].every(key => typeof entry[key] === 'string' && entry[key].length > 0)
      ),
    };
  });

  expect(contract.offenseMissKeys).toEqual(contract.offenseKeys);
  expect(contract.secondMissOutcomeKeys).toEqual(contract.offenseKeys);
  expect(contract.secondMissReasonKeys).toEqual(contract.secondMissCopyKeys);
  expect(contract.defenseStopKeys).toEqual(contract.opponentKeys);
  expect(contract.defenseGainKeys).toEqual(contract.opponentKeys);
  expect(contract.validOffenseMiss).toBe(true);
  expect(contract.validDefenseStop).toBe(true);
  expect(contract.validDefenseGain).toBe(true);
  expect(contract.validPossessionCopy).toBe(true);
  expect(contract.possessionCopy).toEqual({
    ribbon: { offense: 'DUKE BALL - OFFENSE', defense: 'UNC BALL - DEFENSE' },
    stage: { offense: 'Duke on offense', defense: 'UNC on offense' },
  });
  expect(contract.validDeskHeaders).toBe(true);
});

test('football runtime assets share one release version', async ({ page }) => {
  await page.goto('/football/');
  const versions = await page.evaluate(async () => {
    const queryVersion = value => new URL(value, location.href).searchParams.get('v');
    const registrySource = await fetch('../games.js').then(response => response.text());
    const registryMatch = registrySource.match(/id:\s*'football'[\s\S]*?version:\s*'([^']+)'/);
    const manifest = await fetch('../version.json').then(response => response.json());
    return {
      game: GAME_VERSION,
      manifest: manifest.football,
      registry: registryMatch?.[1] || null,
      appleIcon: queryVersion(document.querySelector('link[rel="apple-touch-icon"]').href),
      favicon: queryVersion(document.querySelector('link[rel="icon"]').href),
      fonts: queryVersion(document.querySelector('link[href*="shared/fonts.css"]').href),
      reset: queryVersion(document.querySelector('link[href*="shared/reset.css"]').href),
      css: queryVersion(document.querySelector('link[href*="football.css"]').href),
      copy: queryVersion(document.querySelector('script[src*="copy.js"]').src),
      learning: queryVersion(document.querySelector('script[src*="learning.js"]').src),
      stats: queryVersion(document.querySelector('script[src*="stats.js"]').src),
      opponent: queryVersion(document.querySelector('script[src*="opponent.js"]').src),
      season: queryVersion(document.querySelector('script[src*="season.js"]').src),
      domain: queryVersion(document.querySelector('script[src*="football-domain.js"]').src),
      contextual: queryVersion(document.querySelector('script[src*="contextual-questions.js"]').src),
      js: queryVersion(document.querySelector('script[src*="football.js"]').src),
      updater: queryVersion(document.querySelector('script[src*="shared/updater.js"]').src),
    };
  });
  expect(new Set(Object.values(versions)).size).toBe(1);
});
