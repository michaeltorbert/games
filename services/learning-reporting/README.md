# Learning reporting (#200)

A private Cloudflare Worker and D1 database that receive the #199 learning-event outbox
from enrolled devices and show a grown-up report for Football and Number facts. It is
separate from `services/kayak-reporting`: its own Worker, its own D1 database, no shared
tables and no Google APIs. Only Kayak's deployment and configuration conventions are
reused.

**Qualification checkpoint — 2026-10-23 00:56 UTC.** Hosted service qualification
had completed: real game clients, the synthetic corpus and exports, one actual scheduled
retention run, and synthetic cleanup. Production reporting was enabled for the approved
game origin only, with the temporary qualification origin removed. The deployed daily
cron was `37 21 * * *` UTC with 90-day retention. Deployment and refusal evidence is
retained locally at `output/issue-200/go-live/hosted/production/` (not published here).

At that checkpoint, the paired client release awaited final checks, independent review,
merge and verified Pages deployment; intended household-device receipt and usability
were also pending. Actual release and household status belong in the
[PR #207](https://github.com/michaeltorbert/games/pull/207) and
[issue #200 completion record](https://github.com/michaeltorbert/games/issues/200).
Only after verified client deployment, use the intermediate status
"client released; intended-device receipt pending". Qualification alone is not a
live-household or physical-device claim. Steps, stop rules and recovery are in
[GO-LIVE.md](GO-LIVE.md).

Historical setup readback, retained as dated evidence rather than current status:

- The initial dedicated Worker and D1 deployment from source `1e921b1` had uploads off
  and no cron. The owner dashboard then showed no profiles or devices; its served
  `app.js` was not hashed at that stage.
- Access policy contents (operator dashboard readback, 2026-10-22 02:36 UTC): one
  self-hosted application on the whole Worker host whose only policy allows exactly one
  owner email, with no exclude or require rules; two Bypass applications for exactly
  `/v1/enroll` and `/v1/sync`; no other applications, wildcards or overlap. The edge
  bypass also matches descendants and case variants (`/v1/sync/child`, `/V1/sync`):
  those reach the Worker, which refuses them with 401 because only the two exact
  pathnames are public. They are protected by the Worker, not the edge. Whether
  one-time PIN login is enabled was not visible in that readback.
- The owner read account-wide usage on 2026-10-22 at 19:25 UTC before synthetic
  growth. That reading is now stale and establishes no current quota or capacity.
  Earlier billing 403, GraphQL throttling and account-dashboard access denial remain
  unresolved evidence limits; those methods were not retried to bypass them. Hosted
  HTTP outcomes establish neither CPU margin nor full Free-plan capacity.

The committed `wrangler.jsonc` remains a fail-closed setup template: reporting is
disabled, Access values are empty and the D1 ID is all zeros. Production uses a separate
private operational configuration. The activated shared client configuration
names the approved service origin; recording and uploads still require explicit
device enrollment. Synthetic profiles, devices and events were deleted after
qualification. This does not establish intended-device receipt.

Upkeep: this Worker and D1 database, a Cloudflare Access application and policy, device
enrollment and revocation, schema migrations, and noticing sync failures on the Devices
page. There are no per-answer emails or notifications. No cost or free-tier promise is
made. The plan is Workers Free; today's account-wide usage is read by the owner in their
own dashboard before any synthetic growth (GO-LIVE.md). The committed rate-limit
namespaces (`2001`, `2002`) do not collide with the other Worker configured in this
repository (`services/kayak-reporting`); other Workers on the account are not visible
here.

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
`config.js` is overridden in the browser context. The trial first serves an explicitly
empty configuration and verifies the disabled page, stopped sync engine and absence of
device requests. It then switches that fixture route to the synthetic service for
enrollment and play; the activated production origin is never contacted. The two
web-font stylesheets the source declares (Football's markup link and
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
  devices, a household or human comprehension. It changes no hosted setting or client
  configuration file.
- This local trial alone does not establish the original outcomes O1–O13 and AC01–AC30.
  Their evidence, limitations and reviewed exceptions are recorded separately in the
  release acceptance record; final release checks and intended-device receipt remain
  distinct gates.

### Hosted-check tool test

`scripts/hosted-check.mjs` is the bounded device-API helper used in GO-LIVE.md (probe,
synthetic corpus, protocol cases, code expiry and an offline export check).
`test-runtime/hosted-check.test.mjs` (also run by `test:runtime`) runs the actual tool
against the built Worker and local D1 on a loopback port, plus loopback stub servers. It
checks:
- the tool's refusals: target, drift, budget, phase, output path and typed-ahead input;
- that redirects are not followed and nothing is retried;
- that failures report no body or cause, and that malformed answers yield only
  closed-list labels;
- the probe's layer attribution;
- exact acknowledgments against D1, and a replayed batch stored once;
- the retention continuation after a simulated overnight wait: no request without a
  fresh usage reading and the recorded cron deployment, and with them an aged batch
  answered `deleted` with no gap;
- that nothing it prints or writes holds a code, token, label or payload. It uploads 80 events, not the 3,600-event
corpus (whose allocation it checks without uploading). This tests the tool. It is not
hosted, Access, CPU, quota, household or real-client evidence.

## Setup and go-live

The Access choice is **owner only**. Workers Free and Zero Trust Free are separate
plans; plan selection, payment details and terms are the owner's own actions. Do not
accept those on the owner's behalf, upgrade a plan, reset usage or expand permissions.

Steps 1–4 below are the one-time setup. They are reported done (see Status) and are
kept as the rules for checking drift or redoing setup. The hosted qualification,
retention check, release and intended-device receipt that used to be steps 5–7 are now
[GO-LIVE.md](GO-LIVE.md). That runbook supersedes the earlier text in three reviewed
ways:
- The universal "pause growth at 8 ms" rule is replaced by explicit stop conditions.
  8 ms and 10 ms aggregate readings are recorded as warnings, neither failure nor
  acceptance. CPU that cannot be attributed to a route stays unverified, and its effect
  gets an explicit reviewed disposition before release.
- Hosted retention evidence comes from aging exactly 20 synthetic rows with reviewed
  guarded SQL and observing one real scheduled run. The 90-day setting stays unchanged.
- One paired public client release may precede the intended-device receipt. It is then
  recorded as "client released; intended-device receipt pending", and nothing is
  called live, and no issue is closed, until that receipt exists.

1. **Verify before deploying a Worker.** Confirm the target account, actual owner
   identity, Access team issuer and root application's audience, plus current Workers,
   D1, cron and rate-limit namespace capacity. Check daily usage as well as resource
   counts; `2001`/`2002` must not collide with another deployment. Keep the Worker
   undeployed until these checks and the Access configuration below are complete.
2. **Prepare account-local configuration.** Keep the committed disabled template
   unchanged. During initial setup keep the client URL empty until the reviewed client
   activation in GO-LIVE.md phase 8. Use a private operational configuration selected
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
   is not detected by its marker. Keep the games' service URL empty until GO-LIVE.md
   phase 8; it is not a permanent requirement after client activation.

Constants that still hold for every later phase: the scheduled retention cap is
`15 * 3 + 2 = 47` statements, below the application's 49 budget and the current Free
50-query ceiling; that does not establish CPU or daily row-budget fitness. Do not copy the
local 15,001-row backlog fixture to the hosted database; it already proves local
continuation. Network/D1 wait and wall time are not CPU. Do not enable invocation logs,
`wrangler tail` or per-event telemetry. ID-only receipts keep growing after event
retention until their device or everything is deleted.

Current primary references to recheck before operational writes: [Access application
paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/),
[Workers and Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[D1 row pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Disable switch and recovery

Retain the reviewed private operational configuration and deployment record in private
storage, outside Git. Recovery must not depend on a temporary working directory: rebuild
from the pinned source commit and use the retained configuration after verifying its
binding and target. Never publish that configuration or its private identifiers.

- **Stop uploads:** set `REPORTING_ENABLED` to `"false"` and deploy. Devices get 503 and
  keep their queues; the dashboard, export and deletion still work. This does **not**
  stop retention: remove/disable the cron separately in the operational configuration
  if scheduled work must stop, and verify the resulting trigger configuration.
- **Stop scheduled retention:** deploy with `triggers.crons: []`. This leaves uploads as
  they are; the two switches are independent.
- **Undo a bad deploy:** redeploy the previous reviewed operational configuration, or roll
  the Worker back to its previous version. Record the resulting version ID. Neither
  touches stored data.
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
  It is the synthetic-data cleanup before household enrollment. Once household data
  exists, never use it as routine cleanup: delete the specific profile or device, and
  export first.
- Deletion cannot be undone. Export first. Never restore an old database copy over a
  newer one: that could bring back deleted data.
- A missing marker or schema answers 503; the Worker never initializes itself. A wrong
  but initialized database binding can't be detected by the marker, so verify the D1 ID
  before every deploy.
