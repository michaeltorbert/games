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
confirmation. Only Chapter 1's boundaries are verified, so later pages share one
"after Chapter 1" bucket. Every answer snapshots both books for the run, so
Grade 1-B availability (coins, facts, Mixed) survives a Grade 2-A report.
Football snapshots both before each game and before Season mutation; Place by
Place freezes the selected book and page for each Book topics run. Grade 2-A
book practice and rewards live at `place-value-practice:book:grade2a:v1`.

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
