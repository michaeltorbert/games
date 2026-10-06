import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../place-value-practice/arithmetic-domain.js',import.meta.url),'utf8'),context);
const api=context.PLACE_ARITHMETIC, plain=x=>JSON.parse(JSON.stringify(x)), rng=()=>.3;
const families=Object.keys(api.FAMILIES);
function finish(state,misses=0) {
  const answer=api.view(state).answer;
  for(const value of state.question.choices.filter(n=>n!==answer).slice(0,misses))assert.equal(api.answer(state,value),true);
  assert.equal(api.answer(state,answer),true);
}
test('120,000 generated questions retain independent oracle, all families and content bounds',()=>{
  const seen=new Set(),facts=new Set();
  for(let sequence=0;sequence<api.MIX.length;sequence++)for(let step=0;step<10000;step++) {
    const q=api.question(sequence,()=>step/10000),[a,b,c]=q.operands;
    seen.add(q.family);facts.add(`${q.family}:${q.operands.join(',')}`);
    assert.equal(api.valid(q.family,q.operands),true);
    const expected=q.family==='complete-ten'||q.family==='missing-addend'?b:q.family.includes('subtract')||q.family==='tens-minus-digit'?a-b-(c||0):a+b+(c||0);
    assert.equal(api.view({question:q}).answer,expected);
    assert.equal(new Set(q.choices).size,4);assert.ok(q.choices.includes(expected));assert.ok(expected>=0&&expected<=100);
    if(q.family==='subtract-no-borrow')assert.ok(a%10>=b%10);
    if(q.family==='add-no-carry')assert.ok(a%10+b%10<10);
    if(q.family==='add-carry')assert.ok(a%10+b%10>=10);
  }
  assert.deepEqual([...seen].sort(),families.slice().sort());
  assert.ok(facts.has('facts-add:7,6'));assert.ok(facts.has('facts-subtract:14,7'));
  for(const operands of [[18,34],[7,36]])assert.equal(api.valid('missing-addend',operands),false);
  assert.equal(api.valid('missing-addend',[38,2]),true);
  for(const pair of [[52,18],[43,7],[21,14]])for(const family of ['facts-subtract','subtract-no-borrow','tens-minus-digit'])assert.equal(api.valid(family,pair),false);
});
test('four terminal outcomes survive reload, record once, and preserve session totals',()=>{
  for(let misses=0;misses<4;misses++) {
    let state=api.create(5,rng),answer=api.view(state).answer;
    const wrong=state.question.choices.filter(n=>n!==answer);
    assert.equal(api.answer(state,-1),false);assert.equal(api.next(state,rng),false);
    for(const value of wrong.slice(0,misses)) {
      assert.equal(api.answer(state,value),true);assert.equal(api.answer(state,value),false);
      state=api.normalize(plain(state));assert.ok(state);
      assert.equal(state.learning.history['facts-add'].length,0);
    }
    assert.equal(api.restart(state,5,rng).learning.serial,0);
    assert.equal(api.answer(state,answer),true);assert.equal(api.answer(state,answer),false);
    assert.deepEqual(plain(state.learning.history['facts-add']),[{serial:1,outcome:['firstTry','retryCorrect1','retryCorrect2','revealed'][misses],misses}]);
    assert.equal(state.firstTry,misses?0:1);assert.equal(state.afterHelp,misses?1:0);
    assert.deepEqual(plain(api.normalize(plain(state))),plain(state));
    state=api.normalize(plain(state));assert.equal(api.answer(state,answer),false);
    assert.equal(api.next(state,rng),true);assert.equal(state.learning.serial,1);
  }
});
test('weights boost support, decay with success, and isolate families',()=>{
  const learning=api.create().learning, rows=learning.history['facts-add'];
  const put=misses=>rows.push({serial:rows.length+1,misses,outcome:['firstTry','retryCorrect1','retryCorrect2','revealed'][misses]});
  assert.equal(api.familyWeight(learning,'facts-add'),1);
  put(3);assert.equal(api.familyWeight(learning,'facts-add'),3);
  put(2);assert.equal(api.familyWeight(learning,'facts-add'),3);
  put(1);assert.equal(api.familyWeight(learning,'facts-add'),2);
  for(let i=0;i<3;i++){put(0);assert.equal(api.familyWeight(learning,'facts-add'),1.5);}
  put(0);assert.equal(api.familyWeight(learning,'facts-add'),1);
  put(0);assert.equal(api.familyWeight(learning,'facts-add'),.5);
  assert.equal(api.familyWeight(learning,'facts-subtract'),1);
  const baseline=api.create().learning;baseline.position=2;baseline.seed=Math.floor(.15*4294967296);
  assert.equal(api.selectFamily(baseline),'facts-subtract');
  baseline.history['facts-add']=[{serial:1,misses:3,outcome:'revealed'}];
  assert.equal(api.selectFamily(baseline),'facts-add');
});
test('every sliding five/twenty completions guarantees refresh/coverage across sessions and reloads',()=>{
  for(const draw of [()=>0,()=>.3,()=>.999999999])for(const target of [5,10,20,null]) {
    let state=api.create(target,draw);const observed=[];
    for(let i=0;i<100;i++) {
      observed.push(state.question.family);
      const restart=api.restart(state,target,draw);
      assert.equal(restart.question.family,state.question.family);
      assert.deepEqual(plain(restart.learning),plain(state.learning));
      finish(state,i%4);state=api.normalize(plain(state));assert.ok(state);
      if(target!==null && state.completed===target)state=api.restart(state,target,draw);
      else assert.equal(api.next(state,draw),true);
    }
    for(let i=0;i<=observed.length-5;i++)assert.ok(observed.slice(i,i+5).filter(f=>f==='facts-add'||f==='facts-subtract').length>=2);
    for(let i=0;i<=observed.length-20;i++)assert.equal(new Set(observed.slice(i,i+20)).size,10);
  }
});
test('family selection is independent of construction RNG, exact reminders follow actual operands, and restored state is deterministic',()=>{
  let a=api.create(null,rng),b=api.create(null,rng);
  const missed={a:new Set(),b:new Set()};
  for(let i=0;i<50;i++) {
    assert.equal(a.question.family,b.question.family);
    for(const [name,s] of [['a',a],['b',b]])if(i%4&&api.factId(s.question.family,s.question.operands))missed[name].add(api.factId(s.question.family,s.question.operands));
    finish(a,i%4);finish(b,i%4);
    a=api.normalize(plain(a));b=api.restart(b,null,()=>.9);api.next(a,()=>.01);
    assert.deepEqual(plain(a.learning),plain(b.learning));
    // Reminders name only facts this run actually missed, so they depend on its own operands.
    for(const [name,s] of [['a',a],['b',b]])for(const r of s.practice.reminders)assert.ok(missed[name].has(r.id),`${name} ${r.id}`);
  }
  assert.ok(missed.a.size>0&&missed.b.size>0);
  assert.notDeepEqual(plain(a.practice.reminders),plain(b.practice.reminders));
  let x=api.create(null,rng),y=api.create(null,rng);
  for(let i=0;i<30;i++){assert.deepEqual(plain(x),plain(y));finish(x);finish(y);api.next(x,rng);api.next(y,rng);}
  for(let i=0;i<60;i++){assert.deepEqual(plain(x),plain(y));finish(x,i%3);finish(y,i%3);api.next(x,rng);api.next(y,rng);}
  assert.ok(x.practice.reminders.length>0);
  // The same saved artifact restored with the same RNG is reproducible, reminders included.
  assert.deepEqual(plain(api.restart(plain(x),null,rng)),plain(api.restart(plain(y),null,rng)));
  assert.deepEqual(plain(api.normalize(plain(x))),plain(x));
});
test('literal schema 1/2 migration preserves attempts, validates alignment and never backfills',()=>{
  for(const schemaVersion of [1,2])for(const complete of [false,true])for(let misses=0;misses<4;misses++) {
    const legacy={schemaVersion,startOffset:schemaVersion===1?0:4,sequence:0,target:5,completed:complete?1:0,
      firstTry:complete&&!misses?1:0,afterHelp:complete&&misses?1:0,
      question:{id:0,family:'facts-add',operands:[4,5],choices:[9,8,10,7],misses:[8,10,7].slice(0,misses),complete}};
    const saved=plain(legacy);let state=api.normalize(legacy);assert.ok(state);
    assert.deepEqual(plain(legacy),saved);assert.deepEqual(plain(state.question.operands),[4,5]);
    assert.equal(state.learning.serial,0);assert.equal(state.learning.history['facts-add'].length,0);
    assert.deepEqual(plain(api.normalize(plain(state))),plain(state));
    if(!complete){assert.equal(api.answer(state,9),true);assert.equal(state.learning.serial,1);}
    assert.equal(api.answer(state,9),false);assert.ok(api.normalize(plain(state)));
    assert.equal(api.next(state,rng),true);assert.equal(state.question.family,'facts-add');assert.ok(api.normalize(plain(state)));
    if(schemaVersion===2)assert.equal(api.normalize({...saved,startOffset:3}),null);
    const invalid=plain(saved);invalid.question.operands=[200,1];assert.equal(api.normalize(invalid),null);
  }
});
test('normalization rejects corrupt history/attempts and strips non-history data',()=>{
  const state=api.create(null,rng);finish(state,2);
  for(const mutate of [s=>s.schemaVersion=5,s=>s.learning.serial=-1,s=>s.learning.position=20,s=>s.learning.seed=4294967296,
    s=>s.learning.history['facts-add'][0].outcome='firstTry',s=>s.learning.history['facts-add'][0].serial=2,
    s=>s.learning.history['facts-add'].push({...s.learning.history['facts-add'][0]}),s=>s.question.serial=2,
    s=>s.completed=3,s=>s.learning.history['facts-add']=[],s=>s.learning.history['facts-add'][0].misses=4]) {
    const bad=plain(state);mutate(bad);assert.equal(api.normalize(bad),null);
  }
  const dirty=plain(state);dirty.learning.history['facts-add'][0].prompt='private';dirty.learning.identity='private';
  assert.deepEqual(plain(api.normalize(dirty)),plain(state));
  const pending=api.create(null,rng);pending.question={...api.question(2,rng),serial:1,id:0};assert.equal(api.normalize(pending),null);
});
test('long practice retains only twenty privacy-safe observations per family',()=>{
  let state=api.create(null,rng);
  for(let i=0;i<1000;i++){finish(state,i%4);api.next(state,rng);}
  assert.equal(state.learning.serial,1000);
  for(const rows of Object.values(state.learning.history)) {
    assert.equal(rows.length,20);
    for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['misses','outcome','serial']);
  }
  assert.deepEqual(plain(api.normalize(plain(state))),plain(state));
  const old=plain(state),fresh=api.restart(state,5,rng);
  assert.deepEqual(plain(state),old);assert.deepEqual(plain(fresh.learning),old.learning);
});
// Issue #146: display-only place-value explanations.
const VALUE={one:1,ones:1,ten:10,tens:10,hundred:100,hundreds:100};
const evaluate=text=>text.split(' ').reduce((acc,token,i,all)=>i===0?Number(token):/\d/.test(token)?(all[i-1]==='−'?acc-Number(token):acc+Number(token)):acc,0);
const columnTotal=(numbers,place)=>Math.floor(numbers.reduce((s,n)=>s+n%10**(place+1),0)/10**place);
const carryInto=(numbers,place)=>place?Math.floor(numbers.reduce((s,n)=>s+n%10**place,0)/10**place):0;
const rowValue=digits=>{const text=digits.join('');return text===''?null:Number(text);};
function enumerate(family) {
  const size=api.FAMILIES[family].size||2,max=['facts-add','facts-subtract','three-addends'].includes(family)?20:family==='repeated-subtraction'?10:100,rows=[];
  for(let a=0;a<=max;a++)for(let b=0;b<=max;b++){if(size===3){for(let c=0;c<=max;c++)if(api.valid(family,[a,b,c]))rows.push([a,b,c]);}else if(api.valid(family,[a,b]))rows.push([a,b]);}
  return rows;
}
function checkLine(line) {
  let m=line.match(/^(\d+(?: [+−] \d+)+) = (\d+) (\w+)(?: = (\d+) (\w+) (\d+) (\w+))?$/);
  if(m) {
    const [,lhs,n,u,x,xu,y,yu]=m;assert.equal(evaluate(lhs),Number(n),line);
    assert.equal(u.endsWith('s'),Number(n)!==1,line);
    if(x!==undefined){assert.equal(VALUE[xu],VALUE[u]*10,line);assert.equal(VALUE[yu],VALUE[u],line);assert.equal(Number(x)*10+Number(y),Number(n),line);assert.ok(Number(n)>=10&&Number(y)<10,line);}
    else assert.ok(Number(n)<10,`unregrouped total must be one digit: ${line}`);
    return {kind:'op',place:Math.log10(VALUE[u]),lhs:lhs.split(/ [+−] /).map(Number),total:Number(n)};
  }
  if((m=line.match(/^Keep (\d+) (\w+)$/)))return {kind:'keep',place:Math.log10(VALUE[m[2]]),total:Number(m[1])};
  if((m=line.match(/^Trade 1 (\w+) for 10 (\w+)$/))){assert.equal(VALUE[m[1]],VALUE[m[2]]*10,line);return {kind:'trade',place:Math.log10(VALUE[m[1]])};}
  assert.fail(`unexpected explanation line: ${line}`);
}
test('every valid operand tuple in every family projects mathematically true columns or steps',()=>{
  const counts={};
  for(const family of families)for(const operands of enumerate(family)) {
    counts[family]=(counts[family]||0)+1;
    const state={question:{family,operands,complete:true,choices:[],misses:[]}},before=plain(state),answer=api.view(state).answer;
    const shown=plain(api.explain(state));assert.deepEqual(plain(state),before);
    const [a,b,c]=operands,label=`${family} ${operands}`;
    if(family==='repeated-subtraction') {
      assert.equal(shown.kind,'steps');assert.equal(shown.lines.length,2);
      shown.lines.forEach(line=>assert.equal(evaluate(line.split(' = ')[0]),Number(line.split(' = ')[1]),line));
      assert.equal(shown.lines[0].split(' = ')[0],`${a} − ${b}`);assert.equal(shown.lines[1].split(' = ')[0],`${a-b} − ${c}`);
      assert.equal(Number(shown.lines[1].split(' = ')[1]),answer);continue;
    }
    assert.equal(shown.kind,'columns',label);
    const subtract=family.includes('subtract')||family==='tens-minus-digit';
    const total=subtract?a-b:operands.reduce((s,n)=>s+n,0), numbers=[...operands,total], width=String(Math.max(...numbers)).length;
    assert.deepEqual(shown.places,['Hundreds','Tens','Ones'].slice(3-width),label);
    assert.equal(width===1,numbers.every(n=>n<10),label);assert.equal(width===3,numbers.includes(100),label);
    for(const row of shown.rows) {
      assert.equal(row.digits.length,width);assert.ok(row.digits.every(d=>/^\d?$/.test(d)),label);
      const first=row.digits.findIndex(d=>d!=='');assert.ok(row.digits.slice(first).every(d=>d!==''),`right-aligned ${label}`);
    }
    assert.deepEqual(shown.rows.map(r=>rowValue(r.digits)),numbers,label);
    assert.deepEqual(shown.rows.map(r=>r.sign),subtract?['','−','']:operands.map((_,i)=>i?'+':'').concat(''),label);
    assert.equal(shown.rows.at(-1).result,true);
    const answerRow=shown.rows.findIndex(r=>r.answer);assert.equal(rowValue(shown.rows[answerRow].digits),answer,label);
    assert.equal(answerRow,family==='complete-ten'||family==='missing-addend'?1:shown.rows.length-1,label);
    const parsed=shown.lines.map(checkLine);
    if(!subtract) {
      assert.equal(shown.trades,null);
      for(let p=0;p<width;p++) {
        const digits=operands.filter(n=>p===0||n>=10**p).map(n=>Math.floor(n/10**p)%10),carry=carryInto(operands,p),line=parsed.find(x=>x.place===p);
        if(shown.carries)assert.equal(shown.carries[width-1-p],carry&&p>0&&digits.length?String(carry):'',label);
        if(!digits.length){assert.equal(line,undefined,`carry-only column is named by the line below it: ${label}`);continue;}
        assert.equal(line.total,columnTotal(operands,p),label);assert.equal(line.total%10,Math.floor(total/10**p)%10,label);
        if(line.kind==='op')assert.deepEqual(line.lhs,(carry?[carry]:[]).concat(digits),label);else assert.equal(digits.length+(carry?1:0),1,label);
      }
      if(shown.carries===null)assert.ok([...Array(width).keys()].every(p=>p===0||!carryInto(operands,p)||!operands.some(n=>n>=10**p)),label);
      assert.equal(parsed.some(x=>x.total>=10),[...Array(width).keys()].some(p=>columnTotal(operands,p)>=10),`regrouping is named exactly when a column carries: ${label}`);
      if(family==='add-no-carry')assert.ok(parsed.every(x=>x.total<10),label);
    } else {
      assert.equal(shown.carries,null);
      const borrow=a%10<b%10,top=shown.rows[0];
      assert.equal(shown.trades!==null,borrow,label);assert.equal(parsed.some(x=>x.kind==='trade'),borrow,label);
      const work=top.digits.map((d,i)=>shown.trades&&shown.trades[i]!==''?Number(shown.trades[i]):Number(d));
      assert.equal(work.reduce((s,v,i)=>s+v*10**(width-1-i),0),a,`regrouping preserves the value: ${label}`);
      assert.deepEqual(top.crossed,top.digits.map((d,i)=>!!shown.trades&&shown.trades[i]!==''),label);
      for(let p=0;p<width;p++) {
        const i=width-1-p,bd=p===0||b>=10**p?Math.floor(b/10**p)%10:null,rd=Math.floor(total/10**p)%10,line=parsed.find(x=>x.place===p&&x.kind!=='trade');
        assert.equal(work[i]-(bd??0),rd,`column ${p} is true arithmetic: ${label}`);assert.ok(work[i]<20,label);
        if(bd!==null)assert.deepEqual([line.kind,line.lhs,line.total],['op',[work[i],bd],rd],label);
        else if(work[i])assert.deepEqual([line.kind,line.total],['keep',work[i]],label);else assert.equal(line,undefined,label);
      }
    }
  }
  assert.deepEqual(Object.keys(counts).sort(),families.slice().sort());
});
test('reference explanations match the approved Tens/Ones alignment and regrouping boundaries',()=>{
  const ex=(family,operands)=>plain(api.explain({question:{family,operands,complete:true}}));
  assert.deepEqual(ex('add-no-carry',[31,68]),{kind:'columns',heading:'Line up tens and ones',places:['Tens','Ones'],carries:null,trades:null,
    rows:[{sign:'',digits:['3','1'],crossed:[false,false],answer:false},{sign:'+',digits:['6','8'],crossed:[false,false],answer:false},{sign:'',digits:['9','9'],crossed:[false,false],answer:true,result:true}],
    lines:['1 + 8 = 9 ones','3 + 6 = 9 tens']});
  assert.deepEqual(ex('add-no-carry',[31,6]).lines,['1 + 6 = 7 ones','Keep 3 tens']);
  assert.deepEqual(ex('add-no-carry',[31,6]).rows[1].digits,['','6']);
  assert.deepEqual(ex('facts-add',[3,4]).places,['Ones']);assert.deepEqual(ex('facts-add',[3,4]).lines,['3 + 4 = 7 ones']);
  assert.deepEqual(ex('facts-add',[7,6]).lines,['7 + 6 = 13 ones = 1 ten 3 ones']);assert.equal(ex('facts-add',[7,6]).carries,null);
  assert.deepEqual(ex('add-carry',[48,36]).lines,['8 + 6 = 14 ones = 1 ten 4 ones','1 + 4 + 3 = 8 tens']);
  assert.deepEqual(ex('add-carry',[48,36]).carries,['1','']);
  assert.deepEqual(ex('add-carry',[95,5]).places,['Hundreds','Tens','Ones']);
  assert.deepEqual(ex('add-carry',[95,5]).lines,['5 + 5 = 10 ones = 1 ten 0 ones','1 + 9 = 10 tens = 1 hundred 0 tens']);
  assert.deepEqual(ex('add-carry',[95,5]).rows.at(-1).digits,['1','0','0']);
  assert.deepEqual(ex('complete-ten',[7,3]).lines,['7 + 3 = 10 ones = 1 ten 0 ones']);
  assert.deepEqual(ex('missing-addend',[98,2]).rows.map(r=>r.answer),[false,true,false]);
  assert.deepEqual(ex('facts-subtract',[14,7]),{kind:'columns',heading:'Line up tens and ones',places:['Tens','Ones'],carries:null,trades:['0','14'],
    rows:[{sign:'',digits:['1','4'],crossed:[true,true],answer:false},{sign:'−',digits:['','7'],crossed:[false,false],answer:false},{sign:'',digits:['','7'],crossed:[false,false],answer:true,result:true}],
    lines:['Trade 1 ten for 10 ones','14 − 7 = 7 ones']});
  assert.deepEqual(ex('facts-subtract',[8,3]).lines,['8 − 3 = 5 ones']);
  assert.deepEqual(ex('subtract-no-borrow',[45,42]).lines,['5 − 2 = 3 ones','4 − 4 = 0 tens']);
  assert.deepEqual(ex('tens-minus-digit',[40,7]).lines,['Trade 1 ten for 10 ones','10 − 7 = 3 ones','Keep 3 tens']);
  assert.deepEqual(ex('tens-minus-digit',[100,7]).lines,['Trade 1 hundred for 10 tens','Trade 1 ten for 10 ones','10 − 7 = 3 ones','Keep 9 tens']);
  assert.deepEqual(ex('tens-minus-digit',[100,7]).trades,['0','9','10']);
  assert.deepEqual(ex('three-addends',[9,9,2]).lines,['9 + 9 + 2 = 20 ones = 2 tens 0 ones']);
  assert.deepEqual(ex('three-addends',[12,5,3]).lines,['2 + 5 + 3 = 10 ones = 1 ten 0 ones','1 + 1 = 2 tens']);
  assert.deepEqual(ex('repeated-subtraction',[10,3,2]),{kind:'steps',heading:'Take away one part at a time',lines:['10 − 3 = 7','7 − 2 = 5']});
});
test('explanations stay hidden until completion, ignore outcome, and never mutate or enter saved state',()=>{
  for(let misses=0;misses<4;misses++) {
    const state=api.create(5,rng),answer=api.view(state).answer;
    assert.equal(api.explain(state),null);
    for(const value of state.question.choices.filter(n=>n!==answer).slice(0,misses)){assert.equal(api.answer(state,value),true);assert.equal(api.explain(state),null);}
    const before=JSON.stringify(state);api.explain(state);assert.equal(JSON.stringify(state),before);
    assert.equal(api.answer(state,answer),true);
    const saved=JSON.stringify(state),shown=plain(api.explain(state));assert.ok(shown);assert.equal(JSON.stringify(state),saved);
    assert.equal(saved.includes('lines'),false);assert.equal(saved.includes('Line up'),false);
    // The reasoning depends only on the equation, never on misses or reward counters.
    assert.deepEqual(plain(api.explain({question:{family:state.question.family,operands:state.question.operands,complete:true}})),shown);
    assert.deepEqual(plain(api.explain(api.normalize(JSON.parse(saved)))),shown);
    const frozen=JSON.parse(saved);Object.freeze(frozen.question.operands);Object.freeze(frozen.question);Object.freeze(frozen);
    assert.deepEqual(plain(api.explain(frozen)),shown);
    assert.equal(api.next(state,rng),true);assert.equal(api.explain(state),null);
  }
  for(const bad of [null,{},{question:null},{question:{family:'facts-add',operands:[31,68],complete:true}},{question:{family:'nope',operands:[1,2],complete:true}},{question:{family:'facts-add',operands:[1,2],complete:'yes'}}])assert.equal(api.explain(bad),null);
});
test('the shared operation projection serves every Mixed family unchanged and rejects out-of-scope arithmetic',()=>{
  const op=family=>family.includes('subtract')||family==='tens-minus-digit'?'sub':'add';
  for(const family of families)for(const operands of enumerate(family)) {
    const row=family==='complete-ten'||family==='missing-addend'?1:null;
    assert.deepEqual(plain(api.explainOperation(op(family),operands,row)),plain(api.explain({question:{family,operands,complete:true}})),`${family} ${operands}`);
  }
  assert.deepEqual(plain(api.explainOperation('sub',[9,2,2])),{kind:'steps',heading:'Take away one part at a time',lines:['9 − 2 = 7','7 − 2 = 5']});
  for(const [o,operands,row] of [['add',[60,41]],['add',[1]],['add',[1,2,3,4]],['add',[1,2,3],1],['add',[1,2],0],['sub',[3,4]],['sub',[5,3,3]],['sub',[9,2],1],['mul',[2,3]],['add',[1.5,2]],['add',[-1,2]],['add',[101,0]],['add','12']])
    assert.equal(api.explainOperation(o,operands,row??null),null,`${o} ${operands} ${row}`);
});
// Exact small-fact reminders inside Addition & subtraction (schema 4).
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const paged=vm.createContext({}),oracle=vm.createContext({});
for(const path of ['../shared/curriculum.js','../place-value-practice/arithmetic-domain.js'])vm.runInContext(await source(path),paged);
for(const path of ['../shared/curriculum.js','../place-value-practice/fact-practice-domain.js'])vm.runInContext(await source(path),oracle);
const P=paged.PLACE_ARITHMETIC,CURRICULUM=paged.MATH_CURRICULUM,CATALOG=plain(oracle.PLACE_FACTS.catalog);
function complete(A,s,misses=0){const answer=A.view(s).answer;for(const v of s.question.choices.filter(n=>n!==answer).slice(0,misses))assert.equal(A.answer(s,v),true);assert.equal(A.answer(s,answer),true);}
const wrongOf=s=>s.question.choices.filter(n=>n!==api.view(s).answer);
// Test fixture: replace the pending question with a chosen one at a slot that schedules its family.
const AT={'facts-add':0,'add-no-carry':1,'facts-subtract':3,'subtract-no-borrow':11};
function ask(A,s,family,operands){
  if(s.question.complete)assert.equal(A.next(s,rng),true);
  const answer=A.view({question:{family,operands}}).answer;
  s.learning.position=AT[family];
  const choices=[answer+1,answer,answer-1,answer+2,answer-2,answer+3,answer-3].filter(n=>n>=0&&n<=100).slice(0,4);
  s.question={id:s.sequence,family,operands:[...operands],choices,misses:[],complete:false,serial:s.learning.serial+1};
  const restored=A.normalize(plain(s));assert.ok(restored,`${family} ${operands}`);return restored;
}
const filler=(A,s)=>{s=ask(A,s,'add-no-carry',[31,68]);complete(A,s);return s;};
// An independent statement of the policy, used as the oracle for real scheduler traces.
const opOf=id=>id.startsWith('add:')?'facts-add':'facts-subtract';
const numbersOf=id=>id.split(':').slice(1).map(Number);
const familyKey=id=>{const [a,b]=numbersOf(id),[x,y]=(id.startsWith('add:')?[a,b]:[b,a-b]).sort((p,q)=>p-q);return `${x}:${y}`;};
const tieKey=id=>{const [a,b]=numbersOf(id);return (id.startsWith('add:')?0:1)*10000+a*100+b;};
function expectedHead(s,allowedId=()=>true){
  const L=s.learning.serial,p=plain(s.practice);
  return p.reminders.filter(r=>L-r.created>=2&&L-(p.exposure[familyKey(r.id)]??-Infinity)>=2&&allowedId(r.id))
    .sort((x,y)=>x.created-y.created||tieKey(x.id)-tieKey(y.id))[0]??null;
}
const lcg=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
// Completes `steps` real scheduled questions, checking every build against the oracle.
function run(A,s,steps,{draw=rng,misses=()=>0,allowedId}={}){
  const log=[];
  for(let i=0;i<steps;i++){
    const q=s.question,phase=s.learning.position%5,planned=phase===0?'facts-add':phase===3?'facts-subtract':null;
    const head=expectedHead(s,allowedId),spaced=s.practice.lastReturn===null||q.serial-s.practice.lastReturn>=5;
    const serve=planned!==null&&q.family===planned&&spaced&&head!==null&&opOf(head.id)===planned,id=A.factId(q.family,q.operands);
    assert.equal(q.returned===true,serve,`serial ${q.serial} ${q.family} ${id}`);
    if(serve)assert.equal(id,head.id);
    if(allowedId&&id)assert.ok(allowedId(id),id);
    const m=misses(q,i);
    log.push({serial:q.serial,family:q.family,id,returned:serve,before:plain(s.practice.reminders)});
    complete(A,s,m);
    if(i%7===0){const restored=A.normalize(plain(s));assert.deepEqual(plain(restored),plain(s));s=restored;}
    assert.ok(s.practice.reminders.length<=200);
    assert.equal(A.next(s,draw),true);
  }
  return {s,log};
}
// Coverage of all ten families in every twenty is the full-scope schedule guarantee; a lowered page substitutes families.
function windows(log,fullScope=true){
  for(let i=0;i+5<=log.length;i++){
    assert.equal(log[i+4].serial-log[i].serial,4);
    assert.ok(log.slice(i,i+5).filter(r=>r.returned).length<=1,`returns in serials ${log[i].serial}–${log[i+4].serial}`);
    assert.ok(log.slice(i,i+5).filter(r=>r.family==='facts-add'||r.family==='facts-subtract').length>=2);
  }
  if(fullScope)for(let i=0;i+20<=log.length;i++)assert.equal(new Set(log.slice(i,i+20).map(r=>r.family)).size,10);
}
const allFacts=()=>CATALOG.map(f=>f.id);
const EMPTY={reminders:[],exposure:{},lastReturn:null};

