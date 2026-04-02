// ══════════════════════════════════════════════════════════
//  BACKGROUND
// ══════════════════════════════════════════════════════════
function drawBG(){
  // Sky
  const sg=G.createLinearGradient(0,0,0,ROAD_Y);
  sg.addColorStop(0,'#5a6878'); sg.addColorStop(1,'#7a8d9a');
  G.fillStyle=sg; G.fillRect(0,0,W,ROAD_Y+4);

  // Far trees
  G.save(); G.translate(-(BGL[0].x%220),0);
  for(let i=-1;i<5;i++){ treeF(i*220+50,118,.68); treeF(i*220+130,102,.58); }
  G.restore();

  // Mid trees
  G.save(); G.translate(-(BGL[1].x%270),0);
  for(let i=-1;i<5;i++){ treeM(i*270+35,188,1.0,'#2d6030'); treeM(i*270+160,170,.85,'#235025'); }
  G.restore();

  // Grass band
  G.fillStyle='#3d6830'; G.fillRect(0,ROAD_Y-22,W,26);
  G.save(); G.translate(-(BGL[2].x%190),0);
  for(let i=-1;i<6;i++){ bush(i*190+25,ROAD_Y-8,1.0); bush(i*190+108,ROAD_Y-4,.78); }
  G.restore();

  // Road
  const rg=G.createLinearGradient(0,ROAD_Y,0,H);
  rg.addColorStop(0,'#6e5e50'); rg.addColorStop(.4,'#7a6a58'); rg.addColorStop(1,'#5c4e40');
  G.fillStyle=rg; G.fillRect(0,ROAD_Y,W,H-ROAD_Y);
  G.fillStyle='rgba(100,145,185,0.10)'; G.fillRect(0,ROAD_Y,W,H-ROAD_Y);

  // Puddles
  PUDDLES.forEach(p=>{
    const px=((p.ox-BGL[2].x*.5%W)+W*3)%W;
    G.save(); G.translate(px,FLOOR_Y+22); G.scale(1,.28);
    G.beginPath(); G.ellipse(0,0,p.w/2,16,0,0,Math.PI*2);
    G.fillStyle=`rgba(130,175,215,${p.a})`; G.fill(); G.restore();
  });

  // Center dashes
  G.setLineDash([28,22]); G.strokeStyle='rgba(200,185,160,0.22)'; G.lineWidth=3;
  G.beginPath(); G.moveTo(0,ROAD_Y+(H-ROAD_Y)*.48); G.lineTo(W,ROAD_Y+(H-ROAD_Y)*.48); G.stroke();
  G.setLineDash([]);

  // Bottom grass
  G.fillStyle='#3d6830'; G.fillRect(0,H-18,W,18);
  G.fillStyle='#4d7840';
  for(let gx=0;gx<W;gx+=18) G.fillRect(gx,H-20+Math.sin(gx*.35)*2,10,5);
}

function treeF(x,y,s){
  G.fillStyle='rgba(65,88,65,0.55)'; G.beginPath(); G.ellipse(x,y,32*s,40*s,0,0,Math.PI*2); G.fill();
  G.fillStyle='#4a5840'; G.fillRect(x-4*s,y+30*s,8*s,22*s);
}
function treeM(x,y,s,c){
  G.fillStyle='#5a3a1a'; G.fillRect(x-6*s,y+28*s,12*s,50*s);
  G.fillStyle=c; G.beginPath(); G.ellipse(x,y+8*s,36*s,40*s,0,0,Math.PI*2); G.fill();
  G.fillStyle='#1d4820'; G.beginPath(); G.ellipse(x-8*s,y+2*s,22*s,28*s,-.3,0,Math.PI*2); G.fill();
  G.fillStyle='#3d7840'; G.beginPath(); G.ellipse(x+6*s,y-4*s,20*s,26*s,.2,0,Math.PI*2); G.fill();
}
function bush(x,y,s){
  G.fillStyle='#2d5e22'; G.beginPath(); G.ellipse(x,y,24*s,12*s,0,0,Math.PI*2); G.fill();
  G.fillStyle='#3d6e30'; G.beginPath(); G.ellipse(x-7*s,y-3*s,15*s,9*s,-.2,0,Math.PI*2); G.fill();
}

