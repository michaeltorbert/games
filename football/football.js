const GAME_VERSION = '1.20.1';
let prevPlayerScore = -1, prevOpponentScore = -1;
let playerRunTimer = 0, playerCelebrateTimer = 0, playerCelebrateDelayTimer = 0;
const EZ = 5;
function yardToPct(y) { return EZ + (y / 100) * (100 - 2 * EZ); }

const DOWN_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const QUARTER_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const START_YARD = 20;
const TD_POINTS = 7;
const POSSESSIONS_PER_QUARTER = 4;

const COACH_CONCEPT_LABELS = Object.freeze({
  'missing-part': 'Missing parts to 10',
  difference: 'Finding the difference',
  addition: 'Adding within 10',
  subtraction: 'Subtracting within 10',
  'fact-family': 'Fact families',
  'teen-place-value': 'Teen numbers',
  'place-value': 'Tens and ones',
  'plus-minus-ten': 'Adding or taking 10',
  'hundred-chart': 'Hundred chart moves',
  'two-digit-comparison': 'Comparing two-digit numbers',
  'quarter-half-structure': 'Quarters and halves',
  'down-progression': 'Down order',
  'line-to-gain': 'Yards to a first down',
  'yard-line-translation': 'Reading yard lines',
  'red-zone-math': 'Red-zone math',
  'field-distance': 'Field distance',
  'drive-distance': 'Drive distance',
  'committed-score': 'Reading the score',
  'quarter-read': 'Reading the quarter',
  'down-read': 'Reading the down',
  'scoring-rule': 'Touchdown points',
  'play-outcome': 'Reading the play result',
  'line-to-gain-comparison': 'Comparing the play to the marker',
  'team-total-yards': 'Team yards through 120',
  'drive-play-order': 'Play order in the drive',
});

const OFFENSE_CALLS = {
  shortRun: {
    key: 'shortRun',
    label: 'Short Run',
    desc: 'Steady · 2-4 yds',
    risk: 'easy',
    gRange: [2, 4],
  },
  shortPass: {
    key: 'shortPass',
    label: 'Short Pass',
    desc: 'Quick · 4-7 yds',
    risk: 'easy',
    gRange: [4, 7],
  },
  longRun: {
    key: 'longRun',
    label: 'Long Run',
    desc: 'Bold · 6-12 yds',
    risk: 'medium',
    gRange: [6, 12],
  },
  mediumPass: {
    key: 'mediumPass',
    label: 'Medium Pass',
    desc: 'Big play · 8-16 yds',
    risk: 'hard',
    gRange: [8, 16],
  },
  longPass: {
    key: 'longPass',
    label: 'Long Pass',
    desc: 'Deep shot · 12-25 yds',
    risk: 'very-hard',
    gRange: [12, 25],
  },
};

const DEFENSE_CALLS = {
  run: {
    key: 'run',
    label: 'Run Defense',
    desc: 'Closes run lanes',
    risk: 'easy',
    covers: ['shortRun', 'longRun'],
  },
  shortPass: {
    key: 'shortPass',
    label: 'Short Pass D',
    desc: 'Covers quick throws',
    risk: 'easy',
    covers: ['shortPass'],
  },
  mediumPass: {
    key: 'mediumPass',
    label: 'Medium Pass D',
    desc: 'Protects the middle',
    risk: 'medium',
    covers: ['mediumPass'],
  },
  deepPass: {
    key: 'deepPass',
    label: 'Deep Pass D',
    desc: 'Protects the deep ball',
    risk: 'hard',
    covers: ['longPass'],
  },
};

// Play diagram SVGs for call tiles
const PLAY_DIAGRAMS = {
  // Offense: gold strokes
  shortRun: `<svg viewBox="0 0 120 52"><line x1="60" y1="42" x2="60" y2="28" stroke="#ffd62e" stroke-width="2.5" stroke-linecap="round"/><circle cx="60" cy="44" r="4" fill="#ffd62e"/><circle cx="60" cy="22" r="3.5" fill="white" opacity="0.7"/><line x1="60" y1="22" x2="60" y2="8" stroke="#ffd62e" stroke-width="3" stroke-linecap="round" marker-end="url(#ah)"/><defs><marker id="ah" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6z" fill="#ffd62e"/></marker></defs></svg>`,
  shortPass: `<svg viewBox="0 0 120 52"><circle cx="60" cy="42" r="4" fill="#ffd62e"/><line x1="60" y1="38" x2="60" y2="28" stroke="#9ee7ff" stroke-width="2" stroke-dasharray="3,3"/><polyline points="60,28 78,12" fill="none" stroke="#9ee7ff" stroke-width="2.5" stroke-linecap="round"/><circle cx="80" cy="10" r="3" fill="#9ee7ff" opacity="0.8"/></svg>`,
  longRun: `<svg viewBox="0 0 120 52"><circle cx="60" cy="42" r="4" fill="#ffd62e"/><path d="M60,38 Q60,28 44,18 Q36,12 28,8" fill="none" stroke="#ffd62e" stroke-width="3" stroke-linecap="round"/><circle cx="26" cy="7" r="3" fill="#ffd62e" opacity="0.8"/></svg>`,
  mediumPass: `<svg viewBox="0 0 120 52"><circle cx="50" cy="42" r="4" fill="#ffd62e"/><line x1="50" y1="38" x2="50" y2="30" stroke="#9ee7ff" stroke-width="2" stroke-dasharray="3,3"/><polyline points="50,30 70,22 90,22" fill="none" stroke="#9ee7ff" stroke-width="2.5" stroke-linecap="round"/><circle cx="92" cy="22" r="3" fill="#9ee7ff" opacity="0.8"/></svg>`,
  longPass: `<svg viewBox="0 0 120 52"><circle cx="60" cy="42" r="4" fill="#ffd62e"/><line x1="60" y1="38" x2="60" y2="30" stroke="#9ee7ff" stroke-width="2" stroke-dasharray="3,3"/><line x1="60" y1="30" x2="60" y2="6" stroke="#9ee7ff" stroke-width="2.5" stroke-linecap="round"/><circle cx="60" cy="4" r="3" fill="#9ee7ff" opacity="0.8"/></svg>`,
  // Defense: orange strokes
  run: `<svg viewBox="0 0 120 52"><line x1="20" y1="26" x2="100" y2="26" stroke="#ffb347" stroke-width="3" stroke-linecap="round" opacity="0.6"/><circle cx="40" cy="26" r="3.5" fill="white" opacity="0.7"/><circle cx="60" cy="26" r="3.5" fill="white" opacity="0.7"/><circle cx="80" cy="26" r="3.5" fill="white" opacity="0.7"/><line x1="60" y1="22" x2="60" y2="10" stroke="#ffb347" stroke-width="2.5" stroke-linecap="round"/><polygon points="56,11 60,4 64,11" fill="#ffb347"/></svg>`,
  'defense-shortPass': `<svg viewBox="0 0 120 52"><circle cx="50" cy="14" r="3.5" fill="white" opacity="0.7"/><circle cx="70" cy="14" r="3.5" fill="white" opacity="0.7"/><path d="M50,18 Q50,32 60,38" fill="none" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/><path d="M70,18 Q70,32 60,38" fill="none" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="40" r="3" fill="#ffb347" opacity="0.6"/></svg>`,
  'defense-mediumPass': `<svg viewBox="0 0 120 52"><circle cx="36" cy="12" r="3.5" fill="white" opacity="0.7"/><circle cx="84" cy="12" r="3.5" fill="white" opacity="0.7"/><path d="M36,16 Q36,30 60,36" fill="none" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/><path d="M84,16 Q84,30 60,36" fill="none" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="26" r="8" fill="none" stroke="#ffb347" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.5"/></svg>`,
  deepPass: `<svg viewBox="0 0 120 52"><circle cx="42" cy="10" r="3.5" fill="white" opacity="0.7"/><circle cx="78" cy="10" r="3.5" fill="white" opacity="0.7"/><line x1="42" y1="14" x2="42" y2="42" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/><line x1="78" y1="14" x2="78" y2="42" stroke="#ffb347" stroke-width="2" stroke-linecap="round"/><line x1="30" y1="42" x2="90" y2="42" stroke="#ffb347" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/></svg>`,
};

function playDiagramSvg(callKey, possession) {
  if (possession === 'defense') {
    return PLAY_DIAGRAMS['defense-' + callKey] || PLAY_DIAGRAMS[callKey] || '';
  }
  return PLAY_DIAGRAMS[callKey] || '';
}

// Play-by-play copy lives in copy.js (PLAY_OUTCOME_COPY, POSSESSION_COPY,
// DESK_HEADER_COPY), loaded before this file.

let state = {};
let advTimer = null;
let footballRng = Math.random;
let schedulerRng = Math.random;
let presentationRng = Math.random;
let sessionInitialized = false;
let contextSequence = 1;
let questionSequence = 1;
let questionFaultMode = null;

function mixSeed(seed, salt) {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function makePrng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

function installRngStreams(rootSeed) {
  const seed = rootSeed == null
    ? Math.floor(Math.random() * 0x100000000) >>> 0
    : Number(rootSeed) >>> 0;
  footballRng = makePrng(mixSeed(seed, 0x464f4f54));
  schedulerRng = makePrng(mixSeed(seed, 0x53434844));
  presentationRng = makePrng(mixSeed(seed, 0x50524553));
  return seed;
}

function createLearningSession() {
  return FOOTBALL_LEARNING.createSession(FOOTBALL_STATS.masterySnapshot());
}

let learningSession = null;
let statsSession = null;
let pendingStatsPlay = null;

function initGameSession(rootSeed) {
  if (sessionInitialized) throw new Error('Football game session is already initialized');
  installRngStreams(rootSeed);
  learningSession = createLearningSession();
  statsSession = FOOTBALL_STATS.createSession();
  pendingStatsPlay = null;
  contextSequence = 1;
  questionSequence = 1;
  sessionInitialized = true;
}

function clearGameSessionInitialization() {
  sessionInitialized = false;
  footballRng = Math.random;
  schedulerRng = Math.random;
  presentationRng = Math.random;
  learningSession = null;
  statsSession = null;
  pendingStatsPlay = null;
  contextSequence = 1;
  questionSequence = 1;
}

function dispatchFootballEvent(type, detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(type, {
    detail: FOOTBALL_LEARNING.snapshot(detail),
  }));
}

function reportQuestionDiagnostic(code, details = {}) {
  const diagnostic = {
    schemaVersion: 1,
    code,
    ...details,
    familyId: details.familyId ?? null,
    contextId: details.contextId ?? null,
    questionInstanceId: details.questionInstanceId ?? null,
  };
  console.warn(`[football:${code}]`, details.message || 'Contextual question subsystem fallback');
  dispatchFootballEvent('football:diagnostic', diagnostic);
  return diagnostic;
}

function choose(a) {
  return a[Math.floor(presentationRng() * a.length)];
}

