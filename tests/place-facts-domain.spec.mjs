import test from 'node:test';
import assert from 'node:assert/strict';
import '../place-value-practice/fact-practice-domain.js';
const A=globalThis.PLACE_FACTS;
const copy=s=>JSON.parse(JSON.stringify(s));
const finish=(s,ms=null)=>A.answer(s,s.attempt.id,A.byId[s.attempt.factId].answer,ms);
const resolveKick=s=>{if(A.pendingKick(s)){if(s.attempt.kind!=='extraPoint')A.next(s,s.attempt.id);finish(s);}};
const advance=s=>{resolveKick(s);return A.sessionDone(s)?A.restart(s,10):A.next(s,s.attempt.id);};

test('every whole question count from one to one hundred round-trips without schema churn',()=>{
 assert.equal(A.create().session.target,10);
 for(let target=1;target<=100;target++){
  const s=A.create(target);assert.equal(s.schemaVersion,3);assert.equal(s.session.target,target);
  assert.deepEqual(A.normalize(copy(s)),s);finish(s);assert.deepEqual(A.normalize(copy(s)),s);
  const total=s.drive.totalYards,facts=copy(s.facts);assert.equal(A.restart(s,target),true);
  assert.equal(s.session.target,target);assert.equal(s.drive.totalYards,total);
  for(const id of Object.keys(facts))assert.deepEqual(s.facts[id].history,facts[id].history);
 }
 for(const target of [0,-1,101,1.5,NaN,Infinity,'7',null,undefined]){
  const s=A.create(7),before=copy(s);assert.equal(A.restart(s,target),false);assert.deepEqual(s,before);
  assert.equal(A.create(target).session.target,10);const bad=copy(s);bad.session.target=target;assert.equal(A.normalize(bad),null);
 }
 for(const schemaVersion of [1,2])for(const target of [5,10]){const s=A.create(target);s.schemaVersion=schemaVersion;if(schemaVersion===1){delete s.drive;delete s.attempt.rewardSupported;}const restored=A.normalize(s);assert.ok(restored);assert.equal(restored.session.target,target);}
 const full=A.create(100);for(let i=0;i<100;i++){finish(full);if(i<99)assert.equal(advance(full),true);}
 assert.equal(full.session.completed,100);resolveKick(full);assert.equal(A.next(full,full.attempt.id),false);assert.deepEqual(A.normalize(copy(full)),full);
});

test('drive awards exactly once at completion, with independent reward and learning classifications',()=>{
 for(const kind of ['first','warm','miss','voluntary','automatic','report']){
  const s=A.create(),id=s.attempt.id,answer=A.byId[s.attempt.factId].answer;
  if(kind==='warm')s.attempt.eligible=false;
  if(kind==='miss'||kind==='automatic')A.answer(s,id,(answer+1)%19);
  if(kind==='automatic')A.answer(s,id,(answer+2)%19);
  if(kind==='voluntary')A.show(s,id);
  if(kind==='report')A.reportOpened(s,id);
  assert.equal(s.drive.totalYards,0,`${kind}: no pre-completion award`);
  finish(s,1000);const expected=['first','warm'].includes(kind)?5:1;
  assert.equal(s.drive.totalYards,expected,kind);
  const saved=copy(s);assert.equal(finish(s),false);assert.deepEqual(s,saved);
  assert.deepEqual(A.normalize(saved),s);
  assert.equal(s.facts[s.attempt.factId].checks,kind==='first'?1:0);
  if(kind==='report'){assert.equal(s.session.firstTry,1);assert.equal(s.attempt.helped,false);}
  const restored=A.normalize(saved);assert.equal(finish(restored),false);assert.equal(restored.drive.totalYards,expected);
  assert.equal(A.answer(restored,id+1,answer),false);
 }
});

