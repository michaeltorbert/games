// ── CHARACTERS ────────────────────────────────────────────
const CHARS = [
  { name:'Michael', shirt:'#dd5599', hair:'#c0b08a', skin:'#f5c09a', shorts:'#c49060',
    jumpV:-13, moveSpd:1.0, invFrames:90, maxHits:3, tagline:'Sturdy & forgiving', badge:'❤ +1 Life' },
  { name:'Sydney',  shirt:'#44aa44', hair:'#180e0e', skin:'#f5c09a', shorts:'#1a1a1a',
    jumpV:-15, moveSpd:1.25, invFrames:60, maxHits:2, tagline:'Fast & agile', badge:'⚡ Extra speed' },
];

function riderMichael(ch,pa){
  const lf=pa, lb=pa+Math.PI;
  // Legs
  G.strokeStyle='#b08050'; G.lineWidth=6;
  G.beginPath(); G.moveTo(-8,-20); G.lineTo(-8+Math.cos(lb)*13,-20+Math.sin(lb)*15);
  G.lineTo(-8+Math.cos(lb)*13+Math.cos(lb+.9)*8,-20+Math.sin(lb)*15+Math.sin(lb+.9)*8); G.stroke();
  G.strokeStyle='#c49070'; G.lineWidth=6;
  G.beginPath(); G.moveTo(-8,-20); G.lineTo(-8+Math.cos(lf)*13,-20+Math.sin(lf)*15);
  G.lineTo(-8+Math.cos(lf)*13+Math.cos(lf+.9)*8,-20+Math.sin(lf)*15+Math.sin(lf+.9)*8); G.stroke();
  // Shoes
  G.fillStyle='#6688aa';
  [[lf],[lb]].forEach(([a])=>{
    G.beginPath(); G.ellipse(-8+Math.cos(a)*13+Math.cos(a+.9)*11,-20+Math.sin(a)*15+Math.sin(a+.9)*9,8,4,a+.5,0,Math.PI*2); G.fill();
  });
  // Shorts
  rr(-18,-42,26,22,5,'#c49070',null);
  // Pink polo
  rr(-20,-66,30,26,5,ch.shirt,null);
  G.fillStyle='#e890bb'; G.beginPath(); G.moveTo(-3,-66); G.lineTo(3,-66); G.lineTo(0,-58); G.fill();
  // Backpack
  rr(-26,-70,16,32,5,'#2d4060',null);
  rr(-27,-58,5,12,3,'#3d5070',null);
  // Arms
  G.strokeStyle=ch.skin; G.lineWidth=7;
  G.beginPath(); G.moveTo(-16,-58); G.lineTo(-18,-36); G.stroke();
  G.beginPath(); G.moveTo(10,-60); G.lineTo(18,-42); G.stroke();
  G.strokeStyle=ch.shirt; G.lineWidth=8;
  G.beginPath(); G.moveTo(-16,-58); G.lineTo(-14,-52); G.stroke();
  G.beginPath(); G.moveTo(8,-60); G.lineTo(14,-50); G.stroke();
  // Head
  G.fillStyle=ch.skin; G.beginPath(); G.arc(2,-78,15,0,Math.PI*2); G.fill();
  // Hair
  G.fillStyle=ch.hair;
  G.beginPath(); G.arc(2,-84,14,Math.PI,Math.PI*2); G.fill();
  G.beginPath(); G.arc(-8,-78,6,Math.PI*.4,Math.PI*1.5); G.fill();
  // Stubble
  G.fillStyle='rgba(155,135,110,0.5)'; G.beginPath(); G.arc(3,-74,8,0,Math.PI); G.fill();
  // Eyes
  G.fillStyle='#333';
  G.beginPath(); G.arc(-3,-79,2.5,0,Math.PI*2); G.fill();
  G.beginPath(); G.arc(7,-79,2.5,0,Math.PI*2); G.fill();
  G.fillStyle='#fff';
  G.beginPath(); G.arc(-2,-80,1.2,0,Math.PI*2); G.fill();
  G.beginPath(); G.arc(8,-80,1.2,0,Math.PI*2); G.fill();
  // Grin
  G.strokeStyle='#885533'; G.lineWidth=1.8;
  G.beginPath(); G.arc(2,-73,5,.15,Math.PI-.15); G.stroke();
}