function randomInt(min, max) {
  return Math.floor(footballRng() * (max - min + 1)) + min;
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(presentationRng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ydLabel(y, short) {
  const v = clamp(Math.round(y), 0, 100);
  const opp = short ? 'opp' : 'opponent';
  if (v < 50) return `own ${v}`;
  if (v === 50) return '50';
  return `${opp} ${100 - v}`;
}

function fieldNumber(y) {
  return y <= 50 ? y : 100 - y;
}

function yds(n) {
  return n === 1 ? '1 yard' : `${n} yards`;
}

function downDistanceLabel(down, ytg) {
  return `${DOWN_NAMES[down]} & ${ytg}`;
}

function halfLabel(quarter) {
  return quarter <= 2 ? '1st' : '2nd';
}

function directionFor(possession) {
  return possession === 'offense' ? 1 : -1;
}

function oppositePossession(possession) {
  return possession === 'offense' ? 'defense' : 'offense';
}

function possessionTitle(possession) {
  return possession === 'offense' ? 'Your ball' : "Opponent's ball";
}

function possessionRibbonText(possession) {
  return possession === 'offense' ? POSSESSION_COPY.ribbon.offense : POSSESSION_COPY.ribbon.defense;
}

function stagePossessionText(possession) {
  return possession === 'offense' ? POSSESSION_COPY.stage.offense : POSSESSION_COPY.stage.defense;
}

function riskLabelText(risk) {
  return String(risk || 'medium').replace(/-/g, ' ').toUpperCase();
}

function syncUiState() {
  const wrap = document.getElementById('wrap');
  const desk = document.getElementById('ui-desk');
  if (wrap) wrap.dataset.phase = state.phase || 'start';
  if (desk) {
    desk.dataset.phase = state.phase || 'start';
    desk.dataset.possession = state.possession || 'offense';
  }
  if (!['question', 'explanation'].includes(state.phase)) hideMathVisual();
  updatePromptContext();
  renderDefenseRead();
}

function playContextText() {
  if (state.phase === 'start' || !state.possession) {
    return 'DUKE VS UNC / FOUR QUARTERS / WIN THE RIVALRY';
  }

  const score = `SCORE ${state.playerScore}-${state.opponentScore}`;
  if (state.phase === 'touchdown') {
    return state.touchdownSide === 'defense'
      ? `UNC TOUCHDOWN / ${score}`
      : `DUKE TOUCHDOWN / ${score}`;
  }
  if (state.phase === 'transition') {
    const incoming = state.possession === 'offense' ? 'DUKE ON OFFENSE' : 'UNC ON OFFENSE';
    return `POSSESSION CHANGE / ${incoming} / ${score}`;
  }
  if (state.phase === 'quarter') return `END OF Q${state.quarter} / ${score}`;
  if (state.phase === 'halftime') return `HALFTIME / ${score}`;
  if (state.phase === 'final') return `FINAL / ${score}`;

  const owner = state.possession === 'offense' ? 'DUKE BALL' : 'UNC BALL';
  const bits = [owner, `Q${state.quarter}`, `BALL ON ${ydLabel(state.yd, true).toUpperCase()}`];

  if (state.phase === 'call') {
    bits.push(`${DOWN_NAMES[state.down] || state.down} & ${state.ytg}`);
  }

  if (state.phase === 'question' || state.phase === 'explanation' || state.phase === 'feedback') {
    if (state.g != null) bits.push(`${state.g} YDS IN PLAY`);
    if (state.possession === 'defense' && state.matchup) {
      bits.push(state.matchup === 'matched' ? 'GOOD MATCHUP' : 'MISMATCH');
    }
  }

  return bits.join(' / ');
}

function updatePromptContext(text = playContextText()) {
  const el = document.getElementById('play-context');
  if (el) el.textContent = text;
}

function setDeskHeader(chip, kicker, actionCopy) {
  const chipEl = document.getElementById('desk-chip');
  const kickerEl = document.getElementById('desk-kicker');
  if (chipEl) chipEl.textContent = chip;
  if (kickerEl) kickerEl.textContent = kicker;
  setActionSubcopy(actionCopy);
}

function applyDeskHeader(key) {
  const copy = DESK_HEADER_COPY[key];
  setDeskHeader(copy.chip, copy.kicker, copy.action);
}

function touchdownContinueLabel(side) {
  if (state.quarterPossessions + 1 < POSSESSIONS_PER_QUARTER) {
    return side === 'defense' ? 'Play Offense!' : 'Play Defense!';
  }
  if (state.quarter >= 4) return 'Final Score';
  if (state.quarter === 2) return 'Halftime!';
  return 'Next Quarter';
}

function startingYardFor(possession) {
  return possession === 'offense' ? START_YARD : 100 - START_YARD;
}

function nextFirstDownLine(yd, direction) {
  return direction === 1 ? Math.min(yd + 10, 100) : Math.max(yd - 10, 0);
}

function distanceToMarker(yd, fdYd, direction) {
  return direction === 1 ? Math.max(fdYd - yd, 0) : Math.max(yd - fdYd, 0);
}

function moveYards(yd, gain, direction) {
  return clamp(yd + gain * direction, 0, 100);
}

function reachesGoal(yd, direction) {
  return direction === 1 ? yd >= 100 : yd <= 0;
}

function reachesMarker(yd, fdYd, direction) {
  return direction === 1 ? yd >= fdYd : yd <= fdYd;
}

function yardsToGoal(yd, direction) {
  return direction === 1 ? 100 - yd : yd;
}

function gameSnapshot() {
  return {
    quarter: state.quarter || 1,
    playerScore: state.playerScore || 0,
    opponentScore: state.opponentScore || 0,
    playerTotalYards: state.playerTotalYards || 0,
    opponentTotalYards: state.opponentTotalYards || 0,
    plays: state.plays || 0,
    quarterPossessions: state.quarterPossessions || 0,
    tds: state.tds || 0,
    opponentTds: state.opponentTds || 0,
    defenseStops: state.defenseStops || 0,
    correctAnswers: state.correctAnswers || 0,
    gradedQuestions: state.gradedQuestions || 0,
    firstDowns: state.firstDowns || 0,
    pendingNextPossession: state.pendingNextPossession || null,
  };
}

function makeQuestionUiState() {
  return {
    attempt: 1,
    missedChoiceIds: [],
    support: 'initial',
    continueRequired: false,
    outcomeCommitted: false,
    resolutionRecorded: false,
  };
}

function blankPlayState() {
  return {
    activeSnap: null,
    questionInstance: null,
    pendingResolution: null,
    questionUi: makeQuestionUiState(),
    g: null,
    label: null,
    callKey: null,
    defenseCallKey: null,
    opponentCallKey: null,
    opponentTendency: null,
    opponentSnapshot: null,
    opponentSelectionSnapshot: null,
    matchup: null,
    questionId: null,
    questionSkill: null,
    questionConcept: null,
    questionPurpose: null,
    questionGrading: null,
    question: null,
    correct: null,
    choices: [],
    choiceType: 'number',
    explain: null,
    hint: null,
    math: null,
    mathSupport: 'none',
    attempt: 1,
    missedChoiceIndexes: [],
    continueRequired: false,
    outcomeCommitted: false,
    outcomeMessage: null,
    touchdownSide: null,
    play: null,
  };
}

function makeDriveState(possession) {
  const direction = directionFor(possession);
  const yd = startingYardFor(possession);
  const fdYd = nextFirstDownLine(yd, direction);
  return {
    possession,
    direction,
    yd,
    fdYd,
    down: 1,
    ytg: distanceToMarker(yd, fdYd, direction),
    driveStart: yd,
    drivePlays: 0,
    animYd: yd,
  };
}

function createGameState() {
  return {
    quarter: 1,
    playerScore: 0,
    opponentScore: 0,
    playerTotalYards: 0,
    opponentTotalYards: 0,
    plays: 0,
    quarterPossessions: 0,
    tds: 0,
    opponentTds: 0,
    defenseStops: 0,
    correctAnswers: 0,
    gradedQuestions: 0,
    firstDowns: 0,
    pendingNextPossession: null,
    phase: 'start',
    ...makeDriveState('offense'),
    ...blankPlayState(),
  };
}

function statsContext() {
  return {
    quarter: state.quarter,
    possession: state.possession,
    down: state.down,
    yardsToGo: state.ytg,
    yardLine: state.yd,
    firstDownLine: state.fdYd,
    direction: state.direction,
    score: {
      player: state.playerScore,
      opponent: state.opponentScore,
    },
    totalYards: {
      player: state.playerTotalYards,
      opponent: state.opponentTotalYards,
    },
    plays: state.plays,
    drivePlays: state.drivePlays,
  };
}

function statsContextFromSnap(snap) {
  const context = snap.context;
  return {
    quarter: context.quarter,
    possession: context.possession,
    down: context.down,
    yardsToGo: context.yardsToGo,
    yardLine: context.yardLine,
    firstDownLine: context.firstDownLine,
    direction: context.direction,
    score: {
      player: context.scores.player,
      opponent: context.scores.opponent,
    },
    totalYards: {
      player: context.totalYards.player,
      opponent: context.totalYards.opponent,
    },
    plays: context.plays,
    drivePlays: context.drivePlays,
  };
}

function statsCallsFromSnap(snap) {
  const calls = snap.context.calls;
  return {
    offense: calls.offense,
    defense: calls.defense,
    opponent: snap.context.possession === 'defense' ? calls.offense : null,
    matchup: calls.matchup,
  };
}

function beginStatsPlay(snap, question) {
  pendingStatsPlay = FOOTBALL_STATS.beginPlay(statsSession, {
    preSnap: statsContextFromSnap(snap),
    calls: statsCallsFromSnap(snap),
    offeredYards: snap.proposal.appliedGain,
    links: {
      familyId: question.familyId,
      contextId: question.contextId,
      questionInstanceId: question.questionInstanceId,
    },
    question: {
      id: question.familyId,
      familyId: question.familyId,
      contextId: question.contextId,
      questionInstanceId: question.questionInstanceId,
      skill: question.skill,
      concept: question.concept,
      purpose: question.purpose,
      grading: question.grading,
      tier: question.tier,
    },
  });
}

function beginBypassedStatsPlay(snap) {
  pendingStatsPlay = FOOTBALL_STATS.beginBypassedPlay(statsSession, {
    preSnap: statsContextFromSnap(snap),
    calls: statsCallsFromSnap(snap),
    offeredYards: snap.proposal.appliedGain,
    links: {
      familyId: null,
      contextId: snap.contextId,
      questionInstanceId: null,
    },
  });
}

function finalizeStatsPlay(actualYards, outcome) {
  const pending = pendingStatsPlay;
  pendingStatsPlay = null;
  if (!pending) return false;
  const complete = pending.instructionalStatus === 'bypassed'
    ? FOOTBALL_STATS.completeBypassedPlay
    : FOOTBALL_STATS.completePlay;
  return complete(statsSession, pending, {
    actualYards,
    outcome,
    postPlay: statsContext(),
  });
}

function outcomeMessage(messagesByCall, callKey) {
  return choose(messagesByCall[callKey] || messagesByCall.shortRun);
}

function contextualQuestionProfile() {
  return {
    completedThroughPage: FOOTBALL_LEARNING.PROFILE.completedThroughPage,
    includedThroughPage: FOOTBALL_LEARNING.PROFILE.includedThroughPage,
    computationMax: FOOTBALL_LEARNING.PROFILE.computationMax,
    displayMax: FOOTBALL_LEARNING.PROFILE.displayMax,
  };
}

function nextContextId() {
  return `context-${contextSequence++}`;
}

function nextQuestionInstanceId() {
  return `question-${questionSequence++}`;
}

function makeSnapContext(calls, privateOpponentSnapshot = null) {
  const context = {
    contextId: nextContextId(),
    possession: state.possession,
    direction: state.direction,
    quarter: state.quarter,
    down: state.down,
    yardsToGo: state.ytg,
    yardLine: state.yd,
    firstDownLine: state.fdYd,
    driveStart: state.driveStart,
    scores: {
      player: state.playerScore,
      opponent: state.opponentScore,
    },
    totalYards: {
      player: state.playerTotalYards,
      opponent: state.opponentTotalYards,
    },
    plays: state.plays,
    drivePlays: state.drivePlays,
    calls,
    privateOpponentSnapshot,
  };
  if (questionFaultMode === 'invalid-context') context.direction = state.direction * -1;
  return context;
}

function makeActiveSnap(callKey, opts = {}) {
  const call = OFFENSE_CALLS[callKey] || OFFENSE_CALLS.shortRun;
  const maxPossible = state.direction === 1 ? 100 - state.yd : state.yd;
  const maxG = Math.max(1, Math.min(call.gRange[1], maxPossible));
  const minG = Math.max(1, Math.min(call.gRange[0], maxG));
  let gain = randomInt(minG, maxG);

  if (opts.gainMultiplier) {
    gain = clamp(Math.round(gain * opts.gainMultiplier), 1, maxPossible);
  }

  const calls = opts.calls || {
    offense: callKey,
    defense: null,
    matchup: null,
  };
  const context = makeSnapContext(calls, opts.privateOpponentSnapshot || null);
  let snap;
  try {
    snap = FOOTBALL_DOMAIN.createSnap(context, {
      gain,
      callKey,
      label: call.label,
    });
  } catch (error) {
    if (error && typeof error === 'object') error.contextId = error.contextId ?? context.contextId;
    throw error;
  }
  const candidate = questionFaultMode === 'invalid-projection'
    ? { ...snap.proposal, endYardLine: snap.proposal.endYardLine + state.direction }
    : snap.proposal;
  const validation = FOOTBALL_DOMAIN.validateTransition(snap, candidate);
  if (!validation.ok) {
    const error = new Error('The proposed football transition failed independent validation.');
    error.code = 'invalid-projection';
    error.diagnostics = validation.diagnostics;
    error.contextId = snap.contextId;
    throw error;
  }
  return snap;
}

function readQuestionPointer(root, path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return undefined;
  return path.slice(1).split('/').reduce((value, token) => {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    return value != null && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }, root);
}

function sameContractValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateQuestionInstance(snap, question) {
  if (!question || typeof question !== 'object') throw Object.assign(new Error('Question builder returned no contract.'), { code: 'malformed-question' });
  if (question.contextId !== snap.contextId || !question.questionInstanceId || question.id !== question.familyId) {
    throw Object.assign(new Error('Question identity does not link to the frozen snap.'), { code: 'malformed-question' });
  }
  if (!Array.isArray(question.bindings) || question.bindings !== question.premises || !question.bindings.length) {
    throw Object.assign(new Error('Question bindings are missing or have drifted.'), { code: 'malformed-question' });
  }
  for (const binding of question.bindings) {
    if (binding?.source?.kind === 'context'
      && binding.source.path.startsWith('/context/privateOpponentSnapshot')) {
      throw Object.assign(new Error('Question bindings may not expose the private opponent snapshot.'), { code: 'malformed-question' });
    }
    const actual = binding?.source?.kind === 'context'
      ? readQuestionPointer(snap, binding.source.path)
      : binding?.source?.kind === 'rule'
        ? FOOTBALL_CONTEXTUAL_QUESTIONS.RULES[binding.source.ruleId]
        : undefined;
    if (actual === undefined || !sameContractValue(actual, binding.value)) {
      throw Object.assign(new Error(`Question binding ${binding?.id || 'unknown'} is not grounded in the snap.`), { code: 'malformed-question' });
    }
  }
  if (!Array.isArray(question.choices) || question.choices.length < 2
    || question.choices.some(choice => !choice || typeof choice.id !== 'string' || !Object.prototype.hasOwnProperty.call(choice, 'value'))) {
    throw Object.assign(new Error('Question choices must be stable structured values.'), { code: 'malformed-question' });
  }
  const correct = question.choices.filter(choice => choice.id === question.correctChoiceId);
  if (correct.length !== 1 || !sameContractValue(correct[0].value, question.answer?.value)) {
    throw Object.assign(new Error('Question must contain exactly one linked correct choice.'), { code: 'malformed-question' });
  }
  for (const stage of ['initial', 'guided', 'worked']) {
    const visual = question.visuals?.[stage];
    if (!visual || typeof visual.ariaLabel !== 'string' || visual.ariaLabel.trim() === '') {
      throw Object.assign(new Error(`Question is missing its ${stage} visual contract.`), { code: 'malformed-question' });
    }
  }
  return question;
}

function pickQuestion(snap) {
  const profile = contextualQuestionProfile();
  const inspected = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(snap, profile);
  const eligible = questionFaultMode === 'empty-pool' ? [] : inspected.eligible;
  if (!eligible.length) {
    const error = new Error('No truthful contextual question family is eligible for this valid snap.');
    error.code = 'empty-pool';
    error.declined = inspected.declined;
    error.familyId = null;
    error.contextId = snap.contextId;
    error.questionInstanceId = null;
    throw error;
  }
  const entry = FOOTBALL_LEARNING.weightedPick(eligible, learningSession, schedulerRng);
  if (!entry) throw Object.assign(new Error('The contextual scheduler returned no family.'), { code: 'empty-pool' });
  let question = null;
  try {
    if (questionFaultMode === 'build-throw') {
      throw Object.assign(new Error('Injected contextual builder failure.'), { code: 'build-throw' });
    }
    const firstSupport = entry.curriculumSource === 'workbook'
      && entry.introducedOnPage > inspected.profile.completedThroughPage
      ? 'guided'
      : 'initial';
    const support = FOOTBALL_LEARNING.supportFor(learningSession, entry.skill, firstSupport);
    const built = FOOTBALL_CONTEXTUAL_QUESTIONS.build(snap, entry.familyId, {
      support,
      presentationRng,
      profile: inspected.profile,
    });
    const source = questionFaultMode === 'malformed'
      ? { ...built, choices: [] }
      : built;
    question = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
      ...source,
      contextId: snap.contextId,
      questionInstanceId: nextQuestionInstanceId(),
    }));
    return validateQuestionInstance(snap, question);
  } catch (error) {
    const failure = error && typeof error === 'object' ? error : new Error(String(error));
    failure.familyId = failure.familyId ?? entry.familyId;
    failure.contextId = failure.contextId ?? snap.contextId;
    failure.questionInstanceId = failure.questionInstanceId ?? question?.questionInstanceId ?? null;
    throw failure;
  }
}

