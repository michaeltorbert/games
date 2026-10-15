# Issue #161 load-wait collector

Results and their limits are in [`FINDINGS.md`](FINDINGS.md). This is a bounded intermediate diagnostic: a passive collector, proof of its sensitivity, and one faithful exposure. It does not establish a cause or a fix, and #161 stays open.

**Status (final for this diagnostic):** the sequence has run once on candidate 4. Pure controls, server-fault and the corrected control all passed. The single faithful exposure produced VALID evidence with every case passing or declared-skipped, and no natural symptom was captured. An earlier control attempt on candidate 3 failed C5 and is preserved unchanged. No further arm is planned; see FINDINGS.

It answers one question for a fresh post-DOM load wait (L): which requests had finished, which had only headers, and which were still pending when the test stopped waiting and before teardown cancelled them. Navigation (N) and teardown (T) evidence stay separate. Everything is additive under `scripts/diag-161/loadwait/`; no production, spec, fixture, base or release config, package, registry or older diagnostic file is changed.

Evidence goes to `tests/artifacts.nosync/issue-161/loadwait/<UTC>-<kind>-<rand>/` (git-ignored). Each run gets a new directory, sealed last with `MANIFEST.sha256` only after every writer is positively observed to have exited; otherwise it gets `UNSEALED-INCOMPLETE.txt` and no manifest. Older runs are never touched.

## Files

| File | Role |
|---|---|
| `loadwait.config.mjs` | Unchanged release config (WebKit, Safari UA) minus `webServer`; installs the observer in each worker. |
| `observer.mjs` | Per-worker passive observer (hooks H1–H5); one synchronous JSONL sink per worker process. |
| `project.mjs` | Pure allowlist projection, URL sanitizing, error classing, bounded nested-payload parsing with oversized payloads counted as loss. |
| `tracker.mjs` | Pure request/hop/lifecycle/context state and bounded pending snapshots. |
| `serve-observed.mjs` | Runs unchanged `scripts/serve-root.mjs` (or the control server), observed through guarded `diagnostics_channel` callbacks. No headers. |
| `control-server.mjs`, `controls/*.spec.mjs` | Synthetic live sensitivity cases C1–C6. |
| `procs.mjs` | Checked process observation, owned-group drain and the final writer/completeness decision. |
| `inventory.mjs` | The exact original exposure (cases, declared skips, settings) and its comparator. |
| `effective-config.mjs` | Prints resolved config settings before the CLI starts. |
| `analyze.mjs` | Pure grading: validity, server completeness, identity, gates, control expectations, faithful shapes. |
| `pure-controls.mjs` | Pure positive and negative controls P1–P22. |
| `run.mjs` | Modes: `fingerprint`, `pure`, `server-fault`, `control`, `check`, `faithful`, `batch`. |
| `lib.mjs` | Evidence root, ceilings, env metadata, candidate fingerprint; reuses only the continuation sealing/manifest/fingerprint exports (not its process helpers). |

## Installation (Playwright 1.56.1 source basis)

`workerMain.js:60-61` sets `TEST_WORKER_INDEX`; `_loadIfNeeded` (`workerMain.js:165-175`) calls `deserializeConfig` → `loadConfig` → `loadUserConfig` → `requireOrImport`, which imports this `.mjs` config in every worker (`configLoader.js:101-135`, `transform.js:209-226`), before `loadTestFile` and fixture pools (`workerMain.js:181-188`). The CLI main process has no `TEST_WORKER_INDEX`, and `run.mjs` strips any inherited value.

| Hook | Point | Records |
|---|---|---|
| H1 | `WKConnection.prototype.rawSend`, `_dispatchMessage`, `_onClose`, wrapped before any browser (`wkConnection.js:35-73`; the constructor binds `_dispatchMessage`/`_onClose`). | Structured message projected before the original runs; nested Target payloads decoded in memory; connection identity `p<pid>c<n>` (WeakMap). |
| H2 | Client `BrowserContext.prototype.close` (`browserContext.js:422-449`). | Synchronous entry snapshot before `request.dispose`, `runBeforeCloseBrowserContext` and the channel close; original promise returned. |
| H3 | Client `BrowserContext.prototype._onClose` (`browserContext.js:81, 410-418`). | Public close, before it is emitted. |
| H4 | One listener on `require('playwright-core')._instrumentation` (`index.js:41, 66-68, 294-295`; `clientInstrumentation.js`). | Allowlisted API begin/end and error name only. |
| H5 | Once per test, a synchronous callback unshifted onto `TestInfo._onDidFinishTestFunctions` (`testInfo.js:53`; `index.js:383`), run before afterEach and fixture teardown (`workerMain.js:321-324`); current TestInfo from public `test.info()`. | Pre-after-hooks snapshot; post-detection and approximate, never an exact timeout instant. |

Wrappers keep the original receiver, arguments, return value, promise and thrown error. Observation failures are counted gaps. `document.fonts` readiness is **UNOBSERVED by design**; a finished font request does not prove readiness.

## Records, boundaries and completeness

