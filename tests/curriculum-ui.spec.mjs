import {test,expect} from '@playwright/test';
async function confirm(page,value){await expect(page.locator('.curriculum-dialog')).toBeVisible();if(value!==undefined)await page.locator('#curriculum-page').fill(String(value));await page.locator('#curriculum-submit').click();if(await page.getByRole('button',{name:'Confirm page',exact:true}).isVisible())await page.getByRole('button',{name:'Confirm page',exact:true}).click();await expect(page.locator('.curriculum-dialog')).toHaveCount(0);}
test('page prompt shares exact-book progress; cancellation precedes Season and full-book chapters run',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/place-value-practice/');await expect(page.locator('#curriculum-page')).toHaveValue('113');
 await page.screenshot({path:test.info().outputPath('curriculum-start.png')});
 await page.locator('#curriculum-page').fill('188');await page.locator('#curriculum-submit').click();await expect(page.locator('#curriculum-error')).toContainText('0 to 187');
 await confirm(page,187);await page.getByRole('button',{name:'Arithmetic',exact:true}).click();await confirm(page);
 await page.getByRole('button',{name:'Whole book',exact:true}).click();await confirm(page);
 for(const chapter of [5,6,7,8,9,10]){
  await page.getByLabel('Book chapter').selectOption(String(chapter));await confirm(page);
  await expect(page.locator('#book-question')).not.toContainText('No completed');
  await page.screenshot({path:test.info().outputPath(`chapter-${chapter}.png`)});
  const q=await page.evaluate(()=>PLACE_BOOK.current(__bookTest.snapshot()));await page.locator('#book-practice .arithmetic-answer').filter({hasText:new RegExp(`^${q.answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).click();
  await expect(page.locator('#book-practice')).toContainText('Correct!');await page.locator('#book-practice').getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.curriculum-dialog')).toHaveCount(0);
 }
 await page.goto('/football/');await page.locator('#start-game-btn').click();await expect(page.locator('#curriculum-page')).toHaveValue('187');await page.locator('#curriculum-cancel').click();
 expect(await page.evaluate(()=>localStorage.getItem('footballMathSeason:v1'))).toBeNull();
 await page.locator('#start-game-btn').click();await confirm(page,113);await expect(page.locator('#call-grid')).toBeVisible();
 expect(errors).toEqual([]);
});
test('future progress stays byte-identical and session-only confirmation is explicit',async({page},info)=>{
 test.skip(info.project.name!=='ipad-11-landscape','Persistence once; layout is covered on all devices');
 const raw='{"schemaVersion":999,"keep":"exact bytes"}';
 await page.addInitScript(raw=>localStorage.setItem('math-curriculum:progress:v1',raw),raw);
 await page.goto('/place-value-practice/');await expect(page.locator('#curriculum-memory')).toBeVisible();await page.locator('#curriculum-memory').click();
 expect(await page.evaluate(()=>localStorage.getItem('math-curriculum:progress:v1'))).toBe(raw);
 expect(await page.evaluate(()=>CURRICULUM_UI.current().saved)).toBe(false);
});
test('cancel a queued progress save before any Season write or game initialization',async({page},info)=>{
 test.skip(info.project.name!=='ipad-11-landscape','Lock contract once');
 await page.goto('/football/');await page.getByRole('radio',{name:/3-Game Season/}).check();
 await page.evaluate(()=>{window.progressHeld=false;window.heldProgress=navigator.locks.request(CURRICULUM_UI.key,()=>new Promise(resolve=>{window.releaseProgress=resolve;window.progressHeld=true;}));});
 await expect.poll(()=>page.evaluate(()=>window.progressHeld)).toBe(true);
 await page.locator('#start-game-btn').click();await page.locator('#curriculum-submit').click();await page.locator('#curriculum-cancel').click();
 await page.evaluate(async()=>{window.releaseProgress();await window.heldProgress;});
 await expect.poll(()=>page.evaluate(()=>curriculumStartBusy)).toBe(false);
 expect(await page.evaluate(()=>({progress:localStorage.getItem(CURRICULUM_UI.key),season:localStorage.getItem('footballMathSeason:v1'),initialized:sessionInitialized}))).toEqual({progress:null,season:null,initialized:false});
});
test('lowering a restored arithmetic session preserves history and blocks future operands',async({page},info)=>{
 test.skip(info.project.name!=='ipad-11-landscape','Restoration once');
 await page.goto('/place-value-practice/');await confirm(page,187);
 const saved=await page.evaluate(()=>{PLACE_ARITHMETIC.configure(187);const s=PLACE_ARITHMETIC.repair(PLACE_ARITHMETIC.create(null));for(let i=0;i<4;i++){PLACE_ARITHMETIC.answer(s,PLACE_ARITHMETIC.view(s).answer);PLACE_ARITHMETIC.next(s);}localStorage.setItem('place-value-practice:arithmetic:v1',JSON.stringify(s));localStorage.setItem('place-value-practice:mode:v1','arithmetic');localStorage.setItem('place-value-practice:arithmetic-mode:v1','mixed-later');return {history:s.learning,sequence:s.sequence};});
 await page.reload();await confirm(page,113);await expect(page.locator('#arithmetic-practice')).toBeVisible();
 const restored=await page.evaluate(()=>({state:__arithmeticTest.snapshot(),required:MATH_CURRICULUM.arithmeticPage(__arithmeticTest.snapshot().question.family,__arithmeticTest.snapshot().question.operands)}));
 expect(restored.state.learning).toEqual(saved.history);expect(restored.state.sequence).toBe(saved.sequence);expect(restored.required).toBeLessThanOrEqual(113);
});
test('a fact-focus restart that lowers the page survives presentation changes and the prompt is centered',async({page},info)=>{
 test.skip(info.project.name!=='ipad-11-landscape','Lane ownership once');
 await page.goto('/football/');await page.locator('#start-game-btn').click();
 const dialog=await page.locator('.curriculum-dialog').boundingBox(),size=page.viewportSize();
 expect(Math.abs(dialog.x+dialog.width/2-size.width/2)).toBeLessThan(2);expect(Math.abs(dialog.y+dialog.height/2-size.height/2)).toBeLessThan(2);
 await page.locator('#curriculum-cancel').click();
 await page.goto('/place-value-practice/');await confirm(page,187);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();await confirm(page);
 await page.getByRole('button',{name:'Fact focus',exact:true}).click();await confirm(page);
 await page.getByRole('button',{name:'Start new fact session',exact:true}).click();await confirm(page,113);
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(113);
 await page.getByRole('button',{name:'Just arithmetic',exact:true}).click();
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(113);
 await page.getByRole('button',{name:'Mixed practice',exact:true}).click();await page.getByRole('button',{name:'Fact focus',exact:true}).click();
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(113);
 expect(await page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].source.page)).toBeLessThanOrEqual(113);
});
