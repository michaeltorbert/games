// Execute the actual Wrangler-built, Access-protected assets in browser engines.
// Synthetic local JWT/D1 only; all browser and Worker outbound traffic is denied
// except the local Worker routes and synthetic JWKS. No enroll/sync or cron runs.
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
// Allows the same pinned dependencies in an isolated local runtime when file-provider
// offloading prevents using this checkout's node_modules. No production config changes.
const require = createRequire(resolve(process.env.LR_RUNTIME_ROOT || root, 'package.json'));
const { Miniflare, Response: MFResponse, convertV4MiniflareOptions } = require('miniflare');
const bundlePath = resolve(process.env.LR_DASHBOARD_BUNDLE || resolve(root, 'dist/worker.js'));
const output = process.env.LR_DASHBOARD_ARTIFACTS;
const HOST = 'https://reports.synthetic.test';
const TEAM = 'https://dashboard-fixture.cloudflareaccess.com';
const AUD = 'c'.repeat(64);
const b64 = data => Buffer.from(data).toString('base64url');
const key = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', key.publicKey), kid: 'fixture', alg: 'RS256' };
const now = Math.floor(Date.now() / 1000);
const signing = `${b64(JSON.stringify({ alg: 'RS256', kid: 'fixture' }))}.${b64(JSON.stringify({ iss: TEAM, aud: [AUD], sub: 'synthetic-owner', iat: now - 5, exp: now + 3600 }))}`;
const jwt = `${signing}.${b64(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, Buffer.from(signing)))}`;
const hash = data => createHash('sha256').update(data).digest('hex');
const bundleHash = hash(await readFile(bundlePath));

for (const engine of [chromium, webkit]) for (const viewport of [{ width: 1180, height: 820 }, { width: 393, height: 852 }]) {
  const name = `${engine.name()}-${viewport.width}`;
  const dpr = viewport.width === 393 ? 3 : 2;
  test(`built dashboard starts empty and populated with uploads disabled: ${name}`, { timeout: 45000 }, async () => {
    const outbound = [], calls = [], errors = [], evidence = { name, bundleHash, viewport, isMobile: true, hasTouch: true, deviceScaleFactor: dpr,
      limitation: 'Engine emulation, not Apple Simulator, physical Safari, native chrome, keyboard, safe areas or human comprehension.' };
    const mf = new Miniflare(convertV4MiniflareOptions({
      name: 'dashboard-startup', modules: true, scriptPath: bundlePath, rootPath: resolve(bundlePath, '..'), compatibilityDate: '2026-10-01', cf: false,
      bindings: { REPORTING_ENABLED: 'false', ALLOWED_ORIGINS: '', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, RETENTION_DAYS: '90', DISPLAY_TIME_ZONE: 'UTC' },
      d1Databases: { DB: 'dashboard-startup' },
      outboundService: async request => {
        if (request.url === `${TEAM}/cdn-cgi/access/certs`) return new MFResponse(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
        outbound.push(request.url); return new MFResponse('denied', { status: 403 });
      },
    }));
    let browser, page;
    try {
      await mf.ready;
      const db = (await mf.getBindings()).DB;
      const migration = (await readFile(resolve(root, 'migrations/0001_initial.sql'), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(sql => sql.trim()).filter(Boolean);
      await db.batch(migration.map(sql => db.prepare(sql)));
      for (const path of ['/', '/app.js', '/app.css', '/api/session', '/api/overview']) {
        assert.equal((await mf.dispatchFetch(`${HOST}${path}`)).status, 401, `${path} remains protected`);
      }
      browser = await engine.launch();
      const context = await browser.newContext({ viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: dpr,
        userAgent: `Mozilla/5.0 (${viewport.width === 393 ? 'iPhone; CPU iPhone' : 'iPad; CPU'} OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1` });
      page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      // The dashboard has no audio elements or playback calls. No system preferences or
      // browser audio APIs are modified; no game page is opened by this suite.
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== HOST) { outbound.push(req.url()); return route.abort(); }
        calls.push({ path: url.pathname, method: req.method() });
        const response = await mf.dispatchFetch(req.url(), { method: req.method(), headers: { ...req.headers(), 'Cf-Access-Jwt-Assertion': jwt }, ...(req.postData() ? { body: req.postData() } : {}) });
        const body = Buffer.from(await response.arrayBuffer());
        if (url.pathname === '/app.js') evidence.appJsHash = hash(body);
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
      });
      const check = async (state, text) => {
        await page.waitForFunction(value => document.getElementById('status').textContent === '' && document.getElementById('view-report').textContent.includes(value), text, { timeout: 5000 });
        for (const view of ['devices', 'setup', 'report']) {
          await page.locator(`[data-view="${view}"]`).tap();
          await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
          if (view === 'devices') await page.getByText('No devices connected yet.', { exact: true }).waitFor();
          if (view === 'setup') await page.getByText('Uploads are switched off for this service (REPORTING_ENABLED).', { exact: true }).waitFor();
          if (view === 'report') await page.waitForFunction(() => document.getElementById('status').textContent === '', null, { timeout: 5000 });
          const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, screen: { width: screen.width, height: screen.height }, dpr: devicePixelRatio, userAgent: navigator.userAgent,
            overflow: document.documentElement.scrollWidth - innerWidth,
            small: [...document.querySelectorAll('button,input,select,summary,a.action')].map(e => e.matches('[type=checkbox]') ? e.closest('label') : e).filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height; }).map(e => ({ text: e.textContent, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })).filter(b => b.width < 44 || b.height < 44) }));
          assert.ok(geometry.overflow <= 0, 'no horizontal overflow');
          assert.deepEqual(geometry.small, [], '44px targets');
          evidence[`${state}-${view}`] = geometry;
          if (output) await page.screenshot({ path: resolve(output, `${name}-${state}-${view}.png`), fullPage: true });
        }
      };
      if (output) await mkdir(output, { recursive: true });
      await page.goto(HOST);
      await check('empty', 'No profiles yet');
      assert.deepEqual(calls.filter(c => c.path.startsWith('/api/')).slice(0, 2).map(c => c.path), ['/api/session', '/api/overview']);
      // Direct synthetic fixture setup, no enrollment and no collection enabled.
      await db.prepare('INSERT INTO profiles (profile_id,label,created_at) VALUES (?1,?2,?3)').bind('00000000-0000-4000-8000-000000000001', 'Synthetic Lark', Date.now()).run();
      await page.reload();
      await check('populated', 'Synthetic Lark');
      for (const title of ['Number facts', 'Football']) await page.getByRole('heading', { name: title, exact: true }).waitFor();
      assert.ok(calls.some(c => c.path === '/api/report'), 'real report fetched');
      assert.equal(calls.some(c => c.method !== 'GET' || c.path.startsWith('/v1/')), false, 'startup and taps never enroll, upload or mutate');
      for (const table of ['devices', 'events', 'enrollment_codes']) assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n, 0);
      assert.deepEqual(errors, [], 'no browser exceptions or unhandled rejections');
      assert.deepEqual(outbound, [], 'no external requests');
      evidence.engineVersion = browser.version();
    } finally {
      if (output && page && errors.length) await page.screenshot({ path: resolve(output, `${name}-failed-startup.png`), fullPage: true });
      evidence.errors = errors; evidence.calls = calls; evidence.outbound = outbound;
      if (output) { await mkdir(output, { recursive: true }); await writeFile(resolve(output, `${name}.json`), JSON.stringify(evidence, null, 2)); }
      await browser?.close(); await mf.dispose();
    }
  });
}