function drawRain(){
  G.strokeStyle='rgba(175,210,240,0.42)'; G.lineWidth=1;
  RAIN.forEach(r=>{ G.beginPath(); G.moveTo(r.x,r.y); G.lineTo(r.x-2,r.y+r.l); G.stroke(); });
}

// ══════════════════════════════════════════════════════════
//  PLAYER & BIKE
// ══════════════════════════════════════════════════════════
function drawPlayer(){
  const flicker = P.inv>0 && (FRAME&3)<2;
  if(flicker) G.globalAlpha=.4;
  G.save();
  G.translate(P.x, P.y);
  G.rotate(P.lean*.055);
  drawBikeRider(CHARS[selectedChar], P.pedal, selectedChar);
  G.restore();
  G.globalAlpha=1;
}

function drawBikeRider(ch, pa, ci){
  // === LIME BIKE ===
  const WX=20, WR=16;
  G.strokeStyle='#cc1818'; G.lineWidth=4;
  // Frame
  G.beginPath(); G.moveTo(-22,-14); G.lineTo(10,-18); G.lineTo(WX,4); G.moveTo(-22,-14); G.lineTo(0,4); G.stroke();
  G.lineWidth=3; G.beginPath(); G.moveTo(10,-18); G.lineTo(0,4); G.stroke();
  G.beginPath(); G.moveTo(-22,-14); G.lineTo(-22,-22); G.stroke();
  // Wheels
  G.lineWidth=5; G.strokeStyle='#1a1a1a';
  G.beginPath(); G.arc(WX,4,WR,0,Math.PI*2); G.stroke();
  G.beginPath(); G.arc(-WX,4,WR,0,Math.PI*2); G.stroke();
  G.lineWidth=3; G.strokeStyle='#333';
  G.beginPath(); G.arc(WX,4,WR-2,0,Math.PI*2); G.stroke();
  G.beginPath(); G.arc(-WX,4,WR-2,0,Math.PI*2); G.stroke();
  // Spokes
  for(let s=0;s<6;s++){
    const a=pa+s*Math.PI/3;
    G.strokeStyle='rgba(80,80,80,0.6)'; G.lineWidth=1;
    [WX,-WX].forEach(wx=>{
      G.beginPath(); G.moveTo(wx,4); G.lineTo(wx+Math.cos(a)*(WR-2),4+Math.sin(a)*(WR-2)); G.stroke();
    });
  }
  G.fillStyle='#555'; [WX,-WX].forEach(wx=>{ G.beginPath(); G.arc(wx,4,3,0,Math.PI*2); G.fill(); });
  // Fenders
  G.strokeStyle='#cc1818'; G.lineWidth=3;
  G.beginPath(); G.arc(WX,4,WR+2,-Math.PI*.82,-Math.PI*.05); G.stroke();
  G.beginPath(); G.arc(-WX,4,WR+2,Math.PI*1.08,Math.PI*1.92); G.stroke();
  // Handlebar
  G.strokeStyle='#222'; G.lineWidth=3;
  G.beginPath(); G.moveTo(12,-18); G.lineTo(20,-28); G.stroke();
  G.beginPath(); G.moveTo(20,-28); G.lineTo(18,-22); G.stroke();
  // Seat
  rr(-30,-26,16,5,3,'#1a1a1a',null);
  // Pedals
  G.fillStyle='#222';
  G.fillRect(Math.cos(pa)*9-3,-8+Math.sin(pa)*9-2,9,4);
  G.fillRect(Math.cos(pa+Math.PI)*9-3,-8+Math.sin(pa+Math.PI)*9-2,9,4);
  // Lime basket
  rr(14,-33,28,17,3,'#bb1515',null);
  rr(16,-31,24,14,2,'#44aa22',null);
  G.fillStyle='#fff'; G.font='bold 5px sans-serif'; G.fillText('Lime',18,-22);

  // === RIDER ===
  if(ci===0) riderMichael(ch,pa);
  else riderSydney(ch,pa);
}

