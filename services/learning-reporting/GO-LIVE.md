# Going live: private learning reports (#199/#200)

This runbook covers the remaining steps from the deployed, disabled service to a private
report that shows a household's real Football and Number facts practice from the
intended devices. Writing it, reviewing it or passing its tool test is preparation, not
go-live. #199 and #200 stay open until phase 9 (intended-device receipt) has happened
and every original outcome has a recorded disposition.

Placeholders: `<service-origin>` is the already deployed and approved Worker host (no
new hostname). `<games-origin>` is the public Pages origin that serves the games.
`<private-config>` is the account-local Wrangler configuration, and `<evidence-dir>` is a
private directory outside the repository (or under the ignored `output/`).

What stays private, and what is public:
- **Never** in the repository, issue text or review packets: credentials, one-time codes,
  device tokens, Access JWTs or cookies, the owner's identity, account and database IDs,
  the Access team and audience, and the private operational configuration itself.
- **Public by design:** `<service-origin>`. It is the approved deployed host, and phase 8
  commits it to `shared/learning-reporting/config.js` so the games can reach the device
  endpoints, which Access and the Worker protect. No other hostname is chosen.
- **Sanitized operational metadata** (source commits, bundle and config hashes, Worker
  version IDs, UTC windows, counts) may appear in evidence summaries. Version IDs are
  deployment metadata, not credentials.

## 1. Where things stand (2026-10-22)

| Item | Evidence | Status |
|---|---|---|
| Service | Operator reports a dedicated Worker and D1 deployed from `1e921b1` with uploads off and `crons: []`. The dashboard loaded after the built-source fix. | Operator-reported. Served `app.js` not hashed. |
| Access policy | Operator dashboard readback, 02:36 UTC: the root app on the whole host allows exactly one owner email (no exclude or require rules); two Bypass apps on exactly `/v1/enroll` and `/v1/sync`; no other apps, wildcards or overlap. Edge bypass also matches descendants and case variants; the Worker refuses those with 401. | Current operator readback of the policy contents. Not a coordinator observation. No re-read is needed unless drift is suspected. |
| Owner session | The dashboard loaded through an existing Access session. | A fresh normal owner login is pending; it is already requested. |
| Plan and usage | Workers Free. Billing endpoint 403; GraphQL budget throttled twice; account dashboard browsing denied to the coordinator's browser tool. | Today's usage is unread. None of those methods is retried or replaced by another route. The owner reads usage in their own dashboard (phase 1). |
| CPU | One hourly row: 20 requests, 0 errors, max/P99 12.918 ms, mixed old and new versions, no route attribution. | Neither a failure nor evidence of headroom. No cause is established. |
| Rate-limit namespaces | `2001`/`2002`; the repository's Kayak Worker uses a different namespace. | No collision among the Workers configured in this repository. Other Workers on the account are not visible here. |
| Client | `serviceUrl` is empty. Nothing is enrolled. Football 1.34.22 and Place 1.9.2 are the candidate versions. | Not released. |
| Local evidence | At `be7fb44`: the actual-client two-device integration, built-Worker runtime suite, dashboard startup and full game gates. | Local only. No hosted, Access, CPU, household or physical-device claim. |

## 2. Decisions recorded here

**D1. The 8 ms pause is replaced.** The old rule was "pause synthetic growth when any
supported CPU quantile reaches 8 ms". An earlier agent plan proposed it as a safety
margin. It is not a provider limit or a user requirement. The original issue asks for a
plan and quota check (O2) and makes no cost promise. Its only trigger so far was a
12.918 ms maximum in a 20-request hour with zero errors across mixed versions. Cloudflare
documents that high quantiles can exceed the 10 ms Free limit without errors, and that
aggregate quantiles are not per-route evidence. So that sample establishes neither a
failure nor capacity. The replacement:

