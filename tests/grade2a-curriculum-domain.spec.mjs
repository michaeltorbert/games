// Issue #219: Grade 2-A Chapter 1 authority and Place by Place generators.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const scope = vm.createContext({ console });
  for (const file of ['shared/curriculum.js', 'shared/grade2a-curriculum.js', 'place-value-practice/arithmetic-domain.js',
    'place-value-practice/book-practice-domain.js', 'place-value-practice/grade2a-book-domain.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), scope, { filename: file });
  }
  return scope;
}
const { MATH_CURRICULUM: c1, MATH_CURRICULUM_2A: c, PLACE_BOOK: b1, PLACE_BOOK_2A: b } = load();
const plain = value => JSON.parse(JSON.stringify(value));

test('source identity, Chapter 1 boundaries, and every lesson mapped to runnable families', () => {
  assert.equal(c.BOOK, 'Math Mammoth Grade 2-A');
  assert.deepEqual(plain(c.SOURCE), { copyright: '2012-2025', created: '2025-09-06', sha256: 'ff96fc64c6d05a4b961ab4ea46920be86de06cb0af15c84cb311b3445a7a6bf2' });
  assert.equal(c.LAST_PAGE, 161);
  assert.equal(c.CHAPTER1_FIRST, 10); assert.equal(c.CHAPTER1_LAST, 32);
  assert.equal(c.LESSONS.length, 10);
  for (const lesson of c.LESSONS) {
    const rows = c.CATALOG.filter(skill => skill.lesson === lesson.id);
    assert.ok(rows.length >= 1, lesson.title);
    assert.ok(rows.every(skill => skill.page >= lesson.pages[0] && skill.page <= lesson.pages.at(-1)), lesson.title);
  }
  // Every printed Chapter 1 page with ordinary new work unlocks at least one family.
  for (const page of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) {
    assert.ok(c.CATALOG.some(skill => skill.page === page), `page ${page}`);
  }
  assert.ok(c.CATALOG.every(skill => skill.chapter === 1 && skill.page >= 10 && skill.page <= 32 && skill.optional === false));
  assert.deepEqual(plain(c.OMITTED_OPTIONAL.map(item => item.page)), [16, 18, 23, 28, 30]);
  // The Grade 1-B authority and baseline are untouched.
  assert.equal(c1.BASELINE.completedThroughPage, 113); assert.equal(c1.LAST_PAGE, 187);
});

test('completion gating is page-exact; starting the book unlocks nothing; later pages add no new practice', () => {
  assert.equal(c.available(0).length, 0);
  assert.equal(c.available(9).length, 0);
  for (const skill of c.CATALOG) {
    assert.equal(c.available(skill.page - 1).some(x => x.id === skill.id), false, skill.id);
    assert.equal(c.available(skill.page).some(x => x.id === skill.id), true, skill.id);
  }
  assert.equal(c.available(32).length, c.CATALOG.length);
  assert.equal(c.available(161).length, c.CATALOG.length);
  for (const bad of [-1, 162, NaN, 1.5, '10']) assert.equal(c.validPage(bad), false);
  assert.equal(c.needsConfirmation(0, 5), false);
  assert.equal(c.needsConfirmation(0, 10), true, 'entering Chapter 1');
  assert.equal(c.needsConfirmation(14, 20), false);
  assert.equal(c.needsConfirmation(14, 13), true);
  assert.equal(c.needsConfirmation(30, 34), true, 'leaving Chapter 1');
  assert.equal(c.normalize({ schemaVersion: 1, worktext: c.BOOK, edition: '2023', completedThroughPage: 12, revision: 1, updatedAt: 'x', provenance: 'learner-reported' }), null);
  assert.ok(c.normalize({ schemaVersion: 1, worktext: c.BOOK, edition: c.EDITION, completedThroughPage: 12, revision: 1, updatedAt: 'x', provenance: 'learner-reported' }));
  // A Grade 1-B record never validates as Grade 2-A, or the reverse.
  assert.equal(c.normalize({ schemaVersion: 1, worktext: c1.BOOK, edition: 2026, completedThroughPage: 12, revision: 1, updatedAt: 'x', provenance: 'learner-reported' }), null);
  assert.equal(c1.normalize({ schemaVersion: 1, worktext: c.BOOK, edition: c.EDITION, completedThroughPage: 12, revision: 1, updatedAt: 'x', provenance: 'learner-reported' }), null);
});

