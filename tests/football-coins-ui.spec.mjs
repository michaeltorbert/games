import {test,expect} from '@playwright/test';
import {muteFootballForTests,expectFootballTestMuted} from './football-test-mute.mjs';
const clocks=['time-read-one-minute','game-finish-time','time-read-one-second','game-halfway-time'];
const contracts=page=>page.evaluate(()=>window.__footballTest.activeContracts());
const mode=page=>page.evaluate(()=>JSON.parse(render_game_to_text()).mode);
test.beforeEach(async({context})=>{await muteFootballForTests(context);});
async function start(page,playMode='quick',completedPage=181){
 await page.goto('/football/');await expectFootballTestMuted(page);
 if(playMode==='season')await page.locator('input[name="play-mode"][value="season"]').tap();
 await page.locator('#start-game-btn').tap();
 await expect(page.locator('#curriculum-page')).toBeVisible();await page.locator('#curriculum-page').fill(String(completedPage));await page.locator('#curriculum-submit').tap();
 if(await page.locator('#curriculum-submit').isVisible())await page.locator('#curriculum-submit').tap();
 await expect.poll(()=>mode(page)).toBe('call');
}
async function geometry(page,testInfo,name){
 const proof=await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
  return{viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},dpr:devicePixelRatio,ua:navigator.userAgent,touch:navigator.maxTouchPoints,
   scroll:{horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight},
   field:rect(document.querySelector('#field-wrap')),visual:rect(document.querySelector('#math-overlay')),
   coins:[...document.querySelectorAll('#math-overlay .shop-coin')].map(e=>({value:e.textContent,...rect(e)})),
   controls:[...document.querySelectorAll('#btn-row button:not(.hidden),#question-continue:not(.hidden)')].filter(e=>e.getBoundingClientRect().height).map(rect)};
 });
 expect(proof.scroll.horizontal).toBe(false);expect(proof.scroll.vertical).toBe(false);
 expect(proof.visual.y).toBeGreaterThanOrEqual(proof.field.y-1);expect(proof.visual.bottom).toBeLessThanOrEqual(proof.field.bottom+1);
 for(const r of proof.controls){expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.right).toBeLessThanOrEqual(proof.viewport.width+1);expect(r.bottom).toBeLessThanOrEqual(proof.viewport.height+1);}
 for(const r of proof.coins){expect(r.y).toBeGreaterThanOrEqual(proof.visual.y);expect(r.bottom).toBeLessThanOrEqual(proof.visual.bottom);}
 await testInfo.attach(`${name}-geometry`,{body:JSON.stringify(proof,null,2),contentType:'application/json'});
 await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true});
}
for(const playMode of ['quick','season'])test(`#215 normal ${playMode} game interleaves coins and clocks on both sides through final`,async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','Full normal game evidence runs on primary target; all six layouts have exhaustive coin support states.');
 test.setTimeout(180000);await page.clock.install();await start(page,playMode);
 const seen=[];let last=null,ordinal=0;
 for(let step=0;step<850;step++){
  const m=await mode(page);if(m==='final')break;
  if(m==='question'){
   const c=await contracts(page),q=c.questionInstance,p=c.activePlay;
   if(last===q.questionInstanceId){await page.clock.fastForward(2000);continue;}last=q.questionInstanceId;
   if(p.playType==='scrimmage'){
    ordinal++;const clockDue=ordinal>=2&&(ordinal-2)%3===0,coinDue=ordinal>=3&&(ordinal-3)%6===0;
    if(clockDue)expect(q.familyId).toBe(clocks[Math.floor((ordinal-2)/3)%4]);
    else if(coinDue)expect(q.coinFixture).toBeTruthy();else{expect(q.coinFixture).toBeUndefined();expect(clocks).not.toContain(q.familyId);}
   }else expect(q.coinFixture).toBeUndefined();
   if(q.coinFixture){
    seen.push({ordinal,familyId:q.familyId,side:p.context.possession,playId:p.playId});
    expect(q.introducedOnPage).toBeLessThanOrEqual(181);await expect(page.locator('#desk-chip')).toHaveText('Coin practice');
    const countBefore=c.statsSession.completedPlays.length;
    const wrong=q.choices.findIndex(v=>v.id!==q.correctChoiceId);await page.locator(`#b${wrong}`).tap();expect((await contracts(page)).questionInstance).toEqual(q);
    if(seen.length===1){
     const retry=await contracts(page);const nextWrong=q.choices.findIndex(v=>v.id!==q.correctChoiceId&&!retry.questionUi.missedChoiceIds.includes(v.id));await page.locator(`#b${nextWrong}`).tap();
     await expect.poll(()=>mode(page)).toBe('explanation');await page.locator('#question-learn-why').tap();await page.locator('#question-continue').tap();
    }else await page.locator(`#b${q.choices.findIndex(v=>v.id===q.correctChoiceId)}`).tap();
    const after=await contracts(page);expect(after.statsSession.completedPlays.length).toBe(countBefore+1);
    expect(after.statsSession.completedPlays.filter(v=>v.playId===p.playId)).toHaveLength(1);
    expect(after.statsSession.completedPlays.find(v=>v.playId===p.playId).question.evidenceClass).toBe(q.evidenceClass);
   }else await page.locator(`#b${q.choices.findIndex(v=>v.id===q.correctChoiceId)}`).tap();
   await page.clock.fastForward(2000);
  }else if(m==='call')await page.locator('#call-grid .call-btn').last().tap();
  else {const decision=page.locator('#decision-grid button:visible').first(),overlay=page.locator('.overlay.show .ov-btn:visible').first();if(await decision.count())await decision.tap();else if(await overlay.count())await overlay.tap();else await page.clock.fastForward(2000);}
 }
 expect(await mode(page)).toBe('final');expect(new Set(seen.map(v=>v.side))).toEqual(new Set(['offense','defense']));
 if(playMode==='season'){
  await expect.poll(()=>page.evaluate(()=>FOOTBALL_SEASON.snapshot().gamesPlayed)).toBe(1);
  const settled=await page.evaluate(()=>({snapshot:FOOTBALL_SEASON.snapshot(),bytes:localStorage.getItem('footballMathSeason:v1')}));
  await page.evaluate(()=>{showGameOver();showGameOver();commitPendingResolution();continueAfterExplanation();});
  const repeated=await page.evaluate(()=>({snapshot:FOOTBALL_SEASON.snapshot(),bytes:localStorage.getItem('footballMathSeason:v1')}));
  expect(repeated).toEqual(settled);expect(repeated.snapshot.gameNumber).toBe(2);
 }
 await testInfo.attach('normal-game-coin-trace',{body:JSON.stringify({playMode,ordinal,seen,season:await page.evaluate(()=>FOOTBALL_SEASON.snapshot())},null,2),contentType:'application/json'});
});
test('#215 every production coin family renders initial retry and worked states with exact contract and geometry',async({page},testInfo)=>{
 test.setTimeout(180000);await start(page);await page.locator('#call-grid .call-btn').first().tap();
 const ids=await page.evaluate(()=>FOOTBALL_CONTEXTUAL_QUESTIONS.IN_GAME_COIN_FAMILIES);
 for(const id of ids){
  await page.evaluate(id=>{
   const p=state.activePlay;
   const q=FOOTBALL_DOMAIN.deepFreeze(FOOTBALL_DOMAIN.clone({...FOOTBALL_CONTEXTUAL_QUESTIONS.build(p,id,{profile:contextualQuestionProfile()}),contextId:p.contextId,questionInstanceId:`coins-layout-${id}`}));
   validateQuestionInstance(p,q);prepareQuestion({activePlay:p,question:q},'Coin practice');
  },id);
  await expect(page.locator('#math-overlay')).toHaveAttribute('data-type','coin-wallet');
  await geometry(page,testInfo,`${id}-initial`);
  let c=await contracts(page),q=c.questionInstance;
  const wrong=q.choices.findIndex(v=>v.id!==q.correctChoiceId);await page.locator(`#b${wrong}`).tap();
  expect((await contracts(page)).questionInstance).toEqual(q);await geometry(page,testInfo,`${id}-guided`);
  c=await contracts(page);const next=q.choices.findIndex(v=>v.id!==q.correctChoiceId&&!c.questionUi.missedChoiceIds.includes(v.id));await page.locator(`#b${next}`).tap();
  await expect.poll(()=>mode(page)).toBe('explanation');await geometry(page,testInfo,`${id}-worked`);
 }
});
test('#215 no coin completion keeps ordinary instruction in the due slot',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','Fallback uses common scheduler and is tested once.');
 await page.clock.install();await start(page,'quick',169);
 for(let ordinal=1;ordinal<=3;ordinal++){
  await page.locator('#call-grid .call-btn').first().tap();const q=(await contracts(page)).questionInstance;
  expect(q.coinFixture).toBeUndefined();if(ordinal===2)expect(q.familyId).toBe(clocks[0]);
  await page.locator(`#b${q.choices.findIndex(v=>v.id===q.correctChoiceId)}`).tap();await page.clock.fastForward(2000);
 }
 expect(await page.evaluate(()=>state.instructedScrimmages)).toBe(3);
});
test('#215 isolated working demo covers all families and help without storage writes',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','The preview has the same production coin renderer; production layout is checked on every target.');
 await page.goto('/football/coins-demo.html');
 const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
 const ids=await page.locator('#demo-family option').evaluateAll(options=>options.map(o=>o.value));expect(ids).toHaveLength(26);
 for(const id of ids){await page.locator('#demo-family').selectOption(id);await expect(page.locator('#demo-stage')).toHaveText('First try');await page.locator('#demo-help').tap();await expect(page.locator('#demo-stage')).toHaveText('Try again with help');await page.locator('#demo-worked').tap();await expect(page.locator('#demo-stage')).toHaveText('Worked answer');await page.locator('#demo-again').tap();await expect(page.locator('#demo-stage')).toHaveText('First try');}
 expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).toBe(before);
});


