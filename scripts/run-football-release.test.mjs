// Contract checks for the release runner's case-union validator:
//   node --test scripts/run-football-release.test.mjs
// A passing release run only reaches the validator's `ok` path, and the
// controlled bad-argument/port/browser failures stop before it, so its
// rejection paths are exercised only here. Lives outside Playwright's testDir.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validate } from './run-football-release.mjs';

const PROJECTS = ['p1', 'p2'];
const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'football-release-test-'));
fs.writeFileSync(path.join(rootDir, 'a.spec.mjs'), "test.skip(phone, 'Phone layout only');\n");
fs.writeFileSync(path.join(rootDir, 'b.spec.mjs'), '');
after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

const result = (status, retry = 0) => ({ status, retry, annotations: [] });
const passed = projectName => ({ projectName, status: 'expected', annotations: [], results: [result('passed')] });
const skipped = (projectName, description) => ({
  projectName, status: 'skipped', annotations: [{ type: 'skip', description }], results: [result('skipped')],
});
const report = (specs, { projects = PROJECTS, errors = [] } = {}) => ({
  config: { rootDir, projects: projects.map(name => ({ name })) },
  suites: [...new Set(specs.map(s => s.file))].map(file => ({
    title: file, file, specs: specs.filter(s => s.file === file), suites: [],
  })),
  errors,
});
const spec = (file, title, tests) => ({ file, title, tests });
const allPass = (file, title) => spec(file, title, PROJECTS.map(passed));

const enumeration = report([allPass('a.spec.mjs', 'one'), allPass('b.spec.mjs', 'two')]);
const partA = (specs = [allPass('a.spec.mjs', 'one')], opts) => ({ file: 'tests/a.spec.mjs', report: report(specs, opts) });
const partB = (specs = [allPass('b.spec.mjs', 'two')], opts) => ({ file: 'tests/b.spec.mjs', report: report(specs, opts) });

test('exact union with existing skip reason passes', () => {
  const a = partA([spec('a.spec.mjs', 'one', [passed('p1'), skipped('p2', 'Phone layout only')])]);
  const v = validate(enumeration, [a, partB()], PROJECTS);
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  assert.deepEqual({ ...v.counts, byProject: undefined }, { files: 2, enumerated: 4, ran: 4, passed: 3, skipped: 1, byProject: undefined });
});

test('a not-run partition is reported missing', () => {
  const v = validate(enumeration, [partA()], PROJECTS);
  assert.equal(v.ok, false);
  assert.equal(v.issues.missing.length, 2);
});

test('a case run in another file\'s CLI is a duplicate in the wrong partition', () => {
  const v = validate(enumeration, [partA([allPass('a.spec.mjs', 'one'), allPass('b.spec.mjs', 'two')]), partB()], PROJECTS);
  assert.equal(v.ok, false);
  assert.equal(v.issues.duplicates.length, 2);
  assert.equal(v.issues.wrongPartition.length, 2);
});

test('a case absent from the enumeration is unexpected', () => {
  const v = validate(enumeration, [partA([allPass('a.spec.mjs', 'one'), allPass('a.spec.mjs', 'extra')]), partB()], PROJECTS);
  assert.deepEqual(v.issues.unexpected, ['a.spec.mjs::extra::p1', 'a.spec.mjs::extra::p2']);
});

test('a pass after a retry is rejected', () => {
  const flaky = { ...passed('p2'), status: 'flaky', results: [result('failed'), result('passed', 1)] };
  const v = validate(enumeration, [partA([spec('a.spec.mjs', 'one', [passed('p1'), flaky])]), partB()], PROJECTS);
  assert.equal(v.ok, false);
  assert.deepEqual(v.issues.notExactlyOnePassOrSkip.map(c => c.key), ['a.spec.mjs::one::p2']);
});

test('a skip without a reason already in its spec is rejected', () => {
  for (const reason of ['New reason', undefined]) {
    const v = validate(enumeration, [partA([spec('a.spec.mjs', 'one', [passed('p1'), skipped('p2', reason)])]), partB()], PROJECTS);
    assert.equal(v.ok, false);
    assert.deepEqual(v.issues.skipsWithoutExistingReason.map(c => c.key), ['a.spec.mjs::one::p2']);
  }
});

test('a fixme case is rejected', () => {
  const fixme = { ...skipped('p2', 'Phone layout only'), annotations: [{ type: 'fixme' }] };
  const v = validate(enumeration, [partA([spec('a.spec.mjs', 'one', [passed('p1'), fixme])]), partB()], PROJECTS);
  assert.equal(v.ok, false);
  assert.deepEqual(v.issues.fixmeOrExpectedFail, ['a.spec.mjs::one::p2']);
});

test('changed projects or report errors are rejected', () => {
  const projects = validate(enumeration, [partA(undefined, { projects: ['p1', 'p2', 'p3'] }), partB()], PROJECTS);
  assert.equal(projects.ok, false);
  assert.equal(projects.issues.projectsDiffer.length, 1);
  const errors = validate(enumeration, [partA(), partB(undefined, { errors: [{ message: 'boom' }] })], PROJECTS);
  assert.equal(errors.ok, false);
  assert.equal(errors.issues.projectsDiffer.length, 1);
});

test('an empty enumeration never passes', () => {
  assert.equal(validate(report([]), [], PROJECTS).ok, false);
});
