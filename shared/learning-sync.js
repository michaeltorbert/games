// Learning-report sync (#200): device enrollment, the who-is-playing choice and upload of
// the #199 outbox to the private learning-reporting service. Plain global LEARNING_SYNC.
//
// Off by default. With no configured service origin (shared/learning-reporting/config.js)
// nothing here reads storage, opens IndexedDB, sets a timer or sends a request. With an
// origin but no enrollment hint it reads that one localStorage key once and stops.
// Nothing here is ever awaited by play: sync runs on timers and its own promises, and a
// failure only reschedules it. See shared/LEARNING_EVENTS.md (#200 section).
(() => {
  'use strict';
  const O = globalThis.LEARNING_OUTBOX;
  const CONFIG = globalThis.LEARNING_REPORTING_CONFIG;
  // Per-tab who-is-playing choice: {schemaVersion, generation, profileId}. Never authority.
  const PLAYER_KEY = 'learningReporting:player:v1';
  const SYNC_LOCK = 'learningReporting:sync';
  const PERIOD_MS = 60000, FIRST_MS = 2000, NUDGE_MS = 3000, TIMEOUT_MS = 20000;
  const MIN_BACKOFF_MS = 30000, MAX_BACKOFF_MS = 900000, MAX_BATCHES = 10;
  const MAX_BATCH_EVENTS = 20, MAX_BODY_BYTES = 65536;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TOKEN = /^lr1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/;
  const CODE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  const OUTCOMES = ['accepted', 'deleted', 'seq-conflict', 'conflict', 'invalid', 'unassigned'];
  const SUPPRESS = { 'seq-conflict': 'conflict', conflict: 'conflict', invalid: 'invalid', unassigned: 'unassigned' };

  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const uuid = value => typeof value === 'string' && UUID.test(value);

  // The configured service origin, or null (the default: reporting disabled for this build).
  function serviceOrigin() {
    const value = CONFIG && typeof CONFIG.serviceUrl === 'string' ? CONFIG.serviceUrl : '';
    return value && O && O.serviceOriginValid(value) ? value : null;
  }

  // ---- Who is playing (several profiles on one device) ----

  // The enrollment hint's profiles in their enrolled order, as neutral slots. Labels never
  // reach the game host. Null when not enrolled or when the hint is unreadable.
  function players() {
    if (!O || !serviceOrigin()) return null;
    let hint;
    try { hint = JSON.parse(localStorage.getItem(O.ENROLLMENT_KEY)); } catch (error) { return null; }
    if (!isRecord(hint) || hint.schemaVersion !== 1 || !uuid(hint.generation) || !Array.isArray(hint.profileIds)
      || !hint.profileIds.length || hint.profileIds.length > 8 || !hint.profileIds.every(uuid)) return null;
    return { generation: hint.generation, list: hint.profileIds.map((profileId, index) => ({ profileId, slot: index + 1, label: `Player ${index + 1}` })) };
  }
  // This tab's chosen profile for new questions, or null (then the hint decides: its single
  // profile, or nothing recorded until someone is chosen).
  function player() {
    const roster = players();
    if (!roster || roster.list.length < 2) return null;
    try {
      const value = JSON.parse(sessionStorage.getItem(PLAYER_KEY));
      return exactKeys(value, ['schemaVersion', 'generation', 'profileId']) && value.schemaVersion === 1
        && value.generation === roster.generation && roster.list.some(item => item.profileId === value.profileId) ? value.profileId : null;
    } catch (error) {
      return null;
    }
  }
  function choosePlayer(profileId) {
    const roster = players();
    if (!roster || !roster.list.some(item => item.profileId === profileId)) return false;
    try {
      sessionStorage.setItem(PLAYER_KEY, JSON.stringify({ schemaVersion: 1, generation: roster.generation, profileId }));
      return true;
    } catch (error) {
      return false;
    }
  }
  function forgetPlayer() {
    try { sessionStorage.removeItem(PLAYER_KEY); } catch (error) { /* nothing to forget */ }
  }

  // A who-is-playing radio group for a game page. Returns null unless several profiles are
  // enrolled (one profile needs no choice). `status(profileId)` returns the line shown under
  // the choices, so a game can say a change waits for the next question.
  function buildPlayerPicker({ id, legend = 'Who’s playing?', fieldsetClass, optionsClass, optionClass, statusClass, status, onChoose }) {
    const roster = players();
    if (!roster || roster.list.length < 2) return null;
    const fieldset = document.createElement('fieldset');
    fieldset.id = id;
    fieldset.className = fieldsetClass;
    const title = document.createElement('legend');
    title.textContent = legend;
    const options = document.createElement('div');
    options.className = optionsClass;
    const line = document.createElement('p');
    line.className = statusClass;
    line.id = `${id}-status`;
    line.setAttribute('role', 'status');
    line.setAttribute('aria-live', 'polite');
    for (const item of roster.list) {
      const label = document.createElement('label');
      label.className = optionClass;
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${id}-choice`;
      input.value = item.profileId;
      input.addEventListener('change', () => {
        if (!input.checked || !choosePlayer(item.profileId)) return;
        refresh();
        if (onChoose) onChoose(item.profileId);
      });
      const text = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = item.label;
      text.append(strong);
      label.append(input, text);
      options.append(label);
    }
    fieldset.append(title, options, line);
    function refresh() {
      const chosen = player();
      for (const input of options.querySelectorAll('input')) input.checked = input.value === chosen;
      line.textContent = status ? status(chosen) : chosen ? '' : 'Choose who is playing so practice is reported for the right player.';
    }
    refresh();
    return { element: fieldset, refresh };
  }

  // ---- Enrollment (the public enrollment page) ----

  const openDatabase = () => new Promise(resolve => {
    let request;
    try { request = indexedDB.open(O.DB_NAME, O.DB_VERSION); } catch (error) { resolve({ db: null, reason: 'open-failed' }); return; }
    request.onupgradeneeded = event => {
      // Creates the version-1 schema only for a brand-new database; anything else aborts.
      if (event.oldVersion === 0) request.result.createObjectStore(O.STORE);
      else request.transaction.abort();
    };
    request.onsuccess = () => resolve({ db: request.result });
    request.onerror = event => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      resolve({ db: null, reason: request.error?.name === 'VersionError' ? 'future' : 'open-failed' });
    };
    request.onblocked = () => {};
  });
  const RECORD_KEYS = () => [O.CONSENT_RECORD, O.OUTBOX_RECORD, O.CREDENTIAL_RECORD, O.SYNC_RECORD, O.BINDING_RECORD];

  // Installs consent, credential and sync state in one IndexedDB transaction, then writes
  // the admission hint last. Refuses if anything owned already exists: Stop comes first.
  async function install({ origin, token, deviceId, profileIds }) {
    if (!O || O.deletionPending()) return { ok: false, reason: 'stopping' };
    if (typeof indexedDB === 'undefined' || !indexedDB || typeof crypto?.randomUUID !== 'function') return { ok: false, reason: 'unavailable' };
    const generation = crypto.randomUUID();
    const consent = { schemaVersion: 1, generation, deviceId, profileIds: [...profileIds] };
    const credential = { schemaVersion: 1, generation, deviceId, serviceOrigin: origin, token };
    const sync = { schemaVersion: 1, generation, suppressed: [], lastSuccessAt: null, notice: null };
    if (!O.validateCredential(credential) || !O.validateSyncRecord(sync)) return { ok: false, reason: 'invalid' };
    const { db, reason } = await openDatabase();
    if (!db) return { ok: false, reason };
    if (db.version !== O.DB_VERSION || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(O.STORE)) {
      db.close();
      return { ok: false, reason: 'future' };
    }
    const outcome = await new Promise(resolve => {
      let tx, existing = false;
      try { tx = db.transaction(O.STORE, 'readwrite'); } catch (error) { resolve('transaction-failed'); return; }
      const store = tx.objectStore(O.STORE);
      const reads = RECORD_KEYS().map(key => store.get(key));
      reads[reads.length - 1].onsuccess = () => {
        existing = reads.some(read => read.result !== undefined);
        if (existing) { try { tx.abort(); } catch (error) { /* finishing */ } return; }
        store.put(JSON.stringify(consent), O.CONSENT_RECORD);
        store.put(JSON.stringify(credential), O.CREDENTIAL_RECORD);
        store.put(JSON.stringify(sync), O.SYNC_RECORD);
      };
      tx.oncomplete = () => resolve('installed');
      tx.onabort = () => resolve(existing ? 'already-enrolled' : 'write-failed');
    });
    db.close();
    if (outcome !== 'installed') return { ok: false, reason: outcome };
    return writeHint(consent) ? { ok: true, generation } : { ok: false, reason: 'hint-failed', installed: true };
  }
  function writeHint(consent) {
    try {
      localStorage.setItem(O.ENROLLMENT_KEY, JSON.stringify({ schemaVersion: 1, generation: consent.generation, deviceId: consent.deviceId,
        profileIds: consent.profileIds, activeProfileId: null }));
      return true;
    } catch (error) {
      return false;
    }
  }
  // ---- A partial enrollment: records installed, final admission hint missing ----
  // Used only by the enrollment page, and only when no hint exists. Read-only: it never
  // creates a database (a missing one is not opened where it can be listed, and any upgrade
  // of the fallback open is aborted) and never changes a record.
  async function readOwnedRecords() {
    if (typeof indexedDB.databases === 'function') {
      let entry;
      try { entry = (await indexedDB.databases()).find(item => item && item.name === O.DB_NAME); } catch (error) { entry = undefined; }
      if (!entry || entry.version === 0) return null;
      if (entry.version !== O.DB_VERSION) return { layout: 'future' };
    }
    const db = await new Promise(resolve => {
      let request;
      try { request = indexedDB.open(O.DB_NAME); } catch (error) { resolve(null); return; }
      request.onupgradeneeded = () => { try { request.transaction.abort(); } catch (error) { /* the open then fails */ } };
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => { if (event && typeof event.preventDefault === 'function') event.preventDefault(); resolve(null); };
    });
    if (!db) return null;
    if (db.version !== O.DB_VERSION || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(O.STORE)) { db.close(); return { layout: 'future' }; }
    const values = await new Promise(resolve => {
      let tx;
      try { tx = db.transaction(O.STORE, 'readonly'); } catch (error) { resolve(null); return; }
      const store = tx.objectStore(O.STORE), reads = RECORD_KEYS().map(key => [key, store.get(key)]);
      tx.oncomplete = () => resolve(Object.fromEntries(reads.map(([key, read]) => [key, read.result])));
      tx.onabort = () => resolve(null);
    });
    db.close();
    return values ? { layout: 'ok', values } : null;
  }
  const parseString = raw => { if (typeof raw !== 'string') return undefined; try { return JSON.parse(raw); } catch (error) { return undefined; } };

  // 'none' (no owned records), 'partial' (exactly one verified #200 enrollment whose hint is
  // missing), or 'unknown' (anything else: future, malformed, mismatched or orphan records,
  // which are left untouched and never admitted).
  async function partialEnrollment() {
    if (!O || typeof indexedDB === 'undefined' || !indexedDB) return { state: 'unavailable' };
    try { if (localStorage.getItem(O.ENROLLMENT_KEY) !== null) return { state: 'hinted' }; } catch (error) { return { state: 'unavailable' }; }
    const records = await readOwnedRecords();
    if (!records) return { state: 'none' };
    if (records.layout !== 'ok') return { state: 'unknown' };
    const raw = records.values;
    if (Object.values(raw).every(value => value === undefined)) return { state: 'none' };
    const consent = parseString(raw[O.CONSENT_RECORD]), credential = parseString(raw[O.CREDENTIAL_RECORD]);
    const consentValid = exactKeys(consent, ['schemaVersion', 'generation', 'deviceId', 'profileIds']) && consent.schemaVersion === 1
      && uuid(consent.generation) && uuid(consent.deviceId) && Array.isArray(consent.profileIds) && consent.profileIds.length >= 1
      && consent.profileIds.length <= 8 && consent.profileIds.every(uuid) && new Set(consent.profileIds).size === consent.profileIds.length;
    if (!consentValid || !O.validateCredential(credential) || credential.generation !== consent.generation || credential.deviceId !== consent.deviceId) {
      return { state: 'unknown' };
    }
    const same = value => value.generation === consent.generation;
    const sync = raw[O.SYNC_RECORD], outbox = raw[O.OUTBOX_RECORD], binding = raw[O.BINDING_RECORD];
    if (sync !== undefined && !(O.validateSyncRecord(parseString(sync)) && same(parseString(sync)))) return { state: 'unknown' };
    if (binding !== undefined && !(O.validateBinding(parseString(binding)) && same(parseString(binding)))) return { state: 'unknown' };
    if (outbox !== undefined) {
      const envelope = parseString(outbox);
      if (!(O.validateEnvelope(envelope) && same(envelope) && envelope.status.deviceId === consent.deviceId)) return { state: 'unknown' };
    }
    return {
      state: 'partial', consent, profiles: consent.profileIds.length,
      expected: { generation: consent.generation, deviceId: consent.deviceId, token: credential.token },
      originMatches: credential.serviceOrigin === serviceOrigin(),
    };
  }

  // Finishes a verified partial enrollment by writing its admission hint (re-verified now).
  async function finishEnrollment() {
    if (O && O.deletionPending()) return { ok: false, reason: 'stopping' };
    const found = await partialEnrollment();
    if (found.state !== 'partial') return { ok: false, reason: found.state };
    if (!writeHint(found.consent)) return { ok: false, reason: 'hint-failed' };
    started = false;
    start();
    return { ok: true };
  }

  // Stops a verified partial enrollment without a hint: the existing guarded Stop deletes the
  // owned records only if the consent and credential are still exactly this enrollment.
  async function stopPartialEnrollment() {
    const found = await partialEnrollment();
    if (found.state !== 'partial') return { ok: false, reason: found.state };
    const result = await O.stopGeneration(found.expected);
    if (result.ok) forgetPlayer();
    return result;
  }

  const normalizeCode = value => String(value || '').toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');

  // Exchanges a one-time enrollment code for this device's credential, then installs it.
  async function enroll(rawCode) {
    const origin = serviceOrigin();
    if (!origin) return { ok: false, reason: 'not-configured' };
    const code = normalizeCode(rawCode);
    if (!CODE.test(code)) return { ok: false, reason: 'code-format' };
    if (O.deletionPending()) return { ok: false, reason: 'stopping' };
    try {
      if (localStorage.getItem(O.ENROLLMENT_KEY) !== null) return { ok: false, reason: 'already-enrolled' };
      if (localStorage.getItem(O.LEGACY_OUTBOX_KEY) !== null) return { ok: false, reason: 'legacy' };
    } catch (error) {
      return { ok: false, reason: 'unavailable' };
    }
    // Owned records already present (a partial install, or unknown data): install would refuse,
    // so never spend a one-time code on it.
    const existing = await partialEnrollment();
    if (existing.state === 'partial') return { ok: false, reason: 'partial-enrollment' };
    if (existing.state !== 'none') return { ok: false, reason: existing.state === 'unknown' ? 'unknown-records' : existing.state };
    const response = await post(`${origin}/v1/enroll`, JSON.stringify({ code }), null);
    if (response.kind !== 'response') return { ok: false, reason: response.kind };
    if (response.status !== 200) return { ok: false, reason: response.body?.error === 'invalid-code' ? 'invalid-code' : 'service' };
    const body = response.body;
    if (!exactKeys(body, ['schemaVersion', 'token', 'deviceId', 'profileIds']) || body.schemaVersion !== 1 || !TOKEN.test(body.token)
      || !uuid(body.deviceId) || !Array.isArray(body.profileIds) || !body.profileIds.length || body.profileIds.length > 8
      || !body.profileIds.every(uuid) || new Set(body.profileIds).size !== body.profileIds.length) return { ok: false, reason: 'service' };
    const installed = await install({ origin, token: body.token, deviceId: body.deviceId, profileIds: body.profileIds });
    if (installed.ok) { started = false; start(); }
    return { ...installed, profiles: body.profileIds.length };
  }

  // Explicit current-device Stop: removes every owned record and this tab's player choice.
  async function stopThisDevice() {
    const result = await O.stop();
    forgetPlayer();
    clearTimeout(timer);
    timer = null;
    started = false;
    return result;
  }

  // ---- Transport ----

  // One POST with a hard deadline. Credentials travel only in the Authorization header;
  // no cookies, no referrer, no redirects. Never throws.
  async function post(url, body, token) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const deadline = setTimeout(() => controller?.abort(), TIMEOUT_MS);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, {
        method: 'POST', headers, body, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
        mode: 'cors', signal: controller?.signal,
      });
      let parsed = null;
      try { parsed = await response.json(); } catch (error) { parsed = null; }
      return { kind: 'response', status: response.status, body: parsed };
    } catch (error) {
      return { kind: controller?.signal.aborted ? 'timeout' : 'network' };
    } finally {
      clearTimeout(deadline);
    }
  }

  // ---- Sync engine ----

  let started = false, timer = null, dueAt = Infinity, running = false, backoff = 0;
  // In memory only: the last sent status (to skip identical status-only syncs) and diagnostics.
  let lastStatusSent = null;
  const trace = [];
  const note = entry => { trace.push({ ...entry, at: Date.now() }); if (trace.length > 20) trace.shift(); };

  function jitter(ms) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return Math.round(ms * (0.5 + value[0] / 0x100000000 / 2));
  }
  function schedule(delay) {
    if (!started) return;
    const at = Date.now() + delay;
    if (timer !== null && at >= dueAt) return;
    clearTimeout(timer);
    dueAt = at;
    timer = setTimeout(() => { timer = null; dueAt = Infinity; run(); }, Math.max(0, delay));
  }

  function start() {
    if (started || !O || !serviceOrigin()) return;
    let hint;
    try { hint = localStorage.getItem(O.ENROLLMENT_KEY); } catch (error) { return; }
    if (hint === null) return;
    started = true;
    if (!listening) {
      listening = true;
      addEventListener('online', () => { backoff = 0; schedule(0); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(backoff ? jitter(backoff) : 0); });
    }
    schedule(FIRST_MS);
  }
  let listening = false;
  // After a resolution: soon, coalesced, never earlier than an active backoff.
  function nudge() {
    if (!started || backoff) return;
    schedule(NUDGE_MS);
  }

  async function run() {
    if (running || !started) return;
    running = true;
    let next = PERIOD_MS;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { note({ outcome: 'offline' }); next = null; return; }
      const outcome = navigator.locks
        ? await navigator.locks.request(SYNC_LOCK, { ifAvailable: true }, lock => (lock ? drain() : 'busy'))
        : await drain();
      note({ outcome });
      // Nothing left to sync for this document until a new enrollment starts the engine again.
      if (['revoked', 'disabled', 'stopped', 'no-consent'].includes(outcome)) { next = null; started = false; return; }
      if (['failed', 'timeout', 'network', 'busy-service'].includes(outcome)) {
        backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : MIN_BACKOFF_MS);
        next = jitter(backoff);
        return;
      }
      if (outcome === 'credential-not-recognized' || outcome === 'unsupported-version') {
        backoff = MAX_BACKOFF_MS;
        next = jitter(backoff);
        return;
      }
      backoff = 0;
    } catch (error) {
      note({ outcome: 'error' });
      backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : MIN_BACKOFF_MS);
      next = jitter(backoff);
    } finally {
      running = false;
      if (next !== null && started && (backoff || typeof document === 'undefined' || document.visibilityState !== 'hidden')) schedule(next);
    }
  }

  // Sends batches until the queue is drained, a batch fails, or MAX_BATCHES is reached.
  async function drain() {
    let outcome = 'idle';
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const result = await syncOnce();
      outcome = result.outcome;
      if (!result.more) break;
    }
    return outcome;
  }

  async function syncOnce() {
    const origin = serviceOrigin();
    if (!origin) return { outcome: 'disabled' };
    const view = await O.syncView();
    if (view.state === 'disabled') return { outcome: 'disabled' };
    if (view.state !== 'ok') return { outcome: view.state };
    // The credential belongs to the service it was issued by; a changed setting pauses.
    if (view.serviceOrigin !== origin || !view.envelope) return { outcome: view.envelope ? 'origin-changed' : 'idle' };
    const expected = { generation: view.generation, deviceId: view.deviceId, token: view.token };
    const suppressed = new Set(view.sync.suppressed.map(item => item.eventId));
    const status = view.envelope.status;
    const batch = [];
    let bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, status, events: [] })).length;
    for (const event of view.envelope.events) {
      if (suppressed.has(event.eventId)) continue;
      const size = new TextEncoder().encode(JSON.stringify(event)).length + 1;
      if (batch.length >= MAX_BATCH_EVENTS || bytes + size > MAX_BODY_BYTES) break;
      batch.push(event);
      bytes += size;
    }
    const statusText = JSON.stringify(status);
    if (!batch.length && statusText === lastStatusSent && view.sync.lastSuccessAt !== null) return { outcome: 'idle' };
    const pending = view.envelope.events.filter(event => !suppressed.has(event.eventId)).length;
    const response = await post(`${origin}/v1/sync`, JSON.stringify({ schemaVersion: 1, status, events: batch }), view.token);
    if (response.kind !== 'response') return { outcome: response.kind };
    const error = isRecord(response.body) && typeof response.body.error === 'string' ? response.body.error : null;
    if (response.status === 403 && error === 'revoked') {
      // Server proof that this credential was issued and revoked (or its install erased).
      const stopped = await O.stopGeneration(expected);
      if (stopped.ok) forgetPlayer();
      note({ outcome: 'revoked-stop', ok: stopped.ok, reason: stopped.reason ?? null });
      return { outcome: 'revoked' };
    }
    const quiet = { submitted: [], remove: [], suppress: [], rotateEpoch: null, syncedAt: null };
    if (response.status === 401) {
      // Unknown or malformed credential: nothing is removed; the enrollment page shows it.
      await O.applySync(expected, { ...quiet, notice: 'credential-not-recognized' });
      return { outcome: 'credential-not-recognized' };
    }
    if (response.status === 422 && error === 'unsupported-schema') {
      await O.applySync(expected, { ...quiet, notice: 'unsupported-version' });
      return { outcome: 'unsupported-version' };
    }
    if (response.status === 429 || response.status === 503) return { outcome: 'busy-service' };
    if (response.status !== 200) return { outcome: 'failed' };
    const results = receipt(response.body, batch);
    if (!results) return { outcome: 'failed' };
    const remove = [], suppress = [];
    let rotateEpoch = null;
    results.forEach((outcome, index) => {
      const event = batch[index];
      if (outcome === 'accepted' || outcome === 'deleted') remove.push(event.eventId);
      else suppress.push({ eventId: event.eventId, reason: SUPPRESS[outcome] });
      if (outcome === 'seq-conflict' && event.epochId === status.epochId) rotateEpoch = status.epochId;
    });
    const applied = await O.applySync(expected, {
      submitted: batch.map(event => event.eventId), remove, suppress, rotateEpoch, syncedAt: new Date().toISOString(), notice: null,
    });
    if (!applied.ok) return { outcome: applied.reason === 'superseded' || applied.reason === 'stopped' ? 'stopped' : 'failed' };
    lastStatusSent = statusText;
    return { outcome: 'synced', more: batch.length > 0 && pending > batch.length };
  }

  // Strict receipt: one result per submitted event, in order, naming exactly that event.
  // Anything else is treated as a failed sync and changes nothing.
  function receipt(body, batch) {
    if (!exactKeys(body, ['schemaVersion', 'results']) || body.schemaVersion !== 1 || !Array.isArray(body.results)
      || body.results.length !== batch.length) return null;
    const outcomes = [];
    for (const [index, item] of body.results.entries()) {
      if (!exactKeys(item, ['eventId', 'outcome']) || item.eventId !== batch[index].eventId || !OUTCOMES.includes(item.outcome)) return null;
      outcomes.push(item.outcome);
    }
    return outcomes;
  }

  // Read-only health for the enrollment page.
  async function health() {
    if (!O) return { state: 'unavailable', configured: false };
    const configured = Boolean(serviceOrigin());
    const view = await O.syncView();
    if (view.state !== 'ok') return { state: view.state, configured };
    const suppressed = new Set(view.sync.suppressed.map(item => item.eventId));
    const events = view.envelope ? view.envelope.events : [];
    return {
      state: 'ok', configured, profiles: view.profileIds.length,
      waiting: events.filter(event => !suppressed.has(event.eventId)).length, held: events.filter(event => suppressed.has(event.eventId)).length,
      lastSuccessAt: view.sync.lastSuccessAt, notice: view.sync.notice,
      droppedLocal: view.envelope ? view.envelope.status.droppedLocal : 0, writeFailures: view.envelope ? view.envelope.status.writeFailures : 0,
      originMatches: view.serviceOrigin === serviceOrigin(),
    };
  }

  globalThis.LEARNING_SYNC = Object.freeze({
    PLAYER_KEY,
    serviceOrigin, players, player, choosePlayer, buildPlayerPicker,
    enroll, install, partialEnrollment, finishEnrollment, stopPartialEnrollment, stopThisDevice, health, normalizeCode,
    start, nudge,
    // Runs one sync pass now (tests and the enrollment page's "Sync now").
    syncNow: () => { if (!started) start(); return started ? run() : Promise.resolve(); },
    diagnostics: () => ({ started, running, backoff, dueAt, trace: trace.map(entry => ({ ...entry })) }),
  });
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})();
