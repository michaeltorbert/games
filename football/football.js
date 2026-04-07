const GAME_VERSION = '1.5.0';
const EZ = 5;
function yardToPct(y) { return EZ + (y / 100) * (100 - 2 * EZ); }
const DOWN_NAMES = ["", "1st", "2nd", "3rd", "4th"];
const RESULT_CHOICES = ["Touchdown", "First Down", "Neither"];

const LEVELS = {
  warmup: {
    key: 'warmup',
    label: 'Warm-Up',
    desc: 'Tiny numbers',
    gRange: [1, 3],
    maxRating: 1,
    choiceCount: 2,
    numberMax: 10,
    startYds: [90],
    tdThreshold: 90,
  },
  rookie: {
    key: 'rookie',
    label: 'Rookie',
    desc: 'James target',
    gRange: [1, 5],
    maxRating: 2,
    choiceCount: 3,
    numberMax: 20,
    startYds: [50, 60, 65, 70, 75, 80],
    tdThreshold: 80,
  },
  starter: {
    key: 'starter',
    label: 'Starter',
    desc: 'Field position',
    gRange: [1, 7],
    maxRating: 3,
    choiceCount: 3,
    numberMax: 50,
    startYds: [20, 35, 45, 50, 60, 75],
    tdThreshold: 75,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    desc: 'Full model',
    gRange: [1, 9],
    maxRating: 5,
    choiceCount: 3,
    numberMax: 100,
    startYds: [20],
    tdThreshold: 70,
  },
};

let state = {};
let currentLevelKey = null;
let advTimer = null;

function getCurrentLevel() {
  return LEVELS[currentLevelKey] || LEVELS.rookie;
}

function choose(a) {
  return a[Math.floor(Math.random() * a.length)];
}

