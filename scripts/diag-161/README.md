# Issue #161 diagnostics

These are additive tools for investigating the WebKit `page.goto` load stalls and
`browserContext.close` teardown stalls. They change no runtime, server, base
config, spec, fixture, package or registry file. Every run writes to a new
directory, `tests/artifacts.nosync/issue-161/<UTC>-<kind>-<rand>/`, which is
git-ignored and outside iCloud sync. Nothing ever overwrites a run. Each run is
indexed by `MANIFEST.sha256`, which is created exclusively and written last.

| File | Role |
|---|---|
| `lib.mjs` | Shared helpers: clocks, JSONL, run directories, hashing, process snapshots, release selection, source fingerprint. |
| `serve-logged.mjs` | Imports the unchanged `scripts/serve-root.mjs` and observes it passively (see below). |
| `diag.config.mjs` | Spreads `playwright.config.mjs` and sets `browserName` on all six projects and on global `use`. It never uses `--browser`. |
| `stall-reporter.mjs` | Reporter that writes test/step JSONL with actual worker/parallel indices, plus an observe-only 10 s watchdog. |
| `run-arm.mjs` | Bounded arm runner (self-check, smoke, serial, workers2, and the optional trace-off pair). |
| `selfcheck/harness.spec.mjs` | Synthetic observer check. It is not evidence about the stall. |
| `preflight.mjs` | No-browser checks: config parity, mute coverage, port/origin, and server byte/error/crash parity. |
| `check-run.mjs` | Stream-completeness checks plus merged timelines for failed or unfinished cases. Writes to its own directory. |
| `gate.mjs` | Whole-file fresh-CLI partitioned release gate with an exact case-union validator. |

## Order of execution (parent runs; author does not)

```bash
node scripts/diag-161/preflight.mjs                       # exit 0 = all PASS
node scripts/diag-161/run-arm.mjs --arm selfcheck         # ~1 min, 18 synthetic cases (13 pass, 5 skip)
node scripts/diag-161/check-run.mjs <selfcheck run dir>   # exit 0 required before smoke
node scripts/diag-161/run-arm.mjs --arm smoke             # 6 cases, one per project
node scripts/diag-161/check-run.mjs <smoke run dir>       # exit 0 required before arms
node scripts/diag-161/run-arm.mjs --arm serial            # <=15 min
node scripts/diag-161/check-run.mjs <serial run dir>
node scripts/diag-161/run-arm.mjs --arm workers2          # <=15 min
node scripts/diag-161/check-run.mjs <workers2 run dir>
```

`run-arm.mjs` exit codes:
- 0 = COMPLETED-PASS
- 1 = FAILED (a test failure stopped the run via `--max-failures=1`)
- 2 = harness/abort before or around the run (port in use, server identity, harness error)
- 3 = INCOMPLETE (budget, 2 GiB cap, or operator interrupt)

`check-run.mjs` grades every check as PASS, FAIL or INCONCLUSIVE and exits accordingly:
- 0 = all PASS
- 1 = any FAIL (an observer gap or broken binding; resolve it before interpreting evidence)
- 4 = INCONCLUSIVE without FAIL (ambiguous protocol pairing, incomplete collection, parse gaps, or pre-v2 runs lacking newer records). INCONCLUSIVE is never approval.

Observer availability is proven positively: every runner probe (including the marked ready and final probes) must appear in the server log, and protocol SEND/RECV must parse. Target observations are reported as NOTE and never graded: zero browser requests, an unanswered `deleteContext`, slow round trips. An arm can therefore FAIL its tests while its evidence checks PASS.

The optional trace-off pair runs only after the author has analyzed the evidence and the parent has recorded the question:

```bash
node scripts/diag-161/run-arm.mjs --arm serial-trace-off --question "<recorded question>"
node scripts/diag-161/run-arm.mjs --arm workers2-trace-off --question "<recorded question>"
```

The single conditional matched differential pair was authored after the v3 target failures. It runs only after fresh review and a parent-recorded question. The spec is `differential/lifecycle.spec.mjs`, which is synthetic, never a release test, and uses no game code or external network.

```bash
node scripts/diag-161/run-arm.mjs --arm diff-single   --question "<recorded question>"
node scripts/diag-161/run-arm.mjs --arm diff-relaunch --question "<recorded question>"
```

Each project runs 150 identical cycles: `newContext`, `newPage`, `goto('/version.json')`, then `context.close`. In `diff-single` all cycles run in one browser. In `diff-relaunch` the browser is relaunched every 50 cycles.

**Bounds and stopping rules.**
- Every stage is bounded at 30 s and logged as begin/end with ok, timeout or error. That includes `browser.launch`, `browser.close` and cleanup.
- A race does not cancel the losing operation. So after any unsuccessful stage the project stops: no further cycle and no new launch, which means browsers never overlap.
- The first failure is kept. A `try/finally` closes the owned browser within a bound and never replaces that first failure.
- The 10-minute test timeout applies only to this synthetic spec. Release deadlines are unchanged.

