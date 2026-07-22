const GAME_VERSION = '1.27.1';
let prevPlayerScore = -1, prevOpponentScore = -1;
let playerRunTimer = 0, playerCelebrateTimer = 0, playerCelebrateDelayTimer = 0;
const EZ = 5;
function yardToPct(y) { return EZ + (y / 100) * (100 - 2 * EZ); }

const DOWN_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const QUARTER_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const START_YARD = 20;
const TD_POINTS = 6;
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
  'touchdown-base-scoring': 'Six-point touchdowns',
  'conversion-scoring': 'Conversion points',
  'conversion-placement': 'Conversion try spot',
  'field-goal-scoring': 'Field-goal points',
  'field-goal-distance': 'Field-goal distance',
  'punt-distance': 'Punt distance',
  'punt-placement': 'Punt landing spot',
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

const SECOND_MISS_OUTCOMES = Object.freeze({
  shortRun: Object.freeze({ requestedGain: -1, resultKind: null, resultReason: 'stuff' }),
  shortPass: Object.freeze({ requestedGain: 0, resultKind: null, resultReason: 'incompletion' }),
  mediumPass: Object.freeze({ requestedGain: -3, resultKind: null, resultReason: 'sack' }),
  longRun: Object.freeze({ requestedGain: -2, resultKind: 'turnover', resultReason: 'fumble' }),
  longPass: Object.freeze({ requestedGain: 0, resultKind: 'turnover', resultReason: 'interception' }),
});

if (Object.keys(OFFENSE_CALLS).length !== Object.keys(SECOND_MISS_OUTCOMES).length
  || Object.keys(OFFENSE_CALLS).some(key => !SECOND_MISS_OUTCOMES[key])) {
  throw new Error('Every offense call must declare one deterministic second-miss outcome.');
}

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
let possessionSequence = 1;
let playSequence = 1;
let questionFaultMode = null;
let selectedRivalId = FOOTBALL_OPPONENT.DEFAULT_RIVAL_ID;
let selectedPlayMode = 'quick';
let activeSeasonBinding = null;
let seasonSettlementPromise = null;
let seasonActionBusy = false;
let seasonEndActionBusy = false;

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
  const history = FOOTBALL_STATS.learningSnapshot();
  return FOOTBALL_LEARNING.createSession(history.mastery, history.lastResolvedByConcept);
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
  possessionSequence = 1;
  playSequence = 1;
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
  possessionSequence = 1;
  playSequence = 1;
}

function dispatchFootballEvent(type, detail) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(type, {
      detail: FOOTBALL_LEARNING.snapshot(detail),
    }));
  } catch (error) {
    // Diagnostics and result observers cannot participate in authoritative state transitions.
  }
}

function reportFootballDiagnostic(code, details = {}) {
  const diagnostic = {
    schemaVersion: 1,
    code,
    ...details,
    familyId: details.familyId ?? null,
    contextId: details.contextId ?? null,
    questionInstanceId: details.questionInstanceId ?? null,
  };
  console.warn(`[football:${code}]`, details.message || 'Football recovery diagnostic');
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
  return possession === 'offense' ? 'Your ball' : `${state.match.opponent.shortName}'s ball`;
}

function formatPossessionCopy(template, match = state.match) {
  return String(template)
    .replace(/\bDUKE\b/g, match.player.shortName)
    .replace(/\bUNC\b/g, match.opponent.shortName)
    .replace(/\bDuke\b/g, match.player.displayName);
}

function possessionRibbonText(possession) {
  const template = possession === 'offense' ? POSSESSION_COPY.ribbon.offense : POSSESSION_COPY.ribbon.defense;
  return formatPossessionCopy(template);
}

function stagePossessionText(possession) {
  const template = possession === 'offense' ? POSSESSION_COPY.stage.offense : POSSESSION_COPY.stage.defense;
  return formatPossessionCopy(template);
}

function rivalForMatch(match = state.match) {
  return FOOTBALL_OPPONENT.resolveRival(match.opponent.id);
}

function applyMatchPresentation(match = state.match) {
  const rival = rivalForMatch(match);
  const root = document.documentElement;
  root.dataset.opponent = rival.id;
  root.style.setProperty('--opponent-accent', rival.presentation.accent);
  root.style.setProperty('--opponent-accent-dark', rival.presentation.accentDark);
  root.style.setProperty('--opponent-accent-ink', rival.presentation.accentInk);
  root.style.setProperty('--opponent-accent-soft', rival.presentation.accentSoft);
  root.style.setProperty('--opponent-scorebug-top', rival.presentation.scorebugTop);
  root.style.setProperty('--opponent-scorebug-bottom', rival.presentation.scorebugBottom);
  const wrap = document.getElementById('wrap');
  if (wrap) wrap.dataset.opponent = rival.id;
  const scorebugName = document.getElementById('s-opponent-name');
  if (scorebugName) scorebugName.textContent = match.opponent.shortName;
  const endZone = document.getElementById('opponent-end-zone');
  if (endZone) endZone.textContent = match.opponent.endZoneName;
  const rivalryLabel = document.getElementById('stage-rivalry-label');
  if (rivalryLabel) rivalryLabel.textContent = rival.rivalryLabel;
  return rival;
}

function updateRivalPreview(match) {
  const rival = applyMatchPresentation(match);
  const matchup = document.getElementById('rival-preview-matchup');
  const style = document.getElementById('rival-preview-style');
  if (matchup) matchup.textContent = `${match.player.shortName} VS ${match.opponent.shortName}`;
  if (style) style.textContent = rival.styleBlurb;
  updatePromptContext(`${match.player.shortName} VS ${match.opponent.shortName} / FOUR QUARTERS / WIN THE RIVALRY`);
}

function selectRivalPreview(rivalId) {
  if (state.phase !== 'start' || selectedPlayMode !== 'quick') return false;
  const match = FOOTBALL_OPPONENT.createMatch(rivalId);
  selectedRivalId = rivalId;
  state = { ...state, match };
  updateRivalPreview(match);
  return true;
}

function renderRivalPicker() {
  const options = document.getElementById('rival-options');
  if (!options) return;
  options.replaceChildren();
  for (const rival of FOOTBALL_OPPONENT.listRivals()) {
    const label = document.createElement('label');
    label.className = 'rival-option';
    label.dataset.rivalId = rival.id;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'rival';
    input.value = rival.id;
    input.checked = rival.id === selectedRivalId;
    input.setAttribute('aria-describedby', `rival-style-${rival.id}`);
    input.addEventListener('change', () => {
      if (input.checked) selectRivalPreview(rival.id);
    });
    const copy = document.createElement('span');
    copy.className = 'rival-option-copy';
    const name = document.createElement('span');
    name.className = 'rival-option-name';
    name.textContent = rival.shortName;
    const selected = document.createElement('span');
    selected.className = 'rival-selected';
    selected.textContent = 'Selected';
    const style = document.createElement('span');
    style.className = 'rival-option-style';
    style.id = `rival-style-${rival.id}`;
    style.textContent = rival.styleBlurb;
    copy.append(name, selected, style);
    label.append(input, copy);
    options.appendChild(label);
  }
  updateRivalPreview(FOOTBALL_OPPONENT.createMatch(selectedRivalId));
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function seasonRecordText(record) {
  return [
    countLabel(record.wins, 'win'),
    countLabel(record.losses, 'loss', 'losses'),
    countLabel(record.ties, 'tie'),
  ].join(' · ');
}

function seasonRungLabel(status) {
  return {
    win: 'Win',
    loss: 'Loss',
    tie: 'Tie',
    next: 'Next',
    pending: 'Not saved',
    open: 'Upcoming',
  }[status] || 'Upcoming';
}

function seasonStatusText(snapshot) {
  if (snapshot.saveState === 'pending') {
    if (FOOTBALL_SEASON.pendingKind() === 'result') {
      const warning = 'Not saved—closing or reloading will lose this game’s season result.';
      if (snapshot.status === 'future') {
        return `${warning} A newer game version saved this season. Retry Saving or use Quick Game. Reloading loses this result.`;
      }
      if (snapshot.status === 'corrupt') {
        return `${warning} Saved progress is damaged or changed. Retry Saving or use Quick Game. Start Fresh after reloading only if needed; this result will be lost.`;
      }
      return warning;
    }
    return 'Season could not be saved yet. Retry saving or play a Quick Game.';
  }
  if (snapshot.saveState === 'conflict') {
    return 'Another tab updated this season. The saved season was kept.';
  }
  if (snapshot.status === 'future') {
    return 'This season was made by a newer game version. Quick Game still works.';
  }
  if (snapshot.status === 'corrupt') {
    return 'Season progress needs a fresh start. Quick Game still works.';
  }
  if (snapshot.status === 'unavailable') {
    return 'Season saving is not available right now. Quick Game still works.';
  }
  if (snapshot.status === 'complete') return 'Season complete and saved on this device.';
  if (snapshot.status === 'active') return 'Season progress is saved on this device.';
  return '';
}

function renderSeasonPanel(snapshot = FOOTBALL_SEASON.snapshot()) {
  const progress = document.getElementById('season-progress');
  const record = document.getElementById('season-record');
  const rungs = document.getElementById('season-rungs');
  const next = document.getElementById('season-next');
  const status = document.getElementById('season-status');
  if (progress) {
    progress.textContent = snapshot.complete
      ? 'Season complete'
      : Number.isInteger(snapshot.gameNumber)
        ? `Game ${snapshot.gameNumber} of ${snapshot.schedule.length}`
        : 'Season unavailable';
  }
  if (record) record.textContent = seasonRecordText(snapshot.record);
  if (rungs) {
    rungs.replaceChildren();
    for (const rung of snapshot.schedule) {
      const rival = FOOTBALL_OPPONENT.resolveRival(rung.rivalId);
      const item = document.createElement('li');
      item.className = 'season-rung';
      item.dataset.status = rung.status;
      item.setAttribute('aria-label', `Game ${rung.gameNumber}, ${rival.displayName}: ${seasonRungLabel(rung.status)}`);
      const number = document.createElement('span');
      number.className = 'season-rung-number';
      number.textContent = String(rung.gameNumber);
      const copy = document.createElement('span');
      copy.className = 'season-rung-copy';
      const team = document.createElement('span');
      team.className = 'season-rung-team';
      team.textContent = rival.shortName;
      const result = document.createElement('span');
      result.className = 'season-rung-result';
      result.textContent = seasonRungLabel(rung.status);
      copy.append(team, result);
      item.append(number, copy);
      rungs.appendChild(item);
    }
  }
  if (next) {
    next.textContent = snapshot.complete
      ? 'All three games are in the books.'
      : snapshot.nextRivalId
        ? `Next up: ${FOOTBALL_OPPONENT.resolveRival(snapshot.nextRivalId).displayName}`
        : 'Choose Quick Game while season saving is unavailable.';
  }
  if (status) status.textContent = seasonStatusText(snapshot);
}

function seasonActionLabel(snapshot) {
  if (seasonActionBusy) return 'Saving…';
  if (snapshot.action === 'retry') return 'Retry Saving';
  if (snapshot.action === 'fresh') return 'Start Fresh Season';
  if (snapshot.action === 'new') return 'Start New Season';
  if (snapshot.action === 'play') return `Play Game ${snapshot.gameNumber}`;
  if (snapshot.action === 'start') return 'Start Season';
  return 'Season Unavailable';
}

function renderStartMode() {
  const quickPanel = document.getElementById('quick-game-panel');
  const seasonPanel = document.getElementById('season-panel');
  const startButton = document.getElementById('start-game-btn');
  for (const input of document.querySelectorAll('input[name="play-mode"]')) {
    input.checked = input.value === selectedPlayMode;
  }
  if (quickPanel) quickPanel.hidden = selectedPlayMode !== 'quick';
  if (seasonPanel) seasonPanel.hidden = selectedPlayMode !== 'season';

  if (selectedPlayMode === 'quick') {
    renderRivalPicker();
    if (startButton) {
      startButton.textContent = 'Start Game';
      startButton.disabled = Boolean(sessionInitialized);
    }
    return;
  }

  const snapshot = FOOTBALL_SEASON.snapshot();
  renderSeasonPanel(snapshot);
  if (snapshot.nextRivalId) {
    const match = FOOTBALL_OPPONENT.createMatch(snapshot.nextRivalId);
    state = { ...state, match };
    applyMatchPresentation(match);
    updatePromptContext(`SEASON / GAME ${snapshot.gameNumber || 1} OF 3 / NEXT ${match.opponent.shortName}`);
  }
  if (startButton) {
    startButton.textContent = seasonActionLabel(snapshot);
    startButton.disabled = seasonActionBusy || snapshot.action === 'unavailable';
  }
}

function selectPlayMode(mode) {
  if (state.phase !== 'start' || !['quick', 'season'].includes(mode)) return false;
  selectedPlayMode = mode;
  renderStartMode();
  return true;
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
  const stageCopy = document.getElementById('stage-mode-copy');
  if (stageCopy) {
    stageCopy.textContent = activeSeasonBinding
      ? `Season game ${activeSeasonBinding.gameNumber} of ${FOOTBALL_SEASON.SCHEDULE.length}`
      : 'Broadcast view';
  }
  if (!['question', 'explanation'].includes(state.phase)) hideMathVisual();
  if (state.phase !== 'explanation') resetWorkedReviewPresentation();
  updatePromptContext();
  renderDefenseRead();
}

function playContextText() {
  if (state.phase === 'start' || !state.possession) {
    return `${state.match.player.shortName} VS ${state.match.opponent.shortName} / FOUR QUARTERS / WIN THE RIVALRY`;
  }

  const score = `SCORE ${state.playerScore}-${state.opponentScore}`;
  if (state.phase === 'touchdown') {
    return state.touchdownSide === 'defense'
      ? `${state.match.opponent.shortName} TOUCHDOWN / ${score}`
      : `${state.match.player.shortName} TOUCHDOWN / ${score}`;
  }
  if (state.phase === 'transition') {
    const incoming = state.possession === 'offense'
      ? `${state.match.player.shortName} ON OFFENSE`
      : `${state.match.opponent.shortName} ON OFFENSE`;
    return `POSSESSION CHANGE / ${incoming} / ${score}`;
  }
  if (state.phase === 'quarter') return `END OF Q${state.quarter} / ${score}`;
  if (state.phase === 'halftime') return `HALFTIME / ${score}`;
  if (state.phase === 'final') return `FINAL / ${score}`;

  if (state.phase === 'conversion-decision' || state.activePlay?.playType === 'conversion') {
    const attempt = state.activePlay?.context?.attemptType === 'twoPoint' ? 'TWO-POINT TRY' : 'CONVERSION';
    return `${ownerForPossession(state.possession)} / ${attempt} / ${score}`;
  }

  const owner = state.possession === 'offense'
    ? `${state.match.player.shortName} BALL`
    : `${state.match.opponent.shortName} BALL`;
  const bits = [owner, `Q${state.quarter}`, `BALL ON ${ydLabel(state.yd, true).toUpperCase()}`];

  if (state.phase === 'call' || state.phase === 'fourth-down-decision') {
    bits.push(`${DOWN_NAMES[state.down] || state.down} & ${state.ytg}`);
  }

  if (state.activePlay?.playType === 'fieldGoal') bits.push(`${state.activePlay.context.attemptDistance}-YARD FIELD GOAL`);
  if (state.activePlay?.playType === 'punt') bits.push(`${state.activePlay.proposal.appliedTravelYards}-YARD PUNT`);

  if (state.phase === 'question' || state.phase === 'explanation' || state.phase === 'feedback') {
    if (state.g != null) bits.push(`${state.g} YDS IN PLAY`);
    if (state.possession === 'defense' && state.matchup) {
      bits.push(state.matchup === 'matched' ? 'GOOD MATCHUP' : 'MISMATCH');
    }
  }

  return bits.join(' / ');
}

function ownerForPossession(possession) {
  return possession === 'offense' ? `${state.match.player.shortName} BALL` : `${state.match.opponent.shortName} BALL`;
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
  return side === 'defense' ? 'Defend Conversion' : 'Choose Conversion';
}

function startingYardFor(possession) {
  return FOOTBALL_DOMAIN.startingYardFor(possession);
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
    match: state.match,
    gameId: state.gameId || statsSession?.gameId || null,
    possessionId: state.possessionId || null,
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
    pendingNextStartYardLine: Number.isInteger(state.pendingNextStartYardLine)
      ? state.pendingNextStartYardLine
      : null,
    pendingRestartReason: state.pendingRestartReason || null,
    finalizedPossessionIds: [...(state.finalizedPossessionIds || [])],
    committedPlayIds: [...(state.committedPlayIds || [])],
  };
}

function makeQuestionUiState() {
  return {
    attempt: 1,
    missedChoiceIds: [],
    support: 'initial',
    reviewExpanded: false,
    reviewSatisfied: false,
    reviewGateState: 'not-required',
    continueRequired: false,
    outcomeCommitted: false,
    resolutionRecorded: false,
  };
}

