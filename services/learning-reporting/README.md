# Learning reporting (#200)

A private Cloudflare Worker and D1 database that receive the #199 learning-event outbox
from enrolled devices and show a grown-up report for Football and Number facts. It is
separate from `services/kayak-reporting`: its own Worker, its own D1 database, no shared
tables and no Google APIs. Only Kayak's deployment and configuration conventions are
reused.

**Status: not released and not delivering household data.** A separate operator reports a
hosted Worker built from source `1e921b1` with reporting disabled and no cron, and an
owner login that showed the dashboard tabs with no errors and no profiles or devices.
That is operator-reported and has not been verified independently here. No owner session
is available for a recheck, and the owner-only Access policy contents are unverified (a
listing that shows no Access applications is a scope gap, not proof about the policy). No
device is enrolled. The committed `wrangler.jsonc` stays a fail-closed template:
reporting is disabled, the Access values are empty and the D1 ID is all zeros. The
games' service origin (`shared/learning-reporting/config.js`) is empty, so the games
send nothing.

Upkeep: this Worker and D1 database, a Cloudflare Access application and policy, device
enrollment and revocation, schema migrations, and noticing sync failures on the Devices
page. There are no per-answer emails or notifications. No cost or free-tier promise is
made; check the account plan, Workers/D1 quotas and the rate-limit namespaces before
deploying.

## Routes

| Route | Who | Notes |
|---|---|---|
| `POST`/`OPTIONS /v1/enroll` | Public, allowlisted game origins | One-time code → device token. Rate limited (global key). Body ≤ 1 KiB. |
| `POST`/`OPTIONS /v1/sync` | Device token in `Authorization: Bearer` | Append-only. Rate limited per token hash. Body ≤ 64 KiB, ≤ 20 events. No read access. |
| everything else | Verified Cloudflare Access JWT | Dashboard, `/app.js`, `/app.css`, `/api/*`. Default deny. |

- The Access JWT (`Cf-Access-Jwt-Assertion`) must verify with RS256 against the team's
  published keys. Issuer, audience, expiry, not-before and issued-at are checked; an
  unknown key ID refetches the key set (rotation) at most every 30 seconds.
- Mutations (`POST /api/*`) also need an `Origin` equal to the Worker's own origin, a
  `Sec-Fetch-Site` of `same-origin` when present, a `X-CSRF-Token` header bound by HMAC
  to the Access session, and a JSON body. The Worker sets no cookies of its own.
- Device requests without an allowlisted `Origin` are refused. Device credentials are
  sent only in the `Authorization` header, never in a URL or cookie.
- Logs carry only route, outcome and numeric status. No IP, token, label, identity or
  event content is logged or stored. Workers observability is off in the template;
  turning on invocation logs or using `wrangler tail` can show request metadata such as
  IP and location, so don't use them for routine monitoring.

## Delivery contract

- The upload body is `{schemaVersion: 1, status, events}`. Every event must pass the
  shared #199 validator (`shared/learning-outbox.js`, bundled by Wrangler from
  `src/validator.js`; there is no copy). Invalid events are answered `invalid` and never
  stored. A numeric schema version other than 1 answers 422 `unsupported-schema` and the
  device keeps everything.
- One D1 batch (one transaction) of six fixed statements stores the events with
  set-oriented `json_each` SQL, writes ID-only `refused-deleted` receipts for uploads of
  already deleted profiles (never stored, not counted as received; they only keep that
  slot from showing as a gap),
  records conflicts, records epochs, updates the device status and reads the receipt.
  With the credential lookup that is seven statements per upload, whatever its size. Every write re-checks the installation marker, the
  device credential and the profile assignment inside the transaction.
- Per-event outcomes: `accepted` (stored now or already stored with an identical
  payload), `deleted` (profile deleted, or an exactly matching retired receipt),
  `seq-conflict`, `conflict`, `invalid`, `unassigned`. Only `accepted` and `deleted`
  remove an event on the device. The others stay queued but suppressed, so later events
  are not starved. A `seq-conflict` in the device's current epoch makes it start a new
  epoch, once.
- Conflicts are anomalies with IDs, seq and reason only, capped at 1000 per device.
- Credentials: an active token hash authenticates. A hash in `revoked_credentials`, or a
  well-formed token from an earlier installation (after Delete everything), answers 403
  `revoked`, and the device clears its outbox and enrollment for exactly that
  enrollment. Any other token answers 401 and the device keeps its queue.
