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

### Phone spot-check devices

Run these on both iPhone sizes:

- start overlay
- player touchdown overlay
- opponent touchdown overlay
- defense transition overlay
- offense transition overlay
- quarter-end overlay
- halftime overlay
- final overlay

## Interaction Checks

- touch targets on `.call-btn` and `.ans-btn` stay comfortably tappable
- no hover-only dependency on call selection or answer selection
- offense call grid is fully visible without scrolling on portrait iPads and phones
- scorebug remains readable without clipped LIVE ribbon or possession indicator
- field, line-to-gain badge, and lower-third do not collide at device edges
- overlays fit without broken clipping or unreadable buttons

## Verification Notes

- Favor the iPad 11 landscape layout if devices trade off against each other
- Phone layouts must include `440px` widths, not only `<=420px`
- If an overlay or question state requires scroll on phones, confirm the primary CTA is still visible without ambiguity

## Repo Verifier

Install the pinned verifier dependency and browser once:

```bash
npm install
npx playwright install chromium
```

Run the football call-layout verifier:

```bash
npm run test:football
```

Artifacts land under `tests/artifacts/football-call-layout/`.

For quick manual CSS iteration, you can also boot straight into the offense call state:

```bash
node scripts/serve-root.mjs
```

Then open `http://127.0.0.1:4173/football/?boot=offense-call`.