function blankPlayState() {
  return {
    activePlay: null,
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
    opponentDecisionSnapshot: null,
    publicSpecialAction: null,
    fourthDownGoChosen: false,
    specialRecoveryPlay: null,
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

function makeDriveState(possession, startYardLine = startingYardFor(possession)) {
  const direction = directionFor(possession);
  const yd = clamp(startYardLine, 1, 99);
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

function createGameState(match = FOOTBALL_OPPONENT.createMatch()) {
  return {
    match,
    gameId: statsSession?.gameId || null,
    possessionId: null,
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
    pendingNextStartYardLine: null,
    pendingRestartReason: null,
    finalizedPossessionIds: [],
    committedPlayIds: [],
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
    // `offense` always means the team with the ball. During player defense it
    // intentionally matches the backward-compatible `opponent` alias below.
    offense: calls.offense,
    defense: calls.defense,
    opponent: snap.context.possession === 'defense' ? calls.offense : null,
    matchup: calls.matchup,
  };
}

function statsContextFromPlay(activePlay) {
  const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
  return snap ? statsContextFromSnap(snap) : statsContext();
}

function statsMetricsForPlay(activePlay, transition = activePlay.proposal) {
  if (activePlay.playType === 'scrimmage') {
    return {
      offeredYards: activePlay.proposal.appliedGain,
      actualYards: transition.appliedGain,
    };
  }
  if (activePlay.playType === 'conversion') {
    return {
      attemptType: activePlay.context.attemptType,
      attemptValue: activePlay.context.attemptValue,
      tryYardLine: activePlay.context.tryYardLine,
      pointsAwarded: transition.points,
    };
  }
  if (activePlay.playType === 'fieldGoal') {
    return {
      attemptDistance: activePlay.context.attemptDistance,
      pointsAwarded: transition.points,
    };
  }
  return {
    travelDistance: transition.appliedTravelYards,
    landingYardLine: transition.landingYardLine,
    touchback: transition.restartReason === 'puntTouchback',
    travelClass: transition.mode,
  };
}

function beginStatsDraft(activePlay) {
  const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
  pendingStatsPlay = FOOTBALL_STATS.beginPlayDraft(statsSession, {
    playType: activePlay.playType,
    possessionId: activePlay.possessionId,
    playId: activePlay.playId,
    preSnap: statsContextFromPlay(activePlay),
    calls: snap ? statsCallsFromSnap(snap) : null,
    offeredYards: snap ? snap.proposal.appliedGain : null,
    metrics: statsMetricsForPlay(activePlay),
    links: {
      familyId: null,
      contextId: activePlay.contextId,
      questionInstanceId: null,
    },
  });
  return pendingStatsPlay;
}

function sanitizedStatsQuestion(question) {
  return {
    id: question.familyId,
    familyId: question.familyId,
    contextId: question.contextId,
    questionInstanceId: question.questionInstanceId,
    skill: question.skill,
    concept: question.concept,
    purpose: question.purpose,
    grading: question.grading,
    tier: question.tier,
    evidenceClass: question.evidenceClass,
  };
}

function markStatsPresented(question) {
  return FOOTBALL_STATS.markPresented(pendingStatsPlay, {
    links: {
      familyId: question.familyId,
      contextId: question.contextId,
      questionInstanceId: question.questionInstanceId,
    },
    question: {
      ...sanitizedStatsQuestion(question),
    },
  });
}

function markStatsBypassed(activePlay, links = {}) {
  return FOOTBALL_STATS.markBypassed(pendingStatsPlay, {
    links: {
      familyId: links.familyId ?? null,
      contextId: links.contextId ?? activePlay.contextId,
      questionInstanceId: links.questionInstanceId ?? null,
    },
  });
}

function discardPendingStatsPlay() {
  const pending = pendingStatsPlay;
  pendingStatsPlay = null;
  return pending ? FOOTBALL_STATS.discardPlay(pending) : false;
}

function finalizeStatsPlay(activePlay, transition, outcome) {
  const pending = pendingStatsPlay;
  pendingStatsPlay = null;
  if (!pending) return false;
  const complete = pending.instructionalStatus === 'bypassed'
    ? FOOTBALL_STATS.completeBypassedPlay
    : FOOTBALL_STATS.completePlay;
  return complete(statsSession, pending, {
    actualYards: activePlay.playType === 'scrimmage' ? transition.appliedGain : null,
    outcome,
    metrics: statsMetricsForPlay(activePlay, transition),
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

function nextPossessionId() {
  return `${state.gameId || statsSession?.gameId || 'game'}-possession-${possessionSequence++}`;
}

function nextPlayId() {
  return `${state.gameId || statsSession?.gameId || 'game'}-play-${playSequence++}`;
}

function makeSnapContext(calls, privateOpponentSnapshot = null) {
  const context = {
    contextId: nextContextId(),
    match: state.match,
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

function makeActiveScrimmagePlay(callKey, opts = {}) {
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
  const activePlay = FOOTBALL_DOMAIN.createActivePlay({
    schemaVersion: 1,
    playType: 'scrimmage',
    gameId: state.gameId,
    possessionId: state.possessionId,
    playId: opts.playId || nextPlayId(),
    contextId: snap.contextId,
    context: snap.context,
    proposal: snap.proposal,
    call: snap.call,
  });
  const candidate = questionFaultMode === 'invalid-projection'
    ? { ...activePlay.proposal, endYardLine: activePlay.proposal.endYardLine + state.direction }
    : activePlay.proposal;
  const validation = FOOTBALL_DOMAIN.validatePlayTransition(activePlay, candidate);
  if (!validation.ok) {
    const error = new Error('The proposed football transition failed independent validation.');
    error.code = 'invalid-projection';
    error.diagnostics = validation.diagnostics;
    error.contextId = activePlay.contextId;
    error.activePlay = activePlay;
    throw error;
  }
  return activePlay;
}

function makeActiveSnap(callKey, opts = {}) {
  return FOOTBALL_DOMAIN.activeSnapFromPlay(makeActiveScrimmagePlay(callKey, opts));
}

function makeSpecialContext(playType, details = {}) {
  const context = {
    schemaVersion: 1,
    playType,
    contextId: details.contextId || nextContextId(),
    match: state.match,
    possession: state.possession,
    direction: state.direction,
    quarter: state.quarter,
    ...(playType === 'punt' || playType === 'fieldGoal' ? { yardLine: state.yd } : {}),
    ...(playType === 'fieldGoal' ? {
      attemptDistance: FOOTBALL_DOMAIN.fieldGoalDistance(state.yd, state.direction),
    } : {}),
    ...(playType === 'conversion' ? {
      tryYardLine: FOOTBALL_DOMAIN.tryYardLineFor(state.direction),
      attemptType: details.attemptType,
      attemptValue: details.attemptType === 'twoPoint' ? 2 : 1,
    } : {}),
    scores: {
      player: state.playerScore,
      opponent: state.opponentScore,
    },
  };
  if (questionFaultMode === 'invalid-context') context.direction = state.direction * -1;
  return context;
}

function validateNewSpecialPlay(activePlay) {
  const candidate = questionFaultMode === 'invalid-projection'
    ? { ...activePlay.proposal, points: (activePlay.proposal.points || 0) + 1 }
    : activePlay.proposal;
  const validation = FOOTBALL_DOMAIN.validatePlayTransition(activePlay, candidate);
  if (!validation.ok) {
    const error = new Error('The proposed special-team transition failed independent validation.');
    error.code = 'invalid-projection';
    error.diagnostics = validation.diagnostics;
    error.contextId = activePlay.contextId;
    error.activePlay = activePlay;
    throw error;
  }
  return activePlay;
}

function makePuntActivePlay(options = {}) {
  const travelYards = Number.isInteger(options.travelYards) ? options.travelYards : randomInt(35, 50);
  const playId = options.playId || nextPlayId();
  const contextId = options.contextId || nextContextId();
  try {
    const context = makeSpecialContext('punt', { ...options, contextId });
    const proposal = FOOTBALL_DOMAIN.projectPunt(context, travelYards, { mode: 'normal' });
    return validateNewSpecialPlay(FOOTBALL_DOMAIN.createActivePlay({
      schemaVersion: 1,
      playType: 'punt',
      gameId: state.gameId,
      possessionId: state.possessionId,
      playId,
      contextId: context.contextId,
      context,
      proposal,
    }));
  } catch (error) {
    if (error && typeof error === 'object') {
      error.playId = error.playId ?? playId;
      error.contextId = error.contextId ?? contextId;
      error.recoverySpec = { playType: 'punt', travelYards };
    }
    throw error;
  }
}

function makeFieldGoalActivePlay(options = {}) {
  const playId = options.playId || nextPlayId();
  const contextId = options.contextId || nextContextId();
  try {
    const context = makeSpecialContext('fieldGoal', { ...options, contextId });
    const proposal = FOOTBALL_DOMAIN.projectFieldGoal(context, 'made');
    return validateNewSpecialPlay(FOOTBALL_DOMAIN.createActivePlay({
      schemaVersion: 1,
      playType: 'fieldGoal',
      gameId: state.gameId,
      possessionId: state.possessionId,
      playId,
      contextId: context.contextId,
      context,
      proposal,
    }));
  } catch (error) {
    if (error && typeof error === 'object') {
      error.playId = error.playId ?? playId;
      error.contextId = error.contextId ?? contextId;
      error.recoverySpec = { playType: 'fieldGoal' };
    }
    throw error;
  }
}

function makeConversionActivePlay(attemptType, options = {}) {
  const playId = options.playId || nextPlayId();
  const contextId = options.contextId || nextContextId();
  try {
    const context = makeSpecialContext('conversion', { ...options, contextId, attemptType });
    const proposal = FOOTBALL_DOMAIN.projectConversion(context, 'made');
    return validateNewSpecialPlay(FOOTBALL_DOMAIN.createActivePlay({
      schemaVersion: 1,
      playType: 'conversion',
      gameId: state.gameId,
      possessionId: state.possessionId,
      playId,
      contextId: context.contextId,
      context,
      proposal,
    }));
  } catch (error) {
    if (error && typeof error === 'object') {
      error.playId = error.playId ?? playId;
      error.contextId = error.contextId ?? contextId;
      error.recoverySpec = { playType: 'conversion', attemptType };
    }
    throw error;
  }
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

function isRecursivelyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every(key => isRecursivelyFrozen(value[key], seen));
}

function validReviewCopy(copy, bindingIds, answerId) {
  return Boolean(copy)
    && typeof copy.text === 'string'
    && copy.text.trim() !== ''
    && typeof copy.ariaLabel === 'string'
    && copy.ariaLabel.trim() !== ''
    && Array.isArray(copy.bindingIds)
    && copy.bindingIds.length > 0
    && copy.bindingIds.every(id => bindingIds.has(id))
    && copy.answerId === answerId;
}

function validateQuestionInstance(activePlay, question) {
  if (!question || typeof question !== 'object') throw Object.assign(new Error('Question builder returned no contract.'), { code: 'malformed-question' });
  if (question.schemaVersion !== FOOTBALL_CONTEXTUAL_QUESTIONS.SCHEMA_VERSION) {
    throw Object.assign(new Error('Question schema does not match the contextual-question module.'), { code: 'malformed-question' });
  }
  if (question.contextId !== activePlay.contextId || !question.questionInstanceId || question.id !== question.familyId
    || question.playType !== activePlay.playType) {
    throw Object.assign(new Error('Question identity does not link to the frozen play.'), { code: 'malformed-question' });
  }
  const validEvidenceClass = FOOTBALL_CONTEXTUAL_QUESTIONS.EVIDENCE_CLASSES.includes(question.evidenceClass);
  const sourceVisibleContradiction = question.answerExposure === 'source-visible'
    && question.evidenceClass !== 'literacy';
  const independentExposureContradiction = question.evidenceClass === 'independent'
    && question.answerExposure === 'source-visible';
  if (!validEvidenceClass || sourceVisibleContradiction || independentExposureContradiction) {
    throw Object.assign(new Error('Question evidence classification contradicts its answer exposure.'), { code: 'malformed-question' });
  }
  if (!Array.isArray(question.bindings) || question.bindings !== question.premises || !question.bindings.length) {
    throw Object.assign(new Error('Question bindings are missing or have drifted.'), { code: 'malformed-question' });
  }
  const specialBindingPaths = activePlay.playType === 'scrimmage'
    ? null
    : new Set(FOOTBALL_CONTEXTUAL_QUESTIONS.SPECIAL_BINDING_PATHS[activePlay.playType] || []);
  for (const binding of question.bindings) {
    if (binding?.source?.kind === 'context'
      && /private|opponentDecision|plannedCall|weight/i.test(binding.source.path)) {
      throw Object.assign(new Error('Question bindings may not expose the private opponent snapshot.'), { code: 'malformed-question' });
    }
    if (specialBindingPaths && binding?.source?.kind === 'context'
      && !specialBindingPaths.has(binding.source.path)) {
      throw Object.assign(new Error('Special-team question bindings exceed the outcome-independent public allowlist.'), { code: 'malformed-question' });
    }
    const actual = binding?.source?.kind === 'context'
      ? readQuestionPointer(activePlay, binding.source.path)
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
  const canonicalBindingIds = new Set(question.bindings.map(binding => binding.id));
  const review = question.workedReview;
  const stepIds = Array.isArray(review?.steps) ? review.steps.map(step => step?.id) : [];
  if (!review || review.familyId !== question.familyId || review.concept !== question.concept
    || typeof review.title !== 'string' || review.title.trim() === ''
    || ![2, 3].includes(stepIds.length) || new Set(stepIds).size !== stepIds.length
    || stepIds.some(id => typeof id !== 'string' || id.trim() === '')
    || !validReviewCopy(review.goal, canonicalBindingIds, question.answer.id)
    || !review.steps.every(step => validReviewCopy(step, canonicalBindingIds, question.answer.id))
    || !validReviewCopy(review.footballMeaning, canonicalBindingIds, question.answer.id)
    || !isRecursivelyFrozen(review)) {
    throw Object.assign(new Error('Question worked review is missing, ungrounded, or mutable.'), { code: 'malformed-question' });
  }
  for (const stage of ['initial', 'guided', 'worked']) {
    const visual = question.visuals?.[stage];
    if (!visual || typeof visual.ariaLabel !== 'string' || visual.ariaLabel.trim() === '') {
      throw Object.assign(new Error(`Question is missing its ${stage} visual contract.`), { code: 'malformed-question' });
    }
    if (question.evidenceClass === 'independent' && stage !== 'worked'
      && (visual.revealsAnswer !== false || visual.result !== null)) {
      throw Object.assign(new Error(`Independent evidence exposes its ${stage} answer.`), { code: 'malformed-question' });
    }
  }
  return question;
}

function pickQuestion(activePlay) {
  const profile = contextualQuestionProfile();
  const inspected = FOOTBALL_CONTEXTUAL_QUESTIONS.inspect(activePlay, profile);
  const eligible = questionFaultMode === 'empty-pool' ? [] : inspected.eligible.map((entry) => {
    const selection = FOOTBALL_CONTEXTUAL_QUESTIONS.selectionFor(activePlay, entry.familyId);
    return { ...entry, selectionMultiplier: selection.multiplier };
  });
  if (!eligible.length) {
    const error = new Error('No truthful contextual question family is eligible for this valid snap.');
    error.code = 'empty-pool';
    error.declined = inspected.declined;
    error.familyId = null;
    error.contextId = activePlay.contextId;
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
    const support = FOOTBALL_LEARNING.supportFor(learningSession, entry, firstSupport);
    const built = FOOTBALL_CONTEXTUAL_QUESTIONS.build(activePlay, entry.familyId, {
      support,
      presentationRng,
      profile: inspected.profile,
    });
    const source = questionFaultMode === 'malformed'
      ? { ...built, workedReview: null }
      : questionFaultMode === 'schema-mismatch'
        ? { ...built, schemaVersion: FOOTBALL_CONTEXTUAL_QUESTIONS.SCHEMA_VERSION - 1 }
        : built;
    question = FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({
      ...source,
      contextId: activePlay.contextId,
      questionInstanceId: nextQuestionInstanceId(),
    }));
    return validateQuestionInstance(activePlay, question);
  } catch (error) {
    const failure = error && typeof error === 'object' ? error : new Error(String(error));
    failure.familyId = failure.familyId ?? entry.familyId;
    failure.contextId = failure.contextId ?? activePlay.contextId;
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
    resultReason: transition.resultReason,
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
  applyMatchPresentation(state.match);
  const conversionMode = state.phase === 'conversion-decision' || state.activePlay?.playType === 'conversion';
  const downLabel = document.getElementById('s-down-label');
  const yardLabel = document.getElementById('s-yd-label');
  if (downLabel) downLabel.textContent = conversionMode ? 'Play' : 'Down';
  if (yardLabel) yardLabel.textContent = conversionMode ? 'Try Spot' : 'Ball On';
  document.getElementById('s-down').textContent = conversionMode ? 'TRY' : downDistanceLabel(state.down, state.ytg);
  document.getElementById('s-yd').textContent = conversionMode
    ? '2-yard line'
    : ydLabel(state.yd, true);
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
  const teamToken = (text, team) => ({ text, team });
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
    case 'base-ten-score': {
      const tensUnit = data.tens === 1 ? 'TEN' : 'TENS';
      const onesUnit = data.ones === 1 ? 'ONE' : 'ONES';
      const teamLabel = String(data.team || 'TEAM').toUpperCase();
      tokens = visual.result
        ? [`${data.tens} ${tensUnit}`, `${data.ones} ${onesUnit}`, teamToken(`= ${teamLabel} ${data.score}`, data.teamRole)]
        : [teamToken(`${teamLabel} ${data.score}`, data.teamRole), data.targetPlace === 'tens' ? '? TENS' : '? ONES'];
      break;
    }
    case 'drive-strip':
      tokens = ['DRIVE START', visual.result ? `${visual.result.value} YDS` : '? YDS', 'NOW'];
      break;
    case 'score-parts':
      tokens = [
        teamToken(`${String(data.playerLabel).toUpperCase()} ${data.playerScore}`, 'player'),
        '+',
        teamToken(`${String(data.opponentLabel).toUpperCase()} ${data.opponentScore}`, 'opponent'),
        visual.result ? `= ${visual.result.value}` : '= ?',
      ];
      break;
    case 'score-difference':
      tokens = [
        teamToken(`${String(data.playerLabel).toUpperCase()} ${data.playerScore}`, 'player'),
        'APART',
        teamToken(`${String(data.opponentLabel).toUpperCase()} ${data.opponentScore}`, 'opponent'),
        visual.result ? `${visual.result.value}` : '?',
      ];
      break;
    case 'scoreboard-read':
      tokens = [data.label || 'SCOREBOARD'];
      break;
    case 'quarter-half':
      tokens = [`Q${data.quarter}`, visual.result ? String(visual.result.value).toUpperCase() : 'HALF ?'];
      break;
    case 'comparison': {
      const relation = visual.result?.value;
      const relationLabel = relation === '<' ? 'LESS THAN' : relation === '>' ? 'GREATER THAN' : relation === '=' ? 'EQUAL TO' : '?';
      tokens = [`${data.leftLabel} ${data.leftValue}`, relationLabel, `${data.rightLabel} ${data.rightValue}`];
      break;
    }
    case 'hundreds-move': {
      if (support === 'initial') {
        tokens = [teamToken(`${data.team} TOTAL ${data.startTotal}`, data.teamRole), `+${data.proposedGain}`, visual.result ? `= ${visual.result.value}` : '= ?'];
      } else {
        tokens = Array.from({ length: data.proposedGain }, (_, index) => data.startTotal + index);
        tokens.push(visual.result ? visual.result.value : '?');
      }
      break;
    }
    case 'down-progression':
      tokens = [
        `CURRENT ${String(DOWN_NAMES[data.currentDown] || data.currentDown).toUpperCase()} & ${data.yardsToGo}`,
        `PLAY +${data.proposedGain}`,
        visual.result ? `NEXT ${visual.result.value}` : 'NEXT ?',
      ];
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
    case 'conversion-value':
      tokens = [
        teamToken(`${String(data.team || 'TEAM').toUpperCase()} ${data.score}`, data.teamRole),
        data.attemptType === 'twoPoint' ? 'TWO-POINT TRY' : 'PAT',
        visual.result ? `${visual.result.value} ${visual.result.value === 1 ? 'POINT' : 'POINTS'}` : '? POINTS',
      ];
      break;
    case 'conversion-marker':
      tokens = [
        data.direction === 1 ? 'GOAL 100' : 'GOAL 0',
        'TWO YARDS BACK',
        visual.result ? `TRY ${visual.result.value}` : 'TRY ?',
      ];
      break;
    case 'field-goal-distance':
      tokens = [`${data.attemptDistance}-YARD FIELD GOAL`];
      break;
    case 'field-goal-value':
      tokens = [
        teamToken(`${String(data.team || 'TEAM').toUpperCase()} ${data.score}`, data.teamRole),
        `${data.attemptDistance}-YD FG`,
        visual.result ? `${visual.result.value} POINTS` : '? POINTS',
      ];
      break;
    case 'punt-travel':
      tokens = [`START ${data.startYardLine}`, data.direction === 1 ? 'KICK RIGHT' : 'KICK LEFT', `${data.travelYards} YDS`];
      break;
    case 'punt-landing':
      tokens = [`START ${data.startYardLine}`, `${data.travelYards} YDS`, visual.result ? `LAND ${visual.result.value}` : 'LAND ?'];
      break;
    default:
      tokens = Object.values(data).filter(value => value !== null && ['string', 'number'].includes(typeof value));
      if (!tokens.length) tokens = ['FOOTBALL MATH'];
  }
  overlay.innerHTML = `<div class="math-context-row" aria-hidden="true">${tokens.map((token, index) => {
    const tokenValue = token && typeof token === 'object' ? token.text : token;
    const teamAttribute = token && typeof token === 'object' && token.team ? ` data-team="${token.team}"` : '';
    return `<span class="${index % 2 === 0 ? 'math-context-token' : 'math-context-link'}"${teamAttribute}>${tokenValue}</span>`;
  }
  ).join('')}</div>` + (support === 'worked' ? `<span class="math-worked">${question.workedExplanation.text}</span>` : '');
}

function workedReviewElements() {
  return {
    summary: document.getElementById('film-room-summary'),
    summaryCopy: document.getElementById('film-room-summary-copy'),
    region: document.getElementById('worked-review'),
    heading: document.getElementById('worked-review-heading'),
    content: document.getElementById('worked-review-content'),
    back: document.getElementById('worked-review-back'),
    learn: document.getElementById('question-learn-why'),
    continueButton: document.getElementById('question-continue'),
  };
}

function reviewAvailable() {
  const learn = document.getElementById('question-learn-why');
  return state.phase === 'explanation'
    && Boolean(learn)
    && !learn.disabled
    && !learn.classList.contains('hidden');
}

function resetWorkedReviewPresentation() {
  const { summary, summaryCopy, region, heading, content, back, learn } = workedReviewElements();
  if (state.questionUi) state.questionUi.reviewExpanded = false;
  if (summary) summary.classList.add('hidden');
  if (summaryCopy) summaryCopy.textContent = '';
  if (content) content.replaceChildren();
  if (heading) heading.textContent = 'Coach Replay';
  if (region) {
    region.hidden = true;
    region.inert = true;
    region.classList.add('hidden');
    region.setAttribute('aria-hidden', 'true');
  }
  if (back) {
    back.classList.add('hidden');
    back.disabled = true;
  }
  if (learn) {
    learn.classList.add('hidden');
    learn.disabled = true;
    learn.setAttribute('aria-expanded', 'false');
  }
}

function collapseWorkedReview({ restoreFocus = true } = {}) {
  const { region, heading, content, back, learn } = workedReviewElements();
  if (state.questionUi) state.questionUi.reviewExpanded = false;
  if (content) content.replaceChildren();
  if (heading) heading.textContent = 'Coach Replay';
  if (region) {
    region.hidden = true;
    region.inert = true;
    region.classList.add('hidden');
    region.setAttribute('aria-hidden', 'true');
  }
  if (back) {
    back.classList.add('hidden');
    back.disabled = true;
  }
  if (learn) {
    learn.setAttribute('aria-expanded', 'false');
    const canOffer = state.phase === 'explanation'
      && Boolean(state.questionInstance?.workedReview)
      && !learn.disabled;
    learn.classList.toggle('hidden', !canOffer);
    if (restoreFocus && canOffer) learn.focus({ preventScroll: true });
  }
}

function makeWorkedReviewFragment(review) {
  const fragment = document.createDocumentFragment();
  const goal = document.createElement('section');
  goal.className = 'worked-review-goal';
  const goalLabel = document.createElement('div');
  goalLabel.className = 'worked-review-label';
  goalLabel.textContent = 'Goal';
  const goalCopy = document.createElement('p');
  goalCopy.textContent = review.goal.text;
  goalCopy.setAttribute('aria-label', review.goal.ariaLabel);
  goal.append(goalLabel, goalCopy);

  const steps = document.createElement('ol');
  steps.className = 'worked-review-steps';
  review.steps.forEach((step, index) => {
    const item = document.createElement('li');
    item.dataset.stepId = step.id;
    const label = document.createElement('span');
    label.className = 'worked-review-step-number';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = String(index + 1);
    const copy = document.createElement('p');
    copy.textContent = step.text;
    copy.setAttribute('aria-label', step.ariaLabel);
    item.append(label, copy);
    steps.appendChild(item);
  });

  const meaning = document.createElement('section');
  meaning.className = 'worked-review-meaning';
  const meaningLabel = document.createElement('div');
  meaningLabel.className = 'worked-review-label';
  meaningLabel.textContent = 'Football meaning';
  const meaningCopy = document.createElement('p');
  meaningCopy.textContent = review.footballMeaning.text;
  meaningCopy.setAttribute('aria-label', review.footballMeaning.ariaLabel);
  meaning.append(meaningLabel, meaningCopy);
  fragment.append(goal, steps, meaning);
  if (questionFaultMode === 'review-render-throw') {
    throw new Error('Injected worked-review rendering failure.');
  }
  return fragment;
}

function expandWorkedReview() {
  if (state.phase !== 'explanation' || !reviewAvailable() || state.questionUi?.reviewExpanded) return false;
  const question = state.questionInstance;
  const { region, heading, content, back, learn, continueButton } = workedReviewElements();
  try {
    if (!question?.workedReview || !region || !heading || !content || !back || !learn || !continueButton) {
      throw new Error('Worked-review presentation is unavailable.');
    }
    const fragment = makeWorkedReviewFragment(question.workedReview);
    content.replaceChildren(fragment);
    heading.textContent = `Coach Replay: ${question.workedReview.title}`;
    state.questionUi.reviewExpanded = true;
    learn.setAttribute('aria-expanded', 'true');
    learn.classList.add('hidden');
    back.disabled = false;
    back.classList.remove('hidden');
    region.hidden = false;
    region.inert = false;
    region.classList.remove('hidden');
    region.setAttribute('aria-hidden', 'false');
    state.questionUi.reviewSatisfied = true;
    state.questionUi.reviewGateState = 'opened';
    showContinueButton({ focus: false });
    heading.focus({ preventScroll: true });
    return true;
  } catch (error) {
    state.questionUi.reviewExpanded = false;
    state.questionUi.reviewSatisfied = true;
    state.questionUi.reviewGateState = 'bypassed-render-failure';
    if (content) content.replaceChildren();
    if (heading) heading.textContent = 'Coach Replay';
    if (region) {
      region.hidden = true;
      region.inert = true;
      region.classList.add('hidden');
      region.setAttribute('aria-hidden', 'true');
    }
    if (back) {
      back.disabled = true;
      back.classList.add('hidden');
    }
    if (learn) {
      learn.setAttribute('aria-expanded', 'false');
      learn.disabled = true;
      learn.classList.add('hidden');
    }
    if (continueButton) {
      continueButton.classList.remove('hidden');
      continueButton.disabled = false;
      continueButton.focus({ preventScroll: true });
    }
    reportFootballDiagnostic('worked-review-render-failure', {
      familyId: question?.familyId ?? null,
      contextId: question?.contextId ?? state.activePlay?.contextId ?? null,
      questionInstanceId: question?.questionInstanceId ?? null,
    });
    return false;
  }
}

function showWorkedReviewSummary() {
  resetWorkedReviewPresentation();
  const question = state.questionInstance;
  const { summary, summaryCopy, learn, continueButton } = workedReviewElements();
  if (!question?.workedReview || !summary || !summaryCopy || !learn) {
    if (state.questionUi) {
      state.questionUi.reviewSatisfied = true;
      state.questionUi.reviewGateState = 'bypassed-render-failure';
    }
    showContinueButton({ focus: false });
    if (continueButton) continueButton.focus({ preventScroll: true });
    return false;
  }
  if (state.questionUi) {
    state.questionUi.reviewSatisfied = false;
    state.questionUi.reviewGateState = 'pending';
  }
  hideContinueButton();
  summaryCopy.textContent = question.workedExplanation.text;
  summary.classList.remove('hidden');
  learn.disabled = false;
  learn.classList.remove('hidden');
  learn.setAttribute('aria-expanded', 'false');
  summary.focus({ preventScroll: true });
  return true;
}

function hideContinueButton() {
  const button = document.getElementById('question-continue');
  if (!button) return;
  button.classList.add('hidden');
  button.disabled = true;
}

function showContinueButton({ focus = true } = {}) {
  const button = document.getElementById('question-continue');
  if (!button) return;
  button.classList.remove('hidden');
  button.disabled = false;
  if (focus) requestAnimationFrame(() => button.focus({ preventScroll: true }));
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
    ? `Pre-snap read: ${state.match.opponent.shortName} shows ${snapshot.look.label}, ${snapshot.look.alignment}. ${snapshot.lean.label}.`
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

function hideDecisionGrid() {
  const grid = document.getElementById('decision-grid');
  if (!grid) return;
  grid.classList.add('hidden');
  delete grid.dataset.count;
  delete grid.dataset.possession;
  grid.replaceChildren();
}

function renderButtons() {
  hideCallGrid();
  hideDecisionGrid();
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

function renderCallGrid(calls, onPick, { focusFirst = false } = {}) {
  hideAnswerButtons();
  hideDecisionGrid();
  hideMathVisual();
  const grid = document.getElementById('call-grid');
  grid.innerHTML = '';
  grid.classList.remove('hidden');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', state.possession === 'defense' ? 'Defense coverage calls' : 'Offense play calls');
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
    btn.addEventListener('click', () => {
      const transferFocus = document.activeElement === btn;
      const handled = onPick(call.key);
      if (transferFocus && handled !== false && !btn.isConnected) {
        const target = document.querySelector(
          '#btn-row:not(.hidden) .ans-btn:not(.hidden):not(:disabled)'
        );
        if (target) target.focus({ preventScroll: true });
      }
    });
    grid.appendChild(btn);
  });
  const firstButton = grid.querySelector('.call-btn:not(:disabled)');
  if (focusFirst && firstButton && !document.querySelector('.overlay.show')) {
    firstButton.focus({ preventScroll: true });
  }
}

function renderDecisionGrid(actions, onPick, ariaLabel) {
  hideAnswerButtons();
  hideCallGrid();
  hideMathVisual();
  const grid = document.getElementById('decision-grid');
  grid.replaceChildren();
  grid.classList.remove('hidden');
  grid.dataset.count = String(actions.length);
  grid.dataset.possession = state.possession;
  grid.setAttribute('aria-label', ariaLabel || 'Special-teams decision');
  actions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'decision-btn';
    button.dataset.action = action.key;
    const eyebrow = document.createElement('span');
    eyebrow.className = 'decision-eyebrow';
    eyebrow.textContent = action.eyebrow || 'Decision';
    const label = document.createElement('span');
    label.className = 'decision-label';
    label.textContent = action.label;
    const description = document.createElement('span');
    description.className = 'decision-desc';
    description.textContent = action.desc;
    button.append(eyebrow, label, description);
    button.addEventListener('click', () => {
      const transferFocus = document.activeElement === button;
      const handled = onPick(action.key);
      if (transferFocus && handled !== false && !button.isConnected) {
        const target = document.querySelector(
          '#btn-row:not(.hidden) .ans-btn:not(.hidden):not(:disabled), '
          + '#call-grid:not(.hidden) .call-btn:not(:disabled)'
        );
        if (target) target.focus({ preventScroll: true });
      }
    });
    grid.appendChild(button);
  });
  const firstButton = grid.querySelector('.decision-btn:not([disabled])');
  if (firstButton && !document.querySelector('.overlay.show')) {
    firstButton.focus({ preventScroll: true });
  }
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
function announceSpecialAction(text) {
  const live = document.getElementById('special-action-live');
  if (live) live.textContent = text || '';
}

function renderOrdinaryCallPrompt({ focusFirstCall = false } = {}) {
  state.phase = 'call';
  updateStatus();
  if (state.possession === 'offense') {
    document.getElementById('play-label').textContent = downDistanceLabel(state.down, state.ytg);
    document.getElementById('question').textContent = 'Call the snap. Every play uses your learning plan.';
    applyDeskHeader('callOffense');
    renderCallGrid(Object.values(OFFENSE_CALLS), selectOffenseCall, { focusFirst: focusFirstCall });
  } else {
    document.getElementById('play-label').textContent = downDistanceLabel(state.down, state.ytg);
    document.getElementById('question').textContent = 'Call the coverage.';
    applyDeskHeader('callDefense');
    renderCallGrid(Object.values(DEFENSE_CALLS), selectDefenseCall, { focusFirst: focusFirstCall });
  }
  setFeedback('');
}

function fourthDownDecisionState() {
  return {
    possession: state.possession,
    direction: state.direction,
    quarter: state.quarter,
    quarterPossessions: state.quarterPossessions,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    yardLine: state.yd,
    yardsToGo: state.ytg,
    scores: { player: state.playerScore, opponent: state.opponentScore },
  };
}

function taggedOpponentDecision(decision) {
  if (decision?.gameId === state.gameId && decision?.possessionId === state.possessionId) return decision;
  return FOOTBALL_DOMAIN.deepFreeze({
    ...FOOTBALL_DOMAIN.clone(decision),
    gameId: state.gameId,
    possessionId: state.possessionId,
  });
}

function showPlayerFourthDownDecision(recovery = null) {
  state.phase = 'fourth-down-decision';
  state.specialRecoveryPlay = recovery;
  updateStatus();
  document.getElementById('play-label').textContent = downDistanceLabel(state.down, state.ytg);
  const frozenAction = recovery?.playType === 'punt' ? 'punt'
    : recovery?.playType === 'fieldGoal' ? 'fieldGoal' : null;
  const preservedPuntTravel = recovery?.proposal?.requestedTravelYards ?? recovery?.travelYards;
  const actions = frozenAction ? [{
    key: frozenAction,
    eyebrow: 'Same action',
    label: frozenAction === 'punt' ? 'Retry Punt' : 'Retry Field Goal',
    desc: frozenAction === 'punt'
      ? `The preserved ${preservedPuntTravel}-yard punt draw is waiting.`
      : 'The same field-goal try is waiting.',
  }] : [
    { key: 'go', eyebrow: 'Keep the drive alive', label: 'Go for it', desc: 'Choose from the normal five-play call sheet.' },
    { key: 'punt', eyebrow: 'Change field position', label: 'Punt', desc: 'Kick the ball away and pin the opponent back.' },
  ];
  if (!frozenAction && FOOTBALL_DOMAIN.isFieldGoalLegal(state.yd, state.direction)) actions.push({
    key: 'fieldGoal',
    eyebrow: `${FOOTBALL_DOMAIN.fieldGoalDistance(state.yd, state.direction)}-yard attempt`,
    label: 'Field Goal',
    desc: 'Try to score three points.',
  });
  const fieldGoalAction = actions.find(({ key }) => key === 'fieldGoal');
  let decisionCopy;
  if (frozenAction === 'punt') {
    decisionCopy = `Retry the preserved ${preservedPuntTravel}-yard punt.`;
    document.getElementById('question').textContent = decisionCopy;
    setDeskHeader('4th Down', 'Retry the same punt.', decisionCopy);
  } else if (frozenAction === 'fieldGoal') {
    decisionCopy = 'Retry the same field-goal try.';
    document.getElementById('question').textContent = decisionCopy;
    setDeskHeader('4th Down', 'Retry the same field goal.', decisionCopy);
  } else if (fieldGoalAction) {
    decisionCopy = `Choose go, punt, or the legal ${FOOTBALL_DOMAIN.fieldGoalDistance(state.yd, state.direction)}-yard field goal.`;
    document.getElementById('question').textContent = 'Make the fourth-down decision.';
    setDeskHeader('4th Down', 'Make the fourth-down call.', decisionCopy);
  } else {
    decisionCopy = 'Choose go or punt.';
    document.getElementById('question').textContent = 'Make the fourth-down decision.';
    setDeskHeader('4th Down', 'Make the fourth-down call.', 'Go for it or punt.');
  }
  renderDecisionGrid(
    actions,
    selectFourthDownAction,
    frozenAction ? 'Retry the same fourth-down action' : 'Choose a fourth-down action',
  );
  setFeedback(decisionCopy, 'info');
  announceSpecialAction(decisionCopy);
  syncUiState();
}

function opponentSpecialActionLabel(action) {
  if (action === 'fieldGoal') return `${state.match.opponent.shortName} chooses a field goal.`;
  if (action === 'punt') return `${state.match.opponent.shortName} chooses to punt.`;
  if (action === 'twoPoint') return `${state.match.opponent.shortName} chooses a two-point try.`;
  return `${state.match.opponent.shortName} chooses a PAT.`;
}

function buildSpecialPlay(action, recovery = null) {
  const conversionAction = action === 'pat' || action === 'twoPoint';
  const sameAction = recovery?.playType === action
    || (conversionAction && recovery?.playType === 'conversion'
      && (recovery?.context?.attemptType || recovery?.attemptType) === action);
  if (sameAction && recovery.proposal) return recovery;
  const spec = sameAction ? recovery : {};
  if (action === 'punt') return makePuntActivePlay(spec);
  if (action === 'fieldGoal') return makeFieldGoalActivePlay(spec);
  if (action === 'pat' || action === 'twoPoint') return makeConversionActivePlay(action, spec);
  throw new Error(`Unknown special-team action: ${action}`);
}

function specialRecoverySpec(activePlay, { preserveIdentity = true } = {}) {
  if (!activePlay || activePlay.playType === 'scrimmage') return null;
  return FOOTBALL_DOMAIN.deepFreeze({
    playType: activePlay.playType,
    ...(preserveIdentity ? {
      playId: activePlay.playId,
      contextId: activePlay.contextId,
    } : {}),
    ...(activePlay.playType === 'punt'
      ? { travelYards: activePlay.proposal.requestedTravelYards }
      : {}),
    ...(activePlay.playType === 'conversion'
      ? { attemptType: activePlay.context.attemptType }
      : {}),
  });
}

function handleInvalidSpecialPlay(error, origin, action, decision = null) {
  discardPendingStatsPlay();
  const recoveryCandidate = error?.activePlay || error?.recoverySpec || state.specialRecoveryPlay;
  const recovery = recoveryCandidate && !Object.isFrozen(recoveryCandidate)
    ? FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone(recoveryCandidate))
    : recoveryCandidate;
  reportFootballDiagnostic(error?.code || 'invalid-context', {
    message: error?.message || 'The special-team play could not be validated.',
    diagnostics: error?.diagnostics || null,
    playId: error?.playId ?? error?.activePlay?.playId ?? null,
    familyId: error?.familyId ?? null,
    contextId: error?.contextId ?? recovery?.contextId ?? null,
    questionInstanceId: error?.questionInstanceId ?? null,
  });
  const fieldGoalNoLongerLegal = origin === 'fourth-down-decision'
    && action === 'fieldGoal'
    && !FOOTBALL_DOMAIN.isFieldGoalLegal(state.yd, state.direction);
  if (fieldGoalNoLongerLegal) {
    Object.assign(state, blankPlayState(), {
      phase: origin,
      opponentDecisionSnapshot: null,
      publicSpecialAction: null,
      specialRecoveryPlay: null,
    });
    if (state.possession === 'offense') showPlayerFourthDownDecision();
    else beginOpponentFourthDown();
    return;
  }
  Object.assign(state, blankPlayState(), {
    phase: origin,
    opponentDecisionSnapshot: decision,
    publicSpecialAction: state.possession === 'defense' ? action : null,
    specialRecoveryPlay: recovery,
  });
  if (origin === 'conversion-decision') {
    showConversionDecision(recovery, decision);
  } else if (state.possession === 'offense') {
    showPlayerFourthDownDecision(recovery);
  } else {
    updateStatus();
    const preservedPuntTravel = recovery?.proposal?.requestedTravelYards ?? recovery?.travelYards;
    const recoveryCopy = action === 'punt'
      ? `Retry the preserved ${preservedPuntTravel}-yard punt.`
      : 'Retry the same field-goal try.';
    setDeskHeader('4th Down', 'Retry the opponent action.', recoveryCopy);
    document.getElementById('play-label').textContent = action === 'punt' ? 'Punt' : 'Field Goal';
    document.getElementById('question').textContent = recoveryCopy;
    renderDecisionGrid([{
      key: action,
      eyebrow: 'Same action',
      label: action === 'punt' ? 'Retry Punt' : 'Retry Field Goal',
      desc: action === 'punt'
        ? `The opponent's preserved ${preservedPuntTravel}-yard punt draw is waiting.`
        : "The opponent's same field-goal try is waiting.",
    }], retryOpponentSpecialAction, 'Retry the same opponent action');
    setFeedback(`That play could not be checked. ${recoveryCopy}`, 'info');
    announceSpecialAction(recoveryCopy);
    syncUiState();
  }
}

function retryOpponentSpecialAction(action) {
  const decision = state.opponentDecisionSnapshot;
  const recoveryType = state.specialRecoveryPlay?.playType;
  if (state.phase !== 'fourth-down-decision' || state.possession !== 'defense'
    || !decision || decision.action !== action || recoveryType !== action) return false;
  let activePlay;
  try {
    activePlay = buildSpecialPlay(action, state.specialRecoveryPlay);
  } catch (error) {
    handleInvalidSpecialPlay(error, 'fourth-down-decision', action, decision);
    return false;
  }
  startSpecialPlay(activePlay, opponentSpecialActionLabel(action));
  return true;
}

function retryOpponentConversionAction(action) {
  const decision = state.opponentDecisionSnapshot;
  const recoveryAction = state.specialRecoveryPlay?.context?.attemptType
    || state.specialRecoveryPlay?.attemptType;
  if (state.phase !== 'conversion-decision' || state.possession !== 'defense'
    || !decision || decision.action !== action || recoveryAction !== action) return false;
  let activePlay;
  try {
    activePlay = buildSpecialPlay(action, state.specialRecoveryPlay);
  } catch (error) {
    handleInvalidSpecialPlay(error, 'conversion-decision', action, decision);
    return false;
  }
  startSpecialPlay(activePlay, opponentSpecialActionLabel(action));
  return true;
}

function beginOpponentFourthDown(decision = null, recovery = null) {
  const frozenDecision = decision || taggedOpponentDecision(FOOTBALL_OPPONENT.decideFourthDown(fourthDownDecisionState()));
  state.opponentDecisionSnapshot = frozenDecision;
  if (frozenDecision.action === 'go') {
    state.fourthDownGoChosen = true;
    state.opponentSnapshot = state.opponentSnapshot || planOpponentSnap();
    renderOrdinaryCallPrompt();
    return;
  }
  state.publicSpecialAction = frozenDecision.action;
  let activePlay;
  try {
    activePlay = buildSpecialPlay(frozenDecision.action, recovery);
  } catch (error) {
    handleInvalidSpecialPlay(error, 'fourth-down-decision', frozenDecision.action, frozenDecision);
    return;
  }
  startSpecialPlay(activePlay, opponentSpecialActionLabel(frozenDecision.action));
}

function showCallPrompt({ preserveOpponentSnapshot = false, forceScrimmage = false, focusFirstCall = false } = {}) {
  clearTimeout(advTimer);
  const opponentSnapshot = preserveOpponentSnapshot ? state.opponentSnapshot : null;
  const decision = state.down === 4 ? state.opponentDecisionSnapshot : null;
  const recovery = state.down === 4 ? state.specialRecoveryPlay : null;
  const goChosen = state.down === 4 && (forceScrimmage || state.fourthDownGoChosen);
  Object.assign(state, blankPlayState(), {
    phase: 'call',
    opponentDecisionSnapshot: decision,
    opponentSnapshot,
    specialRecoveryPlay: recovery,
    fourthDownGoChosen: goChosen,
  });
  announceSpecialAction('');
  if (state.down === 4 && !goChosen) {
    if (state.possession === 'offense') showPlayerFourthDownDecision(recovery);
    else beginOpponentFourthDown(decision, recovery);
    return;
  }
  if (state.possession === 'defense') {
    state.opponentSnapshot = opponentSnapshot || planOpponentSnap();
  }
  renderOrdinaryCallPrompt({ focusFirstCall });
}

function selectFourthDownAction(action) {
  if (state.phase !== 'fourth-down-decision' || state.possession !== 'offense') return false;
  const recoveryAction = state.specialRecoveryPlay?.playType;
  if (recoveryAction && action !== recoveryAction) return false;
  if (action === 'go') {
    const recovery = state.specialRecoveryPlay;
    Object.assign(state, blankPlayState(), {
      phase: 'call',
      fourthDownGoChosen: true,
      specialRecoveryPlay: recovery,
    });
    renderOrdinaryCallPrompt();
    return true;
  }
  if (action === 'fieldGoal' && !FOOTBALL_DOMAIN.isFieldGoalLegal(state.yd, state.direction)) return false;
  let activePlay;
  try {
    activePlay = buildSpecialPlay(action, state.specialRecoveryPlay);
  } catch (error) {
    handleInvalidSpecialPlay(error, 'fourth-down-decision', action);
    return false;
  }
  startSpecialPlay(activePlay, action === 'punt'
    ? 'You choose to punt.'
    : `You choose a ${activePlay.context.attemptDistance}-yard field goal.`);
  return true;
}

function startDrive(possession, startYardLine = null, restartReason = null) {
  clearTimeout(advTimer);
  hideOverlays();
  resetPlayerAnimations();
  const resolvedStart = Number.isInteger(startYardLine)
    ? startYardLine
    : state.pendingNextPossession === possession && Number.isInteger(state.pendingNextStartYardLine)
      ? state.pendingNextStartYardLine
      : startingYardFor(possession);
  const resolvedReason = restartReason
    || (state.pendingNextPossession === possession ? state.pendingRestartReason : null)
    || 'scheduledStart';
  state = {
    ...gameSnapshot(),
    possessionId: nextPossessionId(),
    ...makeDriveState(possession, resolvedStart),
    ...blankPlayState(),
    phase: 'call',
  };
  state.pendingNextPossession = null;
  state.pendingNextStartYardLine = null;
  state.pendingRestartReason = null;
  state.restartReason = resolvedReason;
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

function activatePlayMirrors(activePlay, question = null) {
  const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
  const play = snap ? legacyPlayFromTransition(snap, snap.proposal, question) : null;
  state.activePlay = activePlay;
  state.activeSnap = snap;
  state.questionInstance = question;
  state.pendingResolution = null;
  state.questionUi = makeQuestionUiState();
  if (question) state.questionUi.support = question.support;
  state.g = snap ? snap.proposal.appliedGain : null;
  state.label = snap ? snap.call.label
    : activePlay.playType === 'punt' ? 'Punt'
      : activePlay.playType === 'fieldGoal' ? 'Field Goal'
        : activePlay.context.attemptType === 'twoPoint' ? 'Two-Point Try' : 'PAT';
  state.callKey = snap?.call?.key || null;
  state.defenseCallKey = snap?.context?.calls?.defense || null;
  state.opponentCallKey = snap?.context?.possession === 'defense' ? snap.context.calls.offense : null;
  state.matchup = snap?.context?.calls?.matchup || null;
  state.play = play;
  state.outcomeMessage = null;
  syncQuestionMirrors();
}

function activateSnapMirrors(snap, question = null) {
  const activePlay = FOOTBALL_DOMAIN.createActivePlay({
    schemaVersion: 1,
    playType: 'scrimmage',
    gameId: state.gameId,
    possessionId: state.possessionId,
    playId: nextPlayId(),
    contextId: snap.contextId,
    context: snap.context,
    proposal: snap.proposal,
    call: snap.call,
  });
  activatePlayMirrors(activePlay, question);
}

function learningEventPlayScope(activePlay = state.activePlay) {
  if (!activePlay) return {};
  return {
    gameId: activePlay.gameId,
    possessionId: activePlay.possessionId,
    playId: activePlay.playId,
    playType: activePlay.playType,
  };
}

function prepareQuestion(bundle, labelHtml, feedbackCopy = '') {
  const { activePlay, question } = bundle;
  activatePlayMirrors(activePlay, question);
  state.pendingResolution = FOOTBALL_DOMAIN.deepFreeze({
    schemaVersion: 2,
    policy: 'awaitingAnswer',
    gameId: activePlay.gameId,
    possessionId: activePlay.possessionId,
    playId: activePlay.playId,
    playType: activePlay.playType,
    contextId: activePlay.contextId,
    familyId: question.familyId,
    questionInstanceId: question.questionInstanceId,
    transitionToCommit: null,
  });
  state.phase = 'question';
  document.getElementById('play-label').innerHTML = labelHtml;
  document.getElementById('question').textContent = question.prompt.text;
  applyDeskHeader(activePlay.playType === 'scrimmage'
    ? (state.possession === 'offense' ? 'questionOffense' : 'questionDefense')
    : (state.possession === 'offense' ? 'specialQuestionOffense' : 'specialQuestionDefense'));
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
  markStatsPresented(question);
  FOOTBALL_LEARNING.recordPresented(learningSession, question, learningEventPlayScope(activePlay));
}

function restoreCallAfterInvalid(opponentSnapshot = null) {
  if (state.possession === 'defense' && opponentSnapshot) state.opponentSnapshot = opponentSnapshot;
  showCallPrompt({ preserveOpponentSnapshot: state.possession === 'defense' && Boolean(opponentSnapshot) });
  setFeedback('That snap could not be validated. Call the play again.', 'info');
}

function handleInvalidSnap(error, opponentSnapshot = null) {
  discardPendingStatsPlay();
  reportFootballDiagnostic(error?.code || 'invalid-context', {
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

function activePlayOpponentSnapshot(activePlay) {
  const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
  return snapOpponentSnapshot(snap);
}

function handleQuestionPreparationFailure(error, activePlay, question, feedbackCopy = '') {
  if (error && typeof error === 'object') {
    error.code = 'question-presentation-failure';
    error.familyId = error.familyId ?? question?.familyId ?? null;
    error.contextId = error.contextId ?? activePlay?.contextId ?? null;
    error.questionInstanceId = error.questionInstanceId ?? question?.questionInstanceId ?? null;
  }
  bypassQuestionSubsystem(activePlay, error, feedbackCopy || 'The play goes on without a question.');
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
    if (possession === 'defense') return 0;
    if (policy === 'retryCorrect') return creditedRetryGainForSnap(snap);
    return originalRequestedGain;
  }
  if (policy === 'secondMiss') return secondMissOutcomeForSnap(snap).requestedGain;

  const error = new Error(`Unknown resolution policy: ${policy}`);
  error.code = 'invalid-resolution-policy';
  throw error;
}

function creditedRetryGainForSnap(snap) {
  const originalRequestedGain = snap?.proposal?.requestedGain;
  const originalAppliedGain = snap?.proposal?.appliedGain;
  if (!Number.isInteger(originalRequestedGain) || !Number.isInteger(originalAppliedGain)
    || originalAppliedGain <= 0 || snap?.context?.possession !== 'offense') {
    return originalRequestedGain;
  }
  return Math.max(1, Math.floor(originalAppliedGain / 2));
}

function resolutionAssistMetadata(activePlay, policy, transition) {
  const snap = activePlay?.playType === 'scrimmage'
    ? FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay)
    : null;
  const rawGain = snap ? snap.proposal.appliedGain : null;
  const creditedGain = activePlay?.playType === 'scrimmage' ? transition.appliedGain : null;
  const assisted = policy === 'retryCorrect';
  const reductionApplied = Boolean(assisted
    && snap
    && activePlay.context.possession === 'offense'
    && rawGain > 0
    && creditedGain !== rawGain);
  return {
    assisted,
    assistReason: assisted ? 'retry' : 'none',
    rawGain,
    creditedGain,
    reductionApplied,
    reviewGateState: state.questionUi?.reviewGateState || 'not-required',
  };
}

function secondMissOutcomeForSnap(snap) {
  if (snap?.context?.possession === 'defense') {
    return { requestedGain: Math.min(snap.proposal.appliedGain, 3), resultKind: null, resultReason: null };
  }
  const outcome = SECOND_MISS_OUTCOMES[snap?.call?.key];
  if (!outcome) {
    const error = new Error('Second-miss outcome requires a known frozen call family.');
    error.code = 'invalid-resolution-policy';
    throw error;
  }
  return outcome;
}

function scrimmageResolutionValidationOptions(snap, policy) {
  const outcome = policy === 'secondMiss' ? secondMissOutcomeForSnap(snap) : null;
  return {
    expectedRequestedGain: expectedRequestedGainForResolution(snap, policy),
    expectedResultKind: outcome?.resultKind || undefined,
    expectedResultReason: outcome?.resultReason || undefined,
  };
}

function expectedTransitionForResolution(activePlay, policy) {
  if (!activePlay) throw Object.assign(new Error('Resolution policy requires a frozen active play.'), { code: 'invalid-resolution-policy' });
  const possession = activePlay.context.possession;
  if (policy === 'questionBypass') return activePlay.proposal;
  if (!['firstTryCorrect', 'retryCorrect', 'secondMiss'].includes(policy)) {
    throw Object.assign(new Error(`Unknown resolution policy: ${policy}`), { code: 'invalid-resolution-policy' });
  }
  const instructionalSuccess = policy === 'firstTryCorrect' || policy === 'retryCorrect';
  if (activePlay.playType === 'scrimmage') {
    const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
    if (instructionalSuccess) {
      if (possession === 'defense') return FOOTBALL_DOMAIN.reprojectGain(snap, 0);
      return policy === 'retryCorrect'
        ? FOOTBALL_DOMAIN.reprojectGain(snap, creditedRetryGainForSnap(snap))
        : activePlay.proposal;
    }
    const miss = secondMissOutcomeForSnap(snap);
    return FOOTBALL_DOMAIN.reprojectGain(snap, miss.requestedGain, miss.resultReason ? {
      resultKind: miss.resultKind || undefined,
      resultReason: miss.resultReason,
    } : null);
  }
  const proposalWins = instructionalSuccess ? possession === 'offense' : possession === 'defense';
  if (proposalWins) return activePlay.proposal;
  if (activePlay.playType === 'punt') return FOOTBALL_DOMAIN.reprojectPunt(activePlay, 'receiverFavorable');
  if (activePlay.playType === 'fieldGoal') {
    return FOOTBALL_DOMAIN.reprojectFieldGoal(activePlay, instructionalSuccess ? 'blocked' : 'missed');
  }
  return FOOTBALL_DOMAIN.reprojectConversion(activePlay, 'missed');
}

function validateResolutionTransition(activePlay, policy, transition) {
  if (!activePlay?.playType && activePlay?.context && activePlay?.proposal) {
    return FOOTBALL_DOMAIN.validateTransition(
      activePlay,
      transition,
      scrimmageResolutionValidationOptions(activePlay, policy),
    );
  }
  if (activePlay?.playType === 'scrimmage') {
    const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
    return FOOTBALL_DOMAIN.validatePlayTransition(
      activePlay,
      transition,
      scrimmageResolutionValidationOptions(snap, policy),
    );
  }
  const expected = expectedTransitionForResolution(activePlay, policy);
  const options = activePlay.playType === 'punt'
    ? { expectedMode: expected.mode, expectedTravelYards: expected.requestedTravelYards }
    : { expectedResultKind: expected.resultKind };
  return FOOTBALL_DOMAIN.validatePlayTransition(activePlay, transition, options);
}

function makePendingResolution(policy, transition = null, links = null) {
  const activePlay = state.activePlay;
  if (!activePlay) throw new Error('Cannot resolve a play without an active play');
  const candidate = transition || expectedTransitionForResolution(activePlay, policy);
  const validated = validateResolutionTransition(activePlay, policy, candidate);
  if (!validated.ok) {
    const error = new Error('Resolution transition failed independent validation.');
    error.code = 'invalid-projection';
    error.diagnostics = validated.diagnostics;
    throw error;
  }
  return FOOTBALL_DOMAIN.deepFreeze({
    schemaVersion: 2,
    policy,
    gameId: activePlay.gameId,
    possessionId: activePlay.possessionId,
    playId: activePlay.playId,
    playType: activePlay.playType,
    contextId: activePlay.contextId,
    familyId: links?.familyId ?? state.questionInstance?.familyId ?? null,
    questionInstanceId: links?.questionInstanceId ?? state.questionInstance?.questionInstanceId ?? null,
    transitionToCommit: validated.value,
    assist: resolutionAssistMetadata(activePlay, policy, validated.value),
  });
}

function bypassQuestionSubsystem(activePlay, error, feedbackCopy) {
  const exact = FOOTBALL_DOMAIN.validatePlayTransition(activePlay, activePlay.proposal);
  if (!exact.ok) {
    const invalid = Object.assign(new Error('Question fallback rejected a contradictory football proposal.'), {
      code: 'invalid-projection',
      diagnostics: exact.diagnostics,
      recoverySpec: specialRecoverySpec(activePlay),
    });
    if (activePlay.playType === 'scrimmage') handleInvalidSnap(invalid, activePlayOpponentSnapshot(activePlay));
    else handleInvalidSpecialPlay(invalid,
      activePlay.playType === 'conversion' ? 'conversion-decision' : 'fourth-down-decision',
      activePlay.playType === 'conversion' ? activePlay.context.attemptType : activePlay.playType,
      state.opponentDecisionSnapshot);
    return;
  }
  reportFootballDiagnostic(error?.code || 'question-subsystem-failure', {
    message: error?.message || 'The contextual question could not be built.',
    familyId: error?.familyId ?? null,
    contextId: error?.contextId ?? activePlay.contextId,
    questionInstanceId: error?.questionInstanceId ?? null,
  });
  const bypassLinks = {
    familyId: error?.familyId ?? null,
    contextId: error?.contextId ?? activePlay.contextId,
    questionInstanceId: error?.questionInstanceId ?? null,
  };
  activatePlayMirrors(activePlay, null);
  state.phase = 'feedback';
  hideAnswerButtons();
  hideCallGrid();
  hideDecisionGrid();
  hideMathVisual();
  document.getElementById('play-label').innerHTML = playPromptLabel(activePlay);
  document.getElementById('question').textContent = 'No math question this time. The play still counts.';
  markStatsBypassed(activePlay, bypassLinks);
  state.pendingResolution = makePendingResolution('questionBypass', exact.value, bypassLinks);
  applyDeskHeader(activePlay.playType === 'scrimmage'
    ? (state.possession === 'offense' ? 'resultOffense' : 'resultDefense')
    : (state.possession === 'offense' ? 'specialResultOffense' : 'specialResultDefense'));
  setFeedback(feedbackCopy || 'The play goes on without a question.', 'info');
  commitPendingResolution();
}

function playPromptLabel(activePlay) {
  if (activePlay.playType === 'scrimmage') {
    return `${activePlay.call.label}: if it works, <span>${yds(activePlay.proposal.appliedGain)}</span>`;
  }
  if (activePlay.playType === 'punt') return `Punt preview: <span>${yds(activePlay.proposal.appliedTravelYards)}</span>`;
  if (activePlay.playType === 'fieldGoal') return `<span>${activePlay.context.attemptDistance}-yard field goal</span>`;
  return activePlay.context.attemptType === 'twoPoint' ? '<span>Two-point try</span>' : '<span>PAT try</span>';
}

function startInstructionForPlay(activePlay, labelHtml = playPromptLabel(activePlay), feedbackCopy = '') {
  beginStatsDraft(activePlay);
  let question;
  try {
    question = pickQuestion(activePlay);
  } catch (error) {
    bypassQuestionSubsystem(activePlay, error, 'The play is valid, so it counts without a math question.');
    return false;
  }
  try {
    prepareQuestion({ activePlay, question }, labelHtml, feedbackCopy);
    return true;
  } catch (error) {
    handleQuestionPreparationFailure(error, activePlay, question,
      'The play is valid, so it counts without a math question.');
    return false;
  }
}

function startSpecialPlay(activePlay, revealCopy = '') {
  state.publicSpecialAction = activePlay.playType === 'conversion'
    ? activePlay.context.attemptType
    : activePlay.playType;
  announceSpecialAction(revealCopy);
  return startInstructionForPlay(activePlay, playPromptLabel(activePlay), revealCopy);
}

function selectOffenseCall(callKey) {
  if (state.phase !== 'call' || state.possession !== 'offense') return;
  let activePlay;
  try {
    activePlay = makeActiveScrimmagePlay(callKey, {
      calls: { offense: callKey, defense: null, matchup: null },
    });
  } catch (error) {
    handleInvalidSnap(error);
    return;
  }
  startInstructionForPlay(activePlay);
}

function getOpponentTendency(overrides = {}, profile = rivalForMatch(state.match).profileKey) {
  return FOOTBALL_OPPONENT.getTendency({
    ...state,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    ...overrides,
  }, profile);
}

function planOpponentSnap(
  overrides = {},
  profile = rivalForMatch(state.match).profileKey,
  rng = footballRng,
  opponentId = state.match.opponent.id,
) {
  return FOOTBALL_OPPONENT.planSnap({
    ...state,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    ...overrides,
  }, profile, rng, opponentId);
}

function defenseMatches(defenseCallKey, opponentCallKey) {
  const call = DEFENSE_CALLS[defenseCallKey];
  return call && call.covers.includes(opponentCallKey);
}

function selectDefenseCall(defenseCallKey) {
  if (state.phase !== 'call' || state.possession !== 'defense') return;
  const selection = state.opponentSnapshot;
  if (!selection) {
    reportFootballDiagnostic('missing-opponent-snapshot', {
      message: 'The defensive call phase was missing its frozen opponent plan.',
    });
    // Do not judge this click against a plan the player never saw. Rebuild a
    // truthful public read, stay in the call phase, and require a fresh tap.
    showCallPrompt();
    setFeedback('The offense reset its look. Check the new read, then call the coverage again.', 'info');
    return false;
  }
  const opponentCallKey = selection.plannedCallKey;
  const matched = defenseMatches(defenseCallKey, opponentCallKey);
  const defenseCall = DEFENSE_CALLS[defenseCallKey];
  let activePlay;
  try {
    activePlay = makeActiveScrimmagePlay(opponentCallKey, {
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
  state.opponentSelectionSnapshot = activePlay.context.privateOpponentSnapshot;
  state.opponentSnapshot = null;
  const call = OFFENSE_CALLS[opponentCallKey];
  const read = matched ? 'Good matchup' : 'Mismatch';
  startInstructionForPlay(
    activePlay,
    `${state.match.opponent.shortName} is threatening ${call.label.toLowerCase()} for <span>${yds(activePlay.proposal.appliedGain)}</span>`,
    `${read}: ${defenseCall.label} vs ${call.label}.`,
  );
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
    ...learningEventPlayScope(),
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
  state.pendingResolution = makePendingResolution(result);
  btn.classList.add('correct');
  disableAnswers();
  state.phase = 'feedback';
  hideContinueButton();
  const special = state.activePlay.playType !== 'scrimmage';
  const msg = special
    ? state.possession === 'defense'
      ? 'Correct. Your defense denies the opponent’s best special-teams result.'
      : state.questionUi.attempt > 1 ? 'Great retry. Your special-teams play succeeds.' : 'Correct. Run the special-teams play!'
    : state.possession === 'defense'
      ? outcomeMessage(PLAY_OUTCOME_COPY.defenseStop, state.opponentCallKey)
      : state.questionUi.attempt > 1
        ? state.pendingResolution.assist?.reductionApplied
          ? `Great retry. The assisted play counts for ${yds(state.pendingResolution.assist.creditedGain)}.`
          : 'Great retry. The play counts!'
        : 'Correct. Run the play!';
  state.outcomeMessage = msg;
  applyDeskHeader(special
    ? (state.possession === 'offense' ? 'specialResultOffense' : 'specialResultDefense')
    : (state.possession === 'offense' ? 'resultOffense' : 'resultDefense'));
  setFeedback(msg, 'positive');
  commitPendingResolution();
}

function handleInstructionalMiss(btn, choice, question) {
  let secondMissPending = null;
  if (state.questionUi.attempt !== 1) {
    secondMissPending = makePendingResolution('secondMiss');
    state.questionUi.reviewSatisfied = false;
    state.questionUi.reviewGateState = 'pending';
  }
  if (state.questionUi.attempt !== 1 && !secondMissPending) {
    const error = new Error('A terminal instructional miss requires one validated pending resolution.');
    error.code = 'missing-second-miss-resolution';
    throw error;
  }

  btn.classList.add('wrong');
  btn.disabled = true;
  state.questionUi.missedChoiceIds.push(choice.id);

  if (state.questionUi.attempt === 1) {
    state.questionUi.attempt = 2;
    state.questionUi.support = FOOTBALL_LEARNING.nextSupport(state.questionUi.support);
    syncQuestionMirrors();
    renderMathVisual();
    applyDeskHeader(state.activePlay.playType === 'scrimmage'
      ? (state.possession === 'offense' ? 'retryOffense' : 'retryDefense')
      : (state.possession === 'offense' ? 'specialRetryOffense' : 'specialRetryDefense'));
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
  state.pendingResolution = secondMissPending;
  disableAnswers();
  syncQuestionMirrors();
  syncUiState();
  renderMathVisual();
  applyDeskHeader(state.activePlay.playType === 'scrimmage'
    ? (state.possession === 'offense' ? 'explainOffense' : 'explainDefense')
    : (state.possession === 'offense' ? 'specialExplainOffense' : 'specialExplainDefense'));
  setFeedback(question.workedExplanation.text, 'info');
  showWorkedReviewSummary();
}

function recordQuestionResolution(result) {
  if (!state.questionInstance || state.questionUi.resolutionRecorded) return false;
  state.questionUi.resolutionRecorded = true;
  state.gradedQuestions++;
  if (result === 'firstTryCorrect' || result === 'retryCorrect') state.correctAnswers++;
  syncQuestionMirrors();
  FOOTBALL_LEARNING.recordResolved(learningSession, state.questionInstance, result, {
    ...learningEventPlayScope(),
    support: state.questionUi.support,
  });
  FOOTBALL_STATS.recordResolution(pendingStatsPlay, result);
  return true;
}

function continueAfterExplanation() {
  if (state.phase !== 'explanation' || !state.questionUi.continueRequired || state.questionUi.outcomeCommitted) return;
  if (!state.questionUi.reviewSatisfied) {
    const learn = document.getElementById('question-learn-why');
    if (learn && !learn.disabled && !learn.classList.contains('hidden')) learn.focus({ preventScroll: true });
    return;
  }
  const continueButton = document.getElementById('question-continue');
  const focusNextCall = document.activeElement === continueButton;
  collapseWorkedReview({ restoreFocus: false });
  state.questionUi.continueRequired = false;
  hideContinueButton();
  state.phase = 'feedback';
  syncQuestionMirrors();
  syncUiState();

  if (state.activePlay.playType !== 'scrimmage') {
    const transition = state.pendingResolution.transitionToCommit;
    const message = transition.resultKind === 'conversionMade'
      ? `${state.activePlay.context.attemptType === 'twoPoint' ? 'Two-point try' : 'PAT'} made.`
      : transition.resultKind === 'conversionMissed'
        ? `${state.activePlay.context.attemptType === 'twoPoint' ? 'Two-point try' : 'PAT'} no good.`
        : transition.resultKind === 'fieldGoalMade'
          ? 'Field goal made for three points.'
          : transition.resultKind === 'fieldGoalBlocked'
            ? 'Field goal blocked. The ball changes hands at the original line of scrimmage.'
            : transition.resultKind === 'fieldGoalMissed'
              ? 'Field goal no good. The ball changes hands at the original line of scrimmage.'
              : `The punt puts the receiving team at field marker ${transition.nextStartYardLine}.`;
    state.outcomeMessage = message;
    applyDeskHeader(state.possession === 'offense' ? 'specialResultOffense' : 'specialResultDefense');
    setFeedback(message, 'negative');
  } else if (state.possession === 'offense') {
    const reason = state.pendingResolution.transitionToCommit.resultReason;
    const msg = PLAY_OUTCOME_COPY.secondMiss[reason];
    state.outcomeMessage = msg;
    applyDeskHeader('resultOffense');
    const yards = state.pendingResolution.transitionToCommit.appliedGain;
    const suffix = state.pendingResolution.transitionToCommit.resultKind === 'turnover'
      ? ' Turnover.'
      : yards < 0 ? ` Loss of ${yds(Math.abs(yards))}.` : ' No gain.';
    setFeedback(`${msg}${suffix}`, 'negative');
  } else {
    const cappedGain = state.pendingResolution.transitionToCommit.appliedGain;
    const msg = outcomeMessage(PLAY_OUTCOME_COPY.defenseGain, state.opponentCallKey);
    state.outcomeMessage = msg;
    applyDeskHeader('resultDefense');
    setFeedback(`${msg} The mistake costs only ${yds(cappedGain)}.`, 'negative');
  }
  commitPendingResolution({ focusNextCall });
}

function liveStateMatchesPlay(activePlay) {
  const context = activePlay.context;
  if (state.gameId !== activePlay.gameId || state.possessionId !== activePlay.possessionId
    || state.possession !== context.possession || state.direction !== context.direction
    || state.quarter !== context.quarter || state.playerScore !== context.scores.player
    || state.opponentScore !== context.scores.opponent || JSON.stringify(state.match) !== JSON.stringify(context.match)) return false;
  if (activePlay.playType === 'conversion') return true;
  if (state.yd !== context.yardLine) return false;
  if (activePlay.playType !== 'scrimmage') return true;
  return state.down === context.down
    && state.ytg === context.yardsToGo
    && state.fdYd === context.firstDownLine
    && state.driveStart === context.driveStart
    && state.playerTotalYards === context.totalYards.player
    && state.opponentTotalYards === context.totalYards.opponent
    && state.plays === context.plays
    && state.drivePlays === context.drivePlays;
}

function liveStateMatchesSnap(snap) {
  const activePlay = state.activePlay?.playType === 'scrimmage'
    ? state.activePlay
    : FOOTBALL_DOMAIN.createActivePlay({
        schemaVersion: 1,
        playType: 'scrimmage',
        gameId: state.gameId,
        possessionId: state.possessionId,
        playId: 'compatibility-live-check',
        contextId: snap.contextId,
        context: snap.context,
        proposal: snap.proposal,
        call: snap.call,
      });
  return liveStateMatchesPlay(activePlay);
}

function applyCanonicalTransition(activePlay, transition) {
  if (activePlay.playType === 'scrimmage') {
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
    if (transition.resultKind === 'touchdown') {
      if (activePlay.context.possession === 'offense') {
        state.tds++;
        state.playerScore += TD_POINTS;
      } else {
        state.opponentTds++;
        state.opponentScore += TD_POINTS;
      }
    }
  } else if (activePlay.playType === 'punt') {
    state.yd = transition.landingYardLine;
    state.animYd = transition.landingYardLine;
  } else if (transition.points > 0) {
    if (activePlay.context.possession === 'offense') state.playerScore += transition.points;
    else state.opponentScore += transition.points;
  }
}

function outcomeForTransition(activePlay, transition, policy) {
  if (activePlay.playType === 'punt') return transition.resultKind === 'puntTouchback' ? 'puntTouchback' : 'puntLanded';
  if (activePlay.playType === 'conversion') {
    return transition.resultKind === 'conversionMissed'
      && activePlay.context.possession === 'defense'
      && (policy === 'firstTryCorrect' || policy === 'retryCorrect')
      ? 'conversionDenied'
      : transition.resultKind;
  }
  if (activePlay.playType === 'fieldGoal') return transition.resultKind;
  if (transition.resultKind === 'touchdown') return 'touchdown';
  if (transition.resultKind === 'firstDown') return 'firstDown';
  if (transition.resultKind === 'turnoverOnDowns') return 'turnoverOnDowns';
  if (transition.resultKind === 'turnover') return 'turnover';
  if (state.possession === 'defense' && transition.appliedGain === 0 && policy !== 'questionBypass') return 'stop';
  return transition.appliedGain > 0 ? 'gain' : transition.appliedGain < 0 ? 'loss' : 'noGain';
}

function terminalPlacement(activePlay, transition, policy) {
  if (activePlay.playType !== 'scrimmage') return {
    nextPossession: transition.nextPossession,
    nextStartYardLine: transition.nextStartYardLine,
    restartReason: transition.restartReason,
  };
  const snap = FOOTBALL_DOMAIN.activeSnapFromPlay(activePlay);
  return FOOTBALL_DOMAIN.terminalPlacementForScrimmage(
    snap,
    transition,
    scrimmageResolutionValidationOptions(snap, policy),
  );
}

function finalizePossessionState(possessionId, placement) {
  if (!possessionId || !placement || (state.finalizedPossessionIds || []).includes(possessionId)) return false;
  state.finalizedPossessionIds = [...(state.finalizedPossessionIds || []), possessionId];
  state.quarterPossessions++;
  const periodComplete = state.quarterPossessions >= POSSESSIONS_PER_QUARTER;
  const finalPossession = state.quarter >= 4 && periodComplete;
  const halftimePossession = state.quarter === 2 && periodComplete;
  state.pendingNextPossession = finalPossession ? null
    : halftimePossession ? 'defense' : placement.nextPossession;
  state.pendingNextStartYardLine = finalPossession ? null
    : halftimePossession ? 80 : placement.nextStartYardLine;
  state.pendingRestartReason = finalPossession ? null
    : halftimePossession ? 'halftimeKickoff' : placement.restartReason;
  return true;
}

function routePossessionPresentation(message) {
  if (state.quarterPossessions >= POSSESSIONS_PER_QUARTER) {
    if (state.quarter >= 4) {
      showGameOver();
      return;
    }
    if (state.quarter === 2) {
      showHalftime(message);
      return;
    }
    showQuarterEnd(message);
    return;
  }
  if (state.pendingNextPossession === 'offense') showOffenseTransition(message);
  else showDefenseTransition(message);
}

function specialResultMessage(activePlay, transition) {
  if (activePlay.playType === 'punt') {
    return transition.resultKind === 'puntTouchback'
      ? 'The punt reaches the end zone. Touchback: the receiving team starts at its own 20.'
      : `The punt ends at field marker ${transition.nextStartYardLine}.`;
  }
  if (activePlay.playType === 'fieldGoal') {
    if (transition.resultKind === 'fieldGoalMade') return 'Field goal made. Three points.';
    if (transition.resultKind === 'fieldGoalBlocked') return 'Field goal blocked. The ball changes hands at the original line of scrimmage.';
    return 'Field goal no good. The ball changes hands at the original line of scrimmage.';
  }
  const name = activePlay.context.attemptType === 'twoPoint' ? 'Two-point try' : 'PAT';
  return transition.resultKind === 'conversionMade'
    ? `${name} made for ${transition.points} ${transition.points === 1 ? 'point' : 'points'}.`
    : `${name} no good.`;
}

function applyCommittedOutcomeBookkeeping(activePlay, outcome) {
  if (activePlay.playType !== 'scrimmage') return;
  const offense = activePlay.context.possession === 'offense';
  if (outcome === 'turnoverOnDowns' && !offense) state.defenseStops++;
  if (outcome === 'firstDown' && offense) state.firstDowns++;
}

function finishCommittedTransition(activePlay, transition, policy, outcome, { focusNextCall = false } = {}) {
  const offense = activePlay.context.possession === 'offense';
  if (activePlay.playType !== 'scrimmage') {
    const message = specialResultMessage(activePlay, transition);
    const playerSucceeded = policy === 'firstTryCorrect' || policy === 'retryCorrect';
    state.outcomeMessage = message;
    setFeedback(message, playerSucceeded ? 'positive' : policy === 'questionBypass' ? 'info' : 'negative');
    if (playerSucceeded) playCorrect();
    if (activePlay.playType === 'punt') showFieldFloat(transition.resultKind === 'puntTouchback' ? 'TOUCHBACK' : 'PUNT');
    else if (transition.points > 0) showFieldFloat(`+${transition.points} PTS`, offense ? 'first-down' : 'negative');
    else showFieldFloat(activePlay.playType === 'fieldGoal' ? 'NO GOOD' : 'TRY FAILED', 'negative');
    advTimer = setTimeout(() => routePossessionPresentation(message), 1400);
    return;
  }

  const gain = transition.appliedGain;
  if (outcome === 'turnover') showFieldFloat(transition.resultReason === 'fumble' ? 'FUMBLE!' : 'INTERCEPTED!', 'negative');
  else if (offense && gain > 0) startPlayerRun(transition.resultKind === 'touchdown' || transition.resultKind === 'firstDown' || gain >= 8);
  else if (!offense && gain === 0) { showFieldFloat('STOPPED', 'negative'); flashDefenseStop(); }
  else if (gain > 0) showFieldFloat(`+${gain} YDS`);
  else if (gain < 0) showFieldFloat(`${gain} YDS`, 'negative');
  else showFieldFloat('NO GAIN', 'negative');

  if (outcome === 'touchdown') {
    setFeedback(offense ? 'Touchdown! Six points. Choose the conversion next.' : `${state.match.opponent.shortName} touchdown. Six points; the conversion is next.`, offense ? 'positive' : 'negative');
    advTimer = setTimeout(() => showTD(offense ? 'offense' : 'defense'), 900);
    return;
  }
  if (outcome === 'turnoverOnDowns') {
    setFeedback('Turnover on downs.', offense ? 'negative' : 'positive');
    if (!offense && (policy === 'firstTryCorrect' || policy === 'retryCorrect')) playCorrect();
    advTimer = setTimeout(() => routePossessionPresentation(
      offense ? 'Turnover on downs. Time to play defense!' : `${state.outcomeMessage || 'Your defense held!'} Turnover on downs!`
    ), offense ? 1400 : 1500);
    return;
  }
  if (outcome === 'turnover') {
    setFeedback(state.outcomeMessage || 'Turnover.', offense ? 'negative' : 'positive');
    advTimer = setTimeout(() => routePossessionPresentation(
      offense ? `${state.outcomeMessage || 'Turnover.'} Time to play defense!` : 'Takeaway! Time to play offense!'
    ), 1500);
    return;
  }
  if (outcome === 'firstDown') {
    if (offense) {
      showFieldFloat('FIRST DOWN!', 'first-down');
      flashFdLine();
      setFeedback('First down!', 'positive');
      playFirstDown();
      clearTimeout(playerCelebrateDelayTimer);
      playerCelebrateDelayTimer = setTimeout(startPlayerCelebrate, 700);
    }
    advTimer = setTimeout(() => showCallPrompt({ focusFirstCall: focusNextCall }), offense ? 1400 : 1600);
    return;
  }
  if (outcome === 'stop') playCorrect();
  if (offense && policy !== 'secondMiss' && policy !== 'questionBypass') { setFeedback('Correct.', 'positive'); playCorrect(); }
  advTimer = setTimeout(
    () => showCallPrompt({ focusFirstCall: focusNextCall }),
    policy === 'secondMiss' ? 1800 : offense ? 1400 : 1500,
  );
}

function handleInvalidCommittedPlay(error, activePlay) {
  if (!error || typeof error !== 'object') error = new Error(String(error || 'The committed play was invalid.'));
  error.familyId = error.familyId ?? state.questionInstance?.familyId ?? null;
  error.playId = error.playId ?? activePlay.playId;
  error.contextId = error.contextId ?? activePlay.contextId;
  error.questionInstanceId = error.questionInstanceId
    ?? state.questionInstance?.questionInstanceId
    ?? null;
  if (activePlay.playType === 'scrimmage') {
    handleInvalidSnap(error, activePlayOpponentSnapshot(activePlay));
    return;
  }
  if (!error.recoverySpec) error.activePlay = activePlay;
  handleInvalidSpecialPlay(error,
    activePlay.playType === 'conversion' ? 'conversion-decision' : 'fourth-down-decision',
    activePlay.playType === 'conversion' ? activePlay.context.attemptType : activePlay.playType,
    state.opponentDecisionSnapshot);
}

function settleSeasonGameOnce() {
  if (!activeSeasonBinding || seasonSettlementPromise) return seasonSettlementPromise;
  const bindingMatches = activeSeasonBinding.gameId === state.gameId
    && activeSeasonBinding.rivalId === state.match.opponent.id;
  if (!bindingMatches) {
    reportFootballDiagnostic('season-binding-mismatch', {
      message: 'The season game binding no longer matches the completed public match.',
      gameNumber: activeSeasonBinding.gameNumber,
    });
    return null;
  }
  const finalScores = FOOTBALL_DOMAIN.deepFreeze({
    playerScore: state.playerScore,
    opponentScore: state.opponentScore,
  });
  seasonSettlementPromise = FOOTBALL_SEASON.settleGame(activeSeasonBinding, finalScores)
    .then(result => {
      if (state.phase === 'final') renderEndSeason();
      return result;
    }, () => {
      if (state.phase === 'final') renderEndSeason();
      return { status: 'pending' };
    });
  return seasonSettlementPromise;
}

function commitPendingResolution({ focusNextCall = false } = {}) {
  const pending = state.pendingResolution;
  const activePlay = state.activePlay;
  if (!pending || !activePlay || state.questionUi.outcomeCommitted
    || (state.committedPlayIds || []).includes(activePlay.playId)) return false;
  const identityMatches = pending.gameId === activePlay.gameId
    && pending.possessionId === activePlay.possessionId
    && pending.playId === activePlay.playId
    && pending.playType === activePlay.playType
    && pending.contextId === activePlay.contextId;
  if (!identityMatches) {
    handleInvalidCommittedPlay(Object.assign(new Error('Live football state no longer matches the frozen play.'), {
      code: 'invalid-context',
      recoverySpec: specialRecoverySpec(activePlay, { preserveIdentity: false }),
    }), activePlay);
    return false;
  }
  if (!liveStateMatchesPlay(activePlay)) {
    handleInvalidCommittedPlay(Object.assign(new Error('Live football state no longer matches the frozen play.'), {
      code: 'invalid-context',
      recoverySpec: specialRecoverySpec(activePlay, { preserveIdentity: false }),
    }), activePlay);
    return false;
  }
  let validation;
  try {
    validation = validateResolutionTransition(activePlay, pending.policy, pending.transitionToCommit);
  } catch (error) {
    handleInvalidCommittedPlay(error, activePlay);
    return false;
  }
  if (!validation.ok) {
    handleInvalidCommittedPlay(Object.assign(new Error('The frozen resolution is not a valid football transition.'), {
      code: 'invalid-projection',
      diagnostics: validation.diagnostics,
    }), activePlay);
    return false;
  }

  applyCanonicalTransition(activePlay, validation.value);
  state.committedPlayIds = [...(state.committedPlayIds || []), activePlay.playId];
  state.questionUi.outcomeCommitted = true;
  const placement = terminalPlacement(activePlay, validation.value, pending.policy);
  const possessionFinalized = placement
    ? finalizePossessionState(activePlay.possessionId, placement)
    : false;
  const outcome = outcomeForTransition(activePlay, validation.value, pending.policy);
  applyCommittedOutcomeBookkeeping(activePlay, outcome);
  if (pending.policy !== 'questionBypass') recordQuestionResolution(pending.policy);
  syncQuestionMirrors();
  finalizeStatsPlay(activePlay, validation.value, outcome);
  const settledPlacement = placement && state.pendingNextPossession
    ? FOOTBALL_DOMAIN.deepFreeze({
        nextPossession: state.pendingNextPossession,
        nextStartYardLine: state.pendingNextStartYardLine,
        restartReason: state.pendingRestartReason,
      })
    : null;
  dispatchFootballEvent('football:result', {
    schemaVersion: 2,
    gameId: activePlay.gameId,
    possessionId: activePlay.possessionId,
    playId: activePlay.playId,
    playType: activePlay.playType,
    familyId: pending.familyId ?? state.questionInstance?.familyId ?? null,
    contextId: activePlay.contextId,
    questionInstanceId: pending.questionInstanceId ?? state.questionInstance?.questionInstanceId ?? null,
    possession: activePlay.context.possession,
    policy: pending.policy,
    outcome,
    transition: validation.value,
    placement: settledPlacement,
    assist: pending.assist || null,
  });
  if (possessionFinalized
    && state.quarter >= 4
    && state.quarterPossessions >= POSSESSIONS_PER_QUARTER) {
    settleSeasonGameOnce();
  }
  if (activePlay.playType === 'scrimmage' || activePlay.playType === 'punt') updateField(true);
  updateStatus();
  syncUiState();
  finishCommittedTransition(activePlay, validation.value, pending.policy, outcome, { focusNextCall });
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

// Duke stays visually stable; opponent scoring draws from the selected public
// rival palette without changing the number or timing of visual-only bursts.
const FW_PALETTES = {
  offense: ['#ffd337', '#003087', '#7bafd4', '#ffffff'],
};

function fireworkPalette(side) {
  return side === 'defense'
    ? rivalForMatch(state.match).presentation.fireworks
    : FW_PALETTES.offense;
}

function spawnFireworks(containerId, side = 'offense') {
  if (reducedMotionPreferred()) return;
  const container = document.getElementById(containerId);
  if (!container) return;
  const colors = fireworkPalette(side);
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
  const focusable = Array.from(overlay.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => element.getClientRects().length > 0);
  const namedRadioTargets = new Map();
  for (const element of focusable) {
    if (element.tagName !== 'INPUT' || element.type !== 'radio' || !element.name) continue;
    const formOwner = element.form || overlay;
    if (!namedRadioTargets.has(formOwner)) namedRadioTargets.set(formOwner, new Map());
    const groups = namedRadioTargets.get(formOwner);
    if (!groups.has(element.name) || element.checked) groups.set(element.name, element);
  }
  return focusable.filter((element) => {
    if (element.tagName !== 'INPUT' || element.type !== 'radio' || !element.name) return true;
    return namedRadioTargets.get(element.form || overlay).get(element.name) === element;
  });
}

function focusActiveOverlay(overlay) {
  requestAnimationFrame(() => {
    if (!overlay.classList.contains('show')) return;
    const quickPanel = document.getElementById('quick-game-panel');
    const startChoice = overlay.id !== 'ov-start' ? null
      : selectedPlayMode === 'quick' && !quickPanel?.hidden
        ? overlay.querySelector('input[name="rival"]:checked')
        : overlay.querySelector('input[name="play-mode"]:checked');
    const target = startChoice || overlay.querySelector('.ov-btn:not([disabled])') || overlayFocusableElements(overlay)[0] || overlay;
    if (target === overlay && !overlay.hasAttribute('tabindex')) overlay.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

function focusGameplayControl() {
  requestAnimationFrame(() => {
    if (document.querySelector('.overlay.show')) return;
    const selectors = ['#decision-grid .decision-btn', '#call-grid .call-btn', '#btn-row .ans-btn', '#mute-toggle'];
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
  if (event.key === 'Escape' && state.phase === 'explanation' && state.questionUi?.reviewExpanded) {
    event.preventDefault();
    collapseWorkedReview();
    return;
  }
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
  state.phase = 'start';
  renderStartMode();
  activateOverlay('ov-start');
  if (selectedPlayMode === 'quick') updateRivalPreview(state.match);
  document.getElementById('play-label').textContent = 'Get ready…';
  document.getElementById('question').textContent = '';
  applyDeskHeader('start');
  setFeedback('');
  hideAnswerButtons();
  hideCallGrid();
  syncUiState();
}

function startQuickGame() {
  clearTimeout(advTimer);
  if (sessionInitialized) return false;
  const match = FOOTBALL_OPPONENT.createMatch(selectedRivalId);
  activeSeasonBinding = null;
  seasonSettlementPromise = null;
  initGameSession();
  state = createGameState(match);
  applyMatchPresentation(match);
  hideOverlays();
  startDrive('offense');
  return true;
}

async function startSeasonGame() {
  clearTimeout(advTimer);
  if (sessionInitialized || seasonActionBusy) return false;
  seasonActionBusy = true;
  renderStartMode();
  let snapshot = FOOTBALL_SEASON.snapshot();
  const requestedAction = snapshot.action;
  try {
    if (snapshot.action === 'start') await FOOTBALL_SEASON.startSeason();
    else if (snapshot.action === 'fresh') await FOOTBALL_SEASON.startFreshSeason();
    else if (snapshot.action === 'new') await FOOTBALL_SEASON.startNewSeason();
    else if (snapshot.action === 'retry') await FOOTBALL_SEASON.retryPending();
    snapshot = FOOTBALL_SEASON.snapshot();
    if (requestedAction === 'retry') return false;
    if (sessionInitialized || selectedPlayMode !== 'season') return false;
    if (snapshot.status !== 'active' || snapshot.saveState === 'pending' || !snapshot.nextRivalId) return false;

    const match = FOOTBALL_OPPONENT.createMatch(snapshot.nextRivalId);
    initGameSession();
    const binding = FOOTBALL_SEASON.bindNextGame(statsSession.gameId);
    if (!binding || binding.rivalId !== match.opponent.id) {
      clearGameSessionInitialization();
      return false;
    }
    activeSeasonBinding = binding;
    seasonSettlementPromise = null;
    state = createGameState(match);
    applyMatchPresentation(match);
    hideOverlays();
    startDrive('offense');
    return true;
  } finally {
    seasonActionBusy = false;
    if (state.phase === 'start') renderStartMode();
  }
}

function startGame() {
  return selectedPlayMode === 'season' ? startSeasonGame() : startQuickGame();
}

function showTD(side = 'offense') {
  const button = document.getElementById('ov-td-btn');
  const overlay = document.getElementById('ov-td');
  const badge = document.getElementById('ov-td-badge');
  const title = document.getElementById('ov-td-title');
  Object.assign(state, blankPlayState(), { phase: 'touchdown', touchdownSide: side });
  syncUiState();
  if (overlay) overlay.dataset.side = side;
  if (badge) badge.textContent = side === 'defense' ? `${state.match.opponent.shortName} TD` : 'TOUCHDOWN';
  if (title) title.textContent = side === 'defense' ? `${state.match.opponent.shortName} Scores` : 'Touchdown!';
  document.getElementById('ov-td-sub').textContent = side === 'defense'
    ? `Score: ${state.playerScore} - ${state.opponentScore}. ${state.match.opponent.shortName} has ${state.opponentTds} TD${state.opponentTds === 1 ? '' : 's'} — get it back!`
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
  const expectedSide = state.possession === 'defense' ? 'defense' : 'offense';
  if (state.phase !== 'touchdown' || state.touchdownSide !== expectedSide) return false;
  hideOverlays();
  showConversionDecision();
  return true;
}

function conversionDecisionState() {
  return {
    possession: state.possession,
    direction: state.direction,
    quarter: state.quarter,
    quarterPossessions: state.quarterPossessions,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    scores: { player: state.playerScore, opponent: state.opponentScore },
  };
}

function showConversionDecision(recovery = null, decision = null) {
  clearTimeout(advTimer);
  hideOverlays();
  const recoveryAction = recovery?.context?.attemptType || recovery?.attemptType || null;
  Object.assign(state, blankPlayState(), {
    phase: 'conversion-decision',
    opponentDecisionSnapshot: decision,
    publicSpecialAction: state.possession === 'defense' ? recoveryAction : null,
    specialRecoveryPlay: recovery,
  });
  updateStatus();
  document.getElementById('play-label').textContent = 'Conversion Try';
  if (state.possession === 'offense') {
    const actions = recoveryAction ? [{
      key: recoveryAction,
      eyebrow: 'Same try',
      label: recoveryAction === 'twoPoint' ? 'Retry Two-Point Try' : 'Retry PAT',
      desc: 'The same conversion choice is waiting.',
    }] : [
      { key: 'pat', eyebrow: 'Kick for one', label: 'PAT', desc: 'A made kick adds one point.' },
      { key: 'twoPoint', eyebrow: 'Go for two', label: 'Two-Point Try', desc: 'A successful try adds two points.' },
    ];
    if (recoveryAction) {
      const retryName = recoveryAction === 'twoPoint' ? 'two-point try' : 'PAT';
      document.getElementById('question').textContent = `Retry the same ${retryName}.`;
      setDeskHeader('Try', 'Retry the same conversion.', `Retry the same ${retryName}.`);
    } else {
      document.getElementById('question').textContent = 'Choose one point or two points.';
      applyDeskHeader('conversionOffense');
    }
    renderDecisionGrid(
      actions,
      selectConversionAction,
      recoveryAction ? 'Retry the same conversion attempt' : 'Choose a conversion attempt',
    );
    setFeedback(recoveryAction
      ? 'That try could not be checked. Try the same conversion again.'
      : 'The touchdown awarded six points. The conversion is a separate play.', 'info');
    announceSpecialAction(recoveryAction
      ? 'The same conversion choice is waiting for another try.'
      : 'Touchdown: six points. Choose the separate conversion.');
    syncUiState();
    return;
  }

  const frozenDecision = decision || taggedOpponentDecision(FOOTBALL_OPPONENT.decideConversion(conversionDecisionState()));
  state.opponentDecisionSnapshot = frozenDecision;
  state.publicSpecialAction = frozenDecision.action;
  document.getElementById('question').textContent = `${state.match.opponent.shortName} announces its conversion.`;
  if (recoveryAction) {
    const retryName = recoveryAction === 'twoPoint' ? 'two-point try' : 'PAT';
    document.getElementById('question').textContent = `Retry the same opponent ${retryName}.`;
    setDeskHeader('Try', 'Retry the opponent conversion.', `Retry the same ${retryName}.`);
    renderDecisionGrid([{
      key: recoveryAction,
      eyebrow: 'Same try',
      label: recoveryAction === 'twoPoint' ? 'Retry Two-Point Try' : 'Retry PAT',
      desc: "The opponent's conversion choice stays the same.",
    }], retryOpponentConversionAction, 'Retry the same opponent conversion');
    setFeedback('That try could not be checked. The same opponent conversion is waiting.', 'info');
    announceSpecialAction(opponentSpecialActionLabel(frozenDecision.action));
    syncUiState();
    return;
  }
  applyDeskHeader('conversionDefense');
  let activePlay;
  try {
    activePlay = buildSpecialPlay(frozenDecision.action, recovery);
  } catch (error) {
    handleInvalidSpecialPlay(error, 'conversion-decision', frozenDecision.action, frozenDecision);
    return;
  }
  startSpecialPlay(activePlay, opponentSpecialActionLabel(frozenDecision.action));
}

function selectConversionAction(action) {
  if (state.phase !== 'conversion-decision' || state.possession !== 'offense'
    || !['pat', 'twoPoint'].includes(action)) return false;
  const recoveryAction = state.specialRecoveryPlay?.context?.attemptType
    || state.specialRecoveryPlay?.attemptType;
  if (recoveryAction && action !== recoveryAction) return false;
  let activePlay;
  try {
    activePlay = buildSpecialPlay(action, state.specialRecoveryPlay);
  } catch (error) {
    handleInvalidSpecialPlay(error, 'conversion-decision', action);
    return false;
  }
  startSpecialPlay(activePlay, action === 'twoPoint' ? 'You choose a two-point try.' : 'You choose a PAT.');
  return true;
}

function showDefenseTransition(message) {
  clearTimeout(advTimer);
  Object.assign(state, blankPlayState(), { phase: 'transition' });
  syncUiState();
  document.getElementById('ov-defense-title').textContent = `${state.match.opponent.shortName}'s Ball`;
  document.getElementById('ov-defense-sub').textContent =
    `${message} Score: ${state.playerScore} - ${state.opponentScore}`;
  activateOverlay('ov-defense');
}

function startDefense() {
  if (state.phase !== 'transition'
    || (state.pendingNextPossession && state.pendingNextPossession !== 'defense')) return false;
  hideOverlays();
  startDrive('defense');
  return true;
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
  if (state.phase !== 'transition'
    || (state.pendingNextPossession && state.pendingNextPossession !== 'offense')) return false;
  hideOverlays();
  startDrive('offense');
  return true;
}

// Release-matrix setup retains this legacy seam. Production terminal plays go
// through commitPendingResolution() and guarded finalizePossessionState().
function finishPossession(message) {
  const nextPossession = state.pendingNextPossession || oppositePossession(state.possession);
  const placement = {
    nextPossession,
    nextStartYardLine: Number.isInteger(state.pendingNextStartYardLine)
      ? state.pendingNextStartYardLine
      : startingYardFor(nextPossession),
    restartReason: state.pendingRestartReason || 'legacyScheduledChange',
  };
  finalizePossessionState(state.possessionId, placement);
  routePossessionPresentation(message);
}

// Fill a break overlay's broadcast scorebug (decorative; sub text keeps the
// full score/next-possession sentence for screen readers).
function setBreakScorebug(overlayId, nextLabel) {
  const bug = document.getElementById(overlayId + '-scorebug');
  if (!bug) return;
  bug.innerHTML =
    `<span class="ov-sb-team">${state.match.player.shortName}</span>` +
    `<span class="ov-sb-pts">${state.playerScore}</span>` +
    `<span class="ov-sb-dash">–</span>` +
    `<span class="ov-sb-pts">${state.opponentScore}</span>` +
    `<span class="ov-sb-team">${state.match.opponent.shortName}</span>` +
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
  if (!['quarter', 'halftime'].includes(state.phase) || state.quarter >= 4) return false;
  const endingQuarter = state.quarter;
  const fallbackPossession = endingQuarter >= 2 ? 'defense' : 'offense';
  const nextPossession = state.pendingNextPossession || fallbackPossession;
  hideOverlays();
  state.quarter = Math.min(state.quarter + 1, 4);
  state.quarterPossessions = 0;
  startDrive(nextPossession, state.pendingNextStartYardLine, state.pendingRestartReason);
  return true;
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
  const byConcept = learningSession?.byConcept || {};
  const candidatesFor = (evidenceClass) => Object.entries(byConcept)
    .flatMap(([concept, classes]) => {
      const mastery = classes?.[evidenceClass];
      if (!mastery || mastery.resolved <= 0) return [];
      return [{
        concept,
        evidenceClass,
        label: COACH_CONCEPT_LABELS[concept] || 'Football math',
        ...mastery,
      }];
    });
  const independent = candidatesFor('independent');
  const literacy = candidatesFor('literacy');

  if (!independent.length && !literacy.length) {
    return [{ label: 'Learning today', value: 'Keep playing to build your learning recap' }];
  }

  const firstTryStrength = (item) => item.firstTryCorrect / item.resolved;
  const supportNeed = (item) => (item.retryCorrect + item.secondMiss) / item.resolved;
  const stableConceptOrder = (a, b) =>
    a.label.localeCompare(b.label) || a.concept.localeCompare(b.concept);
  const strongest = independent
    .filter((item) => item.firstTryCorrect > 0)
    .sort((a, b) => firstTryStrength(b) - firstTryStrength(a)
      || b.firstTryCorrect - a.firstTryCorrect
      || b.resolved - a.resolved
      || stableConceptOrder(a, b))[0];
  const independentNeed = independent
    .filter((item) => item.retryCorrect + item.secondMiss > 0)
    .sort((a, b) => supportNeed(b) - supportNeed(a) || b.secondMiss - a.secondMiss || stableConceptOrder(a, b));
  const literacyRead = literacy
    .filter((item) => item.firstTryCorrect > 0)
    .sort((a, b) => b.firstTryCorrect / b.resolved - a.firstTryCorrect / a.resolved
      || b.firstTryCorrect - a.firstTryCorrect
      || b.resolved - a.resolved
      || stableConceptOrder(a, b));
  const literacyNeed = literacy
    .filter((item) => item.retryCorrect + item.secondMiss > 0)
    .sort((a, b) => supportNeed(b) - supportNeed(a) || b.secondMiss - a.secondMiss || stableConceptOrder(a, b));
  const rows = [];
  const usedConcepts = new Set();
  const add = (label, item) => {
    if (!item || usedConcepts.has(item.concept) || rows.length >= 2) return false;
    rows.push({ label, value: item.label });
    usedConcepts.add(item.concept);
    return true;
  };

  add('Strong today', strongest);
  add(rows.length ? 'Practice next' : 'Building today', independentNeed.find(item => !usedConcepts.has(item.concept)));
  add('Read today', literacyRead.find(item => !usedConcepts.has(item.concept)));
  add(rows.length ? 'Practice next' : 'Building today', literacyNeed.find(item => !usedConcepts.has(item.concept)));
  if (rows.length < 2) {
    rows.push({
      label: 'Coach says',
      value: rows[0]?.label === 'Read today'
        ? 'Keep reading the game'
        : rows[0]?.label === 'Building today'
          ? 'Great job using support and trying again'
          : 'Keep building on that great work',
    });
  }
  return rows.slice(0, 2);
}

function renderEndSeason() {
  const container = document.getElementById('ov-end-season');
  const primary = document.getElementById('ov-end-btn');
  const quick = document.getElementById('ov-end-quick-btn');
  const overlay = document.getElementById('ov-end');
  if (!container || !primary || !quick) return;
  if (!activeSeasonBinding) {
    if (overlay) overlay.classList.remove('season-save-pending');
    container.hidden = true;
    container.textContent = '';
    primary.textContent = 'Play Again!';
    primary.disabled = false;
    quick.hidden = true;
    quick.disabled = false;
    return;
  }

  const snapshot = FOOTBALL_SEASON.snapshot();
  const pendingResult = snapshot.saveState === 'pending' && FOOTBALL_SEASON.pendingKind() === 'result';
  if (overlay) overlay.classList.toggle('season-save-pending', pendingResult);
  container.hidden = false;
  quick.hidden = true;
  primary.disabled = seasonEndActionBusy;
  quick.disabled = seasonEndActionBusy;
  if (pendingResult) {
    container.textContent = `Season game ${activeSeasonBinding.gameNumber} is final. ${seasonStatusText(snapshot)}`;
    primary.textContent = seasonEndActionBusy ? 'Saving…' : 'Retry Saving';
    quick.hidden = false;
    return;
  }
  const exactSavedResult = FOOTBALL_SEASON.hasExactSavedResult(activeSeasonBinding, {
    playerScore: state.playerScore,
    opponentScore: state.opponentScore,
  });
  if (snapshot.saveState === 'conflict') {
    container.textContent = `${seasonStatusText(snapshot)} ${seasonRecordText(snapshot.record)}.`;
  } else if (!exactSavedResult) {
    container.textContent = 'This game’s Season result could not be confirmed. This device’s saved Season is unchanged by this game.';
  } else if (snapshot.complete) {
    container.textContent = `Season complete: ${seasonRecordText(snapshot.record)}.`;
  } else {
    const nextRival = snapshot.nextRivalId
      ? FOOTBALL_OPPONENT.resolveRival(snapshot.nextRivalId).displayName
      : 'the next rival';
    container.textContent = `Game ${activeSeasonBinding.gameNumber} saved. ${seasonRecordText(snapshot.record)}. Next: ${nextRival}.`;
  }
  primary.textContent = 'Continue Season';
}

async function handleEndPrimaryAction() {
  if (seasonEndActionBusy) return false;
  seasonEndActionBusy = true;
  renderEndSeason();
  try {
    if (activeSeasonBinding && FOOTBALL_SEASON.pendingKind() === 'result') {
      await FOOTBALL_SEASON.retryPending();
      if (state.phase === 'final') renderEndSeason();
      if (FOOTBALL_SEASON.pendingKind() === 'result') return false;
    }
    restart(activeSeasonBinding ? 'season' : null);
    return true;
  } finally {
    seasonEndActionBusy = false;
    if (state.phase === 'final') renderEndSeason();
  }
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

  Object.assign(state, blankPlayState(), {
    pendingNextPossession: null,
    pendingNextStartYardLine: null,
    pendingRestartReason: null,
    phase: 'final',
  });
  syncUiState();
  const endOv = document.getElementById('ov-end');
  endOv.classList.remove('ov-win', 'ov-loss', 'ov-tie');
  endOv.classList.add(resultClass);
  const badge = document.getElementById('ov-end-badge');
  if (badge) badge.textContent = badgeText;
  document.getElementById('ov-end-title').textContent = title;
  const finalScore = document.getElementById('ov-end-score');
  if (finalScore) finalScore.textContent = `${state.playerScore} - ${state.opponentScore}`;
  if (finalScore) finalScore.setAttribute(
    'aria-label',
    `${state.match.player.displayName} ${state.playerScore}, ${state.match.opponent.displayName} ${state.opponentScore}`,
  );
  document.getElementById('ov-end-sub').textContent =
    `${detail} ${state.match.player.displayName} vs ${state.match.opponent.displayName}. Player TDs: ${state.tds}.`;
  populateEndStats();
  renderEndSeason();
  clearConfetti('ov-end-confetti');
  activateOverlay('ov-end');
  if (diff > 0) {
    spawnConfetti('ov-end-confetti', 40);
    spawnFireworks('ov-end-confetti', 'offense');
  }
}

function restart(preferredMode = null) {
  const rematchRivalId = state.match.opponent.id;
  const returningFromSeason = Boolean(activeSeasonBinding);
  clearConfetti('ov-td-confetti');
  clearConfetti('ov-end-confetti');
  resetPlayerAnimations();
  clearGameSessionInitialization();
  pendingStatsPlay = null;
  selectedRivalId = rematchRivalId;
  selectedPlayMode = preferredMode || (returningFromSeason ? 'season' : 'quick');
  activeSeasonBinding = null;
  seasonSettlementPromise = null;
  state = createGameState(FOOTBALL_OPPONENT.createMatch(selectedRivalId));
  prevPlayerScore = -1;
  prevOpponentScore = -1;
  updateField(false);
  updateStatus();
  showStart();
}

function publicOpponentRead(snapshot) {
  if (!snapshot) return null;
  return {
    opponentId: snapshot.opponentId,
    look: {
      key: snapshot.look.key,
      label: snapshot.look.label,
      alignment: snapshot.look.alignment,
    },
    lean: {
      key: snapshot.lean.key,
      label: snapshot.lean.label,
    },
  };
}

function conversionRenderState() {
  const activeConversion = state.activePlay?.playType === 'conversion'
    ? state.activePlay
    : null;
  if (state.phase !== 'conversion-decision' && !activeConversion) return null;
  const recoveryAttempt = state.specialRecoveryPlay?.context?.attemptType
    || state.specialRecoveryPlay?.attemptType;
  const publicAttempt = ['pat', 'twoPoint'].includes(state.publicSpecialAction)
    ? state.publicSpecialAction
    : null;
  const attemptType = activeConversion?.context?.attemptType
    || recoveryAttempt
    || publicAttempt
    || null;
  const tryYardLine = activeConversion?.context?.tryYardLine
    ?? FOOTBALL_DOMAIN.tryYardLineFor(state.direction);
  return {
    status: activeConversion ? 'active' : 'decision',
    attemptType,
    attemptValue: activeConversion?.context?.attemptValue
      ?? (attemptType === 'pat' ? 1 : attemptType === 'twoPoint' ? 2 : null),
    tryYardLine,
    trySpot: ydLabel(tryYardLine),
  };
}

function publicSeasonDiagnostics() {
  const snapshot = FOOTBALL_SEASON.snapshot();
  return {
    mode: activeSeasonBinding || selectedPlayMode === 'season' ? 'season' : 'quick',
    gameNumber: activeSeasonBinding?.gameNumber ?? snapshot.gameNumber,
    rungStatuses: snapshot.schedule.map(rung => rung.status),
    record: {
      wins: snapshot.record.wins,
      losses: snapshot.record.losses,
      ties: snapshot.record.ties,
    },
    nextRivalId: snapshot.nextRivalId,
    complete: snapshot.complete,
    saveState: snapshot.saveState,
  };
}

function renderGameToText() {
  const learning = learningSession || {
    presented: 0,
    resolved: 0,
    byConcept: {},
    historicalMastery: {},
  };
  const conversion = conversionRenderState();
  return JSON.stringify({
    mode: state.phase,
    playMode: activeSeasonBinding || selectedPlayMode === 'season' ? 'season' : 'quick',
    season: publicSeasonDiagnostics(),
    match: state.match,
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
    down: conversion ? null : state.down,
    ytg: conversion ? null : state.ytg,
    yardLine: conversion ? conversion.trySpot : ydLabel(state.yd),
    absoluteYard: conversion ? conversion.tryYardLine : state.yd,
    firstDownLine: conversion ? null : ydLabel(state.fdYd),
    direction: state.direction,
    conversion,
    plays: state.plays,
    correctAnswers: state.correctAnswers,
    gradedQuestions: state.gradedQuestions,
    quarterPossessions: state.quarterPossessions,
    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,
    pendingNextPossession: state.pendingNextPossession || null,
    pendingNextStartYardLine: Number.isInteger(state.pendingNextStartYardLine) ? state.pendingNextStartYardLine : null,
    pendingRestartReason: state.pendingRestartReason || null,
    restartReason: state.restartReason || null,
    playerTouchdowns: state.tds,
    opponentTouchdowns: state.opponentTds,
    defenseStops: state.defenseStops,
    drivePlays: state.drivePlays,
    call: state.callKey,
    defenseCall: state.defenseCallKey,
    opponentCall: null,
    opponentTendency: publicOpponentRead(state.opponentSelectionSnapshot),
    opponentSnapshot: publicOpponentRead(state.opponentSnapshot),
    defenseRead: document.getElementById('defense-read')?.textContent || null,
    matchup: state.matchup,
    gain: state.g ?? null,
    learningTier: state.questionInstance?.tier || null,
    gameId: state.gameId || null,
    possessionId: state.possessionId || null,
    playId: state.activePlay?.playId || null,
    playType: state.activePlay?.playType || null,
    contextId: state.activePlay?.contextId || null,
    publicSpecialAction: state.publicSpecialAction || null,
    questionInstanceId: state.questionInstance?.questionInstanceId || null,
    questionFamilyId: state.questionInstance?.familyId || null,
    questionId: state.questionInstance?.familyId || null,
    questionSkill: state.questionSkill || null,
    questionConcept: state.questionConcept || null,
    questionPurpose: state.questionPurpose || null,
    questionGrading: state.questionGrading || null,
    questionEvidenceClass: state.questionInstance?.evidenceClass || null,
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
    reviewAvailable: reviewAvailable(),
    reviewExpanded: Boolean(state.questionUi?.reviewExpanded),
    reviewSatisfied: Boolean(state.questionUi?.reviewSatisfied),
    reviewGateState: state.questionUi?.reviewGateState || 'not-required',
    reviewFamilyId: state.questionInstance?.workedReview?.familyId || null,
    reviewStepCount: state.questionInstance?.workedReview?.steps?.length || 0,
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
    activePlay: state.activePlay ? FOOTBALL_LEARNING.snapshot(state.activePlay) : null,
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
  const match = Object.prototype.hasOwnProperty.call(overrides, 'match')
    ? overrides.match
    : Object.prototype.hasOwnProperty.call(overrides, 'rivalId')
      ? FOOTBALL_OPPONENT.createMatch(overrides.rivalId)
      : state.match || FOOTBALL_OPPONENT.createMatch();
  const possession = overrides.possession === 'defense' ? 'defense' : 'offense';
  const direction = overrides.direction ?? directionFor(possession);
  const yardLine = overrides.yardLine ?? overrides.yd ?? startingYardFor(possession);
  const yardsToGo = overrides.yardsToGo ?? overrides.ytg ?? 10;
  const firstDownLine = overrides.firstDownLine ?? overrides.fdYd ?? yardLine + (direction * yardsToGo);
  const score = overrides.scores || overrides.score || {};
  const totalYards = overrides.totalYards || {};
  const context = FOOTBALL_DOMAIN.normalizeContext({
    contextId: `seed-validation-${contextSequence}`,
    match,
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
    ...createGameState(context.match),
    gameId: overrides.gameId || statsSession.gameId,
    possessionId: overrides.possessionId || nextPossessionId(),
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
    pendingNextPossession: overrides.pendingNextPossession || null,
    pendingNextStartYardLine: Number.isInteger(overrides.pendingNextStartYardLine) ? overrides.pendingNextStartYardLine : null,
    pendingRestartReason: overrides.pendingRestartReason || null,
    finalizedPossessionIds: [...(overrides.finalizedPossessionIds || [])],
    committedPlayIds: [...(overrides.committedPlayIds || [])],
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
  callKeys() {
    return FOOTBALL_DOMAIN.deepFreeze({
      offense: Object.keys(OFFENSE_CALLS),
      defense: Object.keys(DEFENSE_CALLS),
    });
  },
  learningState() { return FOOTBALL_LEARNING.snapshot(learningSession); },
  coachReport() { return FOOTBALL_LEARNING.snapshot(buildCoachReport()); },
  statsHistory() { return FOOTBALL_STATS.history(); },
  statsSession() { return statsSession ? FOOTBALL_STATS.sessionSnapshot(statsSession) : null; },
  opponentProfiles() { return FOOTBALL_OPPONENT.PROFILES; },
  rivals() { return FOOTBALL_OPPONENT.RIVALS; },
  rivalOrder() { return FOOTBALL_OPPONENT.RIVAL_ORDER; },
  seasonSnapshot() { return FOOTBALL_SEASON.snapshot(); },
  playMode() { return selectedPlayMode; },
  activeSeasonGame() {
    return activeSeasonBinding ? FOOTBALL_DOMAIN.deepFreeze({
      gameNumber: activeSeasonBinding.gameNumber,
      rivalId: activeSeasonBinding.rivalId,
      gameId: activeSeasonBinding.gameId,
    }) : null;
  },
  createMatch(rivalId) {
    return arguments.length === 0
      ? FOOTBALL_OPPONENT.createMatch()
      : FOOTBALL_OPPONENT.createMatch(rivalId);
  },
  selectedRivalId() { return selectedRivalId; },
  selectRival(rivalId) { return selectRivalPreview(rivalId); },
  opponentSnapshot() { return FOOTBALL_LEARNING.snapshot(state.opponentSnapshot); },
  getOpponentTendency(overrides = {}, profile = rivalForMatch(state.match).profileKey) {
    return getOpponentTendency(overrides, profile);
  },
  planOpponentSnap(overrides = {}, profile = rivalForMatch(state.match).profileKey, rng = footballRng) {
    return planOpponentSnap(overrides, profile, rng, state.match.opponent.id);
  },
  pickOpponentCall(weights, rng = footballRng) {
    return FOOTBALL_OPPONENT.pickCall(weights, rng);
  },
  setQuestionFault(mode) {
    const allowed = [null, 'empty-pool', 'build-throw', 'malformed', 'schema-mismatch', 'prepare-after-ui', 'invalid-context', 'invalid-projection', 'review-render-throw'];
    if (!allowed.includes(mode)) throw new TypeError(`Unknown question fault mode: ${mode}`);
    questionFaultMode = mode;
  },
  seedDriveState(overrides = {}) {
    return seedDriveStateForTest(overrides);
  },
  answerChoice(choiceId) {
    return answerChoiceForTest(choiceId);
  },
  selectDecision(action) {
    if (state.phase === 'fourth-down-decision') {
      return state.possession === 'offense'
        ? selectFourthDownAction(action)
        : retryOpponentSpecialAction(action);
    }
    if (state.phase === 'conversion-decision') {
      return state.possession === 'offense'
        ? selectConversionAction(action)
        : retryOpponentConversionAction(action);
    }
    return false;
  },
  continueAfterTouchdown() {
    if (state.phase !== 'touchdown') return false;
    afterTouchdown();
    return activeContractsSnapshot();
  },
  decisionActions() {
    return Array.from(document.querySelectorAll('#decision-grid .decision-btn')).map(button => button.dataset.action);
  },
  finalizePossessionState(possessionId, placement) {
    return finalizePossessionState(possessionId, placement);
  },
  routePossessionPresentation(message = 'Possession complete.') {
    routePossessionPresentation(message);
    return JSON.parse(renderGameToText());
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
  const params = new URLSearchParams(window.location.search);
  const boot = params.get('boot');
  const rivalId = params.get('rival');
  if (rivalId !== null) {
    selectedPlayMode = 'quick';
    let match;
    try {
      match = FOOTBALL_OPPONENT.createMatch(rivalId);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      selectedRivalId = FOOTBALL_OPPONENT.DEFAULT_RIVAL_ID;
      state = createGameState();
      return false;
    }
    selectedRivalId = match.opponent.id;
    state = createGameState(match);
  }
  if (boot === 'offense-call') {
    selectedPlayMode = 'quick';
    startQuickGame();
    return true;
  }
  if (boot === 'defense-call') {
    selectedPlayMode = 'quick';
    const match = FOOTBALL_OPPONENT.createMatch(selectedRivalId);
    initGameSession();
    state = createGameState(match);
    applyMatchPresentation(match);
    hideOverlays();
    startDrive('defense');
    return true;
  }
  return false;
}

const initialSeasonSnapshot = FOOTBALL_SEASON.snapshot();
if (!['missing', 'unavailable'].includes(initialSeasonSnapshot.status)) selectedPlayMode = 'season';
FOOTBALL_SEASON.subscribe(() => {
  if (state.phase === 'start') renderStartMode();
  else if (state.phase === 'final') renderEndSeason();
});

if (!applyBootMode()) showStart();
