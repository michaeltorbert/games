# Football UI Test Matrix

Use this checklist for any football UI change before merge.

## Device Priority

1. `iPad 11th gen` landscape — `1180x820`
2. `iPad 11th gen` portrait — `820x1180`
3. `iPad Pro 13"` landscape — `1376x1032`
4. `iPad Pro 13"` portrait — `1032x1376`
5. `iPhone 15` portrait — `393x852`
6. `iPhone 17 Pro Max` portrait — `440x956`

## Required Coverage

### Full playthrough devices

Run these on both iPad sizes and orientations:

- start overlay
- longest-label Wake Forest picker preview
- offense call
- offense question
- offense feedback
- player touchdown overlay
- player conversion decision, question, and feedback
- legal three-card player fourth-down decision and its five-call “go” branch
- player punt and field-goal question/result states
- defense call
- defense question
- defense feedback
- opponent touchdown overlay
- opponent conversion question, retry, explanation, and feedback
- opponent punt, field-goal, and fourth-down “go” states
- defense transition overlay
- offense transition overlay
- quarter-end overlay
- halftime overlay
- final overlay

### Phone devices

Run these on both iPhone sizes:

- start overlay
- offense call
- offense question
- offense feedback
- player fourth-down decision
- player conversion decision and question
- player punt and field-goal question/result states
- defense transition overlay
- offense transition overlay
- player touchdown overlay
- opponent touchdown overlay
- opponent conversion question/result
- opponent punt and field-goal question/result states
- quarter-end overlay
- halftime overlay
- final overlay

## Interaction Checks

- touch targets on `.call-btn`, `.decision-btn`, and `.ans-btn` stay at least
  `44x44`
- no hover-only dependency on call selection or answer selection
- offense call grid is fully visible without scrolling on both iPads, both phones, and iPad 11 landscape
- a legal player fourth down shows exactly three separate decision cards (go,
  punt, field goal); an illegal field goal leaves exactly two
- choosing fourth-down “go” returns to exactly five normal offensive call cards;
  an opponent “go” returns to exactly four normal defensive call cards
- the conversion decision shows exactly two separate cards (PAT and two-point
  try), while the scorebug reads `TRY` and a try spot rather than a fake down
- defense call shows one concise, truthful pre-snap look and tendency; choosing a call does not reroll or reveal the opponent's planned call
- opponent punt, field-goal, and conversion actions are announced politely and
  visibly before their questions without exposing the private decision snapshot
- rival picker exposes exactly three native radio choices with a visible checked state, keyboard focus, and at least `44x44` label targets; Start remains a separate CTA above the fold
- selecting a rival previews its public matchup and controlled accent without starting or sampling the game; Play Again returns with that rival selected
- Wake Forest's longest label fits both the start picker and defensive pre-snap read without horizontal overflow on every target
- every question names or models facts from the exact pending snap (down/distance, field or drive distance, committed score, quarter/down, or a real scoring rule); no unrelated fact interrupts the play
- first miss keeps the same frozen question and adds guided support; a second miss shows the concise Film Room summary, offers optional Coach Replay steps, and blocks the football outcome behind Continue
- the Film Room summary receives focus first; Tab moves to Learn why and then
  Continue; Coach Replay focuses its heading, while Back and Escape collapse it
  and restore focus to Learn why without committing the play
- Learn why, Back, and Continue remain at least `44x44`; expanded phone lessons
  use ordinary page scrolling without horizontal overflow or a nested scroll trap
- initial and guided visuals do not announce a hidden answer in either visible copy or the accessible label
- final overlay shows a compact, supportive current-game coach report without pushing the replay control below the fold
- scorebug remains readable without clipped LIVE ribbon or possession indicator
- field, line-to-gain badge, and lower-third do not collide at device edges
- overlays fit without broken clipping or unreadable buttons

## Football and Persistence Invariants

- a touchdown adds six points; its CTA starts a fresh conversion play rather
  than immediately ending the possession
- a made PAT adds one point and a made two-point try adds two; instructional
  success helps the player offense and denies the opponent offense
- touchdown and conversion use distinct play/context IDs and stats rows, while
  the possession and `quarterPossessions` close exactly once after conversion
- a made field goal adds three and restarts the scheduled receiving possession
  at its own 20; a miss or defensive block hands off at the original absolute
  line of scrimmage
- a normal punt retains its frozen 35–50 yard travel; a goal-line punt becomes a
  touchback and a receiver-favorable punt cannot pin the receiver inside its own
  20
- Q1→Q2 and Q3→Q4 retain pending placement; halftime replaces it with the
  prescribed opponent start at absolute 80; Q4 completes the conversion before
  showing the final and schedules no restart
- local history keeps the `footballMathStats:v1` key but writes inner schema 3;
  schema-1/schema-2 rows normalize in memory without a read rewrite, the next
  completed play writes v3, and an unknown future schema remains byte-for-byte
  untouched
- special-team rows use typed outcomes/metrics without adding kick distance,
  punt travel, or conversion values to scrimmage/team/drive yard totals
- repeated answer, Continue, touchdown, or transition controls cannot append a
  duplicate play row, learning resolution, result event, or possession close
- public render state, persisted rows, diagnostics, and result telemetry contain
  stable public IDs/facts only—never the private opponent decision or planned
  call snapshot
- Quick Game leaves `footballMathSeason:v1` byte-for-byte unchanged; Season
  stores one fixed UNC → NC State → Wake Forest schedule and advances on every
  win, loss, or tie while deriving the worded record from raw scores
