import { test, expect } from '@playwright/test';
const KEY='place-value-practice:facts:v1', MIXED='place-value-practice:arithmetic:v1', PLACE='place-value-practice:progress:v1', SUB='place-value-practice:arithmetic-mode:v1';
async function freeze(page){const now=new Date('2026-09-09T12:00:00Z');await page.clock.install({time:now});await page.clock.pauseAt(now);}
test.beforeEach(async({page})=>{await freeze(page);});
async function autoNext(page){await page.clock.runFor(1000);await settled(page);}
async function settled(page){await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy','false');}
async function snapshot(page){await settled(page);return page.evaluate(()=>__factsTest.snapshot());}
async function boot(page){await page.addInitScript(()=>{localStorage.setItem('place-value-practice:mode:v1','arithmetic');localStorage.setItem('place-value-practice:arithmetic-mode:v1','facts');});await page.goto('/place-value-practice/');await expect(page.locator('#fact-practice')).toBeVisible();}
async function enter(page,value,touch=false){await settled(page);await page.locator('.facts-keypad').getByRole('button',{name:'Clear',exact:true}).click();if(touch){for(const digit of String(value))await page.locator('.facts-keypad').getByRole('button',{name:digit,exact:true}).click();await page.locator('#facts-check').click();}else{await page.locator('#facts-check').focus();await page.keyboard.type(String(value));await page.keyboard.press('Enter');}await settled(page);}
async function correct(page,touch=false){await settled(page);const value=await page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);await enter(page,value,touch);}

test('stadium-first composition retains large art, a bounded runner and accessible Submit controls',async({page})=>{
 await boot(page);await page.locator('.facts-stadium').evaluate(img=>img.decode());await page.locator('.facts-ball').evaluate(img=>img.decode());
 await expect(page.getByRole('button',{name:'Submit',exact:true})).toBeVisible();await expect(page.locator('#facts-next')).toHaveCount(0);
 const geometry=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),field=rect('.facts-drive'),runner=rect('.facts-ball'),dock=rect('.facts-dock');return {fieldWidth:field.width,width:innerWidth,fieldHeight:field.height,runnerLeft:runner.left,runnerRight:runner.right,dockTop:dock.top,fieldBottom:field.bottom};});
 expect(geometry.fieldWidth).toBe(geometry.width);expect(geometry.fieldHeight).toBeGreaterThanOrEqual(230);
 expect(geometry.runnerLeft).toBeGreaterThanOrEqual(0);expect(geometry.runnerRight).toBeLessThanOrEqual(geometry.width);
 expect(geometry.dockTop).toBe(geometry.fieldBottom);
 expect(await page.locator('#fact-practice button:visible').evaluateAll(bs=>bs.every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.width>=44;}))).toBe(true);
 await expect(page.locator('#facts-milestone')).toHaveText('Next milestone: 25 yards');
});

test('numeric question count accepts exact counts, rejects invalid input, and stops at final completion',async({page})=>{
 await boot(page);const count=page.getByRole('spinbutton',{name:'Fact practice question count'});await expect(count).toHaveValue('10');
 const original=await snapshot(page),bytes=await page.evaluate(k=>localStorage.getItem(k),KEY);
 for(const value of ['', '0','101','-1','1.5']){
  await count.fill(value);await page.getByRole('button',{name:'Start new fact session'}).click();
  await expect(count).toHaveAttribute('aria-invalid','true');await expect(page.locator('#facts-length-error')).toHaveText('Enter a whole number from 1 to 100.');
  expect(await snapshot(page)).toEqual(original);expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(bytes);
 }
 for(const target of [1,3,7,100]){
  await count.fill(String(target));expect((await snapshot(page)).session.target).not.toBe(target);
  await page.getByRole('button',{name:'Start new fact session'}).click();await settled(page);expect((await snapshot(page)).session.target).toBe(target);
  await expect(count).not.toHaveAttribute('aria-invalid','true');await page.reload();await expect(count).toHaveValue(String(target));
 }
 await count.fill('1');await page.getByRole('button',{name:'Start new fact session'}).click();await correct(page,true);
 const final=await snapshot(page);await expect(page.locator('#facts-recap')).toContainText('1 completed.');await expect(page.locator('#facts-recap')).toBeFocused();
 await page.clock.runFor(5000);expect(await snapshot(page)).toEqual(final);expect(JSON.parse(await page.evaluate(()=>render_game_to_text())).autoAdvancePending).toBe(false);
 await page.reload();await page.clock.runFor(5000);expect((await snapshot(page)).session.completed).toBe(1);
});

