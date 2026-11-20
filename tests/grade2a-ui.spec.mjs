// Issue #219: one shared page prompt with a book choice, two separately locked
// records snapshotted per run, Football's profile converter, unchanged Grade
// 1-B coin gates, and the Grade 2-A Whole book lane in Place by Place.
// Every tap uses touch (all projects have hasTouch).
import {footballMuteTest as test,expect} from './curriculum-fixture.mjs';
const KEY_1B='math-curriculum:progress:v1',KEY_2A='math-curriculum:progress:grade2a:v1',BOOK_1B='place-value-practice:book:v1',BOOK_2A='place-value-practice:book:grade2a:v1';
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
const stored=(page,keys)=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),keys);
async function bookBoot(page){
 await page.addInitScript(()=>{if(sessionStorage.getItem('seeded'))return;sessionStorage.setItem('seeded','1');localStorage.setItem('place-value-practice:mode:v1','arithmetic');localStorage.setItem('place-value-practice:arithmetic-mode:v1','book');localStorage.setItem('place-value-practice:presentation:v1','football');});
 await page.goto('/place-value-practice/');
}
async function layout(page){
 return page.evaluate(()=>{const controls=[...document.querySelectorAll('#book-practice button, #book-practice select, .curriculum-dialog button, .curriculum-dialog input')].filter(e=>e.offsetParent);
  return {overflow:document.documentElement.scrollWidth>innerWidth,small:controls.filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).map(e=>`${e.tagName} ${e.textContent.trim().slice(0,24)}`)};});
}

test('the shared prompt keeps two separately locked records; choosing Grade 2-A leaves Grade 1-B untouched',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await bookBoot(page);
 await expect(dialog(page).getByRole('radio',{name:'Grade 1-B',exact:true})).toHaveAttribute('aria-checked','true');
 await expect(page.locator('#curriculum-page')).toHaveValue('113');
 await dialog(page).getByRole('radio',{name:'Grade 2-A',exact:true}).tap();
 await expect(dialog(page)).toContainText('Math Mammoth Grade 2-A');
 await expect(page.locator('#curriculum-page')).toHaveValue('0');
 expect(await layout(page)).toEqual({overflow:false,small:[]});
 await page.screenshot({path:test.info().outputPath('prompt-grade2a.png')});
 await page.locator('#curriculum-page').fill('162');await page.locator('#curriculum-submit').tap();
 await expect(page.locator('#curriculum-error')).toContainText('0 to 161');
 // Entering Chapter 1 from 0 asks for the extra confirmation.
 await page.locator('#curriculum-page').fill('14');await page.locator('#curriculum-submit').tap();
 await expect(page.getByRole('button',{name:'Confirm page',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Confirm page',exact:true}).tap();await expect(dialog(page)).toHaveCount(0);
 const [g1,g2]=await stored(page,[KEY_1B,KEY_2A]);
 expect(g1).toBeNull();
 expect(JSON.parse(g2)).toMatchObject({schemaVersion:1,worktext:'Math Mammoth Grade 2-A',edition:'rev-2025-09-06',completedThroughPage:14,revision:1,provenance:'learner-reported'});
 const current=await page.evaluate(()=>JSON.parse(JSON.stringify(CURRICULUM_UI.current())));
 expect(current).toMatchObject({worktext:'Math Mammoth Grade 1-B',completedThroughPage:113,saved:false,selectedBook:'2-A',grade2a:{completedThroughPage:14,saved:true}});
 // The Grade 2-A lane runs only completed pages.
 await expect(page.locator('#book-practice')).toContainText('Math Mammoth Grade 2-A (2025 revision) · completed through printed page 14');
 const text=JSON.parse(await page.evaluate(()=>render_game_to_text()));
 expect(text.book).toBe('2-A');expect(text.question.page).toBeLessThanOrEqual(14);
 expect(await stored(page,[BOOK_1B])).toEqual([null]);
 expect(errors).toEqual([]);
});

test('Grade 2-A book choices, help after a miss, worked answers, persistence, topics, and a switch back to 1-B',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await bookBoot(page);await report(page,'2-A',14);
 const panel=page.locator('#book-practice');
 const seen=new Set();
 for(let i=0;i<14;i++){
  const q=await page.evaluate(()=>PLACE_BOOK_2A.current(__bookTest.snapshot2a()));seen.add(q.skillId);
  expect(q.page).toBeLessThanOrEqual(14);
  await expect(page.locator('#book-question')).toHaveText(q.prompt);
  if(q.visual)await expect(panel.locator('.book-visual svg')).toBeVisible();
  if(i%3===0){
   const wrong=q.choices.find(x=>x!==q.answer);
   await panel.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${escape(wrong)}$`)}).tap();
   await expect(panel).toContainText(q.help);await expect(page.locator('#book-worked')).toBeHidden();
  }
  await panel.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${escape(q.answer)}$`)}).tap();
  await expect(panel).toContainText('Correct!');await expect(page.locator('#book-worked')).toBeVisible();
  expect(await layout(page)).toEqual({overflow:false,small:[]});
  if(i<3)await page.screenshot({path:test.info().outputPath(`grade2a-${q.skillId}.png`)});
  await panel.getByRole('button',{name:'Next',exact:true}).tap();await expect(page.locator('#book-worked')).toBeHidden();
 }
 expect(seen.size).toBeGreaterThanOrEqual(10);
 const saved=JSON.parse((await stored(page,[BOOK_2A]))[0]);expect(saved.completed).toBe(14);expect(saved.firstTry).toBe(9);
 // Reload: the prompt remembers Grade 2-A and its page; practice resumes from its own store.
 await page.reload();
 await expect(dialog(page).getByRole('radio',{name:'Grade 2-A',exact:true})).toHaveAttribute('aria-checked','true');
 await expect(page.locator('#curriculum-page')).toHaveValue('14');await report(page);
 expect((await page.evaluate(()=>__bookTest.snapshot2a())).completed).toBe(14);
 // A later lesson topic is empty until its page is reported; starting the book unlocks nothing early.
 await panel.getByLabel('Topic').selectOption({label:'Fact Families'});await report(page);
 await expect(page.locator('#book-question')).toHaveText('No completed Grade 2-A lessons in this topic yet. Lessons start on printed page 10.');
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,undefined,16);
 await expect(page.locator('#book-question')).not.toContainText('No completed');
 expect((await page.evaluate(()=>PLACE_BOOK_2A.current(__bookTest.snapshot2a()))).lesson).toBe(3);
 // Switching the prompt back to Grade 1-B returns the 1-B lane and its topics; the 2-A store is unchanged.
 const before2a=(await stored(page,[BOOK_2A]))[0];
 await panel.getByRole('button',{name:'Start new book session',exact:true}).tap();await report(page,'1-B',187);
 await expect(panel).toContainText('Math Mammoth Grade 1-B (2026) · completed through printed page 187');
 await expect(panel.getByLabel('Topic').locator('option')).toHaveText(['All completed lessons','Facts and word problems','Shapes and fractions','Measurement','Adding and subtracting','Graphs','Coins']);
 expect((await stored(page,[BOOK_2A]))[0]).toBe(before2a);
 expect(JSON.parse((await stored(page,[KEY_2A]))[0]).completedThroughPage).toBe(16);
 expect(errors).toEqual([]);
});

