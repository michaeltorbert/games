// Synthetic coverage checks for issue #160 (node --test). The reports are
// constructed; skip reasons are checked against the real canonical spec text.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverage } from './coverage.mjs';
import { CANONICAL, FULL_COPY, TARGET_TITLE } from './gen-spec.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECTS = ['ipad-11-landscape', 'iphone-15-portrait'];
const CANON = path.join(REPO, CANONICAL);
const GEN = path.join(REPO, 'output', 'issue-160', 'runs', 'synthetic', 'gen', FULL_COPY);
const REASON = 'Contextual football integration checks run once on the primary target.';
const rel = file => path.relative(REPO, file);

const passed = project => ({ projectName: project, status: 'expected', annotations: [], results: [{ status: 'passed', retry: 0 }] });
const skipped = (project, description = REASON) => ({
  projectName: project, status: 'skipped', annotations: [{ type: 'skip', description }], results: [{ status: 'skipped', retry: 0 }],
});
const report = (file, tests, { describe = null, errors = [] } = {}) => {
  const spec = { title: TARGET_TITLE, file: rel(file), tests };
  return {
    config: { rootDir: REPO, projects: PROJECTS.map(name => ({ name })) },
    errors,
    suites: [{ title: rel(file), file: rel(file), specs: describe ? [] : [spec], suites: describe ? [{ title: describe, file: rel(file), specs: [spec], suites: [] }] : [] }],
  };
};
const enumeration = (opts) => report(CANON, PROJECTS.map(p => ({ projectName: p, status: 'expected', annotations: [], results: [] })), opts);
const check = (run, enumReport = enumeration()) => coverage(enumReport, run, { files: [CANON], projects: PROJECTS, generated: { file: GEN, canonical: CANON } });

test('generated copy with one pass and one canonical-reason skip is covered', () => {
  const result = check(report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1])]));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.deepEqual(result.counts.byProject[PROJECTS[1]], { cases: 1, passed: 0, skipped: 1 });
});

test('a missing project case fails', () => {
  const result = check(report(GEN, [passed(PROJECTS[0])]));
  assert.equal(result.ok, false);
  assert.equal(result.issues.missing.length, 1);
});

test('a duplicate case fails', () => {
  const result = check(report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1]), skipped(PROJECTS[1])]));
  assert.equal(result.ok, false);
  assert.equal(result.issues.duplicates.length, 1);
});

test('a skip whose reason is not in the canonical spec fails', () => {
  const result = check(report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1], 'diagnostic-only skip')]));
  assert.equal(result.ok, false);
  assert.equal(result.issues.skipsWithoutExistingReason.length, 1);
});

test('a retried (flaky) case fails', () => {
  const flaky = { projectName: PROJECTS[0], status: 'flaky', annotations: [], results: [{ status: 'failed', retry: 0 }, { status: 'passed', retry: 1 }] };
  const result = check(report(GEN, [flaky, skipped(PROJECTS[1])]));
  assert.equal(result.ok, false);
  assert.equal(result.issues.notExactlyOnePassOrSkip.length, 1);
});

test('a case left unrun by fail-fast or interruption fails', () => {
  const notRun = { projectName: PROJECTS[1], status: 'skipped', annotations: [], results: [] };
  const result = check(report(GEN, [passed(PROJECTS[0]), notRun]));
  assert.equal(result.ok, false);
  assert.equal(result.issues.notExactlyOnePassOrSkip.length, 1);
});

test('fixme/expected-fail annotations, report errors and stray files fail', () => {
  const fixme = { ...passed(PROJECTS[0]), annotations: [{ type: 'fixme' }] };
  assert.equal(check(report(GEN, [fixme, skipped(PROJECTS[1])])).issues.fixmeOrExpectedFail.length, 1);
  assert.equal(check(report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1])], { errors: [{ message: 'x' }] })).ok, false);
  const stray = report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1])]);
  stray.suites.push({ ...report(path.join(REPO, 'tests', 'other.spec.mjs'), [passed(PROJECTS[0])]).suites[0] });
  assert.deepEqual(check(stray).issues.strayFiles, ['tests/other.spec.mjs']);
});

test('describe ancestry is part of the key', () => {
  const result = check(report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1])]), enumeration({ describe: 'group' }));
  assert.equal(result.ok, false);
  assert.equal(result.issues.missing.length, 2);
  assert.equal(result.issues.unexpected.length, 2);
});

test('an un-normalized generated file is not accepted as the canonical case', () => {
  const result = coverage(enumeration(), report(GEN, [passed(PROJECTS[0]), skipped(PROJECTS[1])]), { files: [CANON], projects: PROJECTS });
  assert.equal(result.ok, false);
});
