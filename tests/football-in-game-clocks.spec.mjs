// #208: actual ordinary starts, calls and taps. Test hooks observe contracts only;
// no family injection, clock construction, Lab entry or drive seeding.
import { randomUUID } from 'node:crypto';
import { installConsent, readOutbox } from './learning-outbox-fixture.mjs';
import { test, expect } from './curriculum-fixture.mjs';
const CLOCKS = ['time-read-one-minute','game-finish-time','time-read-one-second','game-halfway-time'];
const contracts = page => page.evaluate(() => window.__footballTest.activeContracts());
const mode = page => page.evaluate(() => JSON.parse(render_game_to_text()).mode);

async function capture(page, testInfo, name) {
  const geometry = await page.evaluate(() => {
    const rect = element => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}; };
    const controls=[...document.querySelectorAll('#btn-row button:not(:disabled),#question-continue:not(.hidden),#call-grid .call-btn')]
      .filter(e=>e.getBoundingClientRect().height && !e.closest('[inert]')).map(e=>({id:e.id, ...rect(e)}));
    return {viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},dpr:devicePixelRatio,ua:navigator.userAgent,touch:navigator.maxTouchPoints,
      overflow:document.documentElement.scrollWidth>innerWidth, controls, field:rect(document.querySelector('#field-wrap')), visual:rect(document.querySelector('#math-overlay')),pictures:[...document.querySelectorAll('#math-overlay svg')].map(rect)};
  });
  expect(geometry.overflow).toBe(false);
  for(const control of geometry.controls){expect(control.width,`${name} ${control.id} width`).toBeGreaterThanOrEqual(44);expect(control.height,`${name} ${control.id} height`).toBeGreaterThanOrEqual(44);expect(control.right).toBeLessThanOrEqual(geometry.viewport.width+1);}
  if(!name.endsWith('-feedback')){
    expect(geometry.visual.width).toBeGreaterThan(0);
    expect(geometry.visual.y).toBeGreaterThanOrEqual(geometry.field.y-1);
    expect(geometry.visual.bottom).toBeLessThanOrEqual(geometry.field.bottom+1);
    for(const picture of geometry.pictures){expect(picture.y).toBeGreaterThanOrEqual(geometry.visual.y);expect(picture.bottom).toBeLessThanOrEqual(geometry.visual.bottom);}
  }
  await testInfo.attach(`${name}-geometry`, {body:JSON.stringify(geometry,null,2),contentType:'application/json'});
  await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true});
}

async function advance(page){
 const current=await mode(page);
 if(current==='call'){
  const call=page.locator('#call-grid .call-btn').first();
  await expect(call).toBeVisible();
  const bounds=await page.locator('#call-grid').boundingBox();
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(await page.evaluate(()=>innerHeight)+1);
  await call.tap();return;
 }
 const decision=page.locator('#decision-grid button:visible').first();
 if(await decision.count()){await decision.tap();return;}
 const overlay=page.locator('.overlay.show .ov-btn:visible').first();
 if(await overlay.count()){await overlay.tap();return;}
 await page.waitForTimeout(60);
}