test('correct completion saves once, holds success for 650ms and advances without another tap',async({page})=>{
 await boot(page);await enter(page,3);const missed=await snapshot(page);await page.clock.runFor(2000);expect(await snapshot(page)).toEqual(missed);
 await page.getByRole('button',{name:'Start new fact session'}).click();await settled(page);
 const before=await snapshot(page);await correct(page,true);const completed=await snapshot(page);expect(completed.serial).toBe(before.serial+1);expect(completed.drive.totalYards).toBe(5);
 await expect(page.locator('#facts-feedback')).toContainText('+5 yards');await expect(page.locator('#facts-check')).toBeDisabled();
 await page.evaluate(()=>{document.querySelector('#facts-check').click();document.querySelector('#facts-show').click();});await page.keyboard.type('123');await page.keyboard.press('Enter');
 await page.clock.runFor(649);expect((await snapshot(page)).attempt.id).toBe(completed.attempt.id);
 await page.clock.runFor(1);await settled(page);const next=await snapshot(page);expect(next.attempt.id).toBe(completed.attempt.id+1);expect(next.attempt.complete).toBe(false);expect(next.serial).toBe(completed.serial);expect(next.drive.totalYards).toBe(5);
 await expect(page.locator('#facts-check')).toBeFocused();await expect(page.locator('#facts-answer')).toHaveText('…');
 expect(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),KEY))).toEqual(next);
});

test('pending automatic next is cancelled by mode change, restart and hidden-page state',async({page})=>{
 await boot(page);await correct(page);let finished=await snapshot(page);
 await page.getByRole('button',{name:'Place value',exact:true}).click();await page.clock.runFor(2000);expect(await page.evaluate(()=>__factsTest.snapshot())).toEqual(finished);
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();await expect(page.locator('#facts-award')).toBeHidden();await autoNext(page);expect((await snapshot(page)).attempt.id).toBe(finished.attempt.id+1);
 await correct(page);await page.getByRole('spinbutton',{name:'Fact practice question count'}).fill('7');await page.getByRole('button',{name:'Start new fact session'}).click();await settled(page);
 const restarted=await snapshot(page);await page.clock.runFor(2000);expect(await snapshot(page)).toEqual(restarted);expect(restarted.session.target).toBe(7);expect(restarted.session.completed).toBe(0);expect(restarted.drive.totalYards).toBe(10);
 await correct(page);finished=await snapshot(page);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(2000);expect(await snapshot(page)).toEqual(finished);
 await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await autoNext(page);expect((await snapshot(page)).attempt.id).toBe(finished.attempt.id+1);
});

test('delayed auto-advance lock cannot cross a mode lifecycle or overwrite a newer saved attempt',async({page})=>{
 await boot(page);await correct(page);const completed=await snapshot(page);
 await page.evaluate(()=>{const original=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(key,fn)=>new Promise(resolve=>{window.releaseAutoLock=()=>{navigator.locks.request=original;return original(key,fn).then(resolve);};});});
 await page.clock.runFor(650);await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy','true');
 await page.getByRole('button',{name:'Place value',exact:true}).click();await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await page.evaluate(()=>window.releaseAutoLock());await settled(page);expect(await snapshot(page)).toEqual(completed);
 await autoNext(page);expect((await snapshot(page)).attempt.id).toBe(completed.attempt.id+1);
 await correct(page);const newer=await page.evaluate(KEY=>{const s=__factsTest.snapshot();PLACE_FACTS.next(s,s.attempt.id);const bytes=JSON.stringify(s);localStorage.setItem(KEY,bytes);return bytes;},KEY);
 await autoNext(page);expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(newer);expect(await snapshot(page)).toEqual(JSON.parse(newer));await expect(page.locator('.facts-storage')).toContainText('another tab');
});

test('restart cancels an already waiting automatic write and a hidden completion cannot award',async({page})=>{
 await boot(page);await correct(page);const complete=await snapshot(page);
 const hold=()=>page.evaluate(()=>{const original=navigator.locks.request.bind(navigator.locks);navigator.locks.request=(key,fn)=>new Promise(resolve=>{window.releaseQueuedLock=()=>{navigator.locks.request=original;return original(key,fn).then(resolve);};});});
 await hold();await page.clock.runFor(650);await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy','true');
 await page.getByRole('spinbutton',{name:'Fact practice question count'}).fill('3');await page.getByRole('button',{name:'Start new fact session'}).click();
 await page.evaluate(()=>window.releaseQueuedLock());await expect.poll(async()=>(await snapshot(page)).session.target).toBe(3);
 const restarted=await snapshot(page);expect(restarted.attempt.id).toBe(complete.attempt.id+1);expect(restarted.serial).toBe(1);expect(restarted.drive.totalYards).toBe(5);await page.clock.runFor(2000);expect(await snapshot(page)).toEqual(restarted);
 const answer=await page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
 await hold();for(const digit of String(answer))await page.locator('.facts-keypad').getByRole('button',{name:digit,exact:true}).click();await page.locator('#facts-check').click();
 await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy','true');await page.getByRole('button',{name:'Place value',exact:true}).click();
 await page.evaluate(()=>window.releaseQueuedLock());await settled(page);expect(await page.evaluate(()=>__factsTest.snapshot())).toEqual(restarted);
 await page.clock.runFor(2000);expect(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),KEY))).toEqual(restarted);
});