test('reminder IDs exhaustively match the 200 Number facts equations, directionally, with 55 related families',()=>{
  const ids=new Map();
  for(const family of families)for(const operands of enumerate(family)) {
    const id=api.factId(family,operands);
    if(family!=='facts-add'&&family!=='facts-subtract'){assert.equal(id,null,`${family} ${operands}`);continue;}
    assert.ok(id);assert.ok(!ids.has(id));ids.set(id,{family,operands});
  }
  assert.equal(ids.size,200);assert.deepEqual([...ids.keys()].sort(),allFacts().sort());
  for(const f of CATALOG) {
    const {family,operands}=ids.get(f.id),view=api.view({question:{family,operands}});
    assert.equal(family,f.op==='add'?'facts-add':'facts-subtract');assert.deepEqual(operands,[f.a,f.b]);
    assert.equal(view.answer,f.answer);assert.equal(view.prompt,`${f.a} ${f.op==='add'?'+':'−'} ${f.b} = ?`);
    // Shared exposure follows Number facts' family; the identity itself never crosses over.
    const [,x,y]=f.family.split(':');assert.equal(api.relatedFamily(family,operands),`${x}:${y}`);
  }
  assert.equal(new Set(CATALOG.map(f=>api.relatedFamily(ids.get(f.id).family,ids.get(f.id).operands))).size,55);
  assert.notEqual(api.factId('facts-add',[7,6]),api.factId('facts-add',[6,7]));assert.notEqual(api.factId('facts-subtract',[13,7]),api.factId('facts-subtract',[13,6]));
  for(const [family,operands] of [['facts-add',[10,0]],['facts-subtract',[12,2]],['facts-add',[7]],['facts-add',[1.5,2]],['nope',[1,2]]])assert.equal(api.factId(family,operands),null);
  // The domain stays standalone: no Number facts global is needed or read.
  assert.equal(vm.runInContext('typeof PLACE_FACTS',context),'undefined');
});