| Observation | Treatment |
|---|---|
| A CPU-limit (1102) or other Cloudflare error page on any request | **Stop** |
| A non-zero error count in an aggregate window the owner reads | **Stop**, and classify before any recovery |
| A report, export or Devices page that fails to load at the corpus | **Stop** |
| An ambiguous or mismatched acknowledgment, a lost queue, unexpected access or a privacy leak | **Stop** |
| Remaining same-day allowance below the next step plus its cleanup | **Stop** (the tool enforces this for seed, protocol and expiry) |
| Aggregate max or P99 at or above 8 ms or 10 ms with zero errors | **Warning**, recorded with its window. Not a stop and not acceptance. |

What may then be claimed: "N of N report, export and Devices loads at the qualified
corpus completed without CPU-limit or other errors on version V, in window W." Route-level
CPU, margin and capacity beyond that corpus stay **unverified**. If per-route CPU is
unavailable on the owner's normal dashboard, that line stays unverified, and phase 8 needs
an explicit, reviewed disposition of what that leaves open. "Unverified" is not a silent
waiver. This change is recorded publicly in the next issue status update.

**D2. The qualified corpus is the retained 3,600-event fixture.** Two synthetic profiles:
hot A with 3,000 events, cold B with 600. Two devices: X carries [A, B] and Y carries [A].
1,800 two-event questions, half Football and half Number facts, spread over the last 29
days. It models 2 profiles × 10 questions a day for 90 days, compressed into one report
range. It is a transparent hypothetical, not measured household use. The 8-profile,
16-device and 50,000-row limits stay bounds, not qualified capacity. There is no 6,000-event
seed, no size ladder and no new local CPU estimate.

**D3. Release can precede intended-device receipt.** Real devices can reach the service only
from the live games origin. One paired #199/#200 client release therefore goes first, after
hosted qualification. Until phase 9 it is labelled exactly **"client released;
intended-device receipt pending"**. Nothing collects before an owner-created code is
entered. This reorders agent-written steps only; no user requirement changes.

**D4. Retention evidence uses guarded aging, not a 1-day setting.** Exactly 20 synthetic
rows are aged with reviewed SQL, and one real scheduled run is observed. `RETENTION_DAYS`
stays 90, so nothing needs reverting and household data is never put at risk by a
forgotten short setting.

**D5. No new hostname or resource.** The deployed Worker host is used as is. There is no
custom domain, new cloud resource, paid plan, usage reset or new permission.

**D6. Out of scope here.** The dashboard has no final state when a request is rejected,
for example a long-open tab after its Access session ends. That is disclosed in the
household notes, not fixed in this work.

## 3. Ground rules for every phase

- Use only the existing Wrangler deployment channel, for functions it already performs:
  deploy, roll back, and the one reviewed `d1 execute` in phase 6. Use the owner's normal
  report login and the public device endpoints. Never pass the owner's cookie or Access
  JWT to a script or another agent.
- Retry nothing that was denied or throttled (billing, GraphQL budget, account dashboard
  browsing), and do not reach it another way.
- Keep Workers observability, invocation logs and `wrangler tail` off.
- **Drift guard.** Run it once at each phase or mutation boundary, not per request,
  probe or page load. That means before each deploy, each tool run, the phase 6 SQL and
  the retention continuation, after each deploy, and after any long wait. Record it in the
  evidence.
  1. Source (immutable, recorded once per reviewed commit): the reviewed commit, its
     clean checkout, and the `sha256sum dist/worker.js` of the build that is deployed.
     Reuse that record later. Rebuild only to deploy a different reviewed commit.
     Re-confirm `git rev-parse HEAD` and a clean status at each boundary; that does not
     need a rebuild.
  2. Config: `sha256sum <private-config>` must equal the hash recorded with the reviewed
     sanitized delta for this phase. When the delta is first reviewed, inspect it: the
     Worker name, the dedicated D1 binding and ID, no `routes` or custom domains,
     `preview_urls: false`, `workers_dev` matching the approved host, observability off,
     `triggers.crons` and `vars`.
  3. Deployed version: the version ID that `wrangler deploy --config <private-config>`
     printed for this phase's deploy. Before a later mutation or after a wait, compare the
     currently deployed version with that record, using the same Wrangler channel's
     read of the Worker's deployments, where that channel already permits it. If it
     does not, record the comparison as not done rather than finding another route. Do not
     redeploy just to obtain a version ID.

  The hosted-check manifest copies these values in. The tool checks its own bytes and the
  event contract against them. It cannot check the deployment: the manifest's
  `workerVersion` and `configSha256` are the operator's recorded binding, not a live
  comparison, and are only as current as this guard.
