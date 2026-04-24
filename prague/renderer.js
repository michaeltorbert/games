// ══════════════════════════════════════════════════════════
//  BACKGROUND
// ══════════════════════════════════════════════════════════
function drawBG(){
  const hasThree=!!(window.PragueThreeScene&&window.PragueThreeScene.available);
  if(hasThree){
    G.fillStyle='rgba(190,210,210,0.08)';
    G.fillRect(0,0,W,ROAD_Y+4);
    G.save();
    G.globalAlpha=.22;
    drawCloudRibbon(BGL[0].x*.35);
    drawPragueSkyline(BGL[0].x*.45,132,.72,'rgba(80,86,90,0.48)');
    drawPragueSkyline(BGL[0].x*.68,172,1,'rgba(54,63,62,0.62)');
    drawRiverAndBridge(BGL[1].x);
    G.restore();
    G.fillStyle='rgba(28,54,48,0.16)';
    G.fillRect(0,ROAD_Y-44,W,48);
  } else {
    // Sky
    const sg=G.createLinearGradient(0,0,0,ROAD_Y);
    sg.addColorStop(0,'#8ca8bc'); sg.addColorStop(.62,'#b2c2c7'); sg.addColorStop(1,'#8aa09a');
    G.fillStyle=sg; G.fillRect(0,0,W,ROAD_Y+4);

    drawCloudRibbon(BGL[0].x*.35);
    drawPragueSkyline(BGL[0].x*.45,132,.72,'rgba(80,86,90,0.48)');
    drawPragueSkyline(BGL[0].x*.68,172,1,'rgba(54,63,62,0.62)');
    drawRiverAndBridge(BGL[1].x);
  }

  // Mid trees
  G.save(); G.translate(-(BGL[1].x%270),0);
  for(let i=-1;i<5;i++){ treeM(i*270+35,198,1.0,'#2f6432'); treeM(i*270+160,178,.85,'#24542a'); }
  G.restore();

  // Grass band
  G.fillStyle='#426f35'; G.fillRect(0,ROAD_Y-24,W,28);
  G.save(); G.translate(-(BGL[2].x%190),0);
  for(let i=-1;i<6;i++){ bush(i*190+25,ROAD_Y-8,1.0); bush(i*190+108,ROAD_Y-4,.78); }
  G.restore();

  // Road
  const rg=G.createLinearGradient(0,ROAD_Y,0,H);
  rg.addColorStop(0,'#766b63'); rg.addColorStop(.45,'#887c70'); rg.addColorStop(1,'#5f574e');
  G.fillStyle=rg; G.fillRect(0,ROAD_Y,W,H-ROAD_Y);
  G.fillStyle='rgba(92,118,130,0.14)'; G.fillRect(0,ROAD_Y,W,H-ROAD_Y);
  drawCobblestones(BGL[2].x);
  drawTramRails(BGL[2].x);

  // Puddles
  PUDDLES.forEach(p=>{
    const px=((p.ox-BGL[2].x*.5%W)+W*3)%W;
    G.save(); G.translate(px,FLOOR_Y+22); G.scale(1,.28);
    G.beginPath(); G.ellipse(0,0,p.w/2,16,0,0,Math.PI*2);
    G.fillStyle=`rgba(130,175,215,${p.a})`; G.fill(); G.restore();
  });

  // Center dashes
  G.setLineDash([28,22]); G.strokeStyle='rgba(225,210,180,0.32)'; G.lineWidth=3;
  G.beginPath(); G.moveTo(0,ROAD_Y+(H-ROAD_Y)*.48); G.lineTo(W,ROAD_Y+(H-ROAD_Y)*.48); G.stroke();
  G.setLineDash([]);

  // Bottom grass
  G.fillStyle='#3f6f34'; G.fillRect(0,H-18,W,18);
  G.fillStyle='#5b8c4d';
  for(let gx=0;gx<W;gx+=18) G.fillRect(gx,H-20+Math.sin(gx*.35)*2,10,5);
}

