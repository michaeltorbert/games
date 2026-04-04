// ═══════════════════════════════════════════════════════════════
// SHARED DRAWING UTILITIES
// ═══════════════════════════════════════════════════════════════
function drawSky(w, h, c1, c2, bandH=0.42) {
  const g=ctx.createLinearGradient(0,0,0,h*bandH);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h*bandH);
}
function drawCloud(x,y,r) {
  ctx.save(); ctx.fillStyle='rgba(255,253,240,0.85)';
  [[0,0,r],[-r*0.7,r*0.2,r*0.75],[r*0.7,r*0.2,r*0.75],[-r*1.3,r*0.5,r*0.6],[r*1.3,r*0.5,r*0.6],[0,r*0.45,r*0.65]]
    .forEach(([bx,by,br])=>{ ctx.beginPath(); ctx.arc(x+bx*sc(),y+by*sc(),br*sc(),0,Math.PI*2); ctx.fill(); });
  ctx.restore();
}
function drawClouds(w,h) {
  drawCloud(w*0.12,h*0.06,20); drawCloud(w*0.35,h*0.04,16);
  drawCloud(w*0.62,h*0.07,19); drawCloud(w*0.84,h*0.05,22);
}
function drawWater(w, h, poly, c1, c2, t) {
  const g=ctx.createLinearGradient(0,h*0.35,0,h);
  g.addColorStop(0,c1); g.addColorStop(1,c2);
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath(); ctx.fill();
  // shimmer lines
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath(); ctx.clip();
  ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=1.5*sc();
  for(let i=0;i<12;i++){
    const wy=h*0.40+i*h*0.055+Math.sin(t*0.9+i*0.8)*3*sc();
    ctx.beginPath(); ctx.moveTo(w*0.03,wy);
    ctx.bezierCurveTo(w*0.3,wy+Math.sin(t+i)*4*sc(),w*0.7,wy-Math.sin(t+i)*4*sc(),w*0.97,wy);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWake() {
  wakeParticles.forEach(p => {
    const age01 = Math.min(1, p.age / p.life);
    const rx = p.size * (1.15 + age01 * 0.35);
    const ry = p.size * (0.38 + age01 * 0.08);
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha) * (1 - age01 * 0.35);
    ctx.strokeStyle = 'rgba(235, 250, 255, 0.9)';
    ctx.lineWidth = Math.max(1.2*sc(), p.size * 0.10);
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      rx,
      ry,
      p.heading,
      0,
      Math.PI*2
    );
    ctx.stroke();
    ctx.restore();
  });
}

