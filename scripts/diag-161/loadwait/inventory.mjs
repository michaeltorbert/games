// Issue #161 load-wait: the exact original exposure the faithful arm must
// reproduce in selection and settings. Pure data plus a pure comparator.
//
// Basis (read-only):
// - Retained failed raw report, raw-manifest.json item
//   tests/artifacts.nosync/football-release/20261014T182927Z-webkit-ebc74e/files/20-football-overlay-accessibility/report.json
//   (sha256 96211e33...c6e9; base 0a358dfd, whose tree equals the failed source).
//   Its config: fullyParallel true, globalTimeout 0, maxFailures 0, workers 7
//   (inherited default resolution; no config or CLI sets workers), six
//   projects in order each retries 0, repeatEach 1, timeout 30000. Its cases:
//   7 titles x 6 projects; the four primaryOnly titles were skipped on the
//   five non-primary projects (20 skips) with the spec's existing reason.
// - Coordinator --list parity: baseline-case-list.txt (42 cases, 1 file),
//   candidate-1-case-parity.json equal_to_original true.
// - Unchanged spec tests/football-overlay-accessibility.spec.mjs sha256
//   f4ee8cf0...d4c5d (raw-manifest.json).
// Outcomes (passed/failed/timedOut) are NOT predeclared: only selection,
// declared skips, retries and settings are bound.
export const INVENTORY = {
  spec: 'tests/football-overlay-accessibility.spec.mjs',
  specSha256: 'f4ee8cf07a5e838dc8001815b045cffc66ef97b1e757e7cf0957a1a4ff0d4c5d',
  rawReport: { path: 'tests/artifacts.nosync/football-release/20261014T182927Z-webkit-ebc74e/files/20-football-overlay-accessibility/report.json', sha256: '96211e33f10471e7e7f52dab79406ea027612b8bc03a5467e7ba04665f00c6e9' },
  projects: ['iphone-15-portrait', 'iphone-17-pro-max-portrait', 'ipad-11-portrait', 'ipad-pro-13-portrait', 'ipad-pro-13-landscape', 'ipad-11-landscape'],
  titles: [
    'all overlays expose one modal dialog and contain keyboard focus',
    'start overlay traps focus across the selected mode and visible rival radio tab stops',
    'closing an overlay restores the game UI and focuses the next control',
    'render_game_to_text reports conversion facts instead of stale down-distance facts in both directions',
    'render_game_to_text preserves numeric semantic choices and formats only field-position semantics',
    'keyboard activation moves focus from an ordinary call card to the first answer',
    'keyboard Continue returns focus to the next nonterminal call grid',
  ],
  declaredSkip: {
    titles: [
      'render_game_to_text reports conversion facts instead of stale down-distance facts in both directions',
      'render_game_to_text preserves numeric semantic choices and formats only field-position semantics',
      'keyboard activation moves focus from an ordinary call card to the first answer',
      'keyboard Continue returns focus to the next nonterminal call grid',
    ],
    exceptProject: 'ipad-11-landscape',
    reason: 'Focused state and keyboard checks run once on the primary target.',
  },
  config: { fullyParallel: true, globalTimeout: 0, maxFailures: 0, workers: 7 },
  project: { retries: 0, repeatEach: 1, timeout: 30000 },
  // Effective (resolved) config facts the runner records before the CLI starts.
  effective: { configWorkers: null, configTimeout: null, retries: 0, trace: 'off', webServer: false, browserName: 'webkit', onlyDiffFromRelease: ['webServer'] },
};

const CAPTURED = new Set(['passed', 'failed', 'timedOut']);

// Compare one JSON report (+ effective config) with the inventory.
// INVALID: not the original exposure (extra/duplicate/retried/new or changed
// skip/declared skip not skipped/config or effective-config mismatch/spec drift).
// INCOMPLETE: original cases missing or interrupted (captured, not success).
export function checkInventory(report, effective, specSha256, inv = INVENTORY) {
  const invalid = [], incomplete = [];
  if (specSha256 !== inv.specSha256) invalid.push({ kind: 'spec-changed', actual: specSha256 ?? null });
  if (!report) return { verdict: 'INCOMPLETE', invalid, incomplete: [{ kind: 'report-missing' }] };
  const c = report.config ?? {};
  for (const [k, v] of Object.entries(inv.config)) if (c[k] !== v) invalid.push({ kind: 'config', key: k, expected: v, actual: c[k] ?? null });
  const projects = (c.projects ?? []).map(p => p.name);
  if (JSON.stringify(projects) !== JSON.stringify(inv.projects)) invalid.push({ kind: 'projects', actual: projects });
  for (const p of c.projects ?? []) for (const [k, v] of Object.entries(inv.project)) if (p[k] !== v) invalid.push({ kind: 'project-setting', project: p.name, key: k, expected: v, actual: p[k] ?? null });
  if (!effective) invalid.push({ kind: 'effective-config-missing' });
  else for (const [k, v] of Object.entries(inv.effective)) if (JSON.stringify(effective[k]) !== JSON.stringify(v)) invalid.push({ kind: 'effective', key: k, expected: v, actual: effective[k] ?? null });

  const seen = new Map();
  const visit = suite => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) {
      const key = `${spec.title}::${t.projectName}`;
      seen.set(key, [...(seen.get(key) ?? []), { spec, t }]);
    }
    for (const s of suite.suites ?? []) visit(s);
  };
  for (const s of report.suites ?? []) visit(s);
  const expected = inv.titles.flatMap(title => inv.projects.map(project => ({ title, project, key: `${title}::${project}` })));
  const expectedKeys = new Set(expected.map(e => e.key));
  for (const key of seen.keys()) if (!expectedKeys.has(key)) invalid.push({ kind: 'extra-case', key });
  for (const e of expected) {
    const entries = seen.get(e.key) ?? [];
    if (!entries.length) { incomplete.push({ kind: 'missing-case', key: e.key }); continue; }
    if (entries.length > 1) { invalid.push({ kind: 'duplicate-case', key: e.key }); continue; }
    const { t } = entries[0];
    const results = t.results ?? [];
    if (results.length !== 1 || results[0].retry !== 0) { invalid.push({ kind: 'retry-or-result-count', key: e.key, results: results.map(r => [r.status, r.retry]) }); continue; }
    const status = results[0].status;
    const declared = inv.declaredSkip.titles.includes(e.title) && e.project !== inv.declaredSkip.exceptProject;
    const reasons = [...(t.annotations ?? []), ...(results[0].annotations ?? [])].filter(a => a.type === 'skip').map(a => a.description);
    if (declared) {
      if (status !== 'skipped') invalid.push({ kind: 'declared-skip-not-skipped', key: e.key, status });
      else if (!reasons.length || !reasons.every(r => r === inv.declaredSkip.reason)) invalid.push({ kind: 'skip-reason-changed', key: e.key });
      continue;
    }
    if (status === 'skipped') invalid.push({ kind: 'new-skip', key: e.key });
    else if (t.annotations?.some(a => a.type === 'fixme' || a.type === 'fail')) invalid.push({ kind: 'fixme-or-fail-annotation', key: e.key });
    else if (status === 'interrupted') incomplete.push({ kind: 'interrupted', key: e.key });
    else if (!CAPTURED.has(status)) incomplete.push({ kind: 'unknown-status', key: e.key, status });
  }
  return { verdict: invalid.length ? 'INVALID' : incomplete.length ? 'INCOMPLETE' : 'VALID', invalid, incomplete, expectedCases: expected.length, reportedCases: [...seen.values()].reduce((n, a) => n + a.length, 0) };
}