test('Football converts both frozen records per game; Grade 2-A never unlocks Grade 1-B coins',async({page},info)=>{
 test.skip(!['ipad-11-landscape','iphone-15-portrait'].includes(info.project.name),'Converter checks once per device class');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/football/');
 const coin=()=>page.evaluate(()=>{const p=contextualQuestionProfile(),meta=FOOTBALL_CONTEXTUAL_QUESTIONS.FAMILY_REGISTRY.scrimmage;
  const status=id=>FOOTBALL_CONTEXTUAL_QUESTIONS.sourceStatus(meta.find(m=>m.familyId===id),p).included;
  return {profile:JSON.parse(JSON.stringify(p.worktexts)),coin:status('coin-count-dimes-pennies'),onesAdd:status('score-total-ch8-ones-add'),within20:status('score-total-ch8-within-20')};});
 await page.locator('#start-game-btn').tap();await report(page,'2-A',14);
 await expect(page.locator('#call-grid')).toBeVisible();
 let seen=await coin();
 expect(seen.profile).toEqual({'Math Mammoth Grade 1-B':{edition:2026,completedThroughPage:113},'Math Mammoth Grade 2-A':{edition:'rev-2025-09-06',completedThroughPage:14}});
 // Baseline 1-B page 113 keeps coins closed; Grade 2-A admits only existing arithmetic families.
 expect(seen.coin).toBe(false);expect(seen.onesAdd).toBe(true);expect(seen.within20).toBe(true);
 // Another tab's later report does not change this game's frozen eligibility.
 await page.evaluate(k=>{const v=JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify({...v,completedThroughPage:30,revision:v.revision+1}));},KEY_2A);
 expect((await coin()).profile['Math Mammoth Grade 2-A'].completedThroughPage).toBe(14);
 expect(errors).toEqual([]);
 // Next game: Grade 1-B 187 reported, then Grade 2-A selected again; coins stay open from 1-B.
 await page.goto('/football/');await page.locator('#start-game-btn').tap();await report(page,'1-B',187);
 await expect(page.locator('#call-grid')).toBeVisible();
 await page.goto('/football/');await page.locator('#start-game-btn').tap();
 await expect(dialog(page).getByRole('radio',{name:'Grade 1-B',exact:true})).toHaveAttribute('aria-checked','true');
 await report(page,'2-A',30);await expect(page.locator('#call-grid')).toBeVisible();
 seen=await coin();
 expect(seen.profile).toEqual({'Math Mammoth Grade 1-B':{edition:2026,completedThroughPage:187},'Math Mammoth Grade 2-A':{edition:'rev-2025-09-06',completedThroughPage:30}});
 expect(seen.coin).toBe(true);
});

