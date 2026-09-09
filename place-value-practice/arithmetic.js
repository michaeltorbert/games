// Separate arithmetic lane: all persistence and counters belong to this lane.
(() => {
  'use strict';
  const KEY='place-value-practice:arithmetic:v1', MODE_KEY='place-value-practice:mode:v1';
  const api=PLACE_ARITHMETIC;
  let model, writable=true, saveMessage='', savedRaw=null, pendingChanges=0, malformedJSON=false;
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
  const panel=node('main'); panel.id='arithmetic-practice'; panel.hidden=true;
  panel.setAttribute('aria-busy','false');
  panel.setAttribute('aria-labelledby','arithmetic-title');
  document.getElementById('practice').after(panel);
  const title=node('h2','Arithmetic'); title.id='arithmetic-title';
  const setup=node('div',null,'arithmetic-setup'), label=node('label','Session length '), length=node('select');
  length.setAttribute('aria-label','Arithmetic session length');
  for(const [v,t] of [['5','5 questions'],['10','10 questions'],['20','20 questions'],['endless','Endless']]) { const o=node('option',t);o.value=v;length.append(o); }
  // The selector holds this visit's pending target, independently of the active session.
  length.value=model ? (model.target===null?'endless':String(model.target)) : '10';
  const reset=node('button','Start new arithmetic session','button button--quiet'); reset.type='button'; label.append(length); setup.append(label,reset);
  const count=node('p'), equation=node('h3'); equation.id='arithmetic-equation';
  const instruction=node('p','Choose the number that makes the equation true.');
  const choices=node('div',null,'arithmetic-choices'); choices.setAttribute('role','group'); choices.setAttribute('aria-labelledby',equation.id);
  const feedback=node('p'); feedback.id='arithmetic-feedback'; feedback.setAttribute('role','status');
  const next=node('button','Next','button button--primary'); next.id='arithmetic-next'; next.type='button';
  const recap=node('p'); recap.id='arithmetic-recap';
  const storage=node('p'); storage.className='arithmetic-storage';
  panel.append(title,setup,count,equation,instruction,choices,feedback,next,recap,storage);
  function refreshBeforeWrite() {
    if(!writable)return true;
    const current=localStorage.getItem(KEY);
    if(current===savedRaw)return true;
    let parsed;try{parsed=JSON.parse(current);}catch{}
    if(parsed && typeof parsed.schemaVersion==='number' && parsed.schemaVersion>api.SCHEMA_VERSION) {
      writable=false;saveMessage='This arithmetic save comes from a newer version. This session stays in memory.';
      return true;
    }
    model=api.normalize(parsed)||api.create();savedRaw=current;
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
  function fresh() { return change(()=>{model=api.restart(model,length.value==='endless'?null:Number(length.value));return true;}); }
  reset.addEventListener('click',fresh);
  // Changing length applies only when starting a new session, preserving an active attempt.
  next.addEventListener('click',()=>{if(model.target!==null&&model.completed>=model.target)fresh();else {const q=model.question;change(()=>model.question===q && api.next(model));}});
  const placeText=window.render_game_to_text;
  function mode(value, persist=true) {
    window.__placePracticeMode=value;
    if(persist)try{localStorage.setItem(MODE_KEY,value);}catch{}
    const active=value==='arithmetic';
    document.getElementById('practice').hidden=active;
    document.getElementById('session-status').hidden=active;
    document.getElementById('settings-button').hidden=active;
    panel.hidden=!active;
    place.setAttribute('aria-pressed',String(!active)); arithmetic.setAttribute('aria-pressed',String(active));
    // Keep invalid JSON bytes until a locked user action can check for conflicts.
    if(active){if(!model){model=api.create();if(!malformedJSON)save();}render();}else window.__placeValueActivate();
  }
  place.addEventListener('click',()=>mode('place-value')); arithmetic.addEventListener('click',()=>mode('arithmetic'));
  window.render_game_to_text=()=>window.__placePracticeMode==='arithmetic'?JSON.stringify({mode:'arithmetic',question:api.view(model).prompt,
    choices:model.question.choices,misses:model.question.misses,complete:model.question.complete,completed:model.completed,target:model.target,
    revealed:model.question.misses.length>=3,
    worked:model.question.complete||model.question.misses.length>=3?api.view(model).worked:null}):placeText();
  window.__arithmeticTest=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify(model)),storageKey:KEY});
  mode(window.__placePracticeMode,false);
})();
