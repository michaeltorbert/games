// Issue #161 continuation: pure evidence analysers shared by check-run.mjs and
// selfcheck.mjs, so the positive sensitivity cases exercise the same code that
// grades real runs. No I/O here.
//
// Sink lines (sink.mjs): "<monoNs> <ISO> pw:<ns> <message>" for debug output
// and "<monoNs> <ISO> #mark <json>" for stage marks. Lines without the numeric
// prefix are continuations of a multi-line debug message.

const CTX_BASE = 0x8000000000000001n; // first createContext reply observed as ...02 (retained diff-single)
// Source-defined control message (playwright-core 1.56.1): webkit.js:64
// attemptToGracefullyCloseBrowser sends {method:'Playwright.close', id:-9999}
// directly through the transport, bypassing WKConnection.rawSend's logger, and
// wkConnection.js:56-58 logs the reply before ignoring kBrowserCloseMessageId.
// A healthy close therefore logs exactly one reply with this id and no send.
export const BROWSER_CLOSE_CONTROL_ID = -9999;
const TRUNC = '<<<<<( LOG TRUNCATED )>>>>>';
export const CYCLES = 150;
// Stock arm: the passive deadline mark can differ from Playwright's own timeout
// instant by inter-fixture gaps and timer latency, so relevant events from
// CUTOFF_BEFORE_MS before to CUTOFF_TOLERANCE_MS after it make the label indeterminate.
export const CUTOFF_TOLERANCE_MS = 1000;
export const CUTOFF_BEFORE_MS = 250;
// Ownership leak on the shared CLI stderr (protocol or launch lines outside any sink).
export const STDERR_PROTOCOL = / pw:protocol /;
export const STDERR_LAUNCH = / pw:browser <launched>/;

function parseJsonish(text) {
  if (!text.includes(TRUNC)) {
    try { return { obj: JSON.parse(text), truncated: false }; } catch { /* fall through */ }
  }
  const obj = {};
  const head = text.match(/^\{"id":(\d+),"method":"([^"]+)"/);
  if (head) { obj.id = Number(head[1]); obj.method = head[2]; }
  const ev = text.match(/^\{"method":"([^"]+)"/);
  if (ev) obj.method = ev[1];
  const tailId = text.match(/"id":(\d+)(?:,"browserContextId":"[^"]*")?(?:,"pageProxyId":"[^"]*")?\}$/);
  if (!head && tailId && /^\{"(result|error)"/.test(text)) { obj.id = Number(tailId[1]); obj.result = {}; }
  const ppid = text.match(/"pageProxyId":"([^"]+)"\}$/);
  if (ppid) obj.pageProxyId = ppid[1];
  return { obj, truncated: true, parsed: obj.id !== undefined || obj.method !== undefined };
}

function innerMethod(params) {
  if (!params || typeof params.message !== 'string') return null;
  try { return JSON.parse(params.message).method ?? null; } catch { return params.message.match(/"method":"([^"]+)"/)?.[1] ?? null; }
}

