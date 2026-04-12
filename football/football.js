const GAME_VERSION = '1.7.0';
const EZ = 5;
function yardToPct(y) { return EZ + (y / 100) * (100 - 2 * EZ); }

const DOWN_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const QUARTER_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const RESULT_CHOICES = ["Touchdown", "First Down", "Neither"];
const START_YARD = 20;
const TD_POINTS = 7;
const POSSESSIONS_PER_QUARTER = 4;

const OFFENSE_CALLS = {
  shortRun: {
    key: 'shortRun',
    label: 'Short Run',
    desc: 'Easy · 2-4 yds',
    risk: 'easy',
    rating: 1,
    gRange: [2, 4],
  },
  shortPass: {
    key: 'shortPass',
    label: 'Short Pass',
    desc: 'Easy · 4-7 yds',
    risk: 'easy',
    rating: 2,
    gRange: [4, 7],
  },
  longRun: {
    key: 'longRun',
    label: 'Long Run',
    desc: 'Medium · 6-12 yds',
    risk: 'medium',
    rating: 3,
    gRange: [6, 12],
  },
  mediumPass: {
    key: 'mediumPass',
    label: 'Medium Pass',
    desc: 'Hard · 8-16 yds',
    risk: 'hard',
    rating: 4,
    gRange: [8, 16],
  },
  longPass: {
    key: 'longPass',
    label: 'Long Pass',
    desc: 'Very hard · 12-25 yds',
    risk: 'very-hard',
    rating: 5,
    gRange: [12, 25],
  },
};

const DEFENSE_CALLS = {
  run: {
    key: 'run',
    label: 'Run Defense',
    desc: 'Easy math · stops runs',
    risk: 'easy',
    rating: 1,
    covers: ['shortRun', 'longRun'],
  },
  shortPass: {
    key: 'shortPass',
    label: 'Short Pass D',
    desc: 'Easy math · quick throws',
    risk: 'easy',
    rating: 2,
    covers: ['shortPass'],
  },
  mediumPass: {
    key: 'mediumPass',
    label: 'Medium Pass D',
    desc: 'Medium math · middle',
    risk: 'medium',
    rating: 3,
    covers: ['mediumPass'],
  },
  deepPass: {
    key: 'deepPass',
    label: 'Deep Pass D',
    desc: 'Hard math · deep ball',
    risk: 'hard',
    rating: 4,
    covers: ['longPass'],
  },
};

const OPPONENT_CALL_WEIGHTS = [
  { key: 'shortRun', weight: 1 },
  { key: 'shortPass', weight: 1 },
  { key: 'longRun', weight: 2 },
  { key: 'mediumPass', weight: 3 },
  { key: 'longPass', weight: 3 },
];

const OFFENSE_MISS_MESSAGES = {
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
};

const DEFENSE_STOP_MESSAGES = {
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
};

const DEFENSE_GAIN_MESSAGES = {
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
};

let state = {};
let advTimer = null;

