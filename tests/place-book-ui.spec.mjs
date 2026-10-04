import { test, expect } from './curriculum-fixture.mjs';
import { chooseOptions } from './place-practice-nav.mjs';
// Issue #146: Whole book shows a worked answer only after a correct completion.
// Buttons are operated with touch taps (every project has hasTouch). The native chapter
// select is changed with selectOption, which sets its value and fires change, not a tap.
const BOOK='place-value-practice:book:v1';
const OTHER=['place-value-practice:progress:v1','place-value-practice:arithmetic:v1','place-value-practice:facts:v1'];
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
async function boot(page,presentation){
 await page.addInitScript(p=>{localStorage.setItem('place-value-practice:mode:v1','arithmetic');localStorage.setItem('place-value-practice:arithmetic-mode:v1','book');localStorage.setItem('place-value-practice:presentation:v1',p);},presentation);
 await page.goto('/place-value-practice/');await expect(page.locator('#book-practice')).toBeVisible();
 // Mixed's hidden drive also carries .book-drive, so scope to the Whole book panel.
 await expect(page.locator('#book-practice .book-drive')).toBeVisible({visible:presentation==='football'});
}
const snapshot=page=>page.evaluate(()=>__bookTest.snapshot());
const others=page=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),OTHER);
const semantic=async page=>JSON.parse(await page.evaluate(()=>render_game_to_text()));
const lines=page=>page.locator('#book-worked .arithmetic-explanation-lines li').allTextContents();
// Chooses a chapter the way a learner does: select it, then confirm the page in the curriculum dialog
// (answered by the shared fixture). The choice must survive that dialog and govern the next lesson.
async function chapter(page,value){
 const select=page.locator('#book-practice').getByLabel('Topic'),before=await snapshot(page);
 await select.selectOption(String(value));
 await expect.poll(async()=>(await snapshot(page)).chapter).toBe(value);
 await expect(select).toHaveValue(String(value));
 const after=await snapshot(page);expect(after.serial).toBe(before.completed);expect(after.done).toBe(false);
 const q=await page.evaluate(()=>PLACE_BOOK.current(__bookTest.snapshot()));
 expect(await page.evaluate(id=>MATH_CURRICULUM.CATALOG.find(k=>k.id===id).chapter,q.skillId)).toBe(value);
 await expect(page.locator('#book-question')).toHaveText(q.prompt);
}
async function expectNoWorked(page){
 await expect(page.locator('#book-worked')).toBeHidden();await expect(page.locator('#book-worked')).toHaveText('');
 expect((await semantic(page)).explanation).toBeNull();
}
async function choose(page,value){await page.locator('#book-practice .arithmetic-answer').filter({hasText:new RegExp(`^${escape(value)}$`)}).tap();}
// Answers the current lesson through the visible choices, optionally after one miss,
// and checks the completed worked-answer panel against the domain projection.
async function complete(page,{miss=false}={}){
 const q=await page.evaluate(()=>PLACE_BOOK.current(__bookTest.snapshot()));
 await expectNoWorked(page);
 if(miss){
  await choose(page,q.choices.find(v=>v!==q.answer));await expect(page.locator('#book-practice')).toContainText('Try again');
  await expectNoWorked(page);await expect(page.locator('#book-practice')).toContainText(q.help);
 }
 const before=await snapshot(page);await choose(page,q.answer);
 await expect(page.locator('#book-practice')).toContainText('Correct!');
 const after=await snapshot(page);expect(after.completed).toBe(before.completed+1);expect(after.firstTry).toBe(before.firstTry+(miss?0:1));
 expect(after.history.at(-1)).toEqual({skillId:q.skillId,page:q.page,serial:after.completed,misses:miss?1:0});
 const expected=await page.evaluate(()=>PLACE_BOOK.explain(__bookTest.snapshot()));
 const panel=page.locator('#book-worked');await expect(panel).toBeVisible();await expect(panel.locator('h4')).toHaveText(expected.heading);
 await expect(panel).toHaveAccessibleName(expected.heading);
 expect(await lines(page)).toEqual(expected.lines);
 if(expected.kind==='columns')await expect(panel.locator('.place-columns')).toHaveAttribute('aria-hidden','true');
 else await expect(panel.locator('.place-columns')).toHaveCount(0);
 if(expected.equation)await expect(panel.locator('.arithmetic-explanation-equation')).toHaveText(expected.equation);
 expect((await semantic(page)).explanation).toEqual(expected);
 expect(await page.evaluate(k=>localStorage.getItem(k),BOOK)).not.toContain(expected.heading);
 return {q,expected};
}
async function next(page){await page.locator('#book-practice').getByRole('button',{name:'Next',exact:true}).tap();await expect.poll(async()=>(await snapshot(page)).done).toBe(false);await expectNoWorked(page);}
// Every visible Whole book control (chapter select, restart, answers and Next) must be at least 44px both ways.
async function geometry(page){
 return page.evaluate(()=>{
  const rect=e=>e.getBoundingClientRect(),panel=rect(document.getElementById('book-practice')),box=document.getElementById('book-worked'),list=box.querySelector('.arithmetic-explanation-lines');
  const controls=[...document.querySelectorAll('#book-practice button, #book-practice select')].filter(e=>e.offsetParent);
  return {overflow:document.documentElement.scrollWidth>innerWidth,inside:rect(box).left>=panel.left-.5&&rect(box).right<=panel.right+.5,
   listFits:list.scrollWidth<=list.clientWidth+1,controls:controls.length>=4&&controls.some(e=>e.tagName==='SELECT')&&controls.some(e=>e.textContent==='Start new book session'),
   small:controls.filter(e=>{const r=rect(e);return r.width<44||r.height<44;}).map(e=>`${e.tagName} ${e.textContent.trim().slice(0,30)} ${rect(e).width}x${rect(e).height}`)};
 });
}
const fits={overflow:false,inside:true,listFits:true,controls:true,small:[]};