- The hosted-check manifest (`<evidence-dir>/manifest.json`, never committed):

  ```json
  {
    "schemaVersion": 1,
    "target": "<service-origin>",
    "gameOrigin": "<origin the qualification config allows>",
    "phase": "disabled | qualification | production",
    "expected": { "sourceCommit": "<40 hex>", "workerVersion": "<uuid>", "configSha256": "<64 hex>",
                  "toolSha256": "<sha256 of scripts/hosted-check.mjs>", "contractSha256": "<sha256 of shared/learning-outbox.js>" },
    "budget": { "observedAtUtc": "<ISO, same UTC day, at most 3 h old>", "source": "owner-dashboard", "wholeAccount": true,
                "remaining": { "rowsWritten": 0, "rowsRead": 0, "requests": 0 } }
  }
  ```

  The tool refuses a run if its own bytes or the event contract differ from the reviewed
  hashes, if `--target` differs from `target`, if uploads are attempted outside
  `qualification`, or if the budget reading is missing, stale, from another UTC day, not
  account-wide, or below the mode's minimum. It rechecks the reading's age and UTC day
  immediately before every request, after any pacing or prompt. A reading that has gone
  stale or crossed 00:00 UTC stops the run (`BUDGET_EXPIRED`) before anything is sent. A
  reading is never assumed, and a run is never split across UTC days to fit an allowance.
- Every run: `node scripts/hosted-check.mjs <mode> --manifest <evidence-dir>/manifest.json
  --target <service-origin> --out <evidence-dir>`. Type a one-time code only when the
  tool shows `WAITING:`. It does not echo the code on a terminal, and it refuses input
  typed ahead. The receipt and ID manifest hold IDs, counts, hashes and labels from fixed
  lists only. Any response text outside those lists is recorded as `unrecognized`.

## 4. Finite budget (whole task)

| Phase | Requests | Rows written (estimate) | Notes |
|---|---|---|---|
| 1, 2, 7 probes | 3 × 30 | none | Anonymous refusals; no D1 access |
| 3 browser trial | about 60 | under 1,000 | Two clients, one question each, plus owner pages |
| 4 protocol and expiry | 11 | under 1,000 | At most 40 events |
| 5 seed | 185 | about 18,500 | 3,600 events × (table + 4 indexes) plus status rows |
| 5 measurement | about 15 | reads only | Report × 5, export × 3, Devices × 3, cold report × 1 |
| 6 aging and replay | 3 | about 300 | 20 updates, retention retire and receipts, 2 replays |
| 7 cleanup | a few | about 18,500 | Delete everything (synthetic only) |
| **Ceiling** | **≤ 500** | **≤ 60,000** | Reads ≤ 1,500,000; storage growth ≤ 12 MiB |

These are forecasts from the retained fixture budget, not observed usage. The ceilings
cover the whole task, including the overnight retention wait. The 00:00 UTC reset never
enlarges them and never resets the task's counts.

Before the seed, the owner's same-day account-wide reading must show at least 75,000 rows
written, 2,500,000 rows read and 1,000 requests still available. Protocol needs 2,000 /
50,000 / 100, and expiry 100 / 1,000 / 10. The retention continuation (phase 6) needs a
new reading taken after the wait, of at least 25,000 / 100,000 / 100. It sends only two
requests, but it keeps the reserve for cleaning up the stored corpus. If a reading is not
available, the hosted step does not happen. O2's daily-usage line then stays unmet, with
that exact gap recorded.