test('drive survives abandonment and sessions; touchdowns derive with overflow and subsequent rewards',()=>{
 let s=A.create(5);
 for(let i=0;i<19;i++){finish(s);advance(s);}
 assert.equal(s.drive.totalYards,95);
 const before=s.drive.totalYards;A.restart(s,5);assert.equal(s.drive.totalYards,before);
 for(let i=0;i<3;i++){A.reportOpened(s,s.attempt.id);finish(s);advance(s);}
 assert.deepEqual(A.drive(s),{totalYards:98,yards:98,touchdowns:0});
 finish(s);assert.deepEqual(A.drive(s),{totalYards:103,yards:3,touchdowns:1});
 s=A.normalize(copy(s));resolveKick(s);A.restart(s,10);
 for(let i=0;i<19;i++){finish(s);advance(s);}
 A.reportOpened(s,s.attempt.id);finish(s);advance(s);A.reportOpened(s,s.attempt.id);finish(s);
 assert.deepEqual(A.drive(s),{totalYards:200,yards:0,touchdowns:2});
 resolveKick(s);const totals=copy(s.drive);A.restart(s,5);assert.deepEqual(s.drive,totals);
});

test('misses persist five-yard setbacks and automatic support never adds a second setback',()=>{
 let s=A.create();for(let i=0;i<4;i++){finish(s);advance(s);}
 const id=s.attempt.id,wrong=(A.byId[s.attempt.factId].answer+1)%19;
 assert.equal(s.drive.totalYards,20);
 A.answer(s,id,wrong);assert.equal(s.drive.totalYards,15);assert.equal(s.attempt.helped,false);
 s=A.normalize(copy(s));assert.ok(s);assert.equal(s.drive.totalYards,15);
 A.answer(s,id,wrong);assert.equal(s.drive.totalYards,10);assert.equal(s.attempt.helped,true);
 const supported=copy(s);assert.equal(A.show(s,id),false);assert.deepEqual(s,supported);
 finish(s);assert.equal(s.drive.totalYards,11);assert.deepEqual(A.normalize(copy(s)),s);
});

test('voluntary help charges once; stale, completed and invalid actions cannot move the drive',()=>{
 let s=A.create();for(let i=0;i<4;i++){finish(s);advance(s);}
 const id=s.attempt.id,before=copy(s);
 assert.equal(A.show(s,id-1),false);assert.equal(A.answer(s,id,19),false);assert.deepEqual(s,before);
 assert.equal(A.show(s,id),true);assert.equal(s.drive.totalYards,15);
 s=A.normalize(copy(s));const shown=copy(s);
 assert.equal(A.show(s,id),false);assert.deepEqual(s,shown);
 finish(s);assert.equal(s.drive.totalYards,16);const done=copy(s);
 assert.equal(A.show(s,id),false);assert.equal(A.answer(s,id,0),false);assert.deepEqual(s,done);
 advance(s);const next=copy(s);assert.equal(A.show(s,id),false);assert.deepEqual(s,next);
 const total=s.drive.totalYards;A.reportOpened(s,s.attempt.id);assert.equal(s.drive.totalYards,total);
 finish(s);assert.equal(s.drive.totalYards,total+1);
});

test('setbacks clamp at the current drive start and preserve every banked touchdown',()=>{
 for(const touchdowns of [0,1,2])for(const action of ['miss','help']){
  let s=A.create();for(let i=0;i<touchdowns*20;i++){finish(s);advance(s);}
  for(let i=0;i<3;i++){A.reportOpened(s,s.attempt.id);finish(s);advance(s);}
  assert.equal(A.drive(s).yards,3);
  if(action==='miss')A.answer(s,s.attempt.id,(A.byId[s.attempt.factId].answer+1)%19);else A.show(s,s.attempt.id);
  assert.deepEqual(A.drive(s),{totalYards:touchdowns*100,yards:0,touchdowns});
  s=A.normalize(copy(s));assert.ok(s);assert.equal(A.drive(s).touchdowns,touchdowns);
  finish(s);assert.deepEqual(A.drive(s),{totalYards:touchdowns*100+1,yards:1,touchdowns});
 }
});

test('schema 1 migration preserves evidence with no retroactive awards and conservative unfinished report exposure',()=>{
 for(const state of ['fresh','warm','miss','shown','complete']){
  const original=A.create();
  if(state==='warm')A.reportOpened(original,original.attempt.id);
  if(state==='miss')A.answer(original,original.attempt.id,3);
  if(state==='shown')A.show(original,original.attempt.id);
  if(state==='complete')finish(original,1000);
  const legacy=copy(original);legacy.schemaVersion=1;delete legacy.drive;delete legacy.attempt.rewardSupported;
  const restored=A.normalize(legacy);assert.ok(restored,state);assert.equal(restored.schemaVersion,3);assert.equal(restored.drive.totalYards,0);
  assert.deepEqual(restored.facts,legacy.facts);assert.deepEqual(restored.families,legacy.families);assert.deepEqual(restored.session,legacy.session);
  if(state==='complete'){assert.equal(finish(restored),false);assert.equal(restored.drive.totalYards,0);}
  else{finish(restored);assert.equal(restored.drive.totalYards,state==='fresh'?5:1);}
  assert.ok(A.normalize(copy(restored)));
 }
});