function legacyPlayFromTransition(snap, transition = snap.proposal, question = null) {
  return FOOTBALL_DOMAIN.deepFreeze({
    gain: transition.appliedGain,
    label: snap.call.label,
    callKey: snap.call.key,
    oldYd: transition.startYardLine,
    newYd: transition.endYardLine,
    oldFdYd: transition.oldFirstDownLine,
    newFdYd: transition.newFirstDownLine,
    oldDown: transition.oldDown,
    newDown: transition.newDown,
    ytg: transition.oldYardsToGo,
    newYtg: transition.newYardsToGo,
    isTouchdown: transition.resultKind === 'touchdown',
    gotFirstDown: transition.resultKind === 'firstDown',
    isTurnoverOnDowns: transition.resultKind === 'turnoverOnDowns',
    resultKind: transition.resultKind,
    learningTier: question?.tier || null,
  });
}

// -- Field --------------------------------------------------------------------
function buildField() {
  const fw = document.getElementById('field-wrap');
  fw.querySelectorAll('.grass,.yline,.ylabel,.hash-mark').forEach(e => e.remove());
  [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach(y => {
    const ln = document.createElement('div');
    ln.className = 'yline'; ln.style.left = yardToPct(y) + '%';
    fw.appendChild(ln);
    const lb = document.createElement('div');
    lb.className = 'ylabel'; lb.style.left = yardToPct(y) + '%';
    lb.textContent = fieldNumber(y);
    fw.appendChild(lb);
    ['hash-top', 'hash-bottom'].forEach(cls => {
      const hm = document.createElement('div');
      hm.className = 'hash-mark ' + cls;
      hm.style.left = yardToPct(y) + '%';
      fw.appendChild(hm);
    });
  });
}

function updateField(animated) {
  const ball = document.getElementById('ball');
  const fdl = document.getElementById('fd-line');
  const fdChain = document.getElementById('fd-chain');
  const fw = document.getElementById('field-wrap');
  fw.classList.toggle('defense', state.possession === 'defense');
  if (!animated) {
    ball.style.transition = 'none'; fdl.style.transition = 'none';
    requestAnimationFrame(() => { ball.style.transition = ''; fdl.style.transition = ''; });
  }
  const rotation = state.possession === 'defense' ? 18 : -18;
  const fdLeft = yardToPct(clamp(state.fdYd, 0, 100)) + '%';
  ball.style.left = yardToPct(state.animYd) + '%';
  ball.style.setProperty('--ball-rotation', `${rotation}deg`);
  fdl.style.left = fdLeft;
  if (fdChain) fdChain.style.left = fdLeft;
  if (animated) {
    ball.classList.add('ball-moving');
    setTimeout(() => ball.classList.remove('ball-moving'), 400);
  }
  const player = document.getElementById('player');
  if (player) {
    if (state.possession === 'offense') {
      player.classList.remove('player-hidden');
      const playerYd = Math.max(0, Math.min(100, state.animYd - 3));
      player.style.left = yardToPct(playerYd) + '%';
      player.style.setProperty('--player-dir', '1');
      if (!animated) {
        player.style.transition = 'none';
        requestAnimationFrame(() => { player.style.transition = ''; });
      }
    } else {
      player.classList.add('player-hidden');
    }
  }
}

function updateStatus() {
  document.getElementById('s-down').textContent = downDistanceLabel(state.down, state.ytg);
  document.getElementById('s-yd').textContent = ydLabel(state.yd, true);
  document.getElementById('s-quarter').textContent = state.quarter;
  const pEl = document.getElementById('s-pscore');
  const oEl = document.getElementById('s-oscore');
  pEl.textContent = state.playerScore;
  oEl.textContent = state.opponentScore;

  // Score pulse — only when score actually changes, skip initial render
  if (prevPlayerScore >= 0 && state.playerScore !== prevPlayerScore) {
    pEl.classList.remove('score-pulse');
    void pEl.offsetWidth;
    pEl.classList.add('score-pulse');
    setTimeout(() => pEl.classList.remove('score-pulse'), 500);
  }
  if (prevOpponentScore >= 0 && state.opponentScore !== prevOpponentScore) {
    oEl.classList.remove('score-pulse');
    void oEl.offsetWidth;
    oEl.classList.add('score-pulse');
    setTimeout(() => oEl.classList.remove('score-pulse'), 500);
  }
  prevPlayerScore = state.playerScore;
  prevOpponentScore = state.opponentScore;

  const status = document.getElementById('status');
  const scorebug = document.getElementById('scorebug');
  const wrap = document.getElementById('wrap');
  status.dataset.possession = state.possession;
  if (scorebug) scorebug.dataset.possession = state.possession;
  if (wrap) wrap.dataset.possession = state.possession;
  const poss = document.getElementById('sb-poss');
  poss.classList.toggle('poss-defense', state.possession === 'defense');
  const ribbon = document.getElementById('status-ribbon-text');
  if (ribbon) ribbon.textContent = possessionRibbonText(state.possession);
  const stagePossession = document.getElementById('stage-possession');
  if (stagePossession) stagePossession.textContent = stagePossessionText(state.possession);
  syncUiState();
}

function setFeedback(t, tone = 'neutral') {
  const el = document.getElementById('feedback');
  el.textContent = t;
  if (t) {
    el.dataset.tone = tone;
  } else {
    delete el.dataset.tone;
  }
}

function hideMathVisual() {
  const overlay = document.getElementById('math-overlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.innerHTML = '';
  overlay.removeAttribute('data-type');
  overlay.setAttribute('aria-label', '');
}

function renderMathVisual() {
  const overlay = document.getElementById('math-overlay');
  const question = state.questionInstance;
  const support = state.questionUi?.support || 'initial';
  const visual = question?.visuals?.[support];
  if (!overlay || !visual || !['question', 'explanation'].includes(state.phase)) {
    hideMathVisual();
    return;
  }
  const data = visual.data || {};
  overlay.hidden = false;
  overlay.dataset.type = visual.type;
  overlay.dataset.support = support;
  overlay.setAttribute('aria-label', visual.ariaLabel);

  let tokens = [];
  switch (visual.type) {
    case 'down-distance':
      tokens = [`${DOWN_NAMES[data.down] || data.down} & ${data.yardsToGo}`];
      break;
    case 'parts':
    case 'fact-family':
      tokens = [data.knownPart, '+', visual.result ? visual.result.value : '?', '=', data.total];
      break;
    case 'marker-strip':
      tokens = [`NEED ${data.needed}`, `PLAY ${data.proposedGain}`, visual.result ? `PAST ${visual.result.value}` : 'PAST ?'];
      break;
    case 'goal-distance':
      tokens = ['BALL', `${data.distance} YDS`, 'GOAL'];
      break;
    case 'base-ten-distance': {
      const tensUnit = data.tens === 1 ? 'TEN' : 'TENS';
      const onesUnit = data.ones === 1 ? 'ONE' : 'ONES';
      tokens = visual.result
        ? [`${data.tens} ${tensUnit}`, `${data.ones} ${onesUnit}`, `= ${data.distance}`]
        : data.targetPlace === 'tens'
          ? [`${data.distance} YDS`, '? TENS']
          : [`${data.distance} YDS`, '? ONES'];
      break;
    }
    case 'drive-strip':
      tokens = ['DRIVE START', visual.result ? `${visual.result.value} YDS` : '? YDS', 'NOW'];
      break;
    case 'score-parts':
      tokens = [`DUKE ${data.playerScore}`, '+', `UNC ${data.opponentScore}`, visual.result ? `= ${visual.result.value}` : '= ?'];
      break;
    case 'score-difference':
      tokens = [`DUKE ${data.playerScore}`, 'APART', `UNC ${data.opponentScore}`, visual.result ? `${visual.result.value}` : '?'];
      break;
    case 'scoreboard-read':
      tokens = [data.label || 'SCOREBOARD'];
      break;
    case 'comparison': {
      const relation = visual.result?.value;
      const relationLabel = relation === '<' ? 'LESS THAN' : relation === '>' ? 'GREATER THAN' : relation === '=' ? 'EQUAL TO' : '?';
      tokens = [`${data.leftLabel} ${data.leftValue}`, relationLabel, `${data.rightLabel} ${data.rightValue}`];
      break;
    }
    case 'hundreds-move': {
      if (support === 'initial') {
        tokens = [`${data.team} TOTAL ${data.startTotal}`, `+${data.proposedGain}`, visual.result ? `= ${visual.result.value}` : '= ?'];
      } else {
        tokens = Array.from({ length: data.proposedGain }, (_, index) => data.startTotal + index);
        tokens.push(visual.result ? visual.result.value : '?');
      }
      break;
    }
    case 'drive-play-order':
      tokens = [`DRIVE PLAY ${data.playNumber}`, visual.result ? visual.result.value : 'ORDER ?'];
      break;
    case 'base-ten-move': {
      const start = data.startDistance ?? 0;
      const moved = (data.wholeTensMoved ?? 0) * 10;
      tokens = [start, `${data.direction < 0 ? '−' : '+'}${moved}`, visual.result ? `= ${visual.result.value}` : '= ?'];
      break;
    }
    case 'touchdown-rule':
      tokens = ['TOUCHDOWN', visual.result ? `${visual.result.value} POINTS` : '? POINTS'];
      break;
    default:
      tokens = Object.values(data).filter(value => value !== null && ['string', 'number'].includes(typeof value));
      if (!tokens.length) tokens = ['FOOTBALL MATH'];
  }
  overlay.innerHTML = `<div class="math-context-row" aria-hidden="true">${tokens.map((token, index) =>
    `<span class="${index % 2 === 0 ? 'math-context-token' : 'math-context-link'}">${token}</span>`
  ).join('')}</div>` + (support === 'worked' ? `<span class="math-worked">${question.workedExplanation.text}</span>` : '');
}

function hideContinueButton() {
  const button = document.getElementById('question-continue');
  if (!button) return;
  button.classList.add('hidden');
  button.disabled = true;
}

function showContinueButton() {
  const button = document.getElementById('question-continue');
  if (!button) return;
  button.classList.remove('hidden');
  button.disabled = false;
  requestAnimationFrame(() => button.focus());
}

function setActionSubcopy(t) {
  const el = document.getElementById('action-subcopy');
  if (el) el.textContent = t;
}

function renderDefenseRead() {
  const el = document.getElementById('defense-read');
  if (!el) return;
  const snapshot = state.phase === 'call' && state.possession === 'defense'
    ? state.opponentSnapshot
    : null;
  el.hidden = !snapshot;
  el.textContent = snapshot
    ? `Pre-snap read: ${snapshot.look.label}, ${snapshot.look.alignment}. ${snapshot.lean.label}.`
    : '';
}

function hideAnswerButtons() {
  const row = document.getElementById('btn-row');
  row.classList.add('hidden');
  delete row.dataset.choiceType;
  [0, 1, 2, 3].forEach(i => {
    const b = document.getElementById('b' + i);
    b.disabled = true;
    b.textContent = '';
    delete b.dataset.slot;
    delete b.dataset.value;
    delete b.dataset.choiceId;
    b.removeAttribute('aria-label');
    b.classList.remove('wrong', 'correct');
  });
  hideContinueButton();
}

function hideCallGrid() {
  const grid = document.getElementById('call-grid');
  grid.classList.add('hidden');
  delete grid.dataset.count;
  grid.innerHTML = '';
}

function renderButtons() {
  hideCallGrid();
  const row = document.getElementById('btn-row');
  row.classList.remove('hidden');
  const choices = state.questionInstance?.choices || [];
  row.dataset.choiceType = choices.every(choice => typeof choice.value === 'number') ? 'number' : 'text';
  hideContinueButton();
  [0, 1, 2, 3].forEach(i => {
    const b = document.getElementById('b' + i);
    const choice = choices[i];
    const hasChoice = Boolean(choice);
    b.classList.toggle('hidden', !hasChoice);
    b.disabled = !hasChoice;
    b.classList.remove('wrong', 'correct');
    if (!hasChoice) {
      b.textContent = '';
      delete b.dataset.choiceId;
      return;
    }
    b.textContent = choice.label;
    b.dataset.slot = String.fromCharCode(65 + i);
    b.dataset.value = String(choice.value);
    b.dataset.choiceId = choice.id;
    b.setAttribute('aria-label', choice.ariaLabel || choice.label);
  });
}

function renderCallGrid(calls, onPick) {
  hideAnswerButtons();
  hideMathVisual();
  const grid = document.getElementById('call-grid');
  grid.innerHTML = '';
  grid.classList.remove('hidden');
  grid.dataset.count = String(calls.length);
  grid.dataset.possession = state.possession;
  calls.forEach((call) => {
    const btn = document.createElement('button');
    btn.className = 'call-btn';
    btn.dataset.risk = call.risk || 'medium';
    const diagram = playDiagramSvg(call.key, state.possession);
    const callMode = state.possession === 'defense' ? 'Coverage' : 'Play call';
    btn.innerHTML =
      `<span class="call-meta"><span>${callMode}</span><span class="call-risk">${riskLabelText(call.risk)}</span></span>` +
      `<span class="call-diagram" aria-hidden="true">${diagram}</span>` +
      `<span class="call-label">${call.label}</span>` +
      `<span class="call-desc">${call.desc}</span>`;
    btn.addEventListener('click', () => onPick(call.key));
    grid.appendChild(btn);
  });
}

function disableAnswers() {
  [0, 1, 2, 3].forEach(i => document.getElementById('b' + i).disabled = true);
}

// -- Audio (synthesized Web Audio, mirrors kayak/physics.js) ------------------
const MUTE_STORAGE_KEY = 'footballAudioMuted';
let audioCtx = null;

function storedMutePreference() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function storeMutePreference(muted) {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch (e) {}
}

let soundOn = !storedMutePreference();

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (navigator.audioSession && 'type' in navigator.audioSession) {
      navigator.audioSession.type = 'playback';
    }
  } catch (e) {}
  try { audioCtx = new Ctor(); } catch (e) { audioCtx = null; }
  return audioCtx;
}

