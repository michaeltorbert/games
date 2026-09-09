import { test, expect } from '@playwright/test';
const KEY='place-value-practice:progress:v1', AKEY='place-value-practice:arithmetic:v1';
async function settled(page){await expect(page.locator('#arithmetic-practice')).toHaveAttribute('aria-busy','false');}
async function raw(page,key=KEY){await settled(page);return page.evaluate(k=>localStorage.getItem(k),key);}
async function snapshot(page){await settled(page);return page.evaluate(()=>__arithmeticTest.snapshot());}
async function correct(page){await settled(page);const answer=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()).answer);await page.locator('#arithmetic-practice .arithmetic-answer').filter({hasText:new RegExp(`^${answer}$`)}).click();await settled(page);}

test('arithmetic preserves place-value bytes through retry, reload, duplicate completion, Next, keyboard, and mode switches',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/place-value-practice/');
 // Seed actual outstanding review/gate state using the existing normalization seam.
 await page.evaluate(()=>{
   const s=__placeValueTest.snapshot();s.aggregate.attempted=12;
   s.transferEvidence.zeroTens={blocksToNumber:[305],unlocked:false};
   s.gateOpportunities.zeroTens={status:'pending',evidenceValue:305,armedAt:1,dueAt:3};
   s.reviewQueues.exact=[{id:'exact-arithmetic-isolation',value:105,stage:2,format:'blocks-to-number',layout:'fixed',dueAt:0,postponements:0}];
   const normalized=__placeValueTest.setState(s);
   localStorage.setItem('place-value-practice:progress:v1',JSON.stringify(normalized));
 });
 const before=await raw(page);
 expect(JSON.parse(before).reviewQueues.exact).toHaveLength(1);
 expect(JSON.parse(before).gateOpportunities.zeroTens.status).toBe('pending');
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const q=(await snapshot(page)).question;
 const answer=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()).answer);
 const wrong=q.choices.find(x=>x!==answer);
 await page.getByRole('button',{name:String(wrong),exact:true}).click();
 const missed=await snapshot(page);
 await page.reload();
 expect(await snapshot(page)).toEqual(missed);
 await expect(page.getByRole('button',{name:String(wrong),exact:true})).toBeDisabled();
 await page.keyboard.press('Enter');
 expect(await raw(page)).toBe(before);
 await correct(page);
 const completed=await snapshot(page);
 expect(completed.completed).toBe(1);expect(completed.afterHelp).toBe(1);
 await page.reload();expect(await snapshot(page)).toEqual(completed);
 // Disabled answer cannot complete a second time, even via a DOM click.
 await page.evaluate(()=>document.querySelector('.arithmetic-answer').click());
 expect((await snapshot(page)).completed).toBe(1);
 await page.locator('#arithmetic-next').click();
 expect((await snapshot(page)).sequence).toBe(1);
 const current=await snapshot(page);
 expect(await raw(page)).toBe(before);
 await page.getByRole('button',{name:'Place value',exact:true}).click();
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 expect(await snapshot(page)).toEqual(current);
 expect(await raw(page)).toBe(before);
 expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('arithmetic.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('all curriculum families appear in normal sessions; finite recap and endless restart use only arithmetic progress',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await page.getByLabel('Arithmetic session length').selectOption('20');
 await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 const seen=new Set();
 for(let i=0;i<20;i++){seen.add((await snapshot(page)).question.family);await correct(page);if(i<19)await page.locator('#arithmetic-next').click();}
 expect(seen.size).toBe(10);
 await expect(page.locator('#arithmetic-recap')).toContainText('20 completed · 20 first try');
 await page.getByLabel('Arithmetic session length').selectOption('endless');
 await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 expect((await snapshot(page)).target).toBeNull();expect((await snapshot(page)).completed).toBe(0);
 expect(await raw(page)).toBe(before);
});