function drawCloudRibbon(scroll){
  G.save(); G.translate(-(scroll%420),0);
  for(let i=-1;i<4;i++){
    const x=i*420+60;
    G.globalAlpha=.2;
    G.fillStyle='#f0f3ee';
    G.beginPath(); G.ellipse(x,58,78,16,0,0,Math.PI*2); G.fill();
    G.beginPath(); G.ellipse(x+55,76,108,20,0,0,Math.PI*2); G.fill();
    G.beginPath(); G.ellipse(x+190,48,68,13,0,0,Math.PI*2); G.fill();
  }
  G.globalAlpha=1;
  G.restore();
}

function drawPragueSkyline(scroll,baseY,scale,color){
  G.save();
  G.translate(-(scroll%900),0);
  G.scale(scale,scale);
  for(let i=-1;i<3;i++){
    const x=i*900/scale;
    G.fillStyle=color;
    G.beginPath();
    G.moveTo(x,baseY/scale+80);
    G.quadraticCurveTo(x+160,baseY/scale+28,x+300,baseY/scale+52);
    G.quadraticCurveTo(x+510,baseY/scale+84,x+700,baseY/scale+30);
    G.lineTo(x+900,baseY/scale+80);
    G.lineTo(x+900,baseY/scale+130);
    G.lineTo(x,baseY/scale+130);
    G.closePath();
    G.fill();

    drawTower(x+92,baseY/scale+18,34,86);
    drawTower(x+155,baseY/scale+2,22,100);
    drawTower(x+188,baseY/scale+26,28,76);
    drawCastleBlock(x+250,baseY/scale+58,155,56);
    drawSteeple(x+338,baseY/scale+7,36,106);
    drawSteeple(x+376,baseY/scale+18,24,94);
    drawCastleBlock(x+470,baseY/scale+48,130,64);
    drawTower(x+635,baseY/scale+28,40,88);
    drawSteeple(x+724,baseY/scale+26,28,82);
  }
  G.restore();
}

function drawCastleBlock(x,y,w,h){
  G.fillRect(x,y,w,h);
  G.beginPath(); G.moveTo(x-5,y); G.lineTo(x+w*.18,y-22); G.lineTo(x+w*.38,y); G.fill();
  G.beginPath(); G.moveTo(x+w*.48,y); G.lineTo(x+w*.68,y-20); G.lineTo(x+w*.88,y); G.fill();
  for(let n=0;n<4;n++) G.fillRect(x+18+n*30,y+16,10,22);
}

function drawTower(x,y,w,h){
  G.fillRect(x,y,w,h);
  G.beginPath(); G.moveTo(x-6,y); G.lineTo(x+w/2,y-34); G.lineTo(x+w+6,y); G.fill();
  G.fillRect(x+w*.36,y-48,w*.28,20);
}

function drawSteeple(x,y,w,h){
  G.fillRect(x,y+28,w,h-28);
  G.beginPath(); G.moveTo(x-10,y+30); G.lineTo(x+w/2,y-42); G.lineTo(x+w+10,y+30); G.fill();
  G.fillRect(x+w*.43,y-54,w*.14,18);
}

function drawRiverAndBridge(scroll){
  const y=219;
  const rg=G.createLinearGradient(0,y,0,ROAD_Y-18);
  rg.addColorStop(0,'rgba(72,112,130,0.46)');
  rg.addColorStop(1,'rgba(120,154,158,0.22)');
  G.fillStyle=rg; G.fillRect(0,y,W,ROAD_Y-y-14);
  G.save(); G.translate(-(scroll*.42%260),0);
  G.strokeStyle='rgba(232,210,166,0.54)'; G.lineWidth=10;
  G.beginPath(); G.moveTo(-80,246); G.lineTo(W+90,246); G.stroke();
  G.strokeStyle='rgba(88,72,60,0.55)'; G.lineWidth=3;
  for(let i=-1;i<6;i++){
    const bx=i*168;
    G.beginPath();
    G.arc(bx+72,251,42,Math.PI,0);
    G.stroke();
    G.fillStyle='rgba(62,84,92,0.26)';
    G.fillRect(bx+30,250,84,28);
  }
  G.restore();
  G.strokeStyle='rgba(246,221,150,0.32)'; G.lineWidth=1;
  for(let x=0;x<W;x+=54){
    G.beginPath(); G.moveTo(x,232+Math.sin(x*.05+FRAME*.04)*3); G.lineTo(x+28,232+Math.sin(x*.05+FRAME*.04)*3); G.stroke();
  }
}

