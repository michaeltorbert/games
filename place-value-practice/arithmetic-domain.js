// DOM-free arithmetic content and saved-session validation. No place-value state.
const PLACE_ARITHMETIC = (() => {
  'use strict';
  const source = (introducedOnPage, coverageThroughPage) => Object.freeze({
    worktext: 'Math Mammoth Grade 1-B', edition: 2026, introducedOnPage, coverageThroughPage,
  });
  const FAMILIES = Object.freeze({
    'facts-add': { source: source(102, 123), valid: ([a,b]) => a >= 0 && b >= 0 && a <= 20 && b <= 20 && a+b <= 20, answer: ([a,b]) => a+b, text: ([a,b]) => `${a} + ${b}` },
    'facts-subtract': { source: source(131,143), valid: ([a,b]) => a >= 0 && a <= 20 && b >= 0 && b <= a, answer: ([a,b]) => a-b, text: ([a,b]) => `${a} − ${b}` },
    'add-no-carry': { source: source(108,114), valid: ([a,b]) => a >= 10 && a <= 99 && b >= 0 && b <= 99 && a+b <= 99 && a%10+b%10 < 10, answer: ([a,b]) => a+b, text: ([a,b]) => `${a} + ${b}` },
    'add-carry': { source: source(119,121), valid: ([a,b]) => a >= 10 && a <= 99 && b >= 1 && b <= 99 && a+b <= 100 && a%10+b%10 >= 10, answer: ([a,b]) => a+b, text: ([a,b]) => `${a} + ${b}` },
    'complete-ten': { source: source(117,117), valid: ([a,b]) => a >= 1 && a <= 99 && a%10 !== 0 && b === 10-a%10, answer: ([a,b]) => b, text: ([a,b]) => `${a} + ? = ${a+b}` },
    'missing-addend': { source: source(129,139), valid: ([a,b]) => a >= 0 && a <= 99 && b >= 0 && b <= 99 && a+b <= 100 && (a+b <= 20 || a%10+b%10 < 10 || ((a+b)%10 === 0 && b <= 9)), answer: ([a,b]) => b, text: ([a,b]) => `${a} + ? = ${a+b}` },
    'subtract-no-borrow': { source: source(110,137), valid: ([a,b]) => a >= 10 && a <= 99 && b >= 0 && b <= a && a%10 >= b%10, answer: ([a,b]) => a-b, text: ([a,b]) => `${a} − ${b}` },
    'tens-minus-digit': { source: source(142,143), valid: ([a,b]) => a >= 20 && a <= 100 && a%10 === 0 && b >= 1 && b <= 9, answer: ([a,b]) => a-b, text: ([a,b]) => `${a} − ${b}` },
    'three-addends': { source: source(103,124), size: 3, valid: ([a,b,c]) => a >= 0 && b >= 0 && c >= 0 && a+b+c <= 20, answer: ([a,b,c]) => a+b+c, text: ([a,b,c]) => `${a} + ${b} + ${c}` },
    'repeated-subtraction': { source: source(39,39), size: 3, valid: ([a,b,c]) => a >= 0 && a <= 10 && b >= 0 && c >= 0 && b+c <= a, answer: ([a,b,c]) => a-b-c, text: ([a,b,c]) => `${a} − ${b} − ${c}` },
  });
  Object.values(FAMILIES).forEach(Object.freeze);
  // Legacy fixed cycle, retained only for schema 1/2 validation and the content
  // generator oracle. New sessions use the fixed + adaptive schedule below.
  const MIX = Object.freeze(['facts-add','facts-subtract','add-no-carry','add-carry','facts-add','facts-subtract','complete-ten','missing-addend','subtract-no-borrow','tens-minus-digit','three-addends','repeated-subtraction']);
  const SCHEMA_VERSION = 3;
  const ORDER = Object.freeze(Object.keys(FAMILIES));
  const COVERAGE = Object.freeze(ORDER.slice(2));
  const OUTCOMES = Object.freeze(['firstTry','retryCorrect1','retryCorrect2','revealed']);
  const HISTORY_LIMIT = 20;
  const advanceSeed = seed => (Math.imul(seed,1664525)+1013904223) >>> 0;
  const newLearning = seed => ({serial:0,position:0,seed,history:Object.fromEntries(ORDER.map(f=>[f,[]]))});
  // Policy, not mastery: latest support gets the largest boost, then fades
  // after four independent successes. Five first tries reduce only extra slots.
  function familyWeight(learning,family) {
    const recent=learning.history[family].slice(-8), last=recent.at(-1);
    if(last && last.misses>=2)return 3;
    if(last && last.misses===1)return 2;
    if(recent.slice(-4).some(row=>row.misses>0))return 1.5;
    if(recent.length>=5 && recent.slice(-5).every(row=>row.outcome==='firstTry'))return .5;
    return 1;
  }
  function selectFamily(learning) {
    const p=learning.position, phase=p%5, block=Math.floor(p/5);
    if(phase===0 || phase===3)return phase===0?'facts-add':'facts-subtract';
    if(phase===1 || phase===4)return COVERAGE[block*2+(phase===4?1:0)];
    const weights=ORDER.map(f=>familyWeight(learning,f));
    let cursor=learning.seed/4294967296*weights.reduce((a,b)=>a+b,0);
    for(let i=0;i<ORDER.length;i++){cursor-=weights[i];if(cursor<0)return ORDER[i];}
    return ORDER.at(-1);
  }
  function normalizeLearning(raw) {
    if(!raw || !integer(raw.serial) || raw.serial>=Number.MAX_SAFE_INTEGER || !integer(raw.position) || raw.position>=20
      || !integer(raw.seed) || raw.seed>4294967295 || !raw.history || typeof raw.history!=='object')return null;
    const result=newLearning(raw.seed), serials=new Set();
    result.serial=raw.serial;result.position=raw.position;
    for(const family of ORDER) {
      const rows=raw.history[family];
      if(!Array.isArray(rows) || rows.length>HISTORY_LIMIT)return null;
      let previous=0;
      for(const row of rows) {
        if(!row || !integer(row.serial) || row.serial<=previous || row.serial>raw.serial || serials.has(row.serial)
          || !integer(row.misses) || row.misses>3 || row.outcome!==OUTCOMES[row.misses])return null;
        result.history[family].push({serial:row.serial,outcome:row.outcome,misses:row.misses});
        previous=row.serial;serials.add(row.serial);
      }
    }
    if(raw.serial>0 && !serials.has(raw.serial))return null;
    return result;
  }
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const valid = (family, operands) => Object.hasOwn(FAMILIES, family) && Array.isArray(operands)
    && operands.length === (FAMILIES[family].size || 2) && operands.every(integer) && FAMILIES[family].valid(operands);
  const pools = new Map();
  function pool(family) {
    if (!pools.has(family)) {
      const tuples = [], max = ['facts-add','facts-subtract','three-addends'].includes(family) ? 20 : family === 'repeated-subtraction' ? 10 : 100;
      for (let a=0;a<=max;a++) for(let b=0;b<=max;b++) {
        if (FAMILIES[family].size === 3) { for(let c=0;c<=max;c++) if(valid(family,[a,b,c])) tuples.push([a,b,c]); }
        else if(valid(family,[a,b])) tuples.push([a,b]);
      }
      pools.set(family, tuples);
    }
    return pools.get(family);
  }
  function draw(rng, length) { const n = Number(rng()); return Math.floor(Math.max(0,Math.min(.999999999, Number.isFinite(n) ? n : .5))*length); }
  const offsetValid = offset => integer(offset) && offset < MIX.length;
  const slot = (sequence, startOffset) => (sequence % MIX.length + startOffset) % MIX.length;
  function question(sequence, rng = Math.random, startOffset = 0) {
    if (!offsetValid(startOffset)) throw new RangeError('Invalid arithmetic start offset');
    return buildQuestion(sequence,MIX[slot(sequence,startOffset)],rng);
  }
  function buildQuestion(sequence,family,rng) {
    const tuples = pool(family), operands = [...tuples[draw(rng,tuples.length)]];
    const answer = FAMILIES[family].answer(operands), choices = [answer];
    for (const n of [answer-1,answer+1,answer-2,answer+2,answer-3,answer+3,0,100]) if (n >= 0 && n <= 100 && !choices.includes(n) && choices.length<4) choices.push(n);
    for(let i=choices.length-1;i>0;i--) { const j=draw(rng,i+1); [choices[i],choices[j]]=[choices[j],choices[i]]; }
    return { id: sequence, family, operands, choices, misses: [], complete: false };
  }
  function scheduledQuestion(sequence,learning,rng) {
    return {...buildQuestion(sequence,selectFamily(learning),rng),serial:learning.serial+1};
  }
  function create(target=10, rng=Math.random) {
    const learning=newLearning(draw(rng,4294967296));
    return {schemaVersion:SCHEMA_VERSION,sequence:0,target:[5,10,20,null].includes(target)?target:10,
      completed:0,firstTry:0,afterHelp:0,learning,question:scheduledQuestion(0,learning,rng)};
  }
  // Continue after completed slots; an abandoned question does not consume a slot.
  function restart(state, target=10, rng=Math.random) {
    const saved=normalize(state);
    if(!saved)throw new RangeError('Invalid arithmetic restart state');
    const learning=saved.learning;
    return {schemaVersion:SCHEMA_VERSION,sequence:0,target:[5,10,20,null].includes(target)?target:10,
      completed:0,firstTry:0,afterHelp:0,learning,question:scheduledQuestion(0,learning,rng)};
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || ![1,2,SCHEMA_VERSION].includes(raw.schemaVersion)) return null;
    const legacy=raw.schemaVersion<3;
    const startOffset = raw.schemaVersion === 1 ? 0 : raw.startOffset;
    if (legacy && !offsetValid(startOffset)) return null;
    if (![raw.sequence,raw.completed,raw.firstTry,raw.afterHelp].every(integer) || ![5,10,20,null].includes(raw.target)
      || raw.firstTry+raw.afterHelp !== raw.completed || (raw.target !== null && raw.completed > raw.target)) return null;
    const q=raw.question;
    if (!q || q.id !== raw.sequence || !valid(q.family,q.operands) || (legacy && q.family !== MIX[slot(raw.sequence,startOffset)])
      || typeof q.complete !== 'boolean' || !Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices).size !== 4
      || !q.choices.every(n=>integer(n)&&n<=100) || !q.choices.includes(FAMILIES[q.family].answer(q.operands))
      || !Array.isArray(q.misses) || new Set(q.misses).size !== q.misses.length
      || !q.misses.every(n=>q.choices.includes(n)&&n!==FAMILIES[q.family].answer(q.operands))
      || raw.completed !== raw.sequence + (q.complete ? 1 : 0)
      || (q.complete && (q.misses.length ? raw.afterHelp : raw.firstTry) < 1)) return null;
    const learning=legacy?newLearning(0x6d2b79f5):normalizeLearning(raw.learning);
    if(!learning)return null;
    const restored={id:q.id,family:q.family,operands:[...q.operands],choices:[...q.choices],misses:[...q.misses],complete:q.complete,
      serial:legacy?(q.complete?0:1):q.serial};
    // A migrated active attempt retains its old family. Its completion records
    // evidence, but the new twenty-slot schedule starts with the next question.
    if(legacy || Object.hasOwn(q,'legacyOffset')) {
      const offset=legacy?startOffset:q.legacyOffset;
      if(!offsetValid(offset) || q.family!==MIX[slot(q.id,offset)] || learning.serial>(q.complete?1:0) || learning.position!==0)return null;
      restored.legacyOffset=offset;
    }
    if(!integer(restored.serial) || restored.serial!==learning.serial+(q.complete?0:1))return null;
    if(q.complete && restored.serial>0) {
      const last=learning.history[q.family].at(-1);
      if(!last || last.serial!==restored.serial || last.misses!==q.misses.length)return null;
    } else if(!q.complete && !Object.hasOwn(restored,'legacyOffset') && q.family!==selectFamily(learning))return null;
    if(q.complete && restored.serial===0 && !Object.hasOwn(restored,'legacyOffset'))return null;
    return {schemaVersion:SCHEMA_VERSION,sequence:raw.sequence,target:raw.target,completed:raw.completed,firstTry:raw.firstTry,afterHelp:raw.afterHelp,learning,question:restored};
  }
  function answer(state, value) {
    const q=state.question;
    if(q.complete || !q.choices.includes(value) || q.misses.includes(value)) return false;
    if(value !== FAMILIES[q.family].answer(q.operands)) q.misses.push(value);
    else {
      if(state.learning.serial>=Number.MAX_SAFE_INTEGER-1 || state.completed>=Number.MAX_SAFE_INTEGER-1)return false;
      q.complete=true; state.completed++; state[q.misses.length?'afterHelp':'firstTry']++;
      const learning=state.learning;
      learning.serial=q.serial;
      learning.history[q.family].push({serial:q.serial,outcome:OUTCOMES[q.misses.length],misses:q.misses.length});
      learning.history[q.family]=learning.history[q.family].slice(-HISTORY_LIMIT);
      if(!Object.hasOwn(q,'legacyOffset'))learning.position=(learning.position+1)%20;
      learning.seed=advanceSeed(learning.seed);
    }
    return true;
  }
  function next(state,rng=Math.random) {
    if(!state.question.complete || (state.target !== null && state.completed >= state.target)) return false;
    state.sequence++; state.question=scheduledQuestion(state.sequence,state.learning,rng); return true;
  }
  function view(state) { const q=state.question, family=FAMILIES[q.family], result=family.answer(q.operands);
    return {family:q.family,prompt:family.text(q.operands)+(q.family==='complete-ten'||q.family==='missing-addend'?'':' = ?'),
      worked:q.family==='complete-ten'||q.family==='missing-addend'?`${q.operands[0]} + ${result} = ${q.operands[0]+result}`:`${family.text(q.operands)} = ${result}`,
      answer:result,source:family.source}; }
  return Object.freeze({ SCHEMA_VERSION,FAMILIES,MIX,HISTORY_LIMIT,familyWeight,selectFamily,valid,question,create,restart,normalize,answer,next,view });
})();
globalThis.PLACE_ARITHMETIC = PLACE_ARITHMETIC;