test('invalid drive metadata repairs alone, future schemas fail closed, and reward totals stay bounded',()=>{
 const s=A.create();finish(s);
 for(const value of [undefined,null,-1,1.5,NaN,Infinity,'5',Number.MAX_SAFE_INTEGER,6]){
  const raw=copy(s);raw.drive={totalYards:value};assert.equal(A.driveNeedsRepair(raw),true);
  const restored=A.normalize(raw);assert.ok(restored);assert.equal(restored.drive.totalYards,0);
  assert.deepEqual(restored.facts,s.facts);assert.deepEqual(restored.session,s.session);
 }
 const missing=copy(s);delete missing.drive;assert.ok(A.normalize(missing));assert.equal(A.driveNeedsRepair(missing),true);
 const future=copy(s);future.schemaVersion=4;assert.equal(A.normalize(future),null);
 const malformedFlag=A.create();delete malformedFlag.attempt.rewardSupported;
 const repaired=A.normalize(malformedFlag);finish(repaired);assert.equal(repaired.drive.totalYards,1);
 const limit=A.create();limit.serial=A.LIMIT-60;limit.drive.totalYards=limit.serial*5;
 assert.equal(finish(limit),false);assert.equal(Number.isSafeInteger(limit.drive.totalYards),true);
});

test('reward totals and report-only reward flag never influence scheduling or learning evidence',()=>{
 const left=A.create(),right=A.create();
 for(let i=0;i<250;i++){
  // Vary only motivational state, then compare all instructional consumers.
  right.drive.totalYards=0;right.attempt.rewardSupported=true;
  assert.deepEqual(A.select(left),A.select(right));
  if(i%7===0){A.show(left,left.attempt.id);A.show(right,right.attempt.id);}
  else if(i%5===0){const wrong=(A.byId[left.attempt.factId].answer+1)%19;A.answer(left,left.attempt.id,wrong,1000);A.answer(right,right.attempt.id,wrong,1000);}
  finish(left,1500);finish(right,1500);
  assert.deepEqual(left.facts,right.facts);assert.deepEqual(left.families,right.families);assert.deepEqual(left.session,right.session);
  assert.deepEqual(A.report(left),A.report(right));assert.equal(left.coverageCursor,right.coverageCursor);
  left.drive={totalYards:0,extraPoints:0,kicksResolved:0};right.drive={totalYards:0,extraPoints:0,kicksResolved:0};advance(left);advance(right);
 }
});

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
 const bad=[r=>r.schemaVersion=4,r=>r.serial=-1,r=>r.serial=A.LIMIT,r=>r.nonce=0,r=>r.coverageCursor=200,
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

const touchdown=()=>{const s=A.create(20);for(let i=0;i<20;i++){finish(s);if(i<19)A.next(s,s.attempt.id);}return s;};
test('a session-final touchdown persists exactly one bonus and blocks restart until it is answered',()=>{
 let s=touchdown();assert.equal(A.score(s),6);assert.equal(A.pendingKick(s),true);assert.equal(A.sessionDone(s),false);
 const td=copy(s);assert.equal(A.restart(s,10),false);assert.deepEqual(s,td);
 s=A.normalize(copy(s));assert.ok(s);const touchdownId=s.attempt.id;
 assert.equal(A.next(s,touchdownId),true);assert.equal(s.attempt.kind,'extraPoint');assert.equal(s.session.completed,20);
 assert.equal(A.next(s,touchdownId),false);assert.equal(A.restart(s,10),false);
 s=A.normalize(copy(s));const kickId=s.attempt.id,fid=s.attempt.factId,serial=s.serial,session=copy(s.session),yards=s.drive.totalYards;
 finish(s,1000);assert.equal(s.attempt.kickResult,'good');assert.equal(A.score(s),7);assert.equal(s.drive.totalYards,yards);assert.equal(s.serial,serial+1);
 assert.equal(s.facts[fid].history.at(-1).serial,s.serial);assert.equal(s.session.completed,session.completed);
 assert.equal(s.session.firstTry,session.firstTry);assert.equal(s.session.helped,session.helped);assert.equal(s.session.bonusCompleted,1);
 assert.equal(A.sessionDone(s),true);assert.equal(A.pendingKick(s),false);
 const complete=copy(s);assert.equal(finish(s),false);assert.equal(A.next(s,kickId),false);assert.deepEqual(s,complete);
 s=A.normalize(complete);assert.equal(A.score(s),7);assert.equal(A.restart(s,1),true);assert.equal(s.attempt.kind,'drive');assert.equal(A.score(s),7);
});

test('extra-point retries, help and report exposure forfeit the point without changing overflow yards',()=>{
 for(const support of ['miss','help','automatic','report']){
  let s=A.create(100);for(let i=0;i<19;i++){finish(s);A.next(s,s.attempt.id);}
  for(let i=0;i<3;i++){A.reportOpened(s,s.attempt.id);finish(s);A.next(s,s.attempt.id);}
  finish(s);assert.equal(s.drive.totalYards,103);A.next(s,s.attempt.id);assert.equal(s.attempt.kind,'extraPoint');
  const id=s.attempt.id,wrong=(A.byId[s.attempt.factId].answer+1)%19;
  if(support==='miss'||support==='automatic')A.answer(s,id,wrong);
  if(support==='automatic')A.answer(s,id,wrong);
  if(support==='help')A.show(s,id);
  if(support==='report')A.reportOpened(s,id);
  assert.equal(s.drive.totalYards,103);assert.equal(s.attempt.complete,false);
  s=A.normalize(copy(s));assert.ok(s);assert.equal(A.restart(s,5),false);finish(s);
  assert.equal(s.attempt.kickResult,'missed');assert.equal(A.score(s),6,support);assert.equal(s.drive.totalYards,103);assert.equal(s.drive.kicksResolved,1);assert.equal(s.session.bonusCompleted,1);
  assert.deepEqual(A.normalize(copy(s)),s);assert.equal(A.next(s,id),true);assert.equal(s.attempt.kind,'drive');
 }
});

test('legacy touchdowns migrate with no retroactive kick and corrupt optional bonus metadata cannot mint points',()=>{
 const old=touchdown();old.schemaVersion=2;delete old.attempt.kind;delete old.session.bonusCompleted;
 old.drive={totalYards:100};const migrated=A.normalize(old);assert.ok(migrated);assert.equal(migrated.schemaVersion,3);
 assert.equal(A.score(migrated),6);assert.equal(A.pendingKick(migrated),false);assert.equal(A.sessionDone(migrated),true);
 assert.deepEqual(migrated.drive,{totalYards:100,extraPoints:0,kicksResolved:1});assert.deepEqual(migrated.facts,old.facts);
 const active=touchdown();A.next(active,active.attempt.id);
 for(const corrupt of [d=>d.extraPoints=2,d=>d.kicksResolved=2,d=>delete d.extraPoints]){
  const raw=copy(active);corrupt(raw.drive);assert.equal(A.driveNeedsRepair(raw),true);
  const fixed=A.normalize(raw);assert.ok(fixed);assert.equal(fixed.attempt.kind,'extraPoint');assert.equal(A.restart(fixed,5),false);
  const serial=fixed.serial;finish(fixed);assert.equal(fixed.attempt.kickResult,'unscored');assert.equal(fixed.serial,serial+1);assert.equal(A.score(fixed),0);assert.equal(fixed.drive.extraPoints,0);
  assert.ok(A.normalize(copy(fixed)));
 }
});


test('inconsistent completed kick rewards repair motivation while preserving learning',()=>{
 for(const missed of [false,true]){
  const s=touchdown();A.next(s,s.attempt.id);if(missed)A.show(s,s.attempt.id);finish(s);
  const raw=copy(s);raw.drive.extraPoints=missed?1:0;
  assert.equal(A.driveNeedsRepair(raw),true);const fixed=A.normalize(raw);assert.ok(fixed);
  assert.deepEqual(fixed.facts,s.facts);assert.equal(fixed.attempt.kickResult,'unscored');
  assert.equal(A.score(fixed),0);assert.equal(finish(fixed),false);assert.ok(A.normalize(copy(fixed)));
 }
});