test('drive keeps practice controls visible, gives one atomic award, and preserves yards between sessions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 const field=page.getByRole('progressbar',{name:'Touchdown drive'});
 await expect(field).toHaveAttribute('aria-valuenow','0');
 await expect(page.locator('#facts-rule')).toHaveText('First try without help: 5 yards. Otherwise: 1 yard.');
 for(const selector of ['#facts-equation','.facts-keypad','#facts-check','#facts-show']){
  expect(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),selector).toBe(true);
 }
 expect(await page.locator('#fact-practice button:visible').evaluateAll(bs=>bs.every(b=>b.getBoundingClientRect().height>=44))).toBe(true);
 await page.screenshot({path:test.info().outputPath('drive-start.png')});
 await page.evaluate(KEY=>{const write=Storage.prototype.setItem;window.factWrites=[];Storage.prototype.setItem=function(key,bytes){if(key===KEY)window.factWrites.push(JSON.parse(bytes));return write.call(this,key,bytes);};},KEY);
 await correct(page,true);
 const writes=await page.evaluate(()=>window.factWrites);expect(writes).toHaveLength(1);
 expect(writes[0].attempt.complete).toBe(true);expect(writes[0].drive.totalYards).toBe(5);
 await expect(field).toHaveAttribute('aria-valuenow','5');await expect(page.locator('#facts-feedback')).toContainText('+5 yards');
 await expect(page.locator('#facts-check')).toBeDisabled();
 await page.evaluate(()=>{document.querySelector('#facts-check').click();document.querySelector('#facts-check').click();});
 expect((await snapshot(page)).drive.totalYards).toBe(5);expect(await page.evaluate(()=>window.factWrites.length)).toBe(1);
 await page.reload();await expect(field).toHaveAttribute('aria-valuenow','5');await expect(page.locator('#facts-feedback')).not.toContainText('+5');
 await page.getByRole('button',{name:'Start new fact session'}).click();expect((await snapshot(page)).drive.totalYards).toBe(5);
 await correct(page);expect((await snapshot(page)).drive.totalYards).toBe(10);
 const state=await page.evaluate(()=>JSON.parse(render_game_to_text()));expect(state.drive).toMatchObject({totalYards:10,yards:10,touchdowns:0,lastAward:5,celebrating:false,saved:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('miss, voluntary help, automatic help and report completion all earn one yard without learning cross-credit',async({page})=>{
 await boot(page);let total=0;
 for(const kind of ['miss','voluntary','automatic','report']){
  await page.getByRole('button',{name:'Start new fact session'}).click();const s=await snapshot(page);
  const answer=await page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
  if(kind==='miss'||kind==='automatic')await enter(page,(answer+1)%19);
  if(kind==='automatic')await enter(page,(answer+2)%19);
  if(kind==='voluntary')await page.locator('#facts-show').click();
  if(kind==='report')await page.locator('#facts-report > summary').click();
  expect((await snapshot(page)).drive.totalYards).toBe(total);
  await page.reload();expect((await snapshot(page)).drive.totalYards).toBe(total);
  await correct(page);total++;
  const after=await snapshot(page);expect(after.drive.totalYards).toBe(total);expect(after.facts[s.attempt.factId].checks).toBe(s.facts[s.attempt.factId].checks);
  await expect(page.locator('#facts-feedback')).toContainText('+1 yard');
 }
});

for(const startingYards of [95,96,98])test(`touchdown from ${startingYards} yards celebrates only the live completion and supports reduced motion`,async({page})=>{
 await boot(page);
 const remaining=(startingYards+5)%100;
 await page.evaluate(({KEY,startingYards})=>{
  const a=PLACE_FACTS,s=a.create();
  for(let i=0;i<19+startingYards-95;i++){if(i>=19)a.show(s,s.attempt.id);a.answer(s,s.attempt.id,a.byId[s.attempt.factId].answer);if(s.session.completed>=s.session.target)a.restart(s,10);else a.next(s,s.attempt.id);}
  localStorage.setItem(KEY,JSON.stringify(s));
 },{KEY,startingYards});
 await page.reload();await expect(page.locator('#facts-yards')).toHaveText(`${startingYards} / 100 yards`);
 await expect(page.locator('.facts-drive')).not.toHaveClass(/facts-drive--touchdown/);
 await page.emulateMedia({reducedMotion:'no-preference'});await correct(page,true);
 await expect(page.locator('.facts-drive')).toHaveClass(/facts-drive--touchdown/);
 expect(await page.locator('.facts-ball').evaluate(el=>getComputedStyle(el).transitionProperty)).toBe('none');
 await expect(page.locator('#facts-touchdowns')).toHaveText('1 touchdown');await expect(page.locator('#facts-yards')).toHaveText(`${remaining} / 100 yards`);
 await expect(page.locator('#facts-award')).toHaveText('Touchdown!');await expect(page.locator('#facts-check')).toBeDisabled();
 await expect(page.locator('#facts-feedback')).toContainText(remaining?`Touchdown! ${remaining} yard${remaining===1?'':'s'} into your next drive.`:'Touchdown! Start your next drive.');
 await expect(page.locator('#facts-feedback')).not.toContainText('0 yards into');
 for(const selector of ['.facts-drive','#facts-check'])expect(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),selector).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('#facts-award').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 expect(await page.locator('.facts-ball').evaluate(el=>getComputedStyle(el).transitionProperty)).toBe('none');
 await page.screenshot({path:test.info().outputPath('drive-touchdown.png')});
 const bytes=await page.evaluate(k=>localStorage.getItem(k),KEY);await page.reload();
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(bytes);await expect(page.locator('.facts-drive')).not.toHaveClass(/facts-drive--touchdown/);
 await expect(page.locator('#facts-award')).not.toHaveText('Touchdown!');await expect(page.locator('#facts-feedback')).not.toContainText('Touchdown!');
 await expect(page.getByRole('progressbar',{name:'Touchdown drive'})).toHaveAttribute('aria-valuetext',`${remaining} of 100 yards; 1 touchdown`);
 await page.emulateMedia({reducedMotion:'no-preference'});
 expect(await page.locator('.facts-ball').evaluate(el=>getComputedStyle(el).transitionProperty)).toBe('left');
});

test('legacy facts migrate on a locked action; damaged drive metadata preserves instructional records',async({page})=>{
 await boot(page);await correct(page);await autoNext(page);await settled(page);
 const legacy=await page.evaluate(KEY=>{const s=__factsTest.snapshot();s.schemaVersion=1;delete s.drive;delete s.attempt.rewardSupported;const bytes=JSON.stringify(s);localStorage.setItem(KEY,bytes);return bytes;},KEY);
 await page.reload();expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(legacy);
 expect((await snapshot(page)).drive.totalYards).toBe(0);await correct(page);
 const migrated=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);expect(migrated.schemaVersion).toBe(2);expect(migrated.serial).toBe(2);expect(migrated.drive.totalYards).toBe(5);
 const corrupt=await page.evaluate(KEY=>{const s=__factsTest.snapshot();s.drive.totalYards=-8;const bytes=JSON.stringify(s);localStorage.setItem(KEY,bytes);return bytes;},KEY);
 await page.reload();expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(corrupt);
 expect((await snapshot(page)).facts).toEqual(migrated.facts);expect((await snapshot(page)).drive.totalYards).toBe(0);
 await expect(page.locator('.facts-storage')).toContainText('Your learning progress is preserved');
 await autoNext(page);await settled(page);await expect(page.locator('.facts-storage')).not.toContainText('saved drive could not be read');
 await correct(page);expect((await snapshot(page)).drive.totalYards).toBe(5);
});

