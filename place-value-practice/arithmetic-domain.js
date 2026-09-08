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
  // Fixed family-first mixing: basic facts occupy four of twelve slots. This
  // sequence never consumes or changes a place-value review/adaptation counter.
  const MIX = Object.freeze(['facts-add','facts-subtract','add-no-carry','add-carry','facts-add','facts-subtract','complete-ten','missing-addend','subtract-no-borrow','tens-minus-digit','three-addends','repeated-subtraction']);
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
  function question(sequence, rng = Math.random) {
    const family = MIX[sequence % MIX.length], tuples = pool(family), operands = [...tuples[draw(rng,tuples.length)]];
    const answer = FAMILIES[family].answer(operands), choices = [answer];
    for (const n of [answer-1,answer+1,answer-2,answer+2,answer-3,answer+3,0,100]) if (n >= 0 && n <= 100 && !choices.includes(n) && choices.length<4) choices.push(n);
    for(let i=choices.length-1;i>0;i--) { const j=draw(rng,i+1); [choices[i],choices[j]]=[choices[j],choices[i]]; }
    return { id: sequence, family, operands, choices, misses: [], complete: false };
  }
  function create(target=10, rng=Math.random) { return { schemaVersion:1, sequence:0, target: [5,10,20,null].includes(target)?target:10, completed:0, firstTry:0, afterHelp:0, question:question(0,rng) }; }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1) return null;
    if (![raw.sequence,raw.completed,raw.firstTry,raw.afterHelp].every(integer) || ![5,10,20,null].includes(raw.target)
      || raw.firstTry+raw.afterHelp !== raw.completed || (raw.target !== null && raw.completed > raw.target)) return null;
    const q=raw.question;
    if (!q || q.id !== raw.sequence || !valid(q.family,q.operands) || q.family !== MIX[raw.sequence%MIX.length]
      || typeof q.complete !== 'boolean' || !Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices).size !== 4
      || !q.choices.every(n=>integer(n)&&n<=100) || !q.choices.includes(FAMILIES[q.family].answer(q.operands))
      || !Array.isArray(q.misses) || new Set(q.misses).size !== q.misses.length
      || !q.misses.every(n=>q.choices.includes(n)&&n!==FAMILIES[q.family].answer(q.operands))
      || raw.completed !== raw.sequence + (q.complete ? 1 : 0)
      || (q.complete && (q.misses.length ? raw.afterHelp : raw.firstTry) < 1)) return null;
    return { schemaVersion:1, sequence:raw.sequence, target:raw.target, completed:raw.completed, firstTry:raw.firstTry, afterHelp:raw.afterHelp,
      question:{id:q.id,family:q.family,operands:[...q.operands],choices:[...q.choices],misses:[...q.misses],complete:q.complete} };
  }
  function answer(state, value) {
    const q=state.question;
    if(q.complete || !q.choices.includes(value) || q.misses.includes(value)) return false;
    if(value !== FAMILIES[q.family].answer(q.operands)) q.misses.push(value);
    else { q.complete=true; state.completed++; state[q.misses.length?'afterHelp':'firstTry']++; }
    return true;
  }
  function next(state,rng=Math.random) {
    if(!state.question.complete || (state.target !== null && state.completed >= state.target)) return false;
    state.sequence++; state.question=question(state.sequence,rng); return true;
  }
  function view(state) { const q=state.question, family=FAMILIES[q.family], result=family.answer(q.operands);
    return {family:q.family,prompt:family.text(q.operands)+(q.family==='complete-ten'||q.family==='missing-addend'?'':' = ?'),
      worked:q.family==='complete-ten'||q.family==='missing-addend'?`${q.operands[0]} + ${result} = ${q.operands[0]+result}`:`${family.text(q.operands)} = ${result}`,
      answer:result,source:family.source}; }
  return Object.freeze({ FAMILIES,MIX,valid,question,create,normalize,answer,next,view });
})();
globalThis.PLACE_ARITHMETIC = PLACE_ARITHMETIC;
