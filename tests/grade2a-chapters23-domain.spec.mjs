// Issue #223: Grade 2-A Chapters 2-3 catalog, generators, gates, Football's
// page-73 relation, and the schema-1 → schema-2 run state. Expectations here
// are written independently of the generators: the inventory below is typed
// from the reconciled source inventory, and answers are checked with separate
// oracles (JavaScript Date in UTC for calendars, minute arithmetic for clocks).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const FILES = ['shared/curriculum.js', 'shared/grade2a-curriculum.js', 'place-value-practice/arithmetic-domain.js',
  'place-value-practice/book-practice-domain.js', 'place-value-practice/grade2a-chapters23-domain.js',
  'place-value-practice/grade2a-book-domain.js', 'place-value-practice/grade2a-book-visuals.js'];
const scope = vm.createContext({ console });
for (const file of FILES) vm.runInContext(fs.readFileSync(file, 'utf8'), scope, { filename: file });
const { MATH_CURRICULUM_2A: c, PLACE_BOOK_2A: b, PLACE_BOOK_2A_VISUALS: vis } = scope;
const plain = value => JSON.parse(JSON.stringify(value));
const byId = id => c.CATALOG.find(k => k.id === id);
const CH1 = c.CATALOG.filter(k => k.chapter === 1);
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/grade2a223-legacy.json', 'utf8'));

// [id, page, lesson, variants] typed from the reconciled inventory.
const INVENTORY = [
  ['2a-clock-whole-half', 37, 11, ['read', 'digital', 'plus-hour', 'plus-half']],
  ['2a-minutes-hand', 38, 12, ['numeral-to-minutes', 'minutes-to-numeral', 'facts']],
  ['2a-minutes-read', 39, 12, ['labeled', 'standard']],
  ['2a-minutes-match', 40, 12, ['clock-match', 'plus-five']],
  ['2a-late-read', 41, 13, ['read-late', 'set-hand']],
  ['2a-late-plus-five', 42, 13, ['rollover', 'late']],
  ['2a-past', 43, 14, ['clock', 'digital', 'plus-five']],
  ['2a-till', 44, 14, ['clock', 'digital']],
  ['2a-time-forms', 45, 14, ['words-to-digital', 'digital-to-words', 'clock-to-digital', 'clock-to-words']],
  ['2a-hours-am-pm', 46, 15, ['am-pm', 'noon-midnight', 'same-half', 'across-noon', 'twelve']],
  ['2a-hours-overnight', 47, 15, ['to-midnight', 'overnight', 'overnight-start', 'two-durations', 'day-hours', 'start-time']],
  ['2a-weekdays', 49, 16, ['abbreviation', 'before-after', 'plus-days', 'calendar']],
  ['2a-months', 50, 16, ['length', 'february', 'order', 'count']],
  ['2a-dates-weekly', 51, 17, ['recurring', 'next-same', 'format']],
  ['2a-dates-events', 52, 17, ['event-date', 'event-weekday', 'full-date', 'tomorrow', 'first-weekday', 'last-weekday', 'plus-days', 'plus-months']],
  ['2a-dates-weeks', 53, 17, ['week-after', 'two-weeks-after', 'week-before', 'two-weeks-before', 'biweekly']],
  ['2a-plus-ten-min', 54, 18, ['plus-ten']],
  ['2a-hours-later', 54, 18, ['end-time']],
  ['2a-ch2-review', 54, 18, null],
  ['2a-nearest-ten', 59, 19, ['between', 'nearer']],
  ['2a-next-ten-review', 59, 19, ['to-next-ten', 'helping', 'even', 'inverse-double']],
  ['2a-next-ten-plus', 60, 19, ['ten-then-one', 'whole-ten-sum', 'missing-middle', 'pair-to-100']],
  ['2a-make-ten-visual', 61, 20, ['frames-total', 'split', 'ten-and']],
  ['2a-make-ten-split', 62, 20, ['decompose', 'pattern', 'parity', 'money', 'match', 'money-events']],
  ['2a-add-nine', 63, 21, ['move', 'fact', 'double']],
  ['2a-add-nine-more', 64, 21, ['zero-ten', 'swapped', 'missing-second', 'missing-first']],
  ['2a-add-eight', 65, 22, ['move', 'fact', 'double']],
  ['2a-add-eight-more', 66, 22, ['zero-ten', 'swapped', 'missing-second', 'missing-first', 'more-story', 'older', 'plus-even', 'half-pattern']],
  ['2a-add-seven', 67, 23, ['fact', 'near-double', 'double']],
  ['2a-add-seven-more', 68, 23, ['zero-ten', 'swapped', 'missing', 'table']],
  ['2a-add-six', 69, 24, ['fact', 'make-ten', 'near-double', 'missing']],
  ['2a-add-six-more', 70, 24, ['three-ten', 'four-ten', 'missing-start', 'missing-change', 'compare', 'multistep', 'removal-start', 'removal-cost', 'removals-start', 'more-than']],
  ['2a-facts-crossing', 71, 25, ['fact', 'pattern', 'pattern-missing']],
  ['2a-facts-table-stories', 72, 25, ['table', 'inverse-story', 'compare-story', 'three-no-pair', 'four-terms', 'removal-start', 'fewer-unknown', 'more-unknown']],
  ['2a-subtract-to-ten', 73, 26, ['to-ten', 'split-step', 'split-result']],
  ['2a-subtract-to-ten-more', 74, 26, ['direct', 'twenties', 'missing-takeaway']],
  ['2a-difference-line', 75, 27, ['line', 'equation', 'whole-tens', 'neighbors']],
  ['2a-how-many-more', 76, 27, ['missing-addend', 'how-many-more', 'strategy', 'near-count-up', 'wide-difference']],
  ['2a-compare-stories', 77, 27, ['compare', 'left', 'dozen', 'three-total', 'both-updated', 'unequal-gains', 'durations-compare', 'pages-left', 'wide-compare']],
  ['2a-rainbow-11-12', 78, 28, ['partner', 'subtract']],
  ['2a-rainbow-11-12-fill', 79, 28, ['endpoint', 'related']],
  ['2a-family-11', 80, 29, ['belongs', 'missing-part', 'groups', 'direct']],
  ['2a-family-12', 81, 30, ['related', 'review-11', 'double-six', 'direct', 'ten-family']],
  ['2a-family-12-more', 82, 30, ['missing-first', 'missing-second', 'missing-11', 'explanation', 'pattern-17', 'pattern-odd']],
  ['2a-rainbow-13-14', 83, 31, ['endpoint', 'subtract']],
  ['2a-family-13', 84, 32, ['related', 'match', 'direct', 'ten-family']],
  ['2a-family-14', 85, 32, ['related', 'double-seven', 'direct', 'missing-minuend', 'missing-subtrahend', 'ten-family']],
  ['2a-family-14-stories', 86, 32, ['three-term', 'compare-story', 'change-story', 'plus-eight', 'plus-four', 'share-one-each', 'more-than']],
  ['2a-family-15', 87, 33, ['related', 'direct', 'explanation', 'ten-family', 'skip-three']],
  ['2a-family-15-review', 88, 33, ['bigger-unknown', 'smaller-unknown', 'difference-unknown', 'even-double', 'combine-half', 'parity', 'dollars', 'dollars-tens']],
  ['2a-family-16', 89, 34, ['related', 'double-eight', 'mixed', 'ten-family']],
  ['2a-family-16-stories', 90, 34, ['skip-three', 'skip-four', 'afford', 'money-left', 'shortfall', 'compare-expr', 'compare-number-sum', 'compare-subtract', 'one-changed-compare', 'two-removals']],
  ['2a-family-17-18', 91, 35, ['related-17', 'related-18', 'count-sentences', 'mixed']],
  ['2a-family-17-18-review', 92, 35, ['compare-expr', 'missing-position', 'durations', 'packages', 'journey']],
  ['2a-elapsed-minutes', 93, 36, ['same-hour']],
  ['2a-mixed-review-93', 93, 36, ['late-read', 'plus-five', 'sets-halved', 'inverse-double', 'double-of']],
  ['2a-mixed-review-94', 94, 36, ['journey', 'half-total', 'inverse-half', 'age-difference', 'update-compare', 'age-tens', 'half-then-total', 'more-quantity']],
  ['2a-review-95', 95, 37, ['fact', 'same-family', 'difference', 'difference-close', 'difference-wide']],
  ['2a-review-96', 96, 37, ['missing', 'journey', 'odd-odd', 'odd-even', 'share', 'two-digit-parity']],
  ['2a-review-97', 97, 37, ['decode', 'compare-role', 'shortfall', 'board-remaining', 'finishing-pair', 'more-than', 'compare-both']],
];
const CH2_REVIEWED = ['2a-clock-whole-half', '2a-minutes-hand', '2a-minutes-read', '2a-minutes-match', '2a-late-read', '2a-late-plus-five', '2a-past', '2a-till',
  '2a-time-forms', '2a-hours-am-pm', '2a-hours-overnight', '2a-weekdays', '2a-months', '2a-dates-weekly', '2a-dates-events', '2a-dates-weeks'];