// ══════════════════════════════════════════════════════════
//  OBSTACLES
// ══════════════════════════════════════════════════════════
function drawObs(){
  OBS.forEach(ob=>{
    G.save(); G.translate(ob.x, ob.y);
    if(ob.t==='branch') drawBranch(ob);
    else if(ob.t==='biglog') drawBigLog(ob);
    else drawHippy(ob);
    G.restore();
  });
}

function drawBranch(ob){
  if(ob.warn>0){
    // Shadow + shaking leaves warning
    G.globalAlpha=Math.min(1,ob.warn/25)*.55;
    G.fillStyle='#2a1500';
    G.beginPath(); G.ellipse(0,ob.tY-ob.y+14,18,5,0,0,Math.PI*2); G.fill();
    const sh=Math.sin(FRAME*.5)*3;
    G.fillStyle='#3a7828';
    for(let i=0;i<5;i++){
      const la=i/5*Math.PI*2;
      G.beginPath(); G.ellipse(Math.cos(la)*11+sh,ob.tY-ob.y-35+Math.sin(la)*5,7,5,la,0,Math.PI*2); G.fill();
    }
    G.globalAlpha=1; return;
  }
  G.rotate(ob.rot);
  rr(-26,-8,52,16,4,'#8B5E3C',null);
  G.strokeStyle='#6B4020'; G.lineWidth=1.2;
  for(let i=-2;i<3;i++){ G.beginPath(); G.moveTo(i*11,-8); G.lineTo(i*11,8); G.stroke(); }
  G.fillStyle='#7a4a2a'; G.fillRect(6,-17,6,10); G.fillRect(-20,-15,5,9); G.fillRect(20,-13,5,8);
  G.fillStyle='#4a8030'; G.beginPath(); G.ellipse(10,-20,11,8,.35,0,Math.PI*2); G.fill();
  G.fillStyle='#3a7025'; G.beginPath(); G.ellipse(-17,-20,9,7,-.25,0,Math.PI*2); G.fill();
  G.fillStyle='#5a9040'; G.beginPath(); G.ellipse(22,-17,8,6,.55,0,Math.PI*2); G.fill();
}

function drawBigLog(ob){
  if(ob.warn>0){
    const pulse=Math.sin(FRAME*.18)*.25+.65;
    G.globalAlpha=Math.min(1,ob.warn/40)*pulse*.7;
    G.fillStyle='#ff3300'; G.fillRect(-55,ob.tY-ob.y-32,110,52);
    G.globalAlpha=Math.min(1,ob.warn/40);
    G.strokeStyle='#ff6600'; G.lineWidth=2; G.setLineDash([6,5]);
    G.strokeRect(-55,ob.tY-ob.y-32,110,52); G.setLineDash([]);
    G.fillStyle='#fff'; G.font='bold 13px monospace'; G.textAlign='center';
    G.fillText('⚠ TIMBER!!',0,ob.tY-ob.y-38);
    G.textAlign='left'; G.globalAlpha=1; return;
  }
  G.rotate(ob.rot||.12);
  rr(-50,-16,100,32,7,'#7a4820',null);
  rr(-46,-12,92,10,3,'#9a6030',null);
  G.strokeStyle='#5a3010'; G.lineWidth=2;
  for(let i=-3;i<4;i++){ G.beginPath(); G.moveTo(i*13,-16); G.lineTo(i*13,16); G.stroke(); }
  G.fillStyle='#6a3818'; G.beginPath(); G.ellipse(-50,0,15,15,0,0,Math.PI*2); G.fill();
  G.strokeStyle='#4a2808'; G.lineWidth=1.5;
  for(let r=3;r<15;r+=3.5){ G.beginPath(); G.arc(-50,0,r,0,Math.PI*2); G.stroke(); }
  G.fillStyle='#4a8030'; G.beginPath(); G.ellipse(32,-26,22,15,.4,0,Math.PI*2); G.fill();
  G.fillStyle='#3a7025'; G.beginPath(); G.ellipse(46,-20,17,12,-.2,0,Math.PI*2); G.fill();
  G.fillStyle='#5a9040'; G.beginPath(); G.ellipse(20,-30,15,11,.65,0,Math.PI*2); G.fill();
  G.fillStyle='#4a8030'; G.beginPath(); G.ellipse(-36,-22,10,8,.1,0,Math.PI*2); G.fill();
}

