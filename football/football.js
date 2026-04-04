const GAME_VERSION = '1.0.5';
const EZ = 5;
function yardToPct(y) { return EZ + (y / 100) * (100 - 2 * EZ); }
const DOWN_NAMES  = ["","1st","2nd","3rd","4th"];

let state = {};
let advTimer = null;

function initBase() {
  return { yd:20, fdYd:30, down:1, ytg:10, driveStart:20, plays:0, tds:0, animYd:20 };
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function makeChoices(correct, isDown=false) {
  const set = new Set([correct]);
  let tries = 0;
  while (set.size < 3 && tries < 50) {
    const d = isDown ? Math.floor(Math.random()*3)+1 : Math.floor(Math.random()*6)+1;
    const c = correct + (Math.random()<0.5 ? d : -d);
    if (c > 0 && c !== correct && (!isDown || c <= 4)) set.add(c);
    tries++;
  }
  if (isDown) {
    const opts = [1,2,3,4].filter(x => x !== correct);
    while (set.size < 3) set.add(opts.shift());
  }
  return shuffle([...set]);
}

function ydLabel(y) { return y <= 50 ? y : 100 - y; }

function buildType1(s, g) {
  const correct = s.yd + g;
  return { q:`You're on the ${ydLabel(s.yd)} yard line and gain ${g} yards.\nWhat yard line are you on now?`,
    correct, choices:makeChoices(correct), isDown:false, fmt:v => ydLabel(v) };
}
function buildType2(s, g) {
  const newYtg = s.ytg - g, newDown = s.down + 1;
  if (Math.random() < 0.5 || newDown > 4) {
    const correct = Math.max(newYtg, 1);
    return { q:`It's ${DOWN_NAMES[s.down]} & ${s.ytg}. You gain ${g} yards.\nHow many yards left to go?`,
      correct, choices:makeChoices(correct), isDown:false, fmt:null };
  }
  return { q:`It's ${DOWN_NAMES[s.down]} & ${s.ytg}. You gain ${g} yards.\nWhat down is it now?`,
    correct:newDown, choices:makeChoices(newDown,true), isDown:true,
    fmt: v => DOWN_NAMES[v] };
}
function buildType3(s, g) {
  const newYd = s.yd + g, correct = newYd - s.driveStart;
  return { q:`Drive started at the ${ydLabel(s.driveStart)}. Now at the ${ydLabel(newYd)}.\nHow many yards gained this drive?`,
    correct, choices:makeChoices(correct), isDown:false, fmt:null };
}
function buildType4(s, g) {
  const newYd = s.yd + g, correct = 100 - newYd;
  return { q:`You're on the ${ydLabel(newYd)} yard line.\nHow many yards to the end zone?`,
    correct, choices:makeChoices(correct), isDown:false, fmt:null };
}

function buildPlay(s) {
  const maxG = Math.min(10, 100 - s.yd - 1);
  const g = Math.max(1, Math.floor(Math.random()*maxG)+1);
  const label = Math.random()<0.5 ? "Run" : "Pass";
  const avail = [1,4];
  if (g < s.ytg && s.down < 4) avail.push(2);
  if (s.yd + g > s.driveStart + 3) avail.push(3);
  const type = avail[Math.floor(Math.random()*avail.length)];
  const r = type===1 ? buildType1(s,g) : type===2 ? buildType2(s,g)
          : type===3 ? buildType3(s,g) : buildType4(s,g);
  return { g, label, question:r.q, correct:r.correct, choices:r.choices, isDown:r.isDown, fmt:r.fmt };
}

// ── Field ────────────────────────────────────────────────────────────────────
function buildField() {
  const fw = document.getElementById('field-wrap');
  fw.querySelectorAll('.grass,.yline,.ylabel').forEach(e => e.remove());
  [0,20,40,60,80].forEach(y => {
    const d = document.createElement('div');
    d.className = 'grass';
    d.style.left = yardToPct(y) + '%';
    d.style.width = (yardToPct(10) - EZ) + '%';
    fw.appendChild(d);
  });
  [10,20,30,40,50,60,70,80,90].forEach(y => {
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
  const fdl  = document.getElementById('fd-line');
  if (!animated) {
    ball.style.transition = 'none'; fdl.style.transition = 'none';
    requestAnimationFrame(() => { ball.style.transition = ''; fdl.style.transition = ''; });
  }
  ball.style.left = (yardToPct(state.animYd) - 2.2) + '%';
  fdl.style.left  = yardToPct(Math.min(state.fdYd, 100)) + '%';
}

function updateStatus() {
  document.getElementById('s-down').textContent = `${DOWN_NAMES[state.down]} & ${state.ytg}`;
  document.getElementById('s-yd').textContent   = state.yd;
  document.getElementById('s-plays').textContent = `${state.plays} / 10`;
}

function setFeedback(t) { document.getElementById('feedback').textContent = t; }

function renderButtons() {
  const fmt = state.fmt || (v => v);
  [0,1,2].forEach(i => {
    const b = document.getElementById('b'+i);
    b.textContent = fmt(state.choices[i]);
    b.disabled = false;
    b.classList.remove('wrong');
    b.style.fontSize = state.isDown ? '22px' : '36px';
  });
}

// ── Play flow ────────────────────────────────────────────────────────────────
function startPlay() {
  if (state.plays >= 10 || state.tds >= 2) { showEnd(); return; }
  const p = buildPlay(state);
  Object.assign(state, { g:p.g, label:p.label, question:p.question,
    correct:p.correct, choices:p.choices, isDown:p.isDown, fmt:p.fmt, phase:'question' });
  document.getElementById('play-label').innerHTML = `${state.label} for <span>${state.g} yards!</span>`;
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
  const btn = document.getElementById('b'+idx);
  if (btn.disabled) return;
  const val = state.choices[idx];

  if (val !== state.correct) {
    btn.classList.add('wrong'); btn.disabled = true;
    setFeedback('Try again!');
    setTimeout(() => { btn.classList.remove('wrong'); setFeedback(''); }, 700);
    return;
  }

  [0,1,2].forEach(i => document.getElementById('b'+i).disabled = true);
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
  let newYtg  = state.ytg - state.g;
  let newFdYd = state.fdYd;
  let fb = 'Correct! ✅';

  if (newYtg <= 0) {
    newDown = 1; newYtg = 10; newFdYd = Math.min(newYd + 10, 100); fb = '🎉 First Down!';
  } else if (newDown > 4) {
    state.yd = 20; state.fdYd = 30; state.down = 1;
    state.ytg = 10; state.driveStart = 20; state.animYd = 20;
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
  document.getElementById('ov-end').classList.remove('show');
  document.getElementById('ov-td').classList.remove('show');
  state = initBase();
  updateField(false); updateStatus(); startPlay();
}

// ── Init ─────────────────────────────────────────────────────────────────────
buildField();
state = initBase();
updateField(false);
updateStatus();
setTimeout(startPlay, 400);
