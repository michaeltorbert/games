// Math practice navigation, the Options dialog, page boundaries and presentation-only changes.
// Uses the unmodified Playwright fixture: every page prompt here is a real dialog answered by the test.
import {test,expect} from '@playwright/test';
import {ROUTES,checkedOptions,chooseOptions,mathPractice,optionsButton,optionsDialog} from './place-practice-nav.mjs';
const MODE='place-value-practice:mode:v1',SUB='place-value-practice:arithmetic-mode:v1',SHOW='place-value-practice:presentation:v1';
const MIXED='place-value-practice:arithmetic:v1',FACTS='place-value-practice:facts:v1',BOOK='place-value-practice:book:v1',PLACE='place-value-practice:progress:v1',PROGRESS='math-curriculum:progress:v1';
const STORES=[MODE,SUB,SHOW,MIXED,FACTS,BOOK,PLACE,PROGRESS];
const once=(info,why)=>test.skip(info.project.name!=='ipad-11-landscape',why);
const prompt=page=>page.locator('.curriculum-dialog');
async function settled(page){for(const id of ['#arithmetic-practice','#fact-practice'])await expect(page.locator(id)).toHaveAttribute('aria-busy','false');}
async function confirm(page,value){
 await expect(prompt(page)).toBeVisible();if(value!==undefined)await page.locator('#curriculum-page').fill(String(value));
 await page.locator('#curriculum-submit').click();const again=page.getByRole('button',{name:'Confirm page',exact:true});if(await again.isVisible())await again.click();
 await expect(prompt(page)).toHaveCount(0);await settled(page);
}
async function cancelPrompt(page){await expect(prompt(page)).toBeVisible();await page.locator('#curriculum-cancel').click();await expect(prompt(page)).toHaveCount(0);}
// Starts from a clean profile with the given saved bytes and answers the startup page prompt.
async function boot(page,saved={},startPage=187){
 await page.goto('/place-value-practice/');
 await page.evaluate(saved=>{localStorage.clear();for(const [key,value] of Object.entries(saved))localStorage.setItem(key,value);},saved);
 await page.reload();if(startPage!==null)await confirm(page,startPage);
}
const stores=page=>page.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),STORES);
const facts=page=>page.evaluate(()=>__factsTest.snapshot());
const factAnswer=page=>page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
const factSource=page=>page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].source.page);
async function keypad(page,value){for(const digit of String(value))await page.locator('.facts-keypad').getByRole('button',{name:digit,exact:true}).click();}
// Holds the next lock request for `key` until window.releaseHeld(); other locks pass through (see place-facts-ui.spec.mjs).
async function holdLock(page,key){
 await page.evaluate(key=>{const proto=Object.getPrototypeOf(navigator.locks),original=proto.request;window.lockHeld=false;
  proto.request=function(name,fn){if(name!==key)return original.call(this,name,fn);window.lockHeld=true;
   return new Promise(resolve=>{window.releaseHeld=()=>{proto.request=original;return original.call(navigator.locks,name,fn).then(resolve);};});};},key);
}
async function release(page){await page.evaluate(()=>window.releaseHeld());}
async function expectHeld(page){await expect.poll(()=>page.evaluate(()=>window.lockHeld)).toBe(true);}

test('every saved focus and presentation value opens the right route; only an explicit choice writes the focus',async({page},info)=>{
 once(info,'Preference mapping once; layout runs on every device');
 const expected={null:'mixed',mixed:'mixed','mixed-later':'mixed',facts:'facts',book:'book',junk:'mixed'};
 const panels={mixed:'#arithmetic-practice',facts:'#fact-practice',book:'#book-practice'};
 for(const [route,focus] of Object.entries(expected))for(const shown of [null,'football','plain','junk']){
  const saved={[MODE]:'arithmetic'};if(route!=='null')saved[SUB]=route;if(shown!==null)saved[SHOW]=shown;
  await boot(page,saved);const presentation=shown==='plain'?'plain':'football',label=`${route}/${shown}`;
  await expect(page.locator(panels[focus]),label).toBeVisible();
  for(const other of Object.values(panels).filter(p=>p!==panels[focus]))await expect(page.locator(other),label).toBeHidden();
  await expect(page.locator('#practice-route-label')).toHaveText(ROUTES[focus]);
  await expect(optionsButton(page)).toHaveAccessibleName(`Practice options, now ${ROUTES[focus]}`);
  await expect(page.locator('body')).toHaveClass(new RegExp(`${presentation}-practice`));
  expect(await checkedOptions(page),label).toEqual({focus,presentation});
  // Booting, opening and cancelling never rewrite the saved choices.
  expect(await page.evaluate(([a,b])=>[localStorage.getItem(a),localStorage.getItem(b)],[SUB,SHOW]),label).toEqual([route==='null'?null:route,shown]);
 }
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts'});
 for(const [focus,value] of [['mixed','mixed-later'],['book','book'],['facts','facts']]){
  await chooseOptions(page,{focus});await settled(page);expect(await page.evaluate(k=>localStorage.getItem(k),SUB)).toBe(value);
  await page.reload();await confirm(page);await expect(page.locator('#practice-route-label')).toHaveText(ROUTES[focus]);
 }
});