Waiting overnight for one scheduled run is part of the task, not a split to fit an
allowance. The seed is never divided across days, and nothing is re-seeded.

## 5. Phases

Each phase lists who acts, what to do, what must be true to continue, and how to undo it.
Record the evidence privately; publish only sanitized summaries.

### Phase 0: review this artifact (now; no owner action)
Fresh independent review of the exact commit containing this file, the README,
`scripts/hosted-check.mjs` and `test-runtime/hosted-check.test.mjs`. The coordinator
runs `npm run types`, `npm run check`, `npm test` and `npm run test:runtime`, or at least
the build plus `node --test test-runtime/hosted-check.test.mjs`. Closure evidence stays
outside this file. **Undo:** discard the commit.

### Phase 0′: release preflight (no owner action; no game bytes yet)
- Fetch `origin`; record `HEAD`, `origin/main`, status and `git worktree list --porcelain`.
- Check whether `main` changed Football or Place after `358fe90`. Keep 1.34.22 and 1.9.2
  unless it did.
- Read `football/AGENTS.md` and the Place instructions for the release gates.
- **E-2, silence while unenrolled with the URL set.** Existing coverage, no new test
  needed:
  - `tests/learning-reporting-domain.spec.mjs` ("default off" test): a configured sync
    module with no enrollment hint makes one hint read, then sets zero timers, sends zero
    requests and opens IndexedDB zero times.
  - `tests/learning-reporting-sync.spec.mjs`: with `config.js` routed to a service URL and
    no enrollment, seeded Football and Number facts play in the real pages make no service
    request.

  What remains is native-browser proof on the actual pages, with the actual configured
  origin: no new `learningReporting` IndexedDB database or `learningReporting:`
  localStorage key, and no started sync timer. That check is phase 3 step 2, run in a fresh
  browser profile before any enrollment in that phase. It is a precondition for phase 3's
  enrollments, not something that can wait for phase 8.

### Phase 1: owner login and target check (owner: normal login)
1. Owner logs in normally at `<service-origin>` in the coordinator's browser. The dashboard
   loads, and the Setup tab shows "Uploads are switched off". That is the current product
   response.
2. One combined ask to the owner: confirm no Access edits since the 02:36 UTC readback,
   and read today's account-wide Workers requests and D1 rows read and written (and
   storage) in their own dashboard. The reading goes into the manifest `budget`.
3. Drift guard, then `probe` with `"phase": "disabled"`.

**Continue when:** all 28 protected and nearby probes are refused, each attributed to the
edge (Access login redirect or refusal page) or the Worker (JSON 401), with no 2xx and no
redirect elsewhere. Both exact device paths answer the Worker's JSON 503 `disabled` with
no CORS headers. **Stop** on anything else. A Worker 503 on a protected path means a
missing Access configuration. **Undo:** nothing to undo; the phase is read-only.

### Phase 2: qualification deploy (reviewed delta)
The only changes from the deployed configuration:
`REPORTING_ENABLED: "true"`; `ALLOWED_ORIGINS: "<games-origin>,http://127.0.0.1:<port>"`
(exactly one loopback origin, for phase 3); `RETENTION_DAYS: "90"` and the display time
zone unchanged; `triggers.crons: []` (still off). Get the sanitized delta reviewed, deploy,
run the drift guard, then `probe` with `"phase": "qualification"`. The exact device paths
now answer 403 `origin` to a request with no Origin.
**Undo:** redeploy the previous configuration (uploads off, `crons: []`) or roll back to the
previous version; record the version ID.

### Phase 3: real clients on the native network path (owner: two codes)
1. Build the served tree from committed bytes only. Run `git archive HEAD football
   place-value-practice shared version.json` into a new temporary directory, then
   replace only `shared/learning-reporting/config.js` with
   `serviceUrl: '<service-origin>'`. Record the hash of every file and the one-file diff.
   Serve it with `python3 -m http.server --bind 127.0.0.1 <port> --directory <tree>`.
