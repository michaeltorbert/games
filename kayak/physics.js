// ═══════════════════════════════════════════════════════════════
// WATER AREAS — each level defines its own lake polygon
// ═══════════════════════════════════════════════════════════════
function defaultLakePoly(w, h) {
  return [
    [w*0.07, h*0.38+h*0.06], [w*0.22, h*0.38+h*0.01],
    [w*0.50, h*0.38],        [w*0.78, h*0.38+h*0.01],
    [w*0.93, h*0.38+h*0.06],[w*0.97, h*0.60],
    [w*0.97, h*0.97],        [w*0.03, h*0.97],
    [w*0.03, h*0.60]
  ];
}
function riverPoly(w, h) {
  return [
    [w*0.0,  h*0.38], [w*1.0, h*0.35],
    [w*1.0,  h*0.97], [w*0.0, h*0.97]
  ];
}
function beachPoly(w, h) {
  return [
    [w*0.0, h*0.45], [w*1.0, h*0.42],
    [w*1.0, h*0.97], [w*0.0, h*0.97]
  ];
}
function lazyRiverPoly(w, h) {
  return [
    [w*0.05,h*0.30],[w*0.95,h*0.32],[w*0.95,h*0.55],
    [w*0.60,h*0.60],[w*0.60,h*0.75],[w*0.95,h*0.78],
    [w*0.95,h*0.97],[w*0.05,h*0.97],[w*0.05,h*0.72],
    [w*0.40,h*0.68],[w*0.40,h*0.52],[w*0.05,h*0.50]
  ];
}

function getLakePoly(levelIdx) {
  const w = W(), h = H();
  if (levelIdx === 6) return lazyRiverPoly(w, h);
  if (levelIdx === 2 || levelIdx === 5 || levelIdx === 7 || levelIdx === 8 || levelIdx === 10) return beachPoly(w, h);
  if (levelIdx === 3 || levelIdx === 9 || levelIdx === 11) return riverPoly(w, h);
  return defaultLakePoly(w, h);
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
    const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
    if (((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function isInLake(x, y) { return pointInPoly(x, y, getLakePoly(currentLevel)); }

// ═══════════════════════════════════════════════════════════════
// COLLECTIBLES
// ═══════════════════════════════════════════════════════════════
function spawnCollectibles() {
  collectibles = [];
  const poly = getLakePoly(currentLevel);
  const lvl = getLevelDef();
  const types = lvl.collectibles;
  let attempts = 0;
  while (collectibles.length < 9 && attempts < 600) {
    attempts++;
    const lx = W()*(0.06 + Math.random()*0.88);
    const ly = H()*(0.35 + Math.random()*0.60);
    if (pointInPoly(lx, ly, poly) && Math.hypot(lx-kayak.x, ly-kayak.y) > W()*0.12) {
      collectibles.push({
        x: lx, y: ly,
        type: types[Math.floor(Math.random()*types.length)],
        bob: Math.random()*Math.PI*2,
        scale: 0.85 + Math.random()*0.3,
        collected: false, fadeOut: 0
      });
    }
  }
  document.getElementById('colTotal').textContent = collectibles.length;
  document.getElementById('colDisplay').textContent = 0;
}

// ═══════════════════════════════════════════════════════════════
// AUDIO
// ═══════════════════════════════════════════════════════════════
const audioCtx = new (window.AudioContext||window.webkitAudioContext)();
let _audioUnlocked = audioCtx.state === 'running';
let _audioUnlockPromise = null;
function primeAudioContext() {
  const buf = audioCtx.createBuffer(1, 1, 22050);
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start(0);
}
function unlockAudio(fromGesture) {
  if (audioCtx.state === 'running') {
    _audioUnlocked = true;
    return Promise.resolve(true);
  }
  if (_audioUnlockPromise) return _audioUnlockPromise;
  if (fromGesture) {
    try {
      primeAudioContext();
    } catch (e) {}
  }
  _audioUnlockPromise = audioCtx.resume()
    .then(() => {
      _audioUnlocked = audioCtx.state === 'running';
      return _audioUnlocked;
    })
    .catch(() => false)
    .finally(() => { _audioUnlockPromise = null; });
  return _audioUnlockPromise;
}
document.addEventListener('keydown', unlockAudio);
document.addEventListener('mousedown', unlockAudio);
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('touchstart', unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _audioUnlocked && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
});

function canPlayAudio() {
  if (audioCtx.state === 'running') {
    _audioUnlocked = true;
    return true;
  }
  unlockAudio();
  return _audioUnlocked || _audioUnlockPromise !== null;
}

function playPaddleSound() {
  if (!canPlayAudio()) return;
  try {
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.setValueAtTime(180+Math.random()*60, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime+0.18);
    g.gain.setValueAtTime(0.07, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.18);
    o.start(); o.stop(audioCtx.currentTime+0.18);
  } catch(e){}
}
function playCollectSound() {
  if (!canPlayAudio()) return;
  try {
    [523,659,784,1047].forEach((freq,i)=>{
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0, audioCtx.currentTime+i*0.07);
      g.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime+i*0.07+0.02);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+i*0.07+0.2);
      o.start(audioCtx.currentTime+i*0.07); o.stop(audioCtx.currentTime+i*0.07+0.22);
    });
  } catch(e){}
}
function playLevelCompleteSound() {
  if (!canPlayAudio()) return;
  try {
    [392,494,587,784,988].forEach((freq,i)=>{
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type='sine'; o.frequency.value=freq;
      g.gain.setValueAtTime(0, audioCtx.currentTime+i*0.12);
      g.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime+i*0.12+0.04);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+i*0.12+0.35);
      o.start(audioCtx.currentTime+i*0.12); o.stop(audioCtx.currentTime+i*0.12+0.4);
    });
  } catch(e){}
}