test('the first miss saves one reminder at once; more taps, the reveal, reload and abandonment leave it byte-identical',()=>{
  let s=ask(api,api.create(null,rng),'facts-add',[7,6]);const before=plain(s);
  assert.equal(api.answer(s,-1),false);assert.deepEqual(plain(s),before);
  const [w1,w2,w3]=wrongOf(s);
  assert.equal(api.answer(s,w1),true);
  assert.deepEqual(plain(s.practice),{reminders:[{id:'add:7:6',created:0}],exposure:{'6:7':0},lastReturn:null});
  assert.deepEqual(plain(s.learning),before.learning);assert.deepEqual([s.completed,s.firstTry,s.afterHelp],[0,0,0]);
  const saved=JSON.stringify(s.practice);
  assert.equal(api.answer(s,w1),false);assert.equal(api.answer(s,w2),true);assert.equal(api.answer(s,w3),true);
  assert.equal(JSON.stringify(s.practice),saved);
  s=api.normalize(plain(s));assert.equal(JSON.stringify(s.practice),saved);assert.deepEqual(plain(s.question.misses),[w1,w2,w3]);
  // Abandoning through a new session keeps the reminder and creates no completion or award.
  const restarted=api.restart(plain(s),5,rng);
  assert.equal(JSON.stringify(restarted.practice),saved);assert.deepEqual(plain(restarted.learning),before.learning);
  assert.deepEqual([restarted.completed,restarted.firstTry,restarted.afterHelp],[0,0,0]);
  // A miss on a bigger problem never makes an exact reminder.
  let big=ask(api,restarted,'add-no-carry',[31,68]);api.answer(big,wrongOf(big)[0]);assert.equal(JSON.stringify(big.practice),saved);
  // A later first miss keeps an existing reminder's age.
  complete(api,big);big=ask(api,big,'facts-add',[7,6]);api.answer(big,wrongOf(big)[0]);
  assert.deepEqual(plain(big.practice.reminders),[{id:'add:7:6',created:0}]);assert.equal(big.practice.exposure['6:7'],1);
});