function drawCobblestones(scroll){
  G.save();
  G.strokeStyle='rgba(56,48,42,0.2)';
  G.lineWidth=1;
  const off=-(scroll%36);
  for(let y=ROAD_Y+14;y<H-22;y+=18){
    const row=((y-ROAD_Y)/18|0)%2 ? 18 : 0;
    for(let x=off-row;x<W+40;x+=36){
      rr(x,y,28,10,4,null,'rgba(40,34,30,0.16)',1);
    }
  }
  G.restore();
}

function drawTramRails(scroll){
  const glint=.25+Math.sin(FRAME*.08)*.08;
  G.strokeStyle=`rgba(210,218,216,${glint})`;
  G.lineWidth=4;
  G.beginPath(); G.moveTo(0,350); G.lineTo(W,350); G.stroke();
  G.beginPath(); G.moveTo(0,394); G.lineTo(W,394); G.stroke();
  G.strokeStyle='rgba(70,62,56,0.32)'; G.lineWidth=2;
  G.save(); G.translate(-(scroll%48),0);
  for(let x=-40;x<W+60;x+=48){
    G.beginPath(); G.moveTo(x,341); G.lineTo(x+26,404); G.stroke();
  }
  G.restore();
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
  if(drawSpriteRider(ci,pa)) return;
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

function drawSpriteCell(row,col,x,y,w,h,sheet){
  const useVariants=sheet==='variants';
  if(useVariants ? !SPRITES.variantsLoaded : !SPRITES.loaded) return false;
  const img=useVariants ? SPRITES.variants : SPRITES.atlas;
  const cw=img.naturalWidth/4, ch=img.naturalHeight/4;
  G.drawImage(img,col*cw,row*ch,cw,ch,x,y,w,h);
  return true;
}

function drawSpriteRider(ci,pa){
  const frame=((Math.floor((pa%(Math.PI*2))/(Math.PI*2)*4)%4)+4)%4;
  return drawSpriteCell(ci,frame,-78,-140,156,156,'variants') || drawSpriteCell(ci,frame,-76,-134,152,152);
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

function drawTokens(){
  TOKENS.forEach(t=>{
    const bob=Math.sin(t.bob)*4;
    G.save(); G.translate(t.x,t.y+bob);
    G.shadowColor='rgba(255,210,90,0.75)';
    G.shadowBlur=10;
    if(t.kind==='macaroon'){
      if(!drawSpriteCell(3,3,-23,-21,46,46,'variants')) drawMacaroonToken(t.spin);
    } else if(t.kind==='postcard'){
      if(!drawSpriteCell(3,3,-25,-22,50,50)) drawPostcardToken(t.spin);
    } else if(!drawSpriteCell(3,2,-22,-22,44,44,'variants') && !drawSpriteCell(3,2,-22,-22,44,44)) drawCrownToken(t.spin);
    G.shadowBlur=0;
    G.restore();
  });
}

function drawCrownToken(spin){
  const squash=.76+.24*Math.abs(Math.cos(spin));
  G.save(); G.scale(squash,1);
  G.fillStyle='#f6c64b';
  G.strokeStyle='#8c5a18';
  G.lineWidth=2;
  G.beginPath();
  G.moveTo(-15,8);
  G.lineTo(-13,-7);
  G.lineTo(-5,1);
  G.lineTo(0,-11);
  G.lineTo(6,1);
  G.lineTo(14,-7);
  G.lineTo(15,8);
  G.closePath();
  G.fill(); G.stroke();
  G.fillStyle='#fff0a0';
  G.fillRect(-11,5,22,4);
  G.restore();
}

function drawPostcardToken(spin){
  const squash=.78+.22*Math.abs(Math.cos(spin));
  G.save(); G.scale(squash,1);
  rr(-16,-11,32,22,3,'#f4ead7','#7a5a36',2);
  G.fillStyle='#5c8db7'; G.fillRect(-13,-8,14,8);
  G.fillStyle='#d75b49'; G.beginPath(); G.moveTo(-13,0); G.lineTo(-6,-7); G.lineTo(2,0); G.fill();
  G.strokeStyle='#9d7a4f'; G.lineWidth=1;
  G.beginPath(); G.moveTo(5,-6); G.lineTo(13,-6); G.moveTo(5,-1); G.lineTo(13,-1); G.moveTo(5,4); G.lineTo(11,4); G.stroke();
  G.restore();
}

function drawMacaroonToken(spin){
  const squash=.78+.22*Math.abs(Math.cos(spin));
  G.save(); G.scale(squash,1);
  G.fillStyle='#f3c54f'; rr(-18,2,22,11,6,'#f3c54f','#8f6b2c',1.5);
  G.fillStyle='#f29bb8'; rr(-6,-10,25,12,7,'#f29bb8','#9f4d68',1.5);
  G.fillStyle='#b5dc78'; rr(-2,10,24,11,6,'#b5dc78','#5f7d36',1.5);
  G.fillStyle='rgba(255,255,255,0.45)';
  G.beginPath(); G.ellipse(6,-7,7,2,-.2,0,Math.PI*2); G.fill();
  G.restore();
}

function drawBranch(ob){
  if(ob.warn<=0 && (SPRITES.variantsLoaded||SPRITES.loaded)){
    G.rotate(ob.rot);
    if(!drawSpriteCell(3,0,-64,-44,128,76,'variants')) drawSpriteCell(3,0,-62,-44,124,74);
    return;
  }
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
  if(ob.warn<=0 && (SPRITES.variantsLoaded||SPRITES.loaded)){
    G.rotate(ob.rot||.12);
    if(!drawSpriteCell(3,1,-78,-58,156,114,'variants')) drawSpriteCell(3,1,-76,-56,152,112);
    return;
  }
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
  if(SPRITES.variantsLoaded || SPRITES.loaded){
    const frame=SPRITES.variantsLoaded ? (ob.variant||0) : (((Math.floor(FRAME/10+(ob.ph||0))%4)+4)%4);
    G.fillStyle='rgba(0,0,0,0.18)';
    G.beginPath(); G.ellipse(0,35,23,6,0,0,Math.PI*2); G.fill();
    if(!drawSpriteCell(2,frame,-52,-83,104,104,'variants')) drawSpriteCell(2,frame,-50,-78,100,100);
    return;
  }
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

  rr(W/2-66,8,132,35,8,'rgba(38,28,16,0.82)','#9c742a',2);
  G.fillStyle='#ffe27a'; G.font='bold 12px monospace'; G.fillText('Kč '+coins,W/2-48,31);
  if(combo>1){
    G.fillStyle='#ffd1aa'; G.font='bold 11px monospace'; G.fillText('x'+combo,W/2+24,31);
  }

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
  G.fillStyle='rgba(9,17,22,0.56)'; G.fillRect(0,0,W,H);
  const halo=G.createRadialGradient(W/2,150,20,W/2,150,250);
  halo.addColorStop(0,'rgba(255,224,150,0.22)');
  halo.addColorStop(1,'rgba(255,224,150,0)');
  G.fillStyle=halo; G.fillRect(0,0,W,H);
  G.textAlign='center';
  const ty=70+Math.sin(FRAME*.035)*6;
  G.shadowColor='#1e2a2c'; G.shadowBlur=18;
  G.fillStyle='#f3d88c'; G.font='bold 54px monospace'; G.fillText('PRAGUE',W/2,ty+50);
  G.fillStyle='#ff7b4a'; G.shadowColor='#ffb06a'; G.shadowBlur=12;
  G.font='bold 54px monospace'; G.fillText('BIKE PANIC',W/2,ty+105);
  G.shadowBlur=0;
  G.fillStyle='#d6e5df'; G.font='italic 14px monospace'; G.fillText('Rain, cobbles, crowns, and very bad timing',W/2,ty+134);

  // Char preview
  for(let i=0;i<2;i++){
    const cx=W/2-110+i*220;
    const sel=i===selectedChar;
    G.shadowColor=sel?'rgba(255,226,122,0.65)':'transparent';
    G.shadowBlur=sel?16:0;
    rr(cx-72,ty+153,144,162,8,sel?'rgba(40,48,38,0.84)':'rgba(18,32,36,0.72)',i===0?'#e8a35c':'#7ed37a',2);
    G.shadowBlur=0;
    G.save(); G.translate(cx,ty+258); G.scale(.72,.72); drawBikeRider(CHARS[i],FRAME*.06,i); G.restore();
    G.fillStyle=i===0?'#ffd28b':'#a8f0a4'; G.font='bold 13px monospace'; G.fillText(CHARS[i].name,cx,ty+298);
  }

  const blink=(FRAME/28|0)%2;
  G.fillStyle=blink?'#ffe27a':'#c89635'; G.font='bold 16px monospace';
  G.fillText('Press ENTER or SPACE to Start',W/2,ty+335);
  G.fillStyle='#b6c5be'; G.font='11px monospace';
  G.fillText('Move: arrows/A-D   Jump: Space/W/↑   Fullscreen: F',W/2,ty+360);
  G.textAlign='left';
}

// ══════════════════════════════════════════════════════════
//  CHAR SELECT
// ══════════════════════════════════════════════════════════
function drawCharSelect(){
  drawBG();
  drawRain();
  G.fillStyle='rgba(8,12,18,0.58)'; G.fillRect(0,0,W,H);
  G.textAlign='center';
  G.fillStyle='#f3d88c'; G.font='bold 27px monospace'; G.fillText('CHOOSE YOUR RIDER',W/2,52);
  G.fillStyle='#c9d7d0'; G.font='13px monospace'; G.fillText('← → to switch   ENTER or SPACE to ride',W/2,78);

  for(let i=0;i<2;i++){
    const cx=W/2-158+i*316, sel=selectedChar===i;
    G.shadowColor=sel?'#ffd37c':'transparent'; G.shadowBlur=sel?22:0;
    rr(cx-108,96,216,322,8,sel?'rgba(42,48,42,0.94)':'rgba(18,30,34,0.84)',sel?'#ffd37c':'#49605c',2);
    G.shadowBlur=0;
    G.save(); G.translate(cx,258); G.scale(1.12,1.12); drawBikeRider(CHARS[i],FRAME*.07,i); G.restore();
    const ch=CHARS[i];
    G.fillStyle=sel?'#ffe27a':'#cfe3da'; G.font='bold 17px monospace'; G.fillText(ch.name,cx,316);
    G.fillStyle='#b7c8c0'; G.font='12px monospace'; G.fillText(ch.tagline,cx,338);
    G.fillStyle=sel?'#aaffaa':'#86a786'; G.font='12px monospace'; G.fillText(ch.badge,cx,358);
    G.fillStyle=sel?'#ffb070':'#6f8580'; G.font='11px monospace'; G.fillText(sel?'SELECTED':'press ← →',cx,388);
  }
  G.textAlign='left';
}

// ══════════════════════════════════════════════════════════
//  GAME OVER
// ══════════════════════════════════════════════════════════
function drawGameOver(){
  G.fillStyle='rgba(8,12,12,0.74)'; G.fillRect(0,0,W,H);
  G.textAlign='center';
  G.shadowColor='#b03f2c'; G.shadowBlur=18;
  G.fillStyle='#ff7b4a'; G.font='bold 46px monospace'; G.fillText('WIPED OUT!',W/2,168);
  G.shadowBlur=0;
  G.fillStyle='#ffe27a'; G.font='20px monospace'; G.fillText('Score: '+Math.floor(score),W/2,218);
  G.fillStyle='#f4ead7'; G.font='15px monospace'; G.fillText('Crowns: '+coins,W/2,244);
  if(score>=best){
    G.fillStyle='#ffff90'; G.font='bold 18px monospace'; G.fillText('NEW BEST',W/2,276);
  } else {
    G.fillStyle='#cfe3da'; G.font='16px monospace'; G.fillText('Best: '+Math.floor(best),W/2,276);
  }
  const blink=(FRAME/22|0)%2;
  G.fillStyle=blink?'#ffe27a':'#9d7a4f'; G.font='bold 16px monospace';
  G.fillText('Press ENTER or SPACE to Ride Again',W/2,318);
  G.fillStyle='#8fa49e'; G.font='12px monospace'; G.fillText('TAB = change character',W/2,342);
  G.textAlign='left';
}
