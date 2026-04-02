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
let audioUnlocked = false;
function unlockAudio() { if (!audioUnlocked) { audioCtx.resume(); audioUnlocked=true; } }
document.addEventListener('keydown', unlockAudio);
canvas.addEventListener('touchstart', unlockAudio);

function playPaddleSound() {
  if (!audioUnlocked) return;
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
  if (!audioUnlocked) return;
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
  if (!audioUnlocked) return;
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
function updateRipples(dt) {
  ripples=ripples.filter(r=>r.alpha>0.02);
  ripples.forEach(r=>{ r.r+=22*sc()*dt; r.alpha-=0.55*dt; r.age+=dt; });
}
function drawRipples() {
  ripples.forEach(r=>{
    ctx.save(); ctx.strokeStyle=`rgba(255,255,255,${r.alpha})`;
    ctx.lineWidth=1.5*sc();
    ctx.beginPath(); ctx.ellipse(r.x,r.y,r.r,r.r*0.4,0,0,Math.PI*2); ctx.stroke();
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
function drawSplash() {
  splashParticles.forEach(p=>{
    ctx.save(); ctx.globalAlpha=p.alpha; ctx.fillStyle='#AADDF5';
    ctx.beginPath(); ctx.arc(p.x,p.y,2.5*sc(),0,Math.PI*2); ctx.fill(); ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS UPDATE
// ═══════════════════════════════════════════════════════════════
const TURN_SPEED=2.0, ACCEL_BASE=160, ACCEL_MAX=600, ACCEL_RAMP=2.8;
const DRAG=0.88, ANGULAR_DRAG=0.80;

function update(dt, t) {
  if (gamePhase !== 'playing') return;
  waterTime=t;
  const up=isKey('ArrowUp','w','W','up');
  const down=isKey('ArrowDown','s','S','down');
  const left=isKey('ArrowLeft','a','A','left');
  const right=isKey('ArrowRight','d','D','right');
  const moving=up||down;

  holdTime = up ? Math.min(holdTime+dt,ACCEL_RAMP) : Math.max(holdTime-dt*4,0);
  holdTimeBack = down ? Math.min(holdTimeBack+dt,ACCEL_RAMP) : Math.max(holdTimeBack-dt*4,0);

  const t01=holdTime/ACCEL_RAMP, t01b=holdTimeBack/ACCEL_RAMP;
  const accel=ACCEL_BASE+(ACCEL_MAX-ACCEL_BASE)*(t01*t01);
  const accelBack=ACCEL_BASE+(ACCEL_MAX-ACCEL_BASE)*(t01b*t01b);

  if(left) kayak.vAngle-=TURN_SPEED*dt;
  if(right) kayak.vAngle+=TURN_SPEED*dt;
  if(up){ kayak.vx+=Math.cos(kayak.angle)*accel*dt; kayak.vy+=Math.sin(kayak.angle)*accel*dt; kayak.paddlePhase+=(4+t01*8)*dt; }
  if(down){ kayak.vx-=Math.cos(kayak.angle)*accelBack*dt; kayak.vy-=Math.sin(kayak.angle)*accelBack*dt; kayak.paddlePhase-=(4+t01b*8)*dt; }

  kayak.vx*=Math.pow(DRAG,dt*60); kayak.vy*=Math.pow(DRAG,dt*60);
  kayak.vAngle*=Math.pow(ANGULAR_DRAG,dt*60);
  kayak.angle+=kayak.vAngle;

  const nx=kayak.x+kayak.vx*dt, ny=kayak.y+kayak.vy*dt;
  if(isInLake(nx,kayak.y)) kayak.x=nx; else { kayak.vx*=-0.3; holdTime=0; holdTimeBack=0; }
  if(isInLake(kayak.x,ny)) kayak.y=ny; else { kayak.vy*=-0.3; holdTime=0; holdTimeBack=0; }

  const speed=Math.hypot(kayak.vx,kayak.vy);
  if(moving&&speed>15&&Math.random()<dt*(4+t01*8)) addRipple(kayak.x,kayak.y);

  const soundInt=Math.max(0.12,0.35-t01*0.2);
  if(moving&&t-lastPaddleSound>soundInt){ playPaddleSound(); lastPaddleSound=t; }

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

  updateRipples(dt); updateSplash(dt);
}