test('Cancel and Escape change nothing: stores, typed answer, worked panel, route and focus stay',async({page},info)=>{
 once(info,'Dialog contract once; layout runs on every device');
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts'});
 await keypad(page,1);await expect(page.locator('#facts-answer')).toHaveText('1');
 const before=await stores(page),model=await facts(page);
 for(const close of ['cancel','escape']){
  await optionsButton(page).click();const dialog=optionsDialog(page);await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveClass(/curriculum-dialog/);
  await dialog.getByRole('radio',{name:'Book topics',exact:true}).click();await dialog.getByRole('radio',{name:'Plain',exact:true}).click();
  if(close==='cancel')await dialog.getByRole('button',{name:'Cancel',exact:true}).click();else await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();await expect(optionsButton(page)).toBeFocused();
  await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('#book-practice')).toBeHidden();
  await expect(page.locator('.facts-drive')).toBeVisible();await expect(page.locator('#facts-answer')).toHaveText('1');
  expect(await stores(page)).toEqual(before);expect(await facts(page)).toEqual(model);
  expect(await checkedOptions(page)).toEqual({focus:'facts',presentation:'football'});
 }
 // A completed answer keeps its worked panel through Options.
 await page.locator('.facts-keypad').getByRole('button',{name:'Clear',exact:true}).click();await keypad(page,await factAnswer(page));await page.locator('#facts-check').click();await settled(page);
 const lines=await page.locator('#facts-worked .arithmetic-explanation-lines li').allTextContents(),done=await stores(page);expect(lines.length).toBeGreaterThan(0);
 await optionsButton(page).click();await page.keyboard.press('Escape');await expect(optionsButton(page)).toBeFocused();
 await expect(page.locator('#facts-worked')).toBeVisible();expect(await page.locator('#facts-worked .arithmetic-explanation-lines li').allTextContents()).toEqual(lines);
 await expect(page.locator('#facts-next')).toBeVisible();expect(await stores(page)).toEqual(done);
});

test('presentation-only and same-choice Apply leave queued fact answers, typed input and awards intact; a real route change cancels them',async({page},info)=>{
 once(info,'Lock contract once; layout runs on every device');
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts'});
 // A queued Submit survives a presentation-only Apply.
 const start=await facts(page);await keypad(page,await factAnswer(page));
 await holdLock(page,FACTS);await page.locator('#facts-check').click();await expectHeld(page);
 await chooseOptions(page,{presentation:'plain'});await expect(page.locator('.facts-drive')).toBeHidden();
 await expect(page.locator('body')).toHaveClass(/plain-practice/);await expect(page.locator('body')).not.toHaveClass(/facts-active/);
 await release(page);await settled(page);
 const answered=await facts(page);expect(answered.attempt.id).toBe(start.attempt.id);expect(answered.attempt.complete).toBe(true);expect(answered.drive.totalYards).toBe(start.drive.totalYards+5);
 expect(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),FACTS))).toEqual(answered);
 expect(await page.evaluate(k=>localStorage.getItem(k),SHOW)).toBe('plain');
 // A queued Next survives a presentation-only Apply, and the drive award shows again in Football.
 await holdLock(page,FACTS);await page.locator('#facts-next').click();await expectHeld(page);
 await chooseOptions(page,{presentation:'football'});await expect(page.locator('.facts-drive')).toBeVisible();await expect(page.locator('body')).toHaveClass(/facts-active/);
 await expect(page.locator('#facts-award')).toHaveText('+5 yards');
 await release(page);await settled(page);expect((await facts(page)).attempt.id).toBe(answered.attempt.id+1);
 // A queued Submit survives an Apply that changes nothing; the typed answer stays until then.
 const next=await facts(page);await keypad(page,await factAnswer(page));
 await holdLock(page,FACTS);await page.locator('#facts-check').click();await expectHeld(page);
 await chooseOptions(page,{});await expect(page.locator('#facts-answer')).toHaveText(String(await factAnswer(page)));
 await release(page);await settled(page);expect((await facts(page)).attempt.complete).toBe(true);expect((await facts(page)).attempt.id).toBe(next.attempt.id);
 // Typed input survives presentation-only Apply without a queued action.
 await page.locator('#facts-next').click();await settled(page);await keypad(page,1);
 await chooseOptions(page,{presentation:'plain'});await expect(page.locator('#facts-answer')).toHaveText('1');
 await chooseOptions(page,{presentation:'football'});await expect(page.locator('#facts-answer')).toHaveText('1');
 // A genuine route change keeps today's cancellation: the queued Submit is dropped.
 const pending=await facts(page),bytes=await page.evaluate(k=>localStorage.getItem(k),FACTS);
 await page.locator('.facts-keypad').getByRole('button',{name:'Clear',exact:true}).click();await keypad(page,await factAnswer(page));
 await holdLock(page,FACTS);await page.locator('#facts-check').click();await expectHeld(page);
 await chooseOptions(page,{focus:'mixed'});await expect(page.locator('#arithmetic-practice')).toBeVisible();
 await release(page);await settled(page);
 expect(await facts(page)).toEqual(pending);expect(await page.evaluate(k=>localStorage.getItem(k),FACTS)).toBe(bytes);
});

