// ══════════════════════════════════════════════════════════
//  SPAWN
// ══════════════════════════════════════════════════════════
function spawnObs(){
  if(Math.random()<.45){
    OBS.push({t:'branch',x:W+30,y:ROAD_Y+20,tY:FLOOR_Y-6,vy:0,warn:52,rot:.2+Math.random()*.4,fall:false,settled:false,w:50,h:16,nm:false});
  } else {
    OBS.push({t:'hippy',x:W+38,y:FLOOR_Y-28,ph:Math.random()*Math.PI*2,w:26,h:52,vx:-(1.5+Math.random()*1.8),wt:0,nm:false});
  }
}
function spawnBigLog(){
  OBS.push({t:'biglog',x:W+75,y:ROAD_Y+5,tY:FLOOR_Y-10,vy:0,warn:95,rot:.1+Math.random()*.15,fall:false,settled:false,w:100,h:32,nm:false});
  bigFlash=52;
  bigLogNext=FRAME+950+Math.random()*600;
}

// ══════════════════════════════════════════════════════════
//  COLLISION
// ══════════════════════════════════════════════════════════
function hitTest(ob){
  if(P.inv>0) return false;
  const dx=Math.abs(P.x-ob.x), dy=Math.abs(P.y-ob.y);
  return dx<(ob.w/2+18)*.75 && dy<(ob.h/2+16)*.68;
}
function doHit(){
  if(P.inv>0) return;
  const ch=CHARS[selectedChar];
  P.hits++; P.inv=ch.invFrames;
  shakeT=16; shakeM=7;
  POPS.push({x:P.x-25,y:P.y-82,t:'OUCH!',l:50,c:'#ff4444',s:20});
  if(P.hits>=ch.maxHits) STATE='gameover';
}