- 503 means disabled, misconfigured, missing schema or marker, or a database error; the
  device keeps everything and retries with backoff.

## Decisions (defaults; change only before setup)

| Decision | Default |
|---|---|
| Profiles / devices | 8 profiles, 16 active devices |
| Retention | 90 days by server receipt (`RETENTION_DAYS`), daily cron `17 3 * * *` UTC |
| Access identities | The household's grown-up identities, configured only in the Access policy (not in this repository) |
| Sparse-evidence minimum | 3 independent results per item, or the item reads "Not enough reported evidence yet". Number facts: 3 reported eligible checks (unsupported first-try checks); completions after a retry or a shown answer are still shown and still drive suggestions, but never count toward the minimum. Football: 3 completed questions of the independent (work-it-out) evidence class; reading and no-stakes questions never count |
| Suggestions | At most 6, including at most 2 easy-review items, deterministic (see `src/report.js`) |
| Outbox cap and cadence | 500 events / 262,144 UTF-16 units on the device; upload on load, online, after a resolution and every 60 s while visible; backoff 30 s doubling to 15 min with random jitter |
| Upload batch | 20 events, 64 KiB |
| Export format | JSON, one profile: its retained events, plus shared device status |
| Display time zone | UTC (`DISPLAY_TIME_ZONE`, any IANA zone) |
| Report range | Last 30 days by default; dates use each device's clock |
| Codes | 26 Crockford characters (130 bits), single use, 10 minutes |
| Tokens | `lr1_<installation>_<256 random bits>`, stored as SHA-256 |