test('opening Options discards only the timing sample; digits typed in either dialog never reach the answer',async({page},info)=>{
 once(info,'Timing contract once; layout runs on every device');
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts'});
 await expect.poll(()=>page.evaluate(()=>__factsTest.timing().valid)).toBe(true);
 const before=await facts(page);
 await optionsButton(page).click();await expect(optionsDialog(page)).toBeVisible();
 expect(await page.evaluate(()=>__factsTest.timing())).toEqual({valid:false,started:false});
 await optionsDialog(page).getByRole('button',{name:'Apply',exact:true}).focus();await page.keyboard.type('7');
 // Backspace on a dialog button must not edit the answer, and its default stays prevented as it was before
 // the dialog guard, so the browser cannot treat it as navigation. A window listener sees the final state.
 await page.evaluate(()=>{window.backspaces=[];window.addEventListener('keydown',e=>{if(e.key==='Backspace')window.backspaces.push(e.defaultPrevented);});});
 await optionsDialog(page).getByRole('button',{name:'Cancel',exact:true}).focus();await page.keyboard.type('4');await page.keyboard.press('Backspace');
 expect(await page.evaluate(()=>window.backspaces)).toEqual([true]);expect(new URL(page.url()).pathname).toBe('/place-value-practice/');
 await expect(optionsDialog(page)).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('#facts-answer')).toHaveText('…');
 // The interrupt adds no help, report or reward penalty.
 const after=await facts(page);expect(after.attempt).toEqual(before.attempt);
 expect(await page.evaluate(()=>__factsTest.timing().valid)).toBe(false);
 // Digits on the page prompt's buttons are also ignored.
 await page.getByRole('button',{name:'Start new fact session',exact:true}).click();await expect(prompt(page)).toBeVisible();
 await page.locator('#curriculum-cancel').focus();await page.keyboard.type('5');await expect(page.locator('#facts-answer')).toHaveText('…');
 await page.locator('#curriculum-cancel').click();await expect(prompt(page)).toHaveCount(0);
 await keypad(page,await factAnswer(page));await page.locator('#facts-check').click();await settled(page);
 const done=await facts(page),row=done.facts[before.attempt.factId];
 expect(row.history.at(-1).ms).toBeNull();expect(row.history.at(-1).outcome).toBe('first-correct');
 expect(done.session.firstTry).toBe(before.session.firstTry+1);expect(done.drive.totalYards).toBe(before.drive.totalYards+5);
 expect(row.checks).toBe(before.facts[before.attempt.factId].checks+(before.attempt.eligible?1:0));
});

