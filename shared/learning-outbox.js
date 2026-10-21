// Learning-event outbox (#199): a browser-local, privacy-safe queue of learning
// events for Football and Number facts. DOM-free and network-free. Recording is
// off until a #200 enrollment record exists; see shared/LEARNING_EVENTS.md.
(() => {
  'use strict';
  // Authority (IndexedDB): the consent and the outbox envelope, each one string under
  // its own key in one object store. Every mutation is one readwrite transaction.
  const DB_NAME = 'learningReporting', DB_VERSION = 1, STORE = 'records';
  const CONSENT_RECORD = 'enrollment', OUTBOX_RECORD = 'outbox';
  // #200 records in the same store: the device credential, the sync state (bounded
  // suppression and health) and the Facts question/profile binding. Stop removes all five.
  const CREDENTIAL_RECORD = 'credential', SYNC_RECORD = 'sync', BINDING_RECORD = 'binding';
  const RECORDS = [CONSENT_RECORD, OUTBOX_RECORD, CREDENTIAL_RECORD, SYNC_RECORD, BINDING_RECORD];
  // localStorage: the synchronous admission hint written by #200 (never authority), and
  // the never-released legacy outbox key (preserved and paused; only Stop removes it).
  const ENROLLMENT_KEY = 'learningReporting:enrollment:v1';
  const LEGACY_OUTBOX_KEY = 'learningReporting:outbox:v1';
  // One version for the envelope, status record and event contract. Any catalog
  // change bumps it, so older pages pause instead of rejecting newer events.
  const SCHEMA_VERSION = 1;
  const MAX_EVENTS = 500, MAX_CHARS = 262144, MAX_PROFILES = 8, MAX_IDS = 1000, COUNTER_MAX = 1000000000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
  const LABEL = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
  const GRADING = ['gate', 'noStakes'], EVIDENCE_CLASSES = ['literacy', 'independent'];
  const RESOLUTIONS = ['firstTryCorrect', 'retryCorrect', 'secondMiss'], FACTS_OUTCOMES = ['first-correct', 'retry', 'shown'];

  const deepFreeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  };
  const own = (record, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
  // Realm-independent: test harnesses may pass objects from another context.
  const isRecord = value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || Object.getPrototypeOf(proto) === null;
  };
  const exactKeys = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const uuid = value => typeof value === 'string' && UUID.test(value);
  const isoTime = value => typeof value === 'string' && ISO_TIME.test(value) && Number.isFinite(Date.parse(value));
  const bump = (value, by = 1) => Math.min(COUNTER_MAX, value + by);
  const clone = value => JSON.parse(JSON.stringify(value));

  // Closed copy of the published Football family metadata:
  // [familyId, concept, purpose, tier, grading, evidenceClass]. Parity tests bind
  // it to FOOTBALL_CONTEXTUAL_QUESTIONS.FAMILY_REGISTRY.
  const FOOTBALL_FAMILIES = [
    ['score-total-ch8', 'score-total-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['score-total-ch8-within-20', 'score-total-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['score-total-ch8-ones-add', 'score-total-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['score-difference-ch8', 'score-difference-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['score-difference-ch8-ones-subtract', 'score-difference-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['team-yards-add-ch8', 'team-yards-add-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['team-yards-add-ch8-within-20', 'team-yards-add-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['team-yards-add-ch8-ones-add', 'team-yards-add-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['line-remaining-ch8', 'line-remaining-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['line-remaining-ch8-ones-subtract', 'line-remaining-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['goal-remaining-ch8', 'goal-remaining-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['goal-remaining-ch8-ones-subtract', 'goal-remaining-ch8', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['line-to-gain-surplus-ch8', 'line-to-gain', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['line-to-gain-surplus-ch8-ones-subtract', 'line-to-gain', 'approvedExtension', 'chapter-8-arithmetic', 'gate', 'independent'],
    ['yards-to-go-read', 'line-to-gain', 'coreReview', 'within-10', 'gate', 'literacy'],
    ['line-to-gain-missing-part', 'line-to-gain', 'weakSpot', 'within-10', 'gate', 'independent'],
    ['line-to-gain-exact', 'line-to-gain', 'weakSpot', 'within-10', 'gate', 'independent'],
    ['line-to-gain-surplus', 'line-to-gain', 'weakSpot', 'within-10', 'gate', 'independent'],
    ['line-to-gain-fact-family', 'line-to-gain', 'coreReview', 'within-10', 'gate', 'independent'],
    ['gain-vs-needed-comparison', 'line-to-gain-comparison', 'coreReview', 'within-16', 'gate', 'independent'],
    ['goal-distance-tens', 'place-value', 'completedPlaceValue', 'two-digit-structure', 'gate', 'literacy'],
    ['goal-distance-ones', 'place-value', 'completedPlaceValue', 'two-digit-structure', 'gate', 'literacy'],
    ['team-yards-past-100', 'team-total-yards', 'approvedExtension', 'through-120', 'gate', 'independent'],
    ['drive-distance-scaffolded', 'drive-distance', 'weakSpot', 'within-10', 'gate', 'independent'],
    ['committed-score-total', 'committed-score', 'coreReview', 'within-10', 'gate', 'independent'],
    ['committed-score-difference', 'committed-score', 'weakSpot', 'within-10', 'gate', 'independent'],
    ['committed-score-tens', 'teen-place-value', 'completedPlaceValue', 'two-digit-structure', 'gate', 'literacy'],
    ['committed-score-ones', 'teen-place-value', 'completedPlaceValue', 'two-digit-structure', 'gate', 'literacy'],
    ['quarter-read', 'quarter-read', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['half-read', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['quarters-still-to-come', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['quarters-before-halftime', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['quarters-finished', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['quarters-in-half', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['second-half-quarters', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['game-part-boundary', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['halves-make-whole', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['game-part-compare', 'quarter-half-structure', 'coreReview', 'football-context', 'gate', 'independent'],
    ['next-down', 'down-progression', 'coreReview', 'football-context', 'gate', 'independent'],
    ['goal-distance-minus-whole-tens', 'field-distance', 'completedPlaceValue', 'two-digit-structure', 'gate', 'independent'],
    ['drive-distance-plus-whole-tens', 'drive-distance', 'completedPlaceValue', 'two-digit-structure', 'gate', 'independent'],
    ['touchdown-base-points', 'touchdown-base-scoring', 'coreReview', 'football-context', 'gate', 'independent'],
    ['punt-travel-distance', 'punt-distance', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['punt-landing-spot', 'punt-placement', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['field-goal-attempt-distance', 'field-goal-distance', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['field-goal-point-value', 'field-goal-scoring', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['conversion-attempt-value', 'conversion-scoring', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['conversion-try-marker', 'conversion-placement', 'coreReview', 'football-context', 'gate', 'literacy'],
    ['two-point-three-digit-add', 'two-point-challenge', 'requestedChallenge', 'three-digit-no-regrouping', 'gate', 'independent'],
    ['two-point-three-digit-subtract', 'two-point-challenge', 'requestedChallenge', 'three-digit-no-regrouping', 'gate', 'independent'],
  ];
  // Retired families stay listed here and in FOOTBALL_FAMILIES so queued events stay valid.
  const HISTORICAL_FOOTBALL_FAMILIES = [];
  // The same closed rule as PLACE_FACTS: x <= y in 0..9, family family:x:y:x+y.
  const facts = {};
  for (let x = 0; x <= 9; x++) for (let y = x; y <= 9; y++) {
    for (const id of [`add:${x}:${y}`, `add:${y}:${x}`, `sub:${x + y}:${x}`, `sub:${x + y}:${y}`]) {
      if (!own(facts, id)) facts[id] = `family:${x}:${y}:${x + y}`;
    }
  }
  const CATALOG = deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    football: Object.fromEntries(FOOTBALL_FAMILIES.map(([familyId, concept, purpose, tier, grading, evidenceClass]) =>
      [familyId, { concept, purpose, tier, grading, evidenceClass }])),
    historicalFootball: HISTORICAL_FOOTBALL_FAMILIES,
    facts,
  });

  const META = ['familyId', 'concept', 'purpose', 'tier', 'grading', 'evidenceClass'];
  const COMMON = ['schemaVersion', 'eventId', 'deviceId', 'epochId', 'seq', 'profileId', 'game', 'gameVersion', 'recordedAt', 'kind', 'questionInstanceId'];
  // Per-kind allowlists. Keys not listed are forbidden, never present-as-null.
  const FIELDS = deepFreeze({
    football: {
      attempt: [...META, 'number', 'correct', 'support'],
      help: [...META, 'number', 'support'],
      resolution: [...META, 'resolution'],
      leftUnfinished: META,
    },
    facts: {
      attempt: ['factId', 'family', 'number', 'correct', 'helped'],
      help: ['factId', 'family', 'number', 'helped'],
      resolution: ['factId', 'family', 'outcome', 'eligibleCheck', 'timingMs', 'helped'],
      leftUnfinished: ['factId', 'family'],
    },
  });
  const STATUS_KEYS = ['schemaVersion', 'deviceId', 'epochId', 'highestSeq', 'droppedLocal', 'writeFailures'];
  const ENVELOPE_KEYS = ['schemaVersion', 'generation', 'status', 'events', 'links'];
  const ENROLLMENT_KEYS = ['schemaVersion', 'generation', 'deviceId', 'profileIds', 'activeProfileId'];
  const CONSENT_KEYS = ['schemaVersion', 'generation', 'deviceId', 'profileIds'];
  const LINK_KEYS = ['questionInstanceId', 'nonce', 'factId', 'serial', 'misses', 'helped', 'firstCorrect'];
  const LINK_KEY_KEYS = ['nonce', 'factId', 'serial'];
  const CREDENTIAL_KEYS = ['schemaVersion', 'generation', 'deviceId', 'serviceOrigin', 'token'];
  const SYNC_KEYS = ['schemaVersion', 'generation', 'suppressed', 'lastSuccessAt', 'notice'];
  const BINDING_KEYS = ['schemaVersion', 'generation', 'facts'];
  const BOUND_KEYS = ['nonce', 'factId', 'serial', 'profileId'];
  // Device token: installation marker, then 256 random bits. Sent only in an Authorization header.
  const TOKEN = /^lr1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/;
  const SUPPRESS_REASONS = ['invalid', 'conflict', 'unassigned'];
  const NOTICES = ['credential-not-recognized', 'unsupported-version'];
  const MAX_SUPPRESSED = MAX_EVENTS, MAX_SYNC_IDS = 20;

  function validateCatalog(catalog) {
    if (!exactKeys(catalog, ['schemaVersion', 'football', 'historicalFootball', 'facts']) || catalog.schemaVersion !== SCHEMA_VERSION
      || !isRecord(catalog.football) || !isRecord(catalog.facts) || !Array.isArray(catalog.historicalFootball)) return false;
    const football = Object.entries(catalog.football);
    const factEntries = Object.entries(catalog.facts);
    return football.length > 0 && factEntries.length > 0
      && football.every(([id, entry]) => LABEL.test(id) && exactKeys(entry, META.slice(1))
        && [entry.concept, entry.purpose, entry.tier].every(value => typeof value === 'string' && LABEL.test(value))
        && GRADING.includes(entry.grading) && EVIDENCE_CLASSES.includes(entry.evidenceClass))
      && catalog.historicalFootball.every(id => own(catalog.football, id) !== undefined)
      && new Set(catalog.historicalFootball).size === catalog.historicalFootball.length
      && factEntries.every(([id, family]) => /^(add|sub):\d{1,2}:\d$/.test(id) && typeof family === 'string' && /^family:\d:\d:\d{1,2}$/.test(family));
  }

  function footballFieldsValid(event, catalog) {
    const entry = own(catalog.football, event.familyId);
    if (!entry || META.slice(1).some(key => event[key] !== entry[key])) return false;
    if (event.kind === 'attempt') {
      // The live stage names (contextual-questions normalizeSupport): an unsupported
      // attempt is 'initial'; the retry is 'guided'. 'worked' follows both attempts.
      return (event.number === 1 || event.number === 2) && typeof event.correct === 'boolean'
        && (event.support === 'initial' || event.support === 'guided') && (event.number === 1 || event.support === 'guided');
    }
    if (event.kind === 'help') {
      return event.number === 1 ? event.support === 'guided'
        : event.number === 2 && (event.support === 'guided' || event.support === 'worked');
    }
    if (event.kind === 'resolution') return RESOLUTIONS.includes(event.resolution);
    return true;
  }

  function factsFieldsValid(event, catalog) {
    if (own(catalog.facts, event.factId) === undefined || own(catalog.facts, event.factId) !== event.family) return false;
    if (event.kind === 'attempt') return integer(event.number, 1, 100) && typeof event.correct === 'boolean' && typeof event.helped === 'boolean';
    if (event.kind === 'help') return integer(event.number, 1, 100) && event.helped === true;
    if (event.kind === 'resolution') {
      return FACTS_OUTCOMES.includes(event.outcome) && typeof event.eligibleCheck === 'boolean' && typeof event.helped === 'boolean'
        && (event.outcome === 'shown') === event.helped && (!event.eligibleCheck || event.outcome === 'first-correct')
        && (event.timingMs === null || (integer(event.timingMs, 300, 60000) && event.timingMs % 100 === 0))
        && !(event.helped && event.timingMs !== null);
    }
    return true;
  }

  function validateEvent(event, catalog = CATALOG) {
    if (!isRecord(event) || (event.game !== 'football' && event.game !== 'facts')) return false;
    const fields = own(FIELDS[event.game], event.kind);
    if (!fields || !exactKeys(event, [...COMMON, ...fields])) return false;
    if (event.schemaVersion !== SCHEMA_VERSION || !integer(event.seq, 1, COUNTER_MAX)
      || ![event.eventId, event.deviceId, event.epochId, event.profileId, event.questionInstanceId].every(uuid)
      || typeof event.gameVersion !== 'string' || !VERSION.test(event.gameVersion) || !isoTime(event.recordedAt)) return false;
    return event.game === 'football' ? footballFieldsValid(event, catalog) : factsFieldsValid(event, catalog);
  }

  function validateStatus(status) {
    return exactKeys(status, STATUS_KEYS) && status.schemaVersion === SCHEMA_VERSION && uuid(status.deviceId) && uuid(status.epochId)
      && integer(status.highestSeq, 0, COUNTER_MAX) && integer(status.droppedLocal, 0, COUNTER_MAX) && integer(status.writeFailures, 0, COUNTER_MAX);
  }

  const linkKeyValid = key => exactKeys(key, LINK_KEY_KEYS) && integer(key.nonce, 1, COUNTER_MAX)
    && own(CATALOG.facts, key.factId) !== undefined && integer(key.serial, 0, COUNTER_MAX);
  function validateLinks(links) {
    if (!exactKeys(links, ['facts', 'factsRetired'])) return false;
    const link = links.facts;
    const linkValid = link === null || (exactKeys(link, LINK_KEYS) && uuid(link.questionInstanceId)
      && linkKeyValid({ nonce: link.nonce, factId: link.factId, serial: link.serial })
      && integer(link.misses, 0, 99) && typeof link.helped === 'boolean' && (link.firstCorrect === null || link.firstCorrect === false));
    return linkValid && (links.factsRetired === null || linkKeyValid(links.factsRetired));
  }

  function validateEnvelope(envelope, catalog = CATALOG) {
    if (!exactKeys(envelope, ENVELOPE_KEYS) || envelope.schemaVersion !== SCHEMA_VERSION || !uuid(envelope.generation)
      || !validateStatus(envelope.status) || !validateLinks(envelope.links)
      || !Array.isArray(envelope.events) || envelope.events.length > MAX_EVENTS) return false;
    const ids = new Set(), slots = new Set(), status = envelope.status;
    for (const event of envelope.events) {
      if (!validateEvent(event, catalog) || event.deviceId !== status.deviceId
        || (event.epochId === status.epochId && event.seq > status.highestSeq)) return false;
      const slot = `${event.epochId}:${event.seq}`;
      if (ids.has(event.eventId) || slots.has(slot)) return false;
      ids.add(event.eventId);
      slots.add(slot);
    }
    return true;
  }

  const newer = value => typeof value === 'number' && value > SCHEMA_VERSION;
  function classify(raw) {
    if (raw === null || raw === undefined) return { state: 'missing' };
    if (typeof raw !== 'string') return { state: 'malformed' };
    let value;
    try { value = JSON.parse(raw); } catch (error) { return { state: 'malformed' }; }
    // Any newer envelope, status or event version pauses before strict validation.
    if (newer(value?.schemaVersion) || newer(value?.status?.schemaVersion)
      || (Array.isArray(value?.events) && value.events.some(event => newer(event?.schemaVersion)))) return { state: 'future' };
    if (raw.length > MAX_CHARS || !validateEnvelope(value)) return { state: 'malformed' };
    return { state: 'ok', envelope: value };
  }

  const storage = () => globalThis.localStorage;
  const idbFactory = () => {
    const factory = globalThis.indexedDB;
    return factory && typeof factory.open === 'function' && typeof factory.deleteDatabase === 'function' ? factory : null;
  };
  const uuidAvailable = () => typeof globalThis.crypto?.randomUUID === 'function';
  const newId = () => globalThis.crypto.randomUUID();

  // The authoritative consent, read inside a transaction. Strict, versioned, no profile selection.
  function parseConsent(raw) {
    if (raw === null || raw === undefined) return { state: 'missing' };
    if (typeof raw !== 'string') return { state: 'malformed' };
    let value;
    try { value = JSON.parse(raw); } catch (error) { return { state: 'malformed' }; }
    if (newer(value?.schemaVersion)) return { state: 'future' };
    if (!exactKeys(value, CONSENT_KEYS) || value.schemaVersion !== 1 || !uuid(value.generation) || !uuid(value.deviceId)
      || !Array.isArray(value.profileIds) || value.profileIds.length < 1 || value.profileIds.length > MAX_PROFILES
      || !value.profileIds.every(uuid) || new Set(value.profileIds).size !== value.profileIds.length) return { state: 'malformed' };
    return { state: 'ok', consent: value };
  }

  // #200 service origin: https, or plain http on the loopback host for local tests only.
  const SERVICE_ORIGIN = /^(https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|http:\/\/(?:127\.0\.0\.1|localhost))(?::\d{1,5})?$/;
  const serviceOriginValid = value => typeof value === 'string' && value.length <= 253 && SERVICE_ORIGIN.test(value);
  const validateCredential = value => exactKeys(value, CREDENTIAL_KEYS) && value.schemaVersion === 1 && uuid(value.generation)
    && uuid(value.deviceId) && serviceOriginValid(value.serviceOrigin) && typeof value.token === 'string' && TOKEN.test(value.token);
  const validateSyncRecord = value => exactKeys(value, SYNC_KEYS) && value.schemaVersion === 1 && uuid(value.generation)
    && Array.isArray(value.suppressed) && value.suppressed.length <= MAX_SUPPRESSED
    && value.suppressed.every(item => exactKeys(item, ['eventId', 'reason']) && uuid(item.eventId) && SUPPRESS_REASONS.includes(item.reason))
    && new Set(value.suppressed.map(item => item.eventId)).size === value.suppressed.length
    && (value.lastSuccessAt === null || isoTime(value.lastSuccessAt)) && (value.notice === null || NOTICES.includes(value.notice));
  const validateBinding = value => exactKeys(value, BINDING_KEYS) && value.schemaVersion === 1 && uuid(value.generation)
    && (value.facts === null || (exactKeys(value.facts, BOUND_KEYS) && linkKeyValid(linkKey(value.facts)) && uuid(value.facts.profileId)));
  // Strict, versioned parse of one #200 record; `generation` binds it to the current consent.
  function parseRecord(raw, validate, generation) {
    if (raw === null || raw === undefined) return { state: 'missing' };
    if (typeof raw !== 'string') return { state: 'malformed' };
    let value;
    try { value = JSON.parse(raw); } catch (error) { return { state: 'malformed' }; }
    if (newer(value?.schemaVersion)) return { state: 'future' };
    if (!validate(value)) return { state: 'malformed' };
    if (value.generation !== generation) return { state: 'foreign' };
    return { state: 'ok', value };
  }
  const freshSync = generation => ({ schemaVersion: 1, generation, suppressed: [], lastSuccessAt: null, notice: null });

  // The synchronous admission hint. Read-only; it can refuse a capture but never authorizes a
  // write. Missing, malformed or future hints mean recording is off.
  function readEnrollment() {
    const raw = storage().getItem(ENROLLMENT_KEY);
    if (raw === null) return null;
    let value;
    try { value = JSON.parse(raw); } catch (error) { return null; }
    if (!exactKeys(value, ENROLLMENT_KEYS) || value.schemaVersion !== 1 || !uuid(value.generation) || !uuid(value.deviceId)
      || !Array.isArray(value.profileIds) || value.profileIds.length < 1 || value.profileIds.length > MAX_PROFILES
      || !value.profileIds.every(uuid) || new Set(value.profileIds).size !== value.profileIds.length
      || !(value.activeProfileId === null || value.profileIds.includes(value.activeProfileId))) return null;
    const profileId = value.activeProfileId ?? (value.profileIds.length === 1 ? value.profileIds[0] : null);
    return { generation: value.generation, deviceId: value.deviceId, profileIds: [...value.profileIds], profileId };
  }

  const catalogValid = validateCatalog(CATALOG);
  let stopToken = 0, queue = [], scheduled = false, chain = Promise.resolve();
  let pendingFailures = 0, lastState = 'idle', factsOwn = null;
  // This document's cached connection, and a still-live deleteDatabase request from Stop.
  let connection = null, liveDb = null, deletion = null;
  // In-memory diagnostics only, never stored: the last 8 completed commits (epoch, seq
  // numbers, completed event IDs and start/oncomplete times on the shared clock) and
  // counts of granted/refused captures, queued/rejected templates, ops dropped by
  // stop or revocation, and events this document stored.
  const commits = [];
  const counts = { captured: 0, refused: 0, queued: 0, rejected: 0, dropped: 0, stored: 0 };
  const count = (name, by = 1) => { counts[name] = bump(counts[name], by); };
  const clock = () => typeof performance === 'undefined' ? null : Math.round((performance.timeOrigin + performance.now()) * 10) / 10;
  // Highest seq this document has observed per epoch (writes and reads), so a
  // restored older envelope is a known rewind. Memory only, bounded.
  const seen = new Map(), SEEN_EPOCHS = 16;
  // Generations this document stopped. A failed stop must not resume the same
  // persisted consent; '*' means the generation could not be read at stop time.
  const halted = new Set();
  const haltedGeneration = generation => halted.has('*') || halted.has(generation);

  // Synchronous, at domain acceptance. Disabled means one enrollment read only.
  // `profileId` (#200) pins the capture to one profile the hint lists: the profile a
  // question started with, or this document's who-is-playing choice. It never widens
  // admission: an unlisted pin refuses, and the transaction still requires the consent.
  function capture(profileId) {
    const captured = captureEnrollment(profileId);
    count(captured ? 'captured' : 'refused');
    return captured;
  }
  function captureEnrollment(pinned) {
    try {
      if (!catalogValid || deletion) return null;
      const enrollment = readEnrollment();
      if (!enrollment) return null;
      const profileId = pinned === undefined || pinned === null ? enrollment.profileId
        : uuid(pinned) && enrollment.profileIds.includes(pinned) ? pinned : null;
      if (!profileId || haltedGeneration(enrollment.generation) || !idbFactory() || !uuidAvailable()) return null;
      // A never-released localStorage outbox is preserved untouched and pauses recording.
      if (storage().getItem(LEGACY_OUTBOX_KEY) !== null) {
        lastState = 'legacy';
        return null;
      }
      return Object.freeze({
        generation: enrollment.generation,
        deviceId: enrollment.deviceId,
        profileId,
        token: stopToken,
        recordedAt: new Date().toISOString(),
      });
    } catch (error) {
      return null;
    }
  }

  const PLACEHOLDER_SEQ = 1;
  function buildEvent(captured, template, identity, profileId = captured.profileId) {
    const event = {
      schemaVersion: SCHEMA_VERSION,
      eventId: identity.eventId,
      deviceId: identity.deviceId,
      epochId: identity.epochId,
      seq: identity.seq,
      profileId,
      game: template.game,
      gameVersion: template.gameVersion,
      recordedAt: captured.recordedAt,
      kind: template.kind,
      questionInstanceId: template.questionInstanceId,
    };
    for (const key of own(FIELDS[template.game], template.kind) || []) event[key] = template[key];
    return event;
  }
  // Validates a template with placeholder identity, so nothing invalid is queued.
  function templateValid(captured, template) {
    const placeholder = { eventId: captured.generation, deviceId: captured.deviceId, epochId: captured.generation, seq: PLACEHOLDER_SEQ };
    const fields = own(FIELDS[template.game], template.kind);
    return Boolean(fields) && exactKeys(template, ['game', 'gameVersion', 'kind', 'questionInstanceId', ...fields])
      && validateEvent(buildEvent(captured, template, placeholder));
  }

  function enqueue(op) {
    queue.push(op);
    if (scheduled) return;
    scheduled = true;
    // A microtask batches one accepted action's observations into one write.
    Promise.resolve().then(() => {
      scheduled = false;
      const ops = queue;
      queue = [];
      if (ops.length) chain = chain.then(() => commitBatch(ops));
    });
  }

  const rejected = () => { count('rejected'); return false; };
  // Football: the adapter owns its in-memory question link.
  function record(captured, template) {
    try {
      if (!captured || captured.token !== stopToken || !isRecord(template) || template.game !== 'football') return rejected();
      const copy = { ...template };
      if (!templateValid(captured, copy)) return rejected();
      // The logical event's ID is generated once, here, and never regenerated.
      enqueue({ type: 'events', captured, items: [{ template: copy, eventId: newId() }] });
      count('queued');
      return true;
    } catch (error) {
      return rejected();
    }
  }

  const progressValid = value => exactKeys(value, ['nonce', 'factId', 'serial', 'misses', 'helped', 'firstCorrect', 'complete'])
    && linkKeyValid({ nonce: value.nonce, factId: value.factId, serial: value.serial }) && integer(value.misses, 0, 99)
    && typeof value.helped === 'boolean' && [null, true, false].includes(value.firstCorrect) && typeof value.complete === 'boolean';
  // Facts: the question link is resolved inside the transaction, against the fresh read.
  function recordFacts(captured, op) {
    try {
      if (!captured || captured.token !== stopToken || !isRecord(op) || !progressValid(op.before) || !progressValid(op.after)
        || op.before.complete || typeof op.durable !== 'boolean' || typeof op.adoptable !== 'boolean' || typeof op.replaced !== 'boolean'
        || !Array.isArray(op.observations) || !op.observations.length) return rejected();
      const templates = op.observations.map(observation => ({
        game: 'facts', gameVersion: op.gameVersion, kind: observation.kind, questionInstanceId: captured.generation, ...observation.fields,
      }));
      if (!templates.every(template => templateValid(captured, template))) return rejected();
      if (op.replaced !== (templates.length === 1 && templates[0].kind === 'leftUnfinished')) return rejected();
      enqueue({
        type: 'facts', captured, items: templates.map(template => ({ template, eventId: newId() })),
        before: { ...op.before }, after: { ...op.after }, durable: op.durable, adoptable: op.adoptable, replaced: op.replaced,
      });
      count('queued', templates.length);
      return true;
    } catch (error) {
      return rejected();
    }
  }

  const linkKey = value => ({ nonce: value.nonce, factId: value.factId, serial: value.serial });
  const sameKey = (a, b) => Boolean(a && b) && a.nonce === b.nonce && a.factId === b.factId && a.serial === b.serial;
  const forward = (from, to) => to.misses >= from.misses && (!from.helped || to.helped) && (from.firstCorrect === null || to.firstCorrect !== null);

  // `bind` is the parsed #200 binding record and `consent` the fresh consent. A question
  // keeps the profile it was first recorded for: this document's own link remembers it,
  // and a durable link resumed after a reload or by another tab takes it from the binding
  // record, which changes only together with `links.facts`. A resumed link without a
  // matching binding, or whose profile the consent no longer lists, records nothing (null).
  function factsTemplates(envelope, op, bind, consent) {
    const { before, after, durable } = op, links = envelope.links;
    const retired = durable && sameKey(links.factsRetired, before);
    const stored = durable && !retired && sameKey(links.facts, before) && forward(links.facts, before) ? links.facts : null;
    // A retired key is terminal: a delayed observation starts a new, unknown question.
    const mine = !retired && factsOwn && !factsOwn.closed && factsOwn.durable === durable && sameKey(factsOwn, before) ? factsOwn : null;
    const bound = bind.state === 'ok' && bind.value.facts && sameKey(bind.value.facts, before) ? bind.value.facts.profileId : null;
    let questionInstanceId = null, profileId = null;
    if (stored && (op.adoptable || mine?.questionInstanceId === stored.questionInstanceId)) {
      questionInstanceId = stored.questionInstanceId;
      if (mine?.questionInstanceId === questionInstanceId) profileId = bound === null || bound === mine.profileId ? mine.profileId : null;
      else profileId = bound;
      if (!profileId) return null;
    } else if (mine) {
      questionInstanceId = mine.questionInstanceId;
      profileId = mine.profileId;
    }
    // Only a linked attempt can be observed as left; an unlinked one stays unknown.
    if (op.replaced && !questionInstanceId) return [];
    // An unlinked question that already has accepted progress started without a recorded
    // player (a lost commit, a refused capture, or practice before enrollment). With several
    // consented profiles its first player is unknown, so it fails reporting closed rather
    // than taking whoever is chosen now. With one profile the attribution is unambiguous.
    const started = before.misses > 0 || before.helped || before.firstCorrect !== null;
    if (!questionInstanceId && started && consent.profileIds.length > 1) return null;
    if (!questionInstanceId) {
      questionInstanceId = newId();
      profileId = op.captured.profileId;
    }
    if (!consent.profileIds.includes(profileId)) return null;
    const terminal = op.replaced || op.items.some(item => item.template.kind === 'resolution');
    factsOwn = { ...linkKey(before), questionInstanceId, durable, closed: terminal, profileId };
    let binding;
    if (durable && !retired) {
      if (terminal) {
        if (sameKey(links.facts, before)) links.facts = null;
        links.factsRetired = linkKey(before);
        if (bound !== null) binding = null;
      } else if (!sameKey(links.facts, before) || forward(links.facts, after)) {
        links.facts = { questionInstanceId, ...linkKey(before), misses: after.misses, helped: after.helped, firstCorrect: after.firstCorrect };
        if (bound !== profileId) binding = { ...linkKey(before), profileId };
      }
    }
    return {
      binding,
      items: op.items.map(item => ({ template: { ...item.template, questionInstanceId }, eventId: item.eventId, profileId })),
    };
  }

  function freshEnvelope(enrollment) {
    return {
      schemaVersion: SCHEMA_VERSION,
      generation: enrollment.generation,
      status: { schemaVersion: SCHEMA_VERSION, deviceId: enrollment.deviceId, epochId: newId(), highestSeq: 0, droppedLocal: 0, writeFailures: 0 },
      events: [],
      links: { facts: null, factsRetired: null },
    };
  }
  // A new epoch for new allocations only; old events keep their IDs and seq.
  function rotate(envelope) {
    envelope.status.epochId = newId();
    envelope.status.highestSeq = 0;
  }
  function remember(status) {
    const highest = Math.max(seen.get(status.epochId) ?? 0, status.highestSeq);
    seen.delete(status.epochId);
    seen.set(status.epochId, highest);
    if (seen.size > SEEN_EPOCHS) seen.delete(seen.keys().next().value);
  }
  const rewound = status => (seen.get(status.epochId) ?? 0) > status.highestSeq;

  // Drops the oldest events until both bounds hold, counting them in the same write.
  function fit(envelope) {
    const events = envelope.events, base = envelope.status.droppedLocal;
    let dropped = Math.max(0, events.length - MAX_EVENTS);
    events.splice(0, dropped);
    for (;;) {
      envelope.status.droppedLocal = Math.min(COUNTER_MAX, base + dropped);
      const text = JSON.stringify(envelope);
      if (text.length <= MAX_CHARS || !events.length) return text;
      let excess = text.length - MAX_CHARS;
      while (excess > 0 && events.length) {
        excess -= JSON.stringify(events.shift()).length + 1;
        dropped++;
      }
    }
  }

  const supportedLayout = db => db.version === DB_VERSION && db.objectStoreNames.length === 1 && db.objectStoreNames.contains(STORE);

  // Opens the EXISTING database (at `version`, or its current version when undefined)
  // and never creates or upgrades it: any upgrade, including the version-0 upgrade of a
  // missing database, is aborted. Results: {db} or {db: null, reason}.
  // Metadata-only presence check, so a missing database is never opened at all (an
  // aborted first open still left a listed entry in Playwright WebKit). Resolves null
  // when `databases()` is unsupported or fails; the aborting open is then the fallback.
  function presence(factory) {
    if (typeof factory.databases !== 'function') return Promise.resolve(null);
    let listed;
    try { listed = factory.databases(); } catch (error) { return Promise.resolve(null); }
    return Promise.resolve(listed).then(list => {
      if (!Array.isArray(list)) return null;
      const entry = list.find(item => item && item.name === DB_NAME);
      return { exists: Boolean(entry) && entry.version !== 0, version: entry ? entry.version : 0 };
    }, () => null);
  }

  function openExisting(version) {
    const factory = idbFactory();
    if (!factory) return Promise.resolve({ db: null, reason: 'unavailable' });
    return presence(factory).then(found => {
      if (found && !found.exists) return { db: null, reason: 'missing' };
      // A newer database is classified without opening it.
      if (found && version !== undefined && found.version > version) return { db: null, reason: 'future' };
      return openRequest(factory, version);
    });
  }

  function openRequest(factory, version) {
    return new Promise(resolve => {
      let request;
      try { request = version === undefined ? factory.open(DB_NAME) : factory.open(DB_NAME, version); } catch (error) {
        resolve({ db: null, reason: 'open-failed' });
        return;
      }
      request.onupgradeneeded = () => { try { request.transaction.abort(); } catch (error) { /* the open then fails */ } };
      request.onsuccess = () => resolve({ db: request.result });
      request.onerror = event => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        const name = request.error && request.error.name;
        resolve({ db: null, reason: name === 'AbortError' ? 'missing' : name === 'VersionError' ? 'future' : 'open-failed' });
      };
      // Another connection holds an upgrade or deletion: the request stays queued. Nothing in play awaits it.
      request.onblocked = () => { lastState = 'open-blocked'; };
    });
  }

  function closeConnection() {
    if (liveDb) liveDb.close();
    liveDb = null;
    connection = null;
  }

  // This document's cached version-1 connection. A future version or unsupported layout
  // closes and pauses; a version change (another document deleting) closes it at once.
  function database() {
    if (!connection) {
      connection = openExisting(DB_VERSION).then(result => {
        if (!result.db) {
          connection = null;
          return result;
        }
        const db = result.db;
        if (!supportedLayout(db)) {
          db.close();
          connection = null;
          return { db: null, reason: 'future' };
        }
        db.onversionchange = () => {
          db.close();
          if (liveDb === db) { liveDb = null; connection = null; }
          lastState = 'versionchange';
        };
        db.onclose = () => { if (liveDb === db) { liveDb = null; connection = null; } };
        liveDb = db;
        return { db };
      });
    }
    return connection;
  }

  // One transaction over every owned record. `decide(records)` gets the raw values keyed
  // by record name and runs synchronously in the last read's success handler (no await
  // inside the live transaction). It may return {put} for the outbox and {writes} for the
  // other records (a null value deletes). Only oncomplete counts as committed; an abort
  // rolls back every request in it.
  function transact(mode, decide) {
    return database().then(({ db, reason }) => {
      if (!db) return { complete: false, reason };
      return new Promise(resolve => {
        let tx, decision = null;
        try { tx = db.transaction(STORE, mode); } catch (error) {
          resolve({ complete: false, reason: 'transaction-failed' });
          return;
        }
        const store = tx.objectStore(STORE);
        const reads = RECORDS.map(key => store.get(key));
        reads[reads.length - 1].onsuccess = () => {
          try {
            decision = decide(Object.fromEntries(RECORDS.map((key, index) => [key, reads[index].result])));
            if (decision && decision.put !== undefined) store.put(decision.put, OUTBOX_RECORD);
            for (const [key, value] of Object.entries(decision?.writes || {})) {
              if (!RECORDS.includes(key) || (key === OUTBOX_RECORD && value !== null)) throw new TypeError('Not an owned record');
              if (value === null) store.delete(key);
              else store.put(value, key);
            }
          } catch (error) {
            try { tx.abort(); } catch (abortError) { /* already finishing */ }
          }
        };
        tx.oncomplete = () => resolve({ complete: true, decision: decision || {} });
        tx.onabort = () => resolve({ complete: false, reason: 'aborted' });
      });
    }, () => ({ complete: false, reason: 'open-failed' }));
  }

  // Pure decision for one batch against the freshly read records (inside the transaction).
  function plan(records, ops, failures) {
    const consentRaw = records[CONSENT_RECORD], outboxRaw = records[OUTBOX_RECORD];
    const consentRead = parseConsent(consentRaw);
    // Without current authoritative consent a stale hint can never record or bootstrap.
    if (consentRead.state !== 'ok') return { state: consentRead.state === 'missing' ? 'no-consent' : consentRead.state, dropped: ops.length };
    const consent = consentRead.consent;
    if (haltedGeneration(consent.generation)) return { state: 'stopped', dropped: ops.length };
    const valid = ops.filter(op => op.captured.generation === consent.generation && op.captured.deviceId === consent.deviceId
      && consent.profileIds.includes(op.captured.profileId));
    const dropped = ops.length - valid.length;
    if (!valid.length) return { state: 'revoked', dropped };
    const read = classify(outboxRaw);
    if (read.state === 'future' || read.state === 'malformed') return { state: read.state, dropped };
    let envelope = read.state === 'ok' ? read.envelope : null;
    if (envelope && (envelope.generation !== consent.generation || envelope.status.deviceId !== consent.deviceId)) return { state: 'foreign', dropped };
    const existed = Boolean(envelope);
    // What this transaction's read saw, for the bounded commit trace.
    const readStatus = existed ? { epochId: envelope.status.epochId, highestSeq: envelope.status.highestSeq } : null;
    if (!envelope) envelope = freshEnvelope(consent);
    else if (rewound(envelope.status)) rotate(envelope);
    const firstSeq = envelope.status.highestSeq + 1;
    const ids = new Set(envelope.events.map(event => event.eventId)), eventIds = [];
    let bind = parseRecord(records[BINDING_RECORD], validateBinding, consent.generation), bindingRaw;
    let unbound = 0;
    for (const op of valid) {
      let items = op.items;
      if (op.type === 'facts') {
        const resolved = factsTemplates(envelope, op, bind, consent);
        // Unknown or conflicting binding: this question fails reporting closed, play is unaffected.
        if (resolved === null) { unbound++; continue; }
        if (Array.isArray(resolved)) continue;
        items = resolved.items;
        // The binding changes only with links.facts, and only where it is ours to write.
        if (resolved.binding !== undefined && (bind.state === 'ok' || bind.state === 'missing')) {
          bind = { state: 'ok', value: { ...(bind.state === 'ok' ? bind.value : { schemaVersion: 1, generation: consent.generation }), facts: resolved.binding } };
          bindingRaw = JSON.stringify(bind.value);
        }
      }
      for (const { template, eventId, profileId } of items) {
        // Idempotent: a logical event already stored is never stored twice.
        if (ids.has(eventId)) continue;
        if (envelope.status.highestSeq >= COUNTER_MAX) rotate(envelope);
        const event = buildEvent(op.captured, template, {
          eventId, deviceId: consent.deviceId, epochId: envelope.status.epochId, seq: envelope.status.highestSeq + 1,
        }, profileId);
        if (!validateEvent(event)) continue;
        envelope.status.highestSeq = event.seq;
        envelope.events.push(event);
        ids.add(eventId);
        eventIds.push(eventId);
      }
    }
    envelope.status.writeFailures = bump(envelope.status.writeFailures, failures);
    const text = fit(envelope);
    // Nothing to record (for example an unlinked replacement): never create or rewrite.
    if (bindingRaw === undefined
      && (existed ? text === outboxRaw : !envelope.events.length && !failures && !envelope.links.facts && !envelope.links.factsRetired)) {
      return { state: unbound ? 'unbound' : 'unchanged', dropped: dropped + unbound };
    }
    if (text.length > MAX_CHARS) throw new RangeError('Outbox envelope exceeds its bound');
    const writes = bindingRaw === undefined ? undefined : { [BINDING_RECORD]: bindingRaw };
    return { state: 'recorded', put: text, writes, dropped: dropped + unbound, status: { ...envelope.status }, read: readStatus, firstSeq, eventIds };
  }

  // Not-committed outcomes that are pauses or refusals, not write failures.
  const NOT_FAILURES = ['missing', 'future', 'unavailable'];

  function commitBatch(ops) {
    const live = ops.filter(op => op.captured.token === stopToken);
    count('dropped', ops.length - live.length);
    if (!live.length) {
      lastState = 'stopped';
      return undefined;
    }
    const failures = pendingFailures;
    // The trace window runs from this transaction's read to its oncomplete.
    return transact('readwrite', records => {
      const readAt = clock();
      return { ...plan(records, live, failures), readAt };
    }).then(result => {
      if (result.complete) {
        const decision = result.decision;
        count('dropped', decision.dropped || 0);
        lastState = decision.state;
        if (decision.put === undefined) return undefined;
        pendingFailures = Math.max(0, pendingFailures - failures);
        remember(decision.status);
        count('stored', decision.eventIds.length);
        commits.push({ read: decision.read, epochId: decision.status.epochId, firstSeq: decision.firstSeq,
          lastSeq: decision.status.highestSeq, eventIds: decision.eventIds, start: decision.readAt, end: clock() });
        if (commits.length > 8) commits.shift();
        return undefined;
      }
      if (NOT_FAILURES.includes(result.reason)) {
        // No database means no consent; a future database pauses. Nothing is created.
        count('dropped', live.length);
        lastState = result.reason === 'missing' ? 'no-consent' : result.reason;
        return undefined;
      }
      // Nothing of the batch survived (events and seq roll back together). Count it.
      pendingFailures = bump(pendingFailures);
      lastState = 'failed';
      return result.reason === 'aborted' ? countFailure() : undefined;
    });
  }

  // One separate status-only transaction after an abort: it never advances seq, needs a
  // current consent and supported envelope, and counts only on oncomplete.
  function countFailure() {
    const failures = pendingFailures;
    return transact('readwrite', records => {
      const consent = parseConsent(records[CONSENT_RECORD]), read = classify(records[OUTBOX_RECORD]);
      if (consent.state !== 'ok' || read.state !== 'ok' || haltedGeneration(consent.consent.generation)
        || read.envelope.generation !== consent.consent.generation) return {};
      read.envelope.status.writeFailures = bump(read.envelope.status.writeFailures, failures);
      const text = JSON.stringify(read.envelope);
      return text.length <= MAX_CHARS ? { put: text, status: { ...read.envelope.status } } : {};
    }).then(result => {
      if (result.complete && result.decision.put !== undefined) {
        pendingFailures = Math.max(0, pendingFailures - failures);
        remember(result.decision.status);
      }
    });
  }

  // Transactional maintenance for #200 (acknowledge, reject-deleted, new epoch, sync results).
  // With `expected` ({generation, deviceId, token}), the fresh consent and the stored
  // credential must still be exactly the enrollment the caller used, inside this same
  // transaction; otherwise nothing changes ('superseded'). A delayed response can therefore
  // never touch a later enrollment.
  function maintain(update, expected = null) {
    if (!idbFactory()) return Promise.resolve({ ok: false, reason: 'unavailable' });
    if (deletion) return Promise.resolve({ ok: false, reason: 'stopping' });
    const token = stopToken;
    const job = chain.then(() => {
      if (token !== stopToken) return { ok: false, reason: 'stopped' };
      const failures = pendingFailures;
      return transact('readwrite', records => {
        const consent = parseConsent(records[CONSENT_RECORD]);
        if (consent.state !== 'ok') return { result: { ok: false, reason: consent.state === 'missing' ? 'no-consent' : consent.state } };
        if (haltedGeneration(consent.consent.generation)) return { result: { ok: false, reason: 'stopped' } };
        let sync = null;
        if (expected) {
          const credential = parseRecord(records[CREDENTIAL_RECORD], validateCredential, consent.consent.generation);
          if (consent.consent.generation !== expected.generation || consent.consent.deviceId !== expected.deviceId
            || credential.state !== 'ok' || credential.value.token !== expected.token || credential.value.deviceId !== expected.deviceId) {
            return { result: { ok: false, reason: 'superseded' } };
          }
          const syncRead = parseRecord(records[SYNC_RECORD], validateSyncRecord, consent.consent.generation);
          if (syncRead.state !== 'ok' && syncRead.state !== 'missing') return { result: { ok: false, reason: `sync-${syncRead.state}` } };
          sync = syncRead.state === 'ok' ? syncRead.value : freshSync(consent.consent.generation);
        }
        const read = classify(records[OUTBOX_RECORD]);
        if (read.state !== 'ok') return { result: { ok: false, reason: read.state } };
        const envelope = read.envelope;
        if (envelope.generation !== consent.consent.generation || envelope.status.deviceId !== consent.consent.deviceId) {
          return { result: { ok: false, reason: 'foreign' } };
        }
        remember(envelope.status);
        const before = sync && JSON.stringify(sync);
        const outcome = update(envelope, sync);
        const writes = sync && JSON.stringify(sync) !== before ? { [SYNC_RECORD]: JSON.stringify(sync) } : undefined;
        if (!outcome.changed) return { writes, result: { ok: true, ...outcome.value } };
        envelope.status.writeFailures = bump(envelope.status.writeFailures, failures);
        const text = JSON.stringify(envelope);
        if (text.length > MAX_CHARS) throw new RangeError('Outbox envelope exceeds its bound');
        return { put: text, writes, status: { ...envelope.status }, result: { ok: true, ...outcome.value } };
      }).then(result => {
        if (!result.complete) {
          if (!NOT_FAILURES.includes(result.reason)) pendingFailures = bump(pendingFailures);
          return { ok: false, reason: result.reason === 'missing' ? 'no-consent' : result.reason === 'aborted' ? 'write-failed' : result.reason };
        }
        const decision = result.decision;
        if (decision.put !== undefined) {
          pendingFailures = Math.max(0, pendingFailures - failures);
          remember(decision.status);
        }
        return decision.result;
      });
    });
    chain = job.then(() => undefined, () => undefined);
    return job;
  }

  const idList = ids => Array.isArray(ids) && ids.length <= MAX_IDS && ids.every(uuid);
  function removeEvents(ids) {
    if (!idList(ids)) return Promise.resolve({ ok: false, reason: 'invalid-ids' });
    const remove = new Set(ids);
    return maintain(envelope => {
      const kept = envelope.events.filter(event => !remove.has(event.eventId));
      const removed = envelope.events.length - kept.length;
      envelope.events = kept;
      return { changed: removed > 0, value: { removed } };
    });
  }
  function startNewEpoch(reason) {
    if (reason !== 'seq-conflict' && reason !== 'rewind') return Promise.resolve({ ok: false, reason: 'invalid-reason' });
    return maintain(envelope => {
      rotate(envelope);
      return { changed: true, value: { epochId: envelope.status.epochId } };
    });
  }

  // ---- #200 sync maintenance. Every call names the enrollment it acted for. ----
  const expectedValid = value => exactKeys(value, ['generation', 'deviceId', 'token']) && uuid(value.generation)
    && uuid(value.deviceId) && typeof value.token === 'string' && TOKEN.test(value.token);
  const uniqueIds = (ids, max) => idList(ids) && ids.length <= max && new Set(ids).size === ids.length;

  // Applies one validated server response in one transaction: removes only submitted IDs the
  // server acknowledged or reported deleted, keeps every other event (suppressing the ones
  // the server refused, in a bounded list pruned to events still queued), rotates the epoch
  // at most once and only while it is still the conflicting one, and records sync health.
  function applySync(expected, outcome) {
    if (!expectedValid(expected) || !exactKeys(outcome, ['submitted', 'remove', 'suppress', 'rotateEpoch', 'syncedAt', 'notice'])
      || !uniqueIds(outcome.submitted, MAX_SYNC_IDS) || !uniqueIds(outcome.remove, MAX_SYNC_IDS) || !Array.isArray(outcome.suppress)
      || !(outcome.rotateEpoch === null || uuid(outcome.rotateEpoch)) || !(outcome.syncedAt === null || isoTime(outcome.syncedAt))
      || !(outcome.notice === null || NOTICES.includes(outcome.notice))) return Promise.resolve({ ok: false, reason: 'invalid-outcome' });
    const submitted = new Set(outcome.submitted), remove = new Set(outcome.remove);
    if (!outcome.remove.every(id => submitted.has(id))
      || !outcome.suppress.every(item => exactKeys(item, ['eventId', 'reason']) && submitted.has(item.eventId)
        && !remove.has(item.eventId) && SUPPRESS_REASONS.includes(item.reason))
      || new Set(outcome.suppress.map(item => item.eventId)).size !== outcome.suppress.length) {
      return Promise.resolve({ ok: false, reason: 'invalid-outcome' });
    }
    const suppress = outcome.suppress.map(item => ({ eventId: item.eventId, reason: item.reason }));
    return maintain((envelope, sync) => {
      const kept = envelope.events.filter(event => !remove.has(event.eventId));
      const removed = envelope.events.length - kept.length;
      envelope.events = kept;
      const present = new Set(kept.map(event => event.eventId));
      const suppressed = sync.suppressed.filter(item => present.has(item.eventId));
      const known = new Set(suppressed.map(item => item.eventId));
      for (const item of suppress) if (present.has(item.eventId) && !known.has(item.eventId)) suppressed.push(item);
      sync.suppressed = suppressed.slice(-MAX_SUPPRESSED);
      const rotated = outcome.rotateEpoch !== null && envelope.status.epochId === outcome.rotateEpoch;
      if (rotated) rotate(envelope);
      if (outcome.syncedAt !== null) sync.lastSuccessAt = outcome.syncedAt;
      sync.notice = outcome.notice;
      return { changed: removed > 0 || rotated, value: { removed, suppressed: sync.suppressed.length, rotated } };
    }, expected);
  }

  // Automatic Stop after a server-proven revocation. Capture for that generation halts at
  // once; then one transaction deletes every owned record only if the consent and credential
  // are still that enrollment. A later enrollment is never touched ('superseded').
  function stopGeneration(expected) {
    if (!expectedValid(expected)) return Promise.resolve({ ok: false, reason: 'invalid' });
    const wasHalted = halted.has(expected.generation);
    halted.add(expected.generation);
    if (deletion) return Promise.resolve({ ok: false, reason: 'pending', pending: true });
    if (!idbFactory()) return Promise.resolve({ ok: false, reason: 'unavailable' });
    const job = chain.then(() => transact('readwrite', records => {
      const consent = parseConsent(records[CONSENT_RECORD]);
      const same = consent.state === 'ok' && consent.consent.generation === expected.generation && consent.consent.deviceId === expected.deviceId;
      const credential = same ? parseRecord(records[CREDENTIAL_RECORD], validateCredential, expected.generation) : null;
      if (!same || credential.state !== 'ok' || credential.value.token !== expected.token) return { same, outcome: 'superseded' };
      return { writes: Object.fromEntries(RECORDS.map(key => [key, null])), outcome: 'stopped' };
    })).then(result => {
      if (!result.complete) return { ok: false, reason: result.reason === 'missing' ? 'no-consent' : result.reason };
      if (result.decision.outcome !== 'stopped') {
        if (result.decision.same && !wasHalted) halted.delete(expected.generation);
        return { ok: false, reason: 'superseded' };
      }
      factsOwn = null;
      pendingFailures = 0;
      lastState = 'stopped';
      try {
        if (readEnrollment()?.generation === expected.generation) storage().removeItem(ENROLLMENT_KEY);
        return { ok: true };
      } catch (error) {
        return { ok: true, hintRemoved: false };
      }
    }, () => ({ ok: false, reason: 'stop-failed' }));
    chain = job.then(() => undefined, () => undefined);
    return job;
  }

  // Read-only view for #200's sync: the snapshot coherence rules plus the credential and
  // sync records of the same consent, from one readonly transaction. A consent without a
  // credential (the #199 test fixtures) is 'no-credential' and never uploads.
  function syncView() {
    let hint;
    try { hint = readEnrollment(); } catch (error) { return Promise.resolve({ state: 'unavailable' }); }
    if (!hint) return Promise.resolve({ state: 'disabled' });
    return snapshotWith((records, consent) => {
      const credential = parseRecord(records[CREDENTIAL_RECORD], validateCredential, consent.generation);
      if (credential.state !== 'ok') return { state: credential.state === 'missing' ? 'no-credential' : `credential-${credential.state}` };
      if (credential.value.deviceId !== consent.deviceId) return { state: 'credential-foreign' };
      const sync = parseRecord(records[SYNC_RECORD], validateSyncRecord, consent.generation);
      if (sync.state !== 'ok' && sync.state !== 'missing') return { state: `sync-${sync.state}` };
      return {
        generation: consent.generation, deviceId: consent.deviceId, profileIds: [...consent.profileIds],
        serviceOrigin: credential.value.serviceOrigin, token: credential.value.token,
        sync: sync.state === 'ok' ? clone(sync.value) : freshSync(consent.generation),
      };
    }, { allowMissingOutbox: true });
  }

  // Explicit stop: the one intentional deletion path, including future-schema bytes.
  function stop() {
    stopToken++;
    queue = [];
    factsOwn = null;
    // Halt the current consent in memory first, so a failed removal never resumes it.
    try {
      const enrollment = readEnrollment();
      if (enrollment) halted.add(enrollment.generation);
      else if (storage().getItem(ENROLLMENT_KEY) !== null) halted.add('*');
    } catch (error) {
      halted.add('*');
    }
    // A deletion request is still live (blocked): it cannot be cancelled, so report it honestly.
    if (deletion) return Promise.resolve({ ok: false, reason: 'pending', pending: true });
    const factory = idbFactory();
    if (!factory) return Promise.resolve(removeHints({ ok: false, reason: 'unavailable' }));
    // After this document's in-flight transaction (queued items already drop by token),
    // close its handle so it never blocks its own deletion, then probe the existing
    // database without a version (a missing one is never created).
    const job = chain.then(() => {
      closeConnection();
      return openExisting(undefined);
    }).then(({ db, reason }) => {
      if (!db) return reason === 'missing' ? removeHints({ ok: true }) : { ok: false, reason };
      // A future version or unsupported layout is opaque owned data: delete the database.
      if (!supportedLayout(db)) {
        db.close();
        return deleteOwned(factory);
      }
      return new Promise(resolve => {
        let tx;
        try { tx = db.transaction(STORE, 'readwrite'); } catch (error) {
          db.close();
          resolve({ ok: false, reason: 'transaction-failed' });
          return;
        }
        const store = tx.objectStore(STORE);
        // Every owned record goes together, unparsed; success means oncomplete only.
        for (const key of RECORDS) store.delete(key);
        tx.oncomplete = () => { db.close(); resolve(removeHints({ ok: true })); };
        tx.onabort = () => { db.close(); resolve({ ok: false, reason: 'delete-failed' }); };
      });
    }).then(result => {
      if (result.ok) {
        // All owned state is gone: any later enrollment is a genuinely new consent.
        halted.delete('*');
        pendingFailures = 0;
        lastState = 'stopped';
      }
      return result;
    }, () => ({ ok: false, reason: 'stop-failed' }));
    chain = job.then(() => undefined, () => undefined);
    return job;
  }

  // Removes the owned localStorage hint and legacy outbox key, after the authority is gone.
  function removeHints(result) {
    try {
      storage().removeItem(ENROLLMENT_KEY);
      storage().removeItem(LEGACY_OUTBOX_KEY);
      return result;
    } catch (error) {
      return { ...result, hintRemoved: false };
    }
  }

  // Explicit deletion of an opaque (future or unsupported) owned database. onblocked is
  // pending, not success: the request stays live and settles later; nothing recreates it.
  function deleteOwned(factory) {
    return new Promise(resolve => {
      let request;
      try { request = factory.deleteDatabase(DB_NAME); } catch (error) {
        resolve({ ok: false, reason: 'delete-failed' });
        return;
      }
      deletion = request;
      lastState = 'stopping';
      request.onsuccess = () => {
        if (deletion === request) deletion = null;
        // The same cleanup as an ordinary successful Stop, even when this settles long after
        // the first result reported `blocked`.
        halted.delete('*');
        pendingFailures = 0;
        lastState = 'stopped';
        resolve(removeHints({ ok: true }));
      };
      request.onerror = event => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (deletion === request) deletion = null;
        lastState = 'stop-failed';
        resolve({ ok: false, reason: 'delete-failed' });
      };
      request.onblocked = () => resolve({ ok: false, reason: 'blocked', pending: true });
    });
  }

  // Read-only, consistent view for #200's sync envelope, from one readonly transaction.
  // Never creates, writes or repairs.
  // The same coherence rules as the mutation path: a stale hint, another generation's
  // envelope or a legacy localStorage outbox never yields an `ok` view to upload.
  function snapshot() {
    return snapshotWith(null);
  }
  // `extra(records, consent)` adds #200 fields to an otherwise ok view (or replaces it with a
  // non-ok state); `allowMissingOutbox` reports a not-yet-written outbox as `envelope: null`.
  function snapshotWith(extra, { allowMissingOutbox = false } = {}) {
    let hint, legacy;
    try {
      hint = readEnrollment();
      legacy = hint ? storage().getItem(LEGACY_OUTBOX_KEY) !== null : false;
    } catch (error) {
      return Promise.resolve({ state: 'unavailable' });
    }
    if (!hint) return Promise.resolve({ state: 'disabled' });
    if (deletion) return Promise.resolve({ state: 'stopping' });
    if (haltedGeneration(hint.generation)) return Promise.resolve({ state: 'stopped' });
    if (legacy) return Promise.resolve({ state: 'legacy' });
    if (!idbFactory()) return Promise.resolve({ state: 'unavailable' });
    return transact('readonly', records => {
      const consent = parseConsent(records[CONSENT_RECORD]);
      if (consent.state !== 'ok') return { view: { state: consent.state === 'missing' ? 'no-consent' : consent.state } };
      const { generation, deviceId } = consent.consent;
      if (haltedGeneration(generation)) return { view: { state: 'stopped' } };
      if (hint.generation !== generation || hint.deviceId !== deviceId) return { view: { state: 'revoked' } };
      const read = classify(records[OUTBOX_RECORD]);
      if (read.state !== 'ok' && !(allowMissingOutbox && read.state === 'missing')) return { view: { state: read.state } };
      if (read.state === 'ok' && (read.envelope.generation !== generation || read.envelope.status.deviceId !== deviceId)) return { view: { state: 'foreign' } };
      // Reading is not writing, but an observed seq still makes a later rewind known.
      if (read.state === 'ok') remember(read.envelope.status);
      const view = { state: 'ok', envelope: read.state === 'ok' ? clone(read.envelope) : null };
      if (!extra) return { view };
      const added = extra(records, consent.consent);
      return { view: added.state ? added : { ...view, ...added } };
    }).then(result => result.complete ? result.decision.view : { state: result.reason === 'missing' ? 'no-consent' : result.reason });
  }

  globalThis.LEARNING_OUTBOX = Object.freeze({
    SCHEMA_VERSION, DB_NAME, DB_VERSION, STORE, CONSENT_RECORD, OUTBOX_RECORD, ENROLLMENT_KEY, LEGACY_OUTBOX_KEY,
    CREDENTIAL_RECORD, SYNC_RECORD, BINDING_RECORD, MAX_SYNC_IDS,
    MAX_EVENTS, MAX_CHARS, CATALOG, FIELDS,
    validateCatalog, validateEvent, validateStatus, validateEnvelope,
    validateCredential, validateSyncRecord, validateBinding, serviceOriginValid,
    capture, newId, record, recordFacts,
    acknowledge: removeEvents, rejectDeleted: removeEvents, startNewEpoch, stop, snapshot,
    applySync, stopGeneration, syncView,
    // #200 must not install a new enrollment while a Stop deletion is still pending.
    deletionPending: () => Boolean(deletion),
    // Settles after every queued write in this document; tests and #200 may await it.
    idle: () => new Promise(resolve => { Promise.resolve().then(() => chain.then(resolve, resolve)); }),
    diagnostics: () => ({ state: lastState, pendingWriteFailures: pendingFailures, counts: { ...counts }, commits: commits.map(commit => ({ ...commit })) }),
  });
})();
