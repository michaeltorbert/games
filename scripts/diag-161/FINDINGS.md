# Issue #161 findings: WebKit navigation and context-teardown stalls

**Status.** This is the author's bounded intermediate report on the investigation, corrected after Sol final review v1. It is not an approval; the author is not an approver. It claims no root cause, no fix and no overall completion:
- **Original outcome 1 is PARTIALLY MET overall.**
- **Issue #161 remains open.** The underlying cause and the teardown trigger remain open work under #161.

No production, spec, fixture, config or package file was changed. The coordinator executed every run and check; the author ran none.

## Baseline

| Item | Value |
|---|---|
| Source | HEAD `4a891619b4397a190e2e0cbaced0f97d156b6e6a`, with additive tooling in `scripts/diag-161/` |
| Reviewed tooling | 11-path candidate manifest `16998db3b168b7b8c0fcb02ac92711ade781f6593d0d4987977598b8039719ad`, approved for execution by a fresh Sol v6 review |
| Runtime scope fingerprint | Recorded in the gate's `meta.json`: manifest `99a6484ed5e8d8f64d0134850c076038f36f71438a79c9d33c5805dfa59cef55`, 127 entries. The only not-clean entries are the untracked diagnostic files. |
| Engine | Playwright 1.56.1 WebKit, build 2215, version 26.0, on macOS 27. This is engine emulation of the six configured projects with a desktop Safari UA. It is not Simulator or physical-device evidence. |
| Evidence root | `tests/artifacts.nosync/issue-161/<run-id>/`. Each run directory is immutable and indexed by `MANIFEST.sha256`; each check writes its own separate directory. |

## Evidence runs

| Run ID | Arm | Result | Check |
|---|---|---|---|
| `20261009T070207Z-serial-2d7c2a` | 21 release files × 6 projects, 1 worker, trace on | FAILED: `opponent-tendencies › fourth-quarter boundary…` on iphone-15, `beforeEach` goto at 30 s. 45 passed, 91 skipped, 1129 not run. | `…070438Z-check-5a10a8` PASS; 75/75 deletes paired exactly |
| `20261009T070457Z-workers2-0f4854` | Same selection, 2 workers | FAILED: `time-lab-ui › reduced-motion…` on iphone-15, context teardown at 30 s. 93 passed, 134 skipped, 1 timed out, 1 interrupted, 1037 not run. | `20261009T071734Z-check-cba30a` (corrected checker): id 25085 / context `…4D` is unanswered at end of log. The check stays INCONCLUSIVE because overlapping browsers prevent exact ownership. The original `…070750Z-check-5bc2d0` is superseded history; its checker misattributed that deletion as answered. |
| `20261009T072821Z-diff-single-631458` | Synthetic: 150 cycles in one browser | FAILED: `goto` timed out at cycle 75 (context 75 of browser 1). 74 cycles completed. Cleanup close confirmed. The other 5 projects did not run (`--max-failures=1`). | `…072943Z-check-2ea7f6` PASS |
| `20261009T072946Z-diff-relaunch-2bc089` | Synthetic: same cycles, browser relaunched every 50 | COMPLETED-PASS: 6 × 150 = 900 cycles, 18 launches and 18 confirmed closes, 900/900 deletes answered | `…073211Z-check-9166f2` PASS |
| `20261009T073225Z-gate-webkit-90a42f` | Whole-file fresh-CLI partition gate | PASS (see Verification below) | Internal validator `ok: true` |

The harness self-check and smoke runs (v2/v3) and the synthetic abort-race checks are harness evidence only.

## Observed boundaries

There are two distinct boundaries. A common internal cause is **not** proved.

### N: navigation stall

Seen in the serial run, and reproduced identically by `diff-single`.

1. Context and page creation and the page setup commands succeeded. Creating the page took 87–88 ms.
2. `Playwright.navigate` was sent: id 25721 in serial, id 7332 in the synthetic run.
3. WebKit emitted `Page.willCheckNavigationPolicy` and opened a TCP connection to the local server within 2 ms.
4. For 30 s there was **no** `didCheckNavigationPolicy`, **no** reply to the navigate command, **no** `frameStartedLoading` or `requestWillBeSent`, and **no** HTTP request.
5. The server socket closed when the context or browser was torn down, with **0 bytes read and 0 written**.
6. The marked health probes were answered in 1–3 ms throughout.

In serial, the browser then answered later commands within milliseconds and exited with code 0.

A healthy navigation in the same runs shows the order: `willCheck`, connection open, `didCheck`/navigate reply, `requestWillBeSent`, server request, all within about 3 ms.

**Observed boundary.** The stall is a pre-request gap in the protocol:
- it begins after `Page.willCheckNavigationPolicy` and after the connection opened;
- it ends before any observed `didCheckNavigationPolicy`, navigate response, `requestWillBeSent` or HTTP request bytes.

A blockage in the policy decision or its asynchronous completion is an *interpretation consistent with* this evidence. It is not an established internal location. The evidence does not show where inside WebKit or Playwright's instrumentation execution is held, and Playwright instrumentation is not excluded.