for(const [route,low,high] of [['facts',16,113],['facts',0,17],['mixed',0,17],['mixed',16,113]])
test(`${ROUTES[route]} below page 17 shows its own unavailable screen and Update completed page ${low}→${high} starts it safely`,async({page},info)=>{
 once(info,'Boundary flow once per case; layout runs on every device');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page,{[MODE]:'arithmetic',[SUB]:route==='mixed'?'mixed-later':'facts'},low);
 const screen=page.locator('#practice-unavailable');await expect(screen).toBeVisible();
 await expect(screen.getByRole('heading',{level:2})).toHaveText(ROUTES[route]);
 await expect(screen).toContainText('No practice lessons are finished yet. Practice starts after printed page 17.');await expect(screen).not.toContainText(/book/i);
 for(const id of ['#arithmetic-practice','#fact-practice','#book-practice'])await expect(page.locator(id)).toBeHidden();
 expect(JSON.parse(await page.evaluate(()=>render_game_to_text()))).toEqual({mode:'arithmetic-unavailable',page:low});
 expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBeNull();
 // Cancelling the update leaves the screen usable.
 await screen.getByRole('button',{name:'Update completed page',exact:true}).click();await cancelPrompt(page);
 await expect(screen).toBeVisible();await expect(screen.getByRole('button',{name:'Update completed page',exact:true})).toBeFocused();
 await screen.getByRole('button',{name:'Update completed page',exact:true}).click();await confirm(page,high);
 await expect(screen).toBeHidden();await expect(optionsButton(page)).toBeFocused();
 if(route==='facts'){
  await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('#facts-check')).toBeEnabled();
  expect(await factSource(page)).toBeLessThanOrEqual(high);expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(high);
  // Number facts never touches the Mixed store.
  expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBeNull();await expect(page.locator('.facts-storage')).not.toContainText('memory');
  await keypad(page,await factAnswer(page));await page.locator('#facts-check').click();await settled(page);expect((await facts(page)).attempt.complete).toBe(true);
 }else{
  await expect(page.locator('#arithmetic-practice')).toBeVisible();await expect(page.locator('#arithmetic-practice .arithmetic-answer')).toHaveCount(4);
  const required=await page.evaluate(()=>{const s=__arithmeticTest.snapshot();return MATH_CURRICULUM.arithmeticPage(s.question.family,s.question.operands);});
  expect(required).toBeLessThanOrEqual(high);await expect(page.locator('.arithmetic-storage')).toHaveText('');
  expect(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),MIXED))).toEqual(await page.evaluate(()=>__arithmeticTest.snapshot()));
 }
 expect(errors).toEqual([]);
});

test('the unavailable screen offers Go to Place value, and Book keeps its own empty panel and restart',async({page},info)=>{
 once(info,'Boundary flow once; layout runs on every device');
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts'},0);
 await page.locator('#practice-unavailable').getByRole('button',{name:'Go to Place value',exact:true}).click();
 await expect(page.locator('#practice')).toBeVisible();await expect(page.locator('#practice-unavailable')).toBeHidden();await expect(optionsButton(page)).toBeHidden();
 await boot(page,{[MODE]:'arithmetic',[SUB]:'book'},16);
 await expect(page.locator('#practice-unavailable')).toBeHidden();await expect(page.locator('#book-practice')).toBeVisible();
 await expect(page.locator('#book-question')).toHaveText('No completed lessons in this chapter yet.');
 await page.getByRole('button',{name:'Start new book session',exact:true}).click();await confirm(page,113);
 await expect(page.locator('#book-question')).not.toHaveText('No completed lessons in this chapter yet.');
 const q=await page.evaluate(()=>PLACE_BOOK.current(__bookTest.snapshot()));expect(q.page).toBeLessThanOrEqual(113);
});

