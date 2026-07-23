// Play-by-play copy for Football Math. Plain globals (no modules); loaded
// before football.js so these tables are ready when the game reads them.

const FOOTBALL_FIELD_POSITION = (() => {
  'use strict';

  const MATCH_KEYS = Object.freeze(['schemaVersion', 'player', 'opponent']);
  const TEAM_KEYS = Object.freeze(['id', 'displayName', 'shortName', 'endZoneName']);
  const OWNER_ROLES = Object.freeze(['player', 'opponent']);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, keys) {
    return isRecord(value)
      && Object.keys(value).length === keys.length
      && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function validateTeam(team, role) {
    if (!exactKeys(team, TEAM_KEYS)) {
      throw new TypeError(`Public match ${role} must contain exactly ${TEAM_KEYS.join(', ')}.`);
    }
    TEAM_KEYS.forEach((key) => {
      if (typeof team[key] !== 'string' || team[key].trim() !== team[key] || team[key].length === 0) {
        throw new TypeError(`Public match ${role}.${key} must be a non-empty trimmed string.`);
      }
    });
  }

  function validateMatch(match) {
    if (!exactKeys(match, MATCH_KEYS) || match.schemaVersion !== 1) {
      throw new TypeError(`Public match must be the complete schema-version-1 ${MATCH_KEYS.join(', ')} record.`);
    }
    validateTeam(match.player, 'player');
    validateTeam(match.opponent, 'opponent');
    if (match.player.id === match.opponent.id) {
      throw new TypeError('Public match teams must have distinct identities.');
    }
  }

  function validateAbsoluteYard(absoluteYard) {
    if (!Number.isInteger(absoluteYard)) {
      throw new TypeError('absoluteYard must be an integer from 0 through 100.');
    }
    if (absoluteYard < 0 || absoluteYard > 100) {
      throw new RangeError('absoluteYard must be from 0 through 100.');
    }
  }

  function validateOwnerRole(ownerRole) {
    if (!OWNER_ROLES.includes(ownerRole)) {
      throw new TypeError('ownerRole must be player or opponent.');
    }
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }

  function facts(absoluteYard, match) {
    validateAbsoluteYard(absoluteYard);
    validateMatch(match);

    const isMidfield = absoluteYard === 50;
    const isGoalLine = absoluteYard === 0 || absoluteYard === 100;
    const territoryRole = isMidfield ? null : absoluteYard < 50 ? 'player' : 'opponent';
    const yardNumber = isMidfield ? 50 : absoluteYard <= 50 ? absoluteYard : 100 - absoluteYard;
    const territory = territoryRole ? match[territoryRole] : null;
    const compact = isMidfield
      ? '50'
      : isGoalLine
        ? `${territory.shortName} GOAL LINE`
        : `${territory.shortName} ${yardNumber}`;
    const full = isMidfield
      ? 'the 50-yard line'
      : isGoalLine
        ? `${territory.displayName}'s goal line`
        : `${territory.displayName}'s ${yardNumber}-yard line`;

    return deepFreeze({
      absoluteYard,
      territoryRole,
      yardNumber,
      isMidfield,
      isGoalLine,
      compact,
      full,
      midfield: 'the 50-yard line',
      namedGoalLine: isGoalLine ? `${territory.endZoneName} goal line` : null,
      namedEndZone: isGoalLine ? `${territory.endZoneName} end zone` : null,
    });
  }

  function ownerAwareFromFacts(position, match, ownerRole) {
    validateOwnerRole(ownerRole);
    if (position.isMidfield) return position.full;
    if (position.isGoalLine) return position.namedGoalLine;
    const territoryLabel = position.territoryRole === 'player'
      ? match.player.displayName
      : match.opponent.shortName;
    if (position.territoryRole === ownerRole) {
      return `${territoryLabel}'s own ${position.yardNumber}-yard line`;
    }
    return `${territoryLabel}'s ${position.yardNumber}-yard line`;
  }

  function describe(absoluteYard, match, ownerRole = null) {
    const position = facts(absoluteYard, match);
    if (ownerRole === null) return position;
    const ownerAware = ownerAwareFromFacts(position, match, ownerRole);
    return deepFreeze({
      ...position,
      ownerRole,
      ownerAware,
      ball: `${match[ownerRole].displayName} ball at ${ownerAware}`,
    });
  }

  function ownerAware(absoluteYard, match, ownerRole) {
    return describe(absoluteYard, match, ownerRole).ownerAware;
  }

  function ball(absoluteYard, match, ownerRole) {
    return describe(absoluteYard, match, ownerRole).ball;
  }

  return Object.freeze({ facts, describe, ownerAware, ball });
})();

if (typeof globalThis !== 'undefined') {
  globalThis.FOOTBALL_FIELD_POSITION = FOOTBALL_FIELD_POSITION;
}

