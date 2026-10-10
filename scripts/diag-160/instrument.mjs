// Issue #160 test-time response instrumentation for football/football.js.
// Pure: anchored literal insertions with exact expected counts, computed in one
// pass over the original text. Each inserted statement is a new line that only
// reads values and calls Date.now, performance.now and the diagnostic buffer's
// push (installed by fixture.mjs; `?.` makes it inert if absent). Nothing wraps
// setTimeout or clearTimeout, and no native argument, result or call order
// changes. The served file is used only after its sha256 matches the run
// manifest (fixture.mjs).
import crypto from 'node:crypto';

export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

const push = (indent, fields) =>
  `${indent}globalThis.__diag160?.push({ ${fields}, w: Date.now(), m: performance.now() });`;

// `after` anchors end with a newline, so every insertion lands on its own line.
export const INSERTIONS = Object.freeze([
  {
    name: 'arm',
    anchor: '    advTimer = setTimeout(() => routePossessionPresentation(message, source), 1400);\n',
    expected: 1,
    text: () => push('    ', "k: 'arm', id: advTimer, delay: 1400, src: source"),
  },
  {
    name: 'route',
    anchor: 'function routePossessionPresentation(message, expectedSource = null) {\n',
    expected: 1,
    text: () => push('  ', "k: 'route', tid: advTimer, src: expectedSource, live: { gameId: state.gameId ?? null, "
      + 'possessionId: state.possessionId ?? null, phase: state.phase ?? null, quarter: state.quarter ?? null, '
      + 'quarterPossessions: state.quarterPossessions ?? null }'),
  },
  {
    name: 'intent',
    anchor: '    possessionsPerQuarter: POSSESSIONS_PER_QUARTER,\n    expectedSource,\n  });\n',
    expected: 1,
    text: () => push('  ', "k: 'intent', accepted: intent.accepted, kind: intent.kind ?? null, reason: intent.reason ?? null"),
  },
  {
    name: 'activate-enter',
    anchor: 'function activateOverlay(id) {\n',
    expected: 1,
    text: () => push('  ', "k: 'activate-enter', id"),
  },
  {
    name: 'activate',
    anchor: '  setGameUiInert(true);\n  focusActiveOverlay(active);\n',
    expected: 1,
    text: () => push('  ', "k: 'activate', id"),
  },
  {
    // The buffer keeps a clear only when its id is an armed target id.
    name: 'clear',
    anchor: '  clearTimeout(advTimer);\n',
    expected: 9,
    text: line => push('  ', `k: 'clear', site: ${line}, id: advTimer`),
  },
]);

export function instrument(source) {
  if (source.includes('__diag160')) throw new Error('diag160: source already instrumented');
  const edits = [];
  const counts = {};
  const sites = {};
  for (const { name, anchor, expected, text } of INSERTIONS) {
    sites[name] = [];
    for (let at = source.indexOf(anchor); at !== -1; at = source.indexOf(anchor, at + anchor.length)) {
      const line = source.slice(0, at).split('\n').length;
      sites[name].push(line);
      edits.push({ end: at + anchor.length, text: text(line) });
    }
    counts[name] = sites[name].length;
    if (counts[name] !== expected) throw new Error(`diag160 anchor ${name}: expected ${expected}, found ${counts[name]}`);
  }
  edits.sort((a, b) => a.end - b.end);
  let code = '';
  let last = 0;
  for (const edit of edits) {
    code += source.slice(last, edit.end) + edit.text + '\n';
    last = edit.end;
  }
  code += source.slice(last);
  const insertedLines = code.split('\n').flatMap((line, i) => (line.includes('__diag160') ? [i + 1] : []));
  if (insertedLines.length !== edits.length) throw new Error('diag160: inserted line count mismatch');
  return { code, counts, sites, insertedLines, originalSha256: sha256(source), instrumentedSha256: sha256(code) };
}
