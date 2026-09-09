import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../place-value-practice/arithmetic-domain.js',import.meta.url),'utf8'),context);
const api=context.PLACE_ARITHMETIC;
const plain=x=>JSON.parse(JSON.stringify(x));
test('fixed production mixing covers every family, exact facts, four choices, and independent arithmetic oracle',()=>{
  const seen=new Set(),facts=new Set();
  for(let sequence=0;sequence<api.MIX.length;sequence++) for(let step=0;step<10000;step++) {
    const q=api.question(sequence,()=>step/10000),[a,b,c]=q.operands;
    seen.add(q.family);facts.add(`${q.family}:${q.operands.join(',')}`);
    assert.equal(api.valid(q.family,q.operands),true);
    const expected=q.family==='complete-ten'||q.family==='missing-addend'?b:q.family.includes('subtract')||q.family==='tens-minus-digit'?a-b-(c||0):a+b+(c||0);
    assert.equal(api.view({question:q}).answer,expected);
    assert.equal(new Set(q.choices).size,4);assert.ok(q.choices.includes(expected));
    assert.ok(expected>=0&&expected<=100);
    if(q.family==='subtract-no-borrow')assert.ok(a%10>=b%10);
    if(q.family==='add-no-carry')assert.ok(a%10+b%10<10);
    if(q.family==='add-carry')assert.ok(a%10+b%10>=10);
  }
  assert.deepEqual([...seen].sort(),Object.keys(api.FAMILIES).sort());
  assert.ok(facts.has('facts-add:7,6'));assert.ok(facts.has('facts-subtract:14,7'));
  assert.equal(api.valid('missing-addend',[18,34]),false);
  assert.equal(api.valid('missing-addend',[7,36]),false);
  assert.equal(api.valid('missing-addend',[38,2]),true);
  for(const pair of [[52,18],[43,7],[21,14]]) for(const family of ['facts-subtract','subtract-no-borrow','tens-minus-digit'])assert.equal(api.valid(family,pair),false);
});
test('reload validates operands, recomputes answers, retains choices/misses and counts completion once',()=>{
  let state=api.create(5,()=>.3);const expected=api.view(state).answer;
  const wrong=state.question.choices.find(n=>n!==expected);
  api.answer(state,wrong);state=api.normalize({...plain(state),answer:999,source:'untrusted'});
  assert.deepEqual(plain(state.question.misses),[wrong]);assert.equal(api.view(state).answer,expected);
  api.answer(state,expected);assert.equal(api.answer(state,expected),false);
  assert.equal(api.normalize({...plain(state),firstTry:1,afterHelp:0}),null);
  state=api.normalize(plain(state));assert.equal(state.completed,1);assert.equal(state.afterHelp,1);assert.equal(state.question.complete,true);
  assert.equal(api.answer(state,wrong),false);api.next(state,()=>.3);assert.equal(state.sequence,1);
  assert.equal(api.normalize({...plain(state),schemaVersion:api.SCHEMA_VERSION+1}),null);
  assert.equal(api.normalize({...plain(state),completed:4}),null);
  const bad=plain(state);bad.question.operands=[200,2];assert.equal(api.normalize(bad),null);
});

const rng=()=>.3;
const familyCycle=['facts-add','facts-subtract','add-no-carry','add-carry','facts-add','facts-subtract',
  'complete-ten','missing-addend','subtract-no-borrow','tens-minus-digit','three-addends','repeated-subtraction'];