const expectedVariants = id => INVENTORY.find(r => r[0] === id)[3] ?? CH2_REVIEWED;
const NEW = c.CATALOG.filter(k => k.chapter > 1);
const sample = (id, n = 240) => Array.from({ length: n }, (_, i) => b.question(byId(id), i));

// Drive a real session: create/current/answer/next, sometimes missing first.
function run(page, lesson, steps, check = () => {}) {
  const s = b.create(page, lesson), seen = new Map();
  for (let i = 0; i < steps; i++) {
    const q = b.current(s);
    if (!q) return { seen, empty: true, s };
    check(q, s);
    if (!seen.has(q.skillId)) seen.set(q.skillId, new Set());
    seen.get(q.skillId).add(q.variant ?? 'ch1');
    if (i % 5 === 0) assert.ok(b.answer(s, q.choices.find(x => x !== q.answer)));
    assert.ok(b.answer(s, q.answer)); assert.equal(b.answer(s, q.answer), false, 'no double credit');
    assert.ok(b.next(s)); assert.equal(b.next(s), false, 'Next only once');
  }
  return { seen, empty: false, s };
}

test('catalog: Chapters 2-3 inventory, page order, chapters, lesson spans, and preserved Chapter 1 prefix', () => {
  assert.deepEqual(plain(NEW.map(k => [k.id, k.page, k.lesson])), INVENTORY.map(([id, page, lesson]) => [id, page, lesson]));
  assert.deepEqual(plain(c.CATALOG.slice(0, 32).map(k => k.id)), plain(CH1.map(k => k.id)));
  assert.equal(c.LESSONS.length, 37);
  assert.deepEqual(plain(c.LESSONS.slice(10).map(l => l.id)), Array.from({ length: 27 }, (_, i) => 11 + i));
  for (const k of NEW) {
    assert.equal(k.chapter, k.page <= 54 ? 2 : 3, k.id);
    const lesson = c.LESSONS.find(l => l.id === k.lesson);
    assert.ok(k.page >= lesson.pages[0] && k.page <= lesson.pages.at(-1), k.id);
    assert.equal(k.optional, false);
    assert.deepEqual(plain(b.question(k, 0).variant !== undefined), true);
  }
  for (const [id] of INVENTORY) assert.deepEqual(plain(scope.PLACE_BOOK_2A_CH23.VARIANTS[id]), expectedVariants(id), id);
  // Every ordinary learner page has at least one row; no-practice pages have none.
  const learner = [...Array.from({ length: 11 }, (_, i) => 37 + i), 49, 50, 51, 52, 53, 54, ...Array.from({ length: 39 }, (_, i) => 59 + i)];
  for (const p of learner) assert.ok(c.CATALOG.some(k => k.page === p), `page ${p}`);
  assert.deepEqual(plain(c.NO_PRACTICE_PAGES.map(x => x.page)), [33, 34, 35, 36, 48, 55, 56, 57, 58]);
  for (const p of [33, 34, 35, 36, 48, 55, 56, 57, 58]) assert.ok(!c.CATALOG.some(k => k.page === p), `page ${p}`);
  assert.deepEqual(plain(c.OMITTED_OPTIONAL_CH23.map(x => x.page)), [42, 64, 74, 82]);
  assert.deepEqual([c.chapter(32), c.chapter(33), c.chapter(54), c.chapter(55), c.chapter(97), c.chapter(98), c.chapter(161)], [1, 2, 2, 3, 3, 4, 4]);
  assert.equal(c.needsConfirmation(54, 55), true); assert.equal(c.needsConfirmation(97, 98), true); assert.equal(c.needsConfirmation(60, 65), false);
});

test('gates: each row exactly at its page; front matter, page 48, and pages past 97 add nothing', () => {
  const ids = page => plain(c.available(page).map(k => k.id));
  for (const k of NEW) {
    assert.equal(ids(k.page - 1).includes(k.id), false, `${k.id} before ${k.page}`);
    assert.equal(ids(k.page).includes(k.id), true, `${k.id} at ${k.page}`);
  }
  for (const p of [33, 34, 35, 36]) assert.deepEqual(ids(p), ids(32), `page ${p}`);
  assert.deepEqual(ids(48), ids(47));
  for (const p of [55, 56, 57, 58]) assert.deepEqual(ids(p), ids(54), `page ${p}`);
  for (const p of [98, 120, 161]) assert.deepEqual(ids(p), ids(97), `page ${p}`);
  assert.equal(c.available(97).length, c.CATALOG.length);
  assert.deepEqual(ids(32).length, 32);
  // The legacy ceiling never exposes Chapters 2-3, whatever the page.
  for (const p of [54, 97, 161]) assert.ok(c.available(p, c.LEGACY_CATALOG_THROUGH).every(k => k.chapter === 1));
  assert.deepEqual(plain(c.available(97, 50)), [], 'unknown ceilings expose nothing');
});

test('real sessions: every lesson topic reaches every variant; page boundaries show exactly the completed rows', () => {
  for (const lesson of c.LESSONS.filter(l => l.id > 10)) {
    const rows = INVENTORY.filter(r => r[2] === lesson.id);
    const steps = rows.reduce((n, r) => n + expectedVariants(r[0]).length, 0) * 3 * rows.length + 20;
    const { seen } = run(97, lesson.id, steps, q => assert.equal(q.lesson, lesson.id));
    for (const [id] of rows) assert.deepEqual([...(seen.get(id) ?? [])].sort(), [...expectedVariants(id)].sort(), id);
    // Topic sessions before the lesson's first page are empty (start of chapter unlocks nothing early).
    assert.equal(run(lesson.pages[0] - 1, lesson.id, 3).empty, true, lesson.title);
  }
  for (const page of [32, 33, 36, 37, 38, 46, 47, 48, 49, 53, 54, 55, 58, 59, 72, 73, 85, 86, 96, 97, 98, 161]) {
    const allowed = c.available(page).map(k => k.id);
    const { seen } = run(page, 0, allowed.length * 2, q => assert.ok(q.page <= page, `${q.skillId} at ${page}`));
    assert.deepEqual([...seen.keys()].sort(), [...allowed].sort(), `page ${page}`);
  }
  // All completed at 97 reaches every Chapters 2-3 variant.
  const { seen } = run(97, 0, 91 * 8 * 3);
  for (const [id] of INVENTORY) assert.deepEqual([...(seen.get(id) ?? [])].sort(), [...expectedVariants(id)].sort(), id);
});