// Representative Grade 2-A diagrams through real topic sessions: each kind is
// captured unsolved, after a miss (help), and solved (worked), by touch.
test('Grade 2-A diagrams render unsolved, help, and worked states across topics without revealing answers',async({page})=>{
 test.setTimeout(240000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await bookBoot(page);await report(page,'2-A',32);
 const panel=page.locator('#book-practice'),captured=new Set(),shapes=new Set(),halves=new Set();
 const label=v=>v.kind==='ordinal-row'?(v.balls?'ordinal-balls':'ordinal-letters'):v.kind==='base-ten'?(v.add?'base-ten-add':'base-ten'):v.kind;
 for(const [topic,count] of [['100-chart and More Review',8],['Fact Families',4],['Ordinal Numbers',9],['Even and Odd',6],['Doubling',6],['One-Half',26],['Adding Whole Tens',6],['Subtracting Whole Tens',4],['Chapter 1 Review',10]]){
  // #223 keeps the run's cursor across explicit topic boundaries, so the
  // grouped-halves window starts from a deterministic fresh focused session
  // (production create(32, 7), saved and restored at the same page).
  if(topic==='One-Half'){
   await page.evaluate(k=>localStorage.setItem(k,JSON.stringify(PLACE_BOOK_2A.create(32,7))),BOOK_2A);
   await page.reload();await report(page);
   await expect(panel.getByLabel('Topic')).toHaveValue('7');
  }else{await panel.getByLabel('Topic').selectOption({label:topic});await report(page);}
  for(let i=0;i<count;i++){
   const q=await page.evaluate(()=>PLACE_BOOK_2A.current(__bookTest.snapshot2a()));
   const half=q.prompt.match(/^What is half of (\d+)/);if(half)halves.add(Number(half[1]));
   const svg=panel.locator('.book-visual svg');
   if(q.visual){
    await expect(svg).toBeVisible();
    const aria=await svg.getAttribute('aria-label');
    // The accessible description never states the answer before a response.
    expect(aria).not.toContain(`${q.answer}`.length>2?q.answer:'\u0000');
    if(q.visual.kind==='halves-shape'){expect(aria).not.toMatch(/equal|unequal|half|halves/i);shapes.add(`${q.visual.equal}`);}
    if(q.visual.kind==='chart'||q.visual.kind==='sequence')expect(aria).not.toMatch(new RegExp(`\\b${q.answer}\\b`));
   }
   const kind=q.visual?label(q.visual):null,fresh=kind&&!captured.has(kind);
   if(fresh)await page.screenshot({path:test.info().outputPath(`diagram-${kind}-1-unsolved.png`)});
   expect(await layout(page)).toEqual({overflow:false,small:[]});
   const wrong=q.choices.find(x=>x!==q.answer);
   await panel.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${escape(wrong)}$`)}).tap();
   await expect(panel).toContainText(q.help);
   if(fresh)await page.screenshot({path:test.info().outputPath(`diagram-${kind}-2-help.png`)});
   await panel.locator('.arithmetic-answer').filter({hasText:new RegExp(`^${escape(q.answer)}$`)}).tap();
   await expect(page.locator('#book-worked')).toBeVisible();
   expect(await layout(page)).toEqual({overflow:false,small:[]});
   if(fresh){await page.locator('#book-worked').scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath(`diagram-${kind}-3-worked.png`)});captured.add(kind);}
   await panel.getByRole('button',{name:'Next',exact:true}).tap();await expect(page.locator('#book-worked')).toBeHidden();
  }
 }
 for(const kind of ['chart','sequence','fact-family','ordinal-letters','ordinal-balls','letter-grid','pairs','base-ten','base-ten-add','halves-shape'])expect(captured.has(kind),kind).toBe(true);
 expect([...shapes].sort()).toEqual(['false','true']);
 // A grouped (tens and ones) half such as 48 or 88 is drawn; exact values depend on where the run starts.
 expect([...halves].some(n=>n>30&&n%10!==0),[...halves].join(',')).toBe(true);
 expect(errors).toEqual([]);
});