2. **E-2 first, before any code is entered.** In a fresh browser profile, open both games
   without enrolling and wait 10 s. Expect no request to `<service-origin>`, no
   `learningReporting` IndexedDB database, no `learningReporting:` localStorage key, and
   `LEARNING_SYNC.diagnostics().started` false. If any of these fails, **stop** before
   enrolling.
3. The owner adds one synthetic profile and creates two codes in the dashboard. In two
   separate browser profiles, connect through `/shared/learning-reporting/`, answer one
   Football and one Number facts question through the real controls, then Send now. Expect
   both queues at 0, the combined report showing both games, and both devices with a last
   sync and 0 dropped / 0 not saved. Then, with a code for two synthetic profiles checked in
   reverse order, the Devices mapping must follow the listed order.
4. **Native CORS refusal.** From a second loopback port, which is not allowlisted, a
   connect attempt must fail in the browser, and the Worker must answer 403 `origin` with
   no CORS headers.

Screenshots must not show codes. **Undo:** delete the synthetic devices and profile in the
dashboard, or leave them for phase 7.

### Phase 4: protocol cases (owner: two codes, two dashboard deletions)
- `protocol`: one device with two synthetic profiles P and Q, listed in that order. It
  checks code reuse (400), a withheld seq 5 (9 accepted), an invalid event (`invalid`, not
  stored), a payload and a seq conflict, a fresh epoch, Q's deletion (its old queued events
  `deleted`, P still `accepted`), an unknown token (401) and the deleted device (403
  `revoked`). Before deleting the device, the owner checks the Devices page: one seq "not
  received" (5), labelled possibly pending; a fresh-log notice; the counters. The device
  deletion confirmation must list the affected profiles.
- `expiry`: one unused code, exchanged once after 11 minutes. Expect 400. This proves
  expiry only if the code was valid when created.
- Stay as local evidence (not induced on the hosted service): the mid-batch rollback,
  timeout after commit, concurrent code race and CSRF on authenticated mutations
  (`test-runtime/workerd.test.mjs`).

**Undo:** dashboard deletion of P, or phase 7.

### Phase 5: the corpus (owner: same-day usage reading, two codes)
1. Fresh budget reading in the manifest, then the drift guard.
2. `seed --await-retention`. Code X is for [A, B] with A listed first; code Y is for [A].
   The run takes about 10 minutes (180 batches, at least 3 s apart), then three replays of
   batch 1. Keep it running for phase 6.
3. Record the UTC window and version. In the owner's browser: report A × 5 (3 at iPad
   width, 2 at phone width), export A × 3, Devices × 3, report B × 1. Save one export and
   run `verify-export --ids <ids file> --export <file> --profile A --out <evidence-dir>`.
   Expect 3,000 matched, 0 missing, 0 unexpected, 0 duplicates and 0 foreign.
4. The owner reads the window's aggregate Workers requests, errors and CPU quantiles on
   their normal dashboard if shown. Record units, window and sampling limits.

**Continue / stop:** the D1 table. A narrower report range may be tried only as recovery
evidence, never as a substitute pass, and no other size is run. **Undo:** stop the run
(Ctrl-C); devices keep nothing; clean up in phase 7.

### Phase 6: retention (reviewed SQL; one scheduled run)
1. Deploy the delta `triggers.crons: ["17 3 * * *"]` only, then the drift guard.
2. Write the aging manifest privately: the 20 event IDs of `batch-1` (device X) from the
   ID manifest, with the device ID, synthetic profile IDs and expected counts. The SQL is
   **one** statement. It sets `received_at` to 91 days ago only when all of these hold
   inside that statement:
   - all 20 IDs exist on that device;
   - every profile in the database is one of the known synthetic profiles;
   - no other row is touched.

   The existing guarded v3 procedure may be reused if its exact bytes meet this. A fresh
   review of the exact SQL and manifest is required before execution. Run it with
   `wrangler d1 execute <database> --remote --config <private-config> --file <reviewed.sql>`
   and confirm exactly 20 changed rows. Any other count is a **stop**, with no second
   attempt.
