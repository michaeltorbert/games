// Truthful, curriculum-bounded Football question construction.
// Plain global, DOM-free, and deliberately independent from live game state.

const FOOTBALL_CONTEXTUAL_QUESTIONS = (() => {
  'use strict';

  const SCHEMA_VERSION = 3;
  const CURRENT_COMPLETED_PAGE = 145;
  const INCLUDED_THROUGH_PAGE = 179;
  const PLAY_TYPES = Object.freeze(['scrimmage', 'punt', 'fieldGoal', 'conversion']);
  const MATCH_KEYS = Object.freeze(['schemaVersion', 'player', 'opponent']);
  const TEAM_IDENTITY_KEYS = Object.freeze(['id', 'displayName', 'shortName', 'endZoneName']);

  const OPERATION_TYPES = Object.freeze([
    'read',
    'ordinal',
    'missingPart',
    'exactRemainder',
    'surplus',
    'factFamilyMissingPart',
    'distance',
    'tensOfDistance',
    'onesOfDistance',
    'tensOfScore',
    'onesOfScore',
    'halfFromQuarter',
    'absoluteDifference',
    'add',
    'goalDistanceAfterGain',
    'driveDistancePlusGain',
    'ruleValue',
    'compare',
    'conversionValue',
    'tryMarkerForDirection',
  ]);

  const ANSWER_EXPOSURE_POLICIES = Object.freeze([
    'source-visible',
    'modeled-with-result-hidden',
    'hidden-until-worked',
  ]);

  const EVIDENCE_CLASSES = Object.freeze([
    'literacy',
    'independent',
  ]);

  const CURRICULUM_SOURCES = Object.freeze([
    'workbook',
    'football-only',
  ]);

  const RULES = deepFreeze({
    'field.goal.left': 0,
    'field.goal.right': 100,
    'field.try.left': 2,
    'field.try.right': 98,
    'game.fieldGoalExtraDistance': 17,
    'game.touchdownBasePoints': 6,
    'game.patPoints': 1,
    'game.twoPointPoints': 2,
    'game.fieldGoalPoints': 3,
  });

  const SPECIAL_CONTEXT_KEYS = deepFreeze({
    punt: ['schemaVersion', 'playType', 'contextId', 'match', 'possession', 'direction', 'quarter', 'yardLine', 'scores'],
    fieldGoal: ['schemaVersion', 'playType', 'contextId', 'match', 'possession', 'direction', 'quarter', 'yardLine', 'attemptDistance', 'scores'],
    conversion: ['schemaVersion', 'playType', 'contextId', 'match', 'possession', 'direction', 'quarter', 'tryYardLine', 'attemptType', 'attemptValue', 'scores'],
  });

  const SPECIAL_PROJECTION_KEYS = deepFreeze({
    punt: [
      'contextId', 'playType', 'possession', 'direction', 'startYardLine', 'mode',
      'requestedTravelYards', 'appliedTravelYards', 'rawLandingYardLine',
      'landingYardLine', 'resultKind', 'nextPossession', 'nextStartYardLine',
      'restartReason',
    ],
    fieldGoal: [
      'contextId', 'playType', 'possession', 'direction', 'startYardLine',
      'attemptDistance', 'made', 'resultKind', 'points', 'nextPossession',
      'nextStartYardLine', 'restartReason',
    ],
    conversion: [
      'contextId', 'playType', 'possession', 'direction', 'tryYardLine',
      'attemptType', 'attemptValue', 'made', 'resultKind', 'points',
      'nextPossession', 'nextStartYardLine', 'restartReason',
    ],
  });

  const SPECIAL_BINDING_PATHS = deepFreeze({
    conversion: [
      '/context/scores/player', '/context/scores/opponent',
      '/context/attemptType', '/context/attemptValue',
      '/context/direction', '/context/tryYardLine',
    ],
    fieldGoal: [
      '/context/scores/player', '/context/scores/opponent',
      '/context/attemptDistance',
    ],
    punt: [
      '/context/direction', '/proposal/startYardLine',
      '/proposal/rawLandingYardLine', '/proposal/appliedTravelYards',
      '/proposal/landingYardLine',
    ],
  });

  const CALL_AFFINITY_MULTIPLIER = 1.75;
  // This central map lives beside the family registry so every family reference
  // can be validated at module initialization. UI call-key coverage is pinned
  // against the production registries through the football test seam.
  const CALL_AFFINITIES = deepFreeze({
    'offense:shortRun': ['yards-to-go-read', 'line-to-gain-missing-part', 'line-to-gain-exact', 'line-to-gain-surplus', 'line-to-gain-fact-family', 'gain-vs-needed-comparison', 'team-yards-past-100'],
    'offense:shortPass': ['yards-to-go-read', 'line-to-gain-missing-part', 'line-to-gain-exact', 'line-to-gain-surplus', 'line-to-gain-fact-family', 'gain-vs-needed-comparison', 'next-down'],
    'offense:longRun': ['gain-vs-needed-comparison', 'goal-distance-read', 'drive-distance-scaffolded', 'next-down', 'touchdown-base-points'],
    'offense:mediumPass': ['gain-vs-needed-comparison', 'goal-distance-read', 'goal-distance-tens', 'goal-distance-ones', 'next-down', 'touchdown-base-points'],
    'offense:longPass': ['gain-vs-needed-comparison', 'goal-distance-read', 'goal-distance-tens', 'goal-distance-ones', 'goal-distance-minus-whole-tens', 'drive-distance-plus-whole-tens', 'touchdown-base-points'],
    'defense:run': ['yards-to-go-read', 'line-to-gain-missing-part', 'line-to-gain-exact', 'line-to-gain-surplus', 'line-to-gain-fact-family', 'gain-vs-needed-comparison'],
    'defense:shortPass': ['yards-to-go-read', 'line-to-gain-missing-part', 'line-to-gain-exact', 'line-to-gain-surplus', 'gain-vs-needed-comparison', 'next-down'],
    'defense:mediumPass': ['gain-vs-needed-comparison', 'goal-distance-read', 'next-down'],
    'defense:deepPass': ['goal-distance-read', 'goal-distance-tens', 'goal-distance-ones', 'touchdown-base-points'],
  });

  const DEFAULT_PROFILE = deepFreeze({
    completedThroughPage: CURRENT_COMPLETED_PAGE,
    includedThroughPage: INCLUDED_THROUGH_PAGE,
    computationMax: 10,
    displayMax: 120,
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }

  function pointerTokens(path) {
    if (typeof path !== 'string' || !path.startsWith('/')) return null;
    return path.slice(1).split('/').map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  }

  function readPointer(root, path) {
    const tokens = pointerTokens(path);
    if (!tokens) return undefined;
    let value = root;
    for (const token of tokens) {
      if (!isRecord(value) && !Array.isArray(value)) return undefined;
      if (!Object.prototype.hasOwnProperty.call(value, token)) return undefined;
      value = value[token];
    }
    return value;
  }

  function contextBinding(snap, id, path) {
    const value = readPointer(snap, path);
    if (value === undefined) throw contractError('missing-binding', `Missing contextual source ${path}.`);
    return { id, source: { kind: 'context', path }, value: clone(value) };
  }

  function ruleBinding(id, ruleId) {
    if (!Object.prototype.hasOwnProperty.call(RULES, ruleId)) {
      throw contractError('unknown-rule', `Unknown football rule ${ruleId}.`);
    }
    return { id, source: { kind: 'rule', ruleId }, value: RULES[ruleId] };
  }

  function contractError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function normalizeProfile(profile) {
    const input = isRecord(profile) ? profile : {};
    const positiveInt = (value, fallback) => Number.isInteger(value) && value >= 0 ? value : fallback;
    return {
      // Factual workbook completion and the user-approved question ceiling are
      // separate. A permissive caller cannot widen either repository contract;
      // narrower profiles are allowed and only remove candidates.
      completedThroughPage: Math.min(
        positiveInt(input.completedThroughPage, DEFAULT_PROFILE.completedThroughPage),
        DEFAULT_PROFILE.completedThroughPage,
      ),
      includedThroughPage: Math.min(
        positiveInt(input.includedThroughPage, DEFAULT_PROFILE.includedThroughPage),
        DEFAULT_PROFILE.includedThroughPage,
      ),
      computationMax: Math.min(
        positiveInt(input.computationMax, DEFAULT_PROFILE.computationMax),
        DEFAULT_PROFILE.computationMax,
      ),
      displayMax: Math.min(
        positiveInt(input.displayMax, DEFAULT_PROFILE.displayMax),
        DEFAULT_PROFILE.displayMax,
      ),
    };
  }

  function ordinal(value) {
    if (!Number.isInteger(value) || value < 1) return String(value);
    const lastTwo = value % 100;
    if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
    return `${value}${({ 1: 'st', 2: 'nd', 3: 'rd' })[value % 10] || 'th'}`;
  }

  function countNoun(value, singular, plural = `${singular}s`) {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  function yards(value) {
    return countNoun(value, 'yard');
  }

  function spaces(value) {
    return countNoun(value, 'space');
  }

  function isOrAre(value) {
    return value === 1 ? 'is' : 'are';
  }

  function publicTeamLabels(snap) {
    return {
      player: snap.context.match.player.displayName,
      opponent: snap.context.match.opponent.shortName,
    };
  }

  function comparisonSymbol(left, right) {
    if (left < right) return '<';
    if (left > right) return '>';
    return '=';
  }

  function teamTotalYards(snap) {
    return snap.context.possession === 'offense'
      ? snap.context.totalYards.player
      : snap.context.totalYards.opponent;
  }

  function teamTotalYardsBinding(snap) {
    return snap.context.possession === 'offense'
      ? contextBinding(snap, 'teamTotalYards', '/context/totalYards/player')
      : contextBinding(snap, 'teamTotalYards', '/context/totalYards/opponent');
  }

  function committedTeenScoreTarget(snap) {
    const labels = publicTeamLabels(snap);
    const candidates = [
      { team: labels.player, teamRole: 'player', score: snap.context.scores.player, path: '/context/scores/player' },
      { team: labels.opponent, teamRole: 'opponent', score: snap.context.scores.opponent, path: '/context/scores/opponent' },
    ];
    return candidates.find(({ score }) => Number.isInteger(score) && score >= 10 && score <= 19) || null;
  }

  function teenScorePlaceValue(snap, targetPlace) {
    const target = committedTeenScoreTarget(snap);
    if (!target) {
      return { decline: decline('no-committed-teen-score', 'Neither committed scoreboard score is between 10 and 19.') };
    }
    const tens = Math.floor(target.score / 10);
    const ones = target.score % 10;
    const answer = targetPlace === 'tens' ? tens : ones;
    return eligible(makeSemantic({
      bindings: [contextBinding(snap, 'committedScore', target.path)],
      operationType: targetPlace === 'tens' ? 'tensOfScore' : 'onesOfScore',
      operandIds: ['committedScore'],
      answer,
      prompt: `${target.team} has ${target.score} points on the scoreboard. What digit is in the ${targetPlace} place of ${target.score}?`,
      hint: `Look at the ${targetPlace} place in ${target.team}'s score, ${target.score}.`,
      explanation: `${target.score} has ${tens} ${tens === 1 ? 'ten' : 'tens'} and ${ones} ${ones === 1 ? 'one' : 'ones'}.`,
      choiceSpec: numericChoiceSpec(0, 9),
      visualType: 'base-ten-score',
      visualData: { team: target.team, teamRole: target.teamRole, score: target.score, tens, ones, targetPlace },
      initialAriaLabel: `${target.team} score ${target.score}; the ${targetPlace} digit is hidden.`,
      guidedAriaLabel: `Look at the ${targetPlace} place in ${target.team} score ${target.score}; the answer remains hidden.`,
      workedAriaLabel: `${target.score} has ${tens} ${tens === 1 ? 'ten' : 'tens'} and ${ones} ${ones === 1 ? 'one' : 'ones'}.`,
    }));
  }

  function goalRuleId(direction) {
    return direction === 1 ? 'field.goal.right' : 'field.goal.left';
  }

  function goalLine(snap) {
    return RULES[goalRuleId(snap.context.direction)];
  }

  function goalDistance(snap) {
    return Math.abs(goalLine(snap) - snap.context.yardLine);
  }

  function appliedGain(snap) {
    return snap.proposal.appliedGain;
  }

  function sourcePlayType(source) {
    if (isRecord(source) && source.playType !== undefined) {
      return PLAY_TYPES.includes(source.playType) ? source.playType : null;
    }
    return 'scrimmage';
  }

  function exactKeys(value, expected) {
    if (!isRecord(value)) return false;
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
  }

  function validContextId(value) {
    return (Number.isInteger(value) && value >= 1)
      || (typeof value === 'string' && value.trim() !== '');
  }

  function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function validMatch(match) {
    return exactKeys(match, MATCH_KEYS) && match.schemaVersion === 1
      && exactKeys(match.player, TEAM_IDENTITY_KEYS)
      && exactKeys(match.opponent, TEAM_IDENTITY_KEYS)
      && TEAM_IDENTITY_KEYS.every((key) => nonEmptyString(match.player[key]))
      && TEAM_IDENTITY_KEYS.every((key) => nonEmptyString(match.opponent[key]));
  }

  function oppositePossession(possession) {
    return possession === 'offense' ? 'defense' : 'offense';
  }

  function startingYardFor(possession) {
    return possession === 'offense' ? 20 : 80;
  }

  function specialShapeReason(play, playType) {
    if (!isRecord(play)) return decline('invalid-play', 'Expected one active play object.');
    if (!exactKeys(play, ['schemaVersion', 'playType', 'gameId', 'possessionId', 'playId', 'contextId', 'context', 'proposal'])) {
      return decline('invalid-active-play-shape', 'Special-team active play must use the exact public tagged shape.');
    }
    if (play.schemaVersion !== 1 || play.playType !== playType) {
      return decline('invalid-play-type', 'Active play type or schema is invalid.');
    }
    if (![play.gameId, play.possessionId, play.playId].every((id) => typeof id === 'string' && id.trim())) {
      return decline('invalid-play-identity', 'Special-team play identity fields must be non-empty strings.');
    }
    const c = play.context;
    const p = play.proposal;
    if (!exactKeys(c, SPECIAL_CONTEXT_KEYS[playType])) {
      return decline('invalid-context-shape', `${playType} context contains missing, extra, or private fields.`);
    }
    if (!exactKeys(p, SPECIAL_PROJECTION_KEYS[playType])) {
      return decline('invalid-proposal-shape', `${playType} proposal contains missing, extra, or private fields.`);
    }
    if (![play.contextId, c.contextId, p.contextId].every(validContextId)) {
      return decline('invalid-context-identity', 'Play, context, and proposal context IDs must be positive integers or nonempty strings.');
    }
    if (c.schemaVersion !== 1 || c.playType !== playType || p.playType !== playType
      || play.contextId !== c.contextId || p.contextId !== c.contextId) {
      return decline('inconsistent-play-identity', 'Play, context, and proposal tags must agree.');
    }
    if (!validMatch(c.match)) return decline('invalid-match', 'Special-team context must include one complete public match descriptor.');
    if (!['offense', 'defense'].includes(c.possession) || p.possession !== c.possession) {
      return decline('invalid-possession', 'Special-team possession must be offense or defense and agree with the proposal.');
    }
    const expectedDirection = c.possession === 'offense' ? 1 : -1;
    if (c.direction !== expectedDirection || p.direction !== c.direction) {
      return decline('invalid-direction', 'Special-team direction must agree with possession and proposal.');
    }
    if (!Number.isInteger(c.quarter) || c.quarter < 1 || c.quarter > 4) {
      return decline('invalid-quarter', 'Quarter must be 1 through 4.');
    }
    if (!isRecord(c.scores) || !exactKeys(c.scores, ['player', 'opponent'])
      || !Number.isInteger(c.scores.player) || c.scores.player < 0
      || !Number.isInteger(c.scores.opponent) || c.scores.opponent < 0) {
      return decline('invalid-scores', 'Committed scores must contain two nonnegative integers.');
    }

    const nextPossession = oppositePossession(c.possession);
    if (p.nextPossession !== nextPossession) return decline('invalid-next-possession', 'Proposal must hand the ball to the other possession.');

    if (playType === 'conversion') {
      const expectedTry = c.direction === 1 ? RULES['field.try.right'] : RULES['field.try.left'];
      const expectedValue = c.attemptType === 'pat' ? RULES['game.patPoints']
        : c.attemptType === 'twoPoint' ? RULES['game.twoPointPoints'] : null;
      if (c.tryYardLine !== expectedTry || c.attemptValue !== expectedValue
        || p.tryYardLine !== c.tryYardLine || p.attemptType !== c.attemptType
        || p.attemptValue !== c.attemptValue || typeof p.made !== 'boolean') {
        return decline('invalid-conversion', 'Conversion facts contradict the public try context.');
      }
      const expectedKind = p.made ? 'conversionMade' : 'conversionMissed';
      if (p.resultKind !== expectedKind || p.points !== (p.made ? c.attemptValue : 0)
        || p.nextStartYardLine !== startingYardFor(nextPossession)
        || p.restartReason !== 'automaticTouchback') {
        return decline('invalid-conversion-proposal', 'Conversion proposal contradicts canonical scoring or placement.');
      }
      if (!p.made) return decline(
        'alternate-initial-proposal',
        'A missed conversion is a resolution reprojection, not an initial question source.',
      );
      return null;
    }

    if (!Number.isInteger(c.yardLine) || c.yardLine < 1 || c.yardLine > 99 || p.startYardLine !== c.yardLine) {
      return decline('invalid-yard-line', 'Special-team yard line must be 1 through 99 and match the proposal start.');
    }

    if (playType === 'fieldGoal') {
      const goalLine = c.direction === 1 ? RULES['field.goal.right'] : RULES['field.goal.left'];
      const expectedDistance = Math.abs(goalLine - c.yardLine) + RULES['game.fieldGoalExtraDistance'];
      if (c.attemptDistance !== expectedDistance || expectedDistance > 57
        || p.attemptDistance !== c.attemptDistance || typeof p.made !== 'boolean') {
        return decline('invalid-field-goal', 'Field-goal facts contradict the public attempt context.');
      }
      const expectedKind = p.made ? 'fieldGoalMade'
        : p.restartReason === 'blockedFieldGoal' ? 'fieldGoalBlocked' : 'fieldGoalMissed';
      const expectedRestart = p.made ? 'automaticTouchback'
        : expectedKind === 'fieldGoalBlocked' ? 'blockedFieldGoal' : 'missedFieldGoal';
      const expectedStart = p.made ? startingYardFor(nextPossession) : c.yardLine;
      if (p.resultKind !== expectedKind || p.points !== (p.made ? RULES['game.fieldGoalPoints'] : 0)
        || p.nextStartYardLine !== expectedStart || p.restartReason !== expectedRestart) {
        return decline('invalid-field-goal-proposal', 'Field-goal proposal contradicts canonical scoring or placement.');
      }
      if (!p.made) return decline(
        'alternate-initial-proposal',
        'A missed or blocked field goal is a resolution reprojection, not an initial question source.',
      );
      return null;
    }

    if (!['normal', 'receiverFavorable'].includes(p.mode)
      || !Number.isInteger(p.requestedTravelYards)
      || (p.mode === 'normal' && (p.requestedTravelYards < 35 || p.requestedTravelYards > 50))
      || (p.mode === 'receiverFavorable' && p.requestedTravelYards !== 20)) {
      return decline('invalid-punt-travel', 'Punt travel must match its frozen normal or receiver-favorable mode.');
    }
    const receivingOwn20 = startingYardFor(nextPossession);
    const unbounded = c.yardLine + (c.direction * p.requestedTravelYards);
    const crossedGoal = c.direction === 1 ? unbounded >= 100 : unbounded <= 0;
    const rawLanding = Math.max(0, Math.min(100, unbounded));
    let landing;
    let expectedKind;
    if (crossedGoal) {
      landing = receivingOwn20;
      expectedKind = 'puntTouchback';
    } else if (p.mode === 'receiverFavorable') {
      landing = c.direction === 1
        ? Math.min(rawLanding, receivingOwn20)
        : Math.max(rawLanding, receivingOwn20);
      expectedKind = 'punt';
    } else {
      landing = rawLanding;
      expectedKind = 'punt';
    }
    const expectedRaw = rawLanding;
    const expectedApplied = Math.abs(expectedRaw - c.yardLine);
    if (p.rawLandingYardLine !== expectedRaw || p.landingYardLine !== landing
      || p.appliedTravelYards !== expectedApplied || p.resultKind !== expectedKind
      || p.nextStartYardLine !== landing
      || p.restartReason !== (expectedKind === 'puntTouchback' ? 'puntTouchback' : 'punt')) {
      return decline('invalid-punt-proposal', 'Punt proposal contradicts canonical travel or receiving placement.');
    }
    if (p.mode !== 'normal') return decline(
      'alternate-initial-proposal',
      'A receiver-favorable punt is a resolution reprojection, not an initial question source.',
    );
    return null;
  }

  function scrimmageShapeReason(snap) {
    if (!isRecord(snap)) return decline('invalid-snap', 'Expected one snap object.');
    if (!isRecord(snap.context)) return decline('invalid-context', 'Snap context is missing.');
    if (!isRecord(snap.proposal)) return decline('invalid-proposal', 'Snap proposal is missing.');
    const c = snap.context;
    const p = snap.proposal;
    if (!validMatch(c.match)) {
      return decline('invalid-match', 'Snap context must include one complete public match descriptor.');
    }
    if (![snap.contextId, c.contextId, p.contextId].every(validContextId)) {
      return decline('invalid-context-identity', 'Snap, context, and proposal context IDs must be positive integers or nonempty strings.');
    }
    if (snap.contextId !== c.contextId || p.contextId !== c.contextId) {
      return decline('inconsistent-play-identity', 'Snap, context, and proposal context IDs must agree.');
    }
    if (!['offense', 'defense'].includes(c.possession)) return decline('invalid-possession', 'Possession must be offense or defense.');
    if (![1, -1].includes(c.direction)) return decline('invalid-direction', 'Direction must be 1 or -1.');
    if (!Number.isInteger(c.quarter) || c.quarter < 1 || c.quarter > 4) return decline('invalid-quarter', 'Quarter must be 1 through 4.');
    if (!Number.isInteger(c.down) || c.down < 1 || c.down > 4) return decline('invalid-down', 'Down must be 1 through 4.');
    if (!Number.isInteger(c.yardsToGo) || c.yardsToGo < 1 || c.yardsToGo > 99) return decline('invalid-yards-to-go', 'Yards to go must be 1 through 99.');
    if (!Number.isInteger(c.yardLine) || c.yardLine < 1 || c.yardLine > 99) return decline('invalid-yard-line', 'Yard line must be 1 through 99.');
    if (!Number.isInteger(c.firstDownLine) || c.firstDownLine < 0 || c.firstDownLine > 100) return decline('invalid-first-down-line', 'First-down line must be 0 through 100.');
    if (!Number.isInteger(c.driveStart) || c.driveStart < 0 || c.driveStart > 100) return decline('invalid-drive-start', 'Drive start must be 0 through 100.');
    if (!isRecord(c.scores) || !Number.isInteger(c.scores.player) || c.scores.player < 0 || !Number.isInteger(c.scores.opponent) || c.scores.opponent < 0) {
      return decline('invalid-scores', 'Committed scores must be nonnegative integers.');
    }
    if (!isRecord(c.totalYards)
      || !Number.isSafeInteger(c.totalYards.player)
      || !Number.isSafeInteger(c.totalYards.opponent)) {
      return decline('invalid-total-yards', 'Committed team yard totals must be signed safe integers.');
    }
    if (!Number.isInteger(p.appliedGain) || p.appliedGain < 0) return decline('invalid-gain', 'Applied gain must be a nonnegative integer.');
    if (!Number.isInteger(p.startYardLine) || p.startYardLine !== c.yardLine) return decline('invalid-proposal-start', 'Proposal must start at the contextual yard line.');
    if (!Number.isInteger(p.endYardLine) || p.endYardLine < 0 || p.endYardLine > 100) return decline('invalid-proposal-end', 'Proposal end must be a canonical field coordinate.');
    const expectedMarker = c.yardLine + (c.direction * c.yardsToGo);
    if (c.firstDownLine !== expectedMarker) return decline('inconsistent-line-to-gain', 'The old marker must be exactly yardsToGo ahead of the ball.');
    const expectedEnd = c.yardLine + (c.direction * p.appliedGain);
    if (p.endYardLine !== expectedEnd) return decline('inconsistent-proposal-gain', 'Applied gain must exactly reach the proposal end coordinate.');
    if (p.direction !== undefined && p.direction !== c.direction) return decline('inconsistent-proposal-direction', 'Proposal direction contradicts the context.');
    if (p.possession !== undefined && p.possession !== c.possession) return decline('inconsistent-proposal-possession', 'Proposal possession contradicts the context.');
    if (!['touchdown', 'firstDown', 'turnoverOnDowns', 'advance'].includes(p.resultKind)) {
      return decline('invalid-result-kind', 'Proposal must have one exclusive result kind.');
    }
    return null;
  }

  function sourceShapeReason(source) {
    const playType = sourcePlayType(source);
    if (!playType) return decline('invalid-play-type', 'Question source uses an unknown play type.');
    return playType === 'scrimmage'
      ? scrimmageShapeReason(source)
      : specialShapeReason(source, playType);
  }

  function decline(code, detail, paths = []) {
    return { code, detail, paths: [...paths] };
  }

  function eligible(semantic) {
    return { semantic };
  }

  function inDisplayBand(profile, ...values) {
    return values.every((value) => Number.isFinite(value) && value >= 0 && value <= profile.displayMax);
  }

  function inComputationBand(profile, ...values) {
    return values.every((value) => Number.isFinite(value) && Math.abs(value) <= profile.computationMax);
  }

  function makeMeta({
    familyId,
    skill,
    concept,
    purpose,
    tier,
    weight,
    operationType,
    answerExposure,
    evidenceClass,
    curriculumSource,
    introducedOnPage = null,
    playType = 'scrimmage',
  }) {
    if (!PLAY_TYPES.includes(playType)) throw new Error(`Unknown play type ${playType}.`);
    if (!OPERATION_TYPES.includes(operationType)) throw new Error(`Unknown operation type ${operationType}.`);
    if (!ANSWER_EXPOSURE_POLICIES.includes(answerExposure)) throw new Error(`Unknown answer-exposure policy ${answerExposure}.`);
    if (!EVIDENCE_CLASSES.includes(evidenceClass)) throw new Error(`Unknown evidence class ${evidenceClass}.`);
    if (answerExposure === 'source-visible' && evidenceClass !== 'literacy') {
      throw new Error('Source-visible questions must be classified as literacy evidence.');
    }
    if (evidenceClass === 'independent' && answerExposure === 'source-visible') {
      throw new Error('Independent evidence must keep the answer outside the source-visible model.');
    }
    if (!CURRICULUM_SOURCES.includes(curriculumSource)) throw new Error(`Unknown curriculum source ${curriculumSource}.`);
    if (curriculumSource === 'workbook' && (!Number.isInteger(introducedOnPage) || introducedOnPage < 1 || introducedOnPage > INCLUDED_THROUGH_PAGE)) {
      throw new Error('Workbook-sourced families need an exact introducedOnPage within the approved book.');
    }
    if (curriculumSource === 'football-only' && introducedOnPage !== null) {
      throw new Error('Football-only families must not claim a workbook source page.');
    }
    return Object.freeze({
      id: familyId,
      familyId,
      skill,
      concept,
      purpose,
      grading: 'gate',
      tier,
      curriculumSource,
      introducedOnPage,
      weight,
      operationType,
      answerExposure,
      evidenceClass,
      playType,
    });
  }

  function numericChoiceSpec(min, max, count = 4) {
    return { type: 'number', min, max, count };
  }

  function fixedChoiceSpec(values) {
    return { type: 'fixed', values: [...values] };
  }

  function makeSemantic({
    bindings,
    operationType,
    operandIds,
    answer,
    prompt,
    promptAriaLabel,
    hint,
    explanation,
    choiceSpec,
    visualType,
    visualData,
    initialAriaLabel,
    guidedAriaLabel,
    workedAriaLabel,
  }) {
    return {
      bindings,
      operation: { type: operationType, operandIds: [...operandIds] },
      answer,
      prompt,
      promptAriaLabel: promptAriaLabel || prompt.replace(/\n/g, ' '),
      hint,
      explanation,
      choiceSpec,
      visualType,
      visualData,
      visualAriaLabels: {
        initial: initialAriaLabel,
        guided: guidedAriaLabel,
        worked: workedAriaLabel,
      },
    };
  }

  function lineBindings(snap) {
    return [
      contextBinding(snap, 'yardsToGo', '/context/yardsToGo'),
      contextBinding(snap, 'proposedGain', '/proposal/appliedGain'),
    ];
  }

  function goalBindings(snap) {
    return [
      contextBinding(snap, 'ballYardLine', '/context/yardLine'),
      ruleBinding('goalLine', goalRuleId(snap.context.direction)),
    ];
  }

  const FAMILY_DEFINITIONS = [
    {
      meta: makeMeta({ familyId: 'yards-to-go-read', skill: 'football-number-sense', concept: 'line-to-gain', purpose: 'coreReview', tier: 'within-10', weight: 4, operationType: 'read', answerExposure: 'source-visible', evidenceClass: 'literacy', curriculumSource: 'football-only' }),
      derive(snap) {
        const answer = snap.context.yardsToGo;
        if (answer > 10) return { decline: decline('outside-read-band', 'This read family is limited to yards-to-go values through 10.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'yardsToGo', '/context/yardsToGo')],
          operationType: 'read',
          operandIds: ['yardsToGo'],
          answer,
          prompt: `The scoreboard says ${ordinal(snap.context.down)} & ${answer}. How many yards are needed for a first down?`,
          hint: 'Read the number after the & sign on the scoreboard.',
          explanation: `${ordinal(snap.context.down)} & ${answer} means ${yards(answer)} ${isOrAre(answer)} needed.`,
          choiceSpec: numericChoiceSpec(1, 10),
          visualType: 'down-distance',
          visualData: { down: snap.context.down, yardsToGo: answer },
          initialAriaLabel: `${ordinal(snap.context.down)} down and ${yards(answer)} to go.`,
          guidedAriaLabel: `Focus on the ${answer} in ${ordinal(snap.context.down)} and ${answer}; it tells the yards needed.`,
          workedAriaLabel: `${ordinal(snap.context.down)} and ${answer} means the answer is ${yards(answer)}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-missing-part', skill: 'missing-part', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', weight: 3.2, operationType: 'missingPart', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 41 }),
      derive(snap, profile) {
        const needed = snap.context.yardsToGo;
        const gain = appliedGain(snap);
        if (!(gain > 0 && gain < needed)) return { decline: decline('not-short-of-marker', 'This proposal is not a positive gain short of the old marker.', ['/proposal/appliedGain', '/context/yardsToGo']) };
        const answer = needed - gain;
        if (!inComputationBand(profile, needed, gain, answer)) return { decline: decline('outside-computation-band', 'The entire missing-part relation must fit the completed computation band.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap),
          operationType: 'missingPart', operandIds: ['yardsToGo', 'proposedGain'], answer,
          prompt: `${yards(needed)} ${isOrAre(needed)} needed. If this play gains ${yards(gain)}, how many more yards are still needed?`,
          hint: `Start with ${spaces(needed)} and mark the ${spaces(gain)} the play could cover. Count the unmarked spaces.`,
          explanation: `${needed} - ${gain} = ${answer}, so ${answer} yard${answer === 1 ? '' : 's'} would still be needed.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'parts',
          visualData: { total: needed, knownPart: gain, missingPart: null },
          initialAriaLabel: `${spaces(needed)} in all with ${yards(gain)} marked for this play; the remaining part is hidden.`,
          guidedAriaLabel: `${spaces(needed)} in all. ${gain} ${isOrAre(gain)} filled. Count the empty spaces without naming the result yet.`,
          workedAriaLabel: `${needed} splits into ${gain} and ${answer}; the missing part is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-exact', skill: 'difference', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', weight: 2.4, operationType: 'exactRemainder', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const needed = snap.context.yardsToGo;
        const gain = appliedGain(snap);
        if (gain !== needed) return { decline: decline('not-exact', 'The proposed gain does not exactly reach the old marker.', ['/proposal/appliedGain', '/context/yardsToGo']) };
        if (!inComputationBand(profile, needed, gain)) return { decline: decline('outside-computation-band', 'The exact relation must fit the completed computation band.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap), operationType: 'exactRemainder', operandIds: ['yardsToGo', 'proposedGain'], answer: 0,
          prompt: `${yards(needed)} ${isOrAre(needed)} needed. If this play gains exactly ${yards(gain)}, how many yards short would it be?`,
          hint: 'Match each needed yard with one yard this play could gain.',
          explanation: `${needed} - ${gain} = 0. The play would reach the marker exactly.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'parts',
          visualData: { total: needed, knownPart: gain, missingPart: null },
          initialAriaLabel: `${spaces(needed)} needed and ${spaces(gain)} this play could gain line up; the remainder is hidden.`,
          guidedAriaLabel: 'Pair every needed space with one space this play could gain, then check whether any space is left.',
          workedAriaLabel: `${needed} minus ${gain} is 0; no yard is left short.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-surplus', skill: 'difference', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', weight: 2.6, operationType: 'surplus', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const needed = snap.context.yardsToGo;
        const gain = appliedGain(snap);
        if (gain <= needed) return { decline: decline('no-surplus', 'The proposed gain does not pass the old marker.', ['/proposal/appliedGain', '/context/yardsToGo']) };
        const answer = gain - needed;
        if (!inComputationBand(profile, gain, needed, answer)) return { decline: decline('outside-computation-band', 'Gain, need, and surplus must all fit within 10.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap), operationType: 'surplus', operandIds: ['proposedGain', 'yardsToGo'], answer,
          prompt: `${yards(needed)} ${isOrAre(needed)} needed. If this play gains ${yards(gain)}, how many yards past the marker would it go?`,
          hint: `Use ${needed} of the ${yards(gain)} to reach the marker. Count what remains.`,
          explanation: `${gain} - ${needed} = ${answer}, so the play would go ${answer} yard${answer === 1 ? '' : 's'} past the marker.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'marker-strip',
          visualData: { needed, proposedGain: gain, surplus: null },
          initialAriaLabel: `${gain} possible yard spaces with the marker after ${needed}; the distance past it is hidden.`,
          guidedAriaLabel: `Count the spaces after the marker at ${needed}, without naming the result yet.`,
          workedAriaLabel: `${gain} minus ${needed} is ${answer}; the surplus is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-fact-family', skill: 'fact-family', concept: 'line-to-gain', purpose: 'coreReview', tier: 'within-10', weight: 2.3, operationType: 'factFamilyMissingPart', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 98 }),
      derive(snap, profile) {
        const total = snap.context.yardsToGo;
        const part = appliedGain(snap);
        if (!(part > 0 && part < total)) return { decline: decline('no-positive-missing-part', 'Fact-family form needs a positive known part and a positive missing part.') };
        const answer = total - part;
        if (!inComputationBand(profile, total, part, answer)) return { decline: decline('outside-computation-band', 'Every fact-family number must fit within 10.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap), operationType: 'factFamilyMissingPart', operandIds: ['yardsToGo', 'proposedGain'], answer,
          prompt: `${part} + ? = ${total}. What missing part would finish the yards needed for the first down?`,
          hint: `The known part is ${part}, and both parts must join to make ${total}.`,
          explanation: `${part} + ${answer} = ${total}. The matching subtraction fact is ${total} - ${part} = ${answer}.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'fact-family',
          visualData: { total, knownPart: part, missingPart: null },
          initialAriaLabel: `A fact-family triangle has total ${total}, known part ${part}, and one hidden part.`,
          guidedAriaLabel: `Use ${total} minus ${part} to find the hidden part without announcing it yet.`,
          workedAriaLabel: `The facts are ${part} plus ${answer} equals ${total}, and ${total} minus ${part} equals ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({
        familyId: 'gain-vs-needed-comparison',
        skill: 'comparison',
        concept: 'line-to-gain-comparison',
        purpose: 'coreReview',
        tier: 'within-16',
        weight: 2.4,
        operationType: 'compare',
        answerExposure: 'modeled-with-result-hidden',
        evidenceClass: 'independent',
        curriculumSource: 'workbook',
        introducedOnPage: 39,
      }),
      derive(snap, profile) {
        const gain = appliedGain(snap);
        const needed = snap.context.yardsToGo;
        if (gain > 16 || needed > 16) {
          return { decline: decline('outside-comparison-source-band', 'This live comparison must stay within the workbook page-39 number band through 16.') };
        }
        if (!inDisplayBand(profile, gain, needed)) return { decline: decline('outside-display-band', 'Gain and yards needed must fit the approved comparison display band.') };
        const answer = comparisonSymbol(gain, needed);
        const comparisonHint = gain >= 10 || needed >= 10
          ? 'Compare the tens first. If they match, compare the ones. The open side points to the greater number.'
          : 'Compare the two amounts. The open side points to the greater number.';
        return eligible(makeSemantic({
          bindings: [
            contextBinding(snap, 'proposedGain', '/proposal/appliedGain'),
            contextBinding(snap, 'yardsToGo', '/context/yardsToGo'),
          ],
          operationType: 'compare', operandIds: ['proposedGain', 'yardsToGo'], answer,
          prompt: `This play could gain ${yards(gain)}, and ${yards(needed)} ${isOrAre(needed)} needed. Which symbol makes ${gain} ? ${needed} true?`,
          hint: comparisonHint,
          explanation: `${gain} ${answer} ${needed}. The yards this play could gain are ${gain === needed ? 'exactly the same as' : gain > needed ? 'greater than' : 'less than'} the yards needed.`,
          choiceSpec: fixedChoiceSpec(['<', '=', '>']), visualType: 'comparison',
          visualData: { leftLabel: 'PLAY', leftValue: gain, rightLabel: 'NEED', rightValue: needed },
          initialAriaLabel: `Compare the ${yards(gain)} this play could gain with the ${yards(needed)} needed; the comparison symbol is hidden.`,
          guidedAriaLabel: gain >= 10 || needed >= 10
            ? `Compare ${gain} and ${needed} by tens, then ones; the symbol remains hidden.`
            : `Compare ${gain} and ${needed}; the symbol remains hidden.`,
          workedAriaLabel: `${gain} ${answer} ${needed}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-read', skill: 'place-value', concept: 'field-distance', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 2.2, operationType: 'distance', answerExposure: 'source-visible', evidenceClass: 'literacy', curriculumSource: 'workbook', introducedOnPage: 126 }),
      derive(snap, profile) {
        const answer = goalDistance(snap);
        if (!inDisplayBand(profile, answer)) return { decline: decline('outside-display-band', 'Goal distance must fit the completed display band.') };
        return eligible(makeSemantic({
          bindings: goalBindings(snap), operationType: 'distance', operandIds: ['ballYardLine', 'goalLine'], answer,
          prompt: 'Look at the number between BALL and GOAL. How many yards is the ball from the end zone?',
          hint: 'Read the number between BALL and GOAL from left to right.',
          explanation: `The ball is ${answer} yard${answer === 1 ? '' : 's'} from the goal line.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'goal-distance',
          visualData: { ballYardLine: snap.context.yardLine, goalLine: goalLine(snap), distance: answer },
          initialAriaLabel: `BALL, ${answer} yard${answer === 1 ? '' : 's'}, GOAL.`,
          guidedAriaLabel: `Read the number ${answer} between BALL and GOAL.`,
          workedAriaLabel: `The ball is ${answer} yard${answer === 1 ? '' : 's'} from the goal line.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-tens', skill: 'place-value', concept: 'place-value', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 2.4, operationType: 'tensOfDistance', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'literacy', curriculumSource: 'workbook', introducedOnPage: 124 }),
      derive(snap, profile) {
        const distance = goalDistance(snap);
        if (distance < 10 || distance > 99 || !inDisplayBand(profile, distance)) return { decline: decline('not-two-digit-distance', 'Tens work needs a two-digit goal distance from 10 through 99.') };
        const answer = Math.floor(distance / 10);
        return eligible(makeSemantic({
          bindings: goalBindings(snap), operationType: 'tensOfDistance', operandIds: ['ballYardLine', 'goalLine'], answer,
          prompt: `The ball is ${distance} yards from the end zone. What digit is in the tens place of ${distance}?`,
          hint: `Look at the tens place in ${distance}.`,
          explanation: `${distance} has ${answer} ten${answer === 1 ? '' : 's'} and ${distance % 10} ${distance % 10 === 1 ? 'one' : 'ones'}.`,
          choiceSpec: numericChoiceSpec(0, 9), visualType: 'base-ten-distance',
          visualData: { distance, tens: answer, ones: distance % 10, targetPlace: 'tens' },
          initialAriaLabel: `${distance} yards from the ball to the end zone; the tens digit is hidden.`,
          guidedAriaLabel: `Look at the tens digit in ${distance}; the answer remains hidden.`,
          workedAriaLabel: `${distance} has ${answer} ${answer === 1 ? 'ten' : 'tens'} and ${distance % 10} ${distance % 10 === 1 ? 'one' : 'ones'}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-ones', skill: 'place-value', concept: 'place-value', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 2, operationType: 'onesOfDistance', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'literacy', curriculumSource: 'workbook', introducedOnPage: 124 }),
      derive(snap, profile) {
        const distance = goalDistance(snap);
        if (distance < 10 || distance > 99 || !inDisplayBand(profile, distance)) return { decline: decline('not-two-digit-distance', 'Ones work needs a two-digit goal distance from 10 through 99.') };
        const answer = distance % 10;
        return eligible(makeSemantic({
          bindings: goalBindings(snap), operationType: 'onesOfDistance', operandIds: ['ballYardLine', 'goalLine'], answer,
          prompt: `The ball is ${distance} yards from the end zone. What digit is in the ones place of ${distance}?`,
          hint: `Look at the ones place in ${distance}.`,
          explanation: `${distance} has ${Math.floor(distance / 10)} ${Math.floor(distance / 10) === 1 ? 'ten' : 'tens'} and ${answer} ${answer === 1 ? 'one' : 'ones'}.`,
          choiceSpec: numericChoiceSpec(0, 9), visualType: 'base-ten-distance',
          visualData: { distance, tens: Math.floor(distance / 10), ones: answer, targetPlace: 'ones' },
          initialAriaLabel: `${distance} yards from the ball to the end zone; the ones digit is hidden.`,
          guidedAriaLabel: `Look at the ones digit in ${distance}; the answer remains hidden.`,
          workedAriaLabel: `${distance} has ${Math.floor(distance / 10)} ${Math.floor(distance / 10) === 1 ? 'ten' : 'tens'} and ${answer} ${answer === 1 ? 'one' : 'ones'}.`,
        }));
      },
    },
    {
      meta: makeMeta({
        familyId: 'team-yards-past-100',
        skill: 'numbers-past-100',
        concept: 'team-total-yards',
        purpose: 'approvedExtension',
        tier: 'through-120',
        weight: 1.8,
        operationType: 'add',
        answerExposure: 'modeled-with-result-hidden',
        evidenceClass: 'independent',
        curriculumSource: 'workbook',
        introducedOnPage: 149,
      }),
      derive(snap, profile) {
        const current = teamTotalYards(snap);
        const gain = appliedGain(snap);
        const answer = current + gain;
        if (!(gain >= 1 && gain <= 3 && answer >= 100 && answer <= 120)) {
          return { decline: decline('not-past-100-small-move', 'This exact play must move a real team total across or within 100 through 120 by one to three yards.') };
        }
        if (!inDisplayBand(profile, current, gain, answer)) return { decline: decline('outside-display-band', 'The team-yard relation must stay within the approved display band through 120.') };
        const labels = publicTeamLabels(snap);
        const team = snap.context.possession === 'offense' ? labels.player : labels.opponent;
        const teamRole = snap.context.possession === 'offense' ? 'player' : 'opponent';
        return eligible(makeSemantic({
          bindings: [
            teamTotalYardsBinding(snap),
            contextBinding(snap, 'proposedGain', '/proposal/appliedGain'),
          ],
          operationType: 'add', operandIds: ['teamTotalYards', 'proposedGain'], answer,
          prompt: `${team} has ${current} total offensive yards. If this play gains ${yards(gain)}, what would the team total be?`,
          hint: `Count forward ${gain} from ${current}, one yard at a time.`,
          explanation: `${current} + ${gain} = ${answer}, so ${team} would have ${answer} total offensive yards.`,
          choiceSpec: numericChoiceSpec(90, 120), visualType: 'hundreds-move',
          visualData: { team, teamRole, startTotal: current, proposedGain: gain, resultTotal: null },
          initialAriaLabel: `${team} has ${current} total offensive yards with ${yards(gain)} possible on this play; the new total is hidden.`,
          guidedAriaLabel: `Count forward ${gain} from ${current}, one yard at a time; the final total remains hidden.`,
          workedAriaLabel: `${current} plus ${gain} is ${answer} total offensive yards for ${team}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'drive-distance-scaffolded', skill: 'difference', concept: 'drive-distance', purpose: 'weakSpot', tier: 'within-10', weight: 1.8, operationType: 'absoluteDifference', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const answer = Math.abs(snap.context.yardLine - snap.context.driveStart);
        if (!(answer > 0 && inComputationBand(profile, answer))) return { decline: decline('drive-distance-not-scaffoldable', 'Current drive movement must be a positive distance within the computation band.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'driveStart', '/context/driveStart'), contextBinding(snap, 'ballYardLine', '/context/yardLine')],
          operationType: 'absoluteDifference', operandIds: ['driveStart', 'ballYardLine'], answer,
          prompt: 'Count the spaces from START to NOW. How many yards has this drive moved so far?',
          hint: 'Count one space at a time from START to NOW.',
          explanation: `There ${isOrAre(answer)} ${spaces(answer)} from the drive start to the current ball, so the drive has moved ${yards(answer)}.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'drive-strip',
          visualData: { startYardLine: snap.context.driveStart, ballYardLine: snap.context.yardLine, distance: null },
          initialAriaLabel: 'START and NOW are no more than ten spaces apart; the distance is hidden.',
          guidedAriaLabel: 'Count each space from the Start marker to the Now marker without announcing the total yet.',
          workedAriaLabel: `Start and Now are ${yards(answer)} apart.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'committed-score-total', skill: 'addition', concept: 'committed-score', purpose: 'coreReview', tier: 'within-10', weight: 1.3, operationType: 'add', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 18 }),
      derive(snap, profile) {
        const labels = publicTeamLabels(snap);
        const player = snap.context.scores.player;
        const opponent = snap.context.scores.opponent;
        const answer = player + opponent;
        if (answer === 0 || !inComputationBand(profile, player, opponent, answer)) return { decline: decline('score-relation-outside-band', 'Both committed scores and their total must fit within 10.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'playerScore', '/context/scores/player'), contextBinding(snap, 'opponentScore', '/context/scores/opponent')],
          operationType: 'add', operandIds: ['playerScore', 'opponentScore'], answer,
          prompt: `The scoreboard says ${labels.player} ${player}, ${labels.opponent} ${opponent}. How many points have both teams scored in all?`,
          hint: `Join ${player} ${labels.player} counters and ${opponent} ${labels.opponent} counters.`,
          explanation: `${player} + ${opponent} = ${answer} points in all.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'score-parts',
          visualData: { playerLabel: labels.player, opponentLabel: labels.opponent, playerScore: player, opponentScore: opponent, total: null },
          initialAriaLabel: `${player} ${labels.player} score counters and ${opponent} ${labels.opponent} score counters; the total is hidden.`,
          guidedAriaLabel: `Join the group of ${player} and the group of ${opponent}, then count all counters without announcing the total yet.`,
          workedAriaLabel: `${player} plus ${opponent} equals ${answer} points.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'committed-score-difference', skill: 'difference', concept: 'committed-score', purpose: 'weakSpot', tier: 'within-10', weight: 1.2, operationType: 'absoluteDifference', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const labels = publicTeamLabels(snap);
        const player = snap.context.scores.player;
        const opponent = snap.context.scores.opponent;
        const answer = Math.abs(player - opponent);
        if (player + opponent === 0 || !inComputationBand(profile, player, opponent, answer)) return { decline: decline('score-relation-outside-band', 'Both committed scores and the entire difference relation must fit within 10.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'playerScore', '/context/scores/player'), contextBinding(snap, 'opponentScore', '/context/scores/opponent')],
          operationType: 'absoluteDifference', operandIds: ['playerScore', 'opponentScore'], answer,
          prompt: `The scoreboard says ${labels.player} ${player}, ${labels.opponent} ${opponent}. How many points apart are the teams?`,
          hint: `Pair one ${labels.player} point with one ${labels.opponent} point. Count the points without partners.`,
          explanation: `${Math.max(player, opponent)} - ${Math.min(player, opponent)} = ${answer}, so the teams are ${answer} point${answer === 1 ? '' : 's'} apart.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'score-difference',
          visualData: { playerLabel: labels.player, opponentLabel: labels.opponent, playerScore: player, opponentScore: opponent, difference: null },
          initialAriaLabel: `${player} ${labels.player} counters and ${opponent} ${labels.opponent} counters are lined up; the difference is hidden.`,
          guidedAriaLabel: `Pair the ${labels.player} and ${labels.opponent} groups and count the unpaired counters without announcing the result yet.`,
          workedAriaLabel: `The teams are ${answer} point${answer === 1 ? '' : 's'} apart.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'committed-score-tens', skill: 'teen-place-value', concept: 'teen-place-value', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 0.8, operationType: 'tensOfScore', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'literacy', curriculumSource: 'workbook', introducedOnPage: 124 }),
      derive(snap) {
        return teenScorePlaceValue(snap, 'tens');
      },
    },
    {
      meta: makeMeta({ familyId: 'committed-score-ones', skill: 'teen-place-value', concept: 'teen-place-value', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 1.4, operationType: 'onesOfScore', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'literacy', curriculumSource: 'workbook', introducedOnPage: 124 }),
      derive(snap) {
        return teenScorePlaceValue(snap, 'ones');
      },
    },
    {
      meta: makeMeta({ familyId: 'quarter-read', skill: 'football-number-sense', concept: 'quarter-read', purpose: 'coreReview', tier: 'football-context', weight: 0.8, operationType: 'ordinal', answerExposure: 'source-visible', evidenceClass: 'literacy', curriculumSource: 'football-only' }),
      derive(snap) {
        const answer = ordinal(snap.context.quarter);
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'quarter', '/context/quarter')], operationType: 'ordinal', operandIds: ['quarter'], answer,
          prompt: `The scoreboard shows Q${snap.context.quarter}. Which quarter is the game in?`,
          hint: 'Match the Q number to an order number such as 1st, 2nd, 3rd, or 4th.',
          explanation: `Q${snap.context.quarter} means the ${answer} quarter.`,
          choiceSpec: fixedChoiceSpec(['1st', '2nd', '3rd', '4th']), visualType: 'scoreboard-read',
          visualData: { label: `Q${snap.context.quarter}` },
          initialAriaLabel: `Scoreboard quarter display Q${snap.context.quarter}.`,
          guidedAriaLabel: `Match Q${snap.context.quarter} to its order number.`,
          workedAriaLabel: `Q${snap.context.quarter} is the ${answer} quarter.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'half-read', skill: 'quarter-half-structure', concept: 'quarter-half-structure', purpose: 'coreReview', tier: 'football-context', weight: 0.4, operationType: 'halfFromQuarter', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'football-only' }),
      derive(snap) {
        const quarter = snap.context.quarter;
        const answer = quarter <= 2 ? '1st half' : '2nd half';
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'quarter', '/context/quarter')],
          operationType: 'halfFromQuarter', operandIds: ['quarter'], answer,
          prompt: `The scoreboard shows Q${quarter}. What part of the game is it?`,
          hint: `Split the four quarters into two equal groups in order, then place Q${quarter} in its group.`,
          explanation: `Q1 and Q2 make the 1st half. Q3 and Q4 make the 2nd half. Q${quarter} is in the ${answer}.`,
          choiceSpec: fixedChoiceSpec(['1st half', 'Halftime', '2nd half', 'Final']), visualType: 'quarter-half',
          visualData: { quarter },
          initialAriaLabel: `Scoreboard quarter Q${quarter}; the matching half is hidden.`,
          guidedAriaLabel: `Group Q1 and Q2 together, then Q3 and Q4 together; the half for Q${quarter} remains hidden.`,
          workedAriaLabel: `Q${quarter} is in the ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'next-down', skill: 'football-number-sense', concept: 'down-progression', purpose: 'coreReview', tier: 'football-context', weight: 1.1, operationType: 'ordinal', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'football-only' }),
      derive(snap) {
        const currentDown = snap.context.down;
        const yardsToGo = snap.context.yardsToGo;
        const proposedGain = snap.proposal.appliedGain;
        const resultKind = snap.proposal.resultKind;
        const nextDown = snap.proposal.newDown;
        if (!['advance', 'firstDown'].includes(resultKind)) {
          return { decline: decline('no-next-down', 'Touchdowns and turnovers on downs do not continue to another down for the same possession.') };
        }
        if (!Number.isInteger(nextDown) || nextDown < 1 || nextDown > 4) {
          return { decline: decline('invalid-next-down', 'The projected next down must be first through fourth.') };
        }
        if (nextDown === currentDown) {
          return { decline: decline('next-down-unchanged', 'The projected play does not change the visible down.') };
        }

        const answer = ordinal(nextDown);
        const madeFirstDown = resultKind === 'firstDown';
        const hint = madeFirstDown
          ? `The play gains ${yards(proposedGain)}, enough to reach the ${yards(yardsToGo)} needed. A new set of downs starts.`
          : `The play gains ${yards(proposedGain)}, which is short of the ${yards(yardsToGo)} needed. Move to the down after ${ordinal(currentDown)}.`;
        const explanation = madeFirstDown
          ? `The play gains ${yards(proposedGain)}, enough for the ${yards(yardsToGo)} needed. A new set starts at ${answer} down.`
          : `The play gains ${yards(proposedGain)}, short of the ${yards(yardsToGo)} needed. After ${ordinal(currentDown)} down comes ${answer} down.`;
        return eligible(makeSemantic({
          bindings: [
            contextBinding(snap, 'currentDown', '/context/down'),
            contextBinding(snap, 'yardsToGo', '/context/yardsToGo'),
            contextBinding(snap, 'proposedGain', '/proposal/appliedGain'),
            contextBinding(snap, 'resultKind', '/proposal/resultKind'),
            contextBinding(snap, 'nextDown', '/proposal/newDown'),
          ],
          operationType: 'ordinal', operandIds: ['nextDown'], answer,
          prompt: `On ${ordinal(currentDown)} & ${yardsToGo}, if this play gains ${yards(proposedGain)}, what down would come next?`,
          hint,
          explanation,
          choiceSpec: fixedChoiceSpec(['1st', '2nd', '3rd', '4th']), visualType: 'down-progression',
          visualData: { currentDown, yardsToGo, proposedGain },
          initialAriaLabel: `${ordinal(currentDown)} down and ${yards(yardsToGo)} to go; the play gains ${yards(proposedGain)}; the next down is hidden.`,
          guidedAriaLabel: `${ordinal(currentDown)} down and ${yards(yardsToGo)} to go; compare the ${yards(proposedGain)} gained with the distance needed; the next down remains hidden.`,
          workedAriaLabel: `${ordinal(currentDown)} down and ${yards(yardsToGo)} to go; after a gain of ${yards(proposedGain)}, the next down is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-minus-whole-tens', skill: 'plus-minus-ten', concept: 'field-distance', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 1.9, operationType: 'goalDistanceAfterGain', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 140 }),
      derive(snap, profile) {
        const before = goalDistance(snap);
        const gain = appliedGain(snap);
        if (!(gain >= 10 && gain % 10 === 0 && gain < before && snap.proposal.resultKind !== 'touchdown')) {
          return { decline: decline('not-whole-tens-goal-move', 'This proposal is not a non-touchdown gain of one or more whole tens.') };
        }
        const answer = before - gain;
        if (!inDisplayBand(profile, before, gain, answer)) return { decline: decline('outside-display-band', 'The whole-tens goal-distance relation must stay within 100.') };
        return eligible(makeSemantic({
          bindings: [...goalBindings(snap), contextBinding(snap, 'proposedGain', '/proposal/appliedGain')],
          operationType: 'goalDistanceAfterGain', operandIds: ['ballYardLine', 'goalLine', 'proposedGain'], answer,
          prompt: `The ball is ${yards(before)} from the end zone. If this play gains ${yards(gain)}, how far from the end zone would it be?`,
          hint: `Move back ${gain / 10} full group${gain === 10 ? '' : 's'} of ten from ${before}. The ones digit stays the same.`,
          explanation: `${before} - ${gain} = ${answer}. This play would leave ${yards(answer)} to the end zone.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'base-ten-move',
          visualData: { startDistance: before, wholeTensMoved: gain / 10, direction: -1, resultDistance: null },
          initialAriaLabel: `The ball is ${yards(before)} from the end zone, and this play could gain ${yards(gain)}; the new distance is hidden.`,
          guidedAriaLabel: `Remove ${gain / 10} group${gain === 10 ? '' : 's'} of ten and keep the ones unchanged, without announcing the result yet.`,
          workedAriaLabel: `${before} minus ${gain} is ${yards(answer)} from the end zone.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'drive-distance-plus-whole-tens', skill: 'plus-minus-ten', concept: 'drive-distance', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 1.5, operationType: 'driveDistancePlusGain', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'independent', curriculumSource: 'workbook', introducedOnPage: 140 }),
      derive(snap, profile) {
        const current = Math.abs(snap.context.yardLine - snap.context.driveStart);
        const gain = appliedGain(snap);
        const answer = current + gain;
        if (!(gain >= 10 && gain % 10 === 0)) return { decline: decline('not-whole-tens-drive-move', 'The proposed gain is not one or more whole tens.') };
        if (!inDisplayBand(profile, current, gain, answer)) return { decline: decline('outside-display-band', 'The whole-tens drive relation must stay within 100.') };
        return eligible(makeSemantic({
          bindings: [
            contextBinding(snap, 'driveStart', '/context/driveStart'),
            contextBinding(snap, 'ballYardLine', '/context/yardLine'),
            contextBinding(snap, 'proposedGain', '/proposal/appliedGain'),
          ],
          operationType: 'driveDistancePlusGain', operandIds: ['driveStart', 'ballYardLine', 'proposedGain'], answer,
          prompt: `This drive has moved ${yards(current)}. If this play gains ${yards(gain)}, how many yards would the drive have moved in all?`,
          hint: `Add ${gain / 10} full group${gain === 10 ? '' : 's'} of ten to ${current}.`,
          explanation: `${current} + ${gain} = ${answer}. The drive would have moved ${yards(answer)} in all.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'base-ten-move',
          visualData: { startDistance: current, wholeTensMoved: gain / 10, direction: 1, resultDistance: null },
          initialAriaLabel: `The drive has moved ${yards(current)}, and this play could add ${yards(gain)}; the new total is hidden.`,
          guidedAriaLabel: `Add ${gain / 10} group${gain === 10 ? '' : 's'} of ten to the drive total without announcing the result yet.`,
          workedAriaLabel: `${current} plus ${gain} is ${yards(answer)} of drive movement.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'touchdown-base-points', skill: 'football-number-sense', concept: 'touchdown-base-scoring', purpose: 'coreReview', tier: 'football-context', weight: 0.7, operationType: 'ruleValue', answerExposure: 'hidden-until-worked', evidenceClass: 'independent', curriculumSource: 'football-only' }),
      derive(snap) {
        if (snap.proposal.resultKind !== 'touchdown') return { decline: decline('not-touchdown-proposal', 'The scoring constant is contextual only for a touchdown proposal.', ['/proposal/resultKind']) };
        const answer = RULES['game.touchdownBasePoints'];
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'resultKind', '/proposal/resultKind'), ruleBinding('touchdownBasePoints', 'game.touchdownBasePoints')],
          operationType: 'ruleValue', operandIds: ['touchdownBasePoints'], answer,
          prompt: 'If this play reaches the end zone, how many points is the touchdown itself worth?',
          hint: 'Count only the touchdown. The conversion is a separate play afterward.',
          explanation: `The touchdown itself is worth ${answer} points. A separate conversion play comes next.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'touchdown-rule',
          visualData: { resultKind: 'touchdown', points: null },
          initialAriaLabel: 'A touchdown badge with the touchdown-only point value hidden.',
          guidedAriaLabel: 'Think only about the touchdown before its separate conversion; the point value remains hidden.',
          workedAriaLabel: `The touchdown itself awards ${answer} points.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'conversion-attempt-value', skill: 'football-number-sense', concept: 'conversion-scoring', purpose: 'coreReview', tier: 'football-context', weight: 1.4, operationType: 'conversionValue', answerExposure: 'hidden-until-worked', evidenceClass: 'literacy', curriculumSource: 'football-only', playType: 'conversion' }),
      derive(play) {
        const c = play.context;
        const teamRole = c.possession === 'offense' ? 'player' : 'opponent';
        const labels = publicTeamLabels(play);
        const team = labels[teamRole];
        const scorePath = teamRole === 'player' ? '/context/scores/player' : '/context/scores/opponent';
        const attemptName = c.attemptType === 'pat' ? 'PAT' : 'two-point try';
        const answer = c.attemptValue;
        return eligible(makeSemantic({
          bindings: [
            contextBinding(play, 'possessingTeamScore', scorePath),
            contextBinding(play, 'attemptType', '/context/attemptType'),
            contextBinding(play, 'attemptValue', '/context/attemptValue'),
          ],
          operationType: 'conversionValue', operandIds: ['attemptType'], answer,
          prompt: `${team} has ${c.scores[teamRole]} points and chose a ${attemptName}. How many points is this try worth if it succeeds?`,
          hint: c.attemptType === 'pat' ? 'A PAT adds one point after a touchdown.' : 'A two-point try can add two points after a touchdown.',
          explanation: `A ${attemptName} is worth ${answer} ${answer === 1 ? 'point' : 'points'} if it succeeds.`,
          choiceSpec: numericChoiceSpec(0, 6), visualType: 'conversion-value',
          visualData: { team, teamRole, score: c.scores[teamRole], attemptType: c.attemptType },
          initialAriaLabel: `${team} score ${c.scores[teamRole]}; ${attemptName} value hidden.`,
          guidedAriaLabel: `${attemptName} after a touchdown; its point value remains hidden.`,
          workedAriaLabel: `${attemptName} is worth ${answer} ${answer === 1 ? 'point' : 'points'}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'conversion-try-marker', skill: 'football-number-sense', concept: 'conversion-placement', purpose: 'coreReview', tier: 'football-context', weight: 1, operationType: 'tryMarkerForDirection', answerExposure: 'modeled-with-result-hidden', evidenceClass: 'literacy', curriculumSource: 'football-only', playType: 'conversion' }),
      derive(play) {
        const c = play.context;
        const answer = c.tryYardLine;
        return eligible(makeSemantic({
          bindings: [
            contextBinding(play, 'direction', '/context/direction'),
            contextBinding(play, 'tryYardLine', '/context/tryYardLine'),
          ],
          operationType: 'tryMarkerForDirection', operandIds: ['direction'], answer,
          prompt: `The offense is moving ${c.direction === 1 ? 'toward the 100 end' : 'toward the 0 end'}. At which field marker is this conversion tried?`,
          hint: `A conversion is tried two yards from the ${c.direction === 1 ? '100' : '0'} end.`,
          explanation: `Two yards from the ${c.direction === 1 ? '100' : '0'} end is field marker ${answer}.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'conversion-marker',
          visualData: { direction: c.direction, goalLine: c.direction === 1 ? 100 : 0 },
          initialAriaLabel: `Conversion direction ${c.direction === 1 ? 'toward 100' : 'toward 0'}; try marker hidden.`,
          guidedAriaLabel: `Move two yards back from the ${c.direction === 1 ? '100' : '0'} end; the marker remains hidden.`,
          workedAriaLabel: `The conversion marker is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'field-goal-attempt-distance', skill: 'football-number-sense', concept: 'field-goal-distance', purpose: 'coreReview', tier: 'football-context', weight: 1.5, operationType: 'read', answerExposure: 'source-visible', evidenceClass: 'literacy', curriculumSource: 'football-only', playType: 'fieldGoal' }),
      derive(play) {
        const c = play.context;
        const answer = c.attemptDistance;
        return eligible(makeSemantic({
          bindings: [
            contextBinding(play, 'attemptDistance', '/context/attemptDistance'),
          ],
          operationType: 'read', operandIds: ['attemptDistance'], answer,
          prompt: `The kick card shows a ${answer}-yard field goal. How long is this field-goal try?`,
          hint: 'Read the field-goal distance on the kick card.',
          explanation: `The kick card says ${answer} yards, so this is a ${answer}-yard field-goal try.`,
          choiceSpec: numericChoiceSpec(18, 57), visualType: 'field-goal-distance',
          visualData: { attemptDistance: answer },
          initialAriaLabel: `Kick card says ${answer}-yard field goal.`,
          guidedAriaLabel: `Read ${answer} yards on the kick card.`,
          workedAriaLabel: `The field-goal attempt is ${answer} yards.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'field-goal-point-value', skill: 'football-number-sense', concept: 'field-goal-scoring', purpose: 'coreReview', tier: 'football-context', weight: 1, operationType: 'ruleValue', answerExposure: 'hidden-until-worked', evidenceClass: 'literacy', curriculumSource: 'football-only', playType: 'fieldGoal' }),
      derive(play) {
        const c = play.context;
        const teamRole = c.possession === 'offense' ? 'player' : 'opponent';
        const labels = publicTeamLabels(play);
        const team = labels[teamRole];
        const scorePath = teamRole === 'player' ? '/context/scores/player' : '/context/scores/opponent';
        const answer = RULES['game.fieldGoalPoints'];
        return eligible(makeSemantic({
          bindings: [
            contextBinding(play, 'possessingTeamScore', scorePath),
            contextBinding(play, 'attemptDistance', '/context/attemptDistance'),
            ruleBinding('fieldGoalPoints', 'game.fieldGoalPoints'),
          ],
          operationType: 'ruleValue', operandIds: ['fieldGoalPoints'], answer,
          prompt: `${team} has ${c.scores[teamRole]} points and is trying a ${c.attemptDistance}-yard field goal. How many points is a made field goal worth?`,
          hint: 'Use the field-goal scoring rule, not the current scoreboard total.',
          explanation: `A made field goal is worth ${answer} points.`,
          choiceSpec: numericChoiceSpec(0, 6), visualType: 'field-goal-value',
          visualData: { team, teamRole, score: c.scores[teamRole], attemptDistance: c.attemptDistance },
          initialAriaLabel: `${team} score ${c.scores[teamRole]}; field-goal point value hidden.`,
          guidedAriaLabel: 'Think of the fixed field-goal scoring rule; the value remains hidden.',
          workedAriaLabel: `A made field goal awards ${answer} points.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'punt-travel-distance', skill: 'football-number-sense', concept: 'punt-distance', purpose: 'coreReview', tier: 'football-context', weight: 1.5, operationType: 'read', answerExposure: 'source-visible', evidenceClass: 'literacy', curriculumSource: 'football-only', playType: 'punt' }),
      derive(play) {
        const p = play.proposal;
        const answer = p.appliedTravelYards;
        return eligible(makeSemantic({
          bindings: [
            contextBinding(play, 'direction', '/context/direction'),
            contextBinding(play, 'puntStartYardLine', '/proposal/startYardLine'),
            contextBinding(play, 'rawLandingYardLine', '/proposal/rawLandingYardLine'),
            contextBinding(play, 'appliedTravelYards', '/proposal/appliedTravelYards'),
          ],
          operationType: 'read', operandIds: ['appliedTravelYards'], answer,
          prompt: `The punt preview shows ${answer} ${answer === 1 ? 'yard' : 'yards'} of travel from field marker ${p.startYardLine}. How far does the ball travel?`,
          hint: 'Read the travel distance on the punt preview.',
          explanation: `The punt preview says ${answer} ${answer === 1 ? 'yard' : 'yards'}, so the ball travels ${answer} ${answer === 1 ? 'yard' : 'yards'}.`,
          choiceSpec: numericChoiceSpec(0, 50), visualType: 'punt-travel',
          visualData: { startYardLine: p.startYardLine, rawLandingYardLine: p.rawLandingYardLine, direction: p.direction, travelYards: answer },
          initialAriaLabel: `Punt preview from marker ${p.startYardLine} shows ${answer} ${answer === 1 ? 'yard' : 'yards'} of travel.`,
          guidedAriaLabel: `Read ${answer} ${answer === 1 ? 'yard' : 'yards'} on the punt preview.`,
          workedAriaLabel: `The punt travels ${answer} ${answer === 1 ? 'yard' : 'yards'}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'punt-landing-spot', skill: 'football-number-sense', concept: 'punt-placement', purpose: 'coreReview', tier: 'football-context', weight: 1, operationType: 'read', answerExposure: 'source-visible', evidenceClass: 'literacy', curriculumSource: 'football-only', playType: 'punt' }),
      derive(play) {
        const p = play.proposal;
        if (p.resultKind === 'puntTouchback') {
          return { decline: decline('punt-touchback-placement', 'Touchbacks use a receiving reset rather than a direct directional move.') };
        }
        if (p.landingYardLine !== p.rawLandingYardLine) {
          return { decline: decline('punt-capped-placement', 'A receiver-favorable cap is a receiving placement, not a direct kick landing.') };
        }
        const answer = p.landingYardLine;
        return eligible(makeSemantic({
          bindings: [
            contextBinding(play, 'puntStartYardLine', '/proposal/startYardLine'),
            contextBinding(play, 'direction', '/context/direction'),
            contextBinding(play, 'appliedTravelYards', '/proposal/appliedTravelYards'),
            contextBinding(play, 'landingYardLine', '/proposal/landingYardLine'),
          ],
          operationType: 'read', operandIds: ['landingYardLine'], answer,
          prompt: `The punt preview points ${p.direction === 1 ? 'toward 100' : 'toward 0'} and marks field marker ${answer}. At which marker does the punt land?`,
          hint: 'Read the marked landing spot on the punt preview.',
          explanation: `The punt preview marks field marker ${answer}, so the punt lands there.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'punt-landing',
          visualData: { startYardLine: p.startYardLine, travelYards: p.appliedTravelYards, direction: p.direction, landingYardLine: answer },
          initialAriaLabel: `Punt preview points ${p.direction === 1 ? 'toward 100' : 'toward 0'} and marks landing spot ${answer}.`,
          guidedAriaLabel: `Read landing marker ${answer} on the punt preview.`,
          workedAriaLabel: `The punt lands at field marker ${answer}.`,
        }));
      },
    },
  ];

  // Film Room copy is authored by family so the UI can render a stable,
  // play-grounded review without reconstructing teaching language from live
  // state. The two worked steps reuse each family's guided hint and worked
  // explanation; the surrounding goal and football meaning make that model
  // useful without adding another source of numeric truth.
  const WORKED_REVIEW_SPECS = deepFreeze({
    'yards-to-go-read': {
      title: 'Read the Distance',
      goal: 'Find the yards needed on the scoreboard.',
      footballMeaning: 'That number tells the offense how far it must go for a new set of downs.',
    },
    'line-to-gain-missing-part': {
      title: 'Find What Is Left',
      goal: 'Split the needed yards into the play gain and the yards still missing.',
      footballMeaning: 'The missing part shows how far the offense would remain from the first-down marker.',
    },
    'line-to-gain-exact': {
      title: 'Reach the Marker',
      goal: 'Match the play gain to every yard needed.',
      footballMeaning: 'When no yards are left, the play reaches the first-down marker exactly.',
    },
    'line-to-gain-surplus': {
      title: 'Count Past the Marker',
      goal: 'Use the needed yards first, then count the gain left over.',
      footballMeaning: 'The leftover yards show how far the play would finish beyond the first-down marker.',
    },
    'line-to-gain-fact-family': {
      title: 'Use the Fact Family',
      goal: 'Use the total yards needed and the known gain to find the missing part.',
      footballMeaning: 'The linked addition and subtraction facts show the yards still needed.',
    },
    'gain-vs-needed-comparison': {
      title: 'Compare Play and Need',
      goal: 'Compare the play gain with the yards needed.',
      footballMeaning: 'The comparison shows whether the play falls short, reaches, or passes the marker.',
    },
    'goal-distance-read': {
      title: 'Read the Goal Distance',
      goal: 'Read the labeled distance between the ball and the goal.',
      footballMeaning: 'That distance shows how far the offense is from the end zone.',
    },
    'goal-distance-tens': {
      title: 'Find the Tens Digit',
      goal: 'Break the goal distance into tens and ones.',
      footballMeaning: 'The tens digit counts full groups of ten yards between the ball and the goal.',
    },
    'goal-distance-ones': {
      title: 'Find the Ones Digit',
      goal: 'Break the goal distance into tens and ones.',
      footballMeaning: 'The ones digit counts the extra yards after the full groups of ten.',
    },
    'team-yards-past-100': {
      title: 'Count Past 100',
      goal: 'Add the play gain to the team yard total.',
      footballMeaning: 'The new total tracks how many offensive yards the team would have.',
    },
    'drive-distance-scaffolded': {
      title: 'Count the Drive',
      goal: 'Find the distance between the drive start and the current ball spot.',
      footballMeaning: 'That distance tells how far the offense has moved on this drive.',
    },
    'committed-score-total': {
      title: 'Add the Scores',
      goal: 'Join the two scoreboard amounts to find the total points.',
      footballMeaning: 'The sum counts all points already scored by both teams.',
    },
    'committed-score-difference': {
      title: 'Find the Score Gap',
      goal: 'Compare the two scoreboard amounts and find the difference.',
      footballMeaning: 'The difference shows how many points separate the teams.',
    },
    'committed-score-tens': {
      title: 'Read Score Tens',
      goal: 'Break the scoreboard number into tens and ones.',
      footballMeaning: 'The tens digit counts full groups of ten points in that score.',
    },
    'committed-score-ones': {
      title: 'Read Score Ones',
      goal: 'Break the scoreboard number into tens and ones.',
      footballMeaning: 'The ones digit counts the points after the full groups of ten.',
    },
    'quarter-read': {
      title: 'Read the Quarter',
      goal: 'Read the quarter number shown on the scoreboard.',
      footballMeaning: 'The quarter tells which part of the game is being played.',
    },
    'half-read': {
      title: 'Find the Half',
      goal: 'Use the quarter number to decide whether the game is in the first or second half.',
      footballMeaning: 'Quarters one and two make the first half; quarters three and four make the second.',
    },
    'next-down': {
      title: 'Find the Next Down',
      goal: 'Compare the play gain with the yards needed, then follow the down rule.',
      footballMeaning: 'Reaching the marker resets the offense to first down; falling short advances the down.',
    },
    'goal-distance-minus-whole-tens': {
      title: 'Move Closer by Tens',
      goal: 'Subtract the whole-tens gain from the distance to the goal.',
      footballMeaning: 'The result shows how many yards would remain between the ball and the end zone.',
    },
    'drive-distance-plus-whole-tens': {
      title: 'Grow the Drive by Tens',
      goal: 'Add the whole-tens gain to the drive distance.',
      footballMeaning: 'The result shows how far the drive would have moved after the play.',
    },
    'touchdown-base-points': {
      title: 'Use the Touchdown Rule',
      goal: 'Recall the fixed point value of a touchdown before any conversion try.',
      footballMeaning: 'Those points are added when the ball reaches the end zone for a touchdown.',
    },
    'conversion-attempt-value': {
      title: 'Value the Conversion',
      goal: 'Use the selected conversion type to find its point value.',
      footballMeaning: 'A made conversion adds that many points after the touchdown.',
    },
    'conversion-try-marker': {
      title: 'Place the Conversion Try',
      goal: 'Use the offense direction to find the conversion marker.',
      footballMeaning: 'That marker is where the conversion play begins on this field.',
    },
    'field-goal-attempt-distance': {
      title: 'Read the Kick Distance',
      goal: 'Read the labeled distance of the field-goal attempt.',
      footballMeaning: 'That number tells how far the kick must travel for the attempt.',
    },
    'field-goal-point-value': {
      title: 'Use the Field-Goal Rule',
      goal: 'Recall the fixed point value of a made field goal.',
      footballMeaning: 'A successful field goal adds that many points to the kicking team score.',
    },
    'punt-travel-distance': {
      title: 'Read the Punt Distance',
      goal: 'Read the labeled travel distance on the punt preview.',
      footballMeaning: 'That distance shows how far the ball moves before the next possession.',
    },
    'punt-landing-spot': {
      title: 'Read the Landing Spot',
      goal: 'Follow the punt direction and read its marked landing position.',
      footballMeaning: 'The landing marker helps set the other team starting field position.',
    },
  });

  const FAMILY_BY_ID = new Map(FAMILY_DEFINITIONS.map((definition) => [definition.meta.familyId, definition]));
  if (FAMILY_BY_ID.size !== FAMILY_DEFINITIONS.length) throw new Error('Contextual family IDs must be unique.');
  for (const familyId of FAMILY_BY_ID.keys()) {
    if (!Object.prototype.hasOwnProperty.call(WORKED_REVIEW_SPECS, familyId)) {
      throw new Error(`Contextual family ${familyId} needs an authored worked review.`);
    }
  }
  for (const familyId of Object.keys(WORKED_REVIEW_SPECS)) {
    if (!FAMILY_BY_ID.has(familyId)) throw new Error(`Worked review references unknown family ${familyId}.`);
  }
  const FAMILY_REGISTRY = deepFreeze(Object.fromEntries(PLAY_TYPES.map((playType) => [
    playType,
    FAMILY_DEFINITIONS
      .filter((definition) => definition.meta.playType === playType)
      .map((definition) => ({ ...definition.meta })),
  ])));

  for (const familyIds of Object.values(CALL_AFFINITIES)) {
    for (const familyId of familyIds) {
      if (!FAMILY_BY_ID.has(familyId)) throw new Error(`Call affinity references unknown family ${familyId}.`);
      if (FAMILY_BY_ID.get(familyId).meta.playType !== 'scrimmage') {
        throw new Error(`Call affinity references non-scrimmage family ${familyId}.`);
      }
    }
  }

  function selectionFor(source, familyId) {
    const role = source?.context?.possession;
    if (sourcePlayType(source) !== 'scrimmage') {
      return deepFreeze({
        strategy: 'play-type-neutral-v1',
        role: role === 'offense' || role === 'defense' ? role : null,
        selectedCallId: null,
        multiplier: 1,
      });
    }
    const callKey = role === 'offense'
      ? source?.context?.calls?.offense
      : role === 'defense'
        ? source?.context?.calls?.defense
        : null;
    const selectedCallId = typeof callKey === 'string' ? `${role}:${callKey}` : null;
    const multiplier = selectedCallId && CALL_AFFINITIES[selectedCallId]?.includes(familyId)
      ? CALL_AFFINITY_MULTIPLIER
      : 1;
    return deepFreeze({
      strategy: 'selected-call-affinity-v1',
      role: role === 'offense' || role === 'defense' ? role : null,
      selectedCallId: CALL_AFFINITIES[selectedCallId] ? selectedCallId : null,
      multiplier,
    });
  }

  function inspect(source, profileInput = DEFAULT_PROFILE) {
    const profile = normalizeProfile(profileInput);
    const playType = sourcePlayType(source);
    const commonReason = sourceShapeReason(source);
    const eligibleCandidates = [];
    const declined = [];

    for (const definition of FAMILY_DEFINITIONS) {
      const meta = definition.meta;
      if (playType && meta.playType !== playType) continue;
      let reason = commonReason;
      let result = null;
      if (!reason && meta.curriculumSource === 'workbook' && meta.introducedOnPage > profile.includedThroughPage) {
        reason = decline('curriculum-not-included', `Family comes from page ${meta.introducedOnPage}, but the approved question ceiling is page ${profile.includedThroughPage}.`);
      }
      if (!reason) {
        try {
          result = definition.derive(source, profile);
          reason = result.decline || null;
          if (!reason && !result.semantic) reason = decline('invalid-family-result', 'Family returned neither a semantic candidate nor a decline.');
        } catch (error) {
          reason = decline(error.code || 'family-inspection-failed', error.message || 'Family inspection failed.');
        }
      }

      if (reason) {
        declined.push({ familyId: meta.familyId, reason });
      } else {
        eligibleCandidates.push({ ...meta });
      }
    }

    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      playType,
      profile,
      eligible: eligibleCandidates,
      declined,
    });
  }

  function stableValueToken(value) {
    if (typeof value === 'number') return `n-${String(value).replace('-', 'minus-').replace('.', '-point-')}`;
    return `s-${Array.from(String(value)).map((character) => character.codePointAt(0).toString(16)).join('-')}`;
  }

  function sameValue(left, right) {
    return typeof left === typeof right && Object.is(left, right);
  }

  function choiceAriaLabel(value) {
    if (value === '<') return 'less than';
    if (value === '>') return 'greater than';
    if (value === '=') return 'equal to';
    return String(value);
  }

  function numericDistractors(answer, spec) {
    const min = spec.min;
    const max = spec.max;
    const values = [answer];
    const preferred = [answer - 1, answer + 1, answer - 2, answer + 2, answer - 10, answer + 10, min, max];
    for (const value of preferred) {
      if (values.length >= spec.count) break;
      if (Number.isInteger(value) && value >= min && value <= max && !values.some((current) => sameValue(current, value))) values.push(value);
    }
    for (let value = min; values.length < spec.count && value <= max; value++) {
      if (!values.some((current) => sameValue(current, value))) values.push(value);
    }
    return values;
  }

  function choiceValues(answer, spec) {
    const values = spec.type === 'fixed' ? [...spec.values] : numericDistractors(answer, spec);
    if (!values.some((value) => sameValue(value, answer))) values.unshift(answer);
    return values.filter((value, index, all) => all.findIndex((candidate) => sameValue(candidate, value)) === index);
  }

  function shuffled(values, rng) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
      const draw = Number(rng());
      if (!Number.isFinite(draw)) throw contractError('invalid-presentation-rng', 'Presentation RNG must return a finite number.');
      const normalized = Math.max(0, Math.min(0.9999999999999999, draw));
      const swapIndex = Math.floor(normalized * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function normalizeSupport(value) {
    if (value === 'worked') return 'worked';
    if (value === 'guided') return 'guided';
    return 'initial';
  }

  function makeVisuals(meta, semantic, answerId) {
    const bindingIds = semantic.bindings.map((binding) => binding.id);
    const visibleAtSource = meta.answerExposure === 'source-visible';
    const stage = (name) => {
      const revealsAnswer = name === 'worked' || visibleAtSource;
      const data = clone(semantic.visualData);
      if (!revealsAnswer && ['base-ten-distance', 'base-ten-score'].includes(semantic.visualType)) {
        if (data.targetPlace === 'tens') data.tens = null;
        if (data.targetPlace === 'ones') data.ones = null;
      }
      return {
        stage: name,
        type: semantic.visualType,
        bindingIds,
        answerId,
        data,
        result: revealsAnswer ? { answerId, value: clone(semantic.answer) } : null,
        revealsAnswer,
        ariaLabel: semantic.visualAriaLabels[name],
      };
    };
    const visuals = { initial: stage('initial'), guided: stage('guided'), worked: stage('worked') };
    if (meta.evidenceClass === 'independent') {
      for (const stageName of ['initial', 'guided']) {
        const visual = visuals[stageName];
        if (visual.revealsAnswer || visual.result !== null) {
          throw contractError('invalid-evidence-class', `${meta.familyId} exposes an answer before independent work is resolved.`);
        }
      }
    }
    return visuals;
  }

  function groundedCopy(text, ariaLabel, bindingIds, answerId) {
    return { text, ariaLabel: ariaLabel || text.replace(/\n/g, ' '), bindingIds: [...bindingIds], answerId };
  }

  function makeWorkedReview(meta, semantic, bindingIds, answerId) {
    const spec = WORKED_REVIEW_SPECS[meta.familyId];
    return {
      familyId: meta.familyId,
      concept: meta.concept,
      title: spec.title,
      goal: groundedCopy(spec.goal, spec.goal, bindingIds, answerId),
      steps: [
        {
          id: `${meta.familyId}--review-step-1`,
          ...groundedCopy(semantic.hint, semantic.hint, bindingIds, answerId),
        },
        {
          id: `${meta.familyId}--review-step-2`,
          ...groundedCopy(semantic.explanation, semantic.explanation, bindingIds, answerId),
        },
      ],
      footballMeaning: groundedCopy(spec.footballMeaning, spec.footballMeaning, bindingIds, answerId),
    };
  }

  function build(source, familyId, options = {}) {
    const definition = FAMILY_BY_ID.get(familyId);
    if (!definition) throw contractError('unknown-family', `Unknown contextual question family ${familyId}.`);
    const commonReason = sourceShapeReason(source);
    if (commonReason) throw contractError(commonReason.code, commonReason.detail);
    const playType = sourcePlayType(source);
    if (definition.meta.playType !== playType) {
      throw contractError('family-play-type-mismatch', `${familyId} belongs to ${definition.meta.playType}, not ${playType}.`);
    }

    const profile = normalizeProfile(options.profile || DEFAULT_PROFILE);
    if (definition.meta.curriculumSource === 'workbook' && definition.meta.introducedOnPage > profile.includedThroughPage) {
      throw contractError('curriculum-not-included', `${familyId} comes from page ${definition.meta.introducedOnPage}, beyond the approved question ceiling of page ${profile.includedThroughPage}.`);
    }

    const result = definition.derive(source, profile);
    if (result.decline || !result.semantic) {
      const reason = result.decline || decline('invalid-family-result', 'Family did not produce a semantic question.');
      throw contractError('family-not-eligible', `${familyId}: ${reason.code}: ${reason.detail}`);
    }

    const meta = definition.meta;
    const semantic = result.semantic;
    const bindingIds = semantic.bindings.map((binding) => binding.id);
    const answerId = `${familyId}--answer`;
    const values = choiceValues(semantic.answer, semantic.choiceSpec);
    const presentationRng = typeof options.presentationRng === 'function' ? options.presentationRng : () => 0.5;
    const choices = shuffled(values, presentationRng).map((value) => ({
      id: `${familyId}--choice-${stableValueToken(value)}`,
      value,
      label: String(value),
      ariaLabel: choiceAriaLabel(value),
    }));
    const correctChoice = choices.find((choice) => sameValue(choice.value, semantic.answer));
    if (!correctChoice || choices.filter((choice) => sameValue(choice.value, semantic.answer)).length !== 1) {
      throw contractError('invalid-choices', `Family ${familyId} did not produce exactly one correct choice.`);
    }

    const bindings = semantic.bindings.map(clone);
    const visuals = makeVisuals(meta, semantic, answerId);
    const support = normalizeSupport(options.support);
    const prompt = groundedCopy(semantic.prompt, semantic.promptAriaLabel, bindingIds, answerId);
    const hint = groundedCopy(semantic.hint, semantic.hint, bindingIds, answerId);
    const workedExplanation = groundedCopy(semantic.explanation, semantic.explanation, bindingIds, answerId);
    const workedReview = makeWorkedReview(meta, semantic, bindingIds, answerId);
    const answer = { id: answerId, value: clone(semantic.answer), label: String(semantic.answer) };
    const question = {
      schemaVersion: SCHEMA_VERSION,
      ...meta,
      bindings,
      premises: bindings,
      operation: { ...semantic.operation, outputId: answerId },
      answer,
      result: answer,
      choices,
      correctChoiceId: correctChoice.id,
      answerExposure: meta.answerExposure,
      prompt,
      hint,
      workedExplanation,
      workedReview,
      q: prompt.text,
      hintText: hint.text,
      explain: workedExplanation.text,
      visuals,
      support,
      math: { ...visuals[support], support },
      grounding: { bindingIds, answerId },
      selection: selectionFor(source, familyId),
    };
    const frozen = deepFreeze(question);
    // Preserve an intentional alias so consumers cannot let premises and
    // telemetry bindings drift into different facts.
    if (frozen.bindings !== frozen.premises) throw contractError('binding-alias-broken', 'Bindings and premises must be the same frozen array.');
    return frozen;
  }

  return deepFreeze({
    SCHEMA_VERSION,
    CURRENT_COMPLETED_PAGE,
    INCLUDED_THROUGH_PAGE,
    PLAY_TYPES,
    DEFAULT_PROFILE,
    OPERATION_TYPES,
    ANSWER_EXPOSURE_POLICIES,
    EVIDENCE_CLASSES,
    CURRICULUM_SOURCES,
    RULES,
    SPECIAL_BINDING_PATHS,
    FAMILY_REGISTRY,
    CALL_AFFINITY_MULTIPLIER,
    CALL_AFFINITIES,
    selectionFor,
    inspect,
    build,
  });
})();

if (typeof globalThis !== 'undefined') {
  globalThis.FOOTBALL_CONTEXTUAL_QUESTIONS = FOOTBALL_CONTEXTUAL_QUESTIONS;
}
