// Test-only helpers for the #199 learning-event outbox. Nothing here ships.
//
// 1. createFakeIndexedDB(): a minimal IndexedDB stand-in for the Node domain spec. It
//    models the properties the outbox relies on: transactions run one at a time in
//    order; each sees every earlier commit; an abort discards all of a transaction's
//    requests; an aborted upgrade of a missing database leaves no database; and a
//    delete waits for open connections after `versionchange`. It is NOT evidence of
//    real IndexedDB behavior. Real lifecycle and concurrency proof comes from the
//    browser specs.
// 2. Browser helpers that install the synthetic consent the way #200 will (production
//    #199 has no installer), read the stored records without ever creating a
//    database, and inject IndexedDB failures.

const domError = name => Object.assign(new Error(name), { name });
const event = target => ({ target, preventDefault() {} });
const later = fn => queueMicrotask(fn);

export function createFakeIndexedDB() {
  const databases = new Map();
  const deletions = new Map();
  const waiters = [];
  const notify = () => { for (const check of waiters.splice(0)) check(); };
  const until = predicate => new Promise(resolve => {
    const check = () => (predicate() ? resolve() : waiters.push(check));
    check();
  });
  // abortAfterPut: abort the next N transactions right after a put succeeds.
  // quotaChars: abort a readwrite commit whose stored strings exceed this size.
  // openError: fail the next N opens. hold: a promise the next transaction waits on before committing.
  // abortNext: abort the next N transactions at commit (after all their requests succeeded).
  const faults = { abortAfterPut: 0, abortNext: 0, quotaChars: Infinity, openError: 0, hold: null };
  const log = { opens: 0, deletes: 0, transactions: 0 };
  let tail = Promise.resolve();

  function connect(name, entry) {
    const connection = {
      name,
      get version() { return entry.version; },
      closed: false,
      onversionchange: null,
      onclose: null,
      objectStoreNames: { get length() { return entry.stores.size; }, contains: store => entry.stores.has(store) },
      close() {
        connection.closed = true;
        entry.connections.delete(connection);
        notify();
      },
      createObjectStore(store) { entry.stores.set(store, new Map()); },
      transaction(names, mode = 'readonly') {
        if (connection.closed) throw domError('InvalidStateError');
        const store = Array.isArray(names) ? names[0] : names;
        if (!entry.stores.has(store)) throw domError('NotFoundError');
        return transaction(entry, store, mode);
      },
    };
    entry.connections.add(connection);
    return connection;
  }

  function transaction(entry, storeName, mode) {
    log.transactions++;
    const pending = [];
    const tx = {
      mode, error: null, oncomplete: null, onabort: null, aborted: false, finished: false,
      objectStore: () => api,
      abort() {
        if (tx.finished) throw domError('InvalidStateError');
        tx.aborted = true;
      },
    };
    const request = (op, key, value) => {
      if (tx.finished || tx.aborted) throw domError('TransactionInactiveError');
      const entryRequest = { result: undefined, error: null, onsuccess: null, onerror: null, transaction: tx, listeners: [] };
      entryRequest.addEventListener = (type, listener) => { if (type === 'success') entryRequest.listeners.push(listener); };
      pending.push({ op, key, value, request: entryRequest });
      return entryRequest;
    };
    const api = {
      get: key => request('get', key),
      put: (value, key) => {
        if (mode !== 'readwrite') throw domError('ReadOnlyError');
        return request('put', key, value);
      },
      delete: key => {
        if (mode !== 'readwrite') throw domError('ReadOnlyError');
        return request('delete', key);
      },
    };
    const hold = faults.hold;
    faults.hold = null;
    tail = tail.then(() => new Promise(done => {
      // Starts after every earlier transaction finished, so it sees all earlier commits.
      const work = new Map(entry.stores.get(storeName));
      const finish = committed => {
        tx.finished = true;
        if (committed) {
          if (mode === 'readwrite') entry.stores.set(storeName, work);
          tx.oncomplete?.(event(tx));
        } else {
          tx.onabort?.(event(tx));
        }
        done();
      };
      const step = () => {
        if (tx.aborted) return finish(false);
        const next = pending.shift();
        if (!next) {
          const commit = () => {
            if (tx.aborted) return finish(false);
            if (faults.abortNext > 0) {
              faults.abortNext--;
              return finish(false);
            }
            const size = [...work.values()].reduce((sum, value) => sum + (typeof value === 'string' ? value.length : 0), 0);
            if (mode === 'readwrite' && size > faults.quotaChars) {
              tx.error = domError('QuotaExceededError');
              return finish(false);
            }
            return finish(true);
          };
          return hold ? hold.then(commit) : commit();
        }
        if (next.op === 'get') next.request.result = work.get(next.key);
        else if (next.op === 'put') work.set(next.key, next.value);
        else work.delete(next.key);
        next.request.onsuccess?.(event(next.request));
        for (const listener of next.request.listeners) listener(event(next.request));
        if (next.op === 'put' && faults.abortAfterPut > 0) {
          faults.abortAfterPut--;
          tx.aborted = true;
        }
        later(step);
        return undefined;
      };
      later(step);
    }));
    return tx;
  }

  const factory = {
    open(name, version) {
      log.opens++;
      const req = { result: null, error: null, transaction: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      later(async () => {
        await (deletions.get(name) || Promise.resolve());
        if (faults.openError > 0) {
          faults.openError--;
          req.error = domError('UnknownError');
          req.onerror?.(event(req));
          return;
        }
        const existing = databases.get(name), current = existing ? existing.version : 0;
        const target = version === undefined ? (current || 1) : version;
        if (target < current) {
          req.error = domError('VersionError');
          req.onerror?.(event(req));
          return;
        }
        if (target > current) {
          const provisional = { version: target, stores: new Map(existing ? existing.stores : []), connections: new Set() };
          let aborted = false;
          req.transaction = { abort() { aborted = true; } };
          req.result = connect(name, provisional);
          req.onupgradeneeded?.({ target: req, oldVersion: current, newVersion: target });
          if (aborted) {
            req.result.close();
            req.result = null;
            req.error = domError('AbortError');
            req.onerror?.(event(req));
            return;
          }
          databases.set(name, provisional);
          req.transaction = null;
          req.onsuccess?.(event(req));
          return;
        }
        req.result = connect(name, existing);
        req.onsuccess?.(event(req));
      });
      return req;
    },
    deleteDatabase(name) {
      log.deletes++;
      const req = { result: undefined, error: null, onsuccess: null, onerror: null, onblocked: null };
      const work = (async () => {
        await Promise.resolve();
        const entry = databases.get(name);
        if (entry) {
          for (const connection of [...entry.connections]) connection.onversionchange?.(event(connection));
          if (entry.connections.size) {
            req.onblocked?.(event(req));
            await until(() => entry.connections.size === 0);
          }
          databases.delete(name);
        }
        req.onsuccess?.(event(req));
      })();
      deletions.set(name, work);
      work.then(() => { if (deletions.get(name) === work) deletions.delete(name); });
      return req;
    },
    databases: () => Promise.resolve([...databases].map(([name, entry]) => ({ name, version: entry.version }))),
  };

  return {
    factory,
    faults,
    log,
    // Test-side direct access (the "disk"), bypassing transactions.
    seed(name, store, records = {}, { version = 1, stores = [store] } = {}) {
      const entry = databases.get(name) || { version, stores: new Map(), connections: new Set() };
      entry.version = version;
      for (const storeName of stores) if (!entry.stores.has(storeName)) entry.stores.set(storeName, new Map());
      for (const [key, value] of Object.entries(records)) entry.stores.get(store).set(key, value);
      databases.set(name, entry);
    },
    peek: (name, store, key) => databases.get(name)?.stores.get(store)?.get(key) ?? null,
    poke(name, store, key, value) { databases.get(name).stores.get(store).set(key, value); },
    remove(name, store, key) { databases.get(name)?.stores.get(store)?.delete(key); },
    exists: name => databases.has(name),
    version: name => databases.get(name)?.version ?? null,
    openConnections: name => databases.get(name)?.connections.size ?? 0,
  };
}

// ---- Browser helpers (Playwright pages that load shared/learning-outbox.js) ----

export function consentRecord({ generation, deviceId, profileIds }) {
  return JSON.stringify({ schemaVersion: 1, generation, deviceId, profileIds });
}

// Installs the synthetic authoritative consent (creating the schema exactly as #200
// will, through the exported constants), then the synchronous hint.
export function installConsent(page, enrollment) {
  return page.evaluate(async value => {
    const O = LEARNING_OUTBOX;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(O.DB_NAME, O.DB_VERSION);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(O.STORE)) request.result.createObjectStore(O.STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(O.STORE, 'readwrite');
      tx.objectStore(O.STORE).put(JSON.stringify({ schemaVersion: 1, generation: value.generation, deviceId: value.deviceId, profileIds: value.profileIds }), O.CONSENT_RECORD);
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(O.ENROLLMENT_KEY, JSON.stringify({ schemaVersion: 1, generation: value.generation, deviceId: value.deviceId,
      profileIds: value.profileIds, activeProfileId: value.activeProfileId ?? null }));
  }, enrollment);
}

// Reads the stored records after this page's outbox transactions settle. Never creates a
// database: like the recorder, it checks `databases()` first where supported and does
// not open a database that is not listed; any upgrade of the fallback open is aborted.
export function readRecords(page) {
  return page.evaluate(async () => {
    const O = LEARNING_OUTBOX;
    await O.idle();
    if (typeof indexedDB.databases === 'function') {
      const entry = (await indexedDB.databases()).find(item => item.name === O.DB_NAME);
      if (!entry || entry.version === 0) return { exists: false, version: null, consent: null, outbox: null };
    }
    const db = await new Promise(resolve => {
      const request = indexedDB.open(O.DB_NAME);
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => { event.preventDefault(); resolve(null); };
    });
    if (!db) return { exists: false, version: null, consent: null, outbox: null };
    const version = db.version;
    if (!db.objectStoreNames.contains(O.STORE)) { db.close(); return { exists: true, version, consent: null, outbox: null }; }
    const records = await new Promise(resolve => {
      const tx = db.transaction(O.STORE, 'readonly'), store = tx.objectStore(O.STORE);
      const consent = store.get(O.CONSENT_RECORD), outbox = store.get(O.OUTBOX_RECORD);
      tx.oncomplete = () => resolve({ consent: consent.result ?? null, outbox: outbox.result ?? null });
    });
    db.close();
    return { exists: true, version, ...records };
  });
}

// The outbox as the tests read it: raw string, parsed envelope, validity and diagnostics.
export async function readOutbox(page) {
  const records = await readRecords(page);
  if (records.outbox === null) return null;
  return page.evaluate(raw => {
    const envelope = JSON.parse(raw);
    return { raw, envelope, valid: LEARNING_OUTBOX.validateEnvelope(envelope), diagnostics: LEARNING_OUTBOX.diagnostics() };
  }, records.outbox);
}

// Names of this origin's IndexedDB databases, or null where `databases()` is unsupported.
export function databaseNames(page) {
  return page.evaluate(async () => (typeof indexedDB?.databases === 'function' ? (await indexedDB.databases()).map(entry => entry.name).sort() : null));
}

// Removes this task's database between scripted runs (other connections close on versionchange).
export function deleteOutboxDatabase(page) {
  return page.evaluate(() => new Promise(resolve => {
    const request = indexedDB.deleteDatabase('learningReporting');
    request.onsuccess = () => resolve('deleted');
    request.onerror = () => resolve('error');
    request.onblocked = () => {};
  }));
}

// Context init script: counts indexedDB.open calls (window.__idbOpens); when
// window.__failOpen is true, open throws as an engine open failure would; and when
// window.__failOutbox is true aborts the outbox transaction right after its put request
// succeeds (before completion), the faithful injection for a commit that does not land.
export function outboxSpyScript() {
  window.__idbOpens = 0;
  if (typeof indexedDB !== 'undefined' && indexedDB) {
    const proto = Object.getPrototypeOf(indexedDB), open = proto.open;
    proto.open = function (...args) {
      window.__idbOpens++;
      if (window.__failOpen) throw new DOMException('Injected open failure', 'UnknownError');
      return open.apply(this, args);
    };
  }
  if (typeof IDBObjectStore !== 'undefined') {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = put.call(this, value, key);
      if (key === 'outbox' && window.__failOutbox) {
        const tx = this.transaction;
        request.addEventListener('success', () => { try { tx.abort(); } catch (error) { /* already finishing */ } });
      }
      return request;
    };
  }
}
