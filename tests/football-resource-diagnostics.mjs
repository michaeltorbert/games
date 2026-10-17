import path from 'node:path';

const FOOTBALL_PATH = /^\/football(?:\/|$)/;

export function sanitizeResourceUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '[non-http-url]';
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[unavailable-url]';
  }
}

export function sanitizeFailureCode(value) {
  if (typeof value !== 'string') return '[unavailable]';
  const text = value.trim();
  const chromium = text.match(/(?:^|\b)net::(ERR_[A-Z0-9_]+)(?:\b|$)/);
  if (chromium) return `net::${chromium[1]}`;
  const webkit = text.match(/(?:^|\b)(NSURLErrorDomain Code=-?\d+)(?:\b|$)/);
  if (webkit) return webkit[1];
  if (text === 'Blocked by Web Inspector') return 'Blocked by Web Inspector';
  const canonical = text.match(/^(Load failed|cancelled|blocked by client)$/i);
  return canonical ? canonical[1].toLowerCase() : '[unavailable]';
}

export function createFootballResourceDiagnostics(testInfo) {
  const intendedOrigin = new URL(testInfo.project.use.baseURL ?? testInfo.config.use.baseURL).origin;
  const startedAt = new Date().toISOString();
  const monotonicStart = performance.now();
  const contexts = new Map();
  const pending = new WeakMap();
  const failures = [];
  const consoleErrors = [];
  let nextContext = 1;
  let nextPage = 1;
  let nextEvent = 1;
  let closed = false;
  let cleanupReport = null;
  let engine = '[unavailable]';

  const isFootballDocument = value => {
    try {
      const url = new URL(value);
      return url.origin === intendedOrigin && FOOTBALL_PATH.test(url.pathname);
    } catch { return false; }
  };

  function registerContext(context) {
    if (closed) throw new Error('Football diagnostics collector is already closed');
    if (contexts.has(context)) return;
    try { engine = context.browser()?.browserType().name() ?? engine; } catch {}
    const contextOrdinal = nextContext++;
    const pages = new Map();
    const pageOrdinals = new WeakMap();
    const onPage = page => {
      if (closed || pageOrdinals.has(page)) return;
      const ordinal = nextPage++;
      pageOrdinals.set(page, ordinal);
      const onConsole = message => {
        if (closed) return;
        if (message.type() !== 'error' || !isFootballDocument(page.url())) return;
        const location = message.location();
        consoleErrors.push({
          sequence: nextEvent++,
          at: new Date().toISOString(),
          elapsedMs: Math.round(performance.now() - monotonicStart),
          context: contextOrdinal,
          page: ordinal,
          url: sanitizeResourceUrl(page.url()),
          source: sanitizeResourceUrl(location.url),
          line: Number.isInteger(location.lineNumber) ? location.lineNumber : null,
          column: Number.isInteger(location.columnNumber) ? location.columnNumber : null,
        });
      };
      page.on('console', onConsole);
      pages.set(page, { ordinal, onConsole });
    };
    for (const page of context.pages()) onPage(page);
    const onRequest = request => {
      if (closed) return;
      let frame;
      let page;
      try { frame = request.frame(); page = frame.page(); } catch { return; }
      const ordinal = pages.get(page)?.ordinal;
      if (!ordinal) return;
      const mainNavigation = request.isNavigationRequest() && frame === page.mainFrame();
      const eligible = mainNavigation ? isFootballDocument(request.url()) : isFootballDocument(page.url());
      if (!eligible) return;
      const safeUrl = sanitizeResourceUrl(request.url());
      pending.set(request, {
        page: ordinal,
        url: safeUrl,
        resourceType: request.resourceType(),
        navigation: mainNavigation,
      });
    };
    const onFailed = request => {
      if (closed) return;
      const initiated = pending.get(request);
      if (!initiated) return;
      pending.delete(request);
      let failure;
      try { failure = request.failure()?.errorText; } catch { failure = null; }
      failures.push({
        sequence: nextEvent++,
        at: new Date().toISOString(),
        elapsedMs: Math.round(performance.now() - monotonicStart),
        context: contextOrdinal,
        page: initiated.page,
        url: initiated.url,
        resourceType: initiated.resourceType,
        navigation: initiated.navigation,
        code: sanitizeFailureCode(failure),
      });
    };
    context.on('page', onPage);
    context.on('request', onRequest);
    context.on('requestfailed', onFailed);
    contexts.set(context, { ordinal: contextOrdinal, onPage, onRequest, onFailed, pages });
  }

  function close() {
    if (closed) return cleanupReport;
    closed = true;
    let detachedContextListeners = 0;
    let detachedPageListeners = 0;
    for (const [context, listeners] of contexts) {
      context.off('page', listeners.onPage);
      context.off('request', listeners.onRequest);
      context.off('requestfailed', listeners.onFailed);
      detachedContextListeners += 3;
      for (const [page, value] of listeners.pages) {
        page.off('console', value.onConsole);
        detachedPageListeners += 1;
      }
    }
    cleanupReport = Object.freeze({
      contexts: contexts.size,
      pages: [...contexts.values()].reduce((total, value) => total + value.pages.size, 0),
      detachedContextListeners,
      detachedPageListeners,
    });
    contexts.clear();
    return cleanupReport;
  }

  function artifact() {
    return {
      schemaVersion: 1,
      engine,
      test: {
        titlePath: testInfo.titlePath,
        file: path.basename(testInfo.file),
        project: testInfo.project.name,
        retry: testInfo.retry,
        repeatEachIndex: testInfo.repeatEachIndex,
      },
      startedAt,
      finishedAt: new Date().toISOString(),
      status: testInfo.status,
      expectedStatus: testInfo.expectedStatus,
      cleanup: cleanupReport,
      resourceFailures: failures,
      consoleErrors,
      limitations: 'Events are recorded when Playwright emits them. Events arriving after page/context teardown may be unavailable; request and console events are associated by their native page and timing, not asserted as causal pairs.',
    };
  }

  return Object.freeze({ registerContext, close, artifact });
}