### T: teardown stall

Seen only in workers2.

1. A test that the existing project predicate skipped left its page on `about:blank`.
2. Its page-scoped commands, including the teardown screenshot and evaluate, succeeded up to 07:06:22.461.
3. `Playwright.deleteContext` (id 25085) for context `…4D` then received no acknowledgement and produced no `targetDestroyed`/`pageProxyDestroyed` events for 30 s.
4. A same-id reply at 22.827 carries another context's page-proxy fields, so it is not this acknowledgement.

The overall two-worker owner attribution remains INCONCLUSIVE.

## Position, age and the differential pair

| Stall | Ordinal in its browser lifetime | Browser age at stall | Content before it |
|---|---|---|---|
| Serial (N) | Context 75; frame id `4294967371` (= 2³² + 75) | about 102 s | Real Football tests |
| diff-single (N) | Context 75; frame id `4294967371` | 9.7 s | `/version.json` only |
| Workers2 (T) | Context 76; page frame `4294967372` | about 84 s | Real Football tests, split across workers |
| diff-relaunch | At most 50 per browser; no stall in 18 browsers | — | `/version.json` only |

The issue's comments describe two earlier serial runs that stopped at the same serial position (45 passed, 91 skipped, 1129 not run). Their raw data is unrecovered.

**What the predeclared pair supports.** `diff-single` failed at a captured stage, and the `diff-relaunch` control passed completely. Together they support an **association between the navigation stall (N) and state accumulated within one browser lifetime**, under this synthetic workload, with tracing on, `isMobile`/`hasTouch` emulation, workers 1 and WebKit 2215. The pair does not isolate a numeric context count from per-context browser resources, and it does not exclude tracing as a co-factor, because both arms traced.

**Across runs (not a controlled arm).** The stall hit the same ordinal (context and frame 75) at browser ages of 9.7 s and about 102 s, and after very different content. That argues against elapsed wall-clock age or the volume of Football content as the sole trigger. It is a cross-run observation, not an isolated variable.

**What the minimal synthetic run excludes, for N only.**
- **Not necessary for N to reproduce:** in `diff-single` the failing browser's whole history loaded only `/version.json`. That rules out the following as necessary conditions:
  - Football document code, CSS and fonts, and external Google Fonts or other external network;
  - the game's Web Audio and unlock path;
  - session muting;
  - the curriculum and mute fixture init scripts;
  - two-worker scheduling;
  - the Football release spec content.
- **Server ruled out as the immediate block.** The local server accepted the connection and received 0 bytes.
- **Not excluded:** tracing and its screencast, mobile/touch emulation, Playwright's own instrumentation, and per-context resources.
- **No teardown inference.** The pair produced no teardown stall, so nothing here establishes that T shares N's trigger. T's association with lifetime rests only on its 76th-context position, a single correlation.

**Other limits.**
- Post-onset `sample` stacks showed idle UI, WebContent and Networking main threads. They do not exclude CPU or resource activity before sampling or on other threads.
- The effects of earlier tests on the same browser in the real arms remain UNVERIFIED as contributors. The synthetic result shows only that they are not necessary for N.

## Verification strategy (whole-file gate, WebKit)

`gate.mjs --engine webkit` ran 21 release browser files, each in its own fresh Playwright CLI and browser, on all six projects.
- Retries were 0. The release deadlines, assertions and skip predicates were unchanged.
- The domain/registry checks passed once: 171/171.
- Release-artifact preparation ran once, in the run-local directory.
- The validator matched the exact case union: 1266 enumerated = 1266 ran, 590 passed, 676 skipped.
- There were no missing, duplicate, unexpected, wrong-partition, retried, flaky, fixme or expected-fail cases.
- Every skip carries a reason that already exists verbatim in its spec.
- The strict verifier reported: "Verified 304 Football release screenshots across 6 projects."

This is **complete required case and check coverage through bounded browser lifetimes**. It is not a monolithic pass and not a fix. The gate does not measure contexts per browser; its partitioning is consistent with, but does not prove, staying below the observed ordinal. The monolithic WebKit selection still fails reproducibly at the serial position.

## Original outcomes

| # | Outcome | Status |
|---|---|---|
| 1 | Identify or narrowly bound the navigation and teardown stalls | **PARTIALLY MET overall.**<br>**Navigation:** a narrow observed bound. It is the pre-request protocol gap after `willCheckNavigationPolicy`, captured twice at context 75 (serial and diff-single). It is associated with accumulated per-browser lifetime state under a controlled synthetic contrast that needs no Football content. The internal location is interpreted, not established.<br>**Teardown:** the captured boundary is the unacknowledged `deleteContext` for an untouched `about:blank` context, seen once at context 76 with inconclusive two-worker ownership. Its trigger was not reproduced.<br>The internal cause is UNVERIFIED for both. |
| 2 | Retain fresh failed-run evidence durably | **MET** for the fresh runs: serial, workers2 and diff-single are FAILED, collection is complete, and the checker verified the manifests. **Explicit exception:** the historical #49 raw bundle and commands are UNRECOVERED and cannot be restored. |
| 3 | Reproducible verification without retries, new skips, or relaxed deadlines or assertions | **MET for WebKit** through the whole-file gate above, with the stated partition limitation. **Not run:** the Chromium gate (`--engine chromium`); this investigation produced no Chromium evidence. |
| 4 | Preserve runtime, rendering, font bytes, native audio, session muting and all six projects | **MET.** The changes are additive tooling only. Server byte, error and crash parity was verified in preflight. The existing mute fixture and the audible audio spec are unchanged. All six projects use explicit WebKit selection; `--browser` was never used. |
| 5 | Keep #158 and #160 separate | **MET.** Neither was analyzed or changed. The workers2 `interrupted` case comes from `--max-failures=1`. |