// Lazily create/resume the context on the first trusted user gesture.
function unlockAudio(event) {
  if (event && !event.isTrusted) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    ctx.resume().catch(function() {});
  }
}

document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('keydown', unlockAudio);
document.addEventListener('visibilitychange', function() {
  if (audioCtx && !document.hidden &&
      (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
    audioCtx.resume().catch(function() {});
  }
});

function canPlayAudio() {
  return soundOn && !!audioCtx && audioCtx.state === 'running';
}

// Short positive jingle on a correct answer / defensive stop.
function playCorrect() {
  const ctx = audioCtx;
  if (!canPlayAudio()) return;
  try {
    [660, 880].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    });
  } catch (e) {}
}

// Rising cheer-ish arpeggio for first downs (short) and touchdowns (longer).
function playCheer(freqs, step) {
  const ctx = audioCtx;
  if (!canPlayAudio()) return;
  try {
    freqs.forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'triangle'; o.frequency.value = freq;
      const t = ctx.currentTime + i * step;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.34);
    });
  } catch (e) {}
}
function playFirstDown() { playCheer([392, 523, 659], 0.08); }
function playTouchdown() { playCheer([392, 523, 659, 784, 988], 0.11); }

function toggleMute() {
  soundOn = !soundOn;
  storeMutePreference(!soundOn);
  if (soundOn) unlockAudio();
  updateMuteButton();
}