test('every outcome persists once and Arithmetic boot leaves absent, malformed and future place-value saves untouched',async({page})=>{
 for(const placeSave of [null,'malformed','{"schemaVersion":999,"keep":"exact bytes"}']) {
   await page.goto('/place-value-practice/');
   await page.evaluate(({KEY,AKEY,placeSave})=>{
     if(placeSave===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,placeSave);
     localStorage.removeItem(AKEY);localStorage.setItem('place-value-practice:mode:v1','arithmetic');
   },{KEY,AKEY,placeSave});
   await page.reload();
   for(let misses=0;misses<4;misses++) {
     const current=await snapshot(page),answer=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()).answer);
     for(const wrong of current.question.choices.filter(n=>n!==answer).slice(0,misses))await page.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${wrong}$`)}).click();
     expect((await snapshot(page)).learning.serial).toBe(misses);
     await page.reload();await correct(page);
     const completed=await snapshot(page);
     expect(completed.learning.history[current.question.family].at(-1)).toEqual({serial:misses+1,outcome:['firstTry','retryCorrect1','retryCorrect2','revealed'][misses],misses});
     await page.reload();expect(await snapshot(page)).toEqual(completed);
     await page.evaluate(()=>document.querySelector('.arithmetic-answer').click());
     expect(await snapshot(page)).toEqual(completed);expect(await raw(page)).toBe(placeSave);
     await page.locator('#arithmetic-next').click();
   }
 }
});

test('future schema introduced after boot remains byte-identical through completion and Start',async({page})=>{
 await page.goto('/place-value-practice/');await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const future=' { "schemaVersion": 99, "untouched": true } ';
 await page.evaluate(({AKEY,future})=>localStorage.setItem(AKEY,future),{AKEY,future});
 await correct(page);await page.locator('#arithmetic-next').click();
 await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 expect(await raw(page,AKEY)).toBe(future);
 await expect(page.locator('.arithmetic-storage')).toContainText('newer version');
});

test('stale tab cannot duplicate an observation or overwrite a newer question with Start',async({page,context})=>{
 await page.goto('/place-value-practice/');await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const other=await context.newPage();await other.goto('/place-value-practice/');
 await correct(page);const completed=await raw(page,AKEY);
 await correct(other);expect(await raw(other,AKEY)).toBe(completed);
 expect((await snapshot(other)).learning.serial).toBe(1);
 await page.locator('#arithmetic-next').click();const next=await raw(page,AKEY);
 await other.getByRole('button',{name:'Start new arithmetic session'}).click();
 expect(await raw(other,AKEY)).toBe(next);expect(await snapshot(other)).toEqual(await snapshot(page));
 await other.close();
});

test('write failure keeps observations in memory without changing either saved progress key',async({page})=>{
 await page.goto('/place-value-practice/');await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const before=await raw(page), arithmeticBefore=await raw(page,AKEY);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('quota');};});
 await correct(page);expect((await snapshot(page)).learning.serial).toBe(1);
 await page.locator('#arithmetic-next').click();await correct(page);
 expect((await snapshot(page)).learning.serial).toBe(2);
 expect(await raw(page,AKEY)).toBe(arithmeticBefore);expect(await raw(page)).toBe(before);
 await expect(page.locator('.arithmetic-storage')).toContainText('memory');
});

test('future arithmetic schema stays byte-identical and storage failure permits in-memory practice',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 const future='{"schemaVersion":23,"preserve":"future bytes"}';
 await page.evaluate(({future,AKEY})=>{localStorage.setItem(AKEY,future);localStorage.setItem('place-value-practice:mode:v1','arithmetic');},{future,AKEY});
 await page.reload();await correct(page);await page.locator('#arithmetic-next').click();
 expect(await raw(page,AKEY)).toBe(future);expect(await raw(page)).toBe(before);
 await expect(page.locator('.arithmetic-storage')).toContainText('newer version');
 await page.getByLabel('Arithmetic session length').selectOption('5');
 await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 for(let i=0;i<5;i++){await correct(page);if(i<4)await page.locator('#arithmetic-next').click();}
 await page.locator('#arithmetic-next').click();
 expect(await raw(page,AKEY)).toBe(future);expect(await raw(page)).toBe(before);
 await page.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('unavailable');};Storage.prototype.setItem=function(){throw Error('unavailable');};});
 await page.reload();await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await correct(page);expect((await snapshot(page)).completed).toBe(1);
 await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 expect((await snapshot(page)).learning.position).toBe(1);
 await correct(page);expect((await snapshot(page)).completed).toBe(1);
 await expect(page.locator('.arithmetic-storage')).toContainText('memory');
});

test('legacy embedded place-value self-tests remain intact',async({page},info)=>{
 test.skip(info.project.name!=='ipad-11-landscape','One run of the unchanged embedded suite');
 await page.goto('/place-value-practice/');
 const result=await page.evaluate(()=>runSelfTests());
 expect(result.failed).toBe(0);expect(result.passed).toBe(169);
});

test('invalid arithmetic JSON stays writable and persists recovered progress across restart and reload',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.evaluate(AKEY=>{
   localStorage.setItem(AKEY,'{broken');
   localStorage.setItem('place-value-practice:mode:v1','arithmetic');
 },AKEY);
 await page.reload();
 expect(await raw(page,AKEY)).toBe('{broken');
 expect(await raw(page)).toBe(before);
 await correct(page);
 const completed=await snapshot(page);
 expect(completed.schemaVersion).toBe(3);expect(completed.completed).toBe(1);
 expect(completed.learning.serial).toBe(1);
 expect(JSON.parse(await raw(page,AKEY))).toEqual(completed);
 await page.reload();expect(await snapshot(page)).toEqual(completed);
 await page.locator('#arithmetic-next').click();
 expect((await snapshot(page)).sequence).toBe(1);
 await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 await correct(page);
 const restarted=await snapshot(page);
 expect(restarted.completed).toBe(1);expect(restarted.learning.serial).toBe(2);
 expect(JSON.parse(await raw(page,AKEY))).toEqual(restarted);
 await page.reload();expect(await snapshot(page)).toEqual(restarted);
 expect(await raw(page)).toBe(before);
});

test('malformed arithmetic saves recover without touching place-value progress',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.evaluate(AKEY=>{
   localStorage.setItem(AKEY,JSON.stringify({schemaVersion:1,sequence:0,target:10,completed:0,firstTry:0,afterHelp:0,
     question:{id:0,family:'facts-add',operands:[500,4],choices:[504,503,502,501],misses:[],complete:false}}));
   localStorage.setItem('place-value-practice:mode:v1','arithmetic');
 },AKEY);
 await page.reload();
 const state=await snapshot(page);
 expect(state.completed).toBe(0);
 expect(state.question.operands.every(n=>n<=20)).toBe(true);
 await correct(page);expect((await snapshot(page)).completed).toBe(1);
 expect(await raw(page)).toBe(before);
});


test('three misses reveal the equation across reload, then require the correct choice before Next',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const view=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()));
 const choices=(await snapshot(page)).question.choices;
 for(const value of choices.filter(value=>value!==view.answer)) {
   await page.getByRole('button',{name:String(value),exact:true}).click();
 }
 const revealed=await snapshot(page);
 expect(revealed.question.complete).toBe(false);expect(revealed.completed).toBe(0);
 await expect(page.locator('#arithmetic-equation')).toHaveText(view.worked);
 await expect(page.locator('#arithmetic-feedback')).toContainText('Here is the answer');
 await expect(page.locator('#arithmetic-next')).toBeHidden();
 const semantic=await page.evaluate(()=>JSON.parse(render_game_to_text()));
 expect(semantic.revealed).toBe(true);expect(semantic.worked).toBe(view.worked);expect(semantic.complete).toBe(false);
 await page.reload();expect(await snapshot(page)).toEqual(revealed);
 await page.screenshot({path:test.info().outputPath('reveal.png')});
 await expect(page.locator('#arithmetic-equation')).toHaveText(view.worked);
 await expect(page.locator('#arithmetic-next')).toBeHidden();
 for(const value of choices.filter(value=>value!==view.answer)) await expect(page.getByRole('button',{name:String(value),exact:true})).toBeDisabled();
 await correct(page);expect((await snapshot(page)).completed).toBe(1);
 await page.evaluate(()=>document.querySelector('.arithmetic-answer').click());
 expect((await snapshot(page)).completed).toBe(1);
 await page.locator('#arithmetic-next').click();expect((await snapshot(page)).sequence).toBe(1);
 expect(await raw(page)).toBe(before);
});

test('changing arithmetic session length retains keyboard focus',async({page})=>{
 await page.goto('/place-value-practice/');
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const select=page.getByLabel('Arithmetic session length');
 await select.focus();await select.selectOption('20');await expect(select).toBeFocused();
 await page.keyboard.press('ArrowUp');await expect(select).toBeFocused();
});


test('pending finite and endless lengths survive retry, reveal, answer, Next and mode changes until Start',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const select=page.getByLabel('Arithmetic session length'),start=page.getByRole('button',{name:'Start new arithmetic session'});
 await expect(select).toHaveValue('10');
 for(const [pending,target] of [['5',5],['endless',null],['20',20]]) {
   const active=await snapshot(page),saved=await raw(page,AKEY);
   await select.selectOption(pending);
   expect(await snapshot(page)).toEqual(active);expect(await raw(page,AKEY)).toBe(saved);
   const answer=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()).answer);
   for(const wrong of active.question.choices.filter(n=>n!==answer)) {
     await page.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${wrong}$`)}).click();
     await expect(select).toHaveValue(pending);expect((await snapshot(page)).target).toBe(active.target);
   }
   await correct(page);await expect(select).toHaveValue(pending);
   await page.locator('#arithmetic-next').click();await expect(select).toHaveValue(pending);
   await page.getByRole('button',{name:'Place value',exact:true}).click();
   await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
   await expect(select).toHaveValue(pending);expect((await snapshot(page)).target).toBe(active.target);
   await start.click();
   const restarted=await snapshot(page);
   expect(restarted.target).toBe(target);expect(restarted.completed).toBe(0);expect(restarted.sequence).toBe(0);
   expect(restarted.learning.position).toBe((active.learning.position+1)%20);
   expect(await raw(page)).toBe(before);
 }
 // A pending choice is visit-local; reload restores the active target.
 await select.selectOption('5');await page.reload();await expect(select).toHaveValue('20');
 expect((await snapshot(page)).target).toBe(20);
});

