// Separate arithmetic lane: all persistence and counters belong to this lane.
(() => {
  'use strict';
  const KEY='place-value-practice:arithmetic:v1', MODE_KEY='place-value-practice:mode:v1';
  const api=PLACE_ARITHMETIC;
  const SUBMODE_KEY='place-value-practice:arithmetic-mode:v1';
  const PRESENTATION_KEY='place-value-practice:presentation:v1';
  // Presentation and content focus are independent. Old size-based preferences
  // intentionally migrate to the new mixed default; an explicit whole-book
  // choice remains useful and is safe to retain.
  let submode='mixed',presentation='football';try{const saved=localStorage.getItem(SUBMODE_KEY);if(saved==='book'||saved==='facts')submode=saved;const shown=localStorage.getItem(PRESENTATION_KEY);if(shown==='plain')presentation='plain';}catch{}
  let model, writable=true, saveMessage='', savedRaw=null, pendingChanges=0, malformedJSON=false;
  const sessionPages={facts:null,mixed:null,book:null};
  try {
    savedRaw=localStorage.getItem(KEY);
  } catch { writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.'; }
  if(writable) {
    let parsed=null;
    try { parsed=savedRaw===null ? null : JSON.parse(savedRaw); }
    catch { malformedJSON=true; }
    if (parsed && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > api.SCHEMA_VERSION) {
      writable=false; saveMessage='This arithmetic save comes from a newer version. This session stays in memory.';
    }
    model=api.normalize(parsed);
  }
  const node=(tag,text,className) => { const n=document.createElement(tag); if(text)n.textContent=text; if(className)n.className=className; return n; };
  const nav=node('nav',null,'practice-modes'); nav.setAttribute('aria-label','Practice type');
  const place=node('button','Place value','button'), arithmetic=node('button','Arithmetic','button');
  place.type=arithmetic.type='button'; nav.append(place,arithmetic);
  document.querySelector('.app-header').after(nav);
  const styleNav=node('nav',null,'practice-modes');styleNav.setAttribute('aria-label','Practice presentation');
  const football=node('button','Football practice','button'),plain=node('button','Just arithmetic','button');
  football.type=plain.type='button';styleNav.append(football,plain);nav.after(styleNav);
  const subnav=node('nav',null,'practice-modes');subnav.setAttribute('aria-label','Practice focus');
  const mixed=node('button','Mixed practice','button button--quiet'),facts=node('button','Fact focus','button');
  const book=node('button','Whole book','button');book.type='button';
  mixed.type=facts.type='button';subnav.append(mixed,facts,book);styleNav.after(subnav);
  const panel=node('main'); panel.id='arithmetic-practice'; panel.hidden=true;
  panel.setAttribute('aria-busy','false');
  panel.setAttribute('aria-labelledby','arithmetic-title');
  document.getElementById('practice').after(panel);
  panel.after(PLACE_FACT_UI.panel);
  const title=node('h2','Mixed arithmetic practice'); title.id='arithmetic-title';
  const scope=node('p','Single-digit facts stay in the mix with larger arithmetic from your completed pages.');
  const setup=node('div',null,'arithmetic-setup'), label=node('label','Session length '), length=node('select');
  length.setAttribute('aria-label','Arithmetic session length');
  for(const [v,t] of [['5','5 questions'],['10','10 questions'],['20','20 questions'],['endless','Endless']]) { const o=node('option',t);o.value=v;length.append(o); }
  // The selector holds this visit's pending target, independently of the active session.
  length.value=model ? (model.target===null?'endless':String(model.target)) : '10';
  const reset=node('button','Start new arithmetic session','button button--quiet'); reset.type='button'; label.append(length); setup.append(label,reset);
  const drive=node('section',null,'book-drive arithmetic-drive'),driveScore=node('p'),driveField=node('div',null,'book-field'),driveBall=node('span','🏈');
  driveField.append(driveBall);drive.append(driveScore,driveField);
  const count=node('p'), equation=node('h3'); equation.id='arithmetic-equation';
  const instruction=node('p','Choose the number that makes the equation true.');
  const choices=node('div',null,'arithmetic-choices'); choices.setAttribute('role','group'); choices.setAttribute('aria-labelledby',equation.id);
  const feedback=node('p'); feedback.id='arithmetic-feedback'; feedback.setAttribute('role','status');
  const next=node('button','Next','button button--primary'); next.id='arithmetic-next'; next.type='button';
  const recap=node('p'); recap.id='arithmetic-recap';
  const storage=node('p'); storage.className='arithmetic-storage';
  panel.append(title,scope,setup,drive,count,equation,instruction,choices,feedback,next,recap,storage);
  function refreshBeforeWrite() {
    if(!writable)return true;
    const current=localStorage.getItem(KEY);
    if(current===savedRaw)return true;
    let parsed;try{parsed=JSON.parse(current);}catch{}
    if(parsed && typeof parsed.schemaVersion==='number' && parsed.schemaVersion>api.SCHEMA_VERSION) {
      writable=false;saveMessage='This arithmetic save comes from a newer version. This session stays in memory.';
      return true;
    }
    model=api.repair(api.normalize(parsed)||api.create());savedRaw=current;
    saveMessage='Arithmetic progress changed in another tab. Please try again.';
    return false;
  }
  function save() {
    if(!writable)return;
    try {
      if(!refreshBeforeWrite() || !writable)return;
      const serialized=JSON.stringify(model);localStorage.setItem(KEY,serialized);savedRaw=serialized;saveMessage='';
    } catch { writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.'; }
  }
  async function change(action) {
    pendingChanges++;panel.setAttribute('aria-busy','true');
    const run=()=>{
      try { if(!refreshBeforeWrite()){render();return;} }
      catch { writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.'; }
      if(action()){save();render();if(model.question.complete)next.focus();else choices.querySelector('button').focus();}
    };
    try { if(writable && navigator.locks) {
      try { await navigator.locks.request(KEY,run); }
      catch { writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.';render(); }
    } else {
      if(writable){writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.';}
      run();
    } } finally { pendingChanges--;panel.setAttribute('aria-busy',String(pendingChanges>0)); }
  }
  function render() {
    const view=api.view(model), q=model.question, revealed=q.misses.length>=3, finished=model.target!==null && model.completed>=model.target;
    const yards=model.firstTry*5+model.afterHelp;
    drive.hidden=presentation!=='football';driveScore.textContent=`${yards%100} / 100 yards · ${Math.floor(yards/100)*6} points`;
    driveBall.style.left=`${yards%100}%`;
    count.textContent=finished?'Session complete':model.target===null?`Question ${model.sequence+1}`:`Question ${model.sequence+1} of ${model.target}`;
    equation.textContent=q.complete||revealed?view.worked:view.prompt;
    choices.replaceChildren();
    q.choices.forEach(value=>{ const b=node('button',String(value),'button arithmetic-answer');b.type='button';b.disabled=q.complete||q.misses.includes(value);
      b.addEventListener('click',()=>change(()=>model.question===q && api.answer(model,value))); choices.append(b); });
    feedback.textContent=q.complete?(revealed?'You selected the answer.':q.misses.length?'You worked it out after trying again.':'Correct.')
      :revealed?'Here is the answer. Select it to finish this question.':q.misses.length?'Try another number.':'';
    next.hidden=!q.complete; next.textContent=finished?'Practice again':'Next';
    recap.textContent=finished?`${model.completed} completed · ${model.firstTry} first try · ${model.afterHelp} after trying again` : '';
    storage.textContent=saveMessage;
  }
  async function fresh() {panel.setAttribute('aria-busy','true');const progress=await CURRICULUM_UI.ask();panel.setAttribute('aria-busy','false');if(!progress)return;sessionPages.mixed=progress.completedThroughPage;api.configure(sessionPages.mixed);if(sessionPages.mixed<17){mode('arithmetic',false);return;}return change(()=>{model=api.repair(api.restart(model,length.value==='endless'?null:Number(length.value)));return true;}); }
  reset.addEventListener('click',fresh);
  // Changing length applies only when starting a new session, preserving an active attempt.
  next.addEventListener('click',()=>{if(model.target!==null&&model.completed>=model.target)fresh();else {const q=model.question;change(()=>model.question===q && api.next(model));}});
  const placeText=window.render_game_to_text;
  const placeAdvance=window.advanceTime;
  window.advanceTime=milliseconds=>window.__placePracticeMode==='arithmetic'&&submode==='facts'?PLACE_FACT_UI.advanceTime(milliseconds):placeAdvance(milliseconds);
  async function mode(value, persist=true) {
    if(value==='arithmetic'&&sessionPages[submode]===null){panel.setAttribute('aria-busy','true');PLACE_FACT_UI.panel.setAttribute('aria-busy','true');const progress=await CURRICULUM_UI.ask();if(!progress){panel.setAttribute('aria-busy','false');PLACE_FACT_UI.panel.setAttribute('aria-busy','false');return false;}sessionPages[submode]=progress.completedThroughPage;}
    window.__placePracticeMode=value;
    if(persist)try{localStorage.setItem(MODE_KEY,value);}catch{}
    const active=value==='arithmetic';
    document.getElementById('practice').hidden=active;
    document.getElementById('session-status').hidden=active;
    document.getElementById('settings-button').hidden=active;
    subnav.hidden=!active;
    styleNav.hidden=!active;
    panel.hidden=!active||submode!=='mixed';
    document.body.classList.toggle('plain-practice',active&&presentation==='plain');
    document.body.classList.toggle('football-practice',active&&presentation==='football');
    PLACE_BOOK_UI.activate(active&&submode==='book',sessionPages.book,presentation==='football');
    const empty=active&&submode!=='book'&&sessionPages[submode]<17;
    PLACE_FACT_UI.activate(active&&submode==='facts'&&!empty,sessionPages.facts,presentation==='football');
    mixed.setAttribute('aria-pressed',String(submode==='mixed'));facts.setAttribute('aria-pressed',String(submode==='facts'));book.setAttribute('aria-pressed',String(submode==='book'));
    football.setAttribute('aria-pressed',String(presentation==='football'));plain.setAttribute('aria-pressed',String(presentation==='plain'));
    place.setAttribute('aria-pressed',String(!active)); arithmetic.setAttribute('aria-pressed',String(active));
    // Keep invalid JSON bytes until a locked user action can check for conflicts.
    if(empty){panel.hidden=false;choices.replaceChildren();equation.textContent='No arithmetic lessons completed yet.';feedback.textContent='Choose Book practice after completing its first lesson on page 17.';next.hidden=true;panel.setAttribute('aria-busy','false');PLACE_FACT_UI.panel.setAttribute('aria-busy','false');return true;}
    if(active){if(submode==='mixed'){api.configure(sessionPages.mixed);if(!model){model=api.repair(api.create());if(!malformedJSON)save();}else api.repair(model);render();}}else window.__placeValueActivate();
    panel.setAttribute('aria-busy','false');PLACE_FACT_UI.panel.setAttribute('aria-busy','false');
    return true;
  }
  async function chooseSubmode(value){const previous=submode;submode=value;if(await mode('arithmetic',false)){try{localStorage.setItem(SUBMODE_KEY,value==='mixed'?'mixed-later':value);}catch{}}else{submode=previous;mode(window.__placePracticeMode,false);}}
  function choosePresentation(value){presentation=value;try{localStorage.setItem(PRESENTATION_KEY,value);}catch{}mode(window.__placePracticeMode,false);}
  mixed.addEventListener('click',()=>chooseSubmode('mixed'));facts.addEventListener('click',()=>chooseSubmode('facts'));
  book.addEventListener('click',()=>chooseSubmode('book'));
  football.addEventListener('click',()=>choosePresentation('football'));plain.addEventListener('click',()=>choosePresentation('plain'));
  place.addEventListener('click',()=>mode('place-value')); arithmetic.addEventListener('click',()=>mode('arithmetic'));
  window.render_game_to_text=()=>CURRICULUM_UI.text().open?JSON.stringify({curriculum:CURRICULUM_UI.text()}):window.__placePracticeMode==='arithmetic'&&submode!=='book'&&sessionPages[submode]<17?JSON.stringify({mode:'arithmetic-unavailable',page:sessionPages[submode]}):window.__placePracticeMode==='arithmetic'&&submode==='book'?JSON.stringify({...PLACE_BOOK_UI.text(),presentation}):window.__placePracticeMode==='arithmetic'&&submode==='facts'?JSON.stringify({...PLACE_FACT_UI.text(),presentation}):window.__placePracticeMode==='arithmetic'?JSON.stringify({mode:'arithmetic',submode:'mixed',presentation,question:model?api.view(model).prompt:null,
    choices:model.question.choices,misses:model.question.misses,complete:model.question.complete,completed:model.completed,target:model.target,
    revealed:model.question.misses.length>=3,
    worked:model.question.complete||model.question.misses.length>=3?api.view(model).worked:null}):placeText();
  window.__arithmeticTest=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify(model)),storageKey:KEY});
  panel.setAttribute('aria-busy','true');PLACE_FACT_UI.panel.setAttribute('aria-busy','true');
  CURRICULUM_UI.ask().then(progress=>{if(progress){if(window.__placePracticeMode==='arithmetic')sessionPages[submode]=progress.completedThroughPage;mode(window.__placePracticeMode,false);}else mode('place-value',false);});
})();
