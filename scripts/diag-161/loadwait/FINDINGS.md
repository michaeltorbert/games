# Issue #161 load-wait diagnostic: findings

**Result:** a bounded intermediate diagnostic. The collector's capability was verified live. One faithful exposure of the failed file did **not** reproduce the load wait. No cause and no fix are established. **#161 stays open.**

All runs were executed on 2026-10-14 against one frozen diagnostic candidate:
- source artifact `209fdc27…2b0a45`;
- selected-runtime fingerprint `76c343f6…f78b88`, identical before and after every live run.

Evidence directories are under `tests/artifacts.nosync/issue-161/loadwait/` (git-ignored, retained locally). Collector records are sanitized. Stock Playwright reports, logs and screenshots are kept unsanitized and are not certified safe to publish.

## What was run

| Step | Directory | Result |
|---|---|---|
| Pure controls P1–P22 (no browser) | `20261014T203341Z-pure-4b8d59` | PASS |
| Server-observer fault sensitivity (no browser) | `20261014T203710Z-server-fault-765680` | PASS |
| Live control batch C1–C6 | `20261014T203731Z-control-b3c703` | completed; C5 timed out as designed |
| Control check | `20261014T203814Z-check-control-cc46a6` | **PASS** (every validity check and C1–C6) |
| One faithful exposure | `20261014T203841Z-faithful-ffefc8` | completed, all cases passed or declared-skipped |
| Faithful check | `20261014T204013Z-check-faithful-4ee73e` | **VALID** evidence, original inventory VALID |

**Earlier attempt, preserved unchanged.** On the preceding candidate, `20261014T202818Z-control-50eb28` was checked by `20261014T202924Z-check-control-702bef`, which returned **FAIL**:
- every validity check and C1–C4/C6 passed;
- C5's held image stayed `sent`, with no protocol `responseReceived`, at all three cutoffs.

The faithful gate refused at that point. The held-image fixture was then changed (headers flushed with `X-Content-Type-Options: nosniff`, then a 16,425-byte incomplete PNG stream prefix instead of 28 bytes), reviewed, and run once. Acceptance was not relaxed.

## Collector capability verified (synthetic, sensitivity only)
- **Install and gates:** the observer installed in every worker before fixtures. It saw nested WebKit network and lifecycle events and exact per-connection identity. Pending snapshots were taken before close cancelled anything. Privacy, loss, identity, sealing and ownership gates all held.
- **C2–C4:** redirect hops (C2), HTTP 404 versus network failure (C3) and repeated same-URL requests (C4) were each tracked distinctly.
- **C5 (held image):**
  - the test timed out at its own 8 s control deadline;
  - main-frame DOMContentLoaded was observed and load was not;
  - the held request was in protocol state **`headers`** (response observed, body unfinished) at the pre-after-hooks boundary (observer seq 186), close entry (187) and the `deleteContext.send` cutoff (189), in that order;
  - its later outcome was **target loss after a target-destroyed event**, inferred, not a protocol cancellation.

  The server separately recorded `headersSent: true` and `finished: false`; its socket byte counter (16,991) is cumulative for the socket, not a per-request size.
- **C1, C6:** normal close order was observed, including the real Football page via the unchanged stock fixtures and session mute.

**Superseded interpretation.** The earlier author analysis (`control-1-analysis.md`, F3) said a passing changed control would attribute the first failure to the fixture. That claim is withdrawn. The passing control shows capability under the changed fixture only. It does **not** show why the first control lacked `responseReceived`, or which factor mattered: prefix size, PNG structure, header flush, nosniff, or runtime variability. No attribution experiment was run or is planned.

## Faithful exposure (the question this diagnostic was built for)
- **What ran:** the unchanged `tests/football-overlay-accessibility.spec.mjs` with the release WebKit settings:
  - all six projects;
  - inherited default concurrency, resolving to 7 per the report config;
  - fullyParallel, retries 0, trace off;
  - original 30 s deadlines;
  - no flags.
- **Inventory:** the original 42-case union matched exactly: 22 passed and 20 declared skips with the spec's reason. No retries, no missing or extra cases.
- **Topology:** 41 worker processes (indices 0–40) were observed. The failed raw run used indices 0–38. The observed worker count is not concurrency.
- **Outcome:** no non-passing case, and no N-, L- or T-shaped observation. **No natural symptom was captured.**
- **Interpretation:** one bounded non-reproduction. It is not a fix, not a reliability threshold, and gives no information about the cause of the earlier failure.

## Causes and limits
- **Causes:** the causes of the historical navigation gap (N), the 2026-10-14 post-DOM load wait (L) and teardown stalls (T) remain **UNVERIFIED**. No new natural evidence bears on them.
- **Font readiness** (`document.fonts.ready`) is **UNOBSERVED** by design. A finished font request does not prove readiness.
- **Engine, not device:** Playwright WebKit engine emulation only (macOS 27.0.1, 26A434; the failed run's exact OS is unknown). Not Simulator or physical Safari.
- **Fingerprint scope:** selected installed Playwright files plus the WebKit `pw_run.sh` launcher only, not full WebKit binaries.
- **Observer perturbations** (wrappers, synchronous sink writes, one instrumentation listener, a per-test hook, servers and probes run by the runner) are disclosed in each run's `meta.json`. No exact memory or neutrality claim is made.
- **Parse cap:** the nested-payload cap is 16 × 1024² UTF-16 code units (`string.length`), not bytes or RSS.
- **Process visibility** is sampled every 5 s.
- **Inferred joins:** client↔protocol context and server↔browser associations are inferred.

## Original outcome dispositions

| Outcome | Disposition |
|---|---|
| O1 navigation/load wait | **UNVERIFIED** for cause. The capability to capture an L-shaped wait (pending requests with header vs body state, DCL vs load) is verified synthetically. No natural L or N was captured. Font readiness is UNOBSERVED (explicit exception). |
| O2 teardown T | **UNVERIFIED** for cause. Close boundaries (entry, delete send/reply, public close, connection close) and inferred target loss are observed live. Historical T ownership and trigger remain unresolved. |
| O3 bounded diagnostics | **MET as the agreed bounded intermediate delivery:** finite sensitivity controls and one faithful exposure, with no guaranteed reproduction. The original causal goal is **not met**. |
| O4 preservation, sealing, privacy | **MET** for this diagnostic. Unique sealed directories; the failed first control is preserved; before/after identity matched; sanitized collector output. Stock outputs are retained unsanitized and are not for publication. |
| O5 no production change, topology, mute | **MET.** Additive diagnostic files only. No production, game, test, fixture, config, registry or version change. No retries, assertion or deadline weakening. Original topology and stock mute were preserved. |
| O6 review | Execution gates were independently reviewed. These conclusions require a fresh independent final review. No release and no issue closure. |