test('supported completion renews; warm, early and swapped repeats never clear; a due, unprimed first try clears',()=>{
  let s=ask(api,api.create(null,rng),'facts-add',[7,6]);complete(api,s,1);
  assert.deepEqual(plain(s.practice),{reminders:[{id:'add:7:6',created:1}],exposure:{'6:7':1},lastReturn:null});
  assert.deepEqual(plain(s.learning.history['facts-add']),[{serial:1,outcome:'retryCorrect1',misses:1}]);
  // Immediately again (not yet due): a clean answer leaves the reminder; only exposure moves.
  s=ask(api,s,'facts-add',[7,6]);complete(api,s);assert.deepEqual(plain(s.practice.reminders),[{id:'add:7:6',created:1}]);assert.equal(s.practice.exposure['6:7'],2);
  s=filler(api,s);
  // Due (3 − 1 ≥ 2) but primed by that warm repeat (3 − 2 < 2): still not cleared.
  s=ask(api,s,'facts-add',[7,6]);complete(api,s);assert.deepEqual(plain(s.practice.reminders),[{id:'add:7:6',created:1}]);
  // The swapped and inverse facts are different reminders and give no credit.
  s=filler(api,s);s=filler(api,s);
  for(const [family,operands] of [['facts-add',[6,7]],['facts-subtract',[13,6]]]){s=ask(api,s,family,operands);complete(api,s);}
  assert.deepEqual(plain(s.practice.reminders),[{id:'add:7:6',created:1}]);
  // Supported completion renews to the completed serial even when it was due.
  s=filler(api,s);s=filler(api,s);s=ask(api,s,'facts-add',[7,6]);complete(api,s,2);
  assert.deepEqual(plain(s.practice.reminders),[{id:'add:7:6',created:11}]);assert.equal(s.learning.serial,11);
  s=filler(api,s);s=filler(api,s);
  // An ordinary occurrence that was due and unprimed before completion clears without counting as a return.
  s=ask(api,s,'facts-add',[7,6]);assert.equal(s.question.returned,undefined);complete(api,s);
  assert.deepEqual(plain(s.practice.reminders),[]);assert.equal(s.practice.lastReturn,null);
  assert.ok(Object.values(s.learning.history).flat().every(row=>Object.keys(row).sort().join()==='misses,outcome,serial'));
});