function riderSydney(ch,pa){
  const lf=pa, lb=pa+Math.PI;
  // Legs (black shorts)
  G.strokeStyle='#1a1a1a'; G.lineWidth=6;
  [[lf],[lb]].forEach(([a])=>{
    G.beginPath(); G.moveTo(-8,-20); G.lineTo(-8+Math.cos(a)*10,-20+Math.sin(a)*13); G.stroke();
  });
  G.strokeStyle=ch.skin; G.lineWidth=5;
  [[lf],[lb]].forEach(([a])=>{
    const kx=-8+Math.cos(a)*10, ky=-20+Math.sin(a)*13;
    G.beginPath(); G.moveTo(kx,ky); G.lineTo(kx+Math.cos(a+.85)*9,ky+Math.sin(a+.85)*9); G.stroke();
  });
  // Shoes
  G.fillStyle='#fff';
  [[lf],[lb]].forEach(([a])=>{
    const kx=-8+Math.cos(a)*10, ky=-20+Math.sin(a)*13;
    G.beginPath(); G.ellipse(kx+Math.cos(a+.85)*11,ky+Math.sin(a+.85)*10,7,4,a+.5,0,Math.PI*2); G.fill();
  });
  // Shorts
  rr(-18,-40,26,20,5,'#1a1a1a',null);
  // Green striped top
  rr(-18,-68,28,30,5,ch.shirt,null);
  for(let si=0;si<4;si++){ G.fillStyle=`rgba(255,255,255,${si%2?.14:.06})`; G.fillRect(-18,-66+si*7.5,28,7.5); }
  // Backpack
  rr(-24,-68,14,26,4,'#5a3535',null);
  rr(-25,-58,4,10,3,'#6a4545',null);
  // Arms
  G.strokeStyle=ch.skin; G.lineWidth=6;
  G.beginPath(); G.moveTo(-14,-56); G.lineTo(-18,-38); G.stroke();
  G.beginPath(); G.moveTo(10,-58); G.lineTo(18,-42); G.stroke();
  // Head
  G.fillStyle=ch.skin; G.beginPath(); G.arc(2,-78,14,0,Math.PI*2); G.fill();
  // Dark hair
  G.fillStyle=ch.hair;
  G.beginPath(); G.arc(2,-84,13,Math.PI,Math.PI*2); G.fill();
  G.fillRect(-6,-88,18,8);
  G.beginPath(); G.arc(-6,-78,6,Math.PI*.4,Math.PI*1.5); G.fill();
  // Hair flowing back
  G.strokeStyle=ch.hair; G.lineWidth=8;
  G.beginPath(); G.moveTo(13,-82); G.quadraticCurveTo(22,-74,19,-62); G.stroke();
  G.lineWidth=5;
  G.beginPath(); G.moveTo(12,-76); G.quadraticCurveTo(20,-68,17,-58); G.stroke();
  // Eyes
  G.fillStyle='#333';
  G.beginPath(); G.arc(-2,-79,2.5,0,Math.PI*2); G.fill();
  G.beginPath(); G.arc(7,-79,2.5,0,Math.PI*2); G.fill();
  G.fillStyle='#fff';
  G.beginPath(); G.arc(-1,-80,1.2,0,Math.PI*2); G.fill();
  G.beginPath(); G.arc(8,-80,1.2,0,Math.PI*2); G.fill();
  // Smile
  G.strokeStyle='#aa6655'; G.lineWidth=1.8;
  G.beginPath(); G.arc(2,-73,4.5,.15,Math.PI-.15); G.stroke();
}

function miniHead(ci){
  const ch=CHARS[ci];
  G.fillStyle=ch.skin; G.beginPath(); G.arc(0,0,14,0,Math.PI*2); G.fill();
  G.fillStyle=ch.hair; G.beginPath(); G.arc(0,-6,13,Math.PI,Math.PI*2); G.fill();
  if(ci===1){ G.fillRect(-7,-10,16,6); }
  G.fillStyle='#333';
  G.beginPath(); G.arc(-4,0,2.5,0,Math.PI*2); G.fill();
  G.beginPath(); G.arc(4,0,2.5,0,Math.PI*2); G.fill();
  if(ci===0){
    G.fillStyle='rgba(150,120,90,0.5)'; G.beginPath(); G.arc(1,5,7,0,Math.PI); G.fill();
  }
}