test('every generator is answerable, bounded to Chapter 1 content, and explains itself', () => {
  for (const skill of c.CATALOG) {
    for (let n = 0; n < 60; n++) {
      const q = b.question(skill, n);
      const label = `${skill.id}#${n}`;
      assert.equal(q.skillId, skill.id); assert.equal(q.page, skill.page);
      assert.ok(q.prompt && q.help, label);
      assert.ok(q.choices.includes(q.answer), label);
      assert.equal(new Set(q.choices).size, q.choices.length, label);
      assert.ok(q.choices.length >= 2 && q.choices.length <= 4, label);
      // No multiplication/division notation, negatives, fractions beyond 1/2, or numbers past 100.
      assert.doesNotMatch(q.prompt, /[×÷*]|\b\d+\/(?!2\b)\d+/, label);
      for (const value of `${q.prompt} ${q.choices.join(' ')}`.match(/-?\d+/g) || []) {
        assert.ok(Number(value) >= 0 && Number(value) <= 100, `${label}: ${value}`);
      }
      if (/^\d+$/.test(q.answer)) assert.ok(Number(q.answer) <= 100, label);
      if (q.math) {
        const [first, ...rest] = q.math.operands;
        const total = q.math.op === 'add' ? rest.reduce((x, y) => x + y, first) : rest.reduce((x, y) => x - y, first);
        const missing = q.math.answerRow === 1 ? q.math.operands[1] : total;
        assert.equal(String(missing), q.answer, label);
        assert.ok(total >= 0 && total <= 100, label);
      }
    }
  }
});

test('page-specific scope: no general borrowing, no carrying before page 14, halving forms by page', () => {
  const bySkill = id => c.CATALOG.find(skill => skill.id === id);
  const early = c.CATALOG.filter(skill => skill.page < 14 && skill.id !== '2a-tens-minus-digit');
  for (const skill of early) for (let n = 0; n < 60; n++) {
    const q = b.question(skill, n);
    if (q.math?.op === 'add' && q.math.answerRow === null && q.math.operands.length === 2) {
      const [x, y] = q.math.operands; assert.ok(x % 10 + y % 10 <= 9, `${skill.id}#${n} carries before p14`);
    }
  }
  for (const skill of c.CATALOG) for (let n = 0; n < 60; n++) {
    const q = b.question(skill, n);
    if (q.math?.op === 'sub' && q.math.operands.length === 2) {
      const [x, y] = q.math.operands;
      // Single-digit fact families (totals through 18) are facts, not multi-digit borrowing.
      assert.ok(x % 10 >= y % 10 || (x % 10 === 0 && y <= 9) || (x <= 18 && y <= 9), `${skill.id}#${n} general borrowing ${x}-${y}`);
    }
  }
  // Page 24 halves only small even sets and the lesson's 10, 24, 40.
  for (let n = 0; n < 60; n++) {
    const q = b.question(bySkill('2a-halves-shapes-sets'), n);
    const m = q.prompt.match(/(?:half of|1\/2 of) (\d+)/);
    if (m) assert.ok([6, 8, 10, 12, 14, 20, 24, 40].includes(Number(m[1])), q.prompt);
  }
  // Page 25 grouped halving includes the lesson's 48 and 80 forms; page 32 reviews 50, 88, 46.
  const halves = id => new Set(Array.from({ length: 200 }, (_, n) => b.question(bySkill(id), n).prompt.match(/half of (\d+)\?/)?.[1]).filter(Boolean).map(Number));
  const p25 = halves('2a-halves-numbers');
  assert.ok(p25.has(48) && p25.has(80), [...p25].join(','));
  for (const n of p25) assert.ok(n % 2 === 0 && n <= 100 && (n <= 30 || n % 10 === 0 || (Math.floor(n / 10) % 2 === 0 && n % 2 === 0)), String(n));
  const p32 = halves('2a-halves-review');
  for (const n of [50, 88, 46]) assert.ok(p32.has(n), String(n));
});