The Number facts section describes reported eligible checks, timing (null reads "not
timed") and "another try" from reported results. It does not use the on-device label
"quick and accurate on the latest two checks", because uploaded events do not carry the
device's saved-versus-memory provenance or its exact latest-check view.

Football questions without a result stay separate from completed results and keep the help
they showed:
- help shown before the first try with no answer yet;
- a hint shown on the retry with no answer yet;
- both of those;
- a second miss whose worked explanation is shown but not yet continued;
- a question left unfinished, with the help stages it had reached listed under it;
- a question started with no result reported yet ("pending"), also with any help stages
  its own events show listed under it. For example, help before the first try followed
  by a missed first try, with no retry hint reported, stays pending with that one stage
  shown.

Each stage is read from the help event itself, never inferred from event order or from
missing events. Unfinished questions never count toward completed or sparse-minimum
results, and no wrong answer, mastery or timing is inferred.

Received-ID receipts (`retired_events`) grow until their device or everything is
deleted. They hold only IDs, seq and a reason, but they count against D1 storage.

## Local verification

Node 22 or newer. No real account is read or used.

```sh
npm ci
npm run types
npm run check
npm test
npm run test:runtime   # builds dist/ with a Wrangler dry run, then runs dist/worker.js in local workerd + D1
```

`test:runtime` serves synthetic Access keys through a local outbound handler and denies
all other outbound requests. It is evidence for local workerd and SQLite behavior, not
for edge distribution, real Access, quotas or CPU limits.

### Combined local trial

`test-runtime/combined-trial.test.mjs` (also run by `test:runtime`; needs Playwright
WebKit) drives one synthetic profile through the actual built Worker and local D1: the
owner uses the real dashboard controls to add the profile and two codes, two separate
iPad-sized touch WebKit contexts enroll through the real device page, one answers a
Football question and one a Number facts question by tapping, and the real outboxes
upload. It checks that the browser-submitted, stored and acknowledged event IDs match
exactly, that both outboxes empty, and the rendered report and device health (iPad and
phone screenshots). It then deletes everything through the dashboard confirmation.

```sh
LR_RUNTIME_ROOT=<dir with the pinned miniflare> \
LR_DASHBOARD_BUNDLE=<built worker.js> LR_EXPECTED_BUNDLE_SHA256=<its reviewed hash> \
LR_COMBINED_ARTIFACTS=<output dir> LR_COMBINED_ENGINES=webkit \
node --test test-runtime/combined-trial.test.mjs
```

The game files are served byte for byte at a synthetic HTTPS origin, and only
`config.js` is overridden, in the browser context; the committed client URL stays
empty. The two web-font stylesheets the source declares (Football's markup link and
the `shared/fonts.css` import) are answered locally with an empty stylesheet; any other
font query or remote host is denied, so pages use fallback fonts and font rendering is
not covered. Pinned Playwright's WebKit screenshot preparation briefly inserts a
nonce-less inline style, which the dashboard CSP refuses; at most one exact refusal on
the owner page during each screenshot call is recorded separately as a capture artifact.
Every other console error still fails, and the production CSP is unchanged. The receipt
holds IDs, counts and evidence classes; codes,
tokens and keys stay in memory, and a failure is reported only as a sanitized message.
Limits:
- It is local proof with the actual client and built Worker. The synthetic JWT is
  checked by the Worker; it is not a Cloudflare Access policy and says nothing about
  owner-only access.
- Requests pass through Playwright interception, not a native network path, so it is
  not evidence of a CORS preflight or origin refusal (AC03/AC04 rely on other tests).
- It is not evidence of hosted CPU, quotas, billing or daily row usage, physical
  devices, a household or human comprehension. The hosted deployment stays with
  reporting off and no cron, and the public client URL stays blank; this test changes
  neither. The conservative 8 ms growth pause stays in force: this test neither lifts
  nor crosses it. Hosted and household steps remain held.
- The original outcomes O1–O13 and AC01–AC30 remain pending, and no exception is
  accepted for release.

## Setup and hosted qualification

The initial Access choice is **owner only**. Workers Free and Zero Trust Free are
separate plans: first-time Zero Trust plan selection, payment details and terms must
be completed directly by the owner in the verified account. Do not accept those on
the owner's behalf, upgrade a plan or expand permissions. Existing task authorization
covers the agreed setup and verification once its prerequisites are met.

1. **Verify before deploying a Worker.** Confirm the target account, actual owner
   identity, Access team issuer and root application's audience, plus current Workers,
   D1, cron and rate-limit namespace capacity. Check daily usage as well as resource
   counts; `2001`/`2002` must not collide with another deployment. Keep the Worker
   undeployed until these checks and the Access configuration below are complete.
2. **Prepare account-local configuration.** Keep the committed disabled template and
   empty client URL unchanged. Use a private operational configuration selected
   explicitly with Wrangler's `--config`; resolve its source and migration paths and
   inspect the deployment target before use. Supply the real D1 binding,
   `ACCESS_TEAM_DOMAIN` (`https://<team>.cloudflareaccess.com`), root `ACCESS_AUD`,
   exact `ALLOWED_ORIGINS`, retention and time zone there. Keep credentials, owner
   identity and private account/resource identifiers out of the public repository and
   review packets. Retain `preview_urls: false`, observability off and
   `REPORTING_ENABLED: "false"`. Explicitly set `triggers.crons` to `[]` for the first
   deployment: the template contains a cron, and `scheduled()` runs retention
   independently of `REPORTING_ENABLED`.
3. **Configure Access before exposure.** Create a self-hosted root application for
   the intended Worker host, protecting all paths with an Allow policy for only the
   verified owner. Create two separate, more-specific public path applications for
   `/v1/enroll` and `/v1/sync`, with policies that permit the device POSTs and required
   OPTIONS requests. Do not put a bypass on the root policy or expose `/v1/*`.
   Verify Cloudflare's current application/path matching and policy schema before
   making writes: more-specific applications take precedence without inheriting the
   root policy and may match descendants. The Worker accepts only the two exact
   pathnames as public; its JWT verification protects every other path. Check trailing
   slashes, child and nearby paths as well as `/`, assets and `/api/*`. Do not publish
   a protected route or weaken Access to isolate a JWT test.
4. **Provision the dedicated service.** After verifying target, absence and budget,
   create only the task's separate D1 database and apply its migration using the
   selected operational configuration. The migration creates the installation marker
   and confirmation key. Verify the exact binding before deploying the reviewed
   Worker with reporting disabled and cron absent. An initialized but wrong database
   is not detected by its marker. Keep the games' service URL empty.
5. **Qualify with synthetic data before household enrollment.** Verify actual owner
   access and anonymous/forged-header/device-token refusal on private routes; verify
   allowlisted and rejected browser origins, OPTIONS, invalid/revoked tokens, and
   Origin/CSRF refusal for mutations. Attribute each result to the layer that answered:
   an Access rejection is edge protection, not isolated proof of Worker JWT rejection.
   Retain the local JWT tests as the separate Worker check. Enable reporting only for
   controlled qualification, then use ordinary enrollment, sync and protected admin
   paths with synthetic profiles and two clients. Check one-use/expired codes, listed
   profile-slot assignment, exact committed receipts, repeated batches, post-commit
   timeout/replay, invalid/conflicting events, gaps/fresh epochs and sync counters.
   Verify profile-scoped export, shared-profile survival, revoke/device/all deletion,
   and rejection of queued deleted data. Preserve local failure/transaction evidence
   where a hosted fault cannot safely be induced; do not add a fault route or bypass.
6. **Qualify retention and Free-plan fitness.** Budget synthetic growth before upload,
   including D1 indexed row writes, reads, receipts, deletion and storage. Do not copy
   the local 15,001-row backlog fixture onto Free blindly; it already proves local
   continuation. After initial security/resource checks, deliberately enable the cron
   in the operational configuration to obtain actual scheduled-run evidence with a
   small eligible synthetic retention case. Verify expired removal, live-event
   preservation, exact retired receipts/replay and no false gap. The current cap is
   `15 * 3 + 2 = 47` statements, below the application's 49 budget and the current
   Free 50-query ceiling; that does not establish CPU or daily row-budget fitness.
   Measure actual hosted report, export, device-health, sync and cron CPU at meaningful
   growth using supported privacy-safe aggregate dashboard metrics. Record units,
   period, invocation outcomes and reservoir-sampling/quantile limits; neither a
   sampled percentile nor the 50,000-row report cap guarantees capacity. Network/D1
   wait and wall time are not CPU. Do not enable invocation logs, tail, per-event
   telemetry or substitute custom wall-time metrics. Do not retry the denied billing
   or GraphQL-budget methods. If meaningful CPU evidence is unavailable, record it as
   unverified; do not waive the requirement or promise zero cost. ID-only receipts
   continue growing until device/all deletion even after event retention.
7. **Prove the useful remote outcome, then release together.** Clean synthetic data
   through protected deletion. Obtain actual intended-device enrollment and remote
   receipt of Football and Number facts in the combined private report; synthetic
   two-client proof alone does not establish that household outcome, native behavior
   or human comprehension. Use a reviewed controlled client candidate if needed while
   the committed client URL remains empty. Only after useful hosted evidence and all
   original outcomes are met or explicitly dispositioned, set the client origin and
   coordinate both games' versions/cache keys, registry preservation, required gates,
   fresh exact-head review, merge and merge-SHA Pages/live verification for #199/#200.
   Preserve gameplay/RNG/local schedulers, privacy and separate evidence classes;
   retain historical failures. Reuse unchanged game evidence; new game bytes require
   their relevant gates. Do not present dormant infrastructure as the first useful
   report delivery.

Current primary references to recheck before operational writes: [Access application
paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/),
[Workers and Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[D1 row pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Disable switch and recovery

- **Stop uploads:** set `REPORTING_ENABLED` to `"false"` and deploy. Devices get 503 and
  keep their queues; the dashboard, export and deletion still work. This does **not**
  stop retention: remove/disable the cron separately in the operational configuration
  if scheduled work must stop, and verify the resulting trigger configuration.
- **Stop the games from trying:** empty `shared/learning-reporting/config.js` through a
  coordinated game release with the required versions/cache keys and release checks.
  Queued events stay on each device until it is re-enabled or stopped there.
- **A device whose final setting was not saved** (the browser refused the last step of
  connecting): the device page then says the device is partly connected, and nothing is
  recorded yet. "Finish connecting" retries that last step for the same enrollment. "Stop
  reporting" removes it without using another code. The page accepts only this device's own
  matching records; any other reporting data is reported as unrecognized and left unchanged.
- **A lost or replaced device:** delete it on the Devices page (its token is then
  revoked), then connect the new device with a new code.
- **One device stopped locally** (the device page's "Stop reporting"): its unsent events
  are gone, and the service still lists it; delete or revoke it on the Devices page.
- **Delete everything** erases every user row and rotates the installation marker. Old
  device tokens are then answered `revoked`, and every device must be connected again.
- Deletion cannot be undone. Export first. Never restore an old database copy over a
  newer one: that could bring back deleted data.
- A missing marker or schema answers 503; the Worker never initializes itself. A wrong
  but initialized database binding can't be detected by the marker, so verify the D1 ID
  before every deploy.
