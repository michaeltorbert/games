// Issue #161 reporter: append-only test/step timeline with real worker and
// parallel indices, plus an observe-only watchdog. The watchdog never awaits
// inside a test and never changes a deadline; when a watched step stays open
// past the threshold it records onset and, for the first few, collects
// post-onset process evidence (declared perturbation, see lib.onsetSnapshot).
import path from 'node:path';
import { REPO, jsonl, onsetSnapshot, within, writeOnce } from './lib.mjs';

const DRAIN_MS = 40_000;
const WATCHED = new Set(['pw:api', 'fixture']);
const LOGGED = new Set(['pw:api', 'fixture', 'hook', 'test.step']);
const rel = file => (file ? path.relative(REPO, file) : null);
const loc = l => (l ? `${rel(l.file)}:${l.line}` : null);
export const caseKey = test => {
  const titles = test.titlePath();
  return `${titles[2]}::${titles.slice(3).join(' > ')}::${titles[1]}`;
};

export default class StallReporter {
  constructor({ runDir, thresholdMs = 10_000, maxSnapshots = 4 } = {}) {
    this.runDir = runDir;
    this.thresholdMs = thresholdMs;
    this.maxSnapshots = maxSnapshots;
    this.snapshots = 0;
    this.onsets = 0;
    this.pending = new Map(); // label -> in-flight onset snapshot
    this.drained = false;
    this.open = new Map();
    this.log = jsonl(path.join(runDir, 'events.jsonl'));
  }

  printsToStdio() { return false; }

  onBegin(config, suite) {
    const tests = suite.allTests();
    this.log.write('run.begin', {
      playwrightVersion: config.version, workers: config.workers, fullyParallel: config.fullyParallel,
      maxFailures: config.maxFailures, rootDir: config.rootDir, cwd: process.cwd(), total: tests.length,
      projects: config.projects.map(p => ({
        name: p.name, testDir: p.testDir, timeout: p.timeout, retries: p.retries, repeatEach: p.repeatEach,
        grep: String(p.grep), testMatch: String(p.testMatch), use: p.use,
      })),
    });
    writeOnce(path.join(this.runDir, 'enumeration.json'), tests.map(t => ({
      id: t.id, key: caseKey(t), project: t.titlePath()[1], file: rel(t.location.file),
      line: t.location.line, expectedStatus: t.expectedStatus,
    })));
    this.timer = setInterval(() => this.scan(), 1000);
    this.timer.unref();
  }

  onTestBegin(test, result) {
    this.log.write('test.begin', {
      test: test.id, key: caseKey(test), workerIndex: result.workerIndex,
      parallelIndex: result.parallelIndex, retry: result.retry,
    });
  }

  onStepBegin(test, result, step) {
    if (!LOGGED.has(step.category)) return;
    this.open.set(step, { test: test.id, key: caseKey(test), cat: step.category, title: step.title, started: Date.now(), workerIndex: result.workerIndex });
    this.log.write('step.begin', { test: test.id, cat: step.category, title: step.title, loc: loc(step.location), parent: step.parent?.title ?? null });
  }

  onStepEnd(test, result, step) {
    if (!LOGGED.has(step.category)) return;
    const open = this.open.get(step);
    this.open.delete(step);
    this.log.write('step.end', {
      test: test.id, cat: step.category, title: step.title, durationMs: step.duration,
      error: step.error ? String(step.error.message ?? step.error.value ?? '').slice(0, 1000) : null,
      watchdog: open?.flagged ?? false,
    });
  }

  scan() {
    const now = Date.now();
    for (const [step, open] of this.open) {
      if (open.flagged || !WATCHED.has(open.cat) || now - open.started < this.thresholdMs) continue;
      open.flagged = true;
      const n = ++this.onsets;
      const label = `${String(n).padStart(2, '0')}-${open.title.replace(/[^\w.-]+/g, '_').slice(0, 60)}`;
      const capture = this.snapshots < this.maxSnapshots;
      this.log.write('stall.onset', { ...open, openMs: now - open.started, label, capture });
      if (!capture) continue;
      this.snapshots++;
      this.log.write('stall.snapshot.begin', { label });
      const job = onsetSnapshot(path.join(this.runDir, 'onset'), label, process.pid, { sample: process.env.DIAG161_SAMPLES !== '0' })
        .then(summary => this.log.write('stall.snapshot', { label, summary }),
          error => this.log.write('stall.snapshot.error', { label, error: String(error) }))
        .finally(() => this.pending.delete(label));
      this.pending.set(label, job);
    }
  }

  // Collector-only drain after the last test has ended (or the run was
  // interrupted), so no test deadline is affected. Bounded below run-arm's
  // 60 s SIGINT grace; anything still running is recorded as incomplete.
  async drain() {
    this.drained = true;
    const waitedFor = [...this.pending.keys()];
    const t0 = Date.now();
    const settled = waitedFor.length === 0 || await within(Promise.allSettled([...this.pending.values()]), DRAIN_MS);
    this.log.write('collector.drain', {
      waitedFor, stillPending: [...this.pending.keys()], complete: settled && this.pending.size === 0,
      boundMs: DRAIN_MS, ms: Date.now() - t0,
    });
  }

  onTestEnd(test, result) {
    this.log.write('test.end', {
      test: test.id, key: caseKey(test), status: result.status, expectedStatus: test.expectedStatus,
      outcome: test.outcome(), durationMs: result.duration, retry: result.retry,
      workerIndex: result.workerIndex, parallelIndex: result.parallelIndex,
      errors: result.errors.map(e => String(e.message ?? e.value ?? '').slice(0, 4000)),
      annotations: [...test.annotations, ...(result.annotations ?? [])],
      attachments: result.attachments.map(a => ({ name: a.name, path: a.path ? rel(a.path) ?? a.path : null })),
    });
  }

  onError(error) {
    this.log.write('run.error', { message: String(error.message ?? error.value ?? '').slice(0, 4000) });
  }

  async onEnd(result) {
    clearInterval(this.timer);
    this.log.write('run.end', {
      status: result.status, durationMs: result.duration,
      stillOpenSteps: [...this.open.values()].map(({ test, cat, title, started }) => ({ test, cat, title, openMs: Date.now() - started })),
    });
    await this.drain();
  }

  // Late collector completions after this are dropped and never written.
  async onExit() {
    if (!this.drained) await this.drain();
    this.log.close();
  }
}