for(const [low,high] of [[16,113],[0,17]])
test(`a Number facts restart confirming page ${low} shows the unavailable screen at once; Update to ${high} keeps the drive and history`,async({page},info)=>{
 once(info,'Boundary flow once per case; layout runs on every device');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts'});
 await keypad(page,await factAnswer(page));await page.locator('#facts-check').click();await settled(page);
 await page.locator('#facts-next').click();await settled(page);await keypad(page,1);
 const before=await facts(page),bytes=await page.evaluate(k=>localStorage.getItem(k),FACTS);expect(before.drive.totalYards).toBe(5);
 // Cancelling the restart prompt changes nothing.
 await page.getByRole('button',{name:'Start new fact session',exact:true}).click();await cancelPrompt(page);
 await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('#practice-unavailable')).toBeHidden();await expect(page.locator('#facts-answer')).toHaveText('1');
 // Confirming a page below 17 switches straight to the route's own screen, without restarting or touching Mixed.
 await page.getByRole('button',{name:'Start new fact session',exact:true}).click();await confirm(page,low);
 const screen=page.locator('#practice-unavailable');await expect(screen).toBeVisible();await expect(screen.locator('h2')).toHaveText(ROUTES.facts);
 await expect(page.locator('#fact-practice')).toBeHidden();await expect(page.locator('#arithmetic-practice')).toBeHidden();
 await expect(screen.getByRole('button',{name:'Update completed page',exact:true})).toBeFocused();
 await expect(page.locator('#practice-route-label')).toHaveText(ROUTES.facts);
 expect(JSON.parse(await page.evaluate(()=>render_game_to_text()))).toEqual({mode:'arithmetic-unavailable',page:low});
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(low);expect(await facts(page)).toEqual(before);
 expect(await page.evaluate(k=>localStorage.getItem(k),FACTS)).toBe(bytes);expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBeNull();
 await screen.getByRole('button',{name:'Update completed page',exact:true}).click();await cancelPrompt(page);
 await expect(screen).toBeVisible();expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(low);
 await screen.getByRole('button',{name:'Update completed page',exact:true}).click();await confirm(page,high);
 await expect(screen).toBeHidden();await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('.facts-dock')).toBeVisible();
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(high);expect(await factSource(page)).toBeLessThanOrEqual(high);
 // The drive, learning records and session survive; the low page never restarted the session.
 const resumed=await facts(page);
 // (A repaired prompt may update exposure counters; completions, checks, history and tickets must not change.)
 const outcomes=s=>Object.fromEntries(Object.entries(s.facts).map(([id,r])=>[id,{completed:r.completed,checks:r.checks,history:r.history,ticket:r.ticket}]));
 expect(resumed.drive).toEqual(before.drive);expect(outcomes(resumed)).toEqual(outcomes(before));expect(resumed.session).toEqual(before.session);expect(resumed.serial).toBe(before.serial);
 await expect(page.locator('.facts-storage')).not.toContainText('No fact lessons');
 expect(await page.evaluate(k=>localStorage.getItem(k),MIXED)).toBeNull();
 await page.locator('.facts-keypad').getByRole('button',{name:'Clear',exact:true}).click();await keypad(page,await factAnswer(page));await page.locator('#facts-check').click();await settled(page);
 const done=await facts(page);expect(done.attempt.complete).toBe(true);expect(done.drive.totalYards).toBe(before.drive.totalYards+5);expect(done.session.completed).toBe(before.session.completed+1);
 expect(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),FACTS))).toEqual(done);
 expect(errors).toEqual([]);
});

test('R1a: a stale fact restart page cannot overwrite Update completed page, and the restored prompt is repaired',async({page},info)=>{
 once(info,'Page ordering once; layout runs on every device');
 // A genuinely saved drive prompt from a page above 113 that a later lower page must replace.
 await page.goto('/place-value-practice/');
 const {seeded,factId}=await page.evaluate(()=>{const a=PLACE_FACTS;a.configure(187);const s=a.create(100);
  const low=()=>a.byId[s.attempt.factId].source.page<=113||s.attempt.kind!=='drive'||a.pendingKick(s);
  for(let i=0;i<1000&&low();i++){a.answer(s,s.attempt.id,a.byId[s.attempt.factId].answer);if(a.sessionDone(s))a.restart(s,100);else a.next(s,s.attempt.id);}
  if(low())throw Error('no high-page prompt');return {seeded:JSON.stringify(s),factId:s.attempt.factId};});
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts',[FACTS]:seeded});
 expect((await facts(page)).attempt.factId).toBe(factId);expect(await factSource(page)).toBeGreaterThan(113);
 await keypad(page,1);await expect(page.locator('#facts-answer')).toHaveText('1');
 await page.getByRole('button',{name:'Start new fact session',exact:true}).click();await confirm(page,16);
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(16);await expect(page.locator('.facts-dock')).toBeHidden();
 await expect(page.locator('#practice-unavailable h2')).toHaveText(ROUTES.facts);
 // D2 seeds Mixed from the page just confirmed (16), so it is unavailable too.
 await chooseOptions(page,{focus:'mixed'});await expect(page.locator('#practice-unavailable h2')).toHaveText(ROUTES.mixed);
 await chooseOptions(page,{focus:'facts'});await expect(page.locator('#practice-unavailable h2')).toHaveText(ROUTES.facts);
 const id=(await facts(page)).attempt.id;
 await page.locator('#practice-unavailable').getByRole('button',{name:'Update completed page',exact:true}).click();await confirm(page,113);
 await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('#practice-unavailable')).toBeHidden();
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(113);
 const repaired=await facts(page);expect(repaired.attempt.id).toBeGreaterThan(id);expect(repaired.attempt.factId).not.toBe(factId);
 expect(await factSource(page)).toBeLessThanOrEqual(113);
 // The replaced prompt clears the draft, takes no timing sample and is saved by the next locked action.
 await expect(page.locator('#facts-answer')).toHaveText('…');expect(await page.evaluate(()=>__factsTest.timing())).toEqual({valid:false,started:false});
 await expect(page.locator('.facts-storage')).not.toContainText('No fact lessons');
 expect(await page.evaluate(k=>localStorage.getItem(k),FACTS)).toBe(seeded);
 await keypad(page,await factAnswer(page));await page.locator('#facts-check').click();await settled(page);
 const saved=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),FACTS));expect(saved.attempt.factId).toBe(repaired.attempt.factId);expect(saved.attempt.complete).toBe(true);
 // Leaving and returning keeps 113; an ordinary reactivation keeps a typed draft.
 await page.locator('#facts-next').click();await settled(page);await keypad(page,1);
 await chooseOptions(page,{focus:'book'});await chooseOptions(page,{focus:'facts'});
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(113);await expect(page.locator('#facts-answer')).toHaveText('1');
});

