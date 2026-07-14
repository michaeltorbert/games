const FOOTBALL_OPPONENT = (() => {
  'use strict';

  const CALL_KEYS = Object.freeze([
    'shortRun',
    'shortPass',
    'longRun',
    'mediumPass',
    'longPass',
  ]);

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  // Profiles own both their neutral call mix and every situational adjustment.
  // Adding a new opponent personality should not require changing the engine.
  const PROFILES = freeze({
    balanced: {
      key: 'balanced',
      label: 'Balanced',
      baseWeights: {
        shortRun: 1,
        shortPass: 1,
        longRun: 2,
        mediumPass: 3,
        longPass: 3,
      },
      modifiers: {
        down1: { shortRun: 1.25, longRun: 1.15, longPass: 0.9 },
        down2: { shortRun: 1.08, shortPass: 1.08 },
        down3: { shortPass: 1.15, mediumPass: 1.15, longPass: 1.12 },
        down4: { shortRun: 0.75, longRun: 0.8, mediumPass: 1.25, longPass: 1.3 },

        shortDistance: { shortRun: 1.45, shortPass: 1.3, longRun: 1.15, longPass: 0.65 },
        mediumDistance: { shortPass: 1.15, longRun: 1.1, mediumPass: 1.12 },
        longDistance: { shortRun: 0.55, shortPass: 0.8, longRun: 0.75, mediumPass: 1.3, longPass: 1.65 },

        backedUp: { shortRun: 1.28, shortPass: 1.18, longPass: 0.75 },
        ownTerritory: { shortRun: 1.08, longRun: 1.08 },
        plusTerritory: { longRun: 1.08, mediumPass: 1.1, longPass: 1.08 },
        redZone: { shortRun: 1.35, shortPass: 1.25, longRun: 1.15, mediumPass: 1.15, longPass: 0.45 },
        goalToGo: { shortRun: 1.55, shortPass: 1.3, longRun: 1.15, mediumPass: 0.9, longPass: 0.3 },

        quarter1: { shortRun: 1.08, longRun: 1.05 },
        quarter2: { shortPass: 1.04, mediumPass: 1.05 },
        quarter3: { shortRun: 1.05, longRun: 1.05 },
        quarter4: { mediumPass: 1.08, longPass: 1.08 },

        trailingBig: { shortRun: 0.72, longRun: 0.8, mediumPass: 1.25, longPass: 1.45 },
        trailing: { shortRun: 0.86, longRun: 0.92, mediumPass: 1.13, longPass: 1.2 },
        tied: { shortRun: 1.04, longRun: 1.04 },
        leading: { shortRun: 1.2, shortPass: 1.05, longRun: 1.16, longPass: 0.82 },
        leadingBig: { shortRun: 1.4, shortPass: 1.08, longRun: 1.28, mediumPass: 0.82, longPass: 0.62 },

        earlyQuarter: { shortRun: 1.05, longRun: 1.04 },
        lateQuarter: { shortPass: 1.05, mediumPass: 1.06, longPass: 1.06 },
        lateGameCatchUp: { shortRun: 0.5, shortPass: 0.78, longRun: 0.65, mediumPass: 1.35, longPass: 1.8 },
        lateGameProtectLead: { shortRun: 1.55, shortPass: 1.12, longRun: 1.4, mediumPass: 0.75, longPass: 0.48 },
        lateGameTied: { shortRun: 1.1, shortPass: 1.08, mediumPass: 1.12, longPass: 1.08 },
      },
    },
  });

  function finiteNumber(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resolveProfile(profileKeyOrProfile) {
    if (!profileKeyOrProfile) return PROFILES.balanced;
    if (typeof profileKeyOrProfile === 'string') {
      const profile = PROFILES[profileKeyOrProfile];
      if (!profile) throw new RangeError(`Unknown opponent profile: ${profileKeyOrProfile}`);
      return profile;
    }
    if (typeof profileKeyOrProfile !== 'object') {
      throw new TypeError('Opponent profile must be a profile key or object');
    }
    return profileKeyOrProfile;
  }

  function distanceFactor(distance) {
    if (distance <= 3) return 'shortDistance';
    if (distance >= 8) return 'longDistance';
    return 'mediumDistance';
  }

  function zoneFactor(yardsToGoal) {
    if (yardsToGoal <= 10) return 'goalToGo';
    if (yardsToGoal <= 20) return 'redZone';
    if (yardsToGoal <= 50) return 'plusTerritory';
    if (yardsToGoal >= 80) return 'backedUp';
    return 'ownTerritory';
  }

  function marginFactor(scoreMargin) {
    if (scoreMargin <= -8) return 'trailingBig';
    if (scoreMargin < 0) return 'trailing';
    if (scoreMargin === 0) return 'tied';
    if (scoreMargin >= 8) return 'leadingBig';
    return 'leading';
  }

  function normalize(rawWeights) {
    const positive = {};
    let total = 0;
    for (const key of CALL_KEYS) {
      const value = finiteNumber(rawWeights[key], 0);
      if (!(value > 0)) throw new RangeError(`Opponent weight for ${key} must be positive`);
      positive[key] = value;
      total += value;
    }
    if (!(total > 0)) throw new RangeError('Opponent weights must have a positive total');
    return Object.fromEntries(CALL_KEYS.map((key) => [key, positive[key] / total]));
  }

  function getTendency(gameState = {}, profileKeyOrProfile = 'balanced') {
    const profile = resolveProfile(profileKeyOrProfile);
    const direction = finiteNumber(gameState.direction, -1) >= 0 ? 1 : -1;
    const absoluteYard = clamp(finiteNumber(gameState.yd ?? gameState.absoluteYard, 50), 0, 100);
    const yardsToGoal = direction === 1 ? 100 - absoluteYard : absoluteYard;
    const down = clamp(Math.round(finiteNumber(gameState.down, 1)), 1, 4);
    const distance = Math.max(1, finiteNumber(gameState.ytg ?? gameState.distance, 10));
    const quarter = clamp(Math.round(finiteNumber(gameState.quarter, 1)), 1, 4);
    const playerScore = finiteNumber(gameState.playerScore ?? gameState.score?.player, 0);
    const opponentScore = finiteNumber(gameState.opponentScore ?? gameState.score?.opponent, 0);
    const scoreMargin = opponentScore - playerScore;
    const possessionsPerQuarter = Math.max(1, Math.round(finiteNumber(gameState.possessionsPerQuarter, 4)));
    const quarterPossessions = clamp(
      Math.round(finiteNumber(gameState.quarterPossessions, 0)),
      0,
      possessionsPerQuarter,
    );
    const quarterProgress = quarterPossessions / possessionsPerQuarter;
    const lateGameBoundary = quarter === 4 && quarterPossessions >= possessionsPerQuarter - 1;
    const lateGameFactor = !lateGameBoundary
      ? null
      : scoreMargin < 0
        ? 'lateGameCatchUp'
        : scoreMargin > 0
          ? 'lateGameProtectLead'
          : 'lateGameTied';
    const factorKeys = [
      `down${down}`,
      distanceFactor(distance),
      zoneFactor(yardsToGoal),
      `quarter${quarter}`,
      marginFactor(scoreMargin),
      quarterProgress >= 0.5 ? 'lateQuarter' : 'earlyQuarter',
      ...(lateGameFactor ? [lateGameFactor] : []),
    ];

    const rawWeights = {};
    for (const key of CALL_KEYS) {
      const base = finiteNumber(profile.baseWeights?.[key], 0);
      if (!(base > 0)) throw new RangeError(`Opponent base weight for ${key} must be positive`);
      rawWeights[key] = factorKeys.reduce((weight, factorKey) => {
        const multiplier = finiteNumber(profile.modifiers?.[factorKey]?.[key], 1);
        if (!(multiplier > 0)) throw new RangeError(`Opponent modifier ${factorKey}.${key} must be positive`);
        return weight * multiplier;
      }, base);
    }

    return {
      profileKey: profile.key || 'custom',
      context: {
        down,
        distance,
        direction,
        absoluteYard,
        yardsToGoal,
        fieldZone: zoneFactor(yardsToGoal),
        quarter,
        opponentScoreMargin: scoreMargin,
        quarterPossessions,
        possessionsPerQuarter,
        quarterProgress,
        lateGameBoundary,
      },
      factors: factorKeys.map((key) => ({
        key,
        multipliers: Object.fromEntries(CALL_KEYS.map((callKey) => [
          callKey,
          finiteNumber(profile.modifiers?.[key]?.[callKey], 1),
        ])),
      })),
      rawWeights,
      weights: normalize(rawWeights),
    };
  }

  function pickCall(weights, rng = Math.random) {
    if (typeof rng !== 'function') throw new TypeError('pickCall expects an RNG function');
    const normalized = normalize(weights);
    const roll = clamp(finiteNumber(rng(), 0), 0, 1);
    let cumulative = 0;
    for (const key of CALL_KEYS) {
      cumulative += normalized[key];
      if (roll < cumulative) return key;
    }
    return CALL_KEYS[CALL_KEYS.length - 1];
  }

  return freeze({ CALL_KEYS, PROFILES, getTendency, pickCall });
})();
