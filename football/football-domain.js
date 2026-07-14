(function attachFootballDomain(root) {
  'use strict';

  const RESULT_KINDS = Object.freeze([
    'touchdown',
    'firstDown',
    'turnoverOnDowns',
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
    'crossedMidfield',
    'driveTotal',
    'distanceToGoalBefore',
    'distanceToGoalAfter',
  ]);

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

  function inspectContext(input) {
    const diagnostics = [];
    if (!isRecord(input)) {
      return {
        diagnostics: [diagnostic('INVALID_CONTEXT', '/', 'Expected a context object.', 'object', input)],
        value: null,
      };
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
    const distanceOkay = integerDiagnostic(yardsToGo, '/yardsToGo', 1, 10, diagnostics);
    integerDiagnostic(quarter, '/quarter', 1, 4, diagnostics);
    integerDiagnostic(down, '/down', 1, 4, diagnostics);
    const driveStartOkay = integerDiagnostic(driveStart, '/driveStart', 0, 100, diagnostics);
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

    if (yardLineOkay && driveStartOkay && (direction === 1 || direction === -1)) {
      const driveMovedBackward = direction === 1 ? driveStart > yardLine : driveStart < yardLine;
      if (driveMovedBackward) {
        diagnostics.push(diagnostic(
          'INCONSISTENT_DRIVE_START',
          '/driveStart',
          'Drive start cannot be ahead of the current ball in the offense direction.',
          direction === 1 ? `<= ${yardLine}` : `>= ${yardLine}`,
          driveStart,
        ));
      }
    }

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
    integerDiagnostic(playerTotalYards, '/totalYards/player', 0, Number.MAX_SAFE_INTEGER, diagnostics);
    integerDiagnostic(opponentTotalYards, '/totalYards/opponent', 0, Number.MAX_SAFE_INTEGER, diagnostics);

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
      const plannedCallKey = privateOpponentSnapshot.plannedCallKey;
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

  function projectGain(input, requestedGain) {
    const context = normalizeContext(input && input.context ? input.context : input);
    const diagnostics = [];
    if (!Number.isInteger(requestedGain) || requestedGain < 0 || requestedGain > 100) {
      diagnostics.push(diagnostic(
        'INVALID_GAIN',
        '/requestedGain',
        'Gain must be an integer from 0 through 100.',
        { integer: true, min: 0, max: 100 },
        requestedGain,
      ));
      throw new FootballDomainError('INVALID_GAIN', diagnostics);
    }

    const distanceBefore = distanceToGoal(context.yardLine, context.direction);
    const appliedGain = Math.min(requestedGain, distanceBefore);
    const endYardLine = context.yardLine + (appliedGain * context.direction);
    const touchdown = endYardLine === (context.direction === 1 ? 100 : 0);
    const firstDown = !touchdown && reachedLine(endYardLine, context.firstDownLine, context.direction);
    const turnoverOnDowns = !touchdown && !firstDown && context.down === 4;
    const resultKind = touchdown
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
      crossedMidfield: context.direction === 1
        ? context.yardLine < 50 && endYardLine >= 50
        : context.yardLine > 50 && endYardLine <= 50,
      driveTotal: Math.abs(endYardLine - context.driveStart),
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

  function reprojectGain(source, requestedGain) {
    return projectGain(contextFrom(source), requestedGain);
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
      const permitReprojection = isRecord(options) && options.allowReprojection === true;
      const requestedGain = sourceIsSnap && !permitReprojection
        ? source.proposal.requestedGain
        : candidate && candidate.requestedGain;
      const expected = projectGain(context, requestedGain);
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

  const API = {
    RESULT_KINDS,
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
  };

  Object.defineProperty(root, 'FOOTBALL_DOMAIN', {
    value: Object.freeze(API),
    enumerable: true,
    configurable: false,
    writable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
