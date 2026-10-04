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
test('three addends unlock at the pair-making-ten lesson or the broader page-124 lesson, never at doubles',()=>{
 const {MATH_CURRICULUM:c,PLACE_ARITHMETIC:a}=load();
 assert.equal(c.arithmeticPage('three-addends',[3,7,5]),101);assert.equal(c.arithmeticPage('three-addends',[3,4,5]),124);assert.equal(c.arithmeticPage('three-addends',[2,2,3]),124);
 assert.equal(c.arithmeticPage('facts-subtract',[12,7]),131);assert.equal(c.arithmeticPage('facts-subtract',[15,7]),131);assert.equal(c.arithmeticPage('facts-subtract',[17,3]),110);
 assert.equal(c.operationPage('subtract',12,7),131);assert.equal(c.operationPage('add',7,8),103);assert.equal(c.operationPage('add',9,5),104);assert.equal(c.operationPage('add',23,45),114);
 a.configure(113);const state=a.repair(a.create(null,()=>.5));
 for(let n=0;n<120;n++){const q=state.question;if(q.family==='three-addends'){const [x,y,z]=q.operands;assert.ok([x+y,x+z,y+z].includes(10),`page 113 drew ${q.operands}`);}a.answer(state,a.view(state).answer);a.next(state,()=>(n%7)/7);}
});
test('page 187 makes every mixed arithmetic family eligible and no family maps to Infinity',()=>{
 const {MATH_CURRICULUM:c,PLACE_ARITHMETIC:a}=load();
 for(const family of a.MIX){assert.notEqual(a.FAMILIES[family],undefined);}
 a.configure(187);const seen=new Set();const state=a.repair(a.create(null,()=>.5));
 for(let n=0;n<400&&seen.size<Object.keys(a.FAMILIES).length;n++){seen.add(state.question.family);assert.ok(Number.isFinite(c.arithmeticPage(state.question.family,state.question.operands)));a.answer(state,a.view(state).answer);a.next(state,()=>(n%11)/11);}
 assert.deepEqual([...seen].sort(),Object.keys(a.FAMILIES).sort());
 assert.equal(c.arithmeticPage('no-such-family',[1,2]),Infinity);
});
// Issue #146: Whole book worked answers.
const plain=x=>JSON.parse(JSON.stringify(x));
const evaluate=text=>text.split(' ').reduce((acc,token,i,all)=>i===0?Number(token):/\d/.test(token)?(all[i-1]==='+'?acc+Number(token):acc-Number(token)):acc,0);
test('whole-book arithmetic lessons carry structured operations whose columns reach the lesson answer',()=>{
 const {MATH_CURRICULUM:c,PLACE_BOOK:b,PLACE_ARITHMETIC:a}=load(),arithmetic=new Set(),kinds=new Set();
 for(const skill of c.CATALOG)for(let n=0;n<12;n++){
  const q=b.question(skill,n);
  if(!q.math)continue;
  arithmetic.add(skill.id);const {op,operands,answerRow}=q.math,label=`${skill.id} ${n}`;
  const shown=plain(a.explainOperation(op,operands,answerRow));assert.ok(shown,label);kinds.add(shown.kind);
  if(shown.kind==='columns'){const row=shown.rows.find(r=>r.answer);assert.equal(Number(row.digits.join('')),Number(q.answer),label);
   assert.equal(shown.rows.indexOf(row),answerRow===1?1:shown.rows.length-1,label);}
  else assert.equal(Number(shown.lines.at(-1).split(' = ')[1]),Number(q.answer),label);
  // Independent consistency check: the visible numbers belong to the structured operation.
  for(const x of answerRow===1?[operands[0],operands[0]+operands[1]]:operands)assert.match(q.prompt,new RegExp(`(^|\\D)${x}(\\D|$)`),label);
 }
 // Columns only for arithmetic chapters; shapes, fractions, measurement, graphs and coins never get them.
 assert.deepEqual([...arithmetic].sort(),plain(c.CATALOG.filter(k=>[5,8].includes(k.chapter)&&k.id!=='compare-facts').map(k=>k.id)).sort());
 assert.deepEqual([...kinds].sort(),['columns','steps']);
});
test('whole-book worked answers appear only after correct completion, survive normalize, and clear on Next',()=>{
 const {PLACE_BOOK:b,PLACE_ARITHMETIC:a}=load(),seen={};
 for(const chapter of [5,6,7,8,9,10]){
  const s=b.create(187,chapter);
  for(let i=0;i<30;i++){
   const q=b.current(s);assert.equal(b.explain(s),null);
   const wrong=q.choices.find(v=>v!==q.answer);if(i%3===0){assert.equal(b.answer(s,wrong),true);assert.equal(b.explain(s),null);}
   const before=JSON.stringify(s);b.explain(s);assert.equal(JSON.stringify(s),before);
   const yards=s.yards;assert.equal(b.answer(s,q.answer),true);assert.equal(s.yards-yards,i%3===0?1:5);
   const shown=plain(b.explain(s)),saved=JSON.stringify(s);
   if(q.math){
    assert.deepEqual({...shown,equation:undefined},{...plain(a.explainOperation(q.math.op,q.math.operands,q.math.answerRow)),equation:undefined});
    const [left,right]=shown.equation.split(' = ');assert.equal(evaluate(left),Number(right));
    assert.equal(answerOf(shown,q.math.answerRow),Number(q.answer));seen[shown.kind]=(seen[shown.kind]||0)+1;
   }else{assert.ok([5,6,7,9,10].includes(chapter));assert.deepEqual(shown,{kind:'text',heading:'Worked answer',lines:[q.help,`Answer: ${q.answer}.`]});seen.text=(seen.text||0)+1;}
   assert.equal(saved.includes('Worked answer')||saved.includes('Line up'),false);
   assert.deepEqual(plain(b.explain(b.normalize(JSON.parse(saved)))),shown);
   assert.equal(b.next(s),true);assert.equal(b.explain(s),null);
  }
 }
 assert.ok(seen.columns&&seen.steps&&seen.text);
});
function answerOf(shown,answerRow){if(shown.kind==='steps')return Number(shown.lines.at(-1).split(' = ')[1]);const row=shown.rows[answerRow===1?1:shown.rows.length-1];return Number(row.digits.join(''));}
test('representative whole-book lessons explain carries, borrowing, missing addends and repeated subtraction',()=>{
 const {MATH_CURRICULUM:c,PLACE_BOOK:b}=load(),skill=id=>c.CATALOG.find(k=>k.id===id);
 // A completed state in the skill's chapter whose serial gives the generator values n=serial%4+2 and m=serial%3+1.
 const done=(id,{n=null,m=null}={})=>{const s=b.create(187,skill(id).chapter);
  for(let k=0;k<1000;k++){s.serial=k;s.completed=k+1;s.done=true;if(b.current(s).skillId===id&&(n===null||k%4+2===n)&&(m===null||k%3+1===m))return plain(b.explain(s));}
  assert.fail(`no serial reaches ${id} with n=${n} m=${m}`);};
 const carry=done('two-digit-carry',{n:2});assert.equal(carry.equation,'28 + 14 = 42');assert.deepEqual(carry.lines,['8 + 4 = 12 ones = 1 ten 2 ones','1 + 2 + 1 = 4 tens']);assert.deepEqual(carry.carries,['1','']);
 const missing=done('missing-addend',{n:3});assert.equal(missing.equation,'8 + 3 = 11');assert.deepEqual(missing.rows.map(r=>r.answer),[false,true,false]);
 const three=done('three-addends',{n:4,m:3});assert.equal(three.equation,'8 + 4 + 3 = 15');assert.deepEqual(three.lines,['8 + 4 + 3 = 15 ones = 1 ten 5 ones']);
 const repeated=done('repeated-subtraction',{m:2});assert.equal(repeated.kind,'steps');assert.deepEqual(repeated.lines,['9 − 2 = 7','7 − 2 = 5']);assert.equal(repeated.equation,'9 − 2 − 2 = 5');
 const borrow=done('tens-minus-digit',{n:5});assert.equal(borrow.equation,'40 − 5 = 35');assert.deepEqual(borrow.lines,['Trade 1 ten for 10 ones','10 − 5 = 5 ones','Keep 3 tens']);
 const complete=done('complete-ten',{n:3});assert.equal(complete.equation,'24 + 6 = 30');assert.deepEqual(complete.lines,['4 + 6 = 10 ones = 1 ten 0 ones','1 + 2 = 3 tens']);assert.deepEqual(complete.rows.map(r=>r.answer),[false,true,false]);
 const shape=done('basic-shapes',{n:2});assert.equal(shape.kind,'text');assert.equal(shape.heading,'Worked answer');assert.equal(shape.lines[1],'Answer: triangle.');
});
