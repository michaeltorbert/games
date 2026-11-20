// Grade 2-A Chapters 2-3 pictures (issue #223): original SVG renderings of
// clocks, a practice calendar, a day strip, number lines, ten-frames, number
// rainbows, rule and addition tables, groups, a package, and a code key.
// Pure string output, no DOM or state. Each accessible description says what
// a sighted learner sees (hand positions, columns, labels) and never states
// the answer, except where reading the picture is the task itself (a full
// rainbow, a code key).
const PLACE_BOOK_2A_VISUALS=(()=>{
  'use strict';
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ABBR=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const COLUMN=['first','second','third','fourth','fifth','sixth','seventh'];
  const INK='#233f3b',TEXT='#173f35',FACE='#fffdf6',TEAL='#63ad91',GOLD='#e2c36b',BLUE='#8bb9dd',RED='#d9822b';
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const text=(x,y,t,size=16,extra='')=>`<text x="${x}" y="${y}" fill="${TEXT}" font-size="${size}" text-anchor="middle" ${extra}>${esc(t)}</text>`;
  const line=(x1,y1,x2,y2,w=3,color=INK)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
  const rect=(x,y,w,h,fill='#fff',stroke='#234e42')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
  const dot=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="#234e42" stroke-width="1.5"/>`;
  const nh=h=>h%12+1;
  const polar=(cx,cy,r,deg)=>[cx+r*Math.sin(deg*Math.PI/180),cy-r*Math.cos(deg*Math.PI/180)];
  // One analog face. The hour hand moves continuously: (hour + minute/60) x 30 degrees.
  function face(cx,cy,R,hour,minute,labels){
    let body=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${FACE}" stroke="${INK}" stroke-width="3"/>`;
    for(let i=0;i<60;i++){const [x1,y1]=polar(cx,cy,R-2,i*6),[x2,y2]=polar(cx,cy,R-(i%5?5:9),i*6);body+=line(x1,y1,x2,y2,i%5?1:2);}
    for(let n=1;n<=12;n++){const [x,y]=polar(cx,cy,R*0.74,n*30);body+=text(x,y+R*0.09,String(n),Math.round(R*0.22),'font-weight="600"');
      if(labels){const [mx,my]=polar(cx,cy,R*0.5,n*30);body+=text(mx,my+R*0.05,String(n===12?0:5*n).padStart(2,'0'),Math.round(R*0.13),'fill-opacity="0.8"');}}
    if(hour!==null&&hour!==undefined){const [x,y]=polar(cx,cy,R*0.48,((hour%12)+(minute??0)/60)*30);body+=line(cx,cy,x,y,Math.max(4,R*0.07));}
    if(minute!==null&&minute!==undefined){const [x,y]=polar(cx,cy,R*0.82,minute*6);body+=line(cx,cy,x,y,Math.max(2.5,R*0.035),'#1d6b58');}
    return body+dot(cx,cy,Math.max(3,R*0.05),INK);
  }
  const handWords=(hour,minute)=>{
    const parts=[];
    if(hour!==null&&hour!==undefined)parts.push(!minute?`the short hour hand points at ${hour}`:minute===30?`the short hour hand is halfway between ${hour} and ${nh(hour)}`:minute>30?`the short hour hand is between ${hour} and ${nh(hour)}, close to ${nh(hour)}`:`the short hour hand is just past ${hour}, between ${hour} and ${nh(hour)}`);
    if(minute!==null&&minute!==undefined)parts.push(`the long minute hand points at ${minute/5||12}`);
    return parts.length?parts.join(', and '):'no hands are shown';
  };
  const hourLabel=H=>{H=((H%24)+24)%24;return H===0?'12 midnight':H===12?'12 noon':`${H%12||12} ${H<12?'AM':'PM'}`;};
  const R={};
  R.clock=v=>[face(160,107,96,v.hour,v.minute,v.labels),
    `A clock face with the numbers 1 to 12${v.labels?' and small minute labels counting by fives':''}: ${handWords(v.hour,v.minute)}.`];
  R['clock-set']=v=>{const n=v.clocks.length,gap=320/n;let body='';const said=[];
    v.clocks.forEach((c,i)=>{const cx=gap*(i+0.5);body+=face(cx,92,n===3?46:58,c.hour,c.minute,false)+text(cx,n===3?168:182,n===3?`Clock ${c.label}`:c.label,17,'font-weight="700"');said.push(`${n===3?`Clock ${c.label}`:c.label}: ${handWords(c.hour,c.minute)}`);});
    return [body,`${n} clocks. ${said.join('. ')}.`];};
  // 24 one-hour boxes; an overnight strip runs noon to noon so the night is unbroken.
  R['day-strip']=v=>{const from=v.overnight?12:0,w=12.5,x0=10;let body='';
    for(let i=0;i<24;i++){const H=(from+i)%24;body+=rect(x0+i*w,80,w,34,H>=6&&H<18?'#fff4d6':'#dfe8f2');}
    for(let i=0;i<=24;i+=6){const H=(from+i)%24;body+=line(x0+i*w,74,x0+i*w,120,2)+text(x0+i*w,140,H===0?'midnight':H===12?'noon':hourLabel(H),11);}
    const at=H=>x0+((H-from+24)%24||(H!==from?24:0))*w;
    // end:null shows only a start; start===end shows only an end (the unknown is the other).
    const hasEnd=v.end!==null&&v.end!==undefined,hasStart=!hasEnd||v.start!==v.end,said=[];
    if(hasStart){body+=`<polygon points="${at(v.start)-7},62 ${at(v.start)+7},62 ${at(v.start)},76" fill="${TEAL}" stroke="${INK}"/>`+text(at(v.start),52,'start',12);said.push(`the start mark is at ${hourLabel(v.start)}`);}
    if(hasEnd){const e=v.end===24?x0+(24-from)*w:at(v.end);body+=`<polygon points="${e-7},62 ${e+7},62 ${e},76" fill="${GOLD}" stroke="${INK}"/>`+text(e,hasStart?36:52,'end',12);said.push(`the end mark is at ${hourLabel(v.end)}${v.overnight&&v.end<12?' in the morning':''}`);}
    body+=text(160,180,v.overnight?'One box is one hour, from noon to the next noon':'One box is one hour, from midnight to midnight',12);
    return [body,`A day strip with one box for each hour, from ${v.overnight?'12 noon to the next 12 noon':'12 midnight to the next 12 midnight'}; ${said.join(', and ')}.`];};
  const leap=y=>y%4===0&&(y%100!==0||y%400===0);
  const days=(y,m)=>m===1?(leap(y)?29:28):[31,0,31,30,31,30,31,31,30,31,30,31][m];
  const wday=(y,m,d)=>{const t=[0,3,2,5,0,3,5,1,4,6,2,4],yy=m<2?y-1:y;return (yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)+t[m]+d)%7;};
  R.calendar=v=>{const first=wday(v.year,v.month,1),n=days(v.year,v.month),cw=42,x0=13,y0=48,ch=26;let body=text(160,20,`Practice calendar: ${MONTHS[v.month]}, ${v.year}`,15,'font-weight="700"');
    ABBR.forEach((a,i)=>{body+=rect(x0+i*cw,28,cw,18,'#dcefe5')+text(x0+i*cw+cw/2,42,a,12,'font-weight="600"');});
    const marks=new Map((v.marks||[]).map(m=>[m.day,m.label])),said=[];
    for(let d=1;d<=n;d++){const c=(first+d-1)%7,row=Math.floor((first+d-1)/7),x=x0+c*cw,y=y0+row*ch,mark=marks.get(d);
      body+=rect(x,y,cw,ch,mark?'#fff1c9':'#fff')+text(x+(mark?14:cw/2),y+18,String(d),13);
      if(mark){body+=text(x+cw-11,y+19,mark,14);said.push(`${mark==='★'?'a star':'a dot'} is in week row ${row+1}, the ${COLUMN[c]} column (${ABBR[c]})`);}}
    return [body,`Practice calendar for the month of ${MONTHS[v.month]}, year ${v.year}, with columns ${ABBR.join(', ')}. Day 1 is in the ${COLUMN[first]} column (${ABBR[first]}). The month has ${n} days.${said.length?` In it, ${said.join('; ')}.`:''}`];};
  R['number-line']=v=>{const x0=24,x1=296,span=v.to-v.from,px=n=>x0+(n-v.from)*(x1-x0)/span;let body=line(x0,120,x1,120,3);
    const step=v.step||1;for(let n=v.from;n<=v.to;n+=step){body+=line(px(n),110,px(n),130,2)+text(px(n),152,String(n),span/step>12?11:14);}
    if(step>1)for(let n=v.from;n<=v.to;n++)body+=line(px(n),115,px(n),125,1);
    (v.marks||[]).forEach(m=>{body+=dot(px(m),98,7,GOLD)+text(px(m),80,String(m),14,'font-weight="700"');});
    return [body,`A number line from ${v.from} to ${v.to}${step>1?` marked every ${step}`:''}, with ${v.marks.length===1?'a dot':'dots'} at ${v.marks.join(' and ')}.`];};
  const frame=(x,y,count,fill)=>{let b='';for(let i=0;i<10;i++){const cx=x+(i%5)*26,cy=y+Math.floor(i/5)*26;b+=rect(cx,cy,26,26,'#fff');if(i<count)b+=dot(cx+13,cy+13,9,fill);}return b;};
  R['ten-frames']=v=>[frame(15,70,v.a,TEAL)+frame(170,70,v.b,GOLD)+text(80,150,`${v.a}`,16)+text(235,150,`${v.b}`,16),
    `Two ten-frames: the first has ${v.a} teal dot${v.a===1?'':'s'} and the second has ${v.b} gold dot${v.b===1?'':'s'}.`];
  // Arcs join i and T-i. For an even total the middle number pairs with itself:
  // a short line drops to a second copy of it below (hiddenCopy hides that copy).
  R.rainbow=v=>{const T=v.total,x=i=>18+i*(284/T),base=150,row=170;let body='';const pairs=[];
    const hidden=v.hiddenCopy?null:v.hidden;
    for(let i=0;i<T/2;i++){const j=T-i,r=(x(j)-x(i))/2;
      body+=`<path d="M${x(i)} ${base} A ${r} ${Math.min(r,base-6)} 0 0 1 ${x(j)} ${base}" fill="none" stroke="${['#d9822b','#e2c36b','#63ad91','#8bb9dd','#9b88c9','#d98aa5','#7fb36a','#c9a26a'][i%8]}" stroke-width="3"/>`;
      pairs.push(i===hidden?`a blank and ${j}`:j===hidden?`${i} and a blank`:`${i} and ${j}`);}
    for(let i=0;i<=T;i++)body+=(i===hidden?rect(x(i)-9,row-16,18,22,'#fff4d6')+text(x(i),row,'?',15):text(x(i),row,String(i),T>12?12:14));
    let self='';
    if(T%2===0){const m=T/2,cx=x(m);body+=line(cx,row+6,cx,row+20,3,'#9b88c9');
      body+=v.hiddenCopy?rect(cx-10,row+22,20,22,'#fff4d6')+text(cx,row+38,'?',15):text(cx,row+38,String(m),T>12?12:14);
      self=v.hiddenCopy?` A short line goes down from ${m} to a blank below it.`:` A short line joins ${m} to a second ${m} below it, because ${m} + ${m} = ${T}.`;}
    return [body,`A number rainbow for ${T}: arcs join ${pairs.join(', ')}.${self}${hidden!==null&&hidden!==undefined?' One number on the bottom row is a blank.':''}`];};
  R['io-table']=v=>{const n=v.inputs.length,w=Math.min(60,240/n),x0=70;let body=text(160,40,`Rule: ${v.rule}`,18,'font-weight="700"')+rect(10,60,x0-10,40,'#dcefe5')+text(40,86,'In',15)+rect(10,100,x0-10,40,'#dcefe5')+text(40,126,'Out',15);
    v.inputs.forEach((a,i)=>{const o=v.outputs[i];body+=rect(x0+i*w,60,w,40)+text(x0+i*w+w/2,86,String(a),16)+rect(x0+i*w,100,w,40,o===null?'#fff4d6':'#fff')+text(x0+i*w+w/2,126,o===null?'?':String(o),16);});
    return [body,`A rule table, rule ${v.rule}. In: ${v.inputs.join(', ')}. Out: ${v.outputs.map(o=>o===null?'empty':o).join(', ')}.`];};
  R['add-table']=v=>{const cw=56,ch=40,x0=50,y0=30;let body=rect(x0,y0,cw,ch,'#dcefe5')+text(x0+cw/2,y0+27,'+',20);const said=[];
    v.cols.forEach((c,j)=>{body+=rect(x0+(j+1)*cw,y0,cw,ch,'#dcefe5')+text(x0+(j+1)*cw+cw/2,y0+27,String(c),17,'font-weight="700"');});
    v.rows.forEach((r,i)=>{body+=rect(x0,y0+(i+1)*ch,cw,ch,'#dcefe5')+text(x0+cw/2,y0+(i+1)*ch+27,String(r),17,'font-weight="700"');const cells=[];
      v.cols.forEach((c,j)=>{const hide=v.hidden[0]===i&&v.hidden[1]===j;body+=rect(x0+(j+1)*cw,y0+(i+1)*ch,cw,ch,hide?'#fff4d6':'#fff')+text(x0+(j+1)*cw+cw/2,y0+(i+1)*ch+27,hide?'?':String(r+c),17);cells.push(hide?'empty':r+c);});
      said.push(`row ${r}: ${cells.join(', ')}`);});
    return [body,`An addition table with columns ${v.cols.join(', ')}; ${said.join('; ')}.`];};
  R.groups=v=>{const [a,b]=v.groups;let body='';const place=(count,x0,fill)=>{for(let i=0;i<count;i++){const col=v.paired?Math.floor(i/2):i%5,row=v.paired?i%2:Math.floor(i/5);body+=dot(x0+col*24,80+row*28,9,fill);}};
    place(a,24,RED);place(b,178,BLUE);body+=line(160,50,160,170,2,'#9bb5ab');
    return [body,`Two groups of dots${v.paired?' set out in pairs':''}: ${a} red on the left and ${b} blue on the right.`];};
  R.packages=v=>{let body=`<rect x="90" y="40" width="140" height="110" rx="8" fill="#e8ce95" stroke="${INK}" stroke-width="3"/>`;
    for(let i=0;i<v.size;i++){const col=i%6,row=Math.floor(i/6);body+=`<rect x="${104+col*20}" y="${58+row*44}" width="10" height="36" rx="3" fill="${GOLD}" stroke="${INK}"/>`;}
    return [body+text(160,180,`1 box = ${v.size} pencils`,17,'font-weight="700"'),`One closed box holds ${v.size} pencils. Boxes cannot be split.`];};
  R['code-key']=v=>{const n=v.key.length,w=Math.min(48,290/n),x0=160-n*w/2;let body=text(160,40,'Code key',17,'font-weight="700"');
    v.key.forEach(([num,l],i)=>{body+=rect(x0+i*w,60,w,40,'#dcefe5')+text(x0+i*w+w/2,86,String(num),16)+rect(x0+i*w,100,w,40)+text(x0+i*w+w/2,127,l,18,'font-weight="700"');});
    return [body,`A code key. ${v.key.map(([num,l])=>`${num} means ${l}`).join(', ')}.`];};
  const KINDS=new Set(Object.keys(R));
  function svg(v){const [body,label]=R[v.kind](v);return `<svg viewBox="0 0 320 215" role="img" aria-label="${esc(label)}">${body}</svg>`;}
  const describe=v=>R[v.kind](v)[1];
  return Object.freeze({has:kind=>KINDS.has(kind),svg,describe,KINDS:Object.freeze([...KINDS])});
})();
globalThis.PLACE_BOOK_2A_VISUALS=PLACE_BOOK_2A_VISUALS;