test('every chapter 8 lesson explains its place value after completion, survives reload and clears on Next',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page,'football');const untouched=await others(page);await chapter(page,8);
 const skills=new Set();
 for(let i=0;i<24;i++){
  const {q,expected}=await complete(page,{miss:i%5===0});skills.add(q.skillId);
  expect(expected.kind).toBe('columns');
  if(i%6===0){await page.reload();await expect(page.locator('#book-worked')).toBeVisible();expect(await lines(page)).toEqual(expected.lines);}
  if(['two-digit-carry','tens-minus-digit','missing-addend','three-addends'].includes(q.skillId)){
   expect(await geometry(page),q.skillId).toEqual(fits);
   await page.screenshot({path:test.info().outputPath(`book-${q.skillId}.png`)});
  }
  await next(page);
 }
 for(const id of ['missing-addend','complete-ten','three-addends','two-digit-carry','tens-minus-digit','two-digit-subtract'])expect(skills.has(id),id).toBe(true);
 expect(await others(page)).toEqual(untouched);expect(errors).toEqual([]);
});

test('chapter 5 in Just arithmetic shows steps for repeated subtraction and a worked answer for comparisons',async({page})=>{
 await boot(page,'plain');const untouched=await others(page);await chapter(page,5);
 const kinds={};
 for(let i=0;i<10;i++){
  const {q,expected}=await complete(page,{miss:i===2});kinds[q.skillId]=expected.kind;
  if(q.skillId==='repeated-subtraction'){expect(expected.lines).toHaveLength(2);expect(await geometry(page)).toEqual(fits);await page.screenshot({path:test.info().outputPath('book-repeated-subtraction.png')});}
  await next(page);
 }
 expect(kinds['repeated-subtraction']).toBe('steps');expect(kinds['compare-facts']).toBe('text');expect(kinds['word-problems']).toBe('columns');expect(kinds['facts-10']).toBe('columns');
 expect(await others(page)).toEqual(untouched);
});

test('shapes, fractions, measurement, graphs and coins keep concept-specific worked answers without columns',async({page})=>{
 await boot(page,'football');
 for(const value of [6,7,9,10]){
  await chapter(page,value);
  for(let i=0;i<3;i++){
   const {q,expected}=await complete(page,{miss:i===1});
   expect(expected).toEqual({kind:'text',heading:'Worked answer',lines:[q.help,`Answer: ${q.answer}.`]});
   if(q.visual)await expect(page.locator('#book-practice .book-visual svg')).toBeVisible();
   if(i===0){expect(await geometry(page)).toEqual(fits);await page.screenshot({path:test.info().outputPath(`book-chapter-${value}.png`)});}
   await next(page);
  }
 }
});

test('a fresh unseeded whole-book session restores a completed worked answer and clears it on restart',async({page})=>{
 await boot(page,'plain');const first=await snapshot(page);expect(first.completed).toBe(0);
 const {expected}=await complete(page);expect(await geometry(page)).toEqual(fits);
 await chooseOptions(page,{focus:'mixed'},{tap:true});await expect(page.locator('#book-worked')).toBeHidden();
 await chooseOptions(page,{focus:'book'},{tap:true});await expect(page.locator('#book-worked')).toBeVisible();expect(await lines(page)).toEqual(expected.lines);
 await chooseOptions(page,{presentation:'football'},{tap:true});await expect(page.locator('#book-practice .book-drive')).toBeVisible();expect(await lines(page)).toEqual(expected.lines);
 await page.reload();expect(await lines(page)).toEqual(expected.lines);
 await page.getByRole('button',{name:'Start new book session'}).tap();await expect.poll(async()=>(await snapshot(page)).done).toBe(false);
 await expectNoWorked(page);expect((await snapshot(page)).completed).toBe(1);
});