test('repair notice remains when a repaired drive cannot be saved',async({page})=>{
 await boot(page);await correct(page);
 await page.evaluate(KEY=>{const s=__factsTest.snapshot();s.drive.totalYards=-1;localStorage.setItem(KEY,JSON.stringify(s));},KEY);
 await page.reload();await expect(page.locator('.facts-storage')).toContainText('saved drive could not be read');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('quota');};});
 await autoNext(page);await settled(page);
 await expect(page.locator('.facts-storage')).toContainText('saved drive could not be read');
 await expect(page.locator('.facts-drive-info')).toContainText('unsaved');
});

test('miss and shown-answer states keep the drive and practice controls reachable without obstruction',async({page})=>{
 await boot(page);
 async function reachable(complete,shown){
  const selectors=['.facts-drive','#facts-equation','.facts-keypad','.facts-controls','#facts-feedback',...(shown?['#facts-support']:[]),...(complete?['#facts-check']:[])];
  // A normal vertical scroll can reveal the whole working area together, even
  // when the extra worked example moves the header above a short viewport.
  await page.locator('.facts-drive').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
  for(const selector of selectors){
   await expect(page.locator(selector)).toBeVisible();
   expect(await page.locator(selector).evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&el.contains(hit);
   }),selector).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 for(const kind of ['miss','voluntary','automatic']){
  await page.evaluate(KEY=>{const a=PLACE_FACTS,s=a.create();a.answer(s,s.attempt.id,2);a.next(s,s.attempt.id);localStorage.setItem(KEY,JSON.stringify(s));},KEY);
  await page.reload();expect((await snapshot(page)).attempt.factId).toBe('add:7:6');
  if(kind!=='voluntary')await enter(page,14,true);
  if(kind==='automatic')await enter(page,15,true);
  if(kind==='voluntary')await page.locator('#facts-show').click();
  await settled(page);await reachable(false,kind!=='miss');
  await correct(page,true);await reachable(true,kind!=='miss');
  await expect(page.locator('#facts-feedback')).toContainText('+1 yard');
  await expect(page.locator('#facts-check')).toBeDisabled();
  await page.screenshot({path:test.info().outputPath(`drive-${kind}-completed.png`)});
 }
});