// ═══════════════════════════════════════════════════════════════
// RIPPLES & SPLASH
// ═══════════════════════════════════════════════════════════════
function addRipple(x,y) { ripples.push({x,y,r:0,alpha:0.55,age:0}); }
function kayakLocalPoint(localX, localY) {
  const a = kayak.angle + Math.PI/2;
  return {
    x: kayak.x + localX*Math.cos(a) - localY*Math.sin(a),
    y: kayak.y + localX*Math.sin(a) + localY*Math.cos(a)
  };
}
function addWakeParticle(x, y, heading, curve, size, life, alpha) {
  wakeParticles.push({ x, y, heading, curve, size, life, alpha, age:0 });
}
function addWake(speed01, t) {
  if (t - lastWakeSpawn < Math.max(0.055, 0.14 - speed01*0.06)) return;
  lastWakeSpawn = t;
  const s = sc();
  const baseCurve = -kayak.vAngle * (0.55 + speed01*0.45);
  const sternY = 34*s;
  [-1, 1].forEach(side => {
    const wakePoint = kayakLocalPoint(side*9*s, sternY);
    addWakeParticle(
      wakePoint.x,
      wakePoint.y,
      kayak.angle + Math.PI/2 + side*0.08,
      baseCurve + side*kayak.vAngle*0.18,
      (5.5 + speed01*5.5) * s,
      0.45 + speed01*0.35,
      0.12 + speed01*0.10
    );
  });
}
function updateWake(dt) {
  wakeParticles = wakeParticles.filter(p => p.alpha > 0.015);
  wakeParticles.forEach(p => {
    p.age += dt;
    p.heading += p.curve * dt;
    p.size += 14*sc()*dt;
    p.alpha -= dt / p.life;
  });
}
function updateRipples(dt) {
  ripples=ripples.filter(r=>r.alpha>0.02);
  ripples.forEach(r=>{ r.r+=22*sc()*dt; r.alpha-=0.55*dt; r.age+=dt; });
}
function drawRipples() {
  ripples.forEach(r=>{
    const rx = Math.max(0, r.r);
    const ry = Math.max(0, r.r * 0.4);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return;
    ctx.save(); ctx.strokeStyle=`rgba(255,255,255,${r.alpha})`;
    ctx.lineWidth=1.5*sc();
    ctx.beginPath(); ctx.ellipse(r.x,r.y,rx,ry,0,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  });
}
function addSplash(x,y) {
  for(let i=0;i<6;i++){
    const a=Math.random()*Math.PI*2;
    splashParticles.push({x,y,vx:Math.cos(a)*(20+Math.random()*35)*sc(),vy:Math.sin(a)*(20+Math.random()*35)*sc()-18*sc(),alpha:1,life:0.5+Math.random()*0.3});
  }
}
function updateSplash(dt) {
  splashParticles=splashParticles.filter(p=>p.alpha>0.05);
  splashParticles.forEach(p=>{ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=55*sc()*dt; p.alpha-=dt/p.life; });
}
function addPaddleSplash(side, pivotTurn, speed01) {
  const s = sc();
  const sideDir = side === 0 ? 1 : side;
  const splashPoints = [-18*s, 2*s];
  const sideX = Math.cos(kayak.angle + Math.PI/2);
  const sideY = Math.sin(kayak.angle + Math.PI/2);
  const forwardX = Math.cos(kayak.angle);
  const forwardY = Math.sin(kayak.angle);
  splashPoints.forEach(localY => {
    const point = kayakLocalPoint(sideDir*(pivotTurn ? 28*s : 24*s), localY);
    const count = pivotTurn ? 6 : 4;
    for (let i=0; i<count; i++) {
      const spread = (Math.random()-0.5) * (pivotTurn ? 0.8 : 0.55);
      const speedBoost = (22 + Math.random()*24 + speed01*18) * s;
      splashParticles.push({
        x: point.x,
        y: point.y,
        vx: sideX * sideDir * speedBoost + forwardX * (6*s + spread*10*s),
        vy: sideY * sideDir * speedBoost + forwardY * (8*s + spread*10*s) - (12 + Math.random()*18 + speed01*8) * s,
        alpha: 0.95,
        life: 0.28 + Math.random()*0.18
      });
    }
    addRipple(point.x, point.y);
  });
}
function drawSplash() {
  splashParticles.forEach(p=>{
    ctx.save(); ctx.globalAlpha=p.alpha; ctx.fillStyle='#AADDF5';
    ctx.beginPath(); ctx.arc(p.x,p.y,2.5*sc(),0,Math.PI*2); ctx.fill(); ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS UPDATE
// ═══════════════════════════════════════════════════════════════
const IOS_LEGACY_TURN_SPEED=2.0, IOS_LEGACY_ANGULAR_DRAG=0.80;
const TURN_BASE_ACCEL=1.18, TURN_SPEED_ACCEL=5.00, TURN_SPEED_REF=220;
const COAST_TURN_FACTOR_SLOW=0.90, COAST_TURN_FACTOR_FAST=0.52;
const REVERSE_TURN_FACTOR=0.80, MAX_TURN_RATE=1.60;
const MAX_TILT=0.20, TILT_RESPONSE=8.0;
const ACCEL_BASE=180, ACCEL_MAX=680, ACCEL_RAMP=2.6;
const PADDLE_DRAG=0.89, COAST_DRAG=0.982, ANGULAR_DRAG=0.955;
const SPEED_DISPLAY_SCALE=0.1;

function update(dt, t) {
  if (gamePhase !== 'playing') return;
  waterTime=t;
  const up=isKey('ArrowUp','w','W','up');
  const down=isKey('ArrowDown','s','S','down');
  const left=isKey('ArrowLeft','a','A','left');
  const right=isKey('ArrowRight','d','D','right');
  const turnInput=(right?1:0)-(left?1:0);
  const paddling=up||down;

  holdTime = up ? Math.min(holdTime+dt,ACCEL_RAMP) : Math.max(holdTime-dt*4,0);
  holdTimeBack = down ? Math.min(holdTimeBack+dt,ACCEL_RAMP) : Math.max(holdTimeBack-dt*4,0);

  const t01=holdTime/ACCEL_RAMP, t01b=holdTimeBack/ACCEL_RAMP;
  const accel=ACCEL_BASE+(ACCEL_MAX-ACCEL_BASE)*(t01*t01);
  const accelBack=ACCEL_BASE+(ACCEL_MAX-ACCEL_BASE)*(t01b*t01b);

  if(up){ kayak.vx+=Math.cos(kayak.angle)*accel*dt; kayak.vy+=Math.sin(kayak.angle)*accel*dt; kayak.paddlePhase+=(4+t01*8)*dt; }
  if(down){ kayak.vx-=Math.cos(kayak.angle)*accelBack*dt; kayak.vy-=Math.sin(kayak.angle)*accelBack*dt; kayak.paddlePhase-=(4+t01b*8)*dt; }

  const waterDrag=paddling ? PADDLE_DRAG : COAST_DRAG;
  kayak.vx*=Math.pow(waterDrag,dt*60); kayak.vy*=Math.pow(waterDrag,dt*60);
  const speed=Math.hypot(kayak.vx,kayak.vy);
  const speed01=Math.min(speed/TURN_SPEED_REF,1);
  const sweepTurn=!up&&turnInput!==0;
  const coastTurnFactor=COAST_TURN_FACTOR_FAST+(1-speed01)*(COAST_TURN_FACTOR_SLOW-COAST_TURN_FACTOR_FAST);
  if (speed > 16) addWake(speed01, t);
  const useLegacyIosSteering = IS_IOS_IPADOS;
  const paddleTurnFactor=up ? 1 : (down ? REVERSE_TURN_FACTOR : coastTurnFactor);
  const turnAccel=turnInput*(TURN_BASE_ACCEL+TURN_SPEED_ACCEL*speed01)*paddleTurnFactor;

  if(sweepTurn) kayak.paddlePhase+=(2.8+speed01*1.3)*dt;
  kayak.strokeing=paddling||sweepTurn;
  kayak.pivotTurn=sweepTurn&&speed<42;
  const targetPaddleBias=turnInput===0 ? 0 : (sweepTurn ? -turnInput : -turnInput*0.55);
  kayak.paddleBias+=(targetPaddleBias-kayak.paddleBias)*Math.min(1,dt*(kayak.pivotTurn?8:4.5));

  if (useLegacyIosSteering) {
    kayak.strokeing=paddling;
    kayak.pivotTurn=false;
    if(left) kayak.vAngle-=IOS_LEGACY_TURN_SPEED*dt;
    if(right) kayak.vAngle+=IOS_LEGACY_TURN_SPEED*dt;
    kayak.vAngle*=Math.pow(IOS_LEGACY_ANGULAR_DRAG,dt*60);
    kayak.angle+=kayak.vAngle;
  } else {
    kayak.vAngle+=turnAccel*dt;
    kayak.vAngle*=Math.pow(ANGULAR_DRAG,dt*60);
    kayak.vAngle=Math.max(-MAX_TURN_RATE,Math.min(MAX_TURN_RATE,kayak.vAngle));
    kayak.angle+=kayak.vAngle*dt;
  }

  const targetTilt=Math.max(
    -MAX_TILT,
    Math.min(MAX_TILT, turnInput*(0.045+speed01*0.085)+kayak.vAngle*0.055)
  );
  kayak.tilt+=(targetTilt-kayak.tilt)*Math.min(1,dt*TILT_RESPONSE);

  const nx=kayak.x+kayak.vx*dt, ny=kayak.y+kayak.vy*dt;
  if(isInLake(nx,kayak.y)) kayak.x=nx; else { kayak.vx*=-0.3; kayak.vAngle*=0.55; kayak.tilt*=0.65; holdTime=0; holdTimeBack=0; }
  if(isInLake(kayak.x,ny)) kayak.y=ny; else { kayak.vy*=-0.3; kayak.vAngle*=0.55; kayak.tilt*=0.65; holdTime=0; holdTimeBack=0; }

  document.getElementById('speedDisplay').textContent = Math.round(speed * SPEED_DISPLAY_SCALE);
  if(kayak.strokeing&&(speed>15||kayak.pivotTurn)&&Math.random()<dt*(kayak.pivotTurn?3.2:(4+t01*8))) {
    addRipple(kayak.x,kayak.y);
  }

  const soundInt=Math.max(0.12,0.35-t01*0.2);
  if(kayak.strokeing&&t-lastPaddleSound>soundInt){
    const strokeSide = Math.abs(kayak.paddleBias) > 0.2
      ? Math.sign(kayak.paddleBias)
      : (Math.sin(kayak.paddlePhase) >= 0 ? 1 : -1);
    addPaddleSplash(strokeSide, kayak.pivotTurn, speed01);
    playPaddleSound();
    lastPaddleSound=t;
  }

  let collectedCount=0;
  collectibles.forEach(c=>{
    if(c.collected){ c.fadeOut=(c.fadeOut||0)+dt*2; collectedCount++; return; }
    if(Math.hypot(c.x-kayak.x,c.y-kayak.y)<22*sc()){
      c.collected=true; c.fadeOut=0;
      totalScore++;
      collectedCount++;
      document.getElementById('colDisplay').textContent = collectedCount;
      persist();
      addSplash(c.x,c.y); playCollectSound();
    }
  });

  // Level complete when all collected
  if(collectibles.length>0 && collectibles.every(c=>c.collected) && gamePhase==='playing'){
    setTimeout(showLevelComplete, 600);
    gamePhase='completing';
  }

  updateWake(dt); updateRipples(dt); updateSplash(dt);
}