function updateMuteButton() {
  const btn = document.getElementById('mute-toggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(!soundOn));
  btn.setAttribute('aria-label', soundOn ? 'Mute sound effects' : 'Unmute sound effects');
  btn.classList.toggle('is-muted', !soundOn);
  const icon = document.getElementById('mute-icon');
  if (icon) icon.textContent = soundOn ? '🔊' : '🔇';
}

// -- Play flow ----------------------------------------------------------------
function showCallPrompt({ preserveOpponentSnapshot = false } = {}) {
  clearTimeout(advTimer);
  const opponentSnapshot = preserveOpponentSnapshot ? state.opponentSnapshot : null;
  Object.assign(state, blankPlayState(), { phase: 'call' });
  if (state.possession === 'defense') {
    state.opponentSnapshot = opponentSnapshot || planOpponentSnap();
  }
  updateStatus();
  if (state.possession === 'offense') {
    document.getElementById('play-label').textContent = downDistanceLabel(state.down, state.ytg);
    document.getElementById('question').textContent = 'Call the snap. Every play uses your learning plan.';
    applyDeskHeader('callOffense');
    renderCallGrid(Object.values(OFFENSE_CALLS), selectOffenseCall);
  } else {
    document.getElementById('play-label').textContent = downDistanceLabel(state.down, state.ytg);
    document.getElementById('question').textContent = 'Call the coverage.';
    applyDeskHeader('callDefense');
    renderCallGrid(Object.values(DEFENSE_CALLS), selectDefenseCall);
  }
  setFeedback('');
}

function startDrive(possession) {
  clearTimeout(advTimer);
  hideOverlays();
  resetPlayerAnimations();
  state = {
    ...gameSnapshot(),
    ...makeDriveState(possession),
    ...blankPlayState(),
    phase: 'call',
  };
  state.pendingNextPossession = null;
  updateField(false);
  updateStatus();
  showCallPrompt();
}

function syncQuestionMirrors() {
  const question = state.questionInstance;
  const ui = state.questionUi || makeQuestionUiState();
  const visual = question?.visuals?.[ui.support] || null;
  state.questionId = question?.familyId || null;
  state.questionSkill = question?.skill || null;
  state.questionConcept = question?.concept || null;
  state.questionPurpose = question?.purpose || null;
  state.questionGrading = question?.grading || null;
  state.question = question?.prompt?.text || null;
  state.correct = question?.answer?.value ?? null;
  state.choices = question?.choices?.map(choice => choice.value) || [];
  state.choiceType = question?.choices?.every(choice => typeof choice.value === 'number') ? 'number' : 'text';
  state.explain = question?.workedExplanation?.text || null;
  state.hint = question?.hint?.text || null;
  state.math = visual ? { ...visual, support: ui.support } : null;
  state.mathSupport = ui.support;
  state.attempt = ui.attempt;
  state.missedChoiceIndexes = question
    ? question.choices.map((choice, index) => ui.missedChoiceIds.includes(choice.id) ? index : -1).filter(index => index >= 0)
    : [];
  state.continueRequired = ui.continueRequired;
  state.outcomeCommitted = ui.outcomeCommitted;
}

function activateSnapMirrors(snap, question = null) {
  const play = legacyPlayFromTransition(snap, snap.proposal, question);
  state.activeSnap = snap;
  state.questionInstance = question;
  state.pendingResolution = null;
  state.questionUi = makeQuestionUiState();
  if (question) state.questionUi.support = question.support;
  state.g = snap.proposal.appliedGain;
  state.label = snap.call.label;
  state.callKey = snap.call.key;
  state.defenseCallKey = snap.context.calls.defense;
  state.opponentCallKey = snap.context.possession === 'defense' ? snap.context.calls.offense : null;
  state.matchup = snap.context.calls.matchup;
  state.play = play;
  state.outcomeMessage = null;
  syncQuestionMirrors();
}

function prepareQuestion(bundle, labelHtml, feedbackCopy = '') {
  const { snap, question } = bundle;
  activateSnapMirrors(snap, question);
  state.pendingResolution = FOOTBALL_DOMAIN.deepFreeze({
    schemaVersion: 1,
    policy: 'awaitingAnswer',
    contextId: snap.contextId,
    questionInstanceId: question.questionInstanceId,
    transitionToCommit: null,
  });
  state.phase = 'question';
  document.getElementById('play-label').innerHTML = labelHtml;
  document.getElementById('question').textContent = question.prompt.text;
  applyDeskHeader(state.possession === 'offense' ? 'questionOffense' : 'questionDefense');
  syncUiState();
  const visibleGuidance = question.support === 'guided' ? question.hint.text : '';
  setFeedback([feedbackCopy, visibleGuidance].filter(Boolean).join(' '), visibleGuidance ? 'info' : 'neutral');
  renderButtons();
  renderMathVisual();
  if (questionFaultMode === 'prepare-after-ui') {
    throw Object.assign(new Error('Injected question preparation failure after UI setup.'), {
      code: 'question-presentation-failure',
    });
  }
  beginStatsPlay(snap, question);
  FOOTBALL_LEARNING.recordPresented(learningSession, question);
}

function restoreCallAfterInvalid(opponentSnapshot = null) {
  if (state.possession === 'defense' && opponentSnapshot) state.opponentSnapshot = opponentSnapshot;
  showCallPrompt({ preserveOpponentSnapshot: state.possession === 'defense' && Boolean(opponentSnapshot) });
  setFeedback('That snap could not be validated. Call the play again.', 'info');
}

function handleInvalidSnap(error, opponentSnapshot = null) {
  pendingStatsPlay = null;
  reportQuestionDiagnostic(error?.code || 'invalid-context', {
    message: error?.message || 'The football context or projection was invalid.',
    diagnostics: error?.diagnostics || null,
    familyId: error?.familyId ?? null,
    contextId: error?.contextId ?? null,
    questionInstanceId: error?.questionInstanceId ?? null,
  });
  restoreCallAfterInvalid(opponentSnapshot);
}

function snapOpponentSnapshot(snap) {
  return snap?.context?.possession === 'defense'
    ? snap.context.privateOpponentSnapshot
    : null;
}

function handleQuestionPreparationFailure(error, snap, question) {
  pendingStatsPlay = null;
  const preservedSnapshot = snapOpponentSnapshot(snap);
  reportQuestionDiagnostic('question-presentation-failure', {
    message: error?.message || 'The contextual question UI could not be prepared.',
    familyId: question?.familyId ?? null,
    contextId: snap?.contextId ?? null,
    questionInstanceId: question?.questionInstanceId ?? null,
  });

  Object.assign(state, blankPlayState(), { phase: 'call' });
  if (state.possession === 'defense' && preservedSnapshot) state.opponentSnapshot = preservedSnapshot;
  try {
    showCallPrompt({ preserveOpponentSnapshot: state.possession === 'defense' && Boolean(preservedSnapshot) });
  } catch (rollbackError) {
    console.warn('[football:question-presentation-rollback-failure]', rollbackError?.message || rollbackError);
  }
  throw error;
}

function expectedRequestedGainForResolution(snap, policy) {
  const originalRequestedGain = snap?.proposal?.requestedGain;
  const possession = snap?.context?.possession;
  if (!Number.isInteger(originalRequestedGain) || !['offense', 'defense'].includes(possession)) {
    const error = new Error('Resolution policy requires a valid frozen snap.');
    error.code = 'invalid-resolution-policy';
    throw error;
  }

  if (policy === 'questionBypass') return originalRequestedGain;
  if (policy === 'firstTryCorrect' || policy === 'retryCorrect') {
    return possession === 'offense' ? originalRequestedGain : 0;
  }
  if (policy === 'secondMiss') {
    return possession === 'offense' ? 0 : Math.min(snap.proposal.appliedGain, 3);
  }

  const error = new Error(`Unknown resolution policy: ${policy}`);
  error.code = 'invalid-resolution-policy';
  throw error;
}

function validateResolutionTransition(snap, policy, transition) {
  return FOOTBALL_DOMAIN.validateTransition(snap, transition, {
    expectedRequestedGain: expectedRequestedGainForResolution(snap, policy),
  });
}

function makePendingResolution(policy, transition) {
  const snap = state.activeSnap;
  if (!snap) throw new Error('Cannot resolve a play without an active snap');
  const validated = validateResolutionTransition(snap, policy, transition);
  if (!validated.ok) {
    const error = new Error('Resolution transition failed independent validation.');
    error.code = 'invalid-projection';
    error.diagnostics = validated.diagnostics;
    throw error;
  }
  return FOOTBALL_DOMAIN.deepFreeze({
    schemaVersion: 1,
    policy,
    contextId: snap.contextId,
    questionInstanceId: state.questionInstance?.questionInstanceId || null,
    transitionToCommit: validated.value,
  });
}

function bypassQuestionSubsystem(snap, error, feedbackCopy) {
  const exact = FOOTBALL_DOMAIN.validateTransition(snap, snap.proposal);
  if (!exact.ok) {
    handleInvalidSnap(Object.assign(new Error('Question fallback rejected a contradictory football proposal.'), {
      code: 'invalid-projection',
      diagnostics: exact.diagnostics,
    }), snapOpponentSnapshot(snap));
    return;
  }
  reportQuestionDiagnostic(error?.code || 'question-subsystem-failure', {
    message: error?.message || 'The contextual question could not be built.',
    familyId: error?.familyId ?? null,
    contextId: error?.contextId ?? snap.contextId,
    questionInstanceId: error?.questionInstanceId ?? null,
  });
  activateSnapMirrors(snap, null);
  state.phase = 'feedback';
  beginBypassedStatsPlay(snap);
  state.pendingResolution = makePendingResolution('questionBypass', exact.value);
  applyDeskHeader(state.possession === 'offense' ? 'resultOffense' : 'resultDefense');
  setFeedback(feedbackCopy || 'The play goes on without a question.', 'info');
  commitPendingResolution();
}

function selectOffenseCall(callKey) {
  if (state.phase !== 'call' || state.possession !== 'offense') return;
  let snap;
  try {
    snap = makeActiveSnap(callKey, {
      calls: { offense: callKey, defense: null, matchup: null },
    });
  } catch (error) {
    handleInvalidSnap(error);
    return;
  }
  let question;
  try {
    question = pickQuestion(snap);
  } catch (error) {
    bypassQuestionSubsystem(snap, error, 'The snap is valid, so the full play counts without a question.');
    return;
  }
  try {
    prepareQuestion({ snap, question }, `${snap.call.label}: if it works, <span>${yds(snap.proposal.appliedGain)}</span>`);
  } catch (error) {
    handleQuestionPreparationFailure(error, snap, question);
  }
}

function getOpponentTendency(overrides = {}, profile = 'balanced') {
  return FOOTBALL_OPPONENT.getTendency({
    ...state,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    ...overrides,
  }, profile);
}

function planOpponentSnap(overrides = {}, profile = 'balanced', rng = footballRng) {
  return FOOTBALL_OPPONENT.planSnap({
    ...state,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    ...overrides,
  }, profile, rng);
}

function defenseMatches(defenseCallKey, opponentCallKey) {
  const call = DEFENSE_CALLS[defenseCallKey];
  return call && call.covers.includes(opponentCallKey);
}

function selectDefenseCall(defenseCallKey) {
  if (state.phase !== 'call' || state.possession !== 'defense') return;
  const selection = state.opponentSnapshot;
  if (!selection) return;
  const opponentCallKey = selection.plannedCallKey;
  const matched = defenseMatches(defenseCallKey, opponentCallKey);
  const defenseCall = DEFENSE_CALLS[defenseCallKey];
  let snap;
  try {
    snap = makeActiveSnap(opponentCallKey, {
      gainMultiplier: matched ? 0.65 : 1.2,
      privateOpponentSnapshot: selection,
      calls: {
        offense: opponentCallKey,
        defense: defenseCallKey,
        matchup: matched ? 'matched' : 'mismatch',
      },
    });
  } catch (error) {
    handleInvalidSnap(error, selection);
    return;
  }
  state.opponentTendency = selection.tendency;
  state.opponentSelectionSnapshot = snap.context.privateOpponentSnapshot;
  state.opponentSnapshot = null;
  const call = OFFENSE_CALLS[opponentCallKey];
  const read = matched ? 'Good matchup' : 'Mismatch';
  let question;
  try {
    question = pickQuestion(snap);
  } catch (error) {
    bypassQuestionSubsystem(snap, error, 'The snap is valid, so the threatened play counts without a question.');
    return;
  }
  try {
    prepareQuestion(
      { snap, question },
      `UNC is threatening ${call.label.toLowerCase()} for <span>${yds(snap.proposal.appliedGain)}</span>`,
      `${read}: ${defenseCall.label} vs ${call.label}.`,
    );
  } catch (error) {
    handleQuestionPreparationFailure(error, snap, question);
  }
}

function handleAnswer(idx) {
  if (state.phase !== 'question') return;
  const btn = document.getElementById('b' + idx);
  if (!btn || btn.disabled || btn.classList.contains('hidden')) return;
  const choice = state.questionInstance?.choices?.[idx];
  if (!choice) return;
  const question = learningQuestionFromState();
  const isCorrect = choice.id === question.correctChoiceId;
  FOOTBALL_LEARNING.recordAttempt(learningSession, question, {
    attempt: state.questionUi.attempt,
    selectedChoiceId: choice.id,
    correct: isCorrect,
    support: state.questionUi.support,
  });
  FOOTBALL_STATS.recordAttempt(pendingStatsPlay, {
    number: state.questionUi.attempt,
    correct: isCorrect,
    support: state.questionUi.support,
  });

  if (isCorrect) {
    completeCorrectAnswer(btn, question);
    return;
  }

  handleInstructionalMiss(btn, choice, question);
}

function learningQuestionFromState() {
  return state.questionInstance;
}

function completeCorrectAnswer(btn, question) {
  const result = state.questionUi.attempt === 1 ? 'firstTryCorrect' : 'retryCorrect';
  const transition = state.activeSnap.context.possession === 'offense'
    ? state.activeSnap.proposal
    : FOOTBALL_DOMAIN.reprojectGain(state.activeSnap, 0);
  state.pendingResolution = makePendingResolution(result, transition);
  btn.classList.add('correct');
  disableAnswers();
  state.phase = 'feedback';
  hideContinueButton();
  const msg = state.possession === 'defense'
    ? outcomeMessage(PLAY_OUTCOME_COPY.defenseStop, state.opponentCallKey)
    : state.questionUi.attempt > 1
      ? 'Great retry. The full play counts!'
      : 'Correct. Run the play!';
  state.outcomeMessage = msg;
  applyDeskHeader(state.possession === 'offense' ? 'resultOffense' : 'resultDefense');
  setFeedback(msg, 'positive');
  commitPendingResolution();
}

function handleInstructionalMiss(btn, choice, question) {
  btn.classList.add('wrong');
  btn.disabled = true;
  state.questionUi.missedChoiceIds.push(choice.id);

  if (state.questionUi.attempt === 1) {
    state.questionUi.attempt = 2;
    state.questionUi.support = FOOTBALL_LEARNING.nextSupport(state.questionUi.support);
    syncQuestionMirrors();
    renderMathVisual();
    applyDeskHeader(state.possession === 'offense' ? 'retryOffense' : 'retryDefense');
    setFeedback(`Good try. ${question.hint.text}`, 'info');
    const next = [0, 1, 2, 3]
      .map(i => document.getElementById('b' + i))
      .find(button => button && !button.disabled && !button.classList.contains('hidden'));
    if (next) next.focus();
    return;
  }

  state.questionUi.support = 'worked';
  state.phase = 'explanation';
  state.questionUi.continueRequired = true;
  const transition = state.activeSnap.context.possession === 'offense'
    ? FOOTBALL_DOMAIN.reprojectGain(state.activeSnap, 0)
    : FOOTBALL_DOMAIN.reprojectGain(state.activeSnap, Math.min(state.activeSnap.proposal.appliedGain, 3));
  state.pendingResolution = makePendingResolution('secondMiss', transition);
  disableAnswers();
  syncQuestionMirrors();
  syncUiState();
  renderMathVisual();
  applyDeskHeader(state.possession === 'offense' ? 'explainOffense' : 'explainDefense');
  setFeedback(question.workedExplanation.text, 'info');
  showContinueButton();
}

function recordQuestionResolution(result) {
  if (!state.questionInstance || state.questionUi.resolutionRecorded) return false;
  FOOTBALL_LEARNING.recordResolved(learningSession, state.questionInstance, result, {
    support: state.questionUi.support,
  });
  FOOTBALL_STATS.recordResolution(pendingStatsPlay, result);
  state.gradedQuestions++;
  if (result === 'firstTryCorrect' || result === 'retryCorrect') state.correctAnswers++;
  state.questionUi.resolutionRecorded = true;
  syncQuestionMirrors();
  return true;
}

function continueAfterExplanation() {
  if (state.phase !== 'explanation' || !state.questionUi.continueRequired || state.questionUi.outcomeCommitted) return;
  state.questionUi.continueRequired = false;
  hideContinueButton();
  state.phase = 'feedback';
  syncQuestionMirrors();
  syncUiState();

  if (state.possession === 'offense') {
    const msg = outcomeMessage(PLAY_OUTCOME_COPY.offenseMiss, state.callKey);
    state.outcomeMessage = msg;
    applyDeskHeader('resultOffense');
    setFeedback(`${msg} No gain, then the next down.`, 'negative');
  } else {
    const cappedGain = state.pendingResolution.transitionToCommit.appliedGain;
    const msg = outcomeMessage(PLAY_OUTCOME_COPY.defenseGain, state.opponentCallKey);
    state.outcomeMessage = msg;
    applyDeskHeader('resultDefense');
    setFeedback(`${msg} The mistake costs only ${yds(cappedGain)}.`, 'negative');
  }
  commitPendingResolution();
}

function liveStateMatchesSnap(snap) {
  const context = snap.context;
  return state.possession === context.possession
    && state.direction === context.direction
    && state.quarter === context.quarter
    && state.down === context.down
    && state.ytg === context.yardsToGo
    && state.yd === context.yardLine
    && state.fdYd === context.firstDownLine
    && state.driveStart === context.driveStart
    && state.playerScore === context.scores.player
    && state.opponentScore === context.scores.opponent
    && state.playerTotalYards === context.totalYards.player
    && state.opponentTotalYards === context.totalYards.opponent
    && state.plays === context.plays
    && state.drivePlays === context.drivePlays;
}

function applyCanonicalTransition(transition) {
  if (state.possession === 'offense') state.playerTotalYards += transition.appliedGain;
  else state.opponentTotalYards += transition.appliedGain;
  state.yd = transition.endYardLine;
  state.fdYd = transition.newFirstDownLine;
  state.down = transition.newDown;
  state.ytg = transition.newYardsToGo;
  state.animYd = transition.endYardLine;
  state.drivePlays++;
  state.plays++;
  state.g = transition.appliedGain;
  state.play = legacyPlayFromTransition(state.activeSnap, transition, state.questionInstance);
  updateField(true);
  updateStatus();
}

function outcomeForTransition(transition, policy) {
  if (transition.resultKind === 'touchdown') return 'touchdown';
  if (transition.resultKind === 'firstDown') return 'firstDown';
  if (transition.resultKind === 'turnoverOnDowns') return 'turnoverOnDowns';
  if (state.possession === 'defense' && transition.appliedGain === 0 && policy !== 'questionBypass') return 'stop';
  return transition.appliedGain > 0 ? 'gain' : 'noGain';
}

function finishCommittedTransition(transition, policy, outcome) {
  const gain = transition.appliedGain;
  const offense = state.possession === 'offense';

  if (offense && gain > 0) {
    startPlayerRun(transition.resultKind === 'touchdown' || transition.resultKind === 'firstDown' || gain >= 8);
  } else if (!offense && gain === 0) {
    showFieldFloat('STOPPED', 'negative');
    flashDefenseStop();
  } else if (gain > 0) {
    showFieldFloat(`+${gain} YDS`);
  } else {
    showFieldFloat('NO GAIN', 'negative');
  }

  if (outcome === 'touchdown') {
    if (offense) {
      state.tds++;
      state.playerScore += TD_POINTS;
    } else {
      state.opponentTds++;
      state.opponentScore += TD_POINTS;
    }
    updateStatus();
    finalizeStatsPlay(gain, outcome);
    setFeedback(offense ? 'Touchdown!' : 'Opponent touchdown.', offense ? 'positive' : 'negative');
    advTimer = setTimeout(() => showTD(offense ? 'offense' : 'defense'), 900);
    return;
  }

  if (outcome === 'turnoverOnDowns') {
    if (!offense) state.defenseStops++;
    updateStatus();
    finalizeStatsPlay(gain, outcome);
    setFeedback('Turnover on downs.', offense ? 'negative' : 'positive');
    if (!offense && (policy === 'firstTryCorrect' || policy === 'retryCorrect')) playCorrect();
    advTimer = setTimeout(() => finishPossession(
      offense ? 'Turnover on downs. Time to play defense!' : `${state.outcomeMessage || 'Your defense held!'} Turnover on downs!`
    ), offense ? 1400 : 1500);
    return;
  }

  if (outcome === 'firstDown') {
    if (offense) {
      state.firstDowns++;
      showFieldFloat('FIRST DOWN!', 'first-down');
      flashFdLine();
      setFeedback('First down!', 'positive');
      playFirstDown();
      clearTimeout(playerCelebrateDelayTimer);
      playerCelebrateDelayTimer = setTimeout(startPlayerCelebrate, 700);
    }
    finalizeStatsPlay(gain, outcome);
    advTimer = setTimeout(showCallPrompt, offense ? 1400 : 1600);
    return;
  }

  finalizeStatsPlay(gain, outcome);
  if (outcome === 'stop') playCorrect();
  if (offense && policy !== 'secondMiss' && policy !== 'questionBypass') {
    setFeedback('Correct.', 'positive');
    playCorrect();
  }
  advTimer = setTimeout(showCallPrompt, policy === 'secondMiss' ? 1800 : offense ? 1400 : 1500);
}

function commitPendingResolution() {
  const pending = state.pendingResolution;
  const snap = state.activeSnap;
  if (!pending || !snap || state.questionUi.outcomeCommitted) return false;
  const opponentSnapshot = snapOpponentSnapshot(snap);
  if (pending.contextId !== snap.contextId || !liveStateMatchesSnap(snap)) {
    handleInvalidSnap(Object.assign(new Error('Live football state no longer matches the frozen snap.'), {
      code: 'invalid-context',
    }), opponentSnapshot);
    return false;
  }
  let validation;
  try {
    validation = validateResolutionTransition(snap, pending.policy, pending.transitionToCommit);
  } catch (error) {
    handleInvalidSnap(error, opponentSnapshot);
    return false;
  }
  if (!validation.ok) {
    handleInvalidSnap(Object.assign(new Error('The frozen resolution is not a valid football transition.'), {
      code: 'invalid-projection',
      diagnostics: validation.diagnostics,
    }), opponentSnapshot);
    return false;
  }

  applyCanonicalTransition(validation.value);
  state.questionUi.outcomeCommitted = true;
  if (pending.policy !== 'questionBypass') recordQuestionResolution(pending.policy);
  syncQuestionMirrors();
  const outcome = outcomeForTransition(validation.value, pending.policy);
  dispatchFootballEvent('football:result', {
    schemaVersion: 1,
    familyId: state.questionInstance?.familyId || null,
    contextId: snap.contextId,
    questionInstanceId: state.questionInstance?.questionInstanceId || null,
    possession: snap.context.possession,
    policy: pending.policy,
    outcome,
    transition: validation.value,
  });
  syncUiState();
  finishCommittedTransition(validation.value, pending.policy, outcome);
  return true;
}

// ── Player sprite animations ────────────────────────────────────────────────
function startPlayerRun(showParticles = false) {
  const player = document.getElementById('player');
  if (!player || player.classList.contains('player-hidden')) return;
  clearTimeout(playerRunTimer);
  clearTimeout(playerCelebrateTimer);
  clearTimeout(playerCelebrateDelayTimer);
  player.classList.remove('player-celebrating', 'player-running');
  void player.offsetWidth;
  player.classList.add('player-running');
  playerRunTimer = setTimeout(() => player.classList.remove('player-running'), 800);
  if (showParticles) {
    const playerLeft = parseFloat(player.style.left);
    spawnFieldParticles(Number.isFinite(playerLeft) ? playerLeft : 50);
  }
}

// A brief burst of grass/dust kicked up as the ball-carrier advances — a few
// small, low-opacity specks near the player's feet, fully removed once settled.
function reducedMotionPreferred() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function spawnFieldParticles(leftPct) {
  if (reducedMotionPreferred()) return;
  const wrap = document.getElementById('field-wrap');
  if (!wrap) return;
  const colors = ['#2e8f3c', '#37aa49', '#8d6b3f', '#b9a06a'];
  for (let i = 0; i < 5; i++) {
    const p = document.createElement('div');
    p.className = 'field-particle';
    p.style.left = leftPct + '%';
    p.style.top = (60 + Math.random() * 6) + '%';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    const size = (3 + Math.random() * 3).toFixed(1) + 'px';
    p.style.width = size; p.style.height = size;
    // Kick mostly up-and-out, with a little horizontal spread.
    p.style.setProperty('--px', (Math.random() * 22 - 11).toFixed(1) + 'px');
    p.style.setProperty('--py', (-8 - Math.random() * 14).toFixed(1) + 'px');
    p.style.setProperty('--pmax', (0.28 + Math.random() * 0.22).toFixed(2));
    p.style.animationDelay = Math.round(Math.random() * 60) + 'ms';
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 640);
  }
}