**Recommendation.** This report supports, at most, approval as a **bounded intermediate report**. It is not a completion of #161.
- **Outcome 1 is PARTIALLY MET, and #161 stays open.** The underlying cause, the internal location of the navigation gap and the teardown trigger remain open work under the existing issue. No additional experiment battery is proposed here.
- **Outcomes 2 to 5** are as tabulated, with the explicit exceptions above.
- **The underlying stall is not fixed.** Nothing here justifies a production change, cached fonts, longer deadlines, retries or relaxed assertions.
- **Optional suggestions, not new task requirements:**
  - A conditional Chromium check (`gate.mjs --engine chromium`) if a later release needs both engines.
  - An upstream Playwright/WebKit report using `differential/lifecycle.spec.mjs` as a reproducer.

## Reproduce

Run from the repository root at the baseline above. Run each command only when nothing is listening on port 8090.

```bash
node scripts/diag-161/preflight.mjs        # no browser; parity, mute coverage, differential discovery
node scripts/diag-161/run-arm.mjs --arm selfcheck && node scripts/diag-161/check-run.mjs <dir>
node scripts/diag-161/run-arm.mjs --arm serial    # monolithic WebKit; expect FAILED near the serial position
node scripts/diag-161/run-arm.mjs --arm diff-single   --question "Is the WebKit stall associated with state accumulated within one browser lifetime under a minimal synthetic workload?"
node scripts/diag-161/run-arm.mjs --arm diff-relaunch --question "<same>"
node scripts/diag-161/check-run.mjs tests/artifacts.nosync/issue-161/<run-id>
node scripts/diag-161/gate.mjs --engine webkit     # whole-file verification; --engine chromium for the other engine
```

`check-run` exits 0 for PASS, 1 for FAIL and 4 for INCONCLUSIVE. Two-worker pairing is INCONCLUSIVE by design.

## Review record

The operational review files live outside the candidate, under the git-ignored `output/issue-161/`.
- **Sol v1:** R1–R6 (protocol parsing, collector draining, id namespacing, positive stream checks, fingerprint, metadata scope). Resolved in author v2 and confirmed by Sol v2.
- **Sol v2:** R2a (the abort/seal race). Resolved in author v3 and confirmed by Sol v3.
- **Sol v4:** V4-1 to V4-4 (differential close/stage bounds, overbroad exclusions, overstated interpretation). Resolved in author v5.
- **Sol v5:** V5-1 (unsupported fixture). Resolved in author v6 with verified fixtures and preflight discovery.
- **Sol v6:** approved the exact v6 candidate for the pair, with no unresolved finding.

**Sol final review v1** (CHANGES_REQUIRED on the report only; no harness defect). All three findings are addressed in this revision:
- **F1, ACCEPTED.** The recurrence is now two captured navigation occurrences at 75. The teardown stall at 76 is kept as a separate boundary, not a third capture.
- **F2, ACCEPTED.** The navigation bound is restated as an observed pre-request protocol gap after `willCheckNavigationPolicy`. The internal policy or completion blockage is labelled an interpretation, not an established location.
- **F3, ACCEPTED.** The workers2 row cites the corrected check `20261009T071734Z-check-cba30a`. The original `…070750Z` check is marked superseded.

This revised report awaits a fresh Sol exact-report review. No approval is implied by the author.

## Limitations

- **Small sample.** There is one synthetic failure and one clean control. The navigation stall was captured twice at ordinal 75, across two workloads (serial and diff-single). The teardown stall at 76 is a distinct boundary with inconclusive ownership, and it is not counted as a recurrence of the navigation stall. The historical prose supplies no raw capture.
- **Partial diff-single exposure.** Only iphone-15 ran in `diff-single`, because `--max-failures=1` stopped the arm. The other five projects were not exercised in the single-browser condition.
- **Two-worker attribution.** Protocol owner attribution with two workers is INCONCLUSIVE. The teardown attribution relies on payload context and page-proxy fields.
- **Perturbation.** Observation adds perturbation in every arm: tracing, protocol debug logging, health probes, periodic `ps`, and post-onset `lsof`/`sample`.
- **Fidelity.** The base projects set no Safari mobile UA. None of this is usable-viewport, layout or device evidence.
