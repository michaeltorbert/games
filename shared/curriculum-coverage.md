# Grade 1-B 2026 curriculum coverage

Source: `football/MathMammoth_Grade1-B_2026/1 - Student worktexts/Math Mammoth Grade 1-B.pdf`, printed pages (not viewer offsets). The runtime authority is `shared/curriculum.js`. Every catalog row has runnable original practice in Place by Place's Whole book mode; all pages through 187 are supported without another release. Reviews reuse the already introduced domains and do not claim new learning.

| Printed pages | Learner content and runnable practice |
| --- | --- |
| 17-38 | Directional addition/subtraction facts through 10, missing numbers, comparing expressions, symbols, and original word problems. Exact facts retain their own page tags and tickets in Basic + and −. |
| 39-46 | Repeated subtraction and word problems; mixed/chapter review uses existing families. |
| 50-57 | Closed straight/curved shapes, circles/triangles, squares/rectangles/rhombi, side counts, and property recognition. Original diagrams distinguish right angles from equal sides. |
| 59-60 | Cube, box, cylinder, cone recognition with visual and accessible property descriptions. |
| 63-67 | Composition and decomposition using square diagonals and triangular parts; selecting resulting shapes and counting component parts. |
| 68-71 | Equal halves/quarters, naming a colored share, and two quarters equaling one half. |
| 72 | Optional thirds, explicitly flagged in the catalog. |
| 73-75 | Reviews reuse shape and fraction practice. |
| 79-85 | Iterating equal units, identifying invalid gapped measurement, length comparison, different-sized units, and transitive comparison using a common measuring stick. |
| 86-90 | Reading whole-inch and whole-centimeter intervals from zero on original schematic rulers. |
| 91-93 | Reviews reuse measurement and earlier arithmetic. |
| 100-107 | Three addends with a pair making ten (101), sums of 11 (102), doubles/near doubles (103), making ten with nine (104) and eight (106), and source-bounded missing addends (107). |
| 108-113 | Two-digit plus/minus one-digit without regrouping/borrowing, and missing ones. These do not unlock two-digit plus two-digit or general subtraction within 20. |
| 114-118 | Two-digit no-carry addition and completing the next ten. |
| 119-121 | Single-digit sums crossing ten (119), two-digit plus one-digit crossing the next ten (120), two-digit carrying (121). The later column lesson at 127 reviews the same operation with its own practice entry. |
| 122-130 | Addition within 20, broader three-addend combinations, column addition, missing addends, and original word/equation practice. |
| 131-136 | Subtracting across ten in parts, using addition to subtract, and within-20 subtraction. |
| 137-143 | Two-digit subtraction without borrowing, mixed operations, and whole tens minus one digit. General borrowing is excluded: the worktext explicitly assigns it to second grade, apart from optional challenges. |
| 144-149 | Review reuses the completed Chapter 8 domains. The historical inclusion ceiling of 149 no longer controls eligibility. |
| 153-159 | Reading bar-graph counts, greatest category/differences/totals, selecting the endpoint to construct a bar from a stated count, and checking a graph claim. Each tick denotes one object. |
| 160-161 | Optional tally groups and counts, flagged in the catalog. |
| 162-164 | Review reuses graphs and earlier domains. |
| 170-175 | Dimes/pennies (170), nickels (171), mixed coins, equivalent coin combinations, and 100 cents = one dollar. Coins are labeled original schematic tokens, not copied coin photographs. |
| 176-181 | Quarters and fourths of a dollar, mixed coin values, target combinations, and money left after a purchase; values stay at or below 100 cents. |
| 182-187 | Mixed/final review reuses the complete book's skills. |

Adult introductions/resources (13-16, 47-49, 77-78, 95-99, 151-152, 167-169) do not unlock new learner questions. Digital recognition/counting/selection activities are adaptations of physical drawing, cutting, folding, and measuring tasks; the app does not claim to assess freehand drawing, cutting skill, or life-size measurement. Optional general borrowing challenges remain outside the ordinary Grade 1 scope, as the worktext itself states.

