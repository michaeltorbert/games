import { test, expect } from '@playwright/test';

test('copy tables cover their exact runtime key domains', async ({ page }) => {
  await page.goto('/football/');
  const contract = await page.evaluate(() => {
    const sorted = values => [...values].sort();
    const offenseKeys = sorted(Object.keys(OFFENSE_CALLS));
    const opponentKeys = sorted(OPPONENT_CALL_WEIGHTS.map(entry => entry.key));
    const tableKeys = table => sorted(Object.keys(table));
    const validMessageTable = table => Object.values(table).every(messages =>
      Array.isArray(messages) && messages.length > 0 && messages.every(message => typeof message === 'string' && message.length > 0)
    );
    return {
      offenseKeys,
      opponentKeys,
      offenseMissKeys: tableKeys(PLAY_OUTCOME_COPY.offenseMiss),
      defenseStopKeys: tableKeys(PLAY_OUTCOME_COPY.defenseStop),
      defenseGainKeys: tableKeys(PLAY_OUTCOME_COPY.defenseGain),
      validOffenseMiss: validMessageTable(PLAY_OUTCOME_COPY.offenseMiss),
      validDefenseStop: validMessageTable(PLAY_OUTCOME_COPY.defenseStop),
      validDefenseGain: validMessageTable(PLAY_OUTCOME_COPY.defenseGain),
      validPossessionCopy: ['offense', 'defense'].every(key =>
        typeof POSSESSION_COPY.ribbon[key] === 'string' && typeof POSSESSION_COPY.stage[key] === 'string'
      ),
      validDeskHeaders: Object.values(DESK_HEADER_COPY).every(entry =>
        ['chip', 'kicker', 'action'].every(key => typeof entry[key] === 'string' && entry[key].length > 0)
      ),
    };
  });

  expect(contract.offenseMissKeys).toEqual(contract.offenseKeys);
  expect(contract.defenseStopKeys).toEqual(contract.opponentKeys);
  expect(contract.defenseGainKeys).toEqual(contract.opponentKeys);
  expect(contract.validOffenseMiss).toBe(true);
  expect(contract.validDefenseStop).toBe(true);
  expect(contract.validDefenseGain).toBe(true);
  expect(contract.validPossessionCopy).toBe(true);
  expect(contract.validDeskHeaders).toBe(true);
});

test('football runtime assets share one release version', async ({ page }) => {
  await page.goto('/football/');
  const versions = await page.evaluate(() => {
    const queryVersion = value => new URL(value, location.href).searchParams.get('v');
    return {
      game: GAME_VERSION,
      css: queryVersion(document.querySelector('link[href*="football.css"]').href),
      copy: queryVersion(document.querySelector('script[src*="copy.js"]').src),
      js: queryVersion(document.querySelector('script[src*="football.js"]').src),
    };
  });
  expect(new Set(Object.values(versions)).size).toBe(1);
});