test('ordinary unit coverage: chart skip-4, nth vs first n, letter grid, fact-family four relations, parity rule', () => {
  const prompts = id => Array.from({ length: 80 }, (_, n) => b.question(c.CATALOG.find(skill => skill.id === id), n));
  assert.ok(prompts('2a-chart-skip').some(q => q.prompt.startsWith('Skip-count by 4s')));
  const nth = prompts('2a-ordinal-nth-first');
  assert.ok(nth.some(q => q.answer.startsWith('the first')) && nth.some(q => /^the \d+(st|nd|rd|th) ball/.test(q.answer)));
  assert.ok(prompts('2a-ordinal-grid').every(q => q.visual.kind === 'letter-grid' && q.visual.grid.length === 7 && q.visual.grid.every(r => r.length === 7)));
  assert.ok(prompts('2a-ordinal-position').some(q => q.answer.includes('(') ));
  assert.ok(prompts('2a-fact-family').some(q => q.answer === '4'));
  assert.ok(prompts('2a-even-odd-rule').some(q => q.help.includes('0, 2, 4, 6, or 8')));
  assert.ok(prompts('2a-missing-tens').some(q => q.prompt.includes('even or odd')));
  assert.ok(prompts('2a-tens-patterns-stories').some(q => q.prompt.startsWith('Three games cost')));
  assert.ok(prompts('2a-add-whole-tens').some(q => q.math.operands[0] % 10 === 0) && prompts('2a-add-whole-tens').some(q => q.math.operands[1] % 10 === 0));
});

test('the 2-A book store is separate: answers, restarts, and normalization never use Grade 1-B shapes', () => {
  const state = b.create(14);
  assert.ok(b.normalize(state));
  assert.equal(b1.normalize(state), null);
  assert.equal(b.normalize(b1.create(113)), null);
  for (let i = 0; i < 20; i++) {
    const q = b.current(state);
    assert.ok(q.page <= 14);
    const wrong = q.choices.find(x => x !== q.answer);
    assert.ok(b.answer(state, wrong)); assert.ok(b.answer(state, q.answer));
    assert.equal(b.explain(state).kind.length > 0, true);
    assert.ok(b.normalize(state)); assert.ok(b.next(state));
  }
  assert.equal(state.completed, 20); assert.equal(state.firstTry, 0);
  const lesson = { ...b.create(32, 7) };
  for (let i = 0; i < 10; i++) { assert.equal(b.current(lesson).lesson, 7); lesson.serial++; }
  assert.equal(b.current(b.create(9)), null);
});