export function createSinkAnalyzer(name) {
  const issues = []; // { severity: 'FAIL'|'INCONCLUSIVE', code, detail }
  const marks = [];
  const segments = [];
  let live = null;
  let launchingLane = null;
  let firstMark = null;
  let lastMono = null;
  let exitMark = null;
  let lines = 0, continuation = 0, protocolLines = 0, unparsed = 0, outside = 0;
  const issue = (severity, code, detail) => issues.push({ severity, code, detail });

  const newSegment = (pid, mono) => ({
    pid, lane: launchingLane, startMono: mono, endMono: null, exit: null,
    pending: new Map(), sent: new Set(), ordinal: 0, idSequential: true,
    contexts: new Map(), ctxByOrdinal: new Map(), pageToCtx: new Map(), navs: new Map(),
    replies: 0, orphanReplies: [], controlReplies: [], unparsedMonos: [],
  });
  // Unparsed protocol records keep their time and, when recoverable, their page,
  // so failureBoundary can refuse definitive absence labels they might affect.
  const markUnparsed = (seg, mono, pageProxyId = null) => { unparsed++; seg.unparsedMonos.push({ mono, pageProxyId }); };

  function onSend(seg, mono, msg) {
    if (msg.id === undefined) { markUnparsed(seg, mono, msg.pageProxyId ?? null); return; }
    if (seg.sent.has(msg.id)) issue('FAIL', 'duplicate-send-id', { sink: name, pid: seg.pid, id: msg.id });
    seg.sent.add(msg.id);
    const p = msg.params ?? {};
    const rec = { id: msg.id, method: msg.method, mono, pageProxyId: msg.pageProxyId ?? p.pageProxyId ?? null, ctxId: p.browserContextId ?? null, inner: innerMethod(p) };
    seg.pending.set(msg.id, rec);
    if (msg.method === 'Playwright.navigate') seg.navs.set(p.pageProxyId, { id: msg.id, sendMono: mono, frameId: p.frameId ?? null, events: {} });
    if (msg.method === 'Playwright.deleteContext') {
      const ctx = seg.contexts.get(p.browserContextId);
      if (ctx) {
        ctx.deleteSend = { id: msg.id, mono };
        ctx.outstandingAtDelete = [...seg.pending.values()].filter(r => r.id !== msg.id && r.pageProxyId && ctx.pages.includes(r.pageProxyId)).map(r => ({ id: r.id, method: r.method, inner: r.inner }));
      }
    }
  }

  function onReply(seg, mono, msg) {
    seg.replies++;
    const req = seg.pending.get(msg.id);
    if (!req && msg.id === BROWSER_CLOSE_CONTROL_ID) {
      // Recorded disposition for the unlogged Playwright.close control send; any
      // second one per browser is not source-explained and still fails.
      if (seg.controlReplies.length) issue('FAIL', 'duplicate-close-control-reply', { sink: name, pid: seg.pid, id: msg.id });
      seg.controlReplies.push({ id: msg.id, mono, disposition: 'Playwright.close control reply (send bypasses protocol logger by source)', error: msg.error ? String(msg.error.message ?? 'error') : null });
      return;
    }
    if (!req) { seg.orphanReplies.push(msg.id); issue('FAIL', 'orphan-reply', { sink: name, pid: seg.pid, id: msg.id }); return; }
    seg.pending.delete(msg.id);
    const res = msg.result ?? {};
    if (req.method === 'Playwright.createContext' && res.browserContextId) {
      seg.ordinal++;
      const ctx = { id: res.browserContextId, ordinal: seg.ordinal, createMono: mono, pages: [], deleteSend: null, deleteAck: null, pagesDestroyed: 0, pageDestroyedMonos: [], outstandingAtDelete: [] };
      try { if (BigInt(`0x${res.browserContextId}`) - CTX_BASE !== BigInt(seg.ordinal)) seg.idSequential = false; } catch { seg.idSequential = false; }
      seg.contexts.set(ctx.id, ctx);
      seg.ctxByOrdinal.set(ctx.ordinal, ctx);
    } else if (req.method === 'Playwright.createPage' && res.pageProxyId) {
      const ctx = seg.contexts.get(req.ctxId);
      if (ctx) ctx.pages.push(res.pageProxyId);
      seg.pageToCtx.set(res.pageProxyId, req.ctxId);
    } else if (req.method === 'Playwright.navigate') {
      const nav = [...seg.navs.values()].find(n => n.id === msg.id);
      if (nav) { nav.replyMono = mono; nav.replyError = msg.error ? String(msg.error.message ?? 'error') : null; }
    } else if (req.method === 'Playwright.deleteContext') {
      const ctx = seg.contexts.get(req.ctxId);
      if (ctx) ctx.deleteAck = { mono, error: msg.error ? String(msg.error.message ?? 'error') : null };
    }
  }

  function onEvent(seg, mono, msg) {
    const p = msg.params ?? {};
    if (msg.method === 'Target.dispatchMessageFromTarget') {
      const inner = innerMethod(p);
      // A target event whose inner method cannot be recovered might hide a
      // navigation/close event: count it so absence labels become indeterminate.
      if (!inner) { markUnparsed(seg, mono, msg.pageProxyId ?? null); return; }
      const nav = seg.navs.get(msg.pageProxyId);
      if (nav && inner && /^(Page\.(willCheckNavigationPolicy|didCheckNavigationPolicy|frameStartedLoading|loadEventFired)|Network\.(requestWillBeSent|responseReceived|loadingFinished|loadingFailed))$/.test(inner)) {
        nav.events[inner] ??= mono;
      }
    } else if (msg.method === 'Playwright.pageProxyDestroyed') {
      const ctx = seg.contexts.get(seg.pageToCtx.get(p.pageProxyId));
      if (ctx) { ctx.pagesDestroyed++; ctx.pageDestroyedMonos.push(mono); }
    }
  }

  function line(text) {
    lines++;
    const m = text.match(/^(\d+) (\S+) (.*)$/s);
    if (!m) { continuation++; return; }
    const mono = BigInt(m[1]);
    lastMono = mono;
    const rest = m[3];
    if (rest.startsWith('#mark ')) {
      let mk;
      try { mk = JSON.parse(rest.slice(6)); } catch { issue('INCONCLUSIVE', 'unparsed-mark', { sink: name, text: rest.slice(0, 200) }); return; }
      mk.mono = mono;
      marks.push(mk);
      if (!firstMark) firstMark = mk;
      if (mk.ev === 'sink.exit') exitMark = mk;
      if (mk.ev === 'stage.begin' && mk.stage === 'browser.launch') launchingLane = mk.lane;
      return;
    }
    if (rest.startsWith('pw:browser ')) {
      const launched = rest.match(/<launched> pid=(\d+)/);
      const exited = rest.match(/^pw:browser \[pid=(\d+)\] <process did exit: (.*)>$/);
      if (launched) {
        if (live) issue('FAIL', 'overlapping-browsers', { sink: name, live: live.pid, launched: Number(launched[1]) });
        const seg = newSegment(Number(launched[1]), mono);
        segments.push(seg);
        live = seg;
      } else if (exited) {
        const seg = segments.find(s => s.pid === Number(exited[1]) && s.endMono === null);
        if (seg) { seg.endMono = mono; seg.exit = exited[2]; }
        if (live && live.pid === Number(exited[1])) live = segments.find(s => s.endMono === null) ?? null;
      }
      return;
    }
    const proto = rest.match(/^pw:protocol (SEND ► |◀ RECV )(.*)$/s);
    if (!proto) return;
    protocolLines++;
    const open = segments.filter(s => s.endMono === null);
    if (open.length !== 1) { outside++; issue('FAIL', open.length ? 'protocol-with-overlapping-browsers' : 'protocol-outside-browser', { sink: name, mono: String(mono) }); return; }
    const seg = open[0];
    const { obj, truncated, parsed } = parseJsonish(proto[2]);
    if (truncated && !parsed) { markUnparsed(seg, mono, obj.pageProxyId ?? null); return; }
    if (proto[1].startsWith('SEND')) onSend(seg, mono, obj);
    else if (obj.id !== undefined && !obj.method && ('result' in obj || 'error' in obj)) onReply(seg, mono, obj);
    else if (obj.method) onEvent(seg, mono, obj);
    else markUnparsed(seg, mono, obj.pageProxyId ?? null);
  }

  function end({ tailTruncated = false } = {}) {
    if (!firstMark || firstMark.ev !== 'sink.open') issue('FAIL', 'sink-not-opened-first', { sink: name });
    else if (!firstMark.debugProtocolEnabled) issue('FAIL', 'protocol-debug-disabled', { sink: name });
    const closed = !!exitMark && !tailTruncated && marks[marks.length - 1] === exitMark;
    if (!closed) issue('INCONCLUSIVE', 'sink-not-positively-closed', { sink: name, exitMark: !!exitMark, tailTruncated });
    if (protocolLines === 0) issue('FAIL', 'no-protocol-lines-in-sink', { sink: name });
    for (const seg of segments) {
      if (seg.endMono === null) issue('INCONCLUSIVE', 'browser-exit-not-observed', { sink: name, pid: seg.pid });
      if (seg.lane === null) issue('FAIL', 'launch-without-lane-stage', { sink: name, pid: seg.pid });
    }
    if (exitMark && exitMark.liveBrowsers) issue('INCONCLUSIVE', 'browser-live-at-worker-exit', { sink: name, live: exitMark.liveBrowsers });
    return { closed };
  }

  function result(closed) {
    const unanswerLabel = closed ? (unparsed ? 'unanswered-or-unparsed' : 'unanswered-at-end-of-stream') : 'unobserved-stream-not-closed';
    return {
      sink: name, lines, continuation, protocolLines, unparsed, outside, closed,
      firstMark: firstMark ?? null, exitMark: exitMark ?? null, marks, issues,
      segments: segments.map(seg => ({
        pid: seg.pid, lane: seg.lane, startMono: String(seg.startMono), endMono: seg.endMono === null ? null : String(seg.endMono), exit: seg.exit,
        contexts: seg.ordinal, idSequential: seg.idSequential, replies: seg.replies, orphanReplies: seg.orphanReplies,
        controlReplies: seg.controlReplies.map(c => ({ ...c, mono: String(c.mono) })), unparsedProtocolLines: seg.unparsedMonos.length,
        pendingAtEnd: [...seg.pending.values()].map(r => ({ ...r, mono: String(r.mono), label: seg.endMono !== null ? 'unanswered-before-browser-exit' : unanswerLabel })),
        _seg: seg,
      })),
    };
  }

  return { line, end, result, issues };
}

