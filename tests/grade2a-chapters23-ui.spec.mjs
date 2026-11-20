// Issue #223: Grade 2-A Chapters 2-3 in Place by Place Book topics, by touch.
// Covers the new pictures (unsolved, after a miss, worked) on every project,
// legacy schema-1 restoration, a retained retry across a lowered page and a
// reload, a second tab with a different frame, and front-matter gates.
// Evidence: screenshots and an environment record under
// tests/artifacts.nosync/issue223/<project>/. Engine emulation only.
import fs from 'node:fs';
import path from 'node:path';
import {footballMuteTest as test,expect} from './curriculum-fixture.mjs';
const KEY_2A='math-curriculum:progress:grade2a:v1',BOOK_2A='place-value-practice:book:grade2a:v1',BOOK_KEY='math-curriculum:selected-book:v1';
const legacy=JSON.parse(fs.readFileSync('tests/fixtures/grade2a223-legacy.json','utf8'));
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const dialog=page=>page.locator('.curriculum-dialog');
async function report(page,book,value){
 await expect(dialog(page)).toBeVisible();
 if(book)await dialog(page).getByRole('radio',{name:`Grade ${book}`,exact:true}).tap();
 if(value!==undefined)await page.locator('#curriculum-page').fill(String(value));
 await page.locator('#curriculum-submit').tap();
 const confirm=page.getByRole('button',{name:'Confirm page',exact:true});
 if(await confirm.isVisible())await confirm.tap();
 await expect(dialog(page)).toHaveCount(0);
}
const record=page=>({schemaVersion:1,worktext:'Math Mammoth Grade 2-A',edition:'rev-2025-09-06',completedThroughPage:page,revision:1,updatedAt:'2026-11-19T12:00:00.000Z',provenance:'learner-reported'});
// Seed modes once per tab; optionally a Grade 2-A record and a saved Book run.
async function bookBoot(page,{progress=null,book=null}={}){
 await page.addInitScript(({progress,book,keys})=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');
  localStorage.setItem('place-value-practice:mode:v1','arithmetic');localStorage.setItem('place-value-practice:arithmetic-mode:v1','book');localStorage.setItem('place-value-practice:presentation:v1','football');
  if(progress){localStorage.setItem(keys.progress,JSON.stringify(progress));localStorage.setItem(keys.selected,'2-A');}
  if(book)localStorage.setItem(keys.book,JSON.stringify(book));},{progress,book,keys:{progress:KEY_2A,book:BOOK_2A,selected:BOOK_KEY}});
 await page.goto('/place-value-practice/');
}
const current=page=>page.evaluate(()=>PLACE_BOOK_2A.current(__bookTest.snapshot2a()));
const snap=page=>page.evaluate(()=>__bookTest.snapshot2a());
const raw=page=>page.evaluate(k=>localStorage.getItem(k),BOOK_2A);
const choice=(page,value)=>page.locator('#book-practice .arithmetic-answer').filter({hasText:new RegExp(`^${escape(value)}$`)});
// The native Topic select itself; a label match can also hit the choices group
// when the empty-topic prompt mentions "topic".
const topicSelect=page=>page.locator('#book-practice select');
async function topic(page,label,value){await topicSelect(page).selectOption({label});await report(page,undefined,value);}
async function layout(page){
 return page.evaluate(()=>{const controls=[...document.querySelectorAll('#book-practice button, #book-practice select')].filter(e=>e.offsetParent);
  return {overflow:document.documentElement.scrollWidth>innerWidth,small:controls.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).map(e=>`${e.tagName} ${e.textContent.trim().slice(0,24)}`)};});
}
async function solve(page,q){await choice(page,q.answer).tap();await expect(page.locator('#book-practice')).toContainText('Correct!');}
async function next(page){await page.locator('#book-practice').getByRole('button',{name:'Next',exact:true}).tap();await expect(page.locator('#book-worked')).toBeHidden();}

const TARGETS=[['Review—Whole and Half Hours','clock'],['The Minutes','clock-set'],['How Many Hours Pass?','day-strip'],['The Calendar: Weekdays and Months','calendar'],
 ['Review: Completing the Next Ten','number-line'],['Review: Going Over Ten','ten-frames'],['Number Rainbows for 11 and 12','rainbow'],['Adding with 7','io-table'],
 ['Review—Facts with 6, 7, and 8','add-table'],['Fact Families for 11','groups'],['Fact Families for 17 and 18','packages'],['Review Chapter 3','code-key']];
// Pictures whose description is itself the reading task.
const READING=new Set(['code-key','number-line','groups','ten-frames']);

