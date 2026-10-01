import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest} from '../src/worker.js';

const payload = {event:'game_start', ts:1775300000000, level:0, levelName:'Lake', score:0, v:'1.1.37', deviceType:'desktop', screen:'1180x820', lang:'en-US', tz:'America/New_York', platform:'MacIntel', ua:'Test', referrer:''};
const env = {ALLOWED_ORIGIN:'https://michaeltorbert.github.io', REPORTING_ENABLED:'true', GOOGLE_CLIENT_ID:'test-client', GOOGLE_CLIENT_SECRET:'test-secret', GOOGLE_REFRESH_TOKEN:'test-refresh', SPREADSHEET_ID:'test-sheet', NOTIFICATION_EMAIL:'owner@example.com', EMAIL_DAILY_LIMIT:'100', EMAIL_QUOTA:{prepare:()=>({bind:()=>({run:async()=>({success:true,meta:{changes:1}})})})}, EVENT_LIMITER:{limit:async()=>({success:true})}};
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
for(const stage of [1,2,3]) test(`Google stage ${stage} failure stops downstream work without automatic replay`, async(t)=>{
  const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
  const {response,calls}=await run(request(),env,mockGoogle(stage));
  assert.equal(response.status,502); assert.equal(calls.length,stage);
  assert.deepEqual(logs,[{service:'kayak-reporting',outcome:'failed',stage:['oauth','sheet','email'][stage-1],upstreamStatus:401}]);
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
test('upstream network exception is generic and does not retry',async(t)=>{
  const logs=[];t.mock.method(console,'error',line=>logs.push(JSON.parse(line)));
  let calls=0;
  const {response}=await run(request(),env,{fetcher:async()=>{calls++;throw Error('secret network details');},calls:[]});
  assert.equal(response.status,502); assert.equal(calls,1); assert.equal(await response.text(),'Delivery failed');
  assert.deepEqual(logs,[{service:'kayak-reporting',outcome:'failed',stage:'oauth'}]);
});

test('device-info failure in existing game still records blanks',async()=>{
  const {deviceType,screen,lang,tz,platform,ua,referrer,...minimal}=payload;
  const {response,calls}=await run(request(minimal));
  assert.equal(response.status,200);
  assert.deepEqual(JSON.parse(calls[1].init.body).values[0].slice(7),['','','','','','','']);
});

test('receiver logs payload rejection without including private values',async(t)=>{
  const logs=[]; t.mock.method(console,'warn',line=>logs.push(JSON.parse(line)));
  const {response}=await run(request({...payload,tz:{private:'do not log'}}));
  assert.equal(response.status,400);
  assert.deepEqual(logs,[{service:'kayak-reporting',outcome:'rejected',stage:'payload',status:400}]);
});

test('25-second deadline abort reaches upstream and becomes failure without replay',async(t)=>{
  t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,25000);return AbortSignal.abort(new DOMException('Timed out','TimeoutError'));});
  let count=0;
  const {response}=await run(request(),env,{calls:[],fetcher:async(url,init)=>{count++;init.signal.throwIfAborted();throw Error('expected abort');}});
  assert.equal(response.status,502);assert.equal(count,1);
});

test('actual Kayak phoneHome producer is compatible on beacon and fetch paths',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {runInNewContext}=await import('node:vm');
  const source=await readFile(new URL('../../../kayak/kayak.js',import.meta.url),'utf8');
  const start=source.indexOf('function getDeviceInfo()');
  const end=source.indexOf('const kayak =',start);
  assert.ok(start>0 && end>start);
  for(const beacon of [true,false]) {
    const bodies=[];
    const sandbox={PHONE_HOME_URL:'https://worker.example/events',GAME_VERSION:'1.1.37',currentLevel:3,totalScore:27,
      getLevelDef:()=>({name:'Lake'}),screen:{width:1180,height:820},document:{referrer:''},
      navigator:{userAgent:'Test',maxTouchPoints:5,language:'en-US',platform:'MacIntel',...(beacon?{sendBeacon:(url,body)=>{bodies.push(body);return true;}}:{})},
      fetch:async(url,init)=>{bodies.push(init.body);return new Response(null,{status:502});}};
    runInNewContext(source.slice(start,end),sandbox);
    for(const event of ['game_start','level_start','level_complete']) {
      assert.doesNotThrow(()=>sandbox.phoneHome(event,event==='level_complete'?{collected:5}:undefined));
      const {response}=await run(request(JSON.parse(bodies.at(-1))));
      assert.equal(response.status,200);
    }
    if(beacon) sandbox.navigator.sendBeacon=()=>{throw Error('offline');};
    else sandbox.fetch=()=>Promise.reject(Error('offline'));
    assert.doesNotThrow(()=>sandbox.phoneHome('game_start'));
    await new Promise(resolve=>setImmediate(resolve));
  }
});


