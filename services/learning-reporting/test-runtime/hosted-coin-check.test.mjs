// Offline injected transport only. No hosted service, owner auth, code or credential.
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { buildFixture, validateManifest, runTrial, stdinCode, FORECAST, LIMITS, Stop } from '../scripts/hosted-coin-check.mjs';
import { CATALOG, validateEvent } from '../src/validator.js';
const profileId = randomUUID(), deviceId = randomUUID();
const token = `lr1_${'a'.repeat(32)}_${'b'.repeat(43)}`;
const now = Date.parse('2026-11-13T12:00:00Z');
const bindings = { sourceCommit:'a'.repeat(40), sourceSha256:'b'.repeat(64), toolSha256:'c'.repeat(64), contractSha256:'d'.repeat(64),
  bundleSha256:'e'.repeat(64), configSha256:'f'.repeat(64), exceptionSha256:'1'.repeat(64) };
const manifest = () => ({ schemaVersion:1,target:'https://reports.synthetic.test',gameOrigin:'https://games.synthetic.test',profileId,
  createdAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString(),expected:{...Object.fromEntries(Object.entries(bindings).filter(([k])=>k!=='exceptionSha256')),workerVersion:randomUUID()},
  exception:{recordSha256:bindings.exceptionSha256,accepted:true,scope:'issue215-additive-catalog-only',currentPlan:'UNVERIFIED',currentUsage:'UNVERIFIED'},
  ownerOperations:{used:10,reserve:6,cap:20},forecast:{...FORECAST} });
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function harness(override) {
  const notes=[], calls=[], stored=new Map();
  let clock=now;
  const m=manifest();
  const request=async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,options,body});
    assert.equal(notes.at(-1).kind,'sent','intent durable before transport');
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    assert.equal(options.headers.Origin,m.gameOrigin);
    if(override){const result=await override(calls.length,body,options);if(result)return result;}
    if(url.endsWith('/v1/enroll')){assert.equal(body.code,'AAAAAAAAAAAAAAAAAAAAAAAAAA');return json({schemaVersion:1,token,deviceId,profileIds:[profileId]});}
    assert.equal(options.headers.Authorization,`Bearer ${token}`);
    const results=body.events.map(e=>{const valid=validateEvent(e);if(valid){assert.ok(!stored.has(e.eventId)||stored.get(e.eventId)===JSON.stringify(e));stored.set(e.eventId,JSON.stringify(e));}return {eventId:e.eventId,outcome:valid?'accepted':'invalid'};});
    return json({schemaVersion:1,results});
  };
  return {m,notes,calls,stored,run:()=>runTrial({manifest:m,request,readCode:async()=>'AAAAAAAAAAAAAAAAAAAAAAAAAA',note:async n=>notes.push(n),now:()=>clock,wait:async ms=>{clock+=ms;}})};
}
test('fixed authoritative26-family fixture: coherent lifecycle, legacy and onlytwo negatives',()=>{
 let i=0;const uuid=()=>`00000000-0000-4000-8000-${String(++i).padStart(12,'0')}`;
 const f=buildFixture(deviceId,profileId,{uuid,now});
 assert.equal(f.events.length,84);assert.equal(f.events.filter(validateEvent).length,82);
 assert.equal(new Set(f.events.map(e=>e.eventId)).size,84);
 assert.deepEqual(f.events.slice(0,82).map(e=>e.seq),Array.from({length:82},(_,i)=>i+1));
 assert.deepEqual(f.events.slice(82).map(e=>e.seq),[1,2]);assert.notEqual(f.events[82].epochId,f.epochId);
 for(let n=0;n<78;n+=3){const trio=f.events.slice(n,n+3);assert.deepEqual(trio.map(e=>e.kind),['help','attempt','resolution']);assert.equal(new Set(trio.map(e=>e.questionInstanceId)).size,1);assert.equal(trio[0].number,1);assert.equal(trio[1].support,'guided');assert.equal(trio[2].resolution,'firstTryCorrect');assert.equal(trio[0].evidenceClass,CATALOG.football[trio[0].familyId].evidenceClass);}
 assert.equal(new Set(f.events.slice(0,78).map(e=>e.familyId)).size,26);
 assert.equal(f.events[78].support,'initial');assert.equal(f.events[80].helped,false);
 assert.deepEqual(f.events[83].coinFixture,{});
 assert.equal(f.events.slice(0,82).some(e=>'coinFixture'in e),false);
});
test('manifest binds exact origins/artifacts/exception; unknownquota neverclaims Free',()=>{
 const m=manifest();assert.equal(validateManifest(m,m.target,bindings,now),m);
 for(const mutate of [m=>m.target+='/',m=>m.gameOrigin='http://localhost',m=>m.profileId='bad',m=>m.expected.toolSha256='0'.repeat(64),m=>m.expected.workerVersion='bad',m=>m.expected.extra='cookie',m=>m.exception.accepted=false,m=>m.exception.currentUsage='verified',m=>m.exception.recordSha256='2'.repeat(64),m=>m.ownerOperations.used=15,m=>m.ownerOperations.reserve=5,m=>m.forecast.rowsWritten=0,m=>m.expiresAt=new Date(now).toISOString(),m=>m.createdAt=new Date(now+1).toISOString(),m=>m.extra='secret']){
 const bad=structuredClone(m);mutate(bad);assert.throws(()=>validateManifest(bad,m.target,bindings,now),Stop);}
 assert.throws(()=>validateManifest(m,'https://wrong.synthetic.test',bindings,now),Stop);
});
test('one capped trial exact orderedreceipts and byte-identical replay; no secrets in notes',async()=>{
 const h=harness();const result=await h.run();assert.deepEqual(result,{requests:7,transmissions:104,uniqueEvents:84,expectedStored:82});
 assert.equal(h.calls.length,7);assert.equal(h.stored.size,82);
 assert.deepEqual(h.calls[1].body.events,h.calls[6].body.events);
 assert.equal(h.calls[6].body.status.highestSeq,82);
 const notes=JSON.stringify(h.notes);assert.ok(!notes.includes(token));assert.ok(!notes.includes('AAAAAAAAAAAAAAAAAAAAAAAAAA'));assert.ok(!notes.includes('coinFixture'));assert.ok(!notes.includes('gameVersion'));
 assert.equal(h.notes.filter(n=>n.kind==='sent').length,7);
 assert.equal(LIMITS.requests,10);assert.equal(LIMITS.ownerRequests,20);
});
test('transport/provider errors stop once without echoing response/token/code orretry',async()=>{
 for(const mode of ['throw','rate','large','invalidjson','redirect','leaked']){
  const h=harness(async n=>{if(n!==2)return; if(mode==='throw')throw new Error(`${token} AAAAAAAAAAAAAAAAAAAAAAAAAA`);
   if(mode==='rate')return json({error:token},429);if(mode==='large')return new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}});
   if(mode==='invalidjson')return new Response(token,{headers:{'Content-Type':'application/json'}});
   if(mode==='redirect')return json({error:token},302);return json({schemaVersion:1,results:[],leak:token});});
  await assert.rejects(h.run(),e=>e instanceof Stop&&!e.message.includes(token)&&!e.message.includes('AAAAAAAAAAAAAAAAAAAAAAAAAA'));
  assert.equal(h.calls.length,2,mode);assert.equal(h.notes.at(-1).kind,'sent');assert.ok(!JSON.stringify(h.notes).includes(token));
 }
});
test('malformed duplicate reordered changed outcomes all stop atfirst bad receipt',async()=>{
 for(const mode of ['duplicate','reverse','outcome','extra','short']){
 const h=harness(async(n,body)=>{if(n!==2)return;let results=body.events.map(e=>({eventId:e.eventId,outcome:'accepted'}));
 if(mode==='duplicate')results[1]=results[0];if(mode==='reverse')results.reverse();if(mode==='outcome')results[0].outcome='invalid';if(mode==='extra')results[0].token=token;if(mode==='short')results.pop();return json({schemaVersion:1,results});});
 await assert.rejects(h.run(),{code:'RECEIPT'});assert.equal(h.calls.length,2);}
});
test('wrong or multiscope enrollment stops before sync; expiration stopsbefore request',async()=>{
 for(const ids of [[randomUUID()],[profileId,randomUUID()]]){const h=harness(async n=>n===1?json({schemaVersion:1,token,deviceId,profileIds:ids}):null);await assert.rejects(h.run(),{code:'ENROLLMENT'});assert.equal(h.calls.length,1);}
 const h=harness();h.m.expiresAt=new Date(now).toISOString();await assert.rejects(h.run(),{code:'EXPIRED'});assert.equal(h.calls.length,0);
});
test('stdin accepts onlywhile waiting and restores input, with no code echo',async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',x=>text+=x);
 const io=stdinCode(input,output);input.write('EARLY\n');await assert.rejects(io.read(),{code:'INPUT'});io.close();
 const input2=new PassThrough();const io2=stdinCode(input2,output);const waiting=io2.read();setTimeout(()=>input2.write('AAAAAAAAAAAAAAAAAAAAAAAAAA\n'),250);assert.equal(await waiting,'AAAAAAAAAAAAAAAAAAAAAAAAAA');io2.close();assert.ok(text.includes('WAITING:code'));assert.ok(!text.includes('AAAAAAAAAAAAAAAAAAAAAAAAAA'));
});