const PLAY_OUTCOME_COPY = {
  secondMiss: {
    stuff: 'The defense stuffs the run behind the line.',
    incompletion: 'The short pass falls incomplete.',
    sack: 'The rush gets home for a sack.',
    fumble: 'The runner loses the ball, and the defense recovers.',
    interception: 'The deep pass is intercepted.',
  },
  offenseMiss: {
    shortRun: [
      'Your run was stuffed at the line.',
      'The defense filled the gap. No gain.',
      'A linebacker wrapped up the runner.',
      'The pile went nowhere.',
    ],
    shortPass: [
      'The short pass was batted down.',
      'The receiver slipped, incomplete.',
      'The defender jumped the route.',
      'The pass fell incomplete.',
    ],
    longRun: [
      'The edge was sealed off. No gain.',
      'The defense strung out the run.',
      'The runner got bottled up.',
      'The cutback lane closed fast.',
    ],
    mediumPass: [
      'The pass was broken up.',
      'The quarterback had to throw it away.',
      'The coverage was too tight.',
      'The ball skipped incomplete.',
    ],
    longPass: [
      'The deep ball sailed incomplete.',
      'The safety knocked it away.',
      'The receiver was double covered.',
      'The pass was just out of reach.',
    ],
  },
  defenseStop: {
    shortRun: [
      'You stuffed the run at the line.',
      'Your defense filled the gap.',
      'Big tackle. No gain.',
    ],
    shortPass: [
      'You batted down the short pass.',
      'Great coverage on the quick throw.',
      'The receiver was covered. Incomplete.',
    ],
    longRun: [
      'You sealed the edge and stopped the run.',
      'Your defense chased it down.',
      'The runner had nowhere to go.',
    ],
    mediumPass: [
      'You broke up the pass over the middle.',
      'Tight coverage forced an incompletion.',
      'Your defender got a hand on it.',
    ],
    longPass: [
      'You knocked away the deep ball.',
      'Great safety help over the top.',
      'The deep pass fell incomplete.',
    ],
  },
  defenseGain: {
    shortRun: [
      'The opponent found a small crease.',
      'The runner squeezed through the line.',
      'The opponent powered forward.',
    ],
    shortPass: [
      'The opponent completed the quick pass.',
      'The receiver found space underneath.',
      'The short throw was complete.',
    ],
    longRun: [
      'The runner bounced outside.',
      'The opponent broke through the edge.',
      'The run hit a big lane.',
    ],
    mediumPass: [
      'The opponent hit the middle route.',
      'The pass found a window in coverage.',
      'The receiver caught it over the middle.',
    ],
    longPass: [
      'The opponent connected deep.',
      'The receiver got behind the defense.',
      'The deep throw was complete.',
    ],
  },
};

const POSSESSION_COPY = {
  ribbon: {
    offense: 'DUKE BALL - OFFENSE',
    defense: 'UNC BALL - DEFENSE',
  },
  stage: {
    offense: 'Duke on offense',
    defense: 'UNC on offense',
  },
};

const DESK_HEADER_COPY = {
  start: { chip: 'Kickoff', kicker: 'Start the rivalry.', action: 'Start the broadcast when you are ready.' },
  callOffense: { chip: 'Next Snap', kicker: 'Set the Duke offense.', action: 'Choose a play card.' },
  callDefense: { chip: 'Next Snap', kicker: 'Set the Duke defense.', action: 'Choose a defense card.' },
  conversionOffense: { chip: 'Try', kicker: 'Choose the conversion.', action: 'Kick for one or go for two.' },
  conversionDefense: { chip: 'Try', kicker: 'Defend the conversion.', action: 'Watch the announced try, then answer.' },
  questionOffense: { chip: 'Live Math', kicker: 'Run the play.', action: 'Answer the question.' },
  questionDefense: { chip: 'Live Math', kicker: 'Beat the snap.', action: 'Answer the question.' },
  fieldReadingOffense: { chip: 'Field Reading', kicker: 'Read the game graphic.', action: 'Choose the matching answer.' },
  fieldReadingDefense: { chip: 'Field Reading', kicker: 'Read the game graphic.', action: 'Choose the matching answer.' },
  specialQuestionOffense: { chip: 'Special Teams', kicker: 'Run the special-teams play.', action: 'Answer the question.' },
  specialQuestionDefense: { chip: 'Special Teams', kicker: 'Defend the special-teams play.', action: 'Answer the question.' },
  specialFieldReadingOffense: { chip: 'Field Reading', kicker: 'Read the special-teams graphic.', action: 'Choose the matching answer.' },
  specialFieldReadingDefense: { chip: 'Field Reading', kicker: 'Read the special-teams graphic.', action: 'Choose the matching answer.' },
  retryOffense: { chip: 'Coach Hint', kicker: 'Same play. Try again.', action: 'Use the model and choose again.' },
  retryDefense: { chip: 'Coach Hint', kicker: 'Same snap. Try again.', action: 'Use the model and choose again.' },
  specialRetryOffense: { chip: 'Coach Hint', kicker: 'Same special play. Try again.', action: 'Use the model and choose again.' },
  specialRetryDefense: { chip: 'Coach Hint', kicker: 'Same special play. Try again.', action: 'Use the model and choose again.' },
  explainOffense: { chip: 'Film Room', kicker: 'See how it works.', action: 'Review, then continue.' },
  explainDefense: { chip: 'Film Room', kicker: 'See how it works.', action: 'Review, then continue.' },
  specialExplainOffense: { chip: 'Film Room', kicker: 'Review the special-teams play.', action: 'Review, then continue.' },
  specialExplainDefense: { chip: 'Film Room', kicker: 'Review the special-teams play.', action: 'Review, then continue.' },
  resultOffense: { chip: 'Result', kicker: 'Play outcome.', action: 'Watch the result.' },
  resultDefense: { chip: 'Result', kicker: 'Defensive result.', action: 'Watch the result.' },
  specialResultOffense: { chip: 'Result', kicker: 'Special-teams outcome.', action: 'Read the result.' },
  specialResultDefense: { chip: 'Result', kicker: 'Special-teams outcome.', action: 'Read the result.' },
};