test('R3a: a cancelled page prompt after a combined Apply restores both focus and presentation',async({page},info)=>{
 once(info,'Rollback once; layout runs on every device');
 // In normal use every Math practice visit already holds a confirmed page, so Apply never prompts (D2).
 // To reach the rollback path, this test hides only the in-visit snapshot; ask() is the real dialog.
 await page.addInitScript(()=>{let real;Object.defineProperty(globalThis,'CURRICULUM_UI',{configurable:true,get:()=>real,set(value){real=Object.freeze({...value,current:()=>null});}});});
 await boot(page,{[MODE]:'arithmetic',[SUB]:'mixed-later'});
 await expect(page.locator('#arithmetic-practice')).toBeVisible();const before=await stores(page),mixed=await page.evaluate(()=>__arithmeticTest.snapshot());
 await chooseOptions(page,{focus:'facts',presentation:'plain'});await cancelPrompt(page);await settled(page);
 await expect(optionsButton(page)).toBeFocused();await expect(page.locator('#arithmetic-practice')).toBeVisible();await expect(page.locator('#fact-practice')).toBeHidden();
 await expect(page.locator('#practice-route-label')).toHaveText(ROUTES.mixed);await expect(page.locator('.arithmetic-drive')).toBeVisible();
 await expect(page.locator('body')).toHaveClass(/football-practice/);await expect(page.locator('body')).not.toHaveClass(/plain-practice/);
 expect(await stores(page)).toEqual(before);expect(await page.evaluate(()=>__arithmeticTest.snapshot())).toEqual(mixed);
 expect(await page.evaluate(()=>__factsTest.snapshot())).toBeNull();
 expect(await checkedOptions(page)).toEqual({focus:'mixed',presentation:'football'});
 // Confirming instead saves both choices together.
 await chooseOptions(page,{focus:'facts',presentation:'plain'});await confirm(page,113);
 await expect(page.locator('#fact-practice')).toBeVisible();await expect(page.locator('.facts-drive')).toBeHidden();await expect(optionsButton(page)).toBeFocused();
 expect(await page.evaluate(([a,b])=>[localStorage.getItem(a),localStorage.getItem(b)],[SUB,SHOW])).toEqual(['facts','plain']);
});