test('four short sessions guarantee coverage through reload, Practice again and zero-progress Start',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 const select=page.getByLabel('Arithmetic session length'),start=page.getByRole('button',{name:'Start new arithmetic session'});
 await select.selectOption('5');await start.click();
 const families=[];
 for(let session=0;session<4;session++) {
   for(let i=0;i<5;i++) {
     families.push((await snapshot(page)).question.family);await correct(page);
     if(i<4)await page.locator('#arithmetic-next').click();
   }
   const complete=await snapshot(page);await page.reload();expect(await snapshot(page)).toEqual(complete);
   await page.locator('#arithmetic-next').click();
   expect((await snapshot(page)).learning.position).toBe(((session+1)*5)%20);
   const restarted=await snapshot(page);await start.click();
   expect((await snapshot(page)).learning).toEqual(restarted.learning);
   expect((await snapshot(page)).completed).toBe(0);
 }
 expect(new Set(families).size).toBe(10);
 for(let i=0;i<=15;i++)expect(families.slice(i,i+5).filter(f=>f==='facts-add'||f==='facts-subtract').length).toBeGreaterThanOrEqual(2);
 expect(await raw(page)).toBe(before);
 // Practice again applies a pending choice, including endless.
 for(let i=0;i<5;i++){await correct(page);if(i<4)await page.locator('#arithmetic-next').click();}
 await select.selectOption('endless');await page.locator('#arithmetic-next').click();
 expect((await snapshot(page)).target).toBeNull();expect((await snapshot(page)).learning.position).toBe(5);
 expect(await raw(page)).toBe(before);
});