- a missing/malformed/future/failed season write never blocks Quick Game;
  malformed data requires Start Fresh Season and future-schema bytes are never
  replaced
- a failed final season result shows the final plus the persistent not-saved
  warning and Retry Saving / Play Quick Game controls; reload reopens that rung
  because pending result memory is intentionally not persisted
- the production `commitPendingResolution()` path is the only season-settlement
  origin: a last-Q4 touchdown and its overlay store nothing, its conversion
  stores exactly one result, and direct final/routing/legacy presentation seams
  store zero results

## Verification Notes

- Favor the iPad 11 landscape layout if devices trade off against each other
- Phone layouts must include `440px` widths, not only `<=420px`
- If an overlay or question state requires scroll on phones, confirm the primary CTA is still visible without ambiguity

## Automated Verification

Install the pinned test dependency and Chromium once:

```bash
npm ci
npx playwright install chromium
```

Run the fast call-layout check while iterating on the call grid:

```bash
npm run test:football
```

Run the complete Football release verifier before merge:

```bash
npm run test:football:release
```

The release command first runs DOM-free football-domain and contextual-question
property tests, then runs every Football contract and UI spec against all six
device projects. Coverage includes tagged `activePlay` grounding, type-specific
projection validation, structured choice IDs, valid-question-failure bypass
telemetry, invalid-context fail-closed recovery, exact football-RNG budgets,
stats-v3 migration/privacy/exactly-once behavior, mastery/coach-report behavior,
deterministic opponent decisions, and pre-snap hint truthfulness. Its primary
state matrix follows production paths through a six-point player touchdown,
player conversion, six-point opponent touchdown, opponent conversion, both
possession transitions, and `finishPossession()` quarter-end, halftime, and
final routing. A dedicated special-teams path exercises legal fourth-down
decisions, both normal “go” call counts, and player/opponent punt and field-goal
questions/results.

Each project preserves the original 20 release artifacts:

```text
01-start
02-offense-call
03-offense-question
03b-offense-retry
04-offense-feedback
05-player-td
06-defense-transition
07-defense-call
08-defense-question
08b-defense-retry
08c-defense-explanation
09-defense-feedback
10-opponent-td
11-offense-transition
12-quarter-end
13-halftime
14-final
15-reduced-motion
16-wake-forest-start
17-wake-forest-read
```

The v1.25.0 path adds these 18 explicit artifacts:

```text
05a-player-conversion-decision
05b-player-conversion-question
05c-player-conversion-feedback
10a-opponent-conversion-question
10b-opponent-conversion-retry
10c-opponent-conversion-explanation
10e-opponent-conversion-feedback
18-offense-fourth-down-decision
19-offense-fourth-down-go-call
20-offense-punt-question
20a-offense-punt-feedback
21-offense-field-goal-question
21a-offense-field-goal-feedback
22-defense-punt-question
22a-defense-punt-feedback
23-defense-field-goal-question
23a-defense-field-goal-feedback
24-defense-fourth-down-go-call
```

The v1.26.0 season path adds five compact state artifacts:

```text
25-season-start
26-season-final
27-season-complete
28-season-pending
29-season-unconfirmed
```

The v1.27.0 Film Room path adds the expanded ordinary and special-team review
states to every device project:

```text
08d-defense-coach-replay
10d-opponent-conversion-coach-replay
```

The two phone projects add production pending-result recovery artifacts for
both incompatible durable-store states:

```text
30-season-pending-corrupt
31-season-pending-future
```

The post-test gate therefore requires all 274 PNGs (45 shared screenshots × 6
projects, plus 2 recovery screenshots × 2 phone projects) to exist and be
non-empty. Missing states, clipped or undersized controls, overlay-card
overflow, horizontal overflow, uncaught browser errors, failed behavior
contracts, or missing artifacts make the command exit nonzero.

Canonical screenshots are retained at:

```text
tests/artifacts/release-matrix/<project>/<NN-state>.png
```

Playwright-owned temporary output is isolated under `tests/artifacts/playwright/`, so a later focused Playwright invocation cannot erase the canonical matrix. The pre-test step intentionally replaces the previous canonical matrix before a complete release run.

The final overlay also has a focused compatibility check at `1180x740`, just
inside the existing `max-height: 760px` compact rule and outside the six-device
release matrix. The Coach Report spec verifies that the card and replay CTA fit
the viewport, the CTA remains at least `44x44`, and the page has no horizontal
overflow. Its attached `compact-final-overlay.png` stays under Playwright's
temporary artifact tree and is intentionally not part of the canonical
274-image gate.

### Quick measurement snippet

For a fast pass in DevTools on `/football/?boot=offense-call`, run:

```js
(() => {
  const cards = [...document.querySelectorAll('#call-grid .call-btn')];
  const lastBottom = Math.ceil(Math.max(...cards.map((card) => card.getBoundingClientRect().bottom)));
  return {
    overflow: document.documentElement.scrollHeight - window.innerHeight,
    lastCardDelta: lastBottom - window.innerHeight,
    scrollY: window.scrollY,
  };
})();
```

Expected result: `overflow <= 0`, `lastCardDelta <= 0`, and `scrollY === 0` on each target viewport.

### Manual boot params

For fast CSS iteration without driving through Start Game, open `/football/?boot=offense-call` (or `?boot=defense-call`) to land directly in the call phase. Humans can use these params to eyeball layouts in any browser.