test('toggle-only report exposure also marks a warm prompt as supported for drive rewards',async({page})=>{
 await boot(page);
 await page.evaluate(KEY=>{const s=__factsTest.snapshot();s.attempt.eligible=false;localStorage.setItem(KEY,JSON.stringify(s));},KEY);
 await page.reload();expect((await snapshot(page)).attempt.rewardSupported).toBe(false);
 await page.evaluate(()=>{const report=document.querySelector('#facts-report');report.open=true;report.dispatchEvent(new Event('toggle'));});
 await expect(page.locator('#facts-report')).toHaveAttribute('open','');
 await expect.poll(async()=>(await snapshot(page)).attempt.rewardSupported).toBe(true);
 await page.reload();await correct(page);expect((await snapshot(page)).drive.totalYards).toBe(1);
 expect((await snapshot(page)).session.firstTry).toBe(1);expect((await snapshot(page)).facts['sub:7:5'].checks).toBe(0);
});

test('fresh and legacy arithmetic choices default to basic facts without changing larger-number saves',async({page})=>{
 await page.goto('/place-value-practice/');
 await expect(page.locator('#game-version')).toHaveText('Version 1.6.0');
 await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await expect(page.locator('#fact-practice')).toBeVisible();
 expect((await snapshot(page)).attempt.factId).toBe('sub:7:5');
 expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBeNull();
 for(const preference of [null,'mixed','facts','unknown']){
  const saved=await page.evaluate(({SUB,MIXED,KEY,preference})=>{
   const bytes=JSON.stringify(PLACE_ARITHMETIC.create());localStorage.setItem(MIXED,bytes);localStorage.removeItem(KEY);
   if(preference===null)localStorage.removeItem(SUB);else localStorage.setItem(SUB,preference);return bytes;
  },{SUB,MIXED,KEY,preference});
  await page.reload();await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('#arithmetic-practice')).toBeHidden();
  await expect(page.getByRole('button',{name:'Basic + and −',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#fact-practice')).toContainText('No two-digit addition.');
  expect((await snapshot(page)).attempt.factId).toBe('sub:7:5');
  for(let i=0;i<10;i++){
   const id=(await snapshot(page)).attempt.factId;
   const [op,a,b]=id.split(':');
   if(op==='add'){expect(Number(a)).toBeLessThanOrEqual(9);expect(Number(b)).toBeLessThanOrEqual(9);}
   else{expect(op).toBe('sub');expect(Number(b)).toBeLessThanOrEqual(9);expect(Number(a)-Number(b)).toBeLessThanOrEqual(9);}
   await correct(page);if(i<9)await autoNext(page);
  }
  await page.reload();expect((await snapshot(page)).session.completed).toBe(10);
  expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBe(saved);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath('basic-default.png')});
});

test('larger-number work requires an explicit later choice, remembers it, and returns to basic facts',async({page})=>{
 await page.goto('/place-value-practice/');await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await correct(page);const basic=await page.evaluate(k=>localStorage.getItem(k),KEY);
 await page.getByRole('button',{name:'For later: larger numbers',exact:true}).click();
 await expect(page.locator('#arithmetic-practice')).toBeVisible();await expect(page.locator('#arithmetic-practice')).toContainText('including two-digit addition and subtraction');
 expect(await page.evaluate(k=>localStorage.getItem(k),SUB)).toBe('mixed-later');
 await page.reload();await expect(page.locator('#arithmetic-practice')).toBeVisible();
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(basic);
 const later=await page.evaluate(k=>localStorage.getItem(k),MIXED);
 await page.getByRole('button',{name:'Basic + and −',exact:true}).click();await page.reload();
 await expect(page.locator('#fact-practice')).toBeVisible();expect((await snapshot(page)).session.completed).toBe(1);
 expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBe(later);
});

test('opening report removes independent credit durably and hides numeric family triples',async({page})=>{
 await boot(page);expect((await snapshot(page)).attempt.factId).toBe('sub:7:5');expect((await snapshot(page)).attempt.eligible).toBe(true);
 await page.locator('#facts-report > summary').click();await expect(page.locator('#facts-report')).toHaveAttribute('open','');
 expect((await snapshot(page)).attempt.eligible).toBe(false);
 await expect(page.locator('#facts-report')).not.toContainText('2, 5, 7');
 await expect(page.locator('#facts-report summary').filter({hasText:/^Fact family /})).toHaveCount(55);
 await page.reload();expect((await snapshot(page)).attempt.eligible).toBe(false);
 await correct(page);const s=await snapshot(page);expect(s.facts['sub:7:5'].checks).toBe(0);expect(s.session.firstTry).toBe(1);expect(s.attempt.helped).toBe(false);
 expect(s.facts['sub:7:5'].history.at(-1).ms).toBeNull();
});

test('toggle-only report opening closes while its eligibility mutation waits for the lock',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{
  const original=navigator.locks.request.bind(navigator.locks);
  window.releaseReportLock=null;
  navigator.locks.request=(key,fn)=>new Promise(resolve=>{window.releaseReportLock=()=>original(key,fn).then(resolve);});
  const report=document.querySelector('#facts-report');report.open=true;report.dispatchEvent(new Event('toggle'));
 });
 await expect(page.locator('#facts-report')).not.toHaveAttribute('open','');
 expect(await page.evaluate(()=>__factsTest.snapshot().attempt.eligible)).toBe(true);
 await page.evaluate(()=>window.releaseReportLock());await expect(page.locator('#facts-report')).toHaveAttribute('open','');
 expect((await snapshot(page)).attempt.eligible).toBe(false);
 await page.reload();await correct(page);expect((await snapshot(page)).facts['sub:7:5'].checks).toBe(0);
});

