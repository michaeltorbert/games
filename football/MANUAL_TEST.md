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
- offense call
- offense question
- offense feedback
- player touchdown overlay
- defense call
- defense question
- defense feedback
- opponent touchdown overlay
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
- defense transition overlay
- offense transition overlay
- player touchdown overlay
- opponent touchdown overlay
- quarter-end overlay
- halftime overlay
- final overlay

## Interaction Checks

- touch targets on `.call-btn` and `.ans-btn` stay comfortably tappable
- no hover-only dependency on call selection or answer selection
- offense call grid is fully visible without scrolling on both iPads, both phones, and iPad 11 landscape
- defense call shows one concise, truthful pre-snap look and tendency; choosing a call does not reroll or reveal the opponent's planned call
- every question names or models facts from the exact pending snap (down/distance, field or drive distance, committed score, quarter/down, or a real scoring rule); no unrelated fact interrupts the play
- first miss keeps the same frozen question and adds guided support; a second miss shows the worked model and blocks the football outcome behind Continue
- initial and guided visuals do not announce a hidden answer in either visible copy or the accessible label
- final overlay shows a compact, supportive current-game coach report without pushing the replay control below the fold
- scorebug remains readable without clipped LIVE ribbon or possession indicator
- field, line-to-gain badge, and lower-third do not collide at device edges
- overlays fit without broken clipping or unreadable buttons

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

The release command first runs DOM-free football-domain and contextual-question property tests, then runs every Football contract and UI spec against all six device projects. Coverage includes frozen-snap grounding, structured choice IDs, valid-question-failure bypass telemetry, invalid-context fail-closed behavior, independent RNG streams, bounded stats persistence, mastery/coach-report behavior, situational opponent tendencies, and pre-snap hint truthfulness. Its state matrix follows the game’s production paths: a correct offense answer produces the player touchdown, a second defensive miss produces the capped opponent touchdown path, touchdown buttons produce both possession transitions, and `finishPossession()` produces quarter-end, halftime, and final.

Each project archives these 14 required states:

1. start
2. offense call
3. offense question
4. offense feedback
5. player touchdown
6. defense transition
7. defense call
8. defense question
9. defense feedback
10. opponent touchdown
11. offense transition
12. quarter-end
13. halftime
14. final

An eighteenth screenshot records the reduced-motion state after the matrix also captures offense retry, defense retry, and the blocking explanation/Continue state. The post-test gate requires all 108 PNGs (18 screenshots × 6 projects) to exist and be non-empty. Missing states, clipped or undersized controls, horizontal overflow, uncaught browser errors, failed behavior contracts, or missing artifacts make the command exit nonzero.

Canonical screenshots are retained at:

```text
tests/artifacts/release-matrix/<project>/<NN-state>.png
```

Playwright-owned temporary output is isolated under `tests/artifacts/playwright/`, so a later focused Playwright invocation cannot erase the canonical matrix. The pre-test step intentionally replaces the previous canonical matrix before a complete release run.

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