3. After the next 03:17 UTC run (observed once, not polled), prepare the bounded
   continuation of the same task before answering the waiting seed run:
   - Run the drift guard. The deployed version must be the cron deploy from step 1.
   - The owner takes a new account-wide usage reading on that UTC day; it must meet the
     continuation minimum.
   - Update the same manifest file with that `budget` and the cron deploy's `workerVersion`
     and `configSha256`. Leave target, origins, phase, source, tool and contract unchanged.

   Then answer `done`. The tool sends nothing unless that refreshed evidence is present,
   current, sufficient and records a new deployment (`CONTINUATION_EVIDENCE`). Batch 1 must
   come back `deleted` (not restored), and Y's batch 1 must come back `accepted`. Then run
   `verify-export ... --expect-missing <aged.json>`: the aged IDs are absent and every other
   ID is present. The Devices page shows no gap for seq 1–20.
4. If the refreshed evidence is missing, stale, drifted or insufficient, or the seed run
   was lost, no replay request is sent. Keep the receipt and ID manifest; the receipt
   marks `incomplete: retention-replay-not-run`. Record the hosted replay as not run, with
   the local evidence in its place. Do not re-seed, and do not reuse yesterday's reading.

**Undo:** `triggers.crons: []`. The 90-day setting never changed.

### Phase 7: synthetic cleanup and production configuration
1. Delete everything in the dashboard (synthetic data only, before any household data).
   The Report tab then shows no profiles. On the phase 3 browser clients, Send now must be
   answered `revoked`, and the device page clears.
2. Production delta: `ALLOWED_ORIGINS: "<games-origin>"` only (loopback removed); uploads
   on; cron on; 90 days. Run the drift guard, then `probe` with `"phase": "production"`.
   A preflight from the old loopback origin
   (`curl -i -X OPTIONS -H 'Origin: http://127.0.0.1:<port>' -H 'Access-Control-Request-Method: POST' <service-origin>/v1/sync`)
   must get 403.

**Undo:** uploads off (devices keep their queues); cron off separately.

### Phase 8: one paired release (#199 + #200)
- Retarget #207 to the refreshed `main`; it already contains #205's commits. Rebase only
  the current task branch; never write #205's branch. There is one production merge. Mark
  #205 as incorporated after the merge.
- Release-author scope: `shared/learning-reporting/config.js` set to `<service-origin>`;
  both games' version and cache surfaces; `games.js`, `version.json`; release records.
- Gates: both full suites in Chromium and WebKit, with test-scoped muting; the registry
  gate with the exact refreshed base and `REGISTRY_RELEASE_TARGET=football,place-value-practice`;
  a fresh independent review of the exact final head; App-identity merge; the Pages
  deployment for the merge SHA. Live checks: both versions, cache keys and the client
  origin; unaffected games (including Kayak and Prague) unchanged; an unenrolled live page
  makes no service request.
- Any unverified line from D1 has its reviewed disposition before this merge.
- Public label until phase 9: **"client released; intended-device receipt pending."**

**Undo:** server uploads off immediately (play is unaffected). On the client, a revert
release that empties `serviceUrl`, with version and cache bumps.

### Phase 9: intended-device receipt (owner and real devices)
Email the verified owner address the links and the household steps below; never a code or
token. Email delivery is not receipt. The owner creates the real pseudonymous profiles and
codes, connects the iPad (and phone, if it is a play device) on `<games-origin>`, and
answers at least one Football and one Number facts question. **Accept:** one profile
report shows both games from those devices; each device shows a last sync, with 0 removed
and 0 not saved; the owner confirms the report is usable on phone and iPad (AC28). Record
the device model, OS and browser as the owner reports them. Only now is the delivery live.

