# Issue #160 diagnostics: late Halftime presentation

Results: [`FINDINGS.md`](FINDINGS.md), with exact evidence in [`evidence.json`](evidence.json).

These tools are for diagnosis only. They change nothing in `football/**`, `tests/**`, the release runner, the registry or any version. The target case is `tests/football-context-integration.spec.mjs` › *committed special results survive defense-transition and halftime overlays, then clear on Continue*. Its path is the Q2 successful punt: `finishCommittedTransition` arms a 1400ms `advTimer`, the callback calls `routePossessionPresentation(message, source)`, that leads to `showHalftime` and then `activateOverlay('ov-halftime')`. The test asserts `toBeVisible({ timeout: 2500 })`.

## Files

| File | Role |
|---|---|
| `arms.json` | Predeclared arms, expected control labels, invariants, stop rules |
| `instrument.mjs` | Pure anchored insertions into the served `football.js`, with exact counts |
| `gen-spec.mjs` | Generates the target-only spec, the control spec and the full-file copy. An exact round trip proves no other edits |
| `fixture.mjs` | Extends `tests/curriculum-fixture.mjs`. Adds the hash-checked route, the page buffer and observers, the brackets and the grace poll |
| `classify.mjs` / `classify.test.mjs` | The chain classifier and its synthetic-log tests |
| `coverage.mjs` / `coverage.test.mjs` | Execution coverage through the canonical release `validate()`, and its synthetic-report tests |
| `config.mjs` | Base config plus chromium. testDir is the repo; output goes to `DIAG160_OUT` |
| `run.mjs` | Phases, guards, provenance, judging and stop rules |

## Instrumentation (instrumented arms only)

`page.route` intercepts `/football/football.js`. It instruments the body only if the served sha256 equals the working-tree sha256 in the run manifest. The runner requires every guarded source to equal its `HEAD` blob. On a mismatch the route fulfills the original body and the classifier reports `TOOL-DEFECT`.

Each insertion is a new line placed after its anchor. It reads values and calls only `Date.now`, `performance.now` and the buffer's `push` (through `?.`). Nothing wraps `setTimeout` or `clearTimeout`.

| Name | Anchor (original line) | Count | Records |
|---|---|---|---|
| arm | the 1400ms `advTimer = setTimeout(...)` in `finishCommittedTransition` (3744) | 1 | timer id, source identity |
| route | `routePossessionPresentation` entry (3594) | 1 | `advTimer`, source identity, live gameId/possessionId/phase/quarter/quarterPossessions |
| intent | after `planPossessionPresentation(...)` (3596–3598) | 1 | accepted, kind, reason |
| activate-enter | `activateOverlay` entry (4788) | 1 | id |
| activate | after `focusActiveOverlay(active)` (4799–4800) | 1 | id |
| clear | after each `clearTimeout(advTimer);` (2771, 2825, 4859, 4876, 4890, 4987, 5088, 5111, 5645) | 9 | site line, id. The buffer keeps a clear only if the id was armed |

The page buffer (`pageObserver` in `fixture.mjs`) holds at most 4000 frozen events in memory, each with a sequence number. Source objects are linked by identity (`srcRef`). Other observers:
- A `football:diagnostic` listener.
- A `MutationObserver` on each `.overlay[data-overlay]` class. It records `checkVisibility()`, the bounding rect, display, visibility and opacity when `show` is added.
- On the Node side: `pageerror`, console warnings and errors, and a clock probe (pre/post around every buffer read).

## Brackets and grace

The generated spec is the canonical text with these edits only:
- Node marks around `resolveSpecialPolicy` (`answerStart`/`answerEnd`).
- The unchanged assertion wrapped by `diag160.settle`, which records `expectStart`/`expectEnd`.
- `control.spec.mjs` only: one `diag160.intervene` line marked SYNTHETIC.

Grace runs only after the assertion has failed:
- It polls the buffer, one read in flight at a time, until the chain's callback or cancel record appears, or until 3000ms pass on the Node monotonic clock.
- It then rethrows the original error.
- Elapsed time, poll count, what was found and any truncation are recorded.
- The grace is the same for synthetic and natural failures. It runs inside the 30s test timeout, and the page stays open until teardown has collected the buffer.

## Labels

| Label | Signature | Allowed claim |
|---|---|---|
| PASS | one arm, one linked callback, accepted intent of the expected kind, one target activation, visible geometry, assertion passed | none beyond descriptive timing |
| K1 | linked callback's earliest Node time after `expectEnd`, then accepted, activated and visible | browser-side callback ran after the deadline. The cause of the delay is not established |
| K4 | linked callback, intent rejected | rejection observed with its reason. Attribute the source change before calling it a defect |
| K5 | accepted intent, then no target activation, or activation without visible geometry | an observed presentation gap. Attribution is required; it is not automatically a production defect |
| K6 | the armed id was cleared at a recorded site before any callback | cancellation at that site. Attribute the site's owner |
| KV | latest Node time of visible activation is before `expectStart + 2500` and the assertion failed | activation preceded the deadline by Δ within the clock band. No cause claimed |
| U | missing or partial data, observer missing or erroring, truncation, multiple arms/routes/activations, unlinked route, missing callback with no cancel, inside the clock band, a wall/monotonic inconsistency, a failed assertion shorter than its timeout, an uncaught page exception beside all-PASS chains, or a pass without a complete chain | nothing |
| TOOL-DEFECT | route not instrumented as built, or a page exception at an inserted line | stop and checkpoint |