test('D2: saved and session-only confirmations seed first entry; a cancelled start asks once; frozen route pages stay',async({page},info)=>{
 once(info,'Page reuse once; layout runs on every device');
 // Saved confirmation in Place value, then Math practice: no second prompt.
 await boot(page,{});await mathPractice(page).click();await settled(page);await expect(prompt(page)).toHaveCount(0);
 await expect(page.locator('#arithmetic-practice')).toBeVisible();
 // Session-only confirmation.
 const future='{"schemaVersion":999,"keep":"exact bytes"}';
 await boot(page,{[PROGRESS]:future},null);await expect(page.locator('#curriculum-memory')).toBeVisible();await page.locator('#curriculum-memory').click();await expect(prompt(page)).toHaveCount(0);
 expect(await page.evaluate(()=>CURRICULUM_UI.current().saved)).toBe(false);
 await mathPractice(page).click();await settled(page);await expect(prompt(page)).toHaveCount(0);await expect(page.locator('#arithmetic-practice')).toBeVisible();
 expect(await page.evaluate(k=>localStorage.getItem(k),PROGRESS)).toBe(future);
 // A cancelled startup prompt asks once on entry, then later routes reuse that answer.
 await boot(page,{},null);await cancelPrompt(page);await expect(page.locator('#practice')).toBeVisible();
 await mathPractice(page).click();await cancelPrompt(page);await expect(page.locator('#practice')).toBeVisible();await expect(optionsButton(page)).toBeHidden();
 await mathPractice(page).click();await confirm(page,120);await expect(page.locator('#arithmetic-practice')).toBeVisible();
 await chooseOptions(page,{focus:'facts'});await settled(page);await expect(prompt(page)).toHaveCount(0);await expect(page.locator('#fact-practice')).toBeVisible();
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(120);
 // A fact restart freezes 113; a newer page confirmed in Book cannot overwrite it.
 await page.getByRole('button',{name:'Start new fact session',exact:true}).click();await confirm(page,113);
 await chooseOptions(page,{focus:'book'});await expect(prompt(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Start new book session',exact:true}).click();await confirm(page,150);
 expect(await page.evaluate(()=>CURRICULUM_UI.current().completedThroughPage)).toBe(150);
 await chooseOptions(page,{focus:'facts'});await expect(prompt(page)).toHaveCount(0);
 expect(await page.evaluate(()=>PLACE_FACT_UI.page())).toBe(113);expect(await factSource(page)).toBeLessThanOrEqual(113);
 await chooseOptions(page,{focus:'book'});expect(await page.evaluate(()=>PLACE_BOOK_UI.page())).toBe(150);
});

for(const target of ['facts','unavailable'])test(`a late Mixed answer still saves but cannot draw or take focus on ${target==='facts'?'Number facts':'the unavailable screen'}`,async({page},info)=>{
 once(info,'Lock ordering once; layout runs on every device');
 await boot(page,{[MODE]:'arithmetic',[SUB]:'mixed-later'});
 const before=await page.evaluate(()=>__arithmeticTest.snapshot()),answer=await page.evaluate(()=>PLACE_ARITHMETIC.view(__arithmeticTest.snapshot()).answer);
 await holdLock(page,MIXED);await page.locator('#arithmetic-practice .arithmetic-answer').filter({hasText:new RegExp(`^${answer}$`)}).click();await expectHeld(page);
 if(target==='facts'){await chooseOptions(page,{focus:'facts'});await expect(page.locator('#fact-practice')).toBeVisible();}
 else{await page.getByRole('button',{name:'Start new arithmetic session',exact:true}).click();await confirm(page,16);await expect(page.locator('#practice-unavailable')).toBeVisible();}
 const focused=await page.evaluate(()=>document.activeElement.id||document.activeElement.textContent);
 await release(page);await expect(page.locator('#arithmetic-practice')).toHaveAttribute('aria-busy','false');
 const saved=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),MIXED));expect(saved.completed).toBe(before.completed+1);expect(saved.question.complete).toBe(true);
 await expect(page.locator('#arithmetic-practice')).toBeHidden();
 expect(await page.evaluate(()=>document.getElementById('arithmetic-practice').contains(document.activeElement))).toBe(false);
 expect(await page.evaluate(()=>document.activeElement.id||document.activeElement.textContent)).toBe(focused);
 if(target==='unavailable'){await expect(page.locator('#practice-unavailable')).toBeVisible();await expect(page.locator('#practice-unavailable h2')).toHaveText(ROUTES.mixed);}
 else await expect(page.locator('#fact-practice')).toBeVisible();
});