test('Chapters 2-3 pictures render unsolved, help, and worked by touch with readable layout',async({page,browser},info)=>{
 test.setTimeout(360000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const dir=path.join('tests','artifacts.nosync','issue223',info.project.name);fs.mkdirSync(dir,{recursive:true});
 await bookBoot(page);await report(page,'2-A',97);
 const env=await page.evaluate(()=>({userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},devicePixelRatio:devicePixelRatio,maxTouchPoints:navigator.maxTouchPoints}));
 fs.writeFileSync(path.join(dir,'environment.json'),JSON.stringify({engine:browser.browserType().name(),engineVersion:browser.version(),project:info.project.name,
  isMobile:info.project.use.isMobile,hasTouch:info.project.use.hasTouch,...env,limitations:'Playwright engine emulation; not Apple Simulator or a physical device.'},null,2)+'\n');
 // The topic list groups Chapters 1-3 lessons; Chapter 4 never appears.
 const groups=await page.locator('#book-practice select optgroup').evaluateAll(g=>g.map(x=>x.label));
 expect(groups).toEqual(['Chapter 1','Chapter 2: Clock','Chapter 3: Facts within 0-18']);
 expect(await page.locator('#book-practice select option').count()).toBe(38);
 for(const [label,kind] of TARGETS){
  await topic(page,label);
  let captured=false;
  for(let i=0;i<40&&!captured;i++){
   const q=await current(page);
   await expect(page.locator('#book-question')).toHaveText(q.prompt);
   if(q.visual?.kind!==kind){await solve(page,q);await next(page);continue;}
   const svg=page.locator('#book-practice .book-visual svg');await expect(svg).toBeVisible();
   const aria=await svg.getAttribute('aria-label');
   const fullRainbow=kind==='rainbow'&&q.visual.hidden===null;
   if(!READING.has(kind)&&!fullRainbow&&!/^Clock [ABC]$/.test(q.answer)&&!/^\d+$/.test(q.answer))expect(aria).not.toContain(q.answer);
   if(['io-table','add-table'].includes(kind))expect(aria).toMatch(/empty/);
   const box=await svg.boundingBox();expect(box.width).toBeGreaterThan(180);
   expect(await layout(page)).toEqual({overflow:false,small:[]});
   await page.screenshot({path:path.join(dir,`${kind}-1-unsolved.png`)});
   await choice(page,q.choices.find(x=>x!==q.answer)).tap();
   await expect(page.locator('#book-practice')).toContainText(q.help);
   await expect(choice(page,q.choices.find(x=>x!==q.answer))).toBeDisabled();
   await page.screenshot({path:path.join(dir,`${kind}-2-help.png`)});
   await solve(page,q);await expect(page.locator('#book-worked')).toBeVisible();
   expect(await layout(page)).toEqual({overflow:false,small:[]});
   await page.locator('#book-worked').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(dir,`${kind}-3-worked.png`)});
   await next(page);captured=true;
  }
  expect(captured,`${label}: ${kind}`).toBe(true);
 }
 expect((await snap(page)).catalogThrough).toBe(97);
 expect(errors).toEqual([]);
});

test('a released schema-1 run restores exactly on Chapter 1 and opts into Chapters 2-3 only at a new session',async({page},info)=>{
 test.skip(!['ipad-11-landscape','iphone-15-portrait'].includes(info.project.name),'State flow once per device class');
 const sample=legacy.pending.find(p=>p.page===97);
 await bookBoot(page,{progress:record(97),book:sample.state});await report(page);
 const panel=page.locator('#book-practice');
 await expect(panel).toContainText('Chapter 1 practice only in this saved session');
 expect(await current(page)).toEqual(sample.question);
 await expect(choice(page,sample.state.misses[0])).toBeDisabled();
 for(let i=0;i<3;i++){const q=await current(page);expect(q.page).toBeLessThanOrEqual(32);await solve(page,q);await next(page);}
 let saved=JSON.parse(await raw(page));expect(saved).toMatchObject({schemaVersion:2,catalogThrough:32,page:97,completed:12});
 // Reload at the same page keeps the legacy frame.
 await page.reload();await report(page);expect((await snap(page)).catalogThrough).toBe(32);
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page);
 expect((await snap(page)).catalogThrough).toBe(97);
 await expect(panel).not.toContainText('Chapter 1 practice only');
 let later=false;
 for(let i=0;i<40&&!later;i++){const q=await current(page);later=q.page>32;if(later)break;await solve(page,q);await next(page);}
 expect(later).toBe(true);
 saved=JSON.parse(await raw(page));expect(saved.catalogThrough).toBe(97);expect(saved.history.length).toBeGreaterThan(9);
});