test('schema three stays writable through reload, reveal, answer, reload and Next',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await correct(page);await page.getByRole('button',{name:'Start new arithmetic session'}).click();
 const initial=await snapshot(page);expect(initial.schemaVersion).toBe(3);expect(initial.learning.position).toBe(1);
 await page.reload();expect(await snapshot(page)).toEqual(initial);
 const answer=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()).answer);
 for(const wrong of initial.question.choices.filter(n=>n!==answer))await page.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${wrong}$`)}).click();
 const revealed=await snapshot(page);await page.reload();expect(await snapshot(page)).toEqual(revealed);
 await correct(page);const completed=await snapshot(page);
 expect(completed.completed).toBe(1);expect(completed.afterHelp).toBe(1);
 expect(JSON.parse(await raw(page,AKEY))).toEqual(completed);
 await page.reload();expect(await snapshot(page)).toEqual(completed);
 await page.evaluate(()=>document.querySelector('.arithmetic-answer').click());
 expect((await snapshot(page)).completed).toBe(1);
 await page.locator('#arithmetic-next').click();expect((await snapshot(page)).learning.position).toBe(2);
 expect(await raw(page)).toBe(before);
});

test('legacy revealed save migrates without losing its attempt and writes schema three on completion',async({page})=>{
 await page.goto('/place-value-practice/');const before=await raw(page);
 const legacy={schemaVersion:1,sequence:4,target:5,completed:4,firstTry:4,afterHelp:0,
   question:{id:4,family:'facts-add',operands:[4,5],choices:[9,8,10,7],misses:[8,10,7],complete:false}};
 await page.evaluate(({legacy,AKEY})=>{localStorage.setItem(AKEY,JSON.stringify(legacy));localStorage.setItem('place-value-practice:mode:v1','arithmetic');},{legacy,AKEY});
 await page.reload();const migrated=await snapshot(page);
 expect(migrated.schemaVersion).toBe(3);expect(migrated.learning.serial).toBe(0);
 expect(migrated.question).toEqual({...legacy.question,serial:1,legacyOffset:0});
 await expect(page.locator('#arithmetic-equation')).toHaveText('4 + 5 = 9');
 await expect(page.getByLabel('Arithmetic session length')).toHaveValue('5');
 await correct(page);const completed=await snapshot(page);
 expect(completed.completed).toBe(5);expect(completed.firstTry).toBe(4);expect(completed.afterHelp).toBe(1);
 expect(JSON.parse(await raw(page,AKEY))).toEqual(completed);
 await page.reload();expect(await snapshot(page)).toEqual(completed);
 expect(completed.learning.history['facts-add']).toEqual([{serial:1,outcome:'revealed',misses:3}]);
 await page.locator('#arithmetic-next').click();expect((await snapshot(page)).learning.position).toBe(0);
 expect(await raw(page)).toBe(before);
});
