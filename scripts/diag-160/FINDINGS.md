# Issue #160 findings: late Halftime presentation (Chromium)

**Status:** root cause unresolved; #160 stays open. No production change is proposed.

**Scope.** These findings cover only the Chromium release case *committed special results survive defense-transition and halftime overlays, then clear on Continue* in `tests/football-context-integration.spec.mjs`. The WebKit stall in #161 is a separate issue and is not addressed here.

**Evidence.**
- Exact numbers, hashes and commands are in [`evidence.json`](evidence.json).
- The method and labels are in [`README.md`](README.md).
- The raw run bundles (`output/issue-160/runs/<runId>/`) are gitignored, kept only on the machine where they were produced, and not part of this repository. Their per-file sha256 values are in `evidence.json`.

## What was tested

**Path.** The target is the Q2 successful-punt path. `finishCommittedTransition` arms a 1400ms `advTimer`, and the callback calls `routePossessionPresentation`, then `showHalftime`, then `activateOverlay('ov-halftime')`. The test then asserts `toBeVisible({ timeout: 2500 })`.

**Source and runtime.**
- All runs used HEAD `577a2ca`, with the guarded sources equal to their HEAD blobs.
- Chromium 141.0.7390.37 (Playwright 1.56.1), Node 25.9.0, macOS 27 on an Apple M5 Pro with 15 logical CPUs.
- Workers were left unset and resolved to 7. Retries were 0, all six projects ran, and trace was off.

**Harness.** The harness fingerprint `531bc960…f2fc4` was approved by a fresh review before any browser run, and the coordinator executed every phase. The instrumented runs served a hash-checked copy of `football.js`. It carried 14 read-only insertion lines (arm, route, intent, activation and nine `clearTimeout(advTimer)` sites), and each run recorded that the copy was served exactly as built.

## Results

Every predeclared phase passed, and no natural failure or anomaly occurred.

| Run | Phase | Status | Target executions |
|---|---|---|---|
| `20261010T213951Z-selfcheck-7a6cdc` | selfcheck (no browser) | PASS-selfcheck | — |
| `20261010T214112Z-controls-4437e0` | synthetic controls | PASS-controls-synthetic | 4 (1 normal + 3 deliberate failures) |
| `20261010T214155Z-isolated-239546` | isolated I/U ×3 | PASS-isolated | 3 instrumented + 3 unmodified, all passed |
| `20261010T214240Z-file-480c4d` | full context-integration file | PASS-file | 1 instrumented; 438/438 cases covered |
| `20261010T214318Z-combined-41bdbf` | 21-file release selection, one CLI | PASS-combined | 1 instrumented; 1362/1362 cases covered |

**Coverage versus exposure.**
- **What coverage checked.** The file and combined runs were validated by the canonical release `validate()` against a `--list` enumeration of the unchanged canonical selection. Every case ran exactly once, passed first time or skipped with its canonical reason, and none was missing, duplicated or retried.
- **How often the target actually ran.** The target is primary-only, so it executed once per CLI, on `ipad-11-landscape`. Its other five project cases are canonical skips.
- **Total natural target executions:** 8 (5 instrumented, 3 unmodified), plus the instrumented normal sensitivity arm.
- **How independent they are.** All runs were on one host within about 8 minutes. They are correlated exposures, not independent samples, so no rate or probability bound follows from them.

**Natural instrumented chronology.** Five passing executions, each with two chains. The figures below come from instrumented runs, so they include observer and route overhead. The unmodified arms record no chronology.

| Run | Halftime arm→callback (page ms) | callback→visible (ms) | visible after expect start (Node ms, clock band) | margin to 2500 ms deadline |
|---|---|---|---|---|
| isolated 0 | 1401.0 | 2.2 | 1392–1396 | 1104 |
| isolated 2 | 1401.3 | 2.3 | 1391–1395 | 1105 |
| isolated 4 | 1400.9 | 2.1 | 1393–1397 | 1103 |
| file | 1401.4 | 3.0 | 1385–1392 | 1108 |
| combined | 1401.9 | 3.2 | 1293–1302 | 1198 |

**What every passing chain showed.**
- One arm, one linked callback, an accepted `halftime` intent (or `defenseTransition` for the first chain), one activation, and visible geometry: `checkVisibility()` true, 1180×820, `display: flex`.
- No cancel of the armed id before its callback.
- No page exceptions and no buffer truncation.

**Descriptive observations.** These are not causal claims.
- Arm-to-callback timing stayed within 2ms of the 1400ms timer in every natural chain (1400.9–1401.9ms), including the combined run. Halftime visibility fell 1103–1198ms before the earliest possible assertion deadline.
- In the combined run, the halftime arm happened 103–112ms before Node started the assertion. This is derived as arm→visible minus the measured visible-from-expect-start, across the clock band. It is the time for the answer `evaluate` to return to Node; in the isolated runs it was 7–11ms. This explains the earlier visibility time measured from the assertion's start in that row.
- Route-handler interception cost 18–99ms per page load, outside the timed chain. Whole-CLI durations for instrumented and unmodified isolated runs overlap (5.48–5.83s versus 5.57–5.58s); this is not an overhead measurement of the target.

