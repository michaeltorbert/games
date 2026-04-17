Original prompt: ok so 43 is now our top priority, as the previous UI changes made the game unusable. honestly I think I liked it better before. we need to fix this shit. should 36 be done first? would that be meaningfully and functionally beneficial?

- 2026-04-17: Branched `codex/football-36-minimal-harness` from fetched `origin/main`.
- 2026-04-17: Added minimal repo-owned Playwright scaffolding for football call-layout verification plus a tiny root static server.
- 2026-04-17: Added `?boot=offense-call` and `?boot=defense-call` manual boot modes to football for faster iteration.
- 2026-04-17: Installed the pinned `@playwright/test` dependency and Chromium browser.
- 2026-04-17: Direct Playwright browser probe against `http://127.0.0.1:4173/football/` confirmed the layout assertion works and currently fails on iPhone 15 portrait: last call card bottom `1452` vs viewport `852`, `scrollY` stayed `0`.
- 2026-04-17: Saved a manual probe screenshot at `tests/artifacts/manual-probe/iphone-15-opening-snap.png` and inspected it; the broadcast chrome and field stack leave the call grid far below the fold.
- 2026-04-17: Replaced the hanging `playwright test` CLI path with a direct repo-owned Playwright runner script so `npm run test:football` uses the browser API directly.
- 2026-04-17: `npm run test:football` now executes cleanly and fails the current UI across every checked viewport. Worst failures from the runner:
  - `ipad-11-portrait`: last card bottom `1399` vs viewport `1180`
  - `ipad-pro-13-portrait`: last card bottom `1416` vs viewport `1376`
  - `iphone-15-portrait`: last card bottom `1486` vs viewport `852`
  - `iphone-17-pro-max-portrait`: last card bottom `1456` vs viewport `956`
  - `ipad-11-landscape`: last card bottom `1201` vs viewport `820`
- TODO: use the new runner artifacts under `tests/artifacts/football-call-layout/` to drive the #43 layout fix.
- TODO: fix issue #43 by trimming portrait/phone chrome and field height until the call grid fits above the fold.