for(const playMode of ['quick','season']) test(`#208 normal ${playMode} game automatically interleaves all four time skills and commits shared support`,async({page},testInfo)=>{
 test.skip(playMode==='season'&&testInfo.project.name!=='ipad-11-landscape','Season uses the same workspace; separate ordinary Season trace runs on the primary target.');
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const enrolled=playMode==='quick'&&testInfo.project.name==='ipad-11-landscape';
 if(enrolled)await page.route('**/shared/learning-reporting/config.js*',route=>route.fulfill({contentType:'text/javascript',body:"globalThis.LEARNING_REPORTING_CONFIG=Object.freeze({serviceUrl:''});"}));
 await page.goto('/football/');
 if(enrolled)await installConsent(page,{generation:randomUUID(),deviceId:randomUUID(),profileIds:[randomUUID()],activeProfileId:null});
 await page.evaluate(()=>{window.__clockTrace=[];window.addEventListener('football:result',e=>window.__clockTrace.push(e.detail));});
 if(playMode==='season') await page.locator('input[name="play-mode"][value="season"]').tap();
 await page.locator('#start-game-btn').tap();
 await expect.poll(()=>mode(page)).toBe('call');
 let ordinal=0;const observed=[];const sides=new Set();let last=null;
 for(let steps=0;steps<850;steps++){
  const current=await mode(page);
  if(steps%100===0)console.log('ordinary game progress',playMode,steps,current,ordinal);
  if(current==='game-over'||current==='final'){break;}
  if(current!=='question'){await advance(page);continue;}
  const before=await contracts(page),q=before.questionInstance,play=before.activePlay;
  if(q.questionInstanceId===last){await page.waitForTimeout(50);continue;}
  last=q.questionInstanceId;
  const isScrimmage=play.playType==='scrimmage';
  if(isScrimmage){ordinal++;const expected=ordinal>=2&&(ordinal-2)%3===0?CLOCKS[Math.floor((ordinal-2)/3)%4]:null;
   if(expected)expect(q.familyId).toBe(expected);else expect(CLOCKS).not.toContain(q.familyId);
  }
  const time=CLOCKS.includes(q.familyId);
  if(time){
   observed.push({ordinal,familyId:q.familyId,side:play.context.possession,playId:play.playId});sides.add(play.context.possession);
   expect(q.curriculumSource).toBe('user-requested-time');expect(q.grading).toBe('gate');expect(q.introducedOnPage).toBeNull();
   await expect(page.locator('#ov-time-lab')).not.toBeVisible();
   await expect(page.locator('#math-overlay [data-time]')).toHaveCount(0);
   if(!q.familyId.startsWith('time-read'))expect(q.visuals.guided.result).toBeNull();
   await capture(page,testInfo,`${ordinal}-${q.familyId}-initial`);
   const wrong=q.choices.findIndex(c=>c.id!==q.correctChoiceId);
   await page.locator(`#b${wrong}`).tap();
   await expect.poll(async()=>(await contracts(page)).questionUi.attempt).toBe(2);
   expect((await contracts(page)).questionInstance).toEqual(q);
   await capture(page,testInfo,`${ordinal}-${q.familyId}-retry`);
   const retry=await contracts(page);const nextWrong=q.choices.findIndex(c=>c.id!==q.correctChoiceId&&!retry.questionUi.missedChoiceIds.includes(c.id));
   await page.locator(`#b${nextWrong}`).tap();
   await expect.poll(()=>mode(page)).toBe('explanation');
   await capture(page,testInfo,`${ordinal}-${q.familyId}-worked`);
   const countBefore=(await contracts(page)).statsSession.completedPlays.length;
   await page.locator('#question-learn-why').tap();
   await page.screenshot({path:testInfo.outputPath(`${ordinal}-${q.familyId}-replay.png`),fullPage:true});
   await page.locator('#question-continue').tap();
   await expect.poll(async()=>(await contracts(page)).statsSession.completedPlays.length).toBe(countBefore+1);
   const after=await contracts(page);const row=after.statsSession.completedPlays.find(r=>r.playId===play.playId);
   expect(row.links.familyId).toBe(q.familyId);expect(row.question.evidenceClass).toBe(q.evidenceClass);
   expect(row.question.concept).toBe(q.concept);
   const copies=after.statsSession.completedPlays.filter(r=>r.playId===play.playId);expect(copies).toHaveLength(1);
   await capture(page,testInfo,`${ordinal}-${q.familyId}-feedback`);
  }else{
   const index=q.choices.findIndex(c=>c.id===q.correctChoiceId);await page.locator(`#b${index}`).tap();
  }
  if(ordinal>=23 && sides.size===2)break;
 }
 expect(ordinal).toBeGreaterThanOrEqual(11);expect(observed.slice(0,4).map(o=>o.familyId)).toEqual(CLOCKS);
 expect([...sides].sort()).toEqual(['defense','offense']);expect(errors).toEqual([]);
 if(enrolled){
  await page.evaluate(()=>LEARNING_OUTBOX.idle());
  const events=(await readOutbox(page)).envelope.events;
  for(const id of CLOCKS){const resolved=events.filter(e=>e.familyId===id&&e.kind==='resolution');expect(resolved).toHaveLength(observed.filter(o=>o.familyId===id).length);for(const e of resolved){expect(e.concept).toBe(id);expect(e.evidenceClass).toBe(id.startsWith('time-read')?'literacy':'independent');expect(e.grading).toBe('gate');}}
  expect(events.some(e=>Object.keys(e).some(k=>/fixture|prompt|answer|private|opponent/i.test(k)))).toBe(false);
  await testInfo.attach('sanitized-clock-outbox',{body:JSON.stringify(events,null,2),contentType:'application/json'});
 }
 await testInfo.attach('ordinary-game-trace',{body:JSON.stringify({playMode,ordinal,observed,resultEvents:await page.evaluate(()=>window.__clockTrace),text:await page.evaluate(()=>render_game_to_text())},null,2),contentType:'application/json'});
});

