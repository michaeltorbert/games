# Issue #161 continuation findings: bounded intermediate report

**Status.** This is the native Opus author's bounded intermediate report on the issue #161 continuation. It claims no root cause, no fix, no safe context threshold and no completion.
- **Issue #161 stays open.**
- **O1 (navigation) and O2 (teardown) remain UNVERIFIED overall:** both are partially bounded and neither cause is identified.
- **This report is a diagnostic delivery only.** No production, release, test, fixture, config, package or registry file changed. The historical report `../FINDINGS.md` is unchanged.
- **Execution and review.** A coordinator executed every command; the author ran none. Independent Sol reviews approved the harness for execution at each stage.

## 1. Question and approach

The issue asks us to explain, or narrowly bound, two intermittent WebKit stalls:
- **N:** the `page.goto` load stall;
- **T:** the `browserContext.close` teardown stall.

It also asks us to replace another passing run with meaningful verification. The agreed continuation had four parts:
1. structured re-extraction of the four retained historical runs;
2. a minimal additive harness with exact per-browser protocol ownership and positive collector sensitivity checks;
3. one predeclared batch of six synthetic arms;
4. after interpreting those, one source-informed teardown contrast through the real stock fixtures.

Each part was reviewed before it ran.

## 2. Provenance

**Repository.** Base `883d550d0d4da25d8904936b5bb1a7357c9035b7`, which is `origin/main`. The diagnostics are additive under `scripts/diag-161/continuation/`.

**T3 candidate.** The reviewed 16-file candidate manifest is `ef6f8e095df0eb71fdc2bdbd7b8b7635c1115fd2ef106c58370a519fc4818c54` (Sol T3 v4: approved for execution).

**Declared runtime fingerprints.** These hash only the following:
- the content of `scripts/`, `tests/`, `football/` and `shared/`;
- the root config, package, lock and `version.json`;
- a *selected* list of installed Playwright files;
- the WebKit `pw_run.sh` launcher only;
- the Node version.

They are **not** full installation byte hashes.

| Collection | Fingerprint | Entries |
|---|---|---|
| Batch 1 | `e4eb54da32190d2b6aa09c1120937beacc5fe120a8dd882121e114b11ec4bb05` | 142 |
| T3 | `16da35738d06c685b3346ff08dc37c09c96fbde5fd4f23caa2111924d91a98de` | 151 |

Every arm matched its expected value before launch.

**Runtime.** Node v25.9.0, Playwright 1.56.1, WebKit revision 2215 (browser 26.0), macOS 27.0 build 26A428 on an Apple M5 Pro. This is Playwright WebKit engine emulation of the iphone-15-portrait project, not Simulator or device evidence.

**Host.** The historical runs (2026-10-09) and every fresh run (2026-10-10) happened after the **same boot**, at 1791521482, 2026-10-09 00:51:22 EDT, as verified by the coordinator with `sysctl`. A reboot does not explain the difference. Between the historical HEAD `4a89161` and `883d550`, `version.json` changed only the Football version (1.34.3 → 1.34.6).

**Same versions, not the same runtime or recipe.** The fresh arms share package and browser versions, OS build and host model with the historical runs. They differ as follows:
- **Protocol observer.** Fresh runs use a per-worker-process sink. Historical runs used shared stderr plus the ancestor stall reporter.
- **Fingerprints.** Only partial runtime fingerprints exist, so byte equivalence of the whole runtime is not established.
- **Host load.** The 1-minute load average at start differed (see §5).

## 3. Evidence

Raw evidence stays **local and git-ignored** under `tests/artifacts.nosync/issue-161/`. It is not published or attached to GitHub; the hashes below identify it. Every run, check, extraction and self-check directory is new and sealed by `MANIFEST.sha256`. The coordinator re-hashed the manifests with zero mismatches.

**Retained historical runs (2026-10-09).** Four runs: `20261009T070207Z-serial-2d7c2a`, `20261009T070457Z-workers2-0f4854`, `20261009T072821Z-diff-single-631458` and `20261009T072946Z-diff-relaunch-2bc089`. Their manifests cover 990 files with 0 mismatches. The read-only extraction is in `continuation/20261010T175607Z-extract-fa78a7/extract.json`.

**Collector sensitivity (no browser).** Each case is a positive control on the harness, not WebKit evidence.