- **Requests:** (connection, pageProxyId, targetId, requestId, hop); a redirect reuses the requestId and increments the hop (`wkPage.js:959-991`). States `headers` (not body end), `finished`/`failed` (with `canceled` and an error class), `memory-cache`, and `target-gone` (inferred from a target/page-proxy destroy event). Process-swap links are inferred only.
- **Context identity:** each tracked command's projected params travel with its command id, so a `deleteContext` reply is matched to its own `browserContextId` exactly by (connection, command id). The client-context ↔ protocol-context join remains inferred from sequence.
- **Snapshots** of all outstanding requests at `test.functions.finished` (H5), `context.close.entry` (H2), `deleteContext.send` (the primary pre-cancellation cutoff, before the original send), `deleteContext.reply`, `context.public.close`, `connection.close` and `observer.exit`. Analysis replays each sink to report the later outcome of every snapshotted request; later cancellations never rewrite an earlier set.
- **Large nested payloads:** payloads with `string.length` up to 16 × 1024² UTF-16 code units are parsed. This bounds the parse input length only; it is not an exact byte size and not a memory/RSS bound. Larger payloads are never parsed or classified (a substring cannot prove a top-level method or id) and every one counts as possibly relevant **collection loss** (`innerOversizedSkipped`).
- **Completeness (INCOMPLETE, never VALID/PASS):** any oversized (unparsed) nested payload, undecodable or non-string nested payloads, malformed request/target identities, any tracker anomaly (response or terminal without request, redirect without prior hop, reused id without redirect, unmatched delete reply), truncated snapshots, sink write failures or cap drops, sink seq gaps, a missing `observer.exit`, incomplete server observation, census unavailability, undrained runner observers, unproven writer exit, or unresolved new WebKit processes.
- **Server observation:** every record carries consecutive `seq`; a failed write leaves a gap. Complete only with `observer.ready` first, no seq gap, the runner's ready **and** final probes recorded, no unparsed line and no uncaught exception. Server ↔ browser joins are **inferred** by sanitized URL, even with one candidate.
- **Identity:** the candidate fingerprint is computed before and again after writers exit; drift is INVALID and blocks every gate.

## Privacy

Records are built field by field from allowlists: no request/response headers, cookies, bodies, post data, initiators, certificates, remote addresses, user agent, error text (class + length only), protocol params, API params, test error messages or stacks. Local URL paths are kept only if they match `^/[A-Za-z0-9._~-/]*$` (else a hash); query values never (safe key names + hash); userinfo/fragment as presence; external URLs as scheme, host and a path hash. Inherited environment is recorded as **set/unset and the runner's action only** — never a value, including for refused variables. Processes are recorded as executable basename plus argument count. Stock Playwright outputs (`report.json`, CLI logs, `pw-output/` failure screenshots, server stdout) are retained unsanitized, as the release runner retains them; they are excluded from the collector privacy scan and are not certified safe for publication.

## Coordinator commands (the author runs none)

Run from the repository root, strictly in order. Syntax, fingerprint and pure checks come first. Every live or server step (server-fault, control, faithful) runs only after an independent fresh review approves the exact candidate fingerprint. Nothing may listen on 8090 (and 8094 for controls, 8095 for server-fault), and no WebKit process may be running. The existing preview on 8091 is never touched.

```bash
for f in scripts/diag-161/loadwait/*.mjs scripts/diag-161/loadwait/controls/*.mjs; do node --check "$f" || echo "SYNTAX FAIL $f"; done
node scripts/diag-161/loadwait/run.mjs --mode fingerprint      # writes nothing; record "sha256"
node scripts/diag-161/loadwait/run.mjs --mode pure             # no browser; must print verdict PASS
# every step below only after the fresh review of the exact fingerprint:
node scripts/diag-161/loadwait/run.mjs --mode server-fault     # no browser; servers on 8095; must print verdict PASS
node scripts/diag-161/loadwait/run.mjs --mode control  --expect-fingerprint <sha> --pure <pure dir> --server-fault <server-fault dir>
node scripts/diag-161/loadwait/run.mjs --mode check    --run <control run dir>          # must be PASS
node scripts/diag-161/loadwait/run.mjs --mode faithful --expect-fingerprint <sha> --control-check <control check dir>
node scripts/diag-161/loadwait/run.mjs --mode check    --run <faithful run dir>
```

`--mode batch --expect-fingerprint <sha>` runs pure → server-fault → control → check → faithful → check with the same gates; it exits 0 only if the single faithful check is VALID, otherwise the first failing step's nonzero code. Batch completion is not valid evidence by itself.

### Gates (fail closed)

Control refuses unless `--pure` and `--server-fault` are sealed, verifying directories of that kind with PASS and pre- **and** post-run fingerprints equal to the expected one. Faithful refuses unless `--control-check` is a sealed, verifying control check with PASS and run pre/post fingerprints equal to the expected one. The faithful run additionally refuses if the spec bytes differ from the inventory or the effective config differs from the original exposure.

### Grading

