import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
// Run from service/test-runtime; optional first argument supports an external harness copy.
const root=resolve(process.argv[2] || fileURLToPath(new URL('../',import.meta.url)));
const dir=await mkdtemp(join(tmpdir(),'kayak-workerd-'));
const require=createRequire(`${root}/package.json`);
const {Miniflare,Response:MFResponse,Log,LogLevel,convertV4MiniflareOptions}=require('miniflare');
// Snapshot the exact unmodified Worker so every check covers identical bytes.
const source=await readFile(`${root}/src/worker.js`);
const sourcePath=`${dir}/worker.js`;
await writeFile(sourcePath,source);
const config=JSON.parse(await readFile(`${root}/wrangler.jsonc`,'utf8'));
const hash=createHash('sha256').update(source).digest('hex');
const migration=await readFile(`${root}/migrations/0001_email_daily.sql`,'utf8');
const fixture={event:'game_start',ts:1790812800000,level:0,levelName:'Synthetic Lake',score:42,v:'test',deviceType:'tablet',screen:'1180x820',lang:'en',tz:'America/New_York',platform:'synthetic-platform',ua:'synthetic-browser',referrer:''};
const logs=[],checks=[],runtimes=[];
class CaptureLog extends Log{logWithLevel(level,message){logs.push({level,message});}}
function jsonStream(value){const bytes=new TextEncoder().encode(JSON.stringify(value));return new MFResponse(new ReadableStream({start(c){c.enqueue(bytes.slice(0,5));c.enqueue(bytes.slice(5));c.close();}}),{headers:{'Content-Type':'application/json'}});}
async function runtime(limit='100',{migrate=true}={}){
 const name=`cap-${runtimes.length}-${Date.now()}`,path=`${dir}/${name}`;await mkdir(path,{recursive:true});
 const state={scenario:'success',calls:[],unexpected:[],assertionFailures:[],timer:null,sheetIPs:new Set()};
 const bindings={...config.vars,REPORTING_ENABLED:'true',EMAIL_DAILY_LIMIT:limit,GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret',GOOGLE_REFRESH_TOKEN:'synthetic-refresh',SPREADSHEET_ID:'synthetic-sheet',NOTIFICATION_EMAIL:'owner@example.com'};
 const mf=new Miniflare(convertV4MiniflareOptions({name,modules:true,scriptPath:sourcePath,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,rootPath:dir,resourcePersistencePath:path,cf:false,log:new CaptureLog(LogLevel.DEBUG),stripCfConnectingIp:false,bindings,d1Databases:{EMAIL_QUOTA:name},ratelimits:{EVENT_LIMITER:{namespace_id:config.ratelimits[0].namespace_id,simple:config.ratelimits[0].simple}},outboundService:async request=>{
  try {
  const url=new URL(request.url);
  const stage=url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'?'oauth':url.hostname==='sheets.googleapis.com'&&url.pathname==='/v4/spreadsheets/synthetic-sheet/values/Sheet1!A:N:append'?'sheet':url.hostname==='gmail.googleapis.com'&&url.pathname==='/gmail/v1/users/me/messages/send'?'email':null;
  if(!stage){state.unexpected.push(request.url);return new MFResponse('Unexpected outbound denied',{status:403});}
  const raw=await request.text();state.calls.push({stage,body:raw,url:request.url});assert.equal(request.method,'POST');
  if(stage==='oauth'){
   const body=new URLSearchParams(raw);assert.equal(body.get('client_secret'),bindings.GOOGLE_CLIENT_SECRET);assert.equal(body.get('refresh_token'),bindings.GOOGLE_REFRESH_TOKEN);assert.equal(body.get('grant_type'),'refresh_token');
   if(state.scenario==='timeout')await new Promise(resolve=>{state.timer=setTimeout(resolve,29000);});
   if(state.scenario==='oauth-failure')return new MFResponse('synthetic failure',{status:401});
   if(state.scenario==='redirect')return new MFResponse(null,{status:302,headers:{Location:'https://blocked.example/secret-target'}});
   return jsonStream({access_token:'synthetic-access'});
  }
  assert.equal(request.headers.get('authorization'),'Bearer synthetic-access');
  if(stage==='sheet'){
   assert.equal(url.searchParams.get('valueInputOption'),'RAW');assert.equal(url.searchParams.get('insertDataOption'),'INSERT_ROWS');
   if(state.scenario==='sheet-failure')return new MFResponse('synthetic failure',{status:503});
   const row=JSON.parse(raw).values[0];state.sheetIPs.add(row[0]);return jsonStream({updates:{updatedRows:1}});
  }
  const mail=Buffer.from(JSON.parse(raw).raw,'base64url').toString('utf8');
  const ip=mail.match(/\r\n\r\nkayak played by IP ([^ ]+) check out the google sheet$/)?.[1];assert.ok(state.sheetIPs.has(ip),'email occurred before Sheet append for its IP');
  if(state.scenario==='email-failure')return new MFResponse('synthetic failure',{status:503});return jsonStream({id:'synthetic-message'});
  } catch(error) { state.assertionFailures.push(String(error)); throw error; }
 }}));
 const item={mf,state,bindings,name};runtimes.push(item);await mf.ready;
 const bound=await mf.getBindings();item.db=bound.EMAIL_QUOTA;
 if(migrate)await item.db.exec(migration.replace(/\n/g,' '));
 item.send=async(body=fixture,ip='192.0.2.10',cf)=>{
  const text=typeof body==='string'?body:JSON.stringify(body),stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(text.slice(0,17)));c.enqueue(new TextEncoder().encode(text.slice(17)));c.close();}});
  // Use Miniflare's internal cf-blob transport header with ASCII JSON escapes.
  // dispatchFetch's cf option merges a default Austin location and sends raw
  // non-ASCII JSON through an HTTP header, corrupting international fixtures.
  // This is local test plumbing only; production trusts request.cf, not headers.
  const cfBlob=JSON.stringify({city:null,region:null,regionCode:null,country:null,...cf}).replace(/[^\x20-\x7e]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
  const res=await mf.dispatchFetch('https://kayak-reporting.test/events',{method:'POST',headers:{Origin:bindings.ALLOWED_ORIGIN,'CF-Connecting-IP':ip,'Content-Type':'text/plain','MF-CF-Blob':cfBlob},body:stream,duplex:'half'});return{status:res.status,text:await res.text()};
 };
 return item;
}
async function check(name,fn){const start=performance.now();await fn();const result={name,status:'PASS',elapsed_ms:Math.round(performance.now()-start)};checks.push(result);console.log(JSON.stringify(result));}
try{
 const main=await runtime();const state=main.state;
 await check('enabled default fetch: real workerd streams, node:net IPv4, real D1, Sheets-first, Gmail base64url',async()=>{
  state.calls=[];assert.deepEqual(await main.send(),{status:200,text:'Recorded'});assert.deepEqual(state.calls.map(c=>c.stage),['oauth','sheet','email']);
  assert.deepEqual(JSON.parse(state.calls[1].body).values,[['192.0.2.10',fixture.ts,fixture.event,0,fixture.levelName,42,'test','tablet','1180x820','en','America/New_York','synthetic-platform','synthetic-browser','']]);
  const encoded=JSON.parse(state.calls[2].body).raw;assert.match(encoded,/^[A-Za-z0-9_-]+$/);assert.match(Buffer.from(encoded,'base64url').toString('utf8'),/^To: owner@example.com\r\nSubject: kayak played by IP 192\.0\.2\.10\r\n/);
 });
 await check('all three events and IPv6 pass real node:net validation',async()=>{for(const event of ['game_start','level_start','level_complete']){state.calls=[];assert.equal((await main.send({...fixture,event,collected:3},'2001:db8::10')).status,200);assert.equal(JSON.parse(state.calls[1].body).values[0][0],'2001:db8::10');}});
 const geo=await runtime();
 for(const [name,cf,location] of [
  ['absent',undefined,''],['empty',{},''],['null fields',{city:null,region:null,country:null},''],
  ['unsafe city',{city:'City\r\nBcc: attacker@example.com',country:'US'},''],
  ['wrong city type',{city:123,country:'US'},''],['oversized city',{city:'x'.repeat(81),country:'US'},''],
  ['unsafe region',{city:'City',regionCode:'NC\nBad',country:'US'},''],
  ['unknown country',{city:'City',country:'XX'},''],['Tor country',{country:'T1'},''],
  ['complete',{city:'Raleigh',regionCode:'NC',country:'US'},'Raleigh, NC, US'],
  ['valid code ignores unsafe unused region',{city:'Raleigh',regionCode:'NC',region:'bad\r\nBcc: attacker@example.com',country:'US'},'Raleigh, NC, US'],
  ['country only',{country:'US'},'US'],['international',{city:'São Paulo',regionCode:'SP',country:'BR'},'São Paulo, SP, BR'],
  ['long international',{city:'é'.repeat(80),region:'界'.repeat(80),country:'JP'},`${'é'.repeat(80)}, ${'界'.repeat(80)}, JP`]
 ])await check(`location ${name}: all three events append A:N and send one safe Gmail message in workerd`,async()=>{
  const geoIP=`2001:db8::${100+checks.length}`;
  for(const event of ['game_start','level_start','level_complete']){
   geo.state.calls=[];assert.deepEqual(await geo.send({...fixture,event},geoIP,cf),{status:200,text:'Recorded'});
   assert.deepEqual(geo.state.calls.map(c=>c.stage),['oauth','sheet','email']);
   assert.deepEqual(JSON.parse(geo.state.calls[1].body).values,[[geoIP,fixture.ts,event,0,fixture.levelName,42,'test','tablet','1180x820','en','America/New_York','synthetic-platform','synthetic-browser','']]);
   const mail=Buffer.from(JSON.parse(geo.state.calls[2].body).raw,'base64url').toString('utf8');
   for(const line of mail.split('\r\n\r\n')[0].split('\r\n'))if(line.includes('=?UTF-8?B?'))assert.ok(line.length<=76,'RFC 2047 header line limit');
   const subject=mail.match(/Subject: ([\s\S]*?)(?=\r\n[^ ])/)[1];
   const decoded=subject.startsWith('=?')?subject.split('\r\n ').map(word=>{assert.ok(word.length<=75);assert.match(word,/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?=$/);return Buffer.from(word.slice(10,-2),'base64').toString('utf8');}).join(''):subject;
   assert.equal(decoded,`kayak played by IP ${geoIP}${location?' - '+location:''}`);
   assert.deepEqual(mail.split('\r\n\r\n')[0].split('\r\n').filter(line=>!line.startsWith(' ')).map(line=>line.split(':')[0]),['To','Subject','MIME-Version','Content-Type']);
   assert.equal(mail.split('\r\n\r\n')[1],`kayak played by IP ${geoIP} check out the google sheet`);
  }
 });
 await check('malformed IP and streamed oversized body reject before Google',async()=>{state.calls=[];assert.equal((await main.send(fixture,'not-an-ip')).status,400);assert.equal((await main.send('x'.repeat(8193))).status,413);assert.equal(state.calls.length,0);});
 for(const [mode,stages]of[['oauth-failure',['oauth']],['sheet-failure',['oauth','sheet']],['email-failure',['oauth','sheet','email']],['redirect',['oauth']]])await check(mode+' stops at stage without following redirect',async()=>{state.scenario=mode;state.calls=[];assert.equal((await main.send(fixture,'192.0.2.20')).status,502);assert.deepEqual(state.calls.map(c=>c.stage),stages);});
 state.scenario='success';
 await check('real local rate-limit binding allows 30 then 429 before Google',async()=>{state.calls=[];const results=[];for(let i=0;i<31;i++)results.push((await main.send(fixture,'192.0.2.100')).status);assert.deepEqual(results,[...Array(30).fill(200),429]);assert.equal(state.calls.length,90);});
 await check('real D1 concurrent distinct-IP reservations cap5: exactly five Gmail attempts, seven accepted202; untrusted timestamps cannot change date',async()=>{
  const cap=await runtime('5');const results=await Promise.all(Array.from({length:12},(_,i)=>cap.send({...fixture,ts:i%2?0:9999999999999},`192.0.2.${130+i}`)));
  assert.equal(results.filter(r=>r.status===200).length,5);assert.equal(results.filter(r=>r.status===202&&r.text==='Recorded; notification limit reached').length,7);
  assert.equal(cap.state.calls.filter(c=>c.stage==='sheet').length,12);assert.equal(cap.state.calls.filter(c=>c.stage==='email').length,5);
  const rows=await cap.db.prepare('SELECT day,attempts FROM email_daily').all();const now=await cap.db.prepare("SELECT date('now') AS today").first();assert.deepEqual(rows.results,[{day:now.today,attempts:5}]);
 });
 await check('cap zero retains Sheet row and returns202 without Gmail or D1 schema',async()=>{const zero=await runtime('0',{migrate:false});assert.equal((await zero.send()).status,202);assert.deepEqual(zero.state.calls.map(c=>c.stage),['oauth','sheet']);});
 await check('D1 missing-table failure retains Sheet row, returns502 and never sends Gmail',async()=>{const broken=await runtime('5',{migrate:false});assert.equal((await broken.send()).status,502);assert.deepEqual(broken.state.calls.map(c=>c.stage),['oauth','sheet']);});
 await check('failed Gmail consumes real D1 quota slot before retry/new event',async()=>{
  const failed=await runtime('2');failed.state.scenario='email-failure';assert.equal((await failed.send(fixture,'192.0.2.200')).status,502);failed.state.scenario='success';assert.equal((await failed.send(fixture,'192.0.2.201')).status,200);assert.equal((await failed.send(fixture,'192.0.2.202')).status,202);assert.equal(failed.state.calls.filter(c=>c.stage==='email').length,2);assert.equal((await failed.db.prepare('SELECT attempts FROM email_daily').first()).attempts,2);
 });
 await check('unaltered 25-second AbortSignal.timeout aborts Google fetch in workerd',async()=>{state.scenario='timeout';state.calls=[];const start=performance.now();assert.equal((await main.send(fixture,'192.0.2.30')).status,502);const duration=performance.now()-start;assert.ok(duration>=24000&&duration<28500,`duration ${duration}`);assert.deepEqual(state.calls.map(c=>c.stage),['oauth']);});
 for(const r of runtimes){assert.deepEqual(r.state.unexpected,[]);assert.deepEqual(r.state.assertionFailures,[],'outbound fixture assertions must not hide behind expected 502 responses');}
 assert.equal(createHash('sha256').update(await readFile(`${root}/src/worker.js`)).digest('hex'),hash,'Worker source changed during runtime validation');
 const report={status:'PASS',checked_at_utc:new Date().toISOString(),source_sha256:hash,source_path:'src/worker.js',migration_sha256:createHash('sha256').update(migration).digest('hex'),compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,node:process.version,miniflare:require('miniflare/package.json').version,workerd:require('workerd/package.json').version,rate_limit:config.ratelimits[0],checks,network:'All Worker outbound fetches intercepted locally; unknown targets denied; cf metadata download disabled; synthetic credentials only.',limitations:['Source hash binds frozen cap implementation; later changes require rerun.','Local workerd/D1 prove runtime and SQLite behavior, not distributed edge operation or Free-plan CPU usage.','Synthetic Google replies; no real authorization, spreadsheet writes, or received emails.']};
 console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.stack);console.error(JSON.stringify({source_sha256:hash,checks,error:error.message,logs},null,2));process.exitCode=1;}
finally{for(const r of runtimes){clearTimeout(r.state.timer);await r.mf.dispose();}await rm(dir,{recursive:true,force:true});}
