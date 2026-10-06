// Addition & subtraction and Book topics show the full stadium drive, not a thin strip, on every device.
// The field only projects each lane's own saved yards; Plain hides it without changing any saved practice.
import {test,expect} from './curriculum-fixture.mjs';
import {chooseOptions} from './place-practice-nav.mjs';
const MODE='place-value-practice:mode:v1',SUB='place-value-practice:arithmetic-mode:v1',SHOW='place-value-practice:presentation:v1';
const MIXED='place-value-practice:arithmetic:v1',BOOK='place-value-practice:book:v1',FACTS='place-value-practice:facts:v1',PLACE='place-value-practice:progress:v1';
const STORES=[MIXED,BOOK,FACTS,PLACE];
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const stores=page=>page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),STORES);
const semantic=async page=>JSON.parse(await page.evaluate(()=>render_game_to_text()));
// Saved progress is produced by the lane's own domain rules, then loaded by a real reload.
async function open(page,focus,seed){
 await page.goto('/place-value-practice/');
 await page.evaluate(([focus,keys])=>{localStorage.clear();localStorage.setItem(keys.MODE,'arithmetic');localStorage.setItem(keys.SUB,focus);localStorage.setItem(keys.SHOW,'football');},[focus,{MODE,SUB,SHOW}]);
 if(seed)expect(await page.evaluate(seed)).toBe(99);
 await page.reload();
}
// 19 first-try answers and 4 after a miss: 95 + 4 = 99 Mixed yards.
const seedMixed=()=>{
 const api=PLACE_ARITHMETIC;api.configure(187);const m=api.repair(api.create(null));
 const right=()=>m.question.choices.find(v=>{const t=JSON.parse(JSON.stringify(m));api.answer(t,v);return t.question.complete;});
 for(let i=0;i<23;i++){if(i<4)api.answer(m,m.question.choices.find(v=>v!==right()));api.answer(m,right());api.next(m);}
 localStorage.setItem('place-value-practice:arithmetic:v1',JSON.stringify(m));return m.firstTry*5+m.afterHelp;
};
// Book misses cost up to 5 yards: 19 first tries (95), 4 after a miss (79), 4 first tries (99).
const seedBook=()=>{
 const api=PLACE_BOOK,s=api.create(187);
 for(let i=0;i<27;i++){const q=api.current(s);if(i>=19&&i<23)api.answer(s,q.choices.find(v=>v!==q.answer));api.answer(s,q.answer);api.next(s);}
 localStorage.setItem('place-value-practice:book:v1',JSON.stringify(s));return s.yards;
};
async function art(page,panel){
 const drive=page.locator(`${panel} .practice-field`);await drive.scrollIntoViewIfNeeded();
 for(const img of ['.practice-field-stadium','.practice-field-runner'])await expect.poll(()=>drive.locator(img).evaluate(e=>e.complete&&e.naturalWidth>0)).toBe(true);
}
// The stadium is at least 230px tall, nearly panel-wide, with the stadium art covering it and the runner fully on the field.
const geometry=(page,panel)=>page.evaluate(panel=>{
 const root=document.querySelector(panel),drive=root.querySelector('.practice-field'),r=e=>e.getBoundingClientRect();
 const d=r(drive),p=r(root),stadium=drive.querySelector('.practice-field-stadium'),runner=drive.querySelector('.practice-field-runner'),s=r(stadium),u=r(runner);
 const header=r(drive.querySelector('.practice-field-header')),score=drive.querySelector('.practice-field-score');
 const yards=[...drive.querySelectorAll('.practice-field-yard')].map(r);
 const small=[...root.querySelectorAll('button,select')].filter(e=>e.offsetParent).map(e=>[e.textContent.trim().slice(0,24),r(e)]).filter(([,b])=>b.width<44||b.height<44).map(([t,b])=>`${t} ${b.width}x${b.height}`);
 return {overflow:document.documentElement.scrollWidth>innerWidth,tall:d.height>=230,wide:d.width>=p.width*.85&&d.left>=p.left-.5&&d.right<=p.right+.5,
  stadium:stadium.naturalWidth===2048&&getComputedStyle(stadium).objectFit==='cover'&&s.width>=d.width-1&&s.height>=d.height-1,
  runner:u.height>=60&&u.left>=d.left-.5&&u.right<=d.right+.5&&u.top>=d.top-.5&&u.bottom<=d.bottom+.5,
  header:header.left>=d.left&&header.right<=d.right+.5&&header.bottom<=u.top+1&&parseFloat(getComputedStyle(score).fontSize)>=14,
  yardLines:yards.length===5&&yards.every(y=>y.left>=d.left-.5&&y.right<=d.right+.5&&y.bottom<=d.bottom+.5),small};
},panel);
const fits={overflow:false,tall:true,wide:true,stadium:true,runner:true,header:true,yardLines:true,small:[]};
// The runner moves along the turf: 0 yards starts at its left edge and 99 ends within 1% of its right edge, never past either.
const edge=(page,panel,yards)=>page.locator(`${panel} .practice-field-turf`).evaluate((turf,yards)=>{
 const t=turf.getBoundingClientRect(),u=turf.querySelector('.practice-field-runner').getBoundingClientRect(),left=u.left-t.left,right=t.right-u.right;
 return left>=-.5&&right>=-.5&&(yards===0?left<=1:right<=t.width*.01+1);
},yards);
async function expectDrive(page,panel,yards,text){
 const field=page.locator(panel).getByRole('progressbar',{name:'Touchdown drive'});
 await expect(field).toHaveAttribute('aria-valuenow',String(yards));await expect(page.locator(`${panel} .practice-field-score`)).toHaveText(text);
 await art(page,panel);await expect.poll(()=>geometry(page,panel)).toEqual(fits);
}
async function plainRoundTrip(page,panel,snapshot,text,shot){
 const before={state:await page.evaluate(snapshot),saved:await stores(page)};
 await chooseOptions(page,{presentation:'plain'},{tap:true});
 await expect(page.locator(`${panel} .practice-field`)).toBeHidden();await expect(page.getByRole('progressbar')).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath(`${shot}-plain.png`)});
 await chooseOptions(page,{presentation:'football'},{tap:true});await expect(page.locator(`${panel} .practice-field-score`)).toHaveText(text);
 expect({state:await page.evaluate(snapshot),saved:await stores(page)}).toEqual(before);
}

