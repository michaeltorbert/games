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
test('family selection is independent of construction RNG and restored state is deterministic',()=>{
  let a=api.create(null,rng),b=api.create(null,rng);
  for(let i=0;i<50;i++) {
    assert.equal(a.question.family,b.question.family);finish(a,i%4);finish(b,i%4);
    a=api.normalize(plain(a));b=api.restart(b,null,()=>.9);api.next(a,()=>.01);
    assert.deepEqual(plain(a.learning),plain(b.learning));
  }
  let x=api.create(null,rng),y=api.create(null,rng);
  for(let i=0;i<30;i++){assert.deepEqual(plain(x),plain(y));finish(x);finish(y);api.next(x,rng);api.next(y,rng);}
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
  for(const mutate of [s=>s.schemaVersion=4,s=>s.learning.serial=-1,s=>s.learning.position=20,s=>s.learning.seed=4294967296,
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
