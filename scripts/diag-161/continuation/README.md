# Issue #161 continuation diagnostics

Results and their limits are in [`FINDINGS.md`](FINDINGS.md), a bounded intermediate report: no cause, no fix, and #161 stays open.

These additive tools cover the first continuation batch agreed in planning. Navigation (N) and teardown (T) each get their own synthetic exposure, every browser has exact per-worker protocol ownership, and the collector sensitivity is checked positively. The tools change no production, spec, fixture, base config, release runner, package or registry file.

The historical report `../FINDINGS.md` is unchanged, and the retired tooling stays in commit `a60b7016`. Nothing here restores it. Only the 30 s staged-cycle recipe of `differential/lifecycle.spec.mjs` is reused, in `specs/cycles.spec.mjs`.

Evidence goes to `tests/artifacts.nosync/issue-161/continuation/<UTC>-<kind>-<rand>/`, which is git-ignored:
- Each directory is new. It is sealed last by an exclusively created `MANIFEST.sha256`, and its files are then made read-only.
- Checks, self-checks and extractions write their own directories.
- Retained runs are only read.

| File | Role |
|---|---|
| `arms.json` | The predeclared batch. It covers arm order, factors, ceilings, stop rules, ownership method and fallback, interpretation rules, and items C1–C5. |
| `lib.mjs` | Run directories, sealing, manifest verification, and the deterministic source/runtime fingerprint. |
| `fingerprint.mjs` | Prints the fingerprint that every arm must match (`--expect-fingerprint`). |
| `sink.mjs` | The per-worker-process protocol sink. See Ownership below. |
| `serve-logged.mjs` | Runs the unchanged `scripts/serve-root.mjs` and observes it passively with `diagnostics_channel`. |
| `continuation.config.mjs` | Spreads the base config, sets WebKit on all projects, uses the synthetic `specs/` directory and the arm's `trace`, and removes `webServer`. |
| `specs/cycles.spec.mjs` | The `nav` and `blank` lanes. Each lane owns one browser for 150 cycles, and every stage is bounded at 30 s. |
| `run-arm.mjs` | Runs one bounded, observed arm. It owns the server, uses a process-group CLI, and has a 15 min / 2 GiB ceiling and owned cleanup. |
| `check-run.mjs` | Grades evidence validity and classifies lane outcomes and failure boundaries. |
| `analyze.mjs` | Pure analysers shared by the checker and the self-check. |
| `selfcheck.mjs` | Collector and checker positive sensitivity, plus server parity. It launches no browser. |
| `run-batch.mjs` | Runs the self-check, then the six arms strictly serially, checking each arm. It enforces the 90 min / 12 GiB batch ceiling. |
| `extract-retained.mjs` | Read-only structured extraction from the four retained runs. |

## Coordinator commands (the author runs none of these)

Run them from the repository root. Run arms only after a fresh Sol review approves the exact candidate bytes and fingerprint, and only when nothing listens on 8090 and no WebKit process is running.

```bash
node scripts/diag-161/continuation/extract-retained.mjs          # no browser; can run before review
node scripts/diag-161/continuation/fingerprint.mjs               # record "sha256" for review
node scripts/diag-161/continuation/selfcheck.mjs                 # no browser; must print verdict PASS
node scripts/diag-161/continuation/run-batch.mjs --expect-fingerprint <sha256>
```

`run-batch` is the intended path. It runs `selfcheck`, then N1, N2, N3, N4, T1 and T2, one at a time. After each arm it runs `check-run` with the historical diff-single `meta.json` for the runtime comparison.

The same steps can also be run by hand, strictly one at a time:

```bash
node scripts/diag-161/continuation/run-arm.mjs --arm N1-nav-trace-on --expect-fingerprint <sha256>
node scripts/diag-161/continuation/check-run.mjs <run dir> --historical-meta tests/artifacts.nosync/issue-161/20261009T072821Z-diff-single-631458/meta.json
```

### Exit codes

**`run-arm`**

