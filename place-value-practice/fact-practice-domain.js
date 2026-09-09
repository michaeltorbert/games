// Exact arithmetic evidence, independent of both existing practice stores.
// Approved scope: Math Mammoth Grade 1-B (2026), Chapter 5 pp13–36;
// Chapter 8 addition pp122–130 and subtraction pp131–136.
// This is content scope, never a page-completion claim.
(() => {
  'use strict';
  const LIMIT=1000000000, HISTORY=12, INTERVALS=[8,24,60];
  const catalog=[], byId=Object.create(null), families=[];
  function add(op,a,b,x,y) {
    const id=`${op}:${a}:${b}`;
    if(byId[id])return;
    const fact=Object.freeze({id,op,a,b,answer:op==='add'?a+b:a-b,family:`family:${x}:${y}:${x+y}`});
    catalog.push(fact);byId[id]=fact;
  }
  for(let x=0;x<=9;x++)for(let y=x;y<=9;y++) {
    families.push(`family:${x}:${y}:${x+y}`);
    add('add',x,y,x,y);add('add',y,x,x,y);add('sub',x+y,x,x,y);add('sub',x+y,y,x,y);
  }
  // Ordinary diagnostic prompts; these do not encode any learner failure.
  const order=['sub:7:5','add:7:6','add:2:3','sub:9:3',...catalog.map(f=>f.id)];
  const ordered=[...new Set(order)];
  const integer=(n,max=LIMIT)=>Number.isInteger(n)&&n>=0&&n<=max;
  const validTarget=n=>integer(n,100)&&n>=1;
  const sample=n=>n===null||(integer(n,60000)&&n>=300&&n%100===0);
  const other=(s,family)=>s.serial-s.families[family].completed;
  const threshold=f=>f.answer<10?8000:10000;
  const equation=f=>`${f.a} ${f.op==='add'?'+':'−'} ${f.b}`;
  function help(f) {
    if(f.op==='sub')return `${f.b} + ${f.answer} = ${f.a}, so ${equation(f)} = ${f.answer}.`;
    if(f.answer>10&&f.a<10) return `${f.a} + ${10-f.a} = 10, then 10 + ${f.answer-10} = ${f.answer}.`;
    return `${equation(f)} = ${f.answer}, and ${f.answer} − ${f.b} = ${f.a}.`;
  }
  function blank() {
    return {schemaVersion:2,serial:0,nonce:0,coverageCursor:0,drive:{totalYards:0},
      families:Object.fromEntries(families.map(id=>[id,{completed:0,exposedAt:null}])),
      facts:Object.fromEntries(catalog.map(f=>[f.id,{seen:0,lastSeen:null,completed:0,checks:0,history:[],ticket:null}])),
      session:{target:10,completed:0,firstTry:0,helped:0},attempt:null};
  }
  function eligible(s,f,gap) {const e=s.families[f.family].exposedAt;return e===null||other(s,f.family)-e>=gap;}
  function select(s,rng=()=>0) {
    let pool=catalog.filter(f=>eligible(s,f,s.facts[f.id].ticket?.kind==='retry'?2:5)), relaxed=[];
    if(!pool.length){pool=catalog.slice();relaxed.push('family-avoidance');}
    const slot=s.serial%4, due=(f,kind)=>{const t=s.facts[f.id].ticket;return t&&t.kind===kind&&other(s,f.family)>=t.dueOther;};
    const coverage=items=>items.slice().sort((a,b)=>{
      const aa=s.facts[a.id],bb=s.facts[b.id];
      return Number(aa.seen>0)-Number(bb.seen>0)||(aa.lastSeen??-1)-(bb.lastSeen??-1)||
        ((ordered.indexOf(a.id)-s.coverageCursor+200)%200)-((ordered.indexOf(b.id)-s.coverageCursor+200)%200);
    });
    let kind=['coverage','retry','spaced','mixed'][slot], candidates;
    if(slot===0)candidates=coverage(pool);
    else {
      candidates=pool.filter(f=>due(f,slot===2?'spaced':'retry'));
      if(!candidates.length&&slot===3)candidates=pool.filter(f=>due(f,'spaced'));
      if(candidates.length)candidates.sort((a,b)=>s.facts[a.id].ticket.created-s.facts[b.id].ticket.created||ordered.indexOf(a.id)-ordered.indexOf(b.id));
      else {kind='coverage';candidates=coverage(pool);}
    }
    // Queue age and coverage fairness outrank balance. Balance only equal-priority ties.
    const first=candidates[0], prior=s.attempt&&byId[s.attempt.factId];
    const tie=f=>kind==='coverage'?(s.facts[f.id].seen===0)===(s.facts[first.id].seen===0)&&s.facts[f.id].lastSeen===s.facts[first.id].lastSeen:
      s.facts[f.id].ticket.created===s.facts[first.id].ticket.created;
    const tied=candidates.filter(tie), balanced=prior?tied.filter(f=>f.op!==prior.op):tied;
    if(prior&&!balanced.length)relaxed.push('operation-balance');
    // Injected RNG may break equal-age queue ties; coverage retains its cursor order.
    const choices=balanced.length?balanced:tied;
    const roll=Number(rng()), index=kind==='coverage'?0:Math.floor((Number.isFinite(roll)?Math.max(0,Math.min(.999999,roll)):0)*choices.length);
    return {fact:choices[index],diagnostics:{slot,queue:kind,relaxed}};
  }
  function present(s,rng) {
    if(s.nonce>=LIMIT)return false;
    const selected=select(s,rng),f=selected.fact,r=s.facts[f.id];
    const independent=eligible(s,f,5);
    s.attempt={id:++s.nonce,factId:f.id,misses:0,helped:false,complete:false,eligible:independent,firstMs:null,firstCorrect:null,rewardSupported:false};
    r.seen=Math.min(LIMIT,r.seen+1);r.lastSeen=s.serial;
    s.families[f.family].exposedAt=other(s,f.family);
    s.coverageCursor=(ordered.indexOf(f.id)+1)%200;
    return selected.diagnostics;
  }
  function create(target=10,rng) {const s=blank();s.session.target=validTarget(target)?target:10;present(s,rng);return s;}
  function retry(s,f) {s.facts[f.id].ticket={kind:'retry',dueOther:other(s,f.family)+2,created:s.serial};}
  function reportOpened(s,id) {
    const q=s.attempt;if(q.id!==id||q.complete)return false;
    q.eligible=false;q.firstMs=null;q.rewardSupported=true;return true;
  }
  function show(s,id) {
    const q=s.attempt;if(q.id!==id||q.complete||q.helped)return false;
    q.helped=true;q.firstMs=null;q.rewardSupported=true;const f=byId[q.factId];
    s.families[f.family].exposedAt=other(s,f.family);
    const makeTen=f.op==='add'&&f.answer>10&&byId[`add:${f.a}:${10-f.a}`];
    if(makeTen)s.families[makeTen.family].exposedAt=other(s,makeTen.family);
    retry(s,f);return true;
  }
  function answer(s,id,value,ms=null) {
    const q=s.attempt;if(q.id!==id||q.complete||!integer(value,18)||s.serial>=LIMIT-60)return false;
    const f=byId[q.factId],r=s.facts[f.id],correct=value===f.answer;
    if(q.firstCorrect===null){q.firstCorrect=correct;q.firstMs=!q.helped&&sample(ms)?ms:null;}
    if(!correct){q.misses=Math.min(99,q.misses+1);retry(s,f);if(q.misses>=2)show(s,id);return true;}
    q.complete=true;s.serial++;s.families[f.family].completed++;r.completed++;
    s.session.completed++;const unsupported=q.misses===0&&!q.helped;
    // Motivation follows completion, not spacing eligibility, speed, or check credit.
    // The controller saves this award and the completed attempt in one locked write.
    s.drive.totalYards+=unsupported&&!q.rewardSupported?5:1;
    if(unsupported)s.session.firstTry++;else s.session.helped++;
    const check=unsupported&&q.eligible;
    if(check)r.checks++;
    r.history.push({serial:s.serial,outcome:q.helped?'shown':q.misses?'retry':'first-correct',eligible:check,ms:q.firstMs});
    r.history=r.history.slice(-HISTORY);
    s.families[f.family].exposedAt=other(s,f.family);
    if(!unsupported)retry(s,f);
    else {
      let stage=Math.min(2,Math.max(0,r.checks-1));
      const checks=r.history.filter(h=>h.eligible).slice(-3);
      if(r.checks>=3&&checks.filter(h=>h.ms!==null&&h.ms>threshold(f)).length>=2)stage=Math.max(0,stage-1);
      r.ticket={kind:'spaced',dueOther:other(s,f.family)+INTERVALS[stage],created:s.serial};
    }
    return true;
  }
  function next(s,id,rng) {if(s.attempt.id!==id||!s.attempt.complete||s.session.completed>=s.session.target)return false;return !!present(s,rng);}
  function restart(s,target,rng) {
    if(!validTarget(target)||s.nonce>=LIMIT)return false;
    s.session={target,completed:0,firstTry:0,helped:0};return !!present(s,rng);
  }
  function normalize(raw) {
    // Fail learning evidence closed; partial repairs could create false checks.
    // Optional drive metadata is independently repairable below.
    try {
      if(!raw||![1,2].includes(raw.schemaVersion)||!integer(raw.serial,LIMIT-60)||!integer(raw.nonce)||raw.nonce<1||!integer(raw.coverageCursor,199))return null;
      const s=blank();s.serial=raw.serial;s.nonce=raw.nonce;s.coverageCursor=raw.coverageCursor;
      // Legacy practice never receives retroactive rewards. Damage to optional
      // motivation data must not discard valid learning evidence.
      if(raw.schemaVersion===2&&!driveNeedsRepair(raw))s.drive.totalYards=raw.drive.totalYards;
      let completions=0;
      for(const id of families) {
        const v=raw.families[id];if(!integer(v.completed,s.serial)||!(v.exposedAt===null||integer(v.exposedAt,s.serial-v.completed)))return null;
        s.families[id]={completed:v.completed,exposedAt:v.exposedAt};completions+=v.completed;
      }
      if(completions!==s.serial)return null;
      const totals=Object.fromEntries(families.map(id=>[id,0])),serials=new Set();let presentations=0;
      for(const f of catalog) {
        const v=raw.facts[f.id];
        if(!integer(v.seen)||!integer(v.completed,s.serial)||!integer(v.checks,v.completed)||v.seen<v.completed||
          !(v.lastSeen===null||integer(v.lastSeen,s.serial))||(v.seen===0)!==(v.lastSeen===null)||!Array.isArray(v.history)||v.history.length!==Math.min(HISTORY,v.completed)||v.seen>0&&s.families[f.family].exposedAt===null)return null;
        let last=0,checks=0;
        const history=v.history.map(h=>{
          if(!integer(h.serial,s.serial)||h.serial<=last||!['shown','retry','first-correct'].includes(h.outcome)||typeof h.eligible!=='boolean'||
            (h.eligible&&h.outcome!=='first-correct')||!sample(h.ms)||(h.outcome==='shown'&&h.ms!==null))throw Error('history');
          if(serials.has(h.serial))throw Error('duplicate serial');serials.add(h.serial);last=h.serial;if(h.eligible)checks++;
          return {serial:h.serial,outcome:h.outcome,eligible:h.eligible,ms:h.ms};
        });
        if(checks>v.checks||v.completed<=HISTORY&&checks!==v.checks)return null;
        let ticket=null;
        if(v.ticket!==null){const t=v.ticket;if(v.seen===0||!['retry','spaced'].includes(t.kind)||!integer(t.dueOther)||!integer(t.created,s.serial)||t.dueOther>other(s,f.family)+60)return null;
          ticket={kind:t.kind,dueOther:t.dueOther,created:t.created};}
        s.facts[f.id]={seen:v.seen,lastSeen:v.lastSeen,completed:v.completed,checks:v.checks,history,ticket};totals[f.family]+=v.completed;presentations+=v.seen;
      }
      if(presentations!==s.nonce)return null;
      for(const id of families)if(totals[id]!==s.families[id].completed)return null;
      const session=raw.session;
      if(!validTarget(session.target)||!integer(session.completed,session.target)||session.completed>s.serial||!integer(session.firstTry,session.completed)||!integer(session.helped,session.completed)||session.firstTry+session.helped!==session.completed)return null;
      s.session={target:session.target,completed:session.completed,firstTry:session.firstTry,helped:session.helped};
      const q=raw.attempt,f=byId[q.factId];
      if(!f||q.id!==s.nonce||!integer(q.misses,99)||typeof q.helped!=='boolean'||typeof q.complete!=='boolean'||typeof q.eligible!=='boolean'||
        ![null,true,false].includes(q.firstCorrect)||!sample(q.firstMs)||q.misses>=2&&!q.helped||q.helped&&q.firstMs!==null||
        q.firstCorrect===null&&(q.misses>0||q.complete||q.firstMs!==null)||q.firstCorrect===false&&q.misses===0||q.misses>0&&q.firstCorrect!==false||
        q.complete&&session.completed===0||!q.complete&&(session.completed===session.target||q.firstCorrect===true)||s.facts[f.id].seen===0)return null;
      if((q.misses||q.helped)&&!q.complete&&s.facts[f.id].ticket?.kind!=='retry')return null;
      if(q.complete){const latest=s.facts[f.id].history.at(-1);if(!latest||latest.serial!==s.serial||latest.outcome!==(q.helped?'shown':q.misses?'retry':'first-correct')||latest.eligible!==(q.eligible&&!q.helped&&!q.misses)||latest.ms!==q.firstMs)return null;}
      // v1 cannot distinguish report exposure from a warm, ineligible prompt.
      // Treat that one carried-over presentation conservatively, without changing
      // its learning eligibility or any historical first-try classifications.
      const rewardSupported=raw.schemaVersion===1?!q.eligible:
        typeof q.rewardSupported==='boolean'?q.rewardSupported:true;
      s.attempt={id:q.id,factId:q.factId,misses:q.misses,helped:q.helped,complete:q.complete,eligible:q.eligible,firstMs:q.complete?q.firstMs:null,firstCorrect:q.firstCorrect,
        rewardSupported:rewardSupported||q.helped};
      return s;
    }catch{return null;}
  }
  function driveNeedsRepair(raw) {
    return raw?.schemaVersion===2&&(!raw.drive||!integer(raw.drive.totalYards,raw.serial*5));
  }
  function drive(s) {
    const totalYards=s.drive.totalYards;
    return {totalYards,yards:totalYards%100,touchdowns:Math.floor(totalYards/100)};
  }
  function report(s) {
    const rows=catalog.map(f=>{const r=s.facts[f.id],checks=r.history.filter(h=>h.eligible),timed=checks.filter(h=>h.ms!==null).map(h=>h.ms).sort((a,b)=>a-b);
      return {id:f.id,family:f.family,equation:`${equation(f)} = ?`,checks:r.checks,completed:r.completed,practiced:r.completed>0||r.ticket?.kind==='retry',
        needsPractice:r.ticket?.kind==='retry',quick:r.history.at(-1)?.eligible===true&&r.checks>=2&&checks.slice(-2).length===2&&checks.slice(-2).every(h=>h.ms!==null&&h.ms<=threshold(f)),
        typicalMs:timed.length?timed[Math.floor(timed.length/2)]:null};});
    return {rows,additionChecked:rows.filter(r=>r.id.startsWith('add:')&&r.checks>0).length,subtractionChecked:rows.filter(r=>r.id.startsWith('sub:')&&r.checks>0).length};
  }
  globalThis.PLACE_FACTS=Object.freeze({SCHEMA_VERSION:2,LIMIT,HISTORY,INTERVALS,catalog:Object.freeze(catalog),families:Object.freeze(families),byId:Object.freeze(byId),
    create,normalize,select,answer,show,reportOpened,next,restart,report,equation,help,threshold,other,drive,driveNeedsRepair});
})();