test('lowering the page retains a missed retry through a reload and resumes it exactly when raised',async({page},info)=>{
 test.skip(!['ipad-11-landscape','iphone-15-portrait'].includes(info.project.name),'State flow once per device class');
 await bookBoot(page,{progress:record(97)});await report(page);
 const panel=page.locator('#book-practice');
 await topic(page,'Fact Family for 15');
 const missed=await current(page),wrong=missed.choices.find(x=>x!==missed.answer);
 expect(missed.page).toBeGreaterThanOrEqual(87);
 await choice(page,wrong).tap();await expect(panel).toContainText(missed.help);
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,60);
 let s=await snap(page);expect(s.page).toBe(60);expect(s.retained).toHaveLength(1);
 await expect(page.locator('#book-question')).toHaveText('No completed Grade 2-A lessons in this topic yet. Lessons start on printed page 10.');
 await topic(page,'All completed lessons');
 for(let i=0;i<4;i++){const q=await current(page);expect(q.page).toBeLessThanOrEqual(60);await solve(page,q);await next(page);}
 await page.reload();await report(page);
 s=await snap(page);expect(s.page).toBe(60);expect(s.retained).toHaveLength(1);
 // Finish the current question, then raise the page: the exact retry returns with its miss.
 await solve(page,await current(page));
 const completed=(await snap(page)).completed;
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,97);
 const back=await current(page);expect(back).toEqual(missed);
 await expect(choice(page,wrong)).toBeDisabled();await expect(panel).toContainText(missed.help);
 await solve(page,back);await choice(page,back.answer).tap({force:true}).catch(()=>{});
 s=await snap(page);expect(s.completed).toBe(completed+1);expect(s.retained).toHaveLength(0);
});

test('a second tab with a different page or topic never replaces this tab\'s frozen session or the other save',async({page,context},info)=>{
 test.skip(!['ipad-11-landscape','iphone-15-portrait'].includes(info.project.name),'Cross-tab flow once per device class');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await bookBoot(page,{progress:record(37)});await report(page);
 await topic(page,'Review—Whole and Half Hours');
 const a1=await current(page);expect(a1.lesson).toBe(11);
 const other=await context.newPage();await bookBoot(other);await report(other,'2-A',97);
 await topic(other,'Fact Families for 17 and 18');
 const b1=await current(other);expect(b1.lesson).toBe(35);
 await choice(other,b1.choices.find(x=>x!==b1.answer)).tap();await expect(other.locator('#book-practice')).toContainText(b1.help);
 const otherBytes=await raw(other);
 // Tab A acts next: it keeps its own frame, shows a notice, and leaves B's bytes alone.
 await choice(page,a1.answer).tap();
 await expect(page.locator('#book-practice')).toContainText('Another tab saved a book session with a different page or topic');
 expect(await current(page)).toEqual(a1);
 await expect(topicSelect(page)).toHaveValue('11');
 expect(await page.evaluate(()=>CURRICULUM_UI.current().grade2a.completedThroughPage)).toBe(37);
 expect(await raw(page)).toBe(otherBytes);
 // Continuing in A stays in memory on A's frame.
 await solve(page,a1);await next(page);
 const a2=await current(page);expect(a2.lesson).toBe(11);expect(a2.page).toBeLessThanOrEqual(37);
 expect(await raw(page)).toBe(otherBytes);
 // Only an explicit new session in A adopts the saved run; B's missed retry is retained, not lost.
 await page.locator('#book-practice').getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,37);
 const saved=JSON.parse(await raw(page));
 expect(saved).toMatchObject({schemaVersion:2,page:37,lesson:11,catalogThrough:97});
 expect(saved.retained).toEqual([expect.objectContaining({skillId:b1.skillId,misses:[b1.choices.find(x=>x!==b1.answer)]})]);
 expect((await current(page)).lesson).toBe(11);
 expect(errors).toEqual([]);
});

test('front matter and page 98+ unlock nothing new; lesson topics open exactly at their first page',async({page},info)=>{
 test.skip(!['ipad-11-landscape','iphone-15-portrait'].includes(info.project.name),'Gate flow once per device class');
 await bookBoot(page,{progress:record(36)});await report(page);
 const panel=page.locator('#book-practice'),empty='No completed Grade 2-A lessons in this topic yet. Lessons start on printed page 10.';
 await topic(page,'Review—Whole and Half Hours');await expect(page.locator('#book-question')).toHaveText(empty);
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,37);
 expect((await current(page)).skillId).toBe('2a-clock-whole-half');
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,58);
 await topic(page,'Review: Completing the Next Ten');await expect(page.locator('#book-question')).toHaveText(empty);
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,59);
 expect((await current(page)).page).toBe(59);
 await topic(page,'All completed lessons',161);
 await expect(panel).toContainText('practice covers Chapters 1-3 (through page 97)');
 for(let i=0;i<6;i++){const q=await current(page);expect(q.page).toBeLessThanOrEqual(97);await solve(page,q);await next(page);}
});