| Self-check | Cases | Result | Where |
|---|---|---|---|
| Batch 1 | 18 | PASS, twice | standalone, and `20261010T180757Z-selfcheck-3bddc3` |
| v4 | 22 | PASS | `20261010T183714Z-selfcheck-ba6054`, sealed, 8 entries re-hashed |

Two self-check failures are retained as history:
- an earlier serialization failure, left unsealed: `20261010T175619Z-selfcheck-ce30b6`;
- a sandbox-only failure where `ps` was unavailable.

**Batch 1 (six arms, 2026-10-10).** All six ran strictly serially. Every lane completed and every evidence check passed. 90 manifest entries were re-hashed with 0 mismatches.

| Arm | Workload | Trace | Run | Check |
|---|---|---|---|---|
| N1 | 150 × (new context → new page → goto `/version.json` → close), 1 lane-owned browser | on | `20261010T180759Z-N1-nav-trace-on-f3750d` | `…180905Z-check-7f9333` |
| N2 | same | off | `20261010T180905Z-N2-nav-trace-off-a9514b` | `…181008Z-check-ee5995` |
| N3 | same | off | `20261010T181008Z-N3-nav-trace-off-7d82f5` | `…181111Z-check-8271b1` |
| N4 | same | on | `20261010T181111Z-N4-nav-trace-on-e48183` | `…181216Z-check-135da4` |
| T1 | 150 × (manual context → page on about:blank → screenshot → evaluate → close), 1 browser | on | `20261010T181216Z-T1-blank-serial-575bad` | `…181320Z-check-9bfd17` |
| T2 | same, 2 native workers with overlapping browsers, 150 contexts each | on | `20261010T181321Z-T2-blank-workers2-37e53f` | `…181427Z-check-fa1508` |

**Batch 2 (T3, 2026-10-10).**
- **Run:** `20261010T183935Z-T3-stock-skip-workers2-baa2ad`.
- **Check:** `20261010T184045Z-check-976c7b`.
- **Integrity:** 312 + 3 entries re-hashed, 0 mismatches.
- **Workload:** 300 tests through the unchanged `tests/curriculum-fixture.mjs` stock fixtures. Each test used:
  - the stock worker browser;
  - a stock context with the existing session mute and curriculum init scripts;
  - a stock page left on `about:blank`;
  - `test.skip()` in the test body;
  - the stock artifact teardown and `context.close("Test ended.")`.
- **Topology:** 2 native workers, each owning one browser for 150 contexts. The browsers overlapped for 22.6 s.

## 4. Results

| | N1–N4 | T1–T2 | T3 |
|---|---|---|---|
| Browsers × contexts | 4 × 150 | 3 × 150 | 2 × 150 |
| Stall | none | none | none |
| `deleteContext` round trip, max | 38 ms | 21 ms | 18 ms |
| `navigate` reply, max | 63 ms | — | — |
| Commands pending at end | 0 | 0 | 0 |
| Evidence verdict | PASS | PASS | PASS, all 12 checks |

In every fresh browser, context ids were sequential per browser. Ownership showed zero protocol lines on the shared stderr and no unexplained orphan replies. Each T3 browser logged exactly one source-defined `Playwright.close` (id −9999) control reply.

On trace conformance:
- The trace-ON archives held 151 context records (the runner plus 150 contexts), with snapshot events but only 2 screencast frames.
- The trace-OFF arms produced no archives.
- So the screencast part of the tracing bundle was barely exercised.

## 5. What the evidence supports

### Navigation stall N (O1: UNVERIFIED overall, partially bounded)

**Retained boundary (unchanged).** Both historical N captures (serial and diff-single) stalled at the **75th context of their browser**, frame id 2³²+75. Each sat in a pre-request protocol gap:
- after `Page.willCheckNavigationPolicy` and an opened TCP connection;
- with no `didCheckNavigationPolicy`, navigate reply, `requestWillBeSent` or HTTP request bytes;
- for 30 s.

Re-extraction adds two facts:
- context and frame ids are per-browser counters (verified in all 20 retained single-browser segments);
- `deleteContext` and `navigate` round trips stayed **flat** through ordinals 1–75 (median 1 ms and 3 ms; maximum ≤ 5 ms per 10-ordinal bucket), then fell off a cliff.