test('report stays closed during another locked action on eligible and warm prompts',async({page})=>{
 await boot(page);
 for(const warm of [false,true]){
  await page.evaluate(({KEY,warm})=>{const s=PLACE_FACTS.create();s.attempt.eligible=!warm;localStorage.setItem(KEY,JSON.stringify(s));},{KEY,warm});
  await page.reload();
  await page.evaluate(()=>{
   const original=navigator.locks.request.bind(navigator.locks);
   navigator.locks.request=(key,fn)=>new Promise(resolve=>{window.releaseBusyLock=()=>{navigator.locks.request=original;return original(key,fn).then(resolve);};});
  });
  await page.locator('.facts-keypad').getByRole('button',{name:'3',exact:true}).click();await page.locator('#facts-check').click();
  await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy','true');
  await page.locator('#facts-report > summary').click();
  const pendingFrames=page.evaluate(async()=>{
   const states=[];for(let i=0;i<5;i++){await new Promise(requestAnimationFrame);states.push({open:document.querySelector('#facts-report').open,supported:__factsTest.snapshot().attempt.rewardSupported});}return states;
  });
  await page.clock.runFor(100);const frames=await pendingFrames;
  expect(frames).toEqual(Array.from({length:5},()=>({open:false,supported:false})));
  await page.evaluate(()=>window.releaseBusyLock());await settled(page);
  await page.locator('#facts-report > summary').click();await expect(page.locator('#facts-report')).toHaveAttribute('open','');
  expect((await snapshot(page)).attempt.rewardSupported).toBe(true);
 }
});

test('stale-tab refresh closes an open report before showing a newer eligible attempt',async({page,context})=>{
 await boot(page);await page.locator('#facts-report > summary').click();await expect(page.locator('#facts-report')).toHaveAttribute('open','');
 const other=await context.newPage();await freeze(other);await other.goto('/place-value-practice/');await correct(other);await autoNext(other);await settled(other);
 const fresh=await snapshot(other);expect(fresh.attempt.eligible).toBe(true);
 await correct(page);await expect(page.locator('#facts-report')).not.toHaveAttribute('open','');expect((await snapshot(page)).attempt.id).toBe(fresh.attempt.id);
 expect((await snapshot(page)).attempt.eligible).toBe(true);
 await page.locator('#facts-report > summary').click();await expect(page.locator('#facts-report')).toHaveAttribute('open','');
 expect((await snapshot(page)).attempt.eligible).toBe(false);await correct(page);
 expect((await snapshot(page)).facts[fresh.attempt.factId].checks).toBe(0);await other.close();
});

test('five and ten question sessions with touch and keyboard; report, focus, recap, snapshot and layout',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
 for(const target of [5,10]){
  await page.getByLabel('Fact practice question count').fill(String(target));await page.getByRole('button',{name:'Start new fact session'}).click();
  for(let i=0;i<target;i++){const before=await snapshot(page);await correct(page,i%2===0);expect((await snapshot(page)).session.completed).toBe(i+1);
   await expect(page.locator('#facts-check')).toBeDisabled();if(i<target-1){await autoNext(page);expect((await snapshot(page)).attempt.id).not.toBe(before.attempt.id);}}
  await expect(page.locator('#facts-recap')).toContainText(`${target} completed`);await expect(page.locator('#facts-report')).not.toHaveAttribute('open','');
  await page.locator('#facts-report > summary').click();await expect(page.locator('#facts-report')).toContainText('reading and tapping');
  expect((await page.evaluate(()=>JSON.parse(render_game_to_text()))).submode).toBe('facts');
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('#fact-practice button').evaluateAll(bs=>bs.every(b=>b.getBoundingClientRect().height>=44))).toBe(true);
 expect(await page.locator('#fact-practice input').count()).toBe(1);expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('facts-recap.png')});
});

test('empty, bounded, leading-zero and backspace entry; same-tick duplicate Submit and automatic advances are inert',async({page})=>{
 await boot(page);await page.locator('#facts-check').click();expect((await snapshot(page)).attempt.firstCorrect).toBeNull();
 await page.locator('#facts-check').focus();await page.keyboard.type('02');await expect(page.locator('#facts-answer')).toHaveText('2');
 await page.keyboard.type('999');await expect(page.locator('#facts-answer')).toHaveText('2');
 await page.keyboard.press('Backspace');await expect(page.locator('#facts-answer')).toHaveText('…');
 await page.keyboard.type('2');await page.evaluate(()=>{document.querySelector('#facts-check').click();document.querySelector('#facts-check').click();});
 expect((await snapshot(page)).serial).toBe(1);const id=(await snapshot(page)).attempt.id;
 await autoNext(page);await autoNext(page);
 expect((await snapshot(page)).attempt.id).toBe(id+1);
});