**What `check-run` accepts.**
- A passed project must show the full plan: 150 `cycle.ok` records, the planned launch count (1 or 3), a confirmed close of every launched browser, no failed stage, and no browser left open. Anything less is `INVALID-pass` and FAILs.
- A failed project must carry its first failing stage. That counts as valid failure evidence even with zero completed cycles. A failure without a stage record is INCONCLUSIVE.

**Interpretation, declared before running.**
- If `diff-single` fails and `diff-relaunch` passes completely, that supports an association with state accumulated within one browser lifetime under this synthetic workload. It does not isolate the context count, which is confounded with browser age and process resources, and it does not show whether Football content is necessary.
- If both arms pass completely, that is non-reproduction within the observed synthetic exposure only.
- A `diff-relaunch` failure, or any launch, creation or cleanup failure, is classified by its stage and position. It does not by itself disprove a lifetime dependence, which could have a lower threshold or act through another stage.
- The "about 75 contexts" figure remains a two-run correlation, not an established mechanism.

Partitioned gate (coverage evidence, never a stall fix):

```bash
node scripts/diag-161/gate.mjs --engine webkit [--workers 2]
node scripts/diag-161/gate.mjs --engine chromium [--workers 2]
```

## Arm settings

- Selection is read fresh from `package.json` `test:football:release`, so file and case counts are never hardcoded. Smoke runs the existing opponent case "fourth-quarter boundary catches up when behind and protects a lead" on all six projects.
- Every arm runs `--retries=0 --max-failures=1` with the base deadlines and spec predicates, `trace: on` (or `off` for the optional pair), and `screenshot: only-on-failure` as in the base config.
- Outer budget: 15 min per arm (5 for selfcheck/smoke). The run is aborted if `cli-stderr.log` exceeds 2 GiB.
- On abort, the runner sends SIGINT to the CLI's own process group and waits 60 s. It then sends SIGKILL to that group, followed by SIGKILL to any recorded descendant whose pid and command still match. Browsers are detached, so they need this last step. Foreign processes are never signalled.
  - The pid+command guard is practical, not an immutable process identity. A disconnected process that never appeared in a 30 s inventory can escape cleanup, so cleanup is not claimed to be exhaustive.
- Sealing order. Nothing writes after `MANIFEST.sha256`; `check-run` verifies this and requires `finalize` to be the last runner event.
  1. The reporter's `onEnd` drains in-flight onset snapshots, bounded at 40 s and after the last test, so no test deadline is affected. It logs `collector.drain`.
  2. The runner stops its timers, refuses new observer work, and drains in-flight probes and `ps` (40 s).
  3. It stops the server and waits for it to exit.
  4. It waits up to 30 s for leftover members of the CLI's own process group, such as `sample`/`lsof`, then SIGKILLs only that group.
  5. It writes `status.json`, including `collection` (`complete: true|false` plus details). Incomplete collection is recorded, never hidden.
- Aborts.
  - Every trigger (budget, 2 GiB cap, SIGINT/SIGTERM, harness error) goes through one owned, tracked abort task, so step 2 drains it.
  - The abort waits only on the CLI's exit, which is bounded. Sealing starts only after that exit, so there is no wait cycle.
  - The abort re-checks `sealing` after every await. Once sealing begins it writes nothing and sends no signal, and it never signals after the CLI has exited.
  - An abort still running at the drain bound is recorded as `collection.abortTask: unsettled-at-seal`, which makes the collection incomplete.
  - Harness-only race check: `run-arm.mjs --arm selfcheck --synthetic-abort-race <ms>` starts an abort, delayed by `<ms>`, at the moment the CLI exits naturally. The run is labelled `INCOMPLETE-synthetic-abort-race` and exits 3, never PASS.
- Specs run with cwd `<run>/cwd/`. Their relative writes (`release-matrix`, `page113-*`, `marker-boundary`) stay in the run and never touch the repo's `tests/artifacts.nosync`. `ISSUE49_CAPTURE_STAGE`, `DEBUG_FILE`, `PWDEBUG` and `NODE_OPTIONS` are removed from child environments.

## Evidence streams (per arm)

| File | Source | Clock |
|---|---|---|
| `events.jsonl` | reporter: run/test/step begin/end, real `workerIndex`/`parallelIndex`, watchdog onset | ISO + host monotonic ns |
| `enumeration.json` | every selected case (`file::title::project`) | |
| `server.jsonl` | server: socket open/close, request start, response finish/close, uncaught-exception monitor, exit | ISO + host monotonic ns |
| `server-stdout.log` | `serve-root` listening line with `root=` (identity proof) | |
| `runner.jsonl` | runner: health probes every 5 s, ps summaries every 30 s, CLI/server spawn and exit, abort, leftovers | ISO + host monotonic ns |
| `cli-stderr.log` | `DEBUG=pw:api,pw:browser,pw:protocol` from the runner and all workers: browser launch command/pid/exit, `Playwright.createContext` and `Playwright.deleteContext` SEND/RECV | ISO (ms) |
| `pw-output/**/trace.zip` | native trace per test, including manually created contexts | trace wall/monotonic |
| `report.json`, `cli-stdout.log` | JSON and list reporters | |
| `onset/*` | post-onset `ps`, `lsof`, `netstat`, `vm_stat`, `sample` (first 4 onsets) | |
| `proc/ps-periodic.txt` | host-wide `ps` every 30 s | |
| `meta.json`, `summary.json`, `status.json` | command, environment allowlist, versions, WebKit executable, host, exposure, collection completeness; `fingerprint` (see below) | |