**C5's held image** (`/ctl/hold.png`) first sends its headers (flushed, `X-Content-Type-Options: nosniff`). It then sends a 16,425-byte stream and holds the body open:
- an 8-byte PNG signature;
- a 25-byte IHDR chunk;
- an 8-byte tEXt chunk header;
- 16 KiB of tEXt payload.

This is an incomplete PNG stream prefix, not a complete or decodable PNG. Content-Length (65,605) is larger than what is sent, so the body never ends. The 16 KiB size is a fixture choice; it is not a measured browser sniffing threshold.

The candidate-3 fixture (headers plus a 28-byte prefix) produced no `responseReceived` for the image. The candidate-4 fixture did. Neither result shows *why*, or which change mattered (prefix size, structure, header flush, nosniff, or runtime variability).

The C5 detail also reports `heldServerSide`, which is diagnostic only and joined to the browser record by path (inferred). Its `socketBytesWritten` is cumulative for the socket and may include other responses; it is not a per-request byte count.

A control check is PASS only when every validity check holds and C1–C6 hold. C5 requires, for the held body: `timedOut`; pre-after-hooks → close entry → `deleteContext.send` in that order, each listing the held request with headers only; DCL without load; and a **definite** later outcome after the send cutoff (a protocol terminal, or inferred target loss from a destroy event). `no-terminal-observed` fails.

The faithful check grades evidence only (VALID/INVALID/INCOMPLETE) plus per-case observed shapes, and binds the executed report to `inventory.mjs`: all 42 cases (7 titles × 6 projects) exactly once, the 20 original declared skips with the spec's reason, no retries, report config `fullyParallel` true / `globalTimeout` 0 / `maxFailures` 0 / workers 7 (inherited default resolution on the original host), each project retries 0 / repeatEach 1 / timeout 30000, and effective config with trace off, no config workers or timeout, WebKit, and `webServer` as the only difference from the release config. Missing or interrupted cases are INCOMPLETE; extra, duplicate, retried, newly skipped, changed-reason, declared-skip-not-skipped, settings or spec drift are INVALID. Outcomes (passed/failed/timedOut) are not predeclared.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | pure/server-fault PASS; live run complete with writers exited; check PASS (control) or VALID (faithful); batch with VALID faithful check |
| 1 | FAIL / INVALID |
| 2 | STOPPED, refused (fingerprint, environment, port, census unavailable, foreign WebKit, spec, effective config, observer, gate) or harness error |
| 3 | live run INCOMPLETE (budget, size, interrupt, collection gap, unproven writer exit) |
| 4 | check INCOMPLETE |

### Ceilings (sampled, not exact)

Control 5 min (60 s cleanup reserve) / 64 MiB; faithful 10 min including 150 s reserve / 256 MiB; batch 20 min / 512 MiB. Observer sinks capped at 8 MiB (control) and 24 MiB (faithful); dropped records make the run INCOMPLETE.

### Process ownership

`ps` observations count only if `ps` exits 0 with no error or signal and lists the runner itself; otherwise the observation is unavailable and can never prove absence (preflight refuses; exit proof stays unknown and the run unsealed). Owned browsers are WebKit processes whose parent is in the CLI process group, plus their process groups, seen by the 5 s census. Cleanup signals only those groups, and only when a positive observation shows every live member is WebKit. Any other WebKit process that appears is never signalled; the runner waits up to 15 s for it to exit, and if it remains the run is INCOMPLETE and unsealed.

## Perturbations (recorded in each run's `meta.json`)

H1–H5 wrappers and synchronous sink writes; one extra instrumentation listener (one awaited no-op per `run*` call); the H5 entry; a second in-memory parse of nested payloads up to 16 × 1024² UTF-16 code units; runner-owned servers with guarded `diagnostics_channel` logging; probes, census and size sampling every 5 s; a pre-CLI node process resolving the effective config; `webServer` removed in favour of the runner-owned unchanged serve-root.

## Limits

- Fingerprint: the continuation base fingerprint plus extra installed files in `lib.mjs`; WebKit hashed by its `pw_run.sh` launcher only. Current runtime macOS 27.0.1 (26A434); historical runs differ; the failed L run's exact OS is unknown.
- Playwright WebKit engine emulation, not Simulator or device evidence.
- Browser process exit is not observed in the worker (connection close and runner census only). Font readiness UNOBSERVED.
- Client ↔ protocol context and server ↔ browser joins are inferred.
- Workers 7 is the original host's default resolution; a different resolution on the run host is reported as INVALID for faithfulness, not adjusted.
- **Oversized payloads:** any nested payload longer than 16 × 1024² UTF-16 code units, relevant or not, makes the run INCOMPLETE. No oversized payload was recorded in the candidate-4 control or faithful runs; both passed the protocol-loss check. The observer makes no memory-bound or neutrality claim.
- **Process visibility:** process observation is sampled every 5 s. Short-lived processes between samples are not seen.
- **One exposure:** one faithful exposure without reproduction is not a fix, not a reliability threshold, and does not resolve N, L or T.