| Code | Meaning |
|---|---|
| 0 | COMPLETED-PASS: every lane ran 150 cycles and confirmed its browser close. |
| 1 | FAILED: a lane failure was captured. This is evidence, not a harness fault. |
| 2 | STOPPED or HARNESS-ERROR: fingerprint drift, environment, port, a foreign WebKit process, an unproven observer, or a CLI error. |
| 3 | INCOMPLETE: budget, 2 GiB cap or interrupt. |

**`check-run`**

| Code | Meaning |
|---|---|
| 0 | Evidence PASS. |
| 1 | FAIL: broken observation, ownership or stage accounting. |
| 4 | INCONCLUSIVE. |

Evidence PASS is independent of the lane outcome.

### When `run-batch` stops

`run-batch` continues only after `run-arm` exits 0 or 1 and `check-run` exits 0. It stops in these cases:
- the self-check is not PASS;
- any other exit code from `run-arm` or `check-run`;
- the next arm's full ceiling would exceed the batch ceiling.

## Ownership (C3)

Each Playwright Test worker hosts its own in-process browser server (`playwright-core/index.js` → `lib/inprocess`). `wkConnection` `rawSend`/`dispatch` log through `helper.debugProtocolLogger` → `debugLogger` → the bundled `debug`, which looks up its output function on every call.

`sink.mjs` replaces `debug.log` inside the worker that is running a lane. That process's `pw:api`/`pw:browser`/`pw:protocol` lines, and only that process's, then go to `sinks/sink-<pid>.log`, interleaved with the lane's stage marks in one ordered, synchronous stream.

`DEBUG_FILE` is not used:
- It is read once when each process initializes.
- Every worker inherits the same path.
- In 1.56.1 each process opens it with `createWriteStream` and truncates it.

No installed file is modified. The native two-worker topology is kept: two lanes, `--workers=2`, and `fullyParallel` from the base config.

`check-run` treats ownership as proven only if all of these hold:
- the shared CLI stderr has no protocol or launch lines;
- each sink opens first and closes positively;
- every protocol line lies inside exactly one launched-to-exited browser segment;
- there are no duplicate send ids, no orphan replies and no overlapping launches.

If T2's ownership check fails, T2 is not interpretable and the batch stops. No improvised topology runs. Timing joins and worker-tagged logs are never accepted as exact ownership.

## Stage observer and first failure

Every lane stage is marked begin/end in its sink and bounded at 30 s. The stages are `browser.launch`, `newContext`, `newPage`, `goto` or `screenshot`/`evaluate`, `context.close`, and `browser.close`.

After any unsuccessful stage the lane stops, and no replacement browser is launched. The first failure is kept. Bounded owned cleanup (`browser.cleanup`) is recorded separately, and `check-run` fails a summary whose recorded failure differs from the first failed stage mark. A lane stopped by `--max-failures=1` after the other lane failed is reported as CENSORED, with the cycles it completed.

## Audio

Neither workload loads Football or any page with audio:
- the `nav` lane accepts only `/version.json`;
- the `blank` lane must stay on `about:blank`, and `check-run` fails it if it makes any non-probe request.

The Football test mute therefore does not apply. Any later Football workload must apply and verify `tests/football-test-mute.mjs` before input. Native sound APIs and saved preferences are untouched.

## Perturbations

These are recorded in `meta.json` and are the same in every arm except for the trace factor:
- protocol debug logging (as in the historical arms, now written to per-process files);
- `PW_RUNNER_DEBUG=1`;
- a runner-owned server with one synchronous log write per event;
- a health probe every 5 s;
- a WebKit `ps` census every 30 s.

No `lsof` or `sample` runs.

## Batch 2: one stock-fixture teardown arm (T3)

Batch 2 is predeclared in `arms-batch2.json`. It reruns nothing from batch 1, and `arms.json` is unchanged.

`specs-stock/stock-skip.spec.mjs` uses the unchanged `tests/curriculum-fixture.mjs` stock fixtures:
- the stock worker browser;
- a stock context with the existing mute and curriculum init scripts;
- a stock page left on `about:blank`;
- `test.skip()` thrown in the test body;
- stock teardown.