// R1: every ordinary variant must be reachable through real sessions
// (create/current/answer/next), in each lesson topic and in All completed.
const kind = q => {
  const p = q.prompt, ops = q.math?.operands ?? [];
  switch (q.skillId) {
    case '2a-base-ten-read': return p.startsWith('How many tens') ? 'tens' : 'number';
    case '2a-add-no-carry': return ops[1] < 10 ? 'one-digit' : ops[0] % 10 === 0 && ops[1] % 10 === 0 ? 'whole-tens' : 'two-digit';
    case '2a-subtract-no-borrow': return ops[1] < 10 ? 'one-digit' : 'two-digit';
    case '2a-missing-ones-tens': return ops[1] % 10 === 0 ? 'tens' : 'ones';
    case '2a-review-stories': return /more stickers/.test(p) ? 'more' : /How many more/.test(p) ? 'compare' : 'total';
    case '2a-chart-skip': case '2a-chart-patterns': return p.match(/by (\d+)s( backward)?/).slice(1).join('');
    case '2a-chart-neighbors': return p.match(/just (\w+)/)[1];
    case '2a-cross-ten': return ops[1] < 10 ? 'one-digit' : 'two-digit';
    case '2a-repeated-subtract': return q.math ? `minus-${ops[1]}` : 'third-addend';
    case '2a-fact-family': return /^Which/.test(p) ? 'match' : /So/.test(p) ? 'undo' : /^\?/.test(p) ? 'missing-total' : 'count';
    case '2a-fact-family-100': return /^Which/.test(p) ? 'match' : /So/.test(p) ? 'undo' : 'missing-total';
    case '2a-ordinal-position': return `${/^Which/.test(p) ? 'letter' : 'place'}-${/right/.test(p) ? 'right' : 'left'}`;
    case '2a-ordinal-nth-first': return `${q.answer.startsWith('the first') ? 'first' : 'nth'}-${q.answer.endsWith('right') ? 'right' : 'left'}`;
    case '2a-ordinal-grid': return `${/bottom/.test(p) ? 'bottom' : 'top'}-${/column from the right/.test(p) ? 'right' : 'left'}`;
    case '2a-even-odd-pairs': return /^Put/.test(p) ? 'parity' : 'leftover';
    case '2a-even-odd-rule': return /^Put/.test(p) ? 'pairs' : /^Is/.test(p) ? 'digit' : 'which';
    case '2a-doubles': return ops[0] % 10 === 0 ? 'tens' : ops[0] > 15 ? 'two-digit' : 'small';
    case '2a-share-even': return /friends/.test(p) ? 'share' : /together/.test(p) ? 'combined' : 'yes-no';
    case '2a-double-inverse': return /doubled/.test(p) ? 'what-number' : 'stickers';
    case '2a-halves-shapes-sets': return /cut/.test(p) ? `shape-${q.visual.equal ? 'equal' : 'unequal'}` : /^What is half/.test(p) ? 'half-of' : /is \d+\. What/.test(p) ? 'sum' : 'notation';
    case '2a-halves-numbers': case '2a-halves-review': {
      const m = p.match(/^What is half of (\d+)/);
      if (m) { const n = Number(m[1]); return n <= 30 && n % 10 ? 'half-small' : n % 10 === 0 ? 'half-tens' : 'half-grouped'; }
      return /^Double/.test(p) ? 'double' : /^Half of a number/.test(p) ? 'inverse' : 'story';
    }
    case '2a-add-whole-tens': return ops[0] % 10 === 0 ? 'tens-first' : 'tens-second';
    case '2a-tens-stories': return /costs/.test(p) ? 'cost' : /left/.test(p) ? 'left' : /^Double/.test(p) ? 'double' : 'share';
    case '2a-missing-tens': return /even or odd/.test(p) ? 'parity' : 'missing';
    case '2a-subtract-whole-tens': return /Count back/.test(p) ? 'count-back' : 'subtract';
    case '2a-tens-patterns-stories': { const t = q.visual?.terms; return t ? `pattern-${t[1] > t[0] ? 'up' : 'down'}` : /shelf/.test(p) ? 'shelf' : 'games'; }
    case '2a-chapter-review': return q.reviewOf;
    default: return 'one';
  }
};
const EXPECTED = {
  '2a-base-ten-read': ['tens', 'number'], '2a-add-no-carry': ['one-digit', 'whole-tens', 'two-digit'],
  '2a-subtract-no-borrow': ['one-digit', 'two-digit'], '2a-missing-ones-tens': ['tens', 'ones'],
  '2a-review-stories': ['more', 'compare', 'total'], '2a-chart-skip': ['5', '2', '2 backward', '4'],
  '2a-chart-neighbors': ['below', 'above', 'right', 'left'], '2a-chart-patterns': ['2', '5', '10', '2 backward', '5 backward', '10 backward'],
  '2a-cross-ten': ['one-digit', 'two-digit'], '2a-repeated-subtract': ['minus-10', 'minus-20', 'minus-5', 'third-addend'],
  '2a-fact-family': ['match', 'undo', 'missing-total', 'count'], '2a-fact-family-100': ['match', 'undo', 'missing-total'],
  '2a-ordinal-position': ['letter-left', 'letter-right', 'place-left', 'place-right'],
  '2a-ordinal-nth-first': ['first-left', 'first-right', 'nth-left', 'nth-right'],
  '2a-ordinal-grid': ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  '2a-even-odd-pairs': ['parity', 'leftover'], '2a-even-odd-rule': ['pairs', 'digit', 'which'],
  '2a-doubles': ['small', 'tens', 'two-digit'], '2a-share-even': ['share', 'combined', 'yes-no'],
  '2a-double-inverse': ['what-number', 'stickers'],
  '2a-halves-shapes-sets': ['shape-equal', 'shape-unequal', 'half-of', 'notation', 'sum'],
  '2a-halves-numbers': ['half-small', 'half-tens', 'half-grouped', 'double', 'inverse', 'story'],
  '2a-halves-review': ['half-tens', 'half-grouped', 'double', 'inverse', 'story'],
  '2a-add-whole-tens': ['tens-first', 'tens-second'], '2a-tens-stories': ['cost', 'left', 'double', 'share'],
  '2a-missing-tens': ['parity', 'missing'], '2a-subtract-whole-tens': ['count-back', 'subtract'],
  '2a-tens-patterns-stories': ['pattern-up', 'pattern-down', 'shelf', 'games'],
  '2a-chapter-review': b.REVIEWED,
};
function run(page, lesson, steps) {
  const state = b.create(page, lesson), seen = new Map(), halves = new Set();
  for (let i = 0; i < steps; i++) {
    const q = b.current(state);
    if (!q) return { seen, halves, empty: true };
    assert.ok(q.page <= page && (!lesson || q.lesson === lesson), `${q.skillId} at page ${page} lesson ${lesson}`);
    if (!seen.has(q.skillId)) seen.set(q.skillId, new Set());
    seen.get(q.skillId).add(kind(q));
    const half = q.prompt.match(/^What is half of (\d+)/); if (half) halves.add(Number(half[1]));
    if (i % 7 === 0) assert.ok(b.answer(state, q.choices.find(x => x !== q.answer)));
    assert.ok(b.answer(state, q.answer)); assert.ok(b.normalize(state)); assert.ok(b.next(state));
  }
  return { seen, halves, empty: false };
}
const missing = (seen, ids) => plain([...ids].flatMap(id => (EXPECTED[id] ?? ['one']).filter(k => !seen.get(id)?.has(k)).map(k => `${id}:${k}`)));

