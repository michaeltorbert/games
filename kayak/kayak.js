const GAME_VERSION = '1.1.11';
const CANVAS_BORDER = 4;
const BOTTOM_BAR_RATIO = 0.03;

// ═══════════════════════════════════════════════════════════════
// CANVAS SETUP
// ═══════════════════════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bottomBar = document.getElementById('bottomBar');

function syncBottomBar() {
  const bandHeight = Math.max(26, Math.round(canvas.height * BOTTOM_BAR_RATIO));
  bottomBar.style.left = `${CANVAS_BORDER}px`;
  bottomBar.style.right = `${CANVAS_BORDER}px`;
  bottomBar.style.bottom = `${CANVAS_BORDER}px`;
  bottomBar.style.height = `${bandHeight}px`;
}

function setSize() {
  const maxW = Math.min(window.innerWidth - 8, 500);
  const maxH = Math.min(window.innerHeight - 8, 750);
  const ratio = 500/750;
  let w = maxW, h = maxW/ratio;
  if (h > maxH) { h = maxH; w = h*ratio; }
  canvas.width = Math.floor(w);
  canvas.height = Math.floor(h);
  syncBottomBar();
}
setSize();
window.addEventListener('resize', setSize);
const W = () => canvas.width;
const H = () => canvas.height;
const sc = () => W()/500;

// ═══════════════════════════════════════════════════════════════
// PERSISTENT STORAGE
// ═══════════════════════════════════════════════════════════════
let highScore = parseInt(localStorage.getItem('kayakAdv_hs') || '0', 10);
let totalScore = parseInt(localStorage.getItem('kayakAdv_score') || '0', 10);
let currentLevel = parseInt(localStorage.getItem('kayakAdv_level') || '0', 10);
let visitedLevels = JSON.parse(localStorage.getItem('kayakAdv_visited') || '[]');

function persist() {
  localStorage.setItem('kayakAdv_score', totalScore);
  localStorage.setItem('kayakAdv_level', currentLevel);
  localStorage.setItem('kayakAdv_visited', JSON.stringify(visitedLevels));
  if (totalScore > highScore) {
    highScore = totalScore;
    localStorage.setItem('kayakAdv_hs', highScore);
  }
  document.getElementById('highScoreDisplay').textContent = highScore;
}

// ═══════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════
const kayak = {
  x:0, y:0, angle:0, vx:0, vy:0, vAngle:0, paddlePhase:0, tilt:0,
  paddleBias:0, pivotTurn:false, strokeing:false
};
let collectibles = [];
let ripples = [];
let wakeParticles = [];
let splashParticles = [];
let waterTime = 0;
let holdTime = 0, holdTimeBack = 0;
let lastPaddleSound = 0;
let lastWakeSpawn = 0;
let gamePhase = 'playing'; // 'playing' | 'levelcomplete' | 'completing'

// ═══════════════════════════════════════════════════════════════
// LEVEL HELPERS
// ═══════════════════════════════════════════════════════════════
function getLevelDef() {
  if (currentLevel < LEVELS.length) return LEVELS[currentLevel];
  // Bonus random level
  const idx = (currentLevel - LEVELS.length) % BONUS_NAMES.length;
  return {
    name: BONUS_NAMES[idx], sub: 'Mystery Destination ✨',
    stamp: BONUS_STAMPS[idx % BONUS_STAMPS.length],
    fact: 'A surprise destination unlocked after completing all 12 stops on Sydney & Michael\'s adventure!',
    collectibles: ['💕','😘','✨','🌸','💐','🌺','🦋','⭐','💫'],
    mapDot: [0.5 + Math.random()*0.3, 0.3 + Math.random()*0.3],
    waterColor: ['#3AB8D8','#1A7890'],
    skyColor: ['#68C8F0','#A0E0FF'],
    bgColor: '#1a3a5a',
    drawScene: drawGenericBeach
  };
}