test('#215 coin bypass retains its slot; retry renders repeated taps and stale Continue preserve streams and once-only commits',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='ipad-11-landscape','Focused shared-contract invariants run on the primary target; ordinary games are proved separately.');
 await page.clock.install();await start(page);
 // Real startup and two accepted ordinary scrimmages reach the due third slot.
 for(let ordinal=1;ordinal<=2;ordinal++){
  await page.locator('#call-grid .call-btn').first().tap();const q=(await contracts(page)).questionInstance;
  await page.locator(`#b${q.choices.findIndex(c=>c.id===q.correctChoiceId)}`).tap();await page.clock.fastForward(2000);
 }
 await page.evaluate(()=>window.__footballTest.setQuestionFault('build-throw'));
 await page.locator('#call-grid .call-btn').first().tap();await expect.poll(()=>mode(page)).toBe('feedback');
 expect(await page.evaluate(()=>state.instructedScrimmages)).toBe(2);
 await page.evaluate(()=>window.__footballTest.setQuestionFault(null));await page.clock.fastForward(2000);
 await page.locator('#call-grid .call-btn').first().tap();
 const original=await contracts(page),q=original.questionInstance,p=original.activePlay;expect(q.coinFixture).toBeTruthy();
 const before=await page.evaluate(()=>{
  window.__coinRngCounts={football:0,scheduler:0,presentation:0};
  for(const [name,old]of [['football',footballRng],['scheduler',schedulerRng],['presentation',presentationRng]]){
   const wrapped=()=>{window.__coinRngCounts[name]++;return old();};
   if(name==='football')footballRng=wrapped;else if(name==='scheduler')schedulerRng=wrapped;else presentationRng=wrapped;
  }
  return{counter:state.instructedScrimmages,rows:statsSession.completedPlays.length,resolved:learningSession.resolved,graded:state.gradedQuestions};
 });
 const wrong=q.choices.findIndex(c=>c.id!==q.correctChoiceId);await page.locator(`#b${wrong}`).tap();
 await page.evaluate(wrong=>{handleAnswer(wrong);renderMathVisual();renderMathVisual();continueAfterExplanation();},wrong);
 expect((await contracts(page)).questionInstance).toEqual(q);expect((await contracts(page)).questionUi.attempt).toBe(2);
 expect(await page.evaluate(()=>window.__coinRngCounts)).toEqual({football:0,scheduler:0,presentation:0});
 const retry=await contracts(page),nextWrong=q.choices.findIndex(c=>c.id!==q.correctChoiceId&&!retry.questionUi.missedChoiceIds.includes(c.id));await page.locator(`#b${nextWrong}`).tap();
 await expect.poll(()=>mode(page)).toBe('explanation');await page.locator('#question-learn-why').tap();
 expect((await contracts(page)).questionInstance).toEqual(q);
 expect(await page.evaluate(()=>({counter:state.instructedScrimmages,rows:statsSession.completedPlays.length,resolved:learningSession.resolved,graded:state.gradedQuestions}))).toEqual(before);
 expect(await page.evaluate(()=>window.__coinRngCounts)).toEqual({football:0,scheduler:0,presentation:0});
 await page.locator('#question-continue').tap();
 const committed=await page.evaluate(()=>({counter:state.instructedScrimmages,rows:statsSession.completedPlays.length,resolved:learningSession.resolved,graded:state.gradedQuestions,rng:{...window.__coinRngCounts}}));
 expect(committed.counter).toBe(before.counter+1);expect(committed.rows).toBe(before.rows+1);expect(committed.resolved).toBe(before.resolved+1);expect(committed.graded).toBe(before.graded+1);
 expect(committed.rng.football).toBe(0);expect(committed.rng.scheduler).toBe(0);
 await page.evaluate(()=>{continueAfterExplanation();continueAfterExplanation();commitPendingResolution();});
 expect(await page.evaluate(()=>({counter:state.instructedScrimmages,rows:statsSession.completedPlays.length,resolved:learningSession.resolved,graded:state.gradedQuestions,rng:{...window.__coinRngCounts}}))).toEqual(committed);
 const final=await contracts(page);expect(final.activePlay).toEqual(p);expect(final.questionInstance).toEqual(q);expect(final.statsSession.completedPlays.filter(row=>row.playId===p.playId)).toHaveLength(1);
 await testInfo.attach('coin-contract-invariants',{body:JSON.stringify({before,committed,familyId:q.familyId,playId:p.playId},null,2),contentType:'application/json'});
});
