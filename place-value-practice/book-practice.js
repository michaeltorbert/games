(() => {
  'use strict';
  const api=PLACE_BOOK,KEY='place-value-practice:book:v1';
  let state=null,raw=null,active=false,writable=true,busy=false,notice='';
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
  const panel=node('main',null,'book-practice');panel.hidden=true;panel.id='book-practice';
  const title=node('h2','Book practice'),scope=node('p'),setup=node('div',null,'arithmetic-setup'),select=node('select'),restart=node('button','Start new book session','button');
  select.setAttribute('aria-label','Book chapter');for(const [value,label] of [[0,'All completed lessons'],[5,'Facts and word problems'],[6,'Shapes and fractions'],[7,'Measurement'],[8,'Adding and subtracting'],[9,'Graphs'],[10,'Coins']]){const option=node('option',label);option.value=value;select.append(option);}setup.append(select,restart);
  const drive=node('section',null,'book-drive'),score=node('p'),field=node('div',null,'book-field'),ball=node('span','🏈');field.append(ball);drive.append(score,field);
  const question=node('h3'),visual=node('div',null,'book-visual'),choices=node('div',null,'arithmetic-choices'),feedback=node('p'),help=node('p'),next=node('button','Next','button button--primary'),message=node('p');
  question.id='book-question';choices.setAttribute('aria-labelledby',question.id);feedback.setAttribute('role','status');message.setAttribute('role','status');
  panel.append(title,scope,setup,drive,question,visual,choices,feedback,help,next,message);
  document.getElementById('practice').after(panel);
  function svg(v){
    if(!v)return '';
    const line=(x1,y1,x2,y2)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#233f3b" stroke-width="3"/>`;
    const text=(x,y,t)=>`<text x="${x}" y="${y}" fill="#173f35" font-size="18" text-anchor="middle">${t}</text>`;
    const rect=(x,y,w,h,fill='#63ad91')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#234e42" stroke-width="2"/>`;
    let body='';
    if(v.kind==='shape'){
      const points={triangle:'100,155 220,155 160,35',rectangle:'70,60 250,60 250,145 70,145',square:'100,35 220,35 220,155 100,155',hexagon:'100,35 220,35 265,95 220,155 100,155 55,95',rhombus:'160,25 245,95 160,165 75,95'};
      body=v.name==='circle'?'<circle cx="160" cy="95" r="65" fill="#8bb9dd" stroke="#234e42" stroke-width="3"/>':`<polygon points="${points[v.name]}" fill="#8bb9dd" stroke="#234e42" stroke-width="3"/>`;
    }else if(v.kind==='solid'){
      if(v.name==='cone')body='<path d="M90 150 L160 30 L230 150" fill="#dbb96e" stroke="#234e42" stroke-width="3"/><ellipse cx="160" cy="150" rx="70" ry="18" fill="#e8ce95" stroke="#234e42" stroke-width="3"/>';
      else if(v.name==='cylinder')body='<path d="M100 55 V145 Q160 185 220 145 V55" fill="#8bb9dd" stroke="#234e42" stroke-width="3"/><ellipse cx="160" cy="55" rx="60" ry="20" fill="#c1dcee" stroke="#234e42" stroke-width="3"/>';
      else{const w=v.name==='cube'?100:155;body=rect(75,65,w,100)+`<path d="M75 65 L110 35 L${110+w} 35 L${75+w} 65 M${75+w} 65 L${110+w} 35 V135 L${75+w} 165" fill="#b8d9c9" stroke="#234e42" stroke-width="3"/>`;}
    }else if(v.kind==='partition'){
      body=rect(80,20,160,160,'#fff');
      if(v.diagonal){body+=line(80,20,240,180);if(v.parts===4)body+=line(240,20,80,180);}
      else{body+=rect(80,20,160*v.filled/v.parts,160);for(let i=1;i<v.parts;i++)body+=line(80+i*160/v.parts,20,80+i*160/v.parts,180);}
    }else if(v.kind==='gaps'){
      body=rect(35,35,240,25,'#dca965');for(let i=0;i<v.count;i++)body+=rect(35+i*240/v.count,75,240/v.count-12,25);
    }else if(v.kind==='unit-sizes'){
      for(let i=0;i<4;i++)body+=rect(40+i*60,40,60,30,'#dca965');for(let i=0;i<8;i++)body+=rect(40+i*30,90,30,30);
    }else if(v.kind==='units'||v.kind==='ruler'){
      const unit=240/8;body=rect(35,35,v.count*unit,28,'#dca965');
      for(let i=0;i<=8;i++){body+=line(35+i*unit,80,35+i*unit,100)+text(35+i*unit,125,String(i));if(v.kind==='units'&&i<v.count)body+=rect(35+i*unit,66,unit,20,'#a6cdb4');}
      body+=text(160,160,v.kind==='ruler'?v.unit:'equal units');
    }else if(v.kind==='bars'||v.kind==='graph'){
      const max=Math.max(...v.values,8),u=180/max;
      for(let i=0;i<v.values.length;i++){body+=text(45,48+i*46,v.labels[i])+rect(95,27+i*46,v.values[i]*u,28);}
      for(let i=0;i<=max;i++)body+=line(95+i*u,175,95+i*u,180)+text(95+i*u,200,String(i));
    }else if(v.kind==='tallies'){
      for(let i=0;i<v.count;i++){const group=Math.floor(i/5),slot=i%5,x=40+group*105;if(slot===4)body+=line(x-8,135,x+68,65);else body+=line(x+slot*20,65,x+slot*20,140);}
    }else if(v.kind==='coins'){
      v.coins.forEach((c,i)=>{const x=40+(i%5)*59,y=55+Math.floor(i/5)*82;body+=`<circle cx="${x}" cy="${y}" r="25" fill="${c===1?'#d1a080':'#d9dfe1'}" stroke="#687c7b" stroke-width="2"/>`+text(x,y+6,`${c}¢`);});
    }else body=text(160,90,v.text);
    const descriptions={shape:v.name==='circle'?'A closed curved boundary with no corners':`A closed figure with ${{triangle:3,rectangle:4,square:4,hexagon:6,rhombus:4}[v.name]} straight sides${['square','rhombus'].includes(v.name)?', all equal':''}${['square','rectangle'].includes(v.name)?', with four right angles':''}`,solid:{cube:'Six equal square faces',box:'Six rectangular faces, longer in one direction',cylinder:'Two circular ends joined by a curved side',cone:'One circular base and a pointed top'}[v.name],partition:`One whole divided into ${v.parts} equal ${v.diagonal?'triangular':'rectangular'} parts; ${v.filled} colored`,units:`${v.count} equal adjacent units cover the ribbon`,ruler:`A ruler in ${v.unit}, with a ribbon from zero to mark ${v.count}`,gaps:`${v.count} equal blocks lie under a ribbon with gaps between them`,'unit-sizes':'Four long units align end to end above eight short units; each long unit matches two short units',graph:v.labels?.map((label,i)=>`${label}: ${v.values[i]}`).join('; '),bars:v.labels?.map((label,i)=>`${label}: ${v.values[i]} units`).join('; '),coins:`Coin values in cents: ${v.coins?.join(', ')}`,tallies:`One crossed group of five tallies and ${v.count-5} single tallies`,'money-label':v.text};
    return `<svg viewBox="0 0 320 215" role="img" aria-label="${descriptions[v.kind]}">${body}</svg>`;
  }
  function render(){
    if(!state)return;const q=api.current(state);scope.textContent=`Math Mammoth Grade 1-B (2026) · completed through printed page ${state.page}${q?` · lesson page ${q.page}`:''}`;
    question.textContent=q?.prompt||'No completed lessons in this chapter yet.';if(q?.skillId==='graph-build'&&state.done)q.visual.values[0]=Number(q.answer);visual.innerHTML=svg(q?.visual);choices.replaceChildren();
    if(q)for(const value of q.choices){const button=node('button',value,'button arithmetic-answer');button.disabled=state.done||state.misses.includes(value);button.onclick=()=>change(()=>api.answer(state,value));choices.append(button);}
    feedback.textContent=state.done?'Correct! Keep moving toward a touchdown.':state.misses.length?'Try again. Use the explanation to help.':'';
    help.textContent=q&&(state.done||state.misses.length)?q.help:'';next.hidden=!q||!state.done;
    score.textContent=`${state.yards%100} / 100 yards · ${Math.floor(state.yards/100)*6} points · ${state.completed} completed`;
    ball.style.left=`${state.yards%100}%`;message.textContent=notice;
  }
  async function change(action){if(busy||!active)return;busy=true;try{
    const run=()=>{if(writable){const fresh=localStorage.getItem(KEY);if(fresh!==raw){let value;try{value=api.normalize(JSON.parse(fresh));}catch{}if(value){const page=state.page;state=value;raw=fresh;if(state.page!==page){state.page=page;state.serial=state.completed;state.done=false;state.misses=[];}notice='Book practice changed in another tab. Please try again.';}else{writable=false;notice='The saved practice cannot be updated. This visit stays in memory.';}render();return;}}if(action()){if(writable){raw=JSON.stringify(state);localStorage.setItem(KEY,raw);}render();}};
    if(writable&&navigator.locks)await navigator.locks.request(KEY,run);else{writable=false;notice='This practice stays in memory for this visit.';run();}
  }catch{writable=false;notice='Practice could not be saved. It stays in memory for this visit.';render();}finally{busy=false;}}
  async function fresh(){const progress=await CURRICULUM_UI.ask();if(!progress){select.value=String(state.chapter);return;}await change(()=>{state.page=progress.completedThroughPage;state.chapter=Number(select.value);state.serial=state.completed;state.done=false;state.misses=[];return true;});}
  restart.onclick=fresh;select.onchange=fresh;next.onclick=()=>change(()=>api.next(state));
  globalThis.__bookTest=Object.freeze({snapshot:()=>state&&JSON.parse(JSON.stringify(state)),storageKey:KEY});
  globalThis.PLACE_BOOK_UI=Object.freeze({page:()=>state?.page??null,activate(value,page,football=true){active=value;panel.hidden=!value;document.body.classList.toggle('book-active',value);if(!value)return;drive.hidden=!football;if(!state){try{raw=localStorage.getItem(KEY);const parsed=JSON.parse(raw);state=api.normalize(parsed);if(raw!==null&&!state){writable=false;notice='Saved book practice is unavailable or from another version. This visit stays in memory.';}}catch{writable=false;}state=state||api.create(page);if(state.page!==page){state.page=page;state.serial=state.completed;state.done=false;state.misses=[];}select.value=String(state.chapter);}render();},text:()=>{const q=state?api.current(state):null;const visible=q?{skillId:q.skillId,page:q.page,prompt:q.prompt,visual:q.visual,choices:q.choices,help:state.done||state.misses.length?q.help:null}:null;return {mode:'book',page:state?.page,question:visible,completed:state?.completed,yards:state?.yards,done:state?.done};}});
})();
