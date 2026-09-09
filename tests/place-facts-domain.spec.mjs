import test from 'node:test';
import assert from 'node:assert/strict';
import '../place-value-practice/fact-practice-domain.js';
const A=globalThis.PLACE_FACTS;
const copy=s=>JSON.parse(JSON.stringify(s));
const finish=(s,ms=null)=>A.answer(s,s.attempt.id,A.byId[s.attempt.factId].answer,ms);
const advance=s=>s.session.completed>=s.session.target?A.restart(s,10):A.next(s,s.attempt.id);

test('report exposure persists lost independent eligibility without wrong or helped evidence',()=>{
 let s=A.create();const id=s.attempt.id;assert.equal(s.attempt.factId,'sub:7:5');assert.equal(s.attempt.eligible,true);
 assert.equal(A.reportOpened(s,id+1),false);assert.equal(A.reportOpened(s,id),true);
 assert.equal(s.attempt.eligible,false);assert.equal(s.attempt.firstMs,null);assert.equal(s.attempt.misses,0);assert.equal(s.attempt.helped,false);
 s=A.normalize(copy(s));assert.ok(s);finish(s,1000);
 assert.equal(s.facts['sub:7:5'].checks,0);assert.equal(s.session.firstTry,1);assert.equal(s.session.helped,0);
 assert.equal(A.reportOpened(s,id),false);
});

test('catalog exhaustively contains 55 connected families and exactly 200 directional facts',()=>{
 assert.equal(A.families.length,55);assert.equal(A.catalog.length,200);
 assert.equal(A.catalog.filter(f=>f.op==='add').length,100);assert.equal(A.catalog.filter(f=>f.op==='sub').length,100);
 for(let x=0;x<10;x++)for(let y=0;y<10;y++){
  assert.equal(A.byId[`add:${x}:${y}`].answer,x+y);assert.equal(A.byId[`sub:${x+y}:${x}`].answer,y);
  assert.equal(A.byId[`add:${x}:${y}`].family,A.byId[`sub:${x+y}:${x}`].family);
 }
 assert.equal(A.byId['sub:7:5'].answer,2);assert.equal(A.byId['add:7:6'].answer,13);
 assert.match(A.help(A.byId['add:7:6']),/7 \+ 3 = 10, then 10 \+ 3 = 13/);
 assert.match(A.help(A.byId['sub:7:5']),/5 \+ 2 = 7/);
});

test('first correct is baseline check one; connected equations receive no cross-credit',()=>{
 const s=A.create();assert.equal(s.attempt.factId,'sub:7:5');finish(s,1000);
 assert.equal(s.facts['sub:7:5'].checks,1);
 for(const id of ['sub:7:2','add:2:5','add:5:2'])assert.equal(s.facts[id].checks,0);
 assert.equal(A.report(s).rows.find(r=>r.id==='sub:7:5').quick,false);
 const restored=A.normalize(copy(s));assert.deepEqual(restored,s);advance(restored);assert.equal(restored.attempt.factId,'add:7:6');
});

test('miss creates durable exact retry before completion; help and restart preserve intent without advancing serial',()=>{
 let s=A.create();const id=s.attempt.id,fid=s.attempt.factId,f=A.byId[fid];
 A.answer(s,id,3,9000);assert.equal(s.serial,0);assert.equal(s.facts[fid].ticket.kind,'retry');
 s=A.normalize(copy(s));assert.equal(s.attempt.misses,1);assert.equal(s.attempt.firstMs,null);
 assert.equal(A.show(s,id),true);assert.equal(s.attempt.firstMs,null);assert.equal(s.families[f.family].exposedAt,A.other(s,f.family));
 assert.equal(A.restart(s,5),true);assert.equal(s.serial,0);assert.equal(s.facts[fid].ticket.kind,'retry');
 for(let i=0;i<2;i++){assert.notEqual(A.byId[s.attempt.factId].family,f.family);finish(s);advance(s);}
 assert.ok(A.other(s,f.family)>=2);
 let returned=false;for(let i=0;i<12;i++){if(s.attempt.factId===fid){returned=true;assert.ok(A.other(s,f.family)>=2);break;}finish(s);advance(s);}
 assert.ok(returned);finish(s);assert.ok(A.normalize(copy(s)));
});