// Feed a whole text (self-check) or call line() from a stream (check-run).
export function analyzeSinkText(name, text) {
  const a = createSinkAnalyzer(name);
  const tailTruncated = text.length > 0 && !text.endsWith('\n');
  for (const l of text.split('\n').slice(0, tailTruncated ? undefined : -1)) a.line(l);
  const { closed } = a.end({ tailTruncated });
  return a.result(closed);
}

const big = s => (s === null || s === undefined ? null : BigInt(s));
const ms = (a, b) => (a === null || b === null || a === undefined || b === undefined ? null : Number((BigInt(b) - BigInt(a)) / 1000000n));

// Per-lane stage accounting from marks; independent of the protocol stream.
export function laneOutcomes(sinkResult) {
  const lanes = new Map();
  const issues = [];
  for (const mk of sinkResult.marks) {
    if (!mk.lane) continue;
    if (!lanes.has(mk.lane)) lanes.set(mk.lane, { lane: mk.lane, pid: mk.pid, begin: null, stages: [], open: new Map(), begins: new Map(), deadlines: new Map(), cycleOk: 0, cyclesStarted: 0, summary: null });
    const L = lanes.get(mk.lane);
    if (mk.ev === 'lane.begin') L.begin = mk;
    else if (mk.ev === 'stage.begin') {
      L.open.set(`${mk.stage}#${mk.cycle ?? ''}`, mk);
      L.begins.set(`${mk.stage}#${mk.cycle ?? ''}`, mk);
      if (mk.stage === 'fixtures.setup' || mk.stage === 'newContext') L.cyclesStarted++;
    } else if (mk.ev === 'stage.deadline') {
      // Stock arm: passive mark written when the shared Playwright timeout slot
      // that bounds this stage ran out (observation only; see stock-skip.spec.mjs).
      L.deadlines.set(`${mk.stage}#${mk.cycle ?? ''}`, mk.mono);
    } else if (mk.ev === 'stage.end') {
      const key = `${mk.stage}#${mk.cycle ?? ''}`;
      const b = L.open.get(key);
      if (!b) issues.push({ severity: 'FAIL', code: 'stage-end-without-begin', detail: { lane: mk.lane, stage: mk.stage, cycle: mk.cycle } });
      L.open.delete(key);
      L.stages.push({ ...mk, beginMono: b ? String(b.mono) : null, endMono: String(mk.mono), ms: b ? ms(b.mono, mk.mono) : null });
    } else if (mk.ev === 'cycle.ok') L.cycleOk++;
    else if (mk.ev === 'lane.summary') L.summary = mk;
  }
  const out = [];
  for (const L of lanes.values()) {
    const s = L.summary;
    let outcome;
    if (!s) outcome = 'CENSORED';
    // Stock arm: a stage whose in-test end was never observed (its teardown was skipped
    // after the shared slot ran out, or the worker stopped) is UNRESOLVED here and is
    // resolved only from the report by resolveStockLane; it is never definitive by itself.
    else if (s.unresolved) outcome = 'UNRESOLVED';
    else if (s.interrupted && !s.failure) outcome = 'CENSORED';
    else if (!s.failure && s.completed === CYCLES && s.launches === 1 && s.closesOk === 1 && !s.browserLeftOpen) outcome = 'COMPLETED';
    else if (s.failure) outcome = 'FAILED';
    else { outcome = 'INVALID'; issues.push({ severity: 'FAIL', code: 'invalid-lane-summary', detail: { lane: L.lane } }); }
    if (s && s.completed !== L.cycleOk) issues.push({ severity: 'FAIL', code: 'cycle-count-mismatch', detail: { lane: L.lane, summary: s.completed, marks: L.cycleOk } });
    // Fallback ends (written at worker teardown) and interrupted ends never define a failure window.
    const firstFailedStage = L.stages.find(st => !st.ok && st.stage !== 'browser.cleanup' && !st.fallback && !st.interrupted) ?? null;
    const keyOf = st => `${st.stage}#${st.cycle ?? ''}`;
    // A timed-out stage with an observed slot deadline is cut off at that deadline, not at
    // the later teardown mark; events within the tolerance of it are indeterminate.
    const deadlineFor = st => (st && st.timeout ? L.deadlines.get(keyOf(st)) ?? null : null);
    const failedDeadline = deadlineFor(firstFailedStage);
    const unresolvedKey = s?.unresolved ? `${s.unresolved.stage}#${s.unresolved.cycle ?? ''}` : null;
    if (s?.failure && firstFailedStage && (firstFailedStage.stage !== s.failure.stage || (firstFailedStage.cycle ?? null) !== (s.failure.cycle ?? null))) {
      issues.push({ severity: 'FAIL', code: 'first-failure-mismatch', detail: { lane: L.lane, summary: s.failure, marks: firstFailedStage } });
    }
    if (!['CENSORED', 'UNRESOLVED'].includes(outcome) && L.open.size) issues.push({ severity: 'FAIL', code: 'stage-begin-without-end', detail: { lane: L.lane, open: [...L.open.keys()] } });
    const cleanupStage = L.stages.find(st => st.stage === 'browser.cleanup') ?? null;
    out.push({
      lane: L.lane, pid: L.pid, outcome, completed: s?.completed ?? L.cycleOk, begin: L.begin ? { workerIndex: L.begin.workerIndex, parallelIndex: L.begin.parallelIndex, workload: L.begin.workload, project: L.begin.project, trace: L.begin.trace } : null,
      firstFailure: s?.failure ?? (firstFailedStage ? { stage: firstFailedStage.stage, cycle: firstFailedStage.cycle ?? null, timeout: firstFailedStage.timeout, error: firstFailedStage.error } : null),
      failedStageWindow: firstFailedStage ? { beginMono: firstFailedStage.beginMono, endMono: failedDeadline !== null ? String(failedDeadline) : firstFailedStage.endMono, cutoff: failedDeadline !== null ? 'slot-deadline-mark' : 'stage-end' } : null,
      cutoffToleranceMs: failedDeadline !== null ? CUTOFF_TOLERANCE_MS : null,
      cyclesStarted: L.cyclesStarted,
      unresolved: s?.unresolved ? {
        ...s.unresolved,
        beginMono: L.begins.get(unresolvedKey) ? String(L.begins.get(unresolvedKey).mono) : null,
        deadlineMono: L.deadlines.has(unresolvedKey) ? String(L.deadlines.get(unresolvedKey)) : null,
      } : null,
      interrupted: s?.interrupted ?? null,
      cleanup: s?.cleanup ?? (cleanupStage ? { ok: cleanupStage.ok, timeout: cleanupStage.timeout } : null),
      openStagesAtEnd: [...L.open.keys()],
      stageMsMax: Object.fromEntries([...new Set(L.stages.map(st => st.stage))].map(n => [n, Math.max(...L.stages.filter(st => st.stage === n && st.ms !== null).map(st => st.ms), 0)])),
    });
  }
  return { lanes: out, issues };
}

