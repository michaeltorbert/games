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
