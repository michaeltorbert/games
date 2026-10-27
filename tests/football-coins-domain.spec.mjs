import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const root=new URL('../',import.meta.url), context=vm.createContext({});
for(const name of ['shared/curriculum.js','football/opponent.js','football/football-domain.js','football/copy.js','football/contextual-questions.js'])vm.runInContext(await readFile(new URL(name,root),'utf8'),context,{filename:name});
const api=context.FOOTBALL_CONTEXTUAL_QUESTIONS, domain=context.FOOTBALL_DOMAIN;
const plain=value=>JSON.parse(JSON.stringify(value)), total=set=>set.reduce((n,v)=>n+v,0);
const profile=page=>({worktexts:{'Math Mammoth Grade 1-B':{edition:2026,completedThroughPage:page}}});
const match={schemaVersion:1,player:{id:'duke',displayName:'Duke',shortName:'DUKE',endZoneName:'DUKE'},opponent:{id:'unc',displayName:'UNC',shortName:'UNC',endZoneName:'UNC'}};
function play(sequence=1,side='offense'){
 const direction=side==='offense'?1:-1,yardLine=side==='offense'?20:80;
 const c={contextId:`coins-context-${sequence}`,match,possession:side,direction,quarter:1,down:1,yardsToGo:10,yardLine,firstDownLine:yardLine+direction*10,driveStart:yardLine,scores:{player:0,opponent:0},totalYards:{player:0,opponent:0},plays:0,drivePlays:0,calls:{offense:'shortRun',defense:side==='defense'?'run':null,matchup:side==='defense'?'matched':null},privateOpponentSnapshot:null};
 if(side==='defense')c.privateOpponentSnapshot={opponentId:'unc',profileKey:'balanced',look:{key:'balanced',label:'Balanced set',alignment:'Singleback',leanKeys:['balanced']},lean:{key:'balanced',label:'Run or pass',runWeight:0.5,passWeight:0.5},weights:{shortRun:0.2,shortPass:0.2,longRun:0.2,mediumPass:0.2,longPass:0.2},plannedCallKey:'shortRun',tendency:{profileKey:'balanced'}};
 const snap=domain.createSnap(c,{gain:4,callKey:'shortRun',label:'Run'});
 return domain.createActivePlay({schemaVersion:1,playType:'scrimmage',gameId:'coin-test-game',possessionId:`coin-test-${side}`,playId:`coin-test-${sequence}`,contextId:c.contextId,context:snap.context,proposal:snap.proposal,call:snap.call});
}
function oracle(q){
 const f=q.coinFixture.facts,k=q.familyId.slice(5);
 if(q.coinFixture.sets){
  return q.choices.filter(choice=>{
   const sets=choice.coinSets;
   const target=f.target;
   if(!sets.every(set=>total(set)===target))return false;
   if(f.constraints&&!sets.every(set=>set.filter(v=>v===25).length===f.constraints.quarters))return false;
   if(k==='two-ways')return sets.length===2&&JSON.stringify([...sets[0]].sort())!==JSON.stringify([...sets[1]].sort());
   return sets.length===1;
  }).map(c=>c.id);
 }
 const expected=k==='dollar'?100:k==='make-nickels'?f.target/5:k==='complete-quarters'?(f.target-total(f.coins))/25:f.add!==null?total(f.coins)+f.add:f.price!==null?total(f.coins)-f.price:f.target!==null?f.target-total(f.coins):total(f.coins);
 assert.equal(q.answer.value,expected,q.familyId);
 return q.choices.filter(c=>c.value===expected).map(c=>c.id);
}
test('every exact source boundary is completion-only, independently mapped, and preserves ordinary fallback',()=>{
 assert.equal(api.IN_GAME_COIN_FAMILIES.length,26);
 assert.deepEqual(plain(api.COIN_SOURCE_MAP),plain(context.MATH_CURRICULUM.COIN_SOURCE_MAP));
 for(const [id,page] of Object.entries(api.COIN_SOURCE_MAP)){
  assert.throws(()=>api.build(play(),id,{profile:profile(page-1)}),e=>e.code==='curriculum-not-included');
  const q=api.build(play(),id,{profile:profile(page)});
  assert.equal(q.introducedOnPage,page);assert.equal(q.coverageThroughPage,page);assert.equal(q.worktext,'Math Mammoth Grade 1-B');assert.equal(q.edition,2026);
  assert.equal(api.sourceStatus(q,profile(page)).guided,false);
  assert.ok(api.inspect(play(),profile(page)).eligible.some(e=>e.familyId===id));
 }
 const baseline=api.inspect(play(),profile(169)).eligible;
 assert.ok(baseline.length);assert.ok(baseline.every(e=>!e.familyId.startsWith('coin-')));
 assert.ok(api.IN_GAME_COIN_FAMILIES.every(id=>!api.sourceStatus(api.FAMILY_REGISTRY.scrimmage.find(f=>f.familyId===id),api.DEFAULT_PROFILE).included));
});
test('bounded identity sweep independently grades every choice, denomination, amount, support and exact source variant',()=>{
 for(const side of ['offense','defense'])for(let n=1;n<=18;n++)for(const id of api.IN_GAME_COIN_FAMILIES){
  const p=play(n,side), q=api.build(p,id,{profile:profile(181)}),f=q.coinFixture.facts;
  assert.deepEqual(plain(q.coinFixture),plain(api.coinFixtureFor(p,id)));
  assert.deepEqual(plain(oracle(q)),[q.correctChoiceId]);
  for(const coins of [f.coins,f.referenceCoins,...(q.coinFixture.sets||[]).flat()]){
   assert.ok(total(coins)<=100);assert.ok(coins.every(v=>[1,5,10,25].includes(v)));
   if(q.introducedOnPage<176)assert.ok(!coins.includes(25),id);
   if(q.introducedOnPage===171)assert.ok(!(coins.includes(10)&&coins.includes(5)&&coins.includes(1)),`${id}: p171 does not allow a general three-denomination mix`);
   if(q.introducedOnPage===176)assert.ok(!(coins.includes(25)&&coins.includes(10)&&coins.includes(5)),`${id}: p176 has QD or QN, not QDN`);
   if(q.introducedOnPage===180)assert.ok(coins.filter(v=>v===25).length<=2,`${id}: p180 at most two quarters`);
  }
  for(const amount of [f.target,f.price,typeof q.answer.value==='number'?q.answer.value:null])if(amount!==null)assert.ok(amount>=0&&amount<=100);
  assert.equal(q.evidenceClass,id==='coin-dollar'?'literacy':'independent');
  if(id==='coin-count-quarters')assert.ok(f.coins.length>=2,'A one-coin labeled total would be source-visible literacy, not this independent family.');
  for(const stage of ['initial','guided'])if(q.evidenceClass==='independent'){
   assert.equal(q.visuals[stage].result,null);assert.equal(q.visuals[stage].revealsAnswer,false);
   assert.ok(!q.visuals[stage].ariaLabel.includes('Answer:'));
  }
  assert.equal(q.visuals.worked.result.value,q.answer.value);
  assert.equal(q.workedReview.familyId,id);assert.equal(q.workedReview.steps.length,2);
  assert.ok(q.explain.length>40);assert.ok(Object.isFrozen(q.workedReview.steps));
  assert.deepEqual(plain(q),plain(api.build(p,id,{profile:profile(181)})));
  const other=api.build(p,id,{profile:profile(181),presentationRng:()=>0});
  assert.deepEqual(plain(q.choices).sort((a,b)=>a.id.localeCompare(b.id)),plain(other.choices).sort((a,b)=>a.id.localeCompare(b.id)));
 }
});
// Evaluate the actual live validator with only its live completion authority
// substituted. This tests production validation, not a test reimplementation.
const football=await readFile(new URL('football/football.js',root),'utf8');
const trusted=football.slice(football.indexOf('function trustedCoinFixture('),football.indexOf('function validateQuestionInstance('));
context.coinLiveProfile=profile(181);
vm.runInContext(`${football.slice(football.indexOf('function sameContractValue('),football.indexOf('function validReviewCopy('))}\nfunction contextualQuestionProfile(){return coinLiveProfile;}\n${trusted}\nglobalThis.validateCoin=trustedCoinFixture;`,context);
const attach=q=>domain.deepFreeze({...domain.clone(q),contextId:'coins-context-1',questionInstanceId:'question-1'});
test('live validator rejects all contract field changes, stale public identity, ineligible completion and laundering',()=>{
 const p=play();
 for(const id of api.IN_GAME_COIN_FAMILIES){
  const original=api.build(p,id,{profile:profile(181)});const q=attach(original);
  assert.ok(context.validateCoin(p,q));
  for(const key of Object.keys(original)){
   const changed=domain.clone(q);changed[key]=original[key]===null?'altered':null;
   assert.throws(()=>context.validateCoin(p,domain.deepFreeze(changed)),undefined,`${id}:${key}`);
  }
  for(const stage of ['initial','guided','worked']){
   const changed=domain.clone(q);changed.visuals[stage].ariaLabel='changed';
   assert.throws(()=>context.validateCoin(p,domain.deepFreeze(changed)));
  }
  assert.throws(()=>context.validateCoin(play(2),q));
  context.coinLiveProfile=profile(api.COIN_SOURCE_MAP[id]-1);
  assert.throws(()=>context.validateCoin(p,q));context.coinLiveProfile=profile(181);
  const foreign=domain.deepFreeze({...q,familyId:'yards-to-go-read'});
  assert.throws(()=>context.validateCoin(p,foreign));
  assert.throws(()=>context.validateCoin(p,domain.deepFreeze({...q,timeFixture:{}})));
 }
});