test('a returned question keeps its marker through misses and reload, and renewal cannot evade the five-completion spacing',()=>{
  let s=ask(api,api.create(null,rng),'facts-add',[2,3]);complete(api,s,1);
  s=ask(api,s,'facts-add',[4,5]);complete(api,s,1);s=filler(api,s);s=filler(api,s);
  assert.equal(s.learning.serial,4);
  // Each build is forced onto the addition slot to isolate spacing from the family schedule.
  s.learning.position=0;assert.equal(api.next(s,rng),true);
  assert.equal(s.question.returned,true);assert.deepEqual(plain(s.question.operands),[2,3]);assert.equal(s.question.serial,5);
  assert.equal(new Set(s.question.choices).size,4);assert.ok(s.question.choices.includes(5));
  api.answer(s,wrongOf(s)[0]);s=api.normalize(plain(s));assert.equal(s.question.returned,true);
  const totals=[s.completed,s.firstTry,s.afterHelp];complete(api,s);
  assert.deepEqual([s.completed,s.firstTry,s.afterHelp],[totals[0]+1,totals[1],totals[2]+1]);
  assert.equal(s.practice.lastReturn,5);assert.deepEqual(plain(s.practice.reminders),[{id:'add:4:5',created:2},{id:'add:2:3',created:5}]);
  s=api.normalize(plain(s));assert.equal(s.question.returned,true);
  const serials=[];
  for(let i=0;i<6;i++){s.learning.position=0;api.next(s,rng);if(s.question.returned)serials.push(s.question.serial);complete(api,s);s=api.normalize(plain(s));}
  // add:4:5 was ready throughout, but only serial 10 is five completions after the return at 5.
  assert.deepEqual(serials,[10]);assert.equal(s.practice.lastReturn,10);
  assert.deepEqual(plain(s.practice.reminders),[{id:'add:2:3',created:5}]);
});

