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
  assert.equal(api.normalize({...plain(state),schemaVersion:2}),null);
  assert.equal(api.normalize({...plain(state),completed:4}),null);
  const bad=plain(state);bad.question.operands=[200,2];assert.equal(api.normalize(bad),null);
});
