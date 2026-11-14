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
