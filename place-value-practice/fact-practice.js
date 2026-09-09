// Isolated Fact practice controller. Monotonic timing origins never enter storage.
(() => {
  'use strict';
  const api=PLACE_FACTS,KEY='place-value-practice:facts:v1';
  let model=null,savedRaw=null,writable=true,message='',active=false,busy=false,input='',origin=null,timingInvalid=true,renderToken=0;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const panel=node('main');panel.id='fact-practice';panel.hidden=true;panel.setAttribute('aria-busy','false');
  const title=node('h2','Basic addition & subtraction');title.id='facts-title';panel.setAttribute('aria-labelledby',title.id);
  const scope=node('p','Add single-digit numbers and practice the matching subtraction facts. No two-digit addition.');
  const setup=node('div',null,'arithmetic-setup'),label=node('label','Session length '),length=node('select');length.setAttribute('aria-label','Fact practice session length');
  for(const value of [5,10]){const option=node('option',`${value} questions`);option.value=value;length.append(option);}length.value='10';
  const button=(text,fn,cls='button')=>{const b=node('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
  const reset=button('Start new fact session',()=>change(()=>api.restart(model,Number(length.value))),'button button--quiet');label.append(length);setup.append(label,reset);
  const count=node('p'),equation=node('h3');equation.id='facts-equation';
  const display=node('output','…');display.id='facts-answer';display.setAttribute('aria-label','Your answer');display.setAttribute('aria-live','polite');
  const entry=node('div',null,'facts-entry');entry.append(equation,display);
  const keypad=node('div',null,'facts-keypad');keypad.setAttribute('role','group');keypad.setAttribute('aria-label','Answer keypad');
  for(const digit of ['1','2','3','4','5','6','7','8','9','Clear','0','⌫']) {
    const b=button(digit,()=>type(digit));if(digit==='⌫')b.setAttribute('aria-label','Backspace');keypad.append(b);
  }
  const check=button('Check',submit,'button button--primary');check.id='facts-check';
  for(const control of [display,keypad,check,...keypad.querySelectorAll('button')])control.setAttribute('aria-describedby',equation.id);
  const show=button('Show me',()=>{invalidate();change(()=>api.show(model,model.attempt.id));},'button button--quiet');show.id='facts-show';
  const controls=node('div',null,'facts-controls');controls.append(check,show);
  const support=node('p');support.id='facts-support';
  const feedback=node('p');feedback.id='facts-feedback';feedback.setAttribute('role','status');
  const next=button('Next',()=>{const q=model.attempt;change(()=>model.session.completed>=model.session.target?api.restart(model,Number(length.value)):api.next(model,q.id));},'button button--primary');next.id='facts-next';
  const recap=node('p');recap.id='facts-recap';
  const report=node('details');report.id='facts-report';const summary=node('summary','Grown-up report');
  let openingReport=false;
  async function openReport(){
    report.open=false;invalidate();
    if(openingReport||!active||!model)return;
    openingReport=true;const attempt=model.attempt;
    try{
      await change(()=>api.reportOpened(model,attempt.id));
      if(active&&model.attempt===attempt&&(attempt.complete||!attempt.eligible))report.open=true;
    }finally{openingReport=false;}
  }
  summary.addEventListener('click',event=>{
    if(report.open)return;
    event.preventDefault();openReport();
  });
  report.addEventListener('toggle',()=>{if(report.open){invalidate();if(model&&!model.attempt.complete&&model.attempt.eligible)openReport();}});report.append(summary);
  const reportContent=node('div');report.append(reportContent);
  const storage=node('p');storage.className='facts-storage';storage.setAttribute('role','status');
  panel.append(title,scope,setup,count,entry,keypad,controls,support,feedback,next,recap,report,storage);
  function invalidate(){origin=null;timingInvalid=true;renderToken++;}
  function equationVisible(){const r=equation.getBoundingClientRect();return document.visibilityState==='visible'&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}
  function memory(reason='Your fact progress stays in memory for this visit.'){writable=false;message=reason;invalidate();}
  function parse(raw){try{return raw===null?null:JSON.parse(raw);}catch{return null;}}
  function readInitial(){
    try{savedRaw=localStorage.getItem(KEY);const parsed=parse(savedRaw);
      if(parsed&&typeof parsed.schemaVersion==='number'&&parsed.schemaVersion>api.SCHEMA_VERSION)memory('This fact save comes from a newer version. This session stays in memory.');
      model=api.normalize(parsed)||api.create();
      if(savedRaw!==null&&!api.normalize(parsed)&&writable)message='The saved fact progress could not be read. Your next action starts a fresh saved practice.';
    }catch{memory();model=api.create();}
    length.value=String(model.session.target);
  }
  function refresh(){
    if(!writable)return true;
    const raw=localStorage.getItem(KEY);if(raw===savedRaw)return true;
    const parsed=parse(raw);invalidate();input='';
    if(parsed&&typeof parsed.schemaVersion==='number'&&parsed.schemaVersion>api.SCHEMA_VERSION){memory('This fact save comes from a newer version. This session stays in memory.');return false;}
    report.open=false;model=api.normalize(parsed)||api.create();savedRaw=raw;message='Fact progress changed in another tab. Please try again.';return false;
  }
  async function change(action){
    if(busy||!active)return;
    busy=true;panel.setAttribute('aria-busy','true');const attemptId=model.attempt.id;
    const run=()=>{
      try{if(!refresh()){render(false);return;}}catch{memory();}
      if(!active||model.attempt.id!==attemptId)return;
      const prior=model.attempt,wasComplete=prior.complete;
      if(!action())return;
      if(writable)try{savedRaw=JSON.stringify(model);localStorage.setItem(KEY,savedRaw);message='';}catch{memory();}
      const newPrompt=prior!==model.attempt;
      if(newPrompt){input='';report.open=false;}
      render(newPrompt);
      if(active){if(model.attempt.complete&&!wasComplete)next.focus();else if(newPrompt)check.focus();}
    };
    try {
      if(writable&&navigator.locks)try{await navigator.locks.request(KEY,run);}catch{memory();run();}
      else {if(writable)memory();run();}
    }finally{busy=false;panel.setAttribute('aria-busy','false');}
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
    change(()=>{const result=api.answer(model,q.id,value,ms);if(result&&!model.attempt.complete)input='';return result;});
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
    if(!model)return;const q=model.attempt,f=api.byId[q.factId],done=model.session.completed>=model.session.target;
    count.textContent=done?'Session complete':`Question ${Math.min(model.session.completed+(q.complete?0:1),model.session.target)} of ${model.session.target}`;
    equation.textContent=`${api.equation(f)} =`;display.textContent=q.complete?String(f.answer):input||'…';
    for(const b of keypad.querySelectorAll('button'))b.disabled=q.complete;
    check.disabled=q.complete;show.disabled=q.complete||q.helped;support.hidden=!q.helped;support.textContent=q.helped?api.help(f):'';
    feedback.textContent=q.complete?(q.helped?'You entered the shown answer.':q.misses?'You worked it out after another try.':'Correct.'):
      q.helped?'The answer is shown above. Enter it, then Check.':q.misses?'Try again, or choose Show me.':'Enter your answer, then Check.';
    next.hidden=!q.complete;next.textContent=done?'Practice again':'Next';
    recap.textContent=done?`Nice practice! ${model.session.completed} completed · ${model.session.firstTry} first try · ${model.session.helped} after another try or shown answer.`:'';
    storage.textContent=message;renderReport();
    if(startTiming){invalidate();const token=renderToken,id=q.id;requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(active&&token===renderToken&&model.attempt.id===id&&!q.complete&&!q.helped&&q.firstCorrect===null&&equationVisible()&&!report.open){origin=performance.now();timingInvalid=false;}
    }));}
  }
  window.addEventListener('blur',invalidate);document.addEventListener('visibilitychange',invalidate);
  window.addEventListener('scroll',()=>{if(active&&!equationVisible())invalidate();},{passive:true});
  document.addEventListener('keydown',event=>{
    if(!active||event.ctrlKey||event.metaKey||event.altKey||['SELECT','SUMMARY'].includes(event.target.tagName)||report.contains(event.target)||event.target===reset||event.target===next)return;
    if(event.key==='Enter'&&event.target.closest('button,a,input,textarea,[role="button"],[contenteditable="true"]')&&event.target!==check)return;
    if(/^\d$/.test(event.key)||['Backspace','Delete','Enter'].includes(event.key)){event.preventDefault();if(event.key==='Enter')submit();else type(event.key);}
  });
  window.PLACE_FACT_UI=Object.freeze({panel,
    activate(value){const first=model===null;active=value;panel.hidden=!value;invalidate();if(value){if(first)readInitial();render(first&&savedRaw===null);}},
    text(){const q=model.attempt,f=api.byId[q.factId];return {mode:'arithmetic',submode:'facts',question:`${api.equation(f)} = ?`,answerEntry:q.complete?String(f.answer):input,
      complete:q.complete,shown:q.helped,misses:q.misses,completed:model.session.completed,target:model.session.target,worked:q.helped?api.help(f):null};}
  });
  window.__factsTest=Object.freeze({storageKey:KEY,snapshot:()=>model&&JSON.parse(JSON.stringify(model)),timing:()=>({valid:!timingInvalid,started:origin!==null}),
    diagnostics:()=>model&&api.select(model).diagnostics});
})();