test('a 200-fact backlog drains through the real scheduler with both operations, sliding-five spacing and unchanged coverage',()=>{
  let s=api.create(null,rng);
  s.practice={reminders:allFacts().map(id=>({id,created:0})),exposure:Object.fromEntries(CATALOG.map(f=>[familyKey(f.id),0])),lastReturn:null};
  s=api.normalize(plain(s));assert.equal(s.practice.reminders.length,200);
  const {s:end,log}=run(api,s,3000,{draw:lcg(11)});
  windows(log);
  const served=log.filter(r=>r.returned);
  assert.ok(served.some(r=>r.family==='facts-add')&&served.some(r=>r.family==='facts-subtract'));
  assert.equal(end.practice.reminders.length,0,`left ${end.practice.reminders.length}`);
  // The family sequence is exactly the schedule's: a twin that never holds reminders sees the same families.
  let twin=api.create(null,rng);const sequence=[];
  for(let i=0;i<log.length;i++){sequence.push(twin.question.family);complete(api,twin);twin.practice=plain(EMPTY);api.next(twin,lcg(i+1));}
  assert.deepEqual(log.map(r=>r.family),sequence);
});

// Reminder versions (id@created) seen before `until` that never left the queue during the trace.
function unresolved(log,until){
  const first=new Map(),resolved=new Set();
  log.forEach((row,i)=>{const now=new Set(row.before.map(r=>`${r.id}@${r.created}`));for(const key of now)if(!first.has(key))first.set(key,i);for(const key of first.keys())if(!now.has(key))resolved.add(key);});
  return [...first].filter(([key,i])=>i<until&&!resolved.has(key));
}
test('a full backlog with continued misses, renewals and page changes keeps both operations served and every allowed debt moving',()=>{
  P.configure(187);
  let s=P.repair(P.create(null,lcg(3)),lcg(4)),returns=0;
  s.practice={reminders:allFacts().map(id=>({id,created:0})),exposure:Object.fromEntries(CATALOG.map(f=>[familyKey(f.id),0])),lastReturn:null};
  s=P.normalize(plain(s));
  // A third of ordinary questions are missed (some revealed); every third return is missed again and renews.
  const misses=(q,i)=>q.returned?(++returns%3===0?1:0):i%3===0?(i%9===0?3:1):0;
  const pageOf=id=>CURRICULUM.arithmeticPage(opOf(id),numbersOf(id));
  let segment=run(P,s,900,{draw:lcg(5),misses});windows(segment.log);s=segment.s;
  // Every one of the 200 original debts was served or practised again despite new misses joining the queue.
  assert.deepEqual(unresolved(segment.log,1),[]);
  for(const op of ['facts-add','facts-subtract'])assert.ok(segment.log.filter(r=>r.returned&&r.family===op).length>20,op);
  assert.ok(s.practice.reminders.length>0);
  // Lowering the page (through a new session) leaves out-of-scope debt dormant but intact.
  P.configure(102);s=P.repair(P.restart(s,null,lcg(6)),lcg(6));
  const dormant=plain(s.practice.reminders).filter(r=>pageOf(r.id)>102);assert.ok(dormant.length>0);
  segment=run(P,s,600,{draw:lcg(7),misses,allowedId:id=>pageOf(id)<=102});windows(segment.log,false);s=segment.s;
  for(const r of dormant)assert.ok(plain(s.practice.reminders).some(x=>x.id===r.id&&x.created===r.created),r.id);
  assert.ok(segment.log.some(r=>r.returned));
  // Raising it again lets the dormant debt return.
  P.configure(187);s=P.repair(P.restart(s,null,lcg(8)),lcg(8));
  segment=run(P,s,4000,{draw:lcg(9),misses});windows(segment.log);
  const log=segment.log,served=log.filter(r=>r.returned);
  for(const op of ['facts-add','facts-subtract'])assert.ok(served.filter(r=>r.family===op).length>20,op);
  for(const r of dormant)assert.ok(served.some(x=>x.id===r.id),`dormant ${r.id} returned`);
  // Each reminder version alive in the first quarter is served or practised again before the end.
  assert.deepEqual(unresolved(log,1000),[]);
  P.configure(187);
});