function choose(a) {
  return a[Math.floor(Math.random() * a.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
    plays: state.plays || 0,
    quarterPossessions: state.quarterPossessions || 0,
    tds: state.tds || 0,
    opponentTds: state.opponentTds || 0,
    defenseStops: state.defenseStops || 0,
    pendingNextPossession: state.pendingNextPossession || null,
  };
}

function blankPlayState() {
  return {
    g: null,
    label: null,
    callKey: null,
    defenseCallKey: null,
    opponentCallKey: null,
    matchup: null,
    questionId: null,
    question: null,
    correct: null,
    choices: [],
    choiceType: 'number',
    explain: null,
    outcomeMessage: null,
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
    plays: 0,
    quarterPossessions: 0,
    tds: 0,
    opponentTds: 0,
    defenseStops: 0,
    pendingNextPossession: null,
    phase: 'start',
    ...makeDriveState('offense'),
    ...blankPlayState(),
  };
}

function sortedOrShuffled(values, level) {
  if (level.key === 'easy') return [...values].sort((a, b) => a - b);
  return shuffle(values);
}

function fitsLevelNumber(value, level) {
  return value <= level.numberMax;
}

function makeQuestionProfileForRating(baseRating) {
  const rating = clamp(baseRating, 1, 5);
  return {
    key: rating <= 2 ? 'easy' : 'hard',
    maxRating: rating,
    choiceCount: 4,
    numberMax: rating <= 1 ? 10 : rating <= 2 ? 20 : rating <= 3 ? 50 : 100,
  };
}

function makeQuestionProfile(callKey, ratingAdjust = 0) {
  const call = OFFENSE_CALLS[callKey] || OFFENSE_CALLS.shortRun;
  return makeQuestionProfileForRating(call.rating + ratingAdjust);
}

function makeNumericChoices(correct, level, opts = {}) {
  const min = opts.min ?? 0;
  const max = opts.max ?? Math.max(correct + 10, level.numberMax);
  const count = opts.count ?? level.choiceCount;
  const set = new Set([correct]);
  const deltas = level.maxRating <= 2 ? [1, 2, 3, 4, 5, 10] : [1, 2, 3, 5, 7, 10, 15, 20];

  for (const d of deltas) {
    if (set.size >= count) break;
    const plus = correct + d;
    const minus = correct - d;
    if (plus <= max) set.add(plus);
    if (set.size >= count) break;
    if (minus >= min) set.add(minus);
  }

  let offset = 1;
  while (set.size < count && offset <= max - min + 1) {
    const v = min + ((correct - min + offset) % (max - min + 1));
    set.add(v);
    offset++;
  }

  return sortedOrShuffled([...set].slice(0, count), level);
}

function makeFixedNumericChoices(values, level) {
  return level.key === 'easy' ? [...values].sort((a, b) => a - b) : shuffle(values);
}

function makeDownChoices(correctDown, level) {
  const values = new Set([correctDown]);
  [correctDown + 1, correctDown - 1, 1, 2, 3, 4].forEach((d) => {
    if (d >= 1 && d <= 4 && values.size < level.choiceCount) values.add(d);
  });
  const ordered = level.key === 'easy' ? [...values].sort((a, b) => a - b) : shuffle([...values]);
  return ordered.map((d) => DOWN_NAMES[d]);
}

function makeQuarterChoices(correctQuarter, level) {
  const values = new Set([correctQuarter]);
  [1, 2, 3, 4].forEach((q) => values.add(q));
  const ordered = level.key === 'easy' ? [...values].sort((a, b) => a - b) : shuffle([...values]);
  return ordered.slice(0, 4).map((q) => QUARTER_NAMES[q]);
}

function makeDownDistanceChoices(correctDown, correctYtg, level) {
  const byLabel = new Map();
  const add = (down, ytg) => {
    if (down < 1 || down > 4 || ytg < 1) return;
    const label = downDistanceLabel(down, ytg);
    if (!byLabel.has(label)) byLabel.set(label, { down, ytg });
  };

  add(correctDown, correctYtg);
  add(correctDown + 1, correctYtg);
  add(correctDown - 1, correctYtg);
  add(correctDown, correctYtg + 1);
  add(correctDown, Math.max(1, correctYtg - 1));
  add(1, 10);

  const ordered = [...byLabel.entries()].slice(0, level.choiceCount);
  if (level.key === 'easy') {
    ordered.sort((a, b) => a[1].down - b[1].down || a[1].ytg - b[1].ytg);
  } else {
    return shuffle(ordered).map(([label]) => label);
  }
  return ordered.map(([label]) => label);
}

function makeYesNoChoices() {
  return ["Yes", "No"];
}

function makeYardChoices(correctYd, level, anchors = []) {
  const byLabel = new Map();
  const add = (v) => {
    const yd = clamp(Math.round(v), 0, 100);
    const label = ydLabel(yd);
    if (!byLabel.has(label)) byLabel.set(label, yd);
  };

  add(correctYd);
  anchors.forEach(add);
  [1, 2, 3, 5, 10, -1, -2, -3, -5, -10, 15, -15].forEach((d) => {
    if (byLabel.size < level.choiceCount) add(correctYd + d);
  });

  let scan = 0;
  while (byLabel.size < level.choiceCount && scan <= 100) {
    add(scan);
    scan += 5;
  }

  const entries = [...byLabel.entries()].slice(0, level.choiceCount);
  const ordered = level.key === 'easy'
    ? entries.sort((a, b) => a[1] - b[1])
    : shuffle(entries);
  return ordered.map(([label]) => label);
}

function outcomeMessage(messagesByCall, callKey) {
  return choose(messagesByCall[callKey] || messagesByCall.shortRun);
}

function gainSentence(s, p) {
  if (s.possession === 'defense') return `The opponent could gain ${yds(p.gain)}`;
  return `You gain ${yds(p.gain)}`;
}

function locationGainSentence(s, p) {
  if (s.possession === 'defense') {
    return `The opponent is on ${ydLabel(p.oldYd)} and could gain ${yds(p.gain)}`;
  }
  return `You're on ${ydLabel(p.oldYd)} and gain ${yds(p.gain)}`;
}

function playResult(play) {
  if (play.isTouchdown) return 'Touchdown';
  if (play.gotFirstDown) return 'First Down';
  return 'Neither';
}

function makePlaySnapshot(s, gain, call) {
  const oldYd = s.yd;
  const newYd = moveYards(oldYd, gain, s.direction);
  const isTouchdown = reachesGoal(newYd, s.direction);
  const reachedMarker = reachesMarker(newYd, s.fdYd, s.direction);
  const gotFirstDown = !isTouchdown && reachedMarker;
  const isTurnoverOnDowns = !isTouchdown && !gotFirstDown && s.down >= 4;
  const newFdYd = gotFirstDown ? nextFirstDownLine(newYd, s.direction) : s.fdYd;
  const newDown = gotFirstDown ? 1 : Math.min(s.down + 1, 4);
  const newYtg = gotFirstDown
    ? Math.max(distanceToMarker(newYd, newFdYd, s.direction), 1)
    : Math.max(distanceToMarker(newYd, s.fdYd, s.direction), 0);

  return {
    gain,
    label: call.label,
    callKey: call.key,
    oldYd,
    newYd,
    oldDown: s.down,
    oldYtg: s.ytg,
    newDown,
    newYtg,
    newFdYd,
    gotFirstDown,
    isTouchdown,
    isTurnoverOnDowns,
    crossedMidfield: s.direction === 1 ? oldYd < 50 && newYd >= 50 : oldYd > 50 && newYd <= 50,
    driveYards: Math.abs(newYd - s.driveStart),
  };
}

const QUESTION_BANK = [
  {
    id: 'what-quarter',
    rating: 1,
    weight: 0.35,
    canUse: (s) => s.quarter >= 1,
    build: (s, p, level) => ({
      q: 'What quarter are we in?',
      correct: QUARTER_NAMES[s.quarter],
      choices: makeQuarterChoices(s.quarter, level),
      choiceType: 'down',
      explain: `The scoreboard says Q${s.quarter}, so it is the ${QUARTER_NAMES[s.quarter]} quarter.`,
    }),
  },
  {
    id: 'what-half',
    rating: 1,
    weight: 0.3,
    canUse: (s) => s.quarter >= 1,
    build: (s) => ({
      q: 'What half are we in?',
      correct: halfLabel(s.quarter),
      choices: ['1st', '2nd'],
      choiceType: 'down',
      explain: `Quarters 1 and 2 are the 1st half. Quarters 3 and 4 are the 2nd half.`,
    }),
  },
  {
    id: 'quarters-in-half',
    rating: 1,
    weight: 0.25,
    canUse: (s) => s.quarter >= 1,
    build: (s, p, level) => ({
      q: 'How many quarters are in one half?',
      correct: 2,
      choices: makeFixedNumericChoices([1, 2, 3, 4], level),
      choiceType: 'number',
      explain: 'One half has 2 quarters.',
    }),
  },
  {
    id: 'quarters-left',
    rating: 1,
    weight: 0.25,
    canUse: (s) => s.quarter >= 1,
    build: (s, p, level) => ({
      q: 'How many quarters are left after this one?',
      correct: 4 - s.quarter,
      choices: makeFixedNumericChoices([0, 1, 2, 3], level),
      choiceType: 'number',
      explain: `There are ${4 - s.quarter} quarters left after Q${s.quarter}.`,
    }),
  },
  {
    id: 'what-down',
    rating: 1,
    weight: 3,
    canUse: (s, p) => p.gain < s.ytg && s.down < 4,
    build: (s, p, level) => ({
      q: `It's ${downDistanceLabel(s.down, s.ytg)}. ${gainSentence(s, p)}.\nWhat down is it now?`,
      correct: DOWN_NAMES[s.down + 1],
      choices: makeDownChoices(s.down + 1, level),
      choiceType: 'down',
      explain: `It was ${DOWN_NAMES[s.down]} down. The next down is ${DOWN_NAMES[s.down + 1]}.`,
    }),
  },
  {
    id: 'is-first-down',
    rating: 1,
    weight: 3,
    canUse: (s, p) => !p.isTouchdown,
    build: (s, p) => {
      const correct = p.gotFirstDown ? 'Yes' : 'No';
      return {
        q: `It's ${downDistanceLabel(s.down, s.ytg)}. ${gainSentence(s, p)}.\nIs that a first down?`,
        correct,
        choices: makeYesNoChoices(),
        choiceType: 'category',
        explain: p.gotFirstDown
          ? `${yds(p.gain)} is enough for ${yds(s.ytg)}, so yes: first down.`
          : `${yds(p.gain)} is less than ${yds(s.ytg)}, so not yet.`,
      };
    },
  },
  {
    id: 'yards-needed',
    rating: 1,
    weight: 2,
    canUse: (s) => s.ytg > 0,
    build: (s, p, level) => ({
      q: `It's ${downDistanceLabel(s.down, s.ytg)}.\nHow many yards are needed for a first down?`,
      correct: s.ytg,
      choices: makeNumericChoices(s.ytg, level, { min: 1, max: 10 }),
      choiceType: 'number',
      explain: `The "${s.ytg}" in ${downDistanceLabel(s.down, s.ytg)} tells you the yards needed.`,
    }),
  },
  {
    id: 'is-touchdown',
    rating: 1,
    weight: 2,
    canUse: (s, p, level) => yardsToGoal(p.oldYd, s.direction) <= Math.min(level.numberMax, 30),
    build: (s, p) => {
      const correct = p.isTouchdown ? 'Yes' : 'No';
      const needed = yardsToGoal(p.oldYd, s.direction);
      return {
        q: `${locationGainSentence(s, p)}.\nTouchdown?`,
        correct,
        choices: makeYesNoChoices(),
        choiceType: 'category',
        explain: p.isTouchdown
          ? `The goal line is ${yds(needed)} away, and ${yds(p.gain)} reaches it.`
          : `The goal line is ${yds(needed)} away, and ${yds(p.gain)} is not enough.`,
      };
    },
  },
  {
    id: 'yards-left',
    rating: 2,
    weight: 3,
    canUse: (s, p, level) => p.gain < s.ytg && fitsLevelNumber(s.ytg - p.gain, level),
    build: (s, p, level) => {
      const correct = s.ytg - p.gain;
      return {
        q: `It's ${downDistanceLabel(s.down, s.ytg)}. ${gainSentence(s, p)}.\nHow many yards are left for a first down?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: 10 }),
        choiceType: 'number',
        explain: `${s.ytg} - ${p.gain} = ${correct}, so ${yds(correct)} are left.`,
      };
    },
  },
  {
    id: 'bonds-to-10',
    rating: 2,
    weight: 2,
    canUse: (s, p, level) => s.down === 1 && s.ytg === 10 && p.gain < 10 && fitsLevelNumber(10 - p.gain, level),
    build: (s, p, level) => {
      const correct = 10 - p.gain;
      return {
        q: `It's 1st & 10. ${gainSentence(s, p)}.\nHow many more for a first down?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: 10 }),
        choiceType: 'number',
        explain: `10 - ${p.gain} = ${correct}, so ${yds(correct)} more are needed.`,
      };
    },
  },
  {
    id: 'new-yard-line',
    rating: 2,
    weight: 3,
    canUse: (s, p, level) => !p.isTouchdown && level.maxRating >= 2 && fieldNumber(p.newYd) <= level.numberMax,
    build: (s, p, level) => {
      const correct = ydLabel(p.newYd);
      return {
        q: `${locationGainSentence(s, p)}.\nWhat yard line is the ball on?`,
        correct,
        choices: makeYardChoices(p.newYd, level, [p.oldYd]),
        choiceType: 'yard',
        explain: `${ydLabel(p.oldYd)} plus ${yds(p.gain)} moves the ball to ${correct}.`,
      };
    },
  },
  {
    id: 'yards-short',
    rating: 2,
    weight: 2,
    canUse: (s, p, level) => p.gain < s.ytg && fitsLevelNumber(s.ytg - p.gain, level),
    build: (s, p, level) => {
      const correct = s.ytg - p.gain;
      return {
        q: `It's ${downDistanceLabel(s.down, s.ytg)}. ${gainSentence(s, p)}.\nHow many yards short of the marker is that?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: 10 }),
        choiceType: 'number',
        explain: `${s.ytg} - ${p.gain} = ${correct}, so the play is ${yds(correct)} short.`,
      };
    },
  },
  {
    id: 'drive-yards',
    rating: 5,
    weight: 1,
    canUse: (s, p, level) => p.driveYards > 3 && fitsLevelNumber(p.driveYards, level),
    build: (s, p, level) => ({
      q: `Drive started at ${ydLabel(s.driveStart)}. After this play, the ball would be at ${ydLabel(p.newYd)}.\nHow many yards is that drive?`,
      correct: p.driveYards,
      choices: makeNumericChoices(p.driveYards, level, { min: 1, max: level.numberMax }),
      choiceType: 'number',
      explain: `From ${ydLabel(s.driveStart)} to ${ydLabel(p.newYd)} is ${yds(p.driveYards)}.`,
    }),
  },
  {
    id: 'yards-to-endzone-near',
    rating: 3,
    weight: 3,
    canUse: (s, p, level) => !p.isTouchdown && yardsToGoal(p.newYd, s.direction) <= 50 && fitsLevelNumber(yardsToGoal(p.newYd, s.direction), level),
    build: (s, p, level) => {
      const correct = yardsToGoal(p.newYd, s.direction);
      return {
        q: `The ball would be on ${ydLabel(p.newYd)}.\nHow many yards to the end zone?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: level.numberMax }),
        choiceType: 'number',
        explain: `From ${ydLabel(p.newYd)}, the end zone is ${yds(correct)} away.`,
      };
    },
  },
  {
    id: 'yards-to-endzone-far',
    rating: 5,
    weight: 2,
    canUse: (s, p, level) => !p.isTouchdown && yardsToGoal(p.newYd, s.direction) > 50 && fitsLevelNumber(yardsToGoal(p.newYd, s.direction), level),
    build: (s, p, level) => {
      const correct = yardsToGoal(p.newYd, s.direction);
      return {
        q: `The ball would be on ${ydLabel(p.newYd)}.\nHow many yards to the end zone?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: level.numberMax }),
        choiceType: 'number',
        explain: `From ${ydLabel(p.newYd)}, the end zone is ${yds(correct)} away.`,
      };
    },
  },
  {
    id: 'down-distance',
    rating: 3,
    weight: 1,
    canUse: (s, p) => !p.isTouchdown && !p.gotFirstDown && !p.isTurnoverOnDowns && p.newYtg > 0,
    build: (s, p, level) => ({
      q: `It's ${downDistanceLabel(s.down, s.ytg)}. ${gainSentence(s, p)}.\nWhat is the new down and distance?`,
      correct: downDistanceLabel(p.newDown, p.newYtg),
      choices: makeDownDistanceChoices(p.newDown, p.newYtg, level),
      choiceType: 'category',
      explain: `The next play would be ${downDistanceLabel(p.newDown, p.newYtg)}.`,
    }),
  },
  {
    id: 'what-happened',
    rating: 2,
    weight: 1,
    canUse: () => true,
    build: (s, p) => {
      const correct = playResult(p);
      return {
        q: `It's ${downDistanceLabel(s.down, s.ytg)} from ${ydLabel(p.oldYd)}. ${gainSentence(s, p)}.\nWhat happens?`,
        correct,
        choices: RESULT_CHOICES,
        choiceType: 'category',
        explain: correct === 'Touchdown'
          ? 'Touchdown is the biggest result, so it is the answer.'
          : correct === 'First Down'
            ? `${yds(p.gain)} reaches the marker, so it is a first down.`
            : `${yds(p.gain)} does not reach the marker or the end zone.`,
      };
    },
  },
];

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pickQuestion(s, play, level) {
  const candidates = QUESTION_BANK.filter((entry) =>
    entry.rating <= level.maxRating && entry.canUse(s, play, level)
  );
  const entry = candidates.length ? weightedPick(candidates) : QUESTION_BANK.find((q) => q.id === 'yards-needed');
  return { id: entry.id, ...entry.build(s, play, level) };
}

