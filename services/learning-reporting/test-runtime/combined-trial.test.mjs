// One small combined trial (#200): the actual game pages and public enrollment page, with
// their real IndexedDB outbox and sync code, upload to the actual Wrangler-built Worker and
// a migrated, ephemeral local D1. The owner uses the actual built dashboard controls.
// Synthetic only: one profile, two isolated device contexts, one Football and one Number
// facts question answered by tapping the real UI. Supported test hooks set starting state
// and look up the correct choice; nothing constructs, appends or inserts practice events.
// Playwright routing serves the repo's published game files at a synthetic HTTPS origin,
// overrides only config.js in the browser context, and passes every service request to the
// Worker, returning its actual status, headers and body unchanged. Routing is not a native
// network or CORS preflight path, and the injected synthetic Access JWT stands in for the
// Access edge; it is not a Cloudflare Access policy. Codes, tokens and keys stay in memory;
// the receipt holds IDs, counts and classes only. No real account, network or credential.
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium, webkit } from 'playwright';
import { expectFootballTestMuted, muteFootballForTests } from '../../../tests/football-test-mute.mjs';
import { readOutbox } from '../../../tests/learning-outbox-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = resolve(root, '../..');
// Same isolated-runtime pattern as dashboard-startup.test.mjs (pinned Miniflare outside an
// offloaded checkout). No production config changes.
const require = createRequire(resolve(process.env.LR_RUNTIME_ROOT || root, 'package.json'));
const { Miniflare, Response: MFResponse, convertV4MiniflareOptions } = require('miniflare');
const bundlePath = resolve(process.env.LR_DASHBOARD_BUNDLE || resolve(root, 'dist/worker.js'));
const output = process.env.LR_COMBINED_ARTIFACTS;
const engineNames = (process.env.LR_COMBINED_ENGINES || 'webkit').split(',').map(name => name.trim());
const HOST = 'https://reports.synthetic.test';
const GAME = 'https://games.synthetic.test';
const TEAM = 'https://combined-trial.cloudflareaccess.com';
const AUD = 'c'.repeat(64);
const LABEL = 'Synthetic Lark';
const DEVICES = ['Trial iPad A', 'Trial iPad B'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// The two external font stylesheets the unchanged source declares: Football's markup link
// and the @import in shared/fonts.css. The first routed WebKit run timed out waiting for
// Football's load event while these render-blocking stylesheets were aborted (cause not
// established). This network-isolation fixture answers exactly these URLs locally with an
// empty stylesheet; nothing leaves the machine, and any other font query or host is denied.
const FONT_CSS = Object.fromEntries([
  ['football/index.html', /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/],
  ['shared/fonts.css', /@import url\('(https:\/\/fonts\.googleapis\.com\/css2\?[^']+)'\)/],
].map(([source, pattern]) => [new URL((pattern.exec(readFileSync(resolve(repo, source), 'utf8')) ?? [])[1]?.replace(/&amp;/g, '&')).href, source]));
const MAX_EVENTS = 40;
// Copied from src/report.js so copy drift fails here too.
const TIMING_CAVEAT = 'Entry time includes reading and tapping. It cannot tell us whether an answer was recalled, counted, or calculated. Quick entry means within 8 seconds for a one-digit answer or 10 seconds for two digits; it is a practice guide, not a mastery measure.';
const EXCLUSIONS = 'Not included: practice before a device was connected, practice not yet sent, and practice removed by the retention window.';
const SPARSE = 'Not enough reported evidence yet';
const CAPTURE_CSP = "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
const LIMITATIONS = [
  'Local actual-client and actual-built-Worker proof only: local workerd and SQLite D1, not hosted Cloudflare edge, CPU, quotas, billing or daily row usage.',
  'Synthetic Access JWT validated by the Worker; the Access edge, owner-only policy contents and non-owner denial are not exercised.',
  'Playwright route interception, not a native network path: no proof of a native CORS preflight or origin enforcement by the browser (AC03/AC04 rely on other tests).',
  'Browser-engine emulation, not physical Safari, an Apple device, a household or human comprehension.',
  'Network isolation: the two declared web-font stylesheets (Football markup and shared/fonts.css) are answered with an empty stylesheet (no remote request), so pages render with fallback fonts; font rendering is not evidence here.',
  'Screenshot capture: one owner-page CSP style refusal per screenshot, logged during that capture call, is attributed to Playwright\'s WebKit screenshot preparation (pinned source) and kept in screenshotCaptureArtifacts, not the app console window; an identical app message inside that window would not be distinguishable. Production CSP is unchanged.',
  'One question per game; not a gameplay-invariance, load, security, retention or growth matrix.',
];

const b64 = data => Buffer.from(data).toString('base64url');
const hash = data => createHash('sha256').update(data).digest('hex');
const key = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', key.publicKey), kid: 'fixture', alg: 'RS256' };
const now = Math.floor(Date.now() / 1000);
const signing = `${b64(JSON.stringify({ alg: 'RS256', kid: 'fixture' }))}.${b64(JSON.stringify({ iss: TEAM, aud: [AUD], sub: 'synthetic-owner', iat: now - 5, exp: now + 3600 }))}`;
const jwt = `${signing}.${b64(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, Buffer.from(signing)))}`;
const bundleHash = hash(await readFile(bundlePath));
const SECRETS = [/lr1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}/g, /eyJ[\w-]+\.[\w-]+\.[\w-]+/g, /\b[0-9A-HJKMNP-TV-Z]{26}\b/g];
// Exact codes, tokens and the JWT seen in this run (memory only), redacted whatever their format.
const seen = new Set([jwt]);
const clean = text => [...seen].reduce((value, secret) => value.split(secret).join('[redacted]'),
  SECRETS.reduce((value, pattern) => value.replace(pattern, '[redacted]'), String(text)));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webmanifest': 'application/manifest+json' };