The clock band is the intersection of the probe offsets, ±1ms. The assertion deadline is taken to lie in `[expectStart + 2500, expectEnd]`, but only when that interval is valid.

**Clock and interval validity (U otherwise):**
- **Finite stamps.** The four Node marks, the arm, the linked callback and the show record must all carry finite wall (`Date.now`) and monotonic (`performance.now`) times. The arm must carry a source identity.
- **Node order and steadiness.** In Node, the marks and the last post-assertion probe must be in monotonic order. Between consecutive readings, the wall and monotonic deltas must agree within 2ms + 1000ppm of the interval.
- **Page order and steadiness.** In the page, the same check applies from arm → callback → show and from arm → final buffer read.
- **Why that tolerance.** The 2ms covers `Date.now` truncation to whole ms (a difference of two readings is off by under 1ms) plus `performance.now` coarsening. The 1000ppm is twice the maximum NTP slew rate.
- **What a gap means.** A larger gap means the wall clock stepped, so wall-time comparisons are unsafe.
- **Why monotonic checks, not probes.** A step common to both processes leaves the probe offset unchanged, so only these monotonic checks can reveal it. A step that is exactly undone between two checked readings is not detectable; this is a stated residual risk.
- **Short assertions.** A failed assertion whose monotonic duration is under 2499ms ended before its timeout, so it has no deadline interval. It is U (`assertion-interval-short`), whatever the chain timing.
- **No new deadline.** No other upper bound or test timeout is introduced.

**Page exceptions.** Any captured uncaught page exception makes an otherwise all-PASS diag U (`page-errors-unattributed`), and the runner stops. The exception is retained and is not attributed to production automatically. If it is at an inserted line, the label is TOOL-DEFECT. Any `control`-tagged diag is SYNTHETIC, and its labels are never natural causes. The static poll schedule in Playwright's `frames.js` is discussed only as a possibility, never used as a classifier boundary.

## Phases and commands

Run these from the repository root with Node and the pinned `node_modules`. Workers are never set. Each command creates a new `output/issue-160/runs/<UTC>-<phase>-<hex>/`.

```
node scripts/diag-160/run.mjs selfcheck
node scripts/diag-160/run.mjs controls
node scripts/diag-160/run.mjs isolated
node scripts/diag-160/run.mjs file
node scripts/diag-160/run.mjs combined
```

Run them in that order, and run a phase only after the previous one returned `PASS-*`. The runner refuses to start if `ISSUE49_CAPTURE_STAGE`, `PLAYWRIGHT_JSON_OUTPUT_FILE` or any `DIAG160_*` variable is set. It sets these itself for each Playwright CLI:
- `DIAG160_OUT`: the step's own output directory.
- `DIAG160_SOURCE_MANIFEST`: the run's `manifest.json`.
- `DIAG160_MODE=instrumented`: instrumented arms only.
- `DIAG160_CONTROL`: synthetic controls only.

Every Playwright CLI is `node node_modules/@playwright/test/cli.js test --config scripts/diag-160/config.mjs <specs> [--grep=…|--list]` with cwd `<run>/cwd`.

**Fail-fast.** Only the natural execution CLIs (isolated, file, combined) add `--max-failures=1`.
- After the first test failure, Playwright schedules no queued case. Workers already running may finish their current case.
- Any case left unrun appears with no result or is missing. The runner reports it as `not-run:N` and as a coverage failure, so the phase is STOPPED and never PASS.
- Workers, retries 0, the 1400ms timer and the 2500ms assertion are unchanged.
- Controls run without fail-fast, because they fail on purpose and their expected case must complete.
- Bounded batch limitation: a classifier anomaly in a *passing* case (for example U, or a page exception beside PASS chains) is judged only after its CLI exits. Fail-fast doesn't apply to it. The current CLI's remaining cases may therefore still run, but no later CLI or phase starts.

**Execution coverage.** The isolated, file and combined phases first run a `--list` enumeration of the unchanged canonical selection: the canonical file with the target `--grep` for isolated, the canonical file for file, and the release BROWSER list for combined. Each executed report is then checked by `coverage.mjs`, which calls the canonical release `validate()` from `scripts/run-football-release.mjs`. That check requires:
- Every enumerated case and project ran exactly once, with no retry.
- Each one passed first time, or skipped with a skip reason already present in the canonical spec.
- No missing, duplicate, extra, stray-file, fixme or expected-fail cases, and no report errors.

Keys keep the full describe ancestry. The generated copy is renamed to its canonical file before validation. A run that fails coverage stops. PASS never rests on an enumeration match alone.

Each run directory holds:
- `manifest.json`: HEAD, guarded hashes and blobs, tool hashes, versions, host.
- `instrument-manifest.json`, `gen-manifest.json` and `gen/`.
- `out/NN-<step>/`: `cli.json` (command, env, exit code, 1s host load samples), logs, `report.json`, `test-results/**/diag160.json` and `judgement.json`.
- `status.json`.
- `files.sha256.json`. All files are read-only.

The combined phase is a diagnostic topology. It is neither the release gate nor a historical reconstruction.
