(function attachFootballDomain(root) {
  'use strict';

  const RESULT_KINDS = Object.freeze([
    'touchdown',
    'firstDown',
    'turnoverOnDowns',
    'turnover',
    'advance',
  ]);

  const PROJECTION_KEYS = Object.freeze([
    'contextId',
    'requestedGain',
    'appliedGain',
    'startYardLine',
    'endYardLine',
    'direction',
    'possession',
    'oldDown',
    'newDown',
    'oldYardsToGo',
    'newYardsToGo',
    'oldFirstDownLine',
    'newFirstDownLine',
    'resultKind',
    'resultReason',
    'crossedMidfield',
    'driveTotal',
    'distanceToGoalBefore',
    'distanceToGoalAfter',
  ]);

  const PLAY_TYPES = Object.freeze(['scrimmage', 'punt', 'fieldGoal', 'conversion']);
  const MATCH_KEYS = Object.freeze(['schemaVersion', 'player', 'opponent']);
  const TEAM_IDENTITY_KEYS = Object.freeze(['id', 'displayName', 'shortName', 'endZoneName']);
  const PUNT_CONTEXT_KEYS = Object.freeze([
    'schemaVersion', 'playType', 'contextId', 'match', 'possession', 'direction',
    'quarter', 'yardLine', 'scores',
  ]);
  const FIELD_GOAL_CONTEXT_KEYS = Object.freeze([
    'schemaVersion', 'playType', 'contextId', 'match', 'possession', 'direction',
    'quarter', 'yardLine', 'attemptDistance', 'scores',
  ]);
  const CONVERSION_CONTEXT_KEYS = Object.freeze([
    'schemaVersion', 'playType', 'contextId', 'match', 'possession', 'direction',
    'quarter', 'tryYardLine', 'attemptType', 'attemptValue', 'scores',
  ]);
  const SPECIAL_CONTEXT_KEYS = Object.freeze({
    punt: PUNT_CONTEXT_KEYS,
    fieldGoal: FIELD_GOAL_CONTEXT_KEYS,
    conversion: CONVERSION_CONTEXT_KEYS,
  });
  const PUNT_PROJECTION_KEYS = Object.freeze([
    'contextId', 'playType', 'possession', 'direction', 'startYardLine',
    'mode', 'requestedTravelYards', 'appliedTravelYards', 'rawLandingYardLine',
    'landingYardLine', 'resultKind', 'nextPossession', 'nextStartYardLine',
    'restartReason',
  ]);
  const FIELD_GOAL_PROJECTION_KEYS = Object.freeze([
    'contextId', 'playType', 'possession', 'direction', 'startYardLine',
    'attemptDistance', 'made', 'resultKind', 'points', 'nextPossession',
    'nextStartYardLine', 'restartReason',
  ]);
  const CONVERSION_PROJECTION_KEYS = Object.freeze([
    'contextId', 'playType', 'possession', 'direction', 'tryYardLine',
    'attemptType', 'attemptValue', 'made', 'resultKind', 'points',
    'nextPossession', 'nextStartYardLine', 'restartReason',
  ]);
  const SPECIAL_PROJECTION_KEYS = Object.freeze({
    punt: PUNT_PROJECTION_KEYS,
    fieldGoal: FIELD_GOAL_PROJECTION_KEYS,
    conversion: CONVERSION_PROJECTION_KEYS,
  });

  function isRecord(value) {
    return value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.prototype.toString.call(value) === '[object Object]';
  }

  function defineValue(target, key, value) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;

    const references = seen || new WeakMap();
    if (references.has(value)) return references.get(value);

    if (Array.isArray(value)) {
      const copy = [];
      references.set(value, copy);
      for (const item of value) copy.push(clone(item, references));
      return copy;
    }

    if (!isRecord(value)) {
      throw new FootballDomainError('UNSUPPORTED_VALUE', [{
        code: 'UNSUPPORTED_VALUE',
        path: '/',
        message: 'Football domain values must contain only primitives, arrays, and plain objects.',
      }]);
    }

    const copy = {};
    references.set(value, copy);
    for (const key of Object.keys(value)) defineValue(copy, key, clone(value[key], references));
    return copy;
  }

  function deepFreeze(value, seen) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    const references = seen || new WeakSet();
    if (references.has(value)) return value;
    references.add(value);
    for (const key of Object.keys(value)) deepFreeze(value[key], references);
    return Object.freeze(value);
  }

  function immutable(value) {
    return deepFreeze(clone(value));
  }

  class FootballDomainError extends Error {
    constructor(code, diagnostics) {
      const safeDiagnostics = Array.isArray(diagnostics) && diagnostics.length
        ? diagnostics
        : [{ code, path: '/', message: 'Football domain validation failed.' }];
      super(safeDiagnostics.map((item) => `${item.path}: ${item.message}`).join('; '));
      this.name = 'FootballDomainError';
      this.code = code;
      this.diagnostics = immutable(safeDiagnostics);
    }

    toJSON() {
      return {
        name: this.name,
        code: this.code,
        message: this.message,
        diagnostics: this.diagnostics,
      };
    }
  }

  function diagnostic(code, path, message, expected, actual) {
    const item = { code, path, message };
    if (arguments.length >= 4) item.expected = expected;
    if (arguments.length >= 5) item.actual = actual;
    return item;
  }

  function firstDefined() {
    for (const value of arguments) {
      if (value !== undefined) return value;
    }
    return undefined;
  }

  function integerDiagnostic(value, path, min, max, diagnostics) {
    if (!Number.isInteger(value) || value < min || value > max) {
      diagnostics.push(diagnostic(
        'OUT_OF_RANGE_INTEGER',
        path,
        `Expected an integer from ${min} through ${max}.`,
        { integer: true, min, max },
        value,
      ));
      return false;
    }
    return true;
  }

  function nullableString(value, path, diagnostics) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.trim() === '') {
      diagnostics.push(diagnostic(
        'INVALID_STRING',
        path,
        'Expected a non-empty string or null.',
        'non-empty string or null',
        value,
      ));
      return null;
    }
    return value;
  }

  function boundedString(value, path, min, max, diagnostics) {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
      diagnostics.push(diagnostic(
        'INVALID_STRING',
        path,
        `Expected a string from ${min} through ${max} characters.`,
      ));
      return null;
    }
    return value;
  }

  function inspectTeamIdentity(input, path, diagnostics) {
    if (!isRecord(input)) {
      diagnostics.push(diagnostic('INVALID_MATCH_TEAM', path, 'Expected a public team identity object.'));
      return { id: null, displayName: null, shortName: null, endZoneName: null };
    }
    diagnostics.push(...exactKeyDiagnostics(input, TEAM_IDENTITY_KEYS, path));
    return {
      id: boundedString(input.id, `${path}/id`, 1, 32, diagnostics),
      displayName: boundedString(input.displayName, `${path}/displayName`, 1, 32, diagnostics),
      shortName: boundedString(input.shortName, `${path}/shortName`, 1, 16, diagnostics),
      endZoneName: boundedString(input.endZoneName, `${path}/endZoneName`, 1, 16, diagnostics),
    };
  }

  function inspectMatch(input, diagnostics) {
    if (!isRecord(input)) {
      diagnostics.push(diagnostic('INVALID_MATCH', '/match', 'Expected one public match descriptor.'));
      return {
        schemaVersion: null,
        player: inspectTeamIdentity(null, '/match/player', diagnostics),
        opponent: inspectTeamIdentity(null, '/match/opponent', diagnostics),
      };
    }
    diagnostics.push(...exactKeyDiagnostics(input, MATCH_KEYS, '/match'));
    if (input.schemaVersion !== 1) {
      diagnostics.push(diagnostic(
        'INVALID_MATCH_SCHEMA',
        '/match/schemaVersion',
        'Match schema version must be 1.',
      ));
    }
    return {
      schemaVersion: input.schemaVersion,
      player: inspectTeamIdentity(input.player, '/match/player', diagnostics),
      opponent: inspectTeamIdentity(input.opponent, '/match/opponent', diagnostics),
    };
  }

  function inspectContext(input) {
    const diagnostics = [];
    if (!isRecord(input)) {
      return {
        diagnostics: [diagnostic('INVALID_CONTEXT', '/', 'Expected a context object.', 'object', input)],
        value: null,
      };
    }

    const match = inspectMatch(input.match, diagnostics);
    let catalogRival = null;
    if (match.opponent.id !== null) {
      try {
        catalogRival = FOOTBALL_OPPONENT.resolveRival(match.opponent.id);
      } catch (error) {
        diagnostics.push(diagnostic(
          'UNKNOWN_MATCH_OPPONENT',
          '/match/opponent/id',
          'Public match opponent ID must name one frozen rival catalog identity.',
        ));
      }
    }
    const possession = input.possession;
    if (possession !== 'offense' && possession !== 'defense') {
      diagnostics.push(diagnostic(
        'INVALID_POSSESSION',
        '/possession',
        'Possession must be offense or defense.',
        ['offense', 'defense'],
        possession,
      ));
    }

    const expectedDirection = possession === 'offense' ? 1 : possession === 'defense' ? -1 : null;
    const direction = firstDefined(input.direction, expectedDirection);
    if (direction !== 1 && direction !== -1) {
      diagnostics.push(diagnostic(
        'INVALID_DIRECTION',
        '/direction',
        'Direction must be 1 or -1.',
        [1, -1],
        direction,
      ));
    } else if (expectedDirection !== null && direction !== expectedDirection) {
      diagnostics.push(diagnostic(
        'CONTRADICTORY_DIRECTION',
        '/direction',
        'Direction contradicts possession in this football game.',
        expectedDirection,
        direction,
      ));
    }

    const contextId = input.contextId;
    if (!((Number.isInteger(contextId) && contextId >= 1)
      || (typeof contextId === 'string' && contextId.trim() !== ''))) {
      diagnostics.push(diagnostic(
        'INVALID_CONTEXT_ID',
        '/contextId',
        'Context ID must be a positive integer or non-empty string.',
        'positive integer or non-empty string',
        contextId,
      ));
    }

    const yardLine = firstDefined(input.yardLine, input.yd);
    const firstDownLine = firstDefined(input.firstDownLine, input.fdYd);
    const yardsToGo = firstDefined(input.yardsToGo, input.ytg);
    const quarter = input.quarter;
    const down = input.down;
    const driveStart = input.driveStart;
    const plays = firstDefined(input.plays, 0);
    const drivePlays = firstDefined(input.drivePlays, 0);

    const yardLineOkay = integerDiagnostic(yardLine, '/yardLine', 1, 99, diagnostics);
    const markerOkay = integerDiagnostic(firstDownLine, '/firstDownLine', 0, 100, diagnostics);
    const distanceOkay = integerDiagnostic(yardsToGo, '/yardsToGo', 1, 99, diagnostics);
    integerDiagnostic(quarter, '/quarter', 1, 4, diagnostics);
    integerDiagnostic(down, '/down', 1, 4, diagnostics);
    integerDiagnostic(driveStart, '/driveStart', 0, 100, diagnostics);
    integerDiagnostic(plays, '/plays', 0, Number.MAX_SAFE_INTEGER, diagnostics);
    integerDiagnostic(drivePlays, '/drivePlays', 0, Number.MAX_SAFE_INTEGER, diagnostics);

    if (yardLineOkay && markerOkay && distanceOkay && (direction === 1 || direction === -1)) {
      const expectedMarker = yardLine + (yardsToGo * direction);
      if (firstDownLine !== expectedMarker) {
        diagnostics.push(diagnostic(
          'INCONSISTENT_LINE_TO_GAIN',
          '/firstDownLine',
          'First-down line must be exactly yardsToGo ahead of the ball.',
          expectedMarker,
          firstDownLine,
        ));
      }
    }

    // Losses can move an offense behind its drive start, so driveStart is a
    // historical anchor rather than a lower bound on the current field spot.

    const scoreInput = isRecord(input.scores)
      ? input.scores
      : isRecord(input.score)
        ? input.score
        : {};
    const playerScore = firstDefined(scoreInput.player, input.playerScore);
    const opponentScore = firstDefined(scoreInput.opponent, input.opponentScore);
    integerDiagnostic(playerScore, '/scores/player', 0, Number.MAX_SAFE_INTEGER, diagnostics);
    integerDiagnostic(opponentScore, '/scores/opponent', 0, Number.MAX_SAFE_INTEGER, diagnostics);

    const totalYardsInput = isRecord(input.totalYards) ? input.totalYards : {};
    const playerTotalYards = firstDefined(totalYardsInput.player, input.playerTotalYards, 0);
    const opponentTotalYards = firstDefined(totalYardsInput.opponent, input.opponentTotalYards, 0);
    integerDiagnostic(playerTotalYards, '/totalYards/player', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, diagnostics);
    integerDiagnostic(opponentTotalYards, '/totalYards/opponent', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, diagnostics);

    const callsInput = isRecord(input.calls) ? input.calls : {};
    const offenseCallFallback = possession === 'defense'
      ? input.opponentCallKey
      : firstDefined(input.offenseCallKey, input.callKey);
    const calls = {
      offense: nullableString(firstDefined(callsInput.offense, offenseCallFallback), '/calls/offense', diagnostics),
      defense: nullableString(firstDefined(callsInput.defense, input.defenseCallKey), '/calls/defense', diagnostics),
      matchup: firstDefined(callsInput.matchup, input.matchup, null),
    };
    if (calls.matchup !== null && calls.matchup !== 'matched' && calls.matchup !== 'mismatch') {
      diagnostics.push(diagnostic(
        'INVALID_MATCHUP',
        '/calls/matchup',
        'Matchup must be matched, mismatch, or null.',
        ['matched', 'mismatch', null],
        calls.matchup,
      ));
    }

    const rawPrivateOpponentSnapshot = firstDefined(input.privateOpponentSnapshot, null);
    const privateSnapshotProvided = rawPrivateOpponentSnapshot !== null;
    let privateOpponentSnapshot = null;
    if (privateSnapshotProvided) {
      if (!isRecord(rawPrivateOpponentSnapshot)) {
        diagnostics.push(diagnostic(
          'INVALID_PRIVATE_OPPONENT_SNAPSHOT',
          '/privateOpponentSnapshot',
          'Private opponent snapshot must be a plain object or null.',
          'plain object or null',
          typeof rawPrivateOpponentSnapshot,
        ));
      } else {
        privateOpponentSnapshot = rawPrivateOpponentSnapshot;
      }
    }

    const hasCompletedDefenseCall = possession === 'defense' && calls.defense !== null;
    if (hasCompletedDefenseCall && !privateSnapshotProvided) {
      diagnostics.push(diagnostic(
        'MISSING_PRIVATE_OPPONENT_SNAPSHOT',
        '/privateOpponentSnapshot',
        'A completed defensive call must retain its exact pre-snap opponent snapshot.',
        'plain object',
        null,
      ));
    } else if (!hasCompletedDefenseCall && privateSnapshotProvided) {
      diagnostics.push(diagnostic(
        'UNEXPECTED_PRIVATE_OPPONENT_SNAPSHOT',
        '/privateOpponentSnapshot',
        'Private opponent snapshots are allowed only after a defensive call is selected.',
        null,
        'snapshot provided',
      ));
    }
    if (privateOpponentSnapshot) {
      const opponentId = privateOpponentSnapshot.opponentId;
      const profileKey = privateOpponentSnapshot.profileKey;
      const plannedCallKey = privateOpponentSnapshot.plannedCallKey;
      if (typeof opponentId !== 'string' || opponentId.trim() === '') {
        diagnostics.push(diagnostic(
          'INVALID_PRIVATE_OPPONENT_ID',
          '/privateOpponentSnapshot/opponentId',
          'Private opponent snapshot must retain its sampled opponent identity.',
        ));
      } else if (opponentId !== match.opponent.id) {
        diagnostics.push(diagnostic(
          'MISMATCHED_PRIVATE_OPPONENT_ID',
          '/privateOpponentSnapshot/opponentId',
          'Private opponent identity must match the public match context.',
        ));
      }
      if (typeof profileKey !== 'string' || profileKey.trim() === '') {
        diagnostics.push(diagnostic(
          'INVALID_PRIVATE_OPPONENT_PROFILE',
          '/privateOpponentSnapshot/profileKey',
          'Private opponent snapshot must retain its sampled behavior profile.',
        ));
      } else if (catalogRival && profileKey !== catalogRival.profileKey) {
        diagnostics.push(diagnostic(
          'MISMATCHED_PRIVATE_OPPONENT_PROFILE',
          '/privateOpponentSnapshot/profileKey',
          'Private opponent profile must match the public match context.',
        ));
      }
      if (typeof plannedCallKey !== 'string' || plannedCallKey.trim() === '') {
        diagnostics.push(diagnostic(
          'INVALID_PRIVATE_OPPONENT_CALL',
          '/privateOpponentSnapshot/plannedCallKey',
          'Private opponent snapshot must name its planned offensive call.',
        ));
      } else if (plannedCallKey !== calls.offense) {
        diagnostics.push(diagnostic(
          'MISMATCHED_PRIVATE_OPPONENT_CALL',
          '/privateOpponentSnapshot/plannedCallKey',
          'Private opponent snapshot must match the offensive call frozen into the snap.',
        ));
      }
    }

    const value = {
      contextId,
      match,
      possession,
      direction,
      quarter,
      down,
      yardsToGo,
      yardLine,
      firstDownLine,
      driveStart,
      scores: {
        player: playerScore,
        opponent: opponentScore,
      },
      totalYards: {
        player: playerTotalYards,
        opponent: opponentTotalYards,
      },
      plays,
      drivePlays,
      calls,
      privateOpponentSnapshot,
    };

    return { diagnostics, value };
  }

  function normalizeContext(input) {
    const inspected = inspectContext(input);
    if (inspected.diagnostics.length) {
      throw new FootballDomainError('INVALID_CONTEXT', inspected.diagnostics);
    }
    return immutable(inspected.value);
  }

  function validationResult(value, diagnostics) {
    return immutable({
      ok: diagnostics.length === 0,
      value: diagnostics.length === 0 ? value : null,
      diagnostics,
    });
  }

  function validateContext(input) {
    try {
      return validationResult(normalizeContext(input), []);
    } catch (error) {
      if (error instanceof FootballDomainError) return validationResult(null, error.diagnostics);
      return validationResult(null, [diagnostic(
        'INVALID_CONTEXT',
        '/',
        error && error.message ? error.message : 'Context validation failed.',
      )]);
    }
  }

  function distanceToGoal(yardLine, direction) {
    return direction === 1 ? 100 - yardLine : yardLine;
  }

  function reachedLine(yardLine, target, direction) {
    return direction === 1 ? yardLine >= target : yardLine <= target;
  }

  function projectGain(input, requestedGain, outcomeOptions = null) {
    const context = normalizeContext(input && input.context ? input.context : input);
    const diagnostics = [];
    if (!Number.isInteger(requestedGain) || requestedGain < -100 || requestedGain > 100) {
      diagnostics.push(diagnostic(
        'INVALID_GAIN',
        '/requestedGain',
        'Net yards must be an integer from -100 through 100.',
        { integer: true, min: -100, max: 100 },
        requestedGain,
      ));
      throw new FootballDomainError('INVALID_GAIN', diagnostics);
    }

    const distanceBefore = distanceToGoal(context.yardLine, context.direction);
    const distanceToOwnOne = context.direction === 1 ? context.yardLine - 1 : 99 - context.yardLine;
    const unclampedGain = requestedGain >= 0
      ? Math.min(requestedGain, distanceBefore)
      : Math.max(requestedGain, -distanceToOwnOne);
    const appliedGain = Object.is(unclampedGain, -0) ? 0 : unclampedGain;
    const endYardLine = context.yardLine + (appliedGain * context.direction);
    const forcedTurnover = outcomeOptions?.resultKind === 'turnover';
    const allowedReasons = ['stuff', 'incompletion', 'sack', 'fumble', 'interception'];
    const resultReason = outcomeOptions && allowedReasons.includes(outcomeOptions.resultReason)
      ? outcomeOptions.resultReason
      : null;
    if (outcomeOptions && (!resultReason
      || ![undefined, 'turnover'].includes(outcomeOptions.resultKind)
      || (forcedTurnover !== ['fumble', 'interception'].includes(resultReason)))) {
      throw new FootballDomainError('INVALID_OUTCOME', [diagnostic(
        'INVALID_OUTCOME', '/outcome', 'The requested football outcome is not canonical.',
      )]);
    }
    const touchdown = !forcedTurnover && endYardLine === (context.direction === 1 ? 100 : 0);
    const firstDown = !forcedTurnover && !touchdown
      && reachedLine(endYardLine, context.firstDownLine, context.direction);
    const turnoverOnDowns = !forcedTurnover && !touchdown && !firstDown && context.down === 4;
    const resultKind = forcedTurnover
      ? 'turnover'
      : touchdown
      ? 'touchdown'
      : firstDown
        ? 'firstDown'
        : turnoverOnDowns
          ? 'turnoverOnDowns'
          : 'advance';

    const newFirstDownLine = firstDown
      ? context.direction === 1
        ? Math.min(endYardLine + 10, 100)
        : Math.max(endYardLine - 10, 0)
      : context.firstDownLine;
    const newDown = firstDown ? 1 : Math.min(context.down + 1, 4);
    const newYardsToGo = touchdown
      ? 0
      : Math.abs(newFirstDownLine - endYardLine);
    const rawDriveTotal = (endYardLine - context.driveStart) * context.direction;
    const driveTotal = Object.is(rawDriveTotal, -0) ? 0 : rawDriveTotal;

    return immutable({
      contextId: context.contextId,
      requestedGain,
      appliedGain,
      startYardLine: context.yardLine,
      endYardLine,
      direction: context.direction,
      possession: context.possession,
      oldDown: context.down,
      newDown,
      oldYardsToGo: context.yardsToGo,
      newYardsToGo,
      oldFirstDownLine: context.firstDownLine,
      newFirstDownLine,
      resultKind,
      resultReason,
      crossedMidfield: context.direction === 1
        ? context.yardLine < 50 && endYardLine >= 50
        : context.yardLine > 50 && endYardLine <= 50,
      driveTotal,
      distanceToGoalBefore: distanceBefore,
      distanceToGoalAfter: distanceToGoal(endYardLine, context.direction),
    });
  }

  function normalizeCall(proposal, context) {
    const key = nullableString(
      firstDefined(proposal.callKey, context.calls.offense),
      '/call/key',
      [],
    );
    const label = nullableString(proposal.label, '/call/label', []);
    return { key, label };
  }

  function createSnap(input, proposalInput) {
    const context = normalizeContext(input);
    const proposal = typeof proposalInput === 'number' ? { gain: proposalInput } : proposalInput;
    if (!isRecord(proposal)) {
      throw new FootballDomainError('INVALID_PROPOSAL', [diagnostic(
        'INVALID_PROPOSAL',
        '/proposal',
        'Proposal must be an object containing gain.',
        'object',
        proposalInput,
      )]);
    }

    const gain = firstDefined(proposal.gain, proposal.requestedGain);
    if (!Number.isInteger(gain) || gain < 0) {
      throw new FootballDomainError('INVALID_PROPOSAL', [diagnostic(
        'INVALID_PROPOSAL', '/proposal/gain', 'Snap proposals must remain non-negative.',
      )]);
    }
    const projection = projectGain(context, gain);
    const call = normalizeCall(proposal, context);
    if (proposal.callKey !== undefined && call.key === null) {
      throw new FootballDomainError('INVALID_PROPOSAL', [diagnostic(
        'INVALID_STRING',
        '/proposal/callKey',
        'Call key must be a non-empty string or null.',
        'non-empty string or null',
        proposal.callKey,
      )]);
    }
    if (proposal.label !== undefined && call.label === null) {
      throw new FootballDomainError('INVALID_PROPOSAL', [diagnostic(
        'INVALID_STRING',
        '/proposal/label',
        'Call label must be a non-empty string or null.',
        'non-empty string or null',
        proposal.label,
      )]);
    }
    if (call.key !== context.calls.offense) {
      throw new FootballDomainError('INVALID_PROPOSAL', [diagnostic(
        'MISMATCHED_CALL_KEY',
        '/proposal/callKey',
        'The proposed call key must match the offense call frozen into the context.',
      )]);
    }

    return immutable({
      contextId: context.contextId,
      context,
      proposal: projection,
      call,
    });
  }

  function contextFrom(source) {
    return source && isRecord(source) && isRecord(source.context) ? source.context : source;
  }

  function reprojectGain(source, requestedGain, outcomeOptions = null) {
    return projectGain(contextFrom(source), requestedGain, outcomeOptions);
  }

  function compareProjection(expected, candidate) {
    const diagnostics = [];
    if (!isRecord(candidate)) {
      return [diagnostic(
        'INVALID_TRANSITION',
        '/transition',
        'Transition must be a canonical projection object.',
        'object',
        candidate,
      )];
    }

    const expectedKeys = new Set(PROJECTION_KEYS);
    for (const key of Object.keys(candidate)) {
      if (!expectedKeys.has(key)) {
        diagnostics.push(diagnostic(
          'UNKNOWN_TRANSITION_FIELD',
          `/${key}`,
          'Transition contains a field outside the canonical projection.',
          undefined,
          candidate[key],
        ));
      }
    }

    for (const key of PROJECTION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
        diagnostics.push(diagnostic(
          'MISSING_TRANSITION_FIELD',
          `/${key}`,
          'Transition is missing a canonical projection field.',
          expected[key],
          undefined,
        ));
      } else if (!Object.is(candidate[key], expected[key])) {
        diagnostics.push(diagnostic(
          'CONTRADICTORY_TRANSITION',
          `/${key}`,
          'Transition contradicts the independently projected football result.',
          expected[key],
          candidate[key],
        ));
      }
    }
    return diagnostics;
  }

  function validateTransition(source, candidate, options) {
    try {
      const context = normalizeContext(contextFrom(source));
      const sourceIsSnap = isRecord(source) && isRecord(source.context) && isRecord(source.proposal);
      const hasExpectedRequestedGain = isRecord(options)
        && Object.prototype.hasOwnProperty.call(options, 'expectedRequestedGain');
      const requestedGain = hasExpectedRequestedGain
        ? options.expectedRequestedGain
        : sourceIsSnap
          ? source.proposal.requestedGain
          : candidate && candidate.requestedGain;
      const outcomeOptions = isRecord(options) && options.expectedResultReason
        ? { resultKind: options.expectedResultKind, resultReason: options.expectedResultReason }
        : null;
      const expected = projectGain(context, requestedGain, outcomeOptions);
      return validationResult(expected, compareProjection(expected, candidate));
    } catch (error) {
      if (error instanceof FootballDomainError) return validationResult(null, error.diagnostics);
      return validationResult(null, [diagnostic(
        'INVALID_TRANSITION',
        '/transition',
        error && error.message ? error.message : 'Transition validation failed.',
      )]);
    }
  }

  function assertValidTransition(source, candidate, options) {
    const result = validateTransition(source, candidate, options);
    if (!result.ok) throw new FootballDomainError('INVALID_TRANSITION', result.diagnostics);
    return result.value;
  }

  function oppositePossession(possession) {
    return possession === 'offense' ? 'defense' : 'offense';
  }

  function startingYardFor(possession) {
    return possession === 'offense' ? 20 : 80;
  }

  function fieldGoalDistance(yardLine, direction) {
    if (!Number.isInteger(yardLine) || yardLine < 1 || yardLine > 99 || ![1, -1].includes(direction)) {
      throw new FootballDomainError('INVALID_FIELD_GOAL_SPOT', [diagnostic(
        'INVALID_FIELD_GOAL_SPOT',
        '/yardLine',
        'Field-goal distance needs an absolute yard line from 1 through 99 and a direction.',
      )]);
    }
    return distanceToGoal(yardLine, direction) + 17;
  }

  function isFieldGoalLegal(yardLine, direction) {
    try {
      return fieldGoalDistance(yardLine, direction) <= 57;
    } catch (error) {
      return false;
    }
  }

  function tryYardLineFor(direction) {
    if (direction === 1) return 98;
    if (direction === -1) return 2;
    throw new FootballDomainError('INVALID_DIRECTION', [diagnostic(
      'INVALID_DIRECTION', '/direction', 'Direction must be 1 or -1.', [1, -1], direction,
    )]);
  }

  function exactKeyDiagnostics(input, expectedKeys, path = '/') {
    if (!isRecord(input)) {
      return [diagnostic('INVALID_OBJECT', path, 'Expected a plain object.', 'plain object', input)];
    }
    const diagnostics = [];
    const expected = new Set(expectedKeys);
    for (const key of Object.keys(input)) {
      if (!expected.has(key)) diagnostics.push(diagnostic(
        'UNKNOWN_CONTEXT_FIELD', `${path === '/' ? '' : path}/${key}` || `/${key}`,
        'Object contains a field outside its closed contract.',
      ));
    }
    for (const key of expectedKeys) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) diagnostics.push(diagnostic(
        'MISSING_CONTEXT_FIELD', `${path === '/' ? '' : path}/${key}` || `/${key}`,
        'Object is missing a required field from its closed contract.',
      ));
    }
    return diagnostics;
  }

  function inspectSpecialContext(playType, input) {
    const expectedKeys = SPECIAL_CONTEXT_KEYS[playType];
    if (!expectedKeys) {
      return {
        diagnostics: [diagnostic('INVALID_PLAY_TYPE', '/playType', 'Unknown special-team play type.')],
        value: null,
      };
    }
    const diagnostics = exactKeyDiagnostics(input, expectedKeys);
    if (!isRecord(input)) return { diagnostics, value: null };

    if (input.schemaVersion !== 1) diagnostics.push(diagnostic(
      'INVALID_CONTEXT_SCHEMA', '/schemaVersion', 'Special-team context schema version must be 1.', 1, input.schemaVersion,
    ));
    if (input.playType !== playType) diagnostics.push(diagnostic(
      'CONTRADICTORY_PLAY_TYPE', '/playType', 'Context play type contradicts the requested play type.', playType, input.playType,
    ));
    const contextId = input.contextId;
    if (!((Number.isInteger(contextId) && contextId >= 1)
      || (typeof contextId === 'string' && contextId.trim() !== ''))) {
      diagnostics.push(diagnostic(
        'INVALID_CONTEXT_ID', '/contextId', 'Context ID must be a positive integer or non-empty string.',
      ));
    }
    const match = inspectMatch(input.match, diagnostics);
    const possession = input.possession;
    if (!['offense', 'defense'].includes(possession)) diagnostics.push(diagnostic(
      'INVALID_POSSESSION', '/possession', 'Possession must be offense or defense.', ['offense', 'defense'], possession,
    ));
    const expectedDirection = possession === 'offense' ? 1 : possession === 'defense' ? -1 : null;
    const direction = input.direction;
    if (![1, -1].includes(direction)) diagnostics.push(diagnostic(
      'INVALID_DIRECTION', '/direction', 'Direction must be 1 or -1.', [1, -1], direction,
    ));
    else if (expectedDirection !== null && direction !== expectedDirection) diagnostics.push(diagnostic(
      'CONTRADICTORY_DIRECTION', '/direction', 'Direction contradicts possession.', expectedDirection, direction,
    ));
    integerDiagnostic(input.quarter, '/quarter', 1, 4, diagnostics);

    const scoreInput = isRecord(input.scores) ? input.scores : {};
    const playerScore = scoreInput.player;
    const opponentScore = scoreInput.opponent;
    if (!isRecord(input.scores)
      || Object.keys(scoreInput).length !== 2
      || !Object.prototype.hasOwnProperty.call(scoreInput, 'player')
      || !Object.prototype.hasOwnProperty.call(scoreInput, 'opponent')) {
      diagnostics.push(diagnostic(
        'INVALID_SCORES', '/scores', 'Scores must contain exactly player and opponent.',
      ));
    }
    integerDiagnostic(playerScore, '/scores/player', 0, Number.MAX_SAFE_INTEGER, diagnostics);
    integerDiagnostic(opponentScore, '/scores/opponent', 0, Number.MAX_SAFE_INTEGER, diagnostics);

    const value = {
      schemaVersion: input.schemaVersion,
      playType,
      contextId,
      match,
      possession,
      direction,
      quarter: input.quarter,
    };

    if (playType === 'punt' || playType === 'fieldGoal') {
      integerDiagnostic(input.yardLine, '/yardLine', 1, 99, diagnostics);
      value.yardLine = input.yardLine;
    }
    if (playType === 'fieldGoal') {
      integerDiagnostic(input.attemptDistance, '/attemptDistance', 18, 116, diagnostics);
      if (Number.isInteger(input.yardLine) && [1, -1].includes(direction)) {
        const expectedDistance = fieldGoalDistance(input.yardLine, direction);
        if (input.attemptDistance !== expectedDistance) diagnostics.push(diagnostic(
          'CONTRADICTORY_ATTEMPT_DISTANCE', '/attemptDistance',
          'Field-goal distance must equal yards to goal plus 17.', expectedDistance, input.attemptDistance,
        ));
        if (expectedDistance > 57) diagnostics.push(diagnostic(
          'ILLEGAL_FIELD_GOAL', '/attemptDistance', 'Field goals are legal only through 57 yards.',
          { max: 57 }, input.attemptDistance,
        ));
      }
      value.attemptDistance = input.attemptDistance;
    }
    if (playType === 'conversion') {
      integerDiagnostic(input.tryYardLine, '/tryYardLine', 0, 100, diagnostics);
      const expectedTry = [1, -1].includes(direction) ? tryYardLineFor(direction) : null;
      if (expectedTry !== null && input.tryYardLine !== expectedTry) diagnostics.push(diagnostic(
        'CONTRADICTORY_TRY_MARKER', '/tryYardLine',
        'Conversion try marker contradicts the scoring direction.', expectedTry, input.tryYardLine,
      ));
      if (!['pat', 'twoPoint'].includes(input.attemptType)) diagnostics.push(diagnostic(
        'INVALID_CONVERSION_TYPE', '/attemptType', 'Conversion type must be pat or twoPoint.',
        ['pat', 'twoPoint'], input.attemptType,
      ));
      const expectedValue = input.attemptType === 'pat' ? 1 : input.attemptType === 'twoPoint' ? 2 : null;
      if (input.attemptValue !== expectedValue) diagnostics.push(diagnostic(
        'CONTRADICTORY_CONVERSION_VALUE', '/attemptValue',
        'PAT attempts are worth 1 and two-point attempts are worth 2.', expectedValue, input.attemptValue,
      ));
      value.tryYardLine = input.tryYardLine;
      value.attemptType = input.attemptType;
      value.attemptValue = input.attemptValue;
    }
    value.scores = { player: playerScore, opponent: opponentScore };
    return { diagnostics, value };
  }

  function normalizeSpecialContext(playType, input) {
    const inspected = inspectSpecialContext(playType, input);
    if (inspected.diagnostics.length) {
      throw new FootballDomainError('INVALID_CONTEXT', inspected.diagnostics);
    }
    return immutable(inspected.value);
  }

  function validateSpecialContext(playType, input) {
    try {
      return validationResult(normalizeSpecialContext(playType, input), []);
    } catch (error) {
      if (error instanceof FootballDomainError) return validationResult(null, error.diagnostics);
      return validationResult(null, [diagnostic(
        'INVALID_CONTEXT', '/', error?.message || 'Special-team context validation failed.',
      )]);
    }
  }

  function specialContextFrom(source, playType) {
    const context = isRecord(source) && isRecord(source.context) ? source.context : source;
    return normalizeSpecialContext(playType, context);
  }

  function projectPunt(source, travelYards, options = {}) {
    const context = specialContextFrom(source, 'punt');
    const mode = options.mode === 'receiverFavorable' ? 'receiverFavorable' : 'normal';
    const requestedTravelYards = mode === 'receiverFavorable' ? 20 : travelYards;
    if (!Number.isInteger(requestedTravelYards)
      || (mode === 'normal' && (requestedTravelYards < 35 || requestedTravelYards > 50))) {
      throw new FootballDomainError('INVALID_PUNT_TRAVEL', [diagnostic(
        'INVALID_PUNT_TRAVEL', '/requestedTravelYards',
        mode === 'normal' ? 'Normal punt travel must be 35 through 50 yards.' : 'Receiver-favorable punt travel must be 20 yards.',
      )]);
    }
    const nextPossession = oppositePossession(context.possession);
    const receivingOwn20 = startingYardFor(nextPossession);
    const unbounded = context.yardLine + (context.direction * requestedTravelYards);
    const crossedGoal = context.direction === 1 ? unbounded >= 100 : unbounded <= 0;
    const rawLandingYardLine = Math.max(0, Math.min(100, unbounded));
    let landingYardLine;
    let restartReason;
    let resultKind;
    if (crossedGoal) {
      landingYardLine = receivingOwn20;
      restartReason = 'puntTouchback';
      resultKind = 'puntTouchback';
    } else if (mode === 'receiverFavorable') {
      landingYardLine = context.direction === 1
        ? Math.min(rawLandingYardLine, receivingOwn20)
        : Math.max(rawLandingYardLine, receivingOwn20);
      restartReason = 'punt';
      resultKind = 'punt';
    } else {
      landingYardLine = rawLandingYardLine;
      restartReason = 'punt';
      resultKind = 'punt';
    }
    return immutable({
      contextId: context.contextId,
      playType: 'punt',
      possession: context.possession,
      direction: context.direction,
      startYardLine: context.yardLine,
      mode,
      requestedTravelYards,
      appliedTravelYards: Math.abs(rawLandingYardLine - context.yardLine),
      rawLandingYardLine,
      landingYardLine,
      resultKind,
      nextPossession,
      nextStartYardLine: landingYardLine,
      restartReason,
    });
  }

  function reprojectPunt(source, mode = 'normal') {
    const travel = mode === 'receiverFavorable'
      ? 20
      : source?.proposal?.requestedTravelYards ?? source?.requestedTravelYards;
    return projectPunt(source, travel, { mode });
  }

  function projectFieldGoal(source, outcome = 'made') {
    const context = specialContextFrom(source, 'fieldGoal');
    if (!['made', 'missed', 'blocked'].includes(outcome)) {
      throw new FootballDomainError('INVALID_FIELD_GOAL_OUTCOME', [diagnostic(
        'INVALID_FIELD_GOAL_OUTCOME', '/outcome', 'Field-goal outcome must be made, missed, or blocked.',
      )]);
    }
    const made = outcome === 'made';
    const nextPossession = oppositePossession(context.possession);
    return immutable({
      contextId: context.contextId,
      playType: 'fieldGoal',
      possession: context.possession,
      direction: context.direction,
      startYardLine: context.yardLine,
      attemptDistance: context.attemptDistance,
      made,
      resultKind: made ? 'fieldGoalMade' : outcome === 'blocked' ? 'fieldGoalBlocked' : 'fieldGoalMissed',
      points: made ? 3 : 0,
      nextPossession,
      nextStartYardLine: made ? startingYardFor(nextPossession) : context.yardLine,
      restartReason: made ? 'automaticTouchback' : outcome === 'blocked' ? 'blockedFieldGoal' : 'missedFieldGoal',
    });
  }

  function reprojectFieldGoal(source, outcome) {
    return projectFieldGoal(source, outcome);
  }

  function projectConversion(source, outcome = 'made') {
    const context = specialContextFrom(source, 'conversion');
    if (!['made', 'missed'].includes(outcome)) {
      throw new FootballDomainError('INVALID_CONVERSION_OUTCOME', [diagnostic(
        'INVALID_CONVERSION_OUTCOME', '/outcome', 'Conversion outcome must be made or missed.',
      )]);
    }
    const made = outcome === 'made';
    const nextPossession = oppositePossession(context.possession);
    return immutable({
      contextId: context.contextId,
      playType: 'conversion',
      possession: context.possession,
      direction: context.direction,
      tryYardLine: context.tryYardLine,
      attemptType: context.attemptType,
      attemptValue: context.attemptValue,
      made,
      resultKind: made ? 'conversionMade' : 'conversionMissed',
      points: made ? context.attemptValue : 0,
      nextPossession,
      nextStartYardLine: startingYardFor(nextPossession),
      restartReason: 'automaticTouchback',
    });
  }

  function reprojectConversion(source, outcome) {
    return projectConversion(source, outcome);
  }

  function compareClosedProjection(expected, candidate, keys) {
    const diagnostics = [];
    if (!isRecord(candidate)) {
      return [diagnostic('INVALID_TRANSITION', '/transition', 'Transition must be a plain object.')];
    }
    const closed = new Set(keys);
    for (const key of Object.keys(candidate)) {
      if (!closed.has(key)) diagnostics.push(diagnostic(
        'UNKNOWN_TRANSITION_FIELD', `/${key}`, 'Transition contains a field outside its closed projection.',
      ));
    }
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) diagnostics.push(diagnostic(
        'MISSING_TRANSITION_FIELD', `/${key}`, 'Transition is missing a canonical projection field.',
      ));
      else if (!Object.is(candidate[key], expected[key])) diagnostics.push(diagnostic(
        'CONTRADICTORY_TRANSITION', `/${key}`, 'Transition contradicts independent reprojection.',
        expected[key], candidate[key],
      ));
    }
    return diagnostics;
  }

  function validatePuntTransition(source, candidate, options = {}) {
    try {
      const sourceProposal = source?.proposal;
      const mode = firstDefined(options.expectedMode, sourceProposal?.mode, candidate?.mode, 'normal');
      const modePath = options.expectedMode !== undefined
        ? '/expectedMode'
        : sourceProposal?.mode !== undefined ? '/proposal/mode' : '/mode';
      if (!['normal', 'receiverFavorable'].includes(mode)) {
        throw new FootballDomainError('INVALID_PUNT_MODE', [diagnostic(
          'INVALID_PUNT_MODE', modePath,
          'Expected punt mode must be normal or receiverFavorable.',
          ['normal', 'receiverFavorable'], mode,
        )]);
      }
      const travel = mode === 'receiverFavorable'
        ? 20
        : firstDefined(
          options.expectedTravelYards,
          sourceProposal?.requestedTravelYards,
          candidate?.requestedTravelYards,
        );
      const expected = projectPunt(source, travel, { mode });
      return validationResult(expected, compareClosedProjection(expected, candidate, PUNT_PROJECTION_KEYS));
    } catch (error) {
      if (error instanceof FootballDomainError) return validationResult(null, error.diagnostics);
      return validationResult(null, [diagnostic('INVALID_TRANSITION', '/', error?.message || 'Punt validation failed.')]);
    }
  }

  function validateFieldGoalTransition(source, candidate, options = {}) {
    try {
      const resultKind = firstDefined(
        options.expectedResultKind, source?.proposal?.resultKind, candidate?.resultKind,
      );
      const resultKindPath = options.expectedResultKind !== undefined
        ? '/expectedResultKind'
        : source?.proposal?.resultKind !== undefined ? '/proposal/resultKind' : '/resultKind';
      if (!['fieldGoalMade', 'fieldGoalMissed', 'fieldGoalBlocked'].includes(resultKind)) {
        throw new FootballDomainError('INVALID_FIELD_GOAL_RESULT_KIND', [diagnostic(
          'INVALID_FIELD_GOAL_RESULT_KIND', resultKindPath,
          'Expected field-goal result kind must be made, missed, or blocked.',
          ['fieldGoalMade', 'fieldGoalMissed', 'fieldGoalBlocked'], resultKind,
        )]);
      }
      const outcome = resultKind === 'fieldGoalMade' ? 'made'
        : resultKind === 'fieldGoalBlocked' ? 'blocked' : 'missed';
      const expected = projectFieldGoal(source, outcome);
      return validationResult(expected, compareClosedProjection(expected, candidate, FIELD_GOAL_PROJECTION_KEYS));
    } catch (error) {
      if (error instanceof FootballDomainError) return validationResult(null, error.diagnostics);
      return validationResult(null, [diagnostic('INVALID_TRANSITION', '/', error?.message || 'Field-goal validation failed.')]);
    }
  }

  function validateConversionTransition(source, candidate, options = {}) {
    try {
      const resultKind = firstDefined(
        options.expectedResultKind, source?.proposal?.resultKind, candidate?.resultKind,
      );
      const resultKindPath = options.expectedResultKind !== undefined
        ? '/expectedResultKind'
        : source?.proposal?.resultKind !== undefined ? '/proposal/resultKind' : '/resultKind';
      if (!['conversionMade', 'conversionMissed'].includes(resultKind)) {
        throw new FootballDomainError('INVALID_CONVERSION_RESULT_KIND', [diagnostic(
          'INVALID_CONVERSION_RESULT_KIND', resultKindPath,
          'Expected conversion result kind must be made or missed.',
          ['conversionMade', 'conversionMissed'], resultKind,
        )]);
      }
      const expected = projectConversion(source, resultKind === 'conversionMade' ? 'made' : 'missed');
      return validationResult(expected, compareClosedProjection(expected, candidate, CONVERSION_PROJECTION_KEYS));
    } catch (error) {
      if (error instanceof FootballDomainError) return validationResult(null, error.diagnostics);
      return validationResult(null, [diagnostic('INVALID_TRANSITION', '/', error?.message || 'Conversion validation failed.')]);
    }
  }

  function nonEmptyId(value, path, diagnostics) {
    if (typeof value !== 'string' || value.trim() === '') {
      diagnostics.push(diagnostic('INVALID_ID', path, 'Play identity fields must be non-empty strings.'));
    }
    return value;
  }

  function createActivePlay(input) {
    if (!isRecord(input) || !PLAY_TYPES.includes(input.playType)) {
      throw new FootballDomainError('INVALID_ACTIVE_PLAY', [diagnostic(
        'INVALID_PLAY_TYPE', '/playType', 'Active play must use a known play type.', PLAY_TYPES, input?.playType,
      )]);
    }
    const playType = input.playType;
    const keys = playType === 'scrimmage'
      ? ['schemaVersion', 'playType', 'gameId', 'possessionId', 'playId', 'contextId', 'context', 'proposal', 'call']
      : ['schemaVersion', 'playType', 'gameId', 'possessionId', 'playId', 'contextId', 'context', 'proposal'];
    const diagnostics = exactKeyDiagnostics(input, keys);
    if (input.schemaVersion !== 1) diagnostics.push(diagnostic(
      'INVALID_ACTIVE_PLAY_SCHEMA', '/schemaVersion', 'Active play schema version must be 1.', 1, input.schemaVersion,
    ));
    const gameId = nonEmptyId(input.gameId, '/gameId', diagnostics);
    const possessionId = nonEmptyId(input.possessionId, '/possessionId', diagnostics);
    const playId = nonEmptyId(input.playId, '/playId', diagnostics);
    let context;
    let proposal;
    let call;
    try {
      if (playType === 'scrimmage') {
        context = normalizeContext(input.context);
        const validated = validateTransition({ context, proposal: input.proposal }, input.proposal);
        if (!validated.ok) diagnostics.push(...validated.diagnostics);
        else proposal = validated.value;
        call = isRecord(input.call) ? immutable(input.call) : null;
        if (!call || typeof call.key !== 'string' || !call.key || typeof call.label !== 'string' || !call.label) {
          diagnostics.push(diagnostic('INVALID_CALL', '/call', 'Scrimmage active plays require a frozen call key and label.'));
        } else if (call.key !== context.calls.offense) {
          diagnostics.push(diagnostic(
            'MISMATCHED_CALL_KEY',
            '/call/key',
            'The active-play call key must match the offense call frozen into the context.',
          ));
        }
      } else {
        context = normalizeSpecialContext(playType, input.context);
        const validator = playType === 'punt' ? validatePuntTransition
          : playType === 'fieldGoal' ? validateFieldGoalTransition : validateConversionTransition;
        const validated = validator({ context, proposal: input.proposal }, input.proposal);
        if (!validated.ok) diagnostics.push(...validated.diagnostics);
        else {
          proposal = validated.value;
          const initialThreatIsValid = playType === 'punt'
            ? proposal.mode === 'normal'
            : proposal.made === true;
          if (!initialThreatIsValid) diagnostics.push(diagnostic(
            'INVALID_INITIAL_SPECIAL_PROPOSAL',
            '/proposal',
            'Initial special-team plays must freeze the normal punt or made kick threat; alternate outcomes are resolution reprojections only.',
          ));
        }
      }
    } catch (error) {
      if (error instanceof FootballDomainError) diagnostics.push(...error.diagnostics);
      else diagnostics.push(diagnostic('INVALID_ACTIVE_PLAY', '/', error?.message || 'Active play construction failed.'));
    }
    if (input.contextId !== context?.contextId) diagnostics.push(diagnostic(
      'MISMATCHED_CONTEXT_ID', '/contextId', 'Active play context ID must match its context.', context?.contextId, input.contextId,
    ));
    if (diagnostics.length) throw new FootballDomainError('INVALID_ACTIVE_PLAY', diagnostics);
    return immutable({
      schemaVersion: 1,
      playType,
      gameId,
      possessionId,
      playId,
      contextId: context.contextId,
      context,
      proposal,
      ...(playType === 'scrimmage' ? { call } : {}),
    });
  }

  function activeSnapFromPlay(activePlay) {
    if (!activePlay || activePlay.playType !== 'scrimmage') return null;
    return deepFreeze({
      contextId: activePlay.contextId,
      context: activePlay.context,
      proposal: activePlay.proposal,
      call: activePlay.call,
    });
  }

  function validatePlayTransition(activePlay, candidate, options = {}) {
    if (!activePlay || !PLAY_TYPES.includes(activePlay.playType)) {
      return validationResult(null, [diagnostic('INVALID_PLAY_TYPE', '/playType', 'Cannot dispatch an unknown play type.')]);
    }
    if (activePlay.playType === 'scrimmage') {
      return validateTransition(activeSnapFromPlay(activePlay), candidate, options);
    }
    if (activePlay.playType === 'punt') return validatePuntTransition(activePlay, candidate, options);
    if (activePlay.playType === 'fieldGoal') return validateFieldGoalTransition(activePlay, candidate, options);
    return validateConversionTransition(activePlay, candidate, options);
  }

  function terminalPlacementForScrimmage(source, transition, validationOptions) {
    const context = normalizeContext(contextFrom(source));
    const validated = validateTransition(source, transition, validationOptions);
    if (!validated.ok) throw new FootballDomainError('INVALID_TRANSITION', validated.diagnostics);
    const result = validated.value;
    const nextPossession = oppositePossession(context.possession);
    if (result.resultKind === 'turnoverOnDowns') return immutable({
      nextPossession,
      nextStartYardLine: result.endYardLine,
      restartReason: 'turnoverOnDowns',
    });
    if (result.resultKind === 'turnover') return immutable({
      nextPossession,
      nextStartYardLine: startingYardFor(nextPossession),
      restartReason: 'turnoverReset',
    });
    return null;
  }

  const API = {
    RESULT_KINDS,
    PLAY_TYPES,
    PROJECTION_KEYS,
    SPECIAL_CONTEXT_KEYS,
    SPECIAL_PROJECTION_KEYS,
    FootballDomainError,
    clone,
    deepFreeze,
    normalizeContext,
    validateContext,
    projectGain,
    createSnap,
    reprojectGain,
    validateTransition,
    assertValidTransition,
    oppositePossession,
    startingYardFor,
    fieldGoalDistance,
    isFieldGoalLegal,
    tryYardLineFor,
    normalizeSpecialContext,
    validateSpecialContext,
    projectPunt,
    reprojectPunt,
    validatePuntTransition,
    projectFieldGoal,
    reprojectFieldGoal,
    validateFieldGoalTransition,
    projectConversion,
    reprojectConversion,
    validateConversionTransition,
    createActivePlay,
    activeSnapFromPlay,
    validatePlayTransition,
    terminalPlacementForScrimmage,
  };

  Object.defineProperty(root, 'FOOTBALL_DOMAIN', {
    value: Object.freeze(API),
    enumerable: true,
    configurable: false,
    writable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