function buildPlay(callKey, opts = {}) {
  const call = OFFENSE_CALLS[callKey] || OFFENSE_CALLS.shortRun;
  const maxPossible = state.direction === 1 ? 100 - state.yd : state.yd;
  const maxG = Math.max(1, Math.min(call.gRange[1], maxPossible));
  const minG = Math.max(1, Math.min(call.gRange[0], maxG));
  let gain = randomInt(minG, maxG);

  if (opts.gainMultiplier) {
    gain = clamp(Math.round(gain * opts.gainMultiplier), 1, maxPossible);
  }

  const play = makePlaySnapshot(state, gain, call);
  const profile = opts.questionRating
    ? makeQuestionProfileForRating(opts.questionRating)
    : makeQuestionProfile(callKey, opts.ratingAdjust || 0);
  const question = pickQuestion(state, play, profile);
  return { ...play, ...question, callKey, questionRating: profile.maxRating };
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
  const fw = document.getElementById('field-wrap');
  fw.classList.toggle('defense', state.possession === 'defense');
  if (!animated) {
    ball.style.transition = 'none'; fdl.style.transition = 'none';
    requestAnimationFrame(() => { ball.style.transition = ''; fdl.style.transition = ''; });
  }
  const rotation = state.possession === 'defense' ? 18 : -18;
  ball.style.left = (yardToPct(state.animYd) - 2.2) + '%';
  ball.style.transform = `translateY(-50%) rotate(${rotation}deg)`;
  fdl.style.left = yardToPct(clamp(state.fdYd, 0, 100)) + '%';
  if (animated) {
    ball.classList.add('ball-moving');
    setTimeout(() => ball.classList.remove('ball-moving'), 400);
  }
}

