import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {handleRequest} from '../src/worker.js';

const ip = '2001:db8::7';
const baseSubject = `kayak played by IP ${ip}`;
const payload = {event:'game_start', ts:1790812800000, level:2, levelName:'Synthetic Lake', score:42, v:'1.1.38', deviceType:'tablet', screen:'1180x820', lang:'en', tz:'America/New_York', platform:'test', ua:'test', referrer:''};
const expectedRow = event => [ip,1790812800000,event,2,'Synthetic Lake',42,'1.1.38','tablet','1180x820','en','America/New_York','test','test',''];
const env = {ALLOWED_ORIGIN:'https://michaeltorbert.github.io', REPORTING_ENABLED:'true', GOOGLE_CLIENT_ID:'test', GOOGLE_CLIENT_SECRET:'test', GOOGLE_REFRESH_TOKEN:'test', SPREADSHEET_ID:'test-sheet', NOTIFICATION_EMAIL:'owner@example.com', EMAIL_DAILY_LIMIT:'100', EVENT_LIMITER:{limit:async()=>({success:true})}};
const fail = () => { throw new Error('private location failure'); };
const getter = (key, rest={}) => Object.defineProperty(rest, key, {get:fail});
const revoked = () => { const {proxy,revoke}=Proxy.revocable({},{}); revoke(); return proxy; };
const badValues = [0,123,false,true,[],{},Symbol('location'),()=>{},new String('City'),{toString:fail},'x'.repeat(81),'City\r\nBcc: attacker@example.com','City\nX-Test: bad','City\tbad','City\0bad','City\u007fbad','City\u0085bad','City\u2028bad','City\u2029bad','City\u202ebad','City\u200bbad','City\ud800bad'];
const fallbacks = [
  ['missing metadata',undefined], ['null metadata',null], ['empty metadata',{}],
  ['string metadata','City'], ['numeric metadata',1], ['array metadata',[]],
  ['empty fields',{city:'',region:' ',country:null}], ['unknown country',{city:'City',country:'XX'}],
  ['Tor country',{city:'City',country:'T1'}], ['bad country',{city:'City',country:'USA'}],
  ['throwing city getter',getter('city')], ['throwing region-code getter',getter('regionCode')],
  ['throwing region getter',getter('region')], ['throwing country getter',getter('country')],
  ['throwing metadata proxy',new Proxy({},{get:fail})], ['revoked metadata proxy',revoked()],
  ...badValues.map((value,i)=>[`invalid city ${i}`,{city:value,regionCode:'NC',country:'US'}]),
  ...['regionCode','region','country'].map(key=>[`unsafe ${key}`,{city:'City',[key]:'bad\r\nBcc: attacker@example.com'}])
];
const locations = [
  ['complete location',{city:'Raleigh',regionCode:'NC',country:'US'},'Raleigh, NC, US'],
  ['city only',{city:'Raleigh'},'Raleigh'],
  ['region only',{region:'North Carolina'},'North Carolina'],
  ['country only',{country:'US'},'US'],
  ['missing city',{regionCode:'NC',country:'US'},'NC, US'],
  ['missing region',{city:'Raleigh',country:'US'},'Raleigh, US'],
  ['region name fallback',{city:'Raleigh',regionCode:null,region:'North Carolina',country:'US'},'Raleigh, North Carolina, US'],
  ['trimmed fields',{city:' Raleigh ',regionCode:' NC ',country:' US '},'Raleigh, NC, US'],
  ['accented city',{city:'São Paulo',regionCode:'SP',country:'BR'},'São Paulo, SP, BR'],
  ['CJK city',{city:'東京',country:'JP'},'東京, JP'],
  ['long international fields',{city:'é'.repeat(80),region:'界'.repeat(80),country:'JP'},`${'é'.repeat(80)}, ${'界'.repeat(80)}, JP`],
  ['encoded-word-looking metadata',{city:'=?UTF-8?B?QmFk?=',country:'US'},'=?UTF-8?B?QmFk?=, US']
];
function decodeSubject(mail) {
  const header = mail.split('\r\n\r\n')[0];
  const subject = header.match(/(?:^|\r\n)Subject: ([\s\S]*?)(?=\r\n[^ ]|$)/)?.[1];
  assert.ok(subject);
  if (!subject.startsWith('=?')) return subject;
  const words = subject.split('\r\n ');
  return words.map(word=>{
    assert.ok(word.length<=75,'RFC 2047 encoded-word limit');
    assert.match(word,/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/);
    return Buffer.from(word.slice(10,-2),'base64').toString('utf8');
  }).join('');
}
async function deliver(cf, event=payload.event, {throwRequestCf=false, onCfRead, eventExtra={}, headers={}, emailFails=false, limit='100'}={}) {
  const calls=[],order=[],pending=[];
  const req = new Request('https://worker.example/events',{method:'POST',headers:{Origin:env.ALLOWED_ORIGIN,'CF-Connecting-IP':ip,'Content-Type':'text/plain',...headers},body:JSON.stringify({...payload,event,...eventExtra})});
  Object.defineProperty(req,'cf',throwRequestCf?{get:fail}:onCfRead?{get:()=>{onCfRead(order);return cf;}}:{value:cf});
  const config = {...env, EMAIL_DAILY_LIMIT:limit, EMAIL_QUOTA:{prepare:()=>({bind:()=>({run:async()=>{order.push('quota');return {success:true,meta:{changes:1}};}})})}};
  const fetcher = async(url,init)=>{
    const stage = url.startsWith('https://oauth2.googleapis.com/')?'oauth':url.startsWith('https://sheets.googleapis.com/')?'sheet':url.startsWith('https://gmail.googleapis.com/')?'email':'unexpected';
    assert.notEqual(stage,'unexpected','location must add no external lookup');
    calls.push({stage,init});order.push(stage);
    if(stage==='email'&&emailFails)return new Response('synthetic email failure',{status:503});
    return Response.json(stage==='oauth'?{access_token:'test-access'}:stage==='sheet'?{updates:{updatedRows:1}}:{id:'test-mail'});
  };
  const response = await handleRequest(req,config,{waitUntil:p=>pending.push(p)},fetcher);
  await Promise.all(pending);
  return {calls,order,response,pending};
}
function verifySuccess(result,event,expected=baseSubject) {
  const {calls,order,response,pending}=result;
  assert.equal(response.status,200);assert.equal(pending.length,1);
  assert.deepEqual(order,['oauth','sheet','quota','email']);
  assert.equal(calls.length,3,'one append, one email, no lookup or replay');
  assert.deepEqual(JSON.parse(calls[1].init.body).values,[expectedRow(event)]);
  assert.equal(JSON.parse(calls[1].init.body).values[0].length,14);
  const mail = Buffer.from(JSON.parse(calls[2].init.body).raw,'base64url').toString('utf8');
  assert.equal(decodeSubject(mail),expected);
  const [header,body]=mail.split('\r\n\r\n');
  assert.equal(body,`kayak played by IP ${ip} check out the google sheet`);
  assert.deepEqual(header.split('\r\n').filter(line=>!line.startsWith(' ')).map(line=>line.split(':')[0]),['To','Subject','MIME-Version','Content-Type']);
  assert.match(header,/^To: owner@example.com\r\n/);
  assert.equal(response.headers.get('access-control-allow-origin'),env.ALLOWED_ORIGIN);
}
for (const event of ['game_start','level_start','level_complete']) {
  for (const [name,cf] of fallbacks) test(`${event}: ${name} still appends and emails the original subject`,async()=>{
    verifySuccess(await deliver(cf,event),event);
  });
  test(`${event}: request.cf getter failure still appends and emails`,async()=>{
    verifySuccess(await deliver(undefined,event,{throwRequestCf:true}),event);
  });
  for (const [name,cf,location] of locations) test(`${event}: ${name} enriches only the subject`,async()=>{
    verifySuccess(await deliver(cf,event),event,`${baseSubject} - ${location}`);
  });
}
test('client payload and forged geo headers cannot supply location',async()=>{
  verifySuccess(await deliver(undefined,payload.event,{eventExtra:{cf:{city:'Spoof'},city:'Spoof',location:'Spoof'},headers:{'CF-IPCity':'Spoof','CF-IPCountry':'US','X-Geo-City':'Spoof'}}),payload.event);
});
test('metadata is never read before the spreadsheet append and quota reservation',async()=>{
  const reads=[];
  verifySuccess(await deliver({},payload.event,{onCfRead:order=>{reads.push([...order]);}}),payload.event);
  assert.deepEqual(reads,[['oauth','sheet','quota']]);
});
test('formatting exception uses original subject and completes both writes',async(t)=>{
  const original=Buffer.byteLength;
  t.mock.method(Buffer,'byteLength',function(value,...args){
    if(typeof value==='string'&&value.startsWith('kayak played'))throw Error('synthetic formatter failure');
    return original.call(this,value,...args);
  });
  verifySuccess(await deliver({city:'City',country:'US'}),payload.event);
});
test('location failures and values do not leak into logs',async(t)=>{
  const logs=[];
  for(const method of ['info','warn','error'])t.mock.method(console,method,line=>logs.push(JSON.parse(line)));
  verifySuccess(await deliver(getter('city')),payload.event);
  verifySuccess(await deliver({city:'Private Synthetic City',country:'US'}),payload.event,`${baseSubject} - Private Synthetic City, US`);
  assert.deepEqual(logs,Array(2).fill({service:'kayak-reporting',outcome:'delivered',event:'game_start'}));
});
test('parallel events retain their own locations without cross-request leakage',async()=>{
  const results=await Promise.all(Array.from({length:12},(_,i)=>deliver({city:`City ${i}`,country:'US'})));
  results.forEach((result,i)=>verifySuccess(result,payload.event,`${baseSubject} - City ${i}, US`));
});
test('location fallback preserves real Gmail failure semantics and retains the sheet call',async()=>{
  const {response,calls,order}=await deliver(getter('city'),payload.event,{emailFails:true});
  assert.equal(response.status,502);assert.deepEqual(order,['oauth','sheet','quota','email']);
  assert.deepEqual(JSON.parse(calls[1].init.body).values,[expectedRow(payload.event)]);
});
test('email cap still records spreadsheet and never reads optional location',async()=>{
  let reads=0;
  const {response,calls,order}=await deliver(getter('city'),payload.event,{limit:'0',onCfRead:()=>{reads++;}});
  assert.equal(response.status,202);assert.deepEqual(order,['oauth','sheet']);assert.equal(calls.length,2);
  assert.equal(reads,0);
});