function startPlayerCelebrate() {
  const player = document.getElementById('player');
  if (!player || player.classList.contains('player-hidden')) return;
  clearTimeout(playerRunTimer);
  clearTimeout(playerCelebrateTimer);
  player.classList.remove('player-running');
  void player.offsetWidth;
  player.classList.add('player-celebrating');
  playerCelebrateTimer = setTimeout(() => player.classList.remove('player-celebrating'), 550);
}

function resetPlayerAnimations() {
  clearTimeout(playerRunTimer);
  clearTimeout(playerCelebrateTimer);
  clearTimeout(playerCelebrateDelayTimer);
  const player = document.getElementById('player');
  if (!player) return;
  player.classList.remove('player-running', 'player-celebrating');
}

// ── Field outcome floats & confetti ──────────────────────────────────────────
function showFieldFloat(text, cssClass) {
  const wrap = document.getElementById('field-wrap');
  const ballLeft = parseFloat(document.getElementById('ball').style.left) || 50;
  const clamped = Math.max(14, Math.min(86, ballLeft));
  const el = document.createElement('div');
  el.className = 'field-float' + (cssClass ? ' ' + cssClass : '');
  el.textContent = text;
  el.style.left = clamped + '%';
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

function flashFdLine() {
  const fdl = document.getElementById('fd-line');
  fdl.classList.remove('fd-flash');
  void fdl.offsetWidth;
  fdl.classList.add('fd-flash');
  setTimeout(() => fdl.classList.remove('fd-flash'), 550);
}

function flashDefenseStop() {
  const fw = document.getElementById('field-wrap');
  fw.classList.remove('defense-stop-flash');
  void fw.offsetWidth;
  fw.classList.add('defense-stop-flash');
  setTimeout(() => fw.classList.remove('defense-stop-flash'), 450);
}

function spawnConfetti(containerId, count) {
  if (reducedMotionPreferred()) return;
  const container = document.getElementById(containerId);
  if (!container) return;
  const colors = ['#ffd700', '#ff6b6b', '#4dff4d', '#7bafd4', '#ff9933', '#cc66ff', '#ffffff'];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 1.2) + 's';
    piece.style.animationDuration = (1.8 + Math.random() * 1.0) + 's';
    container.appendChild(piece);
  }
}

const fireworkEpochs = new WeakMap();

function clearConfetti(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    fireworkEpochs.set(container, (fireworkEpochs.get(container) || 0) + 1);
    container.innerHTML = '';
  }
}

// Team-color firework palettes: Duke navy/gold for player scores,
// UNC-tinged reds/oranges for opponent scores.
const FW_PALETTES = {
  offense: ['#ffd337', '#003087', '#7bafd4', '#ffffff'],
  defense: ['#ff8c3c', '#ff4d3d', '#ffd337', '#ffffff'],
};

function spawnFireworks(containerId, side = 'offense') {
  if (reducedMotionPreferred()) return;
  const container = document.getElementById(containerId);
  if (!container) return;
  const colors = FW_PALETTES[side] || FW_PALETTES.offense;
  const runId = (fireworkEpochs.get(container) || 0) + 1;
  fireworkEpochs.set(container, runId);
  const bursts = side === 'defense' ? 2 : 5;
  for (let b = 0; b < bursts; b++) {
    const delay = b * 260 + Math.random() * 160;
    setTimeout(() => {
      if (fireworkEpochs.get(container) !== runId) return;
      spawnBurst(container, colors, runId);
    }, delay);
  }
}