function updateStatus() {
  document.getElementById('s-down').textContent = downDistanceLabel(state.down, state.ytg);
  document.getElementById('s-yd').textContent = ydLabel(state.yd, true);
  document.getElementById('s-quarter').textContent = `Q${state.quarter}`;
  document.getElementById('s-score').textContent = `${state.playerScore} - ${state.opponentScore}`;
}

function setFeedback(t) { document.getElementById('feedback').textContent = t; }

function hideAnswerButtons() {
  document.getElementById('btn-row').classList.add('hidden');
  [0, 1, 2, 3].forEach(i => {
    const b = document.getElementById('b' + i);
    b.disabled = true;
    b.textContent = '';
    b.classList.remove('wrong');
  });
}

function hideCallGrid() {
  const grid = document.getElementById('call-grid');
  grid.classList.add('hidden');
  grid.innerHTML = '';
}

function renderButtons() {
  hideCallGrid();
  document.getElementById('btn-row').classList.remove('hidden');
  [0, 1, 2, 3].forEach(i => {
    const b = document.getElementById('b' + i);
    const hasChoice = i < state.choices.length;
    b.classList.toggle('hidden', !hasChoice);
    b.disabled = !hasChoice;
    b.classList.remove('wrong');
    if (!hasChoice) {
      b.textContent = '';
      return;
    }
    b.textContent = state.choices[i];
    b.style.fontSize = state.choiceType === 'number' ? '34px' : state.choiceType === 'down' ? '28px' : state.choiceType === 'yard' ? '18px' : '20px';
  });
}