There are two `describe.serial` groups of 150 tests, one per native worker. The spec observes only through passthrough fixture overrides. `run-arm` takes `--manifest`, enforces the arm's `maxLoadAvg1` gate and records load, uptime and boot time.

**Timeout observation (Sol T3-R1).** Playwright 1.56.1 skips later fixture teardowns once the shared After Hooks slot is exhausted, so a timed-out stock close cannot be marked from inside a fixture. Instead:
- At each stage begin, the spec reads the remaining slot time without modifying anything, and a passive, unref'd timer writes `stage.deadline` when that time runs out.
- A close counts only when the public `'close'` event fires.
- A stage whose end is never observed in-test becomes UNRESOLVED. `check-run` resolves it from the report:
  - `timedOut` → a timeout cut off at the deadline mark;
  - events within the −250/+1000 ms tolerance → `indeterminate-near-cutoff`;
  - no deadline mark → indeterminate;
  - interrupted or any other status → CENSORED.

This cutoff is bounded, not exact. Self-check cases S18–S21 cover the analyser and resolution logic, using synthetic marks in the spec's order.

```bash
node scripts/diag-161/continuation/run-arm.mjs --manifest arms-batch2.json --arm T3-stock-skip-workers2 --expect-fingerprint <sha256>
node scripts/diag-161/continuation/check-run.mjs <run dir> --historical-meta tests/artifacts.nosync/issue-161/20261009T070457Z-workers2-0f4854/meta.json
```

## Correction v2 (Sol harness review v1, R1–R5)

- **Close control reply.** The WebKit close sends `Playwright.close` with id `-9999` directly through the transport, so the send never appears in the log (`webkit.js:64`). Its reply is logged and then ignored (`wkConnection.js:56-58`). The analyser records at most one such reply per browser as a disposed control reply. Any other reply without a logged send, or a second `-9999`, still fails ownership.
- **Boundary timing.** Failure boundaries are classified at the failed stage's `stage.end`. The failed operation stays pending while `browser.cleanup` runs, so later replies or events are reported as `lateEvents` and never change the label.
- **Unparsed records.** Unparsed protocol records inside the failed window that could belong to the context turn an absence-based label into `indeterminate-unparsed-records`, keeping the original as the provisional label.
- **Sealing.** Evidence is sealed only after every writer has been observed to exit: the CLI process group (drained, SIGKILLed, then re-observed), the server, and any owned leftover browser. Otherwise the run is left with `UNSEALED-INCOMPLETE.txt` and no `MANIFEST.sha256`, its status is `INCOMPLETE-unsealed-writers`, and `run-arm` exits 3. The self-check applies the same rule to its parity servers. It reports PASS only when every case passes and its own sealed directory verifies.
- **Serialization.** Evidence JSON uses a deliberate serializer that writes BigInt values as decimal strings and omits internal analyser state.

## Limits
- **Fingerprint scope.** The fingerprint is a declared runtime record, not a full installation byte hash. For WebKit it hashes only the `pw_run.sh` launcher, not the framework binaries. It covers a selected list of installed Playwright files, not every file inspected.
- **Ceilings are sampled.** Size is sampled every 5 s and time is a timer, so these are not exact caps. Batch byte accounting counts arm run directories only.

- **Single project.** Only `iphone-15-portrait` runs, so nothing here generalizes to the other five projects.
- **Engine emulation.** This is Playwright WebKit engine emulation, not Simulator or device evidence.
- **Tested exposure only.** 150 contexts per browser is a tested exposure, and so is diff-relaunch's 50. Neither is a safe threshold.
- **Non-reproduction.** If an arm does not reproduce a stall, that is bounded exposure, not a fix.
- **Historical ownership.** No fresh pass can repair the historical workers2 ownership.
- **Process cleanup.** The owned-process guard checks the pid recorded in a sink, the WebKit command and the start time. It is practical, not an immutable process identity. WebKit XPC helpers are counted but never signalled.