// Protocol boundary of a lane's first failed stage, within the lane's own browser segment.
export function failureBoundary(sinkResult, lane) {
  if (!lane.firstFailure || lane.firstFailure.cycle === undefined || lane.firstFailure.cycle === null) return null;
  const seg = sinkResult.segments.find(s => s.lane === lane.lane);
  if (!seg) return { label: 'no-browser-segment-for-lane' };
  const s = seg._seg;
  const ctx = s.ctxByOrdinal.get(lane.firstFailure.cycle) ?? null;
  const base = { stage: lane.firstFailure.stage, cycle: lane.firstFailure.cycle, pid: seg.pid, contextId: ctx?.id ?? null, contextOrdinalInBrowser: ctx?.ordinal ?? null, idSequential: seg.idSequential };
  // The boundary is classified AT the failed stage's end mark. The race leaves
  // the failed operation pending while browser.cleanup runs, so anything after
  // stage.end is reported separately as lateEvents and never changes the label.
  if (!lane.failedStageWindow?.endMono) return { ...base, label: 'indeterminate-no-stage-window' };
  const begin = BigInt(lane.failedStageWindow.beginMono ?? lane.failedStageWindow.endMono);
  const end = BigInt(lane.failedStageWindow.endMono);
  const by = m => m !== undefined && m !== null && m <= end;
  const late = (name, m) => (m !== undefined && m !== null && m > end ? [{ event: name, msAfterStageEnd: ms(end, m) }] : []);
  // Fail-safe: unparsed records in the window that could belong to this context
  // (unknown page, or one of its pages) make absence-based labels indeterminate.
  const pages = ctx?.pages ?? [];
  const unparsedInWindow = s.unparsedMonos.filter(u => u.mono >= begin && u.mono <= end && (u.pageProxyId === null || pages.includes(u.pageProxyId))).length;
  // Stock arm with a slot-deadline cutoff: relevant events too close to the cutoff
  // to order against Playwright's own timeout make the label indeterminate.
  const tol = lane.cutoffToleranceMs;
  const nearCutoff = monos => (tol ? monos.filter(m => m !== undefined && m !== null && m >= end - BigInt(CUTOFF_BEFORE_MS) * 1000000n && m <= end + BigInt(tol) * 1000000n).length : 0);
  const guard = (label, absenceBased, relevant = []) => {
    if (absenceBased && unparsedInWindow) return { label: 'indeterminate-unparsed-records', provisionalLabel: label };
    if (nearCutoff(relevant)) return { label: 'indeterminate-near-cutoff', provisionalLabel: label, cutoffToleranceMs: tol };
    return { label };
  };
  if (lane.firstFailure.stage === 'goto') {
    const page = pages[0] ?? null;
    const nav = page ? s.navs.get(page) : null;
    if (!nav || !by(nav.sendMono)) return { ...base, ...guard('before-navigate-send', true), page, unparsedInWindow };
    const e = nav.events;
    const seen = {
      navigateSent: true,
      willCheck: by(e['Page.willCheckNavigationPolicy']),
      didCheck: by(e['Page.didCheckNavigationPolicy']),
      navigateReply: by(nav.replyMono),
      requestWillBeSent: by(e['Network.requestWillBeSent']),
      frameStartedLoading: by(e['Page.frameStartedLoading']),
      loadEventFired: by(e['Page.loadEventFired']),
    };
    let label, absenceBased = true;
    if (!seen.willCheck && !seen.navigateReply) label = 'after-navigate-send-before-willCheck';
    else if (seen.willCheck && !seen.didCheck && !seen.navigateReply && !seen.requestWillBeSent) label = 'pre-request-gap-after-willCheck';
    else if (seen.requestWillBeSent && !seen.loadEventFired) label = 'after-request-before-load';
    else { label = 'other-navigation-boundary'; absenceBased = false; }
    const lateEvents = [...Object.entries(e).flatMap(([k, v]) => late(k, v)), ...late('navigateReply', nav.replyMono)];
    return {
      ...base, ...guard(label, absenceBased, [...Object.values(e), nav.replyMono]), page, navigateId: nav.id, sendMono: String(nav.sendMono), seenByStageEnd: seen, unparsedInWindow,
      msFromSendByStageEnd: Object.fromEntries(Object.entries(e).filter(([, v]) => by(v)).map(([k, v]) => [k, ms(nav.sendMono, v)])), lateEvents,
    };
  }
  if (lane.firstFailure.stage === 'context.close') {
    if (!ctx) return { ...base, label: 'context-not-found' };
    const sent = ctx.deleteSend && by(ctx.deleteSend.mono);
    const acked = ctx.deleteAck && by(ctx.deleteAck.mono);
    let label;
    if (!sent) label = 'close-before-deleteContext-send';
    else if (!acked) label = 'deleteContext-unacknowledged';
    else label = 'after-deleteContext-ack';
    const lateEvents = [
      ...late('deleteContextSend', ctx.deleteSend?.mono), ...late('deleteContextAck', ctx.deleteAck?.mono),
      ...ctx.pageDestroyedMonos.flatMap(m => late('pageProxyDestroyed', m)),
    ];
    return {
      ...base, ...guard(label, label !== 'after-deleteContext-ack', [ctx.deleteSend?.mono, ctx.deleteAck?.mono, ...ctx.pageDestroyedMonos]), cutoff: lane.failedStageWindow.cutoff ?? 'stage-end', deleteContextId: ctx.deleteSend?.id ?? null, deleteSendMono: sent ? String(ctx.deleteSend.mono) : null,
      ackMs: acked ? ms(ctx.deleteSend.mono, ctx.deleteAck.mono) : null, pagesDestroyedByStageEnd: ctx.pageDestroyedMonos.filter(by).length,
      outstandingAtDelete: sent ? ctx.outstandingAtDelete : [], unparsedInWindow, lateEvents,
    };
  }
  return { ...base, label: `stage-${lane.firstFailure.stage}` };
}