test('R1: every lesson topic reaches every ordinary variant of each family through real sessions', () => {
  for (const lesson of c.LESSONS) {
    const ids = c.CATALOG.filter(s => s.lesson === lesson.id).map(s => s.id);
    const { seen, halves } = run(32, lesson.id, lesson.id === 10 ? 1200 : 240);
    assert.deepEqual(missing(seen, ids), [], lesson.title);
    if (lesson.id === 7) for (const n of [48, 80]) assert.ok(halves.has(n), `half of ${n} reached`);
    if (lesson.id === 10) for (const n of [50, 88, 46]) assert.ok(halves.has(n), `half of ${n} reached`);
  }
});

test('R1: All completed reaches every variant at page 32, and page boundaries only show completed families', () => {
  const { seen } = run(32, 0, 32 * 40);
  assert.deepEqual(missing(seen, c.CATALOG.map(s => s.id).filter(id => id !== '2a-chapter-review')), []);
  assert.deepEqual(missing(seen, ['2a-chapter-review']).length < b.REVIEWED.length, true);
  for (const page of [9, 10, 11, 13, 14, 16, 18, 20, 23, 25, 28, 30, 31, 32, 33, 161]) {
    const allowed = c.available(page).map(s => s.id);
    const result = run(page, 0, Math.max(1, allowed.length) * 24);
    assert.equal(result.empty, allowed.length === 0, `page ${page}`);
    if (result.empty) continue;
    assert.deepEqual([...result.seen.keys()].sort(), plain(allowed).sort(), `page ${page}`);
    assert.deepEqual(missing(result.seen, allowed.filter(id => id !== '2a-chapter-review')), [], `page ${page}`);
  }
  // A lesson whose pages are not complete stays empty: starting the book unlocks nothing early.
  assert.equal(run(14, 3, 5).empty, true);
  assert.equal(run(0, 0, 5).empty, true);
});