const PUBLISHED = ['football/', 'place-value-practice/', 'shared/'];
// The repo's published game files, byte for byte; nothing else in the checkout is served.
async function published(pathname) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  if (rel !== 'version.json' && !PUBLISHED.some(prefix => rel.startsWith(prefix))) return null;
  const file = resolve(repo, rel);
  if (!file.startsWith(repo + sep) || rel.split('/').some(part => part.startsWith('.'))) return null;
  try { return { rel, body: await readFile(file) }; } catch (error) { return null; }
}
const CONFIG_OVERRIDE = `globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '${HOST}' });`;
const UNCONFIGURED_OVERRIDE = "globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '' });";
const HOP = new Set(['host', 'connection', 'content-length', 'keep-alive', 'transfer-encoding', 'upgrade', 'te', 'trailer', 'proxy-connection']);
const IPAD = { viewport: { width: 1180, height: 820 }, screen: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const PHONE = { width: 393, height: 852 };

// Same startup handling as tests/curriculum-fixture.mjs: confirms the curriculum dialog.
const CURRICULUM_DIALOG = () => {
  const handled = new WeakSet();
  new MutationObserver(() => {
    const dialog = document.querySelector('.curriculum-dialog'); if (!dialog) return;
    const memory = dialog.querySelector('#curriculum-memory');
    if (!memory.hidden && handled.has(dialog)) { memory.click(); return; }
    if (handled.has(dialog)) { if (dialog.querySelector('#curriculum-error').textContent.includes('another tab') && !dialog.querySelector('[type=submit]').disabled) dialog.querySelector('form').requestSubmit(); return; }
    handled.add(dialog);
    if (location.pathname.includes('/place-value-practice/')) { const input = dialog.querySelector('input'); input.value = '187'; input.dispatchEvent(new Event('input')); }
    dialog.querySelector('form').requestSubmit();
    if (dialog.querySelector('[type=submit]').textContent === 'Confirm page') dialog.querySelector('form').requestSubmit();
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
};
// Starting drive state from tests/learning-reporting-sync.spec.mjs (SCRIPT[0]).
const OFFENSE = Object.freeze({
  possession: 'offense', direction: 1, quarter: 2, down: 2, yardsToGo: 8, yardLine: 30, firstDownLine: 38, driveStart: 20,
  scores: { player: 7, opponent: 7 }, totalYards: { player: 83, opponent: 71 }, plays: 4, drivePlays: 2,
});

// Event classes for the receipt: no prompt, answer, fact, family or concept.
const classes = event => Object.fromEntries(Object.entries({
  game: event.game, kind: event.kind, number: event.number, correct: event.correct, support: event.support, evidenceClass: event.evidenceClass,
  grading: event.grading, resolution: event.resolution, outcome: event.outcome, eligibleCheck: event.eligibleCheck, helped: event.helped,
  timing: event.game === 'facts' && event.kind === 'resolution' ? (event.timingMs === null ? 'not timed' : 'timed') : undefined,
}).filter(([, value]) => value !== undefined));

for (const name of engineNames) {
  const engine = { webkit, chromium }[name];
  test(`combined trial: two enrolled devices, Football and Number facts, actual built Worker and local D1: ${name}`, { timeout: 90000 }, async () => {
    assert.ok(engine, `known engine ${name}`);
    const receipt = { engine: name, stage: 'start', bundle: { path: bundlePath.split(sep).slice(-2).join('/'), sha256: bundleHash }, node: process.version,
      miniflare: require('miniflare/package.json').version, primary: { ...IPAD.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, limitations: LIMITATIONS };
    const captureArtifacts = [];
    const served = {}, external = [], stubbed = [], missing = [], unexpected = [], problems = [], consoleErrors = [], ownerCalls = [], deviceCalls = [], fulfillFailures = [];
    const submitted = new Map(), acks = new Map(), outcomes = [], enrolled = [];
    const pages = {};
    const stage = value => { receipt.stage = value; };
    const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
    const mf = new Miniflare(convertV4MiniflareOptions({
      name: 'combined-trial', modules: true, scriptPath: bundlePath, rootPath: resolve(bundlePath, '..'), compatibilityDate: config.compatibility_date, cf: false,
      bindings: { REPORTING_ENABLED: 'true', ALLOWED_ORIGINS: GAME, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, RETENTION_DAYS: '90', DISPLAY_TIME_ZONE: 'UTC' },
      d1Databases: { DB: 'combined-trial' },
      ratelimits: Object.fromEntries(config.ratelimits.map(item => [item.name, { namespace_id: item.namespace_id, simple: item.simple }])),
      outboundService: async request => {
        if (request.url === `${TEAM}/cdn-cgi/access/certs`) return new MFResponse(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } });
        external.push(`worker:${new URL(request.url).host}`); return new MFResponse('denied', { status: 403 });
      },
    }));

    // The request as the browser made it (minus hop-by-hop headers), to the Worker; its
    // actual response comes back unchanged.
    async function toWorker(route, extra = {}) {
      const req = route.request();
      const headers = Object.fromEntries(Object.entries(await req.allHeaders()).filter(([header]) => !header.startsWith(':') && !HOP.has(header.toLowerCase())));
      const body = req.postDataBuffer();
      const response = await mf.dispatchFetch(req.url(), { method: req.method(), headers: { ...headers, ...extra }, ...(body ? { body } : {}) });
      return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) };
    }
    const fulfill = (route, answer, label) => route.fulfill(answer).catch(() => fulfillFailures.push(label));
    // Browser-generated IDs and the Worker's own receipts, in memory. Codes and tokens are
    // never kept.
    function observe(label, path, req, answer) {
      let sent, got;
      try { sent = JSON.parse(req.postData()); got = JSON.parse(answer.body.toString('utf8')); } catch (error) { return; }
      if (path === '/v1/enroll') { if (typeof sent.code === 'string') seen.add(sent.code); if (typeof got.token === 'string') seen.add(got.token); }
      if (path === '/v1/enroll' && answer.status === 200) enrolled.push({ label, deviceId: got.deviceId, profileIds: got.profileIds });
      if (path !== '/v1/sync') return;
      for (const event of sent.events ?? []) submitted.set(event.eventId, { ...event, label });
      if (answer.status === 200) for (const item of got.results ?? []) { acks.set(item.eventId, item.outcome); outcomes.push(item.outcome); }
    }
    let configOverride = UNCONFIGURED_OVERRIDE;
    const deviceRoute = label => async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === GAME) {
        if (url.pathname === '/shared/learning-reporting/config.js') return route.fulfill({ status: 200, contentType: TYPES['.js'], body: configOverride });
        const file = await published(url.pathname);
        if (!file) { missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
        served[file.rel] ??= hash(file.body);
        return route.fulfill({ status: 200, contentType: TYPES[extname(file.rel)] ?? 'application/octet-stream', body: file.body });
      }
      if (url.origin === HOST && (url.pathname === '/v1/enroll' || url.pathname === '/v1/sync')) {
        const answer = await toWorker(route);
        deviceCalls.push({ device: label, path: url.pathname, method: req.method(), status: answer.status });
        if (req.method() === 'POST') observe(label, url.pathname, req, answer);
        return fulfill(route, answer, url.pathname);
      }
      if (Object.hasOwn(FONT_CSS, url.href) && req.method() === 'GET') {
        stubbed.push(`${label} ${FONT_CSS[url.href]}`);
        return route.fulfill({ status: 200, contentType: TYPES['.css'], body: '' });
      }
      if (url.origin === HOST) unexpected.push(`${label} ${req.method()} ${url.pathname}`); else external.push(url.host);
      return route.abort();
    };
    const watch = (page, label) => {
      pages[label] = page;
      page.on('pageerror', error => problems.push({ page: label, message: clean(error.message).slice(0, 300) }));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ page: label, text: clean(message.text()).slice(0, 300) }); });
      return page;
    };
    // Fails at the first unexpected page error, console error, route or denied request.
    const assertClean = where => {
      assert.deepEqual(problems, [], `no page errors (${where})`);
      assert.deepEqual(consoleErrors.filter(item => !item.text.startsWith('Failed to load resource')), [], `no unexpected console errors (${where})`);
      assert.deepEqual(unexpected, [], `no unexpected service routes (${where})`);
      assert.deepEqual(missing.filter(path => !/\/(favicon\.ico|apple-touch-icon[\w-]*\.png)$/.test(path)), [], `published files present (${where})`);
      assert.deepEqual(external.filter(host => !FONT_HOSTS.includes(host)), [], `only the Football page's declared font hosts were attempted, and denied (${where})`);
      assert.deepEqual(fulfillFailures, [], `every Worker response reached the browser (${where})`);
    };
    async function drain(page) {
      const deadline = Date.now() + 15000;
      for (;;) {
        await page.evaluate(() => LEARNING_SYNC.syncNow());
        const outbox = await readOutbox(page);
        if (outbox && outbox.envelope.events.length === 0) { assert.equal(outbox.valid, true, 'outbox record valid'); return; }
        assert.ok(Date.now() < deadline, `outbox drained (${outbox ? outbox.envelope.events.length : 'no outbox'} left)`);
        await page.waitForTimeout(250);
      }
    }
    async function enroll(page, code) {
      await page.goto(`${GAME}/shared/learning-reporting/`);
      await page.locator('#lr-setup').waitFor({ state: 'visible' });
      await page.locator('#lr-code').fill(code);
      await page.locator('#lr-connect').tap();
      await page.waitForFunction(() => document.getElementById('lr-form-status').textContent === 'Connected.');
      await page.locator('#lr-health').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#lr-players').textContent(), 'Player 1', 'one profile: one neutral slot');
    }
    // Ordinary "Send now" on the device page; nothing may be waiting, held or lost.
    async function sendNow(page) {
      await page.goto(`${GAME}/shared/learning-reporting/`);
      await page.locator('#lr-sync-actions').waitFor({ state: 'visible' });
      await page.locator('#lr-sync-now').tap();
      await page.waitForFunction(() => !document.getElementById('lr-sync-now').disabled && document.getElementById('lr-waiting').textContent === '0 practice events');
      const state = await page.evaluate(() => Object.fromEntries(['lr-waiting', 'lr-held', 'lr-lost', 'lr-last'].map(id => [id, document.getElementById(id).textContent])));
      assert.deepEqual([state['lr-held'], state['lr-lost']], ['None', 'None reported']);
      assert.notEqual(state['lr-last'], 'Not yet', 'last successful send shown');
      return { waiting: state['lr-waiting'], held: state['lr-held'], lost: state['lr-lost'], lastSend: 'shown' };
    }
    // Pinned Playwright's WebKit screenshot preparation briefly inserts an inline `body {}`
    // style without a nonce (playwright-core lib/server/screenshotter.js
    // inPagePrepareForScreenshots, with wkPage shouldToggleStyleSheetToSyncAnimations() true),
    // which the dashboard's CSP refuses. At most one console error with exactly that message,
    // on the captured owner page and logged within this capture call, is kept apart as a
    // capture artifact. Any other message, page, count or time stays an app console error.
    const shot = async (page, file) => {
      if (!output) return;
      const from = consoleErrors.length;
      await page.screenshot({ path: resolve(output, `${name}-${file}.png`), fullPage: true });
      const index = consoleErrors.findIndex((item, i) => i >= from && item.page === 'owner' && item.text === CAPTURE_CSP);
      if (page === pages.owner && index >= 0) captureArtifacts.push({ ...consoleErrors.splice(index, 1)[0], capture: file });
    };

    let browser, failureCaptureFrom = Infinity;
    try {
      if (process.env.LR_EXPECTED_BUNDLE_SHA256) assert.equal(bundleHash, process.env.LR_EXPECTED_BUNDLE_SHA256, 'bundle bound to the reviewed source build');
      receipt.config = { unconfiguredFixture: 'explicit empty config route, verified before enrollment', override: 'browser-context route of config.js only', serviceOrigin: HOST, gameOrigin: GAME };
      if (output) await mkdir(output, { recursive: true });
      await mf.ready;
      const db = (await mf.getBindings()).DB;
      const migration = (await readFile(resolve(root, 'migrations/0001_initial.sql'), 'utf8')).split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(sql => sql.trim()).filter(Boolean);
      await db.batch(migration.map(sql => db.prepare(sql)));
      const all = async sql => (await db.prepare(sql).all()).results;

      browser = await engine.launch();
      receipt.engineVersion = browser.version();
      const ownerContext = await browser.newContext(IPAD);
      const contexts = [await browser.newContext(IPAD), await browser.newContext(IPAD)];
      for (const context of [ownerContext, ...contexts]) context.setDefaultTimeout(10000);
      // Owner: every Worker request carries the synthetic Access JWT, as the Access edge would add.
      await ownerContext.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== HOST || url.pathname.startsWith('/v1/')) {
          if (url.origin === HOST) unexpected.push(`owner ${req.method()} ${url.pathname}`); else external.push(url.host);
          return route.abort();
        }
        const answer = await toWorker(route, { 'Cf-Access-Jwt-Assertion': jwt });
        ownerCalls.push({ path: url.pathname, method: req.method(), status: answer.status });
        return fulfill(route, answer, url.pathname);
      });
      await muteFootballForTests(contexts[0]);
      // Number facts plays no audio. Starting mode only, as the existing Facts specs set it.
      await contexts[1].addInitScript(() => { localStorage.setItem('place-value-practice:mode:v1', 'arithmetic'); localStorage.setItem('place-value-practice:arithmetic-mode:v1', 'facts'); });
      for (const [index, context] of contexts.entries()) {
        await context.addInitScript(CURRICULUM_DIALOG);
        await context.route('**/*', deviceRoute(DEVICES[index]));
      }

      // The off-state fixture is explicit; the shipped production origin is never used.
      stage('unconfigured-fixture');
      const pageA = watch(await contexts[0].newPage(), DEVICES[0]);
      const pageB = watch(await contexts[1].newPage(), DEVICES[1]);
      await pageA.goto(`${GAME}/shared/learning-reporting/`);
      await pageA.waitForFunction(() => document.getElementById('lr-summary').textContent === 'Reporting is not set up for this site.');
      assert.equal(await pageA.locator('#lr-connect').isDisabled(), true, 'unconfigured fixture cannot enroll');
      assert.equal(await pageA.locator('#lr-code').isDisabled(), true, 'unconfigured fixture does not accept a code');
      assert.deepEqual(await pageA.evaluate(() => ({ origin: LEARNING_SYNC.serviceOrigin(), started: LEARNING_SYNC.diagnostics().started })),
        { origin: null, started: false }, 'explicit empty fixture has no sync engine');
      assert.deepEqual(deviceCalls, [], 'unconfigured fixture sends no service request');
      assertClean('unconfigured fixture');
      configOverride = CONFIG_OVERRIDE;

      stage('owner-setup');
      const owner = watch(await ownerContext.newPage(), 'owner');
      await owner.goto(HOST);
      await owner.waitForFunction(() => document.getElementById('status').textContent === '' && document.getElementById('view-report').textContent.includes('No profiles yet'));
      await owner.locator('[data-view="setup"]').tap();
      await owner.getByLabel('New profile nickname', { exact: true }).fill(LABEL);
      await owner.getByRole('button', { name: 'Add profile', exact: true }).tap();
      await owner.getByRole('checkbox', { name: LABEL, exact: true }).waitFor();
      const codes = [];
      for (const device of DEVICES) {
        await owner.locator('[data-view="setup"]').tap();
        await owner.getByLabel('Device nickname', { exact: true }).fill(device);
        const box = owner.getByRole('checkbox', { name: LABEL, exact: true });
        await box.tap();
        assert.equal(await box.isChecked(), true, 'profile chosen for the code');
        await owner.getByRole('button', { name: 'Create one-time code', exact: true }).tap();
        await owner.locator('#view-setup p.code').waitFor();
        codes.push((await owner.locator('#view-setup p.code').textContent()).trim());
        seen.add(codes.at(-1));
      }
      assert.deepEqual(ownerCalls.filter(call => call.method === 'POST').map(call => [call.path, call.status]),
        [['/api/profiles', 200], ['/api/codes', 200], ['/api/codes', 200]], 'mutations passed the real Origin/CSRF checks');
      assertClean('owner setup');

      stage('enroll');
      await enroll(pageA, codes[0]);
      await enroll(pageB, codes[1]);
      codes.length = 0;
      assert.deepEqual(enrolled.map(item => item.label), DEVICES);
      assertClean('enroll');

      stage('football');
      await pageA.goto(`${GAME}/football/?boot=offense-call`);
      await pageA.locator('.curriculum-dialog').waitFor({ state: 'detached' });
      await expectFootballTestMuted(pageA);
      // The actual page finished loading and its scripts ran, including reporting with the routed config.
      assert.deepEqual(await pageA.evaluate(origin => ({
        ready: document.readyState, test: typeof window.__footballTest?.activeContracts, text: typeof window.render_game_to_text,
        outbox: typeof LEARNING_OUTBOX?.idle, origin: LEARNING_SYNC.serviceOrigin() === origin, started: LEARNING_SYNC.diagnostics().started,
      }), HOST), { ready: 'complete', test: 'function', text: 'function', outbox: 'function', origin: true, started: true }, 'Football loaded and reporting started');
      assert.deepEqual([...stubbed].sort(), [`${DEVICES[0]} football/index.html`, `${DEVICES[0]} shared/fonts.css`],
        'exactly the two declared font stylesheets were answered locally, once each, for the Football device');
      assert.equal(await pageA.locator('#player-picker').count(), 0, 'one profile: no who-is-playing choice');
      await pageA.evaluate(root => {
        const make = start => { let value = start >>> 0; return () => { value = (value + 0x6d2b79f5) >>> 0; let m = value; m = Math.imul(m ^ (m >>> 15), m | 1); m ^= m + Math.imul(m ^ (m >>> 7), m | 61); return ((m ^ (m >>> 14)) >>> 0) / 0x100000000; }; };
        window.__footballTest.setQuestionFault(null);
        window.__footballTest.setRngStreams({ football: make(root + 1), scheduler: make(root + 2), presentation: make(root + 3) });
      }, 0x4000c0de);
      await pageA.evaluate(seed => window.__footballTest.seedDriveState(seed), OFFENSE);
      await pageA.locator('#call-grid .call-btn').first().tap();
      await pageA.waitForFunction(() => ['question', 'feedback'].includes(JSON.parse(render_game_to_text()).mode));
      assert.equal(await pageA.evaluate(() => JSON.parse(render_game_to_text()).mode), 'question', 'the scripted call presents one question');
      const choice = await pageA.evaluate(() => { const q = window.__footballTest.activeContracts().questionInstance; return q.choices.findIndex(item => item.id === q.correctChoiceId); });
      assert.ok(choice >= 0, 'correct choice located');
      await pageA.locator(`#b${choice}`).tap();
      await pageA.waitForFunction(() => window.__footballTest.activeContracts().questionUi.outcomeCommitted === true);
      await pageA.evaluate(() => LEARNING_OUTBOX.idle());
      await drain(pageA);
      assertClean('football');

      stage('facts');
      await pageB.goto(`${GAME}/place-value-practice/`);
      await pageB.locator('.curriculum-dialog').waitFor({ state: 'detached' });
      await pageB.locator('#fact-practice').waitFor({ state: 'visible' });
      await pageB.locator('#fact-practice[aria-busy="false"]').waitFor();
      assert.equal(await pageB.locator('#facts-player').count(), 0, 'one profile: no who-is-practicing choice');
      const answer = await pageB.evaluate(() => PLACE_FACTS.byId[__factsTest.snapshot().attempt.factId].answer);
      const keypad = pageB.locator('.facts-keypad');
      await keypad.getByRole('button', { name: 'Clear', exact: true }).tap();
      for (const digit of String(answer)) await keypad.getByRole('button', { name: digit, exact: true }).tap();
      await pageB.locator('#facts-check').tap();
      await pageB.locator('#fact-practice[aria-busy="false"]').waitFor();
      assert.equal(await pageB.evaluate(() => __factsTest.snapshot().attempt.complete), true, 'the fact question completed');
      await pageB.evaluate(() => LEARNING_OUTBOX.idle());
      await drain(pageB);
      assertClean('facts');

      stage('send-now');
      receipt.devicePages = { [DEVICES[0]]: await sendNow(pageA), [DEVICES[1]]: await sendNow(pageB) };
      assertClean('send now');

      stage('d1');
      const ids = [...submitted.keys()].sort();
      const rows = await all('SELECT event_id AS eventId, device_id AS deviceId, profile_id AS profileId, game, seq FROM events ORDER BY device_id, seq');
      const profiles = await all('SELECT profile_id AS profileId FROM profiles');
      const devices = await all('SELECT device_id AS deviceId, name, last_sync_at AS lastSyncAt FROM devices ORDER BY enrolled_at');
      assert.ok(ids.length > 0 && ids.length <= MAX_EVENTS, `1..${MAX_EVENTS} events (${ids.length})`);
      assert.deepEqual(rows.map(row => row.eventId).sort(), ids, 'D1 holds exactly the browser-submitted event IDs');
      assert.deepEqual([...acks.keys()].sort(), ids, 'the Worker acknowledged exactly those IDs');
      assert.ok(outcomes.every(outcome => outcome === 'accepted'), 'every receipt outcome accepted');
      assert.equal(profiles.length, 1, 'one profile');
      const profileId = profiles[0].profileId;
      assert.deepEqual(devices.map(device => device.name), DEVICES, 'two devices');
      assert.ok(devices.every(device => device.lastSyncAt !== null), 'both devices synced');
      for (const [index, item] of enrolled.entries()) {
        assert.equal(item.deviceId, devices[index].deviceId);
        assert.deepEqual(item.profileIds, [profileId]);
        const own = rows.filter(row => row.deviceId === item.deviceId);
        assert.deepEqual(own.map(row => row.seq), own.map((row, i) => i + 1), `${item.label}: seq 1..n with no gap`);
        assert.ok(own.every(row => row.profileId === profileId), 'one profile on every event');
        assert.deepEqual([...new Set(own.map(row => row.game))], [index === 0 ? 'football' : 'facts'], `${item.label} game`);
        assert.ok(ids.every(id => submitted.get(id).label !== item.label || submitted.get(id).deviceId === item.deviceId), 'submitted from its own device');
      }
      assert.equal((await all('SELECT count(*) AS n FROM anomalies'))[0].n, 0, 'no anomalies');
      receipt.events = {
        total: ids.length, ackOutcomes: Object.fromEntries([...new Set(outcomes)].map(outcome => [outcome, outcomes.filter(item => item === outcome).length])),
        perDevice: Object.fromEntries(enrolled.map(item => [item.label, { deviceId: item.deviceId, events: ids.filter(id => submitted.get(id).deviceId === item.deviceId).map(id => ({ eventId: id, seq: submitted.get(id).seq, ...classes(submitted.get(id)) })) }])),
      };
      receipt.d1 = { events: rows.length, profiles: profiles.length, devices: devices.length, games: [...new Set(rows.map(row => row.game))].sort(), anomalies: 0 };

      stage('report');
      const football = ids.map(id => submitted.get(id)).filter(event => event.game === 'football');
      const footballHead = football[0], footballFirst = football.find(event => event.kind === 'attempt' && event.number === 1);
      const footballAxis = footballHead.grading === 'noStakes' ? 'noStakes' : footballHead.evidenceClass === 'literacy' ? 'literacy' : 'independent';
      const eligible = ids.map(id => submitted.get(id)).filter(event => event.game === 'facts' && event.kind === 'resolution' && event.eligibleCheck);
      await owner.locator('[data-view="report"]').tap();
      const reportReady = () => owner.waitForFunction(() => document.getElementById('status').textContent === '' && document.getElementById('view-report').textContent.includes('Suggested next practice'));
      await reportReady();
      const report = await owner.locator('#view-report').textContent();
      assert.ok(report.includes(`Devices: ${DEVICES.join(', ')}.`), 'coverage names both devices');
      assert.ok(!report.includes('Last sync: Not yet'), 'coverage shows the last sync');
      assert.ok(report.includes(EXCLUSIONS), 'coverage exclusions shown');
      const panel = title => owner.locator('#view-report section.panel').filter({ has: owner.getByRole('heading', { name: title, exact: true, level: 2 }) });
      const factsText = await panel('Number facts').textContent();
      const factRows = panel('Number facts').locator('ul.list > li:has(> details) summary');
      assert.equal(await factRows.count(), 1, 'one reported fact');
      const factSummary = await factRows.first().textContent();
      assert.ok(factsText.includes(`1 completed check, ${plural(eligible.length, 'reported eligible check')}.`), 'Number facts totals');
      assert.ok(factSummary.includes('1 completed check') && factSummary.includes(SPARSE), 'fact row counted and labeled sparse');
      if (eligible.length) assert.ok(factSummary.includes(eligible[0].timingMs === null ? 'latest eligible: not timed' : ' s entry'), 'timing class rendered');
      assert.ok(factsText.includes(TIMING_CAVEAT), 'timing caveat');
      const footballText = await panel('Football').textContent();
      const footballRows = panel('Football').locator('ul.list > li:has(> details) summary');
      assert.equal(await footballRows.count(), 1, 'one reported Football concept');
      const footballSummary = await footballRows.first().textContent();
      assert.ok(footballSummary.includes(SPARSE), 'Football row labeled sparse');
      if (footballAxis === 'independent') {
        const helped = footballFirst?.support === 'initial' ? 0 : 1;
        assert.ok(footballSummary.includes(`1 completed work-it-out question: ${1 - helped} first try without help, ${helped} needed help or a second try`), 'Football independent result rendered');
      } else {
        assert.ok(footballSummary.includes('No work-it-out questions reported'), 'reading/no-stakes question never counted as work-it-out');
      }
      assert.ok(footballText.includes('Football reports no timing.') && !/s entry|not timed/.test(footballText), 'Football shows no timing');
      const geometry = async () => owner.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, overflow: document.documentElement.scrollWidth - innerWidth }));
      const ipadReport = await geometry();
      assert.ok(ipadReport.overflow <= 0, 'no horizontal overflow (iPad)');
      await shot(owner, 'ipad-report');

      await owner.locator('[data-view="devices"]').tap();
      await owner.waitForFunction(names => document.getElementById('status').textContent === '' && names.every(item => document.getElementById('view-devices').textContent.includes(item)), DEVICES);
      const deviceHealth = {};
      for (const [index, device] of DEVICES.entries()) {
        const facts = await owner.locator('#view-devices section.panel').filter({ has: owner.getByRole('heading', { name: device, exact: true, level: 2 }) })
          .evaluate(section => Object.fromEntries([...section.querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent])));
        const n = rows.filter(row => row.deviceId === enrolled[index].deviceId).length;
        assert.equal(facts.Players, `Player 1: ${LABEL}`);
        assert.notEqual(facts['Last successful sync'], 'Not yet', `${device}: last sync shown`);
        assert.equal(facts['Events received'], `${n} (${n} still kept)`);
        assert.equal(facts['Removed on the device to make room (latest report)'], '0', `${device}: droppedLocal`);
        assert.equal(facts['Not saved on the device (latest report)'], '0', `${device}: writeFailures`);
        deviceHealth[device] = { lastSync: 'shown', received: n, droppedLocal: 0, writeFailures: 0 };
      }
      assert.ok(!(await owner.locator('#view-devices').textContent()).includes('not received ('), 'no unreceived-seq gaps');
      await shot(owner, 'ipad-devices');

      await owner.setViewportSize(PHONE);
      await owner.locator('[data-view="report"]').tap();
      await reportReady();
      const phoneReport = await geometry();
      assert.ok(phoneReport.overflow <= 0, 'no horizontal overflow (phone)');
      await shot(owner, 'phone-report');
      receipt.report = {
        devicesInCoverage: DEVICES.length, lastSync: 'shown', exclusions: true, timingCaveat: true, footballNoTiming: true,
        factRows: 1, eligibleChecks: eligible.length, factTiming: eligible.length ? (eligible[0].timingMs === null ? 'not timed' : 'timed') : 'none eligible', factSparse: true,
        footballRows: 1, footballAxis, footballSparse: true, deviceHealth, geometry: { ipad: ipadReport, phone: phoneReport },
      };
      assertClean('report');

      stage('cleanup');
      await owner.setViewportSize(IPAD.viewport);
      await owner.locator('[data-view="setup"]').tap();
      await owner.getByRole('button', { name: 'Delete everything…', exact: true }).tap();
      const confirmBox = owner.locator('#view-setup .confirm');
      await confirmBox.waitFor();
      const consequence = await confirmBox.textContent();
      assert.ok(consequence.includes(`Profiles affected: ${LABEL}`) && consequence.includes(`Devices affected: ${DEVICES.join(', ')}`), 'confirmation lists the affected scope');
      await confirmBox.getByRole('button', { name: 'Confirm', exact: true }).tap();
      await owner.getByRole('checkbox', { name: LABEL, exact: true }).waitFor({ state: 'detached' });
      assert.deepEqual(ownerCalls.filter(call => call.method === 'POST').slice(-2).map(call => [call.path, call.status]), [['/api/preview', 200], ['/api/confirm', 200]]);
      for (const table of ['events', 'devices', 'device_profiles', 'profiles', 'enrollment_codes']) assert.equal((await all(`SELECT count(*) AS n FROM ${table}`))[0].n, 0, `${table} emptied`);
      receipt.cleanup = 'Delete everything through the protected dashboard confirmation; local D1 then disposed';
      assertClean('cleanup');
      stage('passed');
    } catch (error) {
      receipt.failure = { stage: receipt.stage, message: clean(error.message).slice(0, 2000) };
      // Console messages logged while failure evidence is captured are kept apart from the
      // app's own window, so capture artifacts are not attributed to the app.
      failureCaptureFrom = consoleErrors.length;
      // Failure evidence before disposal. One-time codes are blanked first; game pages are not
      // captured (their questions are not evidence), only the device page's status lines.
      if (output && pages.owner) {
        await pages.owner.evaluate(() => { for (const node of document.querySelectorAll('p.code')) node.textContent = '[redacted]'; }).catch(() => {});
        await pages.owner.screenshot({ path: resolve(output, `${name}-failed-owner.png`), fullPage: true }).catch(() => {});
      }
      receipt.failure.devicePages = {};
      for (const device of DEVICES) {
        const page = pages[device];
        if (!page) continue;
        receipt.failure.devicePages[device] = await page.evaluate(() => ({ path: location.pathname,
          status: ['lr-summary', 'lr-form-status'].map(id => document.getElementById(id)?.textContent ?? null) })).catch(() => null);
      }
      // Only the sanitized diagnostic leaves the test: no original error, cause, actual/expected
      // values or call log, which can echo a filled code or a request.
      throw new Error(`combined trial failed at ${receipt.failure.stage}: ${receipt.failure.message}`);
    } finally {
      Object.assign(receipt, { ownerCalls, deviceCalls, external: [...new Set(external)], stubbed, missing, unexpected, problems, fulfillFailures, served,
        consoleErrors: consoleErrors.slice(0, failureCaptureFrom), consoleErrorsDuringFailureCapture: consoleErrors.slice(failureCaptureFrom),
        screenshotCaptureArtifacts: captureArtifacts });
      if (output) await writeFile(resolve(output, `${name}-receipt.json`), clean(JSON.stringify(receipt, null, 2)));
      await browser?.close();
      await mf.dispose();
    }
  });
}
