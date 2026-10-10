// Issue #160 diagnostic fixture. It extends the canonical curriculum fixture, so
// the test-scoped Football mute, its verification and the dialog handling run
// unchanged. It acts only when DIAG160_MODE=instrumented and the test is the
// target case; every other test receives the canonical page untouched.
// For the target it adds: the hash-checked football.js instrumentation route, a
// bounded in-page event buffer with overlay visibility geometry, Node-side page
// error/console capture, Node clock brackets, and the post-failure grace poll.
// Results go to <test output>/diag160.json; nothing here changes an assertion,
// a timeout or a test outcome.
import fs from 'node:fs';
import { test as canonical, expect } from '../../tests/curriculum-fixture.mjs';
import { instrument, sha256 } from './instrument.mjs';
import { TARGET_TITLE } from './gen-spec.mjs';

export { expect };

export const GRACE_MS = 3000;
const POLL_MS = 100;
const COLLECT_MS = 10000;
const NODE_CAP = 200;
const MODE = process.env.DIAG160_MODE ?? null;
const CONTROL = process.env.DIAG160_CONTROL ?? null;

const diags = new WeakMap();
const stamp = () => ({ w: Date.now(), m: performance.now() });
const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

// Runs in the page before any document script. Bounded, memory-only; the
// callbacks do no disk or network work.
function pageObserver() {
  const CAP = 4000;
  const events = [];
  const armed = new Set();
  const refs = new Map();
  let seq = 0;
  let dropped = 0;
  let filtered = 0;
  const now = () => ({ w: Date.now(), m: performance.now() });
  const push = (event) => {
    if (event.k === 'arm') armed.add(event.id);
    else if (event.k === 'clear' && !armed.has(event.id)) { filtered++; return; }
    if (events.length >= CAP) { dropped++; return; }
    const e = { ...event, seq: seq++ };
    if ('src' in e) {
      const src = e.src;
      if (src && typeof src === 'object' && !refs.has(src)) refs.set(src, refs.size + 1);
      e.srcRef = src && typeof src === 'object' ? refs.get(src) : null;
      e.src = src && typeof src === 'object'
        ? { gameId: src.gameId ?? null, possessionId: src.possessionId ?? null, quarter: src.quarter ?? null }
        : null;
    }
    events.push(Object.freeze(e));
  };
  const fail = (where, error) => push({ k: 'observer-error', where, message: String(error), ...now() });
  Object.defineProperty(window, '__diag160', {
    value: Object.freeze({
      push,
      read: from => ({ events: events.slice(from), stats: { dropped, filtered, seq, cap: CAP }, ...now() }),
    }),
  });
  window.addEventListener('football:diagnostic', (event) => {
    try { push({ k: 'diagnostic', code: event.detail?.code ?? null, reason: event.detail?.reason ?? null, ...now() }); }
    catch (error) { fail('diagnostic', error); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    try {
      const overlays = [...document.querySelectorAll('.overlay[data-overlay]')];
      const shown = new Map(overlays.map(overlay => [overlay, overlay.classList.contains('show')]));
      const observer = new MutationObserver((records) => {
        try {
          for (const target of new Set(records.map(record => record.target))) {
            const show = target.classList.contains('show');
            if (show === shown.get(target)) continue;
            shown.set(target, show);
            if (!show) { push({ k: 'hide', id: target.id, ...now() }); continue; }
            const rect = target.getBoundingClientRect();
            const style = getComputedStyle(target);
            push({
              k: 'show',
              id: target.id,
              vis: typeof target.checkVisibility === 'function' ? target.checkVisibility() : null,
              rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
              ...now(),
            });
          }
        } catch (error) { fail('overlay', error); }
      });
      overlays.forEach(overlay => observer.observe(overlay, { attributes: true, attributeFilter: ['class'] }));
      push({ k: 'observer', overlays: overlays.length, ...now() });
    } catch (error) { fail('install', error); }
  }, { once: true });
}

// One buffer read with a Node clock probe; never more than one read in flight.
// A read still queued behind a blocked page is awaited, never duplicated.
function reader(page, d) {
  let inflight = null;
  const wait = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)]);
  return async (from, timeoutMs) => {
    const until = performance.now() + timeoutMs;
    if (inflight && inflight.from !== from) {
      if (!(await wait(inflight.promise, timeoutMs))) return { pending: true };
      inflight = null;
    }
    if (!inflight) {
      const pre = Date.now();
      const preM = performance.now();
      inflight = {
        from,
        promise: page.evaluate(start => window.__diag160?.read(start) ?? null, from).then(
          (value) => {
            const post = Date.now();
            if (value) d.probes.push({ pre, preM, page: value.w, pageM: value.m, post });
            return { value };
          },
          error => ({ error: String(error?.message ?? error).slice(0, 500) }),
        ),
      };
    }
    const result = await wait(inflight.promise, until - performance.now());
    if (result) inflight = null;
    return result ?? { pending: true };
  };
}

