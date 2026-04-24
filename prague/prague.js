const GAME_VERSION = '1.4.0';

// ═══════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════
const C = document.getElementById('c');
const G = C.getContext('2d');
const W = 800, H = 500;
G.imageSmoothingEnabled = true;

const SPRITES = {
  atlas: new Image(),
  variants: new Image(),
  loaded: false,
  variantsLoaded: false,
  failed: false,
  variantsFailed: false,
  src: 'assets/prague-sprite-atlas-v1.png?v=1.4.0',
  variantsSrc: 'assets/prague-sprite-atlas-v2-normalized.png?v=1.4.0',
};
SPRITES.atlas.onload = () => { SPRITES.loaded = true; };
SPRITES.atlas.onerror = () => { SPRITES.failed = true; };
SPRITES.atlas.src = SPRITES.src;
SPRITES.variants.onload = () => { SPRITES.variantsLoaded = true; };
SPRITES.variants.onerror = () => { SPRITES.variantsFailed = true; };
SPRITES.variants.src = SPRITES.variantsSrc;

// ── INPUT ─────────────────────────────────────────────────
const K = {}, JP = {};
const MOB_LABELS = {
  title: { left: '◀', jump: 'START', right: '▶' },
  charselect: { left: '◀', jump: 'RIDE', right: '▶' },
  playing: { left: '◀', jump: 'JUMP', right: '▶' },
  gameover: { left: 'PICK', jump: 'AGAIN', right: 'PICK' },
};
const MOB = {
  left: document.getElementById('bl'),
  jump: document.getElementById('jb'),
  right: document.getElementById('br'),
};
document.addEventListener('keydown', e => {
  if(!K[e.code]) JP[e.code]=true;
  K[e.code]=true;
  if(e.code==='KeyF'){
    toggleFullscreen();
    e.preventDefault();
  }
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', e => { K[e.code]=false; });
window.addEventListener('blur', () => {
  for(const k in K) K[k]=false;
  for(const k in JP) delete JP[k];
});

function mbHold(id,code){
  const b=document.getElementById(id); if(!b) return;
  const press=e=>{
    e.preventDefault();
    if(!K[code]) JP[code]=true;
    K[code]=true;
    b.classList.add('is-held');
    if(e.pointerId!==undefined && b.setPointerCapture) b.setPointerCapture(e.pointerId);
  };
  const release=e=>{
    e.preventDefault();
    K[code]=false;
    b.classList.remove('is-held');
  };
  b.addEventListener('pointerdown',press);
  b.addEventListener('pointerup',release);
  b.addEventListener('pointercancel',release);
  b.addEventListener('pointerleave',release);
  b.addEventListener('lostpointercapture',release);
  b.addEventListener('contextmenu',e=>e.preventDefault());
}
mbHold('bl','ArrowLeft'); mbHold('br','ArrowRight'); mbHold('jb','Space');

function updateMobileLabels(){
  const labels=MOB_LABELS[STATE]||MOB_LABELS.playing;
  if(MOB.left) MOB.left.textContent=labels.left;
  if(MOB.jump) MOB.jump.textContent=labels.jump;
  if(MOB.right) MOB.right.textContent=labels.right;
}

function toggleFullscreen(){
  const wrap=document.getElementById('wrap') || document.documentElement;
  if(!document.fullscreenElement){
    if(wrap.requestFullscreen) wrap.requestFullscreen().catch(()=>{});
  } else if(document.exitFullscreen){
    document.exitFullscreen().catch(()=>{});
  }
}

// ── CONSTANTS ─────────────────────────────────────────────
const ROAD_Y  = 278;   // top of road
const FLOOR_Y = 412;   // wheel ground contact
const PLAYER_X = 130;

// ── STATE ─────────────────────────────────────────────────
let STATE = 'title';
let FRAME = 0;
let score = 0, best = 0, gameSpeed = 3.5;
let spawnClock = 0, spawnGap = 88, tokenClock = 0, tokenGap = 115;
let selectedChar = 0;
let OBS = [];
let TOKENS = [];
let POPS = [];
let bigLogNext = 750 + Math.random()*450;
let bigFlash = 0;
let shakeT = 0, shakeM = 0;
let coins = 0, combo = 0;

// ── PLAYER ────────────────────────────────────────────────
const P = { x:PLAYER_X, y:FLOOR_Y, vy:0, onGround:true, inv:0, hits:0, pedal:0, lean:0 };

// ── RAIN ──────────────────────────────────────────────────
const RAIN = Array.from({length:140}, ()=>({x:Math.random()*W, y:Math.random()*H, l:9+Math.random()*10, s:6+Math.random()*5}));
function tickRain(){
  RAIN.forEach(r=>{ r.y+=r.s; r.x-=1.5; if(r.y>H||r.x<0){r.x=Math.random()*W+20;r.y=-r.l;} });
}

// ── PARALLAX ──────────────────────────────────────────────
const BGL = [{x:0,sp:.28},{x:0,sp:.55},{x:0,sp:.90}];

// ── PUDDLES ───────────────────────────────────────────────
const PUDDLES = Array.from({length:7}, ()=>({ox:Math.random()*W, w:25+Math.random()*60, a:0.28+Math.random()*0.25}));

// ══════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════
function rr(x,y,w,h,r,fill,stroke,lw){
  G.beginPath();
  G.moveTo(x+r,y); G.lineTo(x+w-r,y); G.arcTo(x+w,y,x+w,y+r,r);
  G.lineTo(x+w,y+h-r); G.arcTo(x+w,y+h,x+w-r,y+h,r);
  G.lineTo(x+r,y+h); G.arcTo(x,y+h,x,y+h-r,r);
  G.lineTo(x,y+r); G.arcTo(x,y,x+r,y,r);
  G.closePath();
  if(fill){ G.fillStyle=fill; G.fill(); }
  if(stroke){ G.strokeStyle=stroke; G.lineWidth=lw||2; G.stroke(); }
}
function pad(n){ return String(n).padStart(6,'0'); }

// ══════════════════════════════════════════════════════════
//  UPDATE
// ══════════════════════════════════════════════════════════
function update(){
  BGL.forEach(b=>b.x+=gameSpeed*b.sp);
  P.pedal+=.12*(gameSpeed/3.5);

  const ch=CHARS[selectedChar], ms=4.2*ch.moveSpd;
  if(K['ArrowLeft']||K['KeyA']){ P.x-=ms; P.lean=Math.max(P.lean-.2,-1); }
  else if(K['ArrowRight']||K['KeyD']){ P.x+=ms; P.lean=Math.min(P.lean+.2,1); }
  else P.lean*=.75;
  P.x=Math.max(50,Math.min(W-50,P.x));

  if((JP['Space']||JP['ArrowUp']||JP['KeyW'])&&P.onGround){ P.vy=ch.jumpV; P.onGround=false; }
  if(!P.onGround){ P.vy+=.75; P.y+=P.vy; if(P.y>=FLOOR_Y){P.y=FLOOR_Y;P.vy=0;P.onGround=true;} }
  if(P.inv>0) P.inv--;

  gameSpeed+=.0007;
  spawnGap=Math.max(38,88-score/90);
  score+=gameSpeed*.075;
  if(score>best) best=score;

  if(++spawnClock>=spawnGap){ spawnObs(); spawnClock=0; }
  if(++tokenClock>=tokenGap){ spawnToken(); tokenClock=0; tokenGap=95+Math.random()*80; }
  if(FRAME>=bigLogNext) spawnBigLog();
  if(bigFlash>0) bigFlash--;
  if(shakeT>0) shakeT--;

  for(let i=OBS.length-1;i>=0;i--){
    const ob=OBS[i];
    if(ob.t==='branch'||ob.t==='biglog'){
      ob.x-=gameSpeed;
      if(ob.warn>0){ ob.warn--; if(ob.warn<=0)ob.fall=true; }
      if(ob.fall&&!ob.settled){ ob.vy+=.85; ob.y+=ob.vy; if(ob.y>=ob.tY){ob.y=ob.tY;ob.fall=false;ob.settled=true;if(ob.t==='biglog'){shakeT=22;shakeM=9;}} }
      if(ob.settled||ob.y>ROAD_Y+40){ if(hitTest(ob))doHit(); }
      if(ob.x<-115) OBS.splice(i,1);
    } else {
      ob.x+=ob.vx-gameSpeed*.25;
      if(++ob.wt>55){ ob.vx=-(1.2+Math.random()*1.8); ob.wt=0; }
      const dx=Math.abs(ob.x-P.x);
      if(dx<60&&dx>32&&!ob.nm&&P.y===FLOOR_Y){
        ob.nm=true; score+=50;
        POPS.push({x:P.x-42,y:P.y-88,t:'+50 NEAR MISS!',l:60,c:'#ffff44',s:13});
      }
      if(hitTest(ob))doHit();
      if(ob.x<-72) OBS.splice(i,1);
    }
  }

  for(let i=TOKENS.length-1;i>=0;i--){
    const t=TOKENS[i];
    t.x-=gameSpeed*.88;
    t.spin+=.14;
    t.bob+=.08;
    const dx=Math.abs(t.x-P.x), dy=Math.abs(t.y-(P.y-45));
    if(dx<34 && dy<44){
      const bonus=75+combo*15;
      coins++;
      combo=Math.min(combo+1,9);
      score+=bonus;
      POPS.push({x:t.x-30,y:t.y-18,t:'+'+bonus+' Kč',l:54,c:'#ffe27a',s:14});
      TOKENS.splice(i,1);
    } else if(t.x<-36){
      combo=0;
      TOKENS.splice(i,1);
    }
  }

  for(let i=POPS.length-1;i>=0;i--){ POPS[i].y-=.85; POPS[i].l--; if(POPS[i].l<=0)POPS.splice(i,1); }
  for(const k in JP) delete JP[k];
}

// ══════════════════════════════════════════════════════════
//  RESET
// ══════════════════════════════════════════════════════════
function reset(){
  Object.assign(P,{x:PLAYER_X,y:FLOOR_Y,vy:0,onGround:true,inv:0,hits:0,pedal:0,lean:0});
  OBS=[]; TOKENS=[]; POPS=[];
  score=0; gameSpeed=3.5+Math.random()*.2;
  spawnClock=0; spawnGap=88; tokenClock=0; tokenGap=90; FRAME=0;
  bigFlash=0; bigLogNext=750+Math.random()*450;
  shakeT=0; coins=0; combo=0;
}

// ══════════════════════════════════════════════════════════
//  GAME LOOP
// ══════════════════════════════════════════════════════════
function drawFrame(){
  FRAME++;
  if(window.PragueThreeScene){
    window.PragueThreeScene.update({
      frame: FRAME,
      gameSpeed,
      state: STATE,
      playerX: P.x,
      selectedChar,
    });
  }
  G.clearRect(0,0,W,H);

  if(shakeT>0){ G.save(); G.translate((Math.random()-.5)*shakeM,(Math.random()-.5)*shakeM*.6); }

  if(STATE==='title'){
    tickRain(); BGL[0].x+=.45; BGL[1].x+=.7;
    drawTitle();
    if(JP['ArrowLeft']||JP['KeyA']) selectedChar=0;
    if(JP['ArrowRight']||JP['KeyD']) selectedChar=1;
    if(JP['Enter']||JP['Space']) STATE='charselect';
  } else if(STATE==='charselect'){
    tickRain(); drawCharSelect();
    if(JP['ArrowLeft']||JP['KeyA']) selectedChar=0;
    if(JP['ArrowRight']||JP['KeyD']) selectedChar=1;
    if(JP['Enter']||JP['Space']){ reset(); STATE='playing'; }
  } else if(STATE==='playing'){
    update(); tickRain();
    drawBG(); drawRain(); drawTokens(); drawObs(); drawPlayer(); drawHUD();
  } else {
    tickRain(); drawBG(); drawRain(); drawTokens(); drawObs(); drawPlayer(); drawGameOver();
    if(JP['Enter']||JP['Space']){ reset(); STATE='playing'; }
    if(JP['Tab']) STATE='charselect';
    if(JP['ArrowLeft']||JP['KeyA']){ selectedChar=0; STATE='charselect'; }
    if(JP['ArrowRight']||JP['KeyD']){ selectedChar=1; STATE='charselect'; }
  }

  if(shakeT>0) G.restore();
  updateMobileLabels();
  for(const k in JP) delete JP[k];
}

function loop(){
  drawFrame();
  requestAnimationFrame(loop);
}

window.advanceTime = (ms=1000/60) => {
  const frames=Math.max(1,Math.round(ms/(1000/60)));
  for(let i=0;i<frames;i++) drawFrame();
  return Promise.resolve();
};

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: 'Canvas 800x500, origin top-left, x right, y down.',
  state: STATE,
  frame: FRAME,
  score: Math.floor(score),
  best: Math.floor(best),
  speed: Number(gameSpeed.toFixed(2)),
  rider: CHARS[selectedChar]?.name,
  coins,
  combo,
  player: {
    x: Math.round(P.x),
    y: Math.round(P.y),
    vy: Number(P.vy.toFixed(2)),
    onGround: P.onGround,
    hits: P.hits,
    invulnerableFrames: P.inv,
  },
  obstacles: OBS.map(ob => ({
    type: ob.t,
    x: Math.round(ob.x),
    y: Math.round(ob.y),
    variant: ob.variant ?? null,
    warningFrames: ob.warn || 0,
    settled: !!ob.settled,
  })),
  tokens: TOKENS.map(t => ({ x: Math.round(t.x), y: Math.round(t.y), kind: t.kind })),
  sprites: {
    loaded: SPRITES.loaded,
    failed: SPRITES.failed,
    source: SPRITES.src,
    variantsLoaded: SPRITES.variantsLoaded,
    variantsFailed: SPRITES.variantsFailed,
    variantsSource: SPRITES.variantsSrc,
  },
  threeScene: window.PragueThreeScene ? window.PragueThreeScene.snapshot() : null,
});