test('#208 live validator rejects fixture laundering, metadata, every visual and copy mutation',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','Trust boundary runs once on the primary target.');
 await page.goto('/football/');await page.locator('#start-game-btn').tap();
 await expect(page.locator('#call-grid .call-btn').first()).toBeVisible();await page.locator('#call-grid .call-btn').first().tap();
 const verdicts=await page.evaluate(ids=>{
  const play=state.activePlay;
  const prepare=id=>FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({...FOOTBALL_CONTEXTUAL_QUESTIONS.build(play,id,{support:'guided'}),contextId:play.contextId,questionInstanceId:'boundary-question'}));
  const verdict=(q,p=play)=>{try{validateQuestionInstance(p,q);return 'accepted';}catch(e){return e.code;}};
  const results=[];
  for(const id of ids){const good=prepare(id);results.push({id,case:'good',verdict:verdict(good)});
   const edits={
    fixture:q=>q.timeFixture.facts.clock?q.timeFixture.facts.clock.minute=99:q.timeFixture.facts.durationMinutes=120,
    identity:q=>q.timeFixture.identity.playId='another-play',family:q=>q.timeFixture.familyId='calendar-find-date-day',
    metadata:q=>q.concept='line-to-gain',source:q=>q.curriculumSource='workbook',page:q=>q.introducedOnPage=164,
    operation:q=>q.operation.type='read',answer:q=>q.answer.value='wrong',choice:q=>q.choices[0].label='wrong',
    extraChoice:q=>q.choices.push({...q.choices[0],id:'duplicate'}),binding:q=>q.bindings[0].source.path='/context/privateOpponentSnapshot',
    prompt:q=>q.prompt.text='The actual game lasts four hours.',hint:q=>q.hint.text='wrong',review:q=>q.workedReview.goal.text='wrong',
    challenge:q=>q.challengeFixture={},private:q=>q.timeFixture.privateOpponentSnapshot={},math:q=>q.math.data.private='bad',
    initial:q=>q.visuals.initial.data.private='bad',guided:q=>q.visuals.guided.data.private='bad',worked:q=>q.visuals.worked.data.private='bad',
   };
   for(const [name,edit]of Object.entries(edits)){const q=FOOTBALL_DOMAIN.clone(good);edit(q);results.push({id,case:name,verdict:verdict(FOOTBALL_DOMAIN.deepFreeze(q))});}
   results.push({id,case:'mutable',verdict:verdict(FOOTBALL_DOMAIN.clone(good))});
   results.push({id,case:'special-play',verdict:verdict(good,{...play,playType:'punt'})});
  }
  const ordinary=FOOTBALL_DOMAIN.clone(prepare(ids[0]));ordinary.familyId='yards-to-go-read';ordinary.id=ordinary.familyId;results.push({id:'ordinary',case:'launder',verdict:verdict(FOOTBALL_DOMAIN.deepFreeze(ordinary))});
  return results;
 },CLOCKS);
 for(const result of verdicts)expect(result.verdict,`${result.id} ${result.case}`).toBe(result.case==='good'?'accepted':'malformed-question');
 await testInfo.attach('trust-boundary',{body:JSON.stringify(verdicts,null,2),contentType:'application/json'});
});

