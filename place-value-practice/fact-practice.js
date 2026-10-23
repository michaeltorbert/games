// Isolated Fact practice controller. Monotonic timing origins never enter storage.
(() => {
  'use strict';
  const api=PLACE_FACTS,KEY='place-value-practice:facts:v1';
  let model=null,savedRaw=null,writable=true,message='',active=false,busy=false,input='',origin=null,timingInvalid=true,renderToken=0;
  // A completed question waits for an explicit Next so its worked explanation can be read.
  // nextEpoch lets restart, stale-tab refresh and mode changes cancel a Next still queued for the lock.
  let lastAward=null,driveNotice='',nextEpoch=0,lifecycle=0,restartIntent=0,whenIdle=Promise.resolve();
  let sessionPage=null;
  const EMPTY_MESSAGE='No fact lessons completed yet. Return after printed page 17.';
  // The Math practice shell shows its route-aware unavailable screen when a restart confirms a page below 17.
  let unavailable=null;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const panel=node('main');panel.id='fact-practice';panel.hidden=true;panel.setAttribute('aria-busy','false');
  const title=node('h2','Number facts','sr-only');title.id='facts-title';panel.setAttribute('aria-labelledby',title.id);
  const scope=node('p','Focused, spaced retrieval of single-digit addition and matching subtraction facts.');
  const setup=node('div',null,'arithmetic-setup'),label=node('label','Questions this session'),length=node('input');length.setAttribute('aria-label','Fact practice question count');
  length.type='number';length.min='1';length.max='100';length.step='1';length.inputMode='numeric';length.value='10';length.id='facts-length';
  const lengthError=node('p');lengthError.id='facts-length-error';lengthError.setAttribute('role','alert');lengthError.hidden=true;length.setAttribute('aria-describedby',lengthError.id);
  length.addEventListener('input',()=>{length.removeAttribute('aria-invalid');lengthError.hidden=true;});
  length.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();restartSession();}});
  const button=(text,fn,cls='button')=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
  const reset=button('Start new fact session',restartSession,'button button--quiet');label.append(length);setup.append(label,reset,lengthError);
  const count=node('p'),equation=node('h3');count.id='facts-count';equation.id='facts-equation';
  const drive=node('section',null,'facts-drive');drive.setAttribute('aria-labelledby','facts-drive-title');
  const driveHeader=node('div',null,'facts-drive-header'),driveTitle=node('h3','Touchdown drive');driveTitle.id='facts-drive-title';
  const score=node('span');score.id='facts-score';driveHeader.append(driveTitle);
  const field=node('div',null,'facts-field');field.setAttribute('role','progressbar');field.setAttribute('aria-labelledby',driveTitle.id);
  field.setAttribute('aria-valuemin','0');field.setAttribute('aria-valuemax','100');
  const scenery=node('img',null,'facts-stadium');scenery.src='assets/touchdown-stadium-v1.webp?v=1.9.1';scenery.alt='';scenery.width=2048;scenery.height=768;scenery.decoding='async';
  const turf=node('div',null,'facts-turf');turf.setAttribute('aria-hidden','true');
  for(const mark of [0,25,50,75,100]){const line=node('span',String(mark),'facts-yard-line');line.style.left=`${mark}%`;turf.append(line);}
  const ball=node('img',null,'facts-ball');ball.src='assets/touchdown-runner-v1.webp?v=1.9.1';ball.alt='';ball.decoding='async';turf.append(ball);field.append(turf);
  const kickBall=node('span','🏈','facts-kick-ball');kickBall.setAttribute('aria-hidden','true');field.append(kickBall);
  const driveCaption=node('div',null,'facts-drive-caption'),yards=node('strong'),milestone=node('span'),award=node('span');yards.id='facts-yards';milestone.id='facts-milestone';award.id='facts-award';driveCaption.append(yards,milestone);
  driveHeader.append(driveCaption);
  const rule=node('p','First try: +5 yards. Wrong answer or help: −5 yards. Finish after help or a retry: +1 yard.','facts-rule');rule.id='facts-rule';
  const driveSummary=node('div',null,'facts-drive-summary');driveSummary.append(score,rule);
  drive.append(scenery,driveHeader,driveSummary,field,award);
  const display=node('output','…');display.id='facts-answer';display.setAttribute('aria-label','Your answer');display.setAttribute('aria-live','polite');
  const entry=node('div',null,'facts-entry');entry.append(equation,display);
  const keypad=node('div',null,'facts-keypad');keypad.setAttribute('role','group');keypad.setAttribute('aria-label','Answer keypad');
  for(const digit of ['1','2','3','4','5','6','7','8','9','Clear','0','⌫']) {
    const b=button(digit,()=>type(digit));if(digit==='⌫')b.setAttribute('aria-label','Backspace');keypad.append(b);
  }
  const check=button('Submit',submit,'button button--primary');check.id='facts-check';
  for(const control of [display,keypad,check,...keypad.querySelectorAll('button')])control.setAttribute('aria-describedby',equation.id);
  const show=button('Help me',()=>{invalidate();change(()=>api.show(model,model.attempt.id));},'button button--quiet');show.id='facts-show';
  const controls=node('div',null,'facts-controls');controls.append(check,show);
  const support=node('p');support.id='facts-support';
  const feedback=node('p');feedback.id='facts-feedback';feedback.setAttribute('role','status');
  const recap=node('div');recap.id='facts-recap';recap.tabIndex=-1;
  const recapText=node('p'),again=button('Practice again',restartSession,'button button--primary');again.id='facts-again';recap.append(recapText,again);
  const question=node('div',null,'facts-question');question.append(count,entry,support,feedback,recap);
  // After completion these take the keypad and answer-control places, keeping the dock's footprint.
  const worked=node('section',null,'arithmetic-explanation facts-worked');worked.id='facts-worked';worked.hidden=true;
  const nextButton=button('Next',goNext,'button button--primary');nextButton.id='facts-next';
  const continueBox=node('div',null,'facts-continue');continueBox.hidden=true;continueBox.append(nextButton);
  const dock=node('div',null,'facts-dock');dock.append(question,keypad,controls,worked,continueBox);
  const report=node('details');report.id='facts-report';const summary=node('summary','Grown-up report');
  let openingReport=false;
  async function openReport(){
    report.open=false;invalidate();
    if(openingReport||!active||!model)return;
    openingReport=true;const attempt=model.attempt;
    try{
      await change(()=>api.reportOpened(model,attempt.id));
      if(active&&model.attempt===attempt&&(attempt.complete||(!attempt.eligible&&attempt.rewardSupported)))report.open=true;
    }finally{openingReport=false;}
  }
  summary.addEventListener('click',event=>{
    if(report.open)return;
    event.preventDefault();openReport();
  });
  report.addEventListener('toggle',()=>{if(report.open){invalidate();if(model&&!model.attempt.complete&&(model.attempt.eligible||!model.attempt.rewardSupported))openReport();}});report.append(summary);
  const reportContent=node('div');report.append(reportContent);
  const storage=node('p');storage.className='facts-storage';storage.setAttribute('role','status');
  const driveInfo=node('p',null,'facts-drive-info');
  const scoring=node('p','Drive rules: 5 yards on the first try without help; 1 yard for finishing after a retry, Help me, or opening this report. Each wrong answer or Help me moves back 5 yards, stopping at the start of the current drive. Automatic help after two misses adds no extra loss. A touchdown scores 6 points, followed by a bonus extra-point question. A first-try answer without help or report exposure earns 1 more point. A miss or help forfeits that point; finish the question for practice. Kicks never change yards and do not count toward your chosen session length. Earned points stay safe. These are practice rewards, not learning checks.');reportContent.after(scoring,scope);
  const meta=node('div',null,'facts-meta');meta.append(setup,report,driveInfo,storage);
  panel.append(title,drive,dock,meta);
  function cancelNext(){nextEpoch++;}
  function goNext(){
    if(!active||busy||!model?.attempt.complete||api.sessionDone(model))return;
    const id=model.attempt.id;change(()=>api.next(model,id),nextEpoch);
  }
  async function restartSession(){
    if(model&&(api.pendingKick(model)||model.attempt.kind==='extraPoint'&&!model.attempt.complete))return;
    const target=length.valueAsNumber;
    if(!Number.isInteger(target)||target<1||target>100){length.setAttribute('aria-invalid','true');lengthError.textContent='Enter a whole number from 1 to 100.';lengthError.hidden=false;length.focus();return;}
    length.removeAttribute('aria-invalid');lengthError.hidden=true;
    cancelNext();panel.setAttribute('aria-busy','true');const progress=await CURRICULUM_UI.ask();panel.setAttribute('aria-busy','false');if(!progress)return;sessionPage=progress.completedThroughPage;api.configure(sessionPage);if(sessionPage<17){message=EMPTY_MESSAGE;render();if(active)unavailable?.();return;}
    cancelNext();const intent=++restartIntent,life=lifecycle;
    await whenIdle;if(active&&life===lifecycle&&intent===restartIntent)await change(()=>api.restart(model,target));
  }
  function invalidate(){origin=null;timingInvalid=true;renderToken++;}
  function equationVisible(){const r=equation.getBoundingClientRect();return document.visibilityState==='visible'&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}
  function memory(reason='Your fact progress and drive yards stay in memory for this visit.'){writable=false;message=reason;invalidate();}
  function parse(raw){try{return raw===null?null:JSON.parse(raw);}catch{return null;}}
  // Learning-event outbox observer (#199). Dormant until a #200 enrollment exists. It copies
  // accepted primitives after the unchanged domain save and never awaits, so busy, focus,
  // rendering and the save order are unchanged. Only a persisted, normalized attempt may
  // resume a durable question link; a repair is reported once its replacement is saved.
  // outboxAnswered marks an accepted answer explicitly: at the 99-miss cap a wrong answer
  // is accepted without changing the miss count, so it cannot be inferred from progress.
  let outboxRestored=null,outboxRepair=null,outboxAnswered=false;
  const outboxAttempt=s=>{const q=s.attempt;return {nonce:q.id,factId:q.factId,serial:s.serial,misses:q.misses,helped:q.helped,firstCorrect:q.firstCorrect,complete:q.complete};};
  const outboxAdoptable=before=>writable&&!!outboxRestored&&outboxRestored.nonce===before.nonce&&outboxRestored.factId===before.factId&&outboxRestored.serial===before.serial;
  function outboxSend(captured,before,after,adoptable,observations){
    const fact=api.byId[before.factId];
    if(!fact)return;
    const replaced=!after;
    LEARNING_OUTBOX.recordFacts(captured,{gameVersion:typeof GAME_VERSION==='string'?GAME_VERSION:null,durable:writable,adoptable,before,after:after||before,replaced,
      observations:replaced?[{kind:'leftUnfinished',fields:{factId:fact.id,family:fact.family}}]:observations});
  }
  // #200: this tab's who-is-practicing choice applies to new questions; the outbox keeps a
  // started question on the profile it was first recorded for (its persisted binding).
  function outboxCapture(){return typeof LEARNING_OUTBOX==='undefined'?null:LEARNING_OUTBOX.capture(typeof LEARNING_SYNC==='undefined'?undefined:LEARNING_SYNC.player()??undefined);}
  let playerPicker=null;
  const attemptStarted=q=>!q.complete&&(q.misses>0||q.helped||q.firstCorrect!==null);
  function renderPlayerPicker(){
    if(!playerPicker&&typeof LEARNING_SYNC!=='undefined'){
      playerPicker=LEARNING_SYNC.buildPlayerPicker({id:'facts-player',legend:'Who’s practicing?',fieldsetClass:'lr-player-picker',optionsClass:'lr-player-options',optionClass:'lr-player-option',statusClass:'lr-player-status',
        status:chosen=>!chosen?'Choose who is practicing so practice is reported for the right player.':model&&attemptStarted(model.attempt)?'This question stays with the player who started it. The new choice starts with the next question.':''});
      // Shown before practice: after the panel heading, ahead of the drive field and the question dock.
      // Play is never blocked; without a choice nothing is recorded (fail closed).
      if(playerPicker)panel.insertBefore(playerPicker.element,drive);
    }
    if(playerPicker)playerPicker.refresh();
  }
  // Enrolled several-profile device with no choice yet: on the document's first Facts activation,
  // drop the stale document selection that the page-completion dialog leaves behind (its input
  // was select()ed, then the dialog was removed before Facts showed). In WebKit that selection
  // was later revealed after Facts grew the page, scrolling past the choice; clearing it at this
  // point prevented the scroll in every traced case (scroll-trace differential 20261021T181628Z,
  // a selection-dependent bound, not engine-internal proof). Synchronous and first activation
  // only, never during practice, only while nothing has focus and the selection is not inside an
  // editable field. Focus, timing, answers and play are untouched. Single-profile and
  // reporting-off pages have no picker and are unchanged.
  function clearStaleSelection(){
    if(!playerPicker||typeof LEARNING_SYNC==='undefined'||LEARNING_SYNC.player()!==null)return;
    const focused=document.activeElement;
    if(focused&&focused!==document.body&&focused!==document.documentElement)return;
    const selection=typeof document.getSelection==='function'?document.getSelection():null;
    if(!selection||!selection.rangeCount)return;
    const node=selection.anchorNode,element=node&&(node.nodeType===1?node:node.parentElement);
    if(element&&element.closest('input,textarea,[contenteditable]:not([contenteditable="false"])'))return;
    selection.removeAllRanges();
  }
  // The page footer's privacy line: local-only unless this device reports Number facts results.
  // Reporting never claims delivery; other Place practice is never sent.
  const privacy=document.getElementById('practice-privacy'),LOCAL_ONLY=privacy?privacy.textContent:'';
  const REPORTING='Number facts results on this device are kept here until they are sent to a private grown-up report. Other practice stays on this device.';
  function renderPrivacy(){
    if(!privacy)return;
    const reporting=typeof LEARNING_SYNC!=='undefined'&&LEARNING_SYNC.players()!==null;
    const text=reporting?REPORTING:LOCAL_ONLY;
    if(privacy.textContent!==text)privacy.textContent=text;
  }
  renderPrivacy();
  function outboxRepaired(before){
    if(before.complete)return;
    if(writable){outboxRepair={before,adoptable:outboxAdoptable(before)};return;}
    try{const captured=outboxCapture();if(captured)outboxSend(captured,before,null,false);}catch{}
  }
  function outboxLoaded(loaded){
    outboxRepair=null;outboxRestored=loaded&&writable?loaded:null;
    try{if(loaded&&model.attempt.id!==loaded.nonce)outboxRepaired(loaded);}catch{}
  }
  function reportFacts(before,prior){
    const repair=outboxRepair,answered=outboxAnswered;outboxRepair=null;outboxAnswered=false;
    try{
      const captured=outboxCapture();if(!captured)return;
      if(repair&&writable)outboxSend(captured,repair.before,null,repair.adoptable);
      if(before.complete)return;
      if(model.attempt!==prior){outboxSend(captured,before,null,outboxAdoptable(before));return;}
      const after=outboxAttempt(model),fact=api.byId[before.factId],base={factId:fact.id,family:fact.family},observations=[];
      if(answered||after.complete||after.misses>before.misses)observations.push({kind:'attempt',fields:{...base,number:before.misses+1,correct:after.complete,helped:before.helped}});
      if(after.helped&&!before.helped)observations.push({kind:'help',fields:{...base,number:after.misses+1,helped:true}});
      if(after.complete){
        const h=model.facts[fact.id].history.at(-1);if(!h||h.serial!==model.serial)return;
        observations.push({kind:'resolution',fields:{...base,outcome:h.outcome,eligibleCheck:h.eligible,timingMs:h.ms,helped:after.helped}});
      }
      if(observations.length)outboxSend(captured,before,after,outboxAdoptable(before),observations);
      if(after.complete&&typeof LEARNING_SYNC!=='undefined')LEARNING_SYNC.nudge();
    }catch{}
  }
  function readInitial(){
    try{savedRaw=localStorage.getItem(KEY);const parsed=parse(savedRaw);
      if(parsed&&typeof parsed.schemaVersion==='number'&&parsed.schemaVersion>api.SCHEMA_VERSION)memory('This fact save comes from a newer version. This session and its drive yards stay in memory.');
      const restored=api.normalize(parsed),loaded=restored&&outboxAttempt(restored);model=api.repair(restored||api.create());outboxLoaded(loaded);
      if(restored&&api.driveNeedsRepair(parsed))driveNotice='The saved drive could not be read, so it starts at zero. Your learning progress is preserved.';
      if(savedRaw!==null&&!restored&&writable)message='The saved fact progress could not be read. Your next action starts a fresh saved practice.';
    }catch{memory();model=api.create();}
    length.value=String(model.session.target);
  }
  function refresh(){
    if(!writable)return true;
    const raw=localStorage.getItem(KEY);if(raw===savedRaw)return true;
    const parsed=parse(raw);cancelNext();invalidate();input='';lastAward=null;
    if(parsed&&typeof parsed.schemaVersion==='number'&&parsed.schemaVersion>api.SCHEMA_VERSION){memory('This fact save comes from a newer version. This session and its drive yards stay in memory.');return false;}
    report.open=false;const restored=api.normalize(parsed),loaded=restored&&outboxAttempt(restored);model=api.repair(restored||api.create());outboxLoaded(loaded);
    driveNotice=restored&&api.driveNeedsRepair(parsed)?'The saved drive could not be read, so it starts at zero. Your learning progress is preserved.':'';
    savedRaw=raw;message='Fact progress changed in another tab. Please try again.';return false;
  }
  // After a live touchdown answer only: when the whole stadium and Next fit in the viewport together, move the
  // current scroll the least amount into the range that shows both (WebKit iPad landscape left the stadium top
  // 20px above the viewport). Never shrinks art; skips Plain, idle, reload, and spans taller than the viewport.
  function keepTouchdownInView(){
    if(!active||drive.hidden||continueBox.hidden||!lastAward?.touchdown||!model.attempt.complete)return;
    const d=drive.getBoundingClientRect(),n=nextButton.getBoundingClientRect(),y=scrollY;
    if(d.top>=0&&n.bottom<=innerHeight)return;
    const low=Math.max(0,n.bottom+y-innerHeight),high=Math.min(d.top+y,document.documentElement.scrollHeight-innerHeight);
    // 'instant' overrides the page's smooth scroll-behavior so the corrected position applies at once.
    if(low<=high)scrollTo({left:scrollX,top:Math.min(Math.max(y,low),high),behavior:'instant'});
  }
  async function change(action,epoch=null){
    if(busy||!active||sessionPage!==null&&sessionPage<17)return;
    busy=true;panel.setAttribute('aria-busy','true');const attemptId=model.attempt.id,life=lifecycle;
    let finish;whenIdle=new Promise(resolve=>{finish=resolve;});
    const run=()=>{
      if(!active||life!==lifecycle||epoch!==null&&epoch!==nextEpoch)return;
      try{if(!refresh()){render(false);return;}}catch{memory();}
      if(!active||model.attempt.id!==attemptId)return;
      const prior=model.attempt,wasComplete=prior.complete,priorDrive=api.drive(model),priorMisses=prior.misses,wasHelped=prior.helped,outboxBefore=outboxAttempt(model);
      outboxAnswered=false;
      if(!action())return;
      if(!wasComplete&&model.attempt===prior&&(prior.complete||prior.misses>priorMisses||prior.helped!==wasHelped)){
        const current=api.drive(model);lastAward={yards:current.totalYards-priorDrive.totalYards,touchdown:current.touchdowns>priorDrive.touchdowns,penalty:!prior.complete,kick:prior.kind==='extraPoint'};
      }
      if(writable)try{savedRaw=JSON.stringify(model);localStorage.setItem(KEY,savedRaw);message='';if(!api.driveNeedsRepair(model))driveNotice='';}catch{memory();}
      reportFacts(outboxBefore,prior);
      const newPrompt=prior!==model.attempt;
      if(newPrompt){cancelNext();input='';report.open=false;lastAward=null;}
      render(newPrompt);
      if(active){if(api.sessionDone(model))recap.focus({preventScroll:true});else if(newPrompt)check.focus({preventScroll:true});else if(!wasComplete&&model.attempt.complete)nextButton.focus({preventScroll:true});}
      if(!newPrompt&&lastAward?.touchdown){const id=model.attempt.id;keepTouchdownInView();requestAnimationFrame(()=>{if(life===lifecycle&&model.attempt.id===id)keepTouchdownInView();});}
    };
    try {
      if(writable&&navigator.locks)try{await navigator.locks.request(KEY,run);}catch{memory();run();}
      else {if(writable)memory();run();}
    }finally{busy=false;panel.setAttribute('aria-busy','false');finish();}
  }
  function type(value){
    if(!active||busy||model.attempt.complete)return;
    if(value==='Clear')input='';else if(value==='⌫'||value==='Backspace'||value==='Delete')input=input.slice(0,-1);
    else if(/^\d$/.test(value)){const proposed=input==='0'?value:input+value;if(proposed.length<=2&&Number(proposed)<=18)input=proposed;}
    display.textContent=input||'…';
  }
  function submit(){
    if(!active||busy||!input||model.attempt.complete)return;
    const q=model.attempt,now=performance.now(),elapsed=origin===null?null:now-origin;
    const ms=!timingInvalid&&equationVisible()&&elapsed>=300&&elapsed<=60000?Math.round(elapsed/100)*100:null;
    invalidate();const value=Number(input);
    change(()=>{const result=api.answer(model,q.id,value,ms);if(result)outboxAnswered=true;if(result&&!model.attempt.complete)input='';return result;});
  }
  function renderReport(){
    const data=api.report(model);reportContent.replaceChildren();
    reportContent.append(node('p',`Addition: ${data.additionChecked} of 100 checked. Subtraction: ${data.subtractionChecked} of 100 checked.`),
      node('p','Entry time includes reading and tapping. It cannot tell us whether an answer was recalled, counted, or calculated. Quick entry means within 8 seconds for a one-digit answer or 10 seconds for two digits; it is a practice guide, not a mastery measure.'),
      node('p',`${data.rows.filter(r=>r.checks===0).length} exact facts have not had an unsupported check yet.`));
    const groups=[['Another try due',r=>r.practiced&&r.needsPractice],['Practiced without an eligible check',r=>r.practiced&&!r.needsPractice&&r.checks===0],['One eligible check',r=>r.practiced&&!r.needsPractice&&r.checks===1],['Repeated spaced checks',r=>r.practiced&&!r.needsPractice&&r.checks>=2]];
    for(const [name,filter] of groups){const section=node('details');section.append(node('summary',`${name} (${data.rows.filter(filter).length})`));
      for(const r of data.rows.filter(filter))section.append(node('p',`${r.equation}: ${r.checks} eligible check${r.checks===1?'':'s'}${r.quick?' · quick and accurate on the latest two checks':''}${r.typicalMs===null?'':` · typical valid entry ${(r.typicalMs/1000).toFixed(1)}s`}.`));
      reportContent.append(section);
    }
    const familyList=node('details');familyList.append(node('summary','All fact families, with separate equations'));
    for(const [index,id] of api.families.entries()){const rows=data.rows.filter(r=>r.family===id),group=node('details');group.append(node('summary',`Fact family ${index+1}`));
      for(const r of rows)group.append(node('p',`${r.equation}: ${r.completed} completed; ${r.checks} eligible checks${r.needsPractice?'; another try due':''}.`));familyList.append(group);}
    reportContent.append(familyList);
  }
  function render(startTiming=false){
    dock.hidden=sessionPage!==null&&sessionPage<17;
    if(dock.hidden){storage.textContent=message;return;}
    if(!model)return;const q=model.attempt,f=api.byId[q.factId],done=api.sessionDone(model),kick=q.kind==='extraPoint',pendingKick=api.pendingKick(model),kickFailed=q.misses>0||q.helped||q.rewardSupported;
    const kickLocked=pendingKick||kick&&!q.complete;reset.disabled=kickLocked;length.disabled=kickLocked;
    check.textContent=kick?(kickFailed?'Finish practice':'Kick for +1'):'Submit';
    driveTitle.textContent=kick?'Extra-point kick':'Touchdown drive';
    rule.textContent=kick?'First try without help: +1 point. Miss or help: no extra point.':'First try: +5 yards. Wrong answer or help: −5 yards. Finish after help or a retry: +1 yard.';
    count.textContent=done?'Session complete':kick?'Bonus kick':`Question ${Math.min(model.session.completed+(q.complete?0:1),model.session.target)} of ${model.session.target}`;
    equation.textContent=`${api.equation(f)} =`;display.textContent=q.complete?String(f.answer):input||'…';
    for(const b of keypad.querySelectorAll('button'))b.disabled=q.complete;
    check.disabled=q.complete;show.disabled=q.complete||q.helped;support.hidden=!q.helped||q.complete;support.textContent=q.helped?api.help(f):'';
    // Entry controls give way to the worked explanation and Next once the answer is complete.
    keypad.hidden=q.complete;controls.hidden=q.complete;dock.classList.toggle('facts-dock--complete',done);dock.classList.toggle('facts-dock--answered',q.complete&&!done);
    PLACE_WORKED_UI.render(worked,api.explain(model),'facts-worked-title');
    continueBox.hidden=!q.complete||done;nextButton.textContent=pendingKick?'Next: extra-point kick':'Next';
    feedback.textContent=q.complete?(q.helped?'You entered the shown answer.':q.misses?'You worked it out after another try.':'Correct.'):
      q.helped?'The answer is shown above. Enter it, then Submit.':q.misses?'Try again, or choose Help me.':'Enter your answer, then Submit.';
    const goal=api.drive(model);
    yards.textContent=kick?(q.complete?'Kick complete':kickFailed?'Kick missed':'Kick for +1'):`${goal.yards} / 100 yards`;
    milestone.textContent=kick?`Next drive: ${goal.yards} / 100 yards`:`Next milestone: ${Math.min(100,(Math.floor(goal.yards/25)+1)*25)} yards`;
    score.textContent=`Score: ${api.score(model)}`;
    field.setAttribute('aria-valuenow',String(goal.yards));field.setAttribute('aria-valuetext',kick?`Extra-point kick; ${score.textContent}; next drive ${goal.yards} of 100 yards`:`${goal.yards} of 100 yards; ${score.textContent}`);
    ball.style.left=`${goal.yards}%`;
    drive.classList.toggle('facts-drive--touchdown',!!lastAward?.touchdown);
    const movement=lastAward&&!kick?(lastAward.penalty?(lastAward.yards===0?'At the start of this drive':`−${Math.abs(lastAward.yards)} yard${Math.abs(lastAward.yards)===1?'':'s'}`):`+${lastAward.yards} yard${lastAward.yards===1?'':'s'}`):'';
    award.textContent=lastAward?.touchdown?'Touchdown! +6 points':movement;
    award.hidden=!lastAward||kick;drive.classList.toggle('facts-drive--earned',!!lastAward&&!kick);
    if(lastAward&&!kick&&q.complete)feedback.textContent+=` +${lastAward.yards} yard${lastAward.yards===1?'':'s'}.${lastAward.touchdown?(goal.yards===0?' Touchdown! Extra-point kick next.':` Touchdown! ${goal.yards} yard${goal.yards===1?'':'s'} saved for your next drive. Extra-point kick next.`):''}`;
    if(lastAward?.penalty&&!kick&&!q.complete)feedback.textContent+=` ${movement}. Your score stays ${api.score(model)}.`;
    if(kick){
      const missed=q.misses>0||q.helped||q.rewardSupported;
      feedback.textContent=q.complete?(q.kickResult==='good'?'Extra point is good! +1 point.':q.kickResult==='unscored'?'Extra-point practice complete. Score unchanged.':'Extra point missed. Your touchdown points are safe.'):
        missed?(q.helped?'Extra point missed. Enter the shown answer to finish.':'Extra point missed. Try again to finish the practice question.'):'One correct answer without help kicks the extra point!';
      if(q.complete){award.hidden=false;award.textContent=q.kickResult==='good'?'Extra point! +1':q.kickResult==='unscored'?'Practice complete':'Extra point missed';}
      else if(missed){award.hidden=false;award.textContent='Extra point missed';}
    }
    drive.classList.toggle('facts-drive--kick',kick);
    drive.classList.toggle('facts-drive--kick-good',kick&&q.kickResult==='good');
    driveInfo.textContent=writable?'Your drive saves in this browser on this device. Starting a new session keeps your yards. Clearing browser data can remove them.':'Drive yards are unsaved and stay in memory for this visit.';
    recap.hidden=!done;recapText.textContent=done?`Nice practice! ${model.session.completed} completed. ${model.session.firstTry} first try. ${model.session.helped} after another try or shown answer.${model.session.bonusCompleted?` Plus ${model.session.bonusCompleted} extra-point question${model.session.bonusCompleted===1?'':'s'}.`:''}`:'';
    const storageMessage=[message,driveNotice].filter(Boolean).join(' ');
    if(storage.textContent!==storageMessage)storage.textContent=storageMessage;
    renderPlayerPicker();
    renderPrivacy();
    renderReport();
    if(startTiming){invalidate();const token=renderToken,id=q.id;requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(active&&token===renderToken&&model.attempt.id===id&&!q.complete&&!q.helped&&q.firstCorrect===null&&equationVisible()&&!report.open){origin=performance.now();timingInvalid=false;}
    }));}
  }
  window.addEventListener('blur',invalidate);document.addEventListener('visibilitychange',invalidate);
  window.addEventListener('scroll',()=>{if(active&&!equationVisible())invalidate();},{passive:true});
  document.addEventListener('keydown',event=>{
    // Keys typed in any dialog (Practice options, page prompt) never reach the answer. As before this guard,
    // Backspace/Delete outside an editable field keep their default prevented, so the browser cannot act on them.
    if(event.target.closest?.('dialog')||document.querySelector('dialog[open]')){
      if(active&&['Backspace','Delete'].includes(event.key)&&!event.target.closest?.('input:not([type="radio"]):not([type="checkbox"]),textarea,select,[contenteditable="true"]'))event.preventDefault();
      return;
    }
    if(!active||event.ctrlKey||event.metaKey||event.altKey||['INPUT','TEXTAREA','SELECT','SUMMARY'].includes(event.target.tagName)||report.contains(event.target)||event.target===reset)return;
    if(event.key==='Enter'&&event.target.closest('button,a,input,textarea,[role="button"],[contenteditable="true"]')&&event.target!==check)return;
    if(/^\d$/.test(event.key)||['Backspace','Delete','Enter'].includes(event.key)){event.preventDefault();if(event.key==='Enter')submit();else type(event.key);}
  });
  window.PLACE_FACT_UI=Object.freeze({panel,
    page:()=>sessionPage,
    activate(value,page,football=true){const first=model===null;cancelNext();lifecycle++;active=value;panel.hidden=!value;document.body.classList.toggle('facts-active',value&&football);lastAward=null;invalidate();if(value){drive.hidden=!football;if(page!==null&&page!==undefined)sessionPage=page;if(sessionPage!==null)api.configure(sessionPage);
      if(sessionPage>=17&&message===EMPTY_MESSAGE)message='';
      // Re-check an existing prompt against the confirmed page on every activation; the next locked action saves a repair.
      if(first)readInitial();else{const id=model.attempt.id,before=outboxAttempt(model);api.repair(model);if(model.attempt.id!==id){input='';report.open=false;try{outboxRepaired(before);}catch{}}}
      render(first&&savedRaw===null);if(first)clearStaleSelection();}},
    // Opening Practice options only discards this question's timing sample; help and report state are untouched.
    interrupt(){invalidate();},
    onUnavailable(listener){unavailable=listener;},
    // Display only: no lifecycle change, so a queued Submit or Next, the typed answer and awards survive.
    setPresentation(football){drive.hidden=!football;document.body.classList.toggle('facts-active',active&&football);},
    // Fact focus has no timed transitions; Next is always an explicit action.
    advanceTime(){},
    text(){if(sessionPage!==null&&sessionPage<17)return {mode:'arithmetic-unavailable',page:sessionPage};const q=model.attempt,f=api.byId[q.factId];return {mode:'arithmetic',submode:'facts',question:`${api.equation(f)} = ?`,answerEntry:q.complete?String(f.answer):input,
      play: q.kind,kickResult:q.kickResult,extraPointPending:api.pendingKick(model),bonusCompleted:model.session.bonusCompleted,complete:q.complete,shown:q.helped,misses:q.misses,completed:model.session.completed,target:model.session.target,worked:q.helped?api.help(f):null,explanation:api.explain(model),nextAvailable:q.complete&&!api.sessionDone(model),
      drive:{...api.drive(model),score:api.score(model),lastAward:lastAward?.yards??null,celebrating:!!lastAward?.touchdown,saved:writable}};}
  });
  window.__factsTest=Object.freeze({storageKey:KEY,snapshot:()=>model&&JSON.parse(JSON.stringify(model)),timing:()=>({valid:!timingInvalid,started:origin!==null}),
    diagnostics:()=>model&&api.select(model).diagnostics});
})();