test('restore rejects impossible first-response evidence and drops unfinished timing only',()=>{
 const impossible=A.create();impossible.attempt.firstCorrect=false;
 assert.equal(A.normalize(copy(impossible)),null);
 let s=A.create();const fid=s.attempt.factId;A.answer(s,s.attempt.id,3,9000);
 const ticket=copy(s.facts[fid].ticket);s=A.normalize(copy(s));assert.ok(s);
 assert.equal(s.attempt.firstMs,null);assert.equal(s.attempt.misses,1);assert.equal(s.attempt.helped,false);
 assert.deepEqual(s.facts[fid].ticket,ticket);finish(s,1000);
 assert.equal(s.facts[fid].history.at(-1).ms,null);assert.equal(s.facts[fid].history.at(-1).outcome,'retry');
 assert.equal(s.facts[fid].checks,0);assert.ok(A.normalize(copy(s)));
});

test('report identifies warm retries and checked facts awaiting another try as practiced',()=>{
 const s=A.create(),fid=s.attempt.factId;finish(s,1000);
 s.attempt={...s.attempt,complete:false,misses:0,helped:false,firstCorrect:null,firstMs:null,eligible:false};
 A.answer(s,s.attempt.id,3);let row=A.report(s).rows.find(r=>r.id===fid);
 assert.equal(row.practiced,true);assert.equal(row.needsPractice,true);assert.equal(row.checks,1);
 const warm=A.create();warm.attempt.eligible=false;finish(warm);
 row=A.report(warm).rows.find(r=>r.id===warm.attempt.factId);
 assert.equal(row.practiced,true);assert.equal(row.needsPractice,false);assert.equal(row.checks,0);
 assert.equal(A.report(warm).rows.filter(r=>r.practiced).length,1);
});

test('exact-once completion, invalid answers, shown acknowledgement, and restored evidence',()=>{
 const s=A.create(),id=s.attempt.id;
 for(const bad of [null,undefined,'2',NaN,-1,19,1.2])assert.equal(A.answer(s,id,bad),false);
 assert.equal(s.serial,0);assert.equal(A.answer(s,id+1,2),false);
 A.answer(s,id,3);A.answer(s,id,4);assert.equal(s.attempt.helped,true);
 finish(s);assert.equal(s.facts['sub:7:5'].history[0].outcome,'shown');assert.equal(s.facts['sub:7:5'].checks,0);
 const done=copy(s);assert.equal(finish(s),false);assert.deepEqual(s,done);
 assert.equal(A.next(s,id),true);assert.equal(A.next(s,id),false);assert.deepEqual(A.normalize(copy(s)),s);
});

test('four-slot rhythm reserves spaced service even with retry backlog and has explicit fallbacks',()=>{
 const s=A.create();
 // Scheduler fixtures are deliberately synthetic, independent of persistence validation.
 s.serial=102;
 for(const f of A.catalog)s.families[f.family].exposedAt=null;
 for(const f of A.catalog)s.facts[f.id].ticket={kind:'retry',dueOther:0,created:0};
 s.facts['add:7:6'].ticket={kind:'spaced',dueOther:0,created:90};
 assert.equal(A.select(s).fact.id,'add:7:6');assert.equal(A.select(s).diagnostics.queue,'spaced');
 s.serial=101;assert.equal(A.select(s).diagnostics.queue,'retry');
 for(const f of A.catalog)s.facts[f.id].ticket=null;
 assert.equal(A.select(s).diagnostics.queue,'coverage');
 for(const id of A.families)s.families[id].exposedAt=s.serial;
 assert.ok(A.select(s).diagnostics.relaxed.includes('family-avoidance'));
 for(const f of A.catalog){s.facts[f.id].seen=1;s.facts[f.id].lastSeen=100;}
 s.facts['sub:9:3'].lastSeen=0;
 assert.ok(A.select(s).diagnostics.relaxed.includes('operation-balance'));
});

test('coverage cannot starve under all-wrong backlog; histories, tickets and serialization stay bounded',()=>{
 let s=A.create(),seen=new Set(),prior=null;
 for(let i=0;i<1600;i++){
  const q=s.attempt,f=A.byId[q.factId];seen.add(q.factId);assert.notEqual(f.family,prior);prior=f.family;
  A.show(s,q.id);finish(s);assert.equal(s.facts[q.factId].checks,0);
  if(i%20===0){const normalized=A.normalize(copy(s));assert.ok(normalized,`normalize completion ${i}`);s=normalized;}
  advance(s);
 }
 assert.equal(seen.size,200);
 assert.ok(Object.values(s.facts).every(r=>r.history.length<=12));
 assert.ok(JSON.stringify(s).length<260000);
});

