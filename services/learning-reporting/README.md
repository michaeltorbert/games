# Learning reporting (#200)

A private Cloudflare Worker and D1 database that receive the #199 learning-event outbox
from enrolled devices and show a grown-up report for Football and Number facts. It is
separate from `services/kayak-reporting`: its own Worker, its own D1 database, no shared
tables and no Google APIs. Only Kayak's deployment and configuration conventions are
reused.

**Status: local candidate only. Not deployed, not configured, nothing enrolled.** The
committed `wrangler.jsonc` is a fail-closed template: reporting is disabled, the Access
values are empty, the D1 ID is all zeros, and the games' service origin
(`shared/learning-reporting/config.js`) is empty, so the games send nothing.

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

## Setup checklist (each step needs explicit authorization)

1. Check the Cloudflare account plan, D1 and Workers quotas, and that rate-limit
   namespace IDs `2001` and `2002` are unused (change them if not).
2. `npx wrangler d1 create learning-reporting`, then put the returned ID in
   `wrangler.jsonc` and apply `npx wrangler d1 migrations apply learning-reporting --remote`.
   The migration creates the random installation marker and confirmation key.
3. Deploy with `REPORTING_ENABLED` still `"false"`.
4. Create a self-hosted Access application for the Worker's host. Protect every path,
   and add a bypass only for exactly `/v1/enroll` and `/v1/sync`. Limit the policy to the
   household's grown-up identities. Set `ACCESS_TEAM_DOMAIN`
   (`https://<team>.cloudflareaccess.com`) and `ACCESS_AUD` (the application's audience
   tag). Verify that an unauthenticated request to `/` and `/api/session` is refused,
   and that a forged `Cf-Access-Jwt-Assertion` header is refused.
5. Set `ALLOWED_ORIGINS` to the exact game origin(s), set `RETENTION_DAYS` and
   `DISPLAY_TIME_ZONE`, and set `REPORTING_ENABLED` to `"true"`. Deploy.
6. Put the Worker origin in `shared/learning-reporting/config.js`, bump both games'
   versions and cache keys together, and release through the games' gates.
7. On the dashboard, add profiles, create a code, and connect one device at
   `/shared/learning-reporting/` on the game site. Verify sync, the report, export,
   revoke, device deletion, profile deletion and that the cron runs.

## Disable switch and recovery

- **Stop uploads:** set `REPORTING_ENABLED` to `"false"` and deploy. Devices get 503 and
  keep their queues; the dashboard, export and deletion still work.
- **Stop the games from trying:** empty `shared/learning-reporting/config.js` and release.
  Queued events stay on each device until it is re-enabled or stopped there.
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
