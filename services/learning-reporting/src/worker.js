// Learning reporting Worker (#200). Exactly two public routes, POST/OPTIONS /v1/enroll and
// /v1/sync, for allowlisted game origins with a device credential or a one-time code.
// Every other route, including the dashboard's own assets, requires a verified
// Cloudflare Access JWT; cookie-authenticated mutations also require an exact same-origin
// Origin, a session-bound CSRF token and a JSON body. Missing configuration, schema or
// installation marker answers 503; nothing initializes itself from a request.
import { verifyAccess } from './access.js';
import { confirm, createCode, createProfile, csrfToken, exportProfile, overview, preview, renameProfile } from './admin.js';
import { LIMITS, RULES, readConfig } from './config.js';
import { DASHBOARD_CSS, dashboardHtml, dashboardScript } from './dashboard.js';
import { BudgetError, createDb, readSystem } from './db.js';
import { authenticateDevice, handleEnroll, handleSync } from './device.js';
import { deviceHealth } from './health.js';
import { corsHeaders, isUuid, json, log, readJson, text } from './http.js';
import { buildReport } from './report.js';
import { runRetention } from './retention.js';
import { addDays, today, validRange, zonedMidnight } from './time.js';
import { safeEqual } from './tokens.js';
import { CATALOG } from './validator.js';

const PAGE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
};