const HC=['#e85525','#22aacc','#ddcc22','#cc44aa'];
function drawHippy(ob){
  const bo=Math.sin(FRAME*.14+ob.ph)*9, as=Math.sin(FRAME*.11+ob.ph);
  G.fillStyle='rgba(0,0,0,0.18)';
  G.beginPath(); G.ellipse(0,30,18,5,0,0,Math.PI*2); G.fill();
  G.translate(0,bo);
  // Sandals
  G.fillStyle='#aa8844'; G.fillRect(-13,24,13,5); G.fillRect(2,24,13,5);
  // Pants
  rr(-14,2,28,24,6,'#7744aa',null);
  G.fillStyle='#9966cc'; rr(-12,4,12,16,4,'#9966cc',null);
  // Tie-dye shirt
  rr(-15,-26,30,30,6,'#44aadd',null);
  G.save(); G.beginPath(); rr(-15,-26,30,30,6,null,null); G.clip();
  HC.forEach((c,i)=>{
    G.globalAlpha=.5; G.fillStyle=c;
    G.beginPath(); G.arc(-8+i*5.5,-16+Math.sin(i*1.3)*4,7,0,Math.PI*2); G.fill();
  });
  G.globalAlpha=1; G.restore();
  // Arms waving
  G.strokeStyle='#f0b888'; G.lineWidth=7;
  G.beginPath(); G.moveTo(-14,-16); G.lineTo(-30,-12+as*18); G.lineTo(-26,-30+as*12); G.stroke();
  G.beginPath(); G.moveTo(14,-16); G.lineTo(30,-12-as*18); G.lineTo(26,-30-as*12); G.stroke();
  // Head
  G.fillStyle='#f0b888'; G.beginPath(); G.arc(0,-40,14,0,Math.PI*2); G.fill();
  // Blond hair
  G.fillStyle='#ddaa33';
  G.beginPath(); G.arc(0,-46,13,Math.PI,Math.PI*2); G.fill();
  G.fillRect(-12,-46,6,22); G.fillRect(6,-46,6,22);
  G.strokeStyle='#eebb44'; G.lineWidth=5;
  G.beginPath(); G.moveTo(-12,-40); G.lineTo(-14,-22); G.stroke();
  G.beginPath(); G.moveTo(12,-40); G.lineTo(14,-22); G.stroke();
  // Red headband
  G.strokeStyle='#cc3333'; G.lineWidth=4;
  G.beginPath(); G.arc(0,-46,13,Math.PI,Math.PI*2); G.stroke();
  // Round tinted glasses
  G.strokeStyle='#886600'; G.lineWidth=2.5;
  G.beginPath(); G.arc(-5,-40,4.5,0,Math.PI*2); G.stroke();
  G.beginPath(); G.arc(5,-40,4.5,0,Math.PI*2); G.stroke();
  G.beginPath(); G.moveTo(-.5,-40); G.lineTo(.5,-40); G.stroke();
  G.fillStyle='rgba(80,180,60,0.28)';
  G.beginPath(); G.arc(-5,-40,4.5,0,Math.PI*2); G.fill();
  G.beginPath(); G.arc(5,-40,4.5,0,Math.PI*2); G.fill();
  // Beard
  G.fillStyle='rgba(180,145,55,0.65)'; G.beginPath(); G.arc(0,-33,7,0,Math.PI); G.fill();
  // Grin
  G.strokeStyle='#7a4422'; G.lineWidth=2;
  G.beginPath(); G.arc(0,-35,6,.1,Math.PI-.1); G.stroke();
  // Peace sign
  G.strokeStyle='rgba(255,255,255,0.65)'; G.lineWidth=1.5;
  G.beginPath(); G.arc(0,-12,7,0,Math.PI*2); G.stroke();
  G.beginPath(); G.moveTo(0,-5); G.lineTo(0,-19); G.stroke();
  G.beginPath(); G.moveTo(0,-12); G.lineTo(-6,-16.5); G.stroke();
  G.beginPath(); G.moveTo(0,-12); G.lineTo(6,-16.5); G.stroke();
}