// Stock arm: resolve an UNRESOLVED lane (stage end not observed in-test) from the
// Playwright report for that exact test. Only a reported 'timedOut' becomes a
// FAILED timeout, cut off at the passive slot-deadline mark when one exists (else
// no window, so the boundary is indeterminate). Any other status (skipped after an
// interrupt, interrupted, missing) is CENSORED: never a new independent failure.
export function resolveStockLane(lane, reportTests) {
  if (lane.outcome !== 'UNRESOLVED' || !lane.unresolved) return lane;
  const u = lane.unresolved;
  const t = reportTests.find(x => x.title === u.test) ?? null;
  const status = t?.results?.at(-1) ?? null;
  if (status === 'timedOut') {
    return {
      ...lane, outcome: 'FAILED', resolution: 'report-timedOut',
      firstFailure: { stage: u.stage, cycle: u.cycle, timeout: true, error: t.error ?? null },
      failedStageWindow: u.deadlineMono ? { beginMono: u.beginMono, endMono: u.deadlineMono, cutoff: 'slot-deadline-mark' } : null,
      cutoffToleranceMs: u.deadlineMono ? CUTOFF_TOLERANCE_MS : null,
    };
  }
  return { ...lane, outcome: 'CENSORED', resolution: `report-${status ?? 'missing'}` };
}