function finishQuestion(state) { assert.equal(api.answer(state,api.view(state).answer),true); }
test('completed short sessions continue the fixed cycle from every offset, including wraparound',()=>{
  for(let offset=0;offset<12;offset++) for(const [target,sessions] of [[5,3],[10,2],[20,1],[null,1]]) {
    let state=api.create(target,rng,offset);const families=[];
    for(let session=0;session<sessions;session++) {
      for(let i=0;i<(target??12);i++) {
        families.push(state.question.family);assert.equal(state.question.id,i);
        finishQuestion(state);
        assert.equal(api.answer(state,api.view(state).answer),false);
        if(i<(target??12)-1)assert.equal(api.next(state,rng),true);
      }
      const old=plain(state);state=api.restart(state,target,rng);
      assert.equal(state.sequence,0);assert.equal(state.completed,0);assert.equal(state.firstTry,0);assert.equal(state.afterHelp,0);
      assert.equal(state.question.complete,false);assert.deepEqual(plain(state.question.misses),[]);
      assert.equal(old.completed,target??12);
    }
    assert.equal(new Set(families).size,10);
    const repeated=familyCycle.concat(familyCycle,familyCycle,familyCycle);
    assert.deepEqual(families,repeated.slice(offset,offset+families.length));
  }
});
test('restart consumes only completed questions, before and after Next, and never changes its source',()=>{
  let state=api.create(null,rng,11);
  assert.equal(api.restart(state,5,rng).startOffset,11);
  for(const wrong of state.question.choices.filter(n=>n!==api.view(state).answer))api.answer(state,wrong);
  const revealed=plain(state);
  assert.equal(api.restart(state,5,rng).startOffset,11);assert.deepEqual(plain(state),revealed);
  finishQuestion(state);const completed=plain(state);
  assert.equal(api.restart(state,10,rng).startOffset,0);assert.deepEqual(plain(state),completed);
  api.next(state,rng);assert.equal(api.restart(state,20,rng).startOffset,0);
  finishQuestion(state);api.next(state,rng);
  assert.equal(api.restart(state,null,rng).startOffset,1);
  assert.equal(state.completed,2);assert.equal(state.afterHelp,1);assert.equal(state.firstTry,1);
});
test('schema one migration preserves unanswered, missed, revealed and completed legacy attempts',()=>{
  // Literal v1 fixtures are independent of the new create()/question() schema.
  for(const sequence of [0,4]) for(const misses of [[],[8],[8,10,7]]) for(const complete of [false,true]) {
    const legacy={schemaVersion:1,sequence,target:5,completed:sequence+(complete?1:0),
      firstTry:sequence+(complete&&!misses.length?1:0),afterHelp:complete&&misses.length?1:0,
      question:{id:sequence,family:'facts-add',operands:[4,5],choices:[9,8,10,7],misses,complete}};
    const normalized=api.normalize(legacy);
    assert.deepEqual(plain(normalized),{...legacy,schemaVersion:2,startOffset:0});
    assert.deepEqual(plain(api.normalize({...legacy,startOffset:11})),plain(normalized));
    if(!complete)finishQuestion(normalized);
    assert.equal(api.answer(normalized,9),false);
    assert.equal(normalized.completed,sequence+1);
    assert.deepEqual(plain(api.normalize(plain(normalized))),plain(normalized));
    if(sequence===0){assert.equal(api.next(normalized,rng),true);assert.equal(normalized.question.family,'facts-subtract');}
    else assert.equal(api.next(normalized,rng),false);
  }
});
test('schema two strictly validates offsets, family alignment and safe modulo arithmetic',()=>{
  const state=plain(api.create(10,rng,10));
  for(const offset of [undefined,null,-1,12,1.5,'2',Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(api.normalize({...state,startOffset:offset}),null);
    assert.throws(()=>api.restart({...state,startOffset:offset},5,rng),{name:'RangeError'});
    if(offset!==undefined)assert.throws(()=>api.create(5,rng,offset),{name:'RangeError'});
  }
  for(const completed of [-1,1.5,undefined,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>api.restart({...state,completed},5,rng),{name:'RangeError'});
  assert.equal(api.normalize({...state,schemaVersion:1}),null);
  assert.equal(api.normalize({...state,startOffset:9}),null);
  assert.deepEqual(plain(api.normalize(state)),state);
  for(const offset of [0,10,11]) {
    const sequence=Number.MAX_SAFE_INTEGER;
    const q=api.question(sequence,rng,offset);
    const expected=Number((BigInt(sequence)+BigInt(offset))%12n);
    assert.equal(q.family,familyCycle[expected]);
    const large={schemaVersion:2,startOffset:offset,sequence,target:null,completed:sequence,firstTry:sequence,afterHelp:0,question:q};
    assert.ok(api.normalize(large));
    assert.equal(api.restart(large,5,rng).startOffset,expected);
  }
});
