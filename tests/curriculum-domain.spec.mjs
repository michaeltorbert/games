import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function load(){const scope=vm.createContext({console});for(const file of ['shared/curriculum.js','place-value-practice/arithmetic-domain.js','place-value-practice/fact-practice-domain.js','place-value-practice/book-practice-domain.js'])vm.runInContext(fs.readFileSync(file,'utf8'),scope);return scope;}
test('exact source identities, baseline, page range, and all lesson generators',()=>{
 const {MATH_CURRICULUM:c,PLACE_BOOK:b}=load();
 const record=JSON.parse(fs.readFileSync('football/curriculum-progress.json')).additionalWorktexts.find(x=>x.title===c.BOOK);
 assert.equal(c.BASELINE.completedThroughPage,record.completedThroughPage);assert.equal(c.BASELINE.edition,record.edition);
 assert.equal(c.LAST_PAGE,187);assert.equal(c.available(187).length,c.CATALOG.length);
 for(const skill of c.CATALOG){assert.equal(c.available(skill.page-1).some(x=>x.id===skill.id),false);assert.equal(c.available(skill.page).some(x=>x.id===skill.id),true);for(let n=0;n<12;n++){const q=b.question(skill,n);assert.ok(q.prompt);assert.ok(q.help);assert.ok(q.choices.includes(q.answer));assert.equal(new Set(q.choices).size,q.choices.length);assert.ok(q.choices.length>=2);}}
 for(const bad of [-1,188,NaN,Infinity,1.5,'113'])assert.equal(c.validPage(bad),false);
 assert.equal(c.needsConfirmation(113,114),false);assert.equal(c.needsConfirmation(113,112),true);assert.equal(c.needsConfirmation(113,124),true);assert.equal(c.needsConfirmation(150,151),true);
 assert.equal(c.normalize({schemaVersion:99}),null);
});
test('arithmetic page 113 excludes future operand domains and advances at exact boundaries',()=>{
 const {MATH_CURRICULUM:c,PLACE_ARITHMETIC:a}=load();
 assert.equal(c.arithmeticPage('facts-add',[12,8]),122);assert.equal(c.arithmeticPage('subtract-no-borrow',[45,23]),137);
 for(const page of [17,35,102,108,110,113,114,117,119,124,127,129,135,137,142,187]){
  a.configure(page);let state=a.repair(a.create(null,()=>.5));
  for(let n=0;n<45;n++){assert.ok(c.arithmeticPage(state.question.family,state.question.operands)<=page);assert.ok(a.normalize(state));a.answer(state,a.view(state).answer);a.next(state,()=>.4);}
 }
});
test('mixed arithmetic keeps single-digit facts evergreen beside unlocked larger work',()=>{
 const {PLACE_ARITHMETIC:a}=load();a.configure(113);const state=a.repair(a.create(null,()=>.25));
 const seen=new Set();
 for(let n=0;n<20;n++){
  const q=state.question;seen.add(q.family);
  if(q.family==='facts-add'){assert.ok(q.operands[0]<=9);assert.ok(q.operands[1]<=9);}
  if(q.family==='facts-subtract'){assert.ok(q.operands[1]<=9);assert.ok(q.operands[0]-q.operands[1]<=9);}
  a.answer(state,a.view(state).answer);if(n<19)a.next(state,()=>.25);
 }
 assert.ok(seen.has('facts-add'));assert.ok(seen.has('facts-subtract'));
 assert.ok([...seen].some(f=>!f.startsWith('facts-')));
});
test('correction preserves arithmetic history and temporarily locked exact retry tickets',()=>{
 const {PLACE_ARITHMETIC:a,PLACE_FACTS:f}=load();a.configure(187);let state=a.repair(a.create(null,()=>.9));
 for(let i=0;i<5;i++){a.answer(state,a.view(state).answer);a.next(state,()=>.9);}const history=JSON.stringify(state.learning),serial=state.sequence;
 a.configure(113);a.repair(state);assert.equal(JSON.stringify(state.learning),history);assert.equal(state.sequence,serial);assert.ok(a.normalize(state));
 f.configure(187);const s=f.create();const target=f.byId['sub:15:7'];s.facts[target.id].ticket={kind:'retry',dueOther:0,created:0};const ticket=JSON.stringify(s.facts[target.id].ticket);
 f.configure(113);for(let i=0;i<40;i++){assert.ok(f.select(s).fact.source.page<=113);const q=s.attempt;f.answer(s,q.id,f.byId[q.factId].answer);if(!f.next(s))f.restart(s,10);}
 assert.equal(JSON.stringify(s.facts[target.id].ticket),ticket);f.configure(187);assert.ok(f.catalog.some(x=>x.id===target.id&&x.source.page<=187));
});
test('a structurally valid pending fact repairs without erasing retry history or enabling a locked bonus',()=>{
 const {PLACE_FACTS:f}=load();f.configure(187);let s=f.create(100);
 for(let i=0;s.attempt.factId!=='sub:15:7'&&i<1000;i++){f.answer(s,s.attempt.id,f.byId[s.attempt.factId].answer);if(!f.next(s,s.attempt.id))f.restart(s,100);}
 assert.equal(s.attempt.factId,'sub:15:7');f.answer(s,s.attempt.id,0);assert.ok(f.normalize(s));
 const history=JSON.stringify(s.facts['sub:15:7']),serial=s.serial;f.configure(113);f.repair(s);assert.equal(s.serial,serial);assert.equal(JSON.stringify(s.facts['sub:15:7']),history);assert.ok(f.normalize(s));assert.notEqual(s.attempt.factId,'sub:15:7');
});
test('book practice reward and evidence survive restart/correction without sharing other stores',()=>{
 const {PLACE_BOOK:b}=load();const s=b.create(187,6);for(let i=0;i<20;i++){const q=b.current(s);b.answer(s,q.answer);assert.ok(b.normalize(s));b.next(s);}
 assert.equal(s.yards,100);assert.equal(s.completed,20);const history=JSON.stringify(s.history);s.page=50;s.done=false;s.misses=[];s.serial=s.completed;assert.ok(b.normalize(s));assert.equal(JSON.stringify(s.history),history);assert.equal(b.current(s).page,50);assert.equal(b.normalize({...s,schemaVersion:2}),null);
});
