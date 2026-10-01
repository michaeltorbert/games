// @ts-check
import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

/** @typedef {{ALLOWED_ORIGIN:string, REPORTING_ENABLED:string, GOOGLE_CLIENT_ID:string, GOOGLE_CLIENT_SECRET:string, GOOGLE_REFRESH_TOKEN:string, SPREADSHEET_ID:string, NOTIFICATION_EMAIL:string, EVENT_LIMITER:RateLimit, EMAIL_QUOTA:D1Database, EMAIL_DAILY_LIMIT:string}} Env */
/** @typedef {{event:string, ts:number, level:number, levelName:string, score:number, v:string, deviceType:string, screen:string, lang:string, tz:string, platform:string, ua:string, referrer:string}} GameEvent */
const MAX_BODY = 8192;
const EVENTS = new Set(['game_start', 'level_start', 'level_complete']);

class ReportingError extends Error {
  /** @param {string} stage @param {number} status */
  constructor(stage, status) { super(stage); this.stage = stage; this.status = status; }
}

/** @param {ReadableStream<Uint8Array>|null} body @param {number} limit */
async function readBounded(body, limit) {
  if (!body) return '';
  const reader = body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ReportingError('body', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

/** @param {unknown} input @returns {GameEvent} */
export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ReportingError('payload', 400);
  const data = { .../** @type {Record<string, unknown>} */ (input) };
  for (const key of ['deviceType','screen','lang','tz','platform','ua','referrer']) {
    if (data[key] === undefined) data[key] = '';
  }
  if (typeof data.event !== 'string' || !EVENTS.has(data.event)) throw new ReportingError('event', 400);
  for (const key of ['ts', 'level', 'score']) {
    if (!Number.isSafeInteger(data[key]) || /** @type {number} */(data[key]) < 0) throw new ReportingError('payload', 400);
  }
  for (const [key, limit] of Object.entries({levelName:200, v:40, deviceType:40, screen:40, lang:80, tz:100, platform:200, ua:2048, referrer:2048})) {
    if (typeof data[key] !== 'string' || data[key].length > limit) throw new ReportingError('payload', 400);
  }
  return /** @type {GameEvent} */ (data);
}

/** Preserve the existing A:N order; timezone deliberately comes from tz.
 * @param {GameEvent} data @param {string} ip */
export function sheetRow(data, ip) {
  return [ip, data.ts, data.event, data.level, data.levelName, data.score, data.v,
    data.deviceType, data.screen, data.lang, data.tz, data.platform, data.ua, data.referrer];
}

/** Optional edge metadata only: never fetch, stringify unknown values, or log location.
 * Returns a safe MIME header value, falling back to the original subject on any error.
 * @param {Request} request @param {string} ip */
export function emailSubject(request, ip) {
  const fallback = `kayak played by IP ${ip}`;
  try {
    const cf = request.cf;
    if (!cf || typeof cf !== 'object' || Array.isArray(cf)) return fallback;
    /** @param {unknown} value */
    const place = value => {
      if (value === undefined || value === null || value === '') return '';
      if (typeof value !== 'string' || value.length > 80 || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) throw new Error('Invalid location');
      return value.trim();
    };
    const city = place(cf.city);
    const region = place(cf.regionCode) || place(cf.region);
    const country = place(cf.country);
    // Cloudflare's special unknown/Tor country codes are not locations.
    if (country && (!/^[A-Z]{2}$/.test(country) || country === 'XX' || country === 'T1')) return fallback;
    const location = [city, region, country].filter(Boolean).join(', ');
    if (!location) return fallback;
    const subject = `${fallback} - ${location}`;
    // Encode every enriched subject, including ASCII: metadata cannot masquerade
    // as an encoded-word or inject headers. 39 UTF-8 bytes keep words below 75
    // characters and the first line (including "Subject: ") below 76 (RFC 2047).
    const words = []; let chunk = '';
    for (const char of subject) {
      if (Buffer.byteLength(chunk + char, 'utf8') > 39) {
        words.push(`=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`);
        chunk = '';
      }
      chunk += char;
    }
    if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`);
    return words.join('\r\n ');
  } catch { return fallback; }
}

/** @param {Env} env */
function validateConfig(env) {
  for (const key of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','SPREADSHEET_ID','NOTIFICATION_EMAIL']) {
    if (!/** @type {Record<string,unknown>} */(env)[key]) throw new ReportingError('configuration', 503);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(env.SPREADSHEET_ID) || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(env.NOTIFICATION_EMAIL)) throw new ReportingError('configuration', 503);
}

/** @param {string} url @param {RequestInit} init @param {string} stage @param {AbortSignal} signal @param {typeof fetch} fetcher */
async function google(url, init, stage, signal, fetcher) {
  const response = await fetcher(url, {...init, signal, redirect:'manual'});
  if (!response.ok) { await response.body?.cancel(); throw new ReportingError(stage, response.status); }
  try { return JSON.parse(await readBounded(response.body, 65536)); }
  catch { throw new ReportingError(stage, 502); }
}

/** Reserve before sending; uncertain Gmail results still consume the slot.
 * D1 serializes this one write globally, using its UTC date instead of event data.
 * @param {Env} env */
export async function reserveEmail(env) {
  if (!/^(0|[1-9][0-9]*)$/.test(env.EMAIL_DAILY_LIMIT)) throw new ReportingError('email-quota', 503);
  const limit = Number(env.EMAIL_DAILY_LIMIT);
  if (!Number.isSafeInteger(limit) || limit > 100) throw new ReportingError('email-quota', 503);
  if (limit === 0) return false;
  // Keep WHERE in INSERT ... SELECT: SQLite needs it to disambiguate ON CONFLICT.
  const result = await env.EMAIL_QUOTA.prepare(`
    INSERT INTO email_daily (day, attempts)
    SELECT date('now'), 1 WHERE ?1 > 0
    ON CONFLICT(day) DO UPDATE SET attempts = email_daily.attempts + 1
    WHERE email_daily.attempts < ?1
  `).bind(limit).run();
  if (result.success !== true || ![0, 1].includes(result.meta?.changes)) throw new ReportingError('email-quota', 503);
  return result.meta.changes === 1;
}

/** @param {GameEvent} event @param {string} ip @param {Request} request @param {Env} env @param {typeof fetch} fetcher */
async function deliver(event, ip, request, env, fetcher) {
  let stage = 'oauth';
  const signal = AbortSignal.timeout(25000);
  try {
    const token = await google('https://oauth2.googleapis.com/token', {
      method:'POST', body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID, client_secret:env.GOOGLE_CLIENT_SECRET, refresh_token:env.GOOGLE_REFRESH_TOKEN, grant_type:'refresh_token'})
    }, stage, signal, fetcher);
    if (typeof token.access_token !== 'string' || !token.access_token) throw new ReportingError(stage, 502);
    const headers = {Authorization:`Bearer ${token.access_token}`, 'Content-Type':'application/json'};
    stage = 'sheet';
    const appended = await google(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/Sheet1!A:N:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method:'POST', headers, body:JSON.stringify({majorDimension:'ROWS', values:[sheetRow(event, ip)]})
    }, stage, signal, fetcher);
    if (appended.updates?.updatedRows !== 1) throw new ReportingError(stage, 502);
    stage = 'email-quota';
    if (!await reserveEmail(env)) {
      console.warn(JSON.stringify({service:'kayak-reporting', outcome:'recorded-without-email', stage, event:event.event}));
      return 'email-limited';
    }
    // D1 does not take an AbortSignal. A delayed reservation must not send past the deadline.
    signal.throwIfAborted();
    stage = 'email';
    const message = `To: ${env.NOTIFICATION_EMAIL}\r\nSubject: ${emailSubject(request, ip)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nkayak played by IP ${ip} check out the google sheet`;
    const sent = await google('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method:'POST', headers, body:JSON.stringify({raw:Buffer.from(message).toString('base64url')})
    }, stage, signal, fetcher);
    if (typeof sent.id !== 'string' || !sent.id) throw new ReportingError(stage, 502);
    console.info(JSON.stringify({service:'kayak-reporting', outcome:'delivered', event:event.event}));
    return 'delivered';
  } catch (error) {
    // Never log Google bodies, credentials, IP addresses, or event payloads.
    console.error(JSON.stringify({service:'kayak-reporting', outcome:'failed', stage, upstreamStatus:error instanceof ReportingError ? error.status : undefined}));
    return 'failed';
  }
}

/** @param {number} status @param {string} stage @param {string} message @param {HeadersInit} [headers] */
function rejectRequest(status, stage, message, headers) {
  console.warn(JSON.stringify({service:'kayak-reporting', outcome:'rejected', stage, status}));
  return new Response(message, {status, headers});
}

/** @param {Request} request @param {Env} env @param {ExecutionContext} ctx @param {typeof fetch} [fetcher] */
export async function handleRequest(request, env, ctx, fetcher = fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/health' && request.method === 'GET') return Response.json({service:'kayak-reporting', enabled:env.REPORTING_ENABLED === 'true'});
  if (path !== '/events') return new Response('Not found', {status:404});
  const origin = request.headers.get('Origin');
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return rejectRequest(403, 'origin', 'Forbidden');
  const headers = {'Access-Control-Allow-Origin':origin, 'Vary':'Origin', 'Cache-Control':'no-store'};
  if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:{...headers, 'Access-Control-Allow-Methods':'POST', 'Access-Control-Allow-Headers':'Content-Type'}});
  if (request.method !== 'POST') return rejectRequest(405, 'method', 'Method not allowed', {...headers, Allow:'POST, OPTIONS'});
  if (env.REPORTING_ENABLED !== 'true') return rejectRequest(503, 'disabled', 'Reporting disabled', headers);
  try {
    validateConfig(env);
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!isIP(ip)) throw new ReportingError('client-ip', 400);
    if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new ReportingError('body', 413);
    let input;
    try { input = JSON.parse(await readBounded(request.body, MAX_BODY)); }
    catch (error) { if (error instanceof ReportingError) throw error; throw new ReportingError('payload', 400); }
    const event = validateEvent(input);
    // This public game has no identity; shared-IP throttling is only an abuse brake.
    if (!(await env.EVENT_LIMITER.limit({key:`kayak:${ip}`})).success) return rejectRequest(429, 'throttled', 'Rate limited', headers);
    const delivery = deliver(event, ip, request, env, fetcher);
    ctx.waitUntil(delivery); // Preserve delivery if a beacon client disconnects.
    const outcome = await delivery;
    if (outcome === 'email-limited') return new Response('Recorded; notification limit reached', {status:202, headers});
    return new Response(outcome === 'delivered' ? 'Recorded' : 'Delivery failed', {status:outcome === 'delivered' ? 200 : 502, headers});
  } catch (error) {
    const status = error instanceof ReportingError ? error.status : 503;
    return rejectRequest(status, error instanceof ReportingError ? error.stage : 'receiver', status < 500 ? 'Invalid event' : 'Unavailable', headers);
  }
}

export default { fetch:handleRequest };