// ══════════════════════════════════════════════════════════
//  HUD
// ══════════════════════════════════════════════════════════
function drawHUD(){
  // Score box
  rr(8,8,158,78,8,'rgba(12,20,42,0.88)','#2a4a7a',2);
  G.fillStyle='#88aadd'; G.font='bold 12px monospace'; G.fillText('SCORE',20,28);
  G.fillStyle='#ffdd44'; G.font='bold 24px monospace'; G.fillText(pad(Math.floor(score)),18,54);
  G.fillStyle='#6688aa'; G.font='11px monospace'; G.fillText('BEST: '+pad(Math.floor(best)),18,72);

  // Character box
  const ch=CHARS[selectedChar];
  rr(W-170,8,162,72,8,'rgba(12,20,42,0.88)','#2a4a7a',2);
  G.fillStyle='#ffdd88'; G.font='bold 14px monospace'; G.fillText(ch.name,W-156,30);
  // Hearts / lives
  const maxH=ch.maxHits, curH=maxH-P.hits;
  for(let i=0;i<maxH;i++){
    G.fillStyle= i<curH?'#ff4444':'#442222';
    G.font='16px sans-serif'; G.fillText('❤',W-154+i*22,52);
  }
  // Speed bar
  const sf=Math.min((gameSpeed-3.5)/7,1);
  rr(W-156,57,112,8,4,'rgba(0,0,0,0.45)',null);
  const sbg=G.createLinearGradient(W-156,0,W-44,0);
  sbg.addColorStop(0,'#33cc55'); sbg.addColorStop(.55,'#cccc22'); sbg.addColorStop(1,'#cc2222');
  rr(W-156,57,112*sf,8,4,sbg,null);
  G.fillStyle='#5577aa'; G.font='9px monospace'; G.fillText('SPD',W-156,74);
  // Mini portrait
  G.save(); G.translate(W-28,44); G.scale(.32,.32); miniHead(selectedChar); G.restore();

  // Popups
  POPS.forEach(p=>{
    G.globalAlpha=p.l/60; G.fillStyle=p.c||'#ffff44';
    G.font=`bold ${p.s||15}px monospace`; G.fillText(p.t,p.x,p.y);
  });
  G.globalAlpha=1;

  // Big log screen flash
  if(bigFlash>0){
    const q=bigFlash/50;
    G.fillStyle=`rgba(255,50,0,${q*.32})`; G.fillRect(0,0,W,H);
    if(bigFlash>22){
      G.fillStyle=`rgba(255,255,255,${q})`;
      G.textAlign='center'; G.font='bold 30px monospace';
      G.fillText('⚠  A LOG FELL!!  ⚠',W/2,H/2-14);
      G.font='15px monospace'; G.fillStyle='#ffdd44';
      G.fillText('DODGE!',W/2,H/2+16);
      G.textAlign='left';
    }
  }
}

