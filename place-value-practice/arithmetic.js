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
  // The last confirmed focus and presentation; a cancelled or superseded Apply restores both.
  let committed={submode,presentation},modeGeneration=0,applyGeneration=0;
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
  const ROUTES=Object.freeze({mixed:'Addition & subtraction',facts:'Number facts',book:'Book topics'});
  const nav=node('nav',null,'practice-modes'); nav.setAttribute('aria-label','Practice type');
  const place=node('button','Place value','button'), arithmetic=node('button','Math practice','button');
  place.type=arithmetic.type='button'; nav.append(place,arithmetic);
  document.querySelector('.app-header').after(nav);
  // One compact row names the active practice; the focus and presentation choices live in Options.
  const routeRow=node('div',null,'practice-modes practice-route'),routeLabel=node('p',null,'practice-route-label'),optionsButton=node('button','Options','button button--quiet');
  routeLabel.id='practice-route-label';optionsButton.id='practice-options-button';optionsButton.type='button';optionsButton.setAttribute('aria-haspopup','dialog');
  routeRow.hidden=true;routeRow.append(routeLabel,optionsButton);nav.after(routeRow);
  const options=node('dialog',null,'practice-options');options.setAttribute('aria-labelledby','practice-options-title');
  const optionsTitle=node('h2','Practice options');optionsTitle.id='practice-options-title';
  const radio=(name,value,text,help)=>{
    const row=node('label',null,'practice-option'),input=node('input'),copy=node('span',null,'practice-option-copy'),title=node('span',text,'practice-option-name');
    input.type='radio';input.name=name;input.value=value;title.id=`${name}-${value}`;input.setAttribute('aria-labelledby',title.id);copy.append(title);
    if(help){const detail=node('span',help,'practice-option-help');detail.id=`${title.id}-help`;input.setAttribute('aria-describedby',detail.id);copy.append(detail);}
    row.append(input,copy);return row;
  };
  const fieldset=(legend,rows)=>{const set=node('fieldset');set.append(node('legend',legend),...rows);return set;};
  // Descriptions state only what each lane actually does.
  options.append(optionsTitle,
    fieldset('What to practice',[
      radio('practice-focus','mixed',ROUTES.mixed,'Mixed questions from your finished pages, from small facts to bigger numbers. Kinds of problems that needed help come up a little more often.'),
      radio('practice-focus','facts',ROUTES.facts,'Type answers to addition facts up to 9 + 9 and their matching subtraction facts. Missed facts come back later.'),
      radio('practice-focus','book',ROUTES.book,'Goes through each finished lesson in turn, including shapes, measurement, graphs and coins. Choose a topic on the book screen.')]),
    fieldset('Presentation',[radio('practice-presentation','football','Football','Earn yards toward a touchdown as you practice.'),radio('practice-presentation','plain','Plain','Just the questions, with no football field.')]));
  const optionsActions=node('div',null,'practice-options-actions'),cancelOptions=node('button','Cancel','button button--quiet'),applyOptions=node('button','Apply','button button--primary');
  cancelOptions.type=applyOptions.type='button';optionsActions.append(cancelOptions,applyOptions);options.append(optionsActions);document.body.append(options);
  const panel=node('main'); panel.id='arithmetic-practice'; panel.hidden=true;
  panel.setAttribute('aria-busy','false');
  panel.setAttribute('aria-labelledby','arithmetic-title');
  document.getElementById('practice').after(panel);
  panel.after(PLACE_FACT_UI.panel);
  // Below page 17 Mixed and Number facts share this screen instead of borrowing the Mixed panel.
  const unavailable=node('main',null,'practice-unavailable');unavailable.id='practice-unavailable';unavailable.hidden=true;unavailable.setAttribute('aria-labelledby','practice-unavailable-title');
  const unavailableTitle=node('h2');unavailableTitle.id='practice-unavailable-title';
  const updatePage=node('button','Update completed page','button button--primary'),toPlace=node('button','Go to Place value','button button--quiet');updatePage.type=toPlace.type='button';
  const unavailableActions=node('div',null,'practice-unavailable-actions');unavailableActions.append(updatePage,toPlace);
  unavailable.append(unavailableTitle,node('p','No practice lessons are finished yet. Practice starts after printed page 17.'),unavailableActions);
  PLACE_FACT_UI.panel.after(unavailable);
  const title=node('h2',ROUTES.mixed); title.id='arithmetic-title';
  const scope=node('p','Single-digit facts stay in the mix with larger arithmetic from your completed pages.');
  const setup=node('div',null,'arithmetic-setup'), label=node('label','Session length '), length=node('select');
  length.setAttribute('aria-label','Arithmetic session length');
  for(const [v,t] of [['5','5 questions'],['10','10 questions'],['20','20 questions'],['endless','Endless']]) { const o=node('option',t);o.value=v;length.append(o); }
  // The selector holds this visit's pending target, independently of the active session.
  length.value=model ? (model.target===null?'endless':String(model.target)) : '10';
  const reset=node('button','Start new arithmetic session','button button--quiet'); reset.type='button'; label.append(length); setup.append(label,reset);
  const field=PLACE_PRACTICE_FIELD.create('arithmetic','book-drive arithmetic-drive'),drive=field.element;
  const count=node('p'), equation=node('h3'); equation.id='arithmetic-equation';
  const instruction=node('p','Choose the number that makes the equation true.');
  const choices=node('div',null,'arithmetic-choices'); choices.setAttribute('role','group'); choices.setAttribute('aria-labelledby',equation.id);
  const feedback=node('p'); feedback.id='arithmetic-feedback'; feedback.setAttribute('role','status');
  const explanation=node('section',null,'arithmetic-explanation'); explanation.id='arithmetic-explanation'; explanation.hidden=true;
  explanation.setAttribute('aria-labelledby','arithmetic-explanation-title');
  const next=node('button','Next','button button--primary'); next.id='arithmetic-next'; next.type='button';
  const recap=node('p'); recap.id='arithmetic-recap';
  const storage=node('p'); storage.className='arithmetic-storage';
  panel.append(title,scope,setup,drive,count,equation,instruction,choices,feedback,explanation,next,recap,storage);
  // Rebuilt from the model on every render, so Next, restart and reload need no extra state.
  const renderExplanation=shown=>PLACE_WORKED_UI.render(explanation,shown,'arithmetic-explanation-title');
  const busy=value=>{panel.setAttribute('aria-busy',String(value));PLACE_FACT_UI.panel.setAttribute('aria-busy',String(value));};
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
    // A late result still saves for Mixed, but only a visible Mixed panel may redraw or take focus.
    const run=()=>{
      try { if(!refreshBeforeWrite()){if(!panel.hidden)render();return;} }
      catch { writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.'; }
      if(action()){save();if(panel.hidden)return;render();if(model.question.complete)next.focus();else choices.querySelector('button').focus();}
    };
    try { if(writable && navigator.locks) {
      try { await navigator.locks.request(KEY,run); }
      catch { writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.';if(!panel.hidden)render(); }
    } else {
      if(writable){writable=false;saveMessage='Your arithmetic progress stays in memory for this visit.';}
      run();
    } } finally { pendingChanges--;panel.setAttribute('aria-busy',String(pendingChanges>0)); }
  }
  function render() {
    const view=api.view(model), q=model.question, revealed=q.misses.length>=3, finished=model.target!==null && model.completed>=model.target;
    const yards=model.firstTry*5+model.afterHelp,onDrive=yards%100,points=Math.floor(yards/100)*6;
    drive.hidden=presentation!=='football';field.render(onDrive,points,`${onDrive} / 100 yards · ${points} points`);
    count.textContent=finished?'Session complete':model.target===null?`Question ${model.sequence+1}`:`Question ${model.sequence+1} of ${model.target}`;
    equation.textContent=q.complete||revealed?view.worked:view.prompt;
    choices.replaceChildren();
    q.choices.forEach(value=>{ const b=node('button',String(value),'button arithmetic-answer');b.type='button';b.disabled=q.complete||q.misses.includes(value);
      b.addEventListener('click',()=>change(()=>model.question===q && api.answer(model,value))); choices.append(b); });
    feedback.textContent=q.complete?(revealed?'You selected the answer.':q.misses.length?'You worked it out after trying again.':'Correct.')
      :revealed?'Here is the answer. Select it to finish this question.':q.misses.length?'Try another number.':'';
    renderExplanation(api.explain(model));
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
  function labels(){routeLabel.textContent=ROUTES[submode];optionsButton.setAttribute('aria-label',`Practice options, now ${ROUTES[submode]}`);}
  // Presentation only: never re-activates a route, so queued answers, typed input and awards survive.
  function showPresentation(){
    const active=window.__placePracticeMode==='arithmetic',football=presentation==='football';
    document.body.classList.toggle('plain-practice',active&&!football);document.body.classList.toggle('football-practice',active&&football);
    PLACE_FACT_UI.setPresentation(football);PLACE_BOOK_UI.setPresentation(football);
    if(!panel.hidden)render();
  }
  // `confirmed` is an explicit Update completed page; it is applied after the controller-page refresh so a stale frozen page cannot replace it.
  async function mode(value, persist=true, confirmed=null) {
    const generation=++modeGeneration,route=submode;
    if(value==='arithmetic'&&!confirmed&&sessionPages[route]===null){
      // A first entry reuses a page explicitly confirmed earlier in this visit; only an unconfirmed visit asks.
      const current=CURRICULUM_UI.current();
      if(current)sessionPages[route]=current.completedThroughPage;
      else{busy(true);const progress=await CURRICULUM_UI.ask();if(generation!==modeGeneration)return false;busy(false);if(!progress)return false;sessionPages[route]=progress.completedThroughPage;}
    }
    // A confirmed restart inside a lane owns that lane's frozen page; re-activation must not restore a stale one.
    sessionPages.facts=PLACE_FACT_UI.page()??sessionPages.facts;sessionPages.book=PLACE_BOOK_UI.page()??sessionPages.book;
    if(confirmed)sessionPages[confirmed.route]=confirmed.page;
    window.__placePracticeMode=value;
    if(persist)try{localStorage.setItem(MODE_KEY,value);}catch{}
    const active=value==='arithmetic';
    document.getElementById('practice').hidden=active;
    document.getElementById('session-status').hidden=active;
    document.getElementById('settings-button').hidden=active;
    routeRow.hidden=!active;
    const empty=active&&submode!=='book'&&sessionPages[submode]<17;
    unavailable.hidden=!empty;unavailableTitle.textContent=ROUTES[submode];
    panel.hidden=!active||submode!=='mixed'||empty;
    document.body.classList.toggle('plain-practice',active&&presentation==='plain');
    document.body.classList.toggle('football-practice',active&&presentation==='football');
    PLACE_BOOK_UI.activate(active&&submode==='book',sessionPages.book,presentation==='football');
    PLACE_FACT_UI.activate(active&&submode==='facts'&&!empty,sessionPages.facts,presentation==='football');
    labels();
    place.setAttribute('aria-pressed',String(!active)); arithmetic.setAttribute('aria-pressed',String(active));
    // Keep invalid JSON bytes until a locked user action can check for conflicts.
    if(empty){busy(false);return true;}
    if(active){if(submode==='mixed'){api.configure(sessionPages.mixed);if(!model){model=api.repair(api.create());if(!malformedJSON)save();}else api.repair(model);render();}}else window.__placeValueActivate();
    busy(false);
    return true;
  }
  function openOptions(){
    for(const input of options.querySelectorAll('input'))input.checked=input.value===(input.name==='practice-focus'?submode:presentation);
    PLACE_FACT_UI.interrupt();options.showModal();options.querySelector('[name="practice-focus"]:checked').focus();
  }
  // Every way out of Options returns focus to its trigger; unapplied edits are discarded.
  function closeOptions(){if(options.open)options.close();optionsButton.focus();}
  async function applyChoices(){
    const route=options.querySelector('[name="practice-focus"]:checked').value,shown=options.querySelector('[name="practice-presentation"]:checked').value;
    if(options.open)options.close();
    if(route===submode){
      if(shown!==presentation){presentation=shown;committed={submode,presentation};try{localStorage.setItem(PRESENTATION_KEY,shown);}catch{}showPresentation();}
      optionsButton.focus();return;
    }
    // A focus change stages both choices for one activation and saves them only after it succeeds.
    const generation=++applyGeneration,prior=committed;
    submode=route;presentation=shown;
    const ok=await mode('arithmetic',false);
    if(generation!==applyGeneration)return;
    if(ok){committed={submode,presentation};try{localStorage.setItem(SUBMODE_KEY,route==='mixed'?'mixed-later':route);if(shown!==prior.presentation)localStorage.setItem(PRESENTATION_KEY,shown);}catch{}}
    else{({submode,presentation}=committed);showPresentation();labels();}
    optionsButton.focus();
  }
  // The explicit confirmation point for the active unavailable route only; it never restarts Mixed.
  async function updateCompletedPage(){
    const route=submode,generation=modeGeneration;
    busy(true);const progress=await CURRICULUM_UI.ask();busy(false);
    if(!progress||generation!==modeGeneration||route!==submode||window.__placePracticeMode!=='arithmetic'){if(!unavailable.hidden)updatePage.focus();return;}
    await mode('arithmetic',false,{route,page:progress.completedThroughPage});
    (unavailable.hidden?optionsButton:updatePage).focus();
  }
  optionsButton.addEventListener('click',openOptions);cancelOptions.addEventListener('click',closeOptions);applyOptions.addEventListener('click',applyChoices);
  options.addEventListener('cancel',event=>{event.preventDefault();closeOptions();});
  // A fact restart that confirms a page below 17 switches straight to this route's unavailable screen; it never restarts Mixed.
  PLACE_FACT_UI.onUnavailable(()=>{if(window.__placePracticeMode==='arithmetic'&&submode==='facts')mode('arithmetic',false).then(()=>{if(!unavailable.hidden)updatePage.focus();});});
  updatePage.addEventListener('click',updateCompletedPage);toPlace.addEventListener('click',()=>mode('place-value'));
  place.addEventListener('click',()=>mode('place-value')); arithmetic.addEventListener('click',()=>mode('arithmetic'));
  window.render_game_to_text=()=>CURRICULUM_UI.text().open?JSON.stringify({curriculum:CURRICULUM_UI.text()}):window.__placePracticeMode==='arithmetic'&&submode!=='book'&&sessionPages[submode]<17?JSON.stringify({mode:'arithmetic-unavailable',page:sessionPages[submode]}):window.__placePracticeMode==='arithmetic'&&submode==='book'?JSON.stringify({...PLACE_BOOK_UI.text(),presentation}):window.__placePracticeMode==='arithmetic'&&submode==='facts'?JSON.stringify({...PLACE_FACT_UI.text(),presentation}):window.__placePracticeMode==='arithmetic'?JSON.stringify({mode:'arithmetic',submode:'mixed',presentation,question:model?api.view(model).prompt:null,
    choices:model.question.choices,misses:model.question.misses,complete:model.question.complete,completed:model.completed,target:model.target,
    revealed:model.question.misses.length>=3,
    worked:model.question.complete||model.question.misses.length>=3?api.view(model).worked:null,explanation:api.explain(model)}):placeText();
  window.__arithmeticTest=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify(model)),storageKey:KEY});
  panel.setAttribute('aria-busy','true');PLACE_FACT_UI.panel.setAttribute('aria-busy','true');
  CURRICULUM_UI.ask().then(progress=>{if(progress){if(window.__placePracticeMode==='arithmetic')sessionPages[submode]=progress.completedThroughPage;mode(window.__placePracticeMode,false);}else mode('place-value',false);});
})();