function spawnBurst(container, colors, runId) {
  // Bail if the overlay was dismissed before this delayed burst fired.
  const overlay = container.closest('.overlay');
  if (!overlay || !overlay.classList.contains('show') || fireworkEpochs.get(container) !== runId) return;
  const burst = document.createElement('div');
  burst.className = 'fw-burst';
  burst.style.left = (18 + Math.random() * 64) + '%';
  burst.style.top = (14 + Math.random() * 42) + '%';
  const flash = document.createElement('div');
  flash.className = 'fw-flash';
  flash.style.setProperty('--fw-color', colors[Math.floor(Math.random() * colors.length)]);
  burst.appendChild(flash);
  const sparks = 14;
  for (let i = 0; i < sparks; i++) {
    const angle = (i / sparks) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 46 + Math.random() * 34;
    const spark = document.createElement('div');
    spark.className = 'fw-spark';
    spark.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    spark.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
    spark.style.setProperty('--fw-color', colors[Math.floor(Math.random() * colors.length)]);
    burst.appendChild(spark);
  }
  container.appendChild(burst);
  // Clean up the burst nodes once the animation finishes so DOM doesn't pile up.
  setTimeout(() => burst.remove(), 1000);
}

const OVERLAY_IDS = ['ov-start', 'ov-td', 'ov-defense', 'ov-offense', 'ov-quarter', 'ov-halftime', 'ov-end'];

function setGameUiInert(isInert) {
  const wrap = document.getElementById('wrap');
  if (!wrap) return;
  wrap.inert = isInert;
  if (isInert) wrap.setAttribute('aria-hidden', 'true');
  else wrap.removeAttribute('aria-hidden');
}