function initBase() {
  const level = getCurrentLevel();
  const yd = choose(level.startYds);
  const fdYd = Math.min(yd + 10, 100);
  return {
    yd,
    fdYd,
    down: 1,
    ytg: fdYd - yd,
    driveStart: yd,
    plays: 0,
    tds: 0,
    animYd: yd,
    phase: currentLevelKey ? 'ready' : 'picker',
  };
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

function yardNumber(y) {
  return y <= 50 ? y : 100 - y;
}

function ydLabel(y, short) {
  const v = clamp(Math.round(y), 0, 100);
  const opp = short ? 'opp' : 'opponent';
  if (v < 50) return `own ${v}`;
  if (v === 50) return '50';
  return `${opp} ${100 - v}`;
}

function yds(n) { return n === 1 ? '1 yard' : `${n} yards`; }

function downDistanceLabel(down, ytg) {
  return `${DOWN_NAMES[down]} & ${ytg}`;
}

function fitsLevelNumber(value, level) {
  return value <= level.numberMax;
}

function sortedOrShuffled(values, level) {
  if (level.key === 'warmup' || level.key === 'rookie') return [...values].sort((a, b) => a - b);
  return shuffle(values);
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

function makeDownChoices(correctDown, level) {
  const count = Math.min(level.choiceCount, 4);
  const values = new Set([correctDown]);
  [correctDown + 1, correctDown - 1, 1, 2, 3, 4].forEach((d) => {
    if (d >= 1 && d <= 4 && values.size < count) values.add(d);
  });
  const ordered = level.key === 'warmup' || level.key === 'rookie'
    ? [...values].sort((a, b) => a - b)
    : shuffle([...values]);
  return ordered.map((d) => DOWN_NAMES[d]);
}

function makeDownDistanceChoices(correctDown, correctYtg, level) {
  const count = level.choiceCount;
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

  const ordered = [...byLabel.entries()].slice(0, count);
  if (level.key === 'warmup' || level.key === 'rookie') {
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
  const count = level.choiceCount;
  const byLabel = new Map();
  const add = (v) => {
    const yd = clamp(Math.round(v), 0, 100);
    const label = ydLabel(yd);
    if (!byLabel.has(label)) byLabel.set(label, yd);
  };

  add(correctYd);
  anchors.forEach(add);
  [1, 2, 3, 5, 10, -1, -2, -3, -5, -10, 15, -15].forEach((d) => {
    if (byLabel.size < count) add(correctYd + d);
  });

  let scan = 0;
  while (byLabel.size < count && scan <= 100) {
    add(scan);
    scan += 5;
  }

  const entries = [...byLabel.entries()].slice(0, count);
  const ordered = level.key === 'warmup' || level.key === 'rookie'
    ? entries.sort((a, b) => a[1] - b[1])
    : shuffle(entries);
  return ordered.map(([label]) => label);
}

function playResult(play) {
  if (play.isTouchdown) return 'Touchdown';
  if (play.gotFirstDown) return 'First Down';
  return 'Neither';
}

function makePlaySnapshot(s, gain) {
  const oldYd = s.yd;
  const newYd = Math.min(oldYd + gain, 100);
  const isTouchdown = newYd >= 100;
  const reachedMarker = newYd >= s.fdYd;
  const gotFirstDown = !isTouchdown && reachedMarker;
  const newDown = gotFirstDown ? 1 : Math.min(s.down + 1, 4);
  const newYtg = gotFirstDown ? 10 : Math.max(s.fdYd - newYd, 0);

  return {
    gain,
    label: Math.random() < 0.5 ? 'Run' : 'Pass',
    oldYd,
    newYd,
    oldDown: s.down,
    oldYtg: s.ytg,
    newDown,
    newYtg,
    gotFirstDown,
    isTouchdown,
    crossedMidfield: oldYd < 50 && newYd >= 50,
    driveYards: newYd - s.driveStart,
  };
}

const QUESTION_BANK = [
  {
    id: 'what-down',
    rating: 1,
    weight: 3,
    canUse: (s, p) => p.gain < s.ytg && s.down < 4,
    build: (s, p, level) => ({
      q: `It's ${downDistanceLabel(s.down, s.ytg)}. You gain ${yds(p.gain)}.\nWhat down is it now?`,
      correct: DOWN_NAMES[s.down + 1],
      choices: makeDownChoices(s.down + 1, level),
      choiceType: 'down',
      explain: `You were on ${DOWN_NAMES[s.down]} down. The next down is ${DOWN_NAMES[s.down + 1]}.`,
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
        q: `It's ${downDistanceLabel(s.down, s.ytg)}. You gain ${yds(p.gain)}.\nDid you get a first down?`,
        correct,
        choices: makeYesNoChoices(),
        choiceType: 'category',
        explain: p.gotFirstDown
          ? `${p.gain} is enough for ${s.ytg} yards, so yes: first down.`
          : `${p.gain} is less than ${s.ytg}, so not yet.`,
      };
    },
  },
  {
    id: 'yards-needed',
    rating: 1,
    weight: 2,
    canUse: (s) => s.ytg > 0,
    build: (s, p, level) => ({
      q: `It's ${downDistanceLabel(s.down, s.ytg)}.\nHow many yards do you need for a first down?`,
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
    canUse: (s, p, level) => p.oldYd >= level.tdThreshold,
    build: (s, p) => {
      const correct = p.isTouchdown ? 'Yes' : 'No';
      const yardsToGo = 100 - p.oldYd;
      return {
        q: `You're on ${ydLabel(p.oldYd)} and gain ${yds(p.gain)}.\nTouchdown?`,
        correct,
        choices: makeYesNoChoices(),
        choiceType: 'category',
        explain: p.isTouchdown
          ? `You need ${yardsToGo} yards and gained ${p.gain}. ${p.gain} >= ${yardsToGo}, so yes!`
          : `You need ${yardsToGo} yards but only gained ${p.gain}. Not enough.`,
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
        q: `It's ${downDistanceLabel(s.down, s.ytg)}. You gain ${yds(p.gain)}.\nHow many yards left for a first down?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: 10 }),
        choiceType: 'number',
        explain: `${s.ytg} - ${p.gain} = ${correct}, so ${correct} yards are left.`,
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
        q: `It's 1st & 10. You gain ${yds(p.gain)}.\nHow many more for a first down?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: 10 }),
        choiceType: 'number',
        explain: `10 - ${p.gain} = ${correct}, so you need ${correct} more.`,
      };
    },
  },
  {
    id: 'new-yard-line',
    rating: 2,
    weight: 3,
    canUse: (s, p, level) => {
      if (p.isTouchdown) return false;
      if (level.key === 'warmup') return false;
      return yardNumber(p.newYd) <= level.numberMax;
    },
    build: (s, p, level) => {
      const correct = ydLabel(p.newYd);
      return {
        q: `You're on ${ydLabel(p.oldYd)} and gain ${yds(p.gain)}.\nWhat yard line are you on now?`,
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
        q: `It's ${downDistanceLabel(s.down, s.ytg)}. You gain ${yds(p.gain)}.\nHow many yards short of the marker are you?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: 10 }),
        choiceType: 'number',
        explain: `${s.ytg} - ${p.gain} = ${correct}, so you're ${correct} yards short.`,
      };
    },
  },
  {
    id: 'drive-yards',
    rating: 2,
    weight: 2,
    canUse: (s, p, level) => p.driveYards > 3 && fitsLevelNumber(p.driveYards, level),
    build: (s, p, level) => ({
      q: `Drive started at ${ydLabel(s.driveStart)}. Now you're at ${ydLabel(p.newYd)}.\nHow many yards gained this drive?`,
      correct: p.driveYards,
      choices: makeNumericChoices(p.driveYards, level, { min: 1, max: level.numberMax }),
      choiceType: 'number',
      explain: `From ${ydLabel(s.driveStart)} to ${ydLabel(p.newYd)} is ${p.driveYards} yards gained.`,
    }),
  },
  {
    id: 'yards-to-endzone-opp',
    rating: 3,
    weight: 3,
    canUse: (s, p, level) => !p.isTouchdown && p.newYd > 50 && fitsLevelNumber(100 - p.newYd, level),
    build: (s, p, level) => {
      const correct = 100 - p.newYd;
      return {
        q: `You're on ${ydLabel(p.newYd)}.\nHow many yards to the end zone?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: level.numberMax }),
        choiceType: 'number',
        explain: `The end zone is at 0 on the opponent side. ${ydLabel(p.newYd)} means ${correct} yards to go.`,
      };
    },
  },
  {
    id: 'yards-to-endzone-own',
    rating: 5,
    weight: 2,
    canUse: (s, p, level) => !p.isTouchdown && p.newYd <= 50 && fitsLevelNumber(100 - p.newYd, level),
    build: (s, p, level) => {
      const correct = 100 - p.newYd;
      return {
        q: `You're on ${ydLabel(p.newYd)}.\nHow many yards to the end zone?`,
        correct,
        choices: makeNumericChoices(correct, level, { min: 1, max: level.numberMax }),
        choiceType: 'number',
        explain: `From ${ydLabel(p.newYd)} you still have ${correct} yards to the end zone.`,
      };
    },
  },
  {
    id: 'what-happened',
    rating: 2,
    weight: 1,
    canUse: (s, p, level) => {
      if (level.key === 'warmup') return false;
      if (level.key === 'rookie') return (p.isTouchdown || p.gotFirstDown) && s.down <= 2;
      return true;
    },
    build: (s, p) => {
      const correct = playResult(p);
      return {
        q: `It's ${downDistanceLabel(s.down, s.ytg)} from ${ydLabel(p.oldYd)}. You gain ${yds(p.gain)}.\nWhat happened?`,
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

function buildPlay(s) {
  const level = getCurrentLevel();
  const maxG = Math.min(level.gRange[1], 100 - s.yd);
  const minG = Math.min(level.gRange[0], maxG);
  const gain = Math.max(1, Math.floor(Math.random() * (maxG - minG + 1)) + minG);
  const play = makePlaySnapshot(s, gain);
  const question = pickQuestion(s, play, level);
  return { ...play, ...question };
}

// -- Field --------------------------------------------------------------------
function buildField() {
  const fw = document.getElementById('field-wrap');
  fw.querySelectorAll('.grass,.yline,.ylabel').forEach(e => e.remove());
  [0, 20, 40, 60, 80].forEach(y => {
    const d = document.createElement('div');
    d.className = 'grass';
    d.style.left = yardToPct(y) + '%';
    d.style.width = (yardToPct(10) - EZ) + '%';
    fw.appendChild(d);
  });
  [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach(y => {
    const ln = document.createElement('div');
    ln.className = 'yline'; ln.style.left = yardToPct(y) + '%';
    fw.appendChild(ln);
    const lb = document.createElement('div');
    lb.className = 'ylabel'; lb.style.left = yardToPct(y) + '%';
    lb.textContent = y <= 50 ? y : 100 - y;
    fw.appendChild(lb);
  });
}

function updateField(animated) {
  const ball = document.getElementById('ball');
  const fdl = document.getElementById('fd-line');
  if (!animated) {
    ball.style.transition = 'none'; fdl.style.transition = 'none';
    requestAnimationFrame(() => { ball.style.transition = ''; fdl.style.transition = ''; });
  }
  ball.style.left = (yardToPct(state.animYd) - 2.2) + '%';
  fdl.style.left = yardToPct(Math.min(state.fdYd, 100)) + '%';
}

function updateStatus() {
  const level = currentLevelKey ? getCurrentLevel().label : 'Pick Level';
  document.getElementById('s-down').textContent = downDistanceLabel(state.down, state.ytg);
  document.getElementById('s-yd').textContent = ydLabel(state.yd, true);
  document.getElementById('s-plays').textContent = `${state.plays} / 10`;
  document.getElementById('s-level').textContent = level;
}

function setFeedback(t) { document.getElementById('feedback').textContent = t; }

function renderButtons() {
  [0, 1, 2].forEach(i => {
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
    b.style.fontSize = state.choiceType === 'number' ? '36px' : state.choiceType === 'down' ? '30px' : '22px';
  });
}

// -- Play flow ----------------------------------------------------------------
function startPlay() {
  if (!currentLevelKey) { showDifficultyPicker(); return; }
  if (state.plays >= 10 || state.tds >= 2) { showEnd(); return; }
  const p = buildPlay(state);
  Object.assign(state, {
    g: p.gain,
    label: p.label,
    questionId: p.id,
    question: p.q,
    correct: p.correct,
    choices: p.choices,
    choiceType: p.choiceType || 'number',
    explain: p.explain,
    play: p,
    phase: 'question',
  });
  document.getElementById('play-label').innerHTML = `${state.label} for <span>${yds(state.g)}!</span>`;
  document.getElementById('question').textContent = state.question;
  setFeedback('');
  renderButtons();
  setTimeout(() => {
    state.animYd = Math.min(state.yd + state.g, 100);
    updateField(true);
  }, 200);
}

function handleAnswer(idx) {
  if (state.phase !== 'question') return;
  const btn = document.getElementById('b' + idx);
  if (!btn || btn.disabled || btn.classList.contains('hidden')) return;
  const val = state.choices[idx];

  if (val !== state.correct) {
    btn.classList.add('wrong'); btn.disabled = true;
    setFeedback(state.explain || 'Try again!');
    setTimeout(() => { btn.classList.remove('wrong'); }, 700);
    return;
  }

  [0, 1, 2].forEach(i => document.getElementById('b' + i).disabled = true);
  state.phase = 'feedback';
  state.plays++;
  const newYd = Math.min(state.yd + state.g, 100);

  if (newYd >= 100) {
    state.tds++; state.yd = newYd; state.animYd = 100;
    updateField(true); updateStatus(); setFeedback('🏈 Touchdown!');
    setTimeout(() => { if (state.tds >= 2 || state.plays >= 10) showEnd(); else showTD(); }, 900);
    return;
  }

  let newDown = state.down + 1;
  let newYtg = Math.max(state.fdYd - newYd, 0);
  let newFdYd = state.fdYd;
  let fb = 'Correct! ✅';

  if (newYd >= state.fdYd) {
    newDown = 1;
    newFdYd = Math.min(newYd + 10, 100);
    newYtg = Math.max(newFdYd - newYd, 1);
    fb = '🎉 First Down!';
  } else if (newDown > 4) {
    const saved = { plays: state.plays, tds: state.tds };
    state = initBase();
    state.plays = saved.plays; state.tds = saved.tds;
    updateField(false); updateStatus(); setFeedback('Turnover on downs…');
    clearTimeout(advTimer);
    advTimer = setTimeout(() => { if (state.plays >= 10) showEnd(); else startPlay(); }, 1600);
    return;
  }

  state.yd = newYd; state.fdYd = newFdYd; state.down = newDown; state.ytg = newYtg;
  state.animYd = newYd;
  updateField(true); updateStatus(); setFeedback(fb);
  clearTimeout(advTimer);
  advTimer = setTimeout(() => { if (state.plays >= 10) showEnd(); else startPlay(); }, 1600);
}

function showDifficultyPicker() {
  clearTimeout(advTimer);
  document.getElementById('ov-end').classList.remove('show');
  document.getElementById('ov-td').classList.remove('show');
  document.getElementById('ov-diff').classList.add('show');
  state.phase = 'picker';
}

function pickLevel(key) {
  if (!LEVELS[key]) return;
  clearTimeout(advTimer);
  currentLevelKey = key;
  document.getElementById('ov-diff').classList.remove('show');
  document.getElementById('ov-end').classList.remove('show');
  document.getElementById('ov-td').classList.remove('show');
  state = initBase();
  updateField(false); updateStatus(); startPlay();
}

function showTD() {
  document.getElementById('ov-td-sub').textContent =
    `${state.tds} touchdown${state.tds > 1 ? 's' : ''}! Keep going!`;
  document.getElementById('ov-td').classList.add('show');
}

function afterTouchdown() {
  document.getElementById('ov-td').classList.remove('show');
  const saved = { plays: state.plays, tds: state.tds };
  state = initBase();
  state.plays = saved.plays; state.tds = saved.tds;
  updateField(false); updateStatus(); startPlay();
}

function showEnd() { document.getElementById('ov-end').classList.add('show'); }

function restart() {
  currentLevelKey = null;
  state = initBase();
  updateField(false); updateStatus();
  showDifficultyPicker();
}

function renderGameToText() {
  const level = currentLevelKey ? getCurrentLevel().label : null;
  return JSON.stringify({
    mode: state.phase,
    level,
    down: state.down,
    ytg: state.ytg,
    yardLine: ydLabel(state.yd),
    absoluteYard: state.yd,
    firstDownLine: ydLabel(state.fdYd),
    plays: state.plays,
    touchdowns: state.tds,
    gain: state.g ?? null,
    questionId: state.questionId || null,
    question: state.question || null,
    choices: state.choices || [],
    correct: state.correct ?? null,
    explain: state.explain || null,
  });
}

window.render_game_to_text = renderGameToText;

// -- Init ---------------------------------------------------------------------
buildField();
state = initBase();
updateField(false);
updateStatus();
showDifficultyPicker();