function renderCallGrid(calls, onPick) {
  hideAnswerButtons();
  const grid = document.getElementById('call-grid');
  grid.innerHTML = '';
  grid.classList.remove('hidden');
  calls.forEach((call) => {
    const btn = document.createElement('button');
    btn.className = 'call-btn';
    btn.dataset.risk = call.risk || 'medium';
    btn.innerHTML = `<span class="call-label">${call.label}</span><span class="call-desc">${call.desc}</span>`;
    btn.addEventListener('click', () => onPick(call.key));
    grid.appendChild(btn);
  });
}

function disableAnswers() {
  [0, 1, 2, 3].forEach(i => document.getElementById('b' + i).disabled = true);
}

// -- Play flow ----------------------------------------------------------------
function showCallPrompt() {
  clearTimeout(advTimer);
  Object.assign(state, blankPlayState(), { phase: 'call' });
  updateStatus();
  if (state.possession === 'offense') {
    document.getElementById('play-label').textContent = `Your Ball: ${downDistanceLabel(state.down, state.ytg)}`;
    document.getElementById('question').textContent = 'Pick your play. Short plays are easier; long plays are harder.';
    renderCallGrid(Object.values(OFFENSE_CALLS), selectOffenseCall);
  } else {
    document.getElementById('play-label').textContent = `Opponent Ball: ${downDistanceLabel(state.down, state.ytg)}`;
    document.getElementById('question').textContent = 'Pick your defense. The card sets the math difficulty; matching their play cuts down the gain.';
    renderCallGrid(Object.values(DEFENSE_CALLS), selectDefenseCall);
  }
  setFeedback('');
}