test('#208 bypass retains a due clock slot and retries/renders/stale Continue draw and commit nothing extra',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','Cadence recovery runs once on the primary target.');
 await page.goto('/football/');await page.locator('#start-game-btn').tap();
 await expect(page.locator('#call-grid .call-btn').first()).toBeVisible();await page.locator('#call-grid .call-btn').first().tap();
 let c=await contracts(page);await page.locator(`#b${c.questionInstance.choices.findIndex(v=>v.id===c.questionInstance.correctChoiceId)}`).tap();
 await expect.poll(()=>mode(page)).toBe('call');
 await page.evaluate(()=>window.__footballTest.setQuestionFault('build-throw'));await page.locator('#call-grid .call-btn').first().tap();
 await expect.poll(()=>mode(page)).toBe('feedback');
 expect(await page.evaluate(()=>state.instructedScrimmages)).toBe(1);
 await page.evaluate(()=>window.__footballTest.setQuestionFault(null));await expect.poll(()=>mode(page)).toBe('call');
 await page.locator('#call-grid .call-btn').first().tap();c=await contracts(page);expect(c.questionInstance.familyId).toBe(CLOCKS[0]);
 const before=await page.evaluate(()=>{const counts=window.__clockRngCounts={football:0,scheduler:0,presentation:0};for(const [name,old] of [['football',footballRng],['scheduler',schedulerRng],['presentation',presentationRng]]){const wrapped=()=>{counts[name]++;return old();};if(name==='football')footballRng=wrapped;else if(name==='scheduler')schedulerRng=wrapped;else presentationRng=wrapped;}return{count:state.instructedScrimmages,rows:statsSession.completedPlays.length};});
 const wrong=c.questionInstance.choices.findIndex(v=>v.id!==c.questionInstance.correctChoiceId);await page.locator(`#b${wrong}`).tap();
 await page.evaluate(()=>{renderMathVisual();continueAfterExplanation();});
 expect(await page.evaluate(()=>({count:state.instructedScrimmages,rows:statsSession.completedPlays.length}))).toEqual(before);
 const current=await contracts(page);const correct=c.questionInstance.choices.findIndex(v=>v.id===c.questionInstance.correctChoiceId);await page.locator(`#b${correct}`).tap();
 const settled=await page.evaluate(()=>({count:state.instructedScrimmages,rows:statsSession.completedPlays.length,rng:window.__clockRngCounts}));
 expect(settled.count).toBe(2);expect(settled.rows).toBe(before.rows+1);expect(settled.rng).toEqual({football:0,scheduler:0,presentation:0});
 await page.evaluate(()=>{continueAfterExplanation();commitPendingResolution();});expect(await page.evaluate(()=>state.instructedScrimmages)).toBe(2);
 expect((await contracts(page)).questionInstance).toEqual(c.questionInstance);expect(current.questionInstance).toEqual(c.questionInstance);
});

for(const playMode of ['quick','season'])test(`#208 complete ordinary ${playMode} game reaches all requested clock skills`,async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','Complete production game runs on the primary target; all layouts have the ordinary cadence/support trace.');
 test.setTimeout(180000);
 // Only timer passage is accelerated. All starts, calls, answers, decisions and
 // transitions still use production controls and production callbacks.
 await page.clock.install();
 await page.goto('/football/');
 await page.evaluate(()=>{window.__fullClockTrace=[];window.addEventListener('football:result',e=>window.__fullClockTrace.push(e.detail));});
 if(playMode==='season')await page.locator('input[name="play-mode"][value="season"]').tap();
 await page.locator('#start-game-btn').tap();
 await expect.poll(()=>mode(page)).toBe('call');
 const seen=[];let last=null;
 for(let step=0;step<600;step++){
  const m=await mode(page);if(m==='final')break;
  if(m==='question'){
   const c=await contracts(page),q=c.questionInstance;
   if(last===q.questionInstanceId){await page.clock.fastForward(2000);continue;}
   last=q.questionInstanceId;
   if(CLOCKS.includes(q.familyId)){
    seen.push({familyId:q.familyId,side:c.activePlay.context.possession,playId:c.activePlay.playId});
    if(seen.length%2===0){const wrong=q.choices.findIndex(v=>v.id!==q.correctChoiceId);await page.locator(`#b${wrong}`).tap();expect((await contracts(page)).questionInstance).toEqual(q);}
   }
   await page.locator(`#b${q.choices.findIndex(v=>v.id===q.correctChoiceId)}`).tap();
   await page.clock.fastForward(2000);
  }else if(m==='call'){
   await page.locator('#call-grid .call-btn').last().tap();
  }else{
   const decision=page.locator('#decision-grid button:visible').first(),overlay=page.locator('.overlay.show .ov-btn:visible').first();
   if(await decision.count())await decision.tap();else if(await overlay.count())await overlay.tap();else await page.clock.fastForward(2000);
  }
 }
 expect(await mode(page)).toBe('final');expect(new Set(seen.map(v=>v.familyId))).toEqual(new Set(CLOCKS));
 expect(new Set(seen.map(v=>v.side))).toEqual(new Set(['offense','defense']));
 const c=await contracts(page),rows=c.statsSession.completedPlays;
 const linked=rows.filter(r=>CLOCKS.includes(r.links?.familyId));expect(linked).toHaveLength(seen.length);
 for(const row of linked){expect(row.question.concept).toBe(row.links.familyId);expect(['firstTryCorrect','retryCorrect']).toContain(row.resolution);}
 await testInfo.attach('complete-ordinary-game',{body:JSON.stringify({playMode,timerPassage:'Playwright fastForward; production callbacks and actual taps',seen,results:await page.evaluate(()=>window.__fullClockTrace),state:c.render},null,2),contentType:'application/json'});
});