### Phase 10: close-out
Post sanitized evidence and the D1 change record to #199/#200. Give every O1–O13,
AC01–AC30 and #199 criterion its status (met, unmet, unverified or excepted), with the
reason. Close only if each is met or has an explicit reasoned disposition. Retain historical
failures (#161, #203, #206) as they are.

## 6. Household notes (sent in phase 9)

1. Open the private report and sign in. In Setup, add one nickname per child. Use a
   nickname, not a real name.
2. For each device, create a one-time code and tick the children who use it. Player 1 is
   the first child in the list order, not in the order you tick. On that device, open the
   games' "Learning report" page (`<games-origin>/shared/learning-reporting/`) and enter
   the code within 10 minutes.
3. With several children on one device, the games ask who is playing before practice.
4. Check the Devices page after the first day. "Last sync", "not received" and "not saved"
   show sync health.

What to know: practice before connecting is not included (no backfill). Practice not yet
sent is lost if the browser's site data is cleared. There are no notifications. Export
before deleting anything; deletion cannot be undone. Received-ID receipts keep growing until
a device or everything is deleted. If a long-open report tab stays on "Loading…", reload
it. "Stop reporting" on a device removes its unsent practice; delete that device on the
Devices page too. No cost promise is made.

## 7. Monitoring (no new automation)

| When | Check | If wrong |
|---|---|---|
| First day, then weekly | Devices page: last sync, gaps, counters | Check that device; delete and re-enroll it if it is lost |
| First normal day, then at the first 30-day mark | Owner's usage page: requests, rows, errors | Unexpected use or errors: turn uploads off, then investigate |
| Any time | Report or export fails to load | Try a narrower range; open a scoped fix task; do not grow data |

## 8. Rollback reference

| Problem | Action | Data |
|---|---|---|
| Access or privacy defect | Uploads off immediately; keep private routes protected | Kept |
| Sync, resource or receipt failure | Uploads off; cron off separately if scheduled work must stop | Devices keep their queues |
| Bad deploy | Previous reviewed configuration, or roll back to the previous version | Kept |
| Game regression | Revert release emptying `serviceUrl`, with versions and cache keys | Device queues kept |
| Unwanted data | Export, then delete that profile or device | Gone, by design |

Never restore an old database copy. Never delete household data to recover quota.

## 9. Where each original outcome is shown

| Outcomes | Evidence route |
|---|---|
| O1, AC28 | Phase 9 only |
| O2 | Phase 1 reading plus phase 5 window; daily usage stays unmet if never read |
| O3, O4, AC29 | Deployed separately (operator-reported); README setup, recovery and disable sections; phases 2 and 7 |
| O5, AC01–AC04 | Phases 1, 2 and 7 probes (layer-attributed); phase 3 native CORS; Worker JWT and CSRF in local tests |
| AC05 | Phase 4 reuse and expiry |
| O6, AC17, AC18 | Phase 3 slot mapping; local privacy scans; receipts without labels |
| O7, AC06–AC08 | Phases 3–5 exact acknowledgments, replays and conflicts; mid-batch and timeout cases local |
| O8, AC09–AC12 | Phase 4 Devices page |
| O9, AC13–AC16 | Phases 4–7 export check, deletions, aging and replay |
| O10, AC21–AC27 | Local report tests on the same bytes; phase 3 and phase 9 rendered report |
| O11 | README Decisions |
| O12, O13, AC19, AC20, AC30 | Phase 8 gates and release; #199 criteria in its suites |

## 10. Limits of this runbook

- Every hosted fact above is operator-reported until phases 1–7 record their own evidence.
- The tool's events are synthetic. They prove protocol behavior on the hosted service,
  not a child's practice, a real client, native browser CORS (phase 3 covers that) or the
  Access policy.
- Successful loads at the corpus qualify that corpus and window only, not route CPU margin
  or the configured maximums.
- Native Safari behavior, human comprehension and the retained historical failures are
  not resolved by any phase here.
