import { test, expect } from '@playwright/test';

const FACTS='place-value-practice:facts:v1';
const MIXED='place-value-practice:arithmetic:v1';
const PLACE='place-value-practice:progress:v1';
const remoteVersion='99.0.0';
const isVersion=response=>new URL(response.url()).pathname==='/version.json';
const banner=page=>page.getByText(`Update available: v${remoteVersion}`,{exact:true});

async function boot(page){
 const now=new Date('2026-09-10T12:00:00Z');
 await page.clock.install({time:now});await page.clock.pauseAt(now);
 let remote=null,fail=false;const requests=[];
 await page.route('**/version.json?*',async route=>{
  requests.push(route.request().url());
  if(fail){await route.abort('failed');return;}
  const current=remote??await page.evaluate(()=>GAME_VERSION);
  await route.fulfill({json:{'place-value-practice':current}});
 });
 await page.addInitScript(()=>{
  localStorage.setItem('place-value-practice:mode:v1','arithmetic');
  localStorage.setItem('place-value-practice:arithmetic-mode:v1','facts');
 });
 await page.goto('/place-value-practice/');
 await expect(page.locator('#fact-practice')).toBeVisible();
 return {requests,setRemote:value=>remote=value,setFailure:()=>fail=true};
}
async function checkWith(page,action){
 const response=page.waitForResponse(isVersion);await action();await response;
 // Let the response's JSON promise and the banner mutation settle.
 await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
}
async function startup(page){await checkWith(page,()=>page.clock.runFor(3000));}
async function focus(page){await checkWith(page,()=>page.evaluate(()=>window.dispatchEvent(new Event('focus'))));}
async function savedBytes(page){return page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),[FACTS,MIXED,PLACE]);}

test('startup checks after three seconds and the current version produces no banner',async({page})=>{
 const mock=await boot(page),before=mock.requests.length;
 await page.clock.runFor(2999);expect(mock.requests).toHaveLength(before);
 await checkWith(page,()=>page.clock.runFor(1));expect(mock.requests).toHaveLength(before+1);
 await expect(page.getByRole('button',{name:'Reload',exact:true})).toHaveCount(0);
 expect(new URL(mock.requests.at(-1)).searchParams.has('t')).toBe(true);
});

for(const trigger of ['focus','visibility','interval'])test(`${trigger} detects a changed release without automatically navigating`,async({page})=>{
 const mock=await boot(page);await startup(page);mock.setRemote(remoteVersion);
 const url=page.url();
 if(trigger==='interval')await checkWith(page,()=>page.clock.runFor(297000));
 else{
  await page.clock.runFor(2001);
  if(trigger==='focus')await focus(page);
  else await checkWith(page,()=>page.evaluate(()=>{
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
   document.dispatchEvent(new Event('visibilitychange'));
  }));
 }
 await expect(banner(page)).toBeVisible();expect(page.url()).toBe(url);
 await expect(page.getByRole('button',{name:'Reload',exact:true})).toBeVisible();
});

test('Reload navigates to the offered version and preserves active facts and unrelated saved bytes',async({page})=>{
 const mock=await boot(page);await startup(page);
 await page.evaluate(({FACTS,MIXED,PLACE})=>{
  const a=PLACE_FACTS,s=a.create();
  for(let i=0;i<4;i++){a.answer(s,s.attempt.id,a.byId[s.attempt.factId].answer);a.next(s,s.attempt.id);}
  a.answer(s,s.attempt.id,(a.byId[s.attempt.factId].answer+1)%19);
  localStorage.setItem(FACTS,JSON.stringify(s));
  localStorage.setItem(MIXED,' {"schemaVersion":999,"preserve":"mixed bytes"} ');
  localStorage.setItem(PLACE,' {"schemaVersion":999,"preserve":"place bytes"} ');
 },{FACTS,MIXED,PLACE});
 await page.reload();await expect(page.locator('#fact-practice')).toBeVisible();
 const bytes=await savedBytes(page),progress=await page.evaluate(()=>__factsTest.snapshot());
 expect(progress.attempt.complete).toBe(false);expect(progress.attempt.misses).toBe(1);expect(progress.drive.totalYards).toBe(15);
 mock.setRemote(remoteVersion);await startup(page);await expect(banner(page)).toBeVisible();
 expect(await savedBytes(page)).toEqual(bytes);expect(await page.evaluate(()=>__factsTest.snapshot())).toEqual(progress);
 await page.getByRole('button',{name:'Reload',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('v')===remoteVersion&&/^\d+$/.test(url.searchParams.get('r')||''));
 await expect(page.locator('#fact-practice')).toBeVisible();
 expect(await savedBytes(page)).toEqual(bytes);expect(await page.evaluate(()=>__factsTest.snapshot())).toEqual(progress);
});

test('dismissal persists for the offered release on later checks and page reload',async({page})=>{
 const mock=await boot(page);mock.setRemote(remoteVersion);await startup(page);await expect(banner(page)).toBeVisible();
 await page.getByRole('button',{name:'Dismiss',exact:true}).click();await expect(banner(page)).toHaveCount(0);
 expect(await page.evaluate(version=>sessionStorage.getItem(`updater_dismissed:place-value-practice:${version}`),remoteVersion)).toBe('1');
 await page.clock.runFor(2001);await focus(page);await expect(banner(page)).toHaveCount(0);
 await page.reload();await startup(page);await expect(banner(page)).toHaveCount(0);
});

test('a failed update fetch leaves the fact game playable and does not create a banner',async({page})=>{
 const mock=await boot(page);mock.setFailure();
 const failed=page.waitForEvent('requestfailed',request=>new URL(request.url()).pathname==='/version.json');
 await page.clock.runFor(3000);await failed;
 await expect(page.getByRole('button',{name:'Reload',exact:true})).toHaveCount(0);
 const before=await page.evaluate(()=>__factsTest.snapshot());
 const answer=await page.evaluate(()=>PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
 for(const digit of String(answer))await page.locator('.facts-keypad').getByRole('button',{name:digit,exact:true}).click();
 await page.getByRole('button',{name:'Submit',exact:true}).click();
 await expect(page.locator('#fact-practice')).toHaveAttribute('aria-busy','false');
 const after=await page.evaluate(()=>__factsTest.snapshot());
 expect(after.serial).toBe(before.serial+1);expect(after.drive.totalYards).toBe(before.drive.totalYards+5);
});