test('wrong attempt survives reload with retry intent, help acknowledges without check credit',async({page})=>{
 await boot(page);await enter(page,3,true);const missed=await snapshot(page);expect(missed.attempt.misses).toBe(1);expect(missed.serial).toBe(0);
 expect(missed.facts['sub:7:5'].ticket.kind).toBe('retry');await page.reload();expect(await snapshot(page)).toEqual({...missed,attempt:{...missed.attempt,firstMs:null}});
 expect(await page.evaluate(()=>__factsTest.timing().valid)).toBe(false);
 await enter(page,4);await expect(page.locator('#facts-support')).toContainText('5 + 2 = 7');expect((await snapshot(page)).attempt.helped).toBe(true);
 await correct(page);const s=await snapshot(page);expect(s.facts['sub:7:5'].checks).toBe(0);expect(s.facts['sub:7:5'].history[0].outcome).toBe('shown');
 await page.screenshot({path:test.info().outputPath('facts-shown.png')});
 await autoNext(page);expect((await snapshot(page)).attempt.factId).not.toBe('sub:7:5');
});

test('Enter preserves button actions and answer controls describe the current equation',async({page})=>{
 await boot(page);
 const oldEquation=await page.locator('#facts-equation').textContent();
 for(const selector of ['#facts-check','#facts-answer','.facts-keypad','.facts-keypad button']){
  for(const control of await page.locator(selector).all())await expect(control).toHaveAttribute('aria-describedby','facts-equation');
 }
 await expect(page.locator('#facts-equation')).not.toHaveAttribute('aria-live',/./);
 await page.locator('.facts-keypad').getByRole('button',{name:'2',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.locator('#facts-answer')).toHaveText('2');expect((await snapshot(page)).attempt.complete).toBe(false);
 await page.locator('#facts-show').focus();await page.keyboard.press('Enter');expect((await snapshot(page)).attempt.helped).toBe(true);
 await page.getByRole('button',{name:'For later: larger numbers',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('#fact-practice')).toBeHidden();
 await page.getByRole('button',{name:'Basic + and −',exact:true}).click();await correct(page);await autoNext(page);
 await expect(page.locator('#facts-check')).toBeFocused();expect(await page.locator('#facts-equation').textContent()).not.toBe(oldEquation);
 await expect(page.locator('#facts-check')).toHaveAccessibleDescription(await page.locator('#facts-equation').textContent());
});

test('report groups cover practiced facts once, including warm retries and checked retry tickets',async({page})=>{
 await boot(page);
 await page.evaluate(KEY=>{
  const a=PLACE_FACTS,s=a.create(),fid=s.attempt.factId;
  s.attempt.eligible=false;a.answer(s,s.attempt.id,a.byId[fid].answer);
  localStorage.setItem(KEY,JSON.stringify(s));
 },KEY);await page.reload();await page.locator('#facts-report > summary').click();
 const groups=page.locator('#facts-report > div > details').filter({hasNot:page.locator('details')});
 await expect(groups.locator('p')).toHaveCount(1);
 await expect(page.locator('#facts-report')).toContainText('Practiced without an eligible check (1)');
 await page.evaluate(KEY=>{
  const a=PLACE_FACTS,s=a.create(),fid=s.attempt.factId;
  while(s.facts[fid].checks<2||s.attempt.complete||s.attempt.factId!==fid){
   if(!s.attempt.complete)a.answer(s,s.attempt.id,a.byId[s.attempt.factId].answer);
   if(s.session.completed===s.session.target)a.restart(s,10);else a.next(s,s.attempt.id);
  }
  a.answer(s,s.attempt.id,3);localStorage.setItem(KEY,JSON.stringify(s));
 },KEY);await page.reload();await page.locator('#facts-report > summary').click();
 const expected=await page.evaluate(()=>PLACE_FACTS.report(__factsTest.snapshot()).rows.filter(r=>r.practiced).length);
 await expect(groups.locator('p')).toHaveCount(expected);
 await expect(groups.locator('p').filter({hasText:'7 − 5 = ?:'})).toHaveCount(1);
 await expect(page.locator('#facts-report')).toContainText('Another try due (1)');
});

test('optional help and leaving/returning preserve exact active attempt and isolated bytes',async({page})=>{
 await boot(page);await page.locator('#facts-show').click();const shown=await snapshot(page);
 await page.getByRole('button',{name:'For later: larger numbers',exact:true}).click();const mixed=await page.evaluate(k=>localStorage.getItem(k),MIXED);
 await page.getByRole('button',{name:'Basic + and −',exact:true}).click();expect(await snapshot(page)).toEqual(shown);
 await correct(page);await page.reload();expect((await snapshot(page)).attempt.complete).toBe(true);
 expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBe(mixed);
 await page.getByRole('button',{name:'Place value',exact:true}).click();await page.getByRole('button',{name:'Arithmetic',exact:true}).click();
 expect((await snapshot(page)).attempt.complete).toBe(true);
});

test('direct Facts boot preserves absent, malformed and future Mixed and Place Value bytes',async({page})=>{
 await page.goto('/place-value-practice/');
 for(const bytes of [null,'bad json',' {"schemaVersion":999,"keep":true} ']){
  await page.evaluate(({bytes,MIXED,PLACE,SUB,KEY})=>{for(const k of [MIXED,PLACE])if(bytes===null)localStorage.removeItem(k);else localStorage.setItem(k,bytes);
   localStorage.removeItem(KEY);localStorage.setItem('place-value-practice:mode:v1','arithmetic');localStorage.setItem(SUB,'facts');},{bytes,MIXED,PLACE,SUB,KEY});
  await page.reload();await expect(page.locator('#fact-practice')).toBeVisible();expect(await page.evaluate(()=>__arithmeticTest.snapshot())).toBeNull();
  await correct(page);await autoNext(page);await settled(page);await page.reload();await correct(page);
  for(const k of [MIXED,PLACE])expect(await page.evaluate(k=>localStorage.getItem(k),k)).toBe(bytes);
  expect(await page.evaluate(k=>localStorage.getItem(k),SUB)).toBe('facts');
 }
});

test('blur, visibility, report, submode change and reload discard timing; a fresh visible question records a bounded sample',async({page})=>{
 await boot(page);
 for(const event of ['blur','visibilitychange','report','mode','reload','none']){
  await page.getByRole('button',{name:'Start new fact session'}).click();await settled(page);
  await page.clock.runFor(40);await expect.poll(()=>page.evaluate(()=>__factsTest.timing().valid)).toBe(true);
  await page.clock.runFor(350);
  if(event==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  if(event==='visibilitychange')await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  if(event==='report')await page.locator('#facts-report > summary').click();
  if(event==='mode'){await page.getByRole('button',{name:'For later: larger numbers',exact:true}).click();await page.getByRole('button',{name:'Basic + and −',exact:true}).click();}
  if(event==='reload')await page.reload();
  await correct(page);const s=await snapshot(page),ms=s.facts[s.attempt.factId].history.at(-1).ms;
  if(event==='none'){expect(ms).toBeGreaterThanOrEqual(300);expect(ms%100).toBe(0);}else expect(ms).toBeNull();
 }
});

test('future and malformed facts are preserved at boot, and only a locked user action repairs malformed data',async({page})=>{
 await boot(page);
 for(const bytes of ['bad json','{"schemaVersion":99,"keep":"future"}']){
  await page.evaluate(({KEY,bytes})=>localStorage.setItem(KEY,bytes),{KEY,bytes});await page.reload();
  expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(bytes);await correct(page);
  const after=await page.evaluate(k=>localStorage.getItem(k),KEY);
  if(bytes==='bad json'){expect(JSON.parse(after).serial).toBe(1);}else{expect(after).toBe(bytes);await expect(page.locator('.facts-storage')).toContainText('newer version');}
 }
});

test('stale simultaneous tabs resynchronize; newer schema introduced after boot remains untouched',async({page,context})=>{
 await boot(page);await page.locator('#facts-show').click();const other=await context.newPage();await freeze(other);await other.goto('/place-value-practice/');
 await correct(page);const saved=await page.evaluate(k=>localStorage.getItem(k),KEY);await correct(other);
 expect((await snapshot(page)).drive.totalYards).toBe(1);expect((await snapshot(other)).drive.totalYards).toBe(1);
 expect(await other.evaluate(k=>localStorage.getItem(k),KEY)).toBe(saved);await expect(other.locator('.facts-storage')).toContainText('another tab');
 await other.getByRole('button',{name:'Place value',exact:true}).click();
 await autoNext(page);await settled(page);const newSaved=await page.evaluate(k=>localStorage.getItem(k),KEY);
 await other.getByRole('button',{name:'Arithmetic',exact:true}).click();
 await other.getByRole('button',{name:'Start new fact session'}).click();await settled(other);expect(await other.evaluate(k=>localStorage.getItem(k),KEY)).toBe(newSaved);
 const future=' {"schemaVersion":99} ';await page.evaluate(({KEY,future})=>localStorage.setItem(KEY,future),{KEY,future});
 await correct(page);await correct(page);expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(future);await other.close();
});

test('unavailable locks, lock rejection, and failed storage keep usable memory-only sessions',async({page})=>{
 await boot(page);
 for(const failure of ['locks','lock-reject','write','read']){
  await page.reload();const before=await page.evaluate(k=>localStorage.getItem(k),KEY);
  await page.evaluate(failure=>{
   if(failure==='locks')Object.defineProperty(navigator,'locks',{value:undefined,configurable:true});
   if(failure==='lock-reject')Object.defineProperty(navigator,'locks',{value:{request:()=>Promise.reject(Error('blocked'))},configurable:true});
   if(failure==='write')Storage.prototype.setItem=function(){throw Error('quota');};
   if(failure==='read')Storage.prototype.getItem=function(){throw Error('blocked');};
  },failure);
  await correct(page);expect((await snapshot(page)).serial).toBe(1);await expect(page.locator('.facts-storage')).toContainText('memory');
  expect((await snapshot(page)).drive.totalYards).toBe(5);await expect(page.locator('.facts-drive-info')).toContainText('unsaved');
  if(failure!=='read')expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(before);
 }
});
