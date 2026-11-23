// Learning-reports subview inside Football's Options modal (#ov-options).
// Plain global FOOTBALL_REPORTING_PANEL, loaded after shared/learning-sync.js and
// before football.js, which owns the Options modal, pause and Resume.
//
// Lazy: nothing here reads storage, opens IndexedDB, sends a request or sets a
// timer until a grown-up opens the subview. It only calls the current
// LEARNING_SYNC APIs (health, partialEnrollment, enroll, finishEnrollment,
// syncNow, players, buildPlayerPicker); those remain the authority and
// re-verify on submit. It never stops, resets or deletes reporting data, never
// reads raw records, and keeps only non-secret view fields. The code is read
// from the input at submit time and is never stored, logged or rendered.
//
// Fail-closed state allowlist:
//   configured + health 'disabled' + partial 'none' -> one-time code form
//   configured + health 'disabled' + verified partial (origin matches) -> Finish only
//   health 'ok' -> connected status; Send now only when the origin matches
//   anything else (not configured, no-consent, no-credential, credential-*,
//   sync-*, unavailable, unknown or future states) -> read-only, data unchanged
const FOOTBALL_REPORTING_PANEL = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ASK = 'Ask the grown-up who set up reports.';
  const COPY = Object.freeze({
    loading: 'Checking this game’s reporting…',
    form: 'This game is not connected to learning reports. Nothing is recorded or sent.',
    finish: 'This game is partly connected: the final setting was not saved, so practice is not recorded yet.',
    notConfigured: 'Learning reports are not set up in this version of the game.',
    unavailable: `This browser cannot keep reporting data here, so this game cannot be connected. Any waiting practice is kept. ${ASK}`,
    paused: `This game’s reporting is paused. Any waiting practice is kept. ${ASK}`,
    connected: 'Connected. Practice is sent automatically while the game is open. Practice from now on is reported; earlier practice stays on this device.',
    originChanged: 'Connected, but sending is paused because this game’s report setting changed. Any waiting practice is kept.',
    notRecognized: `The report service did not recognize this game. Waiting practice is kept. ${ASK}`,
    unsupported: 'The report service does not accept this game version yet. Waiting practice is kept.',
  });
  // Curated outcomes. None of them recommends Stop: the game has no Stop control.
  const ERRORS = Object.freeze({
    'code-format': 'That code is not complete. Codes have 26 letters and numbers.',
    'invalid-code': 'That code did not work. It may have expired or already been used. Ask for a new code.',
    timeout: 'The report service did not answer in time. Check the internet connection and try again.',
    network: 'The report service could not be reached. Check the internet connection and try again.',
    service: 'The report service could not connect this game right now. Try again later.',
    'not-configured': COPY.notConfigured,
  });
  const FALLBACK_ERROR = `This game could not be connected here. Any waiting practice is kept. ${ASK}`;

  let bound = false;
  let open = false;
  // Bumped whenever the subview opens or closes: stale async results update no UI.
  let revision = 0;
  // 'connect' | 'finish' | 'send' | null. Survives close and reopen, so a submitted
  // operation is never repeated; it is never cancelled or restarted by the UI.
  let inFlight = null;
  let view = null;
  let picker = null;
  let hooks = { onConnectionChange() {}, onPlayerChange() {} };

  const sync = () => (typeof LEARNING_SYNC === 'undefined' ? null : LEARNING_SYNC);
  const overlay = () => $('ov-options');
  const setText = (id, text) => { const element = $(id); if (element) element.textContent = text; };
  const show = (id, visible) => { const element = $(id); if (element) element.hidden = !visible; };
  const when = iso => {
    if (!iso) return 'Not yet';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Not yet';
    return `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  };
  const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

  function configure(next = {}) {
    hooks = {
      onConnectionChange: typeof next.onConnectionChange === 'function' ? next.onConnectionChange : hooks.onConnectionChange,
      onPlayerChange: typeof next.onPlayerChange === 'function' ? next.onPlayerChange : hooks.onPlayerChange,
    };
  }

  function bind() {
    if (bound) return;
    bound = true;
    $('ov-report-form')?.addEventListener('submit', submitCode);
    $('ov-report-finish-btn')?.addEventListener('click', finish);
    $('ov-report-send')?.addEventListener('click', sendNow);
    // A normal return to the page while the subview is open rereads local health.
    document.addEventListener('visibilitychange', () => {
      if (open && document.visibilityState === 'visible' && !inFlight) render();
    });
  }

  // Read-only classification from the current APIs. Only non-secret fields leave here.
  async function readView() {
    const S = sync();
    if (!S || typeof S.health !== 'function') return { kind: 'readonly', copy: COPY.unavailable };
    if (!S.serviceOrigin()) return { kind: 'readonly', copy: COPY.notConfigured };
    const health = await S.health();
    if (health?.state === 'ok') {
      return { kind: 'connected', profiles: count(health.profiles), waiting: count(health.waiting), held: count(health.held),
        lastSuccessAt: typeof health.lastSuccessAt === 'string' ? health.lastSuccessAt : null,
        notice: typeof health.notice === 'string' ? health.notice : null,
        droppedLocal: count(health.droppedLocal), writeFailures: count(health.writeFailures),
        originMatches: health.originMatches === true };
    }
    if (health?.state === 'disabled') {
      const partial = await S.partialEnrollment();
      if (partial?.state === 'none') return { kind: 'form' };
      if (partial?.state === 'partial' && partial.originMatches === true) return { kind: 'finish' };
      return { kind: 'readonly', copy: COPY.paused };
    }
    if (health?.state === 'unavailable') return { kind: 'readonly', copy: COPY.unavailable };
    return { kind: 'readonly', copy: COPY.paused };
  }

  async function render() {
    const current = revision;
    let next;
    try { next = await readView(); } catch (error) { next = { kind: 'readonly', copy: COPY.paused }; }
    if (current !== revision || !open) return null;
    view = next;
    paint();
    return view;
  }

  function summaryFor(next) {
    if (!next) return COPY.loading;
    if (next.kind === 'form') return COPY.form;
    if (next.kind === 'finish') return COPY.finish;
    if (next.kind === 'connected') {
      if (!next.originMatches) return COPY.originChanged;
      if (next.notice === 'credential-not-recognized') return COPY.notRecognized;
      if (next.notice === 'unsupported-version') return COPY.unsupported;
      return COPY.connected;
    }
    return next.copy || COPY.paused;
  }

  function paint() {
    const root = $('ov-report');
    if (!root) return;
    const kind = view?.kind || 'loading';
    root.dataset.state = kind;
    setText('ov-report-summary', summaryFor(view));
    show('ov-report-form', kind === 'form');
    show('ov-report-finish', kind === 'finish');
    show('ov-report-health', kind === 'connected');
    show('ov-report-send-row', kind === 'connected' && view.originMatches);
    const connect = $('ov-report-connect');
    if (connect) {
      connect.disabled = Boolean(inFlight);
      connect.textContent = inFlight === 'connect' ? 'Connecting…' : 'Connect this game';
    }
    const finishButton = $('ov-report-finish-btn');
    if (finishButton) finishButton.disabled = Boolean(inFlight);
    const send = $('ov-report-send');
    if (send) {
      send.disabled = Boolean(inFlight);
      send.textContent = inFlight === 'send' ? 'Sending…' : 'Send now';
    }
    if (kind === 'connected') {
      const roster = sync()?.players();
      setText('ov-report-players', roster ? roster.list.map(item => item.label).join(', ') : `${view.profiles}`);
      setText('ov-report-last', when(view.lastSuccessAt));
      setText('ov-report-waiting', `${view.waiting} practice event${view.waiting === 1 ? '' : 's'}`);
      setText('ov-report-held', view.held ? `${view.held} kept here because the service did not accept them` : 'None');
      setText('ov-report-lost', view.droppedLocal || view.writeFailures
        ? `${view.droppedLocal} removed to make room, ${view.writeFailures} not saved` : 'None reported');
    }
    renderPicker(kind === 'connected');
  }

  // The existing neutral picker, in this subview with its own id and radio group.
  // One profile needs no choice, so the helper returns nothing.
  function renderPicker(visible) {
    const host = $('ov-report-picker-host');
    if (!host) return;
    host.replaceChildren();
    picker = null;
    const S = sync();
    if (!visible || !S || typeof S.buildPlayerPicker !== 'function') return;
    picker = S.buildPlayerPicker({
      id: 'ov-report-player-picker', legend: 'Who’s playing?', fieldsetClass: 'ov-report-picker',
      optionsClass: 'ov-report-picker-options', optionClass: 'ov-report-picker-option', statusClass: 'ov-report-note',
      status: chosen => chosen ? 'New questions are reported for this player.' : 'Choose who is playing so practice is reported for the right player.',
      onChoose: () => hooks.onPlayerChange(),
    });
    if (picker) host.append(picker.element);
  }

  function refreshPicker() {
    if (picker) picker.refresh();
  }

  function clearTransient() {
    const input = $('ov-report-code');
    if (input) input.value = '';
    for (const id of ['ov-report-form-status', 'ov-report-finish-status', 'ov-report-send-status', 'ov-report-status']) setText(id, '');
  }

  function openPanel() {
    const root = overlay();
    if (!root || !$('ov-report')) return false;
    bind();
    open = true;
    revision++;
    view = null;
    root.dataset.view = 'report';
    clearTransient();
    paint();
    if (inFlight === 'connect') setText('ov-report-status', 'Still connecting this game…');
    requestAnimationFrame(() => {
      const back = $('ov-report-back');
      if (open && back) back.focus({ preventScroll: true });
    });
    render();
    return true;
  }

  // Explicit Back, Resume or Done, or a fresh Options entry: back to the options
  // view, with the typed code and status lines cleared. An operation in flight
  // keeps running; its result just updates no stale UI.
  function closePanel() {
    const root = overlay();
    const wasOpen = open;
    open = false;
    revision++;
    view = null;
    if (root) root.dataset.view = 'options';
    clearTransient();
    renderPicker(false);
    return wasOpen;
  }

  function current(started) {
    return open && started === revision;
  }

  async function submitCode(event) {
    event.preventDefault();
    const S = sync();
    if (inFlight || !open || view?.kind !== 'form' || !S) return;
    const input = $('ov-report-code');
    const started = revision;
    inFlight = 'connect';
    setText('ov-report-form-status', '');
    setText('ov-report-status', '');
    paint();
    let result;
    try { result = await S.enroll(input ? input.value : ''); } catch (error) { result = { ok: false, reason: 'service' }; }
    inFlight = null;
    if (result?.ok && input) input.value = '';
    try { hooks.onConnectionChange(); } catch (error) { /* reporting never participates in play */ }
    if (!open) return;
    const fresh = current(started);
    await render();
    if (!fresh || !current(started)) return;
    if (result?.ok) setText('ov-report-status', 'Connected. Practice from now on is reported.');
    else setText('ov-report-form-status', ERRORS[result?.reason] ?? FALLBACK_ERROR);
  }

  async function finish() {
    const S = sync();
    if (inFlight || !open || view?.kind !== 'finish' || !S) return;
    const started = revision;
    inFlight = 'finish';
    setText('ov-report-finish-status', 'Finishing…');
    paint();
    let result;
    try { result = await S.finishEnrollment(); } catch (error) { result = { ok: false, reason: 'service' }; }
    inFlight = null;
    try { hooks.onConnectionChange(); } catch (error) { /* reporting never participates in play */ }
    if (!open) return;
    const fresh = current(started);
    await render();
    if (!fresh || !current(started)) return;
    setText('ov-report-finish-status', '');
    setText('ov-report-status', result?.ok ? 'Connected. Practice from now on is reported.' : FALLBACK_ERROR);
  }

  // Send now runs the existing engine pass, then rereads health. A resolved
  // promise is never reported as sent, and neither is a changed lastSuccessAt
  // alone: the engine also records a successful status-only contact (no
  // events). Only waiting practice that left the queue on a successful
  // contact, minus any the service held back, is described as sent.
  function sendOutcome(before, after) {
    const contacted = after?.kind === 'connected' && Boolean(after.lastSuccessAt) && after.lastSuccessAt !== before.lastSuccessAt;
    if (!contacted) return 'Nothing new was confirmed. Any waiting practice is kept and will be tried again.';
    const sent = Math.max(0, before.waiting - after.waiting - Math.max(0, after.held - before.held));
    const waiting = `${after.waiting} practice event${after.waiting === 1 ? '' : 's'} still waiting.`;
    return sent
      ? `Sent ${sent} practice event${sent === 1 ? '' : 's'} to the report service. ${waiting}`
      : `The report service was reached, but no waiting practice was sent. ${waiting}`;
  }

  async function sendNow() {
    const S = sync();
    if (inFlight || !open || view?.kind !== 'connected' || !view.originMatches || !S) return;
    const started = revision;
    const before = { lastSuccessAt: view.lastSuccessAt, waiting: view.waiting, held: view.held };
    inFlight = 'send';
    setText('ov-report-send-status', '');
    paint();
    try { await S.syncNow(); } catch (error) { /* the reread below decides what to say */ }
    inFlight = null;
    if (!open) return;
    const fresh = current(started);
    const after = await render();
    if (!fresh || !current(started)) return;
    setText('ov-report-send-status', sendOutcome(before, after));
  }

  return Object.freeze({
    configure,
    open: openPanel,
    close: closePanel,
    isOpen: () => open,
    refreshPicker,
    // Test seam: the painted, non-secret view kind and whether an operation is running.
    snapshot: () => Object.freeze({ open, view: view ? view.kind : null, inFlight }),
  });
})();
