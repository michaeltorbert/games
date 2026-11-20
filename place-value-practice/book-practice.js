(() => {
  'use strict';
  // Two book lanes share one panel. Grade 1-B keeps its original store and
  // topics; Grade 2-A (#219, #223) has its own store and Chapters 1-3 lesson
  // topics. The lane follows the book chosen in the shared page prompt.
  // Grade 2-A runs are frozen: page, topic, and catalog ceiling change only at
  // an explicit boundary (Start new book session, a topic change, or a
  // confirmed page that differs from the saved run). Next, retries, reloads at
  // the same page, and Options never change them.
  const has2A=typeof PLACE_BOOK_2A!=='undefined'&&typeof MATH_CURRICULUM_2A!=='undefined';
  const C2=has2A?MATH_CURRICULUM_2A:null;
  const LANES={
    '1-B':{api:PLACE_BOOK,key:'place-value-practice:book:v1',field:'chapter',topics:[[0,'All completed lessons'],[5,'Facts and word problems'],[6,'Shapes and fractions'],[7,'Measurement'],[8,'Adding and subtracting'],[9,'Graphs'],[10,'Coins']],
      scope:(page,q)=>`Math Mammoth Grade 1-B (2026) · completed through printed page ${page}${q?` · lesson page ${q.page}`:''}`,
      empty:'No completed lessons in this chapter yet.'},
    ...(has2A?{'2-A':{api:PLACE_BOOK_2A,key:'place-value-practice:book:grade2a:v1',field:'lesson',frozen:true,
      topics:[[0,'All completed lessons'],...C2.LESSONS.map(l=>[l.id,l.title,['Chapter 1','Chapter 2: Clock','Chapter 3: Facts within 0-18'][(l.chapter??1)-1]])],
      scope:(page,q,state)=>`Math Mammoth Grade 2-A (2025 revision) · completed through printed page ${page}${q?` · lesson page ${q.page}`:''}`
        +(state?.catalogThrough===C2.LEGACY_CATALOG_THROUGH&&page>C2.CHAPTER1_LAST?' · Chapter 1 practice only in this saved session. Start a new book session to add Chapters 2 and 3.'
          :page>C2.CHAPTER3_LAST?' · practice covers Chapters 1-3 (through page 97)':''),
      empty:'No completed Grade 2-A lessons in this topic yet. Lessons start on printed page 10.'}}:{}),
  };
  // Place by Place context for the shared prompt: where each book's practice lives.
  CURRICULUM_UI.configure?.({notes:{'1-B':'Grade 1-B is used by Addition & subtraction, Number facts, and Book topics.',
    '2-A':'Grade 2-A Chapters 1-3 practice (clock, calendar, and facts to 18) is in Book topics (Options, then Book topics). Addition & subtraction and Number facts keep using your Grade 1-B page.'}});

  const lanes={};for(const id of Object.keys(LANES))lanes[id]={state:null,raw:null,writable:true,notice:'',conflict:false};
  let lane=null,active=false,busy=false;
  const L=()=>LANES[lane],R=()=>lanes[lane];
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
  const panel=node('main',null,'book-practice');panel.hidden=true;panel.id='book-practice';
  const title=node('h2','Book topics'),scope=node('p'),setup=node('div',null,'arithmetic-setup'),topic=node('label','Topic ','book-topic'),select=node('select'),restart=node('button','Start new book session','button');
  const topicHelp=node('p','Changing the topic starts a new book session and asks for your page.','book-topic-help');topicHelp.id='book-topic-help';select.setAttribute('aria-describedby',topicHelp.id);topic.append(select);setup.append(topic,restart,topicHelp);
  // Optional third entry groups lesson topics under a chapter heading.
  function topics(){select.replaceChildren();let group=null;for(const [value,label,heading] of L().topics){const option=node('option',label);option.value=value;
    if(heading&&group?.label!==heading){group=document.createElement('optgroup');group.label=heading;select.append(group);}(heading?group:select).append(option);}}
  const field=PLACE_PRACTICE_FIELD.create('book','book-drive'),drive=field.element;
  const question=node('h3'),visual=node('div',null,'book-visual'),choices=node('div',null,'arithmetic-choices'),feedback=node('p'),help=node('p'),next=node('button','Next','button button--primary'),message=node('p');
  question.id='book-question';choices.setAttribute('aria-labelledby',question.id);feedback.setAttribute('role','status');message.setAttribute('role','status');
  const worked=node('section',null,'arithmetic-explanation book-worked');worked.id='book-worked';worked.hidden=true;
  panel.append(title,scope,setup,drive,question,visual,choices,feedback,help,worked,next,message);
  document.getElementById('practice').after(panel);
  // Dense #223 pictures (calendar grid, several clocks, tables) get full width.
  const DETAIL=new Set(['calendar','clock-set','day-strip','rainbow','add-table','io-table','code-key','number-line']);
  function svg(v){
    if(!v)return '';
    if(typeof PLACE_BOOK_2A_VISUALS!=='undefined'&&PLACE_BOOK_2A_VISUALS.has(v.kind))return PLACE_BOOK_2A_VISUALS.svg(v);
    const line=(x1,y1,x2,y2,w=3)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#233f3b" stroke-width="${w}"/>`;
    const text=(x,y,t,size=18)=>`<text x="${x}" y="${y}" fill="#173f35" font-size="${size}" text-anchor="middle">${t}</text>`;
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
    }else if(v.kind==='base-ten'){
      // Ten-rods and unit cubes; an added group is drawn in gold.
      const groups=[{tens:v.tens,ones:v.ones,fill:'#8bb9dd'},...(v.add?[{tens:v.add.tens,ones:v.add.ones,fill:'#e2c36b'}]:[])];
      const rods=groups.reduce((n,g)=>n+g.tens,0),w=Math.min(18,250/Math.max(1,rods+3));let x=20;
      for(const g of groups){for(let i=0;i<g.tens;i++){for(let j=0;j<10;j++)body+=rect(x,15+j*17,w-4,17,g.fill);x+=w;}
        for(let j=0;j<g.ones;j++)body+=rect(x+(j%2)*19,15+Math.floor(j/2)*19,17,17,g.fill);if(g.ones)x+=42;x+=8;}
    }else if(v.kind==='sequence'){
      const w=Math.min(58,300/v.terms.length);v.terms.forEach((t,i)=>{body+=rect(10+i*w,70,w-8,52,t===null?'#fff4d6':'#fff')+text(10+i*w+(w-8)/2,104,t===null?'?':String(t),20);});
    }else if(v.kind==='chart'){
      for(let r=0;r<3;r++)for(let c=0;c<10;c++){const n=v.first+r*10+c,x=12+c*30,y=40+r*40;body+=rect(x,y,28,36,n===v.target?'#bfe0cf':n===v.hidden?'#fff4d6':'#fff')+text(x+14,y+24,n===v.hidden?'?':String(n),12);}
      body+=text(160,25,'Part of the 100-chart',13);
    }else if(v.kind==='fact-family'){
      const [x,y,t]=v.numbers;body='<polygon points="160,20 270,185 50,185" fill="#eaf4ef" stroke="#234e42" stroke-width="3"/>'+text(160,70,t??'?',26)+text(95,170,x,24)+text(225,170,y,24);
    }else if(v.kind==='ordinal-row'){
      const n=v.items.length,w=Math.min(30,296/n);
      v.items.forEach((t,i)=>{const x=12+i*w;if(v.balls)body+=`<circle cx="${x+w/2}" cy="100" r="${w/2-3}" fill="${v.colored.includes(i)?'#d9822b':'#fff'}" stroke="#234e42" stroke-width="2"/>`;else body+=rect(x,80,w-3,40,i===v.mark?'#fff4d6':'#fff')+text(x+(w-3)/2,107,t,15);});
      body+=text(160,45,v.balls?'left ← balls in a row → right':`counting from the ${v.from}`,14);
    }else if(v.kind==='letter-grid'){
      v.grid.forEach((row,r)=>row.forEach((t,c)=>{body+=rect(65+c*27,8+r*27,27,27,'#fff')+text(78+c*27,27+r*27,t,14);}));
      body+=text(30,20,'top',12)+text(30,195,'bottom',12);
    }else if(v.kind==='pairs'){
      for(let i=0;i<v.count;i++){const col=Math.floor(i/2),x=30+col*26,y=70+(i%2)*40;body+=`<circle cx="${x}" cy="${y}" r="10" fill="#63ad91" stroke="#234e42" stroke-width="2"/>`;}
    }else if(v.kind==='halves-shape'){
      const cut=v.equal?.5:.3;
      if(v.shape==='circle'){body='<circle cx="160" cy="100" r="80" fill="#8bb9dd" stroke="#234e42" stroke-width="3"/>';const x=80+160*cut;body+=line(x,100-Math.sqrt(6400-(x-160)**2),x,100+Math.sqrt(6400-(x-160)**2));}
      else{const w=v.shape==='square'?160:220,x0=160-w/2;body=rect(x0,20,w,160,'#8bb9dd')+line(x0+w*cut,20,x0+w*cut,180);}
    }else body=text(160,90,v.text);
    const descriptions={shape:v.name==='circle'?'A closed curved boundary with no corners':`A closed figure with ${{triangle:3,rectangle:4,square:4,hexagon:6,rhombus:4}[v.name]} straight sides${['square','rhombus'].includes(v.name)?', all equal':''}${['square','rectangle'].includes(v.name)?', with four right angles':''}`,solid:{cube:'Six equal square faces',box:'Six rectangular faces, longer in one direction',cylinder:'Two circular ends joined by a curved side',cone:'One circular base and a pointed top'}[v.name],partition:`One whole divided into ${v.parts} equal ${v.diagonal?'triangular':'rectangular'} parts; ${v.filled} colored`,units:`${v.count} equal adjacent units cover the ribbon`,ruler:`A ruler in ${v.unit}, with a ribbon from zero to mark ${v.count}`,gaps:`${v.count} equal blocks lie under a ribbon with gaps between them`,'unit-sizes':'Four long units align end to end above eight short units; each long unit matches two short units',graph:v.labels?.map((label,i)=>`${label}: ${v.values[i]}`).join('; '),bars:v.labels?.map((label,i)=>`${label}: ${v.values[i]} units`).join('; '),coins:`Coin values in cents: ${v.coins?.join(', ')}`,tallies:`One crossed group of five tallies and ${v.count-5} single tallies`,'money-label':v.text,
      'base-ten':`${v.tens} ten-rods and ${v.ones} ones${v.add?`, plus ${v.add.tens} gold ten-rods${v.add.ones?` and ${v.add.ones} gold ones`:''}`:''}`,
      sequence:`Number boxes: ${v.terms?.map(t=>t??'blank').join(', ')}`,
      chart:`Three rows of the 100-chart from ${v.first} to ${v.first+29}; ${v.target} is highlighted and one box is blank`,
      'fact-family':`Fact family triangle: total ${v.numbers?.[2]??'unknown'} at the top, parts ${v.numbers?.[0]} and ${v.numbers?.[1]} below`,
      'ordinal-row':v.balls?`A row of ${v.items?.length} balls; ${v.colored?.length} colored, at positions ${v.colored?.map(i=>i+1).sort((a,b)=>a-b).join(', ')} from the left`:`Letters in a row from left to right: ${v.items?.join(', ')}`,
      'letter-grid':`A 7 by 7 letter grid. Rows from top: ${v.grid?.map(r=>r.join(' ')).join('; ')}`,
      pairs:`${v.count} dots arranged in pairs`,
      // Position only, as a sighted learner sees it; the size comparison is the question.
      'halves-shape':`A ${v.shape} with one straight line drawn across it from top to bottom, ${v.equal?'through the center':'to the left of the center, about one third of the way across'}`};
    return `<svg viewBox="0 0 320 215" role="img" aria-label="${descriptions[v.kind]}">${body}</svg>`;
  }
  function render(){
    const state=R()?.state;if(!state)return;const api=L().api,q=api.current(state);scope.textContent=L().scope(state.page,q,state);
    question.textContent=q?.prompt||L().empty;if(q?.skillId==='graph-build'&&state.done)q.visual.values[0]=Number(q.answer);visual.innerHTML=svg(q?.visual);visual.classList.toggle('book-visual--detail',DETAIL.has(q?.visual?.kind));choices.replaceChildren();
    if(q)for(const value of q.choices){const button=node('button',value,'button arithmetic-answer');button.disabled=state.done||state.misses.includes(value);button.onclick=()=>change(()=>api.answer(R().state,value));choices.append(button);}
    feedback.textContent=state.done?'Correct! Keep moving toward a touchdown.':state.misses.length?'Try again. Use the explanation to help.':'';
    // Remedial help stays available after a miss; once complete, the worked-answer panel replaces it.
    help.textContent=q&&!state.done&&state.misses.length?q.help:'';next.hidden=!q||!state.done;
    PLACE_WORKED_UI.render(worked,api.explain(state),'book-worked-title');
    const yards=state.yards%100,points=Math.floor(state.yards/100)*6;
    field.render(yards,points,`${yards} / 100 yards · ${points} points · ${state.completed} completed`);message.textContent=R().notice;
  }
  const reframe=(state,page)=>{state.page=page;state.serial=state.completed;state.done=false;state.misses=[];};
  // Grade 2-A uses its domain boundary (keeps an eligible pending question and
  // retains a locked retry); Grade 1-B keeps its released reframe.
  const rebound=(id,state,page,topic)=>{if(LANES[id].frozen)LANES[id].api.boundary(state,page,topic??state[LANES[id].field]);else{reframe(state,page);if(topic!==undefined)state[LANES[id].field]=topic;}};
  function load(id,page){
    const r=lanes[id],{api,key}=LANES[id];if(r.state)return;
    try{r.raw=localStorage.getItem(key);const parsed=JSON.parse(r.raw);r.state=api.normalize(parsed);if(r.raw!==null&&!r.state){r.writable=false;r.notice='Saved book practice is unavailable or from another version. This visit stays in memory.';}}catch{r.writable=false;}
    // Restoring at the same confirmed page keeps the run exactly; a different
    // confirmed page is an explicit boundary. Nothing is written until an action.
    r.state=r.state||api.create(page);if(r.state.page!==page)rebound(id,r.state,page);
  }
  function use(id){if(lane===id)return;lane=id;topics();}
  async function change(action){if(busy||!active)return;busy=true;const r=R(),{api,key}=L();try{
    // A frozen (Grade 2-A) lane adopts another tab's newer run only when it has
    // the same page, topic, and ceiling, and never re-frames it from this tab's
    // page. A different-frame save is a conflict, handled below.
    const frozen=!!L().frozen;
    const run=()=>{if(r.writable){const fresh=localStorage.getItem(key);if(fresh!==r.raw){let value;try{value=api.normalize(JSON.parse(fresh));}catch{}
        // Another tab's run with a different frame is never adopted silently: this
        // tab keeps its own frozen page/topic/ceiling in memory, the other save's
        // bytes stay untouched, and only an explicit new session here adopts it.
        if(value&&frozen&&['page','lesson','catalogThrough'].some(k=>value[k]!==r.state[k])){r.writable=false;r.conflict=true;r.notice='Another tab saved a book session with a different page or topic. This tab keeps its own session in memory and leaves that save alone. Start a new book session here to continue from the saved one.';render();return;}
        if(value){const page=r.state.page;r.state=value;r.raw=fresh;if(!frozen&&r.state.page!==page)reframe(r.state,page);r.notice='Book practice changed in another tab. Please try again.';}else{r.writable=false;r.notice='The saved practice cannot be updated. This visit stays in memory.';}render();return;}}
      if(action()){if(r.writable&&api.overCapacity?.(r.state)){r.writable=false;r.notice='Too many unfinished retries to save. Your saved practice is kept, and this visit stays in memory.';}
        if(r.writable){r.raw=JSON.stringify(r.state);localStorage.setItem(key,r.raw);}render();}};
    if(r.writable&&navigator.locks)await navigator.locks.request(key,run);else{r.writable=false;r.notice='This practice stays in memory for this visit.';run();}
  }catch{r.writable=false;r.notice='Practice could not be saved. It stays in memory for this visit.';render();}finally{busy=false;}}
  const laneOf=progress=>progress?.selectedBook==='2-A'&&LANES['2-A']&&progress.grade2a?'2-A':'1-B';
  const pageOf=(id,progress)=>id==='2-A'?progress.grade2a.completedThroughPage:progress.completedThroughPage;
  async function fresh(){
    const chosen=Number(select.value),before=lane,progress=await CURRICULUM_UI.ask();
    if(!progress){select.value=String(R().state[L().field]);return;}
    const id=laneOf(progress),page=pageOf(id,progress);
    // After a cross-tab frame conflict, an explicit new session re-reads the saved run.
    if(lanes[id].conflict)Object.assign(lanes[id],{state:null,raw:null,writable:true,notice:'',conflict:false});
    load(id,page);use(id);
    // A topic chosen from the other book's list does not carry across books.
    const topic=id===before?chosen:0;select.value=String(topic);
    await change(()=>{rebound(lane,R().state,page,topic);return true;});
  }
  restart.onclick=fresh;select.onchange=fresh;next.onclick=()=>change(()=>L().api.next(R().state));
  globalThis.__bookTest=Object.freeze({snapshot:()=>lanes['1-B'].state&&JSON.parse(JSON.stringify(lanes['1-B'].state)),storageKey:LANES['1-B'].key,
    book:()=>lane,snapshot2a:()=>lanes['2-A']?.state&&JSON.parse(JSON.stringify(lanes['2-A'].state)),saved2a:()=>lanes['2-A']?({writable:lanes['2-A'].writable,conflict:lanes['2-A'].conflict}):null,storageKey2a:LANES['2-A']?.key??null});
  globalThis.PLACE_BOOK_UI=Object.freeze({page:()=>lanes['1-B'].state?.page??null,setPresentation(football){drive.hidden=!football;},activate(value,page,football=true){
    active=value;panel.hidden=!value;document.body.classList.toggle('book-active',value);if(!value)return;drive.hidden=!football;
    if(!lane){const progress=CURRICULUM_UI.current(),id=laneOf(progress);load(id,id==='2-A'?pageOf(id,progress):page);use(id);}
    else if(lane==='1-B')load('1-B',page);
    select.value=String(R().state[L().field]);render();},
    text:()=>{const state=R()?.state,q=state?L().api.current(state):null;const visible=q?{skillId:q.skillId,page:q.page,prompt:q.prompt,visual:q.visual,choices:q.choices,help:state.done||state.misses.length?q.help:null}:null;return {mode:'book',book:lane,page:state?.page,...(state&&'catalogThrough' in state?{catalogThrough:state.catalogThrough,lesson:state.lesson,retained:state.retained.length}:{}),question:visible,completed:state?.completed,yards:state?.yards,done:state?.done,explanation:state?L().api.explain(state):null};}});
})();
