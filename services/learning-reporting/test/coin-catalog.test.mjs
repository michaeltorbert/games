// The service's production validator imports the shared closed contract directly.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {CATALOG,SCHEMA_VERSION,validateEvent} from '../src/validator.js';
const ids=Object.keys(CATALOG.football).filter(id=>id.startsWith('coin-'));
const event=(familyId,fields)=>({schemaVersion:1,eventId:randomUUID(),deviceId:randomUUID(),epochId:randomUUID(),seq:1,profileId:randomUUID(),game:'football',gameVersion:'1.34.26',recordedAt:'2026-10-27T12:00:00.000Z',questionInstanceId:randomUUID(),familyId,...CATALOG.football[familyId],...fields});
test('service accepts every exact coin tuple and event kind without changing the v1 wire schema',()=>{
 assert.equal(SCHEMA_VERSION,1);assert.equal(ids.length,26);
 for(const id of ids)for(const fields of [{kind:'attempt',number:1,correct:false,support:'initial'},{kind:'help',number:2,support:'guided'},{kind:'resolution',resolution:'retryCorrect'},{kind:'leftUnfinished'}]){
  const good=event(id,fields);assert.ok(validateEvent(good),`${id}:${fields.kind}`);
  for(const [key,value]of Object.entries({prompt:'private prompt',answer:35,coins:[25,10],coinFixture:{},privateOpponentSnapshot:{},evidenceClass:good.evidenceClass==='literacy'?'independent':'literacy',concept:'line-to-gain',purpose:'weakSpot',tier:'within-10',familyId:'unknown-coin-family'}))assert.equal(validateEvent({...good,[key]:value}),false,`${id}:${key}`);
 }
});