function startDrive(possession) {
  clearTimeout(advTimer);
  hideOverlays();
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

function prepareQuestion(p, labelHtml) {
  Object.assign(state, {
    g: p.gain,
    label: p.label,
    callKey: p.callKey,
    questionId: p.id,
    question: p.q,
    correct: p.correct,
    choices: p.choices,
    choiceType: p.choiceType || 'number',
    explain: p.explain,
    outcomeMessage: null,
    play: p,
    phase: 'question',
  });
  document.getElementById('play-label').innerHTML = labelHtml;
  document.getElementById('question').textContent = state.question;
  setFeedback('');
  renderButtons();
}

function selectOffenseCall(callKey) {
  if (state.phase !== 'call' || state.possession !== 'offense') return;
  const p = buildPlay(callKey);
  prepareQuestion(p, `${p.label} attempt for <span>${yds(p.gain)}</span>`);
}

function pickOpponentCall() {
  return weightedPick(OPPONENT_CALL_WEIGHTS).key;
}

function defenseMatches(defenseCallKey, opponentCallKey) {
  const call = DEFENSE_CALLS[defenseCallKey];
  return call && call.covers.includes(opponentCallKey);
}

function selectDefenseCall(defenseCallKey) {
  if (state.phase !== 'call' || state.possession !== 'defense') return;
  const opponentCallKey = pickOpponentCall();
  const matched = defenseMatches(defenseCallKey, opponentCallKey);
  const defenseCall = DEFENSE_CALLS[defenseCallKey];
  const p = buildPlay(opponentCallKey, {
    questionRating: defenseCall.rating,
    gainMultiplier: matched ? 0.65 : 1.2,
  });
  Object.assign(state, {
    defenseCallKey,
    opponentCallKey,
    matchup: matched ? 'matched' : 'mismatch',
  });
  const call = OFFENSE_CALLS[opponentCallKey];
  const read = matched ? 'Good matchup' : 'Mismatch';
  prepareQuestion(p, `Opponent ${call.label.toLowerCase()} for <span>${yds(p.gain)}</span>`);
  setFeedback(`${read}: ${defenseCall.label} vs ${call.label}. Math level comes from your defense call.`);
}

function handleAnswer(idx) {
  if (state.phase !== 'question') return;
  const btn = document.getElementById('b' + idx);
  if (!btn || btn.disabled || btn.classList.contains('hidden')) return;
  const val = state.choices[idx];

  if (state.possession === 'defense') {
    handleDefenseAnswer(btn, val);
    return;
  }

  if (val !== state.correct) {
    const msg = outcomeMessage(OFFENSE_MISS_MESSAGES, state.callKey);
    btn.classList.add('wrong');
    disableAnswers();
    state.phase = 'feedback';
    state.outcomeMessage = msg;
    setFeedback(`${msg} ${state.explain || 'That answer misses it.'}`);
    setTimeout(() => { btn.classList.remove('wrong'); }, 700);
    resolveOffenseMiss();
    return;
  }

  disableAnswers();
  state.phase = 'feedback';
  resolveOffensePlay();
}

function handleDefenseAnswer(btn, val) {
  disableAnswers();
  state.phase = 'feedback';
  if (val === state.correct) {
    const msg = outcomeMessage(DEFENSE_STOP_MESSAGES, state.opponentCallKey);
    state.outcomeMessage = msg;
    setFeedback(`${msg} ${state.explain || ''}`.trim());
    resolveDefenseStop(msg);
    return;
  }

  const msg = outcomeMessage(DEFENSE_GAIN_MESSAGES, state.opponentCallKey);
  btn.classList.add('wrong');
  state.outcomeMessage = msg;
  setFeedback(`${msg} ${state.explain || 'That answer misses it.'} Opponent gains ${yds(state.g)}.`);
  setTimeout(() => { btn.classList.remove('wrong'); }, 700);
  resolveDefenseGain(msg);
}

function applyPlayState(p) {
  state.yd = p.newYd;
  state.fdYd = p.newFdYd;
  state.down = p.newDown;
  state.ytg = p.newYtg;
  state.animYd = p.newYd;
  state.drivePlays++;
  state.plays++;
  updateField(true);
  updateStatus();
}

function resolveOffensePlay() {
  const p = state.play;
  applyPlayState(p);

  if (p.isTouchdown) {
    state.tds++;
    state.playerScore += TD_POINTS;
    updateStatus();
    setFeedback('🏈 Touchdown!');
    advTimer = setTimeout(showTD, 900);
    return;
  }

  if (p.isTurnoverOnDowns) {
    setFeedback('Turnover on downs…');
    advTimer = setTimeout(() => finishPossession('Turnover on downs. Time to play defense!'), 1400);
    return;
  }

  setFeedback(p.gotFirstDown ? '🎉 First Down!' : 'Correct! ✅');
  advTimer = setTimeout(showCallPrompt, 1400);
}

function resolveOffenseMiss() {
  state.drivePlays++;
  state.plays++;
  const nextDown = state.down + 1;

  if (nextDown > 4) {
    updateStatus();
    advTimer = setTimeout(() => finishPossession('Turnover on downs. Time to play defense!'), 1800);
    return;
  }

  state.down = nextDown;
  state.ytg = distanceToMarker(state.yd, state.fdYd, state.direction);
  updateStatus();
  advTimer = setTimeout(showCallPrompt, 1800);
}

function resolveDefenseStop(message) {
  state.drivePlays++;
  state.plays++;
  const nextDown = state.down + 1;

  if (nextDown > 4) {
    state.defenseStops++;
    updateStatus();
    advTimer = setTimeout(() => finishPossession(`${message || 'Your defense held!'} Turnover on downs!`), 1500);
    return;
  }

  state.down = nextDown;
  state.ytg = distanceToMarker(state.yd, state.fdYd, state.direction);
  updateStatus();
  advTimer = setTimeout(showCallPrompt, 1500);
}

function resolveDefenseGain(message) {
  const p = state.play;
  applyPlayState(p);

  if (p.isTouchdown) {
    state.opponentTds++;
    state.opponentScore += TD_POINTS;
    updateStatus();
    advTimer = setTimeout(() => finishPossession(`${message || 'Opponent scored.'} Opponent touchdown.`), 1600);
    return;
  }

  if (p.isTurnoverOnDowns) {
    state.defenseStops++;
    updateStatus();
    advTimer = setTimeout(() => finishPossession(`${message || 'Defense holds!'} Turnover on downs!`), 1600);
    return;
  }

  advTimer = setTimeout(showCallPrompt, 1600);
}

function hideOverlays() {
  ['ov-start', 'ov-td', 'ov-defense', 'ov-offense', 'ov-quarter', 'ov-halftime', 'ov-end'].forEach((id) => {
    document.getElementById(id).classList.remove('show');
  });
}

function showStart() {
  clearTimeout(advTimer);
  hideOverlays();
  document.getElementById('ov-start').classList.add('show');
  document.getElementById('play-label').textContent = 'Get ready…';
  document.getElementById('question').textContent = '';
  setFeedback('');
  hideAnswerButtons();
  hideCallGrid();
  state.phase = 'start';
}

function startGame() {
  clearTimeout(advTimer);
  state = createGameState();
  hideOverlays();
  startDrive('offense');
}

function showTD() {
  const button = document.getElementById('ov-td-btn');
  Object.assign(state, blankPlayState(), { phase: 'touchdown' });
  document.getElementById('ov-td-sub').textContent =
    `Score: ${state.playerScore} - ${state.opponentScore}. ${state.tds} player TD${state.tds === 1 ? '' : 's'}!`;
  if (button) button.textContent = touchdownContinueLabel();
  document.getElementById('ov-td').classList.add('show');
}

function afterTouchdown() {
  document.getElementById('ov-td').classList.remove('show');
  finishPossession('You scored. Time to play defense!');
}

function showDefenseTransition(message) {
  clearTimeout(advTimer);
  Object.assign(state, blankPlayState(), { phase: 'transition' });
  document.getElementById('ov-defense-sub').textContent =
    `${message} Score: ${state.playerScore} - ${state.opponentScore}`;
  document.getElementById('ov-defense').classList.add('show');
}

function startDefense() {
  document.getElementById('ov-defense').classList.remove('show');
  startDrive('defense');
}

function showOffenseTransition(message) {
  clearTimeout(advTimer);
  Object.assign(state, blankPlayState(), { phase: 'transition' });
  document.getElementById('ov-offense-sub').textContent =
    `${message} Score: ${state.playerScore} - ${state.opponentScore}`;
  document.getElementById('ov-offense').classList.add('show');
}

function startOffense() {
  document.getElementById('ov-offense').classList.remove('show');
  startDrive('offense');
}

function touchdownContinueLabel() {
  if (state.quarterPossessions + 1 < POSSESSIONS_PER_QUARTER) return 'Play Defense!';
  if (state.quarter >= 4) return 'Final Score';
  if (state.quarter === 2) return 'Halftime!';
  return 'Next Quarter';
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

function showQuarterEnd(message) {
  const next = possessionTitle(state.pendingNextPossession || 'offense');
  Object.assign(state, blankPlayState(), { phase: 'quarter' });
  document.getElementById('ov-quarter-title').textContent = `End of ${QUARTER_NAMES[state.quarter]} Quarter`;
  document.getElementById('ov-quarter-sub').textContent =
    `${message} Next possession after the break: ${next}. Score: ${state.playerScore} - ${state.opponentScore}`;
  document.getElementById('ov-quarter').classList.add('show');
}

function showHalftime(message) {
  const next = possessionTitle(state.pendingNextPossession || 'defense');
  Object.assign(state, blankPlayState(), { phase: 'halftime' });
  document.getElementById('ov-halftime-sub').textContent =
    `${message} Halftime swap: ${next} starts the 2nd half. Score: ${state.playerScore} - ${state.opponentScore}`;
  document.getElementById('ov-halftime').classList.add('show');
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

function showGameOver() {
  const diff = state.playerScore - state.opponentScore;
  const title = diff > 0 ? 'You Win!' : diff < 0 ? 'Final Score' : 'Tie Game!';
  const emoji = diff > 0 ? '🏆' : diff < 0 ? '🏈' : '🤝';
  const detail = diff > 0
    ? 'Great game.'
    : diff < 0
      ? 'Good effort. Try another game.'
      : 'Both teams finished even.';

  Object.assign(state, blankPlayState(), { pendingNextPossession: null, phase: 'final' });
  document.getElementById('ov-end-emoji').textContent = emoji;
  document.getElementById('ov-end-title').textContent = title;
  document.getElementById('ov-end-sub').textContent =
    `Final Score: ${state.playerScore} - ${state.opponentScore}. ${detail} Player TDs: ${state.tds}.`;
  document.getElementById('ov-end').classList.add('show');
}

function restart() {
  state = createGameState();
  updateField(false);
  updateStatus();
  showStart();
}

function renderGameToText() {
  return JSON.stringify({
    mode: state.phase,
    quarter: state.quarter,
    half: halfLabel(state.quarter || 1),
    possession: state.possession,
    score: {
      player: state.playerScore,
      opponent: state.opponentScore,
    },
    down: state.down,
    ytg: state.ytg,
    yardLine: ydLabel(state.yd),
    absoluteYard: state.yd,
    firstDownLine: ydLabel(state.fdYd),
    direction: state.direction,
    plays: state.plays,
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
    matchup: state.matchup,
    gain: state.g ?? null,
    questionRating: state.play?.questionRating ?? null,
    questionId: state.questionId || null,
    question: state.question || null,
    choices: state.choices || [],
    correct: state.correct ?? null,
    explain: state.explain || null,
    outcomeMessage: state.outcomeMessage || null,
  });
}

window.render_game_to_text = renderGameToText;
window.advanceTime = () => {};

// -- Init ---------------------------------------------------------------------
buildField();
state = createGameState();
updateField(false);
updateStatus();
showStart();