test('every new question: answer among 2-4 unique choices, original wording rules, explanation present', () => {
  for (const k of NEW) for (const q of sample(k.id, 160)) {
    const label = `${k.id}#${q.variant}`;
    assert.ok(q.prompt && q.help, label);
    assert.ok(q.choices.includes(q.answer), label);
    assert.equal(new Set(q.choices).size, q.choices.length, label);
    assert.ok(q.choices.length >= 2 && q.choices.length <= 4, label);
    assert.doesNotMatch(`${q.prompt} ${q.choices.join(' ')}`, /[×÷*]|(^|[\s(])-\d|undefined|NaN/, label);
    assert.equal(q.page, k.page); assert.equal(q.lesson, k.lesson);
    // Numbers stay within the Book's ordinary range: years and the p86 sequence aside, at most 100.
    for (const n of `${q.prompt} ${q.choices.join(' ')}`.replace(/20[2-3]\d/g, '').match(/\d+/g) || []) {
      // p86's +8 count reaches 104 (its distractors may sit just past it).
      assert.ok(Number(n) <= (k.id === '2a-family-14-stories' ? 112 : 100), `${label}: ${n}`);
    }
  }
});

// Independent arithmetic oracle for the bare equation prompts.
function solve(prompt) {
  const m = prompt.match(/^(\?|\d+) ([+−]) (\?|\d+)((?: [+−] \d+)*) = (\?|\d+)$/);
  if (!m) return null;
  const [, a, op, bb, rest, total] = m;
  const tail = (rest.match(/[+−] \d+/g) || []).reduce((sum, t) => sum + (t[0] === '+' ? 1 : -1) * Number(t.slice(2)), 0);
  const f = (x, y) => (op === '+' ? x + y : x - y);
  if (total === '?') return f(Number(a), Number(bb)) + tail;
  if (a === '?') return op === '+' ? Number(total) - Number(bb) - tail : Number(total) + Number(bb) - tail;
  if (bb === '?') return op === '+' ? Number(total) - Number(a) - tail : Number(a) + tail - Number(total);
  return null;
}
test('arithmetic prompts are mathematically correct (independent parser)', () => {
  let checked = 0;
  for (const k of NEW.filter(k => k.chapter === 3)) for (const q of sample(k.id, 200)) {
    const p = q.prompt.replace(/^.*\. (?=[\d?][^.]*= [\d?]+$)/, '');
    const expected = solve(p);
    if (expected === null) continue;
    assert.equal(q.answer, String(expected), `${k.id}: ${q.prompt}`); checked++;
  }
  assert.ok(checked > 1500, String(checked));
});

const fmt = (h, m) => `${h}:${String(m).padStart(2, '0')}`;
const addMinutes = (h, m, n) => { const t = ((h % 12) * 60 + m + n) % 720; return fmt(Math.floor(t / 60) || 12, t % 60); };
test('clock: five-minute steps, page bounds, +5/+10 rules, words, and the hour hand between numerals', () => {
  const minuteBounds = { '2a-minutes-read': [0, 30], '2a-minutes-match': [0, 30], '2a-late-read': [5, 55], '2a-past': [0, 30], '2a-till': [35, 55], '2a-plus-ten-min': [0, 45] };
  let rollover = false, twelveToOne = false;
  for (const id of ['2a-clock-whole-half', '2a-minutes-read', '2a-minutes-match', '2a-late-read', '2a-late-plus-five', '2a-past', '2a-till', '2a-time-forms', '2a-plus-ten-min', '2a-mixed-review-93']) {
    for (const q of sample(id)) {
      const d = q.data; if (!d || d.h === undefined) continue;
      assert.equal(d.m % 5, 0); assert.ok(d.m >= 0 && d.m <= 55);
      if (minuteBounds[id]) assert.ok(d.m >= minuteBounds[id][0] && d.m <= minuteBounds[id][1], `${id} ${d.m}`);
      if (id === '2a-late-read' && q.variant === 'read-late') assert.ok(d.m >= 35);
      if (id === '2a-clock-whole-half') assert.ok([0, 30].includes(d.m));
      if (d.add) {
        const expected = addMinutes(d.h, d.m, d.add);
        if (/^\d+:\d\d$/.test(q.answer)) assert.equal(q.answer, expected, `${id} ${q.prompt}`);
        if (d.add === 10) assert.ok(d.m + 10 <= 55, 'page 54 +10 never crosses the hour');
        if (d.add === 5 && d.m === 55) { rollover = true; assert.equal(q.answer, fmt(d.h % 12 + 1, 0)); }
        if (d.add === 60 && d.h === 12) twelveToOne = true;
      } else if (/^\d+:\d\d$/.test(q.answer)) assert.equal(q.answer, fmt(d.h, d.m), `${id} ${q.prompt}`);
      if (/past|till|o'clock/.test(q.answer)) {
        const m = d.add ? (d.m + d.add) : d.m, h = d.h;
        const words = m === 0 ? `${h} o'clock` : m === 30 ? `half past ${h}` : m < 30 ? `${m} minute${m === 1 ? '' : 's'} past ${h}` : `${60 - m} minutes till ${h % 12 + 1}`;
        assert.equal(q.answer, words, `${id} ${q.prompt}`);
      }
      // The drawn hour hand points at (hour + minutes/60) × 30 degrees.
      if (q.visual?.kind === 'clock' && q.visual.hour) {
        const svg = vis.svg(q.visual), hand = [...svg.matchAll(/<line x1="160" y1="107" x2="([\d.-]+)" y2="([\d.-]+)" stroke="#233f3b"/g)][0];
        const deg = (Math.atan2(Number(hand[1]) - 160, 107 - Number(hand[2])) * 180 / Math.PI + 360) % 360;
        const want = ((q.visual.hour % 12) + q.visual.minute / 60) * 30;
        assert.ok(Math.abs(deg - want) < 0.5 || Math.abs(deg - want) > 359.5, `${q.visual.hour}:${q.visual.minute} ${deg} vs ${want}`);
      }
    }
  }
  assert.ok(rollover && twelveToOne);
  for (const q of sample('2a-minutes-hand')) assert.match(q.answer, /^\d+$/, 'page 38 never asks a full late-hour time');
  for (const q of sample('2a-elapsed-minutes')) { const d = q.data; assert.ok(d.m2 - d.m1 >= 5 && d.m2 - d.m1 <= 30 && d.m2 <= 55); assert.equal(q.answer, String(d.m2 - d.m1)); }
});

const hourOracle = H => { H = ((H % 24) + 24) % 24; return H === 0 ? '12 midnight' : H === 12 ? '12 noon' : `${H % 12 || 12} ${H < 12 ? 'AM' : 'PM'}`; };
test('hours: AM/PM, noon/midnight, same-day and overnight spans, start, bedtime, and end times', () => {
  const seen = new Set();
  for (const id of ['2a-hours-am-pm', '2a-hours-overnight', '2a-hours-later']) for (const q of sample(id)) {
    const d = q.data; if (!d) continue; seen.add(q.variant);
    if (q.variant === 'am-pm') assert.equal(q.answer.endsWith(d.H < 12 ? 'AM' : 'PM'), true);
    if (['same-half', 'across-noon', 'twelve', 'to-midnight'].includes(q.variant)) assert.equal(q.answer, String(d.H2 - d.H1));
    if (q.variant === 'overnight') { assert.equal(q.answer, String(24 - d.H1 + d.H2)); assert.ok(d.H1 >= 19 && d.H1 <= 24 && d.H2 >= 5 && d.H2 <= 9); }
    if (q.variant === 'overnight-start') { assert.equal(q.answer, hourOracle(d.H1)); assert.equal((24 - d.H1) + d.H2, d.d); assert.ok(d.H1 >= 20 && d.H1 <= 24); }
    if (q.variant === 'start-time') assert.equal(q.answer, hourOracle(d.H1));
    if (q.variant === 'end-time') { assert.equal(q.answer, hourOracle(d.H1 + d.d)); assert.ok(d.H1 < 12); }
  }
  const midnights = sample('2a-hours-overnight', 600).filter(q => q.variant === 'to-midnight').map(q => q.data.H1);
  assert.ok(midnights.some(H => H < 12) && midnights.includes(12) && midnights.some(H => H > 12), 'p47 counts from morning, noon and evening');
  assert.ok(sample('2a-hours-later', 200).some(q => q.data.H1 + q.data.d > 12), 'p54 end time crosses noon');
  assert.ok(sample('2a-hours-overnight', 600).some(q => q.variant === 'overnight-start' && q.data.H1 === 24));
  assert.equal(fs.readFileSync('place-value-practice/grade2a-chapters23-domain.js', 'utf8').match(/\bDate\b|Math\.random|performance\./), null, 'no clock or random reads');
});

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const full = t => `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`;
test('calendar: weekdays, month lengths, leap years, offsets with month and year wrap (Date oracle)', () => {
  let yearWrap = 0, leapSeen = new Set(), monthEnd = 0;
  for (const id of ['2a-weekdays', '2a-months', '2a-dates-weekly', '2a-dates-events', '2a-dates-weeks']) for (const q of sample(id, 400)) {
    const d = q.data; if (!d) continue;
    if (d.date && d.days !== undefined) {
      const t = utc(d.date.y, d.date.m, d.date.d + d.days);
      assert.equal(q.answer, q.variant === 'next-same' ? `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}` : full(t), `${id} ${q.prompt}`);
      if (t.getUTCFullYear() !== d.date.y) yearWrap++;
      if (t.getUTCMonth() !== d.date.m) monthEnd++;
    } else if (d.date) {
      if (DAYS.includes(q.answer)) assert.equal(q.answer, DAYS[utc(d.date.y, d.date.m, d.date.d).getUTCDay()], q.prompt);
      else assert.equal(q.answer, q.variant === 'full-date' ? full(utc(d.date.y, d.date.m, d.date.d)) : `${MONTHS[d.date.m]} ${d.date.d}`, q.prompt);
    }
    if (q.variant === 'length') assert.equal(q.answer, String(utc(2027, d.m + 1, 0).getUTCDate()));
    if (q.variant === 'february') { const n = utc(d.y, 2, 0).getUTCDate(); assert.equal(q.answer, String(n)); leapSeen.add(`${d.y}:${n}`); }
    if (q.variant === 'plus-days' && id === '2a-weekdays') assert.equal(q.answer, DAYS[(d.d + d.n) % 7]);
    if (q.variant === 'count') assert.equal(q.answer, String(d.n));
    if (q.variant === 'plus-months') { const t = utc(d.y, d.m + d.n, 1); assert.equal(q.answer, `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`); if (t.getUTCFullYear() > d.y) yearWrap++; }
    if (['recurring', 'first-weekday', 'last-weekday'].includes(q.variant)) {
      const dates = []; for (let day = 1; day <= utc(d.y, d.m + 1, 0).getUTCDate(); day++) if (utc(d.y, d.m, day).getUTCDay() === d.w) dates.push(day);
      const want = q.variant === 'recurring' ? dates.join(', ') : `${MONTHS[d.m]} ${q.variant === 'first-weekday' ? dates[0] : dates.at(-1)}`;
      assert.equal(q.answer, want, q.prompt);
    }
    // Calendar pictures show the stated month and year; no answer date or weekday name is spoken.
    if (q.visual?.kind === 'calendar') {
      const label = vis.describe(q.visual);
      assert.match(label, new RegExp(`${MONTHS[q.visual.month]}, year ${q.visual.year}`));
      if (!['event-date'].includes(q.variant)) assert.ok(!label.includes(q.answer), `${q.variant}: ${q.answer}`);
      const svg = vis.svg(q.visual), first = utc(q.visual.year, q.visual.month, 1).getUTCDay();
      assert.match(label, new RegExp(`Day 1 is in the \\w+ column \\(${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][first]}\\)`));
      assert.ok(svg.includes(`>${utc(q.visual.year, q.visual.month + 1, 0).getUTCDate()}</text>`));
    }
  }
  assert.ok(yearWrap > 5 && monthEnd > 20, `${yearWrap} ${monthEnd}`);
  for (const y of [2028, 2032]) assert.ok(leapSeen.has(`${y}:29`), [...leapSeen].join());
  assert.ok([...leapSeen].some(x => x.endsWith(':28')));
  assert.ok(sample('2a-dates-events', 400).some(q => q.variant === 'tomorrow' && /^January 1, /.test(q.answer)), 'Dec 31 → Jan 1');
});

test('Chapter 3 boundaries: nearest ten midpoint, zero/ten gates, crossing subtraction, 19 − 9, p86 104, p92 boxes, p96 parity, p97 code and dice', () => {
  for (const q of sample('2a-nearest-ten', 300).filter(q => q.variant === 'nearer')) {
    const o = q.data.n % 10; assert.equal(q.answer, o === 5 ? 'Both are equally near' : String(o < 5 ? q.data.n - o : q.data.n - o + 10));
    assert.ok(q.choices.includes('Both are equally near'));
  }
  assert.ok(sample('2a-nearest-ten', 300).some(q => q.answer === 'Both are equally near'));
  const prompts = id => sample(id, 300).map(q => q.prompt);
  const has = (id, re) => prompts(id).some(p => re.test(p));
  // +0 and +10 facts with 9 and 8 wait for pages 64 and 66 (10 + 10 is a page-63 double).
  for (const [id, n] of [['2a-add-nine', 9], ['2a-add-eight', 8]]) assert.ok(!has(id, new RegExp(`^(${n} \\+ (0|10) |(0|10) \\+ ${n} )`)), `${id} has no 0/10 facts`);
  assert.ok(has('2a-add-nine-more', /^9 \+ 0 /) && has('2a-add-nine-more', /^9 \+ 10 /) && has('2a-add-nine-more', /^10 \+ 9 /));
  assert.ok(has('2a-add-eight-more', /^8 \+ 0 /) && has('2a-add-eight-more', /^8 \+ 10 /));
  assert.ok(has('2a-add-seven', /^7 \+ 10 /) && has('2a-add-seven', /^9 \+ 10 /) && !has('2a-add-seven', /\+ 0 /));
  assert.ok(has('2a-add-seven-more', /^7 \+ 0 /));
  assert.ok(has('2a-add-six', /^6 \+ 0 /) && has('2a-add-six', /^6 \+ 10 /) && has('2a-add-six', /^10 \+ 6 /));
  assert.ok(has('2a-add-nine', /^10 \+ 10 = \?/), 'doubles reach 10 + 10 on page 63');
  const facts20 = new Set(sample('2a-facts-crossing', 200).filter(q => q.variant === 'fact').map(q => q.prompt.match(/\d+/g).map(Number).sort((x, y) => x - y).join('+')));
  assert.equal(facts20.size, 20);
  for (const q of [...sample('2a-subtract-to-ten'), ...sample('2a-subtract-to-ten-more')].filter(q => q.data)) {
    assert.ok(q.data.a >= 11 && q.data.a <= 18 && q.data.b <= 9 && q.data.a % 10 < q.data.b, q.prompt);
  }
  assert.ok(prompts('2a-subtract-to-ten').includes('19 − ? = 10'));
  assert.ok(sample('2a-family-16', 300).some(q => q.prompt === '19 − 9 = ?'));
  const eights = sample('2a-family-14-stories', 600).filter(q => q.variant === 'plus-eight');
  for (const q of eights) { const t = q.data.terms; assert.equal(t.length, 6); assert.ok(t.every((x, i) => !i || x - t[i - 1] === 8)); assert.ok(t.at(-1) <= 104); }
  assert.ok(eights.some(q => q.answer === '104'), 'p86 reaches 104');
  for (const q of sample('2a-family-17-18-review', 400).filter(q => q.variant === 'packages')) {
    const { size, need } = q.data, boxes = Math.ceil(need / size), left = boxes * size - need;
    assert.ok([2, 3].includes(boxes) && left > 0 && left < size);
    assert.equal(q.answer, `${boxes} boxes, ${left} left over`);
    assert.doesNotMatch(q.prompt + q.help, /÷|divide/);
  }
  for (const q of sample('2a-review-96', 400).filter(q => q.data)) {
    if (q.variant === 'odd-odd') { assert.ok(q.data.x % 2 && q.data.y % 2); assert.equal(q.answer, 'even'); }
    if (q.variant === 'odd-even') { assert.ok(q.data.x % 2 && !(q.data.y % 2)); assert.equal(q.answer, 'odd'); }
    if (q.variant === 'share') assert.equal(q.answer, (q.data.x + q.data.y) % 2 ? 'No' : 'Yes');
  }
  for (const q of sample('2a-review-97', 400)) {
    if (q.variant === 'decode') {
      const key = new Map(q.data.key), nums = q.data.key.map(k => k[0]);
      assert.equal(new Set(nums).size, nums.length);
      const word = q.data.facts.map(f => key.get(f.split(' + ').map(Number).reduce((x, y) => x + y))).join('');
      assert.equal(word, q.answer);
      assert.ok(q.choices.filter(w => w === word).length === 1);
    }
    if (q.variant === 'finishing-pair') {
      const sums = q.choices.map(ch => ch.split(' and ').map(Number)).map(([x, y]) => { assert.ok(x >= 1 && x <= 6 && y >= 1 && y <= 6); return x + y; });
      assert.equal(sums.filter(s => s === q.data.q).length, 1);
      assert.equal(q.answer.split(' and ').map(Number).reduce((x, y) => x + y), q.data.q);
    }
  }
});

test('rainbows: complements, and even totals show the middle number joined to itself', () => {
  for (const id of ['2a-rainbow-11-12', '2a-rainbow-11-12-fill', '2a-rainbow-13-14']) for (const q of sample(id, 300)) {
    if (q.visual?.kind !== 'rainbow') continue;
    const T = q.visual.total, label = vis.describe(q.visual);
    if (T % 2 === 0) assert.match(label, new RegExp(q.visual.hiddenCopy ? `goes down from ${T / 2} to a blank` : `joins ${T / 2} to a second ${T / 2}`));
    if (q.data && 2 * q.data.k === T) { assert.ok(q.visual.hiddenCopy); assert.match(q.prompt, /in the middle/); assert.equal(q.answer, String(T / 2)); }
    if (q.visual.hidden !== null && !q.visual.hiddenCopy) assert.ok(!label.includes(`${T - q.visual.hidden} and ${q.visual.hidden}`) && !label.includes(`${q.visual.hidden} and ${T - q.visual.hidden}`));
  }
  assert.ok(sample('2a-rainbow-11-12-fill', 400).some(q => q.visual?.hiddenCopy), '6 + 6 retained');
  assert.ok(sample('2a-rainbow-13-14', 400).some(q => q.visual?.hiddenCopy && q.visual.total === 14), '7 + 7 retained');
  // The reviewed persisted reproduction: create(79, 28) after 221 completions.
  const s = b.create(79, 28);
  for (let i = 0; i < 221; i++) { b.answer(s, b.current(s).answer); b.next(s); }
  const q = b.current(s);
  assert.deepEqual(plain(s.active), { skillId: '2a-rainbow-11-12-fill', page: 79, occurrence: 110 });
  assert.match(q.prompt, /6 is in the middle/); assert.equal(q.visual.hiddenCopy, true);
  assert.ok(b.normalize(JSON.parse(JSON.stringify(s))));
});

test('pictures: unsolved descriptions never state the answer except where reading is the task', () => {
  const reading = new Set(['rainbow-full', 'code-key', 'number-line', 'groups', 'ten-frames', 'sequence', 'fact-family']);
  let n = 0;
  for (const k of NEW) for (const q of sample(k.id, 80)) {
    const v = q.visual; if (!v || !vis.has(v.kind)) continue;
    const label = vis.describe(v), kind = v.kind === 'rainbow' && v.hidden === null ? 'rainbow-full' : v.kind;
    assert.ok(vis.svg(v).startsWith('<svg viewBox="0 0 320 215" role="img" aria-label="'));
    // Clock letters name the pictures themselves; the time asked is never spoken.
    if (reading.has(kind) || q.variant === 'event-date' || /^Clock [ABC]$/.test(q.answer)) continue;
    if (/^\d+$/.test(q.answer) && ['io-table', 'add-table', 'rainbow'].includes(kind)) assert.match(label, /empty|blank/);
    else if (!/^\d+$/.test(q.answer)) assert.ok(!label.includes(q.answer), `${k.id} ${q.variant}: "${q.answer}" in "${label}"`);
    n++;
  }
  assert.ok(n > 500, String(n));
});

// The released (#219) operationPage, verbatim, as the regression oracle.
function releasedOperationPage(op, a, b) {
  if (![a, b].every(Number.isInteger) || a < 0 || b < 0) return Infinity;
  if (op === 'add') { if (a < b) [a, b] = [b, a]; const sum = a + b; if (sum > 100) return Infinity; if (a <= 9) return sum <= 10 ? 15 : 14; if (b <= 9) return a % 10 + b <= 9 ? 10 : 14; if (a % 10 === 0 && b % 10 === 0) return 10; if (a % 10 === 0 || b % 10 === 0) return 26; return a % 10 + b % 10 <= 9 ? 10 : 14; }
  if (op === 'subtract') { if (b > a || a > 100) return Infinity; if (a <= 10) return 15; if (a <= 99 && a % 10 >= b % 10) return 11; if (a % 10 === 0 && b <= 9) return 10; return Infinity; }
  return Infinity;
}
test('Football gate: only teen subtraction across ten gains page 73; every other relation is unchanged', () => {
  for (const op of ['add', 'subtract']) for (let a = 0; a <= 101; a++) for (let x = 0; x <= 101; x++) {
    const crossTeen = op === 'subtract' && a >= 11 && a <= 18 && x <= 9 && a % 10 < x;
    assert.equal(c.operationPage(op, a, x), crossTeen ? 73 : releasedOperationPage(op, a, x), `${op} ${a} ${x}`);
  }
  for (const [a, x] of [[19, 9], [24, 6], [52, 18], [20, 7]]) assert.equal(c.operationPage('subtract', a, x), releasedOperationPage('subtract', a, x));
});

// Review R1 (source pages 77, 81, 84-90, 94, 95). These expectations come from
// the source activities' roles and number ranges, checked by recomputing each
// answer, and from what a learner in the focused lesson topic actually meets.
const focused = (page, lesson, steps = 240) => { const qs = []; const out = run(page, lesson, steps, q => qs.push(q)); return { qs, empty: out.empty }; };
const parseWho = answer => { const m = answer.match(/^(.+), \$?(\d+)(?: hours?)? more$/); return m && { who: m[1], n: Number(m[2]) }; };

test('R1-01: changed comparisons recompute who has more at pages 77 and 90; the equal-gain form stays', () => {
  const winners = new Set();
  for (const q of sample('2a-compare-stories', 700).filter(q => q.variant === 'unequal-gains')) {
    const [, p1, , p2] = q.prompt.match(/^In this story, (\w+) had \$(\d+) and (\w+) had/), { a, b, ga, gb } = q.data;
    assert.notEqual(ga, gb, 'different gains'); assert.ok(a > b);
    const A = a + ga, B = b + gb, w = parseWho(q.answer);
    assert.notEqual(A, B);
    assert.deepEqual(w, { who: A > B ? p1 : p2, n: Math.abs(A - B) }, q.prompt);
    winners.add(A > B ? 'first' : 'second');
    assert.ok(q.choices.filter(ch => { const c = parseWho(ch); return c && c.who === w.who && c.n === w.n; }).length === 1);
  }
  assert.deepEqual([...winners].sort(), ['first', 'second'], 'the lead can change hands');
  for (const q of sample('2a-compare-stories', 700).filter(q => q.variant === 'durations-compare')) {
    const [, p1] = q.prompt.match(/^In this story, (\w+) reads/), p2 = q.prompt.match(/\. (\w+) reads for \d+ hours on/)[1], { d1, d2, d3 } = q.data;
    assert.notEqual(d1 + d2, d3);
    assert.deepEqual(parseWho(q.answer), { who: d1 + d2 > d3 ? p1 : p2, n: Math.abs(d1 + d2 - d3) });
  }
  assert.ok(sample('2a-compare-stories', 200).some(q => q.variant === 'both-updated'));
  const seen = { leave: new Set(), who: new Set() };
  for (const q of sample('2a-family-16-stories', 1000).filter(q => q.variant === 'one-changed-compare')) {
    const { x, y, c, leave } = q.data, after = leave ? y - c : y + c;
    assert.notEqual(after, x); assert.ok(after >= 1 && c >= 1 && c <= 2);
    assert.deepEqual(parseWho(q.answer), { who: after > x ? 'Blue shirts' : 'Red shirts', n: Math.abs(after - x) });
    seen.leave.add(leave); seen.who.add(after > x);
  }
  assert.equal(seen.leave.size, 2); assert.equal(seen.who.size, 2);
  // Learners focused on these lessons meet the activities at exactly those pages.
  assert.ok(focused(77, 27).qs.some(q => q.variant === 'unequal-gains') && focused(77, 27).qs.some(q => q.variant === 'durations-compare'));
  assert.ok(focused(90, 34).qs.some(q => q.variant === 'one-changed-compare'));
  assert.ok(!focused(89, 34).qs.some(q => q.skillId === '2a-family-16-stories'), 'no page-90 work at 89');
});

test('R1-02: page 90 compares a number with a sum and two subtractions with the same subtrahend; page 92 forms stay', () => {
  const signs = { sum: new Set(), sub: new Set() }; let tens = 0;
  const sign = (l, r) => (l < r ? '<' : l > r ? '>' : '=');
  for (const q of sample('2a-family-16-stories', 1200)) {
    if (q.variant === 'compare-number-sum') {
      const [, n, a, b] = q.prompt.match(/(\d+) \? (\d+) \+ (\d+)$/).map(Number);
      assert.equal(q.answer, sign(n, a + b)); signs.sum.add(q.answer);
      if (a % 10 === 0 && a >= 20) tens++; else assert.ok(a <= 9 && b <= 9);
      assert.ok(n <= 100);
    }
    if (q.variant === 'compare-subtract') {
      const [, m1, s1, m2, s2] = q.prompt.match(/(\d+) − (\d+) \? (\d+) − (\d+)$/).map(Number);
      assert.equal(s1, s2, 'same subtrahend'); assert.notEqual(m1, m2);
      assert.ok(m1 >= 11 && m1 <= 18 && m2 >= 11 && m2 <= 18);
      assert.equal(q.answer, sign(m1 - s1, m2 - s2)); signs.sub.add(q.answer);
    }
    if (q.variant === 'compare-expr') assert.match(q.prompt, /\d \+ \d \? \d \+ \d$/);
  }
  assert.deepEqual([...signs.sum].sort(), ['<', '=', '>']); assert.deepEqual([...signs.sub].sort(), ['<', '>']);
  assert.ok(tens > 10, 'whole ten plus ones against a number');
  // Page 92 keeps its common-minuend form.
  assert.ok(sample('2a-family-17-18-review', 300).some(q => /(\d+) − \d \? \1 − \d$/.test(q.prompt)));
  assert.ok(focused(90, 34).qs.some(q => q.variant === 'compare-number-sum') && focused(90, 34).qs.some(q => q.variant === 'compare-subtract'));
});

test('R1-03: the ten-plus-part family for 12-16 in both orders and both subtractions, in the focused lesson, at its page', () => {
  for (const [T, page, lesson] of [[12, 81, 30], [13, 84, 32], [14, 85, 32], [15, 87, 33], [16, 89, 34]]) {
    const p = T - 10, want = { [`10 + ${p} = ?`]: T, [`${p} + 10 = ?`]: T, [`${T} − 10 = ?`]: p, [`${T} − ${p} = ?`]: 10 };
    const { qs } = focused(page, lesson, 260), got = new Map(qs.filter(q => q.prompt in want).map(q => [q.prompt, q.answer]));
    assert.deepEqual([...got.keys()].sort(), Object.keys(want).sort(), `total ${T} in lesson ${lesson} at ${page}`);
    for (const [prompt, ans] of got) assert.equal(ans, String(want[prompt]), prompt);
    // Not before its own page, even in its own lesson.
    assert.ok(!focused(page - 1, lesson, 120).qs.some(q => q.data?.T === T && q.variant === 'ten-family'), `total ${T} before ${page}`);
  }
  // The released ten-plus forms of 11, 17, and 18 are unchanged, and page 87 has 15 − 5, 15 − 10, 10 + 5.
  const p87 = focused(87, 33).qs.map(q => q.prompt);
  for (const prompt of ['15 − 5 = ?', '15 − 10 = ?', '10 + 5 = ?', '5 + 10 = ?']) assert.ok(p87.includes(prompt), prompt);
});

test('R1-04: two-digit and whole-ten review domains at pages 88, 94, and 95', () => {
  const forms = new Set();
  for (const q of sample('2a-family-15-review', 800).filter(q => q.variant === 'dollars-tens')) {
    const p = q.data.prices, total = p.reduce((x, y) => x + y, 0);
    assert.ok(p[0] >= 11 && p[0] <= 49 && p[0] % 10 !== 0, 'one two-digit price');
    assert.ok(p.slice(1).every(x => x % 10 === 0 && x >= 10), 'the others are whole tens');
    assert.ok(total <= 99); assert.equal(q.answer, String(total));
    assert.ok(q.prompt.includes(`$${p[0]}`) && p.every(x => q.prompt.includes(`$${x}`)));
    forms.add(p.length);
  }
  assert.deepEqual([...forms].sort(), [2, 3]);
  for (const q of sample('2a-mixed-review-94', 700).filter(q => q.variant === 'age-tens')) {
    const { a, b } = q.data; assert.ok(a % 10 === 0 && a >= 20 && a <= 50 && b >= 2 && b <= 9); assert.equal(q.answer, String(a - b));
  }
  let crossing = 0, same = 0;
  for (const q of sample('2a-review-95', 1000)) {
    if (q.variant === 'difference-close') {
      const { x, y } = q.data; assert.ok(x >= 10 && y <= 99 && y - x >= 2 && y - x <= 9); assert.equal(q.answer, String(y - x));
      if (Math.floor(x / 10) !== Math.floor(y / 10)) crossing++; else same++;
    }
    if (q.variant === 'difference-wide') {
      const { x, y } = q.data; assert.ok(y >= 22 && y <= 99 && x >= 1 && x <= y % 10, 'two-digit minus a small number, no borrowing'); assert.equal(q.answer, String(y - x));
    }
  }
  assert.ok(crossing > 5 && same > 5);
  assert.ok(focused(88, 33).qs.some(q => q.variant === 'dollars-tens'));
  assert.ok(focused(94, 36).qs.some(q => q.variant === 'age-tens'));
  assert.ok(!focused(93, 36).qs.some(q => q.skillId === '2a-mixed-review-94'), 'no page-94 work at 93');
  const p95 = focused(95, 37).qs; assert.ok(p95.some(q => q.variant === 'difference-close') && p95.some(q => q.variant === 'difference-wide'));
});

test('R1-05: known removals at pages 86 and 90, and half then the total at page 94; inverse and simple-half forms stay', () => {
  for (const q of sample('2a-family-14-stories', 700).filter(q => q.variant === 'share-one-each')) {
    const { T, k } = q.data; assert.ok(k >= 2 && k <= 6 && T >= 12 && T <= 20); assert.equal(q.answer, String(T - k));
    assert.match(q.prompt, new RegExp(`has ${T} .* each of ${k} .* one`));
  }
  for (const q of sample('2a-family-16-stories', 1000).filter(q => q.variant === 'two-removals')) {
    const { start, r1, r2 } = q.data; assert.ok(r1 >= 1 && r2 >= 1 && r1 + r2 <= start % 10); assert.equal(q.answer, String(start - r1 - r2));
    assert.ok(q.prompt.includes(`${start} children. ${r1} `) && q.prompt.includes(`then ${r2} more`));
  }
  for (const q of sample('2a-mixed-review-94', 700).filter(q => q.variant === 'half-then-total')) {
    const { x } = q.data; assert.equal(x % 2, 0); assert.equal(q.answer, String(x + x / 2));
    assert.ok(q.choices.includes(String(x / 2)), 'stopping at the half is a listed misstep');
  }
  // Page 94 (addendum): the larger amount from a known amount plus "more",
  // with a whole-ten increase and with a single-digit increase.
  const moreForms = new Set();
  for (const q of sample('2a-mixed-review-94', 1000).filter(q => q.variant === 'more-quantity')) {
    const known = Number(q.prompt.match(/(?:read |has \$)(\d+)/)[1]), more = Number(q.prompt.match(/(?:\$|read )(\d+) more/)[1]);
    assert.equal(q.answer, String(known + more), q.prompt);
    assert.ok(!q.prompt.includes(`${known + more}`), 'the answer is not in the prompt');
    if (more === 10) { assert.ok(known >= 10 && known <= 89 && known + more <= 99); moreForms.add('ten'); }
    else { assert.ok(known >= 2 && known <= 9 && more >= 2 && more <= 9 && known + more <= 18); moreForms.add('one'); }
    assert.ok(q.choices.includes(String(Math.abs(known - more))), 'subtracting instead is a listed misstep');
  }
  assert.deepEqual([...moreForms].sort(), ['one', 'ten']);
  const l36 = focused(94, 36, 300).qs.filter(q => q.variant === 'more-quantity');
  assert.ok(l36.some(q => / 10 more /.test(q.prompt)) && l36.some(q => !/ 10 more /.test(q.prompt)), 'focused lesson 36 reaches both forms at 94');
  assert.ok(!focused(93, 36, 120).qs.some(q => q.variant === 'more-quantity'), 'not before page 94');
  for (const [id, variant] of [['2a-family-14-stories', 'change-story'], ['2a-mixed-review-94', 'half-total'], ['2a-mixed-review-94', 'update-compare']]) assert.ok(sample(id, 200).some(q => q.variant === variant));
  assert.ok(focused(86, 32).qs.some(q => q.variant === 'share-one-each') && !focused(85, 32).qs.some(q => q.variant === 'share-one-each'));
  assert.ok(focused(90, 34).qs.some(q => q.variant === 'two-removals'));
  assert.ok(focused(94, 36).qs.some(q => q.variant === 'half-then-total'));
});

// Review R2 and the source crosswalk (pages 46, 62, 70-72, 76-77, 82-83, 86,
// 93, 96-97). Answers are recomputed from the numbers stated in each prompt.
const nums = s => (s.match(/\d+/g) || []).map(Number);
const inLesson = (page, lesson, variant, id) => focused(page, lesson, 300).qs.filter(q => q.variant === variant && (!id || q.skillId === id));
const reachedOnlyAt = (page, lesson, variant, id) => {
  assert.ok(inLesson(page, lesson, variant, id).length > 0, `${id}:${variant} reached in lesson ${lesson} at ${page}`);
  assert.equal(inLesson(page - 1, lesson, variant, id).length, 0, `${id}:${variant} not before ${page}`);
};

test('R2-01: inverse-removal stories at pages 70 and 72; the addition-event inverses stay', () => {
  for (const q of sample('2a-add-six-more', 1000)) {
    if (q.variant === 'removal-start') { const [gone, left] = nums(q.prompt); assert.equal(q.answer, String(gone + left)); assert.match(q.prompt, /ate \d+ .* \d+ apples are left/); assert.ok(gone + left <= 18); }
    if (q.variant === 'removal-cost') { const [start, left] = nums(q.prompt); assert.equal(q.answer, String(start - left)); assert.ok(start <= 18 && start - left >= 2); }
    if (q.variant === 'removals-start') { const n = nums(q.prompt), left = n.at(-1); assert.ok(n.length >= 3, 'at least two removals'); assert.equal(q.answer, String(n.reduce((a, b) => a + b, 0))); assert.ok(left >= 2); }
  }
  for (const q of sample('2a-facts-table-stories', 900).filter(q => q.variant === 'removal-start')) {
    const [gone, stay] = nums(q.prompt); assert.equal(q.answer, String(gone + stay)); assert.ok(gone + stay <= 18 && stay >= 4);
  }
  for (const v of ['removal-start', 'removal-cost', 'removals-start']) reachedOnlyAt(70, 24, v, '2a-add-six-more');
  reachedOnlyAt(72, 25, 'removal-start', '2a-facts-table-stories');
  for (const v of ['missing-start', 'missing-change', 'multistep']) assert.ok(inLesson(70, 24, v).length > 0, v);
  assert.ok(inLesson(72, 25, 'inverse-story').length > 0);
});

test('R2-02: comparative quantity roles at pages 70, 72, 86, and 97 in their own lessons', () => {
  const more = q => { const [a, d] = nums(q.prompt); assert.equal(q.answer, String(a + d), q.prompt); assert.match(q.prompt, new RegExp(`${d} more than`)); return [a, d]; };
  for (const [id, page, lesson] of [['2a-add-six-more', 70, 24], ['2a-family-14-stories', 86, 32], ['2a-review-97', 97, 37]]) {
    for (const q of sample(id, 900).filter(q => q.variant === 'more-than')) { const [a, d] = more(q); assert.ok(a + d <= 18 && d >= 2); }
    reachedOnlyAt(page, lesson, 'more-than', id);
  }
  for (const q of sample('2a-facts-table-stories', 900)) {
    if (q.variant === 'more-unknown') { const [a] = more(q); assert.ok(a >= 2 && a <= 10); }
    if (q.variant === 'fewer-unknown') { const [d, big] = nums(q.prompt); assert.equal(q.answer, String(big - d)); assert.match(q.prompt, /more shells than .* has \d+ shells/); }
  }
  assert.ok(sample('2a-facts-table-stories', 900).some(q => q.variant === 'more-unknown' && nums(q.prompt)[0] === 10), 'a whole ten as the smaller amount');
  for (const v of ['more-unknown', 'fewer-unknown']) reachedOnlyAt(72, 25, v, '2a-facts-table-stories');
  for (const q of sample('2a-review-97', 900).filter(q => q.variant === 'compare-both')) {
    const [small, big] = nums(q.prompt); assert.equal(big, 20); assert.ok(small >= 11 && small <= 19); assert.equal(q.answer, String(20 - small));
  }
  reachedOnlyAt(97, 37, 'compare-both', '2a-review-97');
  // The difference and smaller-unknown roles stay.
  for (const [p, l, v] of [[70, 24, 'compare'], [72, 25, 'compare-story'], [86, 32, 'compare-story'], [97, 37, 'compare-role']]) assert.ok(inLesson(p, l, v).length > 0, v);
});

test('R2-03: page 76 computes wide differences; the method choice asks for fewer counting steps', () => {
  const forms = new Set();
  for (const q of sample('2a-how-many-more', 1000)) {
    if (q.variant === 'wide-difference') {
      const [p, r] = nums(q.prompt), y = Math.max(p, r), x = Math.min(p, r);
      assert.equal(q.answer, String(y - x));
      if (y === 100 && x % 10 === 0) forms.add('100-tens');
      else if (y === 100) { assert.ok(x <= 5); forms.add('100-small'); }
      else { assert.ok(y >= 22 && y <= 99 && x <= y % 10, 'no borrowing'); forms.add('two-digit-small'); }
    }
    if (q.variant === 'strategy') {
      assert.match(q.prompt, /fewer counting steps/); const { x, y } = q.data;
      const up = x - y, back = y; assert.notEqual(up, back);
      assert.equal(q.answer, up < back ? `Count up from ${y} to ${x}` : `Count back ${y} from ${x}`);
    }
  }
  assert.deepEqual([...forms].sort(), ['100-small', '100-tens', 'two-digit-small']);
  reachedOnlyAt(76, 27, 'wide-difference', '2a-how-many-more');
});

test('crosswalk additions: pages 46, 62, 71, 77, 82, 83, 93, 96 reach their ordinary roles at their pages', () => {
  // p46: noon as an end time, 5 AM starts.
  const noon = sample('2a-hours-am-pm', 800).filter(q => q.variant === 'across-noon');
  assert.ok(noon.some(q => q.data.H2 === 12) && noon.some(q => q.data.H1 === 5)); for (const q of noon) assert.equal(q.answer, String(q.data.H2 - q.data.H1));
  // p62: two spends, two gains, and spend-then-find, each answer from the stated amounts.
  const events = new Set();
  for (const q of sample('2a-make-ten-split', 800).filter(q => q.variant === 'money-events')) {
    const [x, a, b] = nums(q.prompt), want = /buys .* buys/.test(q.prompt) ? x - a - b : /finds .* gets/.test(q.prompt) ? x + a + b : x - a + b;
    assert.equal(q.answer, String(want), q.prompt); events.add(/buys .* buys/.test(q.prompt) ? 'spend-spend' : /finds .* gets/.test(q.prompt) ? 'gain-gain' : 'spend-find'); assert.ok(want >= 0);
  }
  assert.equal(events.size, 3);
  reachedOnlyAt(62, 20, 'money-events', '2a-make-ten-split');
  // p71: missing-number patterns.
  for (const q of sample('2a-facts-crossing', 600).filter(q => q.variant === 'pattern-missing')) {
    const total = nums(q.prompt).at(-1), known = q.prompt.match(/in (\?|\d+) \+ (\?|\d+) = \d+\?$/);
    assert.equal(q.answer, String(known[1] === '?' ? total - Number(known[2]) : total - Number(known[1])), q.prompt);
  }
  reachedOnlyAt(71, 25, 'pattern-missing', '2a-facts-crossing');
  // p77: pages left to a whole ten, two-digit-versus-small comparison, a teen in a three-way total.
  for (const q of sample('2a-compare-stories', 900)) {
    if (q.variant === 'pages-left') { const [end, at] = nums(q.prompt); assert.equal(end % 10, 0); assert.equal(q.answer, String(end - at)); assert.ok(end - at <= 9); }
    if (q.variant === 'wide-compare') { const [y, x] = nums(q.prompt); assert.ok(x <= y % 10 && y >= 22); assert.equal(q.answer, String(y - x)); }
  }
  assert.ok(sample('2a-compare-stories', 900).some(q => q.variant === 'three-total' && nums(q.prompt).some(n => n >= 11)));
  for (const v of ['pages-left', 'wide-compare']) reachedOnlyAt(77, 27, v, '2a-compare-stories');
  // p82: missing addends for 11.
  for (const q of sample('2a-family-12-more', 600).filter(q => q.variant === 'missing-11')) { const [a] = nums(q.prompt).filter(n => n !== 11); assert.equal(q.answer, String(11 - a)); }
  reachedOnlyAt(82, 30, 'missing-11', '2a-family-12-more');
  // p83: 13 − 10, 13 − 11, 14 − 11 are reachable.
  const p83 = new Set(sample('2a-rainbow-13-14', 800).filter(q => q.variant === 'subtract').map(q => q.prompt));
  for (const p of ['13 − 10 = ?', '13 − 11 = ?', '14 − 11 = ?']) assert.ok(p83.has(p), p);
  // p93: half-past start times for elapsed minutes, and even numbers (to 40) as doubles.
  assert.ok(sample('2a-elapsed-minutes', 300).some(q => q.data.m1 === 30));
  for (const q of sample('2a-elapsed-minutes', 300)) assert.ok(q.data.m2 <= 55 && q.data.m2 - q.data.m1 >= 5 && q.data.m2 - q.data.m1 <= 30);
  const doubles = sample('2a-mixed-review-93', 600).filter(q => q.variant === 'double-of');
  for (const q of doubles) assert.equal(q.answer, String(q.data.e / 2)); assert.ok(doubles.some(q => q.data.e === 40));
  reachedOnlyAt(93, 36, 'double-of', '2a-mixed-review-93');
  // p96: two-digit odd + odd / odd + even, total at most 98.
  const parity = new Set();
  for (const q of sample('2a-review-96', 900).filter(q => q.variant === 'two-digit-parity')) {
    const [x, y] = nums(q.prompt), n = x + y; assert.ok(x % 2 === 1 && x >= 11 && y >= 10 && n <= 98);
    assert.equal(q.answer, /share/.test(q.prompt) ? (n % 2 ? 'No' : 'Yes') : (n % 2 ? 'odd' : 'even')); parity.add(`${y % 2}:${/share/.test(q.prompt)}`);
  }
  assert.equal(parity.size, 4);
  reachedOnlyAt(96, 37, 'two-digit-parity', '2a-review-96');
});

// ---- Run state ----
const legacyState = (page, serial, misses = [], extra = {}) => ({ schemaVersion: 1, worktext: c.BOOK, edition: c.EDITION, page, lesson: 0, serial, completed: serial,
  firstTry: serial, yards: 0, misses, done: false, history: Array.from({ length: Math.min(serial, 100) }, (_, i) => ({ skillId: CH1[(serial - Math.min(serial, 100) + i) % 32].id, page: CH1[(serial - Math.min(serial, 100) + i) % 32].page, serial: serial - Math.min(serial, 100) + i + 1, misses: 0 })), ...extra });
// The released reader (#219), verbatim over the released Chapter 1 catalog.
function releasedNormalize(s) {
  const LESSON_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const skills = st => (c.validPage(st.page) ? CH1.filter(k => k.page <= st.page) : []).filter(k => !st.lesson || k.lesson === st.lesson);
  const current = st => { const all = skills(st); return all.length ? b.question(all[st.serial % all.length], Math.floor(st.serial / all.length)) : null; };
  if (!s || s.schemaVersion !== 1 || s.worktext !== c.BOOK || s.edition !== c.EDITION || !c.validPage(s.page) || !LESSON_IDS.includes(s.lesson) || !['serial', 'completed', 'firstTry', 'yards'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] < 1e9) || s.firstTry > s.completed || s.completed !== s.serial + Number(s.done) || s.yards > s.completed * 5 || !Array.isArray(s.misses) || s.misses.length > 3 || !s.misses.every(v => typeof v === 'string') || typeof s.done !== 'boolean' || !Array.isArray(s.history) || s.history.length > 100 || s.history.some(r => !r || !CH1.some(k => k.id === r.skillId && k.page === r.page) || !Number.isInteger(r.serial) || r.serial < 1 || r.serial > s.completed || !Number.isInteger(r.misses) || r.misses < 0 || r.misses > 3)) return null;
  const q = current(s); if (q && s.misses.some(v => v === q.answer || !q.choices.includes(v))) return null;
  return s;
}