test('Mixed page authority gates reminders; 12 − 2 is a bigger problem at page 110, not a reminder',()=>{
  // 12 − 2 is subtract-no-borrow in Mixed (page 110), while Number facts' page rule would say 131.
  assert.equal(CURRICULUM.arithmeticPage('subtract-no-borrow',[12,2]),110);assert.equal(CURRICULUM.factPage('sub',12,2),131);
  assert.equal(P.valid('facts-subtract',[12,2]),false);assert.equal(P.factId('subtract-no-borrow',[12,2]),null);
  // For all 200 reminder facts the Mixed page used for gating equals the typed fact page.
  for(const f of CATALOG)assert.equal(CURRICULUM.arithmeticPage(opOf(f.id),[f.a,f.b]),CURRICULUM.factPage(f.op,f.a,f.b),f.id);
  P.configure(110);
  let s=ask(P,P.create(null,rng),'subtract-no-borrow',[12,2]);P.answer(s,11);complete(P,s);
  assert.deepEqual(plain(s.practice),EMPTY);
  // A lowered page replaces a disallowed pending missed fact without completing it, and keeps the debt.
  P.configure(187);s=ask(P,s,'facts-add',[7,6]);P.answer(s,wrongOf(s)[0]);
  const before=plain(s);P.configure(102);P.repair(s,rng);
  assert.notDeepEqual(plain(s.question.operands),[7,6]);assert.ok(CURRICULUM.arithmeticPage(s.question.family,s.question.operands)<=102);
  assert.deepEqual(plain(s.practice),before.practice);assert.deepEqual(plain(s.learning),before.learning);
  assert.deepEqual([s.completed,s.firstTry,s.afterHelp],[before.completed,before.firstTry,before.afterHelp]);
  // At page 103 (7 + 6's page) it is allowed again and returns at the addition slot once due.
  // The repair stored page 102, so the filler is a small fact from an unrelated family.
  P.configure(103);
  for(let i=0;i<3;i++){s=ask(P,s,'facts-add',[1,1]);complete(P,s);}
  s.learning.position=0;P.next(s,rng);assert.equal(s.question.returned,true);assert.deepEqual(plain(s.question.operands),[7,6]);
  P.configure(187);
});

test('restart and reload keep reminders, exposure and spacing without awards; all 200 facts fit with no eviction',()=>{
  let s=api.create(null,rng);
  for(const id of allFacts()){s=ask(api,s,opOf(id),numbersOf(id));api.answer(s,wrongOf(s)[0]);complete(api,s);}
  assert.equal(s.practice.reminders.length,200);assert.deepEqual(plain(s.practice.reminders).map(r=>r.id).sort(),allFacts().sort());
  const before=plain(s);s=ask(api,s,'facts-add',[0,0]);api.answer(s,wrongOf(s)[0]);
  assert.deepEqual(plain(s.practice.reminders),before.practice.reminders);
  const restarted=api.restart(plain(s),20,rng);
  assert.deepEqual(plain(restarted.practice),plain(s.practice));assert.deepEqual(plain(restarted.learning),plain(s.learning));
  assert.deepEqual([restarted.completed,restarted.firstTry,restarted.afterHelp,restarted.sequence],[0,0,0,0]);
  assert.deepEqual(plain(api.normalize(plain(restarted))),plain(restarted));
});

