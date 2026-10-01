import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../src/worker.js';

const payload = {event:'game_start', ts:1775300000000, level:0, levelName:'Lake', score:0, v:'1.1.37', deviceType:'desktop', screen:'1180x820', lang:'en-US', tz:'America/New_York', platform:'MacIntel', ua:'Test', referrer:''};
const env = {ALLOWED_ORIGIN:'https://michaeltorbert.github.io', REPORTING_ENABLED:'true', GOOGLE_CLIENT_ID:'test-client', GOOGLE_CLIENT_SECRET:'test-secret', GOOGLE_REFRESH_TOKEN:'test-refresh', SPREADSHEET_ID:'test-sheet', NOTIFICATION_EMAIL:'owner@example.com', EVENT_LIMITER:{limit:async()=>({success:true})}};
function request(body=payload, options={}) {
  return new Request('https://worker.example/events', {method:'POST', headers:{Origin:env.ALLOWED_ORIGIN,'CF-Connecting-IP':'2001:db8::1','Content-Type':'text/plain', ...options.headers}, body:typeof body==='string'?body:JSON.stringify(body)});
}
function mockGoogle(failStage=0, responseOverride) {
  const calls=[];
  const fetcher=async(url, init)=>{
    calls.push({url, init});
    const n=calls.length;
    if(n===failStage) return new Response('private error details', {status:401});
    return Response.json(responseOverride?.[n] ?? [{access_token:'access-token'},{updates:{updatedRows:1}},{id:'message-id'}][n-1]);
  };
  return {calls,fetcher};
}
async function run(req, config=env, mock=mockGoogle()) {
  const pending=[];
  const response=await handleRequest(req,config,{waitUntil:p=>pending.push(p)},mock.fetcher);
  await Promise.all(pending);
  return {response, pending, ...mock};
}
for(const event of ['game_start','level_start','level_complete']) test(`${event}: appends A:N then emails, with trusted IP and real timezone`, async()=>{
  const {response,calls,pending}=await run(request({...payload,event,ip:'spoofed',recipient:'attacker@example.com',collected:5}));
  assert.equal(response.status,200); assert.equal(pending.length,1); assert.equal(calls.length,3);
  assert.match(calls[0].url,/oauth2/);
  assert.match(calls[1].url,/valueInputOption=RAW/);
  assert.deepEqual(JSON.parse(calls[1].init.body).values,[['2001:db8::1',payload.ts,event,0,'Lake',0,'1.1.37','desktop','1180x820','en-US','America/New_York','MacIntel','Test','']]);
  const email=Buffer.from(JSON.parse(calls[2].init.body).raw,'base64url').toString();
  assert.equal(email,'To: owner@example.com\r\nSubject: kayak played by IP 2001:db8::1\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nkayak played by IP 2001:db8::1 check out the google sheet');
  assert.equal(calls[1].init.headers.Authorization,'Bearer access-token');
  assert.equal(response.headers.get('access-control-allow-origin'),env.ALLOWED_ORIGIN);
});
test('formula-looking spreadsheet values remain RAW strings', async()=>{
  const {response,calls}=await run(request({...payload,levelName:'=IMPORTXML("https://invalid", "//x")'}));
  assert.equal(response.status,200);
  assert.match(JSON.parse(calls[1].init.body).values[0][4],/^=IMPORTXML/);
  assert.match(calls[1].url,/valueInputOption=RAW/);
});
for(const stage of [1,2,3]) test(`Google stage ${stage} failure stops downstream work without automatic replay`, async()=>{
  const {response,calls}=await run(request(),env,mockGoogle(stage));
  assert.equal(response.status,502); assert.equal(calls.length,stage);
  assert.equal(await response.text(),'Delivery failed');
});
for(const [name,body,status] of [['invalid JSON','{',400],['wrong event',{...payload,event:'other'},400],['array',[],400],['invalid tz',{...payload,tz:123},400],['negative score',{...payload,score:-1},400],['oversized body','x'.repeat(8193),413]]) test(name,async()=>{
  const {response,calls}=await run(request(body)); assert.equal(response.status,status); assert.equal(calls.length,0);
});
test('counts streamed bytes rather than trusting Content-Length',async()=>{
  const {response,calls}=await run(request('x'.repeat(8193),{headers:{'Content-Length':'1'}}));
  assert.equal(response.status,413); assert.equal(calls.length,0);
});
for(const headers of [{Origin:'https://attacker.example'},{Origin:'null'},{'CF-Connecting-IP':'not-an-ip'}]) test(`rejects unsafe request headers ${JSON.stringify(headers)}`,async()=>{
  const {response,calls}=await run(request(payload,{headers})); assert.ok([400,403].includes(response.status)); assert.equal(calls.length,0);
});
test('fixed recipient refuses mail-header injection',async()=>{
  const {response,calls}=await run(request(),{...env,NOTIFICATION_EMAIL:'owner@example.com\r\nBcc: attacker@example.com'});
  assert.equal(response.status,503); assert.equal(calls.length,0);
});
test('disabled service and missing secrets cause no delivery',async()=>{
  for(const config of [{...env,REPORTING_ENABLED:'false'},{...env,GOOGLE_REFRESH_TOKEN:''}]) {
    const {response,calls}=await run(request(),config); assert.equal(response.status,503); assert.equal(calls.length,0);
  }
});
test('throttled requests do not call Google',async()=>{
  const {response,calls}=await run(request(),{...env,EVENT_LIMITER:{limit:async()=>({success:false})}});
  assert.equal(response.status,429); assert.equal(calls.length,0);
});
test('preflight, health and GET do not append or email',async()=>{
  for(const [url,method,status] of [['/events','OPTIONS',204],['/events','GET',405],['/health','GET',200],['/','GET',404]]) {
    const {response,calls}=await run(new Request('https://worker.example'+url,{method,headers:{Origin:env.ALLOWED_ORIGIN}}));
    assert.equal(response.status,status); assert.equal(calls.length,0);
  }
});
test('malformed successful Google replies are not reported as delivered',async()=>{
  for(const [stage,value] of [[1,{}],[2,{updates:{updatedRows:0}}],[3,{}]]) {
    const {response,calls}=await run(request(),env,mockGoogle(0,{[stage]:value}));
    assert.equal(response.status,502); assert.equal(calls.length,stage);
  }
});
test('upstream network exception is generic and does not retry',async()=>{
  let calls=0;
  const {response}=await run(request(),env,{fetcher:async()=>{calls++;throw Error('secret network details');},calls:[]});
  assert.equal(response.status,502); assert.equal(calls,1); assert.equal(await response.text(),'Delivery failed');
});

test('device-info failure in existing game still records blanks',async()=>{
  const {deviceType,screen,lang,tz,platform,ua,referrer,...minimal}=payload;
  const {response,calls}=await run(request(minimal));
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(calls[1].init.body).values[0].slice(7),['','','','','','','']);
});