async function deviceRoute(request, env, config, route, now) {
  if (!config.enabled) return json(503, { error: 'disabled' });
  if (!config.originsValid) return json(503, { error: 'unavailable' });
  const origin = request.headers.get('Origin');
  // Browser requests from any other origin, and requests with no Origin, are refused.
  if (!origin || !config.origins.includes(origin)) return json(403, { error: 'origin' });
  const cors = corsHeaders(origin);
  if (request.method === 'OPTIONS') {
    if (request.headers.get('Access-Control-Request-Method') !== 'POST') return json(405, { error: 'method' }, cors);
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST') return json(405, { error: 'method' }, cors);
  const db = createDb(env.DB, LIMITS.statementBudget);
  const limiter = route === 'sync' ? env.SYNC_LIMITER : env.ENROLL_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') return json(503, { error: 'unavailable' }, cors);
  if (route === 'enroll') {
    if (!(await limiter.limit({ key: 'enroll' })).success) return json(429, { error: 'rate-limited' }, cors);
    const system = await readSystem(db);
    if (!system) return json(503, { error: 'unavailable' }, cors);
    const result = await handleEnroll(request, db, system, now);
    return json(result.status, result.body, cors);
  }
  const auth = await authenticateDevice(db, request.headers.get('Authorization'));
  if (auth.status) return json(auth.status, { error: auth.error }, cors);
  if (!(await limiter.limit({ key: auth.tokenHash.slice(0, 32) })).success) return json(429, { error: 'rate-limited' }, cors);
  const result = await handleSync(request, db, auth, now);
  return json(result.status, result.body, cors);
}

// Exact same-origin Origin plus the session-bound CSRF header, for every mutation.
async function mutationAllowed(request, system, session) {
  const origin = request.headers.get('Origin');
  const site = request.headers.get('Sec-Fetch-Site');
  if (origin !== new URL(request.url).origin || (site !== null && site !== 'same-origin')) return false;
  return safeEqual(request.headers.get('X-CSRF-Token') ?? '', await csrfToken(system, session));
}

async function reportRoute(url, db, config, now) {
  const profile = url.searchParams.get('profile');
  const to = url.searchParams.get('to') ?? today(config.timeZone, now);
  const from = url.searchParams.get('from') ?? addDays(to, -(RULES.defaultRangeDays - 1));
  if (!isUuid(profile) || !validRange(from, to)) return json(400, { error: 'malformed' });
  const start = new Date(zonedMidnight(from, config.timeZone)).toISOString();
  const end = new Date(zonedMidnight(addDays(to, 1), config.timeZone)).toISOString();
  const [profiles, devices, rows] = await db.batch([
    ['SELECT profile_id AS profileId, label FROM profiles WHERE profile_id = ?1', profile],
    [`SELECT d.device_id AS deviceId, d.name, d.last_sync_at AS lastSyncAt, d.revoked_at AS revokedAt,
        (SELECT count(*) FROM device_profiles x WHERE x.device_id = d.device_id) > 1 AS shared
      FROM devices d WHERE d.device_id IN (SELECT device_id FROM device_profiles WHERE profile_id = ?1)
        OR d.device_id IN (SELECT DISTINCT device_id FROM events WHERE profile_id = ?1)
      ORDER BY d.enrolled_at, d.device_id`, profile],
    [`SELECT payload FROM events WHERE profile_id = ?1 AND recorded_at >= ?2 AND recorded_at < ?3
      ORDER BY recorded_at, device_id, epoch_id, seq LIMIT ${LIMITS.reportRows + 1}`, profile, start, end],
  ]);
  if (!profiles.length) return json(404, { error: 'not-found' });
  const events = rows.slice(0, LIMITS.reportRows).map(row => JSON.parse(row.payload));
  return json(200, buildReport({
    profile: profiles[0], from, to, truncated: rows.length > LIMITS.reportRows, catalog: CATALOG,
    devices: devices.map(device => ({ ...device, shared: device.shared === 1, lastSyncAt: device.lastSyncAt === null ? null : new Date(device.lastSyncAt).toISOString() })),
    events, retentionDays: config.retentionDays, timeZone: config.timeZone, now,
  }));
}

async function protectedRoute(request, env, config, url, now) {
  const access = await verifyAccess(request, config, { now });
  if (!access.ok) {
    log('access', access.reason, access.status);
    return json(access.status, { error: access.status === 503 ? 'unavailable' : 'unauthorized' });
  }
  if (!config.retentionValid || !config.zoneValid) return json(503, { error: 'unavailable' });
  const db = createDb(env.DB, LIMITS.statementBudget);
  const system = await readSystem(db);
  if (!system) return json(503, { error: 'unavailable' });
  const path = url.pathname, method = request.method;
  if (method === 'GET') {
    if (path === '/') return text(200, dashboardHtml(), 'text/html; charset=utf-8', PAGE_HEADERS);
    if (path === '/app.js') return text(200, dashboardScript(), 'text/javascript; charset=utf-8', PAGE_HEADERS);
    if (path === '/app.css') return text(200, DASHBOARD_CSS, 'text/css; charset=utf-8', PAGE_HEADERS);
    if (path === '/api/session') {
      return json(200, {
        csrf: await csrfToken(system, access.session), timeZone: config.timeZone, retentionDays: config.retentionDays,
        reportingEnabled: config.enabled, today: today(config.timeZone, now), rules: RULES,
        limits: { profiles: LIMITS.profiles, devices: LIMITS.devices, codeMinutes: LIMITS.codeTtlMs / 60000 },
      });
    }
    if (path === '/api/overview') return json(200, await overview(db));
    if (path === '/api/devices') return json(200, await deviceHealth(db));
    if (path === '/api/report') return reportRoute(url, db, config, now);
    if (path === '/api/export') {
      const result = await exportProfile(db, url.searchParams.get('profile'), config, now);
      if (result.status !== 200) return json(result.status, result.body);
      return text(200, JSON.stringify(result.file, null, 2), 'application/json; charset=utf-8',
        { 'Content-Disposition': `attachment; filename="learning-report-${new Date(now).toISOString().slice(0, 10)}.json"` });
    }
    return json(404, { error: 'not-found' });
  }
  if (method !== 'POST') return json(405, { error: 'method' });
  if (!(await mutationAllowed(request, system, access.session))) return json(403, { error: 'csrf' });
  const body = await readJson(request, LIMITS.adminBytes);
  if (body.status) return json(body.status, { error: body.error });
  let result;
  if (path === '/api/profiles') result = await createProfile(db, body.value, now);
  else if (path === '/api/profiles/rename') result = await renameProfile(db, body.value);
  else if (path === '/api/codes') result = await createCode(db, body.value, now);
  else if (path === '/api/preview') result = await preview(db, system, access.session, body.value, now);
  else if (path === '/api/confirm') result = await confirm(db, system, access.session, body.value, now);
  else return json(404, { error: 'not-found' });
  log(path, result.status === 200 ? 'ok' : 'refused', result.status);
  return json(result.status, result.body);
}

export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const config = readConfig(env);
  if (url.pathname === '/v1/enroll' || url.pathname === '/v1/sync') {
    const response = await deviceRoute(request, env, config, url.pathname.slice(4), now);
    log(url.pathname, response.status < 300 ? 'ok' : 'refused', response.status);
    return response;
  }
  return protectedRoute(request, env, config, url, now);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      log('request', error instanceof BudgetError ? 'budget' : 'error', 503);
      return json(503, { error: 'unavailable' });
    }
  },
  // Awaited, so a failed retention run fails the scheduled event visibly.
  async scheduled(controller, env) {
    await runRetention(env, Date.now());
  },
};