test('origin, method, disabled and throttled rejections log only safe stage/status',async(t)=>{
  const logs=[]; t.mock.method(console,'warn',line=>logs.push(JSON.parse(line)));
  await run(request(payload,{headers:{Origin:'https://untrusted.example'}}));
  await run(new Request('https://worker.example/events',{headers:{Origin:env.ALLOWED_ORIGIN}}));
  await run(request(),{...env,REPORTING_ENABLED:'false'});
  await run(request(),{...env,EVENT_LIMITER:{limit:async()=>({success:false})}});
  assert.deepEqual(logs,[['origin',403],['method',405],['disabled',503],['throttled',429]].map(([stage,status])=>({service:'kayak-reporting',outcome:'rejected',stage,status})));
});

function quotaConfig(run, limit='100') {
  return {...env,EMAIL_DAILY_LIMIT:limit,EMAIL_QUOTA:{prepare:sql=>({bind:value=>({run:()=>run(sql,value)})})}};
}
test('daily limit preserves the spreadsheet row and suppresses email',async(t)=>{
  const logs=[];t.mock.method(console,'warn',line=>logs.push(JSON.parse(line)));
  const {response,calls}=await run(request(),quotaConfig(async(sql,limit)=>{
    assert.match(sql,/date\('now'\)/);assert.equal(limit,100);return {success:true,meta:{changes:0}};
  }));
  assert.equal(response.status,202);assert.equal(calls.length,2);
  assert.equal(await response.text(),'Recorded; notification limit reached');
  assert.deepEqual(logs,[{service:'kayak-reporting',outcome:'recorded-without-email',stage:'email-quota',event:'game_start'}]);
});
test('zero email cap records the row without reading quota storage or sending mail',async()=>{
  const {response,calls}=await run(request(),quotaConfig(()=>{throw Error('must not query');},'0'));
  assert.equal(response.status,202);assert.equal(calls.length,2);
});
test('invalid, missing and unavailable quota configurations never send mail',async()=>{
  for(const config of [
    ...['','-1','1.5','101','NaN','1e2'].map(limit=>quotaConfig(()=>{throw Error('invalid config must not query');},limit)),
    {...env,EMAIL_QUOTA:undefined},
    quotaConfig(async()=>{throw Error('private database detail');}),
    ...[{success:'false',meta:{changes:1}},{success:1,meta:{changes:1}},{success:{},meta:{changes:1}},{success:false,meta:{changes:1}},{success:true,meta:{}},{success:true,meta:{changes:2}},{success:true,meta:{changes:'1'}}].map(result=>quotaConfig(async()=>result))
  ]) {
    const {response,calls}=await run(request(),config);assert.equal(response.status,502);assert.equal(calls.length,2);
  }
});
test('Sheets failure reserves no email and Gmail failure does not refund a reservation',async()=>{
  let reservations=0;
  const config=quotaConfig(async()=>{reservations++;return {success:true,meta:{changes:1}};});
  await run(request(),config,mockGoogle(2));assert.equal(reservations,0);
  const result=await run(request(),config,mockGoogle(3));assert.equal(reservations,1);assert.equal(result.response.status,502);
});
test('an email reservation delayed past the deadline never starts Gmail',async(t)=>{
  const controller=new AbortController();t.mock.method(AbortSignal,'timeout',()=>controller.signal);
  const config=quotaConfig(async()=>{controller.abort();return {success:true,meta:{changes:1}};});
  const {response,calls}=await run(request(),config);assert.equal(response.status,502);assert.equal(calls.length,2);
});

for (const stage of [1,2,3]) test(`Google redirect at stage ${stage} is rejected without following it`,async()=>{
  const mock=mockGoogle();const base=mock.fetcher;
  mock.fetcher=async(url,init)=>{
    assert.equal(init.redirect,'manual');
    if(mock.calls.length===stage-1) {mock.calls.push({url,init});return new Response(null,{status:302,headers:{Location:'https://untrusted.example'}});}
    return base(url,init);
  };
  const {response,calls}=await run(request(),env,mock);assert.equal(response.status,502);assert.equal(calls.length,stage);
});