// Round-trip profile per context ordinal (descriptive only).
export function rttProfile(sinkResult) {
  return sinkResult.segments.map(seg => {
    const s = seg._seg;
    const del = [], nav = [];
    for (const ctx of s.contexts.values()) {
      if (ctx.deleteSend && ctx.deleteAck) del.push([ctx.ordinal, ms(ctx.deleteSend.mono, ctx.deleteAck.mono)]);
      const n = ctx.pages[0] && s.navs.get(ctx.pages[0]);
      if (n && n.replyMono !== undefined) nav.push([ctx.ordinal, ms(n.sendMono, n.replyMono)]);
    }
    return { pid: seg.pid, lane: seg.lane, deleteContextMs: del, navigateReplyMs: nav };
  });
}

export function intervalsOverlapMs(a, b) {
  const start = big(a.startMono) > big(b.startMono) ? big(a.startMono) : big(b.startMono);
  const endA = big(a.endMono), endB = big(b.endMono);
  if (endA === null || endB === null) return null;
  const end = endA < endB ? endA : endB;
  return end > start ? Number((end - start) / 1000000n) : 0;
}

// Positive server-observer liveness: every probe the runner saw answered must be in the server log.
export function probeCoverage(runnerRecords, serverRecords) {
  const sent = runnerRecords.filter(r => r.ev === 'probe' && r.status === 200);
  const seen = new Set(serverRecords.filter(r => r.ev === 'request.start').map(r => r.ua));
  const missing = sent.filter(r => !seen.has(r.ua)).map(r => r.ua);
  return { answered: sent.length, missing, ready: sent.some(r => r.kind === 'ready'), final: sent.some(r => r.kind === 'final') };
}

export function grade(checks) {
  const sev = checks.map(c => c.result);
  return sev.includes('FAIL') ? 'FAIL' : sev.includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
}