test('legacy golden: Chapter 1 generators and schema-1 pending questions are byte-identical to the released baseline', () => {
  for (const g of fixture.golden) assert.deepEqual(plain(b.question(byId(g.skillId), g.serial)), g.question, `${g.skillId}#${g.serial}`);
  for (const sample of fixture.pending) {
    for (const page of [sample.page, 32, 40, 97, 161].filter(p => p >= 20)) {
      const raw = { ...sample.state, page };
      if (page < 32 && page !== sample.page) continue;
      const s = b.normalize(raw);
      assert.ok(s, `page ${page}`);
      assert.equal(s.catalogThrough, 32);
      assert.deepEqual(plain(b.current(s)), sample.question, `page ${page} serial ${sample.state.serial}`);
      assert.deepEqual(plain(s.misses), sample.state.misses);
      assert.ok(releasedNormalize(raw), 'the released reader accepts the same input');
    }
  }
});

test('legacy runs stay on the Chapter 1 catalog through answers, Next, and reloads; only a boundary opts in', () => {
  for (const page of [32, 40, 97, 161]) for (const misses of [[], null]) {
    const raw0 = legacyState(page, 9), q0 = b.normalize(raw0) && b.current(b.normalize(raw0));
    const raw = misses ? raw0 : { ...raw0, misses: [q0.choices.find(x => x !== q0.answer)] };
    let s = b.normalize(raw);
    assert.equal(s.catalogThrough, 32);
    const before = plain(b.current(s));
    for (let i = 0; i < 120; i++) {
      const q = b.current(s), oldQ = b.question(CH1[(9 + i) % 32], Math.floor((9 + i) / 32));
      assert.deepEqual(plain(q), plain(oldQ), 'released order continues');
      b.answer(s, q.answer); b.next(s);
      s = b.normalize(JSON.parse(JSON.stringify(s)));
      assert.equal(s.schemaVersion, 2); assert.equal(s.catalogThrough, 32);
    }
    // An explicit boundary keeps the still-eligible pending question, then opens the full catalog.
    const t = b.normalize(raw);
    assert.ok(b.boundary(t, page, 0));
    assert.equal(t.catalogThrough, 97);
    assert.deepEqual(plain(b.current(t)), before); assert.deepEqual(plain(t.misses), plain(raw.misses));
    if (page >= 37) { const { seen } = (() => { const seen = new Set(); for (let i = 0; i < 200; i++) { const q = b.current(t); seen.add(q.page > 32); b.answer(t, q.answer); b.next(t); } return { seen }; })(); assert.ok(seen.has(true)); }
  }
});