**Synthetic sensitivity.** Every control was deliberately induced, labeled synthetic, and is never evidence of a natural cause. Its failed assertions were retained as synthetic failures.

| Control | Intervention (halftime chain only) | Expected → observed |
|---|---|---|
| normal | none | PASS, PASS → PASS, PASS |
| block | page main-thread busy-wait from arm+1300 to arm+4400ms | PASS, K1 → PASS, K1. The callback ran 4402ms after arm and at least 1889ms after the assertion ended; the 3000ms grace found it after 2 polls (2008ms) |
| stale | live `state.possessionId` replaced; timer kept | PASS, K4 → PASS, K4 (`stale-possession`, with the native `football:diagnostic` event) |
| cancel | `clearTimeout(advTimer)` from an evaluate | PASS, K6 → PASS, K6 (site `control-evaluate`) |

**What the controls show.**
- In a real browser, the harness can tell apart a callback that ran after the deadline, a rejected route, and a cancelled timer.
- The post-failure grace recovers a callback queued behind a blocked main thread.

**What they don't show.**
- No browser control produced KV (visible before the deadline but the assertion failed, i.e. a late consumer), K5 (accepted intent with no visible activation), the U variants or TOOL-DEFECT. Those labels are checked only against synthetic logs in `classify.test.mjs`.
- The block control proves only that a deliberate main-thread stall is detected. It doesn't show that load, timer scheduling or Playwright polling caused #160.

## Original outcomes

| Outcome | Disposition | Reason |
|---|---|---|
| O1: narrow callback lateness vs source/rejection/cancel vs activation/visibility/consumer | **Capability met within stated bounds; the historical cause is unverified** | Browser controls separate K1, K4 and K6. KV, K5 and U are checked only against synthetic logs. With no natural failure, there was nothing to classify. The original failure bundle is unavailable, the runtime has changed since `085eb876`, and the original topology is unknown, so nothing here reconstructs or explains the historical failure |
| O2: meaningful sensitivity, retained failures, exact provenance | **Met** | All four controls labeled as predeclared. Every run records HEAD, guarded and tool hashes, the instrumented hash, versions, commands and per-file sha256, and its files were made read-only. There were no natural failures to retain |
| O3: fix only on natural causal evidence | **Met (no fix)** | No natural failing chain was observed, so no production change is justified. #160 stays open |
| O4: invariants preserved | **Met by construction** | The 1400ms timer and the 2500ms assertion are unchanged (exact round trip). Retries 0, default workers (7), six projects, the canonical skips (validated), and the existing test-scoped mute are unchanged. No production or canonical test file changed, and guarded blobs equalled HEAD in every run. Audio, preferences, learning, scoring, fonts and rendering are untouched because no production code changed. The diagnostic route altered the served `football.js` only inside instrumented diagnostic runs |
| O5: scoped diagnostics PR and findings via the App | **Pending the coordinator** | The author made no GitHub writes |
| O6: author owns corrections; fresh review per fingerprint | **Met so far** | The same author corrected F1–F4, and a fresh review approved the executed fingerprint. This findings change needs a new fresh review |

## Limits

- **Thin, correlated exposure.** A pass does not fix #160 or #161, and the absence of failures here supports no rate.
- **The combined run is not the release gate.** It ran one CLI over all 21 files, whereas the gate runs one fresh CLI per file. It is also not a historical reconstruction.
- **Instrumentation perturbs.** Interception, the `MutationObserver` layout read and the extra evaluates all add cost. The unmodified arms confirm only pass or fail.
- **Fault classes beyond the harness's reach.** These would leave a natural failure U, not mislabeled:
  - Clear calls outside the nine anchored sites.
  - Page exceptions in the unmodified arms.
  - A wall-clock step exactly undone between two checked readings.
- **Batch judgement.** A classifier anomaly in a passing case is judged only after its CLI exits. Fail-fast stops queued cases only after a test failure.

## Smallest next evidence question

Before any further exposure, the question is: **when #160's failure occurs naturally on the current runtime, which chain class does it fall in (K1, K4, K6, KV, K5 or U)?**

Repeating the predeclared runs unchanged won't answer that. Two bounded routes:
1. **Recover original artifacts.** Find any surviving artifact from the original failure (Playwright error context, call log, screenshot or trace) and check its poll count and failure text.
2. **One instrumented gate-topology run.** If maintainers want more exposure, run one instrumented pass in the canonical release topology (fresh CLI per file, context-integration replaced by its generated copy, default workers), under a separately reviewed plan. Stop at the first failure and classify it.

Either route needs its own review before it runs.