test('schema 1–3 migration carries only an unfinished missed fact, idempotently, without awards or history',()=>{
  for(const schemaVersion of [1,2])for(const complete of [false,true])for(let misses=0;misses<4;misses++) {
    const legacy={schemaVersion,startOffset:schemaVersion===1?0:4,sequence:0,target:5,completed:complete?1:0,firstTry:complete&&!misses?1:0,afterHelp:complete&&misses?1:0,
      question:{id:0,family:'facts-add',operands:[4,5],choices:[9,8,10,7],misses:[8,10,7].slice(0,misses),complete}};
    const state=api.normalize(plain(legacy));
    assert.deepEqual(plain(state.practice),!complete&&misses?{reminders:[{id:'add:4:5',created:0}],exposure:{'4:5':0},lastReturn:null}:EMPTY);
    assert.deepEqual([state.completed,state.firstTry,state.afterHelp],[legacy.completed,legacy.firstTry,legacy.afterHelp]);
    assert.equal(state.learning.history['facts-add'].length,0);
    assert.deepEqual(plain(api.normalize(plain(state))),plain(state));
  }
  // Schema 3: an unfinished missed fact is carried at the completed count; completed history is never replayed.
  let s=api.create(null,rng);for(let i=0;i<6;i++){complete(api,s,i%2);api.next(s,rng);}
  s=ask(api,s,'facts-subtract',[13,7]);api.answer(s,wrongOf(s)[0]);
  const v3=plain(s);v3.schemaVersion=3;delete v3.practice;v3.question.returned=true;
  const migrated=api.normalize(plain(v3));
  assert.deepEqual(plain(migrated.practice),{reminders:[{id:'sub:13:7',created:6}],exposure:{'6:7':6},lastReturn:null});
  assert.equal(migrated.question.returned,undefined);assert.deepEqual(plain(migrated.learning),v3.learning);
  assert.deepEqual([migrated.completed,migrated.firstTry,migrated.afterHelp],[v3.completed,v3.firstTry,v3.afterHelp]);
  assert.deepEqual(plain(api.normalize(plain(migrated))),plain(migrated));
  complete(api,migrated);const done=plain(migrated);done.schemaVersion=3;delete done.practice;
  assert.deepEqual(plain(api.normalize(done).practice),EMPTY);assert.deepEqual(plain(api.normalize(done).learning),done.learning);
  // A pending fact without misses carries nothing.
  const fresh=plain(ask(api,api.create(null,rng),'facts-add',[3,4]));fresh.schemaVersion=3;delete fresh.practice;
  assert.deepEqual(plain(api.normalize(fresh).practice),EMPTY);
});

test('damaged reminder data resets only that unit; core data and future schemas stay strict',()=>{
  let s=ask(api,api.create(null,rng),'facts-add',[2,3]);complete(api,s,1);s=ask(api,s,'facts-add',[4,5]);complete(api,s,1);s=filler(api,s);s=filler(api,s);
  s.learning.position=0;api.next(s,rng);assert.equal(s.question.returned,true);complete(api,s);
  s=ask(api,s,'facts-subtract',[13,7]);api.answer(s,wrongOf(s)[0]);
  const good=plain(s);assert.deepEqual(plain(api.normalize(good)),good);
  assert.deepEqual(good.practice,{reminders:[{id:'add:4:5',created:2},{id:'sub:13:7',created:5}],exposure:{'2:3':5,'4:5':2,'6:7':5},lastReturn:5});
  const seeded={reminders:[{id:'sub:13:7',created:5}],exposure:{'6:7':5},lastReturn:null};
  const core=x=>{const {practice,...rest}=plain(x);return rest;};
  for(const mutate of [p=>p.practice=null,p=>delete p.practice,p=>p.practice.reminders={},p=>p.practice.exposure=[],
    p=>p.practice.reminders.push({...p.practice.reminders[0]}),p=>p.practice.reminders[0].id='add:10:0',p=>p.practice.reminders[0].id='add:04:5',p=>p.practice.reminders[0].id='mul:2:3',
    p=>p.practice.reminders[0].created=-1,p=>p.practice.reminders[0].created=99,p=>p.practice.reminders[0].created=1.5,p=>p.practice.exposure['9:10']=1,
    p=>p.practice.exposure['4:5']=99,p=>delete p.practice.exposure['4:5'],p=>p.practice.lastReturn=0,p=>p.practice.lastReturn=99,p=>p.practice.lastReturn='5',
    p=>p.practice.reminders=Array.from({length:201},(_,i)=>({id:allFacts()[i%200],created:0}))]) {
    const bad=plain(good);mutate(bad);const restored=api.normalize(bad);
    assert.ok(restored,String(mutate));assert.deepEqual(core(restored),core(good),String(mutate));
    assert.deepEqual(plain(restored.practice),seeded,String(mutate));
  }
  // A completed return keeps its spacing even when the rest of the unit is reset.
  let t=ask(api,api.create(null,rng),'facts-add',[2,3]);complete(api,t,1);t=filler(api,t);t=filler(api,t);
  t.learning.position=0;api.next(t,rng);assert.equal(t.question.returned,true);complete(api,t);assert.equal(t.practice.lastReturn,4);
  for(const mutate of [p=>p.practice.exposure='broken',p=>p.practice.lastReturn=1]){const bad=plain(t);mutate(bad);assert.deepEqual(plain(api.normalize(bad).practice),{...EMPTY,lastReturn:4},String(mutate));}
  // Malformed or impossible returned markers are dropped; the question, history and reminders stay.
  for(const mutate of [q=>q.returned='yes',q=>q.returned=false]){const bad=plain(good);mutate(bad.question);const restored=api.normalize(bad);assert.equal(restored.question.returned,undefined);assert.deepEqual(plain(restored.practice),good.practice);}
  const atSlot=plain(good);atSlot.question.returned=true;assert.equal(api.normalize(atSlot).question.returned,true);
  const bigger=plain(filler(api,api.normalize(plain(good))));bigger.question.returned=true;
  const restoredBigger=api.normalize(bigger);assert.ok(restoredBigger);assert.equal(restoredBigger.question.returned,undefined);
  // Core corruption is still rejected even with valid reminders, and schema 5 is a future save.
  for(const mutate of [p=>p.schemaVersion=5,p=>p.learning.history['facts-add'][0].misses=0,p=>p.question.serial=99,p=>p.completed=99])
    {const bad=plain(good);mutate(bad);assert.equal(api.normalize(bad),null,String(mutate));}
});