function drawKayak(x, y, angle, paddlePhase, tilt=0, paddleBias=0, pivotTurn=false, strokeing=false) {
  const s=sc();
  const clampedTilt = Math.max(-0.20, Math.min(0.20, tilt));
  const bias = Math.max(-1, Math.min(1, paddleBias));
  const frontPulse = Math.sin(paddlePhase);
  const rearPulse = Math.sin(paddlePhase + 0.65);
  const frontDrive = Math.max(0, frontPulse);
  const rearDrive = Math.max(0, rearPulse);
  const frontStroke = (frontPulse + 1) * 0.5;
  const rearStroke = (rearPulse + 1) * 0.5;
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle+Math.PI/2);
  ctx.rotate(clampedTilt * 0.18);
  ctx.transform(1, 0, clampedTilt * 1.35, 1, 0, 0);
  // shadow
  ctx.save(); ctx.translate(3*s,5*s); ctx.globalAlpha=0.22; ctx.fillStyle='#002244';
  ctx.beginPath(); ctx.ellipse(0,0,15*s,46*s,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  // hull
  ctx.fillStyle='#2A7A30'; ctx.strokeStyle='#1A5020'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.ellipse(0,0,15*s,46*s,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#E07020'; ctx.lineWidth=3*s;
  ctx.beginPath(); ctx.ellipse(0,0,11*s,42*s,0,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='#1A4520';
  ctx.beginPath(); ctx.ellipse(0,0,9*s,28*s,0,0,Math.PI*2); ctx.fill();
  // ── Sydney (front paddler) ──
  ctx.fillStyle='#F5A020'; ctx.beginPath(); ctx.ellipse(0,-18*s,6*s,7*s,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#C07010'; ctx.lineWidth=1.5*s;
  ctx.beginPath(); ctx.moveTo(-5*s,-18*s); ctx.lineTo(5*s,-18*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-18*s); ctx.lineTo(0,-12*s); ctx.stroke();
  ctx.fillStyle='#2A3A50'; ctx.beginPath(); ctx.ellipse(0,-16*s,5*s,6*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#D08050'; ctx.beginPath(); ctx.ellipse(0,-25*s,5*s,5*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#7B3F10';
  ctx.beginPath(); ctx.ellipse(1*s,-24*s,5.5*s,4.5*s,0.1,0,Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-2*s,-23*s,3*s,7*s,0.4,Math.PI*0.1,Math.PI*0.9); ctx.fill();
  ctx.beginPath(); ctx.ellipse(2*s,-23*s,3*s,7*s,-0.4,Math.PI*0.1,Math.PI*0.9); ctx.fill();
  // ── Michael (rear paddler) ──
  ctx.fillStyle='#E06820';
  ctx.beginPath(); ctx.ellipse(-5*s,10*s,4*s,10*s,0.3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5*s,10*s,4*s,10*s,-0.3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#1E2E40'; ctx.beginPath(); ctx.ellipse(0,1*s,6*s,7*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#F08018'; ctx.beginPath(); ctx.ellipse(0,0*s,5*s,6*s,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#B06010'; ctx.lineWidth=1.5*s;
  ctx.beginPath(); ctx.moveTo(-4*s,0*s); ctx.lineTo(4*s,0*s); ctx.stroke();
  ctx.fillStyle='#C07840'; ctx.beginPath(); ctx.ellipse(0,-7*s,5*s,5*s,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#3A2510';
  ctx.beginPath(); ctx.ellipse(0,-8*s,5.5*s,3.5*s,0,0,Math.PI); ctx.fill();
  // ── Paddles ──
  const frontBase = strokeing ? bias * 0.22 : bias * 0.10;
  const rearBase = strokeing ? bias * 0.28 : bias * 0.12;
  let frontRotate = frontBase + frontPulse * (0.40 - Math.abs(bias) * 0.10);
  let rearRotate = rearBase + rearPulse * (0.55 - Math.abs(bias) * 0.12);
  let frontShiftX = bias * 4*s;
  let rearShiftX = bias * 5*s;
  let frontShiftY = -18*s;
  let rearShiftY = 2*s;
  if (pivotTurn) {
    frontRotate = bias * (0.78 + frontStroke * 1.02);
    rearRotate = bias * (0.92 + rearStroke * 1.08);
    frontShiftX = bias * (10 + frontStroke * 15) * s;
    rearShiftX = bias * (12 + rearStroke * 17) * s;
    frontShiftY = (-22 + frontStroke * 8) * s;
    rearShiftY = (-1 + rearStroke * 9) * s;
  }
  // Sydney's paddle (front)
  ctx.save(); ctx.translate(frontShiftX,frontShiftY); ctx.rotate(frontRotate);
  ctx.strokeStyle='#4070D0'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.moveTo(-30*s,0); ctx.lineTo(30*s,0); ctx.stroke();
  ctx.fillStyle='#2050A0'; ctx.strokeStyle='#1A3A80'; ctx.lineWidth=1*s;
  ctx.beginPath(); ctx.ellipse(-30*s,0,9*s,4*s,-0.25,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(30*s,0,9*s,4*s,0.25,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Michael's paddle (rear)
  ctx.save(); ctx.translate(rearShiftX,rearShiftY); ctx.rotate(rearRotate);
  ctx.strokeStyle='#4070D0'; ctx.lineWidth=2.5*s;
  ctx.beginPath(); ctx.moveTo(-36*s,0); ctx.lineTo(36*s,0); ctx.stroke();
  ctx.fillStyle='#2050A0'; ctx.strokeStyle='#1A3A80'; ctx.lineWidth=1*s;
  ctx.beginPath(); ctx.ellipse(-36*s,0,11*s,5*s,-0.25,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(36*s,0,11*s,5*s,0.25,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawCollectibles(t) {
  collectibles.forEach(c=>{
    if(c.collected&&c.fadeOut>=1) return;
    const bob=Math.sin(t*1.5+c.bob)*3*sc();
    ctx.save();
    if(c.collected) ctx.globalAlpha=Math.max(0,1-c.fadeOut*3);
    ctx.font=`${Math.floor(20*sc()*c.scale)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='black';
    ctx.shadowColor='rgba(255,255,255,0.8)'; ctx.shadowBlur=6;
    ctx.fillText(c.type, c.x, c.y+bob);
    ctx.restore();
  });
}

// ═══════════════════════════════════════════════════════════════
// SCENE DRAWERS — one per level
// ═══════════════════════════════════════════════════════════════

function drawJaimeDuque(w, h, t) {
  drawSky(w,h,'#3EB0E8','#7DD4F5');
  drawClouds(w,h);
  const cx=w*0.50, base=h*0.41, s=sc();
  // Onion dome helper
  function oniondome(dx,dy,r,dh){
    ctx.beginPath();
    ctx.moveTo(dx-r*0.32,dy);
    ctx.bezierCurveTo(dx-r*1.15,dy-dh*0.28,dx-r*0.95,dy-dh*0.72,dx,dy-dh);
    ctx.bezierCurveTo(dx+r*0.95,dy-dh*0.72,dx+r*1.15,dy-dh*0.28,dx+r*0.32,dy);
    ctx.closePath(); ctx.fill();
  }
  // Minarets
  function minaret(mx,my,sc2=1){
    const ms=sc2*s;
    ctx.fillStyle='#EEDD88'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1.5*ms;
    ctx.beginPath(); ctx.rect(mx-5*ms,my-92*ms,10*ms,92*ms); ctx.fill(); ctx.stroke();
    [0.28,0.52,0.74].forEach(r=>{ ctx.fillStyle='#C8A030'; ctx.beginPath(); ctx.rect(mx-7*ms,my-92*ms*r,14*ms,3.5*ms); ctx.fill(); });
    ctx.fillStyle='#D4A830'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1.5*ms;
    oniondome(mx,my-92*ms,7*ms,18*ms); ctx.stroke();
    ctx.fillStyle='#8B6010'; ctx.beginPath(); ctx.moveTo(mx,my-112*ms); ctx.lineTo(mx-2*ms,my-110*ms); ctx.lineTo(mx+2*ms,my-110*ms); ctx.closePath(); ctx.fill();
  }
  minaret(cx-140*s,base); minaret(cx+140*s,base);
  ctx.globalAlpha=0.7; minaret(cx-96*s,base-4*s,0.85); minaret(cx+96*s,base-4*s,0.85); ctx.globalAlpha=1;
  // Platform
  ctx.fillStyle='#E8D48A'; ctx.fillRect(cx-130*s,base,260*s,12*s);
  ctx.fillStyle='#D8C478'; ctx.fillRect(cx-120*s,base-8*s,240*s,8*s);
  // Side wings
  [[cx-115*s,cx-89*s],[cx+65*s,cx+89*s]].forEach(([wx,dc],i)=>{
    ctx.fillStyle='#F2E49A'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1.5*s;
    ctx.beginPath(); ctx.rect(wx,base-36*s,52*s,36*s); ctx.fill(); ctx.stroke();
    // Two arched windows per wing
    const sign=i===0?1:-1;
    [wx+12*s, wx+30*s].forEach(ax=>{
      ctx.fillStyle='#C07838';
      ctx.beginPath(); ctx.rect(ax,base-26*s,10*s,26*s); ctx.fill();
      ctx.beginPath(); ctx.arc(ax+5*s,base-26*s,5*s,Math.PI,0); ctx.fill();
    });
    // Wing onion dome
    ctx.fillStyle='#D4A830'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1.5*s;
    oniondome(dc,base-36*s,16*s,26*s); ctx.stroke();
    ctx.fillStyle='#8B6010'; ctx.beginPath(); ctx.moveTo(dc,base-64*s); ctx.lineTo(dc-1.5*s,base-62*s); ctx.lineTo(dc+1.5*s,base-62*s); ctx.closePath(); ctx.fill();
  });
  // Main central building
  ctx.fillStyle='#F5ECA8'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.rect(cx-56*s,base-68*s,112*s,68*s); ctx.fill(); ctx.stroke();
  // Central iwan (large pointed arch doorway)
  ctx.fillStyle='#B07038';
  ctx.beginPath(); ctx.rect(cx-20*s,base-54*s,40*s,54*s); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,base-54*s,20*s,Math.PI,0); ctx.fill();
  ctx.fillStyle='rgba(60,30,5,0.35)';
  ctx.beginPath(); ctx.rect(cx-13*s,base-47*s,26*s,47*s); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,base-47*s,13*s,Math.PI,0); ctx.fill();
  // Flanking small arched niches
  [cx-40*s,cx+40*s].forEach(ax=>{
    ctx.fillStyle='#C07838';
    ctx.beginPath(); ctx.rect(ax-8*s,base-34*s,16*s,34*s); ctx.fill();
    ctx.beginPath(); ctx.arc(ax,base-34*s,8*s,Math.PI,0); ctx.fill();
  });
  // Corner chattri domes
  [cx-56*s,cx+56*s].forEach(tx=>{
    ctx.fillStyle='#D4A830'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1*s;
    oniondome(tx,base-68*s,8*s,16*s); ctx.stroke();
    ctx.fillStyle='#8B6010'; ctx.beginPath(); ctx.moveTo(tx,base-85*s); ctx.lineTo(tx-1.5*s,base-84*s); ctx.lineTo(tx+1.5*s,base-84*s); ctx.closePath(); ctx.fill();
  });
  // Main onion dome: drum + dome
  ctx.fillStyle='#EEDD88'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1.5*s;
  ctx.beginPath(); ctx.rect(cx-12*s,base-78*s,24*s,10*s); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#D4A830';
  oniondome(cx,base-78*s,38*s,58*s);
  ctx.strokeStyle='#C8A030'; ctx.lineWidth=2*s; ctx.stroke();
  // Dome highlight
  ctx.fillStyle='rgba(255,255,210,0.30)';
  ctx.beginPath();
  ctx.moveTo(cx-8*s,base-82*s);
  ctx.bezierCurveTo(cx-20*s,base-96*s,cx-18*s,base-120*s,cx-5*s,base-130*s);
  ctx.bezierCurveTo(cx-3*s,base-122*s,cx-10*s,base-100*s,cx-5*s,base-84*s);
  ctx.closePath(); ctx.fill();
  // Dome finial
  ctx.fillStyle='#8B6010'; ctx.beginPath(); ctx.moveTo(cx,base-142*s); ctx.lineTo(cx-3*s,base-136*s); ctx.lineTo(cx+3*s,base-136*s); ctx.closePath(); ctx.fill();
  // Grass
  ctx.fillStyle='#4A9B45'; ctx.fillRect(0,h*0.395,w,h*0.022);
  // Palm trees lining both shores
  function palmJ(px,py,sc2=1){
    const ps=sc2*s;
    ctx.fillStyle='#5A3A10'; ctx.beginPath(); ctx.rect(px-3*ps,py-44*ps,6*ps,44*ps); ctx.fill();
    [[-26,-4],[26,-4],[-15,-19],[15,-19],[0,-25]].forEach(([fx,fy])=>{
      ctx.fillStyle='#2A8030'; ctx.beginPath();
      ctx.ellipse(px+fx*ps,py+fy*ps,17*ps,6*ps,Math.atan2(fy,fx),0,Math.PI*2); ctx.fill();
    });
  }
  [[w*0.05,h*0.43],[w*0.12,h*0.415,0.85],[w*0.19,h*0.42,0.9]].forEach(([px,py,sc2=1])=>palmJ(px,py,sc2));
  [[w*0.95,h*0.43],[w*0.88,h*0.415,0.85],[w*0.81,h*0.42,0.9]].forEach(([px,py,sc2=1])=>palmJ(px,py,sc2));
  const poly=getLakePoly(0);
  drawWater(w,h,poly,'#3AA8D8','#1A6090',t);
  // Golden reflection
  ctx.save();
  ctx.beginPath(); ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath(); ctx.clip();
  const rg=ctx.createLinearGradient(w*0.3,h*0.40,w*0.7,h*0.58);
  rg.addColorStop(0,'rgba(212,168,48,0)'); rg.addColorStop(0.5,'rgba(212,168,48,0.18)'); rg.addColorStop(1,'rgba(212,168,48,0)');
  ctx.fillStyle=rg; ctx.fillRect(w*0.25,h*0.40,w*0.5,h*0.20);
  ctx.restore();
}

function drawSimonBolivar(w, h, t) {
  drawSky(w,h,'#5AB8E8','#8ADAF8');
  drawClouds(w,h);
  const s=sc();
  ctx.fillStyle='#6080A0';
  ctx.beginPath(); ctx.moveTo(0,h*0.36); ctx.lineTo(w*0.2,h*0.22); ctx.lineTo(w*0.35,h*0.30);
  ctx.lineTo(w*0.5,h*0.18); ctx.lineTo(w*0.65,h*0.27); ctx.lineTo(w*0.8,h*0.20); ctx.lineTo(w,h*0.33); ctx.lineTo(w,h*0.40); ctx.lineTo(0,h*0.40); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#7090B0';
  ctx.beginPath(); ctx.moveTo(0,h*0.38); ctx.lineTo(w*0.15,h*0.28); ctx.lineTo(w*0.3,h*0.34);
  ctx.lineTo(w*0.45,h*0.24); ctx.lineTo(w*0.6,h*0.30); ctx.lineTo(w*0.75,h*0.26); ctx.lineTo(w,h*0.35); ctx.lineTo(w,h*0.42); ctx.lineTo(0,h*0.42); ctx.closePath(); ctx.fill();
  ctx.fillStyle='white'; ctx.globalAlpha=0.7;
  ctx.beginPath(); ctx.moveTo(w*0.5,h*0.18); ctx.lineTo(w*0.47,h*0.24); ctx.lineTo(w*0.53,h*0.24); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w*0.8,h*0.20); ctx.lineTo(w*0.78,h*0.25); ctx.lineTo(w*0.82,h*0.25); ctx.closePath(); ctx.fill();
  ctx.globalAlpha=1;
  ctx.fillStyle='#E8E0D0';
  ctx.beginPath(); ctx.rect(w*0.05,h*0.35,w*0.10,h*0.07); ctx.fill();
  ctx.fillStyle='#C84040';
  ctx.beginPath(); ctx.moveTo(w*0.05,h*0.35); ctx.lineTo(w*0.10,h*0.29); ctx.lineTo(w*0.15,h*0.35); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#4A9B45'; ctx.fillRect(0,h*0.39,w,h*0.04);
  ctx.fillStyle='#3D7B2A'; ctx.beginPath(); ctx.ellipse(w*0.12,h*0.41,w*0.09,h*0.02,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#3D7B2A'; ctx.beginPath(); ctx.ellipse(w*0.85,h*0.41,w*0.10,h*0.02,0,0,Math.PI*2); ctx.fill();
  const poly=getLakePoly(1);
  drawWater(w,h,poly,'#4A9EC8','#1A5A80',t);
}

function drawCartagena(w, h, t) {
  const sg=ctx.createLinearGradient(0,0,0,h*0.45);
  sg.addColorStop(0,'#FF7020'); sg.addColorStop(0.5,'#FFB040'); sg.addColorStop(1,'#FFD880');
  ctx.fillStyle=sg; ctx.fillRect(0,0,w,h*0.45);
  const s=sc();
  ctx.fillStyle='#FFE040'; ctx.globalAlpha=0.9;
  ctx.beginPath(); ctx.arc(w*0.75,h*0.12,22*s,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=0.3; ctx.beginPath(); ctx.arc(w*0.75,h*0.12,32*s,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;
  ctx.fillStyle='#8B6020';
  ctx.beginPath(); ctx.rect(0,h*0.32,w,h*0.10); ctx.fill();
  ctx.fillStyle='#7A5010';
  for(let i=0;i<12;i++){
    ctx.beginPath(); ctx.rect(w*(i/12),h*0.29,w*0.06,h*0.04); ctx.fill();
  }
  function palm(px,py){
    ctx.fillStyle='#3D2A10'; ctx.beginPath(); ctx.rect(px-3*s,py-30*s,6*s,30*s); ctx.fill();
    [[-25,-8],[25,-8],[-15,-20],[15,-20],[0,-25]].forEach(([fx,fy])=>{
      ctx.fillStyle='#2A7020'; ctx.beginPath();
      ctx.ellipse(px+fx*s,py+fy*s,16*s,6*s,Math.atan2(fy,fx),0,Math.PI*2); ctx.fill();
    });
  }
  palm(w*0.12,h*0.42); palm(w*0.88,h*0.40); palm(w*0.30,h*0.41);
  const sandG=ctx.createLinearGradient(0,h*0.40,0,h*0.48);
  sandG.addColorStop(0,'#E8C880'); sandG.addColorStop(1,'#D8B860');
  ctx.fillStyle=sandG; ctx.fillRect(0,h*0.40,w,h*0.08);
  const poly=getLakePoly(2);
  drawWater(w,h,poly,'#20C8E0','#0888A8',t);
}

function drawVltava(w, h, t) {
  const s=sc();

  // 1. DUSK SKY
  const sg=ctx.createLinearGradient(0,0,0,h*0.42);
  sg.addColorStop(0,'#2A1E40'); sg.addColorStop(0.40,'#B85530');
  sg.addColorStop(0.75,'#E8A040'); sg.addColorStop(1,'#F8D880');
  ctx.fillStyle=sg; ctx.fillRect(0,0,w,h*0.42);
  ctx.fillStyle='rgba(255,220,80,0.88)';
  ctx.beginPath(); ctx.arc(w*0.76,h*0.09,16*s,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,200,60,0.25)';
  ctx.beginPath(); ctx.arc(w*0.76,h*0.09,26*s,0,Math.PI*2); ctx.fill();

  // 2. HRADCANY HILL
  ctx.fillStyle='#2E2C20';
  ctx.beginPath();
  ctx.moveTo(w*0.42,h*0.42); ctx.lineTo(w*0.50,h*0.28); ctx.lineTo(w*0.58,h*0.20);
  ctx.lineTo(w*0.68,h*0.17); ctx.lineTo(w*0.80,h*0.20); ctx.lineTo(w*0.88,h*0.25);
  ctx.lineTo(w*1.00,h*0.26); ctx.lineTo(w*1.00,h*0.42); ctx.closePath(); ctx.fill();

  // 3. PRAGUE CASTLE + ST. VITUS CATHEDRAL
  ctx.fillStyle='#484658'; ctx.fillRect(w*0.50,h*0.22,w*0.26,h*0.15);
  ctx.fillStyle='#383648';
  [[0.52,0.22,5,8],[0.60,0.20,5,8],[0.70,0.21,5,8],[0.74,0.22,5,8]].forEach(([fx,fy,rw,rh])=>{
    ctx.fillRect(w*fx-rw*s,h*fy-rh*s,rw*2*s,rh*s);
    ctx.beginPath(); ctx.moveTo(w*fx,h*fy-rh*s-6*s); ctx.lineTo(w*fx-rw*s,h*fy-rh*s); ctx.lineTo(w*fx+rw*s,h*fy-rh*s); ctx.closePath(); ctx.fill();
  });
  ctx.fillStyle='#3A3848'; ctx.fillRect(w*0.59,h*0.12,w*0.10,h*0.10);
  // Left Gothic tower
  ctx.fillRect(w*0.59,h*0.08,w*0.025,h*0.12);
  ctx.beginPath(); ctx.moveTo(w*0.6025,h*0.04); ctx.lineTo(w*0.59,h*0.08); ctx.lineTo(w*0.615,h*0.08); ctx.closePath(); ctx.fill();
  // Right Gothic tower
  ctx.fillRect(w*0.665,h*0.07,w*0.025,h*0.13);
  ctx.beginPath(); ctx.moveTo(w*0.6775,h*0.03); ctx.lineTo(w*0.665,h*0.07); ctx.lineTo(w*0.69,h*0.07); ctx.closePath(); ctx.fill();
  // Main central spire
  ctx.fillStyle='#28263A';
  ctx.beginPath(); ctx.moveTo(w*0.638,h*0.005); ctx.lineTo(w*0.626,h*0.10); ctx.lineTo(w*0.650,h*0.10); ctx.closePath(); ctx.fill();

  // 4. OLD TOWN BUILDINGS
  const bldgs=[
    [0.00,0.25,0.07,'#7A6858','#C04830',0],[0.06,0.20,0.09,'#B09878','#D06020',0],
    [0.14,0.27,0.06,'#A08870','#983818',1],[0.19,0.17,0.08,'#C0A880','#C85028',0],
    [0.26,0.23,0.07,'#9A8870','#B84828',1],[0.32,0.15,0.08,'#D0B888','#E07828',0],
    [0.39,0.22,0.06,'#B09878','#B86030',1],[0.44,0.26,0.06,'#9A8868','#A84020',0],
  ];
  bldgs.forEach(([xf,yf,wf,wall,roof,rtype])=>{
    const bx=w*xf, btop=h*yf, bw=w*wf, bbot=h*0.335;
    ctx.fillStyle=wall; ctx.fillRect(bx,btop,bw,bbot-btop);
    ctx.fillStyle='rgba(255,200,100,0.65)';
    const cols=Math.max(2,Math.floor(bw/(10*s))), rows=Math.max(2,Math.floor((bbot-btop)/(16*s)));
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++)
      ctx.fillRect(bx+(c+0.5)*(bw/cols)-3*s, btop+(r+0.5)*((bbot-btop)/rows)-4*s, 6*s, 8*s);
    ctx.fillStyle=roof;
    if(rtype===0){
      ctx.beginPath(); ctx.moveTo(bx,btop); ctx.lineTo(bx+bw*0.5,btop-h*0.045); ctx.lineTo(bx+bw,btop); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillRect(bx,btop-h*0.012,bw,h*0.012);
    }
  });

  // 5. OLD TOWN BRIDGE TOWER (left gate)
  const ltx=w*0.09;
  ctx.fillStyle='#5A5448'; ctx.fillRect(ltx-16*s,h*0.215,32*s,h*0.12);
  ctx.fillStyle='#484038';
  ctx.beginPath(); ctx.moveTo(ltx,h*0.130); ctx.lineTo(ltx-16*s,h*0.215); ctx.lineTo(ltx+16*s,h*0.215); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#3A3430';
  for(let i=0;i<5;i++) ctx.fillRect(ltx-14*s+i*7*s,h*0.208,4*s,6*s);
  ctx.fillStyle='#1A1810';
  ctx.beginPath(); ctx.arc(ltx,h*0.335,8*s,Math.PI,0,true);
  ctx.rect(ltx-8*s,h*0.295,16*s,h*0.04); ctx.fill();

  // 6. EMBANKMENT
  ctx.fillStyle='#4A6030'; ctx.fillRect(0,h*0.332,w,h*0.018);
  ctx.fillStyle='#3A5020'; ctx.fillRect(0,h*0.348,w,h*0.005);

  // 7. CHARLES BRIDGE
  ctx.fillStyle='#8A7868'; ctx.fillRect(0,h*0.335,w,h*0.052);
  ctx.fillStyle='#6A5A48';
  for(let i=0;i<7;i++) ctx.fillRect(w*(0.00+i*0.155),h*0.335,w*0.026,h*0.075);
  ctx.fillStyle='#2A3840';
  for(let i=0;i<6;i++){
    const ax=w*(0.077+i*0.155);
    ctx.beginPath(); ctx.ellipse(ax,h*0.387,w*0.059,h*0.022,0,0,Math.PI*2); ctx.fill();
  }
  // Parapet
  ctx.fillStyle='#9A8878'; ctx.fillRect(0,h*0.327,w,h*0.010);
  ctx.fillStyle='#AA9888';
  for(let i=0;i<30;i++) ctx.fillRect(w*(i/30)+w*0.003,h*0.317,w*0.022,h*0.011);

  // 8. STATUE SILHOUETTES
  ctx.fillStyle='#1E1C20';
  for(let i=0;i<16;i++){
    const sx=w*(0.015+i*0.063), sy=h*0.319;
    ctx.fillRect(sx-1.5*s,sy+2*s,3*s,9*s);
    ctx.fillRect(sx-5*s,sy+1*s,10*s,3*s);
    ctx.beginPath(); ctx.ellipse(sx,sy-5*s,4.5*s,7*s,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx,sy-14*s,3*s,0,Math.PI*2); ctx.fill();
    if(i%3===0){ ctx.beginPath(); ctx.ellipse(sx-8*s,sy-7*s,7*s,2*s,-0.4,0,Math.PI*2); ctx.fill(); }
    else if(i%3===1){ ctx.beginPath(); ctx.ellipse(sx+8*s,sy-7*s,7*s,2*s,0.4,0,Math.PI*2); ctx.fill(); }
    else {
      ctx.beginPath(); ctx.ellipse(sx-7*s,sy-9*s,6*s,2*s,-0.6,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(sx+7*s,sy-9*s,6*s,2*s,0.6,0,Math.PI*2); ctx.fill();
    }
  }

  // 9. RIGHT BRIDGE TOWER (Lesser Town)
  const rtx=w*0.91;
  ctx.fillStyle='#524A40'; ctx.fillRect(rtx-13*s,h*0.240,26*s,h*0.095);
  ctx.fillStyle='#403830';
  ctx.beginPath(); ctx.moveTo(rtx,h*0.160); ctx.lineTo(rtx-13*s,h*0.240); ctx.lineTo(rtx+13*s,h*0.240); ctx.closePath(); ctx.fill();
  for(let i=0;i<4;i++) ctx.fillRect(rtx-11*s+i*7*s,h*0.233,4*s,5*s);

  // 10. WATER
  const poly=getLakePoly(3);
  drawWater(w,h,poly,'#4A6880','#1E3850',t);

  // 11. WATER REFLECTIONS
  ctx.save();
  ctx.beginPath(); ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath(); ctx.clip();
  const cref=ctx.createLinearGradient(w*0.50,h*0.38,w*0.50,h*0.68);
  cref.addColorStop(0,'rgba(60,55,90,0.35)'); cref.addColorStop(1,'rgba(60,55,90,0)');
  ctx.fillStyle=cref; ctx.fillRect(w*0.45,h*0.38,w*0.55,h*0.30);
  const sref=ctx.createLinearGradient(0,h*0.38,0,h*0.58);
  sref.addColorStop(0,'rgba(200,100,40,0.22)'); sref.addColorStop(1,'rgba(200,100,40,0)');
  ctx.fillStyle=sref; ctx.fillRect(0,h*0.38,w*0.65,h*0.20);
  ctx.strokeStyle='rgba(155,135,105,0.20)'; ctx.lineWidth=2.5*s;
  for(let i=0;i<7;i++){
    const rx=w*(0.013+i*0.155), len=h*0.07+Math.sin(t*1.1+i*0.9)*h*0.012;
    ctx.beginPath(); ctx.moveTo(rx,h*0.385); ctx.lineTo(rx+Math.sin(t*0.7+i)*3*s,h*0.385+len); ctx.stroke();
  }
  ctx.restore();

  // 12. SIGHTSEEING BOAT
  const bx=w*0.52, by=h*0.62;
  ctx.fillStyle='#D0E8F8';
  ctx.beginPath(); ctx.moveTo(bx-24*s,by+1*s); ctx.lineTo(bx-19*s,by+9*s);
  ctx.lineTo(bx+19*s,by+9*s); ctx.lineTo(bx+24*s,by+1*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#2040A0'; ctx.fillRect(bx-19*s,by+7*s,38*s,3*s);
  ctx.fillStyle='#EEF6FF'; ctx.fillRect(bx-13*s,by-10*s,26*s,11*s);
  ctx.fillStyle='#D03020'; ctx.fillRect(bx-13*s,by-13*s,26*s,3*s);
  ctx.fillStyle='#F0F0F0';
  for(let i=0;i<4;i++) ctx.fillRect(bx-13*s+i*7*s,by-13*s,3*s,3*s);
  ctx.fillStyle='#303030'; ctx.fillRect(bx+7*s,by-20*s,5*s,10*s);
  ctx.fillStyle='#202020'; ctx.fillRect(bx+5*s,by-22*s,9*s,3*s);

  // 13. SWANS
  [[w*0.25,h*0.56],[w*0.70,h*0.71]].forEach(([sx,sy])=>{
    ctx.fillStyle='white';
    ctx.beginPath(); ctx.ellipse(sx,sy,14*s,8*s,-0.1,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='white'; ctx.lineWidth=5*s; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(sx+9*s,sy-3*s); ctx.quadraticCurveTo(sx+18*s,sy-10*s,sx+11*s,sy-21*s); ctx.stroke();
    ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(sx+11*s,sy-22*s,5*s,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#FF9010'; ctx.beginPath(); ctx.ellipse(sx+17*s,sy-22*s,5*s,2*s,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#101010'; ctx.beginPath(); ctx.arc(sx+13*s,sy-24*s,1.5*s,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(220,220,220,0.6)'; ctx.lineWidth=2*s;
    ctx.beginPath(); ctx.ellipse(sx-2*s,sy-1*s,10*s,5*s,-0.15,0,Math.PI*2); ctx.stroke();
  });
}

function drawGuatape(w, h, t) {
  drawSky(w,h,'#4AA8D8','#78C8F0');
  drawClouds(w,h);
  const s=sc();
  ctx.fillStyle='#8A7868';
  ctx.beginPath(); ctx.moveTo(w*0.78,h*0.42); ctx.lineTo(w*0.68,h*0.15); ctx.lineTo(w*0.90,h*0.22); ctx.lineTo(w*0.95,h*0.42); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#A09080';
  ctx.beginPath(); ctx.moveTo(w*0.78,h*0.42); ctx.lineTo(w*0.70,h*0.18); ctx.lineTo(w*0.80,h*0.15); ctx.lineTo(w*0.88,h*0.22); ctx.lineTo(w*0.93,h*0.42); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#6A5848'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.moveTo(w*0.80,h*0.15); ctx.lineTo(w*0.79,h*0.42); ctx.stroke();
  [[0.12,0.38,'#4A8A38'],[0.35,0.39,'#3A7A28'],[0.55,0.37,'#5A9A48']].forEach(([ix,iy,col])=>{
    ctx.fillStyle=col; ctx.beginPath(); ctx.ellipse(w*ix,h*iy,w*0.10,h*0.03,0,0,Math.PI*2); ctx.fill();
  });
  [[0.12,h*0.37],[0.35,h*0.38]].forEach(([hx,hy])=>{
    ['#FF4040','#4040FF','#40C040'].forEach((col,i)=>{
      ctx.fillStyle=col; ctx.beginPath(); ctx.rect(w*hx-12*s+i*10*s,hy-8*s,8*s,10*s); ctx.fill();
    });
  });
  const poly=getLakePoly(4);
  drawWater(w,h,poly,'#2A88B8','#0A5888',t);
}

function drawPuntaCana(w, h, t) {
  const sg=ctx.createLinearGradient(0,0,0,h*0.44);
  sg.addColorStop(0,'#60C8F8'); sg.addColorStop(1,'#A0E8FF');
  ctx.fillStyle=sg; ctx.fillRect(0,0,w,h*0.44);
  const s=sc();
  ctx.fillStyle='#F0EAD8';
  ctx.beginPath(); ctx.rect(w*0.20,h*0.18,w*0.60,h*0.22); ctx.fill();
  ctx.fillStyle='#D8C8A0';
  ctx.beginPath(); ctx.rect(w*0.30,h*0.12,w*0.40,h*0.08); ctx.fill();
  for(let r=0;r<3;r++) for(let c=0;c<8;c++){
    ctx.fillStyle='#90C8E8';
    ctx.beginPath(); ctx.rect(w*(0.24+c*0.068),h*(0.20+r*0.055),w*0.04,h*0.035); ctx.fill();
  }
  function palmB(px,py){
    ctx.fillStyle='#5A3A10'; ctx.beginPath(); ctx.rect(px-4*s,py-50*s,8*s,50*s); ctx.fill();
    [[-30,-5],[30,-5],[-18,-22],[18,-22],[0,-28]].forEach(([fx,fy])=>{
      ctx.fillStyle='#2A8030'; ctx.beginPath();
      ctx.ellipse(px+fx*s,py+fy*s,20*s,7*s,Math.atan2(fy,fx),0,Math.PI*2); ctx.fill();
    });
  }
  palmB(w*0.08,h*0.42); palmB(w*0.18,h*0.40); palmB(w*0.82,h*0.40); palmB(w*0.92,h*0.42);
  ctx.fillStyle='#F0DC90'; ctx.fillRect(0,h*0.38,w,h*0.07);
  const poly=getLakePoly(5);
  drawWater(w,h,poly,'#18D8C8','#0898A8',t);
}

function drawLazyRiver(w, h, t) {
  ctx.fillStyle='#D8C8A0'; ctx.fillRect(0,0,w,h);
  const s=sc();
  ['#3A8A50','#4A9A60','#2A7A40'].forEach((col,i)=>{
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(w*(0.2+i*0.3),h*0.15,w*0.12,h*0.08,0,0,Math.PI*2); ctx.fill();
  });
  ctx.fillStyle='#8B5A20'; ctx.beginPath(); ctx.rect(w*0.40,h*0.78,w*0.20,h*0.10); ctx.fill();
  ctx.fillStyle='#6B4010';
  ctx.beginPath(); ctx.moveTo(w*0.36,h*0.78); ctx.lineTo(w*0.50,h*0.68); ctx.lineTo(w*0.64,h*0.78); ctx.closePath(); ctx.fill();
  const poly=getLakePoly(6);
  drawWater(w,h,poly,'#20C0C0','#108080',t);
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=5*s;
  ctx.beginPath();
  ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath(); ctx.stroke();
}

function drawSaona(w, h, t) {
  drawSky(w,h,'#78D8F8','#B8EEFF');
  const s=sc();
  ctx.fillStyle='#2A7030'; ctx.fillRect(0,h*0.20,w,h*0.24);
  ctx.fillStyle='#3A9040';
  [0.1,0.2,0.35,0.5,0.65,0.8,0.9].forEach(fx=>{
    ctx.beginPath(); ctx.ellipse(w*fx,h*0.28,w*0.09,h*0.06,0,0,Math.PI*2); ctx.fill();
  });
  function palmS(px,py,size=1){
    ctx.fillStyle='#4A2A08'; ctx.beginPath(); ctx.rect(px-4*s*size,py-45*s*size,8*s*size,45*s*size); ctx.fill();
    [[-28,-4],[28,-4],[-16,-20],[16,-20],[0,-26]].forEach(([fx,fy])=>{
      ctx.fillStyle='#1A7020'; ctx.beginPath();
      ctx.ellipse(px+fx*s*size,py+fy*s*size,18*s*size,7*s*size,Math.atan2(fy,fx),0,Math.PI*2); ctx.fill();
    });
  }
  palmS(w*0.05,h*0.43); palmS(w*0.15,h*0.41,0.8); palmS(w*0.85,h*0.42); palmS(w*0.95,h*0.40,0.85);
  ctx.fillStyle='#F8F0D8'; ctx.fillRect(0,h*0.38,w,h*0.08);
  const poly=getLakePoly(7);
  drawWater(w,h,poly,'#10E0D0','#0898A8',t);
  [[w*0.3,h*0.58],[w*0.55,h*0.65],[w*0.70,h*0.72]].forEach(([sx,sy])=>{
    ctx.font=`${Math.floor(16*s)}px serif`; ctx.textAlign='center'; ctx.fillStyle='#E08040';
    ctx.fillText('⭐',sx,sy);
  });
}

function drawPiscinaNatural(w, h, t) {
  drawSky(w,h,'#80D8F8','#C0F0FF');
  drawClouds(w,h);
  const s=sc();
  // Dense treeline on far shore
  ctx.fillStyle='#1A5520'; ctx.fillRect(0,h*0.22,w,h*0.18);
  ctx.fillStyle='#236828';
  [0.03,0.08,0.13,0.18,0.23,0.28,0.33,0.38,0.43,0.48,0.53,0.58,0.63,0.68,0.73,0.78,0.83,0.88,0.93,0.98].forEach(fx=>{
    ctx.beginPath(); ctx.ellipse(w*fx,h*0.30,w*0.04,h*0.065,0,0,Math.PI*2); ctx.fill();
  });
  ctx.fillStyle='#2E8035';
  [0.06,0.11,0.16,0.21,0.26,0.31,0.36,0.41,0.46,0.51,0.56,0.61,0.66,0.71,0.76,0.81,0.86,0.91,0.96].forEach(fx=>{
    ctx.beginPath(); ctx.ellipse(w*fx,h*0.27,w*0.038,h*0.055,0,0,Math.PI*2); ctx.fill();
  });
  // Thin sandy beach strip
  ctx.fillStyle='#EFE8BE'; ctx.fillRect(0,h*0.36,w,h*0.07);
  // Water
  const poly=getLakePoly(8);
  drawWater(w,h,poly,'#08E8E0','#08A0B0',t);
  // Boat: white motorboat with blue bimini top
  const bx=w*0.60, by=h*0.51;
  // Submerged hull
  ctx.fillStyle='#C8CCD0';
  ctx.beginPath(); ctx.moveTo(bx-66*s,by); ctx.lineTo(bx-60*s,by+11*s); ctx.lineTo(bx+60*s,by+11*s); ctx.lineTo(bx+62*s,by); ctx.closePath(); ctx.fill();
  // Hull topsides
  ctx.fillStyle='#F2F2EE';
  ctx.beginPath(); ctx.moveTo(bx-66*s,by); ctx.lineTo(bx-58*s,by-17*s); ctx.lineTo(bx+58*s,by-17*s); ctx.lineTo(bx+62*s,by); ctx.closePath(); ctx.fill();
  // Blue hull stripe
  ctx.fillStyle='#1848A0'; ctx.fillRect(bx-62*s,by-5*s,124*s,4*s);
  // Gunwale
  ctx.fillStyle='#282828'; ctx.fillRect(bx-60*s,by-18*s,120*s,3*s);
  // T-top frame poles
  ctx.strokeStyle='#B8C4CC'; ctx.lineWidth=2.5*s; ctx.lineCap='round';
  [bx-28*s,bx-8*s,bx+14*s,bx+34*s].forEach(px=>{
    ctx.beginPath(); ctx.moveTo(px,by-15*s); ctx.lineTo(px,by-48*s); ctx.stroke();
  });
  ctx.beginPath(); ctx.moveTo(bx-30*s,by-48*s); ctx.lineTo(bx+36*s,by-48*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx-30*s,by-40*s); ctx.lineTo(bx+36*s,by-40*s); ctx.stroke();
  // Blue bimini canopy
  ctx.fillStyle='#1A58C0';
  ctx.beginPath(); ctx.moveTo(bx-32*s,by-49*s); ctx.lineTo(bx+38*s,by-49*s); ctx.lineTo(bx+40*s,by-39*s); ctx.lineTo(bx-34*s,by-39*s); ctx.closePath(); ctx.fill();
  // Outboard motor
  ctx.fillStyle='#383840'; ctx.fillRect(bx+55*s,by-13*s,13*s,20*s);
  ctx.fillStyle='#282830'; ctx.fillRect(bx+58*s,by+7*s,7*s,8*s);
  // Ladder
  ctx.strokeStyle='#A8B4BC'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.moveTo(bx-50*s,by); ctx.lineTo(bx-50*s,by+19*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx-42*s,by); ctx.lineTo(bx-42*s,by+19*s); ctx.stroke();
  [by+7*s,by+14*s].forEach(ry=>{ ctx.beginPath(); ctx.moveTo(bx-50*s,ry); ctx.lineTo(bx-42*s,ry); ctx.stroke(); });
  // Starfish on sandy bottom
  function drawStarfish(cx,cy,r){
    ctx.fillStyle='#D85020';
    ctx.beginPath(); ctx.arc(cx,cy,r*0.35,0,Math.PI*2); ctx.fill();
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5-Math.PI/2;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(r*0.55,0,r*0.5,r*0.22,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha=0.75;
  [[w*0.18,h*0.63,12],[w*0.32,h*0.70,10],[w*0.44,h*0.76,11],[w*0.80,h*0.72,13],[w*0.88,h*0.80,10]]
    .forEach(([cx,cy,r])=>drawStarfish(cx,cy,r*s));
  ctx.globalAlpha=1;
}

function drawSeine(w, h, t) {
  drawSky(w,h,'#C8C0D8','#E0D8E8',1.0);
  const s=sc();
  const tx=w*0.72, tb=h*0.38;
  ctx.fillStyle='#606878';
  ctx.beginPath(); ctx.moveTo(tx-28*s,tb); ctx.lineTo(tx-10*s,tb-60*s); ctx.lineTo(tx-5*s,tb-60*s); ctx.lineTo(tx-2*s,tb); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx+28*s,tb); ctx.lineTo(tx+10*s,tb-60*s); ctx.lineTo(tx+5*s,tb-60*s); ctx.lineTo(tx+2*s,tb); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#505868';
  ctx.beginPath(); ctx.rect(tx-22*s,tb-38*s,44*s,6*s); ctx.fill();
  ctx.beginPath(); ctx.rect(tx-13*s,tb-65*s,26*s,5*s); ctx.fill();
  ctx.beginPath(); ctx.moveTo(tx,tb-130*s); ctx.lineTo(tx-6*s,tb-65*s); ctx.lineTo(tx+6*s,tb-65*s); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#5A5070';
  ctx.beginPath(); ctx.rect(w*0.05,h*0.24,w*0.25,h*0.15); ctx.fill();
  ctx.fillStyle='#4A4060';
  ctx.beginPath(); ctx.moveTo(w*0.12,h*0.24); ctx.lineTo(w*0.15,h*0.14); ctx.lineTo(w*0.18,h*0.24); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w*0.22,h*0.24); ctx.lineTo(w*0.25,h*0.14); ctx.lineTo(w*0.28,h*0.24); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#8080A0'; ctx.fillRect(0,h*0.28,w*0.55,h*0.12);
  ctx.fillStyle='#6868A0'; ctx.fillRect(w*0.78,h*0.28,w*0.22,h*0.12);
  ctx.fillStyle='#9A9080'; ctx.fillRect(0,h*0.37,w,h*0.04);
  ['#8B4513','#228B22','#8B0000'].forEach((col,i)=>{
    ctx.fillStyle=col; ctx.beginPath(); ctx.rect(w*(0.08+i*0.12),h*0.36,w*0.07,h*0.03); ctx.fill();
  });
  const poly=getLakePoly(9);
  drawWater(w,h,poly,'#5A7A9A','#2A4A6A',t);
}

function drawMalvarrosa(w, h, t) {
  const sg=ctx.createLinearGradient(0,0,0,h*0.44);
  sg.addColorStop(0,'#F88820'); sg.addColorStop(0.6,'#FFB840'); sg.addColorStop(1,'#FFD880');
  ctx.fillStyle=sg; ctx.fillRect(0,0,w,h*0.44);
  const s=sc();
  ctx.fillStyle='#FFE040'; ctx.globalAlpha=0.85;
  ctx.beginPath(); ctx.arc(w*0.82,h*0.36,18*s,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;
  ctx.fillStyle='#D0C0A0'; ctx.fillRect(0,h*0.34,w,h*0.08);
  ['#E04040','#E08040','#4060C0'].forEach((col,i)=>{
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.rect(w*(0.05+i*0.28),h*0.30,w*0.20,h*0.06); ctx.fill();
    ctx.fillStyle='#F0F0F0'; ctx.beginPath(); ctx.rect(w*(0.05+i*0.28),h*0.34,w*0.20,h*0.015); ctx.fill();
  });
  function palmV(px,py){
    ctx.fillStyle='#3A2A08'; ctx.beginPath(); ctx.rect(px-3*s,py-40*s,6*s,40*s); ctx.fill();
    [[-22,-4],[22,-4],[-13,-18],[13,-18],[0,-23]].forEach(([fx,fy])=>{
      ctx.fillStyle='#2A8030'; ctx.beginPath();
      ctx.ellipse(px+fx*s,py+fy*s,15*s,6*s,Math.atan2(fy,fx),0,Math.PI*2); ctx.fill();
    });
  }
  palmV(w*0.10,h*0.40); palmV(w*0.30,h*0.39); palmV(w*0.70,h*0.39); palmV(w*0.90,h*0.40);
  ctx.fillStyle='#E8CC80'; ctx.fillRect(0,h*0.39,w,h*0.07);
  const poly=getLakePoly(10);
  drawWater(w,h,poly,'#2888C8','#0858A8',t);
}

function drawDouro(w, h, t) {
  const sg=ctx.createLinearGradient(0,0,0,h*0.44);
  sg.addColorStop(0,'#D06030'); sg.addColorStop(0.6,'#E8A060'); sg.addColorStop(1,'#F8D090');
  ctx.fillStyle=sg; ctx.fillRect(0,0,w,h*0.44);
  const s=sc();
  ctx.strokeStyle='#6A5040'; ctx.lineWidth=5*s;
  ctx.beginPath(); ctx.moveTo(0,h*0.38); ctx.quadraticCurveTo(w*0.50,h*0.22,w,h*0.36); ctx.stroke();
  ctx.lineWidth=3*s;
  ctx.beginPath(); ctx.moveTo(0,h*0.32); ctx.quadraticCurveTo(w*0.50,h*0.14,w,h*0.30); ctx.stroke();
  ctx.fillStyle='#5A4030'; ctx.strokeStyle='#4A3020'; ctx.lineWidth=2*s;
  [[w*0.35,h*0.38],[w*0.65,h*0.38]].forEach(([px,py])=>{
    ctx.beginPath(); ctx.rect(px-5*s,py-50*s,10*s,50*s); ctx.fill(); ctx.stroke();
  });
  const buildColors=['#E8B060','#E07040','#C85030','#D09050','#A84020','#E8C080'];
  for(let i=0;i<10;i++){
    ctx.fillStyle=buildColors[i%buildColors.length];
    const bw=w*0.09, bh=h*(0.06+Math.random()*0.08);
    ctx.beginPath(); ctx.rect(w*(0.02+i*0.095),h*0.17,bw,bh); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.2)';
    for(let r=0;r<2;r++) for(let c=0;c<2;c++){
      ctx.beginPath(); ctx.rect(w*(0.02+i*0.095)+c*bw*0.4+4*s,h*0.18+r*bh*0.35+2*s,bw*0.25,bh*0.25); ctx.fill();
    }
  }
  ctx.fillStyle='#4060A8';
  ctx.beginPath(); ctx.rect(0,h*0.13,w*0.4,h*0.025); ctx.fill();
  [[w*0.65,h*0.55],[w*0.30,h*0.70]].forEach(([bx,by])=>{
    ctx.fillStyle='#8B4A10'; ctx.beginPath(); ctx.ellipse(bx,by,25*s,8*s,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#5A3008'; ctx.lineWidth=2*s;
    ctx.beginPath(); ctx.moveTo(bx,by-8*s); ctx.lineTo(bx,by-28*s); ctx.stroke();
    ctx.fillStyle='#E8D090'; ctx.globalAlpha=0.7;
    ctx.beginPath(); ctx.moveTo(bx,by-28*s); ctx.lineTo(bx+18*s,by-18*s); ctx.lineTo(bx,by-8*s); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=1;
  });
  ctx.fillStyle='#7A6A58'; ctx.fillRect(0,h*0.34,w,h*0.05);
  const poly=getLakePoly(11);
  drawWater(w,h,poly,'#6A7A5A','#3A4A3A',t);
}

function drawGenericBeach(w, h, t) {
  drawSky(w,h,'#68C8F0','#A0E0FF');
  drawClouds(w,h);
  const s=sc();
  ctx.fillStyle='#F0DC90'; ctx.fillRect(0,h*0.38,w,h*0.08);
  [0.1,0.3,0.6,0.85].forEach(fx=>{
    ctx.fillStyle='#3D2A08'; ctx.beginPath(); ctx.rect(w*fx-3*s,h*0.30,6*s,h*0.10); ctx.fill();
    ctx.fillStyle='#2A8030';
    [[-20,-4],[20,-4],[0,-16]].forEach(([fx2,fy])=>{
      ctx.beginPath(); ctx.ellipse(w*fx+fx2*s,h*0.30+fy*s,14*s,5*s,Math.atan2(fy,fx2),0,Math.PI*2); ctx.fill();
    });
  });
  const poly=getLakePoly(currentLevel < LEVELS.length ? currentLevel : 5);
  drawWater(w,h,poly,'#18D8C8','#0898A8',t);
}

// ═══════════════════════════════════════════════════════════════
// MAP SCREEN
// ═══════════════════════════════════════════════════════════════
function drawMapScreen() {
  const mc = document.getElementById('mapCanvas');
  const mctx = mc.getContext('2d');
  const mw = mc.width, mh = mc.height;
  mctx.clearRect(0,0,mw,mh);

  const og = mctx.createLinearGradient(0,0,0,mh);
  og.addColorStop(0,'#2A6A9A'); og.addColorStop(1,'#1A4A7A');
  mctx.fillStyle=og; mctx.fillRect(0,0,mw,mh);

  mctx.fillStyle='#4A7A48';
  // North America
  mctx.beginPath(); mctx.moveTo(mw*0.05,mh*0.15); mctx.lineTo(mw*0.22,mh*0.10);
  mctx.lineTo(mw*0.28,mh*0.35); mctx.lineTo(mw*0.20,mh*0.55); mctx.lineTo(mw*0.08,mh*0.50);
  mctx.closePath(); mctx.fill();
  // South America
  mctx.beginPath(); mctx.moveTo(mw*0.18,mh*0.55); mctx.lineTo(mw*0.28,mh*0.52);
  mctx.lineTo(mw*0.30,mh*0.85); mctx.lineTo(mw*0.18,mh*0.90); mctx.lineTo(mw*0.12,mh*0.70);
  mctx.closePath(); mctx.fill();
  // Europe
  mctx.beginPath(); mctx.moveTo(mw*0.44,mh*0.15); mctx.lineTo(mw*0.58,mh*0.12);
  mctx.lineTo(mw*0.60,mh*0.35); mctx.lineTo(mw*0.46,mh*0.38); mctx.closePath(); mctx.fill();
  // Africa
  mctx.beginPath(); mctx.moveTo(mw*0.46,mh*0.38); mctx.lineTo(mw*0.60,mh*0.36);
  mctx.lineTo(mw*0.58,mh*0.72); mctx.lineTo(mw*0.48,mh*0.78); mctx.lineTo(mw*0.42,mh*0.60);
  mctx.closePath(); mctx.fill();
  // Asia
  mctx.beginPath(); mctx.moveTo(mw*0.58,mh*0.12); mctx.lineTo(mw*0.95,mh*0.10);
  mctx.lineTo(mw*0.95,mh*0.50); mctx.lineTo(mw*0.62,mh*0.48); mctx.lineTo(mw*0.58,mh*0.35);
  mctx.closePath(); mctx.fill();

  mctx.fillStyle='rgba(255,255,255,0.9)';
  mctx.font='bold 11px Georgia'; mctx.textAlign='center';
  mctx.fillText('Sydney & Michael\'s Adventure Map', mw*0.5, 14);

  const visited = visitedLevels.map(i => {
    const lvl = i < LEVELS.length ? LEVELS[i] : null;
    return lvl ? [mw*lvl.mapDot[0], mh*lvl.mapDot[1]] : null;
  }).filter(Boolean);

  if (visited.length > 1) {
    mctx.strokeStyle='rgba(255,200,50,0.7)';
    mctx.lineWidth=1.5; mctx.setLineDash([3,3]);
    mctx.beginPath(); mctx.moveTo(visited[0][0],visited[0][1]);
    for(let i=1;i<visited.length;i++) mctx.lineTo(visited[i][0],visited[i][1]);
    mctx.stroke(); mctx.setLineDash([]);
  }

  visitedLevels.forEach((li, idx) => {
    if (li >= LEVELS.length) return;
    const lvl = LEVELS[li];
    const [px,py] = [mw*lvl.mapDot[0], mh*lvl.mapDot[1]];
    const isLast = idx === visitedLevels.length-1;
    mctx.fillStyle = isLast ? '#FFD700' : '#FF8040';
    mctx.beginPath(); mctx.arc(px,py,isLast?7:5,0,Math.PI*2); mctx.fill();
    mctx.strokeStyle='white'; mctx.lineWidth=1.5;
    mctx.beginPath(); mctx.arc(px,py,isLast?7:5,0,Math.PI*2); mctx.stroke();
    mctx.fillStyle='white'; mctx.font=`${isLast?'bold ':' '}9px Georgia`;
    mctx.textAlign='center';
    mctx.fillText(lvl.name.split(' ').slice(-1)[0], px, py-9);
  });
}
