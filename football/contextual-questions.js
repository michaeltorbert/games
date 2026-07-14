// Truthful, curriculum-bounded Football question construction.
// Plain global, DOM-free, and deliberately independent from live game state.

const FOOTBALL_CONTEXTUAL_QUESTIONS = (() => {
  'use strict';

  const SCHEMA_VERSION = 1;
  const CURRENT_COMPLETED_PAGE = 143;
  const INCLUDED_THROUGH_PAGE = 179;

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
    'absoluteDifference',
    'add',
    'goalDistanceAfterGain',
    'driveDistancePlusGain',
    'ruleValue',
    'compare',
    'nextOrdinal',
  ]);

  const ANSWER_EXPOSURE_POLICIES = Object.freeze([
    'source-visible',
    'modeled-with-result-hidden',
    'hidden-until-worked',
  ]);

  const CURRICULUM_SOURCES = Object.freeze([
    'workbook',
    'football-only',
  ]);

  const RULES = deepFreeze({
    'field.goal.left': 0,
    'field.goal.right': 100,
    'game.touchdownPoints': 7,
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

  function comparisonSymbol(left, right) {
    if (left < right) return '<';
    if (left > right) return '>';
    return '=';
  }

  function ordinalChoices(value) {
    const numbers = [value, value - 1, value + 1, value - 2, value + 2, 1, 16]
      .filter((candidate, index, all) => candidate >= 1 && candidate <= 16 && all.indexOf(candidate) === index)
      .slice(0, 4);
    return numbers.map(ordinal);
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

  function baseShapeReason(snap) {
    if (!isRecord(snap)) return decline('invalid-snap', 'Expected one snap object.');
    if (!isRecord(snap.context)) return decline('invalid-context', 'Snap context is missing.');
    if (!isRecord(snap.proposal)) return decline('invalid-proposal', 'Snap proposal is missing.');
    const c = snap.context;
    const p = snap.proposal;
    if (!['offense', 'defense'].includes(c.possession)) return decline('invalid-possession', 'Possession must be offense or defense.');
    if (![1, -1].includes(c.direction)) return decline('invalid-direction', 'Direction must be 1 or -1.');
    if (!Number.isInteger(c.quarter) || c.quarter < 1 || c.quarter > 4) return decline('invalid-quarter', 'Quarter must be 1 through 4.');
    if (!Number.isInteger(c.down) || c.down < 1 || c.down > 4) return decline('invalid-down', 'Down must be 1 through 4.');
    if (!Number.isInteger(c.yardsToGo) || c.yardsToGo < 1 || c.yardsToGo > 10) return decline('invalid-yards-to-go', 'Yards to go must be 1 through 10.');
    if (!Number.isInteger(c.yardLine) || c.yardLine < 1 || c.yardLine > 99) return decline('invalid-yard-line', 'Yard line must be 1 through 99.');
    if (!Number.isInteger(c.firstDownLine) || c.firstDownLine < 0 || c.firstDownLine > 100) return decline('invalid-first-down-line', 'First-down line must be 0 through 100.');
    if (!Number.isInteger(c.driveStart) || c.driveStart < 0 || c.driveStart > 100) return decline('invalid-drive-start', 'Drive start must be 0 through 100.');
    if (!isRecord(c.scores) || !Number.isInteger(c.scores.player) || c.scores.player < 0 || !Number.isInteger(c.scores.opponent) || c.scores.opponent < 0) {
      return decline('invalid-scores', 'Committed scores must be nonnegative integers.');
    }
    if (!isRecord(c.totalYards) || !Number.isInteger(c.totalYards.player) || c.totalYards.player < 0 || !Number.isInteger(c.totalYards.opponent) || c.totalYards.opponent < 0) {
      return decline('invalid-total-yards', 'Committed team yard totals must be nonnegative integers.');
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
    curriculumSource,
    introducedOnPage = null,
  }) {
    if (!OPERATION_TYPES.includes(operationType)) throw new Error(`Unknown operation type ${operationType}.`);
    if (!ANSWER_EXPOSURE_POLICIES.includes(answerExposure)) throw new Error(`Unknown answer-exposure policy ${answerExposure}.`);
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
      meta: makeMeta({ familyId: 'yards-to-go-read', skill: 'football-number-sense', concept: 'line-to-gain', purpose: 'coreReview', tier: 'within-10', weight: 4, operationType: 'read', answerExposure: 'source-visible', curriculumSource: 'football-only' }),
      derive(snap) {
        const answer = snap.context.yardsToGo;
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'yardsToGo', '/context/yardsToGo')],
          operationType: 'read',
          operandIds: ['yardsToGo'],
          answer,
          prompt: `The scoreboard says ${ordinal(snap.context.down)} & ${answer}. How many yards are needed for a first down?`,
          hint: 'Read the number after the ampersand on the down-and-distance display.',
          explanation: `${ordinal(snap.context.down)} & ${answer} means ${answer} yard${answer === 1 ? '' : 's'} are needed.`,
          choiceSpec: numericChoiceSpec(1, 10),
          visualType: 'down-distance',
          visualData: { down: snap.context.down, yardsToGo: answer },
          initialAriaLabel: `${ordinal(snap.context.down)} down and ${answer} yards to go.`,
          guidedAriaLabel: `Focus on the ${answer} in ${ordinal(snap.context.down)} and ${answer}; it tells the yards needed.`,
          workedAriaLabel: `${ordinal(snap.context.down)} and ${answer} means the answer is ${answer} yards.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-missing-part', skill: 'missing-part', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', weight: 3.2, operationType: 'missingPart', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 41 }),
      derive(snap, profile) {
        const needed = snap.context.yardsToGo;
        const gain = appliedGain(snap);
        if (!(gain > 0 && gain < needed)) return { decline: decline('not-short-of-marker', 'This proposal is not a positive gain short of the old marker.', ['/proposal/appliedGain', '/context/yardsToGo']) };
        const answer = needed - gain;
        if (!inComputationBand(profile, needed, gain, answer)) return { decline: decline('outside-computation-band', 'The entire missing-part relation must fit the completed computation band.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap),
          operationType: 'missingPart', operandIds: ['yardsToGo', 'proposedGain'], answer,
          prompt: `${needed} yards are needed. If this play gains ${gain}, how many more yards are still needed?`,
          hint: `Start with ${needed} spaces and mark the ${gain} spaces the play could cover. Count the unmarked spaces.`,
          explanation: `${needed} - ${gain} = ${answer}, so ${answer} yard${answer === 1 ? '' : 's'} would still be needed.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'parts',
          visualData: { total: needed, knownPart: gain, missingPart: null },
          initialAriaLabel: `${needed} total yard spaces with ${gain} marked for the proposed gain; the remaining part is hidden.`,
          guidedAriaLabel: `${needed} total spaces. ${gain} are filled. Count the empty spaces without naming the result yet.`,
          workedAriaLabel: `${needed} splits into ${gain} and ${answer}; the missing part is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-exact', skill: 'difference', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', weight: 2.4, operationType: 'exactRemainder', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const needed = snap.context.yardsToGo;
        const gain = appliedGain(snap);
        if (gain !== needed) return { decline: decline('not-exact', 'The proposed gain does not exactly reach the old marker.', ['/proposal/appliedGain', '/context/yardsToGo']) };
        if (!inComputationBand(profile, needed, gain)) return { decline: decline('outside-computation-band', 'The exact relation must fit the completed computation band.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap), operationType: 'exactRemainder', operandIds: ['yardsToGo', 'proposedGain'], answer: 0,
          prompt: `${needed} yards are needed. If this play gains exactly ${gain}, how many yards short would it be?`,
          hint: 'Match each needed yard with one yard from the proposed gain.',
          explanation: `${needed} - ${gain} = 0. The play would reach the marker exactly.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'parts',
          visualData: { total: needed, knownPart: gain, missingPart: null },
          initialAriaLabel: `${needed} needed spaces and ${gain} proposed-gain spaces line up; the remainder is hidden.`,
          guidedAriaLabel: 'Pair every needed space with a proposed-gain space, then check whether any space is left.',
          workedAriaLabel: `${needed} minus ${gain} is 0; no yard is left short.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-surplus', skill: 'difference', concept: 'line-to-gain', purpose: 'weakSpot', tier: 'within-10', weight: 2.6, operationType: 'surplus', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const needed = snap.context.yardsToGo;
        const gain = appliedGain(snap);
        if (gain <= needed) return { decline: decline('no-surplus', 'The proposed gain does not pass the old marker.', ['/proposal/appliedGain', '/context/yardsToGo']) };
        const answer = gain - needed;
        if (!inComputationBand(profile, gain, needed, answer)) return { decline: decline('outside-computation-band', 'Gain, need, and surplus must all fit within 10.') };
        return eligible(makeSemantic({
          bindings: lineBindings(snap), operationType: 'surplus', operandIds: ['proposedGain', 'yardsToGo'], answer,
          prompt: `${needed} yards are needed. If this play gains ${gain}, how many yards past the marker would it go?`,
          hint: `Use ${needed} of the ${gain} proposed yards to reach the marker. Count what remains.`,
          explanation: `${gain} - ${needed} = ${answer}, so the play would go ${answer} yard${answer === 1 ? '' : 's'} past the marker.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'marker-strip',
          visualData: { needed, proposedGain: gain, surplus: null },
          initialAriaLabel: `${gain} proposed yard spaces with the marker after ${needed}; the distance past it is hidden.`,
          guidedAriaLabel: `Count the proposed spaces after the marker at ${needed}, without naming the result yet.`,
          workedAriaLabel: `${gain} minus ${needed} is ${answer}; the surplus is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'line-to-gain-fact-family', skill: 'fact-family', concept: 'line-to-gain', purpose: 'coreReview', tier: 'within-10', weight: 2.3, operationType: 'factFamilyMissingPart', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 98 }),
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
          prompt: `This exact play is set to gain ${gain} yards, and ${needed} yards are needed. Which symbol makes ${gain} ? ${needed} true?`,
          hint: comparisonHint,
          explanation: `${gain} ${answer} ${needed}. The proposed gain is ${gain === needed ? 'exactly the same as' : gain > needed ? 'greater than' : 'less than'} the yards needed.`,
          choiceSpec: fixedChoiceSpec(['<', '=', '>']), visualType: 'comparison',
          visualData: { leftLabel: 'PLAY', leftValue: gain, rightLabel: 'NEED', rightValue: needed },
          initialAriaLabel: `Compare the proposed gain of ${gain} yards with the ${needed} yards needed; the comparison symbol is hidden.`,
          guidedAriaLabel: gain >= 10 || needed >= 10
            ? `Compare ${gain} and ${needed} by tens, then ones; the symbol remains hidden.`
            : `Compare ${gain} and ${needed}; the symbol remains hidden.`,
          workedAriaLabel: `${gain} ${answer} ${needed}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-read', skill: 'place-value', concept: 'field-distance', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 2.2, operationType: 'distance', answerExposure: 'source-visible', curriculumSource: 'workbook', introducedOnPage: 126 }),
      derive(snap, profile) {
        const answer = goalDistance(snap);
        if (!inDisplayBand(profile, answer)) return { decline: decline('outside-display-band', 'Goal distance must fit the completed display band.') };
        return eligible(makeSemantic({
          bindings: goalBindings(snap), operationType: 'distance', operandIds: ['ballYardLine', 'goalLine'], answer,
          prompt: 'Read the number on the goal-distance strip. How many yards is the ball from the end zone?',
          hint: 'Read the full number shown across the separate goal-distance strip.',
          explanation: `The strip from the ball to the goal line is ${answer} yard${answer === 1 ? '' : 's'} long.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'goal-distance',
          visualData: { ballYardLine: snap.context.yardLine, goalLine: goalLine(snap), distance: answer },
          initialAriaLabel: `Goal-distance strip labeled ${answer} yards from the ball to the end zone.`,
          guidedAriaLabel: `Read both digits in ${answer} from left to right on the goal-distance strip.`,
          workedAriaLabel: `The goal-distance strip reads ${answer} yards.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-tens', skill: 'place-value', concept: 'place-value', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 2.4, operationType: 'tensOfDistance', answerExposure: 'source-visible', curriculumSource: 'workbook', introducedOnPage: 124 }),
      derive(snap, profile) {
        const distance = goalDistance(snap);
        if (distance < 10 || !inDisplayBand(profile, distance)) return { decline: decline('not-two-digit-distance', 'Tens work needs a displayed goal distance from 10 through 100.') };
        const answer = Math.floor(distance / 10);
        return eligible(makeSemantic({
          bindings: goalBindings(snap), operationType: 'tensOfDistance', operandIds: ['ballYardLine', 'goalLine'], answer,
          prompt: `The goal-distance model shows ${distance}. How many tens are in ${distance}?`,
          hint: `Look at the tens place in ${distance}.`,
          explanation: `${distance} has ${answer} ten${answer === 1 ? '' : 's'} and ${distance % 10} ones.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'base-ten-distance',
          visualData: { distance, tens: answer, ones: distance % 10 },
          initialAriaLabel: `${distance} yards shown with base-ten groups; count the groups of ten.`,
          guidedAriaLabel: `${distance} is grouped into tens and ones. Focus on the groups of ten.`,
          workedAriaLabel: `${distance} has ${answer} tens and ${distance % 10} ones.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-ones', skill: 'place-value', concept: 'place-value', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 2, operationType: 'onesOfDistance', answerExposure: 'source-visible', curriculumSource: 'workbook', introducedOnPage: 124 }),
      derive(snap, profile) {
        const distance = goalDistance(snap);
        if (distance < 10 || !inDisplayBand(profile, distance)) return { decline: decline('not-two-digit-distance', 'Ones work needs a displayed goal distance from 10 through 100.') };
        const answer = distance % 10;
        return eligible(makeSemantic({
          bindings: goalBindings(snap), operationType: 'onesOfDistance', operandIds: ['ballYardLine', 'goalLine'], answer,
          prompt: `The goal-distance model shows ${distance}. How many ones are in ${distance}?`,
          hint: `Look at the ones place in ${distance}.`,
          explanation: `${distance} has ${Math.floor(distance / 10)} tens and ${answer} ones.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'base-ten-distance',
          visualData: { distance, tens: Math.floor(distance / 10), ones: answer },
          initialAriaLabel: `${distance} yards shown with base-ten groups; count the single ones.`,
          guidedAriaLabel: `${distance} is grouped into tens and ones. Focus on the single ones.`,
          workedAriaLabel: `${distance} has ${Math.floor(distance / 10)} tens and ${answer} ones.`,
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
        const team = snap.context.possession === 'offense' ? 'Duke' : 'UNC';
        return eligible(makeSemantic({
          bindings: [
            teamTotalYardsBinding(snap),
            contextBinding(snap, 'proposedGain', '/proposal/appliedGain'),
          ],
          operationType: 'add', operandIds: ['teamTotalYards', 'proposedGain'], answer,
          prompt: `${team} has ${current} total offensive yards. If this exact play gains ${gain}, what would the team total be?`,
          hint: `Count forward ${gain} from ${current}, one yard at a time.`,
          explanation: `${current} + ${gain} = ${answer}, so ${team} would have ${answer} total offensive yards.`,
          choiceSpec: numericChoiceSpec(90, 120), visualType: 'hundreds-move',
          visualData: { team, startTotal: current, proposedGain: gain, resultTotal: null },
          initialAriaLabel: `${team} has ${current} total offensive yards with ${gain} proposed yards; the new total is hidden.`,
          guidedAriaLabel: `Count forward ${gain} single yards from ${current}; the final total remains hidden.`,
          workedAriaLabel: `${current} plus ${gain} is ${answer} total offensive yards for ${team}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'drive-distance-scaffolded', skill: 'difference', concept: 'drive-distance', purpose: 'weakSpot', tier: 'within-10', weight: 1.8, operationType: 'absoluteDifference', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const answer = Math.abs(snap.context.yardLine - snap.context.driveStart);
        if (!(answer > 0 && inComputationBand(profile, answer))) return { decline: decline('drive-distance-not-scaffoldable', 'Current drive movement must be a positive distance within the computation band.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'driveStart', '/context/driveStart'), contextBinding(snap, 'ballYardLine', '/context/yardLine')],
          operationType: 'absoluteDifference', operandIds: ['driveStart', 'ballYardLine'], answer,
          prompt: 'Count the spaces from the drive-start marker to the current-ball marker. How many yards has this drive moved so far?',
          hint: 'Use the separate drive strip and count one space at a time from Start to Now.',
          explanation: `There are ${answer} spaces from the drive start to the current ball, so the drive has moved ${answer} yards.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'drive-strip',
          visualData: { startYardLine: snap.context.driveStart, ballYardLine: snap.context.yardLine, distance: null },
          initialAriaLabel: 'A separate drive strip marks Start and Now no more than ten spaces apart; the distance is hidden.',
          guidedAriaLabel: 'Count each space from the Start marker to the Now marker without announcing the total yet.',
          workedAriaLabel: `Start and Now are ${answer} yard spaces apart.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'committed-score-total', skill: 'addition', concept: 'committed-score', purpose: 'coreReview', tier: 'within-10', weight: 1.3, operationType: 'add', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 18 }),
      derive(snap, profile) {
        const player = snap.context.scores.player;
        const opponent = snap.context.scores.opponent;
        const answer = player + opponent;
        if (answer === 0 || !inComputationBand(profile, player, opponent, answer)) return { decline: decline('score-relation-outside-band', 'Both committed scores and their total must fit within 10.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'playerScore', '/context/scores/player'), contextBinding(snap, 'opponentScore', '/context/scores/opponent')],
          operationType: 'add', operandIds: ['playerScore', 'opponentScore'], answer,
          prompt: `The committed score is Duke ${player}, UNC ${opponent}. How many points have both teams scored in all?`,
          hint: `Join ${player} Duke counters and ${opponent} UNC counters.`,
          explanation: `${player} + ${opponent} = ${answer} committed points in all.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'score-parts',
          visualData: { playerScore: player, opponentScore: opponent, total: null },
          initialAriaLabel: `${player} committed Duke score counters and ${opponent} committed UNC score counters; the total is hidden.`,
          guidedAriaLabel: `Join the group of ${player} and the group of ${opponent}, then count all counters without announcing the total yet.`,
          workedAriaLabel: `${player} plus ${opponent} equals ${answer} committed points.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'committed-score-difference', skill: 'difference', concept: 'committed-score', purpose: 'weakSpot', tier: 'within-10', weight: 1.2, operationType: 'absoluteDifference', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 110 }),
      derive(snap, profile) {
        const player = snap.context.scores.player;
        const opponent = snap.context.scores.opponent;
        const answer = Math.abs(player - opponent);
        if (player + opponent === 0 || !inComputationBand(profile, player, opponent, answer)) return { decline: decline('score-relation-outside-band', 'Both committed scores and the entire difference relation must fit within 10.') };
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'playerScore', '/context/scores/player'), contextBinding(snap, 'opponentScore', '/context/scores/opponent')],
          operationType: 'absoluteDifference', operandIds: ['playerScore', 'opponentScore'], answer,
          prompt: `The committed score is Duke ${player}, UNC ${opponent}. How many points apart are the teams?`,
          hint: 'Pair one Duke point with one UNC point. Count the points without partners.',
          explanation: `${Math.max(player, opponent)} - ${Math.min(player, opponent)} = ${answer}, so the committed scores are ${answer} point${answer === 1 ? '' : 's'} apart.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'score-difference',
          visualData: { playerScore: player, opponentScore: opponent, difference: null },
          initialAriaLabel: `${player} committed Duke counters and ${opponent} committed UNC counters are aligned; the difference is hidden.`,
          guidedAriaLabel: 'Pair the two committed-score groups and count the unpaired counters without announcing the result yet.',
          workedAriaLabel: `The committed scores differ by ${answer} point${answer === 1 ? '' : 's'}.`,
        }));
      },
    },
    {
      meta: makeMeta({
        familyId: 'drive-play-ordinal',
        skill: 'ordinal-numbers',
        concept: 'drive-play-order',
        purpose: 'approvedExtension',
        tier: 'football-context',
        weight: 1.2,
        operationType: 'nextOrdinal',
        answerExposure: 'modeled-with-result-hidden',
        curriculumSource: 'workbook',
        introducedOnPage: 155,
      }),
      derive(snap) {
        const playNumber = snap.context.drivePlays + 1;
        if (playNumber < 1 || playNumber > 16) return { decline: decline('drive-play-outside-ordinal-band', 'The current drive play must be first through sixteenth.') };
        const answer = ordinal(playNumber);
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'completedDrivePlays', '/context/drivePlays')],
          operationType: 'nextOrdinal', operandIds: ['completedDrivePlays'], answer,
          prompt: `This snap is play number ${playNumber} of the drive. Which ordinal name tells its place in the drive?`,
          hint: `Say the ordinal for ${playNumber}: not how many plays there are, but where this play comes in order.`,
          explanation: `Play number ${playNumber} is the ${answer} play of the drive.`,
          choiceSpec: fixedChoiceSpec(ordinalChoices(playNumber)), visualType: 'drive-play-order',
          visualData: { completedDrivePlays: snap.context.drivePlays, playNumber },
          initialAriaLabel: `The current snap is play number ${playNumber} of the drive; its ordinal name is hidden.`,
          guidedAriaLabel: `Translate play number ${playNumber} into its ordinal place without revealing the answer.`,
          workedAriaLabel: `Play number ${playNumber} is the ${answer} play of the drive.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'quarter-read', skill: 'football-number-sense', concept: 'quarter-read', purpose: 'coreReview', tier: 'football-context', weight: 0.8, operationType: 'ordinal', answerExposure: 'source-visible', curriculumSource: 'football-only' }),
      derive(snap) {
        const answer = ordinal(snap.context.quarter);
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'quarter', '/context/quarter')], operationType: 'ordinal', operandIds: ['quarter'], answer,
          prompt: `The scoreboard shows Q${snap.context.quarter}. Which quarter is the game in?`,
          hint: 'Match the Q number to its ordinal name.',
          explanation: `Q${snap.context.quarter} means the ${answer} quarter.`,
          choiceSpec: fixedChoiceSpec(['1st', '2nd', '3rd', '4th']), visualType: 'scoreboard-read',
          visualData: { label: `Q${snap.context.quarter}` },
          initialAriaLabel: `Scoreboard quarter display Q${snap.context.quarter}.`,
          guidedAriaLabel: `Read Q${snap.context.quarter} as an ordinal quarter name.`,
          workedAriaLabel: `Q${snap.context.quarter} is the ${answer} quarter.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'down-read', skill: 'football-number-sense', concept: 'down-read', purpose: 'coreReview', tier: 'football-context', weight: 1.1, operationType: 'ordinal', answerExposure: 'source-visible', curriculumSource: 'football-only' }),
      derive(snap) {
        const answer = ordinal(snap.context.down);
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'down', '/context/down')], operationType: 'ordinal', operandIds: ['down'], answer,
          prompt: `The down-and-distance display begins with ${answer}. What down is it?`,
          hint: 'Read the ordinal before the ampersand.',
          explanation: `The display begins with ${answer}, so it is ${answer} down.`,
          choiceSpec: fixedChoiceSpec(['1st', '2nd', '3rd', '4th']), visualType: 'down-distance',
          visualData: { down: snap.context.down, yardsToGo: snap.context.yardsToGo },
          initialAriaLabel: `${answer} down and ${snap.context.yardsToGo} yards to go.`,
          guidedAriaLabel: `Focus on the first part, ${answer}, in the down-and-distance display.`,
          workedAriaLabel: `The current down is ${answer}.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'goal-distance-minus-whole-tens', skill: 'plus-minus-ten', concept: 'field-distance', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 1.9, operationType: 'goalDistanceAfterGain', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 140 }),
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
          prompt: `The ball is ${before} yards from the end zone. If this play gains ${gain}, how far from the end zone would it be?`,
          hint: `Move back ${gain / 10} full group${gain === 10 ? '' : 's'} of ten from ${before}. The ones digit stays the same.`,
          explanation: `${before} - ${gain} = ${answer}. The proposed play would leave ${answer} yards to the end zone.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'base-ten-move',
          visualData: { startDistance: before, wholeTensMoved: gain / 10, direction: -1, resultDistance: null },
          initialAriaLabel: `${before} shown in base-ten groups with a proposed move of ${gain} yards; the new distance is hidden.`,
          guidedAriaLabel: `Remove ${gain / 10} group${gain === 10 ? '' : 's'} of ten and keep the ones unchanged, without announcing the result yet.`,
          workedAriaLabel: `${before} minus ${gain} is ${answer} yards from the end zone.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'drive-distance-plus-whole-tens', skill: 'plus-minus-ten', concept: 'drive-distance', purpose: 'completedPlaceValue', tier: 'two-digit-structure', weight: 1.5, operationType: 'driveDistancePlusGain', answerExposure: 'modeled-with-result-hidden', curriculumSource: 'workbook', introducedOnPage: 140 }),
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
          prompt: `This drive has moved ${current} yards. If this play gains ${gain}, how many yards would the drive have moved in all?`,
          hint: `Add ${gain / 10} full group${gain === 10 ? '' : 's'} of ten to ${current}.`,
          explanation: `${current} + ${gain} = ${answer}. The drive would have moved ${answer} yards in all.`,
          choiceSpec: numericChoiceSpec(0, 100), visualType: 'base-ten-move',
          visualData: { startDistance: current, wholeTensMoved: gain / 10, direction: 1, resultDistance: null },
          initialAriaLabel: `${current} yards of committed drive movement with a proposed addition of ${gain}; the new total is hidden.`,
          guidedAriaLabel: `Add ${gain / 10} group${gain === 10 ? '' : 's'} of ten to the drive model without announcing the total yet.`,
          workedAriaLabel: `${current} plus ${gain} is ${answer} yards of drive movement.`,
        }));
      },
    },
    {
      meta: makeMeta({ familyId: 'touchdown-points', skill: 'football-number-sense', concept: 'scoring-rule', purpose: 'coreReview', tier: 'football-context', weight: 0.7, operationType: 'ruleValue', answerExposure: 'hidden-until-worked', curriculumSource: 'football-only' }),
      derive(snap) {
        if (snap.proposal.resultKind !== 'touchdown') return { decline: decline('not-touchdown-proposal', 'The scoring constant is contextual only for a touchdown proposal.', ['/proposal/resultKind']) };
        const answer = RULES['game.touchdownPoints'];
        return eligible(makeSemantic({
          bindings: [contextBinding(snap, 'resultKind', '/proposal/resultKind'), ruleBinding('touchdownPoints', 'game.touchdownPoints')],
          operationType: 'ruleValue', operandIds: ['touchdownPoints'], answer,
          prompt: 'If this play reaches the end zone, how many points does this game award for the touchdown and automatic extra point?',
          hint: 'Use the scoring rule for this game, not the projected scoreboard.',
          explanation: `This game awards ${answer} points for a touchdown with its automatic extra point.`,
          choiceSpec: numericChoiceSpec(0, 10), visualType: 'touchdown-rule',
          visualData: { resultKind: 'touchdown', points: null },
          initialAriaLabel: 'A touchdown scoring badge with its point value hidden.',
          guidedAriaLabel: 'Think of the fixed touchdown scoring rule; the point value remains hidden.',
          workedAriaLabel: `The touchdown scoring rule awards ${answer} points.`,
        }));
      },
    },
  ];

  const FAMILY_BY_ID = new Map(FAMILY_DEFINITIONS.map((definition) => [definition.meta.familyId, definition]));

  function inspect(snap, profileInput = DEFAULT_PROFILE) {
    const profile = normalizeProfile(profileInput);
    const commonReason = baseShapeReason(snap);
    const eligibleCandidates = [];
    const declined = [];

    for (const definition of FAMILY_DEFINITIONS) {
      const meta = definition.meta;
      let reason = commonReason;
      let result = null;
      if (!reason && meta.curriculumSource === 'workbook' && meta.introducedOnPage > profile.includedThroughPage) {
        reason = decline('curriculum-not-included', `Family comes from page ${meta.introducedOnPage}, but the approved question ceiling is page ${profile.includedThroughPage}.`);
      }
      if (!reason) {
        try {
          result = definition.derive(snap, profile);
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
      return {
        stage: name,
        type: semantic.visualType,
        bindingIds,
        answerId,
        data: clone(semantic.visualData),
        result: revealsAnswer ? { answerId, value: clone(semantic.answer) } : null,
        revealsAnswer,
        ariaLabel: semantic.visualAriaLabels[name],
      };
    };
    return { initial: stage('initial'), guided: stage('guided'), worked: stage('worked') };
  }

  function groundedCopy(text, ariaLabel, bindingIds, answerId) {
    return { text, ariaLabel: ariaLabel || text.replace(/\n/g, ' '), bindingIds: [...bindingIds], answerId };
  }

  function build(snap, familyId, options = {}) {
    const definition = FAMILY_BY_ID.get(familyId);
    if (!definition) throw contractError('unknown-family', `Unknown contextual question family ${familyId}.`);
    const commonReason = baseShapeReason(snap);
    if (commonReason) throw contractError(commonReason.code, commonReason.detail);

    const profile = normalizeProfile(options.profile || DEFAULT_PROFILE);
    if (definition.meta.curriculumSource === 'workbook' && definition.meta.introducedOnPage > profile.includedThroughPage) {
      throw contractError('curriculum-not-included', `${familyId} comes from page ${definition.meta.introducedOnPage}, beyond the approved question ceiling of page ${profile.includedThroughPage}.`);
    }

    const result = definition.derive(snap, profile);
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
      q: prompt.text,
      hintText: hint.text,
      explain: workedExplanation.text,
      visuals,
      support,
      math: { ...visuals[support], support },
      grounding: { bindingIds, answerId },
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
    DEFAULT_PROFILE,
    OPERATION_TYPES,
    ANSWER_EXPOSURE_POLICIES,
    CURRICULUM_SOURCES,
    RULES,
    inspect,
    build,
  });
})();

if (typeof globalThis !== 'undefined') {
  globalThis.FOOTBALL_CONTEXTUAL_QUESTIONS = FOOTBALL_CONTEXTUAL_QUESTIONS;
}