test('the released reader rejects every schema-2 save, even before any new history row', () => {
  const s = b.create(14);
  const q = b.current(s); b.answer(s, q.choices.find(x => x !== q.answer));
  const raw = JSON.parse(JSON.stringify(s));
  assert.equal(raw.schemaVersion, 2);
  assert.ok(raw.history.every(r => CH1.some(k => k.id === r.skillId)), 'no new history id yet');
  assert.equal(releasedNormalize(raw), null);
  assert.equal(releasedNormalize({ ...raw, schemaVersion: 1 }) === null, true, 'its fields are not schema 1 either');
  assert.equal(b.normalize({ ...raw, schemaVersion: 3 }), null, 'future schemas stay unread');
});

function missAt(s) { const q = b.current(s); assert.ok(b.answer(s, q.choices.find(x => x !== q.answer))); return q; }
test('lowering a page: eligible pending stays exactly; locked retry is retained, hidden, and resumes once', () => {
  // Still eligible after lowering.
  let s = b.create(97, 33); const q1 = missAt(s);
  assert.ok(b.boundary(s, 90, 33)); assert.deepEqual(plain(b.current(s)), plain(q1)); assert.equal(s.misses.length, 1);
  // Locked after lowering.
  s = b.create(97, 0); for (let i = 0; i < 70; i++) { const q = b.current(s); b.answer(s, q.answer); b.next(s); }
  while (b.current(s).page <= 60) { const q = b.current(s); b.answer(s, q.answer); b.next(s); }
  const locked = missAt(s), totals = plain({ completed: s.completed, firstTry: s.firstTry, yards: s.yards, history: s.history });
  assert.ok(b.boundary(s, 60, 0));
  assert.equal(s.retained.length, 1); assert.equal(s.retained[0].skillId, locked.skillId);
  assert.deepEqual(plain({ completed: s.completed, firstTry: s.firstTry, yards: s.yards, history: s.history }), totals, 'no reward, credit, or history loss');
  assert.ok(s.history.some(r => r.page > 60), 'history above the lowered page is kept');
  for (let i = 0; i < 300; i++) { const q = b.current(s); assert.ok(q.page <= 60, 'locked work stays hidden'); b.answer(s, q.answer); b.next(s);
    s = b.normalize(JSON.parse(JSON.stringify(s))); }
  assert.equal(s.retained.length, 1, 'retained across reloads');
  // Same-page re-boundary does not duplicate the identity.
  b.boundary(s, 60, 0); assert.equal(s.retained.length, 1);
  // Raise again after finishing the current question: the exact retry and its miss return; credit once.
  { const q = b.current(s); b.answer(s, q.answer); }
  const done = s.completed; b.boundary(s, 97, 0);
  assert.deepEqual(plain(b.current(s)), plain(locked)); assert.equal(s.misses.length, 1); assert.equal(s.retained.length, 0);
  assert.ok(b.answer(s, locked.answer)); assert.equal(b.answer(s, locked.answer), false); assert.equal(s.completed, done + 1);
  // Scores never unlock: high completion and history stay irrelevant to a low page.
  const low = b.normalize({ ...JSON.parse(JSON.stringify(s)), page: 40, lesson: 0, active: null, misses: [], done: false });
  assert.ok(low); b.boundary(low, 40, 0);
  for (let i = 0; i < 100; i++) { const q = b.current(low); assert.ok(q.page <= 40); b.answer(low, q.answer); b.next(low); }
});