function getKayakStart() {
  if (currentLevel === 6) return [W()*0.5, H()*0.42]; // lazy river
  if (getLakePoly(currentLevel) === beachPoly(W(), H())) return [W()*0.5, H()*0.70];
  if (getLakePoly(currentLevel) === riverPoly(W(), H())) return [W()*0.3, H()*0.65];
  return [W()*0.50, H()*0.72];
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function initLevel(reset) {
  if (reset) {
    currentLevel = 0;
    totalScore = 0;
    visitedLevels = [];
    persist();
  }
  const [sx, sy] = getKayakStart();
  kayak.x = sx; kayak.y = sy;
  kayak.angle = -Math.PI/2;
  kayak.vx = 0; kayak.vy = 0; kayak.vAngle = 0; kayak.paddlePhase = 0; kayak.tilt = 0;
  kayak.paddleBias = 0; kayak.pivotTurn = false; kayak.strokeing = false;
  holdTime = 0; holdTimeBack = 0;
  ripples = []; wakeParticles = []; splashParticles = [];
  lastWakeSpawn = 0;
  gamePhase = 'playing';

  const lvl = getLevelDef();
  document.getElementById('lvlBanner').textContent =
    `🛶 Level ${currentLevel+1} · ${lvl.name}`;
  document.getElementById('colDisplay').textContent = '0';
  document.getElementById('speedDisplay').textContent = '0';
  document.getElementById('highScoreDisplay').textContent = highScore;
  document.getElementById('overlay').classList.add('hidden');

  spawnCollectibles();
}

// ═══════════════════════════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════════════════════════
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if (e.key === 'g' || e.key === 'G') {
    const el = document.getElementById('levelJump');
    const input = document.getElementById('levelJumpInput');
    el.style.display = 'block';
    input.value = '';
    input.focus();
  }
  if (e.key === 'Escape') {
    document.getElementById('levelJump').style.display = 'none';
  }
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

const touchKeys = {};
['btn-up','btn-down','btn-left','btn-right'].forEach(id => {
  const btn = document.getElementById(id);
  const dir = id.split('-')[1];
  btn.addEventListener('touchstart', e => { e.preventDefault(); touchKeys[dir]=true; btn.classList.add('pressed'); }, {passive:false});
  btn.addEventListener('touchend',   e => { e.preventDefault(); touchKeys[dir]=false; btn.classList.remove('pressed'); }, {passive:false});
  btn.addEventListener('mousedown',  () => touchKeys[dir]=true);
  btn.addEventListener('mouseup',    () => touchKeys[dir]=false);
});
function isKey(...k) { return k.some(x => keys[x] || touchKeys[x]); }

// ═══════════════════════════════════════════════════════════════
// LEVEL COMPLETE SCREEN
// ═══════════════════════════════════════════════════════════════
function showLevelComplete() {
  gamePhase = 'levelcomplete';
  playLevelCompleteSound();

  if (!visitedLevels.includes(currentLevel)) visitedLevels.push(currentLevel);
  persist();
  drawMapScreen();

  const lvl = getLevelDef();
  document.getElementById('pc-stamp').textContent = lvl.stamp;
  document.getElementById('pc-title').textContent = lvl.name;
  document.getElementById('pc-sub').textContent = lvl.sub;
  document.getElementById('pc-fact').textContent = lvl.fact;

  const nextLvl = currentLevel + 1;
  const nextBtn = document.getElementById('nextLvlBtn');
  if (nextLvl < LEVELS.length) {
    nextBtn.textContent = `Next: ${LEVELS[nextLvl].name} →`;
  } else {
    nextBtn.textContent = `Bonus Round! ✨ →`;
  }

  document.getElementById('overlay').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════
function render(t) {
  const w=W(), h=H();
  ctx.clearRect(0,0,w,h);
  const lvl=getLevelDef();
  lvl.drawScene(w,h,t);
  drawWake(); drawRipples(); drawSplash();
  drawCollectibles(t);
  drawKayak(
    kayak.x,
    kayak.y,
    kayak.angle,
    kayak.paddlePhase,
    kayak.tilt,
    kayak.paddleBias,
    kayak.pivotTurn,
    kayak.strokeing
  );
}

// ═══════════════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════════════
let lastTime=null;
function loop(ts) {
  const t=ts/1000;
  const dt=lastTime===null?0.016:Math.min(t-lastTime,0.05);
  lastTime=t;
  update(dt,t);
  render(t);
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════════
// BUTTON WIRING
// ═══════════════════════════════════════════════════════════════
document.getElementById('newGameBtn').addEventListener('click', () => initLevel(true));
document.getElementById('nextLvlBtn').addEventListener('click', () => {
  currentLevel++;
  persist();
  initLevel(false);
});
document.getElementById('replayBtn').addEventListener('click', () => initLevel(false));