This is descriptive only. It does not exclude non-protocol resources.

**Count alone is not sufficient under the recorded conditions.** Four fresh browsers passed context 75 and reached 150 with the minimal recipe. The package and browser versions, OS build and host model matched the historical runs. So "the 75th context in one browser" does not by itself produce N here. A condition present on 2026-10-09 and absent in batch 1 remains unidentified.

The recorded differences are listed below. None is shown to be a cause.
- **Host load at start.** The 1-minute load average was 3.9–5.5 historically and 8.3–46.7 for batch 1. The batch-1 navigation arms specifically started at 28–47.
- **Protocol observer.** As described in §2.
- **Partial runtime hash.** As described in §2.

A low-load navigation run was not performed.

**Tracing.** Both trace-ON replicates completed. Under the predeclared rule, the trace-OFF completions therefore say nothing about tracing. No tracing necessity or exclusion is inferred.

**Lifetime association.** The historical relaunch-every-50 control, together with the two ordinal-75 captures, still supports an association with state accumulated within one browser lifetime under the historical conditions. Fifty and 150 contexts are **tested exposures, not safe thresholds**.

### Teardown stall T (O2: UNVERIFIED overall, partially bounded)

**Retained boundary and ownership.**
- **What is exact.** In historical workers2, exactly one of 166 `Playwright.deleteContext` sends (id 25085, context `…4D`) has no exact-form reply. The timed-out test's own Playwright error names browser pid 60127.
- **Counter evidence.** The whole workers2 capture holds 166 `createContext` replies across three browsers.
  - **Initial pair.** Before the third browser launched at 07:06:23.817Z there were 148 replies, all from the initial pair (pids 60126 and 60127). In that interval, ordinals 1–72 were each created twice (once per browser) and ordinals 73–76 once.
  - **Third browser.** After that launch, the third browser (pid 60588) created 18 contexts, repeating ordinals 1–18. Over the whole capture, ordinals 1–18 therefore appear three times, 19–72 twice and 73–76 once.
  - **Timing.** The stalled `deleteContext` (07:06:22.462Z) precedes the third launch, so only the initial pair bears on it.
  - **Ordinal.** Under the verified per-browser counter, the stalled context was the **76th context of the initial-pair browser that created it**, and the other initial browser stopped at 72.
  - **Owner remains inferred.** That this browser was pid 60127 is still inferred, not exact.
  - **Field name.** The extraction field `createdTwice` lists ordinals created at least twice: a legacy name, not an exact count.
- **What is inferred.** That the owner is pid 60127 is inferred from the error-named pid, the counter and a 2 ms time join. It is **not** exact protocol pairing. The shared historical log cannot be made exact, and a fresh run cannot repair it.

**Fresh exact ownership.** One protocol sink per Playwright Test worker process installs the logger at runtime. Every protocol line falls inside exactly one launched-to-exited browser segment. This removed ownership ambiguity for every fresh capture: 9 browsers in total, including two pairs of overlapping native workers.

**Bounded non-reproduction.** No teardown stall occurred in either test:
- **T1/T2:** 450 manual blank contexts.
- **T3:** 300 stock skipped-test contexts. T3 started at a 1-minute load average of 5.52, near the historical range.

So within 150 contexts per browser, under these conditions, neither the manual approximation nor the stock skipped-fixture bundle is sufficient for T.

**What T3 does not exclude.** T3 deliberately excluded the real Football navigation and content that preceded the historical skipped context. It therefore excludes **neither** prior-Football browser state **nor** the historical T event. N and T sitting at adjacent ordinals (75 and 76) does not establish a common mechanism.

## 6. Observation methods and their limits

- **Ownership (`sink.mjs`).** Each Playwright Test worker hosts its browser connection in-process. Its `pw:*` debug output is redirected, inside that one process, to a file only that process writes. A shared `DEBUG_FILE` is not used because every process truncates the same path. Ownership is proven per run:
  - no protocol on the shared stderr;
  - the sink opened first and closed positively;
  - no overlapping launches, duplicate send ids or unexplained orphan replies;
  - at most one `-9999` close-control reply per browser, which source shows bypasses the send logger.