test('topic changes retain a missed retry; Next serves eligible retained work first; no double credit', () => {
  const s = b.create(97, 33); const first = missAt(s);
  b.boundary(s, 97, 12); assert.ok(b.current(s).lesson === 12); assert.equal(s.retained.length, 1);
  const second = missAt(s);
  b.boundary(s, 97, 0);
  assert.deepEqual(plain(b.current(s)), plain(second), 'a still-eligible pending question stays at a boundary');
  assert.equal(s.misses.length, 1);
  const c0 = s.completed; b.answer(s, second.answer); b.next(s);
  assert.deepEqual(plain(b.current(s)), plain(first), 'the eligible retained retry comes before fresh work');
  assert.equal(s.misses.length, 1);
  b.answer(s, first.answer); b.answer(s, first.answer); b.next(s); b.next(s);
  assert.equal(s.completed, c0 + 2); assert.equal(s.retained.length, 0);
  assert.notDeepEqual(plain(b.current(s)), plain(first));
  // An untouched locked question carries no evidence and is not kept.
  const t = b.create(97, 33); b.boundary(t, 97, 12); assert.equal(t.retained.length, 0);
});

test('capacity fails closed, and tampered or inconsistent saves are rejected', () => {
  // 32 saved locked retries plus one more: nothing is evicted, and the 33-entry state is never valid to save.
  const s = b.create(97, 0);
  while (b.current(s).page <= 60) { const q = b.current(s); b.answer(s, q.answer); b.next(s); }
  missAt(s);
  const k97 = byId('2a-review-97');
  s.retained = Array.from({ length: 32 }, (_, i) => { const q = b.question(k97, 1000 + i); return { skillId: k97.id, page: 97, occurrence: 1000 + i, misses: [q.choices.find(x => x !== q.answer)] }; });
  const saved = plain(s.retained);
  assert.ok(b.normalize(JSON.parse(JSON.stringify(s))), '32 retained is a valid save');
  assert.equal(b.overCapacity(s), false);
  b.boundary(s, 60, 0);
  assert.equal(s.retained.length, 33); assert.deepEqual(plain(s.retained.slice(0, 32)), saved);
  assert.equal(b.overCapacity(s), true);
  assert.equal(b.normalize(JSON.parse(JSON.stringify(s))), null, 'never written');
  const ok = b.create(97, 33); missAt(ok); const raw = JSON.parse(JSON.stringify(ok));
  assert.ok(b.normalize(raw));
  const q = b.current(ok);
  for (const bad of [{ ...raw, misses: [q.answer] }, { ...raw, active: { ...raw.active, page: raw.active.page + 1 } }, { ...raw, page: 40 }, { ...raw, catalogThrough: 50 },
    { ...raw, lesson: 38 }, { ...raw, retained: [{ ...raw.active, misses: [...raw.misses] }] }, { ...raw, active: null }, { ...raw, done: true, active: null, misses: [] },
    { ...raw, catalogThrough: 32 }, { ...raw, history: [{ skillId: '2a-unknown', page: 50, serial: 1, misses: 0 }], completed: 1 }]) {
    assert.equal(b.normalize(bad), null, JSON.stringify(bad).slice(0, 120));
  }
  const dup = { ...raw, active: null, misses: [], retained: [{ ...raw.active, misses: [...raw.misses] }, { ...raw.active, misses: [...raw.misses] }] };
  assert.equal(b.normalize(dup), null, 'duplicate retained identity');
});
