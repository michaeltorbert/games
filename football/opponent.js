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

  // Profiles own behavior only. Rival names, copy, and presentation live in
  // the separately validated identity catalog below.
  const BALANCED_PROFILE = {
      key: 'balanced',
      label: 'Balanced',
      looks: {
        tight: {
          key: 'tight',
          label: 'Tight set',
          alignment: 'Under center',
          leanKeys: ['run'],
        },
        balanced: {
          key: 'balanced',
          label: 'Balanced set',
          alignment: 'Singleback',
          leanKeys: ['balanced'],
        },
        spread: {
          key: 'spread',
          label: 'Spread set',
          alignment: 'Shotgun trips',
          leanKeys: ['pass'],
        },
      },
      lean: {
        runCallKeys: ['shortRun', 'longRun'],
        passCallKeys: ['shortPass', 'mediumPass', 'longPass'],
        threshold: 0.12,
        labels: {
          run: 'Leans run',
          pass: 'Leans pass',
          balanced: 'Run or pass',
        },
      },
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
  };

  const PROFILES = freeze({
    // Keep this exact profile numerically compatible with the original UNC
    // opponent. Its call order, weights, modifiers, looks, and single draw are
    // the baseline contract for seeded games.
    balanced: BALANCED_PROFILE,
    powerRun: {
      key: 'powerRun',
      label: 'Power Run',
      looks: BALANCED_PROFILE.looks,
      lean: BALANCED_PROFILE.lean,
      baseWeights: {
        shortRun: 5.5,
        shortPass: 1.5,
        longRun: 5.5,
        mediumPass: 1.5,
        longPass: 1.1,
      },
      modifiers: BALANCED_PROFILE.modifiers,
    },
    quickPass: {
      key: 'quickPass',
      label: 'Quick Pass',
      looks: BALANCED_PROFILE.looks,
      lean: BALANCED_PROFILE.lean,
      baseWeights: {
        shortRun: 1.1,
        shortPass: 4.4,
        longRun: 1.1,
        mediumPass: 4,
        longPass: 3.8,
      },
      modifiers: BALANCED_PROFILE.modifiers,
    },
  });

  const PLAYER_IDENTITY = freeze({
    id: 'duke',
    displayName: 'Duke',
    shortName: 'DUKE',
    endZoneName: 'DUKE',
  });

  const RIVAL_ORDER = Object.freeze(['unc', 'nc-state', 'wake-forest']);
  const DEFAULT_RIVAL_ID = 'unc';
  const RIVALS = freeze({
    unc: {
      id: 'unc',
      displayName: 'North Carolina',
      shortName: 'UNC',
      endZoneName: 'CAROLINA',
      styleBlurb: 'Balanced attack · ready for any down',
      profileKey: 'balanced',
      rivalryLabel: 'Tobacco Road',
      presentation: {
        token: 'unc',
        accent: '#7bafd4',
        accentDark: '#4e7ba2',
        accentInk: '#0c2950',
        accentSoft: '#d9efff',
        scorebugTop: '#83b6d8',
        scorebugBottom: '#547fa5',
        fireworks: ['#ff8c3c', '#ff4d3d', '#ffd337', '#ffffff'],
      },
    },
    'nc-state': {
      id: 'nc-state',
      displayName: 'NC State',
      shortName: 'NC STATE',
      endZoneName: 'NC STATE',
      styleBlurb: 'Power run · downhill and physical',
      profileKey: 'powerRun',
      rivalryLabel: 'Triangle Showdown',
      presentation: {
        token: 'nc-state',
        accent: '#cc0000',
        accentDark: '#7f1010',
        accentInk: '#ffffff',
        accentSoft: '#ffe0e0',
        scorebugTop: '#d71920',
        scorebugBottom: '#8f1015',
        fireworks: ['#cc0000', '#ffffff', '#7f1010', '#ffd337'],
      },
    },
    'wake-forest': {
      id: 'wake-forest',
      displayName: 'Wake Forest',
      shortName: 'WAKE FOREST',
      endZoneName: 'WAKE',
      styleBlurb: 'Quick spread · fast throws in space',
      profileKey: 'quickPass',
      rivalryLabel: 'Piedmont Matchup',
      presentation: {
        token: 'wake-forest',
        accent: '#9e7e38',
        accentDark: '#3b3020',
        accentInk: '#07152f',
        accentSoft: '#f4e4b5',
        scorebugTop: '#80652e',
        scorebugBottom: '#5d4a27',
        fireworks: ['#9e7e38', '#ffffff', '#3b3020', '#ffd337'],
      },
    },
  });

  function assertBoundedString(value, label, min, max) {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
      throw new TypeError(`${label} must be a string from ${min} through ${max} characters`);
    }
  }

  function validateProfile(profileKey, profile) {
    if (!profile || profile.key !== profileKey) throw new TypeError(`Opponent profile ${profileKey} has an invalid key`);
    const weightKeys = Object.keys(profile.baseWeights || {});
    if (weightKeys.length !== CALL_KEYS.length || CALL_KEYS.some(key => !weightKeys.includes(key))) {
      throw new TypeError(`Opponent profile ${profileKey} must define exactly the five offense call weights`);
    }
    for (const key of CALL_KEYS) {
      if (!(Number.isFinite(profile.baseWeights[key]) && profile.baseWeights[key] > 0)) {
        throw new RangeError(`Opponent profile ${profileKey} has a non-positive ${key} weight`);
      }
    }
    for (const [factorKey, multipliers] of Object.entries(profile.modifiers || {})) {
      for (const [callKey, multiplier] of Object.entries(multipliers || {})) {
        if (!CALL_KEYS.includes(callKey) || !(Number.isFinite(multiplier) && multiplier > 0)) {
          throw new RangeError(`Opponent modifier ${profileKey}.${factorKey}.${callKey} must be positive`);
        }
      }
    }
    const coveredLeans = new Set(Object.values(profile.looks || {}).flatMap(look => look.leanKeys || []));
    for (const leanKey of ['run', 'balanced', 'pass']) {
      if (!coveredLeans.has(leanKey)) throw new TypeError(`Opponent profile ${profileKey} has no ${leanKey} look`);
    }
  }

  function validateCatalog() {
    if (RIVAL_ORDER.length !== 3 || new Set(RIVAL_ORDER).size !== 3 || !RIVAL_ORDER.includes(DEFAULT_RIVAL_ID)) {
      throw new TypeError('Rival order must contain exactly three unique identities including the default');
    }
    for (const [profileKey, profile] of Object.entries(PROFILES)) validateProfile(profileKey, profile);
    if (Object.keys(RIVALS).length !== RIVAL_ORDER.length) throw new TypeError('Rival catalog and order differ');
    const hexColor = /^#[0-9a-f]{6}$/i;
    for (const rivalId of RIVAL_ORDER) {
      const rival = RIVALS[rivalId];
      if (!rival || rival.id !== rivalId) throw new TypeError(`Rival ${rivalId} has an invalid identity`);
      assertBoundedString(rival.displayName, `${rivalId} displayName`, 1, 24);
      assertBoundedString(rival.shortName, `${rivalId} shortName`, 1, 12);
      assertBoundedString(rival.endZoneName, `${rivalId} endZoneName`, 1, 12);
      assertBoundedString(rival.styleBlurb, `${rivalId} styleBlurb`, 1, 64);
      assertBoundedString(rival.rivalryLabel, `${rivalId} rivalryLabel`, 1, 24);
      if (!PROFILES[rival.profileKey]) throw new RangeError(`Rival ${rivalId} references an unknown profile`);
      if (rival.presentation?.token !== rivalId) throw new TypeError(`Rival ${rivalId} has an invalid presentation token`);
      for (const colorKey of ['accent', 'accentDark', 'accentInk', 'accentSoft', 'scorebugTop', 'scorebugBottom']) {
        if (!hexColor.test(rival.presentation[colorKey])) throw new TypeError(`Rival ${rivalId} has an invalid ${colorKey}`);
      }
      if (!Array.isArray(rival.presentation.fireworks)
        || rival.presentation.fireworks.length !== 4
        || rival.presentation.fireworks.some(color => !hexColor.test(color))) {
        throw new TypeError(`Rival ${rivalId} must define four firework colors`);
      }
    }
  }

  validateCatalog();

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

  function resolveRival(rivalId) {
    if (typeof rivalId !== 'string' || !Object.prototype.hasOwnProperty.call(RIVALS, rivalId)) {
      throw new RangeError('Unknown rival ID');
    }
    return RIVALS[rivalId];
  }

  function listRivals() {
    return Object.freeze(RIVAL_ORDER.map(rivalId => RIVALS[rivalId]));
  }

  function createMatch(rivalId) {
    const resolvedId = arguments.length === 0 ? DEFAULT_RIVAL_ID : rivalId;
    const rival = resolveRival(resolvedId);
    return freeze({
      schemaVersion: 1,
      player: {
        id: PLAYER_IDENTITY.id,
        displayName: PLAYER_IDENTITY.displayName,
        shortName: PLAYER_IDENTITY.shortName,
        endZoneName: PLAYER_IDENTITY.endZoneName,
      },
      opponent: {
        id: rival.id,
        displayName: rival.displayName,
        shortName: rival.shortName,
        endZoneName: rival.endZoneName,
      },
    });
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

  function lookForLean(profile, leanKey) {
    const looks = Object.values(profile.looks || {});
    const look = looks.find(candidate => Array.isArray(candidate.leanKeys) && candidate.leanKeys.includes(leanKey));
    if (!look) throw new RangeError(`Opponent profile has no look for ${leanKey} lean`);
    return look;
  }

  function safeLeanLabel(value, key) {
    if (typeof value === 'string' && value.length) return value;
    if (key === 'run') return 'Leans run';
    if (key === 'pass') return 'Leans pass';
    return 'Run or pass';
  }

  function qualitativeLean(weights, profile) {
    const rules = profile.lean || {};
    const labels = rules.labels || {};
    const runCallKeys = Array.isArray(rules.runCallKeys) ? rules.runCallKeys : ['shortRun', 'longRun'];
    const passCallKeys = Array.isArray(rules.passCallKeys) ? rules.passCallKeys : ['shortPass', 'mediumPass', 'longPass'];
    const threshold = Math.max(0, finiteNumber(rules.threshold, 0.12));
    const totalFor = keys => keys.reduce((total, key) => total + finiteNumber(weights[key], 0), 0);
    const runWeight = totalFor(runCallKeys);
    const passWeight = totalFor(passCallKeys);
    const difference = passWeight - runWeight;
    const key = difference > threshold ? 'pass' : difference < -threshold ? 'run' : 'balanced';
    return {
      key,
      label: safeLeanLabel(labels[key], key),
      runWeight,
      passWeight,
    };
  }

  function planSnap(gameState = {}, profileKeyOrProfile = 'balanced', rng = Math.random, opponentId) {
    const profile = resolveProfile(profileKeyOrProfile);
    if (typeof opponentId !== 'string' || opponentId.trim() === '') {
      throw new TypeError('Opponent planning requires a public opponent ID');
    }
    const tendency = getTendency(gameState, profile);
    const lean = qualitativeLean(tendency.weights, profile);
    const plannedCallKey = pickCall(tendency.weights, rng);
    const look = lookForLean(profile, lean.key);
    return freeze({
      opponentId,
      profileKey: tendency.profileKey,
      look: {
        key: look.key,
        label: look.label,
        alignment: look.alignment,
        leanKeys: [...look.leanKeys],
      },
      lean,
      weights: { ...tendency.weights },
      plannedCallKey,
      tendency,
    });
  }

  return freeze({
    CALL_KEYS,
    PROFILES,
    RIVALS,
    RIVAL_ORDER,
    DEFAULT_RIVAL_ID,
    resolveRival,
    listRivals,
    createMatch,
    getTendency,
    pickCall,
    planSnap,
  });
})();