`fingerprint` records HEAD plus a byte-sorted manifest of every in-scope path. Each entry carries:
- git state (tracked, tracked-modified, untracked or deleted), plus index mode and oid;
- worktree type, mode, size and sha256, or recorded absence.

Git input is NUL-delimited. `manifestSha256` hashes exactly the serialized manifest stored beside it, so a mode-only or untracked change alters it. Scope is `tests/`, `football/`, `shared/` and `scripts/` (excluding `artifacts*/`), plus the root config, package and lock files and the installed Playwright package/browsers files.

The host monotonic clock is uv_hrtime, which is `mach_absolute_time` on macOS, so it can be compared across processes on this host.

### Server observation and fallback

The server is observed in `dc` mode by default, which uses `node:diagnostics_channel` (`net.server.socket`, `http.server.request.start`). Preflight verifies that these channels actually deliver events on the installed Node. If they don't, set `DIAG161_SERVER_OBSERVE=wrap` for preflight and every arm. Wrap mode adds passive `connection`/`request` listeners via a wrapped `http.createServer`.

Neither mode adds a `clientError`, `unhandledRejection` or `uncaughtException` listener, since each of those would change Node's defaults. Crashes are only observed, through `uncaughtExceptionMonitor`. Preflight proves several things against the unchanged `serve-root`:
- identical status, type and bytes;
- an identical default 400 reply to malformed HTTP;
- an identical default crash on a malformed URI (`GET /%`).

### Perturbations (identical in both arms, recorded in `meta.json`)

- Tracing.
- Protocol debug logging.
- `PW_RUNNER_DEBUG=1`. In Playwright 1.56.1 this has only two effects: worker stderr is inherited instead of forwarded over IPC, so it no longer reaches `result.stderr` or traces.
- The server is runner-owned instead of being a Playwright `webServer`.
- One synchronous log write per server event.
- A health probe every 5 s.
- `ps` every 30 s.
- After onset only: `lsof` and `sample`. `sample` pauses the sampled process for about 2 s, so anything captured after onset is post-onset evidence. `--no-samples` disables `sample`.

## Known blind spots and limits

- **Protocol pairing.**
  - WebKit message ids restart at 1 for every browser connection (`wkConnection.js`: `_lastId = 0`), and debug lines carry no worker or browser id. `check-run` therefore attributes protocol lines to a browser only while exactly one launched browser is live, between `<launched> pid=N` and `[pid=N] <process did exit`. It never matches a response across that boundary.
  - With overlapping live browsers (any two-worker run, or an overlap in a serial run) the owner and pairing are reported AMBIGUOUS/INCONCLUSIVE, never exact.
  - "Exact" also assumes the shared stderr file preserves emission order within a browser's segment.
- **Context close timing.** Tracing stops *before* a context closes (`ArtifactsRecorder.willCloseBrowserContext`), so the trace never contains the close itself. Close start and end come from the `deleteContext` SEND/RECV lines and the reporter's fixture/API steps.
- **No browser-side request hook.** There is no `page.on('request')`, since fixture edits and preloads are not allowed. Browser-side request evidence comes from the trace network log and protocol lines. Server-side evidence is independent.
- **WebKit XPC helpers.** WebContent and Networking helpers are children of launchd. They are counted and sampled only when no foreign WebKit tree exists on the host, and they are never signalled.
- **Device metadata is harness-only.** The self-check records the engine's load-time environment twice.
  - On `/version.json`: there is no viewport meta, so phone `innerWidth` 980 is expected.
  - On the Football document: loaded under the existing session mute, with no input.

  Neither recording is usable-viewport, layout or playability evidence, and neither satisfies the AGENTS.md matrix. The base projects set no Safari `userAgent` (the measured UA is desktop Safari, and `maxTouchPoints` is 0). This is Playwright WebKit engine emulation, not Apple Simulator or physical Safari.
- **Normal config uses Chromium.** The normal `playwright.config.mjs` sets no `browserName`, so it uses Playwright's default, Chromium. Which browser the historical runs used, and their exact commands, validator and `/private/tmp` bundle, are UNRECOVERED.
- **Non-reproduction means bounded exposure only.** If an arm does not fail, it only means "no target failure within N ended cases" (see `status.json`). It is not proof of absence and not a full gate.