- **Boundaries.** Classification happens at the failed stage's end mark. Later events are reported as late, and unparsed records in the window make absence labels indeterminate.
  - **Unparsed volume.** The T3 sinks each had 5,700 unparsed (truncated) protocol lines. Had T3 failed, absence-based labels might have become indeterminate.
- **T3 timeout observation.** Playwright 1.56.1 skips later fixture teardowns once the shared teardown slot is exhausted. So T3 reads the slot deadline read-only and writes a passive deadline mark. It also requires the public `'close'` event, and resolves unobserved stage ends only from the report: interrupted or unobserved captures are censored or indeterminate.
  - **Approximate tolerance.** The −250/+1000 ms tolerance is a conservative classification window, **not a proven bound**.
  - **No live failure.** No live failure exercised this path. Synthetic self-check cases S18–S21 cover the analyser only.
- **Ceilings.** The 15 min / 2 GiB per-arm ceilings are sampled guards, not exact caps.

## 7. Original outcomes

| # | Outcome | Disposition |
|---|---|---|
| O1 | Explain or narrowly bound navigation | **UNVERIFIED overall; partially bounded.** The observed pre-request gap and per-browser counter remain. Count alone is shown insufficient under recorded conditions. The co-condition and cause are unidentified. |
| O2 | Investigate teardown; remove ambiguous ownership where feasible | **UNVERIFIED overall; partially bounded.** Fresh exact ownership is demonstrated. Historical owner is inferred, not exact. No T reproduction within the bounded manual and stock exposures; the trigger is unidentified. |
| O3 | Predeclared discriminating experiments with meaningful sensitivity | **MET for the harness and predeclared arms,** with 18- and 22-case positive collector controls and predeclared interpretation rules. Discrimination of the cause was **not achieved**, because the historical positive control did not reproduce. |
| O4 | Retain failures and exact source/runtime/provenance | **MET with limitations.** Fresh evidence is sealed and re-hashed, and failed attempts are retained. Runtime fingerprints are partial. The historical #49 bundle is unrecovered. Raw evidence is local only. |
| O5 | Preserve production, assertions, retries, deadlines, six projects, test mute, siblings, #158/#160 | **MET statically.** Diagnostics are additive only. The stock arm imports the unchanged fixture and loads no Football or audio. Registry checks passed 4/4. #158 and #160 are untouched. |
| O6 | Reviewed publication with the App identity, no unrelated release | **PENDING** final exact-head review and publication. No release. |

## 8. Delivery disposition and recommendation

The recommendation is a **bounded intermediate diagnostic delivery. Keep #161 open.**

The author is stopping further runs now, as predeclared:
- the current environment reproduced neither stall in any arm;
- that includes the minimal recipe that stalled at context 75 twice historically;
- repeating unchanged arms would not discriminate anything;
- the only measured co-condition candidate, host load, cannot be reconstructed historically and is not shown causal.

The adopted per-file release runner remains the workaround. It is not a fix, and a single release file could still cross a browser-lifetime bound.

**Revisit #161 when a stall recurs** in the normal release process or in gameplay. Run that occurrence's selection with this harness's per-worker sinks, so that a natural recurrence gets exact ownership and stage boundaries. A recurrence of N on the minimal recipe would restore the positive control that a contrast needs. The likely contrasts at that point would be host-load conditions, or a real-content stock-fixture prefix.

## 9. Reproduce

Run from the repository root with port 8090 free and no WebKit process running. Supply the fingerprint printed by `fingerprint.mjs` for the reviewed bytes.

```bash
node scripts/diag-161/continuation/extract-retained.mjs           # read-only retained extraction
node scripts/diag-161/continuation/selfcheck.mjs                  # collector sensitivity; needs host-visible ps
node scripts/diag-161/continuation/fingerprint.mjs                # declared runtime fingerprint
node scripts/diag-161/continuation/run-batch.mjs --expect-fingerprint <sha256>   # batch 1: self-check + six serial arms
node scripts/diag-161/continuation/run-arm.mjs --manifest arms-batch2.json --arm T3-stock-skip-workers2 --expect-fingerprint <sha256>
node scripts/diag-161/continuation/check-run.mjs <run dir> [--historical-meta <retained meta.json>]
```

See `README.md` for exit codes, stop rules, ownership and sealing. The arm definitions and fixed interpretation rules are in `arms.json` and `arms-batch2.json`.