test('Addition & subtraction shows the full stadium drive and projects only its own yards',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const panel='#arithmetic-practice',snapshot=()=>__arithmeticTest.snapshot();
 await open(page,'mixed',seedMixed);await expectDrive(page,panel,99,'99 / 100 yards · 0 points');
 await expect.poll(()=>edge(page,panel,99)).toBe(true);
 await page.screenshot({path:test.info().outputPath('mixed-99.png')});
 const before=await page.evaluate(snapshot),untouched=await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[BOOK,FACTS,PLACE]);
 const value=await page.evaluate(()=>{const m=__arithmeticTest.snapshot();return m.question.choices.find(v=>{const t=JSON.parse(JSON.stringify(m));PLACE_ARITHMETIC.answer(t,v);return t.question.complete;});});
 await page.locator(`${panel} .arithmetic-answer`).filter({hasText:new RegExp(`^${value}$`)}).tap();
 // A first-try answer crosses 100: the drive restarts at 4 yards and the touchdown shows as 6 points.
 await expectDrive(page,panel,4,'4 / 100 yards · 6 points');
 const after=await page.evaluate(snapshot);expect([after.firstTry,after.afterHelp,after.completed]).toEqual([before.firstTry+1,before.afterHelp,before.completed+1]);
 const worked=await semantic(page);await expect(page.locator('#arithmetic-explanation')).toBeVisible({visible:worked.explanation!==null});
 await page.screenshot({path:test.info().outputPath('mixed-answered.png')});
 await page.locator(`${panel}`).getByRole('button',{name:'Next',exact:true}).tap();
 await expect(page.locator('#arithmetic-explanation')).toBeHidden();await expectDrive(page,panel,4,'4 / 100 yards · 6 points');
 await page.reload();await expectDrive(page,panel,4,'4 / 100 yards · 6 points');
 await plainRoundTrip(page,panel,snapshot,'4 / 100 yards · 6 points','mixed');
 await expectDrive(page,panel,4,'4 / 100 yards · 6 points');
 expect(await page.evaluate(keys=>keys.map(k=>localStorage.getItem(k)),[BOOK,FACTS,PLACE])).toEqual(untouched);expect(errors).toEqual([]);
});

test('Book topics shows the full stadium drive from 0 to 99 yards and keeps its worked answers',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const panel='#book-practice',snapshot=()=>__bookTest.snapshot();
 await open(page,'book');await expectDrive(page,panel,0,'0 / 100 yards · 0 points · 0 completed');
 await expect.poll(()=>edge(page,panel,0)).toBe(true);
 await page.screenshot({path:test.info().outputPath('book-0.png')});
 await open(page,'book',seedBook);await expectDrive(page,panel,99,'99 / 100 yards · 0 points · 27 completed');
 await expect.poll(()=>edge(page,panel,99)).toBe(true);
 const before=await page.evaluate(snapshot),q=await page.evaluate(()=>PLACE_BOOK.current(__bookTest.snapshot()));
 await page.locator(`${panel} .arithmetic-answer`).filter({hasText:new RegExp(`^${escape(q.answer)}$`)}).tap();
 await expect(page.locator(panel)).toContainText('Correct!');
 await expectDrive(page,panel,4,'4 / 100 yards · 6 points · 28 completed');
 const after=await page.evaluate(snapshot);expect([after.yards,after.firstTry,after.history.length]).toEqual([104,before.firstTry+1,before.history.length+1]);
 const expected=await page.evaluate(()=>PLACE_BOOK.explain(__bookTest.snapshot()));
 await expect(page.locator('#book-worked')).toBeVisible();await expect(page.locator('#book-worked h4')).toHaveText(expected.heading);
 await page.screenshot({path:test.info().outputPath('book-answered.png')});
 await page.reload();await expectDrive(page,panel,4,'4 / 100 yards · 6 points · 28 completed');await expect(page.locator('#book-worked')).toBeVisible();
 await plainRoundTrip(page,panel,snapshot,'4 / 100 yards · 6 points · 28 completed','book');
 await expect(page.locator('#book-worked')).toBeVisible();
 await page.locator(panel).getByRole('button',{name:'Next',exact:true}).tap();
 await expect(page.locator('#book-worked')).toBeHidden();await expectDrive(page,panel,4,'4 / 100 yards · 6 points · 28 completed');
 expect(errors).toEqual([]);
});