function capped(d, list, record) {
  if (list.length < NODE_CAP) list.push(record);
  else d.nodeCapped++;
}

async function install(page, testInfo) {
  const manifest = JSON.parse(fs.readFileSync(process.env.DIAG160_SOURCE_MANIFEST, 'utf8'));
  const expectedSha256 = manifest.files['football/football.js'].sha256;
  const d = {
    schema: 1,
    mode: MODE,
    control: CONTROL,
    title: testInfo.title,
    project: testInfo.project.name,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    graceMs: GRACE_MS,
    pollMs: POLL_MS,
    expectedSha256,
    routes: [],
    chains: [],
    probes: [],
    pageErrors: [],
    console: [],
    nodeCapped: 0,
    page: null,
  };
  d.read = reader(page, d);
  page.on('pageerror', error => capped(d, d.pageErrors, { ...stamp(), message: String(error.message).slice(0, 1000), stack: String(error.stack ?? '').slice(0, 4000) }));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) capped(d, d.console, { ...stamp(), type: message.type(), text: message.text().slice(0, 500) });
  });
  await page.addInitScript(pageObserver);
  await page.route(url => url.pathname === '/football/football.js', async (route) => {
    const t0 = performance.now();
    const record = { ...stamp(), url: route.request().url() };
    try {
      const response = await route.fetch();
      const body = await response.body();
      record.status = response.status();
      record.servedSha256 = sha256(body);
      if (record.status !== 200 || record.servedSha256 !== expectedSha256) {
        record.result = 'hash-mismatch';
        await route.fulfill({ response });
      } else {
        const out = instrument(body.toString('utf8'));
        Object.assign(record, { result: 'instrumented', counts: out.counts, sites: out.sites, insertedLines: out.insertedLines, instrumentedSha256: out.instrumentedSha256 });
        await route.fulfill({ response, body: out.code });
      }
    } catch (error) {
      record.result = 'route-error';
      record.error = String(error?.message ?? error).slice(0, 500);
      await route.continue().catch(() => {});
    }
    record.handlerMs = performance.now() - t0;
    d.routes.push(record);
  });
  diags.set(page, d);
  return d;
}

async function finish(page, d, testInfo) {
  const started = performance.now();
  const result = await d.read(0, COLLECT_MS);
  d.page = result.value ?? null;
  d.collection = result.value ? 'ok' : result.pending ? 'timeout' : result.error ?? 'buffer-missing';
  d.collectionMs = performance.now() - started;
  delete d.read;
  fs.writeFileSync(testInfo.outputPath('diag160.json'), JSON.stringify(d, null, 1) + '\n', { flag: 'wx' });
}

const need = (page) => {
  const d = diags.get(page);
  if (!d) throw new Error('diag160 helpers used outside an instrumented target test');
  return d;
};