Football consumes real play-grounded arithmetic from the shared operand gates, with the narrow user-requested fictional-time (#208) and pretend game-day coin-shop (#215) exceptions. Shapes remain outside live snaps. Coin questions replace one ordinary scrimmage question at instructed ordinals 3, 9, 15, repeating every sixth, on both sides in Quick Game and Season; time remains at 2, 5, 8, repeating every third. With no completed coin family, that slot uses ordinary Football math. Special-team questions stay unchanged. Grade 1-B availability is completion-only, confirmed through the existing game-start page prompt. No historical progress record is advanced.

## Persistence and sessions

`math-curriculum:progress:v1` stores only exact book/edition, page, revision, timestamp, and report provenance. The packaged instructor-confirmed page 113 dated 2026-09-18 remains an immutable baseline, separate from learner reports. No reads migrate inclusion ceilings into completion. Writes require a Web Lock, a fresh read, and explicit confirmation; future/corrupt data is preserved with session-only operation. Zero means not started.

Football confirms before each game and before Season mutation. Place by Place confirms on app startup and every new/restarted Grade 1-B run; startup and its immediate first run share one prompt. Grade 1-A place-value questions and Time Lab are not gated by Grade 1-B. Confirmed availability is frozen during a run. Decreases, raises greater than ten pages, and chapter-crossing raises require an extra confirmation.

Arithmetic, exact facts, original place value, book practice, Football learning/stats, and Season retain distinct evidence stores. An eligibility correction repairs only a pending question; existing history and locked retry/spaced tickets survive. New book-practice evidence and rewards live at `place-value-practice:book:v1`; they do not affect exact-fact recall checks or Football stats.


### Football coin source inventory (#215)

Authority: Math Mammoth Grade 1-B, 2026 edition, **printed** pages below.
These are original practice fixtures, not reproduced workbook exercises. Page
168 supplies adult shopping context only. The shared `COIN_SOURCE_MAP` and
contextual registry publish the same page-exact family inventory; broad catalog
rows cannot unlock later exercises. All families are independent evidence except
`coin-dollar`, which reads the explicitly supplied 100¢ = $1 equivalence.

| Printed page | Family IDs (prefix `coin-`) | Allowed work |
|---|---|---|
| 170 | count-dimes-pennies | Dimes and pennies totals |
| 171 | count-nickels-pennies; count-dimes-nickels; make-nickels | Nickels with pennies OR dimes; pay with nickels |
| 172 | count-mixed; two-nickels | Dimes/nickels/pennies; two nickels group as ten cents |
| 173 | add-dime; add-nickel; complete-amount | Add one taught coin; find missing cents |
| 174 | dollar; finish-set | 100 cents = one dollar; finish a partial set |
| 175 | wallet-left | Money remaining after spending from a wallet, without quarters |
| 176 | count-quarters; count-quarters-dimes; count-quarters-nickels | Count quarters; quarters with dimes OR nickels |
| 177 | count-quarters-mixed; complete-quarters | Quarters/dimes/nickels; complete a quarter set without pennies |
| 178 | count-all; equal-sets | Quarters with pennies; equal-value sets |
| 179 | two-ways; quarter-purchase | Two multiset-distinct ways to pay; money left using quarters |
| 180 | one-quarter; two-quarters | Exact payment constrained to exactly one/two quarters |
| 181 | three-quarters; later-equal; later-purchase | Exactly three quarters; later equal values and purchases |

Every amount stays within 100 cents; no decimals, bills, tax, cashier change,
accounts, actual stadium prices, or prices derived from yards/scores/outcomes.
Coin faces label their values and do not claim unlabeled recognition. Initial
and guided independent pictures keep calculated totals/remainders hidden,
including accessible descriptions; worked support reveals the calculation.
Coin-set options have exactly one valid choice under all amount/composition
constraints. Reordering the same multiset does not count as two different ways.

Original token diameter ratios follow the [US Mint coin specifications](https://www.usmint.gov/learn/coins-and-medals/circulating-coins/coin-specifications):
dime 17.91, penny 19.05, nickel 21.21, quarter 24.26 mm. These are screen ratios,
not a claim of life-size rendering. The isolated `football/coins-demo.html`
preview covers every family and support stage without storing learner progress,
play history, or Season results.

# Grade 2-A Chapter 1 coverage (#219)

Source: the purchased Math Mammoth Grade 2-A PDF, identified by revision rather
than an edition year (copyright 2012-2025, PDF created 2025-09-06, SHA-256
`ff96fc64c6d05a4b961ab4ea46920be86de06cb0af15c84cb311b3445a7a6bf2`; the cover
names no edition year). The PDF is not in the repository. Printed pages 10-32
were verified by the coordinator against extracted text and rendered pixels of
all 23 pages; this implementation uses that relayed summary and did not inspect
the PDF itself. The runtime authority is `shared/grade2a-curriculum.js`.

Reported context (2026-11-11): James finished Math Mammoth Grade 1 and is
starting Grade 2-A. That report is dated context only. It does not change the
Grade 1-B baseline (instructor-confirmed page 113, 2026-09-18), migrate
progress, unlock Grade 2-A families, or count as mastery.

All practice below is original and source-bounded. Digital choose/select
activities adapt the workbook's draw, color, and split tasks; they do not
assess drawing or cutting. No multiplication or division notation, no general
borrowing, no numbers past 100, no Chapter 2 content. Each family unlocks only
when its own printed page is reported complete. Runnable surface: Place by
Place, Book topics (Whole book) with the Grade 2-A book selected. A run cycles
through its completed families in order, and each family's own occurrence
count picks its variant, so every variant listed below is reached in each
lesson topic and in All completed. The page prompt names where each book's
practice lives on that page (Place by Place: Options, then Book topics).

| Lesson (printed pages) | Families (`2a-` prefix, unlock page) | Existing or new |
| --- | --- | --- |
| Some Review (10-11) | base-ten-read 10, add-no-carry 10, tens-minus-digit 10, subtract-no-borrow 11, missing-ones-tens 11, three-addends 11, review-stories 11 | New generators; the operations themselves already exist in Grade 1-B practice and Football arithmetic |
| 100-chart and More Review (12-14) | chart-skip 12 (lesson starts: 5s from 5/6, 2s from 2 and back from 99, 4s from 4), chart-neighbors 12, chart-patterns 13, to-next-ten 13, cross-ten 14, repeated-subtract 14 (missing third addend to the next ten; repeated −10/−20/−5) | New (chart, skip patterns); crossing-ten arithmetic also exists |
| Fact Families (15-16) | fact-family 15 (four relations, matching subtraction, missing total), fact-family-100 16 (quantities to 100, missing minuend by adding parts) | New |
| Ordinal Numbers (17-18) | ordinal-position 17 (1st-16th names, from left/right), ordinal-nth-first 18 (nth versus first n), ordinal-grid 18 (7×7 original letter grid, row from top/bottom, column from left/right) | New |
| Even and Odd (19-20) | even-odd-pairs 19 (3-11 in pairs, leftover when shared by 2), even-odd-rule 20 (11-17 pairs; last digit 0/2/4/6/8 to 100) | New |
| Doubling (21-23) | doubles 21 (1-15, whole tens 10-50, two-digit without carry), share-even 22 (small even shares, combined groups split, parity), double-inverse 23 (inverse doubles and equal sharing 6-30) | New |
| One-Half (24-25) | halves-shapes-sets 24 (equal/unequal halves of shapes; halves of 10, 24, 40 and small even sets; 1/2 notation; half + half), halves-numbers 25 (even 12-30, whole tens to 100, grouped halves of even-tens/even-ones numbers such as 48 and 80, doubles of 15/25/35, inverse and short composed stories) | New |
| Adding Whole Tens (26-28) | add-whole-tens 26 (both operand orders, sum ≤ 100), tens-stories 27 (whole-dollar totals, remainder, doubles of multiples of 5 to 50, halves), missing-tens 28 (missing whole tens; adding tens keeps parity) | New |
| Subtracting Whole Tens (29-30) | subtract-whole-tens 29 (no borrowing; back by 10 from varied starts), tens-patterns-stories 30 (±10/±20 patterns, three-quantity sums, three equal-cost purchases and remainder) | New |
| Review (31-32) | chapter-review 31 (rotates every ordinary family above), halves-review 32 (halves of 50, 88, 46 and others; inverse half; double-then-add stories) | Reuses the families above |

Reviewed dispositions (optional enrichment, omitted from this gentle first
wave; no ordinary lesson unit is omitted): page 16 Puzzle Corner (missing
subtrahend and two-step terms), page 18 Puzzle Corner (word reordering), page
23 Challenge (doubling 16 repeatedly), page 28 Puzzle Corner (whole-ten grid),
page 30 Puzzle Corner (arithmetic grids).

Football carries no new Grade 2-A fixture family. A completed Grade 2-A page
may admit an existing, truthful Grade 1-B arithmetic relation family only when
`MATH_CURRICULUM_2A.operationPage` places those exact live operands on a
completed Chapter 1 page (for example, two-digit plus one-digit without
crossing at page 10, crossing ten at page 14, whole ten plus two-digit at page
26). A family admitted only through Grade 2-A cannot borrow a Grade 1-B operand
check. Coins, time, shapes, and special-team questions stay governed by Grade
1-B and their existing rules. Mixed arithmetic and Basic facts in Place by
Place remain Grade 1-B lanes; selecting Grade 2-A leaves them on the saved
Grade 1-B page (limit: those lanes do not yet use Grade 2-A completion).

## Persistence and sessions (Grade 2-A)

The existing page prompt offers a book choice (Grade 1-B or Grade 2-A) and
remembers the last selected book (`math-curriculum:selected-book:v1`). Each
book keeps its own record and Web Lock: `math-curriculum:progress:v1` is
unchanged; Grade 2-A uses `math-curriculum:progress:grade2a:v1` with the same
schema, revision, provenance, future/corrupt preservation, and session-only
fallback. A new Grade 2-A record starts at 0. Valid pages are 0-161; decreases,
raises over ten pages, and entering or leaving Chapter 1 need an extra
confirmation. Chapter boundaries are 10-32, 33-54, and 55-97 (#223); pages
98-161 share one "after Chapter 3" bucket. Every answer snapshots both books for the run, so
Grade 1-B availability (coins, facts, Mixed) survives a Grade 2-A report.
Football snapshots both before each game and before Season mutation; Place by
Place freezes the selected book and page for each Book topics run. Grade 2-A
book practice and rewards live at `place-value-practice:book:grade2a:v1`.

# Grade 2-A Chapters 2-3 coverage (#223)

Scope: Math Mammoth Grade 2-A, revision `rev-2025-09-06` (same PDF hash as
above), printed pages 33-97. Chapter 2 (Clock) has a teacher introduction on 33
and learner pages 37-54; Chapter 3 (Addition and Subtraction Facts Within 0-18)
has a teacher introduction on 55 and learner pages 59-97. Chapter 4 starts on
98 and is outside scope. The full lesson text and figures of 33-98 were
inspected by two independent planners; the inventory below is the reconciled
result. Adding this scope does not change any reported page, history, or
mastery; a learner's page still unlocks each row only when that row's own
printed page is reported complete.

Runnable surface: Place by Place, Book topics, Grade 2-A, grouped under
"Chapter 2: Clock" and "Chapter 3: Facts within 0-18" (one topic per lesson,
plus All completed lessons). Time Lab and the #222 quarter clock are unchanged
and separate; no clock or calendar work enters live Football. All questions,
names, events, routines, numbers, and figures are original. People, routines,
and events are fictional and stated in the prompt; calendars are fixed
Gregorian practice months in 2026-2029 with the year shown. Nothing reads the
device date or clock. Choose/select activities adapt draw/mark/color tasks and
claim no drawing assessment. Clock work stays in five-minute steps (no
one-minute or seconds precision).

A row's page is the printed page that introduces all of its variants; a
variant first seen later has its own later row. Variants are picked by each
row's own occurrence count, so every variant below is reached in its lesson
topic and in All completed. Row IDs carry the `2a-` prefix.

| Lesson (pages) | Rows (unlock page): variants | Bounds and adaptations |
| --- | --- | --- |
| Review—Whole and Half Hours (37) | clock-whole-half 37: read analog, words to digital, +1 hour, +30 minutes | :00/:30 only; crossing 12 to 1 |
| The Minutes (38-40) | minutes-hand 38: numeral to minutes, minutes to numeral, 60/30 facts; minutes-read 39: labeled and standard faces; minutes-match 40: choose clock A/B/C, +5 minutes | p38 asks minutes only (no full late-hour time); p39-40 minutes :00-:30 |
| The Minutes, Part 2 (41-42) | late-read 41: read :35-:55, choose the clock with the minute hand set; late-plus-five 42: +5 with hour rollover (:55), +5 late | "Set the hand" adapted as choosing the matching clock; hour hand drawn between numerals |
| Past and Till (43-45) | past 43 (5-30 past, half past, +5 in words); till 44 (:35-:55 as minutes till the next hour); time-forms 45 (words↔digital, clock to digital/words) | "till" only for :35-:55, "past" only up to 30; 12 → 1 |
| How Many Hours Pass? (46-47) | hours-am-pm 46: AM/PM of stated routines, noon/midnight, same-half intervals, across noon, 12-hour span; hours-overnight 47: to midnight (from 7 AM-11 PM), overnight sleep (bed 7 PM-12 midnight, wake 5-9 AM), two durations summed, 24/48 hours, start time from end and duration, bedtime from wake time and sleep length | Whole hours; fictional routines replace the book's personal questions (no learner schedule asked) |
| Weekdays and Months (48-50) | page 48 is a reference year calendar (no row); weekdays 49: abbreviations, before/after with wrap, +1-7 days, weekday lookup in a calendar; months 50: 30/31 days, February 28/29 with the four-year rule, month before/after with wrap, months until a fictional event | 2024 stated as a leap year; years 2025-2032 |
| Dates (51-53) | dates-weekly 51: all dates of a weekday, next weekly meeting, Month Day format; dates-events 52: date of a starred fictional event, its weekday, Month Day, Year form, tomorrow (month/year end), first and last weekday of a month, +3-12 days, +1-6 months with year wrap; dates-weeks 53: ±1 and ±2 weeks with month/year rollover, every-two-weeks meetings | The book's holiday table becomes a fictional event calendar; "today"/birthday become a stated reference date |
| Review Chapter 2 (54) | plus-ten-min 54 (+10 minutes, never crossing the hour); hours-later 54 (end time from a morning start plus 2-6 hours, across noon); ch2-review 54 (rotates every Chapter 2 row above) | +10 introduced here without rollover; +5 rollover stays from 42 |
| Completing the Next Ten (59-60) | nearest-ten 59: which two tens, nearer ten with "Both are equally near" for midpoints; next-ten-review 59: missing addend to the next ten, helping problem, even number, inverse double; next-ten-plus 60: next ten plus one, pick the whole-ten sum, missing middle of three terms, 90 + ? + ? = 100 pair | Two-digit 11-99 |
| Going Over Ten (61-62) | make-ten-visual 61: ten-frame totals, split the second addend, 10 + ?; make-ten-split 62: decomposition without pictures, targets 10/11/12, parity, two-step money story and its matching number sentence | Sums 11-18 |
| Adding with 9, 8 (63-66) | add-nine 63 / add-eight 65: make ten by moving 1/2, facts with 1-9, doubles 2-10; add-nine-more 64 / add-eight-more 66: +0 and +10, swapped order, missing either addend; p66 also "more than" and "years older" stories, the 8+2… and 18+2… patterns (to 32), half-of-even pattern | +0 and +10 gated at 64 and 66 |
| Adding with 7, 6 (67-70) | add-seven 67: 7 + 4…10, near doubles (1+2 … 9+10), doubles; add-seven-more 68: 7+0/0+7/7+10, swapped, missing addend, add-7/8/9 rule tables; add-six 69: 6+0…10 both orders, 6 + 4 + ?, near doubles, missing addend with 6-9; add-six-more 70: three/four addends with a ten pair, missing start, missing change, comparison, multistep | 7+0 at 68; 6+0/6+10 at 69 |
| Review—Facts with 6, 7, 8 (71-72) | facts-crossing 71: all 20 unordered single-digit crossing facts in both orders, cycled exhaustively; +1 patterns; facts-table-stories 72: addition-table cell, inverse and comparison stories, three addends with no ten pair, four addends | — |
| Subtract to Ten (73-74) | subtract-to-ten 73: 11-19 − ? = 10, split across ten (second part), split result with ten-frames; subtract-to-ten-more 74: direct facts, the same fact in the 20s (2 tens and ones), missing take-away | Crossing subtraction: minuend 11-18, one-digit subtrahend; 19 appears only in "− ? = 10" |
| Difference and How Many More (75-77) | difference-line 75: distance on a 0-17 number line, pick the subtraction, whole-ten differences, near neighbors across a ten to 100; how-many-more 76: missing addend, how many more, choose count up versus count back, count-up differences; compare-stories 77: fewer, left, a defined dozen plus more, three totals, both updated by the same amount, both updated by different amounts (who has more now, and by how much), two durations added then compared with a third | Subtraction templates are restricted to these forms (not general 0-100 borrowing) |
| Number Rainbows (78-79, 83) | rainbow-11-12 78: read a partner, subtract with the full rainbow; rainbow-11-12-fill 79: hidden endpoint, related missing addend/subtrahend; rainbow-13-14 83: hidden endpoint, subtraction | Included although the book marks them optional. Even totals show the middle number joined to a second copy below it (6 + 6, 7 + 7); a hidden middle hides that copy |
| Fact Families 11-16 (80-90) | family-11 80; family-12 81 (+11 review, 6/6/12 family, direct, 10/2/12 family); family-12-more 82 (missing either addend, addition that checks a subtraction, the 17 pattern, subtracting odd numbers from 15/16); family-13 84 (with 10/3/13); family-14 85 (7/7/14, direct 11-14, missing minuend/subtrahend, 10/4/14); family-14-stories 86 (three addends, comparison and change stories, count by 8s to 104, count by 4s, one item to each of 2-6 people then the remainder); family-15 87 (10/5/15, skip 3s, 9-33); family-15-review 88 (all three comparison roles, even as a double to 20, combine then halve, parity 0-20, two/three whole-dollar prices, one two-digit price 11-49 plus whole-ten prices, total at most $99); family-16 89 (8/8/16, mixed 11-19 minus 2-10 including 19 − 9, 10/6/16); family-16-stories 90 (count by 3s/4s, can you afford, money left, shortfall, compare sums with <, >, =, compare a number with a sum (facts to 18 or a whole ten plus ones), compare two subtractions with the same subtrahend from teens 11-18, one group changes by 1-2 and then the groups are compared, two small removals in a row from 14-39 without borrowing) | 13 gated at 84 and 14 at 85. Each ten-plus-part family (10 + p, p + 10, T − 10, T − p) unlocks with its own total's page. The +8 sequence is Book-only and reaches exactly 104 |
| Fact Families 17/18 (91-92) | family-17-18 91: related facts for 17 and 18, sentence counts (9/9/18 has two), mixed facts; family-17-18-review 92: compare without calculating, missing term in any position, four nap durations, boxes needed and pencils left over, a subtraction path from 100 | Boxes of 6/8/10/12, 2-3 boxes, found by repeated addition; no division notation |
| Mixed Review Chapter 3 (93-94) | elapsed-minutes 93 (minutes between two times in the same hour, 5-30); mixed-review-93 (late reading, +5 minutes, halves of two sets, inverse double); mixed-review-94 (subtraction path across tens, half, inverse half, age difference in the teens, a whole-ten age 20-50 minus a small age 2-9, half of an amount then both together, update then compare, the larger amount from a known amount plus "more" (10 more than 10-89, or a one-digit amount more than a one-digit amount, total at most 18)) | Elapsed minutes have their own page-93 gate |
| Review Chapter 3 (95-97) | review-95 (crossing facts, same fact family, small and wide differences to 20, a close two-digit pair 2-9 apart (count up, sometimes across a ten), a two-digit number minus a small number without borrowing); review-96 (missing term anywhere, subtraction path, odd + odd and odd + even totals with parity and equal sharing); review-97 (an original code key and word, comparison roles, two-step shortfall, board squares left, the one dice pair that finishes exactly) | The code puzzle uses original words and keys, no copied joke |

Pages with no practice: 33 (teacher introduction), 34 (optional home games),
35 (external resources), 36 (blank), 48 (reference year calendar), 55-56
(teacher introduction and pacing with an optional card game), 57 (optional
card games), 58 (external resources). Reporting any of these pages unlocks
exactly what the previous learner page unlocks. Omitted as labeled optional
Puzzle Corners: 42 (working backward through several elapsed rounds), 64
(generalized sums ending in 9), 74 (subtraction patterns in larger decades), 82
(missing middle term of three). Optional chapter tests are outside the source
excerpt and the requested scope.

Correction record (review R1, 2026-11-20): an earlier version of this section
said no ordinary exercise was omitted. An independent check against the source
found five gaps, now added at their own pages without removing any earlier
activity: changed-amount comparisons (77, 90), number-versus-sum and
same-subtrahend comparisons (90), the ten-plus-part fact families for 12-16
(81, 84, 85, 87, 89), two-digit and whole-ten review domains (88, 94, 95), and
known-removal, half-then-total, and known-amount-plus-"more" stories (86, 90,
94; the last was found by a review addendum). These two-digit reviews
use only Chapter 1 methods (adding whole tens, whole tens minus one digit,
subtracting without borrowing, counting up between close numbers); they add no
general borrowing.

Football: the only change is `MATH_CURRICULUM_2A.operationPage`, which now
places a teen 11-18 minus a one-digit number that crosses ten on page 73. That
admits existing, truthful Grade 1-B relation families (such as score
differences) with those exact live operands once page 73 is completed in the
game's frozen snapshot. Chapter 3 addition facts were already covered by page
14. No live family, fact pool, event family, or reporting tuple is added, and
the #220 floor weights, readiness, and constants are unchanged; trivial facts
do not gain weight.

## Grade 2-A run state (#223)

The Book store keeps its key and reads two inner schemas. Schema 1 (#219) is
read only: a missing catalog ceiling means page 32, and its pending question is
rebuilt from the released Chapter 1 catalog order and generators, including
saved misses at any reported page. Every write is schema 2, which the released
reader rejects as unknown and leaves byte-for-byte (verified against the base
code before any new history row). An old open tab therefore goes memory-only
after the first new save; that is intended. Reading never writes.

Schema 2 stores `catalogThrough` (32 or 97), the frozen page and topic, a
cursor, a stable pending pointer (skill ID, its printed page, generator
occurrence; the question is regenerated and saved misses must match it), and
up to 32 retained retries. Eligibility is page × ceiling × topic × each row's
own page; saved scores and history are never inputs. Boundaries: `create()`,
Start new book session, a topic change, or a confirmed page at load that
differs from the saved run. Next, retries, Options, background, and reloading
at the same page keep the frame; only a boundary moves a legacy run to the
full catalog. At a boundary an unfinished question that is still eligible
stays exactly (misses and help). One that is locked and has misses moves to
the retained list: hidden, unrewarded, never deleted, and resumed exactly once
it is eligible again (retained retries are served before fresh work). A locked
question with no misses carries no evidence and is not kept. History above a
lowered page is kept. Retained entries are deduplicated only by exact pointer;
a 33rd distinct retry never evicts one: the visit becomes memory-only and the
last durable save stays. If another tab saves a run with a different page,
topic, or ceiling, this tab keeps its own frame in memory, leaves those bytes
alone, and adopts the saved run only at its next explicit new session; a
same-frame change is adopted as before. Writes keep the existing Web Lock with
a callback-time fresh read.

# Football difficulty floor (#220)

Policy `difficulty-floor-v1` changes only how already-eligible ordinary
scrimmage questions are weighted. It never changes a play, answer, score,
opponent, outcome, eligibility, support, or retry behavior, and the scheduler
still makes exactly one draw.

- Classification happens at the trusted derive boundary from the same live
  operands the family uses (never prompt text). Whole tens act as tens facts.
  A distance counted between two field positions is tiny when it is 5 or less
  (72 to 75). A non-crossing ones/tens computation is tiny when it is an
  identity or zero step, steps by at most 2, or uses only facts within 5
  (43 + 1, 40 + 10, 3 + 10). Crossing ten (9 + 9, 8 + 7, 40 − 3) and genuine
  two-place work (23 + 45) are substantial. Everything else is neutral
  (4 + 4, 63 + 5, 10 − 3).
- Canonical floor groups: `score` (committed and wider score totals and
  differences), `yardage-marker` (line-to-gain and line-remaining work),
  `goal-distance`, `drive-distance`, `team-yards`. Grouping legacy concepts is
  intentional: rescaling inside a group changes concept shares within it but
  preserves the group's budget.
- Readiness per group: the latest 12 group results within 30 days, at least 8
  of them, at least 80% first try, at least 5 of the latest 6 first try with no
  second miss among them, and at least 3 unsupported (not guided) first-try
  substantial results. Tiny-only, helped, literacy, and unclassified evidence
  never promote. Grade completion is never evidence.
- Blocks (whole group stays at baseline): the group's latest result was a
  retry or miss; any group concept's latest result this game, or saved within
  30 days, was a retry or miss; guided support is due for an entry; or the
  line-to-gain/drive-distance ladder is downshifted, guided, or refresh-due.
- Effect: after the existing ladder redistribution, when a ready, unblocked
  group has both tiny and substantial entries in the same truthful pool, tiny
  entries take factor 0.25 and the group is rescaled to its prior budget. With
  no substantial alternative, the group keeps its baseline mix. Easy review
  stays possible; no review cadence is invented.
- Evidence: stats rows keep an optional, validated `difficulty`
  `{version, group, magnitude}` projection (no operands). Rows saved before it
  are inert for readiness, except the immutable crossing-ten-only families
  `score-total-ch8-within-20` and `team-yards-add-ch8-within-20`. History,
  mastery, retries, and evidence classes are otherwise unchanged.