function overlayFocusableElements(overlay) {
  return Array.from(overlay.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
}

function focusActiveOverlay(overlay) {
  requestAnimationFrame(() => {
    if (!overlay.classList.contains('show')) return;
    const target = overlay.querySelector('.ov-btn:not([disabled])') || overlayFocusableElements(overlay)[0] || overlay;
    if (target === overlay && !overlay.hasAttribute('tabindex')) overlay.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

function focusGameplayControl() {
  requestAnimationFrame(() => {
    if (document.querySelector('.overlay.show')) return;
    const selectors = ['#call-grid .call-btn', '#btn-row .ans-btn', '#mute-toggle'];
    let target = null;
    for (const selector of selectors) {
      target = Array.from(document.querySelectorAll(selector)).find(
        (element) => !element.disabled && element.getClientRects().length > 0
      );
      if (target) break;
    }
    if (target) target.focus({ preventScroll: true });
  });
}

function activateOverlay(id) {
  const active = document.getElementById(id);
  if (!active) return;
  if (id !== 'ov-td') clearConfetti('ov-td-confetti');
  if (id !== 'ov-end') clearConfetti('ov-end-confetti');
  OVERLAY_IDS.forEach((overlayId) => {
    const overlay = document.getElementById(overlayId);
    const isActive = overlay === active;
    overlay.classList.toggle('show', isActive);
    overlay.setAttribute('aria-hidden', String(!isActive));
    overlay.inert = !isActive;
  });
  setGameUiInert(true);
  focusActiveOverlay(active);
}

function hideOverlays() {
  OVERLAY_IDS.forEach((id) => {
    const overlay = document.getElementById(id);
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
  });
  setGameUiInert(false);
  clearConfetti('ov-td-confetti');
  clearConfetti('ov-end-confetti');
  focusGameplayControl();
}

document.addEventListener('keydown', function(event) {
  const overlay = document.querySelector('.overlay.show');
  if (!overlay) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    focusActiveOverlay(overlay);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = overlayFocusableElements(overlay);
  if (!focusable.length) {
    event.preventDefault();
    focusActiveOverlay(overlay);
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
});

function showStart() {
  clearTimeout(advTimer);
  hideOverlays();
  resetPlayerAnimations();
  activateOverlay('ov-start');
  updatePromptContext('DUKE VS UNC / FOUR QUARTERS / WIN THE RIVALRY');
  document.getElementById('play-label').textContent = 'Get ready…';
  document.getElementById('question').textContent = '';
  applyDeskHeader('start');
  setFeedback('');
  hideAnswerButtons();
  hideCallGrid();
  state.phase = 'start';
  syncUiState();
}

function startGame() {
  clearTimeout(advTimer);
  if (sessionInitialized) return;
  initGameSession();
  state = createGameState();
  hideOverlays();
  startDrive('offense');
}

function showTD(side = 'offense') {
  const button = document.getElementById('ov-td-btn');
  const overlay = document.getElementById('ov-td');
  const badge = document.getElementById('ov-td-badge');
  const title = document.getElementById('ov-td-title');
  Object.assign(state, blankPlayState(), { phase: 'touchdown', touchdownSide: side });
  syncUiState();
  if (overlay) overlay.dataset.side = side;
  if (badge) badge.textContent = side === 'defense' ? 'OPPONENT TD' : 'TOUCHDOWN';
  if (title) title.textContent = side === 'defense' ? 'UNC Scores' : 'Touchdown!';
  document.getElementById('ov-td-sub').textContent = side === 'defense'
    ? `Score: ${state.playerScore} - ${state.opponentScore}. UNC has ${state.opponentTds} TD${state.opponentTds === 1 ? '' : 's'} — get it back!`
    : `Score: ${state.playerScore} - ${state.opponentScore}. ${state.tds} player TD${state.tds === 1 ? '' : 's'}!`;
  if (button) button.textContent = touchdownContinueLabel(side);
  activateOverlay('ov-td');
  clearConfetti('ov-td-confetti');
  if (side !== 'defense') {
    spawnConfetti('ov-td-confetti', 40);
    playTouchdown();
  }
  spawnFireworks('ov-td-confetti', side);
}

function afterTouchdown() {
  hideOverlays();
  finishPossession(
    state.touchdownSide === 'defense'
      ? 'Opponent scored. Time to take it back!'
      : 'You scored. Time to play defense!'
  );
}

function showDefenseTransition(message) {
  clearTimeout(advTimer);
  Object.assign(state, blankPlayState(), { phase: 'transition' });
  syncUiState();
  document.getElementById('ov-defense-sub').textContent =
    `${message} Score: ${state.playerScore} - ${state.opponentScore}`;
  activateOverlay('ov-defense');
}

function startDefense() {
  hideOverlays();
  startDrive('defense');
}

function showOffenseTransition(message) {
  clearTimeout(advTimer);
  Object.assign(state, blankPlayState(), { phase: 'transition' });
  syncUiState();
  document.getElementById('ov-offense-sub').textContent =
    `${message} Score: ${state.playerScore} - ${state.opponentScore}`;
  activateOverlay('ov-offense');
}

function startOffense() {
  hideOverlays();
  startDrive('offense');
}

function finishPossession(message) {
  const nextPossession = oppositePossession(state.possession);
  state.quarterPossessions++;
  updateStatus();

  if (state.quarterPossessions >= POSSESSIONS_PER_QUARTER) {
    state.pendingNextPossession = state.quarter === 2 ? 'defense' : nextPossession;
    if (state.quarter >= 4) { showGameOver(); return; }
    if (state.quarter === 2) { showHalftime(message); return; }
    showQuarterEnd(message);
    return;
  }

  state.pendingNextPossession = null;
  if (nextPossession === 'offense') {
    showOffenseTransition(message);
  } else {
    showDefenseTransition(message);
  }
}

// Fill a break overlay's broadcast scorebug (decorative; sub text keeps the
// full score/next-possession sentence for screen readers).
function setBreakScorebug(overlayId, nextLabel) {
  const bug = document.getElementById(overlayId + '-scorebug');
  if (!bug) return;
  bug.innerHTML =
    `<span class="ov-sb-team">DUKE</span>` +
    `<span class="ov-sb-pts">${state.playerScore}</span>` +
    `<span class="ov-sb-dash">–</span>` +
    `<span class="ov-sb-pts">${state.opponentScore}</span>` +
    `<span class="ov-sb-team">UNC</span>` +
    `<span class="ov-sb-next">Next: ${nextLabel}</span>`;
}

function showQuarterEnd(message) {
  const next = possessionTitle(state.pendingNextPossession || 'offense');
  Object.assign(state, blankPlayState(), { phase: 'quarter' });
  syncUiState();
  document.getElementById('ov-quarter-title').textContent = `End of ${QUARTER_NAMES[state.quarter]} Quarter`;
  document.getElementById('ov-quarter-sub').textContent =
    `${message} Next possession after the break: ${next}. Score: ${state.playerScore} - ${state.opponentScore}`;
  setBreakScorebug('ov-quarter', next);
  activateOverlay('ov-quarter');
}

function showHalftime(message) {
  const next = possessionTitle(state.pendingNextPossession || 'defense');
  Object.assign(state, blankPlayState(), { phase: 'halftime' });
  syncUiState();
  document.getElementById('ov-halftime-sub').textContent =
    `${message} Halftime swap: ${next} starts the 2nd half. Score: ${state.playerScore} - ${state.opponentScore}`;
  setBreakScorebug('ov-halftime', next);
  activateOverlay('ov-halftime');
}

function nextQuarter() {
  const endingQuarter = state.quarter;
  const fallbackPossession = endingQuarter >= 2 ? 'defense' : 'offense';
  const nextPossession = state.pendingNextPossession || fallbackPossession;
  hideOverlays();
  state.quarter = Math.min(state.quarter + 1, 4);
  state.quarterPossessions = 0;
  startDrive(nextPossession);
}

function populateEndStats() {
  const stats = document.getElementById('ov-end-stats');
  if (!stats) return;
  const total = state.gradedQuestions || 0;
  const correct = state.correctAnswers || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const tiles = [
    { label: 'Correct', value: `${correct} / ${total}` },
    { label: 'Accuracy', value: `${accuracy}%` },
    { label: 'Touchdowns', value: state.tds || 0 },
    { label: 'Defensive Stops', value: state.defenseStops || 0 },
    { label: 'First Downs', value: state.firstDowns || 0 },
  ];
  const coachRows = buildCoachReport();
  stats.innerHTML =
    '<span class="ov-stats-title">Way to go!</span>' +
    '<div class="ov-stats-grid">' +
    tiles.map((t) =>
      `<div class="ov-stat"><span class="ov-stat-value">${t.value}</span>` +
      `<span class="ov-stat-label">${t.label}</span></div>`
    ).join('') +
    '</div>' +
    '<div class="ov-coach-report" role="list" aria-label="Coach report">' +
    coachRows.map((row) =>
      `<div class="ov-coach-row" role="listitem"><span class="ov-coach-label">${row.label}</span>` +
      `<span class="ov-coach-value">${row.value}</span></div>`
    ).join('') +
    '</div>';
}

function buildCoachReport() {
  const concepts = Object.entries(learningSession?.byConcept || {})
    .filter(([, mastery]) => mastery.resolved > 0)
    .map(([concept, mastery]) => ({
      concept,
      label: COACH_CONCEPT_LABELS[concept] || 'Football math',
      ...mastery,
    }));

  if (!concepts.length) {
    return [{ label: 'Learning today', value: 'Keep playing to build your learning recap' }];
  }

  const score = (item) => (item.firstTryCorrect + 0.75 * item.retryCorrect) / item.resolved;
  const supportNeed = (item) => (item.retryCorrect + item.secondMiss) / item.resolved;
  const strongest = concepts
    .filter((item) => item.firstTryCorrect + item.retryCorrect > 0)
    .sort((a, b) => score(b) - score(a) || b.resolved - a.resolved || a.label.localeCompare(b.label))[0];
  const practice = concepts
    .filter((item) => item.retryCorrect + item.secondMiss > 0)
    .sort((a, b) => supportNeed(b) - supportNeed(a) || b.secondMiss - a.secondMiss || a.label.localeCompare(b.label))[0];
  const rows = [];

  if (strongest) rows.push({ label: 'Strong today', value: strongest.label });
  if (practice) {
    rows.push({ label: 'Practice next', value: practice.label });
  } else if (strongest) {
    const challenge = [...concepts]
      .sort((a, b) => a.resolved - b.resolved || a.label.localeCompare(b.label))[0];
    rows.push({ label: 'Next challenge', value: challenge.label });
  }
  if (!strongest) rows.push({ label: 'Keep going', value: 'Every try builds your skill' });
  return rows.slice(0, 2);
}

function showGameOver() {
  const diff = state.playerScore - state.opponentScore;
  const title = diff > 0 ? 'You Win!' : diff < 0 ? 'Final Score' : 'Tie Game!';
  const badgeText = diff > 0 ? 'VICTORY' : diff < 0 ? 'FINAL' : 'TIE';
  const resultClass = diff > 0 ? 'ov-win' : diff < 0 ? 'ov-loss' : 'ov-tie';
  const detail = diff > 0
    ? 'Great game.'
    : diff < 0
      ? 'Good effort. Try another game.'
      : 'Both teams finished even.';

  Object.assign(state, blankPlayState(), { pendingNextPossession: null, phase: 'final' });
  syncUiState();
  const endOv = document.getElementById('ov-end');
  endOv.classList.remove('ov-win', 'ov-loss', 'ov-tie');
  endOv.classList.add(resultClass);
  const badge = document.getElementById('ov-end-badge');
  if (badge) badge.textContent = badgeText;
  document.getElementById('ov-end-title').textContent = title;
  const finalScore = document.getElementById('ov-end-score');
  if (finalScore) finalScore.textContent = `${state.playerScore} - ${state.opponentScore}`;
  document.getElementById('ov-end-sub').textContent =
    `${detail} Player TDs: ${state.tds}.`;
  populateEndStats();
  clearConfetti('ov-end-confetti');
  activateOverlay('ov-end');
  if (diff > 0) {
    spawnConfetti('ov-end-confetti', 40);
    spawnFireworks('ov-end-confetti', 'offense');
  }
}

function restart() {
  clearConfetti('ov-td-confetti');
  clearConfetti('ov-end-confetti');
  resetPlayerAnimations();
  clearGameSessionInitialization();
  pendingStatsPlay = null;
  state = createGameState();
  prevPlayerScore = -1;
  prevOpponentScore = -1;
  updateField(false);
  updateStatus();
  showStart();
}

function renderGameToText() {
  const learning = learningSession || {
    presented: 0,
    resolved: 0,
    byConcept: {},
    historicalMastery: {},
  };
  return JSON.stringify({
    mode: state.phase,
    quarter: state.quarter,
    half: halfLabel(state.quarter || 1),
    possession: state.possession,
    score: {
      player: state.playerScore,
      opponent: state.opponentScore,
    },
    totalYards: {
      player: state.playerTotalYards,
      opponent: state.opponentTotalYards,
    },
    down: state.down,
    ytg: state.ytg,
    yardLine: ydLabel(state.yd),
    absoluteYard: state.yd,
    firstDownLine: ydLabel(state.fdYd),
    direction: state.direction,
    plays: state.plays,
    correctAnswers: state.correctAnswers,
    gradedQuestions: state.gradedQuestions,
    quarterPossessions: state.quarterPossessions,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    pendingNextPossession: state.pendingNextPossession || null,
    playerTouchdowns: state.tds,
    opponentTouchdowns: state.opponentTds,
    defenseStops: state.defenseStops,
    drivePlays: state.drivePlays,
    call: state.callKey,
    defenseCall: state.defenseCallKey,
    opponentCall: state.opponentCallKey,
    opponentTendency: state.opponentTendency || null,
    opponentSnapshot: state.opponentSnapshot ? {
      look: {
        key: state.opponentSnapshot.look.key,
        label: state.opponentSnapshot.look.label,
        alignment: state.opponentSnapshot.look.alignment,
      },
      lean: {
        key: state.opponentSnapshot.lean.key,
        label: state.opponentSnapshot.lean.label,
      },
    } : null,
    defenseRead: document.getElementById('defense-read')?.textContent || null,
    matchup: state.matchup,
    gain: state.g ?? null,
    learningTier: state.questionInstance?.tier || null,
    contextId: state.activeSnap?.contextId || null,
    questionInstanceId: state.questionInstance?.questionInstanceId || null,
    questionFamilyId: state.questionInstance?.familyId || null,
    questionId: state.questionInstance?.familyId || null,
    questionSkill: state.questionSkill || null,
    questionConcept: state.questionConcept || null,
    questionPurpose: state.questionPurpose || null,
    questionGrading: state.questionGrading || null,
    question: state.question || null,
    choices: state.choices || [],
    choiceIds: state.questionInstance?.choices?.map(choice => choice.id) || [],
    correctChoiceId: state.questionInstance?.correctChoiceId || null,
    correct: state.correct ?? null,
    explain: state.explain || null,
    hint: state.hint || null,
    math: state.math ? {
      ...state.math,
      support: state.mathSupport,
      visible: !document.getElementById('math-overlay')?.hidden,
    } : null,
    attempt: state.questionInstance ? state.questionUi.attempt : null,
    missedChoiceIds: state.questionUi?.missedChoiceIds || [],
    missedChoiceIndexes: state.missedChoiceIndexes || [],
    retryAvailable: state.phase === 'question' && state.questionUi?.attempt === 2,
    continueRequired: Boolean(state.questionUi?.continueRequired),
    outcomeCommitted: Boolean(state.questionUi?.outcomeCommitted),
    learning: {
      presented: learning.presented,
      resolved: learning.resolved,
      currentSkill: state.questionSkill || null,
      currentConcept: state.questionConcept || null,
      byConcept: FOOTBALL_LEARNING.snapshot(learning.byConcept),
      historicalMastery: FOOTBALL_LEARNING.snapshot(learning.historicalMastery),
    },
    coachReport: buildCoachReport(),
    outcomeMessage: state.outcomeMessage || null,
    touchdownSide: state.touchdownSide || null,
  });
}

function activeContractsSnapshot() {
  return {
    activeSnap: state.activeSnap ? FOOTBALL_LEARNING.snapshot(state.activeSnap) : null,
    questionInstance: state.questionInstance ? FOOTBALL_LEARNING.snapshot(state.questionInstance) : null,
    pendingResolution: state.pendingResolution ? FOOTBALL_LEARNING.snapshot(state.pendingResolution) : null,
    questionUi: FOOTBALL_LEARNING.snapshot(state.questionUi || makeQuestionUiState()),
    render: JSON.parse(renderGameToText()),
    statsSession: statsSession ? FOOTBALL_STATS.sessionSnapshot(statsSession) : null,
    learning: learningSession ? FOOTBALL_LEARNING.snapshot(learningSession) : null,
  };
}

function seedDriveStateForTest(overrides = {}) {
  if (!sessionInitialized) initGameSession(0x54c0de);
  clearTimeout(advTimer);
  const possession = overrides.possession === 'defense' ? 'defense' : 'offense';
  const direction = overrides.direction ?? directionFor(possession);
  const yardLine = overrides.yardLine ?? overrides.yd ?? startingYardFor(possession);
  const yardsToGo = overrides.yardsToGo ?? overrides.ytg ?? 10;
  const firstDownLine = overrides.firstDownLine ?? overrides.fdYd ?? yardLine + (direction * yardsToGo);
  const score = overrides.scores || overrides.score || {};
  const totalYards = overrides.totalYards || {};
  const context = FOOTBALL_DOMAIN.normalizeContext({
    contextId: `seed-validation-${contextSequence}`,
    possession,
    direction,
    quarter: overrides.quarter ?? 1,
    down: overrides.down ?? 1,
    yardsToGo,
    yardLine,
    firstDownLine,
    driveStart: overrides.driveStart ?? yardLine,
    scores: {
      player: score.player ?? overrides.playerScore ?? 0,
      opponent: score.opponent ?? overrides.opponentScore ?? 0,
    },
    totalYards: {
      player: totalYards.player ?? overrides.playerTotalYards ?? 0,
      opponent: totalYards.opponent ?? overrides.opponentTotalYards ?? 0,
    },
    plays: overrides.plays ?? 0,
    drivePlays: overrides.drivePlays ?? 0,
    calls: { offense: null, defense: null, matchup: null },
  });
  pendingStatsPlay = null;
  state = {
    ...createGameState(),
    quarter: context.quarter,
    playerScore: context.scores.player,
    opponentScore: context.scores.opponent,
    playerTotalYards: context.totalYards.player,
    opponentTotalYards: context.totalYards.opponent,
    plays: context.plays,
    quarterPossessions: overrides.quarterPossessions ?? 0,
    tds: overrides.tds ?? 0,
    opponentTds: overrides.opponentTds ?? 0,
    defenseStops: overrides.defenseStops ?? 0,
    correctAnswers: overrides.correctAnswers ?? 0,
    gradedQuestions: overrides.gradedQuestions ?? 0,
    firstDowns: overrides.firstDowns ?? 0,
    possession: context.possession,
    direction: context.direction,
    yd: context.yardLine,
    fdYd: context.firstDownLine,
    down: context.down,
    ytg: context.yardsToGo,
    driveStart: context.driveStart,
    drivePlays: context.drivePlays,
    animYd: context.yardLine,
    ...blankPlayState(),
    phase: 'call',
  };
  if (overrides.opponentSnapshot) {
    state.opponentSnapshot = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone(overrides.opponentSnapshot));
  }
  hideOverlays();
  updateField(false);
  updateStatus();
  showCallPrompt({ preserveOpponentSnapshot: possession === 'defense' && Boolean(state.opponentSnapshot) });
  return JSON.parse(renderGameToText());
}

function answerChoiceForTest(choiceId) {
  if (state.phase !== 'question' || !state.questionInstance) return false;
  let resolvedId = choiceId;
  if (choiceId === 'correct') resolvedId = state.questionInstance.correctChoiceId;
  if (choiceId === 'wrong') {
    resolvedId = state.questionInstance.choices.find(choice =>
      choice.id !== state.questionInstance.correctChoiceId
      && !state.questionUi.missedChoiceIds.includes(choice.id)
    )?.id;
  }
  const index = state.questionInstance.choices.findIndex(choice => choice.id === resolvedId);
  const button = index >= 0 ? document.getElementById(`b${index}`) : null;
  if (index < 0 || !button || button.disabled) return false;
  handleAnswer(index);
  return activeContractsSnapshot();
}

window.render_game_to_text = renderGameToText;
window.advanceTime = () => {};
window.__footballTest = {
  setRootSeed(seed) {
    installRngStreams(seed);
  },
  setRngStreams(streams) {
    const values = streams && [streams.football, streams.scheduler, streams.presentation];
    if (!values || values.some(fn => typeof fn !== 'function')) {
      throw new TypeError('setRngStreams expects football, scheduler, and presentation functions');
    }
    if (new Set(values).size !== values.length) {
      throw new TypeError('Logical RNG streams must be independent function instances');
    }
    [footballRng, schedulerRng, presentationRng] = values;
  },
  resetRng() { installRngStreams(0x54c0de); },
  resetLearning() { learningSession = createLearningSession(); },
  learningProfile() { return FOOTBALL_LEARNING.snapshot(FOOTBALL_LEARNING.PROFILE); },
  learningState() { return FOOTBALL_LEARNING.snapshot(learningSession); },
  coachReport() { return FOOTBALL_LEARNING.snapshot(buildCoachReport()); },
  statsHistory() { return FOOTBALL_STATS.history(); },
  statsSession() { return statsSession ? FOOTBALL_STATS.sessionSnapshot(statsSession) : null; },
  opponentProfiles() { return FOOTBALL_OPPONENT.PROFILES; },
  opponentSnapshot() { return FOOTBALL_LEARNING.snapshot(state.opponentSnapshot); },
  getOpponentTendency(overrides = {}, profile = 'balanced') {
    return getOpponentTendency(overrides, profile);
  },
  planOpponentSnap(overrides = {}, profile = 'balanced', rng = footballRng) {
    return planOpponentSnap(overrides, profile, rng);
  },
  pickOpponentCall(weights, rng = footballRng) {
    return FOOTBALL_OPPONENT.pickCall(weights, rng);
  },
  setQuestionFault(mode) {
    const allowed = [null, 'empty-pool', 'build-throw', 'malformed', 'prepare-after-ui', 'invalid-context', 'invalid-projection'];
    if (!allowed.includes(mode)) throw new TypeError(`Unknown question fault mode: ${mode}`);
    questionFaultMode = mode;
  },
  seedDriveState(overrides = {}) {
    return seedDriveStateForTest(overrides);
  },
  answerChoice(choiceId) {
    return answerChoiceForTest(choiceId);
  },
  activeContracts() {
    return activeContractsSnapshot();
  },
};

// -- Init ---------------------------------------------------------------------
buildField();
state = createGameState();
updateField(false);
updateStatus();
updateMuteButton();

function applyBootMode() {
  const boot = new URLSearchParams(window.location.search).get('boot');
  if (boot === 'offense-call') { startGame(); return true; }
  if (boot === 'defense-call') {
    initGameSession();
    state = createGameState();
    hideOverlays();
    startDrive('defense');
    return true;
  }
  return false;
}

if (!applyBootMode()) showStart();
