// Separate arithmetic lane: all persistence and counters belong to this lane.
(() => {
  'use strict';
  const KEY='place-value-practice:arithmetic:v1', MODE_KEY='place-value-practice:mode:v1';
  const api=PLACE_ARITHMETIC;
  let model, writable=true, saveMessage='';
  try {
    const raw=localStorage.getItem(KEY), parsed=raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > api.SCHEMA_VERSION) {
      writable=false; saveMessage='This arithmetic save comes from a newer version. This session stays in memory.';
    }
    model=api.normalize(parsed);
  } catch { saveMessage='Arithmetic is available for this visit. Saving may be unavailable.'; }
  const node=(tag,text,className) => { const n=document.createElement(tag); if(text)n.textContent=text; if(className)n.className=className; return n; };
  const nav=node('nav',null,'practice-modes'); nav.setAttribute('aria-label','Practice type');
  const place=node('button','Place value','button'), arithmetic=node('button','Arithmetic','button');
  place.type=arithmetic.type='button'; nav.append(place,arithmetic);
  document.querySelector('.app-header').after(nav);
  const panel=node('main'); panel.id='arithmetic-practice'; panel.hidden=true;
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
  function save() { if(!writable)return; try { localStorage.setItem(KEY,JSON.stringify(model)); saveMessage=''; } catch { saveMessage='Your arithmetic progress stays in memory for this visit.'; } }
  function render() {
    const view=api.view(model), q=model.question, revealed=q.misses.length>=3, finished=model.target!==null && model.completed>=model.target;
    count.textContent=finished?'Session complete':model.target===null?`Question ${model.sequence+1}`:`Question ${model.sequence+1} of ${model.target}`;
    equation.textContent=q.complete||revealed?view.worked:view.prompt;
    choices.replaceChildren();
    q.choices.forEach(value=>{ const b=node('button',String(value),'button arithmetic-answer');b.type='button';b.disabled=q.complete||q.misses.includes(value);
      b.addEventListener('click',()=>{if(api.answer(model,value)){save();render(); if(model.question.complete)next.focus();}}); choices.append(b); });
    feedback.textContent=q.complete?(revealed?'You selected the answer.':q.misses.length?'You worked it out after trying again.':'Correct.')
      :revealed?'Here is the answer. Select it to finish this question.':q.misses.length?'Try another number.':'';
    next.hidden=!q.complete; next.textContent=finished?'Practice again':'Next';
    recap.textContent=finished?`${model.completed} completed · ${model.firstTry} first try · ${model.afterHelp} after trying again` : '';
    storage.textContent=saveMessage;
  }
  function fresh() { model=api.restart(model,length.value==='endless'?null:Number(length.value));save();render();choices.querySelector('button').focus(); }
  reset.addEventListener('click',fresh);
  // Changing length applies only when starting a new session, preserving an active attempt.
  next.addEventListener('click',()=>{if(model.target!==null&&model.completed>=model.target)fresh();else if(api.next(model)){save();render();choices.querySelector('button').focus();}});
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
    if(active){if(!model){model=api.create();save();}render();}else window.__placeValueActivate();
  }
  place.addEventListener('click',()=>mode('place-value')); arithmetic.addEventListener('click',()=>mode('arithmetic'));
  window.render_game_to_text=()=>window.__placePracticeMode==='arithmetic'?JSON.stringify({mode:'arithmetic',question:api.view(model).prompt,
    choices:model.question.choices,misses:model.question.misses,complete:model.question.complete,completed:model.completed,target:model.target,
    revealed:model.question.misses.length>=3,
    worked:model.question.complete||model.question.misses.length>=3?api.view(model).worked:null}):placeText();
  window.__arithmeticTest=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify(model)),storageKey:KEY});
  mode(window.__placePracticeMode,false);
})();