export const diag160 = {
  chain(page, overlay) {
    const d = need(page);
    d.chains.push({ overlay });
    return d.chains.length - 1;
  },
  mark(page, index, name) {
    need(page).chains[index][name] = stamp();
  },
  // Wraps the unchanged assertion. On failure: poll the page buffer until the
  // chain's callback or cancel record appears or GRACE_MS (Node monotonic)
  // passes, then rethrow the original error. The outcome never changes.
  async settle(page, index, assertion) {
    const d = need(page);
    const c = d.chains[index];
    c.expectStart = stamp();
    try {
      await assertion();
      c.expectEnd = stamp();
      c.assertion = 'passed';
    } catch (error) {
      c.expectEnd = stamp();
      c.assertion = 'failed';
      c.error = String(error?.message ?? error).slice(0, 4000);
      c.grace = await grace(d, c);
      throw error;
    }
  },
  // SYNTHETIC sensitivity interventions, halftime chain only, labeled in the
  // record. Ordinary instrumented runs never generate this call.
  async intervene(page, index) {
    const d = need(page);
    const c = d.chains[index];
    if (!CONTROL || c.overlay !== '#ov-halftime') return;
    c.control = { name: CONTROL, synthetic: true, ...stamp() };
    c.control.result = await page.evaluate((name) => {
      const buffer = window.__diag160;
      const now = () => ({ w: Date.now(), m: performance.now() });
      const arm = buffer.read(0).events.filter(event => event.k === 'arm').at(-1);
      if (!arm) return { applied: false, reason: 'no-arm' };
      if (name === 'block') {
        const start = arm.m + 1300;
        const end = arm.m + 4400;
        const lead = start - performance.now();
        if (lead <= 0) return { applied: false, reason: 'late', lead };
        setTimeout(() => {
          buffer.push({ k: 'control', name, phase: 'block-start', ...now() });
          while (performance.now() < end) { /* deterministic main-thread block */ }
          buffer.push({ k: 'control', name, phase: 'block-end', ...now() });
        }, lead);
        return { applied: true, start, end, lead };
      }
      if (name === 'stale') {
        // Lexical game state; the armed timer is left in place.
        state.possessionId = 'diag160-synthetic-stale';
        buffer.push({ k: 'control', name, ...now() });
        return { applied: true };
      }
      if (name === 'cancel') {
        const id = advTimer;
        clearTimeout(id);
        buffer.push({ k: 'clear', site: 'control-evaluate', id, ...now() });
        return { applied: true, id };
      }
      return { applied: false, reason: 'unknown-control' };
    }, CONTROL);
    c.control.done = stamp();
  },
};

async function grace(d, c) {
  const started = stamp();
  const deadline = started.m + GRACE_MS;
  const seen = [];
  const record = { capMs: GRACE_MS, started, polls: 0, found: null, truncated: null };
  while (performance.now() < deadline) {
    const result = await d.read(seen.length, deadline - performance.now());
    if (result.pending) { record.truncated = 'read-pending-at-cap'; break; }
    if (result.error) { record.truncated = `read-error:${result.error}`; break; }
    record.polls++;
    seen.push(...(result.value?.events ?? []));
    // Loose window only to stop polling; classify.mjs applies the strict link.
    const arm = seen.filter(e => e.k === 'arm' && e.w >= c.answerStart.w - 5 && e.w <= c.answerEnd.w + 5).at(-1);
    if (arm) {
      if (seen.some(e => e.k === 'route' && e.srcRef === arm.srcRef)) record.found = 'route';
      else if (seen.some(e => e.k === 'clear' && e.id === arm.id && e.seq > arm.seq)) record.found = 'clear';
    }
    if (record.found) break;
    await sleep(Math.min(POLL_MS, deadline - performance.now()));
  }
  record.elapsedMs = performance.now() - started.m;
  return record;
}

export const test = canonical.extend({
  page: async ({ page }, use, testInfo) => {
    if (MODE !== 'instrumented' || testInfo.title !== TARGET_TITLE) {
      await use(page);
      return;
    }
    const d = await install(page, testInfo);
    await use(page);
    await finish(page, d, testInfo);
  },
});