test('eligible repeated checks are family-spaced and timing changes spacing only after three checks',()=>{
 const s=A.create();const fid=s.attempt.factId;let repeated=0;
 for(let i=0;i<1500&&repeated<4;i++){
  const q=s.attempt,f=A.byId[q.factId],r=s.facts[q.factId],before=r.checks;
  if(q.factId===fid&&q.eligible){repeated++;finish(s,repeated===1?1000:9000);
   const interval=r.ticket.dueOther-A.other(s,f.family);
   assert.equal(interval,repeated===1?8:24); // one slow check cannot shorten interval 24; two of three retain 24 instead of 60.
  }else finish(s,1000);
  if(before&&q.eligible){const old=r.history.slice(0,-1).filter(h=>h.eligible).at(-1);if(old)assert.ok(s.serial-old.serial>=6);}
  advance(s);
 }
 assert.equal(repeated,4);
 const row=A.report(s).rows.find(r=>r.id===fid);assert.equal(row.quick,false);assert.equal(row.checks,4);
});

test('timing samples enforce bounds, rounding, help exclusions and per-fact thresholds',()=>{
 for(const ms of [-1,0,299,301,60001,NaN,Infinity]){const s=A.create();finish(s,ms);assert.equal(s.facts[s.attempt.factId].history[0].ms,null);}
 for(const ms of [300,8000,60000]){const s=A.create();finish(s,ms);assert.equal(s.facts[s.attempt.factId].history[0].ms,ms);}
 assert.equal(A.threshold(A.byId['sub:7:5']),8000);assert.equal(A.threshold(A.byId['add:7:6']),10000);
 const s=A.create();A.show(s,s.attempt.id);finish(s,1000);assert.equal(s.facts[s.attempt.factId].history[0].ms,null);
});

test('strict saves reject malformed counters, IDs, history, ticket and attempt fields; strip unknown fields',()=>{
 const s=A.create();finish(s,1000);
 const bad=[r=>r.schemaVersion=2,r=>r.serial=-1,r=>r.serial=A.LIMIT,r=>r.nonce=0,r=>r.coverageCursor=200,
  r=>r.attempt.factId='add:99:1',r=>r.attempt.misses=100,r=>r.attempt.firstMs=1,r=>r.attempt.complete=false,
  r=>r.facts['sub:7:5'].history[0].serial=2,r=>r.facts['sub:7:5'].history[0].outcome='mastered',
  r=>r.facts['sub:7:5'].ticket.kind='invented',r=>r.facts['sub:7:5'].ticket.dueOther=A.LIMIT,
  r=>r.families['family:2:5:7'].completed=0,r=>r.session.firstTry=3];
 for(const mutate of bad){const r=copy(s);mutate(r);assert.equal(A.normalize(r),null,String(mutate));}
 const extra=copy(s);extra.name='private';extra.attempt.answer=9;extra.facts['sub:7:5'].note='strip';assert.deepEqual(A.normalize(extra),s);
});

test('deterministic schedules and session-final due tickets persist across restart',()=>{
 let a=A.create(5),b=A.create(5);
 for(let i=0;i<300;i++){
  assert.deepEqual(a,b);if(i%5===0){A.show(a,a.attempt.id);A.show(b,b.attempt.id);}
  finish(a);finish(b);b=A.normalize(copy(b));assert.ok(b);advance(a);advance(b);
 }
 const s=A.create(5);finish(s);advance(s);finish(s);advance(s);
 const target=s.attempt.factId;A.show(s,s.attempt.id);finish(s);advance(s);finish(s);advance(s);finish(s);
 const restored=A.normalize(copy(s));assert.ok(restored);assert.ok(restored.facts[target].ticket);assert.equal(restored.session.completed,5);
 A.restart(restored,5);assert.equal(restored.serial,5);
});

test('make-ten support exposes its related within-ten family and numeric exhaustion cannot overflow',()=>{
 const s=A.create();finish(s);advance(s);assert.equal(s.attempt.factId,'add:7:6');A.show(s,s.attempt.id);
 assert.equal(s.families['family:3:7:10'].exposedAt,A.other(s,'family:3:7:10'));assert.ok(A.normalize(copy(s)));
 const full=copy(s);full.serial=A.LIMIT-60;const before=copy(full);assert.equal(finish(full),false);assert.deepEqual(full,before);
 full.nonce=A.LIMIT;assert.equal(A.restart(full,10),false);
});