// ══════════════════════════════════════════════════════════
//  TITLE
// ══════════════════════════════════════════════════════════
function drawTitle(){
  drawBG(); drawRain();
  G.fillStyle='rgba(8,14,28,0.72)'; G.fillRect(0,0,W,H);
  G.textAlign='center';
  const ty=70+Math.sin(FRAME*.035)*6;
  G.shadowColor='#2266cc'; G.shadowBlur=28;
  G.fillStyle='#99ccff'; G.font='bold 50px monospace'; G.fillText('🚲 PRAGUE',W/2,ty+50);
  G.fillStyle='#ffdd44'; G.shadowColor='#ff9900'; G.shadowBlur=16;
  G.font='bold 56px monospace'; G.fillText('BIKE PANIC!',W/2,ty+108);
  G.shadowBlur=0;
  G.fillStyle='#8aaabb'; G.font='italic 14px monospace'; G.fillText('A Rainy Ride Through the Park',W/2,ty+138);

  // Char preview
  for(let i=0;i<2;i++){
    const cx=W/2-110+i*220;
    rr(cx-72,ty+155,144,162,10,'rgba(18,30,58,0.82)','#334466',2);
    G.save(); G.translate(cx,ty+258); G.scale(.72,.72); drawBikeRider(CHARS[i],FRAME*.06,i); G.restore();
    G.fillStyle=i===0?'#ffbb55':'#88ff88'; G.font='bold 13px monospace'; G.fillText(CHARS[i].name,cx,ty+298);
  }

  const blink=(FRAME/28|0)%2;
  G.fillStyle=blink?'#ffdd44':'#cc9922'; G.font='bold 16px monospace';
  G.fillText('Press ENTER or SPACE to Start',W/2,ty+335);
  G.fillStyle='#445566'; G.font='11px monospace';
  G.fillText('← → Move   ↑ W Space Jump   Enter Start',W/2,ty+360);
  G.textAlign='left';
}

// ══════════════════════════════════════════════════════════
//  CHAR SELECT
// ══════════════════════════════════════════════════════════
function drawCharSelect(){
  G.fillStyle='#101828'; G.fillRect(0,0,W,H);
  drawRain();
  G.fillStyle='rgba(8,12,22,0.65)'; G.fillRect(0,0,W,H);
  G.textAlign='center';
  G.fillStyle='#88bbff'; G.font='bold 26px monospace'; G.fillText('CHOOSE YOUR RIDER',W/2,52);
  G.fillStyle='#445566'; G.font='13px monospace'; G.fillText('← → to switch   ENTER to go!',W/2,78);

  for(let i=0;i<2;i++){
    const cx=W/2-158+i*316, sel=selectedChar===i;
    G.shadowColor=sel?'#4488ff':'transparent'; G.shadowBlur=sel?22:0;
    rr(cx-108,96,216,322,12,sel?'rgba(22,50,110,0.96)':'rgba(16,26,48,0.88)',sel?'#4488ff':'#2a3a5a',2);
    G.shadowBlur=0;
    G.save(); G.translate(cx,258); G.scale(1.12,1.12); drawBikeRider(CHARS[i],FRAME*.07,i); G.restore();
    const ch=CHARS[i];
    G.fillStyle=sel?'#ffdd44':'#aaccee'; G.font='bold 17px monospace'; G.fillText(ch.name,cx,316);
    G.fillStyle='#7799bb'; G.font='12px monospace'; G.fillText(ch.tagline,cx,338);
    G.fillStyle=sel?'#aaffaa':'#668866'; G.font='12px monospace'; G.fillText(ch.badge,cx,358);
    G.fillStyle=sel?'#4488ff':'#334455'; G.font='11px monospace'; G.fillText(sel?'▶ SELECTED ◀':'press ← →',cx,388);
  }
  G.textAlign='left';
}

// ══════════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════════
function drawGameOver(){
  G.fillStyle='rgba(0,0,0,0.78)'; G.fillRect(0,0,W,H);
  G.textAlign='center';
  G.shadowColor='#cc0000'; G.shadowBlur=18;
  G.fillStyle='#ff5555'; G.font='bold 46px monospace'; G.fillText('WIPED OUT!',W/2,175);
  G.shadowBlur=0;
  G.fillStyle='#ffaa44'; G.font='20px monospace'; G.fillText('Score: '+Math.floor(score),W/2,225);
  if(score>=best){
    G.fillStyle='#ffff55'; G.font='bold 18px monospace'; G.fillText('★  NEW BEST!  ★',W/2,258);
  } else {
    G.fillStyle='#aaccee'; G.font='16px monospace'; G.fillText('Best: '+Math.floor(best),W/2,258);
  }
  const blink=(FRAME/22|0)%2;
  G.fillStyle=blink?'#88ddff':'#446688'; G.font='bold 16px monospace';
  G.fillText('Press ENTER to Ride Again',W/2,306);
  G.fillStyle='#334455'; G.font='12px monospace'; G.fillText('TAB = change character',W/2,330);
  G.textAlign='left';
}