test('changing the book Topic still asks for the page and keeps book history; Cancel restores the Topic',async({page},info)=>{
 once(info,'Topic boundary once; layout runs on every device');
 await boot(page,{[MODE]:'arithmetic',[SUB]:'book'});
 const select=page.locator('#book-practice').getByLabel('Topic');
 await expect(select).toHaveAccessibleDescription('Changing the topic starts a new book session and asks for your page.');
 await expect(page.locator('#book-practice h2')).toHaveText('Book topics');await expect(select.locator('option').first()).toHaveText('All completed lessons');
 const q=await page.evaluate(()=>PLACE_BOOK.current(__bookTest.snapshot()));
 await page.locator('#book-practice .arithmetic-answer').filter({hasText:new RegExp(`^${q.answer.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).click();
 await expect(page.locator('#book-practice')).toContainText('Correct!');const done=await page.evaluate(()=>__bookTest.snapshot());expect(done.history).toHaveLength(1);
 await select.selectOption('8');await confirm(page,187);
 await expect.poll(()=>page.evaluate(()=>__bookTest.snapshot().chapter)).toBe(8);
 const changed=await page.evaluate(()=>__bookTest.snapshot());expect(changed.history).toEqual(done.history);expect(changed.completed).toBe(done.completed);
 await select.selectOption('6');await cancelPrompt(page);await expect(select).toHaveValue('8');
 expect(await page.evaluate(()=>__bookTest.snapshot().chapter)).toBe(8);
});

// Tap-driven layout on every device project in both presentations, with Options closed and open.
for(const presentation of ['football','plain'])test(`Math practice header and Options fit with touch-sized controls (${presentation})`,async({page})=>{
 const geometry=()=>page.evaluate(()=>{
  const visible=e=>e.offsetParent!==null||getComputedStyle(e).position==='fixed';
  const small=[...document.querySelectorAll('.practice-modes button, .practice-options:modal button, .practice-options:modal .practice-option, #practice-unavailable button')].filter(visible)
   .map(e=>[e.textContent.trim().slice(0,24),e.getBoundingClientRect()]).filter(([,r])=>r.width<44||r.height<44).map(([t,r])=>`${t} ${r.width}x${r.height}`);
  const dialog=document.querySelector('.practice-options:modal'),r=dialog?.getBoundingClientRect();
  return {overflow:document.documentElement.scrollWidth>innerWidth,small,
   dialog:dialog?{inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,noSideScroll:dialog.scrollWidth<=dialog.clientWidth,
    apply:(a=>a.top>=0&&a.bottom<=innerHeight)(dialog.querySelector('.practice-options-actions .button--primary').getBoundingClientRect())}:null};
 });
 const inView=selector=>page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
 await boot(page,{[MODE]:'arithmetic',[SUB]:'facts',[SHOW]:presentation});
 expect(await geometry()).toEqual({overflow:false,small:[],dialog:null});
 for(const selector of ['#facts-equation','.facts-keypad','#facts-check'])expect(await inView(selector),selector).toBe(true);
 await page.screenshot({path:test.info().outputPath(`facts-closed-${presentation}.png`)});
 await optionsButton(page).tap();await expect(optionsDialog(page)).toBeVisible();
 expect(await geometry()).toEqual({overflow:false,small:[],dialog:{inside:true,noSideScroll:true,apply:true}});
 for(const help of await optionsDialog(page).locator('.practice-option-help').all())await expect(help).toBeVisible();
 await page.screenshot({path:test.info().outputPath(`options-open-${presentation}.png`)});
 await optionsDialog(page).getByRole('button',{name:'Cancel',exact:true}).tap();
 // An answered fact keeps Next in view with Options closed.
 await keypad(page,await factAnswer(page));await page.locator('#facts-check').tap();await settled(page);
 expect(await inView('#facts-next'),'#facts-next').toBe(true);expect(await geometry()).toEqual({overflow:false,small:[],dialog:null});
 await page.screenshot({path:test.info().outputPath(`facts-answered-${presentation}.png`)});
 for(const focus of ['mixed','book']){
  await chooseOptions(page,{focus},{tap:true});await settled(page);
  expect(await geometry(),focus).toEqual({overflow:false,small:[],dialog:null});
  await page.screenshot({path:test.info().outputPath(`${focus}-closed-${presentation}.png`)});
 }
 await page.getByRole('button',{name:'Start new book session',exact:true}).tap();await confirm(page,16);
 await chooseOptions(page,{focus:'mixed'},{tap:true});await expect(page.locator('#practice-unavailable')).toBeHidden();
 await page.getByRole('button',{name:'Start new arithmetic session',exact:true}).tap();await confirm(page,16);
 await expect(page.locator('#practice-unavailable')).toBeVisible();expect(await geometry()).toEqual({overflow:false,small:[],dialog:null});
 await page.screenshot({path:test.info().outputPath(`unavailable-${presentation}.png`)});
});
