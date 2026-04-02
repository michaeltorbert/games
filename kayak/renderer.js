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

function drawKayak(x, y, angle, paddlePhase) {
  const s=sc();
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle+Math.PI/2);
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
  const swing = Math.sin(paddlePhase) * 0.55;
  // Sydney's paddle (front)
  ctx.save(); ctx.translate(0,-18*s); ctx.rotate(swing * 0.7);
  ctx.strokeStyle='#4070D0'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.moveTo(-30*s,0); ctx.lineTo(30*s,0); ctx.stroke();
  ctx.fillStyle='#2050A0'; ctx.strokeStyle='#1A3A80'; ctx.lineWidth=1*s;
  ctx.beginPath(); ctx.ellipse(-30*s,0,9*s,4*s,-0.25,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(30*s,0,9*s,4*s,0.25,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Michael's paddle (rear)
  ctx.save(); ctx.translate(0,2*s); ctx.rotate(swing);
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
    ctx.font=`${Math.floor(20*sc()*c.scale)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
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
  ctx.fillStyle='#E8D48A'; ctx.fillRect(cx-130*s,base,260*s,12*s);
  ctx.fillStyle='#F5E8A0'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.rect(cx-120*s,base-40*s,60*s,40*s); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx+60*s,base-40*s,60*s,40*s); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx-60*s,base-55*s,120*s,55*s); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#B06020';
  ctx.beginPath(); ctx.rect(cx-18*s,base-40*s,36*s,40*s); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,base-40*s,18*s,Math.PI,0); ctx.fill();
  ctx.fillStyle='#D4A830'; ctx.strokeStyle='#A07820'; ctx.lineWidth=2*s;
  ctx.beginPath(); ctx.arc(cx,base-55*s,38*s,Math.PI,0); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(255,255,200,0.45)';
  ctx.beginPath(); ctx.arc(cx-10*s,base-78*s,14*s,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#8B6010';
  ctx.beginPath(); ctx.moveTo(cx,base-93*s); ctx.lineTo(cx-3*s,base-55*s); ctx.lineTo(cx+3*s,base-55*s); ctx.closePath(); ctx.fill();
  [[cx-60*s,base-55*s,14*s],[cx+60*s,base-55*s,14*s]].forEach(([dx,dy,dr])=>{
    ctx.fillStyle='#D4A830'; ctx.beginPath(); ctx.arc(dx,dy,dr,Math.PI,0); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#8B6010'; ctx.beginPath(); ctx.moveTo(dx,dy-dr-6*s); ctx.lineTo(dx-2*s,dy-dr); ctx.lineTo(dx+2*s,dy-dr); ctx.closePath(); ctx.fill();
  });
  function minaret(mx,my){
    ctx.fillStyle='#EEDD88'; ctx.strokeStyle='#C8A030'; ctx.lineWidth=1.5*s;
    ctx.beginPath(); ctx.rect(mx-5*s,my-80*s,10*s,80*s); ctx.fill(); ctx.stroke();
    [1,2,3].forEach(i=>{ ctx.fillStyle='#C8A030'; ctx.beginPath(); ctx.rect(mx-7*s,my-80*s*0.3*i,14*s,4*s); ctx.fill(); });
    ctx.fillStyle='#D4A830'; ctx.beginPath(); ctx.arc(mx,my-80*s,7*s,Math.PI,0); ctx.fill(); ctx.stroke();
  }
  minaret(cx-140*s,base); minaret(cx+140*s,base);
  ctx.globalAlpha=0.65; minaret(cx-95*s,base-4*s); minaret(cx+95*s,base-4*s); ctx.globalAlpha=1;
  ctx.fillStyle='#4A9B45'; ctx.fillRect(0,h*0.395,w,h*0.022);
  ctx.fillStyle='#3D7B2A'; ctx.beginPath(); ctx.ellipse(w*0.09,h*0.41,w*0.08,h*0.025,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#3D7B2A'; ctx.beginPath(); ctx.ellipse(w*0.88,h*0.41,w*0.09,h*0.025,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#2A6020';
  ctx.beginPath(); ctx.moveTo(w*0.89,h*0.20); ctx.lineTo(w*0.86,h*0.41); ctx.lineTo(w*0.92,h*0.41); ctx.closePath(); ctx.fill();
  const poly=getLakePoly(0);
  drawWater(w,h,poly,'#3AA8D8','#1A6090',t);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(poly[0][0],poly[0][1]);
  for(let i=1;i<poly.length;i++) ctx.lineTo(poly[i][0],poly[i][1]);
  ctx.closePath(); ctx.clip();
  const rg=ctx.createLinearGradient(w*0.3,h*0.40,w*0.7,h*0.40+h*0.14);
  rg.addColorStop(0,'rgba(212,168,48,0)'); rg.addColorStop(0.5,'rgba(212,168,48,0.16)'); rg.addColorStop(1,'rgba(212,168,48,0)');
  ctx.fillStyle=rg; ctx.fillRect(w*0.25,h*0.40,w*0.5,h*0.18);
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
  drawSky(w,h,'#9090A8','#C0C8D8',1.0);
  const s=sc();
  ctx.fillStyle='#8A7060';
  ctx.beginPath(); ctx.rect(0,h*0.33,w,h*0.06); ctx.fill();
  ctx.fillStyle='#7A6050';
  for(let i=0;i<7;i++){
    const bx=w*(0.05+i*0.14);
    ctx.beginPath(); ctx.arc(bx,h*0.39,w*0.05,0,Math.PI,true); ctx.fill();
  }
  ctx.fillStyle='#6A6060';
  for(let i=0;i<6;i++){
    const bx=w*(0.10+i*0.16);
    ctx.beginPath(); ctx.rect(bx-4*s,h*0.30,8*s,h*0.04); ctx.fill();
    ctx.beginPath(); ctx.arc(bx,h*0.29,5*s,0,Math.PI*2); ctx.fill();
  }
  ctx.fillStyle='#5A5870';
  ctx.beginPath(); ctx.rect(w*0.55,h*0.08,w*0.40,h*0.26); ctx.fill();
  ctx.fillStyle='#4A4860';
  [[0.60,h*0.08],[0.68,h*0.04],[0.76,h*0.06],[0.84,h*0.08],[0.90,h*0.10]].forEach(([fx,fy])=>{
    ctx.beginPath(); ctx.moveTo(w*fx,fy); ctx.lineTo(w*fx-8*s,h*0.18); ctx.lineTo(w*fx+8*s,h*0.18); ctx.closePath(); ctx.fill();
  });
  ctx.fillStyle='#B09080';
  ctx.beginPath(); ctx.rect(w*0.0,h*0.15,w*0.45,h*0.18); ctx.fill();
  ctx.fillStyle='#C8A060';
  ctx.beginPath(); ctx.rect(w*0.04,h*0.10,w*0.08,h*0.08); ctx.fill();
  ctx.fillStyle='#A07050';
  ctx.beginPath(); ctx.moveTo(w*0.04,h*0.10); ctx.lineTo(w*0.08,h*0.05); ctx.lineTo(w*0.12,h*0.10); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#4A7A38'; ctx.fillRect(0,h*0.33,w,h*0.025);
  const poly=getLakePoly(3);
  drawWater(w,h,poly,'#4A7A9A','#2A4A6A',t);
  [[w*0.3,h*0.55],[w*0.65,h*0.68]].forEach(([sx,sy])=>{
    ctx.fillStyle='white'; ctx.beginPath(); ctx.ellipse(sx,sy,12*s,7*s,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx+8*s,sy-8*s,5*s,4*s,0.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#FFA020'; ctx.beginPath(); ctx.ellipse(sx+12*s,sy-8*s,3*s,2*s,0,0,Math.PI*2); ctx.fill();
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
  ctx.fillStyle='#08C8C0'; ctx.fillRect(0,h*0.38,w,h*0.08);
  ctx.fillStyle='#4A6840';
  ctx.beginPath(); ctx.rect(0,h*0.43,w,h*0.025); ctx.fill();
  ['#C04040','#D06820','#8040C0','#40A040'].forEach((col,i)=>{
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.ellipse(w*(0.1+i*0.25),h*0.44,14*s,8*s,0,0,Math.PI*2); ctx.fill();
  });
  ctx.fillStyle='rgba(240,220,140,0.3)';
  ctx.beginPath(); ctx.ellipse(w*0.35,h*0.65,w*0.20,h*0.08,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w*0.70,h*0.80,w*0.18,h*0.06,0,0,Math.PI*2); ctx.fill();
  const poly=getLakePoly(8);
  drawWater(w,h,poly,'#08E8E0','#08A0B0',t);
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
